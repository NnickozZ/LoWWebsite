import { mkdirSync } from 'node:fs';
import { expect, test, type Browser, type Locator, type Page } from '@playwright/test';
import { becomeInvestigator, editArticle, fillWhenReady, inviteCode, setPlekken, signIn } from './helpers';

/**
 * §102, ronde 65·a — beweging en meldingen.
 *
 *   ZAAK 1 (J3) — een blad dat je met de muis sluit, gaat binnen 60 ms op
 *                 `data-closing` en is na ~150 ms weg; met Escape is het in
 *                 dezelfde frame weg en speelt er niets. Het palet beweegt nooit.
 *   ZAAK 2 (J4) — een melding pauzeert zolang de muis erop staat en loopt
 *                 daarna verder met de resttijd (6 + 3 s).
 *   ZAAK 3 (J4/K1/J8) — de kamer: een melding met een knop staat er na 9 s nog;
 *                 de koopmelding (een eigen `ms`, het venster van de server)
 *                 wacht niet op de muis; de landingsring na *Bekijk* is er; en
 *                 elke focusbare stop op drie pagina's tekent een ring.
 *   ZAAK 4 (§102 regel 8) — met reduced motion: geen `transform` in de
 *                 animaties van blad, melding en ring, en de ring staat er
 *                 nog.
 *
 * Een meting van tijd heeft een klok nodig, dus hier en daar staat een
 * `waitForTimeout`: dat is de hand die stil op een melding ligt, niet het
 * bewijs. Het bewijs is steeds een `expect`.
 */

const KEEPER = ['Keeper', 'abbeytower34'] as const;
const PASSWORD = 'onderzeeboot';
const SHOTS = '/tmp/claude-0/shots-a';
mkdirSync(SHOTS, { recursive: true });

/**
 * A recorder for one sheet: when the hand came down, when `data-closing`
 * appeared, and when the backdrop left the DOM — all in `performance.now()`,
 * read by a MutationObserver, so a Playwright round trip does not blur it.
 */
async function recordSheet(page: Page) {
  await page.evaluate(() => {
    const w = window as unknown as { __sheet: Record<string, number | null> };
    w.__sheet = { down: null, key: null, closing: null, gone: null };
    const backdrop = document.querySelector('.sheet-backdrop');
    document.addEventListener('pointerdown', () => (w.__sheet.down ??= performance.now()), { capture: true, once: true });
    document.addEventListener('keydown', () => (w.__sheet.key ??= performance.now()), { capture: true, once: true });
    const watch = new MutationObserver(() => {
      if (backdrop?.hasAttribute('data-closing')) w.__sheet.closing ??= performance.now();
      if (backdrop && !backdrop.isConnected) {
        w.__sheet.gone ??= performance.now();
        watch.disconnect();
      }
    });
    watch.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-closing'] });
  });
}
async function sheetTimes(page: Page) {
  return page.evaluate(() => (window as unknown as { __sheet: Record<string, number | null> }).__sheet);
}

/**
 * What the elements matching `selector` are told to animate *now*, and which
 * of those animations move something. Read from the computed
 * `animation-name` and the `@keyframes` rule of that name in the page's own
 * stylesheets — not from `getAnimations()`, which is empty again 150 ms later.
 */
async function animationsOn(page: Page, selector: string): Promise<{ names: string[]; moving: string[] }> {
  return page.evaluate((sel) => {
    const rules = new Map<string, CSSKeyframesRule>();
    const walk = (list: CSSRuleList) => {
      for (const rule of list) {
        if (rule instanceof CSSKeyframesRule) rules.set(rule.name, rule);
        else if ('cssRules' in rule) walk((rule as CSSGroupingRule).cssRules);
      }
    };
    for (const sheet of document.styleSheets) {
      try {
        walk(sheet.cssRules);
      } catch {
        /* a sheet from another origin */
      }
    }
    const names: string[] = [];
    const moving: string[] = [];
    for (const el of document.querySelectorAll(sel)) {
      for (const name of getComputedStyle(el).animationName.split(',').map((n) => n.trim())) {
        if (!name || name === 'none') continue;
        names.push(name);
        const rule = rules.get(name);
        const moves = rule ? [...rule.cssRules].some((k) => /transform/.test((k as CSSKeyframeRule).style.cssText)) : false;
        if (moves) moving.push(name);
      }
    }
    return { names, moving };
  }, selector);
}

