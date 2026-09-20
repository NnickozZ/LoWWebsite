import { expect, test, type Page } from '@playwright/test';
import { becomeInvestigator, expectPlekken, fillWhenReady, inviteCode, setPlekken, signIn } from './helpers';

/**
 * §84: het geld spreekt — door een echte hand.
 *
 * Ronde 45 is een UX-ronde, en dat is het soort ronde waarvan een unittest het
 * meeste niet ziet. Wat hier staat is daarom precies wat een *scherm* is: staat
 * de zin er, is de knop te raken, zegt de melding waar het ding heen is, staat
 * een ding één keer in de lijst.
 *
 * Zes zaken, in de volgorde waarin ze mislopen:
 *
 *   1. Vanaf Start in **één** klik in je eigen kamer, via de beurs in de hoek.
 *   2. De knop zegt wat hij kost, en na een koop zegt een melding waar het ding
 *      heen is — met een deur die op díé tegel landt.
 *   3. Een ding dat op twee soorten plek past staat **één keer** in de winkel.
 *   4. "Nog n nodig" is zichtbare tekst en geen `title` — ook op een telefoon.
 *   5. De FAB dekt geen knop af op 390 px.
 *   6. De Keeper ziet dat hij meekijkt, en de speler ziet die zin nooit.
 *
 * Alles web-first (§6): elke schrijfactie loopt over een route en daarna een
 * `router.refresh()`, dus de assertie staat op wat de server terugstuurt.
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

async function signUpWearing(page: Page, name: string): Promise<{ character: string; slug: string }> {
  await signUpAs(page, name);
  const character = `Onderzoeker ${name}`;
  const path = await becomeInvestigator(page, character);
  return { character, slug: path.replace(/^\/e\//, '') };
}

/** Op een telefoon is de infobox een dichtgeklapte `<details>` (§6). */
async function unfoldInfobox(page: Page) {
  const folded = page.locator('details#block-info:not([open]) > summary');
  if (await folded.count()) await folded.click();
}

/** Een stuk huisraad, gemaakt zoals de Keeper het maakt (§80's weg, ongewijzigd). */
async function newHuisraad(
  page: Page,
  spec: { name: string; plekken: readonly PlekKind[]; prijs: number; effect: string[] },
) {
  await page.goto('/wiki/huisraad');
  const sheet = page.getByRole('dialog', { name: 'Nieuw artikel' });
  await expect(async () => {
    if (!(await sheet.isVisible().catch(() => false))) {
      await page.getByRole('button', { name: 'Nieuw', exact: true }).click({ timeout: 5000 });
    }
    await expect(sheet).toBeVisible({ timeout: 1500 });
  }).toPass({ timeout: 30_000 });
  await sheet.getByLabel('Naam', { exact: true }).fill(spec.name);
  await sheet.getByRole('button', { name: 'Aanmaken' }).click();
  await page.waitForURL('**/e/**');
  const path = new URL(page.url()).pathname;

  await unfoldInfobox(page);
  await setPlekken(page, spec.plekken);
  await fillWhenReady(page.locator('#field-prijs'), String(spec.prijs));
  await page.locator('#field-prijs').blur();
  await fillWhenReady(page.locator('#field-effect'), spec.effect.join('\n'));
  await page.locator('#field-effect').blur();
  await expect(page.locator('.save-state')).not.toHaveText('Opslaan…', { timeout: 20_000 });

  await expect(async () => {
    await page.goto(path);
    await page.getByRole('button', { name: 'Bewerken' }).first().click({ timeout: 5000 });
    await unfoldInfobox(page);
    await expectPlekken(page, spec.plekken);
    await expect(page.locator('#field-prijs')).toHaveValue(String(spec.prijs), { timeout: 5000 });
  }).toPass({ timeout: 60_000 });

  return { name: spec.name, path };
}

async function openKamer(page: Page, slug: string) {
  await page.goto(`/kamer/${slug}`);
  await expect(page.getByTestId('kamer-page')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId('kamer-grid')).toBeVisible({ timeout: 20_000 });
}

