import { expect, test, type Page } from '@playwright/test';
import { readCanvas, signIn } from './helpers';

/**
 * Round 37 — het web: lezen en bewerken (§73), en een kaartje dat opkomt (§74).
 *
 *  1. A desk opens the web in Bewerken; in Lezen a drag on a knot pans the
 *     camera instead of pinning the knot.
 *  2. A phone opens it in Lezen, and a tapped knot opens a peek — a dialog
 *     named after the knot that leaves most of the glass alone.
 */

const KEEPER = ['Keeper', 'abbeytower34'] as const;

type Made = { id: string; slug: string; name: string };

async function makeEntry(page: Page, name: string, typeSlug = 'character'): Promise<Made> {
  const response = await page.request.post('/api/entries', { data: { typeSlug, name } });
  expect(response.ok()).toBe(true);
  const { entry } = await response.json();
  return { id: entry.id, slug: entry.slug, name };
}

async function link(page: Page, from: Made, to: Made) {
  const body = {
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: [
          { type: 'text', text: 'Zie ook ' },
          { type: 'entryLink', attrs: { id: to.id, label: to.name } },
          { type: 'text', text: '. ' },
        ],
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
  sim: { settled: boolean; pinnedCount: number };
};

/** As in `web.spec.ts`: a knot's place on the screen, read off `window.__web`. */
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

async function twoKnots(page: Page, word: string) {
  await signIn(page, ...KEEPER);
  const stamp = Date.now().toString(36);
  const a = await makeEntry(page, `${word} A ${stamp}`);
  const b = await makeEntry(page, `${word} B ${stamp}`, 'location');
  await link(page, a, b);
  await page.goto(`/web?focus=entry:${a.id}`);
  await expect(page.getByTestId('web-stage')).toBeVisible();
  return { a, b };
}

test('the web on a desk opens in Bewerken, and in Lezen a drag on a knot pans', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === 'phone', 'a mouse drag on a knot is a desk gesture');
  const { a } = await twoKnots(page, 'Lees');
  const group = page.getByTestId('canvas-mode');
  await expect(group.getByRole('radio', { name: 'Bewerken', exact: true })).toHaveAttribute('aria-checked', 'true');
  await expect(group.getByRole('radio', { name: 'Lezen', exact: true })).toHaveAttribute('aria-checked', 'false');

  await readCanvas(page);
  await page.waitForFunction(() => (window as unknown as { __web: WebState }).__web.sim.settled);
  const pt = await nodePoint(page, `entry:${a.id}`);
  const cameraBefore = await page.evaluate(() => ({ ...(window as unknown as { __web: WebState }).__web.camera }));
  await page.mouse.move(pt.x, pt.y);
  await page.mouse.down();
  for (let i = 1; i <= 8; i += 1) await page.mouse.move(pt.x + i * 12, pt.y + i * 6);
  await page.mouse.up();

  // The camera moved, the knot was not pinned, and there is nothing to let go.
  const after = await page.evaluate(() => {
    const s = (window as unknown as { __web: WebState }).__web;
    return { camera: { ...s.camera }, pinned: s.sim.pinnedCount };
  });
  expect(after.pinned).toBe(0);
  expect(Math.hypot(after.camera.x - cameraBefore.x, after.camera.y - cameraBefore.y)).toBeGreaterThan(20);
  await expect(page.getByTestId('web-unpin')).toHaveCount(0);
});

test('the web on a phone opens in Lezen, and a tapped knot rises as a peek', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'phone', 'the peek is the phone’s panel');
  const { a } = await twoKnots(page, 'Kijk');
  const group = page.getByTestId('canvas-mode');
  // The server renders a desk; the phone turns to Lezen on its first client render.
  await expect(group.getByRole('radio', { name: 'Lezen', exact: true })).toHaveAttribute('aria-checked', 'true');

  const peek = page.getByRole('dialog', { name: a.name, exact: true });
  await expect(async () => {
    if (!(await peek.isVisible().catch(() => false))) {
      const pt = await nodePoint(page, 'focus');
      await page.mouse.click(pt.x, pt.y);
    }
    await expect(peek).toBeVisible({ timeout: 1500 });
  }).toPass({ timeout: 15_000 });
  await expect(peek.getByTestId('web-panel')).toContainText(a.name);
  await expect(peek.getByTestId('web-open')).toBeVisible();

  const viewport = page.viewportSize()!;
  const box = (await page.locator('.canvas-peek').boundingBox())!;
  expect(box.height).toBeLessThan(viewport.height * 0.45);

  // Never modal: Escape gives the glass back.
  await page.keyboard.press('Escape');
  await expect(peek).toHaveCount(0);
});
