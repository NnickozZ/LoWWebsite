import { expect, test, type Locator, type Page } from '@playwright/test';
import { becomeInvestigator, fillWhenReady, inviteCode, signIn } from './helpers';

/**
 * §83: het open grootboek en de uitdeling, door een echte hand.
 *
 * Drie van de vier ergste fouten van dit project zijn alleen onder een browser
 * gevonden (§80 in `CLAUDE.md`), en deze ronde heeft precies de vorm waarin dat
 * gebeurt: een scherm dat alleen een Keeper mag zien, een knop die acht
 * grootboeken tegelijk schrijft, en een getal dat andere getallen overschrijft
 * terwijl je ernaar kijkt. Een unittest ziet van dat laatste niets.
 *
 * Vier zaken, en ze staan in de volgorde waarin ze mislopen:
 *
 *   1. De Keeper deelt uit aan twee kamers, met één bedrag met de hand
 *      aangepast, en beide grootboeken tonen de regel met dezelfde reden.
 *   2. Het globale getal overschrijft een met de hand getypt bedrag — de regel
 *      die Nick letterlijk vroeg, en de enige die je moet zien gebeuren.
 *   3. Een speler leest zijn eigen grootboek en heeft er geen formulier onder.
 *   4. Een speler komt niet op `/uitdelen`, en niet met een gokje in de
 *      adresbalk.
 *
 * Alles web-first (§6): elke schrijfactie loopt over een route en daarna een
 * `router.refresh()`, dus de assertie staat op wat de server terugstuurt —
 * `data-balance`, `data-kind`, `data-veiled` — en nergens op een `waitForTimeout`.
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

/** §18b: een kamer hangt aan een onderzoeker, dus die moet er eerst zijn. */
async function signUpWearing(page: Page, name: string): Promise<{ character: string; slug: string }> {
  await signUpAs(page, name);
  const character = `Onderzoeker ${name}`;
  const path = await becomeInvestigator(page, character);
  return { character, slug: path.replace(/^\/e\//, '') };
}

async function openKamer(page: Page, slug: string) {
  await page.goto(`/kamer/${slug}`);
  await expect(page.getByTestId('kamer-page')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId('kamer-grid')).toBeVisible({ timeout: 20_000 });
}

async function openUitdeler(page: Page) {
  await page.goto('/uitdelen');
  await expect(page.getByTestId('uitdelen-page')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId('uitdelen-form')).toBeVisible({ timeout: 20_000 });
}

/** De regel van één onderzoeker, gevonden op de naam die deze run uniek maakt. */
function rij(page: Page, character: string): Locator {
  return page.getByTestId('uitdelen-rij').filter({ hasText: character });
}

test.describe('§83 Uitdelen en het open grootboek', () => {
  /**
   * ZAAK 1 en 2 — één knop schrijft twee grootboeken, en het globale getal
   * overschrijft wat er met de hand in stond.
   *
   * Eén test, omdat het één beweging is: je vult 2 in voor iedereen, je zet er
   * bij één 5 neer, je bedenkt je en typt 3 boven — en dan staat er bij
   * iedereen 3, ook bij degene die net 5 kreeg. Dat laatste is de regel die
   * Nick vroeg en die je alleen ziet door ernaar te kijken.
   */
  test('het globale bedrag overschrijft wat met de hand is ingevuld, en één knop schrijft beide grootboeken', async ({
    page,
    browser,
  }) => {
    test.setTimeout(180_000);
    const stamp = Date.now().toString(36);

    const eenCtx = await browser.newContext();
    const een = await eenCtx.newPage();
    const a = await signUpWearing(een, `Een ${stamp}`);

    const tweeCtx = await browser.newContext();
    const twee = await tweeCtx.newPage();
    const b = await signUpWearing(twee, `Twee ${stamp}`);

    await signIn(page, ...KEEPER);
    await openUitdeler(page);

    const rijA = rij(page, a.character);
    const rijB = rij(page, b.character);
    await expect(rijA).toHaveCount(1);
    await expect(rijB).toHaveCount(1);

    /* --------------------------------- het globale getal zet alles ineens */

    /*
     * §86 zette hier twee regels boven, en de reden staat in ronde 47.
     *
     * Tot dan stond élke rij aangevinkt bij het openen, dus "het globale getal
     * zet alles ineens" en "het zet alles wat meedoet" waren dezelfde zin. Met
     * een tafel van zestig is alles-aan een val, dus de lijst begint leeg — en
     * dan is *alles* de verkeerde verzameling: het vak vult wat je gekozen
     * hebt. De bedoeling van §83 is ongewijzigd, het woord "alles" betekende
     * daar "iedereen die meedoet", en dat zijn nu de vinkjes.
     */
    await page.getByTestId('uitdelen-alles').click();
    await expect(page.getByTestId('uitdelen-telling')).not.toHaveAttribute('data-picked', '0');

    await fillWhenReady(page.getByTestId('uitdelen-iedereen'), '2');
    await expect(rijA.getByTestId('uitdelen-bedrag')).toHaveValue('2');
    await expect(rijB.getByTestId('uitdelen-bedrag')).toHaveValue('2');

    // Eén regel met de hand anders.
    await fillWhenReady(rijB.getByTestId('uitdelen-bedrag'), '5');
    await expect(rijB.getByTestId('uitdelen-bedrag')).toHaveValue('5');
    await expect(rijA.getByTestId('uitdelen-bedrag')).toHaveValue('2');

    // En dan het globale getal opnieuw: elke **aangevinkte** rij springt mee,
    // ook de 5 die met de hand getypt was.
    await fillWhenReady(page.getByTestId('uitdelen-iedereen'), '3');
    await expect(rijB.getByTestId('uitdelen-bedrag')).toHaveValue('3');
    await expect(rijA.getByTestId('uitdelen-bedrag')).toHaveValue('3');

    /* ------------------------------------ één met de hand terug, en uitdelen */

    await fillWhenReady(rijA.getByTestId('uitdelen-bedrag'), '7');
    await fillWhenReady(page.getByTestId('uitdelen-reden'), `Samen de vuurtoren ${stamp}`);
    await page.getByTestId('uitdelen-geef').click();

    // Twee beurzen, twee bedragen, en de reden die er één keer getypt is.
    await openKamer(page, a.slug);
    await expect(page.getByTestId('kamer-balance')).toHaveAttribute('data-balance', '7', { timeout: 20_000 });
    await expect(page.getByTestId('kamer-grootboek')).toContainText(`Samen de vuurtoren ${stamp}`);

    await openKamer(page, b.slug);
    await expect(page.getByTestId('kamer-balance')).toHaveAttribute('data-balance', '3', { timeout: 20_000 });
    await expect(page.getByTestId('kamer-grootboek')).toContainText(`Samen de vuurtoren ${stamp}`);

    /* ----------------------- en de speler leest zijn eigen regel, zonder formulier */

    await openKamer(een, a.slug);
    const grootboek = een.getByTestId('kamer-grootboek');
    await expect(grootboek).toBeVisible({ timeout: 20_000 });
    await expect(grootboek).toContainText(`Samen de vuurtoren ${stamp}`);
    await expect(een.getByTestId('grootboek-regel').first()).toHaveAttribute('data-kind', 'grant');
    // §83: het lezen is van iedereen, het schrijven blijft van de Keeper.
    await expect(een.getByTestId('grootboek-form')).toHaveCount(0);
    await expect(een.getByTestId('grootboek-uitdelen')).toHaveCount(0);

    await eenCtx.close();
    await tweeCtx.close();
  });

  /**
   * ZAAK 3 — een speler leest het grootboek van iemand anders ook, en dat is
   * de bedoeling: de deur is die van de kamer, niet die van het grootboek.
   */
  test('een speler leest het grootboek van de buren, maar schrijft er niet in', async ({ page, browser }) => {
    test.setTimeout(180_000);
    const stamp = Date.now().toString(36);

    const buurCtx = await browser.newContext();
    const buur = await buurCtx.newPage();
    const b = await signUpWearing(buur, `Buur ${stamp}`);

    const kijkerCtx = await browser.newContext();
    const kijker = await kijkerCtx.newPage();
    await signUpWearing(kijker, `Kijker ${stamp}`);

    await signIn(page, ...KEEPER);
    await openKamer(page, b.slug);
    const form = page.getByTestId('grootboek-form');
    await expect(form).toBeVisible({ timeout: 20_000 });
    await fillWhenReady(form.getByTestId('grootboek-bedrag'), '4');
    await fillWhenReady(form.getByTestId('grootboek-reden'), `Een vondst ${stamp}`);
    await form.getByTestId('grootboek-geef').click();
    await expect(page.getByTestId('kamer-balance')).toHaveAttribute('data-balance', '4', { timeout: 20_000 });

    await openKamer(kijker, b.slug);
    await expect(kijker.getByTestId('kamer-grootboek')).toContainText(`Een vondst ${stamp}`);
    await expect(kijker.getByTestId('grootboek-form')).toHaveCount(0);

    await buurCtx.close();
    await kijkerCtx.close();
  });

  /**
   * ZAAK 4 — §80's regel: een slot heeft ook aan de buitenkant van de deur een
   * gleuf nodig. De deur staat er niet voor een speler, én de pagina erachter
   * is een 404 als hij het adres zelf intypt.
   */
  test('een speler vindt de uitdeler niet en komt er ook niet met het adres', async ({ page }) => {
    test.setTimeout(120_000);
    const stamp = Date.now().toString(36);
    await signUpWearing(page, `Buiten ${stamp}`);

    await page.goto('/spelers');
    await expect(page.getByTestId('spelers-lijst')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId('spelers-uitdelen')).toHaveCount(0);

    await page.goto('/uitdelen');
    await expect(page.getByTestId('uitdelen-page')).toHaveCount(0);
    await expect(page.getByTestId('uitdelen-form')).toHaveCount(0);
    await expect(page.locator('body')).toContainText(/niet gevonden|not found|404/i, { timeout: 20_000 });
  });

  /**
   * En op 390 px: de uitdeler is een rij met drie dingen naast elkaar en dat
   * past daar niet, dus hij wrapt. De assertie is §69's: geen zijwaartse
   * schuifbalk, en het bedragvakje is met een vinger te raken.
   */
  test('op een telefoon past de uitdeler en is het bedrag te raken', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'de opmaak wordt op de telefoon bewezen');
    test.setTimeout(150_000);
    const stamp = Date.now().toString(36);
    const ownerName = `Smal ${stamp}`;

    const ownerCtx = await page.context().browser()!.newContext();
    const owner = await ownerCtx.newPage();
    await signUpWearing(owner, ownerName);
    await ownerCtx.close();

    await signIn(page, ...KEEPER);
    await openUitdeler(page);

    const bedrag = rij(page, `Onderzoeker ${ownerName}`).getByTestId('uitdelen-bedrag');
    await expect(bedrag).toBeVisible({ timeout: 20_000 });
    const box = (await bedrag.boundingBox())!;
    const viewport = page.viewportSize()!;
    expect(box.height).toBeGreaterThanOrEqual(40);
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(viewport.width + 1);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1,
      ),
    ).toBe(true);

    // En hij doet het ook: het globale getal bereikt deze regel — zodra ze
    // aangevinkt is, want §86 liet de lijst leeg beginnen.
    await rij(page, `Onderzoeker ${ownerName}`).getByTestId('uitdelen-aan').check();
    await fillWhenReady(page.getByTestId('uitdelen-iedereen'), '2');
    await expect(bedrag).toHaveValue('2');
  });

  /** En de Keeper vindt hem wél, vanaf de hal. */
  test('de Keeper komt er vanaf de hal', async ({ page }) => {
    test.setTimeout(120_000);
    await signIn(page, ...KEEPER);
    await page.goto('/spelers');
    await expect(page.getByTestId('spelers-lijst')).toBeVisible({ timeout: 20_000 });
    await page.getByTestId('spelers-uitdelen').click();
    await expect(page.getByTestId('uitdelen-page')).toBeVisible({ timeout: 20_000 });
  });
});
