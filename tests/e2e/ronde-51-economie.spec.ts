import { expect, test, type Locator, type Page } from '@playwright/test';
import { becomeInvestigator, editArticle, expectPlekken, fillWhenReady, inviteCode, setPlekken, signIn } from './helpers';

/**
 * §90 (ronde 51, "De deuren") — de economie-helft, van de kant die de review
 * mat: een speler met twee onderzoekers, een bezoeker, en een Keeper die
 * meekijkt.
 *
 *   ZAAK 1 (E2)  — de winkel koopt voor wie je nú speelt, en de knop zegt het.
 *   ZAAK 2 (E7/E8) — een gift van de Keeper landt live in de kamer van de
 *                  speler, en de Keeper krijgt een melding.
 *   ZAAK 3 (E11/E12/S14) — de eigen kamer heeft één winkelknop, met `?kamer=`;
 *                  die van een ander geen, en de zin noemt de naam.
 *   ZAAK 4 (E3)  — "Kamer maken" staat niet op een artikel dat geen
 *                  onderzoeker kan zijn.
 *
 * Alle vier op de desk: het zijn afspraken over wát er staat, niet over hoe
 * het op 390 px valt, en één bewijs is genoeg (§85's regel over dubbele zaken).
 */

const KEEPER = ['Keeper', 'abbeytower34'] as const;

async function signUpAs(page: Page, name: string) {
  await page.goto('/signup');
  await page.getByLabel('Uitnodigingscode').fill(inviteCode());
  await page.getByLabel('Naam', { exact: true }).fill(name);
  await page.getByLabel('Wachtwoord', { exact: true }).fill('onderzeeboot');
  await page.getByLabel('Wachtwoord nogmaals').fill('onderzeeboot');
  await page.getByRole('button', { name: 'Account aanmaken' }).click();
  await page.waitForURL('**/');
}

