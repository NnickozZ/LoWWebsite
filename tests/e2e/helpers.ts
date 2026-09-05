import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { Page } from '@playwright/test';

const root = resolve(__dirname, '../..');

export function inviteCode(): string {
  return readFileSync(join(root, 'data-e2e', 'invite.txt'), 'utf8').trim();
}

/**
 * The "+" is a FAB on phones and a sidebar button on desktop; click whichever
 * is on screen. Some pages (the wiki) carry a second one of their own, so the
 * first visible one is the answer.
 */
export function newEntryButton(page: Page) {
  return page.getByRole('button', { name: 'Nieuw artikel' }).locator('visible=true').first();
}

export async function signIn(page: Page, username: string, password: string) {
  await page.goto('/login');
  await page.getByLabel('Naam').fill(username);
  await page.getByLabel('Wachtwoord').fill(password);
  await page.getByRole('button', { name: 'Inloggen' }).click();
  await page.waitForURL('**/');
}

export async function signUp(page: Page, username: string, password: string) {
  await page.goto('/signup');
  await page.getByLabel('Uitnodigingscode').fill(inviteCode());
  await page.getByLabel('Naam').fill(username);
  await page.getByLabel('Wachtwoord', { exact: true }).fill(password);
  await page.getByLabel('Wachtwoord nogmaals').fill(password);
  await page.getByRole('button', { name: 'Account aanmaken' }).click();
  await page.waitForURL('**/');
}

/**
 * §22: an artikel opens on the face this person asked for, and a freshly
 * signed-up player's face is reading. A test that means to type into the page
 * has to ask for the editing one first, exactly as a person would — the toggle
 * at the top of the header. Already editing (a Keeper, or a page reached with
 * `?new=1`), this does nothing.
 */
export async function editArticle(page: Page) {
  const toggle = page.locator('.entry-mode-toggle');
  await toggle.waitFor({ state: 'visible', timeout: 15_000 });
  if ((await toggle.innerText()).trim() === 'Bewerken') {
    await toggle.click();
    // The inputs replace the prose on the next render; give React the frame.
    await page.locator('#entry-name').waitFor({ state: 'visible', timeout: 10_000 });
  }
}

/**
 * §22: the image tools live behind one "Afbeelding" button now. Opens that
 * menu and picks one of them. With no picture yet there is no menu — the one
 * thing to do is a button of its own — so this is only for an artikel that
 * already has a cover.
 */
export async function imageMenu(page: Page, item: RegExp | string) {
  await page.locator('.cover-menu-button').click();
  await page.getByRole('menuitem', { name: item }).click();
}
