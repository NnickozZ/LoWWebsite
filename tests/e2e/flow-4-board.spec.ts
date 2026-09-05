import { expect, test } from '@playwright/test';
import { signIn } from './helpers';

/**
 * Golden flow 4 (§15): open a board, add three entry cards via search, add a
 * free note, draw a labelled string between two cards, edit board-local text,
 * reload — everything persists with positions and rotations intact; click a
 * card's cover and land on the entry.
 *
 * §8 wins where it conflicts with §15: under 768 px there is no dragging and no
 * string-drawing, so the phone project checks the hint and everything else.
 */
test('board: cards, a note, string and persistence', async ({ page }, testInfo) => {
  const isPhone = testInfo.project.name === 'phone';
  const noteName = `Second ledger ${Date.now().toString(36)}`;

  await signIn(page, 'Keeper', 'abbeytower34');

  // A board of its own, so the test is repeatable and cannot collide with a
  // board another spec is working on.
  await page.goto('/boards');
  await page.getByRole('button', { name: 'Openbaar prikbord' }).click();
  await page.waitForURL('**/b/**');
  const boardUrl = page.url();

  const search = page.getByLabel('Kaart toevoegen');

  // -- three entry cards -----------------------------------------------------
  for (const name of ['Pier Boone', 'De Schorre', 'Sister Clasina']) {
    await search.fill(name);
    const option = page
      .locator('.suggest-item')
      .filter({ hasText: name })
      .filter({ hasNotText: 'als notitie' })
      .first();
    await expect(option).toBeVisible();
    await option.click();
    await expect(page.locator('.board-card', { hasText: name })).toBeVisible();
  }

  // -- a free note -----------------------------------------------------------
  await search.fill(noteName);
  await page.locator('.suggest-item').filter({ hasText: 'als notitie' }).click();
  const note = page.locator('.board-card', { hasText: noteName });
  await expect(note).toBeVisible();
  await expect(note.getByRole('button', { name: 'Fiche aanmaken' })).toBeVisible();

  // -- board-local text ------------------------------------------------------
  await note.locator('.board-card-text').dblclick();
  await page.locator('.board-card-text-input').fill('Kept in his coat.');
  await page.locator('.board-card-text-input').blur();
  await expect(note.locator('.board-card-text')).toHaveText('Kept in his coat.');

  if (isPhone) {
    // §8: the hint replaces dragging and string-drawing on a small screen.
    await expect(page.getByText('Verschuiven werkt het best op een tablet of computer.')).toBeVisible();
  } else {
    // -- drag a card, then run a labelled string between two ------------------
    const pier = page.locator('.board-card', { hasText: 'Pier Boone' }).first();
    const before = (await pier.boundingBox())!;
    await page.mouse.move(before.x + 80, before.y + 200);
    await page.mouse.down();
    // Far enough to prove the drag, short of the next card's slot.
    await page.mouse.move(before.x + 170, before.y + 240, { steps: 12 });
    await page.mouse.up();
    const after = (await pier.boundingBox())!;
    expect(Math.abs(after.x - before.x)).toBeGreaterThan(60);

    // Let the autosave settle before measuring anything, so a merge landing
    // mid-measurement cannot move the pin out from under the pointer.
    await expect(page.locator('.save-state')).toHaveText('Opgeslagen', { timeout: 15_000 });

    // -- pan the cork ---------------------------------------------------------
    // Dragging empty cork moves the whole board. Worth its own step: the
    // handler reads a ref that pointerup clears, which Strict Mode exposes.
    // Clear the selection first: the inspector is docked bottom-left, and a
    // press on it is not a press on the cork.
    await page.keyboard.press('Escape');
    const surface = (await page.locator('.board-viewport').boundingBox())!;
    const beforePan = (await pier.boundingBox())!;
    await page.mouse.move(surface.x + 40, surface.y + 50);
    await page.mouse.down();
    await page.mouse.move(surface.x + 160, surface.y + 110, { steps: 10 });
    await page.mouse.up();
    expect((await pier.boundingBox())!.x - beforePan.x).toBeGreaterThan(60);

    // Pan back, so the rest of the test measures where it expects to.
    await page.mouse.move(surface.x + 160, surface.y + 110);
    await page.mouse.down();
    await page.mouse.move(surface.x + 40, surface.y + 50, { steps: 10 });
    await page.mouse.up();
    await expect(page.locator('.save-state')).toHaveText('Opgeslagen', { timeout: 15_000 });

    // Between two cards that have not been dragged, so neither can have ended
    // up sitting on top of the other.
    const schorre = page.locator('.board-card', { hasText: 'De Schorre' }).first();
    const clasina = page.locator('.board-card', { hasText: 'Sister Clasina' }).first();
    const fromPin = (await schorre.locator('.board-pin').boundingBox())!;
    const target = (await clasina.boundingBox())!;
    await page.mouse.move(fromPin.x + fromPin.width / 2, fromPin.y + fromPin.height / 2);
    await page.mouse.down();
    await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2, { steps: 14 });
    await page.mouse.up();

    // A fresh string selects itself, so its label field is already in the
    // inspector at the foot of the board.
    const labelInput = page.getByLabel('Bijschrift');
    await expect(labelInput).toBeVisible();
    await labelInput.fill('seen together at the harbour');
    await labelInput.press('Enter');
    await expect(page.locator('.board-string-label')).toContainText('seen together at the harbour');
  }

  // -- reload: everything is still there, where it was ----------------------
  const positions = await page.locator('.board-card').evaluateAll((nodes) =>
    nodes.map((node) => ({
      id: (node as HTMLElement).dataset.cardId,
      left: (node as HTMLElement).style.left,
      top: (node as HTMLElement).style.top,
      transform: (node as HTMLElement).style.transform,
    })),
  );

  await page.waitForTimeout(1400); // autosave
  await page.goto(boardUrl);
  await expect(page.locator('.board-card', { hasText: noteName })).toBeVisible();

  const after = await page.locator('.board-card').evaluateAll((nodes) =>
    nodes.map((node) => ({
      id: (node as HTMLElement).dataset.cardId,
      left: (node as HTMLElement).style.left,
      top: (node as HTMLElement).style.top,
      transform: (node as HTMLElement).style.transform,
    })),
  );

  for (const card of positions) {
    const match = after.find((item) => item.id === card.id);
    expect(match, `card ${card.id} survived the reload`).toBeTruthy();
    expect(match!.left).toBe(card.left);
    expect(match!.top).toBe(card.top);
    // Rotation is stored, so it must not be re-rolled on load.
    expect(match!.transform).toBe(card.transform);
  }

  if (!isPhone) {
    await expect(page.locator('.board-string-label')).toContainText('seen together at the harbour');
  }

  // -- a card's cover opens the entry ---------------------------------------
  // A card that was not dragged, so nothing can be sitting on top of it.
  const cover = page
    .locator('.board-card', { hasText: 'Sister Clasina' })
    .first()
    .locator('.board-card-cover');
  await cover.click();
  // One click only ever selects; a stray click must never yank you off the wall.
  await expect(page.locator('.board-inspector')).toBeVisible();
  await expect(page).toHaveURL(/\/b\//);
  if (isPhone) {
    // On a phone double-tap is unreliable, so the second tap opens instead.
    await cover.click();
  } else {
    await cover.dblclick();
  }
  await page.waitForURL('**/e/**');
  await expect(page.getByLabel('Naam')).toHaveValue(/Sister Clasina/);
});
