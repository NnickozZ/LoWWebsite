import { expect, test, type Page } from '@playwright/test';
import { signIn } from './helpers';

/**
 * §8: a deletion has to survive the other people at the wall.
 *
 * Merging by id cannot express a deletion. Someone whose screen still shows a
 * card the wall no longer has will send that card up with their next save,
 * entirely honestly, and an upsert puts it straight back — so the card the
 * Keeper just took down reappears a few seconds later, on every screen. It is
 * not a rare race: a client that is busy (mid-drag, mid-crop) *deliberately*
 * defers an incoming change, which is exactly the window that produces it.
 *
 * `mergeBoardState` therefore records deletions. These two tests are the pair
 * that matters: the deletion must stick, and undo must still be able to lift it.
 */

async function newBoard(page: Page): Promise<string> {
  await page.goto('/boards');
  await page.getByRole('button', { name: 'Openbaar prikbord' }).click();
  await page.waitForURL('**/b/**');
  return page.url();
}

async function addNote(page: Page, name: string) {
  await page.getByLabel('Kaart toevoegen').fill(name);
  await page.locator('.suggest-item').last().click();
  await expect(page.locator('.board-card', { hasText: name })).toBeVisible();
}

test('a card deleted on one screen stays deleted, even mid-drag on another', async ({
  page,
  browser,
}) => {
  test.setTimeout(180_000);
  await signIn(page, 'Keeper', 'abbeytower34');
  const url = await newBoard(page);

  for (const name of ['Kaart een', 'Kaart twee', 'Kaart drie']) await addNote(page, name);
  await expect(page.locator('.board-card')).toHaveCount(3);
  await page.waitForTimeout(2000);

  const other = await browser.newContext();
  const second = await other.newPage();
  await signIn(second, 'Keeper', 'abbeytower34');
  await second.goto(url);
  await expect(second.locator('.board-card')).toHaveCount(3);
  await second.waitForTimeout(1200);

  // The second screen picks a card up and holds it: `paused`, so anything that
  // arrives now is remembered rather than applied.
  const held = second.locator('.board-card', { hasText: 'Kaart een' }).first();
  const box = (await held.boundingBox())!;
  await second.mouse.move(box.x + box.width / 2, box.y + 20);
  await second.mouse.down();
  await second.mouse.move(box.x + box.width / 2 + 120, box.y + 140, { steps: 10 });

  for (const name of ['Kaart twee', 'Kaart drie']) {
    await page.locator('.board-card', { hasText: name }).first().click();
    await page.keyboard.press('Delete');
  }
  await expect(page.locator('.board-card')).toHaveCount(1);
  await page.waitForTimeout(1800);

  // Putting the card down is what saves the stale document.
  await second.mouse.up();
  await second.waitForTimeout(2500);

  await expect(second.locator('.board-card')).toHaveCount(1);
  await expect(page.locator('.board-card')).toHaveCount(1);

  const fresh = await browser.newContext();
  const third = await fresh.newPage();
  await signIn(third, 'Keeper', 'abbeytower34');
  await third.goto(url);
  await expect(third.locator('.board-card')).toHaveCount(1);
  await expect(third.locator('.board-card', { hasText: 'Kaart een' })).toBeVisible();

  await other.close();
  await fresh.close();
});

test('undo still puts a saved deletion back', async ({ page }) => {
  test.setTimeout(180_000);
  await signIn(page, 'Keeper', 'abbeytower34');
  const url = await newBoard(page);

  await addNote(page, 'Terug te halen');
  await addNote(page, 'Blijft staan');
  await page.waitForTimeout(2000);

  await page.locator('.board-card', { hasText: 'Terug te halen' }).first().click();
  await page.keyboard.press('Delete');
  await expect(page.locator('.board-card')).toHaveCount(1);
  // Long enough that the deletion is written down server-side, which is the
  // only version of this test worth running: undoing before the save reaches
  // the server would pass without the restore path existing at all.
  await page.waitForTimeout(2500);

  await page.keyboard.press('Control+z');
  await expect(page.locator('.board-card')).toHaveCount(2);
  await page.waitForTimeout(2500);

  await page.goto(url);
  await expect(page.locator('.board-card')).toHaveCount(2);
  await expect(page.locator('.board-card', { hasText: 'Terug te halen' })).toBeVisible();
});
