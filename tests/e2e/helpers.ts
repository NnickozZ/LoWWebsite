import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { expect, type Locator, type Page } from '@playwright/test';

const root = resolve(__dirname, '../..');

export function inviteCode(): string {
  return readFileSync(join(root, 'data-e2e', 'invite.txt'), 'utf8').trim();
}

/**
 * The "+" is a FAB on phones and a sidebar button on desktop; click whichever
 * is on screen. Some pages (the wiki) carry a second one of their own, so the
 * first visible one is the answer.
 */
export function newEntryButton(page: Page) {
  return page.getByRole('button', { name: 'Nieuw artikel' }).locator('visible=true').first();
}

export async function signIn(page: Page, username: string, password: string) {
  await page.goto('/login');
  await page.getByLabel('Naam').fill(username);
  await page.getByLabel('Wachtwoord').fill(password);
  await page.getByRole('button', { name: 'Inloggen' }).click();
  await page.waitForURL('**/');
}

export async function signUp(page: Page, username: string, password: string) {
  await page.goto('/signup');
  await page.getByLabel('Uitnodigingscode').fill(inviteCode());
  await page.getByLabel('Naam').fill(username);
  await page.getByLabel('Wachtwoord', { exact: true }).fill(password);
  await page.getByLabel('Wachtwoord nogmaals').fill(password);
  await page.getByRole('button', { name: 'Account aanmaken' }).click();
  await page.waitForURL('**/');
}

/** A name as a locator: a substring match that survives punctuation in it. */
function nameLike(name: string): RegExp {
  return new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
}

/**
 * §18b: the window's answer to "Met wie ben je nu aan het schrijven?".
 *
 * A speler who has just tied their first onderzoeker on has a name on their
 * account but not in *this window*, so the archive would stand the blocking
 * sheet in front of the very next keystroke. That is the right behaviour and
 * the wrong moment to meet it in the middle of another test, so this answers
 * it deliberately, from the one place both viewports have the switch: the line
 * above the wardrobe on the Jij page.
 */
export async function writeAs(page: Page, character: string) {
  await page.goto('/you');
  // Scoped to the page body: the line is on the Jij page *and* in the side
  // menu, and a bare test id would be two elements on a desktop.
  const line = page.getByRole('main').getByTestId('writing-as');
  await line.waitFor({ state: 'visible', timeout: 15_000 });
  const sheet = page.getByRole('dialog', { name: 'Met wie ben je nu aan het schrijven?' });
  // Clicked again until it answers: a button that is on screen is not yet a
  // button that is listening, and this runs straight after a navigation.
  await pressUntil(page, () => line.click({ timeout: 5000 }), sheet);
  await sheet.getByRole('radio', { name: nameLike(character) }).click();
  await sheet.waitFor({ state: 'detached', timeout: 15_000 });
}

/**
 * Does the thing until the thing it opens is on screen. Every "press n until
 * the sheet answers" loop in this suite is the same idea: right after a
 * navigation React may not have picked the page up yet, and a click into a
 * page that is not listening is silence rather than an error.
 */
async function pressUntil(
  page: Page,
  /** Bounded by a timeout of its own: a press that cannot land must not hang. */
  act: () => Promise<void>,
  target: ReturnType<Page['locator']>,
  attempts = 8,
) {
  for (let attempt = 0; attempt < attempts; attempt++) {
    if (await target.isVisible().catch(() => false)) return;
    // A press that lands takes its own button off the screen sometimes (the
    // wardrobe's does), so a later attempt failing to find it is not a failure
    // — the check at the top of the loop is the one that decides.
    await act().catch(() => undefined);
    await page.waitForTimeout(400);
  }
  await target.waitFor({ state: 'visible', timeout: 10_000 });
}

/**
 * §18b: give a freshly signed-up speler an onderzoeker, exactly the way a real
 * one gets theirs — make the artikel, tie it on, say who this window is.
 *
 * The archive lets somebody with no onderzoeker at all make an artikel and
 * nothing else (`requireAuthorOrFirstCharacter`), because an onderzoeker *is*
 * an artikel tied to an account and there is no other road to the first one.
 * Every test whose player goes on to write anything — a dossier, a proposal, a
 * card, a streek, a speld — walks that road here first, rather than borrowing
 * a fiche the Keeper wrote for them.
 *
 * The name matters more than it looks: presence, carets, the hand on a card
 * and the feed all print the *onderzoeker*, not the account. A test that
 * asserts a name on screen should hand the same one in.
 *
 * Leaves the browser back on the start page, where signing up left it, so it
 * drops in after any `signUp` without moving the test's own ground. Returns
 * the path of the artikel that is now their onderzoeker.
 */
export async function becomeInvestigator(page: Page, character: string): Promise<string> {
  await page.goto('/');
  const sheet = page.getByRole('dialog', { name: 'Nieuw artikel' });
  await pressUntil(page, () => newEntryButton(page).click({ timeout: 5000 }), sheet);
  await sheet.getByLabel('Naam').fill(character);
  await sheet.getByRole('button', { name: 'Aanmaken' }).click();
  await page.waitForURL('**/e/**');
  const path = new URL(page.url()).pathname;

  const said = page.getByText(`Je speelt nu als ${character}.`);
  await pressUntil(
    page,
    () => page.getByRole('button', { name: 'Dit is mijn karakter' }).click({ timeout: 5000 }),
    said,
  );

  await writeAs(page, character);
  await page.goto('/');
  return path;
}

