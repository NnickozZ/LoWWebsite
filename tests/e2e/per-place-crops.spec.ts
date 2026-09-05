import { expect, test } from '@playwright/test';
import { join, resolve } from 'node:path';
import { signIn } from './helpers';

const fixturePhoto = join(resolve(__dirname, '../..'), 'data-e2e', 'fixture-photo.png');

/**
 * A picture is uploaded once and squared off separately everywhere it appears:
 * the entry keeps the default for lists, a case keeps its own, and a board card
 * keeps its own again. Cropping it in one place must leave the others alone —
 * which is the whole point of storing a focal point rather than cutting the file.
 */
test('a case crops a cover for itself without touching the entry', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === 'phone', 'the crop gesture needs a pointer');

  const stamp = `${testInfo.project.name}-${Date.now().toString(36)}`;
  const entryName = `Willem Roggeveen ${stamp}`;
  const caseName = `Sluice Gate ${stamp}`;

  await signIn(page, 'Keeper', 'abbeytower34');

  // -- an entry with a cover, left at its default crop -----------------------
  await page.goto('/wiki/character');
  await page.getByRole('button', { name: 'Nieuw', exact: true }).click();
  const sheet = page.getByRole('dialog', { name: 'Nieuw artikel' });
  await sheet.getByLabel('Naam').fill(entryName);
  await sheet.getByRole('button', { name: 'Aanmaken' }).click();
  await page.waitForURL('**/e/**');

  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Afbeelding toevoegen' }).click();
  await (await chooser).setFiles(fixturePhoto);
  await expect(page.locator('.entry-cover-whole img')).toBeVisible();
  await expect(page.locator('.save-state')).toHaveText('Opgeslagen', { timeout: 15_000 });

  // -- file it in a case -----------------------------------------------------
  await page.goto('/cases');
  await page.getByRole('button', { name: 'Dossier openen' }).click();
  const caseSheet = page.getByRole('dialog', { name: 'Dossier openen' });
  await caseSheet.getByLabel('Naam').fill(caseName);
  await caseSheet.getByRole('button', { name: 'Openen', exact: true }).click();
  await page.waitForURL('**/c/**');
  const caseUrl = new URL(page.url()).pathname;

  await page.getByLabel('Voeg iets toe aan dit dossier…').fill(entryName);
  await page
    .locator('.suggest-item')
    .filter({ hasText: entryName })
    .filter({ hasNotText: 'aanmaken' })
    .first()
    .click();

  const caseCard = page.locator('.card', { hasText: entryName }).first();
  await expect(caseCard.locator('img')).toBeVisible();
  const focus = (locator: ReturnType<typeof page.locator>) =>
    locator.evaluate((n) => getComputedStyle(n).objectPosition);
  expect(await focus(caseCard.locator('img'))).toBe('50% 50%');

  // -- crop it for this case only -------------------------------------------
  await caseCard.getByRole('button', { name: /Opties voor/ }).click();
  await page.getByRole('button', { name: 'Bijsnijden voor dit dossier' }).click();

  const frame = (await page.locator('.card-cover-cropping').boundingBox())!;
  await page.mouse.move(frame.x + frame.width / 2, frame.y + frame.height / 2);
  await page.mouse.down();
  await page.mouse.move(frame.x + frame.width / 2 - 40, frame.y + frame.height / 2 - 30, {
    steps: 10,
  });
  await page.mouse.up();
  await page.getByRole('button', { name: 'Klaar' }).click();

  await page.goto(caseUrl);
  const caseFocus = await focus(page.locator('.card', { hasText: entryName }).first().locator('img'));
  expect(caseFocus).not.toBe('50% 50%');

  // -- the entry's own list crop is untouched -------------------------------
  await page.goto('/wiki/character');
  const wikiCard = page.locator('.card', { hasText: entryName }).first();
  await expect(wikiCard.locator('img')).toBeVisible();
  expect(await focus(wikiCard.locator('img'))).toBe('50% 50%');

  // -- and a board card starts from the entry's, not the case's -------------
  await page.goto('/boards');
  await page.getByRole('button', { name: 'Openbaar prikbord' }).click();
  await page.waitForURL('**/b/**');
  await page.getByLabel('Kaart toevoegen').fill(entryName);
  await page
    .locator('.suggest-item')
    .filter({ hasText: entryName })
    .filter({ hasNotText: 'als notitie' })
    .first()
    .click();

  const boardImage = page.locator('.board-card', { hasText: entryName }).first().locator('img');
  await expect(boardImage).toBeVisible();
  expect(await focus(boardImage)).toBe('50% 50%');
});

test('a case file can carry a picture of its own', async ({ page }, testInfo) => {
  const caseName = `Drowned Bell ${testInfo.project.name}-${Date.now().toString(36)}`;
  await signIn(page, 'Keeper', 'abbeytower34');

  await page.goto('/cases');
  await page.getByRole('button', { name: 'Dossier openen' }).click();
  const sheet = page.getByRole('dialog', { name: 'Dossier openen' });
  await sheet.getByLabel('Naam').fill(caseName);
  await sheet.getByRole('button', { name: 'Openen', exact: true }).click();
  await page.waitForURL('**/c/**');

  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Afbeelding toevoegen' }).click();
  await (await chooser).setFiles(fixturePhoto);
  // The dossier shows it whole, like an entry does.
  await expect(page.locator('.case-head .entry-cover-whole img')).toBeVisible();
  await expect(page.locator('.save-state')).toHaveText('Opgeslagen', { timeout: 15_000 });

  // And the Case Files grid squares it off on the card.
  await page.reload();
  await expect(page.locator('.case-head .entry-cover-whole img')).toBeVisible();
  await page.goto('/cases');
  const card = page.locator('.card', { hasText: caseName }).first();
  await expect(card.locator('.card-cover img')).toBeVisible();
  // Card pictures come from the 900 px variant, not the 400 px thumbnail.
  expect(await card.locator('.card-cover img').getAttribute('src')).toContain('s=card');
});
