import { expect, test, type Page } from '@playwright/test';
import { fillWhenReady, newEntryButton, signIn } from './helpers';

/**
 * Round 27, §54 — a name you are typing is already a chip.
 *
 * A `<textarea>` holds characters and nothing else, so a chip can never live
 * *inside* the box the way it does in the rich editor (a Tiptap mention is an
 * inline atom node). What it can do is stand under the box: `MentionRow`, the
 * row the gebeurtenis sheet and the landkaart speld have had since round 18,
 * now under every plain box that can produce a `[[Naam]]`. This spec pins two
 * of the seven: the nieuw-artikel sheet's beschrijving, and the artikel's
 * korte beschrijving on the editing face — where the chip must also *go*
 * somewhere when it is clicked.
 */

const KEEPER = ['Keeper', 'abbeytower34'] as const;

/** The nieuw-artikel sheet, told its soort and handed a name. */
async function openNewEntry(page: Page, typeLabel: string, name: string) {
  await newEntryButton(page).click();
  const sheet = page.getByRole('dialog', { name: 'Nieuw artikel' });
  await expect(sheet.getByRole('radio', { name: typeLabel, exact: true })).toBeVisible({
    timeout: 20_000,
  });
  await sheet.getByRole('radio', { name: typeLabel, exact: true }).click();
  await fillWhenReady(sheet.getByLabel('Naam', { exact: true }), name);
  return sheet;
}

/** Press Aanmaken and wait for the artikel it lands on (§6: the address must *change*). */
async function create(page: Page, sheet: ReturnType<Page['getByRole']>): Promise<string> {
  const before = page.url();
  await sheet.getByRole('button', { name: 'Aanmaken' }).click();
  await expect.poll(() => page.url(), { timeout: 60_000 }).not.toBe(before);
  return page.url();
}

/**
 * Type `@` and the first word of a name into a box and pick the artikel out of
 * the list. The "'…' aanmaken" row is on screen before the suggestions are
 * (§6), so it is filtered out by name.
 */
async function mention(page: Page, box: ReturnType<Page['locator']>, name: string) {
  await box.click();
  await box.pressSequentially(`@${name.split(' ')[0]}`, { delay: 30 });
  const hit = page
    .locator('.suggest-item')
    .filter({ hasNotText: 'aanmaken' })
    .filter({ hasText: name })
    .first();
  await hit.click({ timeout: 20_000 });
  await expect(box).toHaveValue(new RegExp(`\\[\\[${name}\\]\\]`), { timeout: 10_000 });
}

test.describe('§54 een chipje terwijl je typt', () => {
  test('de korte beschrijving en de nieuw-artikel-sheet tonen klikbare chips', async ({ page }) => {
    test.setTimeout(240_000);
    const stamp = Date.now().toString().slice(-6);
    const target = `Doelwit ${stamp}`;

    await signIn(page, ...KEEPER);
    const targetUrl = await create(page, await openNewEntry(page, 'Clues', target));

    // 1. The sheet that makes an artikel: a name in its beschrijving is a chip
    //    under the box, before anything has been made.
    await page.goto('/');
    const sheet = await openNewEntry(page, 'Clues', `Vraag ${stamp}`);
    await mention(page, sheet.locator('#new-entry-description'), target);
    await expect(sheet.getByText('Verwijst naar')).toBeVisible({ timeout: 20_000 });
    await expect(sheet.locator('a.entry-chip').filter({ hasText: target })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(sheet).toBeHidden({ timeout: 10_000 });

    // 2. The artikel's own korte beschrijving, on the editing face — and the
    //    chip really goes to the artikel it names.
    const sourceUrl = await create(page, await openNewEntry(page, 'Clues', `Bron ${stamp}`));
    expect(sourceUrl).not.toBe(targetUrl);
    const lead = page.locator('#entry-lead');
    await expect(lead).toBeVisible({ timeout: 20_000 });
    await mention(page, lead, target);
    const chip = page.locator('a.entry-chip').filter({ hasText: target }).first();
    await expect(chip).toBeVisible({ timeout: 20_000 });
    await chip.click();
    await page.waitForURL(`**${new URL(targetUrl).pathname}`, { timeout: 20_000 });
  });
});