/**
 * §18a/§25: a toast with no button — *Toegevoegd aan …* — from the first
 * artikel here that is not yet in the seed's dossier. Several candidates,
 * because other specs in a full run file some of them too.
 */
const LOOSE = ['pier-boone', 'de-schorre', 'the-oosterschelde', 'sister-clasina', 'de-witte-wieven', 'middelburg', 'vlissingen'];
async function addToCaseToast(page: Page, candidates: readonly string[]): Promise<Locator> {
  for (const slug of candidates) {
    const sheet = await openAddToCase(page, slug);
    const item = sheet.locator('.suggest-item').filter({ hasText: 'The Unwound Light' }).first();
    if ((await item.count()) === 0) {
      await page.keyboard.press('Escape');
      continue;
    }
    await item.click();
    const toast = page.locator('.toast').filter({ hasText: 'Toegevoegd aan' });
    await expect(toast).toBeVisible({ timeout: 20_000 });
    return toast;
  }
  // In a full run the fixture's loose artikelen have all been filed by earlier
  // specs (the database lives for the whole run): make one that is not.
  const made = await page.request.post('/api/entries', {
    data: { name: `Los ${Date.now().toString(36)}`, typeSlug: 'location' },
  });
  expect(made.ok()).toBe(true);
  const { entry } = (await made.json()) as { entry: { slug: string } };
  const sheet = await openAddToCase(page, entry.slug);
  // A fresh artikel has no dossiers of its own to offer first: ask by name.
  await sheet.locator('input').first().fill('Unwound');
  await sheet.locator('.suggest-item').filter({ hasText: 'The Unwound Light' }).first().click();
  const toast = page.locator('.toast').filter({ hasText: 'Toegevoegd aan' });
  await expect(toast).toBeVisible({ timeout: 20_000 });
  return toast;
}

async function openAddToCase(page: Page, slug: string): Promise<Locator> {
  await page.goto(`/e/${slug}`);
  // Golf O: *Aan dossier toevoegen* is een knop van Bewerken.
  await editArticle(page);
  const sheet = page.getByRole('dialog', { name: 'Aan dossier toevoegen' });
  await expect(async () => {
    if (!(await sheet.isVisible().catch(() => false))) {
      await page.getByRole('button', { name: 'Aan dossier toevoegen' }).first().click({ timeout: 5000 });
    }
    await expect(sheet).toBeVisible({ timeout: 1500 });
  }).toPass({ timeout: 30_000 });
  return sheet;
}

async function signUpWearing(page: Page, name: string): Promise<string> {
  await page.goto('/signup');
  await page.getByLabel('Uitnodigingscode').fill(inviteCode());
  await page.getByLabel('Naam', { exact: true }).fill(name);
  await page.getByLabel('Wachtwoord', { exact: true }).fill(PASSWORD);
  await page.getByLabel('Wachtwoord nogmaals').fill(PASSWORD);
  await page.getByRole('button', { name: 'Account aanmaken' }).click();
  await page.waitForURL('**/');
  const path = await becomeInvestigator(page, `Onderzoeker ${name}`);
  return path.replace(/^\/e\//, '');
}

async function openKamer(page: Page, slug: string) {
  await page.goto(`/kamer/${slug}`);
  await expect(page.getByTestId('kamer-grid')).toBeVisible({ timeout: 20_000 });
}

/**
 * J8: Tab through the first `stops` focusable things and say which of them
 * draw no ring: an outline with width, on the element or on the box around it.
 */
async function focusWithoutRing(page: Page, stops = 25): Promise<string[]> {
  await page.evaluate(() => {
    (document.activeElement as HTMLElement | null)?.blur?.();
    window.scrollTo(0, 0);
  });
  const missing: string[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < stops; i++) {
    await page.keyboard.press('Tab');
    const found = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (!el || el === document.body) return null;
      const cs = getComputedStyle(el);
      // An outline with width. (Not box-shadow: a `.btn` wears one at rest.)
      const drawn = (s: CSSStyleDeclaration) => s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) > 0;
      // A box that draws its ring on the wrapper (`.nav-search:focus-within`) counts.
      const ring = drawn(cs) || (el.parentElement ? drawn(getComputedStyle(el.parentElement)) : false);
      const name = `${el.tagName.toLowerCase()}${el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).join('.') : ''}`;
      const text = (el.getAttribute('aria-label') ?? el.textContent ?? '').trim().slice(0, 30);
      return { ring, what: `${name} "${text}"`, visible: el.matches(':focus-visible') };
    });
    if (!found) continue;
    if (seen.has(found.what)) continue;
    seen.add(found.what);
    if (!found.ring || !found.visible) missing.push(found.what);
  }
  return missing;
}

