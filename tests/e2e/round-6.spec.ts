import { expect, test, type Page } from '@playwright/test';
import { editArticle, newCaseBoard, newEntryButton, signIn } from './helpers';

/**
 * §23: Nick's round of 5 September, evening.
 *
 * Five separate asks, and one spec, because they share a Keeper and a seeded
 * archive and each of them is short:
 *
 *  1. A card that lands on a case's wall from *anywhere* asks whether it should
 *     go in the file too — the board's own search box always did; "Op het
 *     prikbord" from the artikel page did not.
 *  2. A dossier has two faces, like an artikel.
 *  3. The bin has a bottom.
 *  4. A landkaart and a dossier can go on a wall, as cards.
 *  5. "Betrokken dossiers" links to real dossiers instead of promising fase 2.
 */

const KEEPER = ['Keeper', 'abbeytower34'] as const;

/** Opens a dossier and hands back its path. */
async function openCase(page: Page, name: string) {
  await page.goto('/cases');
  await page.getByRole('button', { name: 'Dossier openen' }).click();
  const sheet = page.getByRole('dialog', { name: 'Dossier openen' });
  await sheet.getByLabel('Naam').fill(name);
  await sheet.getByRole('button', { name: 'Openen', exact: true }).click();
  await page.waitForURL('**/c/**');
  return new URL(page.url()).pathname;
}

/** The dossier's Lezen/Bewerken toggle, which is the artikel's under the hood. */
function faceToggle(page: Page) {
  return page.locator('.entry-mode-toggle');
}

test('a card pinned from the artikel still asks about the dossier', async ({ page }, info) => {
  const stamp = `${info.project.name}-${Date.now().toString(36)}`;
  const caseName = `Losse kaarten ${stamp}`;
  const boardName = `Muur ${stamp}`;

  await signIn(page, ...KEEPER);
  await openCase(page, caseName);

  // A wall that hangs off the dossier, under a name of its own so the sheet on
  // the artikel page can find this one and no other.
  await newCaseBoard(page);
  await page.locator('#board-name').fill(boardName);
  await page.locator('#board-name').blur();

  // Now the long way round: pin from the artikel, not from the wall. This is
  // the path that used to file nothing and say nothing.
  await page.goto('/e/pier-boone');
  await page.getByRole('button', { name: 'Op prikbord prikken' }).click();
  const sheet = page.getByRole('dialog').first();
  await sheet.getByPlaceholder('Zoek een prikbord…').fill(boardName);
  await page.locator('.suggest-item').filter({ hasText: boardName }).first().click();

  // The question the wall has always asked, now asked from here too.
  const ask = page.getByRole('dialog', { name: /Pier Boone zit nog niet in/ });
  await expect(ask).toBeVisible();
  await ask.getByRole('button', { name: /Toevoegen aan/ }).click();
  // The filing itself is a request; wait for its answer before going to look.
  await expect(page.locator('.toast', { hasText: 'toegevoegd aan' })).toBeVisible({ timeout: 10_000 });

  // And it is really in the file.
  await page.goto('/cases');
  await page.getByRole('link', { name: caseName }).first().click();
  await page.waitForURL('**/c/**');
  await expect(page.getByText('Pier Boone').first()).toBeVisible();
});

test('a dossier can be read as well as filled in', async ({ page }, info) => {
  const stamp = `${info.project.name}-${Date.now().toString(36)}`;
  const caseName = `Twee gezichten ${stamp}`;

  await signIn(page, ...KEEPER);
  const path = await openCase(page, caseName);

  // A Keeper lands in editing, so the name is an input and the toggle offers
  // the other face.
  await expect(page.getByLabel('Naam van het dossier')).toHaveValue(caseName);
  await expect(faceToggle(page)).toHaveText('Lezen');

  await faceToggle(page).click();

  // Reading: a heading, and not one thing on the page that asks to be filled in.
  await expect(page.getByRole('heading', { name: caseName })).toBeVisible();
  await expect(page.getByLabel('Naam van het dossier')).toHaveCount(0);
  await expect(page.getByPlaceholder('Voeg iets toe aan dit dossier…')).toHaveCount(0);
  await expect(page.locator('#case-summary')).toHaveCount(0);
  await expect(page.locator('[contenteditable="true"]')).toHaveCount(0);

  // And back again, without leaving the page.
  await expect(faceToggle(page)).toHaveText('Bewerken');
  await faceToggle(page).click();
  await expect(page.getByLabel('Naam van het dossier')).toHaveValue(caseName);
  expect(new URL(page.url()).pathname).toBe(path);
});

