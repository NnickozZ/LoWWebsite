import { expect, test, type Page } from '@playwright/test';
import { signIn } from './helpers';

/**
 * The second pass over the board: bare pins for leads with no card, string
 * ends that can be moved afterwards, a border per card, a picture frame that
 * can be switched off, and the prompt that offers to file a pinned entry in
 * the case this board hangs off.
 *
 * Desktop only for the pointer work — §8 turns dragging off under 768 px.
 */

async function newBoard(page: Page) {
  await page.goto('/boards');
  await page.getByRole('button', { name: 'Nieuw prikbord' }).click();
  await page.waitForURL('**/b/**');
}

async function pinEntry(page: Page, name: string) {
  const search = page.getByLabel('Kaart toevoegen');
  await search.fill(name);
  const option = page
    .locator('.suggest-item')
    .filter({ hasText: name })
    .filter({ hasNotText: 'als notitie' })
    .first();
  await expect(option).toBeVisible();
  await option.click();
  await expect(page.locator('.board-card', { hasText: name }).first()).toBeVisible();
}

/** Drag from a card's pin to a point on the cork, or onto another card. */
async function dragFrom(page: Page, from: { x: number; y: number }, to: { x: number; y: number }) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 14 });
  await page.mouse.up();
}

test.describe('board strings and borders', () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name === 'phone', 'dragging needs a pointer (§8)');
  });

  test('a string dropped on bare cork gets a pin, and the pin can be moved on', async ({
    page,
  }) => {
    await signIn(page, 'Keeper', 'abbeytower34');
    await newBoard(page);
    await pinEntry(page, 'Pier Boone');
    await pinEntry(page, 'Sister Clasina');

    const first = page.locator('.board-card', { hasText: 'Pier Boone' }).first();
    const second = page.locator('.board-card', { hasText: 'Sister Clasina' }).first();
    const pin = (await first.locator('.board-pin').boundingBox())!;
    const viewport = (await page.locator('.board-viewport').boundingBox())!;

    // Somewhere on the cork that is not a card, and clear of the inspector bar
    // docked along the bottom: the top-left corner.
    const cork = { x: viewport.x + 60, y: viewport.y + 60 };
    await dragFrom(page, { x: pin.x + pin.width / 2, y: pin.y + pin.height / 2 }, cork);

    // A bare pin went in where the string was dropped, and the string is tied
    // to it — no loose ends, nothing floating in mid-air.
    await expect(page.locator('.board-string')).toHaveCount(1);
    await expect(page.locator('.board-pincard')).toHaveCount(1);
    await expect(page.locator('.board-anchor')).toHaveCount(0);

    // The new string selects itself, so its two grips are already on screen.
    await expect(page.locator('.board-end-handle')).toHaveCount(2);
    await page.getByLabel('Bijschrift').fill('unnamed lead');
    await page.getByLabel('Bijschrift').press('Enter');

    await expect(page.locator('.save-state')).toHaveText('Opgeslagen', { timeout: 15_000 });
    await page.reload();
    await expect(page.locator('.board-string')).toHaveCount(1);
    await expect(page.locator('.board-pincard')).toHaveCount(1);

    // The pin is a thing on the wall: drag its tag and the string follows.
    const tag = page.locator('.board-pincard .board-pintag');
    const tagBox = (await tag.boundingBox())!;
    const pathBefore = await page.locator('.board-string').first().getAttribute('d');
    await dragFrom(
      page,
      { x: tagBox.x + tagBox.width / 2, y: tagBox.y + tagBox.height / 2 },
      { x: tagBox.x + tagBox.width / 2 + 120, y: tagBox.y + tagBox.height / 2 + 40 },
    );
    await expect(page.locator('.board-string').first()).not.toHaveAttribute('d', pathBefore ?? '');

    // Label it from the inspector; a labelled pin is worth keeping.
    await page.getByLabel('Label van de punaise').fill('the harbour?');
    await page.getByLabel('Label van de punaise').press('Enter');
    await expect(tag).toHaveText('the harbour?');

    // Now take the string's end off the pin and put it on the other card.
    await page.locator('.board-string-label').click();
    await expect(page.locator('.board-end-handle')).toHaveCount(2);
    const head = (await page.locator('.board-pincard .board-pin').boundingBox())!;
    const target = (await second.boundingBox())!;
    await dragFrom(
      page,
      { x: head.x + head.width / 2, y: head.y + head.height / 2 },
      { x: target.x + target.width / 2, y: target.y + target.height / 2 },
    );

    // The labelled pin stays on the wall, now with nothing tied to it.
    await expect(page.locator('.board-pincard')).toHaveCount(1);
    await expect(page.locator('.board-string')).toHaveCount(1);
    await expect(page.locator('.save-state')).toHaveText('Opgeslagen', { timeout: 15_000 });
    await page.reload();
    await expect(page.locator('.board-pincard')).toHaveCount(1);
    await expect(page.locator('.board-string-label')).toHaveText('unnamed lead');
  });

  test('an unlabelled pin comes out of the wall with its last string', async ({ page }) => {
    await signIn(page, 'Keeper', 'abbeytower34');
    await newBoard(page);
    await pinEntry(page, 'Pier Boone');
    await pinEntry(page, 'Sister Clasina');

    const first = page.locator('.board-card', { hasText: 'Pier Boone' }).first();
    const second = page.locator('.board-card', { hasText: 'Sister Clasina' }).first();
    const pin = (await first.locator('.board-pin').boundingBox())!;
    const viewport = (await page.locator('.board-viewport').boundingBox())!;
    await dragFrom(
      page,
      { x: pin.x + pin.width / 2, y: pin.y + pin.height / 2 },
      { x: viewport.x + 60, y: viewport.y + 60 },
    );
    await expect(page.locator('.board-pincard')).toHaveCount(1);

    // Move the end straight off the bare pin onto a card: the pin goes too.
    const head = (await page.locator('.board-pincard .board-pin').boundingBox())!;
    const target = (await second.boundingBox())!;
    await dragFrom(
      page,
      { x: head.x + head.width / 2, y: head.y + head.height / 2 },
      { x: target.x + target.width / 2, y: target.y + target.height / 2 },
    );
    await expect(page.locator('.board-pincard')).toHaveCount(0);
    await expect(page.locator('.board-string')).toHaveCount(1);
    await expect(page.locator('.save-state')).toHaveText('Opgeslagen', { timeout: 15_000 });
    await page.reload();
    await expect(page.locator('.board-pincard')).toHaveCount(0);
    await expect(page.locator('.board-string')).toHaveCount(1);
  });

  test('a bare pin can be pushed in from the toolbar', async ({ page }) => {
    await signIn(page, 'Keeper', 'abbeytower34');
    await newBoard(page);
    await page.getByRole('button', { name: 'Punaise', exact: true }).click();
    await expect(page.locator('.board-pincard')).toHaveCount(1);
    // It selects itself, so the label field is right there.
    await page.getByLabel('Label van de punaise').fill('who paid?');
    await page.getByLabel('Label van de punaise').press('Enter');
    await expect(page.locator('.board-pintag')).toHaveText('who paid?');
    await expect(page.locator('.save-state')).toHaveText('Opgeslagen', { timeout: 15_000 });
    await page.reload();
    await expect(page.locator('.board-pintag')).toHaveText('who paid?');
  });

  test('a card takes its border from its type, and can be overridden', async ({ page }) => {
    await signIn(page, 'Keeper', 'abbeytower34');
    await newBoard(page);
    await pinEntry(page, 'Pier Boone');

    const card = page.locator('.board-card', { hasText: 'Pier Boone' }).first();
    // 'character' is seeded 'solid' — a photograph; the card inherits it without being told.
    await expect(card).toHaveClass(/brd-solid/);

    await card.locator('.board-card-body').click();
    const inspector = page.locator('.board-inspector');
    await expect(inspector).toBeVisible();

    // The default option names what it is inheriting, so nothing is a mystery.
    await expect(inspector.getByLabel('Rand', { exact: true })).toHaveValue('');
    await expect(inspector.locator('option[value=""]')).toHaveText(/Foto/);

    await inspector.getByLabel('Rand', { exact: true }).selectOption('tape');
    await expect(card).toHaveClass(/brd-tape/);
    await expect(card).not.toHaveClass(/brd-solid/);

    await expect(page.locator('.save-state')).toHaveText('Opgeslagen', { timeout: 15_000 });
    await page.reload();
    await expect(page.locator('.board-card').first()).toHaveClass(/brd-tape/);

    // Back to the type's own border.
    await page.locator('.board-card').first().locator('.board-card-body').click();
    await inspector.getByLabel('Rand', { exact: true }).selectOption('');
    await expect(page.locator('.board-card').first()).toHaveClass(/brd-solid/);
  });

  test('the picture frame can be switched off', async ({ page }) => {
    await signIn(page, 'Keeper', 'abbeytower34');
    await newBoard(page);
    await pinEntry(page, 'Pier Boone');

    const card = page.locator('.board-card', { hasText: 'Pier Boone' }).first();
    await expect(card.locator('.board-card-cover')).toHaveCount(1);

    await card.locator('.board-card-body').click();
    const inspector = page.locator('.board-inspector');
    await inspector.getByRole('button', { name: 'Foto verbergen' }).click();
    await expect(card.locator('.board-card-cover')).toHaveCount(0);

    await expect(page.locator('.save-state')).toHaveText('Opgeslagen', { timeout: 15_000 });
    await page.reload();
    await expect(page.locator('.board-card-cover')).toHaveCount(0);

    await page.locator('.board-card').first().locator('.board-card-body').click();
    await inspector.getByRole('button', { name: 'Foto tonen' }).click();
    await expect(page.locator('.board-card-cover')).toHaveCount(1);
  });

  test('pinning an entry to a case board offers to file it in the case', async ({
    page,
  }, testInfo) => {
    const caseName = `Harbour Rota ${testInfo.project.name}-${Date.now().toString(36)}`;
    await signIn(page, 'Keeper', 'abbeytower34');

    await page.goto('/cases');
    await page.getByRole('button', { name: 'Dossier openen' }).click();
    const sheet = page.getByRole('dialog', { name: 'Dossier openen' });
    await sheet.getByLabel('Naam').fill(caseName);
    await sheet.getByRole('button', { name: 'Openen', exact: true }).click();
    await page.waitForURL('**/c/**');
    const caseUrl = new URL(page.url()).pathname;

    await page.getByRole('tab', { name: 'Prikbord' }).click();
    await page.getByRole('button', { name: 'Nieuw prikbord' }).click();
    await page.waitForURL('**/b/**');

    await pinEntry(page, 'Pier Boone');

    // The board is this case's wall, so it asks — it does not decide.
    const toast = page.locator('.toast', { hasText: caseName });
    await expect(toast).toBeVisible();
    await toast.getByRole('button', { name: 'Toevoegen' }).click();
    await expect(page.locator('.toast', { hasText: 'toegevoegd aan' })).toBeVisible();

    await page.goto(caseUrl);
    await expect(page.locator('.card', { hasText: 'Pier Boone' }).first()).toBeVisible();

    // Asked once. Pinning the same entry again says nothing, because it is
    // already in the file.
    await page.goBack();
    await pinEntry(page, 'Pier Boone');
    await expect(page.locator('.toast', { hasText: 'zit nog niet in' })).toHaveCount(0);
  });
});

