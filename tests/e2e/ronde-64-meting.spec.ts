import { expect, test, type Browser, type Locator, type Page } from '@playwright/test';
import {
  becomeInvestigator,
  editArticle,
  editCanvas,
  keeperHandsOutSecond,
  newBoard,
  openNewEntry,
  signIn,
  signUp,
} from './helpers';

/**
 * §101, ronde 64 — wat de handelingsmeting na golf 3 vond.
 *
 *  1. **De schrijfvraag at de handeling op die hem opriep.** Op elk van de vier
 *     vlakken: je drukt op een maakknop, §18b's vraag springt ervoor, je
 *     antwoordt — en er is niets gebeurd. De vraag is een blad dat in dezelfde
 *     commit verschijnt als de `pointerdown`, dus de `click` erna landt op de
 *     achtergrond. Gemeten: **2** drukken waar er **1** beloofd was. Elke
 *     maakknop vraagt nu vóóraf (`useCanvasMaker` → `ensureAuthor`).
 *  2. *Legenda* vroeg mee, terwijl hij alleen filtert (`AUTHOR_GATE_OFF`).
 *  3. **Escape** sluit de vraag: annuleren, niets gemaakt, de caret terug op de
 *     knop die hem opriep.
 *  4. **Tab** gaat van de titel van een sectie naar de tekst van diezelfde
 *     sectie, en niet langs vier knoppen.
 *  5. De **stamboomcamera** blijft staan na *+ Ouder*.
 *
 * De telling staat in de uitvoer (`console.log`), want dat is het bewijs dat
 * dit over handelingen gaat en niet over gevoel.
 */

const KEEPER = ['Keeper', 'abbeytower34'] as const;
const PASSWORD = 'zeewering8';

/** Het blad dat §18b voor iemand zet die nog niet gezegd heeft wie hij is. */
const askSheet = (page: Page) => page.getByRole('dialog', { name: 'Met wie ben je nu aan het schrijven?' });

/** Eén antwoord: de eerste onderzoeker in de lijst. */
async function answer(page: Page) {
  await askSheet(page).getByRole('radio').first().click();
  await askSheet(page).waitFor({ state: 'detached', timeout: 15_000 });
}

/**
 * Een venster dat de vraag weer schuldig is. Het antwoord leeft zolang het
 * venster leeft (`sessionStorage`), dus leeggooien en opnieuw binnenkomen is
 * precies wat een tweede tabblad doet.
 */
async function forget(page: Page, path: string) {
  await page.evaluate(() => window.sessionStorage.clear());
  await page.goto(path);
}

/** Staat dit er, binnen de tijd? Zonder de test rood te maken als het er niet staat. */
function appears(target: Locator, timeout = 3000): Promise<boolean> {
  return target
    .first()
    .waitFor({ state: 'visible', timeout })
    .then(() => true)
    .catch(() => false);
}

/**
 * Hoeveel keer moet deze knop ingedrukt worden voordat hij doet wat hij
 * belooft? Eén, sinds deze ronde. Twee, daarvoor — dat getal staat in het
 * rapport van de meting.
 */
async function presses(page: Page, button: Locator, done: Locator, max = 3): Promise<number> {
  for (let n = 1; n <= max; n++) {
    await button.click({ timeout: 10_000 }).catch(() => undefined);
    if (await appears(askSheet(page), 2500)) await answer(page);
    if (await appears(done, 4000)) return n;
  }
  return max + 1;
}

async function picture(): Promise<Buffer> {
  const sharp = (await import('sharp')).default;
  return sharp({ create: { width: 900, height: 600, channels: 3, background: '#cdc3a6' } })
    .png()
    .toBuffer();
}

