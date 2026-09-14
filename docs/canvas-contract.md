# Het canvas-contract — ronde 35, fase 1 (inventaris)

Opgesteld 14 september 2026 op `main` = `17b2edb` ("Lotta fixes", ronde 34, §68).
**Er is in deze fase geen regel code veranderd.** Dit document is de inventaris
uit `claude/plan-ui-ux-eenheid.md`: de drie tafels, ingevuld met wat de code
*vandaag* doet, elk vakje met bestand en regelnummer; daarna per rij één
voorgesteld doelgedrag, de open vragen voor Nick, en de werklijst voor fase 2
per as met een maat.

## Hoe je dit leest

- **Kolommen** zijn de plekken, **rijen** de gebaren. Elk vakje beschrijft
  gedrag, geen bedoeling, en draagt een verwijzing. Een vakje zonder
  verwijzing bestaat niet; waar iets *ontbreekt* staat "geen" mét de regel
  die dat laat zien.
- **`gemeten`** = het gebaar is echt gedaan in de gebouwde app, op 1440×900
  en/of 390×844 (Pixel 5-emulatie), tegen een verse `data-e2e`. De uitkomsten
  staan achterin onder *Metingen* met een `D-`/`P-`-nummer; een vakje verwijst
  ernaar.
- **Stempels** op elke afwijking: `TOEVAL` (converteren) · `BEWUST` (blijft,
  met de regel die hem beschermt) · `OPEN` (Nick beslist; hier niet gekozen).
  De lijst *Bewust anders* uit het plan is de enige bron van `BEWUST`; twee
  dingen die daar niet op staan maar wel een regel achter zich hebben, zijn
  als `BEWUST` gestempeld **met de regel erbij** en staan ook onder *Open
  vragen*, zodat Nick ze kan afkeuren (het wiel op de tijdlijn — §68; de
  snap op de precisie van een gebeurtenis — §62/`snapTo`).
- Het **web** staat in tafel 1 om te vergelijken, niet om te converteren
  (plan, *Bewust anders*). Zijn vakjes tellen niet mee in "de meerderheid";
  waar zijn *woorden en knoppen* op de rest kunnen lijken, staat dat bij het
  doel.

### Afkortingen in de verwijzingen

| | |
|---|---|
| `BC` | `components/boards/BoardCanvas.tsx` |
| `BCard` / `BI` / `BP` / `BT` | `components/boards/BoardCard.tsx` / `BoardInspector.tsx` / `BoardPicker.tsx` / `BoardTray.tsx` |
| `UBL` / `UBS` | `components/boards/useBoardLive.ts` / `useBoardSync.ts` |
| `MC` / `MKT` | `components/maps/MapCanvas.tsx` / `MapKeeperTools.tsx` |
| `TC` / `ES` | `components/timelines/TimelineCanvas.tsx` / `EventSheets.tsx` |
| `FC` / `TH` / `TN` / `TT` | `components/families/FamilyTreeCanvas.tsx` / `TreeHandles.tsx` / `TreeNode.tsx` / `TreeTitle.tsx` |
| `WC` / `WV` / `PSB` | `components/web/WebCanvas.tsx` / `WebView.tsx` / `PinSelectionButton.tsx` |
| `view` / `sel` / `marq` / `undo` | `lib/canvas/view.ts` / `lib/canvas/select.ts` / `components/canvas/useMarqueeSelect.ts` / `components/canvas/undoStack.ts` |
| `InkShell` / `InkTools` / `useCanvasInk` / `panZoom` | de bestanden onder `components/ink/` |
| `time` / `inkSpace` | `lib/timelines/time.ts` / `lib/timelines/inkSpace.ts` |
| `Sheet` / `UiP` / `MP` | `components/ui/Sheet.tsx` / `UiProvider.tsx` / `MentionPopover.tsx` |
| `EntryPicker` / `CasePicker` / `FamilyTreePicker` / `RevealPicker` / `FieldsEditor` | `components/entry/EntryPicker.tsx` … (`FamilyTreePicker` staat in `components/families/`) |
| `LiveProvider` | `components/live/LiveProvider.tsx` |
| `CSS` / `SCSS` / `TCSS` | `app/globals.css` / `app/stambomen.css` / `app/timelines.css` |
| `isPhone` | `components/useIsPhone.ts` — `(max-width: 767px)` (`isPhone:5`), server-side `false` (`:39`) |

Gedeelde constanten die overal terugkomen: `MIN_ZOOM` 0.25 · `MAX_ZOOM` 2.5 ·
`FIT_PADDING` 48 (`view:21-24`); `clampZoom` (`view:30-33`), `fitViewport`
(`view:62-82`), `zoomAbout` (`view:89-95`); `DRAG_SLOP` 4 (`FC:152`);
`UNDO_LIMIT` 50 (`undo:31`); `--tap: 44px` (`CSS:30`), `.btn-small`
`min-height: 34px` (`CSS:482-485`).

---

## 0. De handelingstelling — wat Nick eerst leest

Het minimum aantal handelingen (klik/tik, toets, sleep, wiel-klik of knijp
tellen elk 1; een naam typen telt 1) voor de vijf taken uit het plan, per plek,
**nu**. `∞` = er is geen weg. De verwijzing bij een getal is de rij van tafel 1
waar het uit volgt.

| Taak | Prikbord desk / tel | Landkaart desk / tel | Tijdlijn desk / tel | Stamboom desk / tel | Web desk / tel |
|---|---|---|---|---|---|
| **A** iets nieuws maken en het op zijn plek zetten | **2 / ∞** — `Nieuwe notitie` (`BC:2502`) + sleep; op de telefoon kan een kaart niet slepen (`BC:418,1180`), de notitie landt in het midden | **4 / 4** — `Speld zetten` → tik plek → naam → Enter (`MC:924-935, 602-613, 1445-1453`); het blad dat daarna opent kost nog een Escape | **4 / 4** — dubbelklik op de as (`TC:1041-1053`) of lang drukken 500 ms (`TC:1070-1086`) → naam → `Losse gebeurtenis` → `Op de tijdlijn zetten` (`ES:335-372, 445`) | **5–6 / 5–6** — zoekvak → naam → `‘X’ aanmaken` → [soort] → `Aanmaken` → sleep (`FC:2103-2113`, `EntryPicker:169-195`, `FC:1284-1301`); vingersleep: zie `P-S2` | **∞ / ∞** — het web maakt niets (`WV`/`WC`: geen POST; alleen `PSB:102-106` naar een prikbord) |
| **B** iets terugvinden dat buiten beeld ligt | **1 / 1** — `Alles in beeld` (`BC:2412`), ook op de telefoon | **1 / 1** — `Passend maken` (`MC:956-958`); op naam: Legenda → typ → tik = 3 (`MC:865-891`) | **1 / 1** — `Alles in beeld` of `0` (`TC:1639, 1116`) | **1 / 1** — `Alles in beeld` (`FC:2211-2221`) | **1 / 1** — `Alles in beeld` / `f` (`WV:693`, `WC:2347`); telefoon: knijpen |
| **C** iets weghalen | **2 / 2** — klik + `Delete` (`BC:1735`) of inspector-knop (`BI:416`); geen bevestiging (`BC:942-972`) | **3 / 3** — tik speld → `Speld weghalen` → bevestig (`MC:594, 1342, 716-726`) | **4 / 4** — tag → `Bewerken` → `Van de tijdlijn halen` → `Weghalen` (`TC:2126`, `ES:784`, `TC:1389-1397`) | **3 / 4** — klik + `Delete` + bevestig (`FC:1972, 1323`); telefoon via `…` → item → bevestig | **∞ / ∞** — een knoop is een record (`WC:2340-2353`: geen Delete) |
| **D** een fout (verplaatsing) ongedaan maken | **1 / 1** — Ctrl+Z of knop `Ongedaan maken` (`BC:1730, 2415`) | **∞ / ∞** — geen undo voor spelden (`MC`: geen `undoStack`, `:421-429`) | **∞ / ∞** — geen undo voor gebeurtenissen (`TC:1098-1127`, geen `undoStack`) | **1 / 1** — Ctrl+Z of knop (`FC:1966, 2155-2165`) | **∞ / ∞** — geen undo (`WC`/`WV`: geen `undo`) |
| **E** van lezen naar bewerken (potlood) en terug | **2 / 2** — potlood aan, Escape of potlood uit (`InkTools:105-115`, `useCanvasInk:134`) | **2 / 2** (`MC:1058`, `InkTools:105-115`) | **2 / 2** (`TC:1838`) | **2 / 2** (`FC:2559`) | **∞ / ∞** — geen potlood, geen bewerkgezicht (`components/web/*`: 0 imports uit `components/ink`) |

Twee kanttekeningen bij E: op elke plek is E **∞ voor een speler** zolang de
Keeper de tekenlaag uit heeft (`InkShell:52` rendert de balk dan niet), en op
de telefoon is de enige weg terug de potloodknop zelf (geen Escape).

**Vóór → ná** (verwacht, als de doelen hieronder worden aangenomen; de echte
hertelling hoort bij *Klaar is klaar* punt 4):

| Taak | Prikbord | Landkaart | Tijdlijn | Stamboom |
|---|---|---|---|---|
| A desk / tel | 2 / ∞ → **2 / 2** (vingersleep, rij 14) | 4 / 4 → **4 / 4** (het blad wordt een paneel, de Escape valt weg; rij 12) | 4 / 4 → **4 / 4** (afhankelijk van `OPEN` (vraag 4)) | 5–6 / 5–6 → **5 / 5** |
| B | 1 / 1 | 1 / 1 | 1 / 1 | 1 / 1 |
| C desk / tel | 2 / 2 | 3 / 3 → **2 / 2** (+1 als bevestigen blijft — `OPEN` (vraag 6)) | 4 / 4 → **2 / 2** (+1 idem) | 3 / 4 → **3 / 3** |
| D desk / tel | 1 / 1 | ∞ / ∞ → **1 / 1** (undo van een verplaatsing, rij 9) | ∞ / ∞ → **1 / 1** | 1 / 1 |
| E | 2 / 2 | 2 / 2 | 2 / 2 | 2 / 2 |

Waar een getal niet daalt (B, E, A op de tijdlijn en stamboom) is dat omdat
de plek al op het minimum zit dat de gebaren toelaten; de winst van deze ronde
zit daar niet in *minder* handelingen maar in *dezelfde* handelingen.

---
## Tafel 1 — het glas

Kolommen: **Prikbord** `BC` (`/b/[id]`, stage `.board-viewport`) · **Landkaart**
`MC` (`/maps/[slug]`, `.map-stage`, coördinaten zijn fracties van `.map-world`) ·
**Tijdlijn** `TC` (`/timelines/[slug]`, `.timeline-stage` — 1-D: `View = {
origin, pxPerSecond }` `TC:154`; er bestaat geen `.tl-*`-klasse, alles heet
`.timeline-*`) · **Stamboom** `FC` (`/stambomen/[slug]`, `.tree-stage`,
wereldlaag `.tree-world` `FC:2247-2250`) · **Web** `WC`/`WV` (`/web`, één
`<canvas class="web-canvas">` `WC:2384`; *vergelijking*).

Wie op welke gedeelde code staat (`grep` in de map van elke plek):

| | `lib/canvas/view.ts` | `lib/canvas/select.ts` + `useMarqueeSelect` | `undoStack` | `components/ink/*` |
|---|---|---|---|---|
| Prikbord | ja (`BC:1653`, `:1683`) | ja (`BC:454-461`) | ja (`BC:367`) | ja (`BC:652-665`, `:3004`) |
| Landkaart | **nee** (0 hits; eigen `MIN_ZOOM_FACTOR`/`MAX_ZOOM` `MC:44-45`) | **nee** (0 hits; `selectedId` `MC:199`) | **nee** | ja (`MC:1058`) |
| Tijdlijn | **nee** (0 hits; eigen `View` + `fence` `TC:323-336`) | **nee** (0 hits; `open[]` `TC:362`) | **nee** | ja (`TC:1838`) |
| Stamboom | ja (`FC:783-790`, `:750-754`) | ja (`FC:348-350`) | ja (`FC:275`) | ja (`FC:2559`) |
| Web | nee (`ZOOM_MIN` 0.12 / `ZOOM_MAX` 12 `WC:107,114`) | nee (eigen kader in schermruimte `WC:2146`) | nee | nee (0 imports) |

### Rij 1 — Pannen

| Gebaar | Prikbord | Landkaart | Tijdlijn | Stamboom | Web |
|---|---|---|---|---|---|
| Linkerknop op leeg papier | pant 1:1 vanaf de eerste move, geen drempel (`BC:1316-1320`, `:1381-1388`); `button !== 0` → niets (`BC:1268`); allowlist die niet pant: `.board-card, .board-inspector, .board-tray, .board-tray-spine, .board-end-handle, .board-grip, .ink-capture, .ink-toolbar, .board-picker` (`BC:1270-1287`); geen `setPointerCapture` (0 hits), `window` pointerup maakt af (`BC:1751-1777`); werkt ook read-only en op de telefoon | pant na **5 px** (`DRAG_THRESHOLD` `MC:46`, `:564`), capture op de stage **op pointerdown** (`MC:492`); alleen `button === 0` of niet-muis (`MC:489`); een sleep op andermans speld pant ook (`MC:383-384`, `:526`, `:567`) | pant 1:1 vanaf de eerste move (`TC:1014-1016`), capture **op pointerdown** (`TC:959`); `moved` pas bij `\|dx\| > 3` (`TC:1015`); **geen knop-check** op de stage (`TC:948-953`) — zie rij 11 | pant 1:1 vanaf de eerste move (`FC:1084`), capture **op pointerdown** (`FC:1016`); `moved` bij `\|dx\| > 3 \|\| \|dy\| > 3` per as (`FC:1083`) en beslist alleen of de up de selectie leegt (`FC:1106-1111`); **geen knop-check** (`FC:986-1044`); allowlist `FC:1000-1002` | pant na **4 px** (`WC:2115`), capture op pointerdown (`WC:2030`); in Kolommen pant ook een druk op een kaart (`WC:2119`) |
| Trackpad-scroll / wiel zonder ctrl | **verticaal zoomt**, **horizontaal pant x** (`\|deltaX\| > \|deltaY\|` en geen ctrl → `x −= deltaX`, `BC:1644-1647`); niet-passieve listener met `preventDefault` op de viewport (`BC:1619-1635`), uitgezonderd `.board-tray, .board-inspector, .ink-toolbar, .suggest-list, .board-picker` (`BC:1626`) — `gemeten D-B1/D-B3`: `deltaY −100` → 110 %, `−300` in één event → 121 % (vaste factor); `deltaX +120` → 120 px naar links | **elk wiel zoomt**, `deltaX` genegeerd (`MC:620-623`, geen `ctrlKey`-check: 0 hits op `ctrlKey\|metaKey\|shiftKey\|altKey`); `preventDefault` behalve boven `.map-legend` (`MC:627-636`) — `gemeten D-M1`: ×1.16 per `deltaY 100`, ctrl+wiel idem, `deltaX` niets | **verticaal pant**: `origin += (sideways ? deltaX : −deltaY) / pxPerSecond` (`TC:750-752`, §68 `TC:732-748`); horizontaal pant in de scrollbar-richting (`+deltaX`), verticaal "met de hand mee" (`−deltaY`) — twee tekens in één handler; `passive: false` + `preventDefault` (`TC:727, 756`) — `gemeten D-T1`: `deltaY +100` → het papier 100 px naar **rechts**, `deltaX +120` → 120 px naar **links** | **elk wiel zoomt**, `deltaX` genegeerd (`FC:795-802`, alleen `deltaY` `FC:798`), `preventDefault` (`FC:796`) — `gemeten D-S1`: 82 → 95 %, ctrl+wiel 95 → 111 %, `deltaX` niets | elk wiel zoomt (`WC:2270-2283`), `deltaX` nergens gelezen (0 hits) |
| Shift+wiel | geen eigen tak (0 hits `shiftKey` in `onWheel`) | geen | geen eigen tak; de code rekent erop dat de browser shift+wiel als `deltaX` levert (`TC:736-738`) — browserafhankelijk, niet headless te meten | geen | geen |
| Spatie+sleep | geen (0 hits `' '`/`Space`) | geen (enige window-keydown gaat naar inkt, `MC:421-429`) | geen (`onStageKey` kent ArrowLeft/Right, `+` `=` `-` `_` `0`, Escape, `TC:1098-1127`) | geen (keydown kent Escape, Ctrl+z, Delete, Backspace, `FC:1940-1982`) | geen (`WC:2340-2353`) |
| Pijltjestoetsen | geen | geen | **ArrowLeft/Right 60 px, met shift 240 px**, alleen als de stage focus heeft (`tabIndex={0}` `TC:1664`, `TC:1097-1104`) | geen | geen |
| Eén vinger | pant op kaal kurk (zelfde pad, `BC:1316`; `touch-action: none` `CSS:1869`); op een kaart: kiest, sleept niet (`BC:1178-1180`); hint `Verschuiven werkt het best op een tablet of computer.` (`BC:2539`) — `gemeten P-B4/P-B5`: vinger op kurk pant 80 px, vinger op een kaart 0 px | pant (`MC:507`, `touch-action: none` `CSS:4372`); na een knijp gaat één vinger door als pan (`MC:586`) | pant (`TC:948`, `CSS:4913`); tweede vinger → knijp (`TC:964-968`); geen traagheid (0 hits `requestAnimationFrame\|inertia`) | pant (`SCSS:179`); vinger op een kaartje = kiezen/slepen (`FC:1049`, `SCSS:340`) — `gemeten P-S2`: 100 px mee, en na herladen nog gepind | pant of sleept een knoop (`WC:2027-2131`, `CSS:5644`) |
| Pannen terwijl het potlood uit is | `.ink-capture` z 30 neemt de pointer (`InkShell:51`, `InkTools:264`) → geen pan; **wiel zoomt nog** (geen wheel-handler op het vel, bubbelt naar `BC:2567`) — `gemeten D-B8`: 110 → 121 % | idem; wiel zoomt nog (`MC:972`) — `gemeten D-M3`: 1.485 → 1.725 | idem; **wiel pant nog** (listener op de stage-node `TC:724-756`, het vel is een kind) — `gemeten D-T5`: pant 100 px; ctrl+wiel zoomt (10 → 12 ticks) | idem; wiel zoomt nog (`FC:801`) — `gemeten D-S6`: 111 → 129 % | n.v.t. |

**Afwijkingen.**
- Wiel zonder ctrl: zoomen (prikbord, landkaart, stamboom, web) tegenover pannen (tijdlijn). **`BEWUST` — §68** (README regel 68, `TC:732-748`): "het wiel op een tijdlijn sleept het papier de kant van de hand op" is een regel van ronde 34 op een 1-D as. Staat niet in *Bewust anders*; daarom ook `OPEN` (vraag 1).
- Horizontaal wiel: het prikbord pant x (`BC:1644`), de drie andere doen niets. `TOEVAL` naar de letter van het plan; het is óók het enige gebaar waar de meerderheid "niets" is — `OPEN` (vraag 2).
- Drempel voor "dit was een sleep, geen klik": 0 (prikbord), 5 (landkaart), 3 (tijdlijn), 3 per as (stamboom), 4 (web). `TOEVAL` → `DRAG_SLOP` 4 (`FC:152`), hypot.
- Pointer capture bij een pan op kaal papier: prikbord geen (window-listeners), de rest op pointerdown. Op kaal papier is capture-op-down onschadelijk (er ligt geen `<a>` onder); `TOEVAL`, laag.
- Rechter-/middelknop start een pan op de tijdlijn en de stamboom (geen `button`-check, `TC:948`, `FC:986`); prikbord, landkaart en web weigeren `button !== 0`. `TOEVAL` → zie rij 11.
- Pijltjestoetsen alleen op de tijdlijn. `TOEVAL` in de letter; hoort bij `OPEN` (vraag 3) (toetsen).

**Doel.** Een gewone sleep op leeg papier pant, met de vinger ook; het wiel zoomt om de cursor (tijdlijn: pant, §68) en ctrl+wiel zoomt overal; één `DRAG_SLOP` van 4 px beslist klik-of-sleep; alleen de linkerknop en een vinger beginnen een pan. *Waarom:* dat is wat drie van de vier plekken al doen, en de tijdlijn heeft er een regel voor.

### Rij 2 — Zoomen

