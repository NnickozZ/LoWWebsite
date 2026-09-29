import { fuzzyScore } from './fuzzy';

/**
 * §96/§100, aangevuld in golf J (stuk 6, raden 2): **een goede naamtreffer
 * staat bovenaan, welk soort ding het ook is.**
 *
 * Tot golf J legde zoeken de treffers in vaste vakken: eerst alle artikelen,
 * dan de andere dingen. In het palet stonden een dossier, een landkaart, een
 * tijdlijn en een stamboom daardoor altijd op plek negen, ná acht artikelen —
 * ook als die acht alleen in hun *tekst* "februari" zeiden en de tijdlijn
 * *De nacht van 9 februari* heette — en die rij hing half onder de rand van
 * de lijst. Op `/search` zette "Walcheren" de landkaart op plek 21.
 *
 * De vakken blijven (een lezer herkent ze, en specs zoeken erin), maar hun
 * **volgorde** komt nu uit de namen: elk vak weegt zo zwaar als zijn beste
 * naamtreffer, met dezelfde maat die de zoeker zelf gebruikt (`fuzzyScore`:
 * precies, begint met, een woord begint met, bevat, …). Een treffer in de
 * tekst weegt niets: een naam gaat voor een zin. Bij gelijke stand gaat het
 * andere ding voor, want er zijn er weinig en het artikel met dezelfde naam
 * staat er dan direct onder.
 *
 * Puur, zodat de regel een unit-test is (`tests/unit/golf-j2-*.test.ts`) en
 * het palet en `/search` hetzelfde antwoord geven.
 */

/**
 * Een tag die past, weegt minder dan een naam die de zoekvraag bevat: hij zegt
 * waar iets over gaat, niet hoe het heet. Zonder dit plafond zette elk artikel
 * met de tag *walcheren* zijn soort boven de landkaart *Walcheren na de Drift*.
 */
export const TAG_CEILING = 650;

/** Hoe goed een naam (of een van de tags van een artikel) bij de zoekvraag past. 0 = niet. */
export function nameScore(name: string, query: string, tags: readonly string[] = []): number {
  let best = fuzzyScore(name, query);
  for (const tag of tags) best = Math.max(best, Math.min(TAG_CEILING, fuzzyScore(tag, query)));
  return best;
}

/** De beste naamtreffer van een lijst, of 0. */
export function bestScore<T>(items: readonly T[], score: (item: T) => number): number {
  let best = 0;
  for (const item of items) best = Math.max(best, score(item));
  return best;
}

/** Gaan de andere dingen vóór de artikelen? Alleen met een echte naamtreffer. */
export function othersFirst(bestEntryName: number, bestOther: number): boolean {
  return bestOther > 0 && bestOther >= bestEntryName;
}

/**
 * Het palet heeft plek voor ongeveer negen rijen onder het zoekvak. Staan de
 * artikelen voorop en zijn er andere dingen, dan houden de artikelen er vijf,
 * zodat het eerste andere ding in beeld staat en niet half onder de rand.
 */
export const PALETTE_ENTRIES = 8;
export const PALETTE_ENTRIES_BEFORE_OTHERS = 5;
export const PALETTE_OTHERS = 6;

export type PalettePlan = {
  /** Welk vak eerst. */
  first: 'entries' | 'others';
  /** Hoeveel artikelen het palet toont. */
  entries: number;
  /** Hoeveel andere dingen. */
  others: number;
};

/** De indeling van het palet voor één antwoord. */
export function palettePlan(input: {
  entryCount: number;
  otherCount: number;
  bestEntryName: number;
  bestOther: number;
}): PalettePlan {
  const others = Math.min(PALETTE_OTHERS, input.otherCount);
  const first = othersFirst(input.bestEntryName, input.bestOther) ? 'others' : 'entries';
  const room = first === 'entries' && others > 0 ? PALETTE_ENTRIES_BEFORE_OTHERS : PALETTE_ENTRIES;
  return { first, entries: Math.min(room, input.entryCount), others };
}

/**
 * `/search`: de vakken op volgorde van hun beste naamtreffer, stabiel (bij
 * gelijke stand blijft de volgorde van de zoeker, en de andere dingen gaan dan
 * voor). Een vak zonder naamtreffer (de tekst) staat altijd onderaan.
 */
export function orderSections<T extends { key: string; best: number; other?: boolean }>(sections: readonly T[]): T[] {
  return sections
    .map((section, index) => ({ section, index }))
    .sort((a, b) => {
      if (b.section.best !== a.section.best) return b.section.best - a.section.best;
      if (Boolean(a.section.other) !== Boolean(b.section.other)) return a.section.other ? -1 : 1;
      return a.index - b.index;
    })
    .map(({ section }) => section);
}
