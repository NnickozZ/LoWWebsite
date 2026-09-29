import { expect, test, type Page } from '@playwright/test';
import { editCanvas, fillWhenReady, readCanvas, signIn } from './helpers';

/**
 * Ronde 60 (§99) — de vlakken, derde pas.
 *
 *  - O8  a prikbord has a description: written below the fold, printed in the
 *        heading and on the shelf, and still there after a reload;
 *  - the Keeper's tekenlaag switch is below the fold, not in the Rechten sheet;
 *  - on a phone in Bewerken the wall keeps most of the screen, and the search
 *    and the three makers are one row;
 *  - C10 Ongedaan maken in Lezen is there and grey;
 *  - C15 the nieuwe-tijdlijn sheet's button is on screen, the scale is a row of
 *        chips, and the gebeurtenisblad arrives with a real date and a button
 *        that can be pressed;
 *  - C8  a lone los kaartje in a new stamboom keeps its four words on the glass;
 *  - O10 a *Touwtje* can be called off, and is not offered in Lezen.
 *
 * Fixtures through the API as the Keeper (who writes without the §18b
 * question), so each case spends its time on what it is about.
 */

const KEEPER = ['Keeper', 'abbeytower34'] as const;

async function newWall(page: Page, name: string): Promise<string> {
  const made = await page.request.post('/api/boards', { data: { name } });
  expect(made.ok()).toBe(true);
  const { board } = (await made.json()) as { board: { id: string } };
  return board.id;
}

async function addNote(page: Page, note: string) {
  await fillWhenReady(page.getByLabel('Kaart toevoegen'), note);
  await page.locator('.suggest-item').filter({ hasText: 'als notitie toevoegen' }).first().click();
  await expect(page.locator('.board-card', { hasText: note })).toHaveCount(1);
}

test('O8: een prikbord krijgt een beschrijving, onder de vouw geschreven', async ({ page }, info) => {
  test.setTimeout(90_000);
  await signIn(page, ...KEEPER);
  const stamp = `${info.project.name}-${Date.now().toString(36)}`;
  const name = `Beschreven muur ${stamp}`;
  const id = await newWall(page, name);
  await page.goto(`/b/${id}`);
  await editCanvas(page);

  const box = page.locator('#board-description-input');
  await box.scrollIntoViewIfNeeded();
  await box.click();
  await page.keyboard.type(`Wie er op de kade stond ${stamp}`);
  const saved = page.waitForResponse((r) => r.url().endsWith(`/api/boards/${id}`) && r.request().method() === 'PATCH');
  await page.keyboard.press('Enter');
  expect((await saved).ok()).toBe(true);

  // The heading prints it (on a phone the line is there but folded away, §34).
  const head = page.getByTestId('board-description');
  await expect(head).toContainText(`Wie er op de kade stond ${stamp}`);
  if (info.project.name === 'desktop') await expect(head).toBeVisible();

  // And it is the archive's: a reload keeps it, and the shelf prints it.
  await page.reload();
  await expect(page.getByTestId('board-description')).toContainText(stamp);
  await page.goto('/boards');
  await expect(page.locator('.board-row', { hasText: name })).toContainText(`Wie er op de kade stond ${stamp}`);
});

test('de tekenlaag-schakelaar van de Keeper staat onder de vouw, niet in Rechten', async ({ page }, info) => {
  await signIn(page, ...KEEPER);
  const id = await newWall(page, `Inktmuur ${info.project.name} ${Date.now()}`);
  await page.goto(`/b/${id}`);
  await expect(page.locator('.board-viewport')).toBeVisible();
  await expect(page.locator('#board-ink-underfold').getByTestId('ink-enabled')).toHaveCount(1);
  await page.getByRole('button', { name: 'Rechten' }).click();
  const sheet = page.getByRole('dialog', { name: 'Wie mag hier aan' });
  await expect(sheet).toBeVisible();
  await expect(sheet.getByTestId('ink-enabled')).toHaveCount(0);
});

test('Bewerken op een telefoon: de muur houdt het scherm, en Lezen houdt een grijze ongedaan-knop', async ({ page }, info) => {
  await signIn(page, ...KEEPER);
  const id = await newWall(page, `Glasmuur ${info.project.name} ${Date.now()}`);
  await page.goto(`/b/${id}`);
  await readCanvas(page);
  // C10: in Lezen the button is there, and grey — on a desk. §105 (golf i1):
  // on a phone Lezen is quiet, and the undo is Bewerken's, beside the `+`.
  const undo = page.getByRole('button', { name: 'Ongedaan maken' });
  if (info.project.name === 'phone') {
    await expect(page.getByRole('button', { name: 'Ongedaan maken', includeHidden: true })).toBeDisabled();
    await expect(undo).toBeHidden();
  } else {
    await expect(undo).toBeVisible();
    await expect(undo).toBeDisabled();
  }

  await editCanvas(page);
  await expect(page.getByRole('button', { name: 'Nieuwe notitie', exact: true })).toBeVisible();
  await expect(page.getByText('Verschuiven werkt het best op een tablet of computer.')).toHaveCount(0);
  await page.waitForTimeout(400);
  const viewport = page.viewportSize()!;
  const glass = (await page.locator('.board-viewport').boundingBox())!;
  if (info.project.name === 'phone') {
    // Measured: 517 of 844 (61 %), was 422 (50 %) before this round.
    expect(glass.height, `the wall is ${Math.round(glass.height)} of ${viewport.height}`).toBeGreaterThan(viewport.height * 0.58);
    // One row: the search and the makers stand side by side. §105 (golf i1):
    // *Nieuwe notitie* is the wall's `+` now, under the thumb in the corner
    // where the shell's `+` stands everywhere else — so the row is the search,
    // Foto and Punaise, and the notitie is below the glass's bottom half.
    const find = (await page.getByLabel('Kaart toevoegen').boundingBox())!;
    for (const name of ['Foto', 'Punaise']) {
      const button = (await page.getByRole('button', { name, exact: true }).boundingBox())!;
      expect(Math.abs(button.y + button.height / 2 - (find.y + find.height / 2))).toBeLessThan(12);
    }
    const plus = (await page.getByRole('button', { name: 'Nieuwe notitie', exact: true }).boundingBox())!;
    expect(plus.width).toBeGreaterThanOrEqual(44);
    expect(plus.y).toBeGreaterThan(viewport.height * 0.6);
    const sideways = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(sideways).toBeLessThanOrEqual(1);
  }
});

