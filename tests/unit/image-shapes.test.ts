import { describe, expect, it } from 'vitest';
import { CENTRED, cleanCrop, cropFor, normaliseCrops, SHAPES } from '@/lib/images/shapes';

/**
 * Round 19: three crops per picture, keyed by shape. Everything that reads a
 * cover crop out of the database or off the wire goes through `normaliseCrops`,
 * so the rules below are the whole contract.
 */
describe('normaliseCrops', () => {
  it('reads a legacy {x, y, zoom} as the portrait crop', () => {
    // The 3:4 card was the only frame the old crop was ever drawn for.
    expect(normaliseCrops({ x: 0.2, y: 0.8, zoom: 2 })).toEqual({
      portrait: { x: 0.2, y: 0.8, zoom: 2 },
    });
  });

  it('keeps a bag of three, and drops keys that are not shapes', () => {
    const bag = normaliseCrops({
      landscape: { x: 0.1, y: 0.2, zoom: 1.5 },
      portrait: { x: 0.3, y: 0.4, zoom: 1 },
      square: { x: 0.5, y: 0.6, zoom: 3 },
      banner: { x: 0.9, y: 0.9, zoom: 1 },
    });
    expect(bag).toEqual({
      landscape: { x: 0.1, y: 0.2, zoom: 1.5 },
      portrait: { x: 0.3, y: 0.4, zoom: 1 },
      square: { x: 0.5, y: 0.6, zoom: 3 },
    });
  });

  it('clamps every crop in the bag', () => {
    expect(normaliseCrops({ square: { x: -3, y: 9, zoom: 99 } })).toEqual({
      square: { x: 0, y: 1, zoom: 4 },
    });
    expect(normaliseCrops({ x: 7, y: -1, zoom: 0.1 })).toEqual({
      portrait: { x: 1, y: 0, zoom: 1 },
    });
  });

  it('fills in a missing coordinate rather than refusing the crop', () => {
    expect(normaliseCrops({ landscape: { zoom: 2 } })).toEqual({
      landscape: { x: 0.5, y: 0.5, zoom: 2 },
    });
  });

  it('turns junk into null', () => {
    expect(normaliseCrops(null)).toBeNull();
    expect(normaliseCrops(undefined)).toBeNull();
    expect(normaliseCrops('portrait')).toBeNull();
    expect(normaliseCrops(42)).toBeNull();
    expect(normaliseCrops([])).toBeNull();
    expect(normaliseCrops({})).toBeNull();
    expect(normaliseCrops({ portrait: 'yes', square: 3 })).toBeNull();
    expect(normaliseCrops({ banner: { x: 0.5, y: 0.5, zoom: 1 } })).toBeNull();
  });

  it('is idempotent', () => {
    const once = normaliseCrops({ x: 0.2, y: 0.8, zoom: 2 });
    expect(normaliseCrops(once)).toEqual(once);
  });
});

describe('cleanCrop', () => {
  it('clamps and defaults', () => {
    expect(cleanCrop({ x: 2, y: -2, zoom: 0 })).toEqual({ x: 1, y: 0, zoom: 1 });
    expect(cleanCrop({ x: 'a', y: NaN })).toEqual(CENTRED);
    expect(cleanCrop(null)).toBeNull();
    expect(cleanCrop([1, 2, 3])).toBeNull();
  });
});

describe('cropFor', () => {
  it('gives the centred, unzoomed crop when the shape was never set', () => {
    expect(cropFor(null, 'square')).toEqual(CENTRED);
    expect(cropFor(undefined, 'landscape')).toEqual(CENTRED);
    expect(cropFor({ portrait: { x: 0.2, y: 0.8, zoom: 2 } }, 'square')).toEqual(CENTRED);
  });

  it('gives the crop for the shape asked for, and no other', () => {
    const crops = {
      portrait: { x: 0.2, y: 0.8, zoom: 2 },
      landscape: { x: 0.9, y: 0.1, zoom: 1 },
    };
    expect(cropFor(crops, 'portrait')).toEqual(crops.portrait);
    expect(cropFor(crops, 'landscape')).toEqual(crops.landscape);
  });
});

describe('SHAPES', () => {
  it('is the one place a ratio lives, and its CSS agrees with its ratio', () => {
    for (const shape of Object.values(SHAPES)) {
      const [w, h] = shape.css.split('/').map((part) => Number(part.trim()));
      expect(w / h).toBeCloseTo(shape.ratio, 6);
    }
  });
});
