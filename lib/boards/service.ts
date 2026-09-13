import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { viewableCondition } from '@/lib/access';
import type { Author } from '@/lib/auth/author';
import { db, schema } from '@/lib/db';
import type { AccessMode } from '@/lib/db/schema';
import { newId } from '@/lib/ids';
import { recomputeBoardMentions } from '@/lib/entries/mentions';
import { logActivity } from '@/lib/entries/service';
import { isKeeperSide, setKeeperSide, sideCondition } from '@/lib/keeper/side';
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
 * §61: and never twice within this, whoever's hand it is. The minute above is
 * per hand and is read off the *newest* revision in the table, so two people
 * working at once wrote a full snapshot of the whole wall on every single
 * 300 ms autosave — each save saw a revision by the other hand and started one
 * of its own. Ten seconds is still a fine-grained history and about a fortieth
 * of the writing.
 */
const REVISION_MIN_SECONDS = 10;
/**
 * §61: how often the artikelen a wall names are counted again.
 *
 * `recomputeBoardMentions` walks every entry name in the archive
 * (`entryNameIndex()`) and rewrites this wall's rows. That is a sensible thing
 * to do when somebody finishes typing a notitie and a preposterous one to do
 * three times a second while a card is dragged across the cork. It runs at once
 * on the first save — nothing waits for its "Genoemd in" — and at most once per
 * board per this long after that, always with the newest document.
 */
const MENTIONS_EVERY_MS = 3_000;

/**
 * The two pieces of work above, held back. Module state, per board, and flushed
 * before the process goes — registered by hand on the shared shutdown list the
 * way `lib/live/docs.ts` registers `persistAll`, so nothing half-written is
 * left behind by a deploy.
 */
type PendingMentions = { timer: ReturnType<typeof setTimeout>; state: BoardState };
type PendingRevision = {
  timer: ReturnType<typeof setTimeout>;
  state: BoardState;
  userId: string;
  characterId: string | null;
  caseId: string | null;
};
const globalForBoardWrites = globalThis as unknown as {
  __zcfBoardWrites?: {
    mentions: Map<string, PendingMentions>;
    mentionsAt: Map<string, number>;
    revisions: Map<string, PendingRevision>;
    revisionsAt: Map<string, number>;
    installed: boolean;
  };
  __zcfShutdownHooks?: (() => void)[];
};
const writes = (globalForBoardWrites.__zcfBoardWrites ??= {
  mentions: new Map(),
  mentionsAt: new Map(),
  revisions: new Map(),
  revisionsAt: new Map(),
  installed: false,
});
if (!writes.installed) {
  writes.installed = true;
  (globalForBoardWrites.__zcfShutdownHooks ??= []).push(() => flushBoardWrites());
}

/**
 * §61: the two clocks above are the only things here that nothing ever took out
 * again.
 *
 * `mentionsAt` is one entry per prikbord and `revisionsAt` one per prikbord ×
 * account × onderzoeker, and both are written on every save and read once. A
 * long-lived process therefore grew one entry per wall anybody had ever touched
 * and kept them for the life of the server. Ten minutes is far past both windows
 * (three seconds and ten), so an entry older than that decides nothing: dropping
 * it is exactly the same as keeping it, minus the memory.
 */
const WRITE_CLOCK_TTL_MS = 10 * 60_000;

/** Test seam: how many entries the two clocks are holding. Never called by the app. */
export function writeClockCount(): { mentions: number; revisions: number } {
  return { mentions: writes.mentionsAt.size, revisions: writes.revisionsAt.size };
}

export function pruneWriteClocks(now = Date.now()) {
  for (const [key, at] of [...writes.mentionsAt]) {
    if (now - at >= WRITE_CLOCK_TTL_MS) writes.mentionsAt.delete(key);
  }
  // This one is in whole seconds — `writeRevision` compares it with `nowSeconds`.
  const cutoff = Math.floor((now - WRITE_CLOCK_TTL_MS) / 1000);
  for (const [key, at] of [...writes.revisionsAt]) {
    if (at <= cutoff) writes.revisionsAt.delete(key);
  }
}

function runMentions(boardId: string, state: BoardState) {
  writes.mentionsAt.set(boardId, Date.now());
  recomputeBoardMentions(boardId, state);
}

/** §61: at once the first time, and at most once per `MENTIONS_EVERY_MS` after. */
function noteMentions(boardId: string, state: BoardState) {
  const pending = writes.mentions.get(boardId);
  if (pending) {
    // Something is already queued; it will run with the newest document.
    pending.state = state;
    return;
  }
  const waited = Date.now() - (writes.mentionsAt.get(boardId) ?? 0);
  if (waited >= MENTIONS_EVERY_MS) {
    runMentions(boardId, state);
    return;
  }
  const entry: PendingMentions = {
    state,
    timer: setTimeout(() => {
      const queued = writes.mentions.get(boardId);
      writes.mentions.delete(boardId);
      if (queued) runMentions(boardId, queued.state);
    }, MENTIONS_EVERY_MS - waited),
  };
  writes.mentions.set(boardId, entry);
}

