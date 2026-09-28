import { expect, test, type Page } from '@playwright/test';
import { becomeInvestigator, editArticle, signIn, signUp } from './helpers';

/**
 * §97, ronde 58 — het lek in de lopende tekst.
 *
 * A reference in an artikel's running text is a handle since this round, and
 * its name is looked up per reader. What only a browser can say:
 *
 *   1. a Keeper links, in the text, to an artikel that then goes Keeper-only;
 *      a speler reads the artikel and finds the name of that artikel nowhere —
 *      not on the screen, not in the HTML, not in the RSC answer of a
 *      navigation, not in the API — while a link they may follow reads fine;
 *   2. the speler rewrites the text, and the Keeper still has the link: what
 *      you could not see, you did not take away (§67);
 *   3. a rename of a linked artikel is the new name for every reader at once.
 *
 * The pure halves (the migration, the write road, search) are in
 * `tests/unit/ronde-58-lopende-tekst.test.ts`.
 */

const KEEPER = { name: 'Keeper', password: 'abbeytower34' };

type Made = { id: string; slug: string };

async function makeEntry(page: Page, name: string): Promise<Made> {
  const made = await page.request.post('/api/entries', { data: { name, typeSlug: 'character' } });
  expect(made.ok()).toBe(true);
  return ((await made.json()) as { entry: Made }).entry;
}

/** The running text of the artikel, not a section's. */
const bodyOf = (page: Page) => page.locator('.entry-body-block .ProseMirror');

/** Types `@name` at the end of the body and picks that artikel from the list. */
async function linkInBody(page: Page, before: string, name: string) {
  const body = bodyOf(page);
  await expect(body).toHaveAttribute('contenteditable', 'true', { timeout: 20_000 });
  await page.waitForTimeout(400);
  // §104: into the text at its very first letter, not its middle — a click in
  // Bewerken on a chip follows it, and with 17 px text the middle of a short
  // body can be the chip the speler's rewrite put back.
  await body.click({ position: { x: 2, y: 4 } });
  await page.keyboard.press('Control+End');
  await page.keyboard.type(before, { delay: 15 });
  await page.keyboard.type(`@${name.slice(0, 12)}`, { delay: 30 });
  const option = page
    .getByRole('option')
    .filter({ hasText: name })
    .filter({ hasNotText: 'aanmaken' });
  await expect(option).toBeVisible({ timeout: 20_000 });
  await option.click();
  await expect(body.locator('a.entry-chip', { hasText: name })).toBeVisible({ timeout: 20_000 });
}

test('een Keeper-only artikel in de lopende tekst is voor een speler nergens', async ({ page, browser }, info) => {
  test.setTimeout(240_000);
  const stamp = `${info.project.name}-${Date.now().toString(36)}`;
  const secretName = `Verborgen Weduwe ${stamp}`;
  const openName = `Open Veerman ${stamp}`;

  // 1. The Keeper writes the text, with two links in it.
  await signIn(page, KEEPER.name, KEEPER.password);
  const secret = await makeEntry(page, secretName);
  const open = await makeEntry(page, openName);
  const source = await makeEntry(page, `De brief ${stamp}`);
  await page.goto(`/e/${source.slug}`);
  await editArticle(page);
  await linkInBody(page, 'Brief van ', secretName);
  await linkInBody(page, ' aan ', openName);
  await page.keyboard.type(' over de dijk.', { delay: 15 });
  await expect(page.locator('.save-state')).toHaveText('Opgeslagen', { timeout: 20_000 });
  await page.waitForTimeout(2500);
  // §6: a picker is sided, so the link is written first and the artikel hidden after.
  const hidden = await page.request.patch(`/api/entries/${secret.id}`, { data: { visibility: 'keeper' } });
  expect(hidden.ok()).toBe(true);

  // 2. A speler reads it.
  const context = await browser.newContext({ viewport: page.viewportSize() ?? undefined });
  const player = await context.newPage();
  await signUp(player, `Lezer-${stamp}`.slice(0, 30), 'geheimpje-58');
  await becomeInvestigator(player, `Onderzoeker ${stamp}`);
  await player.goto(`/e/${source.slug}`);
  const body = bodyOf(player);
  await expect(body).toContainText('Brief van', { timeout: 20_000 });
  await expect(body.locator('a.entry-chip', { hasText: openName })).toBeVisible({ timeout: 20_000 });
  await expect(body.locator('a.entry-chip')).toHaveCount(1);
  await expect(body).not.toContainText(secretName);

  const leaks = [secretName, secret.id, secret.slug, 'Verborgen Weduwe'];
  const html = await player.content();
  for (const leak of leaks) expect(html).not.toContain(leak);

  // The RSC answer a client navigation fetches, and the artikel's own API.
  const rsc = await player.request.get(`/e/${source.slug}`, { headers: { RSC: '1' } });
  expect(rsc.ok()).toBe(true);
  const flight = await rsc.text();
  // It is the page's payload, with the text in it.
  expect(flight).toContain(source.id);
  for (const leak of leaks) expect(flight).not.toContain(leak);
  const api = await player.request.get(`/api/entries/${source.id}`);
  const apiText = await api.text();
  for (const leak of leaks) expect(apiText).not.toContain(leak);

  // 3. The speler rewrites the whole text. The link they never saw stays.
  await editArticle(player);
  await expect(body).toHaveAttribute('contenteditable', 'true', { timeout: 20_000 });
  await player.waitForTimeout(400);
  await body.click();
  await player.keyboard.press('Control+A');
  await player.keyboard.type('De speler schreef dit opnieuw.', { delay: 15 });
  await expect(player.locator('.save-state')).toHaveText('Opgeslagen', { timeout: 20_000 });
  await player.waitForTimeout(2500);
  await expect(body).not.toContainText(secretName);
  expect(await player.content()).not.toContain(secretName);

  await page.goto(`/e/${source.slug}`);
  const keeperBody = bodyOf(page);
  await expect(keeperBody).toContainText('De speler schreef dit opnieuw.', { timeout: 20_000 });
  await expect(keeperBody.locator('a.entry-chip', { hasText: secretName })).toBeVisible({ timeout: 20_000 });

  // 4. A rename is the new name for every reader who may see it, at once.
  const renamed = `Hernoemde Veerman ${stamp}`;
  expect((await page.request.patch(`/api/entries/${open.id}`, { data: { name: renamed } })).ok()).toBe(true);
  const secretRenamed = `Andere Weduwe ${stamp}`;
  expect((await page.request.patch(`/api/entries/${secret.id}`, { data: { name: secretRenamed } })).ok()).toBe(true);
  // The Keeper's link after the speler's rewrite is still the secret one.
  await page.reload();
  await expect(bodyOf(page).locator('a.entry-chip', { hasText: secretRenamed })).toBeVisible({ timeout: 20_000 });

  // The open link was rewritten away by the speler; give the Keeper's text one back and read it as the speler.
  await editArticle(page);
  await linkInBody(page, ' Groet aan ', renamed);
  await expect(page.locator('.save-state')).toHaveText('Opgeslagen', { timeout: 20_000 });
  await page.waitForTimeout(2500);
  expect((await page.request.patch(`/api/entries/${open.id}`, { data: { name: `${renamed} II` } })).ok()).toBe(true);
  await player.goto(`/e/${source.slug}`);
  await expect(bodyOf(player).locator('a.entry-chip', { hasText: `${renamed} II` })).toBeVisible({ timeout: 20_000 });
  const after = await player.content();
  expect(after).not.toContain(secretRenamed);
  expect(after).not.toContain(secretName);

  await context.close();
});
