import { expect, test, type Locator, type Page } from '@playwright/test';
import { becomeInvestigator, editArticle, fillWhenReady, openRights, signIn, signUp } from './helpers';

/**
 * §67 — de stamboom, tweede pas.
 *
 * Round 66 gave the archive a stamboom that is a *window* onto kinship. This
 * round asks the harder half of the same question: what happens when a hand
 * does something to **more than one thing at a time**, and what the archive
 * knows without being told.
 *
 *  a. **Een kind heeft meestal twee ouders.** The `+ kind` box does not close
 *     on the answer any more — it asks who the other parent is, with nothing
 *     preselected and "Overslaan" one keystroke away (a partner is not a
 *     parent). Both roads are walked here: the second parent picked, and
 *     skipped.
 *  b. **En de andere weg erheen**: two cards chosen, one `+` between them, one
 *     child with both parents written in one gesture.
 *  c. **Broers en zussen die niemand hoefde te typen.** Shared parents are a
 *     fact the archive works out (`lib/families/siblings.ts`): a *half* pair
 *     gets a thin dashed line, a *full* pair gets none at all (the shared bar
 *     already says it) — and both are chips with a little word under the
 *     sibling field on the artikel.
 *  d. **En de ene die wél getypt wordt**, for the case the derivation cannot
 *     reach: an explicit `Broers en zussen`, mirrored onto both pages, and
 *     removable from the drawing. A derived line is nobody's to remove and
 *     says where it comes from instead.
 *  e. **Meer dan één kaartje tegelijk** (the prikbord's model): shift-click,
 *     shift-drag a box, carry the lot, one Ctrl+Z, one question, one toast.
 *  f. is in `family-tree-coop.spec.ts`: what the *other* screen sees of all
 *     that.
 *  g. **Achternaam is weg** (this reverses round 31).
 *  h. **Een chip wordt vers opgezocht**, and what a reader cannot see they
 *     cannot remove either.
 *
 * Written against CLAUDE.md §6 throughout: every "'X' aanmaken" row is filtered
 * out of a suggest list with `hasNotText`, every fill on a page that has just
 * arrived goes through `fillWhenReady`, nothing is typed into an artikel before
 * `editArticle()` (rule 18), the glass is fitted before anything is pressed
 * (§66), and a line is pressed with a real mouse inside a `toPass()` because an
 * SVG path has no height.
 */

const KEEPER = ['Keeper', 'abbeytower34'] as const;

/* ------------------------------------------------------------- the tree */

async function newTree(page: Page, name: string) {
  await page.goto('/stambomen');
  await page.getByRole('button', { name: 'Nieuwe stamboom' }).click();
  const sheet = page.getByRole('dialog', { name: /Nieuwe stamboom/ });
  await expect(sheet).toBeVisible();
  await fillWhenReady(sheet.getByLabel('Naam', { exact: true }), name);
  await sheet.getByRole('button', { name: 'Openbare stamboom' }).click();
  await page.waitForURL('**/stambomen/**');
  await expect(page.locator('#tree-name')).toHaveValue(name);
  await expect(page.getByTestId('tree-stage')).toBeVisible();
  return page.url();
}

const cardOf = (page: Page, name: string) =>
  page.locator('[data-testid="tree-node"]').filter({ hasText: name }).first();

/** §66/§6: `.tree-stage` clips, so bring the drawing back on the glass first. */
async function fit(page: Page) {
  await page.getByTestId('tree-fit').click();
  // The cards travel there on a 220 ms transition; a press mid-flight lands at
  // the old place.
  await page.waitForTimeout(400);
}

/**
 * Choose a card, in its corner: the name on it is an `<a>` to the artikel, so a
 * press in the middle is a coin toss between choosing and leaving the page.
 */
async function chooseCard(page: Page, card: Locator, modifiers: 'Shift'[] = []) {
  await card.click({ position: { x: 6, y: 6 }, modifiers });
}

const saved = (page: Page) =>
  expect(page.locator('.save-state')).toHaveText('Opgeslagen', { timeout: 20_000 });

type TreeNodeInfo = { id: string; entryId: string | null; slug: string | null };

/** What the canvas itself thinks is on the glass (`window.__tree`, the e2e seam). */
async function treeNode(page: Page, name: string): Promise<TreeNodeInfo | null> {
  return page.evaluate((wanted) => {
    const seam = (window as unknown as { __tree?: { nodes: () => Record<string, unknown>[] } }).__tree;
    const node = seam?.nodes().find((one) => one.name === wanted);
    if (!node) return null;
    return {
      id: String(node.id),
      entryId: typeof node.entryId === 'string' ? node.entryId : null,
      slug: typeof node.slug === 'string' ? node.slug : null,
    };
  }, name);
}

/**
 * The same, waited for.
 *
 * §6's "not yet listening", one door along: a card being *visible* and the
 * canvas's seam knowing about it are two different moments. `window.__tree` is
 * put up by an effect, so straight after a reload — and under `E2E_DEV=1`,
 * where every render happens twice and a dev build compiles the page on the way
 * in, reliably — the drawing is on the glass a beat before the seam can be
 * asked about it. Everything that reads an id or an address off the canvas goes
 * through here rather than assuming.
 */
