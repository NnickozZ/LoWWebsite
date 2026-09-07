import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SCHEMES,
  MIN_CONTRAST,
  SCHEME_KEYS,
  TOKENS,
  cleanColourScheme,
  cleanSchemes,
  contrastRatio,
  isDefaultPalette,
  paletteReadable,
  schemeCss,
  schemeStyle,
  themeAttr,
} from '@/lib/theme/schemes';

/**
 * §45: the four palettes.
 *
 * The load-bearing test in here is the first one. `app/globals.css` carries
 * the archive's own colours as a generated block, and `app/(app)/layout.tsx`
 * writes the Keeper's over it from the same emitter — so the day the two stop
 * being the same nineteen tokens is the day a token added to the module never
 * reaches an archive whose Keeper never opened the Kleuren pane. There is no
 * way to notice that by looking at a screen: every palette still *works*, one
 * of them is simply a round out of date. Hence a test that reads the
 * stylesheet.
 */

const CSS = readFileSync(path.join(process.cwd(), 'app', 'globals.css'), 'utf8');
const START = '/* §45 SCHEMES START — generated from lib/theme/schemes.ts; see tests/unit/schemes.test.ts */';
const END = '/* §45 SCHEMES END */';

function generatedBlock(): string {
  const from = CSS.indexOf(START);
  const to = CSS.indexOf(END);
  expect(from, 'globals.css has lost its §45 start marker').toBeGreaterThan(-1);
  expect(to, 'globals.css has lost its §45 end marker').toBeGreaterThan(from);
  return CSS.slice(from + START.length, to).replace(/^\n+/, '').replace(/\n+$/, '');
}

describe('globals.css and lib/theme/schemes.ts', () => {
  it('carries exactly what the emitter emits, between the two markers', () => {
    expect(generatedBlock()).toBe(schemeCss(DEFAULT_SCHEMES));
  });

  it('names every token there is, four times over', () => {
    const block = generatedBlock();
    for (const token of TOKENS) {
      // Four palettes plus the two inside the media block: six blocks in all.
      const hits = block.split(`${token.css}:`).length - 1;
      expect(hits, `${token.css} is not in all six blocks`).toBe(6);
    }
  });

  it('leaves the sixteen kinds of tie as aliases onto the six line colours', () => {
    // A --web-<kind> that ever became a colour of its own is the legend and
    // the canvas disagreeing again (§43).
    const kinds = [
      ['mention', 'ink'],
      ['relation', 'ink'],
      ['field', 'ink'],
      ['section', 'ink'],
      ['filed', 'gold'],
      ['caseNotes', 'gold'],
      ['caseLink', 'gold'],
      ['inCase', 'gold'],
      ['board', 'red'],
      ['boardNote', 'red'],
      ['thread', 'red'],
      ['pin', 'blue'],
      ['mapOf', 'blue'],
      ['event', 'green'],
      ['investigator', 'violet'],
      ['player', 'violet'],
    ];
    for (const [kind, line] of kinds) {
      expect(CSS).toContain(`--web-${kind}: var(--web-line-${line});`);
    }
  });

  it('writes no colour of its own outside the generated block', () => {
    // The three regions §45 replaced each had a hex per theme. Nothing but the
    // generated block may name --paper, --ink, --cork or a --web-line-* again.
    const after = CSS.slice(CSS.indexOf(END));
    for (const name of ['--paper:', '--ink:', '--cork:', '--card-face:', '--web-line-ink:']) {
      expect(after, `${name} is written twice`).not.toContain(name);
    }
  });
});

describe('schemeCss', () => {
  it('writes the four schemes under the selectors the layout relies on', () => {
    const css = schemeCss(DEFAULT_SCHEMES);
    expect(css).toContain(':root {');
    expect(css).toContain(":root:has([data-side='keeper']):not(:has([data-side='player'])) {");
    expect(css).toContain(":root:has([data-theme='dark']) {");
    expect(css).toContain(":root:has([data-theme='dark']):has([data-side='keeper']):not(:has([data-side='player'])) {");
    expect(css).toContain('@media (prefers-color-scheme: dark)');
    // A person who chose Licht means it, even at midnight.
    expect(css).toContain(":root:not(:has([data-theme='light']))");
  });

  it('keeps --accent an alias of the stamp, in every scheme', () => {
    const css = schemeCss(DEFAULT_SCHEMES);
    expect(css.split('--accent: var(--stamp-red);').length - 1).toBe(6);
  });

  it('says which half of the light each block is', () => {
    const css = schemeCss(DEFAULT_SCHEMES);
    expect(css.split('color-scheme: light;').length - 1).toBe(2);
    expect(css.split('color-scheme: dark;').length - 1).toBe(4);
  });

  it('bakes the speck alpha into the kurk rather than asking for one', () => {
    const css = schemeCss(DEFAULT_SCHEMES);
    expect(css).toContain('--cork-speck: #5a3e2029;');
    expect(css).toContain('--cork-speck: #0000004d;');
  });

  it('is the same thing on one line for the layout’s <style>', () => {
    const style = schemeStyle(DEFAULT_SCHEMES);
    expect(style).not.toContain('\n');
    expect(style).toContain('--paper: #f3eee2;');
  });
});

