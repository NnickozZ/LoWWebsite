import { expect, test, type Page } from '@playwright/test';
import { becomeInvestigator, editArticle, fillWhenReady, inviteCode, openRights, signIn } from './helpers';

/**
 * Phase 3 (§9–§11) beyond golden flow 5: entry-level visibility and its leaks,
 * the review queue for locked entries, the trash, the entry-type editor, site
 * settings and the export.
 */

async function newEntry(page: Page, typeSlug: string, name: string) {
  await page.goto(`/wiki/${typeSlug}`);
  await page.getByRole('button', { name: 'Nieuw', exact: true }).click();
  const sheet = page.getByRole('dialog', { name: 'Nieuw artikel' });
  await sheet.getByLabel('Naam', { exact: true }).fill(name);
  await sheet.getByRole('button', { name: 'Aanmaken' }).click();
  await page.waitForURL('**/e/**');
  return new URL(page.url()).pathname;
}

/*
 * §18b: proposing an edit is writing, so a player who is going to propose one
 * makes their onderzoeker first — the artikel a speler with nobody is allowed
 * to make, tied on as themselves.
 */
async function signUpWriting(page: Page, name: string) {
  await signUpPlayer(page, name);
  await becomeInvestigator(page, `Onderzoeker ${name}`);
}

/**
 * §22: "Meer info" is a card beside the text on a desktop and a folded block on
 * anything narrower, so a test that fills a field has to open it first — on the
 * one viewport where it is shut.
 */
async function unfoldInfobox(page: Page) {
  const folded = page.locator('details#block-info:not([open]) > summary');
  if (await folded.count()) await folded.click();
}

async function signUpPlayer(page: Page, name: string, password = 'duikerklok') {
  await page.goto('/signup');
  await page.getByLabel('Uitnodigingscode').fill(inviteCode());
  await page.getByLabel('Naam', { exact: true }).fill(name);
  await page.getByLabel('Wachtwoord', { exact: true }).fill(password);
  await page.getByLabel('Wachtwoord nogmaals').fill(password);
  await page.getByRole('button', { name: 'Account aanmaken' }).click();
  await page.waitForURL('**/');
}

test('a Keeper-only entry leaks nowhere', async ({ page, browser }, testInfo) => {
  const stamp = `${testInfo.project.name}-${Date.now().toString(36)}`;
  const secret = `Het Zoutgat ${stamp}`;

  await signIn(page, 'Keeper', 'abbeytower34');
  const url = await newEntry(page, 'location', secret);
  await fillWhenReady(page.getByLabel('Korte beschrijving'), 'Waar het water vandaan komt.');
  await page.getByLabel('Korte beschrijving').blur();

  await openRights(page);
  await page.getByRole('button', { name: 'Alleen de Keeper' }).click();
  await expect(page.locator('.stamp', { hasText: 'Alleen voor de Keeper' })).toBeVisible();
  await expect(page.locator('.save-state')).toHaveText('Opgeslagen', { timeout: 15_000 });

  const context = await browser.newContext();
  const player = await context.newPage();
  await signUpPlayer(player, `Speler ${stamp}`);

  // Not at its own URL…
  await player.goto(url);
  await expect(player.getByText('404')).toBeVisible();

  // …not in the wiki, not in search, not in the home feed.
  await player.goto('/wiki/location');
  await expect(player.getByText(secret)).toHaveCount(0);
  await player.goto('/search');
  await player.getByLabel('Zoeken in het archief').fill('Zoutgat');
  await player.waitForTimeout(700);
  expect(await player.content()).not.toContain(secret);
  await player.goto('/');
  expect(await player.content()).not.toContain(secret);

  // The Keeper still sees it, stamped — on the Keeper's side of the archive
  // (§46): the players' side of the wiki is exactly what the players see, so
  // the Keeper turns the archive over first.
  await page.goto('/api/keeper/flip?side=keeper&to=/wiki/location');
  await expect(page.getByText(secret).first()).toBeVisible();

  await context.close();
});