/** De vier vlakken, openbaar gemaakt door de Keeper in een eigen venster. */
async function keeperMakesFour(browser: Browser, stamp: string): Promise<Record<string, string>> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await signIn(page, ...KEEPER);
  const out: Record<string, string> = {};

  await page.goto('/boards');
  await newBoard(page, { name: `Kurk 64 ${stamp}` });
  out.prikbord = new URL(page.url()).pathname;

  await page.goto('/stambomen');
  await page.getByRole('button', { name: /Nieuwe stamboom/ }).click();
  await page
    .getByRole('dialog', { name: /Nieuwe stamboom/ })
    .getByRole('button', { name: /Openbare stamboom/ })
    .click();
  await page.waitForURL('**/stambomen/**');
  out.stamboom = new URL(page.url()).pathname;

  await page.goto('/timelines');
  await page.getByRole('button', { name: /Nieuwe tijdlijn/ }).click();
  await page
    .getByRole('dialog', { name: /Nieuwe tijdlijn/ })
    .getByRole('button', { name: /Openbare tijdlijn/ })
    .click();
  await page.waitForURL('**/timelines/**');
  out.tijdlijn = new URL(page.url()).pathname;

  await page.goto('/maps');
  await page.getByRole('button', { name: 'Landkaart ophangen' }).click();
  const sheet = page.getByRole('dialog', { name: 'Landkaart ophangen' });
  await sheet
    .getByLabel('Afbeelding')
    .setInputFiles({ name: 'kust.png', mimeType: 'image/png', buffer: await picture() });
  await sheet.getByLabel('Naam', { exact: true }).click();
  await page.keyboard.press('Control+a');
  await page.keyboard.type(`Kust 64 ${stamp}`);
  await sheet.getByRole('button', { name: 'Ophangen' }).click();
  await page.waitForURL('**/maps/**');
  out.landkaart = new URL(page.url()).pathname;
  /*
   * Golf M: a landkaart is hung Privé to edit, and on a Privé landkaart a
   * speler only looks — no Bewerken, no *Speld zetten*. The other three are
   * made openbaar; this one is turned up to Iedereen the same way, so the
   * speler below has a maker to press on all four.
   */
  const slug = out.landkaart.split('/maps/')[1];
  const list = (await (await page.request.get('/api/maps')).json()) as { maps: { id: string; slug: string }[] };
  const mapId = list.maps.find((m) => m.slug === slug)!.id;
  const opened = await page.request.patch(`/api/access?target=map&id=${mapId}`, { data: { editMode: 'all' } });
  expect(opened.ok()).toBe(true);

  await context.close();
  return out;
}

/** Per vlak: de maakknop, en waaraan je ziet dat hij gedaan heeft wat hij zei. */
function maker(page: Page, vlak: string): { button: Locator; done: Locator } {
  if (vlak === 'prikbord') {
    return {
      button: page.getByRole('button', { name: 'Nieuwe notitie', exact: true }),
      done: page.locator('.board-card'),
    };
  }
  if (vlak === 'stamboom') {
    return { button: page.getByTestId('tree-add-loose'), done: page.locator('[data-testid="tree-node"]') };
  }
  if (vlak === 'tijdlijn') {
    return { button: page.getByTestId('timeline-add'), done: page.getByRole('dialog', { name: /Gebeurtenis op/ }) };
  }
  return {
    button: page.getByRole('button', { name: 'Speld zetten' }),
    done: page.locator('.map-stage-placing'),
  };
}

test('1: één druk op een maakknop, op elk van de vier vlakken', async ({ page, browser }, info) => {
  test.setTimeout(420_000);
  const stamp = `${info.project.name}-${Date.now().toString(36)}`;
  const paths = await keeperMakesFour(browser, stamp);

  await signUp(page, `Teller ${stamp}`, PASSWORD);
  await becomeInvestigator(page, `Tellerske ${stamp}`);

  const counted: Record<string, number> = {};
  for (const [vlak, path] of Object.entries(paths)) {
    // Elk vlak in een venster dat de vraag weer schuldig is: de vraag komt
    // één keer per venster, en dit is die ene keer.
    await forget(page, path);
    await editCanvas(page);
    const { button, done } = maker(page, vlak);
    await expect(button, `${vlak}: de maakknop staat er`).toBeVisible({ timeout: 20_000 });
    counted[vlak] = await presses(page, button, done);
    expect(counted[vlak], `${vlak}: één druk, niet twee`).toBe(1);
  }
  console.log(`[ronde 64] drukken per maakknop: ${JSON.stringify(counted)}`);
});

test('2: Legenda is geen schrijfhandeling', async ({ page, browser }, info) => {
  test.setTimeout(240_000);
  const stamp = `${info.project.name}-${Date.now().toString(36)}`;
  const paths = await keeperMakesFour(browser, stamp);

  await signUp(page, `Kijker 64 ${stamp}`, PASSWORD);
  await becomeInvestigator(page, `Kijkster 64 ${stamp}`);
  await forget(page, paths.landkaart);
  await editCanvas(page);

  // Op een telefoon staat hij in de werkbalk; op een bureau is het de
  // ingeklapte `.map-legend-toggle` op het glas. Allebei heten ze Legenda.
  const legend = page.getByRole('button', { name: 'Legenda' }).locator('visible=true').first();
  await expect(legend).toBeVisible({ timeout: 20_000 });
  await legend.click();
  await page.waitForTimeout(700);
  expect(await askSheet(page).count(), 'de legenda vraagt niet wie er schrijft').toBe(0);
  // En hij is echt opengeklapt: de klik is niet opgegeten.
  await expect(page.locator('.map-legend-body')).toBeVisible();
});

