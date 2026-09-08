import { expect, test } from '@playwright/test';
import { signIn } from './helpers';

/**
 * Beheer → Site → "Uploadlimiet testen" (5 Sep 2026). Here nothing sits in
 * front of the server, so every step passes and the pane says so. Since the
 * ceilings came down to 2 MB and 20 MB the probe's own steps (1.5, 3, 21 MB)
 * are small enough for a browser harness to carry, so this test climbs the
 * real ones — but request bodies of tens of megabytes are still relayed as
 * strings, which is why it runs without a trace.
 */
test.use({ trace: 'off' });

test('the upload probe climbs its steps when no web server is in the way', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === 'phone', 'one viewport is enough for a probe');
  test.setTimeout(120_000);
  await signIn(page, 'Keeper', 'abbeytower34');
  // No `?probe=`: the default steps are the ones the pane really climbs.
  await page.goto('/admin?tab=site');
  await page.getByRole('button', { name: 'Uploadlimiet testen' }).click();
  await expect(page.getByText(/laat minstens 21 MB door/)).toBeVisible({ timeout: 90_000 });
  // Past the Keeper's 20 MB, the pane names both ceilings rather than stopping
  // at a bare number.
  await expect(page.getByText(/genoeg voor spelers \(2 MB\) en de Keeper \(20 MB\)/)).toBeVisible();

  // The endpoint counts what arrives, and is the Keeper's alone.
  const counted = await page.request.post('/api/health/upload', { data: Buffer.alloc(3 * 1024 * 1024) });
  expect(((await counted.json()) as { bytes: number }).bytes).toBe(3 * 1024 * 1024);
});

test('a player may not use the probe', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === 'phone', 'one viewport is enough for a probe');
  await page.goto('/signup');
  const { inviteCode } = await import('./helpers');
  await page.getByLabel('Uitnodigingscode').fill(inviteCode());
  await page.getByLabel('Naam', { exact: true }).fill(`Peiler ${Date.now().toString(36)}`);
  await page.getByLabel('Wachtwoord', { exact: true }).fill('onderzeeboot');
  await page.getByLabel('Wachtwoord nogmaals').fill('onderzeeboot');
  await page.getByRole('button', { name: 'Account aanmaken' }).click();
  await page.waitForURL('**/');
  const refused = await page.request.post('/api/health/upload', { data: Buffer.alloc(1024) });
  expect(refused.status()).toBe(403);
});
