# Ronde 46 — De kamer in de hand

De tweede helft van `claude/prompt-round-45-de-kamer-in-de-hand.md`. Ronde 45
deed de acht beslissingen over **geld** (de beurs, de prijs op de knop, de
melding, de tekortzin, de winkel als één lijst); deze ronde doet de tien die
over **vorm** gaan — het raster, het grootboek, de plek-kiezer, de uitdeler, de
hal en de spelerspagina — plus `docs/kamer-contract.md`, dat de afspraken van
allebei de helften vasthoudt.

Geen migratie. Geen schemawijziging. Eén veld erbij op een bestaande
leesfunctie (`roomSummary().total`), en verder alleen scherm.

---

## Wat er gevraagd is

> *"Next half please"*

De splitsing is Nicks eigen beslissing uit ronde 45 (vraag 1 van vier):
**splits in twee rondes**, ronde 45 = *het geld spreekt*, ronde 46 = het raster,
de panelen, de hal, de uitdeler, `/you` als geheel en het contract.

---

## Wat er gebouwd is

### 1. Het raster ademt — en breekt niet meer bij de eerste koop

Dit is de duurste fout van de vier rondes ervoor, en hij was in één regel te
zien: een tegel had alleen een `min-height`, dus de rij gróeide mee met wat
erin lag. Een gevulde tegel met een staande omslag van 3:4 werd in een kolom
van 9,5rem ruim tien rem hoog en duwde de drie lege tegels naast zich mee
omhoog. Het raster brak dus precies op het moment dat je er het meest naar
keek: als je net iets gekocht had.

Drie dingen samen repareren dat:

- **`grid-auto-rows`** zet de rijhoogte één keer, voor alle vier de staten. De
  tegel heeft geen eigen minimum meer.
- **Een vierkante uitsnede** op een gevulde tegel (`shape="square"` — die
  bestond al sinds ronde 19) is nooit hoger dan breed. De maat hoort bij de
  *tegel*, niet bij de klasse: `.plek .plek-cover`, want een winkelrij draagt
  dezelfde klasse op 3rem breed. Dat onderscheid was een van de fouten
  onderweg; zie hieronder.
- **Een merk in het midden** van een lege en een gesloten tegel — het icoon van
  de soort plek, respectievelijk een slot, groot en gedempt — vult de ruimte
  die overblijft en houdt de staten op één hoogte zonder dat die hoogte ergens
  een tweede keer opgeschreven staat.

Gemeten: zes tegels van 216 px op 1440 px en vier van 184 px op 390 px, in alle
vier de staten, vóór en ná een koop. De e2e-zaak meet dat als *"alle tegels zijn
even hoog, en dat getal verandert niet door een koop"* in plaats van als een
pixelmaat — een test die de opmaak overschrijft bewaakt niets.

### 2. Wat deze kamer je geeft, staat bovenaan

Het stond onder het raster, met als redenering dat het raster is waar een kamer
over gáát. Op een telefoon betekende dat: twaalf tegels scrollen voor de enige
regel die zegt waar al dat sparen goed voor was. Het raster blijft waar de kamer
over gaat, maar dít is waar hij *voor* is.

En "er ligt nog niets" wordt nu getekend in plaats van overgeslagen. Een kamer
met een leeg raster en geen sectie erboven leest als een pagina die niet geladen
is; één zin plus de deur naar de winkel leest als een kamer die leeg is — wat
hij op ieders eerste avond ook is.

### 3. Het grootboek leest als zinnen, en houdt zijn mond over de rest

Drie regels, drie vormen, geen van drieën een zin:

| | was | is |
|---|---|---|
| een geopende plek | `Plek: plank` | *Plank geopend* |
| een koop | `Prent demo` | *Prent demo gekocht* |
| een gift | `Startgeld`, of `—` | *Van de Keeper: Startgeld* |

