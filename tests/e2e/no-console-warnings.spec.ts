import { expect, test, type ConsoleMessage, type Page } from '@playwright/test';
import { signIn } from './helpers';

/**
 * The guard that should have caught the missing keys on §11's page blocks.
 *
 * A React warning is written to the console and nothing else: the page renders,
 * every other assertion passes, and the suite goes green while the browser is
 * quietly complaining. So this walks the screens that matter and fails on
 * anything React says — a missing key, a bad nesting, a hydration mismatch —
 * which are exactly the mistakes that survive a functional test.
 *
 * **Run it with `E2E_DEV=1` to get the whole of its value.** React strips its
 * warnings from a production build, and the default run builds for production,
 * so in that mode this catches page errors and failed requests but not a
 * missing key. The key warning these tests were written for is only visible
 * against `next dev`, which is exactly why it went unnoticed in the first place.
 */

/** Noise from the browser or the dev tooling rather than the app. */
const IGNORE = [
  /favicon/i,
  /Download the React DevTools/i,
  /net::ERR_/i,
  // Next's own notice when a file changes under a running dev server. It says
  // something about the edit, never about the page.
  /\[Fast Refresh\]/,
];

function watch(page: Page): string[] {
  const complaints: string[] = [];
  const record = (message: ConsoleMessage) => {
    const text = message.text();
    if (IGNORE.some((pattern) => pattern.test(text))) return;
    if (message.type() === 'error' || message.type() === 'warning' || /^Warning:/.test(text)) {
      complaints.push(`[${message.type()}] ${text}`);
    }
  };
  page.on('console', record);
  page.on('pageerror', (error) => complaints.push(`[pageerror] ${error.message}`));
  return complaints;
}

test('the screens the archive is made of say nothing to the console', async ({ page }, testInfo) => {
  const complaints = watch(page);

  await signIn(page, 'Keeper', 'abbeytower34');

  // An entry page of every soort, since §11 lets each one be a different shape
  // — the missing keys only appeared on a page whose blocks came back as slots.
  await page.goto('/wiki');
  for (const path of ['/', '/wiki', '/wiki/faction', '/wiki/location', '/cases', '/boards', '/search']) {
    await page.goto(path);
    await page.waitForLoadState('networkidle');
  }

  for (const slug of ['de-schorre', 'the-ahnenerbe-party', 'jacob-den-hollander']) {
    await page.goto(`/e/${slug}`);
    await page.waitForLoadState('networkidle');
  }

  // Admin last: the type editor renders a block row per block per soort, which
  // is the densest list of keyed things in the app.
  if (testInfo.project.name !== 'phone') {
    await page.goto('/admin');
    for (const tab of ['Soorten fiches', 'Woorden', 'Prullenbak', 'Logboek']) {
      await page.getByRole('tab', { name: tab }).click();
      await page.waitForTimeout(300);
    }
  }

  expect(complaints, `the browser complained:\n${complaints.join('\n')}`).toEqual([]);
});

test('a board says nothing either, alone or with someone else on it', async ({ page, browser }) => {
  const complaints = watch(page);

  await signIn(page, 'Keeper', 'abbeytower34');
  await page.goto('/boards');
  await page.getByRole('button', { name: 'Nieuw prikbord' }).click();
  await page.waitForURL('**/b/**');

  await page.getByLabel('Kaart toevoegen').fill('De Schorre');
  await page.locator('.suggest-item').filter({ hasNotText: 'als notitie' }).first().click();
  await expect(page.locator('.board-card').first()).toBeVisible();

  // Two people on one wall: the presence strip and the held-card layer are both
  // lists, and both are drawn from something another browser sent.
  const context = await browser.newContext();
  const other = await context.newPage();
  await signIn(other, 'Keeper', 'abbeytower34');
  await other.goto(page.url());
  await other.locator('.board-card').first().click();
  await expect(page.locator('.board-held')).toHaveCount(1, { timeout: 15_000 });
  await context.close();

  expect(complaints, `the browser complained:\n${complaints.join('\n')}`).toEqual([]);
});
