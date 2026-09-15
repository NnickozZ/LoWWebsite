import { expect, test } from '@playwright/test';
import { signIn } from './helpers';

/**
 * Round 36: a dossier's tab row wraps instead of scrolling sideways.
 *
 * With every soort given a shelf (§30's "Tabbladen") there are more than twenty
 * tabs, which on any screen is more than one line. Before this round the row
 * grew a horizontal scrollbar and the shelves past the edge were behind a drag;
 * now the row takes a second and a third line and nothing is hidden.
 *
 * The look of a wrapped file-tab is CSS and a spec cannot judge it. What a spec
 * can say is that nothing sits outside the row: no horizontal overflow, and
 * every tab's right edge inside the row's own box.
 */
test('the dossier tab row wraps rather than scrolling', async ({ page }, testInfo) => {
  // §7: below the phone breakpoint a dossier has no tablist at all — the same
  // sections are stacked under a `.jump-menu` of chips, which is untouched.
  test.skip(testInfo.project.name !== 'desktop', 'the tab row is the desktop layout');

  const stamp = `${testInfo.project.name}-${Date.now().toString(36)}`;
  await signIn(page, 'Keeper', 'abbeytower34');

  await page.goto('/cases');
  await page.getByRole('button', { name: 'Dossier openen' }).click();
  const sheet = page.getByRole('dialog', { name: 'Dossier openen' });
  await sheet.getByLabel('Naam', { exact: true }).fill(`Volle kast ${stamp}`);
  await sheet.getByRole('button', { name: 'Openen', exact: true }).click();
  await page.waitForURL('**/c/**');

  // -- give every soort a shelf ---------------------------------------------
  await page.getByRole('button', { name: /^Tabbladen:/ }).click();
  const tabsSheet = page.getByRole('dialog');
  await expect(tabsSheet.getByRole('heading', { name: /Welke soorten/ })).toBeVisible();

  const soorten = tabsSheet.getByRole('group').getByRole('button');
  const count = await soorten.count();
  expect(count).toBeGreaterThan(8);
  for (let index = 0; index < count; index += 1) {
    const chip = soorten.nth(index);
    // Each tick is its own PATCH and the chips are disabled while it is in
    // flight; `click()` waits for enabled, and the tick itself is the proof it
    // landed — the list comes back from the server after every save (§21).
    await chip.click();
    await expect(chip).toHaveAttribute('aria-pressed', 'true');
  }
  await page.keyboard.press('Escape');
  await expect(tabsSheet).toBeHidden();

  // -- the row wraps ---------------------------------------------------------
  const tablist = page.getByRole('tablist', { name: 'Onderdelen van het dossier' });
  const tabs = tablist.getByRole('tab');
  await expect(tabs.first()).toBeVisible();
  /*
   * §6: the ticks are saved, but the *tabs* arrive with the RSC payload that
   * follows, and this assertion must wait for them rather than read the count
   * once. Reading it once is exactly how this spec failed under `E2E_DEV=1`:
   * the sheet said "Tabbladen: 17" while the row still held only the five fixed
   * tabs, because a dev build was still compiling the page underneath it. A
   * production build lands fast enough to hide the race, which is the worst
   * kind of green.
   *
   * Overzicht, Prikbord, Tijdlijn, Stamboom and Activiteit on top of the
   * soorten — minus one, because Personen merges karakter and onderzoeker.
   */
  await expect
    .poll(() => tabs.count(), { message: 'de soort-tabbladen zijn nog niet geland' })
    .toBeGreaterThan(count);

  // And the measurement waits for the layout to settle with them on it.
  await expect(async () => {
    const overflow = await tablist.evaluate(
      (element) => element.scrollWidth - element.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
  }).toPass();

  const row = await tablist.boundingBox();
  expect(row).not.toBeNull();
  for (let index = 0; index < (await tabs.count()); index += 1) {
    const tab = tabs.nth(index);
    await expect(tab).toBeVisible();
    const box = await tab.boundingBox();
    expect(box).not.toBeNull();
    // Inside the row on both axes: a tab past the right edge would be the
    // scrollbar coming back, one past the bottom would be a row that did not
    // grow with its lines.
    expect(box!.x + box!.width).toBeLessThanOrEqual(row!.x + row!.width + 1);
    expect(box!.y + box!.height).toBeLessThanOrEqual(row!.y + row!.height + 2);
  }
});
