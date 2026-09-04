import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { db, schema } from '@/lib/db';
import { newId } from '@/lib/ids';
import { logActivity } from '@/lib/entries/service';
import { visibleEntryCondition, type Viewer } from '@/lib/entries/visibility';
import { visibleCaseCondition } from '@/lib/cases/visibility';
import { mergeBoardState, normaliseState, type BoardPatch, type BoardState } from './merge';

export type BoardSummary = {
  id: string;
  name: string;
  caseId: string | null;
  caseName: string | null;
  caseSlug: string | null;
  updatedAt: number;
  createdAt: number;
  /** How much is on the wall — only the index page asks. */
  cardCount?: number;
  stringCount?: number;
};

/**
 * A board is visible when it is standalone (open to every signed-in player) or
 * when its case is visible. There is no other way to load one: `getBoard` and
 * `listBoards` are the only readers, and both apply the case rule.
 */
export function listBoards(viewer: Viewer): BoardSummary[] {
  const rows = db
    .select({
      id: schema.boards.id,
      name: schema.boards.name,
      caseId: schema.boards.caseId,
      caseName: schema.cases.name,
      caseSlug: schema.cases.slug,
      caseVisibility: schema.cases.visibility,
      caseDeletedAt: schema.cases.deletedAt,
      updatedAt: schema.boards.updatedAt,
      createdAt: schema.boards.createdAt,
      cardCount: sql<number>`coalesce(json_array_length(json_extract(${schema.boards.state}, '$.cards')), 0)`,
      stringCount: sql<number>`coalesce(json_array_length(json_extract(${schema.boards.state}, '$.strings')), 0)`,
    })
    .from(schema.boards)
    .leftJoin(schema.cases, eq(schema.cases.id, schema.boards.caseId))
    .where(isNull(schema.boards.deletedAt))
    .orderBy(desc(schema.boards.updatedAt))
    .limit(200)
    .all();

  const visibleCaseIds = new Set(
    db
      .select({ id: schema.cases.id })
      .from(schema.cases)
      .where(visibleCaseCondition(viewer))
      .all()
      .map((r) => r.id),
  );

  return rows
    .filter((row) => !row.caseId || visibleCaseIds.has(row.caseId))
    .map((row) => ({
      id: row.id,
      name: row.name,
      caseId: row.caseId,
      caseName: row.caseName,
      caseSlug: row.caseSlug,
      updatedAt: row.updatedAt,
      createdAt: row.createdAt,
      cardCount: Number(row.cardCount ?? 0),
      stringCount: Number(row.stringCount ?? 0),
    }));
}

export function listBoardsForCase(caseId: string): BoardSummary[] {
  return db
    .select({
      id: schema.boards.id,
      name: schema.boards.name,
      caseId: schema.boards.caseId,
      caseName: schema.cases.name,
      caseSlug: schema.cases.slug,
      updatedAt: schema.boards.updatedAt,
      createdAt: schema.boards.createdAt,
    })
    .from(schema.boards)
    .leftJoin(schema.cases, eq(schema.cases.id, schema.boards.caseId))
    .where(and(eq(schema.boards.caseId, caseId), isNull(schema.boards.deletedAt)))
    .orderBy(desc(schema.boards.updatedAt))
    .all() as BoardSummary[];
}

export function getBoard(boardId: string, viewer: Viewer) {
  const row = db
    .select({
      id: schema.boards.id,
      name: schema.boards.name,
      caseId: schema.boards.caseId,
      state: schema.boards.state,
      updatedAt: schema.boards.updatedAt,
      deletedAt: schema.boards.deletedAt,
    })
    .from(schema.boards)
    .where(eq(schema.boards.id, boardId))
    .get();

  if (!row || row.deletedAt) return undefined;

  if (row.caseId) {
    const parent = db
      .select({ id: schema.cases.id, name: schema.cases.name, slug: schema.cases.slug })
      .from(schema.cases)
      .where(and(eq(schema.cases.id, row.caseId), visibleCaseCondition(viewer)))
      .get();
    if (!parent) return undefined;
    return { ...row, state: normaliseState(row.state), caseName: parent.name, caseSlug: parent.slug };
  }

  return { ...row, state: normaliseState(row.state), caseName: null, caseSlug: null };
}

