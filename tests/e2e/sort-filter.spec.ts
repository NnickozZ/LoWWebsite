import { expect, test, type Page } from '@playwright/test';
import { inviteCode, signIn } from './helpers';

/**
 * §14: the sort-and-filter bar, on the three shelves that got it. The bar
 * writes the URL and the page reads it back, so every check here reloads the
 * URL the bar produced and expects the same list.
 */

async function signUpAs(page: Page, name: string) {
  await page.goto('/signup');
  await page.getByLabel('Uitnodigingscode').fill(inviteCode());
  await page.getByLabel('Naam').fill(name);
  await page.getByLabel('Wachtwoord', { exact: true }).fill('onderzeeboot');
  await page.getByLabel('Wachtwoord nogmaals').fill('onderzeeboot');
  await page.getByRole('button', { name: 'Account aanmaken' }).click();
  await page.waitForURL('**/');
}

test('dossiers: filter on status, sort by name, clear', async ({ page }, info) => {
  test.setTimeout(120_000);
  const stamp = `${info.project.name}-${Date.now().toString(36)}`;
  await signIn(page, 'Keeper', 'abbeytower34');

  const make = async (name: string) => {
    const response = await page.request.post('/api/cases', { data: { name } });
    return ((await response.json()) as { case: { id: string } }).case.id;
  };
  const open = await make(`Alpha open ${stamp}`);
  const closed = await make(`Beta gesloten ${stamp}`);
  void open;
  await page.request.patch(`/api/cases/${closed}`, { data: { status: 'closed' } });

  await page.goto('/cases');
  await expect(page.locator('.card', { hasText: `Alpha open ${stamp}` })).toBeVisible();
  await expect(page.locator('.card', { hasText: `Beta gesloten ${stamp}` })).toBeVisible();

  // Only the closed ones.
  await page.getByRole('group', { name: 'Status' }).getByRole('button', { name: 'Gesloten' }).click();
  await expect(page).toHaveURL(/status=closed/);
  await expect(page.locator('.card', { hasText: `Beta gesloten ${stamp}` })).toBeVisible();
  await expect(page.locator('.card', { hasText: `Alpha open ${stamp}` })).toHaveCount(0);

  // Add open too: both, and the chips read as pressed.
  await page.getByRole('group', { name: 'Status' }).getByRole('button', { name: 'Open' }).click();
  await expect(page).toHaveURL(/status=closed(%2C|,)open/);
  await expect(page.locator('.card', { hasText: `Alpha open ${stamp}` })).toBeVisible();
  await expect(page.getByRole('group', { name: 'Status' }).getByRole('button', { name: 'Open' })).toHaveAttribute('aria-pressed', 'true');

  // The URL is the state: a reload shows the same.
  await page.reload();
  await expect(page.getByRole('group', { name: 'Status' }).getByRole('button', { name: 'Gesloten' })).toHaveAttribute('aria-pressed', 'true');

  // Sort by name puts Alpha before Beta regardless of status.
  await page.getByLabel('Sorteren').selectOption('name');
  await expect(page).toHaveURL(/sort=name/);
  const cards = page.locator('.card').filter({ hasText: stamp });
  await expect(cards.first()).toContainText('Alpha open');

  // Clear the filters; the sort stays.
  await page.getByRole('button', { name: 'Wis filters' }).click();
  await expect(page).not.toHaveURL(/status=/);
  await expect(page).toHaveURL(/sort=name/);
});

test('wiki: "van mij" is the account, and a player sees only what they may', async ({ page, browser }, info) => {
  test.setTimeout(120_000);
  const stamp = `${info.project.name}-${Date.now().toString(36)}`;

  const otherCtx = await browser.newContext();
  const other = await otherCtx.newPage();
  await signUpAs(other, `Schrijver ${stamp}`);
  await other.keyboard.press('n');
  const sheet = other.getByRole('dialog', { name: 'Nieuwe fiche' });
  await sheet.getByLabel('Naam').fill(`Van de speler ${stamp}`);
  await sheet.getByRole('button', { name: 'Aanmaken' }).click();
  await other.waitForURL('**/e/**');

  await signIn(page, 'Keeper', 'abbeytower34');
  await page.keyboard.press('n');
  const mine = page.getByRole('dialog', { name: 'Nieuwe fiche' });
  await mine.getByLabel('Naam').fill(`Van de Keeper ${stamp}`);
  await mine.getByRole('button', { name: 'Aanmaken' }).click();
  await page.waitForURL('**/e/**');

  await page.goto('/wiki');
  await expect(page.locator('.card', { hasText: `Van de speler ${stamp}` })).toBeVisible();
  await page.getByRole('group', { name: 'Alleen' }).getByRole('button', { name: 'Van mij' }).click();
  await expect(page).toHaveURL(/show=mine/);
  await expect(page.locator('.card', { hasText: `Van de Keeper ${stamp}` })).toBeVisible();
  await expect(page.locator('.card', { hasText: `Van de speler ${stamp}` })).toHaveCount(0);

  // The Keeper's secrecy filter exists for the Keeper…
  await expect(page.getByRole('group', { name: 'Geheimhouding' })).toBeVisible();
  // …and not for a player, who also cannot smuggle it in through the URL.
  await other.goto('/wiki?visibility=keeper');
  await expect(other.getByRole('group', { name: 'Geheimhouding' })).toHaveCount(0);
  await expect(other.locator('.card', { hasText: `Van de speler ${stamp}` })).toBeVisible();
  await otherCtx.close();
});

test('prikborden: loose or filed', async ({ page }, info) => {
  test.setTimeout(120_000);
  const stamp = `${info.project.name}-${Date.now().toString(36)}`;
  await signIn(page, 'Keeper', 'abbeytower34');

  const caseResponse = await page.request.post('/api/cases', { data: { name: `Zaak ${stamp}` } });
  const caseId = ((await caseResponse.json()) as { case: { id: string } }).case.id;
  await page.request.post('/api/boards', { data: { name: `Zaakbord ${stamp}`, caseId } });
  await page.request.post('/api/boards', { data: { name: `Losbord ${stamp}` } });

  await page.goto('/boards');
  await expect(page.getByText(`Zaakbord ${stamp}`)).toBeVisible();
  await expect(page.getByText(`Losbord ${stamp}`)).toBeVisible();

  await page.getByRole('group', { name: 'Waar' }).getByRole('button', { name: 'Los' }).click();
  await expect(page).toHaveURL(/where=loose/);
  await expect(page.getByText(`Losbord ${stamp}`)).toBeVisible();
  await expect(page.getByText(`Zaakbord ${stamp}`)).toHaveCount(0);

  await page.getByRole('group', { name: 'Waar' }).getByRole('button', { name: 'Bij een dossier' }).click();
  await expect(page).toHaveURL(/where=case/);
  await expect(page.getByText(`Zaakbord ${stamp}`)).toBeVisible();
  await expect(page.getByText(`Losbord ${stamp}`)).toHaveCount(0);
});
