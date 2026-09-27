import { expect, test, type Locator, type Page } from '@playwright/test';
import { becomeInvestigator, editArticle, fillWhenReady, inviteCode, signIn } from './helpers';

/**
 * §101 (ronde 62, "De losse eindjes") — wat alleen een browser kan zeggen.
 *
 *   B25  de lege velden van een nieuw artikel achter "+ Veld invullen".
 *   7    *Ongedaan maken* na een koop is live voor wie meekijkt.
 *   8    de Keeper legt iets rechtstreeks in een lade.
 *   9    het kruisje op een tegel ligt niet over het plekwoord, en blijft 44 px.
 *   14   een blad zet de caret erin, en geeft hem terug bij sluiten.
 *   16   geen "Uitgetekend op: … nog niets" op een Persoon.
 *   17   geen lege Tekst in Lezen.
 *   18   de gekozen soort staat in beeld in de strook.
 *   19   de notities op /you zijn te lezen op een telefoon.
 *
 * De zuivere helften staan in `tests/unit/ronde-62-eindjes.test.ts`.
 */

const KEEPER = ['Keeper', 'abbeytower34'] as const;

async function makeEntry(page: Page, name: string, typeSlug = 'character', fields: object = {}) {
  const made = await page.request.post('/api/entries', { data: { name, typeSlug, fields } });
  expect(made.ok()).toBe(true);
  return ((await made.json()) as { entry: { id: string; slug: string } }).entry;
}

/** Op een telefoon is de infobox een dichtgeklapte `<details>` (§6); op 1440 px doet dit niets. */
async function unfoldInfobox(page: Page) {
  const box = page.locator('details#block-info');
  if (!(await box.count())) return;
  await expect(async () => {
    if (!(await box.evaluate((el) => (el as HTMLDetailsElement).open))) await box.locator('summary').click();
    expect(await box.evaluate((el) => (el as HTMLDetailsElement).open)).toBe(true);
  }).toPass({ timeout: 15_000 });
}

