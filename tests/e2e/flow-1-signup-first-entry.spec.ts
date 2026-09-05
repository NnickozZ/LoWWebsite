import { expect, test } from '@playwright/test';
import { newEntryButton, signUp } from './helpers';

/**
 * Golden flow 1 (§15): enter invite code, pick a username and password, tap +,
 * choose Character, type a name and short description, create. No other screens.
 */
test('sign up and file a first entry', async ({ page }, testInfo) => {
  const stamp = `${testInfo.project.name}-${Date.now().toString(36)}`;
  const username = `Bram ${stamp}`;
  const entryName = `Pier Boone ${stamp}`;

  await signUp(page, username, 'onderzeeboot');

  // Landed straight in the archive.
  await expect(page.getByRole('heading', { name: 'Sinds je laatste bezoek' })).toBeVisible();

  await newEntryButton(page).click();

  const sheet = page.getByRole('dialog', { name: 'Nieuw artikel' });
  await expect(sheet).toBeVisible();

  await sheet.getByRole('radio', { name: 'Personen' }).click();
  await sheet.getByLabel('Naam').fill(entryName);
  await sheet
    .getByLabel('Korte beschrijving')
    .fill('Met on the Vlissingen quay at dusk; watchful, two ledgers, salt-stained coat.');

  // The placeholder is the brief's wording, verbatim.
  await expect(sheet.getByLabel('Korte beschrijving')).toHaveAttribute(
    'placeholder',
    'Waar kwam je ze tegen, wat was de sfeer, wat was de context van de eerste ontmoeting, en hoe zagen ze eruit?',
  );

  await sheet.getByRole('button', { name: 'Aanmaken' }).click();

  await page.waitForURL('**/e/**');
  await expect(page.getByLabel('Naam')).toHaveValue(entryName);
  await expect(page.getByLabel('Korte beschrijving')).toHaveValue(/Vlissingen quay/);
  // The page is already valid and published — "Meer info" is there to fill,
  // open: a card beside the text on a wide screen, unfolded under the
  // header on a phone.
  const info = page.locator('#block-info');
  await expect(info).toBeVisible();
  await expect(info).toContainText('Meer info');
  await expect(info.getByLabel('Bijnamen')).toBeVisible();

  // "Op deze pagina": the outline names the parts and jumps to them.
  const outline = page.getByRole('navigation', { name: 'Op deze pagina' });
  await expect(outline.getByRole('link', { name: 'Tekst' })).toBeVisible();
  await outline.getByRole('link', { name: /Genoemd in/ }).click();
  await expect(page.locator('details.section[open] > summary', { hasText: 'Genoemd in' })).toBeVisible();

  // And it is immediately findable.
  await page.goto('/search');
  await page.getByLabel('Zoeken in het archief').fill(entryName);
  await expect(page.getByRole('link', { name: new RegExp(entryName) }).first()).toBeVisible();
});
