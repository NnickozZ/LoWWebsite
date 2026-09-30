import { expect, test, type Locator, type Page } from '@playwright/test';
import { editCanvas, fillWhenReady, signIn } from './helpers';

/**
 * Golf M — de stamboom: een lijn die terug kan, een kind aan de lijn, de
 * rechtermuisknop, slepen om te verbinden, en de bloedlijn van één kaartje.
 *
 * Nick: "Removing a line in a stamboom cannot be undone." It can now — from
 * the toast, with Ctrl+Z, and forward again with Ctrl+Shift+Z / Ctrl+Y — and
 * the field on the artikel follows every step, because the undo goes down the
 * same road the line came off (`writeRelation`).
 *
 * Written against CLAUDE.md §6: every suggest list is filtered past its
 * "'X' aanmaken" row, the glass is fitted before anything is pressed, a card is
 * chosen in its corner (the name is a link), and a line is pressed with a real
 * mouse on a point `elementFromPoint` says is the line's.
 */

const KEEPER = ['Keeper', 'abbeytower34'] as const;

async function newTree(page: Page, name: string) {
  await page.goto('/stambomen');
  await page.getByRole('button', { name: 'Nieuwe stamboom' }).click();
  const sheet = page.getByRole('dialog', { name: /Nieuwe stamboom/ });
  await expect(sheet).toBeVisible();
  await fillWhenReady(sheet.getByLabel('Naam', { exact: true }), name);
  await sheet.getByRole('button', { name: 'Openbare stamboom' }).click();
  await page.waitForURL('**/stambomen/**');
  await expect(page.getByTestId('tree-stage')).toBeVisible();
  return page.url();
}

const cardOf = (page: Page, name: string) =>
  page.locator('[data-testid="tree-node"]').filter({ hasText: name }).first();

async function fit(page: Page) {
  await page.getByTestId('tree-fit').click();
  await page.waitForTimeout(400);
}

async function chooseCard(page: Page, card: Locator) {
  await card.click({ position: { x: 6, y: 6 } });
}

const saved = (page: Page) =>
  expect(page.locator('.save-state')).toHaveText('Opgeslagen', { timeout: 20_000 });

async function nodeOf(page: Page, name: string): Promise<{ id: string; entryId: string; slug: string }> {
  const held: { at: { id: string; entryId: string; slug: string } | null } = { at: null };
  await expect(async () => {
    held.at = await page.evaluate((wanted) => {
      const seam = (window as unknown as { __tree?: { nodes: () => Record<string, unknown>[] } }).__tree;
      const node = seam?.nodes().find((one) => one.name === wanted);
      return node && typeof node.entryId === 'string'
        ? { id: String(node.id), entryId: node.entryId, slug: String(node.slug) }
        : null;
    }, name);
    expect(held.at, `${name} is not on the glass yet`).not.toBeNull();
  }).toPass({ timeout: 25_000 });
  return held.at!;
}

async function addNewPerson(page: Page, name: string) {
  await fillWhenReady(page.locator('#tree-add-person'), name);
  await page.locator('.tree-tools .suggest-item').filter({ hasText: 'aanmaken' }).first().click();
  const sheet = page.getByRole('dialog', { name: 'Nieuw artikel' });
  await expect(sheet).toBeVisible();
  await sheet.getByRole('radio', { name: 'Personen', exact: true }).click();
  await expect(sheet.getByLabel('Naam', { exact: true })).toHaveValue(name);
  await sheet.getByRole('button', { name: 'Aanmaken', exact: true }).click();
  await expect(sheet).toBeHidden({ timeout: 20_000 });
  await expect(cardOf(page, name)).toBeVisible({ timeout: 20_000 });
  await saved(page);
}

/** A partner through the right-hand `+` and the kiezer — the road a hand takes. */
async function partnerUp(page: Page, one: string, two: string) {
  await fit(page);
  await chooseCard(page, cardOf(page, one));
  await page.getByTestId('tree-handle-partner').click();
  const picker = page.getByTestId('tree-picker');
  await expect(picker).toBeVisible();
  await fillWhenReady(picker.locator('#tree-picker-search'), two);
  const option = picker
    .locator('.suggest-item')
    .filter({ hasText: two })
    .filter({ hasNotText: 'aanmaken' })
    .first();
  await expect(option).toBeVisible({ timeout: 15_000 });
  await option.click();
  await expect(partnerLines(page)).toHaveCount(1, { timeout: 25_000 });
}