| Gebaar | Prikbord | Landkaart | Tijdlijn | Stamboom | Web |
|---|---|---|---|---|---|
| Wiel | vaste factor **×1.1 / ÷1.1 per event**, ongeacht `deltaY` (`BC:1649-1655`), om de cursor via `zoomAbout` (`BC:1653`) — `gemeten D-B1` | `exp(−deltaY × 0.0015)` om de cursor (`MC:620-623`) — `gemeten D-M1` | wiel pant (rij 1); **ctrl/cmd+wiel** `exp(−deltaY × 0.0015)` om de cursor (`TC:729-730`) | `exp(−deltaY × 0.0015)` om de cursor (`FC:795-799`) — `gemeten D-S1` | `exp(−deltaY × 0.0016)` px-modus, `× 0.05` bij `deltaMode 1` (`WC:2273`) |
| Ctrl+wiel | identiek aan wiel; `ctrlKey` omzeilt alleen de horizontale pan-tak (`BC:1644`); browserzoom geblokkeerd door `preventDefault` (`BC:1631`) — `gemeten D-B2` | identiek (geen modifier gelezen) | zoomt (`TC:729-730`) | identiek (`FC:795-799`) | identiek (`WC:2270-2283`) |
| Knijpen | alleen `touches.length === 2` via `onTouchMove` (`BC:1658-1670`); `zoom = clampZoom(startZoom × dist/startDist)` en **alleen `zoom` gezet, x/y ongewijzigd → anker linksboven** (`BC:1668-1669`); beide vingers raken ook `onSurfacePointerDown` (`BC:1316`) — `gemeten P-B2`: zoom 0.74 → 1.35, `y` ongewijzigd, `x` schuift 50 px — **niet om het vingermidden, en de tweede vinger pant er doorheen** | tweede pointer → `pinch` (`MC:494-505`); zoom om het **midden van de vingers**, verankerd op het startmidden (`MC:546-560`) — `gemeten P-M3`: 0.47 → 0.94 om het vingermidden (twee vingers die in één `touchstart` neerkomen: geen knijp) | tweede pointer (`TC:964-968`), `zoomAt(dist/pinchDist, mid)` om het midden (`TC:1004-1010`) — `gemeten P-T3`: 3 → 5 ticks | twee pointers in `touches` (`FC:1009-1015`), `zoomBy(dist/vorige, midpunt)` (`FC:1057-1064`); alleen als beide vingers op kaal papier landden (`FC:999-1005` vóór `:1009`) | om het vingermidden, midden sleept mee (`WC:2094-2110`) |
| Knoppen | `zoomAround(1/1.25)` / `(1.25)` om het midden (`BC:2403, 2407`, `:1595-1596`) | `zoomBy(1/1.4)` / `(1.4)` om het midden (`MC:950, 953`, `:266-267`) | `zoomAt(1/1.6, width/2)` / `(1.6, …)` om het midden (`TC:1633, 1636`) | `zoomBy(1/1.25)` / `(1.25)` om het midden (`FC:2203, 2207`, `:786`) | `zoomBy(1/1.3)` / `(1.3)`, geanimeerd 380 ms (`WV:690, 696`, `WC:981-985`) |
| Toetsen | **geen** (`BC:1708-1743`; 0 hits `'+'\|'-'\|'0'`) | **geen** (`MC:421-429`) | `+`/`=` ×1.6, `-`/`_` ÷1.6, `0` = alles in beeld — alleen met de stage gefocust (`TC:1106-1119`, `:1660-1664`) | **geen** (`FC:1940-1982`) | `+`/`=`, `-`, `f`/`F` bij canvas-focus (`WC:2343-2348`, `:2364`) |
| Dubbelklik | zoomt niet; op een kaart opent hij (`BCard:496-499, 627-630`); op kaal kurk niets (0 hits `onDoubleClick` in `BC`) | geen handler (0 hits) | zoomt niet; **opent het nieuwe-gebeurtenis-blad op dat moment** (`TC:1041-1053`, alleen `canEdit`) | geen (0 hits in `FC`, `TN`, `TH`) | zoomt niet; op een knoop = nieuw middelpunt (`WC:2239-2241`) |

**Afwijkingen.**
- Wielfactor: vaste 1.1 (prikbord) tegenover `exp(−deltaY × 0.0015)` (landkaart, stamboom, tijdlijn-ctrl). `TOEVAL` → de exp-formule als één helper in `view.ts`.
- Knijpen op het prikbord zoomt om de oorsprong en zet x/y niet (`BC:1669`), de rest om het vingermidden. `TOEVAL` → `zoomAbout` om het midden.
- Knopstap 1.25 / 1.4 / 1.6 / 1.25. `TOEVAL` → 1.25 (twee van de vier, en de kleinste stap die nog zichtbaar is).
- Toetsen: alleen de tijdlijn (en het web). `OPEN` (vraag 3).
- Dubbelklik op leeg papier maakt iets, alleen op de tijdlijn (`TC:1041`). `OPEN` (vraag 4).

**Doel.** Wiel en ctrl+wiel zoomen om de cursor met `exp(−deltaY × 0.0015)`, knijpen om het vingermidden, knoppen ×1.25 om het midden, alles door `zoomAbout`; dubbelklik zoomt nergens. *Waarom:* de landkaart en de stamboom doen dit al en het prikbord staat al op `zoomAbout` — het is één factor en één anker die nog niet gedeeld worden.

### Rij 3 — Zoomanker, `MIN_ZOOM`, `MAX_ZOOM`, stap

| | Prikbord | Landkaart | Tijdlijn | Stamboom | Web |
|---|---|---|---|---|---|
| Anker wiel / knijp / knoppen | cursor (`BC:1653-1654`) / oorsprong (`BC:1669`) / midden (`BC:1595-1596`) | cursor (`MC:621`) / vingermidden (`MC:549-558`) / midden (`MC:266-267`) | cursor (`TC:716-717`) / vingermidden (`TC:1004-1010`) / `width/2` (`TC:1109, 1114, 1633, 1636`) | cursor (`FC:798`; anker is de *border*-box, 1 px naast de padding-box waar `.tree-world` op ligt — `FC:797-798` vs `panZoom:53-54`) / vingermidden (`FC:1061`) / midden (`FC:786`) | cursor / vingermidden / schermmidden (`WC:2275-2281, 2099-2107, 984`) |
| MIN / MAX in werking | 0.25 / 2.5 via `clampZoom` (`view:21-22, 30-33`; `BC:1668`) | **`fitZoom × 0.4`** / **8** in beeldpixels (`MC:44-45`, `:255-258`); zoom 1 = 1 beeldpixel per CSS-pixel (`MC:979-981`) | **1 px per jaar** (`MIN_PX_PER_SECOND` `time:576`) / **200 px per eenheid van de schaal** (`maxPxPerSecond` `time:571-573`); met een anker is de vloer `stageWidth / spanSeconds` (`TC:327`) | 0.25 / 2.5 (`view:21-22`, re-export `lib/families/layout.ts:974-983`) | 0.12 / 12 (`WC:107, 114`); Kolommen-vloer 0.45 (`WC:961`) |
| Stap per knopklik / wielfactor | ×1.25 (`BC:2403`) / ×1.1 vast (`BC:1652`) | ×1.4 (`MC:950`) / `exp(−dY·0.0015)` (`MC:622`) | ×1.6 (`TC:1633`) / `exp(−dY·0.0015)` (`TC:730`) | ×1.25 (`FC:2203`) / `exp(−dY·0.0015)` (`FC:798`) | ×1.3 / `exp(−dY·0.0016)` |
| Aan de rand | view beweegt niet (`view:91`) | `clamp` in `zoomBy` (`MC:255-268`); **`fit()` klemt niet** (`MC:223-229`) — `gemeten D-M5`: 200×150 px → fit 5.04, `Inzoomen` 7.06 → 8 (plafond) | `fence` na elke zoom (`TC:713, 332-336`) | view beweegt niet (`view:91`) | klem (`WC:2274`) |
| Uitlezing | `NN%` in `.board-zoom-level` (`BC:2406`) | geen | geen | `NN%` in `.tree-zoom-level` (`FC:2206`) | geen |
| Onthouden | in het borddocument (`markDirty({viewport})` `BC:1601`, `:274`) | niet (deep link `?pin=` centreert, `MC:358-364`) | eerste view = fit (`TC:343-346`) | `localStorage['tree:{id}:view']` (`FC:530, 760-767`) | niet |

**Afwijkingen.**
- Landkaart: vloer relatief aan fit, plafond absoluut in beeldpixels; `MIN_ZOOM`/`MAX_ZOOM` uit `view.ts` niet gebruikt. Niet op de lijst → `TOEVAL` naar de letter, maar met een structurele reden om het niet te zijn: zoom 1 betekent er "1 beeldpixel", en een kaart van 400 px breed is bij 2.5 nog steeds klein terwijl een kaart van 4000 px bij 0.25 nog goed leest. `OPEN` (vraag 5).
- Tijdlijn: MIN/MAX in seconden — een schaalverschil, geen zoomfactor; de as heeft geen "zoom 1". `BEWUST` bij implicatie van *Bewust anders* ("inktdikte in seconden", `inkSpace`), geen aparte vraag.
- Wiel-anker op de stamboom 1 px naast de padding-box (`FC:797-798`) waar de inkt het wél goed doet (`panZoom:53-54`). `TOEVAL`, klein.
- `fit()` van de landkaart klemt niet en heeft geen padding. `TOEVAL` → `fitViewport`.
- Uitlezing `NN%` op twee plekken. `TOEVAL` → zie rij 5.

**Doel.** Anker = cursor (wiel), vingermidden (knijp), midden (knoppen); `MIN_ZOOM`/`MAX_ZOOM`/`FIT_PADDING` uit `view.ts` op prikbord en stamboom (al zo), de tijdlijn in zijn eigen eenheden, de landkaart afhankelijk van `OPEN` (vraag 5) — maar altijd via `clampZoom`/`fitViewport`. *Waarom:* de twee plekken op `view.ts` verschillen nergens; de rest moet alleen door dezelfde functies heen.

### Rij 4 — "Alles in beeld"

| | Prikbord | Landkaart | Tijdlijn | Stamboom | Web |
|---|---|---|---|---|---|
| Knop: tekst / `aria-label` / `title` / icoon | `Alles in beeld` (tekst) / geen / geen / geen (`BC:2412-2414`, `btn btn-small`) | geen tekst / **`Passend maken`** / `Passend maken` / `fit` 16 px (`MC:956-958`) | geen tekst / `Alles in beeld` / `Alles in beeld` / `fit` (`TC:1639-1641`) | `.tree-tool-word` "Alles in beeld" (verborgen ≤600 px `SCSS:863-865`) / `Alles in beeld` / `Alles in beeld` / `crosshair` (`FC:2211-2221`, `data-testid="tree-fit"`) | geen tekst / `Alles in beeld` / geen / `fit` 15 px (`WV:693-695`) |
| Toets | geen (`BC:1708-1743`) | geen | `0` (`TC:1116-1119`) | geen | `f`/`F` (`WC:2347-2348`) |
| Past op | `boardBounds(cards)` = kaarten **en punaises**, geen draden/draadeinden/inkt (`BC:1675`, `lib/boards/merge.ts:783-803`); niets als er geen kaarten zijn (`BC:1674`) | **de afbeelding** (`MC:223`); spelden liggen altijd binnen 0..1 | alle `events[].at` (`TC:337-341`, `time:583-603`); leeg → 1930 of het ankermidden over `defaultSpan(scale)` (`time:591-595`) | `base.bounds` = elke knoop **inclusief schimmen** (`FC:750-754`, `lib/families/layout.ts:587-598`) | alle knopen (`WC:939-947`) |
| Plafond / padding | **1.2** (`FIT_MAX_ZOOM` `BC:90`) / **40** (`FIT_PADDING` `BC:92`, niet de gedeelde 48) | geen / **0** (`MC:227-228`) | `maxPxPerSecond(scale)` / **×1.25** van de span (`time:599-600`) | `MAX_ZOOM` 2.5 / 48 (`view:64, 71`) | 1.6 organisch, 1.15 Kolommen / 48 (`WC:956-962`) |
| Zichtbaar voor lezers / op de telefoon | ja / ja (`BC:2412`, geen conditie) | ja / ja | ja / ja | ja (`FC:2211` buiten de `canEdit`-tak) / ja, alleen icoon | ja / **nee** (`.web-zoom { display:none }` `CSS:5956-5958`) |

**Afwijkingen.**
- Naam: `Passend maken` (landkaart) tegenover `Alles in beeld` (vier). `TOEVAL` → `Alles in beeld`; `tests/e2e/maps.spec.ts:120` zoekt de oude naam en gaat mee (dit is geen §64-geval: de naam verandert niet *op een voorwaarde*, hij verandert één keer).
- Prikbord: tekst zonder `aria-label`/`title`/icoon; web: geen `title`. `TOEVAL` → alle drie op elke plek.
- Plafond 1.2 op het prikbord: **`BEWUST` — §67** (`BC:90`, CLAUDE.md §5 "One dial is a surface's own").
- Padding 40 (prikbord) en 0 (landkaart), ×1.25 (tijdlijn) tegenover 48. `TOEVAL` → 48 px per kant, ook op de as (`pxPerSecond = (w − 96) / span`).
- `fit()` van de landkaart klemt niet (`MC:223-229`). `TOEVAL`.
- Waarop hij past: de stamboom telt schimmen mee, het prikbord telt draadeinden niet mee. Beide verdedigbaar; niet gestempeld — *niets wat op het glas ligt mag erbuiten vallen* is het doel, en beide plekken halen dat.

**Doel.** Eén knop `Alles in beeld` met icoon + woord (woord verborgen op de telefoon zoals `.tree-tool-word`), `aria-label` én `title`, die alles wat op het glas ligt in beeld brengt met 48 px lucht, tot `MAX_ZOOM` — op het prikbord tot 1.2 (§67). *Waarom:* drie plekken heten al zo, twee gebruiken al `fitViewport`, en de dop van het prikbord heeft een regel.

### Rij 5 — Waar de zoomknoppen staan

| | Prikbord | Landkaart | Tijdlijn | Stamboom | Web |
|---|---|---|---|---|---|
| Waar | in `.board-bar` (de bovenbalk boven de viewport), rechts na `.spacer` (`BC:2376-2409`; `CSS:1747-1752` flex, wrap) | in de toolbar-rij boven de stage, rechts na `.spacer` (`MC:910, 937, 949-959`) | in `.row-wrap.timeline-toolbar` boven de stage, rechts na `.spacer` (`TC:1614-1647`) | in `.tree-tools` boven de stage, rechts na `.spacer` en de roster (`FC:2099, 2175-2221`; `SCSS:162-165`) | in `.web-toolbar` boven het canvas, rechts (`WV:684-699`) |
| Volgorde | `−` · `NN%` · `+` · `Alles in beeld` · `Ongedaan maken` · prullenbak (`BC:2402-2436`) | `Uitzoomen` · `Inzoomen` · `Passend maken` (`MC:950-956`) | `Uitzoomen` · `Inzoomen` · `Alles in beeld` · `Instellingen` (`TC:1631-1646`) | `−` · `NN%` · `+` · `Alles in beeld` (`FC:2202-2221`) | `Uitzoomen` · `Alles in beeld` · `Inzoomen` (`WV:690-698`) |
| Vorm | tekstglyphs in `<span class="board-zoom" role="group" aria-label="Zoomen">`, knoppen `min-width/height 34px` (`CSS:2208-2224`) | icoon-only `btn btn-ghost btn-small` 34 px in `<span class="row" aria-label="Zoomen">` **zonder `role`** (`MC:949-953`, `CSS:482-486`) | icoon-only `btn btn-ghost btn-small` 34 px (`TC:1631-1641`) | tekstglyphs in `.tree-zoom role="group" aria-label="Zoomen"` (`FC:2202`), knoppen **26×24 px**, geen `.btn` (`SCSS:117-127`) | icoon-only `btn btn-small btn-ghost` in `.web-zoom role="group" aria-label="Zoom"` (`WV:689`, `CSS:5576-5586`) |
| `aria-label` / `title` | `Uitzoomen`/`Inzoomen`; **geen `title`** (`BC:2403-2409`) | `Uitzoomen`/`Inzoomen`; `title` alleen op `Passend maken` (`MC:950-958`) | `Uitzoomen`/`Inzoomen` mét `title` (`TC:1631-1637`) | `Uitzoomen`/`Inzoomen` mét `title` (`FC:2203-2209`) | `Uitzoomen`/`Inzoomen`, geen `title` (`WV:690-698`) |
| Telefoon | **`display: none !important`** (`CSS:2203-2207`) | blijft (geen `.map-*` in een `max-width`-blok) | blijft (`.timeline-toolbar` wikkelt, `CSS:403-408`) — `gemeten P-T1`: 2 rijen, 74 px, knoppen 37×34 | blijft, 26×24 (`SCSS:117-119`) — `gemeten P-S1`: 26×24 bevestigd | **weg** (`CSS:5956-5958`) |
| `data-testid` | geen | geen | geen (specs zoeken op naam, `timelines.spec.ts:394`, `ink.spec.ts:513`) | `tree-fit` op de fit-knop (`FC:2213`) | geen |

**Afwijkingen.**
- Plaats is overal **dezelfde**: de toolbar-rij boven de stage, rechts. Geen afwijking.
- Vorm: glyphs met percentage (prikbord, stamboom) tegenover iconen zonder percentage (landkaart, tijdlijn, web). Twee tegen twee onder de convertibele vier; het web doet mee met de iconen. `TOEVAL` → iconen (drie van vijf), zonder percentage — het getal betekent op de landkaart "beeldpixels" en op de as niets.
- Volgorde: `[−][+][fit]` (vier) tegenover `[−][fit][+]` (web). Web is vergelijking; `TOEVAL` → `Uitzoomen · Inzoomen · Alles in beeld`.
- Maat 26×24 op de stamboom, 34 elders; `--tap` 44 haalt niemand. `TOEVAL` → één component, één maat (rij 14 zegt 44 op de telefoon).
- `title` ontbreekt op het prikbord en op twee van de drie landkaart-knoppen; landkaart-groep zonder `role`. `TOEVAL`.
- Telefoon: prikbord verbergt de knoppen, drie andere niet. `TOEVAL` → zichtbaar (knijpen is er, maar niet vindbaar, en `Alles in beeld` moet er sowieso staan).

**Doel.** Eén component `CanvasZoomControls` — `Uitzoomen · Inzoomen · Alles in beeld`, iconen met `aria-label` én `title` (de laatste ook met het woord, verborgen op de telefoon), `role="group" aria-label="Zoomen"`, in de toolbar-rij boven de stage, rechts, op alle vier de plekken en ook op de telefoon. *Waarom:* de plaats is al gelijk; alleen de vorm, de volgorde en de maat lopen uiteen, en dat is precies wat één component afdwingt.
### Rij 6 — Kiezen

