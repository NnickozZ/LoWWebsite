import { expect, test, type Page } from '@playwright/test';
import { editCanvas, newBoard, signIn } from './helpers';

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
  /**
   * §69 (2.7): the box this surface draws while a hand sweeps one, and the
   * class it puts on a thing that is chosen. Every canvas has both since round
   * 35; before it, two of the four had neither.
   */
  marquee: string;
  chosen: string;
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
    marquee: 'board-marquee',
    chosen: 'board-card-selected',
    stage: '.board-viewport',
    makes: { kind: 'locator', selector: '.board-card' },
    emptyAt: { x: 0.78, y: 0.72 },
    open: async (page) => {
      await page.goto('/boards');
      await newBoard(page);
      await page.waitForURL('**/b/**');
      await expect(page.locator('.board-viewport')).toBeVisible();
    },
  },
  {
    name: 'stamboom',
    marquee: 'tree-marquee',
    chosen: 'is-selected',
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
      // §73: a phone opens it in Lezen; the undo, the potlood and the paper
      // that makes a kaartje are Bewerken's. Pressed until `Los kaartje` is
      // there, because the server draws the switch as a desk's (§6).
      await expect(async () => {
        await editCanvas(page);
        await expect(page.getByTestId('tree-add-loose')).toBeVisible({ timeout: 1500 });
      }).toPass({ timeout: 20_000 });
    },
  },
  {
    name: 'tijdlijn',
    marquee: 'timeline-marquee',
    chosen: 'timeline-event-chosen',
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
      // §73: a phone opens it in Lezen, where the potlood and the add button
      // are away (the stamboom's surface above does the same).
      await expect(async () => {
        await editCanvas(page);
        await expect(page.getByTestId('timeline-add')).toBeVisible({ timeout: 1500 });
      }).toPass({ timeout: 20_000 });
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
      // §94 (C7): a tijdlijn says how much time is on the glass ("≈ 6
      // maanden") instead of a percentage that meant nothing on an axis.
      await expect(level).toHaveText(surface.name === 'tijdlijn' ? /^≈ \d/ : /\d+%/);

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
 * §69 rij 9: every canvas has an undo, it is named the same, and it is grey
 * when there is nothing to take back.
 *
 * Two of the four had no undo at all before round 35, and of the two that did,
 * the prikbord's carried no icon and no `aria-label` — a blank square on a
 * phone, where the word is hidden — and both were pressable with an empty
 * stack. `CanvasUndoButton` is the one button now.
 */
test.describe('§69 de ongedaan-knop', () => {
  for (const surface of SURFACES) {
    test(`${surface.name}: staat er, heet hetzelfde, en is grijs als er niets is`, async ({ page }) => {
      await asKeeper(page);
      await surface.open(page);

      const undo = page.getByRole('button', { name: 'Ongedaan maken' });
      await expect(undo).toBeVisible();
      // A fresh canvas has an empty stack, so the button says so.
      await expect(undo, 'grey until something has happened').toBeDisabled();
      await expect(undo).toHaveAttribute('title', /Ctrl\+Z/);
    });
  }
});

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

/**
 * §69 (4.6): elk blad heeft één kruisje, en het is van `Sheet` zelf.
 *
 * Eight sheets drew their own, each in a header row of its own and each six
 * lines of the same JSX; the other dozen drew none at all — so whether a blad
 * could be closed with a pointer depended on which blad you had opened. On a
 * phone that matters most: there is no Escape key, and the backdrop beside a
 * nearly-full-width sheet is a strip a few pixels wide.
 *
 * Asked of the four container makers plus the two that open from the `+`,
 * because those are the bladen a person meets first.
 */
const MAKERS: { name: string; open: (page: Page) => Promise<void>; dialog: RegExp }[] = [
  {
    name: 'prikbord',
    dialog: /Nieuw prikbord/,
    open: async (page) => {
      await page.goto('/boards');
      await page.getByRole('button', { name: /Nieuw prikbord/ }).click();
    },
  },
  {
    name: 'tijdlijn',
    dialog: /Nieuwe tijdlijn/,
    open: async (page) => {
      await page.goto('/timelines');
      await page.getByRole('button', { name: /Nieuwe tijdlijn/ }).click();
    },
  },
  {
    name: 'stamboom',
    dialog: /Nieuwe stamboom/,
    open: async (page) => {
      await page.goto('/stambomen');
      await page.getByRole('button', { name: /Nieuwe stamboom/ }).click();
    },
  },
  {
    name: 'landkaart',
    dialog: /Landkaart ophangen/,
    open: async (page) => {
      await page.goto('/maps');
      await page.getByRole('button', { name: 'Landkaart ophangen' }).click();
    },
  },
];

test.describe('§69 elk maakblad sluit op dezelfde manier', () => {
  for (const maker of MAKERS) {
    test(`${maker.name}: het blad heeft één kruisje en dat sluit het`, async ({ page }) => {
      await asKeeper(page);
      await maker.open(page);

      const sheet = page.getByRole('dialog', { name: maker.dialog });
      await expect(sheet).toBeVisible();

      const close = sheet.getByRole('button', { name: 'Sluiten' });
      // One, not none and not two: eight sheets used to carry a second one of
      // their own, which is what this replaced.
      await expect(close).toHaveCount(1);
      await expect(close).toHaveAttribute('title', /Esc/);
      await close.click();
      await expect(sheet).toHaveCount(0);
    });
  }
});

/**
 * §69 (4.10): de primaire knop van een maakblad noemt het ding.
 *
 * Not the verb. Three of the four already did — `Openbaar prikbord`,
 * `Openbare tijdlijn`, `Openbare stamboom` — and the landkaart said
 * `Ophangen`, which tells you what you are doing and not what you will end up
 * with. The target is what the majority already does (the contract's rule),
 * so the landkaart moved.
 *
 * The word itself comes from `lib/words.ts` and a Keeper may rename it, so the
 * assertion is on the *shape*: the button's name contains the archive's own
 * word for the thing being made.
 */
test.describe('§69 de primaire knop noemt het ding', () => {
  for (const maker of MAKERS) {
    test(`${maker.name}: de knop draagt het woord voor wat er gemaakt wordt`, async ({ page }) => {
      await asKeeper(page);
      await maker.open(page);

      const sheet = page.getByRole('dialog', { name: maker.dialog });
      await expect(sheet).toBeVisible();
      // The seeded archive uses the default words, so the noun is the row name
      // — with the landkaart's own spelling for its page.
      const noun = maker.name === 'landkaart' ? 'andkaart' : maker.name;
      const primary = sheet.locator('button.btn-primary').first();
      await expect(primary).toContainText(new RegExp(noun, 'i'));
    });
  }
});

/**
 * §69 (2.7) — kiezen is één gebaar, en de tweede helft van de contract-spec.
 *
 * De eerste helft (de camera, het lege papier, de ongedaan-knop, de toetsen)
 * staat bovenaan dit bestand. Dit is wat tafel 1 over **kiezen** zegt, en het
 * is de rij waar de vier tekenvlakken het langst uit elkaar liepen: tot ronde
 * 35 konden alleen het prikbord en de stamboom meer dan één ding tegelijk aan.
 *
 * Wat hier gevraagd wordt is uitdrukkelijk *niet* wat elk vlak zelf al toetst —
 * `flow-4-board`, `family-trees-33` §67e, `timelines` en `maps` bewaken elk hun
 * eigen kaartjes, kaarten, tags en spelden. Hier staan de twee beweringen die
 * op alle vier hetzelfde moeten zijn, en die stilletjes uit elkaar drijven:
 *
 *  1. **shift-slepen op kaal papier veegt een kader** — en een gewone sleep
 *     niet, want dat is het pannen dat elk vlak al had;
 *  2. **Escape laat los.**
 */
test.describe('§69 kiezen is overal hetzelfde gebaar', () => {
  for (const surface of SURFACES) {
    test(`${surface.name}: shift-slepen veegt een kader, een gewone sleep niet`, async ({ page }, info) => {
      test.skip(info.project.name !== 'desktop', 'shift wil een toetsenbord');
      await asKeeper(page);
      await surface.open(page);

      const stage = page.locator(surface.stage);
      const box = (await stage.boundingBox())!;
      const marquee = page.getByTestId(surface.marquee);
      // Ruim binnen het glas, en op papier waar niets staat: een vers
      // tekenvlak is leeg, dus dit is overal kaal.
      const from = { x: box.x + box.width * 0.55, y: box.y + box.height * 0.6 };
      const to = { x: box.x + box.width * 0.85, y: box.y + box.height * 0.85 };

      /* Een gewone sleep pant, en tekent dus géén kader. */
      await page.mouse.move(from.x, from.y);
      await page.mouse.down();
      await page.mouse.move(to.x, to.y, { steps: 8 });
      await expect(marquee, 'een gewone sleep is pannen, geen kader').toHaveCount(0);
      await page.mouse.up();

      /* Met shift erbij wél. */
      await page.keyboard.down('Shift');
      await page.mouse.move(from.x, from.y);
      await page.mouse.down();
      await page.mouse.move(to.x, to.y, { steps: 8 });
      await expect(marquee, 'shift op kaal papier veegt een kader').toBeVisible();
      await page.mouse.up();
      await page.keyboard.up('Shift');
      // En het is weg zodra de hand loslaat: een kader is een gebaar, geen ding.
      await expect(marquee).toHaveCount(0);
    });
  }
});

/**
 * §69 (2.7): Escape laat los.
 *
 * Alleen op de twee vlakken waar dubbelklikken meteen iets neerlegt dat gekozen
 * kán worden — op een tijdlijn opent dezelfde dubbelklik een blad, en wat daar
 * uit komt heeft zijn eigen spec (`timelines.spec.ts`). Hetzelfde geldt voor de
 * landkaart, die geen rij in `SURFACES` heeft omdat er een plaat aan te pas
 * komt; die staat in `maps.spec.ts`.
 */
test.describe('§69 Escape laat los', () => {
  for (const surface of SURFACES.filter((one) => one.makes.kind === 'locator')) {
    test(`${surface.name}: Escape wist wat gekozen was`, async ({ page }, info) => {
      test.skip(info.project.name !== 'desktop', 'dubbelklikken wil een muis');
      await asKeeper(page);
      await surface.open(page);

      const stage = page.locator(surface.stage);
      const box = (await stage.boundingBox())!;
      const at = {
        x: box.x + box.width * surface.emptyAt.x,
        y: box.y + box.height * surface.emptyAt.y,
      };
      const made = page.locator((surface.makes as { selector: string }).selector);
      const had = await made.count();
      await page.mouse.dblclick(at.x, at.y);
      await expect(made).toHaveCount(had + 1, { timeout: 15_000 });

      /*
       * Kiezen door erop te drukken — in de hoek, want het midden van een
       * kaartje is vaak een tekstvak of een link naar een artikel, en een druk
       * dáár is een druk op iets anders (§6, en `chooseCard` in
       * `family-trees-33.spec.ts` doet het om dezelfde reden).
       */
      const fresh = made.last();
      await fresh.click({ position: { x: 6, y: 6 } });
      await expect(fresh).toHaveClass(new RegExp(surface.chosen));
      await page.keyboard.press('Escape');
      await expect(fresh, 'Escape laat los, op alle vier').not.toHaveClass(new RegExp(surface.chosen));
    });
  }
});

/**
 * §69 (6.8) — dezelfde beweringen op 390 px, plus de raakdoelen.
 *
 * Tafel 1 van het contract is op een telefoon gemeten, en dit is de helft die
 * daar over gaat. De camera, de ongedaan-knop en het maakblad worden hierboven
 * al op allebei de projecten gevraagd; wat hier bijkomt is het ene getal dat
 * alleen op een telefoon iets betekent: **44 px**.
 *
 * Alleen op de tekenvlakken (Nicks keuze in deze ronde) — de rest van het
 * archief blijft eruitzien zoals het eruitzag. Zie het blok `§69 (6.1)` in
 * `app/globals.css` voor wat er wel en niet onder valt, en waarom.
 */
const TAP_MIN = 44;

test.describe('§69 op een telefoon is alles te raken', () => {
  for (const surface of SURFACES) {
    test(`${surface.name}: de camera en de ongedaan-knop zijn minstens 44 px hoog`, async ({
      page,
    }, info) => {
      test.skip(info.project.name !== 'phone', 'dit gaat over 390 px');
      await asKeeper(page);
      await surface.open(page);

      const zoom = page.getByRole('group', { name: 'Zoomen', exact: true });
      for (const name of ['Uitzoomen', 'Inzoomen', 'Alles in beeld']) {
        const box = (await zoom.getByRole('button', { name }).boundingBox())!;
        expect(
          Math.round(box.height),
          `"${name}" is een duimbreed doel op een telefoon`,
        ).toBeGreaterThanOrEqual(TAP_MIN);
      }

      const undo = page.getByRole('button', { name: 'Ongedaan maken' });
      const undoBox = (await undo.boundingBox())!;
      expect(Math.round(undoBox.height)).toBeGreaterThanOrEqual(TAP_MIN);
    });
  }
});

/**
 * §69 (6.5): op een telefoon staat de inktbalk overal in dezelfde hoek.
 *
 * Op een bureau is elke hoek met reden een andere — elke hoek die vrij was, was
 * vrij omdat iets anders hem niet had. Op 390 px is dat argument weg (alles wat
 * ermee vocht is sinds deze ronde een lade of staat er niet), en wat overblijft
 * is dat een lezer het potlood op elk vlak ergens anders moest zoeken.
 */
test.describe('§69 het potlood staat op een telefoon overal gelijk', () => {
  for (const surface of SURFACES) {
    test(`${surface.name}: de inktbalk staat linksonder`, async ({ page }, info) => {
      test.skip(info.project.name !== 'phone', 'dit gaat over 390 px');
      await asKeeper(page);
      await surface.open(page);

      await page.getByTestId('ink-pen').click();
      const bar = page.getByTestId('ink-toolbar');
      await expect(bar).toBeVisible();
      const stage = (await page.locator(surface.stage).boundingBox())!;
      const box = (await bar.boundingBox())!;

      /*
       * Linksonder. Op 390 px loopt de balk vaak over de volle breedte — er
       * staan vier knoppen op van een duim breed — dus "links" is hier "hij
       * begint aan de linkerrand", niet "hij staat dichter bij links dan bij
       * rechts". Wat er echt toe doet is de onderrand: dáár ligt de duim.
       */
      const fromLeft = box.x - stage.x;
      const fromBottom = stage.y + stage.height - (box.y + box.height);
      const fromTop = box.y - stage.y;
      expect(fromLeft, 'hij begint aan de linkerrand').toBeLessThanOrEqual(16);
      expect(fromBottom, 'onder').toBeLessThan(fromTop);

      // En de knoppen erin zijn ook een duim breed (§69 6.1).
      const tool = (await bar.locator('.ink-tool').first().boundingBox())!;
      expect(Math.round(tool.height)).toBeGreaterThanOrEqual(TAP_MIN);
    });
  }
});
