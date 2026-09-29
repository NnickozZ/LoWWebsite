import { mkdirSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { signIn } from './helpers';

/**
 * §102, ronde 65·c: de voorbeeldkaart (J5) en de omslag-cirkel (J9).
 *
 * The card: it waits half a second for a mouse, it can be reached (a hand
 * crossing from the chip finds it still there), it has a door, Escape puts it
 * away, and on a phone a long press leaves it standing with a door a finger
 * can hit.
 *
 * The circle: a cross-document view transition through the 303 of
 * `/api/keeper/flip`, and only when a hand pressed. The `k` key does not move
 * (decision 2) and a plain `location.assign` does not either (decision 5).
 */

const KEEPER = ['Keeper', 'abbeytower34'] as const;
const SHOTS = '/tmp/claude-0/shots-c';
mkdirSync(SHOTS, { recursive: true });

/** The chip in Westkapelle's running text (seed-demo) that names Jacob den Hollander. */
function jacobChip(page: Page) {
  return page
    // Golf J (j4): de tekst staat al in de eerste verf (`VoorafTekst`) en de
    // editor neemt hem daarna over; wacht op de chip van de editor zelf.
    .locator('.entry-body-block .ProseMirror:not(.vooraf-tekst) a.entry-chip[data-entry-id]', { hasText: 'Jacob den Hollander' })
    .first();
}

async function centre(page: Page, locator: ReturnType<Page['locator']>) {
  const box = await locator.boundingBox();
  if (!box) throw new Error('not on screen');
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

/**
 * A new artikel with a cover and a korte beschrijving, made through the
 * archive's own routes from inside the page (same origin, so §89's check on
 * the origin of a write is met the way a browser meets it).
 */
async function artikelWithCover(page: Page, name: string): Promise<{ id: string; slug: string }> {
  const sharp = (await import('sharp')).default;
  // A small sepia picture with a tower in it, so the card has something to show.
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="800">
    <defs><linearGradient id="s" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#d9cdb0"/><stop offset="0.62" stop-color="#b9a47c"/><stop offset="1" stop-color="#6d5b3e"/>
    </linearGradient></defs>
    <rect width="600" height="800" fill="url(#s)"/>
    <rect x="250" y="250" width="100" height="400" fill="#3b3024"/>
    <polygon points="235,250 365,250 300,170" fill="#3b3024"/>
    <rect x="275" y="300" width="50" height="40" fill="#f3e3a8"/>
    <rect x="0" y="640" width="600" height="160" fill="#4a5a58"/>
  </svg>`;
  const png = (await sharp(Buffer.from(svg)).png().toBuffer()).toString('base64');
  return page.evaluate(
    async ({ name, png }) => {
      const made = await fetch('/api/entries', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          typeSlug: 'location',
          name,
          shortDescription:
            'Een stompe bakstenen toren op de dijk. Het licht draait sinds de drift, al zegt de wachter dat hij het niet heeft opgewonden. Wat de lichtbundel aan zeezijde raakt, bespreekt hij niet.',
        }),
      }).then((r) => r.json());
      const entry = made.entry ?? made;
      const bytes = Uint8Array.from(atob(png), (c) => c.charCodeAt(0));
      const form = new FormData();
      form.append('file', new File([bytes], 'toren.png', { type: 'image/png' }));
      const asset = await fetch('/api/assets', { method: 'POST', body: form }).then((r) => r.json());
      await fetch(`/api/entries/${entry.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ coverAssetId: asset.asset.id }),
      });
      return { id: entry.id as string, slug: entry.slug as string };
    },
    { name, png },
  );
}

