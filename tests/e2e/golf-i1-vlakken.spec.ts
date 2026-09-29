import { expect, test, type Page } from '@playwright/test';
import { editCanvas, readCanvas, signIn } from './helpers';

/**
 * §105 (golf i1) — de tekenvlakken op de telefoon.
 *
 * Wat dit vasthoudt:
 *
 *  1. **Eén regel werkbalk.** Lezen/Bewerken, Vind en de zoombalk met *Alles in
 *     beeld* staan op één regel, en het glas krijgt minstens 68 % van 390×844
 *     en 62 % van 393×727 (was 53–60 %).
 *  2. **De kop is twee regels**, met *Verbindingen* als icoon naast de naam.
 *  3. **De maakknop staat onder de duim**, rond en minstens 44 px, met
 *     *Ongedaan maken* ernaast — in Bewerken. In Lezen staat er geen van beide.
 *  4. **De peek** laat de tabbalk en de maakknop vrij, groeit met de greep, en
 *     gaat met een veeg omlaag weg.
 *  5. **Een leeg vlak** zegt één zin en heeft één knop, en die knop doet het.
 *  6. **De computer** houdt zijn woorden en zijn werkbalk.
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

type Made = { board: string; map: string; timeline: string; tree: string };

/** Four vlakken, each with one thing on it, made through the API. */
async function makeFour(page: Page, stamp: string): Promise<Made> {
  const entry = await anEntry(page, 'Jacob den Hollander');

  const board = await page.request.post('/api/boards', { data: { name: `I1 muur ${stamp}` } });
  expect(board.ok()).toBe(true);
  const { board: b } = (await board.json()) as { board: { id: string } };

  const map = await page.request.post('/api/maps', {
    multipart: { name: `I1 kaart ${stamp}`, file: { name: 'k.png', mimeType: 'image/png', buffer: await picture() } },
  });
  expect(map.ok()).toBe(true);
  const { map: m } = (await map.json()) as { map: { id: string; slug: string } };
  const pin = await page.request.post(`/api/maps/${m.id}/pins`, {
    data: { kind: 'entry', entryId: entry.id, x: 0.5, y: 0.5 },
  });
  expect(pin.ok()).toBe(true);

  const tl = await page.request.post('/api/timelines', { data: { name: `I1 tijdlijn ${stamp}`, scale: 'month' } });
  expect(tl.ok()).toBe(true);
  const { timeline } = (await tl.json()) as { timeline: { slug: string } };

  const tr = await page.request.post('/api/family-trees', { data: { name: `I1 boom ${stamp}` } });
  expect(tr.ok()).toBe(true);
  const { tree } = (await tr.json()) as { tree: { id: string; slug: string } };
  const saved = await page.request.post(`/api/family-trees/${tree.id}`, { data: { members: [{ id: entry.id }] } });
  expect(saved.ok()).toBe(true);

  return { board: `/b/${b.id}`, map: `/maps/${m.slug}`, timeline: `/timelines/${timeline.slug}`, tree: `/stambomen/${tree.slug}` };
}

const STAGE: Record<keyof Made, string> = {
  board: '.board-viewport',
  map: '.map-stage',
  timeline: '.timeline-stage',
  tree: '.tree-stage',
};

/** The middle of a box, vertically. */
const mid = (box: { y: number; height: number }) => box.y + box.height / 2;

