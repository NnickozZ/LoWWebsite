import { expect, test } from '@playwright/test';
import { signIn } from './helpers';

/**
 * §11's two new powers, end to end.
 *
 * The page builder — a soort fiche decides what a page of that soort is made
 * of, including lists that fill themselves out of other fiches' fields — and
 * the word list, where the Keeper renames the things the archive keeps saying.
 *
 * The seed gives Facties a worked example ("Leden", every Personage whose
 * *Factie* points here), so the first test proves that example works without
 * anyone configuring anything; the second builds a block from scratch through
 * the editor; the third renames a word and watches the whole shell follow.
 */

test.describe.configure({ mode: 'serial' });

test('a self-filling list fills itself from a field on another fiche', async ({ page }) => {
  // Both viewports share one archive and run one after the other, so this may
  // find the link the desktop run already made. Clearing it first is what makes
  // the test say the same thing twice.
  await signIn(page, 'Keeper', 'abbeytower34');

  // Point a Personage at a Factie, using the field the seeded block follows.
  await page.goto('/wiki/character');
  await page.getByRole('link', { name: /Doktor Gerhard Lang/ }).first().click();
  await page.waitForURL('**/e/**');

  await page.locator('summary', { hasText: 'Meer toevoegen' }).click();
  // An entry_link field's picker has no id of its own, so the field is found by
  // the label that names it rather than by getByLabel.
  const faction = page.locator('div:has(> label[for="field-faction"])');
  const clear = faction.getByRole('button', { name: 'Wissen' });
  if (await clear.count()) await clear.click();
  await faction.getByRole('textbox').first().fill('Ahnenerbe');
  await faction.locator('.suggest-item', { hasText: 'The Ahnenerbe Party' }).first().click();
  await expect(page.locator('.save-state')).toHaveText('Opgeslagen', { timeout: 15_000 });

  // Nobody typed him into a list. The faction's page knows anyway.
  await page.goto('/wiki/faction');
  await page.getByRole('link', { name: /The Ahnenerbe Party/ }).first().click();
  await page.waitForURL('**/e/**');

  const members = page.locator('details.section', { hasText: 'Leden' }).first();
  await expect(members).toBeVisible();
  await expect(members).toContainText('Doktor Gerhard Lang');
});

test('the Keeper adds a list of their own to every page of a soort', async ({ page }, testInfo) => {
  // Named per viewport so the second run builds its own block rather than
  // finding the first run's and asserting nothing.
  const title = `Rivalen ${testInfo.project.name}`;

  await signIn(page, 'Keeper', 'abbeytower34');
  await page.goto('/admin');
  await page.getByRole('tab', { name: 'Soorten fiches' }).click();

  const editor = page
    .locator('details.admin-type')
    .filter({ has: page.locator('summary', { hasText: 'Facties' }) });
  await editor.locator('summary').click();

  await editor.getByRole('button', { name: 'Lijst die je zelf vult' }).click();
  // A new list lands above the built-in tail, so the last row on screen is the
  // history block, not the one just added. Pick it out by what kind it is.
  const block = editor.locator('.admin-block', { hasText: 'Eigen lijst' }).last();
  await block.getByRole('textbox').first().fill(title);
  await editor.getByRole('button', { name: 'Opslaan', exact: true }).click();
  await expect(editor.getByText('Opgeslagen.')).toBeVisible();

  // It is on the page, and what is filed in it stays filed.
  await page.goto('/wiki/faction');
  await page.getByRole('link', { name: /De Schorre/ }).first().click();
  await page.waitForURL('**/e/**');

  const key = `lijst_rivalen_${testInfo.project.name}`;
  const rivals = page.locator('details.section', { hasText: title }).first();
  await expect(rivals).toBeVisible();
  await rivals.locator('summary').click();
  const picker = rivals.locator(`div:has(> label[for="field-${key}"])`);
  await picker.getByRole('textbox').first().fill('Ahnenerbe');
  await picker.locator('.suggest-item', { hasText: 'The Ahnenerbe Party' }).first().click();
  await expect(page.locator('.save-state')).toHaveText('Opgeslagen', { timeout: 15_000 });

  await page.reload();
  await expect(page.locator('details.section', { hasText: title }).first()).toContainText(
    'The Ahnenerbe Party',
  );
});

test('renaming a word renames it everywhere, and clearing the box puts it back', async ({
  page,
}) => {
  await signIn(page, 'Keeper', 'abbeytower34');
  await page.goto('/admin');
  await page.getByRole('tab', { name: 'Woorden' }).click();

  await page.getByLabel('Prikborden', { exact: true }).fill('Muren');
  await page.getByRole('button', { name: 'Opslaan', exact: true }).click();

  // The sidebar on a desktop, the strip along the bottom on a phone: one word,
  // both menus.
  const nav = page.locator('.sidenav, .tabs');
  await expect(nav.getByRole('link', { name: 'Muren' }).first()).toBeVisible();
  await expect(page.getByRole('link', { name: 'Prikborden' })).toHaveCount(0);

  // An empty box means "the default", so this is also how a word is undone.
  await page.goto('/admin');
  await page.getByRole('tab', { name: 'Woorden' }).click();
  await page.getByLabel('Prikborden', { exact: true }).fill('');
  await page.getByRole('button', { name: 'Opslaan', exact: true }).click();
  await expect(nav.getByRole('link', { name: 'Prikborden' }).first()).toBeVisible();
});
