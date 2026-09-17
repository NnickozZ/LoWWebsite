import { expect, test, type Locator, type Page } from '@playwright/test';
import {
  becomeInvestigator,
  editArticle,
  editCanvas,
  editCase,
  fillWhenReady,
  newCaseFamilyTree,
  newEntryButton,
  signIn,
  signUp,
} from './helpers';

/**
 * §66: de stamboom.
 *
 * A stamboom is a *window* onto the archive's kinship rather than a second
 * place where kinship is written down, and almost everything asserted here is
 * that one sentence, walked from both ends:
 *
 *  1. The shelf makes one; the bar carries its name; an empty tree says so.
 *  2. Somebody is put in it from the toolbar, and stays in it over a reload —
 *     membership is the tree's own state and is saved.
 *  3. A `+` handle writes a **field on an artikel**: the child made from the
 *     handle has Jacob under "Ouders" on its own page, and Jacob has the child
 *     under "Kinderen", because the server mirrors (§66).
 *  4. And the other way round: a Partner typed into an infobox turns up in the
 *     drawing as a ghost with an "Erbij" on it.
 *  5. A line taken off the drawing is taken off both pages.
 *  6. A los kaartje is a card with no artikel behind it, and "Artikel aanmaken"
 *     turns the lines round it into fields on the artikel it becomes.
 *  7. A dragged card is pinned and stays pinned; "Opnieuw schikken" lets go.
 *  8. A dossier has a Stamboom tab of its own, and the tree wears its chip.
 *  9. §48: one born on the Keeperkant is nobody else's, at its own address.
 * 10. And the whole thing stands up at 390 px, where the menu has no room for
 *     it (`desktopOnly`) and the dossier is the way in.
 *
 * Written against CLAUDE.md §6: every "'X' aanmaken" row is filtered out of a
 * suggest list with `hasNotText`, every fill on a page that has just arrived
 * goes through `fillWhenReady`, and nothing is typed into an artikel before
 * `editArticle()` has asked for the editing face (rule 18).
 */

const KEEPER = ['Keeper', 'abbeytower34'] as const;

/** The fixture people (`scripts/seed-demo.mjs`) this spec leans on. */
const JACOB = 'Jacob den Hollander';
const CLASINA = 'Sister Clasina';

/* -------------------------------------------------------------- the tree */

/** A new stamboom from the shelf, left standing on it. */
async function newTree(page: Page, name: string) {
  await page.goto('/stambomen');
  await page.getByRole('button', { name: 'Nieuwe stamboom' }).click();
  const sheet = page.getByRole('dialog', { name: /Nieuwe stamboom/ });
  await expect(sheet).toBeVisible();
  await fillWhenReady(sheet.getByLabel('Naam', { exact: true }), name);
  await sheet.getByRole('button', { name: 'Openbare stamboom' }).click();
  await page.waitForURL('**/stambomen/**');
  // §73: a phone opens a stamboom in Lezen, where the heading is plain text
  // and the toolbar makes nothing. Every test here goes on to put somebody in.
  await editTree(page);
  // §6: `?new=1`'s lesson, one door along — the name of a stamboom *is* the
  // §34 heading, and for a hand that may edit it the heading is a box
  // (`TreeTitle`), so it is asserted with `toHaveValue`.
  await expect(page.locator('#tree-name')).toHaveValue(name);
  await expect(page.getByTestId('tree-stage')).toBeVisible();
  return page.url();
}

/**
 * §73: Bewerken, and wait until the canvas has heard it.
 *
 * `editCanvas` reads the switch once, and the server renders every canvas as a
 * desk — Bewerken already checked — so on a phone that has not hydrated yet it
 * can find the right answer a moment before the page turns to Lezen. The
 * toolbar's `Los kaartje` only exists in Bewerken, so it is the proof.
 */
async function editTree(page: Page) {
  await expect(async () => {
    await editCanvas(page);
    await expect(page.getByTestId('tree-add-loose')).toBeVisible({ timeout: 1500 });
  }).toPass({ timeout: 20_000 });
}

/** Every card on the glass, by the name printed on it. */
const cardOf = (page: Page, name: string) =>
  page.locator('[data-testid="tree-node"]').filter({ hasText: name }).first();

