import { expect, test, type Page } from '@playwright/test';
import { signIn } from './helpers';

/**
 * §62: de tijdlijn met z'n tweeën.
 *
 * Everything here is asserted on a second browser that is never reloaded —
 * a reload would pass whether or not any of this works. What it pins down:
 *
 *  1. A tag travels on the other screen *while* a hand is carrying it, and
 *     lands where it was dropped; the hand itself is an arrow on the axis with
 *     the moment it is over under the name.
 *  2. An open blad follows a remote move in the boxes nobody touched, and
 *     keeps the boxes somebody did — with one line saying so, and never a
 *     "Moment opslaan" nobody asked for.
 *  3. A gebeurtenis taken away under an open blad says so.
 *  4. Somebody typing does not move anybody else's view.
 *  5. A gebeurtenis set in the middle leaves every other tag on its own side.
 *  6. A long press on a phone is the double-click a phone has not got.
 *  7. "Alles tonen" lays the windows out rather than on top of each other, and
 *     a click on the bare axis shuts one of them.
 */

const KEEPER = ['Keeper', 'abbeytower34'] as const;

/** 12 March 1931, as one integer — the archive's own way of holding a moment. */
const MARCH_12 = Math.floor(Date.UTC(1931, 2, 12) / 1000);
const DAY = 86400;

type Made = { id: string; slug: string };

/** A tijdlijn straight through the API: this spec is about two screens, not about the shelf. */
async function makeTimeline(page: Page, name: string): Promise<Made> {
  return page.evaluate(async (timelineName) => {
    const response = await fetch('/api/timelines', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: timelineName, scale: 'day' }),
    });
    const data = (await response.json()) as { timeline: { id: string; slug: string } };
    return { id: data.timeline.id, slug: data.timeline.slug };
  }, name);
}

async function makeNote(page: Page, timelineId: string, name: string, at: number): Promise<string> {
  return page.evaluate(
    async ([id, eventName, moment]) => {
      const response = await fetch(`/api/timelines/${id}/events`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ kind: 'note', name: eventName, at: Number(moment), precision: 'day', text: '' }),
      });
      const data = (await response.json()) as { event: { id: string } };
      return data.event.id;
    },
    [timelineId, name, String(at)] as const,
  );
}

/** A second browser, signed in as the same Keeper, standing on the same axis. */
async function watcher(browser: import('@playwright/test').Browser, path: string) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  await signIn(page, ...KEEPER);
  await page.goto(path);
  await expect(page.getByTestId('timeline-stage')).toBeVisible();
  return { context, page };
}

const tagOf = (page: Page, id: string) => page.locator(`.timeline-event[data-event-id="${id}"] .timeline-tag`);
const eventOf = (page: Page, id: string) => page.locator(`.timeline-event[data-event-id="${id}"]`);

test('a tag travels on the other screen while a hand carries it, and the hand is drawn on the axis', async ({
  page,
  browser,
  isMobile,
}, info) => {
  test.skip(isMobile, '§62: a touch screen has no hovering hand to draw');
  test.setTimeout(150_000);
  const stamp = `${info.project.name}-${Date.now().toString(36)}`;

  await signIn(page, ...KEEPER);
  await page.goto('/timelines');
  const line = await makeTimeline(page, `Samen slepen ${stamp}`);
  const noteId = await makeNote(page, line.id, `De storm ${stamp}`, MARCH_12);
  await page.goto(`/timelines/${line.slug}`);
  await expect(tagOf(page, noteId)).toBeVisible();

  const other = await watcher(browser, `/timelines/${line.slug}`);
  await expect(tagOf(other.page, noteId)).toBeVisible({ timeout: 15_000 });
  const before = (await eventOf(other.page, noteId).boundingBox())!;

  // A picks the tag up and carries it — and does not let go.
  const box = (await tagOf(page, noteId).boundingBox())!;
  const y = box.y + box.height / 2;
  await page.mouse.move(box.x + box.width / 2, y);
  await page.mouse.down();
  for (let step = 1; step <= 6; step++) {
    await page.mouse.move(box.x + box.width / 2 + step * 30, y);
    await page.waitForTimeout(90);
  }

  // B sees it travel, with A's hand still down.
  await expect
    .poll(async () => (await eventOf(other.page, noteId).boundingBox())!.x, { timeout: 15_000 })
    .toBeGreaterThan(before.x + 40);

  // And B sees A's arrow, with the moment A is over under the name. A keeps
  // moving while this is asked: a frame is sight, not state, and a hand that
  // has been still for eight seconds is swept off everybody's screen.
  const arrow = other.page.locator('.timeline-cursor');
  await expect
    .poll(
      async () => {
        await page.mouse.move(box.x + box.width / 2 + 180 + (Date.now() % 7), y);
        return arrow.count();
      },
      { timeout: 15_000, intervals: [200, 300, 500, 500, 500] },
    )
    .toBe(1);
  await expect(arrow.locator('.board-cursor-name')).toContainText('Keeper');
  await expect(arrow.locator('.timeline-cursor-when')).toHaveText(/1931/);
  // Nobody draws their own hand.
  await expect(page.locator('.timeline-cursor')).toHaveCount(0);

  await page.mouse.up();
  // It lands where it was dropped, on both screens, on a whole day.
  const landed = await tagOf(page, noteId).getAttribute('title');
  expect(landed).not.toBe('12 maart 1931');
  await expect(tagOf(other.page, noteId)).toHaveAttribute('title', landed!, { timeout: 15_000 });

  await other.context.close();
});

