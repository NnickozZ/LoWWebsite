import { describe, expect, it } from 'vitest';
import { PinchTracker, pinchView } from '@/lib/canvas/pinch';
import { MAX_ZOOM } from '@/lib/canvas/view';

/**
 * §72 — twee vingers, één knijp, en geen sprong. Every case below is one of
 * the ways the camera used to teleport under a knijp (round 37).
 */

const at = (x: number, y: number) => ({ x, y });
const world = (v: { x: number; y: number; zoom: number }, p: { x: number; y: number }) => ({
  x: (p.x - v.x) / v.zoom,
  y: (p.y - v.y) / v.zoom,
});

describe('§72 pinchView', () => {
  it('keeps the world point under the midpoint under the midpoint', () => {
    const start = { x: 10, y: 20, zoom: 1 };
    const v = pinchView(start, at(100, 100), 100, at(100, 100), 200);
    expect(v.zoom).toBe(2);
    expect(world(v, at(100, 100))).toEqual(world(start, at(100, 100)));
  });

  it('pans with two fingers that move together', () => {
    const start = { x: 0, y: 0, zoom: 1 };
    const v = pinchView(start, at(100, 100), 80, at(150, 130), 80);
    expect(v).toEqual({ x: 50, y: 30, zoom: 1 });
  });

  it('clamps the zoom and still anchors on the fingers', () => {
    const start = { x: 0, y: 0, zoom: 2 };
    const v = pinchView(start, at(50, 50), 10, at(50, 50), 1000);
    expect(v.zoom).toBe(MAX_ZOOM);
    expect(world(v, at(50, 50)).x).toBeCloseTo(25);
  });

  it('answers the start for nonsense instead of a NaN', () => {
    const start = { x: 1, y: 2, zoom: 1 };
    expect(pinchView(start, at(0, 0), 0, at(0, 0), 10)).toBe(start);
    expect(pinchView(start, at(0, 0), 10, at(Number.NaN, 0), 10)).toBe(start);
  });
});

describe('§72 PinchTracker', () => {
  it('one finger is not a knijp', () => {
    const t = new PinchTracker();
    expect(t.down(1, at(0, 0), { x: 0, y: 0, zoom: 1 })).toBe(false);
    expect(t.move(1, at(40, 0))).toBeNull();
  });

  it('a second finger starts one, and it is absolute, not cumulative', () => {
    const t = new PinchTracker();
    const view = { x: 0, y: 0, zoom: 1 };
    t.down(1, at(100, 100), view);
    expect(t.down(2, at(200, 100), view)).toBe(true);
    // Many small moves, then back to where the fingers started: same view.
    for (let i = 0; i < 30; i++) t.move(2, at(200 + i * 3, 100));
    const back = t.move(2, at(200, 100));
    expect(back).toEqual({ x: 0, y: 0, zoom: 1 });
  });

  it('re-bases when a finger lifts, so the one left does not jump', () => {
    const t = new PinchTracker();
    t.down(1, at(100, 100), { x: 0, y: 0, zoom: 1 });
    t.down(2, at(200, 100), { x: 0, y: 0, zoom: 1 });
    const zoomed = t.move(2, at(300, 100))!;
    expect(t.up(2, zoomed)).toBe(true);
    expect(t.active).toBe(false);
    // A new second finger starts from the zoomed view, not the old baseline.
    t.down(3, at(300, 100), zoomed);
    expect(t.move(3, at(300, 100))).toEqual(zoomed);
  });

  it('never measures against a finger it was told is gone', () => {
    const t = new PinchTracker();
    const view = { x: 0, y: 0, zoom: 1 };
    t.down(1, at(10, 10), view);
    t.up(1, view);
    t.up(1, view); // the window hears the same up again: harmless
    t.down(2, at(300, 300), view);
    expect(t.size).toBe(1);
    expect(t.move(2, at(320, 300))).toBeNull();
  });

  it('ignores a move from a pointer that never went down', () => {
    const t = new PinchTracker();
    t.down(1, at(0, 0), { x: 0, y: 0, zoom: 1 });
    expect(t.move(9, at(50, 50))).toBeNull();
    expect(t.size).toBe(1);
  });

  it('two fingers landing on one spot wait for a spread instead of dividing by zero', () => {
    const t = new PinchTracker();
    const view = { x: 5, y: 5, zoom: 1 };
    t.down(1, at(100, 100), view);
    t.down(2, at(100, 100), view);
    expect(t.active).toBe(true);
    const first = t.move(2, at(140, 100))!;
    expect(first).toEqual(view);
    const next = t.move(2, at(180, 100))!;
    expect(next.zoom).toBeCloseTo(2);
  });
});
