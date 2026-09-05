import { expect, test } from '@playwright/test';
import { join, resolve } from 'node:path';
import { imageMenu, signIn } from './helpers';

const fixturePhoto = join(resolve(__dirname, '../..'), 'data-e2e', 'fixture-photo.png');

/**
 * A cover crop with zoom above 1 puts a `transform: scale()` on the image, and
 * a transform paints outside the element's own box. While `feed-thumb` was a
 * class on the <img> itself there was nothing to clip it, so one zoomed cover
 * sprawled across the whole home feed.
 */
test('a zoomed cover stays inside its thumbnail in the feed', async ({ page }, testInfo) => {
  const name = `Mariam Teenstra ${testInfo.project.name}-${Date.now().toString(36)}`;

  await signIn(page, 'Keeper', 'abbeytower34');

  // An entry with a cover, zoomed in hard enough to overflow if unclipped.
  await page.goto('/wiki/character');
  await page.getByRole('button', { name: 'Nieuw', exact: true }).click();
  const sheet = page.getByRole('dialog', { name: 'Nieuw artikel' });
  await sheet.getByLabel('Naam').fill(name);
  await sheet.getByRole('button', { name: 'Aanmaken' }).click();
  await page.waitForURL('**/e/**');

  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Afbeelding toevoegen' }).click();
  await (await chooser).setFiles(fixturePhoto);
  await expect(page.locator('.entry-cover-whole img')).toBeVisible();

  // The entry itself shows the whole picture, uncropped, whatever shape it is.
  await expect(page.locator('.entry-cover-whole img')).toHaveCSS('object-fit', 'contain');

  // The list crop is a separate, smaller frame. Open it and zoom in.
  await imageMenu(page, /Bijsnijden voor lijsten/);
  const frame = page.locator('.entry-crop-frame');
  await expect(frame).toBeVisible();
  const cover = (await frame.boundingBox())!;
  for (let i = 0; i < 6; i++) {
    await page.mouse.move(cover.x + cover.width / 2, cover.y + cover.height / 2);
    await page.mouse.wheel(0, -120);
  }
  await expect
    .poll(() => frame.locator('img').evaluate((n) => getComputedStyle(n).transform))
    .not.toBe('none');
  await expect(page.locator('.save-state')).toHaveText('Opgeslagen', { timeout: 15_000 });

  // In the feed the thumbnail is a wrapper that clips, not the image itself.
  await page.goto('/');
  const thumb = page.locator('.feed-thumb').first();
  await expect(thumb).toBeVisible();

  expect(await thumb.evaluate((n) => n.tagName)).toBe('SPAN');
  expect(await thumb.evaluate((n) => getComputedStyle(n).overflow)).toBe('hidden');

  const box = (await thumb.boundingBox())!;
  expect(Math.round(box.width)).toBe(42);
  expect(Math.round(box.height)).toBe(56);

  // The row it sits in is no taller than the thumbnail plus its padding — the
  // symptom of the bug was a feed item stretched to the height of a full card.
  const row = (await page.locator('.feed-item').first().boundingBox())!;
  expect(row.height).toBeLessThan(140);
});
