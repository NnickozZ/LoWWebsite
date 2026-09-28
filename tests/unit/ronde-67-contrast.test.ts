import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DEFAULT_SCHEMES, SCHEME_IS_DARK, SCHEME_KEYS, type Palette } from '@/lib/theme/schemes';

/**
 * §104, ronde 67·herstel (F3, #9) — de kleur van een soort op kleine tekst, en
 * de stempel, in alle vier de paletten.
 *
 * De soortkleuren van de seed zijn gekozen voor licht papier. Rauw op donker
 * papier haalde de chip LOCATIES 2,6:1, het etiket op `/wiki` ±4,0:1 op 10,9 px
 * en een stempel 3,3:1. De oplossing is één menging, in `app/globals.css`:
 *
 *     color-mix(in oklab, <soort> var(--soort-aandeel), var(--ink))
 *
 * met `--soort-aandeel` per licht, en voor de stempel `--stempel-aandeel` en
 * `--stempel-dekking`. Dit bestand **leest die getallen uit het stylesheet** en
 * rekent ze door voor elke soortkleur uit `lib/db/seed.mjs`, op elk papier
 * waar zo'n etiket op ligt — zodat wie de getallen of een soortkleur verzet,
 * het hier merkt en niet 's avonds aan tafel. Zelfde reden als
 * `tree-contrast.test.ts`: de rekensom staat hier nog een keer uitgeschreven,
 * los van de app.
 */

const root = resolve(__dirname, '../..');
const css = readFileSync(resolve(root, 'app/globals.css'), 'utf8');
const seed = readFileSync(resolve(root, 'lib/db/seed.mjs'), 'utf8');

/* ------------------------------------------------------------ the numbers */

/** The value of a custom property in the first rule with this exact selector that sets it. */
function prop(selector: RegExp, name: string): string {
  for (const rule of css.matchAll(new RegExp(`${selector.source}\\s*\\{([^}]*)\\}`, 'g'))) {
    const decl = new RegExp(`${name}:\\s*([^;]+);`).exec(rule[1]);
    if (decl) return decl[1].trim();
  }
  throw new Error(`no ${name} under ${selector}`);
}
const pct = (value: string) => Number(value.replace('%', '')) / 100;

const LIGHT = /\n:root/;  // the bare `:root {` — `prop` takes the one that sets the name
const DARK = /\n:root:has\(\[data-theme='dark'\]\)/;
const SYSTEM_DARK = /:root:not\(:has\(\[data-theme='light'\]\)\)/;

const share = {
  light: { soort: pct(prop(LIGHT, '--soort-aandeel')), stempel: pct(prop(LIGHT, '--stempel-aandeel')), dekking: Number(prop(LIGHT, '--stempel-dekking')) },
  dark: { soort: pct(prop(DARK, '--soort-aandeel')), stempel: pct(prop(DARK, '--stempel-aandeel')), dekking: Number(prop(DARK, '--stempel-dekking')) },
};

/** The soort colours the archive ships with. */
const SOORTEN = [...new Set([...seed.matchAll(/colour:\s*'(#[0-9A-Fa-f]{6})'/g)].map((m) => m[1].toLowerCase()))];

/* ------------------------------------------------------------ colour maths */

type Rgb = [number, number, number];
const hex = (value: string): Rgb => [1, 3, 5].map((i) => parseInt(value.slice(i, i + 2), 16) / 255) as Rgb;
const lin = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const unlin = (c: number) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);

/** sRGB → OKLab (Björn Ottosson's matrices, as CSS Color 4 uses them). */
function oklab([r, g, b]: Rgb): Rgb {
  const [lr, lg, lb] = [lin(r), lin(g), lin(b)];
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}
function fromOklab([L, a, b]: Rgb): Rgb {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ].map((c) => Math.min(1, Math.max(0, unlin(c)))) as Rgb;
}
/** `color-mix(in oklab, a p, b)`. */
function mix(a: string, b: string, p: number): Rgb {
  const A = oklab(hex(a));
  const B = oklab(hex(b));
  return fromOklab(A.map((v, i) => v * p + B[i] * (1 - p)) as Rgb);
}
/** An `opacity` over a background, blended as a browser composites it (in sRGB). */
const over = (fg: Rgb, bg: string, alpha: number): Rgb => fg.map((c, i) => c * alpha + hex(bg)[i] * (1 - alpha)) as Rgb;
const luminance = (rgb: Rgb) => {
  const [r, g, b] = rgb.map(lin);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a: Rgb, b: Rgb) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