async function treeNodeReady(page: Page, name: string): Promise<TreeNodeInfo> {
  const held: { at: TreeNodeInfo | null } = { at: null };
  await expect(async () => {
    held.at = await treeNode(page, name);
    expect(held.at, `${name} is not on the glass yet`).not.toBeNull();
    expect(held.at!.entryId, `${name} has no artikel behind it`).toBeTruthy();
  }).toPass({ timeout: 25_000 });
  return held.at!;
}

async function entryIdOf(page: Page, name: string): Promise<string> {
  return (await treeNodeReady(page, name)).entryId!;
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

/** Which cards this hand has chosen, straight out of the canvas. */
const chosen = (page: Page) =>
  page.evaluate(() => (window as unknown as { __tree: { selected: () => string[] } }).__tree.selected());

/**
 * A brand new person, made from the toolbar's own box and put in the tree by
 * the same gesture.
 *
 * Deliberately new rather than one of the fixture people: every assertion below
 * is about *fields written on artikelen*, and a shared fixture person would
 * carry the parents and children of every earlier test in this file into the
 * next one's derivation.
 */
async function addNewPerson(page: Page, name: string) {
  await fillWhenReady(page.locator('#tree-add-person'), name);
  await page.locator('.tree-tools .suggest-item').filter({ hasText: 'aanmaken' }).first().click();
  const sheet = page.getByRole('dialog', { name: 'Nieuw artikel' });
  await expect(sheet).toBeVisible();
  // The sheet remembers the last soort used in this browser, so the one that
  // carries the verwantschapsvelden is asked for rather than assumed.
  await sheet.getByRole('radio', { name: 'Personen', exact: true }).click();
  await expect(sheet.getByLabel('Naam', { exact: true })).toHaveValue(name);
  await sheet.getByRole('button', { name: 'Aanmaken', exact: true }).click();
  await expect(sheet).toBeHidden({ timeout: 20_000 });
  await expect(cardOf(page, name)).toBeVisible({ timeout: 20_000 });
  await saved(page);
}

/** Somebody who already exists, chosen out of a suggest list. */
async function pickSuggestion(scope: Locator, box: Locator, name: string) {
  await fillWhenReady(box, name);
  const option = scope
    .locator('.suggest-item')
    .filter({ hasText: name })
    .filter({ hasNotText: 'aanmaken' })
    .first();
  await expect(option).toBeVisible({ timeout: 15_000 });
  await option.click();
}

/**
 * The `+ kind` handle on one card, answered with a *new* artikel — and then the
 * second-parent step, which is the whole of §67's road (a).
 */
async function addChild(
  page: Page,
  parent: string,
  child: string,
  second: string | null,
) {
  await fit(page);
  await chooseCard(page, cardOf(page, parent));
  const handle = page.getByTestId('tree-handle-child');
  await expect(handle).toBeVisible();
  await handle.click();

  const picker = page.getByTestId('tree-picker');
  await expect(picker).toBeVisible();
  await fillWhenReady(picker.locator('#tree-picker-search'), child);
  await picker.locator('.suggest-item').filter({ hasText: 'aanmaken' }).first().click();
  const sheet = page.getByRole('dialog', { name: 'Nieuw artikel' });
  await expect(sheet).toBeVisible();
  await expect(sheet.getByLabel('Naam', { exact: true })).toHaveValue(child);
  await sheet.getByRole('button', { name: 'Aanmaken', exact: true }).click();
  await expect(sheet).toBeHidden({ timeout: 20_000 });

  /* §67: the box stays open and asks the second question. */
  const step2 = page.getByTestId('tree-picker-second-parent');
  await expect(step2).toBeVisible({ timeout: 20_000 });
  await expect(step2).toContainText('Tweede ouder (optioneel)');
  await expect(step2).toContainText(child);
  if (second) {
    await pickSuggestion(step2, step2.locator('#tree-second-parent-search'), second);
  } else {
    await page.getByTestId('tree-second-parent-skip').click();
  }
  await expect(step2).toHaveCount(0, { timeout: 20_000 });
  await expect(cardOf(page, child)).toBeVisible({ timeout: 20_000 });
}

/**
 * §6: press a line with a real mouse.
 *
 * A horizontal `<path>` has a bounding rectangle of zero height whatever its
 * stroke, so `locator.click()` calls it invisible and waits for ever. The hit
 * area is real — 16 px of transparent stroke with `pointer-events: stroke` — so
 * this presses a point *on the path itself*, hit-testing and all.
 *
 * And not the middle of it, or not only: `clickLine` in `family-trees.spec.ts`
 * takes the centre of the bounding box, which is right for a partner line
 * between two cards and wrong for a **sibling** line. A sibling line runs along
 * a generation row, and everybody else born in that generation stands on the
 * row between its two ends — so its midpoint is reliably under somebody's card.
 * This walks the path with `getPointAtLength` instead and takes the first point
 * nobody is standing on, mapping to the screen through `getScreenCTM` because
 * the whole drawing hangs under a CSS transform (`.tree-world`).
 *
 * Still inside a `toPass()`: a card sliding to its new place on a 220 ms
 * transition is over the line for a beat.
 */
async function clickLine(page: Page, edgeId: string, opens: Locator) {
  await expect(async () => {
    const spot = await page.evaluate((id) => {
      const el = document.querySelector(`.tree-line-hit[data-edge-id="${CSS.escape(id)}"]`) as
        | SVGPathElement
        | null;
      if (!el) return null;
      const ctm = el.getScreenCTM();
      const length = el.getTotalLength();
      if (!ctm || !length) return { blockers: ['no ctm or zero length'] };
      const blockers: string[] = [];
      for (const t of [0.5, 0.35, 0.65, 0.25, 0.75, 0.15, 0.85, 0.08, 0.92]) {
        const at = el.getPointAtLength(length * t);
        const x = at.x * ctm.a + at.y * ctm.c + ctm.e;
        const y = at.x * ctm.b + at.y * ctm.d + ctm.f;
        const under = document.elementFromPoint(x, y);
        if (under && under.getAttribute('data-edge-id') === id) return { x, y };
        blockers.push(`${Math.round(x)},${Math.round(y)}:${under ? under.tagName + '.' + String(under.className?.baseVal ?? under.className).slice(0, 40) : 'nothing'}`);
      }
      return { blockers };
    }, edgeId);
    expect(spot && 'x' in spot ? spot : null, `nobody is standing on any part of ${edgeId}: ${spot && 'blockers' in spot ? spot.blockers.join(' | ') : 'gone'}`).not.toBeNull();
    await page.mouse.click((spot as { x: number; y: number }).x, (spot as { x: number; y: number }).y);
    await expect(opens).toBeVisible({ timeout: 2000 });
  }).toPass({ timeout: 25_000 });
}

/* ---------------------------------------------------------- the artikelen */

/** One row of an artikel's infobox: the label and what stands beside it. */
const readRow = (page: Page, label: string) =>
  page
    .locator('.fields-view > div')
    .filter({ has: page.locator('span.label', { hasText: new RegExp(`^${label}$`) }) });

/** And the same row on the editing face, where a koppelingsveld has a picker. */
const editRow = (page: Page, key: string) =>
  page.locator('.entry-fields .fields-compact > div').filter({ has: page.locator(`label[for="field-${key}"]`) });

/**
 * §32/§6: on a narrow screen the infobox is a folded `<details>` (`#block-info`)
 * that only springs open while *reading* — so a spec that asks for the editing
 * face finds every field attached, laid out, and `hidden`. Desktop has a
 * `<section>` there and nothing to open, so this is a no-op at 1440 px.
 */
async function openInfobox(page: Page) {
  const box = page.locator('details#block-info');
  if (!(await box.count())) return;
  const isOpen = () => box.evaluate((el) => (el as HTMLDetailsElement).open);
  // "Press it until it answers": a page that has just switched faces is not
  // yet listening, and a summary that is clicked twice folds it back up.
  await expect(async () => {
    if (!(await isOpen())) await box.locator('summary').click();
    expect(await isOpen()).toBe(true);
  }).toPass({ timeout: 15_000 });
}

/** The derived-sibling chips under the sibling field, by the name on them. */
const derivedChip = (page: Page, name: string) =>
  page.getByTestId('derived-siblings').locator('.entry-chip').filter({ hasText: name });

/** Every `field:` line that touches this artikel — the parent lines, drawn. */
const fieldLinesTo = (page: Page, entryId: string) =>
  page.locator(`path.tree-line[data-edge-id^="field:"][data-edge-id*="${entryId}"]`);

const siblingLine = (page: Page, a: string, b: string) => {
  const [lo, hi] = a <= b ? [a, b] : [b, a];
  return page.locator(`path.tree-line-sibling[data-edge-id="derived:sibling:${lo}|${hi}"]`);
};

/* ================================================= a. de tweede ouder, beide wegen */

test('§67a: het "+ kind"-vak vraagt door naar de tweede ouder, en schrijft er twee', async ({
  page,
}, info) => {
  test.skip(info.project.name === 'phone', '§66: a card, its handle and a picker want a pointer');
  test.setTimeout(240_000);
  const stamp = `${info.project.name}-${Date.now().toString(36)}`;
  const father = `Aart Boone ${stamp}`;
  const mother = `Berta Boone ${stamp}`;
  const child = `Cato Boone ${stamp}`;

  await signIn(page, ...KEEPER);
  await newTree(page, `Twee ouders ${stamp}`);
  await addNewPerson(page, father);
  await addNewPerson(page, mother);

  await addChild(page, father, child, mother);

  /* Two lines into the child, one from each parent — and they are *fields*, on
     the artikelen, not lines the tree keeps. */
  const childId = await entryIdOf(page, child);
  const fatherId = await entryIdOf(page, father);
  const motherId = await entryIdOf(page, mother);
  await expect(fieldLinesTo(page, childId)).toHaveCount(2, { timeout: 25_000 });
  await expect(
    page.locator(`path.tree-line[data-edge-id*="${fatherId}"][data-edge-id*="${childId}"]`),
  ).toHaveCount(1);
  await expect(
    page.locator(`path.tree-line[data-edge-id*="${motherId}"][data-edge-id*="${childId}"]`),
  ).toHaveCount(1);

  /*
   * §67: **een partner is geen ouder, en een ouder is geen partner.** Writing
   * the second parent says one thing and one thing only — who the child's other
   * parent is. Nothing was guessed about the two adults.
   */
  await expect(page.locator('path.tree-line-partner')).toHaveCount(0);

  // Both addresses read off the glass *before* walking away from it:
  // `window.__tree` is the canvas's seam and there is no canvas on an artikel.
  const childSlug = (await treeNodeReady(page, child)).slug!;
  const fatherSlug = (await treeNodeReady(page, father)).slug!;
  await page.goto(`/e/${childSlug}`);
  await expect(page.getByRole('heading', { name: child, level: 1 })).toBeVisible();
  const ouders = readRow(page, 'Ouders');
  await expect(ouders).toContainText(father);
  await expect(ouders).toContainText(mother);
  await expect(ouders.locator('.entry-chip')).toHaveCount(2);

  // …and neither adult's page says anything about the other.
  await page.goto(`/e/${fatherSlug}`);
  await expect(page.getByRole('heading', { name: father, level: 1 })).toBeVisible();
  await expect(readRow(page, 'Kinderen')).toContainText(child);
  await expect(readRow(page, 'Partner')).toHaveCount(0);
  expect(await page.getByRole('main').innerText()).not.toContain(mother);
});

test('§67a: "Overslaan" laat het bij één ouder', async ({ page }, info) => {
  test.skip(info.project.name === 'phone', '§66: a card, its handle and a picker want a pointer');
  test.setTimeout(240_000);
  const stamp = `${info.project.name}-${Date.now().toString(36)}`;
  const father = `Daan Krijger ${stamp}`;
  const child = `Elsje Krijger ${stamp}`;

  await signIn(page, ...KEEPER);
  await newTree(page, `Eén ouder ${stamp}`);
  await addNewPerson(page, father);
  await addChild(page, father, child, null);

  const childId = await entryIdOf(page, child);
  await expect(fieldLinesTo(page, childId)).toHaveCount(1, { timeout: 25_000 });

  const childSlug = (await treeNodeReady(page, child)).slug!;
  await page.goto(`/e/${childSlug}`);
  await expect(page.getByRole('heading', { name: child, level: 1 })).toBeVisible();
  await expect(readRow(page, 'Ouders')).toContainText(father);
  await expect(readRow(page, 'Ouders').locator('.entry-chip')).toHaveCount(1);
});

/* ============================================= b. de gedeelde handgreep */

test('§67b: twee gekozen kaartjes delen één "+", en het kind krijgt allebei', async ({ page }, info) => {
  test.skip(info.project.name === 'phone', '§66: two chosen cards and a handle want a pointer');
  test.setTimeout(240_000);
  const stamp = `${info.project.name}-${Date.now().toString(36)}`;
  const father = `Frans Duiker ${stamp}`;
  const mother = `Griet Duiker ${stamp}`;
  const child = `Hendrik Duiker ${stamp}`;

  await signIn(page, ...KEEPER);
  await newTree(page, `Samen een kind ${stamp}`);
  await addNewPerson(page, father);
  await addNewPerson(page, mother);

  await fit(page);
  await chooseCard(page, cardOf(page, father));
  await chooseCard(page, cardOf(page, mother), ['Shift']);
  expect(await chosen(page)).toHaveLength(2);

  // The four `+`s of a single card are gone; one shared handle stands between.
  await expect(page.getByTestId('tree-handle-child')).toHaveCount(0);
  const both = page.getByTestId('tree-handle-child-both');
  await expect(both).toBeVisible();
  await both.click();

  const picker = page.getByTestId('tree-picker');
  await expect(picker).toBeVisible();
  await expect(picker).toContainText(father);
  await expect(picker).toContainText(mother);
  await fillWhenReady(picker.locator('#tree-picker-search'), child);
  await picker.locator('.suggest-item').filter({ hasText: 'aanmaken' }).first().click();
  const sheet = page.getByRole('dialog', { name: 'Nieuw artikel' });
  await expect(sheet).toBeVisible();
  await sheet.getByRole('button', { name: 'Aanmaken', exact: true }).click();
  await expect(sheet).toBeHidden({ timeout: 20_000 });

  // Nothing more is asked: this road already had both answers.
  await expect(page.getByTestId('tree-picker-second-parent')).toHaveCount(0);
  await expect(cardOf(page, child)).toBeVisible({ timeout: 20_000 });

  const childId = await entryIdOf(page, child);
  await expect(fieldLinesTo(page, childId)).toHaveCount(2, { timeout: 25_000 });

  const childSlug = (await treeNodeReady(page, child)).slug!;
  await page.goto(`/e/${childSlug}`);
  const ouders = readRow(page, 'Ouders');
  await expect(ouders).toContainText(father);
  await expect(ouders).toContainText(mother);
  await expect(ouders.locator('.entry-chip')).toHaveCount(2);
});

/* ================================== c. broers en zussen die niemand typte */

/**
 * §67: half, vol, en de lijn die er niet is.
 *
 * The verdicts are `lib/families/siblings.ts`'s and this is the shape of each:
 *
 *  - **half** — each side has a recorded parent the other lacks, and they share
 *    one. Vader + Moeder → C, and Vader + de tweede vrouw → E. *That* is the
 *    only shape the archive can honestly call half; a child with only one
 *    parent written down is `unknown`, because the parent nobody typed may well
 *    be the same one. So the "second child of one parent" case is asserted here
 *    too — as the silence it is.
 *  - **vol** — the same two parents on both pages. No line at all: the shared
 *    bar between the parents already draws it, and a second line would be the
 *    same fact twice.
 */
test('§67c: half wordt getekend, vol wordt geweten, en een afgeleide lijn is van niemand', async ({
  page,
}, info) => {
  test.skip(info.project.name === 'phone', '§66: handles, pickers and a line want a pointer');
  test.setTimeout(300_000);
  const stamp = `${info.project.name}-${Date.now().toString(36)}`;
  const father = `Isaak Wever ${stamp}`;
  const mother = `Jannetje Wever ${stamp}`;
  const other = `Klaartje Wever ${stamp}`;
  const first = `Lena Wever ${stamp}`; // vader + moeder
  const full = `Marten Wever ${stamp}`; // vader + moeder, dus vol met Lena
  const half = `Neeltje Wever ${stamp}`; // vader + Klaartje, dus half met beiden
  const lonely = `Otto Wever ${stamp}`; // alleen de vader: onbekend, geen lijn

  await signIn(page, ...KEEPER);
  await newTree(page, `Wie van wie ${stamp}`);
  await addNewPerson(page, father);
  await addNewPerson(page, mother);
  await addNewPerson(page, other);

  await addChild(page, father, first, mother);
  await addChild(page, father, half, other);
  await addChild(page, father, lonely, null);

  /* The full pair over the shared handle — road (b), so both roads feed this. */
  await fit(page);
  await chooseCard(page, cardOf(page, father));
  await chooseCard(page, cardOf(page, mother), ['Shift']);
  const bothHandle = page.getByTestId('tree-handle-child-both');
  await expect(bothHandle).toBeVisible();
  await bothHandle.click();
  const picker = page.getByTestId('tree-picker');
  await expect(picker).toBeVisible();
  await fillWhenReady(picker.locator('#tree-picker-search'), full);
  await picker.locator('.suggest-item').filter({ hasText: 'aanmaken' }).first().click();
  const sheet = page.getByRole('dialog', { name: 'Nieuw artikel' });
  await expect(sheet).toBeVisible();
  await sheet.getByRole('button', { name: 'Aanmaken', exact: true }).click();
  await expect(sheet).toBeHidden({ timeout: 20_000 });
  await expect(cardOf(page, full)).toBeVisible({ timeout: 20_000 });
  await saved(page);

  // Asked of the archive rather than of this tab: a derived line is worked out
  // on the server, from the fields, every time the drawing is pulled.
  await page.reload();
  await expect(cardOf(page, full)).toBeVisible({ timeout: 25_000 });
  const ids = {
    first: await entryIdOf(page, first),
    full: await entryIdOf(page, full),
    half: await entryIdOf(page, half),
    lonely: await entryIdOf(page, lonely),
  };

  /* half: a line, and it says so. */
  const halfLine = siblingLine(page, ids.first, ids.half);
  await expect(halfLine).toHaveCount(1, { timeout: 25_000 });
  await expect(halfLine).toHaveAttribute('data-sibling-kind', 'half');

  /* vol: no line between them at all — the bar over their heads is the line. */
  await expect(siblingLine(page, ids.first, ids.full)).toHaveCount(0);

  /* onbekend: one recorded parent each is not proof of anything, so nothing. */
  await expect(siblingLine(page, ids.first, ids.lonely)).toHaveCount(0);

  /* And a derived line is nobody's to take away. Let go of the card that was
     just added first (§6): a chosen card's side `+` is 32 px on the glass and
     does not scale, and a line between two adjacent siblings runs through
     exactly the gap it stands in. */
  const derivedNote = page.getByTestId('tree-line-derived');
  await page.keyboard.press('Escape');
  await expect(page.locator('.tree-node.is-selected')).toHaveCount(0);
  await fit(page);
  await clickLine(page, `derived:sibling:${[ids.first, ids.half].sort().join('|')}`, derivedNote);
  await expect(derivedNote).toHaveText('Volgt uit de ouders');
  await expect(page.getByTestId('tree-remove-line')).toHaveCount(0);

  /* ------------------------------------------ and the same on the artikelen */
  const slugs = {
    first: (await treeNodeReady(page, first)).slug!,
    full: (await treeNodeReady(page, full)).slug!,
    half: (await treeNodeReady(page, half)).slug!,
  };

  await page.goto(`/e/${slugs.first}`);
  await expect(page.getByRole('heading', { name: first, level: 1 })).toBeVisible();
  await expect(page.getByTestId('derived-siblings')).toContainText('Volgens de ouders');
  await expect(derivedChip(page, half)).toHaveAttribute('data-sibling-kind', 'half');
  await expect(derivedChip(page, full)).toHaveAttribute('data-sibling-kind', 'full');
  // The word beside the chip is the one a reader can read.
  await expect(page.getByTestId('derived-siblings')).toContainText('half');
  await expect(page.getByTestId('derived-siblings')).toContainText('vol');
  /*
   * Nobody typed any of this: the row is there (an empty field with something
   * derived under it is still a row, §67), and the field's own half of it —
   * `.field-value`, above the derived chips — holds nothing.
   */
  await expect(readRow(page, 'Broers en zussen').locator('.field-value .entry-chip')).toHaveCount(0);

  // Both ends know: a sibling is not a fact one page owns.
  await page.goto(`/e/${slugs.half}`);
  await expect(derivedChip(page, first)).toHaveAttribute('data-sibling-kind', 'half');
  await page.goto(`/e/${slugs.full}`);
  await expect(derivedChip(page, first)).toHaveAttribute('data-sibling-kind', 'full');
});

/* ============================================ d. de getypte broer of zus */

test('§67d: een genoteerde broer of zus staat op allebei de bladzijden, en kan er weer af', async ({
  page,
}, info) => {
  test.skip(info.project.name === 'phone', '§66: a handle and a line want a pointer');
  test.setTimeout(240_000);
  const stamp = `${info.project.name}-${Date.now().toString(36)}`;
  const one = `Pieter Zeeman ${stamp}`;
  const two = `Quirina Zeeman ${stamp}`;

  await signIn(page, ...KEEPER);
  const treeUrl = await newTree(page, `Wie het ook weet ${stamp}`);
  await addNewPerson(page, one);
  await addNewPerson(page, two);

  /* Nobody's parents are known, which is exactly what this field is for. */
  await fit(page);
  await chooseCard(page, cardOf(page, one));
  const handle = page.getByTestId('tree-handle-sibling');
  await expect(handle).toBeVisible();
  await expect(handle).toHaveAttribute('aria-label', /Broers en zussen toevoegen bij/);
  await handle.click();

  const picker = page.getByTestId('tree-picker');
  await expect(picker).toBeVisible();
  await pickSuggestion(picker, picker.locator('#tree-picker-search'), two);
  // One fact, box closed: a brother is not a child, so nothing more is asked.
  await expect(page.getByTestId('tree-picker-second-parent')).toHaveCount(0);

  const line = page.locator('path.tree-line-sibling[data-sibling-kind="explicit"]');
  await expect(line).toHaveCount(1, { timeout: 25_000 });
  const edgeId = (await line.getAttribute('data-edge-id'))!;
  expect(edgeId).toMatch(/^field:/);

  /* The server mirrors it, so it is on both pages. */
  const slugOne = (await treeNodeReady(page, one)).slug!;
  const slugTwo = (await treeNodeReady(page, two)).slug!;
  await page.goto(`/e/${slugOne}`);
  await expect(readRow(page, 'Broers en zussen')).toContainText(two);
  await page.goto(`/e/${slugTwo}`);
  await expect(readRow(page, 'Broers en zussen')).toContainText(one);

  /* And off the drawing takes it off both pages, because that is where it is. */
  await page.goto(treeUrl);
  await expect(page.getByTestId('tree-stage')).toBeVisible({ timeout: 20_000 });
  await expect(cardOf(page, one)).toBeVisible({ timeout: 20_000 });
  await fit(page);
  const remove = page.getByTestId('tree-remove-line');
  await clickLine(page, edgeId, remove);
  await expect(remove).toHaveText(/Lijn verwijderen/);
  await remove.click();
  await expect(page.locator('path.tree-line-sibling')).toHaveCount(0, { timeout: 25_000 });
  // Both are still in the tree; it is the *line* that went.
  await expect(page.locator('[data-node-id^="entry:"][data-standing="member"]')).toHaveCount(2);

  await page.goto(`/e/${slugOne}`);
  await expect(readRow(page, 'Broers en zussen')).toHaveCount(0);
  await page.goto(`/e/${slugTwo}`);
  await expect(readRow(page, 'Broers en zussen')).toHaveCount(0);
});

/* ================================================ e. meer dan één tegelijk */

test('§67e: kiezen met een kader, samen dragen, één keer terug, één vraag', async ({ page }, info) => {
  test.skip(info.project.name === 'phone', '§67: a box, a carry and a shift want a pointer');
  test.setTimeout(300_000);
  const stamp = `${info.project.name}-${Date.now().toString(36)}`;
  const people = [`Rein Duin ${stamp}`, `Saar Duin ${stamp}`, `Teun Duin ${stamp}`];

  await signIn(page, ...KEEPER);
  await newTree(page, `Met z'n drieën ${stamp}`);
  for (const who of people) await addNewPerson(page, who);
  await fit(page);

  /* 1. shift-click adds a second, and both wear the ring. */
  await chooseCard(page, cardOf(page, people[0]));
  expect(await chosen(page)).toHaveLength(1);
  await chooseCard(page, cardOf(page, people[1]), ['Shift']);
  expect(await chosen(page)).toHaveLength(2);
  await expect(cardOf(page, people[0])).toHaveClass(/is-selected/);
  await expect(cardOf(page, people[1])).toHaveClass(/is-selected/);

  /* 2. Escape lets go of the lot. */
  await page.keyboard.press('Escape');
  expect(await chosen(page)).toHaveLength(0);

  /* 3. A box swept over bare paper takes everything under it. */
  const stage = page.getByTestId('tree-stage');
  const box = (await stage.boundingBox())!;
  const sweep = async () => {
    await page.keyboard.down('Shift');
    await page.mouse.move(box.x + 3, box.y + 3);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 6 });
    await expect(page.getByTestId('tree-marquee')).toBeVisible();
    await page.mouse.move(box.x + box.width - 3, box.y + box.height - 3, { steps: 6 });
    await page.mouse.up();
    await page.keyboard.up('Shift');
    await expect(page.getByTestId('tree-marquee')).toHaveCount(0);
  };
  await sweep();
  expect(await chosen(page)).toHaveLength(3);

  /* 4. One carried, all three travel — and one Ctrl+Z puts them all back. */
  const nodes = await Promise.all(people.map(async (who) => (await treeNodeReady(page, who)).id));
  const before = await Promise.all(nodes.map((id) => positionOf(page, id)));
  const zoom = await page.evaluate(
    () => (window as unknown as { __tree: { view: { zoom: number } } }).__tree.view.zoom,
  );
  const grab = (await cardOf(page, people[0]).boundingBox())!;
  await page.mouse.move(grab.x + 8, grab.y + 8);
  await page.mouse.down();
  await page.mouse.move(grab.x + 8 + 180, grab.y + 8 + 40, { steps: 12 });
  await page.mouse.up();

  for (let i = 0; i < nodes.length; i++) {
    const now = (await positionOf(page, nodes[i]))!;
    expect(now.x - before[i]!.x, `${people[i]} travelled with the hand`).toBeGreaterThan(
      (180 / zoom) * 0.8,
    );
  }
  await saved(page);

  await page.keyboard.press('Control+z');
  for (let i = 0; i < nodes.length; i++) {
    await expect
      .poll(async () => Math.abs(((await positionOf(page, nodes[i]))?.x ?? 0) - before[i]!.x), {
        timeout: 20_000,
      })
      .toBeLessThan(2);
  }

  /* 5. Delete asks once, for the lot, and names how many. */
  const slugs = await Promise.all(people.map(async (who) => (await treeNodeReady(page, who)).slug!));
  await fit(page);
  await sweep();
  expect(await chosen(page)).toHaveLength(3);
  await page.keyboard.press('Delete');
  const dialog = page.getByRole('dialog');
  await expect(dialog).toHaveCount(1);
  await expect(dialog).toContainText('3 kaartjes uit deze stamboom halen?');
  await dialog.getByRole('button', { name: 'Weghalen' }).click();
  await expect(page.locator('[data-testid="tree-node"]')).toHaveCount(0, { timeout: 20_000 });

  /*
   * The artikelen themselves are untouched — that is the whole reason a
   * stamboom is a window. Asked over the wire rather than by walking there: a
   * navigation would take the toast with the undo on it off the screen.
   */
  for (const slug of slugs) {
    const response = await page.request.get(`/e/${slug}`);
    expect(response.status(), `${slug} still exists`).toBe(200);
  }

  /* 6. …and the toast walks all three back in one step. */
  const toast = page.locator('.toast', { hasText: 'uit de stamboom gehaald' });
  await expect(toast).toBeVisible();
  await toast.getByRole('button', { name: 'Ongedaan maken' }).click();
  await expect(page.locator('[data-testid="tree-node"]')).toHaveCount(3, { timeout: 25_000 });

  /* 7. Escape clears whatever is chosen, always. */
  await fit(page);
  await chooseCard(page, cardOf(page, people[0]));
  expect((await chosen(page)).length).toBeGreaterThan(0);
  await page.keyboard.press('Escape');
  expect(await chosen(page)).toHaveLength(0);
});

