import { expect, test, type Page } from '@playwright/test';
import { signIn, signUp } from './helpers';

/**
 * §33: the tekenlaag — free-hand drawing on a prikbord, a landkaart and a
 * tijdlijn, shared live.
 *
 * Everything about the drawing is asserted on the *canvas*: how many pixels
 * carry ink, and where. A stroke that reaches the other screen is a canvas
 * that was blank and is not; a gum that works is a count that went down; a
 * stroke that follows the axis is a bounding box that moved. And, as with
 * every live test in this archive, the second browser is never reloaded
 * except to prove that what it saw was saved.
 */

type Ink = { count: number; minX: number; maxX: number; minY: number; maxY: number };

/** Every pixel with any opacity on the tekenlaag, and the box round them. */
async function ink(page: Page): Promise<Ink> {
  return page.evaluate(() => {
    const canvas = document.querySelector<HTMLCanvasElement>('canvas.ink-layer');
    if (!canvas) return { count: -1, minX: 0, maxX: 0, minY: 0, maxY: 0 };
    const ctx = canvas.getContext('2d')!;
    const { data, width } = ctx.getImageData(0, 0, canvas.width, canvas.height);
    let count = 0;
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (let i = 3; i < data.length; i += 4) {
      if (data[i] === 0) continue;
      count++;
      const p = (i - 3) / 4;
      const x = p % width;
      const y = Math.floor(p / width);
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
    // The box in CSS pixels, whatever the screen's density, so a 150 px pan is 150.
    const scale = canvas.width / Math.max(1, canvas.clientWidth);
    return { count, minX: minX / scale, maxX: maxX / scale, minY: minY / scale, maxY: maxY / scale };
  });
}

async function waitForInk(page: Page, test: (ink: Ink) => boolean, timeout = 15_000): Promise<Ink> {
  const until = Date.now() + timeout;
  let last = await ink(page);
  while (Date.now() < until) {
    if (test(last)) return last;
    await page.waitForTimeout(150);
    last = await ink(page);
  }
  throw new Error(`The tekenlaag never got there; last: ${JSON.stringify(last)}`);
}

/** The canvas once it has stopped changing: two readings 400 ms apart that agree. */
async function settled(page: Page, timeout = 15_000): Promise<Ink> {
  const until = Date.now() + timeout;
  let last = await ink(page);
  while (Date.now() < until) {
    await page.waitForTimeout(400);
    const next = await ink(page);
    if (next.count === last.count && next.count > 0) return next;
    last = next;
  }
  return last;
}

/** A wavy line from (x, y), `steps` × 8 px to the right. */
async function stroke(page: Page, x: number, y: number, steps = 30) {
  await page.mouse.move(x, y);
  await page.mouse.down();
  for (let i = 1; i <= steps; i++) {
    await page.mouse.move(x + i * 8, y + Math.sin(i / 4) * 30);
    await page.waitForTimeout(8);
  }
  await page.mouse.up();
}

async function newBoard(page: Page): Promise<string> {
  await page.goto('/boards');
  await page.getByRole('button', { name: 'Openbaar prikbord' }).click();
  await page.waitForURL('**/b/**');
  await expect(page.locator('.board-viewport')).toBeVisible();
  return page.url();
}

async function stageBox(page: Page, selector: string) {
  const box = await page.locator(selector).boundingBox();
  if (!box) throw new Error(`no ${selector}`);
  return box;
}

test('two people draw on one prikbord: live while the hand moves, the gum takes it away, undo lifts your own', async ({
  page,
  browser,
}) => {
  test.setTimeout(120_000);
  const stamp = Date.now().toString(36).slice(-5);

  await signIn(page, 'Keeper', 'abbeytower34');
  const boardUrl = await newBoard(page);

  const context = await browser.newContext();
  const other = await context.newPage();
  await signUp(other, `Tekenaar ${stamp}`, 'duikerklok');
  await other.goto(boardUrl);
  await expect(other.locator('.board-viewport')).toBeVisible();
  await expect(other.getByTestId('ink-pen')).toBeVisible();
  expect((await ink(other)).count).toBe(0);

  // 1. The Keeper draws; the other screen sees the line *while* it is drawn.
  await page.getByTestId('ink-pen').click();
  await expect(page.getByTestId('ink-capture')).toBeVisible();
  const box = await stageBox(page, '.board-viewport');
  await page.mouse.move(box.x + 200, box.y + 200);
  await page.mouse.down();
  for (let i = 1; i <= 40; i++) {
    await page.mouse.move(box.x + 200 + i * 8, box.y + 200 + Math.sin(i / 4) * 40);
    await page.waitForTimeout(12);
  }
  const midway = await waitForInk(other, (i) => i.count > 0);
  expect(midway.count).toBeGreaterThan(0);
  await page.mouse.up();

  // (On a phone the line runs off the stage, so it may be whole already.)
  await waitForInk(other, (i) => i.count >= midway.count);
  // And it is on disk: a fresh screen has it.
  await expect(page.locator('.ink-saving')).toHaveCount(0, { timeout: 20_000 });
  const drawn = await settled(other);
  await other.reload();
  await expect(other.locator('.board-viewport')).toBeVisible();
  const afterReload = await waitForInk(other, (i) => i.count > 0);
  expect(Math.abs(afterReload.count - drawn.count)).toBeLessThan(drawn.count * 0.1);

  // 2. The other person — no edit rights needed — rubs part of it out.
  await other.getByTestId('ink-pen').click();
  await other.getByTestId('ink-eraser').click();
  const obox = await stageBox(other, '.board-viewport');
  await other.mouse.move(obox.x + 260, obox.y + 120);
  await other.mouse.down();
  await other.mouse.move(obox.x + 260, obox.y + 300, { steps: 10 });
  await other.mouse.up();
  const erased = await waitForInk(page, (i) => i.count < afterReload.count);
  expect(erased.count).toBeLessThan(afterReload.count);
  await expect(other.locator('.ink-saving')).toHaveCount(0, { timeout: 20_000 });
  await settled(page);
  await page.reload();
  await expect(page.locator('.board-viewport')).toBeVisible();
  const erasedOnDisk = await waitForInk(page, (i) => i.count > 0);
  expect(erasedOnDisk.count).toBeLessThan(afterReload.count);

  // 3. The Keeper draws again and takes it back; the gum stays, the new line goes.
  await page.getByTestId('ink-pen').click();
  await page.getByTestId('ink-colour-6').click();
  await stroke(page, box.x + 200, box.y + 400);
  await waitForInk(other, (i) => i.count > erasedOnDisk.count + 50);
  await expect(page.locator('.ink-saving')).toHaveCount(0, { timeout: 20_000 });
  const more = await settled(other);
  await page.keyboard.press('Control+z');
  const undone = await waitForInk(other, (i) => i.count < more.count - 50);
  expect(Math.abs(undone.count - erasedOnDisk.count)).toBeLessThan(erasedOnDisk.count * 0.1 + 20);
  // The other person may not undo the Keeper's strokes: their button has nothing to lift.
  await expect(other.getByTestId('ink-undo')).toBeEnabled();
  await other.keyboard.press('Control+z');
  await other.waitForTimeout(800);
  await expect(other.getByTestId('ink-undo')).toBeDisabled();

  await context.close();
});

test('in the tekenmodus a drag draws instead of moving the card; Escape hands the wall back', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === 'phone', '§8: no dragging under 768 px');
  await signIn(page, 'Keeper', 'abbeytower34');
  await newBoard(page);
  await page.getByRole('button', { name: 'Nieuwe notitie' }).click();
  const card = page.locator('.board-card').first();
  await expect(card).toBeVisible();
  const before = (await card.boundingBox())!;

  await page.getByTestId('ink-pen').click();
  await page.mouse.move(before.x + 80, before.y + 200);
  await page.mouse.down();
  await page.mouse.move(before.x + 80 + 150, before.y + 200 + 40, { steps: 10 });
  await page.mouse.up();
  const after = (await card.boundingBox())!;
  expect(Math.abs(after.x - before.x)).toBeLessThan(2);
  expect((await ink(page)).count).toBeGreaterThan(0);

  await page.keyboard.press('Escape');
  await expect(page.getByTestId('ink-capture')).toHaveCount(0);
  await page.mouse.move(before.x + 80, before.y + 200);
  await page.mouse.down();
  await page.mouse.move(before.x + 80 + 150, before.y + 200 + 40, { steps: 10 });
  await page.mouse.up();
  const moved = (await card.boundingBox())!;
  expect(moved.x - before.x).toBeGreaterThan(100);
});