test.describe('§102 de voorbeeldkaart', () => {
  test('een muis: wachten, oversteken, Escape, en de deur', async ({ page }, info) => {
    test.skip(info.project.name !== 'desktop', 'de muis; de telefoon heeft zijn eigen case');
    test.setTimeout(90_000);
    await signIn(page, ...KEEPER);
    await page.goto('/e/westkapelle-lighthouse');
    const chip = jacobChip(page);
    await expect(chip).toBeVisible({ timeout: 20_000 });
    const card = page.getByTestId('preview-card');

    // A pointer that only sweeps past raises nothing.
    const at = await centre(page, chip);
    await page.mouse.move(at.x - 200, at.y + 120);
    await page.mouse.move(at.x, at.y, { steps: 3 });
    await page.mouse.move(at.x + 400, at.y + 200, { steps: 2 });
    await page.waitForTimeout(700);
    await expect(card).toHaveCount(0);

    // Resting on it: nothing at 300 ms, the card by 600 ms.
    await page.mouse.move(at.x, at.y, { steps: 2 });
    await page.waitForTimeout(300);
    await expect(card).toHaveCount(0);
    await page.waitForTimeout(300);
    await expect(card).toBeVisible();
    // While the mouse is still on the chip, the card lets a press through.
    await expect(card).toHaveAttribute('data-reach', 'nee');
    await expect(card).toContainText('Jacob den Hollander');
    const open = card.getByTestId('preview-open');
    await expect(open).toHaveAttribute('href', '/e/jacob-den-hollander');
    await expect(open).toHaveText('Openen →');

    // Crossing over, in five steps: the grace holds it, the card keeps itself.
    const door = await centre(page, open);
    await page.mouse.move(door.x, door.y, { steps: 5 });
    await page.waitForTimeout(400);
    await expect(card).toBeVisible();
    await expect(card).not.toHaveAttribute('data-reach', 'nee');

    // Escape puts it away.
    await page.keyboard.press('Escape');
    await expect(card).toHaveCount(0);

    // Leaving for somewhere else: gone after the grace.
    await page.mouse.move(at.x - 300, at.y + 300);
    await page.mouse.move(at.x, at.y, { steps: 2 });
    await expect(card).toBeVisible({ timeout: 2000 });
    await page.mouse.move(at.x - 300, at.y + 300, { steps: 2 });
    await page.waitForTimeout(150);
    await expect(card).toBeVisible();
    await page.waitForTimeout(250);
    await expect(card).toHaveCount(0);

    // And the door opens: a press inside the card is not the press that closes it.
    await page.mouse.move(at.x, at.y, { steps: 2 });
    await expect(card).toBeVisible({ timeout: 2000 });
    const door2 = await centre(page, open);
    await page.mouse.move(door2.x, door2.y, { steps: 5 });
    await page.mouse.down();
    await page.mouse.up();
    await page.waitForURL('**/e/jacob-den-hollander');
    await expect(card).toHaveCount(0);
  });

  test('het kaartje, licht en donker', async ({ page }, info) => {
    test.skip(info.project.name !== 'desktop', 'screenshots van een computer');
    test.setTimeout(90_000);
    await signIn(page, ...KEEPER);
    const name = `De toren van ${Date.now().toString(36)}`;
    await artikelWithCover(page, name);

    for (const scheme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme: scheme });
      await page.goto(`/search?q=${encodeURIComponent(name)}`);
      const row = page.getByRole('main').locator('a.feed-item[data-entry-id]', { hasText: name }).first();
      await expect(row).toBeVisible({ timeout: 20_000 });
      const at = await centre(page, row);
      await page.mouse.move(at.x - 100, at.y - 60);
      await page.mouse.move(at.x - 100, at.y, { steps: 2 });
      const card = page.getByTestId('preview-card');
      await expect(card).toBeVisible({ timeout: 3000 });
      await expect(card.locator('.preview-thumb img')).toBeVisible();
      await page.waitForTimeout(250);
      const box = (await card.boundingBox())!;
      expect(box.width).toBeLessThanOrEqual(300);
      await page.screenshot({
        path: `${SHOTS}/kaartje-${scheme}.png`,
        clip: { x: Math.max(0, box.x - 60), y: Math.max(0, box.y - 80), width: 440, height: box.height + 140 },
      });

      // The soort-icon variant, in its own setting: a chip in running text.
      await page.goto('/e/westkapelle-lighthouse');
      const chip = jacobChip(page);
      await expect(chip).toBeVisible({ timeout: 20_000 });
      const c = await centre(page, chip);
      await page.mouse.move(c.x - 80, c.y - 80);
      await page.mouse.move(c.x, c.y, { steps: 2 });
      await expect(card).toBeVisible({ timeout: 3000 });
      await page.waitForTimeout(250);
      const b = (await card.boundingBox())!;
      await page.screenshot({
        path: `${SHOTS}/kaartje-icoon-${scheme}.png`,
        clip: { x: Math.max(0, b.x - 60), y: Math.max(0, b.y - 90), width: 440, height: b.height + 150 },
      });
    }
  });

  test('een vinger: lang drukken, loslaten, en de deur is te raken', async ({ page }, info) => {
    test.skip(info.project.name !== 'phone', 'lang drukken is een vinger');
    test.setTimeout(90_000);
    await signIn(page, ...KEEPER);
    await page.goto('/e/westkapelle-lighthouse');
    const chip = jacobChip(page);
    await expect(chip).toBeVisible({ timeout: 20_000 });
    await chip.scrollIntoViewIfNeeded();
    const at = await centre(page, chip);

    const cdp = await page.context().newCDPSession(page);
    const point = [{ x: at.x, y: at.y, id: 1 }];
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: point });
    await page.waitForTimeout(700);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });

    const card = page.getByTestId('preview-card');
    await expect(card).toBeVisible();
    // The lift was not a tap on the chip: we are still here.
    await page.waitForTimeout(400);
    await expect(page).toHaveURL(/\/e\/westkapelle-lighthouse/);
    await expect(card).toBeVisible();
    const open = card.getByTestId('preview-open');
    const box = (await open.boundingBox())!;
    expect(box.height).toBeGreaterThanOrEqual(44);
    expect(box.width).toBeGreaterThanOrEqual(44);
    const cardBox = (await card.boundingBox())!;
    expect(cardBox.x).toBeGreaterThanOrEqual(8);
    expect(cardBox.x + cardBox.width).toBeLessThanOrEqual(390 - 8 + 0.5);
    await page.screenshot({ path: `${SHOTS}/kaartje-telefoon.png` });

    await open.tap();
    await page.waitForURL('**/e/jacob-den-hollander');
    await expect(card).toHaveCount(0);
  });
});

