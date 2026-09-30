/**
 * Golf M — twee kleine rekenregels voor wat er op het glas van een tijdlijn
 * staat. Puur, zodat ze getest worden zonder component eromheen
 * (`tests/unit/golf-m-tijdlijn.test.ts`).
 */

/**
 * Golf M (C1): de volgorde waarin de tags in de DOM staan, los van de tijd.
 *
 * `events` is op tijd gesorteerd en elke stap van een sleep sorteert opnieuw.
 * Werden de tags in die volgorde getekend, dan verplaatste React een tag in de
 * DOM zodra hij een buur passeerde — en een element dat verplaatst wordt, is
 * even uit het document, dus de browser neemt de pointer capture af
 * (`lostpointercapture`). Dat las als een afgebroken sleep en de tag sprong
 * terug. Van links naar rechts gebeurde het altijd (React verplaatst dan de
 * gesleepte tag zelf), andersom alleen soms: precies wat Nick zag.
 *
 * Dus krijgt elke tag een vaste rang: wie er al was houdt de zijne, wie er
 * nieuw bij komt achteraan, in de volgorde waarin hij binnenkwam (bij het
 * openen is dat de tijd, dus de eerste tekening is dezelfde als vroeger). Wat
 * weg is, valt eruit. Geeft dezelfde `Map` terug als er niets veranderde.
 */
export function stableRanks(previous: ReadonlyMap<string, number>, ids: readonly string[]): Map<string, number> {
  const present = new Set(ids);
  let changed = ids.length !== previous.size;
  if (!changed) {
    for (const id of ids) {
      if (!previous.has(id)) {
        changed = true;
        break;
      }
    }
  }
  if (!changed) return previous as Map<string, number>;
  const next = new Map<string, number>();
  let top = -1;
  for (const [id, rank] of previous) {
    if (!present.has(id)) continue;
    next.set(id, rank);
    if (rank > top) top = rank;
  }
  for (const id of ids) {
    if (next.has(id)) continue;
    top += 1;
    next.set(id, top);
  }
  return next;
}

/** De lijst in de vaste volgorde van `ranks` (een onbekende id achteraan). */
export function inRankOrder<T>(items: readonly T[], idOf: (item: T) => string, ranks: ReadonlyMap<string, number>): T[] {
  const last = Number.MAX_SAFE_INTEGER;
  return items
    .map((item, index) => ({ item, index, rank: ranks.get(idOf(item)) ?? last }))
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .map((one) => one.item);
}

/**
 * Golf M (C2): staat het anker van een venster op het glas?
 *
 * Een uitgeklapt venster hangt in een laag buiten het afgeknipte glas, en zijn
 * `left` wordt binnen de breedte geklemd. Een venster waarvan de tag al lang
 * uit beeld was geschoven, bleef daardoor tegen de linker- of rechterrand
 * plakken, boven niets. Zo'n venster wordt niet getekend zolang zijn tag weg
 * is (hij blijft wél open, en komt terug als je terugschuift).
 *
 * `slack` is hoe ver het midden van de tag buiten de rand mag liggen: de halve
 * breedte van de tag, zodat een tag die nog half te zien is zijn venster
 * houdt — geklemd, zoals altijd.
 */
export function anchorOnGlass(x: number, width: number, slack: number): boolean {
  if (!(width > 0)) return true;
  const room = Math.max(0, slack);
  return x >= -room && x <= width + room;
}