test.describe('§105 de tekenvlakken op de telefoon', () => {
  test.beforeEach(({}, info) => {
    test.skip(info.project.name !== 'phone', 'dit gaat over de telefoon');
  });

  test('één regel werkbalk, een kop van twee regels, en het glas krijgt het scherm', async ({ page }) => {
    test.setTimeout(180_000);
    await signIn(page, ...KEEPER);
    const made = await makeFour(page, Date.now().toString(36));

    for (const kind of Object.keys(made) as (keyof Made)[]) {
      await page.goto(made[kind]);
      await expect(page.locator(STAGE[kind])).toBeVisible();
      await readCanvas(page);
      await page.waitForTimeout(400);

      // 1. One row: the switch, the camera's fit button and (where there is one) Vind.
      const mode = (await page.getByTestId('canvas-mode').boundingBox())!;
      const fit = (await page.getByRole('group', { name: 'Zoomen', exact: true }).getByRole('button', { name: 'Alles in beeld' }).boundingBox())!;
      expect(Math.abs(mid(mode) - mid(fit)), `${kind}: de schakelaar en Alles in beeld op één regel`).toBeLessThan(8);
      const find = page.locator('.canvas-find-toggle').first();
      if (await find.isVisible()) {
        expect(Math.abs(mid((await find.boundingBox())!) - mid(mode)), `${kind}: Vind op dezelfde regel`).toBeLessThan(8);
      }
      for (const name of ['Uitzoomen', 'Inzoomen', 'Alles in beeld']) {
        const box = (await page.getByRole('group', { name: 'Zoomen', exact: true }).getByRole('button', { name }).boundingBox())!;
        expect(Math.round(box.width), `${kind}: ${name} is een duimbreed doel`).toBeGreaterThanOrEqual(44);
      }

      // 2. The head: Verbindingen beside the name, as a 44 px icon.
      const title = (await page.locator('.canvas-head h1').boundingBox())!;
      const connections = (await page.locator('.canvas-head').getByTestId('connections-link').boundingBox())!;
      expect(Math.abs(mid(title) - mid(connections)), `${kind}: Verbindingen naast de naam`).toBeLessThan(12);
      expect(Math.round(connections.width)).toBeGreaterThanOrEqual(44);
      await expect(page.locator('.canvas-head').getByRole('link', { name: 'Verbindingen' })).toBeVisible();

      // The glass: at least 68 % of 390 × 844.
      const viewport = page.viewportSize()!;
      const stage = (await page.locator(STAGE[kind]).boundingBox())!;
      expect(stage.height, `${kind}: het glas is ${Math.round(stage.height)} van ${viewport.height}`).toBeGreaterThan(viewport.height * 0.68);
      const sideways = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(sideways).toBeLessThanOrEqual(1);
    }

    // And 62 % of a Pixel 5 without its browser bar (393 × 727).
    await page.setViewportSize({ width: 393, height: 727 });
    for (const kind of Object.keys(made) as (keyof Made)[]) {
      await page.goto(made[kind]);
      await expect(page.locator(STAGE[kind])).toBeVisible();
      await readCanvas(page);
      await page.waitForTimeout(400);
      const stage = (await page.locator(STAGE[kind]).boundingBox())!;
      expect(stage.height, `${kind}: ${Math.round(stage.height)} van 727`).toBeGreaterThan(727 * 0.62);
    }
  });

  test('de maakknop staat onder de duim in Bewerken, en in Lezen staat er niets', async ({ page }) => {
    test.setTimeout(180_000);
    await signIn(page, ...KEEPER);
    const made = await makeFour(page, Date.now().toString(36));
    const makers: Record<keyof Made, string> = {
      board: 'Nieuwe notitie',
      map: 'Speld zetten',
      timeline: 'Gebeurtenis toevoegen',
      tree: 'Los kaartje',
    };
    for (const kind of Object.keys(made) as (keyof Made)[]) {
      await page.goto(made[kind]);
      await expect(page.locator(STAGE[kind])).toBeVisible();
      await readCanvas(page);
      // Lezen is quiet: no maker, and no grey undo.
      await expect(page.locator('.canvas-make')).toHaveCount(0);
      await expect(page.getByRole('button', { name: 'Ongedaan maken' })).toBeHidden();

      await editCanvas(page);
      // By its class, which is what makes it the `+` on a phone.
      const plus = page.locator('.canvas-make');
      await expect(plus).toBeVisible();
      await expect(plus).toHaveAttribute('aria-label', makers[kind]);
      const viewport = page.viewportSize()!;
      const box = (await plus.boundingBox())!;
      const tabs = (await page.locator('.tabs').boundingBox())!;
      expect(box.width, `${kind}: de + is minstens 44 px`).toBeGreaterThanOrEqual(44);
      expect(box.height).toBeGreaterThanOrEqual(44);
      // Under the thumb: the bottom-right, just above the tab bar.
      expect(box.x + box.width, `${kind}: rechts`).toBeGreaterThan(viewport.width * 0.8);
      expect(box.y + box.height, `${kind}: boven de tabbalk`).toBeLessThanOrEqual(tabs.y);
      expect(box.y, `${kind}: onderaan`).toBeGreaterThan(viewport.height * 0.75);
      // Undo beside it, grey, and a thumb's width.
      const undo = page.getByRole('button', { name: 'Ongedaan maken' });
      await expect(undo).toBeVisible();
      await expect(undo).toBeDisabled();
      const u = (await undo.boundingBox())!;
      expect(u.width).toBeGreaterThanOrEqual(44);
      expect(Math.abs(mid(u) - mid(box))).toBeLessThan(12);
      expect(u.x + u.width).toBeLessThan(box.x);
    }

    // The + makes what the bar's button made: a notitie on the wall, chosen.
    await page.goto(made.board);
    await editCanvas(page);
    await page.getByRole('button', { name: 'Nieuwe notitie', exact: true }).click();
    await expect(page.locator('.board-card')).toHaveCount(1);
  });

  test('de peek laat de tabbalk en de maakknop vrij, groeit aan de greep en gaat met een veeg weg', async ({ page }) => {
    test.setTimeout(120_000);
    await signIn(page, ...KEEPER);
    const made = await makeFour(page, Date.now().toString(36));
    await page.goto(made.map);
    await expect(page.locator('.map-stage')).toBeVisible();
    await editCanvas(page);
    await page.getByRole('button', { name: 'Alles in beeld' }).click();

    const dialog = page.getByRole('dialog', { name: 'Jacob den Hollander' });
    await expect(async () => {
      if (!(await dialog.isVisible().catch(() => false))) await page.locator('.map-pin').first().click();
      await expect(dialog).toBeVisible({ timeout: 1500 });
    }).toPass({ timeout: 15_000 });
    await page.waitForTimeout(400);

    const peek = (await page.locator('.canvas-peek').boundingBox())!;
    const tabs = (await page.locator('.tabs').boundingBox())!;
    expect(peek.y + peek.height, 'de peek staat boven de tabbalk').toBeLessThanOrEqual(tabs.y + 1);
    const plus = (await page.getByRole('button', { name: 'Speld zetten', exact: true }).boundingBox())!;
    expect(plus.y + plus.height, 'de maakknop staat boven de peek').toBeLessThanOrEqual(peek.y);

    // Review 4 (H2): this peek shows everything already, so the grip has
    // nothing to grow into — a tap stays small, and the `+` stays in view.
    // (Review 4, H2.) Whether it can grow depends on what the peek holds: a
    // peek that shows everything stays small under a tap and keeps the `+`;
    // one with more in it grows.
    const handle = page.locator('.canvas-peek-handle');
    const grows = (await page.locator('.canvas-peek').getAttribute('data-groeit')) === 'ja';
    await handle.click();
    await page.waitForTimeout(300);
    if (grows) {
      await expect(page.locator('.canvas-peek')).toHaveAttribute('data-peek', 'full');
      await handle.click();
      await page.waitForTimeout(300);
    }
    await expect(page.locator('.canvas-peek')).toHaveAttribute('data-peek', 'peek');
    await expect(page.getByRole('button', { name: 'Speld zetten', exact: true })).toBeVisible();

    // A swipe down from small: gone, and the glass is whole again.
    const grip = (await handle.boundingBox())!;
    await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2);
    await page.mouse.down();
    await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2 + 140, { steps: 8 });
    await page.mouse.up();
    await expect(page.locator('.canvas-peek')).toHaveCount(0);

    // The cross with a finger: gone after its exit; Escape: gone at once.
    await page.locator('.map-pin').first().click();
    await expect(dialog).toBeVisible();
    await page.locator('.canvas-peek').getByRole('button', { name: 'Sluiten' }).click();
    await expect(page.locator('.canvas-peek')).toHaveCount(0);
  });

  test('het prikbord opent een kaartje in dezelfde peek, en die groeit echt', async ({ page }) => {
    test.setTimeout(120_000);
    await signIn(page, ...KEEPER);
    const bd = await page.request.post('/api/boards', { data: { name: `I1 peekmuur ${Date.now()}` } });
    const { board } = (await bd.json()) as { board: { id: string } };
    await page.goto(`/b/${board.id}`);
    await editCanvas(page);
    // A notitie, made with the `+`, lands chosen: the inspector opens.
    await page.locator('.canvas-make').click();
    await expect(page.locator('.board-card')).toHaveCount(1);
    const peek = page.locator('.canvas-peek.board-peek');
    await expect(peek).toBeVisible();
    await expect(peek.getByRole('group', { name: 'Geselecteerde kaarten' })).toBeVisible();
    // Review 4 (H1): the `+` stands above the peek, not over it.
    const box = (await peek.boundingBox())!;
    const plus = (await page.locator('.canvas-make').boundingBox())!;
    expect(plus.y + plus.height).toBeLessThanOrEqual(box.y + 1);
    // Small shows the first line; there is more, so the grip really grows it.
    await expect(peek).toHaveAttribute('data-groeit', 'ja');
    await peek.locator('.canvas-peek-handle').click();
    await expect(peek).toHaveAttribute('data-peek', 'full');
    await expect(peek.getByRole('button', { name: 'Kaart verwijderen' })).toBeInViewport();
    // Its own way out lets go of the choice.
    await peek.getByRole('button', { name: 'Selectie loslaten' }).click();
    await expect(page.locator('.canvas-peek')).toHaveCount(0);
    await expect(page.locator('.board-card-selected')).toHaveCount(0);
  });

  test('een leeg vlak: één zin, één knop, en de knop doet het', async ({ page }) => {
    test.setTimeout(120_000);
    await signIn(page, ...KEEPER);
    const tr = await page.request.post('/api/family-trees', { data: { name: `I1 lege boom ${Date.now()}` } });
    const { tree } = (await tr.json()) as { tree: { slug: string } };
    await page.goto(`/stambomen/${tree.slug}`);
    await readCanvas(page);
    const empty = page.getByTestId('canvas-leeg');
    await expect(empty).toContainText('Nog niemand in deze stamboom.');
    await expect(empty.locator('.canvas-leeg-beeld')).toHaveCount(1);
    await expect(empty.getByRole('button')).toHaveCount(1);
    // In Lezen the verb puts the tree in Bewerken…
    await empty.getByRole('button', { name: 'Beginnen' }).click();
    await expect(page.getByRole('radio', { name: 'Bewerken', exact: true })).toHaveAttribute('aria-checked', 'true');
    // …and there it takes the caret to the box that puts somebody in.
    await empty.getByRole('button', { name: 'Zoek iemand' }).click();
    await expect(page.locator('#tree-add-person')).toBeFocused();

    const bd = await page.request.post('/api/boards', { data: { name: `I1 lege muur ${Date.now()}` } });
    const { board } = (await bd.json()) as { board: { id: string } };
    await page.goto(`/b/${board.id}`);
    await editCanvas(page);
    const wall = page.getByTestId('canvas-leeg');
    await expect(wall).toContainText('Nog niets geprikt op dit prikbord.');
    await wall.getByRole('button', { name: 'Prik een notitie' }).click();
    await expect(page.locator('.board-card')).toHaveCount(1);
    await expect(page.getByTestId('canvas-leeg')).toHaveCount(0);
  });
});