/**
 * What the arriving page saw, written by an init script that is registered
 * before the archive's own `<head>` script (so it hears each event first and
 * sees a transition before the archive decides whether to skip it).
 */
const LISTEN = () => {
  const w = window as unknown as { __flip: Record<string, unknown> };
  w.__flip = {};
  window.addEventListener('pageswap', (event) => {
    const t = (event as unknown as { viewTransition: unknown }).viewTransition;
    // Written to the storage because this document is on its way out.
    try {
      sessionStorage.setItem('e2e:swap', JSON.stringify({ had: Boolean(t) }));
    } catch {
      /* nothing */
    }
  });
  window.addEventListener('pagereveal', async (event) => {
    const t = (event as unknown as { viewTransition: { ready: Promise<void> } | null }).viewTransition;
    const rec: Record<string, unknown> = { had: Boolean(t), wiped: false, skipped: false };
    try {
      rec.swap = JSON.parse(sessionStorage.getItem('e2e:swap') || 'null');
      sessionStorage.removeItem('e2e:swap');
    } catch {
      /* nothing */
    }
    w.__flip = rec;
    if (!t) {
      rec.done = true;
      return;
    }
    try {
      await t.ready;
      const wipe = document
        .getAnimations()
        .find((a) => (a as CSSAnimation).animationName === 'side-flip-wipe');
      rec.wiped = Boolean(wipe);
      rec.x = document.documentElement.style.getPropertyValue('--flip-x');
      rec.y = document.documentElement.style.getPropertyValue('--flip-y');
      // For the screenshot: hold the circle part of the way out, when asked.
      const hold = sessionStorage.getItem('e2e:hold-flip');
      if (wipe && hold) {
        sessionStorage.removeItem('e2e:hold-flip');
        wipe.pause();
        wipe.currentTime = Number(hold);
        rec.held = true;
      }
    } catch {
      rec.skipped = true;
    }
    rec.done = true;
  });
};

async function landing(page: Page) {
  await page.waitForFunction(() => (window as unknown as { __flip?: { done?: boolean } }).__flip?.done === true, null, {
    timeout: 20_000,
  });
  return page.evaluate(() => (window as unknown as { __flip: Record<string, unknown> }).__flip);
}