| Gebaar | Prikbord | Landkaart | Tijdlijn | Stamboom | Web |
|---|---|---|---|---|---|
| Op `useMarqueeSelect` / `pressSelection` | ja (`BC:454-461`, `:1178`) | **nee** — één `selectedId`, en "gekozen" = het blad staat open (`MC:199`, `:593-594`, `:1101-1113`) | **nee** — "gekozen" = de lijst open vensters `open[]` (`TC:362`, "never state, never live" `:354-361`) | ja (`FC:348-350`, `:1158`) | nee — eigen `Set` (`WC:2255`) |
| Klik op een ding | kiest alleen dit (`sel:127`); één klik opent nooit, dubbelklik opent (`BCard:492-499`) | opent het blad (`Sheet`) en kiest (`MC:593-594`); geen `click` bereikt de speld (`:517-518`) | klapt het venster open/dicht (`toggle`, `TC:903-916`, `:1522-1523`) | kiest; tweede klik op de naam opent (`openFromName` `FC:1254-1262`; spec `family-trees.spec.ts:311-318`) | kiest (vervangt) (`WC:2255`) |
| Shift-klik | toggelt (`BC:1163`, `sel:125`) | geen modifier gelezen — als gewone klik | op een `<a>`-tag: van de browser (`opensElsewhere` `TC:142-144`, `:914`) → nieuw venster; op een `<button>`-tag: toggle | toggelt (`FC:1149`, `sel:125`) | toggelt (`WC:2249-2253`) |
| Shift-sleep op leeg papier | kader, alleen `interactive` (= niet telefoon, niet read-only, `BC:457`, `:1314`); raakt = gekozen, `replace` (`marq:159-174`, `sel:70-82`) | geen — pant (`MC:567`) | geen — pant (`TC:948-1017` lezen `shiftKey` niet) | kader, alleen `canEdit && !isPhone` (`FC:348`, `:1025`); `replace`, raakt, schimmen uitgesloten (`FC:332-338`) | kader in **schermruimte**, **voegt toe**, alleen als het **middelpunt** erin ligt (`WC:2117-2118`, `:2188-2193`) |
| Klik op leeg papier | selectie en draad leeg, picker dicht (`BC:1310-1311`, `:1292`) | `setSelectedId(null)` (`MC:602-616`) — maar met een open blad landt de klik op de backdrop, die het blad sluit (`Sheet:154-157`) | sluit het **laatst geopende** venster, één per klik (`TC:1029`; spec `timeline-coop.spec.ts:408-411`) | selectie, lijn, menu en picker leeg als de druk niet bewoog (`FC:1106-1111`) | leegt (`WC:2245-2247`) |
| Escape | picker → lightbox → potlood → draad-in-wording → (niet typend) selectie (`BC:1708-1721`) | sluit het blad (`Sheet:95-98` → `MC:1102`); geen eigen Escape in het canvas | sluit het laatste venster, alleen met de stage gefocust en het potlood dicht (`TC:1120-1125`, `:1660`) — `gemeten D-T4`: met de focus ín het venster sluit Escape niets | potlood → picker → menu → lijn → selectie (`FC:1946-1961`); ook vanuit een `INPUT` (`FC:1943-1945`) | leegt bij canvas-focus (`WC:2341-2342`) |
| Druk op iets dat al gekozen is | groep blijft staan (`sel:126`), `chosen` = hele selectie (`BC:1182`) — `gemeten D-B5`: 2 blijven 2, een gewone sleep neemt beide mee | onbereikbaar: de backdrop van het blad ligt ertussen (`Sheet:154-157`) — `gemeten D-M2`: 0 px zolang het blad open staat, 80 px na Escape | toggle → dicht (`TC:914`) | groep blijft staan (`sel:126`) | **vervangt** door die ene (`WC:2255`; geen `pressSelection`) |
| Shift-druk op een al gekozen kaart en slepen | toggelt hem **uit** de selectie, maar `chosen` is gebouwd uit de oude set + deze kaart, dus hij sleept mee (`BC:1178`, `:1182-1183`) — `gemeten D-B4`: beide kaarten 120 px mee, B daarna niet meer omlijnd | n.v.t. | n.v.t. | idem: `pressSelection` toggelt, de sleep neemt `origin` van de gekozen kaarten (`FC:1158`, `:1170-1177`) — `gemeten D-S7`: 120 px mee, daarna niet meer omlijnd | n.v.t. |
| Ctrl/Cmd-klik | selectie plain (alleen `shiftKey` telt, `BC:1163`); kaartvlakken zijn `<a href>` → browser opent nieuw tabblad (`BCard:283-295`, `:483`) | n.v.t. (spelden zijn knoppen) | op een `<a>`-tag: browser (`TC:142-144`) | kaartlijf: plain; naam `<a>`: browser (`FC:1256`) | nieuw tabblad (`WC:2233-2238`) |
| Toetsenbord | Enter/spatie op een gefocust kaartvlak volgt de link (`BCard:482`) | Enter/Spatie op een gefocuste `.map-pin` kiest (`MC:1020-1025`, `aria-pressed` `:1018`) | `detail === 0` op de tag toggelt (`TC:1770, 1782`) | Enter op de naam volgt de link (`FC:1255`) | — |
| Schimmen / andermans ding | — | andermans speld: klik opent het blad, sleep pant (`MC:383-384`) | — | een klik op een **schim** kiest hem (`FC:1158` staat vóór `:1161`) terwijl een kader hem overslaat (`boxOf` → `null` `FC:333`) | — |

**Afwijkingen.**
- Twee van de vier plekken staan op §67; de landkaart en de tijdlijn hebben geen selectie (geen shift, geen kader, geen groep). `TOEVAL` — §67 (CLAUDE.md §5 "Kiezen is one gesture and it lives in two files") en fase 2 as 2 zeggen het al: de resterende plekken op `useMarqueeSelect`.
- Wat één klik doet: kiezen (prikbord, stamboom, web) tegenover openen (landkaart: modaal blad; tijdlijn: venster). Dat is geen woordkwestie: het blad van de landkaart is *modaal* en blokkeert daarmee "druk op iets dat al gekozen is → sleep". `TOEVAL` — maar de vorm van wat er dan opengaat is rij 12, en de telefoon-vorm rij 14.
- Shift-druk-en-sleep op een al gekozen kaart toggelt hem uit en sleept hem toch mee (prikbord én stamboom — zelfde `pressSelection`). `gemeten D-B4, D-S7`. `TOEVAL` → bij shift-druk op een gekozen kaart géén toggle als de druk een sleep wordt (toggle pas op de up zonder beweging).
- Een schim op de stamboom is kiesbaar met een klik maar niet met een kader. **`BEWUST`** dat schimmen niet sleep-/kiesbaar zijn (*Bewust anders*); de klik die hem wél kiest is dan `TOEVAL` (`FC:1158` vóór de `member`-check).
- Escape-volgorde verschilt (prikbord: picker eerst, potlood derde; stamboom: potlood eerst). Beide sluiten "het binnenste eerst, de selectie het laatst". `TOEVAL`, klein → één volgorde: potlood → zwevend ding (picker/menu/lightbox) → draad/lijn → selectie.
- Web: kader voegt toe en test op het middelpunt; druk op gekozen knoop vervangt. `BEWUST` — het web (*Bewust anders*).

**Doel.** §67 op alle vier: klik kiest (en toont het paneel van het ding, rij 12), shift-klik wisselt, shift-sleep op leeg papier veegt (raakt = gekozen, vervangt), klik op leeg papier en Escape wissen, een druk op iets dat al gekozen is laat de groep staan; openen is dubbelklik, tweede tik of de knop `Openen`. *Waarom:* dat is de regel die ronde 33 al schreef en twee plekken al volgen; de landkaart en de tijdlijn wijken alleen af omdat ze eerder gebouwd zijn.

### Rij 7 — Wat een keuze toont, en wat over de lijn gaat

| | Prikbord | Landkaart | Tijdlijn | Stamboom | Web |
|---|---|---|---|---|---|
| Ring op het eigen ding | `.board-card-selected` → `outline: 2px solid var(--link); outline-offset: 1px` (`CSS:1973-1976`; `BCard:506`); punaise: outline op `.board-pintag` (`CSS:3175-3181`); draad: dikker + schaduw (`CSS:1929-1932`) | `.map-pin-selected`: kop gevuld in `--pin-colour`, `outline: 3px solid rgba(31,27,22,.25)` (`CSS:4435-4437`, `:4467-4471`), `aria-pressed` (`MC:1018`) | open venster: `.timeline-event-open` z 3, mark gevuld, tag `--paper-dark` (`CSS:4998-5000`, `:5061-5065`, `:5098-5101`), `aria-expanded` (`TC:1772`) | `.tree-node.is-selected .tree-node-body` → rand + `0 0 0 2px var(--stamp-red)` (`SCSS:385-388`, `TN:110`) | ring `r+3` in de soortkleur (`WC:1779-1786`); één gekozen = buren licht, rest gedimd `DIM` 0.28 (`WC:123, 1256-1258`) |
| Telling / bijschrift | inspector: `{naam}` of `Kaart` bij één, `{n} kaarten` bij meer (`BI:358`); verwijderknop `{n} verwijderen` (`BI:418`) | geen (één) | geen | geen aparte teller; `…`-menu `Meer bij {n} kaartjes` en item `{n} uit de stamboom` (`TH:311`, `FC:2428`) | paneel `{n} gekozen` (`WV:561-570`) |
| Eigen kader | `.board-marquee` gestippeld `--link`, vulling 12 % (`CSS:2283-2288`) | — | — | `.tree-marquee` (`SCSS:743-749`) | `s.marquee` op het canvas (`WC:2146`) |
| Andermans ring (`holding`) | `.board-held`: outline `--held-colour` + naam (`CSS:2861-2884`; `BC:2691-2715`) | **geen** `.map-held` (0 hits in `CSS`) | **geen** | `.tree-held`: `outline: 2px solid var(--held-colour); outline-offset: 2px` + `.tree-held-name` (`SCSS:775-798`; `FC:2351-2371`); eerste houder wint (`useTreeHolding:89-98`) | geen |
| Andermans kader | `.board-marquee-other` doorgetrokken in hun kleur + naam (`CSS:2292-2296`) | — | — | `.tree-marquee-other`, TTL 4000 ms (`SCSS:752-771`, `useTreeHolding:49, 109`) | — |
| Wat over de lijn gaat | `holding = [...selected]` (`BC:629` → `UBL:289-292`), hub-cap **60** (`lib/live/hub.ts:445`); gekozen **draad** gaat niet mee; kader als `s` in het pointerframe, `null` bij sluiten (`BC:459-461`, `marq:172`); groepssleep als `m`, cap **40** (`UBL:48, 324`) | **niet de keuze**: `setHolding([dragging])` alleen tijdens slepen (`MC:453-456`); `m: {[id]: [x,y]}` tijdens slepen, niet bij touch (`MC:531-535`, `:574`); `LivePage pointers={false}` (`maps/[slug]/page.tsx:117`) | niets voor open vensters (`TC:360`); alleen `m = {[eventId]: [moment, 0]}` tijdens een gedragen tag (`TC:484-508`); niet bij touch (`TC:994`) | `holding = [...selected]`, cap 60 (`FC:402-403`, `useTreeHolding:56, 78-81`); `m` cap 40 (`FC:158, 847`); `s` = kader in wereldcoördinaten (`FC:350, 852-861`) | niets (`page.tsx:36` `pointers={false}`) |

**Afwijkingen.**
- Ringkleur: `--link` (prikbord), `--stamp-red` (stamboom), donkergrijs (landkaart), `--paper-dark` (tijdlijn). `TOEVAL` → één token voor "gekozen". Let op `tests/unit/tree-contrast.test.ts` (§45/§66): een kaart leest nooit `--ink`/`--paper`; `--link` op een `.tree-node` moet tegen de vloeren gehouden worden.
- `holding` en de andermans-ring ontbreken op de landkaart en de tijdlijn. `TOEVAL` — volgt uit rij 6 (§67: "A selection is a Set, and three things hang off it").
- Gekozen draad gaat niet mee als `holding` (`BC:629`). `TOEVAL`, klein.
- Een telling van de selectie bestaat alleen op het prikbord (inspector) en het web. Geen stempel: de telling hoort bij het paneel (rij 12).

**Doel.** Eén ring (één token, één dikte, één offset) voor "gekozen", één ring in `--held-colour` met naam voor "vastgehouden door een ander", en op alle vier de plekken gaan de gekozen ids als `holding` (cap 60), het kader als `s` en de sleep als `m` (cap 40) over de lijn. *Waarom:* het prikbord en de stamboom doen dit al identiek op `useTreeHolding`/`useBoardLive`; de andere twee hebben alleen nog geen selectie om te verzenden.

### Rij 8 — Slepen

| | Prikbord | Landkaart | Tijdlijn | Stamboom | Web |
|---|---|---|---|---|---|
| Drempel | `\|dx\| + \|dy\| > 4` in **bordeenheden** (`BC:1358-1360`): bij zoom 0.25 ≈ 16 schermpx, bij 2.5 ≈ 1.6 px | 5 px (`MC:46`, `:564`) | `TAG_DRAG_SLOP` 3 px, **alleen horizontaal** (`TC:113`, `:880-883`) | `DRAG_SLOP` 4 px hypot (`FC:152`, `:1208, 1217`) | 4 px (`WC:2115`) |
| `setPointerCapture` | **nooit** (0 hits); moves via bubbling, `window` pointerup maakt af met `markDirty`, niet `saveNow` (`BC:1751-1757`) — `gemeten D-B6`: de kaart stopt bij de laatste move binnen de viewport en blijft daar hangen | **op pointerdown**, op de stage (`MC:492, 519`) | **op pointerdown**, op het tag-element (`TC:856`); de `<a>`-tag heeft een eigen `onClick` die de trailing click opvangt (`TC:1754-1771`, `pressTravelled` `:800, 880`) | **lui**, op de stage, pas voorbij `DRAG_SLOP` (`FC:1218-1229`) — §66 | op pointerdown (`WC:2030`) |
| Wie mag | `interactive = !isPhone && !readOnly` (`BC:418`, `:1180`) | `mayMove = mayType && (isKeeper \|\| pin.createdBy === viewerId)` (`MC:486`); anders pant de sleep | `canEdit` (`TC:881`); een lezer "sleept" zonder effect en de klik daarna telt niet (`TC:874-880`) | `canEdit` (`FC:1161`); een lezer kan kiezen, niet slepen | organisch alleen (`WC:2119`) |
| Groepssleep | ja, `groupDelta` afgerond op hele bordeenheden (`BC:1366`, `sel:139-152`) | **geen** — één `pinId` | **geen** — `EventDrag` draagt één `id` (`TC:775-788`) | ja, `groupDelta`, schimmen niet (`FC:1170-1177`, `:1205-1207`, `:1231`) | geen (`WC:2132-2144`) |
| Snappen | geen raster; `Math.round` op bordeenheden (`sel:149`); grip-resize snapt op 0.05 tenzij Shift (`BC:1339-1342`) | geen; clamp 0..1 (`MC:571-572`) | **op de dichtstbijzijnde grens van de eigen precisie** (`onAxis(…, item.precision)` `TC:888`, `time:186-191`), dan `clampToAnchor` (`TC:299-302`) | geen (0 hits `snap\|grid` behalve `snapshot`) | geen |
| Drop | `saveNow({cards})` als verplaatst, anders `markDirty` (`BC:1420-1432`) | `PATCH /api/maps/{id}/pins/{pinId}` (`MC:595-597`, `:640-664`); **geen `router.refresh()` na een move** (bekende leemte, `MC:651-652`) | `PATCH …/events/{eventId}` `{ at }` quiet, dan `router.refresh()` (`TC:926`, `:1239-1254`); bij mislukken terug (`TC:927`) | één `commit`: `pinned: true, x, y` (`FC:1264-1304`), layout zet een pin exact terug (`lib/families/layout.ts:52-57`) | `fixed` → `pinned` met speldje, sterft met de pagina (`WC:2169-2173`) |
| Afbreken | geen Escape-tak (`BC:1708-1721`); `pointercancel` op `window` (`BC:1751`) | `pointercancel` → einde zonder save? (`MC:640-664` via `onPointerUp`) | `pointercancel`/`lostpointercapture` → `abortEventDrag` terug naar `startAt` (`TC:819-831`); geen Escape | `pointercancel` → `endNodeDrag(event, false)` (`FC:1090-1093`); geen Escape | `pointercancel` → `fixed = false` (`WC:2259-2268`) |
| Tijdens de sleep dood | pull gepauzeerd (`busy` `BC:473`), kaartlinks openen niet (`BCard:483`), wiel zoomt nog, Escape breekt niet af | `useHoldRefresh` niet gebruikt (0 hits) | `handOn` blokkeert pulls (`TC:414-420`), `useHoldRefresh(busy)` (`TC:1316-1317`) | `busy` via `useTreeSync` (`FC:` `pending()`) | — |
| Vinger | **geen sleep** onder 768 px (`BC:418`) — `gemeten P-B4`: 0 px | vinger sleept (zelfde handlers) | vinger sleept (zelfde handlers) | vinger sleept in de code (`FC:1049`, `SCSS:340`); specs slaan het over — `gemeten P-S2`: 100 px, gepind na herladen | vinger sleept |

**Afwijkingen.**
- Drempel in bordeenheden (prikbord) en Manhattan; 5 (landkaart); 3 en alleen x (tijdlijn); 4 hypot (stamboom). `TOEVAL` → `DRAG_SLOP` 4 schermpixels, hypot, uit één plek (`lib/canvas/`).
- Pointer capture op pointerdown op de landkaart en de tijdlijn; nooit op het prikbord; lui op de stamboom. `TOEVAL` → lui bij de drempel (§66, CLAUDE.md §5 "Take a canvas's pointer capture lazily"). De tijdlijn is het textbook-geval: de tag is een `<a>`.
- Snappen op de tijdlijn: **`BEWUST` — §62/`snapTo`** (`time:186-191`): een gebeurtenis met precisie "jaar" mag niet op 14 maart landen; dat is de eenheid van het gegeven, geen UI-keuze. Niet op de lijst; daarom `OPEN` (vraag 7).
- Groepssleep alleen op de §67-plekken. `TOEVAL` — volgt uit rij 6.
- Geen vingersleep op het prikbord. `TOEVAL` (rij 14).
- Landkaart: geen `router.refresh()` na een move. `TOEVAL` (CLAUDE.md §5 noemt het als gat).

**Doel.** Eén `DRAG_SLOP` van 4 schermpixels (hypot), pointer capture op de stage pas bij het passeren ervan, groepssleep via `groupDelta`, één `commit`/save bij de drop en `router.refresh()` waar de pagina server-gerenderd is; de tijdlijn snapt op de precisie van het ding (§62). *Waarom:* de stamboom is de referentie van §66/§67 en het prikbord staat al op `groupDelta`; de rest is dezelfde drempel en dezelfde capture-regel.

### Rij 9 — Ongedaan maken

| | Prikbord | Landkaart | Tijdlijn | Stamboom | Web |
|---|---|---|---|---|---|
| Toets | Ctrl/Cmd+Z, niet typend, niet read-only (`BC:1722-1734`); in tekenmodus naar de inkt (`BC:1727`) | **geen** (spelden); inkt Ctrl+Z alleen met het potlood uit (`useCanvasInk:139-144`) | **geen** (gebeurtenissen; `TC:1098-1127`, geen `z`-tak); inkt idem | Ctrl/Cmd+Z (`FC:1966-1970`), niet vanuit `INPUT/TEXTAREA/SELECT` (`FC:1943-1945`) | geen (0 hits `undo`) |
| Knop | `Ongedaan maken`, `btn btn-small btn-ghost`, `title="Ongedaan maken (Ctrl+Z)"`, geen `aria-label`, altijd gerenderd, nooit `disabled` (`BC:2415-2422`, `:724-726`) | geen; inkt `Laatste streek ongedaan maken`, `disabled={!canUndo}` (`InkTools:187-197`) | geen; inkt idem | `Ongedaan maken`, `btn btn-small btn-ghost`, `data-testid="tree-undo"`, `aria-label` + `title="Ongedaan maken (Ctrl+Z)"`, icoon, alleen `canEdit`, nooit `disabled` (`FC:2155-2165`) | geen; wel `Terug` naar het vorige middelpunt (`WV:655-660`) |
| Dekt | alles door `commit`: toevoegen, verwijderen (tombstone opgeheven `BC:740-743`), patch, sleep (snapshot bij de drempel `BC:1362`), resize, draadeind; **niet** viewport, bordnaam, inkt (`BC:706-711`) | — | — | de eigen staat van de boom (`FC:480`); **niet** een veld op het artikel (`writeRelation` `FC:1501-1534`), dus niet een `+`-veld en niet `Lijn verwijderen` op een veldlijn (`FC:1892-1896`) | — |
| Redo / diepte | geen redo (`undo:21-28`); 50 (`undo:31`, `BC:367`) | — | — | geen redo; 50 (`undo:31`, `treeUndo:13`, `FC:275`) | — |
| Toast met actie | na verwijderen: `Kaart verwijderd.` / `{n} kaarten verwijderd.` / `Draad verwijderd.` met `Ongedaan maken`, 6000 ms (`BC:966-981`, `UiP:219`) | geen | geen | na groepsverwijdering (`FC:1443-1446`) | geen |
| Server | undo van een toevoeging verwijdert niet server-side (CLAUDE.md §8, ronde 29) | — | — | idem (ronde 31) | — |

**Afwijkingen.**
- Twee plekken hebben undo (zelfde `undoStack`, zelfde knop, zelfde toets), twee niet: `∞` in de telling voor taak D. Twee tegen twee; de meerderheidsregel beslist niet. Maar `∞` voor "een verschoven speld terugzetten" is de hoogste wrijving in de hele tafel, en de stack bestaat al. `TOEVAL` voor **verplaatsingen** (een `PATCH` terug is één handeling); voor **verwijderen** hangt het aan tombstones die de landkaart en de tijdlijn niet hebben — `OPEN` (vraag 8).
- Undo-knop nooit `disabled` (bord, boom) tegenover inkt-undo `disabled={!canUndo}`. `TOEVAL` → `disabled` bij een lege stack (de inkt-knop is de jongere en de eerlijkere).
- Prikbord-knop zonder `aria-label`/icoon, stamboom mét. `TOEVAL` → als de stamboom.

**Doel.** Ctrl+Z en één knop `Ongedaan maken` (icoon + woord, `title` met de toets, `disabled` bij een lege stack) op alle vier, over `components/canvas/undoStack.ts`, met een toast-actie na verwijderen; op de landkaart en de tijdlijn dekt hij een verplaatsing (en verwijderen zodra `OPEN` (vraag 8) beslist is). *Waarom:* het prikbord en de stamboom zijn al identiek; het alternatief — undo weghalen — maakt taak D overal `∞` en dat is het tegendeel van het doel.

### Rij 10 — Verwijderen

