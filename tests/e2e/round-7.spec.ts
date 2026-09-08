import { expect, test, type Page } from '@playwright/test';
import { editArticle, newEntryButton, signIn } from './helpers';

/**
 * §24/§25: Nick's round of 5 September, late.
 *
 *  1. Everything the archive makes can be thrown away again — a prikbord and a
 *     landkaart could not, at all, and a landkaart that was taken down was gone
 *     for good rather than in the bin.
 *  2. Voorwerpen and Clues are made in a dossier and nowhere else, and land in
 *     the wiki under the dossier's name.
 *  3. Rechten is one panel with two halves instead of two panels that quietly
 *     AND themselves together.
 *  4. The artikel page is three columns: text, signpost, facts.
 */

const KEEPER = ['Keeper', 'abbeytower34'] as const;

async function openCase(page: Page, name: string) {
  await page.goto('/cases');
  await page.getByRole('button', { name: 'Dossier openen' }).click();
  const sheet = page.getByRole('dialog', { name: 'Dossier openen' });
  await sheet.getByLabel('Naam', { exact: true }).fill(name);
  await sheet.getByRole('button', { name: 'Openen', exact: true }).click();
  await page.waitForURL('**/c/**');
  return new URL(page.url()).pathname;
}

async function picture(): Promise<Buffer> {
  const sharp = (await import('sharp')).default;
  return sharp({ create: { width: 700, height: 500, channels: 3, background: '#cfc7ae' } })
    .png()
    .toBuffer();
}

test('a prikbord can be thrown away, and put back', async ({ page }, info) => {
  const stamp = `${info.project.name}-${Date.now().toString(36)}`;
  const boardName = `Weg ermee ${stamp}`;

  await signIn(page, ...KEEPER);
  await page.goto('/boards');
  await page.getByRole('button', { name: 'Openbaar prikbord' }).click();
  await page.waitForURL('**/b/**');
  await page.locator('#board-name').fill(boardName);
  await page.locator('#board-name').blur();
  await page.waitForTimeout(400);

  // It had no way out at all before this round.
  await page.getByRole('button', { name: /verwijderen/i }).click();
  const ask = page.getByRole('dialog', { name: new RegExp(`${boardName} weggooien`) });
  await expect(ask).toBeVisible();
  await ask.getByRole('button', { name: 'Naar de prullenbak' }).click();
  await page.waitForURL('**/boards**');
  await expect(page.getByText(boardName)).toHaveCount(0);

  // And it is in the bin, where a Keeper can put it back.
  await page.goto('/admin');
  await page.getByRole('tab', { name: /Prullenbak/ }).click();
  const row = page.locator('li').filter({ hasText: boardName }).first();
  await expect(row).toBeVisible();
  await row.getByRole('button', { name: 'Terugzetten' }).click();

  await page.goto('/boards');
  await expect(page.getByText(boardName).first()).toBeVisible();
});

test('a landkaart lands in the bin instead of vanishing', async ({ page }, info) => {
  test.setTimeout(120_000);
  const stamp = `${info.project.name}-${Date.now().toString(36)}`;
  const mapName = `Weg van de muur ${stamp}`;

  await signIn(page, ...KEEPER);
  await page.goto('/maps');
  await page.getByRole('button', { name: 'Landkaart ophangen' }).click();
  const sheet = page.getByRole('dialog', { name: 'Landkaart ophangen' });
  await sheet
    .getByLabel('Afbeelding')
    .setInputFiles({ name: 'weg.png', mimeType: 'image/png', buffer: await picture() });
  await sheet.getByLabel('Naam', { exact: true }).click();
  await page.keyboard.press('Control+a');
  await page.keyboard.type(mapName);
  await sheet.getByRole('button', { name: 'Ophangen' }).click();
  await page.waitForURL('**/maps/**');

  await page.locator('summary', { hasText: /Deze landkaart/ }).click();
  await page.getByRole('button', { name: 'Van de muur halen' }).click();
  const ask = page.getByRole('dialog', { name: new RegExp(`${mapName} van de muur halen`) });
  await expect(ask).toBeVisible();
  // The sheet used to promise it could never be got back. It can now.
  await expect(ask.getByText(/prullenbak/)).toBeVisible();
  await ask.getByRole('button', { name: 'Weghalen' }).click();
  // The map's own URL also matches "**/maps**", so wait for the shelf itself —
  // otherwise this walks on to Beheer while the DELETE is still in flight.
  await page.waitForURL(/\/maps(\?.*)?$/);
  await expect(page.getByText(mapName)).toHaveCount(0);

  await page.goto('/admin');
  await page.getByRole('tab', { name: /Prullenbak/ }).click();
  const row = page.locator('li').filter({ hasText: mapName }).first();
  await expect(row).toBeVisible();
  await expect(row.getByText('Landkaart')).toBeVisible();
  await row.getByRole('button', { name: 'Terugzetten' }).click();

  await page.goto('/maps');
  await expect(page.getByText(mapName).first()).toBeVisible();
});

