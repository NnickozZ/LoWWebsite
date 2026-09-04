import { and, desc, eq, inArray } from 'drizzle-orm';
import { db, schema, sqlite } from '@/lib/db';
import type { EntrySummary } from '@/lib/entries/service';
import { visibleEntryCondition, type Viewer } from '@/lib/entries/visibility';
import { rankBy } from './fuzzy';

const SUMMARY_COLUMNS = {
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

/** Every entry the viewer may see. Capped, but far above a campaign's size. */
function visibleEntries(viewer: Viewer, typeSlug?: string): EntrySummary[] {
  return db
    .select(SUMMARY_COLUMNS)
    .from(schema.entries)
    .innerJoin(schema.entryTypes, eq(schema.entryTypes.id, schema.entries.typeId))
    .where(
      and(visibleEntryCondition(viewer), ...(typeSlug ? [eq(schema.entryTypes.slug, typeSlug)] : [])),
    )
    .orderBy(desc(schema.entries.updatedAt))
    .limit(5000)
    .all() as EntrySummary[];
}

/** Turns free text into a safe FTS5 prefix query. */
function ftsQuery(raw: string): string | null {
  const tokens = raw
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((t) => t.length >= 2)
    .slice(0, 8);
  if (!tokens.length) return null;
  return tokens.map((t) => `"${t.replace(/"/g, '')}"*`).join(' AND ');
}

const ftsSelect = sqlite.prepare<[string, number], { entry_id: string }>(
  `SELECT entry_id FROM entries_fts WHERE entries_fts MATCH ? ORDER BY rank LIMIT ?`,
);

export type SearchResults = {
  /** Name and tag matches, fuzzy and typo-tolerant. */
  names: EntrySummary[];
  /** Body-text matches that are not already above. */
  bodies: EntrySummary[];
};

export function searchEntries(
  viewer: Viewer,
  query: string,
  options: { limit?: number; typeSlug?: string } = {},
): SearchResults {
  const q = query.trim();
  if (!q) return { names: [], bodies: [] };
  const limit = options.limit ?? 20;

  const candidates = visibleEntries(viewer, options.typeSlug);
  const names = rankBy(
    candidates,
    q,
    (entry) => [entry.name, ...(entry.tags ?? [])],
    limit,
  ).map((s) => s.item);

  const alreadyShown = new Set(names.map((e) => e.id));

  let bodies: EntrySummary[] = [];
  const match = ftsQuery(q);
  if (match) {
    let ids: string[] = [];
    try {
      ids = ftsSelect.all(match, limit * 4).map((r) => r.entry_id);
    } catch {
      // A malformed FTS expression should degrade to name results, not a 500.
      ids = [];
    }
    const fresh = ids.filter((id) => !alreadyShown.has(id));
    if (fresh.length) {
      const rows = db
        .select(SUMMARY_COLUMNS)
        .from(schema.entries)
        .innerJoin(schema.entryTypes, eq(schema.entryTypes.id, schema.entries.typeId))
        .where(and(inArray(schema.entries.id, fresh), visibleEntryCondition(viewer)))
        .all() as EntrySummary[];
      const order = new Map(fresh.map((id, i) => [id, i]));
      bodies = rows
        .sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0))
        .slice(0, Math.max(0, limit - names.length) + 5);
    }
  }

  return { names, bodies };
}

/**
 * The "Did you mean…" list under the name field of the New entry sheet, and the
 * @ / [[ autocomplete. Names only, tightly ranked.
 */
export function suggestEntries(
  viewer: Viewer,
  query: string,
  options: { limit?: number; typeSlugs?: string[] } = {},
): EntrySummary[] {
  const q = query.trim();
  if (!q) return [];
  let candidates = visibleEntries(viewer);
  if (options.typeSlugs?.length) {
    const allowed = new Set(options.typeSlugs);
    candidates = candidates.filter((e) => allowed.has(e.typeSlug));
  }
  return rankBy(candidates, q, (entry) => [entry.name], options.limit ?? 5).map((s) => s.item);
}
