import { expect, test, type Page } from '@playwright/test';
import { becomeInvestigator, editCanvas, readCanvas, signIn, signUp } from './helpers';

/**
 * Golf M, de landkaart. Nick: "Als speler kan ik geen spelden verschuiven, als
 * Keeper wel. … Andere spelers zien ineens twee spelden. … Spelers, ook de
 * onbevoegde, konden spelden zetten op een privé bewerkbare kaart." En:
 * "Dubbelklik op de kaart moet het speldenblad openen."
 *
 *   1. Een landkaart die Privé bewerkt wordt, is voor een speler om naar te
 *      kijken: geen *Speld zetten*, geen Bewerken, en de archiefweg zegt 403.
 *   2. Zet de Keeper Bewerken op Iedereen, dan verschuift de speler élke speld,
 *      ook die van de Keeper.
 *   3. Wat de speler vasthoudt, ziet de Keeper als een ring om die ene speld —
 *      niet als een tweede speld ernaast.
 *   4. Een dubbelklik op kale kaart opent het blad *Wat komt hier?*; in Lezen
 *      zegt hij in één melding waarom er niets gebeurt.
 */

const KEEPER = ['Keeper', 'abbeytower34'] as const;
const PASSWORD = 'wachtwoord-van-golf-m';

async function picture(): Promise<Buffer> {
  const sharp = (await import('sharp')).default;
  return sharp({ create: { width: 900, height: 600, channels: 3, background: '#d9d2b8' } })
    .png()
    .toBuffer();
}

/** A point on the picture, as a fraction of `.map-world` (§6: not of the stage). */
async function onPicture(page: Page, fx: number, fy: number) {
  const box = (await page.locator('.map-world').boundingBox())!;
  return { x: box.x + box.width * fx, y: box.y + box.height * fy };
}

async function pinsOf(page: Page, mapId: string) {
  const response = await page.request.get(`/api/maps/${mapId}/pins`);
  expect(response.ok()).toBe(true);
  return ((await response.json()) as { pins: { id: string; x: number; y: number }[] }).pins;
}

test('golf M: de Bewerken-knop van de landkaart beslist, andermans hand is een ring, en een dubbelklik vraagt een speld', async ({
  page,
  browser,
}, info) => {
  test.setTimeout(300_000);
  const isPhone = info.project.name === 'phone';
  const stamp = `${info.project.name}-${Date.now().toString(36)}`;

  // The Keeper hangs a landkaart (born Privé to edit) with one speld of his own.
  const keeperCtx = await browser.newContext({ ...info.project.use });
  const keeper = await keeperCtx.newPage();
  await signIn(keeper, ...KEEPER);
  const hung = await keeper.request.post('/api/maps', {
    multipart: { name: `Golf M kaart ${stamp}`, file: { name: 'k.png', mimeType: 'image/png', buffer: await picture() } },
  });
  expect(hung.ok()).toBe(true);
  const { map } = (await hung.json()) as { map: { id: string; slug: string } };
  const set = await keeper.request.post(`/api/maps/${map.id}/pins`, {
    data: { kind: 'note', name: `Keepers speld ${stamp}`, text: '', x: 0.5, y: 0.5 },
  });
  expect(set.ok()).toBe(true);
  const keeperPinId = ((await set.json()) as { pin: { id: string } }).pin.id;

  // 1. A speler with an onderzoeker looks, and only looks.
  await signUp(page, `Kaartspeler ${stamp}`, PASSWORD);
  await becomeInvestigator(page, `Kaartspeelster ${stamp}`);
  await page.goto(`/maps/${map.slug}`);
  await expect(page.locator('.map-pin')).toHaveCount(1, { timeout: 20_000 });
  await expect(page.getByRole('button', { name: 'Speld zetten' })).toHaveCount(0);
  await expect(page.getByTestId('canvas-mode')).toHaveCount(0);
  expect(
    (await page.request.post(`/api/maps/${map.id}/pins`, { data: { kind: 'note', name: 'Stiekem', x: 0.2, y: 0.2 } })).status(),
  ).toBe(403);
  expect((await page.request.patch(`/api/maps/${map.id}/pins/${keeperPinId}`, { data: { x: 0.1 } })).status()).toBe(403);
  expect((await page.request.delete(`/api/maps/${map.id}/pins/${keeperPinId}`)).status()).toBe(403);
  expect((await pinsOf(keeper, map.id)).find((p) => p.id === keeperPinId)?.x).toBe(0.5);

  // 2. The Keeper turns Bewerken up to Iedereen.
  const opened = await keeper.request.patch(`/api/access?target=map&id=${map.id}`, { data: { editMode: 'all' } });
  expect(opened.ok()).toBe(true);
  await keeper.goto(`/maps/${map.slug}`);
  await expect(keeper.locator('.map-pin')).toHaveCount(1, { timeout: 20_000 });

  await page.goto(`/maps/${map.slug}`);
  await editCanvas(page);
  await expect(page.getByRole('button', { name: 'Speld zetten' })).toBeVisible({ timeout: 20_000 });
  await page.getByRole('group', { name: 'Zoomen', exact: true }).getByRole('button', { name: 'Alles in beeld' }).click();
  await page.waitForTimeout(400);

  const head = page.locator(`.map-pin[data-pin-id="${keeperPinId}"] .map-pin-head`);
  if (!isPhone) {
    // The Keeper's own speld moves under the speler's hand, and stays moved.
    const from = (await head.boundingBox())!;
    const cx = from.x + from.width / 2;
    const cy = from.y + from.height / 2;
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.mouse.move(cx + 60, cy + 40, { steps: 8 });
    await page.mouse.up();
    await expect
      .poll(async () => (await pinsOf(keeper, map.id)).find((p) => p.id === keeperPinId)?.x, { timeout: 10_000 })
      .not.toBe(0.5);
  } else {
    await head.tap();
  }
  // Moved or tapped, the speld is the speler's choice now — in their hand.

  // 3. The Keeper sees one speld, ringed in the speler's ink — never two.
  await expect(keeper.locator(`.map-pin[data-pin-id="${keeperPinId}"].map-pin-held`)).toBeVisible({ timeout: 15_000 });
  await expect(keeper.locator('.map-pin')).toHaveCount(1);
  await expect(keeper.locator('.map-held')).toHaveCount(0);

  // 4. A double-click on bare picture opens *Wat komt hier?* (a mouse's gesture).
  if (!isPhone) {
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    const spot = await onPicture(page, 0.15, 0.8);
    await page.mouse.dblclick(spot.x, spot.y);
    const ask = page.getByRole('dialog', { name: 'Wat komt hier?' });
    await expect(ask).toBeVisible({ timeout: 10_000 });
    await ask.getByPlaceholder('Zoek een artikel…').fill(`Van de speler ${stamp}`);
    await ask.getByRole('button', { name: new RegExp(`Notitie .Van de speler ${stamp}. zetten`) }).click();
    await expect(page.locator('.map-pin', { hasText: `Van de speler ${stamp}` })).toBeVisible();
    await page.keyboard.press('Escape');

    // In Lezen nothing is made, and one line says why.
    await readCanvas(page);
    const still = await onPicture(page, 0.85, 0.2);
    await page.mouse.dblclick(still.x, still.y);
    await expect(page.locator('.toast', { hasText: 'Bewerken' })).toBeVisible({ timeout: 5000 });
    await expect(ask).toHaveCount(0);
    await expect(page.locator('.map-pin')).toHaveCount(2);
  }

  await keeperCtx.close();
});
