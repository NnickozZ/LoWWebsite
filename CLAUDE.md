# Working on this repo

Read this before touching anything. It is the short version of what an agent
needs; `README.md` is the long version and its numbered rules are binding.

This file exists because a round once cost six hours and about two of them were
waste — an install that was declared impossible, a browser suite that never ran
until the end, and seven agents writing tests blind. Everything below is one of
those hours, written down so it is not spent again.

---

## 1. Get green before you build. Every time.

**Do this first, before planning, before reading a single feature file.** A
baseline you have not seen is not a baseline.

```bash
npm ci                 # see the trap below if this fails
npx tsc --noEmit       # must be silent
npx vitest run         # 49 files, 707 tests as of round 19 (round 18: 48 / 691)
npm run build          # must exit 0
npx playwright test    # 157 passed / 25 skipped / 0 failed at round 11, ~20 min
                       # rounds 12 and 13 both add cases (round 13 touches a
                       # dozen specs), so take your own first green run as the
                       # baseline, not this line
```

If any of those is red on an untouched checkout, **say so and stop**. Do not
start a feature on a broken baseline; you will not be able to tell your damage
from what was already there.

The Playwright run takes about twenty minutes and rebuilds the app each time.
That is not a reason to skip it — it is a reason to run it *early*, while it is
still cheap to be wrong.

### The `better-sqlite3` install trap — read this one

`npm ci` fails in most sandboxes with:

```
gyp http 403 https://nodejs.org/download/release/vX/node-vX-headers.tar.gz
gyp ERR! configure error … 403 response downloading …
```

**This does not mean native modules are unavailable.** It means node-gyp cannot
fetch headers over the network. The fix is one command:

```bash
npm ci --ignore-scripts
npm rebuild better-sqlite3 --build-from-source --nodedir=/opt/node22
```

(`--nodedir` points at the local Node install so no download is needed. Adjust
the path to wherever `node` actually lives: `dirname $(dirname $(which node))`.)

After that, `npm run build`, `npm start`, `vitest` **and Playwright all work**.
Chromium is already on disk at `/opt/pw-browsers` — never run
`playwright install`.

Do not tell a sub-agent "the build cannot run here" until you have tried the
two commands above. Saying it wrongly costs hours: every agent then writes
untested e2e specs, and the failures all arrive at once at the end.

---

## 2. Tell the user how big things are, before building

When asked for several things at once, the plan is not finished until each item
has a size next to it. Say it plainly:

> Items 1, 3 and 7 are small — about forty minutes together. Item 5 is a round
> on its own: it reverses a documented decision, adds a column to eight tables
> and touches every editing surface. Do you want it in this batch or its own?

A one-sentence request can be a schema migration across the whole app. The
person asking cannot see that; you can. **Give them the chance to split the
batch** rather than discovering the cost at hour four.

Rough calibration from past rounds:

| Shape of work | Cost |
|---|---|
| A constant, a preset list, a toolbar control | 10–30 min |
| A new field on an existing thing + its UI + tests | 30–60 min |
| A new interaction on a canvas (drag, snap, fence) | 1.5–3 hr |
| Anything that adds a column to several tables, or reverses a `DECISIONS.md` entry | 3 hr+, and it deserves its own session |

---

## 3. Verify commands

| | |
|---|---|
| `npx tsc --noEmit` | Types. Must be silent. `tests/e2e` is **excluded** from `tsconfig.json` — to typecheck specs, make a temporary config that includes them, then delete it. |
| `npx vitest run` | Unit tests. Fast (~25s). Run constantly. |
| `npm run build` | Production build. |
| `npx playwright test` | Full suite, desktop + phone, ~20 min. |
| `npx playwright test tests/e2e/x.spec.ts --project=desktop` | One spec, ~2–4 min. Use this while iterating. |
| `E2E_DEV=1 npx playwright test` | Same specs under React Strict Mode, where updaters double-invoke. Run it after touching pointer handling, refs, or a provider. |

