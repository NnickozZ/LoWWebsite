import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { db, schema, sqlite } from '@/lib/db';
import type { CoverCrop, FieldDef, Visibility } from '@/lib/db/schema';
import type { PageBlock, TypeText } from '@/lib/pageBlocks';
import { newId } from '@/lib/ids';
import { uniqueSlug } from '@/lib/slug';
import { docToText, EMPTY_DOC, extractEntryLinks } from './doc';
import { visibleEntryCondition, type Viewer } from './visibility';

export type EntryTypeRow = {
  id: string;
  slug: string;
  label: string;
  icon: string;
  colour: string;
  border: string;
  fields: FieldDef[];
  /** Raw; run it through `resolveBlocks` before rendering anything. */
  blocks: PageBlock[];
  pageText: TypeText;
  sortOrder: number;
};

export type EntrySummary = {
  id: string;
  slug: string;
  name: string;
  shortDescription: string;
  typeSlug: string;
  typeLabel: string;
  typeIcon: string;
  typeColour: string;
  typeBorder: string;
  coverAssetId: string | null;
  coverCrop: CoverCrop | null;
  tags: string[];
  visibility: Visibility;
  isLocked: boolean;
  updatedAt: number;
};

/** Exported so `derived.ts` builds its lists out of exactly the same columns. */
export const SUMMARY_COLUMNS = {
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

/* ------------------------------------------------------------------ types */

export function listEntryTypes(): EntryTypeRow[] {
  return db
    .select()
    .from(schema.entryTypes)
    .orderBy(schema.entryTypes.sortOrder)
    .all() as EntryTypeRow[];
}

export function getEntryType(slug: string): EntryTypeRow | undefined {
  return db.select().from(schema.entryTypes).where(eq(schema.entryTypes.slug, slug)).get() as
    | EntryTypeRow
    | undefined;
}

/* --------------------------------------------------------------- indexing */

const deleteFts = sqlite.prepare('DELETE FROM entries_fts WHERE entry_id = ?');
const insertFts = sqlite.prepare(
  'INSERT INTO entries_fts (entry_id, name, short_description, body_text, tags) VALUES (?, ?, ?, ?, ?)',
);

export function reindexEntry(entryId: string) {
  const row = db
    .select({
      name: schema.entries.name,
      shortDescription: schema.entries.shortDescription,
      bodyText: schema.entries.bodyText,
      tags: schema.entries.tags,
      deletedAt: schema.entries.deletedAt,
    })
    .from(schema.entries)
    .where(eq(schema.entries.id, entryId))
    .get();

  deleteFts.run(entryId);
  if (!row || row.deletedAt) return;
  insertFts.run(
    entryId,
    row.name,
    row.shortDescription,
    row.bodyText,
    (row.tags ?? []).join(' '),
  );
}

/**
 * Recomputes `entry_links` from the body document. Called on every body save,
 * so backlinks can never drift from what the text actually says.
 */
export function recomputeLinks(entryId: string, doc: unknown) {
  const targets = extractEntryLinks(doc).filter((id) => id !== entryId);
  db.delete(schema.entryLinks)
    .where(and(eq(schema.entryLinks.fromEntryId, entryId), eq(schema.entryLinks.kind, 'mention')))
    .run();
  if (!targets.length) return;

  const existing = new Set(
    db
      .select({ id: schema.entries.id })
      .from(schema.entries)
      .where(inArray(schema.entries.id, targets))
      .all()
      .map((r) => r.id),
  );

  const rows = targets
    .filter((id) => existing.has(id))
    .map((toEntryId) => ({ fromEntryId: entryId, toEntryId, kind: 'mention' as const, label: '' }));
  if (rows.length) db.insert(schema.entryLinks).values(rows).onConflictDoNothing().run();
}

/* -------------------------------------------------------------- revisions */

const REVISION_COALESCE_SECONDS = 5 * 60;

/**
 * Snapshots the entry. Consecutive edits by the same person inside five minutes
 * replace the previous snapshot rather than piling up — autosave would otherwise
 * write a revision every keystroke pause.
 */
export function writeRevision(entryId: string, editedBy: string | null, note = '') {
  const entry = db.select().from(schema.entries).where(eq(schema.entries.id, entryId)).get();
  if (!entry) return;

  const nowSeconds = Math.floor(Date.now() / 1000);
  const latest = db
    .select()
    .from(schema.entryRevisions)
    .where(eq(schema.entryRevisions.entryId, entryId))
    .orderBy(desc(schema.entryRevisions.createdAt))
    .limit(1)
    .get();

  const snapshot = {
    name: entry.name,
    shortDescription: entry.shortDescription,
    body: entry.body,
    bodyText: entry.bodyText,
    fields: entry.fields,
    tags: entry.tags,
    typeId: entry.typeId,
    coverAssetId: entry.coverAssetId,
    coverCrop: entry.coverCrop,
    visibility: entry.visibility,
    keeperNotes: entry.keeperNotes,
  };

  if (
    latest &&
    latest.editedBy === editedBy &&
    nowSeconds - latest.createdAt < REVISION_COALESCE_SECONDS &&
    !note
  ) {
    db.update(schema.entryRevisions)
      .set({ snapshot, createdAt: nowSeconds })
      .where(eq(schema.entryRevisions.id, latest.id))
      .run();
    return;
  }

  db.insert(schema.entryRevisions)
    .values({ id: newId(), entryId, snapshot, editedBy, note })
    .run();
}

/* ----------------------------------------------------------------- create */

export type CreateEntryInput = {
  typeSlug: string;
  name: string;
  shortDescription?: string;
  body?: unknown;
  fields?: Record<string, unknown>;
  tags?: string[];
  createdBy: string | null;
};

export function createEntry(input: CreateEntryInput): EntrySummary {
  const type = getEntryType(input.typeSlug);
  if (!type) throw new Error(`Onbekende soort fiche: ${input.typeSlug}`);

  const name = input.name.trim();
  if (!name) throw new Error('Een fiche heeft een naam nodig.');

  const slug = uniqueSlug(name, (candidate) =>
    Boolean(db.select({ id: schema.entries.id }).from(schema.entries).where(eq(schema.entries.slug, candidate)).get()),
  );

  const id = newId();
  const body = input.body ?? EMPTY_DOC;

  db.insert(schema.entries)
    .values({
      id,
      typeId: type.id,
      name,
      slug,
      shortDescription: (input.shortDescription ?? '').trim(),
      body,
      bodyText: docToText(body),
      fields: input.fields ?? {},
      tags: normaliseTags(input.tags ?? []),
      createdBy: input.createdBy,
      updatedBy: input.createdBy,
    })
    .run();

  reindexEntry(id);
  recomputeLinks(id, body);
  writeRevision(id, input.createdBy, 'aangemaakt');
  logActivity({ actorId: input.createdBy, verb: 'entry.created', entryId: id });

  return getEntrySummaryById(id)!;
}

export function normaliseTags(tags: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of tags) {
    const tag = raw.trim().toLowerCase().replace(/\s+/g, ' ');
    if (!tag || seen.has(tag)) continue;
    seen.add(tag);
    out.push(tag);
  }
  return out.slice(0, 30);
}

