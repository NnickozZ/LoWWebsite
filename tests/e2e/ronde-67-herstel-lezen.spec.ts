import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { becomeInvestigator, signIn, signUp } from './helpers';

/**
 * §104, ronde 67 · herstel (F3) — lezen, de wiki en contrast.
 *
 * Wat alleen een browser kan zeggen:
 *
 *  1. **De naad** (§97): een verwijzing die de lezer niet mag volgen is niets,
 *     en de zin eromheen leest netjes — geen spatie vóór een komma, geen
 *     spatie aan het begin van een alinea, geen dubbele spatie. De Keeper ziet
 *     dezelfde tekst met de naam, letter voor letter wat er staat.
 *  2. **De kop op een telefoon**: één regel "Op 2 landkaarten · in 2 dossiers"
 *     die de rest opent, geen *Meer info* in de chipbalk, en met een omslag de
 *     eerste zin boven y = 700.
 *  3. **Lege blokken**: *Genoemd in* en *Geschiedenis* met niets erin zijn één
 *     gedempte regel, en staan niet in de inhoudsopgave.
 *  4. **De wiki**: de voorpagina heeft één compacte rij, `/wiki/alles` zegt
 *     "120 van n" en heeft *Meer*, een lege soort is gedempt.
 *
 * En de schermen, licht en donker, 1440 en 390 — `F3_FASE=voor|na` zet het
 * voorvoegsel, zodat de twee rijen naast elkaar te leggen zijn.
 */

const KEEPER = { name: 'Keeper', password: 'abbeytower34' };
const SHOTS = '/tmp/claude-0/shots-f3';
const FASE = process.env.F3_FASE ?? 'na';

type Made = { id: string; slug: string; name: string };

async function make(page: Page, name: string, extra: Record<string, unknown> = {}): Promise<Made> {
  const made = await page.request.post('/api/entries', { data: { name, typeSlug: 'location', ...extra } });
  expect(made.ok()).toBe(true);
  const entry = ((await made.json()) as { entry: Made }).entry;
  return { id: entry.id, slug: entry.slug, name };
}

async function patch(page: Page, id: string, data: Record<string, unknown>) {
  const response = await page.request.patch(`/api/entries/${id}`, { data });
  expect(response.ok()).toBe(true);
}

async function handleFor(page: Page, entry: Made): Promise<string> {
  const response = await page.request.post('/api/mentions/handle', { data: { entryId: entry.id } });
  expect(response.ok()).toBe(true);
  return ((await response.json()) as { handle: string }).handle;
}

const link = (handle: string) => ({ type: 'entryLink', attrs: { handle } });
const text = (value: string) => ({ type: 'text', text: value });
const para = (...content: object[]) => ({ type: 'paragraph', content });
const doc = (...content: object[]) => ({ type: 'doc', content });

async function shot(page: Page, name: string, fullPage = false) {
  mkdirSync(SHOTS, { recursive: true });
  const project = test.info().project.name === 'desktop' ? 'dt' : 'ph';
  await page.screenshot({ path: join(SHOTS, `${FASE}-${project}-${name}.png`), fullPage });
}

/** Both lights, one after the other. */
async function shots(page: Page, name: string, fullPage = false) {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.waitForTimeout(450);
  await shot(page, `${name}-licht`, fullPage);
  await page.emulateMedia({ colorScheme: 'dark' });
  // The paper turns over with a transition; the screen is judged once it has.
  await page.waitForTimeout(450);
  await shot(page, `${name}-donker`, fullPage);
  await page.emulateMedia({ colorScheme: 'light' });
}

