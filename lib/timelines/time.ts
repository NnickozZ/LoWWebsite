/**
 * §32: time, as a tijdlijn measures it.
 *
 * Pure — no database, no React — so `tests/unit/timeline-time.test.ts` can
 * pin every rule here down, and so the browser and the server read a date the
 * same way.
 *
 * A moment on a tijdlijn is stored as one integer: seconds since 1970 in a
 * proleptic Gregorian calendar with no time zone. The archive is fiction set
 * in the 1930s, so most of those integers are negative, which SQLite and
 * JavaScript both take in their stride; what matters is that "12 March 1931"
 * sorts before "13 March 1931" without anybody parsing a string. Beside the
 * integer sits a *precision*: how much of the moment is actually known.
 * "1931" and "12 March 1931, 14:30" are both stored as an integer at the
 * start of what they name, and the precision is what stops the first one
 * printing as "1 January 1931, 00:00".
 *
 * A tijdlijn has a *scale* — jaren, maanden, dagen, uren, minuten, seconden —
 * which is the Keeper's answer to "how is this measured?". It decides which
 * boxes the date form offers (a tijdlijn of a single night asks for hours and
 * minutes; a tijdlijn of the island's history asks for the year and stops),
 * how the axis is ruled, and the finest precision an event on it can claim.
 */

export type Scale = 'year' | 'month' | 'day' | 'hour' | 'minute' | 'second';
export type Precision = Scale;

export const SCALES: Scale[] = ['year', 'month', 'day', 'hour', 'minute', 'second'];

export const SCALE_LABELS: Record<Scale, string> = {
  year: 'Jaren',
  month: 'Maanden',
  day: 'Dagen',
  hour: 'Uren',
  minute: 'Minuten',
  second: 'Seconden',
};

/** What a person is asked for on a tijdlijn of this scale, in words. */
export const SCALE_HINTS: Record<Scale, string> = {
  year: 'Alleen het jaar telt. Voor de geschiedenis van het eiland.',
  month: 'Jaar en maand. Voor wat zich over seizoenen afspeelt.',
  day: 'Tot op de dag. Het gewone geval: een onderzoek van weken.',
  hour: 'Tot op het uur. Eén dag, één nacht.',
  minute: 'Tot op de minuut. Een avond in het pakhuis.',
  second: 'Tot op de seconde. De laatste twee minuten.',
};

export function isScale(value: unknown): value is Scale {
  return typeof value === 'string' && (SCALES as string[]).includes(value);
}

const RANK: Record<Scale, number> = { year: 0, month: 1, day: 2, hour: 3, minute: 4, second: 5 };

/** True when `a` is at least as fine as `b`. */
export function atLeastAsFine(a: Scale, b: Scale): boolean {
  return RANK[a] >= RANK[b];
}

/** An event is never known more precisely than its tijdlijn measures. */
export function clampPrecision(precision: Precision, scale: Scale): Precision {
  return RANK[precision] > RANK[scale] ? scale : precision;
}

/* ---------------------------------------------------------------- parts */

export type TimeParts = {
  year: number;
  /** 1–12 */
  month: number;
  /** 1–31 */
  day: number;
  hour: number;
  minute: number;
  second: number;
};

const START: TimeParts = { year: 1930, month: 1, day: 1, hour: 0, minute: 0, second: 0 };

/**
 * The integer for these parts. Missing parts are the start of the unit above
 * them (a year alone is 1 January, 00:00:00), which is what makes `precision`
 * enough to print a moment the way it was typed. Built through
 * `setUTCFullYear` rather than `Date.UTC`, because the latter reads a year
 * under 100 as 19xx — and nobody wants a tijdlijn of the year 33 to open in
 * 1933.
 */
export function partsToSeconds(parts: Partial<TimeParts>): number {
  const year = Number.isFinite(parts.year) ? Math.trunc(parts.year as number) : START.year;
  const month = clamp(parts.month, 1, 12, 1);
  const day = clamp(parts.day, 1, 31, 1);
  const hour = clamp(parts.hour, 0, 23, 0);
  const minute = clamp(parts.minute, 0, 59, 0);
  const second = clamp(parts.second, 0, 59, 0);
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, 1);
  date.setUTCHours(hour, minute, second, 0);
  // A 31st on a month that has no 31st rolls over in JavaScript; keep it in
  // the month that was asked for instead, on that month's last day.
  const lastDay = daysInMonth(year, month);
  date.setUTCDate(Math.min(day, lastDay));
  return Math.floor(date.getTime() / 1000);
}

