import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Golf N (Nick, 30 september): het rustige prikbord, de tekst die de kolom
 * vult, elke soort als tab. De Keeper in *Wie is er?* staat in
 * `roster.test.ts` (§76, B).
 */

const ROOT = join(import.meta.dirname, '..', '..');
const read = (path: string) => readFileSync(join(ROOT, path), 'utf8');

describe('golf N: de laag', () => {
  it('ruimte.css komt na tekens.css, als laatste', () => {
    const layout = read('app/layout.tsx');
    const tekens = layout.indexOf("import './tekens.css';");
    const ruimte = layout.indexOf("import './ruimte.css';");
    expect(tekens).toBeGreaterThan(0);
    expect(ruimte).toBeGreaterThan(tekens);
  });

  it('elke regel over de kolom begint met .main, zodat een stylesheet van een component er niet overheen komt', () => {
    const css = read('app/ruimte.css');
    const start = css.indexOf('1. de kolom */') + '1. de kolom */'.length;
    const block = css.slice(start, css.indexOf('/* ------------------------------------------------------------ 2. de tabrij'));
    const selectors = block
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .split('{')
      .slice(0, -1)
      .flatMap((part) => part.split('}').pop()!.split(','))
      .map((s) => s.trim())
      .filter(Boolean);
    expect(selectors.length).toBeGreaterThan(10);
    for (const selector of selectors) expect(selector.startsWith('.main ')).toBe(true);
    for (const name of ['.prose', '.dossier-notities .editor-body', '.overzicht-page .entry-lead', '.home-intro', '.page']) {
      expect(selectors).toContain(`.main ${name}`);
    }
  });
});

describe('golf N: het prikbord', () => {
  const css = read('app/tekens.css');
  it('heeft geen spikkels, vezels of vlekken meer in tegels', () => {
    expect(css).not.toContain('--cork-mottle');
    expect(css).not.toContain('--cork-fleck');
    expect(css).not.toContain('--cork-hole');
  });
  it('het lapje in de lijst is hetzelfde vlak', () => {
    const swatch = css.slice(css.indexOf('.cork-swatch {'));
    expect(swatch.slice(0, swatch.indexOf('}'))).toContain('var(--board-surface)');
  });
});

describe('golf N: de tabrij', () => {
  it('Meer soorten en zijn rang bestaan niet meer', () => {
    expect(() => read('components/MeerSoorten.tsx')).toThrow();
    expect(() => read('lib/wiki/tabrij.ts')).toThrow();
    expect(read('lib/words.ts')).not.toContain('wikiMoreKinds');
  });
});
