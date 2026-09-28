import { mkdirSync } from 'node:fs';
import { expect, test, type Browser, type Locator, type Page } from '@playwright/test';
import { becomeInvestigator, fillWhenReady, inviteCode, signIn } from './helpers';

/**
 * Ronde 65·herstel — de schil, na de onafhankelijke design-review.
 *
 *   #2  In Lezen roept een klik, een tik of lang drukken op de tekst de
 *       schrijfvraag nooit op; in Bewerken nog wél (§18b/§90).
 *   #3  De leeskolom van de Keeper is even breed als die van een speler, en de
 *       strip en de Keeperkant-knop liggen nergens over (1440×900).
 *   #4  Op de telefoon ligt de Keeperkant-knop over geen enkele kopknop.
 *   #5  Een navigatie begint bij opacity 0,6, niet bij een leeg frame.
 *   #10 De FAB wijkt op een leespagina bij naar beneden scrollen, en staat
 *       boven een melding in plaats van eronder.
 *   #12 De achtergrond van een blad komt erbij (`sheet-shade-in`), en gaat weg
 *       op de standaardcurve. Het palet beweegt niet.
 *   #15 *Verbinden…* staat er pas na 1,5 s zonder lijn.
 *   #25 Een melding op `/uitdelen` ligt niet over de plakkende voet.
 *   #27 Het palet: geen lege groep boven een handeling die past, en *Verras me*
 *       is een dobbelsteen.
 *
 * `HERSTEL_VOOR=1` draait dezelfde zaken tegen de oude code, met zachte
 * asserties: dan zijn het metingen en screenshots (`voor-*`), geen oordeel.
 */

const VOOR = Boolean(process.env.HERSTEL_VOOR);
const check = VOOR ? expect.soft : expect;
const KEEPER = ['Keeper', 'abbeytower34'] as const;
const PASSWORD = 'onderzeeboot';
const SHOTS = '/tmp/claude-0/shots-f1';
mkdirSync(SHOTS, { recursive: true });

const shot = (page: Page, name: string, fullPage = false) =>
  page.screenshot({ path: `${SHOTS}/${VOOR ? 'voor' : 'na'}-${name}.png`, fullPage });

const askSheet = (page: Page) => page.getByRole('dialog', { name: 'Met wie ben je nu aan het schrijven?' });

const PARAGRAPHS = Array.from({ length: 28 }, (_, i) =>
  i % 3 === 0
    ? 'De kaart klopt hier niet meer. Sinds de Drift valt de post hier één keer per week, en dan nog met gaten in de zakken.'
    : i % 3 === 1
      ? 'Wie hier iets wil weten begint bij de havenmeester, en wie iets wil regelen bij de broeders van het stille water.'
      : 'Aan de kades is het druk op uren die geen eerlijke lading kent, en het licht van de vuurtoren draait een slag te traag.',
);
const LONG_BODY = {
  type: 'doc',
  content: PARAGRAPHS.map((text) => ({ type: 'paragraph', content: [{ type: 'text', text }] })),
};

async function signUpAs(page: Page, name: string) {
  await page.goto('/signup');
  await page.getByLabel('Uitnodigingscode').fill(inviteCode());
  await page.getByLabel('Naam', { exact: true }).fill(name);
  await page.getByLabel('Wachtwoord', { exact: true }).fill(PASSWORD);
  await page.getByLabel('Wachtwoord nogmaals').fill(PASSWORD);
  await page.getByRole('button', { name: 'Account aanmaken' }).click();
  await page.waitForURL('**/');
}

type Made = { id: string; slug: string };

async function make(keeper: Page, typeSlug: string, name: string, body?: unknown, fields?: Record<string, unknown>): Promise<Made> {
  const made = await keeper.request.post('/api/entries', { data: { typeSlug, name, keeperOnly: false } });
  expect(made.ok()).toBe(true);
  const { entry } = (await made.json()) as { entry: Made };
  if (body) {
    const patched = await keeper.request.patch(`/api/entries/${entry.id}`, { data: { body, ...(fields ? { fields } : {}) } });
    expect(patched.ok()).toBe(true);
  }
  return entry;
}

/**
 * The Keeper's half of the world: one long artikel, and — when `account` is
 * given — two fiches tied to that account (§18c, the Keeper's road).
 */
