import { expect, test, type Page } from '@playwright/test';
import { fillWhenReady, newEntryButton, signIn } from './helpers';

/**
 * Round 28, §56 — the chip is *inside* the box.
 *
 * §54 put the chips on a row under the box. This is the wish that row did not
 * grant: a `[[Naam]]` in the sentence being written is a chip where it stands,
 * and clicking it goes to the artikel. The technique is a highlight overlay —
 * a mirror div over the box, holding the box's own characters, brackets and
 * all, with only the chips taking the pointer.
 *
 * Beside "does a chip show and does it navigate", this spec walks the three
 * ways an overlay of this kind goes wrong: the box's own letters drawn through
 * the mirror, a caret or a selection that has gone invisible, and a chip that
 * swallows a drag-select starting on it.
 *
 * The box under test is the **nieuw-artikel sheet's** beschrijving, and that is
 * on purpose: the overlay hangs on the plain boxes only. A box inside a
 * `LiveFields` room is handed over from a plain element to the room's bound one
 * (§7), and a mirror beside it shifted that moment badly enough to lose what
 * had just been typed. Those boxes keep their chips on the row under them
 * (§54). See §56 in README.md.
 */

const KEEPER = ['Keeper', 'abbeytower34'] as const;

async function openNewEntry(page: Page, typeLabel: string, name: string) {
  await newEntryButton(page).click();
  const sheet = page.getByRole('dialog', { name: 'Nieuw artikel' });
  await expect(sheet.getByRole('radio', { name: typeLabel, exact: true })).toBeVisible({ timeout: 20_000 });
  await sheet.getByRole('radio', { name: typeLabel, exact: true }).click();
  await fillWhenReady(sheet.getByLabel('Naam', { exact: true }), name);
  return sheet;
}

async function create(page: Page, sheet: ReturnType<Page['getByRole']>): Promise<string> {
  const before = page.url();
  await sheet.getByRole('button', { name: 'Aanmaken' }).click();
  await expect.poll(() => page.url(), { timeout: 60_000 }).not.toBe(before);
  return page.url();
}

/** Type `@` plus the first word of a name and pick the artikel out of the list. */
async function mention(page: Page, box: ReturnType<Page['locator']>, name: string) {
  await box.click();
  await box.pressSequentially(`@${name.split(' ')[0]}`, { delay: 30 });
  const hit = page.locator('.suggest-item').filter({ hasNotText: 'aanmaken' }).filter({ hasText: name }).first();
  await hit.click({ timeout: 20_000 });
  await expect(box.locator('.short-chip', { hasText: name })).toBeVisible({ timeout: 10_000 });
}

/*
 * §95 (ronde 56): this box is no longer a textarea with a mirror over it. The
 * korte beschrijving in the sheet is the one-line editor every short box is
 * now, and the chip is a real element in it — so the three traps this spec
 * was written for (letters drawn through the mirror, an invisible caret, a
 * chip that swallows a drag) cannot happen here any more, and what is left to
 * prove is the wish itself: a chip where the name stands, no brackets, a caret
 * that selects, and a click that goes to the artikel. §56's mirror still hangs
 * on the boxes outside this round (the maakbladen of a landkaart, a tijdlijn,
 * a stamboom and the lead of an overzicht).
 */
test.describe('§56 een chipje in het vak zelf', () => {
  test('de beschrijving in de maak-sheet toont een klikbaar chipje in het vak', async ({ page }) => {
    test.setTimeout(240_000);
    const stamp = Date.now().toString().slice(-6);
    const target = `Doelwit ${stamp}`;

    await signIn(page, ...KEEPER);
    const targetUrl = await create(page, await openNewEntry(page, 'Clues', target));

    await page.goto('/');
    const sheet = await openNewEntry(page, 'Clues', `Bron ${stamp}`);
    const lead = sheet.getByLabel('Korte beschrijving');
    await expect(lead).toBeVisible({ timeout: 20_000 });
    await mention(page, lead, target);

    // 1. The chip is in the box, and there are no brackets anywhere.
    const chip = lead.locator('.short-chip').filter({ hasText: target }).first();
    await expect(chip).toBeVisible({ timeout: 20_000 });
    await expect(lead).not.toContainText('[[');
    await expect(page.locator('.mention-mirror')).toHaveCount(0);

    // 2. The box's letters are its own, and the caret selects.
    const ink = await lead.evaluate((el) => getComputedStyle(el).webkitTextFillColor);
    expect(ink).not.toBe('rgba(0, 0, 0, 0)');
    await lead.click();
    await page.keyboard.press('ControlOrMeta+a');
    expect(await page.evaluate(() => window.getSelection()?.toString().length ?? 0)).toBeGreaterThan(0);
    await expect(lead).toBeFocused();

    // 3. And a plain click on the chip goes to the artikel it names.
    await chip.click();
    await page.waitForURL(`**${new URL(targetUrl).pathname}`, { timeout: 20_000 });
  });
});
