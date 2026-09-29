import { expect, test, type Browser, type Page } from '@playwright/test';
import { becomeInvestigator, editCanvas, keeperHandsOutSecond, readCanvas, signIn, signUp } from './helpers';

/**
 * §105 (golf J, j1) — de vlakken, na de meting na golf I.
 *
 * Wat dit vasthoudt:
 *
 *  1. **Lezen in Bewerken vraagt niets** (stuk 2b/3, raden 1). Een speler met
 *     twee onderzoekers, in een venster dat nog niets zei: een klik op een
 *     prikbordkaart en *Artikel openen* op een speld vragen niet wie er
 *     schrijft, en de navigatie gebeurt. Een sleep van de kaart vraagt wél.
 *  2. **Vind staat op elk vlak op dezelfde plek** (stuk 1): op de telefoon
 *     klapt het vak open onder de werkbalk, en vak en treffers staan boven de
 *     tabbalk.
 *  3. **Het web vanaf *Verbindingen*** (stuk 4): de peek opent groot, met de
 *     lijst; na een rij is hij klein en staat *Openen* in beeld.
 *  4. **De inspector op een computer** (stuk 10): de naam heel, de knoppen op
 *     één regel per knop.
 *  5. **Ouders bij …** (stuk 9): de caret staat in het zoekvak.
 */

const KEEPER = ['Keeper', 'abbeytower34'] as const;
const PASSWORD = 'wachtwoord-van-j1';
const askSheet = (page: Page) => page.getByRole('dialog', { name: 'Met wie ben je nu aan het schrijven?' });

async function picture(): Promise<Buffer> {
  const sharp = (await import('sharp')).default;
  return sharp({ create: { width: 900, height: 600, channels: 3, background: '#d9d2b8' } })
    .png()
    .toBuffer();
}

async function anEntry(page: Page, name: string) {
  const response = await page.request.get(`/api/suggest?q=${encodeURIComponent(name)}&limit=3`);
  expect(response.ok()).toBe(true);
  const { entries } = (await response.json()) as { entries: { id: string; slug: string; name: string }[] };
  const found = entries.find((entry) => entry.name === name);
  expect(found, `${name} is in the seed`).toBeTruthy();
  return found!;
}

type Made = { board: string; map: string; timeline: string; tree: string; entryId: string; entrySlug: string };

/** Four vlakken made by the Keeper, each with Jacob den Hollander on it. */
async function keeperMakes(browser: Browser, stamp: string): Promise<Made> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await signIn(page, ...KEEPER);
  const entry = await anEntry(page, 'Jacob den Hollander');

  const board = await page.request.post('/api/boards', { data: { name: `J1 muur ${stamp}` } });
  expect(board.ok()).toBe(true);
  const { board: b } = (await board.json()) as { board: { id: string } };
  const cards = [
    { id: `j1-${stamp}`, kind: 'entry', entryId: entry.id, name: '', text: '', showImage: false, x: 300, y: 200, rotation: 0, scale: 1 },
  ];
  const put = await page.request.post(`/api/boards/${b.id}`, {
    data: { clientId: 'j1', cards, viewport: { x: 0, y: 0, zoom: 1 } },
  });
  expect(put.ok()).toBe(true);

  const map = await page.request.post('/api/maps', {
    multipart: { name: `J1 kaart ${stamp}`, file: { name: 'k.png', mimeType: 'image/png', buffer: await picture() } },
  });
  expect(map.ok()).toBe(true);
  const { map: m } = (await map.json()) as { map: { id: string; slug: string } };
  const pin = await page.request.post(`/api/maps/${m.id}/pins`, {
    data: { kind: 'entry', entryId: entry.id, x: 0.5, y: 0.5 },
  });
  expect(pin.ok()).toBe(true);

  const tl = await page.request.post('/api/timelines', { data: { name: `J1 tijdlijn ${stamp}`, scale: 'day' } });
  expect(tl.ok()).toBe(true);
  const { timeline } = (await tl.json()) as { timeline: { id: string; slug: string } };
  const ev = await page.request.post(`/api/timelines/${timeline.id}/events`, {
    data: { kind: 'note', name: `Overtocht ${stamp}`, text: '', at: Math.floor(Date.UTC(1931, 2, 12) / 1000) },
  });
  expect(ev.ok()).toBe(true);

  const tr = await page.request.post('/api/family-trees', { data: { name: `J1 boom ${stamp}` } });
  expect(tr.ok()).toBe(true);
  const { tree } = (await tr.json()) as { tree: { id: string; slug: string } };
  const saved = await page.request.post(`/api/family-trees/${tree.id}`, { data: { members: [{ id: entry.id }] } });
  expect(saved.ok()).toBe(true);

  await context.close();
  return {
    board: `/b/${b.id}`,
    map: `/maps/${m.slug}`,
    timeline: `/timelines/${timeline.slug}`,
    tree: `/stambomen/${tree.slug}`,
    entryId: entry.id,
    entrySlug: entry.slug,
  };
}