/**
 * De Keeper schrijft munten bij tot de kamer zelf zegt dat ze er staan.
 *
 * §85 liet dit op het **saldo** wachten in plaats van op het bedrag. Het
 * wachtte op "staat het getal dat ik typte in de regel bovenaan", en dat is
 * alleen waar bij de eerste gift: twee keer geven maakt van 9 en 11 een 20 en
 * de tweede oproep wachtte twintig seconden op een 11 die er nooit kwam. Nu
 * leest hij het saldo vooraf en wacht hij op de som — dezelfde som die het
 * grootboek eronder maakt (§79 regel 1: dit scherm rekent niets uit, het leest
 * wat de server teruggeeft).
 */
async function giveMunten(keeper: Page, slug: string, amount: number, reason: string) {
  await openKamer(keeper, slug);
  const balance = keeper.getByTestId('kamer-balance');
  const before = Number((await balance.getAttribute('data-balance')) ?? '0');
  const form = keeper.getByTestId('grootboek-form');
  await expect(form).toBeVisible({ timeout: 20_000 });
  await fillWhenReady(form.getByTestId('grootboek-bedrag'), String(amount));
  await fillWhenReady(form.getByTestId('grootboek-reden'), reason);
  await form.getByTestId('grootboek-geef').click();
  await expect(balance).toHaveAttribute('data-balance', String(before + amount), { timeout: 20_000 });
}