| | Prikbord | Landkaart | Tijdlijn | Stamboom | Web |
|---|---|---|---|---|---|
| Toetsen | `Delete` én `Backspace`: eerst de gekozen draad, anders alle gekozen kaarten (`BC:1735-1743`) | geen (`MC:421-429`) | geen (`TC:1098-1127`) | `Delete` of `Backspace` met selectie, `canEdit`, geen blad open (`FC:1971-1978`) | geen (`WC:2340-2353`) |
| Knop | inspector: `Kaart verwijderen` / `{n} verwijderen`, draad `Verwijderen`, punaise `Verwijderen` (`btn btn-small btn-danger`, `BI:416-419, 280-283, 333-336`) | in het blad: `Speld weghalen` (`btn-danger`, trash-icoon, `mayEdit`, `MC:1342-1345`) | venster → `Bewerken` → blad → `Van de tijdlijn halen` (`TC:2126`, `ES:784-787`) | `…`-menu `Uit de stamboom` / los kaartje `Weghalen` / selectie `{n} uit de stamboom` (`FC:2041-2049, 2070-2076, 2425-2433`); lijn: `Lijn verwijderen` (`FC:2511-2521`) | geen |
| Bevestiging | **geen** voor kaarten/draden (`BC:942-984`); alleen het bord zelf (`BC:2225-2236`) | `ui.confirm` `"{naam} van de landkaart halen?"` + `Speld weghalen` (`MC:716-726`) | `ui.confirm` `"{naam} van de tijdlijn halen?"` + `Weghalen` (`TC:1389-1397`) | **altijd** `ui.confirm` (`FC:1320-1325, 1342-1347, 1400-1422`); `Lijn verwijderen` **zonder** (`FC:1888-1906`) | — |
| Live / server | tombstone `deleted.cards[id]` (`lib/boards/merge.ts:730-740`); draden aan de kaart gaan mee (`BC:948-950`); toast met `Ongedaan maken` (`BC:966-981`) | `DELETE …/pins/{pinId}` + `router.refresh()` (`MC:730-739`); toast `Weghalen is niet gelukt.` / `Geen verbinding.` | `DELETE …/events/{eventId}` + `router.refresh()` (`TC:1401-1409`); onder een open blad van een ander: `Deze gebeurtenis is weggehaald.` + `Sluiten` (`TC:1921-1938`) | `deletedMembers` + ties in één commit, één undo (`FC:1327-1333`, `:1433-1446`); veld op het artikel onaangeroerd, toast zegt dat (`FC:1335`) | — |

**Afwijkingen.**
- Toetsen alleen op de §67-plekken. `TOEVAL` — volgt uit rij 6.
- Bevestigen: nee (prikbord, met undo-toast) · ja (stamboom, mét undo) · ja (landkaart, tijdlijn, zonder undo). Drie van de vier bevestigen; het prikbord is het jongste patroon ("verwijder, zeg het, bied undo"). Niet beslisbaar uit de meerderheid alleen — `OPEN` (vraag 6).
- De weg naar de knop: 1 klik na de keuze (prikbord, landkaart via blad) tegenover 2 (stamboom `…`) en 3 (tijdlijn `Bewerken` → blad → knop). `TOEVAL` → de verwijderknop staat in het paneel van het ding (rij 12), één klik na de keuze.
- `Lijn verwijderen` bevestigt niet waar alle andere verwijderingen op de stamboom dat doen (`FC:1888-1906`). `TOEVAL` — volgt `OPEN` (vraag 6).

**Doel.** `Delete`/`Backspace` haalt de selectie weg op alle vier; de knop staat één klik diep in het paneel van het ding; bevestigen-of-undo-toast is één regel voor alle vier (`OPEN` (vraag 6)). *Waarom:* de toets en de plaats volgen uit de selectie en het paneel; alleen de bevestiging is een keuze die Nick moet maken.
### Rij 11 — Rechtermuisknop en lang drukken

| | Prikbord | Landkaart | Tijdlijn | Stamboom | Web |
|---|---|---|---|---|---|
| `contextmenu` | geen handler (0 hits); alleen `.ink-capture` blokkeert het menu (`InkTools:299`) | geen (0 hits) | geen (0 hits) | geen in `FC`/`TN`/`TH` (alleen `InkTools:299`) | listener zet alleen `menuAt` (`WC:2335-2337`), geen `preventDefault` |
| Rechts op een ding | kaart/oppervlak negeren `button !== 0` (`BC:1161, 1268`) → browsermenu; kaartvlakken zijn `<a href>` → "openen in nieuw tabblad"; **geen knop-check** op punaise-kop (`BC:1229`), grip (`:1210`), draadeind (`:1242`), draad (`:1261`) → rechtsklik op een kop start `setDrawing` — `gemeten D-B7`: `path.board-string-drawing` tijdens de rechtersleep, geen draad en geen kiezer na het loslaten | speld: `button !== 0` → return (`MC:513`) → browsermenu | tag: `button !== 0` → return (`TC:834`); artikel-tag is `<a href>` → browsermenu; losse gebeurtenis is `<button>` | kaart: `button !== 0` → return (`FC:1148`); naam is `<a href>` → browsermenu | browser (`WC:2052`) |
| Rechts op leeg papier | niets (`BC:1268`) | niets (`MC:489`) | **start een pan met capture** (`TC:948-970`, geen knop-check) — `gemeten D-T2`: pant 100 px, `grabbing` tijdens | **start een pan met capture** (`FC:986-1044`) — `gemeten D-S2`: pant 100 px, selectie blijft | niets |
| Middelste knop | `button !== 0` → browser (nieuw tabblad op een `<a>`) | niets | zelfde als rechts (pan) | zelfde als rechts (pan) | `auxclick` → nieuw tabblad (`WC:2314-2324`), autoscroll onderdrukt (`WC:2310-2312`) |
| Lang drukken | geen timer (0 hits `setTimeout\|long`); `-webkit-touch-callout: none` (`CSS:2794-2804`) | geen; `touch-action: none` + `user-select: none` (`CSS:4372-4374`) | **500 ms, 8 px slop, alleen niet-muis, `canEdit`, geen potlood → opent het nieuwe-gebeurtenis-blad op dat moment** (`TC:103-104`, `:1055-1086`; spec `timeline-coop.spec.ts:290-345`) — `gemeten P-T2`: 700 ms → het blad opent | geen (0 hits); op de naam-`<a>` geeft de browser zijn linkmenu | geen |

**Afwijkingen.**
- Rechts/midden op leeg papier begint een pan op de tijdlijn en de stamboom. `TOEVAL` → `button !== 0` en niet-touch → niets, zoals de andere drie en zoals §68 ("elke muisknop behalve de linker is van de browser").
- Vier handlers op het prikbord zonder knop-check (`BC:1210, 1229, 1242, 1261`). `TOEVAL`.
- Lang drukken maakt iets, alleen op de tijdlijn. Het is de telefoon-helft van de dubbelklik (rij 2) — `OPEN` (vraag 4).

**Doel.** De rechter- en de middelste knop zijn van de browser, op elk ding en op leeg papier (§68); lang drukken doet wat de dubbelklik doet (`OPEN` (vraag 4)). *Waarom:* drie van de vijf plekken doen het al en ronde 34 heeft het tot regel gemaakt voor verwijzingen.

### Rij 12 — Het paneel / het menu bij een ding

| | Prikbord | Landkaart | Tijdlijn | Stamboom | Web |
|---|---|---|---|---|---|
| Wat | `BoardInspector`: gedockte balk, `role="group"`, **niet modaal** (`BI:196, 301, 355`); `null` zonder selectie (`BI:155`) | het speld-**blad**: `Sheet`, `role="dialog" aria-modal`, **modaal** met backdrop (`MC:1101-1113`, `Sheet:160-166`) | het uitgeklapte **venster** `Popout`, `role="dialog" aria-label={naam}`, **niet modaal** (`TC:1999-2154`, `:2065-2066`); bewerken via een modaal `Sheet` (`ES`) | handgrepen + `…`-hoekmenu `TreeCornerMenu` `role="menu"`, niet modaal (`TH:167-219`); los-kaartje-blad `Sheet` (`FC:2950`) | zijpaneel `aside.web-side-panel`, altijd zichtbaar (`WV:763`) |
| Waar | desktop `position:absolute; left:10px; bottom:10px; z 30` **in de viewport** (`CSS:2103-2115`); telefoon `position:fixed` boven de tabbalk, z 44 (`CSS:2083-2101`) | portal op `body`, gecentreerd 560 px; telefoon bottom sheet (`CSS:1004-1061`) | `POPOUT_W` 250, `left` geklemd `[4, width−254]`, boven/onder de tag in lanes (`TC:93, 1551-1595`); container buiten de stage, niet geclipt (`TC:1860`, `CSS:5113-5121`) | anker op de rechterbovenhoek van de kaart, in de **wereldlaag** geschaald `1/zoom` (`TH:92-96, 151`); lijst `top: 26px`, `min-width: 12rem` (`SCSS:651-664`); **niet geklemd** — `.tree-stage overflow: hidden` knipt (`SCSS:173`; CLAUDE.md §8) — `gemeten D-S5`: 40 px boven de rand nog niet afgeknipt; dat begint als de bovenrand van de kaart binnen ±90 px van de onderrand staat | rechts, 300 px (`CSS:5687-5694`) |
| Opent | bij elke keuze (state-gedreven) | tik op een speld, Enter/Spatie, na plaatsen, `?pin=`, legenda-zoeker (`MC:594, 1020-1025, 684, 363, 889`) | klik op de tag (`toggle`) | `…`-knop `aria-haspopup="menu"` `aria-label="Meer bij {naam}"` (`TH:184-196`); handgrepen bij precies één gekozen (`FC:2377-2392`) | bij elke keuze (`WV:258-261`) |
| Sluit: Escape / buiten / kruisje | Escape (niet typend, `BC:1716-1719`) / druk op kaal kurk (`BC:1310-1311`) / `Selectie opheffen` ×3 (`BI:285-292, 338-345, 421-428`) | Escape (`Sheet:95-98`) / backdrop (`Sheet:154-157`) / **geen kruisje** | Escape (laatste, stage gefocust, `TC:1120-1125`) / klik op kale as (laatste, `TC:1029`) / `Sluiten` 26×26 (`TC:2071-2073`, `CSS:5138-5152`) | Escape (window, `FC:1952-1955`) / document pointerdown (`TH:82-89`), kaal papier (`FC:1109`) / **geen kruisje** | — |
| Focus | niet verplaatst; verloren naar `body` bij sluiten (0 hits `focus` in `BI`) | naar het paneel, terug naar de opener (`Sheet:140-145, 127-129`) | niet verplaatst | niet verplaatst; item unmount → `body` (0 hits in `TH`) | — |
| Inhoud (verbatim) | draad: `Bijschrift`, kleur/dikte/soort, `Verwijderen`; punaise: label, grootte, hint `Sleep hem aan het label. Span draad vanaf de kop.`; kaart(en): `{Artikel} openen`, `Rand`, `Grootte van de {kaart}`, `Foto tonen/verbergen`, `Foto toevoegen/vervangen`, `Foto verwijderen`, `Kaart verwijderen` (`BI:199-428`, `BC:3060-3066`) | kop met kleur/icoon, `h2`, `Notitie op de landkaart` / soort + `gezet door {naam}`, `Artikel openen` / `Landkaart openen`, `LiveField` Naam/Tekst, `Sleep de speld om hem te verplaatsen.`, `Maak er een artikel van`, `Speld weghalen` (`MC:1188-1350`) | foto, `Lees verder`, `Bewerken`, `Afbeelding verbergen/tonen`, `gezet door {naam}` (`TC:2086-2151`) | artikel: `Openen`, `Uit de stamboom`, schim `Erbij`; los kaartje: `Bewerken`, `Artikel aanmaken`, `Weghalen` (`FC:2035-2077`); items ≈ 27 px (`SCSS:665-677`) | `Openen`, `Middelpunt`, `In beeld brengen`, verbindingen (`WV:994-1006`) |
| Telefoon | zelfde balk, `fixed` boven de tabbalk; `padding-right: 68px` voor de FAB wordt overschreven door de `padding`-shorthand erna (`CSS:2091`, `:2097`) — `gemeten P-B3`: balk op y 684–776, **de FAB ligt er 56×56 px overheen, op `Selectie opheffen`** | bottom sheet | zelfde venster (geen `@media`); tag krimpt tot 120 px (`CSS:5342-5347`) | zelfde menu, 32 px handgrepen (`TH:95`) | `Sheet` (`WV:774-778`) |

**Afwijkingen.**
- Modaal (landkaart) tegenover niet-modaal (prikbord, tijdlijn, stamboom, web) op desktop. `TOEVAL` — en het is de wortel van rij 6 op de landkaart: een modaal blad maakt "druk op iets dat al gekozen is" onmogelijk (`gemeten D-M2`).
- Kruisje: prikbord `Selectie opheffen`, tijdlijn `Sluiten`, landkaart en stamboom geen. `TOEVAL` → één sluitknop `Sluiten` (tafel 3).
- Het `…`-menu klemt niet (`TH:151`; bekend, CLAUDE.md §8 ronde 31). `TOEVAL` → klemmen zoals de kiezer (`FC:2706-2707`).
- Focus wordt alleen door `Sheet` beheerd. `TOEVAL` → tafel 3.
- De weg naar "bewerken/verwijderen" is 1 klik (prikbord, landkaart), 2 (stamboom), 3 (tijdlijn). `TOEVAL` (rij 10).
- Telefoon: `fixed` balk (prikbord) · bottom sheet (landkaart, web) · zelfde als desktop (tijdlijn, stamboom). `TOEVAL` → rij 14.

**Doel.** Op desktop een niet-modaal paneel bij het gekozen ding, met dezelfde drie sluitwegen (Escape, druk op leeg papier, kruisje `Sluiten`), binnen de stage geklemd, met de knoppen `Openen`, `Bewerken`/velden en `Verwijderen` één klik diep; op de telefoon een bottom sheet (rij 14). *Waarom:* vier van de vijf plekken zijn al niet-modaal; de landkaart is de enige die het glas afdekt, en dat blokkeert twee andere rijen.

### Rij 13 — Het potlood

| | Prikbord | Landkaart | Tijdlijn | Stamboom | Web |
|---|---|---|---|---|---|
| Bedrading | `useCanvasInk({kind:'board', widthScale: viewport.zoom})` (`BC:652-665`), `<InkShell corner="bottom-right">` (`BC:3004`) | `useCanvasInk` + `<InkShell corner="bottom-left" toolbar={!placing}>` (`MC:1058`) | `<InkShell corner="top-left">` (`TC:1838`) | `<InkShell corner="bottom-right">` (`FC:2559`) | **geen** (0 imports uit `components/ink`) |
| Waar de balk staat | `.ink-toolbar-board` → `right/bottom: .5rem` (`CSS:5522-5528`); **telefoon: linksboven** (`CSS:5529-5536`) | `.ink-toolbar-bottom` → `bottom: .5rem`, `left: .5rem` (`CSS:5509-5512`, `:5392-5395`); geen telefoonregel → linksonder ook op 390 px | basisregel `left/top: .5rem` (`CSS:5392-5396`); ook op de telefoon | als prikbord: rechtsonder, telefoon linksboven | — |
| Eenheid | bordeenheden (`BC:658`) | beeldpixels (`MC:414`) | seconden, `v: 1` (`inkSpace:57-72`; `TC:575`) | wereld (`FC:379`, `panZoom:65-78`) | — |
| Erin / eruit | potloodknop `data-testid="ink-pen"`, `aria-label` `Tekenen`/`Tekenen uit`, `title` `Tekenen`/`Tekenen uit (Esc)` (`InkTools:105-115`); Escape (`useCanvasInk:134-138`); bij aan: selectie en draad leeg (`BC:661-664`) | idem; bij aan `setSelectedId(null)` (`MC:417`) | idem; bij aan alle vensters dicht (`TC:592`) | idem; bij aan selectie, lijn, picker leeg — het menu niet expliciet (`FC:382-386`), maar `gemeten D-S3`: met de selectie verdwijnen de handgrepen en dus het menu | — |
| Effect op de hand | `.ink-capture` z 30 `touch-action: none` neemt de pointer (`InkShell:51`, `InkTools:264`): geen pan, kiezen, sleep; grip weg (`BC:2862`); **wiel zoomt nog** (`gemeten D-B8`); Ctrl+Z = eigen streek (`useCanvasInk:139-144`); tweede vinger breekt de streek af (`InkTools:255-261`) | idem; wiel zoomt nog (`gemeten D-M3`); knoppen in de toolbar erboven werken | idem; tag-druk, dubbelklik, lang drukken, plakken uit (`TC:843, 1044, 1072, 1336`); **wiel pant nog** (`gemeten D-T5`) | idem; handgrepen, `…` en de lege melding weg (`FC:2377, 2395, 2418, 2561`); wiel zoomt nog (`gemeten D-S6`) | — |
| Keeper-schakelaar (`Tekenen toegestaan`, `Tekenlaag wissen`) | in het **Rechten-blad** (`BC:3153`) | **onder de vouw** via `UnderFold` `#map-underfold` (`MC:1099`, `maps/[slug]/page.tsx:194`) | in het **Instellingen-blad** (`TC:1967`); geen `UnderFold` (0 hits) | **onder de vouw** via `UnderFold` `#tree-underfold` (`FC:2605, 2617`) | — |

**Afwijkingen.**
- Hoekwoord per plek: **`BEWUST`** (*Bewust anders*; CLAUDE.md §5 "the corner passed as a word"). Maar de **telefoon**-hoek volgt alleen uit de klasse `ink-toolbar-board` (`CSS:5529-5536`): op het prikbord en de stamboom linksboven, op de landkaart linksonder, op de tijdlijn linksboven. Dat de telefoonregel aan één klasse hangt is `TOEVAL` — het hoekwoord hoort ook op de telefoon te beslissen, of de telefoon één hoek te hebben (rij 14).
- Eenheden: **`BEWUST`** (*Bewust anders*).
- Keeper-schakelaar: onder de vouw (twee) tegenover in een blad (twee). De regel (§34/§66, CLAUDE.md §5 "goes under the fold on a full-screen canvas") geldt voor full-screen canvassen; het prikbord staat niet op de §34-shell (§8 debt), de tijdlijn wel. `TOEVAL` voor de tijdlijn → `UnderFold`; prikbord blijft in het Rechten-blad tot het op de shell staat.
- Potlood-aan en het `…`-menu: de inventaris vermoedde dat het menu open bleef (`FC:382-386`); `gemeten D-S3` zegt van niet — vervalt.
- Wiel onder het vel: zoomt (drie) / pant (tijdlijn) — consistent met rij 1. Geen afwijking.

**Doel.** Eén bedrading (al zo), één knop met dezelfde namen (al zo), bij aanzetten alles wat zweeft dicht en de selectie leeg, de hoek als woord — op desktop per plek (§67), op de telefoon één hoek voor alle vier; de Keeper-schakelaar onder de vouw op elk canvas dat de §34-shell heeft. *Waarom:* dit is de rij die ronde 33 al gelijkgetrokken heeft; wat rest zijn twee randen.

### Rij 14 — Telefoon (390 px)

