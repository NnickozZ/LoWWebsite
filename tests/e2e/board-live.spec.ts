import { expect, test, type Page } from '@playwright/test';
import { becomeInvestigator, signIn, signUp } from './helpers';

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

test('a thread made thicker on one screen thickens on the other', async ({
  page,
  browser,
}, testInfo) => {
  test.skip(testInfo.project.name === 'phone', '§8: running string needs a pointer');

  await signIn(page, 'Keeper', 'abbeytower34');
  const boardUrl = await newBoard(page);
  await addEntryCard(page, 'Pier Boone');
  await addEntryCard(page, 'Sister Clasina');

  const context = await browser.newContext();
  const watcher = await context.newPage();
  await signIn(watcher, 'Keeper', 'abbeytower34');
  await watcher.goto(boardUrl);
  await expect(watcher.locator('.board-card', { hasText: 'Sister Clasina' })).toBeVisible({
    timeout: 15_000,
  });

  // Run a string between the two cards. It reaches the other wall at the width
  // every board has drawn since there were strings at all.
  const first = page.locator('.board-card', { hasText: 'Pier Boone' }).first();
  const second = page.locator('.board-card', { hasText: 'Sister Clasina' }).first();
  const pin = (await first.locator('.board-pin').boundingBox())!;
  const target = (await second.boundingBox())!;
  await page.mouse.move(pin.x + pin.width / 2, pin.y + pin.height / 2);
  await page.mouse.down();
  await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2, { steps: 12 });
  await page.mouse.up();

  await expect(watcher.locator('.board-string')).toHaveCount(1, { timeout: 15_000 });
  // Nothing is selected over there, so this is the thread's own thickness.
  const thickness = () =>
    watcher.locator('.board-string').first().evaluate((n) => getComputedStyle(n).strokeWidth);
  await expect.poll(thickness, { timeout: 15_000 }).toMatch(/^2(px)?$/);

  // Thicken it here; the other wall — never reloaded — grows it too.
  await page
    .locator('.board-inspector')
    .getByRole('radio', { name: 'Extra dik', exact: true })
    .click();
  await expect.poll(thickness, { timeout: 15_000 }).toMatch(/^6\.5(px)?$/);

  await context.close();
});

test('each person is on the strip, and their hand shows on the card they hold', async ({
  page,
  browser,
}, testInfo) => {
  test.skip(testInfo.project.name === 'phone', 'selection by drag is a desktop gesture');

  const stamp = Date.now().toString(36).slice(-5);
  const playerName = `Anneke ${stamp}`;
  // §18b: picking a card up is a hand on the wall, and the wall names the
  // *onderzoeker*. So the player makes one first, the way a real player does.
  const character = `Onderzoeker ${playerName}`;

  await signIn(page, 'Keeper', 'abbeytower34');
  const boardUrl = await newBoard(page);
  await addEntryCard(page, 'De Schorre');

  // A second person, so the two avatars are two accounts rather than two tabs.
  const context = await browser.newContext();
  const player = await context.newPage();
  await signUp(player, playerName, 'duikerklok');
  await becomeInvestigator(player, character);
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
  await expect(held.locator('.board-held-name')).toHaveText(character);

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

/**
 * §11 against §21, with the two words pulled apart.
 *
 * Every other "Keeper" in this file passes whichever rule the code follows,
 * because the seeded Keeper account is *called* Keeper. So this one renames the
 * word to "Spelleider" first: after that, a feed row that says "Keeper" is
 * reading the account, and an arrow that says "Spelleider" is reading the word,
 * and either is a bug. A log says what the Keeper did; a strip says who is
 * here, and the word is the same for every Keeper in the room.
 */
test('the feed says the Keeper’s word; presence says their account', async ({
  page,
  browser,
}, testInfo) => {
  test.skip(testInfo.project.name === 'phone', '§8: no pointer to show under 768 px');
  test.setTimeout(120_000);
  const stamp = Date.now().toString(36).slice(-5);
  const entryName = `Vuurtoren ${stamp}`;

  await signIn(page, 'Keeper', 'abbeytower34');

  // §11: the Keeper renames the Keeper.
  await page.goto('/admin');
  await page.getByRole('tab', { name: 'Woorden' }).click();
  await page.getByLabel('De spelleider', { exact: true }).fill('Spelleider');
  await page.getByRole('button', { name: 'Opslaan', exact: true }).click();
  await expect(page.getByText(/^Opgeslagen\./)).toBeVisible();

  try {
    // Something for the feed to say, by the Keeper.
    const status = await page.evaluate(async (name) => {
      const response = await fetch('/api/entries', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name, typeSlug: 'location' }),
      });
      return response.status;
    }, entryName);
    expect(status).toBe(200);

    const boardUrl = await newBoard(page);
    await addEntryCard(page, 'De Schorre');

    // A second account, so what the player sees is a Keeper and not themselves.
    const context = await browser.newContext();
    const player = await context.newPage();
    await signUp(player, `Griet ${stamp}`, 'onderzeeboot');
    await player.goto(boardUrl);
    await expect(player.locator('.board-card', { hasText: 'De Schorre' })).toBeVisible({
      timeout: 15_000,
    });

    // The wall's own strip: the account, not the word.
    const onTheWall = player.locator('.board-people .board-person').first();
    await expect(onTheWall).toHaveAttribute('title', 'Keeper', { timeout: 15_000 });

    // The arrow over the cork carries the same name.
    const viewport = (await page.locator('.board-viewport').boundingBox())!;
    await page.mouse.move(viewport.x + 300, viewport.y + 300);
    await page.mouse.move(viewport.x + 340, viewport.y + 320, { steps: 6 });
    const cursor = player.locator('.board-cursor');
    await expect(cursor).toHaveCount(1, { timeout: 10_000 });
    await expect(cursor.locator('.board-cursor-name')).toHaveText('Keeper');

    // And so does the hand on the card the Keeper picks up.
    await page.locator('.board-card', { hasText: 'De Schorre' }).first().click();
    const held = player.locator('.board-held');
    await expect(held).toHaveCount(1, { timeout: 15_000 });
    await expect(held.locator('.board-held-name')).toHaveText('Keeper');

    // One screen, both rules: the start page names the Keeper twice, and the
    // two names differ on purpose. "Ook hier" is the account…
    await page.goto('/');
    await player.goto('/');
    await expect(player.getByTestId('live-strip')).toHaveClass(/live-strip-live/, { timeout: 15_000 });
    const alsoHere = player.getByTestId('live-strip').locator('.board-person').first();
    await expect(alsoHere).toHaveAttribute('title', 'Keeper', { timeout: 15_000 });

    // …and the feed under it is the word, with the account in the tooltip.
    const row = player.locator('.feed-item').filter({ hasText: entryName }).first();
    await expect(row.locator('strong').first()).toHaveText('Spelleider');
    await expect(row.locator('strong').first()).toHaveAttribute('title', 'Keeper');

    await context.close();
  } finally {
    // Every other test in this run reads the default word, so put it back even
    // when something above fails.
    await page.goto('/admin');
    await page.getByRole('tab', { name: 'Woorden' }).click();
    await page.getByLabel('De spelleider', { exact: true }).fill('');
    await page.getByRole('button', { name: 'Opslaan', exact: true }).click();
    await expect(page.getByText(/^Opgeslagen\./)).toBeVisible();
  }
});

