# Het bewegingscontract — wanneer het archief beweegt, en hoe

Opgesteld in ronde 65 (§102, *De hand en het antwoord*), op de review
`claude/review-ui-ux-het-gevoel.md` (27 september 2026). Het model is
`docs/canvas-contract.md` en `docs/kamer-contract.md`: dit is een afspraak,
geen stijlgids. Een beweging die ervan afwijkt, staat hier met haar reden, of
ze is een fout.

Bijgewerkt na golf H (28 september 2026, na design-review 3): de hand op elke
link, de Keeperkant-schakelaar, meldingen met een sleutel, `toast-munt`, de
verplaatsbalk, de koper in de winkel, *Ingericht* na de landing, `.schuifrij`
en het menu *Meer soorten*. Golf H bracht **geen nieuwe losse duur en geen
nieuwe uitzondering**: `EXCEPTIONS` in `tests/unit/beweging.test.ts` is
ongewijzigd, en elke nieuwe `@keyframes`-naam komt één keer voor.

Bijgewerkt na golf I (28 september 2026, na design-review 4): de peek op de
telefoon volgt de duim en beweegt alleen op `transform` (§105), met een
rubberen rand als hij niet kan groeien; de `+` van een vlak die meeklimt; het
welkom, de stempel van de voordeur en de regel van een eerste bezoek (§106);
en de soort-editor in Beheer (§107). Golf I bracht **geen nieuwe losse duur**
en haalde **één uitzondering weg**: `.canvas-peek 0.18s` staat niet meer in
`EXCEPTIONS`. Nieuwe `@keyframes`: `vlak-peek-komt`, `vlak-peek-verschijnt`,
`wie-welkom-neer`, `voordeur-stempel-neer`, `eerste-bezoek-in` en `soort-open`.

Bijgewerkt na golf J (29 september 2026, na de meting na golf I): de FAB wijkt
op een telefoon ook voor een caret in een schrijfvak en is daarna echt weg
(`visibility: hidden`, getrapt ná de fade); de `+` van een vlak houdt onder
reduced motion zijn fade; en de onderrand van het palet vervaagt aan de
scrollpositie (`palet-rand`, zonder duur, zoals `.schuifrij`). Golf J bracht
**geen nieuwe losse duur en geen nieuwe uitzondering**.

Vóór deze ronde stonden er twaalf losse duren (70 tot 2000 ms) en vijf
easings in `app/*.css`, zonder één token en zonder afspraak over *wanneer* iets
mocht bewegen. Daarom voelde het ene moment levendig en het volgende dood. Wat
LoW al goed deed, blijft het voorbeeld: de knop die 1 px indrukt als een
stempel, de beurs die inzakt als het getal verandert, het schildje dat een
halve slag draait.

## Hoe je dit leest

- De tokens staan op `:root` in `app/globals.css`, één keer, en zijn in alle
  vier de paletten gelijk. Beweging is geen kleur.
- De tien regels hieronder zijn bindend, zoals de regels in `README.md` dat
  zijn (dit is **§102**). Code die een beweging toevoegt, zet er `§102` bij.
- **Bewaakt** door `tests/unit/beweging.test.ts`. Die leest elk `.css`-bestand
  onder `app/` (ook bestanden die later bijkomen), knipt ze op declaraties, en
  faalt op een losse `ms`/`s` in een `transition` of `animation` die geen token
  is en niet in de uitzonderingslijst staat. Hij faalt ook op een
  `@keyframes`-naam die twee keer voorkomt, over alle bestanden samen. Dat
  laatste is K1 uit de review: `plek-aangewezen` stond twee keer in
  `kamer.css`, en de tweede won stil.

---

## 1. Twee registers

| Register | Waar | Duren | Curves | Karakter |
|---|---|---|---|---|
| **Productief** | het archief: wiki, artikelen, dossiers, bladen, meldingen, zoeken, Beheer, en de schil eromheen | `--dur-1` – `--dur-3` | `--ease-standard`, `--ease-enter`, `--ease-exit` | Beweging legt uit waar iets vandaan komt, en is dan klaar. Geen overschot. |
| **Expressief** | de kamer, de winkel, de uitdeling, de omslag naar de Keeperkant, een eerste keer | `--dur-4` – `--dur-5` | `--ease-expressive`, `--ease-land` | Hier mag het landen, rollen en neerkomen. Overschot ≤ 8 px. |

