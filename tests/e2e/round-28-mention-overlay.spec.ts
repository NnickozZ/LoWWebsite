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
  await expect(box).toHaveValue(new RegExp(`\\[\\[${name}\\]\\]`), { timeout: 10_000 });
}

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

    // 1. The chip is in the mirror, over the box — not only on the row under it.
    const mirror = page.locator('.mention-mirror').first();
    await expect(mirror).toBeVisible({ timeout: 20_000 });
    const chip = mirror.locator('a.mention-live').filter({ hasText: target }).first();
    await expect(chip).toBeVisible({ timeout: 20_000 });

    // The mirror holds the box's characters, brackets included — that is what
    // keeps the caret under its letter — and lies exactly over the box.
    await expect(chip).toHaveText(`[[${target}]]`);
    const boxBox = (await lead.boundingBox())!;
    const mirrorBox = (await mirror.boundingBox())!;
    expect(Math.abs(mirrorBox.x - boxBox.x)).toBeLessThan(1.5);
    expect(Math.abs(mirrorBox.y - boxBox.y)).toBeLessThan(1.5);
    expect(Math.abs(mirrorBox.width - boxBox.width)).toBeLessThan(1.5);

    // 2. Trap one: the box's own text must not be drawn through the chip.
    const ink = await lead.evaluate((el) => {
      const style = getComputedStyle(el);
      return { colour: style.color, fill: style.webkitTextFillColor, caret: style.caretColor };
    });
    expect(ink.colour === 'rgba(0, 0, 0, 0)' || ink.fill === 'rgba(0, 0, 0, 0)').toBe(true);

    // 3. Trap two: the caret and the selection are still the box's, and visible.
    expect(ink.caret).not.toBe('rgba(0, 0, 0, 0)');
    await lead.click();
    await page.keyboard.press('ControlOrMeta+a');
    const selected = await lead.evaluate((el) => {
      const box = el as HTMLTextAreaElement;
      return box.selectionEnd - box.selectionStart;
    });
    expect(selected).toBeGreaterThan(0);
    // The mirror never takes the pointer where there is no chip, so the click
    // above landed in the box.
    await expect(lead).toBeFocused();

    // 4. Trap three: a drag that starts on the chip selects text; it does not
    //    navigate and it is not swallowed.
    const chipBox = (await chip.boundingBox())!;
    const urlBefore = page.url();
    await page.mouse.move(chipBox.x + 4, chipBox.y + chipBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(chipBox.x + chipBox.width - 2, chipBox.y + chipBox.height / 2, { steps: 8 });
    await page.mouse.up();
    await page.waitForTimeout(500);
    expect(page.url()).toBe(urlBefore);
    const dragged = await lead.evaluate((el) => {
      const box = el as HTMLTextAreaElement;
      return box.selectionEnd - box.selectionStart;
    });
    expect(dragged).toBeGreaterThan(0);

    // 5. And a plain click on the chip goes to the artikel it names.
    await chip.click();
    await page.waitForURL(`**${new URL(targetUrl).pathname}`, { timeout: 20_000 });
  });
});
