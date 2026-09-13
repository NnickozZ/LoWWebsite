import { expect, test, type Page } from '@playwright/test';
import { becomeInvestigator, editCase, inviteCode, signIn } from './helpers';

/**
 * §21: live is every page.
 *
 * Everything is asserted on a browser that is never reloaded. A list has to
 * grow when someone else adds to it; two people on one page have to see each
 * other; a name typed by two people at once has to end up whole for both and
 * in the archive; and one person's hand has to be visible to the other on a
 * page that is neither a board nor a map.
 */

async function signUpAs(page: Page, name: string) {
  await page.goto('/signup');
  await page.getByLabel('Uitnodigingscode').fill(inviteCode());
  await page.getByLabel('Naam', { exact: true }).fill(name);
  await page.getByLabel('Wachtwoord', { exact: true }).fill('onderzeeboot');
  await page.getByLabel('Wachtwoord nogmaals').fill('onderzeeboot');
  await page.getByRole('button', { name: 'Account aanmaken' }).click();
  await page.waitForURL('**/');
}

/*
 * §18b: filing a dossier and typing its name are both writing, so the player
 * who does either needs an onderzoeker first — made the way a real player
 * makes theirs. The name carries the account's inside it, because the strip
 * and the tag on a field print the onderzoeker.
 */
async function signUpWriting(page: Page, name: string) {
  await signUpAs(page, name);
  await becomeInvestigator(page, `Onderzoeker ${name}`);
}

/** Creates a dossier through the API, as the signed-in browser. Returns its path. */
async function newCase(page: Page, name: string): Promise<{ id: string; path: string }> {
  const created = await page.evaluate(async (caseName) => {
    const response = await fetch('/api/cases', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: caseName }),
    });
    return (await response.json()) as { id?: string; slug?: string; case?: { id: string; slug: string } };
  }, name);
  const record = created.case ?? (created as { id: string; slug: string });
  return { id: record.id, path: `/c/${record.slug}` };
}

test('a list grows on the other screen, people see each other, and a name typed by two is whole', async ({ page, browser }, info) => {
  test.setTimeout(150_000);
  const stamp = `${info.project.name}-${Date.now().toString(36)}`;

  await signIn(page, 'Keeper', 'abbeytower34');
  await page.goto('/cases');
  await expect(page.getByTestId('live-strip')).toHaveClass(/live-strip-live/, { timeout: 15_000 });

  const otherCtx = await browser.newContext();
  const other = await otherCtx.newPage();
  await signUpWriting(other, `Aagje ${stamp}`);

  // The player files a new dossier; the Keeper's list, never reloaded, shows it.
  const { path } = await newCase(other, `Zaak ${stamp}`);
  await expect(page.getByRole('link', { name: new RegExp(`Zaak ${stamp}`) })).toBeVisible({ timeout: 10_000 });

  // Both open it: each sees the other on the strip.
  await page.goto(path);
  await other.goto(path);
  // §23: a dossier has two faces, and since round 13 *everybody* lands on the
  // reading one — the Keeper as much as the player. Typing into it is the
  // thing under test, so both ask for the other face.
  await editCase(page);
  await editCase(other);
  await expect(page.getByTestId('live-strip').locator('.board-person')).toHaveCount(1, { timeout: 15_000 });
  await expect(other.getByTestId('live-strip').locator('.board-person')).toHaveCount(1, { timeout: 15_000 });

  // The name is a shared field: what one types, the other sees as it is typed.
  const keeperName = page.locator('#case-name');
  const playerName = other.locator('#case-name');
  await expect(keeperName).toHaveValue(`Zaak ${stamp}`);
  await keeperName.click();
  await page.keyboard.press('End');
  await page.keyboard.type(' — heropend');
  await expect(playerName).toHaveValue(`Zaak ${stamp} — heropend`, { timeout: 5000 });

  // And both at once: the Keeper at the end, the player at the start. Nobody's letters are lost.
  await playerName.click();
  await other.keyboard.press('Home');
  await Promise.all([other.keyboard.type('Dossier: '), page.keyboard.type('!')]);
  const whole = `Dossier: Zaak ${stamp} — heropend!`;
  await expect(keeperName).toHaveValue(whole, { timeout: 5000 });
  await expect(playerName).toHaveValue(whole, { timeout: 5000 });
  // The person typing is named on the field for the other.
  await expect(page.locator('.live-field-tag').first()).toContainText('Aagje', { timeout: 5000 });

  // Persisted: a fresh browser reads the merged name, and the list shows it.
  const freshCtx = await browser.newContext();
  const fresh = await freshCtx.newPage();
  await signIn(fresh, 'Keeper', 'abbeytower34');
  await expect
    .poll(
      async () => {
        await fresh.goto(path);
        // §22: this browser arrives reading too.
        await editCase(fresh);
        return fresh.locator('#case-name').inputValue();
      },
      { timeout: 15_000 },
    )
    .toBe(whole);

  // The one-liner is a shared field too, in a textarea.
  const lead = other.locator('#case-summary');
  await lead.click();
  await other.keyboard.type('Wie stal de klok?');
  await expect(page.locator('#case-summary')).toHaveValue('Wie stal de klok?', { timeout: 5000 });

  await freshCtx.close();
  await otherCtx.close();
});

