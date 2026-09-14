import { expect, test, type Page } from '@playwright/test';
import { signIn } from './helpers';

/**
 * §69 — the contract, asserted rather than written down.
 *
 * `docs/canvas-contract.md` is round 35's first phase: three tables saying what
 * each of the four canvases does for every gesture, with a file and a line in
 * every cell. This file is the half of it a machine can hold down. It asks the
 * same question of each surface in turn — one list, one loop — so a fifth canvas
 * is a row in `SURFACES` rather than a new spec, and so a surface that quietly
 * stops answering one of them fails *here*, next to the other three, rather than
 * in whatever feature happens to lean on it next.
 *
 * What it does not do is re-test each canvas's own work. `maps.spec.ts` still
 * owns the speld, `family-trees-33.spec.ts` still owns kiezen. This file only
 * asks the things that are supposed to be **the same everywhere**, which in
 * round 35 is: the camera controls exist and are named the same, the keys
 * answer, and bare paper makes the thing this surface is for.
 */

type Surface = {
  /** What the row is called in a failure message. */
  name: string;
  /** Gets there, signed in as a Keeper, and leaves the canvas on screen. */
  open: (page: Page) => Promise<void>;
  /** The stage, for the double-click. */
  stage: string;
  /** What appears when bare paper is double-clicked: a selector, or a dialog name. */
  makes: { kind: 'locator'; selector: string } | { kind: 'dialog'; name: RegExp };
  /** Where on the stage is certainly empty, as a fraction of its box. */
  emptyAt: { x: number; y: number };
};

/**
 * The seeded Keeper, as the rest of the suite reaches it — `scripts/seed-demo.mjs`
 * is a fixture (CLAUDE.md §5) and signing in to it is four seconds where signing
 * up and picking an onderzoeker is forty.
 */
async function asKeeper(page: Page): Promise<void> {
  await signIn(page, 'Keeper', 'abbeytower34');
}

const SURFACES: Surface[] = [
  {
    name: 'prikbord',
    stage: '.board-viewport',
    makes: { kind: 'locator', selector: '.board-card' },
    emptyAt: { x: 0.78, y: 0.72 },
    open: async (page) => {
      await page.goto('/boards');
      await page.getByRole('button', { name: /Openbaar prikbord/ }).click();
      await page.waitForURL('**/b/**');
      await expect(page.locator('.board-viewport')).toBeVisible();
    },
  },
  {
    name: 'stamboom',
    stage: '.tree-stage',
    makes: { kind: 'locator', selector: '[data-testid="tree-node"]' },
    emptyAt: { x: 0.8, y: 0.78 },
    open: async (page) => {
      await page.goto('/stambomen');
      await page.getByRole('button', { name: /Nieuwe stamboom/ }).click();
      const sheet = page.getByRole('dialog', { name: /Nieuwe stamboom/ });
      await sheet.getByRole('button', { name: /Openbare stamboom/ }).click();
      await page.waitForURL('**/stambomen/**');
      await expect(page.locator('.tree-stage')).toBeVisible();
    },
  },
  {
    name: 'tijdlijn',
    stage: '.timeline-stage',
    makes: { kind: 'dialog', name: /gebeurtenis/i },
    emptyAt: { x: 0.6, y: 0.3 },
    open: async (page) => {
      await page.goto('/timelines');
      await page.getByRole('button', { name: /Nieuwe tijdlijn/ }).click();
      const sheet = page.getByRole('dialog', { name: /Nieuwe tijdlijn/ });
      await sheet.getByRole('button', { name: /Openbare tijdlijn/ }).click();
      await page.waitForURL('**/timelines/**');
      await expect(page.locator('.timeline-stage')).toBeVisible();
    },
  },
];

/**
 * §69 rij 1–5: the camera is one block of controls with one set of names, on
 * every canvas and on a phone as well as a desk.
 *
 * Before this round the four disagreed about all of it: the wall's block was
 * `display: none` under 768 px, the landkaart called its fit button "Passend
 * maken", the stamboom drew its own 26×24 buttons, and the percentages were
 * three different definitions. `CanvasZoomControls` is the one block now, and
 * this is the assertion that keeps it one.
 */
test.describe('§69 de camera is overal dezelfde', () => {
  for (const surface of SURFACES) {
    test(`${surface.name}: Uitzoomen, Inzoomen en Alles in beeld staan er en werken`, async ({ page }) => {
      await asKeeper(page);
      await surface.open(page);

      /*
       * `exact: true` is load-bearing, and CLAUDE.md §6's very first trap: a
       * name matches as a *substring*, and the stamboom's stage is itself a
       * `role="group"` labelled "…sleep om te schuiven, scroll om te zoomen".
       * Without it this locator matches two things on two of the three
       * surfaces and the failure reads as "the block is missing".
       */
      const zoom = page.getByRole('group', { name: 'Zoomen', exact: true });
      await expect(zoom, 'one named block, not three loose buttons').toBeVisible();
      await expect(zoom.getByRole('button', { name: 'Uitzoomen' })).toBeVisible();
      await expect(zoom.getByRole('button', { name: 'Inzoomen' })).toBeVisible();
      await expect(zoom.getByRole('button', { name: 'Alles in beeld' })).toBeVisible();

      // The percentage is beside them and says a number. What the number
      // *means* is each surface's own (§69 question 11); that it is printed at
      // all is the part that is shared.
      const level = zoom.locator('.canvas-zoom-level');
      await expect(level).toHaveText(/\d+%/);

      const before = await level.textContent();
      await zoom.getByRole('button', { name: 'Inzoomen' }).click();
      await expect(level).not.toHaveText(before ?? '');
      await zoom.getByRole('button', { name: 'Alles in beeld' }).click();
    });
  }
});