Alle drie zijn sjablonen in `lib/words.ts` met gaten erin, dus de Keeper mag ze
herschrijven. De **vierde** vorm — een versluierde regel — is met opzet niet
aangeraakt: §76's regel is dat elk versluierd ding dezelfde ene zin zegt, en een
eigen vorm zou juist de tell zijn.

Het boek staat bovendien **ingeklapt** op de laatste drie regels, met één knop
voor de rest. `ledgerOf` haalt er vijftig op, dus onder een kamer van twaalf
tegels stond een lijst die vier keer zo lang was als de kamer zelf.

En het bedrag ernaast is geen `.stamp` meer. §84 gaf het saldo een eigen vorm
juist omdát een stempel een *prijs* betekent — en het grootboek bleef er drie
onder elkaar tekenen, waarvan één met een `+` ervoor. Drie rode kaartjes lezen
alle drie als een waarschuwing. Nu: erbij in gewone inkt en vet, eraf gedempt,
niets rood.

### 4. Weghalen is geen gelijke van Neerzetten

Een klein kruisje rechtsboven in de gevulde tegel, met de naam van wat het
weghaalt in zijn `aria-label`, met een volwaardig raakvlak van 44 px op een
telefoon. Even groot en op dezelfde plek zetten als *Neerzetten* zegt dat het
twee even waarschijnlijke dingen zijn om te doen, en dat is het niet.

### 5. De plek-kiezer: echte tabs, één zoekvak, en het goede tabblad

- **Echte tabs.** Ze waren `chip-selectable` met `aria-pressed` — het patroon
  van een *filter*, waarvan je er geen of drie tegelijk aan kunt hebben. Hier
  is er altijd precies één aan. Nu `role="tablist"` met `aria-selected`, een
  streep onder degene waar je bent, en 44 px eronder (ze waren 30).
- **Hij opent op het tabblad dat iets te zeggen heeft.** *Wat je al hebt* is de
  goede eerste vraag zodra het antwoord bestaat en een doodlopende weg
  daarvóór — dus op je eerste avond voor iedereen. Het omschakelen gebeurt
  nadat het antwoord binnen is en precies één keer per opening: een tabblad dat
  onder je hand terugspringt zodra je typt is erger dan een leeg tabblad.
- **Eén zoekvak boven allebei de tabs**, dat allebei de lijsten filtert — het
  bezit op de server (duizend artikelen), de catalogus in de browser (tien).
  Het stond in het eerste tabblad, dus het sprong bij elke wissel weg en weer
  terug en liet het hele blad meespringen.

### 6. De uitdeler leest van links naar rechts, en zegt wat hij gaat doen

De som van wat je op het punt stond te doen was een `.tiny` die aan het eind van
de knop geplakt zat — *"Uitdelen — 36 munten / 12"* — dus het ene getal dat een
Keeper nakijkt vóór hij drukt, stond kleiner dan al het andere op de pagina en
was geformuleerd als een breuk. Nu een zin in een **plakkende voet**: *36 munten
naar 12 kamers*, met de knop ernaast, op 390 px in beeld zonder scrollen.

Verder: zebra-strepen over de rijen (twaalf regels met vier kolommen cijfers en
niets dat ze scheidt is een plek waar je je regel kwijtraakt), `accent-color` op
de vinkjes zodat ze de inkt van het archief dragen, het saldo náást het bedrag
in plaats van aan de andere kant van de rij, het globale vak heet *Voor iedereen*
en heeft geen placeholder-`3` meer die als ingevulde waarde leest, en na afloop
houdt de knop *Uitgedeeld* even vast met een deur naar de hal ernaast.

De FAB wijkt op deze pagina — twee dingen rechtsonder is er één te veel — en
ook boven een open blad, allebei met `:has()` in plaats van met een vlag door de
schil.

### 7. De hal kent jou

