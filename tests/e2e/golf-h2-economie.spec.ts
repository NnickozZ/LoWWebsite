import { mkdirSync } from 'node:fs';
import { expect, test, type Browser, type Page } from '@playwright/test';
import { becomeInvestigator, fillWhenReady, inviteCode, signIn } from './helpers';

/**
 * §103 golf H (h2) — de economie na design-review 3, door een echte hand.
 *
 *   ZAAK 1 (T11/D7/T16/D29/D20/D11) — de kamer: een kop van één regel, dichte
 *            tegels die kort zijn en de prijs één keer noemen, op een telefoon
 *            per soort één en de rest achter een vouw; het etiket heel.
 *   ZAAK 2 (D7/T8/T17/D8a/T23) — kopen in de winkel: een inktknop, het saldo
 *            in de schil rolt in hetzelfde moment als de melding, de knop
 *            verandert niet bij scrollen, en *Bekijk* is 44 px.
 *   ZAAK 3 (D8b/D9/T15/T6/T5/T21) — verplaatsen: de balk zweeft (het raster
 *            staat stil), één melding per ding, hooguit twee, een blad sluit
 *            de lopende melding, en op een aanraakscherm geen caret in het
 *            zoekvak.
 *   ZAAK 4 (T14/D15/D10) — uitdelen: *20 munten naar …*, de rij toont de
 *            nieuwe balans, de deur staat één keer; de speler krijgt
 *            `toast-munt`, en twee giften tellen op in één melding.
 *
 * Schermen gaan naar `/tmp/claude-0/shots-h2/after/`, licht en donker, om met
 * eigen ogen te kijken — niet om tegen te vergelijken.
 */

const KEEPER = ['Keeper', 'abbeytower34'] as const;
const SHOTS = '/tmp/claude-0/shots-h2/after';
mkdirSync(SHOTS, { recursive: true });

async function shot(page: Page, name: string, project: string) {
  await page.screenshot({ path: `${SHOTS}/${name}-${project}.png` });
}

/** Licht en donker, en op de telefoon ook 360 px breed. */
async function shots(page: Page, name: string, project: string, isMobile: boolean, full = false) {
  const sizes = isMobile ? [390, 360] : [1440];
  for (const width of sizes) {
    if (isMobile) await page.setViewportSize({ width, height: width === 360 ? 740 : 844 });
    for (const scheme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme: scheme });
      await page.waitForTimeout(250);
      await page.screenshot({ path: `${SHOTS}/${name}-${project}-${width}-${scheme}.png`, fullPage: full });
    }
  }
  await page.emulateMedia({ colorScheme: 'light' });
  if (isMobile) await page.setViewportSize({ width: 390, height: 844 });
}

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