test('the bin has a bottom, and it asks for the name first', async ({ page }, info) => {
  const stamp = `${info.project.name}-${Date.now().toString(36)}`;
  const caseName = `Voorgoed weg ${stamp}`;

  await signIn(page, ...KEEPER);
  await openCase(page, caseName);

  // Into the bin the ordinary way, which is a soft delete like every other.
  await page.locator('summary', { hasText: 'Dossier verwijderen' }).click();
  await page.getByRole('button', { name: 'Naar de prullenbak' }).click();
  await page.waitForURL('**/cases**');

  await page.goto('/admin');
  await page.getByRole('tab', { name: /Prullenbak/ }).click();
  const row = page.locator('li').filter({ hasText: caseName }).first();
  await expect(row).toBeVisible();

  await row.getByRole('button', { name: 'Definitief wissen' }).click();

  // The wrong name is refused, and nothing has happened.
  const field = page.getByLabel(/Typ .* over om te bevestigen/);
  await field.fill('iets anders');
  await page.getByRole('button', { name: 'Voorgoed wissen' }).click();
  await expect(page.getByText(/De naam klopt nog niet/)).toBeVisible();

  // The right one is not: the row leaves the bin, and stays gone across a reload.
  await field.fill(caseName);
  await page.getByRole('button', { name: 'Voorgoed wissen' }).click();
  await expect(page.locator('li').filter({ hasText: caseName })).toHaveCount(0);

  await page.reload();
  await page.getByRole('tab', { name: /Prullenbak/ }).click();
  await expect(page.locator('li').filter({ hasText: caseName })).toHaveCount(0);
  // And it is not back among the dossiers either.
  await page.goto('/cases');
  await expect(page.getByText(caseName)).toHaveCount(0);
  await page.goto('/admin');

  // And the audit log says who, and to what.
  await page.getByRole('tab', { name: /Logboek/ }).click();
  await expect(page.getByText(`dossier definitief gewist (${caseName})`)).toBeVisible();
});

test('a dossier goes on a wall as a card', async ({ page }, info) => {
  const stamp = `${info.project.name}-${Date.now().toString(36)}`;
  const caseName = `Kaartdossier ${stamp}`;

  await signIn(page, ...KEEPER);
  await openCase(page, caseName);

  await page.goto('/boards');
  await page.getByRole('button', { name: 'Openbaar prikbord' }).click();
  await page.waitForURL('**/b/**');

  const search = page.getByLabel('Kaart toevoegen');
  await search.fill(caseName);
  await page.locator('.suggest-item').filter({ hasText: caseName }).first().click();

  const card = page.locator('.board-card', { hasText: caseName });
  await expect(card).toBeVisible();
  // It says what it is, which an artikel card does not have to.
  await expect(card.locator('.board-card-kind')).toHaveText(/dossier/i);

  // And it survives a reload as a dossier card, not as a note that looks like one.
  await expect(page.locator('.save-state')).toHaveText(/Opgeslagen|Bewaard/, { timeout: 15_000 });
  await page.reload();
  await expect(page.locator('.board-card', { hasText: caseName }).locator('.board-card-kind')).toHaveText(
    /dossier/i,
  );
});