test('een clue wordt in een dossier gemaakt, en staat in de wiki onder het dossier', async ({
  page,
}, info) => {
  const stamp = `${info.project.name}-${Date.now().toString(36)}`;
  const caseName = `Zaak ${stamp}`;
  const clueName = `De brief ${stamp}`;

  await signIn(page, ...KEEPER);

  // §49: everywhere, in fact — the sheet offers every soort now, in the wiki
  // as well as in a dossier. What is left of §24 is the *name*, below.
  await page.goto('/wiki');
  await newEntryButton(page).click();
  const sheet = page.getByRole('dialog', { name: 'Nieuw artikel' });
  await expect(sheet.getByRole('radio', { name: 'Relieken' })).toBeVisible();
  await expect(sheet.getByRole('radio', { name: 'Clues', exact: true })).toBeVisible();
  await expect(sheet.getByRole('radio', { name: 'Voorwerpen', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');

  // And the wiki's own page for them has its own button back.
  await page.goto('/wiki/clue');
  await expect(page.getByRole('heading', { name: 'Clues' })).toBeVisible();
  await expect(page.locator('main').getByRole('button', { name: /^Nieuw/ })).toHaveCount(1);

  // In a dossier it is offered too, and what comes out is filed there — and
  // wears the dossier's name, because that is this soort's habit (§49).
  await openCase(page, caseName);
  await page.getByPlaceholder('Voeg iets toe aan dit dossier…').fill(clueName);
  await page.locator('.suggest-item').filter({ hasText: 'aanmaken' }).first().click();
  const newSheet = page.getByRole('dialog', { name: 'Nieuw artikel' });
  await newSheet.getByRole('radio', { name: 'Clues' }).click();
  await newSheet.getByRole('button', { name: 'Aanmaken' }).click();
  await expect(newSheet).toHaveCount(0, { timeout: 20_000 });
  await expect(page.getByText(clueName).first()).toBeVisible({ timeout: 20_000 });

  // And in the wiki it carries the dossier it came from.
  await page.goto('/wiki/clue');
  await expect(page.getByText(`${caseName}: ${clueName}`).first()).toBeVisible();

  // The artikel itself keeps its own short name.
  await page.goto('/search');
  await page.getByLabel(/Zoeken/).first().fill(clueName);
  await expect(page.getByText(`${caseName}: ${clueName}`).first()).toBeVisible({ timeout: 15_000 });
});

test('rechten is één paneel met twee helften', async ({ page }, info) => {
  test.skip(info.project.name === 'phone', 'the three-column layout is a wide-screen thing');

  await signIn(page, ...KEEPER);
  await page.goto('/e/pier-boone');
  await editArticle(page);

  // One panel, not two.
  await expect(page.locator('summary').filter({ hasText: 'Zichtbaarheid en onthullingen' })).toHaveCount(0);
  await page.locator('summary').filter({ hasText: 'Rechten' }).first().click();

  const panel = page.locator('.entry-manage');
  await expect(panel.getByText(/Twee sloten op één deur/)).toBeVisible();
  await expect(panel.locator('.rights-half')).toHaveCount(2);
  // The Keeper's half still does what it did.
  await expect(panel.getByRole('button', { name: 'Alleen de Keeper' })).toBeVisible();
  // And the owner's half too — its own two dials, not the heading above them.
  await expect(panel.locator('.label', { hasText: 'Wie mag kijken' })).toBeVisible();
  await expect(panel.locator('.label', { hasText: 'Wie mag bewerken' })).toBeVisible();
});

test('de artikelpagina staat in drie kolommen', async ({ page }, info) => {
  test.skip(info.project.name === 'phone', 'the three-column layout is a wide-screen thing');

  await signIn(page, ...KEEPER);
  await page.goto('/e/pier-boone');
  await page.waitForTimeout(600);

  // The title lives in the text column now, so the picture and Meer info start
  // at the same height as it rather than a heading and a lead further down.
  const title = page.locator('.entry-main .entry-head');
  await expect(title).toBeVisible();

  const head = (await title.boundingBox())!;
  const aside = (await page.locator('.entry-aside').boundingBox())!;
  expect(Math.abs(aside.y - head.y)).toBeLessThan(24);

  // And the outline stands in the margin, to the *left* of the text: a
  // signpost among the content was read as content, and it split the artikel's
  // words from the picture that belongs to them.
  const rail = (await page.locator('.entry-rail').boundingBox())!;
  const main = (await page.locator('.entry-main').boundingBox())!;
  expect(rail.x + rail.width).toBeLessThanOrEqual(main.x + 1);
  expect(main.x + main.width).toBeLessThanOrEqual(aside.x + 1);
});

/**
 * §25: one wide layout, not two. The columns used to be three above 1280 px
 * and two below it, with "Op deze pagina" back under the picture — so the page
 * rearranged itself halfway across a screen and the outline appeared to have
 * moved on its own. The breakpoint (`useIsWide`, and the grid's media query,
 * which are the same number) is 1280 px now and nothing changes shape above
 * it. This is the assertion that was missing.
 *
 * The order the columns hold is signpost, text, facts — the outline is the
 * first column, in the page's own left margin, not the middle one.
 */
test('de drie kolommen houden hun volgorde over de hele brede band', async ({ page }, info) => {
  test.skip(info.project.name === 'phone', 'the three-column layout is a wide-screen thing');

  await signIn(page, ...KEEPER);

  // Just above the breakpoint, and a normal desktop.
  for (const width of [1300, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/e/pier-boone');
    await page.waitForTimeout(600);

    await expect(page.locator('.entry-rail')).toBeVisible();

    const main = (await page.locator('.entry-main').boundingBox())!;
    const rail = (await page.locator('.entry-rail').boundingBox())!;
    const aside = (await page.locator('.entry-aside').boundingBox())!;

    // Signpost, text, facts — left to right, at either width.
    expect(rail.x + rail.width).toBeLessThanOrEqual(main.x + 1);
    expect(main.x + main.width).toBeLessThanOrEqual(aside.x + 1);
    // And the three columns still begin at the same height.
    const head = (await page.locator('.entry-main .entry-head').boundingBox())!;
    expect(Math.abs(aside.y - head.y)).toBeLessThan(24);
  }
});
