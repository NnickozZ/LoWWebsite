import { mkdirSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { becomeInvestigator, inviteCode, signIn } from './helpers';

/**
 * Golf h1 — de schil, na design-review 3.
 *
 *   D4   De Keeperkant is op een computer een schakelaar in de mast, zonder
 *        strook boven de pagina en zonder 12 rem naast een canvaskop.
 *   D5   (golf K) Elke pagina in het midden van de kolom; de brede met één linkerrand.
 *   D2   Een onbekend adres is een 404 in de schil.
 *   D3   Een kaart krijgt binnen 100 ms `data-pending`.
 *   T7   De tabpagina's hebben een skelet; de Jij-tab is actief in jouw plek.
 *   D18  Nooit twee actieve vakjes in jouw plek.
 *   D25  Het palet zonder uitkomst: geen lege groep, wel één zin.
 *   T3   De tabbalk: acht woorden, elk vak ≥ 44 px, geen label afgekapt.
 *   T4   De FAB wijkt overal bij scrollen, en is er niet op /you.
 *   T19  De stip van *Wie is er?* is een raakvlak van 44 px.
 */

const KEEPER = ['Keeper', 'abbeytower34'] as const;
const PASSWORD = 'schilgolfh1';
const SHOTS = '/tmp/claude-0/shots-h1/spec';
mkdirSync(SHOTS, { recursive: true });

async function signUpPlayer(page: Page, name: string) {
  await page.goto('/signup');
  await page.getByLabel('Uitnodigingscode').fill(inviteCode());
  await page.getByLabel('Naam', { exact: true }).fill(name);
  await page.getByLabel('Wachtwoord', { exact: true }).fill(PASSWORD);
  await page.getByLabel('Wachtwoord nogmaals').fill(PASSWORD);
  await page.getByRole('button', { name: 'Account aanmaken' }).click();
  await page.waitForURL('**/');
}

/**
 * Golf K: waar de pagina staat in de kolom naast de zijbalk — de ruimte links
 * en rechts van `.page`/`.page-wide`/het artikel, gemeten tegen de inhoud van
 * `.main` (zonder zijn opvulling).
 */
const gapsOf = (page: Page) =>
  page.evaluate(() => {
    const el = document.querySelector('.main > :is(.page, .page-wide, article)');
    const main = document.querySelector('.main');
    if (!el || !main) return null;
    const box = el.getBoundingClientRect();
    const col = main.getBoundingClientRect();
    const pad = getComputedStyle(main);
    const left = col.left + parseFloat(pad.paddingLeft);
    const right = col.right - parseFloat(pad.paddingRight);
    return { left: Math.round(box.left - left), right: Math.round(right - box.right), x: Math.round(box.left) };
  });

test.describe('golf h1 — de computer', () => {
  test.skip(({ isMobile }) => isMobile, 'de zijbalk');

  test('D4: de Keeperkant is een schakelaar in de mast, en er is geen strook boven de pagina', async ({ page }) => {
    await signIn(page, ...KEEPER);
    await page.goto('/api/keeper/flip?side=player&to=%2Fwiki');
    const toggle = page.getByTestId('side-toggle');
    await expect(page.locator('.sidenav .masthead').getByTestId('side-toggle')).toHaveCount(1);
    await expect(page.locator('.side-toggle')).toHaveCount(0);
    await expect(toggle).toHaveAttribute('data-side-now', 'player');
    await expect(toggle).toContainText('Spelers');
    await expect(toggle).toContainText('Keeper');
    // De bovenkant van de kolom is die van iedereen: 1,5 rem, geen band.
    const padTop = await page.locator('main').evaluate((el) => getComputedStyle(el).paddingTop);
    expect(padTop).toBe('24px');
    await page.screenshot({ path: `${SHOTS}/d4-mast-speler.png`, clip: { x: 0, y: 0, width: 240, height: 200 } });

    await page.emulateMedia({ reducedMotion: 'reduce' });
    await toggle.click();
    await expect(toggle).toHaveAttribute('data-side-now', 'keeper', { timeout: 20_000 });
    await expect(page.getByTestId('masthead-side')).toBeVisible();
    await expect(page.getByTestId('masthead-side')).toHaveAttribute('data-on', '1');
    expect(await page.locator('main').evaluate((el) => getComputedStyle(el).paddingTop)).toBe('24px');
    await page.screenshot({ path: `${SHOTS}/d4-mast-keeper.png`, clip: { x: 0, y: 0, width: 240, height: 200 } });

    // `k` blijft dezelfde knop.
    await toggle.focus();
    await page.keyboard.press('k');
    await expect(toggle).toHaveAttribute('data-side-now', 'player', { timeout: 20_000 });
  });

  /*
   * Golf K draaide D5 om (Nick: "On PC the website now aligns to the left
   * instead of using the whole screenspace"). Elke pagina staat in het midden
   * van de kolom: evenveel lucht links als rechts. De brede pagina's van het
   * archief (Start, de wiki, een artikel, de lijsten) delen nog steeds één
   * linkerrand; een smalle pagina (Spelers, Jij, Zoeken) staat in het midden.
   */
  test('D5 (golf K): elke pagina in het midden, de brede met één linkerrand, op 1440 en 1920', async ({ page }) => {
    test.setTimeout(120_000);
    await signIn(page, ...KEEPER);
    for (const width of [1440, 1920]) {
      await page.setViewportSize({ width, height: 900 });
      const wide: Record<string, number> = {};
      for (const path of ['/', '/wiki', '/e/westkapelle-lighthouse', '/timelines', '/boards', '/maps', '/spelers', '/you', '/search', '/uitdelen', '/bestaat-niet-h1']) {
        await page.goto(path);
        await page.waitForTimeout(600);
        const gaps = await gapsOf(page);
        expect(gaps, path).not.toBeNull();
        // In het midden — of, waar de pagina de kolom vult, vanaf de linkerrand
        // (dan houdt de zwevende strip *Wie is er?* rechts een stukje vrij).
        const centred = Math.abs(gaps!.left - gaps!.right) <= 2;
        const fills = gaps!.left <= 2;
        expect(centred || fills, `${width} ${path} ${JSON.stringify(gaps)}`).toBe(true);
        if (['/', '/wiki', '/e/westkapelle-lighthouse', '/timelines', '/boards', '/maps'].includes(path)) wide[path] = gaps!.x;
      }
      console.log(width, JSON.stringify(wide));
      expect(new Set(Object.values(wide)).size, JSON.stringify(wide)).toBe(1);
    }
    // Op 1920 vult een brede pagina de kolom niet meer tot de rechterrand
    // leeg: hij is 1440 px en staat in het midden.
    await page.goto('/wiki');
    const gaps = (await gapsOf(page))!;
    expect(gaps.left).toBeGreaterThan(40);
  });

  test('D2: een onbekend adres is een 404 in de schil', async ({ page }) => {
    await signIn(page, ...KEEPER);
    for (const path of ['/bestaat-niet-h1', '/iets/heel/diep/h1']) {
      const response = await page.goto(path);
      expect(response?.status(), path).toBe(404);
      await expect(page.getByRole('heading', { name: 'Deze pagina is er niet.' })).toBeVisible();
      await expect(page.getByRole('navigation', { name: 'Hoofdmenu' })).toBeVisible();
    }
    await page.screenshot({ path: `${SHOTS}/d2-404.png` });
  });

  test('D3 en T7: een kaart antwoordt binnen 100 ms, en een tabpagina heeft een skelet', async ({ page }) => {
    await signIn(page, ...KEEPER);
    await page.goto('/wiki/alles');
    await page.waitForTimeout(1500);
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Network.enable');
    await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 2000, downloadThroughput: -1, uploadThroughput: -1 });
    await page.evaluate(() => {
      const w = window as unknown as { __t0: number; __pending: number | null };
      w.__pending = null;
      // On `window`, in the capture phase: before `NavProgress`'s own
      // listener on `document`, whose mark wakes the observer below.
      window.addEventListener('click', () => (w.__t0 = performance.now()), { capture: true, once: true });
      new MutationObserver(() => {
        if (w.__pending === null && document.querySelector('a.card[data-pending]')) w.__pending = performance.now() - w.__t0;
      }).observe(document.body, { subtree: true, attributes: true, attributeFilter: ['data-pending'] });
    });
    await page.locator('main a.card').first().click({ noWaitAfter: true });
    await expect.poll(() => page.evaluate(() => (window as unknown as { __pending: number | null }).__pending)).not.toBeNull();
    const ms = await page.evaluate(() => (window as unknown as { __pending: number }).__pending);
    console.log(`D3: kaart data-pending na ${Math.round(ms)} ms`);
    expect(ms).toBeLessThanOrEqual(100);
    await page.waitForTimeout(250);
    await page.screenshot({ path: `${SHOTS}/d3-kaart-ingedrukt.png` });
    await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
    await page.waitForURL('**/e/**');
    await expect(page.locator('a[data-pending]')).toHaveCount(0, { timeout: 10_000 });

    // T7: Dossiers, Prikborden en Spelers hebben een vorm.
    for (const [name, click, shape] of [
      ['dossiers', () => page.getByRole('navigation', { name: 'Hoofdmenu' }).getByRole('link', { name: 'Dossiers', exact: true }), 'cases'],
      ['prikborden', () => page.getByRole('navigation', { name: 'Hoofdmenu' }).getByRole('link', { name: 'Prikborden', exact: true }), 'rows'],
      ['spelers', () => page.getByTestId('yours-spelers'), 'hal'],
      ['start', () => page.getByRole('navigation', { name: 'Hoofdmenu' }).getByRole('link', { name: 'Start', exact: true }), 'voordeur'],
    ] as const) {
      await page.goto('/wiki/alles');
      await page.waitForTimeout(1200);
      await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 4000, downloadThroughput: -1, uploadThroughput: -1 });
      await click().click({ noWaitAfter: true });
      await expect(page.getByTestId('nav-skeleton')).toBeVisible({ timeout: 5_000 });
      await expect(page.getByTestId('skeleton')).toHaveAttribute('data-shape', shape);
      await page.waitForTimeout(450);
      await page.screenshot({ path: `${SHOTS}/t7-skelet-${name}.png` });
      await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
      await expect(page.locator('main .skeleton')).toHaveCount(0, { timeout: 20_000 });
      await page.waitForTimeout(300);
      await page.screenshot({ path: `${SHOTS}/t7-echt-${name}.png` });
    }
  });

  test('D18: op je eigen spelerspagina is één vakje actief', async ({ page }) => {
    await signIn(page, ...KEEPER);
    await page.goto('/wiki');
    const mine = page.getByTestId('yours-mine');
    await expect(mine).toBeVisible({ timeout: 20_000 });
    await page.goto((await mine.getAttribute('href'))!);
    await expect(page.getByTestId('yours-mine')).toHaveAttribute('aria-current', 'page');
    await expect(page.getByTestId('nav-yours').locator('a[aria-current="page"]')).toHaveCount(1);
  });

  test('D25: het palet zonder uitkomst', async ({ page }) => {
    await signIn(page, ...KEEPER);
    await page.goto('/wiki');
    await page.waitForTimeout(1000);
    await page.getByTestId('nav-search').click();
    const palette = page.getByTestId('palette');
    await expect(palette).toBeVisible();
    await page.getByTestId('palette-input').fill('>zzqx');
    await expect(palette.locator('.palette-head')).toHaveCount(0);
    await expect(palette.locator('.palette-empty')).toHaveText('Geen handeling heet ‘zzqx’.');
    await page.getByTestId('palette-input').fill('zzqxwv');
    await expect(palette.locator('.palette-empty')).toHaveText('Niets gevonden voor ‘zzqxwv’ — Enter zoekt in alles', { timeout: 10_000 });
    await expect(palette.locator('.palette-head')).toHaveCount(0);
    const active = palette.locator('.palette-option-active');
    await expect(active).toHaveAttribute('data-option', 'search-all');
    const paint = await active.evaluate((el) => {
      const probe = document.createElement('span');
      probe.style.color = 'var(--paper-dark)';
      document.body.append(probe);
      const want = getComputedStyle(probe).color;
      probe.remove();
      return { got: getComputedStyle(el).backgroundColor, want };
    });
    expect(paint.got).toBe(paint.want);
    await page.screenshot({ path: `${SHOTS}/d25-palet-leeg.png` });
  });
});

