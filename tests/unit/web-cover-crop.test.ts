import { describe, expect, it } from 'vitest';
import { coverSourceRect } from '@/components/web/WebCanvas';
import { CENTRED, type Crop } from '@/lib/images/shapes';

/**
 * Round 27. The web drew a knot's picture by a *focal point*, while the crop
 * editor (`CropFrame`) and every card (`cropStyle` in `components/Cover.tsx`)
 * read the same numbers as an `object-position` fraction. The two only agree
 * at 0, 0.5 and 1; in between the canvas was more extreme, and below
 * `sh / (2·ih)` it clamped to the edge — the round with its middle at the top
 * of the picture. These tests pin the CSS reading.
 */

/** What CSS does with `object-position: {x*100}% {y*100}%` and `object-fit: cover`. */
function cssSourceRect(iw: number, ih: number, w: number, h: number, crop: Crop) {
  const scale = Math.max(w / iw, h / ih) * crop.zoom;
  const sw = w / scale;
  const sh = h / scale;
  return { sx: crop.x * (iw - sw), sy: crop.y * (ih - sh), sw, sh };
}

const crop = (x: number, y: number, zoom = 1): Crop => ({ x, y, zoom });

describe('coverSourceRect', () => {
  it('centres the round on the centre of the 1:1, not on the top', () => {
    // Nick's report: a 900x1200 portrait in a square knot, crop y = 0.25.
    const rect = coverSourceRect(900, 1200, 40, 40, crop(0.5, 0.25));
    expect(rect.sw).toBeCloseTo(900, 6);
    expect(rect.sh).toBeCloseTo(900, 6);
    expect(rect.sx).toBeCloseTo(0, 6);
    // The old focal-point reading clamped this to 0.
    expect(rect.sy).toBeCloseTo(75, 6);
  });

  it('agrees with the CSS reading at every quarter, portrait and landscape', () => {
    const sources: Array<[number, number]> = [
      [900, 1200],
      [1600, 900],
    ];
    const frames: Array<[number, number]> = [
      [40, 40], // a knot: vierkant
      [30, 40], // the columns thumb: staand, 3:4
      [60, 40], // liggend
    ];
    for (const [iw, ih] of sources) {
      for (const [w, h] of frames) {
        for (const v of [0, 0.25, 0.5, 0.75, 1]) {
          for (const zoom of [1, 1.6, 4]) {
            const c = crop(v, v, zoom);
            const mine = coverSourceRect(iw, ih, w, h, c);
            const css = cssSourceRect(iw, ih, w, h, c);
            expect(mine.sw).toBeCloseTo(css.sw, 6);
            expect(mine.sh).toBeCloseTo(css.sh, 6);
            expect(mine.sx).toBeCloseTo(css.sx, 6);
            expect(mine.sy).toBeCloseTo(css.sy, 6);
          }
        }
      }
    }
  });

  it('keeps the whole rectangle inside the picture', () => {
    for (const [iw, ih] of [[900, 1200], [1600, 900], [500, 500]] as const) {
      for (const v of [0, 0.5, 1]) {
        for (const zoom of [1, 2, 4]) {
          const r = coverSourceRect(iw, ih, 40, 40, crop(v, v, zoom));
          expect(r.sx).toBeGreaterThanOrEqual(0);
          expect(r.sy).toBeGreaterThanOrEqual(0);
          expect(r.sx + r.sw).toBeLessThanOrEqual(iw + 1e-9);
          expect(r.sy + r.sh).toBeLessThanOrEqual(ih + 1e-9);
        }
      }
    }
  });

  it('a centred crop takes the middle band of a portrait', () => {
    const r = coverSourceRect(900, 1200, 40, 40, CENTRED);
    expect(r.sy).toBeCloseTo(150, 6);
    expect(r.sx).toBeCloseTo(0, 6);
  });

  it('zoom bites into the picture and the fraction still places it', () => {
    const r = coverSourceRect(1000, 1000, 40, 40, crop(1, 0, 2));
    expect(r.sw).toBeCloseTo(500, 6);
    expect(r.sx).toBeCloseTo(500, 6); // hard right
    expect(r.sy).toBeCloseTo(0, 6); // hard top
  });
});