/** A small drawn cover, the way `seed-wereld` draws one: paper, a band in the soort's colour, the name at 70 %. */
async function drawnCover(name: string): Promise<Buffer> {
  const sharp = (await import('sharp')).default;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="1200">
    <rect width="100%" height="100%" fill="#e9e0cd"/>
    <rect x="0" y="744" width="100%" height="36" fill="#2F6B4F" opacity="0.85"/>
    <rect x="54" y="72" width="792" height="1056" fill="none" stroke="#2F6B4F" stroke-width="4" opacity="0.5"/>
    <text x="450" y="840" font-family="Georgia,serif" font-size="58" fill="#2a2118" text-anchor="middle">${name}</text>
  </svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

/** The words the reader sees in one block: what is laid out, not what is in the DOM. */
const seen = (page: Page, selector: string) =>
  page.locator(selector).evaluateAll((els) => els.map((el) => (el as HTMLElement).innerText));

test('#1: wat de lezer niet mag zien is niets, en de zin eromheen leest netjes', async ({ page, browser }, info) => {
  test.setTimeout(240_000);
  const stamp = `${info.project.name}-${Date.now().toString(36)}`;
  const secretName = `Verborgen Sluiswachter ${stamp}`;

  await signIn(page, KEEPER.name, KEEPER.password);
  const secret = await make(page, secretName, { typeSlug: 'character' });
  const open = await make(page, `De Broederschap ${stamp}`, { typeSlug: 'faction' });
  const source = await make(page, `Vlissingen ${stamp}`);
  const hidden = await handleFor(page, secret);
  const shown = await handleFor(page, open);
  await patch(page, source.id, {
    shortDescription: `Havenstad met open water. Gezien bij ⟦${hidden}⟧, in de mist.`,
    body: doc(
      para(link(hidden), text(' heeft hier in maart iets opgetekend en er sindsdien niet meer over gesproken.')),
      para(
        text('Wie hier iets wil weten begint bij '),
        link(hidden),
        text(', en wie iets wil regelen bij '),
        link(shown),
        text('.'),
      ),
      para(text('De brief ging van '), link(hidden), text(' naar de sluis ('), link(hidden), text(') en terug.')),
      para(text('Zie ook '), link(hidden), text('.')),
    ),
  });
  // §6: a picker is sided, so the link is written first and the artikel hidden after.
  await patch(page, secret.id, { visibility: 'keeper' });

  const context = await browser.newContext({ viewport: page.viewportSize() ?? undefined, isMobile: info.project.name === 'phone', hasTouch: info.project.name === 'phone' });
  const player = await context.newPage();
  await signUp(player, `Lezer-${stamp}`.slice(0, 30), 'geheimpje-67');
  await becomeInvestigator(player, `Onderzoeker ${stamp}`.slice(0, 40));
  await player.goto(`/e/${source.slug}`);
  const body = player.locator('.entry-body-block .ProseMirror');
  await expect(body.locator('a.entry-chip', { hasText: open.name })).toBeVisible({ timeout: 20_000 });
  await player.waitForTimeout(600);
  await shots(player, 'naad-artikel');

  const paragraphs = await seen(player, '.entry-body-block .ProseMirror p');
  const lead = (await seen(player, '.entry-lead'))[0];
  // eslint-disable-next-line no-console
  console.log('F3 naad', JSON.stringify({ paragraphs, lead }));
  for (const line of [...paragraphs, lead]) {
    expect(line).not.toContain(secretName);
    expect(line).not.toMatch(/ [,.;:)?!]/);
    expect(line).not.toMatch(/ {2}/);
    expect(line).not.toMatch(/^\s/);
    expect(line).not.toMatch(/\(\s*\)/);
  }
  // §104 (golf H, D28): the paragraph that begins after the hidden name begins
  // with a capital — drawn only (`.naad-hoofd`, text-transform), which is what
  // `innerText` reads; the Keeper still reads the name there, and the text is unchanged.
  expect(paragraphs[0]).toMatch(/^Heeft hier in maart/);
  expect(paragraphs[1]).toContain('begint bij, en wie');
  expect(paragraphs[2]).toBe('De brief ging van naar de sluis en terug.');
  expect(paragraphs[3]).toBe('Zie ook.');
  expect(lead).toContain('Gezien bij, in de mist.');
  expect(await player.content()).not.toContain(secretName);

  // The Keeper reads the same text with the name in it, and the spaces where they are.
  await page.goto(`/e/${source.slug}`);
  const keeperBody = page.locator('.entry-body-block .ProseMirror');
  await expect(keeperBody.locator('a.entry-chip', { hasText: secretName }).first()).toBeVisible({ timeout: 20_000 });
  const keeperParagraphs = await seen(page, '.entry-body-block .ProseMirror p');
  expect(keeperParagraphs[1]).toContain(`begint bij ${secretName}, en wie`);
  expect(keeperParagraphs[2]).toContain(`naar de sluis (${secretName}) en terug.`);
  await context.close();
});

