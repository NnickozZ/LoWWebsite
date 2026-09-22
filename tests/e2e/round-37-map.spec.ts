import { expect, test, type Page } from '@playwright/test';
import { editCanvas, signIn } from './helpers';

/**
 * Round 37 on the landkaart: §73 Lezen of Bewerken, §74 de peek.
 *
 * Nick: *"Moving things accidentally is very easy"* and *"if you open one it
 * just covers the screen."* So a desk opens a landkaart in Bewerken and a phone
 * in Lezen — no "Speld zetten", and a drag on a speld pans the map — and on a
 * phone a tapped speld comes up in a small, non-modal peek that leaves the map
 * above it live.
 *
 * The spelden are set through the API rather than through "Speld zetten": the
 * point here is what a phone in Lezen can do with spelden that are already
 * there, and setting them by hand would need Bewerken first.
 */

async function picture(): Promise<Buffer> {
  const sharp = (await import('sharp')).default;
  return sharp({ create: { width: 900, height: 600, channels: 3, background: '#d9d2b8' } })
    .png()
    .toBuffer();
}

/** Hang a landkaart and stand on it — without touching the switch. */
async function hangMap(page: Page, name: string): Promise<string> {
  await page.goto('/maps');
  await page.getByRole('button', { name: 'Landkaart ophangen' }).click();
  const sheet = page.getByRole('dialog', { name: 'Landkaart ophangen' });
  await sheet.getByLabel('Afbeelding').setInputFiles({ name: 'eiland.png', mimeType: 'image/png', buffer: await picture() });
  await sheet.getByLabel('Naam', { exact: true }).click();
  await page.keyboard.press('Control+a');
  await page.keyboard.type(name);
  await expect(sheet.getByLabel('Naam', { exact: true })).toHaveValue(name);
  await sheet.getByRole('button', { name: 'Ophangen' }).click();
  await page.waitForURL('**/maps/**');
  await expect(page.getByRole('heading', { name })).toBeVisible();
  await expect(page.getByRole('application')).toBeVisible();
  return new URL(page.url()).pathname;
}

/** The landkaart's id, from its slug — the pins API speaks ids. */
async function mapId(page: Page, mapUrl: string): Promise<string> {
  const slug = mapUrl.split('/maps/')[1];
  const list = await page.request.get('/api/maps');
  const maps = (await list.json()) as { maps: { id: string; slug: string }[] };
  const found = maps.maps.find((m) => m.slug === slug);
  expect(found, 'the landkaart just hung is in the list').toBeTruthy();
  return found!.id;
}

async function notePin(page: Page, id: string, name: string, x: number, y: number) {
  const response = await page.request.post(`/api/maps/${id}/pins`, {
    data: { kind: 'note', name, text: `Wat er bij ${name} staat.`, x, y },
  });
  expect(response.ok(), `speld ${name} is gezet`).toBe(true);
}