test('3: Escape annuleert de schrijfvraag, en maakt niets', async ({ page, browser }, info) => {
  test.setTimeout(240_000);
  const stamp = `${info.project.name}-${Date.now().toString(36)}`;
  const paths = await keeperMakesFour(browser, stamp);

  await signUp(page, `Wegloper ${stamp}`, PASSWORD);
  await becomeInvestigator(page, `Weglopertje ${stamp}`);
  // §106 (na review 4, H5): one onderzoeker is not asked; two are.
  await keeperHandsOutSecond(browser, `Wegloper ${stamp}`);
  await forget(page, paths.stamboom);
  await editCanvas(page);

  const button = page.getByTestId('tree-add-loose');
  await expect(button).toBeVisible({ timeout: 20_000 });
  await button.click();
  await expect(askSheet(page)).toBeVisible({ timeout: 15_000 });

  await page.keyboard.press('Escape');
  await expect(askSheet(page)).toHaveCount(0, { timeout: 10_000 });
  // Niets gemaakt.
  await expect(page.locator('[data-testid="tree-node"]')).toHaveCount(0);
  // En de caret staat terug op de knop die hem opriep.
  await expect(button).toBeFocused({ timeout: 10_000 });

  // Nog een keer drukken werkt gewoon: annuleren is geen deur die dichtvalt.
  await button.click();
  await expect(askSheet(page)).toBeVisible({ timeout: 15_000 });
  await answer(page);
  await expect(page.locator('[data-testid="tree-node"]')).toHaveCount(1, { timeout: 20_000 });
});

test('4: Tab gaat van de sectietitel naar de sectietekst', async ({ page }, info) => {
  test.setTimeout(180_000);
  const stamp = `${info.project.name}-${Date.now().toString(36)}`;
  await signIn(page, ...KEEPER);

  const sheet = await openNewEntry(page);
  await sheet.getByLabel('Naam', { exact: true }).fill(`Sectiepad ${stamp}`);
  await sheet.getByRole('button', { name: 'Aanmaken', exact: true }).click();
  await page.waitForURL('**/e/**');
  // Vers binnengekomen, zodat de caret niet nog onderweg is naar de lopende
  // tekst (§90) terwijl deze zaak op Tab staat te wachten.
  await page.reload();
  await editArticle(page);

  const add = page.getByRole('button', { name: 'Sectie toevoegen' });
  await expect(add).toBeVisible({ timeout: 20_000 });
  const titles = page.getByPlaceholder('Titel van de sectie');
  for (let attempt = 0; attempt < 8 && (await titles.count()) === 0; attempt++) {
    await add.click({ timeout: 5000 }).catch(() => undefined);
    await page.waitForTimeout(500);
  }
  const title = titles.first();
  await expect(title).toBeVisible({ timeout: 15_000 });
  await expect(title, '§90: de caret staat in de titel').toBeFocused({ timeout: 15_000 });

  await page.keyboard.type(`Wat de kade opleverde ${stamp}`);
  // De tekst van deze sectie, en niets anders.
  const body = page.locator('.entry-section-editing .editor-body [contenteditable="true"]').first();
  await expect(body).toBeVisible({ timeout: 20_000 });

  await page.keyboard.press('Tab');
  await expect(body, 'Tab komt in de tekst van deze sectie uit').toBeFocused({ timeout: 10_000 });

  const words = `De kade lag vol ${stamp}`;
  await page.keyboard.type(words);
  await expect(body).toContainText(words, { timeout: 10_000 });
  // En de titel is niet stukgetypt.
  await expect(title).toHaveValue(`Wat de kade opleverde ${stamp}`);
});

