import { describe, expect, it } from 'vitest';
import {
  chooseStep,
  clampPrecision,
  fitView,
  floorTo,
  formatWhen,
  parseDutchDate,
  partsToSeconds,
  placeTags,
  secondsToParts,
  ticksBetween,
  UNIT_SECONDS,
} from '@/lib/timelines/time';

/**
 * §32: time, as a tijdlijn measures it. Pure, so it is pinned down here: the
 * integer a moment becomes, what it prints as at each precision, what a typed
 * date reads as, how the axis is ruled, and where the tags go.
 */

describe('a moment as one integer', () => {
  it('round-trips through the parts, 1930s included', () => {
    const at = partsToSeconds({ year: 1931, month: 3, day: 12, hour: 14, minute: 30, second: 5 });
    expect(at).toBeLessThan(0);
    expect(secondsToParts(at)).toEqual({ year: 1931, month: 3, day: 12, hour: 14, minute: 30, second: 5 });
  });

  it('reads a year alone as its first second, and a year under 100 as that year', () => {
    expect(secondsToParts(partsToSeconds({ year: 1931 }))).toEqual({ year: 1931, month: 1, day: 1, hour: 0, minute: 0, second: 0 });
    expect(secondsToParts(partsToSeconds({ year: 33 })).year).toBe(33);
    expect(secondsToParts(partsToSeconds({ year: -500 })).year).toBe(-500);
  });

  it('keeps a 31st inside a month that has no 31st', () => {
    expect(secondsToParts(partsToSeconds({ year: 1931, month: 2, day: 31 }))).toMatchObject({ month: 2, day: 28 });
    expect(secondsToParts(partsToSeconds({ year: 1932, month: 2, day: 31 }))).toMatchObject({ month: 2, day: 29 });
  });

  it('sorts the way a calendar does', () => {
    const a = partsToSeconds({ year: 1931, month: 3, day: 12 });
    const b = partsToSeconds({ year: 1931, month: 3, day: 13 });
    const c = partsToSeconds({ year: 1931, month: 12 });
    expect(a).toBeLessThan(b);
    expect(b).toBeLessThan(c);
  });

  it('floors to a unit', () => {
    const at = partsToSeconds({ year: 1931, month: 3, day: 12, hour: 14, minute: 30, second: 5 });
    expect(secondsToParts(floorTo(at, 'day'))).toMatchObject({ day: 12, hour: 0, minute: 0, second: 0 });
    expect(secondsToParts(floorTo(at, 'year'))).toMatchObject({ month: 1, day: 1 });
  });
});

describe('printing to a precision', () => {
  const at = partsToSeconds({ year: 1931, month: 3, day: 12, hour: 14, minute: 30, second: 5 });
  it('prints only what is known', () => {
    expect(formatWhen(at, 'year')).toBe('1931');
    expect(formatWhen(at, 'month')).toBe('maart 1931');
    expect(formatWhen(at, 'day')).toBe('12 maart 1931');
    expect(formatWhen(at, 'hour')).toBe('12 maart 1931, 14:00');
    expect(formatWhen(at, 'minute')).toBe('12 maart 1931, 14:30');
    expect(formatWhen(at, 'second')).toBe('12 maart 1931, 14:30:05');
  });

  it('is never finer than the tijdlijn measures', () => {
    expect(clampPrecision('second', 'day')).toBe('day');
    expect(clampPrecision('year', 'day')).toBe('year');
    expect(clampPrecision('minute', 'minute')).toBe('minute');
  });
});

describe('reading a typed date', () => {
  it('reads the shapes people type into an infobox', () => {
    expect(parseDutchDate('14 oktober 1934')).toEqual({ at: partsToSeconds({ year: 1934, month: 10, day: 14 }), precision: 'day' });
    expect(parseDutchDate('oktober 1934')).toEqual({ at: partsToSeconds({ year: 1934, month: 10 }), precision: 'month' });
    expect(parseDutchDate('1934')).toEqual({ at: partsToSeconds({ year: 1934 }), precision: 'year' });
    expect(parseDutchDate('14-10-1934')).toEqual({ at: partsToSeconds({ year: 1934, month: 10, day: 14 }), precision: 'day' });
    expect(parseDutchDate('1934-10-14')).toEqual({ at: partsToSeconds({ year: 1934, month: 10, day: 14 }), precision: 'day' });
    expect(parseDutchDate('3 mrt 1931, 14:30')).toEqual({
      at: partsToSeconds({ year: 1931, month: 3, day: 3, hour: 14, minute: 30 }),
      precision: 'minute',
    });
    expect(parseDutchDate('3 maart 1931 14:30:05')?.precision).toBe('second');
  });

  it('and says no to what is not a date', () => {
    expect(parseDutchDate('')).toBeNull();
    expect(parseDutchDate('ergens in de herfst')).toBeNull();
    expect(parseDutchDate('32 maart 1931')).toBeNull();
    expect(parseDutchDate('14 vendémiaire 1934')).toBeNull();
  });
});

