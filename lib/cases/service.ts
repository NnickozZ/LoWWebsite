import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { db, schema } from '@/lib/db';
import { newId } from '@/lib/ids';
import { uniqueSlug } from '@/lib/slug';
import type { AccessMode, CoverCrop } from '@/lib/db/schema';
import { docToText } from '@/lib/entries/doc';
import { logActivity, type EntrySummary } from '@/lib/entries/service';
import { visibleEntryCondition, type Viewer } from '@/lib/entries/visibility';
import { resetRoom } from '@/lib/live/docs';
import { visibleCaseCondition } from './visibility';

export type CaseStatus = 'open' | 'cold' | 'closed';

/** A crop off the wire, clamped so nothing odd reaches a style attribute. */
export function cleanCrop(input: unknown): CoverCrop | null {
  if (!input || typeof input !== 'object') return null;
  const raw = input as Partial<CoverCrop>;
  const num = (value: unknown, fallback: number) =>
    typeof value === 'number' && Number.isFinite(value) ? value : fallback;
  return {
    x: Math.min(1, Math.max(0, num(raw.x, 0.5))),
    y: Math.min(1, Math.max(0, num(raw.y, 0.5))),
    zoom: Math.min(4, Math.max(1, num(raw.zoom, 1))),
  };
}

export type CaseSummary = {
  id: string;
  name: string;
  slug: string;
  summary: string;
  status: CaseStatus;
  /** §17: the owner's dials. `visibility === 'assigned'` of old is `viewMode === 'some'`. */
  viewMode: AccessMode;
  editMode: AccessMode;
  accessLocked: boolean;
  createdBy: string | null;
  coverAssetId: string | null;
  coverCrop: CoverCrop | null;
  updatedAt: number;
  createdAt: number;
};

const CASE_COLUMNS = {
  id: schema.cases.id,
  name: schema.cases.name,
  slug: schema.cases.slug,
  summary: schema.cases.summary,
  status: schema.cases.status,
  viewMode: schema.cases.viewMode,
  editMode: schema.cases.editMode,
  accessLocked: schema.cases.accessLocked,
  createdBy: schema.cases.createdBy,
  coverAssetId: schema.cases.coverAssetId,
  coverCrop: schema.cases.coverCrop,
  updatedAt: schema.cases.updatedAt,
  createdAt: schema.cases.createdAt,
} as const;

const ENTRY_COLUMNS = {
  id: schema.entries.id,
  slug: schema.entries.slug,
  name: schema.entries.name,
  shortDescription: schema.entries.shortDescription,
  typeSlug: schema.entryTypes.slug,
  typeLabel: schema.entryTypes.label,
  typeIcon: schema.entryTypes.icon,
  typeColour: schema.entryTypes.colour,
  typeBorder: schema.entryTypes.border,
  coverAssetId: schema.entries.coverAssetId,
  coverCrop: schema.entries.coverCrop,
  tags: schema.entries.tags,
  visibility: schema.entries.visibility,
  isLocked: schema.entries.isLocked,
  updatedAt: schema.entries.updatedAt,
} as const;

/* ----------------------------------------------------------------- create */

export function createCase(input: {
  name: string;
  summary?: string;
  createdBy: string | null;
}): CaseSummary {
  const name = input.name.trim();
  if (!name) throw new Error('Geef het dossier eerst een naam.');

  const slug = uniqueSlug(name, (candidate) =>
    Boolean(
      db.select({ id: schema.cases.id }).from(schema.cases).where(eq(schema.cases.slug, candidate)).get(),
    ),
  );

  const id = newId();
  db.insert(schema.cases)
    .values({
      id,
      name,
      slug,
      summary: (input.summary ?? '').trim(),
      createdBy: input.createdBy,
    })
    .run();

  // Whoever opens a case is assigned to it, so switching to "assigned" later
  // never locks its author out.
  if (input.createdBy) {
    db.insert(schema.caseMembers)
      .values({ caseId: id, userId: input.createdBy })
      .onConflictDoNothing()
      .run();
  }

  writeCaseRevision(id, input.createdBy);
  logActivity({ actorId: input.createdBy, verb: 'case.created', caseId: id });
  return getCaseById(id)!;
}

/* ------------------------------------------------------------------ reads */

export function getCaseById(id: string): CaseSummary | undefined {
  return db.select(CASE_COLUMNS).from(schema.cases).where(eq(schema.cases.id, id)).get() as
    | CaseSummary
    | undefined;
}

export function getCaseBySlug(slug: string, viewer: Viewer) {
  const row = db
    .select({
      ...CASE_COLUMNS,
      notes: schema.cases.notes,
      notesText: schema.cases.notesText,
      keeperNotes: schema.cases.keeperNotes,
      createdBy: schema.cases.createdBy,
    })
    .from(schema.cases)
    .where(and(eq(schema.cases.slug, slug), visibleCaseCondition(viewer)))
    .get();

  if (!row) return undefined;
  if (!viewer?.isKeeper) return { ...row, keeperNotes: '' };
  return row;
}

