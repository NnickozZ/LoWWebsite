import { expect, test, type Page } from '@playwright/test';
import { editArticle, fillWhenReady, newEntryButton, signIn } from './helpers';

/**
 * Round 26, §49–§51 — the three things of this round, in a browser.
 *
 *  1. **§49 het voorvoegsel is een vinkje.** The dossier in front of an
 *     artikel's name is a tickbox on the artikel (`entries.case_prefix`), not a
 *     property of its soort: a Clue made in a dossier arrives ticked, a Persoon
 *     made in the same dossier arrives unticked and is filed there all the same,
 *     and the tickbox on the artikel's own page moves the printing afterwards.
 *  2. **§49 overal te maken, en er weer uit.** A Clue can be made straight from
 *     the wiki with no dossier at all — and says so with the "Zonder dossier"
 *     chip — and "Uit dit dossier halen" on an artikel's own page really takes
 *     it off that shelf.
 *  3. **§50 de wissel.** A Keeper who opens a record that lives on the other
 *     side is turned over on the server, before the page is drawn: the toggle
 *     says which side the browser is on now, and the toast says it happened.
 *     Both directions.
 *  4. **§51 een koppelingsbox op meer dan één soort.** Families' **Leden** box
 *     takes a Personage *and* an Onderzoeker.
 *
 * Written against §6's list, plus two traps of this round's own:
 *   - `getByLabel('Naam')` is ambiguous wherever the prefix tickbox is on
 *     screen (its label carries the word "naam"), so every name box is asked
 *     for with `{ exact: true }`;
 *   - `EntryPicker`'s "'…' aanmaken" row renders the moment there is a query,
 *     ahead of the debounced suggestions, so a row that means an *existing*
 *     artikel is filtered with `hasNotText: 'aanmaken'`.
 */

const KEEPER = ['Keeper', 'abbeytower34'] as const;

/** Put the browser on a known side, and land it somewhere. */
async function stand(page: Page, side: 'keeper' | 'player', to: string) {
  await page.goto(`/api/keeper/flip?side=${side}&to=${encodeURIComponent(to)}`);
  await expect(page.locator('main')).toBeVisible({ timeout: 20_000 });
}

/** A dossier, made the way a person makes one. Leaves the browser on it. */
async function newCase(page: Page, name: string): Promise<string> {
  await page.getByRole('button', { name: 'Dossier openen' }).first().click();
  const sheet = page.getByRole('dialog');
  await fillWhenReady(sheet.getByLabel('Naam', { exact: true }), name);
  await sheet.getByRole('button', { name: 'Openen', exact: true }).click();
  await page.waitForURL('**/c/**', { timeout: 20_000 });
  return page.url();
}

/**
 * The nieuw-artikel sheet, opened wherever we are standing, told which soort,
 * and handed a name. Returns the sheet so the caller can read the tickbox
 * *before* it presses Aanmaken — which is the whole point of §49.
 */
async function openNewEntry(page: Page, typeLabel: string, name: string) {
  await newEntryButton(page).click();
  const sheet = page.getByRole('dialog', { name: 'Nieuw artikel' });
  await expect(sheet.getByRole('radio', { name: typeLabel, exact: true })).toBeVisible({
    timeout: 20_000,
  });
  await sheet.getByRole('radio', { name: typeLabel, exact: true }).click();
  await fillWhenReady(sheet.getByLabel('Naam', { exact: true }), name);
  return sheet;
}

/** Press Aanmaken and wait for the artikel it lands on. */
async function create(page: Page, sheet: ReturnType<Page['getByRole']>): Promise<string> {
  const before = page.url();
  await sheet.getByRole('button', { name: 'Aanmaken' }).click();
  // §6: standing on an artikel already satisfies `**/e/**`, so wait for the
  // address to *change* rather than for the shape of it.
  await expect.poll(() => page.url(), { timeout: 20_000 }).not.toBe(before);
  return page.url();
}

/**
 * The cards on a page, by name. Not `main` and not `innerText()`: a phone has
 * no tabs — every shelf, the Keeper's block and the Activiteit log are stacked
 * on one page (§32) — and the log says the name of everything that was ever
 * filed here. A shelf is cards.
 */
function cards(page: Page, name: string) {
  return page.locator('main .card').filter({ hasText: name });
}

/** On this page's shelves, or not on them at all. */
async function shelved(page: Page, name: string, expected: boolean) {
  // A phone stacks every shelf on one page, so something in the dossier is on
  // its soort's shelf *and* under "Laatst toegevoegd" — one card on a desk, two
  // here. "At least one" is the fact; "none" is the other one.
  if (expected) await expect(cards(page, name).first()).toBeVisible({ timeout: 20_000 });
  else await expect(cards(page, name)).toHaveCount(0, { timeout: 20_000 });
}

