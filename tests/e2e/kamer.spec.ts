import { resolve } from 'node:path';
import Database from 'better-sqlite3';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { becomeInvestigator, fillWhenReady, inviteCode, openRights, signIn } from './helpers';

/**
 * §79: de kamer — de plekken, het grootboek, en wat een ander ervan te zien
 * krijgt.
 *
 * Het model voor dit bestand is `aanwezig.spec.ts` (twee browsers, twee mensen,
 * één archief) en de tucht komt uit `access-rights.spec.ts`: een recht dat
 * alleen op het scherm van de eigenaar geldt is versiering, dus zowel "kijken
 * mag, aanraken niet" als de sluier worden bewezen vanaf de kant van wie er
 * *niet* bij mag.
 *
 * Alles wacht web-first (§6). Elke schrijfactie op deze pagina loopt over een
 * API-route en daarna een `router.refresh()`, dus de assertie is altijd een
 * `expect(...)` op het attribuut dat de server terugstuurt — `data-state`,
 * `data-balance` — en nergens een `waitForTimeout` om die ronde mee dicht te
 * plamuren.
 *
 * De vorm van een kamer staat in `lib/kamers/shape.ts` en is een ladder van
 * twaalf plekken, waarvan de eerste drie gratis openstaan:
 *
 *   sort 0  bureau  0     sort 3  plank  2     sort 6  plank  8   …
 *   sort 1  plank   0     sort 4  muur   3     sort 7  bureau 12
 *   sort 2  muur    0     sort 5  kist   5     …     sort 11 muur 30
 *
 * Elke test hieronder rekent op precies die eerste zes rungen en zegt erbij
 * welke. `shape.ts` mag alleen aanvullen en nooit hernummeren, dus dat is een
 * afspraak en geen gok.
 */

const KEEPER = ['Keeper', 'abbeytower34'] as const;

/** De vier kinds uit `shape.ts`, zoals ze in `data-kind` staan. */
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

/**
 * §18b/§79: een kamer hangt aan een *onderzoeker*, en een onderzoeker is een
 * artikel dat aan een account is vastgeknoopt (`user_characters`) — zonder dat
 * bestaat er geen kamer om te openen (`getOrCreateRoom` geeft null terug voor
 * een karakter dat niemand draagt). Dus loopt elke speler hier eerst de weg die
 * een echte speler loopt.
 *
 * Geeft de slug van de onderzoeker terug: het adres van de kamer is
 * `/kamer/<die slug>` en nergens een tweede id.
 */
