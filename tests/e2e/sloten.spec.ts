import { expect, test, type Browser, type Page } from '@playwright/test';
import { signIn, signUp } from './helpers';

/**
 * §89, ronde 50: de sloten — asked from the outside, the way somebody who wants
 * in would ask. The unit tests in `tests/unit/sloten.test.ts` ask the same
 * questions of the services; these ask them of the running app, through the
 * middleware, the pages and the real cookies.
 */

const KEEPER = { name: 'Keeper', password: 'abbeytower34' };

async function newPlayer(browser: Browser, stamp: string, label: string): Promise<{ page: Page; name: string }> {
  const context = await browser.newContext();
  const page = await context.newPage();
  const name = `${label} ${stamp}`;
  await signUp(page, name, 'kelderluik9');
  return { page, name };
}

test.describe('§89: de sloten', () => {
  test.skip(({ isMobile }) => isMobile, 'The locks are the same at every width; one proof is enough.');

  test('a signed-out browser only ever reaches the two doors', async ({ page, request }) => {
    for (const path of ['/', '/wiki/alles', '/admin', '/e/westkapelle-lighthouse', '/search', '/keeper']) {
      await page.goto(path);
      await expect(page, path).toHaveURL(/\/login$/);
    }
    await page.goto('/signup');
    await expect(page).toHaveURL(/\/signup$/);
    for (const path of ['/api/entries/x', '/api/search?q=a', '/api/users', '/api/live/site?c=x', '/api/assets/x']) {
      const response = await request.get(path);
      expect(response.status(), path).toBe(401);
    }
  });

  test('every answer carries the security headers, and none advertises the framework', async ({ request }) => {
    const response = await request.get('/login');
    const headers = response.headers();
    expect(headers['content-security-policy']).toContain("img-src 'self'");
    expect(headers['content-security-policy']).toContain("frame-ancestors 'none'");
    expect(headers['x-content-type-options']).toBe('nosniff');
    expect(headers['x-powered-by']).toBeUndefined();
  });

  test('a write from another site is refused before it reaches a route', async ({ page }) => {
    await signIn(page, KEEPER.name, KEEPER.password);
    const response = await page.request.post('/api/entries', {
      headers: { Origin: 'https://evil.example' },
      data: { name: 'Van buiten', typeSlug: 'character' },
    });
    expect(response.status()).toBe(403);
  });

  test('the side switch sends nobody off the archive', async ({ page }) => {
    await signIn(page, KEEPER.name, KEEPER.password);
    const response = await page.request.get('/api/keeper/flip?side=player&to=/%5Cevil.example', { maxRedirects: 0 });
    expect(response.status()).toBe(303);
    expect(response.headers()['location']).toBe('/');
    const raw = await page.request.get('/api/keeper/flip?side=player&to=/\\evil.example', { maxRedirects: 0 });
    expect(raw.headers()['location']).toBe('/');
  });

  test('an @ does not tell a speler that a Keeper-only name exists', async ({ page, browser }, testInfo) => {
    const stamp = Date.now().toString(36);
    const secret = `Dokter Verhoeven ${stamp}`;
    await signIn(page, KEEPER.name, KEEPER.password);
    const made = await page.request.post('/api/entries', {
      data: { name: secret, typeSlug: 'character', keeperOnly: true },
    });
    expect(made.ok()).toBe(true);
    expect((await made.json()).entry.visibility).toBe('keeper');

    const { page: player } = await newPlayer(browser, `${testInfo.project.name}-${stamp}`, 'Speler');
    const asked = await player.request.post('/api/mentions', { data: { texts: [`@${secret}`, `@Niemand ${stamp}`] } });
    const body = (await asked.json()) as { texts: { spans: unknown[] }[] };
    expect(body.texts.map((t) => t.spans)).toEqual([[], []]);
    expect(JSON.stringify(body)).not.toContain('Verhoeven');
  });

  test('a new password closes every other session of the account', async ({ browser }, testInfo) => {
    const stamp = `${testInfo.project.name}-${Date.now().toString(36)}`;
    const { page: first, name } = await newPlayer(browser, stamp, 'Tweemaal');
    const secondContext = await browser.newContext();
    const second = await secondContext.newPage();
    await signIn(second, name, 'kelderluik9');

    await first.goto('/you');
    await first.getByLabel('Huidig wachtwoord').fill('kelderluik9');
    await first.getByLabel('Nieuw wachtwoord').fill('zoutwater12');
    await first.getByRole('button', { name: 'Wachtwoord wijzigen' }).click();
    await expect(first.getByText(/Wachtwoord gewijzigd/)).toBeVisible();

    // This window stays in; the other one is out.
    await first.goto('/you');
    await expect(first).toHaveURL(/\/you$/);
    await second.goto('/');
    await expect(second).toHaveURL(/\/login$/);
  });

  test('a Keeper does not set another Keeper’s password or switch them off', async ({ page, browser }, testInfo) => {
    const stamp = `${testInfo.project.name}-${Date.now().toString(36)}`;
    const { name } = await newPlayer(browser, stamp, 'Tweede Keeper');
    await signIn(page, KEEPER.name, KEEPER.password);
    await page.goto('/admin');
    const row = page.locator(`li[data-username="${name}"]`);
    await expect(row.getByRole('button', { name: 'Nieuw wachtwoord instellen' })).toBeVisible();
    await row.getByRole('button', { name: 'Tot Keeper maken' }).click();
    await expect(row.getByRole('button', { name: 'Als Keeper afzetten' })).toBeVisible();
    // Both controls are gone for another Keeper — and the server refuses the
    // same thing if it is posted by hand (`setPasswordAction`, §89).
    await expect(row.getByRole('button', { name: 'Nieuw wachtwoord instellen' })).toHaveCount(0);
    await expect(row.getByRole('button', { name: 'Uitschakelen' })).toHaveCount(0);
    // Put the table back.
    await row.getByRole('button', { name: 'Als Keeper afzetten' }).click();
    await expect(row.getByRole('button', { name: 'Tot Keeper maken' })).toBeVisible();
  });

  test('guessing at one name is stopped, whatever address the guesser claims', async ({ browser }, testInfo) => {
    const stamp = `${testInfo.project.name}-${Date.now().toString(36)}`;
    const { name } = await newPlayer(browser, stamp, 'Doelwit');
    const context = await browser.newContext();
    const guesser = await context.newPage();
    let last = '';
    for (let i = 0; i < 11; i++) {
      await guesser.setExtraHTTPHeaders({ 'X-Forwarded-For': `10.0.${i}.1` });
      await guesser.goto('/login');
      await guesser.getByLabel('Naam', { exact: true }).fill(name);
      await guesser.getByLabel('Wachtwoord').fill(`fout-${i}-wachtwoord`);
      await guesser.getByRole('button', { name: 'Inloggen' }).click();
      const note = guesser.locator('.error-note, [role="alert"]').first();
      await expect(note).toBeVisible();
      last = (await note.textContent()) ?? '';
    }
    expect(last).toContain('Te veel pogingen');
  });
});
