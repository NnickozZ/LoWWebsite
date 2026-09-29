import { mkdirSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { inviteCode, signIn } from './helpers';

/**
 * Golf J, j3: de Keeper, de eerste keer en de losse eindjes na de meting.
 *
 *  1. Beheer: een wissel van onderdeel gooit een niet-bewaarde soort niet weg,
 *     en de index zegt met een puntje waar nog iets open staat.
 *  2. Telefoon: de uitnodiging staat bovenaan de index van Beheer (rij 28).
 *  3. *Wie ben jij aan tafel?*: de caret staat meteen in het vak (rij 24).
 *  4. De pagina van een soort kiest soorten met dezelfde kiezer als een
 *     koppelveld, en *Koppelingen* komt uit de woordenlijst.
 *  5. Stuk 12: *Bewerken*, gedrukt vóór de hydratatie, telt alsnog.
 */

const KEEPER = ['Keeper', 'abbeytower34'] as const;
const SHOTS = '/tmp/claude-0/shots-j3/e2e';

test.use({ permissions: ['clipboard-read', 'clipboard-write'] });

async function shot(page: Page, name: string, project: string) {
  mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: `${SHOTS}/${project}-${name}.png` });
}

const stampOf = (project: string) => `${project.slice(0, 2)}${Date.now().toString(36).slice(-5)}`;

test('Beheer: een wissel van onderdeel gooit een niet-bewaarde soort niet weg', async ({ page }, info) => {
  const phone = info.project.name === 'phone';
  await signIn(page, ...KEEPER);
  await page.goto('/admin?tab=types');
  const editor = page.locator('details.admin-type').filter({ has: page.locator('summary', { hasText: 'Personen' }) });
  await editor.locator('summary').click();
  await expect(editor).toHaveAttribute('open', '');
  const first = editor.getByLabel('Naam van veld 1', { exact: true });
  const was = await first.inputValue();
  await first.fill(`${was} j3`);
  await expect(editor.getByTestId('soort-voet')).toContainText('1 niet opgeslagen');

  const index = page.getByTestId('beheer-index');
  const terug = page.getByRole('button', { name: 'Terug naar alle onderdelen' });
  if (phone) await terug.click();
  await index.getByRole('tab', { name: 'Woorden' }).click();
  await expect(page.locator('.beheer-paneel:not([hidden])')).toHaveAttribute('data-tab', 'words');
  // Het paneel met de soort is er nog, verborgen.
  await expect(page.locator('.beheer-paneel[data-tab="types"]')).toBeHidden();
  if (phone) await terug.click();
  const soorten = index.getByRole('tab', { name: /Soorten artikelen/ });
  await expect(soorten.getByTestId('beheer-niet-bewaard')).toBeVisible();
  await expect(soorten).toHaveAccessibleDescription(/niet is opgeslagen/);
  await shot(page, 'index-puntje', info.project.name);

  await soorten.click();
  await expect(first).toHaveValue(`${was} j3`);
  await expect(editor.getByTestId('soort-voet')).toContainText('1 niet opgeslagen');

  // Terugzetten: alles bewaard, en het puntje is weg.
  await first.fill(was);
  await expect(editor.getByTestId('soort-voet')).toContainText('Alles bewaard');
  await expect(page.getByTestId('beheer-niet-bewaard')).toHaveCount(0);
});

