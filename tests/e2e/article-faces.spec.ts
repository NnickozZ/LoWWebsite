import { expect, test, type Page } from '@playwright/test';
import { editArticle, imageMenu, inviteCode, signIn } from './helpers';

/**
 * §22: the artikel's two faces.
 *
 * The asks, in Nick's words: a view mode that reads the way a wikipedia page
 * reads, an edit mode that is the page we had, a setting in Jouw account for
 * which one you land in — Keepers editing, everyone else reading, both free to
 * change it — the image on the right with the extra info under it, and the
 * image tools tucked into a submenu.
 *
 * Each of those is asserted from the seat it matters in, and the reading face
 * is asserted by what is *absent* as much as by what is there: an input on the
 * reading face is the whole bug this was meant to fix.
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

/** Flips the face and waits for the toggle to say so, not merely for a click. */
async function flip(page: Page, to: 'lezen' | 'bewerken') {
  const toggle = page.locator('.entry-mode-toggle');
  await expect(toggle).toHaveText(to === 'lezen' ? 'Lezen' : 'Bewerken');
  await toggle.click();
  await expect(toggle).toHaveText(to === 'lezen' ? 'Bewerken' : 'Lezen');
}

async function newEntry(page: Page, name: string): Promise<string> {
  const sheet = page.getByRole('dialog', { name: 'Nieuw artikel' });
  for (let attempt = 0; attempt < 8 && !(await sheet.isVisible()); attempt++) {
    await page.keyboard.press('n');
    await page.waitForTimeout(400);
  }
  await sheet.getByLabel('Naam').fill(name);
  await sheet.getByRole('button', { name: 'Aanmaken' }).click();
  await page.waitForURL('**/e/**');
  return new URL(page.url()).pathname;
}

test('a Keeper lands in bewerken, a player lands in lezen, and both may cross', async ({
  page,
  browser,
}, info) => {
  test.setTimeout(150_000);
  const stamp = `${info.project.name}-${Date.now().toString(36)}`;
  const entryName = `Vuurtoren ${stamp}`;

  await signIn(page, 'Keeper', 'abbeytower34');
  const path = await newEntry(page, entryName);
  await page.getByLabel('Korte beschrijving').fill('Een lage bakstenen toren op de dijk.');
  await page.getByLabel('Korte beschrijving').blur();
  await expect(page.locator('.save-state')).toHaveText('Opgeslagen', { timeout: 15_000 });

  // -- the Keeper: editing, and the toggle offers the other face -----------
  await page.goto(path);
  await expect(page.locator('#entry-name')).toBeVisible();
  await expect(page.locator('.entry-mode-toggle')).toHaveText('Lezen');

  // Crossing over: the inputs go, a heading and a paragraph take their place.
  await flip(page, 'lezen');
  await expect(page.locator('#entry-name')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: entryName })).toBeVisible();
  await expect(page.getByText('Een lage bakstenen toren op de dijk.')).toBeVisible();
  await expect(page.locator('.entry-mode-toggle')).toHaveText('Bewerken');
  // Nothing on the reading face may be typed into.
  await expect(page.locator('.entry-page [contenteditable="true"]')).toHaveCount(0);

  // -- a player: reading, and the toggle offers editing --------------------
  const playerCtx = await browser.newContext();
  const player = await playerCtx.newPage();
  await signUpAs(player, `Lezer ${stamp}`);
  await player.goto(path);
  await expect(player.getByRole('heading', { name: entryName })).toBeVisible();
  await expect(player.locator('#entry-name')).toHaveCount(0);
  await expect(player.locator('.entry-mode-toggle')).toHaveText('Bewerken');

  // …and it really is the other face, not a differently-worded button.
  await editArticle(player);
  await expect(player.locator('#entry-name')).toHaveValue(entryName);
  await playerCtx.close();
});