/** A fresh window that still owes §18b's answer. */
async function forget(page: Page, path: string) {
  await page.evaluate(() => window.sessionStorage.clear());
  await page.goto(path);
}

test('§105 (golf J) lezen in Bewerken vraagt niet wie er schrijft; een sleep wel', async ({ page, browser }, info) => {
  test.setTimeout(300_000);
  const isPhone = info.project.name === 'phone';
  const stamp = `${info.project.name}-${Date.now().toString(36)}`;
  const made = await keeperMakes(browser, stamp);

  await signUp(page, `Lezer ${stamp}`, PASSWORD);
  await becomeInvestigator(page, `Lezeres ${stamp}`);
  await keeperHandsOutSecond(browser, `Lezer ${stamp}`);

  // 1. Het prikbord: een kaart aanklikken om te lezen, dan *Artikel openen*.
  await forget(page, made.board);
  await editCanvas(page);
  const card = page.locator('.board-card').first();
  await expect(card).toBeVisible({ timeout: 20_000 });
  if (isPhone) await card.tap();
  else await card.click();
  await page.waitForTimeout(600);
  await expect(askSheet(page), 'een kaart kiezen is lezen').toHaveCount(0);
  const open = page.getByRole('button', { name: 'Artikel openen' }).filter({ visible: true }).first();
  await expect(open).toBeVisible();
  await open.click();
  await page.waitForURL(`**/e/${made.entrySlug}`);
  await expect(askSheet(page)).toHaveCount(0);

  // 2. De landkaart: een speld, dan *Artikel openen* — de navigatie gebeurt.
  await forget(page, made.map);
  await editCanvas(page);
  await page.getByRole('group', { name: 'Zoomen', exact: true }).getByRole('button', { name: 'Alles in beeld' }).click();
  const pin = page.locator('.map-pin').first();
  await expect(pin).toBeVisible({ timeout: 20_000 });
  if (isPhone) await pin.tap();
  else await pin.click();
  await page.waitForTimeout(600);
  await expect(askSheet(page), 'een speld kiezen is lezen').toHaveCount(0);
  await page.getByRole('link', { name: 'Artikel openen' }).filter({ visible: true }).first().click();
  await page.waitForURL(`**/e/${made.entrySlug}`);
  await expect(askSheet(page)).toHaveCount(0);

  // 3. En de vraag is er nog, bij wat schrijft: een kaart verslepen.
  if (!isPhone) {
    await forget(page, made.board);
    await editCanvas(page);
    const box = (await page.locator('.board-card').first().boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + 20);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 40, box.y + 60, { steps: 6 });
    await page.mouse.up();
    await expect(askSheet(page), 'een sleep schrijft, dus hij vraagt').toBeVisible({ timeout: 5000 });
  }
});