describe('cleanSchemes', () => {
  it('answers with the archive’s own colours when nothing is saved', () => {
    expect(cleanSchemes(undefined)).toEqual(DEFAULT_SCHEMES);
    expect(cleanSchemes(null)).toEqual(DEFAULT_SCHEMES);
    expect(cleanSchemes({})).toEqual(DEFAULT_SCHEMES);
  });

  it('keeps a colour that is one and falls back for one that is not', () => {
    const cleaned = cleanSchemes({
      playerLight: {
        paper: '#123456',
        ink: 'rebeccapurple',
        rule: '#abc',
        link: '#12345678',
        stampRed: 42,
      },
    });
    expect(cleaned.playerLight.paper).toBe('#123456');
    expect(cleaned.playerLight.ink).toBe(DEFAULT_SCHEMES.playerLight.ink);
    expect(cleaned.playerLight.rule).toBe(DEFAULT_SCHEMES.playerLight.rule);
    expect(cleaned.playerLight.link).toBe(DEFAULT_SCHEMES.playerLight.link);
    expect(cleaned.playerLight.stampRed).toBe(DEFAULT_SCHEMES.playerLight.stampRed);
    // A half-filled scheme is still a scheme, and the other three are untouched.
    expect(cleaned.playerDark).toEqual(DEFAULT_SCHEMES.playerDark);
  });

  it('lower-cases what it keeps, so the CSS reads the same either way', () => {
    expect(cleanSchemes({ keeperDark: { paper: '#ABCDEF' } }).keeperDark.paper).toBe('#abcdef');
  });

  it('lets nothing through that is not six hex digits', () => {
    const nasty = cleanSchemes({
      playerLight: { paper: '#f00; } :root { display: none' },
    });
    expect(nasty.playerLight.paper).toBe(DEFAULT_SCHEMES.playerLight.paper);
    expect(schemeCss(nasty)).not.toContain('display: none');
  });

  it('folds §11’s accent in as the stamp of all four schemes', () => {
    const cleaned = cleanSchemes(undefined, '#00FF00');
    for (const key of SCHEME_KEYS) {
      expect(cleaned[key].stampRed).toBe('#00ff00');
      // Only the stamp: an accent was never the paper or the ink.
      expect(cleaned[key].paper).toBe(DEFAULT_SCHEMES[key].paper);
    }
    // --accent follows the stamp, so a Keeper's old accent still reaches it.
    expect(schemeCss(cleaned)).toContain('--stamp-red: #00ff00;');
  });

  it('lets a saved scheme beat the legacy accent', () => {
    const cleaned = cleanSchemes({ playerLight: { stampRed: '#111111' } }, '#00ff00');
    expect(cleaned.playerLight.stampRed).toBe('#111111');
    expect(cleaned.playerDark.stampRed).toBe('#00ff00');
  });

  it('ignores an accent that is not a colour', () => {
    expect(cleanSchemes(undefined, 'red')).toEqual(DEFAULT_SCHEMES);
    expect(cleanSchemes(undefined, '')).toEqual(DEFAULT_SCHEMES);
  });

  it('is idempotent — cleaning a cleaned blob changes nothing', () => {
    const once = cleanSchemes({ keeperLight: { paper: '#ABCDEF' } });
    expect(cleanSchemes(once)).toEqual(once);
  });
});

describe('isDefaultPalette', () => {
  it('recognises the archive’s own, per scheme', () => {
    for (const key of SCHEME_KEYS) {
      expect(isDefaultPalette(key, DEFAULT_SCHEMES[key])).toBe(true);
    }
    // The four are genuinely four: no palette is another one's default.
    expect(isDefaultPalette('keeperLight', DEFAULT_SCHEMES.playerLight)).toBe(false);
  });

  it('notices one token out of place', () => {
    expect(
      isDefaultPalette('playerLight', { ...DEFAULT_SCHEMES.playerLight, link: '#000000' }),
    ).toBe(false);
  });
});

describe('contrastRatio', () => {
  it('answers the numbers WCAG answers', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 5);
    expect(contrastRatio('#ffffff', '#ffffff')).toBeCloseTo(1, 5);
    // Symmetrical: which is the paper and which the ink does not matter.
    expect(contrastRatio('#1f1b16', '#f3eee2')).toBeCloseTo(
      contrastRatio('#f3eee2', '#1f1b16'),
      10,
    );
  });

  it('treats anything that is not a colour as black', () => {
    expect(contrastRatio('nonsense', '#ffffff')).toBeCloseTo(21, 5);
  });
});

describe('paletteReadable', () => {
  it('passes all four of the archive’s own palettes', () => {
    for (const key of SCHEME_KEYS) {
      expect(paletteReadable(DEFAULT_SCHEMES[key]), key).toBe(true);
      expect(contrastRatio(DEFAULT_SCHEMES[key].ink, DEFAULT_SCHEMES[key].paper)).toBeGreaterThan(
        MIN_CONTRAST,
      );
    }
  });

  it('fails grey on grey', () => {
    expect(paletteReadable({ ...DEFAULT_SCHEMES.playerLight, ink: '#a0a0a0' })).toBe(false);
  });
});

describe('cleanColourScheme and themeAttr', () => {
  it('keeps the two halves and calls everything else the system’s', () => {
    expect(cleanColourScheme('light')).toBe('light');
    expect(cleanColourScheme('dark')).toBe('dark');
    expect(cleanColourScheme('')).toBe('');
    expect(cleanColourScheme(null)).toBe('');
    expect(cleanColourScheme("dark'] { display: none } [x='")).toBe('');
  });

  it('leaves the system’s choice without an attribute at all', () => {
    expect(themeAttr('')).toBeUndefined();
    expect(themeAttr('light')).toBe('light');
    expect(themeAttr('dark')).toBe('dark');
  });
});