async function keeperWorld(browser: Browser, stamp: string, account?: string) {
  const context = await browser.newContext();
  const keeper = await context.newPage();
  await signIn(keeper, ...KEEPER);
  const article = await make(keeper, 'location', `Kustlicht ${stamp}`, LONG_BODY, { region: 'Walcheren' });
  const fiche = await make(keeper, 'character', `Fiche ${stamp}`);
  if (account) {
    const second = await make(keeper, 'character', `Tweede ${stamp}`);
    const users = (await (await keeper.request.get('/api/users')).json()) as { users: { id: string; username: string }[] };
    const user = users.users.find((u) => u.username === account);
    expect(user).toBeTruthy();
    for (const entryId of [fiche.id, second.id]) {
      const tied = await keeper.request.post('/api/characters', { data: { entryId, userId: user!.id } });
      expect(tied.ok()).toBe(true);
    }
  }
  await context.close();
  return { article, fiche };
}

type Box = { x: number; y: number; width: number; height: number };
const overlaps = (a: Box | null, b: Box | null, grow = 0) =>
  Boolean(
    a &&
      b &&
      a.x - grow < b.x + b.width &&
      b.x < a.x + a.width + grow &&
      a.y - grow < b.y + b.height &&
      b.y < a.y + a.height + grow,
  );

/** A long press, the way a thumb does it: touchstart, hold, touchend. */
async function longPress(page: Page, target: Locator) {
  const box = await target.boundingBox();
  if (!box) throw new Error('niets om op te drukken');
  const cdp = await page.context().newCDPSession(page);
  const point = { x: box.x + 30, y: box.y + box.height / 2 };
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] });
  await page.waitForTimeout(800);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach();
}

/* ------------------------------------------------------------------ #2 */

test('#2: in Lezen vraagt een tik of klik op de tekst niets; in Bewerken wel', async ({ page, browser }, info) => {
  test.setTimeout(180_000);
  const stamp = `${info.project.name}${Date.now().toString(36)}`;
  const account = `Lezer ${stamp}`;
  await signUpAs(page, account);
  const { article } = await keeperWorld(browser, stamp, account);

  // A fresh window: two onderzoekers, and this window has said neither.
  const context = await browser.newContext();
  const reader = await context.newPage();
  await signIn(reader, account, PASSWORD);
  await reader.goto(`/e/${article.slug}`);
  await expect(reader.locator('.entry-page-reading')).toBeVisible({ timeout: 20_000 });
  const text = reader.locator('.entry-body-block .prose p').first();
  await expect(text).toBeVisible({ timeout: 20_000 });
  // Hydrated: the toggle answers presses from here on.
  await expect(reader.locator('.entry-mode-toggle')).toBeVisible();
  await reader.waitForTimeout(600);

  await text.click();
  await reader.waitForTimeout(500);
  await shot(reader, `${info.project.name}-2-na-eerste-klik`);
  if (VOOR && (await askSheet(reader).isVisible())) {
    check(await askSheet(reader).isVisible(), 'de vraag kwam op één klik in Lezen').toBe(false);
    await context.close();
    return;
  }
  await reader.locator('.entry-title').click();
  await reader.locator('.entry-body-block .prose p').nth(4).click();
  if (info.project.name === 'phone') {
    await text.tap();
    await longPress(reader, reader.locator('.entry-body-block .prose p').nth(2));
  }
  await reader.waitForTimeout(700);
  await shot(reader, `${info.project.name}-2-lezen-na-tik`);
  await check(askSheet(reader)).toHaveCount(0);

  // Writing still asks — the question belongs to writing (§18b).
  if (!VOOR) {
    await reader.keyboard.press('Escape');
    await reader.locator('.entry-mode-toggle').click();
    const body = reader.locator('.entry-body-block [contenteditable="true"]').first();
    await expect(body).toBeVisible({ timeout: 15_000 });
    await body.click();
    await reader.keyboard.type('H');
    await expect(askSheet(reader)).toBeVisible({ timeout: 10_000 });
    await shot(reader, `${info.project.name}-2-bewerken-vraagt`);
  }
  await context.close();
});

/* ------------------------------------------------------------------ #3 */

