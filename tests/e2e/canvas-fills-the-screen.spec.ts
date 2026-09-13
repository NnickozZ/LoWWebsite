import { expect, test, type Page } from '@playwright/test';
import { signIn } from './helpers';

/**
 * §34: a landkaart and a tijdlijn fill the screen.
 *
 * The measurements are the specification. Three things used to eat the screen
 * — the 1200 px cap on `.page-wide`, the page's padding, and a magic height on
 * the stage itself — and all three are gone, so what is asserted here is:
 *
 *   - the stage is most of the screen tall (it used to be a strip with the
 *     page's furniture above and a field of nothing below);
 *   - it is the whole main column wide bar a thin margin either side, so its
 *     border still reads as a border and not as the edge of the screen;
 *   - on a phone its bottom edge stops *at* the tab bar and never under it;
 *   - and nothing runs off sideways, at any of these sizes.
 *
 * The last case is a phone held sideways, where the stage's `min-height` is
 * larger than what the column has to give: the floor must hold without the
 * page starting to slide left and right.
 */

const KEEPER = ['Keeper', 'abbeytower34'] as const;

async function picture(): Promise<Buffer> {
  const sharp = (await import('sharp')).default;
  return sharp({ create: { width: 900, height: 600, channels: 3, background: '#d9d2b8' } })
    .png()
    .toBuffer();
}

/** The screen, the main column, and the tab bar — null on a desktop, where there is none. */
async function frame(page: Page) {
  const viewport = page.viewportSize()!;
  const main = (await page.locator('main.main').boundingBox())!;
  const tabs = await page.locator('.tabs').boundingBox();
  const sideways = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  return { viewport, main, tabs, sideways };
}

/**
 * The stage takes the screen. The width is measured against the *main column*
 * and not the window, because on a desktop the sidenav has 220 px of it; on a
 * phone the two are the same thing.
 */
async function expectFillsTheScreen(page: Page, selector: string, floor = 0.62) {
  const { viewport, main, tabs, sideways } = await frame(page);
  const box = (await page.locator(selector).boundingBox())!;

  expect(box.height, `${selector} is ${Math.round(box.height)} of ${viewport.height}`).toBeGreaterThan(
    viewport.height * floor,
  );
  expect(box.width).toBeGreaterThan(main.width - 40);
  expect(box.width).toBeLessThanOrEqual(main.width);
  // A thin margin, not none: half the page's gutter on either side.
  expect(box.x - main.x).toBeGreaterThan(3);
  expect(box.x - main.x).toBeLessThan(24);
  // On a phone the tab bar is the floor of the screen; the stage stops above it.
  if (tabs) expect(box.y + box.height).toBeLessThanOrEqual(tabs.y + 1);
  else expect(box.y + box.height).toBeLessThanOrEqual(viewport.height + 1);
  expect(sideways).toBeLessThanOrEqual(1);
}

/** A phone held sideways: the floor holds, and nothing runs off the side. */
async function expectStandsUpSideways(page: Page, selector: string) {
  await page.setViewportSize({ width: 740, height: 360 });
  // The stage is measured by a ResizeObserver; give it the frame.
  await page.waitForTimeout(400);
  const { main, sideways } = await frame(page);
  const box = (await page.locator(selector).boundingBox())!;
  expect(box.height).toBeGreaterThanOrEqual(200);
  expect(box.width).toBeGreaterThan(main.width - 40);
  expect(box.width).toBeLessThanOrEqual(main.width);
  expect(sideways).toBeLessThanOrEqual(1);
}

test('a landkaart fills the screen', async ({ page }, info) => {
  test.setTimeout(120_000);
  const stamp = `${info.project.name}-${Date.now().toString(36)}`;

  await signIn(page, ...KEEPER);
  await page.goto('/maps');
  await page.getByRole('button', { name: 'Landkaart ophangen' }).click();
  const sheet = page.getByRole('dialog', { name: 'Landkaart ophangen' });
  await sheet.getByLabel('Afbeelding').setInputFiles({ name: 'eiland.png', mimeType: 'image/png', buffer: await picture() });
  await sheet.getByLabel('Naam', { exact: true }).click();
  await page.keyboard.press('Control+a');
  await page.keyboard.type(`Volle kaart ${stamp}`);
  await sheet.getByLabel('Omschrijving').click();
  await page.keyboard.type('De kaart van de landmeter, met een omschrijving die op één regel hoort te blijven.');
  await sheet.getByRole('button', { name: 'Ophangen' }).click();
  await page.waitForURL('**/maps/**');
  await expect(page.getByRole('application')).toBeVisible();
  await page.waitForTimeout(500);

  await expectFillsTheScreen(page, '.map-stage');

  // The Keeper's own tools are still there — below the fold, under the map,
  // whatever they are called: the thing that follows the canvas starts off the
  // bottom of the screen and is scrolled to.
  const fold = await page.evaluate(() => {
    const next = document.querySelector('.page-canvas')?.nextElementSibling as HTMLElement | null;
    return next ? { top: next.getBoundingClientRect().top, screen: window.innerHeight } : null;
  });
  expect(fold).not.toBeNull();
  expect(fold!.top).toBeGreaterThan(fold!.screen * 0.9);

  await expectStandsUpSideways(page, '.map-stage');
});

