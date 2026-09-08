import { expect, test, type Page } from '@playwright/test';
import { inviteCode, signIn, signUp } from './helpers';

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
  await sheet.getByLabel('Naam', { exact: true }).fill(caseName);
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
  await expect(entrySheet.getByLabel('Naam', { exact: true })).toHaveValue(newEntryName);
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
  await page.getByRole('menuitem', { name: /dossiernotitie/i }).click();
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
  await outsider.getByLabel('Naam', { exact: true }).fill(outsiderName);
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
 * The button beside the add-box: "Nieuw artikel in dit dossier".
 *
 * The box searches for something that already exists and ties it on; this makes
 * one that does not exist yet, filed here from the first keystroke. That road
 * was always there — the last suggestion, after you had typed — but nothing on
 * screen said so, which is what Nick reported (6 Sep 2026).
 */
test('a new artikel can be made from the dossier overview', async ({ page, browser }, testInfo) => {
  const stamp = `${testInfo.project.name}-${Date.now().toString(36)}`;
  const caseName = `Nieuwe aanwas ${stamp}`;
  const entryName = `Havenmeester ${stamp}`;

  await signIn(page, 'Keeper', 'abbeytower34');

  await page.goto('/cases');
  await page.getByRole('button', { name: 'Dossier openen' }).click();
  const openSheet = page.getByRole('dialog', { name: 'Dossier openen' });
  await openSheet.getByLabel('Naam', { exact: true }).fill(caseName);
  await openSheet.getByRole('button', { name: 'Openen', exact: true }).click();
  await page.waitForURL('**/c/**');
  const caseUrl = new URL(page.url()).pathname;

  const makeButton = page.getByRole('button', {
    name: 'Voeg een nieuw artikel toe aan dit dossier',
  });
  const addBox = page.getByLabel('Voeg iets toe aan dit dossier…');
  await expect(makeButton).toBeVisible();

  // Desktop: the halved box and the button stand on one line. On a phone the
  // button drops below it, which is the point of `.row-wrap` and not a fault.
  if (testInfo.project.name === 'desktop') {
    const box = await addBox.boundingBox();
    const button = await makeButton.boundingBox();
    expect(box).not.toBeNull();
    expect(button).not.toBeNull();
    expect(Math.abs(box!.y - button!.y)).toBeLessThan(box!.height);
  }

  // It opens the same sheet the "aanmaken" suggestion opens…
  await makeButton.click();
  const entrySheet = page.getByRole('dialog', { name: 'Nieuw artikel' });
  await expect(entrySheet).toBeVisible();
  await entrySheet.getByLabel('Naam', { exact: true }).fill(entryName);
  await entrySheet.getByRole('button', { name: 'Aanmaken' }).click();

  // …and, with no `onCreated` to keep it here, it lands on the new artikel —
  // with `?new=1`, which is the one road that still opens the editing face
  // (rule 18). There the name is the title box, not a heading, so that is what
  // this asserts: specific enough not to match the artikel's @-handle, which
  // the page also prints in a hidden <code>.
  await page.waitForURL('**/e/**');
  await expect(page.locator('#entry-name')).toHaveValue(entryName);

  // The filing happened on the server, so it is already true when you go back.
  await page.goto(caseUrl);
  await expect(page.getByRole('link', { name: new RegExp(entryName) }).first()).toBeVisible();

  // §22/§18b: a reader — a fresh speler with no onderzoeker to sign with — has
  // neither the box nor the button.
  const readerContext = await browser.newContext();
  const reader = await readerContext.newPage();
  await signUp(reader, `Lezer ${stamp}`, 'onderzeeboot');
  await reader.goto(caseUrl);
  await expect(reader.getByRole('heading', { name: caseName })).toBeVisible();
  await expect(reader.getByPlaceholder('Voeg iets toe aan dit dossier…')).toHaveCount(0);
  await expect(
    reader.getByRole('button', { name: 'Voeg een nieuw artikel toe aan dit dossier' }),
  ).toHaveCount(0);
  await readerContext.close();
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
