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
npx vitest run         # 156 bestanden, 2756 tests na golf N; 155 / 2755 na golf M·herstel; 153 / 2739 na golf M; 146 / 2649 na golf L;
                       # 145 / 2633 na golf K; 144 / 2618 na golf J (branch
                       # `gevoel`, 4afc3a5); 140 / 2557 na golf I
                       # (d1dc532); 137 / 2487 na golf H;
                       # 134 / 2441 na rondes 65–67 en hun
                       # herstel; 126 / 2224 at round 64;
                       # 125 / 2205 at golf 3 (rounds 58–62
                       # and the naden); round 56: 119 / 2110; golf 2 with
                       # rounds 53, 54, 55 and 57: 118 / 2095; round 52:
                       # 113 / 2022; round 38: 99 / 1596)
npm run build          # must exit 0
npx playwright test    # na golf K: 968 zaken, 738 passed / 225 skipped /
                       # 5 rood in de volle run, waarvan per-place-crops
                       # de bekende en keeper-side:232, round-34:50,
                       # round-7:36 en timeline-coop:282 alleen gedraaid
                       # groen (drukte op 2 kernen), ~1,2 u;
                       # na golf J: 960 zaken, 735 passed / 224 skipped /
                       # 1 rood (per-place-crops), ~1,2 u op 2 kernen;
                       # na golf H: 880 zaken, 671 passed / 207 skipped /
                       # 1 rood (per-place-crops), ~1,2 u op 2 kernen;
                       # 157 passed / 25 skipped / 0 failed at round 11, ~20 min
                       # rounds 12 and 13 both add cases (round 13 touches a
                       # dozen specs), so take your own first green run as the
                       # baseline, not this line
