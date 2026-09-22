import { expect, test, type Locator, type Page } from '@playwright/test';
import { becomeInvestigator, fillWhenReady, inviteCode, setPlekken, signIn } from './helpers';

/**
 * §93 (ronde 54, "De kamer, tweede pas") — van de kant die de review mat: een
 * speler die iets koopt, weghaalt, terugzet en verplaatst, en een Keeper die
 * huisraad maakt.
 *
 *   ZAAK 1 (E24)  — huisraad maken in één keer: plek, prijs en effect in het
 *                   Nieuw-blad, en een melding met een deur naar de winkel.
 *   ZAAK 2 (E1)   — *Wat je al hebt* biedt geen ongekocht huisraad aan; een
 *                   koop in de catalogus is binnen tien seconden terug te
 *                   draaien, en het grootboek zegt het in een zin.
 *   ZAAK 3 (E1/E10) — weghalen legt het in de lade, de lade zet het terug, en
 *                   *Verplaatsen* is tik-tik (Escape stopt).
 *   ZAAK 4 (E22/§5) — de hal wijst naar elke kamer, en je eigen spelerspagina
 *                   begint met je beurs en twee deuren.
 */

const KEEPER = ['Keeper', 'abbeytower34'] as const;

async function signUpWearing(page: Page, name: string): Promise<{ character: string; slug: string }> {
  await page.goto('/signup');
  await page.getByLabel('Uitnodigingscode').fill(inviteCode());
  await page.getByLabel('Naam', { exact: true }).fill(name);
  await page.getByLabel('Wachtwoord', { exact: true }).fill('onderzeeboot');
  await page.getByLabel('Wachtwoord nogmaals').fill('onderzeeboot');
  await page.getByRole('button', { name: 'Account aanmaken' }).click();
  await page.waitForURL('**/');
  const character = `Onderzoeker ${name}`;
  const path = await becomeInvestigator(page, character);
  return { character, slug: path.replace(/^\/e\//, '') };
}

/**
 * §93 (E24): huisraad in één keer — het blad vraagt plek, prijs en effect
 * zelf. Dit is tegelijk de helper van de andere zaken én het bewijs van ZAAK 1.
 */
async function newHuisraadInSheet(
  page: Page,
  spec: { name: string; plekken: string[]; prijs: number; effect: string },
): Promise<Locator> {
  await page.goto('/wiki/huisraad');
  const sheet = page.getByRole('dialog', { name: 'Nieuw artikel' });
  await expect(async () => {
    if (!(await sheet.isVisible().catch(() => false))) {
      await page.getByRole('button', { name: 'Nieuw', exact: true }).click({ timeout: 5000 });
    }
    await expect(sheet).toBeVisible({ timeout: 1500 });
  }).toPass({ timeout: 30_000 });
  await expect(sheet.getByRole('radio', { name: 'Huisraad', exact: true })).toHaveAttribute('aria-checked', 'true');
  await sheet.getByLabel('Naam', { exact: true }).fill(spec.name);
  await expect(sheet.getByTestId('new-entry-winkel')).toBeVisible({ timeout: 20_000 });
  await setPlekken(page, spec.plekken);
  await fillWhenReady(sheet.locator('#field-prijs'), String(spec.prijs));
  await fillWhenReady(sheet.locator('#field-effect'), spec.effect);
  // Uit het vak stappen is wat een los veld opslaat (§87: kopieer het gebaar dat er al staat).
  await sheet.getByLabel('Naam', { exact: true }).click();
  await sheet.getByRole('button', { name: 'Aanmaken' }).click();
  await page.waitForURL('**/e/**');
  return page.locator('.toast').filter({ hasText: spec.name });
}

async function openKamer(page: Page, slug: string) {
  await page.goto(`/kamer/${slug}`);
  await expect(page.getByTestId('kamer-page')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId('kamer-grid')).toBeVisible({ timeout: 20_000 });
}

async function giveMunten(keeper: Page, slug: string, amount: number, reason: string) {
  await openKamer(keeper, slug);
  const balance = keeper.getByTestId('kamer-balance');
  const before = Number((await balance.getAttribute('data-balance')) ?? '0');
  const form = keeper.getByTestId('grootboek-form');
  await expect(form).toBeVisible({ timeout: 20_000 });
  await fillWhenReady(form.getByTestId('grootboek-bedrag'), String(amount));
  await fillWhenReady(form.getByTestId('grootboek-reden'), reason);
  await form.getByTestId('grootboek-geef').click();
  await expect(balance).toHaveAttribute('data-balance', String(before + amount), { timeout: 20_000 });
}

/** De eerste open, lege plek van deze soort — en haar kiezer open. */
async function openPickerOn(page: Page, kind: string): Promise<{ tile: Locator; picker: Locator }> {
  const tile = page.locator(`[data-testid="plek"][data-state="empty"][data-kind="${kind}"]`).first();
  const id = (await tile.getAttribute('data-plek'))!;
  const fixed = page.locator(`[data-testid="plek"][data-plek="${id}"]`);
  const picker = page.getByTestId('plek-picker');
  await expect(async () => {
    if (!(await picker.isVisible().catch(() => false))) {
      await fixed.getByTestId('plek-place').click({ timeout: 5000 });
    }
    await expect(picker).toBeVisible({ timeout: 2000 });
  }).toPass({ timeout: 30_000 });
  return { tile: fixed, picker };
}

test.describe('§93 De kamer, tweede pas', () => {
  test('ZAAK 1: huisraad maken in één keer, en de melding wijst naar de winkel', async ({ page, isMobile }, info) => {
    test.skip(isMobile, 'het maakblad is op de desk bewezen; de velden zijn dezelfde componenten');
    test.setTimeout(180_000);
    const stamp = `${info.project.name}-${Date.now().toString(36)}`;
    const name = `Leeslamp ${stamp}`;

    await signIn(page, ...KEEPER);
    const toast = await newHuisraadInSheet(page, {
      name,
      plekken: ['bureau', 'plank'],
      prijs: 2,
      effect: `Licht om bij te lezen ${stamp}`,
    });
    await expect(toast).toContainText('staat in de winkel', { timeout: 20_000 });

    // Geen "Zet op de landkaart/tijdlijn" op huisraad.
    await expect(page.getByRole('main').getByRole('link', { name: /^Zet op / })).toHaveCount(0);

    await toast.getByRole('button', { name: 'Bekijk in de winkel' }).click();
    await page.waitForURL('**/winkel**');
    const rij = page.getByTestId('winkel-rij').filter({ hasText: name });
    await expect(rij).toHaveCount(1, { timeout: 20_000 });
    await expect(rij).toHaveAttribute('data-price', '2');
    await expect(rij).toHaveAttribute('data-kinds', 'plank bureau');
    await expect(rij.getByTestId('winkel-effect')).toHaveText(`Licht om bij te lezen ${stamp}`);
  });

  test('ZAAK 2: geen gratis huisraad, en een koop is tien seconden terug te draaien', async ({
    page,
    browser,
  }, info) => {
    test.setTimeout(300_000);
    const stamp = `${info.project.name}-${Date.now().toString(36)}`;
    const name = `Kaartenkast ${stamp}`;

    await signIn(page, ...KEEPER);
    await newHuisraadInSheet(page, { name, plekken: ['plank'], prijs: 3, effect: `Orde ${stamp}` });

    const ownerCtx = await browser.newContext();
    const owner = await ownerCtx.newPage();
    const { slug } = await signUpWearing(owner, `Koper ${stamp}`);
    await giveMunten(page, slug, 5, `Startgeld ${stamp}`);

    await openKamer(owner, slug);
    const balance = owner.getByTestId('kamer-balance');
    await expect(balance).toHaveAttribute('data-balance', '5', { timeout: 20_000 });

    // E1: onder *Wat je al hebt* staat hij niet, ook niet als je erom vraagt.
    const { tile, picker } = await openPickerOn(owner, 'plank');
    await owner.getByTestId('plek-picker-tab-bezit').click();
    await owner.getByTestId('plek-picker-zoek').fill(name);
    await expect(picker.getByTestId('plek-picker-leeg')).toBeVisible({ timeout: 20_000 });
    await expect(picker.getByTestId('plek-picker-optie').filter({ hasText: name })).toHaveCount(0);

    // In de catalogus wel, en kopen spreekt met *Ongedaan maken* erbij.
    await owner.getByTestId('plek-picker-tab-catalogus').click();
    await picker.getByTestId('plek-catalogus-rij').filter({ hasText: name }).getByTestId('plek-koop').click();
    await expect(tile).toHaveAttribute('data-state', 'filled', { timeout: 20_000 });
    await expect(balance).toHaveAttribute('data-balance', '2', { timeout: 20_000 });

    const toast = owner.locator('.toast').filter({ hasText: name });
    const undo = toast.getByRole('button', { name: 'Ongedaan maken' });
    await expect(undo).toBeVisible();
    await undo.click();

    await expect(tile).toHaveAttribute('data-state', 'empty', { timeout: 20_000 });
    await expect(balance).toHaveAttribute('data-balance', '5', { timeout: 20_000 });
    await expect(owner.locator('.toast').filter({ hasText: 'teruggebracht' })).toBeVisible();
    // K8: een zin in het grootboek, en de regel van de koop blijft staan.
    await expect(owner.locator('.kamer-grootboek-why').first()).toHaveText(`${name} teruggebracht`, {
      timeout: 20_000,
    });

    await ownerCtx.close();
  });

  test('ZAAK 3: weghalen legt het in de lade, en verplaatsen is tik-tik', async ({ page, browser }, info) => {
    test.setTimeout(300_000);
    const stamp = `${info.project.name}-${Date.now().toString(36)}`;
    const name = `Leesstoel ${stamp}`;

    await signIn(page, ...KEEPER);
    await newHuisraadInSheet(page, { name, plekken: ['bureau', 'plank'], prijs: 1, effect: `Rust ${stamp}` });

    const ownerCtx = await browser.newContext();
    const owner = await ownerCtx.newPage();
    const { slug } = await signUpWearing(owner, `Schuiver ${stamp}`);
    await giveMunten(page, slug, 2, `Stoelgeld ${stamp}`);

    // Kopen in de winkel: de melding draagt *Bekijk* én *Ongedaan maken*.
    await owner.goto('/winkel');
    const rij = owner.getByTestId('winkel-rij').filter({ hasText: name });
    await expect(rij).toHaveCount(1, { timeout: 20_000 });
    await rij.getByTestId('winkel-koop').click();
    const toast = owner.locator('.toast').filter({ hasText: name });
    await expect(toast.getByTestId('toast-also')).toHaveText('Ongedaan maken', { timeout: 20_000 });
    await toast.getByRole('button', { name: 'Bekijk' }).click();
    await owner.waitForURL(`**/kamer/${slug}**`);

    const filled = owner.locator('[data-testid="plek"][data-state="filled"]').filter({ hasText: name });
    await expect(filled).toHaveCount(1, { timeout: 20_000 });
    const from = (await filled.getAttribute('data-plek'))!;

    // E10: Verplaatsen — de passende lege plekken lichten op, Escape stopt.
    await filled.getByTestId('plek-move').click();
    await expect(owner.getByTestId('kamer-move-bar')).toBeVisible();
    const targets = owner.getByTestId('plek-move-here');
    await expect(targets).not.toHaveCount(0);
    // Alleen op bureau en plank: een muur licht niet op.
    await expect(owner.locator('[data-kind="muur"] [data-testid="plek-move-here"]')).toHaveCount(0);
    await owner.keyboard.press('Escape');
    await expect(owner.getByTestId('kamer-move-bar')).toHaveCount(0);
    await expect(targets).toHaveCount(0);

    await owner.locator(`[data-testid="plek"][data-plek="${from}"]`).getByTestId('plek-move').click();
    const target = owner.locator('[data-testid="plek"]').filter({ has: owner.getByTestId('plek-move-here') }).first();
    const to = (await target.getAttribute('data-plek'))!;
    await target.getByTestId('plek-move-here').click();
    await expect(owner.locator(`[data-testid="plek"][data-plek="${to}"]`)).toHaveAttribute('data-state', 'filled', {
      timeout: 20_000,
    });
    await expect(owner.locator(`[data-testid="plek"][data-plek="${from}"]`)).toHaveAttribute('data-state', 'empty');

    // E1: weghalen legt het in de lade — en de lade zet het terug, gratis, want het is van jou.
    const moved = owner.locator(`[data-testid="plek"][data-plek="${to}"]`);
    await moved.getByTestId('plek-clear').click();
    await expect(owner.locator('.toast').filter({ hasText: 'ligt nu in je lade' })).toBeVisible({ timeout: 20_000 });
    await expect(owner.getByTestId('kamer-lade')).toContainText(name, { timeout: 20_000 });

    const balance = owner.getByTestId('kamer-balance');
    const { tile, picker } = await openPickerOn(owner, 'plank');
    await expect(picker).toHaveAttribute('data-tab', 'bezit');
    const optie = picker.getByTestId('plek-picker-optie').filter({ hasText: name });
    await expect(optie).toHaveCount(1, { timeout: 20_000 });
    await expect(optie.getByTestId('plek-picker-lade')).toHaveText('In je lade');
    await optie.click();
    await expect(tile).toHaveAttribute('data-state', 'filled', { timeout: 20_000 });
    await expect(owner.getByTestId('kamer-lade')).toHaveCount(0);
    await expect(balance).toHaveAttribute('data-balance', '1');

    await ownerCtx.close();
  });

  test('ZAAK 4: de hal wijst naar elke kamer, en je eigen pagina begint met je beurs', async ({
    page,
    browser,
    isMobile,
  }, info) => {
    test.skip(isMobile, 'op de desk bewezen');
    test.setTimeout(180_000);
    const stamp = `${info.project.name}-${Date.now().toString(36)}`;

    const ownerCtx = await browser.newContext();
    const owner = await ownerCtx.newPage();
    const { character, slug } = await signUpWearing(owner, `Halganger ${stamp}`);

    await signIn(page, ...KEEPER);
    await page.goto('/spelers');
    const kamer = page.getByTestId('spelers-kamer').filter({ hasText: character });
    await expect(kamer).toHaveAttribute('href', `/kamer/${slug}`, { timeout: 20_000 });
    await kamer.click();
    await page.waitForURL(`**/kamer/${slug}`);

    // Op de pagina van een ander: wie hij nu speelt, en geen beurs.
    const spelerHref = (await page.getByTestId('kamer-eyebrow-deur').getAttribute('href'))!;
    await page.goto(spelerHref);
    await expect(page.getByTestId('speler-eerste')).toHaveAttribute('data-self', 'nee', { timeout: 20_000 });
    await expect(page.getByTestId('speler-eerste-speelt')).toContainText(character);
    await expect(page.getByTestId('speler-eerste').getByTestId('beurs')).toHaveCount(0);

    // Op je eigen: je karakter, je saldo, en de deuren naar kamer en winkel.
    await owner.goto(spelerHref);
    const eerste = owner.getByTestId('speler-eerste');
    await expect(eerste).toHaveAttribute('data-self', 'ja', { timeout: 20_000 });
    await expect(eerste.getByTestId('speler-eerste-wie')).toContainText(character);
    await expect(eerste.getByTestId('beurs')).toBeVisible();
    await expect(eerste.getByTestId('speler-eerste-kamer')).toHaveAttribute('href', `/kamer/${slug}`);
    await expect(eerste.getByTestId('speler-eerste-winkel')).toHaveAttribute('href', /^\/winkel\?kamer=/);
    await expect(owner.getByTestId('panel-nu-bezig')).toHaveCount(0);

    await ownerCtx.close();
  });
});