Dit is de tweedeling van IBM Carbon (*productive* en *expressive*), en ze past
op wat LoW al met stempels doet: het archief is rustig en snel, de kamer is het
spel.

## 2. De tokens

```css
--dur-1: 70ms;   /* indrukken */
--dur-2: 110ms;  /* hover, chip, pijltje, kleine fade */
--dur-3: 150ms;  /* uitgang van blad of melding; de crossfade onder reduced motion */
--dur-4: 240ms;  /* ingang van blad of melding; de chip bij het saldo; de stempel Gekocht */
--dur-5: 400ms;  /* neerzetten, landen, het schildje */

--ease-standard:   cubic-bezier(0.2, 0, 0.38, 0.9);   /* wat van hier naar daar gaat */
--ease-enter:      cubic-bezier(0, 0, 0.38, 0.9);     /* wat binnenkomt */
--ease-exit:       cubic-bezier(0.2, 0, 1, 0.9);      /* wat weggaat */
--ease-expressive: cubic-bezier(0.4, 0.14, 0.3, 1);   /* het expressieve register */
--ease-land:       cubic-bezier(0.34, 1.56, 0.64, 1); /* met overschot: het schildje, neerzetten */
```

Bij het overzetten in ronde 65 ging elke bestaande duur naar het token dat er
hooguit 30 ms van afligt: 70 → `--dur-1`, 90 en 120 → `--dur-2`, 150 en 180 →
`--dur-3`, 220 en 260 → `--dur-4`, 420 → `--dur-5`. Twee bewuste afwijkingen:
`sheet-up` (180 ms) werd `--dur-4`, omdat een blad een ingang is en de uitgang
korter moet zijn (regel 4); en de draaiende pijltjes (120 en 150 ms) werden
allemaal `--dur-2`, zodat elk pijltje in het archief even snel draait.

## 3. De tien regels

1. **Binnen 100 ms een teken**, altijd. Wat daarna op de server wacht, zegt dat
   het wacht (een streep, *Kopen…*, een skelet). Onder 1 s geen spinner.
2. **Een actie met het toetsenbord beweegt niet**: het palet, `/`, `n`, `k`,
   Escape, de pijltjes, Enter of spatie op een knop. Een blad dat je met
   Escape sluit, is meteen weg; met de muis of een vinger krijgt het een
   uitgang.
3. **Alleen `transform` en `opacity`.** Geen hoogte, breedte of `top`. Elke
   beweging is te onderbreken.
4. **De uitgang is korter dan de ingang** (150 tegen 240 ms).
5. **Niets routineus boven 500 ms.** Boven 400 ms alleen in het expressieve
   register.
6. **Het scherm rekent niet** (§79): een getal beweegt alleen tussen twee
   waarden die de server gaf, nooit ervóór.
7. **Vieren is zeldzaam en proportioneel**: een eerste keer, een mijlpaal.
   Nooit bij opslaan, nooit twee keer hetzelfde.
8. **Reduced motion is een crossfade van hooguit 150 ms, of niets.** Feedback
   blijft (een ring, een chip, een skelet, de indruk van een knop). Geen
   parallax, geen zoom-naar-passend met beweging.
9. **Het glas beweegt voor de hand, niet voor het oog** (§34/§69). Een
   tekenvlak krijgt geen overgang bij het laden, de camera springt nooit uit
   zichzelf, en de indruk van regel 1 geldt niet op een vlak.
10. **Geluid is opt-in**, alleen in het expressieve register, en korter dan
    300 ms.

## 4. Waar welk register geldt

