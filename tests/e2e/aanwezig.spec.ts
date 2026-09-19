import { expect, test, type Locator, type Page } from '@playwright/test';
import { becomeInvestigator, inviteCode, newEntryButton, openRights, signIn } from './helpers';

/**
 * §76: Aanwezig — wie er is, waar ze zijn, en wat je daarvan te zien krijgt.
 *
 * Het model voor dit bestand is `live-everywhere.spec.ts` (twee browsers, twee
 * mensen, één archief) en de tucht komt uit `access-rights.spec.ts`: een recht
 * dat alleen op het scherm van de eigenaar geldt is versiering, dus de zaak die
 * er het meest toe doet — het lek — wordt bewezen vanaf de kant van wie er
 * *niet* bij mag.
 *
 * Alles wacht web-first (§6). Het rooster wordt op een throttle van ~400 ms
 * gepubliceerd en een tweede venster arriveert wanneer het arriveert, dus elke
 * assertie hier is een `expect(...)` met een ruime timeout en nergens een
 * `waitForTimeout` om een race mee dicht te plamuren.
 */

const KEEPER = ['Keeper', 'abbeytower34'] as const;

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
 * §18b: wie iets schrijft heeft een onderzoeker nodig, en de naam op het
 * rooster is die van de onderzoeker — niet die van het account. Elke assertie
 * over een naam hieronder gebruikt daarom dezelfde naam die hier is ingevuld.
 */
async function signUpWriting(page: Page, name: string): Promise<string> {
  await signUpAs(page, name);
  const character = `Onderzoeker ${name}`;
  await becomeInvestigator(page, character);
  return character;
}

/** Staan op een pagina, met de lijn omhoog voordat er iets gevraagd wordt. */
async function standOn(page: Page, path: string) {
  await page.goto(path);
  await expect(page.getByTestId('live-strip')).toHaveClass(/live-strip-live/, { timeout: 30_000 });
}

/**
 * §6: een pagina die net genavigeerd is luistert nog niet, en een tweede druk
 * op deze knop klapt het paneel weer dicht. Dus: kijken of het er al staat, en
 * pas drukken als het er niet staat.
 */
async function openRoster(page: Page): Promise<Locator> {
  const button = page.getByTestId('roster-open');
  await expect(button).toBeVisible({ timeout: 30_000 });
  const roster = page.getByTestId('roster');
  await expect(async () => {
    if (!(await roster.isVisible().catch(() => false))) await button.click({ timeout: 5000 });
    await expect(roster).toBeVisible({ timeout: 1500 });
  }).toPass({ timeout: 30_000 });
  return roster;
}

/**
 * Een rij van het rooster zelf, nooit uit het staartje: `.roster-row-tail`
 * draagt dezelfde klasse en houdt een half uur lang iedereen vast die in een
 * eerdere test is weggegaan (`TAIL_MS`).
 */
function rowFor(roster: Locator, name: string): Locator {
  return roster.locator('ul.roster-list:not(.roster-tail) > li.roster-row').filter({ hasText: name });
}

/** Een artikel, gemaakt zoals een mens er een maakt. Geeft het pad terug. */
async function newEntry(page: Page, name: string): Promise<string> {
  const before = page.url();
  const sheet = page.getByRole('dialog', { name: 'Nieuw artikel' });
  await expect(async () => {
    if (!(await sheet.isVisible().catch(() => false))) await newEntryButton(page).click({ timeout: 5000 });
    await expect(sheet).toBeVisible({ timeout: 1500 });
  }).toPass({ timeout: 30_000 });
  await sheet.getByLabel('Naam', { exact: true }).fill(name);
  await sheet.getByRole('button', { name: 'Aanmaken' }).click();
  // §6: staan op een artikel maakt `**/e/**` al waar — wacht op een adres dat
  // *verandert*.
  await expect.poll(() => page.url(), { timeout: 30_000 }).not.toBe(before);
  await expect(page.locator('#entry-name')).toHaveValue(name, { timeout: 15_000 });
  return new URL(page.url()).pathname;
}

