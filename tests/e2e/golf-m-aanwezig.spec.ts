import { mkdirSync } from 'node:fs';
import { expect, test, type Browser, type Locator, type Page } from '@playwright/test';
import { signIn, signUp } from './helpers';

/**
 * Golf M (A1–A4): de navigatie zonder knippering, *Wie is er?* rechtsboven op
 * elke pagina, *Ga naar* tot op de plek van de ander, en *Kom kijken* dat je
 * op de plek van de vrager laat landen.
 *
 * Twee browsers waar het om samen gaat: een speler en de Keeper. De Keeper
 * ziet waar een speler staat (§76); een speler ziet van de Keeper alleen dat
 * hij er is — dus de Keeper volgt de speler, en de Keeper vraagt de speler bij.
 */

const KEEPER = ['Keeper', 'abbeytower34'] as const;
const SHOTS = '/tmp/claude-0/shots-golf-m';

async function standOn(page: Page, path: string) {
  await page.goto(path);
  await expect(page.getByTestId('live-strip')).toHaveClass(/live-strip-live/, { timeout: 30_000 });
}

/** §6: een pagina die net navigeerde luistert nog niet; druk tot het paneel er staat. */
async function openRoster(page: Page): Promise<Locator> {
  const button = page.getByTestId('roster-open');
  await expect(button).toBeVisible({ timeout: 30_000 });
  const roster = page.getByTestId('roster');
  await expect(async () => {
    if (!(await roster.isVisible().catch(() => false))) await button.click({ timeout: 5000 });
    await expect(roster).toBeVisible({ timeout: 1500 });
  }).toPass({ timeout: 30_000 });
  return roster;
}

function rowFor(roster: Locator, name: string): Locator {
  return roster.locator('ul.roster-list:not(.roster-tail) > li.roster-row').filter({ hasText: name });
}

/** De strip rechtsboven, helemaal in beeld, en zijn paneel ook. */
async function stripTopRight(page: Page, where: string) {
  const vw = page.viewportSize()!.width;
  const strip = page.getByTestId('live-strip');
  await expect(strip, where).toBeVisible({ timeout: 30_000 });
  const box = (await strip.boundingBox())!;
  expect(box.x + box.width, `${where}: rechterrand in beeld`).toBeLessThanOrEqual(vw);
  expect(box.x, `${where}: in de rechterhelft`).toBeGreaterThan(vw / 2);
  expect(box.y, `${where}: bovenaan`).toBeLessThan(80);
  // En niets anders ligt eroverheen: wat op het midden van de knop staat, is de knop.
  const open = page.getByTestId('roster-open');
  const hit = await open.evaluate((el) => {
    const r = el.getBoundingClientRect();
    const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return Boolean(top && (top === el || el.contains(top)));
  });
  expect(hit, `${where}: de knop is niet bedekt`).toBe(true);
  const roster = await openRoster(page);
  mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: `${SHOTS}/${where.replace(/[^a-z0-9]+/gi, '-')}.png` });
  const pop = (await roster.boundingBox())!;
  expect(pop.x, `${where}: paneel links in beeld`).toBeGreaterThanOrEqual(0);
  expect(pop.x + pop.width, `${where}: paneel rechts in beeld`).toBeLessThanOrEqual(vw);
  await page.keyboard.press('Escape');
  await expect(roster).toHaveCount(0);
}

/** Een prikbord van de Keeper, openbaar, over de API. Geeft het id. */
async function keeperBoard(page: Page, name: string): Promise<string> {
  const made = await page.request.post('/api/boards', { data: { name } });
  expect(made.ok()).toBe(true);
  return ((await made.json()) as { board: { id: string } }).board.id;
}

/** Een speler in een tweede browser. */
async function aPlayer(browser: Browser, name: string, project: Parameters<Browser['newContext']>[0]) {
  const context = await browser.newContext(project);
  const page = await context.newPage();
  await signUp(page, name, 'golfmwachtwoord');
  return { context, page };
}

const CAMERA = { x: -321, y: -123, zoom: 0.73 };

/** Zet de camera van dit tabblad op een prikbord, zoals een hand die er heen schoof. */
async function leaveCamera(page: Page, boardId: string) {
  await page.evaluate(
    ([id, cam]) => sessionStorage.setItem(`canvas:board:${id}:camera`, JSON.stringify(cam)),
    [boardId, CAMERA] as const,
  );
  await page.reload();
  await expect(page.locator('.board-viewport')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('live-strip')).toHaveClass(/live-strip-live/, { timeout: 30_000 });
}

async function cameraOf(page: Page, boardId: string) {
  return page.evaluate((id) => {
    const raw = sessionStorage.getItem(`canvas:board:${id}:camera`);
    return raw ? (JSON.parse(raw) as { x: number; y: number; zoom: number }) : null;
  }, boardId);
}

