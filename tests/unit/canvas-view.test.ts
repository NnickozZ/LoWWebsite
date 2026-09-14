import { describe, expect, it } from 'vitest';
import {
  clampZoom,
  DRAG_SLOP,
  fitViewport,
  isCanvasView,
  MAX_ZOOM,
  MIN_ZOOM,
  passedSlop,
  toWorld,
  wheelFactor,
  zoomAbout,
  ZOOM_STEP,
} from '@/lib/canvas/view';

/**
 * §67 — pan en zoom, op één plek.
 *
 * Written for the stamboom in §66 as the tail of `lib/families/layout.ts` and
 * moved to `lib/canvas/view.ts` when the prikbord turned out to be doing the
 * same four sums by hand. These are the tests that came with it; the tree still
 * reaches them through `layout.ts`'s re-export, which
 * `tests/unit/family-layout.test.ts` keeps an eye on.
 */

describe('§67 alles in beeld', () => {
  const bounds = { minX: 0, minY: 0, maxX: 400, maxY: 200 };

  it('centres the world and fits it both ways', () => {
    const view = fitViewport(bounds, { width: 600, height: 400 }, 0);
    // 600/400 = 1.5 across, 400/200 = 2 down: the narrower one wins.
    expect(view.zoom).toBe(1.5);
    expect(view.x).toBe(0);
    expect(view.y).toBe(50);
  });

  it('leaves air round it, and never zooms past the ceiling', () => {
    const padded = fitViewport(bounds, { width: 600, height: 400 });
    expect(padded.zoom).toBeLessThan(1.5);
    const tiny = fitViewport({ minX: 0, minY: 0, maxX: 10, maxY: 10 }, { width: 900, height: 900 });
    expect(tiny.zoom).toBe(MAX_ZOOM);
  });

  it('never zooms past the floor either', () => {
    const huge = fitViewport({ minX: 0, minY: 0, maxX: 40000, maxY: 40000 }, { width: 600, height: 400 });
    expect(huge.zoom).toBe(MIN_ZOOM);
  });

  it('answers something usable for an empty world and an unmeasured stage', () => {
    expect(fitViewport({ minX: 0, minY: 0, maxX: 0, maxY: 0 }, { width: 600, height: 400 })).toEqual({
      x: 300,
      y: 200,
      zoom: 1,
    });
    expect(fitViewport(bounds, { width: 0, height: 0 })).toEqual({ x: 0, y: 0, zoom: 1 });
  });

  /**
   * §67: the one dial a surface may turn down. The prikbord fits to 1.2 with
   * forty pixels of air, because a wall of four kaartjes blown up two and a half
   * times reads as broken; the stamboom takes the defaults.
   */
  it('honours a lower ceiling without disturbing the centring', () => {
    const tiny = { minX: 0, minY: 0, maxX: 10, maxY: 10 };
    const stage = { width: 900, height: 900 };
    expect(fitViewport(tiny, stage, 40, 1.2).zoom).toBe(1.2);
    // Still the middle of the stage, at that zoom.
    expect(fitViewport(tiny, stage, 40, 1.2)).toEqual({ x: 444, y: 444, zoom: 1.2 });
    // The floor still wins over the ceiling for something enormous.
    expect(fitViewport({ minX: 0, minY: 0, maxX: 40000, maxY: 40000 }, stage, 40, 1.2).zoom).toBe(
      MIN_ZOOM,
    );
  });
});

describe('§67 de zoom om de muis heen', () => {
  const view = { x: 20, y: 30, zoom: 1 };

  it('keeps the world point under the pointer exactly where it is', () => {
    const next = zoomAbout(view, 2, 120, 80);
    const before = toWorld(view, 120, 80);
    const after = toWorld(next, 120, 80);
    expect(next.zoom).toBe(2);
    expect(after.x).toBeCloseTo(before.x, 6);
    expect(after.y).toBeCloseTo(before.y, 6);
  });

  it('stops at the floor and the ceiling, and does not creep sideways there', () => {
    const out = zoomAbout({ x: 0, y: 0, zoom: MIN_ZOOM }, 0.5, 300, 200);
    expect(out).toEqual({ x: 0, y: 0, zoom: MIN_ZOOM });
    const inward = zoomAbout({ x: 0, y: 0, zoom: MAX_ZOOM }, 2, 300, 200);
    expect(inward).toEqual({ x: 0, y: 0, zoom: MAX_ZOOM });
  });

  it('clamps a zoom read back out of a browser that was told anything', () => {
    expect(clampZoom(Number.NaN)).toBe(1);
    expect(clampZoom(99)).toBe(MAX_ZOOM);
    expect(clampZoom(0)).toBe(MIN_ZOOM);
  });

  it('refuses a stored view that is not one', () => {
    expect(isCanvasView({ x: 1, y: 2, zoom: 1 })).toBe(true);
    expect(isCanvasView({ x: 1, y: 2 })).toBe(false);
    expect(isCanvasView({ x: Number.NaN, y: 2, zoom: 1 })).toBe(false);
    expect(isCanvasView(null)).toBe(false);
    expect(isCanvasView('{"x":1}')).toBe(false);
  });
});

/**
 * §69 — the three numbers that were four numbers. The point of each test is
 * the *property*, not the constant: a number nobody relies on can be retuned,
 * but "further turn, more zoom" and "the same press is a drag at every zoom"
 * are what the round is for.
 */
describe('§69 één hand', () => {
  it('zooms further the further the wheel turns', () => {
    // The prikbord's flat 1.1 answered these two the same; this must not.
    const small = wheelFactor(-100);
    const large = wheelFactor(-300);
    expect(small).toBeGreaterThan(1);
    expect(large).toBeGreaterThan(small);
    // And the other way is the exact inverse, so a notch back undoes a notch.
    expect(wheelFactor(100) * wheelFactor(-100)).toBeCloseTo(1, 10);
  });

  it('reads a line-wheel and a page-wheel on their own scale', () => {
    // Firefox reports deltaMode 1 with a deltaY of about 3 per notch, so the
    // pixel factor would be invisible there.
    expect(wheelFactor(-3, 1)).toBeGreaterThan(wheelFactor(-3, 0));
    expect(wheelFactor(-1, 2)).toBeGreaterThan(wheelFactor(-1, 1));
  });

  it('answers 1 to a wheel that reported nothing usable', () => {
    expect(wheelFactor(Number.NaN)).toBe(1);
    expect(wheelFactor(0)).toBe(1);
  });

  it('measures the drag threshold on the diagonal, not per axis', () => {
    // 3 px each way is 4.24 px of travel: a drag. Per-axis thresholds of 3
    // (the tijdlijn and the stamboom's pan) and of 4 both said "still a click".
    expect(passedSlop(3, 3)).toBe(true);
    expect(passedSlop(DRAG_SLOP, 0)).toBe(false);
    expect(passedSlop(DRAG_SLOP + 0.1, 0)).toBe(true);
    expect(passedSlop(0, 0)).toBe(false);
  });

  it('keeps a button step that is a step, and its inverse', () => {
    expect(ZOOM_STEP).toBeGreaterThan(1);
    const inward = zoomAbout({ x: 0, y: 0, zoom: 1 }, ZOOM_STEP, 100, 100);
    const back = zoomAbout(inward, 1 / ZOOM_STEP, 100, 100);
    expect(back.zoom).toBeCloseTo(1, 10);
    // The point under the cursor is where it started, so a zoom in and out is
    // not a slow drift sideways.
    expect(back.x).toBeCloseTo(0, 6);
    expect(back.y).toBeCloseTo(0, 6);
  });
});
