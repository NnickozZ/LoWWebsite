import { fuzzyScore } from '@/lib/search/fuzzy';

/**
 * §94 (C4): wat er op een vlak te vinden is — een kaart, een kaartje — met de
 * naam die de lezer ziet. Puur, zodat de volgorde een unit-test is
 * (`tests/unit/ronde-55-tekenvlakken.test.ts`).
 */
export type Findable = { id: string; name: string; hint?: string; icon?: string };

/** How many rows the group shows: enough to choose from, never a second screen. */
export const FIND_LIMIT = 8;

/**
 * The things whose name matches what was typed, best first, the same fuzzy
 * reading the landkaart's legend uses. Nameless things (a bare punaise) are
 * never offered — there is nothing to find them by.
 */
export function findOnCanvas(items: Findable[], query: string, limit = FIND_LIMIT): Findable[] {
  const typed = query.trim();
  if (!typed) return [];
  return items
    .filter((item) => item.name.trim())
    .map((item, index) => ({ item, index, score: fuzzyScore(item.name, typed) }))
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, limit)
    .map((row) => row.item);
}