/**
 * Bring the whole drawing onto the glass.
 *
 * `.tree-stage` is `overflow: hidden` and the first view is fitted *once*, when
 * the page arrives — so a card added afterwards can be laid out outside the
 * glass, where `boundingBox()` still reports a rectangle and a click lands on
 * the page behind the stage ("`<html>` intercepts pointer events"). Anything
 * that means to press a card presses this first.
 */
async function fit(page: Page) {
  await page.getByTestId('tree-fit').click();
  // The cards travel there on a 220 ms transition; a press mid-flight is a
  // press at the old place.
  await page.waitForTimeout(400);
}

/**
 * Choose a card.
 *
 * Deliberately in the corner of it: the name on a card is an `<a>` to the
 * artikel (and stops the press reaching the card), so a click in the middle of
 * a mortal card is a coin toss between choosing it and leaving the page.
 */
async function chooseCard(page: Page, card: Locator) {
  await fit(page);
  await card.click({ position: { x: 6, y: 6 } });
}

/**
 * Press a line.
 *
 * Not `locator.click()`: a horizontal `<path>` has a bounding rectangle of zero
 * height as far as the browser is concerned, whatever its stroke, so Playwright
 * calls it invisible and waits for ever. The hit area is real — 16 px of
 * transparent stroke with `pointer-events: stroke` — so this presses the middle
 * of it with a real mouse, hit-testing and all.
 */
async function clickLine(page: Page, edgeId: string) {
  const menu = page.getByTestId('tree-remove-line');
  // §6's "press it until it answers": a card slides to its new place on a
  // 220 ms transition while the line is drawn at its finished one, so for a
  // beat after anything joins the tree the middle of a partner line is under
  // the card that is still travelling.
  await expect(async () => {
    const spot = await page.evaluate((id) => {
      const el = document.querySelector(`.tree-line-hit[data-edge-id="${CSS.escape(id)}"]`);
      if (!el) return null;
      const rect = el.getBoundingClientRect();
      const x = rect.x + rect.width / 2;
      const y = rect.y + rect.height / 2;
      const under = document.elementFromPoint(x, y);
      return under && under.getAttribute('data-edge-id') === id ? { x, y } : null;
    }, edgeId);
    expect(spot, `nothing stands on the middle of ${edgeId}`).not.toBeNull();
    await page.mouse.click(spot!.x, spot!.y);
    await expect(menu).toBeVisible({ timeout: 2000 });
  }).toPass({ timeout: 25_000 });
}

/**
 * What the canvas itself thinks is on the glass.
 *
 * `window.__tree` is the e2e seam the canvas puts up for exactly this (the web
 * has `window.__web` for the same reason): a spec running against a production
 * build has no other honest way to learn a card's world coordinates or the
 * entry id behind it.
 */
async function treeNode(page: Page, name: string) {
  return page.evaluate((wanted) => {
    const seam = (window as unknown as { __tree?: { nodes: () => Record<string, unknown>[] } }).__tree;
    const node = seam?.nodes().find((one) => one.name === wanted);
    if (!node) return null;
    return {
      id: String(node.id),
      entryId: typeof node.entryId === 'string' ? node.entryId : null,
      standing: String(node.standing),
    };
  }, name);
}

async function positionOf(page: Page, nodeId: string) {
  return page.evaluate((id) => {
    const seam = (window as unknown as {
      __tree?: { positions: Record<string, { x: number; y: number }> };
    }).__tree;
    const at = seam?.positions?.[id];
    return at ? { x: at.x, y: at.y } : null;
  }, nodeId);
}

/** Somebody from the archive, put in the tree from the toolbar's own box. */
async function addFromToolbar(page: Page, typed: string, name: string) {
  await fillWhenReady(page.locator('#tree-add-person'), typed);
  // §6: the "'…' aanmaken" row is on screen before the suggestions are, so a
  // bare filter on the name picks the *create* row and makes a second artikel.
  const option = page
    .locator('.tree-tools .suggest-item')
    .filter({ hasText: name })
    .filter({ hasNotText: 'aanmaken' })
    .first();
  await expect(option).toBeVisible({ timeout: 15_000 });
  await option.click();
  await expect(cardOf(page, name)).toBeVisible();
}

const saved = (page: Page) => expect(page.locator('.save-state')).toHaveText('Opgeslagen', { timeout: 20_000 });

/* --------------------------------------------------------- the artikelen */

