import { and, desc, eq, exists, inArray, sql } from 'drizzle-orm';
import { canEdit, canView, grantFor, viewerCanEdit } from '@/lib/access';
import type { Author } from '@/lib/auth/author';
import { db, schema, sqlite } from '@/lib/db';
import type { AccessMode, FieldDef, Visibility } from '@/lib/db/schema';
import { normaliseCrops, type CoverCrops } from '@/lib/images/shapes';
import { resolveBlocks, type PageBlock, type TypeText } from '@/lib/pageBlocks';
import { newId } from '@/lib/ids';
import { sideCondition } from '@/lib/keeper/side';
import { uniqueSlug } from '@/lib/slug';
import { docToText, EMPTY_DOC, extractEntryLinks } from './doc';
import { checkFieldPatch, cleanFieldPatch, listBlockKeys } from './fieldValues';
import { recomputeFieldMentions } from './mentions';
import { visibleEntryCondition, type Viewer } from './visibility';
import { visibleCaseCondition } from '@/lib/cases/visibility';
import { visibleMapCondition } from '@/lib/maps/visibility';
import { publishSaved, resetFieldsInRoom, resetRoom } from '@/lib/live/docs';
import { entryFieldsRoomKey } from '@/lib/live/keys';
import { syncEventsFromEntryDate } from '@/lib/timelines/moment';

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
  /** §24: this soort is only made inside a dossier. */
  caseOnly: boolean;
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
  coverCrop: CoverCrops | null;
  tags: string[];
  visibility: Visibility;
  isLocked: boolean;
  /** §17: so a list card can show a lock for something not everyone sees. */
  viewMode: AccessMode;
  /** §24: the dossier this artikel was made in, if it was made in one. */
  originCaseId: string | null;
  /**
   * §24: does this artikel's soort only exist inside a dossier? Carried on the
   * summary because a list has to be able to ask "is this one adrift?"
   * (`isAdrift`) without a second query per row — a persoon with no dossier is
   * ordinary, a clue with none is a loose end.
   */
  typeCaseOnly: boolean;
  /**
   * The name of that dossier, for this viewer — filled in by `nameTheirCases`,
   * absent otherwise. Never read straight off the row: a dossier's name is not
   * public, so it is resolved behind `visibleCaseCondition` like every other
   * read of one.
   */
  originCaseName?: string | null;
  createdBy: string | null;
  createdAt: number;
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
  viewMode: schema.entries.viewMode,
  originCaseId: schema.entries.originCaseId,
  typeCaseOnly: schema.entryTypes.caseOnly,
  createdBy: schema.entries.createdBy,
  createdAt: schema.entries.createdAt,
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

/**
 * §38: the two lists that together say which keys an artikel of this soort may
 * have a value under — the Keeper's fields, and the hand-filled list blocks on
 * its page. Both, always: a list block's chosen artikelen live in
 * `entries.fields` under the block's own key, so a gate that only knew about
 * `entry_types.fields` would quietly empty every one of them.
 */
