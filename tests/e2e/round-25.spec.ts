import { expect, test, type Page } from '@playwright/test';
import { editArticle, editCase, fillWhenReady, newEntryButton, signIn } from './helpers';

/**
 * Round 25, §48 — three things that were missing, in a browser.
 *
 *  1. **Born on a side.** What a Keeper makes while standing on their own side
 *     is theirs: the sheet says so before it saves, the new page wears the
 *     stamp, and a wall hung in a Keeper-only dossier is the Keeper's whatever
 *     anybody ticks. This is the leak Nick reported — a prikbord made from a
 *     Keeper's dossier that the whole table could read.
 *  2. **`@` in a description.** The korte beschrijving of an artikel offers
 *     names like every other box in the archive, and what lands there is a
 *     chip when the page is read.
 *  3. **Made in a dossier, and the question after it.** Inside a dossier the
 *     `+` makes something *in* it — which is the only way a Voorwerp or a Clue
 *     can be made at all (§24) — and a name typed into the dossier's own
 *     writing is offered a place on its shelves.
 *
 * Written against §6's list: `?new=1` lands on the editing face, so a name is
 * asserted with `toHaveValue`; every fill on a page that has just navigated
 * goes through `fillWhenReady`; and a suggest list's create row is filtered out
 * with `hasNotText: 'aanmaken'` wherever an existing row is what is wanted.
 */

const KEEPER = ['Keeper', 'abbeytower34'] as const;

/** A dossier, made the way a person makes one. Leaves the browser on it. */
async function newCase(page: Page, name: string): Promise<string> {
  await page.getByRole('button', { name: 'Dossier openen' }).first().click();
  const sheet = page.getByRole('dialog');
  await fillWhenReady(sheet.getByLabel('Naam'), name);
  await sheet.getByRole('button', { name: 'Openen', exact: true }).click();
  await page.waitForURL('**/c/**', { timeout: 20_000 });
  return page.url();
}

test.describe('§48 geboren op een kant', () => {
  test('wat de Keeper op zijn eigen kant maakt, blijft van hem', async ({ page }, testInfo) => {
    const stamp = `${testInfo.project.name}-${Date.now().toString(36)}`;
    await signIn(page, ...KEEPER);

    // On the Keeper's own side of the archive.
    await page.goto('/api/keeper/flip?side=keeper&to=/cases');
    await expect(page.getByRole('button', { name: 'Dossier openen' }).first()).toBeVisible({
      timeout: 20_000,
    });

    // The sheet says which side this is going to land on, before it saves.
    await page.getByRole('button', { name: 'Dossier openen' }).first().click();
    const sheet = page.getByRole('dialog');
    await expect(sheet.getByTestId('side-choice')).toBeVisible();
    await expect(sheet.getByTestId('side-choice').locator('input')).toBeChecked();
    await fillWhenReady(sheet.getByLabel('Naam'), `Keeperzaak ${stamp}`);
    await sheet.getByRole('button', { name: 'Openen', exact: true }).click();
    await page.waitForURL('**/c/**', { timeout: 20_000 });

    // …and it did. The stamp is the page saying whose side it is on.
    await expect(page.getByTestId('keeper-stamp')).toBeVisible({ timeout: 20_000 });
    const caseUrl = page.url();

    // The wall hung in it is the Keeper's too, and the sheet's switch cannot
    // be used to say otherwise — the dossier's name travels with the wall.
    await editCase(page);
    // A phone has no tabs — every shelf is stacked on one page (§32) — so the
    // tab is clicked only where there is one, exactly as `newCaseBoard` does.
    const tab = page.getByRole('tab', { name: 'Prikbord' });
    if (await tab.isVisible().catch(() => false)) await tab.click();
    const makeBoard = page.getByRole('button', { name: /Maak nieuw prikbord voor dit dossier/ });
    await makeBoard.scrollIntoViewIfNeeded();
    // Scoped to that button's own row: a phone has the tijdlijn's switch on
    // the same page, and `.first()` would be a coin toss between them.
    const choice = page.locator('span.row-wrap', { has: makeBoard }).getByTestId('side-choice');
    await expect(choice.locator('input')).toBeChecked();
    await expect(choice.locator('input')).toBeDisabled();
    await makeBoard.click();
    await page.waitForURL('**/b/**', { timeout: 20_000 });
    await expect(page.getByTestId('keeper-stamp')).toBeVisible({ timeout: 20_000 });

    // And on the players' side of the archive neither of them is in a list.
    await page.goto('/api/keeper/flip?side=player&to=/cases');
    await expect(page.locator('main')).toBeVisible({ timeout: 20_000 });
    expect(await page.locator('main').innerText()).not.toContain(`Keeperzaak ${stamp}`);

    // The dossier's own page is still reachable across the fold (§46: a lookup
    // never filters by side) — it is the *lists* that are one side at a time.
    await page.goto(caseUrl);
    await expect(page.getByTestId('keeper-stamp')).toBeVisible({ timeout: 20_000 });
  });
});