test.describe('§76 Aanwezig', () => {
  test('twee mensen op twee pagina\'s zien elkaar staan, met naam en plek', async ({ page, browser, isMobile }, info) => {
    test.skip(isMobile, '§76 wordt op de desk bewezen; de telefoon heeft één eigen geval, onderaan dit bestand');
    test.setTimeout(150_000);
    const stamp = `${info.project.name}-${Date.now().toString(36)}`;
    const aName = `Aaltje ${stamp}`;
    const bName = `Bram ${stamp}`;

    await signUpAs(page, aName);
    await standOn(page, '/cases');

    const otherCtx = await browser.newContext();
    const other = await otherCtx.newPage();
    await signUpAs(other, bName);
    await standOn(other, '/boards');

    // Het cijfertje naast de schijfjes: iedereen die *niet* hier staat.
    await expect(page.getByTestId('roster-count')).toHaveText('1', { timeout: 30_000 });
    await expect(other.getByTestId('roster-count')).toHaveText('1', { timeout: 30_000 });

    // A ziet B op de Prikborden staan, en dat is een link.
    const aRoster = await openRoster(page);
    const bRow = rowFor(aRoster, bName);
    await expect(bRow).toHaveCount(1, { timeout: 30_000 });
    await expect(bRow).toHaveAttribute('data-mode', 'place', { timeout: 30_000 });
    await expect(bRow.locator('.roster-name')).toContainText(bName);
    await expect(bRow.locator('.roster-where')).toContainText('Prikborden');
    await expect(bRow.locator('.roster-body-link')).toHaveAttribute('href', '/boards');

    // En andersom, want een rooster is per kijker gebouwd en beide kanten
    // moeten kloppen.
    const bRoster = await openRoster(other);
    const aRow = rowFor(bRoster, aName);
    await expect(aRow).toHaveCount(1, { timeout: 30_000 });
    await expect(aRow).toHaveAttribute('data-mode', 'place', { timeout: 30_000 });
    await expect(aRow.locator('.roster-where')).toContainText('Dossiers');
    await expect(aRow.locator('.roster-body-link')).toHaveAttribute('href', '/cases');

    // De eigen rij staat er ook, met "(jij)", en heeft geen knop om jezelf te
    // vragen.
    const self = rowFor(bRoster, bName);
    await expect(self).toHaveCount(1);
    await expect(self).toContainText('(jij)');
    await expect(self.locator('.roster-ask')).toHaveCount(0);

    await otherCtx.close();
  });

  test('een plek waar je niet bij mag heeft geen naam en geen link', async ({ page, browser, isMobile }, info) => {
    test.skip(isMobile, '§76 wordt op de desk bewezen');
    test.setTimeout(180_000);
    const stamp = `${info.project.name}-${Date.now().toString(36)}`;
    const aName = `Ada ${stamp}`;
    const bName = `Bea ${stamp}`;
    const secret = `Het geheime dagboek ${stamp}`;

    /*
     * A is een speler met een onderzoeker, geen Keeper. Dat is met opzet: een
     * Keeper wordt door een speler sowieso als `quiet` gezien (zijn plek is de
     * vorm van de avond), dus een Keeper op een Keeperartikel bewijst de
     * verkeerde helft. Wat hier bewezen moet worden is de gewone: iemand die
     * ergens *mag* staan waar de kijker niet bij mag.
     */
    const aCharacter = await signUpWriting(page, aName);
    const path = await newEntry(page, secret);
    await openRights(page);
    const prive = page
      .getByRole('radiogroup', { name: 'Wie mag kijken' })
      .getByRole('radio', { name: 'Privé' });
    await prive.click();
    await expect(prive).toBeChecked({ timeout: 15_000 });
    // A blijft staan waar het geheim is: dit is precies het scherm dat een
    // ander niet mag lezen, en dus de plek die zijn rij niet mag verraden.
    await standOn(page, path);

    const otherCtx = await browser.newContext();
    const other = await otherCtx.newPage();
    await signUpAs(other, bName);
    await standOn(other, '/cases');

    // Vanaf de kant van wie er niet bij mag (access-rights.spec.ts' tucht).
    const roster = await openRoster(other);
    const aRow = rowFor(roster, aCharacter);
    await expect(aRow).toHaveCount(1, { timeout: 30_000 });
    await expect(aRow).toHaveAttribute('data-mode', 'hidden', { timeout: 30_000 });
    await expect(aRow.locator('.roster-where')).toContainText('ergens anders in het archief');
    /*
     * Rule 2 van §76: de *plek* is geen link. Een rij die in een 403 zou landen
     * beantwoordt de vraag die de rij zojuist weigerde te beantwoorden.
     *
     * De naam is sinds §77 wél een link — naar de spelerspagina, die over de
     * persoon gaat en niets zegt over waar die staat. Dat is de enige `<a>` die
     * hier mag staan, en de assertie eronder pint dat vast: precies één link, en
     * die wijst naar `/spelers/…`.
     */
    await expect(aRow.locator('.roster-body-link')).toHaveCount(0);
    await expect(aRow.locator('a')).toHaveCount(1);
    await expect(aRow.locator('a')).toHaveAttribute('href', /^\/spelers\//);

    // En de naam van het artikel staat nergens in het hele paneel — niet in een
    // titel, niet in een tooltip, niet in een href.
    await expect(roster).not.toContainText(secret);
    await expect(roster).not.toContainText('dagboek');
    // Ook niet in de opmaak: geen titel, geen tooltip, geen href naar /e/.
    const markup = await roster.innerHTML();
    expect(markup).not.toContain('dagboek');
    expect(markup).not.toContain('/e/');

    // De controle op de proef: B mag de pagina inderdaad niet zien.
    const direct = await other.goto(path);
    expect(direct?.status()).toBe(404);

    await otherCtx.close();
  });

  test('een rij waar je wél bij mag brengt je erheen', async ({ page, browser, isMobile }, info) => {
    test.skip(isMobile, '§76 wordt op de desk bewezen');
    test.setTimeout(150_000);
    const stamp = `${info.project.name}-${Date.now().toString(36)}`;
    const aName = `Anne ${stamp}`;
    const bName = `Bert ${stamp}`;

    await signUpAs(page, aName);
    await standOn(page, '/timelines');

    const otherCtx = await browser.newContext();
    const other = await otherCtx.newPage();
    await signUpAs(other, bName);
    await standOn(other, '/cases');

    const roster = await openRoster(other);
    const aRow = rowFor(roster, aName);
    await expect(aRow).toHaveAttribute('data-mode', 'place', { timeout: 30_000 });
    await aRow.locator('.roster-body-link').click();
    await other.waitForURL('**/timelines', { timeout: 30_000 });
    await expect(other.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 15_000 });

    await otherCtx.close();
  });

  /*
   * 4. Rusten — OVERGESLAGEN, met opzet.
   *
   * Een venster gaat pas rusten als de tab `HIDDEN_CLOSE_MS` (45 s, in
   * `lib/live/wire.ts`) onafgebroken verborgen is *en* geen enkele andere tab
   * van diezelfde browser zichtbaar is (`seenTabs.size`, `LiveProvider.tsx`).
   * Er is geen seam om dat te versnellen: de POST met `{ rest: true }` moet het
   * connection-id van die tab citeren, en dat staat nergens op `window`.
   *
   * Eerlijk te drijven is het dus alleen door een tab drie kwartier van een
   * minuut verborgen te houden, en een tab van Playwright meldt in headless
   * `visibilityState: 'visible'` — de guard halverwege `check()` roept dan
   * `sayVisible()` en het rusten komt er nooit van. Een `waitForTimeout(45_000)`
   * zou hier dus niet alleen traag zijn maar ook nog eens niets bewijzen, en de
   * registry namaken (`markResting` van buiten aanroepen) test de test.
   *
   * Wat er wél van bewezen is: `roster-row-rest`, `presenceResting` en de val
   * van een slapend venster in het staartje staan in de unit tests van
   * `lib/live/roster.ts`, waar de klok een argument is.
   */
  test.skip('een rustend venster wordt grijs in plaats van weg', async () => {
    // Zie de toelichting hierboven: 45 s stil zitten is geen bewijs.
  });

  test('"Kom kijken" komt aan, en "Ga" brengt je erheen', async ({ page, browser, isMobile }, info) => {
    test.skip(isMobile, '§76 wordt op de desk bewezen');
    /*
     * STAAT OP FAAL, en dat is geen slordigheid maar het bewijs zelf.
     *
     * `post()` in `components/live/LiveProvider.tsx` (de merge rond regel 624)
     * kopieert `alias`, `watch`, `place`, `cursor`, `ink`, `join`, `leave`,
     * `updates` en `awareness` uit het meegegeven deel — en `nudge` níét, net
     * zomin als `rest` en `ghost`. Alle drie staan wél op het type `Outgoing`
     * en alle drie worden door `app/api/live/site/route.ts` afgehandeld, maar
     * ze staan nooit in de body: een `POST` vlak na een druk op "Kom kijken" is
     * letterlijk `{"clientId":"…","connection":"…"}` (gemeten, ronde 39).
     *
     * `sendNudge` krijgt dus een antwoord zonder `nudged`, leest dat als
     * `'down'`, en de knop zegt "niet gelukt". Niemand krijgt ooit een
     * uitnodiging.
     *
     * Drie regels in die merge repareerden het (`nudge`, `rest` én `ghost`
     * vielen alle drie weg — de laatste is de ernstigste: een Keeper die zich
     * onzichtbaar maakte stond gewoon op ieders lijstje). Deze zaak is sindsdien
     * een gewone test en geen `test.fail` meer.
     */
    test.setTimeout(150_000);
    const stamp = `${info.project.name}-${Date.now().toString(36)}`;
    const aName = `Aart ${stamp}`;
    const bName = `Bo ${stamp}`;

    await signUpAs(page, aName);
    await standOn(page, '/cases');

    const otherCtx = await browser.newContext();
    const other = await otherCtx.newPage();
    await signUpAs(other, bName);
    await standOn(other, '/wiki/alles');

    const roster = await openRoster(page);
    const bRow = rowFor(roster, bName);
    await expect(bRow).toHaveCount(1, { timeout: 30_000 });
    const ask = bRow.getByRole('button', { name: 'Kom kijken' });
    await ask.click();
    // De knop zegt zelf wat de server antwoordde; "gevraagd" is het enige
    // antwoord dat "hij is verstuurd" betekent.
    await expect(bRow.locator('.roster-ask')).toHaveText('gevraagd', { timeout: 15_000 });

    const nudge = other.getByTestId('nudge');
    await expect(nudge).toBeVisible({ timeout: 30_000 });
    await expect(nudge).toContainText(aName);
    await expect(nudge).toContainText('Dossiers');
    await nudge.getByRole('link', { name: 'Ga' }).click();
    await other.waitForURL('**/cases', { timeout: 30_000 });
    // En de uitnodiging is daarna van het scherm.
    await expect(other.getByTestId('nudge')).toHaveCount(0, { timeout: 15_000 });

    await otherCtx.close();
  });

  test('een spelerspagina staat er, met vijf panelen en een kamer die nog niet bestaat', async ({
    page,
    browser,
    isMobile,
  }, info) => {
    test.skip(isMobile, '§77 wordt op de desk bewezen');
    test.setTimeout(150_000);
    const stamp = `${info.project.name}-${Date.now().toString(36)}`;
    const playerName = `Nynke ${stamp}`;

    // De speler zelf, in een eigen venster. Het adres van hun pagina komt van
    // de knop op /you, zodat de slug hier niet nagerekend hoeft te worden —
    // `lib/spelers/service.ts` is de enige die hem mag uitrekenen.
    const otherCtx = await browser.newContext();
    const other = await otherCtx.newPage();
    await signUpAs(other, playerName);
    await other.goto('/you');
    const door = other.getByRole('main').getByRole('link', { name: /spelerspagina/i });
    await expect(door).toBeVisible({ timeout: 20_000 });
    const spelerPath = new URL(await door.getAttribute('href') ?? '', 'http://x').pathname;
    expect(spelerPath).toMatch(/^\/spelers\/[a-z0-9-]+$/);
    // En dan gaat die speler ergens staan, met het venster open.
    await standOn(other, '/cases');

    await signIn(page, ...KEEPER);
    await standOn(page, spelerPath);

    const speler = page.getByTestId('speler-page');
    await expect(speler).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole('heading', { name: playerName, level: 1 })).toBeVisible();

    for (const panel of ['nu-bezig', 'karakters', 'kamer', 'bijdragen', 'dossiers']) {
      await expect(page.getByTestId(`panel-${panel}`)).toBeVisible({ timeout: 15_000 });
    }

    // §78 is gereserveerd: één zin, en geen meubilair dat de vorm van iets
    // tekent dat nog niet bestaat.
    const kamer = page.getByTestId('panel-kamer');
    await expect(kamer).toContainText('Nog niet gebouwd');
    await expect(
      kamer.locator('table, input, select, textarea, progress, meter, [role="progressbar"]'),
    ).toHaveCount(0);

    // En het levende halfje: zolang hun venster open staat, staat het er.
    const nu = page.getByTestId('nu-bezig-live');
    await expect(nu).toContainText(playerName, { timeout: 30_000 });
    await expect(nu.getByRole('link', { name: 'Dossiers' })).toBeVisible({ timeout: 30_000 });

    await otherCtx.close();
  });

  test('op een telefoon is het lijstje een blad onderaan het scherm', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'dit geval gaat juist over de telefoon (< 767px)');
    /*
     * STAAT OP FAAL. Het paneel gáát open — dat deel klopt — maar het is geen
     * blad en het is niet te lezen.
     *
     * `.roster-pop` wordt onder 767px `position: fixed` met
     * `inset: auto 0.5rem 0.5rem` (`app/aanwezig.css`), en dat rekent vanaf het
     * *viewport* — behalve wanneer een voorouder een containing block voor
     * `fixed` maakt. `.live-strip` doet dat: `backdrop-filter: blur(3px)`
     * (`app/globals.css`, regel ~5288) telt daarvoor net zo goed als een
     * `transform`. De strip is 26 px breed en 15 px hoog, dus het blad komt uit
     * op **22,8 px breed**, en `bottom: 0.5rem` rekent vanaf de ónderkant van
     * de strip: het paneel loopt van y = −163 tot y = 13 en hangt dus vrijwel
     * helemaal bóven de bovenrand van het scherm. Gemeten, ronde 39.
     *
     * Hetzelfde geldt voor `.roster-nudge`, die onder 767px ook `fixed` staat:
     * een uitnodiging op een telefoon is even breed en even onvindbaar.
     *
     * Dit was niet met een testid te repareren — het was de CSS. De strip laat
     * zijn `backdrop-filter` nu los zolang er een paneel uit hangt
     * (`app/aanwezig.css`), waarmee het scherm weer het containing block is.
     */
    test.setTimeout(90_000);

    await signIn(page, ...KEEPER);
    await standOn(page, '/cases');

    const roster = await openRoster(page);
    await expect(roster).toContainText('Wie is er?');
    // Leesbaar: hij staat vast onderaan en beslaat bijna de hele breedte,
    // in plaats van 22rem naast een strip van veertig pixels.
    expect(await roster.evaluate((el) => getComputedStyle(el).position)).toBe('fixed');
    const box = (await roster.boundingBox())!;
    const viewport = page.viewportSize()!;
    expect(box.width).toBeGreaterThan(viewport.width * 0.8);
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.y + box.height).toBeGreaterThan(viewport.height - 48);
    expect(box.height).toBeLessThanOrEqual(viewport.height * 0.62);
  });
});