export type CaseListOptions = {
  /** One status, or any of several. */
  status?: CaseStatus | CaseStatus[];
  /** 'status' = open first, then cold, then closed, newest change first within each. */
  sort?: 'status' | 'recent' | 'name' | 'created';
  /** §14: only what this account opened. */
  mine?: string;
  /** §14: only cases where this account is on the view list (or which it owns). */
  memberOf?: string;
  /** §14: only cases whose §17 view dial is not "everyone". */
  restricted?: boolean;
};

const STATUS_RANK = sql`CASE ${schema.cases.status} WHEN 'open' THEN 0 WHEN 'cold' THEN 1 ELSE 2 END`;

export function listCases(viewer: Viewer, options: CaseListOptions = {}): CaseSummary[] {
  const conditions = [visibleCaseCondition(viewer)];
  const statuses = Array.isArray(options.status) ? options.status : options.status ? [options.status] : [];
  if (statuses.length === 1) conditions.push(eq(schema.cases.status, statuses[0]));
  else if (statuses.length > 1) conditions.push(inArray(schema.cases.status, statuses));
  if (options.mine) conditions.push(eq(schema.cases.createdBy, options.mine));
  if (options.memberOf) {
    conditions.push(
      sql`(${schema.cases.createdBy} = ${options.memberOf} OR EXISTS (SELECT 1 FROM access_grants g WHERE g.target_type = 'case' AND g.target_id = ${schema.cases.id} AND g.user_id = ${options.memberOf} AND g.can_view = 1))`,
    );
  }
  if (options.restricted) conditions.push(sql`${schema.cases.viewMode} <> 'all'`);

  const order =
    options.sort === 'name'
      ? [sql`${schema.cases.name} COLLATE NOCASE ASC`]
      : options.sort === 'created'
        ? [desc(schema.cases.createdAt)]
        : options.sort === 'status'
          ? [STATUS_RANK, desc(schema.cases.updatedAt)]
          : [desc(schema.cases.updatedAt)];

  return db
    .select(CASE_COLUMNS)
    .from(schema.cases)
    .where(and(...conditions))
    .orderBy(...order)
    .limit(200)
    .all() as CaseSummary[];
}

export type CaseMember = { id: string; username: string };

/**
 * §17: the people on this case's view list — what "assigned investigators"
 * used to be. Read from access_grants; case_members is history.
 */
export function listCaseMembers(caseId: string): CaseMember[] {
  return db
    .select({ id: schema.users.id, username: schema.users.username })
    .from(schema.accessGrants)
    .innerJoin(schema.users, eq(schema.users.id, schema.accessGrants.userId))
    .where(
      and(
        eq(schema.accessGrants.targetType, 'case'),
        eq(schema.accessGrants.targetId, caseId),
        eq(schema.accessGrants.canView, true),
      ),
    )
    .orderBy(schema.users.usernameLower)
    .all();
}

/**
 * An entry as it appears in one case: its own note, and its own crop of the
 * cover, which falls back to the entry's when this case has not set one.
 */
export type CaseEntry = EntrySummary & {
  caseNote: string;
  addedAt: number;
  caseCrop: CoverCrop | null;
};

/**
 * The entries filed in a case, filtered by *entry* visibility as well as case
 * visibility — a Keeper-only entry stays invisible even inside a case a player
 * can open.
 */
export function listCaseEntries(caseId: string, viewer: Viewer): CaseEntry[] {
  return db
    .select({
      ...ENTRY_COLUMNS,
      caseNote: schema.caseEntries.note,
      addedAt: schema.caseEntries.addedAt,
      caseCrop: schema.caseEntries.crop,
    })
    .from(schema.caseEntries)
    .innerJoin(schema.entries, eq(schema.entries.id, schema.caseEntries.entryId))
    .innerJoin(schema.entryTypes, eq(schema.entryTypes.id, schema.entries.typeId))
    .where(and(eq(schema.caseEntries.caseId, caseId), visibleEntryCondition(viewer)))
    .orderBy(desc(schema.caseEntries.addedAt))
    .all() as CaseEntry[];
}

/** The cases an entry belongs to, that this viewer may see. */
export function listCasesForEntry(entryId: string, viewer: Viewer): CaseSummary[] {
  return db
    .select(CASE_COLUMNS)
    .from(schema.caseEntries)
    .innerJoin(schema.cases, eq(schema.cases.id, schema.caseEntries.caseId))
    .where(and(eq(schema.caseEntries.entryId, entryId), visibleCaseCondition(viewer)))
    .orderBy(desc(schema.cases.updatedAt))
    .all() as CaseSummary[];
}