Je eigen regel staat bovenaan en zegt waarom, met kolomkoppen (*Speler* ·
*Draagt*) erboven en een woord *online* voor wie er nu is. De hal stond
alfabetisch, wat de goede volgorde is voor een lijst waar je iemand ín zoekt —
maar de eerste vraag aan een lijst van jezelf-en-de-rest is "waar sta ik", en op
naam is dat elke avond een ander antwoord. De **server** sorteert dat, niet de
browser, zodat de lijst niet een tel later verspringt.

Het woord *online* komt uit de roster die de schil toch al heeft (§76) en
nergens anders vandaan: geen tweede lijst, geen tweede stel regels over wie
genoemd mag worden. Een Keeper die zichzelf onzichtbaar maakte staat niet in het
frame dat deze browser kreeg, en `HalOnline` hoeft dat niet te weten.

### 8. De spelerspagina wijst naar de kamer

De volgorde was die waarin de panelen gebouwd zijn — één per ronde — en die
zette het paneel dat meestal leeg is (*Aanwezig*) vooraan en de twee die bijna
altijd vol zitten achteraan. Nu: **Kamer, Karakters, Aanwezig, Dossiers,
Bijdragen**, met het kamerpaneel over de volle breedte van de eerste rij.

Elke regel in dat paneel is een deur die je kunt zíen: de beurs in dezelfde vorm
als in de schil en in de kamer zelf, de naam, *4 van 12 plekken open · 2 gevuld*,
en een pijl. Niets erin is bedienbaar — §77's regel, en de regel die dit paneel
het meest uitnodigt te breken.

Elke `PanelDoor` draagt een pijl en een werkwoord (*Naar de kamer*, niet
*Kamer*). En de deur van *Recente bijdragen* is weg: hij ging naar `/`, de feed
van iedereen, dus hij beloofde "meer hiervan" en gaf iets anders. §77's tweede
helft — er staat niets in een paneel dat geen eigen pagina heeft — geldt ook voor
de deur eronder.

### 9. Het onderzoekersartikel wijst terug

Eén regel onder de kop van `/e/<slug>` van een gedragen onderzoeker: de beurs en
*Naar de kamer*. Dit was het enige scherm in het archief dat over een
onderzoeker gáát en zijn kamer nergens noemde — je kwam er alleen via `/you` of
via een spelerspagina, allebei over een *account*, terwijl een kamer aan de
onderzoeker hangt (§17/§18).

`roomSummary` beantwoordt de hele vraag in één keer en is de enige lezer: null
voor een artikel dat niemand draagt (er wordt dus ook geen kamer aangemaakt door
ernaar te kíjken) en null voor een kamer die deze ogen niet mogen openen. §80:
de deur is absent voor wie er niet doorheen mag, en de pagina erachter blijft de
404 die hij is.

### 10. Vier en een halve centimeter duim

§69 6.1 bracht 44 px naar de vier tekenvlakken en liet de rest van het archief
met opzet staan. §84 vond met de e2e-zaak die *elke* zichtbare knop opmeet één
rij die dat ook nodig had (`/you`); deze ronde vond met dezelfde zaak de rest
van deze feature: de deur uit een lege kamer (34 px), de deur naar de kamer op
een onderzoekersartikel (34 px) en de acht chips op `/you` (38 px).

Het blok dat dat rechtzet hangt aan **pagina's** en niet aan knoppen, en dat is
§84's les: een lijstje knoppen bijhouden bewijst wat je al wist, een regel aan de
pagina neemt de knop van morgen vanzelf mee. Het is ook precies daarom niet het
hele archief — voor een scherm waar het bewijs niet voor geleverd is, verandert
er niets.

---

## De fouten die onderweg gevonden zijn

**Acht, en zeven ervan vond een screenshot, een meting of een test — geen
enkele een redenering.**