const partnerLines = (page: Page) => page.locator('path.tree-line-partner[data-edge-id]');

async function partnerEdgeId(page: Page): Promise<string> {
  await expect(partnerLines(page)).toHaveCount(1, { timeout: 25_000 });
  return (await partnerLines(page).getAttribute('data-edge-id'))!;
}

/** A point on the line nobody is standing on, on the screen. */
async function pointOnLine(page: Page, edgeId: string) {
  const held: { at: { x: number; y: number } | null } = { at: null };
  await expect(async () => {
    held.at = await page.evaluate((id) => {
      const el = document.querySelector(`.tree-line-hit[data-edge-id="${CSS.escape(id)}"]`) as SVGPathElement | null;
      if (!el) return null;
      const ctm = el.getScreenCTM();
      const length = el.getTotalLength();
      if (!ctm || !length) return null;
      for (const t of [0.5, 0.35, 0.65, 0.25, 0.75, 0.15, 0.85]) {
        const at = el.getPointAtLength(length * t);
        const x = at.x * ctm.a + at.y * ctm.c + ctm.e;
        const y = at.x * ctm.b + at.y * ctm.d + ctm.f;
        if (document.elementFromPoint(x, y)?.getAttribute('data-edge-id') === id) return { x, y };
      }
      return null;
    }, edgeId);
    expect(held.at, `nobody is standing on any part of ${edgeId}`).not.toBeNull();
  }).toPass({ timeout: 25_000 });
  return held.at!;
}

async function clickLine(page: Page, edgeId: string, opens: Locator) {
  await expect(async () => {
    const at = await pointOnLine(page, edgeId);
    await page.mouse.click(at.x, at.y);
    await expect(opens).toBeVisible({ timeout: 2000 });
  }).toPass({ timeout: 25_000 });
}

const readRow = (page: Page, label: string) =>
  page
    .locator('.fields-view > div')
    .filter({ has: page.locator('span.label', { hasText: new RegExp(`^${label}$`) }) });

const toastWith = (page: Page, text: string) => page.locator('.toast').filter({ hasText: text });

/* ================================================= D1 + D2 + D4: terug en vooruit */

