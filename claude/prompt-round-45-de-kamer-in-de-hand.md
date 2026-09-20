# Prompt — ronde 45: de kamer in de hand

*Een UX-ronde over de kamer, de winkel, de spelerspagina, de hal en de uitdeler. Geen nieuwe functies, geen migratie. Alles wat er is, zó dat een speler het zonder uitleg vindt, begrijpt en met plezier gebruikt — op een telefoon net zo goed als op een groot scherm.*

**Claims §84.** Repository `D:\LoWWebsite` → github.com/NnickozZ/LoWWebsite (`main`).
Gebouwd bovenop ronde 44 (§83). **Model: Opus 5, high.** Eén ronde, maar een lange; lees eerst alles.

---

## Read first, before writing anything

`CLAUDE.md` (§1, §3, §5, §6 en het kopje *§83: de lezer die achterblijft*), dan **`README.md` rules 76–83** — 78 is de grens (het archief rekent niets uit), 79 de kamer, 80 huisraad, 81 de handtekening en de hal, 82 de winkel, 83 het open grootboek en de uitdeling. Dan `claude/round-40-de-kamer.md` t/m `claude/round-44-de-uitdeling.md` (vooral elke sectie *"Wat er onderweg gevonden is"*), en `claude/plan-ui-ux-eenheid.md` + `docs/canvas-contract.md` voor hoe dit project een UI-ronde aanpakt: **een contract per scherm, en één regel per verschil dat mag blijven.**

Dan de code, elke docblock: `app/(app)/kamer/[slug]/page.tsx`, `app/(app)/winkel/page.tsx`, `app/(app)/spelers/page.tsx`, `app/(app)/spelers/[naam]/page.tsx`, `app/(app)/you/page.tsx`, `app/(app)/uitdelen/page.tsx`, `components/kamer/**`, `components/winkel/**`, `components/spelers/**`, `lib/spelers/panels.tsx`, `components/live/LiveStrip.tsx` + `RosterPopover.tsx`, `components/AppShell.tsx` (de `NAV`, de tabbalk, de FAB), `app/kamer.css`, `app/spelers.css`, `app/globals.css` (tokens, `.btn`, `.stamp`, `.chip`, `.card`, `.sheet`, `.toast`, het §45-blok), `lib/theme/schemes.ts`, `components/Icon.tsx`, `lib/kamers/service.ts` (`RoomView`, `Shop`, `ShopItem`, `roomSummary`, `roomsOf`), `lib/words.ts` (groep *De kamer* + de spelers/aanwezig-woorden).

---

## Wat Nick vroeg

> *"Make the UX of this shop and player page immaculate. Where the buttons should be, how to visually style it, and how to make it as smooth to work with as possible for the players."*

Drie Opus-agents hebben vooraf onderzoek gedaan: een routekaart, een audit van de visuele taal, en een echte doorloop met screenshots (desktop 1440, telefoon 390, licht en donker). Wat zij vonden staat hieronder samengevat; **de screenshots staan in `claude/shots-round-44-ux/`** (als die map ontbreekt: maak ze zelf opnieuw op dezelfde manier vóór je begint — je moet zien wat je verandert).

---

## Wat er gevonden is — de korte versie

Lees dit als de klachtenlijst van een speler die het een avond geprobeerd heeft.

**Je vindt het niet.**
- De hele feature hangt aan één navigatie-item: *Jij*. `/kamer`, `/winkel`, `/spelers` staan in geen enkel menu, op geen enkel scherm. Eigen kamer: **3 klikken** vanaf Start; de kamer van een ander: **4**.
- `/you` noemt de winkel en de hal, maar **nooit de kamer en nooit het saldo**. Het artikel van je eigen onderzoeker (`/e/<slug>`) wordt vanuit de kamer, het paneel, de winkel en de effectenlijst aangewezen en wijst naar **niets** terug.
- De deur naar de kamer op de spelerspagina (`KamerPanel`) is een regel tekst zonder onderstreping, kleur of pijl. Hij ziet er niet uit als een deur.
- `/uitdelen` heeft **nul** uitgaande links. De hal heeft **één** ingaande.

