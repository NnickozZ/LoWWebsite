import { expect, test } from '@playwright/test';
import { signIn } from './helpers';

/**
 * Beheer → Site → "Uploadlimiet testen" (5 Sep 2026). Here nothing sits in
 * front of the server, so every step passes and the pane says so. Request
 * bodies of tens of megabytes are relayed to the harness as strings, so this
 * file runs without a trace and with smaller steps than the real thing.
 */
test.use({ trace: 'off' });

test('the upload probe climbs its steps when no web server is in the way', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === 'phone', 'one viewport is enough for a probe');
  test.setTimeout(120_000);
  await signIn(page, 'Keeper', 'abbeytower34');
  // Smaller steps than the real 101 MB: the browser harness relays request
  // bodies as strings and cannot carry one that size.
  await page.goto('/admin?tab=site&probe=1.5,11,21');
  await page.getByRole('button', { name: 'Uploadlimiet testen' }).click();
  await expect(page.getByText(/laat minstens 21 MB door/)).toBeVisible({ timeout: 90_000 });

  // The endpoint counts what arrives, and is the Keeper's alone.
  const counted = await page.request.post('/api/health/upload', { data: Buffer.alloc(3 * 1024 * 1024) });
  expect(((await counted.json()) as { bytes: number }).bytes).toBe(3 * 1024 * 1024);
});

test('a player may not use the probe', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === 'phone', 'one viewport is enough for a probe');
  await page.goto('/signup');
  const { inviteCode } = await import('./helpers');
  await page.getByLabel('Uitnodigingscode').fill(inviteCode());
  await page.getByLabel('Naam').fill(`Peiler ${Date.now().toString(36)}`);
  await page.getByLabel('Wachtwoord', { exact: true }).fill('onderzeeboot');
  await page.getByLabel('Wachtwoord nogmaals').fill('onderzeeboot');
  await page.getByRole('button', { name: 'Account aanmaken' }).click();
  await page.waitForURL('**/');
  const refused = await page.request.post('/api/health/upload', { data: Buffer.alloc(1024) });
  expect(refused.status()).toBe(403);
});