test.describe('golf M — een tab wisselen', () => {
  test('de oude pagina blijft staan onder de streep, zonder skelet en zonder fade', async ({ page, isMobile }) => {
    test.setTimeout(120_000);
    await signIn(page, ...KEEPER);
    await standOn(page, '/wiki');
    // Iets van de oude pagina, om te zien dat hij blijft staan tot de nieuwe er is.
    await page.evaluate(() => document.querySelector('main :is(.page, .page-wide)')?.setAttribute('data-oud', ''));
    // Een trage server: elk RSC-verzoek wacht 1,2 s.
    const rsc = (url: URL) => url.searchParams.has('_rsc');
    await page.route(
      rsc,
      async (route) => {
        await new Promise((resolve) => setTimeout(resolve, 1200));
        await route.continue().catch(() => {});
      },
    );
    const tab = isMobile
      ? page.getByRole('navigation', { name: 'Tabbalk' }).getByRole('link', { name: /Dossiers/ })
      : page.getByRole('navigation', { name: 'Hoofdmenu' }).getByRole('link', { name: 'Dossiers', exact: true });
    await tab.click({ noWaitAfter: true });
    // Het vakje antwoordt meteen; de streep komt; de oude pagina staat er nog.
    await expect(tab).toHaveAttribute('data-pending', '', { timeout: 2_000 });
    await expect(page.locator('.nav-progress')).toHaveAttribute('data-shown', '1', { timeout: 2_000 });
    await expect(page.locator('main [data-oud]')).toBeVisible();
    await expect(page.getByTestId('nav-skeleton')).toHaveCount(0);
    await page.waitForURL('**/cases', { timeout: 20_000 });
    await expect(page.locator('main [data-oud]')).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.hasAttribute('data-navigated'))).toBe(false);
    const fades = await page.evaluate(() =>
      document.getAnimations().map((a) => (a as CSSAnimation).animationName ?? '').filter((n) => /nav-page|skeleton/.test(n)),
    );
    expect(fades).toEqual([]);
    await page.unroute(rsc);
  });
});

test.describe('golf M — Wie is er?', () => {
  test('rechtsboven, in beeld en klikbaar: lijst, artikel, prikbord — ook op 1920 px', async ({ page, isMobile }) => {
    test.setTimeout(180_000);
    await signIn(page, ...KEEPER);
    const board = await keeperBoard(page, `Hoek ${Date.now().toString(36)}`);
    const sizes = isMobile ? [page.viewportSize()!] : [{ width: 1440, height: 900 }, { width: 1920, height: 1080 }];
    for (const size of sizes) {
      await page.setViewportSize(size);
      for (const path of ['/wiki/alles', '/e/westkapelle-lighthouse', `/b/${board}`]) {
        await standOn(page, path);
        await stripTopRight(page, `${path} op ${size.width}`);
      }
    }
  });

  test('het prikbord toont de strip, en een rij in de lijst zegt Ga naar en Kom kijken', async ({ page, browser }, info) => {
    test.setTimeout(180_000);
    await signIn(page, ...KEEPER);
    const board = await keeperBoard(page, `Samen ${Date.now().toString(36)}`);
    const name = `Speler ${info.project.name} ${Date.now().toString(36)}`;
    const player = await aPlayer(browser, name, info.project.use);
    await standOn(player.page, `/b/${board}`);
    await standOn(page, `/b/${board}`);
    // Op het prikbord: de schijfjes staan in de strip, niet in een eigen rij.
    await expect(page.getByTestId('live-strip').locator('.board-person')).toHaveCount(1, { timeout: 30_000 });
    await expect(page.locator('.board-bar .board-people')).toHaveCount(0);
    const roster = await openRoster(page);
    const row = rowFor(roster, name);
    await expect(row.getByTestId('roster-go')).toBeVisible({ timeout: 30_000 });
    await expect(row.locator('.roster-ask')).toBeVisible();
    await player.context.close();
  });
});