**Geld heeft geen stem.**
- Je saldo ("6 MUNTEN") en een prijs ("2 MUNTEN") zijn **hetzelfde component**: dezelfde rode gedraaide stempel. *Wat je hebt* en *wat iets kost* zijn niet te onderscheiden.
- Beide uitgaven — kopen en een plek openen — zijn **één stille klik**: geen bevestiging, geen toast, geen "waar is het heen". De enige feedback is één cijfer dat verandert in een stempel die eruitziet als een prijskaartje. De koop landt in 174 ms; niemand ziet het.
- "Je hebt nog 3 munten nodig." — de meest motiverende zin van de winkel — bestaat **alleen als `title`-tooltip** op een uitgeschakelde knop. Op een telefoon onbereikbaar.
- In de winkel na een koop: dezelfde "Prent" staat onder *muur* met "Geen vrije plek" (als blauwe link, over twee regels) en onder *bureau* met een live rode Kopen-knop en "Staat al in je kamer". Twee rijen, één ding, tegengestelde boodschappen.

**Het raster vertelt het verkeerde verhaal.**
- 9 van de 12 tegels zijn op dag één "Op slot": een muur grijze dozen met rode prijzen, en de drie dingen die je wél kunt doen staan linksboven en zijn visueel het zwakst. Betaalbaar vs onbetaalbaar "Openen" verschilt **alleen in opacity**.
- Een lege tegel reserveert ~120 px niets boven de knop. Een gevulde tegel zonder foto wordt **twee keer zo hoog** door een lege coverplaceholder, en de hele rij rekt mee — het raster breekt bij de eerste koop.
- "Wat deze kamer je geeft" — de hele beloning van de feature — staat als stil citaatblok onder twaalf tegels; op een telefoon ~1400 px onder de vouw.
- Grootboek: `+6` is rood, `-2` is grijs. "Plek: plank" leest als een sleutel/waarde-paar naast mensenzinnen.

**De telefoon wordt verslagen door zijn eigen meubels.**
- De rode FAB staat **bovenop** een Openen-knop in de kamer, een Kopen-knop in de winkel, de "Dyslexie"-chip op `/you`, en een regel in de aanwezigheidspopover. De tabbalk dekt de onderste rij.
- `/uitdelen` op een telefoon: ~1540 px hoog, de Uitdelen-knop **twee schermen onder de vouw**, geen sticky voet, geen lopend totaal.
- Elke `btn-small` is 34 px, elke `chip-selectable` 38 px — geen enkele knop in scope haalt de 44 px die de rest van de site sinds §69 aanhoudt. Het breekpunt is `560px` waar de hele site (en `useIsPhone`) `767px` gebruikt.

**Donker.**
- Uitgeschakelde en ingeschakelde rode Kopen-knoppen zijn in donker bijna dezelfde kleur. Op slot / leeg / gevuld verschillen alleen nog in gestreept-of-niet, want `--shadow` is in elk palet dezelfde donkere inkt. De prijsstempels op donkere tegels halen het contrast niet.

**Klein maar overal.**
- `box` is het icoon van een *kist*, van de *winkel*, van de tab *wat je al hebt* én de fallback-cover van huisraad. `book` is een *plank* én de tab *Catalogus*. `plus` is neerzetten, uitgeven, uitdelen en de uitdeelknop. "Uitdelen" heeft twee verschillende iconen op twee deuren.
- Drie werkwoorden voor één handeling: de knop in de grootboekkop zegt *Uitdelen*, het formulier eronder *Uitgeven* (= geld uitgeven, het tegendeel), de pagina *Munten uitdelen*.
- De eyebrow boven `/kamer`, `/winkel` én `/uitdelen` is alle drie **"KAMER"**.
- Drie letterlijke kopieën van `Je hebt nog {n} munten nodig.`; "Jouw account", "Recente bijdragen", "Niet online.", "Wat je al hebt", "Zoeken…", "Even kijken…", "Nog geen regels.", "Nog geen kamer." staan buiten `lib/words.ts` (§11).
- Dode klassen (`.winkel-lijst`, `.winkel-buy`, `.spelers-index`, `.spelers-rij`, `.speler-nu`), `.spelers-kop` gedefinieerd in `kamer.css` terwijl `/spelers` dat bestand niet importeert, `.plek-cover` en `.speler-face-cover` byte-gelijk gedupliceerd, `44px` twee keer letterlijk waar `--tap` bestaat, inline `style={}` voor typografie in acht bestanden.
- Native blauwe checkboxes op `/uitdelen`: twaalf verzadigde vierkantjes in een archief van crème en roest.
- De Keeper staat in de kamer van een speler met **de knoppen van die speler** en diens saldo, zonder enige aanduiding dat hij meekijkt.
- Op `/spelers` is je eigen rij niet gemarkeerd; de enige rode rand is *iemand anders* (die toevallig online is). De aanwezigheidspopover zegt "Je bent hier alleen." en noemt je daaronder als eerste.

