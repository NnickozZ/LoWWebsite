import { expect, test, type Page } from '@playwright/test';
import { signIn, signUp } from './helpers';

/**
 * §8, live: two people at one wall.
 *
 * The merge rule has been right since phase 2 — `tests/unit/board-merge.test.ts`
 * is its specification — but nothing ever *looked*. These are the tests that
 * would have caught that: everything here is asserted on a second browser that
 * is never reloaded, because a reload would pass whether or not any of this
 * works.
 */

async function newBoard(page: Page): Promise<string> {
  await page.goto('/boards');
  await page.getByRole('button', { name: 'Openbaar prikbord' }).click();
  await page.waitForURL('**/b/**');
  return page.url();
}

async function addEntryCard(page: Page, name: string) {
  await page.getByLabel('Kaart toevoegen').fill(name);
  const option = page
    .locator('.suggest-item')
    .filter({ hasText: name })
    .filter({ hasNotText: 'als notitie' })
    .first();
  await expect(option).toBeVisible();
  await option.click();
  await expect(page.locator('.board-card', { hasText: name })).toBeVisible();
}

test('a card added on one screen appears on the other, with no reload', async ({
  page,
  browser,
}) => {
  await signIn(page, 'Keeper', 'abbeytower34');
  const boardUrl = await newBoard(page);

  const context = await browser.newContext();
  const watcher = await context.newPage();
  await signIn(watcher, 'Keeper', 'abbeytower34');
  await watcher.goto(boardUrl);
  await expect(watcher.locator('.board-viewport')).toBeVisible();

  await addEntryCard(page, 'De Schorre');

  // Never reloaded. This is the whole feature.
  await expect(watcher.locator('.board-card', { hasText: 'De Schorre' })).toBeVisible({
    timeout: 15_000,
  });

  // And it keeps working — the line stays open rather than firing once.
  await addEntryCard(page, 'Sister Clasina');
  await expect(watcher.locator('.board-card', { hasText: 'Sister Clasina' })).toBeVisible({
    timeout: 15_000,
  });

  // A note typed on one wall reaches the other as text, not just as a card.
  const noteName = `Losse aantekening ${Date.now().toString(36)}`;
  await page.getByLabel('Kaart toevoegen').fill(noteName);
  await page.locator('.suggest-item').filter({ hasText: 'als notitie' }).click();
  await expect(watcher.locator('.board-card', { hasText: noteName })).toBeVisible({
    timeout: 15_000,
  });

  await context.close();
});

test('each person is on the strip, and their hand shows on the card they hold', async ({
  page,
  browser,
}, testInfo) => {
  test.skip(testInfo.project.name === 'phone', 'selection by drag is a desktop gesture');

  const stamp = Date.now().toString(36).slice(-5);
  const playerName = `Anneke ${stamp}`;

  await signIn(page, 'Keeper', 'abbeytower34');
  const boardUrl = await newBoard(page);
  await addEntryCard(page, 'De Schorre');

  // A second person, so the two avatars are two accounts rather than two tabs.
  const context = await browser.newContext();
  const player = await context.newPage();
  await signUp(player, playerName, 'duikerklok');
  await player.goto(boardUrl);
  await expect(player.locator('.board-card', { hasText: 'De Schorre' })).toBeVisible({
    timeout: 15_000,
  });

  // Each sees the other on the strip, and neither sees themselves twice.
  await expect(page.locator('.board-person')).toHaveCount(1, { timeout: 15_000 });
  await expect(player.locator('.board-person')).toHaveCount(1, { timeout: 15_000 });

  // The player picks a card up; the Keeper sees whose hand is on it.
  await player.locator('.board-card', { hasText: 'De Schorre' }).click();
  const held = page.locator('.board-held');
  await expect(held).toHaveCount(1, { timeout: 15_000 });
  await expect(held.locator('.board-held-name')).toHaveText(playerName);

  // Letting go clears it, rather than leaving a border on the wall for ever.
  await player.locator('.board-viewport').click({ position: { x: 12, y: 12 } });
  await expect(page.locator('.board-held')).toHaveCount(0, { timeout: 15_000 });

  // And closing the tab takes the person off the strip without waiting to be reaped.
  await context.close();
  await expect(page.locator('.board-person')).toHaveCount(0, { timeout: 15_000 });
});

