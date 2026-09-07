import { and, desc, eq, inArray } from 'drizzle-orm';
import { db, schema, sqlite } from '@/lib/db';
import { nameTheirCases, type EntrySummary } from '@/lib/entries/service';
import { visibleEntryCondition, type Viewer } from '@/lib/entries/visibility';
import { visibleCaseCondition } from '@/lib/cases/visibility';
import { sideCondition } from '@/lib/keeper/side';
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
  originCaseId: schema.entries.originCaseId,
  // §24: so a search result can carry the "Zonder dossier" chip too.
  typeCaseOnly: schema.entryTypes.caseOnly,
  updatedAt: schema.entries.updatedAt,
} as const;

/**
 * Every entry the viewer may see. Capped, but far above a campaign's size.
 *
 * §46: `sided` says whether this read is a *list* — Zoeken, which shows the
 * side the reader is standing on — or a picker. `suggestEntries` feeds the @ /
 * [[ autocomplete and the "did you mean" row, and those keep offering
 * everything the Keeper may see: a rope, a mention or a speld is made across
 * the two sides on purpose.
 */
function visibleEntries(viewer: Viewer, typeSlug?: string, sided = false): EntrySummary[] {
  return db
    .select(SUMMARY_COLUMNS)
    .from(schema.entries)
    .innerJoin(schema.entryTypes, eq(schema.entryTypes.id, schema.entries.typeId))
    .where(
      and(
        visibleEntryCondition(viewer),
        ...(sided ? [sideCondition('entry', viewer)] : []),
        ...(typeSlug ? [eq(schema.entryTypes.slug, typeSlug)] : []),
      ),
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

  const candidates = visibleEntries(viewer, options.typeSlug, true);
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
      // The chosen soort narrows the text matches too, not only the names.
      const rows = db
        .select(SUMMARY_COLUMNS)
        .from(schema.entries)
        .innerJoin(schema.entryTypes, eq(schema.entryTypes.id, schema.entries.typeId))
        .where(
          and(
            inArray(schema.entries.id, fresh),
            visibleEntryCondition(viewer),
            // §46: the text matches are the same list, read from the same side.
            sideCondition('entry', viewer),
            ...(options.typeSlug ? [eq(schema.entryTypes.slug, options.typeSlug)] : []),
          ),
        )
        .all() as EntrySummary[];
      const order = new Map(fresh.map((id, i) => [id, i]));
      bodies = rows
        .sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0))
        .slice(0, Math.max(0, limit - names.length) + 5);
    }
  }

  // §24: with the dossier each case-bound artikel was made in, so two clues
  // called "de brief" can be told apart in a list of results.
  return { names: nameTheirCases(names, viewer), bodies: nameTheirCases(bodies, viewer) };
}

/**
 * §31: the artikelen filed in these dossiers.
 *
 * Rule 1 runs through the middle of this. The ids arrive from a browser, so
 * they are put through `visibleCaseCondition` before anything is looked up in
 * them: a dossier this viewer may not open contributes nothing, and the shape
 * of the answer never tells them whether that dossier exists or what is in it.
 * What comes back is only ever used as an `ORDER BY` over rows that were
 * already visible — never as a wider `WHERE`.
 */
function entriesFiledIn(caseIds: readonly string[], viewer: Viewer): Set<string> {
  if (!caseIds.length) return new Set();

  const mayOpen = db
    .select({ id: schema.cases.id })
    .from(schema.cases)
    .where(and(inArray(schema.cases.id, [...caseIds]), visibleCaseCondition(viewer)))
    .all()
    .map((row) => row.id);
  if (!mayOpen.length) return new Set();

  return new Set(
    db
      .select({ entryId: schema.caseEntries.entryId })
      .from(schema.caseEntries)
      .where(inArray(schema.caseEntries.caseId, mayOpen))
      .all()
      .map((row) => row.entryId),
  );
}

/**
 * A suggestion, plus the one thing the list itself has to say about it: §31,
 * this one is already in the dossier you are writing in. It is a decoration on
 * a row that was going to be there anyway, which is why it lives here and not
 * on `EntrySummary` — nothing in the archive is filed under it.
 */
export type Suggestion = EntrySummary & { inPreferredCase?: boolean };

/**
 * The "Did you mean…" list under the name field of the New entry sheet, and the
 * @ / [[ autocomplete. Names only, tightly ranked.
 *
 * §31: `preferCaseIds` are the dossiers the person is writing inside. Anything
 * filed in one of them sorts above everything else and the rest of the ranking
 * is unchanged underneath, because in an investigation the thing you are about
 * to name is nearly always something already on this desk. It is an order, not
 * a filter: nothing is added to the list and nothing is taken out of it.
 */
export function suggestEntries(
  viewer: Viewer,
  query: string,
  options: { limit?: number; typeSlugs?: string[]; preferCaseIds?: string[] } = {},
): Suggestion[] {
  const q = query.trim();
  if (!q) return [];
  let candidates = visibleEntries(viewer);
  if (options.typeSlugs?.length) {
    const allowed = new Set(options.typeSlugs);
    candidates = candidates.filter((e) => allowed.has(e.typeSlug));
  }

  const limit = options.limit ?? 5;
  const preferred = entriesFiledIn(options.preferCaseIds ?? [], viewer);

  /*
   * With a boost in play the ranking is done wider than the list is long and
   * cut afterwards. Ranking to `limit` first and lifting second would drop a
   * match from this very dossier that happened to sit seventh, which is the
   * one row this whole feature exists to put on top.
   */
  const ranked = rankBy(
    candidates,
    q,
    (entry) => [entry.name],
    preferred.size ? Math.max(limit * 5, 40) : limit,
  );

  const ordered = preferred.size
    ? [
        ...ranked.filter((s) => preferred.has(s.item.id)),
        ...ranked.filter((s) => !preferred.has(s.item.id)),
      ]
    : ranked;

  const named = nameTheirCases(
    ordered.slice(0, limit).map((s) => s.item),
    viewer,
  );
  return named.map((entry) => ({ ...entry, inPreferredCase: preferred.has(entry.id) }));
}