async function signUpWearing(page: Page, name: string): Promise<{ account: string; character: string; slug: string }> {
  await signUpAs(page, name);
  const character = `Onderzoeker ${name}`;
  const path = await becomeInvestigator(page, character);
  return { account: name, character, slug: path.replace(/^\/e\//, '') };
}

async function unfoldInfobox(page: Page) {
  const folded = page.locator('details#block-info:not([open]) > summary');
  if (await folded.count()) await folded.click();
}

async function openNewEntrySheet(page: Page): Promise<Locator> {
  const sheet = page.getByRole('dialog', { name: 'Nieuw artikel' });
  await expect(async () => {
    if (!(await sheet.isVisible().catch(() => false))) {
      await page.getByRole('button', { name: 'Nieuw artikel' }).locator('visible=true').first().click({ timeout: 5000 });
    }
    await expect(sheet).toBeVisible({ timeout: 1500 });
  }).toPass({ timeout: 30_000 });
  return sheet;
}

/** §80's helper, zoals `winkel.spec.ts` hem heeft. */
async function newHuisraad(page: Page, spec: { name: string; plek: 'muur' | 'plank' | 'bureau'; prijs: number }) {
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
  await sheet.getByRole('button', { name: 'Aanmaken' }).click();
  await page.waitForURL('**/e/**');
  const path = new URL(page.url()).pathname;
  await unfoldInfobox(page);
  await setPlekken(page, [spec.plek]);
  await fillWhenReady(page.locator('#field-prijs'), String(spec.prijs));
  await page.locator('#field-prijs').blur();
  await expect(page.locator('.save-state')).not.toHaveText('Opslaan…', { timeout: 20_000 });
  await expect(async () => {
    await page.goto(path);
    await editArticle(page);
    await unfoldInfobox(page);
    await expectPlekken(page, [spec.plek]);
    await expect(page.locator('#field-prijs')).toHaveValue(String(spec.prijs), { timeout: 5000 });
  }).toPass({ timeout: 60_000 });
  return { name: spec.name, path };
}

async function openKamer(page: Page, slug: string) {
  await page.goto(`/kamer/${slug}`);
  await expect(page.getByTestId('kamer-page')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId('kamer-grid')).toBeVisible({ timeout: 20_000 });
}

/** Het formulier staat sinds §90 bovenaan, naast de beurs; de testids zijn dezelfde. */
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

test.describe('§90 De deuren — winkel en kamer', () => {
  test('ZAAK 1: de winkel koopt voor wie je nu speelt, en de koopknop noemt die naam', async ({
    page,
    browser,
    isMobile,
  }, info) => {
    test.skip(isMobile, 'op de desk bewezen');
    test.setTimeout(300_000);
    const stamp = `${info.project.name}-${Date.now().toString(36)}`;

    await signIn(page, ...KEEPER);
    const kruk = await newHuisraad(page, { name: `Kruk ${stamp}`, plek: 'plank', prijs: 1 });

    const ownerCtx = await browser.newContext();
    const owner = await ownerCtx.newPage();
    const eerste = await signUpWearing(owner, `Tweekoppig ${stamp}`);

    // De tweede onderzoeker komt van de Keeper (§18c), net als in `winkel.spec.ts`.
    const tweedeNaam = `Onderzoeker Tweede ${stamp}`;
    await page.goto('/');
    const sheet = await openNewEntrySheet(page);
    await sheet.getByLabel('Naam', { exact: true }).fill(tweedeNaam);
    const vanaf = new URL(page.url()).pathname;
    await sheet.getByRole('button', { name: 'Aanmaken' }).click();
    await page.waitForURL((url) => url.pathname.startsWith('/e/') && url.pathname !== vanaf);
    const tweedeSlug = new URL(page.url()).pathname.replace(/^\/e\//, '');

    await page.goto('/admin?tab=users');
    const rowSel = page.locator(`li[data-username="${eerste.account}"]`).first();
    await expect(rowSel).toBeVisible({ timeout: 20_000 });
    const box = rowSel.locator('input.input').first();
    await box.click();
    await box.fill(tweedeNaam);
    const suggestion = rowSel
      .locator('.suggest-item')
      .filter({ hasText: tweedeNaam })
      .filter({ hasNotText: 'aanmaken' })
      .first();
    await expect(suggestion).toBeVisible({ timeout: 20_000 });
    await suggestion.click();
    await expect(rowSel.getByText(tweedeNaam, { exact: false }).first()).toBeVisible({ timeout: 20_000 });

    await giveMunten(page, tweedeSlug, 3, `Voor de tweede ${stamp}`);
    await openKamer(page, tweedeSlug);
    const tweedeRoom = (await page.getByTestId('kamer-page').getAttribute('data-room'))!;

    // De speler gaat de tweede spelen, op het artikel zelf.
    await owner.goto(`/e/${tweedeSlug}`);
    await expect(async () => {
      await owner.getByRole('button', { name: /^Speel als/ }).click({ timeout: 5000 });
      await expect(owner.getByText(`Je speelt nu als ${tweedeNaam}.`)).toBeVisible({ timeout: 5000 });
    }).toPass({ timeout: 30_000 });

    // Zonder `?kamer=` staat de winkel op de tweede: dezelfde als de beurs.
    await owner.goto('/winkel');
    await expect(owner.getByTestId('winkel-page')).toHaveAttribute('data-room', tweedeRoom, { timeout: 20_000 });
    await expect(owner.getByTestId('winkel-balance')).toHaveAttribute('data-balance', '3');

    // E6: met twee onderzoekers is de kiezer de beurs — geen tweede saldoblok.
    await expect(owner.getByTestId('winkel-kiezer')).toBeVisible();
    await expect(owner.getByTestId('winkel-balance').getByTestId('beurs')).toHaveCount(0);

    // E2/E4: de knop zegt voor wie, wat het kost, en waar het landt.
    const koop = owner.getByTestId('winkel-rij').filter({ hasText: kruk.name }).getByTestId('winkel-koop');
    await expect(koop).toContainText(`Kopen voor ${tweedeNaam}`, { timeout: 20_000 });
    await expect(koop).toContainText('1 munt');
    await expect(koop).toContainText('plank');

    await ownerCtx.close();
  });

  test('ZAAK 2: een gift van de Keeper landt live in de kamer, en de Keeper hoort dat het gelukt is', async ({
    page,
    browser,
    isMobile,
  }, info) => {
    test.skip(isMobile, 'op de desk bewezen');
    test.setTimeout(240_000);
    const stamp = `${info.project.name}-${Date.now().toString(36)}`;

    const ownerCtx = await browser.newContext();
    const owner = await ownerCtx.newPage();
    const { character, slug } = await signUpWearing(owner, `Wachter ${stamp}`);
    await openKamer(owner, slug);
    await expect(owner.getByTestId('kamer-balance')).toHaveAttribute('data-balance', '0');

    await signIn(page, ...KEEPER);
    await giveMunten(page, slug, 5, `Live ${stamp}`);
    // E8: *Geven* zegt iets.
    await expect(page.locator('.toast').filter({ hasText: `naar ${character}` })).toBeVisible({ timeout: 20_000 });

    // E7: zonder herladen.
    await expect(owner.getByTestId('kamer-balance')).toHaveAttribute('data-balance', '5', { timeout: 20_000 });

    await ownerCtx.close();
  });

  test('ZAAK 3: één winkelknop in je eigen kamer, geen in die van een ander', async ({ browser, isMobile }, info) => {
    test.skip(isMobile, 'op de desk bewezen');
    test.setTimeout(240_000);
    const stamp = `${info.project.name}-${Date.now().toString(36)}`;

    const ownerCtx = await browser.newContext();
    const owner = await ownerCtx.newPage();
    const eigen = await signUpWearing(owner, `Bewoner ${stamp}`);

    await openKamer(owner, eigen.slug);
    const roomId = (await owner.getByTestId('kamer-page').getAttribute('data-room'))!;
    await expect(owner.getByRole('main').locator('a[href^="/winkel"]')).toHaveCount(1);
    await expect(owner.getByTestId('kamer-winkel')).toHaveAttribute('href', `/winkel?kamer=${encodeURIComponent(roomId)}`);
    // S14: de eyebrow is een deur naar de spelerspagina.
    await expect(owner.getByTestId('kamer-eyebrow-deur')).toHaveAttribute('href', /^\/spelers\//);

    const guestCtx = await browser.newContext();
    const guest = await guestCtx.newPage();
    await signUpWearing(guest, `Bezoeker ${stamp}`);
    await openKamer(guest, eigen.slug);
    await expect(guest.getByRole('main').locator('a[href^="/winkel"]')).toHaveCount(0);
    await expect(guest.getByTestId('kamer-effecten-leeg')).toContainText(eigen.character);

    await ownerCtx.close();
    await guestCtx.close();
  });

  test('ZAAK 4: "Kamer maken" staat niet op een artikel dat geen onderzoeker kan zijn', async ({
    page,
    isMobile,
  }, info) => {
    test.skip(isMobile, 'op de desk bewezen');
    test.setTimeout(180_000);
    const stamp = `${info.project.name}-${Date.now().toString(36)}`;

    await signIn(page, ...KEEPER);
    await page.goto('/wiki');
    const sheet = await openNewEntrySheet(page);
    await sheet.getByLabel('Naam', { exact: true }).fill(`Een plaats ${stamp}`);
    await sheet.getByRole('radio', { name: 'Locaties' }).click();
    await expect(sheet.getByRole('radio', { name: 'Locaties' })).toHaveAttribute('aria-checked', 'true');
    await sheet.getByRole('button', { name: 'Aanmaken' }).click();
    await page.waitForURL('**/e/**');
    const path = new URL(page.url()).pathname;

    await page.goto(path);
    await expect(page.getByRole('main')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId('entry-kamer-openen')).toHaveCount(0);
  });
});