| Plek | Register | Wat er beweegt | Waar |
|---|---|---|---|
| Een knop, een chip, een tab, een vakje in de zijbalk, een tegel in de kamer | productief | indrukken: 1 px naar rechtsonder in `--dur-1`, de schaduw loopt mee. Een tab in de tabbalk (golf H, T2): op `:active` meteen `--tab-rood` en 1 px omlaag in `--dur-1`, zonder overgang van de kleur; de blauwe tikflits van Android is uit (`-webkit-tap-highlight-color: transparent` op `html`) | `globals.css`, `.btn` en *§102: de hand*; `navigatie.css` |
| Hover op een knop, chip, regel in een feed of vakje in de zijbalk | productief | alleen kleur, in `--dur-2` met `--ease-standard` | idem |
| Een kaart in een lijst (`a.card`) | productief | 1 px omhoog en een iets diepere schaduw, in `--dur-2`; onder reduced motion alleen de schaduw | `globals.css`, *cards* |
| Het pijltje van een `<details>` | productief | 90° in `--dur-2`; de inhoud opent direct, nooit op hoogte | `globals.css` |
| Een blad (`Sheet`) | productief | in: `sheet-up` in `--dur-4`, `--ease-enter`. Uit, alleen na het kruisje of de achtergrond: 12 px omlaag en weg in `--dur-3`, `--ease-exit` | `Sheet.tsx`, `globals.css` |
| Het palet | productief | niets, in en uit (regel 2) | `CommandPalette.tsx` (`exit={false}`) |
| Een melding | productief | in: 8 px omhoog in `--dur-4`, `--ease-enter`. Uit: `--dur-3`, `--ease-exit`. Sinds golf H: een melding met dezelfde `key` vervangt de vorige **op haar plek**, zonder uitgang en ingang (zelfde doos, klok opnieuw); bij een derde gaat de oudste met haar gewone uitgang (`TOAST_MAX` = 2); een nieuw blad laat de lopende meldingen met hun uitgang gaan | `UiProvider.tsx` (`ToastView`, `nextToasts`), `globals.css` |
| De focusring | productief | niets: een ring van 2 px in `--link`, `outline-offset: 2px`, direct | `globals.css`, `:focus-visible` |
| Opslaan (`SaveStatus`) | productief | de spinner; nooit een viering | `globals.css`, `.save-state-busy` |
| Een tekenvlak (prikbord, landkaart, tijdlijn, stamboom, web) | het glas | alleen wat de hand doet, en de cursors en kaartjes van anderen in het tempo van de stroom | `canvas-contract.md` |
| Het vakje dat je aanklikt (zijbalk, jouw plek, tabbalk) | productief | meteen `data-pending`, een merkje dat in `--dur-2` opkomt (`nav-pending-in`) | `navigatie.css`, `NavPending.tsx` |
| Elke andere interne link die je aanklikt (golf H, D3) | productief | `data-pending` op de link, in dezelfde klik (`NavProgress`, capture-fase), weg zodra de pagina er is. Een kaart blijft 1 px ingedrukt en krijgt een lijn van 2 px `--accent` die in `--dur-1` opkomt (`nav-pending-in`); een knop blijft ingedrukt; een rij, chip, feedregel of naam in de tekst krijgt `--paper-dark`, **zonder beweging**. Een deur in het Jij-blad: de Jij-tab krijgt het merkje. Onder reduced motion staan de lijn en het merkje er zonder op te komen | `navigatie.css` (*de hand op elke link*), `NavProgress.tsx` |
| Een navigatie die na 150 ms niet binnen is | productief | een streep van 2 px die als meter groeit (`calc(var(--dur-5) * 5)`, zie §6). Sinds golf M geen skelet meer: de oude pagina blijft staan tot de nieuwe er is | `navigatie.css`, `NavProgress.tsx` |
| De nieuwe pagina na een navigatie | productief | niets: sinds golf M wisselt de pagina in één keer, zonder fade (`nav-page-in` is weg). Nick zag het skelet en de fade samen als een knippering | `NavProgress.tsx` |
| De voorbeeldkaart bij een naam | productief | in: een fade van `--dur-2` (`kaartje-in`); uit: direct | `kaartje.css`, `EntryPreview.tsx` |
| De achtergrond van een blad | productief | in met het blad (`sheet-shade-in`, `--dur-4`, alleen opacity); uit in `--dur-3` op `--ease-standard`. Onder reduced motion (golf H, T25) staat hij meteen vol en vervaagt alleen het blad; bij sluiten blijft hij tot het blad weg is | `globals.css`, `navigatie.css` |
| De FAB (telefoon) | productief | wijkt bij naar beneden scrollen, sinds golf H (T4) op **elke** pagina met een FAB: uit in `--dur-3`, terug in `--dur-4`; klimt boven een melding. Niet op de kamer, `/you` en zolang *Wie is er?* open is. Sinds golf J (§90) wijkt hij met dezelfde uitgang ook zolang er een caret in een schrijfvak van de pagina staat, en krijgt hij daarna `visibility: hidden` (`visibility 0s linear var(--dur-3)`, dus ná de fade; terug is meteen zichtbaar). Onder reduced motion wijkt hij dan zonder reis | `globals.css`, `useFabAway` in `AppShell` |
| De Keeperkant-schakelaar in de mast (computer, golf H) | productief | het verhoogde plaatje schuift in `--dur-3` op `--ease-standard` naar de andere helft, terwijl het document al onderweg is; de helften wisselen van kleur in `--dur-2`. Onder reduced motion schuift er niets | `navigatie.css`, `SideToggle.tsx` (`variant="mast"`) |
| Een rij die opzij scrolt (`.schuifrij`, golf H) | de hand | de rand vervaagt aan de kant waar meer staat, via een scroll-gestuurde animatie (`schuifrij-rand`, `animation-timeline: scroll(self inline)`): geen duur, hij volgt de duim. Het gekozen item komt in beeld zonder animatie (`useSchuifrij`) | `globals.css`, `useSchuifrij.ts` |
| Het menu *Meer soorten* (golf H) | productief | in: 4 px en opacity in `--dur-3`, `--ease-enter` (`meer-soorten-komt`); uit: direct | `leeskamer.css`, `MeerSoorten.tsx` |
| *Uit het archief*, *Nog één*, de lichtbak | productief | een fade (`leeskamer-komt`, `--dur-2`; de lichtbak `--dur-4`) | `leeskamer.css` |
| Het saldo (zijbalk, Jij-tab, `Beurs`) | expressief | het getal rolt in ~500 ms (`--dur-5` × 1,25, in `SaldoGetal`) tussen twee waarden van de server; een chip met het verschil komt op in `--dur-4` op `--ease-land` en staat 1,5 s. `beurs-tel` staat uit (`.beurs-body { animation: none }`). Sinds golf H (T8) rolt het getal zodra de knop het antwoord heeft (`announceBalance`), in hetzelfde moment als de melding, en niet pas met de verversing; nog steeds van de ene serverwaarde naar de andere. In een beurs staat de chip binnen de pil (D11), en het woord *munten* wijkt zolang in `--dur-2` (alleen opacity) | `moment.css`, `SaldoGetal.tsx`, `saldo.ts` |
| Een ding dat op een tegel landt | expressief | het beeld komt 12 px van boven met schaal 0,96 en landt in `--dur-5` op `--ease-land` (`kamer-neerzet`); de tegel draagt 1,4 s een ring, als timer met overgangen van `--dur-2`/`--dur-3` | `kamer.css`, `Neerzetten.tsx`, `moment.ts` |
| *Kopen* in de winkel | expressief | *Gekocht* komt als stempel neer (`kamer-koop-stempel`, 240 ms) en blijft tot hij geland is, plus `--dur-5` | `kamer.css`, `BuyButton.tsx` |
| De uitdeling (Keeper) | expressief | *+5* komt op naast elke aangevinkte rij (`uitdelen-chip-op`), gespreid met 40 ms, hooguit tien rijen. Sinds golf H (T14) rolt na *Uitdelen* het saldo van elke rij naar de balans uit het antwoord (`SaldoGetal chip={false}`: de rij heeft haar eigen chip) | `kamer.css`, `Uitdeler.tsx` |
| Munten van de Keeper (`toast-munt`, golf H, D10) | expressief | de stempel *+20* komt schuin neer, van 1,5 naar 1, in `--dur-5` op `--ease-land` (`toast-munt-land`), en opnieuw als er een tweede gift bij komt en de melding optelt; de melding zelf komt en gaat als elke melding. Onder reduced motion ligt de stempel er | `moment.css`, `UiProvider.tsx` (`ToastMuntBody`) |
| De verplaatsbalk in de kamer (golf H, D8b) | expressief | *Kies een plek voor…* zweeft onderaan het venster en komt in `--dur-4` op `--ease-enter` op (8 px en opacity, `kamer-balk-in`); het raster staat stil. Onder reduced motion staat hij er meteen | `kamer.css`, `Verplaatsen.tsx` |
| De koper in de winkel (`KoperKop`, golf H, T17) | expressief | de pil *Kopen voor …* komt in `--dur-4` op `--ease-enter` (6 px en opacity) zodra de kiezer uit beeld is, en gaat in `--dur-3` op `--ease-exit`. Hoogte 0 in de flow: er verschuift niets. Onder reduced motion alleen de opacity | `kamer.css`, `KoperKop.tsx` |
| De vouw van de dichte plekken (telefoon, golf H) | productief | het pijltje draait in `--dur-2`, zoals dat van een `<details>`; de tegels erachter komen direct | `kamer.css`, `DichtePlekken.tsx` |
| De landing na *Bekijk* | aanwijzing | een ring van 2 px in `--stamp-red`, 1,4 s | `kamer.css`, `plek-aangewezen` |
| De omslag naar de Keeperkant | expressief | het schildje (`side-toggle-turn`, `--dur-5`, `--ease-land`; sinds golf H alleen de hoekknop op een telefoon) en de cirkel (`side-flip-wipe`, `--dur-5` + `--dur-3` = 550 ms, `--ease-enter`). Op een computer groeit de cirkel uit het midden van de helft van de schakelaar waar je heen gaat, op een telefoon uit het midden van de knop | `globals.css`, `kaartje.css` (`@view-transition`) |
| De peek (telefoon, golf I, §105) | productief | in: van achter de tabbalk in `--dur-4` op `--ease-enter` (`vlak-peek-komt`), niet als hij binnen 250 ms een andere vervangt. De greep volgt de duim zonder overgang (`data-move="none"`); na het loslaten naar zijn plek of zijn nieuwe maat in `--dur-4` op `--ease-enter` (een FLIP, alleen `transform`). Uit, na het kruisje met een vinger of een veeg omlaag vanuit klein: achter de tabbalk in `--dur-3` op `--ease-exit`. Escape en het toetsenbord: meteen (regel 2). **De rubberen rand**: een peek die niet kan groeien (`data-groeit="nee"`) gaat bij een tik op de greep in één frame 10 px omhoog en veert terug in `--dur-4` op `--ease-enter`; slepen voorbij de ruimte rekt een vijfde mee, hooguit 24 px (`peekDragOffset`). Niets bij een toets of onder reduced motion. Onder reduced motion komt de peek met een fade van `--dur-3` (`vlak-peek-verschijnt`), en verder beweegt er niets | `vlakken.css`, `CanvasPeek.tsx`, `lib/canvas/peek.ts` |
| De `+` van een vlak en *Ongedaan maken* (telefoon, golf I) | productief | klimmen als de FAB boven een melding en boven de peek (`--dock-lift`), in `--dur-4` op `--ease-enter`; wijken (opacity) in `--dur-3` als de peek hoog is (`data-peek-hoog`). Onder reduced motion: alleen de fade van `--dur-3`, zonder klim (sinds golf J; zie §8) | `vlakken.css` |
| Het welkom na *Dit ben ik* (golf I, §106) | expressief | de stempel *Ingeschreven* komt één keer neer, schuin, van 1,5 naar 1, in `--dur-5` op `--ease-land` (`wie-welkom-neer`). Het welkom zelf schuift niets opzij: zolang het staat, staat *Jouw plek* er niet. Onder reduced motion ligt de stempel er | `eerste-keer.css`, `WieBenJij.tsx` |
| De stempel *Toegang* op de voordeur (golf I) | expressief | ligt stil bij het laden (regel 7 en 9); komt alleen neer terwijl een inschrijving naar het archief gaat (`form[aria-busy='true']`), van 1,4 naar 1 in `--dur-4` op `--ease-land` (`voordeur-stempel-neer`). Onder reduced motion ligt hij er | `eerste-keer.css`, `Voordeur.tsx` |
| De regel van een eerste bezoek (golf I) | productief | een fade van `--dur-3` op `--ease-enter` (`eerste-bezoek-in`), alleen opacity; staat al in de eerste lading, dus er schuift niets. Onder reduced motion staat hij er | `eerste-keer.css`, `EersteBezoek.tsx` |
| De soort-editor in Beheer (golf I, §107) | productief | *Pictogram en kleur* klapt open met 4 px en opacity in `--dur-4` op `--ease-enter` (`soort-open`); de instellingen van een veld en de kiezer van doel-soorten in `--dur-3`. De chevron van een soortrij draait in `--dur-2`, zoals een `<details>`. Onder reduced motion niets | `beheer.css`, `TypeEditor.tsx` |
| Een eerste keer | expressief | *Ingericht* komt ná de landing (golf H, T21): eerst `--dur-5` wachten, dan schuin neerkomen in `--dur-4` × 1,25 (`kamer-ingericht-hoek`, samen 700 ms), op de rechterrand van het beeld en niet over het ding; ligt 2,5 s en vervaagt in `--dur-3`. Een plek die opengaat, draait zijn slotje open (`kamer-slot-open`) | `kamer.css`, `Neerzetten.tsx` |

