import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { skeletonShapeFor } from '@/components/shell/skeletonShape';
import { DEFAULT_WORDS } from '@/lib/words';

/**
 * §102 (ronde 65·b): de pure helften van "een navigatie zegt dat hij loopt".
 * Het gedrag in de browser staat in `tests/e2e/ronde-65-navigatie.spec.ts`.
 */

const ROOT = join(__dirname, '..', '..');

describe('skeletonShapeFor — welke route een skelet krijgt', () => {
  it('geeft de zes vormen', () => {
    expect(skeletonShapeFor('/e/veere')).toBe('entry');
    expect(skeletonShapeFor('/c/het-holle-tij')).toBe('case');
    expect(skeletonShapeFor('/wiki/person')).toBe('list');
    expect(skeletonShapeFor('/wiki/alles')).toBe('list');
    expect(skeletonShapeFor('/kamer/cornelis-vermeulen')).toBe('kamer');
    expect(skeletonShapeFor('/winkel')).toBe('winkel');
    expect(skeletonShapeFor('/spelers/kees')).toBe('speler');
  });

  // Golf h1 (T7): de tabpagina's kregen een vorm; ze stonden 2,5 s stil.
  it('geeft de vormen van de tabpagina’s', () => {
    for (const path of ['/boards', '/maps', '/timelines', '/stambomen']) expect(skeletonShapeFor(path), path).toBe('rows');
    expect(skeletonShapeFor('/cases')).toBe('cases');
    expect(skeletonShapeFor('/spelers')).toBe('hal');
    expect(skeletonShapeFor('/')).toBe('voordeur');
    expect(skeletonShapeFor('/wiki')).toBe('voordeur');
  });

  it('geeft niets op een tekenvlak (§34), een overzicht of een lijst zonder vaste vorm', () => {
    for (const path of ['/b/abc', '/maps/zeeland', '/timelines/x', '/stambomen/x', '/web', '/wiki/overzicht/start', '/search', '/admin', '/uitdelen', '/you', '/e/x/y']) {
      expect(skeletonShapeFor(path), path).toBeNull();
    }
  });
});

describe('de woorden en de beweging', () => {
  it('heeft een woord voor wat een schermlezer hoort', () => {
    expect(DEFAULT_WORDS.navLoading).toBe('Pagina wordt geladen');
  });

  it('beweegt alleen met tokens, en elke animatie heeft een reduced-motion-tak', () => {
    const css = readFileSync(join(ROOT, 'app', 'navigatie.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    const declarations = css.match(/(?:transition|animation)[\w-]*\s*:[^;]+;/g) ?? [];
    for (const declaration of declarations) {
      expect(declaration.replace(/--dur-\d/g, ''), declaration).not.toMatch(/\d(ms|s)\b/);
    }
    const reduced = css.slice(css.indexOf('@media (prefers-reduced-motion: reduce)'));
    for (const selector of ['.sidenav a[data-pending]::before', '.nav-progress-bar', '.nav-skeleton', 'nav-page-fade']) {
      expect(reduced, selector).toContain(selector);
    }
  });
});
