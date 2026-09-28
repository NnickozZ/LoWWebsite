import { mkdirSync } from 'node:fs';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { becomeInvestigator, fillWhenReady, inviteCode, signIn } from './helpers';

/**
 * §103 herstel (ronde 66, na de design-review) — de winkel, de kamer en `/you`.
 *
 *   ZAAK 1 (#18, #6, #19, #28) — de winkel: één prijs per rij, rood alleen
 *            voor wat je nu kunt kopen, één zin bij een plek die eerst open
 *            moet; *Gekocht* ligt op papier en blijft staan tot de rij
 *            wisselt; de prijs houdt zijn plek; de deur is een kleine knop.
 *   ZAAK 2 (#7, #20, #21, #28) — de kamer: *Bekijk* landt met ruimte erboven;
 *            de knoppen staan in de etiketregel, 44 px, boven de omslag en
 *            boven *Ingericht*; *Verplaatsen* alleen als er een plek is.
 *   ZAAK 3 (#24) — `/you`: één labelkolom, en de zin onder het geluid.
 *
 * Schermafbeeldingen gaan naar `/tmp/claude-0/shots-f2/`, om met eigen ogen te
 * kijken — niet om tegen te vergelijken.
 */

const KEEPER = ['Keeper', 'abbeytower34'] as const;
const SHOTS = '/tmp/claude-0/shots-f2';
mkdirSync(SHOTS, { recursive: true });

async function shot(page: Page, name: string, project: string) {
  await page.screenshot({ path: `${SHOTS}/e2e-${name}-${project}.png` });
}

