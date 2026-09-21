import { expect, test, type Browser, type Locator, type Page } from '@playwright/test';
import { becomeInvestigator, editCanvas, newBoard, readCanvas, signIn, signUp } from './helpers';

/**
 * §90, ronde 51 — "De deuren", de helft van de tekenvlakken en Beheer.
 *
 *   C1  één tik in Lezen, op elk van de vier vlakken, opent geen dialoog;
 *       in Bewerken vraagt het glas het nog wél;
 *   C2  een notitiekaart in Lezen biedt geen "Artikel aanmaken";
 *   C3  *Nieuwe notitie* landt gekozen en in tekstmodus, en de `n` die je typt
 *       opent geen "Nieuw artikel"; *Punaise* landt met de caret in zijn label;
 *   C10 *Ongedaan maken* is in Lezen zichtbaar en grijs;
 *   C15 het gebeurtenisblad stelt een echte datum voor, geselecteerd;
 *   C30 een tab in Beheer staat in het adres en overleeft een herlaadbeurt.
 */

const KEEPER = ['Keeper', 'abbeytower34'] as const;
const PASSWORD = 'kurkenbord7';

/** The sheet §18b puts in front of somebody who has not said who they are. */
const askSheet = (page: Page) => page.getByRole('dialog', { name: 'Met wie ben je nu aan het schrijven?' });

async function picture(): Promise<Buffer> {
  const sharp = (await import('sharp')).default;
  return sharp({ create: { width: 900, height: 600, channels: 3, background: '#d9d2b8' } })
    .png()
    .toBuffer();
}

/** The four canvases, made by the Keeper in a window of his own. Returns their paths. */
async function keeperMakesFour(browser: Browser, stamp: string): Promise<Record<string, string>> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await signIn(page, ...KEEPER);
  const out: Record<string, string> = {};

  await page.goto('/boards');
  await newBoard(page, { name: `Kurk ${stamp}` });
  out.prikbord = new URL(page.url()).pathname;

  await page.goto('/stambomen');
  await page.getByRole('button', { name: /Nieuwe stamboom/ }).click();
  await page.getByRole('dialog', { name: /Nieuwe stamboom/ }).getByRole('button', { name: /Openbare stamboom/ }).click();
  await page.waitForURL('**/stambomen/**');
  out.stamboom = new URL(page.url()).pathname;

  await page.goto('/timelines');
  await page.getByRole('button', { name: /Nieuwe tijdlijn/ }).click();
  await page.getByRole('dialog', { name: /Nieuwe tijdlijn/ }).getByRole('button', { name: /Openbare tijdlijn/ }).click();
  await page.waitForURL('**/timelines/**');
  out.tijdlijn = new URL(page.url()).pathname;

  await page.goto('/maps');
  await page.getByRole('button', { name: 'Landkaart ophangen' }).click();
  const sheet = page.getByRole('dialog', { name: 'Landkaart ophangen' });
  await sheet.getByLabel('Afbeelding').setInputFiles({ name: 'eiland.png', mimeType: 'image/png', buffer: await picture() });
  await sheet.getByLabel('Naam', { exact: true }).click();
  await page.keyboard.press('Control+a');
  await page.keyboard.type(`Eiland ${stamp}`);
  await sheet.getByRole('button', { name: 'Ophangen' }).click();
  await page.waitForURL('**/maps/**');
  out.landkaart = new URL(page.url()).pathname;

  await context.close();
  return out;
}

const STAGES: Record<string, string> = {
  prikbord: '.board-viewport',
  stamboom: '.tree-stage',
  tijdlijn: '.timeline-stage',
  landkaart: '[role="application"]',
};

/** A tap on a phone, a click on a desk — at a spot of the glass that is bare. */
async function touch(page: Page, target: Locator, isPhone: boolean) {
  const box = (await target.boundingBox())!;
  const position = { x: Math.round(box.width * 0.8), y: Math.round(box.height * 0.2) };
  if (isPhone) await target.tap({ position });
  else await target.click({ position });
}

test('C1: in Lezen vraagt geen tekenvlak wie er schrijft; in Bewerken vraagt het glas het wél', async ({
  page,
  browser,
}, info) => {
  test.setTimeout(300_000);
  const isPhone = info.project.name === 'phone';
  const stamp = `${info.project.name}-${Date.now().toString(36)}`;
  const paths = await keeperMakesFour(browser, stamp);

  // A speler with an onderzoeker, in a window that has not said who is writing.
  await signUp(page, `Kijker ${stamp}`, PASSWORD);
  await becomeInvestigator(page, `Kijkster ${stamp}`);
  await page.evaluate(() => window.sessionStorage.clear());

  for (const [name, path] of Object.entries(paths)) {
    await page.goto(path);
    const stage = page.locator(STAGES[name]).first();
    await expect(stage, name).toBeVisible({ timeout: 20_000 });
    // A desk opens in Bewerken; the switch itself asks nothing (§90).
    await readCanvas(page);
    await expect(askSheet(page), `${name}: de schakelaar vraagt niets`).toHaveCount(0);

    await touch(page, stage, isPhone);
    await page.getByRole('group', { name: 'Zoomen', exact: true }).getByRole('button', { name: 'Alles in beeld' }).click();
    // Give a sheet that was going to come the time to come.
    await page.waitForTimeout(600);
    await expect(askSheet(page), `${name}: een tik in Lezen opent geen dialoog`).toHaveCount(0);
  }

  // And the question is not gone, only moved: in Bewerken the glas asks it.
  await page.goto(paths.prikbord);
  await editCanvas(page);
  await expect(askSheet(page)).toHaveCount(0);
  const cork = page.locator(STAGES.prikbord);
  await expect(async () => {
    if ((await askSheet(page).count()) === 0) await touch(page, cork, isPhone);
    await expect(askSheet(page)).toBeVisible({ timeout: 1500 });
  }).toPass({ timeout: 15_000 });
});

