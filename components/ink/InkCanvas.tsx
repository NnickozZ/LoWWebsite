'use client';

import { useEffect, useRef } from 'react';
import { INK_COLOURS, type InkFormat } from '@/lib/ink/types';
import type { DisplayStroke } from './useInk';

/**
 * §33: the canvas the strokes are painted on. Render only — it knows nothing
 * of hands, saves or rights. Everything is drawn in *screen* pixels: the
 * caller hands over `project`, which turns a stroke's own coordinates (board
 * units, picture pixels, seconds on an axis) into pixels on this canvas, and
 * `widthScale`, which does the same for a stroke's width. That is what lets
 * one component serve a corkboard that pans and zooms uniformly, a landkaart
 * that does the same, and a tijdlijn whose x is time.
 *
 * Both are handed the stroke's `v` — its space (`InkFormat`) — as an opaque
 * third thing: a place that has written its strokes in more than one space
 * over the years has to draw each of them by its own rule, and this file must
 * not learn what any of those rules are. `widthScale` may therefore be a plain
 * number (one rule for the whole layer) or a function of `v`; it is resolved
 * once per stroke, in `drawStroke`.
 *
 * A gum is a stroke painted with `destination-out`, in time order, so it
 * takes out only what was under it when it was made (README §33).
 *
 * The first `stableCount` strokes never change between renders while the
 * view holds still (they are the saved layer and the finished-but-unsaved
 * ones), so they are painted once into an offscreen canvas and copied; only
 * the strokes in progress are painted on every frame. Without this a wall
 * with a thousand strokes would be repainted sixty times a second while
 * somebody drew a line on it.
 */
export type Project = (x: number, y: number, v?: InkFormat) => { x: number; y: number };

/** One number for every stroke, or one worked out from the stroke's space. */
export type WidthScale = number | ((v?: InkFormat) => number);

export function InkCanvas({
  strokes,
  stableCount,
  project,
  widthScale,
  viewKey,
  width,
  height,
  className,
}: {
  strokes: DisplayStroke[];
  /** How many strokes at the front of the list are immutable objects. */
  stableCount: number;
  project: Project;
  /** Stroke width × this = screen pixels. */
  widthScale: WidthScale;
  /** Changes whenever `project` or `widthScale` would give different answers (pan, zoom, resize). */
  viewKey: string;
  width: number;
  height: number;
  className?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cache = useRef<{ canvas: HTMLCanvasElement; viewKey: string; drawn: DisplayStroke[]; dpr: number } | null>(null);
  const frame = useRef<number | null>(null);
  const latest = useRef({ strokes, stableCount, project, widthScale, viewKey, width, height });
  latest.current = { strokes, stableCount, project, widthScale, viewKey, width, height };

  useEffect(() => {
    if (frame.current !== null) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = null;
      const canvas = canvasRef.current;
      if (!canvas) return;
      paint(canvas, cache, latest.current);
    });
    return () => {
      if (frame.current !== null) {
        cancelAnimationFrame(frame.current);
        frame.current = null;
      }
    };
  }, [strokes, stableCount, project, widthScale, viewKey, width, height]);

  return (
    <canvas
      ref={canvasRef}
      className={className}
      aria-hidden="true"
      style={{ width, height }}
    />
  );
}

type PaintInput = {
  strokes: DisplayStroke[];
  stableCount: number;
  project: Project;
  widthScale: WidthScale;
  viewKey: string;
  width: number;
  height: number;
};

