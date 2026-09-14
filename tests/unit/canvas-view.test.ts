import { describe, expect, it } from 'vitest';
import {
  clampZoom,
  fitViewport,
  isCanvasView,
  MAX_ZOOM,
  MIN_ZOOM,
  toWorld,
  zoomAbout,
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
