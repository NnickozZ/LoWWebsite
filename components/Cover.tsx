import type { CSSProperties } from 'react';
import {
  cropFor,
  normaliseCrops,
  SHAPES,
  type CoverCrops,
  type Crop,
  type CropShape,
} from '@/lib/images/shapes';
import { Icon } from './Icon';

/** One crop as CSS: focal point → object-position + transform-origin, zoom → scale. */
export function cropStyle(crop: Crop): CSSProperties {
  const position = `${(crop.x * 100).toFixed(2)}% ${(crop.y * 100).toFixed(2)}%`;
  return {
    objectFit: 'cover',
    objectPosition: position,
    transform: crop.zoom === 1 ? undefined : `scale(${crop.zoom})`,
    transformOrigin: position,
  };
}

/**
 * Round 19: the CSS that draws a picture inside a frame of one *shape*, from
 * the bag of three crops on its artikel or dossier. The frame's own aspect is
 * `SHAPES[shape].css`, set by `coverClass`; this only places the picture in it.
 *
 * The bag is normalised here too — cheaply, and again — so a legacy
 * `{ x, y, zoom }` that reaches a component by any road (a stale client, a
 * preview payload, a snapshot) still draws as the portrait crop it was.
 */
export function coverStyle(crops: CoverCrops | null | undefined, shape: CropShape): CSSProperties {
  return cropStyle(cropFor(normaliseCrops(crops), shape));
}

/**
 * The class that gives a frame its aspect: `.cover-landscape` (3:2),
 * `.cover-portrait` (3:4) or `.cover-square` (1:1), defined once in
 * `globals.css` from the same table. Every clipping wrapper that draws a crop
 * wears one beside its own class, so no frame hard-codes a ratio.
 */
export function coverClass(shape: CropShape): string {
  return `cover-${shape}`;
}

export { SHAPES };

/**
 * `thumb` (400 px) is for the feed's 42x56 and the search list; `card` (900 px)
 * for any 3:4 card, on a page or on a board; `full` (1600 px) for the entry
 * page, the lightbox and the crop frames.
 */
export function assetUrl(id: string, variant: 'full' | 'card' | 'thumb' = 'full') {
  return variant === 'full' ? `/api/assets/${id}` : `/api/assets/${id}?s=${variant}`;
}

/**
 * The cover used by every card, in cases and on boards. One shape per frame —
 * portrait by default, the 3:4 card — and the picture's crop for that shape,
 * so the same face sits the same way on every list that draws it (round 19).
 */
export function Cover({
  assetId,
  crop,
  shape = 'portrait',
  alt,
  icon = 'file',
  colour,
  variant = 'card',
  className = 'card-cover',
}: {
  assetId: string | null;
  crop?: CoverCrops | null;
  shape?: CropShape;
  alt: string;
  icon?: string;
  colour?: string;
  variant?: 'full' | 'card' | 'thumb';
  className?: string;
}) {
  return (
    <div className={`${className} ${coverClass(shape)}`}>
      {assetId ? (
        // eslint-disable-next-line @next/next/no-img-element -- assets are served
        // by our own route handler already resized; next/image would add a
        // second optimiser and a runtime dependency for no gain.
        <img src={assetUrl(assetId, variant)} alt={alt} style={coverStyle(crop, shape)} loading="lazy" />
      ) : (
        <Icon name={icon} size={38} style={{ color: colour ?? 'var(--ink-muted)', opacity: 0.55 }} />
      )}
    </div>
  );
}

/**
 * The small 42x56 thumbnail used by the home feed and the search results.
 * The clipping wrapper matters: a crop with zoom above 1 sets a transform on
 * the image, which paints outside its own box unless an ancestor hides the
 * overflow.
 */
export function Thumb({
  assetId,
  crop,
  shape = 'portrait',
  icon = 'file',
  colour,
}: {
  assetId: string | null;
  crop?: CoverCrops | null;
  shape?: CropShape;
  icon?: string;
  colour?: string;
}) {
  return (
    <span className={`feed-thumb ${coverClass(shape)}`}>
      {assetId ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={assetUrl(assetId, 'thumb')} alt="" style={coverStyle(crop, shape)} loading="lazy" />
      ) : (
        <Icon name={icon} size={20} style={{ color: colour ?? 'var(--ink-muted)', opacity: 0.6 }} />
      )}
    </span>
  );
}
