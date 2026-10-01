import { mkdirSync } from 'node:fs';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { becomeInvestigator, editArticle, keeperHandsOutSecond, openNewEntry, signIn, signUp } from './helpers';

/**
 * Golf J, j2 — schrijven en zoeken, na de meting na golf I.
 *
 *  1. **Stuk 2a.** De schrijfvraag at *Sectie toevoegen* op: je drukte,
 *     antwoordde, en er was geen sectie. Nu één druk, één antwoord, en de
 *     caret staat in de titel van de nieuwe sectie, in beeld.
 *  2. **Stuk 5.** Na *Aanmaken* op een telefoon staat de tekst boven de
 *     tabbalk, en de `+` wijkt zolang er een caret in staat.
 *  3. **Stuk 6.** Een ding dat heet wat je typt, staat bovenaan — in het palet
 *     en op `/search` — ook als het geen artikel is.
 *  4. **Stuk 7.** De soorten in het maakblad vouwen na hele regels; *Huisraad*
 *     staat zonder *Alle soorten* in beeld, en *Alle soorten* telt de rest.
 *  5. **Raden 7, stuk 11.** Onder de dichte infobox staan altijd de tags, als
 *     chips met een raakvlak van 44 px.
 *  6. **Rij 14 T.** Op de voorpagina van de wiki komen op een telefoon eerst de
 *     soorten.
 */

const KEEPER = ['Keeper', 'abbeytower34'] as const;
const PASSWORD = 'zeewering8';
const SHOTS = '/tmp/claude-0/shots-j2';
mkdirSync(SHOTS, { recursive: true });

const askSheet = (page: Page) => page.getByRole('dialog', { name: 'Met wie ben je nu aan het schrijven?' });

/** Is the middle of this element the element itself (nothing lies over it, it is on the screen)? */
async function reachable(target: Locator): Promise<boolean> {
  return target.evaluate((el) => {
    const box = el.getBoundingClientRect();
    if (box.bottom > window.innerHeight || box.top < 0) return false;
    const hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
    return Boolean(hit && (el === hit || el.contains(hit)));
  });
}

test('1: Sectie toevoegen — één druk, één antwoord, en de caret in de nieuwe titel', async ({ page, browser }, info) => {
  test.setTimeout(240_000);
  const stamp = `${info.project.name.slice(0, 1)}${Date.now().toString(36)}`;
  const account = `Sectie${stamp}`;
  await signUp(page, account, PASSWORD);
  const own = await becomeInvestigator(page, `Nel Sectie ${stamp}`);
  // §106 (H5): one onderzoeker is not a choice. Two, and the window asks.
  await keeperHandsOutSecond(browser, account);

  await page.evaluate(() => window.sessionStorage.clear());
  await page.goto(own);
  await editArticle(page);
  const add = page.getByRole('button', { name: 'Sectie toevoegen' });
  await add.scrollIntoViewIfNeeded();
  await expect(page.getByPlaceholder('Titel van de sectie')).toHaveCount(0);

  await add.click();
  await expect(askSheet(page), 'de knop vraagt eerst').toBeVisible({ timeout: 15_000 });
  await askSheet(page).getByRole('radio').first().click();
  await askSheet(page).waitFor({ state: 'detached', timeout: 15_000 });

  // …en maakt daarna, zonder tweede druk.
  const title = page.getByPlaceholder('Titel van de sectie');
  await expect(title, 'na het antwoord staat de sectie er').toHaveCount(1, { timeout: 15_000 });
  await expect(title, 'met de caret in de titel').toBeFocused({ timeout: 10_000 });
  await expect(async () => expect(await reachable(title)).toBe(true)).toPass({ timeout: 5000 });
  await page.keyboard.type(`Nachtwacht ${stamp}`);
  await expect(title).toHaveValue(`Nachtwacht ${stamp}`);
  await page.screenshot({ path: `${SHOTS}/e2e-sectie-${info.project.name}.png` });

  // Weghalen vraagt niets meer (het venster heeft geantwoord) en doet het in één keer.
  await page.getByRole('button', { name: `Sectie Nachtwacht ${stamp} verwijderen` }).click();
  await expect(title).toHaveCount(0, { timeout: 10_000 });
});

