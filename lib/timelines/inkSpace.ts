import type { InkFormat } from '@/lib/ink/types';

/**
 * §33 on a tijdlijn: where a streek lives, and how big it is.
 *
 * Pure — no React, no canvas — so the geometry can be pinned down in
 * `tests/unit/timeline-ink-space.test.ts` instead of guessed at through a
 * browser.
 *
 * ## The bug this file exists for
 *
 * A v0 tijdlijn stroke was written in two different spaces at once: its x was
 * an absolute moment in seconds, its y a fraction of the stage's height. On
 * screen that is `x·P` against `y·stageH`, and `P` — pixels per second — is the
 * zoom while `stageH` is not. So a circle drawn round 1887 at one zoom was
 * drawn as an ellipse at any other, stretched horizontally by exactly the ratio
 * of the two zooms; and since `P` spans some 200× inside a single scale, and
 * ten orders of magnitude across them, the stretch was unbounded. The same
 * mismatch squashed a drawing vertically on a phone against a desktop, because
 * `stageH` is a measured height and not a shared unit.
 *
 * ## v1: one similarity space
 *
 * Nick's decision (round 12) is that a drawing on a tijdlijn behaves like ink
 * on a prikbord — it grows and shrinks with the axis, a circle round 1887 stays
 * a circle at every zoom, and the gum stays exactly over what it erased. That
 * needs both axes in one unit, and the only unit a tijdlijn has is the second:
 *
 *     x = the absolute moment, in seconds        (unchanged from v0)
 *     y = seconds from the axis, positive down
 *     width = seconds
 *
 *     screen.x = (x − origin)·P
 *     screen.y = stageH/2 + y·P
 *     screen width = width·P
 *
 * One scalar `P` on both axes and on the width: a similarity, so angles and
 * ratios survive every zoom, and the drawing no longer knows how tall the stage
 * is. Zooming in 5× makes the drawing 5× bigger, which is what was asked for.
 *
 * ## Why v0 is still here
 *
 * A stroke is immutable once it is saved (§33) and the merge is append +
 * tombstone + sort; nothing in this archive rewrites a stroke that is already
 * on disk. So a tekenlaag holds both formats forever, the flag rides on each
 * stroke (`InkFormat`), and the v0 branch below is the old formula unchanged,
 * so an old drawing comes back exactly as it was left. The accepted seam: a v1
 * gum drawn over v0 ink drifts apart under zoom, because the two are no longer
 * in one space. That can only happen to drawings already on disk, and it is a
 * far smaller price than rewriting them.
 */

/** The view a tijdlijn stage draws from: the moment at the left edge, and the zoom. */
export type InkViewport = { origin: number; pxPerSecond: number } | null;

/** What a tijdlijn writes today. Everything older has no `v` at all. */
export const TIMELINE_INK_FORMAT: InkFormat = 1;

/** A stroke's own coordinates → pixels on the stage. */
export function projectInk(
  view: InkViewport,
  stageH: number,
  v: InkFormat | undefined,
  x: number,
  y: number,
): { x: number; y: number } {
  const sx = view ? (x - view.origin) * view.pxPerSecond : 0;
  // v1: one scalar on both axes, hung off the axis in the middle of the stage.
  if (v === 1) return { x: sx, y: stageH / 2 + y * (view ? view.pxPerSecond : 0) };
  // v0, untouched: y was a fraction of the stage's height.
  return { x: sx, y: y * stageH };
}

/** Pixels on the stage → a stroke's own coordinates. The inverse of `projectInk`. */
export function inkFromScreen(
  view: InkViewport,
  stageH: number,
  v: InkFormat | undefined,
  sx: number,
  sy: number,
): { x: number; y: number } {
  const x = view ? view.origin + sx / view.pxPerSecond : 0;
  if (v === 1) return { x, y: view ? (sy - stageH / 2) / view.pxPerSecond : 0 };
  return { x, y: sy / stageH };
}

/**
 * Stroke width × this = screen pixels.
 *
 * v1 widths are seconds, so they scale with the zoom like everything else —
 * and they *must*, or the gum's disc would shrink relative to the ink it once
 * covered and a clean erasure would grow a halo. v0 widths were already screen
 * pixels on a tijdlijn, so they stay at 1.
 *
 * A stage with no view yet has no zoom to scale by; 1 keeps the one frame
 * before the first measurement from dividing by zero.
 */
export function inkWidthScale(pxPerSecond: number, v: InkFormat | undefined): number {
  if (v !== 1) return 1;
  return Number.isFinite(pxPerSecond) && pxPerSecond > 0 ? pxPerSecond : 1;
}