test('the other hand is on the page', async ({ page, browser, isMobile }, info) => {
  test.skip(isMobile, 'a touch screen has no pointer to show');
  test.setTimeout(120_000);
  const stamp = `${info.project.name}-${Date.now().toString(36)}`;

  await signIn(page, 'Keeper', 'abbeytower34');
  const { path } = await newCase(page, `Handen ${stamp}`);
  await page.goto(path);

  const otherCtx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const other = await otherCtx.newPage();
  await signUpAs(other, `Bram ${stamp}`);
  await other.goto(path);
  await expect(other.getByTestId('live-strip').locator('.board-person')).toHaveCount(1, { timeout: 15_000 });

  // The Keeper moves over the page; Bram sees a named arrow.
  const main = page.locator('main.main');
  const box = (await main.boundingBox())!;
  for (let i = 0; i < 6; i++) {
    await page.mouse.move(box.x + 200 + i * 40, box.y + 200 + i * 20);
    await page.waitForTimeout(80);
  }
  const arrow = other.locator('.live-cursor');
  await expect(arrow).toHaveCount(1, { timeout: 8000 });
  await expect(arrow.locator('.board-cursor-name')).toHaveText('Keeper');
  // Nobody draws their own hand.
  await expect(page.locator('.live-cursor')).toHaveCount(0);

  await otherCtx.close();
});

/**
 * §60: one line per browser.
 *
 * A browser opens about six connections to one host over HTTP/1.1, and an open
 * stream holds one of them for ever. Before this round every tab of the archive
 * held its own, so the seventh navigation waited for a socket that was never
 * coming — "a player could not switch tab until every window of the site was
 * closed". The tabs now elect a leader with the Web Locks API and relay frames
 * over a `BroadcastChannel`, so eight tabs cost one socket.
 *
 * Everything here is one browser *context*, which is the whole point: a lock
 * and a channel are per profile, so two contexts would prove nothing.
 */
