import { expect, test, type Locator, type Page } from '@playwright/test';
import { becomeInvestigator, editArticle, expectPlekken, fillWhenReady, inviteCode, newEntryButton, openRights, setPlekken, signIn } from './helpers';

/**
 * §80: huisraad — de catalogus, het kopen, en wat een kamer je zegt te geven.
 *
 * Het model voor dit bestand is `kamer.spec.ts` (§79, dezelfde pagina) en de
 * tucht komt uit `access-rights.spec.ts`: elke rechtenassertie wordt gedaan
 * vanaf de kant van wie er *niet* bij mag. Een soort die alleen op het scherm
 * van de Keeper ontbreekt is versiering; een sluier die alleen de tegel
 * verbergt en de effectregels eronder laat staan is geen sluier.
 *
 * Twee dingen die §79 nog met SQL moest doen, doet dit bestand met de hand:
 *
 *  1. **Het artikel wordt in de browser gemaakt.** §79 kon dat niet — er was
 *     geen invoervak voor de *sleutel* van een veld, dus geen weg om een
 *     artikel het veld `plek` te geven, en `kamer.spec.ts` zet die ene regel
 *     daarom met `better-sqlite3` naast de app om. §80 zaait de soort
 *     *Huisraad* mét de sleutels `plek`, `prijs` en `effect`, dus hier is de
 *     hele weg de weg die Nick ook loopt: `/wiki/huisraad` → Nieuw → de drie
 *     velden invullen. Er staat in dit bestand geen regel SQL, en dat is de
 *     bedoeling.
 *  2. **De Keeper zet de rechten vóór de velden** (de sluierzaak). §79 leerde
 *     dat een autosave die `fields` meestuurt een sleutel kan kwijtraken die
 *     de UI niet kent; hier kent de UI ze alle drie, maar de volgorde blijft
 *     de veilige: eerst de kant, dan de velden, zodat de laatste schrijfactie
 *     altijd die van de velden is.
 *
 * De vorm van een kamer (`lib/kamers/shape.ts`) is dezelfde ladder van twaalf
 * plekken als in §79, en dit bestand rekent op de eerste drie rungen, die
 * vanaf dag één gratis openstaan:
 *
 *   sort 0  bureau 0     sort 1  plank 0     sort 2  muur 0     sort 3 plank 2
 *
 * Geen enkele test hieronder hoeft dus een plek te openen om iets te kunnen
 * kopen: elke munt die wordt uitgegeven gaat aan huisraad, en dat is precies
 * het bedrag dat nagerekend wordt.
 *
 * Alles wacht web-first (§6). Elke schrijfactie loopt over een API-route en
 * daarna een `router.refresh()`, dus de assertie is altijd een `expect` op wat
 * de server terugstuurt — `data-state`, `data-balance`, `data-afford` — en
 * nergens een `waitForTimeout` om die ronde mee dicht te plamuren.
 */

const KEEPER = ['Keeper', 'abbeytower34'] as const;

/** De vier kinds uit `shape.ts`, zoals ze in `data-kind` en in het veld `plek` staan. */
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
 * artikel dat aan een account vastzit. Geeft de slug terug: het adres van de
 * kamer is `/kamer/<die slug>`.
 */
async function signUpWearing(page: Page, name: string): Promise<{ character: string; slug: string }> {
  await signUpAs(page, name);
  const character = `Onderzoeker ${name}`;
  const path = await becomeInvestigator(page, character);
  return { character, slug: path.replace(/^\/e\//, '') };
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
      await newEntryButton(page).click({ timeout: 5000 });
    }
    await expect(sheet).toBeVisible({ timeout: 1500 });
  }).toPass({ timeout: 30_000 });
  return sheet;
}

type Huisraad = { name: string; slug: string; path: string; effect: string[]; prijs: number };

/**
 * §80: een stuk huisraad, gemaakt zoals de Keeper het maakt — door de browser
 * en nergens anders.
 *
 * De soort *Huisraad* is geseed met drie velden en, belangrijker, met de drie
 * *sleutels* die de kamer kent (`plek`, `prijs`, `effect`). Daardoor is dit een
 * gewoon artikel invullen: een keuzelijst, een getal en een longtext met één
 * effect per regel.
 *
 * `keeperOnly` zet de Keeperkant **vóór** de velden. De rechten staan op de
 * bewerkkant van hetzelfde `?new=1`-scherm, dus dat scheelt een navigatie — en
 * het houdt de laatste schrijfactie die van de velden, zodat geen autosave er
 * nog overheen kan gaan.
 *
 * Leest aan het eind terug wat er is opgeslagen. Dat is geen wantrouwen maar de
 * kern van zaak 1: een prijs en twee effectregels die de reload niet overleven
 * zijn geen prijs en geen effectregels.
 */