test('5: de stamboomcamera blijft staan na een ouder erbij', async ({ page }, info) => {
  test.setTimeout(240_000);
  const stamp = `${info.project.name}-${Date.now().toString(36)}`;
  await signIn(page, ...KEEPER);

  await page.goto('/stambomen');
  await page.getByRole('button', { name: /Nieuwe stamboom/ }).click();
  const made = page.getByRole('dialog', { name: /Nieuwe stamboom/ });
  await made.getByLabel('Naam', { exact: true }).fill(`Waar was ik ${stamp}`);
  await made.getByRole('button', { name: /Openbare stamboom/ }).click();
  await page.waitForURL('**/stambomen/**');
  await expect(async () => {
    await editCanvas(page);
    await expect(page.getByTestId('tree-add-loose')).toBeVisible({ timeout: 1500 });
  }).toPass({ timeout: 25_000 });

  // Iemand uit het archief erbij, van de balk — de fixture uit `seed-demo`.
  const who = 'Jacob den Hollander';
  await page.locator('#tree-add-person').fill('Jacob');
  const option = page
    .locator('.tree-tools .suggest-item')
    .filter({ hasText: who })
    .filter({ hasNotText: 'aanmaken' })
    .first();
  await expect(option).toBeVisible({ timeout: 20_000 });
  await option.click();
  const card = page.locator('[data-testid="tree-node"]').filter({ hasText: who }).first();
  await expect(card).toBeVisible({ timeout: 20_000 });

  await page.getByTestId('tree-fit').click();
  await page.waitForTimeout(500);
  // *Alles in beeld* op één kaartje is 250 %, en dan past een generatie erbij
  // niet naast de vorige op het glas. Vier keer uitzoomen brengt het op ±100 %:
  // de maat waarop de meting rij 18 liep (77 %) en waarop een stamboom leest.
  const out = page.getByRole('group', { name: 'Zoomen', exact: true }).getByRole('button', { name: 'Uitzoomen' });
  for (let step = 0; step < 4; step++) await out.click();
  await page.waitForTimeout(500);
  await card.click({ position: { x: 6, y: 6 } });

  /** Waar dit kaartje op het glas staat, volgens het vlak zelf. */
  const onGlass = async (): Promise<{ x: number; y: number }> => {
    const seam = await page.evaluate((name: string) => {
      const box = (
        window as unknown as {
          __tree?: {
            positions: Record<string, { x: number; y: number }>;
            view: { x: number; y: number; zoom: number };
            nodes: () => { id: string; name: string }[];
          };
        }
      ).__tree;
      if (!box) return null;
      const node = box.nodes().find((one) => one.name === name);
      const at = node ? box.positions[node.id] : undefined;
      if (!at) return null;
      return { x: box.view.x + at.x * box.view.zoom, y: box.view.y + at.y * box.view.zoom };
    }, who);
    expect(seam, 'het kaartje staat op het glas').not.toBeNull();
    return seam!;
  };

  const before = await onGlass();
  const stage = (await page.getByTestId('tree-stage').boundingBox())!;
  /** Staat deze doos helemaal op het glas? */
  const onStage = (box: { x: number; y: number; width: number; height: number }) =>
    box.x >= stage.x - 1 &&
    box.y >= stage.y - 1 &&
    box.x + box.width <= stage.x + stage.width + 1 &&
    box.y + box.height <= stage.y + stage.height + 1;
  expect(onStage((await card.boundingBox())!), 'vooraf staat het kaartje op het glas').toBe(true);

  const handle = page.getByTestId('tree-handle-parent');
  await expect(handle).toBeVisible({ timeout: 15_000 });
  await handle.click();
  const picker = page.getByTestId('tree-picker');
  await expect(picker).toBeVisible({ timeout: 15_000 });
  // Iemand die het archief al kent, zodat de tekening hem zelf plaatst — dat
  // is de handeling uit rij 18, en het is precies de opmaak die opschuift.
  const mother = 'Sister Clasina';
  await picker.locator('#tree-picker-search').fill('Clasina');
  const pick = picker.locator('.suggest-item').filter({ hasText: mother }).filter({ hasNotText: 'aanmaken' }).first();
  await expect(pick).toBeVisible({ timeout: 20_000 });
  await pick.click();
  await expect(picker).toHaveCount(0, { timeout: 20_000 });
  await expect(page.locator('[data-testid="tree-node"]').filter({ hasText: mother })).toBeVisible({
    timeout: 20_000,
  });
  // De kaartjes schuiven op een overgang van 220 ms naar hun nieuwe plek.
  await page.waitForTimeout(900);

  const after = await onGlass();
  const drift = Math.hypot(after.x - before.x, after.y - before.y);
  const kept = onStage((await card.boundingBox())!);
  const newCard = (await page
    .locator('[data-testid="tree-node"]')
    .filter({ hasText: mother })
    .first()
    .boundingBox())!;
  console.log(
    `[ronde 64] na + Ouder (${info.project.name}): het kaartje schoof ${Math.round(drift)} px ` +
      `(${Math.round(before.x)},${Math.round(before.y)} → ${Math.round(after.x)},${Math.round(after.y)}), ` +
      `nog op het glas: ${kept}, nieuw kaartje op het glas: ${onStage(newCard)}`,
  );

  /*
   * Twee dingen tegelijk, en in deze volgorde. **Waar je was** telt het
   * zwaarst: het kaartje waar de hand mee bezig was stond op het glas en staat
   * er nog — dát was wat stuk was, want de camera stond stil in
   * wereldcoördinaten terwijl de tekening eronder een generatie opschoof, en je
   * keek daarna naar twee vreemden. **En het nieuwe kaartje** staat erbij: het
   * beeld schuift het minst dat daarvoor nodig is, en nooit zo ver dat het
   * eerste eraf valt (`panIntoView`'s `hold`).
   */
  expect(kept, 'het kaartje waar je mee bezig was staat nog op het glas').toBe(true);
  expect(onStage(newCard), 'en het nieuwe kaartje staat erbij').toBe(true);
});