```

Single specs, for planning a round rather than for waiting on the whole suite
(round 33, one project at a time): `family-trees` ~1.4 min, `family-trees-33`
~1.8 min (4.2 under `E2E_DEV=1`), `family-tree-coop` ~1 min, `ink` ~1.5 min.

Een tweede worktree draait zijn eigen Playwright naast deze, met `E2E_PORT`
(zie §3).

If any of those is red on an untouched checkout, **say so and stop**. Do not
start a feature on a broken baseline; you will not be able to tell your damage
from what was already there.

With one known exception, as of round 22: `tests/e2e/per-place-crops.spec.ts`
fails on untouched `main` too. It is a spec for a feature round 19 removed —
see §8. Do not spend an hour diagnosing it, and do not let it hide a real
failure either: check the rest of the run.

**And one spec file is flaky, as of round 36: `tests/e2e/keeper-side.spec.ts`.**
Round 36 ran the whole suite twice and lost a *different* case out of that one
file each time — `:214` ("de spiegel klapt om") on the way in, `:59` ("een
artikel krijgt een Keeperversie, en die deelt één tekst") on the way out — while
all five tests in it pass when the file is run alone
(`--project=desktop`, 5 passed). That is §6's "not yet listening" race, not
anybody's damage, and it is the first thing that will look like damage. Fix it
with the helpers in §6 the next time somebody is in that file; until then, a
single red case in `keeper-side` is worth re-running alone before believing it.

**Twee dingen uit golf I.** `kamer-ux.spec.ts:506` was op het `phone`-project
rood als hij alleen draaide: sinds golf H (T5) staat `plek-picker-zoek` op een
aanraakscherm pas vanaf `PICK_SEARCH_FROM` dingen, en in de volle suite waren
die er toevallig. De spec kent die drempel nu (e257c53); rood daar is dus weer
echt. En `E2E_DEV=1` over de tekenvlakken is in golf I maar half gedraaid:
`golf-i1-vlakken.spec.ts` (phone) was groen onder Strict Mode, daarna liep de
dev-server van Next op tot 4,4 GB en hing `round-37-map`. Draai
`round-37-map`, `round-37-pinch` en `round-37-timeline` onder `E2E_DEV=1` op
een rustige machine, één tegelijk (zie §8). *Golf K deed dat: alle drie groen
onder Strict Mode, elk alleen (2, 1 en 2 passed; de `ECONNRESET`-regels van
de dev-server zijn ruis).*

**Drie dingen uit golf J.** `ronde-54-de-kamer.spec.ts` ZAAK 2 had hetzelfde
als `kamer-ux:506`: alleen gedraaid staat `plek-picker-zoek` er op de telefoon
niet. Hij kent de drempel (`PICK_SEARCH_FROM`) nu ook; rood daar is echt. En
twee zaken waren elk één keer rood in een gecombineerde of volle run en groen
alleen: `phase3-keeper-tools.spec.ts:349` (site settings, desktop) en
`golf-i2-eerste-keer.spec.ts:132` (*Je schrijft als …* in een tweede venster;
vermoedelijk de melding die vóór het blad komt en door T6 weggaat, niet verder
uitgezocht). Draai ze alleen voordat je ze gelooft (zie §8).

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
| `E2E_DEV=1 npx playwright test` | Same specs under React Strict Mode, where updaters double-invoke. Run it after touching pointer handling, refs, or a provider. **One spec at a time** (golf M): in a combined run the dev `next-server` climbs to ~4 GB. The glide case in `golf-m-samen.spec.ts` skips itself under `E2E_DEV` (it measures a production build). |

**Never run two Playwright invocations at once** in one working tree — they
share port 3101 and `data-e2e/`. One at a time, always. Sinds ronde 65 is
de poort `E2E_PORT` (standaard 3101, `playwright.config.ts`), en `data-e2e/`
staat in de worktree zelf. Een tweede worktree draait dus zijn eigen suite
naast deze met `E2E_PORT=3102 npx playwright test …`. Op een kleine machine
zijn dat nog steeds twee productiebuilds tegelijk: een fan-out zet ze in een rij
(ronde 65 deed dat met een slot-script).

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
   `components/families/FamilyTreeCanvas.tsx`, `components/ui/UiProvider.tsx`,
   `lib/db/schema.ts`, `lib/db/migrations.mjs`, `lib/entries/service.ts`,
   `lib/families/service.ts`, `tests/e2e/helpers.ts`. Since round 33, three
   more that every canvas now leans on: `lib/canvas/*`, `components/canvas/*`
   and `components/ink/useCanvasInk.tsx` — a change there is a change to four
   drawings at once, so it is one agent's, never two.
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
  markers to match. Check `grep -rn "§[5-9][0-9]\|§1[0-9][0-9]" app components lib`
  before choosing a number (the old pattern `§[5-9][0-9]` stops at 99) — the
  latest is **§108 / rule 108** (golf M; its code markers still say
  `Golf M (samen)`, not `§108`), so the next rule is **§109**. **Golf I** (na
  golf H en design-review 4, `REVIEW4.md`; drie worktrees i1/i2/i3 op
  `gevoel`, samengevoegd als `d1dc532`) voegde er drie toe, elk met een eigen
  laag in `app/layout.tsx` na `leeskamer.css`: **§105** (i1, de tekenvlakken
  op de telefoon, `app/vlakken.css`: een kop van twee regels en een werkbalk
  van één, de maakknop als `+` onder de duim via `.canvas-make` met
  `.canvas-undo` ernaast, `CanvasPeek` die de duim volgt op `transform` met
  `lib/canvas/peek.ts`, `data-groeit` en `data-peek-hoog`, de inspector en de
  lade van het prikbord als peek, `CanvasEmpty` met de `strook` op landkaart
  en tijdlijn, de loep op landkaart en tijdlijn, `openingOnPins`), **§106**
  (i2, de eerste keer, `app/eerste-keer.css`: `LegeStaat` +
  `components/eerste-keer/*` (Deuren, WieBenJij, EersteRoute, Uitnodiging,
  EersteBezoek), `lib/eerste-keer/stappen.ts` (puur: `normaliseInvite`,
  `formatInvite`, `inviteLink`, `routeSteps`, `showsRoute`, `seenPlaces`/
  `withSeen`, `isNewAccount`) en `tellen.ts`/`bezoek.ts`,
  `app/(auth)/Voordeur.tsx`; één onderzoeker is geen keuze: `soleAuthor`) en
  **§107** (i3, Beheer, `app/beheer.css`: de index op de telefoon met alleen
  *‹ Beheer* na een keuze en een linkerkolom vanaf 1180 px in `AdminTabs`, de
  soort-editor in twee kolommen, één voet `.beheer-voet` voor Soorten en
  Woorden, *Pictogram en kleur*, Woorden in context, het wachtwoordblad; de
  pure helften in `lib/beheer.ts`). Geen migratie. Zie
  `tests/unit/golf-i[1-3]-*.test.ts` en `tests/e2e/golf-i[1-3]-*.spec.ts`.
  **Golf J** (na de meting na golf I, `meting-na-golf-i.md`; vijf worktrees
  j1–j5 op `gevoel`, samengevoegd tot `4afc3a5`) gaf **geen nieuw nummer**:
  elk deel vult een regel aan met een blok *Aangevuld in golf J*. §105 (j1,
  de vlakken: `gatePress` met `BOARD_GLASS`/`MAP_GLASS`/`TIMELINE_GLASS`/
  `TREE_GLASS` en `PRESS_SLOP`, zodat lezen in Bewerken niets vraagt; Vind
  onder de werkbalk met `findListRoom` en `--find-room`; `CanvasPeek
  startFull`/`resetKey` voor het web; `panToBring`/`boxOnGlass` op de
  stamboom). §90, §92, §100, §101 en §104 (j2, schrijven en zoeken:
  `typingScroll`, de `+` die wijkt voor een caret, `naad-wit`, `typeFold`,
  `lib/search/rang.ts` met `nameScore`/`palettePlan`/`orderSections`,
  `SectionsEditor` op `useCanvasAuthorGate(true)`, de tags onder de dichte
  infobox). §106 en §107 (j3: de caret in *Wie ben jij* met een muis,
  `useNietBewaard` en `mountedPanes`, de uitnodiging op de index,
  `SoortKiezer`), met stuk 12 onder §102 (`lib/vroegeKlik.ts`). §104 (j4, de
  eerste verf: `useIsWide`/`useHasRail`/`usePhoneKnown` zijn `null` tot de
  hydratatie, `.entry-kop`, `VoorafTekst`). §90 (j5: de geweken `+` is
  `visibility: hidden`; `releaseCaret`/`pressNewEntry` in de specs). Geen
  migratie. Zie `tests/unit/golf-j[1-4]-*.test.ts` en
  `tests/e2e/golf-j[1-4]-*.spec.ts`.
  **Golf K** (Nick, 29 september: de omslag heel op een telefoon, de pagina in
  het midden op een computer, en de tabrij op de voorpagina van de wiki; plus
  de open eindjes van golf J) gaf **geen nieuw nummer** en draait drie dingen
  om: §104 L5 (de liggende omslag onder 1280 px), golf H D5 (elke pagina tegen
  de zijbalk) en ronde 67·herstel #16 (`TypeTabs compact`). Verder: *Aanmaken*
  plakt in het huisraadblad (§93), een systeemletter op maat achter elk
  webfont (§104), `placeLabels` voor de kaartnamen (§105, M3) en tagjes van
  twee regels op de tijdlijn (§105, M2). Geen migratie. Zie
  `tests/unit/golf-k.test.ts` en `tests/e2e/golf-k.spec.ts`.
  **Golf L** (Nick, 29 september: de tekens — alle iconen, vormen, randen en
  lijnen geïndexeerd, en het donkere prikbord was kaal) gaf **geen nieuw
  nummer** en draait één ding om: §58's gedeelde rand van het pantheon. Negen
  iconen opnieuw getekend, zeventien erbij (zestien in de kiezer plus `more`),
  `merk`; zeven soorten en vier randen verhuisd onder `seed:golf-l-tekens`
  (`GOLF_L_TEKENS`, `GOLF_L_RANDEN`); vier randen erbij (`sigil`, `tide`,
  `burnt`, `seal`); het kurk en de punaise in een nieuwe laag
  `app/tekens.css`; het merk als icoontje (`public/merk.svg`, `lib/merk.ts`).
  Geen migratie. Zie `tests/unit/golf-l.test.ts`.
  **Golf M** (Nick, 29 september 's avonds: de knipperende tabwissel, *Wie is
  er?* overal rechtsboven, naar iemand toe gaan en iemand roepen, de rechten
  op een landkaart, de tijdlijn aan de randen, Gebruikers zoeken, samen op
  een vlak, en de stamboom; vijf werkstromen, `91e1e41..5c61b6e`) gaf
  **één nieuw nummer, §108** (samen op een vlak: `lib/canvas/follow.ts` +
  `useFollow` laten wat een ander draagt glijden, `lib/live/hands.ts` +
  `useSoftLock` zijn het zachte slot, `POINTER_CARRY_THROTTLE_MS` 50 ms,
  `goneByOthers`/`revive`). Het draait vier dingen om: het skelet en de fade
  van §102 (alleen de streep, `Skeleton.tsx`/`skeletonShape.ts` weg), ronde
  57's *Wie is er?* niet op een tekenvlak (de strip staat overal, het
  prikbord heeft geen eigen rij), "wie een speld zette is de baas" (§19; nu
  `viewerCanEditMap` voor elke speld, §40) en §29/§66's undo zonder veld (op
  de stamboom zet Ctrl+Z een ref gericht terug, `lib/families/undoSteps.ts`).
  Verder: de plek op de plek (§76, `lib/live/spot.ts`, `?waar=`,
  `spotForViewer`, `LiveSpot`), de ring om de speld zelf (`lib/maps/held.ts`),
  `stableRanks`/`anchorOnGlass` op de tijdlijn (§62), `askedFor` voor
  `?event=` (§94), `spelerPast` in Beheer (§107), en de QOL van de stamboom
  (§67: `TreeLineHandle`, `TreeContextMenu`, `lib/families/connect.ts`,
  `lib/families/lineage.ts`). Geen migratie; drie bestanden weg
  (`components/editor/LivePeople.tsx`, `components/shell/Skeleton.tsx`,
  `components/shell/skeletonShape.ts`). Zie `tests/unit/golf-m-*.test.ts` en
  `tests/e2e/golf-m-*.spec.ts`.
  **Golf N** (Nick, 30 september 's ochtends: het prikbord met een zichtbaar
  patroon, de Keeper die niet te volgen was, tekst die de kolom niet vult, en
  *Meer soorten*) gaf **geen nieuw nummer** en draait vier dingen om: ronde
  39's `quiet` Keeper (§76: hij is nu een plek als ieder ander, langs
  `canWatch`), golf L's kurk (een rustig vlak, `--board-surface`, één
  `feTurbulence` over het glas), §104 L8's 68ch en de rem-maten (tekst vult de
  kolom; `.page` en de 64 rem-pagina's zijn 1440 px) en golf H's D6 (elke
  soort is een tab, de rij breekt). Nieuwe laag `app/ruimte.css` na
  `tekens.css`, elke regel met `.main` ervoor. Geen migratie; twee bestanden
  weg (`components/MeerSoorten.tsx`, `lib/wiki/tabrij.ts`). Zie
  `tests/unit/golf-n.test.ts` en `tests/e2e/golf-n.spec.ts`.
  Rondes 65–67
  (*het gevoel*, na `claude/review-ui-ux-het-gevoel.md`, gebouwd in vijf
  worktrees, samengevoegd als `gevoel`, met een herstelronde per ronde)
  voegden er drie toe: **§102** (round 65, het bewegingscontract: de tokens
  `--dur-1..5`/`--ease-*` en `--live` op `:root`, `docs/beweging.md`, en
  `tests/unit/beweging.test.ts` faalt op een losse duur of een dubbele
  `@keyframes` in elk `app/*.css`; `Sheet` heeft een uitgang, alleen via het
  kruisje en de achtergrond (`exit`, `onLeave`); `ToastView` pauzeert, 6 s of
  10 s met een knop; `NavPending` + `NavProgress` + `Skeleton`: het vakje
  meteen, na 150 ms een skelet of een streep, geen `loading.tsx`; de pagina
  vervaagt in vanaf 0,6 (skelet en fade sinds golf M weg: alleen de streep);
  de voorbeeldkaart die je kunt pakken (`data-reach`,
  500/250 ms, Escape); de cirkel van de omslag terug als cross-document view
  transition achter `FLIP_SCRIPT` en een verse `lw:flip`; in Lezen vraagt
  niets naar de schrijver; de FAB wijkt op een leespagina. Geen migratie),
  **§103** (round 66, het geld klinkt: een moment is een briefje van de hand,
  `markLanding`/`markUnlock` in `components/kamer/moment.ts`; het saldo rolt
  tussen twee serverwaarden in `SaldoGetal`, met een chip die nooit rood is;
  `lastGrantOf` en één melding per gift; *Ingericht* één keer per kamer uit
  `first` van `buyFurnishing`; geluid opt-in via `lib/sound/*`; in de winkel
  is de stempel de prijs en zegt de knop *Kopen → plek*. Geen migratie) en
  **§104** (round 67, de leeskamer: drie vaste blokken onder het overzicht van
  de wiki uit `lib/wiki/leeskamer.ts`; `randomEntry` als enige kiezer achter
  `/wiki/willekeurig`, *Verras me* en *Nog één*; *Genoemd in* met de zin
  (`snippetAround`, `mentionSentences`); *Bijgewerkt door*; `HeadingAnchors`
  naast ProseMirror; `twinFieldOf` voor L9; de naad in `lib/wiki/naad.ts`;
  soortkleur naar inkt gemengd voor 4,5:1; `?pagina=`/`?per=`. Geen
  migratie). Zie `tests/unit/beweging.test.ts`,
  `tests/unit/ronde-6[5-7]-*.test.ts` en `tests/e2e/ronde-6[5-7]-*.spec.ts`.
  **Golf H** (na design-review 3, `REVIEW3-DESKTOP.md` en `REVIEW3-PHONE.md`,
  drie worktrees h1/h2/h3 op `gevoel`) gaf **geen nieuw nummer**: elk deel
  vult zijn regel aan, als blok *Aangevuld in golf H* onderaan. §102 (h1, de
  schil): de Keeperkant als schakelaar in de mast op een computer
  (`SideToggle variant="mast"`), één paginaraster, `data-pending` op elke
  interne link uit `NavProgress`, skeletten voor de tabpagina's, `jijIsHere`
  en `currentDoor`, de tabbalk met woorden en `--tab-rood`, de FAB die overal
  wijkt, *Wie is er?* die niet plakt, een 404 in de schil via
  `app/(app)/[...rest]/page.tsx`. §103 (h2, de economie): `DichtePlekken`,
  `KoperKop`, `announceBalance`, `toast()` met een `key` en `TOAST_MAX` = 2,
  `toast-munt`, *Ingericht* bij de eerste netto koop. §104 (h3, lezen): de
  wegwijzer is een kolom pas vanaf 1500 px (`useHasRail`, `RAIL`), de
  soorttabs zijn één rij met *Meer soorten* (`rangSoorten`, `MeerSoorten`,
  `data-rang`), `.schuifrij` + `useSchuifrij`, `.rijen` voor de rijvorm op de
  telefoon, `.card-gemengd`, `naadHoofd`. Geen migratie. Zie
  `tests/unit/golf-h[1-3]-*.test.ts` en `tests/e2e/golf-h[1-3]-*.spec.ts`.
  Daarvoor golf 3 (rounds 58–62), die er vijf toevoegde: **§97** (round 58, het lek in de lopende tekst:
  een `entryLink` in `entries.body`, `sections.body` en `cases.notes` bewaart
  alleen `{ handle }` uit `mention_handles`; de naam alleen in de node-view,
  per lezer; elke schrijfweg door `cleanDocRefs`; `linkedEntryIds` leest wat
  een document noemt; de zoekindex draagt geen namen achter chips. Migratie
  `0035_de_lopende_tekst`), **§98** (round 59, een id in elk kort vak: speld,
  gebeurtenis, los kaartje, prikbordkaartje, de omschrijvingen van de vlakken
  en de inleiding van een overzicht zijn `ShortField`s met handvatten;
  `cleanShortWrite`; `entryIdsInShort` telt elk kort vak onder *Genoemd in*;
  een klik op een chip in Bewerken zet de caret erachter; `putBack` op zijn
  plek; `sweepMentionHandles`. Migratie `0036_elk_kort_vak`), **§99** (round
  60, de vlakken, derde pas: `boards.description` via `setBoardDescription`,
  de tekenlaag van het prikbord onder de vouw, `TREE_OPEN_MAX_ZOOM`,
  *Ongedaan maken* alleen voor wie mag bewerken, beletterde handgrepen.
  Migratie `0037_prikbord_beschrijving`), **§100** (round 61: `/` en Ctrl/⌘K
  openen het palet, `CommandPalette`; *Onlangs* in `localStorage`
  (`lib/palette/recent.ts`, `resolveRecent`); `>` voor `paletteActions`; één
  opslaan-woord in de schil, `SaveStatus` + `saveRegister`. Geen migratie) en
  **§101** (round 62 plus de naden: `roomRowCondition` in het feed,
  `giveToDrawer`, B25's vouw (`foldEmpty`), `data-autofocus` in een blad, een
  lege Tekst `hidden`, `closeGaps`, `mayHoldRoom` zonder de prullenbak. Geen
  migratie. Zie `tests/unit/ronde-5[89]-*.test.ts`, `ronde-6[0-3]-*.test.ts`
  en `tests/e2e/ronde-5[89]-*`/`ronde-6[0-2]-*`). Daarvoor **§95 / rule 95**
  (round 56, after 57: numbers are not in building order: één regel, één id. In de korte
  vakken — korte beschrijving, samenvatting, infobox Tekst en Lange tekst — is
  een vermelding een token `⟦handvat⟧` (`lib/entries/shortTokens.mjs`) met
  één rij per vermelding in `mention_handles`; de naam komt alleen via
  `resolveHandles`, per kijker, en wat je niet mag zien is **niets**, ook in
  de kamer; elke schrijfweg gaat door `cleanShort`; het vak is `ShortField` →
  `ShortEditor` op dezelfde `Y.Text`. Migratie `0034_een_id`. Zie
  `tests/unit/ronde-56-een-id.test.ts`.) Round 57, §96: zoeken,
  Beheer en de losse eindjes. `/search` vindt onder *Alles* ook dossiers,
  overzichten, landkaarten, tijdlijnen, stambomen, prikborden en spelers op
  naam (`searchOthers` in `lib/search/others.ts`, elke soort door zijn eigen
  `list*` zonder `bothSides`); een Keeper-woord mag 200 tekens (`WORD_MAX`);
  Beheer → Woorden heeft een zoekvak, ingeklapte groepen en een plakkende voet;
  een nieuwe soort opent zichzelf; `/you` zet Lettertype en Kleuren onder de
  karakters; de Keeperkant zegt wat een speler ziet (`PlayerSees`,
  `asPlayerHref`); *Wie is er?* bij de stip op een computer. Geen migratie. Zie
  `tests/unit/ronde-57-*.test.ts` en `tests/e2e/ronde-57-zoeken-en-beheer.spec.ts`.
  Daarvoor **§94 / rule 94** (round 55: de tekenvlakken, vinden en terug. De
  keuze in het adres (`?card=`/`?pin=`/`?event=`/`?node=`, `writeChoice` met
  `replaceState(null, …)`), de camera per vlak per tabblad in `sessionStorage`
  (`lib/canvas/memory.ts`), een net gemaakt vlak opent in Bewerken via
  `?new=1` (`freshHref`), openen op een leesvloer (`readableFit`), vinden op
  het vlak (`CanvasFind`, `findOnCanvas`), *Ga naar…* op een tijdlijn, een deur
  van een artikel naar zijn stamboom, het prikbord op de §34-schil, en
  `BinSlot` op alle vier. Geen migratie.) Daarvoor **§93 / rule 93** (round
  54: de kamer, tweede pas. Migratie `0033_de_lade`: bezit is plekken plus de
  lade (`room_drawer`), `placeItem` weigert een speler huisraad buiten de lade
  van die kamer, weghalen legt huisraad in de lade, uniek is `claimedIds()`,
  een koop mag tien seconden terug (`undoPurchase`, een `return`-regel erbij),
  en verplaatsen is tik-tik (`moveItem`).) Daarvoor **§92 / rule 92** (round
  53: de korte vakken. Buiten focus ligt `MentionPreview` over een kort vak
  (chips, geen haakjes), in focus de ruwe tekst; `MentionRow` bestaat niet
  meer; een losse `[[` verdwijnt bij het verlaten en bij Escape
  (`dropDanglingOpeners`); de namenlijst meet tegen `visualViewport`
  (`placeSuggestList`); `enterLeaves` op een vak van één regel; op een telefoon
  is de infobox ook in Lezen dicht. Geen migratie.) Daarvoor **§91 / rule 91** (round 52: jouw plek. De
  tweede bouwronde na de UI/UX-review, en weer **geen migratie** en geen
  verwijderd bestand. De speler heeft een vaste plek: op een computer de groep
  *Jouw plek* in de zijbalk (Kamer met saldo, Winkel met `?kamer=`, Mijn
  spelerspagina, Spelers met *n online*), onder een zoekvak waar `/` de cursor
  in zet, met *Het archief* en — alleen gerenderd voor de Keeper — *Keeper*
  (Beheer, Uitdelen) eronder; op een telefoon opent de achtste tab het
  **Jij-blad** en draagt hij het saldo (nog steeds acht tabs). Eén lijst, twee
  tekeningen: `yoursDoors` in `components/shell/JouwPlek.tsx`. **De beurs-pil
  in de hoek is weg** (regel 84 half omgekeerd); `ShellBeurs` is nu de hook
  `useShellBeurs`, één luisteraar voor beide tekeningen. **Eén wie-regel**:
  elke wissel van *speelt als* neemt de schrijfkeuze van dit venster mee
  (`followPlay`, `afterPlaySwitch`), en *Je schrijft als* staat in de schil
  alleen nog waar die twee bewust verschillen (`showsWritingLine`). Start
  kreeg een Jij-rij boven het welkom, uit de eigen feed (`ownRecentWork` in
  `lib/home/jij.ts`). Zie `tests/unit/ronde-52-jouw-plek.test.ts` en
  `tests/e2e/ronde-52-jouw-plek.spec.ts`.) Daarvoor **§90 / rule 90** (round 51: de deuren. De
  eerste bouwronde na de UI/UX-review `claude/review-ui-ux-de-wrijving.md`:
  kleine reparaties en echte bugs, geen herontwerp, en **geen migratie**.
  Economie: `/winkel` zonder `?kamer=` koopt voor het karakter dat je speelt
  (`shopFor` → `purseOf`, niet `rooms[0]`), `room:{id}` beweegt eindelijk
  (`rooms`/`room_slots`/`room_ledger` in `TABLES`, zie de TABLES-regel
  hieronder), en *Kamer maken* staat alleen op een artikel dat een onderzoeker
  kán zijn (`mayHoldRoom`). Tekenvlakken: de schrijfvraag van §18b komt nooit
  in Lezen (`useCanvasAuthorGate`, `lib/canvas/authorGate.ts`), *Ongedaan
  maken* is in Lezen overal grijs, en op een tekenvlak is er geen FAB.
  Schrijven en schil: een tag-chip gaat naar `/wiki/<soort>?tag=`
  (`tagListHref`), een uitgelogde browser neemt `?next=` mee (alleen gevolgd
  via `safeReturnPath`), het opslaan-woord is `combinedSave`, en de
  blokkerende schrijfvraag heeft geen dood kruisje meer. Zie
  `tests/unit/ronde-51-*.test.ts` en `tests/e2e/ronde-51-*.spec.ts`.)
  Daarvoor **§89 / rule 89** (round 50: de sloten. Een
  beveiligingsronde: geen wachtwoord is nog leesbaar — `password_enc` en
  `PASSWORD_RECOVERY_KEY` zijn weg, migratie `0032_sloten` — een uitgelogde
  lezer ziet **niets** (`null` is `0 = 1` in elke zichtbaarheidsregel), elke
  pagina begint met `requireViewer()`, `middleware.ts` weigert wie geen
  sessiecookie heeft en elke schrijf van een andere herkomst, en wat een speler
  niet mag zien bestaat niet als versie, `@`-chip of terugzetknop. Zie
  `docs/sloten.md` en `tests/unit/sloten.test.ts`; **een nieuwe pagina krijgt
  `requireViewer()` op regel één en een nieuwe `'use server'`-export moet ergens
  geïmporteerd worden, anders faalt die test.**) Daarvoor **§88 / rule 88** (round 49: de naam in de
  tab. De titel van de browsertab stond als letterlijke string in
  `app/layout.tsx` terwijl de naam van het archief sinds ronde 1 een
  *instelling* is die de mast, de kop op Start en de export allang lazen —
  hernoemen veranderde alles behalve de tab. `generateMetadata()` in de wortel
  leest nu `siteIdentity()` (`lib/admin/identity.ts`): één `SELECT` op rij 1,
  **geen sessie**, want de wortel draait boven de inlogpoort en een archiefnaam
  is geen geheim. Daarnaast een **icoontje** in Beheer → Site, naast het logo en
  met hetzelfde gebaar; leeg betekent "val terug op het logo", plakken blijft
  van het logo, en de asset zelf blijft achter de inlog (401 zonder sessie).
  Migratie `0031_eigen_naam_en_icoon` hernoemt het archief **alleen als het nog
  de naam van ronde 1 draagt** — die ene `WHERE` is de hele afspraak en er staat
  een test op.) Daarvoor **§87 / rule 87** (round 48: een voordeur
  per kant. Elk overzicht was al per kant gescheiden, maar `/wiki` gaat langs
  `getHomeOverzicht` — een **opzoeking**, en §46 zegt dat een opzoeking nooit
  op kant filtert. Er was precies één rij met `is_home`, dus las de Keeper op
  zijn eigen kant de voorpagina van zijn spelers. **Een voordeur is geen
  touwtje**: je loopt er niet naartoe, je staat erop. Migratie `0030` zet er
  één bij voor de Keeperkant, leeg, en `getHomeOverzicht` draagt nu
  `sideCondition` — terwijl `getOverzicht` en `getOverzichtBySlug` dat terecht
  nog steeds niet doen. De terugval valt nooit terug op de voorpagina van de
  ándere kant; daar staat een test op.) Daarvoor **§86 / rule 86** (round 47:
  de lijst en de veerman. De uitdeler begint **leeg** en je zoekt erin — op de naam van de
  onderzoeker én die van de speler — met een telling over de héle lijst en
  *Alles in beeld* dat aanvinkt wat het filter toont; het globale bedrag raakt
  **alleen wat aanstaat** en heet daarom niet meer *Voor iedereen*. Elke rij
  zegt nu of iemand het karakter draagt en of hij het *speelt* — dat antwoord
  bestond al (`handOutTargets` las altijd `user_characters`, niet het actieve
  karakter) maar stond nergens. En de Keeper kan met één knop op een artikel
  een **kamer openen voor een onderzoeker die niemand draagt** — een handeling,
  nooit een bijwerking van een lezing, en de kamer wordt dicht geboren (§48).
  De fout die de ronde zijn naam geeft: `getOrCreateRoom` stelde de dragervraag
  vóór de opzoeking, dus de nieuwe kamer bestond wél en geen enkele andere
  lezer zag hem — §83's les voor de derde keer, zie §86 hieronder.) Daarvoor
  **§85 / rule 85** (round 46: de kamer
  in de hand, de tweede helft van het kamer-contract. **Eén rijhoogte** voor
  alle vier de staten van een tegel (`grid-auto-rows` plus een vierkante
  uitsnede — het raster brak tot nu toe bij de eerste koop); een grootboek dat
  **zinnen** leest in plaats van veldnamen (*Plank geopend*, niet `Plek: plank`),
  ingeklapt staat op drie regels en zijn bedrag zonder stempel tekent; *wat deze
  kamer je geeft* boven het raster, met een lege variant; weghalen als een
  kruisje; de plek-kiezer met **echte tabs**, die opent op het tabblad dat iets
  heeft, met één zoekvak erboven; een uitdeler met zebra, een plakkende voet die
  in een zin zegt wat de knop gaat doen, en een FAB die wijkt; een hal die jou
  bovenaan zet met het woord *online* uit de roster die er al was; een
  spelerspagina met een nieuwe paneelvolgorde en een kamerpaneel over de volle
  breedte; een deur naar de kamer op het artikel van een gedragen onderzoeker;
  en elke deur met een **werkwoord** erop. Plus `docs/kamer-contract.md`, veertig
  genummerde regels over allebei de helften. Zeven fouten onderweg, zes gevonden
  door een screenshot of een meting — waaronder twee in de *tests* zelf, zie
  §85 hieronder.) Daarvoor **§84 / rule 84** (round 45: het geld
  spreekt. Een **beurs** in de hoek van elke pagina, één klik van je eigen kamer
  (de feature hing aan één menu-item en je kamer was drie klikken diep —
  *de pil is sinds §91 weg; de deur is Kamer in de zijbalk en de Jij-tab*); het
  saldo is een eigen vorm en niet langer dezelfde `.stamp` als een príjs; elke
  knop draagt zijn bedrag en elke uitgave krijgt een melding met een deur naar
  de tegel; "nog n nodig" is zichtbare tekst in plaats van drie letterlijke
  `title`s; de winkel is één lijst met een filter, wat **regel 82 omkeert** en
  §83's dubbele rij opruimt — de ontdubbeling zit in de pagina, `shopFor` bleef
  gelijk; één vorm per betekenis (`coin`, `shop`, `gift`, `shelf`, `desk`, plus
  een tabel in `plekWords.ts` die een test leest); één werkwoord (*Geven*, niet
  *Uitgeven*). Vier dingen die alleen een test of een hand vond: het donkere
  spelerspalet droeg de róde inkt van het lichte (2,4 op een tegel), een
  tegengehouden `btn-primary` is nu omlijnd in plaats van half doorzichtig, de
  FAB dekte de onderste 132 px van elke pagina af, en de deuren op `/you`
  haalden de 44 px niet). Daarvoor **§83 / rule 83** (round 44: het open
  grootboek, de uitdeling, en twee grenzen die te strak stonden. Het grootboek
  is van iedereen die de kamer mag zien — met een sluier over een regel die een
  artikel noemt dat je niet mag zien (§76) — en alleen het formulier eronder
  blijft van de Keeper; `/uitdelen` schrijft een handvol gewone grants in **één
  transactie**, alles of niets, aan **kamers** en niet aan spelers; hetzelfde
  stuk huisraad mag vaker in één kamer, en `one_of_a_kind` is wat er nog wél
  tegenhoudt; en het veld `plek` werd een meerkeuze (migratie `0029`, de
  velddefinitie **én** de waarden), met `plekKinds` als enige lezer en `landsIn`
  per soort plek. Drie fouten onderweg, alle drie §17's regel 4: de plek-kiezer
  vroeg het veld als enige in SQL en vond een lijst niet meer, `ledgerOf`
  sorteerde sinds §79 op een willekeurig `id` terwijl zijn eigen comment `rowid`
  zei, en de e2e helpers wezen naar een `#field-plek` dat niet meer bestaat).
  Daarvoor **§82 / rule 82** (round 43: de winkel —
  `/winkel` toont alles wat te koop is, ook wat je niet kunt betalen, want je
  kunt niet sparen voor wat je niet ziet; kopen gaat door `buyFurnishing` heen
  en is dus nooit een tweede weg. Daarbij twee reparaties die alleen een echte
  hand vond: een soort waarvan het id en de slug verschillen was niet op te
  slaan, en het omzetten van `one_of_a_kind` liet de bestaande `claim`s staan).
  Daarvoor **§81 / rule 81** (round 42: een Keeper tekent
  met zijn eigen accountnaam in plaats van met het woord "Keeper" — dit **keert
  regel 5 van §18 om** en het woord blijft alleen staan waar het een *rol*
  noemt; plus `/spelers`, de hal met alle spelerspaginas). Daarvoor: **§80**
  huisraad — een tweede soort naast Voorwerpen die alleen de Keeper maakt
  (`keeper_made` op een soort, niet §44's `keeper_only` op een artikel), met een
  prijs, een catalogus, effectregels die getoond en nooit opgeteld worden, plus
  `one_of_a_kind` / `room_slots.claim` en het sleutelvakje in de soorten-editor;
  **§79** de kamer — een raster van plekken per onderzoeker, een grootboek
  waarvan het saldo de som is, een voorwerp dat een *artikel* is; **§78** de
  gereserveerde kamer (opgegaan in §79); **§77** de spelerspagina, waar een
  paneel een samenvatting met een deur is; **§76** Aanwezig — het lijstje wordt
  per kijker gebouwd, met één vaste zin voor elke verborgen plek.

  *(Deze wegwijzer stond tot ronde 42 nog op §75, drie rondes lang: de
  bewerking ervan mislukte stil omdat een tekstvervanging die niets vindt ook
  niets zegt. Wie dit bestand programmatisch bijwerkt: controleer dát er iets
  veranderd is.)* Ter vergelijking, **§75 / rule 75** (round 38: een overzicht is
  een pagina van de wiki die óver de wiki gaat — `/wiki` is de voordeur,
  `/wiki/alles` de lijst, en een verwijzing vanaf een overzicht loopt één kant
  op, wat één regel in `recomputeOwnerMentions` is en verder volgt uit het feit
  dat een overzicht geen rij in `entries` is). Round 37 added three: §72 twee
  vingers zijn één knijp en een knijp springt nooit — `lib/canvas/pinch.ts` +
  `components/canvas/usePinch.ts`; §73 Lezen of Bewerken — een telefoon begint
  elk glas in Lezen, `useCanvasMode` + `CanvasModeToggle`; §74 wat een tik opent
  komt op een telefoon van onderen op en laat het glas staan — `CanvasPeek`.
  Round 36 added two: §70 een
  sectie hoort bij een ding — een sectie hangt aan een artikel *of* aan een
  dossier en wie het ding mag bewerken mag er een bij zetten, terwijl de
  geheimhouding van de Keeper blijft; §71 een speld heeft een laag — één getal
  per speld dat de tekenvolgorde bepaalt én wie een kluitje vertegenwoordigt met
  een `+n`. Round 35: §69 één hand op
  elk canvas — de camera, het lege papier, het weghalen en de ongedaan-knop
  zijn op alle vier de tekenvlakken hetzelfde, en elk verschil dat blijft staat
  met een reden in `docs/canvas-contract.md`; round 34: §68 een verwijzing
  is een link — elke muisknop behalve de linker is van de browser, wat je leest
  draagt geen kadertje, de geschiedenis klapt uit tot de zinnen zelf, en het
  wiel op een tijdlijn sleept het papier de kant van de hand op; round 33: §67
  de stamboom, tweede pas — één potlood, één manier van kiezen, en broers en
  zussen die afgeleid worden). **Round 32 added no number**:
  it is a follow-up that extends §66 (a Familie points at its stamboom) and §45
  (five colours, so a kaartje is readable in every scheme), and its code markers
  say `§66` and `§45/§66` for that reason. (Round 31: §66 de stamboom —
  een venster op de verwantschap die op de artikelen staat; round 30: §63 de voordeur die
  niet weggooit wat je typte en een tweede deur die je kunt zien, §64 een punaise
  aan een draad die vasthoudt tot er iets op komt, §65 een geschiedenis die zegt
  wát er veranderd is; round 29: §59 de refresh-hold
  — niets landt terwijl er een hand op de pagina ligt, §60 één lijn per tab en
  een lijn die nooit opgeeft, §61 een muur die nooit opgeeft, §62 een tijdlijn
  met z'n tweeën; round 28: §56 een chipje
  *in* het vak, §57 één weg waarlangs het archief omslaat, §58 het pantheon en
  Geschriften & Kunstwerken; round 27: §52 het prikbord,
  §53 een tweeling linken, §54 een chipje onder het vak, §55 Talen; round 26:
  §49 the dossier in front of the name, §50 the two sides apart, §51 a
  koppelingsveld aimed at several soorten; §48 is round 25's born-on-a-side,
  §47 round 24's four small repairs, §46 de spiegel round 23, §44 de Keeperkant
  and §45 de vier kleurschema's round 22).
- **`DECISIONS.md` records why, per round.** If you reverse an entry there, say
  so explicitly in the new entry rather than quietly contradicting it.
- **All user-facing copy is Dutch** and comes from `GLOSSARY-NL.md`. Words the
  Keeper can rename (`karakter`, `Keeper`, `artikel`, …) live in `lib/words.ts`
  and must never be hardcoded in a component.
- **Migrations are appended and guarded**, numbered `NNNN_name` — latest is
  **`0037_prikbord_beschrijving`**, so **the next is `0038_`**. Golf 3 added
  three. `0035_de_lopende_tekst` (§97) is `SELECT 1` plus a `run` step,
  `upgradeDocs` in `lib/entries/docUpgrade.mjs`: every legacy `entryLink`
  (`{ id, label, … }`) in `entries.body`, `sections.body`, `cases.notes` and
  the copies in `entry_revisions`, `pending_edits` and `case_revisions`
  becomes `{ handle }`, a link to a destroyed artikel goes, the rooms of the
  texts it touched are wiped and the FTS is rewritten. Idempotent;
  `scripts/restore.mjs`, `seed-demo` and `seed-wereld` run it too, and restore
  no longer restores `live_docs` at all (the BLOB was written as
  `{ type: 'Buffer' }` JSON and could not be bound). `0036_elk_kort_vak`
  (§98) is the same shape with `upgradeCanvasTexts` in
  `lib/entries/shortUpgrade.mjs`: speld, gebeurtenis, the omschrijvingen,
  `overzichten.lead`, the loose cards in `family_trees.state` and the cards in
  `boards.state` and `board_revisions`, by 0034's algorithm (the oldest of
  two equal names); it wipes the `map:%:fields`, `pin:%:fields` and
  `event:%:fields` rooms and **empties `entry_mentions`**, which start-up
  rebuilds. `0037_prikbord_beschrijving` (§99) is one
  `ALTER TABLE boards ADD COLUMN description TEXT NOT NULL DEFAULT ''`; an
  older backup gets the default. Before those, `0033_de_lade` (§93: de tabel `room_drawer (id, room_id, entry_id,
  created_at)`, één rij per exemplaar huisraad dat een kamer bezit en op geen
  plek heeft liggen. Hij vult niets in: een migratie die eigendom verzint,
  geeft iemand iets waar hij nooit voor betaalde. `scripts/restore.mjs` leegt
  `room_drawer` als een backup hem niet heeft, dus een backup van vóór 0033
  opent met lege laden). Then **`0034_een_id`** (§95: de tabel
  `mention_handles (handle, entry_id, created_by, created_at)`, plus een
  **JavaScript-stap**: a migration may carry `run: (sqlite) => …` beside its
  `sql`, and `lib/db/open.mjs` runs it in the same transaction. 0034's step is
  `upgradeArchive` in `lib/entries/shortUpgrade.mjs`, which converts every
  `[[Naam]]`/`@Naam` in the short texts, their revisions and voorstellen with
  the reader's own old algorithm, wipes the stored room state of the
  `entry:*:fields`/`case:*:fields` rooms and rewrites the FTS rows it touched.
  `scripts/restore.mjs` runs the same conversion on a backup that does not
  know 0034). Put a `run` step's logic in a
  `.mjs` beside the code that reads the result, never inline in
  `migrations.mjs` — restore needs it too. Before `0033`: `0032_sloten` (§89: `users.password_enc`
  leeggemaakt en gedropt, en alle
  sessies weg omdat ze voortaan met een HMAC worden opgeslagen — iedereen logt
  één keer opnieuw in; `scripts/restore.mjs` slaat kolommen over die niet meer
  bestaan, zodat een oude backup blijft openen). Before it: `0031_eigen_naam_en_icoon` (§88: `site_settings.favicon_asset_id` erbij, plus
  een `UPDATE` die het archief hernoemt **alleen waar het nog 'Zeeland Case
  Files' heet** — een migratie die een naam overschrijft die iemand zelf koos,
  gooit data weg). Before it:
  `0030_voorpagina_per_kant` (§87: de wiki krijgt een tweede thuispagina, voor
  de Keeperkant, leeg en met een vaste id — `is_home` mag vanaf nu twee keer
  voorkomen, één keer per kant). Before that:
  `0029_meerdere_plekken` (§83: the field `plek` becomes a `multiselect`, and
  **the field definition and every stored value change in the same migration**
  — a `multiselect` refuses a bare string on save, so shipping half of it would
  be a silent data loss), and before that `0028_huisraad`
  (§80: `entry_types.keeper_made` / `one_of_a_kind`, `room_slots.claim` and the
  soort *Huisraad*) and `0027_kamers` (§79: `rooms`, `room_slots`, `room_ledger`,
  and the field `plek` on the soort that already existed), then
  `0026_overzichten` (§75: the `overzichten` table and the home row the wiki's
  front door resolves to — one then, one per side since `0030`). Before those: round
  36's `0025_sections_and_pin_layer` and §69's `0024_soft_delete_pins_events`
  (a `deleted_at` on `map_pins` and `timeline_events`, so the *Ongedaan maken*
  in a toast gives back the same row)
  (rounds 27 and 28 added none: a
  new soort, a reverse veld and even a **slug rename** arrive through the
  seed's `INSERT OR IGNORE` and a marker — §55, §58; round 31 added a *table*
  but not a column, because its seven new **fields** came through the same
  marker road, `seed:round-31-stamboom`). Never edit an existing
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
  on a **prikbord** (board units), on a **stamboom** (world units, §66 — the
  same `screenWidth / zoom` the wall uses, so the two need no second reading)
  and on a **landkaart** (picture pixels):
  `useInk` stores `screenWidth / widthScale`, so a brush is as thick as it
  looked at the zoom you drew it and thicker or thinner at any other. On a
  **tijdlijn** ink is measured in *seconds* since round 12 — x an absolute
  moment, y seconds from the axis, width in seconds, all three × `pxPerSecond`
  (`lib/timelines/inkSpace.ts`, format `v: 1`) — so a drawing grows with the
  axis. A tijdlijn stroke with no `v` is v0: x in seconds, y a fraction of the
  stage's height, width in screen pixels, drawn by the old formula for ever.
  Do not "fix" any of the four, and do not migrate a v0 stroke — the `stageH`
  it was drawn at was never recorded. **What is *not* different per place is the
  wiring** (§67): `components/ink/useCanvasInk.tsx` is the whole of it, and
  `InkShell` renders the two pieces in the one order that works — the capture
  sheet first, the toolbar after it, or the bar is visible and unpressable —
  with the corner passed as a word (`bottom-right` on a prikbord and a stamboom,
  `bottom-left` on a landkaart, the base rule's `top-left` on a tijdlijn).
  **A canvas never positions `.ink-toolbar` in its own stylesheet.** The three
  pan-and-zoom canvases share `components/ink/panZoom.ts` as well, and its
  border term is the part that was wrong in all three copies: a stage is
  `position: relative` with a **1 px border**, an absolutely placed child is laid
  out against the *padding* box while `getBoundingClientRect()` gives the
  *border* box, so `clientLeft`/`clientTop` come off too or every stroke lands a
  pixel up and to the left of the hand that drew it.
- **Kiezen is one gesture and it lives in two files** (§67) — and since §69, on
  all four canvases rather than two. Shift-click
  toggles, shift-drag on bare paper sweeps a box that selects everything it
  *touches* and replaces what was chosen, a plain drag pans, Escape clears —
  and a plain press on something already chosen leaves the whole group standing,
  because you are about to drag it (that was the prikbord's wart:
  `pressSelection` is the fix and the reason the function exists). The
  arithmetic is `lib/canvas/select.ts`, the React is
  `components/canvas/useMarqueeSelect.ts`, the view maths is `lib/canvas/view.ts`
  (`clampZoom`, `zoomAbout`, `toWorld`, `fitViewport`; `lib/families/layout.ts`
  re-exports them under their old names) and the undo ring is
  `components/canvas/undoStack.ts`. Each surface keeps undo, dirty ids,
  presence, the inspector and what else a press means. One dial is a surface's
  own: the wall's "alles in beeld" stops at **1.2**, not `MAX_ZOOM`. The web is
  deliberately not on this — it is one `<canvas>` and a bag of mutable state,
  and its box lives in screen space.
- **A breakpoint that lives in two files must be the same number in both.**
  `WIDE` in `components/useIsPhone.ts` decides whether the artikel page's rail
  and sidebar are *rendered*; the `@media` block round `.entry-layout-wide` in
  `app/globals.css` decides where the grid *puts* them. They are 1280 px (§25)
  and disagreeing once gave the page two different wide layouts, which read as
  a regression. Both files say so in a comment; move neither alone. **Since
  golf H there is a second pair:** `RAIL` (`useHasRail`, 1500 px) in the same
  file decides whether the outline is rendered as a *column*, and the
  `@media (min-width: 1500px)` block round `.entry-layout-rail` in
  `app/leeskamer.css` places it (§104, D1). From 1280 to 1499 px the page is
  text and facts, with the outline as a row of chips above the text.
  **Since golf J the stylesheet does the choosing and the hooks only tidy
  up** (§104, j4). `useIsWide`, `useHasRail` and `usePhoneKnown` return
  `null` on the server and during hydration; a page that changes *shape* with
  the width draws one DOM that the `@media` blocks lay out right at every
  width, and prunes after hydration only what CSS was already hiding. **Never
  give a layout hook a guess as its server snapshot** (`() => true`): that is
  the phone that jumps (CLS 0,85 on a Pixel 5 before golf J). `WIDE_MEDIA`/
  `NARROW_MEDIA` in the same file are the numbers for a `<source media>`.
- **Text that only a browser editor can draw is drawn once more on the
  server** (golf J, §104, `VoorafTekst` in `components/editor/VoorafTekst.tsx`):
  in Lezen, `RichEditor` and `LiveBody` take a `vooraf` (or the `Vooraf`
  context under `next/dynamic`) and show it until the editor exists. It
  mirrors what ProseMirror and Tiptap draw, including Tiptap's own CSS
  (`.vooraf-tekst` in `app/leeskamer.css`: no ligatures, `break-spaces`, a
  chip breaks). A new node type in `documentExtensions` gets a case in
  `VoorafTekst` too, or its height is wrong until the editor arrives.
- **A page stands in the middle of the column** (golf K, reversing golf H's
  D5). `.page` (900 px; **1440 px since golf N**, `app/ruimte.css`) and
  `.page-wide` (1440 px, was 1200) are `margin: 0 auto`. The lists behind the archive's tabs (prikborden,
  tijdlijnen, stambomen, like landkaarten and dossiers) are `.page-wide`, so
  everything under *Het archief* keeps one left edge. A new list page of the
  archive is `.page-wide`; a form or a personal page is `.page`. From 1880 px
  the live strip hangs in the column's corner instead of floating, because a
  float pushes a page that is its own formatting context (a grid, like Start)
  out of the middle. **Since golf M the strip's place is one block in
  `app/navigatie.css`**, one rule per width (a float from 768 to 1879 px on
  an ordinary page; absolute in the band above the page on a canvas and
  from 1880 px), on every page including the prikbord. Move it there and
  nowhere else. In the corner it stands `--strip-inset` (0.75 rem) from the
  top (golf N; it was 0.1 rem and touched the edge).
- **An artikel's omslag is whole on every width** (golf K, reversing §104
  L5): `CoverEditor` has no `landscape` any more, and under 1280 px the
  figure is a card (`.entry-aside-box-stacked > .entry-figure`, the golf k
  block in `app/leeskamer.css`), at most half the screen high. The `<img>`
  carries `width`/`height` from `assetSize()` (`lib/assets.ts`), handed down
  as `coverSize`; a new place that draws a whole picture of unknown shape
  does the same, or the page jumps when it arrives.
- **Search orders by the best name** (golf J, §100): `nameScore`,
  `orderSections` and `palettePlan` in `lib/search/rang.ts` (pure). A new
  section on `/search` or in the palette gets a `best` from `nameScore`, not a
  fixed place.
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
  it). **§69 closed the last third**: a pin **move** refreshes too, so the whole
  file is now consistent and this is no longer a gap.
- **`lib/assets.ts` loads sharp and the database**, so nothing client-side may
  import it. Pure, client-safe helpers belong in `lib/upload.ts`. Same shape and
  same reason at the front door: `lib/auth/password.mjs` loads `@node-rs/argon2`
  and `node:crypto`, so the *rules* a browser needs to ask (§63) live in
  `lib/auth/rules.mjs`, which imports nothing at all, and are re-exported from
  `password.mjs` so no caller had to move. There is one definition of "long
  enough" and the signup form and the server action read that one.
- **A React form action resets the form, and that is not a thing to discover
  twice.** `useActionState` calls `requestFormReset()` once the action settles, so
  a form that comes back with an error comes back *empty* unless it says
  otherwise — which is the bug Nick reported about signup in round 30.
  `app/(auth)/AuthForm.tsx` is the worked example (§63): validate in the browser
  where the rule is pure, echo the typed values into state from the `FormData`
  the client function still holds (never from the server's reply — a password has
  no business travelling back down), read them through `defaultValue`, *and*
  write them back in a `useEffect`, because the declarative half depends on React
  resetting inside the same commit as the state update. Two more, both found by
  review rather than by use: never hand the server action `prev` (a server
  action's arguments are serialised into the request, so `serverAction(prev,
  formData)` posts the whole echo back up), and hold the boxes `readOnly` while
  the action is pending, or a letter typed during the round trip is silently
  thrown away by the restore.
- **Nothing in `.board-tools` that can turn on and off may take up room** (§64).
  The toolbar is laid out *above* `.board-viewport`, so a line that appears when
  something is true grows the bar and pushes the whole wall down — and a spec
  that measured a speld once before the first drag then clicks twenty pixels
  above it, failing with "element(s) not found" pointing at the picker rather
  than at the layout. Put such a notice in a `placeholder`, or in a
  `.visually-hidden` paragraph wired through `aria-describedby`. And never change
  a control's accessible *label* on a condition: four specs find the board's
  search box by its name.
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
  canvas disagree about its colour. A new kind of **knot** is five: the
  `WebNodeKind` union and `parseWebNodeId`'s allow-list in `types.ts` (both, and
  the string may not contain a `:` — `family_tree` was the first with an
  underscore), `NODE_KINDS` in `kinds.ts`, `THING_KINDS` in `WebView.tsx` so the
  legend's *Wat* can switch it off, and `knotPath` in `WebCanvas.tsx` so it has
  a shape. And a line may **yield to another at build time**: `collapseMentions`
  drops a text line where a stronger one runs, and since §66 `yieldToLineage`
  drops a `field` line where a `lineage` line joins the same pair with the same
  word — both in `slice.ts`, both called once in `buildWebGraph`, because the
  count, the panel and the drawing must look at the same set.
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
- **The web's layer has a bleed while the camera moves** (§47, round 24).
  The lower canvas is drawn with a margin of lines round the glass whenever
  the *camera* is the thing moving (`LAYER_BLEED` 0.35 of the longer side,
  capped 420 px) and the element is hung that far outside it — without it a
  pan uncovered bare paper on the trailing side, because a canvas the size of
  the glass has nothing outside the glass to slide in. `placeLayer()` returns
  the transform **and** whether the layer still covers the glass, and a reuse
  is refused the moment it does not: never compute that transform anywhere
  else, or the test and the placing will drift apart. No bleed at rest (that
  layer is the expensive one) and none while the simulation stirs (it is
  restroked every frame anyway), and the cull margin carries `+ bleed` or the
  lines the bleed reaches for are culled before they are drawn.
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
  `tests/unit/web-layout.test.ts`; round 27 added `coverSourceRect` beside them
  (`tests/unit/web-cover-crop.test.ts`), because a crop is an
  `object-position` fraction and the canvas used to read it as a focal point
  (rule 5).
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
- **A punaise is a knot on the web, like a notitie** (§47, round 24).
  `isLooseCard()` in `lib/web/service.ts` is what `cardNode` asks, and it
  covers `note`, `photo` and `pin`; `looseName()` names a bare punaise after
  the archive's word for one. Before this a draad with a punaise on either end
  was dropped entirely — not drawn faint, *absent*. A punaise rides the same
  `notes` switch as a notitie; it is not a node kind of its own.
- **A prikbord's dossier is `setBoardCase()` and nothing else** (§47, round
  24). Two rights: the hand may edit the wall, **and** may see the dossier
  (§17 puts a filed wall behind the dossier's view dial too). That second one
  is a lookup by id — `loadAccessRow` + `canSeeCase`, no side condition (§46).
  `PATCH /api/boards/[id]` with `caseId: null` takes it out again. **A
  stamboom has the same road since §66** (`setFamilyTreeCase`, the same two
  rights, `PATCH /api/family-trees/[id]`), so round 24's "only prikborden" is
  now "prikborden and stambomen" — the gap is one kind smaller and still open
  for **tijdlijnen and landkaarten**; see DECISIONS rounds 24 and 31.
- **A text line yields, at build time.** `collapseMentions` runs in
  `buildWebGraph`, not in the browser: the count, the panel and the drawing
  must agree. Adding a kind that should also yield means adding it to
  `TEXT_KINDS` in `slice.ts` and nothing else.
- **The Keeper's web reads containers as a player** (`containerViewer` in
  `lib/web/service.ts`) unless `othersPrivate` is set — **or the Keeper is on
  their own side** (§46, round 23). That exception exists because `keeper_only`
  lives *inside* those dials since §44, so a player's eyes would leave the
  Keeper's web without a single dossier, prikbord, landkaart or tijdlijn; the
  side filter then narrows it to keeper-only records, which are the Keeper's by
  definition. Keep artikelen and sections on the real viewer. `boards.in_web`
  is checked in exactly two places — `buildWebGraph` and `listMentions` — and
  must stay checked in both.
- **`MentionPopover` never owns the textarea.** It attaches through a ref or
  an element-as-state (`LiveField mentions` uses state, because the room swaps
  the element under a `next/dynamic` boundary) and writes with the native
  value setter + an `input` event. If you find yourself calling a component's
  `onChange` from it, stop: that breaks the Yjs-bound path. *(Since §98 no box
  passes `mentions` to `LiveField` any more, so `MentionPopover`,
  `MentionOverlay`, `MentionPreview` and `useBoxFocus` have no users. They were
  kept on purpose, not deleted; `MentionText` in the same file is very much in
  use. Do not wire a new box to them: a box with names is a `ShortField`.)*
- **"The Keeper's own" is spelled two ways, and `isKeeperSide()` owns the
  difference** (§44, round 22). An **artikel** says it with §9's
  `visibility = 'keeper'`; a **dossier, prikbord, landkaart or tijdlijn** says
  it with the `keeper_only` column from `0021_keeper_side`, AND-ed in front of
  the owner's dials inside `viewableCondition()` and `canView()` in
  `lib/access.ts`. `lib/keeper/side.ts` is the only file allowed to know that,
  and `keeperRef()` is the only way anything in the Keeperkant learns a record
  exists — it returns null for "gone, or not for you", and a caller may not
  tell those apart. Do not add a `keeper_only` to `entries`, do not read either
  flag directly in a page, and remember that `loadAccessRow` has to *select*
  `keeper_only` or the predicates beside the SQL read `undefined` and wave a
  Keeper-only record past on its owner's dial (that was one of round 22's four
  leaks). The audit rule from the same round, worth repeating anywhere a check
  asks about ownership: **"is this yours?" must ask "may you see it?" first.**
  A twin's notes live on the *pair's* Keeper side, so a page resolves
  `notesTarget()` before asking for the `keeper:{kind}:{id}:notes` room —
  asking with its own id when the notes live next door gets null admission, on
  purpose.
- **A new thing is born on the side it was made on** (§48, round 25).
  `keeper_only` defaults to 0 and `entries.visibility` to `'all'`, so until this
  round *every* maker put its record on the players' side whatever face the
  archive was wearing. `bornSide()` / `keeperOnlyForNew()` / `placeNewOnSide()`
  in `lib/keeper/side.ts` are the only place that decides it, and the five POST
  routes (`/api/entries`, `/api/cases`, `/api/boards`, `/api/maps`,
  `/api/timelines`) are the only callers. Two facts, and the **hiding** one
  always wins: the container (anything inside a Keeper-only dossier is the
  Keeper's — a wall carries `caseName` into every list) and otherwise
  `viewer.side`. A Keeper may overrule the second with the sheet's `keeperOnly`;
  nobody may overrule the first, and nobody who is not a Keeper is heard at all.
  **Hiding travels inwards, revealing never does**: `setBoardCase` into a
  Keeper-only dossier takes the wall along, `setKeeperSide('case', …, true)`
  takes its prikborden and tijdlijnen along, and neither has a mirror image. If
  a sixth kind of thing gets a maker, it gets these three lines on the day it is
  built — this is §40's rule about dials, one layer up.
- **A description is text, so it has an `@` and it has chips** (§48, round 25).
  `MentionPopover` handles an `<input>` as well as a `<textarea>` (the one-line
  boxes are inputs) and carries its own "'Jan' aanmaken" row. `LiveField` takes
  `mentions` on both shapes now. Reading, a description prints `MentionText` —
  and **`flat` inside anything that is already a link** (a card, a feed row, a
  search hit), because an `<a>` in an `<a>` is invalid HTML and
  `no-console-warnings.spec.ts` fails on it. A new plain box gets `mentions` on
  the way in, `MentionText` on the way out, **a `MentionOverlay` over it and a
  `MentionRow` under it while it is typed** (§54 round 27, §56 round 28) — or
  the same text will be chips on one screen and brackets on the next. Both live
  in `MentionPopover.tsx` and render nothing when no name resolves.
  *(§92 removed `MentionRow`; §95 took the korte beschrijving, the
  samenvatting, Tekst and Lange tekst off this road entirely — they are
  `ShortField`s and store handles, see the §95 bullets below. ~~What follows
  still holds for the boxes that write `[[Naam]]`: a kaartje, a speld, a
  gebeurtenis, the maakbladen of a landkaart, a tijdlijn and a stamboom, and an
  overzicht's lead.~~ **§98 moved every one of those over too**: no box writes
  `[[Naam]]` any more, and what follows about the overlay and the row is
  history. `MentionText` still reads both forms, and a new box with names is
  a `ShortField`.)*
  `MentionOverlay` mirrors the box's *computed* typography (`MIRROR_PROPS`), and
  **its chip is the whole `[[Naam]]` run, brackets included** — drop the
  brackets and every glyph after a mention shifts out from under the caret.
  `MentionRow` belongs at the call site: the speld and gebeurtenis sheets draw
  their own, and an automatic one in `LiveField` would print two.
- **`useIAmTheCase` is "this screen is a dossier", and only the dossier says it**
  (§48, round 25). It lives in `UiProvider` because the `+`, the FAB and the `n`
  key are in the *shell*, above the page, where a context set by the page cannot
  reach; the dossier registers on mount and clears on unmount. It is not
  `PreferredCases` — that is a ranking over every dossier an artikel is in — and
  nothing but `CaseDossier` may set it, or the `+` will file things into a
  dossier nobody is looking at. What hangs off it: the sheet is opened *in* the
  dossier, so what it makes is filed there (§49 — every soort, no exception,
  and §24's gate is gone), and every name that lands
  in the dossier's own writing is offered a place on its shelves
  (`useMentionFiling` → `offerToFileEntry`, `reason: 'text'`). That offer is
  silent three ways — already filed, may not file (§17), or the sheet filed it —
  and asks once per artikel per visit.
- **"Made in a dossier" and "filed in that dossier" are one fact** (§48, and
  since §49 without an exception). `originCaseId` follows `case_entries`, and
  something made in a dossier is filed there — no tickbox turns that off. What
  a dossier's name in front of an artikel depends on is `entries.case_prefix`,
  the artikel's own, decided in `nameTheirCases` and nowhere else (§49, rule
  49); `entry_types.case_only` is no longer a gate and no longer read except by
  a migration trigger and the order of a dossier's tabs.
- **A list filters by side; a lookup never does** (§46, round 23). The archive
  is read from one side at a time: `sideCondition(kind, viewer)` in
  `lib/keeper/side.ts` is AND-ed **after** the visibility rule — never instead
  of it — in the eleven list functions (`browseEntries`, `listTagsWithCounts`,
  `countEntriesPerType`, `recentActivity`, `listCases`, `countEntriesPerCase`,
  `listBoards`, `listMaps`, `listTimelines`, `searchEntries`, and
  `buildWebGraph` for the whole web). Nothing that finds **one** record asks it
  — `getEntryBySlug`, `getCaseBySlug`, `getBoard`, `getMapBySlug`,
  `getTimelineBySlug`, `keeperRef`, `tiesFor`, the live rooms' gates, every API
  that patches one thing — because a Keeper walks across a touwtje from either
  side and the page has to be there. `{ bothSides: true }` is the opt-out, for
  pickers, autocomplete (`suggestEntries`; Zoeken passes `sided` and the
  suggestions do not), a record page's own sub-lists, and a **focus** web
  (`bothSides: Boolean(focus)`); every call site carries a `§46` comment saying
  which it is. Two traps: `listX(viewer, { where: id })` is a lookup in a
  list's clothes (`listTimelinesForCase` is the worked example, opted out), and
  `containerViewer` in the web strips `isKeeper`, which makes `sideCondition`
  answer `1 = 1` — read the side off the *real* viewer. The palette follows the
  **page**, not the browser: `lib/theme/schemes.ts` emits
  `:has([data-side='keeper']):not(:has([data-side='player']))`, the layout
  writes the browser's side and a record page writes its own, and the page
  wins. That one selector is the whole of "the site turns over with you".
  **§50 (round 26) changed the second half of this**: the opt-out is gone
  everywhere but `/api/keeper/search`, and the cookie is now corrected by a
  redirect through `/api/keeper/flip` *before* the page renders (`sideDetour`,
  `queryTail`) instead of afterwards by `SideSync`, which no longer exists.
  **§57 (round 28) finished it**: the toggle no longer POSTs-and-pushes either.
  Every crossing there is — `sideDetour`, `/keeper`, and the button — goes
  through `GET /api/keeper/flip`, because a client-side `push` reuses the
  shared layout's RSC output and the layout is the one thing that knows which
  side the browser stands on. A stale shell is not cosmetic: `UiProvider`'s
  `side` is §48's born-on-a-side, so it made things keeper-only while the
  cookie said player. Do not reintroduce a client-side navigation here.
- **The four palettes in `app/globals.css` are generated — never hand-edit
  them** (§45, round 22). Everything between `/* §45 SCHEMES START */` and
  `/* §45 SCHEMES END */` is character for character what
  `schemeCss(DEFAULT_SCHEMES)` returns from `lib/theme/schemes.ts`, and
  `tests/unit/schemes.test.ts` reads the stylesheet and fails if the two drift.
  Change a colour or add a token in the module and paste its output back. Ten
  seconds of care, because the failure mode is silent: a token added to the
  module and forgotten in the stylesheet leaves every archive whose Keeper
  never opened Beheer → Kleuren one round behind in exactly one colour, with
  nothing broken. `lib/theme/schemes.ts` stays **pure** (client components
  import it); `lib/admin/schemes.ts` is the half that touches the database, the
  same split `lib/words.ts` and `lib/admin/words.ts` have. And the twenty-four
  tokens are the whole vocabulary: every other colour is a `var()` alias onto
  one of them — the web's eighteen `--web-<kind>` properties now alias its six
  `--web-line-*`, so a new `WebEdgeKind` picks one of the six rather than
  bringing a colour.
- **A kaart is a surface of its own and never reads the page's inkt** (§45/§66,
  round 32 — the five tokens that took nineteen to twenty-four). A card is
  paper lying *on* the page, not a hole in it, so nothing drawn on one may
  reach for `--ink` or `--paper*`. The bug that named the rule: a stamboom
  kaartje was painted `--card-face` (light in every scheme, dark ones included)
  and its name written in `--ink`, which in a dark palette is nearly white —
  white on beige. The tokens are `--tree-face`, `--tree-ink`, `--tree-line` and
  `--tree-accent` (group **De stamboom** in `lib/theme/schemes.ts`) plus
  `--card-ink` in the prikbord's group, which replaced a hard-coded `#1f1b16`
  on `.board-card` / `.board-tray-card`. In a dark palette the card goes dark
  and the ink on it goes light, and the card stays *lighter* than the stage —
  darker than the stage reads as a hole. `app/stambomen.css` derives
  `--tree-rule` and `--tree-ink-soft` from the two card tokens with
  `color-mix`; those are locals, not tokens, and must not be added to Kleuren.
  `tests/unit/tree-contrast.test.ts` holds the floors in all four palettes
  (ink/face ≥ 7, line/`--paper-dark` ≥ 3, cardInk/cardFace ≥ 4.5, accent ≥ 2
  against both, and "the card turns over with the light"), so a round that
  darkens one of a pair and forgets the other fails there and not at night.
