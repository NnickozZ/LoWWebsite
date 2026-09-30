import { expect, test, type Browser, type Page } from '@playwright/test';
import { fillWhenReady, newBoard as makeBoardOnShelf, signIn } from './helpers';

/**
 * Golf M (samen): met z'n tweeën op een vlak.
 *
 *  1. Wat een ander sleept, glijdt: op het andere scherm schuift het kaartje
 *     elk beeld een stukje verder, nooit terug, en niet in trappen van één
 *     frame van de lijn (`useFollow`, `lib/canvas/follow.ts`).
 *  2. Wat een ander sleept, pak je niet (het zachte slot, `lib/live/hands.ts`):
 *     een druk zegt "Keeper heeft dit vast" en doet verder niets; het slot
 *     blijft zolang de hand vasthoudt — ook stil — en gaat open als ze loslaat.
 *  3. Wat een ander weghaalt, laat los en komt niet terug — ook niet met
 *     Ctrl+Z van een oudere stap, op het prikbord en op de stamboom.
 *  4. De tijdlijn kent hetzelfde slot.
 *
 * Alles op een tweede browser die nooit herladen wordt: een herlading zou
 * slagen of dit nu werkt of niet. Op een bureau: twee handen tegelijk willen
 * twee aanwijzers.
 */

const KEEPER = ['Keeper', 'abbeytower34'] as const;

test.beforeEach(({}, info) => {
  test.skip(info.project.name === 'phone', 'Golf M (samen): twee handen tegelijk willen twee aanwijzers');
});

async function newBoard(page: Page): Promise<string> {
  await page.goto('/boards');
  await makeBoardOnShelf(page);
  await page.waitForURL('**/b/**');
  return page.url();
}

async function addNote(page: Page, name: string) {
  await page.getByLabel('Kaart toevoegen').fill(name);
  await page.locator('.suggest-item').last().click();
  await expect(page.locator('.board-card', { hasText: name })).toBeVisible();
}

/** A second browser, signed in as the same Keeper (a second hand), standing on the same page. */
async function second(browser: Browser, url: string) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  await signIn(page, ...KEEPER);
  await page.goto(url);
  return { context, page };
}

/** Both lines up: each sees the other on the strip, so frames have somebody to go to. */
async function bothHere(a: Page, b: Page) {
  await expect(a.locator('.board-person')).toHaveCount(1, { timeout: 15_000 });
  await expect(b.locator('.board-person')).toHaveCount(1, { timeout: 15_000 });
}

const toast = (page: Page, text: string | RegExp) => page.locator('.toast-wrap').getByText(text);