test('a locked entry sends a player edit to the review queue', async ({ page, browser }, testInfo) => {
  const stamp = `${testInfo.project.name}-${Date.now().toString(36)}`;
  const entryName = `Het Gemaal ${stamp}`;
  const playerName = `Voorsteller ${stamp}`;

  await signIn(page, 'Keeper', 'abbeytower34');
  const url = await newEntry(page, 'location', entryName);
  await fillWhenReady(page.getByLabel('Korte beschrijving'), 'Pompt sinds de drift de verkeerde kant op.');
  await page.getByLabel('Korte beschrijving').blur();
  await expect(page.locator('.save-state')).toHaveText('Opgeslagen', { timeout: 15_000 });

  await openRights(page);
  await page.getByRole('button', { name: 'Open voor iedereen' }).click();
  await expect(page.locator('.chip', { hasText: 'Vergrendeld' }).first()).toBeVisible();
  await expect(page.locator('.save-state')).toHaveText('Opgeslagen', { timeout: 15_000 });

  // The player edits it, and is told where the edit went.
  const context = await browser.newContext();
  const player = await context.newPage();
  await signUpWriting(player, playerName);
  await player.goto(url);
  // §22: a player lands on the reading face; editing a locked artikel is the
  // thing under test, so ask for the face that can.
  await editArticle(player);
  // A plain fill: this page has already answered a click (`editArticle`), so
  // React is behind its inputs — and a second fill here would be a second
  // voorstel in the queue.
  await player.getByLabel('Korte beschrijving').fill('Pompt zout water het land in.');
  await player.getByLabel('Korte beschrijving').blur();
  await expect(player.locator('.toast', { hasText: 'ter beoordeling' })).toBeVisible();

  // The entry itself is untouched.
  await page.reload();
  await expect(page.getByLabel('Korte beschrijving')).toHaveValue(
    'Pompt sinds de drift de verkeerde kant op.',
  );

  // The queue shows the proposal side by side, and approving applies it.
  await page.goto('/admin');
  await page.getByRole('tab', { name: 'Beoordelen' }).click();
  const card = page.locator('.review-card', { hasText: entryName });
  await expect(card).toBeVisible();
  await expect(card.locator('.review-before')).toContainText('de verkeerde kant op');
  await expect(card.locator('.review-after')).toContainText('zout water het land in');

  await card.getByRole('textbox').fill('Klopt, dank.');
  await card.getByRole('button', { name: 'Goedkeuren' }).click();

  await page.goto(url);
  // §22: a Keeper lands on the reading face too, and this reads the *input*.
  await editArticle(page);
  await expect(page.getByLabel('Korte beschrijving')).toHaveValue('Pompt zout water het land in.');

  // And the author reads the outcome, with the note, on their own page.
  await player.goto('/you');
  const proposal = player.locator('li', { hasText: entryName });
  await expect(proposal).toContainText('Goedgekeurd');
  await expect(proposal).toContainText('Klopt, dank.');

  await context.close();
});

test('the trash gives an entry back', async ({ page }, testInfo) => {
  const stamp = `${testInfo.project.name}-${Date.now().toString(36)}`;
  const entryName = `Verdwenen Boei ${stamp}`;

  await signIn(page, 'Keeper', 'abbeytower34');
  const url = await newEntry(page, 'object', entryName);

  await page.locator('summary', { hasText: 'Dit artikel verwijderen' }).click();
  await page.getByRole('button', { name: 'Naar de prullenbak' }).click();
  await page.waitForURL((candidate) => !candidate.pathname.startsWith('/e/'));

  await page.goto('/admin');
  await page.getByRole('tab', { name: 'Prullenbak' }).click();
  const row = page.locator('li', { hasText: entryName });
  await expect(row).toBeVisible();
  await row.getByRole('button', { name: 'Terugzetten' }).click();

  await page.goto(url);
  // §22: back from the prullenbak on the reading face; the name box is on the
  // other one.
  await editArticle(page);
  await expect(page.getByLabel('Naam', { exact: true })).toHaveValue(entryName);
});

test('the Keeper can add a type, give it a field, and use it', async ({ page }, testInfo) => {
  const stamp = Date.now().toString(36).slice(-4);
  const typeName = `Schepen ${stamp}`;

  await signIn(page, 'Keeper', 'abbeytower34');
  await page.goto('/admin');
  await page.getByRole('tab', { name: 'Soorten artikelen' }).click();

  await page.getByLabel('Naam van de nieuwe soort').fill(typeName);
  await page.getByRole('button', { name: 'Soort aanmaken' }).click();

  // Scoped by the summary, not by the whole card: since §11's page builder,
  // every type editor lists every *other* soort as a chip — that is how a
  // self-filling list picks what to look through — so "the card mentioning this
  // name" now matches several. The card whose *heading* is this name is one.
  const editor = page
    .locator('details.admin-type')
    .filter({ has: page.locator('summary', { hasText: typeName }) });
  await expect(editor).toBeVisible();
  await editor.locator('summary').click();
  await editor.getByRole('button', { name: 'Veld toevoegen' }).click();
  await editor.getByLabel('Naam van veld 1').fill('Tonnage');
  await editor.getByRole('button', { name: 'Opslaan', exact: true }).click();

  // The new type is a chip in the New entry sheet, and its field is on the page.
  await page.goto('/wiki');
  await page.getByRole('button', { name: 'Nieuw artikel' }).locator('visible=true').first().click();
  const sheet = page.getByRole('dialog', { name: 'Nieuw artikel' });
  await sheet.getByRole('radio', { name: typeName }).click();
  await sheet.getByLabel('Naam', { exact: true }).fill(`De Zeearend ${stamp}`);
  await sheet.getByRole('button', { name: 'Aanmaken' }).click();
  await page.waitForURL('**/e/**');
  await expect(page.getByLabel('Tonnage')).toBeVisible();
});