test('2: na Aanmaken staat wat je typt in beeld, boven de tabbalk', async ({ page }, info) => {
  test.setTimeout(150_000);
  const stamp = `${info.project.name.slice(0, 1)}${Date.now().toString(36)}`;
  await signIn(page, ...KEEPER);
  const sheet = await openNewEntry(page);
  await sheet.getByLabel('Naam', { exact: true }).fill(`Schrijfplek ${stamp}`);
  await sheet.getByRole('button', { name: 'Aanmaken', exact: true }).click();
  await page.waitForURL('**/e/**');

  const body = page.locator('.entry-body-block [contenteditable="true"]');
  await expect(body, '§90: de caret staat in de tekst').toBeFocused({ timeout: 15_000 });
  const box = (await body.boundingBox())!;
  const tabs = page.locator('.tabs');
  const coverTop = (await tabs.isVisible()) ? (await tabs.boundingBox())!.y : page.viewportSize()!.height;
  expect(box.y + 60, 'de eerste regels staan boven de tabbalk').toBeLessThanOrEqual(coverTop);
  expect(box.y).toBeGreaterThanOrEqual(0);

  await page.keyboard.type(`Eerste zin ${stamp}.`);
  await expect(body).toContainText(`Eerste zin ${stamp}.`);
  if (info.project.name === 'phone') {
    // Wie typt, heeft de + niet nodig: hij ligt niet over de werkbalk.
    await expect(page.locator('.fab')).toHaveCSS('opacity', '0', { timeout: 5000 });
    await expect(page.locator('.fab')).toHaveCSS('pointer-events', 'none');
    // Golf J (j5): na de uitgang is hij ook echt weg, niet alleen doorzichtig.
    await expect(page.locator('.fab')).toBeHidden({ timeout: 5000 });
  }
  await page.screenshot({ path: `${SHOTS}/e2e-aanmaken-${info.project.name}.png` });
});