function clamp(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(value)));
}

export function daysInMonth(year: number, month: number): number {
  const date = new Date(0);
  date.setUTCFullYear(year, month, 0);
  return date.getUTCDate();
}

export function secondsToParts(at: number): TimeParts {
  const date = new Date(at * 1000);
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
    hour: date.getUTCHours(),
    minute: date.getUTCMinutes(),
    second: date.getUTCSeconds(),
  };
}

/** The same moment, cut back to the start of the unit named. */
export function floorTo(at: number, unit: Scale): number {
  const p = secondsToParts(at);
  switch (unit) {
    case 'year':
      return partsToSeconds({ year: p.year });
    case 'month':
      return partsToSeconds({ year: p.year, month: p.month });
    case 'day':
      return partsToSeconds({ year: p.year, month: p.month, day: p.day });
    case 'hour':
      return partsToSeconds({ ...p, minute: 0, second: 0 });
    case 'minute':
      return partsToSeconds({ ...p, second: 0 });
    default:
      return at;
  }
}

/** Exact seconds per unit, for the units that have one. */
const UNIT_STEP: Record<'day' | 'hour' | 'minute' | 'second', number> = {
  day: 86400,
  hour: 3600,
  minute: 60,
  second: 1,
};

/**
 * The same moment, `n` units later (or earlier, for a negative `n`) — the
 * calendar's step, not a multiplication: a month after 31 January is the last
 * day of February, and a year after 29 February 1932 is 28 February 1933,
 * because `partsToSeconds` keeps a day inside the month that was asked for.
 * Days and finer are plain seconds: the archive's clock is UTC with no
 * daylight saving, so an hour is always an hour.
 */
export function addUnits(at: number, unit: Scale, n: number): number {
  if (!Number.isFinite(n) || n === 0) return at;
  const step = Math.trunc(n);
  const p = secondsToParts(at);
  switch (unit) {
    case 'year':
      return partsToSeconds({ ...p, year: p.year + step });
    case 'month': {
      const total = p.year * 12 + (p.month - 1) + step;
      const year = Math.floor(total / 12);
      return partsToSeconds({ ...p, year, month: total - year * 12 + 1 });
    }
    default:
      return at + step * UNIT_STEP[unit];
  }
}

/**
 * The *nearest* boundary of the unit — what a dragged gebeurtenis lands on.
 * `floorTo` is for ruling the axis (a tick is the start of its unit); this is
 * for a hand that let go halfway through a day and meant one of the two. The
 * midpoint rounds up, so half a day past noon is tomorrow.
 */
export function snapTo(at: number, unit: Scale): number {
  if (unit === 'second') return Math.round(at);
  const lo = floorTo(at, unit);
  const hi = addUnits(lo, unit, 1);
  return at - lo >= hi - at ? hi : lo;
}

/* ------------------------------------------------------------ the anchor */

/**
 * §35: a zoomed-in tijdlijn may say which day (or month, or year) it is *of* —
 * "deze tijdlijn speelt op 3 oktober 1931". The anchor is one moment plus the
 * unit it is known to, and it must be *coarser* than the tijdlijn's own scale:
 * a tijdlijn measured in minutes can be a day, a tijdlijn measured in days
 * cannot be (it would have nothing left to measure).
 *
 * What it does is small and total: every moment on the axis has its components
 * from the year down to the anchor's unit overwritten with the anchor's, so a
 * new gebeurtenis needs only its hour and minute, and neither a drag nor a
 * double-click can leave the day.
 */
export type AnchorUnit = 'year' | 'month' | 'day';

export const ANCHOR_UNITS: AnchorUnit[] = ['year', 'month', 'day'];

export const ANCHOR_UNIT_LABELS: Record<AnchorUnit, string> = {
  year: 'Een jaar',
  month: 'Een maand',
  day: 'Eén dag',
};

