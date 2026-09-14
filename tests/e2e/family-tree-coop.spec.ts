import { expect, test, type Browser, type Page } from '@playwright/test';
import { fillWhenReady, signIn } from './helpers';

/**
 * §66 met z'n tweeën — de stamboom die twee mensen tegelijk tekenen.
 *
 * The tijdlijn's coop spec is the shape (`timeline-coop.spec.ts`): everything
 * here is asserted on a **second browser that is never reloaded**, because a
 * reload would pass whether or not any of this works. Three things:
 *
 *  1. Somebody put in the tree on one screen is a card on the other, without a
 *     reload — the canvas watches `family_tree:{id}` and re-pulls the whole
 *     drawing (§60: through the one line the tab already has, never a second).
 *  2. A card carried on one screen travels on the other *while the hand is
 *     still down*, and lands where it was dropped — `window.__tree.positions`
 *     is where a spec reads that, exactly as `nodePoint()` reads the web.
 *  3. And the hand itself is drawn, in the tree's own world coordinates, so it
 *     is over the same card on a screen standing at another zoom.
 *
 * Desktop only: a touch screen has no hovering hand to draw, and dragging wants
 * a pointer (§8's rule, the prikbord's habit).
 */

const KEEPER = ['Keeper', 'abbeytower34'] as const;
const JACOB = 'Jacob den Hollander';

test.beforeEach(({}, info) => {
  test.skip(info.project.name === 'phone', '§66: two hands on one tree want two pointers');
});

/** A stamboom straight through the API: this spec is about two screens, not the shelf. */
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

/** A second browser, signed in as the same Keeper, standing on the same tree. */
async function watcher(browser: Browser, path: string) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  await signIn(page, ...KEEPER);
  await page.goto(path);
  await expect(page.getByTestId('tree-stage')).toBeVisible();
  return { context, page };
}

const cardOf = (page: Page, name: string) =>
  page.locator('[data-testid="tree-node"]').filter({ hasText: name }).first();

async function nodeIdOf(page: Page, name: string): Promise<string | null> {
  return page.evaluate((wanted) => {
    const seam = (window as unknown as { __tree?: { nodes: () => Record<string, unknown>[] } }).__tree;
    const node = seam?.nodes().find((one) => one.name === wanted);
    return node ? String(node.id) : null;
  }, name);
}

async function xOf(page: Page, nodeId: string): Promise<number | null> {
  return page.evaluate((id) => {
    const seam = (window as unknown as {
      __tree?: { positions: Record<string, { x: number }> };
    }).__tree;
    const at = seam?.positions?.[id];
    return at ? at.x : null;
  }, nodeId);
}

/** Somebody from the archive, put in the tree from the toolbar's own box. */
async function addFromToolbar(page: Page, typed: string, name: string) {
  await fillWhenReady(page.locator('#tree-add-person'), typed);
  // §6: the "'…' aanmaken" row is on screen before the suggestions are.
  const option = page
    .locator('.tree-tools .suggest-item')
    .filter({ hasText: name })
    .filter({ hasNotText: 'aanmaken' })
    .first();
  await expect(option).toBeVisible({ timeout: 15_000 });
  await option.click();
}

