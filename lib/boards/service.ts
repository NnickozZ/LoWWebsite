import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { viewableCondition } from '@/lib/access';
import type { Author } from '@/lib/auth/author';
import { db, schema } from '@/lib/db';
import type { AccessMode } from '@/lib/db/schema';
import { newId } from '@/lib/ids';
import { sideCondition } from '@/lib/keeper/side';
import { recomputeBoardMentions } from '@/lib/entries/mentions';
import { logActivity } from '@/lib/entries/service';
import { visibleEntryCondition, type Viewer } from '@/lib/entries/visibility';
import { visibleCaseCondition } from '@/lib/cases/visibility';
import { visibleMapCondition } from '@/lib/maps/visibility';
import { listTimelines } from '@/lib/timelines/service';
import { mergeBoardState, normaliseState, type BoardPatch, type BoardState } from './merge';

export type BoardSummary = {
  id: string;
  name: string;
  caseId: string | null;
  caseName: string | null;
  caseSlug: string | null;
  /** §17 */
  viewMode: AccessMode;
  editMode: AccessMode;
  accessLocked: boolean;
  /** §43, round 18: false keeps the wall out of the web and out of "Genoemd in". */
  inWeb: boolean;
  createdBy: string | null;
  updatedAt: number;
  createdAt: number;
  /** How much is on the wall — only the index page asks. */
  cardCount?: number;
  stringCount?: number;
};

const BOARD_COLUMNS = {
  id: schema.boards.id,
  name: schema.boards.name,
  caseId: schema.boards.caseId,
  caseName: schema.cases.name,
  caseSlug: schema.cases.slug,
  viewMode: schema.boards.viewMode,
  editMode: schema.boards.editMode,
  accessLocked: schema.boards.accessLocked,
  inWeb: schema.boards.inWeb,
  createdBy: schema.boards.createdBy,
  updatedAt: schema.boards.updatedAt,
  createdAt: schema.boards.createdAt,
} as const;

export type BoardListOptions = {
  sort?: 'recent' | 'name' | 'created' | 'size';
  /** 'loose' = no case; 'case' = belongs to one; a case id = that one. */
  where?: 'loose' | 'case' | string;
  mine?: string;
  privateOnly?: boolean;
  /**
   * §46: read both sides of the archive, not the one the viewer stands on.
   * For pickers and record pages only — see `sideCondition`.
   */
  bothSides?: boolean;
};

/**
 * §17: a board is visible when its own view dial allows the viewer AND, if it
 * hangs off a case, that case is visible. There is no other way to load one:
 * `getBoard` and `listBoards` are the only readers, and both apply both rules.
 */
export function listBoards(viewer: Viewer, options: BoardListOptions = {}): BoardSummary[] {
  const conditions = [isNull(schema.boards.deletedAt), viewableCondition('board', viewer)];
  // §46: one side at a time, AND-ed after the visibility rule.
  if (!options.bothSides) conditions.push(sideCondition('board', viewer));
  if (options.where === 'loose') conditions.push(isNull(schema.boards.caseId));
  else if (options.where === 'case') conditions.push(sql`${schema.boards.caseId} IS NOT NULL`);
  else if (options.where) conditions.push(eq(schema.boards.caseId, options.where));
  if (options.mine) conditions.push(eq(schema.boards.createdBy, options.mine));
  if (options.privateOnly) conditions.push(sql`${schema.boards.viewMode} <> 'all'`);

  const order =
    options.sort === 'name'
      ? sql`${schema.boards.name} COLLATE NOCASE ASC`
      : options.sort === 'created'
        ? desc(schema.boards.createdAt)
        : options.sort === 'size'
          ? sql`coalesce(json_array_length(json_extract(${schema.boards.state}, '$.cards')), 0) DESC`
          : desc(schema.boards.updatedAt);

  const rows = db
    .select({
      ...BOARD_COLUMNS,
      cardCount: sql<number>`coalesce(json_array_length(json_extract(${schema.boards.state}, '$.cards')), 0)`,
      stringCount: sql<number>`coalesce(json_array_length(json_extract(${schema.boards.state}, '$.strings')), 0)`,
    })
    .from(schema.boards)
    .leftJoin(schema.cases, eq(schema.cases.id, schema.boards.caseId))
    .where(and(...conditions))
    .orderBy(order)
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
      ...row,
      cardCount: Number(row.cardCount ?? 0),
      stringCount: Number(row.stringCount ?? 0),
    }));
}

/** The boards inside a case that this viewer may open. */
export function listBoardsForCase(caseId: string, viewer: Viewer): BoardSummary[] {
  return db
    .select(BOARD_COLUMNS)
    .from(schema.boards)
    .leftJoin(schema.cases, eq(schema.cases.id, schema.boards.caseId))
    .where(
      and(
        eq(schema.boards.caseId, caseId),
        isNull(schema.boards.deletedAt),
        viewableCondition('board', viewer),
      ),
    )
    .orderBy(desc(schema.boards.updatedAt))
    .all();
}

