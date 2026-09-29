import { mkdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { signIn, signUp } from './helpers';

/**
 * §104, ronde 67 — *De leeskamer*.
 *
 * Wat alleen een browser kan zeggen: dat de blokken op `/wiki` boven de vouw
 * staan, dat `/wiki/willekeurig` nooit op iets uitkomt dat de kijker niet mag
 * zien (gemeten vanaf de kant van wie er niet bij mag, zoals `access-rights`),
 * dat *Genoemd in* de zin toont met de naam vet en zonder de naam van een
 * geheim, dat een kop-anker kopieert en het zegt, dat de eerste zin op een
 * Pixel 5 boven y = 700 staat, dat de tekst geen kop *Tekst* meer draagt, en
 * dat met de tekstafstand van WCAG 1.4.12 niets wordt afgesneden. De pure
 * helften staan in `tests/unit/ronde-67-leeskamer.test.ts`.
 *
 * Elke zaak maakt zijn eigen artikelen via de API, als de Keeper, met een
 * stempel in de naam — de wereld eronder is de Engelse `seed-demo`.
 */

const KEEPER = { name: 'Keeper', password: 'abbeytower34' };
const SHOTS = '/tmp/claude-0/shots-e';
const root = resolve(__dirname, '../..');

type Made = { id: string; slug: string; name: string };

async function make(page: Page, name: string, extra: Record<string, unknown> = {}): Promise<Made> {
  const made = await page.request.post('/api/entries', { data: { name, typeSlug: 'character', ...extra } });
  expect(made.ok()).toBe(true);
  const entry = ((await made.json()) as { entry: Made }).entry;
  return { id: entry.id, slug: entry.slug, name };
}

async function patch(page: Page, id: string, data: Record<string, unknown>) {
  const response = await page.request.patch(`/api/entries/${id}`, { data });
  expect(response.ok()).toBe(true);
}

/** A running text the way the API still accepts it: a link with an id, which the server turns into a handle (§97). */
const link = (entry: Made) => ({ type: 'entryLink', attrs: { id: entry.id, label: entry.name } });
const text = (value: string) => ({ type: 'text', text: value });
const para = (...content: object[]) => ({ type: 'paragraph', content });
const heading = (level: 2 | 3, value: string) => ({ type: 'heading', attrs: { level }, content: [text(value)] });
const doc = (...content: object[]) => ({ type: 'doc', content });

async function shot(page: Page, name: string, fullPage = false) {
  mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: join(SHOTS, `${name}.png`), fullPage });
}

async function openGenoemdIn(page: Page) {
  const block = page.getByTestId('genoemd-in');
  await expect(block).toBeAttached({ timeout: 20_000 });
  await expect(async () => {
    if (!(await block.evaluate((el) => (el as HTMLDetailsElement).open))) await block.locator('summary').click();
    expect(await block.evaluate((el) => (el as HTMLDetailsElement).open)).toBe(true);
  }).toPass({ timeout: 10_000 });
  return block;
}

