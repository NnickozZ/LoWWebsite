import { expect, test, type Page } from '@playwright/test';
import { inviteCode, signIn } from './helpers';

/**
 * §17: who may look, and who may touch.
 *
 * Every assertion here is made from the *other* side — the person who was not
 * chosen — because a right that is enforced on the owner's screen and nowhere
 * else is decoration. Lists, search, the direct URL, and the API all have to
 * agree.
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

/** The entry page folds its rights behind a <summary>, not a button. */
async function openRights(page: Page) {
  await page.locator('summary', { hasText: /^\s*Rechten/ }).click();
}

async function newEntry(page: Page, name: string): Promise<string> {
  await page.keyboard.press('n');
  const sheet = page.getByRole('dialog', { name: 'Nieuwe fiche' });
  await sheet.getByLabel('Naam').fill(name);
  await sheet.getByRole('button', { name: 'Aanmaken' }).click();
  await page.waitForURL('**/e/**');
  return new URL(page.url()).pathname;
}

test('a private fiche is nobody else\'s, and a Keeper sees it anyway', async ({ page, browser }, info) => {
  test.setTimeout(150_000);
  const stamp = `${info.project.name}-${Date.now().toString(36)}`;
  const ownerName = `Eigenaar ${stamp}`;
  const entryName = `Geheim dagboek ${stamp}`;

  // The owner: a player, not a Keeper.
  await signUpAs(page, ownerName);
  const path = await newEntry(page, entryName);
  await page.waitForTimeout(1200);

  // Rechten → Wie mag kijken → Privé.
  await openRights(page);
  await page.getByRole('radiogroup', { name: 'Wie mag kijken' }).getByRole('radio', { name: 'Privé' }).click();
  await page.waitForTimeout(600);

  // Someone else: not in the wiki, not in search, not at the URL.
  const otherCtx = await browser.newContext();
  const other = await otherCtx.newPage();
  await signUpAs(other, `Ander ${stamp}`);
  await other.goto('/wiki');
  await expect(other.getByText(entryName)).toHaveCount(0);
  await other.goto('/search');
  await other.getByLabel('Zoeken in het archief').fill(entryName);
  await other.waitForTimeout(600);
  await expect(other.getByRole('link', { name: new RegExp(entryName) })).toHaveCount(0);
  const direct = await other.goto(path);
  expect(direct?.status()).toBe(404);
  await otherCtx.close();

  // A Keeper sees everything, always.
  const keeperCtx = await browser.newContext();
  const keeper = await keeperCtx.newPage();
  await signIn(keeper, 'Keeper', 'abbeytower34');
  await keeper.goto(path);
  await expect(keeper.getByLabel('Naam')).toHaveValue(entryName);
  await keeperCtx.close();
});

test('someone who may look but not touch sends a proposal, and the owner judges it', async ({
  page,
  browser,
}, info) => {
  test.setTimeout(150_000);
  const stamp = `${info.project.name}-${Date.now().toString(36)}`;
  const entryName = `Logboek ${stamp}`;

  await signUpAs(page, `Eigenaar ${stamp}`);
  const path = await newEntry(page, entryName);
  await page.waitForTimeout(1000);

  // Everyone may look; only the owner may edit.
  await openRights(page);
  await page.getByRole('radiogroup', { name: 'Wie mag bewerken' }).getByRole('radio', { name: 'Privé' }).click();
  await page.waitForTimeout(600);

  const otherCtx = await browser.newContext();
  const other = await otherCtx.newPage();
  await signUpAs(other, `Lezer ${stamp}`);
  await other.goto(path);
  await expect(other.getByText(/Je kunt deze fiche lezen/)).toBeVisible();
  await other.getByLabel('Korte beschrijving').fill('Voorstel van een lezer');
  await other.getByLabel('Korte beschrijving').blur();
  await expect(other.getByText('Als voorstel naar de eigenaar gestuurd.')).toBeVisible();
  await otherCtx.close();

  // Nothing landed on the fiche itself…
  await page.reload();
  await expect(page.getByLabel('Korte beschrijving')).toHaveValue('');
  // …but the owner has it waiting, and takes it.
  await expect(page.locator('summary', { hasText: 'Voorstellen (1)' })).toBeVisible();
  await expect(page.getByText('Voorstel van een lezer')).toBeVisible();
  await page.getByRole('button', { name: 'Overnemen' }).click();
  await page.waitForTimeout(1500);
  await expect(page.getByLabel('Korte beschrijving')).toHaveValue('Voorstel van een lezer');
});

test('a private board is created private, and a chosen person may look but not pin', async ({
  page,
  browser,
}, info) => {
  test.setTimeout(150_000);
  const stamp = `${info.project.name}-${Date.now().toString(36)}`;

  await signUpAs(page, `Eigenaar ${stamp}`);
  await page.goto('/boards');
  await page.getByRole('button', { name: /Privé prikbord/ }).click();
  await page.waitForURL('**/b/**');
  const boardUrl = page.url();
  await page.getByLabel('Naam van het prikbord').fill(`Muur ${stamp}`);
  await page.getByLabel('Naam van het prikbord').blur();

  // A stranger: not listed, not at the URL, refused by the API.
  const strangerCtx = await browser.newContext();
  const stranger = await strangerCtx.newPage();
  const strangerName = `Vreemde ${stamp}`;
  await signUpAs(stranger, strangerName);
  await stranger.goto('/boards');
  await expect(stranger.getByText(`Muur ${stamp}`)).toHaveCount(0);
  const direct = await stranger.goto(boardUrl);
  expect(direct?.status()).toBe(404);

  // The owner opens the view dial to chosen people and picks the stranger.
  await page.getByRole('button', { name: 'Rechten' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('radiogroup', { name: 'Wie mag kijken' }).getByRole('radio', { name: 'Gekozen personen' }).click();
  await dialog.getByRole('checkbox', { name: new RegExp(strangerName) }).click();
  await page.waitForTimeout(600);

  // Now they may look — read-only, with the tools gone — but the API still says no.
  await stranger.goto(boardUrl);
  await expect(stranger.getByText('Alleen kijken')).toBeVisible();
  await expect(stranger.getByRole('button', { name: 'Nieuwe notitie' })).toHaveCount(0);
  const boardId = boardUrl.split('/b/')[1];
  const refused = await stranger.request.post(`/api/boards/${boardId}`, {
    data: { cards: [], strings: [], deletedCardIds: [], deletedStringIds: [] },
  });
  expect(refused.status()).toBe(403);
  await strangerCtx.close();
});

test('the Keeper bolts the dials and the owner can no longer turn them', async ({ page, browser }, info) => {
  test.setTimeout(150_000);
  const stamp = `${info.project.name}-${Date.now().toString(36)}`;
  const entryName = `Kampregels ${stamp}`;

  await signUpAs(page, `Eigenaar ${stamp}`);
  const path = await newEntry(page, entryName);
  await page.waitForTimeout(1000);

  const keeperCtx = await browser.newContext();
  const keeper = await keeperCtx.newPage();
  await signIn(keeper, 'Keeper', 'abbeytower34');
  await keeper.goto(path);
  await openRights(keeper);
  await keeper.getByRole('button', { name: 'Rechten vastzetten' }).click();
  await expect(keeper.getByRole('button', { name: /Vastgezet/ })).toBeVisible();
  await keeperCtx.close();

  await page.reload();
  await openRights(page);
  await expect(page.getByText(/De Keeper heeft de rechten/)).toBeVisible();
  await expect(
    page.getByRole('radiogroup', { name: 'Wie mag kijken' }).getByRole('radio', { name: 'Privé' }),
  ).toBeDisabled();
});