test('C2/C3: Nieuwe notitie landt in tekstmodus, de n opent niets, en in Lezen is er geen Artikel aanmaken', async ({
  page,
}, info) => {
  test.setTimeout(120_000);
  const stamp = `${info.project.name}-${Date.now().toString(36)}`;
  await signIn(page, ...KEEPER);
  await page.goto('/boards');
  await newBoard(page, { name: `Notities ${stamp}` });

  await page.getByRole('button', { name: 'Nieuwe notitie' }).click();
  const box = page.locator('.board-card-text-input');
  await expect(box, 'de nieuwe notitie staat open om in te schrijven').toBeFocused({ timeout: 10_000 });
  const words = `Een notitie ${stamp}`;
  await page.keyboard.type(words);
  await expect(page.getByRole('dialog', { name: /Nieuw artikel/ }), 'de n in wat je typt opent niets').toHaveCount(0);
  await expect(box).toHaveValue(words);
  await box.blur();
  const card = page.locator('.board-card', { hasText: words });
  await expect(card).toBeVisible();
  await expect(card.getByRole('button', { name: /aanmaken/ })).toBeVisible();

  // Punaise: chosen, and the caret in its label.
  await page.getByRole('button', { name: 'Punaise', exact: true }).click();
  await expect(page.locator('#pin-label')).toBeFocused({ timeout: 10_000 });
  await page.keyboard.type('Haven');
  await expect(page.getByRole('dialog', { name: /Nieuw artikel/ })).toHaveCount(0);

  // C2: in Lezen the card offers no road to a new artikel.
  await readCanvas(page);
  await expect(card).toBeVisible();
  await expect(card.getByRole('button', { name: /aanmaken/ })).toHaveCount(0);
});

test('C10: Ongedaan maken staat in Lezen op de tijdlijn en de stamboom, grijs', async ({ page }) => {
  test.setTimeout(120_000);
  await signIn(page, ...KEEPER);

  await page.goto('/timelines');
  await page.getByRole('button', { name: /Nieuwe tijdlijn/ }).click();
  await page.getByRole('dialog', { name: /Nieuwe tijdlijn/ }).getByRole('button', { name: /Openbare tijdlijn/ }).click();
  await page.waitForURL('**/timelines/**');
  await readCanvas(page);
  const undo = page.getByRole('button', { name: 'Ongedaan maken' });
  await expect(undo).toBeVisible();
  await expect(undo).toBeDisabled();

  await page.goto('/stambomen');
  await page.getByRole('button', { name: /Nieuwe stamboom/ }).click();
  await page.getByRole('dialog', { name: /Nieuwe stamboom/ }).getByRole('button', { name: /Openbare stamboom/ }).click();
  await page.waitForURL('**/stambomen/**');
  await readCanvas(page);
  await expect(undo).toBeVisible();
  await expect(undo).toBeDisabled();
});

test('C15: het gebeurtenisblad stelt een datum voor, en typen vervangt hem', async ({ page }) => {
  test.setTimeout(120_000);
  const stamp = Date.now().toString(36);
  await signIn(page, ...KEEPER);
  await page.goto('/timelines');
  await page.getByRole('button', { name: /Nieuwe tijdlijn/ }).click();
  await page.getByRole('dialog', { name: /Nieuwe tijdlijn/ }).getByRole('button', { name: /Openbare tijdlijn/ }).click();
  await page.waitForURL('**/timelines/**');
  await expect(async () => {
    await editCanvas(page);
    await expect(page.getByTestId('timeline-add')).toBeVisible({ timeout: 1500 });
  }).toPass({ timeout: 20_000 });

  await page.getByTestId('timeline-add').click();
  const add = page.getByRole('dialog', { name: /Gebeurtenis op/ });
  await add.locator('#new-event-query').fill(`Voorstel ${stamp}`);
  await add.getByRole('button', { name: /Losse gebeurtenis/ }).click();

  const year = add.locator('#new-event-year');
  await expect(year).not.toHaveValue('');
  await expect(year).toBeFocused();
  // The placeholder says what goes there; it is not a date that looks filled in.
  await expect(add.locator('#new-event-month')).toHaveAttribute('placeholder', 'maand');
  await expect(add.getByText(/^Dit wordt: /)).toBeVisible();
  // Filled in, so the primary button is a real one — not the outlined "held back" one.
  await expect(add.getByTestId('new-event-submit')).toBeEnabled();

  // Selected: typing replaces the proposal rather than adding to it.
  await page.keyboard.type('1931');
  await expect(year).toHaveValue('1931');
});

test('C30: een tab in Beheer staat in het adres en blijft na herladen', async ({ page }) => {
  await signIn(page, ...KEEPER);
  await page.goto('/admin');
  const trash = page.getByRole('tab', { name: /Prullenbak/ });
  await expect(async () => {
    await trash.click();
    await expect(page).toHaveURL(/[?&]tab=trash/, { timeout: 1500 });
  }).toPass({ timeout: 15_000 });
  await page.reload();
  await expect(page.getByRole('tab', { name: /Prullenbak/ })).toHaveAttribute('aria-selected', 'true');
});
