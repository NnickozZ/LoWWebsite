import { mkdirSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { becomeInvestigator, fillWhenReady, inviteCode, signIn } from './helpers';

/**
 * §103 (ronde 66, *Het geld klinkt*) — de kamer, de winkel en de uitdeling in
 * het expressieve register, van de kant van de hand die koopt.
 *
 *   ZAAK 1 (K2/K3/K5/E18) — kopen: binnen 100 ms *Gekocht*; het saldo in de
 *                  zijbalk rolt met een chip; de tegel landt één keer, met
 *                  *Ingericht* bij de eerste koop; na herladen niets; de
 *                  voorbeeldkaart springt niet op boven de koopknop; en nergens
 *                  een animatie boven 700 ms.
 *   ZAAK 2 (K3/K2, reduced motion) — de tweede koop: het getal meteen, de chip
 *                  blijft, geen *Ingericht*, de ring zonder val.
 *   ZAAK 3 (K4)  — de Keeper geeft in een ander venster: één melding met de
 *                  reden, ook op de kamerpagina, en na herladen geen tweede.
 *   ZAAK 4 (K8)  — geluid: standaard uit (geen AudioContext), na aanzetten één
 *                  context bij de volgende koop.
 *   ZAAK 5 (K7)  — uitdelen: *+5* komt op naast de rij.
 *   ZAAK 6 (K5)  — een plek openen: het slotje draait open, een zachte ring.
 *
 * Schermafbeeldingen gaan naar `/tmp/claude-0/shots-d/`, per project, om met
 * eigen ogen te kijken — niet om tegen te vergelijken.
 */

const KEEPER = ['Keeper', 'abbeytower34'] as const;
const SHOTS = '/tmp/claude-0/shots-d';
mkdirSync(SHOTS, { recursive: true });

async function shot(page: Page, name: string, project: string) {
  await page.screenshot({ path: `${SHOTS}/${name}-${project}.png` });
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

/** Huisraad, rechtstreeks door de route die het Nieuw-blad ook gebruikt (§93: velden voor een keeper_made soort). */
async function newHuisraad(
  keeper: Page,
  spec: { name: string; plekken: string[]; prijs: number; effect: string },
): Promise<void> {
  await keeper.goto('/wiki/huisraad');
  const status = await keeper.evaluate(async (body) => {
    const response = await fetch('/api/entries', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    return response.status;
  }, {
    typeSlug: 'huisraad',
    name: spec.name,
    fields: { plek: spec.plekken, prijs: spec.prijs, effect: spec.effect },
  });
  expect(status).toBeLessThan(300);
}

async function openKamer(page: Page, slug: string) {
  await page.goto(`/kamer/${slug}`);
  await expect(page.getByTestId('kamer-page')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId('kamer-grid')).toBeVisible({ timeout: 20_000 });
}

/** De Keeper geeft, met het formulier bovenaan de kamer (§90). */
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

async function openWinkel(page: Page) {
  await page.goto('/winkel');
  await expect(page.getByTestId('winkel-page')).toBeVisible({ timeout: 20_000 });
}

/** Elke lopende animatie of overgang op de pagina, met haar naam en haar totale duur. */
async function running(page: Page): Promise<{ name: string; ms: number }[]> {
  return page.evaluate(() =>
    document.getAnimations().map((animation) => {
      const timing = animation.effect?.getTiming();
      const name =
        (animation as CSSAnimation).animationName ?? (animation as CSSTransition).transitionProperty ?? 'anders';
      return { name, ms: Number(timing?.duration ?? 0) + Number(timing?.delay ?? 0) };
    }),
  );
}

/**
 * §102 regel 5: niets in de winkel of de kamer beweegt langer dan 700 ms. De
 * ring van *Bekijk* (`plek-aangewezen`, K1) is van ronde 65 en staat met 1,4 s
 * in de review — die telt hier niet mee.
 */
async function expectNothingLong(page: Page) {
  for (const { name, ms } of await running(page)) {
    if (name === 'plek-aangewezen') continue;
    expect(ms, `${name} duurt ${ms} ms`).toBeLessThanOrEqual(700);
  }
}

test.describe('§103 Het geld klinkt', () => {
  test('ZAAK 1+2: kopen heeft een moment, en het landt één keer', async ({ page, browser, isMobile }, info) => {
    test.setTimeout(300_000);
    const project = info.project.name;
    const stamp = `${project}-${Date.now().toString(36)}`;
    const stoel = `Leesstoel ${stamp}`;

    await signIn(page, ...KEEPER);
    await newHuisraad(page, { name: stoel, plekken: ['plank', 'bureau'], prijs: 2, effect: `Een plek om te lezen ${stamp}` });

    const ownerCtx = await browser.newContext({ ...(isMobile ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } : {}) });
    const owner = await ownerCtx.newPage();
    const { slug } = await signUpWearing(owner, `Koper ${stamp}`);
    await giveMunten(page, slug, 6, `Startgeld ${stamp}`);

    await openWinkel(owner);
    await expect(owner.getByTestId('winkel-balance')).toHaveAttribute('data-balance', '6', { timeout: 20_000 });
    const rij = owner.getByTestId('winkel-rij').filter({ hasText: stoel });
    await expect(rij).toHaveCount(1, { timeout: 20_000 });
    const koop = rij.getByTestId('winkel-koop');
    await koop.scrollIntoViewIfNeeded();

    /* K6: één regel, *Kopen → plank*, de munt als teken ervoor. §103 herstel (#18):
       de prijs staat één keer per rij, als stempel erboven, en niet meer op de knop. */
    await expect(koop.locator('.koop-regel > span[aria-hidden="true"]')).toHaveText(/^Kopen → (plank|bureau)$/);
    await expect(rij.getByTestId('winkel-prijs')).toHaveText('2 munten');
    // De hele zin blijft de naam van de knop (§90): *Kopen · 2 munten → plank*.
    await expect(koop).toHaveAccessibleName(/^Kopen · 2 munten → (plank|bureau)$/);
    const hoog = (await koop.boundingBox())!.height;
    expect(hoog, 'de koopknop is één regel').toBeLessThan(52);
    await shot(owner, 'winkel', project);

    /* E18: de voorbeeldkaart springt niet op boven de koopknop — wel boven de naam. */
    if (!isMobile) {
      await koop.hover();
      await owner.waitForTimeout(900);
      await expect(owner.locator('.preview-card')).toHaveCount(0);
      await rij.getByTestId('winkel-naam').hover();
      await expect(owner.locator('.preview-card')).toBeVisible({ timeout: 5000 });
      await owner.mouse.move(5, 5);
      await koop.hover();
    }

    /* K2: binnen 100 ms zegt de knop *Gekocht*. */
    await owner.evaluate(() => {
      const t = ((window as unknown as { __koop: Record<string, number> }).__koop = {});
      document.addEventListener('pointerdown', () => (t.down = performance.now()), { capture: true, once: true });
      document.addEventListener('click', () => (t.click ??= performance.now()), { capture: true, once: true });
      const observer = new MutationObserver(() => {
        if (document.querySelector('[data-testid="winkel-koop"][data-bought]')) {
          t.bought = performance.now();
          observer.disconnect();
        }
      });
      observer.observe(document.body, { subtree: true, attributes: true, childList: true });
    });
    const saldoBefore = isMobile ? owner.getByTestId('tab-jij-saldo') : owner.getByTestId('yours-saldo');
    await expect(saldoBefore).toHaveAttribute('data-balance', '6');
    await koop.click();
    await expect(owner.getByTestId('winkel-gekocht')).toBeVisible({ timeout: 2000 });
    const t = await owner.evaluate(() => (window as unknown as { __koop: Record<string, number> }).__koop);
    expect(t.bought - t.click, 'van klik tot Gekocht').toBeLessThan(100);
    // De gevoelsmeting (G3) in het log, voor de rondenotitie.
    console.log(`G3 ${project}: klik → Gekocht ${(t.bought - t.click).toFixed(1)} ms`);
    await shot(owner, 'winkel-gekocht', project);

    /* K3: het saldo in de schil gaat van 6 naar 4, met een chip −2 die 1,5 s blijft. */
    /*
     * §103 golf H (T8): het getal en de chip komen met het antwoord van de koop
     * (`announceBalance`), in hetzelfde moment als de melding — niet pas met de
     * verversing na de stempel, die `data-balance` brengt. De klok van de chip
     * loopt dus vanaf dat antwoord.
     */
    const saldo = isMobile ? owner.getByTestId('tab-jij-saldo') : owner.getByTestId('yours-saldo');
    const chip = saldo.getByTestId('saldo-chip');
    await expect(chip).toBeVisible({ timeout: 2000 });
    const chipAt = Date.now();
    await expect(chip).toHaveText('−2');
    await expect(chip).toHaveAttribute('data-richting', 'eraf');
    await expect(saldo.locator('.saldo-getal')).toHaveText('4', { timeout: 1500 });
    await shot(owner, 'saldo-chip', project);
    await owner.waitForTimeout(Math.max(0, chipAt + 1000 - Date.now()));
    await expect(chip, 'de chip staat er nog, na een seconde').toBeVisible();
    await expect(saldo).toHaveAttribute('data-balance', '4', { timeout: 20_000 });
    await expect(saldo.getByTestId('saldo-chip')).toHaveCount(0, { timeout: 2500 });
    await expectNothingLong(owner);

    /* K6: de rij zegt nu *Staat in je kamer · Bekijk*, en niet twee zinnen. */
    const owned = rij.getByTestId('winkel-owned');
    await expect(owned).toContainText('Staat in je kamer', { timeout: 20_000 });
    const bekijk = owned.getByTestId('winkel-bekijk');
    await expect(bekijk).toHaveAttribute('href', new RegExp(`^/kamer/${slug}#plek-`));
    await expect(rij.getByTestId('winkel-geen-plek')).toHaveCount(0);

    /* K2 + K5: naar de tegel — het ding landt, en de eerste koop krijgt *Ingericht*. */
    await bekijk.click();
    await owner.waitForURL(`**/kamer/${slug}#plek-*`);
    const landed = await owner
      .waitForFunction(
        () => document.getAnimations().some((a) => (a as CSSAnimation).animationName === 'kamer-neerzet'),
        undefined,
        { polling: 'raf', timeout: 10_000 },
      )
      .then(() => true)
      .catch(() => false);
    await shot(owner, 'kamer-neerzetten', project);
    expect(landed, 'het ding landde niet').toBe(true);
    const ingericht = owner.getByTestId('plek-ingericht');
    await expect(ingericht).toBeVisible({ timeout: 5000 });
    await expect(ingericht).toHaveText(/ingericht/i);
    await expectNothingLong(owner);
    await owner.waitForTimeout(700);
    await shot(owner, 'kamer-ingericht', project);
    // Hij vervaagt na 2,5 s.
    await expect(ingericht).toHaveCount(0, { timeout: 6000 });

    /* Na herladen: geen neerzetten en geen *Ingericht* meer. */
    await owner.reload();
    await expect(owner.getByTestId('kamer-grid')).toBeVisible({ timeout: 20_000 });
    await owner.waitForTimeout(1200);
    const after = (await running(owner)).map((a) => a.name);
    expect(after).not.toContain('kamer-neerzet');
    expect(after).not.toContain('kamer-ingericht');
    await expect(owner.getByTestId('plek-ingericht')).toHaveCount(0);

    /* ---------------------------------- ZAAK 2: de tweede koop, onder reduced motion */

    await owner.emulateMedia({ reducedMotion: 'reduce' });
    await openWinkel(owner);
    const nogEens = owner.getByTestId('winkel-rij').filter({ hasText: stoel });
    await expect(nogEens).toHaveAttribute('data-state', 'buy', { timeout: 20_000 });
    const saldo2 = isMobile ? owner.getByTestId('tab-jij-saldo') : owner.getByTestId('yours-saldo');
    await nogEens.getByTestId('winkel-koop').click();
    await expect(saldo2).toHaveAttribute('data-balance', '2', { timeout: 20_000 });
    // Het getal meteen, de chip blijft.
    await expect(saldo2.locator('.saldo-getal')).toHaveText('2', { timeout: 150 });
    await expect(saldo2.getByTestId('saldo-chip')).toBeVisible();

    await openKamer(owner, slug);
    // K2: de ring zonder val, en K5: geen tweede *Ingericht*.
    await expect(owner.locator('[data-testid="plek-ring"][data-on]')).toHaveCount(1, { timeout: 5000 });
    expect((await running(owner)).map((a) => a.name)).not.toContain('kamer-neerzet');
    await expect(owner.getByTestId('plek-ingericht')).toHaveCount(0);
    await owner.waitForTimeout(1000);
    await expect(owner.getByTestId('plek-ingericht')).toHaveCount(0);

    await ownerCtx.close();
  });

  test('ZAAK 3: munten van de Keeper komen binnen, één keer', async ({ page, browser, isMobile }, info) => {
    test.setTimeout(300_000);
    const project = info.project.name;
    const stamp = `${project}-${Date.now().toString(36)}`;

    const ownerCtx = await browser.newContext({ ...(isMobile ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } : {}) });
    const owner = await ownerCtx.newPage();
    const { slug } = await signUpWearing(owner, `Ontvanger ${stamp}`);

    await signIn(page, ...KEEPER);
    await giveMunten(page, slug, 3, `Vooraf ${stamp}`);

    // Een pagina die ná een gift opent, meldt die gift niet.
    await owner.goto('/');
    await expect(owner.getByRole('main')).toBeVisible({ timeout: 20_000 });
    await owner.waitForTimeout(1500);
    await expect(owner.locator('.toast').filter({ hasText: `Vooraf ${stamp}` })).toHaveCount(0);

    // De Keeper geeft terwijl de speler op Start staat.
    const reden = `Voor sessie 13 ${stamp}`;
    await giveMunten(page, slug, 12, reden);
    const melding = owner.locator('.toast').filter({ hasText: reden });
    await expect(melding).toBeVisible({ timeout: 8000 });
    await expect(melding).toContainText(`+12 munten van de Keeper — ${reden}`);
    await expect(melding.getByRole('button', { name: 'Naar de kamer' })).toBeVisible();
    await expect(melding).toHaveCount(1);
    const saldo = isMobile ? owner.getByTestId('tab-jij-saldo') : owner.getByTestId('yours-saldo');
    await expect(saldo).toHaveAttribute('data-balance', '15');
    await expect(saldo.getByTestId('saldo-chip')).toHaveAttribute('data-richting', 'erbij');
    await shot(owner, 'keeper-melding', project);

    // Na herladen: geen tweede melding.
    await owner.reload();
    await expect(owner.getByRole('main')).toBeVisible({ timeout: 20_000 });
    await owner.waitForTimeout(2500);
    await expect(owner.locator('.toast').filter({ hasText: reden })).toHaveCount(0);

    // En ook op de kamerpagina zelf.
    await openKamer(owner, slug);
    const tweede = `Voor de kaart ${stamp}`;
    await giveMunten(page, slug, 4, tweede);
    await expect(owner.locator('.toast').filter({ hasText: tweede })).toHaveCount(1, { timeout: 8000 });
    await expect(owner.getByTestId('kamer-balance')).toHaveAttribute('data-balance', '19');
    await owner.waitForTimeout(1500);
    await expect(owner.locator('.toast').filter({ hasText: tweede })).toHaveCount(1);

    await ownerCtx.close();
  });

  test('ZAAK 4: geluid staat uit tot je het aanzet, en start pas bij een koop', async ({ page, browser, isMobile }, info) => {
    test.skip(isMobile, 'de schakelaar en de context zijn op de desk bewezen; de telefoon tekent dezelfde knop');
    test.setTimeout(300_000);
    const project = info.project.name;
    const stamp = `${project}-${Date.now().toString(36)}`;
    const kruk = `Kruk ${stamp}`;

    await signIn(page, ...KEEPER);
    await newHuisraad(page, { name: kruk, plekken: ['plank', 'bureau'], prijs: 1, effect: `Om op te staan ${stamp}` });

    const ownerCtx = await browser.newContext();
    // Een AudioContext die telt in plaats van speelt.
    await ownerCtx.addInitScript(() => {
      const w = window as unknown as { __klank: { contexts: number; voices: number } };
      w.__klank = { contexts: 0, voices: 0 };
      const param = () => ({
        value: 0,
        setValueAtTime() {},
        linearRampToValueAtTime() {},
        exponentialRampToValueAtTime() {},
      });
      const node = () => ({ connect() {}, disconnect() {} });
      class FakeContext {
        state = 'running';
        currentTime = 0;
        sampleRate = 44100;
        destination = node();
        constructor() {
          w.__klank.contexts += 1;
        }
        resume() {
          return Promise.resolve();
        }
        createGain() {
          return { ...node(), gain: param() };
        }
        createOscillator() {
          w.__klank.voices += 1;
          return { ...node(), type: 'sine', frequency: param(), start() {}, stop() {} };
        }
        createBufferSource() {
          w.__klank.voices += 1;
          return { ...node(), buffer: null, start() {}, stop() {} };
        }
        createBiquadFilter() {
          return { ...node(), type: 'lowpass', frequency: param(), Q: param() };
        }
        createBuffer(_channels: number, length: number) {
          const data = new Float32Array(length);
          return { sampleRate: 44100, getChannelData: () => data };
        }
      }
      (window as unknown as { AudioContext: unknown }).AudioContext = FakeContext;
    });
    const owner = await ownerCtx.newPage();
    const { slug } = await signUpWearing(owner, `Luisteraar ${stamp}`);
    await giveMunten(page, slug, 5, `Geluidgeld ${stamp}`);
    const klank = () => owner.evaluate(() => (window as unknown as { __klank: { contexts: number; voices: number } }).__klank);

    // Standaard uit: een koop maakt geen context.
    await openWinkel(owner);
    const rij = owner.getByTestId('winkel-rij').filter({ hasText: kruk });
    await rij.getByTestId('winkel-koop').click();
    await expect(owner.getByTestId('winkel-balance')).toHaveAttribute('data-balance', '4', { timeout: 20_000 });
    expect((await klank()).contexts).toBe(0);

    // Aanzetten op /you, bij Lettertype en Kleuren.
    await owner.goto('/you');
    const schakelaar = owner.getByTestId('klank');
    await expect(schakelaar).toBeVisible({ timeout: 20_000 });
    await expect(schakelaar.getByTestId('klank-uit')).toHaveAttribute('aria-pressed', 'true');
    await schakelaar.getByTestId('klank-aan').click();
    await expect(schakelaar.getByTestId('klank-aan')).toHaveAttribute('aria-pressed', 'true');
    await schakelaar.scrollIntoViewIfNeeded();
    await shot(owner, 'you-geluid', project);
    expect((await klank()).contexts, 'aanzetten maakt nog niets').toBe(0);

    // Bij de volgende koop wel: één context, en er klinkt iets.
    await openWinkel(owner);
    expect((await klank()).contexts, 'een navigatie maakt niets').toBe(0);
    await owner.getByTestId('winkel-rij').filter({ hasText: kruk }).getByTestId('winkel-koop').click();
    await expect(owner.getByTestId('winkel-balance')).toHaveAttribute('data-balance', '3', { timeout: 20_000 });
    await expect.poll(async () => (await klank()).contexts).toBe(1);
    await expect.poll(async () => (await klank()).voices).toBeGreaterThan(0);

    // Het blijft aan, in deze browser.
    await owner.goto('/you');
    await expect(owner.getByTestId('klank-aan')).toHaveAttribute('aria-pressed', 'true', { timeout: 20_000 });

    await ownerCtx.close();
  });

  test('ZAAK 5: uitdelen — elke rij krijgt haar +5', async ({ page, browser, isMobile }, info) => {
    test.skip(isMobile, 'de uitdeler is op de desk bewezen');
    test.setTimeout(300_000);
    const stamp = `${info.project.name}-${Date.now().toString(36)}`;

    const ownerCtx = await browser.newContext();
    const owner = await ownerCtx.newPage();
    await signUpWearing(owner, `Gift ${stamp}`);

    await signIn(page, ...KEEPER);
    await page.goto('/uitdelen');
    await expect(page.getByTestId('uitdelen-page')).toBeVisible({ timeout: 20_000 });
    await fillWhenReady(page.getByTestId('uitdelen-zoek'), `Gift ${stamp}`);
    const rows = page.getByTestId('uitdelen-rij');
    await expect(rows).toHaveCount(1, { timeout: 20_000 });
    await page.getByTestId('uitdelen-alles').click();
    await fillWhenReady(page.getByTestId('uitdelen-iedereen'), '5');
    await fillWhenReady(page.getByTestId('uitdelen-reden'), `Samen ${stamp}`);
    await page.getByTestId('uitdelen-geef').click();
    const chip = rows.first().getByTestId('uitdelen-chip');
    await expect(chip).toBeVisible({ timeout: 20_000 });
    await expect(chip).toHaveText('+5');
    await expectNothingLong(page);
    await page.waitForTimeout(300);
    await shot(page, 'uitdelen-chip', info.project.name);

    await ownerCtx.close();
  });

  test('ZAAK 6: een plek gaat open, het slotje draait open', async ({ page, browser, isMobile }, info) => {
    test.setTimeout(300_000);
    const project = info.project.name;
    const stamp = `${project}-${Date.now().toString(36)}`;

    const ownerCtx = await browser.newContext({ ...(isMobile ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } : {}) });
    const owner = await ownerCtx.newPage();
    const { slug } = await signUpWearing(owner, `Opener ${stamp}`);
    await signIn(page, ...KEEPER);
    await giveMunten(page, slug, 20, `Slotgeld ${stamp}`);

    await openKamer(owner, slug);
    const dicht = owner.locator('[data-testid="plek"][data-state="locked"]').filter({
      has: owner.getByTestId('plek-unlock'),
    });
    const tile = dicht.first();
    const id = (await tile.getAttribute('data-plek'))!;
    const vast = owner.locator(`[data-testid="plek"][data-plek="${id}"]`);
    await vast.getByTestId('plek-unlock').click();
    await expect(vast).toHaveAttribute('data-state', 'empty', { timeout: 20_000 });
    await expect(vast.locator('.plek-ring-zacht[data-on]')).toHaveCount(1, { timeout: 3000 });
    await expectNothingLong(owner);
    await shot(owner, 'kamer-ontsloten', project);
    // Het slotje valt weg, en na herladen komt het niet terug.
    await expect(vast.getByTestId('plek-slotje')).toHaveCount(0, { timeout: 3000 });
    await owner.reload();
    await expect(owner.getByTestId('kamer-grid')).toBeVisible({ timeout: 20_000 });
    await owner.waitForTimeout(800);
    await expect(owner.getByTestId('plek-slotje')).toHaveCount(0);
    await expect(owner.locator('.plek-ring[data-on]')).toHaveCount(0);

    await ownerCtx.close();
  });
});
