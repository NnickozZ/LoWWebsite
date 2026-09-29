import { mkdirSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { signIn } from './helpers';

/**
 * §104, golf J (j4, stuk 12 van de meting): de eerste verf is al de vorm van
 * het scherm. De server kent de breedte niet en tekende een artikel altijd als
 * op een computer: op een telefoon stond *Op deze pagina* bovenaan, en bij de
 * hydratatie sprong *Bewerken* van y 184 naar 21 (CLS 0,85). Een tik in die
 * tijd landde op iets anders. Het dossier had hetzelfde: acht rijen tabbladen,
 * en daarna de gestapelde pagina 580 px hoger.
 *
 * Elke zaak laadt de pagina twee keer: eerst met alle JavaScript-chunks
 * tegengehouden (wat de server stuurde, de eerste verf), dan gewoon. Wat je in
 * de eerste verf ziet, staat na de hydratatie op dezelfde plek.
 */

const KEEPER = ['Keeper', 'abbeytower34'] as const;
const SHOTS = '/tmp/claude-0/shots-j4';
mkdirSync(SHOTS, { recursive: true });

type Plek = Record<string, number | null>;

/** De y (in het document) van wat een duim zoekt, of null als het niet te zien is. */
async function plekken(page: Page, selectors: Record<string, string>): Promise<Plek> {
  return page.evaluate((selectors) => {
    const out: Record<string, number | null> = {};
    for (const [name, selector] of Object.entries(selectors)) {
      const el = [...document.querySelectorAll(selector)].find((e) => e.getClientRects().length > 0);
      out[name] = el ? Math.round(el.getBoundingClientRect().y + window.scrollY) : null;
    }
    return out;
  }, selectors);
}

/** De pagina zoals de server hem stuurt: geen enkele chunk JavaScript. */
async function eersteVerf(page: Page, path: string) {
  await page.route('**/_next/static/chunks/**', (route) => route.abort());
  await page.goto(path, { waitUntil: 'load' });
}

/** Dezelfde pagina, gehydrateerd, met de verschuivingen onderweg opgeteld. */
async function naHydratatie(page: Page, path: string, gehydrateerd = '.entry-mode-toggle') {
  await page.unroute('**/_next/static/chunks/**');
  await page.goto(path, { waitUntil: 'load' });
  // Gehydrateerd: het element heeft een React-vezel.
  await expect
    .poll(() =>
      page.evaluate((selector) => {
        const el = document.querySelector(selector);
        return Boolean(el && Object.keys(el).some((key) => key.startsWith('__reactFiber')));
      }, gehydrateerd),
    )
    .toBe(true);
  await page.waitForTimeout(1200);
}

const ARTIKEL = {
  bewerken: '.entry-mode-toggle',
  titel: '.entry-title',
  rij: '.entry-outline-row',
  feiten: '#block-info',
  tekst: '.entry-body-block .ProseMirror > p',
};

test.beforeEach(async ({ context }) => {
  // CLS zoals de browser hem telt: alles zonder hand erbij.
  await context.addInitScript(() => {
    const w = window as unknown as { __cls: number };
    w.__cls = 0;
    try {
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries() as Array<PerformanceEntry & { value: number; hadRecentInput: boolean }>) {
          if (!entry.hadRecentInput) w.__cls += entry.value;
        }
      }).observe({ type: 'layout-shift', buffered: true });
    } catch {
      /* geen layout-shift in deze browser */
    }
  });
});

test('op een telefoon is de eerste verf van een artikel de telefoon, en niets springt', async ({ page }, info) => {
  test.skip(info.project.name !== 'phone', 'de telefoon');
  await signIn(page, ...KEEPER);
  for (const [width, height] of [
    [390, 844],
    [360, 740],
  ]) {
    await page.setViewportSize({ width, height });
    for (const path of ['/e/jacob-den-hollander', '/e/middelburg']) {
      await eersteVerf(page, path);
      // De wegwijzer is de rij chips onder de kop, niet de kolom bovenaan.
      await expect(page.locator('.entry-rail')).toBeHidden();
      await expect(page.locator('.entry-kop .entry-outline-row')).toBeVisible();
      // *Bewerken* staat bovenaan, naast het etiket van de soort.
      const knop = (await page.locator('.entry-mode-toggle').boundingBox())!;
      expect(knop.y).toBeLessThan(60);
      // *Meer info* is dicht, met de blik eronder — altijd, niet de ene keer open (raden 7).
      await expect(page.locator('details#block-info')).not.toHaveAttribute('open', '');
      await expect(page.getByTestId('infobox-peek')).toBeVisible();
      // En de tekst staat er al, getekend op de server.
      await expect(page.locator('.entry-body-block .vooraf-tekst > p').first()).toBeVisible();
      const voor = await plekken(page, ARTIKEL);
      await page.screenshot({ path: `${SHOTS}/telefoon-${width}-${path.split('/').pop()}-eerste-verf.png` });

      await naHydratatie(page, path);
      const na = await plekken(page, ARTIKEL);
      for (const key of Object.keys(ARTIKEL)) {
        expect(na[key], `${path} op ${width}: ${key}`).not.toBeNull();
        expect(Math.abs(na[key]! - voor[key]!), `${path} op ${width}: ${key} ${voor[key]} → ${na[key]}`).toBeLessThanOrEqual(2);
      }
      // De editor staat nu waar de tekst van de server stond.
      await expect(page.locator('.entry-body-block .vooraf-tekst')).toHaveCount(0);
      const cls = await page.evaluate(() => (window as unknown as { __cls: number }).__cls);
      expect(cls, `CLS op ${path}, ${width} px`).toBeLessThan(0.02);
      await page.screenshot({ path: `${SHOTS}/telefoon-${width}-${path.split('/').pop()}-na.png` });
    }
  }
});