test('golf M: een weggehaalde lijn komt terug — uit de melding, met Ctrl+Z, en weer vooruit', async ({
  page,
}, info) => {
  test.skip(info.project.name === 'phone', 'a line, Delete and Ctrl+Z want a pointer and a keyboard; see the phone case below');
  test.setTimeout(300_000);
  const stamp = `${info.project.name}-${Date.now().toString(36)}`;
  const one = `Ada Mol ${stamp}`;
  const two = `Bram Mol ${stamp}`;

  await signIn(page, ...KEEPER);
  const treeUrl = await newTree(page, `Terug en vooruit ${stamp}`);
  await addNewPerson(page, one);
  await addNewPerson(page, two);
  await partnerUp(page, one, two);
  const slugOne = (await nodeOf(page, one)).slug;
  const slugTwo = (await nodeOf(page, two)).slug;

  /* D2: Lijn verwijderen, and the toast brings it back. */
  await page.keyboard.press('Escape');
  await fit(page);
  const remove = page.getByTestId('tree-remove-line');
  await clickLine(page, await partnerEdgeId(page), remove);
  await remove.click();
  await expect(partnerLines(page)).toHaveCount(0, { timeout: 25_000 });
  const toast = toastWith(page, 'Lijn weggehaald.');
  await expect(toast).toBeVisible();
  await toast.getByRole('button', { name: 'Ongedaan maken' }).click();
  await expect(partnerLines(page)).toHaveCount(1, { timeout: 25_000 });

  /* …and the field on the artikel came back with it (the revision says so too). */
  await page.goto(`/e/${slugOne}`);
  await expect(readRow(page, 'Partner')).toContainText(two, { timeout: 20_000 });
  await page.goto(treeUrl);
  await expect(cardOf(page, one)).toBeVisible({ timeout: 25_000 });

  /* D4 + D1: Delete on a chosen line, Ctrl+Z, Ctrl+Shift+Z, Ctrl+Y. */
  await fit(page);
  await clickLine(page, await partnerEdgeId(page), remove);
  await page.keyboard.press('Delete');
  await expect(partnerLines(page)).toHaveCount(0, { timeout: 25_000 });
  await expect(page.getByTestId('tree-undo')).toBeEnabled();

  await page.keyboard.press('Control+z');
  await expect(partnerLines(page)).toHaveCount(1, { timeout: 25_000 });
  await expect(page.getByTestId('tree-redo')).toBeEnabled();

  await page.keyboard.press('Control+Shift+z');
  await expect(partnerLines(page)).toHaveCount(0, { timeout: 25_000 });

  await page.keyboard.press('Control+z');
  await expect(partnerLines(page)).toHaveCount(1, { timeout: 25_000 });
  await page.keyboard.press('Control+y');
  await expect(partnerLines(page)).toHaveCount(0, { timeout: 25_000 });
  await page.keyboard.press('Control+z');
  await expect(partnerLines(page)).toHaveCount(1, { timeout: 25_000 });

  /* D1: somebody else redraws the line before the undo — the undo leaves it and says so. */
  const idOne = (await nodeOf(page, one)).entryId;
  const idTwo = (await nodeOf(page, two)).entryId;
  await fit(page);
  await clickLine(page, await partnerEdgeId(page), remove);
  await page.keyboard.press('Delete');
  await expect(partnerLines(page)).toHaveCount(0, { timeout: 25_000 });
  const treeId = await page.locator('.tree-page').getAttribute('data-tree-id');
  await page.evaluate(
    async ({ tree, entryId, targetId }) => {
      const response = await fetch(`/api/family-trees/${tree}/relations`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ entryId, fieldKey: 'partner', targetId }),
      });
      if (!response.ok) throw new Error(await response.text());
    },
    { tree: treeId, entryId: idTwo, targetId: idOne },
  );
  await page.keyboard.press('Control+z');
  await expect(toastWith(page, 'intussen al veranderd')).toBeVisible({ timeout: 20_000 });
  await expect(partnerLines(page)).toHaveCount(1, { timeout: 25_000 });

  // Both pages hold it: the undo went down the road the mirror stands on.
  await page.goto(`/e/${slugOne}`);
  await expect(readRow(page, 'Partner')).toContainText(two, { timeout: 20_000 });
  await page.goto(`/e/${slugTwo}`);
  await expect(readRow(page, 'Partner')).toContainText(one, { timeout: 20_000 });
});

/* ======================================= D3 + D6 + D4: een kind aan de lijn, de bloedlijn */