test('an open blad follows a remote move where nothing was touched, and keeps what was', async ({ page, browser }, info) => {
  test.setTimeout(150_000);
  const stamp = `${info.project.name}-${Date.now().toString(36)}`;

  await signIn(page, ...KEEPER);
  await page.goto('/timelines');
  const line = await makeTimeline(page, `Samen in een blad ${stamp}`);
  const noteId = await makeNote(page, line.id, `Het blad ${stamp}`, MARCH_12);
  await page.goto(`/timelines/${line.slug}`);
  await expect(tagOf(page, noteId)).toBeVisible();

  const other = await watcher(browser, `/timelines/${line.slug}`);
  // B opens the blad of that gebeurtenis, and touches nothing in it.
  await tagOf(other.page, noteId).click();
  await other.page.getByTestId('timeline-edit-event').click();
  await expect(other.page.locator('#event-day')).toHaveValue('12');

  // A moves it, three days on, through the API — the same write a drop makes.
  await page.evaluate(
    async ([id, eventId, moment]) => {
      await fetch(`/api/timelines/${id}/events/${eventId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ at: Number(moment) }),
      });
    },
    [line.id, noteId, String(MARCH_12 + 3 * DAY)] as const,
  );

  // B's untouched boxes follow it — and no "Moment opslaan" appears, because
  // nothing in front of B is unsaved.
  await expect(other.page.locator('#event-day')).toHaveValue('15', { timeout: 15_000 });
  await expect(other.page.getByTestId('event-date-save')).toHaveCount(0);
  await expect(other.page.getByTestId('event-date-elsewhere')).toHaveCount(0);

  // Now B types a day of their own, and A moves it again.
  await other.page.locator('#event-day').fill('20');
  await expect(other.page.getByTestId('event-date-save')).toBeVisible();
  await page.evaluate(
    async ([id, eventId, moment]) => {
      await fetch(`/api/timelines/${id}/events/${eventId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ at: Number(moment) }),
      });
    },
    [line.id, noteId, String(MARCH_12 + 6 * DAY)] as const,
  );

  // B keeps their draft, and one line says the other version moved.
  await expect(other.page.getByTestId('event-date-elsewhere')).toBeVisible({ timeout: 15_000 });
  await expect(other.page.getByTestId('event-date-elsewhere')).toHaveText('Iemand anders heeft dit ondertussen veranderd.');
  await expect(other.page.locator('#event-day')).toHaveValue('20');
  await expect(other.page.getByTestId('event-date-save')).toBeVisible();

  await other.context.close();
});

test('a gebeurtenis taken away under an open blad says so', async ({ page, browser }, info) => {
  test.setTimeout(150_000);
  const stamp = `${info.project.name}-${Date.now().toString(36)}`;

  await signIn(page, ...KEEPER);
  await page.goto('/timelines');
  const line = await makeTimeline(page, `Weggehaald ${stamp}`);
  const noteId = await makeNote(page, line.id, `Even hier ${stamp}`, MARCH_12);
  await page.goto(`/timelines/${line.slug}`);
  await expect(tagOf(page, noteId)).toBeVisible();

  const other = await watcher(browser, `/timelines/${line.slug}`);
  await tagOf(other.page, noteId).click();
  await other.page.getByTestId('timeline-edit-event').click();
  await expect(other.page.locator('#event-text')).toBeVisible();

  await page.evaluate(
    async ([id, eventId]) => {
      await fetch(`/api/timelines/${id}/events/${eventId}`, { method: 'DELETE' });
    },
    [line.id, noteId] as const,
  );

  await expect(other.page.getByTestId('event-gone')).toBeVisible({ timeout: 20_000 });
  await expect(other.page.getByTestId('event-gone')).toHaveText('Deze gebeurtenis is weggehaald.');
  await other.page.getByRole('button', { name: 'Sluiten' }).click();
  await expect(other.page.getByTestId('event-gone')).toHaveCount(0);

  await other.context.close();
});