/** §22: the reading face — a Keeper may land on the writing one. */
async function toReading(page: Page) {
  const toggle = page.locator('.entry-mode-toggle');
  await toggle.waitFor({ state: 'visible', timeout: 20_000 });
  if ((await toggle.innerText()).trim() === 'Lezen') {
    await toggle.click();
    await expect(page.locator('.entry-page-reading')).toBeVisible({ timeout: 10_000 });
  }
}

async function proseWidth(page: Page, slug: string) {
  await page.goto(`/e/${slug}`);
  await toReading(page);
  const prose = page.locator('.entry-main .prose').first();
  await expect(prose).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId('live-strip')).toBeVisible({ timeout: 20_000 });
  // Let the strip settle on its word (the float's width is the column's).
  await page.waitForTimeout(2500);
  return (await prose.boundingBox())!.width;
}

test('#3: de leeskolom van de Keeper is die van een speler, en niets ligt ergens over', async ({ page, browser }, info) => {
  test.skip(info.project.name !== 'desktop', 'de maat van 1440×900');
  test.setTimeout(180_000);
  const stamp = `${info.project.name}${Date.now().toString(36)}`;
  const account = `Kolom ${stamp}`;
  await signUpAs(page, account);
  const { article } = await keeperWorld(browser, stamp, account);

  await proseWidth(page, article.slug);

  const context = await browser.newContext();
  const keeper = await context.newPage();
  await signIn(keeper, ...KEEPER);
  await proseWidth(keeper, article.slug);
  /*
   * The strip is a float and its width is the column's, and what is in it
   * depends on who else is here — so the two are measured standing on the
   * same page together, each seeing the other: the role is the only
   * difference left.
   */
  for (const p of [page, keeper]) {
    await expect(p.getByTestId('live-strip').locator('.board-person').first()).toBeVisible({ timeout: 20_000 });
  }
  await page.waitForTimeout(1500);
  const width = async (p: Page) => (await p.locator('.entry-main .prose').first().boundingBox())!.width;
  const player = await width(page);
  const keeperWidth = await width(keeper);
  await shot(page, 'desktop-3-speler');
  await shot(keeper, 'desktop-3-keeper');
  console.log(`#3 prose: speler ${player} px, keeper ${keeperWidth} px`);
  check(Math.abs(player - keeperWidth)).toBeLessThanOrEqual(2);

  // Golf h1 (D4): on a desk the Keeperkant is the switch in the side menu's
  // masthead. There is no button in the corner, so no band above the page:
  // the Keeper's heading starts where the player's does.
  await expect(keeper.locator('.side-toggle')).toHaveCount(0);
  await expect(keeper.locator('.sidenav .masthead').getByTestId('side-toggle')).toHaveCount(1);
  const headY = async (p: Page) => (await p.locator('.entry-head').first().boundingBox())!.y;
  check(Math.abs((await headY(page)) - (await headY(keeper)))).toBeLessThanOrEqual(2);
  const strip = await keeper.getByTestId('live-strip').boundingBox();
  // §104 (golf H, D1): at 1440 px the outline is the row above the text, not `.entry-rail`.
  for (const selector of ['.entry-head', '.entry-mode-toggle', '.entry-outline', '.entry-layout']) {
    const box = await keeper.locator(selector).first().boundingBox();
    check(overlaps(strip, box), `strip over ${selector}`).toBe(false);
  }

  // Golf h1 (D12): scrolled, the strip has gone with the page top — it no
  // longer lies over the text.
  await keeper.evaluate(() => window.scrollTo(0, 700));
  await keeper.waitForTimeout(300);
  const scrolled = await keeper.getByTestId('live-strip').boundingBox();
  check(scrolled!.y + scrolled!.height).toBeLessThan(0);
  await shot(keeper, 'desktop-3-keeper-gescrold');

  // A canvas page: the strip hangs absolute in the head's corner, and the
  // head has its full width back (no 12 rem for a button).
  const made = await keeper.request.post('/api/timelines', { data: { name: `Tij ${stamp}`, keeperOnly: false } });
  const { timeline } = (await made.json()) as { timeline: { slug: string } };
  await keeper.goto(`/timelines/${timeline.slug}`);
  await expect(keeper.locator('.canvas-head h1')).toBeVisible({ timeout: 20_000 });
  await keeper.waitForTimeout(1500);
  const head = await keeper.locator('.canvas-head h1').boundingBox();
  const canvasStrip = await keeper.getByTestId('live-strip').boundingBox();
  check(overlaps(canvasStrip, head)).toBe(false);
  const padding = await keeper.locator('.canvas-head').evaluate((el) => parseFloat(getComputedStyle(el).paddingRight));
  check(padding).toBeLessThanOrEqual(64);
  await shot(keeper, 'desktop-3-keeper-tijdlijn');
  await context.close();
});

