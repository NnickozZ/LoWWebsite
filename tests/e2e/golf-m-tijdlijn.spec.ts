import { expect, test, type CDPSession, type Page } from '@playwright/test';
import { editCanvas, signIn } from './helpers';

/**
 * Golf M op de tijdlijn.
 *
 *  C1. Nick: "als ik iets van links naar rechts langs een andere gebeurtenis
 *      sleep, springt het terug". Elke stap van een sleep sorteerde de lijst
 *      opnieuw, React verplaatste de tag in de DOM, de browser nam de pointer
 *      capture af en `onLostPointerCapture` brak de sleep af. Hier: langs één,
 *      twee en alle buren, beide kanten op, met de muis en (op de telefoon)
 *      met een vinger — en de tag blijft onderweg in de hand.
 *  C2. Een uitgeklapt venster waarvan de tag uit beeld is geschoven, staat
 *      niet meer tegen de rand geplakt; het komt terug als je terugschuift.
 */

const KEEPER = ['Keeper', 'abbeytower34'] as const;
const DAY = (d: number) => Math.floor(Date.UTC(1931, 2, d) / 1000);
const TITLE = (d: number) => `${d} maart 1931`;

async function timelineWith(page: Page, stamp: string, days: Record<string, number>) {
  const made = await page.request.post('/api/timelines', { data: { name: `M tijdlijn ${stamp}`, scale: 'day' } });
  expect(made.ok()).toBe(true);
  const { timeline } = (await made.json()) as { timeline: { id: string; slug: string } };
  for (const [name, day] of Object.entries(days)) {
    const ev = await page.request.post(`/api/timelines/${timeline.id}/events`, {
      data: { kind: 'note', name, text: '', at: DAY(day), precision: 'day' },
    });
    expect(ev.ok()).toBe(true);
  }
  await page.goto(`/timelines/${timeline.slug}`);
  await expect(page.getByTestId('timeline-event')).toHaveCount(Object.keys(days).length, { timeout: 20_000 });
  return timeline;
}

const eventOf = (page: Page, name: string) => page.getByTestId('timeline-event').filter({ has: page.locator('.timeline-tag', { hasText: name }) });
const tagOf = (page: Page, name: string) => eventOf(page, name).locator('.timeline-tag');

/** Where a gebeurtenis stands on the screen: the middle of its tag is its x. */
async function xOf(page: Page, name: string, timeout = 10_000): Promise<number> {
  const box = await tagOf(page, name).boundingBox({ timeout });
  if (!box) throw new Error(`${name} is not drawn`);
  return box.x + box.width / 2;
}

async function fitAll(page: Page) {
  const fit = page.getByRole('button', { name: 'Alles in beeld' }).first();
  if (await fit.isVisible().catch(() => false)) await fit.click();
  await page.waitForTimeout(300);
}

async function touch(cdp: CDPSession, type: 'touchStart' | 'touchMove' | 'touchEnd', x: number, y: number) {
  await cdp.send('Input.dispatchTouchEvent', {
    type,
    touchPoints: type === 'touchEnd' ? [] : [{ x: Math.round(x), y: Math.round(y), id: 1, radiusX: 4, radiusY: 4, force: 1 }],
  });
}

/**
 * Carry `name` to screen x `toX`, and assert on the way — past every
 * neighbour — that the hand still has it (`timeline-event-dragging`). The
 * jump-back was exactly the class going before the hand let go.
 */
async function carry(page: Page, name: string, toX: number, finger: CDPSession | null) {
  const tag = tagOf(page, name);
  const box = (await tag.boundingBox())!;
  const fromX = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  const hit = await page.evaluate(([x, yy]) => document.elementFromPoint(x, yy)?.closest('.timeline-tag')?.textContent ?? null, [fromX, y]);
  expect(hit, 'the press lands on the tag it means').toContain(name);
  const steps = 24;
  /*
   * The cause, watched directly: React moving the carried element in the DOM
   * (a remove and an insert) is what took its pointer capture away.
   */
  const id = await eventOf(page, name).getAttribute('data-event-id');
  await page.evaluate((carried) => {
    const w = window as unknown as { __moved: number; __watch?: MutationObserver };
    w.__moved = 0;
    w.__watch?.disconnect();
    w.__watch = new MutationObserver((list) => {
      for (const m of list) m.removedNodes.forEach((n) => (n as HTMLElement).dataset?.eventId === carried && (w.__moved += 1));
    });
    w.__watch.observe(document.querySelector('[data-testid="timeline-stage"]')!, { childList: true });
  }, id);
  if (finger) await touch(finger, 'touchStart', fromX, y);
  else {
    await page.mouse.move(fromX, y);
    await page.mouse.down();
  }
  for (let i = 1; i <= steps; i += 1) {
    const x = fromX + ((toX - fromX) * i) / steps;
    if (finger) await touch(finger, 'touchMove', x, y);
    else await page.mouse.move(x, y);
    if (i > 2 && i % 4 === 0) {
      await expect(eventOf(page, name), `still carried at step ${i}`).toHaveClass(/timeline-event-dragging/, { timeout: 2000 });
    }
  }
  /*
   * Counted before the hand lets go: once it is off, the stage is drawn in
   * time order again and React may well move the tag then — that is meant.
   */
  const moved = await page.evaluate((carried) => {
    const w = window as unknown as { __moved: number; __watch: MutationObserver };
    for (const m of w.__watch.takeRecords()) m.removedNodes.forEach((n) => (n as HTMLElement).dataset?.eventId === carried && (w.__moved += 1));
    w.__watch.disconnect();
    return w.__moved;
  }, id);
  if (finger) await touch(finger, 'touchEnd', toX, y);
  else await page.mouse.up();
  await expect(eventOf(page, name)).not.toHaveClass(/timeline-event-dragging/);
  expect(moved, 'the carried tag never left the DOM while it was carried').toBe(0);
}