export function getBoard(boardId: string, viewer: Viewer) {
  const row = db
    .select({
      id: schema.boards.id,
      name: schema.boards.name,
      caseId: schema.boards.caseId,
      state: schema.boards.state,
      viewMode: schema.boards.viewMode,
      editMode: schema.boards.editMode,
      accessLocked: schema.boards.accessLocked,
      inWeb: schema.boards.inWeb,
      createdBy: schema.boards.createdBy,
      updatedAt: schema.boards.updatedAt,
      deletedAt: schema.boards.deletedAt,
    })
    .from(schema.boards)
    .where(and(eq(schema.boards.id, boardId), viewableCondition('board', viewer)))
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
  /** §18b: the onderzoeker it is being hung as. */
  characterId?: string | null;
  /** §17: "Privé prikbord" sets both dials to private in one go. */
  isPrivate?: boolean;
}): BoardSummary {
  const id = newId();
  db.insert(schema.boards)
    .values({
      id,
      name: input.name.trim() || 'Naamloos prikbord',
      caseId: input.caseId ?? null,
      state: { cards: [], strings: [], viewport: { x: 0, y: 0, zoom: 1 } },
      viewMode: input.isPrivate ? 'private' : 'all',
      editMode: input.isPrivate ? 'private' : 'all',
      createdBy: input.createdBy,
    })
    .run();
  logActivity({
    actorId: input.createdBy,
    characterId: input.characterId ?? null,
    verb: 'board.created',
    boardId: id,
    caseId: input.caseId ?? null,
  });
  return db
    .select(BOARD_COLUMNS)
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
  user: { id: string; characterId?: string | null },
): BoardState {
  const row = db.select().from(schema.boards).where(eq(schema.boards.id, boardId)).get();
  if (!row || row.deletedAt) throw new Error('Prikbord niet gevonden');

  const merged = mergeBoardState(row.state, patch);
  const nowSeconds = Math.floor(Date.now() / 1000);

  db.update(schema.boards)
    .set({ state: merged, updatedAt: nowSeconds })
    .where(eq(schema.boards.id, boardId))
    .run();

  // §27: the artikelen this wall now names — the entry cards outright, and the
  // notitie cards that write one down. The merged document, never the patch:
  // the patch is one client's half of the wall.
  recomputeBoardMentions(boardId, merged);

  const characterId = user.characterId ?? null;
  const latest = db
    .select({
      createdAt: schema.boardRevisions.createdAt,
      editedBy: schema.boardRevisions.editedBy,
      characterId: schema.boardRevisions.characterId,
    })
    .from(schema.boardRevisions)
    .where(eq(schema.boardRevisions.boardId, boardId))
    .orderBy(desc(schema.boardRevisions.createdAt))
    .limit(1)
    .get();

  // §18b: the minute's rest only holds for one writer. A second hand on the
  // wall — another account, or another onderzoeker of the same one — starts a
  // revision of its own, or its work would go into the archive under a name
  // that is not theirs.
  const sameHand =
    latest && latest.editedBy === user.id && (latest.characterId ?? null) === characterId;
  if (!latest || !sameHand || nowSeconds - latest.createdAt >= REVISION_EVERY_SECONDS) {
    db.insert(schema.boardRevisions)
      .values({ id: newId(), boardId, snapshot: merged, editedBy: user.id, characterId })
      .run();
    logActivity({
      actorId: user.id,
      characterId,
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

/**
 * §47: hang this wall in a dossier, or take it out of one.
 *
 * A prikbord has carried a `case_id` since §24, but only ever from the moment
 * it was made: a wall hung loose stayed loose for ever, and a wall filed in the
 * wrong dossier had to be rebuilt. This is the one write that moves it.
 *
 * Two things ride along, and both are why this is a function and not an
 * `UPDATE`. §17: a wall inside a dossier is *also* behind that dossier's view
 * dial, so moving it changes who may open it — the caller checks that the
 * viewer may see the dossier they are filing it in. And §43: the web draws an
 * `inCase` line from the dossier to the wall, so both dossiers are touched so
 * their "laatst gewijzigd" is honest.
 */
export function setBoardCase(boardId: string, caseId: string | null, by: Author) {
  const row = db
    .select({ caseId: schema.boards.caseId })
    .from(schema.boards)
    .where(eq(schema.boards.id, boardId))
    .get();
  const was = row?.caseId ?? null;
  if (was === caseId) return;
  const now = Math.floor(Date.now() / 1000);
  db.update(schema.boards).set({ caseId, updatedAt: now }).where(eq(schema.boards.id, boardId)).run();
  for (const id of [was, caseId]) {
    if (id) db.update(schema.cases).set({ updatedAt: now }).where(eq(schema.cases.id, id)).run();
  }
  logActivity({
    actorId: by.id,
    characterId: by.characterId ?? null,
    verb: caseId ? 'board.filed' : 'board.unfiled',
    boardId,
    caseId: caseId ?? was,
  });
}

/** §43, round 18: whether this wall counts in the web and under "Genoemd in". */
export function setBoardInWeb(boardId: string, inWeb: boolean) {
  db.update(schema.boards)
    .set({ inWeb, updatedAt: Math.floor(Date.now() / 1000) })
    .where(eq(schema.boards.id, boardId))
    .run();
}

export function softDeleteBoard(boardId: string, by: string | Author) {
  const userId = typeof by === 'string' ? by : by.id;
  db.update(schema.boards)
    .set({ deletedAt: Math.floor(Date.now() / 1000) })
    .where(eq(schema.boards.id, boardId))
    .run();
  logActivity({
    actorId: userId,
    characterId: typeof by === 'string' ? null : (by.characterId ?? null),
    verb: 'board.deleted',
    boardId,
  });
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

/**
 * Everything a board's cards point at, as one parcel. The GET and the POST both
 * answer with it, and the canvas keeps the three maps side by side, so a card
 * of any kind knows what it stands for without three separate round trips.
 */
export type BoardRefs = {
  entries: Record<string, BoardEntryFacts>;
  maps: Record<string, BoardMapFacts>;
  cases: Record<string, BoardCaseFacts>;
  timelines: Record<string, BoardTimelineFacts>;
};

/**
 * What a landkaart card shows. Same shape and the same rule as an entry card:
 * only an id is on the wall, and what it stands for is looked up here.
 *
 * §40: a landkaart has its own view dial now, so this really does depend on the
 * viewer — a wall that printed the name of a plattegrond the Keeper is keeping
 * back would give the house away in one word. A map that is hidden from this
 * viewer, or has been taken down, comes back MISSING, exactly like a deleted or
 * Keeper-only artikel. (Before the dial existed the `viewer` here was `_viewer`
 * and did nothing, because there was nothing for it to do.)
 */
export type BoardMapFacts = {
  id: string;
  slug: string;
  name: string;
  assetId: string | null;
  missing: boolean;
};

export function resolveBoardMaps(mapIds: string[], viewer: Viewer): Map<string, BoardMapFacts> {
  const out = new Map<string, BoardMapFacts>();
  const ids = [...new Set(mapIds.filter(Boolean))];
  if (!ids.length) return out;

  const rows = db
    .select({
      id: schema.maps.id,
      slug: schema.maps.slug,
      name: schema.maps.name,
      assetId: schema.maps.assetId,
    })
    .from(schema.maps)
    .where(and(inArray(schema.maps.id, ids), visibleMapCondition(viewer)))
    .all();

  for (const row of rows) out.set(row.id, { ...row, missing: false });
  return out;
}

/**
 * What a dossier card shows. This one really does depend on the viewer: a
 * dossier's view dial is a dial people turn, and a wall that printed the name
 * of a dossier somebody may not open would give it away in one word. So the
 * card comes back MISSING instead — the same blank the archive shows for a
 * Keeper-only artikel, and for the same reason.
 */
export type BoardCaseFacts = {
  id: string;
  slug: string;
  name: string;
  status: string;
  assetId: string | null;
  crop: unknown;
  missing: boolean;
};

export function resolveBoardCases(caseIds: string[], viewer: Viewer): Map<string, BoardCaseFacts> {
  const out = new Map<string, BoardCaseFacts>();
  const ids = [...new Set(caseIds.filter(Boolean))];
  if (!ids.length) return out;

  const rows = db
    .select({
      id: schema.cases.id,
      slug: schema.cases.slug,
      name: schema.cases.name,
      status: schema.cases.status,
      assetId: schema.cases.coverAssetId,
      crop: schema.cases.coverCrop,
    })
    .from(schema.cases)
    .where(and(inArray(schema.cases.id, ids), visibleCaseCondition(viewer)))
    .all();

  for (const row of rows) out.set(row.id, { ...row, missing: false });
  return out;
}

/**
 * §32: what a tijdlijn card shows. The same rule as a dossier card, because a
 * tijdlijn has the same two dials (and a dossier of its own to hide behind):
 * one this viewer may not open comes back MISSING, not named.
 */
export type BoardTimelineFacts = {
  id: string;
  slug: string;
  name: string;
  scale: string;
  missing: boolean;
};

export function resolveBoardTimelines(timelineIds: string[], viewer: Viewer): Map<string, BoardTimelineFacts> {
  const out = new Map<string, BoardTimelineFacts>();
  const ids = [...new Set(timelineIds.filter(Boolean))];
  if (!ids.length) return out;
  for (const timeline of listTimelines(viewer)) {
    if (ids.includes(timeline.id)) {
      out.set(timeline.id, { id: timeline.id, slug: timeline.slug, name: timeline.name, scale: timeline.scale, missing: false });
    }
  }
  return out;
}