| | Prikbord | Landkaart | Tijdlijn | Stamboom | Web |
|---|---|---|---|---|---|
| Breekpunt(en) | `isPhone` 767 (`BC:233`) en `@media (max-width: 767px)` | `isPhone` 767 (`MC:178, 208, 213, 816, 938, 962, 1060`); **geen** `.map-*` in een `max-width`-blok | `isPhone` 767 (`TC:217`, alleen voor ticks/zinnen/tagbreedte); `.timeline-tag` ≤767 (`CSS:5342-5347`) | **600** (`SCSS:849`), 767 (`isPhone`, `FC:348, 2577`; `CSS:5529`) én 768 (`.page-canvas` `CSS:871-880`) | `isPhone` 767 (`WV:77`); `desktopOnly` in de nav (`AppShell.tsx:48`) |
| Wat van 1–13 verandert | 1 vinger pant, kaart sleept **niet** (`BC:418, 1180`); 2 knijpen (anker oorsprong); 5 zoomknoppen **weg** (`CSS:2203-2207`); 6 geen kader, tweede tik opent (`BC:2725`); 7 geen grip; 8 geen sleep/draad/tray-drag; 9 knop blijft; 12 balk `fixed`; 13 balk linksboven; teksten `Dubbeltik om te schrijven` (`BCard:684`) | 12 legenda = werkbalkknop + paneel **in de flow boven de stage** (`MC:938-948, 962`; `CSS:4506-4517`); 9/13 geen Escape → alleen knoppen; andermans hand niet gerapporteerd bij touch (`MC:541`) | 2 knijpen; 11 lang drukken i.p.v. dubbelklik; tags 120 px (`CSS:5342`); telregel `Houd de as ingedrukt…` (`TC:1895-1902`) | 6 geen kader (`FC:348`); toolbar 2 rijen ≤600 (`SCSS:853-856`), woorden weg (`:863-865`), `.save-state` en `.tree-count` weg (`:869-871, 880-882`); kiezer over de volle breedte (`:875-879`); 13 balk linksboven | zonder focus: **geen canvas**, zoekvak + top-20 (`WV:623-649`); met focus: `.web-zoom`, zijkolommen, trail, hint weg (`CSS:5948-5961`, `WV:702, 727, 746, 763`); legenda en paneel als `Sheet` (`WV:766-778`); prop `phone` aan `WebCanvas` ongelezen (`WC:70`) |
| Waar de knoppen heen gaan | `.board-bar` en `.board-tools` wikkelen boven het kurk (`CSS:1751, 1805`); viewport `100dvh − 320px`, min 380 (`CSS:1867-1868`) — `gemeten P-B1`: `.board-bar` **7 rijen** (130 px), `.board-tools` 2 rijen (86 px), kurk 524 px | zelfde werkbalkrij, `.row-wrap` wikkelt (`CSS:403-408`); stage `flex: 1 1 auto`, min 220 (`CSS:4380-4382`) — `gemeten P-M1/P-M2`: 1 rij (2 in plaatsmodus), stage 617 (587); de legenda open kost 178 px van de stage | `.row-wrap.timeline-toolbar` wikkelt; stage min 220 (`CSS:4919`) — `gemeten P-T1`: 2 rijen (74 px) als Keeper, stage 557 | 2 rijen; stage min 260 (`SCSS:172`) — `gemeten P-S1`: 4 rijen (82 px), stage 595 | werkbalk wikkelt |
| Raakdoelen < 44 px (`--tap` `CSS:30`) | `.btn-small` 34 (`CSS:482-485`): alle balk- en inspectorknoppen; `.board-swatch` 26 (`CSS:2158`); inkt 34/22/28 (`CSS:5409-5474`); draadlabel ≈ 20 (`CSS:1938-1955`); `.board-make-entry` ≈ 18 (`CSS:2064-2079`) — `gemeten P-B3`: inspectorknoppen 34 hoog, swatches 26×26 | werkbalk 34; zoom 34×≈37; speld-kop 28 (`CSS:4442-4447`); legenda-checkbox 16 in een rij van 32 (`CSS:4576-4589`); inkt 34/22/28 — `gemeten P-M1`: werkbalk 34, zoom 37×34, legendarijen 32 | werkbalk 34; `.timeline-tag` 24 (`CSS:5074`); marks 12/26 (`CSS:5045-5057`); `Sluiten` 26 (`CSS:5145`); cluster ≈ 19 (`TCSS:62-77`) — `gemeten P-T1`: tag 104×24, knoppen 34 | zoom **26×24** (`SCSS:117-119`); handgrepen en `…` 32 (`SCSS:609-610`); potloodje 22 (`:554-555`); `Erbij` ≈ 21 (`:580-587`); menu-items ≈ 27 (`:669-674`); `.btn-small` 34 — `gemeten P-S1`: zoom 26×24, iconknoppen **29×34** | alle `btn-small` 34; legendarijen 25 (`gemeten P-W1`); knoop-hit tot 10 px (`WC:1135`) |
| De FAB (`+`, 56×56, `right: 1rem; bottom: 76px + safe-area`, z 45, `CSS:956-970`) | in de rechterbenedenhoek van het kurk (`gemeten P-B1`) en **over de gedockte balk heen, op `Selectie opheffen`** (`gemeten P-B3`) | over de rechterbenedenhoek van de stage (`gemeten P-M1`) | 7 px over de stage-onderrand (`gemeten P-T1`) | over de stage-onderrand (`gemeten P-S1`) | — |

**Afwijkingen.**
- Vingersleep: nee (prikbord) tegenover ja (landkaart, tijdlijn, stamboom). `TOEVAL` → ja; met de luie capture (§66) blijft de tweede tik die opent werken (`pressMoved` `BC:2730`).
- Zoomknoppen weg op het prikbord (en het web). `TOEVAL` (rij 5).
- Drie breekpunten op de stamboom (600/767/768). `TOEVAL` → 767, dezelfde `isPhone`.
- Raakdoelen: bijna alles is 34 px omdat `.btn-small` overal `--tap` overschrijft; niets haalt 44. `TOEVAL` — één regel `@media (max-width: 767px) { .btn-small { min-height: var(--tap) } }` raakt de hele site, en dat is de bedoeling.
- Het paneel bij een ding: `fixed` balk / bottom sheet / ongewijzigd. `TOEVAL` → bottom `Sheet` (de vorm die de site voor élk ander blad al heeft, `CSS:1004-1046`).
- Inktbalk-hoek op de telefoon: linksboven (drie) / linksonder (landkaart). `TOEVAL` → één hoek.
- Legenda in de flow boven de stage (landkaart) tegenover `Sheet` (web). `TOEVAL` → `Sheet` (tafel 3).

**Doel.** Op de telefoon: één vinger pant, een vinger op een ding kiest en sleept, tweede tik opent, knijpen zoomt om het vingermidden, de zoomknoppen en `Alles in beeld` blijven, `Ongedaan maken` blijft, elk paneel is een bottom sheet, de inktbalk staat op alle vier in dezelfde hoek, en elk raakdoel is ≥ 44 px. *Waarom:* "telefoon boven desktop" is de eerste prioriteit van het plan, en elk van deze punten is op minstens twee plekken al zo.

### Rij 15 — Lege staat, laadstaat, foutstaat

| | Prikbord | Landkaart | Tijdlijn | Stamboom | Web |
|---|---|---|---|---|---|
| Leeg (verbatim) | `Nog niets geprikt.` + `Zoek hierboven om een {artikel} te prikken, begin een {notitie}, of druk een losse {punaise} in de muur … Sleep vanaf de kop van een {punaise} om {draad} te spannen …` (`BC:3006-3024`); ook op de telefoon, waar "sleep vanaf de kop" niet kan | **op het glas niets**; in de (dichtgevouwen) legenda `Nog geen spelden. Zet de eerste met 'Speld zetten'.` (`MC:838-840`); telregel `0 van 0 spelden te zien · sleep om te schuiven, scroll of knijp om te zoomen` (`MC:1093-1097`) | editor desktop `Nog geen gebeurtenissen. Dubbelklik op de as, of gebruik 'Gebeurtenis toevoegen'.`; telefoon `… Houd de as ingedrukt …`; lezer `Nog geen gebeurtenissen op deze tijdlijn.` (`TC:1840-1851`) | editor `Nog niemand in deze {stamboom}. Zoek een {artikel} hierboven, of maak een {los kaartje}.`; lezer `Deze {stamboom} is nog leeg.` (`FC:2561-2569`) | `Het web wordt gesponnen…` (`WV:729`); fout `Het web laden is niet gelukt.` (`WV:128-140`) |
| Laden | geen tekst (server-render, geen `loading.tsx`: `find app -name loading.tsx` → 0); `.save-state` `Opslaan…`/`Opgeslagen` (`UBS:500-513`) | geen tekst; `<img>` laadt kaal op stippelpapier (`MC:985`, `CSS:4384-4386`) | geen tekst; tot de stage gemeten is niets getekend (`TC:304, 343-346`) | geen tekst; stage start op 900×520 tot gemeten (`FC:160, 300`) | `Het web wordt gesponnen…` |
| Fout | `.save-state`: serverbericht of `Niet opgeslagen — controleer je verbinding` (`UBS:506-509`); toasts; read-only chip `Alleen kijken` (`BC:2333-2338`) | toasts `Opslaan is niet gelukt.`, `Geen verbinding.`, `De speld is niet gezet.`, `Weghalen is niet gelukt.` (`MC:651, 658, 679, 733`) | toasts `De gebeurtenis is niet gezet.`, `Geen verbinding.`, `Opslaan is niet gelukt.`, `Weghalen is niet gelukt.`, `Verwijderen is niet gelukt.` (`TC:1149, 1169, 1246, 1404, 1509`) | `.save-state` als prikbord (`useTreeSync:357-368`); toasts `Dat is niet gelukt.`, `Geen verbinding.` (`FC:1511, 1529`); `Alleen kijken` (`FC:2168-2173`) | `.empty` met de servertekst |
| Zegt het wat je nu kunt doen | ja (editor); lezer krijgt dezelfde zin | alleen in de legenda, dichtgevouwen | ja (editor), nee (lezer) | ja (editor), nee (lezer) | — |

**Afwijkingen.**
- Lege staat op het glas: prikbord, tijdlijn, stamboom ja; landkaart alleen in een dichtgevouwen legenda. `TOEVAL` → een `.map-empty` op het glas zoals de andere drie.
- Laadstaat: nergens een tekst — consistent (server-render). Geen afwijking.
- Foutteksten: `Opslaan is niet gelukt.` / `Niet opgeslagen — controleer je verbinding` / `Dat is niet gelukt.` / `Geen verbinding.` — vier zinnen voor twee situaties. `TOEVAL`, maar **taal is ronde 36**; hier alleen genoteerd.
- Een lezer krijgt op het prikbord de editor-zin ("sleep vanaf de kop"), elders een eigen zin. `TOEVAL` → ronde 36.

**Doel.** Elke lege plek zegt op het glas zelf één zin die begint met wat er is (`Nog niets …`) en één die zegt wat je nu kunt doen — anders voor wie mag bewerken dan voor wie kijkt; de woorden zelf zijn van ronde 36. *Waarom:* drie van de vier doen dit; de landkaart verstopt zijn zin.

---
## Tafel 2 — de makers

Gedeeld door alle kolommen: `Sheet` (portal op `body`, `role="dialog"
aria-modal`, Escape sluit het bovenste blad `Sheet:94-98`, backdrop-pointerdown
sluit `Sheet:153-156`, Tab gevangen `Sheet:100-113`, body-scroll op slot
`Sheet:86-89`, focus naar het paneel tenzij iets binnenin `autoFocus` heeft
`Sheet:140-145`; telefoon = bottom sheet `CSS:1004-1046`, desktop gecentreerd
560 px `CSS:1047-1060`). `SideChoice` (§48, `components/keeper/SideChoice.tsx:46-69`):
label `Alleen op de Keeperkant`, hints `De tafel ziet dit niet.` / `Iedereen die
het archief mag lezen ziet dit.` / gelockt `{dossier} is van de Keeper.`; alleen
voor `ui.isKeeper`. Toast: 6000 ms (`UiP:219`), z 90 boven de sheet-backdrop.

Kolommen: **Prikbord** `NewBoardButton.tsx` (NBB) · **Landkaart** `NewMapButton.tsx`
(NMB) · **Tijdlijn** `NewTimelineButton.tsx` (NTB) · **Stamboom**
`NewFamilyTreeButton.tsx` (NFB) · **Artikel** `ui/NewEntrySheet.tsx` (NES) ·
**Dossier** `ui/NewCaseSheet.tsx` + `cases/NewCaseButton.tsx` (NCS/NCB) ·
**Wiki** `NewOfTypeButton.tsx` (NOT) · **`+`/FAB** (`AppShell.tsx`, `UiP`) ·
**`n`** (`UiP`).

| Rij | Prikbord | Landkaart | Tijdlijn | Stamboom | Artikel | Dossier | Wiki `Nieuw` | `+` / FAB | `n` |
|---|---|---|---|---|---|---|---|---|---|
| Waar de knop staat | `/boards` kopregel `div.row` na `.spacer`, rechts van de h1 (`boards/page.tsx:36-42`); in een dossier eerste van `div.row-wrap`, alleen `!locked` (`CaseDossier.tsx:450-454`, `:206`) — `gemeten P-K1` | `/maps` kopregel, alleen Keeper (`maps/page.tsx:40-47`); niet in een dossier (0 hits in `CaseDossier`) | `/timelines` kopregel (`timelines/page.tsx:49-56`); dossier-tab (`CaseDossier.tsx:515-520`) | `/stambomen` kopregel (`stambomen/page.tsx:43-50`); dossier-tab (`CaseDossier.tsx:575-579`); `/stambomen` niet in de telefoon-tabbalk (`AppShell.tsx:43, 142`) | zijmenu `btn btn-primary` 100 % onder de nav (`AppShell.tsx:127-135`) + `Druk overal op n` (`:136-138`); dossier: `Nieuw artikel in dit dossier` naast het zoekvak (`CaseDossier.tsx:330-339`) | `/cases` kopregel (`cases/page.tsx:50-58`) | `/wiki` en `/wiki/[type]` kopregel (`wiki/page.tsx:42-49`, `wiki/[type]/page.tsx:48-59`) | FAB `.fab` `fixed; right:1rem; bottom: calc(60px + 1rem + safe-area)`, 56×56, z 45, alleen < 768 (`AppShell.tsx:157-164`, `CSS:956-970, 985-987`); niet in de tabbalk (`AppShell.tsx:141-153`) | `window` keydown in `UiP:293-330` |
| Hoe hij heet | `Openbaar prikbord` / in dossier `Maak nieuw prikbord voor dit dossier` (`btn btn-primary btn-small`, `plus`) + `Privé prikbord` (`btn btn-small`, `lock`); `title` `Iedereen mag kijken en prikken` / `Alleen jij en de Keepers, tot je het openzet` (`NBB:74-97`) | `Landkaart ophangen`, `btn btn-primary btn-small`, icoon **`upload`** (`NMB:111-114`) | `Nieuwe tijdlijn` / `Maak nieuwe tijdlijn voor dit dossier`, primary small, `plus` (`NTB:68-71`) | `Nieuwe stamboom` / `Maak nieuwe stamboom voor dit dossier` (`NFB:77-80`) | `Nieuw artikel` / `Nieuw artikel in dit dossier` (`words.newEntry`, `AppShell.tsx:134`) | `Dossier openen`, primary small, `plus` (`NCB:6-12`) | `Nieuw` (met soort) / `Nieuw artikel` / Keeper-woord `type.newButton`, **`btn btn-small` zonder `btn-primary`** (`NOT:16-22`) | `aria-label` `Nieuw artikel` / `… in dit dossier`, tekst `+` (`AppShell.tsx:160`) | `n` zonder ctrl/alt/meta, niet in `INPUT/TEXTAREA/SELECT/contentEditable`, niet met een open blad (`UiP:294-305`) |
| Blad of menu of direct | **direct**: `POST /api/boards` bij de klik, geen naam gevraagd (`NBB:33-46`) | blad `Landkaart ophangen` (`NMB:116-119`) | blad `Nieuwe tijdlijn` (`NTB:74-77`) | blad `Nieuwe stamboom` (`NFB:83-87`) | blad `Nieuw artikel` met × `Sluiten` (`NES:214-222`), gerenderd door `UiP:385-392` | blad `Dossier openen` met × `Sluiten` (`NCS:88-97`, `UiP:394-400`) | → artikel-blad met de soort voorgekozen (`NOT:19`) | → artikel-blad (`AppShell.tsx:131, 161`) | → artikel-blad (`UiP:307-311`) |
| Velden, in volgorde | geen (naam wordt `Nieuw prikbord`/`Privé prikbord`, `NBB:40`); `SideChoice` staat **op de pagina** vóór de knoppen (`NBB:66-73`) | 1 `Afbeelding` (file, **verplicht**, `NMB:122-137`, `:73-76`; plakken `:55-70`) · 2 `Naam` (`:150-159`, valt terug op bestandsnaam `:90`) · 3 `Omschrijving` textarea met `@` (`:162-180`) · 4 `SideChoice` (`:182`) · fout (`:183`) | 1 `Naam` `autoFocus` (`NTB:80-96`) · 2 `Gemeten in` radio's, default `day` (`:27`, `:98-127`) · 3 uitleg (`:128-130`) · 4 `SideChoice` (`:131-138`); **geen omschrijving** | 1 `Naam` `autoFocus` (`NFB:89-105`) · 2 `Waar gaat het over?` input (`:108-117`) · 3 uitleg (`:119-122`) · 4 `SideChoice` (`:123-130`) | 1 Soort (radiogroup `Soort artikel`, `NES:225-244`; default laatste keuze `localStorage['zcf:last-type']` `:83-90`) · 2 `Naam` focus+select, **verplicht** (`:246-264`, `:130-133`, `:361`), met `Bedoel je…` (`:150-174`) · 3 `Korte beschrijving` textarea `@` (`:296-317`) · 4 [dossier-prefix ✓] (`:323-339`) · 5 `SideChoice` (`:341-348`) · 6 fout `role="alert"` (`:350-354`) | 1 `Naam` focus+select, verplicht (`NCS:54-57`, `:99-118`, `:162`) · 2 `Samenvatting` input `@` (`:120-146`) · 3 `SideChoice` (`:149`) · 4 fout (`:151-155`) | als artikel | als artikel | als artikel |
| Waar de primaire knop staat | links van de twee, inline op de pagina (`NBB:74-87`) | onderaan links in `div.row-wrap`: `Ophangen` / bezig `Bezig…`; rechts `Annuleren` (`btn-ghost`) (`NMB:184-191`) | onderaan links: `Openbare tijdlijn` / in dossier `Tijdlijn aanmaken` (`title` `Iedereen mag kijken en gebeurtenissen zetten`); rechts `Privé tijdlijn` (`NTB:139-160`); **geen Annuleren** | onderaan links: `Openbare stamboom` / `Stamboom aanmaken`; rechts `Privé stamboom` (`NFB:131-152`); geen Annuleren | onderaan, 100 % breed: `Aanmaken` / bezig `Opbergen…`, disabled zolang naam leeg (`NES:356-364`) | onderaan, 100 %: `Openen` / `Openen…` (`NCS:157-165`) | als artikel | als artikel | als artikel |
| Enter | n.v.t. (geen veld) | **niets** in Naam (`NMB:153-159`, geen `<form>`, 0 hits) — `gemeten D-M0`: blad blijft open | in Naam → `create(false)` = openbaar (`NTB:90-95`) | in Naam → openbaar (`NFB:99-104`); in het tweede veld niets | in Naam → `create()` (`NES:256-261`); `enterKeyHint="done"` (`:263`); met de `@`-lijst open kiest Enter de naam (`MP:150-155`) | in Naam én Samenvatting → `create()` (`NCS:109-114, 131-136`) | als artikel | als artikel | als artikel |
| Escape | n.v.t. | sluit; **state blijft** (component blijft gemonteerd, 0 hits `setName('')`) — `gemeten D-M0b`: de naam staat er nog | sluit; state blijft (`NTB:73`) — `gemeten D-T0`: de naam staat er nog | sluit; state blijft (`NFB:82`) | sluit via `setEntryPrefill(null)` → **unmount, state weg** (`UiP:389`) | sluit → unmount, state weg (`UiP:397`) | als artikel | als artikel | als artikel |
| Ná het maken | `router.push('/b/' + id)` (id, geen slug, `NBB:52`); **geen `refresh`**, geen toast; naam inline hernoembaar in `.board-bar` `#board-name` (`BC:2313-2330`), niet autofocus | `setOpen(false)`, `push('/maps/' + slug)`, `refresh()` (`NMB:101-103`); naam alleen te wijzigen onder de vouw (`MKT:188-191`) | `push('/timelines/' + slug)` (`NTB:57-58`); **geen `refresh`**; naam alleen via `Instellingen` (`ES:916-927`) | `push('/stambomen/' + slug)` (`NFB:66-67`); geen `refresh`; naam inline in de kop (`TT:82-106`) | sheet dicht, `push('/e/' + slug + '?new=1')` + `refresh()` (`UiP:341-342`) → bewerkkant, naam als `#entry-name` | `push('/c/' + slug + '?new=1')` + `refresh()` (`UiP:358-359`) | als artikel | als artikel | als artikel |
| Als het mislukt | toast `Nieuw prikbord aanmaken is niet gelukt.` — **servertekst genegeerd** (`NBB:47-49`); reject → `Geen verbinding met het archief. Probeer het zo opnieuw.` (`:58`) | inline `error-note` boven de knoppen (`NMB:183`): `Kies eerst een afbeelding.` / servertekst / `Ophangen is niet gelukt.` (`:74, :98`); waarden blijven | **toast** `data.error ?? 'Nieuwe tijdlijn aanmaken is niet gelukt.'` (`NTB:51-54`); blad blijft open met waarden | **toast** `data.error ?? 'Nieuwe stamboom aanmaken is niet gelukt.'` (`NFB:60-63`) | inline `error-note role="alert"` (`NES:350-354`): `data.error ?? 'Opslaan is niet gelukt.'` (`:201`), reject `Geen verbinding met het archief.` (`:208`) | inline `error-note role="alert"` (`NCS:151-155`, `:76`) | als artikel | als artikel | als artikel |
| Telefoon | knoppen in de kopregel (`.row` wikkelt niet, `CSS:398-402`) — `gemeten P-K1`: `SideChoice`, `Openbaar prikbord` en `Privé prikbord` staan **onder elkaar naast de kop**, 126 px breed, 225 px hoog | bottom sheet, `Ophangen` onderaan de scrollende stack; toetsenbord niet headless te meten | bottom sheet; Naam `autoFocus` opent het toetsenbord meteen | idem | bottom sheet; `enterKeyHint="done"` | idem | kopregel-knop **én** FAB: twee openers (`helpers.ts:16-18`) — `gemeten P-K2`: 2 zichtbaar | FAB over de rechterbenedenhoek van elk canvas, en op het prikbord over de inspector — `gemeten P-B1/P-B3/P-M1/P-T1/P-S1` | geen toetsenbord-equivalent |
| `keeperOnly` (§48) | `SideChoice` **op de pagina** vóór de knoppen (`NBB:66-73`); default `sideLocked \|\| side === 'keeper'` (`:31`); gelockt in een Keeper-dossier met `{dossier} is van de Keeper.` (`:29-30`, `:70`) | in het blad ná Omschrijving (`NMB:182`); default `side === 'keeper'` (`:47`); nooit gelockt | ná de uitleg (`NTB:131-138`); default `sideLocked \|\| side === 'keeper'` (`:34`); lock via `caseHere` | ná de uitleg (`NFB:123-130`); lock via prop én `caseHere` (`:42-43`) | ná de dossier-checkbox (`NES:341-348`); lock via `caseHere.keeperOnly` (`:127`) | ná Samenvatting (`NCS:149`); nooit gelockt (`:45`) | als artikel | als artikel | als artikel |
| `ensureAuthor` (§18b) | **nee**: `fetch` direct; server 400 `needsAuthor` → `LiveProvider.tsx:381-391` opent de vraagsheet **naast** de eigen fouttoast (`NBB:48`) | nee (Keeper-only, dus zelden relevant) | nee (`NTB:44-47`) | nee (`NFB:53-56`) | ja, via `askThen` (`UiP:262-271`) | ja (`UiP:273-282`) | ja | ja | ja |