test('C1: een gebeurtenis gaat langs één, twee en alle buren, beide kanten op', async ({ page }, info) => {
  test.setTimeout(150_000);
  const stamp = `${info.project.name}-${Date.now().toString(36)}`;
  await signIn(page, ...KEEPER);
  // X op de 10e; de buren om de twee dagen.
  await timelineWith(page, stamp, { Xander: 10, Anna: 12, Bert: 14, Cor: 16, Dirk: 18 });
  await editCanvas(page);
  await fitAll(page);
  const finger = info.project.name === 'phone' ? await page.context().newCDPSession(page) : null;

  // 1. Naar rechts, langs één buur: tussen Anna en Bert, dus de 13e.
  let target = ((await xOf(page, 'Anna')) + (await xOf(page, 'Bert'))) / 2;
  await carry(page, 'Xander', target, finger);
  await expect(tagOf(page, 'Xander')).toHaveAttribute('title', TITLE(13));

  // 2. Naar rechts, langs twee: tussen Cor en Dirk, dus de 17e.
  target = ((await xOf(page, 'Cor')) + (await xOf(page, 'Dirk'))) / 2;
  await carry(page, 'Xander', target, finger);
  await expect(tagOf(page, 'Xander')).toHaveAttribute('title', TITLE(17));

  // 3. Terug naar links, langs alle vier: vóór Anna, de 11e.
  const anna = await xOf(page, 'Anna');
  const perDay = ((await xOf(page, 'Bert')) - anna) / 2;
  await carry(page, 'Xander', anna - perDay, finger);
  await expect(tagOf(page, 'Xander')).toHaveAttribute('title', TITLE(11));

  // 4. En een tweede tag naar rechts, langs twee: Anna naar de 17e.
  target = ((await xOf(page, 'Cor')) + (await xOf(page, 'Dirk'))) / 2;
  await carry(page, 'Anna', target, finger);
  await expect(tagOf(page, 'Anna')).toHaveAttribute('title', TITLE(17));

  // Wat de hand liet staan, is ook wat het archief bewaarde.
  await page.goto(new URL(page.url()).pathname);
  await expect(tagOf(page, 'Xander')).toHaveAttribute('title', TITLE(11), { timeout: 20_000 });
  await expect(tagOf(page, 'Anna')).toHaveAttribute('title', TITLE(17));
});

test('C2: een venster waarvan de tag uit beeld is, verdwijnt en komt terug', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'op een telefoon staan de vensters in de peek, niet bij hun tag');
  test.setTimeout(120_000);
  const stamp = `${info.project.name}-${Date.now().toString(36)}`;
  await signIn(page, ...KEEPER);
  await timelineWith(page, stamp, { Vroeg: 10, Laat: 18 });
  await fitAll(page);

  const popout = page.getByTestId('timeline-popout');
  const tag = tagOf(page, 'Vroeg');
  await expect(async () => {
    if ((await popout.count()) === 0) await tag.click();
    await expect(popout).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: 15_000 });
  await expect(popout).toHaveAttribute('aria-label', 'Vroeg');

  // Bare paper near the foot of the stage, clear of every tag.
  const stage = page.getByTestId('timeline-stage');
  const sb = (await stage.boundingBox())!;
  const start = { x: sb.x + sb.width * 0.5, y: sb.y + sb.height - 20 };
  const bare = await page.evaluate(({ x, y }) => {
    const el = document.elementFromPoint(x, y);
    return Boolean(el?.closest('[data-testid="timeline-stage"]')) && !el?.closest('.timeline-event, .timeline-cluster, button, a');
  }, start);
  expect(bare, 'the pan starts on bare paper').toBe(true);

  const pan = async (dx: number) => {
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(start.x + dx / 2, start.y, { steps: 6 });
    await page.mouse.move(start.x + dx, start.y, { steps: 6 });
    await page.mouse.up();
  };

  // Schuif Vroeg ver naar links, uit beeld: geen venster tegen de rand.
  await pan(-sb.width * 0.8);
  const vroegX = await xOf(page, 'Vroeg', 2000).catch(() => -9999);
  expect(vroegX, 'the tag really is off the glass').toBeLessThan(sb.x - 60);
  await expect(popout).toHaveCount(0);
  // Het venster is niet dicht: het staat nog in het adres (`?event=`).
  expect(new URL(page.url()).searchParams.get('event')).not.toBeNull();

  // En terug: het venster staat er weer, bij zijn tag.
  await pan(sb.width * 0.8);
  await expect(popout).toBeVisible();
  await expect(popout).toHaveAttribute('aria-label', 'Vroeg');
  const pb = (await popout.boundingBox())!;
  const tx = await xOf(page, 'Vroeg');
  expect(Math.abs(pb.x + pb.width / 2 - tx), 'the window hangs over its tag again').toBeLessThan(pb.width);
});
