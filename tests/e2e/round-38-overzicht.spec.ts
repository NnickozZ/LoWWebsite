import { expect, test } from '@playwright/test';
import { becomeInvestigator, editArticle, fillWhenReady, signIn, signUp } from './helpers';

/**
 * §75, ronde 38: het overzicht.
 *
 * Vier dingen, en het laatste is de regel zelf:
 *
 *  1. `/wiki` is de voordeur en `/wiki/alles` is de lijst die daar stond;
 *  2. een speler mag de voordeur schrijven, inclusief secties (§70);
 *  3. een speler mag er zelf een bij maken, en die is te vinden via de strip;
 *  4. **een verwijzing vanaf een overzicht loopt één kant op** — hij staat
 *     niet onder "Genoemd in" op het artikel waar hij heen wijst.
 *
 * Dat vierde is waarom een overzicht een eigen tabel is en geen soort artikel
 * met een vinkje, dus het is het punt waar een latere ronde het stilst stuk
 * kan maken.
 *
 * Alleen op `desktop`: er is geen canvas, geen gebaar en geen §73-modus in deze
 * ronde, dus de telefoonvariant zou dezelfde klikken op een smaller scherm
 * zijn.
 */
test.describe('§75 het overzicht', () => {
  /*
   * Beide projecten draaien chromium, dus `browserName` zegt niets — het
   * project wel, en dat staat in `testInfo`. De voorwaarde-vorm op een
   * `describe` krijgt alleen de fixtures (de tweede parameter is daar
   * `undefined`), dus hij hoort in een `beforeEach`, waar `testInfo` er wél is.
   * Fout gedaan kost meer dan de test zelf: de callback gooit, en Playwright
   * rekent dat de héle file aan — de andere drie draaien dan niet meer.
   */
  test.beforeEach(({}, info) => {
    test.skip(info.project.name !== 'desktop', 'geen canvas en geen gebaar in deze ronde');
  });

  test('de wiki opent op de voordeur, en de lijst staat één tab verderop', async ({ page }) => {
    await signIn(page, 'Keeper', 'abbeytower34');

    await page.goto('/wiki');
    // De tabrij: Start eerst, dan Alles. Dat is de hele navigatie-ingreep.
    const tabs = page.getByRole('navigation', { name: 'Soorten' });
    await expect(tabs.getByRole('link', { name: 'Start' })).toBeVisible();
    await expect(tabs.getByRole('link', { name: /^Alles/ })).toBeVisible();
    // De voordeur is geschreven tekst, geen rasters met kaartjes.
    await expect(page.locator('.overzicht-page')).toBeVisible();
    await expect(page.locator('.card-grid')).toHaveCount(0);

    await tabs.getByRole('link', { name: /^Alles/ }).click();
    await page.waitForURL('**/wiki/alles**');
    await expect(page.getByRole('heading', { name: 'Alles in de wiki' })).toBeVisible();
    // En daar staan de kaartjes weer, met de balk erboven.
    await expect(page.locator('.card-grid').first()).toBeVisible();
  });

  test('de voordeur stelt zichzelf voor tot iemand iets schrijft, en dan niet meer', async ({ page }) => {
    await signIn(page, 'Keeper', 'abbeytower34');
    await page.goto('/wiki');

    // lib/intro.ts, getoond en niet opgeslagen.
    await expect(page.locator('.entry-lead')).toContainText('Welkom in het archief');

    await editArticle(page, '#overzicht-name');
    const lead = page.locator('#overzicht-lead');
    await fillWhenReady(lead, 'Hier begint het. Kijk eerst bij de families.');
    // Opslaan hangt aan blur, zoals elk ander los tekstvak in het archief.
    await page.locator('#overzicht-name').click();
    await page.reload();

    await expect(page.locator('.entry-lead')).toContainText('Kijk eerst bij de families');
    await expect(page.locator('.entry-lead')).not.toContainText('Welkom in het archief');
  });

  test('een speler maakt een overzicht, schrijft er een sectie op, en vindt hem terug', async ({ page }) => {
    const who = `Wegwijzer${Date.now().toString().slice(-6)}`;
    await signUp(page, who, 'abbeytower34');
    // §18b: zonder onderzoeker schrijft niemand iets.
    await becomeInvestigator(page, `${who} Jansen`);

    await page.goto('/wiki');
    await page.getByRole('button', { name: /^Nieuw overzicht/ }).click();
    const naam = `De haven van ${who}`;
    await page.getByLabel('Naam', { exact: true }).fill(naam);
    await page.getByRole('button', { name: 'Maken', exact: true }).click();
    await page.waitForURL('**/wiki/overzicht/**');

    // Geen infobox, geen zijbalk: dat is het hele ontwerp.
    await expect(page.locator('.overzicht-page')).toBeVisible();
    await expect(page.locator('#block-info')).toHaveCount(0);
    await expect(page.getByRole('heading', { name: naam })).toBeVisible();

    await editArticle(page, '#overzicht-name');
    await page.getByRole('button', { name: 'Sectie toevoegen' }).click();
    const titel = page.locator('input[id^="section-title-"]').first();
    await fillWhenReady(titel, 'Waar begin je?');
    await titel.blur();

    await page.reload();
    await expect(page.getByRole('heading', { name: 'Waar begin je?' })).toBeVisible();

    // En hij is te vinden zonder dat iemand ernaar linkte: de strip.
    await page.goto('/wiki');
    await expect(page.getByRole('navigation', { name: /overzichten/i }).getByText(naam)).toBeVisible();
  });

  /**
   * De regel zelf. Een sectie op een *artikel* die "[[Naam]]" bevat zet een rij
   * onder "Genoemd in" op dat artikel; dezelfde sectie op een overzicht niet.
   * Dit is de assertie die stuk moet gaan als iemand ooit
   * `recomputeOwnerMentions` "opruimt".
   */
  test('een verwijzing vanaf een overzicht staat niet onder Genoemd in', async ({ page }) => {
    await signIn(page, 'Keeper', 'abbeytower34');

    // Een artikel om naar te wijzen, met een naam die nergens anders staat.
    const naam = `Vuurtoren ${Date.now().toString().slice(-6)}`;
    await page.goto('/wiki/alles');
    await page.getByRole('button', { name: 'Nieuw artikel' }).locator('visible=true').first().click();
    await page.getByLabel('Naam', { exact: true }).fill(naam);
    await page.getByRole('button', { name: /Maken|Aanmaken/ }).first().click();
    await page.waitForURL('**/e/**');
    // Zonder `?new=1`: dat adres landt op de bewerkkant, waar de naam een
    // invoervak is en er helemaal geen kop staat (CLAUDE.md §6).
    const artikel = page.url().split('?')[0];

    // Noem hem op de voordeur, in een sectie, met de haken die een chip maken.
    await page.goto('/wiki');
    await editArticle(page, '#overzicht-name');
    await page.getByRole('button', { name: 'Sectie toevoegen' }).click();
    const titel = page.locator('input[id^="section-title-"]').last();
    await fillWhenReady(titel, 'Plekken');
    await titel.blur();
    const tekst = page.locator('.entry-section-editing .editor-body').last();
    await tekst.click();
    await page.keyboard.type(`Begin bij [[${naam}]].`);
    // De sectie slaat op met een tik vertraging; blur duwt hem eruit.
    await titel.click();
    await page.waitForTimeout(1500);

    // Op het artikel zelf staat die verwijzing nergens.
    await page.goto(artikel);
    await expect(page.getByRole('heading', { name: naam })).toBeVisible();
    await expect(page.getByText('Plekken')).toHaveCount(0);
  });
});