- **A new `FieldKind` is nine places** (§66, round 32 added
  `family_tree_link`). The `FieldKind` union in `lib/db/schema.ts`;
  `FIELD_KINDS` in `lib/fieldKinds.ts` — plus `cleanFields` in the same file
  **only if it carries config** (`options`, `ofType`, `role`; a
  `family_tree_link` carries none, so it does not appear there);
  `lib/entries/fieldValues.ts` twice, a coercer and a reader, and that pair is
  the gate — a kind nothing coerces stores nothing; `components/entry/
  FieldsEditor.tsx` twice as well, the reading face (`fieldValue`) and the
  writing face; a **picker component** when it names a record
  (`FamilyTreePicker`, beside `CasePicker` and `EntryPicker`);
  `LINK_KINDS` in `lib/entries/revisionDiff.ts` when it is a reference, so §65
  counts it and never names it (rule 7); `lib/entries/mentions.ts` **only if it
  points at an artikel** — a dossier, a speler and a stamboom write no
  `entry_mentions` row; `lib/web/service.ts` an edge pass plus a
  `*LinksInFields` helper when the web draws the target
  (`treeLinksInFields`, the sibling of `caseLinksInFields`); and
  `lib/db/seed.mjs` in **both** halves — the field in `ENTRY_TYPES` for a new
  archive **and** a marker block (`seed:round-32-stamboom-link`) for one that
  already exists. Miss the marker and only new archives ever see the field.
  **A tenth, since §95, for a kind that holds text:** decide whether it is a
  short box with chips (`ShortField` in `FieldsEditor`, `isShortFieldKind` in
  `lib/entries/shortRefs.ts`, so `cleanShort` runs on it in `createEntry` and
  `updateEntry`, and `MentionText tokens` on the reading face) or plain text
  (`LiveField`). Only `text` and `longtext` are short boxes today; a kind that
  is one on its writing face and not in `isShortFieldKind` stores handles that
  nobody cleans.
- **Nothing lands while a hand is on the page** (§59, round 29). Anything
  mid-gesture — a drag, an open sheet with half-typed fields, an ink stroke, an
  upload — calls `useHoldRefresh(busy)` from `components/live/refreshHold.ts`,
  and while any hold is taken `LivePage` remembers that a watched key moved and
  does not `router.refresh()`. One refresh fires when the last hold is
  released: a hold delays a signal, it never drops one. The registry is
  **module-level on purpose** — the holder is a child of the page and
  `LivePage` is its sibling, so a context cannot reach. The tijdlijn is its one
  taker today and the prikbord still has round 8's own version inside
  `useBoardLive`; a new canvas takes a hold rather than inventing a third way
  to wait. And in `LivePage`
  itself: a remote change inside `OWN_WRITE_MUTE_MS` of one's own write is
  *deferred past the window*, never dropped, and a `reason: 'resync'` replay is
  never muted at all.
- **One line per tab, and only `LiveProvider` opens it** (§60, round 29).
  Nothing anywhere else in the app may construct an `EventSource`. A browser
  allows about six connections per origin and a stream holds one for ever, so a
  second line per feature is a tab that cannot navigate — which is exactly what
  the prikbord's own line cost, and why `/api/boards/[id]/live` is gone.
  Anything that needs to hear about a change watches a key (`useLiveChanges` /
  `LivePage watch`); anything that needs to be *seen* stands at a place
  (`LivePage place`) and gets the roster and the hands for free. And there is
  now less than one line per tab: the tabs of a browser elect a leader and the
  rest ride its socket, so a follower's `EventSource` would not merely be
  wasteful, it would be a second person on the strip. Two hooks, not one:
  `useLive()` re-renders on every pointer frame and is for things that draw
  hands; `useLiveBase()` is for everything else and holds its identity still
  while a hand moves. **And never hang an effect cleanup that reports "my hand
  left" on `useLive()`'s value** — it is a new object per frame, so the cleanup
  ran per frame and wiped every outgoing frame (the timeline's carried tag
  never travelled); depend on `live.reportPointer`, the stable function.
- **A key moves only if the SQL names it** (§21, §90). `TABLES` in
  `lib/live/changes.ts` maps a table to the live keys a write to it moves, and
  it reads those keys out of the *statement*: `row` takes the row's own id,
  `refs` takes the value bound to a named column. So a `refs` mapping works only
  if the writer's SQL binds that column. An `UPDATE … WHERE id = ?` does not
  name the parent, and the key never moves. `room:{id}` was dead from §78 to
  §90 for two reasons. First, `rooms`, `room_slots` and `room_ledger` were not
  in `TABLES` at all. Second, once they were, `placeItem`/`clearSlot` updated
  a plek by its `id` alone. The fix is on the writer's side:
  `and(eq(roomSlots.id, slotId), eq(roomSlots.roomId, slot.roomId))`, which
  filters nothing and lets the logger see the kamer. Test such a writer
  **through the ORM logger** (`setChangeDelivery` + `flushChanges`, as in
  `tests/unit/ronde-51-economie.test.ts`), not only with `keysOfStatement` on
  a hand-written string. A string test proves the mapping. It does not prove
  that the writer produces a statement the mapping can read. ~~One writer is
  still blind: the claim reset in `lib/admin/types.ts` (see §8, round 51).~~
  **Closed in round 54 (§93)**: the claim reset names `room_id` now. And
  `room_drawer` is in `TABLES` too: an `INSERT` carries `room_id` by itself,
  and the `DELETE` of one drawer row (`takeFromDrawer`) names the kamer in its
  `WHERE` for the same reason `placeItem` does.
- **`commit` takes an updater; never build the next board document from
  `cards` captured at render** (§61, round 29).
  `components/boards/BoardCanvas.tsx` keeps `cardsRef`/`stringsRef` beside its
  state and writes both through `putBoard`, because half the work on that wall
  crosses an `await` or a sheet before it writes — an upload, "'X' aanmaken", a
  pull that landed while the file dialog was open. `commit((prev) => …)` reads
  the refs, derives which ids changed, and hands them to the save, which sends
  only those (`lib/boards/dirty.ts`) — absence is never a deletion, a tombstone
  is. A merge coming back is likewise applied *around* whatever is still
  unsaved (`sync.pending()`), so the archive's copy never silently undoes a
  change it has not confirmed.
- **A tag's side on a tijdlijn is a hash of its id, never its index** (§62,
  round 29). `sideOfId` in `lib/timelines/time.ts` decides it and `placeTags`
  asks; `index % 2` was pretty and unshareable — one gebeurtenis set in the
  middle flipped every later tag on everybody else's screen while they were
  reading it. The same file owns the lanes for the tags *and* for the
  folded-out windows (`placeWindows`), both pure and both in
  `tests/unit/timeline-time.test.ts`; put geometry there, not in the component.
  And a `live` write of a gebeurtenis's words (the field room's 1.5 s save)
  must never touch `timelines.updatedAt` — that column is what every other
  screen watches through `timeline:{id}`.
- **A new kind of container is about twenty places, and they are enumerated in
  a test** (§66, round 31). A stamboom is the sixth kind, and the round's first
  wave was nothing but the *spine*: the migration, `lib/db/schema.ts`,
  `KEEPER_KINDS`/`KIND_WORD`/`KIND_ICON`/`kindHref`, `sideCondition` +
  `keeperRef` + `setKeeperSide` + `hideWhatHangsIn`, `viewableCondition` and
  `canManageAccess`, `lib/live/keys.ts` (record key, collection key, page
  place) and `canWatch`, `lib/ink/types.ts` + `inkTarget`, `lib/admin/trash.ts`
  (list, restore, destroy, notes rooms), `lib/entries/mentions.ts` (both
  halves), `lib/words.ts`, and the nav. `tests/unit/family-tree-spine.test.ts`
  asks every one of them against a real SQLite file, because a kind with a
  table but no `sideCondition`, or a `keeperRef` but no live key, half exists —
  and every half fails *silently*. Write that test first when a seventh kind
  arrives; copy it, do not rediscover the list. The **phone's tab bar is full**,
  so a seventh kind is `desktopOnly` in `NAV` like `/stambomen` and `/web`.
- **A stamboom is a window, and `writeRelation` is the reason** (§66). Kinship
  lives on the artikel, in a koppelingsveld carrying a `role`, so the canvas's
  `+` handle writes a **field**: `POST /api/family-trees/[id]/relations` →
  `writeRelation` → `updateEntry` with the field's *whole* array (§5's
  `mergeKeys` rule — a list inside `fields` replaces, so a delta would never
  remove the last ref). That road is what makes the §38 gate, the mirror,
  `recomputeFieldMentions`, the revision and the **voorstel** all apply, and the
  right asked is the *artikel's*, not the tree's. `mergeTreeState` refuses to
  store a tie between two artikelen at all, on the server and in the browser:
  two places holding one fact is two places that can disagree. Never add a
  second road.
- **The mirror is inside `updateEntry`, and it is a direct `db.update`** (§66).
  `mirrorPlan` (`lib/families/mirror.ts`) is pure and says what the other page
  should hold; `applyMirror` in `lib/entries/service.ts` carries it out — after
  the §38 gate and only on a real write, so a voorstel mirrors when it is
  approved. It must never call `updateEntry` again: that ping-pongs between two
  rows and files a proposal nobody made. It bumps the target's `updatedAt` and
  `recomputeFieldMentions` and deliberately writes **no** revision, feed row or
  `updatedBy`, and never touches a row in the trash. `kin` is not mirrored;
  `sibling` is, onto itself, like `partner` (§67). `restoreRevision` mirrors
  too, or an undone "Kinderen: B" leaves "Ouders: A" standing for ever.
  **Adding and removing are not symmetric, on purpose** (§67): an add lands in
  the target soort's **first** field with the inverse role, a removal sweeps
  **every** field of that role — the value may have been typed by hand into the
  second box, or the Keeper may have reordered the fields since, and a mirror
  that only looks in the first box leaves a line nobody can delete. Taking away
  too much is impossible here: only the source artikel is ever swept out.
- **A stamboom's layout is never stored; only the pins are** (§66).
  `layoutTree` in `lib/families/layout.ts` is pure and recomputed from the
  graph on every change — a stored layout goes stale the moment somebody fills
  in a field on a page nobody has this tree open on. A dragged node is `pinned`
  and put back exactly, pushing nobody; "Opnieuw schikken" is one commit that
  clears the pins. Geometry belongs in that file, not in the component — the
  same rule the web and the tijdlijn live by.
- **A brother is worked out, and the typed field is the exception** (§67).
  `lib/families/siblings.ts` is pure and derives siblings from the **first**
  parent-role field of each soort only — the one the mirror writes into —
  because a god carries both `ouders` and `geschapen_door` and deriving from
  every parent-role field makes every creature of one god the brother of every
  other. Three verdicts (`full` needs two shared parents, `half` needs a
  recorded parent on each side the other lacks, `unknown` is a subset), per
  viewer behind `visibleEntryCondition`, and no ghosts: a derived line joins two
  cards that are both already on the glass. The typed field `broers_zussen`
  (role `sibling`) exists for what cannot be derived; it mirrors onto itself and
  makes **no union**. **Not every derived truth gets a line**: only `half` and
  explicit are stroked — `full` already has the shared bar and `unknown` means
  "I don't know which", and a line that says "possibly" is worse than none. An
  explicit link that derives as `full` yields at build time
  (`reconcileSiblings`, `yieldToLineage`'s reasoning); one the parents
  contradict is kept and marked `contested`. A derived line has no field to
  unwrite, so where "Lijn verwijderen" would be it says *Volgt uit de ouders*.
- **Lineage beats a row** (§67). A partner or sibling line whose ends are
  already joined by a parent path is left out of the settle loop's equalising
  (`alongLineage` in `lib/families/layout.ts`) — someone who is both parent and
  partner of the same person otherwise pushed the pair ten rows down. It is
  still drawn.
- **A ref is a copy, so a chip is resolved on read — and you cannot remove what
  you cannot see** (§67). An `entry_link(s)` value stores `{ id, name, slug }`
  as it was when somebody picked it, so the infobox looks every id up afresh per
  viewer (`resolveFieldRefs` in `lib/entries/derived.ts`, one query, behind
  `visibleEntryCondition`) and prints only what comes back — a destroyed, a
  renamed and an unseeable artikel are all answered there, and an id that is not
  in the map is absent, never MISSING (rule 1). **The lookup has three halves,
  and all three are the same answer**: `resolveFieldRefs` decides what a chip
  draws, `scrubUnseenRefs` (same file) cuts the *values* down to it before the
  page hands `fields` to the client component — the stored copy carries the
  **name**, so an unresolved ref is a leak in the payload even where no chip is
  drawn — and `keepUnseenRefs` puts back on the way in exactly what those two
  took out on the way out. The writing face is that third half: the editor sends
  the **whole** array (§5's `mergeKeys`), so
  `keepUnseenRefs` in `updateEntry` puts back every dropped id that still has a
  row but was invisible to the actor (in the trash counts as invisible — for a
  Keeper that is the only case), lets a destroyed one go, and for a one-box
  `entry_link` only restores when the box was *cleared*. `writeRelation` rides
  the same road. Do not add a scrub-on-destroy beside this. And one rule of
  layout hangs off the same chips: inside `.fields-compact` only, an
  `.entry-chip` may wrap and its row may shrink — a 29-character name otherwise
  carried the "verwijderen" cross off a 390 px screen and scrolled the page
  sideways.
- **A selection is a Set, and three things hang off it** (§67): the ids go out
  as `holding` on the site line (capped at sixty in the hub) so everybody else
  gets `.tree-held` / `.board-held` rings, the open box travels in the pointer
  frame's `s`, and a group drag travels in `m` (capped at forty). **A frame on
  the site line is a state, not a telegram** — the fields nobody mentions keep
  their last value — so whoever opened the box has to say when it is closed;
  `useMarqueeSelect` broadcasts `null` on the way up and the canvas passes it
  on. `components/families/useTreeHolding.ts` is the stamboom's half of what
  `useBoardLive` does for the wall.
- **`useTreeSync` is the save and the pull in one hook** (§66). The prikbord
  keeps them in two files; a stamboom cannot, because both roads come back as
  `{ state, graph }` and both must be applied *around* whatever this hand has
  not saved (`pending()`). §61's rule is intact: a save says only what this hand
  touched, absence is never a deletion, a tombstone is. Undo
  (`components/families/treeUndo.ts`) covers the tree's **own** state ~~only —
  never a field on an artikel, for §29's reason~~ **and since golf M also the
  one ref a `+` or *Lijn verwijderen* wrote, sent back targeted through
  `writeRelation` (`lib/families/undoSteps.ts`), never a whole field**; a ref
  already in place is `unchanged`, and a one-box link somebody else now holds
  is left alone (`replace: false`). Redo is Ctrl+Shift+Z / Ctrl+Y.
- **Three counts on a stamboom are per viewer, and one is not stored at all**
  (§66). `memberCount` on the shelf counts only the members *this* reader may
  see (a shelf saying "12" about eleven secrets counts the secrets out loud);
  `buildFamilyGraph` leaves an unseeable artikel **absent** — never a faint card,
  never MISSING (rule 1) — and caps ghosts at 60; and "Genoemd in" for a tree is
  its **members only**, because the lines between them are fields on those
  artikelen and are already counted under "In artikelen". `in_web` is checked in
  exactly two places, `buildWebGraph` and `listMentions` — the same two a
  prikbord uses.
- **Promoting a los kaartje drops lines and says so** (§66). `promoteLooseCard`
  turns each tie into a field (preferring the *new* artikel's own role field,
  falling back to the other end), rewrites a tie to another los kaartje, and
  where neither soort has a field for it counts the line and hands the count
  back as `dropped` — the canvas prints "1 lijn is niet overgezet." A line that
  vanishes in silence is worse than a line that is lost.
- **A live key id may contain a colon now, and two patterns had to learn it**
  (§66). `pointerFrame` in `app/api/live/site/route.ts` accepts
  `^[A-Za-z0-9_:-]{1,64}$` for the keys of `m`, because a stamboom's carried tag
  is a `GraphNodeId` (`entry:{id}` / `loose:{id}`) and the old pattern threw
  every carried card away in silence — the hand was drawn on the other screen
  and the card stood still. And `KEEPER_NOTES_KEY` in `lib/live/rooms.ts` was
  `[a-z]+`, which would never have matched a kind with an underscore;
  `family_tree` was the first, but the bug was already there. Ids you invent for
  a live key (in a fixture too) must stay inside those character classes.
- **A new prikbord `CardKind` is nine files** (§66 added the fifth reference
  kind). `lib/boards/merge.ts` (the union, `REFERENCE_KINDS`, `cardRef`, the
  normalise defaults), `lib/boards/service.ts` (the per-viewer resolver),
  `app/api/boards/[id]/route.ts` (§50's `sameSide`), `BoardCard.tsx`,
  `BoardPicker.tsx`, `BoardCanvas.tsx`, `useBoardSync.ts`, `useBoardLive.ts`,
  and `components/web/PinSelectionButton.tsx` — whose `return` used to end
  "…otherwise it is a tijdlijn", which quietly made a broken tijdlijn card out
  of a `board` knot long before this round.
- **The Keeper's tekenlaag switch goes under the fold on a full-screen canvas**
  (§66, and the landkaart before it). `InkKeeperControls` in the flow took
  132 px off the stage and `canvas-fills-the-screen.spec.ts` says the stage gets
  the screen (§34). Portal it into an empty div the page leaves below the canvas
  (`#tree-underfold` / `#map-underfold`, and since §99 `#board-ink-underfold`
  on the prikbord, where the switch used to sit in the Rechten sheet; every
  Keeper tool of a canvas goes through `UnderFold`) — and since §67 that portal is one
  component, `components/ink/UnderFold.tsx`, placed after mount so the block
  never shows in the column and then jumps out of it; the switch itself comes
  from `useCanvasInk`'s `keeperControls`. Two more of the same family, on
  the same page: a full-screen canvas prints its name **once**, in the §34
  heading (`TreeTitle` makes that heading the edit box rather than adding a bar
  of its own — the two rows cost a phone a third of its stage), and a toolbar
  that must survive 390 px hides each button's `.tree-tool-word` and keeps its
  icon, its `aria-label` and its `title` — hiding the letters is allowed, §64
  forbids changing the accessible *name*.
- **A knijp is `usePinch`, in the capture phase, and nothing else** (§72). A
  canvas does not count fingers of its own any more: the stage carries
  `onPointerDownCapture` / `onPointerMoveCapture` / `onPointerUpCapture` from the
  hook and stops the event when the hook says it was the knijp's, so a second
  finger never reaches a card's own drag. `read` must answer the view *now* (a
  ref that `write` updates too), never render state — the tijdlijn's jump was
  exactly a pan picked up from `view`. `onStart` lets go of whatever the first
  finger had begun. Do not stop a second finger that lands on `.ink-capture`:
  the potlood needs to see it to abandon its stroke.
- **Every moving, making or drawing road on a canvas asks the mode, not just the
  rights** (§73). `useCanvasMode(canEdit)` gives `editing`; `canEdit` (or
  `readOnly`) keeps meaning *rights* and still decides saves, chips and who gets
  a switch at all. Do not fold the mode into `readOnly` — on the prikbord that
  would also hide "Alleen kijken" and stop viewport saves. A new gesture that
  changes the drawing gets `&& editing` on the day it is built; a new thing that
  only *opens* does not.
- **A canvas never spreads `useAuthorGate` directly; it uses
  `useCanvasAuthorGate(editing || inkActive)`** (§90). §18b's question used to
  hang on the whole glass, so a tap in Lezen asked "met wie ben je nu aan het
  schrijven?", and on a phone, which always opens in Lezen, the first touch
  always did. The rule is `gateAsks` in `lib/canvas/authorGate.ts`, pure and
  unit-tested. While writing (Bewerken, or the potlood in the hand), every
  press, key and focus asks. In Lezen, only a box you can really type into
  asks (`isTypable`). Anything under `data-author-gate="off"` never asks, in
  either mode. Spread `AUTHOR_GATE_OFF` on a control that only looks or
  filters: the camera (`CanvasZoomControls`), the mode switch
  (`CanvasModeToggle`) and the landkaart's legend already carry it. A new
  maker button on a canvas bar asks *before* it makes, and since §101 (ronde
  64) it does that through **one helper**: `useCanvasMaker()` hands out a
  button's props — `AUTHOR_GATE_OFF` *and* an `onClick` that asks first and
  then makes — so the next maker cannot carry half of it, and
  `useAskAuthorFirst()` does the same for a callback that has no button of its
  own (a picker row, a menu item). The bars of the landkaart, the tijdlijn and
  the stamboom carry `AUTHOR_GATE_OFF` themselves. If the question comes after,
  it takes the caret away from what was just made — and worse, the sheet paints
  in the same commit as the `pointerdown`, so the `click` lands on the backdrop
  and the button is never pressed at all: you answer and nothing happened.
  **A sheet over the glass is not the glass** (§101): a `Sheet` hangs in a
  portal but React sends its events along the React tree, so a canvas's gate
  reaches it. Inside a sheet only a box you can really type into asks, in
  either mode — that is what made the landkaart's legend ask. And Escape
  cancels the blocking question: nothing is made and the caret goes back to the
  button that raised it. The non-canvas editors (`RichEditor`,
  `FieldsEditor`, `LiveFields`, …) keep `useAuthorGate`, because everything
  in them is writing. **Since golf J (§105) it takes a second argument**, the
  selectors of the glass and the things on it (`BOARD_GLASS`, `MAP_GLASS`,
  `TIMELINE_GLASS`, `TREE_GLASS`); `gatePress` then decides: choosing a thing
  asks nothing, a drag does (past `PRESS_SLOP`), bare paper never, a link
  never. If a canvas spreads its own `onPointer…Capture` on the same element
  (the prikbord), call `gate.onPointerMoveCapture`/`UpCapture`/`CancelCapture`
  inside them, or the gate never hears the drag. **And a non-canvas surface
  with a button that asks first carries `useCanvasAuthorGate(true)`, not the
  bare `useAuthorGate`** (golf J, §101): only the former reads
  `AUTHOR_GATE_OFF`, so under the bare one the question came on the
  `pointerdown` and ate the click. `SectionsEditor` is the worked example.
- **The camera of a canvas that computes its own layout stays where the hand
  was** (§101, ronde 64). A stamboom stores only its pins (§66), so anything
  that changes the drawing moves the world under a still camera: one parent
  added pushed a whole generation, and the card you were working on slid 307 px
  and off the glass. Record where you stood *before* the write (`markPlace` in
  `FamilyTreeCanvas`), then put it right with `followPoint` + `panIntoView`
  (`lib/canvas/view.ts`, pure): the old card keeps its place on the glass and
  the new one is brought in, never further than that, and the zoom is never
  touched. **Since golf J (§105) the new one wins when both do not fit**
  (`panToBring`, with `boxOnGlass`, in the same file): on a phone two
  generations are taller than the glass, and the new card is the chosen one.
- **A `Sheet`'s `closable` is about the cross and the backdrop, never about
  Escape** (§101). Escape belongs to the topmost sheet, everywhere in the
  archive; the blocking author question was the one place that refused it.
- **Tab from a sectie's title goes to that sectie's text** (§101),
  through `movesToSectionText` in `lib/entries/sectionTab.ts` (pure). Never a
  positive `tabIndex`: it lifts a field out of document order and on a page
  with an infobox that is a worse guess than the one it fixes.
- **There is no FAB on a canvas** (§90, extending §74 and K35). One block of
  `body:has(…) .fab { display: none }` in `app/globals.css` hides it on every
  `.page-canvas`, the prikbord, a tijdlijn frame in a dossier, and wherever a
  `.board-inspector` or `.tree-picker` is docked, at every width. A canvas has
  its own `+`, and a new docked panel that the FAB can cover belongs in that
  selector list. `n` still works everywhere.
- **On a phone, what a tap opens over a canvas is a `CanvasPeek`, never a
  `Sheet`** (§74). It is non-modal, fixed above the tab bar, one scrolling body
  (the thing first, its tools below), `role="dialog"` named by its heading. A
  `Sheet` is still right for a *form* someone chose to open (bewerken, a legend).
  Since §105 the prikbord's inspector (`.board-peek`) and its lade are peeks
  too; ~~`.board-inspector-phone` is dead CSS~~ `.board-inspector-phone` is
  gone from `app/globals.css` since golf J.
- **On a phone a canvas's first maker is the `+`, by one class** (§105). Give
  the bar's maker button `canvas-make` and it becomes the round 56 px `+` in
  the FAB's corner below 768 px (`position: fixed` in `app/vlakken.css`), with
  `canvas-undo` beside it in Bewerken. Same element, same name, same
  `useCanvasMaker` — only the place changes, so do not render a second button
  for the phone. It climbs over `--toast-stack` and `--peek-now` through one
  `--dock-lift`, which only those rules set: a default on the button itself
  outranked them and left the undo under the peek. A new canvas's maker gets
  the class on the day it is built; a maker that should stay in the bar (the
  tijdlijn in a dossier, outside `.page-canvas`) does not.
- **The peek moves only on `transform`, and it lies under the tab bar** (§105).
  z 39 with a paper skirt (`::after`) below it: a change of size is a FLIP in
  `CanvasPeek`, never a `max-height` transition. Do not give it a z-index
  above `.tabs` (40) — its exit and its growth slide behind the bar. The
  arithmetic of the grip is `lib/canvas/peek.ts` (pure). **It grows only when
  its body overflows** (`data-groeit="ja|nee"`); otherwise the grip gives a
  rubber rim of −10 px and nothing else. And the `+` steps aside only on
  `:root[data-peek-hoog]` (the peek is taller than half the viewport), never on
  `.is-full`: a short peek that is "full" still leaves the maker in reach.
- **An empty canvas is `CanvasEmpty`** (§105): one sentence, one verb, the
  surface's old class kept (`board-empty`, `map-empty`, `timeline-empty`,
  `tree-empty`). Its button stops its own `pointerdown`, so the glass never
  sees it. Its label must never be the name of the bar's maker (§64: two
  buttons, one name, a strict-mode violation in every spec that looks), and it
  is `primary` (red) only for *Beginnen* in Lezen — in Bewerken the `+` is the
  one red button. Where the canvas itself is the thing to look at (a
  landkaart's scan, a tijdlijn's axis) pass `strook`: a thin band that is
  glass except for its button, so a drag through it still takes the canvas.
- **A title in a canvas head on a phone is `flex: 1 1` on two classes**
  (§105): `stambomen.css` sets `.canvas-head h1.tree-title { flex: 0 0 auto }`
  and may load after `vlakken.css`, so the phone rule names
  `.page-canvas .canvas-head > h1.tree-title` itself. A new canvas whose head
  carries its own `h1` class adds it there, or a long name pushes
  *Verbindingen* to a third row.
- **On a phone a loose button in a canvas bar is bare, a group has a rim**
  (§105, H4): the loep, the trechter, the ↕, the gear and the lock are 44 × 44
  without a box; the switch and the zoom are groups. Chosen is `--paper-dark`
  with ink everywhere, Bewerken alone is stamp red. A new bar button joins the
  selector list in `app/vlakken.css` rather than bringing its own box.
- **Take a canvas's pointer capture lazily, at the drag threshold — never on
  `pointerdown`** (§66). Chromium retargets the compatibility mouse events at
  the *capture element*, so a stage that captures on the way down means the
  `<a>` inside a card never receives its `click`: the link is dead and nothing
  in the console says so. `FamilyTreeCanvas` calls `setPointerCapture` only once
  a press has passed `DRAG_SLOP` (4 px) — by then the hand really is carrying
  something and swallowing the trailing click is exactly right. The spec found
  this, not a person.
- **A tag goes to a list, and `/wiki` is not a list** (§90). Since §75 `/wiki`
  is the voordeur, and it ignores `?tag=`, so every tag chip in the archive
  landed on the welcome text for thirteen rounds. Build a tag link with
  `tagListHref(tag, typeSlug)` (`lib/entries/tagHref.ts`), never by hand: it
  gives `/wiki/<soort>?tag=`, or `/wiki/alles?tag=` without a soort. An old
  `/wiki?tag=` is sent on to `/wiki/alles` with everything it carried. That
  redirect is written `return redirect(…)` on purpose:
  `tests/unit/live-everywhere.test.ts` reads a bare `redirect(` at the start of
  a line as "a page that is nothing but a door" and excuses it from `LivePage`.
  A page that only *sometimes* sends you on must not match that.
