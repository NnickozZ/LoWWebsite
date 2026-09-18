import { expect, test } from '@playwright/test';
import { editCanvas, signIn } from './helpers';

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

  // §75: de lijst staat sinds ronde 38 op /wiki/alles; /wiki is de voordeur.
  await page.goto('/wiki/alles');
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

  // §66: `/stambomen` walks with the other shelves; one tree page is opened
  // below, after there is certain to be one to open.
  // §75: beide helften van de wiki lopen mee — de voordeur (een overzicht,
  // met secties en een strip) en de lijst.
  for (const path of ['/', '/wiki', '/wiki/alles', '/cases', '/boards', '/maps', '/timelines', '/stambomen', '/search?q=e', '/you']) {
    await page.goto(path);
    await page.waitForTimeout(300);
  }

  // §32: a tijdlijn with something on it, its windows open, and its sheets.
  await page.goto('/timelines');
  const shelf = page.locator('a[href^="/timelines/"]');
  const timelineHref = (await shelf.count()) ? await shelf.first().getAttribute('href') : null;
  if (timelineHref) {
    await page.goto(timelineHref);
    await page.waitForTimeout(300);
    // §73: a phone opens the tijdlijn in Lezen; this walk adds and draws.
    await editCanvas(page);
    const toggle = page.getByTestId('timeline-toggle-all');
    if (await toggle.count()) {
      await toggle.click();
      await page.waitForTimeout(300);
    }
    await page.getByTestId('timeline-add').click();
    await page.waitForTimeout(300);
    await page.keyboard.press('Escape');
    await page.getByTestId('timeline-settings').click();
    await page.waitForTimeout(300);
    await page.keyboard.press('Escape');
    // §33: the tekenlaag — a line, a gum, an undo, and the toolbar away again.
    await page.getByTestId('ink-pen').click();
    const stage = (await page.getByTestId('timeline-stage').boundingBox())!;
    await page.mouse.move(stage.x + 120, stage.y + 100);
    await page.mouse.down();
    await page.mouse.move(stage.x + 260, stage.y + 140, { steps: 8 });
    await page.mouse.up();
    await page.getByTestId('ink-eraser').click();
    await page.mouse.move(stage.x + 180, stage.y + 80);
    await page.mouse.down();
    await page.mouse.move(stage.x + 190, stage.y + 160, { steps: 6 });
    await page.mouse.up();
    await page.waitForTimeout(500);
    await page.getByTestId('ink-undo').click();
    await page.waitForTimeout(500);
    await page.keyboard.press('Escape');
  }

  // §33: the same on a prikbord, where the sheet also carries the Keeper's switch.
  await page.goto('/boards');
  const walls = page.locator('a[href^="/b/"]');
  const boardHref = (await walls.count()) ? await walls.first().getAttribute('href') : null;
  if (boardHref) {
    await page.goto(boardHref);
    await page.waitForTimeout(300);
    await editCanvas(page);
    await page.getByTestId('ink-pen').click();
    const wall = (await page.locator('.board-viewport').boundingBox())!;
    await page.mouse.move(wall.x + 120, wall.y + 100);
    await page.mouse.down();
    await page.mouse.move(wall.x + 260, wall.y + 140, { steps: 8 });
    await page.mouse.up();
    await page.waitForTimeout(500);
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Rechten' }).click();
    await page.waitForTimeout(300);
    await page.keyboard.press('Escape');
  }

  /*
   * §66: a stamboom with somebody in it, its handles, its picker and its loose
   * sheet. Made here rather than looked for: the demo fixture seeds no tree, so
   * a `if (there is one)` guard would quietly walk nothing at all.
   */
  await page.goto('/stambomen');
  await page.getByRole('button', { name: 'Nieuwe stamboom' }).click();
  const treeSheet = page.getByRole('dialog', { name: /Nieuwe stamboom/ });
  await treeSheet.getByLabel('Naam', { exact: true }).fill('Schone console');
  await treeSheet.getByRole('button', { name: 'Openbare stamboom' }).click();
  await page.waitForURL('**/stambomen/**');
  await page.waitForTimeout(300);
  // §73: a phone opens the tree in Lezen, where the toolbar has no search box.
  await expect(async () => {
    await editCanvas(page);
    await expect(page.locator('#tree-add-person')).toBeVisible({ timeout: 1500 });
  }).toPass({ timeout: 20_000 });
  await page.locator('#tree-add-person').fill('Jacob');
  const suggestion = page
    .locator('.tree-tools .suggest-item')
    .filter({ hasText: 'Jacob den Hollander' })
    .filter({ hasNotText: 'aanmaken' })
    .first();
  await suggestion.waitFor({ state: 'visible', timeout: 15_000 });
  await suggestion.click();
  const card = page.locator('[data-testid="tree-node"]').first();
  await card.waitFor({ state: 'visible', timeout: 15_000 });
  await card.click({ position: { x: 6, y: 6 } });
  await page.getByTestId('tree-handle-child').click();
  await page.waitForTimeout(300);
  await page.keyboard.press('Escape');
  await page.getByTestId('tree-add-loose').click();
  await page.waitForTimeout(300);
  await page.locator('[data-frame="unknown"] .tree-node-edit').first().click();
  await page.waitForTimeout(300);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);

  expect(complaints, `browser console was not clean:\n${complaints.join('\n')}`).toEqual([]);
});