**Never run two Playwright invocations at once** — they share port 3101 and
`data-e2e/`. One at a time, always.

---

## 4. Rules for a fan-out of agents

Several agents in one working tree will silently overwrite each other unless
you set these up front. Put them in every sub-agent prompt.

1. **Edit, never Write, on a file that already exists.** `Edit` re-reads at edit
   time, so two agents in different regions of one file coexist. `Write`
   clobbers.
2. **No agent touches `README.md`, `DECISIONS.md`, `GLOSSARY-NL.md` or
   `PLAN.md`.** All four are shared by every feature and will collide. Each
   agent ends its report with a `DOCS NOTE` section giving the exact prose and
   where it goes; one docs agent folds them all in at the end, *after* the code
   has settled, and verifies each claim against the code rather than trusting
   the note.
3. **Name the collision hotspots** in the prompt so agents route around them.
   The usual ones: `app/globals.css`, `components/boards/BoardCanvas.tsx`,
   `components/timelines/TimelineCanvas.tsx`, `components/maps/MapCanvas.tsx`,
   `components/ui/UiProvider.tsx`, `lib/db/schema.ts`, `lib/db/migrations.mjs`,
   `lib/entries/service.ts`, `tests/e2e/helpers.ts`.
4. **Two agents may share a file; two agents may not share a section of it.** If
   two features both rework the timeline, that is *one* agent, not two.
5. **Give each agent the verify commands and make it run them.** An agent that
   reports "done" without a green `tsc` and `vitest` is not done.
6. **Checkpoint between waves**: `git add -A && git commit -m "wip: …"` after
   each wave verifies green, so a bad wave can be dropped.

Planning agents are cheap and parallel-safe (they write nothing) — fan out
freely there.

---

## 5. Repo conventions an agent gets wrong

- **The numbered rules in `README.md` are binding**, and code carries `§n`
  markers pointing at them. A new rule gets the next number *and* the code
  markers to match. Check `grep -rn "§4[0-9]" app components lib` before
  choosing a number — the latest is §43 / rule 43 (het web, round 15).
- **`DECISIONS.md` records why, per round.** If you reverse an entry there, say
  so explicitly in the new entry rather than quietly contradicting it.
- **All user-facing copy is Dutch** and comes from `GLOSSARY-NL.md`. Words the
  Keeper can rename (`karakter`, `Keeper`, `artikel`, …) live in `lib/words.ts`
  and must never be hardcoded in a component.
- **Migrations are appended and guarded**, numbered `NNNN_name` — latest is
  `0020_one_crop_per_picture`, so the next is `0021_`. Never edit an existing
  block, and that includes the `--` comments inside its SQL string.
- **Board state is one JSON blob** (`boards.state`), normalised on every read.
  New fields on a card or a string get a default in `normalise*` — that is the
  migration. Do not write a SQL migration for board state. Round 13's `scale`
  on a card is the worked example: no migration, and a card without one reads
  back as 1.
- **A new kind of thing gets its dials on the day it is built** (§40, rule 40):
  a `visible<Thing>Condition` applied to every read, with a `viewer` argument
  that is *required*, not optional. A landkaart went four rounds without one,
  and the tell was a `_viewer` parameter nobody used.
- **A CSS rule beats an SVG presentation attribute.** Per-element width, dash
  and colour on board strings travel as CSS custom properties (`--string-w`),
  never as attributes, because `.board-string { stroke-width: 2 }` would win in
  silence. This has bitten twice.
