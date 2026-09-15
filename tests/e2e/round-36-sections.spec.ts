import { expect, test, type Page } from '@playwright/test';
import { becomeInvestigator, editCase, fillWhenReady, newEntryButton, signIn, signUp } from './helpers';

/**
 * §70, round 36: a sectie belongs to a *thing*, and anyone who may edit the
 * thing may add one.
 *
 * Two halves, which is why there are two tests:
 *
 *  - A dossier carries secties now, under its Dossiernotities, with a heading
 *    of their own — Nick's "just like in articles".
 *  - Making, writing and removing a sectie is the thing's own edit right; the
 *    geheimhouding dial stayed the Keeper's. So a player gets the button and
 *    the title box and *no* "Zichtbaar voor" chips, and what they write is
 *    readable by everybody at the table (`startingVisibility`), while a
 *    Keeper's own new sectie starts keeper-only and a player never sees it —
 *    not faintly, not at all: it does not leave the server.
 */

/**
 * §4: an account name is **at most 32 characters**, and a name one character
 * over does not error — `usernameProblem` refuses it, the form stays put, and
 * `signUp`'s wait for the home address then times out 45 seconds later at
 * `helpers.ts`. So the people in this spec are named off `who`, a five-character
 * stamp, while the artikelen and dossiers — which have no such limit — keep the
 * long one.
 */
function shortStamp(projectName: string): string {
  return `${projectName.slice(0, 2)}${Date.now().toString(36).slice(-4)}`;
}

/** The "Sectie toevoegen" road, pressed until it has actually added one. */
async function addSection(page: Page, title: string) {
  const button = page.getByRole('button', { name: 'Sectie toevoegen' });
  await button.waitFor({ state: 'visible', timeout: 15_000 });
  const boxes = page.getByPlaceholder('Titel van de sectie');
  const before = await boxes.count();
  // §6: a page that has just navigated or just switched faces is not yet
  // listening, and a click into it is silence rather than an error.
  for (let attempt = 0; attempt < 8; attempt++) {
    if ((await boxes.count()) > before) break;
    await button.click({ timeout: 5000 }).catch(() => undefined);
    await page.waitForTimeout(500);
  }
  const box = boxes.nth(before);
  await expect(box).toBeVisible();
  // The title is saved on blur; wait for that PATCH rather than for a beat.
  const saved = page.waitForResponse(
    (response) =>
      response.url().includes('/api/sections/') && response.request().method() === 'PATCH',
  );
  await fillWhenReady(box, title);
  await box.blur();
  await saved;
}

/** The chips that say who may read a sectie — the Keeper's, and nobody else's. */
function visibilityChips(page: Page) {
  return page.getByRole('button', { name: 'Alleen de Keeper', exact: true });
}

