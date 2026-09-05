import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * §27: the one that took the archive down.
 *
 * `instrumentation.ts` is compiled once for every runtime Next supports,
 * including edge, and the edge build can resolve neither `node:fs` nor the bare
 * `require('fs')` inside better-sqlite3. The `NEXT_RUNTIME !== 'nodejs'` guard
 * at the top of `register()` reads like it settles this and does not: it stops
 * the code *running*, while webpack follows every `await import(…)` in the file
 * into the edge bundle anyway, because a specifier that is dynamic to a reader
 * is perfectly static to a bundler. One unresolvable import there answers 500
 * to every page — and it does it in `next dev` first, which is the machine the
 * Keeper is sitting at.
 *
 * `next.config.mjs` answers it with an `IgnorePlugin` on the edge build, and
 * that plugin has to name every module instrumentation imports. Adding an
 * import and forgetting the line is a silent trap: the feature works, the
 * backfill runs, the tests pass, and the site is down. So this reads both files
 * and refuses the mismatch.
 */
describe('instrumentation stays out of the edge bundle', () => {
  const root = join(__dirname, '..', '..');
  const instrumentation = readFileSync(join(root, 'instrumentation.ts'), 'utf8');
  const config = readFileSync(join(root, 'next.config.mjs'), 'utf8');

  /** Every `await import('./x')` / `import('@/x')` in instrumentation.ts. */
  const imported = [
    ...instrumentation.matchAll(/import\(\s*['"]([^'"]+)['"]\s*\)/g),
    ...instrumentation.matchAll(/^\s*import\s[^'"]*['"]([^'"]+)['"]/gm),
  ]
    .map((match) => match[1])
    .filter((specifier) => specifier.startsWith('.') || specifier.startsWith('@/'))
    .map((specifier) => specifier.replace(/^\.\//, '').replace(/^@\//, ''));

  const ignoreLine = config.match(/resourceRegExp:\s*(\/[^\n]*?\/)[,\s]/);

  it('the edge build has an IgnorePlugin at all', () => {
    expect(ignoreLine, 'next.config.mjs no longer has an edge IgnorePlugin').toBeTruthy();
  });

  it('names every module instrumentation.ts imports', () => {
    expect(imported.length).toBeGreaterThan(0);
    // The config's pattern matches a webpack request, which uses whichever
    // separator the platform hands it; test both spellings of each path.
    const source = ignoreLine![1].slice(1, -1);
    const pattern = new RegExp(source);
    for (const specifier of imported) {
      const posix = `./${specifier}`;
      const win32 = `.\\${specifier.replace(/\//g, '\\')}`;
      expect(
        pattern.test(posix) || pattern.test(win32) || pattern.test(specifier),
        `instrumentation.ts imports "${specifier}", which the edge IgnorePlugin in ` +
          `next.config.mjs does not name. Add it there, or the edge build will try to ` +
          `bundle it and every page will answer 500.`,
      ).toBe(true);
    }
  });
});