test('wie erbij komt staat meteen op het andere scherm, en reist mee terwijl een hand hem draagt', async ({
  page,
  browser,
}, info) => {
  test.setTimeout(180_000);
  const stamp = `${info.project.name}-${Date.now().toString(36)}`;

  await signIn(page, ...KEEPER);
  await page.goto('/stambomen');
  const tree = await makeTree(page, `Samen tekenen ${stamp}`);
  await page.goto(`/stambomen/${tree.slug}`);
  await expect(page.getByTestId('tree-stage')).toBeVisible();

  const other = await watcher(browser, `/stambomen/${tree.slug}`);
  await expect(other.page.locator('.tree-empty')).toBeVisible();

  /* 1. A puts somebody in it; B has the card without asking for the page. */
  await addFromToolbar(page, 'Jacob', JACOB);
  await expect(cardOf(page, JACOB)).toBeVisible();
  await expect(cardOf(other.page, JACOB)).toBeVisible({ timeout: 25_000 });
  await expect(page.locator('.save-state')).toHaveText('Opgeslagen', { timeout: 20_000 });

  /* 2. A carries it, and does not let go. */
  const id = (await nodeIdOf(other.page, JACOB))!;
  const before = (await xOf(other.page, id))!;
  const box = (await cardOf(page, JACOB).boundingBox())!;
  await page.mouse.move(box.x + 8, box.y + 8);
  await page.mouse.down();
  await page.mouse.move(box.x + 8 + 35, box.y + 8);
  await page.waitForTimeout(120);
  // A's own screen has it moving, so what is asked of B below is really about
  // the line between them and not about the drag.
  expect((await xOf(page, id))!).toBeGreaterThan(before);

  /*
   * B sees it travel with A's hand still down: a carried card is a pointer
   * frame, not a save.
   *
   * A keeps moving while this is asked, and that is the whole trick — a frame
   * is sight, not state. `reportPointer` posts nothing at all while this tab
   * believes it is alone (§60: nobody to see it, nobody to tell), so a hand
   * that stops the instant the other person arrives sends its last frame to an
   * empty room and then never sends another. The tijdlijn's coop spec keeps
   * its hand moving for the same reason.
   */
  let step = 1;
  await expect
    .poll(
      async () => {
        step = Math.min(step + 1, 8);
        await page.mouse.move(box.x + 8 + step * 35, box.y + 8);
        return (await xOf(other.page, id)) ?? before;
      },
      { timeout: 25_000, intervals: [200, 300, 500, 500, 500] },
    )
    .toBeGreaterThan(before + 60);

  await page.mouse.up();
  // And it lands where it was dropped, on both screens.
  const landed = (await xOf(page, id))!;
  expect(landed).toBeGreaterThan(before + 60);
  await expect
    .poll(async () => Math.abs(((await xOf(other.page, id)) ?? 0) - landed), { timeout: 25_000 })
    .toBeLessThan(2);

  await other.context.close();
});

test('de hand van de ander wordt op de stamboom getekend', async ({ page, browser }, info) => {
  test.setTimeout(180_000);
  const stamp = `${info.project.name}-${Date.now().toString(36)}`;

  await signIn(page, ...KEEPER);
  await page.goto('/stambomen');
  const tree = await makeTree(page, `Twee handen ${stamp}`);
  await page.goto(`/stambomen/${tree.slug}`);
  await expect(page.getByTestId('tree-stage')).toBeVisible();
  await addFromToolbar(page, 'Jacob', JACOB);
  await expect(cardOf(page, JACOB)).toBeVisible();
  await expect(page.locator('.save-state')).toHaveText('Opgeslagen', { timeout: 20_000 });

  const other = await watcher(browser, `/stambomen/${tree.slug}`);
  await expect(cardOf(other.page, JACOB)).toBeVisible({ timeout: 25_000 });

  // B moves a hand over their stage. A frame is sight, not state — a hand that
  // has been still for eight seconds is swept off everybody's screen — so B
  // keeps moving while this is asked.
  const stage = (await other.page.getByTestId('tree-stage').boundingBox())!;
  const hand = page.locator('.tree-hand');
  await expect
    .poll(
      async () => {
        await other.page.mouse.move(
          stage.x + stage.width / 2 + (Date.now() % 11),
          stage.y + stage.height / 2 + (Date.now() % 7),
        );
        return hand.count();
      },
      { timeout: 25_000, intervals: [200, 300, 500, 500, 500] },
    )
    .toBe(1);
  await expect(hand.locator('.board-cursor-name')).toContainText('Keeper');
  // Nobody draws their own hand.
  await expect(other.page.locator('.tree-hand')).toHaveCount(0);

  await other.context.close();
});

/**
 * §67, met z'n tweeën: **wat de ander vasthoudt, en het vak dat hij opentrekt.**
 *
 * The prikbord's two live gestures, on a stamboom (`board-live.spec.ts` is the
 * shape of both). They are different kinds of thing on the wire and that is why
 * they are asserted together:
 *
 *  - a *selection* is a fact about a person, so it rides the **roster**
 *    (`setHolding`) and stays up as long as they hold it — outlines with their
 *    name on, `.tree-held`, exactly like `.board-held`;
 *  - a *box being dragged open* is a gesture in progress, so it rides the
 *    **pointer frame** — which means the hand dragging it has to keep moving
 *    while this is asked (§6: a hand that stops moving stops being heard), and
 *    the other browser must believe it is not alone (§60).
 */
