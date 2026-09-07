import { expect, test, type Page } from '@playwright/test';
import { signIn, signUp } from './helpers';

/**
 * §43: het web.
 *
 *  1. From an artikel, "Verbindingen" opens the web with that artikel in the
 *     middle; the panel names what it points at and how; a click picks the
 *     other end, "Middelpunt" re-centres, the depth stepper goes deeper, and
 *     the legend can switch a kind of line off.
 *  2. Rule 1: a Keeper-only artikel is not in a player's web — not as a knot,
 *     not as a line, not as a name anywhere in what the server sends.
 *  3. On a phone the whole web is a search box; a focus is drawn.
 */

const KEEPER = ['Keeper', 'abbeytower34'] as const;

type Made = { id: string; slug: string; name: string };

async function makeEntry(page: Page, name: string, typeSlug = 'character'): Promise<Made> {
  const response = await page.request.post('/api/entries', { data: { typeSlug, name } });
  expect(response.ok()).toBe(true);
  const { entry } = await response.json();
  return { id: entry.id, slug: entry.slug, name };
}

/** Writes "Zie ook [link]…" into an artikel's body — the ordinary way one artikel names others. */
async function link(page: Page, from: Made, ...to: Made[]) {
  const body = {
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: to.flatMap((target) => [
          { type: 'text', text: 'Zie ook ' },
          { type: 'entryLink', attrs: { id: target.id, label: target.name } },
          { type: 'text', text: '. ' },
        ]),
      },
    ],
  };
  const response = await page.request.patch(`/api/entries/${from.id}`, { data: { body } });
  expect(response.ok()).toBe(true);
}


type WebState = {
  placed: Map<string, { x: number; y: number }>;
  camera: { x: number; y: number; zoom: number };
  cameraFrom: unknown;
  pendingFit: boolean;
  size: { w: number; h: number };
  layoutKey: string;
};

/**
 * Where a knot is on the screen, once the drawing has placed it and the camera
 * has stopped moving — the same numbers the canvas paints with, read off the
 * handle it exposes for exactly this.
 */
async function nodePoint(page: Page, id: string | 'focus') {
  await page.waitForFunction(
    (wanted) => {
      const s = (window as unknown as { __web?: WebState }).__web;
      if (!s || s.cameraFrom || s.pendingFit) return false;
      const key = wanted === 'focus' ? s.layoutKey.split('|')[1] : wanted;
      return s.placed.has(key);
    },
    id,
  );
  const pt = await page.evaluate((wanted) => {
    const s = (window as unknown as { __web: WebState }).__web;
    const key = wanted === 'focus' ? s.layoutKey.split('|')[1] : wanted;
    const p = s.placed.get(key)!;
    return { x: (p.x - s.camera.x) * s.camera.zoom + s.size.w / 2, y: (p.y - s.camera.y) * s.camera.zoom + s.size.h / 2 };
  }, id);
  const box = (await page.locator('.web-canvas').boundingBox())!;
  return { x: box.x + pt.x, y: box.y + pt.y };
}

async function placedCount(page: Page) {
  return page.evaluate(() => (window as unknown as { __web: WebState }).__web.placed.size);
}

