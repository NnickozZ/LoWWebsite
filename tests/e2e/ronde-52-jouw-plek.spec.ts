import { expect, test, type Browser, type Page } from '@playwright/test';
import { becomeInvestigator, fillWhenReady, inviteCode, newEntryButton, signIn } from './helpers';

/**
 * §91 (ronde 52): jouw plek.
 *
 * Nick: *"Je moet te veel knopjes klikken. Misschien moet er iets in de
 * sidebar komen?"* — de speler had geen vaste plek. Deze zaken lopen de weg
 * die een mens loopt:
 *
 *   desktop  de groep Jouw plek met kamer (en het echte saldo), winkel met
 *            `?kamer=`, je spelerspagina en de hal; de Keeper-groep die voor
 *            een speler niet in de DOM staat; het zoekvak; "Nieuw artikel"
 *            boven de vouw op 1440 × 900; en een wissel van *speelt als* die
 *            *schrijft als* meeneemt.
 *   telefoon de Jij-tab opent een blad en gaat nergens heen; het blad heeft de
 *            deuren; het saldo staat op de tab; er zweeft geen beurs meer.
 *   Start    de Jij-rij staat boven de welkomsttekst.
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

async function signUpWearing(page: Page, name: string) {
  await signUpAs(page, name);
  const character = `Onderzoeker ${name}`;
  const path = await becomeInvestigator(page, character);
  return { account: name, character, slug: path.replace(/^\/e\//, '') };
}

/** Het formulier in het grootboek, zoals `ronde-51-economie.spec.ts` het gebruikt. */
async function giveMunten(keeper: Page, slug: string, amount: number, reason: string) {
  await keeper.goto(`/kamer/${slug}`);
  await expect(keeper.getByTestId('kamer-page')).toBeVisible({ timeout: 20_000 });
  const balance = keeper.getByTestId('kamer-balance');
  const before = Number((await balance.getAttribute('data-balance')) ?? '0');
  const form = keeper.getByTestId('grootboek-form');
  await expect(form).toBeVisible({ timeout: 20_000 });
  await fillWhenReady(form.getByTestId('grootboek-bedrag'), String(amount));
  await fillWhenReady(form.getByTestId('grootboek-reden'), reason);
  await form.getByTestId('grootboek-geef').click();
  await expect(balance).toHaveAttribute('data-balance', String(before + amount), { timeout: 20_000 });
  return (await keeper.getByTestId('kamer-page').getAttribute('data-room'))!;
}