test('wat de ander gekozen heeft, en het kader dat hij opentrekt, staan op jouw glas', async ({
  page,
  browser,
}, info) => {
  test.setTimeout(180_000);
  const stamp = `${info.project.name}-${Date.now().toString(36)}`;
  const CLASINA = 'Sister Clasina';

  await signIn(page, ...KEEPER);
  await page.goto('/stambomen');
  const tree = await makeTree(page, `Samen kiezen ${stamp}`);
  await page.goto(`/stambomen/${tree.slug}`);
  await expect(page.getByTestId('tree-stage')).toBeVisible();
  await addFromToolbar(page, 'Jacob', JACOB);
  await expect(cardOf(page, JACOB)).toBeVisible();
  await addFromToolbar(page, 'Clasina', CLASINA);
  await expect(cardOf(page, CLASINA)).toBeVisible();
  await expect(page.locator('.save-state')).toHaveText('Opgeslagen', { timeout: 20_000 });
  /*
   * Whoever is put in a tree is the chosen card straight away, so this hand is
   * *holding* one — and the whole point below is that the outlines B's screen
   * draws are A's and the ones A's screen draws are B's. Let go first.
   */
  await page.keyboard.press('Escape');

  const other = await watcher(browser, `/stambomen/${tree.slug}`);
  await expect(cardOf(other.page, JACOB)).toBeVisible({ timeout: 25_000 });
  await expect(cardOf(other.page, CLASINA)).toBeVisible({ timeout: 25_000 });
  // A holds nothing, so B's glass has no outline on it.
  await expect(other.page.locator('.tree-held')).toHaveCount(0, { timeout: 25_000 });

  /* 1. B chooses two cards; A sees whose hand is on them. */
  await other.page.getByTestId('tree-fit').click();
  await other.page.waitForTimeout(400);
  await cardOf(other.page, JACOB).click({ position: { x: 6, y: 6 } });
  await cardOf(other.page, CLASINA).click({ position: { x: 6, y: 6 }, modifiers: ['Shift'] });
  const mine = await other.page.evaluate(
    () => (window as unknown as { __tree: { selected: () => string[] } }).__tree.selected(),
  );
  expect(mine).toHaveLength(2);

  const held = page.locator('.tree-held');
  await expect(held).toHaveCount(2, { timeout: 25_000 });
  await expect(held.first().locator('.tree-held-name')).toHaveText('Keeper');
  // And B does not draw their own choice as somebody else's.
  await expect(other.page.locator('.tree-held')).toHaveCount(0);

  /*
   * 2. B sweeps a box open over bare paper. A frame is sight, not state, so B
   * keeps moving while this is asked — a hand that stopped the instant the
   * question was put has sent its last frame already.
   */
  const stage = (await other.page.getByTestId('tree-stage').boundingBox())!;
  const from = { x: stage.x + 14, y: stage.y + stage.height - 20 };
  await other.page.keyboard.down('Shift');
  await other.page.mouse.move(from.x, from.y);
  await other.page.mouse.down();
  await other.page.mouse.move(from.x + 40, from.y - 30, { steps: 4 });

  const theirs = page.locator('.tree-marquee-other');
  let step = 1;
  await expect
    .poll(
      async () => {
        step = Math.min(step + 1, 8);
        await other.page.mouse.move(from.x + step * 40, from.y - step * 30);
        return theirs.count();
      },
      { timeout: 25_000, intervals: [200, 300, 500, 500, 500] },
    )
    .toBe(1);
  await expect(theirs.locator('.tree-marquee-name')).toHaveText('Keeper');
  // Nobody else's box is ever drawn on the glass of the hand dragging it.
  await expect(other.page.locator('.tree-marquee-other')).toHaveCount(0);

  /* And it is gone the moment the hand lets go. */
  await other.page.mouse.up();
  await other.page.keyboard.up('Shift');
  await expect(theirs).toHaveCount(0, { timeout: 20_000 });

  await other.context.close();
});