- **Widths mean different things in different places, on purpose.** A board
  string is measured in board units and grows with the zoom. So does ink (§33)
  on a **prikbord** (board units) and on a **landkaart** (picture pixels):
  `useInk` stores `screenWidth / widthScale`, so a brush is as thick as it
  looked at the zoom you drew it and thicker or thinner at any other. On a
  **tijdlijn** ink is measured in *seconds* since round 12 — x an absolute
  moment, y seconds from the axis, width in seconds, all three × `pxPerSecond`
  (`lib/timelines/inkSpace.ts`, format `v: 1`) — so a drawing grows with the
  axis. A tijdlijn stroke with no `v` is v0: x in seconds, y a fraction of the
  stage's height, width in screen pixels, drawn by the old formula for ever.
  Do not "fix" any of the four, and do not migrate a v0 stroke — the `stageH`
  it was drawn at was never recorded.
- **A breakpoint that lives in two files must be the same number in both.**
  `WIDE` in `components/useIsPhone.ts` decides whether the artikel page's rail
  and sidebar are *rendered*; the `@media` block round `.entry-layout-wide` in
  `app/globals.css` decides where the grid *puts* them. They are 1280 px (§25)
  and disagreeing once gave the page two different wide layouts, which read as
  a regression. Both files say so in a comment; move neither alone.
- **The autosave patch is a patch of *keys*, and one key is a bag.**
  `useAutosave` collects changes for 800 ms and, for every key but one, the
  second answer replaces the first — which is right for a name, a body or a
  cover, because those are one value. `fields` is not one value: it is the
  infobox, a bag of independent answers, and `{ ...pending, ...patch }` threw
  the Getal away when a Ja/nee was ticked in the same window. `mergeKeys:
  ['fields']` (passed in `components/entry/EntryView.tsx`) merges that one key a
  level deeper, and nothing below it — a list *inside* the bag still replaces,
  or unticking a Meerkeuze option would never reach the server. A new key whose
  value is a bag of independent answers belongs in that list; a key holding one
  document or one list does not. `mergePatch` is exported and pure, so the rule
  is testable without a component around it (`tests/unit/autosave-merge.test.ts`).
- **A canvas on a server-rendered page must `router.refresh()` after every
  write**, or the browser's Back button lands on the RSC payload from before it.
  `components/maps/MapCanvas.tsx` now does this after a pin is **created** and
  after one is **removed** (§39 made it load-bearing: walking down a landkaart
  speld and coming back up the chip landed on a payload without the speld in
  it). A pin **move** still does not refresh — the known gap is that narrow one
  now, not the whole file.
- **`lib/assets.ts` loads sharp and the database**, so nothing client-side may
  import it. Pure, client-safe helpers belong in `lib/upload.ts`.
- **Never bulk-upgrade the dependencies.** `npm update --save`, `npx npm-check-updates -u`
  or `npm install <pkg>@latest` across the board will take Next from 15.5.25 to
  16, Tiptap from 2 to 3, drizzle from 0.39 to 0.45 and sharp from 0.33 to 0.35
  in one go — and the app is written for the left-hand side of every one of
  those. Done on 7 Sep 2026, it produced this, on every artikel page:

  ```
  TypeError: Cannot read properties of undefined (reading 'doc')
      at createDecorations (y-prosemirror/…/cursor-plugin.js)
  ```

  Tiptap 3 wants `@tiptap/pm@3`, but that range alone was left at `^2.11.5`, so
  the browser loaded **two copies of `prosemirror-state`**. A `PluginKey` is
  per-copy, so `ySyncPluginKey.getState(state)` in y-prosemirror's cursor plugin
  returned `undefined` and `.doc` threw. The cheaper tell, in the dev log:
  `[tiptap warn]: Duplicate extension names found: ['link']` — StarterKit 3
  bundles Link, StarterKit 2 does not, so that warning alone names the major.
  Cure: `git checkout -- package.json package-lock.json`, delete `node_modules`,
  `npm ci`. Reproduced and cured both ways in the sandbox; the *data* in the
  archive has nothing to do with it, and neither does anything under `app/`.
  A real upgrade of any of those four is a round of its own, not an install.
