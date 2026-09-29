/**
 * §105 (golf i1) — de greep van de peek, als rekensom.
 *
 * `CanvasPeek` volgt de duim terwijl die de greep sleept, en beslist bij het
 * loslaten wat er gebeurt. Dat besluit staat hier, zonder React en zonder DOM,
 * zodat het op één plek staat en getest kan worden
 * (`tests/unit/golf-i1-vlakken.test.ts`).
 *
 * Drie dingen, en ze zijn op alle vijf de vlakken gelijk (§69):
 *
 * - **Klein → groot** met een veeg omhoog, **groot → klein** met een veeg
 *   omlaag, en **klein → weg** met een veeg omlaag. Een tik op de greep wisselt
 *   klein en groot; dat is geen sleep en komt hier niet langs.
 * - **Een drempel of een zwiep.** Een korte, snelle veeg telt net zo goed als
 *   een lange, trage: zo doet elk blad op een telefoon het.
 * - **De duim wint van de grens.** Omlaag volgt de peek de vinger helemaal
 *   (hij schuift achter de tabbalk). Omhoog volgt hij de vinger tot de ruimte
 *   die er is, en daarboven rekt hij nog maar een vijfde mee — een rubberrand,
 *   zodat je voelt dat het niet verder gaat.
 */

export type PeekSize = 'peek' | 'full';
export type PeekRelease = 'grow' | 'shrink' | 'close' | 'stay';

/** Pixels: onder dit getal is een sleep een aarzeling, geen besluit. */
export const PEEK_DRAG_THRESHOLD = 48;
/** Pixels per milliseconde: sneller dan dit is een zwiep, ook als hij kort is. */
export const PEEK_FLICK_SPEED = 0.5;
/** Pixels: vanaf hier is een beweging van de greep een sleep en geen tik. */
export const PEEK_SLOP = 6;

/**
 * Wat er gebeurt als de duim loslaat.
 *
 * `dy` is hoe ver de vinger ging (positief is omlaag), `velocity` de snelheid
 * aan het eind, in pixels per milliseconde (positief is omlaag).
 */
export function peekRelease(size: PeekSize, dy: number, velocity = 0): PeekRelease {
  const down = dy > PEEK_DRAG_THRESHOLD || (dy > PEEK_SLOP && velocity > PEEK_FLICK_SPEED);
  const up = dy < -PEEK_DRAG_THRESHOLD || (dy < -PEEK_SLOP && velocity < -PEEK_FLICK_SPEED);
  if (size === 'peek') {
    if (up) return 'grow';
    if (down) return 'close';
    return 'stay';
  }
  if (down) return 'shrink';
  return 'stay';
}

/**
 * Waar de peek staat terwijl de duim sleept: een verschuiving in pixels
 * (positief is omlaag). `room` is hoeveel hij omhoog kan voordat hij zijn
 * grote maat bereikt (0 als hij al groot is).
 */
export function peekDragOffset(dy: number, room: number): number {
  if (dy >= 0) return dy;
  const free = Math.max(0, room);
  if (-dy <= free) return dy;
  // Voorbij de ruimte: een vijfde, en hoogstens 24 px.
  return -free - Math.min(24, (-dy - free) / 5);
}