- **The save word is `combinedSave`, not a ternary per page** (§90). The
  artikel and the dossier both call `useSaveWord(state, rooms, words)`
  (`components/entry/useAutosave.ts`). The order is the point: a refusal
  first, then `offline` (the browser says so, a room says so, or nothing came
  back for `SAVE_STUCK_MS` = 5 s), then *Opslaan…*. The five-second clock runs
  only on an autosave in flight or a room with keystrokes waiting while its
  line is not up. A live room says `saving` for as long as somebody types, so
  a clock on that would call a healthy line dead. A failed autosave *request*
  is `offline`, not `error`. Its patch goes back into the queue under anything
  typed since and goes out again on the browser's `online`. **Since §100 that
  word is said once, in the shell** (`SaveStatus` in `.live-strip`, beside the
  live dot), not on the page: every writer reports into `saveRegister`
  (`components/live/saveRegister.ts`) with `useReportSave(state, message)`,
  or `useReportRoomSave(active, rooms)` for a room, and an error beats busy.
  A new writer — a sheet, a canvas sync, a sectie — reports there too, or the
  shell says *Opgeslagen* while it is still saving. The sentences and
  `.save-state` stayed.
- ~~**A key in `lib/words.ts` is cut to 60 characters when the Keeper overrides
  it** (`cleanWordOverrides`), and round 51 added sentences longer than that
  (`saveOffline`, `newEntryWhoReads`, `passwordReset`, `keeperGuestNobodyGift`,
  `keeperWearsNone`; `handoutEmpty` was already over). The fallback shows in
  full. A Keeper who rewrites one of them loses the tail. This is a leftover
  (§8, round 51), not a licence: keep a new key under 60 until the cap moves.~~
  **The cap moved in round 57 (§96): a Keeper's word may be 200 characters**
  (`WORD_MAX` in `lib/words.ts`, the only place the number lives; `WordsForm`
  reads it for its `maxLength`). The longest default is 144, and
  `tests/unit/ronde-57-woorden.test.ts` fails if a default outgrows the cap.
  ~~`tests/unit/ronde-51-canvas.test.ts` still asks its own keys for ≤ 60,
  which is stricter than needed and harmless.~~ Since §101 it asks for
  `WORD_MAX` as well.
- **A preview over a box never takes the box's click** (§92). `MentionPreview`
  lies over a short box while it has no focus, and it is `pointer-events: none`
  everywhere except on its chips. A first version took the whole press and set
  the caret itself; then every gesture meant for the box (a spec clicking it,
  a tool pointing at it) hit the preview instead, and Playwright reported
  "intercepts pointer events" until it timed out. The box is the thing; the
  preview is a picture. It also stays out of the handover (§56, §7): it is an
  ordinary child in a `.mention-field` that exists from the first render, and
  it never touches the box's `value` or `onChange`. `MentionRow` is gone; do
  not bring back a row under a box. ~~For round 56: `dropDanglingOpeners`,
  `placeSuggestList`/`currentView`, `enterLeaves` and `.mention-field` stay;
  `MentionPreview`, `previewSegments` and `useBoxFocus` go once the box draws
  its own chips.~~ **Round 56 (§95):** the four short boxes and the two
  maakbladen of an artikel and a dossier draw their own chips now and have no
  preview, no `.mention-field` and no `useBoxFocus`. ~~All of those — and
  `dropDanglingOpeners`, `placeSuggestList`/`currentView`, `enterLeaves` — stay
  for the boxes that still write `[[Naam]]` (a kaartje, a speld, a
  gebeurtenis, the maakbladen of a landkaart, tijdlijn and stamboom, an
  overzicht's lead).~~ **Round 59 (§98):** no box writes `[[Naam]]` any more,
  so `MentionPreview`, `.mention-field` and `useBoxFocus` have no users; they
  were left in place, not deleted. `ShortEditor` reuses `dropDanglingOpeners` and
  `placeSuggestList`, and `lib/editor/shortBox.ts` gained `alignedDelta`.
- **A suggest list places itself with `placeSuggestList`** (§92, pure, in
  `lib/editor/shortBox.ts`), measured against `currentView()` — the
  `visualViewport` where there is one, so a phone's keyboard is not "room
  below". The rich editor's `SuggestionPopup` and the short boxes share it; a
  third list does too, rather than measuring the window again.
- **A name in a short box is a handle, and a handle is resolved per reader**
  (§95). The korte beschrijving, a dossier's samenvatting and an infobox Tekst
  or Lange tekst store `⟦handle⟧` (`lib/entries/shortTokens.mjs`), with one
  row per *mention* in `mention_handles`. Never put an entry's id or name in
  that string: the box is a `Y.Text` handed whole to every reader of the
  record, and a CRDT cannot be scrubbed per viewer (rule 1). A name comes out
  only through `resolveHandles(viewer, …)` in `lib/entries/shortRefs.ts`,
  behind `visibleEntryCondition`, and what a reader may not follow is
  **absent** — drawn as nothing, not as a dead chip. On the page that is
  `<ShortChips map={shortChipsFor(user, texts)}>` around anything that prints
  short texts, so the first paint has its chips; on the server where no chip
  can be drawn (history, voorstellen, prullenbak) it is `plainShort`; in the
  FTS it is `indexShort`, which since §97 **leaves a chip out** rather than
  writing today's name (the index is one table for everybody, so a hidden
  name in it is a place to find it). Since §98 every short box stores handles —
  a speld, a gebeurtenis, a los kaartje, a prikbordkaartje, the omschrijving
  of a landkaart, tijdlijn, stamboom or prikbord, and an overzicht's inleiding
  — so this bullet is about all of them. A new page that shows a korte beschrijving or a
  samenvatting gets the `<ShortChips>` too, or every chip on it is one fetch
  late. A new reader prints `MentionText tokens` (or `plain` in a flat row),
  never the raw string: raw, a handle is `⟦Ab3…⟧` on the screen.
- **Every road into a short text goes through `cleanShort`** (§95, the §89 of
  a string): `createEntry`, `updateEntry`, `createCase`, `updateCase`, and
  since §98 through `cleanShortWrite` (the same plus trim, cap and a `cleaned`
  flag for a live write's room) in `addPin`, `updatePin`, `addEvent`,
  `updateEvent`, `saveBoard`, `saveFamilyTreeState`, `createMap`/`updateMap`,
  `createTimeline`/`updateTimeline` and `createFamilyTree`/`updateFamilyTree`;
  `updateOverzicht` and §99's `setBoardDescription` call `cleanShort` itself.
  It drops stray `⟦⟧` and control characters (a newline becomes a space except
  in a Lange tekst — or, since §98, in a speld, gebeurtenis, los kaartje,
  prikbordkaartje or inleiding; an omschrijving is one line), drops a *new*
  handle the writer may not see, puts back ~~at the end~~ **where it stood**
  (§98, `putBack` with `alignedDelta`; at the end only when the whole text was
  replaced) a handle the writer could not see and left out (§67), and turns a
  typed-out `[[Naam]]` into a chip when the writer may see that artikel. When
  its answer differs from what the room sent, `resetFieldsInRoom` brings the
  room in line. A handle is minted only by `mintHandle` (`POST
  /api/mentions/handle`), which asks the same visibility question. A sixth
  road in is a sixth call to `cleanShort`, on the day it is built.
- **A short box is `ShortField` → `ShortEditor`, and it is not `LiveField`**
  (§95). Tiptap 2 via `next/dynamic` with `ssr: false` (keep it out of the
  shell), its own schema (`inline*` plus an atomic `shortChip` that stores
  only its `handle`; `hardBreak` only in a Lange tekst), bound as a *string*
  to the same `Y.Text` with `BoundField`'s §25 handover — not y-prosemirror.
  A remote change lands as one step outside history, widened to token
  boundaries by `alignedDelta`, so a chip is never cut in half. Enter leaves
  (Lange tekst: new line), paste is plain text, a picked name asks for a
  handle before the chip is written. ~~Kaartje, speld, gebeurtenis and the
  canvases' descriptions still write `[[Naam]]`; `MentionText` reads both
  forms, so moving one of them over is its own column, conversion and
  readers — not a flag.~~ Since §98 every short box is a `ShortField` and
  `LiveField mentions` has no users. **In Bewerken a click or tap on a chip
  puts the caret after it** (`handleClickOn`, §98 reversing §68 for short
  boxes) and does not select it, or the next letter would replace it; opening
  is the reading face's. A maakblad draft keeps words, not chips
  (`chipsAsWords`). And **what arrives from the room is never this hand's own
  save** (§101 naden, `ShortEditor` and `LiveFieldsRoom`): a look-only
  proposer who reported the room's text as `live: false` filed the approved
  voorstel a second time.
- **Owning a stuk huisraad is a slot or a drawer row, and unique has one
  reader** (§93). `placeItem` refuses a speler anything `keeper_made` that is
  not in the drawer of *that* kamer; the Keeper may place anything but takes
  from the drawer first. `clearSlot` puts huisraad in the drawer. Placing only
  lands on an **empty** plek (`entry_id IS NULL` in the `UPDATE`). "Is this
  unique thing taken?" is `claimedIds()` and nothing else: it reads
  `room_slots.claim` *and* every drawer row of a `one_of_a_kind` soort, asking
  the flag live. Never write a third query for it. *Wat je al hebt* is
  `placeCandidates()`. A buy is undone only through `undoPurchase` (one
  transaction, the buyer, the last buy of that thing in that kamer, within
  `BUY_UNDO_SECONDS` + `BUY_UNDO_GRACE_SECONDS` from `lib/kamers/undo.ts`,
  which is pure so the toast reads the same number), and it **adds** a
  `return` line; it never edits one. `components/kamer/Verplaatsen.tsx` and
  `components/kamer/buyToast.ts` are in the scope of
  `tests/unit/kamer-contract.test.ts`, so their words are keys.
- **A `replaceState` that Next must follow passes `null`, never
  `history.state`** (§94). Next patches `history.replaceState` and copies the
  new address into its router only when the data carries no `__NA`; pass the
  old state and the next render of the app router puts the old URL back.
  `writeChoice` in `lib/canvas/memory.ts` is the worked example, and
  `AdminTabs.tsx` had the same bug from round 51 until after the golf-2 merge.
- **A canvas remembers two things, one way** (§94). The choice goes in the
  address (`writeChoice`/`readChoice` with `CHOICE_PARAM`), the camera in
  `sessionStorage` (`readCamera`/`writeCamera`, key
  `canvas:{kind}:{id}:camera`, validated on read because it is anybody's
  JSON). Never `localStorage` for a camera: a new session opens on a readable
  start, and a camera is never shared (rule 20). A new canvas calls those
  three, and `tests/unit/ronde-55-tekenvlakken.test.ts` holds the pure halves.
  A maker sends you to its new canvas through `freshHref(path)` (`?new=1`),
  which `useCanvasMode` reads once and strips a frame later; do not invent a
  second "just made" flag. **Since golf M a new canvas reports and receives
  its spot for free by using `readCamera`/`writeCamera`** (`onCameraWrite`
  feeds `LiveSpot`, and `readCamera` takes a `?waar=` camera once). Never
  write a camera to `sessionStorage` directly, or *Ga naar* and *Kom kijken*
  cannot land on it (§76, `lib/live/spot.ts`).
- **Opening is not fitting** (§94). The prikbord and the stamboom open with
  `readableFit(bounds, stage, readingFloor(nameSize))`, never below a 10 px
  name; the *Alles in beeld* button still calls the plain fit and shows
  everything. A spec that wants "everything on the glass" presses the button
  (§6), it does not trust the opening view. Both also open at **most** at zoom
  1 (`OPEN_MAX_ZOOM` on the prikbord, `TREE_OPEN_MAX_ZOOM` on the stamboom
  since §99): a fit of one los kaartje was twice life size.
- **A new kind of container belongs in `lib/search/others.ts` too** (§96),
  read through its own `list*` without `bothSides`, with an entry in
  `OTHER_KINDS` and a word and icon in `KIND_WORD`/`KIND_ICON`. That makes it
  one more place on the §66 list of about twenty.
- **In a form that posts everything, a folded or filtered row is `hidden`,
  never unmounted** (§96). `saveWords` replaces the whole list with what the
  form posts, so a box that is not rendered loses its word on save. And never
  put a `<summary>` inside `details.admin-type`: a spec that finds a soort by
  its summary's name then matches a picker in another soort (`TargetsPicker`
  was a button with `aria-expanded` for that reason; since golf J that is
  `SoortKiezer`, which kept the button).
- **A link in the running text is `{ type: 'entryLink', attrs: { handle } }`
  and nothing else** (§97). Never write an `id`, a `label`, a slug or a colour
  into the node: node attributes are what y-prosemirror sends to everybody in
  the room. The name lives only in the node-view in the browser
  (`components/editor/EntryLink.ts`), which gets it per reader from
  `ShortChips` or `POST /api/mentions`; a handle the reader may not follow is
  an empty `a.entry-chip-none`. A handle comes from `mintHandle` / `POST
  /api/mentions/handle` and nowhere else.
- **A new writer of a rich document calls `cleanDoc` and then
  `cleanDocRefs(doc, { prev, actor })`** (§97, `lib/entries/shortRefs.ts`), as
  `createEntry`, `updateEntry`, `restoreRevision`, `updateSection`,
  `updateCase` and `restoreCaseRevision` do. It turns a legacy `{ id }` link
  into a handle when the writer may see the artikel, drops a new handle the
  writer may not see, puts back on its place what the writer could not see
  and left out (`putBackInDoc`), and leaves one space where a link fell away
  (`closeGaps`, §101). When the answer differs from what the room sent, the
  service resets the room.
- **"Which artikelen does this document name?" is `linkedEntryIds`**
  (`lib/entries/docRefs.ts`), never `extractEntryLinks`, which reads only
  legacy `{ id }` links and so finds nothing in a stored document. "Which
  artikelen does this short text name?" is `entryIdsInShort`
  (`lib/entries/mentions.ts`), the one reader of chips for *Genoemd in* (§98);
  a new short box that should count adds a call there.
- **`body_text`, `notes_text` and a section's `bodyText` carry tokens `⟦h⟧`**
  (§97). Never print them raw: through `plainShort(viewer, …)` on the server,
  and a page that shows running text passes `bodyText`/`notesText` to
  `shortChipsFor` so the first paint has its chips.