---

## De beslissingen. Niet heropenen.

Dit zijn ontwerpkeuzes, geen suggesties. Elk ervan sluit een gevonden probleem. Waar een keuze een regel uit de README raakt staat dat erbij; **geen enkele keuze raakt rule 78** (het archief rekent nooit een bonus uit) of §76 (een versluierd ding noemt zijn naam nergens).

| | Beslissing |
|---|---|
| **1. De beurs staat overal** | Een klein **beursblok** in de shell — "6 munten" — op elke pagina, zichtbaar voor wie een onderzoeker draagt. Eén tik → je eigen kamer. Absent (niet verborgen) voor de Keeper en voor wie niemand draagt. Dit is de nieuwe voordeur van de feature: één klik vanaf overal. |
| **2. Saldo en prijs zien er anders uit** | De `.stamp` blijft van de **prijs** (gedraaid, rood, omlijnd — een prijskaartje). Het **saldo** krijgt een eigen component `Beurs`: rechtop, groot cijfer in `--ink` op `--paper-raised`, klein woord *munten* eronder, een `coin`-icoon ervoor. Nooit rood. Overal hetzelfde: shell, kamer, winkel, plek-kiezer, spelerspagina, uitdeler. |
| **3. Elke uitgave spreekt** | Geen bevestigingsdialoog (frictie), wél: **de knop zegt de prijs** ("Openen · 2 munten", "Kopen · 5 munten") zodat de uitgave expliciet is op het moment van klikken, en **een toast na afloop** die zegt wat er gebeurd is en waar het heen is: *"Prent demo staat op je muur. −2 munten."* met actie **Bekijk** (→ de kamer, gescrold naar die plek). Het beursblok telt zichtbaar af en licht even op. |
| **4. Geen tooltip-tekst meer** | "Je hebt nog 3 munten nodig." wordt **zichtbare tekst** onder de prijs, in de kamer én in de winkel én in de plek-kiezer. Eén woordsleutel, nul letterlijke kopieën. |
| **5. Eén rij per ding in de winkel** | Groeperen per soort plek verdwijnt. **Eén lijst, goedkoopste eerst**, met een filterrij (Alles · Muur · Plank · Bureau · Kist) die filtert in plaats van dupliceert. Een ding dat op twee soorten plek past toont twee plek-chips en **één Kopen-knop**; hij landt in de eerste vrije plek in de volgorde van `PLEK_KINDS` (`landsIn` heeft die per soort al). "Staat al in je kamer" wordt een telling ("1× in je kamer") en houdt niets tegen tenzij het uniek is. |
| **6. Het raster ademt** | Eén raster blijft (de ladder, `sort_order` is heilig), maar tegels krijgen **een vaste hoogte per staat**: een gevulde tegel toont een **vierkante** uitsnede (`shape="square"`, nooit hoger dan breed), een lege tegel toont het plek-icoon groot en gedempt in plaats van niets, een gesloten tegel is **compact** — kop, prijs, "Openen · n" — zonder loze ruimte. Het raster breekt niet meer bij de eerste koop. |
| **7. De beloning staat boven** | *Wat deze kamer je geeft* verhuist naar **direct onder de kop**, vóór het raster, als een rustig lijstblok — boven de vouw op een telefoon. Staat er niets, dan staat er één zin die zegt waar het vandaan gaat komen (de winkel), met een deur. Het grootboek blijft onderaan, **ingeklapt** tot de laatste drie regels met "Alles tonen". |
| **8. Weghalen is geen gelijke van Neerzetten** | "Weghalen" wordt een klein **×** rechtsboven in de gevulde tegel (`btn-ghost`, 44 px raakvlak, `aria-label`), niet een knop op dezelfde plek en met hetzelfde gewicht als Neerzetten/Openen. |
| **9. De telefoon krijgt zijn ruimte terug** | Elke pagina in scope krijgt onderaan `padding-bottom: calc(var(--tabs-h) + FAB-vrije ruimte)`. De FAB **wijkt** op pagina's met een primaire actie onderaan (`/uitdelen`, de plek-kiezer open): hij is niet zichtbaar terwijl een sheet open is, en `/uitdelen` krijgt een **sticky voet** met totaal + knop die de FAB vervangt. Alle knoppen in scope halen **44 px** op een telefoon (`--tap`). Breekpunt wordt **767px**. |
| **10. De uitdeler leest van links naar rechts** | Vinkje · naam (speler) · **saldo direct naast het bedrag**, zebra-strepen, `accent-color: var(--stamp-red)` op de checkboxes. Het globale vak heet *"Voor iedereen"* met placeholder leeg (geen "3" dat op een waarde lijkt) en één zin ernaast die zegt wat het doet. **Lopend totaal** in de sticky voet: *"36 munten naar 12 kamers"*. Na uitdelen: toast + de knop verandert een tel in "Uitgedeeld ✓" + een deur *Naar de spelers*. |
| **11. Eén werkwoord** | Overal **"Geven"** voor wat de Keeper doet (het formulier, de knop, de regel in het grootboek), **"Uitdelen"** voor de hele tafel tegelijk. *Uitgeven* verdwijnt. |
| **12. De spelerspagina wijst naar de kamer** | Volgorde van de panelen voor een speler: **Kamer, Karakters, Aanwezig, Dossiers, Bijdragen**. Het Kamer-paneel is één grote deur: beursblok + "3 van 12 plekken open · 1 gevuld" + pijl, het hele paneel klikbaar. Elke `PanelDoor` krijgt een pijl en een werkwoord (*Naar de kamer →*). De Bijdragen-deur gaat niet meer naar `/`; hij verdwijnt als er geen eigen pagina is (§77: geen deur naar een plek die niet van het onderwerp is). |
| **13. Het onderzoekersartikel wijst terug** | Op `/e/<slug>` van een gedragen onderzoeker: één regel onder de kop — beursblok + *Naar de kamer →* — voor wie de kamer mag zien. |
| **14. Eyebrows zeggen waar je bent** | `/kamer`: eyebrow = de naam van de speler die hem draagt ("Speler Demo"), h1 = *Kamer van Demo Onderzoeker* (heel, één link-stijl). `/winkel`: eyebrow = *Voor Demo Onderzoeker* (of de kiezer). `/uitdelen`: eyebrow = *Keeper*. |
| **15. De Keeper weet dat hij meekijkt** | In de kamer van een speler krijgt de Keeper een banner *"Je kijkt mee in de kamer van X. Wat je hier neerzet is een cadeau en kost niets."* De knoppen blijven (hij mag dat), maar de tegelknoppen zeggen bij hem *Neerzetten (cadeau)* en er staat geen *Openen · n* (hij opent met een grootboekregel, niet met haar saldo — of hij opent gratis; **kies één en schrijf op waarom**). |
| **16. De hal kent jou** | `/spelers`: je eigen rij **bovenaan**, gemarkeerd *(jij)*; de rode rand betekent alleen nog *online* en krijgt een woord erbij. Kolomkoppen boven de lijst (Speler · Draagt). |
| **17. Iconen betekenen één ding** | Nieuw in `Icon.tsx`: **`coin`** (munten), **`shop`** (de winkel), **`gift`** (geven/uitdelen), **`shelf`** (plank) en **`desk`** (bureau). `box` blijft alleen de kist, `book` blijft de catalogus, `pin` blijft de muur. Kopen krijgt `coin`. Eén icoon per betekenis, geen uitzonderingen — leg het vast in een tabel in `plekWords.ts`. |
| **18. Donker werkt** | Een uitgeschakelde `btn-primary` wordt **omlijnd i.p.v. gevuld** (`--rule` rand, `--ink-muted` tekst) in elk palet; dat lost licht én donker op. De filled-tegel krijgt in donker een lichtere `--paper-raised` rand; `--shadow` blijft (token van de site), maar staat mag er nooit alleen van afhangen — controleer met `tests/unit/tree-contrast.test.ts` als voorbeeld en voeg een contrasttest toe voor stempel-op-tegel in alle vier de paletten. |

