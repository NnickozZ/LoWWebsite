/**
 * §96 (ronde 57): "de soort die je net maakte" — van het maakvak naar zijn editor.
 *
 * `NewTypeForm` weet welk id de server teruggaf; de `TypeEditor` van die soort
 * is een ander component dat pas bestaat zodra de pagina opnieuw gelezen is.
 * Welke van de twee eerst zijn effect draait, hangt af van hoe React de
 * serverrespons toepast, dus zegt het maakvak het op twee manieren: het id
 * blijft hier liggen tot een editor het ophaalt (voor een editor die daarna
 * mount), en er gaat een gebeurtenis uit (voor een editor die er al stond).
 *
 * Eén id, één keer opgehaald. Geen staat in de URL: een herlaadbeurt hoort de
 * soort niet opnieuw open te klappen.
 */

const EVENT = 'soort:nieuw';
let pending: string | null = null;

export function announceNewType(id: string): void {
  pending = id;
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(EVENT, { detail: id }));
}

/** True once, for the editor of the soort that was just made. */
export function claimNewType(id: string): boolean {
  if (pending !== id) return false;
  pending = null;
  return true;
}

export function onNewType(listener: (id: string) => void): () => void {
  const handler = (event: Event) => listener((event as CustomEvent<string>).detail);
  window.addEventListener(EVENT, handler);
  return () => window.removeEventListener(EVENT, handler);
}