**Afwijkingen.**
- Direct maken (prikbord) tegenover een blad met `Naam` (vijf). `TOEVAL` → blad. *Kosten:* zestien specs klikken `Openbaar prikbord` (of, in een dossier, `Maak nieuw prikbord voor dit dossier` — `helpers.ts:186-191`) en verwachten meteen `**/b/**` (`board-editing.spec.ts:23`, `flow-4-board.spec.ts:22`, `board-live.spec.ts:16`, …); die krijgen één extra regel. Genoteerd als `OPEN` (vraag 9) alleen om de kosten: de meerderheid is duidelijk.
- Foutkanaal: toast (prikbord, tijdlijn, stamboom) tegenover inline `error-note` in het blad (landkaart, artikel, dossier). `TOEVAL` → inline: het blad blijft toch open met de waarden, en de toast staat onder het blad op de telefoon. Prikbord negeert bovendien `data.error`.
- Enter in Naam: submit (vier) / niets (landkaart). `TOEVAL`.
- Autofocus op Naam: vier / geen (landkaart — het bestandsveld staat eerst). `TOEVAL` → Naam krijgt focus; het bestandsveld blijft eerst omdat het verplicht is.
- State na Escape: blijft (drie) / weg (artikel, dossier — unmount in `UiP`). `TOEVAL` → blijft, in de geest van §63 ("de voordeur die niet weggooit wat je typte").
- `router.refresh()` na de `push`: drie wel, drie niet. `TOEVAL` → wel (CLAUDE.md §5: "must `router.refresh()` after every write").
- Sluiten: `Annuleren` (landkaart) / × `Sluiten` (artikel, dossier) / niets (tijdlijn, stamboom). `TOEVAL` → het kruisje komt in `Sheet` zelf (tafel 3) en `Annuleren` vervalt.
- De primaire knop: `Openbare X` + `Privé X` (prikbord, tijdlijn, stamboom) tegenover één knop (landkaart, artikel, dossier). Twee patronen voor twee soorten dingen (containers met rechten; artikelen/dossiers zonder). Niet gestempeld als vorm; de **woorden** (`Ophangen` / `Aanmaken` / `Openen` / `Openbare …`) zijn ronde 36.
- Beschrijvingsveld: `Omschrijving` (textarea) / `Waar gaat het over?` (input) / `Korte beschrijving` (textarea) / `Samenvatting` (input) / geen (tijdlijn). Woorden → ronde 36; vorm: `TOEVAL` → één veld, één rol (`@` overal).
- `NewOfTypeButton` zonder `btn-primary`; landkaart-icoon `upload`. `TOEVAL`.
- De vier container-knoppen slaan `ensureAuthor` over → twee meldingen tegelijk. `TOEVAL` → door `askThen`.
- `keeperOnly`: overal aanwezig, overal vóór de knoppen; alleen het prikbord zet hem op de pagina. `TOEVAL` (volgt uit het blad).
- Naam na het maken: inline (prikbord, stamboom) / alleen in een blad of onder de vouw (tijdlijn, landkaart). `TOEVAL` → de §34-kop als bewerkvak (`TreeTitle`) op de tijdlijn en de landkaart — maat M, mag apart.

**Doel.** Eén blad per maker: `Naam` eerst met focus, dan het ene veld dat de plek nodig heeft (afbeelding, maat, beschrijving), dan `SideChoice`, dan een inline fout en de primaire knop; Enter in `Naam` maakt, Escape sluit en bewaart wat je typte, het kruisje zit in `Sheet`; daarna land je op het ding met `router.refresh()` en een naam die je ter plekke kunt veranderen. *Waarom:* vijf van de zes makers hebben dit blad al; ze verschillen in details die geen van alle een reden hebben.

---

## Tafel 3 — de bladen, de menu's en de kiezers

Kolommen in twee groepen. Rijen: vorm (popover / blad / inline / `<details>`) ·
telefoon · openen · sluiten (E = Escape, O = klik ernaast, X = kruisje) · focus
bij openen / bij sluiten · `role` + naam · klemt hij binnen het scherm · zoekveld
+ debounce + `'X' aanmaken`-rij · Enter en pijltjes · scrolt de pagina eronder.

### 3a — het basisblad en de kiezers

| Rij | `ui/Sheet` | `BoardInspector` | `BoardPicker` (balk / zwevend) | `BoardTray` | `FamilyTreePicker` | `CasePicker` | `EntryPicker` | `RevealPicker` |
|---|---|---|---|---|---|---|---|---|
| Vorm | modaal, portal op `body`, backdrop `fixed inset 0` z 60 (+diepte) (`Sheet:149-152`, `CSS:1004-1008`, `lib/sheetStack.ts:33`) | gedockte balk in de viewport, absolute linksonder z 30, geen backdrop (`CSS:2103-2115`) | balk: inline in `.board-tools`, lijst absolute z 30 zonder `top` (`BP:256`, `CSS:1823-1825`); zwevend: `.board-picker-float` absolute z 40, 20rem, in de viewport (`CSS:1826-1836`, `BC:2945`) | `aside` absolute rechts in de viewport, 210 px, z 20 (`CSS:3367-3382`) | inline, lijst `suggest-list` absolute `top:100%` z 30 (`FamilyTreePicker.tsx:81, 128-131`) | inline, lijst absolute `top:100%` z 30 (`CasePicker.tsx:95, 143-146`) | inline, lijst absolute **zonder `top`** z 30 (`EntryPicker.tsx:114, 127`) | inline chip-rij, niets zweeft (`RevealPicker.tsx:55-63`) |
| Telefoon | bottom sheet, 100 %, `max-height 92dvh`, handle (`CSS:1010-1046`) | `fixed` boven de tabbalk z 44, wikkelt (`CSS:2083-2101`) | balk zelfde; zwevend **onbereikbaar** (geen draad < 768, `BC:418`) | 148 px, `bottom: 64px` literal (`CSS:3383-3394`); overlap met de `fixed` inspector niet gemeten (wel de FAB: `P-B3`) | zelfde (geen `@media` op `.suggest-*`) | zelfde | zelfde | zelfde |
| Openen | door de aanroeper (24 plekken; alle met `labelledBy`) | bij elke keuze (`BC:1177-1178`) | balk altijd gemonteerd, lijst zodra iets getypt (`BP:255`); zwevend bij een draad in het niets (`BC:1557-1570`) | gemonteerd bij `caseId && !readOnly`, open by default (`BC:3027`, `BT:49`); spine `Uit het dossier` (`BT:64-75`) | `onFocus`/`onChange` (`:120-124`), lijst ook bij lege query (`:65`) | `onFocus`/`onChange` (`:135-139`), lijst ook leeg (`:74`) | `onFocus`/`onChange`, lijst alleen met tekst (`:120-126`) | altijd (host `SectionsEditor.tsx:265`, `EntryView.tsx:1165`) |
| Sluiten E / O / X | E: `document` **capture**, alleen het bovenste blad (`Sheet:94-98, 116`) / O: backdrop-pointerdown (`Sheet:153-156`) / X: **geen in de primitive** — acht aanroepers voegen `aria-label="Sluiten"` toe (`NES:220`, `NCS:94`, `BC:3110-3114`, …) | E: window, niet typend (`BC:1708-1719`) / O: kaal kurk (`BC:1310-1311`) / X: `Selectie opheffen` ×3 (`BI:285-292, 338-345, 421-428`) | balk: **E geen, O geen, X geen** — alleen kiezen of het veld legen (`BP:203`, geen `onCancel` `BC:2458-2499`) — `gemeten D-B10`: blijft open na een klik op het kurk; zwevend: E (box + window `BP:202-206`, `BC:1712`) / O: kaal kurk (`BC:1292`) / X geen | E geen / O geen / X: `Lade inklappen` → spine (`BT:86-94`) | E **geen** (0 hits) / O: `document` pointerdown buiten `boxRef` (`:54-60`) / X geen (chip `{naam} verwijderen` `:100-107`) | E geen / O: document pointerdown (`:61-67`) / X geen (`{naam} verwijderen` `:113-121`) | E geen / O: document pointerdown (`:92-98`) / X geen (`Wissen` `:106`) | n.v.t. |
| Focus in / terug | paneel `.focus()` tenzij `autoFocus` binnenin (`Sheet:140-145`); terug naar `previouslyFocused` als de focus nog binnen was (`:91, 127-129`) | niet verplaatst; verloren bij sluiten (0 hits `focus`) | zwevend: `inputRef.focus()` (`BP:99-101`); verloren bij sluiten | niet verplaatst; verloren | eigen focus; verloren bij kiezen (`:113`) | eigen; blijft (meervoud) of verloren (enkelvoud) (`:83-89, 128`) | eigen; verloren als het chipje komt (`:100`) | — |
| `role` + naam | `dialog` `aria-modal` `aria-labelledby` (`Sheet:160-162`) | `group` `Geselecteerde draad` / `… {punaise}` / `… kaarten` (`BI:196, 301, 355`) | geen `role`; verborgen label `Kaart toevoegen` / `Kaart hier vastknopen` (`BP:217-224`) | `aside` `aria-label="Artikelen uit het dossier die nog niet op dit prikbord staan"` (`BT:79`) | geen `role`; host-`<label>` (`FieldsEditor.tsx:603-608`) | geen `role`; host-label | geen `role`; **in `FieldsEditor` geen `id`, dus de `<label htmlFor>` wijst nergens heen** (`FieldsEditor.tsx:730-738, 777-788`, `:605`) | chips `switch` + `aria-checked` (`:65-72`); groep is een `span.label` (`:56`) |
| Klemt | `inset:0` + `max-height 92dvh` scroll (`CSS:1005, 1019-1020`) | CSS `max-width` minus tray (`CSS:2113`); geen JS | zwevend: JS `left ∈ [8, w−336]`, `top ∈ [8, h−90]` (`BC:1557-1569`) — **336 vs CSS 320** (`CSS:1829-1830`), en de lijst tot 15rem loopt onder de viewport-clip (`CSS:1843-1851`) — `gemeten D-B11`: kiezer op 89 px boven de onderrand, 23 rijen, ±1 zichtbaar | top/bottom 10 px, lijst scrolt (`CSS:3406-3413`) | geen JS; `top:100%` | geen | geen | n.v.t. |
| Zoekveld / debounce / aanmaken-rij | n.v.t. | geen (labelvelden) | `/api/suggest` na **160 ms** (`BP:103-124`) + lokale fuzzy top 3; zwevend `‘X’ aanmaken` + beide `‘X’ als notitie toevoegen` (`BP:313-330`) | filter alleen bij > 6, **0 ms**, geen aanmaken (`BT:52-60, 97-110`) | lokaal, 0 ms, top 6; **geen aanmaken** (by design, `FamilyTreePicker.tsx:19-21`) | lokaal, 0 ms; `‘X’ aanmaken` / **`Dossier aanmaken` ook met lege query** (`:162-193`) | `/api/suggest` **160 ms** (`:64-90`); `‘X’ aanmaken` zodra getypt (`:169-196`) | geen |
| Enter / pijltjes | geen (`Sheet:95, 100`) | Enter = opslaan + blur (`BI:213-219, 318-324`) | **geen** (0 hits; geen `<form>`) | geen | geen | geen | geen | native |
| Pagina scrolt eronder | nee — `body overflow: hidden`, eerste-in/laatste-uit (`Sheet:86-89, 120-123`) | ja | ja | ja | ja | ja | ja | ja |

### 3b — de menu's, de legenda's en de filters

| Rij | `MentionPopover` (`@`) | `MapKeeperTools` | `EventSheets` (a nieuw · b bewerken · c instellingen · d "weggehaald") | Knoopmenu stamboom (`TreeCornerMenu`) | Zwevende kiezer stamboom (`TreePickerBox`) | Legenda landkaart | Legenda web | `SortFilterBar` Filters |
|---|---|---|---|---|---|---|---|---|
| Vorm | `<ul class="suggest-list mention-pop" role="listbox">`, portal, `fixed` onder het vak, breedte 220–360, **z 60** (`MP:234-241, 292`), geen backdrop | `<details class="section">` in de flow (`MKT:179-182`) | `Sheet` (a `TC:1909-1911`, b `:1941-1953`, c `:1956-1967`, d `:1922-1938`) | `.tree-menu-anchor` absolute z 8 **in de wereldlaag**, geschaald `1/zoom` (`SCSS:640-645`, `TH:92-96, 151`); lijst `role="menu"` `top:26px` `min-width 12rem` (`SCSS:651-664`) | `.tree-picker` absolute z 40 in de stage, schermcoördinaten, 280 px (`SCSS:691-696`, `FC:2705, 2527`) | desktop `<aside class="map-legend">` absolute linksboven in de stage, 220 px, z 5, scrolt (`CSS:4490-4505`) | desktop `<aside class="web-side web-side-legend">` **in de flow** naast het canvas, 260 px (`WV:726-727`, `CSS:5687-5701`) | desktop `.sortbar-panel` absolute onder de knop, rechts, z 30, `min(30rem, 100vw−2rem)`, `role="dialog"`, geen backdrop (`SortFilterBar.tsx:180, 200`, `CSS:3706-3716`) |
| Telefoon | zelfde (geen `@media` op `.mention-*`) | zelfde `<details>` | bottom sheet | zelfde (`.tree-menu*` buiten elke media); boom-breekpunt 600 (`SCSS:849`) | `left/right 8px; width auto` ≤ 600 (`SCSS:875-879`) | **in de flow boven de stage** `.map-legend-phone` (`MC:962`, `CSS:4506-4517`); werkbalkknop `Legenda` `aria-expanded` (`MC:938-948`) — `gemeten P-M1`: 170 px in de flow, rijen 32 px | `Sheet` `Legenda` (`WV:766-772`); `.web-side` weg (`CSS:5952-5954`) — `gemeten P-W1`: rijen 25 px, geen sluitknop | `Sheet` (`SortFilterBar.tsx:196-198`); `aria-controls` wijst naar een id dat alleen op desktop bestaat (`:186`, `:200`) |
| Openen | `@` of `[[` typen (`MP:35`, `:162-164`); ook een kale `@` | summary `Deze landkaart (Keeper)` (`MKT:183-185`) | a: `Gebeurtenis toevoegen` / dubbelklik / lang drukken / `?place=` (`TC:1616, 1052, 1083, 1225`); b: `Bewerken` (`TC:2126`); c: `Instellingen` (`TC:1643`) | `…` `aria-haspopup="menu"` `aria-label="Meer bij {naam}"` `title="Meer"` (`TH:184-196`) | `+`-handgreep `"{Veld} toevoegen bij {naam}"` (`TH:127-147` → `FC:1644-1662`) | hoekknop `Legenda` `aria-expanded` `title="Legenda uitklappen"` (`MC:1072-1089`); onthouden `localStorage['map-legend-open']` (`MC:120-134`) | werkbalkknop `Legenda` **`aria-pressed`** (`WV:685-688`); niet onthouden (`WV:105`) | knop `Filters` `aria-expanded` `aria-haspopup="dialog"` (`:181-193`) |
| Sluiten E / O / X | E: keydown **op het vak, capture** (`MP:140-143, 165`), alleen met items; **in een `Sheet` wint de document-capture van het blad** (`Sheet:116`) — `gemeten D-T3`: lijst én blad dicht in één Escape / O: blur na 120 ms (`MP:158-161`) / X geen | E geen / O geen / X geen (summary nogmaals) | E: bovenste blad / O: backdrop / X: **geen in a–c**, wél `Sluiten` in d (`TC:1930-1933`) | E: window (`FC:1952-1955`) / O: document pointerdown (`TH:82-89`), kaal papier, andere kaart, kader (`FC:1109, 1160, 1031`) / X geen | E: eigen `onKeyDown` + window (`FC:2727-2731, 1948-1951`) / O: kaal papier zonder beweging (`FC:1105-1111`); **niet bij een klik op een andere kaart** (`FC:1160` wist het menu, niet de kiezer) — `gemeten D-S4`: blijft open, kop ongewijzigd / X geen (`Overslaan` stap 2, `Wissen`) | E **geen** (0 hits) / O **geen** / X: vouwknop `Legenda inklappen` (`MC:819-828`) — een ánder element dan de openknop | desktop E geen, O geen, X geen (dezelfde knop); telefoon: `Sheet` | desktop E: document bubble (`:115-119`) / O: document pointerdown buiten de anchor (`:112-114`) / X: `Klaar` (`:165-167`) — `gemeten D-F1`: blijft open na een chip-klik, Escape sluit, focus naar `body`; telefoon `Sheet` |
| Focus in / terug | niet verplaatst; `el.focus()` bij kiezen (`MP:125`) | native summary | a: `#new-event-query` `autoFocus` (`ES:332`); b/c: paneel; terug via `Sheet` | niet verplaatst; item-unmount → `body` (0 hits in `TH`) | stap 1 niets; stap 2 `Overslaan` (`FC:2711-2718`) — `SCSS:687-689` zegt dat hij de focus neemt, stap 1 doet dat niet | niets; desktop verliest focus bij elke toggle (twee elementen) | desktop niets; telefoon `Sheet` | desktop niets (0 hits); telefoon `Sheet` |
| `role` + naam | `listbox` `Artikelen`, items `option` `aria-selected` (`MP:237-238, 247-248`); het vak krijgt geen `aria-expanded`/`aria-controls` | native `<summary>` | `dialog` via `h2` (`ES:306, 623, 912`) | `menu` **zonder naam** (`TH:198`), items `menuitem` (`:203`) | **geen role, geen naam** — `<div>` (`FC:2721-2724`); kop `<p class="tiny muted tree-picker-head">` | `aside` **zonder naam** (`MC:1061-1068`) | `aside` zonder naam (`WV:727`); telefoon `dialog` `Legenda` | `dialog` `Filters` (`:200`) / telefoon via `{id}-title` (`:156`) |
| Klemt | **geen** (`MP:116, 239`); niet hermeten bij scrollen (`MP:162-166`) | n.v.t. | `max-height 92dvh` | **geen** (`TH:151`); `.tree-stage overflow: hidden` knipt (`SCSS:173`) — `gemeten D-S5`: pas afgeknipt als de kaart-bovenrand binnen ±90 px van de onderrand staat | ja: `left ∈ [8, w−288]`, `top ∈ [8, max(8, h−200)]` (`FC:2706-2707`); de 200 is een aanname, de box kan hoger zijn (schimmenlijst tot 8rem `SCSS:709-713`) | `max-height calc(100% − 1.2rem)` + `overflow: auto`; de zoekresultaten (`absolute` z 30, `MC:872-873`) hangen erin — `gemeten D-M4`: het resultaat staat buiten het zichtbare deel van de scrollende `aside` | in de flow, scrolt | horizontaal ja; verticaal niet (pagina groeit) |
| Zoekveld / debounce / aanmaken-rij | query = tekst na `@`; **120 ms** (`MP:193`); `‘X’ aanmaken` laatst (`MP:286`) | `EntryPicker` 160 ms, `‘X’ aanmaken` (`MKT:206-219`) | a: `#new-event-query` 160 ms (`ES:258`), lijst **in de flow** (`.pin-choices` static `CSS:4567-4570`); rijen `Losse gebeurtenis ‘X’` + `‘X’ als nieuw artikel aanmaken` (`ES:362-395`); b/c geen | geen | `EntryPicker` 160 ms, `‘X’ aanmaken`; schimmen in de flow; `Of een los kaartje` + `Erbij` (`FC:2832-2861`) | lokaal, **0 ms**, 8 hits; geen aanmaken (`MC:346-350, 864-871`) | geen | geen |
| Enter / pijltjes | Enter én Tab kiezen; ↑↓ cyclisch incl. de aanmaak-rij (`MP:144-156`) | geen | a: Enter = eerste rij of losse (`ES:335-340`); pijlen geen | Enter native; pijlen geen | Enter in het los-kaartje-vak = `Erbij` (`FC:2851-2855`); pijlen geen | geen | geen | geen (alleen Escape) |
| Pagina scrolt eronder | ja (in een blad: nee) | ja | nee | ja | ja | ja; wiel in de legenda scrolt de legenda (`MC:631`) | desktop ja / telefoon nee | desktop ja / telefoon nee |