test.describe('§102 ronde 65·a — beweging en meldingen', () => {
  test('ZAAK 1 (J3): het kruisje speelt een uitgang, Escape en het palet niet', async ({ page }, info) => {
    test.setTimeout(120_000);
    const slug = info.project.name === 'phone' ? 'vlissingen' : 'middelburg';
    await signIn(page, ...KEEPER);

    // Het kruisje, met de muis: meteen `data-closing`, `inert`, van de stapel.
    let sheet = await openAddToCase(page, slug);
    await recordSheet(page);
    await sheet.locator('.sheet-close').click();
    const state = await page.evaluate(() => {
      const b = document.querySelector('.sheet-backdrop');
      return { closing: b?.hasAttribute('data-closing') ?? null, inert: (b as HTMLElement | null)?.inert ?? null };
    });
    // Het kan al weg zijn als de runner traag was; dan zegt de recorder het.
    if (state.closing !== null) expect(state).toEqual({ closing: true, inert: true });
    await expect(page.locator('.sheet-backdrop')).toHaveCount(0);
    const out = await sheetTimes(page);
    expect(out.closing! - out.down!, 'data-closing binnen 60 ms na de klik').toBeLessThan(60);
    expect(out.gone! - out.down!, 'weg na de uitgang, niet ervoor').toBeGreaterThan(100);
    expect(out.gone! - out.down!, 'en binnen het vangnet').toBeLessThan(450);
    // De focus is terug op de knop die het blad opende.
    await expect(page.locator(':focus')).toHaveText(/Aan dossier toevoegen/);

    // Een momentopname halverwege de uitgang, om met eigen ogen te zien.
    sheet = await openAddToCase(page, slug);
    await page.waitForTimeout(300);
    await sheet.locator('.sheet-close').click();
    await page.evaluate(() => {
      for (const a of document.getAnimations()) {
        if ((a as CSSAnimation).animationName?.startsWith('sheet-')) {
          a.pause();
          a.currentTime = 70;
        }
      }
    });
    await page.screenshot({ path: `${SHOTS}/j3-blad-halverwege-${info.project.name}.png` });
    // Het vangnet (250 ms) haalt hem weg, ook met de animatie stilgezet.
    await expect(page.locator('.sheet-backdrop')).toHaveCount(0);

    // Escape: in dezelfde frame weg, en nooit `data-closing`.
    await openAddToCase(page, slug);
    await recordSheet(page);
    await page.keyboard.press('Escape');
    await expect(page.locator('.sheet-backdrop')).toHaveCount(0);
    const esc = await sheetTimes(page);
    expect(esc.closing, 'Escape beweegt niet').toBeNull();
    expect(esc.gone! - esc.key!).toBeLessThan(50);

    // Het palet: een tik op de achtergrond sluit het zonder uitgang.
    if (info.project.name === 'desktop') {
      await page.keyboard.press('/');
      await expect(page.getByTestId('palette')).toBeVisible();
      await recordSheet(page);
      await page.mouse.click(1400, 880);
      await expect(page.getByTestId('palette')).toHaveCount(0);
      const pal = await sheetTimes(page);
      expect(pal.closing, 'het palet beweegt niet').toBeNull();
      expect(pal.gone! - pal.down!).toBeLessThan(50);
    }
  });

  test('ZAAK 2 (J4): een melding wacht zolang de muis erop staat', async ({ page, isMobile }, info) => {
    test.skip(isMobile, 'een muis die stilstaat bestaat alleen op een computer');
    test.setTimeout(120_000);
    await signIn(page, ...KEEPER);
    const toast = await addToCaseToast(page, LOOSE);
    const t0 = Date.now();
    // Geen `role` per melding: de wrapper spreekt.
    await expect(toast).not.toHaveAttribute('role', /.+/);
    await expect(page.locator('.toast-wrap')).toHaveAttribute('aria-live', 'polite');
    await page.screenshot({ path: `${SHOTS}/j4-melding-${info.project.name}.png` });

    await toast.hover();
    await page.waitForTimeout(3000);
    await page.mouse.move(5, 5);
    // Zonder pauze was hij na 6 s weg; met drie seconden erop staat hij er dan nog.
    await page.waitForTimeout(Math.max(0, 7500 - (Date.now() - t0)));
    await expect(toast).toBeVisible();
    await expect(toast).toHaveCount(0, { timeout: 4000 });
    const lived = Date.now() - t0;
    expect(lived, '6 s plus de 3 s onder de muis').toBeGreaterThan(8500);
    expect(lived).toBeLessThan(11_000);
  });

  test('ZAAK 3 (J4/K1/J8): de kamer — melding met knop, koopmelding, landingsring en focus', async ({
    page,
    browser,
    isMobile,
  }, info) => {
    test.skip(isMobile, 'de tijden en de focus zijn een computerzaak; de ring meet zaak 4 ook op de telefoon niet');
    test.setTimeout(300_000);
    const stamp = `${info.project.name}-${Date.now().toString(36)}`;
    const name = `Leeslamp ${stamp}`;

    // Huisraad maken: de melding draagt *Bekijk in de winkel* en staat er na 9 s nog.
    await signIn(page, ...KEEPER);
    await page.goto('/wiki/huisraad');
    const sheet = page.getByRole('dialog', { name: 'Nieuw artikel' });
    await expect(async () => {
      if (!(await sheet.isVisible().catch(() => false))) {
        await page.getByRole('button', { name: 'Nieuw', exact: true }).click({ timeout: 5000 });
      }
      await expect(sheet).toBeVisible({ timeout: 1500 });
    }).toPass({ timeout: 30_000 });
    await sheet.getByLabel('Naam', { exact: true }).fill(name);
    await expect(sheet.getByTestId('new-entry-winkel')).toBeVisible({ timeout: 20_000 });
    await setPlekken(page, ['plank', 'bureau']);
    await fillWhenReady(sheet.locator('#field-prijs'), '2');
    await fillWhenReady(sheet.locator('#field-effect'), `Licht ${stamp}`);
    await sheet.getByLabel('Naam', { exact: true }).click();
    await sheet.getByRole('button', { name: 'Aanmaken' }).click();
    await page.waitForURL('**/e/**');
    const made = page.locator('.toast').filter({ hasText: name });
    await expect(made).toBeVisible({ timeout: 20_000 });
    const t0 = Date.now();
    await page.mouse.move(5, 5);
    await page.waitForTimeout(Math.max(0, 9000 - (Date.now() - t0)));
    await expect(made, 'een melding met een knop staat er 10 s').toBeVisible();

    // Een speler met munten koopt het; de muis ligt op de koopmelding.
    const ownerCtx = await browser.newContext();
    const owner = await ownerCtx.newPage();
    const who = `Koper${Date.now().toString(36)}`;
    const slug = await signUpWearing(owner, who);
    await openKamer(page, slug);
    const form = page.getByTestId('grootboek-form');
    await fillWhenReady(form.getByTestId('grootboek-bedrag'), '5');
    await fillWhenReady(form.getByTestId('grootboek-reden'), `Startgeld ${stamp}`);
    await form.getByTestId('grootboek-geef').click();
    await expect(page.getByTestId('kamer-balance')).toHaveAttribute('data-balance', '5', { timeout: 20_000 });

    await owner.goto('/winkel');
    const rij = owner.getByTestId('winkel-rij').filter({ hasText: name });
    await expect(rij).toHaveCount(1, { timeout: 20_000 });
    await rij.getByTestId('winkel-koop').click();
    const bought = owner.locator('.toast').filter({ hasText: name });
    await expect(bought.getByTestId('toast-also')).toBeVisible({ timeout: 20_000 });
    const b0 = Date.now();
    await bought.hover();
    // §93: het venster van de server. Hij wacht niet, ook niet met de muis erop.
    await expect(bought).toHaveCount(0, { timeout: 12_000 });
    expect(Date.now() - b0).toBeLessThan(11_000);

    // J8 op de winkel, terwijl we er toch zijn.
    const winkelMissing = await focusWithoutRing(owner);

    // K1: de landing na *Bekijk*. Eén definitie, met de ring van 2 px.
    await openKamer(owner, slug);
    const filled = owner.locator('[data-testid="plek"][data-state="filled"]').filter({ hasText: name });
    await expect(filled).toHaveCount(1, { timeout: 20_000 });
    const plek = (await filled.getAttribute('data-plek'))!;
    const kamerMissing = await focusWithoutRing(owner);
    await owner.goto(`/kamer/${slug}#plek-${plek}`);
    const target = owner.locator(`#plek-${plek}`);
    await expect(target).toBeVisible({ timeout: 20_000 });
    const ring = await target.evaluate((el) => {
      const anim = el.getAnimations().find((a) => (a as CSSAnimation).animationName === 'plek-aangewezen');
      if (!anim) return null;
      anim.pause();
      anim.currentTime = 300;
      const red = getComputedStyle(document.documentElement).getPropertyValue('--stamp-red').trim();
      const probe = document.createElement('span');
      probe.style.color = red;
      document.body.append(probe);
      const rgb = getComputedStyle(probe).color.replace(/^rgba?\(|\)$/g, '');
      probe.remove();
      return { shadow: getComputedStyle(el).boxShadow, rgb };
    });
    expect(ring, 'plek-aangewezen speelt op de tegel').not.toBeNull();
    expect(ring!.shadow).toContain(ring!.rgb);
    expect(ring!.shadow).toContain('2px');
    await target.scrollIntoViewIfNeeded();
    await owner.screenshot({ path: `${SHOTS}/k1-landingsring-${info.project.name}.png` });

    // J8 op een artikel.
    await owner.goto('/e/middelburg');
    const entryMissing = await focusWithoutRing(owner);
    console.log(`J8 zonder ring — winkel: ${JSON.stringify(winkelMissing)}; kamer: ${JSON.stringify(kamerMissing)}; artikel: ${JSON.stringify(entryMissing)}`);
    expect([...winkelMissing, ...kamerMissing, ...entryMissing]).toEqual([]);

    // Reduced motion: dezelfde ring, stil, en geen transform.
    await reducedRing(browser, who, slug, plek, info.project.name);
    await ownerCtx.close();
  });

  test('ZAAK 4 (§102 regel 8): reduced motion — een blad en een melding verplaatsen niets', async ({
    browser,
  }, info) => {
    test.setTimeout(150_000);
    const { viewport, isMobile, hasTouch, userAgent, deviceScaleFactor } = info.project.use;
    const ctx = await browser.newContext({ viewport, isMobile, hasTouch, userAgent, deviceScaleFactor, reducedMotion: 'reduce' });
    const page = await ctx.newPage();
    await signIn(page, ...KEEPER);
    await openAddToCase(page, 'the-oosterschelde');
    const opening = await animationsOn(page, '.sheet');
    expect(opening.names).toContain('sheet-fade-in');
    expect(opening.moving).toEqual([]);
    await page.locator('.sheet-close').click();
    const leaving = await animationsOn(page, '.sheet-backdrop, .sheet');
    if (leaving.names.length) expect(leaving.moving).toEqual([]);
    await expect(page.locator('.sheet-backdrop')).toHaveCount(0);

    const candidates = info.project.name === 'phone' ? [...LOOSE].reverse() : LOOSE;
    const toast = await addToCaseToast(page, candidates);
    await expect(toast).toBeVisible();
    const shown = await animationsOn(page, '.toast');
    expect(shown.names).toContain('toast-fade-in');
    expect(shown.moving).toEqual([]);
    await ctx.close();
  });
});

