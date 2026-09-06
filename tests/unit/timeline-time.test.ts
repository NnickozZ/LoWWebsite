import { describe, expect, it } from 'vitest';
import {
  addUnits,
  ANCHOR_UNITS,
  anchorParts,
  anchorSpan,
  anchorUnitsFor,
  applyAnchor,
  chooseStep,
  clampPrecision,
  clampToAnchor,
  isAnchorUnit,
  snapTo,
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

/**
 * §35: dragging and the anchor. `snapTo` is what a hand lands on, `addUnits`
 * the calendar's own step, and `applyAnchor` / `anchorSpan` are the whole of
 * "deze tijdlijn speelt op 3 oktober 1931" — the auto-fill and the fence.
 */

describe('stepping and snapping', () => {
  it('steps a calendar month, not thirty days', () => {
    const jan31 = partsToSeconds({ year: 1931, month: 1, day: 31 });
    expect(secondsToParts(addUnits(jan31, 'month', 1))).toMatchObject({ year: 1931, month: 2, day: 28 });
    expect(secondsToParts(addUnits(jan31, 'month', 13))).toMatchObject({ year: 1932, month: 2, day: 29 });
    expect(secondsToParts(addUnits(jan31, 'month', -1))).toMatchObject({ year: 1930, month: 12, day: 31 });
    expect(addUnits(jan31, 'day', 1)).toBe(jan31 + 86400);
    expect(addUnits(jan31, 'minute', 3)).toBe(jan31 + 180);
    expect(addUnits(jan31, 'year', 0)).toBe(jan31);
  });

  it('snaps to the nearest boundary, the midpoint upward', () => {
    const noon = partsToSeconds({ year: 1931, month: 3, day: 12, hour: 12 });
    // Exactly halfway through the day: the later day.
    expect(snapTo(noon, 'day')).toBe(partsToSeconds({ year: 1931, month: 3, day: 13 }));
    expect(snapTo(noon - 1, 'day')).toBe(partsToSeconds({ year: 1931, month: 3, day: 12 }));
    expect(snapTo(partsToSeconds({ year: 1931, month: 3, day: 12, hour: 5 }), 'day')).toBe(
      partsToSeconds({ year: 1931, month: 3, day: 12 }),
    );
    expect(snapTo(partsToSeconds({ year: 1931, month: 3, day: 12, hour: 14, minute: 40 }), 'hour')).toBe(
      partsToSeconds({ year: 1931, month: 3, day: 12, hour: 15 }),
    );
  });

  it('snaps across the end of a month and a year, in the 1930s', () => {
    const late = partsToSeconds({ year: 1931, month: 1, day: 31, hour: 20 });
    expect(late).toBeLessThan(0);
    expect(snapTo(late, 'day')).toBe(partsToSeconds({ year: 1931, month: 2, day: 1 }));
    // Two-thirds through February: March, not "day 29".
    expect(snapTo(partsToSeconds({ year: 1931, month: 2, day: 20 }), 'month')).toBe(
      partsToSeconds({ year: 1931, month: 3 }),
    );
    expect(snapTo(partsToSeconds({ year: 1931, month: 10 }), 'year')).toBe(partsToSeconds({ year: 1932 }));
    expect(snapTo(partsToSeconds({ year: 1931, month: 3 }), 'year')).toBe(partsToSeconds({ year: 1931 }));
  });

  it('a year-grained moment stays on its year, however fine the axis is ruled', () => {
    // What a drag does: the unit is the gebeurtenis's own precision.
    const somewhere = partsToSeconds({ year: 1931, month: 7, day: 2, hour: 9, minute: 12 });
    expect(secondsToParts(snapTo(somewhere, 'year'))).toMatchObject({ year: 1931, month: 1, day: 1, hour: 0 });
  });
});

describe('a tijdlijn that speelt op one day', () => {
  const anchorAt = partsToSeconds({ year: 1931, month: 10, day: 3 });

  it('only a coarser unit than the measure may be the anchor', () => {
    expect(anchorUnitsFor('minute')).toEqual(['year', 'month', 'day']);
    expect(anchorUnitsFor('day')).toEqual(['year', 'month']);
    expect(anchorUnitsFor('year')).toEqual([]);
    expect(ANCHOR_UNITS).toEqual(['year', 'month', 'day']);
    expect(isAnchorUnit('day')).toBe(true);
    expect(isAnchorUnit('hour')).toBe(false);
  });

  it('rewrites the year, the month and the day and keeps the hour and the minute', () => {
    const elsewhere = partsToSeconds({ year: 1887, month: 4, day: 19, hour: 22, minute: 5, second: 9 });
    const moved = applyAnchor(elsewhere, anchorAt, 'day');
    expect(secondsToParts(moved)).toEqual({ year: 1931, month: 10, day: 3, hour: 22, minute: 5, second: 9 });
    expect(formatWhen(moved, 'minute')).toBe('3 oktober 1931, 22:05');
    // A month anchor leaves the day alone; no anchor leaves everything alone.
    expect(secondsToParts(applyAnchor(elsewhere, anchorAt, 'month'))).toMatchObject({ year: 1931, month: 10, day: 19 });
    expect(applyAnchor(elsewhere, null, null)).toBe(elsewhere);
    expect(anchorParts(anchorAt, 'month')).toEqual({ year: 1931, month: 10 });
  });

  it('is one unit wide, and nothing gets out of it', () => {
    const { from, to } = anchorSpan(anchorAt + 3600 * 7, 'day');
    expect(from).toBe(anchorAt);
    expect(to).toBe(anchorAt + 86400);
    expect(anchorSpan(anchorAt, 'month')).toEqual({
      from: partsToSeconds({ year: 1931, month: 10 }),
      to: partsToSeconds({ year: 1931, month: 11 }),
    });

    // The fence: before the day, after it, and the last whole minute of it.
    expect(clampToAnchor(from - 5000, 'minute', anchorAt, 'day')).toBe(from);
    expect(clampToAnchor(to + 5000, 'minute', anchorAt, 'day')).toBe(to - 60);
    expect(formatWhen(clampToAnchor(to + 5000, 'minute', anchorAt, 'day'), 'minute')).toBe('3 oktober 1931, 23:59');
    expect(clampToAnchor(from + 60, 'minute', anchorAt, 'day')).toBe(from + 60);
    expect(clampToAnchor(to + 5000, 'minute', null, null)).toBe(to + 5000);
  });
});