/* ------------------------------------------------------------------ #4 */

test('#4: op de telefoon ligt de Keeperkant-knop over geen enkele kopknop', async ({ page, browser }, info) => {
  test.skip(info.project.name !== 'phone', 'de hoek van een telefoon');
  test.setTimeout(150_000);
  const stamp = `${info.project.name}${Date.now().toString(36)}`;
  const { article } = await keeperWorld(browser, stamp);
  await signIn(page, ...KEEPER);

  for (const [name, path] of [
    ['artikel', `/e/${article.slug}`],
    ['wiki', '/wiki'],
    ['dossiers', '/cases'],
    ['start', '/'],
  ] as const) {
    await page.goto(path);
    if (name === 'artikel') await toReading(page);
    const toggle = page.locator('.side-toggle');
    await expect(toggle).toBeVisible({ timeout: 20_000 });
    await page.waitForTimeout(1200);
    const knob = await toggle.boundingBox();
    // Every control in the page, and the hit area of the button (6 px round).
    const hits = await page.evaluate(
      ({ k }) => {
        const out: string[] = [];
        for (const el of document.querySelectorAll<HTMLElement>('.main a, .main button, .main input, .main [role="tab"]')) {
          if (el.closest('.live-strip')) continue;
          const r = el.getBoundingClientRect();
          if (!r.width || !r.height) continue;
          const style = getComputedStyle(el);
          if (style.visibility === 'hidden') continue;
          if (r.x - 6 < k.x + k.width && k.x - 6 < r.x + r.width && r.y - 6 < k.y + k.height && k.y - 6 < r.y + r.height) {
            out.push(`${el.tagName.toLowerCase()}.${el.className} "${(el.textContent ?? '').trim().slice(0, 30)}"`);
          }
        }
        return out;
      },
      { k: knob! },
    );
    await shot(page, `phone-4-keeper-${name}`);
    check(hits, `${name}: onder de knop`).toEqual([]);
    check(overlaps(knob, await page.getByTestId('live-strip').boundingBox())).toBe(false);
  }
});

/* ------------------------------------------------------------------ #5 */

test('#5: een navigatie begint bij 0,6 en niet bij een leeg frame', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'één keer is genoeg: het is een regel in de css');
  await signIn(page, ...KEEPER);
  const from = await page.evaluate(() => {
    const out: Record<string, string> = {};
    const walk = (list: CSSRuleList) => {
      for (const rule of list) {
        if (rule instanceof CSSKeyframesRule && (rule.name === 'nav-page-in' || rule.name === 'nav-page-fade')) {
          out[rule.name] = (rule.cssRules[0] as CSSKeyframeRule).style.opacity;
        } else if ('cssRules' in rule) walk((rule as CSSGroupingRule).cssRules);
      }
    };
    for (const sheet of document.styleSheets) {
      try {
        walk(sheet.cssRules);
      } catch {
        /* another origin */
      }
    }
    return out;
  });
  console.log('#5 keyframes', JSON.stringify(from));
  check(from['nav-page-in']).toBe('0.6');
  check(from['nav-page-fade']).toBe('0.6');

  // And the frame itself, 30 ms after a click in the side menu.
  await page.getByRole('navigation', { name: 'Hoofdmenu' }).getByRole('link', { name: 'Wiki' }).click();
  await page.waitForURL('**/wiki');
  await page.waitForTimeout(20);
  await shot(page, 'desktop-5-nav-direct');
});

/* ------------------------------------------------------------------ #10 */