/* ------------------------------------------------------------ the checks */

describe('golf h1: the tab bar reads the stamp mix', () => {
  it('draws every red of the tab bar with --tab-rood, and --tab-rood is the stamp mix', () => {
    const nav = readFileSync(resolve(root, 'app/navigatie.css'), 'utf8');
    expect(nav).toMatch(/--tab-rood:\s*color-mix\(in oklab, var\(--stamp-red\) var\(--stempel-aandeel\), var\(--ink\)\)/);
    expect(nav).toMatch(/\.tabs a\[aria-current='page'\][^{]*\{\s*color: var\(--tab-rood\)/);
  });
});

describe('the numbers this file reads', () => {
  it('finds the soort colours of the seed and the shares in the stylesheet', () => {
    expect(SOORTEN.length).toBeGreaterThanOrEqual(15);
    expect(share.light.soort).toBeGreaterThan(0.5);
    expect(share.dark.soort).toBeGreaterThan(0.3);
    // The system-dark half says the same as the chosen-dark half.
    expect(prop(SYSTEM_DARK, '--soort-aandeel')).toBe(prop(DARK, '--soort-aandeel'));
    expect(prop(SYSTEM_DARK, '--stempel-aandeel')).toBe(prop(DARK, '--stempel-aandeel'));
    expect(prop(SYSTEM_DARK, '--stempel-dekking')).toBe(prop(DARK, '--stempel-dekking'));
  });

  it('measures what WCAG measures', () => {
    expect(ratio(hex('#000000'), hex('#ffffff'))).toBeCloseTo(21, 5);
    // A mix at 100 % is the colour itself.
    expect(mix('#2f6b4f', '#1f1b16', 1).map((c) => Math.round(c * 255))).toEqual([0x2f, 0x6b, 0x4f]);
  });
});

describe.each(SCHEME_KEYS)('%s', (key) => {
  const palette: Palette = DEFAULT_SCHEMES[key];
  const s = SCHEME_IS_DARK[key] ? share.dark : share.light;
  // Where a soort's label lies: the page, a raised card or chip, a tile's paper.
  const papers = [palette.paper, palette.paperRaised, palette.paperDark];

  it.each(SOORTEN)('writes the soort %s at 4.5:1 or better on every paper', (colour) => {
    const ink = mix(colour, palette.ink, s.soort);
    for (const paper of papers) expect(ratio(ink, hex(paper))).toBeGreaterThanOrEqual(4.5);
  });

  it('keeps the soort recognisable: the mix leans towards the soort, not away from it', () => {
    // Not the ink with a tint — at least a third of it is the soort's own colour.
    expect(s.soort).toBeGreaterThanOrEqual(0.4);
  });

  // Golf h1 (T12): the active tab's word lies on the tab bar (`--paper-dark`)
  // and is drawn with the stamp's mix (`--tab-rood` in `app/navigatie.css`).
  // In the dark it was the raw stamp-red there: 3,8:1 on 8,6 px.
  it('writes the active tab label at 4.5:1 or better on the tab bar', () => {
    const inkt = mix(palette.stampRed, palette.ink, s.stempel);
    expect(ratio(inkt, hex(palette.paperDark))).toBeGreaterThanOrEqual(4.5);
  });

  it('prints a stamp at 4.5:1 or better on the page and on a card', () => {
    const inkt = mix(palette.stampRed, palette.ink, s.stempel);
    for (const paper of [palette.paper, palette.paperRaised]) {
      expect(ratio(over(inkt, paper, s.dekking), hex(paper))).toBeGreaterThanOrEqual(4.5);
    }
  });
});