/** De Keeper maakt een tweede onderzoeker en koppelt hem aan dit account (§18c). */
async function keeperHandsOut(browser: Browser, account: string, name: string): Promise<string> {
  const context = await browser.newContext();
  const keeper = await context.newPage();
  await signIn(keeper, ...KEEPER);
  await keeper.goto('/');
  const sheet = keeper.getByRole('dialog', { name: 'Nieuw artikel' });
  await expect(async () => {
    if (!(await sheet.isVisible().catch(() => false))) {
      await newEntryButton(keeper).click({ timeout: 5000 });
    }
    await expect(sheet).toBeVisible({ timeout: 1500 });
  }).toPass({ timeout: 30_000 });
  await sheet.getByLabel('Naam', { exact: true }).fill(name);
  await sheet.getByRole('button', { name: 'Aanmaken' }).click();
  await keeper.waitForURL('**/e/**');
  const slug = new URL(keeper.url()).pathname.replace(/^\/e\//, '');

  await keeper.goto('/admin?tab=users');
  const row = keeper.locator(`li[data-username="${account}"]`).first();
  await expect(row).toBeVisible({ timeout: 20_000 });
  const box = row.locator('input.input').first();
  await box.click();
  await box.fill(name);
  const suggestion = row.locator('.suggest-item').filter({ hasText: name }).filter({ hasNotText: 'aanmaken' }).first();
  await expect(suggestion).toBeVisible({ timeout: 20_000 });
  await suggestion.click();
  await expect(row.getByText(name, { exact: false }).first()).toBeVisible({ timeout: 20_000 });
  await context.close();
  return slug;
}

test.describe('§91 jouw plek — de zijbalk', () => {
  test('een speler: kamer met saldo, winkel met ?kamer=, spelerspagina, hal — en geen Keeper-groep', async ({
    page,
    browser,
    isMobile,
  }, info) => {
    test.skip(isMobile, 'de zijbalk staat op een computer; de telefoon heeft zijn eigen zaak');
    test.setTimeout(240_000);
    const stamp = `${info.project.name}-${Date.now().toString(36)}`;

    const ownerCtx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const owner = await ownerCtx.newPage();
    const { slug } = await signUpWearing(owner, `Zijbalk ${stamp}`);

    await signIn(page, ...KEEPER);
    const roomId = await giveMunten(page, slug, 7, `Startgeld ${stamp}`);

    await owner.goto('/wiki');
    const nav = owner.getByRole('navigation', { name: 'Hoofdmenu' });
    const yours = nav.getByTestId('nav-yours');
    await expect(yours).toBeVisible({ timeout: 20_000 });
    await expect(yours.getByTestId('yours-kamer')).toHaveAttribute('href', `/kamer/${slug}`);
    await expect(yours.getByTestId('yours-saldo')).toHaveAttribute('data-balance', '7');
    await expect(yours.getByTestId('yours-winkel')).toHaveAttribute('href', `/winkel?kamer=${encodeURIComponent(roomId)}`);
    await expect(yours.getByTestId('yours-mine')).toHaveAttribute('href', /^\/spelers\//);
    await expect(yours.getByTestId('yours-spelers')).toHaveAttribute('href', '/spelers');

    // §44: afwezig, niet verborgen.
    await expect(owner.getByTestId('nav-keeper')).toHaveCount(0);
    await expect(owner.locator('a[href="/admin"]')).toHaveCount(0);
    await expect(owner.locator('a[href="/uitdelen"]')).toHaveCount(0);

    // De pil in de hoek is weg: de zijbalk is de deur.
    await expect(owner.getByTestId('shell-beurs')).toHaveCount(0);

    // Zoeken is een vak, niet meer een menu-item.
    await expect(nav.getByRole('link', { name: 'Zoeken', exact: true })).toHaveCount(0);

    // En de kamerdeur werkt.
    await yours.getByTestId('yours-kamer').click();
    await expect(owner.getByTestId('kamer-page')).toBeVisible({ timeout: 20_000 });

    await ownerCtx.close();
  });

  test('het zoekvak navigeert, en / zet de cursor erin', async ({ page, isMobile }) => {
    test.skip(isMobile, 'op een telefoon blijft / naar Zoeken gaan');
    await signIn(page, ...KEEPER);
    await page.goto('/wiki');
    const box = page.getByTestId('nav-search');
    await expect(box).toBeVisible({ timeout: 20_000 });
    // Pressed until the page listens (§6: a page that has just navigated is not
    // yet listening). Once the box has the caret a second `/` is typed into it,
    // which `fill` below overwrites.
    await expect(async () => {
      await page.keyboard.press('/');
      await expect(box).toBeFocused({ timeout: 1000 });
    }).toPass({ timeout: 20_000 });
    expect(new URL(page.url()).pathname).toBe('/wiki');
    await box.fill('Westkapelle');
    await box.press('Enter');
    await page.waitForURL('**/search?q=Westkapelle');
  });

  test('de Keeper ziet Beheer en Uitdelen, en "Nieuw artikel" staat boven de vouw', async ({ page, isMobile }) => {
    test.skip(isMobile, 'de zijbalk staat op een computer');
    await page.setViewportSize({ width: 1440, height: 900 });
    await signIn(page, ...KEEPER);
    await page.goto('/wiki');
    const keeperGroup = page.getByTestId('nav-keeper');
    await expect(keeperGroup).toBeVisible({ timeout: 20_000 });
    await expect(keeperGroup.getByTestId('nav-admin')).toHaveAttribute('href', '/admin');
    await expect(keeperGroup.getByTestId('nav-uitdelen')).toHaveAttribute('href', '/uitdelen');
    const box = await page.getByTestId('nav-new').boundingBox();
    expect(box).not.toBeNull();
    expect(box!.y + box!.height).toBeLessThanOrEqual(900);
    // De Keeperkant-knop in de hoek draagt een woord en haalt 44 px.
    const toggle = page.getByTestId('side-toggle');
    await expect(toggle).toContainText(/Keeperkant/i);
    const toggleBox = await toggle.boundingBox();
    expect(toggleBox!.height).toBeGreaterThanOrEqual(44);
  });

  test('een wissel van speelt als neemt schrijft als mee — en een bewuste keuze staat als tweede regel', async ({
    browser,
    isMobile,
  }, info) => {
    test.skip(isMobile, 'de wie-regel in de zijbalk; het blad heeft zijn eigen zaak');
    test.setTimeout(300_000);
    const stamp = `${info.project.name}-${Date.now().toString(36)}`;

    const ownerCtx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const owner = await ownerCtx.newPage();
    const eerste = await signUpWearing(owner, `Wissel ${stamp}`);
    const tweede = `Tweede ${stamp}`;
    await keeperHandsOut(browser, eerste.account, tweede);

    // Deze pagina (dit venster) koos bij het worden van onderzoeker de eerste.
    await owner.goto('/wiki');
    const nav = owner.getByRole('navigation', { name: 'Hoofdmenu' });
    await expect(nav.locator('.who')).toContainText(eerste.character, { timeout: 20_000 });
    // Eén regel: wie je speelt is wie je schrijft.
    await expect(nav.locator('.who-writing')).toHaveCount(0);

    await expect(async () => {
      await nav.locator('.who-button').first().click({ timeout: 5000 });
      await expect(owner.getByRole('dialog', { name: 'Je speelt als' })).toBeVisible({ timeout: 2000 });
    }).toPass({ timeout: 30_000 });
    await owner
      .getByRole('dialog', { name: 'Je speelt als' })
      .getByRole('radio', { name: new RegExp(tweede) })
      .click();
    await expect(nav.locator('.who')).toContainText(tweede, { timeout: 20_000 });
    await expect(nav.locator('.who-writing')).toHaveCount(0);

    // En het venster schrijft nu echt als de tweede: de regel op /you zegt het.
    await owner.goto('/you');
    const line = owner.getByRole('main').getByTestId('writing-as');
    await expect(line).toContainText(tweede, { timeout: 20_000 });

    // Een bewuste andere keuze voor dit venster: dan staan er twee regels.
    await expect(async () => {
      await line.click({ timeout: 5000 });
      await expect(owner.getByRole('dialog', { name: 'Met wie ben je nu aan het schrijven?' })).toBeVisible({
        timeout: 2000,
      });
    }).toPass({ timeout: 30_000 });
    await owner
      .getByRole('dialog', { name: 'Met wie ben je nu aan het schrijven?' })
      .getByRole('radio', { name: new RegExp(eerste.character) })
      .click();
    await expect(nav.locator('.who')).toContainText(tweede);
    await expect(nav.locator('.who-writing')).toContainText(eerste.character, { timeout: 20_000 });

    await ownerCtx.close();
  });
});

test.describe('§91 jouw plek — het Jij-blad op de telefoon', () => {
  test('de Jij-tab draagt het saldo, opent een blad en gaat nergens heen', async ({ page, browser, isMobile }, info) => {
    test.skip(!isMobile, 'de tabbalk staat op een telefoon');
    test.setTimeout(240_000);
    const stamp = `${info.project.name}-${Date.now().toString(36)}`;

    const { slug } = await signUpWearing(page, `Blad ${stamp}`);
    const keeperCtx = await browser.newContext();
    const keeper = await keeperCtx.newPage();
    await signIn(keeper, ...KEEPER);
    const roomId = await giveMunten(keeper, slug, 4, `Startgeld ${stamp}`);
    await keeperCtx.close();

    await page.goto('/wiki');
    const tabs = page.getByRole('navigation', { name: 'Tabbalk' });
    // §32: nog steeds acht.
    await expect(tabs.locator(':scope > a, :scope > button')).toHaveCount(8);
    const tab = tabs.getByRole('button', { name: 'Jij', exact: true });
    await expect(tab).toBeVisible({ timeout: 20_000 });
    await expect(tab.getByTestId('tab-jij-saldo')).toHaveAttribute('data-balance', '4');

    // Geen zwevende beurs meer.
    await expect(page.getByTestId('shell-beurs')).toHaveCount(0);

    const sheet = page.getByRole('dialog', { name: 'Jij' });
    await expect(async () => {
      await tab.click({ timeout: 5000 });
      await expect(sheet).toBeVisible({ timeout: 2000 });
    }).toPass({ timeout: 30_000 });
    expect(new URL(page.url()).pathname).toBe('/wiki');

    await expect(sheet.getByTestId('jij-kamer')).toHaveAttribute('href', `/kamer/${slug}`);
    await expect(sheet.getByTestId('jij-kamer').getByTestId('beurs')).toHaveAttribute('data-balance', '4');
    await expect(sheet.getByTestId('jij-winkel')).toHaveAttribute('href', `/winkel?kamer=${encodeURIComponent(roomId)}`);
    await expect(sheet.getByTestId('jij-mine')).toHaveAttribute('href', /^\/spelers\//);
    await expect(sheet.getByTestId('jij-spelers')).toHaveAttribute('href', '/spelers');
    await expect(sheet.getByTestId('jij-settings')).toHaveAttribute('href', '/you');
    await expect(sheet.getByTestId('jij-keeper')).toHaveCount(0);

    // Elke knop in het blad haalt een vinger.
    for (const button of await sheet.locator('.btn').all()) {
      const box = await button.boundingBox();
      expect(box!.height).toBeGreaterThanOrEqual(44);
    }

    // Escape sluit, en de focus staat weer op de tab.
    await page.keyboard.press('Escape');
    await expect(sheet).toHaveCount(0);
    await expect(tab).toBeFocused();

    // Een deur in het blad brengt je er.
    await tab.click();
    await sheet.getByTestId('jij-kamer').click();
    await expect(page.getByTestId('kamer-page')).toBeVisible({ timeout: 20_000 });
  });

  test('de Keeper vindt Beheer, Uitdelen en de Keeperkant in het blad', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'de tabbalk staat op een telefoon');
    await signIn(page, ...KEEPER);
    await page.goto('/wiki');
    const tab = page.getByRole('navigation', { name: 'Tabbalk' }).getByRole('button', { name: 'Jij', exact: true });
    const sheet = page.getByRole('dialog', { name: 'Jij' });
    await expect(async () => {
      await tab.click({ timeout: 5000 });
      await expect(sheet).toBeVisible({ timeout: 2000 });
    }).toPass({ timeout: 30_000 });
    await expect(sheet.getByTestId('jij-admin')).toHaveAttribute('href', '/admin');
    await expect(sheet.getByTestId('jij-uitdelen')).toHaveAttribute('href', '/uitdelen');
    await expect(sheet.getByTestId('jij-flip')).toBeVisible();
    // De Keeperkant-knop in de hoek haalt 44 px, ook als de cirkel kleiner is.
    const hit = await page.getByTestId('side-toggle').evaluate((el) => {
      const before = getComputedStyle(el, '::before');
      const box = el.getBoundingClientRect();
      const inset = Number.parseFloat(before.top) || 0;
      return box.height - 2 * inset;
    });
    expect(hit).toBeGreaterThanOrEqual(44);
  });

  test('geen tablabel is afgekapt', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'de tabbalk staat op een telefoon');
    await signIn(page, ...KEEPER);
    await page.goto('/wiki');
    const tabs = page.getByRole('navigation', { name: 'Tabbalk' });
    await expect(tabs).toBeVisible({ timeout: 20_000 });
    const clipped = await tabs.evaluate((nav) =>
      [...nav.querySelectorAll('a > span:not(.visually-hidden)')]
        .filter((span) => {
          const tab = span.parentElement!.getBoundingClientRect();
          const text = span.getBoundingClientRect();
          return text.left < tab.left - 0.5 || text.right > tab.right + 0.5 || span.scrollWidth > span.clientWidth + 0.5;
        })
        .map((span) => span.textContent),
    );
    expect(clipped).toEqual([]);
  });
});