test('from an artikel into the web, and around it', async ({ page }, testInfo) => {
  const isPhone = testInfo.project.name === 'phone';
  await signIn(page, ...KEEPER);
  const stamp = Date.now().toString(36);
  const a = await makeEntry(page, `Web A ${stamp}`);
  const b = await makeEntry(page, `Web B ${stamp}`);
  const c = await makeEntry(page, `Web C ${stamp}`, 'location');
  await link(page, a, b);
  await link(page, b, c);

  // The button on the artikel.
  await page.goto(`/e/${a.slug}`);
  await page.getByTestId('connections-link').first().click();
  await page.waitForURL(`**/web?focus=entry%3A${a.id}`);
  await expect(page.getByTestId('web-stage')).toBeVisible();
  await expect(page.getByTestId('web-depth')).toContainText('1');

  // The panel is about the focus, and says how B hangs off it. On a phone
  // the panel is a sheet that opens when something is chosen; the focus is
  // chosen from the start, so open it.
  if (isPhone) {
    // A tap on the focus card opens the sheet.
    const pt = await nodePoint(page, 'focus');
    await page.mouse.click(pt.x, pt.y);
  }
  const panel = page.getByTestId('web-panel');
  await expect(panel).toContainText(a.name);
  await expect(panel).toContainText('Tussen artikelen');
  const rowB = panel.getByRole('button', { name: new RegExp(b.name) });
  await expect(rowB).toContainText('genoemd in de tekst');
  await expect(rowB).toContainText('→');
  // Depth 1: C is two steps away and not here.
  await expect(panel).not.toContainText(c.name);

  // Pick B from the panel: the panel is now about B, and B can become the middle.
  await panel.getByRole('button', { name: new RegExp(b.name) }).click();
  await expect(panel).toContainText(b.name);
  await expect(panel.getByRole('button', { name: new RegExp(a.name) })).toContainText('←');
  await panel.getByTestId('web-focus-this').click();
  await page.waitForURL(`**/web?focus=entry%3A${b.id}`);
  if (isPhone) {
    // The sheet closed with the refocus; the toolbar is what is left to check.
    await expect(page.getByTestId('web-depth')).toContainText('1');
  } else {
    await expect(panel).toContainText(b.name);
    await expect(panel).toContainText(a.name);
    await expect(panel).toContainText(c.name);
    // The trail remembers A; Terug goes there.
    await expect(page.getByText('Eerder:')).toBeVisible();
    await page.getByTestId('web-back').click();
    await page.waitForURL(`**/web?focus=entry%3A${a.id}`);
    await expect(panel).toContainText(a.name);
  }

  // Back to A, one step deeper: C arrives.
  await page.goto(`/web?focus=entry:${a.id}`);
  await page.getByRole('button', { name: 'Dieper' }).click();
  await expect(page.getByTestId('web-depth')).toContainText('2');
  await expect(page).toHaveURL(/d=2/);
  await expect.poll(() => placedCount(page)).toBe(3);
  await page.getByRole('button', { name: 'Minder diep' }).click();
  await expect(page.getByTestId('web-depth')).toContainText('1');

  // The legend switches the text lines off, and nothing is left hanging on A.
  await page.getByTestId('web-legend-toggle').click();
  const legend = page.getByTestId('web-legend').first();
  await legend.getByRole('checkbox', { name: /genoemd in de tekst/ }).uncheck();
  await expect.poll(() => placedCount(page)).toBe(1);
  await legend.getByRole('checkbox', { name: /genoemd in de tekst/ }).check();
  await expect.poll(() => placedCount(page)).toBe(2);
});

test('rule 1: a Keeper-only artikel is not in a player\'s web at all', async ({ browser, page }) => {
  await signIn(page, ...KEEPER);
  const stamp = Date.now().toString(36);
  const open = await makeEntry(page, `Openbaar ${stamp}`);
  const secret = await makeEntry(page, `Geheim ${stamp}`);
  const hidden = await page.request.patch(`/api/entries/${secret.id}`, { data: { visibility: 'keeper' } });
  expect(hidden.ok()).toBe(true);
  await link(page, open, secret);
  await link(page, secret, open);

  // The Keeper sees both, tied both ways.
  const keeperGraph = await (await page.request.get(`/api/web?focus=entry:${open.id}&depth=1`)).json();
  expect(keeperGraph.nodes.map((n: { id: string }) => n.id)).toContain(`entry:${secret.id}`);
  expect(keeperGraph.edges.length).toBe(2);

  // A player sees the open one alone — and the secret's name is nowhere in the answer.
  const context = await browser.newContext();
  const player = await context.newPage();
  await signUp(player, `speler-${stamp}`, 'wachtwoord123');
  const response = await player.request.get(`/api/web?focus=entry:${open.id}&depth=4`);
  expect(response.ok()).toBe(true);
  const text = await response.text();
  expect(text).not.toContain(secret.name);
  expect(text).not.toContain(secret.id);
  const graph = JSON.parse(text);
  expect(graph.nodes.map((n: { id: string }) => n.id)).toContain(`entry:${open.id}`);
  expect(graph.edges.filter((e: { from: string; to: string }) => e.from === `entry:${open.id}` || e.to === `entry:${open.id}`)).toEqual([]);
  // The whole web, too.
  const whole = await (await player.request.get('/api/web')).text();
  expect(whole).not.toContain(secret.name);
  // And asking for the secret as a middle is a not-found, not a leak.
  const refused = await player.request.get(`/api/web?focus=entry:${secret.id}`);
  expect(refused.status()).toBe(404);
  await context.close();
});

