'use client';

import { useEffect, useImperativeHandle, useMemo, useRef, forwardRef } from 'react';
import { CENTRED, cropFor, type Crop } from '@/lib/images/shapes';
import { ICON_PATHS } from '@/components/Icon';
import { ForceSim, radiusFor } from '@/lib/web/force';
import { EDGE_KINDS, LINE_COLOURS, NODE_KINDS } from '@/lib/web/kinds';
import { COLUMN_GAP_X, COLUMN_NODE_W, FOCUS_NODE_W, columnLayout, type ColumnLayout } from '@/lib/web/layout';
import type { WebEdge, WebGraph, WebLineColour, WebNode, WebNodeId } from '@/lib/web/types';
import type { Words } from '@/lib/words';

/**
 * §43: the web, drawn.
 *
 * One `<canvas>`, everything painted by hand. Not SVG and not the DOM, because
 * five hundred knots and two thousand lines as elements is a page that stutters
 * on every hover; a canvas draws them in a few milliseconds and only when
 * something changed (`dirty`), or while the simulation is still warm.
 *
 * Two layouts, one renderer:
 *   - **columns** (`mode: 'columns'`): `columnLayout` decides where every node
 *     sits and this file tweens them there — a node that survives a change of
 *     depth *slides* to its new row rather than jumping, and a node that has
 *     just appeared grows out of nothing at its place.
 *   - **organic** (`mode: 'organic'`): `ForceSim` moves the nodes and this file
 *     draws wherever they are this frame.
 *
 * What the hand does is decided here and handed up as callbacks: a click
 * selects, shift-click adds, a double-click asks the page to focus, a drag on
 * bare paper pans, a drag on a knot (organic) moves it, shift-drag draws a
 * selection box, the wheel zooms about the cursor, and two fingers pinch.
 *
 * Kurk-en-inkt: a node is a card of paper with its soort's colour on the
 * edge, and everything else — the paper, the ink, the rule, and since §45 the
 * six line colours the ties are drawn in — is read off the stage's own CSS
 * variables (`readPalette`). So the dark face (§29), the Keeper's side (§44)
 * and the Keeper's own palette all reach the drawing without a second copy of
 * any colour here; `lib/web/kinds.ts` keeps its constants as the fallback for
 * a property the stylesheet has not named.
 */

export type WebMode = 'columns' | 'organic';

export type WebCanvasHandle = {
  /** Fit the whole drawing in view, animated. */
  fit: () => void;
  /** Bring one node to the centre, animated, without changing the zoom. */
  centreOn: (id: WebNodeId) => void;
  zoomBy: (factor: number) => void;
  /** Lets go of every knot a hand has pinned (organic). */
  unpinAll: () => void;
};

export type WebCanvasProps = {
  graph: WebGraph;
  mode: WebMode;
  words: Words;
  selected: ReadonlySet<WebNodeId>;
  onSelect: (ids: Set<WebNodeId>) => void;
  onFocus: (id: WebNodeId) => void;
  onUnfold: (column: number) => void;
  onHover?: (id: WebNodeId | null) => void;
  expandedColumns: ReadonlySet<number>;
  /** Draw every line's phrase, not only the hovered node's. */
  labelsAlways?: boolean;
  /** Draw each knot's omslag inside it (organic) or beside its name (columns). */
  showImages?: boolean;
  /** Changing this re-fits the view (a new focus, a new mode). */
  fitKey: string;
  phone?: boolean;
  /** How many knots are pinned right now (organic) — for a "losmaken" button. */
  onPinsChange?: (count: number) => void;
};

type Palette = {
  paper: string;
  paperRaised: string;
  paperDark: string;
  ink: string;
  inkMuted: string;
  rule: string;
  dark: boolean;
  sans: string;
  /**
   * §45: every `--web-line-*` and `--web-<kind>` the stylesheet names, read
   * off the stage. Empty for a property that is not there, and then
   * `lib/web/kinds.ts` answers instead — its constants stay the fallback.
   */
  web: Record<string, string>;
  /**
   * Everything above folded into one string. The lower layer is cached on a
   * key that used to carry `paper` alone, which was enough while the six line
   * colours were constants in a module: since a Keeper can turn them, a
   * palette that changed without the paper changing has to invalidate it too.
   */
  key: string;
};

type Camera = { x: number; y: number; zoom: number };
type Placed = { x: number; y: number; w: number; h: number; r: number; scale: number };
type Tween = { fromX: number; fromY: number; toX: number; toY: number; t0: number; born: number };

const EASE = (t: number) => 1 - Math.pow(1 - t, 3);
const TWEEN_MS = 320;
const BORN_MS = 260;
const CAMERA_MS = 380;
const ZOOM_MIN = 0.12;
/**
 * Round 19: 4 → 12. A reader who wants one corner of a big web at reading
 * size ran out of zoom at 4. Everything that scaled with the zoom had to be
 * looked at again for the extra 3×: the cover sprites (`zoomBucket`), the
 * width of a line on the screen (`lineZoom`) and the culling margin.
 */
const ZOOM_MAX = 12;
/**
 * Up to this zoom a line grows on the screen as √zoom — thicker as you come
 * closer, but slower than the knots. Past it the line stops growing on the
 * screen altogether: at zoom 12 a √-law line would be 3.5× its nominal width,
 * a rope between two knots. This was the old ZOOM_MAX, so nothing below it
 * changed.
 */
const LINE_ZOOM_CAP = 4;
const DIM = 0.28;
/** Below this zoom only the landmarks carry a name; between the two, names fade in. */
const LABEL_ZOOM_LOW = 0.7;
const LABEL_ZOOM_HIGH = 1.05;
/** A line between two knots that are both two or more steps out, at rest. */
const PERIPHERAL_ALPHA = 0.12;
/** A line at rest in the organic web. */
const REST_ALPHA = 0.4;

/**
 * §45: the custom properties the drawing looks for, beside paper and ink —
 * the six line colours and the sixteen kinds of tie that alias onto them. The
 * names are taken from `lib/web/kinds.ts` rather than typed out, so a new kind
 * of tie is found here the day it is added there.
 */
const WEB_COLOUR_VARS: string[] = [
  ...Object.keys(LINE_COLOURS).map((colour) => `--web-line-${colour}`),
  ...Object.keys(EDGE_KINDS).map((kind) => `--web-${kind}`),
];

/** Which of the six a knot of this kind borrows, when it has no soort's colour. */
const NODE_LINE: Partial<Record<WebNode['kind'], WebLineColour>> = {
  case: 'gold',
  board: 'red',
  map: 'blue',
  timeline: 'green',
};

function readPalette(el: HTMLElement): Palette {
  const css = getComputedStyle(el);
  const get = (name: string, fallback: string) => css.getPropertyValue(name).trim() || fallback;
  const paper = get('--paper', '#f3eee2');
  const dark = luminance(paper) < 0.45;
  const web: Record<string, string> = {};
  for (const name of WEB_COLOUR_VARS) {
    const value = css.getPropertyValue(name).trim();
    if (value) web[name] = value;
  }
  const base = {
    paper,
    paperRaised: get('--paper-raised', '#f8f4ea'),
    paperDark: get('--paper-dark', '#e6dfcf'),
    ink: get('--ink', '#1f1b16'),
    inkMuted: get('--ink-muted', '#5c544a'),
    rule: get('--rule', '#c9c0ad'),
    dark,
    sans: get('--sans', 'system-ui, sans-serif'),
  };
  return {
    ...base,
    web,
    key: `${base.paper}|${base.paperRaised}|${base.paperDark}|${base.ink}|${base.inkMuted}|${base.rule}|${WEB_COLOUR_VARS.map((name) => web[name] ?? '').join(',')}`,
  };
}