/**
 * §69 rij 6: bare paper makes the thing this surface is for.
 *
 * Two of the four did this and two did not. The gesture is one hook now
 * (`components/canvas/useMakeOnEmpty.ts`), and a canvas that forgets to hang it
 * on its stage fails here.
 *
 * Desktop only: a phone has no double-click, and the long press that stands in
 * for it is asserted on the `phone` project by the test after this one.
 */
test.describe('§69 leeg papier maakt iets', () => {
  for (const surface of SURFACES) {
    test(`${surface.name}: dubbelklikken op leeg papier maakt iets`, async ({ page }, info) => {
      test.skip(info.project.name !== 'desktop', 'a phone has no double-click; see the long press below');
      await asKeeper(page);
      await surface.open(page);

      const stage = page.locator(surface.stage);
      const box = await stage.boundingBox();
      expect(box, `${surface.name} has a stage with a size`).toBeTruthy();
      const at = {
        x: box!.x + box!.width * surface.emptyAt.x,
        y: box!.y + box!.height * surface.emptyAt.y,
      };

      if (surface.makes.kind === 'locator') {
        const made = page.locator(surface.makes.selector);
        const had = await made.count();
        await page.mouse.dblclick(at.x, at.y);
        await expect(made).toHaveCount(had + 1, { timeout: 15_000 });
      } else {
        await page.mouse.dblclick(at.x, at.y);
        await expect(page.getByRole('dialog', { name: surface.makes.name })).toBeVisible({ timeout: 15_000 });
      }
    });
  }
});

/*
 * §69, the phone road, and why it is not here.
 *
 * A phone has no double-click, so the same gesture is a half-second press —
 * the tijdlijn's since §62, and every canvas's since round 35. Playwright
 * cannot drive it: `page.touchscreen` taps and it drags, and there is no
 * press-and-hold. (That is also why §62's own long press went four rounds
 * with no spec touching it.) Dispatching a synthetic `pointerdown` was tried
 * and is not the same thing — it proves the listener is attached and nothing
 * about the timer.
 *
 * So the timer's rules are held down where they can be asked honestly, in
 * `tests/unit/make-on-empty.test.ts`: what counts as bare paper, that the
 * potlood is always out of it, that the finger may wander eight pixels and no
 * more, and that the distance is measured diagonally. What *this* file asserts
 * is the wiring — that each canvas hung the hook on its stage at all — through
 * the double-click above, which is the same hook and the same `enabled` gate.
 */

/**
 * §69 rij 3: the three camera keys answer on every canvas.
 *
 * `+` and `-` step by `ZOOM_STEP`, `0` fits. They were invented on the tijdlijn
 * (§62) and read in one place since round 35 (`components/canvas/cameraKeys.ts`),
 * so this asks the other three whether they learned them.
 */
test.describe('§69 de drie cameratoetsen', () => {
  for (const surface of SURFACES) {
    test(`${surface.name}: + − 0 doen wat de knoppen doen`, async ({ page }, info) => {
      test.skip(info.project.name !== 'desktop', 'a phone has no keyboard here');
      await asKeeper(page);
      await surface.open(page);

      const level = page.getByRole('group', { name: 'Zoomen', exact: true }).locator('.canvas-zoom-level');
      const stage = page.locator(surface.stage);
      await stage.click({ position: { x: 20, y: 20 } });

      const start = await level.textContent();
      await page.keyboard.press('+');
      await expect(level, 'plus zooms in').not.toHaveText(start ?? '');
      await page.keyboard.press('-');
      await expect(level, 'minus steps back to where it was').toHaveText(start ?? '');
    });
  }
});

/**
 * §69: a modifier is the browser's. `Ctrl` + `+` is the page's own zoom on
 * every desktop browser there is, and a canvas that swallowed it would be
 * taking a key away from the person rather than adding one.
 */
test('§69 Ctrl+ is van de browser, niet van het canvas', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'no modifiers on the phone project');
  await asKeeper(page);
  await SURFACES[0].open(page);

  const level = page.getByRole('group', { name: 'Zoomen', exact: true }).locator('.canvas-zoom-level');
  await page.locator('.board-viewport').click({ position: { x: 20, y: 20 } });
  const start = await level.textContent();
  await page.keyboard.press('Control++');
  await expect(level).toHaveText(start ?? '');
});