test('3: een ding dat heet wat je typt, staat bovenaan', async ({ page }, info) => {
  test.setTimeout(180_000);
  const stamp = `${info.project.name.slice(0, 1)}${Date.now().toString(36)}`;
  const word = `Kwelderpad${stamp}`;
  await signIn(page, ...KEEPER);
  // A dossier called exactly that, and four artikelen that only carry the word later in their name.
  const made = await page.request.post('/api/cases', { data: { name: word } });
  expect(made.ok()).toBeTruthy();
  for (const name of [`Over het ${word}`, `Langs het ${word}`, `Aan het ${word} gevonden`, `Sporen op ${word}`]) {
    const entry = await page.request.post('/api/entries', { data: { typeSlug: 'location', name } });
    expect(entry.ok()).toBeTruthy();
  }

  if (info.project.name !== 'phone') {
    await page.goto('/wiki');
    const palette = page.getByTestId('palette');
    // §6: a key right after a `goto` can land before the shell listens; press until it answers.
    await expect(async () => {
      if (!(await palette.isVisible().catch(() => false))) await page.keyboard.press('Control+k');
      await expect(palette).toBeVisible({ timeout: 1500 });
    }).toPass({ timeout: 20_000 });
    await page.getByTestId('palette-input').fill(word);
    const first = palette.getByRole('option').first();
    await expect(first, 'het dossier staat op plek één').toContainText(word, { timeout: 20_000 });
    await expect(first).toHaveAttribute('data-option', /^other-case-/);
    await expect(palette.locator('[data-group="entries"]').getByRole('option')).toHaveCount(4);
    expect(await reachable(first)).toBe(true);
    await page.screenshot({ path: `${SHOTS}/e2e-palet-${info.project.name}.png` });
    await page.keyboard.press('Enter');
    await page.waitForURL('**/c/**');
  } else {
    await page.goto(`/search?q=${encodeURIComponent(word)}`);
    const others = page.getByRole('main').getByTestId('search-others');
    await expect(others).toBeVisible({ timeout: 20_000 });
    const firstRow = page.getByRole('main').locator('section a[href]').first();
    await expect(firstRow, 'het dossier is de eerste treffer').toHaveAttribute('href', /^\/c\//);
    expect(await reachable(firstRow)).toBe(true);
    await page.screenshot({ path: `${SHOTS}/e2e-zoeken-${info.project.name}.png` });
  }
});

test('4: de soorten in het maakblad vouwen na hele regels, Huisraad in beeld', async ({ page }, info) => {
  test.setTimeout(120_000);
  await signIn(page, ...KEEPER);
  await page.goto('/');
  const sheet = await openNewEntry(page);
  const strip = sheet.locator('.new-entry-types-strip');
  const huisraad = sheet.getByRole('radio', { name: 'Huisraad', exact: true });
  await expect(huisraad).toBeVisible({ timeout: 15_000 });
  await expect(strip).toHaveAttribute('data-folded', 'ja');
  // No sideways scroll any more, and the seventh soort without *Alle soorten*.
  expect(await strip.evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
  await expect(async () => expect(await reachable(huisraad)).toBe(true)).toPass({ timeout: 5000 });
  const more = sheet.getByRole('button', { name: /Alle soorten/ });
  await expect(more.locator('.new-entry-types-rest')).toHaveText(/^\+\d+$/);
  // Whole rows only: every chip is either wholly inside the strip or wholly under the fold.
  const cut = await strip.evaluate((el) => {
    const s = el.getBoundingClientRect();
    return [...el.querySelectorAll('[role="radio"]')].filter((chip) => {
      const c = chip.getBoundingClientRect();
      return c.top < s.bottom && c.bottom > s.bottom + 1;
    }).length;
  });
  expect(cut, 'geen chip hangt half onder de vouw').toBe(0);
  await page.screenshot({ path: `${SHOTS}/e2e-maakblad-${info.project.name}.png` });

  await huisraad.click();
  await expect(sheet.getByTestId('new-entry-winkel')).toBeVisible();
  await more.click();
  await expect(strip).not.toHaveAttribute('data-folded', 'ja');
  await expect(sheet.getByRole('radio', { name: 'Sessierapporten', exact: true })).toBeVisible();
  expect(await reachable(sheet.getByRole('radio', { name: 'Sessierapporten', exact: true }))).toBe(true);
});

test('5: onder de dichte infobox staan altijd de tags, met een raakvlak van 44 px', async ({ page }, info) => {
  test.skip(info.project.name !== 'phone', 'de infobox vouwt alleen op een telefoon');
  test.setTimeout(120_000);
  const stamp = Date.now().toString(36);
  await signIn(page, ...KEEPER);
  const made = await page.request.post('/api/entries', {
    data: { typeSlug: 'character', name: `Getagd ${stamp}`, tags: ['ai'] },
  });
  expect(made.ok()).toBeTruthy();
  const { entry } = (await made.json()) as { entry: { slug: string } };
  await page.goto(`/e/${entry.slug}`);
  const tags = page.getByTestId('infobox-peek-tags');
  await expect(tags).toBeVisible({ timeout: 20_000 });
  const chip = tags.locator('a.tag', { hasText: /^ai$/ });
  await expect(chip).toHaveAttribute('href', /\/wiki\/character\?tag=ai/);
  await chip.scrollIntoViewIfNeeded();
  // The rim: 20 px above and below the middle, and 20 px left and right, still the chip.
  const hits = await chip.evaluate((el) => {
    const b = el.getBoundingClientRect();
    const cx = b.x + b.width / 2;
    const cy = b.y + b.height / 2;
    return [
      [cx, cy - 20],
      [cx, cy + 20],
      [cx - 20, cy],
      [cx + 20, cy],
    ].map(([x, y]) => {
      const hit = document.elementFromPoint(x, y);
      return Boolean(hit && (hit === el || el.contains(hit)));
    });
  });
  expect(hits).toEqual([true, true, true, true]);
  await page.screenshot({ path: `${SHOTS}/e2e-tags-${info.project.name}.png` });
});

test('6 → golf O: de voorpagina van de wiki is de tabrij en het overzicht, verder niets', async ({ page }, info) => {
  test.setTimeout(90_000);
  await signIn(page, ...KEEPER);
  await page.goto('/wiki');
  // Golf O (Nick: "everything below De wiki, start, welcome text needs to go"):
  // de leeskamer van ronde 67 is weg; de soorten zijn tabs (golf N).
  await expect(page.locator('.type-tabs-rij')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId('leeskamer')).toHaveCount(0);
  await expect(page.getByTestId('soort-tegel')).toHaveCount(0);
  await page.screenshot({ path: `${SHOTS}/e2e-wiki-${info.project.name}.png`, fullPage: true });
});
