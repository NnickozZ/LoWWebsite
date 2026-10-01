import { expect, test } from '@playwright/test';
import { signIn } from './helpers';

const KEEPER = ['Keeper', 'abbeytower34'] as const;

/**
 * Golf O, tweede pas (Nick, 1 oktober): *Wiki geschiedenis* als tab in de
 * wiki, de zijbalk die in- en uitklapt, en *Verbindingen* als rond knopje.
 */

test('Wiki geschiedenis: een tab van de wiki, met wat er net geschreven is bovenaan', async ({ page }, info) => {
  await signIn(page, ...KEEPER);
  const name = `Vondst ${info.project.name}-${Date.now().toString(36)}`;
  const made = await page.request.post('/api/entries', { data: { name, typeSlug: 'clue' } });
  expect(made.ok()).toBe(true);

  await page.goto('/wiki');
  await page.getByTestId('tab-geschiedenis').click();
  await page.waitForURL('**/wiki/geschiedenis');
  await expect(page.getByTestId('tab-geschiedenis')).toHaveAttribute('aria-current', 'page');
  const feed = page.getByTestId('wiki-geschiedenis');
  await expect(feed.locator('.geschiedenis-dag-kop').first()).toHaveText('Vandaag');
  const row = feed.locator('a.geschiedenis-rij', { hasText: name }).first();
  await expect(row).toBeVisible();
  await expect(row.locator('strong').first()).toHaveText('Keeper');
  await expect(row.locator('time')).toHaveText(/^\d\d:\d\d$/);
  await row.click();
  await page.waitForURL('**/e/**');
});

test('de zijbalk klapt in en uit, en blijft zoals je hem achterliet', async ({ page }, info) => {
  test.skip(info.project.name === 'phone', 'een telefoon heeft geen zijbalk');
  await signIn(page, ...KEEPER);
  await page.goto('/wiki');
  const nav = page.getByRole('navigation', { name: 'Hoofdmenu' });
  await expect(nav).toBeVisible();
  const before = (await page.locator('main#main').boundingBox())!;

  await page.getByRole('button', { name: 'Menu inklappen' }).click();
  await expect(nav).toBeHidden();
  const open = page.getByRole('button', { name: 'Menu uitklappen' });
  await expect(open).toBeVisible();
  await expect(open).toBeFocused();
  const after = (await page.locator('main#main').boundingBox())!;
  expect(after.width).toBeGreaterThan(before.width + 100);

  // Een verversing kent de keuze al op de server: geen zijbalk die even staat.
  await page.reload();
  await expect(page.locator('.shell')).toHaveAttribute('data-zijbalk', 'dicht');
  await expect(nav).toBeHidden();

  await open.click();
  await expect(nav).toBeVisible();
  await page.reload();
  await expect(nav).toBeVisible();
});

test('Verbindingen naast de naam is een rond knopje van 44 px', async ({ page }) => {
  await signIn(page, ...KEEPER);
  await page.goto('/e/pier-boone');
  const link = page.locator('.entry-titel-rij').getByTestId('connections-link');
  await expect(link).toBeVisible();
  const box = (await link.boundingBox())!;
  expect(Math.round(box.height)).toBeGreaterThanOrEqual(44);
  const radius = await link.evaluate((el) => getComputedStyle(el, '::before').borderRadius);
  expect(radius).toBe('50%');
});
