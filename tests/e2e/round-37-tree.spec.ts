import { expect, test, type Page } from '@playwright/test';
import { editCanvas, fillWhenReady, signIn } from './helpers';

/**
 * §73 — lezen en bewerken, op de stamboom.
 *
 * Nick, round 37: a canvas that has a camera and lives on a phone opens in
 * Lezen there and in Bewerken on a desk, and nothing is remembered. What this
 * asks of a stamboom is the part a person sees first:
 *
 *  - on a desk the switch stands at the start of the toolbar with `Bewerken`
 *    checked, and the controls that make and take back are there;
 *  - on a phone `Lezen` is checked, `Los kaartje` is not in the toolbar at all,
 *    and the heading is plain text — and one press on `Bewerken` brings both
 *    back.
 *
 * Written against CLAUDE.md §6: the radios are found by role with
 * `exact: true`, the fill on the sheet goes through `fillWhenReady`, and the
 * phone's first state is asserted with a web-first `expect` rather than read
 * once — the server draws every canvas as a desk, so a phone is in Bewerken for
 * the moment before it hydrates.
 */

const KEEPER = ['Keeper', 'abbeytower34'] as const;

/** A new stamboom from the shelf, left standing on it (`family-trees.spec.ts`'s road). */
async function newTree(page: Page, name: string) {
  await page.goto('/stambomen');
  await page.getByRole('button', { name: 'Nieuwe stamboom' }).click();
  const sheet = page.getByRole('dialog', { name: /Nieuwe stamboom/ });
  await expect(sheet).toBeVisible();
  await fillWhenReady(sheet.getByLabel('Naam', { exact: true }), name);
  await sheet.getByRole('button', { name: 'Openbare stamboom' }).click();
  await page.waitForURL('**/stambomen/**');
  await expect(page.getByTestId('tree-stage')).toBeVisible();
}

const modeRadio = (page: Page, name: 'Lezen' | 'Bewerken') =>
  page.getByTestId('tree-tools').getByTestId('canvas-mode').getByRole('radio', { name, exact: true });

test('§73: op een bureau opent de stamboom in Bewerken', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'dit gaat over een bureau');
  test.setTimeout(120_000);
  await signIn(page, ...KEEPER);
  await newTree(page, `Bureauboom ${Date.now().toString(36)}`);

  await expect(modeRadio(page, 'Bewerken')).toHaveAttribute('aria-checked', 'true');
  await expect(modeRadio(page, 'Lezen')).toHaveAttribute('aria-checked', 'false');
  await expect(page.getByRole('button', { name: 'Ongedaan maken' })).toBeVisible();
  await expect(page.getByTestId('tree-add-loose')).toBeVisible();
  // The heading is the name box, because renaming is editing and this is Bewerken.
  await expect(page.locator('#tree-name')).toBeVisible();
});

test('§73: op een telefoon opent de stamboom in Lezen, en Bewerken zet de gereedschappen terug', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'phone', 'dit gaat over 390 px');
  test.setTimeout(120_000);
  await signIn(page, ...KEEPER);
  const name = `Telefoonboom ${Date.now().toString(36)}`;
  await newTree(page, name);

  // Web-first: the page is a desk's for the beat before it hydrates.
  await expect(modeRadio(page, 'Lezen')).toHaveAttribute('aria-checked', 'true', { timeout: 15_000 });
  await expect(modeRadio(page, 'Bewerken')).toHaveAttribute('aria-checked', 'false');
  // Absent, not hidden: Lezen has no toolbar that makes anything.
  await expect(page.getByTestId('tree-add-loose')).toHaveCount(0);
  // §90: undo stays, grey — on all four canvases the same (it used to go with the group).
  await expect(page.getByRole('button', { name: 'Ongedaan maken' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Ongedaan maken' })).toBeDisabled();
  // And the heading is text, not a box a thumb can land in.
  await expect(page.locator('#tree-name')).toHaveCount(0);
  await expect(page.getByTestId('family-tree-title')).toContainText(name);
  // The empty stage does not advertise a gesture Lezen will not answer.
  await expect(page.locator('.tree-empty')).toContainText('Kies Bewerken');

  await editCanvas(page);
  await expect(modeRadio(page, 'Bewerken')).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByTestId('tree-add-loose')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Ongedaan maken' })).toBeVisible();
  await expect(page.locator('#tree-name')).toHaveValue(name);
});