test.describe('golf h1 — de telefoon', () => {
  test.skip(({ isMobile }) => !isMobile, 'de tabbalk');

  test('T3: acht woorden, elk vak minstens 44 px, geen label afgekapt — op 390 en 360', async ({ page }, info) => {
    test.setTimeout(150_000);
    await signUpPlayer(page, `Tabber ${Date.now().toString(36)}`);
    await becomeInvestigator(page, `Tabbert ${info.project.name}${Date.now().toString(36)}`);
    for (const width of [390, 360]) {
      await page.setViewportSize({ width, height: 780 });
      await page.goto('/maps');
      const tabs = page.getByRole('navigation', { name: 'Tabbalk' });
      await expect(tabs).toBeVisible({ timeout: 20_000 });
      await page.waitForTimeout(500);
      const measured = await tabs.evaluate((nav) =>
        [...nav.children].map((tab) => {
          const box = tab.getBoundingClientRect();
          const label = tab.querySelector<HTMLElement>(':scope > span:not(.tab-jij-icon):not(.visually-hidden)');
          const text = label?.getBoundingClientRect();
          return {
            word: label?.textContent?.trim() ?? '',
            width: box.width,
            clipped: !text || text.left < box.left - 0.5 || text.right > box.right + 0.5 || label!.scrollWidth > label!.clientWidth + 0.5,
            size: parseFloat(getComputedStyle(label ?? tab).fontSize),
          };
        }),
      );
      console.log(width, JSON.stringify(measured.map((m) => [m.word, Math.round(m.width)])));
      expect(measured).toHaveLength(8);
      for (const tab of measured) {
        expect(tab.word, 'een woord onder elk icoon').not.toBe('');
        expect(tab.width, tab.word).toBeGreaterThanOrEqual(43.5);
        expect(tab.clipped, tab.word).toBe(false);
        expect(tab.size, tab.word).toBeGreaterThanOrEqual(10);
      }
      await page.screenshot({ path: `${SHOTS}/t3-tabbalk-${width}.png`, clip: { x: 0, y: 780 - 72, width, height: 72 } });
    }
    // T7: de Jij-tab is actief in jouw plek.
    await page.goto('/spelers');
    await expect(page.getByTestId('tab-jij')).toHaveAttribute('aria-current', 'page');
    // T4: de FAB wijkt bij scrollen, ook op een pagina die geen leespagina is…
    await page.goto('/');
    const fab = page.locator('.fab');
    await expect(fab).toBeVisible({ timeout: 20_000 });
    await page.waitForTimeout(600);
    await page.mouse.wheel(0, 500);
    await expect(fab).toHaveAttribute('data-away', '1', { timeout: 3000 });
    // …en staat niet op /you.
    await page.goto('/you');
    await expect(page.locator('.you-page')).toBeVisible({ timeout: 20_000 });
    await expect(fab).toBeHidden();
    // T19: de stip van *Wie is er?* is een raakvlak van 44 px.
    await page.goto('/wiki');
    const dot = page.getByTestId('roster-open');
    await expect(dot).toBeVisible({ timeout: 20_000 });
    const box = (await dot.boundingBox())!;
    expect(box.width).toBeGreaterThanOrEqual(44);
    expect(box.height).toBeGreaterThanOrEqual(44);
  });
});