- **`scripts/seed-demo.mjs` is a fixture, not a demo.** `tests/e2e/prepare.mjs`
  runs it before every Playwright run, and `timelines`, `flow-2-link-and-create`
  and `flow-3-case-dossier` click the names inside it ("Westkapelle Lighthouse",
  "The Unwound Light", "Jacob den Hollander"). Rewriting its content turns the
  suite red twenty minutes later, in specs that look unrelated. Want a full
  archive to look at instead? That is `npm run seed-wereld` (round 16) — ~15
  artikelen per soort in Dutch, wired through fields and text, with dossiers,
  prikborden, tijdlijnen, landkaarten, karakters and voorstellen. It records
  every id in `data/seed-wereld.json` and `--clean` puts it all back.
  Two things it must keep doing, if it is ever extended: write `entry_mentions`
  itself (the opening backfill runs once per archive, so anything seeded after
  that would never show under "Genoemd in"), and give every `%A` in
  `seed-wereld.data.mjs` an `a:` saying which soort it may draw from — without
  it you get "wie iets wil regelen bij Een koperen uniformknoop".
- **The web (§43) is one `<canvas>` and a bag of mutable state**
  (`components/web/WebCanvas.tsx`): a React re-render never restarts its frame
  loop, and every prop is read through `propsRef` on the next frame. The
  drawing exposes that bag as `window.__web` for the e2e specs (which run
  against a production build) — `nodePoint()` in `tests/e2e/web.spec.ts` is
  how a spec finds a knot on the screen; do not read pixel positions any
  other way. `lib/web/slice.ts`, `layout.ts` and `force.ts` are pure and unit
  tested; put geometry there, not in the component. A new kind of tie is a
  `WebEdgeKind` in `types.ts`, a row in `kinds.ts`, a `--web-<kind>` in
  `globals.css`, and an edge in `service.ts` — all four, or the legend and the
  canvas disagree about its colour.
- **The web's simulation has three floors that are not forces** (round 17,
  `lib/web/force.ts`): a spring is divided by the smaller degree of its ends
  (`ForceLink.strength`), two knots may not come closer than `r + pad` each
  (a positional move after integration), and in a focus web a knot outside its
  depth's **band** (`sim.rings[depth]`, an annulus with area for its knots)
  is moved back in by `ringGravity` of the way. All three were forces first
  and lost to the springs of a hub — measured, not guessed. Do not turn them
  back into forces, do not put a band on the whole web (it has no middle),
  and keep `pinned` separate from `fixed`: `fixed` is a hand on the knot,
  `pinned` is a hand that let go. In `WebCanvas.tsx`, never assign
  `ctx.font` in a loop — go through `Type.font()`, which skips a string that
  is already set, and measure with `Type.width()`, which measures once at
  20 px and scales; and never `clip()` a cover per frame — `coverSprite()`.
- **The web is two canvases** (round 18): `.web-canvas-layer` under
  `.web-canvas`. The lower one holds the resting lines and the step rings
  and is rebuilt only when its key changes (`baseKey` in `frame()`: mode,
  layout, palette, size, `s.motion`, edge count); everything that depends on
  the hover or the selection is drawn on the upper one every frame. Do not
  draw anything hover-dependent into the layer, do not blit the layer with
  `drawImage` (that was 30 ms of a 49 ms frame — the compositor stacks the
  two for free), and bump `s.motion` whenever you move a knot outside the
  simulation and the tweens. Measure with `window.__web.stats` before and
  after any change to `frame()`; `scratch-perf*.mjs`-style scripts against a
  2560×1350 viewport at dpr 2 are the benchmark this round used.