function writeRevision(
  boardId: string,
  snapshot: BoardState,
  userId: string,
  characterId: string | null,
  caseId: string | null,
) {
  const nowSeconds = Math.floor(Date.now() / 1000);
  writes.revisionsAt.set(`${boardId}|${userId}|${characterId ?? ''}`, nowSeconds);
  db.insert(schema.boardRevisions)
    .values({ id: newId(), boardId, snapshot, editedBy: userId, characterId })
    .run();
  logActivity({ actorId: userId, characterId, verb: 'board.changed', boardId, caseId });
  if (caseId) {
    db.update(schema.cases).set({ updatedAt: nowSeconds }).where(eq(schema.cases.id, caseId)).run();
  }
}

/**
 * Everything held back, written now. Called on shutdown, and by the tests that
 * want to look at the rows without waiting three seconds for them.
 */
export function flushBoardWrites() {
  // §61: the two clocks are swept here and on every save — see `pruneWriteClocks`.
  pruneWriteClocks();
  for (const [boardId, pending] of [...writes.mentions]) {
    clearTimeout(pending.timer);
    writes.mentions.delete(boardId);
    runMentions(boardId, pending.state);
  }
  for (const [boardId, pending] of [...writes.revisions]) {
    clearTimeout(pending.timer);
    writes.revisions.delete(boardId);
    writeRevision(boardId, pending.state, pending.userId, pending.characterId, pending.caseId);
  }
}

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
  // §61: and the clocks of every wall nobody has touched for ten minutes go.
  pruneWriteClocks();

  db.update(schema.boards)
    .set({ state: merged, updatedAt: nowSeconds })
    .where(eq(schema.boards.id, boardId))
    .run();

  // §27: the artikelen this wall now names — the entry cards outright, and the
  // notitie cards that write one down. The merged document, never the patch:
  // the patch is one client's half of the wall. §61: at once the first time and
  // held back to once every few seconds after that, always with the newest
  // document, because this walks every name in the archive.
  noteMentions(boardId, merged);

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
  const wanted = !latest || !sameHand || nowSeconds - latest.createdAt >= REVISION_EVERY_SECONDS;
  /*
   * §61: …but a hand does not get to write a full snapshot of the wall every
   * 300 ms just because somebody else is working beside it. The rule above says
   * yes to every save of an alternating pair; this says "not again within ten
   * seconds", and what it refuses it *queues* — so the last state of a burst
   * always reaches `board_revisions`, ten seconds behind rather than never.
   */
  const restless =
    Boolean(latest) &&
    nowSeconds - (writes.revisionsAt.get(`${boardId}|${user.id}|${characterId ?? ''}`) ?? 0) <
      REVISION_MIN_SECONDS;

  if (wanted && !restless) {
    const queued = writes.revisions.get(boardId);
    if (queued) {
      clearTimeout(queued.timer);
      writes.revisions.delete(boardId);
    }
    writeRevision(boardId, merged, user.id, characterId, row.caseId ?? null);
  } else if (wanted) {
    const queued = writes.revisions.get(boardId);
    if (queued) {
      // Already armed: it will fire with the newest document and the newest hand.
      queued.state = merged;
      queued.userId = user.id;
      queued.characterId = characterId;
      queued.caseId = row.caseId ?? null;
    } else {
      writes.revisions.set(boardId, {
        state: merged,
        userId: user.id,
        characterId,
        caseId: row.caseId ?? null,
        timer: setTimeout(() => {
          const pending = writes.revisions.get(boardId);
          writes.revisions.delete(boardId);
          if (pending) {
            writeRevision(boardId, pending.state, pending.userId, pending.characterId, pending.caseId);
          }
        }, REVISION_MIN_SECONDS * 1000),
      });
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
  /*
   * §48: a wall filed in a Keeper-only dossier is the Keeper's too. Its
   * dossier's *name* travels with it into every list that shows it
   * (`BOARD_COLUMNS.caseName`), so a players' wall in a Keeper's dossier tells
   * the table there is an investigation nobody told them about. Only this
   * direction: taking the wall back out again leaves it where it is, because
   * nothing in here may be the write that reveals something.
   */
  if (caseId && isKeeperSide('case', caseId) && !isKeeperSide('board', boardId)) {
    setKeeperSide('board', boardId, true, by.id);
  }
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
  /** §52: the walls hanging on this wall. */
  boards: Record<string, BoardBoardFacts>;
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

/**
 * §52: what a prikbord card shows. A wall has no slug and no cover, so this is
 * the thinnest of the four — a name and whether it is still there.
 *
 * It goes through `listBoards`, which is the only reader that carries §17's
 * view dial *and* the parent-dossier rule, so a wall behind a dossier this
 * viewer may not open comes back MISSING rather than named. Resolving it with
 * a select of its own would have quietly skipped both.
 */
export type BoardBoardFacts = {
  id: string;
  name: string;
  caseName: string | null;
  missing: boolean;
};

export function resolveBoardBoards(boardIds: string[], viewer: Viewer): Map<string, BoardBoardFacts> {
  const out = new Map<string, BoardBoardFacts>();
  const ids = [...new Set(boardIds.filter(Boolean))];
  if (!ids.length) return out;
  for (const board of listBoards(viewer)) {
    if (ids.includes(board.id)) {
      out.set(board.id, { id: board.id, name: board.name, caseName: board.caseName, missing: false });
    }
  }
  return out;
}