test('the Keeper turns drawing off for everyone, and wipes the layer', async ({ page, browser }) => {
  test.setTimeout(120_000);
  const stamp = Date.now().toString(36).slice(-5);
  await signIn(page, 'Keeper', 'abbeytower34');
  const boardUrl = await newBoard(page);
  const boardId = boardUrl.split('/b/')[1];

  const context = await browser.newContext();
  const other = await context.newPage();
  await signUp(other, `Speler ${stamp}`, 'duikerklok');
  await other.goto(boardUrl);
  await expect(other.getByTestId('ink-pen')).toBeVisible();
  await other.getByTestId('ink-pen').click();
  const obox = await stageBox(other, '.board-viewport');
  await stroke(other, obox.x + 200, obox.y + 300);
  const drawn = await waitForInk(page, (i) => i.count > 0);
  await expect(other.locator('.ink-saving')).toHaveCount(0, { timeout: 20_000 });

  // Off. The toolbar leaves the other screen without a reload; the strokes stay.
  await page.getByRole('button', { name: 'Rechten' }).click();
  await page.getByTestId('ink-enabled').uncheck();
  await expect(other.getByTestId('ink-toolbar')).toHaveCount(0, { timeout: 15_000 });
  await expect(other.getByTestId('ink-capture')).toHaveCount(0);
  expect((await ink(other)).count).toBeGreaterThanOrEqual(drawn.count * 0.9);
  // And the door is shut, not just the sign taken down.
  const refused = await other.request.post(`/api/ink/board/${boardId}`, {
    data: { strokes: [{ id: 's_refused', mode: 'ink', colour: 1, width: 4, points: [1, 1, 1, 9, 9, 1] }] },
  });
  expect(refused.status()).toBe(403);
  const asPlayer = await other.request.post(`/api/ink/board/${boardId}`, { data: { enabled: true } });
  expect(asPlayer.status()).toBe(403);

  // On again, then wiped: empty on both screens.
  await page.getByTestId('ink-enabled').check();
  await expect(other.getByTestId('ink-pen')).toBeVisible({ timeout: 15_000 });
  await page.getByTestId('ink-clear').click();
  await page.getByRole('button', { name: 'Wissen', exact: true }).click();
  await waitForInk(other, (i) => i.count === 0);
  await waitForInk(page, (i) => i.count === 0);
  await other.reload();
  await expect(other.locator('.board-viewport')).toBeVisible();
  await other.waitForTimeout(800);
  expect((await ink(other)).count).toBe(0);

  await context.close();
});