export function createBoard(input: {
  name: string;
  caseId?: string | null;
  createdBy: string | null;
}): BoardSummary {
  const id = newId();
  db.insert(schema.boards)
    .values({
      id,
      name: input.name.trim() || 'Naamloos prikbord',
      caseId: input.caseId ?? null,
      state: { cards: [], strings: [], viewport: { x: 0, y: 0, zoom: 1 } },
      createdBy: input.createdBy,
    })
    .run();
  logActivity({
    actorId: input.createdBy,
    verb: 'board.created',
    boardId: id,
    caseId: input.caseId ?? null,
  });
  return db
    .select({
      id: schema.boards.id,
      name: schema.boards.name,
      caseId: schema.boards.caseId,
      caseName: schema.cases.name,
      caseSlug: schema.cases.slug,
      updatedAt: schema.boards.updatedAt,
      createdAt: schema.boards.createdAt,
    })
    .from(schema.boards)
    .leftJoin(schema.cases, eq(schema.cases.id, schema.boards.caseId))
    .where(eq(schema.boards.id, id))
    .get() as BoardSummary;
}

const REVISION_EVERY_SECONDS = 60;

/**
 * §8: merge server-side and hand the merged document back so the client can
 * reconcile. A revision snapshot is written at most once per minute of activity.
 */
export function saveBoard(
  boardId: string,
  patch: BoardPatch,
  user: { id: string },
): BoardState {
  const row = db.select().from(schema.boards).where(eq(schema.boards.id, boardId)).get();
  if (!row || row.deletedAt) throw new Error('Prikbord niet gevonden');

  const merged = mergeBoardState(row.state, patch);
  const nowSeconds = Math.floor(Date.now() / 1000);

  db.update(schema.boards)
    .set({ state: merged, updatedAt: nowSeconds })
    .where(eq(schema.boards.id, boardId))
    .run();

  const latest = db
    .select({ createdAt: schema.boardRevisions.createdAt })
    .from(schema.boardRevisions)
    .where(eq(schema.boardRevisions.boardId, boardId))
    .orderBy(desc(schema.boardRevisions.createdAt))
    .limit(1)
    .get();

  if (!latest || nowSeconds - latest.createdAt >= REVISION_EVERY_SECONDS) {
    db.insert(schema.boardRevisions)
      .values({ id: newId(), boardId, snapshot: merged, editedBy: user.id })
      .run();
    logActivity({
      actorId: user.id,
      verb: 'board.changed',
      boardId,
      caseId: row.caseId ?? null,
    });
    if (row.caseId) {
      db.update(schema.cases)
        .set({ updatedAt: nowSeconds })
        .where(eq(schema.cases.id, row.caseId))
        .run();
    }
  }

  return merged;
}

export function renameBoard(boardId: string, name: string) {
  db.update(schema.boards)
    .set({ name: name.trim() || 'Naamloos prikbord', updatedAt: Math.floor(Date.now() / 1000) })
    .where(eq(schema.boards.id, boardId))
    .run();
}

export function softDeleteBoard(boardId: string, userId: string) {
  db.update(schema.boards)
    .set({ deletedAt: Math.floor(Date.now() / 1000) })
    .where(eq(schema.boards.id, boardId))
    .run();
  logActivity({ actorId: userId, verb: 'board.deleted', boardId });
}

export type BoardEntryFacts = {
  id: string;
  slug: string;
  name: string;
  coverAssetId: string | null;
  coverCrop: unknown;
  typeIcon: string;
  typeColour: string;
  typeBorder: string;
  /** True when the entry was deleted or hidden — the card gets a MISSING stamp. */
  missing: boolean;
};

/**
 * Resolves the entries a board's cards point at, honouring entry visibility.
 * An entry the viewer may not see comes back as `missing`, exactly like a
 * deleted one — the card shows a stamp and nothing else leaks.
 */
export function resolveBoardEntries(
  entryIds: string[],
  viewer: Viewer,
): Map<string, BoardEntryFacts> {
  const out = new Map<string, BoardEntryFacts>();
  const ids = [...new Set(entryIds.filter(Boolean))];
  if (!ids.length) return out;

  const rows = db
    .select({
      id: schema.entries.id,
      slug: schema.entries.slug,
      name: schema.entries.name,
      coverAssetId: schema.entries.coverAssetId,
      coverCrop: schema.entries.coverCrop,
      typeIcon: schema.entryTypes.icon,
      typeColour: schema.entryTypes.colour,
      typeBorder: schema.entryTypes.border,
    })
    .from(schema.entries)
    .innerJoin(schema.entryTypes, eq(schema.entryTypes.id, schema.entries.typeId))
    .where(and(inArray(schema.entries.id, ids), visibleEntryCondition(viewer)))
    .all();

  for (const row of rows) out.set(row.id, { ...row, missing: false });
  return out;
}