test('#10: de FAB wijkt bij lezen naar beneden, en staat boven een melding', async ({ page, browser }, info) => {
  test.skip(info.project.name !== 'phone', 'de FAB is er alleen op een telefoon');
  test.setTimeout(150_000);
  const stamp = `${info.project.name}${Date.now().toString(36)}`;
  const { article, fiche } = await keeperWorld(browser, stamp);
  await signUpAs(page, `Duim ${stamp}`);

  await page.goto(`/e/${article.slug}`);
  await expect(page.locator('.entry-page-reading')).toBeVisible({ timeout: 20_000 });
  const fab = page.locator('.fab');
  await expect(fab).toBeVisible();
  await page.waitForTimeout(800);
  await shot(page, 'phone-10-boven');

  // Down, in thumb-sized steps: the `+` steps aside.
  // Golf h4: only a scroll the hand makes counts (`FAB_HAND_MS`), so each step
  // is preceded by the event a thumb sends; a bare `scrollBy` is the page
  // scrolling itself and leaves the + where it is.
  const thumb = (dy: number) =>
    page.evaluate((y) => {
      window.dispatchEvent(new Event('touchmove'));
      window.scrollBy(0, y);
    }, dy);
  for (let i = 0; i < 6; i++) {
    await thumb(70);
    await page.waitForTimeout(60);
  }
  await check(fab).toHaveAttribute('data-away', '1', { timeout: 2000 });
  await page.waitForTimeout(400);
  check(await fab.evaluate((el) => Number(getComputedStyle(el).opacity))).toBeLessThan(0.05);
  await shot(page, 'phone-10-omlaag');

  // A nudge of 4 px is not a direction; 40 px up is.
  await thumb(-4);
  await page.waitForTimeout(200);
  await check(fab).toHaveAttribute('data-away', '1');
  await thumb(-40);
  await check(fab).not.toHaveAttribute('data-away', '1', { timeout: 2000 });
  await page.waitForTimeout(500);
  check(await fab.evaluate((el) => Number(getComputedStyle(el).opacity))).toBeGreaterThan(0.95);
  await shot(page, 'phone-10-omhoog');

  // A melding: the `+` stands above it, not under it.
  await page.goto(`/e/${fiche.slug}`);
  const tie = page.getByRole('button', { name: 'Dit is mijn karakter' });
  await expect(tie).toBeVisible({ timeout: 20_000 });
  await expect(async () => {
    await tie.click({ timeout: 2000 });
    await expect(page.locator('.toast').first()).toBeVisible({ timeout: 2000 });
  }).toPass({ timeout: 20_000 });
  await page.waitForTimeout(450);
  const toast = await page.locator('.toast').first().boundingBox();
  const plus = await fab.boundingBox();
  await shot(page, 'phone-10-melding');
  console.log(`#10 toast ${JSON.stringify(toast)} fab ${JSON.stringify(plus)}`);
  check(overlaps(toast, plus, 2)).toBe(false);
});

/* ------------------------------------------------------------------ #12 */

test('#12: de achtergrond van een blad komt erbij en gaat zacht weg; het palet niet', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'een regel in de css');
  await signIn(page, ...KEEPER);
  await page.goto('/wiki');
  const sheet = page.getByRole('dialog', { name: 'Nieuw artikel' });
  await expect(async () => {
    await page.getByTestId('nav-new').click({ timeout: 2000 });
    await expect(sheet).toBeVisible({ timeout: 2000 });
  }).toPass({ timeout: 20_000 });
  const shade = page.locator('.sheet-backdrop').last();
  const opened = await shade.evaluate((el) => {
    const style = getComputedStyle(el);
    return { name: style.animationName, duration: style.animationDuration };
  });
  console.log('#12 in', JSON.stringify(opened));
  check(opened.name).toBe('sheet-shade-in');
  check(opened.duration).toBe('0.24s');

  // Out by hand: the cross. Read while it plays.
  await page.evaluate(() => {
    const w = window as unknown as { __out: string | null };
    w.__out = null;
    const el = document.querySelector('.sheet-backdrop');
    new MutationObserver(() => {
      if (el?.hasAttribute('data-closing')) w.__out ??= getComputedStyle(el).animationTimingFunction;
    }).observe(el!, { attributes: true });
  });
  await sheet.getByRole('button', { name: 'Sluiten' }).click();
  await expect(sheet).toHaveCount(0);
  const out = await page.evaluate(() => (window as unknown as { __out: string | null }).__out);
  console.log('#12 uit', out);
  check(out).toBe('cubic-bezier(0.2, 0, 0.38, 0.9)');

  // The palet: nothing moves (rule 2).
  await expect(async () => {
    await page.keyboard.press('ControlOrMeta+k');
    await expect(page.getByTestId('palette')).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: 20_000 });
  check(await page.locator('.palette-backdrop').evaluate((el) => getComputedStyle(el).animationName)).toBe('none');
});

