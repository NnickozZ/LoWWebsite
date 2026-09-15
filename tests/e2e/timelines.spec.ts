import { expect, test, type Page } from '@playwright/test';
import { editArticle, editCase, pasteImage, signIn, signUp } from './helpers';

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

/**
 * The measure is picked by the *name* of its radio and nothing else. The line
 * under each one is a description now, not part of its name (§35), because
 * "Seconden — de laatste twee minuten" would otherwise be a radio that answers
 * to "Minuten" as readily as the Minuten one does.
 */
async function newTimeline(page: Page, name: string, scaleLabel = 'Dagen') {
  await page.getByRole('button', { name: /Nieuwe tijdlijn|Maak nieuwe tijdlijn/ }).first().click();
  const sheet = page.getByRole('dialog', { name: 'Nieuwe tijdlijn' });
  await sheet.getByLabel('Naam', { exact: true }).fill(name);
  await sheet.getByRole('radio', { name: scaleLabel, exact: true }).check();
  await sheet.getByRole('button', { name: /Openbare tijdlijn|Tijdlijn aanmaken/ }).click();
  await page.waitForURL('**/timelines/**');
  /*
   * §69 (4.9): de kop *is* het vak sinds deze ronde, dus de naam staat in een
   * `value` en niet in de tekst — de tekst van de `h1` is nu het verborgen
   * label. Dezelfde vorm als `family-trees.spec.ts` al had voor de stamboom.
   */
  await expect(page.getByTestId('timeline-title').locator('#timeline-title-name')).toHaveValue(name);
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
  // Round 18: `@` in the text box offers a name; `[[Naam]]` is what lands.
  await add.locator('#new-event-text').fill('Het waaide de hele nacht, zei @Jacob');
  await page.getByTestId('mention-pop').getByRole('option', { name: /Jacob den Hollander/ }).click();
  await expect(add.locator('#new-event-text')).toHaveValue('Het waaide de hele nacht, zei [[Jacob den Hollander]] ');
  await add.getByTestId('new-event-submit').click();

  // It folds out at once, with the moment and the tijdlijn's own words —
  // the name as a chip.
  const popout = page.getByTestId('timeline-popout');
  await expect(popout).toHaveCount(1);
  await expect(popout).toContainText(`Storm boven Zeeland ${stamp}`);
  await expect(popout).toContainText('12 maart 1931');
  await expect(popout).toContainText('Het waaide de hele nacht, zei');
  await expect(popout.locator('.entry-chip')).toHaveText('Jacob den Hollander');

  // And in the edit sheet, where the box is bound to the live room (§21): a
  // pick writes into the shared text like a keystroke and is saved at once.
  await popout.getByTestId('timeline-edit-event').click();
  const bound = page.locator('#event-text');
  const edit = page.getByRole('dialog').filter({ has: bound });
  // (the server trims the trailing space)
  await expect(bound).toHaveValue('Het waaide de hele nacht, zei [[Jacob den Hollander]]');
  // The box is read-only until the room has answered (§21) — and for a beat
  // after that the seeded text is still landing, so a keystroke in that beat
  // is lost (older than this round; the live spec waits the same way).
  await expect(bound).toBeEditable();
  await page.waitForTimeout(500);
  await bound.click();
  await page.keyboard.press('End');
  await page.keyboard.type(' en @Sister');
  await page.getByTestId('mention-pop').getByRole('option', { name: /Sister Clasina/ }).click();
  await expect(bound).toHaveValue('Het waaide de hele nacht, zei [[Jacob den Hollander]] en [[Sister Clasina]] ');
  await expect(edit.getByText('wordt meteen bewaard')).toBeVisible();
  // Round 21: a textarea cannot hold a chip, so the sheet prints what the
  // writing refers to underneath it — clickable while you type.
  await expect(edit.getByText('Verwijst naar')).toBeVisible();
  await expect(edit.locator('.entry-chip')).toHaveText(['Jacob den Hollander', 'Sister Clasina']);
  // The last edit leaves in the next batch (`UPDATE_BATCH_MS`, 80 ms); a
  // sheet closed inside that window takes it with it. Older than this round.
  await page.waitForTimeout(300);
  await page.keyboard.press('Escape');
  await expect(edit).toHaveCount(0);
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
  /*
   * §62 (round 29): the new one joins the windows that were already open —
   * it used to replace them, which shut what somebody was reading in order to
   * show one tag.
   */
  const open = page.getByTestId('timeline-popout');
  await expect(open).toHaveCount(2);
  const fresh = open.filter({ hasText: 'Westkapelle Lighthouse' });
  await expect(fresh).toHaveCount(1);
  await expect(fresh).toContainText('februari 1931');
  await expect(fresh.getByTestId('timeline-read-more')).toBeVisible();

  // Alles tonen / inklappen. Both are open already, so the button says so.
  await expect(page.getByTestId('timeline-toggle-all')).toHaveText(/inklappen/);
  await page.getByTestId('timeline-toggle-all').click();
  await expect(page.getByTestId('timeline-popout')).toHaveCount(0);
  await page.getByTestId('timeline-toggle-all').click();
  await expect(page.getByTestId('timeline-popout')).toHaveCount(2);
  await page.getByTestId('timeline-toggle-all').click();
  await expect(page.getByTestId('timeline-popout')).toHaveCount(0);

  /*
   * §62: each tag hangs above or below the axis by a hash of its own id, not
   * by its place in the list — so which side a given gebeurtenis is on is not
   * predictable here, and that is the point: it is the *same* side on every
   * screen and it does not move when somebody sets one in the middle.
   * `tests/unit/timeline-time.test.ts` is where that is pinned down.
   */
  const events = page.getByTestId('timeline-event');
  await expect(events.nth(0)).toHaveClass(/timeline-event-(up|down)/);
  await expect(events.nth(1)).toHaveClass(/timeline-event-(up|down)/);
  const sides = await events.evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-side')));
  await page.reload();
  await expect(page.getByTestId('timeline-event')).toHaveCount(2);
  expect(await events.evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-side')))).toEqual(sides);
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
  // Saved by the room, not by a button (the server writes it down a second
  // and a half after the last keystroke, `PERSIST_DEBOUNCE_MS`): a reload
  // after that shows both chips.
  await page.waitForTimeout(2500);
  await page.reload();
  await page.getByTestId('timeline-toggle-all').click();
  const named = page.getByTestId('timeline-popout').filter({ hasText: `Storm boven Zeeland ${stamp}` }).locator('.entry-chip');
  await expect(named).toHaveText(['Jacob den Hollander', 'Sister Clasina']);
  // Round 21: it is the artikel, not a highlight — the same chip the rich
  // editor writes, with the same road out of it.
  await expect(named.first()).toHaveAttribute('href', /\/e\//);
  await named.first().click();
  await page.waitForURL('**/e/**');
  await expect(page.getByRole('heading', { name: 'Jacob den Hollander' })).toBeVisible();
});

test('a dossier has a Tijdlijn tab of its own', async ({ page }, info) => {
  const stamp = `${info.project.name}-${Date.now().toString(36)}`;
  const isPhone = info.project.name === 'phone';
  await signIn(page, ...KEEPER);
  await page.goto('/cases');
  await page.locator('a[href^="/c/"]').first().click();
  await page.waitForURL('**/c/**');
  const caseUrl = page.url();
  // §22: a dossier reached by a link opens on the reading face, where the
  // button that makes a tijdlijn is not — making one is editing.
  await editCase(page);

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
  await sheet.getByLabel('Naam', { exact: true }).fill(name);
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

/**
 * §35: a gebeurtenis is dragged, and a tijdlijn may speel op one day.
 *
 *  4. Dragging a tag along the axis moves the gebeurtenis to a whole unit and
 *     writes that date into the artikel behind it.
 *  5. A press that does not move is still a click: the window folds out and
 *     nothing has moved.
 *  6. An anchored tijdlijn fills the day in for a new gebeurtenis and cannot
 *     be panned or zoomed off it.
 */

/** Picks the tag up, carries it `dx` to the right, and puts it down. */
async function dragTag(page: Page, tag: ReturnType<Page['locator']>, dx: number) {
  const box = (await tag.boundingBox())!;
  const y = box.y + box.height / 2;
  await page.mouse.move(box.x + box.width / 2, y);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + dx, y, { steps: 12 });
  await page.mouse.up();
}

test('a gebeurtenis is dragged along the axis, and the artikel moves with it', async ({ page }, info) => {
  test.setTimeout(90_000);
  const stamp = `${info.project.name}-${Date.now().toString(36)}`;
  const name = `De sleep ${stamp}`;
  const article = `Het losgeslagen jol ${stamp}`;

  await signIn(page, ...KEEPER);
  await page.goto('/timelines');
  await newTimeline(page, name);
  const timelineUrl = page.url();

  // A new artikel of the soort Gebeurtenissen — it has a Datum in its
  // infobox, which is the field the drag writes back into.
  await page.getByTestId('timeline-add').click();
  const add = page.getByRole('dialog', { name: /Gebeurtenis op/ });
  await add.locator('#new-event-query').fill(article);
  await add.getByRole('button', { name: /als nieuw artikel aanmaken/ }).click();
  const entrySheet = page.getByRole('dialog', { name: 'Nieuw artikel' });
  await expect(entrySheet).toBeVisible();
  await entrySheet.getByRole('button', { name: 'Aanmaken' }).click();
  await expect(add.getByTestId('new-event-chosen')).toHaveText(article);
  await fillDate(page, 'new-event', { year: '1931', month: '3', day: '12' });
  await add.getByTestId('new-event-submit').click();

  const tag = page.getByTestId('timeline-event').first().locator('.timeline-tag');
  await expect(tag).toHaveAttribute('title', '12 maart 1931');

  // Carried to the right: it lands on a whole day, and not on the 12th.
  await dragTag(page, tag, 170);
  await expect(tag).not.toHaveAttribute('title', '12 maart 1931');
  await expect(tag).toHaveAttribute('title', /^\d{1,2} [a-z]+ 1931$/);
  const moved = (await tag.getAttribute('title'))!;
  // The window that was open followed the hand and says the same moment.
  await expect(page.getByTestId('timeline-popout')).toContainText(moved);
  await page.waitForTimeout(800);

  // And so does the artikel's own infobox — one moment, two faces.
  await page.getByTestId('timeline-read-more').click();
  await page.waitForURL('**/e/**');
  await editArticle(page);
  await expect(page.locator('#field-date')).toHaveValue(moved);

  // Back on the tijdlijn it is still there, from the archive and not from
  // this tab's memory: the address is asked for again from the top, so what
  // is drawn is what the server read out of the database just now.
  await page.goto(timelineUrl);
  await expect(page.getByTestId('timeline-event').first().locator('.timeline-tag')).toHaveAttribute('title', moved);
});

test('a plain click on a tag still only folds its window out', async ({ page }, info) => {
  test.setTimeout(90_000);
  const stamp = `${info.project.name}-${Date.now().toString(36)}`;
  const name = `Alleen klikken ${stamp}`;

  await signIn(page, ...KEEPER);
  await page.goto('/timelines');
  await newTimeline(page, name);

  await page.getByTestId('timeline-add').click();
  const add = page.getByRole('dialog', { name: /Gebeurtenis op/ });
  await add.locator('#new-event-query').fill(`Stil weer ${stamp}`);
  await add.getByRole('button', { name: /Losse gebeurtenis/ }).click();
  await fillDate(page, 'new-event', { year: '1931', month: '3', day: '12' });
  await add.getByTestId('new-event-submit').click();

  const event = page.getByTestId('timeline-event').first();
  const tag = event.locator('.timeline-tag');
  await expect(tag).toHaveAttribute('title', '12 maart 1931');
  const before = (await tag.boundingBox())!;
  // It was made open; shut it, then open it again with a plain click. A click
  // is a press and a release in one spot, which is exactly the press the drag
  // takes the pointer for — so this is the one that must still fold out.
  await tag.click();
  await expect(page.getByTestId('timeline-popout')).toHaveCount(0);
  await tag.click();
  await expect(page.getByTestId('timeline-popout')).toHaveCount(1);
  // And nothing has moved: not the moment, not the tag, and the hand was
  // never taken to be carrying it.
  await expect(tag).toHaveAttribute('title', '12 maart 1931');
  await expect(event).not.toHaveClass(/timeline-event-dragging/);
  const after = (await tag.boundingBox())!;
  expect(Math.abs(after.x - before.x)).toBeLessThan(2);
});

/**
 * §69 (3.5): weghalen is één klik vanaf het venster — en het komt terug.
 *
 * It was three presses (venster → `Bewerken` → het blad → de rode knop) on the
 * one surface where taking something off the axis is the commonest thing a
 * Keeper does mid-session. Two halves here, and the second is the one that
 * makes the first honest: the row is **buried**, not deleted (§69,
 * `0024_soft_delete_pins_events`), so *Ongedaan maken* in the toast gives back
 * the same gebeurtenis with its words rather than minting a fresh one. Nothing
 * asserted this road before this item — neither the removal nor the restore.
 */
test('een gebeurtenis gaat er in één klik af, en komt terug', async ({ page }, info) => {
  test.setTimeout(90_000);
  const stamp = `${info.project.name}-${Date.now().toString(36)}`;
  const name = `Weghalen ${stamp}`;
  const what = `Een misverstand ${stamp}`;

  await signIn(page, ...KEEPER);
  await page.goto('/timelines');
  await newTimeline(page, name);

  await page.getByTestId('timeline-add').click();
  const add = page.getByRole('dialog', { name: /Gebeurtenis op/ });
  await add.locator('#new-event-query').fill(what);
  await add.getByRole('button', { name: /Losse gebeurtenis/ }).click();
  await fillDate(page, 'new-event', { year: '1931', month: '3', day: '12' });
  await add.locator('#new-event-text').fill('Dit had er nooit moeten staan.');
  await add.getByTestId('new-event-submit').click();

  // It folds out when it is made, so the window is already the thing on screen.
  const popout = page.getByTestId('timeline-popout');
  await expect(popout).toContainText(what);

  // One press. No confirm: the question is in the toast afterwards (§69).
  await popout.getByTestId('timeline-remove-event').click();
  await expect(page.getByTestId('timeline-event')).toHaveCount(0);

  /*
   * And back. Scoped to the toast for the same reason `maps.spec.ts` scopes
   * it: the tijdlijn's own toolbar carries a button of that name since this
   * round, so a bare locator matches two things.
   */
  await page.locator('.toast').getByRole('button', { name: 'Ongedaan maken' }).click();
  await expect(page.getByTestId('timeline-event')).toHaveCount(1);

  /*
   * And it is back in the archive, not merely on this screen: reload, which
   * also shuts every window, then fold this one out and read it. Its **words**
   * came back with it — the whole point of burying the row rather than
   * deleting it and re-making one.
   */
  await page.reload();
  await expect(page.getByTestId('timeline-popout')).toHaveCount(0);
  await page.locator('.timeline-tag').first().click();
  await expect(page.getByTestId('timeline-popout')).toContainText(what);
  await expect(page.getByTestId('timeline-popout')).toContainText('Dit had er nooit moeten staan.');
});

test('a tijdlijn that speelt op one day fills it in and will not leave it', async ({ page }, info) => {
  test.setTimeout(90_000);
  const stamp = `${info.project.name}-${Date.now().toString(36)}`;
  const name = `De nacht in het pakhuis ${stamp}`;

  await signIn(page, ...KEEPER);
  await page.goto('/timelines');
  await newTimeline(page, name, 'Minuten');

  // "Deze tijdlijn speelt op 3 oktober 1931."
  await page.getByTestId('timeline-settings').click();
  const settings = page.getByRole('dialog', { name: /Instellingen van deze/ });
  await settings.getByRole('radio', { name: 'Eén dag', exact: true }).check();
  await fillDate(page, 'timeline-anchor', { year: '1931', month: '10', day: '3' });
  await settings.getByTestId('timeline-settings-save').click();
  await expect(page.locator('.timeline-count')).toContainText('speelt op 3 oktober 1931');

  // A new gebeurtenis is not asked for the day at all — only the time.
  await page.getByTestId('timeline-add').click();
  const add = page.getByRole('dialog', { name: /Gebeurtenis op/ });
  await add.locator('#new-event-query').fill(`Een schot ${stamp}`);
  await add.getByRole('button', { name: /Losse gebeurtenis/ }).click();
  await expect(add.getByTestId('timeline-anchor-fixed')).toHaveText('3 oktober 1931');
  await expect(add.locator('#new-event-year')).toHaveCount(0);
  await add.locator('#new-event-hour').fill('22');
  await add.locator('#new-event-minute').fill('30');
  await expect(add.getByText('Dit wordt: 3 oktober 1931, 22:30')).toBeVisible();
  await add.getByTestId('new-event-submit').click();

  const tag = page.getByTestId('timeline-event').first().locator('.timeline-tag');
  await expect(tag).toHaveAttribute('title', '3 oktober 1931, 22:30');

  // Zoomed all the way out the axis is that day and no more, so neither a
  // pan nor another zoom can bring 4 October into sight: the tag does not
  // move a pixel.
  /*
   * §69: the button steps by the shared 1.25 now rather than this canvas's own
   * 1.6, so "all the way out" takes more presses than the eight this used to
   * count. Press until the axis stops answering instead: the fence is what is
   * being tested, not the number of clicks it takes to reach it.
   */
  const zoomOut = page.getByRole('button', { name: 'Uitzoomen' });
  let resting = Number.NaN;
  for (let i = 0; i < 30; i++) {
    await zoomOut.click();
    const box = (await tag.boundingBox())!;
    if (Math.abs(box.x - resting) < 0.5) break;
    resting = box.x;
  }
  const before = (await tag.boundingBox())!;
  const stage = (await page.getByTestId('timeline-stage').boundingBox())!;
  // From the empty left-hand end of the axis, so the press is bare stage and
  // not the tag itself, which sits late in the evening.
  await page.mouse.move(stage.x + 20, stage.y + stage.height / 2);
  await page.mouse.down();
  await page.mouse.move(stage.x + stage.width - 20, stage.y + stage.height / 2, { steps: 12 });
  await page.mouse.up();
  const after = (await tag.boundingBox())!;
  expect(Math.abs(after.x - before.x)).toBeLessThan(2);
  await zoomOut.click();
  const zoomed = (await tag.boundingBox())!;
  expect(Math.abs(zoomed.x - before.x)).toBeLessThan(2);
  await expect(tag).toHaveAttribute('title', '3 oktober 1931, 22:30');
});


/**
 * §30 on the axis, round 14: Ctrl+V puts a picture on a tijdlijn.
 *
 * The road existed on either side of this one — the cork takes a paste, and so
 * does a gebeurtenis's blad once it is open — and the axis itself was the hole
 * between them: to make a gebeurtenis *of* a picture you first had to fill in
 * a form for a thing you had not named. Now the paste makes the gebeurtenis at
 * the moment under the hand, hangs the picture on it, and opens its blad,
 * because the one thing a paste cannot guess is what the picture is *of*.
 */
test('een geplakte afbeelding wordt een losse gebeurtenis met die afbeelding', async ({ page }, info) => {
  test.setTimeout(90_000);
  const stamp = `${info.project.name}-${Date.now().toString(36)}`;
  const fileName = `bewijsstuk-${stamp}.png`;
  const expected = `bewijsstuk-${stamp}`;

  await signIn(page, ...KEEPER);
  await page.goto('/timelines');
  await newTimeline(page, `Geplakt bewijs ${stamp}`);

  await pasteImage(page, fileName);

  // The blad opens on what was just made, with the caret already in its name.
  const sheet = page.getByRole('dialog').filter({ has: page.locator('#event-title') });
  await expect(sheet.locator('#event-title')).toHaveText(expected, { timeout: 25_000 });
  await expect(sheet.locator('.event-picture-preview')).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(sheet).toBeHidden();

  // And it is on the axis, folded open, with the picture at the head of the
  // window — which opens full size when it is clicked.
  const popout = page.getByTestId('timeline-popout');
  await expect(popout).toBeVisible();
  await expect(popout.getByRole('heading', { name: expected })).toBeVisible();
  const picture = popout.getByRole('button', { name: /afbeelding groot bekijken/ });
  await expect(picture).toBeVisible();
  await picture.click();
  await expect(page.locator('.board-lightbox')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('.board-lightbox')).toBeHidden();

  // The picture survives a reload: it is on the gebeurtenis, not in this tab.
  // The tag is what is clicked — a `.timeline-event` is a positioning box with
  // its stem and its tag inside it, and has no box of its own to aim at.
  await page.reload();
  await page.getByTestId('timeline-event').first().locator('.timeline-tag').click();
  await expect(page.getByTestId('timeline-popout').locator('img')).toHaveCount(1);
});

/**
 * §69 (2.2 + 3.2): kiezen op een tijdlijn, waar een klik al iets betekende.
 *
 * Dit was het riskantste stuk van de ronde, en om twee redenen die nergens
 * anders spelen. Een druk op een tag betékende al iets — het venster klapt uit
 * — en de tag van een artikel **is een link**, dus shift-klik erop is van de
 * browser (§68: elke muisknop behalve de linker is van hem). Nicks antwoord:
 * shift wisselt op de **stip en de steel**, niet op de naam, en het kader over
 * de as doet de rest.
 *
 * Wat hier dus vastgehouden wordt, is precies dat er niets verloren ging: de
 * gewone klik klapt nog steeds uit, en kiezen kwam erbij.
 */
test('§69: tags kiezen met een kader en met shift op de stip, samen slepen, en Delete', async ({
  page,
}, info) => {
  test.skip(info.project.name === 'phone', '§67: een kader en shift willen een muis en een toetsenbord');
  test.setTimeout(180_000);
  const stamp = `${info.project.name}-${Date.now().toString(36)}`;

  await signIn(page, ...KEEPER);
  await page.goto('/timelines');
  await newTimeline(page, `Kiezen ${stamp}`);

  /** Een losse gebeurtenis op een dag in maart. */
  const put = async (name: string, day: number) => {
    await page.getByTestId('timeline-add').click();
    const add = page.getByRole('dialog', { name: /Gebeurtenis op/ });
    await add.locator('#new-event-query').fill(name);
    await add.getByRole('button', { name: /Losse gebeurtenis/ }).click();
    await fillDate(page, 'new-event', { year: '1931', month: '3', day: String(day) });
    await add.getByTestId('new-event-submit').click();
    /*
     * §6: `.timeline-event` is een wrapper van nul bij nul — hij plaatst zijn
     * stip en zijn steel en heeft zelf geen afmeting — dus `toBeVisible` zegt
     * er nooit ja op. Tellen, zoals de rest van deze spec al doet, en meten aan
     * de stip.
     */
    await expect(page.getByTestId('timeline-event').filter({ hasText: name })).toHaveCount(1);
  };

  await put(`Een ${stamp}`, 10);
  await put(`Twee ${stamp}`, 12);
  await put(`Drie ${stamp}`, 25);
  await expect(page.getByTestId('timeline-event')).toHaveCount(3);
  // Elke gebeurtenis klapte bij het maken uit; leg ze weg.
  await page.getByTestId('timeline-toggle-all').click();
  await expect(page.getByTestId('timeline-popout')).toHaveCount(0);

  const ev = (name: string) => page.getByTestId('timeline-event').filter({ hasText: `${name} ${stamp}` });

  /* ---- een gewone klik op een tag kiest én klapt uit: niets ging verloren ---- */
  await ev('Een').locator('.timeline-tag').click();
  await expect(page.getByTestId('timeline-popout')).toHaveCount(1);
  await expect(ev('Een')).toHaveClass(/timeline-event-chosen/);

  /* ---- shift op de stip wisselt, en laat de vensters met rust ---- */
  await ev('Twee').locator('.timeline-marker').click({ modifiers: ['Shift'] });
  await expect(ev('Twee')).toHaveClass(/timeline-event-chosen/);
  await expect(ev('Een'), 'shift voegt toe, het vervangt niet').toHaveClass(/timeline-event-chosen/);
  await expect(page.getByTestId('timeline-popout'), 'en het klapt niets uit').toHaveCount(1);

  /* ---- Escape laat eerst de keuze los, dan pas een venster ---- */
  await page.keyboard.press('Escape');
  await expect(ev('Een')).not.toHaveClass(/timeline-event-chosen/);
  await expect(page.getByTestId('timeline-popout'), 'het venster staat er nog').toHaveCount(1);
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('timeline-popout')).toHaveCount(0);

  /* ---- een kader over de as ---- */
  const stage = (await page.getByTestId('timeline-stage').boundingBox())!;
  const one = (await ev('Een').locator('.timeline-marker').boundingBox())!;
  const two = (await ev('Twee').locator('.timeline-marker').boundingBox())!;
  await page.keyboard.down('Shift');
  await page.mouse.move(Math.min(one.x, two.x) - 20, stage.y + 12);
  await page.mouse.down();
  await page.mouse.move(Math.max(one.x, two.x) + 20, stage.y + stage.height - 12, { steps: 10 });
  await expect(page.getByTestId('timeline-marquee')).toBeVisible();
  await page.mouse.up();
  await page.keyboard.up('Shift');
  await expect(page.getByTestId('timeline-marquee')).toHaveCount(0);

  await expect(ev('Een')).toHaveClass(/timeline-event-chosen/);
  await expect(ev('Twee')).toHaveClass(/timeline-event-chosen/);
  await expect(ev('Drie'), 'buiten het kader, dus niet gekozen').not.toHaveClass(/timeline-event-chosen/);
  // Een kader is geen klik op de kale as: er ging niets open en niets dicht.
  await expect(page.getByTestId('timeline-popout')).toHaveCount(0);

  /* ---- samen slepen langs de as ---- */
  const beforeTwo = (await ev('Twee').locator('.timeline-marker').boundingBox())!;
  const grab = (await ev('Een').locator('.timeline-marker').boundingBox())!;
  await page.mouse.move(grab.x + grab.width / 2, grab.y + grab.height / 2);
  await page.mouse.down();
  await page.mouse.move(grab.x + grab.width / 2 + 120, grab.y + grab.height / 2, { steps: 12 });
  await page.mouse.up();
  await page.waitForTimeout(600);
  const afterTwo = (await ev('Twee').locator('.timeline-marker').boundingBox())!;
  expect(
    afterTwo.x - beforeTwo.x,
    'de andere gekozene reist even ver mee — dat is wat een groep is',
  ).toBeGreaterThan(40);

  /* ---- Delete haalt de keuze weg, en de melding geeft ze terug ---- */
  await page.keyboard.press('Delete');
  await expect(page.getByTestId('timeline-event')).toHaveCount(1);
  await page.locator('.toast').getByRole('button', { name: 'Ongedaan maken' }).click();
  await expect(page.getByTestId('timeline-event')).toHaveCount(3);
});
