import { expect, test, type Page } from '@playwright/test';
import { editCanvas, fillWhenReady, signIn } from './helpers';

/**
 * Ronde 36: "Je kunt geen stambomen verwijderen."
 *
 * A stamboom had the whole road into the bin — `DELETE /api/family-trees/[id]`,
 * `softDeleteFamilyTree`, a `family_tree` row in `lib/admin/trash.ts` that
 * lists, restores and destroys — and no door. Every other container has one: a
 * dossier and an artikel have a folded `<details>` at the foot of the page, a
 * prikbord has "weggooien" in its toolbar, een tijdlijn has it in Instellingen
 * and a landkaart in the Keeper's block. The stamboom had nothing, which is
 * exactly what was reported.
 *
 * So this walks the door that was missing, end to end and from both sides:
 *
 *  1. A stamboom is made from the shelf.
 *  2. Its page carries the lade — folded, below the canvas, so §34's "the stage
 *     gets the screen" is untouched.
 *  3. Pressing it lands on the shelf and the tree is gone from it.
 *  4. A Keeper finds it in Beheer → Prullenbak, as a **Stamboom**, and puts it
 *     back — and it is on the shelf again.
 *
 * Written against CLAUDE.md §6: the Keeper signs in with `signIn`, the name of
 * a stamboom is the §34 heading *box* so it is read with `toHaveValue` and not
 * with a heading role, every `fill` on a page that has just arrived goes
 * through `fillWhenReady`, and the shelf is asked inside `getByRole('main')`
 * so the side menu cannot answer for it.
 */

const KEEPER = ['Keeper', 'abbeytower34'] as const;

/** A new stamboom from the shelf, left standing on it. Returns its address. */
async function newTree(page: Page, name: string) {
  await page.goto('/stambomen');
  await page.getByRole('button', { name: 'Nieuwe stamboom' }).click();
  const sheet = page.getByRole('dialog', { name: /Nieuwe stamboom/ });
  await expect(sheet).toBeVisible();
  await fillWhenReady(sheet.getByLabel('Naam', { exact: true }), name);
  await sheet.getByRole('button', { name: 'Openbare stamboom' }).click();
  await page.waitForURL('**/stambomen/**');
  // §73: on a phone the heading is only a box in Bewerken.
  await expect(async () => {
    await editCanvas(page);
    await expect(page.getByTestId('tree-add-loose')).toBeVisible({ timeout: 1500 });
  }).toPass({ timeout: 20_000 });
  await expect(page.locator('#tree-name')).toHaveValue(name);
  await expect(page.getByTestId('tree-stage')).toBeVisible();
  return page.url();
}

test('een stamboom gaat naar de prullenbak en komt er weer uit', async ({ page }) => {
  await signIn(page, ...KEEPER);
  const name = `Bin ${Date.now()}`;
  await newTree(page, name);

  /*
   * The lade is folded — weggooien is nothing anybody presses by accident —
   * and it stands *under* the canvas, not in it. Opening it is the deliberate
   * act; the button behind it is the second.
   */
  const bin = page.getByTestId('tree-bin');
  await expect(bin).toBeVisible();
  await expect(bin).toHaveJSProperty('open', false);
  await bin.locator('summary').click();
  await expect(bin).toHaveJSProperty('open', true);

  await bin.getByTestId('tree-bin-button').click();
  await page.waitForURL('**/stambomen');
  await expect(page.getByRole('main').getByText(name)).toHaveCount(0);

  // And the Keeper digs it up again. Its row says what it is, because a bin
  // that does not name the kind of thing is a bin nobody dares empty.
  await page.goto('/admin');
  await page.getByRole('tab', { name: /Prullenbak/ }).click();
  const row = page.locator('li').filter({ hasText: name }).first();
  await expect(row).toBeVisible();
  await expect(row).toContainText('Stamboom');
  await row.getByRole('button', { name: 'Terugzetten' }).click();

  await page.goto('/stambomen');
  await expect(page.getByRole('main').getByText(name).first()).toBeVisible();
});

test('de lade staat onder het tekenvlak, niet erin', async ({ page }) => {
  await signIn(page, ...KEEPER);
  await newTree(page, `Bin onder ${Date.now()}`);

  /*
   * §34: de tekening krijgt het scherm. A folded `<details>` inside
   * `.page-canvas` would take its height off the stage — which is the bug
   * `#tree-underfold` exists to avoid for the tekenlaag switch, and the same
   * one this lade would have brought back. So it is asserted structurally:
   * the lade is on the page and it is *not* a descendant of the canvas column.
   */
  const bin = page.getByTestId('tree-bin');
  await expect(bin).toBeVisible();
  await expect(page.locator('.page-canvas [data-testid="tree-bin"]')).toHaveCount(0);
});
