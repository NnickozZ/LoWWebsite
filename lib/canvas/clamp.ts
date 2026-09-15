/**
 * §69 (3.4) — waar een zwevend paneel op een tekenvlak terechtkomt.
 *
 * Every canvas in this archive clips: `.tree-stage`, `.map-stage`,
 * `.timeline-stage` and `.board-viewport` all carry `overflow: hidden`, because
 * the world inside them is bigger than the glass. So anything that floats over
 * one — a picker, a little menu, a panel — has to be put somewhere that is
 * actually *inside* the glass, or it is drawn and then cut off, which reads as
 * a bug in the thing you just pressed.
 *
 * Round 31 named this as a leftover on the stamboom, in two halves: the kiezer
 * clamped itself but **against a guessed height of 200 px**, so a tall one
 * (two ghosts, a search box and a name field) still ran off the bottom; and the
 * knoopmenu did not clamp at all, so near the bottom edge it was simply gone.
 * Item 3.4 of the contract closes both, and the arithmetic lives here rather
 * than in either component for the usual reason: a number worked out in a
 * `style={{}}` is a number no test can ask about.
 *
 * Two shapes, because the two panels are positioned in different spaces:
 *
 *  - `clampFloat` is for a panel placed in the **stage's** own coordinates,
 *    from a point — the kiezer. It answers with a left and a top.
 *  - `flipsNeeded` is for a panel hanging off an **anchor inside the world**,
 *    which is scaled and translated under a CSS transform and therefore has no
 *    honest stage coordinates of its own — the knoopmenu. It answers with which
 *    way the panel should open instead, and CSS does the moving.
 *
 * Both take a measured size. That is the whole point: a guess is what was
 * already there.
 */

/** How close a floating panel may come to the edge of the glass. */
export const FLOAT_MARGIN = 8;

/** How far under the point a panel opens, when there is room under it. */
export const FLOAT_BELOW = 12;

export type Size = { width: number; height: number };
export type Placed = { left: number; top: number; flipped: boolean };

/**
 * Put a panel of `size` near `at`, inside a stage of `stage`.
 *
 * Horizontally it is centred on the point and then pushed inside the margin.
 * Vertically it prefers to hang under the point; if it would run off the
 * bottom it flips **above** the point instead, and only if there is no room
 * there either does it give up and sit as low as it can. That order matters: a
 * panel that merely slid up until it fitted would end up lying over the thing
 * it was opened from, which is exactly what you want to keep looking at.
 *
 * A stage smaller than the panel is not an error — a phone held sideways is
 * that — so everything is floored at the margin rather than allowed to go
 * negative, and the panel is then clipped at the bottom like anything else.
 */
export function clampFloat(
  at: { x: number; y: number },
  size: Size,
  stage: Size,
  below: number = FLOAT_BELOW,
  margin: number = FLOAT_MARGIN,
): Placed {
  const left = Math.max(margin, Math.min(stage.width - size.width - margin, at.x - size.width / 2));

  const under = at.y + below;
  const fitsUnder = under + size.height <= stage.height - margin;
  if (fitsUnder) return { left, top: Math.max(margin, under), flipped: false };

  const above = at.y - below - size.height;
  if (above >= margin) return { left, top: above, flipped: true };

  return { left, top: Math.max(margin, stage.height - size.height - margin), flipped: false };
}

/**
 * Keep a panel whose top-left corner is already chosen inside the glass.
 *
 * `clampFloat` decides *where* a panel goes from a point; this one is for a
 * panel that has already been placed deliberately — the prikbord's floating
 * kiezer opens **beside** the punaise it belongs to, on purpose, so that the
 * speld and its tag stay where the hand left them and stay grabbable. All that
 * is wanted there is that it does not hang off the cork, which is clipped.
 *
 * The wish is honoured where it fits and pulled in where it does not, never
 * past the margin. Same floor as `clampFloat`: a glass smaller than the panel
 * is a phone held sideways, not an error.
 */
export function clampInside(
  at: { x: number; y: number },
  size: Size,
  stage: Size,
  margin: number = FLOAT_MARGIN,
): { left: number; top: number } {
  return {
    left: Math.max(margin, Math.min(at.x, stage.width - size.width - margin)),
    top: Math.max(margin, Math.min(at.y, stage.height - size.height - margin)),
  };
}

/** Only the four edges are read, so a real `DOMRect` fits this. */
export type Edges = { top: number; right: number; bottom: number; left: number };

/**
 * Which way an anchored panel should open, given where it landed opening the
 * usual way (down, centred).
 *
 * `up` when its bottom is past the glass and there is room for its whole height
 * above it — the same order of preference `clampFloat` uses. `start` / `end`
 * when it runs off one side: `end` means "align its right edge with the
 * anchor", `start` means "align its left edge", and they are mutually
 * exclusive with `end` winning, because a panel wider than the glass has to
 * pick a side and the right-hand one is where the `…` it hangs from is.
 */
export function flipsNeeded(
  box: Edges,
  stage: Edges,
  margin: number = FLOAT_MARGIN,
): { up: boolean; start: boolean; end: boolean } {
  const height = box.bottom - box.top;
  const overflowsBottom = box.bottom > stage.bottom - margin;
  const roomAbove = box.top - height >= stage.top + margin;
  const end = box.right > stage.right - margin;
  return {
    up: overflowsBottom && roomAbove,
    start: !end && box.left < stage.left + margin,
    end,
  };
}