**Afwijkingen (tafel 3, beide helften).**
- **Escape** sluit: `Sheet` (document capture), Filters (document bubble), knoopmenu en kiezer (window), `@`-lijst (op het vak); **niet**: de drie inline kiezers, de balk-`BoardPicker`, de tray, `MapKeeperTools`, beide legenda's op desktop. `TOEVAL` → alles wat zweeft sluit op Escape; een kolom of een `<details>` niet.
- **Klik ernaast** sluit via vier mechanismen (blur+120 ms, document pointerdown, kaal-papier-druk, backdrop) en helemaal niet bij de balk-`BoardPicker` en de legenda van de landkaart. `TOEVAL` → één hook (`useDismiss`: Escape + pointerdown buiten) voor alles wat zweeft.
- **Kruisje**: `Sluiten` (blad-aanroepers ×8, popout, blad d), `Selectie opheffen` (inspector), `Lade inklappen` (tray), `Klaar` (Filters), niets (`Sheet` zelf, blad a–c, menu, kiezer, `@`). `TOEVAL` → het kruisje `Sluiten` zit in `Sheet`; een zwevend paneel bij een ding heeft er ook één (rij 12).
- **Focus**: alleen `Sheet` zet en herstelt focus; elk menu en elke kiezer laat de focus op `body` vallen. `TOEVAL` → wat op Escape sluit geeft de focus terug aan zijn opener.
- **Naam en rol**: `menu` zonder naam, kiezer zonder rol, twee `aside`s zonder naam, `EntryPicker` in `FieldsEditor` zonder `id`. `TOEVAL` → `aria-label` op het menu (`Meer bij {naam}`), `role="dialog"` + `aria-labelledby` op de kiezer, `aria-label="Legenda"` op beide `aside`s, `id` doorgeven in `FieldsEditor`.
- **Klemmen**: knoopmenu niet, kiezer met een aanname van 200 px, zwevende `BoardPicker` 336 vs 320, `@`-lijst niet hermeten. `TOEVAL` → klemmen op de gemeten hoogte, één helper.
- **Debounce** 160 (drie) / 120 (`@`) / 0 (lokaal). `TOEVAL` → één `SUGGEST_DEBOUNCE_MS` voor de fetch-kiezers; lokaal 0 mag.
- **Aanmaken-rij**: `‘X’ aanmaken` (vier) tegenover `‘X’ als nieuw artikel aanmaken` + `Losse gebeurtenis ‘X’` (blad a) en `Dossier aanmaken` met lege query (`CasePicker`). Woorden → ronde 36; `CasePicker` met lege query `TOEVAL` → alleen als er getypt is (drie van de vier). `FamilyTreePicker` zonder aanmaken-rij: **`BEWUST`** per commentaar `FamilyTreePicker.tsx:19-21` — maar zie `OPEN` (vraag 10).
- **Enter en pijltjes**: `@`-lijst en blad a kiezen de eerste rij; de vier kiezers doen niets; alleen de `@`-lijst heeft pijltjes. `TOEVAL` → Enter kiest de eerste rij overal; pijltjes overal of nergens — als de `@`-lijst ze heeft, overal (plan, maatstaf 4).
- **Telefoon**: `Sheet` (Filters, legenda web, paneel web, makers) tegenover in-de-flow (legenda landkaart), `fixed` balk (inspector), ongewijzigd (menu, kiezer stamboom). `TOEVAL` → `Sheet`.
- **Open-staat onthouden**: legenda landkaart ja, legenda web nee, Filters nee. `TOEVAL` → nee (twee van de drie; en een legenda die open stond op een ander scherm neemt daar ruimte in).
- `aria-expanded` (landkaart) tegenover `aria-pressed` (web) op de legendaknop. `TOEVAL` → `aria-expanded`.
- Escape met een `@`-lijst open in een blad sluit het hele blad (`Sheet:116` vóór `MP:165`) — `gemeten D-T3`. `TOEVAL` → de `@`-lijst eerst.
- Klik op een andere kaart sluit het menu maar niet de kiezer van de stamboom (`FC:1160`). `TOEVAL`.

**Doel.** Eén sluitregel voor alles wat zweeft (Escape, klik ernaast, kruisje `Sluiten` — alle drie), één focusregel (naar het paneel of het zoekveld bij openen, terug naar de opener bij sluiten), een `role` en een naam op elk blad, menu en kiezer, klemmen binnen het scherm op de gemeten hoogte, één debounce, Enter kiest de eerste rij en pijltjes lopen de lijst af, en op de telefoon is alles wat zweeft een bottom sheet. *Waarom:* `Sheet` doet al bijna alles goed en is de meerderheidsvorm op de telefoon; de rest zijn acht kleinere dingen die elk hun eigen half-antwoord hebben.

---
## Open vragen — Nick beslist

Alles hieronder is `OPEN`. Er staat bij wat de meerderheid doet en wat het
kost; er staat geen keuze in. Fase 2 begint pas als hier een antwoord op staat
(*Klaar is klaar* punt 1).

1. **Het wiel op de tijdlijn pant (§68); op de andere drie zoomt het.** Ik heb
   het `BEWUST` gestempeld op grond van README regel 68 en `TC:732-748`, maar
   het staat niet in *Bewust anders*. Blijft het? (Zo ja: ctrl+wiel zoomt er al
   om de cursor, dus rij 2 klopt op alle vier; zo nee: één regel in `TC:750-752`
   en regel 68 wordt herschreven — een `DECISIONS`-omkering.)
2. **Zijwaarts wiel.** Het prikbord pant x op een zijwaartse trackpad-veeg
   (`BC:1644-1647`); de landkaart, de stamboom en het web negeren `deltaX`. De
   meerderheid is "niets" en dat is het enige vakje in de tafel waar de
   meerderheid een dood gebaar is. Naar alle vier (één regel in de gedeelde
   wielhelper, S) of naar geen (één regel weg)?
3. **Toetsen voor de camera** (`+` `−` `0`, pijltjes). Alleen de tijdlijn (en het
   web met `f`) heeft ze; de knoppen zijn overal met Tab bereikbaar, dus een
   toetsenbordgebruiker is niet buitengesloten. Naar alle vier (S, één gedeelde
   keydown in `components/canvas/`) of naar geen (de tijdlijn verliest ze, en
   zijn `aria-label` "pijltjes schuiven, + en - zoomen" `TC:1666` gaat mee)?
4. **Dubbelklik op leeg papier maakt iets** (tijdlijn: nieuwe gebeurtenis op dat
   moment, `TC:1041-1053`; telefoon: lang drukken 500 ms, `TC:1070-1086`). De
   andere drie hebben alleen de knop. Het is de reden dat taak A op de tijdlijn
   4 is en niet 7. Naar alle vier (prikbord: notitie op die plek; stamboom:
   los kaartje op die plek; landkaart: het is al `Speld zetten` + tik — M per
   plek, 1,5–2 u samen) of naar geen (de tijdlijn wordt 7)?
5. **De zoomgrenzen van de landkaart** (`fit × 0.4` tot 8 in beeldpixels,
   `MC:44-45`) tegenover `MIN_ZOOM`/`MAX_ZOOM` 0.25–2.5. Zoom 1 is op een
   landkaart "1 beeldpixel per schermpixel"; een kaart van 400 px breed is bij
   2.5 nog klein, een kaart van 4000 px is bij 0.25 nog leesbaar. Blijft de
   landkaart in beeldpixels (dan alleen `clampZoom`/`fitViewport` met eigen
   grenzen), of gaat hij op de gedeelde 0.25–2.5 ten opzichte van *fit*?
6. **Bevestigen of undo-toast bij verwijderen.** Prikbord: geen vraag, toast
   met `Ongedaan maken` (`BC:942-984`). Stamboom: altijd vragen (`FC:1320-1422`)
   én undo. Landkaart en tijdlijn: vragen, geen undo. Eén regel voor alle
   vier: (a) nooit vragen, altijd undo + toast; (b) altijd vragen; (c) vragen
   alleen waar geen undo is (dan volgt het uit vraag 8). De telling voor taak C
   verschilt er één handeling mee.
7. **Snappen op de tijdlijn** naar de precisie van de gebeurtenis (`TC:888`,
   `time:186-191`) — `BEWUST` gestempeld op §62/`snapTo` omdat het de eenheid
   van het gegeven is, niet op de lijst. Akkoord?
8. **Undo van een verwijdering op de landkaart en de tijdlijn.** Een
   verplaatsing terugdraaien is één `PATCH` (rij 9, in fase 2). Een
   verwijdering terugdraaien vraagt een tombstone of een herstelroute per
   speld/gebeurtenis (het prikbord heeft `deleted.cards`, `merge.ts:730-740`);
   zonder krijgt een teruggezette gebeurtenis een nieuw id en breekt `?event=`
   en de live-kamer. Dat is 3 u+ en eigen `DECISIONS`-ruimte — deze ronde of
   een eigen ronde?
9. **Het prikbord maken via een blad met `Naam`** (nu: één klik, naam
   `Nieuw prikbord`, `NBB:33-46`). De meerderheid (5 van 6) heeft een blad; de
   kosten zitten in zestien specs die de directe weg verwachten (+1 regel elk,
   ~1 u). Akkoord met de meerderheid, of blijft het prikbord de snelle
   uitzondering?
10. **`FamilyTreePicker` zonder `‘X’ aanmaken`-rij** — per commentaar
    "by design" (`FamilyTreePicker.tsx:19-21`), terwijl `CasePicker` en
    `EntryPicker` er wel een hebben. Blijft dat?
11. **De `NN%`-uitlezing** naast de zoomknoppen (prikbord, stamboom) vervalt in
    het doel van rij 5 omdat drie van de vijf plekken hem niet hebben en hij op
    de landkaart en de as niets betekent. Bezwaar?

Twee dingen die géén vraag zijn maar wel een keuze van deze ronde, voor de
volledigheid: de **woorden** (`Ophangen`/`Aanmaken`/`Openen`, `Passend maken`,
`Kies eerst…`, de vier foutzinnen) gaan naar ronde 36 behalve waar een spec de
naam vastpint en de vorm verandert (`Passend maken` → `Alles in beeld`); en het
**web** wordt nergens aangeraakt behalve waar een gedeelde component (de
zoomknoppen, het kruisje in `Sheet`) hem vanzelf meeneemt.

---

## Werklijst fase 2 — per as, met een maat

Maten volgens `CLAUDE.md` §2: **S** = een constante, een knop, een regel CSS
(10–30 min) · **M** = een veld of een gebaar op één plek met UI en tests
(30–90 min) · **L** = een nieuw gebaar op een canvas (1,5–3 u) · **XL** = 3 u+,
eigen sessie. Elke golf = één rij uit de tafel over alle plekken tegelijk, één
agent, één commit; tussen de golven `tsc` + `vitest` + de specs van de
aangeraakte plekken, en `E2E_DEV=1` na elke golf die pointer-code raakt (as 1,
2 en 6). De items met een `?` hangen aan een open vraag.

### As 1 — Camera (rijen 1–5) — ± 5–6 u

| # | Item | Plekken | Maat |
|---|---|---|---|
| 1.1 | Eén wielhelper in `lib/canvas/view.ts` (`exp(−deltaY × 0.0015)`), knopstap `ZOOM_STEP` 1.25, `FIT_PADDING` 48 overal; prikbord van vaste 1.1 en padding 40 af, landkaart en tijdlijn knopstap; tijdlijn-fit met 48 px lucht in plaats van ×1.25 | 4 | S–M (45 min) |
| 1.2 | Knijpen op het prikbord om het vingermidden via `zoomAbout`, en geen tweede pan onder de knijp (`BC:1316`, `:1658-1670`) | prikbord | M (1 u, `E2E_DEV`) |
| 1.3 | Landkaart op `clampZoom`/`fitViewport` (fit klemt en pad); grenzen volgens vraag 5 | landkaart | M (1–1,5 u) |
| 1.4 | Alleen de linkerknop en een vinger beginnen een pan (`TC:948`, `FC:986`); knop-check op punaise-kop, grip, draadeind, draad (`BC:1210-1261`) | tijdlijn, stamboom, prikbord | S (30 min) |
| 1.5 | Eén `CanvasZoomControls` (`Uitzoomen · Inzoomen · Alles in beeld`, iconen, `aria-label` + `title`, woord op de laatste, `role="group"`), in de werkbalk rechts, ook op de telefoon; landkaart `Passend maken` → `Alles in beeld` (+ `maps.spec.ts:120`); stamboom 26×24 weg; prikbord `display:none` weg; `NN%` weg (vraag 11) | 4 | M (1,5–2 u incl. specs) |
| 1.6 | `DRAG_SLOP` 4 hypot als de ene klik-of-sleep-drempel, gedeeld uit `lib/canvas/` | 4 | S (30 min) — overlapt 2.3 |
| 1.7? | Zijwaarts wiel (vraag 2); toetsen `+ − 0` (vraag 3) — één gedeelde keydown-hook | 4 | S elk (30 min) |
| 1.8 | `tests/e2e/canvas-contract.spec.ts`, eerste helft: wiel om de cursor, `Alles in beeld`, zoomknoppen op naam, per plek en op de telefoon (`SURFACES`-lijst uit het plan) | spec | M (1,5 u) |

### As 2 — Kiezen en slepen (rijen 6–8) — ± 7–9 u

| # | Item | Plekken | Maat |
|---|---|---|---|
| 2.1 | Landkaart op `useMarqueeSelect`: spelden kiesbaar, shift-klik, shift-sleep, Escape, druk-op-gekozen laat de groep staan, groepssleep via `groupDelta`, `holding` + `.map-held`-ring, kader als `s`, `Delete`/`Backspace` | landkaart | L (2,5–3 u) — vereist 3.3 |
| 2.2 | Tijdlijn op `useMarqueeSelect`: tags kiesbaar (klik kiest én klapt het venster open), shift-klik, shift-sleep, Escape, groepssleep langs de as, `holding`, `Delete` | tijdlijn | L (3 u) |
| 2.3 | Luie pointer capture bij `DRAG_SLOP` op de landkaart (`MC:492, 519`) en de tijdlijn (`TC:856`); prikbord capture op de stage bij de drempel i.p.v. window-listeners (`BC:1751`); `router.refresh()` na een speld-verplaatsing | landkaart, tijdlijn, prikbord | M (1–1,5 u, `E2E_DEV`) |
| 2.4 | Shift-druk op een gekozen kaart toggelt pas op de up zonder beweging (`pressSelection`) — als `D-B4`/`D-S7` het bevestigen | prikbord, stamboom (één plek: `sel`/`marq`) | S (30 min) |
| 2.5 | Klik op een schim kiest hem niet (`FC:1158` achter de `member`-check) | stamboom | S (15 min) |
| 2.6 | Eén ring-token voor "gekozen" en één voor "vastgehouden", in `globals.css`/`stambomen.css`; `tree-contrast.test.ts` nalopen | 4 | S (30 min) |
| 2.7 | Contract-spec, tweede helft: Escape wist, shift-klik wisselt, shift-sleep veegt, gewone sleep pant, druk op gekozen laat staan | spec | M (1 u) |

### As 3 — Ongedaan, weghalen, het paneel bij een ding (rijen 9–12) — ± 6–8 u

| # | Item | Plekken | Maat |
|---|---|---|---|
| 3.1 | Undo van een verplaatsing op de landkaart en de tijdlijn over `undoStack` (een `PATCH` terug), Ctrl+Z + knop `Ongedaan maken` (icoon + woord, `title`, `disabled` bij lege stack) — ook de bestaande twee knoppen `disabled` maken en het prikbord een `aria-label`/icoon geven | 4 | M + M (2–2,5 u) |
| 3.2 | `Delete`/`Backspace` op de landkaart en de tijdlijn (na 2.1/2.2); één bevestigingsregel (vraag 6); `Lijn verwijderen` volgt die regel | 4 | S (30 min) |
| 3.3 | Het speld-blad wordt een niet-modaal paneel op desktop (als `BoardInspector`: linksonder in de stage, `role="group"`, kruisje `Sluiten`, Escape, klik op leeg papier) en een `Sheet` op de telefoon; `Openen`/velden/`Speld weghalen` erin | landkaart | L (2–3 u) |
| 3.4 | Knoopmenu van de stamboom klemmen zoals de kiezer; kiezer klemmen op gemeten hoogte; potlood-aan sluit het menu; klik op een andere kaart sluit de kiezer | stamboom | S–M (45 min) |
| 3.5 | Verwijderknop één klik diep in het paneel op de tijdlijn (nu venster → `Bewerken` → blad) | tijdlijn | S (30 min) — na 3.3-vorm |
| 3.6? | Undo van een verwijdering met tombstone/herstel op landkaart en tijdlijn (vraag 8) | landkaart, tijdlijn | XL (3 u+, eigen sessie) |

### As 4 — De makers (tafel 2) — ± 3–4 u

| # | Item | Plekken | Maat |
|---|---|---|---|
| 4.1? | Prikbord via een blad met `Naam` + `SideChoice` erin, Enter maakt (vraag 9) + zestien specs één regel | prikbord | M (1 u) + specs (1 u) |
| 4.2 | Inline `error-note` in het blad voor tijdlijn en stamboom; prikbord leest `data.error` | 3 | S (30 min) |
| 4.3 | Landkaart: Enter in `Naam` maakt; `Naam` krijgt focus | landkaart | S (15 min) |
| 4.4 | `router.refresh()` na de `push` bij prikbord, tijdlijn, stamboom | 3 | S (10 min) |
| 4.5 | Artikel- en dossierblad bewaren de getypte waarden na Escape (state in `UiProvider` of het blad gemonteerd laten) | artikel, dossier | M (45 min) |
| 4.6 | Kruisje `Sluiten` in `Sheet` zelf; de acht eigen kruisjes en `Annuleren` (landkaart) weg | alle bladen | M (45 min) |
| 4.7 | De vier container-knoppen door `askThen`/`ensureAuthor` (geen dubbele melding) | 4 | S (30 min) |
| 4.8 | Eén beschrijvingsveld (vorm) met `@` op alle bladen; woorden → ronde 36 | 4 | S (30 min) |
| 4.9 | Naam ter plekke te wijzigen na het maken op de tijdlijn en de landkaart (`TreeTitle`-vorm in de §34-kop) | tijdlijn, landkaart | M + M (1,5–2 u) — mag apart |
| 4.10 | Contract-spec: de primaire knop van het maakblad heeft op alle plekken dezelfde naam-vorm | spec | S (30 min) |

### As 5 — De bladen en de kiezers (tafel 3) — ± 4–5 u