function paint(
  canvas: HTMLCanvasElement,
  cacheRef: React.MutableRefObject<{ canvas: HTMLCanvasElement; viewKey: string; drawn: DisplayStroke[]; dpr: number } | null>,
  input: PaintInput,
) {
  const dpr = Math.min(3, window.devicePixelRatio || 1);
  const pw = Math.max(1, Math.round(input.width * dpr));
  const ph = Math.max(1, Math.round(input.height * dpr));
  if (canvas.width !== pw || canvas.height !== ph) {
    canvas.width = pw;
    canvas.height = ph;
  }
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const stable = input.strokes.slice(0, Math.max(0, Math.min(input.stableCount, input.strokes.length)));
  const volatile = input.strokes.slice(stable.length);

  // Is the cache still the beginning of what we are about to draw?
  let cache = cacheRef.current;
  const cacheFits =
    cache &&
    cache.viewKey === input.viewKey &&
    cache.dpr === dpr &&
    cache.canvas.width === pw &&
    cache.canvas.height === ph &&
    cache.drawn.length <= stable.length &&
    cache.drawn.every((stroke, i) => stroke === stable[i]);

  if (!cacheFits) {
    const off = cache?.canvas ?? document.createElement('canvas');
    off.width = pw;
    off.height = ph;
    cache = { canvas: off, viewKey: input.viewKey, drawn: [], dpr };
    cacheRef.current = cache;
  }
  const octx = cache!.canvas.getContext('2d');
  if (!octx) return;
  if (cache!.drawn.length < stable.length) {
    octx.setTransform(dpr, 0, 0, dpr, 0, 0);
    for (let i = cache!.drawn.length; i < stable.length; i++) drawStroke(octx, stable[i], input.project, input.widthScale);
    cache!.drawn = stable.slice();
  }

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = 'source-over';
  ctx.clearRect(0, 0, pw, ph);
  ctx.drawImage(cache!.canvas, 0, 0);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  for (const stroke of volatile) drawStroke(ctx, stroke, input.project, input.widthScale);
  ctx.globalCompositeOperation = 'source-over';
}

/** One stroke, as a run of round-capped segments whose width follows the pen's pressure. */
export function drawStroke(ctx: CanvasRenderingContext2D, stroke: DisplayStroke, project: Project, widthScale: WidthScale) {
  const pts = stroke.points;
  if (pts.length < 3) return;
  const erase = stroke.mode === 'erase';
  ctx.globalCompositeOperation = erase ? 'destination-out' : 'source-over';
  ctx.strokeStyle = erase ? '#000' : INK_COLOURS[stroke.colour] ?? INK_COLOURS[0];
  ctx.fillStyle = ctx.strokeStyle;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  // The stroke's space, asked for once and then carried into every projection.
  const v = stroke.v;
  const scale = typeof widthScale === 'function' ? widthScale(v) : widthScale;
  const base = Math.max(0.5, stroke.width * scale);
  const widthAt = (p: number) => base * (erase ? 1 : 0.4 + 0.6 * p);

  // A single point: a dot.
  if (pts.length < 6) {
    const a = project(pts[0], pts[1], v);
    ctx.beginPath();
    ctx.arc(a.x, a.y, widthAt(pts[2]) / 2, 0, Math.PI * 2);
    ctx.fill();
    return;
  }

  // Constant pressure (a mouse, a finger): one smooth path, cheap to draw.
  let flat = true;
  for (let i = 2; i < pts.length; i += 3) {
    if (Math.abs(pts[i] - pts[2]) > 0.02) {
      flat = false;
      break;
    }
  }
  if (flat) {
    ctx.lineWidth = widthAt(pts[2]);
    ctx.beginPath();
    let prev = project(pts[0], pts[1], v);
    ctx.moveTo(prev.x, prev.y);
    for (let i = 3; i < pts.length; i += 3) {
      const next = project(pts[i], pts[i + 1], v);
      // Through the midpoints, so a jittery hand reads as one line.
      const mx = (prev.x + next.x) / 2;
      const my = (prev.y + next.y) / 2;
      ctx.quadraticCurveTo(prev.x, prev.y, mx, my);
      prev = next;
    }
    ctx.lineTo(prev.x, prev.y);
    ctx.stroke();
    return;
  }

  // A pen: segment by segment, each as wide as the pressure between its ends.
  let prev = project(pts[0], pts[1], v);
  let prevP = pts[2];
  for (let i = 3; i < pts.length; i += 3) {
    const next = project(pts[i], pts[i + 1], v);
    const p = pts[i + 2];
    ctx.lineWidth = widthAt((prevP + p) / 2);
    ctx.beginPath();
    ctx.moveTo(prev.x, prev.y);
    ctx.lineTo(next.x, next.y);
    ctx.stroke();
    prev = next;
    prevP = p;
  }
}
