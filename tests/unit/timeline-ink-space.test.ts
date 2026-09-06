import { describe, expect, it } from 'vitest';
import { normaliseStroke, readInkFrame } from '@/lib/ink/merge';
import { INK_BRUSHES, INK_V1_MAX_WIDTH, INK_V1_MIN_WIDTH } from '@/lib/ink/types';
import { TIMELINE_INK_FORMAT, inkFromScreen, inkWidthScale, projectInk } from '@/lib/timelines/inkSpace';
import { MIN_PX_PER_SECOND, maxPxPerSecond } from '@/lib/timelines/time';

/**
 * §33 on a tijdlijn: the geometry of a streek, pinned down without a browser.
 *
 * The bug this is here for: a v0 stroke's x scaled with the zoom and its y with
 * the stage's height, so the same drawing was an ellipse at every zoom but the
 * one it was made at, and a different ellipse again on a phone. v1 puts both
 * axes and the width in seconds, scaled by the one `pxPerSecond`.
 *
 * The two things that must both be true at once: a v1 drawing is a *similarity*
 * of itself at every zoom, and a v0 drawing comes back exactly as it always
 * did — nothing on disk is ever rewritten.
 */

const ORIGIN = -2_600_000_000; // somewhere round 1887, in seconds from the epoch
const STAGE_H = 420;
/** The zoom of a day tijdlijn, of a year tijdlijn, and of the finest scale there is. */
const ZOOMS = [maxPxPerSecond('day'), maxPxPerSecond('year'), maxPxPerSecond('second')];

const view = (pxPerSecond: number, origin = ORIGIN) => ({ origin, pxPerSecond });

describe('a v1 streek round-trips through the screen', () => {
  it('a point picked off the glass lands back on the same pixel, at every zoom', () => {
    for (const pxPerSecond of ZOOMS) {
      for (const [sx, sy] of [
        [0, 0],
        [137.5, 12.25],
        [640, 419],
        [-40, 210],
      ]) {
        const content = inkFromScreen(view(pxPerSecond), STAGE_H, 1, sx, sy);
        const back = projectInk(view(pxPerSecond), STAGE_H, 1, content.x, content.y);
        // x is an absolute moment — 2.6 billion seconds — so adding a few
        // seconds to it and taking them off again costs about a ten-thousandth
        // of a pixel at the finest zoom there is. That was true of v0 too, and
        // it is four orders below anything a screen can show.
        expect(back.x).toBeCloseTo(sx, 3);
        // y is measured from the axis, so it has no such offset: exact.
        expect(back.y).toBeCloseTo(sy, 9);
      }
    }
  });

  it('the axis is the origin of y, and x is an absolute moment', () => {
    const v = view(2);
    // A point on the axis is y = 0 seconds, whatever the stage's height.
    expect(inkFromScreen(v, STAGE_H, 1, 0, STAGE_H / 2).y).toBe(0);
    expect(inkFromScreen(v, 900, 1, 0, 450).y).toBe(0);
    // And x does not care about the stage at all: it is origin + sx/P.
    expect(inkFromScreen(v, STAGE_H, 1, 100, 0).x).toBe(ORIGIN + 50);
  });

  it('a drawing is the same shape on a phone as on a desktop', () => {
    // The old bug's second half: y used to be a fraction of the measured stage.
    const v = view(0.5);
    const point = inkFromScreen(v, 420, 1, 200, 110);
    const onDesktop = projectInk(v, 420, 1, point.x, point.y);
    const onPhone = projectInk(v, 900, 1, point.x, point.y);
    // The stage grew by 480 px, so the axis moved down by 240 — and the stroke
    // moved with it, rigidly. Its size did not change.
    expect(onPhone.x - onDesktop.x).toBe(0);
    expect(onPhone.y - onDesktop.y).toBeCloseTo(240, 9);
  });
});

