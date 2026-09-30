import { expect, test } from '@playwright/test';
import { signIn, signUp } from './helpers';

/**
 * Golf M (C3): Beheer → Gebruikers heeft een zoekvak. Nick: "eventually we
 * will get a lot of players". Zoeken op naam, zonder hoofdletters en accenten;
 * Alle · Keepers · Uitgeschakeld; een telling "n van m"; een regel als niemand
 * past. Een rij die niet past is `hidden`, niet weg.
 */

const KEEPER = ['Keeper', 'abbeytower34'] as const;

test('C3: zoeken en filteren in Gebruikers', async ({ page, browser }, info) => {
  test.setTimeout(120_000);
  const tail = `${info.project.name.slice(0, 2)}${Date.now().toString(36).slice(-5)}`;
  const name = `Zoë Zoeker ${tail}`;
  const other = await browser.newContext();
  await signUp(await other.newPage(), name, 'zeewering12');
  await other.close();

  await signIn(page, ...KEEPER);
  await page.goto('/admin?tab=users');
  const zoek = page.getByTestId('spelers-zoek');
  await expect(zoek).toBeVisible({ timeout: 15_000 });
  // Op een computer staat de caret er al in (zoals in Woorden); op een telefoon niet.
  if (info.project.name === 'phone') await expect(zoek).not.toBeFocused();
  else await expect(zoek).toBeFocused();
  const row = page.locator(`li[data-username="${name}"]`);
  const keeperRow = page.locator('li[data-username="Keeper"]');
  const rows = page.locator('li[data-username]');
  const total = await rows.count();
  expect(total).toBeGreaterThan(1);
  await expect(page.getByTestId('spelers-telling')).toHaveText(`${total} van ${total}`);

  // Zonder accent en in kleine letters, op een stukje van de naam.
  await zoek.fill(`zoe zoeker ${tail.toLowerCase()}`);
  await expect(row).toBeVisible();
  await expect(keeperRow).toBeHidden();
  await expect(page.getByTestId('spelers-telling')).toHaveText(`1 van ${total}`);
  // Verborgen, niet weg: alle rijen staan nog in de lijst.
  await expect(rows).toHaveCount(total);

  // Niemand.
  await zoek.fill(`niemand-heet-zo-${tail}`);
  await expect(page.getByTestId('spelers-geen')).toBeVisible();
  await expect(row).toBeHidden();

  // Escape maakt het vak leeg, en iedereen staat er weer.
  await zoek.press('Escape');
  await expect(zoek).toHaveValue('');
  await expect(row).toBeVisible();
  await expect(page.getByTestId('spelers-geen')).toHaveCount(0);

  // Keepers: de Keeper wel, de nieuwe speler niet.
  const filter = page.getByTestId('spelers-filter');
  await filter.locator('[data-soort="keepers"]').click();
  await expect(filter.locator('[data-soort="keepers"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(keeperRow).toBeVisible();
  await expect(row).toBeHidden();
  // Samen met het zoekvak: een speler is geen Keeper.
  await zoek.fill(tail);
  await expect(page.getByTestId('spelers-geen')).toBeVisible();
  // Nog een druk op dezelfde knop is weer Alle.
  await filter.locator('[data-soort="keepers"]').click();
  await expect(filter.locator('[data-soort="alle"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(row).toBeVisible();

  // Een rij die verborgen was, doet het nog: het wachtwoordblad opent.
  await zoek.fill('');
  await row.getByRole('button', { name: 'Nieuw wachtwoord instellen' }).click();
  const sheet = page.getByRole('dialog', { name: `Nieuw wachtwoord voor ${name}` });
  await expect(sheet).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(sheet).toHaveCount(0);

  // Op een telefoon: het vak over de volle breedte en geen pagina die opzij schuift.
  if (info.project.name === 'phone') {
    const vak = (await zoek.boundingBox())!;
    expect(vak.width).toBeGreaterThan(300);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  }
});
