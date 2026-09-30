import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DEFAULT_WORDS } from '@/lib/words';

/**
 * §102 (ronde 65·b): de pure helften van "een navigatie zegt dat hij loopt".
 * Het gedrag in de browser staat in `tests/e2e/ronde-65-navigatie.spec.ts`.
 */

const ROOT = join(__dirname, '..', '..');

/*
 * Golf M (A1): het skelet en de fade zijn weg. De oude pagina blijft staan tot
 * de nieuwe er is; alleen het vakje (meteen) en de streep (na 150 ms) zeggen
 * dat er iets loopt. `skeletonShapeFor` bestaat niet meer.
 */
describe('golf M: één wissel, geen skelet en geen fade', () => {
  const css = readFileSync(join(ROOT, 'app', 'navigatie.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  const progress = readFileSync(join(ROOT, 'components', 'shell', 'NavProgress.tsx'), 'utf8');

  it('tekent geen skelet over de kolom en laat de pagina niet invervagen', () => {
    for (const gone of ['.nav-skeleton', 'nav-page-in', 'nav-page-fade', 'data-navigated', 'skeleton-in']) {
      expect(css, gone).not.toContain(gone);
    }
    expect(progress).not.toMatch(/Skeleton|data-navigated/);
  });

  it('houdt het vakje en de streep', () => {
    expect(css).toContain('.sidenav a[data-pending]');
    expect(css).toContain(".nav-progress[data-shown='1'] .nav-progress-bar");
    expect(progress).toMatch(/SHOW_AFTER_MS = 150/);
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
    for (const selector of ['.sidenav a[data-pending]::before', '.nav-progress-bar']) {
      expect(reduced, selector).toContain(selector);
    }
  });
});