| # | Item | Plekken | Maat |
|---|---|---|---|
| 5.1 | `useDismiss` (Escape + pointerdown buiten + focus terug naar de opener) voor alles wat zweeft: de drie inline kiezers, balk-`BoardPicker`, knoopmenu, kiezer stamboom, Filters, legenda landkaart, `@`-lijst | 9 | M (1,5 u) |
| 5.2 | `useSuggestKeys`: Enter kiest de eerste rij, ↑↓ lopen de lijst (als de `@`-lijst) in `EntryPicker`, `CasePicker`, `FamilyTreePicker`, `BoardPicker`, blad a | 5 | M (1–1,5 u) |
| 5.3 | Namen en rollen: `aria-label` op het knoopmenu, `role="dialog"` + `aria-labelledby` op de kiezer, `aria-label="Legenda"` op beide `aside`s, `id` in `FieldsEditor`, `aria-expanded` op de web-legendaknop | 5 | S (30 min) |
| 5.4 | Klemmen: knoopmenu (3.4), kiezer op gemeten hoogte, zwevende `BoardPicker` 320, `@`-lijst hermeten bij scrollen | 4 | S–M (45 min) |
| 5.5 | Escape met een `@`-lijst open sluit eerst de lijst (volgorde `Sheet:116` / `MP:165`) | `@` in bladen | S (30 min) |
| 5.6 | `CasePicker` aanmaak-rij alleen als er getypt is; één `SUGGEST_DEBOUNCE_MS` | 2 | S (15 min) |
| 5.7 | Legenda landkaart op de telefoon als `Sheet`; open-staat niet onthouden | landkaart | M (45 min) |
| 5.8 | Legenda web → deze as raakt het web alleen via 5.3 (naam) en 4.6 (kruisje) | web | — |

### As 6 — De telefoon (rij 14), op 390 px gemeten — ± 4–5 u

| # | Item | Plekken | Maat |
|---|---|---|---|
| 6.1 | `.btn-small` en de andere raakdoelen ≥ 44 px onder 768 px (`--tap`); swatches, handgrepen, potloodje, `Erbij`, menu-items | site-breed | M (1 u incl. kijken op elke pagina) |
| 6.2 | Vingersleep van kaarten op het prikbord (`interactive` los van `isPhone`, luie capture, tweede tik blijft openen) | prikbord | M–L (1,5 u, `E2E_DEV`) |
| 6.3 | Stamboom op één breekpunt (767) | stamboom | S (20 min) |
| 6.4 | Paneel bij een ding als bottom `Sheet` op de telefoon (prikbord-inspector, stamboom-menu/kiezer, tijdlijn-venster) — landkaart via 3.3 | 3 | M–L (2 u) |
| 6.5 | Eén hoek voor de inktbalk op de telefoon (`InkShell` beslist, niet één CSS-klasse) | 4 | S (20 min) |
| 6.6 | Werkbalken die wikkelen: op basis van `P-B1/M1/T1/S1` — waar de stage onder zijn minimum komt, iconen zonder woord (zoals `.tree-tool-word`) | 4 | S–M (45 min) |
| 6.7 | Lege staat op het glas van de landkaart (rij 15) | landkaart | S (20 min) |
| 6.8 | Contract-spec op het `phone`-project: dezelfde beweringen, plus raakdoel ≥ 44 op de zoomknoppen en de inktbalk | spec | M (1 u) |

### Afsluiting (docs-agent, na alle golven)

| # | Item | Maat |
|---|---|---|
| 7.1 | README regel 69 + codemarkers `§69` op de gedeelde plekken; `DECISIONS.md` ronde 35 (met de antwoorden op de open vragen en de omkeringen die ze meebrengen); `GLOSSARY-NL.md` als er een woord bij komt; hertelling *vóór → ná* in de rondenotitie | M (1 u) |

**Totaal ± 30–37 u** zonder de `?`-items. Een natuurlijke splitsing in drie
partijen: **(1)** as 1 + as 2 (de hand: 12–15 u, alles wat `E2E_DEV` nodig
heeft), **(2)** as 3 + as 4 (undo, weghalen, panelen, makers: 9–12 u), **(3)**
as 5 + as 6 + afsluiting (bladen, telefoon, docs: 9–11 u). Elke partij eindigt
groen op de basislijn en met zijn deel van `canvas-contract.spec.ts`.

---
## Metingen (gemeten)

Gedaan op 14 september 2026 tegen de productie-build van `17b2edb` op een verse
`data-e2e` (Keeper), met Playwright/Chromium: desktop 1440×900, telefoon Pixel
5-emulatie 390×844 met `hasTouch` en CDP-touch. Eén prikbord, twee
landkaarten (800×500 en 200×150), één tijdlijn (dagschaal) en één stamboom zijn
via de makers aangemaakt. Het script staat niet in de repo (het is geen spec);
de uitkomsten wel, hier. Waar een meting een vakje hierboven bevestigt of
tegenspreekt staat dat bij het vakje.

### Desktop 1440×900

| # | Waar | Wat gedaan | Uitkomst |
|---|---|---|---|
| D-B1 | prikbord | wiel `deltaY −100`, dan één event `deltaY −300` | 100 % → 110 % → 121 %: **vaste factor 1.1 per event**, de grootte van `deltaY` doet er niet toe |
| D-B2 | prikbord | ctrl+wiel `+100` | 121 % → 110 %: zelfde factor als het kale wiel |
| D-B3 | prikbord | zijwaarts wiel `deltaX +120` | `.board-world` x −58 → −178: **pant 120 px**, zoom ongewijzigd |
| D-B4 | prikbord | A kiezen, shift-klik B (2 gekozen), shift-druk op B en 120 px slepen | **beide kaarten 120 px mee**, B daarna **niet meer omlijnd**, 1 gekozen — de toggle en de groepssleep gebeuren allebei |
| D-B5 | prikbord | 2 gekozen, gewone druk op één; daarna gewone sleep 100 px | groep blijft staan (2 tijdens de druk, 2 na loslaten); de andere kaart schuift 100 px mee |
| D-B6 | prikbord | kaart aan de rand tot 60 px onder de viewport slepen en daar loslaten | de kaart volgt tot de laatste move **binnen** de viewport (top 269 → 811, onderrand 869) en stopt daar; loslaten erbuiten wordt door de window-listener afgemaakt |
| D-B7 | prikbord | rechtermuisknop ingedrukt op de punaise-kop van een kaart, 90 px slepen | tijdens de sleep staat er een `path.board-string.board-string-drawing` in de svg (**draad-in-wording op de rechterknop**); na loslaten op kaal kurk: 0 draden, geen zwevende kiezer |
| D-B8 | prikbord | potlood aan, wiel boven het kurk | 110 % → 121 %: **het wiel zoomt onder het tekenvel** |
| D-B9 | prikbord | draad spannen, `#string-label` invullen, Escape | inspector blijft, focus blijft in `string-label`; een tweede Escape ná een klik op de balk sluit hem: **twee stappen** |
| D-B10 | prikbord | typen in `Kaart toevoegen`, dan op het kurk klikken | de suggestielijst **blijft open** |
| D-B11 | prikbord | draad losgelaten 40 px boven de onderrand, `a` typen | zwevende kiezer op y 780 (viewport-onderrand 869), 23 rijen, laatste rij eindigt op y 2121: **de lijst loopt onder de viewport-clip door**, ±1 rij zichtbaar |
| D-M0 | maker landkaart | Enter in `Naam` | niets: blad blijft open, URL blijft `/maps` |
| D-M0b | maker landkaart | naam typen, Escape, opnieuw openen | naam `Proefkaart` staat er nog |
| D-M1 | landkaart | wiel, ctrl+wiel, `deltaX` | 1.485 → 1.725 → 2.005 (beide ×1.16 = `exp(0.15)`); `deltaX`: niets |
| D-M2 | landkaart | speld gezet (blad opent), speld 80 px proberen te slepen | 0 px, het blad blijft staan (de druk landt op het blad/de backdrop); na Escape: 80 px |
| D-M3 | landkaart | potlood aan, wiel | 1.485 → 1.725: wiel zoomt onder het tekenvel |
| D-M4 | landkaart | legenda open, `p` typen in `Zoek een speld` | 1 resultaat; de rij eindigt op y 328, de `aside` op y 287 (`scrollHeight` 211 > `clientHeight` 168): **het resultaat staat in de scrollende legenda, niet in beeld** |
| D-M5 | landkaart (200×150) | `Passend maken`, 2× `Inzoomen` | fit 5.04 → 7.06 → **8** (plafond); fit komt hier niet boven `MAX_ZOOM`; dat kan pas bij een afbeelding smaller dan ±180 px |
| D-T0 | maker tijdlijn | naam typen, Escape, opnieuw openen | naam `Proeflijn` staat er nog |
| D-T1 | tijdlijn | wiel `deltaY +100`, dan `deltaX +120`, één vaste tick (`23 dec`) gevolgd | x 514 → **614** (papier 100 px naar rechts, "met de hand mee") → **494** (`deltaX` schuift het 120 px naar links: de scrollbar-richting) |
| D-T2 | tijdlijn | rechtermuisknop ingedrukt op de kale as, 100 px naar rechts | tick 494 → 594: **de rechterknop pant**; `timeline-stage-grabbing` tijdens, weg erna |
| D-T3 | tijdlijn | dubbelklik op de as → blad; `@ja` in het tekstvak (lijst open); Escape | **lijst én blad dicht** in één Escape |
| D-T4 | tijdlijn | tag klikken → venster; wiel boven het venster; Escape met de focus op `Sluiten` in het venster | de as beweegt **niet** (tick 514 → 514), **de pagina scrolt** 100 px; het venster **blijft open** na Escape |
| D-T5 | tijdlijn | potlood aan: wiel, ctrl+wiel | wiel: tick 594 → 694 (**pant onder het tekenvel**); ctrl+wiel: 10 → 12 ticks (zoomt) |
| D-S1 | stamboom | wiel, ctrl+wiel, `deltaX` | 82 % → 95 % → 111 % (beide ×1.16); `deltaX`: niets |
| D-S2 | stamboom | kaart gekozen; rechtermuisknop op kaal papier, 100 px slepen | `.tree-world` x 360 → 460: **de rechterknop pant**; `is-grabbing` tijdens; selectie blijft (de druk bewoog > 3 px) |
| D-S3 | stamboom | kaart kiezen, `…` openen, potlood aan, Escape | potlood-aan leegt de selectie, dus de handgrepen en het menu verdwijnen; na Escape 0 gekozen, geen menu — **geen probleem** (de zorg uit de inventaris vervalt) |
| D-S4 | stamboom | `+` boven A (kiezer `Ouders bij Jacob den Hollander`), dan op B klikken | kiezer **blijft open met dezelfde kop**, B is gekozen |
| D-S5 | stamboom | kaart tot 40 px boven de onderrand slepen, `…` openen | menu 192×64 op y 743, laatste item eindigt op 806 < stage-onderrand 863: op deze plek **niet** afgeknipt; afknippen begint pas als de bovenrand van de kaart binnen ±90 px van de onderrand staat (26 px offset + 64 px menu) |
| D-S6 | stamboom | potlood aan, wiel | 111 % → 129 %: wiel zoomt onder het tekenvel |
| D-S7 | stamboom | A+B gekozen, shift-druk op B, 120 px slepen | B 120 px mee, daarna **niet meer omlijnd**, 1 gekozen — hetzelfde als D-B4 |
| D-F1 | Filters `/cases` | chip `Open` klikken; Escape | popover **blijft open** na de klik (`aria-pressed=true`); Escape sluit; focus valt op `body` |
| D-K1 | zijmenu | `Nieuw artikel` in het zijmenu op 1440×900 | box y 649–693: zonder scrollen in beeld |

### Telefoon 390×844

| # | Waar | Wat gedaan | Uitkomst |
|---|---|---|---|
| P-K1 | kopregels `/boards` `/maps` `/timelines` `/stambomen` `/cases` `/wiki` | positie van de h1 en de makerknoppen | de kopregel blijft **één rij**: het h1-blok links, de knoppen ernaast in een kolom van 88–135 px; op `/boards` staan `SideChoice`, `Openbaar prikbord` en `Privé prikbord` onder elkaar naast de kop (126×225 px); `Landkaart ophangen` en `Nieuwe tijdlijn`/`stamboom` breken op twee regels (44 px hoog); geen horizontale overloop |
| P-K2 | `/wiki` | zichtbare openers `Nieuw artikel` | **2** (kopregel + FAB) |
| P-B1 | prikbord | balken en kurk | `.board-bar` **7 rijen**, 130 px; `.board-tools` 2 rijen, 86 px; kurk 524 px hoog (y 297–821); zoomknoppen weg; inktbalk linksboven 44×44; FAB op (318, 712) **in de rechterbenedenhoek van het kurk** |
| P-B2 | prikbord | knijpen 100 → 200 px op kaal kurk (vinger 1, dan vinger 2) | zoom 0.743 → 1.351, `y` **ongewijzigd**, `x` verschuift 50 px: **anker is niet het vingermidden**, en de tweede vinger pant erdoorheen |
| P-B3 | prikbord | tik op de rand van een kaart; tweede tik op dezelfde rand | 1 gekozen, inspector `fixed` op y 684–776, 92 px hoog, 374 breed; **de FAB (318–374, 712–768) ligt er volledig overheen**, precies waar `Selectie opheffen` staat; knoppen 34 px hoog (`Foto toevoegen` 134×34, `Kaart verwijderen` 149×34, `Selectie opheffen` 37×34), swatches 26×26; een tweede tik op de rand opent niets (openen zit op het vlak/de naam, `BCard:492`) |
| P-B4 | prikbord | kaart met één vinger 80 px | 0 px: geen vingersleep |
| P-B5 | prikbord | één vinger op kaal kurk 80 px | `.board-world` x −403 → −323: pant |
| P-M1 | landkaart | werkbalk, stage, legenda, knoppen | werkbalk 1 rij (34 px): `Speld zetten` 118×34, `Legenda` 93×34, drie zoomknoppen 37×34; stage 617 px; legenda open = 170 px in de flow, stage wordt 439; legendarijen 32 px; inktbalk linksonder (17, 686); FAB overlapt de rechterbenedenhoek van de stage (stage tot y 739) |
| P-M2 | landkaart | `Speld zetten` (plaatsmodus) | werkbalk 2 rijen (64 px), stage 587 |
| P-M3 | landkaart | knijpen 100 → 200 (sequentieel) | 0.468 → 0.935, x/y verschuiven mee: **om het vingermidden**; twee vingers die in één `touchstart` neerkomen gaven géén knijp (eerste pas) |
| P-T1 | tijdlijn (Keeper) | werkbalk, stage, tags | werkbalk **2 rijen** (74 px): `Gebeurtenis toevoegen` 182, `Alles tonen` 109, 3× 37, `Instellingen` 116, alle 34 hoog; stage 557; tag 104×24; inktbalk linksboven; FAB overlapt de stage-onderrand 7 px |
| P-T2 | tijdlijn | 700 ms ingedrukt houden op de as | blad `Gebeurtenis op …` opent, zoekvak op y 737 (bottom sheet) |
| P-T3 | tijdlijn | knijpen | 3 → 5 ticks: zoomt |
| P-S1 | stamboom | werkbalk, stage, knoppen | werkbalk 4 rijen (82 px); stage 595; zoomknoppen **26×24**; de iconknoppen `Los kaartje`, `Opnieuw schikken`, `Ongedaan maken`, `Alles in beeld` zijn **29×34**; `.tree-count` weg; inktbalk linksboven; FAB overlapt de stage-onderrand |
| P-S2 | stamboom | kaartje met één vinger 100 px; herladen; `Opnieuw schikken` | 100 px mee; handgrepen 32×32; na herladen zet `Opnieuw schikken` het kaartje 100 px terug: **de vingersleep pint en blijft** |
| P-S3 | stamboom | tik op een al gekozen kaart, tik op de naam | navigeert naar `/e/jacob-den-hollander` |
| P-W1 | web `?focus=` | legenda-sheet | werkbalkknoppen 34–35 px; legendarijen **25 px**, koppen 23, `Niet in dit web` 24; **geen sluitknop** in de sheet |

Niet headless te meten, en daarom niet gemeten: het schermtoetsenbord (of de
primaire knop van een blad erboven blijft), shift+wiel (de browser beslist of
dat `deltaX` wordt), lang drukken op een echt toestel (OS-callout), en de
middelste muisknop-autoscroll van Windows.

---

## Spec-bewijs (samengevat)

Wat de e2e-specs vandaag al vastpinnen, per plek. Wat hier **niet** staat is
nergens gepind, en dat is de lijst voor `canvas-contract.spec.ts`.

- **Prikbord**: pan op kaal kurk na Escape (`flow-4-board.spec.ts:86-92`);
  telefoonhint en tweede-tik-opent (`:14, 65-67, 172-176`); één klik kiest,
  dubbelklik opent (`board-strings-borders.spec.ts:371-392`); shift-sleep-kader
  live (`board-live.spec.ts:413-460`); `Delete` en Ctrl+Z na een verwijdering
  (`board-delete-sticks.spec.ts:60-101`); Escape sluit de inspector
  (`board-editing.spec.ts:66-67`); potlood aan → sleep tekent, Escape
  (`ink.spec.ts:212-238`); zwevende kiezer en Escape (`round-27-board.spec.ts:148-175`).
  **Niet gepind**: wiel, ctrl+wiel, `Uitzoomen`/`Inzoomen`, `Alles in beeld`,
  knijpen, rechterknop, `Backspace`, de undo-knop.
- **Landkaart**: fracties van `.map-world` (`maps.spec.ts:55-59`); `Speld
  zetten` → `Wat komt hier?` → speld (`:92-99`), Escape sluit het blad (`:101`);
  3× `Inzoomen` en `Passend maken` (`:112-120`); legenda-knop met
  `aria-expanded` op de telefoon, vinkje onthouden (`:39-44, 122-131`); speld →
  blad, `Speld weghalen` + bevestiging (`:134-170`); stage ≥ 62 %
  (`canvas-fills-the-screen.spec.ts:98-110`); potlood, streek groeit mee met
  `Inzoomen` (`ink.spec.ts:306-332`). **Niet gepind**: wiel, knijpen, sleep van
  een speld, rechterknop.
- **Tijdlijn**: sleep snapt op een dag en schrijft het artikel-veld
  (`timelines.spec.ts:275-322`); klik klapt alleen uit (`:324-357`); anker-fence
  na 8× `Uitzoomen` (`:359-421`); lang drukken (`timeline-coop.spec.ts:290-345`,
  alleen telefoon); klik op kale as sluit één venster, `Alles inklappen`
  (`:347-418`); gedragen tag reist mee (`:73-133`); potlood en Escape
  (`ink.spec.ts:332-406`). **Niet gepind**: het §68-wiel (0 hits `mouse.wheel`
  in een tijdlijn-spec), ctrl+wiel, `+ − 0`, knijpen, de rechterknop op de as.
- **Stamboom**: fit (`family-trees.spec.ts:81-82`); eerste klik kiest, tweede
  opent, Escape (`:311-318`); sleep pint en blijft, `Opnieuw schikken`
  (`:469-508`, telefoon overgeslagen `:470`); shift-klik, Escape, shift-sleep,
  groepssleep, Ctrl+Z, `Delete` + bevestiging + toast
  (`family-trees-33.spec.ts:622-724`, telefoon overgeslagen `:623`); `.tree-held`
  en andermans kader (`family-tree-coop.spec.ts:211-292`); stage ≥ 62 % op desk
  en telefoon (`canvas-fills-the-screen.spec.ts:148-187`). **Niet gepind**: wiel,
  ctrl+wiel, knijpen, de zoomknoppen op naam, de rechterknop, het `…`-menu
  (0 hits `tree-menu` in `tests/e2e`).
- **Web**: pan (`round-24.spec.ts:22-60`), sleep + speldje (`web.spec.ts:279-316`),
  shift-klik + prikken (`:242-277`), dubbelklik = middelpunt (`:375-447`),
  legenda (`:318-367`), telefoon zonder focus (`:221-240`). **Niet gepind**:
  wiel, knijpen, toetsen, het kader.
- **Makers en bladen**: `Openbaar prikbord` → `/b/` direct (`board-editing.spec.ts:23`,
  `flow-4-board.spec.ts:22`, `board-live.spec.ts:16` en ±12 andere; in een
  dossier `Maak nieuw prikbord voor dit dossier`, `helpers.ts:186-191`); `Nieuwe tijdlijn` → blad → `Openbare tijdlijn`
  (`timelines.spec.ts:34-38`); `Nieuwe stamboom` → `Openbare stamboom`
  (`family-trees.spec.ts:54-60`); `Landkaart ophangen` → `Afbeelding` →
  `Ophangen` (`maps.spec.ts:71-87`); `n` → `Nieuw artikel` → `Aanmaken` →
  `?new=1` (`access-rights.spec.ts:40-51`, `keeper-side.spec.ts:35-45`);
  `Dossier openen` → `Openen` (`flow-3-case-dossier.spec.ts:19-27`); één
  `.sheet-backdrop` tegelijk, Escape sluit `Nieuw artikel` maar niet de
  blokkerende vraag (`characters.spec.ts:320-352`); `getByRole('dialog', {
  name })` overal; Filters `Klaar` (`sort-filter.spec.ts:56-74`); `mention-pop`
  met `role="option"` (`round-25.spec.ts:111-121`). **Niet gepind**: Escape op
  de Filters-popover, Escape in een inline kiezer, focus na sluiten, welke
  aanmaken-rij waar staat.
