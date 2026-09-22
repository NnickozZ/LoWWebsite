import { expect, test, type Page } from '@playwright/test';
import { boxValue, editArticle, editCase, expectBoxValue, newEntryButton, signIn } from './helpers';

/**
 * §92, ronde 53 — de korte vakken (variant c+).
 *
 * Nick: "in de korte descriptions wordt `[[]]` gebruikt en tijdens het editen
 * is het allemaal niet zo netjes als in de rest van de secties. Ook gekke
 * hyperlinks onder dit vakje in edit mode."
 *
 * What only a browser can say: that the box shows chips when you are not in
 * it and the raw text when you are, that the row under it is gone, that a
 * half-typed `[[` does not reach the archive, that Enter leaves a one-line
 * box, and where the list hangs when the keyboard is up. The pure halves are
 * in `tests/unit/ronde-53-korte-vakken.test.ts`.
 */

const KEEPER = { name: 'Keeper', password: 'abbeytower34' };

async function makeEntry(page: Page, name: string, shortDescription = ''): Promise<{ id: string; slug: string }> {
  const made = await page.request.post('/api/entries', { data: { name, typeSlug: 'character', shortDescription } });
  expect(made.ok()).toBe(true);
  return ((await made.json()) as { entry: { id: string; slug: string } }).entry;
}

test('A1: de korte beschrijving toont zijn chips in het vak, zonder haakjes, en geen regel eronder', async ({
  page,
}, info) => {
  // §95 (ronde 56): the box *is* the chips now — in focus and out of it. What
  // §92 proved with a preview over a textarea is proved on the box itself.
  test.setTimeout(120_000);
  const stamp = `${info.project.name}-${Date.now().toString(36)}`;
  await signIn(page, KEEPER.name, KEEPER.password);
  const target = `Doelwit ${stamp}`;
  const targetEntry = await makeEntry(page, target);
  const source = await makeEntry(page, `Bron ${stamp}`, `Zag [[${target}]] bij de haven`);

  await page.goto(`/e/${source.slug}`);
  await editArticle(page);
  const lead = page.locator('#entry-lead');
  const chip = lead.locator('.short-chip', { hasText: target });
  await expect(chip).toBeVisible({ timeout: 20_000 });
  await expect(lead).toHaveText(`Zag ${target} bij de haven`);
  await expect(page.getByText('Verwijst naar')).toHaveCount(0);
  await expect(page.getByTestId('mention-preview')).toHaveCount(0);

  // A click beside the chip puts the caret in the box, and the chip stays.
  await lead.click({ position: { x: 4, y: 8 } });
  await expect(lead).toBeFocused();
  await expect(chip).toBeVisible();

  // And it goes where it says.
  await page.keyboard.press('Tab');
  await chip.click();
  await page.waitForURL(`**/e/${targetEntry.slug}`, { timeout: 20_000 });
});

test('A4 + A8: een losse [[ verdwijnt bij het verlaten, en Enter verlaat het vak', async ({ page }, info) => {
  test.setTimeout(120_000);
  const stamp = `${info.project.name}-${Date.now().toString(36)}`;
  await signIn(page, KEEPER.name, KEEPER.password);
  const source = await makeEntry(page, `Los ${stamp}`, 'en');

  await page.goto(`/e/${source.slug}`);
  await editArticle(page);
  const lead = page.locator('#entry-lead');
  await expectBoxValue(lead, 'en');
  await expect(lead).toBeEditable();
  await page.waitForTimeout(500);
  await lead.click();
  await page.keyboard.press('End');
  await lead.pressSequentially(' [[Qqzx', { delay: 30 });
  await expect(page.getByTestId('mention-pop')).toBeVisible({ timeout: 20_000 });

  // Escape says "not a name": the list closes, stays closed, and the
  // brackets go — the letters stay.
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('mention-pop')).toHaveCount(0);
  await expectBoxValue(lead, 'en Qqzx');
  await page.waitForTimeout(300);
  await expect(page.getByTestId('mention-pop')).toHaveCount(0);

  // A4: a half-typed `[[` left behind by leaving the box goes the same way.
  await lead.pressSequentially(' [[Jac', { delay: 30 });
  await expect(page.getByTestId('mention-pop')).toBeVisible({ timeout: 20_000 });
  await page.getByRole('heading', { level: 2 }).first().click();
  await expect(lead).not.toBeFocused();
  await expectBoxValue(lead, 'en Qqzx Jac');

  // A8: Enter in the korte beschrijving leaves it, and writes no new line.
  await lead.click();
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  await expect(lead).not.toBeFocused();
  expect(await boxValue(lead)).not.toContain('\n');

  // It is what the archive keeps: the reading face shows it without brackets.
  await page.waitForTimeout(2500);
  await page.goto(`/e/${source.slug}`);
  await expect(page.locator('.entry-lead')).toHaveText('en Qqzx Jac', { timeout: 20_000 });
});

