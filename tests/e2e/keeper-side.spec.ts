import { expect, test, type Page } from '@playwright/test';
import { fillWhenReady, newEntryButton, signIn, signUp } from './helpers';

/**
 * §44: de Keeperkant — the second side of the archive.
 *
 * Four things, in the order a Keeper meets them:
 *
 *  1. An artikel gets a Keeperversie with one button. The new page is the
 *     Keeper's own — it wears the stamp — and the switch on either face goes
 *     straight to the other.
 *  2. The notes are **one text**: typed on the Keeper's face, read on the
 *     player-facing one, because both pages address the pair's Keeper side.
 *  3. A player is told nothing. The twin is a 404 at its own address, `/keeper`
 *     sets them nothing and drops them on the ordinary Start page (§46), and
 *     neither the switch nor the panel is anywhere in their page — not hidden,
 *     absent.
 *  4. "Kijk als speler" makes a Keeper a player everywhere, and the banner in
 *     the shell is the way back — which is why it is not on the page that
 *     refuses to render.
 *
 * Written against §6's list of the mistakes that cost past rounds a re-run:
 * `?new=1` lands on the editing face, so the name is asserted with
 * `toHaveValue` on `#entry-name` and never as a heading; a page that has just
 * navigated is not yet listening, so every fill goes through `fillWhenReady`;
 * and the rope picker is scoped to the panel, which is the only place its rows
 * live (it has no "… aanmaken" row at all, so nothing can match the create row
 * first).
 */

const KEEPER = ['Keeper', 'abbeytower34'] as const;
const PASSWORD = 'onderzeeboot';