/* ------------------------------------------------------------------ #15 */

test('#15: Verbinden… pas na anderhalve seconde zonder lijn', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'een woord in de strip');
  await signIn(page, ...KEEPER);
  // The line never answers: the strip stays `connecting`.
  await page.route('**/api/live/site**', () => undefined);
  await page.goto('/wiki');
  const strip = page.getByTestId('live-strip');
  await expect(strip).toBeVisible({ timeout: 20_000 });
  await expect(strip).toHaveClass(/live-strip-connecting/);
  await page.waitForTimeout(300);
  await shot(page, 'desktop-15-direct');
  const early = (await strip.locator('.live-strip-word').textContent()) ?? '';
  check(early.trim()).toBe('');
  await page.waitForTimeout(2000);
  await check(strip.locator('.live-strip-word')).toHaveText('verbinden…');
  await shot(page, 'desktop-15-na-2s');
});

/* ------------------------------------------------------------------ #25 */

test('#25: de melding op /uitdelen ligt boven de plakkende voet', async ({ page, browser }, info) => {
  test.setTimeout(180_000);
  const stamp = `${info.project.name}${Date.now().toString(36)}`;
  const context = await browser.newContext();
  const player = await context.newPage();
  await signUpAs(player, `Munt ${stamp}`);
  const character = `Onderzoeker Munt ${stamp}`;
  await becomeInvestigator(player, character);
  await context.close();

  await signIn(page, ...KEEPER);
  // A desk that is not tall: the foot sticks to the bottom, as on a long table.
  if (info.project.name === 'desktop') await page.setViewportSize({ width: 1440, height: 560 });
  await page.goto('/uitdelen');
  await expect(page.getByTestId('uitdelen-form')).toBeVisible({ timeout: 20_000 });
  const row = page.getByTestId('uitdelen-rij').filter({ hasText: character });
  await expect(row).toHaveCount(1, { timeout: 20_000 });
  await row.getByTestId('uitdelen-aan').check();
  await fillWhenReady(row.getByTestId('uitdelen-bedrag'), '1');
  await page.getByTestId('uitdelen-geef').click();
  const toast = page.locator('.toast').first();
  await expect(toast).toBeVisible({ timeout: 20_000 });
  await page.waitForTimeout(500);
  const foot = await page.locator('.uitdelen-voet').boundingBox();
  const box = await toast.boundingBox();
  console.log(`#25 ${info.project.name} voet ${JSON.stringify(foot)} melding ${JSON.stringify(box)}`);
  await shot(page, `${info.project.name}-25-uitdelen-melding`);
  check(overlaps(foot, box)).toBe(false);
});

/* ------------------------------------------------------------------ #27 */

test('#27: het palet toont geen lege groep, en Verras me is een dobbelsteen', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'het palet is overal hetzelfde');
  await signIn(page, ...KEEPER);
  await page.goto('/wiki');
  const palette = page.getByTestId('palette');
  await expect(async () => {
    await page.keyboard.press('ControlOrMeta+k');
    await expect(palette).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: 20_000 });
  const input = page.getByTestId('palette-input');
  await input.fill('verras');
  const surprise = palette.locator('[data-group="actions"]').getByRole('option', { name: 'Verras me' });
  await expect(surprise).toBeVisible({ timeout: 10_000 });
  // The answer from the server is in (the search row is last, and it waits 160 ms).
  await page.waitForTimeout(1500);
  await shot(page, 'desktop-27-verras');
  await check(palette.locator('[data-group="entries"]')).toHaveCount(0);
  await check(palette.locator('.palette-empty')).toHaveCount(0);
  check(await surprise.locator('svg path').getAttribute('d')).toMatch(/^M6\.5 3\.5h11/);

  // Nothing at all: one "niets", without a heading over it.
  await input.fill(`qzxv${Date.now().toString(36)}`);
  await expect(palette.locator('.palette-empty')).toHaveCount(1, { timeout: 10_000 });
  await page.waitForTimeout(800);
  await check(palette.locator('.palette-empty')).toContainText('Niets');
  await check(palette.locator('.palette-head')).toHaveCount(0);
  await shot(page, 'desktop-27-niets');
});