async function signUpWearing(page: Page, name: string): Promise<{ slug: string }> {
  await page.goto('/signup');
  await page.getByLabel('Uitnodigingscode').fill(inviteCode());
  await page.getByLabel('Naam', { exact: true }).fill(name);
  await page.getByLabel('Wachtwoord', { exact: true }).fill('onderzeeboot');
  await page.getByLabel('Wachtwoord nogmaals').fill('onderzeeboot');
  await page.getByRole('button', { name: 'Account aanmaken' }).click();
  await page.waitForURL('**/');
  const path = await becomeInvestigator(page, `Onderzoeker ${name}`);
  return { slug: path.replace(/^\/e\//, '') };
}

async function newHuisraad(keeper: Page, spec: { name: string; plekken: string[]; prijs: number; effect: string }) {
  await keeper.goto('/wiki/huisraad');
  const status = await keeper.evaluate(
    async (body) =>
      (
        await fetch('/api/entries', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        })
      ).status,
    { typeSlug: 'huisraad', name: spec.name, fields: { plek: spec.plekken, prijs: spec.prijs, effect: spec.effect } },
  );
  expect(status).toBeLessThan(300);
}

async function openKamer(page: Page, slug: string) {
  await page.goto(`/kamer/${slug}`);
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

/** De positie van `inner` binnen `outer`. */
async function offset(outer: Locator, inner: Locator) {
  const a = (await outer.boundingBox())!;
  const b = (await inner.boundingBox())!;
  return { x: b.x - a.x, y: b.y - a.y, w: b.width, h: b.height };
}

test.describe('§103 herstel: de winkel en de kamer', () => {
  test('ZAAK 1+2: één prijs, een stempel die je ziet, en een tegel die landt', async ({ page, browser, isMobile }, info) => {
    test.setTimeout(300_000);
    const project = info.project.name;
    const stamp = `${project}-${Date.now().toString(36)}`;
    const lamp = `Bureaulamp ${stamp}`;
    const kist = `Scheepskist ${stamp}`;
    const kast = `Pronkkast ${stamp}`;

    await signIn(page, ...KEEPER);
    await newHuisraad(page, { name: lamp, plekken: ['bureau'], prijs: 2, effect: `Licht ${stamp}` });
    await newHuisraad(page, { name: kist, plekken: ['kist'], prijs: 4, effect: `Diep ${stamp}` });
    await newHuisraad(page, { name: kast, plekken: ['plank'], prijs: 40, effect: `Duur ${stamp}` });

    const ownerCtx = await browser.newContext({
      ...(isMobile ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } : {}),
    });
    const owner = await ownerCtx.newPage();
    const { slug } = await signUpWearing(owner, `Herstel ${stamp}`);
    await giveMunten(page, slug, 12, `Startgeld ${stamp}`);

    await owner.goto('/winkel');
    await expect(owner.getByTestId('winkel-balance')).toHaveAttribute('data-balance', '12', { timeout: 20_000 });
    const rij = (naam: string) => owner.getByTestId('winkel-rij').filter({ hasText: naam });

    /* ---------------------------------------- #28: de deur is een kleine knop */
    const deur = owner.getByTestId('winkel-kamer-deur');
    await expect(deur).toHaveClass(/\bbtn\b/);
    await expect(deur).toHaveClass(/\bbtn-small\b/);
    await expect(deur.locator('svg')).toHaveCount(1);

    /* ------------------------------------ #18: de prijs één keer, rood of rustig */
    const lampRij = rij(lamp);
    await expect(lampRij).toHaveAttribute('data-state', 'buy', { timeout: 20_000 });
    await expect(lampRij.getByTestId('winkel-prijs')).toHaveText('2 munten');
    await expect(lampRij.getByTestId('winkel-prijs')).not.toHaveClass(/winkel-prijs-rustig/);
    const koop = lampRij.getByTestId('winkel-koop');
    await expect(koop.locator('.koop-regel > span[aria-hidden="true"]')).toHaveText('Kopen → bureau');
    // §90: de hele zin, met de prijs, blijft de naam van de knop.
    await expect(koop).toHaveAccessibleName('Kopen · 2 munten → bureau');

    const kistRij = rij(kist);
    await expect(kistRij).toHaveAttribute('data-state', 'noslot');
    await expect(kistRij.getByTestId('winkel-prijs')).toHaveClass(/winkel-prijs-rustig/);
    const open = kistRij.getByTestId('plek-unlock');
    // §103 golf H (D8a): op één regel; de prijs van het ding is de stempel erboven.
    await expect(open).toHaveText('Eerst kist openen · 5');
    await expect(open).toHaveAccessibleName('Eerst een kist openen (5 munten), dan 4 munten');

    const kastRij = rij(kast);
    await expect(kastRij).toHaveAttribute('data-state', 'dear');
    await expect(kastRij.getByTestId('winkel-prijs')).toHaveClass(/winkel-prijs-rustig/);
    await expect(kastRij.getByTestId('winkel-short')).toContainText('28 munten');

    await lampRij.scrollIntoViewIfNeeded();
    await shot(owner, 'winkel-voor', project);
    const prijsVoor = await offset(lampRij, lampRij.getByTestId('winkel-prijs'));

    /* ------------------------ #6: Gekocht op papier, en lang genoeg om te zien */
    await owner.evaluate(() => {
      const t = ((window as unknown as { __t: Record<string, number> }).__t = {});
      const observer = new MutationObserver(() => {
        if (!t.bought && document.querySelector('[data-testid="winkel-koop"][data-bought]')) t.bought = performance.now();
        if (t.bought && !t.owned && document.querySelector('[data-state="noslot"] [data-testid="winkel-owned"]')) {
          t.owned = performance.now();
          observer.disconnect();
        }
      });
      observer.observe(document.body, { subtree: true, attributes: true, childList: true });
    });
    await koop.click();
    const gekocht = owner.getByTestId('winkel-gekocht');
    await expect(gekocht).toBeVisible({ timeout: 2000 });
    // Geen rood op rood: de knop heeft in hetzelfde frame zijn papier, zonder overgang.
    const knop = await koop.evaluate((el) => {
      const style = getComputedStyle(el);
      return { transition: style.transitionDuration, bg: style.backgroundColor, ink: getComputedStyle(el.querySelector('.koop-stempel')!).color };
    });
    expect(knop.transition.split(',').every((d) => parseFloat(d) === 0), `overgang ${knop.transition}`).toBe(true);
    expect(knop.bg).not.toBe(knop.ink);
    await owner.waitForTimeout(150);
    await shot(owner, 'winkel-gekocht', project);

    const owned = lampRij.getByTestId('winkel-owned');
    await expect(owned).toBeVisible({ timeout: 20_000 });
    const t = await owner.evaluate(() => (window as unknown as { __t: Record<string, number> }).__t);
    console.log(`#6 ${project}: Gekocht staat ${(t.owned - t.bought).toFixed(0)} ms voor de rij wisselt`);
    expect(t.owned - t.bought, 'Gekocht staat te kort').toBeGreaterThanOrEqual(500);

    // De kleine stempel blijft, en de prijs is nu rustig: er valt niets meer te doen.
    await expect(owned.getByTestId('winkel-gekocht-klein')).toHaveText(/gekocht/i);
    await expect(owned).toContainText('Staat in je kamer');
    await expect(lampRij.getByTestId('winkel-prijs')).toHaveClass(/winkel-prijs-rustig/);

    /* ------------------------------------------ #19: de stempel houdt zijn plek */
    const prijsNa = await offset(lampRij, lampRij.getByTestId('winkel-prijs'));
    expect(Math.abs(prijsNa.x - prijsVoor.x), 'de prijs sprong opzij').toBeLessThanOrEqual(2);
    if (isMobile) {
      expect(Math.abs(prijsNa.y - prijsVoor.y), 'de prijs sprong omhoog of omlaag').toBeLessThanOrEqual(2);
      const zin = await offset(lampRij, owned);
      expect(zin.y, 'de zin staat onder de stempel').toBeGreaterThanOrEqual(prijsNa.y + prijsNa.h - 2);
    }
    await shot(owner, 'winkel-na', project);

    /* ------------------------------------------------ #7: de tegel landt ruim */
    await owned.getByTestId('winkel-bekijk').click();
    await owner.waitForURL(`**/kamer/${slug}#plek-*`);
    const tegel = owner.locator('[data-testid="plek"][data-state="filled"]').filter({ hasText: lamp });
    await expect(tegel).toBeVisible({ timeout: 20_000 });
    await expect(owner.getByTestId('plek-ingericht')).toBeVisible({ timeout: 5000 });
    await owner.waitForTimeout(700);
    const boven = await tegel.evaluate((el) => el.getBoundingClientRect().top);
    expect(boven, 'de tegel plakt tegen de bovenrand').toBeGreaterThanOrEqual(48);
    await shot(owner, 'kamer-geland', project);

    /* --------------------------- #20: de werkbalk in de etiketregel, 44 px, boven alles */
    const balk = tegel.getByTestId('plek-werkbalk');
    await expect(balk).toBeVisible();
    const kruis = balk.getByTestId('plek-clear');
    const maat = (await kruis.boundingBox())!;
    expect(maat.height, 'het kruisje is te klein voor een vinger').toBeGreaterThanOrEqual(44);
    if (isMobile) expect(maat.width).toBeGreaterThanOrEqual(44);
    const plaats = await tegel.evaluate((el) => {
      const etiket = el.querySelector('.plek-kind')!.getBoundingClientRect();
      const balk = el.querySelector('.plek-werkbalk')!.getBoundingClientRect();
      const omslag = el.querySelector('.plek-cover')!.getBoundingClientRect();
      const kruis = el.querySelector('.plek-clear')!.getBoundingClientRect();
      const midden = document.elementFromPoint(kruis.left + kruis.width / 2, kruis.top + kruis.height / 2);
      return {
        opEenRegel: Math.abs(etiket.top + etiket.height / 2 - (balk.top + balk.height / 2)) <= 3,
        bovenDeOmslag: balk.bottom <= omslag.top + 1,
        kruisBovenop: Boolean(midden?.closest('.plek-clear')),
      };
    });
    expect(plaats.opEenRegel, 'etiket en knoppen staan niet op één regel').toBe(true);
    expect(plaats.bovenDeOmslag, 'de werkbalk ligt over de omslag').toBe(true);
    expect(plaats.kruisBovenop, 'iets (Ingericht?) ligt over het kruisje').toBe(true);
    await shot(owner, 'kamer-werkbalk', project);

    /* ---------------- #21: geen Verplaatsen zonder een vrij bureau om naartoe te gaan */
    await expect(tegel.getByTestId('plek-move')).toHaveCount(0);

    /* ------------------------------------------- #28: en de deur terug is dezelfde */
    const terug = owner.getByTestId('kamer-winkel');
    await expect(terug).toHaveClass(/\bbtn-small\b/);
    await expect(terug.locator('svg')).toHaveCount(1);

    await ownerCtx.close();
  });

  test('ZAAK 3: /you lijnt uit, en het geluid zegt wat het is', async ({ page, isMobile }, info) => {
    test.setTimeout(120_000);
    const stamp = `${info.project.name}-${Date.now().toString(36)}`;
    await signUpWearing(page, `Voorkeur ${stamp}`);
    await page.goto('/you');
    const hint = page.getByTestId('klank-hint');
    await expect(hint).toContainText('Een tik, een munt, een stempel — alleen in de kamer en de winkel.', {
      timeout: 20_000,
    });
    if (!isMobile) {
      // De eerste keuze van elke rij begint op dezelfde x, en de zin eronder ook.
      const xs = await page.locator('.you-prefs .you-pref-row').evaluateAll((rows) =>
        rows.map((row) => Math.round(row.querySelector('.chip-selectable')!.getBoundingClientRect().left)),
      );
      expect(xs.length).toBe(3);
      expect(new Set(xs).size, `de chips beginnen op ${xs.join(', ')}`).toBe(1);
      const hintX = await hint.evaluate((el) => {
        const box = el.getBoundingClientRect();
        return Math.round(box.left + parseFloat(getComputedStyle(el).paddingLeft));
      });
      expect(Math.abs(hintX - xs[0])).toBeLessThanOrEqual(2);
    }
    await page.getByTestId('klank').scrollIntoViewIfNeeded();
    await shot(page, 'you', info.project.name);
  });
});