test('"Betrokken dossiers" links to a real dossier', async ({ page }, info) => {
  const stamp = `${info.project.name}-${Date.now().toString(36)}`;
  const caseName = `Sessiedossier ${stamp}`;
  const entryName = `Sessie ${stamp}`;

  await signIn(page, ...KEEPER);
  await openCase(page, caseName);

  // The seeded "Sessierapporten" soort is the one carrying a dossier field.
  await page.goto('/wiki');
  await newEntryButton(page).click();
  const sheet = page.getByRole('dialog', { name: 'Nieuw artikel' });
  await sheet.getByRole('radio', { name: 'Sessierapporten' }).click();
  await sheet.getByLabel('Naam').fill(entryName);
  await sheet.getByRole('button', { name: 'Aanmaken' }).click();
  await page.waitForURL('**/e/**');
  await editArticle(page);

  // The promise of "fase 2" is gone; there is a picker where it stood.
  await expect(page.getByText(/fase 2/)).toHaveCount(0);
  const picker = page.getByLabel('Betrokken dossiers');
  await picker.click();
  await picker.fill(caseName);
  await page.locator('.suggest-item').filter({ hasText: caseName }).first().click();

  const chip = page.locator(`.entry-chip[data-case-id]`).filter({ hasText: caseName });
  await expect(chip).toBeVisible();

  // It is stored, and it opens the dossier. Wait for the save first: a reload a
  // beat too early would be testing the debounce, not the field.
  await expect(page.locator('.save-state')).toHaveText('Opgeslagen', { timeout: 15_000 });
  await page.reload();
  await editArticle(page);
  await expect(page.locator('.entry-chip[data-case-id]').filter({ hasText: caseName })).toBeVisible();
  await page.locator('.entry-chip[data-case-id]').filter({ hasText: caseName }).click();
  await page.waitForURL('**/c/**');
  await expect(page.getByRole('heading', { name: caseName }).or(page.getByLabel('Naam van het dossier'))).toBeTruthy();
});

test('a landkaart is the map of a place, and goes on a wall as a card', async ({ page }, info) => {
  test.setTimeout(120_000);
  const stamp = `${info.project.name}-${Date.now().toString(36)}`;
  const mapName = `Plattegrond ${stamp}`;

  await signIn(page, ...KEEPER);

  // Hang a landkaart.
  const sharp = (await import('sharp')).default;
  const picture = await sharp({
    create: { width: 800, height: 500, channels: 3, background: '#cfc7ae' },
  })
    .png()
    .toBuffer();

  await page.goto('/maps');
  await page.getByRole('button', { name: 'Landkaart ophangen' }).click();
  const sheet = page.getByRole('dialog', { name: 'Landkaart ophangen' });
  await sheet
    .getByLabel('Afbeelding')
    .setInputFiles({ name: 'plattegrond.png', mimeType: 'image/png', buffer: picture });
  await sheet.getByLabel('Naam').click();
  await page.keyboard.press('Control+a');
  await page.keyboard.type(mapName);
  await sheet.getByRole('button', { name: 'Ophangen' }).click();
  await page.waitForURL('**/maps/**');

  // §23: say which place it draws. A speld says the other thing, and the sheet
  // says so, so the two are not muddled.
  await page.locator('summary', { hasText: /Deze landkaart/ }).click();
  await page.getByLabel(/Van welk artikel/).click();
  await page.getByLabel(/Van welk artikel/).fill('De Schorre');
  await page
    .locator('.suggest-item')
    .filter({ hasText: 'De Schorre' })
    .filter({ hasNotText: 'aanmaken' })
    .first()
    .click();
  await expect(page.locator('.entry-chip', { hasText: 'De Schorre' })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(/De landkaart van/)).toBeVisible({ timeout: 15_000 });

  // The place knows it, from its own page.
  await page.goto('/e/de-schorre');
  // Two chips can name the same landkaart — "uitgetekend op" and "zet op" —
  // because a place can be drawn by a map and still be pinned somewhere on it.
  const drawn = page.getByRole('link', { name: mapName, exact: true });
  await expect(drawn).toBeVisible();
  await drawn.click();
  await page.waitForURL('**/maps/**');
  await expect(page.getByRole('heading', { name: mapName })).toBeVisible();

  // And the landkaart itself goes on a wall, as a card that says what it is.
  await page.goto('/boards');
  await page.getByRole('button', { name: 'Openbaar prikbord' }).click();
  await page.waitForURL('**/b/**');
  await page.getByLabel('Kaart toevoegen').fill(mapName);
  await page.locator('.suggest-item').filter({ hasText: 'Landkaart' }).first().click();

  const card = page.locator('.board-card', { hasText: mapName });
  await expect(card).toBeVisible();
  await expect(card.locator('.board-card-kind')).toHaveText(/landkaart/i);

  // It survives a reload as a landkaart card, and a double-click opens the map.
  await expect(page.locator('.save-state')).toHaveText('Opgeslagen', { timeout: 15_000 });
  await page.reload();
  const again = page.locator('.board-card', { hasText: mapName });
  await expect(again.locator('.board-card-kind')).toHaveText(/landkaart/i);
  await again.locator('.board-card-cover').dblclick();
  await page.waitForURL('**/maps/**');
  await expect(page.getByRole('heading', { name: mapName })).toBeVisible();
});
