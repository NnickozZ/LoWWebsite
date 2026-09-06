/**
 * §33: the tekenlaag — free-hand drawing on a prikbord, a landkaart or a
 * tijdlijn. Types and limits only; no imports, so the browser bundle and the
 * server share one definition without dragging anything else along.
 *
 * A stroke is a record, never a bitmap. That is what lets several people draw
 * at once without one overwriting the other (the merge is "add and sort"),
 * what lets a gum be undone, and what keeps the document small: a stroke is a
 * few hundred numbers, a bitmap of a wall is megabytes.
 *
 * **The gum is a stroke too.** `mode: 'erase'` is drawn with
 * `destination-out`, in the same time order as everything else, so it takes
 * away only what was there *before* it and anything drawn afterwards sits on
 * top again. A real, pixel-precise gum without ever cutting a stroke in two —
 * which is the operation that would have made the merge hard. The price is
 * that erased ink stays in the data, invisible, until a Keeper wipes the
 * layer; `INK_STROKE_LIMIT` is the ceiling that keeps that honest.
 */

export type InkMode = 'ink' | 'erase';

/**
 * The eight colours, in the order they sit in the toolbar: zwart, wit, rood,
 * oranje, geel, groen, blauw, paars. Stored by index, never as CSS, so nothing
 * a client sends ends up inside a canvas call.
 */
export const INK_COLOURS = [
  '#1f1a15',
  '#f6f1e6',
  '#c0392b',
  '#d9711c',
  '#e0b62a',
  '#2f6b4f',
  '#1f4e79',
  '#5b3a78',
] as const;

export const INK_COLOUR_NAMES = ['zwart', 'wit', 'rood', 'oranje', 'geel', 'groen', 'blauw', 'paars'] as const;

/** The three brushes, as a width in screen pixels at zoom 1: dun, normaal, dik. */
export const INK_BRUSHES = [3, 6, 12] as const;

/**
 * The three gummen, as a width in screen pixels at zoom 1: klein, normaal,
 * groot. Every one of them is wider than the brush of the same rank — you
 * erase a mistake, not trace it — and the widest takes a whole line away in
 * one sweep.
 */
export const INK_ERASERS = [12, 24, 48] as const;

/** Widths are stored in the place's own units; this is the sanity ceiling. */
export const INK_MAX_WIDTH = 4000;

/**
 * Which space a stroke's numbers are in. Absent — and it is absent on every
 * stroke saved before round 12 — means v0: whatever the place meant then. `1`
 * is the tijdlijn's similarity space (x an absolute moment in seconds, y
 * seconds from the axis, width in seconds), where a drawing grows and shrinks
 * with the zoom the way ink on a prikbord does.
 *
 * The flag rides on the *stroke*, never on the layer: a stroke is immutable
 * once saved (§33), nothing is ever migrated, and so a tekenlaag holds both
 * formats side by side forever. A v0 stroke is read and drawn by the v0
 * formula, byte for byte as it always was.
 */
export type InkFormat = 1;

/**
 * A v1 width is measured in the same unit as its coordinates, and on a
 * tijdlijn that unit runs from a second to a millennium — a 3 px brush is
 * 0.015 at the finest zoom and about 10^8 at the coarsest. `INK_MAX_WIDTH`
 * would clamp both ends into nonsense, so v1 has bounds of its own, wide
 * enough for every scale and still a fence against a client sending Infinity.
 */
export const INK_V1_MIN_WIDTH = 1e-6;
export const INK_V1_MAX_WIDTH = 1e12;
/** Significant figures kept on a v1 width; three decimals would be useless at 10^-2. */
export const INK_V1_WIDTH_DIGITS = 6;

/** Numbers per stroke: `[x, y, p, x, y, p, …]`, so 2 000 points. */
export const INK_MAX_POINTS = 6000;

/** Strokes per layer. Past this the server refuses new ones until a Keeper wipes it. */
export const INK_STROKE_LIMIT = 2000;

/** How long a lifted stroke is remembered, and how many — the corkboard's rule (§8). */
export const INK_TOMBSTONE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const INK_TOMBSTONE_LIMIT = 500;

export type InkStroke = {
  /** Made by the client; `s_` and ten characters. */
  id: string;
  /** The account that drew it. Server-side; a viewer is only ever told `mine`. */
  by?: string;
  /** Server time at saving, milliseconds. The one order everything is drawn in. */
  at: number;
  mode: InkMode;
  /** Index into `INK_COLOURS`. Ignored when erasing. */
  colour: number;
  /** In the place's own units (board units, picture pixels, seconds on a tijdlijn). */
  width: number;
  /** `[x, y, p, x, y, p, …]` — `p` is pen pressure 0..1, 1 without a pen. */
  points: number[];
  /** Which space `points` and `width` are in. Absent is v0; see `InkFormat`. */
  v?: InkFormat;
};

/** A stroke as a browser sees it: who drew it is reduced to "was it you". */
export type InkStrokeView = Omit<InkStroke, 'by'> & { mine?: boolean };

export type InkLayer = {
  /** Sorted by `at`, then id. */
  strokes: InkStroke[];
  /** Stroke id → when it was lifted (undo). */
  deleted: Record<string, number>;
  /** The Keeper's switch. Off: nobody draws or erases; what is there stays. */
  enabled: boolean;
  /** When a Keeper last wiped the layer, or null. */
  clearedAt: number | null;
};

export type InkLayerView = Omit<InkLayer, 'strokes' | 'deleted'> & { strokes: InkStrokeView[] };

/** What a client sends. Everything optional; the server decides what it may do. */
export type InkPatch = {
  strokes?: unknown[];
  /** Ids of one's own strokes to lift. */
  undo?: unknown[];
  /** Keeper only. */
  enabled?: unknown;
  /** Keeper only: wipe the layer. */
  clear?: unknown;
};

/** Where a tekenlaag can hang. */
export type InkKind = 'board' | 'map' | 'timeline';
export const INK_KINDS: readonly InkKind[] = ['board', 'map', 'timeline'];

export function isInkKind(value: unknown): value is InkKind {
  return typeof value === 'string' && (INK_KINDS as readonly string[]).includes(value);
}

/**
 * One frame of a stroke in progress, on the wire to everyone else at the
 * place: the stroke's id and look, and the points added *since the last
 * frame*. `e` marks the last frame; `a` says the stroke was abandoned (a
 * second finger arrived, a key was pressed) and should be thrown away. Never
 * stored, never merged — a frame is sight, and the save that follows the
 * hand lifting is what makes it true.
 */
export type InkFrame = {
  id: string;
  m: InkMode;
  k: number;
  w: number;
  p: number[];
  /** The stroke's space, so a live frame is sized the way the saved stroke will be. */
  v?: InkFormat;
  e?: 1;
  a?: 1;
};
