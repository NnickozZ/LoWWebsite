import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { db, schema } from '@/lib/db';
import { isFieldKey, type PageBlock } from '@/lib/pageBlocks';
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
