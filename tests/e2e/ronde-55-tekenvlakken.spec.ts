import { expect, test, type Page } from '@playwright/test';
import { editCanvas, fillWhenReady, readCanvas, signIn } from './helpers';

/**
 * Ronde 55 (§94) — de tekenvlakken, vinden en terug.
 *
 * One case per finding, each walked the way a person walks it:
 *
 *  - O1  a surface you just made opens in Bewerken, and opens in Lezen again
 *        on a phone once it is reopened;
 *  - C5  a speld chosen, its artikel read, Back — the same zoom and the same
 *        speld chosen;
 *  - C4  a card found by name on a prikbord in Lezen, and the choice is in the
 *        address;
 *  - C16 "Ga naar…" on a tijdlijn;
 *  - C20 an artikel's door to the stamboom it stands in, with it chosen;
 *  - C21 the web opened on something opens with its peek up, on a phone;
 *  - O10 a draad without a drag (*Touwtje*);
 *  - C8  the stamboom's `+` handles say which they are.
 *
 * The fixtures are made through the API as the Keeper (who writes without the
 * §18b question), so each case spends its time on the gesture it is about.
 */

const KEEPER = ['Keeper', 'abbeytower34'] as const;

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

/** §94 (C4): on a phone the find box is a loep until it is pressed. */
async function openFind(page: Page, testId: string) {
  const find = page.getByTestId(testId);
  const toggle = find.locator('.canvas-find-toggle');
  if (await toggle.isVisible().catch(() => false)) {
    await toggle.click();
  }
  await expect(find.getByRole('textbox')).toBeVisible();
  return find;
}

/** The mode switch, once the client has answered for itself (§73, `data-ready`). */
async function modeIs(page: Page, name: 'Lezen' | 'Bewerken') {
  const group = page.getByTestId('canvas-mode').first();
  await expect(group).toHaveAttribute('data-ready', 'true', { timeout: 15_000 });
  await expect(group.getByRole('radio', { name, exact: true })).toHaveAttribute('aria-checked', 'true');
}

test('O1: een prikbord dat je net maakte opent in Bewerken, en weer in Lezen op een telefoon', async ({ page }, info) => {
  await signIn(page, ...KEEPER);
  await page.goto('/boards');
  await page.getByRole('button', { name: /^Nieuw prikbord$/ }).click();
  const sheet = page.getByRole('dialog', { name: /Nieuw prikbord/ });
  await fillWhenReady(sheet.getByLabel('Naam', { exact: true }), `Vers ${info.project.name} ${Date.now()}`);
  await sheet.getByRole('button', { name: /Openbaar prikbord/ }).click();
  await page.waitForURL('**/b/**');

  // Bewerken, on a phone too — and the search that hangs a card is right there.
  await modeIs(page, 'Bewerken');
  await expect(page.getByLabel('Kaart toevoegen')).toBeVisible();
  // `?new=1` did its one job and left the address.
  await expect.poll(() => new URL(page.url()).searchParams.get('new')).toBeNull();

  // Opening it again is §73's rule again: a phone reads, a desk edits.
  await page.reload();
  await modeIs(page, info.project.name === 'phone' ? 'Lezen' : 'Bewerken');
});