async function newHuisraad(
  page: Page,
  spec: { name: string; plek: PlekKind; prijs: number; effect: string[]; keeperOnly?: boolean },
): Promise<Huisraad> {
  await page.goto('/wiki/huisraad');
  const sheet = page.getByRole('dialog', { name: 'Nieuw artikel' });
  await expect(async () => {
    if (!(await sheet.isVisible().catch(() => false))) {
      await page.getByRole('button', { name: 'Nieuw', exact: true }).click({ timeout: 5000 });
    }
    await expect(sheet).toBeVisible({ timeout: 1500 });
  }).toPass({ timeout: 30_000 });
  // De knop op /wiki/huisraad kiest de soort al; dit is de assertie dat dat zo is.
  await expect(sheet.getByRole('radio', { name: 'Huisraad', exact: true })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await sheet.getByLabel('Naam', { exact: true }).fill(spec.name);
  await sheet.getByRole('button', { name: 'Aanmaken' }).click();
  await page.waitForURL('**/e/**');
  const path = new URL(page.url()).pathname;
  const slug = path.replace(/^\/e\//, '');

  if (spec.keeperOnly) {
    await openRights(page);
    await page.getByRole('button', { name: 'Alleen de Keeper' }).click();
    await expect(page.locator('.stamp', { hasText: 'Alleen voor de Keeper' })).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.locator('.save-state')).not.toHaveText('Opslaan…', { timeout: 20_000 });
  }

  const effect = spec.effect.join('\n');
  await unfoldInfobox(page);
  await setPlekken(page, [spec.plek]);
  await fillWhenReady(page.locator('#field-prijs'), String(spec.prijs));
  await page.locator('#field-prijs').blur();
  await fillWhenReady(page.locator('#field-effect'), effect);
  await page.locator('#field-effect').blur();

  /*
   * Wachten tot er niets meer onderweg is, en **niet** op "Opgeslagen".
   *
   * Dat woord is er niet altijd. Een longtext van de infobox zit in de
   * live-kamer (§21) zodra die verbonden is: de tekst gaat dan per aanslag
   * naar de kamer en niet door de autosave van de pagina, en de melding van de
   * kamer valt terug op *niets* als ze klaar is. "Opgeslagen" is daar dus een
   * moment dat je kunt missen — en of de kamer al verbonden is, verschilt per
   * run. "Opslaan…" staat er wél zolang een van beide wegen bezig is, en dat
   * is de enige vraag die deze regel stelt: mag de navigatie hieronder een
   * schrijfactie onderbreken.
   */
  await expect(page.locator('.save-state')).not.toHaveText('Opslaan…', { timeout: 20_000 });

  /*
   * En dan de enige proef die telt: wat de server teruggeeft. Dit is wat de
   * catalogus straks leest, dus het wordt hier gelezen zoals zij het leest —
   * opnieuw opgehaald, niet uit het scherm dat de letters zelf typte. In een
   * `toPass`, want een live-kamer schrijft haar tekst een tel na het typen weg
   * en een herlezing is gratis.
   */
  await expect(async () => {
    await page.goto(path);
    await editArticle(page);
    await unfoldInfobox(page);
    await expectPlekken(page, [spec.plek]);
    await expect(page.locator('#field-prijs')).toHaveValue(String(spec.prijs), { timeout: 5000 });
    await expect(page.locator('#field-effect')).toHaveValue(effect, { timeout: 5000 });
  }).toPass({ timeout: 60_000 });

  return { name: spec.name, slug, path, effect: spec.effect, prijs: spec.prijs };
}

/** De plek op rung `sort`. */
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

/** "Neerzetten" indrukken tot het blad antwoordt (§6), en het blad teruggeven. */
async function openPicker(page: Page, sort: number): Promise<Locator> {
  const tile = plek(page, sort);
  await expect(tile).toHaveAttribute('data-state', 'empty', { timeout: 20_000 });
  const picker = page.getByTestId('plek-picker');
  await expect(async () => {
    if (!(await picker.isVisible().catch(() => false))) {
      await tile.getByTestId('plek-place').click({ timeout: 5000 });
    }
    await expect(picker).toBeVisible({ timeout: 1500 });
  }).toPass({ timeout: 30_000 });
  // Het blad opent altijd op "Wat je al hebt": dat is de eerste vraag.
  await expect(picker).toHaveAttribute('data-tab', 'bezit');
  return picker;
}

/**
 * Naar het tweede tabblad, en wachten tot de catalogus een *antwoord* is.
 *
 * `plek-catalogus-bezig` is "nog niet gevraagd", en dat is niet hetzelfde als
 * "niets te koop" — een assertie die de eerste voor de tweede aanziet zou
 * altijd slagen.
 */
async function catalogus(picker: Locator) {
  await expect(async () => {
    if ((await picker.getAttribute('data-tab')) !== 'catalogus') {
      await picker.getByTestId('plek-picker-tab-catalogus').click({ timeout: 5000 });
    }
    await expect(picker).toHaveAttribute('data-tab', 'catalogus', { timeout: 1500 });
  }).toPass({ timeout: 20_000 });
  await expect(picker.getByTestId('plek-catalogus-bezig')).toHaveCount(0, { timeout: 20_000 });
}

/** Eén rij van de catalogus, gevonden op de naam die deze run uniek maakt. */
function rij(picker: Locator, name: string): Locator {
  return picker.getByTestId('plek-catalogus-rij').filter({ hasText: name });
}

/** Het blad dichtdoen zonder iets te kopen. */
async function closePicker(page: Page) {
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('plek-picker')).toHaveCount(0, { timeout: 10_000 });
}