describe('a v0 streek is drawn exactly as it always was', () => {
  /** The formula that stood in `TimelineCanvas` before round 12, verbatim. */
  const legacyProject = (v: { origin: number; pxPerSecond: number } | null, stageH: number, at: number, f: number) => ({
    x: v ? (at - v.origin) * v.pxPerSecond : 0,
    y: f * stageH,
  });
  const legacyToContent = (
    v: { origin: number; pxPerSecond: number } | null,
    stageH: number,
    sx: number,
    sy: number,
  ) => ({ x: v ? v.origin + sx / v.pxPerSecond : 0, y: sy / stageH });

  const TABLE: Array<[number, number]> = [
    [ORIGIN, 0],
    [ORIGIN + 1, 0.5],
    [ORIGIN + 86_400, 0.25],
    [ORIGIN - 5_000, 1],
    [ORIGIN + 1_234_567.891, 0.137],
  ];

  it('projects a legacy stroke through the old formula, number for number', () => {
    for (const pxPerSecond of [...ZOOMS, MIN_PX_PER_SECOND]) {
      for (const stageH of [420, 900, 137]) {
        for (const [at, f] of TABLE) {
          expect(projectInk(view(pxPerSecond), stageH, undefined, at, f)).toEqual(
            legacyProject(view(pxPerSecond), stageH, at, f),
          );
        }
      }
    }
  });

  it('and reads the glass back through the old formula too', () => {
    for (const pxPerSecond of ZOOMS) {
      for (const [sx, sy] of [
        [0, 0],
        [250.5, 91],
        [-13, 419],
      ]) {
        expect(inkFromScreen(view(pxPerSecond), STAGE_H, undefined, sx, sy)).toEqual(
          legacyToContent(view(pxPerSecond), STAGE_H, sx, sy),
        );
      }
    }
  });

  it('with no view at all, both formats collapse the way v0 did', () => {
    expect(projectInk(null, STAGE_H, undefined, ORIGIN, 0.5)).toEqual({ x: 0, y: 210 });
    expect(inkFromScreen(null, STAGE_H, undefined, 100, 210)).toEqual({ x: 0, y: 0.5 });
    expect(projectInk(null, STAGE_H, 1, ORIGIN, 5)).toEqual({ x: 0, y: 210 });
  });

  it('a legacy width is never scaled; a v1 width is scaled by the zoom', () => {
    for (const pxPerSecond of ZOOMS) {
      expect(inkWidthScale(pxPerSecond, undefined)).toBe(1);
      expect(inkWidthScale(pxPerSecond, 1)).toBe(pxPerSecond);
    }
    // No zoom to scale by yet: 1, so nothing divides by zero on the first frame.
    expect(inkWidthScale(0, 1)).toBe(1);
    expect(inkWidthScale(Number.NaN, 1)).toBe(1);
  });
});

describe('a v1 drawing is a similarity of itself at every zoom', () => {
  /** A square one unit on a side, drawn at `at`, as it is written down at `p0`. */
  const square = (p0: number, at: number) => {
    const v0 = view(p0);
    const side = 100; // pixels, at the zoom it was drawn at
    return [
      [0, 0],
      [side, 0],
      [side, side],
      [0, side],
    ].map(([sx, sy]) => inkFromScreen(v0, STAGE_H, 1, at + sx, sy));
  };

  it('a square drawn at one zoom is still a square at another', () => {
    for (const p0 of ZOOMS) {
      const pts = square(p0, 120);
      for (const p1 of [p0 / 200, p0 / 8, p0, p0 * 8, p0 * 200]) {
        const on = pts.map((p) => projectInk(view(p1), STAGE_H, 1, p.x, p.y));
        const w = Math.max(...on.map((p) => p.x)) - Math.min(...on.map((p) => p.x));
        const h = Math.max(...on.map((p) => p.y)) - Math.min(...on.map((p) => p.y));
        // Aspect ratio 1 — the whole point. Under v0 this was p1/p0.
        expect(w / h).toBeCloseTo(1, 9);
        // And the size follows the zoom exactly.
        expect(w).toBeCloseTo(100 * (p1 / p0), 6);
      }
    }
  });

  it('the same square under the old rule is stretched by the ratio of the zooms', () => {
    // Not a wish, a record of the defect: this is what the report was about.
    const p0 = maxPxPerSecond('day');
    const v0 = view(p0);
    const pts = [
      [0, 0],
      [100, 0],
      [100, 100],
      [0, 100],
    ].map(([sx, sy]) => inkFromScreen(v0, STAGE_H, undefined, 120 + sx, sy));
    const p1 = p0 * 5;
    const on = pts.map((p) => projectInk(view(p1), STAGE_H, undefined, p.x, p.y));
    const w = Math.max(...on.map((p) => p.x)) - Math.min(...on.map((p) => p.x));
    const h = Math.max(...on.map((p) => p.y)) - Math.min(...on.map((p) => p.y));
    expect(w / h).toBeCloseTo(5, 6);
  });

  it('a gum stays over the ink it took away: every offset scales by p1/p0', () => {
    const p0 = maxPxPerSecond('day');
    const ink = inkFromScreen(view(p0), STAGE_H, 1, 300, 140);
    const gum = inkFromScreen(view(p0), STAGE_H, 1, 300 + 37, 140 - 21);
    for (const p1 of [p0 / 50, p0 / 3, p0, p0 * 3, p0 * 50]) {
      const a = projectInk(view(p1), STAGE_H, 1, ink.x, ink.y);
      const b = projectInk(view(p1), STAGE_H, 1, gum.x, gum.y);
      expect(b.x - a.x).toBeCloseTo(37 * (p1 / p0), 6);
      expect(b.y - a.y).toBeCloseTo(-21 * (p1 / p0), 6);
    }
  });

  it('and the gum is as wide, relative to the ink, at every zoom', () => {
    const p0 = maxPxPerSecond('year');
    // What `useInk.begin` writes down: the screen width over the width scale.
    const width = 24 / inkWidthScale(p0, 1);
    for (const p1 of [p0 / 100, p0, p0 * 100]) {
      expect(width * inkWidthScale(p1, 1)).toBeCloseTo(24 * (p1 / p0), 6);
    }
  });
});