**Herstel na de review (ronde 65·herstel, de schil).**

- **Paginanavigatie.** Een navigatie begint bij opacity 0,6, niet bij 0
  (`nav-page-in` en `nav-page-fade` in `app/navigatie.css`; sinds golf M
  allebei weg, zie de tabel). Een leeg frame
  tussen twee pagina's is geen overgang maar een flits.
- **Achtergrond van een blad.** De achtergrond komt met het blad mee
  (`sheet-shade-in`, `--dur-4`, alleen opacity). Hij gaat weg op
  `--ease-standard` en niet op de uitgangscurve: die eindigt op volle
  snelheid, dus met een tik. Het palet heeft geen achtergrond-animatie
  (`.palette-backdrop { animation: none }`, regel 2).
- **De FAB.** Op een telefoon wijkt de FAB op een leespagina (`/e/…` in
  Lezen, `/c/…`, `/wiki…`; sinds golf H op elke pagina) zolang de duim naar beneden scrolt: uit in
  `--dur-3`, terug in `--dur-4`, met een drempel van 8 px en één rAF per frame
  (`useFabAway` in `AppShell`). Weg betekent ook geen tabstop (`tabIndex=-1`,
  `aria-hidden`). Zolang er een melding staat, klimt de FAB boven de stapel
  (`--toast-stack`, gemeten in `UiProvider`).
