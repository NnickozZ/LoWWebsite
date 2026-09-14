/**
 * §67 — pan en zoom, op één plek.
 *
 * Where the glass is over the world. A world point is drawn at
 * `x + worldX * zoom`, `y + worldY * zoom`, which is exactly what a
 * `transform: translate(x, y) scale(zoom)` on the canvas's world layer does —
 * so a canvas never has to reckon a coordinate twice and this file can be
 * tested without one.
 *
 * Written for the stamboom in §66 (as `lib/families/layout.ts`'s tail) and
 * pulled out here in §67, when the prikbord turned out to be doing the same
 * four sums by hand. `lib/families/layout.ts` re-exports the lot under its old
 * names (`TreeView`, `isTreeView`), so nothing in the tree had to change to be
 * standing on this.
 */

/** A view over a canvas: where the world's origin is drawn, and how big. */
export type CanvasView = { x: number; y: number; zoom: number };

/** §66: how far in and out a canvas goes. A card is unreadable below the floor. */
export const MIN_ZOOM = 0.25;
export const MAX_ZOOM = 2.5;
/** Air round the world when everything is brought into view, in screen pixels. */
export const FIT_PADDING = 48;

/**
 * §69 — one hand on every canvas.
 *
 * Three numbers that were four different numbers until this round, and the
 * difference was never a decision:
 *
 * - `ZOOM_STEP` is what a zoom **button** does. It was 1.25 on the prikbord and
 *   the stamboom, 1.4 on the landkaart and 1.6 on the tijdlijn.
 * - `wheelFactor` is what one notch of the **wheel** does. Three surfaces
 *   already used `exp(-deltaY × 0.0015)`; the prikbord used a flat 1.1 per
 *   event, which ignores how far the wheel actually turned — a trackpad's long
 *   smooth swipe and a mouse's single click moved it by exactly the same
 *   amount (measured: `deltaY` −100 and −300 both gave one step).
 * - `DRAG_SLOP` is how far a press travels before it is a drag rather than a
 *   click. It was 4 px on the stamboom, 5 on the landkaart, 3 on one axis of
 *   the tijdlijn, and on the prikbord *four board units* — which at zoom 0.25
 *   is sixteen screen pixels and at 2.5 is under two.
 *
 * The tijdlijn keeps its own reading of the wheel (§68: the wheel drags the
 * paper the way the hand goes) and asks `wheelFactor` only for ctrl+wheel.
 */
export const ZOOM_STEP = 1.25;
export const DRAG_SLOP = 4;

/**
 * How much one wheel event zooms. `deltaMode` 1 is "lines" (Firefox) and 2 is
 * "pages"; both arrive with a much smaller number than pixels do, so a factor
 * tuned for pixels would be imperceptible there.
 */
export function wheelFactor(deltaY: number, deltaMode = 0): number {
  if (!Number.isFinite(deltaY)) return 1;
  const perUnit = deltaMode === 0 ? 0.0015 : deltaMode === 1 ? 0.05 : 0.3;
  return Math.exp(-deltaY * perUnit);
}

/** Has this press travelled far enough to be a drag? Screen pixels, both axes. */
export function passedSlop(dx: number, dy: number, slop = DRAG_SLOP): boolean {
  return Math.hypot(dx, dy) > slop;
}

function tidy(value: number): number {
  return Math.round(value * 1000) / 1000;
}

export function clampZoom(zoom: number): number {
  if (!Number.isFinite(zoom)) return 1;
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
}

/** A view read back out of `localStorage` is anybody's JSON until this says otherwise. */
export function isCanvasView(value: unknown): value is CanvasView {
  if (!value || typeof value !== 'object') return false;
  const raw = value as Partial<CanvasView>;
  return (
    typeof raw.x === 'number' &&
    Number.isFinite(raw.x) &&
    typeof raw.y === 'number' &&
    Number.isFinite(raw.y) &&
    typeof raw.zoom === 'number' &&
    Number.isFinite(raw.zoom)
  );
}

/**
 * "Alles in beeld": the whole world centred in the stage, at whichever zoom
 * fits both ways, never past the floor or the ceiling. An empty world — or a
 * stage that has not been measured yet — comes back centred at 1, because a
 * `NaN` in a transform is a blank page.
 *
 * `ceiling` is the one dial a surface may turn down: the prikbord refuses to
 * zoom *in* past 1.2 when it fits a wall of four cards, because a board blown
 * up to two and a half times reads as broken rather than as helpful. The
 * stamboom takes the default and fits to `MAX_ZOOM`.
 */
export function fitViewport(
  bounds: { minX: number; minY: number; maxX: number; maxY: number },
  stage: { width: number; height: number },
  padding = FIT_PADDING,
  ceiling = MAX_ZOOM,
): CanvasView {
  const width = Math.max(0, bounds.maxX - bounds.minX);
  const height = Math.max(0, bounds.maxY - bounds.minY);
  const stageW = Number.isFinite(stage.width) ? stage.width : 0;
  const stageH = Number.isFinite(stage.height) ? stage.height : 0;
  if (stageW <= 0 || stageH <= 0) return { x: 0, y: 0, zoom: 1 };
  const room = { width: Math.max(1, stageW - padding * 2), height: Math.max(1, stageH - padding * 2) };
  const zoom = Math.min(
    ceiling,
    clampZoom(width <= 0 || height <= 0 ? 1 : Math.min(room.width / width, room.height / height)),
  );
  return {
    x: tidy((stageW - width * zoom) / 2 - bounds.minX * zoom),
    y: tidy((stageH - height * zoom) / 2 - bounds.minY * zoom),
    zoom,
  };
}

/**
 * Zoom by `factor` and keep the world point under (`stageX`, `stageY`) exactly
 * where it is — the wheel's rule, and the buttons' too, which zoom about the
 * middle of the glass. Once the zoom is at its floor or its ceiling the view
 * does not move at all, so a wheel spun on and on does not creep sideways.
 */
export function zoomAbout(view: CanvasView, factor: number, stageX: number, stageY: number): CanvasView {
  const zoom = clampZoom(view.zoom * (Number.isFinite(factor) && factor > 0 ? factor : 1));
  if (zoom === view.zoom) return view;
  const worldX = (stageX - view.x) / view.zoom;
  const worldY = (stageY - view.y) / view.zoom;
  return { x: tidy(stageX - worldX * zoom), y: tidy(stageY - worldY * zoom), zoom };
}

/** A screen point on the stage, in world coordinates. */
export function toWorld(view: CanvasView, stageX: number, stageY: number): { x: number; y: number } {
  return { x: (stageX - view.x) / view.zoom, y: (stageY - view.y) / view.zoom };
}
