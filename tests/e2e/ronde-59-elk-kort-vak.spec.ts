import { expect, test, type Page } from '@playwright/test';
import { editCanvas, readCanvas, signIn, signUp } from './helpers';

/**
 * §98, ronde 59 — een id in elk kort vak.
 *
 * What ronde 56 did for the korte beschrijving, done for the rest: the text of
 * a speld and of a gebeurtenis (and the los kaartje, the omschrijvingen and an
 * overzicht's inleiding, which `tests/unit/ronde-59-elk-kort-vak.test.ts`
 * covers road by road) holds a chip with its artikel in it. What only a
 * browser can say:
 *
 *   1. a speld's text shows its chip, and a renamed artikel's chip reads the
 *      new name at once (A3 — `[[oude naam]]` found nothing after a rename);
 *   2. a speler sees nothing of a chip to a Keeper-only artikel — not on the
 *      screen and not in the page;
 *   3. a tap on a chip in Bewerken does not walk off the page (it did on a
 *      phone: a tap meant for the caret opened the artikel);
 *   4. the same for a gebeurtenis on a tijdlijn.
 */

const KEEPER = { name: 'Keeper', password: 'abbeytower34' };

async function picture(): Promise<Buffer> {
  const sharp = (await import('sharp')).default;
  return sharp({ create: { width: 900, height: 600, channels: 3, background: '#d9d2b8' } })
    .png()
    .toBuffer();
}

async function makeEntry(page: Page, name: string, extra: { keeperOnly?: boolean } = {}) {
  const made = await page.request.post('/api/entries', { data: { name, typeSlug: 'character', ...extra } });
  expect(made.ok()).toBe(true);
  return ((await made.json()) as { entry: { id: string; slug: string } }).entry;
}

async function rename(page: Page, id: string, name: string) {
  const renamed = await page.request.patch(`/api/entries/${id}`, { data: { name } });
  expect(renamed.ok()).toBe(true);
}

test('een speld: de chip, de hernoeming, de speler en de tik in Bewerken', async ({ page, browser }, info) => {
  test.setTimeout(180_000);
  const stamp = `${info.project.name}-${Date.now().toString(36)}`;
  await signIn(page, KEEPER.name, KEEPER.password);
  const target = await makeEntry(page, `Veerman ${stamp}`);
  const secretName = `Verborgen ${stamp}`;
  await makeEntry(page, secretName, { keeperOnly: true });

  const hung = await page.request.post('/api/maps', {
    multipart: { file: { name: 'eiland.png', mimeType: 'image/png', buffer: await picture() }, name: `Kaart ${stamp}` },
  });
  expect(hung.ok()).toBe(true);
  const map = ((await hung.json()) as { map: { id: string; slug: string } }).map;
  // Typed out in full on the way in: the archive makes both of them chips.
  const pinName = `Aanlegplaats ${stamp}`;
  const pinned = await page.request.post(`/api/maps/${map.id}/pins`, {
    data: { kind: 'note', name: pinName, text: `Hier wachtte [[Veerman ${stamp}]] op [[${secretName}]] bij de steiger`, x: 0.5, y: 0.5 },
  });
  expect(pinned.ok()).toBe(true);
  const pin = ((await pinned.json()) as { pin: { id: string } }).pin;

  // 1. The Keeper reads the speld: two chips, no brackets, no handle. (A desk
  // opens a canvas in Bewerken, §73; reading is Lezen's.)
  await page.goto(`/maps/${map.slug}?pin=${pin.id}`);
  await readCanvas(page);
  const sheet = page.getByRole('dialog', { name: pinName });
  await expect(sheet).toBeVisible({ timeout: 20_000 });
  await expect(sheet.locator('a.entry-chip', { hasText: `Veerman ${stamp}` })).toHaveAttribute('href', `/e/${target.slug}`, { timeout: 20_000 });
  await expect(sheet.locator('a.entry-chip', { hasText: secretName })).toBeVisible();
  await expect(sheet).not.toContainText('[[');
  await expect(sheet).not.toContainText('⟦');

  // A3: a rename is on the chip at once.
  await rename(page, target.id, `Pontbaas ${stamp}`);
  await page.goto(`/maps/${map.slug}?pin=${pin.id}`);
  await readCanvas(page);
  await expect(sheet.locator('a.entry-chip', { hasText: `Pontbaas ${stamp}` })).toBeVisible({ timeout: 20_000 });
  await expect(sheet).not.toContainText(`Veerman ${stamp}`);

  // 3. In Bewerken the box holds the chips, and a tap on one stays here.
  await editCanvas(page);
  const box = sheet.locator('#pin-text');
  await expect(box).toHaveAttribute('contenteditable', 'true', { timeout: 20_000 });
  const chip = box.locator('.short-chip', { hasText: `Pontbaas ${stamp}` });
  await expect(chip).toBeVisible({ timeout: 20_000 });
  const here = page.url();
  if (info.project.use.hasTouch) await chip.tap();
  else await chip.click();
  await page.waitForTimeout(1200);
  expect(page.url()).toBe(here);
  await expect(box).toBeVisible();

  // 2. A speler: the one chip, and of the other not a letter — nor in the page.
  const context = await browser.newContext({ ...info.project.use });
  const player = await context.newPage();
  await signUp(player, `Speler59${Date.now().toString(36)}`, 'abbeytower34');
  await player.goto(`/maps/${map.slug}?pin=${pin.id}`);
  const theirs = player.getByRole('dialog', { name: pinName });
  await expect(theirs).toBeVisible({ timeout: 20_000 });
  await expect(theirs.locator('a.entry-chip', { hasText: `Pontbaas ${stamp}` })).toBeVisible({ timeout: 20_000 });
  await expect(theirs).toContainText('Hier wachtte');
  await expect(theirs).toContainText('bij de steiger');
  await expect(theirs).not.toContainText(secretName);
  expect(await player.content()).not.toContain(secretName);
  await context.close();
});