/** What one soort's shelf in the wiki is printing right now. */
async function wikiNames(page: Page, typeSlug: string): Promise<string> {
  await page.goto(`/wiki/${typeSlug}`);
  const grid = page.locator('.card-grid');
  await expect(grid.first()).toBeVisible({ timeout: 20_000 });
  return grid.first().innerText();
}

test.describe('§49 het dossier voor de naam is een vinkje', () => {
  test('een clue komt aangevinkt, een persoon niet, en het vinkje verzet het', async ({
    page,
  }, testInfo) => {
    test.setTimeout(150_000);
    const stamp = `${testInfo.project.name}-${Date.now().toString(36)}`;
    const caseName = `Zaak ${stamp}`;
    await signIn(page, ...KEEPER);
    await stand(page, 'player', '/cases');
    const caseUrl = await newCase(page, caseName);
    await expect(page.locator('#case-name')).toHaveValue(caseName);

    // A Clue made in here: the soort's habit is "wear the dossier's name", so
    // the tickbox arrives ticked (`entry_types.prefix_default`).
    const tickbox = (sheet: ReturnType<Page['getByRole']>) =>
      sheet.getByRole('checkbox', { name: new RegExp(`Zet "${caseName}:"`) });
    let sheet = await openNewEntry(page, 'Clues', `De brief ${stamp}`);
    await expect(tickbox(sheet)).toBeChecked();
    await create(page, sheet);

    // …and every list prints the dossier in front of it.
    expect(await wikiNames(page, 'clue')).toContain(`${caseName}: De brief ${stamp}`);

    // A Persoon made in the same dossier: unticked, because that soort has no
    // such habit — but filed here all the same (§49: made here is filed here).
    await page.goto(caseUrl);
    sheet = await openNewEntry(page, 'Personen', `Getuige ${stamp}`);
    await expect(tickbox(sheet)).not.toBeChecked();
    const personUrl = await create(page, sheet);

    await page.goto(caseUrl);
    await shelved(page, `Getuige ${stamp}`, true);

    const shelf = await wikiNames(page, 'character');
    expect(shelf).toContain(`Getuige ${stamp}`);
    expect(shelf).not.toContain(`${caseName}: Getuige ${stamp}`);

    // §49: and the tickbox on the artikel's own page is the same question,
    // asked afterwards. Ticked, the dossier appears in front of its name.
    const prefix = page.getByRole('checkbox', { name: 'Dossier voor de naam' });
    await page.goto(personUrl);
    await editArticle(page);
    await expect(prefix).not.toBeChecked();
    // A click, not `check()`: this box is not its own state. It posts the
    // change and the server's answer is what ticks it, so the tick arrives a
    // round trip after the click and `check()` calls that a failure.
    await prefix.click();
    await expect(prefix).toBeChecked({ timeout: 20_000 });
    expect(await wikiNames(page, 'character')).toContain(`${caseName}: Getuige ${stamp}`);

    // Unticked, it is a plain name again — and nothing about the filing moved.
    await page.goto(personUrl);
    await editArticle(page);
    await expect(prefix).toBeChecked();
    await prefix.click();
    await expect(prefix).not.toBeChecked({ timeout: 20_000 });
    expect(await wikiNames(page, 'character')).not.toContain(`${caseName}: Getuige ${stamp}`);
    await page.goto(caseUrl);
    await shelved(page, `Getuige ${stamp}`, true);
  });
});

test.describe('§49 overal te maken, en er weer uit te halen', () => {
  test('een clue zonder dossier, en een clue die uit zijn dossier wordt gehaald', async ({
    page,
  }, testInfo) => {
    test.setTimeout(150_000);
    const stamp = `${testInfo.project.name}-${Date.now().toString(36)}`;
    await signIn(page, ...KEEPER);

    /*
     * §49: a soort that §24 kept inside dossiers is makeable straight from the
     * wiki now. There is no dossier, so there is no tickbox either — and the
     * archive says the artikel is a loose end rather than letting it read like
     * an ordinary one.
     */
    await stand(page, 'player', '/wiki/clue');
    const loose = `Losse vondst ${stamp}`;
    const sheet = await openNewEntry(page, 'Clues', loose);
    await expect(sheet.getByRole('checkbox', { name: /voor de naam/ })).toHaveCount(0);
    await create(page, sheet);

    const shelf = page.locator('.card-grid').first();
    await page.goto('/wiki/clue');
    const card = shelf.locator('.card', { hasText: loose }).first();
    await expect(card).toBeVisible({ timeout: 20_000 });
    await expect(card).toContainText('Zonder dossier');

    /*
     * §49: and the way out of a dossier. A clue made inside one, then taken off
     * that shelf from its own page — the row really goes, so the dossier no
     * longer holds it and there is no dossier left to print.
     */
    await stand(page, 'player', '/cases');
    const caseName = `Zaak ${stamp}`;
    const caseUrl = await newCase(page, caseName);
    const filed = `De sleutel ${stamp}`;
    const entryUrl = await create(page, await openNewEntry(page, 'Clues', filed));

    await page.goto(caseUrl);
    await shelved(page, filed, true);

    await page.goto(entryUrl);
    await editArticle(page);
    await page.locator('.entry-origin-set').click();
    await page.getByRole('menuitem', { name: 'Uit dit dossier halen' }).click();
    // The page comes back without the eyebrow's dossier: nothing to print.
    await expect(page.locator('.entry-origin')).toContainText('Zonder dossier', {
      timeout: 20_000,
    });

    await page.goto(caseUrl);
    await shelved(page, filed, false);

    await page.goto('/wiki/clue');
    const orphan = shelf.locator('.card', { hasText: filed }).first();
    await expect(orphan).toBeVisible({ timeout: 20_000 });
    expect(await orphan.innerText()).not.toContain(`${caseName}: ${filed}`);
    await expect(orphan).toContainText('Zonder dossier');
  });
});