- **Melding en plakkende voet.** Een melding ligt nooit op een plakkende voet
  van §85. Een pagina met zo'n voet zet `--voet-h`, en `.toast-wrap` komt
  zoveel hoger te staan.
- ***Verbinden…*** staat pas in de strip na `CONNECTING_WORD_AFTER_MS` (1,5 s)
  zonder lijn. Daarvóór is de stip neutraal en zonder woord, want elke volle
  lading begint op `connecting`.

## 5. Een blad en een melding: de uitgang

Een blad sluit op vier manieren, en maar twee bewegen:

| Hoe | Beweegt | Waarom |
|---|---|---|
| Het kruisje, met de muis of een vinger | ja, 150 ms | een hand die iets wegzet, ziet het weggaan |
| Een tik op de achtergrond | ja, 150 ms | idem |
| Escape, of Enter/spatie op het kruisje | nee | regel 2 |
| De ouder haalt het weg (verzenden, *Ja*, *Nee*) | nee | er is een antwoord, en een antwoord wacht niet op een tekening |

Bij een sluiting die beweegt, gebeurt alles wat je kúnt voelen **op het eerste
moment**: het blad gaat van de stapel (`closeSheet`, dus het is niet meer
`isTopSheet`), het scroll-slot gaat los, de focus gaat terug, en het blad
krijgt `data-closing`, `inert` en `pointer-events: none`, zodat een klik dwars
door het plaatje heen naar de pagina eronder gaat. Daarna speelt de uitgang.
Na `animationend` volgt de echte `onClose`, met een vangnet van 250 ms
(`SHEET_EXIT_NET_MS`). Een Escape tijdens die 150 ms rondt het meteen af. De
bevestigingsvraag geeft haar antwoord in `onLeave`, dus ook op het eerste
moment: een `confirm()`-belofte antwoordt nooit later. §14 blijft staan: de
toetsenhandler bindt één keer, voor het hele leven van het blad, ook tijdens
het sluiten.