test('§73/§74: een bureau opent in Bewerken, een telefoon in Lezen met een peek die het glas laat staan', async ({
  page,
}, info) => {
  test.setTimeout(180_000);
  const stamp = `${info.project.name}-${Date.now().toString(36)}`;
  const first = `Vuurtoren ${stamp}`;
  const second = `Haven ${stamp}`;

  await signIn(page, 'Keeper', 'abbeytower34');
  const mapUrl = await hangMap(page, `Lezen ${stamp}`);
  const id = await mapId(page, mapUrl);
  // High on the picture, left and right of the middle: well above where a peek
  // rises to on 844 px, and apart enough never to fold into one kluitje (§71).
  await notePin(page, id, first, 0.3, 0.25);
  await notePin(page, id, second, 0.7, 0.25);
  await page.reload();
  await expect(page.getByRole('application')).toBeVisible();
  await expect(page.locator('.map-pin')).toHaveCount(2, { timeout: 20_000 });

  const modes = page.getByTestId('canvas-mode');
  const setPin = page.getByRole('button', { name: 'Speld zetten' });

  if (info.project.name === 'desktop') {
    await expect(modes.getByRole('radio', { name: 'Bewerken', exact: true })).toHaveAttribute('aria-checked', 'true');
    await expect(setPin).toBeVisible();
    // And a desk keeps its docked blad: no peek there.
    await page.locator('.map-pin', { hasText: first }).click();
    await expect(page.getByRole('dialog', { name: first })).toBeVisible();
    await expect(page.locator('.map-panel')).toBeVisible();
    await expect(page.locator('.canvas-peek')).toHaveCount(0);
    return;
  }

  /* ---- a phone opens in Lezen: nothing to set ---- */
  // The server draws the switch as a desk's; the phone turns it on the first
  // client render, so this is waited for rather than read once (§6).
  await expect(modes.getByRole('radio', { name: 'Lezen', exact: true })).toHaveAttribute('aria-checked', 'true');
  await expect(setPin).toHaveCount(0);

  /* ---- a drag on a speld in Lezen pans the map; the speld stays on its spot ---- */
  const pinOne = page.locator('.map-pin', { hasText: first });
  const world = page.locator('.map-world');
  const relative = async () => {
    const p = (await pinOne.boundingBox())!;
    const w = (await world.boundingBox())!;
    return { x: (p.x - w.x) / w.width, y: (p.y - w.y) / w.height, worldX: w.x };
  };
  const was = await relative();
  const grab = (await pinOne.boundingBox())!;
  await page.mouse.move(grab.x + grab.width / 2, grab.y + grab.height / 2);
  await page.mouse.down();
  await page.mouse.move(grab.x + grab.width / 2 + 60, grab.y + grab.height / 2, { steps: 10 });
  await page.mouse.up();
  await page.waitForTimeout(300);
  const now = await relative();
  expect(Math.abs(now.worldX - was.worldX), 'the picture moved under the hand').toBeGreaterThan(30);
  expect(Math.abs(now.x - was.x), 'and the speld did not move on the picture').toBeLessThan(0.01);
  await page.getByRole('button', { name: 'Alles in beeld' }).click();
  await page.waitForTimeout(300);

  /* ---- a tap opens a peek, small and low ---- */
  await pinOne.click();
  const peek = page.getByRole('dialog', { name: first });
  await expect(peek).toBeVisible();
  await expect(page.locator('.map-panel')).toHaveCount(0);
  await expect(peek).not.toHaveAttribute('aria-modal', 'true');
  // The first view says what it is and where it goes, not what to do to it.
  await expect(peek.getByRole('heading', { name: first })).toBeInViewport();

  const viewport = page.viewportSize()!;
  const peekBox = (await page.locator('.canvas-peek').boundingBox())!;
  expect(peekBox.height, 'a peek, not a sheet').toBeLessThan(viewport.height * 0.45);
  expect(peekBox.y, 'and it sits in the lower half').toBeGreaterThan(viewport.height * 0.5);

  /* ---- the next speld is one tap away, and the peek follows it ---- */
  await page.locator('.map-pin', { hasText: second }).click();
  await expect(page.getByRole('dialog', { name: second })).toBeVisible();
  await expect(page.getByRole('dialog', { name: first })).toHaveCount(0);
  await expect(page.locator('.canvas-peek')).toHaveCount(1);

  /* ---- the map above the peek is still the map: a tap on bare paper puts it away ---- */
  const stage = (await page.locator('.map-stage').boundingBox())!;
  const top = (await page.locator('.canvas-peek').boundingBox())!.y;
  // §94 (O6): a notitie's peek shows its words now, not two boxes, so it is
  // shorter and the half-way line lands on the spelden' labels — aim near the
  // top of the glas instead, which is bare paper at any height of peek.
  const bare = { x: stage.x + stage.width * 0.12, y: stage.y + Math.min(40, (top - stage.y) * 0.2) };
  const hit = await page.evaluate(({ x, y }) => {
    const el = document.elementFromPoint(x, y);
    return { inStage: Boolean(el?.closest('.map-stage')), onPin: Boolean(el?.closest('.map-pin')) };
  }, bare);
  expect(hit.inStage, 'what is above the peek belongs to the map').toBe(true);
  expect(hit.onPin).toBe(false);
  await page.mouse.click(bare.x, bare.y);
  await expect(page.locator('.canvas-peek')).toHaveCount(0);

  /* ---- Bewerken gives "Speld zetten" back ---- */
  await expect(async () => {
    await editCanvas(page);
    await expect(setPin).toBeVisible({ timeout: 1500 });
  }).toPass({ timeout: 20_000 });
});