0. **De plek-kiezer sprong élke keer naar de catalogus.** De regel is "open op
   het tabblad dat iets te zeggen heeft", en de vraag die dat beantwoordt is
   `items.length === 0` — maar `items` begint leeg omdat er nog niets
   *gevraagd* is, en dat is niet hetzelfde als "niets gevonden". In de tel
   tussen het openen en het antwoord (één debounce plus één fetch) was de
   voorwaarde dus altijd waar, ook voor iemand met een plank vol. Het is
   letterlijk de fout die §80 één tabblad verderop al had opgeschreven — daar
   staat `shop === null` voor "nog niet gevraagd" en een lege array voor een
   echt antwoord, met een comment erboven dat uitlegt waarom die twee niet
   hetzelfde zijn. Er is nu een `answered` naast `items`, en de e2e-zaak
   bewijst het van **beide** kanten: een plek waar niets voor bestaat landt op
   de catalogus, een plek waar wel iets voor is blijft op *Wat je al hebt* —
   en springt ook een seconde later nog niet weg.

   Gevonden door zes bestaande zaken in `huisraad.spec.ts` en `kamer.spec.ts`
   die tegelijk omvielen. Ik had ze bijna afgedaan als "specs die de oude vorm
   aannemen", want dat wáren er in deze ronde ook twee. Drie ervan hadden
   gelijk.

1. **De vierkante uitsnede lekte in de winkel.** `.plek-cover` wordt ook door
   een winkelrij gedragen (`.winkel-cover`, 3rem breed). Een `height: 6.4rem`
   op die klasse maakte van elk omslagje in de winkel een staande streep van
   3 bij 6,4 rem — en in de kamer, waar dezelfde regel klopte, was er niets te
   zien. Dat is §83's les nog een keer: een tweede lezer van hetzelfde ding
   beweegt niet mee. Nu `.plek .plek-cover`, met een test die erop staat.
2. **Het kruisje op een gevulde tegel was onzichtbaar op een telefoon.** Het
   stond er, het was 44 bij 44, en het was `--ink-muted` op `--paper-raised`
   binnen een tegel van `--paper-raised` — met een `opacity: 0` die pas bij
   hover wegging. Een telefoon heeft geen hover, dus dat was de enige staat die
   hij daar ooit had. Gevonden in een screenshot; de meting zei "zichtbaar,
   44×44" en had gelijk.
3. **`span 2` maakte een nieuw gat in plaats van het oude te dichten.** Het
   kamerpaneel is het kórtste van de vijf, dus twee kolommen breed naast een
   paneel van vijf regels liet een gat onder zich ter hoogte van dát paneel.
   `grid-column: 1 / -1` heeft geen buurman en dus geen gat.
4. **Een tegelknop paste niet in een tegel.** *Openen · 3 munten* is met de
   gewone knopruimte breder dan 9,5rem, dus hij brak over twee regels en de
   knoppenrij van het raster liep niet meer gelijk — precies de uitlijning die
   beslissing 6 vroeg. Een knop die het vak vult ís uitgelijnd.
5. **De koopkolom van een winkelrij propte drie dingen in zes centimeter.**
   Prijs, *Staat al in je kamer* en de koopknop stonden op 390 px in één kolom
   onder elkaar, dus het bijschrift brak over twee regels en duwde tegen de
   knop. Nu: prijs en bijschrift naast elkaar, knop eronder over de breedte.
6. **De e2e-zaak van ronde 45 riep "stuk" over iets dat werkte.** Hij sloeg een
   knop over waarvan de ónderkant voorbij 844 px lag — en mengde daarmee twee
   stelsels: `boundingBox()` meet vanaf de bovenkant van het *document*,
   `elementFromPoint` vanaf die van het *venster*. Bovendien hield hij geen
   rekening met de tabbalk, die vastgeplakt de onderste 56 px bezet. Zolang de
   knoppen 34 px waren viel daar niets in; zodra deze ronde ze op 44 px zette
   landde er één in die band. De zaak scrollt elke knop nu eerst naar het midden
   van het scherm en meet hem dan — wat een duim ook doet. *Een test die zegt
   dat het stuk is terwijl het werkt, is net zo duur als een die zwijgt terwijl
   het stuk is.*
