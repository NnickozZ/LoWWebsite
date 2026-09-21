import { expect, test, type CDPSession, type Page } from '@playwright/test';
import { newBoard, signIn } from './helpers';

/**
 * §72, round 37: twee vingers, één knijp, en geen sprong.
 *
 * Nick: *"Zooming in and out with the pinching gesture sometimes teleports the
 * camera somewhere else."* On the prikbord it was every knijp whose first
 * finger moved before the browser's `touchmove` arrived: the second finger
 * restarted the pan from its own spot and the wall jumped by the distance
 * between the fingers. This spec does exactly what a hand does — one finger
 * down, a tiny wobble, the second finger down, both moving apart — through the
 * browser's real touch pipeline (CDP), and holds the rule that makes a knijp
 * feel right: **the point of the drawing that was between the fingers stays
 * between the fingers.**
 *
 * Phone project only: a desk has no fingers.
 */

const KEEPER = ['Keeper', 'abbeytower34'] as const;

type Pt = { x: number; y: number };

async function touch(cdp: CDPSession, type: 'touchStart' | 'touchMove' | 'touchEnd', points: (Pt & { id: number })[]) {
  await cdp.send('Input.dispatchTouchEvent', {
    type,
    touchPoints: points.map((p) => ({ x: Math.round(p.x), y: Math.round(p.y), id: p.id, radiusX: 4, radiusY: 4, force: 1 })),
  });
}

/** Where the world's origin is drawn and how big, read off the transformed layer. */
async function camera(page: Page, selector: string) {
  return page.locator(selector).first().evaluate((node) => {
    const rect = node.getBoundingClientRect();
    const matrix = new DOMMatrix(getComputedStyle(node).transform);
    return { x: rect.left, y: rect.top, zoom: matrix.a };
  });
}

const toWorld = (c: { x: number; y: number; zoom: number }, p: Pt) => ({ x: (p.x - c.x) / c.zoom, y: (p.y - c.y) / c.zoom });

test.beforeEach(({}, info) => {
  test.skip(info.project.name !== 'phone', 'a knijp needs fingers');
});

test('§72: een knijp op het prikbord springt niet, en houdt vast wat tussen de vingers lag', async ({ page }) => {
  await signIn(page, ...KEEPER);
  await page.goto('/boards');
  await newBoard(page);
  await page.getByRole('button', { name: 'Nieuwe notitie', exact: true }).click();
  await expect(page.locator('.board-card')).toHaveCount(1);

  const stage = (await page.locator('.board-viewport').boundingBox())!;
  // Let go of the new notitie, so the inspector is not docked over the cork.
  // §90 (C3): a new notitie lands chosen *and* with the caret in its text, and
  // Escape peels one layer at a time — the first leaves the text, the second
  // lets go of the card.
  await expect(async () => {
    await page.keyboard.press('Escape');
    await expect(page.locator('.board-inspector')).toHaveCount(0, { timeout: 1000 });
  }).toPass({ timeout: 10_000 });
  // A row of bare cork, well inside the glass: both fingers must land on the
  // wall itself — a finger on the notitie or on something docked over the
  // glass is not a finger on the wall.
  const y = await page.evaluate(
    ({ top, height, left, width }) => {
      for (let y = top + 50; y < top + height - 50; y += 20) {
        const bare = [0.3, 0.5, 0.7].every((f) => {
          const el = document.elementFromPoint(left + width * f, y) as HTMLElement | null;
          return el?.closest('.board-viewport') && !el.closest('.board-card, .board-inspector, .ink-toolbar, button');
        });
        if (bare) return y;
      }
      return top + 60;
    },
    { top: stage.y, height: stage.height, left: stage.x, width: stage.width },
  );
  const a = { id: 1, x: stage.x + stage.width * 0.35, y };
  const b = { id: 2, x: stage.x + stage.width * 0.65, y };

  const cdp = await page.context().newCDPSession(page);
  const before = await camera(page, '.board-world');
  const mid0 = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  const anchor = toWorld(before, mid0);

  // The hand that used to jump the wall: one finger lands and wobbles first.
  await touch(cdp, 'touchStart', [a]);
  await touch(cdp, 'touchMove', [{ ...a, x: a.x + 2 }]);
  await touch(cdp, 'touchStart', [{ ...a, x: a.x + 2 }, b]);
  // A first, barely-there move of the first finger — the frame the bug lived in.
  await touch(cdp, 'touchMove', [{ ...a, x: a.x + 1 }, b]);
  const early = await camera(page, '.board-world');
  expect(Math.abs(early.x - before.x), 'no jump when the second finger lands').toBeLessThan(12);
  expect(Math.abs(early.y - before.y)).toBeLessThan(12);

  // Now spread them, symmetrically, in steps.
  for (let i = 1; i <= 10; i++) {
    await touch(cdp, 'touchMove', [
      { ...a, x: a.x - i * 6 },
      { ...b, x: b.x + i * 6 },
    ]);
  }
  const spread = await camera(page, '.board-world');
  expect(spread.zoom, 'spreading the fingers zooms in').toBeGreaterThan(before.zoom * 1.2);
  const held = toWorld(spread, mid0);
  expect(Math.abs(held.x - anchor.x) * spread.zoom, 'the world point between the fingers stays there').toBeLessThan(6);
  expect(Math.abs(held.y - anchor.y) * spread.zoom).toBeLessThan(6);

  // One finger up: the other one stays still — no fling, no pan from a stale start.
  // (CDP: a touchEnd lists the finger that leaves.)
  await touch(cdp, 'touchEnd', [{ ...b, x: b.x + 60 }]);
  await touch(cdp, 'touchMove', [{ ...a, x: a.x - 60 }]);
  await touch(cdp, 'touchMove', [{ ...a, x: a.x - 20 }]);
  const after = await camera(page, '.board-world');
  expect(Math.abs(after.x - spread.x)).toBeLessThan(2);
  await touch(cdp, 'touchEnd', []);

  // And the next single finger is a pan, not a knijp against a ghost.
  const c = { id: 3, x: stage.x + stage.width / 2, y };
  await touch(cdp, 'touchStart', [c]);
  for (let i = 1; i <= 5; i++) await touch(cdp, 'touchMove', [{ ...c, x: c.x + i * 8 }]);
  await touch(cdp, 'touchEnd', []);
  const panned = await camera(page, '.board-world');
  expect(panned.zoom, 'one finger does not zoom').toBeCloseTo(after.zoom, 3);
  expect(panned.x - after.x).toBeGreaterThan(25);
});
