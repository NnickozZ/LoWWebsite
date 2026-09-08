import { expect, test, type Browser, type Page } from '@playwright/test';
import { editArticle, inviteCode, newEntryButton, signIn, writeAs } from './helpers';

/**
 * §18: who you are being. §18b: who *this window* is writing as.
 *
 * A player ties a fiche on from the fiche itself and sees the archive start
 * calling them by that name; two windows of one account are two onderzoekers
 * and the geschiedenis keeps them apart; somebody with no onderzoeker at all
 * is told, plainly, that they may only read — and the archive says the same
 * thing to a request that goes round the screen.
 *
 * One rule shapes every arrangement below: **a speler with no onderzoeker
 * writes nothing — except the artikel that becomes their first onderzoeker.**
 * That single exception (`requireAuthorOrFirstCharacter`) is the archive's
 * answer to the chicken and the egg: an onderzoeker *is* an artikel somebody
 * tied on, so refusing that one too would leave every new speler locked out of
 * their own beginning. The last test walks exactly that road.
 *
 * The tests that need a player to hold *two* onderzoekers, or to hold one
 * before they have opened anything, still have the Keeper write them: that is
 * quicker than making three artikelen through the screen, and it is also how a
 * campaign with pre-made fiches actually starts.
 *
 * §18c narrows that one exception to exactly what it was always for. Handing
 * out an onderzoeker is the Keeper's — a speler may tie one to themselves only
 * while they hold nobody, and may untie none at all — so an account that holds
 * two got the second from the Keeper, in Beheer (`keeperAssigns` below, and the
 * last test, which walks the whole road). What a player *wears* is untouched:
 * that is §18b's question, asked per window, and it is still theirs.
 */

const PASSWORD = 'onderzeeboot';

async function signUpAs(page: Page, name: string) {
  await page.goto('/signup');
  await page.getByLabel('Uitnodigingscode').fill(inviteCode());
  await page.getByLabel('Naam', { exact: true }).fill(name);
  await page.getByLabel('Wachtwoord', { exact: true }).fill(PASSWORD);
  await page.getByLabel('Wachtwoord nogmaals').fill(PASSWORD);
  await page.getByRole('button', { name: 'Account aanmaken' }).click();
  await page.waitForURL('**/');
}

async function newEntry(page: Page, name: string): Promise<string> {
  const sheet = page.getByRole('dialog', { name: 'Nieuw artikel' });
  // The `n` shortcut needs the page hydrated; right after a navigation it may
  // not be yet, so press again until the sheet answers.
  for (let attempt = 0; attempt < 8 && !(await sheet.isVisible()); attempt++) {
    await page.keyboard.press('n');
    await page.waitForTimeout(400);
  }
  await sheet.getByLabel('Naam', { exact: true }).fill(name);
  const from = new URL(page.url()).pathname;
  await sheet.getByRole('button', { name: 'Aanmaken' }).click();
  // A bare "any artikel address" glob is already true the second time round:
  // `keeperWrites` makes three artikelen one after another and each one leaves
  // the browser standing on the artikel before it, so the glob matches the
  // address that is *already* there and hands back the wrong path — every
  // fiche after the first would be the first one again. Wait for the address
  // to actually change.
  await page.waitForURL((url) => url.pathname.startsWith('/e/') && url.pathname !== from);
  return new URL(page.url()).pathname;
}

/**
 * The Keeper makes the fiches a player will wear — the pre-made-fiche start.
 * Returns their paths, in order.
 */
async function keeperWrites(browser: Browser, names: string[]): Promise<string[]> {
  const context = await browser.newContext();
  const keeper = await context.newPage();
  await signIn(keeper, 'Keeper', 'abbeytower34');
  const paths: string[] = [];
  for (const name of names) paths.push(await newEntry(keeper, name));
  await context.close();
  return paths;
}