- **In Kolommen the layout's coordinates are the truth; a tween is only the
  way there** (round 19). The layout effect in `WebCanvas.tsx` writes
  `columnLayout`'s x/y straight into `placed`, and a tween — made only when
  `prefers-reduced-motion` is off and the node actually moved — is walked by
  `currentPos` and lands exactly on it. Storing the prior position and
  trusting the tween to carry the card over meant that under reduced motion,
  where no tween is made, every card stayed at its organic coordinates for
  ever: the "columns like a web, with S-curves" report nobody could reproduce
  with animations on. The layout key is
  `mode|focus|depth|graphFingerprint|expanded`; the second field stays the
  focus because `nodePoint()` in the e2e specs reads it, and the fingerprint
  carries every node's depth and side and a hash of the edges, so a legend
  tick with the same ids still re-runs the layout. Also round 19: `ZOOM_MAX`
  is 12. A cover sprite is keyed on `zoomBucket(zoom, dpr)` ∈ {1, 2, 4, 8}
  and rasterised at `SPRITE_SCALE × bucket` (≤ `SPRITE_MAX_PX` = 1024),
  loading `?s=card` instead of `?s=thumb` from bucket 4 up — never for a
  whole web at zoom 1; a line's on-screen width grows as √zoom up to
  `LINE_ZOOM_CAP` = 4 and then stops (`lineZoom`, also for dashes and
  arrowheads); the cull margin is 200 *screen* px; and past `TEXT_CRISP_ZOOM`
  = 2 every caption (names, chips, "n stappen") goes through `crispText`,
  which draws at `10 px` on a context scaled back by `1/zoom` instead of at
  `10 / zoom px` — glyph placement happens at the nominal size, and at 0.8 px
  a name came out as a row of scattered letters. `lineZoom`, `zoomBucket`
  and `graphFingerprint` are exported from `WebCanvas.tsx` and unit tested in
  `tests/unit/web-layout.test.ts`.
- **Hiding a kind of knot is a slice option, not a drawing trick** (round 19).
  The legend's "Wat" block (dossiers, prikborden, landkaarten, tijdlijnen, and
  every soort in the web) feeds `hiddenNodeKinds` / `hiddenTypes` in
  `SliceOptions` (`lib/web/slice.ts`, `hiddenNode()`), next to `hiddenKinds`
  for the lines. A hidden knot is *absent* — its edges go with it, and a knot
  reachable only through it drops out of the focus walk — and the focus
  itself is always exempt. Two `localStorage` keys, `web:hidden-things` and
  `web:hidden-soorten`, beside `web:hidden-kinds`; `kindCounts` in
  `WebView.tsx` gets the same two sets, so a line to a hidden knot is not
  counted as one the legend could bring back.
- **A picture has three crops, one per shape** (round 19). `entries.cover_crop`
  and `cases.cover_crop` hold `{ landscape?, portrait?, square? }`, each a
  focal point + zoom, set once in the artikel's crop section
  (`components/entry/CoverEditor.tsx`) and used by every list, card and knot.
  A row written before round 19 holds a bare `{ x, y, zoom }` and reads as
  `{ portrait }`. Normalising happens on read, in the drizzle column type in
  `lib/db/schema.ts` (`coverCrops` → `normaliseCrops`), and again, cheaply, in
  `coverStyle`; do not add a second road. `lib/images/shapes.ts` is the only
  place a ratio lives — a frame gets its aspect from `coverClass(shape)`
  (`.cover-landscape` / `.cover-portrait` / `.cover-square` in `globals.css`),
  never from its own CSS rule. A dossier's filing and a prikbord card have no
  crop of their own any more: `case_entries.crop` is nulled and unread, and
  `normaliseState` drops `crop` off a card.
- **The web node carries `coverCrop`** already normalised — it comes through
  the drizzle column type, so `service.ts` passes it on as is. On the canvas
  `drawCover` takes a `Crop` and turns it into a source rect (a knot wears
  the vierkant crop, the columns thumb the staand one); the crop is part of
  the sprite key (`spriteKey`), or a changed crop would stamp the old sprite.
- **A text line yields, at build time.** `collapseMentions` runs in
  `buildWebGraph`, not in the browser: the count, the panel and the drawing
  must agree. Adding a kind that should also yield means adding it to
  `TEXT_KINDS` in `slice.ts` and nothing else.