Een melding staat 6 s, en 10 s als er een knop in zit (*Bekijk*, *Ongedaan
maken*). De klok wacht zolang de muis of de focus op de melding staat, en loopt
daarna verder met de resttijd. **Een melding met een eigen `ms` wacht niet**:
dat is de koopmelding, en haar duur is het venster van de server voor
*Ongedaan maken* (§93). Een melding die langer bleef staan, zou een knop
aanbieden die de server weigert. `aria-live` staat op de wrapper en nergens
anders, want twee lagen lezen het twee keer voor.

## 6. De uitzonderingen

Deze duren zijn geen token, met opzet. De lijst staat ook in
`tests/unit/beweging.test.ts` (`EXCEPTIONS`), en die twee horen gelijk te
blijven. Een nieuwe uitzondering is een beslissing, geen reparatie.

| Waar | Duur | Reden |
|---|---|---|
| `globals.css` `.save-state-busy` (`save-state-turn`) | 900 ms | Een spinner draait rond, hij reist niet. Een omwenteling is een tempo, geen duur. |
| ~~`globals.css` `::view-transition-new(root)` (`side-flip-wipe`)~~ | ~~550 ms~~ | ~~**Dode regel.** De omslag-cirkel staat sinds ronde 65·c in `kaartje.css` en is geschreven als `calc(var(--dur-5) + var(--dur-3))`, dus hij heeft geen uitzondering meer nodig.~~ **Weg na golf M:** de regel is uit `EXCEPTIONS`. |
| ~~`globals.css` `.canvas-peek`~~ | ~~0,18 s~~ | ~~**Schuld.** De peek op de telefoon beweegt op `max-height`, tegen regel 3 in. Herbouwen hoort niet bij ronde 65.~~ **Weg in golf I (§105):** de peek beweegt alleen op `transform`, in tokens (zie §4), en de regel is uit `EXCEPTIONS`. |
| ~~`globals.css` `.board-cursor`, `.board-card-carried`, `.map-pin-carried`, `.map-cursor`~~ | ~~70 ms~~ | ~~Het glas: wat een ander vasthoudt, loopt mee met de stroom van de server, niet met een register.~~ **Weg sinds golf M (§108):** wat een ander draagt en zijn pijltje glijden met `useFollow` (een `translate`, per animatieframe), zonder CSS-overgang; de regels zijn na golf M ook uit `EXCEPTIONS`. |
| `globals.css` `.live-cursor` | 120 ms | Het glas: de cursor van een ander in een gedeeld vak. |
| `stambomen.css` `.tree-node` | 220 ms | Het glas: de stamboom die herschikt na een wijziging. Een tween op het vlak (§69). |
| ~~`stambomen.css` `.tree-node.is-carried`, `timelines.css` `.timeline-event-carried`~~ | ~~70 ms~~ | ~~Het glas: in de hand van een ander.~~ **Weg sinds golf M (§108)**, om dezelfde reden: `.tree-node.is-carried` heeft `transition: none`, en de gebeurtenis glijdt met `useFollow`. |
| `kamer.css` `.plek:target` (`plek-aangewezen`) | 1,4 s | K1: de landingsring na *Bekijk* is een aanwijzing, geen reis. Hij moet lang genoeg staan om je oog te vinden. Onder reduced motion staat dezelfde ring stil en verdwijnt hij na 1,4 s in één keer (`steps(1)`). |

