import { expect, test, type Page } from '@playwright/test';
import { editCase, signIn } from './helpers';

/**
 * §47, round 24 — three small repairs, each with the failure it was reported as.
 *
 *  1. The web's resting layer keeps the glass covered while the hand pans, so
 *     the lines and the step rings no longer stop dead at the border the drag
 *     started from.
 *  2. A card whose artikel is gone offers to write it again, in place.
 *  3. A prikbord can be hung in a dossier and taken out of one, from either end.
 */

const KEEPER = ['Keeper', 'abbeytower34'] as const;

test.describe('round 24', () => {
  /**
   * The reported failure, as geometry rather than pixels: mid-drag the layer
   * element is *inside* the canvas on the leading side, and everything past its
   * edge is bare paper. The invariant is that it covers the glass on all four
   * sides at every moment of the pan.
   */
  test('the resting layer covers the glass while the hand pans', async ({ page }, info) => {
    test.skip(info.project.name === 'phone', 'a pan with a mouse button (§43)');
    await signIn(page, ...KEEPER);
    await page.goto('/web');
    await expect(page.getByTestId('web-stage')).toBeVisible();
    await page.waitForFunction(
      () => {
        const s = (window as unknown as { __web?: { placed: Map<string, unknown>; pendingFit: boolean; cameraFrom: unknown } }).__web;
        return Boolean(s && s.placed.size > 1 && !s.pendingFit && !s.cameraFrom);
      },
      null,
      { timeout: 30_000 },
    );

    const box = (await page.locator('.web-canvas').boundingBox())!;
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    for (let step = 1; step <= 6; step++) {
      await page.mouse.move(cx + step * 40, cy + step * 12);
      const cover = await page.evaluate(() => {
        const layer = document.querySelector('.web-canvas-layer')!.getBoundingClientRect();
        const glass = document.querySelector('.web-canvas')!.getBoundingClientRect();
        return {
          left: layer.left - glass.left,
          top: layer.top - glass.top,
          right: layer.right - glass.right,
          bottom: layer.bottom - glass.bottom,
        };
      });
      // Half a pixel of slack for the rounding of a subpixel layout.
      expect(cover.left, `left, step ${step}`).toBeLessThanOrEqual(0.5);
      expect(cover.top, `top, step ${step}`).toBeLessThanOrEqual(0.5);
      expect(cover.right, `right, step ${step}`).toBeGreaterThanOrEqual(-0.5);
      expect(cover.bottom, `bottom, step ${step}`).toBeGreaterThanOrEqual(-0.5);
    }
    await page.mouse.up();
  });

  /**
   * A card that stands for an artikel that has been thrown away is stamped
   * "Ontbreekt" and, before this round, was a dead end: the wall remembered the
   * name and there was no way to write the thing again from it.
   */
  test('a card whose artikel is gone can write it again', async ({ page }, info) => {
    test.setTimeout(90_000);
    const stamp = `${info.project.name}-${Date.now().toString(36)}`;
    const name = `Verdwenen ${stamp}`;
    await signIn(page, ...KEEPER);

    const made = await page.request.post('/api/entries', { data: { typeSlug: 'character', name } });
    expect(made.ok()).toBe(true);
    const { entry } = await made.json();
    const board = await page.request.post('/api/boards', { data: { name: `Muur ${stamp}` } });
    expect(board.ok()).toBe(true);
    const { board: made2 } = await board.json();
    await page.goto(`/b/${made2.id}`);

    // Pin the artikel on the wall the ordinary way.
    const search = page.getByLabel('Kaart toevoegen');
    await search.fill(name);
    await page
      .locator('.suggest-item')
      .filter({ hasText: name })
      .filter({ hasNotText: 'aanmaken' })
      .filter({ hasNotText: 'als notitie' })
      .first()
      .click();
    await expect(page.locator('.board-card', { hasText: name })).toBeVisible();
    await expect(page.locator('.save-state')).toHaveText('Opgeslagen', { timeout: 15_000 });

    // Now the artikel goes in the bin, and the card is left holding a name.
    const gone = await page.request.delete(`/api/entries/${entry.id}`);
    expect(gone.ok()).toBe(true);
    await page.reload();

    const card = page.locator('.board-card', { hasText: name });
    await expect(card.locator('.stamp')).toContainText('Ontbreekt');
    const again = card.getByRole('button', { name: /opnieuw aanmaken/ });
    await expect(again).toBeVisible();
    await again.click();

    const sheet = page.getByRole('dialog', { name: /Nieuw artikel/ });
    await expect(sheet).toBeVisible();
    await sheet.getByRole('button', { name: 'Aanmaken', exact: true }).click();
    await expect(sheet).toBeHidden({ timeout: 20_000 });

    // The card points at the new artikel: no stamp, no offer, and a name that
    // opens a page.
    const repaired = page.locator('.board-card', { hasText: name });
    await expect(repaired.locator('.stamp')).toHaveCount(0);
    await expect(repaired.getByRole('button', { name: /aanmaken/ })).toHaveCount(0);
  });

  /** A wall hung loose can be filed, and a filed wall can be taken out again. */
  test('a prikbord is hung in a dossier and taken out of it', async ({ page }, info) => {
    // §47: the picker in the prikbord's bar is desktop-only — a second line in
    // that bar pushes the cork off a phone screen. The dossier's own tab has
    // both halves, and a phone uses that.
    test.skip(info.project.name === 'phone', 'the bar picker is desktop-only (§47)');
    test.setTimeout(90_000);
    const stamp = `${info.project.name}-${Date.now().toString(36)}`;
    await signIn(page, ...KEEPER);

    const madeCase = await page.request.post('/api/cases', { data: { name: `Zaak ${stamp}` } });
    expect(madeCase.ok()).toBe(true);
    const caseBody = await madeCase.json();
    const theCase = caseBody.case ?? caseBody;
    const madeBoard = await page.request.post('/api/boards', { data: { name: `Losse muur ${stamp}` } });
    expect(madeBoard.ok()).toBe(true);
    const { board } = await madeBoard.json();

    await page.goto(`/b/${board.id}`);
    const picker = page.getByTestId('board-case-select');
    await expect(picker).toHaveValue('');
    await picker.selectOption(theCase.id);
    // The chip to the dossier is the wall saying where it hangs.
    await expect(page.getByRole('link', { name: new RegExp(`Zaak ${stamp}`) })).toBeVisible({ timeout: 20_000 });

    // And the dossier has it, with a way to let it go again.
    await page.goto(`/c/${theCase.slug}`);
    // §22: a dossier opens on its reading face; the picker and "Losmaken" are
    // on the other one, like every other control that changes something.
    await editCase(page);
    await openBoards(page);
    await expect(page.getByRole('link', { name: new RegExp(`Losse muur ${stamp}`) })).toBeVisible();
    await page.getByRole('button', { name: 'Losmaken' }).first().click();
    await expect(page.getByRole('link', { name: new RegExp(`Losse muur ${stamp}`) })).toHaveCount(0, { timeout: 20_000 });

    // The wall itself agrees, and is loose again.
    await page.goto(`/b/${board.id}`);
    await expect(page.getByTestId('board-case-select')).toHaveValue('');
  });
});

/** The dossier's prikbord tab, which is a tab on a desktop and a tab on a phone. */
async function openBoards(page: Page) {
  const tab = page.getByRole('tab', { name: /Prikbord/ }).first();
  if (await tab.count()) await tab.click();
}
