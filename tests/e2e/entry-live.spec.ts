import { expect, test, type Page } from '@playwright/test';
import { editArticle, inviteCode, signIn } from './helpers';

/**
 * §20: two people in one fiche's text.
 *
 * Everything is asserted on a second browser that is never reloaded — a
 * reload would pass whether or not any of this works. The text has to arrive
 * as it is typed, the other person's caret has to be in it, the archive has to
 * hold the result, and someone who may only look has to get exactly that.
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

/** The fiche's main text: the first editor on the page. */
const body = (page: Page) => page.locator('.editor-body .prose').first();

test('what one person types, the other sees as it is typed — and it is saved', async ({ page, browser }, info) => {
  test.setTimeout(150_000);
  const stamp = `${info.project.name}-${Date.now().toString(36)}`;

  await signIn(page, 'Keeper', 'abbeytower34');
  const path = await newEntry(page, `Logboek ${stamp}`);
  await expect(page.locator('.live-dot-live')).toBeVisible({ timeout: 15_000 });

  const otherCtx = await browser.newContext();
  const other = await otherCtx.newPage();
  await signUpAs(other, `Aagje ${stamp}`);
  await other.goto(path);
  // §22: a player lands on the reading face, where the text is live but has no
  // caret. This test is about two people typing, so ask for the other face.
  await editArticle(other);
  await expect(other.locator('.live-dot-live')).toBeVisible({ timeout: 15_000 });

  // Both see each other on the strip.
  await expect(page.locator('.board-person')).toHaveCount(1, { timeout: 10_000 });
  await expect(other.locator('.board-person')).toHaveCount(1, { timeout: 10_000 });

  // The Keeper types; the player watches it appear, never reloading.
  await body(page).click();
  await page.keyboard.type('De storm kwam om drie uur.');
  await expect(body(other)).toContainText('De storm kwam om drie uur.', { timeout: 5000 });
  // …with the Keeper's caret in the text.
  await expect(other.locator('.collaboration-cursor__label')).toHaveText('Keeper', { timeout: 5000 });

  // The player types in the same paragraph; both end up with the same text.
  await body(other).click();
  await other.keyboard.press('End');
  await other.keyboard.type(' Niemand zag het aankomen.');
  await expect(body(page)).toContainText('De storm kwam om drie uur. Niemand zag het aankomen.', { timeout: 5000 });
  await expect(page.locator('.collaboration-cursor__label')).toHaveText(new RegExp(`Aagje ${stamp}`), { timeout: 5000 });

  // The archive holds it: a fresh page, later, reads the same text.
  await page.waitForTimeout(2500);
  const fresh = await otherCtx.newPage();
  await fresh.goto(path);
  await expect(body(fresh)).toContainText('De storm kwam om drie uur. Niemand zag het aankomen.', { timeout: 15_000 });
  await fresh.close();

  // Undo is your own: the player's undo takes back the player's sentence only.
  await body(other).click();
  await other.keyboard.press('Control+z');
  await expect(body(page)).toContainText('De storm kwam om drie uur.', { timeout: 5000 });
  await expect(body(page)).not.toContainText('Niemand zag het aankomen', { timeout: 5000 });

  // The rest of the record follows too: a rename on one screen lands on the
  // other without touching what is being typed there.
  await page.getByLabel('Naam').fill(`Logboek ${stamp} (herzien)`);
  await page.getByLabel('Naam').blur();
  await expect(other.getByLabel('Naam')).toHaveValue(`Logboek ${stamp} (herzien)`, { timeout: 10_000 });

  await otherCtx.close();
});

test('someone who may only look sees the text live, and proposes rather than types', async ({ page, browser }, info) => {
  test.setTimeout(150_000);
  const stamp = `${info.project.name}-${Date.now().toString(36)}`;

  await signUpAs(page, `Eigenaar ${stamp}`);
  const path = await newEntry(page, `Dagboek ${stamp}`);
  await page.waitForTimeout(800);
  await page.locator('summary', { hasText: /^\s*Rechten/ }).click();
  await page.getByRole('radiogroup', { name: 'Wie mag bewerken' }).getByRole('radio', { name: 'Privé' }).click();
  await page.waitForTimeout(600);

  const readerCtx = await browser.newContext();
  const reader = await readerCtx.newPage();
  await signUpAs(reader, `Lezer ${stamp}`);
  await reader.goto(path);
  // §22: proposing is an act of editing, so the button for it is on the
  // editing face. The reading face shows this same text and nothing to press.
  await editArticle(reader);
  await expect(reader.locator('.live-dot-live')).toBeVisible({ timeout: 15_000 });

  // Read-only: no contenteditable, but the owner's typing still arrives.
  await expect(body(reader)).toHaveAttribute('contenteditable', 'false');
  await body(page).click();
  await page.keyboard.type('Vandaag regen.');
  await expect(body(reader)).toContainText('Vandaag regen.', { timeout: 5000 });

  // A proposal: a copy to edit, sent to the owner.
  await reader.getByRole('button', { name: 'Wijziging voorstellen' }).click();
  const proposal = reader.locator('.proposal-editor .prose');
  await expect(proposal).toContainText('Vandaag regen.');
  await proposal.click();
  await reader.keyboard.press('End');
  await reader.keyboard.type(' En wind.');
  await reader.getByRole('button', { name: 'Voorstel sturen' }).click();
  await expect(reader.getByText('Als voorstel naar de eigenaar gestuurd.')).toBeVisible({ timeout: 10_000 });
  // The shared text itself did not change.
  await expect(body(page)).not.toContainText('En wind.');
  await expect(body(reader)).not.toContainText('En wind.');

  // The owner has it waiting.
  await page.reload();
  await expect(page.locator('summary', { hasText: 'Voorstellen (1)' })).toBeVisible({ timeout: 10_000 });

  await readerCtx.close();
});
