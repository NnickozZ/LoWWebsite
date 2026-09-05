import { expect, test, type Page } from '@playwright/test';
import { inviteCode, signIn } from './helpers';

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
  await page.getByLabel('Naam').fill(name);
  await page.getByLabel('Wachtwoord', { exact: true }).fill('onderzeeboot');
  await page.getByLabel('Wachtwoord nogmaals').fill('onderzeeboot');
  await page.getByRole('button', { name: 'Account aanmaken' }).click();
  await page.waitForURL('**/');
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
  await signUpAs(other, `Aagje ${stamp}`);

  // The player files a new dossier; the Keeper's list, never reloaded, shows it.
  const { path } = await newCase(other, `Zaak ${stamp}`);
  await expect(page.getByRole('link', { name: new RegExp(`Zaak ${stamp}`) })).toBeVisible({ timeout: 10_000 });

  // Both open it: each sees the other on the strip.
  await page.goto(path);
  await other.goto(path);
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
