import { expect, test, type Page } from '@playwright/test';
import { editCanvas, signIn } from './helpers';

/**
 * Round 37 on the tijdlijn: §73 lezen en bewerken, §74 de peek.
 *
 *  1. A desk opens a tijdlijn in Bewerken, with "Gebeurtenis toevoegen" there.
 *  2. A phone opens it in Lezen: no add button, no line advertising a long
 *     press that would do nothing, a drag on a tag moves no gebeurtenis — and a
 *     tapped tag still opens its window, in a peek that leaves most of the
 *     screen to the axis. Bewerken brings the add button back.
 */

const KEEPER = ['Keeper', 'abbeytower34'] as const;

/** From the shelf, the way a person makes one; lands on the new tijdlijn. */
async function newTimeline(page: Page, name: string) {
  await page.goto('/timelines');
  await page.getByRole('button', { name: /Nieuwe tijdlijn/ }).first().click();
  const sheet = page.getByRole('dialog', { name: 'Nieuwe tijdlijn' });
  await sheet.getByLabel('Naam', { exact: true }).fill(name);
  await sheet.getByRole('radio', { name: 'Dagen', exact: true }).check();
  await sheet.getByRole('button', { name: /Openbare tijdlijn|Tijdlijn aanmaken/ }).click();
  await page.waitForURL('**/timelines/**');
  await expect(page.getByTestId('timeline-title').locator('#timeline-title-name')).toHaveValue(name);
  await expect(page.getByTestId('timeline-stage')).toBeVisible();
}

const modeRadio = (page: Page, name: 'Lezen' | 'Bewerken') =>
  page.getByTestId('canvas-mode').first().getByRole('radio', { name, exact: true });

test('§73: een bureau opent een tijdlijn in Bewerken', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'the phone has its own test below');
  const stamp = `${info.project.name}-${Date.now().toString(36)}`;

  await signIn(page, ...KEEPER);
  await newTimeline(page, `Bureau ${stamp}`);

  await expect(modeRadio(page, 'Bewerken')).toHaveAttribute('aria-checked', 'true');
  await expect(modeRadio(page, 'Lezen')).toHaveAttribute('aria-checked', 'false');
  await expect(page.getByTestId('timeline-add')).toBeVisible();
});

test('§73/§74: een telefoon leest, en een getikte tag opent een kleine peek', async ({ page }, info) => {
  test.skip(info.project.name !== 'phone', 'Lezen first is a phone’s rule');
  test.setTimeout(120_000);
  const stamp = `${info.project.name}-${Date.now().toString(36)}`;
  const what = `Storm op zee ${stamp}`;

  await signIn(page, ...KEEPER);
  await newTimeline(page, `Telefoon ${stamp}`);
  // §94 (O1): a tijdlijn you just made opens in Bewerken; §73's rule is about
  // opening it again, so open it again.
  await page.reload();

  /* ---- Lezen: nothing to make, and nothing that says there is ---- */
  await expect(modeRadio(page, 'Lezen')).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByTestId('timeline-add')).toHaveCount(0);
  await expect(page.locator('.timeline-count')).not.toContainText('Houd de as ingedrukt');
  await expect(page.locator('.timeline-count')).toContainText('Bewerken');

  /* ---- Bewerken gives the button back; put one gebeurtenis down ---- */
  await editCanvas(page);
  await expect(page.getByTestId('timeline-add')).toBeVisible();
  await expect(page.locator('.timeline-count')).toContainText('Houd de as ingedrukt');
  await page.getByTestId('timeline-add').click();
  const add = page.getByRole('dialog', { name: /Gebeurtenis op/ });
  await add.locator('#new-event-query').fill(what);
  await add.getByRole('button', { name: /Losse gebeurtenis/ }).click();
  await add.locator('#new-event-year').fill('1931');
  await add.locator('#new-event-month').fill('3');
  await add.locator('#new-event-day').fill('12');
  await add.getByTestId('new-event-submit').click();
  await expect(page.getByTestId('timeline-event')).toHaveCount(1);

  /* ---- a fresh visit is Lezen again, with every window shut ---- */
  // §94 (C5): the window in front is in the address (`?event=`), so a *fresh*
  // visit is the bare address — a reload would fold it out again, on purpose.
  await page.goto(new URL(page.url()).pathname);
  const tag = page.getByTestId('timeline-event').first().locator('.timeline-tag');
  await expect(tag).toHaveAttribute('title', '12 maart 1931');
  await expect(modeRadio(page, 'Lezen')).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByTestId('timeline-add')).toHaveCount(0);
  await expect(page.getByTestId('timeline-popout')).toHaveCount(0);

  /*
   * A tap opens the window. Pressed until it answers — a page that has just
   * reloaded is not yet listening (§6) — and only while it is still shut,
   * because a second tap on a tag folds its window away again.
   */
  const popout = page.getByTestId('timeline-popout');
  await expect(async () => {
    if ((await popout.count()) === 0) await tag.click();
    await expect(popout).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: 15_000 });
  await expect(popout).toHaveAttribute('aria-label', what);

  /* ---- §74: the peek is small, and the axis above it is still there ---- */
  const peek = page.locator('.canvas-peek');
  await expect(peek).toBeVisible();
  await expect(peek).toHaveAttribute('data-peek', 'peek');
  const viewport = page.viewportSize()!;
  const peekBox = (await peek.boundingBox())!;
  expect(peekBox.height, 'a peek, not a cover').toBeLessThan(viewport.height * 0.45);
  const stageBox = (await page.getByTestId('timeline-stage').boundingBox())!;
  expect(peekBox.y, 'the top of the stage is not under the peek').toBeGreaterThan(stageBox.y + 40);

  /* ---- a drag on a tag in Lezen moves no gebeurtenis ---- */
  const box = (await tag.boundingBox())!;
  const y = box.y + box.height / 2;
  await page.mouse.move(box.x + box.width / 2, y);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 90, y, { steps: 10 });
  await page.mouse.up();
  await page.waitForTimeout(400);
  await expect(tag).toHaveAttribute('title', '12 maart 1931');
  await expect(page.getByTestId('timeline-event').first()).not.toHaveClass(/timeline-event-dragging/);

  /* ---- and Bewerken brings the add button back ---- */
  await editCanvas(page);
  await expect(page.getByTestId('timeline-add')).toBeVisible();
});