test('een gebeurtenis: de chip, de hernoeming en de speler', async ({ page, browser }, info) => {
  test.setTimeout(180_000);
  const stamp = `${info.project.name}-${Date.now().toString(36)}`;
  await signIn(page, KEEPER.name, KEEPER.password);
  const target = await makeEntry(page, `Getuige ${stamp}`);
  const secretName = `Verzwegen ${stamp}`;
  await makeEntry(page, secretName, { keeperOnly: true });

  const made = await page.request.post('/api/timelines', { data: { name: `Jaar ${stamp}`, scale: 'day' } });
  expect(made.ok()).toBe(true);
  const timeline = ((await made.json()) as { timeline: { id: string; slug: string } }).timeline;
  const eventName = `Overtocht ${stamp}`;
  const added = await page.request.post(`/api/timelines/${timeline.id}/events`, {
    data: {
      kind: 'note',
      name: eventName,
      text: `Gezien door [[Getuige ${stamp}]] en [[${secretName}]] op de dijk`,
      at: Math.floor(Date.UTC(1931, 2, 12) / 1000),
    },
  });
  expect(added.ok()).toBe(true);
  const event = ((await added.json()) as { event: { id: string } }).event;

  await page.goto(`/timelines/${timeline.slug}?event=${event.id}`);
  const popout = page.getByTestId('timeline-popout');
  await expect(popout).toBeVisible({ timeout: 20_000 });
  await expect(popout.locator('a.entry-chip', { hasText: `Getuige ${stamp}` })).toHaveAttribute('href', `/e/${target.slug}`, { timeout: 20_000 });
  await expect(popout.locator('a.entry-chip', { hasText: secretName })).toBeVisible();
  await expect(popout).not.toContainText('[[');

  await rename(page, target.id, `Ooggetuige ${stamp}`);
  await page.goto(`/timelines/${timeline.slug}?event=${event.id}`);
  await expect(popout.locator('a.entry-chip', { hasText: `Ooggetuige ${stamp}` })).toBeVisible({ timeout: 20_000 });

  // The edit sheet: the same chips in the box (the room's `Y.Text`, §21).
  await editCanvas(page);
  await popout.getByTestId('timeline-edit-event').click();
  const box = page.locator('#event-text');
  await expect(box.locator('.short-chip')).toHaveText([`Ooggetuige ${stamp}`, secretName], { timeout: 20_000 });
  const here = page.url();
  const chip = box.locator('.short-chip').first();
  if (info.project.use.hasTouch) await chip.tap();
  else await chip.click();
  await page.waitForTimeout(1200);
  expect(page.url()).toBe(here);

  const context = await browser.newContext({ ...info.project.use });
  const player = await context.newPage();
  await signUp(player, `Speler59t${Date.now().toString(36)}`, 'abbeytower34');
  await player.goto(`/timelines/${timeline.slug}?event=${event.id}`);
  const theirs = player.getByTestId('timeline-popout');
  await expect(theirs).toBeVisible({ timeout: 20_000 });
  await expect(theirs.locator('a.entry-chip', { hasText: `Ooggetuige ${stamp}` })).toBeVisible({ timeout: 20_000 });
  await expect(theirs).toContainText('op de dijk');
  await expect(theirs).not.toContainText(secretName);
  expect(await player.content()).not.toContain(secretName);
  await context.close();
});
