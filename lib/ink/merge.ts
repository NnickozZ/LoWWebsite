import {
  INK_COLOURS,
  INK_MAX_POINTS,
  INK_MAX_WIDTH,
  INK_STROKE_LIMIT,
  INK_TOMBSTONE_LIMIT,
  INK_TOMBSTONE_TTL_MS,
  INK_V1_MAX_WIDTH,
  INK_V1_MIN_WIDTH,
  INK_V1_WIDTH_DIGITS,
  type InkFormat,
  type InkFrame,
  type InkLayer,
  type InkLayerView,
  type InkPatch,
  type InkStroke,
} from './types';

/**
 * §33: the tekenlaag's document and its merge rule. Pure — no database, no
 * React — so `tests/unit/ink-merge.test.ts` can pin the concurrency down the
 * way `board-merge.test.ts` does for cards.
 *
 * Strokes are immutable once saved, which makes the merge almost trivial:
 * anything new is appended, anything already known is kept as it was, and
 * everything is sorted by the server's clock. The one thing the corkboard
 * taught us (§8, tombstones) applies here too: a stroke that undo has lifted
 * must not come back when a client with an old screen sends its list again,
 * so lifting is written down.
 */

const STROKE_ID = /^[A-Za-z0-9_-]{1,40}$/;

const finite = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);

/** Three decimals is plenty for a board unit or a second; it keeps the row small. */
const round = (n: number) => Math.round(n * 1000) / 1000;

/** The space a stroke or a frame claims to be in; anything else is v0. */
const readFormat = (value: unknown): InkFormat | undefined => (value === 1 ? 1 : undefined);

/**
 * A width, clamped to what its space can mean.
 *
 * v0 is pixels or board units: 0.1 … 4000, three decimals, exactly as it has
 * always been — a stroke already in a column must read back as the number that
 * was written. v1 is the content unit itself, which on a tijdlijn spans ten
 * orders of magnitude, so it gets bounds wide enough for a year scale and
 * *significant figures* rather than decimals: three decimals would round a
 * 3 px brush at the finest zoom (0.015) to something usable but a 12 px one at
 * the coarsest (10^8) to noise, and the old 0.1 floor would fatten the first
 * to twenty pixels.
 */
const inkWidth = (value: number, v: InkFormat | undefined, rounder: (n: number) => number): number =>
  v === 1
    ? Math.min(INK_V1_MAX_WIDTH, Math.max(INK_V1_MIN_WIDTH, Number(value.toPrecision(INK_V1_WIDTH_DIGITS))))
    : Math.min(INK_MAX_WIDTH, Math.max(0.1, rounder(value)));

const asIs = (n: number) => n;

export function emptyInk(): InkLayer {
  return { strokes: [], deleted: {}, enabled: true, clearedAt: null };
}

/** The points of a stroke, read off the wire: finite triples, pressure clamped, capped. */
export function normalisePoints(input: unknown): number[] | null {
  if (!Array.isArray(input)) return null;
  const out: number[] = [];
  // Whole triples only, and no more than the cap (itself a multiple of three).
  const n = Math.min(input.length - (input.length % 3), INK_MAX_POINTS - (INK_MAX_POINTS % 3));
  for (let i = 0; i < n; i += 3) {
    const x = input[i];
    const y = input[i + 1];
    const p = input[i + 2];
    if (!finite(x) || !finite(y)) return null;
    out.push(round(x), round(y), finite(p) ? Math.min(1, Math.max(0, round(p))) : 1);
  }
  return out.length >= 3 ? out : null;
}

/** One stroke off the wire or out of the database. Null if it is not a stroke. */
export function normaliseStroke(input: unknown): InkStroke | null {
  if (!input || typeof input !== 'object') return null;
  const raw = input as Partial<InkStroke>;
  if (typeof raw.id !== 'string' || !STROKE_ID.test(raw.id)) return null;
  const points = normalisePoints(raw.points);
  if (!points) return null;
  const mode = raw.mode === 'erase' ? 'erase' : 'ink';
  const colour = finite(raw.colour) ? Math.min(INK_COLOURS.length - 1, Math.max(0, Math.round(raw.colour))) : 0;
  // The whitelist is the point of this function, so the space has to be copied
  // over on purpose: a stroke that lost its `v` here would be read back as v0
  // and drawn in the wrong place forever.
  const v = readFormat(raw.v);
  const width = finite(raw.width) ? inkWidth(raw.width, v, round) : 1;
  return {
    id: raw.id,
    by: typeof raw.by === 'string' && raw.by ? raw.by : undefined,
    at: finite(raw.at) ? Math.round(raw.at) : 0,
    mode,
    colour,
    width,
    points,
    v,
  };
}

function normaliseTombstones(input: unknown, now: number): Record<string, number> {
  if (!input || typeof input !== 'object') return {};
  return Object.fromEntries(
    Object.entries(input as Record<string, unknown>)
      .filter(
        (pair): pair is [string, number] =>
          STROKE_ID.test(pair[0]) && finite(pair[1]) && now - pair[1] < INK_TOMBSTONE_TTL_MS,
      )
      .sort((a, b) => b[1] - a[1])
      .slice(0, INK_TOMBSTONE_LIMIT),
  );
}

