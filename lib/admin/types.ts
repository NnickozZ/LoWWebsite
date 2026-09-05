import { and, asc, eq, isNull } from 'drizzle-orm';
import { db, schema, sqlite } from '@/lib/db';
import { logAudit } from '@/lib/entries/service';
import { slugify } from '@/lib/slug';
import { cleanFields } from '@/lib/fieldKinds';
import { cleanBlocks, cleanTypeText, resolveBlocks, type PageBlock, type TypeText } from '@/lib/pageBlocks';
import type { FieldDef } from '@/lib/db/schema';

/**
 * §11's entry-type editor. The seed writes these rows on first start; from the
 * moment a Keeper can edit them, the seed must stop overwriting the words (see
 * `seedBaseline`), or every restart would undo their work.
 */

export type TypeRow = {
  id: string;
  slug: string;
  label: string;
  icon: string;
  colour: string;
  border: string;
  fields: FieldDef[];
  /** §11: what this soort's page is made of, already resolved for the editor. */
  blocks: PageBlock[];
  /** This soort's own wording for the few shared sentences that read badly. */
  pageText: TypeText;
  sortOrder: number;
  /** §24: this soort is only made inside a dossier. */
  caseOnly: boolean;
  /** How many entries are filed under it — a type in use should not vanish quietly. */
  entryCount: number;
};

export function listTypesForAdmin(): TypeRow[] {
  const types = db
    .select()
    .from(schema.entryTypes)
    .orderBy(asc(schema.entryTypes.sortOrder))
    .all();
  const counts = new Map<string, number>();
  for (const row of db.select({ typeId: schema.entries.typeId }).from(schema.entries).all()) {
    counts.set(row.typeId, (counts.get(row.typeId) ?? 0) + 1);
  }
  return types.map((type) => ({
    id: type.id,
    slug: type.slug,
    label: type.label,
    icon: type.icon,
    colour: type.colour,
    border: type.border,
    fields: type.fields ?? [],
    blocks: resolveBlocks(type.blocks),
    pageText: cleanTypeText(type.pageText),
    sortOrder: type.sortOrder,
    caseOnly: Boolean(type.caseOnly),
    entryCount: counts.get(type.id) ?? 0,
  }));
}

export type TypePatch = Partial<{
  /**
   * §11: the soort's address. `entry_types.id` *is* the slug (see `createType`),
   * so renaming one renames both, and everything pointing at the old value has
   * to come along — see `renameTypeSlug`.
   */
  slug: string;
  label: string;
  icon: string;
  colour: string;
  border: string;
  fields: unknown;
  blocks: unknown;
  pageText: unknown;
  sortOrder: number;
  caseOnly: boolean;
}>;

export function updateType(typeId: string, patch: TypePatch, keeperId: string) {
  const existing = db
    .select()
    .from(schema.entryTypes)
    .where(eq(schema.entryTypes.id, typeId))
    .get();
  if (!existing) throw new Error('Soort artikel niet gevonden');

  // The address first, and on its own: everything below writes to the row by
  // its id, and after a rename that id is a different string.
  let id = typeId;
  if (patch.slug !== undefined) {
    id = renameTypeSlug(typeId, patch.slug, keeperId);
  }

  const values: Record<string, unknown> = {};
  if (patch.label !== undefined && patch.label.trim()) values.label = patch.label.trim().slice(0, 60);
  if (patch.icon !== undefined && patch.icon.trim()) values.icon = patch.icon.trim();
  if (patch.colour !== undefined && /^#[0-9a-fA-F]{6}$/.test(patch.colour)) {
    values.colour = patch.colour;
  }
  if (patch.border !== undefined) values.border = patch.border;
  if (patch.fields !== undefined) values.fields = cleanFields(patch.fields);
  // §11: `cleanBlocks` is what guarantees the five built-ins are all still
  // there, so a saved page can never be one without a body to type in.
  if (patch.blocks !== undefined) values.blocks = cleanBlocks(patch.blocks);
  if (patch.pageText !== undefined) values.pageText = cleanTypeText(patch.pageText);
  if (patch.sortOrder !== undefined) values.sortOrder = patch.sortOrder;
  if (patch.caseOnly !== undefined) values.caseOnly = patch.caseOnly;
  if (!Object.keys(values).length) return;

  db.update(schema.entryTypes).set(values).where(eq(schema.entryTypes.id, id)).run();
  logAudit({
    actorId: keeperId,
    action: 'entry_type.edited',
    targetType: 'entry_type',
    targetId: id,
    meta: { slug: id, keys: Object.keys(values) },
  });
}

/** One rename at a time; see below. */
let renaming = false;