test('telefoon: de uitnodiging staat bovenaan de index van Beheer', async ({ page }, info) => {
  await signIn(page, ...KEEPER);
  await page.goto('/admin');
  const band = page.getByTestId('index-uitnodiging');
  if (info.project.name !== 'phone') {
    // Op een computer opent Beheer op Gebruikers, met de uitnodiging erin.
    await expect(band).toBeHidden();
    await expect(page.getByTestId('invite-kopieer')).toBeVisible();
    return;
  }
  await expect(band).toBeVisible();
  const box = await band.boundingBox();
  const index = await page.getByTestId('beheer-index').boundingBox();
  expect(box!.y + box!.height).toBeLessThanOrEqual(index!.y);
  const kopieer = band.getByTestId('index-invite-kopieer');
  await expect(kopieer).toHaveAttribute('data-link', /\/signup\?code=/);
  expect((await kopieer.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await kopieer.click();
  await expect(page.locator('.toast-wrap')).toContainText(/Gekopieerd|Kopiëren lukte niet/);
  // Na een keuze is hij weg: dan staat alleen *‹ Beheer* boven het paneel.
  await page.getByTestId('beheer-index').getByRole('tab', { name: /Prullenbak/ }).click();
  await expect(band).toBeHidden();
  await shot(page, 'na-keuze', info.project.name);
});

test('wie ben jij aan tafel: de caret staat meteen in het vak', async ({ page }, info) => {
  const stamp = stampOf(info.project.name);
  await page.goto(`/signup?code=${encodeURIComponent(inviteCode())}`);
  await page.getByLabel('Naam', { exact: true }).fill(`Nieuwe j3 ${stamp}`);
  await page.getByLabel('Wachtwoord', { exact: true }).fill('onderzeeboot');
  await page.getByLabel('Wachtwoord nogmaals').fill('onderzeeboot');
  await page.getByRole('button', { name: 'Account aanmaken' }).click();
  await page.waitForURL((url) => url.pathname === '/');
  const naam = page.getByTestId('wie-naam');
  if (info.project.name === 'phone') {
    // Op een aanraakscherm geen focus zonder gebaar (geen toetsenbord, en de +
    // zou wijken): het vak staat er, en één tik zet de caret erin.
    await expect(naam).toBeVisible({ timeout: 15_000 });
    await expect(naam).not.toBeFocused();
    await naam.tap();
  } else {
    await expect(naam).toBeFocused({ timeout: 15_000 });
  }
  await shot(page, 'wie-focus', info.project.name);
  // Typen en Enter.
  await page.keyboard.type(`Cornelis ${stamp}`);
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('wie-welkom')).toBeVisible({ timeout: 20_000 });
});

test('de pagina van een soort kiest soorten met de kiezer van een koppelveld', async ({ page }, info) => {
  test.skip(info.project.name === 'phone', 'dezelfde editor; één bewijs is genoeg');
  await signIn(page, ...KEEPER);
  await page.goto('/admin?tab=types');
  const editor = page.locator('details.admin-type').filter({ has: page.locator('summary', { hasText: 'Facties' }) });
  await editor.locator('summary').click();
  await editor.getByRole('button', { name: 'Lijst die zichzelf vult', exact: true }).click();
  const block = editor.locator('.admin-block', { hasText: 'Lijst die zichzelf vult' }).last();
  const kiezer = block.getByTestId('blok-kijk-in');
  await expect(kiezer).toContainText('Kijk in deze soorten:');
  await expect(kiezer).toContainText('Elke soort');
  // Geen rij van negentien chips meer.
  await expect(block.locator('.chip-selectable')).toHaveCount(0);
  await kiezer.getByRole('button', { name: 'Kies soorten' }).click();
  await kiezer.getByRole('searchbox').fill('Perso');
  await kiezer.getByRole('searchbox').press('Enter');
  await expect(kiezer.locator('.admin-oftype-chosen')).toHaveText('Personen');
  await shot(page, 'blok-kiezer', info.project.name);
  // *Koppelingen* komt uit lib/words.ts en staat er nog.
  await expect(editor.getByRole('button', { name: 'Koppelingen', exact: true })).toBeVisible();
  // Niet opslaan: dit is een gedeeld archief. Weggooien kan hier met een reload.
});

test('stuk 12: Bewerken, gedrukt vóór de hydratatie, telt alsnog', async ({ page, browser }, info) => {
  test.setTimeout(90_000);
  await signIn(page, ...KEEPER);
  await page.goto('/wiki/character');
  await page.getByRole('link', { name: /Doktor Gerhard Lang/ }).first().click();
  await page.waitForURL('**/e/**');
  const url = page.url();
  const state = await page.context().storageState();

  // Een vers venster zonder cache, waarin het JavaScript van de pagina wacht
  // tot de knop al is ingedrukt — zoals op een trage telefoon.
  const fresh = await browser.newContext({ storageState: state });
  const slow = await fresh.newPage();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => (release = resolve));
  await slow.route('**/_next/static/chunks/**', async (route) => {
    await gate;
    await route.continue();
  });
  await slow.goto(url, { waitUntil: 'domcontentloaded' });
  const toggle = slow.locator('.entry-mode-toggle');
  await expect(toggle).toHaveAttribute('data-vroeg', 'bewerken');
  await toggle.dispatchEvent('click');
  expect(await slow.evaluate(() => (window as unknown as { __lwVroeg?: string }).__lwVroeg)).toBe('bewerken');
  release();
  await expect(toggle).toHaveAttribute('aria-pressed', 'true', { timeout: 30_000 });
  await expect(toggle).toHaveText('Lezen');
  await fresh.close();
});
