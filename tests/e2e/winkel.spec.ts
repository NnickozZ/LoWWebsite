import { expect, test, type Locator, type Page } from '@playwright/test';
import { becomeInvestigator, editArticle, fillWhenReady, inviteCode, signIn } from './helpers';

/**
 * §82: de winkel — de etalage, de beurs, en wat er met een klik gebeurt.
 *
 * Het model is `tests/e2e/huisraad.spec.ts` (§80): daar staat de hele weg naar
 * een stuk huisraad dóór de browser — `/wiki/huisraad` → Nieuw → plek, prijs
 * en effectregels — en die weg wordt hier woord voor woord overgenomen. Er
 * staat in dit bestand **geen regel SQL**, en dat is de bedoeling: alles wat
 * hieronder bewezen wordt is met de hand te maken.
 *
 * Wat §82 toevoegt aan §80 is de vraag die je *niet* voor een lege plank staand
 * stelt: wat is er allemaal te koop, en waar spaar ik voor. De etalage moet
 * daarom laten zien wat je niet kunt betalen — een winkel die alleen toont wat
 * je al kunt afrekenen is een kassa — en dat is de eerste zaak hieronder.
 *
 * De ladder van twaalf plekken (`lib/kamers/shape.ts`) is de reden dat de
 * gevallen hieronder kunnen bestaan zonder ooit een plek te openen:
 *
 *   sort 0 bureau (gratis)   sort 1 plank (gratis)   sort 2 muur (gratis)
 *   sort 5 kist (5 munten, op slot)  sort 9 kist (20 munten, op slot)
 *
 * Een *kist* is dus vanaf dag één een soort plek waar je er geen vrije van
 * hebt, wat precies de vijfde toestand van een rij is (`noslot`) — zaak 4
 * hoeft daarvoor niets vol te zetten, alleen iets te kunnen betalen.
 *
 * Alles wacht web-first (§6): elke koop loopt over de `buy`-route van de plek
 * en daarna een `router.refresh()`, dus de assertie is altijd een `expect` op
 * wat de server terugstuurt — `data-state`, `data-balance`, `data-room` — en
 * nergens een `waitForTimeout`.
 */

const KEEPER = ['Keeper', 'abbeytower34'] as const;

type PlekKind = 'muur' | 'plank' | 'bureau' | 'kist';

async function signUpAs(page: Page, name: string) {
  await page.goto('/signup');
  await page.getByLabel('Uitnodigingscode').fill(inviteCode());
  await page.getByLabel('Naam', { exact: true }).fill(name);
  await page.getByLabel('Wachtwoord', { exact: true }).fill('onderzeeboot');
  await page.getByLabel('Wachtwoord nogmaals').fill('onderzeeboot');
  await page.getByRole('button', { name: 'Account aanmaken' }).click();
  await page.waitForURL('**/');
}