/**
 * §87, ronde 48: **de voordeur is er één per kant.**
 *
 * Nick: *"De portaal paginas zijn bij de keeper en bij de spelers hetzelfde,
 * dit moet niet. Ook deze moeten los zijn van elkaar."*
 *
 * De oorzaak was §46's regel, die overal elders klopt: een opzoeking filtert
 * niet op kant, want een Keeper loopt van beide kanten over een touwtje naar
 * één artikel en dat artikel moet er dan staan. `getHomeOverzicht` is zo'n
 * opzoeking, en er was precies één rij met `is_home` — dus las de Keeper op
 * zijn eigen kant de voorpagina van de spelers. Elk *ander* overzicht was al
 * netjes gescheiden, want die zitten in een lijst en die filtert wél.
 *
 * Dit bestand meet het van de kant die het bewijst: de Keeper schrijft iets op
 * zijn eigen voordeur, en een speler mag het nooit te zien krijgen.
 */
test.describe('§87 een voordeur per kant', () => {
  test.beforeEach(({}, info) => {
    test.skip(info.project.name !== 'desktop', 'dezelfde klikken op een smaller scherm bewijzen niets nieuws');
  });

  test('de Keeper schrijft zijn eigen voorpagina, en de spelers lezen die van hen', async ({
    page,
    browser,
  }) => {
    test.setTimeout(240_000);
    const stamp = Date.now().toString(36);
    const geheim = `Alleen voor de Keeper ${stamp}`;
    const vanHen = `Van de spelers ${stamp}`;

    await signIn(page, 'Keeper', 'abbeytower34');

    /* ------------------------------------------- de spelerskant blijft van hen */

    /*
     * Opslaan hangt aan blur, en blur komt van een *andere* plek aanklikken —
     * `locator.blur()` is niet hetzelfde gebaar. Daarna herladen en kijken of
     * het er echt staat: een schrijfactie die je niet terugleest, heb je niet
     * bewezen. (Dezelfde volgorde als de tweede zaak hierboven.)
     */
    await page.goto('/wiki');
    await editArticle(page, '#overzicht-name');
    await fillWhenReady(page.locator('#overzicht-lead'), vanHen);
    await page.locator('#overzicht-name').click();
    await page.reload();
    await expect(page.locator('.entry-lead')).toContainText(vanHen, { timeout: 20_000 });

    /* ------------------------------------------------- en de Keeper zijn eigen */

    /*
     * §57: één weg naar de kant, en dat is `/api/keeper/flip?side=…`. `/keeper`
     * stuurt daar ook heen maar is geen tuimelschakelaar — hij brengt je naar
     * de Keeperkant, dus terug moet met `side=player`. Dat verschil kostte deze
     * zaak twee runs.
     */
    await page.goto('/api/keeper/flip?side=keeper&to=%2Fwiki');
    await page.waitForLoadState('domcontentloaded');
    await editArticle(page, '#overzicht-name');

    // De kern: wat hij hier leest is *niet* wat hij net op de andere kant typte.
    await expect(page.locator('#overzicht-lead')).not.toHaveValue(vanHen);

    await fillWhenReady(page.locator('#overzicht-lead'), geheim);
    await page.locator('#overzicht-name').click();
    await page.reload();
    await expect(page.locator('.entry-lead')).toContainText(geheim, { timeout: 20_000 });

    /* ---------------------------------------- en terug: allebei staan ze er nog */

    await page.goto('/api/keeper/flip?side=player&to=%2Fwiki');
    await page.waitForLoadState('domcontentloaded');
    await expect(page.getByText(vanHen)).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(geheim)).toHaveCount(0);

    /* -------------------------------------- en een speler ziet alleen de zijne */

    const spelerCtx = await browser.newContext();
    const speler = await spelerCtx.newPage();
    await signUp(speler, `Voordeur ${stamp}`, 'onderzeeboot');
    await speler.goto('/wiki');
    await expect(speler.getByText(vanHen)).toBeVisible({ timeout: 20_000 });
    // §44: de andere voordeur bestaat voor hem niet, en hij is ook niet te
    // raden — er is geen adres dat hem oplevert, want `/wiki` ís het adres.
    await expect(speler.getByText(geheim)).toHaveCount(0);
    await expect(speler.locator('body')).not.toContainText(geheim);

    await spelerCtx.close();
  });
});