/* ------------------------------------------------------------------ reads */

export function getEntrySummaryById(id: string): EntrySummary | undefined {
  return db
    .select(SUMMARY_COLUMNS)
    .from(schema.entries)
    .innerJoin(schema.entryTypes, eq(schema.entryTypes.id, schema.entries.typeId))
    .where(eq(schema.entries.id, id))
    .get() as EntrySummary | undefined;
}

export function getEntryBySlug(slug: string, viewer: Viewer) {
  const row = db
    .select({
      ...SUMMARY_COLUMNS,
      typeId: schema.entries.typeId,
      typeFields: schema.entryTypes.fields,
      typeBlocks: schema.entryTypes.blocks,
      typePageText: schema.entryTypes.pageText,
      body: schema.entries.body,
      bodyText: schema.entries.bodyText,
      fields: schema.entries.fields,
      keeperNotes: schema.entries.keeperNotes,
      status: schema.entries.status,
      createdBy: schema.entries.createdBy,
      updatedBy: schema.entries.updatedBy,
      createdAt: schema.entries.createdAt,
      deletedAt: schema.entries.deletedAt,
    })
    .from(schema.entries)
    .innerJoin(schema.entryTypes, eq(schema.entryTypes.id, schema.entries.typeId))
    .where(and(eq(schema.entries.slug, slug), visibleEntryCondition(viewer)))
    .get();

  if (!row) return undefined;
  // Never hand a player the Keeper's notes, not even in a prop they don't render.
  if (!viewer?.isKeeper) return { ...row, keeperNotes: '' };
  return row;
}