test('golf M: de + op de partnerlijn maakt een kind van beiden, en één kaartje licht zijn lijn op', async ({
  page,
}, info) => {
  test.skip(info.project.name === 'phone', 'hover and a right button want a pointer; see the phone case below');
  test.setTimeout(300_000);
  const stamp = `${info.project.name}-${Date.now().toString(36)}`;
  const father = `Cees Visser ${stamp}`;
  const mother = `Door Visser ${stamp}`;
  const child = `Evert Visser ${stamp}`;
  const stranger = `Fien Kok ${stamp}`;

  await signIn(page, ...KEEPER);
  await newTree(page, `Aan de lijn ${stamp}`);
  await addNewPerson(page, father);
  await addNewPerson(page, mother);
  await addNewPerson(page, stranger);
  await partnerUp(page, father, mother);

  /* D3: the pointer on the line is enough to show the `+`. */
  await page.keyboard.press('Escape');
  await fit(page);
  const edgeId = await partnerEdgeId(page);
  const handle = page.getByTestId('tree-line-add-child');
  await expect(async () => {
    const at = await pointOnLine(page, edgeId);
    await page.mouse.move(at.x, at.y);
    await expect(handle).toBeVisible({ timeout: 1500 });
  }).toPass({ timeout: 25_000 });
  // The two names in whichever order the line runs.
  const label = (await handle.getAttribute('aria-label')) ?? '';
  expect(label).toMatch(/^Kind van .+ en .+ toevoegen$/);
  expect(label).toContain(father);
  expect(label).toContain(mother);
  await handle.click();

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
  // Both parents were fixed: nothing more is asked.
  await expect(page.getByTestId('tree-picker-second-parent')).toHaveCount(0);
  await expect(cardOf(page, child)).toBeVisible({ timeout: 20_000 });
  const kid = await nodeOf(page, child);
  await expect(page.locator(`path.tree-line[data-edge-id^="field:"][data-edge-id*="${kid.entryId}"]`)).toHaveCount(2, {
    timeout: 25_000,
  });

  /* D6: one card chosen, and whoever is not in its line steps back. */
  await page.keyboard.press('Escape');
  await expect(page.locator('.tree-node.is-dimmed')).toHaveCount(0);
  await fit(page);
  await chooseCard(page, cardOf(page, child));
  await expect(cardOf(page, stranger)).toHaveClass(/is-dimmed/);
  await expect(cardOf(page, father)).not.toHaveClass(/is-dimmed/);
  await expect(cardOf(page, mother)).not.toHaveClass(/is-dimmed/);
  await expect(page.locator('.tree-edge-partner.is-dimmed')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(page.locator('.tree-node.is-dimmed')).toHaveCount(0);

  /* D4: the right button opens the card's own menu, at the pointer. */
  const menu = page.getByTestId('tree-context-menu');
  await cardOf(page, stranger).click({ button: 'right', position: { x: 6, y: 6 } });
  await expect(menu).toBeVisible();
  await expect(menu.getByRole('menuitem', { name: 'Openen' })).toBeVisible();
  await expect(menu.getByRole('menuitem', { name: 'Uit de stamboom' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(menu).toHaveCount(0);

  /* …and on a line: a child, or the line's own fate. */
  await expect(async () => {
    const at = await pointOnLine(page, edgeId);
    await page.mouse.click(at.x, at.y, { button: 'right' });
    await expect(menu).toBeVisible({ timeout: 1500 });
  }).toPass({ timeout: 25_000 });
  await expect(menu.getByRole('menuitem', { name: 'Kind toevoegen' })).toBeVisible();
  await menu.getByRole('menuitem', { name: 'Lijn verwijderen' }).click();
  await expect(partnerLines(page)).toHaveCount(0, { timeout: 25_000 });
  await page.keyboard.press('Control+z');
  await expect(partnerLines(page)).toHaveCount(1, { timeout: 25_000 });

  /* D4: Delete on a chosen card takes it out of the tree, and back. */
  await chooseCard(page, cardOf(page, stranger));
  await page.keyboard.press('Delete');
  await expect(cardOf(page, stranger)).toHaveCount(0, { timeout: 20_000 });
  await page.keyboard.press('Control+z');
  await expect(cardOf(page, stranger)).toBeVisible({ timeout: 20_000 });
});

/* ======================================================= D5: slepen om te verbinden */

test('golf M: een lijn uit een + slepen verbindt twee kaartjes zonder kiezer', async ({ page }, info) => {
  test.skip(info.project.name === 'phone', 'drag to connect is a pointer’s; a finger keeps the tap');
  test.setTimeout(240_000);
  const stamp = `${info.project.name}-${Date.now().toString(36)}`;
  const one = `Gijs Bos ${stamp}`;
  const two = `Hilde Bos ${stamp}`;

  await signIn(page, ...KEEPER);
  await newTree(page, `Slepen ${stamp}`);
  await addNewPerson(page, one);
  await addNewPerson(page, two);
  await fit(page);
  await chooseCard(page, cardOf(page, one));

  const handle = page.getByTestId('tree-handle-partner');
  const from = (await handle.boundingBox())!;
  const own = (await cardOf(page, one).boundingBox())!;
  const target = (await cardOf(page, two).boundingBox())!;

  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  // Over itself first: not a place to land.
  await page.mouse.move(own.x + own.width / 2, own.y + own.height - 8, { steps: 8 });
  await expect(page.getByTestId('tree-connect-line')).toBeVisible();
  await expect(cardOf(page, one)).not.toHaveClass(/is-connect-target/);
  // Then the other card: lit.
  await page.mouse.move(target.x + target.width / 2, target.y + target.height - 8, { steps: 10 });
  await expect(cardOf(page, two)).toHaveClass(/is-connect-target/);
  await page.mouse.up();

  await expect(page.getByTestId('tree-connect-line')).toHaveCount(0);
  await expect(page.getByTestId('tree-picker')).toHaveCount(0);
  await expect(partnerLines(page)).toHaveCount(1, { timeout: 25_000 });

  // One step back takes the line away again.
  await page.keyboard.press('Control+z');
  await expect(partnerLines(page)).toHaveCount(0, { timeout: 25_000 });

  // Let go on bare paper: nothing is drawn, nothing is asked.
  await fit(page);
  await chooseCard(page, cardOf(page, one));
  const again = (await page.getByTestId('tree-handle-partner').boundingBox())!;
  const stage = (await page.getByTestId('tree-stage').boundingBox())!;
  await page.mouse.move(again.x + again.width / 2, again.y + again.height / 2);
  await page.mouse.down();
  await page.mouse.move(stage.x + 12, stage.y + stage.height - 12, { steps: 10 });
  await page.mouse.up();
  await expect(page.getByTestId('tree-picker')).toHaveCount(0);
  await page.waitForTimeout(600);
  await expect(partnerLines(page)).toHaveCount(0);

  // And a plain click on the `+` is still the kiezer.
  await chooseCard(page, cardOf(page, one));
  await page.getByTestId('tree-handle-partner').click();
  await expect(page.getByTestId('tree-picker')).toBeVisible();
});

/* ========================================================= op een telefoon */

test('golf M, telefoon: de bloedlijn licht op, en een weggehaalde lijn komt terug uit de melding', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'phone', 'the desktop cases above cover this with a pointer');
  test.setTimeout(240_000);
  const stamp = `${info.project.name}-${Date.now().toString(36)}`;
  const names = {
    father: `Ids Veen ${stamp}`,
    mother: `Jet Veen ${stamp}`,
    child: `Klaas Veen ${stamp}`,
    stranger: `Lot Raaf ${stamp}`,
  };

  await signIn(page, ...KEEPER);
  await page.goto('/stambomen');
  /* Built over the archive's own doors, in the page (§89: a write comes from the page's own origin). */
  const treeUrl = await page.evaluate(async (people) => {
    const post = async (url: string, body: unknown) => {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!response.ok) throw new Error(`${url}: ${response.status} ${await response.text()}`);
      return response.json();
    };
    const ids: Record<string, string> = {};
    for (const [key, name] of Object.entries(people)) {
      const made = (await post('/api/entries', { name, typeSlug: 'character' })) as { entry: { id: string } };
      ids[key] = made.entry.id;
    }
    const made = (await post('/api/family-trees', { name: `Telefoon ${people.child}` })) as {
      tree: { id: string; slug: string };
    };
    const tree = made.tree;
    await post(`/api/family-trees/${tree.id}`, {
      members: Object.values(ids).map((id) => ({ id, updatedAt: Date.now() })),
    });
    const relate = (entryId: string, fieldKey: string, targetId: string) =>
      post(`/api/family-trees/${tree.id}/relations`, { entryId, fieldKey, targetId });
    await relate(ids.father, 'partner', ids.mother);
    await relate(ids.father, 'kinderen', ids.child);
    await relate(ids.mother, 'kinderen', ids.child);
    return `/stambomen/${tree.slug}`;
  }, names);

  await page.goto(treeUrl);
  await expect(cardOf(page, names.child)).toBeVisible({ timeout: 25_000 });
  await fit(page);

  /* D6 in Lezen: choosing is reading, and the line lights up. */
  await chooseCard(page, cardOf(page, names.child));
  await expect(cardOf(page, names.stranger)).toHaveClass(/is-dimmed/);
  await expect(cardOf(page, names.father)).not.toHaveClass(/is-dimmed/);

  /* D2 in Bewerken: a tap on the line, Lijn verwijderen, and the toast. */
  await editCanvas(page);
  await fit(page);
  const remove = page.getByTestId('tree-remove-line');
  await clickLine(page, await partnerEdgeId(page), remove);
  // The `+` for a child of both stands on the chosen line on a phone too.
  await expect(page.getByTestId('tree-line-add-child')).toBeVisible();
  await remove.click();
  await expect(partnerLines(page)).toHaveCount(0, { timeout: 25_000 });
  const toast = toastWith(page, 'Lijn weggehaald.');
  await expect(toast).toBeVisible();
  await toast.getByRole('button', { name: 'Ongedaan maken' }).click();
  await expect(partnerLines(page)).toHaveCount(1, { timeout: 25_000 });
});