/**
 * §22: an artikel opens on the face this person asked for, and a freshly
 * signed-up player's face is reading. A test that means to type into the page
 * has to ask for the editing one first, exactly as a person would — the toggle
 * at the top of the header. Already editing (a Keeper, or a page reached with
 * `?new=1`), this does nothing.
 *
 * §23: a dossier wears the same pair of faces and the same toggle, so this
 * takes the field it should wait for — `editCase` below is the same call with
 * the dossier's name box.
 */
export async function editArticle(page: Page, field = '#entry-name') {
  const toggle = page.locator('.entry-mode-toggle');
  await toggle.waitFor({ state: 'visible', timeout: 15_000 });
  if ((await toggle.innerText()).trim() === 'Bewerken') {
    await toggle.click();
    // The inputs replace the prose on the next render; give React the frame.
    await page.locator(field).waitFor({ state: 'visible', timeout: 10_000 });
  }
}

/** §23: the same, for a dossier. A player lands on its reading face too. */
export async function editCase(page: Page) {
  return editArticle(page, '#case-name');
}

/**
 * §22: the image tools live behind one "Afbeelding" button now. Opens that
 * menu and picks one of them. With no picture yet there is no menu — the one
 * thing to do is a button of its own — so this is only for an artikel that
 * already has a cover.
 */
export async function imageMenu(page: Page, item: RegExp | string) {
  await page.locator('.cover-menu-button').click();
  await page.getByRole('menuitem', { name: item }).click();
}

/**
 * §25: the Keeper's dials used to be a panel of their own, "Zichtbaarheid en
 * onthullingen". They are one half of "Rechten" now — same controls, one
 * heading — so a test that wants them opens that.
 */
export async function openRights(page: Page) {
  const rights = page.locator('summary').filter({ hasText: 'Rechten' }).first();
  await rights.waitFor({ state: 'visible', timeout: 15_000 });
  if ((await rights.getAttribute('aria-expanded')) !== 'true') await rights.click();
  await page.locator('.rights-half').first().waitFor({ state: 'visible', timeout: 10_000 });
}

/**
 * §25: inside a dossier the button that makes a wall says what it does —
 * "Maak nieuw prikbord voor dit dossier" — rather than what its rights are.
 * On the prikborden-pagina, where the choice really is openbaar or privé, it
 * still says "Openbaar prikbord". This is the one inside a dossier.
 */
export async function newCaseBoard(page: Page) {
  const tab = page.getByRole('tab', { name: 'Prikbord' });
  if (await tab.isVisible().catch(() => false)) await tab.click();
  await page.getByRole('button', { name: /Maak nieuw prikbord voor dit dossier/ }).click();
  await page.waitForURL('**/b/**');
}

/**
 * Fill a field on a page that has only just arrived.
 *
 * Every input in this archive is on the screen before React has picked it up:
 * the server draws it, and for a moment — longest on the first page that pulls
 * a chunk of script the browser has never seen — it is a box with nothing
 * behind it. A `fill` that lands in that gap puts the letters in the DOM and
 * the render that follows wipes them: nothing was typed as far as the archive
 * is concerned, so nothing is saved and the save state never moves off "".
 * A person is far too slow to hit that window; Playwright is not, which is why
 * this shows up as one desktop run in ten and never on the phone.
 *
 * So: fill, and fill again, until the field is still holding what it was given
 * a beat later — the same "press it until it answers" loop the sheets above
 * use, for exactly the same reason.
 */
export async function fillWhenReady(field: Locator, text: string) {
  await expect(async () => {
    await field.fill(text);
    await field.page().waitForTimeout(300);
    expect(await field.inputValue()).toBe(text);
  }).toPass({ timeout: 20_000 });
}

/**
 * §30: a picture on the clipboard, pasted onto whatever is listening.
 *
 * The screens that take one — the cork, the axis, a gebeurtenis's blad — all
 * listen on `document`, so this dispatches a real `paste` at `document.body`
 * with a real `File` in a real `DataTransfer` and lets it bubble. Nothing is
 * stubbed: `imageFromClipboard` reads it exactly as it reads a screenshot
 * copied out of a browser tab, and everything after it is the ordinary upload.
 *
 * The name matters, because the card and the gebeurtenis are named after the
 * file — so give each test its own and there is something unique to find.
 */
export async function pasteImage(page: Page, fileName: string) {
  const bytes = readFileSync(join(root, 'data-e2e', 'fixture-photo.png')).toString('base64');
  await page.evaluate(
    ({ bytes, fileName }) => {
      const binary = atob(bytes);
      const buffer = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i += 1) buffer[i] = binary.charCodeAt(i);
      const file = new File([buffer], fileName, { type: 'image/png' });
      const carrier = new DataTransfer();
      carrier.items.add(file);
      document.body.dispatchEvent(
        new ClipboardEvent('paste', { clipboardData: carrier, bubbles: true, cancelable: true }),
      );
    },
    { bytes, fileName },
  );
}
