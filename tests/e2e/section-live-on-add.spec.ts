import { expect, test } from '@playwright/test';
import { fillWhenReady, signIn } from './helpers';

/**
 * §20, the quickfix after round 37: a sectie made a moment ago is shared text
 * from its first keystroke — not a plain editor until the next F5.
 *
 * The POST that makes a sectie hands its room back, the way the page hands one
 * over, so the writer's words reach a second reader without anybody reloading.
 */
test('een net toegevoegde sectie is meteen gedeelde tekst', async ({ page, browser }, testInfo) => {
  const stamp = `${testInfo.project.name}-${Date.now().toString(36)}`;
  const caseName = `Levende sectie ${stamp}`;
  const title = `Net erbij ${stamp}`;
  const words = `Getypt zonder herladen ${stamp}`;

  await signIn(page, 'Keeper', 'abbeytower34');
  await page.goto('/cases');
  await page.getByRole('button', { name: 'Dossier openen' }).click();
  const sheet = page.getByRole('dialog', { name: 'Dossier openen' });
  await sheet.getByLabel('Naam', { exact: true }).fill(caseName);
  await sheet.getByRole('button', { name: 'Openen', exact: true }).click();
  await page.waitForURL('**/c/**');
  const caseUrl = new URL(page.url()).pathname + new URL(page.url()).search;

  const button = page.getByRole('button', { name: 'Sectie toevoegen' });
  await button.waitFor({ state: 'visible', timeout: 15_000 });
  const boxes = page.getByPlaceholder('Titel van de sectie');
  const made = page.waitForResponse(
    (r) => r.url().includes('/sections') && r.request().method() === 'POST',
  );
  for (let attempt = 0; attempt < 8; attempt++) {
    if ((await boxes.count()) > 0) break;
    await button.click({ timeout: 5000 }).catch(() => undefined);
    await page.waitForTimeout(500);
  }
  const body = (await (await made).json()) as { live?: { room?: string } | null };
  expect(body.live?.room).toMatch(/^section:/);
  const saved = page.waitForResponse(
    (r) => r.url().includes('/api/sections/') && r.request().method() === 'PATCH',
  );
  await fillWhenReady(boxes.first(), title);
  await boxes.first().blur();
  await saved;

  // A second Keeper tab opens the dossier and waits in the sectie's room.
  const otherContext = await browser.newContext();
  const other = await otherContext.newPage();
  await signIn(other, 'Keeper', 'abbeytower34');
  await other.goto(caseUrl);
  await expect(other.getByPlaceholder('Titel van de sectie')).toHaveValue(title);

  // The first tab types in the sectie it just made — no reload.
  const editor = page.locator('.entry-section-editing .ProseMirror[contenteditable="true"]').first();
  await editor.click();
  await page.keyboard.type(words);

  await expect(other.locator('.entry-section-editing .ProseMirror').first()).toContainText(words, {
    timeout: 15_000,
  });

  // Nick's report: the title followed onto the reading face and the text did
  // not. Flip the same tab to reading, still without a reload.
  await page.waitForTimeout(800);
  const toggle = page.locator('.entry-mode-toggle');
  await toggle.click();
  await expect(page.getByRole('heading', { name: title })).toBeVisible();
  await expect(page.locator('.entry-section').filter({ hasText: title })).toContainText(words, {
    timeout: 15_000,
  });

  // And it was kept.
  await page.goto(caseUrl);
  await expect(page.locator('.entry-section-editing .ProseMirror').first()).toContainText(words, {
    timeout: 15_000,
  });
  await otherContext.close();
});
