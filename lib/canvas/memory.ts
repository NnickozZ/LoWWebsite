/**
 * §94 — terug brengt je terug.
 *
 * Aan tafel is de beweging "even het artikel lezen en dan terug naar de
 * kaart". Tot deze ronde stond een tekenvlak na Terug weer op zijn begin: de
 * landkaart op "alles in beeld", geen speld gekozen, het prikbord op de
 * viewport van wie het laatst schoof. Twee dingen onthouden zich nu, op alle
 * vier de vlakken op dezelfde manier:
 *
 * - **De keuze staat in het adres.** Eén parameter per vlak — `?card=` op een
 *   prikbord, `?pin=` op een landkaart, `?event=` op een tijdlijn, `?node=` op
 *   een stamboom — geschreven met `history.replaceState` (zoals Beheer en het
 *   web: `router.replace` zou de server de hele pagina opnieuw laten tekenen
 *   voor een querystring). Terug landt op dat adres, en het vlak kiest wat erin
 *   staat.
 * - **De camera staat in `sessionStorage`**, per vlak. Per tabblad en per
 *   bezoek: een nieuwe sessie begint op een leesbaar begin (§94, C7), en een
 *   camera is nooit gedeeld (regel 20 — de stamboom hield hem sinds §66 in
 *   `localStorage`, en is hierheen verhuisd zodat er één manier is).
 *
 * De pure helften staan hier (`withChoice`, `cameraStoreKey`) en zijn getest in
 * `tests/unit/ronde-55-tekenvlakken.test.ts`; de twee die de browser aanraken
 * vangen elke fout zelf, want een privévenster zonder opslag moet nog steeds
 * een vlak laten zien.
 */

export type CanvasKind = 'board' | 'map' | 'timeline' | 'family_tree';

/** Welke parameter de keuze van een vlak draagt. */
export const CHOICE_PARAM: Record<CanvasKind, string> = {
  board: 'card',
  map: 'pin',
  timeline: 'event',
  family_tree: 'node',
};

export function cameraStoreKey(kind: CanvasKind, id: string): string {
  return `canvas:${kind}:${id}:camera`;
}

/**
 * Het adres met deze keuze erin (of eruit, bij `null`). Puur: alles behalve de
 * ene parameter blijft staan, in dezelfde volgorde, en een hash ook.
 */
export function withChoice(href: string, param: string, value: string | null): string {
  const url = new URL(href, 'http://x');
  if (value) url.searchParams.set(param, value);
  else url.searchParams.delete(param);
  const search = url.searchParams.toString();
  return `${url.pathname}${search ? `?${search}` : ''}${url.hash}`;
}

/** Schrijft de keuze in het adres, zonder navigatie en zonder serverronde. */
export function writeChoice(param: string, value: string | null): void {
  if (typeof window === 'undefined') return;
  const here = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  const next = withChoice(here, param, value);
  // `null`, not `history.state`: Next's patched `replaceState` only copies a
  // new address into its own router state when the data carries no `__NA` —
  // with it, the next render of the app router puts the old URL back.
  if (next !== here) window.history.replaceState(null, '', next);
}

/** De keuze zoals het adres hem nu draagt. */
export function readChoice(param: string): string | null {
  if (typeof window === 'undefined') return null;
  return new URLSearchParams(window.location.search).get(param);
}

export function readCamera<T>(kind: CanvasKind, id: string, valid: (value: unknown) => value is T): T | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(cameraStoreKey(kind, id));
    if (!raw) return null;
    const value: unknown = JSON.parse(raw);
    return valid(value) ? value : null;
  } catch {
    return null;
  }
}

export function writeCamera(kind: CanvasKind, id: string, value: unknown): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(cameraStoreKey(kind, id), JSON.stringify(value));
  } catch {
    /* een browser zonder opslag schuift nog steeds */
  }
}

/**
 * §94 (O1): een vlak dat je net maakte opent in Bewerken.
 *
 * De maker stuurt naar het nieuwe vlak met `?new=1` — dezelfde afspraak als
 * een artikel. `useCanvasMode` leest dat op zijn eerste render in de browser
 * en haalt het daarna uit het adres, zodat een herlaadbeurt (of later Terug)
 * weer in Lezen begint op een telefoon (§73). Het weghalen wacht één frame,
 * want op de stamboom lezen twee broers (de kop en het glas) het in dezelfde
 * commit.
 */
export const FRESH_PARAM = 'new';

export function isFreshHref(search: string): boolean {
  return new URLSearchParams(search).get(FRESH_PARAM) === '1';
}

export function freshHref(path: string): string {
  return `${path}${path.includes('?') ? '&' : '?'}${FRESH_PARAM}=1`;
}