test('C15: het tijdlijnblad past, de maat is een rij chips, en een gebeurtenis heeft een echte datum', async ({ page }, info) => {
  test.setTimeout(90_000);
  await signIn(page, ...KEEPER);
  await page.goto('/timelines');
  await page.getByRole('button', { name: /^Nieuwe tijdlijn$/ }).click();
  const sheet = page.getByRole('dialog', { name: 'Nieuwe tijdlijn' });
  await expect(sheet).toBeVisible();
  const viewport = page.viewportSize()!;
  const make = sheet.getByRole('button', { name: /Openbare tijdlijn/ });
  const at = (await make.boundingBox())!;
  expect(at.y + at.height).toBeLessThanOrEqual(viewport.height);

  // Six chips, named by the word alone; the chosen one's sentence under them.
  await expect(sheet.locator('.timeline-scale-chip')).toHaveCount(6);
  await sheet.getByRole('radio', { name: 'Uren', exact: true }).check();
  await expect(sheet.getByTestId('new-timeline-scale-hint')).toContainText('Tot op het uur');
  await sheet.getByRole('radio', { name: 'Dagen', exact: true }).check();
  await fillWhenReady(sheet.getByLabel('Naam', { exact: true }), `Chiptijd ${info.project.name} ${Date.now()}`);
  await make.click();
  await page.waitForURL('**/timelines/**');
  await editCanvas(page);

  await page.getByTestId('timeline-add').click();
  const eventSheet = page.getByRole('dialog', { name: /Gebeurtenis op/ });
  await expect(eventSheet).toBeVisible();
  await page.keyboard.type('Proef');
  await eventSheet.getByRole('button', { name: /Losse gebeurtenis/ }).click();
  // A date from the axis on screen, in the boxes — not a grey placeholder.
  await expect(page.locator('#new-event-year')).toHaveValue(/^\d{3,4}$/);
  await expect(page.locator('#new-event-day')).toHaveValue(/^\d{1,2}$/);
  const submit = page.getByTestId('new-event-submit');
  await expect(submit).toBeEnabled();
  const box = (await submit.boundingBox())!;
  expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
  await submit.click();
  await expect(page.locator('.timeline-tag', { hasText: 'Proef' })).toHaveCount(1);
});

test('C8: een los kaartje in een nieuwe stamboom houdt zijn vier woorden op het glas', async ({ page }, info) => {
  await signIn(page, ...KEEPER);
  const made = await page.request.post('/api/family-trees', { data: { name: `Losse boom ${info.project.name} ${Date.now()}` } });
  expect(made.ok()).toBe(true);
  const { tree } = (await made.json()) as { tree: { slug: string } };
  await page.goto(`/stambomen/${tree.slug}`);
  await editCanvas(page);
  const add = page.getByTestId('tree-add-loose');
  // The maker keeps its word on a phone too.
  await expect(add).toContainText('Los kaartje');
  await add.click();
  const card = page.locator('.tree-node').first();
  await expect(card).toBeVisible();
  await expect(async () => {
    if (!(await page.getByTestId('tree-handle-parent').isVisible())) await card.click();
    await expect(page.getByTestId('tree-handle-parent')).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: 10_000 });
  await page.waitForTimeout(300);
  const stage = (await page.locator('.tree-stage').boundingBox())!;
  for (const role of ['parent', 'child', 'partner', 'sibling']) {
    const handle = (await page.getByTestId(`tree-handle-${role}`).boundingBox())!;
    expect(handle.x, role).toBeGreaterThanOrEqual(stage.x - 1);
    expect(handle.x + handle.width, role).toBeLessThanOrEqual(stage.x + stage.width + 1);
  }
  await expect(page.getByTestId('tree-handle-sibling')).toContainText('Broer/zus');
});

test('O10: een Touwtje is af te breken, en in Lezen niet te beginnen', async ({ page }, info) => {
  test.setTimeout(90_000);
  await signIn(page, ...KEEPER);
  const stamp = `${info.project.name}-${Date.now().toString(36)}`;
  const id = await newWall(page, `Touwbord ${stamp}`);
  await page.goto(`/b/${id}`);
  await editCanvas(page);
  for (const note of [`Een ${stamp}`, `Twee ${stamp}`]) await addNote(page, note);
  await page.getByRole('button', { name: 'Alles in beeld' }).click();

  await page.locator('.board-card', { hasText: `Een ${stamp}` }).locator('.board-card-name').click();
  await page.getByTestId('board-string-start').click();
  const pick = page.getByTestId('board-string-pick');
  await expect(pick).toBeVisible();
  await pick.getByRole('button', { name: 'Toch niet' }).click();
  await expect(pick).toHaveCount(0);
  await expect(page.locator('path.board-string')).toHaveCount(0);

  // Lezen: a card still opens its panel, but there is no Touwtje in it.
  await readCanvas(page);
  await page.locator('.board-card', { hasText: `Een ${stamp}` }).locator('.board-card-name').click();
  await expect(page.getByTestId('board-string-start')).toHaveCount(0);
});
