import { expect, test } from '@playwright/test';
import { signIn } from './helpers';

/**
 * §90, ronde 51 (`schrijven`): de deuren. What only a browser can say — where a
 * link lands, where the caret is. The pure halves are in
 * `tests/unit/ronde-51-schrijven.test.ts`.
 */

const KEEPER = { name: 'Keeper', password: 'abbeytower34' };

test('B21: a tag chip on an artikel opens its soort’s list, filtered on that tag', async ({ page }, info) => {
  const stamp = `${info.project.name}-${Date.now().toString(36)}`;
  const tag = `haven${Date.now().toString(36)}`;
  const name = `Havenmeester ${stamp}`;

  await signIn(page, KEEPER.name, KEEPER.password);
  const made = await page.request.post('/api/entries', { data: { name, typeSlug: 'character', tags: [tag] } });
  expect(made.ok()).toBe(true);
  const { entry } = (await made.json()) as { entry: { slug: string } };

  // Reading, the tag is a row of the infobox. §92: on a phone that box is
  // folded while reading too, so unfold it first — as a thumb would.
  await page.goto(`/e/${entry.slug}`);
  const folded = page.locator('details#block-info:not([open]) > summary');
  if (await folded.count()) await folded.click();
  const chip = page.locator('.infobox-tags a.tag', { hasText: tag });
  await expect(chip).toHaveAttribute('href', `/wiki/character?tag=${tag}`);
  await chip.click();
  await page.waitForURL((url) => url.pathname === '/wiki/character' && url.searchParams.get('tag') === tag);
  // The list is filtered: our artikel is on it.
  await expect(page.getByRole('main').getByText(name).first()).toBeVisible({ timeout: 15_000 });

  // A link saved while the chips still pointed at the voordeur is sent on.
  await page.goto(`/wiki?tag=${tag}`);
  await page.waitForURL((url) => url.pathname === '/wiki/alles' && url.searchParams.get('tag') === tag);
  await expect(page.getByRole('main').getByText(name).first()).toBeVisible({ timeout: 15_000 });
});

test('S15: a deep link survives the login — and only onto this archive', async ({ browser }) => {
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto('/wiki/alles?sort=name');
  await expect(page).toHaveURL(/\/login\?next=/);
  expect(new URL(page.url()).searchParams.get('next')).toBe('/wiki/alles?sort=name');
  await page.getByLabel('Naam', { exact: true }).fill(KEEPER.name);
  await page.getByLabel('Wachtwoord').fill(KEEPER.password);
  await page.getByRole('button', { name: 'Inloggen' }).click();
  await page.waitForURL((url) => url.pathname === '/wiki/alles' && url.searchParams.get('sort') === 'name');

  // Out again, and a `next` that points off the archive is sent home.
  await context.clearCookies();
  await page.goto('/login?next=//evil.example/x');
  await page.getByLabel('Naam', { exact: true }).fill(KEEPER.name);
  await page.getByLabel('Wachtwoord').fill(KEEPER.password);
  await page.getByRole('button', { name: 'Inloggen' }).click();
  await page.waitForURL((url) => url.pathname === '/');
  expect(new URL(page.url()).hostname).not.toBe('evil.example');
  await context.close();
});

test('S17 + S16: a failed login puts the caret in the password box, under the archive’s own name', async ({ page }) => {
  await page.goto('/login');
  await expect(page.getByRole('heading', { level: 1 })).not.toHaveText('Case Files');
  await page.getByLabel('Naam', { exact: true }).fill(`Niemand ${Math.random().toString(36).slice(2, 8)}`);
  await page.getByLabel('Wachtwoord').fill('fout-fout-fout');
  await page.getByRole('button', { name: 'Inloggen' }).click();
  await expect(page.getByText('Naam of wachtwoord klopt niet.')).toBeVisible();
  await expect(page.getByLabel('Wachtwoord')).toBeFocused();
});

test('S9 + S20: the numbers on Start are doors, and there is a way past the menu', async ({ page }) => {
  await signIn(page, KEEPER.name, KEEPER.password);
  await page.goto('/');
  const numbers = page.locator('.home-numbers');
  for (const href of ['/wiki/alles', '/cases', '/boards', '/maps', '/stambomen', '/web']) {
    await expect(numbers.locator(`a[href="${href}"]`), href).toHaveCount(1);
  }
  await expect(page.locator('a.skip-link[href="#main"]')).toHaveCount(1);
  await expect(page.locator('main#main')).toHaveCount(1);
  // One landmark per name: the side menu and the tab bar are two places.
  // (By attribute: on a desktop the tab bar is hidden, so it is not in the tree.)
  await expect(page.locator('nav.tabs[aria-label="Tabbalk"]')).toHaveCount(1);
});

test('B10: on a phone the head of an artikel gets the whole width', async ({ page }, info) => {
  test.skip(info.project.name !== 'phone', 'The float only squeezed a phone.');
  await signIn(page, KEEPER.name, KEEPER.password);
  const made = await page.request.post('/api/entries', {
    data: { name: `Brede kop ${info.project.name}-${Date.now().toString(36)}`, typeSlug: 'character' },
  });
  const { entry } = (await made.json()) as { entry: { slug: string } };
  await page.goto(`/e/${entry.slug}`);
  const head = page.locator('.entry-head').first();
  await expect(head).toBeVisible();
  const [headWidth, columnWidth] = await head.evaluate((el) => {
    const main = document.querySelector('main')!;
    const style = getComputedStyle(main);
    const column = main.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
    return [el.getBoundingClientRect().width, column];
  });
  // It was 198 of 358 px beside the floats: now it is (nearly) the whole column.
  expect(headWidth).toBeGreaterThan(columnWidth * 0.9);
});