test('A5: op een telefoon met open toetsenbord klapt de lijst omhoog en blijft "aanmaken" in beeld', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'phone', 'het toetsenbord is een telefoonzaak');
  test.setTimeout(120_000);
  const stamp = `${info.project.name}-${Date.now().toString(36)}`;
  await signIn(page, KEEPER.name, KEEPER.password);
  const source = await makeEntry(page, `Lijst ${stamp}`, 'Zag');

  await page.goto(`/e/${source.slug}`);
  await editArticle(page);
  const lead = page.locator('#entry-lead');
  await expect(lead).toBeEditable();
  await page.waitForTimeout(500);
  // The keyboard: a visual viewport of 500 px on a layout viewport of 844.
  await lead.scrollIntoViewIfNeeded();
  await page.setViewportSize({ width: 390, height: 500 });
  await lead.evaluate((el) => el.scrollIntoView({ block: 'end' }));
  await lead.click();
  await page.keyboard.press('End');
  await lead.pressSequentially(' [[Pier', { delay: 30 });
  const pop = page.getByTestId('mention-pop');
  await expect(pop).toBeVisible({ timeout: 20_000 });
  const listRect = (await pop.boundingBox())!;
  const boxRect = (await lead.boundingBox())!;
  const view = await page.evaluate(() => ({
    top: window.visualViewport?.offsetTop ?? 0,
    height: window.visualViewport?.height ?? window.innerHeight,
  }));
  // Wherever it hangs, it hangs inside what can be seen.
  expect(listRect.y).toBeGreaterThanOrEqual(view.top - 1);
  expect(listRect.y + listRect.height).toBeLessThanOrEqual(view.top + view.height + 1);
  // With the box low on the screen, it opens upwards.
  if (boxRect.y > view.top + view.height / 2) {
    await expect(pop).toHaveAttribute('data-up', 'true');
    expect(listRect.y + listRect.height).toBeLessThanOrEqual(boxRect.y + 1);
  }
  // "'Pier' aanmaken" is in view without scrolling the list.
  const create = pop.getByRole('option', { name: /aanmaken/ });
  const createRect = (await create.boundingBox())!;
  expect(createRect.y + createRect.height).toBeLessThanOrEqual(listRect.y + listRect.height + 1);
  expect(createRect.y).toBeGreaterThanOrEqual(listRect.y - 1);
  // Every row is a thumb high.
  const heights = await pop.getByRole('option').evaluateAll((els) => els.map((el) => el.getBoundingClientRect().height));
  for (const height of heights) expect(height).toBeGreaterThanOrEqual(43.5);
  await page.keyboard.press('Escape');
});