test('wat een ander sleept, glijdt — elk beeld een stukje, nooit terug', async ({ page, browser }) => {
  /*
   * A property of the production build: under `E2E_DEV` a POST takes a quarter
   * of a second to answer, so frames arrive a few times a second and there is
   * nothing left to measure the glide between. The hook's own Strict Mode
   * behaviour (effects mounted twice) is exercised by every other case here.
   */
  test.skip(Boolean(process.env.E2E_DEV), 'een productiemaat: de dev-server beantwoordt een frame in 250 ms');
  test.setTimeout(120_000);
  await signIn(page, ...KEEPER);
  const url = await newBoard(page);
  await addNote(page, 'Glijdend kaartje');
  await page.waitForTimeout(1500);

  const other = await second(browser, url);
  await expect(other.page.locator('.board-card', { hasText: 'Glijdend kaartje' })).toBeVisible({ timeout: 15_000 });
  await bothHere(page, other.page);

  const card = page.locator('.board-card', { hasText: 'Glijdend kaartje' }).first();
  const id = (await card.getAttribute('data-card-id'))!;
  const box = (await card.boundingBox())!;

  // B watches the card, one sample per animation frame, for as long as A drags.
  const sampling = other.page.evaluate(async (cardId) => {
    const el = document.querySelector(`.board-card[data-card-id="${cardId}"]`) as HTMLElement;
    const xs: number[] = [];
    const start = performance.now();
    await new Promise<void>((resolve) => {
      const tick = () => {
        xs.push(el.getBoundingClientRect().x);
        if (performance.now() - start < 4000) requestAnimationFrame(tick);
        else resolve();
      };
      requestAnimationFrame(tick);
    });
    return xs;
  }, id);

  /*
   * What the faster carry rate costs (`POINTER_CARRY_THROTTLE_MS`): the
   * frames A posts while it drags, and how long the server takes over each.
   * Measured rather than guessed, and kept loose — this is a budget, not a
   * benchmark: no more than about twenty-five a second.
   */
  await page.evaluate(() => {
    const w = window as unknown as { __posted: { at: number; took: number }[]; fetch: typeof fetch };
    const original = w.fetch.bind(window);
    w.__posted = [];
    w.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const t0 = performance.now();
      const response = await original(input, init);
      if (String(input).includes('/api/live/site') && init?.method === 'POST' && String(init.body ?? '').includes('"cursor"')) {
        w.__posted.push({ at: t0, took: performance.now() - t0 });
      }
      return response;
    }) as typeof fetch;
  });

  /*
   * A drags it steadily to the right, the way a real mouse reports: a move
   * every 8 ms (Playwright's own `mouse.move` is a round trip each, far slower
   * than a hand). The press and the first millimetres are real, so the drag
   * starts the way any drag does; the rest is the same event, dispatched in
   * the page at a mouse's rate.
   */
  await page.mouse.move(box.x + box.width / 2, box.y + 20);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 12, box.y + 20, { steps: 3 });
  const dragStart = await page.evaluate(() => performance.now());
  await page.evaluate(
    async ([x, y]) => {
      const target = document.querySelector('.board-viewport')!;
      const start = performance.now();
      await new Promise<void>((resolve) => {
        const tick = () => {
          const t = performance.now() - start;
          target.dispatchEvent(
            new PointerEvent('pointermove', { bubbles: true, clientX: x + t * 0.2, clientY: y, pointerId: 1, pointerType: 'mouse', buttons: 1 }),
          );
          if (t < 1500) setTimeout(tick, 8);
          else resolve();
        };
        tick();
      });
    },
    [box.x + box.width / 2 + 12, box.y + 20] as const,
  );
  const dragEnd = await page.evaluate(() => performance.now());
  const dragMs = dragEnd - dragStart;
  const xs = await sampling;
  await page.mouse.up();
  const posted = await page.evaluate(() => (window as unknown as { __posted: { at: number; took: number }[] }).__posted);
  const during = posted.filter((one) => one.at >= dragStart && one.at <= dragEnd);
  const perSecond = (during.length * 1000) / dragMs;
  const took = during.map((one) => one.took).sort((a, b) => a - b);
  test.info().annotations.push({
    type: 'meting',
    description: `${during.length} frames in ${Math.round(dragMs)} ms (${perSecond.toFixed(1)}/s), mediaan ${took[Math.floor(took.length / 2)]?.toFixed(1)} ms per POST`,
  });
  console.log(`golf-m-samen meting: ${test.info().annotations.at(-1)?.description}`);
  expect(during.length).toBeGreaterThan(5);
  expect(perSecond).toBeLessThan(26);

  const x0 = xs[0];
  const end = Math.max(...xs);
  expect(end - x0).toBeGreaterThan(150);
  const first = xs.findIndex((x) => x > x0 + 1);
  const last = xs.findIndex((x) => x > end - 1);
  const moving = xs.slice(first, last + 1);
  const steps = moving.slice(1).map((x, i) => x - moving[i]);
  // Nooit terug.
  for (const step of steps) expect(step).toBeGreaterThan(-0.5);
  // Veel meer tussenstanden dan er frames van de lijn kwamen (om de 50 ms): het glijdt ertussen.
  const duration = moving.length * (1000 / 60);
  const distinct = new Set(moving.map((x) => Math.round(x * 4))).size;
  expect(distinct).toBeGreaterThan((duration / 50) * 1.2);
  // Zonder volger stond het twee van de drie beelden stil tussen twee frames; nu bijna nooit.
  const still = steps.filter((step) => Math.abs(step) < 0.05).length;
  expect(still / steps.length).toBeLessThan(0.35);
  // En geen trap: geen enkel beeld doet het werk van een heel frame van de lijn in één keer.
  expect(Math.max(...steps)).toBeLessThan((end - x0) * 0.2);

  await other.context.close();
});