async function signUpWearing(page: Page, name: string): Promise<{ character: string; slug: string }> {
  await signUpAs(page, name);
  const character = `Onderzoeker ${name}`;
  const path = await becomeInvestigator(page, character);
  return { character, slug: path.replace(/^\/e\//, '') };
}

/**
 * §79: het ene veld dat een artikel tot voorwerp maakt — gezet naast de app om,
 * en dat is een bevinding en geen gemak.
 *
 * `VOORWERP_FIELD_KEY` is `plek`, en `plekKindOf` vraagt het artikel om
 * `fields.plek`. De sleutel van een veld komt echter **niet** van zijn naam:
 * `Veld toevoegen` in `components/admin/TypeEditor.tsx` maakt
 * `{ key: 'veld_<n>', label: '', kind: 'text' }` en `cleanFields` houdt een
 * meegegeven `key` aan (het slugt de *label* alleen als er geen key is). Er is
 * geen invoervak voor de sleutel, geen soort in de seed heeft een veld `plek`,
 * en `updateEntry` laat sinds §38 alleen sleutels door die de soort kent — dus
 * er is via de browser **geen weg** om een voorwerp te maken. De unit tests
 * (`tests/unit/kamer.test.ts`) zetten de rij met SQL en lopen daar dus omheen.
 *
 * Deze ene regel SQL doet hetzelfde en niets meer: het artikel is met de hand
 * gemaakt zoals elk ander artikel, en alleen het veld dat de UI niet kan
 * uitdrukken wordt erbij gezet. Het archief staat in WAL, dus een tweede
 * verbinding vanaf hetzelfde bestand mag schrijven terwijl de server draait.
 */
function setPlekField(slug: string, kind: PlekKind) {
  const sqlite = new Database(resolve(__dirname, '../../data-e2e/app.db'));
  try {
    sqlite.pragma('busy_timeout = 5000');
    const done = sqlite
      .prepare(`UPDATE entries SET fields = json_set(COALESCE(fields, '{}'), '$.plek', ?) WHERE slug = ?`)
      .run(kind, slug);
    if (done.changes !== 1) throw new Error(`geen artikel met slug ${slug}`);
  } finally {
    sqlite.close();
  }
}

/**
 * Een voorwerp: een gewoon artikel (soort *Relieken*, `/wiki/object`) dat om
 * een soort plek vraagt. Geeft naam en slug terug — de slug omdat `plek-item`
 * ernaar linkt en omdat de sluier hem nergens mag laten zien.
 */
async function newVoorwerp(
  page: Page,
  name: string,
  kind: PlekKind,
): Promise<{ name: string; slug: string; path: string }> {
  await page.goto('/wiki/object');
  const sheet = page.getByRole('dialog', { name: 'Nieuw artikel' });
  // §6: een pagina die net genavigeerd is luistert nog niet.
  await expect(async () => {
    if (!(await sheet.isVisible().catch(() => false))) {
      await page.getByRole('button', { name: 'Nieuw', exact: true }).click({ timeout: 5000 });
    }
    await expect(sheet).toBeVisible({ timeout: 1500 });
  }).toPass({ timeout: 30_000 });
  await sheet.getByLabel('Naam', { exact: true }).fill(name);
  await sheet.getByRole('button', { name: 'Aanmaken' }).click();
  await page.waitForURL('**/e/**');
  const path = new URL(page.url()).pathname;
  const slug = path.replace(/^\/e\//, '');

  setPlekField(slug, kind);
  return { name, slug, path };
}

/** De plek op rung `sort`. Eén locator, want elke assertie hieronder is er een over. */
function plek(page: Page, sort: number): Locator {
  return page.locator(`[data-testid="plek"][data-sort="${sort}"]`);
}

/** Staan in een kamer, met de pagina er echt. */
async function openKamer(page: Page, slug: string) {
  await page.goto(`/kamer/${slug}`);
  await expect(page.getByTestId('kamer-page')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId('kamer-grid')).toBeVisible({ timeout: 20_000 });
}

/** De Keeper schrijft een regel in het grootboek. */
async function grant(page: Page, amount: string, reason: string) {
  const form = page.getByTestId('grootboek-form');
  await expect(form).toBeVisible({ timeout: 20_000 });
  await fillWhenReady(form.getByTestId('grootboek-bedrag'), amount);
  await fillWhenReady(form.getByTestId('grootboek-reden'), reason);
  await form.getByTestId('grootboek-geef').click();
}

test.describe('§79 De kamer', () => {
  test('de Keeper schrijft een regel en het saldo beweegt', async ({ page, browser, isMobile }, info) => {
    test.skip(isMobile, '§79 wordt op de desk bewezen; de telefoon heeft één eigen geval, onderaan dit bestand');
    test.setTimeout(180_000);
    const stamp = `${info.project.name}-${Date.now().toString(36)}`;

    const playerCtx = await browser.newContext();
    const player = await playerCtx.newPage();
    const { character, slug } = await signUpWearing(player, `Kamerbewoner ${stamp}`);
    await playerCtx.close();

    await signIn(page, ...KEEPER);
    await openKamer(page, slug);

    // De pagina gaat over die onderzoeker, en wijst naar zijn artikel terug.
    await expect(page.getByTestId('kamer-onderzoeker')).toHaveText(character);
    await expect(page.getByTestId('kamer-onderzoeker')).toHaveAttribute('href', `/e/${slug}`);
    // Elke rung uit `shape.ts` bestaat vanaf de eerste dag.
    await expect(page.getByTestId('plek')).toHaveCount(12);
    // Een verse kamer heeft niets gekregen en dus niets uitgegeven.
    await expect(page.getByTestId('kamer-balance')).toHaveAttribute('data-balance', '0');
    await expect(page.getByTestId('grootboek-regel')).toHaveCount(0);

    await grant(page, '7', `Eerste avond ${stamp}`);

    // Het saldo ís de som van het grootboek, dus beide moeten bewegen.
    await expect(page.getByTestId('kamer-balance')).toHaveAttribute('data-balance', '7', { timeout: 20_000 });
    const regel = page.getByTestId('grootboek-regel');
    await expect(regel).toHaveCount(1, { timeout: 20_000 });
    await expect(regel).toHaveAttribute('data-delta', '7');
    await expect(regel).toHaveAttribute('data-kind', 'grant');
    await expect(regel).toContainText(`Eerste avond ${stamp}`);

    // Een correctie is een regel erbij en nooit een regel die verandert.
    await grant(page, '-3', `Vergissing ${stamp}`);
    await expect(page.getByTestId('kamer-balance')).toHaveAttribute('data-balance', '4', { timeout: 20_000 });
    await expect(page.getByTestId('grootboek-regel')).toHaveCount(2, { timeout: 20_000 });
    await expect(page.getByTestId('grootboek-regel').first()).toHaveAttribute('data-delta', '-3');
  });

  test('de eigenaar opent een plek, en de kiezer biedt alleen aan wat erop past', async ({
    page,
    browser,
    isMobile,
  }, info) => {
    test.skip(isMobile, '§79 wordt op de desk bewezen');
    test.setTimeout(240_000);
    const stamp = `${info.project.name}-${Date.now().toString(36)}`;

    // De Keeper maakt twee voorwerpen: een dat op een plank hoort en een dat
    // aan de muur hoort. Het tweede is er alleen om *niet* te verschijnen.
    await signIn(page, ...KEEPER);
    const logboek = await newVoorwerp(page, `Logboek ${stamp}`, 'plank');
    const wandkaart = await newVoorwerp(page, `Wandkaart ${stamp}`, 'muur');

    const playerCtx = await browser.newContext();
    const player = await playerCtx.newPage();
    const { slug } = await signUpWearing(player, `Verzamelaar ${stamp}`);

    // Vijf munten, zodat rung 3 (plank, 2) te betalen is en rung 11 (muur, 30)
    // niet.
    await openKamer(page, slug);
    await grant(page, '5', `Beloning ${stamp}`);
    await expect(page.getByTestId('kamer-balance')).toHaveAttribute('data-balance', '5', { timeout: 20_000 });

    // Vanaf hier is het de eigenaar zelf, in zijn eigen venster.
    await openKamer(player, slug);
    await expect(player.getByTestId('kamer-balance')).toHaveAttribute('data-balance', '5');

    const plank = plek(player, 3);
    await expect(plank).toHaveAttribute('data-state', 'locked');
    await expect(plank).toHaveAttribute('data-kind', 'plank');
    await expect(plank.getByTestId('plek-price')).toHaveAttribute('data-price', '2');

    // Een knop die verdwijnt als je twee munten tekortkomt leert niets, dus hij
    // staat er en is gehouden.
    const duur = plek(player, 11);
    await expect(duur.getByTestId('plek-price')).toHaveAttribute('data-price', '30');
    await expect(duur.getByTestId('plek-unlock')).toBeDisabled();

    await expect(plank.getByTestId('plek-unlock')).toBeEnabled();
    await plank.getByTestId('plek-unlock').click();

    await expect(plank).toHaveAttribute('data-state', 'empty', { timeout: 20_000 });
    await expect(plank.getByTestId('plek-empty')).toBeVisible();
    // Betaald uit het grootboek, en niet uit een kolom.
    await expect(player.getByTestId('kamer-balance')).toHaveAttribute('data-balance', '3', { timeout: 20_000 });

    await plank.getByTestId('plek-place').click();
    const picker = player.getByTestId('plek-picker');
    await expect(picker).toBeVisible({ timeout: 20_000 });

    /*
     * ZAAK 3: de kiezer biedt alleen aan wat past. Met een lege zoekbalk staat
     * er wat er ligt te wachten voor *deze* soort plek — de wandkaart hoort aan
     * een muur en mag daar niet bij staan, niet als rij en niet als letter.
     */
    const opties = picker.getByTestId('plek-picker-optie');
    await expect(opties.filter({ hasText: logboek.name })).toHaveCount(1, { timeout: 20_000 });
    await expect(opties.filter({ hasText: wandkaart.name })).toHaveCount(0);
    await expect(picker).not.toContainText('Wandkaart');

    // En er letterlijk om vragen levert niets op.
    await picker.getByTestId('plek-picker-zoek').fill('Wandkaart');
    await expect(picker.getByTestId('plek-picker-leeg')).toBeVisible({ timeout: 20_000 });
    await expect(opties).toHaveCount(0);

    // ZAAK 2, tweede helft: het logboek gaat op de plank.
    await picker.getByTestId('plek-picker-zoek').fill('Logboek');
    await expect(opties.filter({ hasText: logboek.name })).toHaveCount(1, { timeout: 20_000 });
    await opties.filter({ hasText: logboek.name }).click();

    await expect(plank).toHaveAttribute('data-state', 'filled', { timeout: 20_000 });
    const item = plank.getByTestId('plek-item');
    await expect(item).toBeVisible();
    await expect(item).toHaveAttribute('href', `/e/${logboek.slug}`);
    await expect(item).toContainText(logboek.name);
    // Een voorwerp *is* een artikel: de tegel is een deur naar die pagina.
    await item.click();
    await player.waitForURL(`**/e/${logboek.slug}`, { timeout: 20_000 });

    await playerCtx.close();
  });

  test('een ander mag kijken en mag niets aanraken', async ({ page, browser, isMobile }, info) => {
    test.skip(isMobile, '§79 wordt op de desk bewezen');
    test.setTimeout(180_000);
    const stamp = `${info.project.name}-${Date.now().toString(36)}`;

    // De eigenaar, met een kamer, en de Keeper die er iets in stopt zodat er
    // wat te zien valt.
    const ownerCtx = await browser.newContext();
    const owner = await ownerCtx.newPage();
    const { slug } = await signUpWearing(owner, `Gastheer ${stamp}`);
    await ownerCtx.close();

    await signIn(page, ...KEEPER);
    await openKamer(page, slug);
    await grant(page, '4', `Avondje ${stamp}`);
    await expect(page.getByTestId('kamer-balance')).toHaveAttribute('data-balance', '4', { timeout: 20_000 });

    // De tweede speler: geen Keeper, niet de eigenaar. Vanaf hier is dít het
    // scherm waar de zaak op wordt beslist (access-rights.spec.ts' tucht).
    const otherCtx = await browser.newContext();
    const other = await otherCtx.newPage();
    await signUpAs(other, `Bezoeker ${stamp}`);
    await openKamer(other, slug);

    // Kijken mag: het raster staat er, compleet, met de prijzen erop — ook de
    // prijzen van plekken die hij nooit gaat betalen.
    await expect(other.getByTestId('plek')).toHaveCount(12);
    await expect(other.getByTestId('kamer-balance')).toHaveAttribute('data-balance', '4');
    await expect(other.getByTestId('plek-price')).toHaveCount(9);
    await expect(plek(other, 3).getByTestId('plek-price')).toHaveAttribute('data-price', '2');
    await expect(plek(other, 1)).toHaveAttribute('data-state', 'empty');

    // En aanraken niet. Geen van de drie knoppen.
    await expect(other.getByTestId('plek-unlock')).toHaveCount(0);
    await expect(other.getByTestId('plek-place')).toHaveCount(0);
    await expect(other.getByTestId('plek-clear')).toHaveCount(0);

    /*
     * §83 keerde de rest van deze assertie om, en met opzet.
     *
     * §79 hield het grootboek voor de Keeper: het werd voor een ander niet
     * eens *gelezen*, en deze zaak bewees dat de reden van een regel nergens
     * in de pagina stond. Nick, ronde 44: *"Spelers mogen het 'grootboek' ook
     * wel kunnen inzien."* — dus het staat er nu, met de reden erbij, en wat
     * van de Keeper blijft is het formulier eronder en de deur naar de
     * uitdeler.
     *
     * Wat er in ruil voor die omkering bij kwam, staat in `huisraad.spec.ts`:
     * een regel die een artikel noemt dat deze ogen niet mogen zien, komt
     * versluierd terug.
     */
    await expect(other.getByTestId('kamer-grootboek')).toHaveCount(1);
    await expect(other.getByTestId('kamer-grootboek')).toContainText(`Avondje ${stamp}`);
    await expect(other.getByTestId('grootboek-form')).toHaveCount(0);
    await expect(other.getByTestId('grootboek-uitdelen')).toHaveCount(0);

    await otherCtx.close();
  });

  test('wat er ligt en niet gezien mag worden heeft geen naam, geen link en geen soort', async ({
    page,
    browser,
    isMobile,
  }, info) => {
    test.skip(isMobile, '§79 wordt op de desk bewezen');
    test.setTimeout(240_000);
    const stamp = `${info.project.name}-${Date.now().toString(36)}`;
    const secretName = `Zegelring ${stamp}`;

    await signIn(page, ...KEEPER);
    // Een bureau-voorwerp, want rung 0 is een bureau dat vanaf dag één openstaat
    // — zo is er geen munt nodig om de sluier te kunnen bewijzen.
    const secret = await newVoorwerp(page, secretName, 'bureau');

    /*
     * Keeperartikel, en pas *nadat* het er ligt zou ook mogen: de lijst van de
     * kiezer is niet gezijd (`/api/kamers/<id>/voorwerpen` vraagt
     * `visibleEntryCondition`, en een Keeper ziet alles). Het staat hier vóór
     * het neerzetten omdat dat de eerlijke volgorde is: je besluit dat iets
     * geheim is en legt het dan neer.
     */
    await openRights(page);
    await page.getByRole('button', { name: 'Alleen de Keeper' }).click();
    await expect(page.locator('.stamp', { hasText: 'Alleen voor de Keeper' })).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('.save-state')).toHaveText('Opgeslagen', { timeout: 20_000 });
    // De browser had dit artikel in handen voordat het veld erbij gezet werd,
    // dus zet het opnieuw: een autosave die `fields` meestuurt zou de sleutel
    // die de UI niet kent weer kwijt zijn. Idempotent.
    setPlekField(secret.slug, 'bureau');

    const ownerCtx = await browser.newContext();
    const owner = await ownerCtx.newPage();
    const { slug } = await signUpWearing(owner, `Bewaarder ${stamp}`);
    await ownerCtx.close();

    // De Keeper legt het op het bureau van die onderzoeker.
    await openKamer(page, slug);
    const bureau = plek(page, 0);
    await expect(bureau).toHaveAttribute('data-state', 'empty');
    await expect(bureau).toHaveAttribute('data-kind', 'bureau');
    await bureau.getByTestId('plek-place').click();
    const picker = page.getByTestId('plek-picker');
    await expect(picker).toBeVisible({ timeout: 20_000 });
    await picker.getByTestId('plek-picker-zoek').fill('Zegelring');
    const optie = picker.getByTestId('plek-picker-optie').filter({ hasText: secretName });
    await expect(optie).toHaveCount(1, { timeout: 20_000 });
    await optie.click();
    await expect(bureau).toHaveAttribute('data-state', 'filled', { timeout: 20_000 });
    await expect(bureau.getByTestId('plek-item')).toHaveAttribute('href', `/e/${secret.slug}`);

    // En dan de kant die ertoe doet: iemand die het artikel niet mag zien.
    const otherCtx = await browser.newContext();
    const other = await otherCtx.newPage();
    await signUpAs(other, `Nieuwsgierig ${stamp}`);
    await openKamer(other, slug);

    const verhuld = plek(other, 0);
    // Gevúld en naamloos — niet leeg. Een lege plek die eigenlijk vol is, is
    // een leugen die de eigenaar niet verteld heeft.
    await expect(verhuld).toHaveAttribute('data-state', 'veiled', { timeout: 20_000 });
    await expect(verhuld.getByTestId('plek-veiled')).toBeVisible();

    // Eén zin, en verder niets: geen soort, geen prijs, geen plaatje, geen link,
    // geen knop. Zelfs de soort is weggelaten, want dat verschil zou zelf het
    // lek zijn.
    await expect(verhuld.getByTestId('plek-veiled')).toHaveText('Er ligt iets');
    expect((await verhuld.innerText()).trim()).toBe('Er ligt iets');
    expect(await verhuld.getAttribute('data-kind')).toBeNull();
    for (const id of ['plek-kind', 'plek-price', 'plek-item', 'plek-empty', 'plek-unlock', 'plek-place', 'plek-clear']) {
      await expect(verhuld.getByTestId(id)).toHaveCount(0);
    }
    await expect(verhuld.locator('a, img, button')).toHaveCount(0);

    /*
     * En de naam staat nergens — niet in de tekst, en niet in de opmaak. Dat
     * laatste is de helft die een `title` of een `href` betrapt, en de payload
     * van de server erbij (`page.content()`), want een naam die alleen in de
     * RSC-stroom staat is net zo goed gelekt.
     */
    const kamerMarkup = await other.getByTestId('kamer-page').innerHTML();
    for (const needle of [secretName, 'Zegelring', secret.slug, `/e/${secret.slug}`]) {
      expect(kamerMarkup).not.toContain(needle);
    }
    const whole = await other.content();
    for (const needle of [secretName, 'Zegelring', secret.slug]) {
      expect(whole).not.toContain(needle);
    }

    // De controle op de proef: hij mag het artikel inderdaad niet openen.
    const direct = await other.goto(secret.path);
    expect(direct?.status()).toBe(404);

    await otherCtx.close();
  });

  test('het paneel op de spelerspagina is een deur en geen bedieningspaneel', async ({
    page,
    isMobile,
  }, info) => {
    test.skip(isMobile, '§79 wordt op de desk bewezen');
    test.setTimeout(180_000);
    const stamp = `${info.project.name}-${Date.now().toString(36)}`;

    const { slug } = await signUpWearing(page, `Deurwachter ${stamp}`);

    // Het adres van de eigen spelerspagina komt van de knop op /you, zodat de
    // slug hier niet nagerekend hoeft te worden (`lib/spelers/service.ts` is de
    // enige die hem mag uitrekenen).
    await page.goto('/you');
    const door = page.getByRole('main').getByRole('link', { name: 'Jouw spelerspagina' });
    await expect(door).toBeVisible({ timeout: 20_000 });
    const spelerPath = new URL((await door.getAttribute('href')) ?? '', 'http://x').pathname;
    await page.goto(spelerPath);

    const paneel = page.getByTestId('panel-kamer');
    await expect(paneel).toBeVisible({ timeout: 20_000 });
    await expect(paneel.getByTestId('kamer-panel')).toBeVisible();
    await expect(paneel.getByTestId('kamer-panel-samenvatting')).toBeVisible();
    // Het kleinste ware ding: een saldo en hoeveel van de open plekken gevuld
    // zijn. Drie plekken staan vanaf dag één open, er ligt niets.
    await expect(paneel.getByTestId('kamer-panel-samenvatting')).toContainText('0 van 3');

    // Een deur, en hij komt uit in de kamer.
    const deur = paneel.getByTestId('kamer-panel-deur');
    await expect(deur).toHaveAttribute('href', `/kamer/${slug}`);

    // §77: niets op een paneel is te bedienen. Geen knop, geen invoervak, geen
    // formulier — anders zijn er twee wegen naar één feit.
    await expect(paneel.locator('button, input, form, select, textarea')).toHaveCount(0);

    await deur.click();
    await page.waitForURL(`**/kamer/${slug}`, { timeout: 20_000 });
    await expect(page.getByTestId('kamer-grid')).toBeVisible({ timeout: 20_000 });
  });

  test('op een telefoon blijft het raster een kamer', async ({ page, isMobile }, info) => {
    test.skip(!isMobile, 'dit geval gaat juist over de telefoon (390 px)');
    test.setTimeout(180_000);
    const stamp = `${info.project.name}-${Date.now().toString(36)}`;

    const { slug } = await signUpWearing(page, `Telefoon ${stamp}`);
    await openKamer(page, slug);

    await expect(page.getByTestId('plek')).toHaveCount(12);

    // Twee kolommen (`app/kamer.css`, < 560px), en niets dat de pagina opzij
    // duwt: twaalf plekken onder elkaar is een lijst van een halve meter.
    const viewport = page.viewportSize()!;
    const eerste = (await plek(page, 0).boundingBox())!;
    const tweede = (await plek(page, 1).boundingBox())!;
    expect(tweede.y).toBeCloseTo(eerste.y, 0);
    expect(tweede.x).toBeGreaterThan(eerste.x);
    expect(eerste.x).toBeGreaterThanOrEqual(0);
    expect(tweede.x + tweede.width).toBeLessThanOrEqual(viewport.width + 1);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1,
    );
    expect(overflow).toBe(true);

    // En de toestanden zijn nog uit elkaar te houden: open en leeg zegt "leeg",
    // op slot zegt wat het kost.
    await expect(plek(page, 0)).toHaveAttribute('data-state', 'empty');
    await expect(plek(page, 0).getByTestId('plek-empty')).toBeVisible();
    await expect(plek(page, 3)).toHaveAttribute('data-state', 'locked');
    await expect(plek(page, 3).getByTestId('plek-price')).toBeVisible();
    await expect(plek(page, 3).getByTestId('plek-price')).toHaveAttribute('data-price', '2');
  });
});
