import { expect, test, type Locator, type Page } from '@playwright/test';
import { editArticle, signIn } from './helpers';

/**
 * §95, ronde 56 — één regel, één id.
 *
 * A mention in a short box is a chip with its artikel in it, not the letters
 * `[[Naam]]`. What only a browser can say: that the chip picked from the list
 * is the one that opens (A2, two artikelen with one name), that a renamed
 * artikel's chip reads the new name (A3), that Enter leaves the box and a paste
 * of two lines lands as one, and that two windows type into the same short box
 * at once. The pure halves are in `tests/unit/ronde-56-een-id.test.ts`.
 */

const KEEPER = { name: 'Keeper', password: 'abbeytower34' };

async function makeEntry(page: Page, name: string, typeSlug = 'character', shortDescription = '') {
  const made = await page.request.post('/api/entries', { data: { name, typeSlug, shortDescription } });
  expect(made.ok()).toBe(true);
  return ((await made.json()) as { entry: { id: string; slug: string } }).entry;
}

/** The korte beschrijving's box, once the editor is on the page. */
async function leadBox(page: Page): Promise<Locator> {
  const lead = page.locator('#entry-lead');
  await expect(lead).toBeVisible({ timeout: 20_000 });
  await expect(lead).toHaveAttribute('contenteditable', 'true', { timeout: 20_000 });
  // §6: a page that has just switched faces is not yet listening.
  await page.waitForTimeout(400);
  return lead;
}

async function typeInto(page: Page, box: Locator, text: string) {
  await box.click();
  await page.keyboard.press('End');
  await page.keyboard.type(text, { delay: 25 });
}

test('A2: de gekozen van twee gelijke namen is de chip die opent', async ({ page }, info) => {
  test.setTimeout(150_000);
  const stamp = `${info.project.name}-${Date.now().toString(36)}`;
  await signIn(page, KEEPER.name, KEEPER.password);
  const same = `Tweeling ${stamp}`;
  // The oldest is a persoon; the one to pick is the later locatie.
  await makeEntry(page, same, 'character');
  const place = await makeEntry(page, same, 'location');
  const source = await makeEntry(page, `Bron ${stamp}`);

  await page.goto(`/e/${source.slug}`);
  await editArticle(page);
  const lead = await leadBox(page);
  await typeInto(page, lead, `Gezien bij @${same}`);
  const list = page.locator('.suggest-list');
  await expect(list).toBeVisible({ timeout: 20_000 });
  const option = list.getByRole('option').filter({ hasText: same }).filter({ hasText: 'Locaties' });
  await expect(option).toBeVisible({ timeout: 20_000 });
  await option.dispatchEvent('mousedown');

  // A chip in the box — no brackets, no letters of a handle.
  const chip = lead.locator('.short-chip', { hasText: same });
  await expect(chip).toBeVisible({ timeout: 20_000 });
  await expect(lead).not.toContainText('[[');
  await expect(lead).not.toContainText('⟦');

  // Saved by the room; the reading face opens the locatie, not the older persoon.
  await page.keyboard.press('Tab');
  await page.waitForTimeout(2500);
  await page.goto(`/e/${source.slug}`);
  const read = page.locator('.entry-lead a.entry-chip', { hasText: same });
  await expect(read).toBeVisible({ timeout: 20_000 });
  await expect(read).toHaveAttribute('href', `/e/${place.slug}`);
  await read.click();
  await page.waitForURL(`**/e/${place.slug}`, { timeout: 20_000 });
});