test.describe('§91 jouw plek — Start', () => {
  test('de Jij-rij staat boven de welkomsttekst, met kamer en winkel', async ({ page }, info) => {
    test.setTimeout(180_000);
    const stamp = `${info.project.name}-${Date.now().toString(36)}`;
    const { character, slug } = await signUpWearing(page, `Start ${stamp}`);
    await page.goto('/');
    const row = page.getByTestId('home-jij');
    await expect(row).toBeVisible({ timeout: 20_000 });
    await expect(row.getByTestId('home-jij-card')).toContainText(character);
    await expect(row.getByTestId('home-jij-kamer')).toHaveAttribute('href', `/kamer/${slug}`);
    await expect(row.getByTestId('home-jij-winkel')).toHaveAttribute('href', /^\/winkel\?kamer=/);
    // Wat je net zelf maakte staat in je laatste drie.
    await expect(row.getByTestId('home-jij-recent')).toContainText(character);

    const rowBox = await row.boundingBox();
    const welcome = await page.locator('.home-welcome').boundingBox();
    expect(rowBox!.y + rowBox!.height).toBeLessThanOrEqual(welcome!.y + 1);
    // De welkomsttekst is er nog.
    await expect(page.locator('.home-intro')).toBeVisible();
  });

  test('de Keeper krijgt Beheer en Uitdelen in de rij', async ({ page }) => {
    await signIn(page, ...KEEPER);
    await page.goto('/');
    const row = page.getByTestId('home-jij');
    await expect(row).toBeVisible({ timeout: 20_000 });
    await expect(row.getByTestId('home-jij-admin')).toHaveAttribute('href', '/admin');
    await expect(row.getByTestId('home-jij-uitdelen')).toHaveAttribute('href', '/uitdelen');
    await expect(row.getByTestId('home-jij-kamer')).toHaveCount(0);
  });
});