test('somebody typing does not move anybody else\'s view', async ({ page, browser }, info) => {
  test.setTimeout(180_000);
  const stamp = `${info.project.name}-${Date.now().toString(36)}`;

  await signIn(page, ...KEEPER);
  await page.goto('/timelines');
  const line = await makeTimeline(page, `Typen ${stamp}`);
  const noteId = await makeNote(page, line.id, `Aantekening ${stamp}`, MARCH_12);
  await page.goto(`/timelines/${line.slug}`);
  await expect(tagOf(page, noteId)).toBeVisible();

  const other = await watcher(browser, `/timelines/${line.slug}`);
  // B folds the window out and stands somewhere of their own choosing.
  await tagOf(other.page, noteId).click();
  await expect(other.page.getByTestId('timeline-popout')).toBeVisible();
  await other.page.getByTestId('timeline-stage').focus();
  await other.page.keyboard.press('+');
  await other.page.waitForTimeout(400);
  const stood = (await eventOf(other.page, noteId).boundingBox())!.x;

  // A types two hundred characters into the gebeurtenis's own words.
  await tagOf(page, noteId).click();
  await page.getByTestId('timeline-edit-event').click();
  const words = `Het waaide de hele nacht boven Westkapelle ${stamp} `.repeat(4).slice(0, 200);
  await page.locator('#event-text').click();
  await page.keyboard.type(words, { delay: 8 });

  // B sees the words within a few seconds…
  await expect(other.page.getByTestId('timeline-popout')).toContainText('Het waaide de hele nacht', { timeout: 10_000 });
  // …and is still standing exactly where they were, with their window open.
  await expect(other.page.getByTestId('timeline-popout')).toBeVisible();
  const after = (await eventOf(other.page, noteId).boundingBox())!.x;
  expect(Math.abs(after - stood)).toBeLessThan(2);

  await other.context.close();
});

test('a gebeurtenis set in the middle leaves every other tag on its own side', async ({ page, browser }, info) => {
  test.setTimeout(150_000);
  const stamp = `${info.project.name}-${Date.now().toString(36)}`;

  await signIn(page, ...KEEPER);
  await page.goto('/timelines');
  const line = await makeTimeline(page, `Ertussen ${stamp}`);
  const ids: string[] = [];
  for (let i = 0; i < 6; i++) ids.push(await makeNote(page, line.id, `Punt ${i} ${stamp}`, MARCH_12 + i * 20 * DAY));
  await page.goto(`/timelines/${line.slug}`);

  const other = await watcher(browser, `/timelines/${line.slug}`);
  await expect(other.page.locator('.timeline-event')).toHaveCount(6, { timeout: 15_000 });
  const sideOf = async (id: string) => eventOf(other.page, id).getAttribute('data-side');
  const before = await Promise.all(ids.map(sideOf));

  // Straight between the second and the third.
  const inserted = await makeNote(page, line.id, `Ertussen zelf ${stamp}`, MARCH_12 + 30 * DAY);
  // Attached, not "visible": a tag that finds no lane is a bare mark on the
  // axis (§62), and a bare mark is exactly what has no box of its own.
  await expect(eventOf(other.page, inserted)).toHaveCount(1, { timeout: 20_000 });
  await expect(other.page.locator('.timeline-event')).toHaveCount(7);

  const after = await Promise.all(ids.map(sideOf));
  expect(after).toEqual(before);

  await other.context.close();
});

