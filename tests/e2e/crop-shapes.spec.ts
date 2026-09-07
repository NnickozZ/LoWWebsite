import { expect, test, type Page } from '@playwright/test';
import Database from 'better-sqlite3';
import { join, resolve } from 'node:path';
import { editArticle, imageMenu, signIn } from './helpers';

const root = resolve(__dirname, '../..');
const fixturePhoto = join(root, 'data-e2e', 'fixture-photo.png');

/**
 * Round 19: one picture, three crops — liggend 3:2, staand 3:4, vierkant 1:1 —
 * set once in the artikel's crop section and used everywhere. This replaces
 * `per-place-crops.spec.ts`, which proved the opposite (a dossier and a board
 * card each keeping a crop of their own); those controls are gone.
 *
 * The focal point reaches the screen as `object-position`, so a crop that has
 * been dragged reads as something other than "50% 50%", and two frames of the
 * same shape read the same.
 */

const focus = (locator: ReturnType<Page['locator']>) =>
  locator.evaluate((n) => getComputedStyle(n).objectPosition);

/** Drag the picture inside one of the crop frames by (dx, dy). */
async function dragFrame(page: Page, shape: 'landscape' | 'portrait' | 'square', dx: number, dy: number) {
  const frame = page.locator(`.crop-frame[data-shape="${shape}"]`);
  await expect(frame).toBeVisible();
  const box = (await frame.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + dx, box.y + box.height / 2 + dy, { steps: 10 });
  await page.mouse.up();
  return frame;
}

test('an artikel sets three crops once, and every list draws the one for its shape', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === 'phone', 'the crop gesture needs a pointer');
  test.setTimeout(90_000);

  const stamp = `${testInfo.project.name}-${Date.now().toString(36)}`;
  const entryName = `Willem Roggeveen ${stamp}`;
  const caseName = `Sluice Gate ${stamp}`;

  await signIn(page, 'Keeper', 'abbeytower34');

  // -- an entry with a cover ---------------------------------------------------
  await page.goto('/wiki/character');
  await page.getByRole('button', { name: 'Nieuw', exact: true }).click();
  const sheet = page.getByRole('dialog', { name: 'Nieuw artikel' });
  await sheet.getByLabel('Naam').fill(entryName);
  await sheet.getByRole('button', { name: 'Aanmaken' }).click();
  await page.waitForURL('**/e/**');
  const entrySlug = new URL(page.url()).pathname.split('/e/')[1];

  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Afbeelding toevoegen' }).click();
  await (await chooser).setFiles(fixturePhoto);
  await expect(page.locator('.entry-cover-whole img')).toBeVisible();
  await expect(page.locator('.save-state')).toHaveText('Opgeslagen', { timeout: 15_000 });

  // -- the crop section: three frames, labelled, each its own shape ------------
  await imageMenu(page, /^Bijsnijden/);
  const frames = page.locator('.crop-frame');
  await expect(frames).toHaveCount(3);
  await expect(page.locator('.entry-crop-shape figcaption')).toHaveText([/Liggend 3:2/, /Staand 3:4/, /Vierkant 1:1/]);
  const ratio = async (shape: string) => {
    const box = (await page.locator(`.crop-frame[data-shape="${shape}"]`).boundingBox())!;
    return box.width / box.height;
  };
  expect(await ratio('landscape')).toBeCloseTo(3 / 2, 1);
  expect(await ratio('portrait')).toBeCloseTo(3 / 4, 1);
  expect(await ratio('square')).toBeCloseTo(1, 1);

  // Drag the staand frame and the vierkant frame; leave liggend alone.
  const portraitFrame = await dragFrame(page, 'portrait', -40, -30);
  const portraitFocus = await focus(portraitFrame.locator('img'));
  expect(portraitFocus).not.toBe('50% 50%');
  const squareFrame = await dragFrame(page, 'square', 30, 0);
  const squareFocus = await focus(squareFrame.locator('img'));
  expect(squareFocus).not.toBe('50% 50%');
  expect(squareFocus).not.toBe(portraitFocus);
  expect(await focus(page.locator('.crop-frame[data-shape="landscape"] img'))).toBe('50% 50%');
  await expect(page.locator('.save-state')).toHaveText('Opgeslagen', { timeout: 15_000 });

  // -- the wiki card is staand, so it draws the staand crop ----------------------
  await page.goto('/wiki/character');
  const wikiCard = page.locator('.card', { hasText: entryName }).first();
  await expect(wikiCard.locator('img')).toBeVisible();
  expect(await focus(wikiCard.locator('img'))).toBe(portraitFocus);

  // -- so does the feed thumb ---------------------------------------------------
  await page.goto('/');
  const feedThumb = page.locator('.feed-item', { hasText: entryName }).first().locator('.feed-thumb img');
  await expect(feedThumb).toBeVisible();
  expect(await focus(feedThumb)).toBe(portraitFocus);

  // -- file it in a dossier: the card there is the same face, no crop of its own
  await page.goto('/cases');
  await page.getByRole('button', { name: 'Dossier openen' }).click();
  const caseSheet = page.getByRole('dialog', { name: 'Dossier openen' });
  await caseSheet.getByLabel('Naam').fill(caseName);
  await caseSheet.getByRole('button', { name: 'Openen', exact: true }).click();
  await page.waitForURL('**/c/**');

  await page.getByLabel('Voeg iets toe aan dit dossier…').fill(entryName);
  await page
    .locator('.suggest-item')
    .filter({ hasText: entryName })
    .filter({ hasNotText: 'aanmaken' })
    .first()
    .click();

  const caseCard = page.locator('.card', { hasText: entryName }).first();
  await expect(caseCard.locator('img')).toBeVisible();
  expect(await focus(caseCard.locator('img'))).toBe(portraitFocus);
  await caseCard.getByRole('button', { name: /Opties voor/ }).click();
  await expect(page.getByRole('button', { name: 'Bijsnijden voor dit dossier' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Uitsnede van het/ })).toHaveCount(0);
  await page.keyboard.press('Escape');

  // -- and the dossier's own crop road is closed on the wire too -----------------
  const status = await page.evaluate(async (name) => {
    const list = (await (await fetch('/api/cases')).json()) as { cases: { id: string; name: string }[] };
    const id = list.cases.find((item) => item.name === name)!.id;
    const response = await fetch(`/api/cases/${id}/entries`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ entryId: 'whatever', crop: { x: 0, y: 0, zoom: 4 }, cropOnly: true }),
    });
    return response.status;
  }, caseName);
  expect(status).toBe(400);

  // -- a board card starts from the artikel's staand crop as well ----------------
  await page.goto('/boards');
  await page.getByRole('button', { name: 'Openbaar prikbord' }).click();
  await page.waitForURL('**/b/**');
  await page.getByLabel('Kaart toevoegen').fill(entryName);
  await page
    .locator('.suggest-item')
    .filter({ hasText: entryName })
    .filter({ hasNotText: 'als notitie' })
    .first()
    .click();
  const boardCard = page.locator('.board-card', { hasText: entryName }).first();
  await expect(boardCard.locator('img')).toBeVisible();
  expect(await focus(boardCard.locator('img'))).toBe(portraitFocus);
  // Selecting it shows the bar, and the bar has no "Bijsnijden".
  await boardCard.locator('.board-card-body').click();
  const inspector = page.locator('.board-inspector');
  await expect(inspector).toBeVisible();
  await expect(inspector.getByRole('button', { name: 'Bijsnijden' })).toHaveCount(0);

  // -- a legacy {x, y, zoom} in the database reads as the staand crop -----------
  // Written straight into the archive the server is running on (WAL, so a
  // second handle is fine), exactly as a row from before this round sits there.
  const db = new Database(join(root, 'data-e2e', 'app.db'));
  try {
    db.prepare('UPDATE entries SET cover_crop = ? WHERE slug = ?').run(
      JSON.stringify({ x: 0.1, y: 0.9, zoom: 1 }),
      entrySlug,
    );
  } finally {
    db.close();
  }
  await page.goto('/wiki/character');
  const legacyCard = page.locator('.card', { hasText: entryName }).first();
  await expect(legacyCard.locator('img')).toBeVisible();
  expect(await focus(legacyCard.locator('img'))).toBe('10% 90%');
  // And the crop section shows it in the staand frame, with the other two centred.
  await page.goto(`/e/${entrySlug}`);
  await editArticle(page);
  await imageMenu(page, /^Bijsnijden/);
  expect(await focus(page.locator('.crop-frame[data-shape="portrait"] img'))).toBe('10% 90%');
  expect(await focus(page.locator('.crop-frame[data-shape="landscape"] img'))).toBe('50% 50%');
  expect(await focus(page.locator('.crop-frame[data-shape="square"] img'))).toBe('50% 50%');
});

