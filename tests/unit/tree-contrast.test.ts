import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SCHEMES,
  SCHEME_KEYS,
  TOKENS,
  TOKEN_GROUPS,
  cleanSchemes,
  isDefaultPalette,
  type Palette,
} from '@/lib/theme/schemes';

/**
 * §45/§66, round 32 — the kaartje is readable in all four palettes.
 *
 * The bug this pins down: a stamboom card was painted `--card-face` (a light
 * paper in every scheme, dark ones included) and the name on it was written in
 * `--ink`, which in a dark palette is nearly white. White on beige. The cure is
 * that a card is a surface of its own — `--tree-face` and `--tree-ink`, turned
 * together in Beheer → Kleuren — and this file is what keeps the two turned
 * *together* in the archive's own colours: a later round that darkens one and
 * forgets the other fails here rather than on somebody's screen at night.
 *
 * The luminance is written out again instead of imported on purpose. The thing
 * being checked is that the numbers are right; a test that measured them with
 * the same function the picker warns with would agree with itself about a bug
 * in that function.
 */

/** WCAG relative luminance of a `#rrggbb`. */
function luminance(hex: string): number {
  const n = Number.parseInt(hex.slice(1), 16);
  const channel = (byte: number) => {
    const c = byte / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return (
    0.2126 * channel((n >> 16) & 255) +
    0.7152 * channel((n >> 8) & 255) +
    0.0722 * channel(n & 255)
  );
}

/** The WCAG ratio, 1 (the same colour) to 21 (black on white). */
function ratio(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  return la >= lb ? (la + 0.05) / (lb + 0.05) : (lb + 0.05) / (la + 0.05);
}

describe('the luminance this file measures with', () => {
  it('answers what WCAG answers at both ends', () => {
    expect(ratio('#000000', '#ffffff')).toBeCloseTo(21, 5);
    expect(ratio('#ffffff', '#ffffff')).toBeCloseTo(1, 5);
    expect(ratio('#767676', '#ffffff')).toBeGreaterThanOrEqual(4.5);
  });
});

describe.each(SCHEME_KEYS)('%s', (key) => {
  const palette: Palette = DEFAULT_SCHEMES[key];

  it('writes the name on a kaartje at 7:1 or better', () => {
    // AAA, and deliberately not the 4.5 the page's prose asks for: a name on a
    // card is small, it is often over a portrait's edge, and it is the one
    // thing a stamboom is read for.
    expect(ratio(palette.treeInk, palette.treeFace)).toBeGreaterThanOrEqual(7);
  });

  it('draws the lines so they are visible on the stage', () => {
    // The stage is `--paper-dark` (`.tree-stage` in app/stambomen.css), never
    // `--paper`; 3:1 is WCAG's floor for a graphical object.
    expect(ratio(palette.treeLine, palette.paperDark)).toBeGreaterThanOrEqual(3);
  });

  it('writes a prikbord card’s ink dark enough on its face', () => {
    expect(ratio(palette.cardInk, palette.cardFace)).toBeGreaterThanOrEqual(4.5);
  });

  it('has a gold that is seen on the kaartje and on the stage', () => {
    // The godheid's double ring stands on the card; a huis without a colour of
    // its own is a banner over both.
    expect(ratio(palette.treeAccent, palette.treeFace)).toBeGreaterThanOrEqual(2);
    expect(ratio(palette.treeAccent, palette.paperDark)).toBeGreaterThanOrEqual(2);
  });

  it('turns the kaartje over with the light, rather than leaving it pale', () => {
    // The whole point of the round: in a dark palette the card is dark and the
    // ink on it is light, so `--tree-ink` may never be the darker of the two
    // where the page's own ink is the lighter of its two.
    const pageIsDark = luminance(palette.ink) > luminance(palette.paper);
    const cardIsDark = luminance(palette.treeInk) > luminance(palette.treeFace);
    expect(cardIsDark).toBe(pageIsDark);
  });

  it('keeps the kaartje a card on the stage and not a hole in it', () => {
    // Distinct from the stage it lies on, but not by so much that it glares.
    const separation = ratio(palette.treeFace, palette.paperDark);
    expect(separation).toBeGreaterThan(1.1);
    expect(separation).toBeLessThan(3);
  });
});

describe('the five colours round 32 added', () => {
  it('stands them in Beheer → Kleuren, under a group of their own', () => {
    expect(TOKEN_GROUPS.map((group) => group.group)).toContain('tree');
    const tree = TOKENS.filter((token) => token.group === 'tree').map((token) => token.key);
    expect(tree).toEqual(['treeFace', 'treeInk', 'treeLine', 'treeAccent']);
    // The prikbord's ink joined the prikbord, not the stamboom.
    expect(TOKENS.find((token) => token.key === 'cardInk')?.group).toBe('board');
    // Every one of them writes a custom property, and no two write the same.
    const css = TOKENS.map((token) => token.css);
    expect(new Set(css).size).toBe(css.length);
    expect(css).toContain('--tree-face');
    expect(css).toContain('--card-ink');
  });

  it('answers with them when nothing at all is saved', () => {
    const cleaned = cleanSchemes({});
    for (const key of SCHEME_KEYS) {
      expect(cleaned[key].treeFace).toBe(DEFAULT_SCHEMES[key].treeFace);
      expect(cleaned[key].treeInk).toBe(DEFAULT_SCHEMES[key].treeInk);
      expect(cleaned[key].treeLine).toBe(DEFAULT_SCHEMES[key].treeLine);
      expect(cleaned[key].treeAccent).toBe(DEFAULT_SCHEMES[key].treeAccent);
      expect(cleaned[key].cardInk).toBe(DEFAULT_SCHEMES[key].cardInk);
    }
    expect(cleaned).toEqual(DEFAULT_SCHEMES);
  });

  it('keeps a palette saved before this round, and fills the five in', () => {
    // What an archive whose Keeper set colours in round 22 has in its settings
    // row: nineteen tokens and not a tree among them.
    const old = Object.fromEntries(
      SCHEME_KEYS.map((key) => {
        const { treeFace, treeInk, treeLine, treeAccent, cardInk, ...rest } = DEFAULT_SCHEMES[key];
        void treeFace, treeInk, treeLine, treeAccent, cardInk;
        return [key, { ...rest, paper: '#123456' }];
      }),
    );
    const cleaned = cleanSchemes(old);
    for (const key of SCHEME_KEYS) {
      expect(cleaned[key].paper).toBe('#123456');
      expect(cleaned[key].treeFace).toBe(DEFAULT_SCHEMES[key].treeFace);
      expect(cleaned[key].cardInk).toBe(DEFAULT_SCHEMES[key].cardInk);
    }
  });

  it('is noticed by isDefaultPalette, like every other token', () => {
    for (const key of SCHEME_KEYS) {
      expect(isDefaultPalette(key, DEFAULT_SCHEMES[key])).toBe(true);
      expect(isDefaultPalette(key, { ...DEFAULT_SCHEMES[key], treeInk: '#010203' })).toBe(false);
      expect(isDefaultPalette(key, { ...DEFAULT_SCHEMES[key], cardInk: '#010203' })).toBe(false);
    }
  });
});