/** One row of an artikel's infobox, reading: the label and what stands beside it. */
const readRow = (page: Page, label: string) =>
  page
    .locator('.fields-view > div')
    .filter({ has: page.locator('span.label', { hasText: new RegExp(`^${label}$`) }) });

/** And the same row on the editing face, where a koppelingsveld has a picker in it. */
const editRow = (page: Page, key: string) =>
  page.locator('.entry-fields .fields-compact > div').filter({ has: page.locator(`label[for="field-${key}"]`) });

/* ============================================================ a. the shelf */

test('de plank: een nieuwe stamboom staat leeg op zijn eigen adres', async ({ page }, info) => {
  test.setTimeout(120_000);
  const stamp = `${info.project.name}-${Date.now().toString(36)}`;
  const name = `Het huis Den Hollander ${stamp}`;

  await signIn(page, ...KEEPER);
  await page.goto('/stambomen');
  await expect(page.getByRole('heading', { name: 'Stambomen', level: 1 })).toBeVisible();

  await newTree(page, name);
  expect(new URL(page.url()).pathname).toMatch(/^\/stambomen\/[^/]+$/);
  /*
   * The heading is the name box for a Keeper (`TreeTitle`), so an `<h1>` with
   * an `<input>` in it has no *text* — what it has is a value, and that is what
   * a reader sees printed at the top of the page.
   */
  await expect(page.getByTestId('family-tree-title')).toBeVisible();
  await expect(page.getByTestId('family-tree-title').locator('#tree-name')).toHaveValue(name);
  // Nothing in it yet, and the page says what to do about that.
  await expect(page.locator('.tree-empty')).toContainText('Nog niemand in deze stamboom');

  // And it is on the shelf it was made from.
  await page.goto('/stambomen');
  await expect(page.locator('.tree-shelf').getByText(name)).toBeVisible();
});

/* ------------------------------------------------------- b. adding people */

test('iemand uit het archief komt erbij, en blijft erbij na een herlaadbeurt', async ({ page }, info) => {
  test.setTimeout(120_000);
  const stamp = `${info.project.name}-${Date.now().toString(36)}`;

  await signIn(page, ...KEEPER);
  await newTree(page, `Wie erbij hoort ${stamp}`);

  await addFromToolbar(page, 'Jacob', JACOB);
  const jacob = cardOf(page, JACOB);
  await expect(jacob).toHaveAttribute('data-standing', 'member');
  await expect(jacob).toHaveAttribute('data-node-id', /^entry:/);
  await expect(jacob).toHaveAttribute('data-frame', 'mortal');
  await expect(page.locator('.tree-empty')).toHaveCount(0);

  // Membership is the tree's own state, so it is saved — and a reload asks the
  // archive rather than this tab.
  await saved(page);
  await page.reload();
  await expect(cardOf(page, JACOB)).toBeVisible();
  await expect(page.locator('[data-node-id^="entry:"][data-standing="member"]')).toHaveCount(1);
});

/* --------------------------------------------------- c. the "+ kind" handle */

