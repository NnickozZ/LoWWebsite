import type { CSSProperties } from 'react';
import type { CoverCrop } from '@/lib/db/schema';
import { Icon } from './Icon';

export function coverStyle(crop: CoverCrop | null | undefined): CSSProperties {
  const x = crop?.x ?? 0.5;
  const y = crop?.y ?? 0.5;
  const zoom = crop?.zoom ?? 1;
  const position = `${(x * 100).toFixed(2)}% ${(y * 100).toFixed(2)}%`;
  return {
    objectFit: 'cover',
    objectPosition: position,
    transform: zoom === 1 ? undefined : `scale(${zoom})`,
    transformOrigin: position,
  };
}

/**
 * `thumb` (400 px) is for the feed's 42x56 and the search list; `card` (900 px)
 * for any 3:4 card, on a page or on a board; `full` (1600 px) for the entry
 * page, the lightbox and the crop frames.
 */
export function assetUrl(id: string, variant: 'full' | 'card' | 'thumb' = 'full') {
  return variant === 'full' ? `/api/assets/${id}` : `/api/assets/${id}?s=${variant}`;
}

/**
 * Uniform 3:4 cover used by every card, in cases and on boards, so nothing has
 * to be re-cropped for a different context.
 */
export function Cover({
  assetId,
  crop,
  alt,
  icon = 'file',
  colour,
  variant = 'card',
  className = 'card-cover',
}: {
  assetId: string | null;
  crop?: CoverCrop | null;
  alt: string;
  icon?: string;
  colour?: string;
  variant?: 'full' | 'card' | 'thumb';
  className?: string;
}) {
  return (
    <div className={className}>
      {assetId ? (
        // eslint-disable-next-line @next/next/no-img-element -- assets are served
        // by our own route handler already resized; next/image would add a
        // second optimiser and a runtime dependency for no gain.
        <img src={assetUrl(assetId, variant)} alt={alt} style={coverStyle(crop)} loading="lazy" />
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
  icon = 'file',
  colour,
}: {
  assetId: string | null;
  crop?: CoverCrop | null;
  icon?: string;
  colour?: string;
}) {
  return (
    <span className="feed-thumb">
      {assetId ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={assetUrl(assetId, 'thumb')} alt="" style={coverStyle(crop)} loading="lazy" />
      ) : (
        <Icon name={icon} size={20} style={{ color: colour ?? 'var(--ink-muted)', opacity: 0.6 }} />
      )}
    </span>
  );
}
