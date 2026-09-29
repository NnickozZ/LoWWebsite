import { mkdirSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { signIn, signUp } from './helpers';

/**
 * §107 (golf i3): Beheer voor de Keeper.
 *
 *  1. Op een telefoon is het eerste scherm een index, en `?tab=` slaat hem over.
 *  2. De soort-editor: Veld toevoegen typt meteen, Enter maakt het volgende,
 *     de snelknoppen, de kiezer van doel-soorten, pictogram en kleur met het
 *     voorbeeld en de zachte zin van D17, de telling in de voet, Ctrl S, en de
 *     deur naar een nieuw artikel van die soort.
 *  3. Woorden: vinden, veranderen en opslaan zonder muis, met de zin in context.
 *  4. De uitnodigingscode kopieert met een melding; het nieuwe wachtwoord is een blad.
 *  5. Screenshots van elke tab, licht en donker.
 */

const KEEPER = ['Keeper', 'abbeytower34'] as const;
const SHOTS = '/tmp/claude-0/shots-i3/na';

test.use({ permissions: ['clipboard-read', 'clipboard-write'] });

async function shot(page: Page, name: string, projectName: string) {
  mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: `${SHOTS}/${projectName}-${name}.png` });
}

test('telefoon: Beheer opent op een index, elke tab houdt zijn adres', async ({ page }, testInfo) => {
  await signIn(page, ...KEEPER);
  await page.goto('/admin');
  const index = page.getByTestId('beheer-index');
  if (testInfo.project.name !== 'phone') {
    // Review 4, M11: vanaf 1180 px is de index de linkerkolom, en er is geen strook die breekt.
    await expect(index).toBeVisible();
    await expect(page.locator('.beheer-strip')).toBeHidden();
    await expect(index.getByRole('tab', { name: 'Gebruikers' })).toHaveAttribute('aria-selected', 'true');
    await index.getByRole('tab', { name: 'Woorden' }).click();
    await expect(page).toHaveURL(/[?&]tab=words/);
    await expect(index.getByRole('tab', { name: 'Woorden' })).toHaveAttribute('aria-selected', 'true');
    return;
  }
  await expect(index).toBeVisible();
  // Tien onderdelen, elk met een zin eronder, en geen strook die opzij schuift.
  await expect(index.getByRole('tab')).toHaveCount(10);
  await expect(index.getByRole('tab', { name: /Prullenbak/ })).toContainText('Terugzetten wat weg is');
  await expect(page.locator('.beheer-strip')).toBeHidden();
  // Golf J (j3): bovenaan de index staat nu de uitnodiging (rij 28 van de
  // meting: 4 → 3), dus niet meer de hele index past op het eerste scherm.
  // Wat vaak gebeurt, wel: Gebruikers tot en met Woorden staan erop.
  const woorden = await index.getByRole('tab', { name: /Woorden/ }).boundingBox();
  expect(woorden!.y + woorden!.height).toBeLessThanOrEqual(844 - 60);
  await shot(page, 'index', testInfo.project.name);

  // Review 4, M10: geen + over de inhoud van Beheer.
  await expect(page.locator('.fab')).toBeHidden();

  await index.getByRole('tab', { name: /Prullenbak/ }).click();
  await expect(page).toHaveURL(/[?&]tab=trash/);
  await expect(index).toBeHidden();
  // Review 4, M10: na een keuze alleen *‹ Beheer*, geen tweede navigatie.
  await expect(page.locator('.beheer-strip')).toBeHidden();
  await expect(page.locator('.beheer-paneel')).toHaveAttribute('data-tab', 'trash');
  const terug = page.getByRole('button', { name: 'Terug naar alle onderdelen' });
  await expect(terug).toContainText('Beheer');
  await shot(page, 'paneel', testInfo.project.name);

  await terug.click();
  await expect(index).toBeVisible();
  await expect(page).not.toHaveURL(/tab=/);
});