test('the account setting decides which face an artikel opens on', async ({ page }, info) => {
  test.setTimeout(150_000);
  const stamp = `${info.project.name}-${Date.now().toString(36)}`;

  await signUpAs(page, `Kiezer ${stamp}`);
  const path = await newEntry(page, `Dagboek ${stamp}`);

  // A player's default is reading.
  await page.goto(path);
  await expect(page.locator('.entry-mode-toggle')).toHaveText('Bewerken');

  // They say: always editing.
  await page.goto('/you');
  await page.getByRole('button', { name: 'Altijd bewerken' }).click();
  await expect(page.getByRole('button', { name: 'Altijd bewerken' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.goto(path);
  await expect(page.locator('#entry-name')).toBeVisible();
  await expect(page.locator('.entry-mode-toggle')).toHaveText('Lezen');

  // And back to what their role does, which for a player is reading again.
  await page.goto('/you');
  await page.getByRole('button', { name: 'Wat bij mij hoort' }).click();
  await expect(page.getByRole('button', { name: 'Wat bij mij hoort' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.goto(path);
  await expect(page.locator('.entry-mode-toggle')).toHaveText('Bewerken');
});

test('a Keeper who would rather read gets to, and the setting sticks', async ({ page }, info) => {
  test.setTimeout(150_000);
  const stamp = `${info.project.name}-${Date.now().toString(36)}`;

  await signIn(page, 'Keeper', 'abbeytower34');
  const path = await newEntry(page, `Kelder ${stamp}`);

  await page.goto('/you');
  await page.getByRole('button', { name: 'Altijd lezen' }).click();
  await expect(page.getByRole('button', { name: 'Altijd lezen' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );

  await page.goto(path);
  await expect(page.locator('#entry-name')).toHaveCount(0);
  await expect(page.locator('.entry-mode-toggle')).toHaveText('Bewerken');

  // Put the Keeper back, so the rest of the suite finds the archive as it was.
  await page.goto('/you');
  await page.getByRole('button', { name: 'Wat bij mij hoort' }).click();
  await expect(page.getByRole('button', { name: 'Wat bij mij hoort' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.goto(path);
  await expect(page.locator('#entry-name')).toBeVisible();
});

test('the picture sits above the facts in one box, and its tools are in a menu', async ({
  page,
}, info) => {
  test.setTimeout(150_000);
  const stamp = `${info.project.name}-${Date.now().toString(36)}`;
  const entryName = `Baken ${stamp}`;

  await signIn(page, 'Keeper', 'abbeytower34');
  const path = await newEntry(page, entryName);

  // With no picture yet there is no menu — one thing to do, one button.
  await expect(page.locator('.cover-menu-button')).toHaveCount(0);
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Afbeelding toevoegen' }).click();
  await (await chooser).setFiles('data-e2e/fixture-photo.png');
  await expect(page.locator('.entry-cover-whole img')).toBeVisible({ timeout: 20_000 });

  // The wiki shape: one box, the picture first and the infobox after it.
  const box = page.locator('.entry-aside-box');
  await expect(box).toHaveCount(1);
  await expect(box.locator('.entry-figure')).toHaveCount(1);
  await expect(box.locator('.entry-infobox')).toHaveCount(1);
  const figureTop = (await box.locator('.entry-figure').boundingBox())!.y;
  const infoTop = (await box.locator('.entry-infobox').boundingBox())!.y;
  expect(figureTop).toBeLessThan(infoTop);

  // On a desktop that box is to the right of the text it belongs to.
  if (info.project.name === 'desktop') {
    const main = (await page.locator('.entry-main').boundingBox())!;
    const aside = (await box.boundingBox())!;
    expect(aside.x).toBeGreaterThan(main.x + main.width - 1);
  }

  // The three tools are behind one button, and nowhere else on the page.
  await expect(page.getByRole('button', { name: 'Vervangen' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Bijsnijden voor lijsten/ })).toHaveCount(0);
  await page.locator('.cover-menu-button').click();
  const menu = page.getByRole('menu', { name: 'Afbeelding' });
  await expect(menu.getByRole('menuitem', { name: 'Vervangen' })).toBeVisible();
  await expect(menu.getByRole('menuitem', { name: /Bijsnijden voor lijsten/ })).toBeVisible();
  await expect(menu.getByRole('menuitem', { name: 'Verwijderen' })).toBeVisible();

  // Escape closes it, as it closes the Filters popover.
  await page.keyboard.press('Escape');
  await expect(menu).toHaveCount(0);

  // The crop frame still opens from in there.
  await imageMenu(page, /Bijsnijden voor lijsten/);
  await expect(page.locator('.entry-crop-frame')).toBeVisible();

  // Reading, the picture is still there and not one tool is.
  await flip(page, 'lezen');
  await expect(page.locator('.entry-cover-whole img')).toBeVisible();
  await expect(page.locator('.cover-menu-button')).toHaveCount(0);
  await expect(page.locator('.entry-crop-frame')).toHaveCount(0);

  // And an artikel with no picture has no empty frame in its margin. Off the
  // artikel first: `newEntry` waits for an /e/ URL, and we are already on one.
  await page.goto('/');
  const bare = await newEntry(page, `Zonder beeld ${stamp}`);
  await page.goto(bare);
  await flip(page, 'lezen');
  await expect(page.locator('.entry-figure')).toHaveCount(0);
});

test('the reading face shows the facts that are filled in, and leaves the rest out', async ({
  page,
}, info) => {
  test.setTimeout(150_000);
  const stamp = `${info.project.name}-${Date.now().toString(36)}`;

  await signIn(page, 'Keeper', 'abbeytower34');
  const path = await newEntry(page, `Getuige ${stamp}`);

  // One field filled, the others left alone.
  const fields = page.locator('.entry-fields');
  const first = fields.locator('input.input, select.select').first();
  await first.waitFor({ state: 'visible' });
  const isSelect = (await first.evaluate((el) => el.tagName)) === 'SELECT';
  if (isSelect) {
    const options = await first.locator('option').allTextContents();
    await first.selectOption({ label: options[1] });
  } else {
    await first.fill(`Walcheren ${stamp}`);
    await first.blur();
  }
  // §21: the infobox's texts are a shared room, which saves on its own clock.
  // Leaving before it lands would test the wait, not the reading face.
  await expect(page.locator('.save-state')).toHaveText('Opgeslagen', { timeout: 15_000 });

  await page.goto(path);
  await flip(page, 'lezen');

  // What is filled in is printed; nothing in the box is an input.
  const infobox = page.locator('.entry-infobox');
  await expect(infobox).toBeVisible();
  await expect(infobox.locator('input, select, textarea')).toHaveCount(0);
  if (!isSelect) await expect(infobox).toContainText(`Walcheren ${stamp}`);
  // An empty field is not a blank row: fewer rows than the soort has fields.
  const rows = await infobox.locator('.fields-view > div').count();
  expect(rows).toBeGreaterThan(0);
});