7. **Een zaak die aanneemt wat er in het archief ligt, neemt aan wat andere
   zaken gedaan hebben.** Twee keer in deze ronde, allebei in nieuwe tests van
   deze ronde. `getByTestId('winkel-koop').first()` klikt op de bovenste rij
   van de winkel, en de winkel is het hele archief — dus de zaak over het
   grootboek kocht het stuk huisraad dat de zaak erboven net gemaakt had en
   viel om op een naam die klopte. En de zaak over de plek-kiezer nam aan dat
   er voor een *muur* niets bestond, wat waar is als je hem alleen draait en
   onwaar zodra er twintig minuten eerder een andere zaak gelopen heeft. De
   eerste filtert nu op de naam die hij zelf gestempeld heeft; de tweede
   bewaakt de **regel** in plaats van de uitkomst — het blad staat nooit stil
   op een leeg *Wat je al hebt*, wat er ook in het archief ligt.

En één ding dat geen fout was maar wel sleet: `.sheet-close` in
`app/globals.css` droeg twee keer een letterlijke `44px` — hetzelfde getal dat
§69 6.1 in `--tap` zette, hier met de hand overgeschreven. Het klopte
toevallig; het zou niet mee veranderd zijn.

---

## Waar van de opdracht afgeweken is

**Eén ding, met opzet.** Het contract vroeg: *"Catalogusrij = dezelfde component
als de winkelrij (`WinkelRij` met `compact`)"*. Dat is niet gedaan.

`CatalogueEntry` is een strikte deelverzameling van `ShopItem` mínus `plekken`,
`unique`, `owned`, `ownedCount`, `takenElsewhere` en `landsIn` — en dat zijn
precies de zes velden die de kiezer al wéét, omdat hij vóór één bepaalde plek
staat. Om `WinkelRij` te laten tekenen zou er dus een `ShopItem` verzonnen
moeten worden met een `landsIn` die de kiezer al in handen heeft en een
`unique: false` die niet waar hoeft te zijn. Een leugen in een type is duurder
dan een tweede component, en hij wordt pas duur op de dag dat iemand hem
gelooft.

Wat het contract er echt mee wilde — dezelfde staten, dezelfde woorden, dezelfde
zichtbare tekortzin — is er wél: allebei de rijen gebruiken `shortfall()`,
`withPrice()`, `MEANING.munt` en `.winkel-short`. Het staat als open punt in
`docs/kamer-contract.md`.

En één kleinigheid die in ronde 45 al zo besloten is en zo blijft: *Staat al in
je kamer* wordt pas een telling vanaf twee (*2× in je kamer*). "1× in je kamer"
is armer Nederlands dan de zin zelf.

---

## Regels die niet gebroken zijn

1. **Rule 78.** Nergens een optelling over het archief. Het lopende totaal in de
   uitdeler is een echo van de vakjes die er op dat moment staan — je eigen
   hand, niet een bevinding.
2. **§76.** Het beursblok toont alleen je eigen saldo. Een versluierde
   grootboekregel houdt exact dezelfde zin als een versluierde plek — de drie
   andere regels werden zinnen, deze niet, en dat is de reden.
3. **§79/§83.** Geen enkel scherm rekent een saldo uit; ze lezen
   `RoomView.balance` en `roomSummary().balance`.
4. **§17 regel 4.** Er is geen knop bij gekomen die de server niet nog een keer
   weigert. `roomSummary` is de enige lezer van "mag deze hand deze kamer zien"
   op het onderzoekersartikel.
5. **§11.** Zeventien nieuwe woordsleutels, nul letterlijke Nederlandse zinnen
   in de scope — en de scope van die test is met vier bestanden gegroeid.
