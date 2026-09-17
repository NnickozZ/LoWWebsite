/**
 * §72 — twee vingers, één knijp, en geen sprong.
 *
 * Nick, round 37: *"Zooming in and out with the pinching gesture sometimes
 * teleports the camera somewhere else."* It did, on four canvases, for four
 * different reasons — and all four were the same mistake underneath: **a
 * gesture that remembered something about a finger that was no longer true.**
 *
 * - The prikbord started a *pan* for the second finger as well as the first,
 *   keyed on nothing, so the first finger's next move was measured from where
 *   the second one had landed: the wall jumped by the distance between the two
 *   fingers before the knijp even began.
 * - The landkaart kept a finger in its list after its `pointerup` had been
 *   eaten — by a speld that re-clustered away under the zoom (§71), or by a
 *   button that stops propagation — so the *next* single finger was a knijp
 *   against a ghost, and zoomed about a point half a screen away.
 * - The landkaart also let a second finger that landed on a speld replace the
 *   knijp with a speld-press, so both fingers took turns panning from one start.
 * - The tijdlijn picked a pan back up after a knijp from the view of the last
 *   *render*, not the last move, and jumped back by however far the last few
 *   frames had zoomed.
 *
 * So this file is the whole knijp, once, and it holds three rules:
 *
 * 1. **The knijp is absolute.** The view is always computed from the view, the
 *    midpoint and the spread *at the moment the pair was formed* — never by
 *    multiplying the previous frame — so a dropped or doubled event cannot
 *    accumulate into a drift, and the world point that was under the fingers'
 *    midpoint stays under it (which also means two fingers moving together pan).
 * 2. **Any change to the set of fingers re-bases.** A finger down, up or
 *    cancelled starts a new baseline from the view as it is *now*; nothing is
 *    carried across the change.
 * 3. **A finger the tracker has not heard from is forgotten, not trusted.**
 *    `up` is also called from a window listener in the capture phase, which no
 *    `stopPropagation` and no unmounted element can keep a `pointerup` from.
 *
 * Pure, and in world-units-neutral `CanvasView` terms (`x + worldX × zoom`), so
 * it is tested without a canvas; the landkaart's `{ tx, ty }` is the same view
 * with other names.
 */

import { clampZoom, type CanvasView } from './view';

export type Point = { x: number; y: number };

/**
 * The view a knijp asks for: the world point under `startMid` in `start`, drawn
 * under `mid`, at `start.zoom × dist / startDist` (clamped).
 */
export function pinchView(
  start: CanvasView,
  startMid: Point,
  startDist: number,
  mid: Point,
  dist: number,
  clamp: (zoom: number) => number = clampZoom,
): CanvasView {
  const ok = (n: number) => Number.isFinite(n);
  if (!ok(startDist) || !ok(dist) || startDist <= 0 || dist <= 0 || !ok(mid.x) || !ok(mid.y)) return start;
  const zoom = clamp(start.zoom * (dist / startDist));
  if (!ok(zoom) || zoom <= 0) return start;
  const worldX = (startMid.x - start.x) / start.zoom;
  const worldY = (startMid.y - start.y) / start.zoom;
  return { x: mid.x - worldX * zoom, y: mid.y - worldY * zoom, zoom };
}

type Baseline = { view: CanvasView; mid: Point; dist: number };

/**
 * Where the fingers are, and the baseline of the knijp they make. A canvas
 * feeds it every touch pointer it hears about and asks it for a view.
 */
export class PinchTracker {
  private points = new Map<number, Point>();
  private base: Baseline | null = null;
  /** The view to start from once two fingers that landed on one spot spread. */
  private waiting: CanvasView | null = null;

  constructor(private readonly clamp: (zoom: number) => number = clampZoom) {}

  get size(): number {
    return this.points.size;
  }

  /** Is a knijp in progress — two or more fingers, with a baseline? */
  get active(): boolean {
    return (this.base !== null || this.waiting !== null) && this.points.size >= 2;
  }

  has(id: number): boolean {
    return this.points.has(id);
  }

  /** The one finger left, when there is exactly one. */
  only(): Point | null {
    if (this.points.size !== 1) return null;
    return [...this.points.values()][0];
  }

  private pair(): [Point, Point] | null {
    if (this.points.size < 2) return null;
    const [a, b] = [...this.points.values()];
    return [a, b];
  }

  private rebase(view: CanvasView) {
    const pair = this.pair();
    this.waiting = null;
    if (!pair) {
      this.base = null;
      return;
    }
    const [a, b] = pair;
    const dist = Math.hypot(a.x - b.x, a.y - b.y);
    if (dist > 0) {
      this.base = { view, mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, dist };
    } else {
      this.base = null;
      this.waiting = view;
    }
  }

  /** A finger landed. Returns true when this finger turned the hand into a knijp. */
  down(id: number, at: Point, view: CanvasView): boolean {
    const was = this.active;
    this.points.set(id, at);
    this.rebase(view);
    return !was && this.active;
  }

  /**
   * A finger moved. Returns the view the knijp asks for, or null when this is
   * not a knijp (one finger, or a pointer the tracker never saw go down).
   */
  move(id: number, at: Point): CanvasView | null {
    if (!this.points.has(id)) return null;
    this.points.set(id, at);
    const pair = this.pair();
    if (!pair) return null;
    // A baseline made with the fingers on top of each other has no spread to
    // measure against; the first frame where they have one is the start.
    if (!this.base && this.waiting) this.rebase(this.waiting);
    if (!this.base) return this.waiting;
    const [a, b] = pair;
    return pinchView(
      this.base.view,
      this.base.mid,
      this.base.dist,
      { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
      Math.hypot(a.x - b.x, a.y - b.y),
      this.clamp,
    );
  }

  /**
   * A finger left (or was cancelled, or was never heard from again). `view` is
   * the view as it is now, so whatever is still down re-bases from here.
   * Returns true when this ended a knijp.
   */
  up(id: number, view: CanvasView): boolean {
    if (!this.points.has(id)) return false;
    const was = this.active;
    this.points.delete(id);
    this.rebase(view);
    return was && !this.active;
  }

  clear() {
    this.points.clear();
    this.base = null;
    this.waiting = null;
  }
}