test('§105 de computer houdt zijn woorden en zijn werkbalk', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'dit gaat over 1440 px');
  test.setTimeout(120_000);
  await signIn(page, ...KEEPER);
  const made = await makeFour(page, Date.now().toString(36));
  await page.goto(made.timeline);
  await editCanvas(page);
  // The words of the switch and the readout stay on a desk.
  await expect(page.getByTestId('canvas-mode').getByText('Bewerken')).toBeVisible();
  await expect(page.getByRole('group', { name: 'Zoomen', exact: true }).locator('.canvas-zoom-level')).toBeVisible();
  // The maker stands in the bar, with its word, not in a corner.
  const add = page.getByTestId('timeline-add');
  await expect(add).toContainText('Gebeurtenis toevoegen');
  expect(await add.evaluate((el) => getComputedStyle(el).position)).not.toBe('fixed');
  const mode = (await page.getByTestId('canvas-mode').boundingBox())!;
  expect(Math.abs(mid((await add.boundingBox())!) - mid(mode))).toBeLessThan(8);
  // The glass keeps the desk's share of the screen (§34: 84 %).
  const stage = (await page.locator('.timeline-stage').boundingBox())!;
  expect(stage.height).toBeGreaterThan(900 * 0.62);
  // An empty timeline on a desk has the same fiche.
  const tl = await page.request.post('/api/timelines', { data: { name: `I1 lege tijdlijn ${Date.now()}`, scale: 'month' } });
  const { timeline } = (await tl.json()) as { timeline: { slug: string } };
  await page.goto(`/timelines/${timeline.slug}`);
  await editCanvas(page);
  const empty = page.getByTestId('canvas-leeg');
  await expect(empty).toContainText('Nog geen gebeurtenissen op deze tijdlijn.');
  await empty.getByRole('button', { name: 'Zet een gebeurtenis' }).click();
  await expect(page.getByRole('dialog', { name: /Gebeurtenis op/ })).toBeVisible();
});