test.describe('§84 Het geld spreekt', () => {
  /**
   * ZAAK 1, 2 en 3 — één beweging: je ziet je saldo in de hoek van een pagina
   * die niets met je kamer te maken heeft, je klikt erop en staat in je kamer,
   * je gaat naar de winkel, je koopt iets waarvan de knop de prijs droeg, en de
   * melding brengt je naar de tegel waar het terechtkwam.
   */
  test('de beurs is één klik van je kamer, en een koop zegt waar het ding heen is', async ({
    page,
    browser,
    isMobile,
  }, info) => {
    test.skip(isMobile, '§84 wordt op de desk bewezen; de telefoon heeft zijn eigen zaak');
    test.setTimeout(300_000);
    const stamp = `${info.project.name}-${Date.now().toString(36)}`;

    await signIn(page, ...KEEPER);
    // Eén ding dat op twee soorten plek past — de zaak die §83 stukmaakte.
    const klok = await newHuisraad(page, {
      name: `Staande klok ${stamp}`,
      plekken: ['muur', 'bureau'],
      prijs: 2,
      effect: [`Hij slaat het uur ${stamp}`],
    });

    const ownerCtx = await browser.newContext();
    const owner = await ownerCtx.newPage();
    const { slug } = await signUpWearing(owner, `Beurs ${stamp}`);
    await giveMunten(page, slug, 9, `Startgeld ${stamp}`);

    /* ---------------------------------- 1. één klik, vanaf een vreemde pagina */

    await owner.goto('/wiki');
    const beurs = owner.getByTestId('shell-beurs').getByTestId('beurs');
    await expect(beurs).toBeVisible({ timeout: 20_000 });
    await expect(beurs).toHaveAttribute('data-balance', '9');
    await beurs.click();
    await expect(owner.getByTestId('kamer-page')).toBeVisible({ timeout: 20_000 });
    await expect(owner).toHaveURL(new RegExp(`/kamer/${slug}$`));

    /* ------------------------------ 3. één rij, twee chips, één koopknop */

    await owner.goto('/winkel');
    await expect(owner.getByTestId('winkel-page')).toBeVisible({ timeout: 20_000 });
    const rij = owner.getByTestId('winkel-rij').filter({ hasText: klok.name });
    await expect(rij).toHaveCount(1);
    await expect(rij).toHaveAttribute('data-kinds', 'muur bureau');
    await expect(rij.getByTestId('winkel-koop')).toHaveCount(1);

    /* --------------------------- 2. de prijs op de knop, en de melding erna */

    const koop = rij.getByTestId('winkel-koop');
    await expect(koop).toContainText('2');
    await koop.click();

    const toast = owner.locator('.toast').filter({ hasText: klok.name });
    await expect(toast).toBeVisible({ timeout: 20_000 });
    // Hij zegt waar het heen is én wat het kostte.
    await expect(toast).toContainText('−2');
    await expect(owner.getByTestId('winkel-balance')).toHaveAttribute('data-balance', '7', {
      timeout: 20_000,
    });

    // En de deur erin landt op de tegel zelf.
    await toast.getByRole('button', { name: 'Bekijk' }).click();
    await expect(owner.getByTestId('kamer-page')).toBeVisible({ timeout: 20_000 });
    const gevuld = owner.locator('[data-testid="plek"][data-state="filled"]').filter({ hasText: klok.name });
    await expect(gevuld).toHaveCount(1);
    // Het adres wijst die plek aan, en dat is wat `:target` oplicht.
    const id = await gevuld.getAttribute('id');
    expect(owner.url()).toContain(`#${id}`);

    await ownerCtx.close();
  });

  /**
   * ZAAK 4 en 5 — op een telefoon. "Nog n nodig" was tot ronde 45 een `title`
   * op een uitgeschakelde knop, en een `title` bestaat hier niet; de FAB stond
   * bovenop de laatste koopknop.
   */
  test('op een telefoon staat de tekortzin er, en de FAB dekt geen knop af', async ({
    page,
    browser,
    isMobile,
  }, info) => {
    test.skip(!isMobile, 'dit gaat over 390 px');
    test.setTimeout(300_000);
    const stamp = `${info.project.name}-${Date.now().toString(36)}`;

    await signIn(page, ...KEEPER);
    await newHuisraad(page, {
      name: `Dure kast ${stamp}`,
      plekken: ['muur'],
      prijs: 40,
      effect: [`Te duur ${stamp}`],
    });

    const ownerCtx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const owner = await ownerCtx.newPage();
    const { slug } = await signUpWearing(owner, `Smal ${stamp}`);
    await giveMunten(page, slug, 3, `Beetje ${stamp}`);

    /* -------------------------------------- 4. zichtbaar, niet in een title */

    await openKamer(owner, slug);
    const kort = owner.getByTestId('plek-short').first();
    await expect(kort).toBeVisible({ timeout: 20_000 });
    await expect(kort).toContainText('nodig');

    await owner.goto('/winkel');
    const duur = owner.getByTestId('winkel-rij').filter({ hasText: `Dure kast ${stamp}` });
    await expect(duur.getByTestId('winkel-short')).toBeVisible({ timeout: 20_000 });
    await expect(duur.getByTestId('winkel-short')).toContainText('nodig');

    /* ------------------------------------- 5. elke knop is echt aan te raken */

    /*
     * Elke knop wordt eerst **in het midden van het scherm gezet** en dan pas
     * opgemeten, want dat is wat een duim doet: je scrollt tot het ding voor
     * je staat en dan druk je.
     *
     * §85 moest dit herschrijven, en de reden is het lezen waard. Het stond er
     * eerst zo: sla een knop over waarvan de onderkant voorbij 844 px ligt.
     * Dat mengt twee stelsels — `boundingBox()` meet vanaf de bovenkant van het
     * *document*, `elementFromPoint` vanaf de bovenkant van het *venster* — en
     * het houdt geen rekening met de tabbalk, die vastgeplakt onderaan de
     * laatste 56 px van het venster bezet. Zolang de knoppen 34 px waren viel
     * daar niets in; zodra §85 ze op 44 px zette landde er één in die band en
     * riep de test "ligt onder iets anders" over een knop waar niets mis mee
     * was. Een test die zegt dat het stuk is terwijl het werkt, is net zo duur
     * als een die zwijgt terwijl het stuk is.
     */
    for (const path of [`/kamer/${slug}`, '/winkel', '/you']) {
      await owner.goto(path);
      await expect(owner.getByRole('main')).toBeVisible({ timeout: 20_000 });
      const buttons = owner.getByRole('main').locator('.btn:visible');
      const count = await buttons.count();
      for (let i = 0; i < count; i += 1) {
        const button = buttons.nth(i);
        const label = (await button.innerText()).trim().slice(0, 30);
        await button.evaluate((el) => el.scrollIntoView({ block: 'center' }));
        const seen = await button.evaluate((el) => {
          const box = el.getBoundingClientRect();
          const mid = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
          return { height: box.height, mine: Boolean(mid?.closest('.btn')) };
        });
        expect(seen.mine, `${path}: "${label}" ligt onder iets anders`).toBe(true);
        expect(seen.height, `${path}: "${label}" is te klein voor een vinger`).toBeGreaterThanOrEqual(40);
      }
    }

    await ownerCtx.close();
  });

  /**
   * ZAAK 6 — de Keeper staat in andermans kamer met andermans beurs, en dat
   * stond nergens. Openen betaalt zíj (dat is de beslissing van deze ronde),
   * neerzetten is gratis, en het verschil hoort op het scherm te staan.
   */
  test('de Keeper ziet dat hij meekijkt, en de speler ziet die zin nooit', async ({ page, browser, isMobile }, info) => {
    test.skip(isMobile, 'één schermformaat is genoeg voor een zin');
    test.setTimeout(180_000);
    const stamp = `${info.project.name}-${Date.now().toString(36)}`;

    const ownerCtx = await browser.newContext();
    const owner = await ownerCtx.newPage();
    const { slug } = await signUpWearing(owner, `Gast ${stamp}`);

    await signIn(page, ...KEEPER);
    await openKamer(page, slug);
    const banner = page.getByTestId('kamer-guest');
    await expect(banner).toBeVisible({ timeout: 20_000 });
    await expect(banner).toContainText(`Gast ${stamp}`);

    // En in zijn eigen ogen is de speler nergens te gast.
    await openKamer(owner, slug);
    await expect(owner.getByTestId('kamer-guest')).toHaveCount(0);
    // De eyebrow zegt van wie de kamer is, en niet "Kamer" (§84).
    await expect(owner.getByTestId('kamer-eyebrow')).toHaveText(`Gast ${stamp}`);

    await ownerCtx.close();
  });

  /**
   * En de donker-fix, gemeten in plaats van bekeken: een knop die je niet kunt
   * indrukken hoort er ánders uit te zien dan een die je wel kunt indrukken, en
   * in het donker deed hij dat niet — allebei bijna hetzelfde rood.
   */
  test('een knop die niet kan, ziet er in het donker anders uit dan een die wel kan', async ({
    page,
    isMobile,
  }) => {
    test.skip(isMobile, 'één schermformaat is genoeg voor een kleur');
    test.setTimeout(120_000);
    await signIn(page, ...KEEPER);
    await page.goto('/you');
    // De site tekent een uitgeschakelde primaire knop gestreept en doorzichtig
    // in élk palet; dat is de reparatie, en ze is in de opmaak te lezen.
    const style = await page.evaluate(() => {
      const probe = document.createElement('button');
      probe.className = 'btn btn-small btn-primary';
      probe.disabled = true;
      document.body.appendChild(probe);
      const off = getComputedStyle(probe);
      const result = { background: off.backgroundColor, border: off.borderTopStyle, opacity: off.opacity };
      probe.remove();
      return result;
    });
    expect(style.border).toBe('dashed');
    expect(style.opacity).toBe('1');
    expect(style.background).toMatch(/rgba\(0, 0, 0, 0\)|transparent/);
  });
});

