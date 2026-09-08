import { expect, test, type Page } from '@playwright/test';
import { editArticle, fillWhenReady, newEntryButton, signIn } from './helpers';

/**
 * §52, round 27: the wall's half.
 *
 *   1. A dossier and another prikbord hang on a wall like any other card.
 *   2. A card shows the *live* name of what it stands for, so renaming an
 *      artikel renames it on every wall it hangs on.
 *   3. A string let go on bare cork opens the picker at the spot it was
 *      dropped, and what is picked there ends up tied to that string.
 *
 * Desktop only: §8 turns dragging and string-drawing off under 768 px, and two
 * of the three are drags.
 */

const KEEPER = ['Keeper', 'abbeytower34'] as const;
const stamp = Date.now().toString(36);

async function newBoard(page: Page) {
  await page.goto('/boards');
  await page.getByRole('button', { name: 'Openbaar prikbord' }).click();
  await page.waitForURL('**/b/**');
}

/** A wall with a name of its own, so it can be found in a search box later. */
async function newNamedBoard(page: Page, name: string) {
  await newBoard(page);
  await fillWhenReady(page.getByLabel('Naam van het prikbord'), name);
  // The name is written on blur, and nothing on the page says when that
  // landed — so wait for the write itself rather than for a moment later.
  const written = page.waitForResponse(
    (response) => response.url().includes('/api/boards/') && response.request().method() === 'PATCH',
  );
  await page.getByLabel('Naam van het prikbord').blur();
  await written;
  return page.url();
}

/** Pick something out of the bar at the top of the wall. */
async function pickInBar(page: Page, typed: string, row: RegExp | string) {
  await page.getByLabel('Kaart toevoegen').fill(typed);
  // Never the two rows at the foot of the list: both carry the typed text, and
  // both make something new instead of finding it.
  const option = page
    .locator('.suggest-item')
    .filter({ hasText: row })
    .filter({ hasNotText: 'aanmaken' })
    .filter({ hasNotText: 'toevoegen' })
    .first();
  await expect(option).toBeVisible();
  await option.click();
}

async function dragFrom(page: Page, from: { x: number; y: number }, to: { x: number; y: number }) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 14 });
  await page.mouse.up();
}

