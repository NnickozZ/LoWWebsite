/**
 * §30: which soorten belong in a dossier, and in what order their tabs stand.
 *
 * A dossier's tabs used to be a report of what happened to be filed in it: one
 * tab per soort with something in it, the rest hidden. That reads backwards for
 * a fresh investigation — there is no Aanwijzingen tab until somebody has
 * already made a clue *somewhere else*, so the shelf you are supposed to fill
 * is the one shelf the file does not have.
 *
 * `cases.tab_types` fixes it without taking the old behaviour away. Null — what
 * every dossier has today, and the default for every new one — means "let the
 * tabs follow whatever is filed here", exactly as before. A list of soort slugs
 * means "these tabs are always here, empty or not", and each of them arrives
 * with the same add-box a populated tab has.
 *
 * Two things it deliberately is not. It is not a filter: any other soort with
 * something filed here keeps its tab, so nothing that has been put in a dossier
 * can be hidden by a later change of mind. And it is not a permission — the
 * Keeper's dial and the owner's dials decide what a person may see; this decides
 * only which shelves the file has.
 *
 * Pure, so `tests/unit/case-tabs.test.ts` can be the specification and the page
 * that renders the tabs and the API that writes the list agree by construction.
 */

/** One candidate tab: the soort (or the merged pair) it covers, and its weight. */
export type CaseTabSource = {
  key: string;
  /** The soorten this tab covers. "Personen" merges character and investigator. */
  typeSlugs: string[];
  /** How many artikelen of those soorten are filed in this dossier. */
  count: number;
  /** The soort's own place in Beheer → Soorten, the last word on order. */
  sortOrder: number;
};

/** A tab that survived, and whether it is here because the Keeper said so. */
export type PlannedCaseTab = { key: string; pinned: boolean };

/** Sorts after everything that has a place of its own. */
const LAST = Number.MAX_SAFE_INTEGER;

function firstIndex(haystack: readonly string[], needles: readonly string[]): number {
  let best = LAST;
  for (const needle of needles) {
    const at = haystack.indexOf(needle);
    if (at !== -1 && at < best) best = at;
  }
  return best;
}

/**
 * The tabs a dossier has, in order.
 *
 * `chosen` is `cases.tab_types`: null for "follow what is filed", or the slugs
 * the Keeper picked. `order` is the app's own preferred running order
 * (`TAB_ORDER`), which decides between soorten the Keeper has not ranked.
 *
 * Order is three questions in turn: did the Keeper put this soort in the list,
 * and where; failing that, does the app have an opinion about it; failing that,
 * where does the soort sit in Beheer → Soorten. The key breaks the last tie so
 * the answer never depends on the order the caller happened to build its
 * sources in.
 */
export function planCaseTabs(
  sources: readonly CaseTabSource[],
  chosen: readonly string[] | null,
  order: readonly string[],
): PlannedCaseTab[] {
  const list = chosen ?? null;

  const weighed = sources.map((source) => ({
    key: source.key,
    pinned: list ? source.typeSlugs.some((slug) => list.includes(slug)) : false,
    count: source.count,
    chosenAt: list ? firstIndex(list, source.typeSlugs) : LAST,
    orderAt: order.indexOf(source.key) === -1 ? LAST : order.indexOf(source.key),
    sortOrder: source.sortOrder,
  }));

  return weighed
    // Nothing filed here is ever lost: a soort the Keeper left out keeps its
    // tab as long as something of that soort is in the file.
    .filter((tab) => tab.pinned || tab.count > 0)
    .sort(
      (a, b) =>
        a.chosenAt - b.chosenAt ||
        a.orderAt - b.orderAt ||
        a.sortOrder - b.sortOrder ||
        a.key.localeCompare(b.key),
    )
    .map((tab) => ({ key: tab.key, pinned: tab.pinned }));
}

/**
 * A `tab_types` off the wire, kept to soorten that actually exist.
 *
 * An empty list is not the same thing as null and is not turned into one: null
 * is "follow what is filed", an empty list would be "no tabs at all", which is
 * a thing nobody wants — so it collapses back to null, and clearing the list in
 * the sheet and pressing Automatisch mean the same. Duplicates are dropped and
 * the Keeper's own order is kept, because that order is what `planCaseTabs`
 * reads first.
 */
export function cleanTabTypes(value: unknown, knownSlugs: readonly string[]): string[] | null {
  if (value === null || value === undefined) return null;
  if (!Array.isArray(value)) return null;
  const known = new Set(knownSlugs);
  const out: string[] = [];
  for (const item of value) {
    if (typeof item !== 'string') continue;
    if (!known.has(item) || out.includes(item)) continue;
    out.push(item);
  }
  return out.length ? out : null;
}