test('the box someone drags round the wall is on everyone else’s wall too', async ({
  page,
  browser,
}, testInfo) => {
  test.skip(testInfo.project.name === 'phone', '§8: no marquee under 768 px');
  test.setTimeout(90_000);

  await signIn(page, 'Keeper', 'abbeytower34');
  const boardUrl = await newBoard(page);
  await addEntryCard(page, 'Pier Boone');

  const context = await browser.newContext();
  const watcher = await context.newPage();
  const stamp = Date.now().toString(36);
  await signUp(watcher, `Kijker ${stamp}`, 'onderzeeboot');
  await watcher.goto(boardUrl);
  await expect(watcher.locator('.board-card', { hasText: 'Pier Boone' })).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('.board-person')).toHaveCount(1, { timeout: 15_000 });

  // Shift-drag a box over an empty stretch of cork. The other screen should
  // watch it open — until now the box was invisible and half the wall simply
  // lit up at once when it closed.
  const viewport = (await page.locator('.board-viewport').boundingBox())!;
  const from = { x: viewport.x + 420, y: viewport.y + 120 };
  await page.keyboard.down('Shift');
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + 260, from.y + 200, { steps: 12 });

  const theirs = watcher.locator('.board-marquee-other');
  await expect(theirs).toHaveCount(1, { timeout: 10_000 });
  await expect(theirs.locator('.board-marquee-name')).toHaveText('Keeper');
  // Polled rather than measured once: frames are throttled, so the first one to
  // arrive is the box as it was a moment ago, not as it is.
  await expect
    .poll(async () => (await theirs.boundingBox())!.width, { timeout: 10_000 })
    .toBeGreaterThan(200);

  // It keeps growing while the hand does.
  const opened = (await theirs.boundingBox())!;
  await page.mouse.move(from.x + 460, from.y + 320, { steps: 10 });
  await expect
    .poll(async () => (await theirs.boundingBox())!.width - opened.width, { timeout: 10_000 })
    .toBeGreaterThan(120);

  // And it is gone the moment the hand lets go: a rectangle left hanging on the
  // cork is worse than none.
  await page.mouse.up();
  await page.keyboard.up('Shift');
  await expect(theirs).toHaveCount(0, { timeout: 10_000 });
  // Nobody else's box was ever drawn on the wall of the person dragging it.
  await expect(page.locator('.board-marquee-other')).toHaveCount(0);

  await context.close();
});
