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
  tweens: Map<string, unknown>;
  nodeById: Map<string, { depth?: number; side?: 'in' | 'out' }>;
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

  // §50: the focus web reads one side, like every other list. Standing on the
  // players' side the Keeper sees the open artikel alone, even though they may
  // see the other one — the two sides are apart now.
  const fromPlayerSide = await (
    await page.request.get(`/api/web?focus=entry:${open.id}&depth=1`)
  ).json();
  expect(fromPlayerSide.nodes.map((n: { id: string }) => n.id)).not.toContain(`entry:${secret.id}`);

  // Walk across, and both are there, tied both ways.
  await page.request.get('/api/keeper/flip?side=keeper&to=/');
  const keeperGraph = await (await page.request.get(`/api/web?focus=entry:${secret.id}&depth=1`)).json();
  expect(keeperGraph.nodes.map((n: { id: string }) => n.id)).toContain(`entry:${secret.id}`);
  await page.request.get('/api/keeper/flip?side=player&to=/');

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

test('a knot dragged in the organic web stays where it was put, until it is let go', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === 'phone', 'dragging a knot is a desk gesture');
  await signIn(page, ...KEEPER);
  const stamp = Date.now().toString(36);
  const a = await makeEntry(page, `Speld A ${stamp}`);
  const b = await makeEntry(page, `Speld B ${stamp}`);
  const c = await makeEntry(page, `Speld C ${stamp}`);
  await link(page, a, b, c);

  await page.goto(`/web?focus=entry:${a.id}`);
  await expect(page.getByTestId('web-panel')).toContainText(a.name);
  await page.getByRole('button', { name: 'Web', exact: true }).click();
  // Let the simulation cool so the knot is not moving under the hand.
  await page.waitForFunction(() => (window as unknown as { __web: { sim: { settled: boolean } } }).__web.sim.settled);

  const pinnedCount = () => page.evaluate(() => (window as unknown as { __web: { sim: { pinnedCount: number } } }).__web.sim.pinnedCount);
  const id = `entry:${b.id}`;
  const before = await nodePoint(page, id);
  await page.mouse.move(before.x, before.y);
  await page.mouse.down();
  await page.mouse.move(before.x + 60, before.y + 40, { steps: 6 });
  await page.mouse.move(before.x + 140, before.y + 90, { steps: 6 });
  await page.mouse.up();

  // Round 17: it is pinned where it was dropped — and stays there once the
  // web has cooled again, rather than springing back.
  expect(await pinnedCount()).toBe(1);
  await expect(page.getByTestId('web-unpin')).toContainText('1 losmaken');
  await page.waitForFunction(() => (window as unknown as { __web: { sim: { settled: boolean } } }).__web.sim.settled);
  const after = await nodePoint(page, id);
  expect(Math.abs(after.x - (before.x + 140))).toBeLessThan(2);
  expect(Math.abs(after.y - (before.y + 90))).toBeLessThan(2);

  // The button lets everything go; the knot is free again and the button is gone.
  await page.getByTestId('web-unpin').click();
  expect(await pinnedCount()).toBe(0);
  await expect(page.getByTestId('web-unpin')).toHaveCount(0);
});

test('the legend hides a soort of knot; the choice survives a reload; the panel prints the short description', async ({ page }, testInfo) => {
  const isPhone = testInfo.project.name === 'phone';
  await signIn(page, ...KEEPER);
  const stamp = Date.now().toString(36);
  const summary = `Een korte beschrijving ${stamp}.`;
  const made = await page.request.post('/api/entries', { data: { typeSlug: 'character', name: `Wat A ${stamp}`, shortDescription: summary } });
  expect(made.ok()).toBe(true);
  const a: Made = { ...(await made.json()).entry, name: `Wat A ${stamp}` };
  const b = await makeEntry(page, `Wat B ${stamp}`, 'location');
  await link(page, a, b);

  await page.goto(`/web?focus=entry:${a.id}`);
  await expect(page.getByTestId('web-stage')).toBeVisible();
  await expect.poll(() => placedCount(page)).toBe(2);

  // Job 1: the panel prints A's short description under its name.
  if (isPhone) {
    const pt = await nodePoint(page, 'focus');
    await page.mouse.click(pt.x, pt.y);
  }
  await expect(page.getByTestId('web-panel-summary')).toContainText(summary);
  if (isPhone) await page.keyboard.press('Escape');

  // The neighbour's soort comes from the graph the page fetched, not a guess.
  const graph = await (await page.request.get(`/api/web?focus=entry:${a.id}&depth=1`)).json();
  const soort = graph.nodes.find((n: { id: string }) => n.id === `entry:${b.id}`).typeSlug as string;
  expect(soort).toBe('location');

  // Untick the soort under "Wat": B is gone, and the line with it.
  await page.getByTestId('web-legend-toggle').click();
  const legend = page.getByTestId('web-legend').first();
  await expect(legend).toContainText('Wat');
  await legend.getByTestId(`web-soort-${soort}`).uncheck();
  await expect.poll(() => placedCount(page)).toBe(1);
  // A's own soort unticked: the focus is exempt and stays in the middle.
  await legend.getByTestId('web-soort-character').uncheck();
  await expect(legend.getByTestId('web-soort-character')).not.toBeChecked();
  await nodePoint(page, 'focus');
  expect(await placedCount(page)).toBe(1);
  await legend.getByTestId('web-soort-character').check();

  // The choice is this browser's memory: after a reload the row is still off and B still gone.
  await page.reload();
  await expect(page.getByTestId('web-stage')).toBeVisible();
  await expect.poll(() => placedCount(page)).toBe(1);
  await page.getByTestId('web-legend-toggle').click();
  const again = page.getByTestId('web-legend').first();
  await expect(again.getByTestId(`web-soort-${soort}`)).not.toBeChecked();
  await again.getByTestId(`web-soort-${soort}`).check();
  await expect.poll(() => placedCount(page)).toBe(2);
});