/**
 * §11: renaming a soort all the way into its address.
 *
 * `Relieken` shipped as `object` and `Voorwerpen` as `item`: the labels were
 * changed in the seed, the slugs could not be, and a Keeper had no way to fix
 * an address that no longer matches the name. This is that way.
 *
 * `entry_types.id` *is* the slug, so this is not one column but a small
 * cascade, and it runs in one transaction because a half-done rename is an
 * archive where some artikelen have a soort and some do not:
 *
 *   - `entry_types.id` and `entry_types.slug` (the row itself);
 *   - `entries.type_id`, every artikel filed under it;
 *   - `ofType` on every soort's *fields* — which artikelen an `entry_link`
 *     field may point at (`lib/fieldKinds.ts`);
 *   - `ofType` and `fromType` on every soort's *page blocks* — what a
 *     hand-filled list may hold and what a self-filling list looks through
 *     (`lib/pageBlocks.ts`).
 *
 * What it deliberately does **not** rewrite is anybody's saved URL. That is
 * what the warning above the save button is for: `/wiki/<oude-slug>` and a
 * filter link with `?type=` in it stop working, and no amount of cascading
 * inside the database can reach a link in somebody's notes.
 *
 * Returns the new id, which is what the rest of the save must write to.
 */
export function renameTypeSlug(typeId: string, wanted: string, keeperId: string): string {
  const next = slugify(wanted);
  // `slugify` never returns nothing — it falls back to `entry` — so an address
  // typed as spaces or punctuation would silently land there. Refused, unless
  // that is genuinely what was typed.
  if (!wanted.trim() || (next === 'entry' && !/^\s*entry\s*$/i.test(wanted))) {
    throw new Error('Geef de soort een adres.');
  }
  if (next === typeId) return typeId;

  const existing = db
    .select()
    .from(schema.entryTypes)
    .where(eq(schema.entryTypes.id, typeId))
    .get();
  if (!existing) throw new Error('Soort artikel niet gevonden');

  const taken = db
    .select({ id: schema.entryTypes.id })
    .from(schema.entryTypes)
    .where(eq(schema.entryTypes.slug, next))
    .get();
  if (taken) throw new Error(`Het adres “${next}” is al van een andere soort.`);

  // One rename at a time. Two of them crossing would leave the second one
  // rewriting `ofType` values the first had already moved.
  if (renaming) throw new Error('Er wordt al een adres gewijzigd. Probeer het zo opnieuw.');
  renaming = true;
  try {
    db.transaction((tx) => {
      tx.update(schema.entryTypes)
        .set({ id: next, slug: next })
        .where(eq(schema.entryTypes.id, typeId))
        .run();
      tx.update(schema.entries)
        .set({ typeId: next })
        .where(eq(schema.entries.typeId, typeId))
        .run();

      // §7: a dossier may pin its own row of tabs, and it pins them by slug.
      // A stale one would simply stop drawing a tab — quietly, which is the
      // worst way for a tab full of artikelen to go.
      for (const row of tx
        .select({ id: schema.cases.id, tabTypes: schema.cases.tabTypes })
        .from(schema.cases)
        .all()) {
        if (!row.tabTypes?.includes(typeId)) continue;
        tx.update(schema.cases)
          .set({ tabTypes: row.tabTypes.map((slug) => (slug === typeId ? next : slug)) })
          .where(eq(schema.cases.id, row.id))
          .run();
      }

      // Every soort, not only this one: an `ofType` naming this soort can sit
      // on any of them.
      for (const row of tx.select().from(schema.entryTypes).all()) {
        const fields = renameInFields(row.fields, typeId, next);
        const blocks = renameInBlocks(row.blocks, typeId, next);
        if (!fields && !blocks) continue;
        const values: { fields?: FieldDef[]; blocks?: PageBlock[] } = {};
        if (fields) values.fields = fields;
        if (blocks) values.blocks = blocks;
        tx.update(schema.entryTypes).set(values).where(eq(schema.entryTypes.id, row.id)).run();
      }
    });
  } finally {
    renaming = false;
  }

  logAudit({
    actorId: keeperId,
    action: 'entry_type.renamed',
    targetType: 'entry_type',
    targetId: next,
    meta: { from: typeId, to: next, label: existing.label },
  });
  // The seed writes the shipped soorten with `INSERT OR IGNORE` keyed on the
  // slug, so without this marker the next restart would happily insert a fresh,
  // empty `object` beside the Keeper's `relieken`. Same trick `seedBaseline`
  // uses for the words it must not overwrite.
  markSlugRenamed(typeId);
  return next;
}

/** `ofType` on this soort's fields, rewritten — or null when none of them named it. */
function renameInFields(fields: FieldDef[] | null, from: string, to: string): FieldDef[] | null {
  let touched = false;
  const next = (fields ?? []).map((field) => {
    if (!field.ofType?.includes(from)) return field;
    touched = true;
    return { ...field, ofType: field.ofType.map((slug) => (slug === from ? to : slug)) };
  });
  return touched ? next : null;
}