test.describe('golf M — Ga naar en Kom kijken tot op de plek', () => {
  test('Ga naar: de Keeper landt op de camera van de speler', async ({ page, browser }, info) => {
    test.setTimeout(180_000);
    await signIn(page, ...KEEPER);
    const board = await keeperBoard(page, `Volgen ${Date.now().toString(36)}`);
    const name = `Gids ${info.project.name} ${Date.now().toString(36)}`;
    const player = await aPlayer(browser, name, info.project.use);
    await standOn(player.page, `/b/${board}`);
    await leaveCamera(player.page, board);
    expect(await cameraOf(player.page, board)).toMatchObject(CAMERA);

    // De Keeper staat zelf op een ánder prikbord: van prikbord naar prikbord was
    // de weg die niet werkte.
    const own = await keeperBoard(page, `Eigen ${Date.now().toString(36)}`);
    await standOn(page, `/b/${own}`);
    const roster = await openRoster(page);
    const go = rowFor(roster, name).getByTestId('roster-go');
    // De plek gaat pas de lijn op als de hand stil ligt; wacht tot de deur hem draagt.
    await expect(go).toHaveAttribute('href', new RegExp(`^/b/${board}\\?waar=c\\.board\\.${board}\\.`), { timeout: 30_000 });
    await go.click();
    await page.waitForURL(`**/b/${board}`, { timeout: 30_000 });
    await expect.poll(() => cameraOf(page, board), { timeout: 15_000 }).toMatchObject(CAMERA);
    // De plek gaat uit het adres, zoals een keuze (§94).
    await expect.poll(() => new URL(page.url()).search).not.toContain('waar=');
    await expect(page.getByTestId('roster')).toHaveCount(0);
    await player.context.close();
  });

  test('Kom kijken: de speler neemt de uitnodiging aan en landt op de camera van de Keeper', async ({ page, browser }, info) => {
    test.setTimeout(180_000);
    await signIn(page, ...KEEPER);
    const board = await keeperBoard(page, `Bij mij ${Date.now().toString(36)}`);
    const name = `Gast ${info.project.name} ${Date.now().toString(36)}`;
    const player = await aPlayer(browser, name, info.project.use);
    await standOn(player.page, '/wiki');

    await standOn(page, `/b/${board}`);
    await leaveCamera(page, board);
    // Laat de hand stil liggen, zodat de plek op de lijn staat.
    await page.waitForTimeout(1500);
    const roster = await openRoster(page);
    const ask = rowFor(roster, name).locator('.roster-ask');
    await expect(ask).toBeVisible({ timeout: 30_000 });
    await ask.click();
    await expect(ask).toHaveText('gevraagd', { timeout: 15_000 });

    const nudge = player.page.getByTestId('nudge');
    await expect(nudge).toBeVisible({ timeout: 30_000 });
    await expect(nudge).toContainText('Keeper');
    const go = nudge.getByTestId('nudge-go');
    await expect(go).toHaveAttribute('href', new RegExp(`^/b/${board}\\?waar=c\\.board\\.`));
    await go.click();
    await player.page.waitForURL(`**/b/${board}`, { timeout: 30_000 });
    await expect.poll(() => cameraOf(player.page, board), { timeout: 15_000 }).toMatchObject(CAMERA);
    await expect(player.page.getByTestId('nudge')).toHaveCount(0);
    await player.context.close();
  });

  test('Ga naar op een artikel: de Keeper landt op de sectie die de speler leest', async ({ page, browser }, info) => {
    test.setTimeout(180_000);
    await signIn(page, ...KEEPER);
    const stamp = Date.now().toString(36);
    const made = await page.request.post('/api/entries', { data: { name: `Lang verhaal ${stamp}`, typeSlug: 'character' } });
    expect(made.ok()).toBe(true);
    const entry = ((await made.json()) as { entry: { id: string; slug: string } }).entry;
    const paragraph = (n: number) => ({
      type: 'paragraph',
      content: [{ type: 'text', text: `Regel ${n}. `.repeat(40) }],
    });
    const titles = ['De aankomst', 'Het onderzoek', 'De ontknoping'];
    const ids: string[] = [];
    for (const title of titles) {
      const res = await page.request.post(`/api/entries/${entry.id}/sections`);
      expect(res.ok()).toBe(true);
      const { sectionId } = (await res.json()) as { sectionId: string };
      const patch = await page.request.patch(`/api/sections/${sectionId}`, {
        data: {
          title,
          visibility: 'all',
          body: { type: 'doc', content: Array.from({ length: 8 }, (_, i) => paragraph(i)) },
        },
      });
      expect(patch.ok()).toBe(true);
      ids.push(sectionId);
    }
    const target = ids[2];

    const name = `Lezer ${info.project.name} ${stamp}`;
    const player = await aPlayer(browser, name, info.project.use);
    await standOn(player.page, `/e/${entry.slug}`);
    const section = player.page.locator(`#section-${target}`);
    await expect(section).toBeAttached({ timeout: 30_000 });
    await player.page.evaluate((id) => {
      const el = document.getElementById(`section-${id}`)!;
      window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 10);
    }, target);

    await standOn(page, '/wiki');
    const roster = await openRoster(page);
    const row = rowFor(roster, name);
    await expect(row.locator('.roster-detail')).toContainText('De ontknoping', { timeout: 30_000 });
    await row.getByTestId('roster-go').click();
    await page.waitForURL(`**/e/${entry.slug}`, { timeout: 30_000 });
    await expect
      .poll(
        () =>
          page.evaluate((id) => {
            const el = document.getElementById(`section-${id}`);
            return el ? Math.round(el.getBoundingClientRect().top) : null;
          }, target),
        { timeout: 15_000 },
      )
      .toBeLessThan(120);
    expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(200);
    await player.context.close();
  });
});