export function typeFieldSpec(typeId: string): { defs: FieldDef[]; listKeys: string[] } {
  const row = db
    .select({ fields: schema.entryTypes.fields, blocks: schema.entryTypes.blocks })
    .from(schema.entryTypes)
    .where(eq(schema.entryTypes.id, typeId))
    .get();
  return {
    defs: (row?.fields as FieldDef[] | null) ?? [],
    listKeys: listBlockKeys(resolveBlocks(row?.blocks)),
  };
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
 *
 * §18b: "the same person" means the same account *and* the same onderzoeker.
 * One account holding two investigators is two writers as far as the history is
 * concerned, and coalescing on the account alone would quietly merge them into
 * whichever name happened to be first.
 */
export function writeRevision(
  entryId: string,
  editedBy: string | null,
  note = '',
  characterId: string | null = null,
) {
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
    (latest.characterId ?? null) === characterId &&
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
    .values({ id: newId(), entryId, snapshot, editedBy, characterId, note })
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
  /** §18b: the onderzoeker it is being made as. */
  characterId?: string | null;
  /**
   * §24: the dossier this is being made in. Required for a `caseOnly` soort —
   * a voorwerp or a clue is found *during* an investigation, and one with no
   * investigation behind it is a row nobody can explain. The caller checks that
   * this person may write in that dossier; this only checks that there is one.
   */
  originCaseId?: string | null;
};

export function createEntry(input: CreateEntryInput): EntrySummary {
  const type = getEntryType(input.typeSlug);
  if (!type) throw new Error(`Onbekende soort artikel: ${input.typeSlug}`);
  if (type.caseOnly && !input.originCaseId) {
    throw new Error(`${type.label} maak je in een dossier.`);
  }

  const name = input.name.trim();
  if (!name) throw new Error('Een artikel heeft een naam nodig.');

  const slug = uniqueSlug(name, (candidate) =>
    Boolean(db.select({ id: schema.entries.id }).from(schema.entries).where(eq(schema.entries.slug, candidate)).get()),
  );

  const id = newId();
  const body = input.body ?? EMPTY_DOC;

  // §38: an artikel is made with the soort's own infobox, or with none. The
  // same gate `updateEntry` puts on a save, so the first write cannot smuggle
  // in a key the Keeper never asked for.
  const fields = cleanFieldPatch(
    type.fields ?? [],
    listBlockKeys(resolveBlocks(type.blocks)),
    input.fields ?? {},
  );

  db.insert(schema.entries)
    .values({
      id,
      typeId: type.id,
      name,
      slug,
      shortDescription: (input.shortDescription ?? '').trim(),
      body,
      bodyText: docToText(body),
      fields,
      tags: normaliseTags(input.tags ?? []),
      originCaseId: input.originCaseId ?? null,
      createdBy: input.createdBy,
      updatedBy: input.createdBy,
    })
    .run();

  reindexEntry(id);
  recomputeLinks(id, body);
  // §27: made with its infobox already filled in — the mentions come with it.
  if (input.fields) recomputeFieldMentions(id);
  writeRevision(id, input.createdBy, 'aangemaakt', input.characterId ?? null);
  logActivity({
    actorId: input.createdBy,
    characterId: input.characterId ?? null,
    verb: 'entry.created',
    entryId: id,
  });

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

/**
 * §20: the rest of the record — everything but the shared text — for a page
 * catching up after someone else saved. Same gate as every read.
 */
export function getEntryFieldsForViewer(id: string, viewer: Viewer) {
  const row = db
    .select({
      id: schema.entries.id,
      name: schema.entries.name,
      shortDescription: schema.entries.shortDescription,
      tags: schema.entries.tags,
      fields: schema.entries.fields,
      coverAssetId: schema.entries.coverAssetId,
      coverCrop: schema.entries.coverCrop,
      isLocked: schema.entries.isLocked,
      visibility: schema.entries.visibility,
      updatedAt: schema.entries.updatedAt,
    })
    .from(schema.entries)
    .where(and(eq(schema.entries.id, id), visibleEntryCondition(viewer)))
    .get();
  return row ?? undefined;
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
      /** §24: whether a person chose the herkomst-dossier, or it follows. */
      originPinned: schema.entries.originPinned,
      keeperNotes: schema.entries.keeperNotes,
      status: schema.entries.status,
      viewMode: schema.entries.viewMode,
      editMode: schema.entries.editMode,
      accessLocked: schema.entries.accessLocked,
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
  sort?: 'recent' | 'name' | 'created';
  /** §14: only what this account made. */
  mine?: string;
  /** §14, Keeper only: one §9 secrecy level. Ignored for a player. */
  visibility?: Visibility;
  /** §14: only fiches whose §17 view dial is not "everyone". */
  restricted?: boolean;
  /** §14: only fiches that are pinned on a map. */
  onMap?: boolean;
  /**
   * §46: read this list from *both* sides of the archive instead of the one
   * the viewer is standing on. For a picker, an autocomplete or a record
   * page's own sub-list — never for a browsable list. See `sideCondition`.
   */
  bothSides?: boolean;
  limit?: number;
  offset?: number;
};

export function browseEntries(viewer: Viewer, options: BrowseOptions = {}): EntrySummary[] {
  const conditions = [visibleEntryCondition(viewer)];
  // §46: a list is read from one side of the archive. AND-ed *after* the
  // visibility rule, never instead of it.
  if (!options.bothSides) conditions.push(sideCondition('entry', viewer));
  if (options.typeSlug) conditions.push(eq(schema.entryTypes.slug, options.typeSlug));
  if (options.tag) {
    conditions.push(sql`EXISTS (SELECT 1 FROM json_each(${schema.entries.tags}) WHERE value = ${options.tag})`);
  }
  if (options.mine) conditions.push(eq(schema.entries.createdBy, options.mine));
  if (options.visibility && viewer?.isKeeper) conditions.push(eq(schema.entries.visibility, options.visibility));
  if (options.restricted) conditions.push(sql`${schema.entries.viewMode} <> 'all'`);
  if (options.onMap) {
    /*
     * §40, §44: only landkaarten this viewer may open. The subquery used to ask
     * nothing but `deleted_at IS NULL`, so "op de kaart" listed an artikel
     * because it is pinned on a map whose dial shuts this reader out — or, since
     * §44, on one the Keeper has taken to their own side. The artikel is theirs
     * to see either way; that it is pinned somewhere they cannot go is not, and
     * the filter was the one road that said so.
     */
    conditions.push(
      exists(
        db
          .select({ one: sql`1` })
          .from(schema.mapPins)
          .innerJoin(schema.maps, eq(schema.maps.id, schema.mapPins.mapId))
          .where(and(eq(schema.mapPins.entryId, schema.entries.id), visibleMapCondition(viewer))),
      ),
    );
  }

  return db
    .select(SUMMARY_COLUMNS)
    .from(schema.entries)
    .innerJoin(schema.entryTypes, eq(schema.entryTypes.id, schema.entries.typeId))
    .where(and(...conditions))
    .orderBy(
      options.sort === 'name'
        ? sql`${schema.entries.name} COLLATE NOCASE ASC`
        : options.sort === 'created'
          ? desc(schema.entries.createdAt)
          : desc(schema.entries.updatedAt),
    )
    .limit(options.limit ?? 120)
    .offset(options.offset ?? 0)
    .all() as EntrySummary[];
}

/**
 * §24: fills in the name of the dossier each artikel was made in, for this
 * viewer, in one query for the whole list.
 *
 * Deliberately a second pass rather than a join in `SUMMARY_COLUMNS`: that
 * shape is shared by a dozen readers (`derived.ts`, backlinks, the feed) and
 * only two or three of them list anything that has an origin dossier at all.
 * A dossier this viewer may not open resolves to nothing, and
 * `entryDisplayName` then prints the plain name — the label on a clue must not
 * give away an investigation nobody told them about.
 */
export function nameTheirCases<T extends { originCaseId: string | null }>(
  rows: T[],
  viewer: Viewer,
): (T & { originCaseName: string | null })[] {
  const ids = [...new Set(rows.flatMap((row) => (row.originCaseId ? [row.originCaseId] : [])))];
  if (!ids.length) return rows.map((row) => ({ ...row, originCaseName: null }));

  const names = new Map(
    db
      .select({ id: schema.cases.id, name: schema.cases.name })
      .from(schema.cases)
      .where(and(inArray(schema.cases.id, ids), visibleCaseCondition(viewer)))
      .all()
      .map((row) => [row.id, row.name] as const),
  );

  return rows.map((row) => ({
    ...row,
    originCaseName: (row.originCaseId && names.get(row.originCaseId)) || null,
  }));
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
        // §46: the wiki's tag chips count the side you are standing on.
        sideCondition('entry', viewer),
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

/**
 * How many entries this viewer may see, per soort — the numbers on the wiki's
 * tabs. Behind `visibleEntryCondition`, like every count: a tab that said
 * "Aanwijzingen 12" to a player who may see 9 would be a leak by arithmetic.
 */
export function countEntriesPerType(viewer: Viewer): Map<string, number> {
  const rows = db
    .select({ typeId: schema.entries.typeId, n: sql<number>`count(*)` })
    .from(schema.entries)
    // §46: and by the side, so the badge agrees with the list under it.
    .where(and(visibleEntryCondition(viewer), sideCondition('entry', viewer)))
    .groupBy(schema.entries.typeId)
    .all();
  return new Map(rows.map((row) => [row.typeId, Number(row.n)]));
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
  coverCrop: CoverCrops | null;
  visibility: Visibility;
  keeperNotes: string;
  isLocked: boolean;
}>;

export type SaveResult =
  | {
      status: 'saved';
      entry: EntrySummary;
      updatedBy: string | null;
      /**
       * §38: the infobox keys this save refused — a key the soort does not
       * have, or a value that is not of that field's kind. Present only on a
       * plain save. A live room's write leaves this empty on purpose: a CRDT
       * that were told "no" would put the same keystroke back and be told "no"
       * again, for ever, so the room drops what it may not store in silence.
       */
      rejectedFields?: string[];
    }
  | { status: 'pending' };

/**
 * Applies a per-field patch. §6: last write wins per field, so only the keys
 * present in the patch are touched. A locked entry edited by a player becomes a
 * pending edit instead.
 */
export function updateEntry(
  entryId: string,
  patch: EntryPatch,
  user: Author,
  options: {
    /**
     * §20: the save is the shared document writing itself back. Anything else
     * that changes the body — a proposal approved, a plain PATCH — has to
     * rewrite the shared document to match, or the next keystroke in the
     * room would put the old text back.
     */
    live?: boolean;
  } = {},
): SaveResult {
  const entry = db.select().from(schema.entries).where(eq(schema.entries.id, entryId)).get();
  if (!entry) throw new Error('Artikel niet gevonden');

  // §18b: the onderzoeker this window is writing as — recorded on everything
  // this call leaves behind: the revision, the feed row, the audit line, and a
  // proposal that has to wait for a Keeper.
  const writtenAs = user.characterId ?? null;

  // §17: someone who may see this fiche but not change it gets the same road
  // a locked fiche offers everyone — the edit becomes a proposal for the owner
  // or a Keeper to look at. Anyone who cannot see it gets nothing at all.
  if (!user.isKeeper) {
    const grant = grantFor('entry', entryId, user.id);
    if (!canView(entry, user, grant)) throw new Error('Artikel niet gevonden');
    if (!canEdit(entry, user, grant)) {
      db.insert(schema.pendingEdits)
        .values({
          id: newId(),
          entryId,
          proposedSnapshot: patch as Record<string, unknown>,
          proposedBy: user.id,
          characterId: writtenAs,
        })
        .run();
      return { status: 'pending' };
    }
  }

  if (entry.isLocked && !user.isKeeper) {
    db.insert(schema.pendingEdits)
      .values({
        id: newId(),
        entryId,
        proposedSnapshot: patch as Record<string, unknown>,
        proposedBy: user.id,
        characterId: writtenAs,
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
        characterId: writtenAs,
        action: 'entry.visibility_changed',
        targetType: 'entry',
        targetId: entryId,
        meta: { from: entry.visibility, to: patch.visibility, name: entry.name },
      });
    }
    if (patch.isLocked !== undefined && patch.isLocked !== entry.isLocked) {
      logAudit({
        actorId: user.id,
        characterId: writtenAs,
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
  /*
   * §38: the infobox is the Keeper's list, and this is the one seam that says
   * so. Everything that changes `entries.fields` on purpose comes through here
   * — the artikel page's autosave (`PATCH /api/entries/[id]`), the §21 fields
   * room (`lib/live/rooms.ts` sweeps every `field.*` name out of the Yjs doc
   * and hands them to this function), an approved voorstel
   * (`approvePendingEdit`) and the roads that change a soort — so one check
   * here covers all of them.
   *
   * The *merge base* is deliberately not filtered. A value stored under a key
   * the soort no longer has stays exactly where it is: `TypeEditor` promises
   * that a field taken away and put back brings its value with it, and a
   * retype is not a coercion either. Only what arrives is measured.
   *
   * Two writers to this column are deliberately *not* gated, and must stay
   * that way:
   *   - `writeEntryDate` (`lib/timelines/moment.ts`) writes `fields.date` with
   *     plain drizzle. It must not come through `updateEntry` at all — that is
   *     the cycle note in that file, and routing a drag through here would turn
   *     it into a voorstel for someone who may drag but not edit. What it
   *     writes is `formatWhen` output, which `parseDutchDate` reads back.
   *   - `restoreRevision` puts an old `fields` blob back wholesale. Putting a
   *     version back is meant to be exact, not corrected.
   */
  let rejectedFields: string[] = [];
  if (patch.fields !== undefined) {
    // Measured against the soort the artikel will *be*: a save that changes the
    // soort and the infobox at once is filling in the new one's fields.
    const targetTypeId =
      (patch.typeSlug !== undefined ? getEntryType(patch.typeSlug)?.id : undefined) ?? entry.typeId;
    const spec = typeFieldSpec(targetTypeId);
    const checked = checkFieldPatch(spec.defs, spec.listKeys, patch.fields);
    if (!options.live) rejectedFields = checked.rejected;
    // Nothing survived the gate: no write, no revision, no feed row. A patch of
    // pure rubbish is not an edit of this artikel.
    if (Object.keys(checked.fields).length) {
      values.fields = { ...(entry.fields ?? {}), ...checked.fields };
    }
  }
  if (patch.tags !== undefined) values.tags = normaliseTags(patch.tags);
  if (patch.coverAssetId !== undefined) values.coverAssetId = patch.coverAssetId;
  // Round 19: the bag of three, clamped; a legacy {x,y,zoom} off the wire reads as portrait.
  if (patch.coverCrop !== undefined) values.coverCrop = normaliseCrops(patch.coverCrop);
  if (patch.typeSlug !== undefined) {
    const type = getEntryType(patch.typeSlug);
    if (type) values.typeId = type.id;
  }
  for (const key of keeperOnlyKeys) {
    if (patch[key] !== undefined && user.isKeeper) values[key] = patch[key];
  }

  if (!Object.keys(values).length) {
    return {
      status: 'saved',
      entry: getEntrySummaryById(entryId)!,
      updatedBy: entry.updatedBy,
      ...(rejectedFields.length ? { rejectedFields } : {}),
    };
  }

  values.updatedAt = Math.floor(Date.now() / 1000);
  values.updatedBy = user.id;

  db.update(schema.entries).set(values).where(eq(schema.entries.id, entryId)).run();

  if (patch.body !== undefined) recomputeLinks(entryId, patch.body);
  // §27: an infobox that points at another artikel is a mention of it. Read
  // back off the merged row rather than off the patch, because §6 patches one
  // field at a time and the table has to hold what the infobox now says.
  if (values.fields !== undefined) recomputeFieldMentions(entryId);
  // §35: the infobox's date and this artikel's gebeurtenissen are one fact.
  // Editing the date here moves every tag of it on every tijdlijn, each
  // re-snapped to its own precision and re-anchored to its own axis; the
  // other direction (a tag dragged) writes this field back the same way.
  if (values.fields !== undefined) syncEventsFromEntryDate(entryId);
  if (
    patch.name !== undefined ||
    patch.shortDescription !== undefined ||
    patch.body !== undefined ||
    patch.tags !== undefined
  ) {
    reindexEntry(entryId);
  }
  writeRevision(entryId, user.id, '', writtenAs);
  logActivity({ actorId: user.id, characterId: writtenAs, verb: 'entry.edited', entryId });

  // §20: keep the room honest, and tell whoever has the page open.
  const room = `entry:${entryId}:body`;
  if (patch.body !== undefined && !options.live) resetRoom(room, patch.body);
  const changed = Object.keys(values).filter((key) => key !== 'updatedAt' && key !== 'updatedBy' && key !== 'bodyText');
  if (!options.live) {
    publishSaved(room, user.id, changed);
    // §21: the short texts are shared too; a plain write brings their room into line.
    const fields = liveFieldValues(
      { name: values.name as string | undefined, shortDescription: values.shortDescription as string | undefined },
      values.fields !== undefined ? (values.fields as Record<string, unknown>) : undefined,
    );
    if (Object.keys(fields).length) resetFieldsInRoom(entryFieldsRoomKey(entryId), fields);
  }

  return {
    status: 'saved',
    entry: getEntrySummaryById(entryId)!,
    updatedBy: entry.updatedBy,
    ...(rejectedFields.length ? { rejectedFields } : {}),
  };
}

/**
 * §21: the texts of an artikel that live in its `fields` room, in the room's
 * names: `name`, `shortDescription`, and `field.<key>` for every string-valued
 * infobox field. Only strings travel; a link or a list is not a text.
 */
export function liveFieldValues(
  texts: { name?: string; shortDescription?: string },
  fields?: Record<string, unknown>,
): Record<string, string> {
  const out: Record<string, string> = {};
  if (typeof texts.name === 'string') out.name = texts.name;
  if (typeof texts.shortDescription === 'string') out.shortDescription = texts.shortDescription;
  for (const [key, value] of Object.entries(fields ?? {})) {
    if (typeof value === 'string') out[`field.${key}`] = value;
  }
  return out;
}

/**
 * §18b: the `by` of the acts below takes either a bare account id — the old
 * shape, still what a script or a test hands it — or the session user, whose
 * onderzoeker is then recorded with the act. Nothing else changes.
 */
export type ActedBy = string | Author;
const actorId = (by: ActedBy) => (typeof by === 'string' ? by : by.id);
const actorCharacter = (by: ActedBy) => (typeof by === 'string' ? null : (by.characterId ?? null));

export function softDeleteEntry(entryId: string, by: ActedBy) {
  const userId = actorId(by);
  const characterId = actorCharacter(by);
  // §17: to the trash is an edit like any other.
  if (!viewerCanEdit('entry', entryId, viewerOf(userId))) {
    throw new Error('Je mag dit artikel niet bewerken.');
  }
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
  logActivity({ actorId: userId, characterId, verb: 'entry.deleted', entryId });
  logAudit({
    actorId: userId,
    characterId,
    action: 'entry.deleted',
    targetType: 'entry',
    targetId: entryId,
    meta: { name },
  });
}

export function restoreEntry(entryId: string, by: ActedBy) {
  const userId = actorId(by);
  const characterId = actorCharacter(by);
  db.update(schema.entries)
    .set({ deletedAt: null, updatedBy: userId })
    .where(eq(schema.entries.id, entryId))
    .run();
  reindexEntry(entryId);
  logActivity({ actorId: userId, characterId, verb: 'entry.restored', entryId });
  logAudit({
    actorId: userId,
    characterId,
    action: 'entry.restored',
    targetType: 'entry',
    targetId: entryId,
  });
}

export function restoreRevision(revisionId: string, user: Author) {
  const revision = db
    .select()
    .from(schema.entryRevisions)
    .where(eq(schema.entryRevisions.id, revisionId))
    .get();
  if (!revision) throw new Error('Versie niet gevonden');
  // §17: putting an old version back is an edit.
  if (!viewerCanEdit('entry', revision.entryId, user)) {
    throw new Error('Je mag dit artikel niet bewerken.');
  }

  /*
   * §38 gates a *patch* to `entries.fields`; this is not one. Putting an old
   * version back writes the whole blob it had, exactly as it was — including a
   * value under a key the soort has since dropped, and a value the soort has
   * since retyped. A restore that quietly corrected the version it restored
   * would not be a restore.
   */
  const snapshot = revision.snapshot as Record<string, unknown>;
  writeRevision(revision.entryId, user.id, 'voor het terugzetten', user.characterId ?? null);
  db.update(schema.entries)
    .set({
      name: snapshot.name as string,
      shortDescription: snapshot.shortDescription as string,
      body: snapshot.body,
      bodyText: (snapshot.bodyText as string) ?? docToText(snapshot.body),
      fields: (snapshot.fields as Record<string, unknown>) ?? {},
      tags: (snapshot.tags as string[]) ?? [],
      coverAssetId: (snapshot.coverAssetId as string | null) ?? null,
      coverCrop: normaliseCrops(snapshot.coverCrop),
      updatedAt: Math.floor(Date.now() / 1000),
      updatedBy: user.id,
    })
    .where(eq(schema.entries.id, revision.entryId))
    .run();
  recomputeLinks(revision.entryId, snapshot.body);
  // §27: an old version puts an old infobox back, so it puts its mentions back too.
  recomputeFieldMentions(revision.entryId);
  // §35: and its date, so the gebeurtenissen go back with it.
  syncEventsFromEntryDate(revision.entryId);
  reindexEntry(revision.entryId);
  logActivity({
    actorId: user.id,
    characterId: user.characterId ?? null,
    verb: 'entry.restored_revision',
    entryId: revision.entryId,
  });
  // §20: the shared document follows the archive, never the other way round.
  resetRoom(`entry:${revision.entryId}:body`, snapshot.body ?? null);
  resetFieldsInRoom(
    entryFieldsRoomKey(revision.entryId),
    liveFieldValues(
      { name: snapshot.name as string, shortDescription: snapshot.shortDescription as string },
      (snapshot.fields as Record<string, unknown>) ?? {},
    ),
  );
  publishSaved(`entry:${revision.entryId}:body`, user.id, ['name', 'shortDescription', 'body', 'fields', 'tags', 'coverAssetId', 'coverCrop']);
  return revision.entryId;
}

export function listRevisions(entryId: string) {
  return db
    .select({
      id: schema.entryRevisions.id,
      createdAt: schema.entryRevisions.createdAt,
      note: schema.entryRevisions.note,
      editedBy: schema.entryRevisions.editedBy,
      /** §18b: the onderzoeker who wrote it, as recorded. NULL falls back to the account's. */
      characterId: schema.entryRevisions.characterId,
      username: schema.users.username,
      isKeeper: schema.users.isKeeper,
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
  /** §18b: the onderzoeker the actor was writing as. Null for a Keeper, and for an account act. */
  characterId?: string | null;
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
      characterId: input.characterId ?? null,
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
  /** The account. §18: pages turn this into a character name with `attributed`. */
  actorId: string | null;
  actorName: string | null;
  actorIsKeeper: boolean;
  /** §18b: the onderzoeker it was written as, as recorded. NULL: before §18b. */
  characterId: string | null;
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
      actorId: schema.users.id,
      actorName: schema.users.username,
      actorIsKeeper: schema.users.isKeeper,
      writtenAs: schema.activity.characterId,
    })
    .from(schema.activity)
    .innerJoin(schema.entries, eq(schema.entries.id, schema.activity.entryId))
    .innerJoin(schema.entryTypes, eq(schema.entryTypes.id, schema.entries.typeId))
    .leftJoin(schema.users, eq(schema.users.id, schema.activity.actorId))
    // §46: the feed is a list too — a row about an artikel on the other side
    // of the archive is not shown, because the artikel itself is not.
    .where(and(visibleEntryCondition(viewer), sideCondition('entry', viewer)))
    .orderBy(desc(schema.activity.createdAt))
    .limit(limit * 3)
    .all();

  // Collapse repeated edits of the same entry by the same person.
  const seen = new Set<string>();
  const out: FeedItem[] = [];
  for (const row of rows) {
    // §18b: one account wearing two names is two people in the feed.
    const key = `${row.actorName}:${row.writtenAs ?? ''}:${row.slug}:${row.verb}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      id: row.activityId,
      verb: row.verb,
      createdAt: row.happenedAt,
      actorId: row.actorId,
      actorName: row.actorName,
      actorIsKeeper: Boolean(row.actorIsKeeper),
      characterId: row.writtenAs,
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
        viewMode: row.viewMode,
        originCaseId: row.originCaseId,
        typeCaseOnly: row.typeCaseOnly,
        createdBy: row.createdBy,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      },
    });
    if (out.length >= limit) break;
  }
  return out;
}

export function logAudit(input: {
  actorId: string | null;
  /** §18b: the onderzoeker the actor was writing as. Null for a Keeper, and for an account act. */
  characterId?: string | null;
  action: string;
  targetType?: string;
  targetId?: string;
  meta?: Record<string, unknown>;
}) {
  db.insert(schema.auditLog)
    .values({
      id: newId(),
      actorId: input.actorId,
      characterId: input.characterId ?? null,
      action: input.action,
      targetType: input.targetType ?? '',
      targetId: input.targetId ?? '',
      meta: input.meta ?? {},
    })
    .run();
}

/** A user id as a `Viewer`, with their Keeper flag looked up. */
export function viewerOf(userId: string | null): Viewer {
  if (!userId) return null;
  const row = db
    .select({ id: schema.users.id, isKeeper: schema.users.isKeeper })
    .from(schema.users)
    .where(eq(schema.users.id, userId))
    .get();
  return row ?? null;
}