describe('a v1 width survives the trip through the server', () => {
  const stroke = (width: number, v?: 1) => ({
    id: 's_1',
    mode: 'ink',
    colour: 0,
    width,
    points: [ORIGIN, 0, 1, ORIGIN + 10, 3, 1],
    ...(v ? { v } : {}),
  });

  it('a 3 px brush comes back 3 px at both ends of the zoom', () => {
    // The old clamp (0.1 … 4000) would have pushed the fine end up to 0.1 —
    // a 3 px line drawn at twenty pixels — and the coarse end down to 4000,
    // which is invisible. Neither may happen now.
    for (const pxPerSecond of [maxPxPerSecond('second'), MIN_PX_PER_SECOND]) {
      const scale = inkWidthScale(pxPerSecond, TIMELINE_INK_FORMAT);
      const written = INK_BRUSHES[0] / scale;
      const read = normaliseStroke(stroke(written, 1))!;
      expect(read.v).toBe(1);
      expect(read.width).toBeGreaterThan(INK_V1_MIN_WIDTH);
      expect(read.width).toBeLessThan(INK_V1_MAX_WIDTH);
      // Six significant figures of 3 px is 3 px to any eye.
      expect(read.width * scale).toBeCloseTo(INK_BRUSHES[0], 4);
    }
  });

  it('nonsense is still fenced, at v1 bounds rather than v0 ones', () => {
    expect(normaliseStroke(stroke(1e30, 1))!.width).toBe(INK_V1_MAX_WIDTH);
    expect(normaliseStroke(stroke(0, 1))!.width).toBe(INK_V1_MIN_WIDTH);
    expect(normaliseStroke(stroke(-4, 1))!.width).toBe(INK_V1_MIN_WIDTH);
  });

  it('a legacy stroke keeps the v0 bounds, and no `v`', () => {
    expect(normaliseStroke(stroke(1e9))!.width).toBe(4000);
    expect(normaliseStroke(stroke(0))!.width).toBe(0.1);
    expect(normaliseStroke(stroke(6))).toMatchObject({ width: 6, v: undefined });
    // A `v` the client made up is not a format.
    expect(normaliseStroke({ ...stroke(6), v: 2 })!.v).toBeUndefined();
    expect(normaliseStroke({ ...stroke(6), v: '1' })!.v).toBeUndefined();
  });

  it('a live frame of somebody else’s v1 stroke arrives the right size', () => {
    const scale = inkWidthScale(maxPxPerSecond('second'), 1);
    const frame = readInkFrame({ id: 's_1', m: 'ink', k: 0, w: 3 / scale, v: 1, p: [ORIGIN, 0, 1] })!;
    expect(frame.v).toBe(1);
    expect(frame.w * scale).toBeCloseTo(3, 4);
    // Without the v1 bounds this would have been clamped up to 0.1 — a line
    // twenty pixels thick until the hand lifted and the saved stroke arrived.
    expect(frame.w).toBeLessThan(0.1);
  });

  it('a legacy frame is read exactly as before, `v` and all', () => {
    const frame = readInkFrame({ id: 's_1', m: 'erase', k: 3, w: 24, p: [1, 2, 1], e: 1 })!;
    expect(frame).not.toHaveProperty('v');
    expect(frame.w).toBe(24);
    expect(readInkFrame({ id: 's_1', m: 'ink', k: 0, w: 0.01, p: [1, 2, 1] })!.w).toBe(0.1);
  });
});
