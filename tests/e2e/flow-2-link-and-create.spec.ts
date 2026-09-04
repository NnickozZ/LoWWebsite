import { expect, test } from '@playwright/test';
import { signIn } from './helpers';

/**
 * Golden flow 2 (§15): while editing an entry body, type `@Harbourm`, choose
 * "Create 'Harbourmaster'", create it from the sheet, and see the chip link
 * inserted. Open it; the original entry appears under "Mentioned in".
 */
test('link and create in one motion', async ({ page }, testInfo) => {
  const target = `Harbourmaster ${testInfo.project.name} ${Date.now().toString(36)}`;
  const typed = 'Harbourma';

  await signIn(page, 'Keeper', 'abbeytower34');
  await page.goto('/e/middelburg');

  const body = page.locator('.ProseMirror');
  await body.click();
  await page.keyboard.press('End');
  await page.keyboard.type(' Ask the ');
  await page.keyboard.type(`@${typed}`);

  // The last item of the autocomplete is always "Create '<typed>'".
  const createOption = page.getByRole('option', { name: /aanmaken$/ });
  await expect(createOption).toBeVisible();
  await createOption.click();

  const sheet = page.getByRole('dialog', { name: 'Nieuwe fiche' });
  await expect(sheet).toBeVisible();
  await expect(sheet.getByLabel('Naam')).toHaveValue(typed);
  await sheet.getByLabel('Naam').fill(target);
  await sheet.getByRole('radio', { name: 'Personages' }).click();
  await sheet.getByRole('button', { name: 'Aanmaken' }).click();

  // Back in the body, with the chip inserted.
  await expect(sheet).toBeHidden();
  const chip = body.locator('.entry-chip', { hasText: target });
  await expect(chip).toBeVisible();

  // Autosave, then the backlink is real.
  await expect(page.locator('.save-state')).toHaveText('Opgeslagen', { timeout: 15_000 });

  await chip.click();
  await page.waitForURL('**/e/**');
  await expect(page.getByLabel('Naam')).toHaveValue(target);

  const mentioned = page.locator('details.section', {
    has: page.locator('summary', { hasText: 'Genoemd in' }),
  });
  await mentioned.locator('summary').click();
  await expect(mentioned.getByRole('link', { name: /Middelburg/ })).toBeVisible();
});