describe('ruling the axis', () => {
  it('never rules finer than the scale, however far in', () => {
    expect(chooseStep('day', 1000)).toEqual({ unit: 'day', count: 1 });
    expect(chooseStep('year', 1000)).toEqual({ unit: 'year', count: 1 });
    expect(chooseStep('second', 1000)).toEqual({ unit: 'second', count: 1 });
  });

  it('and coarsens as the view widens', () => {
    const fine = chooseStep('day', 200 / UNIT_SECONDS.day);
    const coarse = chooseStep('day', 200 / UNIT_SECONDS.year);
    expect(fine.unit).toBe('day');
    expect(coarse.unit).toBe('month');
  });

  it('aligns ticks to the calendar: months on the first, a week from the first', () => {
    const from = partsToSeconds({ year: 1931, month: 2, day: 20 });
    const to = partsToSeconds({ year: 1931, month: 5, day: 3 });
    const months = ticksBetween(from, to, 'day', 200 / (UNIT_SECONDS.day * 30));
    expect(months.map((t) => secondsToParts(t.at).day)).toEqual([1, 1, 1]);
    expect(months.map((t) => t.label)).toEqual(['mrt', 'apr', 'mei']);

    const weeks = ticksBetween(from, partsToSeconds({ year: 1931, month: 3, day: 16 }), 'day', 100 / (UNIT_SECONDS.day * 7));
    expect(weeks.map((t) => secondsToParts(t.at).day)).toEqual([22, 1, 8, 15]);
    expect(weeks[1]).toMatchObject({ label: 'mrt 1931', major: true });
  });

  it('gives up before a thousand ticks', () => {
    const from = partsToSeconds({ year: 0 });
    const to = partsToSeconds({ year: 3000 });
    expect(ticksBetween(from, to, 'second', 1e-9).length).toBeLessThan(500);
  });

  it('fits every moment with a margin, and opens on 1930 when there is nothing', () => {
    const empty = fitView([], 900, 'day');
    expect(secondsToParts(empty.origin + 450 / empty.pxPerSecond).year).toBe(1930);

    const a = partsToSeconds({ year: 1931, month: 3, day: 1 });
    const b = partsToSeconds({ year: 1931, month: 4, day: 1 });
    const view = fitView([a, b], 900, 'day');
    const xa = (a - view.origin) * view.pxPerSecond;
    const xb = (b - view.origin) * view.pxPerSecond;
    expect(xa).toBeGreaterThan(0);
    expect(xb).toBeLessThan(900);
    expect(xb - xa).toBeGreaterThan(500);
  });
});

describe('where the tags go', () => {
  it('alternates up, down, up, down in time order', () => {
    const spots = placeTags([
      { id: 'a', x: 100, width: 60 },
      { id: 'c', x: 500, width: 60 },
      { id: 'b', x: 300, width: 60 },
      { id: 'd', x: 700, width: 60 },
    ]);
    expect(spots.get('a')?.side).toBe('up');
    expect(spots.get('b')?.side).toBe('down');
    expect(spots.get('c')?.side).toBe('up');
    expect(spots.get('d')?.side).toBe('down');
    expect([...spots.values()].every((s) => s.lane === 0)).toBe(true);
  });

  it('steps out a lane when two on one side would overlap', () => {
    const spots = placeTags([
      { id: 'a', x: 100, width: 120 },
      { id: 'b', x: 110, width: 120 },
      { id: 'c', x: 120, width: 120 },
      { id: 'd', x: 130, width: 120 },
    ]);
    expect(spots.get('a')).toEqual({ side: 'up', lane: 0 });
    expect(spots.get('b')).toEqual({ side: 'down', lane: 0 });
    expect(spots.get('c')).toEqual({ side: 'up', lane: 1 });
    expect(spots.get('d')).toEqual({ side: 'down', lane: 1 });
  });

  it('never goes past the last lane', () => {
    const items = Array.from({ length: 12 }, (_, i) => ({ id: String(i), x: 100 + i, width: 150 }));
    const spots = placeTags(items, 3);
    expect(Math.max(...[...spots.values()].map((s) => s.lane))).toBe(2);
  });
});