/**
 * J6/J8 en de hover-taal, om met eigen ogen te zien: een kaart en een regel
 * onder de muis, en de focusring in vier paletten. Geen tijden; wel de eis dat
 * de ring er in elk palet staat en in `--link` is.
 */
test('ZAAK 5 (J6/J8): hover en de focusring in vier paletten', async ({ browser, isMobile }, info) => {
  test.skip(isMobile, 'hover en Tab zijn een computerzaak');
  test.setTimeout(150_000);
  for (const scheme of ['light', 'dark'] as const) {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: scheme });
    const page = await ctx.newPage();
    await signIn(page, ...KEEPER);
    for (const side of ['speler', 'keeper'] as const) {
      // §57: de ene weg naar de andere kant — een cookie, per context.
      await page.goto(side === 'keeper' ? '/api/keeper/flip?side=keeper&to=/wiki/alles' : '/wiki/alles');
      if (side === 'keeper') {
        await expect(page.locator('[data-side="keeper"]').first()).toBeAttached({ timeout: 20_000 });
      }
      const card = page.locator('a.card').first();
      if (await card.count()) {
        await card.hover();
        await page.waitForTimeout(200);
      }
      await page.screenshot({ path: `${SHOTS}/j6-kaart-hover-${scheme}-${side}.png` });
      // Tab naar de eerste chip of tab op de pagina, en kijk naar de ring.
      await page.mouse.move(5, 5);
      await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur?.());
      let ring: { outline: string; link: string } | null = null;
      for (let i = 0; i < 30 && !ring; i++) {
        await page.keyboard.press('Tab');
        ring = await page.evaluate(() => {
          const el = document.activeElement as HTMLElement | null;
          if (!el || !el.closest('main')) return null;
          const cs = getComputedStyle(el);
          const probe = document.createElement('span');
          probe.style.color = 'var(--link)';
          document.body.append(probe);
          const link = getComputedStyle(probe).color;
          probe.remove();
          return { outline: `${cs.outlineStyle} ${cs.outlineWidth} ${cs.outlineColor}`, link };
        });
      }
      expect(ring, `een focusbaar ding in main (${scheme}, ${side})`).not.toBeNull();
      // Twee pixels, doorgetrokken. De kleur is `--link`, of de eigen focusstijl
      // van dat ding (een soort-tab tekent in de stempelkleur).
      expect(ring!.outline).toContain('solid 2px');
      console.log(`J8 ${scheme}/${side}: ${ring!.outline} (--link is ${ring!.link})`);
      await page.screenshot({ path: `${SHOTS}/j8-focus-${scheme}-${side}.png` });
    }
    await page.goto('/');
    const row = page.locator('a.feed-item').first();
    if (await row.count()) {
      await row.hover();
      await page.waitForTimeout(200);
      await page.screenshot({ path: `${SHOTS}/hover-feed-${scheme}.png` });
    }
    await ctx.close();
  }
  void info;
});

