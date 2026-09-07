'use client';

import { useEffect, useImperativeHandle, useMemo, useRef, forwardRef } from 'react';
import { ICON_PATHS } from '@/components/Icon';
import { ForceSim, radiusFor } from '@/lib/web/force';
import { EDGE_KINDS, NODE_KINDS } from '@/lib/web/kinds';
import { COLUMN_GAP_X, COLUMN_NODE_W, columnLayout, type ColumnLayout } from '@/lib/web/layout';
import type { WebEdge, WebGraph, WebNode, WebNodeId } from '@/lib/web/types';
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
 * edge, the lines are ink and draad in the colours `lib/web/kinds.ts` gives
 * them, and the paper, the ink and the rule come from the page's own CSS
 * variables so the dark face (§29) is honoured without a second palette here.
 */

export type WebMode = 'columns' | 'organic';

export type WebCanvasHandle = {
  /** Fit the whole drawing in view, animated. */
  fit: () => void;
  /** Bring one node to the centre, animated, without changing the zoom. */
  centreOn: (id: WebNodeId) => void;
  zoomBy: (factor: number) => void;
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
};

type Camera = { x: number; y: number; zoom: number };
type Placed = { x: number; y: number; w: number; h: number; r: number; scale: number };
type Tween = { fromX: number; fromY: number; toX: number; toY: number; t0: number; born: number };

const EASE = (t: number) => 1 - Math.pow(1 - t, 3);
const TWEEN_MS = 320;
const BORN_MS = 260;
const CAMERA_MS = 380;
const ZOOM_MIN = 0.12;
const ZOOM_MAX = 4;
const DIM = 0.28;