test('wat een ander vasthoudt, pak je niet — en na het loslaten wel', async ({ page, browser }) => {
  test.setTimeout(150_000);
  await signIn(page, ...KEEPER);
  const url = await newBoard(page);
  await addNote(page, 'Vastgehouden kaartje');
  await page.waitForTimeout(1500);

  const other = await second(browser, url);
  const theirs = other.page.locator('.board-card', { hasText: 'Vastgehouden kaartje' }).first();
  await expect(theirs).toBeVisible({ timeout: 15_000 });
  await bothHere(page, other.page);

  // A picks the card up and holds it, a little to the right — and then lies still.
  const mine = page.locator('.board-card', { hasText: 'Vastgehouden kaartje' }).first();
  const box = (await mine.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + 20);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 120, box.y + 20, { steps: 10 });

  // B sees A's ring on it, thicker than a choice: the lock, with A's name.
  const lock = other.page.locator('.board-held.is-locked');
  await expect(lock).toHaveCount(1, { timeout: 15_000 });
  await expect(lock).toHaveAttribute('data-held-by', 'Keeper');

  // A holds still for longer than a silent hand is trusted: the lock stays, because a holding hand says so.
  await page.waitForTimeout(4500);
  await expect(lock).toHaveCount(1);

  // B tries to take it: the card does not follow B's hand, and B is told who has it.
  const held = (await theirs.boundingBox())!;
  await other.page.mouse.move(held.x + held.width / 2, held.y + 20);
  await other.page.mouse.down();
  await other.page.mouse.move(held.x + held.width / 2, held.y + 20 + 150, { steps: 10 });
  await other.page.mouse.up();
  await expect(toast(other.page, 'Keeper heeft dit vast')).toBeVisible({ timeout: 5000 });
  const after = (await theirs.boundingBox())!;
  expect(Math.abs(after.y - held.y)).toBeLessThan(10);
  // Nor is it chosen on B's side (a chosen card could be taken away with Delete).
  await expect(other.page.locator('.board-card-selected')).toHaveCount(0);

  // A lets go: the lock opens at once, without A's mouse moving again.
  await page.mouse.up();
  await expect(lock).toHaveCount(0, { timeout: 5000 });

  // …and the card landed where A put it, on B's screen too, without a jump back.
  await expect(page.locator('.save-state')).toHaveText('Opgeslagen', { timeout: 15_000 });
  await other.page.waitForTimeout(800);
  const landed = (await theirs.boundingBox())!;
  expect(Math.abs(landed.x - held.x)).toBeLessThan(12);

  // Now B may drag it — and A sees B's lock.
  await other.page.mouse.move(landed.x + landed.width / 2, landed.y + 20);
  await other.page.mouse.down();
  await other.page.mouse.move(landed.x + landed.width / 2, landed.y + 20 + 120, { steps: 10 });
  await expect.poll(async () => (await theirs.boundingBox())!.y - landed.y, { timeout: 5000 }).toBeGreaterThan(80);
  await expect(page.locator('.board-held.is-locked')).toHaveCount(1, { timeout: 15_000 });
  await other.page.mouse.up();
  await expect(page.locator('.board-held.is-locked')).toHaveCount(0, { timeout: 5000 });

  await other.context.close();
});

