import { expect, test, type Page } from '@playwright/test';
import { becomeInvestigator, fillWhenReady, inviteCode, signIn } from './helpers';

/**
 * §19: maps.
 *
 * The Keeper hangs a map; a note and an artikel are pinned on it; the legend
 * switches a kind off and remembers that; someone else's pin cannot be pulled
 * by a player; and the artikel knows where it is.
 */

async function signUpAs(page: Page, name: string) {
  await page.goto('/signup');
  await page.getByLabel('Uitnodigingscode').fill(inviteCode());
  await page.getByLabel('Naam', { exact: true }).fill(name);
  await page.getByLabel('Wachtwoord', { exact: true }).fill('onderzeeboot');
  await page.getByLabel('Wachtwoord nogmaals').fill('onderzeeboot');
  await page.getByRole('button', { name: 'Account aanmaken' }).click();
  await page.waitForURL('**/');
}

/*
 * §18b: a speld is a write, so a player who sets one needs an onderzoeker —
 * and so does a player whose refusal is supposed to be about *not being a
 * Keeper*, or the archive answers the other question first.
 */
async function signUpWriting(page: Page, name: string) {
  await signUpAs(page, name);
  await becomeInvestigator(page, `Onderzoeker ${name}`);
}

async function picture(): Promise<Buffer> {
  const sharp = (await import('sharp')).default;
  return sharp({ create: { width: 900, height: 600, channels: 3, background: '#d9d2b8' } })
    .png()
    .toBuffer();
}

/** On a phone the legend hides behind a button; on a desktop it floats on the map. */
async function openLegend(page: Page) {
  const toggle = page.getByRole('button', { name: 'Legenda' });
  if ((await toggle.isVisible()) && (await toggle.getAttribute('aria-expanded')) !== 'true') await toggle.click();
  return page.locator('.map-legend');
}

/**
 * §69 (5.7): op een telefoon is de legenda een blad, en een blad ligt eróver.
 *
 * It used to stand in the flow above the stage, so it could simply be left
 * open; on 390 px it is a bottom `Sheet` now, which is the point — it covers
 * the map instead of shrinking it. So a spec that goes back to the spelden has
 * to put it away first, exactly as a person does. On a desk it is still the
 * floating panel and this is a no-op.
 */
async function closeLegend(page: Page) {
  const sheet = page.getByRole('dialog', { name: 'Legenda' });
  if (await sheet.isVisible().catch(() => false)) {
    await sheet.getByRole('button', { name: 'Sluiten' }).click();
    await expect(sheet).toHaveCount(0);
  }
}

/**
 * A fraction of the *picture*, not of the stage.
 *
 * §34: the stage fills the screen now, so it is a good deal taller than the
 * map hung in it and a fraction of the stage can land on bare cork beside the
 * paper — where a tap places nothing, because a speld only goes on the map
 * (`toPicture` … `inside`). `.map-world` is the picture itself, transform and
 * all, so a fraction of *its* box is a fraction of the map at any fit or zoom.
 */
async function placeAt(page: Page, fx: number, fy: number) {
  const box = await page.locator('.map-world').boundingBox();
  if (!box) throw new Error('no map');
  await page.mouse.click(box.x + box.width * fx, box.y + box.height * fy);
}