test('a landkaart takes ink under its spelden and keeps it', async ({ page }) => {
  test.setTimeout(120_000);
  await signIn(page, 'Keeper', 'abbeytower34');
  await page.goto('/maps');
  const sharp = (await import('sharp')).default;
  const buffer = await sharp({ create: { width: 900, height: 600, channels: 3, background: '#d9d2b8' } }).png().toBuffer();
  await page.getByRole('button', { name: 'Landkaart ophangen' }).click();
  const sheet = page.getByRole('dialog', { name: 'Landkaart ophangen' });
  await sheet.getByLabel('Afbeelding').setInputFiles({ name: 'eiland.png', mimeType: 'image/png', buffer });
  await sheet.getByLabel('Naam').click();
  await page.keyboard.press('Control+a');
  await page.keyboard.type(`Inktkaart ${Date.now().toString(36)}`);
  await sheet.getByRole('button', { name: 'Ophangen' }).click();
  await page.waitForURL('**/maps/**');
  await expect(page.getByRole('application')).toBeVisible();
  await page.waitForTimeout(500);

  await page.getByTestId('ink-pen').click();
  const box = await stageBox(page, '.map-stage');
  await stroke(page, box.x + box.width * 0.3, box.y + box.height * 0.4, 20);
  await expect(page.locator('.ink-saving')).toHaveCount(0, { timeout: 20_000 });
  const drawn = await settled(page);
  await page.keyboard.press('Escape');

  // Zooming in makes the line bigger, as it does the map.
  await page.getByRole('button', { name: 'Inzoomen' }).click();
  const zoomed = await waitForInk(page, (i) => i.maxX - i.minX > (drawn.maxX - drawn.minX) * 1.2);
  expect(zoomed.count).toBeGreaterThan(drawn.count);

  await page.reload();
  await expect(page.getByRole('application')).toBeVisible();
  const kept = await waitForInk(page, (i) => i.count > 0);
  expect(Math.abs(kept.count - drawn.count)).toBeLessThan(drawn.count * 0.15);
  // The layer is under the pins: the toolbar's canvas sits before the pins in the DOM.
  const order = await page.evaluate(() => {
    const canvas = document.querySelector('canvas.ink-layer')!;
    const pins = document.querySelector('.map-pins')!;
    return canvas.compareDocumentPosition(pins) & Node.DOCUMENT_POSITION_FOLLOWING ? 'under' : 'over';
  });
  expect(order).toBe('under');
});

