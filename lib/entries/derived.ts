import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { db, schema } from '@/lib/db';
import type { FieldDef } from '@/lib/db/schema';
import { isFieldKey, type PageBlock } from '@/lib/pageBlocks';
import { entryIdsIn } from './mentions';
import { visibleEntryCondition, type Viewer } from './visibility';
import { SUMMARY_COLUMNS, type EntrySummary } from './service';

/**
 * §11's self-filling lists.
 *
 * "Leden van deze factie" is not a thing anybody types twice: it is every
 * Personage whose *Factie* field already points here. This runs that question
 * as one query, per page.
 *
 * Two things matter more than the SQL:
 *
 * 1. **It goes through `visibleEntryCondition` like everything else.** A
 *    derived list is a read of entries, so a Keeper-only member never reaches a
 *    player's page — not greyed out, not counted, not in the HTML. See rule 1
 *    in the README.
 *
 * 2. **The field key is never interpolated.** It is checked against
 *    `isFieldKey` on the way in *and* bound as a parameter, because a JSON path
 *    assembled out of a Keeper's typing is exactly the sort of thing that stops
 *    being a path.
 *
 * A pointing field is stored either as one `{ id, name, slug }` (kind
 * `entry_link`) or as an array of them (`entry_links`), and the Keeper picking
 * the block should not have to know which. So both are asked, and the `json_type`
 * guards keep `json_each` away from anything that is not an array — handed a
 * bare string it raises "malformed JSON" and takes the whole page with it.
 */
export function listDerivedEntries(
  entryId: string,
  block: PageBlock,
  viewer: Viewer,
  limit = 200,
): EntrySummary[] {
  if (block.kind !== 'derived' || !isFieldKey(block.viaField)) return [];

  const at = `$.${block.viaField}`;
  const atId = `$.${block.viaField}.id`;
  const fields = schema.entries.fields;

  const pointsHere = sql`(
    (json_type(${fields}, ${at}) = 'object' AND json_extract(${fields}, ${atId}) = ${entryId})
    OR EXISTS (
      SELECT 1 FROM json_each(
        CASE WHEN json_type(${fields}, ${at}) = 'array'
             THEN json_extract(${fields}, ${at})
             ELSE '[]' END
      ) AS je
      WHERE json_valid(je.value) AND json_extract(je.value, '$.id') = ${entryId}
    )
  )`;

  const conditions = [visibleEntryCondition(viewer), pointsHere];
  if (block.fromType?.length) {
    conditions.push(inArray(schema.entryTypes.slug, block.fromType));
  }
  // An entry that names itself would list itself; nobody means that.
  conditions.push(sql`${schema.entries.id} <> ${entryId}`);

  return db
    .select(SUMMARY_COLUMNS)
    .from(schema.entries)
    .innerJoin(schema.entryTypes, eq(schema.entryTypes.id, schema.entries.typeId))
    .where(and(...conditions))
    .orderBy(
      block.sort === 'recent'
        ? desc(schema.entries.updatedAt)
        : sql`${schema.entries.name} COLLATE NOCASE ASC`,
    )
    .limit(limit)
    .all() as EntrySummary[];
}

/**
 * The hand-filled lists, resolved for display. The values live in
 * `entries.fields` as `{ id, name, slug }` refs written by the picker, but a
 * ref is a copy: the entry may since have been renamed, deleted, or made
 * Keeper-only. So the ids are looked up afresh, through the visibility rule,
 * and the order the Keeper's players chose is put back over the result.
 */
export function listLinkedEntries(
  value: unknown,
  viewer: Viewer,
  limit = 200,
): EntrySummary[] {
  const ids: string[] = [];
  if (Array.isArray(value)) {
    for (const item of value) {
      const id = (item as { id?: unknown } | null)?.id;
      if (typeof id === 'string' && id && !ids.includes(id)) ids.push(id);
    }
  }
  if (!ids.length) return [];

  const rows = db
    .select(SUMMARY_COLUMNS)
    .from(schema.entries)
    .innerJoin(schema.entryTypes, eq(schema.entryTypes.id, schema.entries.typeId))
    .where(and(inArray(schema.entries.id, ids.slice(0, limit)), visibleEntryCondition(viewer)))
    .all() as EntrySummary[];

  const byId = new Map(rows.map((row) => [row.id, row]));
  return ids.map((id) => byId.get(id)).filter((row): row is EntrySummary => Boolean(row));
}

/* ------------------------------------------------- §67: the infobox's chips */

/** One chip, as the infobox draws it. Exactly what `EntryChip` reads. */
export type ResolvedEntryRef = {
  id: string;
  name: string;
  slug: string;
  icon: string | null;
  colour: string | null;
};

/** By id, so the two faces of the infobox can look a stored ref up in place. */
export type ResolvedEntryRefs = Record<string, ResolvedEntryRef>;