- **The Keeper's web reads containers as a player** (`containerViewer` in
  `lib/web/service.ts`) unless `othersPrivate` is set. Keep artikelen and
  sections on the real viewer. `boards.in_web` is checked in exactly two
  places — `buildWebGraph` and `listMentions` — and must stay checked in
  both.
- **`MentionPopover` never owns the textarea.** It attaches through a ref or
  an element-as-state (`LiveField mentions` uses state, because the room swaps
  the element under a `next/dynamic` boundary) and writes with the native
  value setter + an `input` event. If you find yourself calling a component's
  `onChange` from it, stop: that breaks the Yjs-bound path.

---

## 6. Writing e2e specs that pass the first time

Most of the failure triage in past rounds came from a handful of repeatable
mistakes. Check yours against these before declaring a spec finished.

- **`getByLabel` matches a substring of the whole accessible name**, which for a
  radio includes the hint sentence under it. "Seconden — … de laatste twee
  minuten" is a radio whose name contains *Minuten*. Use
  `getByRole('radio', { name, exact: true })`, and give controls an explicit
  `aria-label` with `aria-describedby` for the sentence.
- **A bare `data-testid` — or a bare `getByText` — can match twice.** The side
  menu and the Jij page both render some controls, and both print the name of
  the karakter you are wearing (`.who-name`), which on a phone is there but
  hidden: three `getByText` locators on `/you` were picking the invisible copy,
  so `.first()` was never the wardrobe's. Scope it:
  `page.getByRole('main').getByTestId(…)` / `.getByText(…)`.
- **The "'…' aanmaken" row of a suggest list is on screen before the
  suggestions are.** It needs only a query (`EntryPicker`, `CaseAddSearch`);
  the real rows wait on a 160 ms debounce *and* a fetch. So a
  `.suggest-item` filtered on the name you typed matches the **create** row
  first — and clicking it opens the nieuw-artikel sheet instead of picking the
  thing that already exists. Add `.filter({ hasNotText: 'aanmaken' })`, as
  `addFromSearch` in `flow-3-case-dossier.spec.ts` and `keeperAssigns` in
  `characters.spec.ts` do.
- **`?new=1` lands on the editing face**, where the artikel's name is the title
  box `#entry-name` and there is **no heading at all**. Assert
  `toHaveValue(name)`, not `getByRole('heading', { name })` — and never a bare
  `getByText(name)`, which matches the `<code>@handle</code>` the page also
  prints.
- **`waitForURL('**/e/**')` is already true if you are standing on an artikel.**
  A helper that creates several in a row must wait for the address to *change*.
- **A page that has just navigated is not yet listening.** A click or a `fill`
  can land in silence. `tests/e2e/helpers.ts` exports `fillWhenReady` for a
  field and keeps a private `pressUntil` for "press it until the thing it opens
  appears" — copy that shape rather than inventing another retry loop. Do not
  retry a `fill` on a road that files a voorstel: a second attempt files a
  second one.
- **A gum is a stroke** (§33), so a test that gums twice needs two Ctrl+Z before
  the undo button goes dead.
- **A player needs an onderzoeker before they can write anything** (§18b). Use
  `becomeInvestigator` / `writeAs` from `helpers.ts`; a fresh account can create
  artikelen and tie its *first* one on, and nothing else — everything after that
  is the Keeper's to hand out from Beheer (§18c, rule 42).
- **Nobody lands on an editing page any more**, a Keeper included (rule 18). A
  spec that wants to type into an artikel or a dossier calls `editArticle()` /
  `editCase()` from `helpers.ts` first, which is what a person does. Only
  `?new=1` — the page you reach by making the thing — opens in bewerken.
- **Pin and stroke coordinates are fractions of `.map-world`, not `.map-stage`.**
  The stage is now much larger than the picture inside it, and a tap on bare
  cork places nothing.

