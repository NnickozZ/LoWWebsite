import { expect, test, type Page } from '@playwright/test';
import { signIn, signUp } from './helpers';

/**
 * §32: tijdlijnen.
 *
 *  1. A tijdlijn is made from the shelf with a name and a measure, and a
 *     gebeurtenis is put on it — a loose note, and an artikel with a "Lees
 *     verder". Each folds out when clicked; "Alles tonen" / "Alles inklappen"
 *     do what they say; the artikel's own page says where it is.
 *  2. A dossier has a Tijdlijn tab with its own tijdlijnen.
 *  3. A private tijdlijn is not there for anyone else (§17), and one in the
 *     bin can be put back (§11).
 */

const KEEPER = ['Keeper', 'abbeytower34'] as const;

/** Desktop has tabs; a phone stacks the same sections under a jump menu. */
async function openCaseSection(page: Page, label: string, isPhone: boolean) {
  if (isPhone) {
    await page.locator('.jump-menu').getByRole('button', { name: label }).click();
  } else {
    await page.getByRole('tab', { name: label }).click();
  }
}

async function newTimeline(page: Page, name: string, scaleLabel = 'Dagen') {
  await page.getByRole('button', { name: /Nieuwe tijdlijn|Maak nieuwe tijdlijn/ }).first().click();
  const sheet = page.getByRole('dialog', { name: 'Nieuwe tijdlijn' });
  await sheet.getByLabel('Naam').fill(name);
  await sheet.getByLabel(scaleLabel).check();
  await sheet.getByRole('button', { name: /Openbare tijdlijn|Tijdlijn aanmaken/ }).click();
  await page.waitForURL('**/timelines/**');
  await expect(page.getByTestId('timeline-title')).toHaveText(name);
}

async function fillDate(page: Page, prefix: string, parts: { year: string; month?: string; day?: string }) {
  await page.locator(`#${prefix}-year`).fill(parts.year);
  if (parts.month) await page.locator(`#${prefix}-month`).fill(parts.month);
  if (parts.day) await page.locator(`#${prefix}-day`).fill(parts.day);
}

test('a tijdlijn with a note and an artikel on it', async ({ page }, info) => {
  test.setTimeout(90_000);
  const stamp = `${info.project.name}-${Date.now().toString(36)}`;
  const name = `De week van de storm ${stamp}`;

  await signIn(page, ...KEEPER);
  await page.goto('/timelines');
  await newTimeline(page, name);

  // A loose gebeurtenis, at a day.
  await page.getByTestId('timeline-add').click();
  const add = page.getByRole('dialog', { name: /Gebeurtenis op/ });
  await add.locator('#new-event-query').fill(`Storm boven Zeeland ${stamp}`);
  await add.getByRole('button', { name: /Losse gebeurtenis/ }).click();
  await expect(add.getByTestId('new-event-chosen')).toHaveText(`Storm boven Zeeland ${stamp}`);
  await fillDate(page, 'new-event', { year: '1931', month: '3', day: '12' });
  await expect(add.getByText('Dit wordt: 12 maart 1931')).toBeVisible();
  await add.locator('#new-event-text').fill('Het waaide de hele nacht.');
  await add.getByTestId('new-event-submit').click();

  // It folds out at once, with the moment and the tijdlijn's own words.
  const popout = page.getByTestId('timeline-popout');
  await expect(popout).toHaveCount(1);
  await expect(popout).toContainText(`Storm boven Zeeland ${stamp}`);
  await expect(popout).toContainText('12 maart 1931');
  await expect(popout).toContainText('Het waaide de hele nacht.');
  // A note has no picture, so no frame — and no "Lees verder".
  await expect(popout.locator('.timeline-popout-picture')).toHaveCount(0);
  await expect(popout.getByTestId('timeline-read-more')).toHaveCount(0);

  // An artikel from the archive, a month earlier.
  await page.getByTestId('timeline-add').click();
  const add2 = page.getByRole('dialog', { name: /Gebeurtenis op/ });
  await add2.locator('#new-event-query').fill('Westkapelle');
  await add2.getByRole('button', { name: /Westkapelle Lighthouse/ }).first().click();
  await expect(add2.getByTestId('new-event-chosen')).toHaveText('Westkapelle Lighthouse');
  await fillDate(page, 'new-event', { year: '1931', month: '2' });
  await expect(add2.getByText('Dit wordt: februari 1931')).toBeVisible();
  await add2.getByTestId('new-event-submit').click();

  await expect(page.getByTestId('timeline-event')).toHaveCount(2);
  // The new one is open, the earlier one was closed by the add.
  const open = page.getByTestId('timeline-popout');
  await expect(open).toHaveCount(1);
  await expect(open).toContainText('Westkapelle Lighthouse');
  await expect(open).toContainText('februari 1931');
  await expect(open.getByTestId('timeline-read-more')).toBeVisible();

  // Alles tonen / inklappen.
  await page.getByTestId('timeline-toggle-all').click();
  await expect(page.getByTestId('timeline-popout')).toHaveCount(2);
  await expect(page.getByTestId('timeline-toggle-all')).toHaveText(/inklappen/);
  await page.getByTestId('timeline-toggle-all').click();
  await expect(page.getByTestId('timeline-popout')).toHaveCount(0);

  // Up, down: the first in time is above the axis, the second below.
  const events = page.getByTestId('timeline-event');
  await expect(events.nth(0)).toHaveClass(/timeline-event-up/);
  await expect(events.nth(1)).toHaveClass(/timeline-event-down/);
  await expect(events.nth(0)).toHaveClass(/timeline-event-entry/);

  // Clicking a tag folds its window out; "Lees verder" goes to the artikel.
  await events.nth(0).locator('.timeline-tag').click();
  await page.getByTestId('timeline-read-more').click();
  await page.waitForURL('**/e/westkapelle-lighthouse**');
  await expect(page.getByText('Op de tijdlijn:')).toBeVisible();
  const chip = page.locator('.chip', { hasText: name });
  await expect(chip).toBeVisible();
  await expect(chip).toContainText('februari 1931');

  // And the chip lands back on the tijdlijn with that gebeurtenis open.
  await chip.click();
  await page.waitForURL('**/timelines/**event=**');
  await expect(page.getByTestId('timeline-popout')).toContainText('Westkapelle Lighthouse');
});