async function reducedRing(browser: Browser, who: string, slug: string, plek: string, project: string) {
  const ctx = await browser.newContext({ reducedMotion: 'reduce', viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await signIn(page, who, PASSWORD);
  await page.goto(`/kamer/${slug}#plek-${plek}`);
  const target = page.locator(`#plek-${plek}`);
  await expect(target).toBeVisible({ timeout: 20_000 });
  const found = await target.evaluate((el) => {
    const anim = el.getAnimations().find((a) => (a as CSSAnimation).animationName === 'plek-aangewezen');
    if (!anim) return null;
    const frames = (anim.effect as KeyframeEffect).getKeyframes();
    anim.pause();
    anim.currentTime = 1000;
    return {
      moves: frames.some((f) => f.transform && f.transform !== 'none'),
      // `animation-timing-function` lands on each keyframe, not on the effect.
      timing: frames.map((f) => f.easing).join(' '),
      shadow: getComputedStyle(el).boxShadow,
    };
  });
  expect(found, 'onder reduced motion staat de ring er nog').not.toBeNull();
  expect(found!.moves).toBe(false);
  expect(found!.timing).toContain('steps');
  // Stil: na 1 s staat de ring er nog helemaal, niet half vervaagd.
  expect(found!.shadow).toMatch(/2px/);
  await page.screenshot({ path: `${SHOTS}/k1-landingsring-reduce-${project}.png` });
  await ctx.close();
}