test('a dossier has the same three crops, and the Case Files grid draws the staand one', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === 'phone', 'the crop gesture needs a pointer');
  const caseName = `Drowned Bell ${testInfo.project.name}-${Date.now().toString(36)}`;
  await signIn(page, 'Keeper', 'abbeytower34');

  await page.goto('/cases');
  await page.getByRole('button', { name: 'Dossier openen' }).click();
  const sheet = page.getByRole('dialog', { name: 'Dossier openen' });
  await sheet.getByLabel('Naam').fill(caseName);
  await sheet.getByRole('button', { name: 'Openen', exact: true }).click();
  await page.waitForURL('**/c/**');

  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Afbeelding toevoegen' }).click();
  await (await chooser).setFiles(fixturePhoto);
  // The dossier shows it whole while editing, like an entry does.
  await expect(page.locator('.case-head .entry-cover-whole img')).toBeVisible();
  await expect(page.locator('.save-state')).toHaveText('Opgeslagen', { timeout: 15_000 });

  // The same three frames an artikel has.
  await imageMenu(page, /^Bijsnijden/);
  await expect(page.locator('.crop-frame')).toHaveCount(3);
  const frame = await dragFrame(page, 'portrait', -40, 0);
  const portraitFocus = await focus(frame.locator('img'));
  expect(portraitFocus).not.toBe('50% 50%');
  await expect(page.locator('.save-state')).toHaveText('Opgeslagen', { timeout: 15_000 });

  // And the Case Files grid squares it off on the card with that crop.
  await page.goto('/cases');
  const card = page.locator('.card', { hasText: caseName }).first();
  await expect(card.locator('.card-cover img')).toBeVisible();
  expect(await focus(card.locator('.card-cover img'))).toBe(portraitFocus);
  // Card pictures come from the 900 px variant, not the 400 px thumbnail.
  expect(await card.locator('.card-cover img').getAttribute('src')).toContain('s=card');
});
