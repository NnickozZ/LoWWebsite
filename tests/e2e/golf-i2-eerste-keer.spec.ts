import { expect, test, type Browser, type Page } from '@playwright/test';
import { inviteCode, signIn } from './helpers';

/**
 * §106 (golf i2): de eerste keer.
 *
 * De e2e-suite draait op de fixture (`seed-demo`), en een leeg archief bestaat
 * daar niet: de weg van een verse Keeper is daarom een screenshotscript, geen
 * spec. Wat hier wel kan, staat hier:
 *
 *  1. de voordeur: de code uit de uitnodigingslink, en een code zoals je hem
 *     plakt (spaties, kleine letters, zonder streepje);
 *  2. *Wie ben jij aan tafel?*: één vraag, een welkom, en daarna geen
 *     schrijfvraag meer in dit venster;
 *  3. *Sta je er al in?*: je eerste karakter uit het archief koppelen;
 *  4. de lege staten op plekken die in de fixture leeg zijn: een nieuw dossier
 *     en een nieuwe soort;
 *  5. de regel bij een eerste bezoek, die niet terugkomt.
 */

const KEEPER = ['Keeper', 'abbeytower34'] as const;
const askSheet = (page: Page) => page.getByRole('dialog', { name: 'Met wie ben je nu aan het schrijven?' });
const stampOf = (name: string) => `${name.slice(0, 2)}${Date.now().toString(36).slice(-6)}`;

/** Een code zoals een mens hem uit een bericht plakt. */
function messy(code: string) {
  const bare = code.replace(/-/g, '').toLowerCase();
  return `  ${bare.slice(0, 3)} ${bare.slice(3)}\n`;
}

async function signUpFresh(page: Page, name: string) {
  await page.goto(`/signup?code=${encodeURIComponent(inviteCode().replace('-', '').toLowerCase())}`);
  await page.getByLabel('Naam', { exact: true }).fill(name);
  await page.getByLabel('Wachtwoord', { exact: true }).fill('onderzeeboot');
  await page.getByLabel('Wachtwoord nogmaals').fill('onderzeeboot');
  await page.getByRole('button', { name: 'Account aanmaken' }).click();
  await page.waitForURL((url) => url.pathname === '/');
}

async function keeperPage(browser: Browser) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await signIn(page, ...KEEPER);
  return { context, page };
}

test('de voordeur: de code uit de link staat in het vak, en een geplakte code met rommel eromheen klopt', async ({
  page,
}, info) => {
  const code = inviteCode();
  await page.goto(`/signup?code=${encodeURIComponent(code.replace('-', '').toLowerCase())}`);
  const box = page.getByLabel('Uitnodigingscode');
  // In de vorm van de Keeper, en de cursor staat al bij de naam.
  await expect(box).toHaveValue(code);
  await expect(page.getByText('Ingevuld uit je uitnodiging.')).toBeVisible();
  await expect(page.getByLabel('Naam', { exact: true })).toBeFocused();

  // Plakken met spaties, een regeleinde en kleine letters: het vak vormt hem.
  await box.fill(messy(code));
  await expect(box).toHaveValue(code);

  // En de server neemt hem ook zonder streepje aan (§106: `normaliseInvite`).
  await box.evaluate((el: HTMLInputElement, raw) => {
    el.value = raw;
  }, code.replace('-', ' ').toLowerCase());
  await page.getByLabel('Naam', { exact: true }).fill(`Plakker ${stampOf(info.project.name)}`);
  await page.getByLabel('Wachtwoord', { exact: true }).fill('onderzeeboot');
  await page.getByLabel('Wachtwoord nogmaals').fill('onderzeeboot');
  await page.getByRole('button', { name: 'Account aanmaken' }).click();
  await page.waitForURL((url) => url.pathname === '/');
  await expect(page.getByTestId('wie-ben-jij')).toBeVisible();
});

