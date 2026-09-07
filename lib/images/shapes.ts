/**
 * Round 19: one picture, three crops — one per *shape* a list can draw it in.
 *
 * A cover used to carry one focal point + zoom, drawn for the 3:4 card and
 * borrowed by everything else, and every placement (a dossier's filing, a
 * board card) could keep its own. That was three UIs for one decision, and a
 * face still did not look the same on every list. Now the artikel's own crop
 * section sets three — landscape 3:2, portrait 3:4, square 1:1 — and every
 * list, card and knot asks for the shape it draws in. The file on disk is
 * never touched; each crop is still a focal point and a zoom, applied by CSS
 * at render time (`coverStyle` in `components/Cover.tsx`).
 *
 * This is the only place a ratio lives. Client-safe and pure: it must not
 * import `lib/assets`, which loads sharp and the database.
 */

export type CropShape = 'landscape' | 'portrait' | 'square';

/** Focal point (0..1 of the source, both axes) and zoom (1 = fit the frame). */
export type Crop = { x: number; y: number; zoom: number };

/** The bag on `entries.cover_crop` and `cases.cover_crop`: a crop per shape, each optional. */
export type CoverCrops = Partial<Record<CropShape, Crop>>;

export const SHAPES: Record<CropShape, { ratio: number; label: string; css: string }> = {
  landscape: { ratio: 3 / 2, label: 'Liggend', css: '3 / 2' },
  portrait: { ratio: 3 / 4, label: 'Staand', css: '3 / 4' },
  square: { ratio: 1, label: 'Vierkant', css: '1 / 1' },
};

/** In the order the crop section shows them. */
export const SHAPE_ORDER: CropShape[] = ['landscape', 'portrait', 'square'];

export const MIN_ZOOM = 1;
export const MAX_ZOOM = 4;

export const CENTRED: Crop = { x: 0.5, y: 0.5, zoom: 1 };

function num(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/**
 * One crop off the wire or out of the database, clamped so nothing odd ever
 * reaches a style attribute. Anything that is not an object is no crop.
 */
export function cleanCrop(input: unknown): Crop | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const raw = input as Partial<Crop>;
  return {
    x: Math.min(1, Math.max(0, num(raw.x, 0.5))),
    y: Math.min(1, Math.max(0, num(raw.y, 0.5))),
    zoom: Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, num(raw.zoom, 1))),
  };
}

function isShape(key: string): key is CropShape {
  return key in SHAPES;
}

/**
 * The bag, normalised. Accepts the new shape (`{ landscape?, portrait?, square? }`)
 * and the one from before this round — a bare `{ x, y, zoom }` — which becomes
 * `{ portrait }`, because the 3:4 card is the frame it was always drawn for.
 * Junk, an empty object and a bag with nothing valid in it all come back null.
 */
export function normaliseCrops(input: unknown): CoverCrops | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const raw = input as Record<string, unknown>;
  // Legacy: a crop where the bag should be.
  if ('x' in raw || 'y' in raw || 'zoom' in raw) {
    const legacy = cleanCrop(raw);
    return legacy ? { portrait: legacy } : null;
  }
  const out: CoverCrops = {};
  for (const key of Object.keys(raw)) {
    if (!isShape(key)) continue;
    const crop = cleanCrop(raw[key]);
    if (crop) out[key] = crop;
  }
  return Object.keys(out).length ? out : null;
}

/** The crop to draw a picture with in this shape; centred and unzoomed when none was set. */
export function cropFor(crops: CoverCrops | null | undefined, shape: CropShape): Crop {
  return crops?.[shape] ?? CENTRED;
}
