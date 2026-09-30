import { mkdirSync } from 'node:fs';
import { expect, test, type CDPSession, type Page } from '@playwright/test';
import { editArticle, signIn } from './helpers';

/**
 * §102 (ronde 65·b, J2): een navigatie zegt dat hij loopt.
 *
 * Drie lagen, elk met een eigen bewijs:
 *   (a)  het aangeklikte vakje heeft binnen 100 ms `data-pending`;
 *   (a2) een chip in een editor in Bewerken start geen streep;
 *   (b)  bij 300 ms vertraging is de streep na 150–300 ms zichtbaar;
 *   (c)  bij 0 ms wordt de streep nooit zichtbaar;
 *   (d)  golf M: bij 300 ms blijft de oude pagina staan, met alleen de streep
 *        erboven — geen skelet — en het anker landt daarna;
 *   (e)  de 404-status blijft een 404 (§89);
 * plus, sinds golf M, dat de nieuwe pagina niet meer invervaagt: één wissel.
 *
 * Golf M (A1) haalde het skelet en de fade van ronde 68 weg (Nick: "it blinks").
 *
 * De vertraging gaat via CDP (`Network.emulateNetworkConditions`), dus die
 * zaken draaien alleen in Chromium op de desk. Tijden worden in de pagina zelf
 * gemeten (`performance.now()` en een `MutationObserver`), niet met
 * `waitForTimeout`: een Playwright-rondreis duurt zelf tientallen ms.
 */

const KEEPER = ['Keeper', 'abbeytower34'] as const;
const SHOTS = '/tmp/claude-0/shots-b';

type NavRecord = {
  t0: number | null;
  pending: number | null;
  shown: number | null;
  shownEver: boolean;
  skeleton: number | null;
  /** Wanneer het pad wisselde: de nieuwe pagina staat er. */
  arrived: number | null;
  animations: { name: string; canvas: boolean }[];
};

async function lagOf(page: Page): Promise<CDPSession> {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Network.enable');
  return cdp;
}

async function lag(cdp: CDPSession, latency: number) {
  await cdp.send('Network.emulateNetworkConditions', {
    offline: false,
    latency,
    downloadThroughput: -1,
    uploadThroughput: -1,
  });
}

/** Zet de meter in de pagina: alles in ms vanaf de volgende klik. */
async function arm(page: Page) {
  await page.evaluate(() => {
    const rec: NavRecord = { t0: null, pending: null, shown: null, shownEver: false, skeleton: null, arrived: null, animations: [] };
    const from = location.pathname;
    (window as unknown as { __nav: NavRecord }).__nav = rec;
    const since = () => Math.round(performance.now() - (rec.t0 ?? 0));
    const look = () => {
      if (rec.t0 === null) return;
      if (rec.pending === null && document.querySelector('a[data-pending]')) rec.pending = since();
      if (document.querySelector('.nav-progress[data-shown="1"]')) {
        rec.shownEver = true;
        if (rec.shown === null) rec.shown = since();
      }
      if (rec.skeleton === null && document.querySelector('main .skeleton')) rec.skeleton = since();
      if (rec.arrived === null && location.pathname !== from) rec.arrived = since();
    };
    document.addEventListener(
      'click',
      () => {
        if (rec.t0 === null) rec.t0 = performance.now();
      },
      { capture: true },
    );
    document.addEventListener('animationstart', (event) => {
      const target = event.target as Element;
      rec.animations.push({
        name: event.animationName,
        canvas: Boolean(target.matches?.('.page-canvas') || target.querySelector?.('.page-canvas')),
      });
    });
    new MutationObserver(look).observe(document.documentElement, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['data-pending', 'data-shown'],
    });
  });
}

const read = (page: Page) => page.evaluate(() => (window as unknown as { __nav: NavRecord }).__nav);

/** Op een pagina staan, en wachten tot Next heeft opgehaald wat hij vooraf ophaalt. */
async function settle(page: Page, cdp: CDPSession, path: string) {
  await lag(cdp, 0);
  await page.goto(path);
  // Geen `networkidle`: de live-lijn (§60) staat altijd open.
  await page.waitForTimeout(1500);
}

