import { expect, test } from '@playwright/test';
import { join, resolve } from 'node:path';
import { signIn } from './helpers';

const fixturePhoto = join(resolve(__dirname, '../..'), 'data-e2e', 'fixture-photo.png');

/**
 * The board's editing suite: strings are selectable and can be relabelled,
 * recoloured and removed; notes can gain, re-crop and lose a picture; undo
 * survives the round trip to the server.
 *
 * Desktop only — string-drawing needs a pointer, and §8 turns it off under
 * 768 px. The phone half of the board is covered by golden flow 4.
 */
test.describe('board editing', () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name === 'phone', 'strings need a pointer (§8)');
  });

  test('a string can be relabelled, recoloured and removed', async ({ page }) => {
    await signIn(page, 'Keeper', 'abbeytower34');
    await page.goto('/boards');
    await page.getByRole('button', { name: 'Openbaar prikbord' }).click();
    await page.waitForURL('**/b/**');

    const search = page.getByLabel('Kaart toevoegen');
    for (const name of ['Pier Boone', 'Sister Clasina']) {
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

    // Draw one string; it selects itself so the inspector is right there.
    const from = page.locator('.board-card', { hasText: 'Pier Boone' }).first();
    const to = page.locator('.board-card', { hasText: 'Sister Clasina' }).first();
    const pin = (await from.locator('.board-pin').boundingBox())!;
    const target = (await to.boundingBox())!;
    await page.mouse.move(pin.x + pin.width / 2, pin.y + pin.height / 2);
    await page.mouse.down();
    await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2, { steps: 12 });
    await page.mouse.up();

    const inspector = page.locator('.board-inspector');
    await expect(inspector).toBeVisible();

    // Label
    await page.getByLabel('Bijschrift').fill('paid in guilders');
    await page.getByLabel('Bijschrift').press('Enter');
    await expect(page.locator('.board-string-label')).toHaveText('paid in guilders');

    // Colour. Assert what is actually painted, not the attribute: a CSS rule
    // beats a presentation attribute, and that is exactly how the colour once
    // reached the label but never the line.
    await inspector.getByRole('radio', { name: 'groen' }).click();
    const stroke = () =>
      page.locator('.board-string').first().evaluate((n) => getComputedStyle(n).stroke);
    await expect.poll(stroke).toBe('rgb(47, 107, 79)');

    // Escape clears the selection; clicking the string itself brings it back.
    await page.keyboard.press('Escape');
    await expect(inspector).toBeHidden();
    await page.locator('.board-string-label').click();
    await expect(inspector).toBeVisible();
    await expect(page.getByLabel('Bijschrift')).toHaveValue('paid in guilders');

    // Remove, then undo — and prove the undo survived the save, which is the
    // part that used to come apart: the deletion stayed queued behind it.
    await inspector.getByRole('button', { name: 'Verwijderen', exact: true }).click();
    await expect(page.locator('.board-string')).toHaveCount(0);
    await expect(page.locator('.save-state')).toHaveText('Opgeslagen', { timeout: 15_000 });

    // The toolbar's Undo, not the undo toast's.
    await page.getByTitle('Ongedaan maken (Ctrl+Z)').click();
    await expect(page.locator('.save-state')).toHaveText('Opgeslagen', { timeout: 15_000 });
    await page.reload();
    await expect(page.locator('.board-string')).toHaveCount(1);
    await expect(page.locator('.board-string-label')).toHaveText('paid in guilders');
    await expect.poll(stroke).toBe('rgb(47, 107, 79)');
  });

  test('a note gains a photo, is re-cropped, and opens full size', async ({ page }) => {
    await signIn(page, 'Keeper', 'abbeytower34');
    await page.goto('/boards');
    await page.getByRole('button', { name: 'Openbaar prikbord' }).click();
    await page.waitForURL('**/b/**');

    await page.getByLabel('Kaart toevoegen').fill('Ledger fragment');
    await page.locator('.suggest-item').filter({ hasText: 'als notitie' }).click();
    const note = page.locator('.board-card', { hasText: 'Ledger fragment' });
    await expect(note).toBeVisible();
    await expect(note.locator('img')).toHaveCount(0);

    // Selecting the card is how the inspector appears — no kebab menus.
    await note.locator('.board-card-body').click();
    const inspector = page.locator('.board-inspector');
    await expect(inspector).toBeVisible();

    const chooser = page.waitForEvent('filechooser');
    await inspector.getByRole('button', { name: 'Foto toevoegen' }).click();
    await (await chooser).setFiles(fixturePhoto);

    await expect(note.locator('img')).toHaveCount(1);
    // A fresh picture drops straight into crop mode.
    await expect(page.locator('.board-card-cropping')).toHaveCount(1);

    const before = await note.locator('img').getAttribute('style');
    const frame = (await note.boundingBox())!;
    await page.mouse.move(frame.x + 80, frame.y + 100);
    await page.mouse.down();
    await page.mouse.move(frame.x + 115, frame.y + 135, { steps: 8 });
    await page.mouse.up();
    await expect(note.locator('img')).not.toHaveAttribute('style', before ?? '');

    await inspector.getByRole('button', { name: 'Klaar' }).click();
    await expect(page.locator('.board-card-cropping')).toHaveCount(0);
    await expect(page.locator('.save-state')).toHaveText('Opgeslagen', { timeout: 15_000 });

    // The crop survives a reload.
    // Compare the computed focal point, not the raw style string: React's
    // server markup and the client's DOM serialise the same values differently.
    const focus = () => note.locator('img').evaluate((n) => getComputedStyle(n).objectPosition);
    const cropped = await focus();
    await page.reload();
    await expect.poll(focus).toBe(cropped);

    // "View full" is a double-click; a single click only selects.
    await note.locator('.board-card-cover').click();
    await expect(page.locator('.board-lightbox')).toHaveCount(0);
    await note.locator('.board-card-cover').dblclick();
    await expect(page.locator('.board-lightbox')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('.board-lightbox')).toBeHidden();

    // And the picture can be taken off again.
    await note.locator('.board-card-body').click();
    await inspector.getByRole('button', { name: 'Foto verwijderen' }).click();
    await expect(note.locator('img')).toHaveCount(0);
  });
});