**Boven 500 ms zonder letterlijke waarde.** De test vangt alleen een losse
duur. Deze vier gaan met opzet boven de routinegrens, en zijn uit tokens
opgebouwd, zodat ze niet in `EXCEPTIONS` hoeven:

| Waar | Duur | Reden |
|---|---|---|
| `navigatie.css` `.nav-progress[data-shown='1'] .nav-progress-bar` | `calc(var(--dur-5) * 5)` = 2 s | Een meter, geen reis: de streep groeit naar 80 % zolang de pagina onderweg is, en schiet bij klaar naar 100 %. |
| `kaartje.css` `::view-transition-new(root)` (`side-flip-wipe`) | `calc(var(--dur-5) + var(--dur-3))` = 550 ms | De omslag-cirkel: het ene expressieve moment dat de hele pagina omslaat. Omslaan is geen routine. |
| ~~`kamer.css` `.plek-ingericht` (`kamer-ingericht`)~~ | ~~`calc(var(--dur-5) * 1.5)` = 600 ms~~ | ~~*Ingericht*, één keer per kamer. Onder de 700 ms die de review voor de kamer als plafond gaf.~~ Sinds golf H overschreven door de regel hieronder; de oude keyframes spelen niet meer (§8). |
| `kamer.css` `.plek-ingericht` (`kamer-ingericht-hoek`, golf H) | `--dur-5` wachten + `calc(var(--dur-4) * 1.25)` = 700 ms | *Ingericht*, één keer per kamer (de eerste netto koop), en pas ná de landing, zodat je eerst het ding ziet en dan de viering. Precies op het plafond van 700 ms dat de review voor de kamer gaf. |
| `SaldoGetal.tsx` | `--dur-5` × 1,25 ≈ 500 ms | Een getal dat telt, in JavaScript, gerekt zodat de tussenwaarden leesbaar zijn. |