test.describe('ronde 65·b — de navigatie zegt dat hij loopt', () => {
  test.beforeEach(({ browserName, isMobile }) => {
    test.skip(browserName !== 'chromium' || isMobile, 'de vertraging gaat via CDP, op de desk');
  });

  test('(a) het vakje heeft binnen 100 ms data-pending, en aria-current volgt de waarheid', async ({ page }) => {
    await signIn(page, ...KEEPER);
    const cdp = await lagOf(page);
    await settle(page, cdp, '/cases');
    await lag(cdp, 300);
    await arm(page);
    const nav = page.getByRole('navigation', { name: 'Hoofdmenu' });
    const wiki = nav.getByRole('link', { name: 'Wiki', exact: true });
    await wiki.click({ noWaitAfter: true });

    await expect.poll(async () => (await read(page)).pending, { timeout: 5_000 }).not.toBeNull();
    expect((await read(page)).pending!).toBeLessThanOrEqual(100);
    // De tekening loopt vooruit, de waarheid niet: zolang het vakje wacht,
    // staat aria-current nog op Dossiers.
    const now = await page.evaluate(() => ({
      pending: document.querySelector('.sidenav a[data-pending]')?.getAttribute('href') ?? null,
      current: document.querySelector('.sidenav a[aria-current="page"]')?.getAttribute('href') ?? null,
    }));
    if (now.pending) expect(now.current).toBe('/cases');

    await page.waitForURL('**/wiki');
    await expect(wiki).toHaveAttribute('aria-current', 'page');
    await expect(page.locator('a[data-pending]')).toHaveCount(0);
    await lag(cdp, 0);
  });

  test('(a2) een chip in een editor in Bewerken start geen streep', async ({ page }, info) => {
    await signIn(page, ...KEEPER);
    /*
     * Een chip in de korte beschrijving: in Bewerken zet een klik erop de
     * caret erachter en blijft de pagina staan (§98). `cleanShort` maakt van
     * een uitgeschreven `[[Naam]]` een chip als de schrijver dat artikel mag
     * zien.
     */
    const name = `Kaartlezer ${info.project.name}-${Date.now().toString(36)}`;
    const made = await page.request.post('/api/entries', {
      data: { name, typeSlug: 'character', shortDescription: 'Woont bij [[Westkapelle Lighthouse]].' },
    });
    expect(made.ok()).toBe(true);
    const { slug } = ((await made.json()) as { entry: { slug: string } }).entry;
    const cdp = await lagOf(page);
    await settle(page, cdp, `/e/${slug}`);
    await editArticle(page);
    const lead = page.locator('#entry-lead');
    await expect(lead).toHaveAttribute('contenteditable', 'true', { timeout: 20_000 });
    const chip = lead.locator('.short-chip').first();
    await expect(chip).toBeVisible({ timeout: 20_000 });
    await page.waitForTimeout(400);
    await lag(cdp, 300);
    await arm(page);
    await chip.click();
    // Een streep zou na 150 ms staan; geef hem ruim de tijd om het niet te doen.
    await page.waitForTimeout(700);
    const rec = await read(page);
    expect(rec.t0).not.toBeNull();
    expect(rec.shownEver).toBe(false);
    expect(rec.skeleton).toBeNull();
    expect(new URL(page.url()).pathname).toBe(`/e/${slug}`);
    await lag(cdp, 0);
  });

  test('(b) bij 300 ms staat de streep er na 150–300 ms, en gaat hij weer weg', async ({ page }) => {
    await signIn(page, ...KEEPER);
    const cdp = await lagOf(page);
    await settle(page, cdp, '/wiki');
    await lag(cdp, 300);
    await arm(page);
    // Golf h1 (T7): Dossiers heeft sinds deze golf een skelet; de streep is
    // voor een pagina zonder vaste vorm, zoals Beheer.
    await page.getByTestId('nav-admin').click({ noWaitAfter: true });

    await expect.poll(async () => (await read(page)).shown, { timeout: 5_000 }).not.toBeNull();
    const shown = (await read(page)).shown!;
    expect(shown).toBeGreaterThanOrEqual(150);
    expect(shown).toBeLessThanOrEqual(300);
    await expect(page.locator('.nav-progress')).toHaveAttribute('role', 'progressbar');
    await expect(page.locator('.nav-progress')).toHaveAttribute('aria-label', 'Pagina wordt geladen');

    await page.waitForURL('**/admin');
    await expect(page.locator('.nav-progress')).toHaveAttribute('data-shown', '0', { timeout: 5_000 });
    await lag(cdp, 0);
  });

  test('(c) bij 0 ms wordt de streep nooit zichtbaar', async ({ page }) => {
    await signIn(page, ...KEEPER);
    const cdp = await lagOf(page);
    /*
     * "Nooit" betekent: niet bij een navigatie die binnen 150 ms klaar is. Op
     * een machine onder last kan een lijst zonder vooraf opgehaalde pagina
     * ook bij 0 ms langer duren, en dan hoort de streep er juist te komen —
     * dus wat hier gemeten wordt is de belofte zelf: wie er binnen 150 ms is,
     * ziet niets, en wie er langer over doet, ziet de streep niet vóór 150 ms.
     */
    const promise = async () => {
      const rec = await read(page);
      expect(rec.arrived, 'de nieuwe pagina').not.toBeNull();
      if (rec.arrived! < 150) expect(rec.shownEver).toBe(false);
      if (rec.shown !== null) expect(rec.shown).toBeGreaterThanOrEqual(150);
      return rec;
    };

    // Vijf klikken: een artikel, en twee lijsten heen en terug.
    let fast = 0;
    await settle(page, cdp, '/wiki/alles');
    await arm(page);
    const article = page.locator('main a[href^="/e/"]').first();
    const href = (await article.getAttribute('href'))!;
    await article.click();
    await page.waitForURL(`**${href}`);
    await page.waitForTimeout(400);
    if ((await promise()).arrived! < 150) fast++;

    const nav = page.getByRole('navigation', { name: 'Hoofdmenu' });
    for (const [from, to] of [
      ['/cases', 'Wiki'],
      ['/wiki', 'Dossiers'],
      ['/cases', 'Wiki'],
      ['/wiki', 'Dossiers'],
    ] as const) {
      await settle(page, cdp, from);
      await arm(page);
      await nav.getByRole('link', { name: to, exact: true }).click();
      await expect.poll(async () => (await read(page)).arrived, { timeout: 10_000 }).not.toBeNull();
      await page.waitForTimeout(400);
      if ((await promise()).arrived! < 150) fast++;
    }
    // Minstens één van de vijf was snel, anders heeft deze zaak niets bewezen.
    expect(fast, 'navigaties onder 150 ms').toBeGreaterThan(0);
  });

  test('(d) golf M: bij 300 ms blijft de oude pagina staan onder de streep, en het anker landt daarna', async ({ page }) => {
    await signIn(page, ...KEEPER);
    const cdp = await lagOf(page);
    await settle(page, cdp, '/wiki/alles');
    await lag(cdp, 300);
    await arm(page);
    // Iets van de oude pagina, om te zien dat hij blijft staan tot de nieuwe er is.
    await page.evaluate(() => document.querySelector('main :is(.page, .page-wide)')?.setAttribute('data-oud', ''));
    const article = page.locator('main a[href^="/e/"]').first();
    const href = (await article.getAttribute('href'))!;
    await article.click({ noWaitAfter: true });
    // De streep komt, en zolang hij er staat, staat de oude pagina er ook.
    await expect.poll(async () => (await read(page)).shownEver, { timeout: 5_000 }).toBe(true);
    expect(await page.locator('main [data-oud]').isVisible()).toBe(true);
    await expect(page.getByTestId('nav-skeleton')).toHaveCount(0);
    expect((await read(page)).skeleton).toBeNull();
    await page.waitForURL(`**${href}`);
    await expect(page.locator('main [data-oud]')).toHaveCount(0, { timeout: 10_000 });
    expect((await read(page)).skeleton).toBeNull();

    /*
     * Het anker. *Bekijk* in de koopmelding gaat met `router.push` naar
     * `/kamer/…#plek-…`, en Next scrolt één keer, in de eerste commit van de
     * nieuwe pagina. Een `loading.tsx` zou die commit het skelet maken, waar
     * het doel nog niet bestaat; dit bewaakt dat het anker blijft landen. Hier
     * hetzelfde, naar de geschiedenis van een artikel op een laag venster.
     */
    await lag(cdp, 0);
    // Golf h1 (D4): the Keeper's page lost its 36 px band above the head, so
    // the history came up above a 520 px fold; 440 keeps it under.
    await page.setViewportSize({ width: 1440, height: 440 });
    await page.goto('/e/westkapelle-lighthouse');
    // De geschiedenis staat op elk artikel, onder de vouw van een laag venster.
    const anchor = 'block-history';
    expect(
      await page.evaluate((id) => document.getElementById(id)!.getBoundingClientRect().top > window.innerHeight, anchor),
      'een doel onder de vouw',
    ).toBe(true);
    await page.goto('/wiki');
    await page.waitForTimeout(1500);
    await lag(cdp, 300);
    await page.evaluate((to) => (window as unknown as { next: { router: { push: (h: string) => void } } }).next.router.push(to), `/e/westkapelle-lighthouse#${anchor}`);
    await page.waitForURL('**/e/westkapelle-lighthouse#*');
    await expect
      .poll(() =>
        page.evaluate((id) => {
          const top = document.getElementById(id)!.getBoundingClientRect().top;
          return top >= 0 && top <= window.innerHeight;
        }, anchor),
      )
      .toBe(true);
    await lag(cdp, 0);
  });

  test('(e) een 404 blijft een 404', async ({ page }) => {
    await signIn(page, ...KEEPER);
    for (const path of ['/e/bestaat-niet-65', '/c/bestaat-niet-65', '/wiki/bestaat-niet-65', '/kamer/bestaat-niet-65', '/spelers/bestaat-niet-65']) {
      const response = await page.goto(path);
      expect(response?.status(), path).toBe(404);
    }
    // En een pagina die bestaat, blijft een 200.
    expect((await page.goto('/e/westkapelle-lighthouse'))?.status()).toBe(200);
    expect((await page.goto('/winkel'))?.status()).toBe(200);
  });

  test('golf M: de nieuwe pagina vervaagt niet in — één wissel, ook niet op een tekenvlak', async ({ page }) => {
    await signIn(page, ...KEEPER);
    await page.goto('/cases');
    await arm(page);
    await page.getByRole('navigation', { name: 'Hoofdmenu' }).getByRole('link', { name: 'Wiki', exact: true }).click();
    await page.waitForURL('**/wiki');
    await page.getByRole('navigation', { name: 'Hoofdmenu' }).getByRole('link', { name: 'Prikborden', exact: true }).click();
    await page.waitForURL('**/boards');
    await page.locator('main a[href^="/b/"]').first().click();
    await page.waitForURL('**/b/**');
    await expect(page.locator('.page-canvas')).toBeVisible();
    await page.waitForTimeout(300);
    const names = (await read(page)).animations.map((a) => a.name);
    expect(names).not.toContain('nav-page-in');
    expect(names).not.toContain('nav-page-fade');
    expect(names).not.toContain('skeleton-in');
    expect(await page.evaluate(() => document.documentElement.hasAttribute('data-navigated'))).toBe(false);
  });
});