/**
 * §38: the details panel is genuinely typed. A Getal is a number, a Ja/nee is a
 * tick, and a Meerkeuze is the Keeper's own list of answers — so this walks the
 * whole road once: the Keeper defines them, a player is offered exactly those
 * controls and exactly those options, and the reading face prints a number in
 * Dutch, a "Ja", and chips.
 */
test('a Getal, a Ja/nee and a Meerkeuze, from the type editor to the reading face', async ({
  page,
  browser,
}, testInfo) => {
  const stamp = `${testInfo.project.name}-${Date.now().toString(36)}`.slice(-6);
  const typeName = `Vrachten ${stamp}`;

  await signIn(page, 'Keeper', 'abbeytower34');
  await page.goto('/admin');
  await page.getByRole('tab', { name: 'Soorten artikelen' }).click();
  await page.getByLabel('Naam van de nieuwe soort').fill(typeName);
  await page.getByRole('button', { name: 'Soort aanmaken' }).click();

  const editor = page
    .locator('details.admin-type')
    .filter({ has: page.locator('summary', { hasText: typeName }) });
  await expect(editor).toBeVisible();
  await editor.locator('summary').click();

  for (const [index, label, kind] of [
    [1, 'Tonnage', 'Getal'],
    [2, 'Vermist', 'Ja/nee'],
    [3, 'Lading', 'Meerkeuze'],
  ] as const) {
    await editor.getByRole('button', { name: 'Veld toevoegen' }).click();
    await editor.getByLabel(`Naam van veld ${index}`).fill(label);
    await editor.getByLabel(`Soort van veld ${index}`).selectOption({ label: kind });
  }
  // A Meerkeuze is configured with the same box a Keuzelijst has.
  await editor.getByLabel('Keuzes van veld 3').fill('zout, graan, kolen');
  await editor.getByRole('button', { name: 'Opslaan', exact: true }).click();

  await page.goto('/wiki');
  await page.getByRole('button', { name: 'Nieuw artikel' }).locator('visible=true').first().click();
  const sheet = page.getByRole('dialog', { name: 'Nieuw artikel' });
  await sheet.getByRole('radio', { name: typeName }).click();
  await sheet.getByLabel('Naam', { exact: true }).fill(`De Vrachtboot ${stamp}`);
  await sheet.getByRole('button', { name: 'Aanmaken' }).click();
  await page.waitForURL('**/e/**');
  const url = new URL(page.url()).pathname;
  await unfoldInfobox(page);

  // Three controls, and each of them the right *kind* of control.
  await expect(page.getByLabel('Tonnage')).toHaveAttribute('type', 'number');
  await expect(page.getByLabel('Vermist')).toHaveAttribute('type', 'checkbox');
  const lading = page.getByRole('group', { name: 'Lading' });
  // Exactly the Keeper's three answers, and no way to write a fourth.
  await expect(lading.getByRole('checkbox')).toHaveCount(3);

  await page.getByLabel('Tonnage').fill('1400');
  await page.getByLabel('Tonnage').blur();
  await page.getByLabel('Vermist').check();
  await lading.getByRole('checkbox', { name: 'zout' }).check();
  await lading.getByRole('checkbox', { name: 'kolen' }).check();
  await expect(page.locator('.save-state')).toHaveText('Opgeslagen', { timeout: 15_000 });

  /*
   * §22 on the reading face: a number is printed the way Dutch reads one, a
   * `true` becomes "Ja" — and a `false` becomes no row at all, which is why
   * "Vermist" is here and nothing says "Nee" anywhere.
   */
  async function expectPrinted(reader: Page) {
    const rows = reader.locator('#block-info .fields-view > div');
    const value = (label: string) => rows.filter({ hasText: label }).locator('.field-value');
    await expect(value('Tonnage')).toHaveText('1.400');
    await expect(value('Vermist')).toHaveText('Ja');
    const chips = value('Lading').locator('.entry-chip');
    await expect(chips).toHaveCount(2);
    await expect(chips).toHaveText(['zout', 'kolen']);
    await expect(reader.locator('#block-info')).not.toContainText('graan');
  }

  await page.locator('.entry-mode-toggle').click();
  await expectPrinted(page);

  // And a player, who was never told any of this, reads the same page and is
  // offered the same three controls with the same three answers.
  const context = await browser.newContext();
  const player = await context.newPage();
  await signUpPlayer(player, `Vrachtlezer ${stamp}`);
  await player.goto(url);
  await expectPrinted(player);

  await player.locator('.entry-mode-toggle').click();
  await unfoldInfobox(player);
  await expect(player.getByLabel('Tonnage')).toHaveValue('1400');
  await expect(player.getByLabel('Vermist')).toBeChecked();
  await expect(player.getByRole('group', { name: 'Lading' }).getByRole('checkbox')).toHaveCount(3);
  await expect(
    player.getByRole('group', { name: 'Lading' }).getByRole('checkbox', { name: 'graan' }),
  ).not.toBeChecked();
  await context.close();
});

