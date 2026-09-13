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