test('op een computer is de eerste verf al de kolommen van die breedte', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'een bureau');
  await signIn(page, ...KEEPER);
  const path = '/e/jacob-den-hollander';
  for (const width of [1280, 1440, 1600]) {
    await page.setViewportSize({ width, height: 900 });
    await eersteVerf(page, path);
    const main = (await page.locator('.entry-main').boundingBox())!;
    const aside = (await page.locator('.entry-aside').boundingBox())!;
    const kop = (await page.locator('.entry-kop .entry-head').boundingBox())!;
    // Tekst en feiten naast elkaar, en ze beginnen op dezelfde hoogte.
    expect(main.x + main.width).toBeLessThanOrEqual(aside.x + 1);
    expect(Math.abs(aside.y - kop.y)).toBeLessThan(24);
    // *Meer info* is de kaart, open, ook zonder JavaScript.
    await expect(page.locator('#block-info .fields-view').first()).toBeVisible();
    await expect(page.getByTestId('infobox-peek')).toBeHidden();
    if (width >= 1500) {
      await expect(page.locator('.entry-rail')).toBeVisible();
      await expect(page.locator('.entry-kop .entry-outline-row')).toBeHidden();
    } else {
      await expect(page.locator('.entry-rail')).toBeHidden();
      await expect(page.locator('.entry-kop .entry-outline-row')).toBeVisible();
    }
    const voor = await plekken(page, { ...ARTIKEL, rij: width >= 1500 ? '.entry-rail' : '.entry-outline-row' });
    await page.screenshot({ path: `${SHOTS}/computer-${width}-eerste-verf.png` });

    await naHydratatie(page, path);
    const na = await plekken(page, { ...ARTIKEL, rij: width >= 1500 ? '.entry-rail' : '.entry-outline-row' });
    for (const key of Object.keys(ARTIKEL)) {
      expect(Math.abs(na[key]! - voor[key]!), `${width}: ${key} ${voor[key]} → ${na[key]}`).toBeLessThanOrEqual(2);
    }
    // Wat de stylesheet verborg, is na de hydratatie weg (de specs van golf H tellen erop).
    await expect(page.locator('.entry-rail')).toHaveCount(width >= 1500 ? 1 : 0);
    await expect(page.locator('details#block-info')).toHaveCount(0);
    await expect(page.locator('section#block-info')).toHaveCount(1);
  }
});

test('een dossier op een telefoon: de eerste verf is de gestapelde pagina, niet acht rijen tabs', async ({ page }, info) => {
  test.skip(info.project.name !== 'phone', 'de telefoon');
  await signIn(page, ...KEEPER);
  const path = '/c/the-unwound-light-case';
  await eersteVerf(page, path);
  await expect(page.locator('.case-tabs')).toBeHidden();
  await expect(page.locator('.jump-menu')).toBeVisible();
  const kopVoor = (await page.locator('.sticky-section-head').first().boundingBox())!;
  // De eerste sectie begint op het eerste scherm, onder de chiprij.
  expect(kopVoor.y).toBeLessThan(500);
  await page.screenshot({ path: `${SHOTS}/dossier-eerste-verf.png` });

  // Na de hydratatie zijn de chips knoppen (vóór de hydratatie doen ze niets, dus zijn het etiketten).
  await naHydratatie(page, path, '.jump-menu button.chip');
  const kopNa = (await page.locator('.sticky-section-head').first().boundingBox())!;
  expect(Math.abs(kopNa.y - kopVoor.y)).toBeLessThanOrEqual(2);
  await expect(page.locator('.case-tabs')).toHaveCount(0);
  await page.screenshot({ path: `${SHOTS}/dossier-na.png` });
});

test('een tik op Bewerken tijdens de hydratatie landt op Bewerken', async ({ page, context }, info) => {
  test.skip(info.project.name !== 'phone', 'de telefoon');
  await signIn(page, ...KEEPER);
  const cdp = await context.newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 6 });
  await page.goto('/e/jacob-den-hollander', { waitUntil: 'commit' });
  const knop = page.locator('.entry-mode-toggle');
  await knop.waitFor({ state: 'visible' });
  // Waar de duim hem in de eerste verf zag…
  const box = (await knop.boundingBox())!;
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  await expect
    .poll(() => page.evaluate(() => Object.keys(document.querySelector('.entry-mode-toggle') ?? {}).some((k) => k.startsWith('__reactFiber'))))
    .toBe(true);
  // …staat hij na de hydratatie nog steeds.
  const hit = await page.evaluate(([px, py]) => document.elementFromPoint(px, py)?.closest('.entry-mode-toggle') !== null, [x, y]);
  expect(hit).toBe(true);
});