- **A new description on a canvas is a `ShortField` + `cleanShort` +
  `MentionText tokens`, with `shortChipsFor` on the page** (§99, as the
  prikbord's `boards.description` through `setBoardDescription`), and it gets
  a line in `lib/entries/mentions.ts` so it counts under *Genoemd in* (the
  prikbord's was forgotten until the naden).
- **The palette is the one search box** (§100). `/` and Ctrl/⌘K (keys in
  `UiProvider`) open `CommandPalette`, which `AppShell` draws; the side menu's `nav-search` and the
  Jij-blad's `jij-palette` are buttons that open it. Its search goes through
  `/api/search`, *Onlangs* through `lib/palette/recent.ts` (addresses only, in
  `localStorage`, per account) and `resolveRecent`, its `>` handelingen
  through `paletteActions` (pure). A handeling uses an opener that exists;
  making a canvas is its list with `?maak=1` (`useMakeOnArrival`), never a
  second maker. What is the Keeper's is absent for a speler.
- **A sheet puts its first caret with `data-autofocus`** (§101). `Sheet` looks
  for it once the panel is drawn. Never a `useEffect` on mount or a
  `setTimeout`: `Sheet` draws nothing on its first commit, so the box is not
  there yet.
- **A feed row about a kamer asks the kamer** (§101). `recentActivity` ANDs
  `roomRowCondition` (`lib/entries/service.ts`): for a `room.*` verb, the
  kamer from `meta.roomId` or from the plek in `meta.slotId` must pass
  `viewableCondition('room')` and its onderzoeker `visibleEntryCondition`, or
  the row is not there. A new `room.*` row carries one of those two keys, or
  it is hidden from every speler. The Keeper's lade-gift (`giveToDrawer`) is
  `room.placed` with `meta: { roomId, drawer: true }`.
- **`mayHoldRoom` counts only living karakters** (§101 naden): a karakter in
  the prullenbak is worn by nobody, so it no longer makes a soort
  "wearable" (E3).
- **Nieuwe CSS-beweging gebruikt een token** (§102), anders wordt
  `tests/unit/beweging.test.ts` rood. Een echte uitzondering hoort in
  `EXCEPTIONS` én in `docs/beweging.md` §6, met een reden. Een
  `@keyframes`-naam komt één keer voor over alle `app/*.css`; een nieuwe laag
  van een ronde krijgt een eigen css-bestand, geïmporteerd in `app/layout.tsx`
  na `globals.css`.
- **Een toetsenbordactie beweegt niet** (§102). Een blad sluit met een
  uitgang alleen via het kruisje of de achtergrond (`closeByHand`); Escape,
  Enter en een blad dat de ouder weghaalt, zijn meteen weg. Het palet heeft
  `exit={false}`. Een bevestigingsvraag antwoordt in `onLeave`, nooit na de
  uitgang.
- **Er is geen `loading.tsx` in `app/(app)`, en dat is gemeten** (§102, zie
  §8), **en sinds golf M ook geen skelet**: `NavProgress` tekent alleen de
  streep, en de oude pagina blijft staan tot de nieuwe er is.
  `aria-current` volgt de pagina, niet de klik; `data-pending` volgt de klik.
- **Alleen de omslag krijgt een pagina-overgang** (§102).
  `@view-transition { navigation: auto }` staat aan voor elk document, en
  `FLIP_SCRIPT` in de `<head>` van `app/layout.tsx` slaat hem over bij
  `pageswap` en `pagereveal` zonder verse `lw:flip`. Schrijf die notitie
  nergens anders dan in `SideToggle.flip()` met een aanwijzer als oorsprong, en
  zet er nooit een tweede inline script bij. Een gewone navigatie heeft geen
  overgang: sinds golf M wisselt de pagina in één keer (`nav-page-in` en
  `nav-page-fade` zijn weg); een morph komt er niet.
- **Een melding en de FAB weten waar ze elkaar vinden** (§102, herstel).
  `UiProvider` schrijft de hoogte van de meldingenstapel naar `--toast-stack`
  op `:root`, en `.fab` klimt die hoogte omhoog. Een pagina met een plakkende
  voet (§85) zet `--voet-h` in het `:has()`-blok naast `.toast-wrap`, nooit met
  een eigen verschuiving in haar stylesheet. Een nieuwe plakkende voet komt in
  die selector *én* in de FAB-regel van §85.
- **Een moment in de kamer is een briefje van de hand** (§103). Wie iets laat
  landen, roept `markLanding({ slotId, entryId, first })` of
  `markUnlock(slotId)` aan (`components/kamer/moment.ts`). De tegel neemt het
  briefje mee in `Neerzetten`. Laat nooit iets landen op basis van een render:
  een refresh of een live-update van een ander hoort stil te blijven.
- **Een saldo op het scherm is `SaldoGetal`** (§103). Het beweegt alleen
  tussen twee `value`s van boven en toont de chip. Zet geen `key={balance}`
  terug en tel niets op in de browser.
- **Geluid gaat door `play(kind)` uit `lib/sound/klank.ts`** (§103), en alleen
  bij kopen, neerzetten, openen of een gift. Er is één gedeelde
  `AudioContext`, er wordt niets gemaakt als het geluid uit staat, en
  `primeKlank` hangt aan `useShellBeurs`. Een nieuwe klank is een recept in
  `lib/sound/recipes.ts`, en de unit-test rekent hem uit: ≤ 300 ms, piek
  ≤ 0,15, stil aan de randen.
- **In de winkel en de catalogus draagt alleen de naam `data-entry-id`**
  (§103, E18). Op een rij of een knop laat het de voorbeeldkaart over de knop
  springen.
- **Een koop in de winkel houdt de live-verversing vast** (§103, herstel):
  `holdBeforeRefresh` met een §59-hold tot *Gekocht* geland is, plus
  `--dur-5`. Een nieuwe knop die een moment tekent vóór de rij wisselt, doet
  hetzelfde, anders ververst `LivePage` hem na 150 ms weg.
- **Wat een ander draagt, glijdt, en is zacht op slot** (§108, golf M). Op
  een tekenvlak zet de hand wat ze sleept in `m`; een ander volgt het met
  `useFollow` (`lib/canvas/follow.ts`, een `translate` over elk element met
  `data-follow`) en vraagt het slot met `useSoftLock` (`lib/live/hands.ts`).
  Zet nooit een CSS-`transition` op `left`/`top` van iets dat een ander
  draagt: twee versnellingen op één ding vechten. Het slot is beleefdheid:
  de server weigert er niets op, en openen en lezen mogen altijd. Een oude
  Ctrl+Z brengt niet terug wat een ander weghaalde (`goneByOthers`; op de
  stamboom alleen `revive` in de patch).
- **Een speld is van wie de landkaart mag bewerken** (§40, golf M):
  `viewerCanEditMap` voor zetten, verschuiven, herschrijven, laag, weghalen
  en terugzetten, en voor de kamer `pin:{id}:fields`. Vraag nooit meer
  `pin.createdBy === viewer.id`.
- **Plek-iconen botsen niet met soort-iconen** (§103, herstel):
  `tests/unit/ronde-66-herstel.test.ts` leest de iconen uit `lib/db/seed.mjs`.
  Botsingen buiten de plekken staan nog open: `home` (kamer en Huisraad).
  ~~`lock` (openen en Eldritch), `book` (catalogus en Werken).~~ Gesloten in
  golf L: Eldritch draagt `tentacle`, Geschriften `quill`.
- **Een icoon is een lijn van 1,6 op een raster van 24, en wordt op 16 px
  bekeken** (golf L). Teken het in `components/Icon.tsx` (een `d` met `M`,
  `l`, `q`/`t`, `a` voor cirkels; geen `fill`), kijk het na op een contactvel
  op 48, 20 en 16 px in beide thema's, en een teken voor een soort gaat ook
  in `SOORT_ICONEN` (`lib/beheer.ts`) met een Nederlandse naam van één woord.
  Het web tekent dezelfde `d` met `Path2D`, dus een pad dat alleen in SVG
  werkt, werkt daar niet.
- **Het vlak van het prikbord is `.board-viewport::before`, niet de
  achtergrond van het glas** (golf L, sinds golf N rustig; `app/tekens.css`):
  een eigen laag onder alles (`isolation: isolate`, z −1). De kleur is
  `--board-surface` (`--cork` door `--paper` gemengd), met `--board-shade` en
  in het donker `--board-lamp`; de enige afbeelding is één `feTurbulence`
  over het hele glas (`100% 100% no-repeat`). **Geen tegel**: Nick zag elke
  herhaling, ook die van elf tegels met ongelijke maten. Geen
  `background-image` terug op `.board-viewport`.
- **"Waarom noemt dit mij?" is `mentionSentences`** (`lib/wiki/genoemd.ts`,
  §104). Het leest alleen bronnen die `listMentions` en `getBacklinks` al voor
  deze lezer teruggaven, per id (`sectionId` voor een sectie). Een nieuwe
  soort bron voor *Genoemd in* krijgt ook een tak in `mentionTexts`. Druk nooit
  een fragment af zonder `snippetAround`: dat laat een onzichtbaar handvat weg
  en knipt pas daarna.
- **Een willekeurig artikel is `randomEntry`** (§104). `/wiki/willekeurig`,
  *Verras me* en *Nog één* vragen het alle drie. Schrijf geen tweede
  `ORDER BY random()`.
- **Een kop-anker leeft naast ProseMirror, nooit erin** (§104,
  `HeadingAnchors`). Zet geen id of knop in de DOM van een editor.
- **Een lezer die tekst met handvatten projecteert, sluit de naad met
  `lib/wiki/naad.ts`** (§104, herstel). Schrijf geen eigen spatie-opruiming.
  Soortkleur op kleine tekst gaat via `.soort-inkt` of `.chip-soort` (met
  `--soort` inline), nooit rauw als `color`; `ronde-67-contrast.test.ts` eist
  4,5:1 in alle vier de paletten.
- **Er is op een computer geen `.side-toggle` meer** (§102, golf H, D4). De
  Keeperkant is daar `SideToggle variant="mast"` in `.sidenav .masthead`
  (klasse `.side-switch`, nog steeds `data-testid="side-toggle"`); `AppShell`
  rendert via `useIsPhone` precies één van de twee. Regels voor de hoekknop op
  een telefoon staan onder `@media (max-width: 767px)` op
  `.shell[data-keeper-hand]`, nooit op `:has(> .side-toggle)`: de knop komt pas
  met de hydratatie, de strook moet er eerder zijn.
- **`data-pending` op een link komt uit `NavProgress`** (§102, golf H, D3), in
  de capture-fase op `document`. Een nieuwe vorm van link die een eigen teken
  wil, krijgt een regel in `app/navigatie.css` onder "de hand op elke link";
  schrijf geen eigen klik-luisteraar die hetzelfde doet. Wat `startsNavigation`
  weigert, krijgt ook geen teken.
- **Een pagina die alleen `notFound()` is, rendert geen `LivePage`** (§102,
  golf H, D2): `live-everywhere.test.ts` kent die vorm, net als een pagina die
  alleen `redirect(` is. De catch-all `app/(app)/[...rest]/page.tsx` begint met
  `requireViewer()` (§89).
- **Een getal dat een knop van de server terugkrijgt, gaat door
  `announceBalance`** (`components/kamer/saldo.ts`, §103, golf H). Een nieuwe
  schrijfweg die een saldo verandert, leest de balans in zijn eigen transactie
  en geeft hem mee in het antwoord. Tel nooit zelf; geef `Beurs` een `room`
  (of `null`), nooit de schil als standaard, anders krijgt de beurs van een
  ander het getal van jouw kamer.
- **Een melding over één ding of één plek draagt een `key`** (§103, golf H):
  `toastKeyOf(entryId)` (`ding:<id>`) of `plek:<id>`, en munten van de Keeper
  `munt:keeper`. Zonder sleutel stapelt hij. Er staan er hooguit twee
  (`TOAST_MAX`); `nextToasts` is puur en getest.
- **Een rij die opzij scrolt, is `.schuifrij`** (§104, golf H, T9), met
  `useSchuifrij(ref, key)` of `<Schuifrij>` als het gekozen item in beeld moet.
  Geen eigen `mask-image` en geen `scrollIntoView` (dat scrolt elke voorouder
  mee). Een rij van artikelen of dossiers op de telefoon is `.rijen`, niet een
  eigen lijstvorm.
- ~~**Hoeveel soorten er in de tabrij van de wiki passen, zegt de stylesheet**
  (§104, golf H, D6): `rangSoorten` geeft een rang, `data-rang` en
  `data-nodig-tot` in `app/leeskamer.css` kiezen per breedte.~~ **Sinds golf N
  staat elke soort in de rij** (`TypeTabs`, `.type-tabs-alle` in
  `app/ruimte.css`); de rij breekt. `rangSoorten`, `MeerSoorten` en
  `data-rang` bestaan niet meer.
- **Tekst heeft geen maat van zichzelf** (golf N, §104): hij vult de kolom
  waar hij in staat — ook het kader van de dossiernotities (`.editor-body`,
  was `calc(68ch + 2rem)`). Zet geen `max-width` in `ch` of `rem` op lopende
  tekst, een tekstvak, een inleiding of een beschrijving; wie een smallere regel wil, maakt de
  *kolom* smaller. Een stylesheet die een pagina zelf laadt, komt na de lagen
  van `app/layout.tsx`: daarom begint elke regel in `app/ruimte.css` met
  `.main`.
- **Een Keeper in *Wie is er?* is een plek als ieder ander** (§76, golf N):
  `rosterFor` vraagt `canWatch` voor zijn plek zoals voor elke rij. Alleen
  `elsewhere` blijft voor een speler 0. Bouw geen tweede regel voor de
  Keeper.
- **Een lege lijst is een `LegeStaat`, nooit een los `.empty`-kader** (§106,
  golf I; `components/ui/LegeStaat.tsx`). Eén zin uit `lib/words.ts`, hooguit
  één regel uitleg, één deur die op een bestaande knop drukt (`ArtikelDeur`,
  `DossierDeur`, `MaakDeur` → `MAKE_EVENT`, in
  `components/eerste-keer/Deuren.tsx`). Geef de deur een ander label dan de
  knop bovenaan de lijst, anders vindt `getByRole('button', { name })` er
  twee. Een lijst zonder één regel en zonder filter heeft geen sorteerbalk.
- **Een regel die per browser één keer verschijnt, staat al in de eerste
  lading** (§106, golf I): `localStorage` is de waarheid, een koekje
  (`FIRST_VISIT_COOKIE`) de spiegel voor de server, en `firstVisitOffer` in
  `lib/eerste-keer/bezoek.ts` leest beide, plus de leeftijd van het account
  (`isNewAccount`, 14 dagen). Iets dat pas na de hydratatie in de flow
  verschijnt, verschuift de pagina onder een vinger.
- **Een speler met één onderzoeker wordt niets gevraagd** (§106, golf I, H5).
  `soleAuthor` in `lib/authorChoice.ts` beslist, `authorStance` geeft dan
  `ready`, en `AuthorProvider` meldt het één keer per venster via
  `SOLE_AUTHOR_EVENT` (*Je schrijft als …*, `key` `schrijver`). Schrijf geen
  eigen "is er maar één?"-tak ergens anders; §18b's vraag is voor twee of meer.
- **`:hover` op een knop of chip staat in `@media (hover: hover)`** (§106,
  golf I, M6). Op een aanraakscherm blijft een hover hangen onder de vinger,
  en een knop die onder de vinger verscheen, bleef dan "ingedrukt". Een nieuwe
  hover-regel op iets wat je aantikt, zet je daar ook in.
- **Beheer op een telefoon is een index, en na een keuze alleen *‹ Beheer***
  (§107, golf I). `AdminTabs` tekent één lijst onderdelen drie keer: index
  (telefoon), een `.schuifrij` (768–1179 px) en een linkerkolom (vanaf
  1180 px). ~~Alleen het actieve paneel is gemount.~~ Een paneel met iets
  niet-bewaards blijft gemount, verborgen (`useNietBewaard`, `mountedPanes`,
  golf J); een nieuw formulier in Beheer dat de hele staat post, meldt zich
  daar ook. Een nieuw onderdeel krijgt
  een pictogram en een zin (`ADMIN_WHAT_KEY` in `lib/beheer.ts`, `beheerWat*`
  in `lib/words.ts`). Op `/admin` staat geen `+`.
- **Een snelknop in de soort-editor mag *Veld toevoegen* niet in zijn naam
  hebben** (§107, golf I): `getByRole('button', { name: 'Veld toevoegen' })`
  matcht een deel van de naam. De vier snelknoppen heten *Keuzelijst*,
  *Koppelingen*, *Getal* en *Datum*, na de zin *Of meteen:*.
- **Soorten en Woorden hebben één voet, `.beheer-voet`** (§107, golf I): de
  telling links, *Opslaan* rechts. *Opgeslagen* komt uit `useReportSave`
  (§100), nooit uit de voet. Een soort wordt nog steeds in één keer bewaard
  (`saveType`); er komt geen autosave.

---

### §76: the two mistakes this feature invites

Both were made in round 39 and both were found from the other side, which is
the only side that finds them.

1. **Do not build one roster and fan it out.** It is the obvious optimisation
   and it is the whole leak: the rows would carry every place name, and the
   browser would be asked to hide what it may not see — in the one place that
   cannot check. `rosterFor` runs per account, asks `canWatch` per row, and
   costs a hundred point lookups at this table's size. Leave it dumb.
2. **A field on `Outgoing` that nothing merges does not exist.** `nudge`, `rest`
   and `ghost` were declared on the type, handled by the route, and silently
   dropped by the merge in `post()` — so the Keeper's *onzichtbaar* checkbox
   said yes and changed nothing, which is a rights leak that typechecks. When
   you add a field to that type, add it to the merge in the same commit, and
   let a browser see it work.

### §79: the two mistakes *this* feature invites

1. **Do not add a column that computes.** A `bonus`, a `+2`, a stat name, a dice
   term. Rule 78 is the boundary and the whole design leans on it: what a
   voorwerp does is prose on its artikel. The day a number in `room_slots` means
   something mechanical, every balance change becomes a migration and an
   argument about whether the site or the Keeper is right.
2. **A feature only reachable from a unit test does not exist.** §79 asked the
   artikel for a field with key `plek` — a good design — and no screen in Beheer
   can set a field's *key*, so no human could make a voorwerp at all. The unit
   tests were green the whole time, because they write the row with SQL. The
   browser found it in one run. When a round invents a new way for data to be
   shaped, walk the road a person would walk before calling it done.

### §83: de lezer die achterblijft is nooit degene waar je naar kijkt

Round 44 moved two boundaries — what "already taken" means, and what a `plek`
field may hold — and both times the thing that broke was a *reader* nobody had
in mind, because §17's rule 4 is that readers and writers must say the same
sentence and a reader written in another language is easy to forget.

Two of them, and their shape is the lesson:

1. **A reader written in SQL does not move when the others do.** Every reader of
   `plek` goes through `plekKinds` — except the plek-picker, which asks it of a
   thousand rows it has not fetched, so it asked `json_extract(…) = 'bureau'`.
   That finds `["bureau"]` never. The picker offered **nothing** while
   `placeItem` still accepted everything, and not one unit test noticed. It is
   now `plekMatches`, exported beside the other readers and tested against
   `plekKinds` row for row.
2. **A comment is not the code.** `ledgerOf` said "`rowid` is the only tiebreak
   that is always in writing order" and then sorted by `id`, which is sixteen
   random bytes. It had been wrong since §79 and was invisible while only the
   Keeper read the list. When a comment names the right column, check that the
   line under it names the same one.

And a third that belongs with them: an e2e helper is a reader too. Changing a
`select` into a `multiselect` deletes `#field-plek`, and three specs pointed at
it. One `setPlekken`/`expectPlekken` in `tests/e2e/helpers.ts` is now the one
place that knows what that field looks like.

### §84: een UX-regel die niet gemeten wordt, slijt

Ronde 45 was een UX-ronde, en dat is het soort ronde waarvan de regels een half
jaar later stilletjes weg zijn: een `44px` die terugkruipt waar `--tap` hoorde,
een icoon dat er een tweede betekenis bij krijgt, een Nederlandse zin die in een
component belandt in plaats van in `lib/words.ts`, een klasse in de opmaak die
geen enkel stylesheet tekent. **Geen van die vier breekt iets.** Ze slijten
alleen, en daarom staan ze in `tests/unit/kamer-contract.test.ts` en niet in een
document.

Twee dingen die dat bestand laat zien en een mens niet:

1. **Meet elke knop, houd geen lijstje bij.** De e2e-zaak die op 390 px
   `elementFromPoint` op het midden van *elke zichtbare* `.btn` zet en zijn
   hoogte opmeet, vond de rij deuren op `/you` — een rij die in geen enkel
   overzicht stond omdat niemand hem als onderdeel van deze feature zag. Een
   test die alleen de knoppen afloopt waarvan je wist dat ze er waren, bewijst
   wat je al wist.
2. **Een contrastgetal vangt wat een screenshot niet vangt.** `playerDark` droeg
   sinds §45 de rode inkt van het *lichte* palet: 2,4 tegen 1 op een gesloten
   tegel, waar `keeperDark` die correctie allang had. Vier rondes lang keek daar
   iemand naar zonder het te zien — en de test die het vond was drie regels.

En de vorm die ronde 45 toevoegde: **een woord mag een gat hebben.** `'Nog {n}
nodig'` staat in `lib/words.ts` en `fill()` vult het. De Keeper ziet het gat in
Beheer, mag de zin eromheen herschrijven, en mag het gat zelfs weghalen — dan
staat het getal er niet meer, en dat is zijn keuze. Er wordt niets afgedwongen:
een onbekend gat blijft staan zoals het is, want `{plek}` in een zin is beter
zichtbaar mis dan een gat in een zin.

### §87: een regel die overal klopt, kent zijn eigen uitzondering niet

§46 zegt: **een lijst filtert op kant, een opzoeking nooit.** Die regel is goed
en hij heeft een goede reden — een Keeper loopt van beide kanten over een
touwtje naar één artikel, en dat artikel moet er dan staan. Hij stond in tien
functies en in tien gevallen klopte hij.

In het elfde niet. `getHomeOverzicht` is qua vorm een opzoeking (`WHERE is_home
= 1`) en qua betekenis geen record maar **de pagina van de kant waar je staat**.
Het verschil is niet in de code te zien: allebei zijn het één `SELECT … .get()`.
Het zit in de vraag die de functie beantwoordt, en die staat alleen in de naam.

Twee dingen om mee te nemen:

1. **Als een regel over "lijsten" en "opzoekingen" gaat, controleer dan of er
   een derde soort is.** Hier was dat er één: een pagina die per kant bestaat
   en toch met één rij opgezocht wordt. Zulke gevallen herken je eraan dat de
   uitkomst voor *iedereen dezelfde* is terwijl het scherm van niemand in het
   bijzonder is.
2. **Schrijf de uitzondering in de docblock waar de regel staat**, niet alleen
   bij de functie die hem breekt. De opsomming boven `lib/overzichten/service.ts`
   noemde met naam en toenaam welke functies `sideCondition` dragen en welke
   niet — als die niet was bijgewerkt, was de volgende lezer met een kloppend
   ogende lijst aan de haal gegaan.

En één over testen, van een ander soort: beide fouten van deze ronde zaten in
de **zaak** en niet in de app. `/keeper` is geen tuimelschakelaar (hij brengt je
naar de Keeperkant; terug is `/api/keeper/flip?side=player`), en
`locator.blur()` is niet het gebaar dat een los tekstvak opslaat — dat is ergens
anders klikken. Allebei stonden ze al goed in een bestaande zaak twee blokken
hoger in hetzelfde bestand. **Kopieer het gebaar dat er al staat.**

### §88: de lezer die er al was, is degene die stilstaat

Ronde 49 was klein — een titel en een plaatje — en toch is er iets aan dat het
opschrijven waard is, want het is de vierde keer op rij dat dezelfde vorm
opduikt (§83, §85, §86, en nu deze).

1. **Een instelling met drie lezers heeft er vier.** De naam van het archief
   werd gelezen door de mast, de kop op Start en de export. De vierde lezer
   stond in `app/layout.tsx` en was geen lezer maar een *kopie*: een letterlijke
   string die toevallig dezelfde woorden droeg. Zolang niemand hernoemde, was
   er geen verschil te zien. **Zoek bij een instelling niet naar wie hem leest,
   maar naar waar zijn waarde nóg een keer staat** — `grep` op de wáárde, niet
   op de kolomnaam. Die ene `grep -rn "Zeeland Case Files"` vond behalve
   `layout.tsx` ook nog een terugval in `app/(app)/layout.tsx`, een regel in de
   ontwikkelbanner, de glossary en de kop van `README.md`.

2. **Een migratie die een door een mens gekozen waarde overschrijft, gooit data
   weg.** `UPDATE site_settings SET name = …` zonder `WHERE` zou hier precies
   één archief goed hernoemd hebben en elk ander archief zijn naam afgepakt.
   De `WHERE` is niet een voorzichtigheidje maar de hele betekenis van de
   migratie: *hernoem wat nooit hernoemd is*. Zet zo'n `WHERE` in een test,
   want hij ziet eruit als iets dat weggelaten kan worden.

En één over waar code hoort te staan: `siteIdentity()` is bewust **dom** — geen
sessie, geen zichtbaarheid. De wortel-layout draait boven de inlogpoort en voor
élke pagina, dus alles wat daar een recht veronderstelt, trekt het hele archief
door de sessielaag voor een titel. Als je in `app/layout.tsx` iets wilt lezen,
is de eerste vraag niet "mag dit" maar "hoort dit hier".

### §86: de kortste weg naar het antwoord is niet de weg die de app loopt

Ronde 47 bouwde één uitzondering — de Keeper mag een kamer openen voor een
onderzoeker die niemand draagt — en die uitzondering legde twee dingen bloot
die allebei het opschrijven waard zijn.

1. **Zet een vraag over *maken* nooit boven een opzoeking.**
   `getOrCreateRoom` begon met `const owner = ownerOf(entryId); if (!owner)
   return null;` en pas daarna kwam de `SELECT`. Vier rondes lang was dat
   hetzelfde antwoord, want zonder drager bestond er toch geen kamer — de
   volgorde was gratis. Zodra er een tweede manier kwam om er één te laten
   ontstaan, was diezelfde volgorde een stil lek: de kamer stond in `rooms`, de
   uitdeler vond hem (die leest `rooms` rechtstreeks) en élke andere lezer zei
   dat er geen was. **De drager beslist of er iets gemaakt wordt, niet of er
   iets gevonden wordt**, en die twee horen niet in één `if`.

2. **Een test die de kortste weg naar het antwoord neemt, bewaakt de weg niet
   die de app loopt.** De unit-test hierboven vroeg `roomIdFor` — de functie
   die ik net geschreven had, die rechtstreeks in `rooms` kijkt — en was
   groen terwijl de hele feature onbruikbaar was. De e2e-zaak die de knop
   indrukt en daarna kijkt of er íéts veranderd is, vond het in één run. Als je
   een nieuwe weg naar een bestaand ding bouwt, meet dan de **bestaande**
   lezers, niet de nieuwe.

En een derde, die §84 een trapje hoger zet. Die regel luidt "meet elke knop,
houd geen lijstje bij", en de e2e-zaak die dat doet vond in §85 en §86 allebei
iets. Toch liep hij langs het raakvlak dat op `/uitdelen` het vaakst aangeraakt
wordt: het `<label>` om een vinkje, 25 px hoog. Het is geen `.btn` en geen
`input`, dus het stond in geen enkele selector. **Het lijstje van *soorten* is
ook een lijstje** — meet wat een vinger raakt (`label:has(input[type=
"checkbox"])` hoort erbij), niet wat toevallig een knop heet.

### §85: een test die "stuk" roept terwijl het werkt, kost net zoveel

Ronde 46 vond zeven dingen, en **twee ervan zaten in de tests van ronde 45**.
Dat is het deel dat het opschrijven waard is, want §84 had net vastgelegd dat
een UX-regel die niet gemeten wordt slijt — en dan is de meting zélf het
volgende dat kan slijten, zonder dat iemand het merkt.

1. **Meng nooit documentcoördinaten met venstercoördinaten.**
   `locator.boundingBox()` meet vanaf de bovenkant van het *document*;
   `document.elementFromPoint(x, y)` leest vanaf de bovenkant van het *venster*.
   Bij scrollpositie 0 zijn ze gelijk, dus een zaak die ze door elkaar haalt is
   maandenlang groen. §84's telefoon-zaak deed dat én sloeg knoppen over
   waarvan de onderkant voorbij 844 px lag — terwijl de tabbalk vastgeplakt de
   ónderste 56 px bezet, dus een knop die daarin landt is in beeld én bedekt.
   Zolang elke knop 34 px was viel er niets in die band; §85 zette ze op 44 px
   en de zaak begon te schreeuwen over een scherm waar niets mee was. **Scroll
   waar je naar kijkt eerst naar het midden van het venster en meet daarna** —
   dat is wat een duim ook doet, en het maakt allebei de stelsels hetzelfde.
2. **`.first()` in een zaak die zijn eigen fixture maakt, is bijna altijd fout.**
   `getByTestId('winkel-koop').first()` klikt op de bovenste rij van de winkel,
   en de winkel is het **hele archief** — dus de zaak over het grootboek kocht
   het stuk huisraad dat de zaak erboven net gemaakt had, en viel om op een naam
   die klopte. Filter op de naam die je zelf gestempeld hebt. Hetzelfde geldt
   voor elke lijst die door andere zaken gevuld wordt: de hal, de catalogus, de
   uitdeler.

En een derde, over de code: **een klasse heeft soms twee lezers.** `.plek-cover`
kreeg een vaste hoogte voor de tegel, en `.winkel-cover` draagt dezelfde klasse
op 3rem breed — dus elk omslagje in de winkel werd een staande streep van 3 bij
6,4 rem, terwijl het in de kamer precies goed stond. Dat is §83's les in een
stylesheet in plaats van in SQL: **een tweede lezer van hetzelfde ding beweegt
niet mee.** Sleutel de maat aan de context die hem nodig heeft (`.plek
.plek-cover`) en zet er een test op.

### §80: a lock needs a slot on the outside of the door too

`createEntry` refuses a `keeper_made` soort for anybody else — the lock. The
sheet is supposed to leave that soort out of a player's list — the slot. Round
41 shipped the lock, wrote a comment in `lib/entries/service.ts` saying the
sheet already did its half, and it did not: a speler was offered *Huisraad*,
typed a name, pressed Aanmaken and was told off for taking what they had been
shown. Unit tests cannot see that; the browser found it in one run.

When you gate a write, walk the screen that leads to it — and never write a
comment claiming the other half exists without opening it.

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
  `characters.spec.ts` do. The same holds for *Op prikbord prikken* on an
  artikel (golf J): *Nieuw prikbord 'X'* stands before the walls have arrived
  and carries the typed name, so filter it out with
  `hasNotText: 'Nieuw prikbord'` (`round-6.spec.ts`).
- **`?new=1` lands on the editing face**, where the artikel's name is the title
  box `#entry-name` and there is **no heading at all**. Assert
  `toHaveValue(name)`, not `getByRole('heading', { name })` — and never a bare
  `getByText(name)`, which matches the `<code>@handle</code>` the page also
  prints. **And since §90 it puts the caret in the running text** as soon as
  the editor is there (it polls for up to about six seconds), unless a key, a
  press or a focus somewhere on the page came first. A spec that lands on
  `?new=1` and then goes on with `page.keyboard` should click where it means to
  type first. Otherwise a key pressed before the editor arrives stops the
  caret from being given and lands on `<body>` (an `n` there opens "Nieuw
  artikel"), and a key pressed after it lands in the body text.
- **The login redirect carries `?next=`** (§90). A signed-out `goto('/e/x')`
  ends on `/login?next=%2Fe%2Fx`, not on `/login`. Expect
  `/\/login(\?next=[^&]*)?$/`, as `sloten.spec.ts` does. Only `/` goes without
  one.
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
- **A new notitie lands chosen *and* with the caret in its text** (§90), and
  Escape peels one layer at a time. Letting go of a notitie you just made
  therefore takes **two** Escapes: the first leaves the text, the second
  clears the choice. Press it inside a `toPass()` until the inspector is gone,
  as `round-37-pinch.spec.ts:46` now does. A spec that counts on one Escape
  goes red on the phone project. A punaise made from the bar also lands
  chosen, with the caret in its label (`#pin-label`), so do not assume the
  focus is still on the button.
- **The nieuwe-gebeurtenis sheet arrives with a date already in it** (§90): the
  middle of the stretch of axis on screen, selected, so typing a year replaces
  it. A spec that gives only a year and a month must *empty* the day rather
  than leave it alone, or the proposal's day stays. `fillDate` in
  `tests/e2e/timelines.spec.ts` fills every part and writes `''` for a part it
  was not given. Copy that.
- **The canvas's "Nieuw artikel" needs Bewerken on a phone** (§90). A tap on a
  notitie in Lezen no longer makes an artikel (`canMakeEntry` asks the mode),
  so a spec that presses a card's *aanmaken* after a `reload` calls
  `editCanvas(page)` first, as `round-24.spec.ts` now does.
- **The kamer door is `yours-kamer`, not `shell-beurs`** (§91). The beurs pill
  in the corner is gone at every width; a spec that still looks for
  `shell-beurs` finds nothing, and `ronde-52-jouw-plek.spec.ts` asserts that it
  stays that way. On a desk the door is *Kamer* in the side menu, with the
  saldo in `yours-saldo` (`data-balance`); the other doors are `yours-winkel`,
  `yours-mine` and `yours-spelers`, inside `nav-yours`. `kamer-ux.spec.ts`
  case 1 is the worked example.
- **On a phone the Jij tab is a *button*, and what `/you` used to show first is
  the Jij-blad** (§91). `getByRole('link', { name: 'Jij' })` finds nothing
  there. Use `getByRole('button', { name: 'Jij', exact: true })` in the
  `Tabbalk` navigation, or `getByTestId('tab-jij')`. It opens a dialog named
  *Jij* (`jij-sheet`) and goes nowhere. The saldo is `tab-jij-saldo`. The doors
  are `jij-kamer`, `jij-winkel`, `jij-mine`, `jij-spelers` and
  `jij-settings` (the only road to `/you` from the tab bar), and for a Keeper
  `jij-admin`, `jij-uitdelen` and `jij-flip`. Close it with Escape and wait for
  `jij-sheet` to be gone before touching the page behind it.
- **Who you are, on a phone, is read in the Jij-blad** (§91). The side menu is
  `display: none` below 768 px, so `.who` in the `Hoofdmenu` navigation is
  attached and never visible there. Open the tab and read
  `jij-sheet` → `.jij-who-name`, as `characters.spec.ts:294` does (in "a fresh
  window is asked at the first edit").
- **`.who-writing` is absent in the shell unless this window chose somebody
  else** (§91). A spec that used to read the account's karakter off *Je
  schrijft als* in the side menu now asserts `toHaveCount(0)` there. On `/you`
  the line always stands (`WritingAsLine always`). And *Je speelt als* in the
  side menu is `visually-hidden`: `getByText('Je speelt als')` is attached and
  never visible on a desk.
- ~~**`/` on a desk puts the caret in the side menu's search box; it does not
  navigate** (§91). A spec that presses `/` and waits for `/search` only holds
  on a phone. On a desk, type into `nav-search` and press Enter, which lands on
  `/search?q=…`.~~ **Since §100, `/` and Ctrl/⌘K open the palette**, on a
  desk and a phone alike: a dialog (`data-testid="palette"`) with its box
  `palette-input`. `nav-search` is a button that opens it, and so is
  `jij-palette` in the Jij-blad. The last option, `[data-option="search-all"]`,
  goes to `/search?q=`. Find an option inside its group
  (`[data-group="others"|"entries"|"recent"|"actions"]`), because one name can
  be in two groups.
- **The save word is one `.save-state` in `.live-strip`, per page** (§100),
  not one in the page and one in a sheet. `.ink-saving` on the ink bar is a
  hidden marker now, still there for a spec to wait on. And do not rename an
  artikel while offline in a spec: a new name is a new slug, the page follows
  it to its new address, and with the line down that is a navigation into
  nothing. Type into the korte beschrijving instead, as the offline case in
  `ronde-61-palet.spec.ts` does.
- **Start prints your own last three artikelen above the welcome** (§91,
  `home-jij-recent`). An artikel you just wrote is therefore on Start **twice**,
  once in the Jij-rij and once in the feed, and a bare `getByText(name)` on `/`
  matches both. Scope it to `home-jij` or to the feed.
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
- **A canvas clips, so press "Alles in beeld" before you look for anything**
  (§66). A stamboom lays new cards out around the whole tree, and something
  added at the third generation is simply off the glass — `.tree-stage` has
  `overflow: hidden`, so the locator is *attached* and never visible. Fit the
  view first, then assert.
- **An SVG line has no height as far as Playwright is concerned.** A horizontal
  `<path>` has a bounding box of zero height whatever its stroke, so
  `locator.click()` calls it invisible and waits for ever. Find the middle of
  its hit area yourself, check with `document.elementFromPoint` that nothing
  else is standing on it, and click with `page.mouse` — inside a `toPass()`,
  because a card still sliding to its new place is over the line for a beat
  (`clickLine` in `tests/e2e/family-trees.spec.ts` is the worked example).
  **And the middle of the box is the wrong point for a sibling line** (§67): it
  runs along a generation row, so everybody else born in that generation stands
  between its two ends and its midpoint is reliably *under* somebody's card.
  Walk the path instead — `getPointAtLength` at a handful of fractions, mapped
  to the screen through `getScreenCTM` because the drawing hangs under a CSS
  transform — and take the first point `elementFromPoint` says is still the
  line's (`clickLine` in `tests/e2e/family-trees-33.spec.ts`).
- **On a phone the infobox is a folded `<details id="block-info">`**, and since
  §92 (round 53) it is folded while *reading* too, with a `FieldsPeek` under
  it (until then it sprang open while reading). A spec that reads a fact on a
  phone opens it first, and a spec that switches to the editing face still
  finds every field attached, laid out and `hidden`. Call `openInfobox()`
  (`family-trees-33.spec.ts`) before touching a field — it is a no-op at
  1440 px, where the same block is a `<section>` — and press the summary until
  `details.open` answers true, because a page that has just switched faces is
  not listening yet and a second click folds it back up. **Since golf J
  `infobox-peek-tags` stands under the folded infobox on a phone**, with real
  `a.tag` links, whether or not a field is filled.
- **A card being visible is not `window.__tree` knowing about it.** The seam is
  put up by an effect, so straight after a reload — and reliably under
  `E2E_DEV=1`, where a dev build compiles on the way in and every render
  happens twice — the drawing is on the glass a beat before it can be asked
  about. Poll it (`treeNodeReady`), and read every id and slug **off the glass
  before navigating away**: after a `goto` there is no seam to ask.
- **For an artikel the Keeperkant *is* the §9 visibility.**
  `sideCondition('entry')` reads `visibility = 'keeper'`, and a suggest list is
  sided (§50), so a Keeper standing on the players' side cannot find a
  Keeper-only artikel in any picker at all. A spec that needs a link to a secret
  writes the link **first** and hides the artikel afterwards — which is also the
  honest order: a Keeper writes a family down and then decides one of them is
  not for the table yet.
- **A hand that stops moving stops being heard.** A pointer frame is sight, not
  state: eight seconds still and it is swept off every screen. A spec that
  asserts somebody else's cursor has to keep that somebody moving *while* it
  asks — and the other browser must believe it is not alone (§60), so it needs a
  second real page on the same place.
- **Anything floating over a canvas that can be pressed must be in the stage's
  pointer-down allowlist.** The stage takes the pointer capture on the way down,
  so the `click` that follows is retargeted to the stage and the button is not
  merely panned under — it is *unpressable*, and the press then reads as a press
  on bare paper. See the `target.closest('.tree-node, .tree-handle, …')` list in
  `FamilyTreeCanvas.tsx`; add to it whenever you add a floating control.

- **A phone opens every canvas in Lezen** (§73), and a reload is Lezen again —
  nothing is remembered. A spec on the `phone` project that drags, makes, draws,
  deletes or presses Ctrl+Z calls `editCanvas(page)` after **every** `goto` and
  `reload`. `newBoard`, `newCaseBoard` and `newCaseFamilyTree` already do. The
  server renders the switch as Bewerken; `editCanvas` waits for `data-ready` on
  it, which is the client's own answer — a spec that reads `aria-checked`
  before that reads the server's guess and returns just before the phone turns
  to Lezen. Some specs also wait for a Bewerken-only control to appear
  (`tree-add-loose`, `Speld zetten`), which is the belt to that pair of braces.
  **Since §94 (round 55) a canvas you just made opens in Bewerken** (`?new=1`,
  stripped a frame later), so a spec that tests §73's Lezen on a fresh canvas
  reloads first. `editCanvas` stays harmless on a canvas that is already in
  Bewerken.
- **A reload keeps the choice and the camera** (§94). The choice is in the
  address (`?card=`, `?pin=`, `?event=`, `?node=`) and the camera in this
  tab's `sessionStorage`. A spec that wants a *fresh visit* opens the bare
  path (`page.goto('/timelines/x')`, not `reload()`), and one that wants the
  original camera presses *Alles in beeld* first. The ink specs set the camera
  back before they reload, for this reason. And an opening view is a
  readable fit on the prikbord and the stamboom, not "everything": press
  *Alles in beeld* before asserting that a far card is visible.
- **Finding on a canvas is a loep on a phone** (§94). The box is behind a
  44 px `.canvas-find-toggle`; press it before you fill. On the prikbord in
  Bewerken the find is not a box at all but the *Op dit prikbord* group at the
  top of the `BoardPicker`. Since §105 the landkaart (`map-find`) and the
  tijdlijn (`timeline-find`) have the loep too, at every width.
- **On a phone the maker is the `+` in the corner, and Lezen has no undo in
  view** (§105). `getByRole('button', { name: 'Speld zetten' })` still finds
  it (Bewerken only); `page.locator('.canvas-make')` finds it on any canvas.
  In Lezen on the phone project *Ongedaan maken* is `toBeHidden()`, still
  `disabled` with `includeHidden: true`. The switch's words are hidden on a
  phone: find the radios by name, never by `getByText('Bewerken')`. The zoom
  readout `.canvas-zoom-level` is `display: none` on a phone — `toHaveText`
  still reads it, `toBeVisible` does not.
- **A peek closed with the cross is in the DOM for `--dur-3`** (§105), with
  `data-closing`; wait on `toHaveCount(0)`. Escape is immediate. A peek whose
  body does not overflow says `data-groeit="nee"` and stays small after a
  swipe up; assert that, not `is-full`.
- **On a phone the prikbord's selection is a peek** (§105, review 4 H1):
  `.board-peek`, closed with *Selectie loslaten*. The lade *Uit het dossier*
  starts shut there; press `.board-tray-spine` to open it (as
  `board-strings-borders.spec.ts` does).
- **On a phone *Alles tonen* on a tijdlijn is in the gear's sheet** (§105,
  M2). `timelines.spec.ts` and `timeline-coop.spec.ts` each have a local
  `allToggle(page)` that returns `timeline-toggle-all` visible on either
  project (it opens `timeline-settings` when the button is not in the bar);
  copy it rather than clicking the testid bare.
- **An empty landkaart or tijdlijn is a strook, not a card** (§105, H3):
  `[data-testid="canvas-leeg"]` with `.is-strook`, at the foot on a desk and at
  the top on a phone. Only its button takes a press; a drag across it pans.
- **In Bewerken a tap on the glass asks nothing any more** (§105, golf J):
  choosing a card, a speld or a tag is reading, and a link (*Artikel openen*)
  never asks. A spec that wants to meet the question on a canvas drags a
  thing, presses a maker or double-clicks bare paper (`ronde-51-canvas` C1,
  `golf-j1-vlakken`).
- **On a phone the web opens from `?focus=` with the peek full**
  (`data-peek="full"`, golf J); after choosing a row it is small again, with
  *Openen* in view.
- **The new-entry sheet is name first, then a soort strip** (§92). The name box
  is on top and has the focus; the soort is a scrolling row of radios with
  *Alle soorten* to fold it out, so `getByRole('radio', { name, exact: true })`
  still works, but a soort scrolled out of view is attached and not visible
  until the strip scrolls it in. The sheet keeps a draft of name and
  description (`DRAFT_ENTRY`, §69), so a spec that opens it twice in one page
  finds what it typed the first time. **Since golf J the soorten fold after
  whole rows** (§92), two on a desk and three on a phone, instead of
  scrolling sideways: `data-folded="ja"` on the strip, and *Alle soorten*
  exists only when something is folded. A radio under the fold is still
  clickable (Playwright scrolls the strip), but not visible to a person.
- ~~**A short box shows chips while it has no focus** (§92). Its raw text,
  brackets included, is in the box and visible only in focus; out of focus
  `[data-testid="mention-preview"]` draws it. Assert `toHaveValue` on the box,
  or press Tab away and look at the preview.~~ ~~Since §95 that is true only of
  the boxes that still write `[[Naam]]` (a kaartje, a speld, a gebeurtenis,
  the maakbladen of a landkaart, tijdlijn and stamboom). Never click a chip to
  put the caret in the box, in either kind: a chip is a link.~~ **Since §98 no
  box writes `[[Naam]]`, and in Bewerken a click on a chip puts the caret
  after it and the page stays** (Ctrl/⌘-click opens it in a new tab). Open an
  artikel from the reading face. `#pin-text`, `#event-text`,
  `#new-event-text`, `#overzicht-lead`, the omschrijving boxes and
  `.board-card-text-input` are `contenteditable`s now: read them with
  `boxValue`/`expectBoxValue`. Typing into a box that already holds words
  types at the end, after a space.
- **The korte beschrijving, a samenvatting and an infobox Tekst / Lange tekst
  are a `contenteditable` since §95**, not an `<input>` — `inputValue()`
  throws on one and `toHaveValue` never passes. Read them with `boxValue` /
  `expectBoxValue` from `tests/e2e/helpers.ts` (they read `.value` off a real
  input and `innerText` off an editor, so one helper serves both).
  `fillWhenReady` already goes through `boxValue`, and `locator.fill()` works
  on the editor. The old ids are on the editable element (`#entry-lead`,
  `#case-summary`, `#field-<key>`, `#new-entry-description`,
  `#new-case-summary`). The chip is
  `.short-chip` **inside** the box, and there is no raw `[[…]]` to assert in
  focus any more. The name list is the rich editor's `SuggestionPopup` now,
  but it keeps `data-testid="mention-pop"`. `End` goes to the end of the
  *visible* line in a wrapped box, not of the text. And the *Nieuw artikel*
  sheet keeps an unsent draft (§69), ~~chips included, so a spec that opens it
  twice in one page takes `.last()` of the chip it just made~~ as **words**
  since §98 (`chipsAsWords`): a spec that opens it twice finds the name it
  typed, not a chip.
- **A chip in the running text is an `a.entry-chip` drawn by a node-view**
  (§97), and it appears only once its name is known (from the page's
  `ShortChips` or a fetch). A chip the reader may not follow is an empty
  `a.entry-chip-none`: assert that, not a name. `.ProseMirror` matches more
  than one editor on an artikel; scope it to `.entry-body-block .ProseMirror`.
  A body posted through the API with `{ id, label }` links still works: the
  server turns them into handles.
- **An empty infobox field in Bewerken is behind *+ Veld invullen*** (§101,
  B25) when two or more were empty on opening. A spec that fills one calls
  `openEmptyFields(page)` first (after `openInfobox()` on a phone).
- **Open *Nieuw artikel* with `openNewEntry(page)`, never with `n`** (§101
  naden). On an artikel just made the caret is in the text, so `n` is a
  letter, and before the shell hydrates it is nothing. `openNewEntry` presses
  the button until the dialog answers and returns it.
- **On a phone the `+` is gone while a caret is in a writing box of the
  page** (golf J, j2, §90): after *Aanmaken* (`?new=1`, the caret is in the
  text), or wherever a spec clicked into a box. `openNewEntry` and
  `becomeInvestigator` tap out of the text first. A spec that presses the
  button itself uses **`pressNewEntry(page)`**, never a bare
  `newEntryButton(page).click()`; a loop of its own calls
  **`releaseCaret(page)`** before each press (both in `helpers.ts`; on a desk
  they do nothing). And a spec on Start for a speler without an onderzoeker
  never presses `n`: on a desk the caret is in *Wie ben jij aan tafel?*
  (`wie-naam`), so `n` or `/` types into the box. `article-faces` and
  `entry-live` still press `n` (see §8).
- **A button that fires a server action and changes the screen at once is
  not done when the screen changes** (golf J). Wait for the action's answer
  (`waitForResponse` on a POST with a `next-action` header) before a `goto`,
  or the navigation overtakes it (`round-49-naam-en-icoon.spec.ts`, the
  favicon's *Verwijderen*).
- **The author question comes once per window** (§18b), and
  `becomeInvestigator` has already answered it. A spec that wants to meet it
  does `page.evaluate(() => sessionStorage.clear())` and then a `goto`. A
  Keeper is never asked. **Since §106 (golf I, H5) a speler with exactly one
  onderzoeker is not asked at all**: the window writes as that one and shows
  *Je schrijft als …* once. A spec that means to meet the question gives the
  account a second one first with `keeperHandsOutSecond(browser, account)`
  from `helpers.ts` (the Keeper makes one and hands it out, over the API), as
  `characters.spec.ts` (two cases), `ronde-64-meting.spec.ts` #3 and
  `ronde-51-canvas.spec.ts` C1 now do.
- **Escape cancels the blocking author question** (§101, ronde 64): nothing is
  made, the caret goes back, and the next key or press asks again.
  `characters.spec.ts` used to record that it stayed; it now records this.
- **Tab from a sectie's title lands in that sectie's text** (§101), not on the
  bin. And there is no FAB on `/winkel` any more, ~~while `/admin` has one
  again~~ and since golf I (§107, M10) none on `/admin` either.
- ***Alles in beeld* on a single kaartje is 250 %**, so a stamboom spec that
  wants two generations on the glass zooms out first.
- **On the prikbord the Keeper's tekenlaag switch is in
  `#board-ink-underfold`** (§99), below the canvas, not in the Rechten sheet.
  On a phone the prikbord's maker buttons are icons only, with their names
  kept, so find them by role and name.
- **A new stamboom opens at zoom 1** (§99), not at a fit: the top-left corner
  of a los kaartje is then its pencil, so a spec that clicks a loose card
  clicks bottom-left (`canvas-contract.spec.ts`).
- **The maat of a new tijdlijn is a row of chips** (§99, C15), still radios:
  `getByRole('radio', { name, exact: true })` works.
- **A picker helper waits for `data-answered="ja"`** (§93) before it judges
  which tab the plek-kiezer landed on. The picker opens on *Wat je al hebt* and
  switches to the catalogue only once its answer is in (K29), so a helper that
  looks straight away sees the wrong tab (`huisraad.spec.ts`).
- **A new soort in Beheer opens itself** (§96). Clicking its summary after
  making it *closes* it. Assert `toHaveAttribute('open', '')` instead of
  clicking.
- **Fingers go through CDP, and a released finger is named.**
  `Input.dispatchTouchEvent`: `touchStart`/`touchMove` list every finger that
  is down, and `touchEnd` lists **the finger that leaves** — leaving it out of a
  `touchMove` does not release it, and an empty `touchEnd` releases all.
  `tests/e2e/round-37-pinch.spec.ts` is the worked example. And put the fingers
  on bare paper with `elementFromPoint` first: a finger that lands on a docked
  inspector is a scroll, and the browser answers it with `pointercancel`.
- **On a phone a canvas's panel is a `.canvas-peek` with its own `Sluiten`**
  (§74), so scope any `Sluiten` locator to the dialog you mean.
- **Een vertraagde navigatie tekent alleen `.nav-progress[data-shown="1"]`**
  (§102); `nav-skeleton` bestaat sinds golf M niet meer, en de oude pagina
  staat er nog tot de nieuwe er is. Wacht na een
  `goto` niet op `networkidle`: de live-lijn staat altijd open.
- ***Wie is er?* heeft op elke rij `roster-go` (*Ga naar*) en `.roster-ask`
  (*Kom kijken*)**, altijd in beeld, en de uitnodiging heeft `nudge-go`
  (*Ga*) (§76, golf M). Een plek gaat pas de lijn op na 700 ms stilte
  (`SPOT_SETTLE_MS`): wacht tot de `href` van de deur `?waar=` draagt, zoals
  `golf-m-aanwezig.spec.ts` doet. Het prikbord heeft geen eigen rij
  schijfjes meer; de strip van de schil staat er.
- **Een venster op een tijdlijn waarvan de tag buiten beeld is, bestaat niet
  als `.timeline-popout`** (§62, golf M): het blijft open maar wordt niet
  getekend. Een spec die vensters telt, drukt eerst *Alles in beeld*.
- **Op een landkaart die de kijker niet mag bewerken, is er geen
  Lezen/Bewerken-schakelaar en geen *Speld zetten*** (§40, golf M), en de
  API antwoordt 403. `edit_mode` begint op `'private'`: een spec die een
  speler een speld laat zetten, zet de kaart eerst op *Iedereen*.
- **Een blad dat je met het kruisje sluit, is nog 150 ms in de DOM**
  (§102), met `data-closing` en `inert`. Wacht op `toHaveCount(0)` of
  `toBeHidden()`, niet op een vaste pauze; met Escape is het meteen weg.
- **De voorbeeldkaart is `data-testid="preview-card"`** (§102). Hij komt
  500 ms nadat een muis op een chip rust, vangt de muis pas als die de chip
  verlaat (`data-reach`), en zijn link is `preview-open`. Een spec die een
  cross-document overgang bewijst, luistert naar `pagereveal` in
  `page.addInitScript` (dat loopt vóór het script in de `<head>`) en wacht op
  `viewTransition.ready`. Zie `ronde-65-kaartje-omslag.spec.ts`.
- **De breedte van de strip is die van de kolom** (§102, herstel). Een spec
  die kolombreedtes vergelijkt, laat beide kijkers eerst op dezelfde pagina
  staan en elkaar zien (`ronde-65-herstel-schil.spec.ts` #3): de schijfjes en
  de telling in *Wie is er?* maken de float breder.
- **De koopknop in de winkel draagt de volledige zin als toegankelijke naam**
  (§103), *Kopen · n munten → plek*, en als zichtbare regel alleen *Kopen →
  plek* (`.koop-regel > span[aria-hidden]`). De prijs staat in `winkel-prijs`.
  `toContainText('Kopen voor X')` werkt dus nog op de naam. Na een klik is er
  kort `winkel-gekocht` en `data-bought="ja"` op de knop.
- **Een koop in de winkel wisselt zijn rij pas na ±650 ms** (§103, herstel):
  de knop houdt de live-verversing vast tot *Gekocht* gezien is. Wacht op
  `winkel-owned` met een ruime timeout, niet op een vaste pauze. ~~Het saldo in
  de schil beweegt ook zo laat; de melding met −n komt meteen.~~ Sinds golf H
  rolt het saldo met de melding mee (`announceBalance`); zie hieronder.
- **Een leeg *Genoemd in* of *Geschiedenis* is een `p.blok-leeg`** (§104,
  herstel; `data-testid="genoemd-in"`, `data-leeg="ja"`), geen `details`, en
  staat niet in de inhoudsopgave. Een artikel op de telefoon heeft
  `entry-waar` in plaats van de rijen "Op de landkaart / In:"; klap die eerst
  open. ~~Op een telefoon is de omslag `.entry-cover-liggend`.~~ Sinds golf K
  is de omslag op elke breedte `.entry-cover-whole` (met `img[width][height]`
  als de grootte bekend is); `.entry-cover-liggend` bestaat niet meer. Een
  staande omslag duwt op een telefoon de eerste zin onder de vouw: meet vanaf
  de onderkant van de plaat, niet vanaf een vast getal.
- **Een lange lijst in de wiki toont er 120** (§104, herstel) en zegt "n van
  totaal" met *Meer*. Een spec die er meer wil zien, gaat naar `?per=` of
  `?pagina=` (`lib/wiki/pagina.ts`), niet naar een scroll.
- **De Keeperkant-knop in een desktop-spec is de schakelaar in de mast**
  (§102, golf H). `getByTestId('side-toggle')` werkt nog; `.side-toggle` heeft
  op een computer `toHaveCount(0)`, en `masthead-side` is op de Keeperkant de
  Keeper-helft van die schakelaar. De cirkel begint op de helft waar je heen
  gaat, niet in het midden van de knop.
- **Een tijd tot `data-pending` meet je vanaf een listener op `window` in de
  capture-fase** (§102, golf H): `NavProgress` zet het teken in de capture-fase
  op `document`, en een `MutationObserver` loopt tussen twee listeners.
- ~~**Een streep zonder skelet vraag je nu aan Beheer of Zoeken** (§102, golf H,
  T7): Dossiers, Prikborden, Landkaarten, Tijdlijnen, Stambomen, Spelers,
  Start en de wiki hebben een skelet.~~ Sinds golf M is er nergens een
  skelet; elke vertraagde navigatie is de streep.
- **De dichte plekken staan niet meer in `getByTestId('kamer-grid')`** (§103,
  golf H) maar in `kamer-dicht`. Let op: de CSS-klasse `.kamer-grid` staat op
  allebei de lijsten, dus zoek op de testid. Een telefoon verbergt in
  `kamer-dicht` alles behalve de eerstvolgende per soort (`data-rest`) tot
  `kamer-dicht-vouw` open is. Tegelhoogtes zijn gelijk per raster, niet over de
  twee heen.
- **Het saldo in de schil verandert met het antwoord van een koop** (§103,
  golf H), vóór `data-balance`, dat pas met de verversing komt. Wacht op de
  tekst van `.saldo-getal` of op `saldo-chip`, niet op `data-balance`, als je de
  chip wilt zien (`ronde-66-het-geld-klinkt.spec.ts`).
- **Een munt-melding van de Keeper is `.toast-munt`** (§103, golf H); de hele
  zin staat er visueel verborgen in, dus `toContainText('+12 munten van de
  Keeper — …')` werkt nog. Twee giften kort na elkaar zijn één melding.
- **Tussen 1280 en 1499 px is er geen `.entry-rail`** (§104, golf H). De
  wegwijzer is dan ~~`.entry-main .entry-outline-row`~~
  `.entry-kop .entry-outline-row` (sinds golf J); het Desktop-project van
  Playwright (1440) heeft dus geen rail. Een spec die de rail wil, zet de
  viewport op 1600 (`round-7.spec.ts`).
- **Since golf J the head of an artikel is `.entry-kop`, not inside
  `.entry-main`** (§104, j4): `.entry-kop .entry-head`; `.entry-main` is the
  text. Before hydration there is a `.entry-rail` (hidden) at 1280–1499 px, a
  `details#block-info` on a desk and in Lezen a `.vooraf-tekst` that carries
  `.ProseMirror`; they go with the hydration, so `toHaveCount(0)` needs its
  auto-wait. Wait for the editor with `[contenteditable="true"]` or
  `.ProseMirror:not(.vooraf-tekst)`, never a bare `.ProseMirror`.
- ~~**Een soort staat niet altijd als tab in de rij** (§104, golf H, D6).~~
  **Sinds golf N staat elke soort als tab in de rij**, die breekt;
  `meer-soorten` bestaat niet meer (`toHaveCount(0)`). Een lege soort is een
  gedempte tab (`.type-tab.is-leeg`).
- **Een speler ziet waar de Keeper is** (§76, golf N): de rij van de Keeper
  heeft `roster-go` als de speler daar mag komen, en geen deur op Beheer of
  een Keeperartikel (`golf-n.spec.ts`).
- **De dossiertabs breken nog steeds** (ronde 36, bevestigd in golf h4). Alleen
  de soorttabs van de wiki en de chips op `/search` zijn één rij.
- **Op een telefoon staan de regels "Op de landkaart / Op de tijdlijn / In:" achter
  `entry-waar`.** Een spec die daar een link zoekt, roept eerst
  `openEntryWaar(page)` aan uit `helpers.ts`. Op een computer doet die niets.
- **De + wijkt alleen voor een scroll van de hand** (golf h4, `FAB_HAND_MS`).
  Een spec die met `mouse.wheel` scrolt, ziet hem weggaan. Na `scrollIntoView`
  blijft hij staan. ~~Na een caret in de tekst ook.~~ Sinds golf J (§90) wijkt
  hij op een telefoon wél zolang er een caret in een schrijfvak staat, en is
  hij dan `visibility: hidden`; zie `pressNewEntry` hierboven.
- **Een lege *Dossiernotities* in Lezen is `case-notes-leeg`** (§104, golf H),
  een `p.blok-leeg`, geen editor. De knop in het menu op een dossier toont
  *Nieuw in dit dossier*, met *Nieuw artikel in dit dossier* als
  toegankelijke naam.
- **Een nieuwe speler landt op Start met *Wie ben jij aan tafel?*** (§106,
  golf I, `wie-ben-jij`), niet met de banner: `no-author-banner` staat niet op
  `/`, wel elders, als één regel met `no-author-door`. `becomeInvestigator`
  werkt nog zoals het was. Wie de nieuwe weg wil: `wie-naam`, `wie-ga`, dan
  `wie-welkom` (met `wie-welkom-schrijf` en `wie-welkom-kamer`). Zolang het
  welkom staat, is `home-jij` verborgen: hij is er wel (`toBeHidden`, niet
  `toHaveCount(0)`). **Sinds golf J staat de caret op een computer al in
  `wie-naam`** (alleen bij `(pointer: fine)`): een spec die daar `n` of `/`
  drukt, typt in het vak. Op het `phone`-project krijgt het vak geen focus;
  `golf-j3-eindjes.spec.ts` tikt het daar aan.
- **Bij het eerste bezoek aan de eigen kamer, de winkel en de wiki staat
  `eerste-bezoek` boven de inhoud** (§106, golf I), alleen voor een account
  jonger dan 14 dagen. In de fixture is elk account nieuw, dus de regel staat
  er in elke spec bij het eerste bezoek. Een spec die klikt en daarna de muis
  laat liggen, kan op een andere plek uitkomen dan zonder die regel; beweeg de
  muis weg voor een Escape als er een naam onder kan liggen (de voorbeeldkaart
  pelt eerst), zoals de zaak van de plek-kiezer in `kamer-ux.spec.ts` (:506)
  nu doet.
- **Een lege lijst heeft `[data-leeg="<plek>"]`** (§106, golf I), en een lege
  lijst zonder filter heeft geen sorteerbalk. Een dossier op een telefoon heeft
  geen tabbladen: zoek de lege staat op `[data-leeg="prikbord"]`, niet in
  `getByRole('tabpanel')`.
- **Beheer op een telefoon heeft na een keuze geen tabs** (§107, golf I).
  Kaal `/admin` is daar de index; een spec op het `phone`-project kiest een
  onderdeel via de index of via het adres (`/admin?tab=users`,
  `/admin?tab=audit`, `/admin?tab=trash`). Een tweede tab klikken na een keuze,
  of na een reload met `?tab=`, kan daar niet. Welk onderdeel open staat, lees
  je aan `.beheer-paneel[data-tab]`. **Sinds golf J kan er een tweede
  `.beheer-paneel` in de DOM staan**, met `hidden`, zolang een ander
  onderdeel iets niet-bewaards heeft: lees het open paneel als
  `.beheer-paneel:not([hidden])`. En op de index staat op een telefoon de
  uitnodiging bovenaan (`index-uitnodiging`, knop `index-invite-kopieer`);
  niet de hele index past nog op het eerste scherm, Gebruikers tot en met
  Woorden wel. `golf-i3-beheer.spec.ts` meet dat nu zo. Vanaf 1180 px zijn de tabs de
  linkerkolom (`beheer-index`); `getByRole('tab', { name })` werkt op elke
  breedte, want de naam is alleen het label (plus het getal). `flow-5-keeper`,
  `sloten`, `round-6` en `ronde-57-zoeken-en-beheer` gaan via het adres;
  `ronde-51-canvas` C30 leest `data-tab`.
- **Het opslaan-woord van een soort en van Woorden staat in de schil**
  (§107, golf I): wacht op `getByTestId('save-state')` met
  `data-save="saved"`, niet op een tekst in de voet (`board-live.spec.ts`,
  `phase4-pages-and-words.spec.ts`). De telling lees je in `soort-voet`
  (*Alles bewaard*, *n niet opgeslagen*).
- **Nieuw wachtwoord is een blad** (§107, golf I):
  `page.getByRole('dialog', { name: 'Nieuw wachtwoord voor <naam>' })`, niet
  `row.getBy…`. Na *Instellen* is het blad weg en staat *Nieuw wachtwoord
  ingesteld.* in de rij.
- **Een veld met keuzes of doel-soorten staat dicht** tot je het opent
  (`.veld-samenvatting`, *Instellen*), behalve een nieuw veld of een veld dat
  net van soort wisselde. `Keuzes van veld n` en `veld-soorten` bestaan dus
  niet voor een dicht bestaand veld (§107). **Sinds golf J is `veld-soorten`
  een `SoortKiezer`**, net als de soortenlijsten van de pagina, `blok-kijk-in`
  en `blok-mag-erin`: chips met een kruisje en *Kies soorten*, geen rij
  chips om aan te vinken.
- **Wacht na *Terugzetten* in de prullenbak tot de rij weg is** voordat je
  navigeert (§107); anders kan de navigatie de terugzet afbreken
  (`round-36-bin.spec.ts`).
- **`/spelers` heet *Spelerspagina's*** (§107, L1), met een apostrof:
  `aanwezig.spec.ts` zoekt de link zo.

- **The voordeur of the wiki has the ordinary tab row** (golf K): Start,
  Alles and every soort (since golf N; no `data-rang`, no *Meer soorten*). There is no
  `.type-tab-naar` and no `#leeskamer-soorten-kop` link any more; a spec that
  counted "at most three links" there now counts more than three.
- **A pin on a landkaart is hit on its head** (golf K). `.map-pin` itself is
  `pointer-events: none`; only `.map-pin-head` and a visible
  `.map-pin-label` take a press. `locator('.map-pin').click()` still works
  (its middle is the head), but click `.map-pin-head` when labels may have
  moved. A label carries `data-label` (`onder`, `rechts`, `links`, `boven`,
  `weg`), and `.map-pins[data-labels="gemeten"]` says the placer has
  measured. A `weg` label is attached with opacity 0: `toBeVisible()` passes
  on it, so read `data-label`.
- **A long name on a tijdlijn is `.timeline-tag.timeline-tag-2`** (golf K),
  40 px high and two lanes deep. A spec that measures a tag's height or a
  lane's reach allows for it.
- **The new-entry sheet's button sits in `new-entry-actions`** (golf K),
  which is `.sheet-actions-stick` only when the soort has winkelvelden
  (huisraad). Its `Aanmaken` is then in view at the foot of the sheet on a
  phone.

If a spec fails once and passes on a re-run, it is the "not yet listening" race
— fix it with the helpers above rather than shrugging at it.

---

## 7. How work reaches the user

The user's working copy is `D:\GithubProjects\LoWWebsite` on a linked Windows
machine (it was `D:\LoWWebsite` up to round 33 — check `device_list_dir` rather
than trusting this line). There is no shell on that machine, so the loop is:

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
   **Round 29 deleted two files** and the delivery has to say so:

   ```bash
   git rm "app/api/boards/[id]/live/route.ts" "app/api/live/[room]/route.ts"
   ```

   The first one is the textbook case §7 warns about: it imports
   `subscribe`, `setPresence`, `readPointerFrame` and five other names that
   `lib/boards/live.ts` no longer exports, so a copy left on disk fails
   `npm run build`. The second is dead either way, but leaving it would serve a
   second live line that §60 exists to remove.
5. **Do not push.** The git proxy has no credential for this repo, and their
   working tree holds the same files uncommitted — a push would make their next
   `pull` fight their own tree. They commit locally.
6. Write a round note to the Claude project (`claude/round-N-….md`), in the shape
   of the existing ones: what was asked, what was decided and why, the rules that
   must not be broken, what was deliberately left undone, and the test numbers.

---

## 8. Leftovers — rounds 11, 12, 13, 17, 18, 19, 22, 23, 24, 25, 29, 31, 32, 33, 35, 37, 38, 46, 47, 48, 49, 51, 52, 53, 54, 55, 56, 57, 58, 59, 60, 61, 62, 64, 65, 66 and 67, and golf H, I, J, K, L, M and N

*Golf N (30 september 's ochtends; Nick: het patroon op het prikbord, de
Keeper die niet te volgen was, de tekst die de kolom niet vult, en *Meer
soorten*) is in één werkboom gebouwd, na drie vragen vooraf. Geen nieuw
nummer, geen migratie. **Twee bestanden zijn weg, en dat is werk voor Nick**
(§7): `git rm components/MeerSoorten.tsx lib/wiki/tabrij.ts`. De
rondenotitie is `claude/golf-n-de-ruimte.md`.*

**Leftovers — golf N, allemaal met opzet genoemd.**

- **Een overzicht op 1920 px leest ±200 tekens per regel.** Gekozen (de volle
  kolom, overal); een smallere regel is een smallere kolom, niet een maat op
  de tekst.
- **Op een telefoon breekt de tabrij van de wiki naar vijf of zes rijen.** Ook
  gekozen (alles in beeld); de tabs zijn daar wat smaller.
- **`--cork-speck` tekent niets meer op het prikbord** maar staat nog in
  Kleuren (§45): een token weghalen is een wijziging in elk schema.
- **De e2e-suite is niet volledig gedraaid**, alleen de specs die de wiki,
  de aanwezigheid, de breedte en het prikbord raken; zie de rondenotitie.

*Golf M (29 september 's avonds; Nick: de knipperende tabwissel, *Wie is
er?* overal rechtsboven, naar iemand toe en iemand roepen, de rechten op een
landkaart, de tijdlijn aan de randen, Gebruikers zoeken, samen op een vlak,
de stamboom) is gebouwd in vijf werkstromen: A de schil en de aanwezigheid
(`65f8499`), B de landkaart (`72331cc`), C de tijdlijn en Beheer
(`cebad02`), D de stamboom (`9eacf53`) en E samen (`5c61b6e`, §108). Eén
nieuw nummer, geen migratie. **Drie bestanden zijn weg, en dat is werk voor
Nick** (§7): `git rm components/editor/LivePeople.tsx
components/shell/Skeleton.tsx components/shell/skeletonShape.ts`.*

**Leftovers — golf M, allemaal met opzet genoemd.** Hij sloot uit golf K de
helft van *Wie is er?* vanaf 1880 px (zie hieronder), en uit ronde 46 het
laatste stuk van de strip: hij staat nu ook op een tekenvlak.

- ~~Dode CSS van het skelet en vijf dode `EXCEPTIONS`-regels~~ — opgeruimd in
  golf M·herstel (`30945ce`), samen met de dode `::view-transition-new(root)`-rij.
- **Een undo-stap op de stamboom bewaart nog het hele document** als
  momentopname: wie een `+` ongedaan maakt terwijl er tijdens het wachten op het
  net een sleep landde, zet die sleep ook terug (golf M·herstel).
- **Het `setHolding`-effect van de landkaart ruimt niet op bij het afbreken**
  (de tijdlijn wel, sinds golf M·herstel); `LiveProvider` wist het wel bij een
  plaatswissel.
- **De baanwissel van een tag op de tijdlijn glijdt niet**: alleen de
  gedragen tag volgt de veer; een tag die door een ander een baan opschuift,
  springt.
- **Geen e2e voor het zachte slot op de landkaart**; de regels zelf
  (`lib/live/hands.ts`) hebben hun unit-test in `golf-m-samen.test.ts`.
- **Verbinden door een `+` te slepen kan alleen met een muis of pen**, niet
  met een vinger.
- ***Opnieuw doen* staat niet in de werkbalk van een telefoon**
  (`.tree-redo` is daar `display: none`).
- **Ongedaan maken van een *+ kind* haalt het artikel niet weg** dat die `+`
  maakte: alleen de lijn gaat terug.
- **Een `E2E_DEV=1`-run van meer dan één spec** laat de dev-`next-server`
  oplopen tot ±4 GB; draai ze één tegelijk (zie §3). De glijproef in
  `golf-m-samen.spec.ts` slaat zichzelf over onder `E2E_DEV`.
- **Playwright na golf M** (volle suite vóór het herstel, 1008 zaken): 770
  passed / 236 skipped / 2 rood — `per-place-crops` (de bekende) en
  `timelines.spec.ts:76` op desktop, dat alleen en in de herstelrun groen was
  (de §21-tel "de tekst landt nog": een toets in die tel valt vóór de chip).
  Na het herstel 15 specs over alle vlakken en de aanwezigheid opnieuw: 161
  passed / 69 skipped / 0 rood.

*Golf L (29 september; Nick: de tekens, en een kaal donker prikbord) is in
één werkboom gebouwd, na een index van elke vorm op de site. Geen nieuw
nummer, geen migratie, geen verwijderd bestand; nieuw zijn `app/tekens.css`,
`lib/merk.ts`, `public/merk.svg` en `public/merk-180.png`. De rondenotitie is
`claude/golf-l-de-tekens.md`.*

**Leftovers — golf L, allemaal met opzet genoemd.**

- **Een speld van een Locatie is een speld in een speld**: de kop van een
  kaartspeld draagt het teken van de soort, en dat van Locaties is `pin`.
  Een eigen teken voor Locaties (een kompas, een huisje) zou het oplossen en
  raakt `ronde-66-herstel` (plek-iconen mogen geen soort-iconen zijn).
- **Geen `favicon.ico`**: sharp schrijft geen ICO. Een browser die om
  `/favicon.ico` vraagt zonder de `<link>` te lezen, krijgt nog de schil
  (golf H); de SVG en de PNG van 180 staan wel buiten de inlog.
- **De korrel van het kurk beweegt niet mee met een veeg**, net als de oude
  tegel. Hem op `.board-world` leggen maakt hem een vlak van 40 000 px.
- **`home` draagt nog twee betekenissen** (kamer en Huisraad).
- **Nog dubbel bij de randen**: *Foto* (Personen, Huisraad), *Bewijslabel*
  (Relieken, Voorwerpen), *Fotohoekjes* (Families, Gebeurtenissen) en
  *Vergeeld* (Geschriften, Talen). Golf L nam alleen de vijf keer
  *Gearceerd*.
- **De e2e-suite is niet volledig gedraaid**, alleen de specs die de schil,
  het prikbord, de randen, Beheer, de tijdlijn en het icoontje raken; zie de
  rondenotitie.

*Golf K (29 september; Nick: de omslag heel op een telefoon, de pagina in het
midden op een computer, *De soorten* die oplicht en niets doet, en de open
punten van golf J) is in één werkboom gebouwd, zonder fan-out: geen nieuw
nummer, geen migratie, geen verwijderd bestand, geen nieuwe route; één nieuw
bestand in `app/` (`fonts.ts`) en één in `lib/` (`maps/labels.ts`). De
rondenotitie is `claude/golf-k-drie-dingen-en-de-eindjes.md`.*

**Leftovers — golf K, allemaal met opzet genoemd.** Hij sloot uit golf J rij
20 op de telefoon (8,5 → 8), het wisselen van de webfonts en de 5 px van *Wie
is er?* (samen de CLS van een eerste bezoek; zie README §104), en uit golf I
de labels van twee regels op de tijdlijn en de plaatser voor kaartlabels.

- **Een smalle pagina springt ten opzichte van een brede** (de prijs van het
  omdraaien van D5): Jij, Spelers, Zoeken, de kamer en de winkel staan in het
  midden, de pagina's van het archief op één linkerrand. Onder ±1700 px zie je
  het niet, daarboven wel.
- **Tussen ±1700 en 1880 px zweeft *Wie is er?* nog**, en duwt daar Start (een
  raster) tot 65 px uit het midden. Vanaf 1880 px hangt hij in de hoek.
  *Half gesloten in golf M:* vanaf 1880 px hing hij pas sinds golf M echt in
  de hoek (daarvoor won golf h1's `position: relative` van deze `absolute`,
  en stond hij linksboven), in één blok in `app/navigatie.css`. Van 768 tot
  1879 px is hij op een gewone pagina nog de float van altijd, dus de
  65 px tussen ±1700 en 1880 staan er nog.
- **Een staande omslag duwt op een telefoon de eerste zin onder de vouw**
  (de prijs van het omdraaien van L5; hooguit de helft van het scherm).
- **Wat er op een artikel op 1440 px nog verspringt (≤ 0,021)**: een knop in
  de rij handelingen die bij de hydratatie 10 px breder wordt, en de kaart
  onder *Hier gevonden* die 20 px zakt. Niet uitgezocht.
- **De kaartnamen hebben vier plekken**, geen vijfde en geen verbindingslijn;
  wat nergens past is `weg` tot je de speld aanwijst. De eerste verf staat elke
  naam nog onder zijn kop (de breedtes meet de browser).
- **De tijdlijn**: ruitclusters bleven liggen; een tagje heeft hooguit twee
  regels, en de breedte is nog een schatting per teken (`tagWidth`,
  `tagLayout`), geen meting.
- **`@fontsource` voor de drie letters staat nog in `app/globals.css`**, voor de
  tekens buiten het latijnse deel. De build zet die bestanden erbij; een
  browser haalt ze alleen voor zo'n teken.

*Golf J (na de meting na golf I, `meting-na-golf-i.md`; Nick: "Ja ga zeker
verder :)") is gebouwd in vijf worktrees op `gevoel`: j1 de vlakken (§105),
j2 schrijven en zoeken (§90, §92, §100, §101, §104), j3 de Keeper en de
eerste keer (§106, §107, en stuk 12 onder §102), j4 de eerste verf (§104) en
j5 de suite weer groen (§90 en de specs), met één kleine reparatie van de
coördinator erna; samengevoegd tot `4afc3a5`. Geen nieuw nummer, geen
migratie, geen verwijderd bestand. De rondenotitie is
`claude/golf-j-na-de-meting.md`.*

**Leftovers — golf J, allemaal met opzet genoemd.** Hij sloot, uit het blok
van golf I hieronder, `.board-inspector-phone`, de tabwissel in Beheer, de
chips van `PageBlocksEditor`, de twee woorden in `TypeEditor` en de docblock
van `AdminTabs`, en hij keek de welkomsttekst na; daarbuiten de
reduced-motion-fade van de `+` van een vlak (`docs/beweging.md` §8). Uit ronde
64 sloot hij `makeOnEmpty` en besliste hij de stand waarin een vlak opent;
uit ronde 62 half de specs die `n` drukken. Het springende artikel op een
telefoon, dat j3 bij stuk 12 vond en liet liggen, sloot j4 in dezelfde golf.

- ~~**Rij 20 op de telefoon is 8,5** (was 9,5; kortst 5): het maakblad met drie
  winkelvelden is langer dan het scherm, en *Aanmaken* kost een halve veeg.
  Een plakkende *Aanmaken* zou het oplossen, maar raakt het gedrag van elk
  blad boven een toetsenbord.~~ **Gesloten in golf K:** *Aanmaken* plakt in het huisraadblad; rij 20 is 8.
- **Rij 27 (veld hernoemen, telefoon) is 8** (was 8,5; kortst ±6). Eén stap
  daarboven is *alles kiezen* in het veld. Bewust geen select-all bij focus:
  een tikfout verbeteren is even gewoon.
- **Rij 24 op de telefoon blijft 11** (computer 10): *Wie ben jij aan tafel?*
  zet de caret alleen met een muis (`(pointer: fine)`). Op een aanraakscherm
  opent een focus zonder gebaar geen toetsenbord, en de caret liet de `+`
  wijken; een vak zonder toetsenbord en zonder `+` is erger dan een tik.
- ~~**Webfonts wisselen nog bij het eerste bezoek** (`@fontsource`,
  `font-display: swap`, geen preload): koud gemeten CLS tot 0,32 op een
  computer en eens 0,034 op een Pixel 5, 0 met de lettertypen in de cache of
  tegengehouden. Alleen het eerste bezoek; de oplossing is een preload van de
  latijnse 400/600-bestanden of een fallback met `size-adjust`, voor alle
  pagina's tegelijk.~~ **Gesloten in golf K:** `next/font/local` (`app/fonts.ts`) met preload; het meeste verspringen bleek de strip hieronder.
- ~~**De strook *Wie is er?* verschuift de kolom nog 5 px** bij de hydratatie
  (bekend sinds 65·herstel; zie het blok van rondes 65–67).~~ **Gesloten in golf K:** een ondergrens van 5,75 rem op een computer.
- **Een chip in de lopende tekst breekt wél af**: Tiptap zet
  `[contenteditable="false"] { white-space: normal }` over de `nowrap` van
  `.entry-chip`. `VoorafTekst` doet hetzelfde, met opzet; wie dat wil
  veranderen, doet het op beide.
- **Twee zaken die één keer rood waren en alleen groen**:
  `phase3-keeper-tools.spec.ts:349` (site settings) en
  `golf-i2-eerste-keer.spec.ts:132` (*Je schrijft als …* in een tweede
  venster; vermoedelijk de melding die vóór het blad komt en door T6 weggaat).
  Niet van golf J, niet verder uitgezocht; zie §1.
- **`article-faces` en `entry-live` drukken nog `n`** in een eigen lus (zie
  ronde 62 hieronder); `sort-filter` en `access-rights` zijn over op
  `openNewEntry`.

*Golf I (na golf H; Nick: "Ja ga zeker verder :)") is gebouwd in drie
worktrees op `gevoel`: i1 de tekenvlakken op de telefoon (§105), i2 de eerste
keer (§106), i3 Beheer (§107). Na een eerste samenvoeging keek design-review 4
(`REVIEW4.md`), en elke worktree kreeg een tweede pas; samengevoegd als
`d1dc532`. Geen migratie, geen verwijderd bestand, geen nieuwe route. De
rondenotitie is `claude/golf-i-de-volgende-pas.md`.*

**Leftovers — golf I, allemaal met opzet genoemd.** Hij sloot, uit het blok
van golf H hieronder, de twee regels werkbalk op de telefoon (T18) en half
D17, en uit rondes 65–67 de peek die op `max-height` bewoog.

- **De tijdlijn in een dossier (`.timeline-frame` buiten `.page-canvas`)
  krijgt de `+` niet in de hoek**: `.canvas-make` staat alleen op
  `.page-canvas` vast. Daar staat *Gebeurtenis toevoegen* nog in de balk.
- ~~**`.board-inspector-phone` in `app/globals.css` is dode CSS.** Sinds review
  4 is de inspector van het prikbord op een telefoon een `CanvasPeek`
  (`.board-peek`); niets rendert de oude klasse nog. Weg ermee als iemand in
  dat bestand is.~~ **Gesloten in golf J (§105):** weg, met `-head` en
  `-row`.
- **De vier `boardEmpty*`-woorden zijn dood** (`boardEmptyRead`, `-Find`,
  `-Make`, `-String`): `CanvasEmpty` leest ze niet meer, maar ze staan nog in
  `lib/words.ts` omdat `tests/unit/ronde-51-canvas.test.ts` ze navraagt. Weg
  met beide als iemand in die test is.
- ~~**`E2E_DEV=1` is maar half gedraaid** (zie §1): `round-37-map`,
  `round-37-pinch` en `round-37-timeline` wachten nog op een run onder Strict
  Mode op een rustige machine.~~ **Gesloten in golf K:** alle drie groen onder `E2E_DEV=1`, één tegelijk.
- ~~**Bewust niet gedaan op de vlakken** (review 4): labels van twee regels en
  ruitclusters op de tijdlijn (nieuwe baangeometrie, een eigen ronde), een
  plaatser voor botsende kaartlabels, en M3 op een kaart waarvan de spelden de
  hele breedte beslaan (Walcheren: daar is de fit al "op de spelden").~~ **Half gesloten in golf K:** twee regels op de tijdlijn en `placeLabels` voor de kaartnamen; de ruitclusters en Walcheren staan nog open.
- **De handelingstelling van de vlakken veranderde niet**: de winst van i1 is
  ruimte en bereik, geen tik minder. De kortste routes van de meting vragen
  een vlak dat in Lezen al iets maakt, en dat is §73.
- **De welkomsttekst zegt op een computer nog *maak met de + een nieuw
  artikel*** (`defaultIntro` in `lib/intro.ts`), terwijl daar geen `+` is. Het
  is de tekst van de Keeper (Beheer → Site), niet van deze golf; een Keeper
  die hem al herschreef, ziet het niet. **Nagekeken in golf J:** de zin klopt
  op beide maten. Op een computer draagt *Nieuw artikel* in de zijbalk het
  teken +; ronde 51 (S10) koos voor de + en `ronde-51-schrijven.test.ts`
  houdt dat vast. Niet veranderd.
- **Op een telefoon deelt *Kopieer de link* op Start niet** via
  `navigator.share`; dat zou één tik schelen. In Beheer → Gebruikers staat er
  wel *Delen* naast.
- **Een lege staat in een dossier in Lezen heeft geen deur**: de maakknoppen
  staan alleen in Bewerken.
- **De index kost op een telefoon één tik voor Gebruikers**, dat vroeger het
  eerste scherm was (wachtwoord op de telefoon: 5 → 5,5 handelingen). Bewust:
  de prullenbak, Soorten en Woorden werden daardoor goedkoper.
- ~~**Een tab wisselen in Beheer gooit niet-bewaarde soort-bewerkingen weg**:
  alleen het actieve paneel is gemount. De browser vraagt bij het verlaten van
  de pagina (`beforeunload` in `TypeEditor`), maar niet bij een wissel binnen
  Beheer.~~ **Gesloten in golf J (§107):** een paneel met iets niet-bewaards
  blijft gemount, verborgen (`useNietBewaard`, `mountedPanes`), met een rood
  puntje bij de naam.
- ~~**`PageBlocksEditor` is alleen via CSS compacter gemaakt**
  (`.soort-zij .admin-block`), niet herschreven. Zijn eigen chips voor *Kijk
  in deze soorten* zijn nog de oude rij van negentien.~~ **Gesloten in golf J
  (§107):** `SoortKiezer`, dezelfde kiezer als bij een koppelveld.
- **De zin *Ook in:* kent alleen de gaten in `HOLE_WORD`.** Waar een component
  een woord zonder gat in een zin zet, weet Woorden niet dat het daar staat.
- ~~**Twee woorden in de soort-editor staan letterlijk in de code**, niet in
  `lib/words.ts`: *Koppelingen* (`QUICK_LABEL`) en *Nog geen keuzes*
  (`fieldSummary`), beide in `components/admin/TypeEditor.tsx`.~~ **Gesloten
  in golf J (§107):** `soortSnelKoppelingen` en `soortNogGeenKeuzes`.
- ~~**De docblock van `AdminTabs` is verouderd**, geen gedrag: hij zegt nog dat
  een telefoon na een keuze de strook (`.schuifrij`) toont. Sinds review 4 is
  dat alleen *‹ Beheer*.~~ **Gesloten in golf J.**

*Golf H (na design-review 3) is gebouwd in drie worktrees op `gevoel`: h1 de
schil, h2 de economie, h3 lezen en de wiki. Geen nieuw nummer, geen migratie;
elk deel vult §102, §103 of §104 aan. De rondenotitie is
`claude/golf-h-de-laatste-pas.md`.*

**Leftovers — golf H, allemaal met opzet genoemd.** Hij sloot, uit het blok
hieronder, het saldo dat ±640 ms achterliep en de lege *Dossiernotities*, en
uit round 62 de tabbalk die *Jij* op 390 px zou afknippen.

- **De stempel KEEPERKANT boven de inhoudsopgave van een artikel is blijven
  staan** (D4 vroeg hem weg). Hij komt niet uit de schil maar uit
  `KeeperStamp` van de pagina (`keeper-stamp`, waar veel specs op leunen). Wie
  hem weghaalt, doet dat in `app/(app)/e/[slug]/page.tsx` en `KeeperStamp` en
  past de specs aan. Op de Keeperkant staan er dus nog drie tekens voor één
  feit: de schakelaar, deze stempel en *Alleen voor de Keeper*.
- ~~**De rij Lezen/Bewerken en de zoombalk van een tekenvlak staan op de
  telefoon nog op twee regels** (T18). Samen zijn ze breder dan 358 px, en ze
  wonen in de canvasbestanden (§69); dat is niet zonder risico te doen met
  alleen CSS. Het glas houdt dus ±55 % van de hoogte.~~ **Gesloten in golf I
  (§105):** één regel werkbalk en een kop van twee; het glas is 73–76 % in
  Lezen op 390×844.
- **`/favicon.ico` en elk ander onbekend adres met een sessie renderen nu de
  schil** (de catch-all). *Half gesloten in golf L:* zonder eigen icoontje
  wijst de `<link rel="icon">` naar `public/merk.svg`. Goedkoop, maar het is een render per verzoek; een
  `app/icon` of een bestand in `public/` neemt dat weg.
- ~~**D17: soorten delen hun icoon**~~ **Gesloten in golf L** (zestien tekens erbij en `seed:golf-l-tekens`). (Aardse Goden en Locaties, Relieken en
  Onderzoekers, Bovennatuurlijke wezens en Abnormaliteiten, Geschriften en de
  wiki). Bewust niet gedaan: het is data van de seed, en de Keeper zet een
  icoon per soort in Beheer. Een test die dubbelen weigert, hoort bij een
  seed-wijziging. **Half gesloten in golf I (§107):** `iconClashes` rapporteert
  de dubbelen (een unit-test, geen weigering), de soort-editor zegt het met
  een zachte zin, en er zijn negen tekens bij. De seed is niet veranderd, dus
  de vier paren staan er nog.
- **`kamer-ingericht` in `app/kamer.css` is dode code.** De regel
  `kamer-ingericht-hoek` verderop in hetzelfde bestand overschrijft de
  `animation` van `.plek-ingericht`, dus de oude keyframes spelen nooit meer.
  Weg ermee als iemand in dat bestand is.
- **Drie codecommentaren zijn verouderd**, geen gedrag: de docblock bovenaan
  `components/keeper/SideToggle.tsx` en het §46-commentaar in `AppShell` zeggen
  nog "dezelfde hoek op een computer en een telefoon", en het commentaar boven
  `.tabs > .tab-jij` in `globals.css` zegt dat het saldo "als een klein plaatje
  aan het poppetje" hangt; het staat op de regel van *Jij*.
- **`docs/kamer-contract.md` loopt achter**: K3 zegt nog dat elke knop die geld
  kost zijn bedrag draagt, en K17 dat één rijhoogte geldt voor alle vier de
  staten. Sinds 66·herstel (winkel) en golf H (kamer, catalogus, dichte
  plekken in een eigen raster) klopt dat niet meer; de README-blokken bij
  regel 84 en 85 zeggen hoe het nu is.
- **De verplaatsbalk staat op een telefoon links om de FAB ruimte te laten**,
  maar sinds h1 staat er in de kamer geen FAB meer. Onschuldig; hij mag weer in
  het midden als iemand erin zit.

*Rondes 65, 66 en 67 (het gevoel, §102–§104) zijn tegelijk gebouwd, in vijf
worktrees (65·a, 65·b, 65·c, 66, 67) op `gevoel`, en samengevoegd. Daarna
kwam per ronde een herstelpas na een design-review (65·herstel de schil,
66·herstel winkel en kamer, 67·herstel lezen). Hun open eindjes staan in één
blok hieronder.*

**Leftovers — rondes 65–67 (§102–§104), allemaal met opzet genoemd.**

- **Geen `loading.tsx` in `app/(app)`, en dat is gemeten, niet vergeten**
  (ronde 65·b, §102). Een `loading.tsx` streamt ook bij een harde load; de
  providers in de schil (`UiProvider`, `LiveProvider`, `AuthorProvider`)
  zetten in hun eerste effecten state, en React rendert de nog niet
  gehydrateerde grens dan opnieuw. Gevolg: het skelet flitst terug over een
  pagina die er al stond (op `/e/middelburg`: pagina op 62 ms, skelet op
  160 ms, pagina opnieuw op 374 ms), ~200 ms twee pagina's in de DOM
  (`access-rights.spec.ts:94` faalde op strict mode), en een `#anker` na
  `router.push` landt niet. Het skelet is daarom `NavProgress` +
  `Skeleton.tsx`, alleen in de browser. Wie ooit toch een Suspense-grens rond
  een pagina wil: eerst de mount-updates in `UiProvider`/`LiveProvider`/
  `AuthorProvider` in `startTransition`. De prijs: Next haalt een dynamische
  route zonder `loading.tsx` niet vooraf op, dus de tijd tot de pagina werd
  niet korter. Alleen het stilstaan is weg.
- **`EXCEPTIONS` in `tests/unit/beweging.test.ts` heeft een dode regel.** Hij
  staat `globals.css` `::view-transition-new(root)` 550 ms toe, maar de
  omslag-cirkel staat sinds 65·c in `app/kaartje.css`, met
  `calc(var(--dur-5) + var(--dur-3))`. De regel vangt niets en kan weg als
  iemand in dat bestand is.
- **De test meet losse duren, geen curves en geen `calc`.** `.plek:target`
  loopt op een letterlijke `ease-out`, en de streep van `NavProgress` groeit
  in `calc(var(--dur-5) * 5)` (2 s, een meter, geen reis). Regel 5 van
  `docs/beweging.md` (niets routineus boven 500 ms) wordt dus niet door de test
  bewaakt, alleen door lezen.
- ~~**De peek op de telefoon (`.canvas-peek`) beweegt op `max-height`**, tegen
  regel 3 in. Hij staat als schuld in de uitzonderingen.~~ **Gesloten in golf
  I (§105):** een maatwissel is een FLIP op `transform`, en de uitzondering
  `.canvas-peek 0.18s` is uit `EXCEPTIONS`.
- **`summary::marker` van een `<details>` zonder eigen pijltje** (de legenda
  van het web) draait niet: een ingebouwd driehoekje kun je niet draaien.
- **De strip van *Wie is er?* verandert van breedte met wie er is**
  (65·herstel). De float draagt de schijfjes en de telling, dus de kolom van
  iedereen verspringt een paar pixels als er iemand binnenkomt.
- **Drie iconen hebben nog twee betekenissen** (66·herstel): `home` (kamer
  en Huisraad), ~~`lock` (openen en Eldritch), `book` (catalogus en
  Werken)~~ — die twee zijn in golf L gesloten.
  Plek-iconen botsen niet meer met soort-iconen, en daar staat een test op.
- **Een plaatsing door een ander landt zonder beweging**, en de munt van een
  gift klinkt alleen als de `AudioContext` in dit tabblad al loopt (een
  browser weigert geluid zonder gebaar). Allebei bewust.
- **`ShopItem` weet niet of huisraad gekocht of gegeven is**, dus ook wat de
  Keeper in de lade legde, krijgt in de winkel de kleine stempel *Gekocht*.
- ~~**Na een eigen koop beweegt het saldo in de schil ±640 ms later** dan de
  melding met −n, omdat de koopknop de live-verversing vasthoudt tot
  *Gekocht* geland is.~~ **Gesloten in golf H (§103, T8):** `announceBalance`.
- ~~**Een lege *Dossiernotities* is in Lezen een leeg kader van ~180 px**
  (`components/cases`). Gezien in 67·herstel, niet opgepakt: de dossiers
  hoorden niet bij de leeskamer.~~ **Gesloten in golf H (§104, D24):** één
  regel `.blok-leeg`.
- **L9 voegt alleen samen bij dezelfde kop.** Een afgeleid blok en een
  koppelingsveld die hetzelfde bedoelen maar anders heten, blijven twee
  lijsten. Dat is de minst verrassende regel, en een hernoeming door de
  Keeper zet het in beide richtingen.

*Rounds 58 to 62 were built at the same time, in five worktrees on
`golf-3-base`, and merged as `golf-3`, with a pass of **naden** after the
merge (it lives in round 62's block, under §101). The blocks below are newest
first. Two flakes of golf 2 were repaired on the way: `phase3-keeper-tools:91`
(naden) and `characters:244`/`:540`, which pressed `n` and now use
`openNewEntry`.*

*Rounds 53, 54, 55 and 57 were built at the same time, in four worktrees on
`ronde-52`, and merged as `golf-2`. ~~Round 56 (§95, the one-line editor with
migration `0034_`) is not built yet.~~ Round 56 (§95, migration `0034_een_id`)
was built on `golf-2` after them, so its block stands before theirs.*

**Round 64 (§101, after golf 3's measurement) leaves four, all named on
purpose.** The round itself repaired what the re-measured handelingstelling
found (`claude/meting-na-golf-3.md` in the project): the author question eating
the action that raised it, Escape on that question, Tab out of a sectie title,
the stamboom's camera, and the FAB on `/admin` and `/winkel`.

- **A los kaartje from a handle can land on a ghost.** `attachLoose` works out
  its place from the positions *before* the relayout and pins it there, so when
  the generation shifts it stands too far away or on top of a ghost card. The
  cure is not to pin a card that came from a handle and let the layout place it
  — which touches §66's "a stamboom stores only its pins", so it is a round of
  its own. It is also why the camera still has to move about 100 px there.
- ~~**`makeOnEmpty` (double-click on bare glass) has the same fault the maker
  buttons had:** the gate asks on the first `pointerdown` and the double-click
  is gone. The glass *may* ask there (that is §90's design), so this is a
  decision rather than a seam.~~ **Closed in golf J (§105):** bare paper never
  asks (`gatePress`); the double-click or long press asks itself in
  `useMakeOnEmpty` (`ensureAuthor`) and then makes.
- ~~**The four canvases open in Bewerken on a desk and in Lezen on a phone**, and
  the mode is not remembered. Named in the measurement as something to decide,
  not a bug.~~ **Decided in golf J (§105): it stays.** With `gatePress`
  reading costs nothing in Bewerken; see DECISIONS, golf J.
- **The palet does not rank "Wie van wie" into the first five rows** for a
  query that names a stamboom. *Addressed in golf J (§100, `palettePlan`):
  another thing's name now stands above the artikelen when it is at least as
  good a match. "Wie van wie" itself was not measured again.*

**Round 62 (§101, with the naden) leaves these, all named on purpose.** It
closed, from earlier blocks: round 51's `room.placed` in a private kamer and
the focus bug in other sheets; round 53's B25, *Uitgetekend op*, the empty
Tekst and the soort strip; round 54's `room.opened`/`room.bought` in a private
kamer, the live undo (it already was), the Keeper's lade, the × over *BUREAU*
and *Er is iets misgegaan*; round 57's notes in a `title`, the search screen's
text and the 60-character test. All are struck through below.

- **`listSpelers` includes Keeper accounts** (from round 57), as the hal
  does. Kept on purpose.
- **On a phone your kamer is still two taps away** (from round 52), the price
  of eight tabs.
- **The Jij-blad still mixes doors and menu lines** (from round 52).
- **`scripts/restore.mjs` still empties only `room_drawer`** when a backup
  lacks a table (from round 54).
- **Four specs still press `n` in a loop of their own** instead of
  `openNewEntry`: `sort-filter`, `article-faces`, `entry-live` and
  `access-rights`, plus `shots.visual.ts`. They pass; they are the same race
  `openNewEntry` exists for. *Half closed in golf J:* `sort-filter` and
  `access-rights` use `openNewEntry` now; `article-faces`, `entry-live` and
  `shots.visual.ts` still press `n`.
- **`SectionsEditor` says "Opslaan is niet gelukt." in the code**
  (`components/entry/SectionsEditor.tsx`, a toast), not through
  `lib/words.ts`.
- ~~**On 390 px the tab bar may cut *Jij* off on the right.** Reported by the
  builder from a screenshot and not checked since: measure before fixing.~~
  **Closed in golf H (§102, T3):** measured, every box is 49 px at 390 px.
- **The server does not refuse a second identical voorstel** (naden): the fix
  for the double voorstel is on the client (`ShortEditor`, `LiveFieldsRoom`), and
  the server still accepts a second identical voorstel if some other client
  sends one.

**Round 61 (§100) leaves these, all named on purpose:**

- **The `>` handelingen cannot add a karakter.** They only switch between the
  ones you hold (`useWardrobe`'s wissel).
- **`/search` on a phone has no door of its own to the palette.** `/` and the
  Jij-blad's *Zoek of ga naar…* open it; the search page itself does not.
- **The prikbord says `offline` for a dead line, the stamboom and the
  tekenlaag say `error`.** That is what their sync hooks already knew; it was
  not made one answer in this round.
- ~~The speld and gebeurtenis sheets and the sections do not report to the one
  save word.~~ **Closed in the naden** (§101).

**Round 60 (§99) leaves these, all named on purpose:**

- **The maakblad of a new prikbord asks no description.** You write it below
  the fold once the wall exists.
- **The description is not searched**, like every non-artikel's text (round
  57).
- **On a phone in Bewerken the prikbord's glass is 61 %** (517 of 844 px,
  was 50 %), just under the shared floor of 62 %; `ronde-60-vlakken.spec.ts`
  asserts more than 58 % in Bewerken.
- **The resize grip and the marquee on a prikbord are still a mouse's**
  (round 35's leftover, halved by §94's *Touwtje*).
- **The tijdlijn's settings sheet still has six radios with an explanation
  each**; only the maakblad got the row of chips.

**Round 59 (§98) leaves these, all named on purpose.** It closed every item of
round 56 below but the running-text leak (round 58 closed that) and the
`[[typo]]`.

- **`MentionPopover`, `MentionOverlay`, `MentionPreview` and `useBoxFocus`
  have no users** and were not deleted. Removing them is a file deletion, and
  therefore a `git rm` for Nick.
- **A `[[typo]]` the migration could not resolve stays letters**, in 0034's
  columns and in 0036's alike.

**Round 58 (§97) leaves this:**

- ~~`restoreCaseRevision` does not reset the notes room.~~ Reported by its
  builder, **closed** by round 59 (`resetRoom(case:{id}:notes)`) and the
  merge (`cleanDocRefs` on the notes). Verified in `lib/admin/trash.ts`.
- Nothing else of its own. The two readers that still accept a legacy
  `{ id }` link (`extractEntryLinks`, and `cleanDocRefs`' first step) do so on
  purpose, for a seed, a test or an old tab.

**Round 56 (§95) leaves these, all named on purpose:**

- ~~**The running text has the leak this round closed for the short boxes.** An
  `entryLink` in `entries.body` carries its `label` and its `id` to everyone
  who may see the artikel — in the RSC and in the room — also when the linked
  artikel is one they may not see. The same handle idea would close it, but
  it is a document, a second live shape and every reader of `body`: a round
  of its own, and the first one to pick up here.~~ **Closed in round 58 (§97):** a link in the running text is `{ handle }`.
- ~~**Short texts do not count under "Genoemd in".** They never did (only
  `body`, the link fields and the canvases write `entry_mentions`), but now
  that a short text holds handles it is cheap: `handlesIn` + one join onto
  `mention_handles`, in `recomputeFieldMentions` and the case half.~~ **Closed in round 59 (§98):** `entryIdsInShort`.
- ~~**`restoreCaseRevision` puts a samenvatting back without touching the
  `case:{id}:fields` room** (`lib/admin/trash.ts`). Older than this round —
  it never did — but a restored summary can now be overwritten by a room that
  still holds the newer one. `restoreRevision` for an artikel does reset its
  room.~~ **Closed in round 59 (§98):** it resets the fields room and, since the merge, the notes room.
- ~~**A plain left click on a chip in Bewerken opens the artikel** (§68,
  `handleClickOn`). On a phone a tap meant to put the caret next to a chip can
  therefore walk away. Tap beside it, or the chip needs a "tap once to select,
  twice to open" rule.~~ **Closed in round 59 (§98):** in Bewerken it puts the caret after the chip.
- ~~**A hidden chip a player sweeps out comes back at the end of the text**
  (§67 via `cleanShort`). Correct and ugly: where it stood, the player could
  not see, so there is no better place.~~ **Closed in round 59 (§98):** it comes back where it stood (`putBack`).
- ~~**A draft in the maakblad keeps its chips**, and comes back in the *next*
  Nieuw artikel of that page if it was never sent (§69's `DRAFT_ENTRY`). Same
  as a typed name always did; with chips it is more noticeable.~~ **Closed in round 59 (§98):** a draft keeps words (`chipsAsWords`).
- ~~**Kaartje, speld, gebeurtenis, the descriptions of a landkaart, a tijdlijn
  and a stamboom and an overzicht's lead still write `[[Naam]]`**, with A2
  and A3 still true there. Each is its own column, conversion and readers;
  `MentionText` reads both forms, so they can move one at a time.~~ **Closed in round 59 (§98),** migration `0036_elk_kort_vak`.
- **A `[[Naam]]` the migration could not resolve stays letters** — a typo, a
  name in the trash on the day, a name renamed before the migration. It is
  drawn as the dead chip it always was, and becomes a real chip only when
  somebody edits that text and may see an artikel of that name (`cleanShort`
  upgrades a typed-out `[[Naam]]`). An `@Naam` that found nothing on the day
  stays letters for good.
- ~~**`mention_handles` is never swept.** A handle whose text was edited away
  keeps its row. It names nothing to anybody who cannot see the artikel, so
  it is harmless; a sweep would have to read every short text, revision and
  voorstel first.~~ **Closed in round 59 (§98):** `sweepMentionHandles` at start-up, 30 days' margin.


**Round 57 (§96) leaves these, all named on purpose:**

- ~~**A player's notes on `/you` moved into a `title`**, to make room for the
  two rows of chips (S18). A `title` does not exist on a phone (K5's reason),
  so there they cannot be read. Give them a *Waarom?* of their own if anybody
  misses them.~~ **Closed in round 62 (§101):** behind *Waarom?*.
- **Search matches only the name of anything that is not an artikel.** A
  dossier's samenvatting, a tijdlijn's description and a stamboom's members
  are not searched. That would be a query per kind with its own visibility,
  and `searchOthers` exists precisely so that there is none.
- ~~**The rest of the search screen's text is still hard-coded.** The §96 keys
  cover the new section and the empty sentences; the older labels on
  `SearchScreen` are not keys yet.~~ **Closed in round 62 (§101).**
- ~~**`tests/unit/ronde-51-canvas.test.ts` still asks its keys for ≤ 60
  characters.** Stricter than `WORD_MAX` and harmless; loosen it when somebody
  is in that file.~~ **Closed in round 62 (§101):** it asks for `WORD_MAX`.
- **`listSpelers` includes Keeper accounts**, as the hal does, so a search for
  a Keeper's name finds him under *Spelers*. That is the hal's answer and it
  was kept, not decided.

**Round 55 (§94) leaves these, all named on purpose:**

- ***Alles in beeld* has no reading floor.** Opening does (`readableFit`); the
  button shows everything, even at 5 px names. That is deliberate: a button
  that says "everything" must not show half, and specs lean on it (§6).
- ~~**The prikbord still has no description column** (review O8; see round 35
  below). It moved onto §34 without one, because only round 54 was allowed a
  migration in this wave.~~ **Closed in round 60 (§99),** `0037_prikbord_beschrijving`.
- ~~**On a phone in Bewerken the prikbord gives the glass about half the
  screen.** The inspector and the bar take the rest. Measured on screenshots,
  not fixed.~~ **Closed in round 60 (§99):** 61 %.
- ~~**The prikbord's tekenlaag switch for the Keeper is still in the Rechten
  sheet**, not under the fold. The wall has a `#board-underfold` now, but only
  the dossier choice and `BinSlot` went there (§5's under-the-fold rule).~~ **Closed in round 60 (§99):** `#board-ink-underfold`.
- ~~**A los kaartje in a brand-new stamboom has no word at its `+` yet.** The
  four handles of a card got their words (*Ouder*, *Kind*, …); the loose
  card's maker did not.~~ **Closed in round 60 (§99):** *Los kaartje* keeps its word, and the shared `+` is *Kind van beide*.
- **Flakes seen in round 55's runs, green when re-run alone:**
  `round-6.spec.ts:37` on the phone (red in two batches) and
  `canvas-contract.spec.ts:444`. Re-run alone before believing either.

**Round 54 (§93) leaves these, all named on purpose:**

- ~~**`room.opened` and `room.bought` in a private §86 kamer show in a player's
  feed**, the same leftover as `room.placed` (round 51 below). The row names
  nobody the reader may not see, but the event is there.~~ **Closed in round 62 (§101):** `roomRowCondition`.
- ~~***Ongedaan maken* after a buy is not live for somebody watching**, as the
  round's builder reported it. Not re-checked in the docs pass: both writes in
  `undoPurchase` name `room_id` and a write to `activity` moves the feed list,
  so whoever picks this up starts with what the watcher's screen reads, not
  with the keys.~~ **Checked in round 62:** it already was live; nothing to fix.
- ~~**The Keeper cannot put something straight into a drawer.** He places it on
  a plek (free, §80) or hands out munten. A "give this, but in the lade" is a
  new road and was not asked for.~~ **Closed in round 62 (§101):** `giveToDrawer`, *In de lade leggen*.
- **`scripts/restore.mjs` empties only `room_drawer`** when a backup does not
  carry it. A general "empty every table the backup lacks" would be better,
  and it must skip the FTS shadow tables, which is why it was not written in
  passing.
- ~~**The × on a 160 px tile partly covers the plek's label** (*BUREAU*). Older
  than this round; *Verplaatsen* was put under the × so it would not make it
  worse.~~ **Closed in round 62 (§101):** the word stops with "…" before the ×'s corner.
- ~~**"Er is iets misgegaan." is hard-coded in `components/kamer/post.ts`**, the
  fallback when the server gives no sentence of its own.~~ **Closed in round 62 (§101):** `somethingWrong`.

**Round 53 (§92) leaves these, all named on purpose:**

- ~~**A2 and A3 wait for round 56.** Two artikelen with the same name: the
  oldest wins a `[[Naam]]`. And renaming an artikel breaks every
  `[[oude naam]]` written before. Both need an id in the box, which is what
  round 56's one-line editor brings (§95, migration `0034_`).~~ **Closed in
  round 56** (§95, `0034_een_id`) for the four short boxes, and in round 59
  (§98, `0036_elk_kort_vak`) for every other.
- ~~**B25 is not done: empty infobox fields are not folded away.** It broke at
  least nine specs. The words `fieldsFillEmpty` and `fieldsEmptyCount` are in
  `lib/words.ts`, unused, ready.~~ **Closed in round 62 (§101):** *+ Veld invullen*, `foldEmpty`, from two empty fields.
- **A click beside a chip puts the caret where the browser puts it in the
  raw text**, and the raw text has brackets the preview did not show, so the
  caret can land a couple of letters off from where the finger was. *Closed
  in round 56 for the four short boxes (the chip is in the text, there is no
  raw form); and in round 59 for every other box, since none keeps
  `MentionPreview`.*
- ~~**"Uitgetekend op: Landkaart koppelen / nog niets" also shows on a Persoon**
  for the Keeper, where it means little.~~ **Closed in round 62 (§101):** the row prints only with a landkaart.
- ~~**An empty *Tekst* block shows in Lezen on a phone.**~~ **Closed in round 62 (§101):** `hidden` in Lezen.
- ~~**The soort strip does not show the chosen soort when it is scrolled out of
  view** (a prefilled soort far down the list). *Alle soorten* shows it.~~ **Closed in round 62 (§101):** the chosen soort scrolls into view.

**Round 52 (§91) leaves these, all named on purpose.** Rounds 53–56 of the
review are still the plan for what comes next, and are not repeated here.

- ~~**A long name in the Jij-blad is cut off without an ellipsis.**
  `.jij-who-name` is `inline-flex`, and a player's name is a bare text node
  inside it, so the name becomes an anonymous flex item and
  `text-overflow: ellipsis` never applies to it. The fix is one `<span>` round
  the name, carrying the overflow rules.~~ **Closed in round 57 (§96):** the
  name is in a `.jij-who-text` span that carries the overflow rules.
- **The saldo in the side menu is not `Beurs.tsx`.** It is a `<span
  class="nav-tail">` with the same shape (coin first, upright, ink, never
  `.stamp`), because a menu line has no room for the component's padding.
  K1 says a saldo *is* `Beurs.tsx`, so the contract now names this as an
  exception. If the two shapes ever drift, the side menu drifts first.
  *Settled by Nick on 21 September, after round 52:* the tail in the side menu
  and on the Jij tab (`tab-jij-saldo`) is a recorded exception to K1, not a
  leftover. The drift risk stays.
- **On a phone your kamer is two taps away, not one**: the Jij tab, then
  *Naar de kamer*. Only Start's Jij-rij makes it one. That is the price of
  keeping eight tabs (Nick, 21 September), paid on purpose. See DECISIONS,
  round 52.
- **The Jij-blad names some doors by their destination and some with a
  verb.** *Naar de kamer* and *Naar de winkel* follow K11. *Mijn
  spelerspagina*, *Spelers*, *Instellingen*, *Beheer* and *Uitdelen* are menu
  lines, as they are in the side menu. It reads fine, but it is two rules in
  one list. Decide it the next time somebody is in `JouwPlek.tsx`.
- **"Laatst door jou" only looks at Start's newest 200 feed rows**
  (`OWN_WORK_SCAN`, the spelerspagina's number). In a busy archive, someone
  whose last edit is older than that is told *Nog niets bewerkt.* A query of
  its own would fix it and would also be a second set of visibility rules,
  which is why it was not written.
- ~~**The side menu's search box searches what `/search` searches**, which is
  still only artikelen (review S3). A search over everything, and a palette
  (`⌘K`), are "later" in the review.~~ **Closed in round 57 (§96)** for the
  search: `/search` finds every other kind of thing and the spelers by name
  under *Alles*. There is still no palette.
- **The handelingstelling was derived, not measured.** The round note
  (`claude/round-52-jouw-plek.md`) gives before → after for the review's core
  tasks, worked out from the code. The review's method (Playwright scripts on
  `seed-wereld`) was not run again, because the machine had two cores and the
  full suite running.

**Round 51 (§90) leaves these, all named on purpose.** It was the first build
round after the UI/UX review (`claude/review-ui-ux-de-wrijving.md`). Rounds
52–56 there are the plan for what comes next, so what the review planned for
*those* rounds is not repeated here. These are the things round 51 touched and
left open, or found on the way.

- ~~**The plek-kiezer still offers huisraad nobody bought** (review E1).
  `placeItem` checks the plek and the visibility, but not the price or who
  owns it, so *Wat je al hebt* lists every stuk huisraad. Nick decided the fix
  (a lade per kamer, a `keeper_made` slot in `placeItem`, and *Ongedaan
  maken* in the koopmelding) and put it in **round 54**. Until then it is a
  known hole, not a surprise.~~ **Closed in round 54 (§93)**: the lade
  (`room_drawer`, migration `0033_de_lade`), the slot in `placeItem`,
  `placeCandidates()` behind *Wat je al hebt*, and `undoPurchase`.
- ~~**Two items from round 51's own list were only half done.** Review S5/C30
  asked for Beheer and Uitdelen in the side menu *and* the tab in the address.
  Only the second half was built: `?tab=` via `history.replaceState`, with
  Gebruikers, Beoordelen and Prullenbak first (`lib/adminTabOrder.ts`). Neither
  is in the side menu yet. Review S12 is also half done: the beurs pill (22 px)
  and the Keeperkant button (32×32) in the shell still miss `--tap`. Both fit
  round 52's shell work.~~ **Closed in round 52 (§91).** Beheer and Uitdelen
  are the side menu's *Keeper* group (rendered for a Keeper only) and sit in
  the Jij-blad on a phone. The beurs pill no longer exists, so its 22 px went
  with it. The Keeperkant button is `--tap` high with a word on a desk, and a
  32 px circle with an invisible rim to 44 px on a phone.
- ~~**A Keeper's `room.placed` / `room.cleared` in a private kamer (§86) shows
  in a player's feed** once the thing placed is visible to them. The row names
  nobody (`visibleNamesOf` drops the onderzoeker, so it reads "in een
  kamer"), but the event itself is there. *Wider since round 54:* the same
  goes for the new `room.opened` and `room.bought` rows.~~ **Closed in round
  62 (§101):** every `room.*` row asks the kamer (`roomRowCondition`).
- ~~**Three kamer writes are still silent in the feed or on the live line.**
  `buyFurnishing` and `unlockSlot` write no activity row, so a koop is in
  nobody's feed. `handOut` writes one `room.granted` with neither `entryId`
  nor `characterId`. The claim reset in `lib/admin/types.ts` (when a soort's
  `one_of_a_kind` flips) updates `room_slots` by `id` alone, so `room:{id}`
  does not move (§5, the TABLES rule).~~ **Closed in round 54 (§93).**
  `room.bought` and `room.opened` are feed rows (*kocht*, *opende een plek in
  de kamer van*), `handOut` writes one `room.granted` per kamer with its
  onderzoeker, and the claim reset names `room_id`.
- ~~**"Wat deze kamer je geeft" still says *je* in somebody else's kamer.** The
  empty sentence and the toasts were fixed. The heading (`roomEffects`) was
  not. K48 carries the exception.~~ **Closed in round 54 (§93):** in somebody
  else's kamer the heading is `roomEffectsOf` (*Wat deze kamer Kees geeft*).
- **`CHARACTER_TYPE_SLUG = 'investigator'` is written twice**, in
  `lib/kamers/service.ts` (for `mayHoldRoom`) and in `lib/newEntryType.ts` (for
  the `+`). Both hard-code the seed's slug, so a Keeper who renames the soort's
  slug breaks both. The real fix is a "wearable" flag on `entry_types`. That is
  a migration and touches §18b and E3 at once, so it is a round of its own.
  *Half closed in round 57 (§96):* it is written once now, in
  `lib/newEntryType.ts`, and `lib/kamers/service.ts` imports and re-exports it.
  It is still the seed's slug; the flag is still a round of its own.
- ~~**Sentences over 60 characters cannot be fully rewritten in Beheer**
  (`cleanWordOverrides` cuts at 60; see §5).~~ **Closed in round 57 (§96):**
  the cap is `WORD_MAX` = 200.
- ~~**`CharacterSwitcher.tsx` still says *onderzoeker* in plain text** in the
  paragraph a new player reads first ("maak het {artikel} van je onderzoeker
  en zoek hem"), while the banner and the toast now say `{words.character}`.~~
  **Closed in round 57 (§96):** that paragraph is `characterFindHint`, with
  the Keeper's words for artikel and karakter.
- ~~**The focus-on-mount bug `NewEntrySheet` had is probably in other sheets
  too.** `Sheet` draws nothing on its first commit, so a `useEffect` that
  focuses a box on mount finds no box. `NewEntrySheet` now uses a callback ref
  (`attachName`). Nobody has checked the other sheets.~~ **Closed in round 62
  (§101):** it was in `NewCaseSheet` too; a sheet that wants a
  caret now marks the box `data-autofocus` and `Sheet` moves it there.
- ~~**O1 is still open** (see round 37 below): a new canvas opens in Lezen on a
  phone.~~ **Closed in round 55 (§94).**
- **Two small canvas trade-offs.** The prikbord's inspector and bar picker
  sit outside `.board-viewport`, as before. The phone-only 44 px tap rim on a
  tijdlijn tag (`::after`) can cover a few pixels of a neighbouring tag, which
  was accepted in exchange for a tag you can hit. ~~`.web-hint` in
  `app/globals.css` is no longer drawn by anything (the hint moved into the
  web's side column), and neither is the `web:hint-seen` storage key.~~
  *(`.web-hint` is gone from the stylesheet since round 57.)*
- **Flakes seen in round 51's runs, all green when re-run alone.** On the
  untouched baseline under load (two cores): `timelines.spec.ts:224`,
  `timeline-coop.spec.ts:269` and `round-28-mention-overlay.spec.ts:54`
  (phone). After the round: `characters.spec.ts:527` and
  `round-27-web.spec.ts:57` (phone). Re-run any of them alone before believing
  it.

**Round 49 (§88) leaves four, all named on purpose:**

- **Het icoontje wordt niet vierkant gemaakt.** Wat je uploadt gaat door
  dezelfde `fitUpload` als een logo en komt er als `?s=thumb` (400 px) weer
  uit; een breed plaatje wordt door de browser platgedrukt of ingesnoerd, per
  browser verschillend. De tekst onder het vakje zegt daarom "een vierkant
  plaatje werkt het best". Een echte uitsnede is §19's drie-vormen-machinerie
  en dat is een ronde, geen regel.
- **Er is geen `.ico` en geen `apple-touch-icon` van eigen maat.** Alle drie de
  `icons`-sleutels wijzen naar dezelfde PNG. Dat werkt in elke browser van deze
  eeuw; wie een scherpe snelkoppeling op een iPhone-beginscherm wil, heeft
  een tweede maat nodig en dus een tweede asset.
- **Een uitgelogde browser ziet het standaardicoon.** `/api/assets/[id]` geeft
  401 zonder sessie, dus de loginpagina draagt wél de juiste *naam* en niet het
  juiste *plaatje*. Dat is met opzet zo (zie §88) en het is de plek waar
  iemand ooit zal vragen om een uitzondering. Die uitzondering is dan een
  publieke route voor precies één asset-id, niet een losser `assets`-recht.
- **Browsers houden een favicon lang vast.** Vervangen is meteen zichtbaar in
  de HTML en vaak pas na een harde verversing in de tabbalk. De tekst onder het
  vakje zegt dat; er is geen cache-buster in het adres gezet, omdat dat het
  plaatje op élke paginalading opnieuw zou laten ophalen.

**Round 48 (§87) leaves two, both named on purpose:**

- **Nothing can set or move `is_home`.** The migrations put one on each side and
  no screen can point at a different overzicht, so a Keeper who wants another
  page as their front door cannot say so. It needs nothing today — both sides
  have one and `deleteOverzicht` refuses to bin either — but the day somebody
  wants to swap it, it is a write that has to keep the invariant *one per side*
  rather than a free flag.
- **A side with no front door falls back to the browse list, silently.** That is
  the right answer and it is tested, but it looks like a page that never got
  written rather than a page that is missing. If `is_home` ever becomes
  settable, that fallback is where the offer to make one belongs.

**Round 47 (§86) leaves four, all named on purpose:**

- **A kamer that is opened cannot be closed.** There is no button that takes one
  away, so a figure the Keeper gave a beurs to keeps it. That is deliberate —
  unmaking one belongs with the prullenbak (`lib/admin/trash.ts`), not with a
  button on an artikel — but it does mean a mis-click leaves a row on
  `/uitdelen` for ever. The cheap version is a Keeper-only "haal deze kamer
  weg" that refuses once anything has been spent.
- **`handOutTargets` asks `balanceOf` once per row.** At sixty rows that is
  sixty small queries on a Keeper-only page and nobody will feel it; at six
  hundred it is the first thing to fix, and the fix is one grouped sum.
- **The uitdeler's search is in the browser.** The whole list travels to the
  page and is filtered there, which is right at this size and wrong at ten
  times it. When it stops being right, the tell is the payload rather than the
  filtering.
- **Nothing marks *why* a kamer exists.** A kamer with `created_by` = the
  Keeper and no holder is §86's, and one whose holder left is not — they look
  identical in the table. Nothing needs to tell them apart today; if something
  ever does, that is a column and therefore a migration.


*(Rounds 39 to 45 never got a block here, and that is itself worth noticing: the
register stopped at 38 for eight rounds while the kamer was being built. What
those rounds left open is gathered under round 46 below, because the kamer is
one feature and its open ends are one list — and round 46 is where they were
finally written down.)*

**Round 46 (§85) closes the kamer's second half and leaves seven, all named on
purpose. The first four are in `docs/kamer-contract.md` under *Wat open staat*;
they are repeated here because that is where somebody looks.**

- **The catalogue row and the shop row are still two components.**
  `Catalogus` inside `components/kamer/PlaceButton.tsx` and
  `components/winkel/WinkelRij.tsx` say the same states with the same words and
  the same classes, and the contract asked for one. It was refused on purpose:
  `CatalogueEntry` is `ShopItem` minus exactly the six fields the picker
  already knows (it stands in front of one plek), so reuse meant inventing a
  `landsIn` and a `unique: false` that are not true. A lie in a type is dearer
  than a second component. If they are ever merged, the road is to widen the
  `catalogus` route to return real `ShopItem`s, not to fake one in the browser.
- **`.btn-small` is still 34 px outside this feature's pages.** §85 lifted the
  tap floor to `--tap` on `.kamer-page`, `.winkel-page`, `.uitdelen-page`,
  `.speler-page`, `.spelers-hal`, `.you-page`, `.entry-kamer` and
  `.kamer-catalogus` — on **pages**, so a button added there tomorrow inherits
  it. App-wide is Nick's call, exactly as it was in §69 6.1, and it would be a
  visible change to every phone screen in the archive.
- **The hall has no saldo column.** It would fit and it would break §76: the
  beurs shows only your own balance, never somebody else's. Do not add it
  without deciding that rule has changed.
- ~~**The presence dot is still an unlabelled 12 px circle on desktop.** The
  contract asked for a button with a word (*Wie is er?* + dot + count). It sits
  in the **shell** of every page in the archive, not on these seven screens, so
  it is a round about the shell rather than a line in this one. It did get its
  44 px on a phone.~~ **Closed in round 57 (§96)**, except on a canvas: on a
  desk the strip says *Wie is er?* beside the count and the dot
  (`.live-strip-who`, `presenceHeading`). A canvas heading keeps room for the
  strip as it was, and a phone keeps the dot. *Since golf M the strip is on
  a canvas and the prikbord too, in the band above the page; the heading
  keeps no room for it any more.*
- **The e2e suite has two reds that are not damage.**
  `per-place-crops.spec.ts:13` is the documented one from round 19 (see below),
  and `round-28-mention-overlay.spec.ts:54` on the **phone** project lost once
  in round 46's confirming run and passes alone — the §6 "not yet listening"
  race. Re-run it alone before believing it.
- **`roomSummary` now returns `total` and only the spelerspagina reads it.**
  One field, one reader; if a third screen ever needs "how many plekken are
  there at all", it goes through this one rather than counting rows again.
- **Nothing in this feature has a `phone` variant of its own e2e beyond what
  `kamer-ux.spec.ts` covers.** Three of its nine cases skip on mobile with a
  reason on each: the row height, the ledger and the grid are the same
  agreement at both sizes, and one proof is enough.

**Round 38 (§75) leaves four, all named on purpose:**

- ~~**An overzicht is not in `/search`.** The Start tab and the strip at the foot
  of every overzicht are the whole of its findability. It is a kind of its own
  in `lib/search/service.ts` plus a chip in `SearchScreen` — half an hour, and
  the first thing to pick up here.~~ **Closed in round 57 (§96)**, by name,
  under *Andere dingen* (`lib/search/others.ts`).
- **There is no link *grid*.** References inside a sectie are chips in running
  prose. A real block of chosen artikelen, drawn as the cards the wiki already
  has with a line of context each, is the next step and the one that makes
  "collect and group things" look like it does on a Fandom wiki.
- **`sort_order` and `icon` are in the table and in the PATCH, with no control
  to set them.** The strip is therefore ordered by name after the front door.
- **No `phone` spec.** There is no canvas, no gesture and no §73 mode in this
  round, so the phone variant would be the same clicks on a narrower screen.

**Round 37 (§72–§74) leaves these, all named on purpose:**

- ~~**The undo button behaves three ways in Lezen**~~ **Closed in round 51
  (§90, review O2).** It is visible and grey in Lezen on all four canvases now.
  On the tijdlijn it is `canUndo={handsOn && …}`, and on the stamboom it moved
  out of the making group and is `canUndo={editOn && …}`.
- ~~**A canvas you just made opens in Lezen on a phone.** The spec helpers press
  Bewerken for you; the app does not. Whether a fresh canvas should land in
  Bewerken (like an artikel on `?new=1`) is an open question for Nick. *Still
  open after round 51: the review (O1) advises Bewerken, and Nick has not
  decided yet.*~~ **Closed in round 55 (§94, O1).** Nick chose Bewerken; every
  maker sends `?new=1` (`freshHref`), and a reload is Lezen again.
- ~~**A notitie-speld's Naam and Tekst are still input boxes in Lezen**, so its
  peek opens on two fields rather than on its words. The panel's own controls
  were kept on purpose; showing the text read-only in Lezen is a small follow-up.~~
  **Closed in round 55 (§94, O6).** In Lezen a notitie-speld shows its text and
  joins no live room.
- **The edit sheets are still modal `Sheet`s** on a phone (gebeurtenis
  bewerken, los kaartje) — a form is a deliberate step.
- ~~**A tijdlijn window in the peek has its own `Sluiten`** beside the peek's.~~
  **Closed in round 51 (§90, review O7).** With one window in the peek there
  is one cross, the peek's. The window's own cross and the "fold every window"
  button appear only when more than one window is open.
- **Two flakes seen once in round 37's final run, both green alone and in the
  run before it**: `canvas-contract.spec.ts:442` (prikbord, a fresh card never
  "stable" for the corner click; then 14/14 green with `--repeat-each`) and
  `maps.spec.ts:627` on the phone. Re-run alone before believing either.
- **The web's own knijp was not moved onto `usePinch`.** It had none of the four
  bugs and it is one `<canvas>` (§5).

**One spec is red on untouched `main`, and has been since round 19.**
`tests/e2e/per-place-crops.spec.ts:13` ("a case crops a cover for itself
without touching the entry") tests a feature that no longer exists: round 19
made a picture carry one set of three crops, `case_entries.crop` is nulled and
unread, and the spec was never retired with the feature. Verified by running it
in a worktree at `1d67f5c`, round 22's base. It is pre-existing red, not
anybody's damage — retire the spec (or rewrite it for the three-crop road) the
next time somebody is in that file, and until then do not spend an hour
diagnosing it.

**Round 35 (§69) is finished — every item of `docs/canvas-contract.md`'s phase-2
list is built.** What it leaves is below, and it is all deliberate.

Three shapes this round introduced that a fifth canvas (or the next round) has
to know about, because getting them wrong is silent:

- **Each canvas's "world" is a different unit, on purpose.** A prikbord counts in
  board units, a stamboom in world units, a landkaart in **fractions of the
  picture**, a tijdlijn in **stage pixels**. `useMarqueeSelect` is shared, its
  arithmetic is unit-agnostic — but anything that *rounds* is not: the hook
  rounds the broadcast box to whole numbers, which is right in pixels and turns
  every fraction into 0 or 1. The landkaart therefore does not use
  `onBroadcast`; it sends the box itself, unrounded. A fifth canvas must decide
  which unit it is before it copies either.
- **A CSS rule that comes *before* the rule it overrides loses at equal
  specificity.** The 44 px tap targets (§69 6.1) sit near the top of
  `globals.css` and had no effect on `.ink-tool` (a thousand lines below) or
  `.tree-handle` (in `stambomen.css`). Two classes deep fixes it. The contract
  spec on the `phone` project found this; reading did not.
- **A modal `Sheet` over a canvas makes the canvas unreachable.** The contract
  asked for bottom sheets on the phone for the tijdlijn's window and the
  prikbord's inspector; both were built, both broke the spec suite for the right
  reason, and both are now **docked, non-modal** panels instead. The map's
  legend stayed a `Sheet` — a filter is a moment when you are doing nothing
  else. Anything docked over a canvas must stop its own pointer events (§6).

And the leftovers:

- **`maps.spec.ts` flakes under `E2E_DEV=1`**, in a different place each run
  (a speld that has not appeared within the 10 s expect, an undo that has not
  landed). It passes alone and it fails the same way on `0dc8ed5`, i.e. before
  any of round 35's second half — verified with a stash. Same family as
  `board-live.spec.ts:150`: a dev build compiling on the way in. Not anybody's
  damage, but it is the first thing that will look like it.

  **Round 36 measured it, and the mechanism is worth writing down.** One
  `E2E_DEV=1` run of that file lost `:78`, `:456`, `:562` *and* the new `:605`
  (§71) while the whole file passes in about a tenth of the time against a
  production build (9.8 s vs 1.6 min for `:78` alone). The reason is not the
  assertions: half the controls on a landkaart are `disabled={busy}`, and `busy`
  is held for the whole of a write **plus** the `router.refresh()` behind it (§5
  — a canvas on a server-rendered page refreshes after every write). Against a
  dev build that refresh recompiles the page, so a row like "Notitie … zetten"
  stays disabled not for a moment but for minutes, and *any* spec that sets two
  spelden in a row runs out of patience on the second. Two spec-side repairs
  round 36 made that are worth copying rather than rediscovering: wait for the
  row to be **enabled** (re-filling the box if the list rebuilt under you) and
  then click exactly **once** outside the retry loop — every click sets a speld,
  so a retried click sets two; and never read a count with a bare
  `expect(await locator.count())` where the number arrives with an RSC payload —
  `expect.poll(() => locator.count())` is the version that survives a dev build
  (that one is how `round-36-tabs.spec.ts` failed: the sheet said
  "Tabbladen: 17" while the row still held five).
- ~~**The prikbord has no `description` column**, so §69 (4.8)'s one shape of
  description field reached the tijdlijn and the stamboom and not the wall. That
  is a migration, and it was out of an S-sized item's scope. *Still open after
  round 55 (review O8): the prikbord moved onto §34 without it, because only
  round 54 was allowed a migration in that wave.*~~ **Closed in round 60
  (§99),** migration `0037_prikbord_beschrijving`.
- **Strings, the resize grip and the marquee are still desktop-only on the
  prikbord.** §69 (6.2) split `interactive` in two: a finger may now carry a
  *card*, because a card is the biggest thing on the cork. The other three hang
  off a few pixels or off a key a phone does not have. *Strings: closed in
  round 55 (§94, O10)* — *Touwtje* in the inspector, then a bar *Tik op de
  tweede kaart…* with *Toch niet*. The grip and the marquee are still a
  mouse's.
- **The long press has no e2e**, for the reason in
  `tests/unit/make-on-empty.test.ts`: Playwright taps and drags but cannot
  press-and-hold. The timer's rules are unit-tested and the wiring is asserted
  through the double-click.
- **`restorePin` / `restoreEvent` measure against the actor, not the deleter.**
  A Keeper can dig up a speld somebody else buried, which is right; but a player
  who may edit the landkaart cannot undo their *own* removal of a speld they did
  not set, because `removePin` refused it in the first place. Consistent, and
  worth knowing.
- **A buried row is swept at start-up, not on a timer.** A server that stays up
  for a month sweeps once. That is on purpose (see `lib/db/sweep.ts`) and it
  means a long-running instance keeps buried rows longer than a day.
- **The prikbord and the stamboom still push a whole snapshot** where the other
  two push an action. That is the right split — see rule 69 — but it does mean
  `undoStack<T>` carries two quite different `T`s, and a fifth canvas has to
  decide which kind it is before it picks one.

Round 33 (§67) leaves these, all named on purpose:

- **`approvePendingEdit` measures against the reviewer.** It applies a voorstel
  through `updateEntry` with `isKeeper: true`, so `keepUnseenRefs` asks "could
  the *reviewer* see this?" rather than "could the proposer?" — a proposal built
  without a Keeper-only ref loses it on approval.
- **The web's marquee was left alone.** `WebCanvas` is one `<canvas>` and a bag
  of mutable state and its box lives in screen space; moving it onto
  `lib/canvas/select.ts` would be a rewrite, not a reuse.
- **Ghosts are still not draggable, and now not selectable either** — `boxOf`
  answers `null` for them, so a sweep across the edge of the picture does not
  pick up six people who are not in this stamboom.
- **Large sibling sets are not capped in the graph.** One parent with forty
  children is 780 derived pairs; the artikel page stops at a hundred
  (`MAX_DERIVED_SIBLINGS`), the drawing does not — nearly all of them are drawn
  as nothing, but they are all worked out.
- **No birth date and no twins.** Order within a row is by barycentre, not by
  who is older, and a twin is indistinguishable from a brother.
- **No adoption or step-parent qualifier.** The road is a second parent-role
  field with a label of its own ("Adoptiefouders"), exactly as "Geschapen door"
  is one — and that is only safe now, because until this round the mirror's
  removal left such a second field standing.
- **`ROLE_HINTS` is written and read by nobody but its test.** The sentence
  under Beheer's role select is still the one shared line.
- **`m` in a pointer frame stays capped at forty and `holding` at sixty.** A
  group of more than forty does not travel whole across somebody else's screen
  mid-drag; the pull afterwards puts it right. Sight, not state.

Round 32 (§45/§66) leaves one worth naming here:

- **Three muted card colours in `app/globals.css` are still hard-coded**, and
  they were left alone deliberately because the round only turned the ones that
  were unreadable: `.board-card-kind` `#6d6357`, `.board-card-text-empty`
  `#8a8072` and `.board-card-text-input` `background: #fff`. All three sit on
  `--card-face`, which is a light paper in every scheme, so nothing is wrong
  today — but a Keeper who paints a dark card face gets grey on dark and a
  white box in the middle of it. The cure is the same one `--card-ink` got: a
  `color-mix` off `--card-ink` and `--card-face`, not three more tokens.

Round 31 (§66) leaves ten, all named on purpose — the eleventh is **closed**:

- ~~**A soort with two parent-role fields mirrors into the first one.**~~
  **Closed in round 33 (§67), half of it deliberately.** Adding still lands in
  the target soort's *first* field with the inverse role — one field chosen once
  beats one value in two boxes, and a Keeper can swap it by moving the fields in
  Beheer. **Removing now sweeps every field of that role**, which is the half
  that was a bug: an emptied "Schepselen: B" used to leave "Geschapen door: A"
  standing on the other page with no way to take it off.
- **The mirrored page gets no revision and no feed row.** Deliberate: B's
  geschiedenis (§65) does not fill up with what A typed on A's own page. The
  cost is that "who put me in this family?" is not answerable from B's history.
- **A `kin` claimed only by the *other* artikel's field makes no ghost.** Ghosts
  come from two places — the members' own role fields, and the ends of the
  tree's own ties — and `kin` is not mirrored, so a field on B saying "aspect of
  A" is never read while looking at A and puts no ghost beside A. (Parent, child
  and partner are complete, because the mirror writes them on both pages.)
- **Undo of an *add* on a stamboom does not delete server-side**, exactly as on
  a prikbord (round 29's leftover, same reasoning).
- ~~**The floating picker clamps itself inside the stage; the node menu does
  not.**~~ **Closed in round 35 (§69, 3.4).** Both are measured now rather than
  guessed: `lib/canvas/clamp.ts` holds the arithmetic (pure, unit-tested),
  `clampFloat` places the kiezer in stage coordinates on the height it actually
  has, and `flipsNeeded` + three `.tree-menu-*` classes open the knoopmenu
  upward or to one side when downward is off the glass. The menu could not be
  clamped the kiezer's way because it hangs off an anchor inside the *world*,
  which is under a CSS transform and has no honest stage coordinates.
- **The partner double line is offset 2 px in *world* units**, so below about
  25 % the two strokes merge into one.
- **`prefers-reduced-motion` makes a carried card jump between frames** instead
  of gliding. That is what the setting asks for, but it reads worse here than on
  a wall.
- **Ghosts are not draggable and not pinnable.** They stand where the layout puts
  them; adopt one first.
- **`viewerId`, `peopleNames` and `access` are passed to the canvas and unused** —
  the names beside the hands come off the live line.
- **`family_tree.restored` has no Dutch feed label** (neither does
  `board.restored`).
- **`writeEntryDate` still bypasses `updateEntry`.** It only ever writes
  `fields.date` so it cannot carry a role, but it is the one road into
  `entries.fields` that the mirror does not see.

Round 29 (§59–§62) leaves six, all named on purpose:

- **The leader tab (`ONE_LINE_PER_BROWSER`) is on.** It is the riskiest thing
  in the round. If it ever misbehaves in the field, that one constant in
  `components/live/LiveProvider.tsx` is the off switch and the fallback is a
  line per tab — which is where the archive was before round 29, not a broken
  state. `hasOneLineSupport()` already takes that road by itself where Web
  Locks or `BroadcastChannel` are missing.
- **HTTP/2 on the VPS is Nick's to enable**, and until it is, the leader tab is
  the only thing keeping a browser under the six-socket cap. The nginx block is
  in `README.md`'s deploy section (§60).
- **`placeWindows` lane heights are a global max per side per lane**, not per
  horizontal run, so one tall window pushes every lane-1 window out by its
  height even where there is room. Cosmetic; the fix is a per-run maximum and
  it is a rewrite of the second loop.
- **`board-live.spec.ts:150` sits at ~44 s of a 45 s cap under `E2E_DEV=1`**,
  inside `becomeInvestigator`'s dev compile. It passes with
  `--timeout=120000`. Pre-existing, not round 29's damage — but it is the first
  thing that will look like it.
- **Undo of an *add* on a prikbord does not delete server-side.** Deliberate:
  one person's Ctrl+Z must not remove a card another person hung up meanwhile.
  See `DECISIONS.md` round 29.
- **The tijdlijn's own name and description have no live field room.**
  Deliberately deferred in round 29's Q3; the gebeurtenissen have theirs.

Round 25 (§48) leaves three, all named on purpose:

- **A dossier handed back to the table does not hand its walls back.** Hiding
  travels inwards and revealing never does, so a Keeper who takes a dossier over
  and changes their mind has to hand each prikbord and tijdlijn back by hand.
  Deliberate; the alternative is a write that reveals things nobody pressed a
  button for.
- **Artikelen do not travel with a dossier's side at all**, in either
  direction — an artikel lies in several dossiers and §9's dial on it is its
  own. So an artikel made in a dossier *before* that dossier went over is still
  on the players' side, and the dossier's name in front of it is hidden only
  because `nameTheirCases` already gates it.
- **The filing offer asks once per artikel per visit**, in memory
  (`alsoHeld` in `CaseDossier`). A reload asks again about something the person
  said no to. A "no" that outlived the page would be a row in the database, and
  that is a bigger idea than this was.

Round 24 (§47) leaves two, both named on purpose:

- **"Opnieuw aanmaken" on a card whose artikel this viewer merely may not see
  writes a second artikel.** A MISSING stamp cannot say which of the two it is
  (rule 1), so the offer cannot either. Deliberate; see DECISIONS round 24.
- **Only prikborden can change dossier.** `timelines` (and `maps`, which has
  no case at all) carry the same gap. One `setBoardCase`-shaped function each
  would close it. *Round 31 narrowed this: a stamboom got
  `setFamilyTreeCase` on the day it was built, so it is now "prikborden and
  stambomen". Tijdlijnen and landkaarten still cannot — see DECISIONS round 31.*

Round 23 (§46, de spiegel) leaves three, all named on purpose:

- The wiki's **"Geheimhouding"** filter (Voor iedereen · Onthuld aan gekozen ·
  Alleen de Keeper, `lib/entries/browseFilters.ts`, Keeper-only) now overlaps
  the side: on the players' side `visibility=keeper` returns nothing, and on
  the Keeper's side everything is already keeper. Left as it is — it does
  nothing wrong, it is just a control that has lost half its job. Fold it into
  the side, or drop the third option, the next time somebody is in that file.
- A phone gets **no masthead stamp**. `.masthead-side` lives in `.masthead`,
  inside `.sidenav`, which is `display: none` below 768 px — so on a phone the
  toggle in the corner and the palette are the only sign of which side you are
  on. The e2e spec asserts presence rather than visibility there for this
  reason.
- ~~Firefox has no `startViewTransition`, so the flip is a plain navigation
  there; `prefers-reduced-motion: reduce` gets the same.~~ *Sinds §102 (ronde
  65):* de omslag is een **cross-document** view transition, geen
  `startViewTransition` (§57 maakte er een documentlading van). Firefox 144
  heeft same-document view transitions maar geen cross-document, dus daar is
  de omslag een gewone navigatie; `prefers-reduced-motion: reduce` en een
  toetsenbordactie krijgen hetzelfde. Bewust: de animatie is een versiering op
  iets dat zonder haar werkt.

Round 23 also **retired** round 22's `page:/keeper` leftover: `/keeper` is a
redirect into `/api/keeper/flip` now, so there is no page left to give presence
to.

Round 22 (§44, §45) leaves two, both named on purpose:

- "Kijk als speler" has a control only in the **desktop side menu**
  (`AsPlayerLink` inside `.sidenav`). A phone can be *in* the preview — the
  banner that turns it off is in the shell everywhere — but cannot start one.
  *Narrowed in round 57 (§96):* beside the Keeperversie switch, the Keeper
  panel and each sectie's dial, a page now says what the players see and
  offers *Bekijk als speler* (`PlayerSees`, the same `asPlayerHref`), and that
  sits in the page, so a phone can start the preview from there.
- The leak audit knowingly left four things as they are: collection-key change
  signals still fire for a keeper-only record (they name no row; accepted since
  §21); `isAdrift` in `lib/entries/caseName.ts`; `SUMMARY_COLUMNS` shipping
  `originCaseId` to a player's HTML; and `/api/assets/[id]` serving any asset
  to any signed-in account, which pre-dates all of this. One more is a property
  of the transport rather than a bug: an open `/api/live/site` connection keeps
  the rights it was opened with, so "kijk als speler" does not reach that
  stream until it reconnects.

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

- ~~The prikbord is not on the §34 canvas shell; `.board-viewport` still carries
  the old magic heights. Round 13 made cards resizable on that same wall without
  touching it, so the two do not block each other — but a wall of 250% cards is
  a better argument for the full-screen shell than it was.~~ **Closed in round
  55 (§94).** The prikbord is on `.page-canvas`, with its heading in
  `BoardCanvas` and its dossier choice under the fold.
- ~~`MapCanvas` does not `router.refresh()` after a pin **move**.~~ **Closed in
  round 35 (§69).**
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
- **The tijdlijn's image tools should match the prikbord's** — ~~built in round
  14, except the cropping~~. Nick's decision was that **pasting on the bare axis
  opens a new gebeurtenis at that moment, carrying the picture**, and that is
  what `pasteImage` in `components/timelines/TimelineCanvas.tsx` does
  (`tests/e2e/timelines.spec.ts`, "een geplakte afbeelding wordt een losse
  gebeurtenis met die afbeelding"). It guards itself against a paste meant for
  typing (`pasteIsForTyping`), against an open blad, against the full-size
  picture and against the potlood. The full-size view is there too (`lightbox`,
  the prikbord's own overlay and class), and a brand-new gebeurtenis gets its
  picture through that same paste road. **What is actually outstanding is
  cropping on a tijdlijn** (~3 h) and a picture chooser inside the
  nieuwe-gebeurtenis sheet itself — today a picture is attached from the blad
  of a gebeurtenis that already exists, or by pasting.