/* --------------------------------------------------------------- mutation */

export function touchCase(caseId: string, userId: string | null) {
  db.update(schema.cases)
    .set({ updatedAt: Math.floor(Date.now() / 1000) })
    .where(eq(schema.cases.id, caseId))
    .run();
  if (userId) void userId;
}

export function addEntryToCase(
  caseId: string,
  entryId: string,
  userId: string | null,
  note = '',
) {
  db.insert(schema.caseEntries)
    .values({ caseId, entryId, addedBy: userId, note })
    .onConflictDoNothing()
    .run();
  touchCase(caseId, userId);
  logActivity({ actorId: userId, verb: 'case.entry_added', caseId, entryId });
}

export function removeEntryFromCase(caseId: string, entryId: string, userId: string | null) {
  db.delete(schema.caseEntries)
    .where(and(eq(schema.caseEntries.caseId, caseId), eq(schema.caseEntries.entryId, entryId)))
    .run();
  touchCase(caseId, userId);
  logActivity({ actorId: userId, verb: 'case.entry_removed', caseId, entryId });
}

export function setCaseEntryNote(
  caseId: string,
  entryId: string,
  note: string,
  userId: string | null,
) {
  db.update(schema.caseEntries)
    .set({ note })
    .where(and(eq(schema.caseEntries.caseId, caseId), eq(schema.caseEntries.entryId, entryId)))
    .run();
  touchCase(caseId, userId);
  logActivity({ actorId: userId, verb: 'case.note_changed', caseId, entryId });
}

/** This case's own crop of the cover. Null means "use the entry's". */
export function setCaseEntryCrop(caseId: string, entryId: string, crop: CoverCrop | null) {
  db.update(schema.caseEntries)
    .set({ crop })
    .where(and(eq(schema.caseEntries.caseId, caseId), eq(schema.caseEntries.entryId, entryId)))
    .run();
}

/** Is this entry already filed in this case? Used by the board's filing prompt. */
export function caseHasEntry(caseId: string, entryId: string): boolean {
  return Boolean(
    db
      .select({ entryId: schema.caseEntries.entryId })
      .from(schema.caseEntries)
      .where(and(eq(schema.caseEntries.caseId, caseId), eq(schema.caseEntries.entryId, entryId)))
      .get(),
  );
}

export type CasePatch = Partial<{
  name: string;
  summary: string;
  notes: unknown;
  status: CaseStatus;
  coverAssetId: string | null;
  coverCrop: CoverCrop | null;
  keeperNotes: string;
}>;

export function updateCase(
  caseId: string,
  patch: CasePatch,
  user: { id: string; isKeeper: boolean },
  options: { live?: boolean } = {},
) {
  const existing = db.select().from(schema.cases).where(eq(schema.cases.id, caseId)).get();
  if (!existing) throw new Error('Dossier niet gevonden');

  const values: Record<string, unknown> = {};
  if (patch.name !== undefined && patch.name.trim()) values.name = patch.name.trim();
  if (patch.summary !== undefined) values.summary = patch.summary;
  if (patch.notes !== undefined) {
    values.notes = patch.notes;
    values.notesText = docToText(patch.notes);
  }
  if (patch.status !== undefined) values.status = patch.status;
  if (patch.coverAssetId !== undefined) values.coverAssetId = patch.coverAssetId;
  if (patch.coverCrop !== undefined) values.coverCrop = cleanCrop(patch.coverCrop);
  if (patch.keeperNotes !== undefined && user.isKeeper) values.keeperNotes = patch.keeperNotes;
  // §17: who may see or edit the case is not a field on it — it goes through
  // lib/access.ts and /api/access, with its own rules about who may change it.

  if (Object.keys(values).length) {
    values.updatedAt = Math.floor(Date.now() / 1000);
    db.update(schema.cases).set(values).where(eq(schema.cases.id, caseId)).run();
  }

  writeCaseRevision(caseId, user.id);
  logActivity({ actorId: user.id, verb: 'case.edited', caseId });
  // §20: the shared notes follow the archive when written around the room.
  if (patch.notes !== undefined && !options.live) resetRoom(`case:${caseId}:notes`, patch.notes);
  return getCaseById(caseId)!;
}

export function softDeleteCase(caseId: string, userId: string) {
  db.update(schema.cases)
    .set({ deletedAt: Math.floor(Date.now() / 1000) })
    .where(eq(schema.cases.id, caseId))
    .run();
  logActivity({ actorId: userId, verb: 'case.deleted', caseId });
}

const REVISION_COALESCE_SECONDS = 5 * 60;