test('§105 (golf J) Vind klapt op elk vlak open onder de werkbalk, boven de tabbalk', async ({ page, browser }, info) => {
  test.skip(info.project.name !== 'phone', 'dit gaat over de telefoon');
  test.setTimeout(180_000);
  const made = await keeperMakes(browser, `find-${Date.now().toString(36)}`);
  await signIn(page, ...KEEPER);
  const tries: [string, string, string][] = [
    [made.map, '.map-toolbar', 'Jacob'],
    [made.timeline, '.timeline-toolbar', 'Overtocht'],
  ];
  for (const [path, bar, word] of tries) {
    await page.goto(path);
    await readCanvas(page);
    await page.locator('.canvas-find-toggle').first().click();
    const input = page.locator('.canvas-find-input').first();
    await expect(input).toBeFocused();
    await page.keyboard.type(word);
    const hit = page.locator('.canvas-find-list .suggest-item').first();
    await expect(hit).toBeVisible();
    const tabs = (await page.locator('.tabs').boundingBox())!;
    const barBox = (await page.locator(bar).boundingBox())!;
    const inputBox = (await input.boundingBox())!;
    const hitBox = (await hit.boundingBox())!;
    expect(inputBox.y, `${path}: het vak staat onder de werkbalk`).toBeGreaterThanOrEqual(barBox.y + barBox.height - 2);
    expect(inputBox.y + inputBox.height, `${path}: het vak boven de tabbalk`).toBeLessThan(tabs.y);
    expect(hitBox.y + hitBox.height, `${path}: de eerste treffer boven de tabbalk`).toBeLessThanOrEqual(tabs.y);
    // Nothing lies on the box: a tap on it is a tap on it.
    const onTop = await page.evaluate(
      ({ x, y }) => document.elementFromPoint(x, y)?.closest('.canvas-find') !== null,
      { x: inputBox.x + inputBox.width / 2, y: inputBox.y + inputBox.height / 2 },
    );
    expect(onTop, `${path}: niets ligt over het vak`).toBe(true);
    await page.screenshot({ path: `/tmp/claude-0/shots-j1/e2e-vind-${bar.slice(1)}.png` });
    await hit.click();
    await expect(page.locator('.canvas-find-list')).toHaveCount(0);
  }
});

test('§105 (golf J) het web vanaf Verbindingen: de lijst meteen, en na een rij Openen in beeld', async ({ page, browser }, info) => {
  test.skip(info.project.name !== 'phone', 'dit gaat over de telefoon');
  test.setTimeout(180_000);
  const made = await keeperMakes(browser, `web-${Date.now().toString(36)}`);
  await signIn(page, ...KEEPER);
  await page.goto(`/web?focus=entry:${made.entryId}`);
  const peek = page.locator('.canvas-peek.web-peek');
  await expect(peek).toBeVisible({ timeout: 20_000 });
  await expect(peek, 'geopend op iets: de peek staat groot').toHaveAttribute('data-peek', 'full');
  const row = peek.locator('a.web-list-row').first();
  await expect(row).toBeInViewport();
  await page.screenshot({ path: '/tmp/claude-0/shots-j1/e2e-web-aankomst.png' });
  await row.tap();
  await expect(peek).toHaveAttribute('data-peek', 'peek');
  await expect(peek.getByTestId('web-open')).toBeInViewport();
  await page.screenshot({ path: '/tmp/claude-0/shots-j1/e2e-web-na-rij.png' });
});

test('§105 (golf J) de inspector van het prikbord op een computer: de naam heel, geen knop in tweeën', async ({ page, browser }, info) => {
  test.skip(info.project.name === 'phone', 'dit gaat over de computer');
  test.setTimeout(120_000);
  const made = await keeperMakes(browser, `insp-${Date.now().toString(36)}`);
  await signIn(page, ...KEEPER);
  await page.goto(made.board);
  await editCanvas(page);
  await page.locator('.board-card').first().click();
  const inspector = page.locator('.board-inspector');
  await expect(inspector).toBeVisible();
  const title = inspector.locator('.board-inspector-title');
  await expect(title).toContainText('Jacob den Hollander');
  const clipped = await title.evaluate((node) => node.scrollWidth > node.clientWidth + 1);
  expect(clipped, 'de naam staat er heel').toBe(false);
  for (const button of await inspector.locator('.btn').all()) {
    const box = (await button.boundingBox())!;
    expect(box.height, `${await button.innerText()}: op één regel`).toBeLessThan(48);
  }
  await page.screenshot({ path: '/tmp/claude-0/shots-j1/e2e-inspector-D.png' });
});

test('§105 (golf J) Ouders bij …: de caret staat in het zoekvak', async ({ page, browser }) => {
  test.setTimeout(120_000);
  const made = await keeperMakes(browser, `boom-${Date.now().toString(36)}`);
  await signIn(page, ...KEEPER);
  await page.goto(made.tree);
  await editCanvas(page);
  await page.getByRole('group', { name: 'Zoomen', exact: true }).getByRole('button', { name: 'Alles in beeld' }).click();
  const node = page.locator('[data-testid="tree-node"]').first();
  await expect(node).toBeVisible({ timeout: 20_000 });
  await node.click();
  await page.getByRole('button', { name: /^Ouders toevoegen bij/ }).filter({ visible: true }).first().click();
  await expect(page.getByTestId('tree-picker')).toBeVisible();
  await expect(page.locator('#tree-picker-search')).toBeFocused();
});
