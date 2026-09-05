import { expect, test, type Page } from '@playwright/test';
import { inviteCode, signIn } from './helpers';

/**
 * §18: who you are being.
 *
 * A player ties a fiche on from the fiche itself, sees the archive start
 * calling them by that name, swaps back to themselves from the menu, and the
 * Keeper is the Keeper throughout.
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

async function newEntry(page: Page, name: string): Promise<string> {
  const sheet = page.getByRole('dialog', { name: 'Nieuwe fiche' });
  // The `n` shortcut needs the page hydrated; right after a navigation it may
  // not be yet, so press again until the sheet answers.
  for (let attempt = 0; attempt < 8 && !(await sheet.isVisible()); attempt++) {
    await page.keyboard.press('n');
    await page.waitForTimeout(400);
  }
  await sheet.getByLabel('Naam').fill(name);
  await sheet.getByRole('button', { name: 'Aanmaken' }).click();
  await page.waitForURL('**/e/**');
  return new URL(page.url()).pathname;
}

test('a player wears a fiche, the archive uses its name, and the menu swaps it back', async ({ page }, info) => {
  test.setTimeout(150_000);
  const stamp = `${info.project.name}-${Date.now().toString(36)}`;
  const account = `Speler ${stamp}`;
  const character = `Onderzoeker ${stamp}`;

  await signUpAs(page, account);
  await newEntry(page, character);
  await page.waitForTimeout(1000);

  // From the fiche: this is me.
  await page.getByRole('button', { name: 'Dit is mijn karakter' }).click();
  await expect(page.getByText(`Je speelt nu als ${character}.`)).toBeVisible();
  await expect(page.getByText('Jouw karakter')).toBeVisible();

  // The menu says so (desktop), and the feed calls the player by that name.
  const nav = page.getByRole('navigation', { name: 'Hoofdmenu' }).first();
  if (await nav.locator('.who').isVisible()) {
    await expect(nav.locator('.who')).toContainText(character);
  }
  await page.goto('/');
  const row = page.locator('.feed-item').filter({ hasText: character }).first();
  await expect(row.locator('strong').first()).toHaveText(character);
  await expect(row.locator('strong').first()).toHaveAttribute('title', account);

  // The Jij page lists it, and can take it off.
  await page.goto('/you');
  await expect(page.getByRole('heading', { name: 'Jouw karakters' })).toBeVisible();
  await expect(page.getByText('Dit ben je nu')).toBeVisible();
  await page.getByRole('button', { name: /^Als jezelf/ }).click();
  await page.waitForTimeout(800);
  await page.goto('/');
  const asSelf = page.locator('.feed-item').filter({ hasText: character }).first();
  await expect(asSelf.locator('strong').first()).toHaveText(account);

  // And back on, through the sheet in the menu (desktop only: on a phone the
  // wardrobe on the Jij page is the switch).
  if (await nav.locator('.who-button').isVisible()) {
    await nav.locator('.who-button').click();
    const sheet = page.getByRole('dialog', { name: 'Je speelt als' });
    await sheet.getByRole('radio', { name: new RegExp(character) }).click();
    await page.waitForTimeout(800);
    await expect(nav.locator('.who')).toContainText(character);
  }
});

test('a Keeper is always the Keeper', async ({ page }, info) => {
  const stamp = `${info.project.name}-${Date.now().toString(36)}`;
  await signIn(page, 'Keeper', 'abbeytower34');
  await page.goto('/you');
  await expect(page.getByText(/Als Keeper ben je overal de Keeper/)).toBeVisible();
  await page.goto('/');
  await newEntry(page, `Keepers fiche ${stamp}`);
  await expect(page.getByRole('button', { name: 'Op prikbord prikken' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Dit is mijn karakter' })).toHaveCount(0);
  const nav = page.getByRole('navigation', { name: 'Hoofdmenu' }).first();
  if (await nav.locator('.who').isVisible()) {
    await expect(nav.locator('.who')).toContainText('Keeper');
    await expect(nav.locator('.who-button')).toHaveCount(0);
  }
  // The API refuses too.
  const refused = await page.request.patch('/api/characters', { data: { active: null } });
  expect(refused.status()).toBe(400);
});