test('de handgreep onderaan maakt een kind, en dat is een veld op allebei de artikelen', async ({ page }, info) => {
  test.skip(info.project.name === 'phone', '§66: choosing a card and its handle wants a pointer');
  test.setTimeout(150_000);
  const stamp = `${info.project.name}-${Date.now().toString(36)}`;
  const child = `Neeltje den Hollander ${stamp}`;

  await signIn(page, ...KEEPER);
  await newTree(page, `De lijn omlaag ${stamp}`);
  await addFromToolbar(page, 'Jacob', JACOB);
  await saved(page);

  const jacobNode = (await treeNode(page, JACOB))!;
  expect(jacobNode.entryId).toBeTruthy();

  // Choose Jacob; the three `+`s and the `…` appear round the card.
  await chooseCard(page, cardOf(page, JACOB));
  const childHandle = page.getByTestId('tree-handle-child');
  await expect(childHandle).toBeVisible();
  // The handle wears the *field's* own word, not the role's: "Kinderen".
  await expect(childHandle).toHaveAttribute('aria-label', /Kinderen toevoegen bij Jacob/);
  await childHandle.click();

  // The picker it opens: a name nobody has yet, so the create row is the answer.
  const picker = page.getByTestId('tree-picker');
  await expect(picker).toBeVisible();
  await fillWhenReady(picker.locator('#tree-picker-search'), child);
  await picker.locator('.suggest-item').filter({ hasText: 'aanmaken' }).click();

  const sheet = page.getByRole('dialog', { name: 'Nieuw artikel' });
  await expect(sheet).toBeVisible();
  await expect(sheet.getByLabel('Naam', { exact: true })).toHaveValue(child);
  await sheet.getByRole('button', { name: 'Aanmaken', exact: true }).click();
  await expect(sheet).toBeHidden({ timeout: 20_000 });

  /*
   * §67: the box does not close on the answer — a child usually has two
   * parents, so it asks who the other one is. Nothing is preselected and
   * "Overslaan" has the focus; this child has one parent, so skip.
   */
  const second = page.getByTestId('tree-picker-second-parent');
  await expect(second).toBeVisible({ timeout: 20_000 });
  await page.getByTestId('tree-second-parent-skip').click();
  await expect(second).toBeHidden();

  // A second card, and a line between the two of them.
  const childCard = cardOf(page, child);
  await expect(childCard).toBeVisible({ timeout: 20_000 });
  await expect(childCard).toHaveAttribute('data-standing', 'member');
  const childNode = (await treeNode(page, child))!;
  const line = page.locator(
    `path.tree-line[data-edge-id^="field:"][data-edge-id*="${jacobNode.entryId}"][data-edge-id*="${childNode.entryId}"]`,
  );
  await expect(line).toHaveCount(1, { timeout: 20_000 });

  /*
   * §66: the first click on a card *chooses* it, the second one opens it.
   *
   * A stamboom is arranged rather than read down, so a click in the middle of a
   * card selects the card — walking off to the artikel on the first press took
   * a reader off the page they were laying out. The name is still a real `<a>`
   * with a real href (the middle button and the context menu need one), and
   * that is what the second click follows.
   */
  const treeUrl = page.url();
  const name0 = childCard.locator('.tree-node-name');
  await expect(name0).toHaveAttribute('href', /^\/e\//);
  // Whoever was just added is already the chosen card, so Escape puts the tree
  // back to nobody chosen — which is the state a reader is in when they reach
  // for a card they have not touched yet.
  await page.keyboard.press('Escape');
  await expect(childCard).not.toHaveClass(/is-selected/);
  await name0.click();
  await expect(childCard).toHaveClass(/is-selected/);
  expect(page.url()).toBe(treeUrl);

  // The line is not stored in the tree: it is a field, on both pages, because
  // the server mirrors. The child's own page first.
  await name0.click();
  await page.waitForURL('**/e/**');
  await expect(page.getByRole('heading', { name: child, level: 1 })).toBeVisible();
  await expect(readRow(page, 'Ouders')).toContainText(JACOB);

  // And Jacob's, from the other end.
  await page.goto('/e/jacob-den-hollander');
  await expect(readRow(page, 'Kinderen')).toContainText(child);
});

/* --------------------------------- d + e. the infobox feeds it, and unfeeds it */

test('een Partner in de infobox wordt een schim in de stamboom, en de lijn kan er weer af', async ({ page }, info) => {
  test.skip(info.project.name === 'phone', '§66: a line is chosen with a pointer');
  test.setTimeout(180_000);
  const stamp = `${info.project.name}-${Date.now().toString(36)}`;

  await signIn(page, ...KEEPER);
  const treeUrl = await newTree(page, `Naast elkaar ${stamp}`);
  await addFromToolbar(page, 'Jacob', JACOB);
  await saved(page);

  /* d. The fact is written where it lives: on the artikel. */
  await page.goto('/e/jacob-den-hollander');
  // Rule 18: nobody lands on an editing page, a Keeper included.
  await editArticle(page);
  const partner = editRow(page, 'partner');
  await expect(partner).toBeVisible();
  await fillWhenReady(partner.getByPlaceholder('Nog een toevoegen…'), 'Clasina');
  await partner
    .locator('.suggest-item')
    .filter({ hasText: CLASINA })
    .filter({ hasNotText: 'aanmaken' })
    .first()
    .click();
  await expect(partner.locator('.entry-chip')).toHaveText(CLASINA);
  await expect(page.locator('.save-state')).toHaveText('Opgeslagen', { timeout: 20_000 });

  /* …and the drawing has heard about it, without anybody drawing anything. */
  await page.goto(treeUrl);
  const ghost = page.locator('[data-testid="tree-node"][data-standing="ghost"]').filter({ hasText: CLASINA });
  await expect(ghost).toBeVisible({ timeout: 20_000 });
  await ghost.getByTestId('tree-adopt').click();
  await expect(cardOf(page, CLASINA)).toHaveAttribute('data-standing', 'member', { timeout: 20_000 });
  await saved(page);

  // The partner line: one stroke with an id (the second stroke of the double
  // line is decoration and carries none).
  const partnerLine = page.locator('path.tree-line-partner[data-edge-id]');
  await expect(partnerLine).toHaveCount(1, { timeout: 20_000 });
  const edgeId = (await partnerLine.getAttribute('data-edge-id'))!;
  expect(edgeId).toMatch(/^field:/);

  /* e. And off again — from the drawing, but written on the pages. */
  await clickLine(page, edgeId);
  const remove = page.getByTestId('tree-remove-line');
  await expect(remove).toBeVisible();
  await expect(remove).toHaveText(/Lijn verwijderen/);
  await remove.click();
  await expect(page.locator('path.tree-line-partner[data-edge-id]')).toHaveCount(0, { timeout: 20_000 });
  // Both of them are still in the tree; it is the *line* that went.
  await expect(page.locator('[data-node-id^="entry:"][data-standing="member"]')).toHaveCount(2);

  // Empty on both sides: a field with nothing in it is not printed at all.
  await page.goto('/e/jacob-den-hollander');
  await expect(page.getByRole('heading', { name: JACOB, level: 1 })).toBeVisible();
  await expect(readRow(page, 'Partner')).toHaveCount(0);
  await page.goto('/e/sister-clasina');
  await expect(page.getByRole('heading', { name: CLASINA, level: 1 })).toBeVisible();
  await expect(readRow(page, 'Partner')).toHaveCount(0);
});

/* ------------------------------------------------- f. a los kaartje, promoted */

test('een los kaartje hangt aan een lijn, en wordt een artikel met die lijn als veld', async ({ page }, info) => {
  test.skip(info.project.name === 'phone', '§66: the handles and the picker want a pointer');
  test.setTimeout(180_000);
  const stamp = `${info.project.name}-${Date.now().toString(36)}`;
  const mother = `Onbekende moeder ${stamp}`;

  await signIn(page, ...KEEPER);
  await newTree(page, `Wie er niet is ${stamp}`);

  /* A card with nothing behind it: a name, and a dashed frame that says so. */
  await page.getByTestId('tree-add-loose').click();
  const blank = page.locator('[data-testid="tree-node"][data-frame="unknown"]').first();
  await expect(blank).toBeVisible();
  await fit(page);
  await blank.locator('.tree-node-edit').click();
  const looseSheet = page.getByRole('dialog', { name: /Los kaartje/ });
  await expect(looseSheet).toBeVisible();
  await fillWhenReady(looseSheet.getByLabel('Naam', { exact: true }), `Onbekende vader ${stamp}`);
  await looseSheet.getByRole('button', { name: 'Klaar' }).click();
  await expect(looseSheet).toBeHidden();
  await expect(cardOf(page, `Onbekende vader ${stamp}`)).toHaveAttribute('data-frame', 'unknown');
  await saved(page);

  /* And one hung straight off a handle, which is the way most of them arrive. */
  await addFromToolbar(page, 'Jacob', JACOB);
  await saved(page);
  await chooseCard(page, cardOf(page, JACOB));
  const parentHandle = page.getByTestId('tree-handle-parent');
  await expect(parentHandle).toBeVisible();
  await expect(parentHandle).toHaveAttribute('aria-label', /Ouders toevoegen bij Jacob/);
  await parentHandle.click();
  const picker = page.getByTestId('tree-picker');
  await expect(picker).toBeVisible();
  await fillWhenReady(picker.locator('#tree-picker-loose-name'), mother);
  await picker.getByRole('button', { name: 'Erbij' }).click();
  await expect(picker).toHaveCount(0);

  const looseCard = cardOf(page, mother);
  await expect(looseCard).toBeVisible();
  await expect(looseCard).toHaveAttribute('data-frame', 'unknown');
  // A line the *tree* owns: a tie, because a los kaartje has no page to write
  // a field on. A line between two artikelen is never stored here.
  await expect(page.locator('path.tree-line[data-edge-id^="tie:"]')).toHaveCount(1, { timeout: 20_000 });
  await saved(page);

  /* "Artikel aanmaken": the tie becomes a field on the artikel it becomes. */
  await fit(page);
  await looseCard.locator('.tree-node-edit').click();
  const sheet = page.getByRole('dialog', { name: /Los kaartje/ });
  await expect(sheet).toBeVisible();
  await sheet.getByTestId('tree-promote').click();
  const newEntry = page.getByRole('dialog', { name: 'Nieuw artikel' });
  await expect(newEntry).toBeVisible();
  // Deliberate: a soort with the verwantschapsvelden on it, so the line has
  // somewhere to land on the new page rather than only on Jacob's.
  await newEntry.getByRole('radio', { name: 'Personen', exact: true }).click();
  await expect(newEntry.getByLabel('Naam', { exact: true })).toHaveValue(mother);
  await newEntry.getByRole('button', { name: 'Aanmaken', exact: true }).click();
  await expect(newEntry).toBeHidden({ timeout: 20_000 });

  // The kaartje is gone and an artikel stands where it stood.
  const promoted = cardOf(page, mother);
  await expect(promoted).toHaveAttribute('data-node-id', /^entry:/, { timeout: 20_000 });
  await expect(promoted).not.toHaveAttribute('data-frame', 'unknown');
  await expect(page.locator('[data-node-id^="loose:"]').filter({ hasText: mother })).toHaveCount(0);

  // And Jacob's own page says who his mother is, which is where it belongs.
  await page.goto('/e/jacob-den-hollander');
  await expect(readRow(page, 'Ouders')).toContainText(mother);
});

/* ------------------------------------------------------------- g. drag pins */

test('een gesleept kaartje blijft staan waar het is neergelegd, tot Opnieuw schikken', async ({ page }, info) => {
  test.skip(info.project.name === 'phone', '§66: dragging wants a pointer (as the prikbord spec does)');
  test.setTimeout(150_000);
  const stamp = `${info.project.name}-${Date.now().toString(36)}`;

  await signIn(page, ...KEEPER);
  await newTree(page, `Met de hand geschikt ${stamp}`);
  await addFromToolbar(page, 'Jacob', JACOB);
  await saved(page);

  const node = (await treeNode(page, JACOB))!;
  const before = (await positionOf(page, node.id))!;
  const zoom = await page.evaluate(
    () => (window as unknown as { __tree?: { view: { zoom: number } } }).__tree!.view.zoom,
  );

  // Picked up in the corner of the card, so the press is the card and not the
  // link on it, carried two hundred pixels to the right, and put down.
  const box = (await cardOf(page, JACOB).boundingBox())!;
  await page.mouse.move(box.x + 8, box.y + 8);
  await page.mouse.down();
  await page.mouse.move(box.x + 8 + 200, box.y + 8, { steps: 12 });
  await page.mouse.up();

  const dropped = (await positionOf(page, node.id))!;
  expect(dropped.x - before.x).toBeGreaterThan((200 / zoom) * 0.8);
  await saved(page);

  // A pin is a stored fact, not a passing state: the archive is asked again.
  await page.reload();
  await expect(cardOf(page, JACOB)).toBeVisible();
  await expect
    .poll(async () => (await positionOf(page, node.id))?.x ?? 0, { timeout: 20_000 })
    .toBeGreaterThan(before.x + (200 / zoom) * 0.8);

  // …and "Opnieuw schikken" is the one thing that lets go of it.
  await page.getByTestId('tree-rearrange').click();
  await expect
    .poll(async () => Math.abs(((await positionOf(page, node.id))?.x ?? 0) - before.x), { timeout: 20_000 })
    .toBeLessThan(2);
});

/* ------------------------------------------------------------- h. a dossier */

test('een dossier heeft een Stamboom-tabblad, en de stamboom draagt het dossier', async ({ page }, info) => {
  test.skip(info.project.name === 'phone', '§66: the phone half of this is the last case in this file');
  test.setTimeout(150_000);
  const stamp = `${info.project.name}-${Date.now().toString(36)}`;
  const name = `Stamboom bij de zaak ${stamp}`;

  await signIn(page, ...KEEPER);
  await page.goto('/cases');
  await page.locator('a[href^="/c/"]').first().click();
  await page.waitForURL('**/c/**');
  const caseUrl = page.url();
  // §22: a dossier reached by a link opens on the reading face, where the
  // button that makes a stamboom is not — making one is editing.
  await editCase(page);
  await newCaseFamilyTree(page, name);

  // The tree names the dossier in its eyebrow, once, and it leads back. (It
  // used to be printed twice — the §34 head and a bar of the canvas's own — and
  // the second copy is gone.)
  const chip = page.locator('.canvas-head .canvas-head-of a');
  await expect(chip).toBeVisible();
  const caseName = (await chip.innerText()).trim();
  expect(caseName.length).toBeGreaterThan(0);

  // The dossier's own tab lists it.
  await page.goto(caseUrl);
  await page.getByRole('tab', { name: 'Stamboom' }).click();
  const row = page.locator('a[href^="/stambomen/"]', { hasText: name });
  await expect(row).toBeVisible();
  await expect(row).toContainText('0 personen');

  // And so do the shelf and the count on the home page.
  await page.goto('/stambomen');
  const shelfRow = page.locator('.tree-shelf li', { hasText: name });
  await expect(shelfRow).toBeVisible();
  // The chip is printed in small capitals, the shelf is not — so the name is
  // compared as a name rather than as the letters either of them draws.
  await expect(shelfRow).toContainText(new RegExp(caseName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'));
  await page.goto('/');
  await expect(page.locator('.home-numbers')).toContainText(/\d+ stambomen|1 stamboom/);
});

/* ------------------------------------------- h2. de familie en haar stamboom */

/**
 * §66 (round 32): "Stambomen moeten gelinkt kunnen worden aan families (niet
 * altijd, maar families moet een link hebben hiervoor)."
 *
 * One field on the Familie's own page, and one line on the tree's. The fixture
 * has no Familie-artikel, so one is made the way a person makes one — the `+`,
 * the soort, the name — and the tree is picked out of the field's own box.
 */
test('een Familie wijst naar zijn stamboom, en de stamboom zegt van wie hij is', async ({ page }, info) => {
  test.skip(info.project.name === 'phone', '§66: one viewport is enough for a field and a chip');
  test.setTimeout(150_000);
  const stamp = `${info.project.name}-${Date.now().toString(36)}`;
  const treeName = `De tak van de dijk ${stamp}`;
  const familyName = `Familie Van der Dijk ${stamp}`;

  await signIn(page, ...KEEPER);
  const treeUrl = await newTree(page, treeName);

  await page.goto('/');
  await newEntryButton(page).click();
  const sheet = page.getByRole('dialog', { name: 'Nieuw artikel' });
  const soort = sheet.getByRole('radio', { name: 'Families', exact: true });
  await expect(soort).toBeVisible({ timeout: 20_000 });
  await soort.click();
  await fillWhenReady(sheet.getByLabel('Naam', { exact: true }), familyName);
  await sheet.getByRole('button', { name: 'Aanmaken', exact: true }).click();
  await page.waitForURL('**/e/**', { timeout: 20_000 });
  // §6: `?new=1` lands on the editing face, where the name is a box.
  await expect(page.locator('#entry-name')).toHaveValue(familyName);
  const familyUrl = new URL(page.url()).pathname;

  // Rule 18 all the same: ask for the editing face rather than assuming it.
  await editArticle(page);
  const row = editRow(page, 'stamboom');
  await expect(row).toBeVisible();
  await fillWhenReady(row.locator('#field-stamboom'), treeName);
  const option = row.locator('.suggest-item').filter({ hasText: treeName }).first();
  await expect(option).toBeVisible({ timeout: 15_000 });
  await option.click();

  // The chip carries the tree's own address, so it is a way back to it.
  const chip = row.locator('.entry-chip');
  await expect(chip).toHaveText(treeName);
  await expect(chip).toHaveAttribute('href', `/stambomen/${new URL(treeUrl).pathname.split('/').pop()}`);
  await expect(page.locator('.save-state')).toHaveText('Opgeslagen', { timeout: 20_000 });

  // And it is a printed fact on the reading face, which is where nobody lands
  // in bewerken (rule 18) — so the clean address is the way back in.
  await page.goto(familyUrl);
  await expect(page.getByRole('heading', { name: familyName, level: 1 })).toBeVisible();
  await expect(readRow(page, 'Stamboom')).toContainText(treeName);

  /* The other end: the tree names its familie in the eyebrow, beside the
     dossier — the same kind of fact, in the same small capitals. */
  await page.goto(treeUrl);
  const head = page.getByTestId('tree-head-of').first();
  await expect(head.getByRole('link', { name: familyName })).toBeVisible();
});

/* ----------------------------------------------------------- i. de Keeperkant */

test('§48: een stamboom die op de Keeperkant geboren wordt, is voor niemand anders', async ({
  page,
  browser,
}, info) => {
  test.skip(info.project.name === 'phone', '§66: one viewport is enough for a side that is a database column');
  test.setTimeout(180_000);
  const stamp = `${info.project.name}-${Date.now().toString(36)}`;
  const name = `Wat de Keeper weet ${stamp}`;

  // Standing on the players' side, so the tickbox starts unticked and the
  // ticking is what puts the tree over — not the side the browser is on.
  await signIn(page, ...KEEPER);
  await page.goto('/api/keeper/flip?side=player&to=/stambomen');
  await expect(page.getByRole('button', { name: 'Nieuwe stamboom' })).toBeVisible({ timeout: 20_000 });

  await page.getByRole('button', { name: 'Nieuwe stamboom' }).click();
  const sheet = page.getByRole('dialog', { name: /Nieuwe stamboom/ });
  await fillWhenReady(sheet.getByLabel('Naam', { exact: true }), name);
  const choice = sheet.getByTestId('side-choice').locator('input');
  await expect(choice).not.toBeChecked();
  await choice.check();
  await sheet.getByRole('button', { name: 'Openbare stamboom' }).click();
  await page.waitForURL('**/stambomen/**');
  // The page saying whose side it is on, before any colour has loaded.
  await expect(page.getByTestId('keeper-stamp')).toBeVisible({ timeout: 20_000 });
  const url = page.url();

  // Somebody else: not on the shelf, and the address is a dead end (§44 —
  // absent, never a MISSING stamp).
  const other = await browser.newContext({ viewport: page.viewportSize() });
  const stranger = await other.newPage();
  const who = `Speler${stamp.replace(/[^a-z0-9]/gi, '').slice(-8)}`;
  await signUp(stranger, who, 'wachtwoord123');
  await becomeInvestigator(stranger, `Onderzoeker ${stamp}`);
  const response = await stranger.goto(url);
  expect(response?.status()).toBe(404);
  await stranger.goto('/stambomen');
  await expect(stranger.locator('main')).toBeVisible();
  expect(await stranger.locator('main').innerText()).not.toContain(name);
  await other.close();
});

/* --------------------------------------------------------------- j. a phone */

test('op een telefoon staat de stamboom er, zonder tab in het menu', async ({ page }, info) => {
  test.skip(info.project.name !== 'phone', '§66: this one is about 390 px');
  test.setTimeout(150_000);
  const stamp = `${info.project.name}-${Date.now().toString(36)}`;
  const name = `In de hand ${stamp}`;

  await signIn(page, ...KEEPER);

  // The tab bar is full at eight, so there is no Stambomen in it (§66) —
  // absent, not hidden.
  await expect(page.locator('.tabs')).toBeVisible();
  await expect(page.locator('.tabs').getByText('Stambomen')).toHaveCount(0);

  // The shelf is still a page, and it still makes one.
  await page.goto('/stambomen');
  await expect(page.getByRole('heading', { name: 'Stambomen', level: 1 })).toBeVisible();
  await newTree(page, name);
  const stage = page.getByTestId('tree-stage');
  await expect(stage).toBeVisible();
  const box = (await stage.boundingBox())!;
  expect(box.width).toBeGreaterThan(300);
  expect(box.height).toBeGreaterThan(200);
  // Nothing runs off the side of a 390 px screen.
  const sideways = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(sideways).toBeLessThanOrEqual(1);

  // And a dossier is the way in that the menu no longer is.
  await page.goto('/cases');
  await page.locator('a[href^="/c/"]').first().click();
  await page.waitForURL('**/c/**');
  await editCase(page);
  const jump = page.locator('.jump-menu').getByRole('button', { name: 'Stamboom' });
  await expect(jump).toBeVisible();
  await jump.click();
  await expect(page.getByRole('button', { name: /Maak nieuwe stamboom voor dit dossier/ })).toBeVisible();
});