---

## Het contract per scherm

Schrijf dit uit als `docs/kamer-contract.md` (het model is `docs/canvas-contract.md`): elke regel hieronder wordt een genummerde regel daar, en elk verschil dat tussen schermen blijft bestaan krijgt er zijn reden.

### De shell

- **Beursblok** rechtsboven naast de aanwezigheidsstip (desktop) en in de tabbalk op de plek van de *Jij*-tab op een telefoon **niet** — de tabbalk is vol (§66). Op een telefoon: in de kopregel van elke pagina in scope, rechts van de eyebrow. Klik → eigen kamer (bij twee onderzoekers → de gedragen). Draagt niemand → absent. Live: luistert op `characters` en op de eigen `room:{id}` zodat een gift van de Keeper het cijfer laat bewegen terwijl je kijkt (§21).
- De aanwezigheidsstip (12 px, ongelabeld) wordt een **knop met woord** op desktop (*Wie is er?* + stip + telling) en houdt op de telefoon zijn stip maar met 44 px raakvlak.
- De FAB is verborgen zolang een `Sheet` open is (`UiProvider` weet dat al) en op `/uitdelen`.

### `/kamer/<slug>`

Kop: eyebrow (speler) · h1 *Kamer van {naam}* · **Beurs** · knop *Winkel* (`shop`-icoon, `btn` normaal, niet `btn-small` — het is de tweede belangrijkste knop van de pagina).
Dan **Wat deze kamer je geeft** (of de ene zin + deur).
Dan het raster:
- **Leeg**: plek-icoon groot (2rem) gedempt, kopregel, knop *Neerzetten* (`plus`). Vaste hoogte.
- **Gevuld**: vierkante cover (met crop), naam als link (één stijl, dezelfde als in de effectenlijst), × rechtsboven. Vaste hoogte = dezelfde als leeg.
- **Op slot**: compact — kopregel, prijs-stempel (kleiner: 0.7rem), knop *Openen · n munten* als betaalbaar; anders geen knop maar de zin *nog 3 nodig* in `--ink-muted`. Halve hoogte van een open tegel; twee gesloten tegels stapelen in één cel? **Nee** — één tegel per cel, `grid-auto-rows` met een `span` per staat is te slim. Houd één rijhoogte, maak gesloten tegels visueel lichter (geen rand-schaduw, gestreept, kleinere stempel) en zet de knop op dezelfde hoogte als bij open tegels zodat de knoppenrij uitlijnt.
- Hover op een tegel: dezelfde `translateY(-2px)` + schaduw als `.card`, met dezelfde reduced-motion-uitzondering.
- Na een uitgave: het beursblok telt af (120 ms), de tegel die veranderde krijgt 600 ms een `--stamp-red` rand die wegvaagt; de toast noemt de plek.
Grootboek: ingeklapt, laatste drie regels, `+` in `--ink` vet, `−` in `--ink-muted`, geen rood. Regels lezen als zinnen: *Plank geopend*, *Prent demo gekocht*, *Van de Keeper: Startgeld*. De Keeper-vorm eronder heeft een kop *Geven* en labels boven de vakken.

