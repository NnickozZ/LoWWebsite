import { expect, test, type Page } from '@playwright/test';
import { editCanvas, fillWhenReady, newBoard, signIn } from './helpers';

/**
 * §100 (ronde 61): het palet en één opslaan.
 *
 *   palet     Ctrl/⌘K opent het op de pagina waar je staat; typen vindt een
 *             dossier, Enter opent het; daarna staat het onder *Onlangs*;
 *             `>` laat de handelingen zien en *Nieuw artikel* opent het blad;
 *             Escape zet de focus terug waar hij was — op een telefoon via
 *             het Jij-blad, zonder dat de acht tabs veranderen;
 *   opslaan   één woord, in de schil naast de live-stip, op een artikel én
 *             op een prikbord — en zonder lijn zegt het "niet opgeslagen".
 */

const KEEPER = ['Keeper', 'abbeytower34'] as const;

async function makeCase(page: Page, name: string): Promise<string> {
  const slug = await page.evaluate(async (name) => {
    const response = await fetch('/api/cases', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    const data = (await response.json()) as { case?: { slug: string }; slug?: string };
    return data.case?.slug ?? data.slug ?? '';
  }, name);
  expect(slug).not.toBe('');
  return slug;
}

/** Opens the palet: Ctrl/⌘K on a desk, the Jij-blad on a phone. Pressed until the page listens (§6). */
async function openPalette(page: Page, phone: boolean) {
  const palette = page.getByTestId('palette');
  if (phone) {
    await expect(async () => {
      if (!(await page.getByTestId('jij-sheet').isVisible())) await page.getByTestId('tab-jij').click();
      await page.getByTestId('jij-palette').click({ timeout: 1000 });
      await expect(palette).toBeVisible({ timeout: 1500 });
    }).toPass({ timeout: 20_000 });
  } else {
    await expect(async () => {
      await page.keyboard.press('ControlOrMeta+k');
      await expect(palette).toBeVisible({ timeout: 1000 });
    }).toPass({ timeout: 20_000 });
  }
  return palette;
}

/**
 * Walks the arrows until the option that says `name` in `group` is the chosen
 * one. Scoped to the group: the last row, *Zoek '…' in het hele archief*,
 * says the name too, and it is on screen before the answer is.
 */
async function arrowTo(page: Page, name: string, group: string) {
  const option = page
    .getByTestId('palette')
    .locator(`[data-group="${group}"]`)
    .getByRole('option')
    .filter({ hasText: name })
    .first();
  await expect(option).toBeVisible({ timeout: 20_000 });
  await expect(async () => {
    if ((await option.getAttribute('aria-selected')) !== 'true') await page.keyboard.press('ArrowDown');
    await expect(option).toHaveAttribute('aria-selected', 'true', { timeout: 500 });
  }).toPass({ timeout: 15_000 });
}

test('het palet: een dossier op naam, Onlangs, en terug waar je was', async ({ page, isMobile }, info) => {
  test.setTimeout(150_000);
  const stamp = `${info.project.name}${Date.now().toString(36)}`.slice(-7);
  const name = `Schorre Kwelder ${stamp}`;

  await signIn(page, ...KEEPER);
  const slug = await makeCase(page, name);
  await page.goto('/wiki');

  // Ctrl/⌘K (a phone: the Jij-blad) — and the page stays where it is.
  let palette = await openPalette(page, isMobile);
  expect(new URL(page.url()).pathname).toBe('/wiki');
  const input = page.getByTestId('palette-input');
  await expect(input).toBeFocused();
  await expect(input).toHaveAttribute('role', 'combobox');
  await expect(palette.getByRole('listbox')).toBeVisible();

  await input.fill(name);
  await arrowTo(page, name, 'others');
  // Every option is a finger high.
  const box = await palette.locator('[data-group="others"]').getByRole('option').first().boundingBox();
  expect(box!.height).toBeGreaterThanOrEqual(43.5);
  await page.keyboard.press('Enter');
  await page.waitForURL(`**/c/${slug}**`);
  await expect(palette).toHaveCount(0);

  // Elsewhere, empty: what you opened is under Onlangs.
  await page.goto('/wiki');
  palette = await openPalette(page, isMobile);
  const recent = palette.locator('[data-group="recent"]');
  await expect(recent.getByRole('option').filter({ hasText: name })).toBeVisible({ timeout: 20_000 });
  await expect(palette.locator('[data-group="actions"]')).toBeVisible();

  // Escape: the palet goes, and the focus is back on what opened it.
  await page.keyboard.press('Escape');
  await expect(palette).toHaveCount(0);
  if (isMobile) {
    await expect(page.getByTestId('tab-jij')).toBeFocused();
    // Still eight tabs.
    await expect(page.locator('nav.tabs > a, nav.tabs > button')).toHaveCount(8);
  } else {
    const door = page.getByTestId('nav-search');
    await door.click();
    await expect(palette).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(palette).toHaveCount(0);
    await expect(door).toBeFocused();
  }
});

test('> Nieuw artikel, en het ene opslaan-woord op het artikel — ook zonder lijn', async ({
  page,
  context,
  isMobile,
}, info) => {
  test.setTimeout(150_000);
  const stamp = `${info.project.name}${Date.now().toString(36)}`.slice(-7);
  await signIn(page, ...KEEPER);
  await page.goto('/wiki');

  const palette = await openPalette(page, isMobile);
  await page.getByTestId('palette-input').fill('> nieuw art');
  await expect(palette.locator('[data-group="actions"]').getByRole('option')).toHaveCount(1);
  await page.keyboard.press('Enter');
  const sheet = page.getByRole('dialog', { name: 'Nieuw artikel' });
  await expect(sheet).toBeVisible();
  await sheet.getByLabel('Naam', { exact: true }).fill(`Zeedijk ${stamp}`);
  await sheet.getByRole('button', { name: 'Aanmaken' }).click();
  await page.waitForURL('**/e/**');

  // One save word on the page, and it is the shell's — not in the head.
  // The korte beschrijving and not the name: a new name is a new slug, and the
  // page follows it to its new address — which, with the line down below,
  // would be a navigation into nothing.
  const word = page.locator('.save-state');
  const lead = page.getByLabel('Korte beschrijving');
  await fillWhenReady(lead, 'Een dijk langs het water.');
  await lead.blur();
  await expect(word).toHaveText('Opgeslagen', { timeout: 15_000 });
  await expect(word).toHaveCount(1);
  await expect(page.locator('.live-strip .save-state')).toHaveCount(1);
  await expect(page.locator('.entry-head .save-state')).toHaveCount(0);
  await expect(word).toHaveAttribute('aria-live', 'polite');

  // No line: the word says so, louder than "Opslaan…".
  await context.setOffline(true);
  await lead.click();
  await page.keyboard.press('End');
  await page.keyboard.type(' Zuid.');
  await expect(word).toContainText('niet opgeslagen', { timeout: 15_000 });
  await expect(word).toHaveAttribute('data-save', 'offline');
  await context.setOffline(false);
  await expect(word).toHaveText('Opgeslagen', { timeout: 20_000 });
});

test('het ene opslaan-woord op een prikbord, in dezelfde hoek', async ({ page }) => {
  test.setTimeout(120_000);
  await signIn(page, ...KEEPER);
  await page.goto('/boards');
  await newBoard(page);
  await editCanvas(page);
  await page.getByRole('button', { name: 'Nieuwe notitie', exact: true }).click();
  await expect(page.locator('.board-card')).toHaveCount(1);
  const word = page.locator('.save-state');
  await expect(word).toHaveText('Opgeslagen', { timeout: 15_000 });
  await expect(word).toHaveCount(1);
  // The wall's own bar no longer carries it; the shell's corner does.
  await expect(page.locator('.live-strip .save-state')).toHaveCount(1);
  await expect(page.locator('.board-bar .save-state, .board-toolbar .save-state')).toHaveCount(0);
});