/** Time order, and a stable tiebreak for two strokes saved in one millisecond. */
export function sortStrokes(strokes: InkStroke[]): InkStroke[] {
  return [...strokes].sort((a, b) => a.at - b.at || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/** Accepts whatever is in the column and returns a valid layer. */
export function normaliseInk(input: unknown, now = Date.now()): InkLayer {
  const raw = (input ?? {}) as Partial<InkLayer>;
  const deleted = normaliseTombstones(raw.deleted, now);
  const seen = new Set<string>();
  const strokes: InkStroke[] = [];
  if (Array.isArray(raw.strokes)) {
    for (const item of raw.strokes) {
      const stroke = normaliseStroke(item);
      if (!stroke || seen.has(stroke.id) || stroke.id in deleted) continue;
      seen.add(stroke.id);
      strokes.push(stroke);
    }
  }
  return {
    strokes: sortStrokes(strokes),
    deleted,
    enabled: raw.enabled !== false,
    clearedAt: finite(raw.clearedAt) ? raw.clearedAt : null,
  };
}

export type InkMergeResult = {
  layer: InkLayer;
  /** Strokes that were added. */
  added: number;
  /** Strokes the patch sent that the layer had no room for. */
  refused: number;
  /** Strokes lifted by undo. */
  lifted: number;
};

/**
 * The merge. `actor` is who is saving: new strokes become theirs, and undo may
 * lift only theirs. `enabled` and `clear` are applied as given — deciding
 * whether the actor *may* send them is the service's job, not this file's.
 */
export function mergeInk(
  stored: unknown,
  patch: InkPatch,
  actor: { id: string; isKeeper: boolean },
  now = Date.now(),
): InkMergeResult {
  const base = normaliseInk(stored, now);
  let strokes = base.strokes;
  const deleted = { ...base.deleted };
  let clearedAt = base.clearedAt;
  let enabled = base.enabled;
  let added = 0;
  let refused = 0;
  let lifted = 0;

  if (patch.clear === true) {
    strokes = [];
    // A wipe buries nothing: the strokes are simply gone, and a late save of
    // one of them lands on an empty layer as a new stroke would. Undo cannot
    // reach past a wipe, so the tombstones can go too.
    for (const key of Object.keys(deleted)) delete deleted[key];
    clearedAt = now;
  }

  if (typeof patch.enabled === 'boolean') enabled = patch.enabled;

  if (Array.isArray(patch.undo)) {
    const mine = new Set(
      strokes.filter((stroke) => stroke.by === actor.id).map((stroke) => stroke.id),
    );
    for (const id of patch.undo) {
      if (typeof id !== 'string' || !mine.has(id)) continue;
      deleted[id] = now;
      lifted += 1;
    }
    if (lifted) strokes = strokes.filter((stroke) => !(stroke.id in deleted));
  }

  if (Array.isArray(patch.strokes) && patch.strokes.length) {
    const known = new Set(strokes.map((stroke) => stroke.id));
    const fresh: InkStroke[] = [];
    let tick = 0;
    for (const item of patch.strokes) {
      const stroke = normaliseStroke(item);
      // Already on the layer (a retry), or lifted since: not added again.
      if (!stroke || known.has(stroke.id) || stroke.id in deleted) continue;
      if (strokes.length + fresh.length >= INK_STROKE_LIMIT) {
        refused += 1;
        continue;
      }
      // The server's clock, not the client's — one order for everyone, and a
      // laptop with the wrong year cannot put its strokes underneath the wall.
      // Strokes from one patch keep the order they were sent in.
      fresh.push({ ...stroke, by: actor.id, at: now + tick });
      tick += 1;
      known.add(stroke.id);
      added += 1;
    }
    strokes = [...strokes, ...fresh];
  }

  return {
    layer: normaliseInk({ strokes, deleted, enabled, clearedAt }, now),
    added,
    refused,
    lifted,
  };
}

/** Would this many more strokes fit? */
export function inkHasRoom(layer: InkLayer, more = 1): boolean {
  return layer.strokes.length + more <= INK_STROKE_LIMIT;
}

/**
 * The layer as one viewer may see it. Who drew a stroke is a fact for the
 * logbook, not the screen (Nick: anonymous); the only thing a browser needs
 * to know is which strokes are its own, so Ctrl+Z knows what it may lift.
 */
export function inkForViewer(layer: InkLayer, viewerId: string | null): InkLayerView {
  return {
    enabled: layer.enabled,
    clearedAt: layer.clearedAt,
    strokes: layer.strokes.map(({ by, ...rest }) => (viewerId && by === viewerId ? { ...rest, mine: true } : rest)),
  };
}

/**
 * A frame off the wire, kept to what a canvas can draw: an id, a mode, a
 * colour index, a width, and finite points. Null is "drop it".
 */
export function readInkFrame(input: unknown): InkFrame | null {
  if (!input || typeof input !== 'object') return null;
  const raw = input as Partial<InkFrame>;
  if (typeof raw.id !== 'string' || !STROKE_ID.test(raw.id)) return null;
  const points = Array.isArray(raw.p) ? raw.p.slice(0, 600) : [];
  if (points.some((n) => !finite(n))) return null;
  // The same space, and so the same width bounds, as the stroke this frame is
  // a glimpse of — otherwise a v1 line under somebody else's hand arrives at
  // the wrong thickness and jumps to its real one the moment they lift it.
  const v = readFormat(raw.v);
  const out: InkFrame = {
    id: raw.id,
    m: raw.m === 'erase' ? 'erase' : 'ink',
    k: finite(raw.k) ? Math.min(INK_COLOURS.length - 1, Math.max(0, Math.round(raw.k))) : 0,
    w: finite(raw.w) ? inkWidth(raw.w, v, asIs) : 1,
    p: points.map((n) => round(n)),
  };
  if (v) out.v = v;
  if (raw.e === 1) out.e = 1;
  if (raw.a === 1) out.a = 1;
  return out;
}