### De plek-kiezer (Sheet)

- Titel *Neerzetten op de plank* (met lidwoord en soort). Beursblok eronder, niet `.tiny`.
- **Opent op de tab die iets heeft**: heeft de speler niets in bezit dat hier past → Catalogus eerst. De tabs worden echte tabs (`role="tablist"`, onderstreping, 44 px), niet chips.
- Catalogusrij = **dezelfde component als de winkelrij** (`WinkelRij` met `compact`), zelfde cover, zelfde staten, zelfde zichtbare "nog n nodig". Koopknop *Kopen · n munten* met `coin`.
- Zoekvak altijd zichtbaar boven beide tabs.
- Sluiten: het × 44 px, en op een telefoon veeg-omlaag (de `Sheet` heeft de handle al).

### `/winkel`

Kop: eyebrow *Voor {onderzoeker}* (of `KamerKiezer` als tabs, één regel) · h1 *Winkel* · **Beurs** · knop *Naar de kamer* (`home`).
Filterrij: Alles · Muur · Plank · Bureau · Kist (chips met `aria-pressed`, telling erachter). Onthouden per tab in `sessionStorage` is toegestaan (het is een gemak, geen staat).
Eén lijst, prijs oplopend, dan naam. Rij: cover (vierkant, 3rem; zonder foto het `plekIcon` klein op `--paper-dark`, geen grote doos) · naam (link) · korte regel · effectregels · plek-chips (*muur · bureau*) · rechts: prijs-stempel, daaronder óf **Kopen · n munten** óf *nog n nodig* óf *1× in je kamer* + knop óf *geen vrije plek — open er een →* (één regel, `btn-ghost`, geen kale link) óf *iemand anders heeft hem*.
Na een koop: toast met *Bekijk*, de rij verandert ter plekke (`owned`-telling), het beursblok telt af, en rijen die net onbetaalbaar werden krijgen een korte fade — **geen** onaangekondigd grijs worden.
Voor de Keeper: geen beurs, geen knoppen, één zin, en de prijs-stempels blijven.