/** §18b: een kamer hangt aan een onderzoeker; dit levert de slug van die kamer. */
async function signUpWearing(
  page: Page,
  name: string,
): Promise<{ account: string; character: string; slug: string }> {
  await signUpAs(page, name);
  const character = `Onderzoeker ${name}`;
  const path = await becomeInvestigator(page, character);
  return { account: name, character, slug: path.replace(/^\/e\//, '') };
}

/** Op een telefoon is de infobox een dichtgeklapte `<details>` (§6); op 1440 px doet dit niets. */
async function unfoldInfobox(page: Page) {
  const folded = page.locator('details#block-info:not([open]) > summary');
  if (await folded.count()) await folded.click();
}

/** Het blad "Nieuw artikel", geopend tot het er echt staat — een verse pagina luistert nog niet (§6). */
async function openNewEntrySheet(page: Page): Promise<Locator> {
  const sheet = page.getByRole('dialog', { name: 'Nieuw artikel' });
  await expect(async () => {
    if (!(await sheet.isVisible().catch(() => false))) {
      await page
        .getByRole('button', { name: 'Nieuw artikel' })
        .locator('visible=true')
        .first()
        .click({ timeout: 5000 });
    }
    await expect(sheet).toBeVisible({ timeout: 1500 });
  }).toPass({ timeout: 30_000 });
  return sheet;
}

type Huisraad = { name: string; slug: string; path: string; effect: string[]; prijs: number };

/**
 * Een stuk huisraad, gemaakt zoals de Keeper het maakt — §80's helper, hier
 * ongewijzigd overgenomen omdat het de enige weg is die ook Nick loopt.
 *
 * Leest aan het eind terug wat de server bewaard heeft: een prijs die de
 * herlezing niet overleeft is geen prijs, en de winkel leest dezelfde rij.
 */
async function newHuisraad(
  page: Page,
  spec: { name: string; plek: PlekKind; prijs: number; effect: string[] },
): Promise<Huisraad> {
  await page.goto('/wiki/huisraad');
  const sheet = page.getByRole('dialog', { name: 'Nieuw artikel' });
  await expect(async () => {
    if (!(await sheet.isVisible().catch(() => false))) {
      await page.getByRole('button', { name: 'Nieuw', exact: true }).click({ timeout: 5000 });
    }
    await expect(sheet).toBeVisible({ timeout: 1500 });
  }).toPass({ timeout: 30_000 });
  await expect(sheet.getByRole('radio', { name: 'Huisraad', exact: true })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await sheet.getByLabel('Naam', { exact: true }).fill(spec.name);
  await sheet.getByRole('button', { name: 'Aanmaken' }).click();
  await page.waitForURL('**/e/**');
  const path = new URL(page.url()).pathname;
  const slug = path.replace(/^\/e\//, '');

  const effect = spec.effect.join('\n');
  await unfoldInfobox(page);
  await page.locator('#field-plek').selectOption(spec.plek);
  await fillWhenReady(page.locator('#field-prijs'), String(spec.prijs));
  await page.locator('#field-prijs').blur();
  await fillWhenReady(page.locator('#field-effect'), effect);
  await page.locator('#field-effect').blur();

  // Niet op "Opgeslagen" wachten maar op "niets meer onderweg": een longtext in
  // de live-kamer (§21) laat die melding terugvallen op niets. Zie §80.
  await expect(page.locator('.save-state')).not.toHaveText('Opslaan…', { timeout: 20_000 });

  await expect(async () => {
    await page.goto(path);
    await editArticle(page);
    await unfoldInfobox(page);
    await expect(page.locator('#field-plek')).toHaveValue(spec.plek, { timeout: 5000 });
    await expect(page.locator('#field-prijs')).toHaveValue(String(spec.prijs), { timeout: 5000 });
    await expect(page.locator('#field-effect')).toHaveValue(effect, { timeout: 5000 });
  }).toPass({ timeout: 60_000 });

  return { name: spec.name, slug, path, effect: spec.effect, prijs: spec.prijs };
}

/** De plek op rung `sort`. */
function plek(page: Page, sort: number): Locator {
  return page.locator(`[data-testid="plek"][data-sort="${sort}"]`);
}

async function openKamer(page: Page, slug: string) {
  await page.goto(`/kamer/${slug}`);
  await expect(page.getByTestId('kamer-page')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId('kamer-grid')).toBeVisible({ timeout: 20_000 });
}

/** De Keeper schrijft een regel in het grootboek van deze kamer. */
async function grant(page: Page, slug: string, amount: string, reason: string) {
  await openKamer(page, slug);
  const form = page.getByTestId('grootboek-form');
  await expect(form).toBeVisible({ timeout: 20_000 });
  await fillWhenReady(form.getByTestId('grootboek-bedrag'), amount);
  await fillWhenReady(form.getByTestId('grootboek-reden'), reason);
  await form.getByTestId('grootboek-geef').click();
}

/** Munten bijschrijven tot de kamer zelf zegt dat ze er staan. */
async function giveMunten(keeper: Page, slug: string, amount: number, reason: string) {
  await grant(keeper, slug, String(amount), reason);
  await expect(keeper.getByTestId('kamer-balance')).toHaveAttribute('data-balance', String(amount), {
    timeout: 20_000,
  });
}

/** De etalage, met de pagina er echt. `kamer` kiest welke beurs (§82's `?kamer=`). */
async function openWinkel(page: Page, roomId?: string) {
  await page.goto(roomId ? `/winkel?kamer=${encodeURIComponent(roomId)}` : '/winkel');
  await expect(page.getByTestId('winkel-page')).toBeVisible({ timeout: 20_000 });
}

/** Eén rij van de etalage, gevonden op de naam die deze run uniek maakt. */
function rij(page: Page, name: string): Locator {
  return page.getByTestId('winkel-rij').filter({ hasText: name });
}

test.describe('§82 De winkel', () => {
  /**
   * ZAAK 1 en 2 — de etalage toont ook wat je niet kunt betalen, en kopen
   * landt het in de kamer.
   *
   * Eén test, omdat het één beweging is: je kijkt in de etalage, je ziet twee
   * dingen die aan dezelfde muur horen, je kunt er één van betalen, je koopt
   * hem, en hij hangt er. De twee dingen delen met opzet hun soort plek: het
   * verschil tussen de twee rijen is dán alleen de prijs, en dat is precies wat
   * de assertie wil bewijzen.
   */
  test('wat te duur is blijft in de etalage staan, en wat gekocht wordt hangt in de kamer', async ({
    page,
    browser,
    isMobile,
  }, info) => {
    test.skip(isMobile, '§82 wordt op de desk bewezen; de telefoon heeft één eigen geval, onderaan');
    test.setTimeout(300_000);
    const stamp = `${info.project.name}-${Date.now().toString(36)}`;

    await signIn(page, ...KEEPER);
    const prent = await newHuisraad(page, {
      name: `Prent ${stamp}`,
      plek: 'muur',
      prijs: 2,
      effect: ['+1 op Kunstgeschiedenis in deze kamer'],
    });
    const gobelin = await newHuisraad(page, {
      name: `Gobelin ${stamp}`,
      plek: 'muur',
      prijs: 9,
      effect: ['+1 op Charme bij bezoek'],
    });

    const ownerCtx = await browser.newContext();
    const owner = await ownerCtx.newPage();
    const { slug } = await signUpWearing(owner, `Etaleur ${stamp}`);

    // Drie munten: genoeg voor de prent, niet voor het gobelin, en na de koop
    // blijft er één over — zodat het saldo straks een aftrekking is en geen nul.
    await giveMunten(page, slug, 3, `Etalagegeld ${stamp}`);

    /* ------------------------------------------- zaak 1: niets wordt verstopt */

    await openWinkel(owner);
    await expect(owner.getByTestId('winkel-balance')).toHaveAttribute('data-balance', '3');

    const prentRij = rij(owner, prent.name);
    const gobelinRij = rij(owner, gobelin.name);
    await expect(prentRij).toHaveCount(1, { timeout: 20_000 });
    await expect(gobelinRij).toHaveCount(1);

    // Allebei staan ze in de groep van hun soort plek, met hun prijs erop.
    const muurGroep = owner.locator('[data-testid="winkel-groep"][data-kind="muur"]');
    await expect(muurGroep.getByTestId('winkel-rij').filter({ hasText: prent.name })).toHaveCount(1);
    await expect(muurGroep.getByTestId('winkel-rij').filter({ hasText: gobelin.name })).toHaveCount(
      1,
    );

    await expect(prentRij).toHaveAttribute('data-kind', 'muur');
    await expect(prentRij).toHaveAttribute('data-price', '2');
    await expect(prentRij).toHaveAttribute('data-afford', 'ja');
    await expect(prentRij).toHaveAttribute('data-state', 'buy');
    await expect(prentRij.getByTestId('winkel-prijs')).toHaveText('2 munten');
    await expect(prentRij.getByTestId('winkel-effect')).toHaveText([prent.effect[0]]);
    await expect(prentRij.getByTestId('winkel-naam')).toHaveAttribute('href', `/e/${prent.slug}`);

    // En het dure ding: niet weggelaten, niet zonder prijs, wel vastgehouden —
    // met in de titel van de knop hoeveel er nog aan ontbreekt.
    await expect(gobelinRij).toHaveAttribute('data-price', '9');
    await expect(gobelinRij).toHaveAttribute('data-afford', 'nee');
    await expect(gobelinRij).toHaveAttribute('data-state', 'dear');
    await expect(gobelinRij.getByTestId('winkel-prijs')).toHaveText('9 munten');
    await expect(gobelinRij.getByTestId('winkel-effect')).toHaveText([gobelin.effect[0]]);
    const vast = gobelinRij.getByTestId('winkel-koop');
    await expect(vast).toHaveCount(1);
    await expect(vast).toBeDisabled();
    await expect(vast).toHaveAttribute('title', /nog 6 munten/);

    /* ------------------------------------ zaak 2: kopen, en het hangt er echt */

    await prentRij.getByTestId('winkel-koop').click();

    // De beurs daalt met precies de prijs, en de rij zegt het zelf.
    await expect(owner.getByTestId('winkel-balance')).toHaveAttribute('data-balance', '1', {
      timeout: 20_000,
    });
    await expect(rij(owner, prent.name)).toHaveAttribute('data-state', 'owned', { timeout: 20_000 });
    await expect(rij(owner, prent.name).getByTestId('winkel-owned')).toBeVisible();
    // Er is niets meer te kopen aan een ding dat je al hebt.
    await expect(rij(owner, prent.name).getByTestId('winkel-koop')).toHaveCount(0);

    // Het dure ding is nóg duurder geworden ten opzichte van de beurs, en staat
    // er nog steeds — dat is de regel van de etalage, ook ná een koop.
    await expect(rij(owner, gobelin.name)).toHaveAttribute('data-state', 'dear');
    await expect(rij(owner, gobelin.name).getByTestId('winkel-koop')).toHaveAttribute(
      'title',
      /nog 8 munten/,
    );

    // En dan de kamer: rung 2 is de eerste vrije muur, en daar hangt hij.
    await openKamer(owner, slug);
    await expect(owner.getByTestId('kamer-balance')).toHaveAttribute('data-balance', '1');
    const muur = plek(owner, 2);
    await expect(muur).toHaveAttribute('data-kind', 'muur');
    await expect(muur).toHaveAttribute('data-state', 'filled', { timeout: 20_000 });
    await expect(muur.getByTestId('plek-item')).toHaveAttribute('href', `/e/${prent.slug}`);
    await expect(muur.getByTestId('plek-item')).toContainText(prent.name);

    // Wat het zegt te geven staat onder het raster, met zijn eigen naam erbij.
    await expect(owner.getByTestId('kamer-effecten')).toBeVisible({ timeout: 20_000 });
    const blok = owner.locator(`[data-testid="kamer-effect"][data-name="${prent.name}"]`);
    await expect(blok).toHaveCount(1);
    await expect(blok.getByTestId('kamer-effect-regel')).toHaveText([prent.effect[0]]);

    // De weg terug is de weg heen: de deur naar de winkel staat naast de beurs.
    await expect(owner.getByTestId('kamer-balance').getByTestId('kamer-winkel')).toHaveAttribute(
      'href',
      '/winkel',
    );

    // Het grootboek van de Keeper schreef de koop op, en niet als cadeau.
    await openKamer(page, slug);
    await expect(page.getByTestId('kamer-balance')).toHaveAttribute('data-balance', '1');
    const regel = page.getByTestId('grootboek-regel').filter({ hasText: prent.name });
    await expect(regel).toHaveCount(1, { timeout: 20_000 });
    await expect(regel).toHaveAttribute('data-kind', 'item');
    await expect(regel).toHaveAttribute('data-delta', '-2');

    await ownerCtx.close();
  });

  /**
   * ZAAK 4 — je kunt het betalen en je hebt er geen plek voor.
   *
   * Een *kist* is de soort plek waarvan een verse kamer er geen enkele open
   * heeft: rung 5 kost vijf munten en rung 9 twintig, allebei op slot. Er hoeft
   * dus niets volgezet te worden om dit geval te bereiken — en dat is precies
   * wat de regel moet zeggen: niet *te duur*, maar *nergens kwijt te kunnen*,
   * met een deur terug naar de kamer waar zo'n plek geopend wordt.
   */
  test('wat je kunt betalen maar nergens kwijt kunt wijst naar je kamer', async ({
    page,
    browser,
    isMobile,
  }, info) => {
    test.skip(isMobile, '§82 wordt op de desk bewezen');
    test.setTimeout(300_000);
    const stamp = `${info.project.name}-${Date.now().toString(36)}`;

    await signIn(page, ...KEEPER);
    const kistje = await newHuisraad(page, {
      name: `Reiskist ${stamp}`,
      plek: 'kist',
      prijs: 2,
      effect: ['Ruimte voor drie dingen die niemand mag zien'],
    });

    const ownerCtx = await browser.newContext();
    const owner = await ownerCtx.newPage();
    const { slug } = await signUpWearing(owner, `Sjouwer ${stamp}`);
    await giveMunten(page, slug, 4, `Kistgeld ${stamp}`);

    // De tegenproef, in de kamer zelf: allebei de kistplekken zitten op slot.
    await openKamer(owner, slug);
    await expect(plek(owner, 5)).toHaveAttribute('data-kind', 'kist');
    await expect(plek(owner, 5)).toHaveAttribute('data-state', 'locked');
    await expect(plek(owner, 9)).toHaveAttribute('data-kind', 'kist');
    await expect(plek(owner, 9)).toHaveAttribute('data-state', 'locked');

    await openWinkel(owner);
    await expect(owner.getByTestId('winkel-balance')).toHaveAttribute('data-balance', '4');

    const kistRij = rij(owner, kistje.name);
    await expect(kistRij).toHaveCount(1, { timeout: 20_000 });
    // Betalen kán: dit is niet `dear`, en dat is het hele onderscheid.
    await expect(kistRij).toHaveAttribute('data-afford', 'ja');
    await expect(kistRij).toHaveAttribute('data-state', 'noslot');
    await expect(kistRij).toHaveAttribute('data-price', '2');
    await expect(kistRij.getByTestId('winkel-koop')).toHaveCount(0);

    const geenPlek = kistRij.getByTestId('winkel-geen-plek');
    await expect(geenPlek).toBeVisible();
    // En de deur erin gaat naar zijn eigen kamer, waar een kist te openen is.
    await expect(geenPlek.getByTestId('winkel-geen-plek-deur')).toHaveAttribute(
      'href',
      `/kamer/${slug}`,
    );
    await geenPlek.getByTestId('winkel-geen-plek-deur').click();
    await owner.waitForURL(`**/kamer/${slug}`);
    await expect(owner.getByTestId('kamer-page')).toBeVisible({ timeout: 20_000 });

    await ownerCtx.close();
  });

  /**
   * ZAAK 5 — de Keeper heeft hier geen beurs.
   *
   * Hij draagt geen onderzoeker (§18), dus er is geen kamer om voor te kopen en
   * geen munt om uit te geven; hij legt dingen neer met `placeItem`, wat niets
   * kost. De etalage is voor hem een prijslijst, en de assertie die dat waar
   * maakt is een telling van **nul** knoppen op de hele pagina — één knop die
   * na de klik alsnog geweigerd wordt is erger dan geen knop.
   */
  test('de Keeper leest een prijslijst en heeft geen enkele koopknop', async ({
    page,
    isMobile,
  }, info) => {
    test.skip(isMobile, '§82 wordt op de desk bewezen');
    test.setTimeout(240_000);
    const stamp = `${info.project.name}-${Date.now().toString(36)}`;

    await signIn(page, ...KEEPER);
    const kandelaar = await newHuisraad(page, {
      name: `Kandelaar ${stamp}`,
      plek: 'bureau',
      prijs: 3,
      effect: ['+1 op Speuren bij kaarslicht'],
    });

    await openWinkel(page);
    await expect(page.getByTestId('winkel-keeper')).toBeVisible({ timeout: 20_000 });

    // De lijst is er echt — anders zou de telling eronder om niets slagen.
    const kandelaarRij = rij(page, kandelaar.name);
    await expect(kandelaarRij).toHaveCount(1, { timeout: 20_000 });
    await expect(kandelaarRij).toHaveAttribute('data-state', 'list');
    await expect(kandelaarRij.getByTestId('winkel-prijs')).toHaveText('3 munten');

    // Geen beurs, geen kiezer, en nergens een knop — ook niet vastgehouden.
    await expect(page.getByTestId('winkel-koop')).toHaveCount(0);
    await expect(page.getByTestId('winkel-balance')).toHaveCount(0);
    await expect(page.getByTestId('winkel-kiezer')).toHaveCount(0);
    expect(await page.getByTestId('winkel-page').innerHTML()).not.toContain('winkel-koop');
  });

  /**
   * ZAAK 6 — twee onderzoekers, twee beurzen.
   *
   * De tweede onderzoeker komt van de Keeper (§18c): een speler knoopt zijn
   * eerste zelf aan en daarna is het koppelen aan Beheer. Wat bewezen moet
   * worden is dat de kiezer geen versiering is: het adres draagt de keuze
   * (`?kamer=`), de pagina zegt welke kamer ze leest (`data-room`), en het geld
   * van de één staat niet onder de ander.
   */
  test('twee onderzoekers hebben elk hun eigen beurs in de winkel', async ({
    page,
    browser,
    isMobile,
  }, info) => {
    test.skip(isMobile, '§82 wordt op de desk bewezen');
    test.setTimeout(300_000);
    const stamp = `${info.project.name}-${Date.now().toString(36)}`;

    await signIn(page, ...KEEPER);
    const kruk = await newHuisraad(page, {
      name: `Kruk ${stamp}`,
      plek: 'plank',
      prijs: 2,
      effect: ['Iets om op te zitten'],
    });

    const ownerCtx = await browser.newContext();
    const owner = await ownerCtx.newPage();
    const eerste = await signUpWearing(owner, `Tweeling ${stamp}`);

    // De tweede onderzoeker: de Keeper schrijft hem en koppelt hem, want een
    // speler knoopt er maar één zelf aan (§18b/§18c).
    const tweedeNaam = `Onderzoeker Schaduw ${stamp}`;
    await page.goto('/');
    const sheet = await openNewEntrySheet(page);
    await sheet.getByLabel('Naam', { exact: true }).fill(tweedeNaam);
    const vanaf = new URL(page.url()).pathname;
    await sheet.getByRole('button', { name: 'Aanmaken' }).click();
    await page.waitForURL((url) => url.pathname.startsWith('/e/') && url.pathname !== vanaf);
    const tweedeSlug = new URL(page.url()).pathname.replace(/^\/e\//, '');

    await page.goto('/admin?tab=users');
    const rowSel = page.locator(`li[data-username="${eerste.account}"]`).first();
    await expect(rowSel).toBeVisible({ timeout: 20_000 });
    const box = rowSel.locator('input.input').first();
    await box.click();
    await box.fill(tweedeNaam);
    // Niet de "'…' aanmaken"-rij (§6): die staat er al terwijl de echte
    // voorstellen nog onderweg zijn.
    const suggestion = rowSel
      .locator('.suggest-item')
      .filter({ hasText: tweedeNaam })
      .filter({ hasNotText: 'aanmaken' })
      .first();
    await expect(suggestion).toBeVisible({ timeout: 20_000 });
    await suggestion.click();
    await expect(rowSel.getByText(tweedeNaam, { exact: false }).first()).toBeVisible({
      timeout: 20_000,
    });

    // Alleen de eerste krijgt geld.
    await giveMunten(page, eerste.slug, 5, `Beursgeld ${stamp}`);

    await openWinkel(owner);
    const kiezer = owner.getByTestId('winkel-kiezer');
    await expect(kiezer).toBeVisible({ timeout: 20_000 });
    const chips = kiezer.getByTestId('winkel-kiezer-kamer');
    await expect(chips).toHaveCount(2);

    // De pagina staat op de eerste onderzoeker: zijn beurs, zijn kamer.
    const eersteChip = kiezer.locator('[data-testid="winkel-kiezer-kamer"][data-here="ja"]');
    const tweedeChip = kiezer.locator('[data-testid="winkel-kiezer-kamer"][data-here="nee"]');
    await expect(eersteChip).toHaveCount(1);
    await expect(tweedeChip).toHaveCount(1);
    await expect(eersteChip).toContainText(eerste.character);
    await expect(tweedeChip).toContainText(tweedeNaam);

    const eersteRoom = (await eersteChip.getAttribute('data-room'))!;
    const tweedeRoom = (await tweedeChip.getAttribute('data-room'))!;
    expect(eersteRoom).toBeTruthy();
    expect(tweedeRoom).toBeTruthy();
    expect(tweedeRoom).not.toBe(eersteRoom);

    await expect(owner.getByTestId('winkel-page')).toHaveAttribute('data-room', eersteRoom);
    await expect(owner.getByTestId('winkel-balance')).toHaveAttribute('data-balance', '5');
    await expect(rij(owner, kruk.name)).toHaveAttribute('data-state', 'buy');

    // Omschakelen is een navigatie, want de keuze hoort in het adres te staan.
    await tweedeChip.click();
    await owner.waitForURL(`**/winkel?kamer=${encodeURIComponent(tweedeRoom)}`);
    await expect(owner.getByTestId('winkel-page')).toHaveAttribute('data-room', tweedeRoom, {
      timeout: 20_000,
    });
    // En het geld van de één staat niet onder de ander.
    await expect(owner.getByTestId('winkel-balance')).toHaveAttribute('data-balance', '0');
    await expect(rij(owner, kruk.name)).toHaveAttribute('data-state', 'dear');
    await expect(
      kiezer.locator(`[data-testid="winkel-kiezer-kamer"][data-room="${tweedeRoom}"]`),
    ).toHaveAttribute('data-here', 'ja');
    await expect(
      kiezer.locator(`[data-testid="winkel-kiezer-kamer"][data-room="${eersteRoom}"]`),
    ).toHaveAttribute('data-here', 'nee');

    // Terug is terug: hetzelfde adres, dezelfde beurs.
    await openWinkel(owner, eersteRoom);
    await expect(owner.getByTestId('winkel-page')).toHaveAttribute('data-room', eersteRoom);
    await expect(owner.getByTestId('winkel-balance')).toHaveAttribute('data-balance', '5');

    // De tweede kamer bestaat echt en is leeg — de beurs hierboven was geen nul
    // omdat er niets was, maar omdat er niets in geschreven is.
    await openKamer(owner, tweedeSlug);
    await expect(owner.getByTestId('kamer-balance')).toHaveAttribute('data-balance', '0');

    await ownerCtx.close();
  });

  /**
   * ZAAK 3 — er is er één van, en een ander heeft hem.
   *
   * `one_of_a_kind` is een vinkje van de **soort** en niet van het artikel, en
   * de geseede soort *Huisraad* is met opzet géén-van-één (§80: twee
   * onderzoekers mogen dezelfde lamp hebben). Het vinkje omzetten en aan het
   * eind terugzetten zou wereldwijde staat lenen die §80's eigen test leest —
   * en het kán ook niet: de soort *Huisraad* is met `id = 'type-huisraad'`
   * geseed terwijl haar adres `huisraad` is, en `updateType` weigert daardoor
   * elke bewaring van die soort (zie het verslag van deze ronde).
   *
   * Dus maakt deze test de soort die ze nodig heeft zélf, zoals een Keeper dat
   * zou doen: Beheer → Soorten → *Soort aanmaken*, twee velden met de
   * sleutels die een kamer kent (`plek`, `prijs`), en de twee vinkjes eronder
   * aan. Dat is meteen de proef op §80's sleutelvakje: een soort die in een
   * kamer past is te maken zonder een regel code.
   *
   * De klem zit in de volgorde: `room_slots.claim` wordt bij de kóóp
   * geschreven, en alleen als de soort op dat moment één-van-zijn-soort is.
   */
  test('van een uniek ding zegt de etalage dat een ander het heeft', async ({
    page,
    browser,
    isMobile,
  }, info) => {
    test.skip(isMobile, '§82 wordt op de desk bewezen');
    test.setTimeout(300_000);
    const stamp = `${info.project.name}-${Date.now().toString(36)}`;
    const soort = `Relikwie ${stamp}`;

    await signIn(page, ...KEEPER);

    /* ------------------------------------------ de soort, door Beheer gemaakt */

    await page.goto('/admin?tab=types');
    const nieuw = page.locator('#new-type');
    await expect(nieuw).toBeVisible({ timeout: 20_000 });
    await fillWhenReady(nieuw, soort);
    await page.getByRole('button', { name: 'Soort aanmaken' }).click();

    const editor = page
      .locator('details.admin-type')
      .filter({ has: page.locator('summary', { hasText: soort }) });
    await expect(editor).toHaveCount(1, { timeout: 30_000 });
    await editor.locator('summary').click();
    await expect(editor.getByTestId('soort-keeper-made')).toBeVisible({ timeout: 20_000 });

    // Twee velden met de sleutels die `lib/kamers/shape.ts` vraagt. De sleutel
    // volgt het label tot je hem zelf aanraakt (§80), dus eerst het label.
    for (const [index, veld] of (
      [
        ['Plek', 'plek'],
        ['Prijs', 'prijs'],
      ] as const
    ).entries()) {
      await editor.getByRole('button', { name: 'Veld toevoegen' }).click();
      await editor.getByLabel(`Naam van veld ${index + 1}`).fill(veld[0]);
      await editor
        .locator(`[data-testid="veld-sleutel"][data-field-index="${index}"]`)
        .fill(veld[1]);
    }
    await editor.getByTestId('soort-keeper-made').setChecked(true);
    await editor.getByTestId('soort-one-of-a-kind').setChecked(true);
    await editor.getByRole('button', { name: 'Opslaan', exact: true }).click();

    // De enige proef die telt: wat de server teruggeeft als de pagina opnieuw
    // gelezen wordt. Een vinkje dat alleen in het scherm staat is geen regel.
    await expect(async () => {
      await page.goto('/admin?tab=types');
      const again = page
        .locator('details.admin-type')
        .filter({ has: page.locator('summary', { hasText: soort }) });
      await again.locator('summary').click();
      await expect(again.getByTestId('soort-one-of-a-kind')).toBeChecked({ timeout: 5000 });
      await expect(again.getByTestId('soort-keeper-made')).toBeChecked({ timeout: 5000 });
      for (const key of ['plek', 'prijs']) {
        await expect(
          again.locator(`[data-testid="veld-sleutel-vast"][data-field-key="${key}"]`),
        ).toHaveCount(1, { timeout: 5000 });
      }
    }).toPass({ timeout: 60_000 });

    /* ------------------------------------------------- het ding zelf, één van */

    const naam = `Lantaarn ${stamp}`;
    await page.goto('/');
    const sheet = await openNewEntrySheet(page);
    await sheet.getByRole('radio', { name: soort, exact: true }).click();
    await sheet.getByLabel('Naam', { exact: true }).fill(naam);
    const vanaf = new URL(page.url()).pathname;
    await sheet.getByRole('button', { name: 'Aanmaken' }).click();
    await page.waitForURL((url) => url.pathname.startsWith('/e/') && url.pathname !== vanaf);
    const dingPad = new URL(page.url()).pathname;
    const dingSlug = dingPad.replace(/^\/e\//, '');

    await unfoldInfobox(page);
    await fillWhenReady(page.locator('#field-plek'), 'plank');
    await page.locator('#field-plek').blur();
    await fillWhenReady(page.locator('#field-prijs'), '2');
    await page.locator('#field-prijs').blur();
    await expect(page.locator('.save-state')).not.toHaveText('Opslaan…', { timeout: 20_000 });
    await expect(async () => {
      await page.goto(dingPad);
      await editArticle(page);
      await unfoldInfobox(page);
      await expect(page.locator('#field-plek')).toHaveValue('plank', { timeout: 5000 });
      await expect(page.locator('#field-prijs')).toHaveValue('2', { timeout: 5000 });
    }).toPass({ timeout: 60_000 });

    /* ------------------------------------------------------- twee gegadigden */

    const eersteCtx = await browser.newContext();
    const eerste = await eersteCtx.newPage();
    const een = await signUpWearing(eerste, `Houder ${stamp}`);
    const tweedeCtx = await browser.newContext();
    const tweede = await tweedeCtx.newPage();
    const twee = await signUpWearing(tweede, `Misser ${stamp}`);

    await giveMunten(page, een.slug, 2, `Lantaarngeld ${stamp}`);
    await giveMunten(page, twee.slug, 2, `Lantaarngeld ${stamp}`);

    // Vóór de koop kunnen ze hem allebei hebben: de tweede rij is hieronder
    // alleen bewijs als hij eerst een gewone koop-rij was.
    await openWinkel(tweede);
    await expect(rij(tweede, naam)).toHaveAttribute('data-state', 'buy', { timeout: 20_000 });

    await openWinkel(eerste);
    await expect(rij(eerste, naam)).toHaveAttribute('data-state', 'buy', { timeout: 20_000 });
    await rij(eerste, naam).getByTestId('winkel-koop').click();
    await expect(rij(eerste, naam)).toHaveAttribute('data-state', 'owned', { timeout: 20_000 });
    await expect(eerste.getByTestId('winkel-balance')).toHaveAttribute('data-balance', '0');
    await openKamer(eerste, een.slug);
    await expect(plek(eerste, 1).getByTestId('plek-item')).toHaveAttribute(
      'href',
      `/e/${dingSlug}`,
    );

    // En bij de tweede is hij weg — met zoveel woorden, en niet door te
    // verdwijnen: een lantaarn die er niet meer is, is geen lantaarn die nooit
    // bestond. Hij kón hem betalen, dus het is niet de beurs die hem tegenhoudt.
    await openWinkel(tweede);
    const weg = rij(tweede, naam);
    await expect(weg).toHaveCount(1, { timeout: 20_000 });
    await expect(weg).toHaveAttribute('data-state', 'taken', { timeout: 20_000 });
    await expect(weg.getByTestId('winkel-taken')).toBeVisible();
    await expect(weg.getByTestId('winkel-prijs')).toHaveText('2 munten');
    await expect(weg.getByTestId('winkel-koop')).toHaveCount(0);
    await expect(weg).toHaveAttribute('data-afford', 'ja');
    await expect(tweede.getByTestId('winkel-balance')).toHaveAttribute('data-balance', '2');

    await eersteCtx.close();
    await tweedeCtx.close();
  });

  /**
   * ZAAK 7 — de telefoon, één geval.
   *
   * De etalage is op 390 px een lijst van rijen met een prijs en een knop aan
   * de rechterkant, en dat is precies de opmaak die opzij schuift als er iets
   * niet klopt. Leesbaar betekent hier: de rij staat er, de prijs erop, de knop
   * binnen het venster, niets duwt de pagina opzij, en de koop landt.
   */
  test('op een telefoon is de winkel te lezen en de koopknop te raken', async ({
    page,
    browser,
    isMobile,
  }, info) => {
    test.skip(!isMobile, 'dit geval gaat juist over de telefoon (390 px)');
    test.setTimeout(300_000);
    const stamp = `${info.project.name}-${Date.now().toString(36)}`;

    const keeperCtx = await browser.newContext();
    const keeper = await keeperCtx.newPage();
    await signIn(keeper, ...KEEPER);
    const kandelaar = await newHuisraad(keeper, {
      name: `Zaklantaarn ${stamp}`,
      plek: 'plank',
      prijs: 2,
      effect: ['+1 op Speuren in het donker'],
    });

    const { slug } = await signUpWearing(page, `Telefoon ${stamp}`);
    await giveMunten(keeper, slug, 3, `Zakgeld ${stamp}`);

    await openWinkel(page);
    await expect(page.getByTestId('winkel-balance')).toHaveAttribute('data-balance', '3');

    const rijtje = rij(page, kandelaar.name);
    await expect(rijtje).toHaveCount(1, { timeout: 20_000 });
    await expect(rijtje.getByTestId('winkel-prijs')).toHaveText('2 munten');
    await expect(rijtje).toHaveAttribute('data-state', 'buy');

    const koop = rijtje.getByTestId('winkel-koop');
    await koop.scrollIntoViewIfNeeded();
    await expect(koop).toBeEnabled();

    // De knop staat binnen de 390 px, en niets duwt de pagina opzij.
    const viewport = page.viewportSize()!;
    const box = (await koop.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(viewport.width + 1);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1,
      ),
    ).toBe(true);

    await koop.click();
    await expect(rij(page, kandelaar.name)).toHaveAttribute('data-state', 'owned', {
      timeout: 20_000,
    });
    await expect(page.getByTestId('winkel-balance')).toHaveAttribute('data-balance', '1', {
      timeout: 20_000,
    });

    await openKamer(page, slug);
    await expect(plek(page, 1)).toHaveAttribute('data-state', 'filled', { timeout: 20_000 });
    await expect(
      page.locator(`[data-testid="kamer-effect"][data-name="${kandelaar.name}"]`),
    ).toHaveCount(1, { timeout: 20_000 });

    await keeperCtx.close();
  });
});