test('de soort-editor: een soort met drie velden in één scherm', async ({ page }, testInfo) => {
  const soort = `Schepen i3 ${testInfo.project.name.slice(0, 2)} ${Date.now().toString(36).slice(-4)}`;
  await signIn(page, ...KEEPER);
  await page.goto('/admin?tab=types');
  await page.locator('#new-type').fill(soort);
  await page.locator('#new-type').press('Enter');

  const editor = page.locator('details.admin-type').filter({ has: page.locator('summary', { hasText: soort }) });
  await expect(editor).toHaveAttribute('open', '', { timeout: 20_000 });
  const add = editor.getByRole('button', { name: 'Veld toevoegen' });
  await expect(add).toBeFocused({ timeout: 10_000 });

  // Veld toevoegen typt meteen: de eerste letter maakt het veld.
  await page.keyboard.type('Tonnage');
  await expect(editor.getByLabel('Naam van veld 1')).toHaveValue('Tonnage');
  await expect(editor.getByLabel('Naam van veld 1')).toBeFocused();
  // Enter maakt het volgende.
  await page.keyboard.press('Enter');
  await expect(editor.getByLabel('Naam van veld 2')).toBeFocused();
  await page.keyboard.type('Status');
  await editor.getByLabel('Soort van veld 2').selectOption({ label: 'Keuzelijst' });
  // Een keuzelijst klapt zijn keuzes open.
  await editor.getByLabel('Keuzes van veld 2').fill('varend, gezonken');

  // Review 4, L5: een keuzelijst zonder keuzes zegt het in de voet.
  await editor.getByRole('button', { name: 'Keuzelijst', exact: true }).click();
  await page.keyboard.type('Klasse');
  await expect(editor.getByTestId('soort-geen-keuzes')).toContainText('Klasse heeft nog geen keuzes');
  await editor.getByLabel('Veld 3 verwijderen').click();

  // Een koppeling in één knop.
  await editor.getByRole('button', { name: 'Koppelingen', exact: true }).click();
  await expect(editor.getByLabel('Naam van veld 3')).toBeFocused();
  await page.keyboard.type('Bemanning');
  const picker = editor.getByTestId('veld-soorten');
  await picker.getByRole('button', { name: 'Kies soorten' }).click();
  await picker.getByRole('searchbox').fill('Perso');
  await picker.getByRole('searchbox').press('Enter');
  await expect(picker.locator('.admin-oftype-chosen')).toHaveText('Personen');

  // Pictogram en kleur, met het voorbeeld en de zachte zin als een ander hetzelfde draagt.
  await editor.getByTestId('soort-uiterlijk').click();
  const looks = editor.getByTestId('soort-uiterlijk-paneel');
  await looks.getByRole('radio', { name: 'Speld', exact: true }).click();
  await expect(looks.getByTestId('soort-teken-ook')).toContainText('Locaties');
  // Review 4, L1: twee soorten *dragen* het, één *draagt* het.
  await expect(looks.getByTestId('soort-teken-ook')).toContainText(/dragen dit teken ook/);
  await looks.getByRole('radio', { name: 'Anker', exact: true }).click();
  await looks.getByRole('radio', { name: '#31556B' }).click();
  await expect(looks.locator('.chip-soort')).toContainText(soort);

  const foot = editor.getByTestId('soort-voet');
  await expect(foot).toContainText('niet opgeslagen');
  await expect(foot.getByRole('button', { name: 'Opslaan', exact: true })).toBeInViewport();
  if (testInfo.project.name === 'desktop') {
    // Eén scherm: de velden en het voorbeeld staan naast de pagina-instellingen.
    const box = await editor.locator('.soort-hoofd').boundingBox();
    const side = await editor.locator('.soort-zij').boundingBox();
    expect(side!.x).toBeGreaterThan(box!.x + box!.width - 1);
    await editor.locator('.soort-hoofd').scrollIntoViewIfNeeded();
    await shot(page, 'soort-nieuw', testInfo.project.name);
  } else {
    await editor.getByLabel('Naam van veld 1').scrollIntoViewIfNeeded();
    await shot(page, 'soort-nieuw', testInfo.project.name);
  }

  // Ctrl S slaat op; het woord staat in de schil, de voet telt terug naar nul.
  await editor.getByLabel('Naam van veld 1').focus();
  await page.keyboard.press('Control+s');
  await expect(page.getByTestId('save-state')).toHaveAttribute('data-save', 'saved', { timeout: 20_000 });
  await expect(foot).toContainText('Alles bewaard');

  // En de deur naar een artikel van deze soort.
  await foot.getByTestId('soort-nieuw-artikel').click();
  const sheet = page.getByRole('dialog', { name: 'Nieuw artikel' });
  await expect(sheet.getByRole('radio', { name: soort })).toBeChecked({ timeout: 10_000 });
});

test('een bestaande soort: compacte rijen, en een veld erbij', async ({ page }, testInfo) => {
  await signIn(page, ...KEEPER);
  await page.goto('/admin?tab=types');
  const editor = page.locator('details.admin-type').filter({ has: page.locator('summary', { hasText: 'Personen' }) });
  await editor.locator('summary').click();
  await expect(editor).toHaveAttribute('open', '');
  // Een koppelveld staat dicht, met zijn instellingen in één regel.
  await expect(editor.locator('.veld-samenvatting').first()).toBeVisible();
  await expect(editor.getByTestId('veld-soorten')).toHaveCount(0);
  // Veld toevoegen staat in het eerste scherm van de editor op een computer.
  await editor.getByRole('button', { name: 'Veld toevoegen' }).scrollIntoViewIfNeeded();
  await shot(page, 'soort-personen', testInfo.project.name);
  if (testInfo.project.name === 'desktop') {
    // Was 3.000 px van de kop tot Veld toevoegen (drie schermen); nu ongeveer één.
    const top = (await editor.boundingBox())!.y;
    const addBox = await editor.getByRole('button', { name: 'Veld toevoegen' }).boundingBox();
    expect(addBox!.y - top).toBeLessThan(1000);
  }
});

