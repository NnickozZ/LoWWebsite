import { expect, test, type Locator, type Page } from '@playwright/test';
import { editArticle, signIn, signUp } from './helpers';

/**
 * Golf O, vijfde pas (Nick, 1 oktober): de Keeper volgt een speler van de
 * Keeperkant naar de spelerskant, en de schakelaar stond nog op Keeper — terug
 * kostte twee klikken.
 */

const KEEPER = ['Keeper', 'abbeytower34'] as const;

async function openRoster(page: Page): Promise<Locator> {
  const button = page.getByTestId('roster-open');
  await expect(button).toBeVisible({ timeout: 30_000 });
  const roster = page.getByTestId('roster');
  await expect(async () => {
    if (!(await roster.isVisible().catch(() => false))) await button.click({ timeout: 5000 });
    await expect(roster).toBeVisible({ timeout: 1500 });
  }).toPass({ timeout: 30_000 });
  return roster;
}

test('volgen naar de andere kant zet de schakelaar mee, en één klik brengt je terug', async ({ page, browser }, info) => {
  test.setTimeout(180_000);
  await signIn(page, ...KEEPER);
  const name = `Volger ${info.project.name} ${Date.now().toString(36)}`;
  const context = await browser.newContext(info.project.use);
  const player = await context.newPage();
  await signUp(player, name, 'golfowachtwoord');
  await player.goto('/e/jacob-den-hollander');
  await expect(player.getByTestId('live-strip')).toHaveClass(/live-strip-live/, { timeout: 30_000 });

  // De Keeper staat op zijn eigen kant.
  await page.goto('/api/keeper/flip?side=keeper&to=/wiki');
  const toggle = page.getByTestId('side-toggle');
  await expect(toggle).toHaveAttribute('data-side-now', 'keeper', { timeout: 30_000 });
  await expect(page.getByTestId('live-strip')).toHaveClass(/live-strip-live/, { timeout: 30_000 });

  const roster = await openRoster(page);
  const go = roster.locator('li.roster-row').filter({ hasText: name }).getByTestId('roster-go');
  await expect(go).toHaveAttribute('href', /\/e\/jacob-den-hollander/, { timeout: 30_000 });
  await go.click();
  await page.waitForURL('**/e/jacob-den-hollander**', { timeout: 30_000 });

  // De schakelaar zegt waar je staat: bij de spelers.
  await expect(page.getByTestId('side-toggle')).toHaveAttribute('data-side-now', 'player', { timeout: 15_000 });
  await expect(page.locator('[data-side="player"]').first()).toBeAttached();

  // Eén klik terug naar de Keeperkant.
  await page.getByTestId('side-toggle').click();
  await expect(page.getByTestId('side-toggle')).toHaveAttribute('data-side-now', 'keeper', { timeout: 30_000 });
  await context.close();
});

test('verwijderen staat alleen in Bewerken, en vraagt akkoord', async ({ page }, info) => {
  test.setTimeout(120_000);
  await signIn(page, ...KEEPER);
  const name = `Weggooibaar ${info.project.name} ${Date.now().toString(36)}`;
  const made = await page.request.post('/api/entries', { data: { name, typeSlug: 'object' } });
  expect(made.ok()).toBe(true);
  const slug = ((await made.json()) as { entry: { slug: string } }).entry.slug;
  await page.goto(`/e/${slug}`);

  // Lezen: geen verwijderknop.
  await expect(page.getByRole('heading', { name })).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('summary', { hasText: 'Dit artikel verwijderen' })).toHaveCount(0);

  // Bewerken: wel, en de knop gaat pas open met het woord.
  await editArticle(page);
  await page.locator('summary', { hasText: 'Dit artikel verwijderen' }).click();
  const go = page.getByTestId('entry-bin-go');
  await expect(go).toBeDisabled();
  const box = page.getByTestId('entry-bin-confirm');
  await box.fill(name);
  await expect(go).toBeDisabled();
  await box.fill(' akkoord ');
  await expect(go).toBeEnabled();
  await go.click();
  await page.waitForURL('**/wiki/alles**', { timeout: 30_000 });
});