test.describe('§80 Huisraad', () => {
  /**
   * ZAAK 1 — alleen de Keeper maakt huisraad; het slot aan de binnenkant.
   *
   * De helft die telt: de server weigert, ook als het blad wordt omzeild
   * (§17, regel 4 — lezers gebruiken de SQL-voorwaarde, schrijvers de
   * boolean). De andere helft — de soort die in het blad van een speler niet
   * eens hoort te staan — staat hieronder in een eigen geval, want die is
   * niet gebouwd; zie de test daarna.
   */
  test('alleen de Keeper maakt een stuk huisraad', async ({ page, browser, isMobile }, info) => {
    test.skip(isMobile, '§80 wordt op de desk bewezen; de telefoon heeft één eigen geval, onderaan');
    test.setTimeout(240_000);
    const stamp = `${info.project.name}-${Date.now().toString(36)}`;

    const playerCtx = await browser.newContext();
    const player = await playerCtx.newPage();
    await signUpAs(player, `Timmerman ${stamp}`);
    await becomeInvestigator(player, `Onderzoeker Timmerman ${stamp}`);

    // De server, die de zin zegt tegen een verzoek dat het blad omzeilt.
    const refused = await player.request.post('/api/entries', {
      data: { typeSlug: 'huisraad', name: `Stiekeme stoel ${stamp}` },
    });
    expect(refused.status()).toBe(400);
    expect(await refused.json()).toMatchObject({ error: 'Alleen de Keeper maakt deze soort.' });

    // De Keeper: dezelfde lijst, mét de soort erin.
    await signIn(page, ...KEEPER);
    await page.goto('/');
    const keeperSheet = await openNewEntrySheet(page);
    await expect(keeperSheet.getByRole('radio', { name: 'Huisraad', exact: true })).toHaveCount(1);
    await page.keyboard.press('Escape');

    // En de weigering was een weigering: het artikel is er niet, ook niet voor
    // de Keeper, die alles ziet.
    const looked = await page.request.get(
      `/api/suggest?q=${encodeURIComponent(`Stiekeme stoel ${stamp}`)}&limit=5`,
    );
    expect(looked.ok()).toBe(true);
    expect(JSON.stringify(await looked.json())).not.toContain('Stiekeme stoel');

    // Wat de Keeper wél maakt: een prijs en twee effectregels, door de browser.
    const stoel = await newHuisraad(page, {
      name: `Leunstoel ${stamp}`,
      plek: 'plank',
      prijs: 4,
      effect: ['+1 op Bibliotheek in deze kamer', 'Een nacht in de stoel telt als rust'],
    });
    expect(stoel.slug).toBeTruthy();

    await playerCtx.close();
  });

  /**
   * de app dit vandaag niet doet, en niet omdat de assertie wankel is.
   *
   * §80 vraagt het slot aan beide kanten van de deur: *"de soort staat niet in
   * de nieuw-artikel-lijst van een speler, én de server weigert het"*. De
   * server weigert (de test hierboven). Het blad niet: de soort *Huisraad*
   * staat gewoon tussen de chips van een speler, en pas als hij hem kiest, een
   * naam typt en op Aanmaken drukt krijgt hij "Alleen de Keeper maakt deze
   * soort." — een aanbod dat daarna geweigerd wordt, wat precies het scherm is
   * dat §6 "erger dan een dat het nooit aanbood" noemt.
   *
   * Waar het zit: `app/(app)/layout.tsx` geeft `listEntryTypes()` ongefilterd
   * aan `UiProvider`, `EntryTypeLite` (`components/ui/UiProvider.tsx`) draagt
   * `keeperMade` niet, en `NewEntrySheet` (`const types = allTypes`) vraagt er
   * dus ook niet naar. `createEntry` is het enige dat de vlag leest.
   *
   * Als dit geval ooit *slaagt* meldt Playwright dat ("expected to fail") —
   */
  test('een speler ziet de soort Huisraad niet in zijn nieuw-artikel-lijst', async ({
    page,
    isMobile,
  }, info) => {
    test.skip(isMobile, '§80 wordt op de desk bewezen');
    test.setTimeout(180_000);
    const stamp = `${info.project.name}-${Date.now().toString(36)}`;

    await signUpAs(page, `Meubelkijker ${stamp}`);
    await page.goto('/');
    const sheet = await openNewEntrySheet(page);
    // De lijst is er echt — anders zou de assertie eronder om niets slagen.
    expect(await sheet.getByRole('radio').count()).toBeGreaterThan(2);
    await expect(sheet.getByRole('radio', { name: 'Huisraad', exact: true })).toHaveCount(0);
  });

  /**
   * ZAAK 2, 3 en 4 — de catalogus, de prijs die nog niet te betalen is, en wat
   * deze kamer je geeft.
   *
   * Eén test, omdat het één beweging is: je staat voor een lege plank, je ziet
   * wat er te koop is, je hebt het niet, je krijgt het, je koopt het, en
   * onderaan de pagina staat wat het je zegt te geven. Twee dingen worden
   * gekocht (een op de plank, een aan de muur) omdat de assertie die ertoe doet
   * — *er wordt nergens opgeteld* — twee regels nodig heeft die opgeteld zouden
   * kunnen worden. Ze geven allebei "+1": een som zou "+2" zijn, en die staat
   * nergens.
   */
  test('de catalogus biedt aan wat past, wat te duur is blijft staan, en gekocht wordt het een lijst', async ({
    page,
    browser,
    isMobile,
  }, info) => {
    test.skip(isMobile, '§80 wordt op de desk bewezen');
    test.setTimeout(300_000);
    const stamp = `${info.project.name}-${Date.now().toString(36)}`;

    await signIn(page, ...KEEPER);
    const stoel = await newHuisraad(page, {
      name: `Leesstoel ${stamp}`,
      plek: 'plank',
      prijs: 4,
      effect: ['+1 op Bibliotheek in deze kamer', 'Een nacht in de stoel telt als rust'],
    });
    // Hoort aan een muur en is er alleen om *niet* in de plankcatalogus te staan.
    const kleed = await newHuisraad(page, {
      name: `Wandkleed ${stamp}`,
      plek: 'muur',
      prijs: 3,
      effect: ['+1 op Charme bij bezoek'],
    });

    const ownerCtx = await browser.newContext();
    const owner = await ownerCtx.newPage();
    const { slug } = await signUpWearing(owner, `Bewoner ${stamp}`);

    /* ---------------------------------------------------- zaak 2: de lijst */

    await openKamer(owner, slug);
    await expect(owner.getByTestId('kamer-balance')).toHaveAttribute('data-balance', '0');
    // Rung 1 is een plank die vanaf dag één open en leeg is.
    const plank = plek(owner, 1);
    await expect(plank).toHaveAttribute('data-kind', 'plank');
    let picker = await openPicker(owner, 1);
    await catalogus(picker);

    const stoelRij = rij(picker, stoel.name);
    await expect(stoelRij).toHaveCount(1, { timeout: 20_000 });
    await expect(stoelRij).toHaveAttribute('data-price', '4');
    await expect(stoelRij.getByTestId('plek-catalogus-prijs')).toHaveText('4 munten');
    // Wat het zegt te doen staat op de rij zelf, want dat is de vraag die
    // iemand stelt op het moment van kopen.
    const regels = stoelRij.getByTestId('plek-catalogus-effect');
    await expect(regels).toHaveCount(2);
    await expect(regels.nth(0)).toHaveText(stoel.effect[0]);
    await expect(regels.nth(1)).toHaveText(stoel.effect[1]);

    // En wat op een andere soort plek hoort staat er niet — niet als rij, en
    // niet in de opmaak (wat een `title` of een `href` zou betrappen).
    await expect(rij(picker, kleed.name)).toHaveCount(0);
    expect(await picker.innerHTML()).not.toContain('Wandkleed');

    /* ------------------------------------------------ zaak 3: nog niet, wel te zien */

    await expect(picker.getByTestId('plek-picker-saldo')).toHaveText('0 munten');
    await expect(stoelRij).toHaveAttribute('data-afford', 'nee');
    const koop = stoelRij.getByTestId('plek-koop');
    await expect(koop).toBeDisabled();
    await expect(koop).toHaveAttribute('title', /nog 4 munten/);
    await closePicker(owner);

    // De Keeper schrijft zes munten bij: genoeg voor de stoel, met twee over,
    // zodat het saldo straks een aftrekking is en geen nul.
    await openKamer(page, slug);
    await grant(page, '6', `Meubelgeld ${stamp}`);
    await expect(page.getByTestId('kamer-balance')).toHaveAttribute('data-balance', '6', {
      timeout: 20_000,
    });

    await openKamer(owner, slug);
    await expect(owner.getByTestId('kamer-balance')).toHaveAttribute('data-balance', '6');
    picker = await openPicker(owner, 1);
    await catalogus(picker);
    const stoelNu = rij(picker, stoel.name);
    await expect(stoelNu).toHaveAttribute('data-afford', 'ja', { timeout: 20_000 });
    await expect(stoelNu.getByTestId('plek-koop')).toBeEnabled();
    await stoelNu.getByTestId('plek-koop').click();

    // De plek vult zich, en het saldo daalt met precies de prijs.
    await expect(plank).toHaveAttribute('data-state', 'filled', { timeout: 20_000 });
    await expect(plank.getByTestId('plek-item')).toHaveAttribute('href', `/e/${stoel.slug}`);
    await expect(plank.getByTestId('plek-item')).toContainText(stoel.name);
    await expect(owner.getByTestId('kamer-balance')).toHaveAttribute('data-balance', '2', {
      timeout: 20_000,
    });

    // Het saldo ís de som van het grootboek, en het grootboek is de Keeper's.
    await openKamer(page, slug);
    await expect(page.getByTestId('kamer-balance')).toHaveAttribute('data-balance', '2');
    const gekocht = page.getByTestId('grootboek-regel').filter({ hasText: stoel.name });
    await expect(gekocht).toHaveCount(1, { timeout: 20_000 });
    await expect(gekocht).toHaveAttribute('data-kind', 'item');
    await expect(gekocht).toHaveAttribute('data-delta', '-4');

    /* --------------------------------- zaak 4: een lijst, en nergens een som */

    // Twee munten erbij, en het wandkleed gaat aan de muur (rung 2, gratis
    // open): twee dingen met elk "+1", en dus twee regels om op te tellen.
    await grant(page, '2', `Wandkleedgeld ${stamp}`);
    await expect(page.getByTestId('kamer-balance')).toHaveAttribute('data-balance', '4', {
      timeout: 20_000,
    });

    await openKamer(owner, slug);
    const muur = plek(owner, 2);
    await expect(muur).toHaveAttribute('data-kind', 'muur');
    picker = await openPicker(owner, 2);
    await catalogus(picker);
    const kleedRij = rij(picker, kleed.name);
    await expect(kleedRij).toHaveCount(1, { timeout: 20_000 });
    await expect(kleedRij).toHaveAttribute('data-afford', 'ja');
    await kleedRij.getByTestId('plek-koop').click();
    await expect(muur).toHaveAttribute('data-state', 'filled', { timeout: 20_000 });
    await expect(owner.getByTestId('kamer-balance')).toHaveAttribute('data-balance', '1', {
      timeout: 20_000,
    });

    const effecten = owner.getByTestId('kamer-effecten');
    await expect(effecten).toBeVisible({ timeout: 20_000 });
    await expect(owner.getByTestId('kamer-effect')).toHaveCount(2);
    await expect(owner.getByTestId('kamer-effect-regel')).toHaveCount(3);

    // Elk ding met zijn eigen naam erbij, en de naam is een deur naar zijn artikel.
    const stoelBlok = owner.locator(`[data-testid="kamer-effect"][data-name="${stoel.name}"]`);
    await expect(stoelBlok).toHaveCount(1);
    await expect(stoelBlok.getByTestId('kamer-effect-naam')).toHaveAttribute(
      'href',
      `/e/${stoel.slug}`,
    );
    await expect(stoelBlok.getByTestId('kamer-effect-regel')).toHaveCount(2);

    /*
     * En dan de regel waar rule 78 om draait: het archief somt op en telt
     * nooit op. De hele sectie is precies de kop, de twee namen en de drie
     * regels — geen vierde regel, geen getal dat er niet in stond. "+1" en
     * "+1" staan er allebei; "+2" staat nergens, ook niet in de opmaak, en er
     * is niets dat zich een totaal noemt.
     */
    const shown = (await effecten.innerText())
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
    expect(shown).toEqual([
      'Wat deze kamer je geeft',
      stoel.name,
      ...stoel.effect,
      kleed.name,
      ...kleed.effect,
    ]);
    const sectie = await effecten.innerHTML();
    expect(sectie).not.toContain('+2');
    expect(sectie).not.toMatch(/totaal|total|som(?=[^m])/i);
    expect(await owner.getByTestId('kamer-page').innerHTML()).not.toContain('+2');

    await ownerCtx.close();
  });

  /**
   * ZAAK 5 — twee onderzoekers, hetzelfde stuk huisraad.
   *
   * Dat is het hele verschil met een voorwerp (`one_of_a_kind`), en de
   * tegenstelling zelf staat in `tests/unit/huisraad.test.ts`. Hier wordt
   * alleen bewezen dat het in de browser ook echt gebeurt: de tweede speler
   * vindt hetzelfde stuk nog gewoon in zijn catalogus nadat de eerste het
   * gekocht heeft, en koopt het.
   */
  test('twee onderzoekers mogen hetzelfde stuk huisraad bezitten', async ({
    page,
    browser,
    isMobile,
  }, info) => {
    test.skip(isMobile, '§80 wordt op de desk bewezen');
    test.setTimeout(300_000);
    const stamp = `${info.project.name}-${Date.now().toString(36)}`;

    await signIn(page, ...KEEPER);
    const lamp = await newHuisraad(page, {
      name: `Leeslamp ${stamp}`,
      plek: 'plank',
      prijs: 2,
      effect: ['+1 op Speuren bij kaarslicht'],
    });

    const eersteCtx = await browser.newContext();
    const eerste = await eersteCtx.newPage();
    const een = await signUpWearing(eerste, `Anna ${stamp}`);
    const tweedeCtx = await browser.newContext();
    const tweede = await tweedeCtx.newPage();
    const twee = await signUpWearing(tweede, `Bram ${stamp}`);

    for (const slug of [een.slug, twee.slug]) {
      await openKamer(page, slug);
      await grant(page, '2', `Lampgeld ${stamp}`);
      await expect(page.getByTestId('kamer-balance')).toHaveAttribute('data-balance', '2', {
        timeout: 20_000,
      });
    }

    // De eerste koopt hem.
    await openKamer(eerste, een.slug);
    let picker = await openPicker(eerste, 1);
    await catalogus(picker);
    await expect(rij(picker, lamp.name)).toHaveAttribute('data-afford', 'ja', { timeout: 20_000 });
    await rij(picker, lamp.name).getByTestId('plek-koop').click();
    await expect(plek(eerste, 1)).toHaveAttribute('data-state', 'filled', { timeout: 20_000 });
    await expect(eerste.getByTestId('kamer-balance')).toHaveAttribute('data-balance', '0', {
      timeout: 20_000,
    });

    // En in de kamer van de tweede staat hij nog gewoon te koop.
    await openKamer(tweede, twee.slug);
    picker = await openPicker(tweede, 1);
    await catalogus(picker);
    const zelfde = rij(picker, lamp.name);
    await expect(zelfde).toHaveCount(1, { timeout: 20_000 });
    await expect(zelfde).toHaveAttribute('data-afford', 'ja');
    await zelfde.getByTestId('plek-koop').click();
    await expect(plek(tweede, 1)).toHaveAttribute('data-state', 'filled', { timeout: 20_000 });
    await expect(plek(tweede, 1).getByTestId('plek-item')).toHaveAttribute(
      'href',
      `/e/${lamp.slug}`,
    );
    await expect(tweede.getByTestId('kamer-balance')).toHaveAttribute('data-balance', '0', {
      timeout: 20_000,
    });

    // Allebei hun kamers zeggen hetzelfde, want allebei bezitten ze het.
    for (const [who, waar] of [
      [eerste, een.slug],
      [tweede, twee.slug],
    ] as const) {
      await openKamer(who, waar);
      const blok = who.locator(`[data-testid="kamer-effect"][data-name="${lamp.name}"]`);
      await expect(blok).toHaveCount(1, { timeout: 20_000 });
      await expect(blok.getByTestId('kamer-effect-regel')).toHaveText([lamp.effect[0]]);
    }

    await eersteCtx.close();
    await tweedeCtx.close();
  });

  /**
   * ZAAK 6 — de sluier houdt, en §80's helft ervan: wat er versluierd ligt
   * draagt **niets** bij aan de lijst eronder.
   *
   * Dit is de assertie die het hele ding overeind houdt. "Er ligt iets" op de
   * tegel en drie regels eronder waar precies staat wat het doet, is geen
   * sluier maar een omweg. Dus: geen regel, geen naam, geen aantal — en niet in
   * de tekst én niet in de opmaak, waar een `title` of een `href` het alsnog
   * zou verklappen.
   */
  test('een versluierd stuk huisraad draagt geen effectregel bij', async ({
    page,
    browser,
    isMobile,
  }, info) => {
    test.skip(isMobile, '§80 wordt op de desk bewezen');
    test.setTimeout(300_000);
    const stamp = `${info.project.name}-${Date.now().toString(36)}`;
    const fluistert = `Fluistert de naam van wie erin kijkt ${stamp}`;
    const nachtmerrie = `Nachtmerrieregel ${stamp}`;

    await signIn(page, ...KEEPER);
    // Rung 0 is een bureau dat vanaf dag één openstaat: geen munt nodig om de
    // sluier te kunnen bewijzen, en de Keeper legt het neer (`placeItem`) in
    // plaats van het te verkopen — cadeau doen kost niets en schrijft niets.
    const spiegel = await newHuisraad(page, {
      name: `Zwarte spiegel ${stamp}`,
      plek: 'bureau',
      prijs: 5,
      effect: [fluistert, nachtmerrie],
      keeperOnly: true,
    });

    const ownerCtx = await browser.newContext();
    const owner = await ownerCtx.newPage();
    const { slug } = await signUpWearing(owner, `Bewaarder ${stamp}`);
    await ownerCtx.close();

    await openKamer(page, slug);
    const bureau = plek(page, 0);
    const picker = await openPicker(page, 0);
    await picker.getByTestId('plek-picker-zoek').fill('Zwarte spiegel');
    const optie = picker.getByTestId('plek-picker-optie').filter({ hasText: spiegel.name });
    await expect(optie).toHaveCount(1, { timeout: 20_000 });
    await optie.click();
    await expect(bureau).toHaveAttribute('data-state', 'filled', { timeout: 20_000 });

    // Voor de Keeper, die alles mag zien, staat het er gewoon. Dat is de
    // tegenproef: hieronder gaat het erom dat dezelfde pagina iets anders zegt.
    await expect(
      page.locator(`[data-testid="kamer-effect"][data-name="${spiegel.name}"]`),
    ).toHaveCount(1, { timeout: 20_000 });
    await expect(page.getByTestId('kamer-effect-regel')).toHaveText([fluistert, nachtmerrie]);

    // En dan de kant die ertoe doet: iemand die het artikel niet mag zien.
    const otherCtx = await browser.newContext();
    const other = await otherCtx.newPage();
    await signUpAs(other, `Nieuwsgierig ${stamp}`);
    await openKamer(other, slug);

    const verhuld = plek(other, 0);
    await expect(verhuld).toHaveAttribute('data-state', 'veiled', { timeout: 20_000 });
    await expect(verhuld.getByTestId('plek-veiled')).toHaveText('Er ligt iets');

    // §80: en eronder staat niets. Niet de naam, niet de regels, geen aantal —
    // er ligt verder niets in deze kamer, dus de kop is er niet eens.
    await expect(other.getByTestId('kamer-effecten')).toHaveCount(0);
    await expect(other.getByTestId('kamer-effect')).toHaveCount(0);
    await expect(other.getByTestId('kamer-effect-regel')).toHaveCount(0);

    const markup = await other.getByTestId('kamer-page').innerHTML();
    for (const needle of [fluistert, nachtmerrie, spiegel.name, 'Zwarte spiegel', spiegel.slug]) {
      expect(markup).not.toContain(needle);
    }
    // En ook niet in wat de server stuurde: een regel die alleen in de
    // RSC-stroom staat is net zo goed gelekt.
    const whole = await other.content();
    for (const needle of [fluistert, nachtmerrie, 'Zwarte spiegel', spiegel.slug]) {
      expect(whole).not.toContain(needle);
    }

    // De controle op de proef: hij mag het artikel inderdaad niet openen.
    const direct = await other.goto(spiegel.path);
    expect(direct?.status()).toBe(404);

    await otherCtx.close();
  });

  /**
   * ZAAK 7 — het sleutelvakje in Beheer, klein gehouden.
   *
   * §79 kon geen soort maken die in een kamer past omdat de sleutel van een
   * veld nergens te zetten was; §80 zet hem. De ene voorzichtigheid die erbij
   * hoort is de hele test: een veld dat er al is houdt zijn sleutel voor altijd,
   * want hernoemen zou elke al ingevulde waarde in `entries.fields` wezen maken.
   */
  test('de sleutel van een nieuw veld is te zetten, die van een bestaand veld niet', async ({
    page,
    isMobile,
  }) => {
    test.skip(isMobile, '§80 wordt op de desk bewezen');
    test.setTimeout(180_000);

    await signIn(page, ...KEEPER);
    await page.goto('/admin');
    await page.getByRole('tab', { name: 'Soorten artikelen' }).click();

    const editor = page
      .locator('details.admin-type')
      .filter({ has: page.locator('summary', { hasText: 'Huisraad' }) });
    await expect(editor).toHaveCount(1);
    await editor.locator('summary').click();

    // De drie geseede velden: hun sleutel staat er als tekst, en nergens een vak.
    await expect(editor.getByTestId('veld-sleutel-vast')).toHaveCount(3);
    for (const key of ['plek', 'prijs', 'effect']) {
      await expect(
        editor.locator(`[data-testid="veld-sleutel-vast"][data-field-key="${key}"]`),
      ).toHaveCount(1);
    }
    await expect(editor.locator('input[data-testid="veld-sleutel-vast"]')).toHaveCount(0);
    await expect(editor.getByTestId('veld-sleutel')).toHaveCount(0);

    // Een veld dat in déze bewerking bijkomt krijgt er wel een, en hij volgt
    // het label tot de Keeper hem zelf aanraakt.
    await editor.getByRole('button', { name: 'Veld toevoegen' }).click();
    const sleutel = editor.getByTestId('veld-sleutel');
    await expect(sleutel).toHaveCount(1);
    await editor.getByLabel('Naam van veld 4').fill('Gewicht in kisten');
    await expect(sleutel).toHaveValue('gewicht_in_kisten');

    // En hij is van de Keeper: wat hij typt is wat er straks staat.
    await sleutel.fill('gewicht');
    await expect(sleutel).toHaveValue('gewicht');
    // Niet opslaan: deze soort blijft zoals hij was, voor elke andere test.
    await expect(editor.getByTestId('veld-sleutel-vast')).toHaveCount(3);
  });

  /**
   * ZAAK 8 — de telefoon, één geval.
   *
   * De catalogus is een tabblad in een blad dat op 390 px een bottom sheet is.
   * Te gebruiken betekent hier: de rij is er, de prijs staat erop, de knop is
   * te raken zonder dat de pagina opzij schuift, en de koop landt.
   */
  test('op een telefoon is de catalogus te gebruiken', async ({ page, browser, isMobile }, info) => {
    test.skip(!isMobile, 'dit geval gaat juist over de telefoon (390 px)');
    test.setTimeout(300_000);
    const stamp = `${info.project.name}-${Date.now().toString(36)}`;

    const keeperCtx = await browser.newContext();
    const keeper = await keeperCtx.newPage();
    await signIn(keeper, ...KEEPER);
    const lamp = await newHuisraad(keeper, {
      name: `Olielamp ${stamp}`,
      plek: 'plank',
      prijs: 2,
      effect: ['+1 op Speuren in het donker'],
    });

    const { slug } = await signUpWearing(page, `Telefoon ${stamp}`);
    await openKamer(keeper, slug);
    await grant(keeper, '2', `Zakgeld ${stamp}`);
    await expect(keeper.getByTestId('kamer-balance')).toHaveAttribute('data-balance', '2', {
      timeout: 20_000,
    });

    await openKamer(page, slug);
    const plank = plek(page, 1);
    const picker = await openPicker(page, 1);
    await catalogus(picker);

    const lampRij = rij(picker, lamp.name);
    await expect(lampRij).toHaveCount(1, { timeout: 20_000 });
    await expect(lampRij.getByTestId('plek-catalogus-prijs')).toHaveText('2 munten');
    await expect(lampRij.getByTestId('plek-catalogus-effect')).toHaveCount(1);
    await expect(lampRij).toHaveAttribute('data-afford', 'ja');

    // Het blad past: de knop staat binnen de 390 px en niets duwt de pagina opzij.
    const koop = lampRij.getByTestId('plek-koop');
    await koop.scrollIntoViewIfNeeded();
    await expect(koop).toBeEnabled();
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
    await expect(plank).toHaveAttribute('data-state', 'filled', { timeout: 20_000 });
    await expect(page.getByTestId('kamer-balance')).toHaveAttribute('data-balance', '0', {
      timeout: 20_000,
    });
    await expect(
      page.locator(`[data-testid="kamer-effect"][data-name="${lamp.name}"]`),
    ).toHaveCount(1, { timeout: 20_000 });

    await keeperCtx.close();
  });
});