If a spec fails once and passes on a re-run, it is the "not yet listening" race
— fix it with the helpers above rather than shrugging at it.

---

## 7. How work reaches the user

The user's working copy is `D:\LoWWebsite` on a linked Windows machine. There is
no shell on that machine, so the loop is:

1. `git clone https://github.com/NnickozZ/LoWWebsite.git` into the sandbox and
   work there with normal tools.
2. Confirm the clone matches their copy (compare a few file sizes via
   `device_list_dir`) before starting.
3. When green, copy every changed file into `/mnt/user-data/outputs/…` and write
   them back with `device_commit_files` (≤50 files per call, so batch them).
   **If `/mnt/user-data/outputs` starts throwing `Input/output error`** — the
   attached mount can drop mid-session, and `df` will show plenty of free space,
   so it looks like nothing is wrong — do not try to repair it. Take the other
   road: `SendUserFile` accepts any local path and returns a `file_uuid` per
   file, and `device_commit_files` accepts `fileUuid` instead of `stagedPath`.
   One `SendUserFile` call with an array, then one `device_commit_files` call
   pairing each uuid with its `devicePath`, delivers everything just the same.
4. **A deleted file is not delivered — it is a job for the user, and it must be
   the first thing you tell them.** The bridge writes files and cannot remove
   one, so a file this round deleted still sits on their disk, goes into their
   commit, and breaks their build on the next `npm run build` — a stale
   component importing an export that no longer exists. Run
   `git diff --name-status <base> HEAD | grep '^D'` before delivering; if it is
   not empty, put the exact `git rm` line **at the top of the closing message**,
   not in a commit message and not in the round note, where it will be missed.
   Round 13 buried two deletions and cost the user a broken VPS build.
5. **Do not push.** The git proxy has no credential for this repo, and their
   working tree holds the same files uncommitted — a push would make their next
   `pull` fight their own tree. They commit locally.
6. Write a round note to the Claude project (`claude/round-N-….md`), in the shape
   of the existing ones: what was asked, what was decided and why, the rules that
   must not be broken, what was deliberately left undone, and the test numbers.

---

## 8. Leftovers — rounds 11, 12, 13, 17, 18 and 19

Round 19 leaves four, all small and all named on purpose:

- The masthead logo (`.masthead-logo`, `object-fit: contain`) and the
  landkaart card (`app/(app)/maps/page.tsx`, a bare `<img>` of `maps.asset_id`)
  have no crop: `maps` has no `cover_crop` column and neither picture goes
  through `coverClass`. Deliberate — a logo is shown whole, a map is the one
  picture people zoom into.
- `?s=card` at high zoom is a second image fetch per knot from bucket 4 up
  (`coverFor` in `WebCanvas.tsx`). Never for a whole web at zoom 1, and the
  thumb keeps drawing until the card arrives, but a reader who zooms into a
  hundred knots loads a hundred 900 px pictures.
- Captions past zoom 2 pay a `save`/`restore` each (`crispText`); fine where
  few are in view, but do not route the columns' card text through it.
- The hidden-soort filter cannot hide the focus (`hiddenNode()` exempts
  `graph.focus`). By design — the page *is* that thing — but a Keeper who
  unticks the focus's own soort sees one knot of it stay and may ask.

Round 18 leaves three, none of them the web's:

- A keystroke in the first ~100 ms after a `LiveField`'s room arrives can be
  lost while the seeded text is still landing (`BoundField`, `ready` vs the
  first observer update). The timelines spec waits half a second; a fix is a
  `shown`-is-seeded flag before `readOnly` lifts.
- An edit inside the last 80 ms before a sheet closes leaves with the sheet
  (`UPDATE_BATCH_MS` in `useLiveDoc`). A flush on unmount would close it.
- `@Naam` typed by hand (without picking) is read by the index but printed as
  plain text; only `[[Naam]]` gets the chip. Deliberate — the client has no
  index — but a Keeper may ask.