/**
 * §85: de kamer in de hand — de tweede helft, door dezelfde hand.
 *
 * Ronde 45 gaf het geld een stem; ronde 46 gaf de rest van de feature zijn
 * vorm. Wat daarvan hier staat is weer alleen wat een *scherm* is:
 *
 *   7. Het raster houdt dezelfde rijhoogte vóór en ná een koop.
 *   8. Het grootboek leest als zinnen en klapt in op de laatste drie.
 *   9. De plek-kiezer is twee echte tabs met één zoekvak, en hij opent op het
 *      tabblad dat iets te zeggen heeft.
 *  10. De uitdeler zegt in de voet wat de knop gaat doen, en die voet staat op
 *      een telefoon in beeld zonder scrollen.
 *  11. De hal zet jou bovenaan en zegt waarom.
 *  12. Een onderzoekersartikel wijst naar zijn kamer — en alleen voor wie er in
 *      mag (§80: de deur is absent voor wie er niet doorheen kan).
 */
test.describe('§85 De kamer in de hand', () => {
  /**
   * ZAAK 7 — de duurste fout van de vier rondes ervoor, in één meting.
   *
   * Een tegel had alleen een `min-height`, dus de rij groeide mee met een
   * staande omslag van 3:4 en het raster brak bij de éérste koop. De proef is
   * daarom niet "de tegel is 13,5rem" — dat is de opmaak overschrijven — maar:
   * **alle tegels in het raster zijn even hoog, en dat verandert niet doordat
   * er iets in komt te liggen.**
   */
  test('het raster houdt zijn rijhoogte als er iets gekocht wordt', async ({
    page,
    browser,
    isMobile,
  }, info) => {
    test.skip(isMobile, 'de rijhoogte is op allebei de formaten dezelfde afspraak; één bewijs is genoeg');
    test.setTimeout(300_000);
    const stamp = `${info.project.name}-${Date.now().toString(36)}`;

    await signIn(page, ...KEEPER);
    const prent = await newHuisraad(page, {
      name: `Hoge prent ${stamp}`,
      plekken: ['muur'],
      prijs: 2,
      effect: [`Zij kijkt terug ${stamp}`],
    });

    const ownerCtx = await browser.newContext();
    const owner = await ownerCtx.newPage();
    const { slug } = await signUpWearing(owner, `Raster ${stamp}`);
    await giveMunten(page, slug, 6, `Startgeld ${stamp}`);

    const heights = async (p: Page) =>
      p.$$eval('[data-testid="plek"]', (els) =>
        els.map((el) => Math.round(el.getBoundingClientRect().height)),
      );

    await openKamer(owner, slug);
    const before = await heights(owner);
    expect(before.length).toBeGreaterThan(3);
    expect(new Set(before).size, `voor de koop: ${before.join(', ')}`).toBe(1);

    /*
     * Kopen, en dan opnieuw meten. **Op naam**, niet `.first()`: de winkel is
     * het hele archief, dus de bovenste rij is van het stuk huisraad dat een
     * zaak hiervóór gemaakt heeft en niet van deze. Dat is geen theorie — de
     * grootboekzaak hieronder viel er precies over om.
     */
    await owner.goto('/winkel');
    const rij = owner.locator('[data-testid="winkel-rij"]').filter({ hasText: prent.name });
    await rij.getByTestId('winkel-koop').click();
    await expect(rij.getByTestId('winkel-owned')).toBeVisible({ timeout: 20_000 });

    await openKamer(owner, slug);
    await expect(owner.locator('[data-state="filled"]').first()).toBeVisible({ timeout: 20_000 });
    const after = await heights(owner);
    expect(new Set(after).size, `na de koop: ${after.join(', ')}`).toBe(1);
    expect(after[0], 'de rij is niet uitgerekt door wat erin kwam te liggen').toBe(before[0]);

    await ownerCtx.close();
  });

  /**
   * ZAAK 8 — het grootboek leest als zinnen, en houdt zijn mond over de rest.
   *
   * Het zei `Plek: plank` voor een geopende plek en een kale artikelnaam voor
   * een koop: veldnamen, geen gebeurtenissen. En het toonde alle vijftig regels
   * die `ledgerOf` ophaalt, onder een kamer van twaalf tegels.
   */
  test('het grootboek zegt wat er gebeurd is, en klapt in op drie regels', async ({
    page,
    browser,
    isMobile,
  }, info) => {
    test.skip(isMobile, 'dezelfde lijst op een smaller scherm bewijst niets nieuws');
    test.setTimeout(300_000);
    const stamp = `${info.project.name}-${Date.now().toString(36)}`;

    await signIn(page, ...KEEPER);
    const kruk = await newHuisraad(page, {
      name: `Kruk ${stamp}`,
      plekken: ['bureau'],
      prijs: 2,
      effect: [`Je kunt erop zitten ${stamp}`],
    });

    const ownerCtx = await browser.newContext();
    const owner = await ownerCtx.newPage();
    const { slug } = await signUpWearing(owner, `Boek ${stamp}`);

    // Vier regels: drie keer geven en één koop. Drie staan er, de rest achter
    // een knop.
    await giveMunten(page, slug, 9, `Startgeld ${stamp}`);
    await giveMunten(page, slug, 11, `De storm ${stamp}`);
    await giveMunten(page, slug, 13, `Het pakhuis ${stamp}`);

    await openKamer(owner, slug);
    const balance = owner.getByTestId('kamer-balance');
    const beforeUnlock = await balance.getAttribute('data-balance');
    await owner.getByTestId('plek-unlock').first().click();
    await expect(balance).not.toHaveAttribute('data-balance', beforeUnlock!, { timeout: 20_000 });

    await owner.goto('/winkel');
    // Op naam: de winkel toont élk stuk huisraad in het archief, dus de
    // bovenste rij is van een andere zaak (zie de zaak hierboven).
    const krukRij = owner.locator('[data-testid="winkel-rij"]').filter({ hasText: kruk.name });
    await krukRij.getByTestId('winkel-koop').click();
    await expect(krukRij.getByTestId('winkel-owned')).toBeVisible({ timeout: 20_000 });

    await openKamer(owner, slug);
    const rows = owner.getByTestId('grootboek-regel');
    await expect(rows).toHaveCount(3);

    // Zinnen, niet veldnamen. De koop draagt de naam van het ding, de plek haar
    // soort, en de gift het woord voor de Keeper.
    const shown = (await owner.locator('.kamer-grootboek-why').allInnerTexts()).join(' | ');
    expect(shown).toContain(`${kruk.name} gekocht`);
    expect(shown).toMatch(/geopend/);
    expect(shown, 'een veldnaam met een dubbele punt is geen zin').not.toMatch(/^Plek: /m);

    // En de rest staat er wel degelijk, achter één knop.
    await owner.getByTestId('grootboek-meer').click();
    await expect(rows).toHaveCount(5);
    expect((await owner.locator('.kamer-grootboek-why').allInnerTexts()).join(' | ')).toContain(
      `Startgeld ${stamp}`,
    );

    await ownerCtx.close();
  });

  /**
   * ZAAK 9 — de plek-kiezer.
   *
   * Twee dingen die alleen sámen kloppen: het zijn echte tabs (precies één aan,
   * `aria-selected`, `--tap` eronder) en hij opent op het tabblad dat iets te
   * zeggen heeft. Wie nog niets bezit kreeg tot ronde 46 een leeg blad met één
   * zin erin — op de eerste avond dus iedereen.
   */
  test('de plek-kiezer opent op het tabblad dat iets heeft, met één zoekvak erboven', async ({
    page,
    browser,
    isMobile,
  }, info) => {
    test.setTimeout(300_000);
    const stamp = `${info.project.name}-${Date.now().toString(36)}`;

    await signIn(page, ...KEEPER);
    await newHuisraad(page, {
      name: `Lamp ${stamp}`,
      plekken: ['bureau'],
      prijs: 2,
      effect: [`Hij brandt ${stamp}`],
    });

    const ownerCtx = await browser.newContext();
    const owner = await ownerCtx.newPage();
    const { slug } = await signUpWearing(owner, `Kiezer ${stamp}`);
    await giveMunten(page, slug, 6, `Startgeld ${stamp}`);

    const picker = owner.getByTestId('plek-picker');
    const openOp = async (kind: string) => {
      await openKamer(owner, slug);
      await owner
        .locator(`[data-state="empty"][data-kind="${kind}"]`)
        .first()
        .getByTestId('plek-place')
        .click();
      await expect(picker).toBeVisible({ timeout: 20_000 });
    };

    /*
     * BEEN A — het blad landt nooit op een doodlopende weg.
     *
     * Dit stond er eerst als "voor een muur heeft dit archief niets, dus hij
     * landt op de catalogus", en dat hield precies zolang als deze zaak alleen
     * liep: in de volle suite heeft een zaak twintig minuten eerder al huisraad
     * voor een muur gemaakt, en dan is *Wat je al hebt* voor een muur wél
     * gevuld en blijft het blad daar terecht staan. Een zaak die aanneemt wat
     * er in het archief ligt, neemt aan wat andere zaken gedaan hebben.
     *
     * Wat er bewaakt wordt is daarom de regel zelf, die onafhankelijk van de
     * inhoud waar is: **het blad staat nooit stil op een leeg bezit.**
     */
    await openOp('muur');
    await owner.waitForTimeout(900);
    if ((await picker.getAttribute('data-tab')) === 'bezit') {
      await expect(
        picker.getByTestId('plek-picker-optie'),
        'het blad bleef staan op een leeg "Wat je al hebt"',
      ).not.toHaveCount(0);
    } else {
      await expect(picker).toHaveAttribute('data-tab', 'catalogus');
    }
    await owner.keyboard.press('Escape');
    await expect(picker).toHaveCount(0, { timeout: 10_000 });

    /*
     * BEEN B — een plek waar wél iets voor is. Dan blijft hij staan waar hij
     * begint, en dat is de kant die het makkelijkst stilletjes omvalt: `items`
     * begint leeg omdat er nog niets gevráágd is, en een blad dat dát voor
     * "niets gevonden" aanziet springt élke keer weg, ook voor iemand met een
     * plank vol. (Zo was het één middag lang, deze ronde.)
     */
    await openOp('bureau');
    await expect(picker.getByTestId('plek-picker-optie')).not.toHaveCount(0, { timeout: 20_000 });
    await expect(picker).toHaveAttribute('data-tab', 'bezit');
    await owner.waitForTimeout(800);
    await expect(picker, 'het blad sprong alsnog weg').toHaveAttribute('data-tab', 'bezit');

    // Echte tabs: twee, precies één geselecteerd, en het zoekvak staat erboven
    // in plaats van in één van de twee.
    const tabs = owner.getByRole('tab');
    await expect(tabs).toHaveCount(2);
    await expect(owner.getByRole('tab', { selected: true })).toHaveCount(1);
    await expect(owner.getByTestId('plek-picker-zoek')).toBeVisible();

    // En het vak filtert de catalogus ook, want anders is "boven allebei" een
    // belofte die het niet waarmaakt.
    await owner.getByTestId('plek-picker-tab-catalogus').click();
    await expect(owner.getByTestId('plek-catalogus-rij')).not.toHaveCount(0, { timeout: 20_000 });
    await owner.getByTestId('plek-picker-zoek').fill('zoiets bestaat niet');
    await expect(owner.getByTestId('plek-catalogus-leeg')).toBeVisible({ timeout: 20_000 });
    await owner.getByTestId('plek-picker-zoek').fill(`Lamp ${stamp}`);
    await expect(owner.getByTestId('plek-catalogus-rij')).toHaveCount(1);

    if (isMobile) {
      // §69 6.1: een tabblad is iets wat een duim raakt.
      for (const tab of await tabs.all()) {
        const box = await tab.boundingBox();
        expect(box!.height, 'een tab onder de 44 px').toBeGreaterThanOrEqual(40);
      }
    }

    await ownerCtx.close();
  });

  /**
   * ZAAK 10 — de uitdeler zegt wat hij gaat doen, waar je hem kunt lezen.
   *
   * De som stond als `.tiny` aan het eind van de knop geplakt en las als een
   * breuk (*"36 munten / 12"*); op een tafel van twaalf stond hij bovendien
   * onder de vouw. Nu een zin in een plakkende voet — en die voet moet op 390 px
   * in beeld staan zonder te scrollen, want anders is het weer hetzelfde.
   */
  test('de uitdeler draagt zijn totaal in een voet die in beeld staat', async ({ page }) => {
    test.setTimeout(240_000);
    await signIn(page, ...KEEPER);
    await page.goto('/uitdelen');
    await expect(page.getByTestId('uitdelen-page')).toBeVisible({ timeout: 20_000 });

    // Zonder kamers heeft dit scherm niets te zeggen; dan is er ook geen voet.
    const rows = page.getByTestId('uitdelen-rij');
    if ((await rows.count()) === 0) {
      await expect(page.getByTestId('uitdelen-leeg')).toBeVisible();
      return;
    }

    await fillWhenReady(page.getByTestId('uitdelen-iedereen'), '3');
    const foot = page.getByTestId('uitdelen-totaal');
    /*
     * Een *zin*, en niet een breuk. Het bedrag zelf staat er niet in de proef,
     * want hoeveel kamers deze tafel heeft hangt af van welke specs ervoor
     * liepen — en een test die zijn eigen archief niet kent, hoort op de vorm
     * te wachten en niet op een getal. (Dat was hij eerst wél: hij wachtte op
     * "3" en kreeg "15 munten naar 5 kamers", wat precies goed was.)
     */
    await expect(foot).toHaveText(/^\d+ munten naar \d+ kamers?$/, { timeout: 20_000 });
    const total = Number((await foot.getAttribute('data-total')) ?? '0');
    const boxes = await page.getByTestId('uitdelen-bedrag').all();
    let typed = 0;
    for (const box of boxes) typed += Number((await box.inputValue()) || '0');
    expect(total, 'de voet telt iets anders op dan wat er in de vakjes staat').toBe(typed);

    // De knop staat in beeld zonder scrollen, en de FAB staat er niet overheen
    // — die wijkt op deze pagina (§85).
    const placed = await page.evaluate(() => {
      const button = document.querySelector('[data-testid="uitdelen-geef"]');
      const fab = document.querySelector('.fab');
      const box = button!.getBoundingClientRect();
      const mid = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
      return {
        inView: box.top >= 0 && box.bottom <= innerHeight,
        pressable: Boolean(mid && (mid === button || button!.contains(mid) || mid.contains(button!))),
        fabShown: Boolean(fab && getComputedStyle(fab).display !== 'none'),
      };
    });
    expect(placed.inView, 'de uitdeelknop staat onder de vouw').toBe(true);
    expect(placed.pressable, 'er staat iets op de uitdeelknop').toBe(true);
    expect(placed.fabShown, 'de FAB wijkt niet op /uitdelen').toBe(false);
  });

  /**
   * ZAAK 11 en 12 — de hal kent jou, en een onderzoeker wijst naar zijn kamer.
   *
   * De hal stond alfabetisch, dus "waar sta ik" was elke avond een ander
   * antwoord. En een onderzoekersartikel — het ene scherm dat over een
   * onderzoeker gáát — noemde zijn kamer nergens.
   */
  test('de hal zet jou bovenaan, en je onderzoeker wijst naar zijn kamer', async ({
    page,
    browser,
  }, info) => {
    test.setTimeout(300_000);
    const stamp = `${info.project.name}-${Date.now().toString(36)}`;

    await signIn(page, ...KEEPER);

    const ownerCtx = await browser.newContext();
    const owner = await ownerCtx.newPage();
    const { slug } = await signUpWearing(owner, `Hal ${stamp}`);

    await owner.goto('/spelers');
    const doors = owner.getByTestId('spelers-deur');
    await expect(doors.first()).toBeVisible({ timeout: 20_000 });
    // Bovenaan, gemarkeerd, en precies één regel draagt dat merk.
    await expect(doors.first()).toHaveAttribute('data-self', 'ja');
    await expect(owner.getByTestId('spelers-jij')).toHaveCount(1);

    // En de deur naar de kamer staat op het artikel van de onderzoeker zelf.
    await owner.goto(`/e/${slug}`);
    const door = owner.getByTestId('entry-kamer-deur');
    await expect(door).toBeVisible({ timeout: 20_000 });
    await door.click();
    await expect(owner.getByTestId('kamer-page')).toBeVisible({ timeout: 20_000 });
    expect(new URL(owner.url()).pathname).toBe(`/kamer/${slug}`);

    /*
     * §80: een slot heeft ook aan de buitenkant een gleuf. Een gewoon artikel
     * dat niemand draagt heeft geen kamer, en dus ook geen deur ernaartoe —
     * absent, niet uitgeschakeld.
     */
    await page.goto('/wiki/huisraad');
    const sheet = page.getByRole('dialog', { name: 'Nieuw artikel' });
    await expect(async () => {
      if (!(await sheet.isVisible().catch(() => false))) {
        await page.getByRole('button', { name: 'Nieuw', exact: true }).click({ timeout: 5000 });
      }
      await expect(sheet).toBeVisible({ timeout: 1500 });
    }).toPass({ timeout: 30_000 });
    await sheet.getByLabel('Naam', { exact: true }).fill(`Losse stoel ${stamp}`);
    await sheet.getByRole('button', { name: 'Aanmaken' }).click();
    await page.waitForURL('**/e/**');
    await expect(page.getByTestId('entry-kamer')).toHaveCount(0);

    await ownerCtx.close();
  });
});