test.describe('§50 de wissel', () => {
  test('een Keeper wordt omgezet door de pagina die hij opent, beide kanten op', async ({
    page,
  }, testInfo) => {
    test.setTimeout(150_000);
    // §46's toggle starts no view transition with reduced motion on, so the
    // assertions below race nothing.
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const stamp = `${testInfo.project.name}-${Date.now().toString(36)}`;
    await signIn(page, ...KEEPER);

    // One artikel on each side. The player-facing one first, made where we
    // stand (§48: born on the side of the hand that made it).
    await stand(page, 'player', '/wiki');
    const playerUrl = await create(page, await openNewEntry(page, 'Locaties', `De sluis ${stamp}`));

    const keeperUrl = await create(page, await openNewEntry(page, 'Locaties', `De krocht ${stamp}`));
    // …and this one is turned over into the Keeper's own, from its own panel.
    const panel = page.getByTestId('keeper-panel');
    await panel.scrollIntoViewIfNeeded();
    if ((await panel.getAttribute('open')) === null) await panel.locator('summary').click();
    await panel.getByTestId('keeper-side-toggle').check();
    await expect(page.getByTestId('keeper-stamp')).toBeVisible({ timeout: 20_000 });

    const toggle = page.getByTestId('side-toggle');

    // Standing on the Keeperkant, opening a spelersartikel by its address
    // turns the whole archive back over — on the server, before it renders.
    await stand(page, 'keeper', '/wiki');
    await expect(toggle).toHaveAttribute('data-side-now', 'keeper');
    await page.goto(playerUrl);
    await expect(toggle).toHaveAttribute('data-side-now', 'player', { timeout: 20_000 });
    await expect(page.locator('.toast')).toContainText('spelerskant', { timeout: 20_000 });
    await expect(page.getByTestId('keeper-stamp')).toHaveCount(0);

    // And the other way round, from the side we have just landed on.
    await page.goto(keeperUrl);
    await expect(toggle).toHaveAttribute('data-side-now', 'keeper', { timeout: 20_000 });
    await expect(page.locator('.toast')).toContainText('Keeperkant', { timeout: 20_000 });
    await expect(page.getByTestId('keeper-stamp')).toBeVisible();
  });
});

test.describe('§51 een koppelingsbox op meer dan één soort', () => {
  test('Families bestaat, en Leden neemt een personage én een onderzoeker', async ({
    page,
  }, testInfo) => {
    test.setTimeout(150_000);
    const stamp = `${testInfo.project.name}-${Date.now().toString(36)}`;
    await signIn(page, ...KEEPER);
    await stand(page, 'player', '/wiki');

    // Somebody for the second half of the box: the archive's demo data has
    // personages but no onderzoekers, and one soort each is the whole point.
    const detective = `Rechercheur ${stamp}`;
    await create(page, await openNewEntry(page, 'Onderzoekers', detective));

    // §51: the soort itself, made like any other — no dossier in front of it.
    await page.goto('/wiki');
    await create(page, await openNewEntry(page, 'Families', `Familie ${stamp}`));
    await editArticle(page);

    // The Leden box is the only `entry_links` field a familie has, so its
    // "nog een" picker is unambiguous on this page.
    const leden = page.getByPlaceholder('Nog een toevoegen…');
    await expect(leden).toBeVisible({ timeout: 20_000 });

    for (const name of ['Jacob den Hollander', detective]) {
      await leden.click();
      await leden.fill(name);
      const row = page
        .locator('.suggest-item')
        .filter({ hasText: name })
        .filter({ hasNotText: 'aanmaken' })
        .first();
      await expect(row).toBeVisible({ timeout: 20_000 });
      await row.click();
    }

    await expect(page.locator('.save-state')).toHaveText('Opgeslagen', { timeout: 20_000 });

    // Two soorten in one box, and they are still there when the page is read.
    await page.reload();
    await expect(page.locator('main')).toContainText('Jacob den Hollander', { timeout: 20_000 });
    await expect(page.locator('main')).toContainText(detective);
  });
});
