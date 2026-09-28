/**
 * §102 (ronde 65·b): welke vorm het skelet van een route heeft. Puur en los
 * van React, zodat een unit-test het kan vragen (`tests/unit/ronde-65-navigatie.test.ts`).
 * Het skelet zelf staat in `Skeleton.tsx`.
 */

export type SkeletonShape =
  | 'entry'
  | 'case'
  | 'list'
  | 'kamer'
  | 'winkel'
  | 'speler'
  // §102, golf h1 (T7): de tabpagina's. Een lijst van rijen (prikborden, landkaarten,
  // tijdlijnen, stambomen), de dossiers als kaarten, de hal van de spelers, en
  // de twee voordeuren (Start en de wiki): een kop en een paar blokken.
  | 'rows'
  | 'cases'
  | 'hal'
  | 'voordeur';

/**
 * Welke vorm het skelet voor dit pad heeft, of `null` als er geen skelet
 * hoort (een lijst zonder vaste vorm, een tekenvlak, Beheer). Puur, zodat
 * het te toetsen is.
 */
export function skeletonShapeFor(pathname: string): SkeletonShape | null {
  const parts = pathname.split('/').filter(Boolean);
  const [first, second, third] = parts;
  if (first === 'e' && second && !third) return 'entry';
  if (first === 'c' && second && !third) return 'case';
  // Een soort, en *Alles* (dezelfde lijst zonder soort). `/wiki` zelf is de
  // voordeur en een overzicht is een eigen pagina: die hebben geen vaste vorm.
  if (first === 'wiki' && second && !third && second !== 'overzicht') return 'list';
  if (first === 'kamer' && second && !third) return 'kamer';
  if (first === 'winkel' && !second) return 'winkel';
  if (first === 'spelers' && second && !third) return 'speler';
  // §102, golf h1 (T7): de lijsten achter de tabs, die tot nu toe 2,5 s stilstonden.
  if (!second && (first === 'boards' || first === 'maps' || first === 'timelines' || first === 'stambomen')) return 'rows';
  if (first === 'cases' && !second) return 'cases';
  if (first === 'spelers' && !second) return 'hal';
  if (!first || (first === 'wiki' && !second)) return 'voordeur';
  return null;
}

