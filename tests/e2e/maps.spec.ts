import { expect, test, type Page } from '@playwright/test';
import { inviteCode, signIn } from './helpers';

/**
 * §19: maps.
 *
 * The Keeper hangs a map; a note and a fiche are pinned on it; the legend
 * switches a kind off and remembers that; someone else's pin cannot be pulled
 * by a player; and the fiche knows where it is.
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

async function picture(): Promise<Buffer> {
  const sharp = (await import('sharp')).default;
  return sharp({ create: { width: 900, height: 600, channels: 3, background: '#d9d2b8' } })
    .png()
    .toBuffer();
}

/** On a phone the legend hides behind a button; on a desktop it floats on the map. */
async function openLegend(page: Page) {
  const toggle = page.getByRole('button', { name: 'Legenda' });
  if ((await toggle.isVisible()) && (await toggle.getAttribute('aria-expanded')) !== 'true') await toggle.click();
  return page.locator('.map-legend');
}

async function placeAt(page: Page, fx: number, fy: number) {
  const stage = page.getByRole('application');
  const box = await stage.boundingBox();
  if (!box) throw new Error('no stage');
  await page.mouse.click(box.x + box.width * fx, box.y + box.height * fy);
}

test('the Keeper hangs a map, pins go on it, the legend remembers, and a player keeps their hands off', async ({
  page,
  browser,
}, info) => {
  test.setTimeout(180_000);
  const stamp = `${info.project.name}-${Date.now().toString(36)}`;
  const mapName = `Het eiland ${stamp}`;

  await signIn(page, 'Keeper', 'abbeytower34');
  await page.goto('/maps');
  await page.getByRole('button', { name: 'Landkaart ophangen' }).click();
  const sheet = page.getByRole('dialog', { name: 'Landkaart ophangen' });
  await sheet.getByLabel('Afbeelding').setInputFiles({ name: 'eiland.png', mimeType: 'image/png', buffer: await picture() });
  await sheet.getByLabel('Naam').fill(mapName);
  await sheet.getByRole('button', { name: 'Ophangen' }).click();
  await page.waitForURL('**/maps/**');
  const mapUrl = new URL(page.url()).pathname;
  await expect(page.getByRole('heading', { name: mapName })).toBeVisible();
  await expect(page.getByRole('application')).toBeVisible();
  await page.waitForTimeout(500);

  // A note, in the middle.
  await page.getByRole('button', { name: 'Speld zetten' }).click();
  await placeAt(page, 0.5, 0.5);
  const ask = page.getByRole('dialog', { name: 'Wat komt hier?' });
  await expect(ask).toBeVisible();
  await ask.getByRole('tab', { name: /notitie/ }).click();
  await ask.getByLabel('Naam').fill('Hier lag de boot');
  await ask.getByRole('button', { name: 'Speld zetten' }).click();
  await expect(page.locator('.map-pin', { hasText: 'Hier lag de boot' })).toBeVisible();
  // The new pin opens; close it.
  await page.keyboard.press('Escape');

  // A fiche, a bit to the right.
  await page.getByRole('button', { name: 'Speld zetten' }).click();
  await placeAt(page, 0.7, 0.4);
  await ask.getByPlaceholder('Zoek een fiche…').fill('Pier');
  await page.locator('.suggest-item').filter({ hasText: 'Pier Boone' }).first().click();
  await expect(page.locator('.map-pin', { hasText: 'Pier Boone' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('.map-pin')).toHaveCount(2);

  // The legend: one line per kind, and switching notes off hides the note.
  const legend = await openLegend(page);
  await expect(legend.getByText('Notities')).toBeVisible();
  await legend.getByRole('checkbox', { name: /Notities/ }).uncheck();
  await expect(page.locator('.map-pin')).toHaveCount(1);
  await page.reload();
  await expect(page.getByRole('application')).toBeVisible();
  await expect(page.locator('.map-pin')).toHaveCount(1);
  await (await openLegend(page)).getByRole('checkbox', { name: /Notities/ }).check();
  await expect(page.locator('.map-pin')).toHaveCount(2);

  // The fiche knows where it is.
  await page.locator('.map-pin', { hasText: 'Pier Boone' }).click();
  const pinSheet = page.getByRole('dialog', { name: 'Pier Boone' });
  await expect(pinSheet).toBeVisible();
  await pinSheet.getByRole('link', { name: 'Fiche openen' }).click();
  await page.waitForURL('**/e/**');
  await expect(page.getByRole('link', { name: mapName })).toBeVisible();

  // A player sees both pins but may not pull the Keeper's.
  const otherCtx = await browser.newContext();
  const other = await otherCtx.newPage();
  await signUpAs(other, `Kaartlezer ${stamp}`);
  await other.goto(mapUrl);
  await expect(other.locator('.map-pin')).toHaveCount(2);
  await other.locator('.map-pin', { hasText: 'Hier lag de boot' }).click();
  const theirs = other.getByRole('dialog', { name: 'Hier lag de boot' });
  await expect(theirs.getByText(/van iemand anders/)).toBeVisible();
  await expect(theirs.getByRole('button', { name: 'Speld weghalen' })).toHaveCount(0);
  const pinId = await other.locator('.map-pin', { hasText: 'Hier lag de boot' }).getAttribute('data-pin-id');
  const mapSlug = mapUrl.split('/maps/')[1];
  const list = await other.request.get('/api/maps');
  const maps = (await list.json()) as { maps: { id: string; slug: string }[] };
  const found = maps.maps.find((m) => m.slug === mapSlug);
  expect(found).toBeTruthy();
  const refused = await other.request.delete(`/api/maps/${found!.id}/pins/${pinId}`);
  expect(refused.ok()).toBe(false);
  // …but may set one of their own, and pull that.
  await other.keyboard.press('Escape');
  await other.getByRole('button', { name: 'Speld zetten' }).click();
  await placeAt(other, 0.3, 0.7);
  const ask2 = other.getByRole('dialog', { name: 'Wat komt hier?' });
  await ask2.getByRole('tab', { name: /notitie/ }).click();
  await ask2.getByLabel('Naam').fill('Mijn eigen speld');
  await ask2.getByRole('button', { name: 'Speld zetten' }).click();
  const own = other.getByRole('dialog', { name: 'Mijn eigen speld' });
  await expect(own).toBeVisible();
  await own.getByRole('button', { name: 'Speld weghalen' }).click();
  await other.getByRole('dialog', { name: /van de landkaart halen/ }).getByRole('button', { name: 'Speld weghalen' }).click();
  await expect(other.locator('.map-pin')).toHaveCount(2);
  await otherCtx.close();
});

test('a player cannot hang a map', async ({ page }, info) => {
  await signUpAs(page, `Geen keeper ${info.project.name}-${Date.now().toString(36)}`);
  await page.goto('/maps');
  await expect(page.getByRole('button', { name: 'Landkaart ophangen' })).toHaveCount(0);
  const refused = await page.request.post('/api/maps', {
    multipart: { name: 'x', file: { name: 'x.png', mimeType: 'image/png', buffer: await picture() } },
  });
  expect(refused.status()).toBe(403);
});