export function writeCaseRevision(caseId: string, editedBy: string | null) {
  const row = db.select().from(schema.cases).where(eq(schema.cases.id, caseId)).get();
  if (!row) return;

  const nowSeconds = Math.floor(Date.now() / 1000);
  const latest = db
    .select()
    .from(schema.caseRevisions)
    .where(eq(schema.caseRevisions.caseId, caseId))
    .orderBy(desc(schema.caseRevisions.createdAt))
    .limit(1)
    .get();

  const snapshot = {
    name: row.name,
    summary: row.summary,
    notes: row.notes,
    status: row.status,
    viewMode: row.viewMode,
    editMode: row.editMode,
    keeperNotes: row.keeperNotes,
    memberIds: listCaseMembers(caseId).map((m) => m.id),
  };

  if (latest && latest.editedBy === editedBy && nowSeconds - latest.createdAt < REVISION_COALESCE_SECONDS) {
    db.update(schema.caseRevisions)
      .set({ snapshot, createdAt: nowSeconds })
      .where(eq(schema.caseRevisions.id, latest.id))
      .run();
    return;
  }

  db.insert(schema.caseRevisions)
    .values({ id: newId(), caseId, snapshot, editedBy })
    .run();
}

/* --------------------------------------------------------------- activity */

export type CaseActivityItem = {
  id: string;
  verb: string;
  createdAt: number;
  /** The account. §18: the page turns it into a character name with `attributed`. */
  actorId: string | null;
  actorName: string | null;
  actorIsKeeper: boolean;
  /** §18: filled in by `attributed()` on the page; the account name until then. */
  actorLabel?: string | null;
  actorAccount?: string | null;
  entryName: string | null;
  entrySlug: string | null;
  boardName: string | null;
};

/** §7 Activity tab: everything that happened to this case, newest first. */
export function listCaseActivity(caseId: string, viewer: Viewer, limit = 120): CaseActivityItem[] {
  const rows = db
    .select({
      id: schema.activity.id,
      verb: schema.activity.verb,
      createdAt: schema.activity.createdAt,
      actorId: schema.users.id,
      actorName: schema.users.username,
      actorIsKeeper: schema.users.isKeeper,
      entryId: schema.activity.entryId,
      entryName: schema.entries.name,
      entrySlug: schema.entries.slug,
      boardName: schema.boards.name,
    })
    .from(schema.activity)
    .leftJoin(schema.users, eq(schema.users.id, schema.activity.actorId))
    .leftJoin(schema.entries, eq(schema.entries.id, schema.activity.entryId))
    .leftJoin(schema.boards, eq(schema.boards.id, schema.activity.boardId))
    .where(eq(schema.activity.caseId, caseId))
    .orderBy(desc(schema.activity.createdAt))
    .limit(limit)
    .all();

  // A row about an entry the viewer may not see must not name it. One query
  // behind the same condition every list uses (§9 secrecy and §17 rights both).
  const mentioned = [...new Set(rows.flatMap((row) => (row.entryId ? [row.entryId] : [])))];
  const allowed = new Set(
    mentioned.length
      ? db
          .select({ id: schema.entries.id })
          .from(schema.entries)
          .where(and(inArray(schema.entries.id, mentioned), visibleEntryCondition(viewer)))
          .all()
          .map((r) => r.id)
      : [],
  );

  return rows
    .filter((row) => !row.entryId || allowed.has(row.entryId))
    .map((row) => ({
      id: row.id,
      verb: row.verb,
      createdAt: row.createdAt,
      actorId: row.actorId,
      actorName: row.actorName,
      actorIsKeeper: Boolean(row.actorIsKeeper),
      entryName: row.entryName,
      entrySlug: row.entrySlug,
      boardName: row.boardName,
    }));
}

/** Entries in a case that the viewer has not seen since their last visit. */
export function countNewSince(caseId: string, since: number): number {
  const row = db
    .select({ n: sql<number>`count(*)` })
    .from(schema.activity)
    .where(and(eq(schema.activity.caseId, caseId), sql`${schema.activity.createdAt} > ${since}`))
    .get();
  return row?.n ?? 0;
}

/** Bulk helper for the Cases list: how many entries each case holds. */
export function countEntriesPerCase(caseIds: string[], viewer: Viewer): Map<string, number> {
  const counts = new Map<string, number>();
  if (!caseIds.length) return counts;

  const rows = db
    .select({ caseId: schema.caseEntries.caseId, n: sql<number>`count(*)` })
    .from(schema.caseEntries)
    .innerJoin(schema.entries, eq(schema.entries.id, schema.caseEntries.entryId))
    .where(and(inArray(schema.caseEntries.caseId, caseIds), visibleEntryCondition(viewer)))
    .groupBy(schema.caseEntries.caseId)
    .all();

  for (const row of rows) counts.set(row.caseId, row.n);
  return counts;
}