test('A3: een hernoemd artikel heet in elke chip meteen zo', async ({ page }, info) => {
  test.setTimeout(120_000);
  const stamp = `${info.project.name}-${Date.now().toString(36)}`;
  await signIn(page, KEEPER.name, KEEPER.password);
  const before = `Oude naam ${stamp}`;
  const target = await makeEntry(page, before);
  // Typed out in full on the way in: the archive makes it a chip (the oldest
  // with that name, exactly as the reader always read it).
  const source = await makeEntry(page, `Bron ${stamp}`, 'character', `Brief van [[${before}]] aan de veerman`);

  await page.goto(`/e/${source.slug}`);
  await expect(page.locator('.entry-lead a.entry-chip', { hasText: before })).toBeVisible({ timeout: 20_000 });

  const after = `Nieuwe naam ${stamp}`;
  const renamed = await page.request.patch(`/api/entries/${target.id}`, { data: { name: after } });
  expect(renamed.ok()).toBe(true);

  await page.goto(`/e/${source.slug}`);
  const chip = page.locator('.entry-lead a.entry-chip');
  await expect(chip).toHaveText(after, { timeout: 20_000 });
  await expect(page.locator('.entry-lead')).toHaveText(`Brief van ${after} aan de veerman`);
  await expect(page.locator('.entry-lead')).not.toContainText(before);

  // And in the box itself.
  await editArticle(page);
  const lead = await leadBox(page);
  await expect(lead.locator('.short-chip')).toHaveText(after);
});

test('A8 + plakken: Enter verlaat het vak, twee geplakte regels worden één', async ({ page }, info) => {
  test.setTimeout(120_000);
  const stamp = `${info.project.name}-${Date.now().toString(36)}`;
  await signIn(page, KEEPER.name, KEEPER.password);
  const source = await makeEntry(page, `Regels ${stamp}`, 'character', 'Begin');

  await page.goto(`/e/${source.slug}`);
  await editArticle(page);
  const lead = await leadBox(page);
  await expect(lead).toHaveText('Begin');
  await typeInto(page, lead, ' en');
  await page.keyboard.press('Enter');
  await expect(lead).not.toBeFocused();
  await expect(lead).toHaveText('Begin en');

  await lead.click();
  await page.keyboard.press('End');
  await lead.evaluate((el) => {
    const data = new DataTransfer();
    data.setData('text/plain', ' regel een\nregel twee');
    el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }));
  });
  await expect(lead).toHaveText('Begin en regel een regel twee');
  expect(await lead.evaluate((el) => el.querySelectorAll('br:not(.ProseMirror-trailingBreak)').length)).toBe(0);

  await page.keyboard.press('Tab');
  await page.waitForTimeout(2500);
  await page.goto(`/e/${source.slug}`);
  await expect(page.locator('.entry-lead')).toHaveText('Begin en regel een regel twee');
});

test('twee vensters typen live in hetzelfde korte vak', async ({ page }, info) => {
  test.skip(info.project.name === 'phone', 'Eén bewijs is genoeg: de kamer is op beide maten dezelfde.');
  test.setTimeout(150_000);
  const stamp = `${info.project.name}-${Date.now().toString(36)}`;
  await signIn(page, KEEPER.name, KEEPER.password);
  const target = await makeEntry(page, `Doel ${stamp}`);
  const source = await makeEntry(page, `Samen ${stamp}`, 'character', 'Samen');

  const other = await page.context().newPage();
  await page.goto(`/e/${source.slug}`);
  await other.goto(`/e/${source.slug}`);
  await editArticle(page);
  await editArticle(other);
  const mine = await leadBox(page);
  const theirs = await leadBox(other);

  await typeInto(page, mine, ' geschreven');
  await expect(theirs).toHaveText('Samen geschreven', { timeout: 20_000 });

  // A chip made in one window arrives as a chip in the other, with its name.
  await typeInto(other, theirs, ` met @Doel ${stamp}`);
  const list = other.locator('.suggest-list');
  const option = list.getByRole('option').filter({ hasText: `Doel ${stamp}` }).filter({ hasNotText: 'aanmaken' });
  await expect(option).toBeVisible({ timeout: 20_000 });
  await option.dispatchEvent('mousedown');
  await expect(theirs.locator('.short-chip', { hasText: `Doel ${stamp}` })).toBeVisible({ timeout: 20_000 });
  await expect(mine.locator('.short-chip', { hasText: `Doel ${stamp}` })).toBeVisible({ timeout: 20_000 });
  await expect(mine).toContainText('Samen geschreven met');

  await other.keyboard.press('Tab');
  await other.waitForTimeout(2500);
  await other.close();
  await page.goto(`/e/${source.slug}`);
  await expect(page.locator('.entry-lead a.entry-chip')).toHaveAttribute('href', `/e/${target.slug}`, { timeout: 20_000 });
});