test('#13 #17 #23: de kop op een telefoon is één regel, en lege blokken zijn een gedempte regel', async ({ page }, info) => {
  test.setTimeout(180_000);
  const stamp = `${info.project.name}-${Date.now().toString(36)}`;
  await signIn(page, KEEPER.name, KEEPER.password);

  const artikel = await make(page, `Het Sloe ${stamp}`, {
    shortDescription: 'Een kreek die dichtslibt, met aan de rand een vergeten sluis.',
  });
  const upload = await page.request.post('/api/assets', {
    multipart: { file: { name: `omslag-${stamp}.png`, mimeType: 'image/png', buffer: await drawnCover('Het Sloe') } },
  });
  expect(upload.ok()).toBe(true);
  const asset = ((await upload.json()) as { asset: { id: string } }).asset;
  await patch(page, artikel.id, {
    coverAssetId: asset.id,
    fields: { region: 'Walcheren' },
    body: doc(para(text('De eerste zin staat op het eerste scherm, onder de plaat en de feiten.'))),
  });
  // Two landkaarten and two dossiers.
  for (const n of [1, 2]) {
    const map = await page.request.post('/api/maps', {
      multipart: {
        name: `Kaart ${n} ${stamp}`,
        file: { name: 'kaart.png', mimeType: 'image/png', buffer: await drawnCover(`Kaart ${n}`) },
      },
    });
    expect(map.ok()).toBe(true);
    const { map: made } = (await map.json()) as { map: { id: string } };
    const pin = await page.request.post(`/api/maps/${made.id}/pins`, {
      data: { kind: 'entry', entryId: artikel.id, x: 0.5, y: 0.5 },
    });
    expect(pin.ok()).toBe(true);
    const zaak = await page.request.post('/api/cases', { data: { name: `Zaak ${n} ${stamp}` } });
    expect(zaak.ok()).toBe(true);
    const { case: dossier } = (await zaak.json()) as { case: { id: string } };
    const filed = await page.request.post(`/api/cases/${dossier.id}/entries`, { data: { entryId: artikel.id } });
    expect(filed.ok()).toBe(true);
  }

  await page.goto(`/e/${artikel.slug}`);
  const first = page.locator('.entry-body-block .ProseMirror p').first();
  await expect(first).toBeVisible({ timeout: 20_000 });
  await page.waitForTimeout(500);
  await shots(page, 'kop-met-omslag');

  // On two landkaarten and in two dossiers: *Genoemd in* has rows, and a fold.
  await expect(page.locator('details[data-testid="genoemd-in"]')).toHaveCount(1);
  const outline = page.getByRole('navigation', { name: 'Op deze pagina' });

  if (info.project.name === 'phone') {
    // #17: the facts about where it is are one line with a door.
    const waar = page.getByTestId('entry-waar');
    await expect(waar).toBeVisible();
    await expect(waar.locator('summary')).toHaveText(/Op 2 landkaarten · in 2 dossiers/);
    // The rows are behind it until it is opened.
    await expect(page.locator('.entry-waar-rijen')).toBeHidden();
    // #17/#23: no Meer info in the chip row — the peek is right under it.
    await expect(outline.getByRole('link', { name: 'Meer info' })).toHaveCount(0);
    // Golf K: de omslag staat heel (hooguit de helft van het scherm), dus de
    // eerste zin staat nu net onder de plaat en de feiten, niet meer op 700.
    const cover = (await page.locator('.entry-cover-whole img').boundingBox())!;
    expect(cover.height).toBeLessThanOrEqual(844 * 0.5 + 1);
    expect((await first.boundingBox())!.y).toBeGreaterThan(cover.y + cover.height);
    expect((await first.boundingBox())!.y).toBeLessThan(cover.y + cover.height + 400);
    await waar.locator('summary').click();
    await expect(page.locator('.entry-waar-rijen')).toBeVisible();
    await shot(page, 'kop-waar-open');
  } else {
    // On a desktop there is room: the rows as they were.
    await expect(page.getByTestId('entry-waar')).toHaveCount(0);
  }
  await shots(page, 'artikel-vol', true);

  // #13: an artikel nothing mentions — one quiet line, no fold, not in the outline.
  const stil = await make(page, `Stille Kreek ${stamp}`, { shortDescription: 'Nog door niemand genoemd.' });
  await page.goto(`/e/${stil.slug}`);
  const genoemd = page.getByTestId('genoemd-in');
  await expect(genoemd).toBeVisible({ timeout: 20_000 });
  await expect(genoemd).toHaveAttribute('data-leeg', 'ja');
  await expect(page.locator('details[data-testid="genoemd-in"]')).toHaveCount(0);
  await expect(page.getByRole('navigation', { name: 'Op deze pagina' }).getByRole('link', { name: /Genoemd in/ })).toHaveCount(0);
  await genoemd.scrollIntoViewIfNeeded();
  await shots(page, 'leeg-blok');
});