test('een hand die wegvalt terwijl ze vasthoudt, laat los', async ({ page, browser }) => {
  test.setTimeout(120_000);
  await signIn(page, ...KEEPER);
  const url = await newBoard(page);
  await addNote(page, 'Verweesd kaartje');
  await page.waitForTimeout(1500);

  const other = await second(browser, url);
  await expect(other.page.locator('.board-card', { hasText: 'Verweesd kaartje' })).toBeVisible({ timeout: 15_000 });
  await bothHere(page, other.page);

  const theirs = other.page.locator('.board-card', { hasText: 'Verweesd kaartje' }).first();
  const box = (await theirs.boundingBox())!;
  await other.page.mouse.move(box.x + box.width / 2, box.y + 20);
  await other.page.mouse.down();
  await other.page.mouse.move(box.x + box.width / 2 + 100, box.y + 20, { steps: 8 });
  await expect(page.locator('.board-held.is-locked')).toHaveCount(1, { timeout: 15_000 });

  // B's browser goes away mid-drag. A's wall does not stay shut.
  await other.context.close();
  await expect(page.locator('.board-held.is-locked')).toHaveCount(0, { timeout: 15_000 });
  const mine = page.locator('.board-card', { hasText: 'Verweesd kaartje' }).first();
  const at = (await mine.boundingBox())!;
  await page.mouse.move(at.x + at.width / 2, at.y + 20);
  await page.mouse.down();
  await page.mouse.move(at.x + at.width / 2, at.y + 20 + 100, { steps: 8 });
  await expect.poll(async () => (await mine.boundingBox())!.y - at.y, { timeout: 5000 }).toBeGreaterThan(60);
  await page.mouse.up();
});

test('wat een ander weghaalt terwijl het hier gekozen is, laat los — en Ctrl+Z haalt het niet terug', async ({
  page,
  browser,
}) => {
  test.setTimeout(150_000);
  await signIn(page, ...KEEPER);
  const url = await newBoard(page);
  await addNote(page, 'Blijvertje');
  await addNote(page, 'Weg ermee');
  await page.waitForTimeout(1500);

  const other = await second(browser, url);
  const theirs = other.page.locator('.board-card', { hasText: 'Weg ermee' }).first();
  await expect(theirs).toBeVisible({ timeout: 15_000 });
  await bothHere(page, other.page);

  // B moves the card a little (a step on B's undo stack) and keeps it chosen, inspector open.
  const box = (await theirs.boundingBox())!;
  await other.page.mouse.move(box.x + box.width / 2, box.y + 20);
  await other.page.mouse.down();
  await other.page.mouse.move(box.x + box.width / 2 + 80, box.y + 20 + 40, { steps: 8 });
  await other.page.mouse.up();
  await expect(other.page.locator('.save-state')).toHaveText('Opgeslagen', { timeout: 15_000 });
  await expect(other.page.locator('.board-card-selected')).toHaveCount(1);
  await expect(other.page.locator('.board-inspector')).toBeVisible();

  // A takes it off the wall.
  await expect(page.locator('.board-held.is-locked')).toHaveCount(0, { timeout: 10_000 });
  await page.locator('.board-card', { hasText: 'Weg ermee' }).first().click();
  await page.keyboard.press('Delete');
  await expect(page.locator('.board-card')).toHaveCount(1);

  // B: the card goes, the choice and the inspector with it, and a line says why.
  await expect(theirs).toHaveCount(0, { timeout: 15_000 });
  await expect(toast(other.page, 'Weg ermee is net door iemand anders weggehaald.')).toBeVisible({ timeout: 5000 });
  await expect(other.page.locator('.board-card-selected')).toHaveCount(0);
  await expect(other.page.locator('.board-inspector')).toHaveCount(0);

  // B's Ctrl+Z walks back B's own move — and must not hand A's deletion back.
  await other.page.locator('.board-viewport').click({ position: { x: 14, y: 14 } });
  await other.page.keyboard.press('Control+z');
  await other.page.waitForTimeout(3000);
  await expect(other.page.locator('.board-card', { hasText: 'Weg ermee' })).toHaveCount(0);
  await expect(page.locator('.board-card', { hasText: 'Weg ermee' })).toHaveCount(0);

  await page.goto(url);
  await expect(page.locator('.board-card', { hasText: 'Blijvertje' })).toBeVisible();
  await expect(page.locator('.board-card', { hasText: 'Weg ermee' })).toHaveCount(0);

  await other.context.close();
});

