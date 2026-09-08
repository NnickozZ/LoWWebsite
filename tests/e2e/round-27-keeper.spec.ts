import { expect, test, type Page } from '@playwright/test';
import { fillWhenReady, newEntryButton, signIn } from './helpers';

/**
 * Round 27, the two things a person can only see by looking:
 *
 *  1. §53 — a Keeper page and a player page that both already exist are linked
 *     into a tweeling from the Keeperkant block, and the switch at the top of
 *     that block then jumps between the two. This is the way the tool is
 *     actually used: the Keeper preps on their own side while the table
 *     wiki's on theirs, and the two faces meet afterwards.
 *  2. The kebab menu on a card in a dossier is readable. It used to be an
 *     absolutely positioned child of `.card`, which is `overflow: hidden`, so
 *     "Dossiernotitie toevoegen" was cut off by the card it hung in.
 *
 * §6's lessons: every fill goes through `fillWhenReady`, an artikel made with
 * `?new=1` is asserted with `toHaveValue` on `#entry-name` rather than as a
 * heading, and a navigation is waited for by the address *changing*.
 */

const KEEPER = ['Keeper', 'abbeytower34'] as const;

/** A fresh artikel, made the way a person makes one. Returns its address. */
async function newArticle(page: Page, name: string): Promise<string> {
  const before = page.url();
  await newEntryButton(page).click();
  const sheet = page.getByRole('dialog', { name: 'Nieuw artikel' });
  await sheet.getByRole('radio', { name: 'Locaties', exact: true }).click();
  await fillWhenReady(sheet.getByLabel('Naam', { exact: true }), name);
  await sheet.getByRole('button', { name: 'Aanmaken' }).click();
  await expect.poll(() => page.url(), { timeout: 20_000 }).not.toBe(before);
  await expect(page.locator('#entry-name')).toHaveValue(name);
  return page.url();
}

/** Open the Keeperkant block at the foot of whatever page we are on. */
async function openPanel(page: Page) {
  const panel = page.getByTestId('keeper-panel');
  await panel.scrollIntoViewIfNeeded();
  if ((await panel.getAttribute('open')) === null) await panel.locator('summary').click();
  await expect(panel.getByTestId('keeper-switch')).toBeVisible();
  return panel;
}

test('§53 twee bestaande pagina’s worden één tweeling, en de knop springt heen en weer', async ({
  page,
}, testInfo) => {
  const stamp = `${testInfo.project.name}-${Date.now().toString(36)}`;
  const playerName = `De veerhaven ${stamp}`;
  const keeperName = `De veerhaven Keeper ${stamp}`;

  await signIn(page, ...KEEPER);

  // Two pages that know nothing of each other: one for the table…
  const playerUrl = await newArticle(page, playerName);
  // …and one the Keeper prepped, moved to their own side with the toggle.
  const keeperUrl = await newArticle(page, keeperName);
  let panel = await openPanel(page);
  await panel.getByTestId('keeper-side-toggle').check();
  await expect(page.getByTestId('keeper-stamp')).toBeVisible({ timeout: 20_000 });

  // Back on the player-facing page: no other face yet, so both roads are there.
  await page.goto(playerUrl);
  panel = await openPanel(page);
  await expect(panel.getByTestId('keeper-switch-make')).toBeVisible();
  await panel.getByTestId('keeper-twin-link').click();

  const picker = panel.getByTestId('keeper-twin-picker');
  await fillWhenReady(picker.getByRole('textbox'), keeperName);
  const option = picker.locator('.suggest-item').filter({ hasText: keeperName }).first();
  await expect(option).toBeVisible({ timeout: 20_000 });
  await option.click();

  // It asks first: a tweeling makes one text out of two.
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Koppelen', exact: true })
    .click();

  // The switch is now a link across, and pressing it lands on the other face.
  panel = await openPanel(page);
  await expect(panel.getByTestId('keeper-switch-make')).toHaveCount(0);
  await expect(panel.getByTestId('keeper-notes-shared')).toBeVisible();
  await panel.getByTestId('keeper-switch-link').click();
  await expect.poll(() => page.url(), { timeout: 20_000 }).not.toBe(playerUrl);
  // The reading face this time — the switch is a link, not `?new=1`.
  await expect(page.getByRole('heading', { name: keeperName, level: 1 })).toBeVisible();
  expect(new URL(page.url()).pathname).toBe(new URL(keeperUrl).pathname);

  // …and back again, from the Keeper's own page.
  panel = await openPanel(page);
  await panel.getByTestId('keeper-switch-link').click();
  await expect(page.getByRole('heading', { name: playerName, level: 1 })).toBeVisible();

  // Ontkoppelen puts the two back the way they were, both still standing.
  panel = await openPanel(page);
  await panel.getByTestId('keeper-twin-untie').click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Ontkoppelen', exact: true })
    .click();
  panel = await openPanel(page);
  await expect(panel.getByTestId('keeper-switch-make')).toBeVisible({ timeout: 20_000 });
  await page.goto(keeperUrl);
  await expect(page.locator('#entry-name')).toHaveValue(keeperName);
});

test('het kebabmenu op een dossierkaart valt niet meer achter de kaart weg', async ({
  page,
}, testInfo) => {
  const stamp = `${testInfo.project.name}-${Date.now().toString(36)}`;
  const caseName = `De veerpont ${stamp}`;

  await signIn(page, ...KEEPER);
  await page.goto('/cases');
  await page.getByRole('button', { name: 'Dossier openen' }).click();
  const sheet = page.getByRole('dialog', { name: 'Dossier openen' });
  await fillWhenReady(sheet.getByLabel('Naam', { exact: true }), caseName);
  await sheet.getByRole('button', { name: 'Openen', exact: true }).click();
  await page.waitForURL('**/c/**');

  // One artikel on a card, from the fixture the whole suite shares.
  const box = page.getByLabel('Voeg iets toe aan dit dossier…');
  await fillWhenReady(box, 'Pier Boone');
  const option = page
    .locator('.suggest-item')
    .filter({ hasText: 'Pier Boone' })
    .filter({ hasNotText: 'aanmaken' })
    .first();
  await expect(option).toBeVisible({ timeout: 20_000 });
  await option.click();

  const card = page.locator('.card', { hasText: 'Pier Boone' }).first();
  await card.getByTestId('case-entry-kebab').click();

  const menu = page.getByTestId('case-entry-menu');
  await expect(menu).toBeVisible();

  // Out of the card: it hangs from the body, so the card's `overflow: hidden`
  // (which is holding a zoomed cover crop in) cannot cut it.
  await expect(page.locator('.card [data-testid="case-entry-menu"]')).toHaveCount(0);

  // Readable: the longest row fits inside the menu, and the menu inside the
  // window. Both of those were false when it was 190 px in a 150 px column.
  const item = menu.getByRole('menuitem', { name: /Dossiernotitie/ });
  await expect(item).toBeVisible();
  const overflow = await item.evaluate((el) => el.scrollWidth - el.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);

  const box2 = await menu.boundingBox();
  const view = page.viewportSize();
  expect(box2).not.toBeNull();
  expect(box2!.width).toBeGreaterThanOrEqual(200);
  expect(box2!.x).toBeGreaterThanOrEqual(0);
  if (view) expect(box2!.x + box2!.width).toBeLessThanOrEqual(view.width + 1);

  // And Escape closes it, like every other menu in the app.
  await page.keyboard.press('Escape');
  await expect(menu).toHaveCount(0);
});