test.describe('§104 de leeskamer', () => {
  test('L1: de voorpagina — het overzicht bovenaan, drie blokken eronder, boven de vouw', async ({ page }, info) => {
    test.setTimeout(120_000);
    await signIn(page, KEEPER.name, KEEPER.password);
    const stamp = Date.now().toString(36);
    // Something freshly written, so Onlangs has a name to say.
    await make(page, `Havenmeester ${stamp}`, { shortDescription: 'Houdt het tweede grootboek bij, in zijn jas.' });

    await page.goto('/wiki');
    // Het overzicht van de Keeper staat er nog, bovenaan (§75/§87), en de tabs ook.
    await expect(page.locator('.overzicht-page h1')).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Soorten' })).toBeVisible();

    const recent = page.getByTestId('onlangs-fiche');
    await expect(recent.first()).toBeVisible();
    expect(await recent.count()).toBe(6);
    await expect(recent.first()).toContainText(`Havenmeester ${stamp}`);
    await expect(recent.first()).toContainText(KEEPER.name);
    const archive = page.getByTestId('uit-het-archief');
    await expect(archive).toBeVisible();
    expect(await page.getByTestId('soort-tegel').count()).toBeGreaterThan(5);

    if (info.project.name === 'desktop') {
      // Boven de vouw op 1440×900: minstens één fiche en het uitgelichte stuk.
      const fold = 900;
      const first = (await recent.first().boundingBox())!;
      expect(first.y + first.height).toBeLessThanOrEqual(fold);
      const card = (await archive.boundingBox())!;
      expect(card.y).toBeLessThan(fold - 120);
      // Het overzicht staat erboven.
      const intro = (await page.locator('.overzicht-page h1').boundingBox())!;
      expect(intro.y).toBeLessThan(card.y);
    }

    // Nog één: een ander, zonder de pagina te verlaten.
    const before = await archive.getAttribute('data-slug');
    const url = page.url();
    await expect(async () => {
      await page.getByTestId('nog-een').click();
      await expect(archive).not.toHaveAttribute('data-slug', before!, { timeout: 3000 });
    }).toPass({ timeout: 20_000 });
    expect(page.url()).toBe(url);

    // Geen horizontale scroll, ook niet op een telefoon.
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);

    await shot(page, `wiki-${info.project.name}-licht`);
    await shot(page, `wiki-${info.project.name}-licht-heel`, true);
    await page.emulateMedia({ colorScheme: 'dark' });
    await shot(page, `wiki-${info.project.name}-donker`);
    await shot(page, `wiki-${info.project.name}-donker-heel`, true);
  });

  test('L2 + L3: willekeurig en Genoemd in, vanaf de kant van wie er niet bij mag', async ({ page, browser }, info) => {
    test.setTimeout(240_000);
    const stamp = `${info.project.name}${Date.now().toString(36)}`;
    await signIn(page, KEEPER.name, KEEPER.password);
    const getuige = await make(page, `Getuige ${stamp}`);
    const geheim = await make(page, `Geheim ${stamp}`);
    await patch(page, geheim.id, { visibility: 'keeper' });
    const verslag = await make(page, `Verslag ${stamp}`);
    await patch(page, verslag.id, {
      body: doc(
        para(text('Dit verslag begint met een lange aanloop over het weer boven de Oosterschelde, die niemand leest.')),
        para(text('Op de dijk zag '), link(getuige), text(' hoe '), link(geheim), text(' de lamp opwond, lang na middernacht.')),
      ),
    });

    // De Keeper leest de zin met beide namen.
    await page.goto(`/e/${getuige.slug}`);
    let block = await openGenoemdIn(page);
    const keeperZin = block.getByTestId('genoemd-zin').first();
    await expect(keeperZin).toContainText(`Op de dijk zag ${getuige.name} hoe ${geheim.name} de lamp opwond`);
    await expect(keeperZin.locator('strong')).toHaveText(getuige.name);

    // Een speler: de zin, de naam vet, en van het geheim niets — niet in beeld en niet in de HTML.
    const ctx = await browser.newContext({ viewport: page.viewportSize()! });
    const speler = await ctx.newPage();
    await signUp(speler, `Lezer ${stamp}`, 'onderzeeboot');
    await speler.goto(`/e/${getuige.slug}`);
    block = await openGenoemdIn(speler);
    const zin = block.getByTestId('genoemd-zin').first();
    await expect(zin).toContainText(`Op de dijk zag ${getuige.name} hoe de lamp opwond, lang na middernacht.`);
    await expect(zin.locator('strong')).toHaveText(getuige.name);
    const html = await speler.content();
    expect(html).not.toContain(geheim.name);
    expect(html).not.toContain(geheim.slug);
    expect(html).not.toMatch(/⟦/);

    // /wiki/willekeurig: nooit het geheim, nooit iets van de Keeper uit de seed.
    const forbidden = new Set([geheim.slug, 'the-drowned-boy']);
    const landed = new Set<string>();
    for (let i = 0; i < 14; i++) {
      await speler.goto('/wiki/willekeurig');
      await speler.waitForURL('**/e/**');
      const slug = new URL(speler.url()).pathname.split('/').pop()!;
      expect(forbidden.has(slug)).toBe(false);
      landed.add(slug);
    }
    expect(landed.size).toBeGreaterThan(2);
    // En Nog één op de wiki volgt dezelfde regel.
    await speler.goto('/wiki');
    const archive = speler.getByTestId('uit-het-archief');
    for (let i = 0; i < 6; i++) {
      const was = await archive.getAttribute('data-slug');
      expect(forbidden.has(was!)).toBe(false);
      await speler.getByTestId('nog-een').click();
      await expect(archive).not.toHaveAttribute('data-slug', was!, { timeout: 10_000 });
    }
    expect(await speler.content()).not.toContain(geheim.name);
    await ctx.close();

    // De Keeper op zijn eigen kant komt alleen op zijn eigen dingen uit (§46).
    await page.goto('/api/keeper/flip?side=keeper&to=/wiki');
    for (let i = 0; i < 6; i++) {
      await page.goto('/wiki/willekeurig');
      await page.waitForURL('**/e/**');
      // Een Keeper-artikel draagt zijn stempel in de kop.
      await expect(page.locator('.entry-head .stamp', { hasText: 'Alleen voor de Keeper' })).toBeVisible();
    }
    await page.goto('/api/keeper/flip?side=player&to=/wiki');
    await page.waitForURL('**/wiki');
  });

  test('L2: Verras me in het palet', async ({ page }, info) => {
    test.skip(info.project.name !== 'desktop', 'het palet is op beide gelijk; ronde-61-palet meet de telefoon');
    await signIn(page, KEEPER.name, KEEPER.password);
    await page.goto('/wiki');
    await expect(async () => {
      await page.keyboard.press('Control+k');
      await expect(page.getByTestId('palette')).toBeVisible({ timeout: 1500 });
    }).toPass({ timeout: 15_000 });
    await page.getByTestId('palette-input').fill('> verras');
    const option = page.getByTestId('palette').locator('[data-group="actions"]').getByRole('option', { name: 'Verras me' });
    await expect(option).toBeVisible();
    await page.keyboard.press('Enter');
    await page.waitForURL('**/e/**');
  });

  test('L4, L6, L7: bijgewerkt door, geen kop Tekst, en een anker dat kopieert', async ({ page, context }, info) => {
    test.setTimeout(120_000);
    const stamp = `${info.project.name}${Date.now().toString(36)}`;
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await signIn(page, KEEPER.name, KEEPER.password);
    const artikel = await make(page, `Havenkantoor ${stamp}`, { shortDescription: 'Waar de tweede ledger ligt.' });
    const lang = 'Het kantoor staat aan de kade en ruikt naar teer. '.repeat(14);
    await patch(page, artikel.id, {
      body: doc(para(text(lang)), heading(2, 'De haven'), para(text(lang)), heading(3, 'Het tweede grootboek'), para(text(lang))),
    });

    await page.goto(`/e/${artikel.slug}`);
    // L6: geen kop "Tekst" in Lezen; de inhoudsopgave houdt haar item.
    await expect(page.locator('.entry-body-block .ProseMirror p').first()).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('.entry-body-block > h2')).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Tekst', exact: true })).toHaveCount(0);
    if (info.project.name === 'desktop') {
      await expect(page.getByRole('navigation', { name: 'Op deze pagina' }).getByRole('link', { name: 'Tekst' })).toBeVisible();
    }

    // L4: één regel onder de lead — wie, wanneer, hoeveel versies — naar de geschiedenis.
    const line = page.getByTestId('entry-bijgewerkt');
    await expect(line).toContainText(`Bijgewerkt door ${KEEPER.name}`);
    await expect(line).toContainText(/versies?/);
    await expect(line.getByRole('link')).toHaveAttribute('href', /#block-/);

    // L7: het anker naast De haven.
    const anchor = page.locator('a.kop-anker#de-haven');
    await expect(anchor).toBeAttached({ timeout: 10_000 });
    await expect(page.locator('a.kop-anker#het-tweede-grootboek')).toBeAttached();
    if (info.project.name === 'desktop') {
      await expect(anchor).toHaveCSS('opacity', '0');
      await page.locator('.entry-body-block .ProseMirror h2', { hasText: 'De haven' }).hover();
      await expect(anchor).toHaveCSS('opacity', '1');
    }
    await anchor.click();
    await expect(page.getByText('Link gekopieerd')).toBeVisible();
    const copied = await page.evaluate(() => navigator.clipboard.readText());
    expect(copied).toBe(`${new URL(page.url()).origin}/e/${artikel.slug}#de-haven`);
    await shot(page, `anker-${info.project.name}`);

    // Een adres met de kop erin komt daar uit.
    await page.goto('/wiki');
    await page.goto(`/e/${artikel.slug}#het-tweede-grootboek`);
    const target = page.locator('.entry-body-block .ProseMirror h3', { hasText: 'Het tweede grootboek' });
    await expect(async () => {
      const box = (await target.boundingBox())!;
      expect(box.y).toBeGreaterThanOrEqual(-4);
      expect(box.y).toBeLessThan(page.viewportSize()!.height / 2);
    }).toPass({ timeout: 10_000 });
  });

  test('L5: op een Pixel 5 staat de eerste zin boven y = 700, en een omslag ligt en opent groot', async ({ page }, info) => {
    test.skip(info.project.name !== 'phone', 'een telefoon');
    test.setTimeout(120_000);
    const stamp = Date.now().toString(36);
    await signIn(page, KEEPER.name, KEEPER.password);

    // Zonder omslag: geen figuur, het icoon van de soort staat bij de titel.
    await page.goto('/e/middelburg');
    // Golf J (j4): wacht op de editor zelf, niet op de tekst van de eerste verf.
    const first = page.locator('.entry-body-block .ProseMirror:not(.vooraf-tekst) p').first();
    await expect(first).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('.entry-figure')).toHaveCount(0);
    expect((await first.boundingBox())!.y).toBeLessThan(700);
    await shot(page, 'artikel-phone-zonder-omslag-licht');
    await page.emulateMedia({ colorScheme: 'dark' });
    await shot(page, 'artikel-phone-zonder-omslag-donker');
    await page.emulateMedia({ colorScheme: 'light' });

    // Met een omslag: heel, in een kaart, hooguit de helft van de hoogte (golf K:
    // tot golf J was dit de liggende uitsnede), en een tik = de lichtbak.
    const photo = readFileSync(join(root, 'data-e2e', 'fixture-photo.png'));
    const upload = await page.request.post('/api/assets', {
      multipart: { file: { name: `omslag-${stamp}.png`, mimeType: 'image/png', buffer: photo } },
    });
    expect(upload.ok()).toBe(true);
    const asset = ((await upload.json()) as { asset: { id: string } }).asset;
    const artikel = await make(page, `Met omslag ${stamp}`, { shortDescription: 'Een plaat die ligt.' });
    await patch(page, artikel.id, {
      coverAssetId: asset.id,
      body: doc(para(text('De eerste zin staat nog op het eerste scherm, onder de plaat.'))),
    });
    await page.goto(`/e/${artikel.slug}`);
    const cover = page.locator('.entry-cover-whole');
    await expect(cover).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('.entry-cover-liggend')).toHaveCount(0);
    const img = cover.locator('img');
    await expect.poll(() => img.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0)).toBe(true);
    const box = (await img.boundingBox())!;
    expect(box.height).toBeLessThanOrEqual(844 * 0.5 + 1);
    // Heel: de verhouding op het scherm is die van de foto (800 × 500), niets afgesneden.
    expect(Math.abs(box.width / box.height - 800 / 500)).toBeLessThan(0.03);
    // En een kaart: het figuur eromheen heeft een rand.
    const figure = page.locator('.entry-aside-box-stacked > .entry-figure');
    expect(await figure.evaluate((el) => getComputedStyle(el).borderTopWidth)).toBe('1px');
    const firstLine = page.locator('.entry-body-block .ProseMirror p').first();
    await expect(firstLine).toBeVisible();
    expect((await firstLine.boundingBox())!.y).toBeLessThan(844);
    await shot(page, 'artikel-phone-met-omslag');
    await cover.tap();
    const lightbox = page.getByTestId('entry-lightbox');
    await expect(lightbox).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(lightbox).toHaveCount(0);
  });

  test('L8: met de tekstafstand van WCAG 1.4.12 wordt niets afgesneden', async ({ page }, info) => {
    test.setTimeout(120_000);
    await signIn(page, KEEPER.name, KEEPER.password);
    // Een artikel met een infobox, een tekst en Genoemd in: Jacob den Hollander.
    await page.goto('/e/jacob-den-hollander');
    await expect(page.locator('.entry-body-block .ProseMirror p').first()).toBeVisible({ timeout: 20_000 });
    await openGenoemdIn(page);
    if (info.project.name === 'phone') {
      await expect(async () => {
        const info = page.locator('details#block-info');
        if (!(await info.evaluate((el) => (el as HTMLDetailsElement).open))) await info.locator('summary').click();
        expect(await info.evaluate((el) => (el as HTMLDetailsElement).open)).toBe(true);
      }).toPass({ timeout: 10_000 });
    }

    /** Every box in the page that cuts off what is in it — minus a deliberate line clamp and pictures. */
    const clipped = () =>
      page.evaluate(() => {
        const out: string[] = [];
        for (const el of document.querySelectorAll<HTMLElement>('main *')) {
          if (!el.offsetParent && getComputedStyle(el).position !== 'fixed') continue;
          const style = getComputedStyle(el);
          const hides = (value: string) => value === 'hidden' || value === 'clip';
          if (!hides(style.overflowX) && !hides(style.overflowY)) continue;
          if (style.webkitLineClamp && style.webkitLineClamp !== 'none') continue;
          if (el.querySelector('img, svg, canvas') && !el.textContent?.trim()) continue;
          if (!el.textContent?.trim()) continue;
          const cutY = hides(style.overflowY) && el.scrollHeight > el.clientHeight + 1;
          const cutX = hides(style.overflowX) && style.textOverflow !== 'ellipsis' && el.scrollWidth > el.clientWidth + 1;
          if (cutY || cutX) out.push(`${el.tagName.toLowerCase()}.${[...el.classList].join('.')}`);
        }
        return out;
      });

    const before = new Set(await clipped());
    const heightBefore = await page.evaluate(() => document.querySelector('main')!.scrollHeight);
    await page.addStyleTag({
      content: `* { line-height: 1.5 !important; letter-spacing: 0.12em !important; word-spacing: 0.16em !important; }
                p { margin-bottom: 2em !important; }`,
    });
    await page.waitForTimeout(400);
    const after = (await clipped()).filter((name) => !before.has(name));
    expect(after).toEqual([]);
    // De pagina groeit mee in plaats van te knippen.
    const heightAfter = await page.evaluate(() => document.querySelector('main')!.scrollHeight);
    expect(heightAfter).toBeGreaterThanOrEqual(heightBefore);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
    await shot(page, `wcag-1412-${info.project.name}`, true);
  });

  test('screenshots: een artikel in Lezen met Genoemd in, licht en donker', async ({ page }, info) => {
    test.setTimeout(90_000);
    await signIn(page, KEEPER.name, KEEPER.password);
    await page.goto('/e/jacob-den-hollander');
    await expect(page.locator('.entry-body-block .ProseMirror p').first()).toBeVisible({ timeout: 20_000 });
    await shot(page, `artikel-${info.project.name}-licht`);
    const block = await openGenoemdIn(page);
    await expect(block.getByTestId('genoemd-zin').first()).toBeVisible();
    await block.scrollIntoViewIfNeeded();
    await shot(page, `genoemd-${info.project.name}-licht`);
    await page.emulateMedia({ colorScheme: 'dark' });
    await shot(page, `genoemd-${info.project.name}-donker`);
    await page.evaluate(() => window.scrollTo(0, 0));
    await shot(page, `artikel-${info.project.name}-donker`);
    // En een lijst van één soort, om het ritme ernaast te leggen.
    await page.emulateMedia({ colorScheme: 'light' });
    await page.goto('/wiki/character');
    await expect(page.locator('#wiki-entries')).toBeVisible();
    await shot(page, `soort-${info.project.name}-licht`);
  });
});
