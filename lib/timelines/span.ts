/**
 * §94 — de tijdlijn in woorden, en een sprong naar een datum.
 *
 * Twee dingen die de review (canvas B7 en B16) aanwees en die allebei over
 * *hoeveel tijd* gaan:
 *
 * - **Het zoomgetal zei "2 %".** Op een as betekent een percentage niets
 *   herkenbaars (§69 vraag 11 koos het getal omdat de andere drie het hebben).
 *   `spanWords` zegt wat er op het glas staat: *≈ 6 maanden*, *≈ 3 dagen*.
 *   Elke stap van de zoomknoppen (×1,25) verandert de tekst, zodat de knoppen
 *   zichtbaar iets doen.
 * - **Er was geen sprong naar een jaar.** `parseGoTo` leest wat iemand typt —
 *   een jaar, een maand en een jaar, of een hele datum — en `goToView` zet de
 *   as om dat moment, op een zoom waarop die eenheid het glas vult.
 *
 * Puur, en getest in `tests/unit/ronde-55-tekenvlakken.test.ts`. De namen van
 * de eenheden staan hier en niet in `lib/words.ts`, zoals de maandnamen in
 * `lib/timelines/time.ts`: het zijn woorden van de kalender, geen woorden van
 * het archief die een Keeper hernoemt.
 */
import {
  MIN_PX_PER_SECOND,
  UNIT_SECONDS,
  maxPxPerSecond,
  parseDutchDate,
  partsToSeconds,
  type Precision,
  type Scale,
} from './time';

type Unit = { seconds: number; one: string; many: string };

const UNITS: Unit[] = [
  { seconds: 100 * UNIT_SECONDS.year, one: 'eeuw', many: 'eeuwen' },
  { seconds: UNIT_SECONDS.year, one: 'jaar', many: 'jaar' },
  { seconds: UNIT_SECONDS.month, one: 'maand', many: 'maanden' },
  { seconds: 7 * UNIT_SECONDS.day, one: 'week', many: 'weken' },
  { seconds: UNIT_SECONDS.day, one: 'dag', many: 'dagen' },
  { seconds: UNIT_SECONDS.hour, one: 'uur', many: 'uur' },
  { seconds: UNIT_SECONDS.minute, one: 'minuut', many: 'minuten' },
  { seconds: 1, one: 'seconde', many: 'seconden' },
];

function number(value: number): string {
  if (value >= 10) return String(Math.round(value));
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : String(rounded).replace('.', ',');
}

/**
 * How much time the glass shows, in words: "≈ 6 maanden". The unit is the
 * largest in which the span is at least two, so a year and a half reads as
 * "≈ 18 maanden" and not "≈ 1,5 jaar".
 */
export function spanWords(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return '—';
  const unit = UNITS.find((one) => seconds / one.seconds >= 2) ?? UNITS[UNITS.length - 1];
  const value = seconds / unit.seconds;
  return `≈ ${number(value)} ${value === 1 ? unit.one : unit.many}`;
}

/**
 * What somebody typed into "Ga naar…": `1934`, `1934-3`, `3-1934`,
 * `maart 1934`, `14 maart 1934`, `14-3-1934`. Everything `parseDutchDate`
 * reads, plus the two numeric year-and-month forms it does not.
 */
export function parseGoTo(text: string): { at: number; precision: Precision } | null {
  const raw = text.trim();
  let match: RegExpExecArray | null;
  if ((match = /^(\d{1,4})[-/.](\d{1,2})$/.exec(raw)) && Number(match[2]) >= 1 && Number(match[2]) <= 12) {
    return { at: partsToSeconds({ year: Number(match[1]), month: Number(match[2]) }), precision: 'month' };
  }
  if ((match = /^(\d{1,2})[-/.](\d{3,4})$/.exec(raw)) && Number(match[1]) >= 1 && Number(match[1]) <= 12) {
    return { at: partsToSeconds({ year: Number(match[2]), month: Number(match[1]) }), precision: 'month' };
  }
  return parseDutchDate(raw);
}

/**
 * The view that puts this moment in the middle of the glass, at the zoom where
 * its own unit — the year, the month, the day typed — takes about two thirds of
 * the width. Clamped the way `zoomAt` clamps, so a jump never lands on a zoom
 * the buttons could not reach.
 */
export function goToView(
  at: number,
  precision: Precision,
  width: number,
  scale: Scale,
): { origin: number; pxPerSecond: number } {
  const w = width > 0 ? width : 900;
  const unit = UNIT_SECONDS[precision];
  const pxPerSecond = Math.min(maxPxPerSecond(scale), Math.max(MIN_PX_PER_SECOND, w / (unit * 1.5)));
  const middle = at + unit / 2;
  return { origin: middle - w / 2 / pxPerSecond, pxPerSecond };
}