test('Woorden: vinden, veranderen, opslaan — en waar het staat', async ({ page }, testInfo) => {
  await signIn(page, ...KEEPER);
  await page.goto('/admin?tab=words');
  // Review 4, L2: geen §-nummers in wat de Keeper leest.
  await expect(page.locator('.admin-words')).not.toContainText('§');
  const filter = page.getByTestId('words-filter');
  await filter.fill('Eén artikel');
  await filter.press('Enter');
  const box = page.getByLabel('Eén artikel', { exact: true });
  await expect(box).toBeFocused();
  await page.keyboard.type('wezen');
  const context = page.getByTestId('woord-context');
  await expect(context).toContainText('wezen');
  await shot(page, 'woorden-context', testInfo.project.name);
  // Zet het terug zonder op te slaan, en sla een onschuldige zin op.
  await box.fill('');
  await expect(context).toHaveCount(0);
  await filter.fill('Boven het vak voor een nieuw wachtwoord');
  await filter.press('Enter');
  const zin = page.getByLabel('Boven het vak voor een nieuw wachtwoord', { exact: true });
  await expect(zin).toBeFocused();
  await page.keyboard.type('Een nieuw wachtwoord');
  // Een gat dat verdwijnt, krijgt een zachte regel.
  await expect(context).toContainText('Zonder {naam}');
  await zin.fill('');
});

test('Gebruikers: kopieer de code, en een nieuw wachtwoord in een blad', async ({ page, browser }, testInfo) => {
  const name = `Speler i3 ${testInfo.project.name.slice(0, 2)}${Date.now().toString(36).slice(-4)}`;
  const other = await browser.newContext();
  await signUp(await other.newPage(), name, 'zeewering12');
  await other.close();
  await signIn(page, ...KEEPER);
  await page.goto('/admin?tab=users');
  // Review 4, L3: Kopieer zet de link op het klembord, dezelfde als de route op Start.
  const kopieer = page.getByTestId('invite-kopieer');
  await expect(kopieer).toHaveAttribute('data-link', /\/signup\?code=/);
  await expect(page.getByTestId('invite-code')).toBeVisible();
  await kopieer.click();
  await expect(page.locator('.toast-wrap')).toContainText(/Gekopieerd|Kopiëren lukte niet/);

  const row = page.locator(`li[data-username="${name}"]`);
  await row.getByRole('button', { name: 'Nieuw wachtwoord instellen' }).click();
  const sheet = page.getByRole('dialog', { name: `Nieuw wachtwoord voor ${name}` });
  await expect(sheet.getByRole('textbox')).toBeFocused();
  await sheet.getByRole('button', { name: 'Verzin er een' }).click();
  await expect(sheet.getByRole('textbox')).toHaveValue(/^[a-z2-9]{4}-[a-z2-9]{4}-[a-z2-9]{4}$/);
  await shot(page, 'wachtwoord-blad', testInfo.project.name);
  // Niet instellen: dit is een gedeeld archief. Escape sluit het blad.
  await page.keyboard.press('Escape');
  await expect(sheet).toHaveCount(0);
  // Tot Keeper maken vraagt nog steeds eerst (C33).
  await row.getByRole('button', { name: 'Tot Keeper maken' }).click();
  await expect(page.getByRole('dialog', { name: `Van ${name} een Keeper maken?` })).toBeVisible();
  await page.keyboard.press('Escape');
});

for (const scheme of ['light', 'dark'] as const) {
  test(`screenshots van elke tab (${scheme})`, async ({ page }, testInfo) => {
    await page.emulateMedia({ colorScheme: scheme });
    await signIn(page, ...KEEPER);
    const tabs = scheme === 'light'
      ? ['users', 'review', 'trash', 'types', 'words', 'colours', 'history', 'site', 'export', 'audit']
      : ['users', 'types', 'words', 'trash'];
    if (testInfo.project.name === 'phone') {
      await page.goto('/admin');
      await expect(page.getByTestId('beheer-index')).toBeVisible();
      await shot(page, `${scheme}-index`, testInfo.project.name);
    }
    for (const tab of tabs) {
      await page.goto(`/admin?tab=${tab}`);
      await expect(page.locator('.beheer-paneel')).toHaveAttribute('data-tab', tab);
      await page.waitForTimeout(300);
      await shot(page, `${scheme}-${tab}`, testInfo.project.name);
    }
    await page.goto('/admin?tab=types');
    const editor = page.locator('details.admin-type').filter({ has: page.locator('summary', { hasText: 'Personen' }) });
    await editor.locator('summary').click();
    await editor.getByTestId('soort-uiterlijk').click();
    await editor.locator('summary').scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);
    await shot(page, `${scheme}-types-open`, testInfo.project.name);
  });
}