/** Huisraad, door de route die het Nieuw-blad ook gebruikt. */
async function newHuisraad(keeper: Page, spec: { name: string; plekken: string[]; prijs: number; effect: string }) {
  await keeper.goto('/wiki/huisraad');
  const status = await keeper.evaluate(
    async (body) => {
      const response = await fetch('/api/entries', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      return response.status;
    },
    { typeSlug: 'huisraad', name: spec.name, fields: { plek: spec.plekken, prijs: spec.prijs, effect: spec.effect } },
  );
  expect(status).toBeLessThan(300);
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

async function ownerContext(browser: Browser, isMobile: boolean) {
  return browser.newContext(isMobile ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } : {});
}

/** Het getal dat de schil nu tekent — de tekst, niet `data-balance` (die volgt de verversing). */
function shellNumber(page: Page, isMobile: boolean) {
  const holder = isMobile ? page.getByTestId('tab-jij-saldo') : page.getByTestId('yours-saldo');
  return holder.locator('.saldo-getal');
}

test.describe('§103 golf H: de economie', () => {
  test('ZAAK 1: de kamer — een kop van één regel en dichte plekken die kort zijn', async ({ page, browser, isMobile }, info) => {
    test.setTimeout(300_000);
    const project = info.project.name;
    const stamp = `${project}-${Date.now().toString(36)}`;

    await signIn(page, ...KEEPER);
    const lamp = `Lamp ${stamp}`;
    await newHuisraad(page, { name: lamp, plekken: ['bureau'], prijs: 2, effect: `Licht ${stamp}` });

    const ownerCtx = await ownerContext(browser, isMobile);
    const owner = await ownerCtx.newPage();
    const { character, slug } = await signUpWearing(owner, `Kamer ${stamp}`);
    await giveMunten(page, slug, 40, `Startgeld ${stamp}`);

    await openKamer(owner, slug);

    // T16/D29: één kop in inkt, met de naam als deur naar het artikel.
    await expect(owner.getByRole('heading', { level: 1 })).toHaveText(`Kamer van ${character}`);
    const naam = owner.getByTestId('kamer-onderzoeker');
    await expect(naam).toHaveAttribute('href', `/e/${slug}`);
    const kleur = await naam.evaluate((el) => {
      const own = getComputedStyle(el);
      return { color: own.color, heading: getComputedStyle(el.closest('h1')!).color, line: own.textDecorationLine };
    });
    expect(kleur.color, 'de naam staat in de inkt van de kop').toBe(kleur.heading);
    expect(kleur.line).toBe('none');

    // T11/D7: de dichte plekken apart, kort, met één prijs en *Openen* zonder bedrag.
    const dicht = owner.getByTestId('kamer-dicht');
    await expect(dicht).toBeVisible();
    await expect(owner.getByTestId('kamer-grid').locator('[data-state="locked"]')).toHaveCount(0);
    const eerste = dicht.locator('[data-testid="plek"][data-state="locked"]').first();
    await expect(eerste.getByTestId('plek-price')).toBeVisible();
    const open = eerste.getByTestId('plek-unlock');
    await expect(open).toHaveText('Openen');
    await expect(open).toHaveAccessibleName(/^Openen · \d+ munten?$/);
    await expect(eerste.locator('.plek-slot-merk, .plek-locked-line')).toHaveCount(0);
    const hoog = async (selector: string) =>
      owner.locator(selector).first().evaluate((el) => el.getBoundingClientRect().height);
    const dichtHoog = await hoog('[data-testid="kamer-dicht"] [data-testid="plek"]');
    const openHoog = await hoog('[data-testid="kamer-grid"] [data-testid="plek"]');
    expect(dichtHoog, `een dichte tegel (${dichtHoog}) is ongeveer half zo hoog als een open (${openHoog})`).toBeLessThan(
      openHoog * 0.68,
    );
    // Wat erin staat, past: de knop wordt niet afgesneden.
    const past = await eerste.evaluate((el) => el.scrollHeight <= el.clientHeight + 1);
    expect(past, 'de dichte tegel knipt zijn inhoud').toBe(true);

    if (isMobile) {
      // Per soort de eerstvolgende; de rest achter één regel.
      const vouw = owner.getByTestId('kamer-dicht-vouw');
      await expect(vouw).toBeVisible();
      await expect(vouw).toContainText(/^Nog \d+ plek(ken)? op slot · /);
      const zichtbaar = dicht.locator('[data-testid="plek"]:visible');
      const voor = await zichtbaar.count();
      expect(voor).toBeLessThanOrEqual(4);
      await vouw.click();
      await expect(vouw).toHaveAttribute('aria-expanded', 'true');
      expect(await zichtbaar.count()).toBeGreaterThan(voor);
      await vouw.click();
    } else {
      await expect(owner.getByTestId('kamer-dicht-vouw')).toBeHidden();
    }

    // D20/T20: een gekocht ding met een werkbalk — het etiket wordt niet afgekapt.
    await owner.goto('/winkel');
    const rij = owner.getByTestId('winkel-rij').filter({ hasText: lamp });
    await rij.getByTestId('winkel-koop').click();
    await expect(rij.getByTestId('winkel-owned')).toBeVisible({ timeout: 20_000 });
    await openKamer(owner, slug);
    const tegel = owner.locator('[data-testid="plek"][data-state="filled"]').filter({ hasText: lamp });
    await expect(tegel).toBeVisible({ timeout: 20_000 });
    // T21: *Ingericht* bij de eerste koop, in de hoek en niet over het ding.
    const ingericht = owner.getByTestId('plek-ingericht');
    await expect(ingericht).toBeVisible({ timeout: 5000 });
    await owner.waitForTimeout(800);
    const opDing = await tegel.evaluate((el) => {
      const cover = el.querySelector('.plek-cover')!.getBoundingClientRect();
      const stempel = el.querySelector('.plek-ingericht')!.getBoundingClientRect();
      const midden = { x: cover.left + cover.width / 2, y: cover.top + cover.height / 2 };
      return midden.x > stempel.left && midden.x < stempel.right && midden.y > stempel.top && midden.y < stempel.bottom;
    });
    expect(opDing, 'Ingericht ligt over het midden van het ding').toBe(false);
    await shot(owner, 'kamer-ingericht', project);

    for (const width of isMobile ? [390, 360] : [1440]) {
      if (isMobile) await owner.setViewportSize({ width, height: 800 });
      const heel = await tegel.evaluate((el) => {
        const word = el.querySelector('.plek-kind-word') as HTMLElement;
        return word.scrollWidth <= word.clientWidth + 1;
      });
      expect(heel, `het etiket past op ${width} px`).toBe(true);
    }
    if (isMobile) await owner.setViewportSize({ width: 390, height: 844 });

    await owner.evaluate(() => window.scrollTo(0, 0));
    await shots(owner, 'kamer', project, isMobile);
    await shots(owner, 'kamer-heel', project, isMobile, true);
    await ownerCtx.close();
  });

  test('ZAAK 2: kopen in de winkel — een inktknop, en het saldo in hetzelfde moment', async ({ page, browser, isMobile }, info) => {
    test.setTimeout(300_000);
    const project = info.project.name;
    const stamp = `${project}-${Date.now().toString(36)}`;

    await signIn(page, ...KEEPER);
    const stoel = `Stoel ${stamp}`;
    await newHuisraad(page, { name: stoel, plekken: ['plank', 'bureau'], prijs: 3, effect: `Zitten ${stamp}` });

    const ownerCtx = await ownerContext(browser, isMobile);
    const owner = await ownerCtx.newPage();
    const { slug } = await signUpWearing(owner, `Winkel ${stamp}`);
    await giveMunten(page, slug, 30, `Startgeld ${stamp}`);

    await owner.goto('/winkel');
    await expect(owner.getByTestId('winkel-page')).toBeVisible({ timeout: 20_000 });
    const rij = owner.getByTestId('winkel-rij').filter({ hasText: stoel });
    await expect(rij).toHaveCount(1, { timeout: 20_000 });
    const koop = rij.getByTestId('winkel-koop');

    // D7: een inktknop — de stempel draagt het rood, de knop pas onder de muis.
    await expect(koop).not.toHaveClass(/btn-primary/);
    const rust = await koop.evaluate((el) => getComputedStyle(el).backgroundColor);
    const stempel = await rij.getByTestId('winkel-prijs').evaluate((el) => getComputedStyle(el).color);
    expect(rust).not.toBe(stempel);
    const label = (await koop.locator('.koop-regel > span[aria-hidden]').textContent())?.trim();
    expect(label).toMatch(/^Kopen → (plank|bureau)$/);
    await rij.scrollIntoViewIfNeeded();
    await shots(owner, 'winkel', project, isMobile);
    if (!isMobile) {
      await koop.hover();
      await owner.waitForTimeout(300);
      await shot(owner, 'winkel-hover', project);
    }

    // T8: het getal in de schil rolt in hetzelfde moment als de melding.
    const getal = shellNumber(owner, isMobile);
    await expect(getal).toHaveText('30', { timeout: 20_000 });
    await koop.click();
    const melding = owner.locator('.toast').filter({ hasText: stoel });
    await expect(melding).toBeVisible({ timeout: 10_000 });
    const t0 = Date.now();
    for (const ms of [60, 300]) {
      await owner.waitForTimeout(ms === 60 ? 60 : 240);
      await shot(owner, `koop-${ms}`, project);
    }
    // Het rolt al terwijl *Gekocht* nog op de knop ligt (die houdt de rij vast).
    await expect(getal).toHaveText('27', { timeout: 900 });
    expect(Date.now() - t0, 'het saldo liep achter op de melding').toBeLessThan(1200);
    await shot(owner, 'koop-900', project);
    await expect(rij.getByTestId('winkel-owned')).toBeVisible({ timeout: 20_000 });
    await shot(owner, 'koop-na', project);

    // T23: *Bekijk* heeft een raakvlak van 44 px.
    const bekijk = rij.getByTestId('winkel-bekijk');
    const vlak = await bekijk.evaluate((el) => {
      const after = getComputedStyle(el, '::after');
      return { h: Number.parseFloat(after.height), w: Number.parseFloat(after.width) };
    });
    expect(vlak.h).toBeGreaterThanOrEqual(44);
    expect(vlak.w).toBeGreaterThanOrEqual(44);

    await ownerCtx.close();
  });

  test('ZAAK 3: verplaatsen — de balk zweeft, één melding per ding, en een blad sluit de melding', async ({ page, browser, isMobile }, info) => {
    test.setTimeout(300_000);
    const project = info.project.name;
    const stamp = `${project}-${Date.now().toString(36)}`;

    await signIn(page, ...KEEPER);
    const kast = `Kaartenkast ${stamp}`;
    await newHuisraad(page, { name: kast, plekken: ['bureau', 'plank'], prijs: 2, effect: `Kaarten ${stamp}` });

    const ownerCtx = await ownerContext(browser, isMobile);
    const owner = await ownerCtx.newPage();
    const { slug } = await signUpWearing(owner, `Schuif ${stamp}`);
    await giveMunten(page, slug, 20, `Startgeld ${stamp}`);

    await owner.goto('/winkel');
    const rij = owner.getByTestId('winkel-rij').filter({ hasText: kast });
    await rij.getByTestId('winkel-koop').click();
    await expect(rij.getByTestId('winkel-owned')).toBeVisible({ timeout: 20_000 });

    await openKamer(owner, slug);
    const gevuld = owner.locator('[data-testid="plek"][data-state="filled"]').filter({ hasText: kast });
    await expect(gevuld).toBeVisible({ timeout: 20_000 });

    // D8b: *Verplaatsen* — het raster staat stil, de balk zweeft onderaan.
    const raster = owner.getByTestId('kamer-grid');
    const voor = await raster.evaluate((el) => el.getBoundingClientRect().top);
    await gevuld.getByTestId('plek-move').click();
    const balk = owner.getByTestId('kamer-move-bar');
    await expect(balk).toBeVisible();
    await owner.waitForTimeout(350);
    const na = await raster.evaluate((el) => el.getBoundingClientRect().top);
    expect(Math.abs(na - voor), 'het raster verschoof').toBeLessThanOrEqual(1);
    expect(await balk.evaluate((el) => getComputedStyle(el).position)).toBe('fixed');
    await shots(owner, 'verplaatsen', project, isMobile);

    // D9/T15: *verplaatst naar de …*, en het vervangt de melding over dit ding.
    const doel = owner.locator('[data-testid="plek"]').filter({ has: owner.getByTestId('plek-move-here') }).first();
    await doel.getByTestId('plek-move-here').click();
    const verplaatst = owner.locator('.toast').filter({ hasText: `${kast} verplaatst naar de` });
    await expect(verplaatst).toBeVisible({ timeout: 20_000 });
    await expect(owner.locator('.toast:not([data-closing])').filter({ hasText: kast })).toHaveCount(1);
    await expect(owner.locator('.toast:not([data-closing])')).toHaveCount(1);
    await shot(owner, 'verplaatst', project);

    // Hooguit twee: weghalen, en de plek openen (andere onderwerpen).
    const nu = owner.locator('[data-testid="plek"][data-state="filled"]').filter({ hasText: kast });
    await nu.getByTestId('plek-clear').click();
    await expect(owner.locator('.toast').filter({ hasText: `${kast} ligt nu in je lade` })).toBeVisible({ timeout: 20_000 });
    await expect(owner.locator('.toast:not([data-closing])').filter({ hasText: kast })).toHaveCount(1);
    const slot = owner.getByTestId('kamer-dicht').locator('[data-testid="plek-unlock"]').first();
    await slot.click();
    await expect(owner.locator('.toast').filter({ hasText: /is open\.$/ })).toBeVisible({ timeout: 20_000 });
    await expect.poll(() => owner.locator('.toast:not([data-closing])').count()).toBeLessThanOrEqual(2);
    await shot(owner, 'meldingen-twee', project);

    // T6: een blad sluit de lopende melding; T5: op een aanraakscherm geen caret.
    const leeg = owner.locator('[data-testid="plek"][data-state="empty"]').first();
    await leeg.getByTestId('plek-place').click();
    const kiezer = owner.getByTestId('plek-picker');
    await expect(kiezer).toBeVisible({ timeout: 20_000 });
    await expect(owner.locator('.toast:not([data-closing])')).toHaveCount(0, { timeout: 2000 });
    if (isMobile) {
      await owner.waitForTimeout(400);
      const inVak = await owner.evaluate(() => document.activeElement?.getAttribute('data-testid'));
      expect(inVak).not.toBe('plek-picker-zoek');
    }
    await owner.waitForTimeout(300);
    await shots(owner, 'kiezer', project, isMobile);
    await owner.keyboard.press('Escape');

    await ownerCtx.close();
  });

  test('ZAAK 4: uitdelen — de Keeper ziet wat hij deed, de speler krijgt een moment', async ({ page, browser, isMobile }, info) => {
    test.setTimeout(300_000);
    const project = info.project.name;
    const stamp = `${project}-${Date.now().toString(36)}`;

    const ownerCtx = await ownerContext(browser, isMobile);
    const owner = await ownerCtx.newPage();
    const { character, slug } = await signUpWearing(owner, `Gift ${stamp}`);

    await signIn(page, ...KEEPER);
    await giveMunten(page, slug, 5, `Vooraf ${stamp}`);

    // De speler staat op Start en blijft daar.
    await owner.goto('/');
    await expect(owner.getByRole('main')).toBeVisible({ timeout: 20_000 });
    await owner.waitForTimeout(1500);

    // Een tweede venster van de Keeper staat al klaar voor de tweede gift (T15).
    const tweede = await page.context().newPage();
    await openKamer(tweede, slug);
    const form = tweede.getByTestId('grootboek-form');
    await fillWhenReady(form.getByTestId('grootboek-bedrag'), '5');
    await fillWhenReady(form.getByTestId('grootboek-reden'), `De kaart ${stamp}`);

    await page.goto('/uitdelen');
    await expect(page.getByTestId('uitdelen-form')).toBeVisible({ timeout: 20_000 });

    // D15: de deur naast de kop, niet erin; elk label boven zijn vak; *munten* in het vak.
    await expect(page.locator('h1 [data-testid="uitdelen-terug"]')).toHaveCount(0);
    await expect(page.getByTestId('uitdelen-terug')).toBeVisible();
    const vak = page.getByTestId('uitdelen-iedereen');
    const labels = await page.locator('.uitdelen-head .uitdelen-label').evaluateAll((els) =>
      els.map((el) => el.getBoundingClientRect()),
    );
    const vakken = await page.locator('.uitdelen-head .input').evaluateAll((els) => els.map((el) => el.getBoundingClientRect()));
    for (let i = 0; i < labels.length; i += 1) {
      expect(labels[i].bottom, 'het label staat boven zijn vak').toBeLessThanOrEqual(vakken[i].top + 1);
      expect(labels[i].right, 'het label steekt niet over naar het volgende vak').toBeLessThanOrEqual(vakken[i].right + 1);
    }
    await expect(page.locator('.uitdelen-head .munten-vak-achter')).toHaveText('munten');

    const rij = page.getByTestId('uitdelen-rij').filter({ hasText: character });
    await expect(rij).toHaveCount(1, { timeout: 20_000 });
    await expect(rij.getByTestId('uitdelen-saldo')).toContainText('5');
    await shots(page, 'uitdelen', project, isMobile);

    await rij.getByTestId('uitdelen-aan').check();
    await fillWhenReady(vak, '20');
    await fillWhenReady(page.getByTestId('uitdelen-reden'), `Voor sessie 13 ${stamp}`);
    await page.getByTestId('uitdelen-geef').click();

    // T14: de melding noemt het, en de rij toont de nieuwe balans.
    const klaar = page.locator('.toast').filter({ hasText: `20 munten naar ${character}` });
    await expect(klaar).toBeVisible({ timeout: 20_000 });
    await expect(rij.getByTestId('uitdelen-saldo').locator('.saldo-getal')).toHaveText('25', { timeout: 2000 });
    await expect(rij.getByTestId('uitdelen-chip')).toHaveText('+20');
    await expect(page.getByTestId('uitdelen-naar-spelers')).toHaveCount(0);
    const voet = await page.locator('.uitdelen-voet').boundingBox();
    const box = await klaar.boundingBox();
    const over = !(box!.x + box!.width <= voet!.x || voet!.x + voet!.width <= box!.x || box!.y + box!.height <= voet!.y || voet!.y + voet!.height <= box!.y);
    expect(over, 'de melding ligt over de voet').toBe(false);
    await page.waitForTimeout(300);
    await shots(page, 'uitdelen-klaar', project, isMobile);

    // D10: de speler krijgt `toast-munt` — de stempel met het bedrag en de reden.
    const munt = owner.locator('.toast-munt');
    await expect(munt).toBeVisible({ timeout: 10_000 });
    await expect(munt.getByTestId('toast-munt-stempel')).toHaveText('+20');
    await expect(munt).toContainText(`Voor sessie 13 ${stamp}`);
    await expect(munt.getByRole('button', { name: 'Naar de kamer' })).toBeVisible();
    await owner.waitForTimeout(500);
    await shots(owner, 'munt-melding', project, isMobile);

    // T15: een tweede gift telt op in dezelfde melding.
    if (!isMobile) await munt.hover();
    await form.getByTestId('grootboek-geef').click();
    await expect(munt.getByTestId('toast-munt-stempel')).toHaveText('+25', { timeout: 10_000 });
    await expect(owner.locator('.toast-munt')).toHaveCount(1);
    await expect(munt).toContainText(`De kaart ${stamp}`);
    await owner.waitForTimeout(500);
    await shot(owner, 'munt-melding-opgeteld', project);

    await ownerCtx.close();
  });

  test('ZAAK 5: twee onderzoekers — de wissel is één segmentrij, en de koper staat één keer', async ({ page, browser, isMobile }, info) => {
    test.setTimeout(300_000);
    const project = info.project.name;
    const stamp = `${project}-${Date.now().toString(36)}`;

    await signIn(page, ...KEEPER);
    const kruk = `Kruk ${stamp}`;
    await newHuisraad(page, { name: kruk, plekken: ['plank', 'bureau'], prijs: 1, effect: `Zitten ${stamp}` });

    const ownerCtx = await ownerContext(browser, isMobile);
    const owner = await ownerCtx.newPage();
    const account = `Twee ${stamp}`;
    const eerste = await signUpWearing(owner, account);
    await giveMunten(page, eerste.slug, 12, `Startgeld ${stamp}`);

    // De tweede onderzoeker komt van de Keeper (§18c), zoals in `ronde-51-economie.spec.ts`.
    const tweedeNaam = `Onderzoeker Tweede ${stamp}`;
    await page.goto('/');
    const sheet = page.getByRole('dialog', { name: 'Nieuw artikel' });
    await expect(async () => {
      if (!(await sheet.isVisible().catch(() => false))) {
        await page.getByRole('button', { name: 'Nieuw artikel' }).locator('visible=true').first().click({ timeout: 5000 });
      }
      await expect(sheet).toBeVisible({ timeout: 1500 });
    }).toPass({ timeout: 30_000 });
    await sheet.getByLabel('Naam', { exact: true }).fill(tweedeNaam);
    const vanaf = new URL(page.url()).pathname;
    await sheet.getByRole('button', { name: 'Aanmaken' }).click();
    await page.waitForURL((url) => url.pathname.startsWith('/e/') && url.pathname !== vanaf);
    const tweedeSlug = new URL(page.url()).pathname.replace(/^\/e\//, '');
    await page.goto('/admin?tab=users');
    const rowSel = page.locator(`li[data-username="${account}"]`).first();
    await expect(rowSel).toBeVisible({ timeout: 20_000 });
    const box = rowSel.locator('input.input').first();
    await box.click();
    await box.fill(tweedeNaam);
    const suggestion = rowSel.locator('.suggest-item').filter({ hasText: tweedeNaam }).filter({ hasNotText: 'aanmaken' }).first();
    await expect(suggestion).toBeVisible({ timeout: 20_000 });
    await suggestion.click();
    await expect(rowSel.getByText(tweedeNaam, { exact: false }).first()).toBeVisible({ timeout: 20_000 });
    await giveMunten(page, tweedeSlug, 3, `Voor de tweede ${stamp}`);

    // T16: de wissel is één rij, met de kamer waar je staat gevuld.
    await openKamer(owner, eerste.slug);
    const wissel = owner.getByTestId('kamer-wissel');
    await expect(wissel.getByTestId('kamer-wissel-kamer')).toHaveCount(2);
    await expect(wissel.locator('[aria-current="page"]')).toHaveCount(1);
    const rijen = await wissel.getByTestId('kamer-wissel-kamer').evaluateAll((els) =>
      els.map((el) => Math.round(el.getBoundingClientRect().top)),
    );
    expect(new Set(rijen).size, 'de wissel breekt over twee regels').toBe(1);
    await owner.evaluate(() => window.scrollTo(0, 0));
    await shots(owner, 'kamer-twee', project, isMobile);

    // T17: de knop verandert niet bij scrollen; de koper staat één keer bovenaan.
    await owner.goto(`/winkel`);
    await expect(owner.getByTestId('winkel-kiezer')).toBeVisible({ timeout: 20_000 });
    const koop = owner.getByTestId('winkel-rij').filter({ hasText: kruk }).getByTestId('winkel-koop');
    const regel = koop.locator('.koop-regel > span[aria-hidden]');
    const voor = (await regel.textContent())?.trim();
    const kop = owner.getByTestId('koper-kop');
    await expect(kop).not.toHaveAttribute('data-shown', 'ja');
    // Genoeg pagina om de kiezer uit beeld te scrollen, ook als de winkel kort is.
    await owner.evaluate(() => {
      const page = document.querySelector('[data-testid="winkel-page"]') as HTMLElement;
      page.style.paddingBottom = '1600px';
    });
    // Net voorbij de kiezer: de koopknoppen staan dan bovenaan in beeld.
    await owner.evaluate(() => {
      const kiezer = document.querySelector('[data-testid="winkel-kiezer"]')!.getBoundingClientRect();
      window.scrollTo(0, window.scrollY + kiezer.bottom + 8);
    });
    await expect(kop).toHaveAttribute('data-shown', 'ja', { timeout: 5000 });
    expect((await regel.textContent())?.trim(), 'het label veranderde bij scrollen').toBe(voor);
    await expect(kop).toContainText('Kopen voor');
    await owner.waitForTimeout(400);
    await shots(owner, 'winkel-koper', project, isMobile);

    await ownerCtx.close();
  });
});
