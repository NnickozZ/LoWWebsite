import { expect, test, type Page } from '@playwright/test';
import { fillWhenReady, newEntryButton, signIn } from './helpers';

/**
 * §57: de knop weet weer aan welke kant hij staat.
 *
 * The report: *"Als ik switch van een keeper pagina naar een speler pagina,
 * maar de speler pagina bestaat niet, dan switch ik naar het voorblad van de
 * wiki … Maar de knop rechtsboven denkt dat ik nogsteeds in de keeper side
 * zit."*
 *
 * It was not the cookie and not the address. `/e/…` and `/wiki` hang under one
 * `app/(app)/layout.tsx`, so §46's `router.push` re-rendered the page and
 * reused the shell's RSC output: the archive was on the players' side and the
 * shell — the toggle, the shield in the masthead, the palette, and
 * `UiProvider`'s `side` — was still the Keeper's. The last of those is §48's
 * born-on-a-side, so the next artikel made from that screen was born
 * **keeper-only** while the cookie said player. That is the assertion at the
 * end of each test here, and it is the one that matters.
 *
 * Every flip is now a document load through `GET /api/keeper/flip` (§50's own
 * road), so all five of those are rendered on the new side by construction.
 *
 * Reduced motion is emulated for the same reason §46's spec does it: no view
 * transition, so nothing here races an animation.
 */

const KEEPER = ['Keeper', 'abbeytower34'] as const;

/** A fresh artikel, made the way a person makes one, on whichever side we stand. */
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

/** The shield under the archive's name — in the side menu, which a phone has not got. */
async function expectMasthead(page: Page, there: boolean) {
  const stamp = page.getByTestId('masthead-side');
  if (!there) {
    await expect(stamp).toHaveCount(0);
    return;
  }
  if (await page.locator('.sidenav').isVisible()) await expect(stamp).toBeVisible();
  else await expect(stamp).toHaveCount(1);
}

test.describe('§57 omklappen zonder tweeling', () => {
  test('van een Keeperpagina naar de lijst: de hele site gaat mee, en zegt waarom', async ({
    page,
  }, testInfo) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await signIn(page, ...KEEPER);
    const tag = `${testInfo.project.name}${Date.now().toString(36)}`;

    // Stand on the Keeper's side and make something there: §48 gives it that
    // side at birth, and nothing has ever given it a tweeling.
    await page.goto('/api/keeper/flip?side=keeper&to=/wiki');
    const toggle = page.getByTestId('side-toggle');
    await expect(toggle).toHaveAttribute('data-side-now', 'keeper');
    await newArticle(page, `Het luik ${tag}`);
    await expect(page.getByTestId('keeper-stamp')).toBeVisible();

    // One press. There is no other face, so the archive turns over and lands
    // on the wiki — and every part of the shell turns over with it.
    await toggle.click();
    await expect(page).toHaveURL(/\/wiki/, { timeout: 20_000 });
    await expect(toggle).toHaveAttribute('data-side-now', 'player', { timeout: 20_000 });
    await expectMasthead(page, false);
    // And it says so, in the sentence for a landing with no tweeling.
    await expect(page.locator('.toast')).toContainText('Er is geen Spelersversie van deze pagina');
    await expect(page.locator('.toast')).toContainText('je staat nu aan de spelerskant.');

    // The one that is not cosmetic (§48): what is made from here is born on
    // the side the browser actually stands on. The tickbox is `UiProvider`'s
    // answer read straight off the screen…
    await newEntryButton(page).click();
    const sheet = page.getByRole('dialog', { name: 'Nieuw artikel' });
    await expect(sheet.getByTestId('side-choice').locator('input')).not.toBeChecked();

    // …and the artikel that comes out of it is the proof: no stamp, so it is
    // not Keeper-only, and the page did not detour us back to the Keeperkant.
    await sheet.getByRole('radio', { name: 'Locaties', exact: true }).click();
    await fillWhenReady(sheet.getByLabel('Naam', { exact: true }), `De sluis ${tag}`);
    await sheet.getByRole('button', { name: 'Aanmaken' }).click();
    await expect(page.locator('#entry-name')).toHaveValue(`De sluis ${tag}`, { timeout: 20_000 });
    await expect(page.getByTestId('keeper-stamp')).toHaveCount(0);
    await expect(toggle).toHaveAttribute('data-side-now', 'player');
  });

  test('en dezelfde weg terug, met de k', async ({ page }, testInfo) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await signIn(page, ...KEEPER);
    const tag = `${testInfo.project.name}${Date.now().toString(36)}`;

    // The other direction: a player-facing artikel with no Keeperversie.
    await page.goto('/api/keeper/flip?side=player&to=/wiki');
    const toggle = page.getByTestId('side-toggle');
    await expect(toggle).toHaveAttribute('data-side-now', 'player');
    await newArticle(page, `De veerstoep ${tag}`);
    await expect(page.getByTestId('keeper-stamp')).toHaveCount(0);

    // §46: `k` is the same button, so it takes the same road. The focus after
    // making an artikel is in a field, where `UiProvider`'s guard swallows the
    // key — so the button is given the focus first, exactly as a hand reaching
    // for it would.
    await toggle.focus();
    await page.keyboard.press('k');
    await expect(page).toHaveURL(/\/wiki/, { timeout: 20_000 });
    await expect(toggle).toHaveAttribute('data-side-now', 'keeper', { timeout: 20_000 });
    await expectMasthead(page, true);
    await expect(page.locator('.toast')).toContainText('Er is geen Keeperversie van deze pagina');
    await expect(page.locator('.toast')).toContainText('je staat nu aan de Keeperkant.');

    // And born-on-a-side reads the shell that is actually on the screen.
    await newEntryButton(page).click();
    await expect(
      page.getByRole('dialog', { name: 'Nieuw artikel' }).getByTestId('side-choice').locator('input'),
    ).toBeChecked();
  });
});