### `/spelers/<naam>`

Panelen in de nieuwe volgorde; `.speler-panels` blijft `auto-fit`, maar het Kamer-paneel is `grid-column: span 2` op desktop zodat het de eerste rij vult en het gat naast *Aanwezig* verdwijnt. Karakter-portretten: max 80 px breed, placeholder gedempt. Elke deur: `PanelDoor` met pijl. Empty states via de bestaande `.empty` van de site, niet inline `.small.muted`.

### `/spelers`

Eigen rij eerst, *(jij)*. Kolomkoppen. Online-rand met woord *online* in `.tiny`. Voor de Keeper de knop *Uitdelen* (`gift`) rechts in de kop.

### `/uitdelen`

Zie beslissing 10. Desktop: één tabel, vier kolommen dicht bij elkaar (vinkje · naam · saldo · bedrag), max-width 40rem, zebra. Telefoon: rij = naam en saldo op regel 1, vinkje links, bedrag rechts op regel 2, 44 px. Sticky voet altijd: *"36 munten naar 12 kamers"* + **Uitdelen**. Deur terug *Naar de spelers* in de kop.

### `/you`

Blijft het account. Het krijgt **wel** het beursblok en een deur *Naar je kamer* naast *Winkel*, en de rij deuren wordt een nette rij `btn` met iconen die kloppen (`home`, `shop`, `person`, `badge`). "Jouw account" wordt een woordsleutel. De Lettertype/Kleuren-chips halen 44 px op een telefoon; de FAB staat er niet meer bovenop (padding).

---

## Regels die niet gebroken mogen worden

1. **Rule 78.** Nergens een optelling, een bonus, een stat. Ook niet "handig" in een toast.
2. **§76.** Een versluierde plek, een versluierde grootboekregel en een versluierde effectregel blijven dezelfde ene zin. Het beursblok toont **alleen je eigen** saldo, nooit dat van een ander in de shell.
3. **§79/§83: het saldo is de som van het grootboek.** De UI leest `balanceOf`/`RoomView.balance`; ze rekent niets zelf, ook niet "6 − 2 = 4" voor de animatie — ze animeert naar het getal dat de server teruggeeft.
4. **§17 regel 4.** Elke knop die de winkel of de kamer toont wordt op de server nog een keer geweigerd; een UI-staat is nooit de enige bewaker. De duplicaat-rij verdwijnt in de pagina, **niet** door `shopFor` te veranderen — `landsIn` per soort blijft, de pagina kiest.
5. **§11.** Elk zichtbaar woord is een sleutel in `lib/words.ts`. De lijst nieuwe sleutels staat in de rondedoc.
6. **§45.** Geen letterlijke kleur in `kamer.css`/`spelers.css` (dat is nu zo — houd het zo). Nieuwe kleuren zijn `color-mix` van bestaande tokens of een nieuw token in `schemes.ts` **met** het gegenereerde blok in `globals.css` bijgewerkt (de test `schemes.test.ts` bewaakt dat).
7. **§69 6.1.** 44 px voor alles wat een vinger raakt, op een telefoon. `--tap`, nooit `44px`.
8. **§59.** De plek-kiezer en de uitdeler nemen `useHoldRefresh` terwijl ze open/half-ingevuld zijn.
9. **§80.** Een slot heeft ook aan de buitenkant een gleuf: elke nieuwe deur (beursblok, artikelregel, paneel) is absent voor wie er niet doorheen mag — en de pagina erachter blijft de 404 die hij is.
10. **Geen schema-wijziging, geen migratie.** Dit is een UI-ronde. Als je er tóch een nodig denkt te hebben: stop en schrijf op waarom.
11. **De ladder blijft de ladder.** `sort_order` bepaalt de volgorde van tegels; niets herordent open tegels vóór gesloten.

