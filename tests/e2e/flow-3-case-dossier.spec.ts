import { expect, test, type Page } from '@playwright/test';
import { inviteCode, signIn } from './helpers';

/**
 * Golden flow 3 (§15): create a case, add two existing entries from a tab
 * search, create a third from the same box, write a case note on one card, set
 * visibility to assigned, and confirm a non-member cannot see the case anywhere
 * — nav, search, home feed or direct URL.
 */
test('case dossier, and a confidential case stays invisible', async ({ page, browser }, testInfo) => {
  const stamp = `${testInfo.project.name}-${Date.now().toString(36)}`;
  const caseName = `Vlissingen Ledger ${stamp}`;
  const newEntryName = `Second Ledger ${stamp}`;

  await signIn(page, 'Keeper', 'abbeytower34');

  // -- open the case ---------------------------------------------------------
  await page.goto('/cases');
  await page.getByRole('button', { name: 'Dossier openen' }).click();

  const sheet = page.getByRole('dialog', { name: 'Dossier openen' });
  await sheet.getByLabel('Naam').fill(caseName);
  await sheet.getByLabel('Samenvatting').fill('Which ledger is the real one, and who reads it?');
  await sheet.getByRole('button', { name: 'Openen', exact: true }).click();

  await page.waitForURL('**/c/**');
  await expect(page.getByLabel('Naam van het dossier')).toHaveValue(caseName);
  const caseUrl = new URL(page.url()).pathname;

  // -- two existing entries, from the Overview search ------------------------
  await addFromSearch(page, 'Voeg iets toe aan dit dossier…', 'Pier Boone');
  await addFromSearch(page, 'Voeg iets toe aan dit dossier…', 'Jacob den Hollander');

  // Filling People makes its tab appear (§7: empty tabs are hidden).
  const peopleTab = page.getByRole('tab', { name: 'Personen' });
  const peopleHeading = page.locator('.sticky-section-head', { hasText: 'Personen' });
  if (await peopleTab.isVisible().catch(() => false)) {
    await peopleTab.click();
  } else {
    await expect(peopleHeading).toBeVisible();
  }

  // -- a third entry, created from the same box ------------------------------
  const peopleSearch = page.getByLabel('Zoek of maak personen…');
  await peopleSearch.fill(newEntryName);
  await page.locator('.suggest-item').filter({ hasText: 'aanmaken' }).first().click();

  const entrySheet = page.getByRole('dialog', { name: 'Nieuw artikel' });
  await expect(entrySheet.getByLabel('Naam')).toHaveValue(newEntryName);
  await entrySheet.getByRole('button', { name: 'Aanmaken' }).click();
  await expect(entrySheet).toBeHidden();

  await expect(page.getByText(newEntryName).first()).toBeVisible();

  // -- the tab row has no scrollbar until the tabs really overflow ----------
  if (testInfo.project.name === 'desktop') {
    await expect(page.locator('.case-tabs')).not.toHaveClass(/case-tabs-scrollable/);
  }

  // -- a case note on one card ----------------------------------------------
  const card = page.locator('.card', { hasText: 'Pier Boone' }).first();
  await card.getByRole('button', { name: /Opties voor/ }).click();
  await page.getByRole('button', { name: /dossiernotitie/i }).click();
  await page.locator('textarea[placeholder="Waarom dit hier van belang is"]').fill('Keeps the second ledger.');
  await page.locator('textarea[placeholder="Waarom dit hier van belang is"]').blur();
  await expect(page.getByText('Keeps the second ledger.')).toBeVisible();

  // -- make it confidential (§17: the view dial to "Toegewezen") -------------
  // The chip reads "Kijken: iedereen" until people are chosen, then
  // "Toegewezen: n" (5 Sep 2026).
  await page.getByRole('button', { name: /^(Kijken|Toegewezen):/ }).click();
  const viewDial = page.getByRole('radiogroup', { name: 'Wie mag kijken' });
  await viewDial.getByRole('radio', { name: 'Toegewezen' }).click();
  await expect(viewDial.getByRole('radio', { name: 'Toegewezen' })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await expect(page.locator('.stamp', { hasText: 'Vertrouwelijk' })).toBeVisible();
  await page.waitForTimeout(600); // the PATCH is immediate; give it a beat

  // -- a non-member sees nothing anywhere -----------------------------------
  const outsiderContext = await browser.newContext();
  const outsider = await outsiderContext.newPage();
  const outsiderName = `Outsider ${stamp}`;

  await outsider.goto('/signup');
  await outsider.getByLabel('Uitnodigingscode').fill(inviteCode());
  await outsider.getByLabel('Naam').fill(outsiderName);
  await outsider.getByLabel('Wachtwoord', { exact: true }).fill('onderzeeboot');
  await outsider.getByLabel('Wachtwoord nogmaals').fill('onderzeeboot');
  await outsider.getByRole('button', { name: 'Account aanmaken' }).click();
  await outsider.waitForURL('**/');

  // nav
  await outsider.goto('/cases');
  await expect(outsider.getByText(caseName)).toHaveCount(0);

  // home feed
  await outsider.goto('/');
  await expect(outsider.getByText(caseName)).toHaveCount(0);

  // search
  await outsider.goto('/search');
  await outsider.getByLabel('Zoeken in het archief').fill(caseName);
  await outsider.waitForTimeout(600);
  await expect(outsider.getByRole('link', { name: new RegExp(caseName) })).toHaveCount(0);

  // direct URL
  const response = await outsider.goto(caseUrl);
  expect(response?.status()).toBe(404);

  await outsiderContext.close();
});

/**
 * Types into one of the case's add-boxes and picks the existing entry — not the
 * "Create '<typed>'" row, which renders instantly while the suggestions are
 * still in flight.
 */
async function addFromSearch(page: Page, placeholder: string, entryName: string) {
  const box = page.getByLabel(placeholder);
  await box.fill(entryName);
  const option = page
    .locator('.suggest-item')
    .filter({ hasText: entryName })
    .filter({ hasNotText: 'aanmaken' })
    .first();
  await expect(option).toBeVisible();
  await option.click();
  await expect(box).toHaveValue('');
}