Round 17 (the web breathing) leaves two small ones of its own:

- The whole web of a filled archive is a hairball with hubs, on purpose; if it
  ever needs structure, the cheap road is a band per *soort* or per dossier —
  the band machinery in `force.ts` takes any integer `ring`, it only ever gets
  the BFS depth today.
- Pins live in the sim and die with the page. If a Keeper wants a hand-laid web
  to survive a reload, that is a `web_layout` row per viewer — a round, not a
  fix.


Genuine debt, worth picking up. Round 13 narrowed one of these (the
`router.refresh()` gap) and added two of its own at the bottom; the rest it went
nowhere near, because it was seven features and about twenty-seven hours.

- The prikbord is not on the §34 canvas shell; `.board-viewport` still carries
  the old magic heights. Round 13 made cards resizable on that same wall without
  touching it, so the two do not block each other — but a wall of 250% cards is
  a better argument for the full-screen shell than it was.
- `MapCanvas` does not `router.refresh()` after a pin **move**. Create and remove
  do since round 13 (see §5), so this is now one gesture, not a whole file.
- Six places open a sheet from inside a sheet (`MapCanvas`, `TimelineCanvas`,
  `EventSheets`, `BoardCanvas`). `lib/sheetStack.ts` makes them survive it; they
  are not correct by design. Round 13 added a seventh road into `MapCanvas`'s
  pin sheet (the landkaart speld and its "openen" button), which survives the
  same way and for the same reason.
- "gezet door {naam}" on a landkaart and a tijdlijn still derives per account
  rather than reading the row's recorded `character_id`.
- An ink stroke names an account inside the layer JSON, not an onderzoeker.
- `updateEvent` / `updatePin` write no activity row at all (pre-dates §18b).
- `recomputeFieldMentions` has the **same two-source blind spot the §38 field
  gate just fixed**: it reads `entry_types.fields` and nothing else, so an
  artikel chosen in a *hand-filled `links` block* on a soort's page is not
  counted under "Genoemd in" (rule 26). The keys are in `listBlockKeys` already
  — this is a matter of building the same synthetic `entry_links` FieldDef
  `fieldValues.ts` and `EntryView` both build, and handing it to
  `fieldMentionsIn`. Cheap, and it is a missing row rather than a leak.

Deliberately left out of round 13, and named so nobody has to rediscover that
they were a choice:

- **Spelden that stand for a dossier or a tijdlijn.** §39 is one column
  (`target_map_id`), not a polymorphic target; a second kind means the column
  becomes a pair, or a `target_kind` beside it.
- **`removeCharacter` being Keeper-only** (rule 42) was the building agent's
  judgement call on symmetry, not Nick's instruction. The argument for it is
  written down in `DECISIONS.md`; if it costs more than it buys, it is one line.

Asked for by Nick and deliberately left out of round 12, so that round stayed
two fixes and about four hours — and out of round 13, which was already seven
items. All three are decided, not open questions — build them as written:

- **A pasted photo on a prikbord should be a `note`, not a `kind: 'photo'`
  card** (~2 h). A notitie can already hold a picture, so the photo kind earns
  nothing and gives a wall two cards that are the same thing. Mostly a rename
  plus a normalise-on-read shim — board state is one JSON blob normalised on
  every read (see §5), so an existing `photo` card becomes a `note` on the way
  in and no board is migrated.
- **Making a gebeurtenis from a board card** (~4 h), reusing the `?place=` road
  that already exists on a tijdlijn rather than inventing a second one.
- **The tijdlijn's image tools should match the prikbord's** (~5 h; ~8 h if
  cropping is wanted too). Today Ctrl+V does nothing on the axis itself, there
  is no full-size view, a new gebeurtenis cannot be given a picture as it is
  made, and pasting into a text field swallows the image. Nick's decision on
  the first of those: **pasting on the bare axis opens a new gebeurtenis at
  that moment, carrying the picture.**
