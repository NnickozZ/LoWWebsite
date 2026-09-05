import { test, type Page } from '@playwright/test';
import { inviteCode, signIn } from './helpers';

/**
 * Not a test: a screenshot walk through the newer screens (maps, the
 * character switcher, the sort bar), for looking at after a change to any of
 * them. Not picked up by the suite; run it by hand:
 *
 *   npx playwright test tests/e2e/shots.visual.ts --config playwright.config.ts
 *
 * …with `testMatch` widened, or simply rename it to *.spec.ts for the run.
 * Pictures land in ./shots (git-ignored).
 */

async function picture(): Promise<Buffer> {
  const sharp = (await import('sharp')).default;
  // A crude island: sand, water, a dark blob.
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800">
    <rect width="1200" height="800" fill="#b9cbd3"/>
    <path d="M200 420 C 260 200, 700 150, 900 300 C 1100 450, 950 700, 600 680 C 350 660, 150 600, 200 420 Z" fill="#e6dcb8" stroke="#8a7a52" stroke-width="6"/>
    <path d="M500 380 C 560 330, 700 330, 720 420 C 700 500, 560 520, 500 460 Z" fill="#9fb27a"/>
    <text x="60" y="760" font-family="serif" font-size="36" fill="#4b4234">Het eiland — 1911</text>
  </svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

async function signUpAs(page: Page, name: string) {
  await page.goto('/signup');
  await page.getByLabel('Uitnodigingscode').fill(inviteCode());
  await page.getByLabel('Naam').fill(name);
  await page.getByLabel('Wachtwoord', { exact: true }).fill('onderzeeboot');
  await page.getByLabel('Wachtwoord nogmaals').fill('onderzeeboot');
  await page.getByRole('button', { name: 'Account aanmaken' }).click();
  await page.waitForURL('**/');
}

test('shots', async ({ page }, info) => {
  test.setTimeout(240_000);
  const p = info.project.name;
  const stamp = Date.now().toString(36);

  await signIn(page, 'Keeper', 'abbeytower34');
  await page.goto('/maps');
  await page.getByRole('button', { name: 'Landkaart ophangen' }).click();
  const sheet = page.getByRole('dialog', { name: 'Landkaart ophangen' });
  await sheet.getByLabel('Afbeelding').setInputFiles({ name: 'eiland.png', mimeType: 'image/png', buffer: await picture() });
  await sheet.getByLabel('Naam').fill(`Het eiland ${stamp}`);
  await sheet.getByLabel('Omschrijving').fill('De kaart van de landmeter, 1911.');
  await sheet.getByRole('button', { name: 'Ophangen' }).click();
  await page.waitForURL('**/maps/**');
  await page.waitForTimeout(600);

  const stage = page.getByRole('application');
  const box = (await stage.boundingBox())!;
  const place = async (fx: number, fy: number) => {
    await page.getByRole('button', { name: 'Speld zetten' }).click();
    await page.mouse.click(box.x + box.width * fx, box.y + box.height * fy);
  };
  await place(0.45, 0.45);
  let ask = page.getByRole('dialog', { name: 'Wat komt hier?' });
  await ask.getByRole('tab', { name: /notitie/ }).click();
  await ask.getByLabel('Naam').fill('Hier lag de boot');
  await ask.getByLabel('Tekst').fill('Aangespoeld op de ochtend van 3 mei.');
  await ask.getByRole('button', { name: 'Speld zetten' }).click();
  await page.getByRole('dialog', { name: 'Hier lag de boot' }).waitFor();
  await page.keyboard.press('Escape');
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  await place(0.62, 0.38);
  ask = page.getByRole('dialog', { name: 'Wat komt hier?' });
  await ask.getByPlaceholder('Zoek een fiche…').fill('Pier');
  await page.locator('.suggest-item').filter({ hasText: 'Pier Boone' }).first().click();
  await page.getByRole('dialog', { name: 'Pier Boone' }).waitFor();
  await page.keyboard.press('Escape');
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  await place(0.3, 0.6);
  ask = page.getByRole('dialog', { name: 'Wat komt hier?' });
  await ask.getByPlaceholder('Zoek een fiche…').fill('Vuur');
  await page.waitForTimeout(400);
  const first = page.locator('.suggest-item').filter({ hasNotText: 'aanmaken' }).first();
  if (await first.isVisible().catch(() => false)) {
    await first.click();
    await page.waitForTimeout(800);
  }
  await page.keyboard.press('Escape');
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  await page.waitForTimeout(300);
  await page.screenshot({ path: `shots/${p}-map.png`, fullPage: false });

  await page.locator('.map-pin', { hasText: 'Hier lag de boot' }).click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: `shots/${p}-map-pin.png` });
  await page.keyboard.press('Escape');

  await page.goto('/wiki');
  await page.waitForTimeout(300);
  await page.screenshot({ path: `shots/${p}-wiki.png` });
  await page.goto('/cases');
  await page.waitForTimeout(300);
  await page.screenshot({ path: `shots/${p}-cases.png` });
  await page.goto('/maps');
  await page.waitForTimeout(300);
  await page.screenshot({ path: `shots/${p}-maps.png` });

  // A player with a character, for the switcher.
  await page.context().clearCookies();
  await signUpAs(page, `Nick ${stamp}`);
  await page.keyboard.press('n');
  const ns = page.getByRole('dialog', { name: 'Nieuwe fiche' });
  await ns.getByLabel('Naam').fill('Onderzoeker Van Dijk');
  await ns.getByRole('button', { name: 'Aanmaken' }).click();
  await page.waitForURL('**/e/**');
  await page.waitForTimeout(800);
  await page.getByRole('button', { name: 'Dit is mijn karakter' }).click();
  await page.waitForTimeout(800);
  await page.screenshot({ path: `shots/${p}-entry-character.png` });
  await page.goto('/you');
  await page.waitForTimeout(300);
  await page.screenshot({ path: `shots/${p}-you.png` });
  const who = page.locator('.who-button');
  if (await who.isVisible().catch(() => false)) {
    await who.click();
    await page.waitForTimeout(300);
    await page.screenshot({ path: `shots/${p}-switcher.png` });
    await page.keyboard.press('Escape');
  }
  await page.goto('/');
  await page.waitForTimeout(300);
  await page.screenshot({ path: `shots/${p}-home.png` });
});