test('every entry type carries its own border in the wiki', async ({ page }) => {
  await signIn(page, 'Keeper', 'abbeytower34');

  await page.goto('/wiki/character');
  await expect(page.locator('.card').first()).toHaveClass(/brd-solid/);

  await page.goto('/wiki/location');
  await expect(page.locator('.card').first()).toHaveClass(/brd-dashed/);
});

test('one click on a board card selects; only a double-click opens it', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === 'phone', 'on a phone the second tap opens instead');
  await signIn(page, 'Keeper', 'abbeytower34');
  await newBoard(page);
  await pinEntry(page, 'Pier Boone');
  const boardUrl = page.url();

  const cover = page.locator('.board-card', { hasText: 'Pier Boone' }).first().locator('.board-card-cover');
  await cover.click();
  await expect(page.locator('.board-inspector')).toBeVisible();
  // Still on the wall: a stray click must never navigate.
  await page.waitForTimeout(400);
  expect(page.url()).toBe(boardUrl);

  // A second single click, on an already-selected card, still does not open.
  await cover.click();
  await page.waitForTimeout(400);
  expect(page.url()).toBe(boardUrl);

  await cover.dblclick();
  await page.waitForURL('**/e/**');
});

test.describe('the case tray on a board', () => {
  test('lists what the case holds that is not on the wall, and puts it there', async ({
    page,
  }, testInfo) => {
    const caseName = `Zoutkeet ${testInfo.project.name}-${Date.now().toString(36)}`;
    await signIn(page, 'Keeper', 'abbeytower34');

    // A case with two entries filed in it.
    await page.goto('/cases');
    await page.getByRole('button', { name: 'Dossier openen' }).click();
    const sheet = page.getByRole('dialog', { name: 'Dossier openen' });
    await sheet.getByLabel('Naam').fill(caseName);
    await sheet.getByRole('button', { name: 'Openen', exact: true }).click();
    await page.waitForURL('**/c/**');

    for (const name of ['Pier Boone', 'Sister Clasina']) {
      await page.getByLabel('Voeg iets toe aan dit dossier…').fill(name);
      await page
        .locator('.suggest-item')
        .filter({ hasText: name })
        .filter({ hasNotText: 'aanmaken' })
        .first()
        .click();
      await expect(page.locator('.card', { hasText: name }).first()).toBeVisible();
    }

    // §7: tabs on a desktop, one stacked page on a phone.
    const boardTab = page.getByRole('tab', { name: 'Prikbord' });
    if (await boardTab.isVisible().catch(() => false)) await boardTab.click();
    await page.getByRole('button', { name: 'Nieuw prikbord' }).click();
    await page.waitForURL('**/b/**');

    // Both are in the drawer, because neither is on the wall yet.
    const tray = page.locator('.board-tray');
    await expect(tray).toBeVisible();
    await expect(tray.locator('.board-tray-card')).toHaveCount(2);

    // Tapping one pins it, and it leaves the drawer.
    await tray.locator('.board-tray-card', { hasText: 'Pier Boone' }).click();
    await expect(page.locator('.board-card', { hasText: 'Pier Boone' }).first()).toBeVisible();
    await expect(tray.locator('.board-tray-card')).toHaveCount(1);

    // Filing it already happened, so no prompt to file it again.
    await expect(page.locator('.toast', { hasText: 'zit nog niet in' })).toHaveCount(0);

    await expect(page.locator('.save-state')).toHaveText('Opgeslagen', { timeout: 15_000 });
    await page.reload();
    await expect(page.locator('.board-tray-card')).toHaveCount(1);
    await expect(page.locator('.board-card', { hasText: 'Pier Boone' }).first()).toBeVisible();

    // It collapses to a spine and comes back.
    await page.getByRole('button', { name: 'Lade inklappen' }).click();
    await expect(page.locator('.board-tray')).toHaveCount(0);
    await page.locator('.board-tray-spine').click();
    await expect(page.locator('.board-tray')).toBeVisible();
  });

  test('a standalone board has no drawer', async ({ page }) => {
    await signIn(page, 'Keeper', 'abbeytower34');
    await newBoard(page);
    await expect(page.locator('.board-tray')).toHaveCount(0);
    await expect(page.locator('.board-tray-spine')).toHaveCount(0);
  });
});
