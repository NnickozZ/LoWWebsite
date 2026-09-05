import { expect, test } from '@playwright/test';
import { inviteCode, signIn } from './helpers';

/**
 * Golden flow 5 (§15), both halves:
 *   a Keeper reveals a player's password in admin and the audit log shows it;
 *   a Keeper reveals a hidden section on an entry and the player sees it on
 *   refresh — done from the phone viewport, which is where it happens at the
 *   table.
 */
test('recovery: an audited password reveal, and a section revealed to a player', async ({
  page,
  browser,
}, testInfo) => {
  const stamp = `${testInfo.project.name}-${Date.now().toString(36)}`;
  const playerName = `Speler ${stamp}`;
  const entryName = `De Kelder ${stamp}`;

  // -- a player signs up -----------------------------------------------------
  const playerContext = await browser.newContext();
  const player = await playerContext.newPage();
  await player.goto('/signup');
  await player.getByLabel('Uitnodigingscode').fill(inviteCode());
  await player.getByLabel('Naam').fill(playerName);
  await player.getByLabel('Wachtwoord', { exact: true }).fill('duikerklok');
  await player.getByLabel('Wachtwoord nogmaals').fill('duikerklok');
  await player.getByRole('button', { name: 'Account aanmaken' }).click();
  await player.waitForURL('**/');

  // -- the Keeper reveals that password, and the log records it --------------
  await signIn(page, 'Keeper', 'abbeytower34');
  await page.goto('/admin');
  const row = page.locator('li', { hasText: playerName }).first();
  await row.getByRole('button', { name: 'Wachtwoord tonen' }).click();
  await expect(page.getByText('duikerklok')).toBeVisible();

  // The log was rendered before the reveal happened, so ask for it again.
  await page.reload();
  await page.getByRole('tab', { name: 'Logboek' }).click();
  await expect(
    page.locator('li', { hasText: 'wachtwoord getoond' }).filter({ hasText: playerName }).first(),
  ).toBeVisible();

  // -- an entry with a section the player may not see -----------------------
  await page.goto('/wiki/location');
  await page.getByRole('button', { name: 'Nieuw', exact: true }).click();
  const sheet = page.getByRole('dialog', { name: 'Nieuw artikel' });
  await sheet.getByLabel('Naam').fill(entryName);
  await sheet.getByRole('button', { name: 'Aanmaken' }).click();
  await page.waitForURL('**/e/**');
  const entryUrl = new URL(page.url()).pathname;

  await page.locator('summary', { hasText: 'Zichtbaarheid en onthullingen' }).click();
  await page.getByRole('button', { name: 'Sectie toevoegen' }).click();
  const title = page.getByLabel('Titel van de sectie');
  await expect(title).toBeVisible();
  await title.fill('Wat er echt in de kelder ligt');
  await title.blur();
  await page.locator('.entry-section-editing .ProseMirror').first().click();
  await page.keyboard.type('Een gietijzeren luik, en eronder zout water.');
  await page.waitForTimeout(600);

  // -- the player cannot see it -------------------------------------------
  await player.goto(entryUrl);
  await expect(player.getByLabel('Naam')).toHaveValue(entryName);
  await expect(player.getByText('Wat er echt in de kelder ligt')).toHaveCount(0);
  await expect(player.getByText('gietijzeren luik')).toHaveCount(0);

  // -- the Keeper flips it on for that player, from a phone -----------------
  const phone = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const keeperPhone = await phone.newPage();
  await signIn(keeperPhone, 'Keeper', 'abbeytower34');
  await keeperPhone.goto(entryUrl);
  await keeperPhone
    .locator('.entry-section-editing')
    .getByRole('button', { name: 'Gekozen spelers' })
    .click();
  await keeperPhone
    .locator('.entry-section-editing')
    .getByRole('switch', { name: playerName })
    .click();
  await keeperPhone.waitForTimeout(600);

  // -- and the player sees it on refresh -----------------------------------
  await player.reload();
  // As a heading in the text — the outline beside it names it too.
  await expect(player.getByRole('heading', { name: 'Wat er echt in de kelder ligt' })).toBeVisible();
  await expect(player.getByText('gietijzeren luik')).toBeVisible();

  // Still nobody else's business: a second player sees nothing.
  const outsiderContext = await browser.newContext();
  const outsider = await outsiderContext.newPage();
  await outsider.goto('/signup');
  await outsider.getByLabel('Uitnodigingscode').fill(inviteCode());
  await outsider.getByLabel('Naam').fill(`Buitenstaander ${stamp}`);
  await outsider.getByLabel('Wachtwoord', { exact: true }).fill('onderzeeboot');
  await outsider.getByLabel('Wachtwoord nogmaals').fill('onderzeeboot');
  await outsider.getByRole('button', { name: 'Account aanmaken' }).click();
  await outsider.waitForURL('**/');
  await outsider.goto(entryUrl);
  await expect(outsider.getByText('Wat er echt in de kelder ligt')).toHaveCount(0);
  // Not in the HTML either — a hidden section is not merely display:none.
  expect(await outsider.content()).not.toContain('gietijzeren luik');

  await outsiderContext.close();
  await phone.close();
  await playerContext.close();
});