/* ==================================================== g. Achternaam is weg */

/**
 * §67: round 31 gave Personen an "Achternaam" and round 33 takes it away again
 * — a name is a name, and half the archive was writing the surname twice. This
 * is asserted on a *fresh* fixture, where the field was never seeded (an
 * existing archive keeps it if the Keeper put anything in it; that is
 * `seed:round-33-drop-achternaam`'s business, and a unit test's).
 */
test('§67g: de soort Personen heeft geen Achternaam meer', async ({ page }, info) => {
  test.setTimeout(150_000);
  await signIn(page, ...KEEPER);

  await page.goto('/admin');
  await page.getByRole('tab', { name: 'Soorten artikelen' }).click();
  const editor = page
    .locator('details.admin-type')
    .filter({ has: page.locator('summary', { hasText: 'Personen' }) })
    .first();
  await expect(editor).toBeVisible();
  await editor.locator('summary').click();
  // The field *names* are the values of the boxes, not text on the page.
  const names = await editor.locator('input[aria-label^="Naam van veld"]').evaluateAll((boxes) =>
    boxes.map((box) => (box as HTMLInputElement).value),
  );
  expect(names.length).toBeGreaterThan(0);
  expect(names).not.toContain('Achternaam');
  // The three that replaced it are still there, and the fourth §67 added.
  expect(names).toEqual(expect.arrayContaining(['Ouders', 'Kinderen', 'Partner', 'Broers en zussen']));

  /* And no row for it on a person's own editing face. */
  await page.goto('/e/jacob-den-hollander');
  await expect(page.getByRole('heading', { name: 'Jacob den Hollander', level: 1 })).toBeVisible();
  await editArticle(page);
  await openInfobox(page);
  await expect(editRow(page, 'achternaam')).toHaveCount(0);
  await expect(page.locator('.entry-fields').getByText('Achternaam')).toHaveCount(0);
});