test('a tijdlijn takes ink that sticks to the years', async ({ page }) => {
  test.setTimeout(120_000);
  await signIn(page, 'Keeper', 'abbeytower34');
  await page.goto('/timelines');
  await page.getByRole('button', { name: /Nieuwe tijdlijn|Maak nieuwe tijdlijn/ }).first().click();
  const sheet = page.getByRole('dialog', { name: 'Nieuwe tijdlijn' });
  await sheet.getByLabel('Naam').fill(`Inktlijn ${Date.now().toString(36)}`);
  await sheet.getByLabel('Dagen').check();
  await sheet.getByRole('button', { name: /Openbare tijdlijn|Tijdlijn aanmaken/ }).click();
  await page.waitForURL('**/timelines/**');
  await expect(page.getByTestId('timeline-stage')).toBeVisible();
  await page.waitForTimeout(500);

  await page.getByTestId('ink-pen').click();
  const box = await stageBox(page, '.timeline-stage');
  await stroke(page, box.x + box.width * 0.4, box.y + 120, 20);
  await expect(page.locator('.ink-saving')).toHaveCount(0, { timeout: 20_000 });
  const drawn = await settled(page);
  await page.keyboard.press('Escape');

  // Shift the axis to the left by 150 px: the line goes with the dates.
  await page.mouse.move(box.x + box.width * 0.7, box.y + box.height - 40);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.7 - 150, box.y + box.height - 40, { steps: 8 });
  await page.mouse.up();
  // (The right edge, because on a phone the left one slides off the stage.)
  const shifted = await waitForInk(page, (i) => Math.abs(i.maxX - (drawn.maxX - 150)) < 6);
  expect(Math.abs(shifted.maxY - drawn.maxY)).toBeLessThan(3);

  await page.reload();
  await expect(page.getByTestId('timeline-stage')).toBeVisible();
  const kept = await waitForInk(page, (i) => i.count > 0);
  expect(Math.abs(kept.count - drawn.count)).toBeLessThan(drawn.count * 0.15);
});