test('the Keeper hangs a map, pins go on it, the legend remembers, and a player keeps their hands off', async ({
  page,
  browser,
}, info) => {
  test.setTimeout(180_000);
  const stamp = `${info.project.name}-${Date.now().toString(36)}`;
  const mapName = `Het eiland ${stamp}`;

  await signIn(page, 'Keeper', 'abbeytower34');
  await page.goto('/maps');
  await page.getByRole('button', { name: 'Landkaart ophangen' }).click();
  const sheet = page.getByRole('dialog', { name: 'Landkaart ophangen' });
  await sheet.getByLabel('Afbeelding').setInputFiles({ name: 'eiland.png', mimeType: 'image/png', buffer: await picture() });
  // Typing keeps the field: every keystroke used to hand focus back to the
  // button that opened the sheet (5 Sep 2026).
  await sheet.getByLabel('Naam', { exact: true }).click();
  await page.keyboard.press('Control+a');
  await page.keyboard.type(mapName);
  await expect(sheet.getByLabel('Naam', { exact: true })).toBeFocused();
  await expect(sheet.getByLabel('Naam', { exact: true })).toHaveValue(mapName);
  await sheet.getByLabel('Omschrijving').click();
  await page.keyboard.type('De kaart van de landmeter.');
  await expect(sheet.getByLabel('Omschrijving')).toBeFocused();
  await sheet.getByRole('button', { name: 'Ophangen' }).click();
  await page.waitForURL('**/maps/**');
  const mapUrl = new URL(page.url()).pathname;
  await expect(page.getByRole('heading', { name: mapName })).toBeVisible();
  await expect(page.getByRole('application')).toBeVisible();
  await page.waitForTimeout(500);

  // A note, in the middle.
  await page.getByRole('button', { name: 'Speld zetten' }).click();
  await placeAt(page, 0.5, 0.5);
  const ask = page.getByRole('dialog', { name: 'Wat komt hier?' });
  await expect(ask).toBeVisible();
  // One box: type a name, and the note is one of the rows under it.
  await ask.getByPlaceholder('Zoek een artikel…').fill('Hier lag de boot');
  await ask.getByRole('button', { name: /Notitie .Hier lag de boot. zetten/ }).click();
  await expect(page.locator('.map-pin', { hasText: 'Hier lag de boot' })).toBeVisible();
  // The new pin opens; close it.
  await page.keyboard.press('Escape');

  // An artikel, a bit to the right.
  await page.getByRole('button', { name: 'Speld zetten' }).click();
  await placeAt(page, 0.7, 0.4);
  await ask.getByPlaceholder('Zoek een artikel…').fill('Pier');
  await page.locator('.suggest-item').filter({ hasText: 'Pier Boone' }).first().click();
  await expect(page.locator('.map-pin', { hasText: 'Pier Boone' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('.map-pin')).toHaveCount(2);

  // Zooming grows the map, not the pins: same size at 1x and after three
  // steps in — they live in their own unscaled layer (5 Sep 2026).
  const pinBefore = (await page.locator('.map-pin', { hasText: 'Pier Boone' }).boundingBox())!;
  for (let i = 0; i < 3; i++) await page.getByRole('button', { name: 'Inzoomen' }).click();
  await page.waitForTimeout(200);
  const pinAfter = (await page.locator('.map-pin', { hasText: 'Pier Boone' }).boundingBox())!;
  expect(Math.round(pinAfter.height)).toBe(Math.round(pinBefore.height));
  expect(Math.round(pinAfter.width)).toBe(Math.round(pinBefore.width));
  // §69: this button was the landkaart's own "Passend maken"; every canvas
  // says "Alles in beeld" now, and it is the same button on all four.
  await page.getByRole('button', { name: 'Alles in beeld' }).click();

  // The legend: one line per kind, and switching notes off hides the note.
  const legend = await openLegend(page);
  await expect(legend.getByText('Notities')).toBeVisible();
  await legend.getByRole('checkbox', { name: /Notities/ }).uncheck();
  await expect(page.locator('.map-pin')).toHaveCount(1);
  await page.reload();
  await expect(page.getByRole('application')).toBeVisible();
  await expect(page.locator('.map-pin')).toHaveCount(1);
  await (await openLegend(page)).getByRole('checkbox', { name: /Notities/ }).check();
  await expect(page.locator('.map-pin')).toHaveCount(2);
  await closeLegend(page);

  // The artikel knows where it is.
  await page.locator('.map-pin', { hasText: 'Pier Boone' }).click();
  const pinSheet = page.getByRole('dialog', { name: 'Pier Boone' });
  await expect(pinSheet).toBeVisible();
  await pinSheet.getByRole('link', { name: 'Artikel openen' }).click();
  await page.waitForURL('**/e/**');
  await expect(page.getByRole('link', { name: mapName })).toBeVisible();

  // A player sees both pins but may not pull the Keeper's.
  const otherCtx = await browser.newContext();
  const other = await otherCtx.newPage();
  await signUpWriting(other, `Kaartlezer ${stamp}`);
  await other.goto(mapUrl);
  await expect(other.locator('.map-pin')).toHaveCount(2);
  await other.locator('.map-pin', { hasText: 'Hier lag de boot' }).click();
  const theirs = other.getByRole('dialog', { name: 'Hier lag de boot' });
  await expect(theirs.getByText(/van iemand anders/)).toBeVisible();
  await expect(theirs.getByRole('button', { name: 'Speld weghalen' })).toHaveCount(0);
  const pinId = await other.locator('.map-pin', { hasText: 'Hier lag de boot' }).getAttribute('data-pin-id');
  const mapSlug = mapUrl.split('/maps/')[1];
  const list = await other.request.get('/api/maps');
  const maps = (await list.json()) as { maps: { id: string; slug: string }[] };
  const found = maps.maps.find((m) => m.slug === mapSlug);
  expect(found).toBeTruthy();
  const refused = await other.request.delete(`/api/maps/${found!.id}/pins/${pinId}`);
  expect(refused.ok()).toBe(false);
  // …but may set one of their own, and pull that.
  await other.keyboard.press('Escape');
  await other.getByRole('button', { name: 'Speld zetten' }).click();
  await placeAt(other, 0.3, 0.7);
  const ask2 = other.getByRole('dialog', { name: 'Wat komt hier?' });
  await ask2.getByPlaceholder('Zoek een artikel…').fill('Mijn eigen speld');
  await ask2.getByRole('button', { name: /Notitie .Mijn eigen speld. zetten/ }).click();
  const own = other.getByRole('dialog', { name: 'Mijn eigen speld' });
  await expect(own).toBeVisible();
  /*
   * §69: no confirm any more. It goes on the press, and the toast carries the
   * undo — this is the line that used to be a second dialog.
   *
   * The id is read *before* the press, because what is being asserted is that
   * the speld comes back rather than that a speld comes back: `restorePin`
   * lifts `deleted_at` off the row that was always there, where the re-POST it
   * replaced would have minted a new id and put this account's name on it.
   */
  const ownPin = other.locator('.map-pin', { hasText: 'Mijn eigen speld' });
  const ownId = await ownPin.getAttribute('data-pin-id');
  await own.getByRole('button', { name: 'Speld weghalen' }).click();
  await expect(other.locator('.map-pin')).toHaveCount(2);
  await expect(ownPin).toHaveCount(0);

  /*
   * §69: scoped to the toast. The landkaart's toolbar has a button of the same
   * name since this round, so a bare locator matches two things.
   */
  await other.locator('.toast').getByRole('button', { name: 'Ongedaan maken' }).click();
  await expect(other.locator(`.map-pin[data-pin-id="${ownId}"]`)).toBeVisible();
  await expect(other.locator('.map-pin')).toHaveCount(3);
  await otherCtx.close();
});

/**
 * Hang a landkaart and stand on it. The same five steps three tests in this
 * file take; this one is factored out because the rights test needs a map and
 * not another assertion about the sheet that makes one.
 */
async function hangMap(page: Page, name: string): Promise<string> {
  await page.goto('/maps');
  await page.getByRole('button', { name: 'Landkaart ophangen' }).click();
  const sheet = page.getByRole('dialog', { name: 'Landkaart ophangen' });
  await sheet.getByLabel('Afbeelding').setInputFiles({ name: 'eiland.png', mimeType: 'image/png', buffer: await picture() });
  await sheet.getByLabel('Naam', { exact: true }).click();
  await page.keyboard.press('Control+a');
  await page.keyboard.type(name);
  await expect(sheet.getByLabel('Naam', { exact: true })).toHaveValue(name);
  await sheet.getByRole('button', { name: 'Ophangen' }).click();
  await page.waitForURL('**/maps/**');
  await expect(page.getByRole('heading', { name })).toBeVisible();
  await expect(page.getByRole('application')).toBeVisible();
  return new URL(page.url()).pathname;
}

/**
 * §34 put every one of the Keeper's map tools below the fold, and §17's dials
 * went in with them: **Rechten** is the last block of "Deze landkaart".
 */
async function openMapRights(page: Page) {
  const panel = page.locator('summary').filter({ hasText: /Deze landkaart/ }).first();
  await panel.waitFor({ state: 'visible', timeout: 15_000 });
  if ((await panel.getAttribute('aria-expanded')) !== 'true') await panel.click();
  await page.getByRole('radiogroup', { name: 'Wie mag kijken' }).waitFor({ state: 'visible', timeout: 10_000 });
}

/**
 * §17 on a landkaart, asserted from the other side.
 *
 * A landkaart used to have no dial at all: every signed-in person saw every
 * one of them, so a plattegrond could not be kept back until the players found
 * the house. It has the same two dials as an artikel, a dossier, a prikbord and
 * a tijdlijn now, drawn by the same panel — and, exactly as in
 * `access-rights.spec.ts`, every assertion here is made by the person who was
 * *not* chosen, because a right enforced on the owner's screen is decoration.
 */
test('a landkaart the Keeper keeps back is nowhere, until the player is chosen', async ({
  page,
  browser,
}, info) => {
  test.setTimeout(180_000);
  const stamp = `${info.project.name}-${Date.now().toString(36)}`;
  const mapName = `Plattegrond ${stamp}`;
  const playerName = `Kaartkijker ${stamp}`;

  await signIn(page, 'Keeper', 'abbeytower34');
  const mapUrl = await hangMap(page, mapName);
  const mapSlug = mapUrl.split('/maps/')[1];

  /*
   * §18b: the player makes their onderzoeker first. They write nothing in this
   * test, but a speler with nobody is read-only everywhere, and a refusal that
   * turns out to be about the pen rather than about the dial proves nothing.
   */
  const otherCtx = await browser.newContext();
  const other = await otherCtx.newPage();
  await signUpWriting(other, playerName);

  // A new map is hung for everyone — the dial nobody has touched changes nothing.
  await other.goto('/maps');
  await expect(other.getByRole('link', { name: new RegExp(mapName) })).toBeVisible();
  expect((await other.goto(mapUrl))?.status()).toBe(200);

  // The Keeper turns it down: Rechten → Wie mag kijken → Privé.
  await openMapRights(page);
  await page.getByRole('radiogroup', { name: 'Wie mag kijken' }).getByRole('radio', { name: 'Privé' }).click();
  await page.waitForTimeout(800);

  // And now it is nowhere: not on the shelf, not at its URL, not in the API.
  await other.goto('/maps');
  await expect(other.getByRole('link', { name: new RegExp(mapName) })).toHaveCount(0);
  expect((await other.goto(mapUrl))?.status()).toBe(404);
  const hidden = await other.request.get('/api/maps');
  const hiddenList = (await hidden.json()) as { maps: { slug: string }[] };
  expect(hiddenList.maps.some((m) => m.slug === mapSlug)).toBe(false);

  // The Keeper still has it, always.
  await page.reload();
  await expect(page.getByRole('heading', { name: mapName })).toBeVisible();

  // Gekozen personen, and this player ticked.
  await openMapRights(page);
  await page
    .getByRole('radiogroup', { name: 'Wie mag kijken' })
    .getByRole('radio', { name: 'Gekozen personen' })
    .click();
  const chip = page.getByRole('checkbox', { name: new RegExp(playerName) });
  await chip.waitFor({ state: 'visible', timeout: 15_000 });
  await chip.click();
  await page.waitForTimeout(800);

  // It is back, for them and for nobody who was not named.
  await other.goto('/maps');
  await expect(other.getByRole('link', { name: new RegExp(mapName) })).toBeVisible();
  expect((await other.goto(mapUrl))?.status()).toBe(200);

  const thirdCtx = await browser.newContext();
  const third = await thirdCtx.newPage();
  await signUpWriting(third, `Buitenstaander ${stamp}`);
  await third.goto('/maps');
  await expect(third.getByRole('link', { name: new RegExp(mapName) })).toHaveCount(0);
  expect((await third.goto(mapUrl))?.status()).toBe(404);
  await thirdCtx.close();

  await otherCtx.close();
});

/**
 * §39: a speld on a landkaart that stands for another landkaart.
 *
 * The way down and the way back up, walked in one go: the Keeper hangs two
 * maps, pins the small one on the big one, taps the speld — which opens the
 * *sheet*, not the other map, because that is where "gezet door", the drag
 * hint and "speld weghalen" live and a speld that navigated on one tap could
 * never be moved on a telephone — and takes the button from there. The chip in
 * the heading is the road back: without it a plattegrond three levels down is
 * a dead end.
 */
test('a landkaart hangs on a landkaart, and there is a way back up', async ({ page }, info) => {
  test.setTimeout(180_000);
  const stamp = `${info.project.name}-${Date.now().toString(36)}`;
  const big = `Zeeland ${stamp}`;
  const small = `De stad ${stamp}`;

  await signIn(page, 'Keeper', 'abbeytower34');
  const smallUrl = await hangMap(page, small);
  const bigUrl = await hangMap(page, big);
  await page.waitForTimeout(500);

  // The small map goes on the big one. The same sheet an artikel speld uses:
  // one box, and a "Landkaarten" row under it.
  await page.getByRole('button', { name: 'Speld zetten' }).click();
  await placeAt(page, 0.4, 0.6);
  const ask = page.getByRole('dialog', { name: 'Wat komt hier?' });
  await expect(ask).toBeVisible();
  await fillWhenReady(ask.getByPlaceholder('Zoek een artikel…'), small);
  await ask
    .locator('.suggest-item')
    .filter({ hasText: small })
    .filter({ hasText: /Landkaart/ })
    .first()
    .click();
  await expect(page.locator('.map-pin', { hasText: small })).toBeVisible();

  // Setting it opens its sheet, as every speld does.
  const pinSheet = page.getByRole('dialog', { name: small });
  await expect(pinSheet).toBeVisible();
  await expect(pinSheet.getByRole('button', { name: 'Speld weghalen' })).toBeVisible();

  /*
   * §69 (3.3): on a desk that blad is **docked**, not modal — the landkaart
   * goes on living behind it, as the cork does behind `BoardInspector`. Two
   * halves of the one claim: the panel says it is not modal, and the camera
   * behind it still answers a press, which under the `Sheet` this replaced was
   * impossible because the backdrop swallowed it. On a phone it is still a
   * sheet and there is no `.map-panel` at all — the deliberate difference, for
   * the reason written above `pinPanel` in `MapCanvas.tsx`.
   */
  if (info.project.name === 'desktop') {
    await expect(page.locator('.map-panel')).toBeVisible();
    await expect(pinSheet).not.toHaveAttribute('aria-modal', 'true');
    const zoom = page.getByRole('group', { name: 'Zoomen', exact: true });
    const level = zoom.locator('.canvas-zoom-level');
    const before = await level.textContent();
    await zoom.getByRole('button', { name: 'Inzoomen' }).click();
    await expect(level, 'the camera answers while the blad is open').not.toHaveText(before ?? '');
    await expect(pinSheet, 'and the blad stays open while it does').toBeVisible();
    await zoom.getByRole('button', { name: 'Alles in beeld' }).click();
  } else {
    await expect(page.locator('.map-panel')).toHaveCount(0);
  }

  // Escape puts it away on both roads.
  await page.keyboard.press('Escape');
  await expect(pinSheet).toBeHidden();

  // The legend gets a row of its own for nothing, and it switches off like
  // any other kind.
  const legend = await openLegend(page);
  await expect(legend.getByText('Landkaarten', { exact: true })).toBeVisible();
  await legend.getByRole('checkbox', { name: /Landkaarten/ }).uncheck();
  await expect(page.locator('.map-pin')).toHaveCount(0);
  await legend.getByRole('checkbox', { name: /Landkaarten/ }).check();
  await expect(page.locator('.map-pin')).toHaveCount(1);
  await closeLegend(page);

  // The way down: the sheet, not the tap. A speld that navigated on one tap
  // could never be dragged to another spot on a telephone.
  await page.locator('.map-pin', { hasText: small }).click();
  await expect(pinSheet).toBeVisible();
  await pinSheet.getByRole('link', { name: 'Landkaart openen' }).click();
  await page.waitForURL((url) => new URL(url).pathname === smallUrl);
  await expect(page.getByRole('heading', { name: small })).toBeVisible();

  // …and the heading of the small map carries the way back up.
  await expect(page.getByText('Op de grotere landkaart:')).toBeVisible();
  await page.getByRole('link', { name: big }).click();
  await page.waitForURL((url) => new URL(url).pathname === bigUrl);
  await expect(page.getByRole('heading', { name: big })).toBeVisible();
  // §5: and the speld is still there. Without a `router.refresh()` after
  // setting one, this lands on the payload of the big map from before it.
  await expect(page.locator('.map-pin', { hasText: small })).toBeVisible();

  // A speld may not point at the landkaart it stands on: it would open the
  // page it is already on, which is not a way anywhere.
  const list = await page.request.get('/api/maps');
  const maps = (await list.json()) as { maps: { id: string; slug: string }[] };
  const bigId = maps.maps.find((m) => m.slug === bigUrl.split('/maps/')[1])!.id;
  const refused = await page.request.post(`/api/maps/${bigId}/pins`, {
    data: { kind: 'map', targetMapId: bigId, x: 0.5, y: 0.5 },
  });
  expect(refused.ok()).toBe(false);
});

test('a player cannot hang a map', async ({ page }, info) => {
  await signUpWriting(page, `Geen keeper ${info.project.name}-${Date.now().toString(36)}`);
  await page.goto('/maps');
  await expect(page.getByRole('button', { name: 'Landkaart ophangen' })).toHaveCount(0);
  const refused = await page.request.post('/api/maps', {
    multipart: { name: 'x', file: { name: 'x.png', mimeType: 'image/png', buffer: await picture() } },
  });
  expect(refused.status()).toBe(403);
});

/**
 * §69 (2.1 + 3.2 + 4.9) — de landkaart kiest, sleept, wist en heet iets.
 *
 * Tafel 1 van het contract had voor de landkaart één rij die nog `TOEVAL` zei:
 * er kon precies één speld tegelijk gekozen worden. Niet omdat dat zo besloten
 * was — het was er nooit van gekomen. Dus geen shift, geen kader, geen manier
 * om er drie te verplaatsen of vier weg te halen, en geen Escape om iets los te
 * laten.
 *
 * De wereld is hier de plaat in bréuken (een speld staat zo opgeslagen), dus
 * het kader wordt in `.map-world`-coördinaten getrokken — precies zoals
 * `placeAt` hierboven al doet, en om dezelfde reden.
 */
test('§69: spelden kiezen met shift en een kader, samen slepen, en Delete haalt ze weg', async ({
  page,
}, info) => {
  test.skip(info.project.name === 'phone', '§67: shift en een kader willen een toetsenbord en een muis');
  test.setTimeout(180_000);
  const stamp = `${info.project.name}-${Date.now().toString(36)}`;

  await signIn(page, 'Keeper', 'abbeytower34');
  const mapUrl = await hangMap(page, `Kiezen ${stamp}`);
  expect(mapUrl).toContain('/maps/');
  await page.waitForTimeout(500);

  /** Een notitie-speld op een plek in de plaat. */
  const note = async (name: string, fx: number, fy: number) => {
    await page.getByRole('button', { name: 'Speld zetten' }).click();
    await placeAt(page, fx, fy);
    const ask = page.getByRole('dialog', { name: 'Wat komt hier?' });
    await expect(ask).toBeVisible();
    await fillWhenReady(ask.getByPlaceholder('Zoek een artikel…'), name);
    await ask.getByRole('button', { name: new RegExp(`Notitie .${name}. zetten`) }).click();
    await expect(page.locator('.map-pin', { hasText: name })).toBeVisible();
    // Zetten opent het blad; leg het weg voor de volgende.
    await page.keyboard.press('Escape');
  };

  await note(`Een ${stamp}`, 0.25, 0.3);
  await note(`Twee ${stamp}`, 0.45, 0.3);
  await note(`Drie ${stamp}`, 0.75, 0.75);
  await expect(page.locator('.map-pin')).toHaveCount(3);
  await page.keyboard.press('Escape');

  const one = page.locator('.map-pin', { hasText: `Een ${stamp}` });
  const two = page.locator('.map-pin', { hasText: `Twee ${stamp}` });
  const three = page.locator('.map-pin', { hasText: `Drie ${stamp}` });

  /* ---- shift-klik wisselt, Escape wist ---- */
  await one.click();
  await expect(one).toHaveAttribute('aria-pressed', 'true');
  await two.click({ modifiers: ['Shift'] });
  await expect(two).toHaveAttribute('aria-pressed', 'true');
  await expect(one, 'shift voegt toe, het vervangt niet').toHaveAttribute('aria-pressed', 'true');
  // Met twee gekozen is er geen blad: dat hoort bij precies één.
  await expect(page.locator('.map-panel')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(one).toHaveAttribute('aria-pressed', 'false');
  await expect(two).toHaveAttribute('aria-pressed', 'false');

  /* ---- shift-slepen veegt een kader, en dat kiest wat het raakt ---- */
  const world = (await page.locator('.map-world').boundingBox())!;
  const at = (fx: number, fy: number) => ({
    x: world.x + world.width * fx,
    y: world.y + world.height * fy,
  });
  const from = at(0.12, 0.15);
  const to = at(0.6, 0.45);
  await page.keyboard.down('Shift');
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 10 });
  await expect(page.getByTestId('map-marquee'), 'het kader staat er terwijl je veegt').toBeVisible();
  await page.mouse.up();
  await page.keyboard.up('Shift');
  await expect(page.getByTestId('map-marquee')).toHaveCount(0);

  // Twee geraakt, de derde niet — het kader vervángt, en raken is genoeg.
  await expect(one).toHaveAttribute('aria-pressed', 'true');
  await expect(two).toHaveAttribute('aria-pressed', 'true');
  await expect(three).toHaveAttribute('aria-pressed', 'false');

  /* ---- de groep sleept in één gebaar, en gaat in één stap terug ---- */
  const before = { one: (await one.boundingBox())!, two: (await two.boundingBox())! };
  const grab = { x: before.one.x + before.one.width / 2, y: before.one.y + before.one.height / 2 };
  await page.mouse.move(grab.x, grab.y);
  await page.mouse.down();
  await page.mouse.move(grab.x, grab.y + 90, { steps: 12 });
  await page.mouse.up();
  await page.waitForTimeout(400);
  const after = { one: (await one.boundingBox())!, two: (await two.boundingBox())! };
  expect(after.one.y, 'de opgepakte speld reist').toBeGreaterThan(before.one.y + 40);
  expect(
    after.two.y,
    'en de andere gekozene reist even ver mee — dat is wat een groep is',
  ).toBeGreaterThan(before.two.y + 40);

  // Eén Ctrl+Z voor het hele gebaar, niet één per speld.
  await page.keyboard.press('Control+z');
  await expect(async () => {
    const back = (await two.boundingBox())!;
    expect(Math.abs(back.y - before.two.y)).toBeLessThan(6);
  }).toPass({ timeout: 15_000 });

  /* ---- Delete haalt de keuze weg, en de melding geeft ze terug ---- */
  await expect(one).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('Delete');
  await expect(page.locator('.map-pin')).toHaveCount(1);
  await page.locator('.toast').getByRole('button', { name: 'Ongedaan maken' }).click();
  await expect(page.locator('.map-pin')).toHaveCount(3);
});

/**
 * §69 (4.9): de naam van een landkaart is de kop zelf, en de kop is het vak.
 *
 * De stamboom vond dit uit in §66; tot deze ronde kon een landkaart alleen
 * omgedoopt worden door een nieuwe op te hangen, wat geen omdopen is. Eén
 * component nu (`components/canvas/CanvasTitle.tsx`), drie tekenvlakken.
 */
test('§69: een landkaart is ter plekke om te dopen', async ({ page }, info) => {
  test.setTimeout(120_000);
  const stamp = `${info.project.name}-${Date.now().toString(36)}`;
  const was = `Oude naam ${stamp}`;
  const now = `Nieuwe naam ${stamp}`;

  await signIn(page, 'Keeper', 'abbeytower34');
  await hangMap(page, was);

  const box = page.locator('#map-title-name');
  await expect(box).toHaveValue(was);
  await box.click();
  await page.keyboard.press('Control+a');
  await page.keyboard.type(now);
  // Enter laat los, en loslaten bewaart.
  await page.keyboard.press('Enter');

  // De plank is server-gerenderd, dus de hernoeming moet er ook staan na een
  // herlaadbeurt — anders was het alleen op dit scherm waar.
  await page.reload();
  await expect(page.locator('#map-title-name')).toHaveValue(now, { timeout: 20_000 });
  await page.goto('/maps');
  await expect(page.getByRole('link', { name: now })).toBeVisible({ timeout: 20_000 });
});