/* --------------------------------------------------------------- de tijdlijn */

const MARCH_12 = Math.floor(Date.UTC(1931, 2, 12) / 1000);

async function makeTimeline(page: Page, name: string): Promise<{ id: string; slug: string }> {
  return page.evaluate(async (timelineName) => {
    const response = await fetch('/api/timelines', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: timelineName, scale: 'day' }),
    });
    const data = (await response.json()) as { timeline: { id: string; slug: string } };
    return { id: data.timeline.id, slug: data.timeline.slug };
  }, name);
}

async function makeNote(page: Page, timelineId: string, name: string, at: number): Promise<string> {
  return page.evaluate(
    async ([id, eventName, moment]) => {
      const response = await fetch(`/api/timelines/${id}/events`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ kind: 'note', name: eventName, at: Number(moment), precision: 'day', text: '' }),
      });
      const data = (await response.json()) as { event: { id: string } };
      return data.event.id;
    },
    [timelineId, name, String(at)] as const,
  );
}

test('op de tijdlijn: een tag in de hand van een ander draagt zijn ring en gaat niet mee', async ({ page, browser }, info) => {
  test.setTimeout(150_000);
  const stamp = `${info.project.name}-${Date.now().toString(36)}`;
  await signIn(page, ...KEEPER);
  await page.goto('/timelines');
  const line = await makeTimeline(page, `Samen vast ${stamp}`);
  const noteId = await makeNote(page, line.id, `De tag ${stamp}`, MARCH_12);
  await page.goto(`/timelines/${line.slug}`);
  const tag = (p: Page) => p.locator(`.timeline-event[data-event-id="${noteId}"] .timeline-tag`);
  const event = (p: Page) => p.locator(`.timeline-event[data-event-id="${noteId}"]`);
  await expect(tag(page)).toBeVisible();

  const other = await second(browser, `/timelines/${line.slug}`);
  await expect(tag(other.page)).toBeVisible({ timeout: 15_000 });

  // A picks the tag up and keeps carrying it (a frame goes nowhere until B is on the roster).
  const box = (await tag(page).boundingBox())!;
  const y = box.y + box.height / 2;
  await page.mouse.move(box.x + box.width / 2, y);
  await page.mouse.down();
  let step = 1;
  await expect
    .poll(
      async () => {
        step = Math.min(step + 1, 6);
        await page.mouse.move(box.x + box.width / 2 + step * 25, y);
        return event(other.page).getAttribute('class');
      },
      { timeout: 20_000, intervals: [200, 300, 500] },
    )
    .toMatch(/is-locked/);
  await expect(event(other.page)).toHaveAttribute('data-held-by', 'Keeper');
  await expect(event(other.page).locator('.timeline-held-name')).toHaveText('Keeper');

  // B presses it and pulls: the tag stays in A's hand, and B is told.
  const held = (await event(other.page).boundingBox())!;
  const theirTag = (await tag(other.page).boundingBox())!;
  await other.page.mouse.move(theirTag.x + theirTag.width / 2, theirTag.y + theirTag.height / 2);
  await other.page.mouse.down();
  await other.page.mouse.move(theirTag.x + theirTag.width / 2 - 200, theirTag.y + theirTag.height / 2, { steps: 8 });
  await other.page.mouse.up();
  await expect(toast(other.page, 'Keeper heeft dit vast')).toBeVisible({ timeout: 5000 });
  // The axis may have panned under B's hand (a locked press pans, like Lezen); the tag itself did not come along.
  await expect(other.page.locator('.timeline-event-dragging')).toHaveCount(0);

  // A lets go; the ring goes with the lock, without A's hand moving.
  await page.mouse.up();
  await expect(event(other.page)).not.toHaveClass(/is-locked/, { timeout: 5000 });
  expect(held.width).toBeGreaterThanOrEqual(0);

  await other.context.close();
});

