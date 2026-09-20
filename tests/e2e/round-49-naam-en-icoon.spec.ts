import { expect, test } from '@playwright/test';
import { signIn } from './helpers';

/**
 * §88: de naam in de tab is de naam van het archief, en het icoontje ernaast
 * staat in Beheer.
 *
 * Wat deze zaak bewaakt is één zin met twee lezers (§17 regel 4): de mast in
 * het menu las `site_settings.name` al, de `<title>` stond er als letterlijke
 * tekst naast. Hernoemen veranderde dus de ene en niet de andere, en niets
 * brak — daarom een zaak en geen comment.
 *
 * Er wordt hier bewust **niet** gekeken of de browser het plaatje ook echt
 * tekent. Wat de app belooft is de `<link rel="icon">` met het juiste adres;
 * wat Chromium daarna in zijn tabbalk doet is van Chromium, en een zaak die
 * dat probeert te meten meet uiteindelijk de icooncache.
 */

async function picture(): Promise<Buffer> {
  const sharp = (await import('sharp')).default;
  return sharp({ create: { width: 64, height: 64, channels: 3, background: '#a8321e' } })
    .png()
    .toBuffer();
}

test.describe.configure({ mode: 'serial' });

test('de titel van de tab volgt de naam van het archief', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === 'phone', 'een tabtitel heeft geen breedte');

  await signIn(page, 'Keeper', 'abbeytower34');

  // Waar het archief mee begint — dezelfde naam die `lib/db/seed.mjs` zet en
  // die migratie 0031 voor een bestaand archief van ronde 1 neerlegt.
  await page.goto('/');
  await expect(page).toHaveTitle('LoW: Land over Water Archief');

  await page.goto('/admin');
  await page.getByRole('tab', { name: 'Site' }).click();
  await page.getByLabel('Naam van het archief').fill('Het Grijze Archief');
  await page.getByRole('button', { name: 'Opslaan' }).click();
  await expect(page.locator('.masthead-name')).toHaveText('Het Grijze Archief');

  // De mast en de tab lezen dezelfde rij. Vóór §88 zei de eerste 'Het Grijze
  // Archief' en de tweede nog steeds de naam van ronde 1.
  await page.goto('/');
  await expect(page).toHaveTitle('Het Grijze Archief');

  // En terug, zodat de volgende zaak in dit bestand een archief aantreft dat
  // heet zoals het heette.
  await page.goto('/admin?tab=site');
  await page.getByLabel('Naam van het archief').fill('LoW: Land over Water Archief');
  await page.getByRole('button', { name: 'Opslaan' }).click();
  await expect(page.locator('.masthead-name')).toHaveText('LoW: Land over Water Archief');
});

test('een icoontje uit Beheer komt in de kop van elke pagina', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === 'phone', 'de kop van een pagina heeft geen breedte');

  await signIn(page, 'Keeper', 'abbeytower34');
  await page.goto('/admin');
  await page.getByRole('tab', { name: 'Site' }).click();

  const block = page.getByTestId('site-favicon');
  await expect(block).toContainText('Nog geen');

  await block
    .locator('input[type="file"]')
    .setInputFiles({ name: 'icoon.png', mimeType: 'image/png', buffer: await picture() });

  // Het voorbeeldje verschijnt zodra de upload klaar is; de server action die
  // eronder hangt is wat de volgende paginalading laat zien.
  const beeld = page.getByTestId('site-favicon-beeld');
  await expect(beeld).toBeVisible({ timeout: 15_000 });
  const src = await beeld.getAttribute('src');
  const assetId = /assets\/([^?]+)/.exec(src ?? '')?.[1];
  expect(assetId).toBeTruthy();

  await page.goto('/');
  const icon = page.locator(`link[rel="icon"]`);
  await expect(icon).toHaveAttribute('href', new RegExp(assetId!));

  // Weghalen zet de tab terug op het logo, of op niets als er geen logo is.
  await page.goto('/admin?tab=site');
  await page.getByTestId('site-favicon').getByRole('button', { name: 'Verwijderen' }).click();
  await expect(page.getByTestId('site-favicon-beeld')).toHaveCount(0);
  await page.goto('/');
  await expect(page.locator(`link[rel="icon"][href*="${assetId}"]`)).toHaveCount(0);
});