async function signUpWearing(page: Page, name: string): Promise<{ character: string; slug: string }> {
  await page.goto('/signup');
  await page.getByLabel('Uitnodigingscode').fill(inviteCode());
  await page.getByLabel('Naam', { exact: true }).fill(name);
  await page.getByLabel('Wachtwoord', { exact: true }).fill('onderzeeboot');
  await page.getByLabel('Wachtwoord nogmaals').fill('onderzeeboot');
  await page.getByRole('button', { name: 'Account aanmaken' }).click();
  await page.waitForURL('**/');
  const character = `Onderzoeker ${name}`;
  const path = await becomeInvestigator(page, character);
  return { character, slug: path.replace(/^\/e\//, '') };
}

async function openKamer(page: Page, slug: string) {
  await page.goto(`/kamer/${slug}`);
  await expect(page.getByTestId('kamer-page')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId('kamer-grid')).toBeVisible({ timeout: 20_000 });
}

async function giveMunten(keeper: Page, slug: string, amount: number) {
  await openKamer(keeper, slug);
  const balance = keeper.getByTestId('kamer-balance');
  const before = Number((await balance.getAttribute('data-balance')) ?? '0');
  const form = keeper.getByTestId('grootboek-form');
  await fillWhenReady(form.getByTestId('grootboek-bedrag'), String(amount));
  await fillWhenReady(form.getByTestId('grootboek-reden'), 'startgeld');
  await form.getByTestId('grootboek-geef').click();
  await expect(balance).toHaveAttribute('data-balance', String(before + amount), { timeout: 20_000 });
}

/** Huisraad met plek en prijs, langs de API: de maakweg zelf is ronde 54's zaak. */
async function makeHuisraad(page: Page, name: string, plekken: string[], prijs: number) {
  return makeEntry(page, name, 'huisraad', { plek: plekken, prijs, effect: `Iets ${name}` });
}

/* ================================================================ B25 */

test('B25: de lege velden van een nieuw artikel staan achter "+ Veld invullen", ingevulde blijven staan', async ({
  page,
}, info) => {
  test.setTimeout(120_000);
  const stamp = `${info.project.name}-${Date.now().toString(36)}`;
  await signIn(page, ...KEEPER);
  // Eén veld ingevuld bij het maken; de rest leeg.
  const entry = await makeEntry(page, `Veldwachter ${stamp}`);
  const patched = await page.request.patch(`/api/entries/${entry.id}`, { data: { fields: { occupation: 'Veldwachter' } } });
  expect(patched.ok()).toBe(true);
  await page.goto(`/e/${entry.slug}`);
  await editArticle(page);
  await unfoldInfobox(page);

  const fold = page.getByTestId('fields-empty');
  await expect(fold).toBeVisible({ timeout: 20_000 });
  const summary = fold.locator('summary');
  await expect(summary).toContainText('Veld invullen');
  await expect(summary).toContainText(/\d+ leeg/);
  // Dicht: de lege vakken zijn er niet te zien; het ingevulde Beroep wel, erboven.
  await expect(fold.locator('.fields-empty-body')).toBeHidden();
  await expect(page.locator('#field-occupation')).toBeVisible();
  expect(await fold.evaluate((el) => (el as HTMLDetailsElement).open)).toBe(false);

  // Met het toetsenbord open, zoals een knop.
  await summary.focus();
  await page.keyboard.press('Enter');
  await expect(fold.locator('.fields-empty-body')).toBeVisible();
  const boxes = fold.locator('.fields-empty-body > div');
  expect(await boxes.count()).toBeGreaterThanOrEqual(2);

  // Het ingevulde veld staat niet in de vouw.
  await expect(fold.locator('#field-occupation')).toHaveCount(0);

  // Wat je in de vouw invult, springt er niet onder je vingers uit.
  const aliases = fold.locator('#field-aliases');
  await aliases.click();
  await page.keyboard.type('Bertus');
  await expect(aliases).toBeFocused();
  await expect(fold.locator('#field-aliases')).toHaveCount(1);
});

test('B25: een artikel zonder lege velden heeft geen vouw', async ({ page }, info) => {
  test.skip(info.project.name === 'phone', 'dezelfde component; de vorm is op de desk bewezen');
  const stamp = `${info.project.name}-${Date.now().toString(36)}`;
  await signIn(page, ...KEEPER);
  // Huisraad met alles ingevuld: plek, prijs, effect.
  const entry = await makeHuisraad(page, `Volle kast ${stamp}`, ['plank'], 2);
  await page.goto(`/e/${entry.slug}`);
  await editArticle(page);
  await expect(page.locator('#field-prijs')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId('fields-empty')).toHaveCount(0);
});

/* ========================================================= 7 + 8 + 9 */

test('7 + 9: Ongedaan maken is live voor wie meekijkt, en het kruisje laat het plekwoord vrij', async ({
  page,
  browser,
}, info) => {
  test.setTimeout(300_000);
  const stamp = `${info.project.name}-${Date.now().toString(36)}`;
  const name = `Bureaulamp ${stamp}`;

  await signIn(page, ...KEEPER);
  await makeHuisraad(page, name, ['bureau'], 2);

  const ownerCtx = await browser.newContext(info.project.use);
  const owner = await ownerCtx.newPage();
  const { slug } = await signUpWearing(owner, `Koper ${stamp}`);
  await giveMunten(page, slug, 4);

  // De Keeper kijkt mee in de kamer; de speler koopt in de winkel.
  await openKamer(page, slug);
  await owner.goto('/winkel');
  const rij = owner.getByTestId('winkel-rij').filter({ hasText: name });
  await expect(rij).toHaveCount(1, { timeout: 20_000 });
  await rij.getByTestId('winkel-koop').click();

  const watched = page.locator('[data-testid="plek"][data-state="filled"]').filter({ hasText: name });
  await expect(watched).toHaveCount(1, { timeout: 20_000 });

  // 9: het plekwoord en het kruisje overlappen niet, en het kruisje is 44 × 44.
  const word = watched.locator('.plek-kind-word');
  const cross = watched.locator('.plek-clear');
  await expect(word).toBeVisible();
  const w = (await word.boundingBox())!;
  const c = (await cross.boundingBox())!;
  expect(w.x + w.width, 'het woord eindigt vóór het kruisje').toBeLessThanOrEqual(c.x + 0.5);
  expect(c.width).toBeGreaterThanOrEqual(43.5);
  expect(c.height).toBeGreaterThanOrEqual(43.5);

  // 7: ongedaan maken bij de koper — de meekijker ziet de tegel leeglopen.
  const toast = owner.locator('.toast').filter({ hasText: name });
  await toast.getByRole('button', { name: 'Ongedaan maken' }).click();
  await expect(owner.locator('.toast').filter({ hasText: 'teruggebracht' })).toBeVisible({ timeout: 20_000 });
  await expect(watched).toHaveCount(0, { timeout: 20_000 });
  await expect(page.getByTestId('kamer-balance')).toHaveAttribute('data-balance', '4', { timeout: 20_000 });

  await ownerCtx.close();
});

test('8: de Keeper legt huisraad rechtstreeks in een lade, met een melding', async ({ page, browser }, info) => {
  test.setTimeout(240_000);
  const stamp = `${info.project.name}-${Date.now().toString(36)}`;
  const name = `Wandkaart ${stamp}`;

  await signIn(page, ...KEEPER);
  await makeHuisraad(page, name, ['muur'], 5);

  const ownerCtx = await browser.newContext(info.project.use);
  const owner = await ownerCtx.newPage();
  const { character, slug } = await signUpWearing(owner, `Ontvanger ${stamp}`);

  // De speler heeft de weg niet: afwezig, niet verborgen (§44).
  await openKamer(owner, slug);
  await expect(owner.getByTestId('lade-gift')).toHaveCount(0);

  await openKamer(page, slug);
  const gift = page.getByTestId('lade-gift');
  await expect(gift).toBeVisible();
  await gift.getByRole('textbox').fill(name);
  // De rij van het artikel zelf (met zijn soort eronder), niet "‘…’ aanmaken".
  await page.locator('.suggest-item').filter({ hasText: name }).filter({ hasText: 'Huisraad' }).first().click();
  await expect(gift.locator('.entry-chip')).toHaveText(name);
  await gift.getByTestId('lade-gift-geef').click();
  await expect(page.locator('.toast').filter({ hasText: `${name} ligt nu in de lade van ${character}.` })).toBeVisible({
    timeout: 20_000,
  });
  await expect(page.getByTestId('kamer-lade-ding').filter({ hasText: name })).toHaveCount(1, { timeout: 20_000 });
  // Gratis: het saldo bleef staan.
  await expect(page.getByTestId('kamer-balance')).toHaveAttribute('data-balance', '0');

  // En de eigenaar ziet het in zijn lade, en kan het neerzetten.
  await openKamer(owner, slug);
  await expect(owner.getByTestId('kamer-lade-ding').filter({ hasText: name })).toHaveCount(1, { timeout: 20_000 });

  await ownerCtx.close();
});

/* ================================================================== 14 */

/** Open een blad met een klik op `opener`, en kijk waar de caret staat — en waar hij terugkomt. */
async function focusRoundTrip(page: Page, opener: Locator, dialog: Locator, inside?: Locator) {
  await expect(async () => {
    if (!(await dialog.isVisible().catch(() => false))) await opener.click({ timeout: 5000 });
    await expect(dialog).toBeVisible({ timeout: 2000 });
  }).toPass({ timeout: 30_000 });
  if (inside) await expect(inside).toBeFocused({ timeout: 5000 });
  else expect(await dialog.evaluate((el) => el.contains(document.activeElement))).toBe(true);
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(opener).toBeFocused();
}

test('14: een blad zet de caret erin en geeft hem terug aan wie het opende', async ({ page }, info) => {
  test.skip(info.project.name === 'phone', 'Escape en de focus zijn toetsenbordzaken; de telefoon heeft geen Escape');
  test.setTimeout(180_000);
  const stamp = `${info.project.name}-${Date.now().toString(36)}`;
  await signIn(page, ...KEEPER);
  const entry = await makeEntry(page, `Blad ${stamp}`);

  // Nieuw dossier: had een effect bij het openen dat geen vak vond.
  await page.goto('/cases');
  await focusRoundTrip(
    page,
    page.getByRole('button', { name: /Nieuw dossier|dossier openen/i }).first(),
    page.getByRole('dialog'),
    page.locator('#new-case-name'),
  );

  // Aan dossier toevoegen, en de landkaart koppelen op een artikel.
  await page.goto(`/e/${entry.slug}`);
  await focusRoundTrip(
    page,
    page.getByRole('button', { name: 'Aan dossier toevoegen' }).first(),
    page.getByRole('dialog'),
    page.getByRole('dialog').locator('input').first(),
  );
  await editArticle(page);
  await focusRoundTrip(page, page.getByTestId('connect-map'), page.getByRole('dialog'));
});

/* ============================================================ 16 + 17 */

test('16 + 17: geen "Uitgetekend op … nog niets" op een Persoon, en geen lege Tekst in Lezen', async ({
  page,
}, info) => {
  test.setTimeout(120_000);
  const stamp = `${info.project.name}-${Date.now().toString(36)}`;
  await signIn(page, ...KEEPER);
  const entry = await makeEntry(page, `Leeg ${stamp}`);
  await page.goto(`/e/${entry.slug}`);

  // Lezen (een telefoon begint daar; op de desk kiezen we het): geen leeg Tekst-blok.
  const toggle = page.locator('.entry-mode-toggle');
  await toggle.waitFor({ state: 'visible', timeout: 15_000 });
  if ((await toggle.innerText()).trim() !== 'Bewerken') await toggle.click();
  await expect(toggle).toHaveText('Bewerken', { timeout: 10_000 });
  await expect(page.locator('.entry-body-block')).toBeHidden();

  // Bewerken: daar vul je hem, dus daar staat hij.
  await editArticle(page);
  await expect(page.locator('.entry-body-block')).toBeVisible();
  await expect(page.getByText('Uitgetekend op:')).toHaveCount(0);
  await expect(page.getByText('nog niets — voor een plattegrond')).toHaveCount(0);
  // De knop bestaat nog, tussen de andere handelingen.
  await expect(page.getByTestId('connect-map')).toHaveClass(/btn/);

  // Terug naar Lezen in dezelfde pagina: wat hier getypt kon zijn, verdwijnt niet.
  await page.locator('.entry-mode-toggle').click();
  await expect(page.locator('.entry-mode-toggle')).toHaveText('Bewerken');
  await expect(page.locator('.entry-body-block')).toBeVisible();
});

/* ================================================================== 18 */

test('18: de gekozen soort staat in beeld in de strook van het maakblad', async ({ page }, info) => {
  test.skip(info.project.name !== 'phone', 'op een telefoon is de strook smaller dan de soorten');
  test.setTimeout(120_000);
  await signIn(page, ...KEEPER);
  await page.goto('/search');
  // De laatste soort van de rij, zodat hij in de strook ver rechts staat.
  const chips = page.getByRole('radiogroup', { name: 'Zoek in' }).getByRole('radio');
  const last = chips.last();
  const label = ((await last.textContent()) ?? '').trim();
  await last.click();
  await page.getByLabel('Zoeken in het archief').fill(`Strook ${Date.now().toString(36)}`);
  await page.getByRole('button', { name: /aanmaken$/ }).click();
  const sheet = page.getByRole('dialog', { name: 'Nieuw artikel' });
  await expect(sheet).toBeVisible({ timeout: 20_000 });
  const chosen = sheet.getByRole('radio', { name: label, exact: true });
  await expect(chosen).toHaveAttribute('aria-checked', 'true');
  const strip = sheet.locator('.new-entry-types-strip');
  await expect(async () => {
    const s = (await strip.boundingBox())!;
    const c = (await chosen.boundingBox())!;
    expect(c.x).toBeGreaterThanOrEqual(s.x - 1);
    expect(c.x + c.width).toBeLessThanOrEqual(s.x + s.width + 1);
  }).toPass({ timeout: 5000 });
});

/* ================================================================== 19 */

test('19: op /you staan de notities achter Waarom?, niet in een title', async ({ page }) => {
  await signIn(page, ...KEEPER);
  await page.goto('/you');
  const hint = page.getByTestId('kleuren-hint');
  await expect(hint).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('.you-pref-row[title]')).toHaveCount(0);
  await hint.getByText('Waarom?').click();
  await expect(hint.locator('.you-why-body')).toBeVisible();
  await expect(hint.locator('.you-why-body')).toContainText('verschijnen vanzelf');
  const font = page.getByTestId('lettertype-hint');
  await font.getByText('Waarom?').click();
  await expect(font.locator('.you-why-body')).toContainText('die zijn het archief zelf');
});