export function isAnchorUnit(value: unknown): value is AnchorUnit {
  return typeof value === 'string' && (ANCHOR_UNITS as string[]).includes(value);
}

/** May a tijdlijn measured like this be anchored at all, and to which units? */
export function anchorUnitsFor(scale: Scale): AnchorUnit[] {
  return ANCHOR_UNITS.filter((unit) => RANK[unit] < RANK[scale]);
}

/** The components the anchor fixes: the year, down to its own unit. */
export function anchorParts(anchorAt: number, anchorUnit: AnchorUnit): Partial<TimeParts> {
  const p = secondsToParts(anchorAt);
  if (anchorUnit === 'year') return { year: p.year };
  if (anchorUnit === 'month') return { year: p.year, month: p.month };
  return { year: p.year, month: p.month, day: p.day };
}

/**
 * The moment `at`, moved onto the anchor's day (or month, or year): everything
 * from the year down to the anchor's unit is the anchor's, everything finer is
 * kept. "14:30, whenever" on a 3 October 1931 tijdlijn is 3 October 1931,
 * 14:30 — which is the whole of the auto-fill.
 */
export function applyAnchor(at: number, anchorAt: number | null, anchorUnit: AnchorUnit | null): number {
  if (anchorAt === null || anchorUnit === null) return at;
  return partsToSeconds({ ...secondsToParts(at), ...anchorParts(anchorAt, anchorUnit) });
}

/** The stretch of time an anchored tijdlijn is allowed to show: its own unit, once. */
export function anchorSpan(anchorAt: number, anchorUnit: AnchorUnit): { from: number; to: number } {
  const from = floorTo(anchorAt, anchorUnit);
  return { from, to: addUnits(from, anchorUnit, 1) };
}

/**
 * A moment held inside the anchor's span, still on a boundary of `unit`. The
 * last moment of the span is the start of its last whole `unit`, never the
 * first second of the next day.
 */
export function clampToAnchor(at: number, unit: Scale, anchorAt: number | null, anchorUnit: AnchorUnit | null): number {
  if (anchorAt === null || anchorUnit === null) return at;
  const { from, to } = anchorSpan(anchorAt, anchorUnit);
  if (at < from) return from;
  if (at >= to) return floorTo(to - 1, unit);
  return at;
}

/* ------------------------------------------------------------- printing */

export const MONTHS_NL = [
  'januari',
  'februari',
  'maart',
  'april',
  'mei',
  'juni',
  'juli',
  'augustus',
  'september',
  'oktober',
  'november',
  'december',
];
export const MONTHS_NL_SHORT = ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];

const two = (n: number) => String(n).padStart(2, '0');

/**
 * The moment, printed to its precision: "1931", "maart 1931", "12 maart
 * 1931", "12 maart 1931, 14:00", "…, 14:30", "…, 14:30:05". What is not known
 * is not printed — the same sentence §22 writes for an empty field.
 */
export function formatWhen(at: number, precision: Precision): string {
  const p = secondsToParts(at);
  const year = String(p.year);
  switch (precision) {
    case 'year':
      return year;
    case 'month':
      return `${MONTHS_NL[p.month - 1]} ${year}`;
    case 'day':
      return `${p.day} ${MONTHS_NL[p.month - 1]} ${year}`;
    case 'hour':
      return `${p.day} ${MONTHS_NL[p.month - 1]} ${year}, ${two(p.hour)}:00`;
    case 'minute':
      return `${p.day} ${MONTHS_NL[p.month - 1]} ${year}, ${two(p.hour)}:${two(p.minute)}`;
    default:
      return `${p.day} ${MONTHS_NL[p.month - 1]} ${year}, ${two(p.hour)}:${two(p.minute)}:${two(p.second)}`;
  }
}

/**
 * Reads a date the way people type one in an infobox — "14 oktober 1934",
 * "oktober 1934", "1934", "14-10-1934", "1934-10-14", with an optional
 * "14:30" or "14:30:05" after it — and says how much of it was there. For
 * prefilling a tijdlijn from an artikel's `date` field; a text this cannot
 * read is simply not a date, and the form starts empty.
 */