/**
 * §67 — **een chip wordt vers opgezocht.**
 *
 * An `entry_link` / `entry_links` value is stored as a `{ id, name, slug }`
 * copy of the artikel it points at, written by the picker at the moment
 * somebody chose it. `listLinkedEntries` above already says why that copy may
 * not be printed: *a ref is a copy*. Three things go wrong if it is.
 *
 *  1. A destroyed artikel leaves a chip behind for ever, linking to a slug
 *     nothing answers on.
 *  2. A renamed one keeps the name it had. The infobox then disagrees with the
 *     page it points at, and there is no way to tell which is right.
 *  3. Worst: an artikel this reader may not see is *named in their HTML* —
 *     rule 1, and the leak is the name itself. "Ouders: De ware vader" is the
 *     secret, whether or not the link is followable.
 *
 * So the page hands this map down and both faces print only what is in it. An
 * id with no entry here is not printed at all — absent, never MISSING (rule 1),
 * the same silence `buildFamilyGraph` keeps about an unseeable relative.
 *
 * One query for the whole infobox, through `visibleEntryCondition` like every
 * other read. `entry` is the artikel being drawn: its soort's field defs, its
 * stored values, and the keys of the hand-filled `links` blocks on the soort's
 * page (`listBlockKeys`), which are `entry_links` fields in all but name.
 *
 * The writing face is the *other* half of the rule, and it is not here: what a
 * reader cannot see they also cannot remove, so `updateEntry` puts the hidden
 * ids back on save. See "§67: je kunt niet weghalen wat je niet ziet" in
 * `lib/entries/service.ts`.
 */
export function resolveFieldRefs(
  entry: {
    typeFields: FieldDef[];
    fields: Record<string, unknown>;
    /** `listBlockKeys(resolveBlocks(type.blocks))` — a hand-filled list is a list of artikelen. */
    listKeys?: string[];
  },
  viewer: Viewer,
  limit = 400,
): ResolvedEntryRefs {
  const ids: string[] = [];
  const collect = (value: unknown) => {
    for (const id of entryIdsIn(value)) if (!ids.includes(id)) ids.push(id);
  };
  for (const field of entry.typeFields ?? []) {
    if (field?.kind === 'entry_link' || field?.kind === 'entry_links') collect(entry.fields?.[field.key]);
  }
  for (const key of entry.listKeys ?? []) collect(entry.fields?.[key]);
  if (!ids.length) return {};

  const rows = db
    .select({
      id: schema.entries.id,
      name: schema.entries.name,
      slug: schema.entries.slug,
      icon: schema.entryTypes.icon,
      colour: schema.entryTypes.colour,
    })
    .from(schema.entries)
    .innerJoin(schema.entryTypes, eq(schema.entryTypes.id, schema.entries.typeId))
    .where(and(inArray(schema.entries.id, ids.slice(0, limit)), visibleEntryCondition(viewer)))
    .all();

  const out: ResolvedEntryRefs = {};
  for (const row of rows) {
    out[row.id] = {
      id: row.id,
      name: row.name,
      slug: row.slug,
      icon: row.icon ?? null,
      colour: row.colour ?? null,
    };
  }
  return out;
}

/**
 * §67 — **en de kopie zelf gaat ook niet mee.**
 *
 * `resolveFieldRefs` above decides what an infobox *draws*, and that is only
 * half of rule 1. A stored `entry_link(s)` value is a `{ id, name, slug }`
 * copy, and the artikel page hands the whole `fields` object down to the client
 * component that draws both faces — so the name of an artikel this reader may
 * not see travelled to their browser in the page's own payload, printed by
 * nothing and readable by anybody who opens the source. The leak is the name,
 * whether or not a chip is drawn with it.
 *
 * So the values are cut down to what the lookup answered before they are handed
 * over: an id with no entry in `refs` is dropped, copy and all. Nothing is
 * changed in the archive — this is the shape of the *page*, and the save road
 * is `keepUnseenRefs` in `service.ts`, which puts back on the way in exactly
 * what this takes out on the way out ("je kunt niet weghalen wat je niet
 * ziet").
 *
 * The editor already sends back only the refs it drew (`resolveMany`), so this
 * changes what leaves the server and nothing else.
 */
export function scrubUnseenRefs(
  entry: {
    typeFields: FieldDef[];
    fields: Record<string, unknown>;
    /** The same hand-filled list keys `resolveFieldRefs` was given. */
    listKeys?: string[];
  },
  refs: ResolvedEntryRefs,
): Record<string, unknown> {
  const keys: string[] = [];
  for (const field of entry.typeFields ?? []) {
    if (field?.kind === 'entry_link' || field?.kind === 'entry_links') keys.push(field.key);
  }
  for (const key of entry.listKeys ?? []) if (!keys.includes(key)) keys.push(key);
  if (!keys.length) return entry.fields;

  const seen = (item: unknown) => {
    const [id] = entryIdsIn(item);
    // Not a ref at all (an empty box, a leftover string) — left exactly as it
    // is, because this function's job is names and nothing else.
    return id ? Boolean(refs[id]) : true;
  };

  let changed = false;
  const out: Record<string, unknown> = { ...entry.fields };
  for (const key of keys) {
    const value = entry.fields?.[key];
    if (value === null || value === undefined || value === '') continue;
    if (Array.isArray(value)) {
      const kept = value.filter(seen);
      if (kept.length === value.length) continue;
      out[key] = kept;
      changed = true;
    } else if (!seen(value)) {
      out[key] = null;
      changed = true;
    }
  }
  return changed ? out : entry.fields;
}