export type BrowseOptions = {
  typeSlug?: string;
  tag?: string;
  sort?: 'recent' | 'name';
  limit?: number;
  offset?: number;
};

export function browseEntries(viewer: Viewer, options: BrowseOptions = {}): EntrySummary[] {
  const conditions = [visibleEntryCondition(viewer)];
  if (options.typeSlug) conditions.push(eq(schema.entryTypes.slug, options.typeSlug));
  if (options.tag) {
    conditions.push(sql`EXISTS (SELECT 1 FROM json_each(${schema.entries.tags}) WHERE value = ${options.tag})`);
  }

  return db
    .select(SUMMARY_COLUMNS)
    .from(schema.entries)
    .innerJoin(schema.entryTypes, eq(schema.entryTypes.id, schema.entries.typeId))
    .where(and(...conditions))
    .orderBy(
      options.sort === 'name'
        ? sql`${schema.entries.name} COLLATE NOCASE ASC`
        : desc(schema.entries.updatedAt),
    )
    .limit(options.limit ?? 120)
    .offset(options.offset ?? 0)
    .all() as EntrySummary[];
}

/**
 * Tag chips for the browse pages. Counted in JS over the visible rows — a
 * campaign wiki is small, and this keeps the visibility rule in exactly one place.
 */
export function listTagsWithCounts(
  viewer: Viewer,
  typeSlug?: string,
): { tag: string; count: number }[] {
  const rows = db
    .select({ tags: schema.entries.tags })
    .from(schema.entries)
    .innerJoin(schema.entryTypes, eq(schema.entryTypes.id, schema.entries.typeId))
    .where(
      and(
        visibleEntryCondition(viewer),
        ...(typeSlug ? [eq(schema.entryTypes.slug, typeSlug)] : []),
      ),
    )
    .all();

  const counts = new Map<string, number>();
  for (const row of rows) {
    for (const tag of row.tags ?? []) counts.set(tag, (counts.get(tag) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag))
    .slice(0, 40);
}

/** All tags in use, for the tag autocomplete on the entry page. */
export function listAllTags(viewer: Viewer): string[] {
  return listTagsWithCounts(viewer).map((t) => t.tag);
}

/** Everything that mentions this entry, filtered by what the viewer may see. */
export function getBacklinks(entryId: string, viewer: Viewer): EntrySummary[] {
  return db
    .select(SUMMARY_COLUMNS)
    .from(schema.entryLinks)
    .innerJoin(schema.entries, eq(schema.entries.id, schema.entryLinks.fromEntryId))
    .innerJoin(schema.entryTypes, eq(schema.entryTypes.id, schema.entries.typeId))
    .where(and(eq(schema.entryLinks.toEntryId, entryId), visibleEntryCondition(viewer)))
    .orderBy(desc(schema.entries.updatedAt))
    .all() as EntrySummary[];
}

/* ---------------------------------------------------------------- updates */

export type EntryPatch = Partial<{
  name: string;
  shortDescription: string;
  body: unknown;
  fields: Record<string, unknown>;
  tags: string[];
  typeSlug: string;
  coverAssetId: string | null;
  coverCrop: CoverCrop | null;
  visibility: Visibility;
  keeperNotes: string;
  isLocked: boolean;
}>;

export type SaveResult =
  | { status: 'saved'; entry: EntrySummary; updatedBy: string | null }
  | { status: 'pending' };

/**
 * Applies a per-field patch. §6: last write wins per field, so only the keys
 * present in the patch are touched. A locked entry edited by a player becomes a
 * pending edit instead.
 */
export function updateEntry(
  entryId: string,
  patch: EntryPatch,
  user: { id: string; isKeeper: boolean },
): SaveResult {
  const entry = db.select().from(schema.entries).where(eq(schema.entries.id, entryId)).get();
  if (!entry) throw new Error('Fiche niet gevonden');

  if (entry.isLocked && !user.isKeeper) {
    db.insert(schema.pendingEdits)
      .values({
        id: newId(),
        entryId,
        proposedSnapshot: patch as Record<string, unknown>,
        proposedBy: user.id,
      })
      .run();
    return { status: 'pending' };
  }

  const keeperOnlyKeys: (keyof EntryPatch)[] = ['visibility', 'keeperNotes', 'isLocked'];
  const values: Record<string, unknown> = {};

  // §11: a visibility or lock change is an audited act, not an ordinary edit.
  if (user.isKeeper) {
    if (patch.visibility !== undefined && patch.visibility !== entry.visibility) {
      logAudit({
        actorId: user.id,
        action: 'entry.visibility_changed',
        targetType: 'entry',
        targetId: entryId,
        meta: { from: entry.visibility, to: patch.visibility, name: entry.name },
      });
    }
    if (patch.isLocked !== undefined && patch.isLocked !== entry.isLocked) {
      logAudit({
        actorId: user.id,
        action: patch.isLocked ? 'entry.locked' : 'entry.unlocked',
        targetType: 'entry',
        targetId: entryId,
        meta: { name: entry.name },
      });
    }
  }

  if (patch.name !== undefined) {
    const name = patch.name.trim();
    if (name) values.name = name;
  }
  if (patch.shortDescription !== undefined) values.shortDescription = patch.shortDescription;
  if (patch.body !== undefined) {
    values.body = patch.body;
    values.bodyText = docToText(patch.body);
  }
  if (patch.fields !== undefined) {
    values.fields = { ...(entry.fields ?? {}), ...patch.fields };
  }
  if (patch.tags !== undefined) values.tags = normaliseTags(patch.tags);
  if (patch.coverAssetId !== undefined) values.coverAssetId = patch.coverAssetId;
  if (patch.coverCrop !== undefined) values.coverCrop = patch.coverCrop;
  if (patch.typeSlug !== undefined) {
    const type = getEntryType(patch.typeSlug);
    if (type) values.typeId = type.id;
  }
  for (const key of keeperOnlyKeys) {
    if (patch[key] !== undefined && user.isKeeper) values[key] = patch[key];
  }

  if (!Object.keys(values).length) {
    return { status: 'saved', entry: getEntrySummaryById(entryId)!, updatedBy: entry.updatedBy };
  }

  values.updatedAt = Math.floor(Date.now() / 1000);
  values.updatedBy = user.id;

  db.update(schema.entries).set(values).where(eq(schema.entries.id, entryId)).run();

  if (patch.body !== undefined) recomputeLinks(entryId, patch.body);
  if (
    patch.name !== undefined ||
    patch.shortDescription !== undefined ||
    patch.body !== undefined ||
    patch.tags !== undefined
  ) {
    reindexEntry(entryId);
  }
  writeRevision(entryId, user.id);
  logActivity({ actorId: user.id, verb: 'entry.edited', entryId });

  return {
    status: 'saved',
    entry: getEntrySummaryById(entryId)!,
    updatedBy: entry.updatedBy,
  };
}

export function softDeleteEntry(entryId: string, userId: string) {
  const name = db
    .select({ name: schema.entries.name })
    .from(schema.entries)
    .where(eq(schema.entries.id, entryId))
    .get()?.name;
  db.update(schema.entries)
    .set({ deletedAt: Math.floor(Date.now() / 1000), updatedBy: userId })
    .where(eq(schema.entries.id, entryId))
    .run();
  reindexEntry(entryId);
  logActivity({ actorId: userId, verb: 'entry.deleted', entryId });
  logAudit({
    actorId: userId,
    action: 'entry.deleted',
    targetType: 'entry',
    targetId: entryId,
    meta: { name },
  });
}

export function restoreEntry(entryId: string, userId: string) {
  db.update(schema.entries)
    .set({ deletedAt: null, updatedBy: userId })
    .where(eq(schema.entries.id, entryId))
    .run();
  reindexEntry(entryId);
  logActivity({ actorId: userId, verb: 'entry.restored', entryId });
  logAudit({ actorId: userId, action: 'entry.restored', targetType: 'entry', targetId: entryId });
}

export function restoreRevision(revisionId: string, user: { id: string; isKeeper: boolean }) {
  const revision = db
    .select()
    .from(schema.entryRevisions)
    .where(eq(schema.entryRevisions.id, revisionId))
    .get();
  if (!revision) throw new Error('Versie niet gevonden');

  const snapshot = revision.snapshot as Record<string, unknown>;
  writeRevision(revision.entryId, user.id, 'voor het terugzetten');
  db.update(schema.entries)
    .set({
      name: snapshot.name as string,
      shortDescription: snapshot.shortDescription as string,
      body: snapshot.body,
      bodyText: (snapshot.bodyText as string) ?? docToText(snapshot.body),
      fields: (snapshot.fields as Record<string, unknown>) ?? {},
      tags: (snapshot.tags as string[]) ?? [],
      coverAssetId: (snapshot.coverAssetId as string | null) ?? null,
      coverCrop: (snapshot.coverCrop as CoverCrop | null) ?? null,
      updatedAt: Math.floor(Date.now() / 1000),
      updatedBy: user.id,
    })
    .where(eq(schema.entries.id, revision.entryId))
    .run();
  recomputeLinks(revision.entryId, snapshot.body);
  reindexEntry(revision.entryId);
  logActivity({ actorId: user.id, verb: 'entry.restored_revision', entryId: revision.entryId });
  return revision.entryId;
}

export function listRevisions(entryId: string) {
  return db
    .select({
      id: schema.entryRevisions.id,
      createdAt: schema.entryRevisions.createdAt,
      note: schema.entryRevisions.note,
      editedBy: schema.entryRevisions.editedBy,
      username: schema.users.username,
    })
    .from(schema.entryRevisions)
    .leftJoin(schema.users, eq(schema.users.id, schema.entryRevisions.editedBy))
    .where(eq(schema.entryRevisions.entryId, entryId))
    .orderBy(desc(schema.entryRevisions.createdAt))
    .limit(100)
    .all();
}

export function getRevision(revisionId: string) {
  return db
    .select()
    .from(schema.entryRevisions)
    .where(eq(schema.entryRevisions.id, revisionId))
    .get();
}

/* --------------------------------------------------------------- activity */

export function logActivity(input: {
  actorId: string | null;
  verb: string;
  entryId?: string | null;
  caseId?: string | null;
  boardId?: string | null;
  meta?: Record<string, unknown>;
}) {
  db.insert(schema.activity)
    .values({
      id: newId(),
      actorId: input.actorId,
      verb: input.verb,
      entryId: input.entryId ?? null,
      caseId: input.caseId ?? null,
      boardId: input.boardId ?? null,
      meta: input.meta ?? {},
    })
    .run();
}

export type FeedItem = {
  id: string;
  verb: string;
  createdAt: number;
  actorName: string | null;
  entry: EntrySummary | null;
};

/**
 * The home feed (§10). Only rows whose entry the viewer may see; entries that
 * were hidden or deleted since simply drop out.
 */
export function recentActivity(viewer: Viewer, limit = 40): FeedItem[] {
  const rows = db
    .select({
      ...SUMMARY_COLUMNS,
      activityId: schema.activity.id,
      verb: schema.activity.verb,
      happenedAt: schema.activity.createdAt,
      actorName: schema.users.username,
    })
    .from(schema.activity)
    .innerJoin(schema.entries, eq(schema.entries.id, schema.activity.entryId))
    .innerJoin(schema.entryTypes, eq(schema.entryTypes.id, schema.entries.typeId))
    .leftJoin(schema.users, eq(schema.users.id, schema.activity.actorId))
    .where(visibleEntryCondition(viewer))
    .orderBy(desc(schema.activity.createdAt))
    .limit(limit * 3)
    .all();

  // Collapse repeated edits of the same entry by the same person.
  const seen = new Set<string>();
  const out: FeedItem[] = [];
  for (const row of rows) {
    const key = `${row.actorName}:${row.slug}:${row.verb}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      id: row.activityId,
      verb: row.verb,
      createdAt: row.happenedAt,
      actorName: row.actorName,
      entry: {
        id: row.id,
        slug: row.slug,
        name: row.name,
        shortDescription: row.shortDescription,
        typeSlug: row.typeSlug,
        typeLabel: row.typeLabel,
        typeIcon: row.typeIcon,
        typeColour: row.typeColour,
        typeBorder: row.typeBorder,
        coverAssetId: row.coverAssetId,
        coverCrop: row.coverCrop,
        tags: row.tags,
        visibility: row.visibility,
        isLocked: row.isLocked,
        updatedAt: row.updatedAt,
      },
    });
    if (out.length >= limit) break;
  }
  return out;
}

export function logAudit(input: {
  actorId: string | null;
  action: string;
  targetType?: string;
  targetId?: string;
  meta?: Record<string, unknown>;
}) {
  db.insert(schema.auditLog)
    .values({
      id: newId(),
      actorId: input.actorId,
      action: input.action,
      targetType: input.targetType ?? '',
      targetId: input.targetId ?? '',
      meta: input.meta ?? {},
    })
    .run();
}