test('a tijdlijn fills the screen', async ({ page }, info) => {
  test.setTimeout(120_000);
  const stamp = `${info.project.name}-${Date.now().toString(36)}`;
  const name = `Volle tijdlijn ${stamp}`;

  await signIn(page, ...KEEPER);
  await page.goto('/timelines');
  await page.getByRole('button', { name: /Nieuwe tijdlijn|Maak nieuwe tijdlijn/ }).first().click();
  const sheet = page.getByRole('dialog', { name: 'Nieuwe tijdlijn' });
  await sheet.getByLabel('Naam', { exact: true }).fill(name);
  await sheet.getByLabel('Dagen').check();
  await sheet.getByRole('button', { name: /Openbare tijdlijn|Tijdlijn aanmaken/ }).click();
  await page.waitForURL('**/timelines/**');
  await expect(page.getByTestId('timeline-stage')).toBeVisible();
  await page.waitForTimeout(500);

  await expectFillsTheScreen(page, '.timeline-stage');

  // The axis is drawn across the middle of what was *measured*, not of a
  // constant: it sits at the stage's own half-way line, wherever that is now.
  const stage = (await page.locator('.timeline-stage').boundingBox())!;
  const axis = (await page.locator('.timeline-axis').boundingBox())!;
  expect(Math.abs(axis.y - (stage.y + stage.height / 2))).toBeLessThan(4);

  await expectStandsUpSideways(page, '.timeline-stage');
});

/**
 * §66: and a stamboom, which is the fourth thing on the §34 shell.
 *
 * Measured empty on purpose: an empty tree is the hardest case for a stage that
 * is `flex: 1`, because there is nothing inside it to hold it open — a floor
 * that came from the cards rather than from the shell would pass with a tree
 * full of people and fail with the one somebody has only just made.
 */
test('een stamboom vult het scherm', async ({ page }, info) => {
  test.setTimeout(120_000);
  const stamp = `${info.project.name}-${Date.now().toString(36)}`;
  const name = `Volle stamboom ${stamp}`;

  await signIn(page, ...KEEPER);
  await page.goto('/stambomen');
  await page.getByRole('button', { name: /Nieuwe stamboom|Maak nieuwe stamboom/ }).first().click();
  const sheet = page.getByRole('dialog', { name: /Nieuwe stamboom/ });
  await sheet.getByLabel('Naam', { exact: true }).fill(name);
  await sheet.getByRole('button', { name: /Openbare stamboom|Stamboom aanmaken/ }).click();
  await page.waitForURL('**/stambomen/**');
  await expect(page.getByTestId('tree-stage')).toBeVisible();
  // The stage is measured by a ResizeObserver; give it the frame.
  await page.waitForTimeout(500);

  /*
   * §34/§66: the same 62 % as the landkaart and the tijdlijn, on a desk and on
   * a telephone both.
   *
   * It was 0.55 for a phone for one round, and the reason was two rows of
   * screen the stamboom was spending on itself: the name of the tree and the
   * dossier it hangs in were printed in the §34 head *and again* in a bar of
   * the canvas's own, and four buttons carrying their full names wrapped onto
   * two more rows under them. Both are gone — the heading *is* the name box
   * (`TreeTitle`), and below 600 px every toolbar button keeps its icon, its
   * `aria-label` and its `title` and drops only the letters — so the floor is
   * back where the other canvases stand.
   *
   * Measured after the repair: **614 px of 844 on a phone (73 %)** and 747 of
   * 900 on a desk (83 %). The floor is the shared 62 % rather than either of
   * those, because it is there to catch a *regression* in the shell, not to
   * pin the furniture of one page to the pixel.
   *
   * (The earlier number was 346 px, before the Keeper's tekenlaag switch was
   * moved below the fold — a third of a screen that only Keepers were losing.)
   */
  await expectFillsTheScreen(page, '.tree-stage');
  await expectStandsUpSideways(page, '.tree-stage');
});
