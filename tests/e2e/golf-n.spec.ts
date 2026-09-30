import { expect, test, type Browser, type Locator, type Page } from '@playwright/test';
import { signIn, signUp } from './helpers';

/**
 * Golf N (Nick, 30 september): de Keeper is te volgen, het prikbord is een
 * rustig vlak, en de tekst vult de kolom. (De tabrij van de wiki staat in
 * `golf-h3-lezen.spec.ts`, D6.)
 */

const KEEPER = ['Keeper', 'abbeytower34'] as const;
const CAMERA = { x: -287, y: -141, zoom: 0.81 };

async function standOn(page: Page, path: string) {
  await page.goto(path);
  await expect(page.getByTestId('live-strip')).toHaveClass(/live-strip-live/, { timeout: 30_000 });
}

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

async function keeperBoard(page: Page, name: string): Promise<string> {
  const made = await page.request.post('/api/boards', { data: { name } });
  expect(made.ok()).toBe(true);
  return ((await made.json()) as { board: { id: string } }).board.id;
}

async function aPlayer(browser: Browser, name: string, project: Parameters<Browser['newContext']>[0]) {
  const context = await browser.newContext(project);
  const page = await context.newPage();
  await signUp(page, name, 'golfnwachtwoord');
  return { context, page };
}

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

test.describe('golf N — de Keeper is te volgen', () => {
  test('een speler gaat naar de Keeper toe, tot op zijn camera; Beheer blijft ergens anders', async ({ page, browser }, info) => {
    test.setTimeout(180_000);
    await signIn(page, ...KEEPER);
    const board = await keeperBoard(page, `Bij de Keeper ${Date.now().toString(36)}`);
    await standOn(page, `/b/${board}`);
    await leaveCamera(page, board);

    const name = `Volger ${info.project.name} ${Date.now().toString(36)}`;
    const player = await aPlayer(browser, name, info.project.use);
    await standOn(player.page, '/wiki');
    const roster = await openRoster(player.page);
    const keeperRow = rowFor(roster, 'Keeper').filter({ hasNotText: '(jij)' });
    const go = keeperRow.getByTestId('roster-go');
    await expect(go).toHaveAttribute('href', new RegExp(`^/b/${board}\\?waar=c\\.board\\.${board}\\.`), { timeout: 30_000 });
    await go.click();
    await player.page.waitForURL(`**/b/${board}`, { timeout: 30_000 });
    await expect.poll(() => cameraOf(player.page, board), { timeout: 15_000 }).toMatchObject(CAMERA);

    // Waar een speler niet mag komen, is de Keeper "ergens anders": geen naam, geen deur.
    await standOn(page, '/admin');
    const again = await openRoster(player.page);
    const row = rowFor(again, 'Keeper').filter({ hasNotText: '(jij)' });
    await expect(row).toHaveAttribute('data-mode', 'hidden', { timeout: 30_000 });
    await expect(row.getByTestId('roster-go')).toHaveCount(0, { timeout: 30_000 });
    await expect(row).not.toContainText('Beheer');
    await player.context.close();
  });
});

test.describe('golf N — de ruimte', () => {
  test('het prikbord is een rustig vlak zonder tegel', async ({ page }) => {
    await signIn(page, ...KEEPER);
    const board = await keeperBoard(page, `Rustig ${Date.now().toString(36)}`);
    await page.goto(`/b/${board}`);
    const glass = page.locator('.board-viewport');
    await expect(glass).toBeVisible({ timeout: 30_000 });
    const layer = await glass.evaluate((el) => {
      const cs = getComputedStyle(el, '::before');
      return { image: cs.backgroundImage, size: cs.backgroundSize, repeat: cs.backgroundRepeat };
    });
    // Eén ruislaag over het hele glas, geen tegel die zich herhaalt.
    expect(layer.image).toContain('feTurbulence');
    // De laatste laag is de ruis: één keer, over het hele glas.
    expect(layer.repeat.split(',').pop()!.trim()).toBe('no-repeat');
    expect(layer.size.split(',').pop()!.trim()).toBe('100% 100%');
    expect(await glass.evaluate((el) => getComputedStyle(el).backgroundImage)).toBe('none');
  });

  test('de tekst op de voorpagina van de wiki vult de kolom', async ({ page, isMobile }) => {
    test.skip(isMobile, 'op een telefoon was de kolom al smal genoeg');
    await page.setViewportSize({ width: 1920, height: 1080 });
    await signIn(page, ...KEEPER);
    await page.goto('/wiki');
    const lead = page.locator('.overzicht-page .entry-lead').first();
    await expect(lead).toBeVisible({ timeout: 30_000 });
    const [leadW, pageW] = await Promise.all([
      lead.evaluate((el) => el.getBoundingClientRect().width),
      page.locator('main .page-wide').first().evaluate((el) => el.getBoundingClientRect().width),
    ]);
    expect(leadW).toBeGreaterThan(pageW * 0.9);
    expect(await lead.evaluate((el) => getComputedStyle(el).maxWidth)).toBe('none');
  });
});