test('the whole web is a drawing on a desk and a search box on a phone', async ({ page }, testInfo) => {
  const isPhone = testInfo.project.name === 'phone';
  await signIn(page, ...KEEPER);
  await page.goto('/web');
  if (isPhone) {
    await expect(page.getByText('iets voor een groot scherm')).toBeVisible();
    await expect(page.getByTestId('web-stage')).toHaveCount(0);
    // Searching something makes it the middle, and then there is a drawing.
    await page.getByLabel('Zoek in het web').fill('Anneke');
    await page.locator('.web-suggest .suggest-item').first().click();
    await expect(page).toHaveURL(/focus=entry/);
    await expect(page.getByTestId('web-stage')).toBeVisible();
  } else {
    await expect(page.getByTestId('web-view')).toHaveAttribute('data-scope', 'all');
    await expect(page.getByTestId('web-stage')).toBeVisible();
    await expect(page.getByTestId('web-view')).toContainText(/\d+ knopen · \d+ lijnen/);
    // The menu has it.
    await expect(page.getByRole('navigation', { name: 'Hoofdmenu' }).first().getByRole('link', { name: 'Het web' })).toBeVisible();
  }
});

test('a selection in the web goes onto a prikbord as cards', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === 'phone', 'shift-click is a desk gesture');
  await signIn(page, ...KEEPER);
  const stamp = Date.now().toString(36);
  const a = await makeEntry(page, `Prik A ${stamp}`);
  const b = await makeEntry(page, `Prik B ${stamp}`);
  const c = await makeEntry(page, `Prik C ${stamp}`);
  await link(page, a, b, c);

  await page.goto(`/web?focus=entry:${a.id}`);
  await expect(page.getByTestId('web-panel')).toContainText(a.name);

  // Shift-click B and C on the canvas: three chosen, the focus included.
  for (const id of [`entry:${b.id}`, `entry:${c.id}`]) {
    const pt = await nodePoint(page, id);
    await page.keyboard.down('Shift');
    await page.mouse.click(pt.x, pt.y);
    await page.keyboard.up('Shift');
  }
  await expect(page.getByTestId('web-view')).toContainText('3 gekozen');

  // Onto a new prikbord, named after the search box.
  await page.getByTestId('web-pin-selection').click();
  const sheet = page.getByRole('dialog');
  await sheet.getByLabel(/zoeken/i).fill(`Muur ${stamp}`);
  await sheet.getByRole('button', { name: new RegExp(`Nieuw prikbord .*Muur ${stamp}`) }).click();
  await expect(page.getByText(/3 kaarten geprikt op/)).toBeVisible();

  // The wall has three cards, one per chosen knot.
  const boards = await (await page.request.get('/api/boards')).json();
  const wall = boards.boards.find((item: { name: string }) => item.name === `Muur ${stamp}`);
  expect(wall).toBeTruthy();
  const board = await (await page.request.get(`/api/boards/${wall.id}`)).json();
  const cards = (board.state?.cards ?? []) as { entryId?: string }[];
  expect(cards.map((card) => card.entryId).sort()).toEqual([a.id, b.id, c.id].sort());
});