---

## Bewust buiten scope

Terugverkopen, ruilen, een tweede munt, sjablonen in de uitdeler, een geschiedenis apart van het grootboek, een canvas-kamer met een tekening, notificaties buiten de toast, de kamer in de telefoon-tabbalk (vol, §66), het herontwerp van `/you` als geheel (alleen wat hierboven staat), de aanwezigheidspopover als geheel (alleen de contradictie "je bent alleen" + jezelf, de 44 px, en de telefoon-afsnijding).

---

## Wat "groen" betekent

- `tsc --noEmit` stil, `npm run build` schoon, volledige Playwright desktop + telefoon (`per-place-crops.spec.ts:13` rood is verwacht).
- **Unit**: `tests/unit/kamer-contract.test.ts` — de icon-tabel (één icoon per betekenis, geen dubbelen in scope), de woordsleutels (geen letterlijk Nederlands in `components/kamer|winkel|spelers`, gecontroleerd met een grep-test zoals `schemes.test.ts` de stylesheet leest), het breekpunt (767 in beide stylesheets), geen letterlijke `44px`, geen dode klassen (elke `className` in scope bestaat in een geïmporteerd stylesheet), en de contrasttest stempel-op-tegel en knop-uit-op-paper in vier paletten. Plus: `shopFor` onveranderd (bestaande `winkel.test.ts` blijft groen zonder wijziging — dat is het bewijs dat de duplicaat-fix in de pagina zit).
- **e2e**: `tests/e2e/kamer-ux.spec.ts` — (1) vanaf Start in **één** klik in je eigen kamer via het beursblok; (2) een koop in de winkel geeft een toast met de plek en *Bekijk* landt op die tegel; (3) een ding met twee soorten plek staat **één keer** in de winkel en landt op de eerste vrije; (4) *nog n nodig* is zichtbare tekst op een telefoon; (5) het raster houdt dezelfde rijhoogte vóór en na een koop (meet `boundingBox` van drie tegels); (6) de FAB overlapt geen `btn` op `/kamer`, `/winkel`, `/you` bij 390 px (`elementFromPoint` op het midden van elke knop is de knop zelf); (7) `/uitdelen` op een telefoon heeft de knop in beeld zonder scrollen en het totaal klopt met de som van de vakken; (8) de Keeper ziet de meekijk-banner en de speler niet; (9) donker: de uitgeschakelde en ingeschakelde Kopen-knop hebben een verschillende `border-style` of `background` (lees `getComputedStyle`).
- **Een echte browserronde met screenshots vóór en ná**, dezelfde negen schermen als het onderzoek, in `claude/shots-round-45/`, en in de rondedoc een tabel *voor / na* per scherm met wat er veranderd is. §80 staat er niet voor niets.

---

## Als het af is

Schrijf `claude/round-45-de-kamer-in-de-hand.md` in de huisstijl: wat er gevraagd is, de beslissingen vooraf (de tabel hierboven, met wat je ervan afgeweken bent en waarom), wat er gebouwd is per scherm, **de voor/na-screenshots**, de fouten die onderweg gevonden zijn, de regels die niet gebroken mogen worden, wat er bewust niet in zit, wat er getest is, en de uitrolregel (geen migratie). Voeg **rule 84** toe aan `README.md` in dezelfde stem als 79–83 — de kern: *geld heeft een stem, een saldo is geen prijskaartje, en een deur ziet eruit als een deur* — en zet de §5-wegwijzer in `CLAUDE.md` bij (controleer dát de vervanging iets vond). Schrijf `docs/kamer-contract.md`.