function readPalette(el: HTMLElement): Palette {
  const css = getComputedStyle(el);
  const get = (name: string, fallback: string) => css.getPropertyValue(name).trim() || fallback;
  const paper = get('--paper', '#f3eee2');
  const dark = luminance(paper) < 0.45;
  return {
    paper,
    paperRaised: get('--paper-raised', '#f8f4ea'),
    paperDark: get('--paper-dark', '#e6dfcf'),
    ink: get('--ink', '#1f1b16'),
    inkMuted: get('--ink-muted', '#5c544a'),
    rule: get('--rule', '#c9c0ad'),
    dark,
    sans: get('--sans', 'system-ui, sans-serif'),
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

function nodeColour(node: WebNode, palette: Palette): string {
  if (node.kind === 'entry' && node.typeColour) return node.typeColour;
  const info = NODE_KINDS[node.kind];
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

const widthCache = new Map<string, number>();
function textWidth(ctx: CanvasRenderingContext2D, text: string): number {
  const key = `${ctx.font}|${text}`;
  let w = widthCache.get(key);
  if (w === undefined) {
    w = ctx.measureText(text).width;
    if (widthCache.size > 4000) widthCache.clear();
    widthCache.set(key, w);
  }
  return w;
}

function ellipsis(ctx: CanvasRenderingContext2D, text: string, max: number): string {
  if (textWidth(ctx, text) <= max) return text;
  let lo = 0;
  let hi = text.length;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (textWidth(ctx, `${text.slice(0, mid)}…`) <= max) lo = mid;
    else hi = mid - 1;
  }
  return `${text.slice(0, Math.max(0, lo)).trimEnd()}…`;
}

/**
 * A name on at most two lines, each no wider than `max`; the second line gets
 * the ellipsis. A long name wrapped is a label you can read; a long name cut
 * to one line is "The missing body of…" three times in one web.
 */
function wrapName(ctx: CanvasRenderingContext2D, text: string, max: number, lines = 2): string[] {
  if (textWidth(ctx, text) <= max) return [text];
  const words = text.split(/\s+/).filter(Boolean);
  const out: string[] = [];
  let line = '';
  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    const next = line ? `${line} ${word}` : word;
    if (textWidth(ctx, next) <= max) {
      line = next;
      continue;
    }
    if (out.length === lines - 1) {
      out.push(ellipsis(ctx, `${next}`, max));
      return out;
    }
    if (line) out.push(line);
    else out.push(ellipsis(ctx, word, max));
    line = line ? word : '';
  }
  if (line) {
    if (out.length === lines) out[lines - 1] = ellipsis(ctx, `${out[lines - 1]} ${line}`, max);
    else out.push(line);
  }
  return out.slice(0, lines);
}

/** Omslagen, loaded once each; a frame is asked for when one arrives. */
const imageCache = new Map<string, HTMLImageElement | null>();
function coverImage(assetId: string, onLoad: () => void): HTMLImageElement | null {
  if (imageCache.has(assetId)) return imageCache.get(assetId) ?? null;
  imageCache.set(assetId, null);
  const img = new Image();
  img.decoding = 'async';
  img.onload = () => {
    imageCache.set(assetId, img);
    onLoad();
  };
  img.onerror = () => imageCache.set(assetId, null);
  img.src = `/api/assets/${assetId}?s=thumb`;
  return null;
}

/** Draws a picture cover-fitted into the current clip, centred on (x, y). */
function drawCover(ctx: CanvasRenderingContext2D, img: HTMLImageElement, x: number, y: number, w: number, h: number) {
  const scale = Math.max(w / img.naturalWidth, h / img.naturalHeight);
  const dw = img.naturalWidth * scale;
  const dh = img.naturalHeight * scale;
  ctx.drawImage(img, x - dw / 2, y - dh / 2, dw, dh);
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
      const t = s.tweens.get(id);
      if (t) {
        const k = Math.min(1, (now - t.t0) / TWEEN_MS);
        const e = EASE(k);
        p.x = t.fromX + (t.toX - t.fromX) * e;
        p.y = t.fromY + (t.toY - t.fromY) * e;
        if (k >= 1) s.tweens.delete(id);
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
    const zoom = Math.max(ZOOM_MIN, Math.min(propsRef.current.mode === 'columns' ? 1.15 : 1.6, (w - pad * 2) / bw, (h - pad * 2) / bh));
    animateCamera({ x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2, zoom });
  };

  useImperativeHandle(ref, () => ({
    fit,
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
    const key = `${mode}|${graph.focus ?? ''}|${graph.depth ?? ''}|${graph.nodes.map((n) => n.id).join(',')}|${[...expandedColumns].join(',')}`;
    if (key === s.layoutKey) return;
    s.layoutKey = key;
    // A tween in flight is folded into the new one below (it starts from
    // wherever the node is now); one for a node that is gone must not linger,
    // or the frame loop would never go quiet.
    s.tweens.clear();

    if (mode === 'columns' && graph.focus) {
      const layout = columnLayout(graph, { expanded: expandedColumns });
      const next = new Map<WebNodeId, Placed>();
      const prefersReduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
      for (const laid of layout.nodes) {
        const prior = s.placed.get(laid.id);
        const fresh = !prior;
        if (prior && !prefersReduced && (prior.x !== laid.x || prior.y !== laid.y)) {
          s.tweens.set(laid.id, { fromX: prior.x, fromY: prior.y, toX: laid.x, toY: laid.y, t0: now, born: 0 });
        } else {
          s.tweens.delete(laid.id);
        }
        next.set(laid.id, {
          x: prior ? prior.x : laid.x,
          y: prior ? prior.y : laid.y,
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
      const dpr = Math.min(3, window.devicePixelRatio || 1);
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
        const reach = p.r + 4 / s.camera.zoom;
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

    // Simulation.
    if (mode === 'organic' && s.sim.tick()) busy = true;

    // Positions, tweens, births.
    for (const [id, p] of s.placed) {
      currentPos(id, now);
      const t = s.tweens.get(id);
      if (t) {
        busy = true;
        if (t.born) {
          const k = Math.min(1, (now - t.born) / BORN_MS);
          p.scale = EASE(k);
          if (k >= 1 && mode === 'organic') s.tweens.delete(id);
        }
      } else if (p.scale < 1) {
        p.scale = 1;
      }
    }

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
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.scale(s.camera.zoom, s.camera.zoom);
    ctx.translate(-s.camera.x, -s.camera.y);
    const zoom = s.camera.zoom;

    // What is lit. One node "active" lights its neighbourhood and dims the rest.
    const active: WebNodeId | null = s.hover ?? (selected.size === 1 ? [...selected][0] : null);
    const lit = active ? new Set([active, ...(s.adjacency.get(active) ?? [])]) : null;
    const litEdges = active ? new Set((s.edgesByNode.get(active) ?? []).map((e) => e.id)) : null;

    // Viewport culling.
    const view = {
      minX: s.camera.x - w / 2 / zoom - 200,
      maxX: s.camera.x + w / 2 / zoom + 200,
      minY: s.camera.y - h / 2 / zoom - 200,
      maxY: s.camera.y + h / 2 / zoom + 200,
    };
    const inView = (x: number, y: number) => x >= view.minX && x <= view.maxX && y >= view.minY && y <= view.maxY;

    /* --- edges --- */
    const endpoint = (id: WebNodeId, foldId?: string) => {
      if (foldId) {
        const f = s.folds.find((fold) => fold.id === foldId);
        return f ? { x: f.x, y: f.y, w: f.width, h: f.height, r: 0, scale: 1 } : null;
      }
      return s.placed.get(id) ?? null;
    };

    const stride = COLUMN_NODE_W + COLUMN_GAP_X;
    const columnOf = (x: number) => Math.round(x / stride);
    type Drawn = { edge: WebEdge; ax: number; ay: number; bx: number; by: number; mx: number; my: number; alpha: number; colour: string };
    // A phrase sits 60% of the way from the lit knot towards its neighbour —
    // off the lit knot's own name, and on the side of the thing it explains.
    const chipT = (edge: WebEdge) => (active === edge.from ? 0.6 : active === edge.to ? 0.4 : 0.5);
    const drawn: Drawn[] = [];
    const byStyle = new Map<string, { colour: string; dash: number[]; width: number; alpha: number; path: Path2D }>();

    for (const edge of graph.edges) {
      const fold = s.edgeToFold.get(edge.id);
      const a = endpoint(edge.from, fold?.from);
      const b = endpoint(edge.to, fold?.to);
      if (!a || !b) continue;
      if (fold?.from && fold?.to) continue;
      if (!inView(a.x, a.y) && !inView(b.x, b.y) && !inView((a.x + b.x) / 2, (a.y + b.y) / 2)) continue;
      const info = EDGE_KINDS[edge.kind];
      const colour = pal.dark ? info.colourDark : info.colour;
      const isLit = litEdges ? litEdges.has(edge.id) : true;
      const selectedEdge = selected.size > 1 && selected.has(edge.from) && selected.has(edge.to);
      // In the organic web an unlit line is faint: the knots are the picture
      // and the lines are the texture, until a hand rests on one of them. In
      // columns, a line between neighbouring columns is the spine of the
      // drawing and is drawn in full; one that skips a column, crosses the
      // middle or stays in its own column is true but secondary, and is
      // drawn faint until a hand asks for it.
      let rest = 1;
      if (mode === 'organic') rest = 0.42;
      else if (Math.abs(columnOf(a.x) - columnOf(b.x)) !== 1) rest = 0.3;
      const alpha = (litEdges ? (isLit || selectedEdge ? 1 : DIM * 0.5) : rest) * Math.min(a.scale, b.scale);
      const width = (mode === 'organic' && !(litEdges && isLit) ? Math.min(info.width, 1.2) : info.width) * (isLit && litEdges ? 1.35 : 1) + (selectedEdge ? 0.8 : 0);
      const key = `${colour}|${info.dash.join(',')}|${width}|${alpha.toFixed(2)}`;
      let bucket = byStyle.get(key);
      if (!bucket) {
        bucket = { colour, dash: info.dash, width, alpha, path: new Path2D() };
        byStyle.set(key, bucket);
      }

      let ax = a.x;
      let ay = a.y;
      let bx = b.x;
      let by = b.y;
      let mx: number;
      let my: number;
      if (mode === 'columns') {
        // Leave from the side that faces the other column; a same-column tie
        // loops out to the right.
        const dir = Math.sign(b.x - a.x);
        if (dir === 0) {
          ax = a.x + a.w / 2;
          bx = b.x + b.w / 2;
          const bulge = 40 + Math.abs(by - ay) * 0.15;
          bucket.path.moveTo(ax, ay);
          bucket.path.bezierCurveTo(ax + bulge, ay, bx + bulge, by, bx, by);
          ({ x: mx, y: my } = cubicAt(chipT(edge), ax, ay, ax + bulge, ay, bx + bulge, by, bx, by));
        } else {
          ax = a.x + (dir * a.w) / 2;
          bx = b.x - (dir * b.w) / 2;
          const pull = Math.max(30, Math.abs(bx - ax) * 0.45);
          bucket.path.moveTo(ax, ay);
          bucket.path.bezierCurveTo(ax + dir * pull, ay, bx - dir * pull, by, bx, by);
          ({ x: mx, y: my } = cubicAt(chipT(edge), ax, ay, ax + dir * pull, ay, bx - dir * pull, by, bx, by));
        }
      } else {
        // Straight, from rim to rim.
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const d = Math.hypot(dx, dy) || 1;
        ax = a.x + (dx / d) * a.r;
        ay = a.y + (dy / d) * a.r;
        bx = b.x - (dx / d) * b.r;
        by = b.y - (dy / d) * b.r;
        bucket.path.moveTo(ax, ay);
        bucket.path.lineTo(bx, by);
        const t = chipT(edge);
        mx = ax + (bx - ax) * t;
        my = ay + (by - ay) * t;
      }
      drawn.push({ edge, ax, ay, bx, by, mx, my, alpha, colour });
    }

    for (const bucket of byStyle.values()) {
      ctx.save();
      ctx.globalAlpha = bucket.alpha;
      ctx.strokeStyle = bucket.colour;
      ctx.lineWidth = bucket.width / Math.sqrt(zoom);
      ctx.setLineDash(bucket.dash.map((d) => d / Math.sqrt(zoom)));
      ctx.lineCap = 'round';
      ctx.stroke(bucket.path);
      ctx.restore();
    }

    // Arrowheads on lit lines (and on every line in columns, where direction
    // is the point): a small ink triangle at the receiving end.
    const showArrows = mode === 'columns' || Boolean(litEdges);
    if (showArrows) {
      for (const d of drawn) {
        if (d.edge.kind === 'thread') continue;
        if (litEdges && !litEdges.has(d.edge.id) && mode !== 'columns') continue;
        if (d.alpha < 0.3) continue;
        const size = 7 / Math.sqrt(zoom);
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
        ctx.save();
        ctx.globalAlpha = d.alpha;
        ctx.fillStyle = d.colour;
        ctx.beginPath();
        ctx.moveTo(d.bx, d.by);
        ctx.lineTo(d.bx - ux * size - uy * size * 0.55, d.by - uy * size + ux * size * 0.55);
        ctx.lineTo(d.bx - ux * size + uy * size * 0.55, d.by - uy * size - ux * size * 0.55);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
    }

    /* --- nodes --- */
    ctx.font = `500 13px ${pal.sans}`;
    ctx.textBaseline = 'middle';
    const focusId = graph.focus;

    for (const [id, p] of s.placed) {
      const node = s.nodeById.get(id);
      if (!node || !inView(p.x, p.y)) continue;
      const isFocus = id === focusId;
      const isSelected = selected.has(id);
      const isHover = s.hover === id;
      const dimmed = lit ? !lit.has(id) && !isSelected : false;
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
        // Paper with a shadow, a coloured tab down the left, the icon, the name.
        ctx.shadowColor = 'rgba(31, 27, 22, 0.18)';
        ctx.shadowBlur = 0;
        ctx.shadowOffsetX = 2;
        ctx.shadowOffsetY = 2;
        ctx.fillStyle = isFocus ? pal.paperRaised : pal.paper;
        roundRect(ctx, x, y, p.w, p.h, 3);
        ctx.fill();
        ctx.shadowColor = 'transparent';
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
        const thumb = showImages && node.coverAssetId ? coverImage(node.coverAssetId, invalidate) : null;
        const inset = node.kind === 'entry' ? 0 : isFocus ? 16 : 13;
        let textX = x + inset + (isFocus ? 42 : 31);
        if (thumb) {
          const tw = isFocus ? 40 : 26;
          const th = p.h - 6;
          ctx.save();
          roundRect(ctx, x + inset + 9, p.y - th / 2, tw, th, 2);
          ctx.clip();
          drawCover(ctx, thumb, x + inset + 9 + tw / 2, p.y, tw, th);
          ctx.restore();
          textX = x + inset + 9 + tw + 8;
        } else {
          drawIcon(ctx, nodeIcon(node), x + inset + (isFocus ? 26 : 19), p.y, iconSize, colour);
        }
        ctx.fillStyle = pal.ink;
        const maxW = p.w - (textX - x) - 10;
        if (isFocus) {
          ctx.font = `600 15px ${pal.sans}`;
          ctx.fillText(ellipsis(ctx, node.name, maxW), textX, p.y - (node.subtitle ? 8 : 0));
          if (node.subtitle) {
            ctx.font = `400 11.5px ${pal.sans}`;
            ctx.fillStyle = pal.inkMuted;
            ctx.fillText(ellipsis(ctx, node.subtitle, maxW), textX, p.y + 10);
          }
          ctx.font = `500 13px ${pal.sans}`;
        } else {
          ctx.fillText(ellipsis(ctx, node.name, maxW), textX, p.y);
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
        const picture = showImages && node.coverAssetId && r * zoom >= 7 ? coverImage(node.coverAssetId, invalidate) : null;
        if (picture) {
          // The omslag inside the knot, with the soort's colour left as a rim.
          ctx.save();
          knotPath(ctx, node.kind, p.x, p.y, r - 1.5);
          ctx.clip();
          drawCover(ctx, picture, p.x, p.y, (r - 1.5) * 2, (r - 1.5) * 2);
          ctx.restore();
        } else if (r * zoom >= 10) {
          drawIcon(ctx, nodeIcon(node), p.x, p.y, Math.min(r * 1.1, 18), pal.paper, 1.9);
        }

        // Labels: every lit node, the hubs, and everything once zoomed in.
        // Zoomed out, a name on every knot is a fog; the hubs are the
        // landmarks and the rest arrive as you come closer. A label is the
        // same size on the screen whatever the zoom — it is a caption, not a
        // thing in the world — small, on at most two lines, on a faint slip
        // of paper only wide enough for the words.
        const showLabel = isHover || isSelected || isFocus || (lit ? lit.has(id) : false) || zoom >= 1.25 || r * zoom >= 15;
        if (showLabel) {
          const size = (isFocus || isSelected || isHover ? 11.5 : 10) / zoom;
          ctx.font = `${isFocus || isSelected ? 600 : 500} ${size}px ${pal.sans}`;
          ctx.textAlign = 'center';
          const lines = wrapName(ctx, node.name, 96 / zoom);
          const tw = Math.max(...lines.map((line) => textWidth(ctx, line)));
          const lh = size * 1.15;
          const top = p.y + r + 3 / zoom;
          ctx.fillStyle = withAlpha(pal.paper, dimmed ? 0.45 : 0.72);
          roundRect(ctx, p.x - tw / 2 - 3 / zoom, top, tw + 6 / zoom, lh * lines.length + 2 / zoom, 2 / zoom);
          ctx.fill();
          ctx.fillStyle = dimmed ? pal.inkMuted : pal.ink;
          ctx.textBaseline = 'top';
          lines.forEach((line, i) => ctx.fillText(line, p.x, top + 1 / zoom + i * lh));
          ctx.textBaseline = 'middle';
          ctx.textAlign = 'left';
          ctx.font = `500 13px ${pal.sans}`;
        }
      }
      ctx.restore();
    }

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
      ctx.font = `500 12.5px ${pal.sans}`;
      ctx.fillText(ellipsis(ctx, `… nog ${f.count} — dubbelklik`, f.width - 16), x + 8, f.y);
      ctx.restore();
    }

    /* --- edge phrases: for the lit node, or for every line when asked --- */
    const wantLabels = labelsAlways ? drawn : litEdges ? drawn.filter((d) => litEdges.has(d.edge.id)) : [];
    if (wantLabels.length && zoom >= 0.35) {
      const size = 10 / zoom;
      ctx.font = `500 ${size}px ${pal.sans}`;
      ctx.textAlign = 'center';
      const seen: { x: number; y: number; w: number; h: number }[] = [];
      for (const d of wantLabels) {
        if (!inView(d.mx, d.my)) continue;
        const phrase = EDGE_KINDS[d.edge.kind].phrase(words, d.edge.detail);
        const text = ellipsis(ctx, phrase, 160 / zoom);
        const tw = textWidth(ctx, text);
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
        ctx.save();
        ctx.globalAlpha = Math.min(1, d.alpha + 0.2);
        ctx.fillStyle = pal.paperRaised;
        ctx.strokeStyle = withAlpha(d.colour, 0.7);
        ctx.lineWidth = 1 / zoom;
        roundRect(ctx, d.mx - bw / 2, y - bh / 2, bw, bh, 2 / zoom);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = d.colour;
        ctx.fillText(text, d.mx, y + size * 0.05);
        ctx.restore();
      }
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
        if (e.pointerType === 'mouse') setHover(hitNode(p.x, p.y), hitFold(p.x, p.y));
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
          s.sim.reheat(0.25);
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
        const f = s.sim.get(g.node);
        if (f) f.fixed = false;
        s.sim.reheat(0.2);
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
      <canvas ref={canvasRef} className="web-canvas" aria-label="Het web" role="img" tabIndex={0} />
    </div>
  );
});