/** A fresh artikel, made the way a person makes one, left on its editing face. */
async function newArticle(page: Page, name: string): Promise<string> {
  const before = page.url();
  await newEntryButton(page).click();
  const sheet = page.getByRole('dialog', { name: 'Nieuw artikel' });
  await sheet.getByRole('radio', { name: 'Locaties', exact: true }).click();
  await fillWhenReady(sheet.getByLabel('Naam', { exact: true }), name);
  await sheet.getByRole('button', { name: 'Aanmaken' }).click();
  // §6: standing on an artikel already satisfies `**/e/**`, so wait for the
  // address to *change* rather than for the shape of it.
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

test.describe('§44 de Keeperkant', () => {
  test('een artikel krijgt een Keeperversie, en die deelt één tekst', async ({ page }) => {
    await signIn(page, ...KEEPER);
    const playerUrl = await newArticle(page, 'De pastorie');

    // 1. The player-facing page has no Keeper side yet, so the button offers
    //    to make one; pressing it lands on the new face.
    let panel = await openPanel(page);
    await expect(panel.getByTestId('keeper-switch-make')).toBeVisible();
    await panel.getByTestId('keeper-switch-make').click();
    await expect.poll(() => page.url(), { timeout: 20_000 }).not.toBe(playerUrl);
    const keeperUrl = page.url();

    // The Keeper's own face says so before any colour has loaded.
    await expect(page.getByTestId('keeper-stamp')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'De pastorie', level: 1 })).toBeVisible();

    // 2. The notes, typed here.
    panel = await openPanel(page);
    await expect(panel.getByTestId('keeper-notes-shared')).toBeVisible();
    await fillWhenReady(panel.getByTestId('keeper-notes'), 'De pastoor liegt over de sleutel.');
    // Round 18's known race: the room is seeded a beat after it opens, so give
    // the last keystrokes a moment to reach the server before leaving.
    await page.waitForTimeout(1200);

    // 3. …and read on the other face, which shares the row.
    await page.goto(playerUrl);
    panel = await openPanel(page);
    await expect(panel.getByTestId('keeper-notes')).toHaveValue('De pastoor liegt over de sleutel.');
    // And the switch here now points at the Keeper's face rather than offering
    // to make a second one.
    await expect(panel.getByTestId('keeper-switch-make')).toHaveCount(0);
    await panel.getByTestId('keeper-switch-link').click();
    await expect.poll(() => page.url(), { timeout: 20_000 }).toBe(keeperUrl);
  });

  test('een touwtje verschijnt aan beide kanten', async ({ page }) => {
    await signIn(page, ...KEEPER);
    await newArticle(page, 'De veerman');
    const ropeUrl = page.url();
    await newArticle(page, 'Het complot');

    // Make "Het complot" the Keeper's own, so it may be a rope's Keeper end.
    let panel = await openPanel(page);
    await panel.getByTestId('keeper-side-toggle').check();
    await expect(page.getByTestId('keeper-stamp')).toBeVisible({ timeout: 20_000 });

    panel = await openPanel(page);
    await panel.locator('.keeper-tie-picker input').fill('De veerman');
    const row = panel.locator('.suggest-item').filter({ hasText: 'De veerman' }).first();
    await expect(row).toBeVisible({ timeout: 20_000 });
    await row.click();
    await expect(panel.getByTestId('keeper-ropes')).toContainText('De veerman', { timeout: 20_000 });

    // The other end knows about it too — a tie is read from both directions.
    await page.goto(ropeUrl);
    panel = await openPanel(page);
    await expect(panel.getByTestId('keeper-ropes')).toContainText('Het complot');
    // And it is in the popover beside the switch.
    await panel.getByTestId('keeper-ropes-button').click();
    await expect(page.getByRole('menu', { name: 'Touwtjes' })).toContainText('Het complot');
    await page.keyboard.press('Escape');
    await expect(page.getByRole('menu', { name: 'Touwtjes' })).toHaveCount(0);

    /*
     * §46: there is no Keeperkant *list* any more — the whole archive is the
     * list, read from one side at a time. So the same two artikelen are the
     * proof, on the ordinary wiki: on the Keeper's side only "Het complot" is
     * there, on the players' side only "De veerman".
     */
    await page.goto('/api/keeper/flip?side=keeper&to=/wiki');
    const grid = page.locator('.card-grid');
    await expect(grid).toContainText('Het complot', { timeout: 20_000 });
    expect(await grid.innerText()).not.toContain('De veerman');

    await page.goto('/api/keeper/flip?side=player&to=/wiki');
    await expect(grid).toContainText('De veerman', { timeout: 20_000 });
    expect(await grid.innerText()).not.toContain('Het complot');
  });

  test('een speler wordt niets verteld', async ({ page, browser }, testInfo) => {
    await signIn(page, ...KEEPER);
    await newArticle(page, 'De kelder');
    const playerUrl = page.url();
    const panel = await openPanel(page);
    await panel.getByTestId('keeper-switch-make').click();
    await expect.poll(() => page.url(), { timeout: 20_000 }).not.toBe(playerUrl);
    const keeperUrl = page.url();

    const context = await browser.newContext();
    const player = await context.newPage();
    // §6: desktop and phone run the same spec against one archive, so a fixed
    // name signs up once and fails the second time — with a timeout on the
    // redirect, which reads like anything but "that account exists".
    await signUp(player, `Aagje ${testInfo.project.name}${Date.now().toString(36)}`, PASSWORD);

    // The Keeper's face is not there at all — a 404, not a locked door.
    await player.goto(keeperUrl);
    await expect(player.getByRole('heading', { name: 'Deze pagina is er niet.' })).toBeVisible();

    // §46: de Keeperkant is a door now, not a page. For a player it sets
    // nothing at all and simply puts them down on the Start of the archive —
    // no stamp, no toggle, no word about a second side existing.
    await player.goto('/keeper');
    await expect(player).toHaveURL(/\/$/);
    await expect(player.getByTestId('keeper-stamp')).toHaveCount(0);
    await expect(player.getByTestId('side-toggle')).toHaveCount(0);

    // And on the page they *may* read, nothing keeper-only is in the HTML —
    // not hidden, absent.
    await player.goto(playerUrl);
    await expect(player.locator('#entry-name, h1').first()).toBeVisible();
    await expect(player.getByTestId('keeper-panel')).toHaveCount(0);
    await expect(player.getByTestId('keeper-switch')).toHaveCount(0);
    // The twin carries the same name, so the tell is the address: the player's
    // page must not link to it anywhere.
    expect(await player.content()).not.toContain(new URL(keeperUrl).pathname);
    await context.close();
  });

  test('kijk als speler, en de weg terug', async ({ page }) => {
    await signIn(page, ...KEEPER);
    // The way in is a link in the side menu, which a phone does not have; the
    // address it points at is the same on both, and it is the address a Keeper
    // who has lost the menu has to be able to reach.
    await page.goto('/api/keeper/as-player?on=1&to=/');
    await expect(page.getByTestId('as-player-banner')).toBeVisible();

    // A player everywhere, including on the door to the Keeper's side, which
    // sets nothing for them and lands on the ordinary Start page (§46).
    await page.goto('/keeper');
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByTestId('as-player-banner')).toBeVisible();
    await expect(page.getByTestId('side-toggle')).toHaveCount(0);
    await page.goto('/admin');
    await expect(page.getByTestId('as-player-banner')).toBeVisible();

    // The banner is the way back, from the page that refused to render.
    await page.getByTestId('as-player-stop').click();
    await expect(page.getByTestId('as-player-banner')).toHaveCount(0);
    // §46: and the Keeper's own pages are theirs again. Beheer is the one that
    // refused to render a moment ago.
    await page.goto('/admin');
    await expect(page.getByRole('heading', { name: 'Beheer', level: 1 })).toBeVisible();
  });

  /**
   * §46: de spiegel. One button in the corner of the screen turns the whole
   * archive over — the cookie, the colours, and the word under the masthead.
   *
   * Reduced motion is emulated on purpose: with it on, `SideToggle` starts no
   * view transition at all, so the assertions below race nothing. The flip
   * itself is asserted three ways, because any one of them alone could pass
   * for the wrong reason: the button's own `data-side-now`, the stamp in the
   * masthead, and the colour the body is actually painted.
   */
  test('de spiegel klapt om', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await signIn(page, ...KEEPER);

    // A list: no twin, no `data-flip-to`, so the flip stays on this address
    // and only changes the side it is read from.
    await page.goto('/wiki');
    const toggle = page.getByTestId('side-toggle');
    await expect(toggle).toHaveAttribute('data-side-now', 'player');
    const paper = () => page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    const playerPaper = await paper();

    await toggle.click();
    await expect(toggle).toHaveAttribute('data-side-now', 'keeper', { timeout: 20_000 });

    // The masthead says so — on a desk. The name block lives in the side menu,
    // which a phone does not have at all, so there it is asserted as present
    // in the page rather than as visible on it.
    const stamp = page.getByTestId('masthead-side');
    if (await page.locator('.sidenav').isVisible()) await expect(stamp).toBeVisible();
    else await expect(stamp).toHaveCount(1);

    // And the paint followed the cookie.
    await expect.poll(paper, { timeout: 20_000 }).not.toBe(playerPaper);

    // §46: `k` is the same button. The focus after the click above is the
    // button itself, which is not a field, so `UiProvider`'s guard lets it by.
    await page.keyboard.press('k');
    await expect(toggle).toHaveAttribute('data-side-now', 'player', { timeout: 20_000 });
    await expect(page.getByTestId('masthead-side')).toHaveCount(0);
  });
});