/**
 * De streep om te beoordelen, op de desk en de telefoon, bij een lange
 * vertraging: de oude pagina staat eronder, onaangeroerd (golf M).
 */
test.describe('ronde 65·b — hoe het eruitziet', () => {
  test.beforeEach(({ browserName }) => {
    test.skip(browserName !== 'chromium', 'de vertraging gaat via CDP');
  });

  test('de streep over de oude pagina', async ({ page, isMobile }) => {
    test.setTimeout(120_000);
    mkdirSync(SHOTS, { recursive: true });
    const tag = isMobile ? 'phone' : 'desktop';
    await signIn(page, ...KEEPER);
    const cdp = await lagOf(page);
    await settle(page, cdp, '/wiki');
    await lag(cdp, 4000);
    await arm(page);
    if (isMobile) await page.getByRole('navigation', { name: 'Tabbalk' }).getByRole('link', { name: /Zoeken/ }).click({ noWaitAfter: true });
    else await page.getByTestId('nav-admin').click({ noWaitAfter: true });
    await expect(page.locator('.nav-progress')).toHaveAttribute('data-shown', '1', { timeout: 5_000 });
    await expect(page.getByTestId('nav-skeleton')).toHaveCount(0);
    await page.waitForTimeout(900);
    await page.screenshot({ path: `${SHOTS}/${tag}-streep.png` });
    await lag(cdp, 0);
    await page.waitForURL(isMobile ? '**/search' : '**/admin', { timeout: 20_000 });
  });
});