/* --------------------------------------------------------------- de stamboom */

async function makeTree(page: Page, name: string): Promise<{ id: string; slug: string }> {
  return page.evaluate(async (treeName) => {
    const response = await fetch('/api/family-trees', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: treeName }),
    });
    const data = (await response.json()) as { tree: { id: string; slug: string } };
    return { id: data.tree.id, slug: data.tree.slug };
  }, name);
}

const JACOB = 'Jacob den Hollander';

test('op de stamboom: wie een ander eruit haalde, komt met Ctrl+Z van een oudere stap niet terug', async ({
  page,
  browser,
}, info) => {
  test.setTimeout(180_000);
  const stamp = `${info.project.name}-${Date.now().toString(36)}`;
  await signIn(page, ...KEEPER);
  await page.goto('/stambomen');
  const tree = await makeTree(page, `Samen eruit ${stamp}`);
  await page.goto(`/stambomen/${tree.slug}`);
  await expect(page.getByTestId('tree-stage')).toBeVisible();
  await fillWhenReady(page.locator('#tree-add-person'), 'Jacob');
  const option = page
    .locator('.tree-tools .suggest-item')
    .filter({ hasText: JACOB })
    .filter({ hasNotText: 'aanmaken' })
    .first();
  await expect(option).toBeVisible({ timeout: 15_000 });
  await option.click();
  const cardOf = (p: Page) => p.locator('[data-testid="tree-node"]').filter({ hasText: JACOB }).first();
  await expect(cardOf(page)).toBeVisible();
  await expect(page.locator('.save-state')).toHaveText('Opgeslagen', { timeout: 20_000 });

  const other = await second(browser, `/stambomen/${tree.slug}`);
  await expect(cardOf(other.page)).toBeVisible({ timeout: 25_000 });

  // B moves Jacob a little: a step on B's undo stack.
  const box = (await cardOf(other.page).boundingBox())!;
  await other.page.mouse.move(box.x + 8, box.y + 8);
  await other.page.mouse.down();
  await other.page.mouse.move(box.x + 8 + 90, box.y + 8, { steps: 8 });
  await other.page.mouse.up();
  await expect(other.page.locator('.save-state')).toHaveText('Opgeslagen', { timeout: 20_000 });

  // A takes Jacob out of the tree.
  await expect(page.locator('.tree-held.is-locked')).toHaveCount(0, { timeout: 10_000 });
  await cardOf(page).click({ position: { x: 6, y: 6 } });
  await page.keyboard.press('Delete');
  await expect(cardOf(page)).toHaveCount(0, { timeout: 10_000 });

  // B: gone, chosen no more, and told.
  await expect(cardOf(other.page)).toHaveCount(0, { timeout: 25_000 });
  await expect(toast(other.page, `${JACOB} is net door iemand anders weggehaald.`)).toBeVisible({ timeout: 5000 });

  // B's Ctrl+Z of the older move does not put Jacob back — on either screen, or in the archive.
  await other.page.getByTestId('tree-stage').focus();
  await other.page.keyboard.press('Control+z');
  await other.page.waitForTimeout(3000);
  await expect(cardOf(other.page)).toHaveCount(0);
  await expect(cardOf(page)).toHaveCount(0);
  await page.goto(`/stambomen/${tree.slug}`);
  await expect(page.getByTestId('tree-stage')).toBeVisible();
  await page.waitForTimeout(1000);
  await expect(cardOf(page)).toHaveCount(0);

  await other.context.close();
});