/**
 * §18c: the Keeper hands an onderzoeker to an account, from Beheer.
 *
 * The road that did not exist until now: `whose()` and `addCharacter` have
 * always taken a `userId` for somebody else and nothing in the archive ever
 * sent one. With koppelen made the Keeper's, this is where it happens — the
 * same account list they already open to reset a password.
 */
async function keeperAssigns(browser: Browser, account: string, character: string) {
  const context = await browser.newContext();
  const keeper = await context.newPage();
  await signIn(keeper, 'Keeper', 'abbeytower34');
  await keeper.goto('/admin?tab=users');
  const row = keeper.locator(`li[data-username="${account}"]`).first();
  await expect(row).toBeVisible({ timeout: 15_000 });

  const box = row.locator('input.input').first();
  await box.click();
  await box.fill(character);
  // The existing fiche, not the "'…' aanmaken" row: that one renders the moment
  // there is a query, while the real suggestions are still in flight, so it is
  // the first `.suggest-item` on screen and it *also* contains the typed name.
  // Clicking it opens the nieuw-artikel sheet and ties nobody to anybody.
  const suggestion = row
    .locator('.suggest-item')
    .filter({ hasText: character })
    .filter({ hasNotText: 'aanmaken' })
    .first();
  await expect(suggestion).toBeVisible({ timeout: 15_000 });
  await suggestion.click();

  // The chip lands in that account's row: the wardrobe, from the other side.
  await expect(row.getByText(character, { exact: false }).first()).toBeVisible({ timeout: 15_000 });
  await context.close();
}

/** The fiche's main text: the first editor on the page. */
const body = (page: Page) => page.locator('.editor-body .prose').first();

/** The sheet §18b puts in front of somebody who has not said who they are. */
const askSheet = (page: Page) =>
  page.getByRole('dialog', { name: 'Met wie ben je nu aan het schrijven?' });

/**
 * Clicks until what it opens is on screen — the same loop `newEntry` runs on
 * the `n` key. Right after a navigation React may not have picked the page up
 * yet, and a click into a page that is not listening is silence, not an error.
 */
async function clickUntil(
  page: Page,
  button: ReturnType<Page['locator']>,
  target: ReturnType<Page['locator']>,
) {
  for (let attempt = 0; attempt < 8 && !(await target.isVisible().catch(() => false)); attempt++) {
    await button.click({ timeout: 5000 }).catch(() => undefined);
    await page.waitForTimeout(400);
  }
  await target.waitFor({ state: 'visible', timeout: 10_000 });
}