/* ======================================= h. een chip wordt vers opgezocht */

/**
 * §67: rule 1, on the infobox.
 *
 * A stored `entry_link` is a copy of the moment somebody picked it, so an
 * artikel that has since gone behind the Keeper's side would keep its name
 * printed in everybody's HTML. It is looked up afresh per viewer instead — and
 * the other half of that rule is that what a reader cannot see they also cannot
 * *remove*: the editor sends back the list it drew, and the server puts the
 * hidden ids back.
 */
test('§67h: een ouder die je niet mag zien staat er niet, en je kunt hem ook niet weghalen', async ({
  page,
  browser,
}, info) => {
  test.setTimeout(240_000);
  const stamp = `${info.project.name}-${Date.now().toString(36)}`;
  const secret = `Verzwegen vader ${stamp}`;
  const known = `Bekende moeder ${stamp}`;
  const child = `Het kind ${stamp}`;

  await signIn(page, ...KEEPER);

  /* Three artikelen, made the ordinary way. */
  const make = async (name: string) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Nieuw artikel' }).locator('visible=true').first().click();
    const sheet = page.getByRole('dialog', { name: 'Nieuw artikel' });
    await expect(sheet).toBeVisible();
    await sheet.getByRole('radio', { name: 'Personen', exact: true }).click();
    await fillWhenReady(sheet.getByLabel('Naam', { exact: true }), name);
    await sheet.getByRole('button', { name: 'Aanmaken', exact: true }).click();
    await page.waitForURL('**/e/**', { timeout: 20_000 });
    await expect(page.locator('#entry-name')).toHaveValue(name);
    return new URL(page.url()).pathname;
  };
  const secretUrl = await make(secret);
  await make(known);
  const childUrl = await make(child);

  /*
   * Both parents onto the child, while both are still ordinary artikelen.
   *
   * The order matters and it is the honest one: a Keeper writes a family down
   * and *afterwards* decides that one of them is not for the table yet. It also
   * routes round §46, which is worth knowing — for an artikel the side **is**
   * the visibility (`sideCondition`, `lib/keeper/side.ts`), and a suggest list
   * is sided (§50), so a Keeper standing on the players' side cannot find a
   * Keeper-only artikel in any picker at all.
   */
  await page.goto(childUrl);
  await expect(page.getByRole('heading', { name: child, level: 1 })).toBeVisible({ timeout: 20_000 });
  await editArticle(page);
  await openInfobox(page);
  const ouders = editRow(page, 'ouders');
  await expect(ouders).toBeVisible();
  await pickSuggestion(ouders, ouders.getByPlaceholder('Nog een toevoegen…'), secret);
  await expect(ouders.locator('.entry-chip')).toHaveCount(1);
  await pickSuggestion(ouders, ouders.getByPlaceholder('Nog een toevoegen…'), known);
  await expect(ouders.locator('.entry-chip')).toHaveCount(2);
  await expect(page.locator('.save-state')).toHaveText('Opgeslagen', { timeout: 20_000 });

  /* And then the father goes behind the Keeper's side. */
  await page.goto(secretUrl);
  await editArticle(page);
  await openRights(page);
  await page.getByRole('button', { name: 'Alleen de Keeper' }).click();
  await expect(page.locator('.stamp', { hasText: 'Alleen voor de Keeper' })).toBeVisible();
  await expect(page.locator('.save-state')).toHaveText('Opgeslagen', { timeout: 20_000 });

  /* A player: one chip, not two, and the secret name is nowhere in the page. */
  const context = await browser.newContext({ viewport: page.viewportSize() });
  const player = await context.newPage();
  const who = `Speler${stamp.replace(/[^a-z0-9]/gi, '').slice(-8)}`;
  await signUp(player, who, 'wachtwoord123');
  await becomeInvestigator(player, `Onderzoeker ${stamp}`);
  await player.goto(childUrl);
  await expect(player.getByRole('heading', { name: child, level: 1 })).toBeVisible();
  const theirs = readRow(player, 'Ouders');
  await expect(theirs).toContainText(known);
  await expect(theirs.locator('.entry-chip')).toHaveCount(1);
  expect(await player.locator('main').innerText()).not.toContain(secret);
  expect(await player.content()).not.toContain(secret);

  /*
   * §67: **je kunt niet weghalen wat je niet ziet.** The player edits the very
   * field the secret lives in — takes the one parent they *can* see out of it,
   * and answers another question besides — and saves. The array that goes over
   * the wire has one name in it and the archive puts the other one back.
   */
  await editArticle(player);
  await openInfobox(player);
  const mine = editRow(player, 'ouders');
  await expect(mine.locator('.entry-chip')).toHaveCount(1);
  await mine.getByRole('button', { name: `${known} verwijderen` }).click();
  await expect(mine.locator('.entry-chip')).toHaveCount(0);
  await player.locator('#field-status').selectOption('vermist');
  await expect(player.locator('.save-state')).toHaveText('Opgeslagen', { timeout: 20_000 });

  /* The Keeper looks again: the line they drew is still there. */
  await page.goto(childUrl);
  await expect(page.getByRole('heading', { name: child, level: 1 })).toBeVisible({ timeout: 20_000 });
  await editArticle(page);
  await openInfobox(page);
  const after = editRow(page, 'ouders');
  await expect(after.locator('.entry-chip')).toHaveText([secret]);

  await context.close();
});