export function parseDutchDate(text: string): { at: number; precision: Precision } | null {
  const raw = text.trim().toLowerCase().replace(/,/g, ' ').replace(/\s+/g, ' ');
  if (!raw) return null;

  let precision: Precision = 'year';
  const parts: Partial<TimeParts> = {};

  // A time at the end, in any of the three forms.
  const time = /(?:^|\s)(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(?:uur)?$/.exec(raw);
  const body = time ? raw.slice(0, time.index).trim() : raw;

  let match: RegExpExecArray | null;
  if ((match = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(body))) {
    parts.year = Number(match[1]);
    parts.month = Number(match[2]);
    parts.day = Number(match[3]);
    precision = 'day';
  } else if ((match = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/.exec(body))) {
    parts.day = Number(match[1]);
    parts.month = Number(match[2]);
    parts.year = Number(match[3]);
    precision = 'day';
  } else if ((match = /^(\d{1,2})\s+([a-z]+)\.?\s+(\d{1,4})$/.exec(body))) {
    const month = monthIndex(match[2]);
    if (month < 0) return null;
    parts.day = Number(match[1]);
    parts.month = month + 1;
    parts.year = Number(match[3]);
    precision = 'day';
  } else if ((match = /^([a-z]+)\.?\s+(\d{1,4})$/.exec(body))) {
    const month = monthIndex(match[1]);
    if (month < 0) return null;
    parts.month = month + 1;
    parts.year = Number(match[2]);
    precision = 'month';
  } else if ((match = /^(\d{1,4})$/.exec(body))) {
    parts.year = Number(match[1]);
    precision = 'year';
  } else {
    return null;
  }

  if (time && precision === 'day') {
    parts.hour = Number(time[1]);
    parts.minute = Number(time[2]);
    precision = 'minute';
    if (time[3] !== undefined) {
      parts.second = Number(time[3]);
      precision = 'second';
    }
  }
  if (parts.month !== undefined && (parts.month < 1 || parts.month > 12)) return null;
  if (parts.day !== undefined && (parts.day < 1 || parts.day > 31)) return null;
  return { at: partsToSeconds(parts), precision };
}

function monthIndex(word: string): number {
  const full = MONTHS_NL.indexOf(word);
  if (full >= 0) return full;
  const short = MONTHS_NL_SHORT.indexOf(word.slice(0, 3));
  if (short >= 0 && word.length <= 4) return short;
  return -1;
}

/* ---------------------------------------------------------------- the axis */

const SECOND = 1;
const MINUTE = 60;
const HOUR = 3600;
const DAY = 86400;

/** A rough length for each unit — for choosing a zoom, never for placing a tick. */
export const UNIT_SECONDS: Record<Scale, number> = {
  year: 365.25 * DAY,
  month: 30.44 * DAY,
  day: DAY,
  hour: HOUR,
  minute: MINUTE,
  second: SECOND,
};

export type Step = { unit: Scale; count: number };

/**
 * The ladder of rulings an axis can be divided by, finest first. Which rungs
 * are allowed depends on the scale: a tijdlijn measured in days is never ruled
 * in hours, however far somebody zooms in.
 */
const LADDER: Step[] = [
  { unit: 'second', count: 1 },
  { unit: 'second', count: 5 },
  { unit: 'second', count: 15 },
  { unit: 'second', count: 30 },
  { unit: 'minute', count: 1 },
  { unit: 'minute', count: 5 },
  { unit: 'minute', count: 15 },
  { unit: 'minute', count: 30 },
  { unit: 'hour', count: 1 },
  { unit: 'hour', count: 3 },
  { unit: 'hour', count: 6 },
  { unit: 'hour', count: 12 },
  { unit: 'day', count: 1 },
  { unit: 'day', count: 2 },
  { unit: 'day', count: 7 },
  { unit: 'month', count: 1 },
  { unit: 'month', count: 3 },
  { unit: 'month', count: 6 },
  { unit: 'year', count: 1 },
  { unit: 'year', count: 2 },
  { unit: 'year', count: 5 },
  { unit: 'year', count: 10 },
  { unit: 'year', count: 25 },
  { unit: 'year', count: 50 },
  { unit: 'year', count: 100 },
  { unit: 'year', count: 250 },
  { unit: 'year', count: 500 },
  { unit: 'year', count: 1000 },
];

export function stepSeconds(step: Step): number {
  return UNIT_SECONDS[step.unit] * step.count;
}

/**
 * The coarsest ruling that still leaves at least `minPx` between two ticks,
 * never finer than the scale allows. Zoomed out past the top of the ladder
 * the thousand-year rung is what there is.
 */
export function chooseStep(scale: Scale, pxPerSecond: number, minPx = 90): Step {
  const allowed = LADDER.filter((step) => RANK[step.unit] <= RANK[scale]);
  for (const step of allowed) {
    if (stepSeconds(step) * pxPerSecond >= minPx) return step;
  }
  return allowed[allowed.length - 1];
}

export type Tick = { at: number; label: string; major: boolean };

/** The first tick at or before `from`, aligned to the calendar. */
function alignStart(from: number, step: Step): number {
  const p = secondsToParts(from);
  switch (step.unit) {
    case 'year':
      return partsToSeconds({ year: Math.floor(p.year / step.count) * step.count });
    case 'month': {
      const month = Math.floor((p.month - 1) / step.count) * step.count + 1;
      return partsToSeconds({ year: p.year, month });
    }
    case 'day': {
      // Days and finer are ruled from the start of the month, so "every 7
      // days" reads 1, 8, 15, 22, 29 rather than drifting across months.
      const day = Math.floor((p.day - 1) / step.count) * step.count + 1;
      return partsToSeconds({ year: p.year, month: p.month, day });
    }
    case 'hour':
      return partsToSeconds({ ...p, hour: Math.floor(p.hour / step.count) * step.count, minute: 0, second: 0 });
    case 'minute':
      return partsToSeconds({ ...p, minute: Math.floor(p.minute / step.count) * step.count, second: 0 });
    default:
      return partsToSeconds({ ...p, second: Math.floor(p.second / step.count) * step.count });
  }
}

function next(at: number, step: Step): number {
  const p = secondsToParts(at);
  switch (step.unit) {
    case 'year':
      return partsToSeconds({ year: p.year + step.count });
    case 'month': {
      const total = p.month - 1 + step.count;
      return partsToSeconds({ year: p.year + Math.floor(total / 12), month: (total % 12) + 1 });
    }
    case 'day': {
      const day = p.day + step.count;
      // Past the end of the month, start the next month at 1 — see alignStart.
      if (day > daysInMonth(p.year, p.month)) {
        const total = p.month; // month index of the next month, 0-based
        return partsToSeconds({ year: p.year + Math.floor(total / 12), month: (total % 12) + 1, day: 1 });
      }
      return partsToSeconds({ year: p.year, month: p.month, day });
    }
    default:
      return at + stepSeconds(step);
  }
}

/** What a tick says. A larger boundary is spelled out and marked major. */
function labelFor(at: number, step: Step): { label: string; major: boolean } {
  const p = secondsToParts(at);
  switch (step.unit) {
    case 'year':
      return { label: String(p.year), major: step.count >= 10 ? p.year % (step.count * 5) === 0 : p.year % 10 === 0 };
    case 'month':
      return p.month === 1
        ? { label: String(p.year), major: true }
        : { label: MONTHS_NL_SHORT[p.month - 1], major: false };
    case 'day':
      return p.day === 1
        ? { label: `${MONTHS_NL_SHORT[p.month - 1]} ${p.year}`, major: true }
        : { label: `${p.day} ${MONTHS_NL_SHORT[p.month - 1]}`, major: false };
    case 'hour':
      return p.hour === 0
        ? { label: `${p.day} ${MONTHS_NL_SHORT[p.month - 1]}`, major: true }
        : { label: `${two(p.hour)}:00`, major: false };
    case 'minute':
      return p.minute === 0 && p.hour === 0
        ? { label: `${p.day} ${MONTHS_NL_SHORT[p.month - 1]}`, major: true }
        : { label: `${two(p.hour)}:${two(p.minute)}`, major: p.minute === 0 };
    default:
      return p.second === 0
        ? { label: `${two(p.hour)}:${two(p.minute)}`, major: true }
        : { label: `${two(p.hour)}:${two(p.minute)}:${two(p.second)}`, major: false };
  }
}

/**
 * The ticks between two moments at this zoom. Bounded to a few hundred, so a
 * viewport that asks for a thousand years of seconds gets a coarser ruling
 * rather than a frozen tab.
 */
export function ticksBetween(from: number, to: number, scale: Scale, pxPerSecond: number, minPx = 90): Tick[] {
  if (!(to > from) || !(pxPerSecond > 0)) return [];
  const step = chooseStep(scale, pxPerSecond, minPx);
  const out: Tick[] = [];
  let at = alignStart(from, step);
  let guard = 0;
  while (at <= to && guard++ < 400) {
    if (at >= from) out.push({ at, ...labelFor(at, step) });
    const following = next(at, step);
    if (following <= at) break;
    at = following;
  }
  return out;
}

/* --------------------------------------------------------------- the view */

/** How many seconds an empty tijdlijn of this scale shows across its width. */
export function defaultSpan(scale: Scale): number {
  switch (scale) {
    case 'year':
      return 50 * UNIT_SECONDS.year;
    case 'month':
      return 3 * UNIT_SECONDS.year;
    case 'day':
      return 60 * DAY;
    case 'hour':
      return 2 * DAY;
    case 'minute':
      return 3 * HOUR;
    default:
      return 5 * MINUTE;
  }
}

/** The finest zoom worth offering: about 200 px per unit of the scale. */
export function maxPxPerSecond(scale: Scale): number {
  return 200 / UNIT_SECONDS[scale];
}

/** And the coarsest: a thousand years across a thousand pixels. */
export const MIN_PX_PER_SECOND = 1000 / (1000 * UNIT_SECONDS.year);

/**
 * A view that shows every moment given, with a margin, in a viewport this
 * wide. With nothing to show it opens on 1930 (or whatever `centre` says) at
 * the scale's default span.
 */
export function fitView(
  moments: number[],
  width: number,
  scale: Scale,
  centre = partsToSeconds(START),
): { origin: number; pxPerSecond: number } {
  const w = Math.max(200, width);
  if (!moments.length) {
    const span = defaultSpan(scale);
    return { origin: centre - span / 2, pxPerSecond: w / span };
  }
  const min = Math.min(...moments);
  const max = Math.max(...moments);
  // One moment, or all on one moment: show it in the middle of a default span.
  let span = max - min;
  if (span < UNIT_SECONDS[scale] * 2) span = Math.max(span, defaultSpan(scale) / 4);
  const padded = span * 1.25;
  const pxPerSecond = Math.min(maxPxPerSecond(scale), Math.max(MIN_PX_PER_SECOND, w / padded));
  const shown = w / pxPerSecond;
  return { origin: (min + max) / 2 - shown / 2, pxPerSecond };
}

/* -------------------------------------------------------------- the lanes */

export type Side = 'up' | 'down';

/**
 * Where each event's tag goes: alternating above and below the axis in time
 * order (Nick: "up, down, up, down"), and, when two tags on the same side
 * would still sit on top of each other, the next lane out. Returns, per event
 * id, the side and the lane (0 nearest the axis). Pure geometry, so the
 * canvas and its test agree on it.
 */
export function placeTags(
  items: { id: string; x: number; width: number }[],
  lanes = 3,
): Map<string, { side: Side; lane: number }> {
  const out = new Map<string, { side: Side; lane: number }>();
  const sorted = [...items].sort((a, b) => a.x - b.x);
  const rightEdge: Record<Side, number[]> = { up: [], down: [] };
  sorted.forEach((item, index) => {
    const side: Side = index % 2 === 0 ? 'up' : 'down';
    const edges = rightEdge[side];
    const left = item.x - item.width / 2;
    let lane = 0;
    while (lane < lanes - 1 && edges[lane] !== undefined && edges[lane] > left) lane++;
    edges[lane] = Math.max(edges[lane] ?? -Infinity, item.x + item.width / 2 + 8);
    out.set(item.id, { side, lane });
  });
  return out;
}