test('a player wears a fiche, the archive uses its name, and the name sticks', async ({ page, browser }, info) => {
  test.setTimeout(180_000);
  const stamp = `${info.project.name}-${Date.now().toString(36)}`;
  const account = `Speler ${stamp}`;
  const character = `Onderzoeker ${stamp}`;

  const [characterPath] = await keeperWrites(browser, [character]);

  await signUpAs(page, account);

  // From the fiche: this is me.
  await page.goto(characterPath);
  await page.getByRole('button', { name: 'Dit is mijn karakter' }).click();
  await expect(page.getByText(`Je speelt nu als ${character}.`)).toBeVisible();
  await expect(page.getByText('Jouw karakter')).toBeVisible();

  // With somebody on the peg the window is asked the moment it writes, so it
  // answers now rather than meeting the sheet halfway through the next act.
  await writeAs(page, character);

  // The menu says so (desktop).
  const nav = page.getByRole('navigation', { name: 'Hoofdmenu' }).first();
  if (await nav.locator('.who').isVisible()) {
    await expect(nav.locator('.who')).toContainText(character);
    // §18b: and, right under it, what this window writes as. Before any
    // answer that is the account's karakter — which is what the server would
    // use for a plain page load, so the line is telling the truth.
    await expect(nav.locator('.who-writing')).toContainText(character);
  }

  // With a name to write under, the player can make something — and the feed
  // calls them by it, with the account one tooltip away.
  await page.goto('/');
  const made = await newEntry(page, `Aantekening ${stamp}`);
  expect(made).toContain('/e/');
  await page.goto('/');
  const row = page.locator('.feed-item').filter({ hasText: `Aantekening ${stamp}` }).first();
  await expect(row.locator('strong').first()).toHaveText(character);
  await expect(row.locator('strong').first()).toHaveAttribute('title', account);

  // The Jij page lists it, and can take it off.
  await page.goto('/you');
  await expect(page.getByRole('heading', { name: 'Jouw karakters' })).toBeVisible();
  await expect(page.getByText('Dit ben je nu')).toBeVisible();
  await page.getByRole('button', { name: /^Als jezelf/ }).click();
  await page.waitForTimeout(800);

  /*
   * §18b: attribution is *recorded*, not re-derived. Taking the karakter off
   * used to rename everything the player had ever done; it does not any more,
   * because the log would otherwise lie about who found what.
   */
  await page.goto('/');
  const stillTheirs = page.locator('.feed-item').filter({ hasText: `Aantekening ${stamp}` }).first();
  await expect(stillTheirs.locator('strong').first()).toHaveText(character);

  /*
   * And with the account wearing nobody, a request that carries no window
   * choice has no name to write under at all — which is a question, not an
   * error, and comes back marked as one.
   */
  const asked = await page.request.post('/api/entries', {
    data: { typeSlug: 'personen', name: `Naamloos ${stamp}` },
  });
  expect(asked.status()).toBe(400);
  expect(await asked.json()).toMatchObject({ needsAuthor: true });

  // And back on, through the sheet in the menu (desktop only: on a phone the
  // wardrobe on the Jij page is the switch).
  if (await nav.locator('.who-button').first().isVisible()) {
    await nav.locator('.who-button').first().click();
    const sheet = page.getByRole('dialog', { name: 'Je speelt als' });
    await sheet.getByRole('radio', { name: new RegExp(character) }).click();
    await page.waitForTimeout(800);
    await expect(nav.locator('.who')).toContainText(character);
  }
});