test('a change that arrives mid-drag waits until the card is put down', async ({
  page,
  browser,
}, testInfo) => {
  test.skip(testInfo.project.name === 'phone', '§8: no dragging under 768 px');

  await signIn(page, 'Keeper', 'abbeytower34');
  const boardUrl = await newBoard(page);
  await addEntryCard(page, 'Pier Boone');

  const context = await browser.newContext();
  const other = await context.newPage();
  await signIn(other, 'Keeper', 'abbeytower34');
  await other.goto(boardUrl);
  await expect(other.locator('.board-card', { hasText: 'Pier Boone' })).toBeVisible({
    timeout: 15_000,
  });

  // Take a card and hold it, halfway through a drag. The grip is well down the
  // card: the pin head is at the top, and pressing that runs string instead.
  const card = page.locator('.board-card', { hasText: 'Pier Boone' }).first();
  const box = (await card.boundingBox())!;
  await page.mouse.move(box.x + 80, box.y + 200);
  await page.mouse.down();
  await page.mouse.move(box.x + 80 + 180, box.y + 200 + 60, { steps: 12 });

  const mid = (await card.boundingBox())!;
  expect(mid.x - box.x).toBeGreaterThan(120);

  // Someone else adds a card while this one is still in the air.
  await addEntryCard(other, 'Sister Clasina');
  await page.waitForTimeout(1500);

  // The dragged card must not have been yanked back by a merge landing on top
  // of the pointer — the whole reason `paused` exists.
  const during = (await card.boundingBox())!;
  expect(Math.abs(during.x - mid.x)).toBeLessThan(20);

  // Put it down: the change that was waiting arrives, and the drag survives it.
  await page.mouse.up();
  await expect(page.locator('.board-card', { hasText: 'Sister Clasina' })).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.locator('.save-state')).toHaveText('Opgeslagen', { timeout: 15_000 });
  const after = (await card.boundingBox())!;
  expect(Math.abs(after.x - mid.x)).toBeLessThan(20);

  await context.close();
});

test('the other hand is on the wall: a pointer, and a card that travels before it lands', async ({
  page,
  browser,
}, testInfo) => {
  test.skip(testInfo.project.name === 'phone', '§8: no dragging under 768 px');
  test.setTimeout(90_000);

  await signIn(page, 'Keeper', 'abbeytower34');
  const boardUrl = await newBoard(page);
  await addEntryCard(page, 'Pier Boone');

  const context = await browser.newContext();
  const watcher = await context.newPage();
  const stamp = Date.now().toString(36);
  await signUp(watcher, `Toeschouwer ${stamp}`, 'onderzeeboot');
  await watcher.goto(boardUrl);
  await expect(watcher.locator('.board-card', { hasText: 'Pier Boone' })).toBeVisible({ timeout: 15_000 });
  // Both lines up before anything moves.
  await expect(page.locator('.board-person')).toHaveCount(1, { timeout: 15_000 });

  // Move the mouse over the cork: the watcher sees a named arrow.
  const viewport = (await page.locator('.board-viewport').boundingBox())!;
  await page.mouse.move(viewport.x + 300, viewport.y + 300);
  await page.mouse.move(viewport.x + 340, viewport.y + 320, { steps: 6 });
  const cursor = watcher.locator('.board-cursor');
  await expect(cursor).toHaveCount(1, { timeout: 10_000 });
  await expect(cursor.locator('.board-cursor-name')).toHaveText('Keeper');

  // And it follows: a further move lands within a few frames.
  const before = (await cursor.boundingBox())!;
  await page.mouse.move(viewport.x + 540, viewport.y + 320, { steps: 8 });
  await expect
    .poll(async () => (await cursor.boundingBox())!.x - before.x, { timeout: 5000 })
    .toBeGreaterThan(120);

  // Pick the card up and hold it mid-air: the watcher's copy travels with the
  // hand, well before the mouse is released and anything is saved.
  const card = page.locator('.board-card', { hasText: 'Pier Boone' }).first();
  const theirs = watcher.locator('.board-card', { hasText: 'Pier Boone' }).first();
  const box = (await card.boundingBox())!;
  const theirsBefore = (await theirs.boundingBox())!;
  await page.mouse.move(box.x + 80, box.y + 200);
  await page.mouse.down();
  await page.mouse.move(box.x + 80 + 220, box.y + 200 + 40, { steps: 15 });
  await expect
    .poll(async () => (await theirs.boundingBox())!.x - theirsBefore.x, { timeout: 5000 })
    .toBeGreaterThan(150);
  // …under a hand with the mover's name on it.
  await expect(watcher.locator('.board-held-name')).toHaveText('Keeper');

  // Release: the card stays where it was put on both walls — no snap back —
  // and the save lands without waiting for a debounce. (Let the last frame
  // arrive first: frames are throttled, and the hand stopped a moment ago.)
  await watcher.waitForTimeout(500);
  const heldAt = (await theirs.boundingBox())!;
  await page.mouse.up();
  await expect(page.locator('.save-state')).toHaveText('Opgeslagen', { timeout: 5000 });
  await watcher.waitForTimeout(600);
  const settled = (await theirs.boundingBox())!;
  expect(Math.abs(settled.x - heldAt.x)).toBeLessThan(12);
  await expect(watcher.locator('.board-card-carried')).toHaveCount(0, { timeout: 5000 });

  // The pointer leaves the wall, and the arrow goes with it.
  await page.mouse.move(viewport.x - 20, viewport.y - 20);
  await expect(cursor).toHaveCount(0, { timeout: 10_000 });

  await context.close();
});