test.describe('§48 @ in een beschrijving', () => {
  test('de korte beschrijving biedt namen aan, en wat er landt is een chip', async ({
    page,
  }, testInfo) => {
    const stamp = `${testInfo.project.name}-${Date.now().toString(36)}`;
    await signIn(page, ...KEEPER);
    await page.goto('/api/keeper/flip?side=player&to=/wiki');

    await newEntryButton(page).click();
    const sheet = page.getByRole('dialog', { name: 'Nieuw artikel' });
    await fillWhenReady(sheet.getByLabel('Naam'), `De duiker ${stamp}`);
    await sheet.getByRole('button', { name: 'Aanmaken' }).click();
    await page.waitForURL('**/e/**', { timeout: 20_000 });
    await expect(page.locator('#entry-name')).toHaveValue(`De duiker ${stamp}`);

    await editArticle(page);
    const lead = page.locator('#entry-lead');
    await lead.click();
    await lead.fill('Gezien bij @Jacob');
    const pop = page.getByTestId('mention-pop');
    await expect(pop).toBeVisible({ timeout: 20_000 });
    // §6: the create row is on screen before the suggestions are.
    await pop
      .getByRole('option')
      .filter({ hasNotText: 'aanmaken' })
      .filter({ hasText: 'Jacob den Hollander' })
      .first()
      .click();
    await expect(lead).toHaveValue('Gezien bij [[Jacob den Hollander]] ');
    await lead.blur();

    // Reading, the shorthand is the chip every other text in the archive gets.
    await page.locator('.entry-mode-toggle').click();
    await expect(page.locator('.entry-lead .entry-chip')).toHaveText('Jacob den Hollander', {
      timeout: 20_000,
    });
  });
});

test.describe('§48 in een dossier', () => {
  test('de + maakt een voorwerp, en een naam in de tekst wordt aangeboden', async ({
    page,
  }, testInfo) => {
    const stamp = `${testInfo.project.name}-${Date.now().toString(36)}`;
    await signIn(page, ...KEEPER);
    await page.goto('/api/keeper/flip?side=player&to=/cases');
    await newCase(page, `Zaak ${stamp}`);
    await expect(page.locator('#case-name')).toHaveValue(`Zaak ${stamp}`);

    /*
     * §24 + §48: a Voorwerp exists only inside a dossier, so the sheet offers
     * it only when it knows it is in one. Until this round the `+` in the menu
     * never did — the only road was the box under the tabs.
     */
    await newEntryButton(page).click();
    const sheet = page.getByRole('dialog', { name: 'Nieuw artikel' });
    await expect(sheet.getByRole('radio', { name: 'Voorwerpen', exact: true })).toBeVisible({
      timeout: 20_000,
    });
    // And it says where it is going, in a box that cannot be unticked for a
    // soort that has nowhere else to live.
    await sheet.getByRole('radio', { name: 'Voorwerpen', exact: true }).click();
    const filing = sheet.getByRole('checkbox', { name: new RegExp(`Opbergen in Zaak ${stamp}`) });
    await expect(filing).toBeChecked();
    await expect(filing).toBeDisabled();
    await sheet.getByRole('button', { name: 'Sluiten' }).click();

    /*
     * §48: a name typed into the dossier's own writing is offered a place on
     * its shelves — once, and never for something already on one.
     */
    await editCase(page);
    await page.locator('.ProseMirror').first().click();
    await page.keyboard.type('Gesproken met @Jacob');
    const suggest = page.locator('.suggestion-popup, .suggest-list').first();
    await expect(suggest).toBeVisible({ timeout: 20_000 });
    await page
      .getByRole('option')
      .filter({ hasNotText: 'aanmaken' })
      .filter({ hasText: 'Jacob den Hollander' })
      .first()
      .click();

    const ask = page.getByRole('dialog').filter({ hasText: 'zit nog niet in' });
    await expect(ask).toBeVisible({ timeout: 20_000 });
    await ask.getByRole('button', { name: /Toevoegen aan/ }).click();

    // It is on a shelf now.
    await page.reload();
    await expect(page.locator('main')).toContainText('Jacob den Hollander', { timeout: 20_000 });
  });
});