test('a Keeper is always the Keeper', async ({ page }, info) => {
  const stamp = `${info.project.name}-${Date.now().toString(36)}`;
  await signIn(page, 'Keeper', 'abbeytower34');
  await page.goto('/you');
  await expect(page.getByText(/Als Keeper ben je overal de Keeper/)).toBeVisible();
  await page.goto('/');
  await newEntry(page, `Keepers fiche ${stamp}`);
  await expect(page.getByRole('button', { name: 'Op prikbord prikken' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Dit is mijn karakter' })).toHaveCount(0);
  const nav = page.getByRole('navigation', { name: 'Hoofdmenu' }).first();
  if (await nav.locator('.who').isVisible()) {
    await expect(nav.locator('.who')).toContainText('Keeper');
    await expect(nav.locator('.who-button')).toHaveCount(0);
    // §18b: a Keeper is asked nothing, so there is no line to ask it with.
    await expect(nav.locator('.who-writing')).toHaveCount(0);
  }
  // A Keeper is never asked the question, whatever they touch.
  await editArticle(page);
  await body(page).click();
  await page.keyboard.type('De Keeper schrijft.');
  await expect(askSheet(page)).toHaveCount(0);
  // The API refuses to dress them, too.
  const refused = await page.request.patch('/api/characters', { data: { active: null } });
  expect(refused.status()).toBe(400);
});

test('a fresh window is asked at the first edit, and not one moment before', async ({ page, browser }, info) => {
  test.setTimeout(180_000);
  const stamp = `${info.project.name}-${Date.now().toString(36)}`;
  const account = `Lezer ${stamp}`;
  const character = `Onderzoekster ${stamp}`;

  const [characterPath, notePath] = await keeperWrites(browser, [
    character,
    `Kladblok ${stamp}`,
  ]);

  await signUpAs(page, account);
  await page.goto(characterPath);
  await page.getByRole('button', { name: 'Dit is mijn karakter' }).click();
  await expect(page.getByText(`Je speelt nu als ${character}.`)).toBeVisible();

  /*
   * A fresh window. Reading the wiki is not an act of authorship, so nothing
   * stands in front of it — not on the shelf, not on an artikel, not even on
   * the editing face of one.
   */
  const context = await browser.newContext();
  const reader = await context.newPage();
  await signIn(reader, account, PASSWORD);
  await reader.goto('/wiki');
  await expect(askSheet(reader)).toHaveCount(0);
  await reader.goto(notePath);
  await expect(askSheet(reader)).toHaveCount(0);
  await editArticle(reader);
  await expect(askSheet(reader)).toHaveCount(0);

  // The first touch of the text is the first act of writing, and that is when
  // the archive asks.
  await body(reader).click();
  await reader.keyboard.type('H');
  await expect(askSheet(reader)).toBeVisible({ timeout: 10_000 });

  // It does not take no for an answer while it is standing in the way.
  await reader.keyboard.press('Escape');
  await expect(askSheet(reader)).toBeVisible();

  await askSheet(reader).getByRole('radio', { name: new RegExp(character) }).click();
  await expect(askSheet(reader)).toHaveCount(0);
  // And having answered, the window says so — and is never asked again.
  await expect(reader.locator('.who-writing, [data-testid="writing-as"]').first()).toContainText(
    character,
  );
  await body(reader).click();
  await reader.keyboard.type('allo');
  await expect(askSheet(reader)).toHaveCount(0);

  await context.close();
});

test('the question comes before the nieuw-artikel sheet, not on top of it', async ({ page, browser }, info) => {
  test.setTimeout(180_000);
  const stamp = `${info.project.name}-${Date.now().toString(36)}`;
  const account = `Schrijver ${stamp}`;
  const character = `Onderzoeker ${stamp}`;

  const [characterPath] = await keeperWrites(browser, [character]);

  await signUpAs(page, account);
  await page.goto(characterPath);
  await page.getByRole('button', { name: 'Dit is mijn karakter' }).click();
  await expect(page.getByText(`Je speelt nu als ${character}.`)).toBeVisible();

  /*
   * A fresh window: an onderzoeker on the peg, and no answer in *this* window
   * yet. Deliberately not `writeAs` — meeting the question here is the point.
   */
  const context = await browser.newContext();
  const writer = await context.newPage();
  await signIn(writer, account, PASSWORD);
  await writer.goto('/wiki');

  const newSheet = writer.getByRole('dialog', { name: 'Nieuw artikel' });

  /*
   * The road: "Nieuw artikel". It is an act of writing, so the archive asks
   * first — and asks *alone*. It used to open its own sheet and put the
   * question on top, which left two dialogs on the screen at once and an
   * Escape that closed the wrong one.
   */
  await clickUntil(writer, newEntryButton(writer), askSheet(writer));
  await expect(askSheet(writer)).toBeVisible();
  await expect(newSheet).toHaveCount(0);
  await expect(writer.locator('.sheet-backdrop')).toHaveCount(1);

  // And it still refuses to be waved away: the blocking question takes an
  // answer and nothing else. Escape leaves exactly what was there.
  await writer.keyboard.press('Escape');
  await expect(askSheet(writer)).toBeVisible();
  await expect(newSheet).toHaveCount(0);

  // Answering it releases the thing that was waiting — one sheet swapped for
  // the other, never both.
  await askSheet(writer).getByRole('radio', { name: new RegExp(character) }).click();
  await expect(askSheet(writer)).toHaveCount(0);
  await expect(newSheet).toBeVisible({ timeout: 10_000 });
  await expect(writer.locator('.sheet-backdrop')).toHaveCount(1);

  // Escape now means what it says: this sheet is dismissible, and dismissing
  // it leaves the page — not a stranded question — behind.
  await writer.keyboard.press('Escape');
  await expect(newSheet).toHaveCount(0);
  await expect(askSheet(writer)).toHaveCount(0);
  await expect(writer.locator('.sheet-backdrop')).toHaveCount(0);

  // The answer stuck, so the second time down the same road there is nothing
  // to ask and the sheet comes straight up.
  await clickUntil(writer, newEntryButton(writer), newSheet);
  await expect(askSheet(writer)).toHaveCount(0);
  await newSheet.getByLabel('Naam', { exact: true }).fill(`Aantekening ${stamp}`);
  await newSheet.getByRole('button', { name: 'Aanmaken' }).click();
  await writer.waitForURL('**/e/**');

  // And it is signed by the onderzoeker this window answered with.
  await writer.goto('/');
  const row = writer.locator('.feed-item').filter({ hasText: `Aantekening ${stamp}` }).first();
  await expect(row.locator('strong').first()).toHaveText(character);

  await context.close();
});

test('two windows of one account write as two onderzoekers, and the geschiedenis keeps them apart', async ({
  page,
  browser,
}, info) => {
  test.setTimeout(240_000);
  const stamp = `${info.project.name}-${Date.now().toString(36)}`;
  const account = `Duo ${stamp}`;
  const first = `Eerste ${stamp}`;
  const second = `Tweede ${stamp}`;

  const [firstPath, secondPath, sharedPath] = await keeperWrites(browser, [
    first,
    second,
    `Logboek ${stamp}`,
  ]);

  /*
   * One account, two onderzoekers on the peg — and, since §18c, by two
   * different roads. The first is the player's own: they hold nobody, so the
   * button is there. The second is the Keeper's to hand out, from Beheer,
   * which is now the only way an account comes to hold two at all.
   */
  await signUpAs(page, account);
  await page.goto(firstPath);
  await page.getByRole('button', { name: 'Dit is mijn karakter' }).click();
  await expect(page.getByText(`Je speelt nu als ${first}.`)).toBeVisible({ timeout: 15_000 });
  await keeperAssigns(browser, account, second);
  // The wardrobe on the Jij-pagina has both, and no ✕ on either. Scoped to the
  // page body: the side menu names the karakter you are wearing too, and on a
  // phone that copy is there but hidden, so a bare `.first()` picks the one
  // nobody can see.
  await page.goto('/you');
  const wardrobe = page.getByRole('main');
  await expect(wardrobe.getByText(first, { exact: false }).first()).toBeVisible({ timeout: 15_000 });
  await expect(wardrobe.getByText(second, { exact: false }).first()).toBeVisible();

  /**
   * A window of that account, sitting in the shared artikel, writing as the
   * onderzoeker it was told to pick. Two of these — the whole point is that
   * they are the *same* account and must not collapse into one name.
   */
  async function windowAs(name: string, text: string) {
    const context = await browser.newContext();
    const window = await context.newPage();
    await signIn(window, account, PASSWORD);
    await window.goto(sharedPath);
    await editArticle(window);
    await body(window).click();
    await expect(askSheet(window)).toBeVisible({ timeout: 15_000 });
    await askSheet(window).getByRole('radio', { name: new RegExp(name) }).click();
    await expect(askSheet(window)).toHaveCount(0);
    // The line is opened again with the answer in it, so the strip says the
    // right name too.
    await expect(window.locator('.live-dot-live')).toBeVisible({ timeout: 20_000 });
    await body(window).click();
    await window.keyboard.type(text);
    await expect(window.locator('.save-state')).toHaveText('Opgeslagen', { timeout: 20_000 });
    return context;
  }

  const one = await windowAs(first, 'Wat de eerste zag. ');
  const two = await windowAs(second, 'Wat de tweede zag. ');

  // Both halves of the text are in the archive, and the geschiedenis has two
  // rows under two names — one account, two writers.
  await page.goto(sharedPath);
  await expect(page.locator('.prose').first()).toContainText('Wat de eerste zag.');
  await expect(page.locator('.prose').first()).toContainText('Wat de tweede zag.');

  const history = page.locator('details.section').filter({ hasText: 'Geschiedenis' }).first();
  await history.locator('summary').click();
  await expect(history.getByText(first, { exact: false }).first()).toBeVisible({ timeout: 15_000 });
  await expect(history.getByText(second, { exact: false }).first()).toBeVisible();

  await one.close();
  await two.close();
});

test('a speler with no onderzoeker may make their first artikel, and nothing else', async ({ page, browser }, info) => {
  test.setTimeout(180_000);
  const stamp = `${info.project.name}-${Date.now().toString(36)}`;
  const [notePath] = await keeperWrites(browser, [`Vondst ${stamp}`]);

  await signUpAs(page, `Toeschouwer ${stamp}`);

  // The notice stands at the top of the page, in words, without being asked —
  // and it says what they *can* do, not only what they cannot.
  const banner = page.locator('[data-testid="no-author-banner"]');
  await expect(banner).toBeVisible();
  await expect(banner).toContainText('alleen lezen');
  await expect(banner).toContainText('koppel het aan je account');

  // Nothing is asked of them: there is nothing to choose, so no sheet.
  await page.goto(notePath);
  await expect(banner).toBeVisible();
  await editArticle(page);
  await body(page).click();
  await page.keyboard.type('Toch iets');
  await expect(askSheet(page)).toHaveCount(0);

  // Somebody else's artikel takes nothing from them.
  await expect(body(page)).toHaveAttribute('contenteditable', 'false');
  await expect(body(page)).not.toContainText('Toch iets');

  // Everything else is refused, as the question rather than as an error: a
  // dossier, and an edit to an artikel that already exists.
  const found = await page.request.get(`/api/suggest?q=${encodeURIComponent(`Vondst ${stamp}`)}&limit=1`);
  const noteId = ((await found.json()) as { entries: { id: string }[] }).entries[0].id;
  for (const refusal of [
    await page.request.post('/api/cases', { data: { name: `Zaak ${stamp}` } }),
    await page.request.patch(`/api/entries/${noteId}`, { data: { shortDescription: 'Om de gevel heen' } }),
  ]) {
    expect(refusal.status()).toBe(400);
    expect(await refusal.json()).toMatchObject({ needsAuthor: true });
  }

  /*
   * The one road that is open, and the whole reason it is: an onderzoeker is
   * an artikel somebody tied on, so the first artikel has to be writable by
   * somebody who has nobody. The shortcut opens the sheet (it used to say no),
   * the sheet's button works, and the archive takes it.
   */
  await page.goto('/wiki');
  await page.waitForTimeout(1000);
  const character = `Onderzoeker ${stamp}`;
  const madePath = await newEntry(page, character);
  expect(madePath).toContain('/e/');

  // Made before the archive asked, so it is signed by nobody — and the feed
  // falls back to the account rather than inventing a name.
  await page.goto('/');
  const row = page.locator('.feed-item').filter({ hasText: character }).first();
  await expect(row.locator('strong').first()).toHaveText(`Toeschouwer ${stamp}`);

  // They tie it on, and the archive is theirs to write.
  await page.goto(madePath);
  await page.getByRole('button', { name: 'Dit is mijn karakter' }).click();
  await expect(page.getByText(`Je speelt nu als ${character}.`)).toBeVisible();
  await page.goto('/');
  await expect(banner).toHaveCount(0);

  // And now the ordinary rule: a second artikel is signed like everything
  // else, so the window is asked before it may make one.
  await writeAs(page, character);
  await page.goto('/wiki');
  await page.waitForTimeout(1000);
  const second = await newEntry(page, `Aantekening ${stamp}`);
  expect(second).toContain('/e/');
  await page.goto('/');
  const signed = page.locator('.feed-item').filter({ hasText: `Aantekening ${stamp}` }).first();
  await expect(signed.locator('strong').first()).toHaveText(character);
});

test('a speler ties on their first onderzoeker and no more; the Keeper hands out the rest', async ({
  page,
  browser,
}, info) => {
  test.setTimeout(240_000);
  const stamp = `${info.project.name}-${Date.now().toString(36)}`;
  const account = `Cast ${stamp}`;
  const own = `Eigen ${stamp}`;
  const extra = `Extra ${stamp}`;

  const [ownPath, extraPath] = await keeperWrites(browser, [own, extra]);

  await signUpAs(page, account);

  // Holding nobody, the door is open: their own first one, tied on by them.
  await page.goto(ownPath);
  await page.getByRole('button', { name: 'Dit is mijn karakter' }).click();
  await expect(page.getByText(`Je speelt nu als ${own}.`)).toBeVisible({ timeout: 15_000 });

  /*
   * §18c: and it shuts behind them. On the next fiche the button is not
   * offered at all — not greyed out, not there — because a button that exists
   * only to be refused is worse than no button.
   */
  await page.goto(extraPath);
  // The page is up (the same anchor `editArticle` waits on) before anything is
  // asserted *absent*, or an empty page would pass the next line by itself.
  await expect(page.locator('.entry-mode-toggle')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole('button', { name: 'Dit is mijn karakter' })).toHaveCount(0);

  // Nor is the box on the Jij-pagina, nor a ✕ to take one off again.
  await page.goto('/you');
  await expect(page.getByRole('heading', { name: 'Jouw karakters' })).toBeVisible({ timeout: 15_000 });
  // In the wardrobe, not in the side menu: both print the name of the karakter
  // you are wearing, and the menu's copy is hidden on a phone.
  await expect(page.getByRole('main').getByText(own, { exact: false }).first()).toBeVisible();
  await expect(page.getByPlaceholder('Zoek de artikel van je karakter…')).toHaveCount(0);
  await expect(page.getByRole('button', { name: `${own} ontkoppelen` })).toHaveCount(0);
  // What they *wear* is still theirs, so that one is untouched.
  await expect(page.getByRole('button', { name: /^Als jezelf/ })).toBeVisible();

  /*
   * And the screen is not the rule. A request that goes round it is refused by
   * the archive itself, in words — koppelen and ontkoppelen both.
   */
  async function idOf(name: string): Promise<string> {
    const found = await page.request.get(`/api/suggest?q=${encodeURIComponent(name)}&limit=1`);
    return ((await found.json()) as { entries: { id: string }[] }).entries[0].id;
  }
  const extraId = await idOf(extra);
  const ownId = await idOf(own);

  const tied = await page.request.post('/api/characters', { data: { entryId: extraId } });
  expect(tied.status()).toBe(400);
  expect(((await tied.json()) as { error: string }).error).toContain('Alleen de Keeper');

  const untied = await page.request.delete('/api/characters', { data: { entryId: ownId } });
  expect(untied.status()).toBe(400);
  expect(((await untied.json()) as { error: string }).error).toContain('Alleen de Keeper');

  // The one they already hold is still theirs to take off and put back on:
  // that is §18b's question, not §18c's.
  const worn = await page.request.patch('/api/characters', { data: { active: null } });
  expect(worn.status()).toBe(200);

  /*
   * The Keeper's road, which is now the only one: the account list in Beheer,
   * where every account shows the onderzoekers tied to it and a box to add one.
   */
  await keeperAssigns(browser, account, extra);

  // The player finds it in the wardrobe, and may wear it.
  await page.goto('/you');
  const row = page.locator('li.who-row').filter({ hasText: extra }).first();
  await expect(row).toBeVisible({ timeout: 15_000 });
  await row.getByRole('button', { name: 'Speel als' }).click();
  await expect(row.getByRole('button', { name: 'Actief' })).toBeVisible({ timeout: 15_000 });
  // Still no ✕, and still no box: two on the peg, and both the Keeper's doing.
  await expect(page.getByPlaceholder('Zoek de artikel van je karakter…')).toHaveCount(0);
  await expect(page.getByRole('button', { name: `${extra} ontkoppelen` })).toHaveCount(0);
});