test('wie ben jij aan tafel: één vraag, één welkom, en daarna geen schrijfvraag meer', async ({ page }, info) => {
  test.setTimeout(120_000);
  const stamp = stampOf(info.project.name);
  const character = `Cornelis ${stamp}`;
  await signUpFresh(page, `Nieuw ${stamp}`);

  // Op Start staat de vraag zelf, en dus niet ook nog de regel erboven.
  const card = page.getByTestId('wie-ben-jij');
  await expect(card).toBeVisible();
  await expect(card.getByRole('heading', { name: 'Wie ben jij aan tafel?' })).toBeVisible();
  await expect(page.getByTestId('no-author-banner')).toHaveCount(0);
  // Geen Jij-rij met alleen *Kies je karakter*: de kaart ís die stap.
  await expect(page.getByTestId('home-jij')).toHaveCount(0);

  // Elders is het één regel, met een deur hierheen.
  await page.goto('/cases');
  const line = page.getByTestId('no-author-banner');
  await expect(line).toBeVisible();
  await expect(line).toContainText('Je leest mee');
  await expect(line.getByTestId('no-author-door')).toHaveAttribute('href', '/#wie-ben-jij');
  await line.getByTestId('no-author-door').click();
  await page.waitForURL((url) => url.pathname === '/');

  await page.getByTestId('wie-naam').fill(character);
  await page.getByTestId('wie-ga').click();

  const welcome = page.getByTestId('wie-welkom');
  await expect(welcome).toBeVisible({ timeout: 20_000 });
  await expect(welcome.getByRole('heading')).toHaveText(`Welkom, ${character}.`);
  // Golf O: Start has no Jij-rij any more; the welcome is the one place that
  // says *Naar de kamer* (M6, na review 4, held by having nothing to hide).
  await expect(page.getByTestId('home-jij')).toHaveCount(0);
  await expect(welcome).toBeVisible();
  await expect(welcome.getByTestId('wie-welkom-kamer')).toHaveAttribute('href', /^\/kamer\//);

  // *Schrijf je eerste artikel*: meteen rood, en het blad komt zonder de vraag
  // met wie je schrijft.
  const write = welcome.getByTestId('wie-welkom-schrijf');
  await expect(write).toHaveClass(/btn-primary/);
  await expect(write).toBeEnabled();
  await write.click();
  await expect(page.getByRole('dialog', { name: 'Nieuw artikel' })).toBeVisible();
  await expect(askSheet(page)).toHaveCount(0);
  await page.keyboard.press('Escape');

  // Eén keer vieren, en klaar: bij het volgende bezoek is er niets meer.
  await page.goto('/');
  // Golf O: Start is the welcome and its doors (no Jij-rij, no feed).
  await expect(page.getByTestId('home-deuren')).toBeVisible();
  await expect(page.getByTestId('wie-welkom')).toHaveCount(0);
  await expect(page.getByTestId('wie-ben-jij')).toHaveCount(0);
  await expect(page.getByTestId('no-author-banner')).toHaveCount(0);
});

test('één karakter: geen schrijfvraag in een nieuw venster, wel één zachte melding', async ({ page, browser }, info) => {
  test.setTimeout(120_000);
  const stamp = stampOf(info.project.name);
  const account = `Enkel ${stamp}`;
  const character = `Adriaan ${stamp}`;
  await signUpFresh(page, account);
  await page.getByTestId('wie-naam').fill(character);
  await page.getByTestId('wie-ga').click();
  await expect(page.getByTestId('wie-welkom')).toBeVisible({ timeout: 20_000 });

  // Een nieuw venster (morgen, of een tweede tabblad): §18b vraagt per venster,
  // maar met één karakter valt er niets te kiezen (H5, na review 4).
  const context = await browser.newContext({ viewport: page.viewportSize() ?? undefined });
  const other = await context.newPage();
  await signIn(other, account, 'onderzeeboot');
  await other.goto('/wiki');
  await expect(async () => {
    await other.getByRole('button', { name: 'Nieuw artikel' }).locator('visible=true').first().click({ timeout: 5000 });
    await expect(other.getByRole('dialog', { name: 'Nieuw artikel' })).toBeVisible({ timeout: 2000 });
  }).toPass({ timeout: 30_000 });
  await expect(askSheet(other)).toHaveCount(0);
  await expect(other.getByText(`Je schrijft als ${character}.`)).toBeVisible();

  // Eén keer: nog een keer maken zegt het niet opnieuw.
  await other.keyboard.press('Escape');
  await other.reload();
  await expect(async () => {
    await other.getByRole('button', { name: 'Nieuw artikel' }).locator('visible=true').first().click({ timeout: 5000 });
    await expect(other.getByRole('dialog', { name: 'Nieuw artikel' })).toBeVisible({ timeout: 2000 });
  }).toPass({ timeout: 30_000 });
  await other.waitForTimeout(500);
  await expect(other.getByText(`Je schrijft als ${character}.`)).toHaveCount(0);
  await expect(askSheet(other)).toHaveCount(0);
  await context.close();
});

test('sta je er al in: je eerste karakter uit het archief koppelen', async ({ page, browser }, info) => {
  test.setTimeout(120_000);
  const stamp = stampOf(info.project.name);
  const character = `Elsje Bestaand ${stamp}`;
  const keeper = await keeperPage(browser);
  const made = await keeper.page.request.post('/api/entries', { data: { typeSlug: 'investigator', name: character } });
  expect(made.ok()).toBeTruthy();
  await keeper.context.close();

  await signUpFresh(page, `Koppel ${stamp}`);
  const card = page.getByTestId('wie-ben-jij');
  await card.locator('summary', { hasText: 'Sta je er al in?' }).click();
  const search = card.getByPlaceholder(/^Zoek het artikel van je karakter/);
  await search.fill(character);
  await card.locator('.suggest-item').filter({ hasText: character }).filter({ hasNotText: 'aanmaken' }).first().click();

  await expect(page.getByTestId('wie-welkom').getByRole('heading')).toHaveText(`Welkom, ${character}.`, {
    timeout: 20_000,
  });
});

test('een nieuw dossier: elk leeg tabblad zegt wat er komt', async ({ page, isMobile }, info) => {
  await signIn(page, ...KEEPER);
  const made = await page.request.post('/api/cases', { data: { name: `Leeg dossier ${stampOf(info.project.name)}` } });
  expect(made.ok()).toBeTruthy();
  const { case: created } = (await made.json()) as { case: { slug: string } };

  await page.goto(`/c/${created.slug}`);
  // Op een computer zijn het tabbladen; op een telefoon staat alles onder elkaar.
  const board = page.locator('[data-testid="lege-staat"][data-leeg="prikbord"]');
  if (!isMobile) await page.getByRole('tab', { name: /Prikbord/ }).click();
  await expect(board).toBeVisible();
  await expect(board).toContainText('Nog geen prikbord bij dit dossier.');
  // In Lezen staat er geen maakknop boven, dus ook geen zin die ernaar wijst.
  await expect(board).not.toContainText('De knop hierboven');

  if (!isMobile) await page.getByRole('tab', { name: /Tijdlijn/ }).click();
  await expect(page.locator('[data-testid="lege-staat"][data-leeg="tijdlijn"]')).toBeVisible();
});

test('een nieuwe soort: de lege lijst heeft een deur naar het eerste artikel van die soort', async ({ page }, info) => {
  test.setTimeout(120_000);
  const soort = `Vondsten ${stampOf(info.project.name)}`;
  await signIn(page, ...KEEPER);
  await page.goto('/admin?tab=types');
  await page.locator('#new-type').fill(soort);
  await page.getByRole('button', { name: 'Soort aanmaken' }).click();
  await expect(
    page.locator('details.admin-type').filter({ has: page.locator('summary', { hasText: soort }) }),
  ).toHaveAttribute('open', '', { timeout: 20_000 });

  await page.goto('/wiki');
  // Golf O: the tiles are gone from the voordeur; every soort is a tab (golf N).
  await page.locator('.type-tab').filter({ hasText: soort }).click();
  await page.waitForURL(/\/wiki\/[^/]+$/);

  const empty = page.getByTestId('lege-staat');
  await expect(empty).toHaveAttribute('data-leeg', 'soort');
  await expect(empty).toContainText(`Onder ${soort.toLowerCase()} is nog niets opgeborgen.`);
  await empty.getByRole('button', { name: 'Schrijf de eerste' }).click();
  const sheet = page.getByRole('dialog', { name: 'Nieuw artikel' });
  await expect(sheet).toBeVisible();
  await expect(sheet.getByRole('radio', { name: soort, exact: true })).toHaveAttribute('aria-checked', 'true');
});

test('een eerste bezoek aan de wiki en de kamer: één regel, en daarna niet meer', async ({ page }, info) => {
  test.setTimeout(120_000);
  const stamp = stampOf(info.project.name);
  await signUpFresh(page, `Bezoek ${stamp}`);
  await page.getByTestId('wie-naam').fill(`Bram ${stamp}`);
  await page.getByTestId('wie-ga').click();
  const toRoom = page.getByTestId('wie-welkom-kamer');
  await expect(toRoom).toBeVisible({ timeout: 20_000 });
  await toRoom.click();
  await page.waitForURL('**/kamer/**');

  const line = page.getByTestId('eerste-bezoek');
  await expect(line).toHaveAttribute('data-plek', 'kamer');
  await expect(line).toContainText('Dit is je kamer.');
  await page.reload();
  await expect(page.getByTestId('kamer-page')).toBeVisible();
  await expect(page.getByTestId('eerste-bezoek')).toHaveCount(0);

  await page.goto('/wiki');
  await expect(page.getByTestId('eerste-bezoek')).toHaveAttribute('data-plek', 'wiki');
  await page.getByTestId('eerste-bezoek-weg').click();
  await expect(page.getByTestId('eerste-bezoek')).toHaveCount(0);
  await page.goto('/wiki');
  await expect(page.locator('.type-tabs-rij')).toBeVisible();
  await expect(page.getByTestId('eerste-bezoek')).toHaveCount(0);
});