test('eight tabs share one line, a ninth still navigates, and closing the leader keeps the rest live', async ({ browser }, info) => {
  test.setTimeout(180_000);
  const stamp = `${info.project.name}-${Date.now().toString(36)}`;

  const ctx = await browser.newContext();
  const leader = await ctx.newPage();
  await signIn(leader, 'Keeper', 'abbeytower34');
  await leader.goto('/cases');
  await expect(leader.getByTestId('live-strip')).toBeVisible({ timeout: 15_000 });

  const tabs = [leader];
  for (let i = 0; i < 7; i++) {
    const tab = await ctx.newPage();
    await tab.goto('/cases');
    await expect(tab.getByTestId('live-strip')).toBeVisible({ timeout: 15_000 });
    tabs.push(tab);
  }

  // The ninth. This is the assertion the whole round is about: with a socket
  // per tab it waits for one to fall free, which it never does.
  const ninth = await ctx.newPage();
  const startedAt = Date.now();
  await ninth.goto('/cases');
  await expect(ninth.locator('main.main')).toBeVisible({ timeout: 15_000 });
  expect(Date.now() - startedAt).toBeLessThan(5000);
  tabs.push(ninth);

  // Nine tabs, nine people: a tab that gave up its socket did not give up its
  // place on the strip. Six avatars and a count of the rest.
  const strip = ninth.getByTestId('live-strip');
  await expect(strip.locator('.board-person')).toHaveCount(7, { timeout: 30_000 });
  await expect(strip.locator('.board-person-more')).toHaveText('+2', { timeout: 30_000 });

  // Close the tab holding the line. The lock releases, the next tab in the
  // queue takes it, opens a line and everybody says everything again — so a
  // change made on one of the survivors still reaches another.
  await leader.close();
  await tabs[8].bringToFront();
  const name = `Na de leider ${stamp}`;
  await newCase(tabs[1], name);
  await expect(tabs[8].getByRole('link', { name: new RegExp(name) })).toBeVisible({ timeout: 20_000 });

  await ctx.close();
});

/**
 * §60: a line that never gives up.
 *
 * The stream is refused, the strip says so, the archive moves under the tab
 * while it is deaf — and when the line comes back the page catches up by
 * itself. The catching up is the part that used to be missing: `hello` replays
 * the watch list and fires a `changed` for every key, and that replay is a
 * *resync*, which is never held behind the own-write mute.
 */
test('the line drops, says so, comes back, and brings what was missed', async ({ page, browser }, info) => {
  test.setTimeout(150_000);
  const stamp = `${info.project.name}-${Date.now().toString(36)}`;

  let refuse = true;
  await page.route('**/api/live/site**', async (route) => {
    if (refuse && route.request().method() === 'GET') return route.abort('failed');
    return route.fallback();
  });

  await signIn(page, 'Keeper', 'abbeytower34');
  await page.goto('/cases');
  // No line: the strip says so rather than pretending.
  await expect(page.getByTestId('live-strip')).toHaveClass(/live-strip-offline/, { timeout: 20_000 });

  // The archive moves while this tab is deaf.
  const otherCtx = await browser.newContext();
  const other = await otherCtx.newPage();
  await signUpWriting(other, `Doof ${stamp}`);
  await newCase(other, `Tijdens de stilte ${stamp}`);
  await expect(page.getByRole('link', { name: new RegExp(`Tijdens de stilte ${stamp}`) })).toHaveCount(0);

  // Let the line back up. It comes back on its own — nothing is reloaded — and
  // the dossier filed during the gap is on the list within moments of it.
  refuse = false;
  await expect(page.getByTestId('live-strip')).toHaveClass(/live-strip-live/, { timeout: 45_000 });
  await expect(page.getByRole('link', { name: new RegExp(`Tijdens de stilte ${stamp}`) })).toBeVisible({
    timeout: 20_000,
  });

  await otherCtx.close();
});

test('a new artikel reaches the wiki on another screen', async ({ page, browser }, info) => {
  test.setTimeout(120_000);
  const stamp = `${info.project.name}-${Date.now().toString(36)}`;

  await signIn(page, 'Keeper', 'abbeytower34');
  await page.goto('/wiki');
  await expect(page.getByTestId('live-strip')).toHaveClass(/live-strip-live/, { timeout: 15_000 });

  const otherCtx = await browser.newContext();
  const other = await otherCtx.newPage();
  await signUpAs(other, `Bram ${stamp}`);
  const name = `Vuurtoren ${stamp}`;
  const status = await other.evaluate(async (entryName) => {
    const response = await fetch('/api/entries', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: entryName, typeSlug: 'location' }),
    });
    return response.status;
  }, name);
  expect(status).toBe(200);

  // The Keeper's wiki, never reloaded, has the card — and the soort's count moved with it.
  await expect(page.getByRole('link', { name: new RegExp(name) })).toBeVisible({ timeout: 10_000 });
  await otherCtx.close();
});