test('#14 #16: de voorpagina heeft één rij, de lijst zegt hoeveel van hoeveel', async ({ page }) => {
  test.setTimeout(150_000);
  await signIn(page, KEEPER.name, KEEPER.password);

  // The screens first, so a run before the change has them too.
  await page.goto('/wiki');
  await expect(page.getByTestId('soort-tegel').first()).toBeVisible({ timeout: 20_000 });
  await shots(page, 'wiki');
  await shot(page, 'wiki-vol', true);
  // #11: the other shape of *Uit het archief* — an artikel with an omslag (the
  // case above made one). Chance decides which comes up; ask until it does.
  const archief = page.getByTestId('uit-het-archief');
  for (let i = 0; i < 80 && !(await page.locator('.leeskamer-archief-inhoud.met-omslag').count()); i++) {
    const before = await archief.getAttribute('data-slug');
    await page.getByTestId('nog-een').click();
    await expect.poll(() => archief.getAttribute('data-slug'), { timeout: 5000 }).not.toBe(before);
  }
  if (await page.locator('.leeskamer-archief-inhoud.met-omslag').count()) {
    const omslag = (await page.locator('.leeskamer-archief-omslag').boundingBox())!;
    // Upright: the staande crop, whole, not a landscape strip across the name.
    expect(omslag.height).toBeGreaterThan(omslag.width);
    await archief.scrollIntoViewIfNeeded();
    await shots(page, 'wiki-archief-omslag');
  }
  await page.goto('/wiki/alles');
  await expect(page.locator('.sortbar-summary')).toBeVisible();
  await shots(page, 'wiki-alles');
  await page.goto('/wiki/location');
  await shots(page, 'wiki-soort');
  await page.goto('/c/the-unwound-light-case');
  await page.waitForTimeout(500);
  await shots(page, 'dossier');

  await page.goto('/wiki');
  const tabs = page.getByRole('navigation', { name: 'Soorten' });
  await expect(tabs.getByRole('link', { name: 'Start' })).toBeVisible();
  await expect(tabs.getByRole('link', { name: /^Alles/ })).toBeVisible();
  // Golf K: the voordeur has the row of every wiki page — each tab a page, no jump to the tiles.
  expect(await tabs.getByRole('link').count()).toBeGreaterThan(3);
  await expect(tabs.locator('a[href^="#"]')).toHaveCount(0);

  await page.goto('/wiki/alles');
  const listTabs = page.getByRole('navigation', { name: 'Soorten' });
  expect(await listTabs.getByRole('link').count()).toBeGreaterThan(5);
  // An empty soort is dimmed, not gone (the seed has soorten with nothing in them).
  // §104 (golf H, D6): it is in *Meer soorten* now — the row holds the largest.
  await listTabs.getByTestId('meer-soorten').click();
  await expect(listTabs.locator('.meer-soorten-lijst .type-tab.is-leeg').first()).toBeVisible();
  await page.keyboard.press('Escape');

  // #14: the summary says how many of how many, and *Meer* shows the rest — in the URL (§12).
  const total = Number((await listTabs.getByRole('link', { name: /^Alles/ }).locator('.type-tab-count').innerText()).trim());
  await page.goto('/wiki/alles?per=10');
  const summary = page.locator('.sortbar-summary');
  await expect(summary).toHaveText(new RegExp(`^10 van ${total} `));
  const more = page.getByTestId('lijst-meer');
  await expect(more).toBeVisible();
  await more.click();
  await page.waitForURL(/pagina=2/);
  await expect(summary).toHaveText(new RegExp(`^${Math.min(20, total)} van ${total} `));
  await expect(page.locator('.card-grid > *')).toHaveCount(Math.min(20, total));
});