test('A6: de samenvatting in "Nieuw dossier" is een vak dat meegroeit, met de hint', async ({ page }) => {
  test.setTimeout(90_000);
  await signIn(page, KEEPER.name, KEEPER.password);
  await page.goto('/cases');
  await page.getByRole('button', { name: /Nieuw dossier|dossier openen/i }).first().click();
  const summary = page.locator('#new-case-summary');
  await expect(summary).toBeVisible({ timeout: 20_000 });
  // §95: the short box every samenvatting is now — an editor of one line that
  // wraps, with the hint as its placeholder.
  await expect(summary).toHaveAttribute('role', 'textbox');
  await expect(summary).toHaveAttribute('aria-multiline', 'false');
  await expect(summary).toHaveAttribute('aria-placeholder', /@ of \[\[/);
});

test('A1 op de samenvatting van een dossier: chips in het vak, en geen regel eronder', async ({ page }, info) => {
  test.setTimeout(120_000);
  const stamp = `${info.project.name}-${Date.now().toString(36)}`;
  await signIn(page, KEEPER.name, KEEPER.password);
  const target = `Getuige ${stamp}`;
  await makeEntry(page, target);
  const made = await page.request.post('/api/cases', {
    data: { name: `Zaak ${stamp}`, summary: `Wie zag [[${target}]]?` },
  });
  expect(made.ok()).toBe(true);
  const { case: dossier } = (await made.json()) as { case: { slug: string } };
  await page.goto(`/c/${dossier.slug}`);
  await editCase(page);
  const summary = page.locator('#case-summary');
  // §95: the name typed out in full became a chip on its way in.
  await expect(summary.locator('.short-chip', { hasText: target })).toBeVisible({ timeout: 20_000 });
  await expect(summary).toHaveText(`Wie zag ${target}?`);
  await expect(page.getByText('Verwijst naar')).toHaveCount(0);
  await summary.click({ position: { x: 4, y: 8 } });
  await expect(summary).toBeFocused();
  await expect(summary.locator('.short-chip')).toBeVisible();
});

test('B11/B12/B23: een artikel op de telefoon — sprongen bovenaan, infobox dicht met een kijkje, één knop voor "zet op"', async ({
  page,
}, info) => {
  test.setTimeout(120_000);
  const stamp = `${info.project.name}-${Date.now().toString(36)}`;
  await signIn(page, KEEPER.name, KEEPER.password);
  const made = await page.request.post('/api/entries', {
    data: { name: `Kijkje ${stamp}`, typeSlug: 'character', tags: ['kade'] },
  });
  expect(made.ok()).toBe(true);
  const { entry } = (await made.json()) as { entry: { slug: string } };
  await page.goto(`/e/${entry.slug}`);

  // B23: no dossier, so no "Dossier voor de naam" line above the title.
  await expect(page.getByText('Dossier voor de naam')).toHaveCount(0);

  if (info.project.name === 'phone') {
    // The jump chips come before the picture and the facts.
    const outline = page.locator('.entry-outline').first();
    const info_ = page.locator('#block-info');
    await expect(outline).toBeVisible();
    const outlineTop = (await outline.boundingBox())!.y;
    const infoTop = (await info_.boundingBox())!.y;
    expect(outlineTop).toBeLessThan(infoTop);
    // Reading, the infobox is folded, and a peek says what is in it.
    await expect(page.locator('details#block-info')).not.toHaveAttribute('open', '');
    await expect(page.getByTestId('infobox-peek')).toBeVisible();
  }

  // B12: editing, one button instead of a pill per landkaart and tijdlijn.
  await editArticle(page);
  await expect(page.locator('a', { hasText: /^Zet op / })).toHaveCount(0);
  const placeOn = page.getByTestId('place-on');
  if (await placeOn.count()) {
    await placeOn.click();
    const sheet = page.getByRole('dialog', { name: /Waar zet je dit/ });
    await expect(sheet).toBeVisible();
    await expect(sheet.locator('a[href*="place="]').first()).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(sheet).toHaveCount(0);
  }
});

test('C26/C27: het maakblad begint bij de naam, de soort is één regel, en er is een dossierregel', async ({ page }) => {
  test.setTimeout(90_000);
  await signIn(page, KEEPER.name, KEEPER.password);
  await page.goto('/');
  await newEntryButton(page).click();
  const sheet = page.getByRole('dialog', { name: 'Nieuw artikel' });
  const name = sheet.getByLabel('Naam', { exact: true });
  await expect(name).toBeVisible({ timeout: 20_000 });
  await expect(name).toBeFocused();
  // The name comes before the soort.
  const strip = sheet.getByRole('radiogroup');
  expect((await name.boundingBox())!.y).toBeLessThan((await strip.boundingBox())!.y);
  // One line: the strip is no taller than two chips, however many soorten.
  const chipHeight = (await strip.getByRole('radio').first().boundingBox())!.height;
  expect((await strip.boundingBox())!.height).toBeLessThan(chipHeight * 2);
  // Every soort is still a radio you can press by name.
  await strip.getByRole('radio', { name: 'Clues', exact: true }).click();
  await expect(strip.getByRole('radio', { name: 'Clues', exact: true })).toHaveAttribute('aria-checked', 'true');
  // An optional dossier, from the open ones.
  const dossier = sheet.locator('#new-entry-case');
  if (await dossier.count()) await expect(dossier.locator('option').first()).toHaveText('Geen');
  await page.keyboard.press('Escape');
});

test('F31: de wiki op de telefoon is een lijst, met de tags als rij onder de tabs', async ({ page }, info) => {
  test.setTimeout(90_000);
  await signIn(page, KEEPER.name, KEEPER.password);
  await page.goto('/wiki/character');
  const grid = page.locator('#wiki-entries');
  await expect(grid).toBeVisible({ timeout: 20_000 });
  const cards = grid.locator('> .card');
  const first = (await cards.nth(0).boundingBox())!;
  const second = (await cards.nth(1).boundingBox())!;
  if (info.project.name === 'phone') {
    // One line per artikel: under each other, the full width, a thumb high.
    expect(second.y).toBeGreaterThan(first.y + first.height - 2);
    expect(first.height).toBeLessThan(80);
    await expect(page.locator('.wiki-tag-row')).toBeVisible();
  } else {
    // Cards side by side on a desktop.
    expect(Math.abs(second.y - first.y)).toBeLessThan(2);
  }
  // The choice is the reader's: Kaarten on a phone, Lijst on a desktop.
  const toggle = page.getByRole('group', { name: 'Weergave' });
  await toggle.getByRole('button', { name: info.project.name === 'phone' ? 'Kaarten' : 'Lijst' }).click();
  const a = (await cards.nth(0).boundingBox())!;
  const b = (await cards.nth(1).boundingBox())!;
  if (info.project.name === 'phone') expect(a.height).toBeGreaterThan(120);
  else expect(b.y).toBeGreaterThan(a.y + a.height - 2);
});