/** The same for a page's blocks, which point at soorten in two ways. */
function renameInBlocks(blocks: PageBlock[] | null, from: string, to: string): PageBlock[] | null {
  let touched = false;
  const next = (blocks ?? []).map((block) => {
    const out = { ...block };
    if (block.ofType?.includes(from)) {
      out.ofType = block.ofType.map((slug) => (slug === from ? to : slug));
      touched = true;
    }
    if (block.fromType?.includes(from)) {
      out.fromType = block.fromType.map((slug) => (slug === from ? to : slug));
      touched = true;
    }
    return out;
  });
  return touched ? next : null;
}

/**
 * Remembers, in the one table the seed already consults, that a shipped slug is
 * not missing but *renamed*. `seedBaseline` reads these and leaves that soort
 * alone for good.
 */
function markSlugRenamed(oldSlug: string) {
  sqlite
    .prepare('INSERT OR IGNORE INTO schema_migrations (name) VALUES (?)')
    .run(`seed:type-renamed:${oldSlug}`);
}

export function createType(
  input: { label: string; icon?: string; colour?: string; border?: string },
  keeperId: string,
): string {
  const label = input.label.trim().slice(0, 60);
  if (!label) throw new Error('Geef de soort eerst een naam.');

  const base = slugify(label) || 'soort';
  const taken = new Set(
    db
      .select({ slug: schema.entryTypes.slug })
      .from(schema.entryTypes)
      .all()
      .map((row) => row.slug),
  );
  let slug = base;
  let n = 2;
  while (taken.has(slug)) slug = `${base}-${n++}`;

  const last = db
    .select({ sortOrder: schema.entryTypes.sortOrder })
    .from(schema.entryTypes)
    .orderBy(asc(schema.entryTypes.sortOrder))
    .all()
    .at(-1);

  db.insert(schema.entryTypes)
    .values({
      id: slug,
      slug,
      label,
      icon: input.icon?.trim() || 'file',
      colour: /^#[0-9a-fA-F]{6}$/.test(input.colour ?? '') ? input.colour! : '#5C544A',
      border: input.border || 'plain',
      fields: [],
      blocks: [],
      pageText: {},
      sortOrder: (last?.sortOrder ?? 0) + 10,
    })
    .run();

  logAudit({
    actorId: keeperId,
    action: 'entry_type.created',
    targetType: 'entry_type',
    targetId: slug,
    meta: { label },
  });
  return slug;
}

/**
 * §24: the loose ends. Every artikel of a `case_only` soort that is in no
 * dossier at all.
 *
 * A clue is *found*, during an investigation, so one with no investigation
 * behind it is a row nobody can explain — it happens anyway: the last dossier
 * holding it is emptied, or a dossier is destroyed from the bin and its
 * artikelen survive it (rule 21). The wiki marks each one where it lists it;
 * this is the same set gathered in one place, so a Keeper can file them again
 * instead of finding them one at a time.
 *
 * Keeper-only, like everything else on this page, so it is deliberately not
 * behind `visibleEntryCondition`: a Keeper sees the whole archive by that rule
 * anyway, and this list would be a lie if it left anything out.
 */
export type AdriftEntry = { id: string; slug: string; name: string; typeLabel: string };

export function listAdriftEntries(limit = 200): AdriftEntry[] {
  return db
    .select({
      id: schema.entries.id,
      slug: schema.entries.slug,
      name: schema.entries.name,
      typeLabel: schema.entryTypes.label,
    })
    .from(schema.entries)
    .innerJoin(schema.entryTypes, eq(schema.entryTypes.id, schema.entries.typeId))
    .where(
      and(
        eq(schema.entryTypes.caseOnly, true),
        isNull(schema.entries.originCaseId),
        isNull(schema.entries.deletedAt),
      ),
    )
    .orderBy(asc(schema.entries.name))
    .limit(limit)
    .all();
}

/**
 * A type with entries filed under it cannot be removed — the entries would have
 * nothing to be. §16 says fewer options, so there is no "move them all" flow:
 * refile them first, and the button says so.
 */
export function deleteType(typeId: string, keeperId: string) {
  const inUse = db.select().from(schema.entries).where(eq(schema.entries.typeId, typeId)).all();
  if (inUse.length) throw new Error('Er staan nog artikelen onder deze soort.');
  db.delete(schema.entryTypes).where(eq(schema.entryTypes.id, typeId)).run();
  logAudit({
    actorId: keeperId,
    action: 'entry_type.deleted',
    targetType: 'entry_type',
    targetId: typeId,
  });
}