test('C5: een speld kiezen, het artikel lezen, Terug — zelfde zoom en de speld nog gekozen', async ({ page }, info) => {
  test.setTimeout(120_000);
  await signIn(page, ...KEEPER);
  const entry = await anEntry(page, 'Westkapelle Lighthouse');
  const made = await page.request.post('/api/maps', {
    multipart: {
      name: `Terugkaart ${info.project.name} ${Date.now()}`,
      file: { name: 'kaart.png', mimeType: 'image/png', buffer: await picture() },
    },
  });
  expect(made.ok()).toBe(true);
  const { map } = (await made.json()) as { map: { id: string; slug: string } };
  const pin = await page.request.post(`/api/maps/${map.id}/pins`, {
    data: { kind: 'entry', entryId: entry.id, x: 0.5, y: 0.5 },
  });
  expect(pin.ok()).toBe(true);

  await page.goto(`/maps/${map.slug}`);
  const level = page.getByRole('group', { name: 'Zoomen', exact: true }).locator('.canvas-zoom-level');
  await expect(level).toHaveText(/\d+%/);
  const dialog = page.getByRole('dialog', { name: entry.name });
  await expect(async () => {
    if (!(await dialog.isVisible().catch(() => false))) {
      await page.locator('.map-pin', { hasText: entry.name }).first().click();
    }
    await expect(dialog).toBeVisible({ timeout: 1500 });
  }).toPass({ timeout: 15_000 });
  await expect.poll(() => new URL(page.url()).searchParams.get('pin')).toBeTruthy();
  await page.getByRole('group', { name: 'Zoomen', exact: true }).getByRole('button', { name: 'Inzoomen' }).click();
  const zoomed = await level.textContent();

  await dialog.getByRole('link', { name: /openen/ }).click();
  await page.waitForURL(`**/e/${entry.slug}`);
  await page.goBack();
  await page.waitForURL((url) => url.pathname === `/maps/${map.slug}`);

  await expect(page.getByRole('dialog', { name: entry.name })).toBeVisible();
  await expect(level).toHaveText(zoomed ?? '');
});

test('C4: een kaart op naam vinden op het prikbord, ook in Lezen', async ({ page }, info) => {
  await signIn(page, ...KEEPER);
  const stamp = `${info.project.name}-${Date.now().toString(36)}`;
  const made = await page.request.post('/api/boards', { data: { name: `Vindbord ${stamp}` } });
  expect(made.ok()).toBe(true);
  const { board } = (await made.json()) as { board: { id: string } };
  await page.goto(`/b/${board.id}`);
  await editCanvas(page);

  for (const note of [`Boone ${stamp}`, `Kerkhof ${stamp}`]) {
    const box = page.getByLabel('Kaart toevoegen');
    await fillWhenReady(box, note);
    await page.locator('.suggest-item').filter({ hasText: 'als notitie toevoegen' }).first().click();
    await expect(page.locator('.board-card', { hasText: note })).toHaveCount(1);
  }

  // In Bewerken the same box finds what is up, as its top group.
  await fillWhenReady(page.getByLabel('Kaart toevoegen'), 'Kerkhof');
  await expect(page.getByTestId('board-find-group')).toBeVisible();
  await page.keyboard.press('Escape');
  await page.getByLabel('Kaart toevoegen').fill('');

  await readCanvas(page);
  const find = await openFind(page, 'board-find');
  await fillWhenReady(find.getByRole('textbox'), 'Boone');
  await find.locator('.suggest-item', { hasText: `Boone ${stamp}` }).click();
  await expect(page.locator('.board-card-selected', { hasText: `Boone ${stamp}` })).toBeVisible();
  await expect.poll(() => new URL(page.url()).searchParams.get('card')).toBeTruthy();

  // And the address brings it back.
  await page.reload();
  await expect(page.locator('.board-card-selected', { hasText: `Boone ${stamp}` })).toBeVisible();
});

test('C16: "Ga naar…" op een tijdlijn zet de as om dat jaar', async ({ page }, info) => {
  await signIn(page, ...KEEPER);
  const made = await page.request.post('/api/timelines', {
    data: { name: `Sprong ${info.project.name} ${Date.now()}`, scale: 'month' },
  });
  expect(made.ok()).toBe(true);
  const { timeline } = (await made.json()) as { timeline: { slug: string } };
  await page.goto(`/timelines/${timeline.slug}`);
  await expect(page.getByTestId('timeline-stage')).toBeVisible();

  // §94 (C7): the readout says how much time is on the glass.
  const level = page.getByRole('group', { name: 'Zoomen', exact: true }).locator('.canvas-zoom-level');
  await expect(level).toHaveText(/^≈ \d/);

  if (info.project.name === 'phone') {
    await page.getByTestId('timeline-settings').click();
    const go = page.getByTestId('timeline-goto-sheet');
    await fillWhenReady(go.getByRole('textbox'), '1712');
    await go.getByRole('textbox').press('Enter');
    await expect(go).toHaveCount(0);
  } else {
    const go = page.getByTestId('timeline-goto');
    await fillWhenReady(go.getByRole('textbox'), '1712');
    await go.getByRole('textbox').press('Enter');
  }
  await expect(page.locator('.timeline-tick', { hasText: '1712' }).first()).toBeVisible();

  // Something the page cannot read says so, and moves nothing.
  if (info.project.name !== 'phone') {
    const go = page.getByTestId('timeline-goto');
    await go.getByRole('textbox').fill('ooit');
    await go.getByRole('textbox').press('Enter');
    await expect(go.getByRole('status')).toBeVisible();
  }
});

