import { expect, test, type Locator, type Page } from '@playwright/test';
import { editArticle, signIn } from './helpers';

/**
 * Een `<details>` openzetten en wachten tot hij ópen is, niet tot er geklikt is.
 * Een pagina die net van gezicht gewisseld is luistert nog niet, en een tweede
 * klik vouwt hem weer dicht — dezelfde reden als `openInfobox` in
 * `family-trees-33.spec.ts`.
 */
async function openFold(fold: Locator) {
  const open = () => fold.evaluate((element: HTMLDetailsElement) => element.open);
  await fold.locator('summary').first().waitFor({ state: 'visible' });
  if (!(await open())) await fold.locator('summary').first().click();
  await expect.poll(open, { timeout: 10_000 }).toBe(true);
}

/**
 * §68: vier kleine dingen aan het lezen van een archief.
 *
 * Drie ervan gaan over één ding — een verwijzing is een link — en het vierde is
 * de andere helft van §65.
 *
 * De twee muistesten zijn de reden dat dit bestand bestaat. Ze tellen *tabbladen*,
 * want dat is precies wat er misging en het is niet met een selector te zien:
 * ProseMirror vraagt `handleClickOn` vanaf `mouseup`, en `mouseup` komt van elke
 * knop. Dus opende de middelste knop er twee (één ervan werd door de popup-blocker
 * opgegeten, wat de melding was) en de rechter opende het artikel in plaats van
 * het menu van de browser op te zetten. Een spec die "de chip is er nog" zegt ziet
 * daar niets van.
 */

/** Het artikel in de fixture met een chip in zijn lopende tekst. */
const ARTICLE = '/e/middelburg';
const CHIP = 'De Schorre';

function chipInBody(page: Page) {
  return page.locator('.ProseMirror .entry-chip', { hasText: CHIP });
}

/** Wat de browser van het chipje maakt: het kader en de stip. */
async function chipLook(page: Page) {
  return chipInBody(page).evaluate((element) => ({
    border: getComputedStyle(element).borderTopWidth,
    dot: getComputedStyle(element, '::before').content,
    colour: getComputedStyle(element).color,
  }));
}

test.describe('§68 — de verwijzing', () => {
  test('leest als een blauwe link en draagt zijn kader alleen waar getypt wordt', async ({ page }) => {
    await signIn(page, 'Keeper', 'abbeytower34');
    await page.goto(ARTICLE);

    const chip = chipInBody(page);
    await expect(chip).toBeVisible();

    // §22: dit is de leesknop, dus geen kader en geen stip.
    const reading = await chipLook(page);
    expect(reading.border).toBe('0px');
    expect(reading.dot).toBe('none');

    // En op de schrijfknop staat het chipje er weer, want daar is het één teken
    // dat je met één Backspace weghaalt.
    await editArticle(page);
    const writing = await chipLook(page);
    expect(writing.border).toBe('1px');
    expect(writing.dot).not.toBe('none');
    expect(writing.colour).not.toBe(reading.colour);
  });

  // Een telefoon heeft geen middelste en geen rechter muisknop, en een
  // geëmuleerde aanraking die er een nadoet zegt niets over wat een echte hand
  // doet. Deze twee zijn van de desktop.
  test.describe('met een muis', () => {
    test.skip(({ isMobile }) => Boolean(isMobile), 'een telefoon heeft deze knoppen niet');

  test('opent op de middelste knop één tabblad en niet twee', async ({ page, context }) => {
    await signIn(page, 'Keeper', 'abbeytower34');
    await page.goto(ARTICLE);

    const opened: string[] = [];
    context.on('page', (tab) => opened.push(tab.url()));

    await chipInBody(page).click({ button: 'middle' });
    // Eén tabblad is snel; een tweede kwam vroeger uit hetzelfde gebaar, dus er
    // wordt gewacht *nadat* de eerste er is en dan pas geteld.
    await expect.poll(() => opened.length, { timeout: 5_000 }).toBe(1);
    await page.waitForTimeout(750);
    expect(opened).toHaveLength(1);

    const tab = context.pages().find((other) => other !== page);
    await expect.poll(() => tab?.url() ?? '').toContain('/e/');
    // En de lezer staat nog waar hij stond.
    expect(new URL(page.url()).pathname).toBe(ARTICLE);
  });

  test('laat de rechtermuisknop aan de browser', async ({ page, context }) => {
    await signIn(page, 'Keeper', 'abbeytower34');
    await page.goto(ARTICLE);

    const opened: string[] = [];
    context.on('page', (tab) => opened.push(tab.url()));

    await chipInBody(page).click({ button: 'right' });
    await page.waitForTimeout(1_000);

    // Het menu van de browser is geen HTML en dus niet te zien vanaf hier. Wat
    // wél te zien is, is wat er niet gebeurd mag zijn: geen tweede tabblad en
    // geen stap weg van de pagina waar het menu op stond.
    expect(opened).toHaveLength(0);
    expect(new URL(page.url()).pathname).toBe(ARTICLE);
  });
  });
});

test('§68 — de geschiedenis klapt uit tot de zinnen zelf', async ({ page }, testInfo) => {
  const sentence = `De sluiswachter zag het om vier uur. ${testInfo.project.name} ${Date.now().toString(36)}`;

  await signIn(page, 'Keeper', 'abbeytower34');
  await page.goto('/e/vlissingen');
  await editArticle(page);

  const body = page.locator('.ProseMirror');
  await body.click();
  await page.keyboard.press('Control+End');
  await page.keyboard.press('Enter');
  await page.keyboard.type(sentence);
  await expect(page.locator('.save-state')).toHaveText('Opgeslagen', { timeout: 15_000 });

  await page.goto('/e/vlissingen');
  const history = page.locator('details.section', {
    has: page.locator('summary', { hasText: 'Geschiedenis' }),
  });
  await openFold(history);

  // De regel zelf telt al sinds §65 — "Tekst — 1 regel erbij". Wat §68 erbij
  // doet is het blokje eronder, en daarin staat de zin die er kwam te staan.
  const row = history.locator('li').first();
  await expect(row).toContainText('Tekst');

  const more = row.locator('details.rev-more');
  await expect(more.locator('.rev-lines')).toBeHidden();
  await openFold(more);
  // `toContainText` en niet `toHaveText` op de regels los: de twee projecten
  // delen één archief, en twee bewerkingen van dezelfde hand binnen vijf
  // minuten worden één versie (`REVISION_COALESCE_SECONDS`). Die versie heeft
  // dan de zin van de desktop én die van de telefoon toegevoegd, en allebei
  // horen er te staan — wat deze test vraagt is of de zin die zij net typte er
  // ook bij staat.
  await expect(more.locator('.rev-lines')).toContainText(`+ ${sentence}`);
});