6. **§45.** Geen letterlijke kleur in `kamer.css` of `spelers.css`; geen nieuw
   token, dus `schemes.test.ts` had niets te doen.
7. **§59.** De uitdeler neemt nu een `useHoldRefresh` zolang er iets
   half-ingevuld staat. Dat had hij niet, en twaalf vakjes en een reden zijn
   precies wat een `router.refresh()` van iemand anders kapot maakt.
8. **§69 6.1.** 44 px via `--tap`, nooit als getal.
9. **§80.** Elke nieuwe deur is absent voor wie er niet doorheen mag.
10. **Geen migratie.** `roomSummary` geeft één veld meer terug; dat is een
    telling over rijen die er al waren.

---

## Wat er bewust niet in zit

Terugverkopen, ruilen, een tweede munt, sjablonen in de uitdeler, een
geschiedenis los van het grootboek, een kamer op een canvas, notificaties buiten
de melding om, de kamer in de telefoon-tabbalk (die is vol, §66), en het
herontwerp van `/you` als geheel — daarvan is alleen gedaan wat het contract
noemde. De aanwezigheidspopover is ongemoeid gelaten op de 44 px na.

Eén ding dat het contract noemde en dat níét gebouwd is: **de aanwezigheidsstip
als knop met woord op desktop** (*Wie is er?* + stip + telling). Hij raakt de
schil van elke pagina in het archief en niet alleen die van deze feature, en dat
is een ronde over de schil, niet een regel in deze.

---

## Wat er getest is

- `npx tsc --noEmit` stil, ook over `tests/e2e` met een tijdelijke config.
- `npx vitest run` — **107 bestanden, 1914 tests**, alles groen (was 1910).
- `npm run build` schoon.
- `npx playwright test` — de volledige suite, desktop én telefoon: **432
  geslaagd**. Twee rode: `per-place-crops.spec.ts:13`, de bekende van §8 sinds
  ronde 19, en `round-28-mention-overlay` op de telefoon, die alleen gedraaid
  groen is (dezelfde "nog niet aan het luisteren"-race als §6 beschrijft). De
  zaak over de plek-kiezer viel in die run nog om op zijn eigen aanname over
  het archief (fout 7) en is daarna nagedraaid in precies de volgorde die hem
  velde — `huisraad`, `winkel`, `kamer`, `kamer-ux` achter elkaar, 32 geslaagd.
- **`tests/unit/kamer-contract.test.ts`** groeide van 23 naar 27 zaken: de
  scope kreeg de hal en de spelerspagina erbij, `ledgerEmpty` verdween uit de
  lijst met toegestane losse zinnen, elf nieuwe sjablonen worden op hun gat
  gecontroleerd, en er kwamen drie groepen bij — het raster heeft één hoogte en
  die staat op één plek, een bedrag in het grootboek draagt geen stempel, en
  elke deur begint met een werkwoord.
- **`tests/e2e/kamer-ux.spec.ts`** groeide van vier naar negen zaken; de zes
  nieuwe staan in de docblock boven ze, genummerd 7 tot en met 12.
- **Zes bestaande zaken in `huisraad.spec.ts` en `kamer.spec.ts` vielen om**, en
  dat is de moeite van het uitsplitsen waard: drie ervan wezen op een echte
  fout (de kiezer die altijd wegsprong, fout 0 hierboven) en drie namen een
  vorm aan die deze ronde met opzet omkeerde — het blad dat áltijd op *Wat je
  al hebt* opende, en de samenvatting van het kamerpaneel die nu zegt hoeveel
  plekken er open staan in plaats van hoeveel er gevuld zijn. Die drie dragen
  nu een comment dat zegt wat er omgekeerd is en waarom.

---

## De uitrol

Geen migratie, geen schemawijziging, geen verwijderd bestand. `npm run build`
en herstarten is genoeg.
