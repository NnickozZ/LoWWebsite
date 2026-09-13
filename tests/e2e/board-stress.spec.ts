import { expect, test, type Page } from '@playwright/test';
import { signIn } from './helpers';

/**
 * §61 — een muur die nooit opgeeft.
 *
 * Nick's words for what this round is about: "als iemand super veel punaises
 * aanmaakt dan update het niet meer op een bepaald moment. Het heeft allemaal
 * kuurtjes." Everything below is one of those kuurtjes, reproduced:
 *
 * (a) forty cards made in a burst on a wall that already holds sixty, seen on a
 *     second browser that is never reloaded;
 * (b) a save that hangs for ever — the wall used to say *Opgeslagen* and save
 *     nothing at all, for the life of the tab;
 * (c) a card the archive refuses (§50), which used to be kept and posted again
 *     with every later save, so nothing on that wall was ever saved again;
 * (d) two hands at once: one holding a card, the other moving three, and
 *     nobody's work reverted by the other's next save.
 *
 * Desktop only: every one of them is a pointer gesture, and §8 turns dragging
 * off under 768 px.
 */

const SAVED = 'Opgeslagen';

async function newBoard(page: Page): Promise<{ url: string; id: string }> {
  await page.goto('/boards');
  await page.getByRole('button', { name: 'Openbaar prikbord' }).click();
  await page.waitForURL('**/b/**');
  const url = page.url();
  return { url, id: url.split('/b/')[1].split(/[?#]/)[0] };
}

/** A wall that is already busy, hung through the API rather than by hand. */
async function seedCards(page: Page, boardId: string, count: number) {
  const cards = Array.from({ length: count }, (_, i) => ({
    id: `seed-${i}`,
    kind: 'note',
    name: `Seed ${i}`,
    text: '',
    showImage: false,
    x: 400 + (i % 10) * 180,
    y: 200 + Math.floor(i / 10) * 300,
    rotation: 0,
    scale: 1,
  }));
  const response = await page.request.post(`/api/boards/${boardId}`, {
    data: { clientId: 'seed', cards, viewport: { x: 0, y: 0, zoom: 1 } },
  });
  expect(response.ok()).toBe(true);
}

/** Where a card says it is, in board units — the same number on every screen. */
function leftOf(page: Page, cardId: string) {
  return page
    .locator(`[data-card-id="${cardId}"]`)
    .first()
    .evaluate((node) => parseFloat((node as HTMLElement).style.left));
}

test.describe('a wall under load', () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name === 'phone', 'dragging is desktop only (§8)');
  });

  test('forty cards in a burst reach the other screen, and the move after them', async ({
    page,
    browser,
  }) => {
    test.setTimeout(180_000);
    await signIn(page, 'Keeper', 'abbeytower34');
    const board = await newBoard(page);
    await seedCards(page, board.id, 60);
    await page.reload();
    await expect(page.locator('.board-card')).toHaveCount(60, { timeout: 20_000 });

    const context = await browser.newContext();
    const watcher = await context.newPage();
    await signIn(watcher, 'Keeper', 'abbeytower34');
    await watcher.goto(board.url);
    await expect(watcher.locator('.board-card')).toHaveCount(60, { timeout: 20_000 });

    // Forty punaises as fast as the toolbar will take them.
    const add = page.getByRole('button', { name: 'Nieuwe notitie' });
    for (let i = 0; i < 40; i++) await add.click();
    await expect(page.locator('.board-card')).toHaveCount(100);

    // …and then a card is moved, which is the gesture that used to arrive
    // behind the forty and be swallowed by them. The topmost card, because the
    // burst has laid paper over most of the cork by now.
    const card = page.locator('.board-card').last();
    const movedId = (await card.getAttribute('data-card-id'))!;
    const was = await leftOf(page, movedId);
    const before = (await card.boundingBox())!;
    await page.mouse.move(before.x + 80, before.y + before.height - 40);
    await page.mouse.down();
    await page.mouse.move(before.x + 280, before.y + before.height - 40, { steps: 12 });
    await page.mouse.up();
    await expect(page.locator('.save-state')).toHaveText(SAVED, { timeout: 30_000 });
    const moved = await leftOf(page, movedId);
    expect(moved - was).toBeGreaterThan(120);

    // The second browser has never been reloaded. This is the whole test.
    await expect(watcher.locator('.board-card')).toHaveCount(100, { timeout: 20_000 });
    await expect.poll(() => leftOf(watcher, movedId), { timeout: 20_000 }).toBe(moved);

    await context.close();
  });

  test('a save that hangs for ever does not stop the next one', async ({ page }) => {
    test.setTimeout(180_000);
    await signIn(page, 'Keeper', 'abbeytower34');
    const board = await newBoard(page);
    await page.getByRole('button', { name: 'Nieuwe notitie' }).click();
    await expect(page.locator('.save-state')).toHaveText(SAVED, { timeout: 20_000 });

    let hung = false;
    await page.route(`**/api/boards/${board.id}`, async (route) => {
      if (route.request().method() !== 'POST' || hung) return route.continue();
      hung = true;
      // Never answered, then dropped — the client's own ten seconds is what
      // has to save this, not the server and not the person.
      await new Promise((resolve) => setTimeout(resolve, 12_000));
      await route.abort().catch(() => {});
    });

    await page.getByRole('button', { name: 'Nieuwe notitie' }).click();
    await expect.poll(() => hung, { timeout: 20_000 }).toBe(true);

    // The edit after the hung one. Before §61 this — and everything after it,
    // for the life of the tab — set `again` and returned.
    await page.getByRole('button', { name: 'Nieuwe notitie' }).click();
    await expect(page.locator('.board-card')).toHaveCount(3);
    await expect(page.locator('.save-state')).toHaveText(SAVED, { timeout: 60_000 });

    // And it really landed: a reload shows all three.
    await page.unroute(`**/api/boards/${board.id}`);
    await page.reload();
    await expect(page.locator('.board-card')).toHaveCount(3, { timeout: 20_000 });
  });

  test('a card the archive refuses comes off the wall and the rest still saves', async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await signIn(page, 'Keeper', 'abbeytower34');
    const board = await newBoard(page);
    await page.getByRole('button', { name: 'Nieuwe notitie' }).click();
    await expect(page.locator('.save-state')).toHaveText(SAVED, { timeout: 20_000 });

    let refusedId: string | null = null;
    let sentCards = -1;
    await page.route(`**/api/boards/${board.id}`, async (route) => {
      if (route.request().method() !== 'POST' || refusedId) return route.continue();
      const patch = JSON.parse(route.request().postData() ?? '{}') as {
        cards?: { id: string }[];
      };
      if (!patch.cards?.length) return route.continue();
      sentCards = patch.cards.length;
      refusedId = patch.cards[0].id;
      await route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({
          error: 'Dat staat aan de andere kant van het archief.',
          code: 'OTHER_SIDE',
          cardIds: [refusedId],
        }),
      });
    });

    await page.getByRole('button', { name: 'Nieuwe notitie' }).click();
    // §61: the save carried the one card this hand made, not the whole wall.
    await expect.poll(() => sentCards, { timeout: 20_000 }).toBe(1);
    // The archive's own sentence, not one the browser invented.
    await expect(page.locator('.toast')).toContainText(
      'Dat staat aan de andere kant van het archief.',
      { timeout: 20_000 },
    );
    // The card is off the wall, and the wall saves again.
    await expect(page.locator('.board-card')).toHaveCount(1, { timeout: 20_000 });
    await expect(page.locator('.save-state')).toHaveText(SAVED, { timeout: 30_000 });

    // And the next card is perfectly welcome.
    await page.getByRole('button', { name: 'Nieuwe notitie' }).click();
    await expect(page.locator('.board-card')).toHaveCount(2);
    await expect(page.locator('.save-state')).toHaveText(SAVED, { timeout: 30_000 });
    await page.reload();
    await expect(page.locator('.board-card')).toHaveCount(2, { timeout: 20_000 });
  });

  test('one hand holding a card does not revert the three the other hand moved', async ({
    page,
    browser,
  }) => {
    test.setTimeout(180_000);
    await signIn(page, 'Keeper', 'abbeytower34');
    const board = await newBoard(page);
    await seedCards(page, board.id, 6);
    await page.reload();
    await expect(page.locator('.board-card')).toHaveCount(6, { timeout: 20_000 });

    const context = await browser.newContext();
    const other = await context.newPage();
    await signIn(other, 'Keeper', 'abbeytower34');
    await other.goto(board.url);
    await expect(other.locator('.board-card')).toHaveCount(6, { timeout: 20_000 });

    // A takes hold of one card and does not let go.
    const held = page.locator('[data-card-id="seed-0"]').first();
    const grip = (await held.boundingBox())!;
    await page.mouse.move(grip.x + 80, grip.y + 200);
    await page.mouse.down();
    await page.mouse.move(grip.x + 100, grip.y + 220, { steps: 6 });

    // B moves three others while A's hand is still down — which is exactly when
    // A's client defers every merge, and used to post a document from before
    // all three of these.
    const movedTo: Record<string, number> = {};
    for (const id of ['seed-1', 'seed-2', 'seed-3']) {
      const card = other.locator(`[data-card-id="${id}"]`).first();
      const box = (await card.boundingBox())!;
      await other.mouse.move(box.x + 80, box.y + 200);
      await other.mouse.down();
      await other.mouse.move(box.x + 80, box.y + 320, { steps: 10 });
      await other.mouse.up();
      await expect(other.locator('.save-state')).toHaveText(SAVED, { timeout: 20_000 });
      movedTo[id] = await leftOf(other, id);
    }
    const downTo = Object.fromEntries(
      await Promise.all(
        ['seed-1', 'seed-2', 'seed-3'].map(async (id) => [
          id,
          await other
            .locator(`[data-card-id="${id}"]`)
            .first()
            .evaluate((node) => parseFloat((node as HTMLElement).style.top)),
        ]),
      ),
    ) as Record<string, number>;

    // A drops.
    await page.mouse.up();
    await expect(page.locator('.save-state')).toHaveText(SAVED, { timeout: 30_000 });

    for (const id of ['seed-1', 'seed-2', 'seed-3']) {
      // Where B put them, on B's screen…
      expect(await leftOf(other, id)).toBe(movedTo[id]);
      // …and on A's, which never touched them.
      await expect
        .poll(
          () =>
            page
              .locator(`[data-card-id="${id}"]`)
              .first()
              .evaluate((node) => parseFloat((node as HTMLElement).style.top)),
          { timeout: 20_000 },
        )
        .toBe(downTo[id]);
    }

    // And A's own card kept the place A's hand left it in.
    const mine = await leftOf(page, 'seed-0');
    await expect.poll(() => leftOf(other, 'seed-0'), { timeout: 20_000 }).toBe(mine);

    await context.close();
  });
});
