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
npx vitest run         # 113 files, 2022 tests as of round 52 (round 38: 99 / 1596)
npm run build          # must exit 0
npx playwright test    # 157 passed / 25 skipped / 0 failed at round 11, ~20 min
                       # rounds 12 and 13 both add cases (round 13 touches a
                       # dozen specs), so take your own first green run as the
                       # baseline, not this line
```

Single specs, for planning a round rather than for waiting on the whole suite
(round 33, one project at a time): `family-trees` ~1.4 min, `family-trees-33`
~1.8 min (4.2 under `E2E_DEV=1`), `family-tree-coop` ~1 min, `ink` ~1.5 min.

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
  markers to match. Check `grep -rn "§[5-9][0-9]" app components lib` before
  choosing a number — the latest is **§91 / rule 91** (round 52: jouw plek. De
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
  `0032_sloten` (§89: `users.password_enc` leeggemaakt en gedropt, en alle
  sessies weg omdat ze voortaan met een HMAC worden opgeslagen — iedereen logt
  één keer opnieuw in; `scripts/restore.mjs` slaat kolommen over die niet meer
  bestaan, zodat een oude backup blijft openen), so **the next is `0033_`**.
  Before it: `0031_eigen_naam_en_icoon` (§88: `site_settings.favicon_asset_id` erbij, plus
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
  `onChange` from it, stop: that breaks the Yjs-bound path.
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
  that the writer produces a statement the mapping can read. One writer is
  still blind: the claim reset in `lib/admin/types.ts` (see §8, round 51).
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
  (`components/families/treeUndo.ts`) covers the tree's **own** state only —
  never a field on an artikel, for §29's reason.
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
  (`#tree-underfold` / `#map-underfold`) — and since §67 that portal is one
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
  maker button on a canvas bar asks *before* it makes (`ensureAuthor`, as the
  prikbord's *Nieuwe notitie* does). If the question comes after, it takes the
  caret away from what was just made. The non-canvas editors (`RichEditor`,
  `FieldsEditor`, `LiveFields`, …) keep `useAuthorGate`, because everything
  in them is writing.
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
  typed since and goes out again on the browser's `online`.
- **A key in `lib/words.ts` is cut to 60 characters when the Keeper overrides
  it** (`cleanWordOverrides`), and round 51 added sentences longer than that
  (`saveOffline`, `newEntryWhoReads`, `passwordReset`, `keeperGuestNobodyGift`,
  `keeperWearsNone`; `handoutEmpty` was already over). The fallback shows in
  full. A Keeper who rewrites one of them loses the tail. This is a leftover
  (§8, round 51), not a licence: keep a new key under 60 until the cap moves.

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
  `characters.spec.ts` do.
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
- **`/` on a desk puts the caret in the side menu's search box; it does not
  navigate** (§91). A spec that presses `/` and waits for `/search` only holds
  on a phone. On a desk, type into `nav-search` and press Enter, which lands on
  `/search?q=…`.
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
- **On a phone the infobox is a folded `<details id="block-info">`** that only
  springs open while *reading*, so a spec that switches to the editing face
  finds every field attached, laid out and `hidden`. Call `openInfobox()`
  (`family-trees-33.spec.ts`) before touching a field — it is a no-op at
  1440 px, where the same block is a `<section>` — and press the summary until
  `details.open` answers true, because a page that has just switched faces is
  not listening yet and a second click folds it back up.
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
- **Fingers go through CDP, and a released finger is named.**
  `Input.dispatchTouchEvent`: `touchStart`/`touchMove` list every finger that
  is down, and `touchEnd` lists **the finger that leaves** — leaving it out of a
  `touchMove` does not release it, and an empty `touchEnd` releases all.
  `tests/e2e/round-37-pinch.spec.ts` is the worked example. And put the fingers
  on bare paper with `elementFromPoint` first: a finger that lands on a docked
  inspector is a scroll, and the browser answers it with `pointercancel`.
- **On a phone a canvas's panel is a `.canvas-peek` with its own `Sluiten`**
  (§74), so scope any `Sluiten` locator to the dialog you mean.

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

## 8. Leftovers — rounds 11, 12, 13, 17, 18, 19, 22, 23, 24, 25, 29, 31, 32, 33, 35, 37, 38, 46, 47, 48, 49, 51 and 52

**Round 52 (§91) leaves these, all named on purpose.** Rounds 53–56 of the
review are still the plan for what comes next, and are not repeated here.

- **A long name in the Jij-blad is cut off without an ellipsis.**
  `.jij-who-name` is `inline-flex`, and a player's name is a bare text node
  inside it, so the name becomes an anonymous flex item and
  `text-overflow: ellipsis` never applies to it. The fix is one `<span>` round
  the name, carrying the overflow rules.
- **The saldo in the side menu is not `Beurs.tsx`.** It is a `<span
  class="nav-tail">` with the same shape (coin first, upright, ink, never
  `.stamp`), because a menu line has no room for the component's padding.
  K1 says a saldo *is* `Beurs.tsx`, so the contract now names this as an
  exception. If the two shapes ever drift, the side menu drifts first.
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
- **The side menu's search box searches what `/search` searches**, which is
  still only artikelen (review S3). A search over everything, and a palette
  (`⌘K`), are "later" in the review.
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

- **The plek-kiezer still offers huisraad nobody bought** (review E1).
  `placeItem` checks the plek and the visibility, but not the price or who
  owns it, so *Wat je al hebt* lists every stuk huisraad. Nick decided the fix
  (a lade per kamer, a `keeper_made` slot in `placeItem`, and *Ongedaan
  maken* in the koopmelding) and put it in **round 54**. Until then it is a
  known hole, not a surprise.
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
- **A Keeper's `room.placed` / `room.cleared` in a private kamer (§86) shows
  in a player's feed** once the thing placed is visible to them. The row names
  nobody (`visibleNamesOf` drops the onderzoeker, so it reads "in een
  kamer"), but the event itself is there.
- **Three kamer writes are still silent in the feed or on the live line.**
  `buyFurnishing` and `unlockSlot` write no activity row, so a koop is in
  nobody's feed. `handOut` writes one `room.granted` with neither `entryId`
  nor `characterId`. The claim reset in `lib/admin/types.ts` (when a soort's
  `one_of_a_kind` flips) updates `room_slots` by `id` alone, so `room:{id}`
  does not move (§5, the TABLES rule).
- **"Wat deze kamer je geeft" still says *je* in somebody else's kamer.** The
  empty sentence and the toasts were fixed. The heading (`roomEffects`) was
  not. K48 carries the exception.
- **`CHARACTER_TYPE_SLUG = 'investigator'` is written twice**, in
  `lib/kamers/service.ts` (for `mayHoldRoom`) and in `lib/newEntryType.ts` (for
  the `+`). Both hard-code the seed's slug, so a Keeper who renames the soort's
  slug breaks both. The real fix is a "wearable" flag on `entry_types`. That is
  a migration and touches §18b and E3 at once, so it is a round of its own.
- **Sentences over 60 characters cannot be fully rewritten in Beheer**
  (`cleanWordOverrides` cuts at 60; see §5).
- **`CharacterSwitcher.tsx` still says *onderzoeker* in plain text** in the
  paragraph a new player reads first ("maak het {artikel} van je onderzoeker
  en zoek hem"), while the banner and the toast now say `{words.character}`.
- **The focus-on-mount bug `NewEntrySheet` had is probably in other sheets
  too.** `Sheet` draws nothing on its first commit, so a `useEffect` that
  focuses a box on mount finds no box. `NewEntrySheet` now uses a callback ref
  (`attachName`). Nobody has checked the other sheets.
- **O1 is still open** (see round 37 below): a new canvas opens in Lezen on a
  phone.
- **Two small canvas trade-offs.** The prikbord's inspector and bar picker
  sit outside `.board-viewport`, as before. The phone-only 44 px tap rim on a
  tijdlijn tag (`::after`) can cover a few pixels of a neighbouring tag, which
  was accepted in exchange for a tag you can hit. `.web-hint` in
  `app/globals.css` is no longer drawn by anything (the hint moved into the
  web's side column), and neither is the `web:hint-seen` storage key.
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
- **The presence dot is still an unlabelled 12 px circle on desktop.** The
  contract asked for a button with a word (*Wie is er?* + dot + count). It sits
  in the **shell** of every page in the archive, not on these seven screens, so
  it is a round about the shell rather than a line in this one. It did get its
  44 px on a phone.
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

- **An overzicht is not in `/search`.** The Start tab and the strip at the foot
  of every overzicht are the whole of its findability. It is a kind of its own
  in `lib/search/service.ts` plus a chip in `SearchScreen` — half an hour, and
  the first thing to pick up here.
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
- **A canvas you just made opens in Lezen on a phone.** The spec helpers press
  Bewerken for you; the app does not. Whether a fresh canvas should land in
  Bewerken (like an artikel on `?new=1`) is an open question for Nick. *Still
  open after round 51: the review (O1) advises Bewerken, and Nick has not
  decided yet.*
- **A notitie-speld's Naam and Tekst are still input boxes in Lezen**, so its
  peek opens on two fields rather than on its words. The panel's own controls
  were kept on purpose; showing the text read-only in Lezen is a small follow-up.
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
- **The prikbord has no `description` column**, so §69 (4.8)'s one shape of
  description field reached the tijdlijn and the stamboom and not the wall. That
  is a migration, and it was out of an S-sized item's scope.
- **Strings, the resize grip and the marquee are still desktop-only on the
  prikbord.** §69 (6.2) split `interactive` in two: a finger may now carry a
  *card*, because a card is the biggest thing on the cork. The other three hang
  off a few pixels or off a key a phone does not have.
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
- Firefox has no `startViewTransition`, so the flip is a plain navigation
  there; `prefers-reduced-motion: reduce` gets the same. Deliberate: the
  animation is an ornament on something that works without it, and the
  alternative was carrying a library for one browser.

Round 23 also **retired** round 22's `page:/keeper` leftover: `/keeper` is a
redirect into `/api/keeper/flip` now, so there is no page left to give presence
to.

Round 22 (§44, §45) leaves two, both named on purpose:

- "Kijk als speler" has a control only in the **desktop side menu**
  (`AsPlayerLink` inside `.sidenav`). A phone can be *in* the preview — the
  banner that turns it off is in the shell everywhere — but cannot start one.
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

- The prikbord is not on the §34 canvas shell; `.board-viewport` still carries
  the old magic heights. Round 13 made cards resizable on that same wall without
  touching it, so the two do not block each other — but a wall of 250% cards is
  a better argument for the full-screen shell than it was.
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
