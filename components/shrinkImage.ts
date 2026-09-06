'use client';

import {
  SHRUNK_NOTICE,
  couldNotShrinkMessage,
  mayReencodeType,
  shrinkSteps,
  tooLargeMessage,
} from '@/lib/upload';

/**
 * §30, second half: a picture too heavy for the ceiling is made to fit rather
 * than refused.
 *
 * A player's ceiling is 2 MB and a phone's photograph is four. Refusing it is
 * technically correct and useless — the person has no way to make the file
 * smaller and no idea that they should. And it is throwing away nothing they
 * would miss: the archive stores a 1600 px webp in the end, so every megabyte
 * above that is a megabyte nobody ever sees. So the browser re-encodes the
 * picture to JPEG at 0.82 and, only if that is not enough on its own, walks
 * down a ladder of smaller sizes until one fits — the first step that fits
 * wins, so the picture keeps every pixel it can.
 *
 * What this is not: it is not the ceiling. `/api/assets` weighs the bytes that
 * actually arrived against `uploadLimitFor` and answers `tooLargeMessage`,
 * exactly as before, and would do so for a browser that ran none of this. The
 * work here is a courtesy in front of that gate, at the one place per screen
 * where a picture starts its journey — the same single gate the file dialog
 * and the clipboard both arrive at (rule 30), never a second one.
 *
 * Two pictures are left alone on purpose: a GIF, because a canvas knows only
 * its first frame and a silently flattened animation is worse than a refusal,
 * and an SVG, which has no pixels to shrink (`mayReencodeType`). They get the
 * ordinary "too large" sentence.
 *
 * No dependency: `createImageBitmap` where there is one, an `<img>` and an
 * object URL where there is not (older Safari), and `OffscreenCanvas` or a
 * plain `<canvas>` to draw on.
 */

export type FitResult = { file: File; shrunk: boolean } | { error: string };

/** The quality every re-encode uses. High enough that a shrink is not a smudge. */
const JPEG_QUALITY = 0.82;

export const SHRUNK_MESSAGE = SHRUNK_NOTICE;

export async function fitUpload(file: File, limit: number): Promise<FitResult> {
  if (file.size <= limit) return { file, shrunk: false };
  if (!mayReencodeType(file.type)) return { error: tooLargeMessage(limit) };

  let source: CanvasImageSource & { width: number; height: number };
  let release = () => {};
  try {
    const decoded = await decode(file);
    source = decoded.source;
    release = decoded.release;
  } catch {
    // Not something this browser can decode: the server's own words apply.
    return { error: tooLargeMessage(limit) };
  }

  try {
    for (const step of shrinkSteps(source.width, source.height)) {
      const blob = await encode(source, step.width, step.height);
      if (!blob) return { error: tooLargeMessage(limit) };
      if (blob.size <= limit) {
        return {
          file: new File([blob], jpgName(file.name), {
            type: 'image/jpeg',
            lastModified: file.lastModified,
          }),
          shrunk: true,
        };
      }
    }
  } catch {
    return { error: tooLargeMessage(limit) };
  } finally {
    release();
  }

  // Smaller than the last rung and it would not be a picture any more.
  return { error: couldNotShrinkMessage(limit) };
}

/** `foto.heic` → `foto.jpg`; a name without a suffix simply gains one. */
export function jpgName(name: string): string {
  const stem = (name || 'afbeelding').replace(/\.[^./\\]+$/, '');
  return `${stem || 'afbeelding'}.jpg`;
}

async function decode(
  file: File,
): Promise<{ source: CanvasImageSource & { width: number; height: number }; release: () => void }> {
  if (typeof createImageBitmap === 'function') {
    const bitmap = await createImageBitmap(file);
    return { source: bitmap, release: () => bitmap.close?.() };
  }
  // Safari before 17 has no `createImageBitmap` for a File; an <img> does.
  const url = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error('decode'));
      element.src = url;
    });
    return {
      source: Object.assign(image, {
        width: image.naturalWidth || image.width,
        height: image.naturalHeight || image.height,
      }),
      release: () => URL.revokeObjectURL(url),
    };
  } catch (err) {
    URL.revokeObjectURL(url);
    throw err;
  }
}

async function encode(source: CanvasImageSource, width: number, height: number): Promise<Blob | null> {
  if (typeof OffscreenCanvas === 'function') {
    const canvas = new OffscreenCanvas(width, height);
    const context = canvas.getContext('2d');
    if (!context) return null;
    context.drawImage(source, 0, 0, width, height);
    return await canvas.convertToBlob({ type: 'image/jpeg', quality: JPEG_QUALITY });
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) return null;
  context.drawImage(source, 0, 0, width, height);
  return await new Promise<Blob | null>((resolve) => {
    canvas.toBlob((blob) => resolve(blob), 'image/jpeg', JPEG_QUALITY);
  });
}