test.describe('§102 de omslag-cirkel', () => {
  test('een klik draait het archief om met de cirkel; k en een gewone navigatie niet', async ({ page }, info) => {
    test.skip(info.project.name !== 'desktop', 'cross-document view transitions: desktop Chromium');
    test.setTimeout(120_000);
    await page.addInitScript(LISTEN);
    await signIn(page, ...KEEPER);
    await page.goto('/wiki');
    const toggle = page.getByTestId('side-toggle');
    await expect(toggle).toHaveAttribute('data-side-now', 'player');
    const button = await toggle.boundingBox();

    // 1. A click. Through the 303, and the circle grows out of the button.
    await toggle.click();
    await page.waitForURL(/gewisseld=1/);
    await expect(toggle).toHaveAttribute('data-side-now', 'keeper');
    const clicked = await landing(page);
    console.log('klik:', JSON.stringify(clicked));
    expect(clicked.swap).toEqual({ had: true });
    expect(clicked.had).toBe(true);
    expect(clicked.skipped).toBe(false);
    expect(clicked.wiped).toBe(true);
    // Golf h1 (D4): on a desk the toggle is the switch in the masthead, and
    // the circle starts from the half the hand is going to — inside it.
    const x = parseFloat(String(clicked.x));
    const y = parseFloat(String(clicked.y));
    expect(x).toBeGreaterThanOrEqual(button!.x + button!.width / 2 - 1);
    expect(x).toBeLessThanOrEqual(button!.x + button!.width);
    expect(Math.abs(y - (button!.y + button!.height / 2))).toBeLessThan(2);
    // The note is spent.
    expect(await page.evaluate(() => sessionStorage.getItem('lw:flip'))).toBeNull();

    // 2. The `k` key: the same flip, no circle (a keyboard action does not move).
    const before = page.url();
    // Pressed again only when the first press was not heard at all: a flip
    // that is merely slow must not be answered by a second one, which would
    // turn the archive straight back.
    for (let attempt = 0; attempt < 6 && page.url() === before; attempt++) {
      await page.keyboard.press('k');
      await page.waitForURL((url) => url.toString() !== before, { timeout: 10_000 }).catch(() => undefined);
    }
    await expect(toggle).toHaveAttribute('data-side-now', 'player');
    const keyed = await landing(page);
    console.log('k:', JSON.stringify(keyed));
    expect(keyed.wiped).toBe(false);

    // 3. A plain navigation. The document opts in, so the browser offers a
    //    transition on the way out — and the archive skips it.
    await page.evaluate(() => location.assign('/wiki'));
    await page.waitForURL(/\/wiki$/);
    const plain = await landing(page);
    console.log('assign:', JSON.stringify(plain));
    expect(plain.swap).toEqual({ had: true });
    expect(plain.wiped).toBe(false);
  });

  test('een frame midden in de cirkel', async ({ page }, info) => {
    test.skip(info.project.name !== 'desktop', 'een screenshot van een computer');
    test.setTimeout(90_000);
    await page.addInitScript(LISTEN);
    await signIn(page, ...KEEPER);
    for (const [at, name] of [
      [110, 'omslag-cirkel-vroeg'],
      [220, 'omslag-cirkel-midden'],
    ] as const) {
      await page.goto('/e/westkapelle-lighthouse');
      const toggle = page.getByTestId('side-toggle');
      await expect(toggle).toBeVisible();
      await page.evaluate((ms) => sessionStorage.setItem('e2e:hold-flip', String(ms)), at);
      // §6: a switch on a page that has just loaded may not be listening yet;
      // pressed until the flip is under way (seen once in a full run).
      await expect(async () => {
        if (!/gewisseld=1/.test(page.url())) await toggle.click({ timeout: 5000 });
        await page.waitForURL(/gewisseld=1/, { timeout: 8000 });
      }).toPass({ timeout: 45_000 });
      const seen = await landing(page);
      expect(seen.wiped).toBe(true);
      expect(seen.held).toBe(true);
      await page.screenshot({ path: `${SHOTS}/${name}.png` });
      await page.evaluate(() => document.getAnimations().forEach((a) => a.finish()));
      // Back to the players' side for the next frame.
      await page.goto('/api/keeper/flip?side=player&to=%2F');
    }
  });

  test('wie om geen beweging vraagt, krijgt geen cirkel', async ({ browser }, info) => {
    test.skip(info.project.name !== 'desktop', 'desktop Chromium');
    test.setTimeout(90_000);
    const context = await browser.newContext({ reducedMotion: 'reduce', viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    await page.addInitScript(LISTEN);
    await signIn(page, ...KEEPER);
    await page.goto('/wiki');
    const toggle = page.getByTestId('side-toggle');
    const side = await toggle.getAttribute('data-side-now');
    await toggle.click();
    await expect(toggle).not.toHaveAttribute('data-side-now', side!, { timeout: 20_000 });
    const seen = await landing(page);
    console.log('reduce:', JSON.stringify(seen));
    expect(seen.wiped).toBe(false);
    expect(seen.swap).toEqual({ had: false });
    // Leave the Keeper where the other cases expect him.
    await page.goto('/api/keeper/flip?side=player&to=%2F');
    await context.close();
  });
});