## 7. Reduced motion

`prefers-reduced-motion: reduce` zet in `globals.css` elke `transition` uit
(`* { transition: none !important }`, onder *sheet*). Een `animation` die
verplaatst of schaalt, krijgt een eigen tak: een crossfade van `--dur-3`
(`sheet-fade-in`/`-out`, `toast-fade-in`/`-out`) of niets. Wat feedback is,
blijft: de indruk van een knop staat er nog (zonder overgang), de ring in de
kamer staat er nog (zonder vervagen).

Sinds golf H (T25): onder reduced motion staat de **achtergrond** van een blad
meteen vol, en vervaagt alleen het blad zelf. Kwamen ze samen in, dan liepen
de tekst van het blad en die van de pagina 150 ms dwars door elkaar. Bij het
sluiten blijft de achtergrond vol tot het blad weg is (`Sheet` ruimt alles op
bij de `animationend` van het blad). Het teken van de hand op een link, de
stempel van `toast-munt`, de verplaatsbalk en het plaatje van de
Keeperkant-schakelaar staan er onder reduced motion zonder te bewegen; de pil
van de koper komt alleen in opacity.

Sinds golf I: de peek komt onder reduced motion met een fade van `--dur-3` en
verandert daarna van maat zonder reis; de rubberen rand is er dan niet. De
`+` van een vlak klimt zonder overgang en wijkt ~~zonder overgang~~ sinds
golf J met een fade van `--dur-3`. De stempels *Ingeschreven* en
*Toegang*, de regel van een eerste bezoek en de onderdelen van de
soort-editor staan er zonder te bewegen.

## 8. Wat open staat

- ~~`EXCEPTIONS` in `tests/unit/beweging.test.ts` heeft de dode regel voor
  `globals.css` `::view-transition-new(root)` (zie §6).~~ Weg na golf M,
  met de vijf regels van het glas van 70 ms.
- De test meet losse duren, geen curves en geen `calc`. `.plek:target` loopt
  nog op een letterlijke `ease-out`, en regel 5 (niets routineus boven
  500 ms) wordt alleen door lezen bewaakt.

- ~~De peek op de telefoon (`.canvas-peek`) beweegt op `max-height`. Dat moet
  een `transform` worden. Het staat als schuld in de uitzonderingen.~~
  **Gesloten in golf I (§105).**
- ~~**Golf I:** `vlakken.css` geeft `.canvas-make` en `.canvas-undo` onder
  reduced motion een opacity-overgang van `--dur-3`, maar de algemene
  `* { transition: none !important }` in `globals.css` (§7) wint. Onder reduced
  motion klimt en wijkt de `+` van een vlak dus zonder overgang; dat mag
  (regel 8: een crossfade of niets), maar de regel in `vlakken.css` doet niets.~~
  **Gesloten in golf J (§105):** de regel draagt `!important`; de fade blijft,
  de klim niet.
- `summary::marker` van een `<details>` zonder eigen pijltje (de legenda van
  het web) draait niet: een ingebouwd driehoekje kun je niet draaien. Dat mag
  zo blijven tot iemand er een eigen pijltje aan geeft.
- **Golf H:** `meer-soorten-komt` (het menu *Meer soorten*) heeft geen tak
  voor reduced motion: het schuift ook dan 4 px, tegen regel 8. Eén
  `@media (prefers-reduced-motion: reduce) { .meer-soorten-lijst { animation:
  none } }` in `leeskamer.css` sluit het.
- **Golf H:** `kamer-ingericht` in `kamer.css` is dode code. `.plek-ingericht`
  krijgt verderop in hetzelfde bestand `kamer-ingericht-hoek`, dat wint; de
  oude keyframes kunnen weg. De test ziet het niet, want hij telt namen die
  twee keer voorkomen, niet namen die niemand meer gebruikt.
- **Golf H:** `.schuifrij` gebruikt een scroll-gestuurde animatie zonder duur.
  De test ziet geen losse tijd en laat hem terecht staan. Wat een browser
  zonder `animation-timeline` (Firefox 144) ervan maakt, is niet nagemeten:
  met duur 0 en `both` kan hij de eindstand van de keyframes laten staan, een
  vervaagde linkerrand en geen rechter. De rij scrolt daar in elk geval.