test('a long press on the axis puts a gebeurtenis there', async ({ page, isMobile }, info) => {
  test.skip(!isMobile, "§62: the long press is the phone's double-click");
  test.setTimeout(120_000);
  const stamp = `${info.project.name}-${Date.now().toString(36)}`;

  await signIn(page, ...KEEPER);
  await page.goto('/timelines');
  const line = await makeTimeline(page, `Ingedrukt ${stamp}`);
  await makeNote(page, line.id, `Ankerpunt ${stamp}`, MARCH_12);
  await page.goto(`/timelines/${line.slug}`);
  const stage = page.getByTestId('timeline-stage');
  await expect(stage).toBeVisible();
  // The line under the axis says what to do, in the phone's own words.
  await expect(page.locator('.timeline-count')).toContainText('Houd de as ingedrukt');

  await stage.scrollIntoViewIfNeeded();
  /*
   * Somewhere bare: a press that begins on a tag is that gebeurtenis's, and on
   * a 390 px screen the one tag on this axis sits across the middle of it.
   */
  const spot = await page.evaluate(() => {
    const stageEl = document.querySelector('[data-testid="timeline-stage"]')!;
    const rect = stageEl.getBoundingClientRect();
    for (let dy = 10; dy < rect.height - 10; dy += 10) {
      for (let dx = 10; dx < rect.width - 10; dx += 10) {
        const x = rect.left + dx;
        const y = rect.top + dy;
        const el = document.elementFromPoint(x, y);
        if (el && stageEl.contains(el) && !el.closest('.timeline-event, .timeline-popout, .ink-toolbar')) {
          return { x: Math.round(x), y: Math.round(y) };
        }
      }
    }
    return null;
  });
  expect(spot, 'the axis has somewhere bare to press').not.toBeNull();

  /*
   * A real finger, held still. Playwright's `touchscreen.tap` is instant, and
   * a made-up `pointerdown` has no pointer the browser will capture — so the
   * press goes down the road the device uses, and the stage gets genuine touch
   * pointer events.
   */
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: spot!.x, y: spot!.y }] });
  await page.waitForTimeout(900);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach().catch(() => {});

  const sheet = page.getByRole('dialog', { name: /op / });
  await expect(sheet).toBeVisible({ timeout: 8000 });
  // The moment came with the press: the form prints it instead of asking.
  await sheet.locator('#new-event-query').fill(`Ingedrukt hier ${stamp}`);
  await sheet.getByRole('button', { name: /Losse/ }).click();
  await expect(sheet.getByTestId('new-event-when')).toContainText('1931');
});

test('alles tonen lays the windows out, and a click on the axis shuts one', async ({ page }, info) => {
  test.setTimeout(150_000);
  const stamp = `${info.project.name}-${Date.now().toString(36)}`;

  await signIn(page, ...KEEPER);
  await page.goto('/timelines');
  const line = await makeTimeline(page, `Alles tonen ${stamp}`);
  for (let i = 0; i < 12; i++) await makeNote(page, line.id, `Venster ${i} ${stamp}`, MARCH_12 + i * 4 * DAY);
  await page.goto(`/timelines/${line.slug}`);
  await expect(page.locator('.timeline-event')).toHaveCount(12);

  await page.getByTestId('timeline-toggle-all').click();
  const windows = page.getByTestId('timeline-popout');
  await expect(windows).toHaveCount(12);
  // Let the measuring settle: the lanes are reckoned from real heights.
  await page.waitForTimeout(600);

  /*
   * §62: the lanes, measured. Twelve windows do not fit above a 390 px axis,
   * and they are not asked to: a window with no headroom left opens downward
   * instead and takes its place in the lanes on that side, so "no two windows
   * overlap" holds on a phone as well as on a desk.
   */
  {
    const boxes = await windows.evaluateAll((nodes) =>
      nodes.map((node) => {
        const rect = node.getBoundingClientRect();
        return { x: rect.x, y: rect.y, w: rect.width, h: rect.height };
      }),
    );
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i];
        const b = boxes[j];
        const apart = a.x + a.w <= b.x + 1 || b.x + b.w <= a.x + 1 || a.y + a.h <= b.y + 1 || b.y + b.h <= a.y + 1;
        expect(apart, `window ${i} and window ${j} overlap`).toBe(true);
      }
    }
  }

  // A click on the bare axis shuts the one opened last, not all twelve. The
  // point has to be bare: a press that begins on a window or a tag belongs to
  // that window or that tag, on purpose.
  const stage = page.getByTestId('timeline-stage');
  const box = (await stage.boundingBox())!;
  const spot = await page.evaluate(() => {
    const stageEl = document.querySelector('[data-testid="timeline-stage"]')!;
    const rect = stageEl.getBoundingClientRect();
    for (let dy = 6; dy < rect.height - 6; dy += 8) {
      for (let dx = 6; dx < rect.width - 6; dx += 8) {
        const x = rect.left + dx;
        const y = rect.top + dy;
        const el = document.elementFromPoint(x, y);
        if (el && !el.closest('.timeline-event, .timeline-popout, .ink-toolbar') && stageEl.contains(el)) {
          return { x, y };
        }
      }
    }
    return null;
  });
  expect(spot, 'the axis has somewhere bare to click').not.toBeNull();
  await page.mouse.click(spot!.x, spot!.y);
  await expect(windows).toHaveCount(11);
  await page.mouse.click(spot!.x, spot!.y);
  await expect(windows).toHaveCount(10);
  expect(box.width).toBeGreaterThan(0);

  // And the button still shuts the lot.
  await page.getByTestId('timeline-toggle-all').click();
  await expect(windows).toHaveCount(12);
  await page.getByTestId('timeline-toggle-all').click();
  await expect(windows).toHaveCount(0);
});
