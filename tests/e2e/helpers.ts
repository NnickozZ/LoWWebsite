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
