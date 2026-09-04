import { expect, test } from '@playwright/test';
import { signIn } from './helpers';

/**
 * A page that renders correctly can still be wrong.
 *
 * The entry page hands `EntryView` a set of finished nodes — the backlinks, the
 * history, a self-filling list — rendered on the server and placed into an
 * array by a different file. React asks for a key on every child of an array,
 * and for months it did not get one: "Each child in a list should have a unique
 * key prop … it was passed a child from EntryPage". Nothing looked broken, so
 * nobody chased it; React was quietly re-creating those subtrees rather than
 * moving them whenever the list changed.
 *
 * This is the only kind of bug the e2e suite cannot see by looking. So it
 * listens instead: any console error or warning on a page walk fails the test.
 *
 * It is worth running **against `next dev`** (`E2E_DEV=1 npm run test:e2e`).
 * A production build strips React's development warnings, so this spec is
 * nearly free there and catches nothing; in development it is the whole point.
 */
test('no console errors or warnings while walking the archive', async ({ page }) => {
  // Every page here is compiled on first visit under `next dev`, which is
  // slower than anything else in the suite and has nothing to do with the app.
  test.setTimeout(180_000);

  const complaints: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error' || message.type() === 'warning') {
      complaints.push(`[${message.type()}] ${page.url()} :: ${message.text().slice(0, 300)}`);
    }
  });
  page.on('pageerror', (error) => {
    complaints.push(`[pageerror] ${page.url()} :: ${error.message.slice(0, 300)}`);
  });

  await signIn(page, 'Keeper', 'abbeytower34');

  await page.goto('/wiki');
  const entryHrefs = await page.locator('a[href^="/e/"]').evaluateAll((anchors) =>
    Array.from(
      new Set(anchors.map((a) => (a as HTMLAnchorElement).getAttribute('href')!).filter(Boolean)),
    ).slice(0, 4),
  );
  expect(entryHrefs.length).toBeGreaterThan(0);

  for (const href of entryHrefs) {
    await page.goto(href);
    // Open every collapsed section, so the blocks that arrive as server-rendered
    // slots actually mount rather than sitting closed inside <details>.
    for (const section of await page.locator('article details summary').all()) {
      await section.click().catch(() => undefined);
    }
    await page.waitForTimeout(300);
  }

  for (const path of ['/', '/wiki', '/cases', '/boards', '/search?q=e', '/you']) {
    await page.goto(path);
    await page.waitForTimeout(300);
  }

  expect(complaints, `browser console was not clean:\n${complaints.join('\n')}`).toEqual([]);
});