/**
 * §38 with §35: a date the archive cannot read is still a date somebody means.
 * The box says so, quietly — and saves it anyway.
 */
test('an unreadable Datum is hinted at, not refused', async ({ page }) => {
  await signIn(page, 'Keeper', 'abbeytower34');
  const url = await newEntry(page, 'event', `De storm ${Date.now().toString(36).slice(-4)}`);
  await editArticle(page);
  await unfoldInfobox(page);

  // The seeded soort Gebeurtenissen calls its Datum "Datum (in de wereld)".
  const box = page.locator('#field-date');
  const hint = page.getByText('Dit lezen we niet als datum');

  await fillWhenReady(box, 'ergens in de zomer');
  await box.blur();
  await expect(hint).toBeVisible();
  await expect(page.locator('.save-state')).toHaveText('Opgeslagen', { timeout: 15_000 });

  // The hint is a hint: the value is stored exactly as typed and comes back.
  await page.goto(url);
  await editArticle(page);
  await unfoldInfobox(page);
  await expect(box).toHaveValue('ergens in de zomer');
  await expect(hint).toBeVisible();

  // A date the archive *can* read says nothing at all.
  await fillWhenReady(box, '14 oktober 1934');
  await box.blur();
  await expect(hint).toHaveCount(0);
});

test('site settings rename the archive, and the export downloads', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === 'phone', 'one viewport is enough for a download');

  await signIn(page, 'Keeper', 'abbeytower34');
  await page.goto('/admin');
  await page.getByRole('tab', { name: 'Site' }).click();

  await page.getByLabel('Ondertitel').fill('Archief van het Eiland');
  // The welcome on Start is the Keeper's to write (5 Sep 2026); a blank line
  // starts a new paragraph.
  await page.getByLabel('Welkomsttekst op de startpagina').fill('Welkom, onderzoekers.\n\nLees eerst het dossier.');
  await page.getByRole('button', { name: 'Opslaan' }).click();
  await expect(page.locator('.masthead-tagline')).toHaveText('Archief van het Eiland');
  await page.goto('/');
  const welcome = page.locator('.home-welcome');
  await expect(welcome.getByRole('heading', { level: 1 })).toHaveText('Zeeland Case Files');
  await expect(welcome.locator('.home-intro p')).toHaveCount(2);
  await expect(welcome.locator('.home-intro p').first()).toHaveText('Welkom, onderzoekers.');
  await expect(welcome.locator('.home-numbers')).toContainText('artikel');
  // …and cleared again, the archive's own words come back.
  await page.goto('/admin?tab=site');
  await page.getByLabel('Welkomsttekst op de startpagina').fill('');
  await page.getByRole('button', { name: 'Opslaan' }).click();
  await page.waitForTimeout(400);
  await page.goto('/');
  await expect(page.locator('.home-intro')).toContainText('Welkom in het archief');

  await page.goto('/admin');
  await page.getByRole('tab', { name: 'Export' }).click();
  const download = page.waitForEvent('download');
  await page.getByRole('link', { name: 'Alles downloaden' }).click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/^zeeland-.*\.zip$/);
});