function luminance(hex: string): number {
  const m = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return 1;
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

function withAlpha(colour: string, alpha: number): string {
  const m = /^#([0-9a-f]{6})$/i.exec(colour.trim());
  if (!m) return colour;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

/**
 * What a line's nominal width is divided by to get its width in world units,
 * so that on the screen it grows as √zoom up to `LINE_ZOOM_CAP` and not at
 * all beyond it. Continuous at the cap: √4 = 4/√4 = 2. Arrowheads and dashes
 * follow the same law, so a dashed line keeps its rhythm against its width.
 */
export function lineZoom(zoom: number): number {
  return zoom <= LINE_ZOOM_CAP ? Math.sqrt(zoom) : zoom / Math.sqrt(LINE_ZOOM_CAP);
}

/**
 * A cover sprite is rasterised at `SPRITE_SCALE` texels per world pixel,
 * which is sharp at zoom 1 on a retina screen and mush at zoom 12. So the
 * sprite is also keyed on a bucket — 1, 2, 4, 8 or 16 — chosen so that
 * `SPRITE_SCALE × bucket` is at least the screen's texels per world pixel.
 * Round 19 stopped the ladder at 8, so a knot at zoom 12 was blown up half
 * again over its own texels: that is the blur. The sixteenth rung costs one
 * more sprite for the handful of knots on the glass past zoom 8 and nothing
 * at all below it. Buckets and not a continuous scale, because every
 * distinct bucket is another sprite per cover in the cache.
 */
export function zoomBucket(zoom: number, dpr: number): 1 | 2 | 4 | 8 | 16 {
  const need = (zoom * dpr) / SPRITE_SCALE;
  return need <= 1 ? 1 : need <= 2 ? 2 : need <= 4 ? 4 : need <= 8 ? 8 : 16;
}

/**
 * The part of a graph the column layout depends on, folded into a short
 * string: which nodes are in it and where each stands (its step and side),
 * and which edges tie them — the edges decide the order within a column.
 * Node ids are kept in the clear so `nodePoint()` in the e2e specs can read
 * the key; the edges are hashed, because two thousand `from>to` pairs is a
 * hundred kilobytes of key to compare on every frame.
 */
export function graphFingerprint(graph: WebGraph): string {
  let h = 2166136261;
  const mix = (text: string) => {
    for (let i = 0; i < text.length; i++) {
      h ^= text.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
  };
  for (const edge of graph.edges) mix(`${edge.from}>${edge.to}:${edge.kind};`);
  const nodes = graph.nodes.map((n) => `${n.id}@${n.depth ?? ''}${n.side === 'in' ? '<' : n.side === 'out' ? '>' : ''}`).join(',');
  return `${nodes}|e${graph.edges.length}:${(h >>> 0).toString(36)}`;
}

/**
 * §45: the stylesheet first, `kinds.ts` second.
 *
 * The six line colours are the Keeper's now, and the legend prints them
 * straight out of CSS (`edgeColourVar`). If the canvas kept reading the module
 * a Keeper who turned "wat op een prikbord hangt" would change the legend and
 * not the drawing — the one way these two have ever been able to disagree. So
 * a property that is there wins, and the constants stay as the answer for one
 * that is not: a kind added to `kinds.ts` before its `--web-<kind>` reaches
 * `globals.css` still draws in the right colour.
 */
function nodeColour(node: WebNode, palette: Palette): string {
  if (node.kind === 'entry' && node.typeColour) return node.typeColour;
  // A dossier, prikbord, landkaart or tijdlijn wears the same colour its ties
  // are drawn in; an artikel and a notitie have a grey of their own, which is
  // not one of the nineteen tokens.
  const line = NODE_LINE[node.kind];
  const custom = line ? palette.web[`--web-line-${line}`] : undefined;
  if (custom) return custom;
  const info = NODE_KINDS[node.kind];
  return palette.dark ? info.colourDark : info.colour;
}

function edgeColour(edge: WebEdge, palette: Palette): string {
  const custom = palette.web[edge.colour ? `--web-line-${edge.colour}` : `--web-${edge.kind}`];
  if (custom) return custom;
  const info = edge.colour ? LINE_COLOURS[edge.colour] : EDGE_KINDS[edge.kind];
  return palette.dark ? info.colourDark : info.colour;
}

function nodeIcon(node: WebNode): string {
  if (node.kind === 'entry') return node.isCharacter ? 'mask' : node.typeIcon || 'file';
  return NODE_KINDS[node.kind].icon;
}

const pathCache = new Map<string, Path2D>();
function iconPath(name: string): Path2D {
  let path = pathCache.get(name);
  if (!path) {
    path = new Path2D(ICON_PATHS[name] ?? ICON_PATHS.file);
    pathCache.set(name, path);
  }
  return path;
}

function drawIcon(ctx: CanvasRenderingContext2D, name: string, x: number, y: number, size: number, colour: string, width = 1.7) {
  ctx.save();
  ctx.translate(x - size / 2, y - size / 2);
  ctx.scale(size / 24, size / 24);
  ctx.strokeStyle = colour;
  ctx.lineWidth = width * (24 / size);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.stroke(iconPath(name));
  ctx.restore();
}

/**
 * Text is measured once, at one size, on a context of its own. A label is
 * drawn at `10 / zoom` px so it stays the same size on the screen, which
 * means its font string changes on every wheel tick — and `ctx.font = …` is a
 * font *parse*, the most expensive single thing a canvas does per call. So
 * nothing here measures at the drawing size: a width is measured at
 * `MEASURE_PX` per (weight, text) and scaled linearly, which is exact for the
 * same face, and the drawing context has its font set only when the string
 * actually differs (`Type.font`). Round 17: this alone took a hover frame on
 * 600 knots from tens of milliseconds to a few.
 */

/**
 * Round 19: past `TEXT_CRISP_ZOOM` a caption is drawn through a context
 * scaled back to the screen, so its font is `10 px`, never `10 / 12 px`.
 * The engines rasterise canvas text through the transform, but hinting and
 * glyph placement happen at the *nominal* size, and below a pixel they come
 * apart — at zoom 12 a name was a row of scattered letters. A save/restore
 * per caption is only paid when zoomed that far in, where few are in view.
 */
const TEXT_CRISP_ZOOM = 2;
function textScale(zoom: number): number {
  return zoom > TEXT_CRISP_ZOOM ? zoom : 1;
}
function crispText(
  ctx: CanvasRenderingContext2D,
  type: Type,
  k: number,
  weight: number,
  size: number,
  text: string,
  x: number,
  y: number,
  halo: number,
) {
  if (k === 1) {
    type.font(weight, size);
    if (halo > 0) {
      ctx.lineWidth = halo;
      ctx.strokeText(text, x, y);
    }
    ctx.fillText(text, x, y);
    return;
  }
  ctx.save();
  ctx.scale(1 / k, 1 / k);
  ctx.font = `${weight} ${size * k}px ${type.face}`;
  if (halo > 0) {
    ctx.lineWidth = halo * k;
    ctx.strokeText(text, x * k, y * k);
  }
  ctx.fillText(text, x * k, y * k);
  ctx.restore();
  type.forget();
}

const MEASURE_PX = 20;
let measureCtx: CanvasRenderingContext2D | null = null;
let measureFace = '';
const widthCache = new Map<string, number>();

class Type {
  private current = '';
  /** The sans face, for a caller that must set a font on another transform. */
  readonly face: string;
  constructor(
    private ctx: CanvasRenderingContext2D,
    private sans: string,
  ) {
    this.face = sans;
    if (!measureCtx) measureCtx = document.createElement('canvas').getContext('2d');
    if (measureFace !== sans) {
      measureFace = sans;
      widthCache.clear();
    }
  }

  /** Sets the drawing font, if it is not already that. */
  font(weight: number, size: number): void {
    const f = `${weight} ${size}px ${this.sans}`;
    if (f !== this.current) {
      this.current = f;
      this.ctx.font = f;
    }
  }

  /** After a `ctx.restore()` the font may be anything again. */
  forget(): void {
    this.current = '';
  }

  width(weight: number, size: number, text: string): number {
    const key = `${weight}|${text}`;
    let w = widthCache.get(key);
    if (w === undefined) {
      const m = measureCtx;
      if (!m) return text.length * size * 0.55;
      m.font = `${weight} ${MEASURE_PX}px ${this.sans}`;
      w = m.measureText(text).width;
      if (widthCache.size > 6000) widthCache.clear();
      widthCache.set(key, w);
    }
    return (w * size) / MEASURE_PX;
  }

  ellipsis(weight: number, size: number, text: string, max: number): string {
    if (this.width(weight, size, text) <= max) return text;
    let lo = 0;
    let hi = text.length;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (this.width(weight, size, `${text.slice(0, mid)}…`) <= max) lo = mid;
      else hi = mid - 1;
    }
    return `${text.slice(0, Math.max(0, lo)).trimEnd()}…`;
  }

  /**
   * A name on at most two lines, each no wider than `max`; the second line
   * gets the ellipsis. A long name wrapped is a label you can read; a long
   * name cut to one line is "The missing body of…" three times in one web.
   */
  wrap(weight: number, size: number, text: string, max: number, lines = 2): string[] {
    if (this.width(weight, size, text) <= max) return [text];
    const words = text.split(/\s+/).filter(Boolean);
    const out: string[] = [];
    let line = '';
    for (let i = 0; i < words.length; i++) {
      const word = words[i];
      const next = line ? `${line} ${word}` : word;
      if (this.width(weight, size, next) <= max) {
        line = next;
        continue;
      }
      if (out.length === lines - 1) {
        out.push(this.ellipsis(weight, size, `${next}`, max));
        return out;
      }
      if (line) out.push(line);
      else out.push(this.ellipsis(weight, size, word, max));
      line = line ? word : '';
    }
    if (line) {
      if (out.length === lines) out[lines - 1] = this.ellipsis(weight, size, `${out[lines - 1]} ${line}`, max);
      else out.push(line);
    }
    return out.slice(0, lines);
  }
}

/**
 * Omslagen, loaded once each per variant; a frame is asked for when one
 * arrives. The 400 px `thumb` is what a whole web loads — a hundred covers
 * at once must stay cheap — the 900 px `card` is fetched only once a knot is
 * looked at closely (`zoomBucket` ≥ 4), and the 1600 px `full` only past
 * zoom 8 (bucket 16), where a knot fills a hand's breadth of screen and a
 * tight crop has nothing left to show from a card. So nothing gets slower
 * for a reader who never zooms in, and nothing is soft for one who does.
 */
type CoverVariant = 'thumb' | 'card' | 'full';
const imageCache = new Map<string, HTMLImageElement | null>();
function coverImage(assetId: string, variant: CoverVariant, onLoad: () => void): HTMLImageElement | null {
  const key = `${variant}|${assetId}`;
  if (imageCache.has(key)) return imageCache.get(key) ?? null;
  imageCache.set(key, null);
  const img = new Image();
  img.decoding = 'async';
  img.onload = () => {
    imageCache.set(key, img);
    onLoad();
  };
  img.onerror = () => imageCache.set(key, null);
  img.src = `/api/assets/${assetId}?s=${variant}`;
  return null;
}

/**
 * The cover to draw for a knot at this bucket: the card once the bucket asks
 * for it and it has arrived, the thumb meanwhile — so zooming in never blanks
 * a knot that already had a picture. Returns the variant with the image, so
 * the sprite is keyed on what it was actually cut from and is cut again from
 * the card when that arrives.
 */
function coverFor(assetId: string, bucket: number, onLoad: () => void): { img: HTMLImageElement; variant: CoverVariant } | null {
  if (bucket >= 16) {
    const full = coverImage(assetId, 'full', onLoad);
    if (full) return { img: full, variant: 'full' };
  }
  if (bucket >= 4) {
    const card = coverImage(assetId, 'card', onLoad);
    if (card) return { img: card, variant: 'card' };
  }
  const thumb = coverImage(assetId, 'thumb', onLoad);
  return thumb ? { img: thumb, variant: 'thumb' } : null;
}

/**
 * A cover already cut to the shape of its knot, drawn once into a small
 * canvas and stamped from then on. `ctx.clip()` per knot per frame was the
 * other half of the slow hover frame: a clip is a mask allocation, and with
 * "Afbeeldingen tonen" on, every visible knot did one. A stamp is a blit.
 *
 * `half` is the sprite's half-width in world units, so the stamp does not
 * have to know the scale it was drawn at — which varies per bucket, and is
 * lowered again when the sprite would run past `SPRITE_MAX_PX`.
 */
type Sprite = { canvas: HTMLCanvasElement; half: number };
const spriteCache = new Map<string, Sprite>();
/** Texels in the cache, so a handful of big sprites empties it as surely as many small ones. */
let spriteTexels = 0;
const SPRITE_SCALE = 2;
/**
 * The ceiling on a sprite's edge. It has to clear the largest thing the
 * ladder can ask for — the middle knot (radius 20) at bucket 16 wants
 * 20 × 2 × 32 = 1280 — or the cap silently undoes the top rung for exactly
 * the knot the eye is on.
 */
const SPRITE_MAX_PX = 1280;
function spriteKey(assetId: string, variant: CoverVariant, kind: WebNode['kind'], r: number, bucket: number, crop: Crop): string {
  return `${assetId}|${variant}|${kind}|${Math.max(4, Math.round(r))}|${bucket}|${crop.x.toFixed(3)},${crop.y.toFixed(3)},${crop.zoom.toFixed(2)}`;
}
function coverSprite(img: HTMLImageElement, key: string, kind: WebNode['kind'], r: number, bucket: number, crop: Crop): Sprite | null {
  const rr = Math.max(4, Math.round(r));
  let sprite = spriteCache.get(key);
  if (sprite) return sprite;
  let scale = SPRITE_SCALE * bucket;
  let px = Math.ceil(rr * 2 * scale) + 2;
  if (px > SPRITE_MAX_PX) {
    px = SPRITE_MAX_PX;
    scale = (px - 2) / (rr * 2);
  }
  const canvas = document.createElement('canvas');
  canvas.width = px;
  canvas.height = px;
  const c = canvas.getContext('2d');
  if (!c) return null;
  // A 900 px card cut down to a 200 px sprite is a seven-fold reduction, and
  // the default filter takes four texels to decide a pixel: a photograph
  // comes out speckled. This is the one draw where the picture's own pixels
  // are chosen, so it is the one that must ask for the good filter.
  c.imageSmoothingEnabled = true;
  c.imageSmoothingQuality = 'high';
  c.scale(scale, scale);
  const mid = px / (2 * scale);
  knotPath(c, kind, mid, mid, rr);
  c.clip();
  drawCover(c, img, mid, mid, rr * 2, rr * 2, crop);
  sprite = { canvas, half: mid };
  if (spriteCache.size > 900 || spriteTexels > 32_000_000) {
    spriteCache.clear();
    spriteTexels = 0;
  }
  spriteCache.set(key, sprite);
  spriteTexels += px * px;
  return sprite;
}

/**
 * Draws a picture cover-fitted into the current clip, centred on (x, y), by a
 * crop (round 19): the same focal point + zoom that `coverStyle` turns into
 * CSS, here turned into a source rectangle — a round knot wears the vierkant
 * crop, so a face sits in the knot where it sits on every square frame.
 */
function drawCover(ctx: CanvasRenderingContext2D, img: HTMLImageElement, x: number, y: number, w: number, h: number, crop: Crop = CENTRED) {
  const iw = img.naturalWidth;
  const ih = img.naturalHeight;
  const scale = Math.max(w / iw, h / ih) * crop.zoom;
  const sw = w / scale;
  const sh = h / scale;
  const sx = Math.min(Math.max(crop.x * iw - sw / 2, 0), iw - sw);
  const sy = Math.min(Math.max(crop.y * ih - sh / 2, 0), ih - sh);
  ctx.drawImage(img, sx, sy, sw, sh, x - w / 2, y - h / 2, w, h);
}

/**
 * The silhouette of a knot, by kind — so what a thing *is* reads at a glance
 * and without colour: an artikel is a round knot, a dossier a folder with a
 * tab, a prikbord a square of cork, a landkaart a diamond (the compass rose),
 * a tijdlijn a pill along the axis. Begins a path; the caller fills, strokes
 * or clips it. `r` is the radius the shape fits in.
 */
function knotPath(ctx: CanvasRenderingContext2D, kind: WebNode['kind'], x: number, y: number, r: number) {
  ctx.beginPath();
  switch (kind) {
    case 'case': {
      const w = r * 1.05;
      const h = r * 0.8;
      ctx.moveTo(x - w, y - h - r * 0.22);
      ctx.lineTo(x - w + r * 0.85, y - h - r * 0.22);
      ctx.lineTo(x - w + r * 1.05, y - h);
      ctx.lineTo(x + w, y - h);
      ctx.lineTo(x + w, y + h);
      ctx.lineTo(x - w, y + h);
      ctx.closePath();
      return;
    }
    case 'board': {
      const h = r * 0.92;
      const c = r * 0.18;
      ctx.moveTo(x - h + c, y - h);
      ctx.lineTo(x + h - c, y - h);
      ctx.quadraticCurveTo(x + h, y - h, x + h, y - h + c);
      ctx.lineTo(x + h, y + h - c);
      ctx.quadraticCurveTo(x + h, y + h, x + h - c, y + h);
      ctx.lineTo(x - h + c, y + h);
      ctx.quadraticCurveTo(x - h, y + h, x - h, y + h - c);
      ctx.lineTo(x - h, y - h + c);
      ctx.quadraticCurveTo(x - h, y - h, x - h + c, y - h);
      ctx.closePath();
      return;
    }
    case 'map': {
      ctx.moveTo(x, y - r * 1.08);
      ctx.lineTo(x + r * 1.08, y);
      ctx.lineTo(x, y + r * 1.08);
      ctx.lineTo(x - r * 1.08, y);
      ctx.closePath();
      return;
    }
    case 'timeline': {
      const w = r * 1.25;
      const h = r * 0.7;
      ctx.moveTo(x - w + h, y - h);
      ctx.lineTo(x + w - h, y - h);
      ctx.arc(x + w - h, y, h, -Math.PI / 2, Math.PI / 2);
      ctx.lineTo(x - w + h, y + h);
      ctx.arc(x - w + h, y, h, Math.PI / 2, (3 * Math.PI) / 2);
      ctx.closePath();
      return;
    }
    case 'note': {
      const h = r * 0.85;
      ctx.moveTo(x - h, y - h);
      ctx.lineTo(x + h * 0.6, y - h);
      ctx.lineTo(x + h, y - h * 0.6);
      ctx.lineTo(x + h, y + h);
      ctx.lineTo(x - h, y + h);
      ctx.closePath();
      return;
    }
    default:
      ctx.arc(x, y, r, 0, Math.PI * 2);
  }
}

/** A point on the cubic from (ax,ay) via c1, c2 to (bx,by). */
function cubicAt(t: number, ax: number, ay: number, c1x: number, c1y: number, c2x: number, c2y: number, bx: number, by: number) {
  const u = 1 - t;
  return {
    x: u * u * u * ax + 3 * u * u * t * c1x + 3 * u * t * t * c2x + t * t * t * bx,
    y: u * u * u * ay + 3 * u * u * t * c1y + 3 * u * t * t * c2y + t * t * t * by,
  };
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

export const WebCanvas = forwardRef<WebCanvasHandle, WebCanvasProps>(function WebCanvas(props, ref) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const layerRef = useRef<HTMLCanvasElement>(null);
  const propsRef = useRef(props);
  propsRef.current = props;

  // Everything the frame loop reads lives in one mutable bag, so a re-render
  // never restarts it and a prop change is picked up on the next frame.
  const state = useRef({
    camera: { x: 0, y: 0, zoom: 1 } as Camera,
    cameraFrom: null as null | (Camera & { t0: number; to: Camera }),
    placed: new Map<WebNodeId, Placed>(),
    tweens: new Map<WebNodeId, Tween>(),
    folds: [] as ColumnLayout['folds'],
    edgeToFold: new Map<string, { from?: string; to?: string }>(),
    layoutKey: '',
    sim: new ForceSim(),
    hover: null as WebNodeId | null,
    hoverFold: null as string | null,
    hoverEdge: null as string | null,
    dirty: true,
    raf: 0,
    size: { w: 0, h: 0, dpr: 1 },
    pointers: new Map<number, { x: number; y: number }>(),
    gesture: null as null | {
      kind: 'pan' | 'node' | 'marquee' | 'pinch' | 'maybe';
      startX: number;
      startY: number;
      cameraX: number;
      cameraY: number;
      node?: WebNodeId;
      nodeStart?: { x: number; y: number };
      pinchDist?: number;
      pinchZoom?: number;
      pinchMid?: { x: number; y: number };
      moved: boolean;
      shift: boolean;
      time: number;
    },
    marquee: null as null | { x0: number; y0: number; x1: number; y1: number },
    lastClick: { id: null as WebNodeId | null, at: 0 },
    fitKey: '',
    /** Fit once the drawing has settled enough to know its size. */
    pendingFit: false,
    palette: null as Palette | null,
    adjacency: new Map<WebNodeId, Set<WebNodeId>>(),
    nodeById: new Map<WebNodeId, WebNode>(),
    edgesByNode: new Map<WebNodeId, WebEdge[]>(),
    /** Where the last frame spent its time, in ms per section — for `window.__web` and nothing else. */
    stats: null as null | Record<string, number>,
    /** The resting lines and the step rings live on `layerRef`, drawn once and composited (round 18). */
    layerKey: null as string | null,
    layerBase: null as string | null,
    layerCam: null as Camera | null,
    prevCam: null as Camera | null,
    layerDpr: 1,
    /** Bumps whenever a knot moved: a tick, a tween, a drag. The layer keys on it. */
    motion: 0,
    lastCameraMove: 0,
    idleTimer: 0 as ReturnType<typeof setTimeout> | 0,
  });

  const graphIndex = useMemo(() => {
    const nodeById = new Map<WebNodeId, WebNode>();
    for (const node of props.graph.nodes) nodeById.set(node.id, node);
    const adjacency = new Map<WebNodeId, Set<WebNodeId>>();
    const edgesByNode = new Map<WebNodeId, WebEdge[]>();
    const touch = (a: WebNodeId, b: WebNodeId, edge: WebEdge) => {
      (adjacency.get(a) ?? adjacency.set(a, new Set()).get(a)!).add(b);
      (edgesByNode.get(a) ?? edgesByNode.set(a, []).get(a)!).push(edge);
    };
    for (const edge of props.graph.edges) {
      if (!nodeById.has(edge.from) || !nodeById.has(edge.to)) continue;
      touch(edge.from, edge.to, edge);
      touch(edge.to, edge.from, edge);
    }
    return { nodeById, adjacency, edgesByNode };
  }, [props.graph]);
  // A handle on the drawing's state, for the e2e specs (which run against a
  // production build) and for poking at it in the console. Read-only by
  // convention; nothing in the app reads it.
  if (typeof window !== 'undefined') (window as unknown as { __web?: unknown }).__web = state.current;
  state.current.nodeById = graphIndex.nodeById;
  state.current.adjacency = graphIndex.adjacency;
  state.current.edgesByNode = graphIndex.edgesByNode;

  /* ------------------------------------------------------------ helpers */

  const invalidate = () => {
    const s = state.current;
    s.dirty = true;
    if (!s.raf) s.raf = requestAnimationFrame(frame);
  };

  const toWorld = (sx: number, sy: number) => {
    const s = state.current;
    const { w, h } = s.size;
    return { x: (sx - w / 2) / s.camera.zoom + s.camera.x, y: (sy - h / 2) / s.camera.zoom + s.camera.y };
  };
  const toScreen = (x: number, y: number) => {
    const s = state.current;
    const { w, h } = s.size;
    return { x: (x - s.camera.x) * s.camera.zoom + w / 2, y: (y - s.camera.y) * s.camera.zoom + h / 2 };
  };

  const currentPos = (id: WebNodeId, now: number): Placed | null => {
    const s = state.current;
    const p = s.placed.get(id);
    if (!p) return null;
    if (propsRef.current.mode === 'organic') {
      const f = s.sim.get(id);
      if (f) {
        p.x = f.x;
        p.y = f.y;
        p.r = f.r;
      }
    } else {
      // Columns: `placed` already holds the layout's position, which is the
      // truth; a tween only moves the drawing along the way there and lands
      // exactly on it. Without a tween (reduced motion, or a fresh node) the
      // node is simply where the layout put it.
      const t = s.tweens.get(id);
      if (t) {
        const k = Math.min(1, (now - t.t0) / TWEEN_MS);
        const e = EASE(k);
        p.x = t.fromX + (t.toX - t.fromX) * e;
        p.y = t.fromY + (t.toY - t.fromY) * e;
        if (k >= 1) {
          p.x = t.toX;
          p.y = t.toY;
          s.tweens.delete(id);
        }
      }
    }
    return p;
  };

  const animateCamera = (to: Camera) => {
    const s = state.current;
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
      s.camera = { ...to };
      s.cameraFrom = null;
    } else {
      s.cameraFrom = { ...s.camera, t0: performance.now(), to: { ...to } };
    }
    invalidate();
  };

  const boundsNow = () => {
    const s = state.current;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    const consider = (x: number, y: number, hw: number, hh: number) => {
      minX = Math.min(minX, x - hw);
      minY = Math.min(minY, y - hh);
      maxX = Math.max(maxX, x + hw);
      maxY = Math.max(maxY, y + hh);
    };
    if (propsRef.current.mode === 'organic') {
      for (const f of s.sim.nodes) consider(f.x, f.y, f.r + 40, f.r + 24);
    } else {
      for (const [id, p] of s.placed) {
        const t = s.tweens.get(id);
        consider(t ? t.toX : p.x, t ? t.toY : p.y, p.w / 2, p.h / 2);
      }
      for (const f of s.folds) consider(f.x, f.y, f.width / 2, f.height / 2);
    }
    if (minX === Infinity) return { minX: -100, minY: -100, maxX: 100, maxY: 100 };
    return { minX, minY, maxX, maxY };
  };

  const fit = () => {
    const s = state.current;
    const b = boundsNow();
    const { w, h } = s.size;
    if (!w || !h) return;
    const pad = 48;
    const bw = Math.max(1, b.maxX - b.minX);
    const bh = Math.max(1, b.maxY - b.minY);
    // Columns never fit below 0.45: a column of eighty rows shrunk to fit the
    // window is a column of needles, and a reader would rather scroll.
    const floor = propsRef.current.mode === 'columns' ? 0.45 : ZOOM_MIN;
    const zoom = Math.max(floor, Math.min(propsRef.current.mode === 'columns' ? 1.15 : 1.6, (w - pad * 2) / bw, (h - pad * 2) / bh));
    animateCamera({ x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2, zoom });
  };

  const reportPins = () => propsRef.current.onPinsChange?.(state.current.sim.pinnedCount);

  useImperativeHandle(ref, () => ({
    fit,
    unpinAll: () => {
      const s = state.current;
      if (s.sim.unpinAll()) {
        reportPins();
        invalidate();
      }
    },
    centreOn: (id) => {
      const p = state.current.placed.get(id);
      if (p) animateCamera({ x: p.x, y: p.y, zoom: Math.max(state.current.camera.zoom, 0.8) });
    },
    zoomBy: (factor) => {
      const s = state.current;
      const zoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, s.camera.zoom * factor));
      animateCamera({ ...s.camera, zoom });
    },
  }));

  /* ------------------------------------------------------------- layout */

  useEffect(() => {
    const s = state.current;
    const { graph, mode, expandedColumns } = props;
    const now = performance.now();
    // The second field is the focus: `nodePoint()` in the e2e specs reads it
    // off `window.__web.layoutKey`. The fingerprint carries every node's step
    // and side and the edge set, because the columns depend on all of that
    // and a legend tick or a live respin can change it without changing a
    // single id (round 19 — before, such a change never re-ran the layout).
    const key = `${mode}|${graph.focus ?? ''}|${graph.depth ?? ''}|${graphFingerprint(graph)}|${[...expandedColumns].join(',')}`;
    if (key === s.layoutKey) return;
    s.layoutKey = key;
    // A tween in flight is folded into the new one below (it starts from
    // wherever the node is now); one for a node that is gone must not linger,
    // or the frame loop would never go quiet.
    s.tweens.clear();

    if (mode === 'columns' && graph.focus) {
      // Round 19: the layout's coordinates go into `placed` as they are. A
      // tween, when motion is allowed, is a way of *showing* the move from
      // where the node was — the organic spot it came from, or its old row —
      // and nothing more: `currentPos` walks it and lands on the layout.
      // Storing the prior position and trusting the tween to carry the node
      // over meant that under "reduced motion", where no tween is made, every
      // card stayed at its organic coordinates for ever: columns that looked
      // like a web, with S-curves for lines. Nobody could reproduce it on a
      // machine with animations on, because there the same picture lasted
      // 320 ms.
      const layout = columnLayout(graph, { expanded: expandedColumns });
      const next = new Map<WebNodeId, Placed>();
      const prefersReduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
      for (const laid of layout.nodes) {
        const prior = s.placed.get(laid.id);
        const fresh = !prior;
        if (prior && !prefersReduced && (prior.x !== laid.x || prior.y !== laid.y)) {
          s.tweens.set(laid.id, { fromX: prior.x, fromY: prior.y, toX: laid.x, toY: laid.y, t0: now, born: 0 });
        }
        next.set(laid.id, {
          x: laid.x,
          y: laid.y,
          w: laid.width,
          h: laid.height,
          r: 0,
          scale: fresh && !prefersReduced ? 0 : 1,
        });
        if (fresh && !prefersReduced) s.tweens.set(laid.id, { fromX: laid.x, fromY: laid.y, toX: laid.x, toY: laid.y, t0: now, born: now });
      }
      s.placed = next;
      s.folds = layout.folds;
      s.edgeToFold = layout.edgeToFold;
    } else {
      s.folds = [];
      s.edgeToFold = new Map();
      const focus = graph.focus;
      s.sim.options = { ...new ForceSim().options, ...ForceSim.optionsFor(graph.nodes.length) };
      s.sim.setGraph(graph, (id, degree) => radiusFor(degree, id === focus));
      s.sim.reheat(0.6);
      const coldStart = s.placed.size === 0;
      const next = new Map<WebNodeId, Placed>();
      for (const f of s.sim.nodes) {
        const prior = s.placed.get(f.id);
        next.set(f.id, { x: f.x, y: f.y, w: 0, h: 0, r: f.r, scale: prior ? prior.scale : 0 });
        if (!prior) s.tweens.set(f.id, { fromX: f.x, fromY: f.y, toX: f.x, toY: f.y, t0: now, born: now });
      }
      s.placed = next;
      // A cold start is settled off-screen so the first frame is a web, not a
      // burst; a warm graph keeps moving on screen, which is the pleasant part.
      if (coldStart && graph.nodes.length > 0) s.sim.settle(320);
      // A warm graph (a depth step, a legend tick) takes its first, wildest
      // ticks off-screen too — a few milliseconds — and animates the rest.
      else if (graph.nodes.length > 0) s.sim.settle(30);
      reportPins();
    }
    s.pendingFit = true;
    invalidate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.graph, props.mode, props.expandedColumns]);

  useEffect(() => {
    const s = state.current;
    if (s.fitKey === props.fitKey) return;
    s.fitKey = props.fitKey;
    s.pendingFit = true;
    invalidate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.fitKey]);

  useEffect(() => {
    invalidate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.selected, props.labelsAlways, props.showImages, props.words]);

  /* --------------------------------------------------------------- size */

  useEffect(() => {
    const host = hostRef.current;
    const canvas = canvasRef.current;
    if (!host || !canvas) return;
    const observer = new ResizeObserver(() => {
      const rect = host.getBoundingClientRect();
      // Capped at 2: a third pixel per pixel is invisible on a web and costs
      // more than twice the fill of every frame.
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const s = state.current;
      s.size = { w: Math.max(1, Math.round(rect.width)), h: Math.max(1, Math.round(rect.height)), dpr };
      canvas.width = Math.round(s.size.w * dpr);
      canvas.height = Math.round(s.size.h * dpr);
      canvas.style.width = `${s.size.w}px`;
      canvas.style.height = `${s.size.h}px`;
      s.palette = readPalette(host);
      invalidate();
    });
    observer.observe(host);
    const media = matchMedia('(prefers-color-scheme: dark)');
    const onTheme = () => {
      state.current.palette = readPalette(host);
      invalidate();
    };
    media.addEventListener('change', onTheme);
    const mutation = new MutationObserver(onTheme);
    mutation.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'class', 'style'] });
    return () => {
      observer.disconnect();
      media.removeEventListener('change', onTheme);
      mutation.disconnect();
      if (state.current.raf) cancelAnimationFrame(state.current.raf);
      state.current.raf = 0;
      if (state.current.idleTimer) clearTimeout(state.current.idleTimer);
      state.current.idleTimer = 0;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ---------------------------------------------------------- hit tests */

  const hitNode = (sx: number, sy: number): WebNodeId | null => {
    const s = state.current;
    const w = toWorld(sx, sy);
    const organic = propsRef.current.mode === 'organic';
    let best: WebNodeId | null = null;
    let bestD = Infinity;
    for (const [id, p] of s.placed) {
      if (organic) {
        const d = Math.hypot(w.x - p.x, w.y - p.y);
        // A small knot is still a finger-sized target on the screen.
        const reach = Math.max(p.r + 4 / s.camera.zoom, 10 / s.camera.zoom);
        if (d <= reach && d < bestD) {
          best = id;
          bestD = d;
        }
      } else if (Math.abs(w.x - p.x) <= p.w / 2 && Math.abs(w.y - p.y) <= p.h / 2) {
        return id;
      }
    }
    return best;
  };

  /** Where a pinned knot wears its speld: up and to the right of the knot, a fixed size on the screen. */
  const pinBadge = (p: Placed, zoom: number) => ({ x: p.x + p.r * 0.7 + 3 / zoom, y: p.y - p.r * 0.7 - 3 / zoom, r: 6 / zoom });

  /** The pinned knot whose speld is under the pointer, if any. */
  const hitPin = (sx: number, sy: number): WebNodeId | null => {
    const s = state.current;
    if (propsRef.current.mode !== 'organic') return null;
    const w = toWorld(sx, sy);
    for (const f of s.sim.nodes) {
      if (!f.pinned) continue;
      const p = s.placed.get(f.id);
      if (!p) continue;
      const b = pinBadge(p, s.camera.zoom);
      if (Math.hypot(w.x - b.x, w.y - b.y) <= b.r + 2 / s.camera.zoom) return f.id;
    }
    return null;
  };

  const hitFold = (sx: number, sy: number): string | null => {
    const s = state.current;
    if (propsRef.current.mode !== 'columns') return null;
    const w = toWorld(sx, sy);
    for (const f of s.folds) {
      if (Math.abs(w.x - f.x) <= f.width / 2 && Math.abs(w.y - f.y) <= f.height / 2) return f.id;
    }
    return null;
  };

  /* --------------------------------------------------------------- draw */

  const frame = () => {
    const s = state.current;
    s.raf = 0;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx || !s.palette) return;
    const now = performance.now();
    const { mode, graph, selected, labelsAlways, words, showImages } = propsRef.current;
    let busy = false;

    // Camera easing.
    if (s.cameraFrom) {
      const k = Math.min(1, (now - s.cameraFrom.t0) / CAMERA_MS);
      const e = EASE(k);
      s.camera = {
        x: s.cameraFrom.x + (s.cameraFrom.to.x - s.cameraFrom.x) * e,
        y: s.cameraFrom.y + (s.cameraFrom.to.y - s.cameraFrom.y) * e,
        zoom: s.cameraFrom.zoom + (s.cameraFrom.to.zoom - s.cameraFrom.zoom) * e,
      };
      if (k >= 1) s.cameraFrom = null;
      else busy = true;
    }

    const t0 = performance.now();
    let tPrev = t0;
    const t: Record<string, number> = {};
    const mark = (name: string) => {
      const n = performance.now();
      t[name] = (t[name] ?? 0) + (n - tPrev);
      tPrev = n;
    };
    // Simulation. Several ticks a frame while it is hot: alpha cools per
    // tick, not per millisecond, so a slow frame used to stretch the settling
    // into tens of seconds of a web that would not sit still.
    if (mode === 'organic' && !s.sim.settled) {
      const ticks = s.gesture?.kind === 'node' ? 1 : s.sim.alpha > 0.3 ? 4 : s.sim.alpha > 0.05 ? 3 : 2;
      for (let i = 0; i < ticks && s.sim.tick(); i++) busy = true;
      s.motion += 1;
    }

    // Positions, tweens, births.
    let tweening = false;
    for (const [id, p] of s.placed) {
      currentPos(id, now);
      const t = s.tweens.get(id);
      if (t) {
        busy = true;
        tweening = true;
        if (t.born) {
          const k = Math.min(1, (now - t.born) / BORN_MS);
          p.scale = EASE(k);
          if (k >= 1 && mode === 'organic') s.tweens.delete(id);
        }
      } else if (p.scale < 1) {
        p.scale = 1;
      }
    }
    if (tweening) s.motion += 1;

    // A fit that waited for the drawing to know its own size: at once for
    // columns, and for the organic web once the simulation has cooled a little.
    if (s.pendingFit && s.placed.size && (mode === 'columns' || s.sim.alpha < 0.08 || s.sim.settled)) {
      s.pendingFit = false;
      fit();
    } else if (s.pendingFit && s.placed.size) {
      busy = true;
    }

    const pal = s.palette;
    const { w, h, dpr } = s.size;
    const zoom = s.camera.zoom;
    const bucket = zoomBucket(zoom, dpr);
    const focusGraph = Boolean(graph.focus);
    // Steps from the middle, for the resting alpha of a line: one between
    // two knots that are both two or more steps out says nothing about the
    // middle, and there are hundreds of them in a filled archive at depth 2.
    const depthOf = (id: WebNodeId) => s.nodeById.get(id)?.depth ?? 0;

    // What is lit. One node "active" lights its neighbourhood and dims the rest.
    const active: WebNodeId | null = s.hover ?? (selected.size === 1 ? [...selected][0] : null);
    const lit = active ? new Set([active, ...(s.adjacency.get(active) ?? [])]) : null;
    const litEdges = active ? new Set((s.edgesByNode.get(active) ?? []).map((e) => e.id)) : null;

    // Viewport culling. The margin is 200 *screen* pixels, so that zoomed
    // far in the drawing does not paint a whole web that is off the screen —
    // but never less than the widest thing a knot's centre can be off-screen
    // by while its body is still on it: half a focus card in columns, a hub
    // and its ring in the organic web.
    const margin = Math.max(200 / zoom, mode === 'columns' ? FOCUS_NODE_W / 2 + 20 : 40);
    const view = {
      minX: s.camera.x - w / 2 / zoom - margin,
      maxX: s.camera.x + w / 2 / zoom + margin,
      minY: s.camera.y - h / 2 / zoom - margin,
      maxY: s.camera.y + h / 2 / zoom + margin,
    };
    const inView = (x: number, y: number) => x >= view.minX && x <= view.maxX && y >= view.minY && y <= view.maxY;
    /**
     * A *line* is on the glass when its box overlaps the view, which is not
     * the same question as whether either end is. Zoomed in on the belly of a
     * long line both ends and the middle are off-screen, and the line used to
     * vanish and come back as the camera crept — lines appearing and
     * disappearing with no reproduction. A box overlap can only ever draw a
     * line too many, never one too few.
     */
    const spansView = (a: { x: number; y: number }, b: { x: number; y: number }) =>
      Math.min(a.x, b.x) <= view.maxX &&
      Math.max(a.x, b.x) >= view.minX &&
      Math.min(a.y, b.y) <= view.maxY &&
      Math.max(a.y, b.y) >= view.minY;

    /*
     * Round 18 — the two speeds of a frame. Measured on a 4K canvas: a frame
     * cost 133 ms, of which the stroking of ~900 resting lines was 114 —
     * rasterising thin anti-aliased lines over eight million pixels, on every
     * hover, every pan and every tick of the simulation. So the resting lines
     * (and the step rings) live on a **layer** of their own, an offscreen
     * canvas rebuilt only when something under them moved — a tick, a tween,
     * the camera, the size, the palette, the graph — and a hover frame just
     * blits it and strokes the handful of lit lines on top. While the hand or
     * the simulation is moving, the layer is drawn at one pixel per CSS pixel
     * without dashes, and pan/zoom re-uses the last layer with a transform
     * until the hand has been still for a beat.
     */
    // Did the camera move since the last frame (for "is the hand moving"),
    // and is it away from where the layer was drawn (for "is the layer stale")?
    const cameraMoved = s.prevCam === null || s.prevCam.x !== s.camera.x || s.prevCam.y !== s.camera.y || s.prevCam.zoom !== s.camera.zoom;
    s.prevCam = { ...s.camera };
    if (cameraMoved) s.lastCameraMove = now;
    const layerOff = s.layerCam === null || s.layerCam.x !== s.camera.x || s.layerCam.y !== s.camera.y || s.layerCam.zoom !== s.camera.zoom;
    const inMotion =
      busy ||
      s.gesture?.kind === 'pan' ||
      s.gesture?.kind === 'pinch' ||
      s.gesture?.kind === 'node' ||
      now - s.lastCameraMove < 140;
    // While knots are actually moving the layer is drawn at half a pixel per
    // CSS pixel — soft lines under sharp knots, for a fifth of the pixels;
    // while only the camera moves, one pixel per pixel (and mostly reused).
    const layerDpr = busy ? 0.5 : inMotion ? 1 : dpr;
    // §45: `pal.key` and not `pal.paper` — a Keeper who turns only a line
    // colour leaves the paper alone, and the resting lines live in the layer.
    const baseKey = `${mode}|${s.layoutKey}|${pal.key}|${w}x${h}|${s.motion}|${graph.edges.length}|${labelsAlways ? 1 : 0}`;
    const layerKey = `${baseKey}|${layerDpr}`;
    const layerStale = layerOff || s.layerKey !== layerKey;
    // A moving camera over an unchanged web: blit the old layer transformed
    // rather than restroking everything, and come back for a proper one once
    // the hand is still. Not when the zoom has run away from the layer's —
    // a layer blown up threefold is mush.
    const zoomRatio = s.layerCam ? zoom / s.layerCam.zoom : 1;
    const reuseLayer = layerStale && inMotion && s.layerKey !== null && s.layerBase === baseKey && zoomRatio > 0.6 && zoomRatio < 1.7;
    if (inMotion && !busy) {
      // Nothing is animating, but the hand only just stopped: come back once
      // more in a moment to draw the sharp layer.
      if (s.idleTimer) clearTimeout(s.idleTimer);
      s.idleTimer = setTimeout(() => {
        s.idleTimer = 0;
        invalidate();
      }, 160);
    }

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    // Every picture on this context is a reduction — a sprite stamped a little
    // smaller than it was cut, a column card's thumb squeezed into 26 px — so
    // the good filter is worth its cost here as well as in the sprite.
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    /* --- geometry of every line in view, whatever is stroked --- */
    const endpoint = (id: WebNodeId, foldId?: string) => {
      if (foldId) {
        const f = s.folds.find((fold) => fold.id === foldId);
        return f ? { x: f.x, y: f.y, w: f.width, h: f.height, r: 0, scale: 1 } : null;
      }
      return s.placed.get(id) ?? null;
    };
    const stride = COLUMN_NODE_W + COLUMN_GAP_X;
    const columnOf = (x: number) => Math.round(x / stride);
    type Drawn = {
      edge: WebEdge;
      ax: number;
      ay: number;
      bx: number;
      by: number;
      mx: number;
      my: number;
      /** Control points for a column curve; absent for a straight line. */
      c?: [number, number, number, number];
      rest: number;
      lit: boolean;
      chosen: boolean;
      colour: string;
      width: number;
      dash: number[];
      born: number;
    };
    // A phrase sits 60% of the way from the lit knot towards its neighbour —
    // off the lit knot's own name, and on the side of the thing it explains.
    const chipT = (edge: WebEdge) => (active === edge.from ? 0.6 : active === edge.to ? 0.4 : 0.5);
    const drawn: Drawn[] = [];
    for (const edge of graph.edges) {
      const fold = s.edgeToFold.get(edge.id);
      const a = endpoint(edge.from, fold?.from);
      const b = endpoint(edge.to, fold?.to);
      if (!a || !b) continue;
      if (fold?.from && fold?.to) continue;
      if (!spansView(a, b)) continue;
      const info = EDGE_KINDS[edge.kind];
      const colour = edgeColour(edge, pal);
      const isLit = litEdges ? litEdges.has(edge.id) : false;
      const chosen = selected.size > 1 && selected.has(edge.from) && selected.has(edge.to);
      // In the organic web an unlit line is faint: the knots are the picture
      // and the lines are the texture, until a hand rests on one of them. In
      // columns, a line between neighbouring columns is the spine of the
      // drawing and is drawn in full; one that skips a column, crosses the
      // middle or stays in its own column is true but secondary, and is
      // drawn faint until a hand asks for it.
      let rest = 1;
      if (mode === 'organic') {
        const peripheral = focusGraph && depthOf(edge.from) >= 2 && depthOf(edge.to) >= 2;
        rest = peripheral ? PERIPHERAL_ALPHA : REST_ALPHA;
      } else if (fold?.from || fold?.to) {
        // Into a fold: a hundred lines landing on one row say "many", and
        // one faint fan says it as well as a black one.
        rest = 0.1;
      } else if (columnOf(a.x) === columnOf(b.x)) {
        // A tie inside one column is the columns' version of the periphery:
        // true, but not about the middle, and at depth 2 there are dozens
        // looping out past the same edge.
        rest = PERIPHERAL_ALPHA;
      } else if (Math.abs(columnOf(a.x) - columnOf(b.x)) !== 1) rest = 0.3;
      rest *= info.restAlpha ?? 1;
      const born = Math.round(Math.min(a.scale, b.scale) * 4) / 4;
      if (born <= 0) continue;
      const width = mode === 'organic' ? Math.min(info.width, 1.2) : info.width;

      let ax = a.x;
      let ay = a.y;
      let bx = b.x;
      let by = b.y;
      let mx: number;
      let my: number;
      let c: Drawn['c'];
      if (mode === 'columns') {
        // Leave from the side that faces the other column; a same-column tie
        // loops out to the right.
        const dir = Math.sign(b.x - a.x);
        if (dir === 0) {
          ax = a.x + a.w / 2;
          bx = b.x + b.w / 2;
          const bulge = 40 + Math.abs(by - ay) * 0.15;
          c = [ax + bulge, ay, bx + bulge, by];
        } else {
          ax = a.x + (dir * a.w) / 2;
          bx = b.x - (dir * b.w) / 2;
          const pull = Math.max(30, Math.abs(bx - ax) * 0.45);
          c = [ax + dir * pull, ay, bx - dir * pull, by];
        }
        ({ x: mx, y: my } = cubicAt(chipT(edge), ax, ay, c[0], c[1], c[2], c[3], bx, by));
      } else {
        // Straight, from rim to rim.
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const d = Math.hypot(dx, dy) || 1;
        ax = a.x + (dx / d) * a.r;
        ay = a.y + (dy / d) * a.r;
        bx = b.x - (dx / d) * b.r;
        by = b.y - (dy / d) * b.r;
        const t = chipT(edge);
        mx = ax + (bx - ax) * t;
        my = ay + (by - ay) * t;
      }
      drawn.push({ edge, ax, ay, bx, by, mx, my, c, rest, lit: isLit, chosen, colour, width, dash: info.dash, born });
    }

    /** Strokes a set of lines, bucketed by style, on any context already in world space. */
    const strokeLines = (
      target: CanvasRenderingContext2D,
      lines: Drawn[],
      alphaOf: (d: Drawn) => number,
      widthOf: (d: Drawn) => number,
      quality: 'sharp' | 'quick',
      caps: CanvasLineCap,
    ) => {
      const byStyle = new Map<string, { colour: string; dash: number[]; width: number; alpha: number; path: Path2D }>();
      for (const d of lines) {
        const alpha = Math.round(alphaOf(d) * 20) / 20;
        if (alpha <= 0) continue;
        if (quality === 'quick' && alpha < 0.15) continue;
        const width = widthOf(d);
        // Dashes are a fact about a line you can only read up close; far out
        // they cost a fifth of the frame and say nothing.
        const dash = quality === 'quick' || (zoom < 0.9 && !d.lit && !d.chosen) ? [] : d.dash;
        const key = `${d.colour}|${dash.join(',')}|${width}|${alpha}`;
        let style = byStyle.get(key);
        if (!style) {
          style = { colour: d.colour, dash, width, alpha, path: new Path2D() };
          byStyle.set(key, style);
        }
        style.path.moveTo(d.ax, d.ay);
        if (d.c) style.path.bezierCurveTo(d.c[0], d.c[1], d.c[2], d.c[3], d.bx, d.by);
        else style.path.lineTo(d.bx, d.by);
      }
      target.lineCap = caps;
      // A line grows on the screen as √zoom up to LINE_ZOOM_CAP and then no
      // further (`lineZoom`); its dashes keep step with its width.
      const lz = lineZoom(zoom);
      for (const style of byStyle.values()) {
        target.globalAlpha = style.alpha;
        target.strokeStyle = style.colour;
        target.lineWidth = style.width / lz;
        target.setLineDash(style.dash.map((v) => v / lz));
        target.stroke(style.path);
      }
      target.setLineDash([]);
      target.globalAlpha = 1;
    };

    /** The step rings of an organic focus web, on any context already in world space. */
    const drawSteps = (target: CanvasRenderingContext2D, kind: Type) => {
      if (!(mode === 'organic' && focusGraph && s.sim.rings.length > 1)) return;
      const gap = s.sim.options.ringGap;
      // The bands are round the sim's origin, where the middle is drawn to.
      const centre = { x: 0, y: 0 };
      target.save();
      target.strokeStyle = pal.inkMuted;
      target.lineWidth = 1.2 / zoom;
      target.setLineDash([4 / zoom, 5 / zoom]);
      kind.font(600, 11 / zoom);
      target.textAlign = 'center';
      target.textBaseline = 'bottom';
      for (let d = 1; d < s.sim.rings.length; d++) {
        const band = s.sim.rings[d];
        if (!band || band.outer === 0) continue;
        // The gutter before this band, shaded a shade darker, with a dotted
        // line down its middle and the step count beside it.
        const r = band.inner - gap / 2;
        if (r <= 0) continue;
        target.globalAlpha = 0.045;
        target.fillStyle = pal.ink;
        target.beginPath();
        target.arc(centre.x, centre.y, band.inner, 0, Math.PI * 2);
        target.arc(centre.x, centre.y, Math.max(0, band.inner - gap), 0, Math.PI * 2, true);
        target.fill();
        target.globalAlpha = 0.5;
        target.beginPath();
        target.arc(centre.x, centre.y, r, 0, Math.PI * 2);
        target.stroke();
        if (r >= 50) {
          target.fillStyle = pal.inkMuted;
          const a = (-3 * Math.PI) / 4;
          crispText(target, kind, textScale(zoom), 600, 11 / zoom, d === 1 ? '1 stap' : `${d} stappen`, centre.x + Math.cos(a) * r, centre.y + Math.sin(a) * r - 3 / zoom, 0);
        }
      }
      target.restore();
      kind.forget();
    };

    mark('setup');

    /* --- the resting layer: rings and every line at rest --- */
    const layer = layerRef.current;
    if (layer && layerStale && !reuseLayer) {
      const lw = Math.max(1, Math.round(w * layerDpr));
      const lh = Math.max(1, Math.round(h * layerDpr));
      if (layer.width !== lw || layer.height !== lh) {
        layer.width = lw;
        layer.height = lh;
      }
      const lctx = layer.getContext('2d');
      if (lctx) {
        lctx.setTransform(layerDpr, 0, 0, layerDpr, 0, 0);
        lctx.clearRect(0, 0, w, h);
        lctx.save();
        lctx.translate(w / 2, h / 2);
        lctx.scale(zoom, zoom);
        lctx.translate(-s.camera.x, -s.camera.y);
        drawSteps(lctx, new Type(lctx, pal.sans));
        strokeLines(lctx, drawn, (d) => d.rest * d.born, (d) => d.width, inMotion ? 'quick' : 'sharp', 'butt');
        lctx.restore();
      }
      s.layerKey = layerKey;
      s.layerBase = baseKey;
      s.layerCam = { ...s.camera };
      s.layerDpr = layerDpr;
    }
    mark('layer');

    // Place the layer: where it is when the camera is where the layer was
    // drawn, shifted and scaled by CSS when the camera has moved since (the
    // compositor does that, not the raster). Lit: the rest fades under it.
    if (layer && s.layerCam) {
      const c0 = s.layerCam;
      const k = zoom / c0.zoom;
      const tx = (w / 2) * (1 - k) + (c0.x - s.camera.x) * zoom;
      const ty = (h / 2) * (1 - k) + (c0.y - s.camera.y) * zoom;
      const transform = Math.abs(k - 1) < 1e-6 && Math.abs(tx) < 0.01 && Math.abs(ty) < 0.01 ? '' : `translate(${tx}px, ${ty}px) scale(${k})`;
      if (layer.style.transform !== transform) layer.style.transform = transform;
      const opacity = litEdges ? String((DIM * 0.5) / REST_ALPHA) : '';
      if (layer.style.opacity !== opacity) layer.style.opacity = opacity;
    }

    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.scale(zoom, zoom);
    ctx.translate(-s.camera.x, -s.camera.y);
    const type = new Type(ctx, pal.sans);

    // The lines that are not at rest: lit or chosen, on top, in full.
    const alive = litEdges || selected.size > 1 ? drawn.filter((d) => d.lit || d.chosen) : [];
    if (alive.length) {
      strokeLines(
        ctx,
        alive,
        (d) => d.born,
        (d) => (mode === 'organic' ? EDGE_KINDS[d.edge.kind].width : d.width) * (d.lit ? 1.35 : 1) + (d.chosen ? 0.8 : 0),
        'sharp',
        'round',
      );
    }

    // Arrowheads on lit lines (and on every line in columns, where direction
    // is the point): a small ink triangle at the receiving end.
    const arrowed = mode === 'columns' ? drawn : alive;
    for (const d of arrowed) {
      if (d.edge.kind === 'thread' && !d.edge.detail) continue;
      const alpha = d.lit || d.chosen ? d.born : d.rest * d.born;
      if (alpha < 0.3) continue;
      const size = 7 / lineZoom(zoom);
      // Direction at the end of the curve: for columns the tangent is horizontal.
      let ux: number;
      let uy: number;
      if (mode === 'columns') {
        const dir = Math.sign(d.bx - d.ax) || 1;
        ux = dir;
        uy = 0;
      } else {
        const dx = d.bx - d.ax;
        const dy = d.by - d.ay;
        const len = Math.hypot(dx, dy) || 1;
        ux = dx / len;
        uy = dy / len;
      }
      ctx.globalAlpha = alpha;
      ctx.fillStyle = d.colour;
      ctx.beginPath();
      ctx.moveTo(d.bx, d.by);
      ctx.lineTo(d.bx - ux * size - uy * size * 0.55, d.by - uy * size + ux * size * 0.55);
      ctx.lineTo(d.bx - ux * size + uy * size * 0.55, d.by - uy * size - ux * size * 0.55);
      ctx.closePath();
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    mark('edges');
    /* --- nodes --- */
    type.font(500, 13);
    ctx.textBaseline = 'middle';
    const focusId = graph.focus;
    // Names are drawn in a pass of their own after every knot, so a name never
    // sits under a neighbour's knot and the pass can decide which names fit.
    type LabelWish = { id: WebNodeId; p: Placed; node: WebNode; rank: number; strong: boolean; dimmed: boolean };
    const wishes: LabelWish[] = [];
    const pinsToDraw: { p: Placed; colour: string }[] = [];
    let spritesMade = 0;

    for (const [id, p] of s.placed) {
      const node = s.nodeById.get(id);
      if (!node || !inView(p.x, p.y)) continue;
      const isFocus = id === focusId;
      const isSelected = selected.has(id);
      const isHover = s.hover === id;
      const isLit = lit ? lit.has(id) : false;
      const dimmed = lit ? !isLit && !isSelected : false;
      const colour = nodeColour(node, pal);
      const alpha = (dimmed ? DIM : 1) * Math.max(0.001, p.scale);

      ctx.save();
      ctx.globalAlpha = alpha;
      if (p.scale < 1) {
        ctx.translate(p.x, p.y);
        ctx.scale(0.6 + 0.4 * p.scale, 0.6 + 0.4 * p.scale);
        ctx.translate(-p.x, -p.y);
      }

      if (mode === 'columns') {
        const x = p.x - p.w / 2;
        const y = p.y - p.h / 2;
        // Paper on a hard shadow (a second rect, offset: a canvas shadow is a
        // blur pass per card, even at blur 0), a coloured tab down the left,
        // the icon, the name.
        ctx.fillStyle = 'rgba(31, 27, 22, 0.18)';
        roundRect(ctx, x + 2, y + 2, p.w, p.h, 3);
        ctx.fill();
        ctx.fillStyle = isFocus ? pal.paperRaised : pal.paper;
        roundRect(ctx, x, y, p.w, p.h, 3);
        ctx.fill();
        ctx.strokeStyle = isSelected || isHover ? colour : pal.rule;
        ctx.lineWidth = isSelected ? 2.2 : isHover ? 1.6 : 1;
        ctx.stroke();
        // The kind's silhouette on the left edge, where the stripe was: the
        // same shape the organic web draws, so the two views agree.
        ctx.fillStyle = colour;
        if (node.kind === 'entry') ctx.fillRect(x, y, isFocus ? 7 : 5, p.h);
        else {
          ctx.fillRect(x, y, 3, p.h);
          knotPath(ctx, node.kind, x + 3 + (isFocus ? 9 : 7), p.y, isFocus ? 7 : 5.5);
          ctx.fill();
        }
        const iconSize = isFocus ? 22 : 16;
        const thumb = showImages && node.coverAssetId ? coverFor(node.coverAssetId, bucket, invalidate) : null;
        const inset = node.kind === 'entry' ? 0 : isFocus ? 16 : 13;
        let textX = x + inset + (isFocus ? 42 : 31);
        if (thumb) {
          const tw = isFocus ? 40 : 26;
          const th = p.h - 6;
          ctx.save();
          roundRect(ctx, x + inset + 9, p.y - th / 2, tw, th, 2);
          ctx.clip();
          drawCover(ctx, thumb.img, x + inset + 9 + tw / 2, p.y, tw, th, cropFor(node.coverCrop, 'portrait'));
          ctx.restore();
          textX = x + inset + 9 + tw + 8;
        } else {
          drawIcon(ctx, nodeIcon(node), x + inset + (isFocus ? 26 : 19), p.y, iconSize, colour);
        }
        ctx.fillStyle = pal.ink;
        const maxW = p.w - (textX - x) - 10;
        if (isFocus) {
          type.font(600, 15);
          ctx.fillText(type.ellipsis(600, 15, node.name, maxW), textX, p.y - (node.subtitle ? 8 : 0));
          if (node.subtitle) {
            type.font(400, 11.5);
            ctx.fillStyle = pal.inkMuted;
            ctx.fillText(type.ellipsis(400, 11.5, node.subtitle, maxW), textX, p.y + 10);
          }
        } else {
          type.font(500, 13);
          ctx.fillText(type.ellipsis(500, 13, node.name, maxW), textX, p.y);
        }
      } else {
        // A knot in the shape of its kind, in the soort's colour, on a ring of paper.
        const r = p.r;
        knotPath(ctx, node.kind, p.x, p.y, r + (isSelected ? 3 : 0));
        ctx.fillStyle = isSelected ? colour : pal.paperRaised;
        ctx.fill();
        knotPath(ctx, node.kind, p.x, p.y, r);
        ctx.fillStyle = withAlpha(colour, isFocus || isHover || isSelected ? 1 : 0.85);
        ctx.fill();
        ctx.strokeStyle = isSelected ? pal.paper : withAlpha(pal.ink, 0.25);
        ctx.lineWidth = isSelected ? 2 : 1;
        ctx.stroke();
        if (node.isCharacter) {
          // A karakter: a second, thin ring — somebody plays this one.
          ctx.beginPath();
          ctx.arc(p.x, p.y, r + 2.5, 0, Math.PI * 2);
          ctx.strokeStyle = colour;
          ctx.lineWidth = 1;
          ctx.setLineDash([3, 2.5]);
          ctx.stroke();
          ctx.setLineDash([]);
        }
        const picture = showImages && node.coverAssetId && r * zoom >= 7 ? coverFor(node.coverAssetId, bucket, invalidate) : null;
        let stamped = false;
        if (picture) {
          // The omslag inside the knot, with the soort's colour left as a rim
          // — stamped from a sprite; at most a couple of dozen new sprites a
          // frame, the rest next frame, so a new graph does not hitch.
          const rr = r - 1.5;
          const crop = cropFor(node.coverCrop, 'square');
          const key = spriteKey(node.coverAssetId!, picture.variant, node.kind, rr, bucket, crop);
          let sprite = spriteCache.get(key) ?? null;
          if (!sprite && spritesMade < 24) {
            sprite = coverSprite(picture.img, key, node.kind, rr, bucket, crop);
            spritesMade += 1;
          } else if (!sprite) busy = true;
          if (sprite) {
            const half = sprite.half;
            ctx.drawImage(sprite.canvas, p.x - half, p.y - half, half * 2, half * 2);
            stamped = true;
          }
        }
        if (!stamped && r * zoom >= 10) {
          drawIcon(ctx, nodeIcon(node), p.x, p.y, Math.min(r * 1.1, 18), pal.paper, 1.9);
        }
        const held = s.sim.get(id);
        if (held?.pinned) pinsToDraw.push({ p, colour });

        // Which names to draw is decided below; here the knot only says how
        // much it wants one. Lower rank goes first.
        const strong = isFocus || isSelected || isHover;
        const landmark = r >= 10.5;
        const rank = isFocus ? 0 : isSelected || isHover ? 1 : isLit ? 2 : landmark ? 3 : 4;
        if (rank <= 3 || zoom >= LABEL_ZOOM_LOW) wishes.push({ id, p, node, rank, strong, dimmed });
      }
      ctx.restore();
      type.forget();
    }

    mark('nodes');
    /* --- pins: a speld on every knot a hand has put down --- */
    for (const { p, colour } of pinsToDraw) {
      const b = pinBadge(p, zoom);
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
      ctx.fillStyle = pal.paperRaised;
      ctx.fill();
      ctx.strokeStyle = colour;
      ctx.lineWidth = 1.2 / zoom;
      ctx.stroke();
      // The pin itself: a head and a point.
      ctx.beginPath();
      ctx.arc(b.x, b.y - b.r * 0.2, b.r * 0.34, 0, Math.PI * 2);
      ctx.fillStyle = pal.ink;
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(b.x, b.y + b.r * 0.05);
      ctx.lineTo(b.x, b.y + b.r * 0.6);
      ctx.strokeStyle = pal.ink;
      ctx.lineWidth = 1.1 / zoom;
      ctx.stroke();
    }

    mark('pins');
    /* --- names (organic): by rank, and only where there is room --- */
    if (mode === 'organic' && wishes.length) {
      // Zoomed out, a name on every knot is a fog; the hubs are the landmarks
      // and the rest arrive as you come closer. A name is the same size on the
      // screen whatever the zoom — it is a caption, not a thing in the world —
      // small, on at most two lines, with a halo of paper instead of a slip of
      // it, and never on top of another name: the ranks decide who yields.
      wishes.sort((a, b) => a.rank - b.rank || b.p.r - a.p.r);
      const fade = Math.max(0, Math.min(1, (zoom - LABEL_ZOOM_LOW) / (LABEL_ZOOM_HIGH - LABEL_ZOOM_LOW)));
      const taken: { x: number; y: number; w: number; h: number }[] = [];
      // Knots themselves are in the way too: a name may not land on a knot.
      for (const [, p] of s.placed) if (inView(p.x, p.y)) taken.push({ x: p.x, y: p.y, w: p.r * 2, h: p.r * 2 });
      const knotCount = taken.length;
      const textK = textScale(zoom);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.lineJoin = 'round';
      for (const wish of wishes) {
        const { p, node, rank, strong, dimmed } = wish;
        const wishAlpha = rank <= 3 ? 1 : fade;
        if (wishAlpha <= 0.02) continue;
        const size = (strong ? 11.5 : 10) / zoom;
        const weight = strong ? 600 : 500;
        const lines = type.wrap(weight, size, node.name, 104 / zoom);
        let tw = 0;
        for (const line of lines) tw = Math.max(tw, type.width(weight, size, line));
        const lh = size * 1.15;
        const bh = lh * lines.length;
        const top = p.y + p.r + 3 / zoom;
        const box = { x: p.x, y: top + bh / 2, w: tw + 6 / zoom, h: bh + 2 / zoom };
        let clash = false;
        for (let i = 0; i < taken.length; i++) {
          const t = taken[i];
          // Its own knot is directly above it and is not in the way.
          if (i < knotCount && t.x === p.x && t.y === p.y) continue;
          if (Math.abs(t.x - box.x) < (t.w + box.w) / 2 && Math.abs(t.y - box.y) < (t.h + box.h) / 2) {
            clash = true;
            break;
          }
        }
        // The middle, the chosen and the one under the hand always speak.
        if (clash && rank > 1) continue;
        taken.push(box);
        ctx.globalAlpha = wishAlpha * (dimmed ? 0.6 : 1) * Math.max(0.001, p.scale);
        ctx.strokeStyle = pal.paper;
        ctx.fillStyle = dimmed ? pal.inkMuted : pal.ink;
        for (let i = 0; i < lines.length; i++) {
          crispText(ctx, type, textK, weight, size, lines[i], p.x, top + 1 / zoom + i * lh, 3 / zoom);
        }
      }
      ctx.globalAlpha = 1;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
    }

    mark('names');
    /* --- folds --- */
    for (const f of s.folds) {
      if (!inView(f.x, f.y)) continue;
      const x = f.x - f.width / 2;
      const y = f.y - f.height / 2;
      ctx.save();
      ctx.setLineDash([4, 3]);
      ctx.strokeStyle = s.hoverFold === f.id ? pal.ink : pal.inkMuted;
      ctx.lineWidth = 1;
      ctx.fillStyle = withAlpha(pal.paperDark, 0.6);
      roundRect(ctx, x, y, f.width, f.height, 3);
      ctx.fill();
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = pal.inkMuted;
      type.font(500, 12.5);
      ctx.fillText(type.ellipsis(500, 12.5, `… nog ${f.count} — dubbelklik`, f.width - 16), x + 8, f.y);
      ctx.restore();
      type.forget();
    }

    mark('folds');
    /* --- edge phrases: for the lit node, or for every line when asked --- */
    const wantLabels = labelsAlways ? drawn : litEdges ? drawn.filter((d) => litEdges.has(d.edge.id)) : [];
    if (wantLabels.length && zoom >= 0.35) {
      const size = 10 / zoom;
      const textK = textScale(zoom);
      type.font(500, size);
      ctx.textAlign = 'center';
      const seen: { x: number; y: number; w: number; h: number }[] = [];
      for (const d of wantLabels) {
        if (!inView(d.mx, d.my)) continue;
        const phrase = EDGE_KINDS[d.edge.kind].phrase(words, d.edge.detail);
        const text = type.ellipsis(500, size, phrase, 160 / zoom);
        const tw = type.width(500, size, text);
        const bw = tw + 8 / zoom;
        const bh = size * 1.45;
        // Nudge a chip that would sit on another one, and leave it out when
        // there is no room: a chip you cannot read says less than none.
        let y = d.my;
        let placed = false;
        for (let tries = 0; tries < 5; tries++) {
          const clash = seen.some((b) => Math.abs(b.x - d.mx) < (b.w + bw) / 2 && Math.abs(b.y - y) < (b.h + bh) / 2);
          if (!clash) {
            placed = true;
            break;
          }
          y = d.my + bh * 1.1 * (tries % 2 === 0 ? tries / 2 + 1 : -Math.ceil((tries + 1) / 2));
        }
        if (!placed) continue;
        seen.push({ x: d.mx, y, w: bw, h: bh });
        ctx.globalAlpha = Math.min(1, (d.lit || d.chosen ? 1 : d.rest) + 0.2);
        ctx.fillStyle = pal.paperRaised;
        ctx.strokeStyle = withAlpha(d.colour, 0.7);
        ctx.lineWidth = 1 / zoom;
        roundRect(ctx, d.mx - bw / 2, y - bh / 2, bw, bh, 2 / zoom);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = d.colour;
        crispText(ctx, type, textK, 500, size, text, d.mx, y + size * 0.05, 0);
      }
      ctx.globalAlpha = 1;
      ctx.textAlign = 'left';
    }
    ctx.restore();

    /* --- marquee, in screen space --- */
    if (s.marquee) {
      const m = s.marquee;
      ctx.save();
      ctx.strokeStyle = pal.ink;
      ctx.setLineDash([5, 4]);
      ctx.lineWidth = 1;
      ctx.fillStyle = withAlpha(pal.ink, 0.06);
      const x = Math.min(m.x0, m.x1);
      const y = Math.min(m.y0, m.y1);
      ctx.fillRect(x, y, Math.abs(m.x1 - m.x0), Math.abs(m.y1 - m.y0));
      ctx.strokeRect(x, y, Math.abs(m.x1 - m.x0), Math.abs(m.y1 - m.y0));
      ctx.restore();
    }

    mark('phrases');
    s.stats = { ...t, total: performance.now() - t0, nEdges: graph.edges.length, nNodes: s.placed.size, dpr, w, h, zoom };
    s.dirty = false;
    if (busy) s.raf = requestAnimationFrame(frame);
  };

  /* ------------------------------------------------------------ pointer */

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const s = state.current;

    const local = (e: PointerEvent | WheelEvent) => {
      const rect = canvas.getBoundingClientRect();
      return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    };

    const setHover = (id: WebNodeId | null, fold: string | null) => {
      if (s.hover !== id || s.hoverFold !== fold) {
        s.hover = id;
        s.hoverFold = fold;
        canvas.style.cursor = id || fold ? 'pointer' : s.gesture?.kind === 'pan' ? 'grabbing' : 'grab';
        propsRef.current.onHover?.(id);
        invalidate();
      }
    };

    const onDown = (e: PointerEvent) => {
      const p = local(e);
      s.pointers.set(e.pointerId, p);
      canvas.setPointerCapture(e.pointerId);
      if (s.pointers.size === 2) {
        const [a, b] = [...s.pointers.values()];
        s.gesture = {
          kind: 'pinch',
          startX: 0,
          startY: 0,
          cameraX: s.camera.x,
          cameraY: s.camera.y,
          pinchDist: Math.hypot(a.x - b.x, a.y - b.y),
          pinchZoom: s.camera.zoom,
          pinchMid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
          moved: true,
          shift: false,
          time: performance.now(),
        };
        s.marquee = null;
        return;
      }
      if (e.button !== 0) return;
      // A tap on a speld lets that knot go; nothing else happens.
      const pinned = hitPin(p.x, p.y);
      if (pinned) {
        const f = s.sim.get(pinned);
        if (f) {
          f.pinned = false;
          s.sim.reheat(0.2);
          reportPins();
          invalidate();
        }
        s.gesture = null;
        return;
      }
      const node = hitNode(p.x, p.y);
      s.cameraFrom = null;
      s.pendingFit = false;
      s.gesture = {
        kind: 'maybe',
        startX: p.x,
        startY: p.y,
        cameraX: s.camera.x,
        cameraY: s.camera.y,
        node: node ?? undefined,
        nodeStart: node ? { ...s.placed.get(node)! } : undefined,
        moved: false,
        shift: e.shiftKey,
        time: performance.now(),
      };
    };

    const onMove = (e: PointerEvent) => {
      const p = local(e);
      if (s.pointers.has(e.pointerId)) s.pointers.set(e.pointerId, p);
      const g = s.gesture;
      if (!g) {
        if (e.pointerType === 'mouse') {
          const pin = hitPin(p.x, p.y);
          setHover(pin ?? hitNode(p.x, p.y), hitFold(p.x, p.y));
        }
        return;
      }
      if (g.kind === 'pinch' && s.pointers.size >= 2) {
        const [a, b] = [...s.pointers.values()];
        const dist = Math.hypot(a.x - b.x, a.y - b.y);
        const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        const zoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, (g.pinchZoom ?? 1) * (dist / (g.pinchDist || 1))));
        // Keep the world point under the midpoint under the midpoint.
        const before = toWorld(mid.x, mid.y);
        s.camera.zoom = zoom;
        const after = toWorld(mid.x, mid.y);
        s.camera.x += before.x - after.x;
        s.camera.y += before.y - after.y;
        const pm = g.pinchMid!;
        s.camera.x -= (mid.x - pm.x) / zoom;
        s.camera.y -= (mid.y - pm.y) / zoom;
        g.pinchMid = mid;
        invalidate();
        return;
      }
      const dx = p.x - g.startX;
      const dy = p.y - g.startY;
      if (g.kind === 'maybe') {
        if (Math.hypot(dx, dy) < 4) return;
        g.moved = true;
        if (g.shift) {
          g.kind = 'marquee';
        } else if (g.node && propsRef.current.mode === 'organic') {
          g.kind = 'node';
          const f = s.sim.get(g.node);
          if (f) f.fixed = true;
        } else {
          g.kind = 'pan';
          canvas.style.cursor = 'grabbing';
        }
      }
      if (g.kind === 'pan') {
        s.camera.x = g.cameraX - dx / s.camera.zoom;
        s.camera.y = g.cameraY - dy / s.camera.zoom;
        invalidate();
      } else if (g.kind === 'node' && g.node) {
        const f = s.sim.get(g.node);
        const w = toWorld(p.x, p.y);
        if (f) {
          f.x = w.x;
          f.y = w.y;
          f.vx = 0;
          f.vy = 0;
          // Warm, not hot: the neighbours follow, the far side of the web
          // barely stirs. 0.25 made the whole wall bob on every drag.
          s.sim.reheat(0.12);
        }
        invalidate();
      } else if (g.kind === 'marquee') {
        s.marquee = { x0: g.startX, y0: g.startY, x1: p.x, y1: p.y };
        invalidate();
      }
    };

    const onUp = (e: PointerEvent) => {
      const p = local(e);
      s.pointers.delete(e.pointerId);
      const g = s.gesture;
      if (!g) return;
      if (g.kind === 'pinch') {
        if (s.pointers.size < 2) s.gesture = null;
        return;
      }
      s.gesture = null;
      canvas.style.cursor = s.hover ? 'pointer' : 'grab';
      const { onSelect, onFocus, onUnfold, selected } = propsRef.current;

      if (g.kind === 'node' && g.node) {
        // A knot a hand has put down stays put: it is pinned, and wears a
        // speld a tap on which lets it go again. Before round 17 it was let
        // go at once and sprang straight back into the clot, so "moving" a
        // knot did nothing.
        const f = s.sim.get(g.node);
        if (f) {
          f.fixed = false;
          f.pinned = true;
        }
        s.sim.reheat(0.12);
        reportPins();
        invalidate();
        return;
      }
      if (g.kind === 'marquee') {
        const m = s.marquee;
        s.marquee = null;
        invalidate();
        if (!m) return;
        const x0 = Math.min(m.x0, m.x1);
        const x1 = Math.max(m.x0, m.x1);
        const y0 = Math.min(m.y0, m.y1);
        const y1 = Math.max(m.y0, m.y1);
        const picked = new Set<WebNodeId>(selected);
        for (const [id, pos] of s.placed) {
          const sp = toScreen(pos.x, pos.y);
          if (sp.x >= x0 && sp.x <= x1 && sp.y >= y0 && sp.y <= y1) picked.add(id);
        }
        onSelect(picked);
        return;
      }
      if (g.kind === 'pan' || g.moved) return;

      // A tap. Double-tap on a node focuses; on a fold unfolds.
      const now = performance.now();
      const fold = hitFold(p.x, p.y);
      if (fold) {
        const column = Number(fold.split(':')[1]);
        if (s.lastClick.id === fold && now - s.lastClick.at < 420) {
          s.lastClick = { id: null, at: 0 };
          onUnfold(column);
        } else {
          s.lastClick = { id: fold, at: now };
          if (e.pointerType !== 'mouse') onUnfold(column);
        }
        return;
      }
      const node = g.node ?? null;
      if (node && s.lastClick.id === node && now - s.lastClick.at < 420) {
        s.lastClick = { id: null, at: 0 };
        onFocus(node);
        return;
      }
      s.lastClick = { id: node, at: now };
      if (!node) {
        if (!g.shift && selected.size) onSelect(new Set());
        return;
      }
      if (g.shift || e.ctrlKey || e.metaKey) {
        const next = new Set(selected);
        if (next.has(node)) next.delete(node);
        else next.add(node);
        onSelect(next);
      } else {
        onSelect(new Set([node]));
      }
    };

    const onCancel = (e: PointerEvent) => {
      s.pointers.delete(e.pointerId);
      if (s.gesture?.kind === 'node' && s.gesture.node) {
        const f = s.sim.get(s.gesture.node);
        if (f) f.fixed = false;
      }
      s.gesture = null;
      s.marquee = null;
      invalidate();
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const p = local(e);
      const factor = Math.exp(-e.deltaY * (e.deltaMode === 1 ? 0.05 : 0.0016));
      const zoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, s.camera.zoom * factor));
      const before = toWorld(p.x, p.y);
      s.cameraFrom = null;
      s.pendingFit = false;
      s.camera.zoom = zoom;
      const after = toWorld(p.x, p.y);
      s.camera.x += before.x - after.x;
      s.camera.y += before.y - after.y;
      invalidate();
    };

    const onLeave = () => setHover(null, null);

    // The keyboard: Escape lets go of the selection, + and − zoom, F fits.
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        propsRef.current.onSelect(new Set());
      } else if (e.key === '+' || e.key === '=') {
        animateCamera({ ...s.camera, zoom: Math.min(ZOOM_MAX, s.camera.zoom * 1.3) });
      } else if (e.key === '-') {
        animateCamera({ ...s.camera, zoom: Math.max(ZOOM_MIN, s.camera.zoom / 1.3) });
      } else if (e.key === 'f' || e.key === 'F') {
        fit();
      } else {
        return;
      }
      e.preventDefault();
    };

    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointercancel', onCancel);
    canvas.addEventListener('pointerleave', onLeave);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    canvas.addEventListener('keydown', onKey);
    return () => {
      canvas.removeEventListener('keydown', onKey);
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onCancel);
      canvas.removeEventListener('pointerleave', onLeave);
      canvas.removeEventListener('wheel', onWheel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div ref={hostRef} className="web-stage" data-testid="web-stage" data-mode={props.mode}>
      {/* The resting lines, on a canvas of their own under the drawing (round 18): the compositor stacks the two. */}
      <canvas ref={layerRef} className="web-canvas-layer" aria-hidden="true" />
      <canvas ref={canvasRef} className="web-canvas" aria-label="Het web" role="img" tabIndex={0} />
    </div>
  );
});