test('C20 + C8: een artikel heeft een deur naar zijn stamboom, die opent met hem gekozen', async ({ page }, info) => {
  await signIn(page, ...KEEPER);
  const entry = await anEntry(page, 'Jacob den Hollander');
  const treeName = `Deurboom ${info.project.name} ${Date.now()}`;
  const made = await page.request.post('/api/family-trees', { data: { name: treeName } });
  expect(made.ok()).toBe(true);
  const { tree } = (await made.json()) as { tree: { id: string; slug: string } };
  const saved = await page.request.post(`/api/family-trees/${tree.id}`, {
    data: { members: [{ id: entry.id }] },
  });
  expect(saved.ok()).toBe(true);

  await page.goto(`/e/${entry.slug}`);
  const door = page.getByRole('main').getByTestId('entry-in-tree').filter({ hasText: treeName });
  await expect(door).toBeVisible();
  await door.click();
  await page.waitForURL((url) => url.pathname === `/stambomen/${tree.slug}`);
  expect(new URL(page.url()).searchParams.get('node')).toBe(`entry:${entry.id}`);
  await expect(page.locator(`.tree-node.is-selected[data-node-id="entry:${entry.id}"]`)).toBeVisible();

  // C8: in Bewerken the four `+`s hang off it, each with its word.
  await editCanvas(page);
  await expect(page.getByTestId('tree-handle-parent')).toContainText('Ouder');
  await expect(page.getByTestId('tree-handle-child')).toContainText('Kind');

  // C4: and the tree finds by name too.
  await page.keyboard.press('Escape');
  const find = await openFind(page, 'tree-find');
  await fillWhenReady(find.getByRole('textbox'), 'Jacob');
  await find.locator('.suggest-item', { hasText: entry.name }).click();
  await expect(page.locator(`.tree-node.is-selected[data-node-id="entry:${entry.id}"]`)).toBeVisible();
});

test('C21: het web op een telefoon opent met de peek van de focus al open', async ({ page }, info) => {
  test.skip(info.project.name !== 'phone', 'the peek is the phone’s panel; a desk has the side column');
  await signIn(page, ...KEEPER);
  const entry = await anEntry(page, 'Westkapelle Lighthouse');
  await page.goto(`/web?focus=${encodeURIComponent(`entry:${entry.id}`)}`);
  await expect(page.locator('.canvas-peek')).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('.canvas-peek')).toContainText(entry.name);
});

test('O10: een draad zonder slepen — Touwtje in het paneel van een kaart', async ({ page }, info) => {
  await signIn(page, ...KEEPER);
  const stamp = `${info.project.name}-${Date.now().toString(36)}`;
  const made = await page.request.post('/api/boards', { data: { name: `Touwbord ${stamp}` } });
  const { board } = (await made.json()) as { board: { id: string } };
  await page.goto(`/b/${board.id}`);
  await editCanvas(page);
  for (const note of [`Een ${stamp}`, `Twee ${stamp}`]) {
    await fillWhenReady(page.getByLabel('Kaart toevoegen'), note);
    await page.locator('.suggest-item').filter({ hasText: 'als notitie toevoegen' }).first().click();
    await expect(page.locator('.board-card', { hasText: note })).toHaveCount(1);
  }
  await page.getByRole('button', { name: 'Alles in beeld' }).click();

  await page.locator('.board-card', { hasText: `Een ${stamp}` }).locator('.board-card-name').click();
  await page.getByTestId('board-string-start').click();
  await expect(page.getByTestId('board-string-pick')).toBeVisible();
  await page.locator('.board-card', { hasText: `Twee ${stamp}` }).locator('.board-card-name').click();
  await expect(page.getByTestId('board-string-pick')).toHaveCount(0);
  await expect(page.locator('path.board-string')).toHaveCount(1);
});