test('een dossier draagt secties, en wie het mag bewerken mag er een bij zetten', async ({
  page,
  browser,
}, testInfo) => {
  const stamp = `${testInfo.project.name}-${Date.now().toString(36)}`;
  const who = shortStamp(testInfo.project.name);
  const caseName = `Sectiedossier ${stamp}`;
  const keeperTitle = `Wat de kelder verbergt ${stamp}`;
  const playerTitle = `Wat wij vonden ${stamp}`;

  // -- the Keeper opens a dossier and preps a sectie in it -------------------
  await signIn(page, 'Keeper', 'abbeytower34');
  await page.goto('/cases');
  await page.getByRole('button', { name: 'Dossier openen' }).click();
  const sheet = page.getByRole('dialog', { name: 'Dossier openen' });
  await sheet.getByLabel('Naam', { exact: true }).fill(caseName);
  await sheet.getByRole('button', { name: 'Openen', exact: true }).click();
  await page.waitForURL('**/c/**');
  const caseUrl = new URL(page.url()).pathname;

  // `?new=1` lands on the editing face, so the button is already there.
  await expect(visibilityChips(page)).toHaveCount(0); // none yet — no secties
  await addSection(page, keeperTitle);
  // §70: a Keeper making a sectie is preparing, so the dial is there and starts
  // on "Alleen de Keeper".
  await expect(visibilityChips(page).first()).toHaveAttribute('aria-pressed', 'true');

  // It survives a reload, with its own heading, on the reading face.
  await page.goto(caseUrl);
  await expect(page.getByRole('heading', { name: keeperTitle })).toBeVisible();

  // -- a player with edit rights adds one of their own ----------------------
  const playerContext = await browser.newContext();
  const player = await playerContext.newPage();
  const playerName = `Sectiespeler ${who}`;
  await signUp(player, playerName, 'onderzeeboot');
  await becomeInvestigator(player, playerName);

  await player.goto(caseUrl);
  // The Keeper's prep is not in their page at all (rule 1).
  await expect(player.getByRole('heading', { name: keeperTitle })).toHaveCount(0);

  await editCase(player);
  // §70: the button, yes. The dial, no.
  await expect(player.getByRole('button', { name: 'Sectie toevoegen' })).toBeVisible();
  await addSection(player, playerTitle);
  await expect(visibilityChips(player)).toHaveCount(0);

  await player.goto(caseUrl);
  await expect(player.getByRole('heading', { name: playerTitle })).toBeVisible();

  // -- and what they wrote is for everybody (`startingVisibility`) ----------
  const readerContext = await browser.newContext();
  const reader = await readerContext.newPage();
  await signUp(reader, `Sectielezer ${who}`, 'onderzeeboot');
  await reader.goto(caseUrl);
  await expect(reader.getByRole('heading', { name: playerTitle })).toBeVisible();
  await expect(reader.getByRole('heading', { name: keeperTitle })).toHaveCount(0);

  await readerContext.close();
  await playerContext.close();
});

test('een speler zet een sectie op een artikel, en iedereen kan die lezen', async ({
  page,
  browser,
}, testInfo) => {
  const stamp = `${testInfo.project.name}-${Date.now().toString(36)}`;
  const who = shortStamp(testInfo.project.name);
  const entryName = `Sectieartikel ${stamp}`;
  const sectionTitle = `De tweede nacht ${stamp}`;

  await signUp(page, `Sectieschrijver ${who}`, 'onderzeeboot');
  await becomeInvestigator(page, `Sectieonderzoeker ${who}`);

  // §6: `?new=1` lands on the editing face, where the name is a box and there
  // is no heading — so this is the one road that needs no `editArticle`.
  const sheet = page.getByRole('dialog', { name: 'Nieuw artikel' });
  // §6: the page has just navigated, so press until the sheet answers.
  for (let attempt = 0; attempt < 8; attempt++) {
    if (await sheet.isVisible().catch(() => false)) break;
    await newEntryButton(page).click({ timeout: 5000 }).catch(() => undefined);
    await page.waitForTimeout(400);
  }
  await expect(sheet).toBeVisible();
  await sheet.getByLabel('Naam', { exact: true }).fill(entryName);
  await sheet.getByRole('button', { name: 'Aanmaken' }).click();
  await page.waitForURL('**/e/**');
  await expect(page.locator('#entry-name')).toHaveValue(entryName);
  const entryUrl = new URL(page.url()).pathname;

  await addSection(page, sectionTitle);
  // §70: making and writing, yes; deciding who may read it, no.
  await expect(visibilityChips(page)).toHaveCount(0);

  await page.goto(entryUrl);
  await expect(page.getByRole('heading', { name: sectionTitle })).toBeVisible();

  const readerContext = await browser.newContext();
  const reader = await readerContext.newPage();
  await signUp(reader, `Sectielezer ${who}b`, 'onderzeeboot');
  await reader.goto(entryUrl);
  await expect(reader.getByRole('heading', { name: sectionTitle })).toBeVisible();
  await readerContext.close();
});