/**
 * Round 19: in a focus web, double-click another knot to make it the middle,
 * then switch to Kolommen. Every card must sit on a column — the layout's
 * coordinates are the truth, and a tween only shows the way there. Under
 * reduced motion there is no tween at all, which is where the cards used to
 * stay at their organic spots for ever: columns scattered like a web, with
 * S-curves for lines.
 */
async function refocusThenColumns(page: Page, reduced: boolean) {
  if (reduced) await page.emulateMedia({ reducedMotion: 'reduce' });
  await signIn(page, ...KEEPER);
  const stamp = Date.now().toString(36);
  const a = await makeEntry(page, `Kolom A ${stamp}`);
  const b = await makeEntry(page, `Kolom B ${stamp}`);
  const c = await makeEntry(page, `Kolom C ${stamp}`);
  const d = await makeEntry(page, `Kolom D ${stamp}`, 'location');
  await link(page, a, b, d);
  await link(page, b, c);
  await link(page, c, b);

  // The organic web first, on A; let it cool so the knot is not moving under the hand.
  await page.goto(`/web?focus=entry:${a.id}`);
  await expect(page.getByTestId('web-panel')).toContainText(a.name);
  await expect(page.getByRole('button', { name: 'Web', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.waitForFunction(() => (window as unknown as { __web: { sim: { settled: boolean } } }).__web.sim.settled);

  // A double-click on B makes it the middle.
  const pt = await nodePoint(page, `entry:${b.id}`);
  await page.mouse.dblclick(pt.x, pt.y);
  await page.waitForURL(`**/web?focus=entry%3A${b.id}`);
  await expect(page.getByTestId('web-panel')).toContainText(b.name);
  await expect.poll(() => placedCount(page)).toBe(3);

  // Then Kolommen, and wait until the layout is B's and nothing is still moving.
  await page.getByRole('button', { name: 'Kolommen', exact: true }).click();
  await expect(page.getByTestId('web-stage')).toHaveAttribute('data-mode', 'columns');
  await page.waitForFunction(
    (focus) => {
      const s = (window as unknown as { __web?: WebState }).__web;
      return Boolean(s && s.layoutKey.startsWith(`columns|${focus}|`) && !s.cameraFrom && !s.pendingFit && s.tweens.size === 0);
    },
    `entry:${b.id}`,
  );
  if (!reduced) await page.waitForTimeout(450);

  // Every card is on its column: the focus at 0, one step out at ± one
  // stride. The numbers are `columnLayout`'s: stride 188 + 130, and a
  // column beside the focus shifted by half the difference in card width.
  const rows = await page.evaluate((focus) => {
    const s = (window as unknown as { __web: WebState }).__web;
    return [...s.placed].map(([id, p]) => {
      const n = s.nodeById.get(id) ?? {};
      const column = id === focus ? 0 : n.side === 'in' ? -(n.depth ?? 0) : n.depth ?? 0;
      return { id, x: p.x, column };
    });
  }, `entry:${b.id}`);
  expect(rows.length).toBe(3);
  const stride = 188 + 130;
  const shift = (240 - 188) / 2;
  for (const row of rows) {
    const expected = row.column === 0 ? 0 : row.column * stride + Math.sign(row.column) * shift;
    expect(Math.abs(row.x - expected), `${row.id} in column ${row.column} at x=${row.x}`).toBeLessThan(0.5);
  }
  expect(new Set(rows.map((r) => Math.round(r.x))).size).toBeLessThanOrEqual(3);
  // A is on the left (it names B), C on the right (B names it).
  expect(rows.find((r) => r.id === `entry:${a.id}`)!.column).toBe(-1);
  expect(rows.find((r) => r.id === `entry:${c.id}`)!.column).toBe(1);
}

test('refocused, then Kolommen: every card on its column, with reduced motion', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === 'phone', 'double-click and Kolommen are desk gestures');
  await refocusThenColumns(page, true);
});

test('refocused, then Kolommen: every card on its column, once the tween has landed', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === 'phone', 'double-click and Kolommen are desk gestures');
  await refocusThenColumns(page, false);
});