test('a dossier has a Tijdlijn tab of its own', async ({ page }, info) => {
  const stamp = `${info.project.name}-${Date.now().toString(36)}`;
  const isPhone = info.project.name === 'phone';
  await signIn(page, ...KEEPER);
  await page.goto('/cases');
  await page.locator('a[href^="/c/"]').first().click();
  await page.waitForURL('**/c/**');
  const caseUrl = page.url();

  await openCaseSection(page, 'Tijdlijn', isPhone);
  await expect(page.getByRole('button', { name: 'Maak nieuwe tijdlijn voor dit dossier' })).toBeVisible();
  await newTimeline(page, `Verloop van de zaak ${stamp}`, 'Uren');

  await page.goto(caseUrl);
  await openCaseSection(page, 'Tijdlijn', isPhone);
  const row = page.locator('a[href^="/timelines/"]', { hasText: `Verloop van de zaak ${stamp}` });
  await expect(row).toBeVisible();
  await expect(row).toContainText('uren');
});

test('a private tijdlijn is nobody else\'s, and the bin gives one back', async ({ page, browser }, info) => {
  test.setTimeout(90_000);
  const stamp = `${info.project.name}-${Date.now().toString(36)}`;
  const name = `Alleen voor mij ${stamp}`;

  await signIn(page, ...KEEPER);
  await page.goto('/timelines');
  await page.getByRole('button', { name: 'Nieuwe tijdlijn' }).click();
  const sheet = page.getByRole('dialog', { name: 'Nieuwe tijdlijn' });
  await sheet.getByLabel('Naam').fill(name);
  await sheet.getByRole('button', { name: 'Privé tijdlijn' }).click();
  await page.waitForURL('**/timelines/**');
  const url = page.url();

  // Somebody else: not on the shelf, and the address is a dead end.
  const other = await browser.newContext({ viewport: page.viewportSize() });
  const stranger = await other.newPage();
  await signUp(stranger, `Vreemde${stamp.replace(/[^a-z0-9]/gi, '').slice(-8)}`, 'wachtwoord123');
  await stranger.goto('/timelines');
  await expect(stranger.getByText(name)).toHaveCount(0);
  const response = await stranger.goto(url);
  expect(response?.status()).toBe(404);
  await other.close();

  // Into the bin from its settings, and back out from Beheer.
  await page.getByTestId('timeline-settings').click();
  await page.getByRole('button', { name: 'Tijdlijn verwijderen' }).click();
  const ask = page.getByRole('dialog', { name: new RegExp(`${name} in de prullenbak`) });
  await ask.getByRole('button', { name: 'In de prullenbak' }).click();
  await page.waitForURL('**/timelines');
  await expect(page.getByText(name)).toHaveCount(0);

  await page.goto('/admin');
  await page.getByRole('tab', { name: /Prullenbak/ }).click();
  const row = page.locator('li').filter({ hasText: name }).first();
  await expect(row).toBeVisible();
  await expect(row).toContainText('Tijdlijn');
  await row.getByRole('button', { name: 'Terugzetten' }).click();
  await page.goto('/timelines');
  await expect(page.getByText(name).first()).toBeVisible();
});
