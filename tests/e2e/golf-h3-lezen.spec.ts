import { mkdirSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { signIn } from './helpers';

/**
 * §104, golf H (h3) — lezen en de wiki, na design-review 3.
 *
 *  - D1: tussen 1280 en 1499 px is een artikel twee kolommen, met de
 *    wegwijzer als rij boven de tekst; de tekst heeft zijn maat terug.
 *  - D6: de soorttabs zijn één rij met *Meer soorten*; de soort waar je op
 *    staat staat erin.
 *  - T1: op een telefoon zijn Dossiers en Alles rijen, geen schermvullende kaarten.
 *  - T9: de handelingen van een artikel zijn op een telefoon een raster van
 *    knoppen van 44 px, niets valt van het scherm.
 *  - D22: *Bewerken* en *Nieuw overzicht* staan in één rij met de titel.
 *  - D23: de grote knop in het menu op een dossier is één regel.
 *  - D24: een lege *Dossiernotities* is in Lezen één gedempte regel.
 */

const KEEPER = ['Keeper', 'abbeytower34'] as const;
const SHOTS = '/tmp/claude-0/shots-h3/e2e';
mkdirSync(SHOTS, { recursive: true });

async function shot(page: Page, name: string, project: string) {
  await page.screenshot({ path: `${SHOTS}/${project}-${name}.png` });
}

test('D1: op 1280 px leest een artikel op zijn maat, de wegwijzer staat erboven', async ({ page }, info) => {
  test.skip(info.project.name === 'phone', 'een breedte van een bureau');
  await signIn(page, ...KEEPER);
  for (const width of [1280, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/e/pier-boone');
    await expect(page.locator('.entry-kop .entry-outline-row')).toBeVisible();
    await expect(page.locator('.entry-rail')).toHaveCount(0);
    const main = (await page.locator('.entry-main').boundingBox())!;
    // The text column was 367 px at 1280 (±43 tekens); now it is wider than
    // `.prose`'s own 68ch, so the text reads at its full measure.
    expect(main.width).toBeGreaterThan(560);
    await shot(page, `d1-${width}`, info.project.name);
  }
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.goto('/e/pier-boone');
  await expect(page.locator('.entry-rail')).toBeVisible();
});

test('D6, sinds golf N: elke soort is een tab, de rij breekt en verbergt niets', async ({ page }, info) => {
  await signIn(page, ...KEEPER);
  await page.goto('/wiki/alles');
  const nav = page.getByRole('navigation', { name: 'Soorten' });
  // Golf N (Nick): no *Meer soorten* — every soort stands in the row.
  await expect(nav.getByTestId('meer-soorten')).toHaveCount(0);
  const tabs = nav.locator('.type-tabs .type-tab');
  const count = await tabs.count();
  expect(count).toBeGreaterThan(8);
  // Every tab is visible and inside the page's column: nothing scrolls away.
  const rowBox = (await nav.locator('.type-tabs').boundingBox())!;
  for (let i = 0; i < count; i++) {
    const tab = tabs.nth(i);
    await expect(tab).toBeVisible();
    const box = (await tab.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(rowBox.x - 1);
    expect(box.x + box.width).toBeLessThanOrEqual(rowBox.x + rowBox.width + 1);
  }
  // An empty soort is there, quiet.
  await expect(nav.locator('.type-tab.is-leeg').first()).toBeVisible();
  // Open the last soort: on its page it is the chosen tab.
  const last = tabs.nth(count - 1);
  const href = (await last.getAttribute('href'))!;
  await last.click();
  await page.waitForURL((url) => url.pathname === href.split('?')[0]);
  await expect(page.getByRole('navigation', { name: 'Soorten' }).locator('[aria-current="page"]')).toHaveAttribute('href', href);
  await shot(page, 'd6-soort', info.project.name);
});

test('T1: op een telefoon zijn Dossiers en Alles rijen', async ({ page }, info) => {
  test.skip(info.project.name !== 'phone', 'de rijvorm is voor de telefoon');
  await signIn(page, ...KEEPER);
  for (const path of ['/cases', '/wiki/alles']) {
    await page.goto(path);
    const first = page.locator('.card-grid > .card').first();
    await expect(first).toBeVisible();
    const box = (await first.boundingBox())!;
    // A row, not a card of 360–500 px.
    expect(box.height).toBeLessThan(110);
    const thumb = (await first.locator('.card-cover, .card-cover-wrap').first().boundingBox())!;
    expect(Math.round(thumb.height)).toBe(56);
    await shot(page, `t1${path.replace(/\//g, '-')}`, info.project.name);
  }
});

test('T9: de handelingen van een artikel zijn op een telefoon knoppen van 44 px die passen', async ({ page }, info) => {
  test.skip(info.project.name !== 'phone', 'de kop van een artikel op de telefoon');
  await signIn(page, ...KEEPER);
  await page.goto('/e/pier-boone');
  const acties = page.locator('.entry-acties');
  await expect(acties).toBeVisible();
  const width = page.viewportSize()!.width;
  for (const button of await acties.locator('.btn:visible').all()) {
    const box = (await button.boundingBox())!;
    expect(box.height).toBeGreaterThanOrEqual(43.5);
    expect(box.x + box.width).toBeLessThanOrEqual(width);
  }
  await shot(page, 't9-kop', info.project.name);
});

test('D22: Bewerken en Nieuw overzicht staan in één rij met de titel', async ({ page }, info) => {
  test.skip(info.project.name === 'phone', 'een rij op een bureau');
  await signIn(page, ...KEEPER);
  await page.goto('/wiki');
  const title = (await page.locator('.overzicht-page h1').boundingBox())!;
  const edit = (await page.locator('.overzicht-kop .entry-mode-toggle').boundingBox())!;
  const make = (await page.locator('.overzicht-kop').getByRole('button', { name: /Nieuw overzicht/ }).boundingBox())!;
  for (const button of [edit, make]) {
    expect(button.y).toBeLessThan(title.y + title.height);
    expect(button.y + button.height).toBeGreaterThan(title.y);
  }
  expect(Math.abs(edit.y - make.y)).toBeLessThan(2);
  await shot(page, 'd22-wiki', info.project.name);
});

test('D23 + D24: op een nieuw dossier past de knop op één regel, en lege notities zijn één regel', async ({ page }, info) => {
  await signIn(page, ...KEEPER);
  await page.goto('/cases');
  await page.getByRole('button', { name: 'Dossier openen' }).click();
  const sheet = page.getByRole('dialog', { name: 'Dossier openen' });
  await sheet.getByLabel('Naam', { exact: true }).fill(`Lege la ${info.project.name}-${Date.now().toString(36)}`);
  await sheet.getByRole('button', { name: 'Openen', exact: true }).click();
  await page.waitForURL('**/c/**');
  const path = new URL(page.url()).pathname;
  await page.goto(path);

  const empty = page.getByTestId('case-notes-leeg');
  await expect(empty).toBeVisible();
  expect((await empty.boundingBox())!.height).toBeLessThan(60);

  if (info.project.name === 'desktop') {
    const button = page.getByTestId('nav-new');
    await expect(button).toHaveAccessibleName(/in dit dossier/);
    const box = (await button.boundingBox())!;
    // One line: the height of the button on any other page.
    expect(box.height).toBeLessThan(50);
  }
  await shot(page, 'd24-dossier', info.project.name);
});