test.describe('§52 het prikbord', () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name === 'phone', 'slepen heeft een muis nodig (§8)');
  });

  test('een dossier en een ander prikbord hangen als kaart op de muur', async ({ page }) => {
    const caseName = `Dossier van de haven ${stamp}`;
    const boardName = `Muur van de haven ${stamp}`;

    await signIn(page, ...KEEPER);

    // Something to point at: a dossier, and a wall with a name of its own.
    await page.goto('/cases');
    await page.getByRole('button', { name: 'Dossier openen' }).click();
    const sheet = page.getByRole('dialog', { name: 'Dossier openen' });
    await sheet.getByLabel('Naam', { exact: true }).fill(caseName);
    await sheet.getByRole('button', { name: 'Openen', exact: true }).click();
    await page.waitForURL('**/c/**');

    await newNamedBoard(page, boardName);

    // And the wall they go on, named too — the last check below searches for
    // it, and every fresh wall is called "Nieuw prikbord" until it is not.
    const hostName = `Muur waar alles op hangt ${stamp}`;
    await newNamedBoard(page, hostName);
    await pickInBar(page, caseName, caseName);
    await expect(page.locator('.board-card', { hasText: caseName })).toBeVisible();
    await pickInBar(page, boardName, boardName);
    await expect(page.locator('.board-card', { hasText: boardName })).toBeVisible();

    // Each says what it is, under its two lines of type.
    await expect(page.locator('.board-card-kind').filter({ hasText: 'dossier' })).toHaveCount(1);
    await expect(page.locator('.board-card-kind').filter({ hasText: 'prikbord' })).toHaveCount(1);

    // And they stay: the kind and the id it carries survive a save and a read.
    await expect(page.locator('.save-state')).toHaveText('Opgeslagen', { timeout: 15_000 });
    await page.reload();
    await expect(page.locator('.board-card', { hasText: caseName })).toBeVisible();
    await expect(page.locator('.board-card', { hasText: boardName })).toBeVisible();

    // A wall is never offered to itself: this one is not in its own picker.
    await page.getByLabel('Kaart toevoegen').fill(hostName);
    await expect(
      page
        .locator('.suggest-item')
        .filter({ hasText: hostName })
        .filter({ hasNotText: 'aanmaken' })
        .filter({ hasNotText: 'toevoegen' }),
    ).toHaveCount(0);
  });

  test('een kaart draagt de naam die het artikel nu heeft', async ({ page }) => {
    const was = `Het lege huis ${stamp}`;
    const now = `Het huis aan de dijk ${stamp}`;

    await signIn(page, ...KEEPER);

    // An artikel of our own, so no other spec's fixture is renamed.
    await page.goto('/wiki');
    await newEntryButton(page).click();
    const sheet = page.getByRole('dialog', { name: 'Nieuw artikel' });
    await sheet.getByRole('radio', { name: 'Locaties', exact: true }).click();
    await fillWhenReady(sheet.getByLabel('Naam', { exact: true }), was);
    await sheet.getByRole('button', { name: 'Aanmaken' }).click();
    await expect(page.locator('#entry-name')).toHaveValue(was, { timeout: 20_000 });
    const article = page.url();

    await newBoard(page);
    const wall = page.url();
    await pickInBar(page, was, was);
    await expect(page.locator('.board-card', { hasText: was })).toBeVisible();
    await expect(page.locator('.save-state')).toHaveText('Opgeslagen', { timeout: 15_000 });

    // Rename it in the artikel itself — which is the whole complaint: the name
    // is copied onto the card at pinning time and was never read again.
    await page.goto(article);
    await editArticle(page);
    await fillWhenReady(page.locator('#entry-name'), now);
    await page.locator('#entry-name').blur();
    await expect(page.locator('.save-state')).toHaveText('Opgeslagen', { timeout: 15_000 });

    await page.goto(wall);
    await expect(page.locator('.board-card', { hasText: now })).toBeVisible();
    await expect(page.locator('.board-card', { hasText: was })).toHaveCount(0);
  });

  test('een draadje dat je in het niets loslaat vraagt waar het heen gaat', async ({ page }) => {
    await signIn(page, ...KEEPER);
    await newBoard(page);

    // One card to run string from.
    await page.getByRole('button', { name: 'Nieuwe notitie' }).click();
    await expect(page.locator('.board-card')).toHaveCount(1);

    const viewport = (await page.locator('.board-viewport').boundingBox())!;
    const head = (await page.locator('.board-card .board-pin').first().boundingBox())!;
    const from = { x: head.x + head.width / 2, y: head.y + head.height / 2 };

    // First drop: cancelled. The speld stays in the wall, exactly as a string
    // dropped in the void has always left one.
    await dragFrom(page, from, { x: viewport.x + 90, y: viewport.y + 70 });
    const picker = page.locator('.board-picker-float');
    await expect(picker).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(picker).toHaveCount(0);
    await expect(page.locator('.board-pincard')).toHaveCount(1);
    await expect(page.locator('.board-string')).toHaveCount(1);

    // The new string selected itself, which puts a grip on the very pin head
    // the next drag starts from. A second Escape lets go of it.
    await page.keyboard.press('Escape');
    await expect(page.locator('.board-end-handle')).toHaveCount(0);

    // Second drop, and this time it is answered: the speld becomes the card
    // that was picked, so the string that was drawn is tied to it.
    await dragFrom(page, from, { x: viewport.x + 380, y: viewport.y + 220 });
    await expect(picker).toBeVisible();
    await picker.getByLabel('Kaart hier vastknopen').fill('Pier Boone');
    const option = picker
      .locator('.suggest-item')
      .filter({ hasText: 'Pier Boone' })
      .filter({ hasNotText: 'aanmaken' })
      .filter({ hasNotText: 'toevoegen' })
      .first();
    await expect(option).toBeVisible();
    await option.click();

    await expect(picker).toHaveCount(0);
    await expect(page.locator('.board-card', { hasText: 'Pier Boone' })).toBeVisible();
    // One speld, not two: the second string's speld *became* the artikel card.
    await expect(page.locator('.board-pincard')).toHaveCount(1);
    await expect(page.locator('.board-string')).toHaveCount(2);

    await expect(page.locator('.save-state')).toHaveText('Opgeslagen', { timeout: 15_000 });
    await page.reload();
    await expect(page.locator('.board-card', { hasText: 'Pier Boone' })).toBeVisible();
    await expect(page.locator('.board-string')).toHaveCount(2);
  });
});
