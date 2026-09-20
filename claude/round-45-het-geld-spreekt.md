# Ronde 45 — het geld spreekt

**Claims §84 / rule 84.** Gebouwd op ronde 44 (§83). **Geen migratie.**
Dit is de eerste helft van het promptdocument `claude/prompt-round-45-de-kamer-in-de-hand.md`;
de tweede helft (het raster, de panelen, de uitdeler, `/you` als geheel, het
contractdocument) is **ronde 46**, zoals afgesproken.

## Wat er gevraagd is

> *"Make the UX of this shop and player page immaculate. Where the buttons
> should be, how to visually style it, and how to make it as smooth to work with
> as possible for the players."*

Drie Opus-agents liepen de feature eerst na — een routekaart, de visuele taal,
en een echte doorloop met screenshots op 1440 en 390 px, in licht en donker.
Wat ze vonden was niet één fout maar één sóórt fout, drie keer: **wat er gebeurt
is nergens te zien.**

## De vier vragen vooraf, en je antwoorden

| Vraag | Jouw antwoord |
|---|---|
| Eén lange ronde of splitsen? | **Splitsen.** Deze ronde is "het geld spreekt"; het raster, de panelen, de hal, de uitdeler en het contractdocument zijn ronde 46 |
| Wat kost het als de Keeper in andermans kamer op *Openen* drukt? | **Haar munten**, zoals nu. De kamer is van haar, de ladder is van haar — jij krijgt alleen een zin die zegt dat je meekijkt |
| Waar staat de beurs op een telefoon? | **Overal, beide schermformaten**, rechtsboven naast de aanwezigheidsstip |
| De winkel: groepen houden of één lijst? | **Eén lijst met filterchips.** Dat keert regel 82 om, en dat staat er met zoveel woorden bij |

## Wat er gebouwd is

### 1. De beurs — en de voordeur die de feature niet had

`components/kamer/Beurs.tsx`, en het verschil met wat er stond is het punt:

- een **prijs** blijft de `.stamp` — schuin, rood, omlijnd, een kaartje dat aan
  een ding hangt;
- een **beurs** staat rechtop, in gewone inkt, met een munt ervoor. Nooit rood.

Tot nu toe waren het hetzelfde component. Je saldo bovenaan je kamer en de prijs
op een tegel waren in één oogopslag niet uit elkaar te houden, en een koop
veranderde dus één cijfer in een ding dat eruitziet als een prijskaartje. Er
waren bovendien drie tekeningen van dat ene getal: een `.stamp` in de kamer, een
`.stamp` in de winkel en een grijze `.tiny` in de plek-kiezer. Nu is het er één.

**En hij staat in de hoek van elke pagina** (`ShellBeurs`), links van de
aanwezigheidsstip, met `purseOf()` op de server gelezen in de layout. Eén tik →
je eigen kamer. Dat was drie klikken, en die van een ander vier; `/you` noemde
de winkel en de hal en **nooit de kamer of het saldo**.

Hij is *absent* — niet leeg — voor de Keeper (draagt niemand, §18) en voor wie
nog geen onderzoeker draagt: een blokje dat "0 munten" zegt tegen iemand zonder
kamer belooft een kamer. Hij staat niet op een canvas (§34: het glas krijgt het
scherm, en op een prikbord valt niets te kopen) en niet op de kamer of de
winkel, die hun eigen grotere beurs dragen — twee keer hetzelfde getal naast
elkaar was het eerste wat de browser liet zien.

Hij beweegt live: `ShellBeurs` kijkt naar zijn eigen `room:{id}` en ververst,
met §59's hold gerespecteerd (een gift die aankomt terwijl je een kaart sleept
wordt onthouden, niet weggegooid). En hij telt zichtbaar af — een animatie op
`key={balance}`, zonder timer, zonder state, en vooral zonder ooit zelf een
saldo uit te rekenen (§79 regel 1).

### 2. Elke uitgave spreekt — vóór en na

- **Vooraf**: de knop zegt wat hij kost. *Openen · 2 munten*, *Kopen · 5
  munten*. Er is nog steeds geen bevestigingsdialoog, en dat is een keuze: dit
  doe je twintig keer op een avond en een dialoog zou frictie zijn in plaats van
  zorg. Het bedrag op de knop is dezelfde bescherming zonder de klik.
- **Achteraf**: een melding zegt waar het ding heen is — *"Staande klok ligt nu
  op je muur. −2 munten"* — met een knop **Bekijk** die op díé tegel landt
  (`#plek-<id>`, en de tegel licht twee tellen op). In de kamer zelf is er geen
  *Bekijk*: je staat er al.

Zes van de zeven schrijfacties in deze feature waren stil. De doorloop mat
174 ms tussen klik en nieuw saldo — de snelheid was nooit het probleem.

### 3. "Nog 3 munten nodig" is tekst geworden

Die zin stond **drie keer letterlijk** in de code — in de tegel, in de
plek-kiezer en in de winkelrij — en alle drie de keren als `title` op een
uitgeschakelde knop. Een `title` bestaat niet op een telefoon, en dit is precies
de zin die iemand aan het sparen zet.

Eén `shortfall()` in `plekWords.ts`, één woordsleutel, zichtbare tekst. En de
knop is **weg** in plaats van uitgeschakeld: een knop die niets doet naast een
zin die zegt waarom, is er één te veel.

### 4. De winkel: één lijst met een filter

Dit keert **regel 82 om**, en dat staat in regel 84 en hieronder.

§82 groepeerde per soort plek met een goede reden — een etalage lees je naar
wáár een ding zou gaan. §83 haalde die reden onderuit zonder het te merken:
sindsdien past een ding op meer dan één soort plek, dus stond het in twee
groepen met twee knoppen. Na één koop zei de ene rij *"geen vrije plek van deze
soort"* en de andere, over hetzelfde voorwerp, *"staat al in je kamer"* boven
een levende rode knop.

Nu: één lijst, goedkoopste eerst, met chips erboven (*Alles · Muur · Plank ·
Bureau · Kist*, met tellingen) en chips op de rij zelf die zeggen waar het past.
Eén Kopen-knop, die landt op de eerste vrije plek in de volgorde van de ladder.

**De ontdubbeling zit in de pagina en niet in `shopFor`** — `landsIn` blijft per
soort plek — en dat `tests/unit/winkel.test.ts` zonder één wijziging groen bleef
is daar het bewijs van. Wat wél aan de service veranderde is één veld erbij:
`ownedCount`, zodat "staat al in je kamer" een telling kan zijn nu er meer dan
één van mag staan.

### 5. De Keeper weet dat hij meekijkt

`unlockSlot` kijkt naar het saldo van de kámer, en `canArrangeRoom` geeft de
Keeper alles — dus jij drukte in andermans kamer op *Openen* en betaalde met
háár munten, zonder dat iets dat zei. Jouw antwoord op vraag 2 was: zo hoort het
ook. De reparatie is dus een zin en geen regel: een gestreepte banner die zegt
van wie de kamer is, dat neerzetten gratis is en dat openen zíj betaalt. De
eyebrow zegt nu ook van wie de kamer is, in plaats van "Kamer" — wat hij ook op
de winkel en de uitdeler zei.

### 6. Eén vorm per betekenis, en één werkwoord

`box` was de kist **én** de winkel **én** het tabblad *wat je al hebt* **én** de
lege cover van elk stuk huisraad; `book` was de plank én de catalogus; `plus`
was neerzetten, geven, uitdelen en de uitdeelknop; *Uitdelen* had twee
verschillende iconen op zijn twee deuren.

Vijf nieuwe vormen (`coin`, `shop`, `gift`, `shelf`, `desk`) en een tabel
`MEANING` in `components/kamer/plekWords.ts` die `kamer-contract.test.ts` leest
— inclusief de omgekeerde vraag: tekent iets in deze feature een icoon dat niet
in de tabel staat?

En het werkwoord: de knop onder het grootboek zei **Uitgeven**, wat het
tegenovergestelde betekent van wat hij doet. Uitgeven doe je in de winkel; de
Keeper **geeft**.

### 7. Donker, en de duim

- Een **tegengehouden `btn-primary`** is nu omlijnd en gestreept in plaats van
  half doorzichtig. `opacity: 0.5` op een rode vulling is in het licht nog net
  een verschil en in het donker geen; de doorloop vond een uitgeschakelde en een
  ingeschakelde *Kopen* die bijna dezelfde kleur waren. Een **vorm** werkt in
  alle vier de paletten tegelijk.
- De **FAB** hangt op `--tabs-h + 1rem` en is 56 px hoog, dus de onderste
  ~132 px van elke pagina lag onder een knop terwijl er 84 px vrij werd
  gehouden. `--main-pad-b` telt hem nu mee — dat helpt élke pagina, niet alleen
  deze.
- Alles wat in deze feature een vinger raakt haalt **44 px** op een telefoon,
  via `--tap` en nooit via een letterlijke `44px`.

### 8. Een woord mag een gat hebben

Nieuw in `lib/words.ts`: `fill()`. `'Nog {n} nodig'` staat in de lijst en de
component vult het gat. Jij ziet het gat in Beheer, mag de zin eromheen
herschrijven, omdraaien of korter maken — en mag het gat zelfs weghalen, dan
staat het getal er niet meer en dat is jouw keuze. Er wordt niets afgedwongen:
een gat waar niets voor meegegeven is blijft staan zoals het is, want `{plek}`
in een zin is beter zichtbaar mis dan een gat in een zin.

Elf nieuwe sleutels, allemaal in de groep **De kamer**: `purse`, `shortfall`,
`boughtHere`, `unlockedHere`, `clearedHere`, `toastShow`, `shopOwnedCount`,
`shopAll`, `keeperGuest`, `keeperGuestGift`, `yourAccount`. En één hernoemd:
`ledgerGive` staat nu op *Geven*.

## De fouten die onderweg gevonden zijn

**Zes, en vijf ervan vond een test of een hand — geen enkele een mens die keek.**

1. **Het donkere spelerspalet droeg de rode inkt van het lichte.**
   `playerDark.stampRed` was `#a8321e`, ongewijzigd overgenomen: 6,1 tegen 1 op
   licht papier en **2,4** op een bijna-zwarte tegel. Een prijs van 30 munten op
   een gesloten plek was 's avonds niet te lezen. `keeperDark` had die correctie
   allang — dit is dezelfde waarde (`#c04a34`), dus geen nieuwe kleur maar een
   vergeten regel. Gevonden door een contrasttest van drie regels, nadat er vier
   rondes lang naar gekeken was.
2. **De rij deuren op `/you` haalde de 44 px niet.** Gevonden door de e2e-zaak
   die op 390 px élke zichtbare `.btn` opmeet in plaats van een lijstje af te
   lopen dat iemand bijhoudt. Die rij stond in geen enkel overzicht, omdat
   niemand hem als onderdeel van deze feature zag.
3. **Twee beurzen naast elkaar**, twintig pixels uit elkaar, op de kamer en de
   winkel. Alleen in de browser te zien; geen test zou dat ooit vragen.
4. **`landsIn` landde op de verkeerde plek, en het comment erboven zei het
   goede.** Een ding dat op een muur én een bureau past hoort op de *eerste
   vrije plek* te landen, en dat is de vroegste sport van de ladder. De code
   liep over `PLEK_KINDS` (muur, plank, bureau, kist) terwijl `ROOM_SHAPE`
   begint met bureau — dus de klok hing aan de muur terwijl het vrije bureau
   twee sporten eerder kwam. Dit is §83's les woord voor woord: het comment
   noemde de juiste volgorde en de regel eronder een andere. `shopFor` vult
   `landsIn` nu in de volgorde waarin het de plekken al afloopt (op
   `sort_order`), en `landing()` leest die sleutelvolgorde.
5. **De beurs in de hoek kneep een prikbord smaller.** `.live-strip` is een
   `float: right` in de hoofdkolom, en een tweede float ernaast neemt nóg een
   stuk van die kolom. Op een landkaart, tijdlijn of stamboom gebeurt dat niet
   (die zijn `.page-canvas` en de strip hangt daar absoluut), maar een **wand is
   nog niet op §34's canvas-schil** — en een muur die smaller wordt, is een muur
   waarop elke coördinaat verschuift. Twee inkt-zaken op de telefoon liepen
   erop vast: twee tests die niets met geld te maken hebben, over een verandering
   in de schil. De beurs staat nu ook daar niet, met de reden erbij en met wat er
   mag verdwijnen zodra de wand wél een `.page-canvas` is.

   *(En de eerste verklaring was fout.* De FAB-ruimte zat eerst in
   `--main-pad-b` zelf, en een `.page-canvas` neemt die waarde met een negatieve
   marge terug terwijl zijn hoogte bij de tabbalk stopt — dus die variabele
   groter maken schuift elk canvas onder de balk door. Dat is óók waar, en het
   is gerepareerd door de ruimte naast `--main-pad-b` te zetten in plaats van
   erin. Het was alleen niet de oorzaak van déze twee rode tests.)*
6. **`.spelers-kop` stond in `app/kamer.css`**, dat `/spelers` niet importeert.
   Het werkte alleen doordat Next de stylesheets van de hele app samenvoegt —
   precies de val waar ronde 44 in liep en hem ook zelf veroorzaakte. Nu in
   `app/spelers.css`, waar de pagina erom vraagt.

En twee dingen die geen fout waren maar wel sleten: het breekpunt van
`kamer.css` en `spelers.css` stond op **560 px** waar de hele app (en
`useIsPhone`) 767 zegt, zodat die pagina's tussen 561 en 767 px in
bureaubladopmaak stonden terwijl de app zichzelf een telefoon noemde; en vijf
klassen (`winkel-lijst`, `winkel-buy`, `spelers-index`, `spelers-rij`,
`speler-nu`, plus `uitdelen-form` en `uitdelen-page` uit ronde 44) stonden in de
opmaak en in geen enkel stylesheet.

## Regels die niet gebroken mogen worden

1. **Rule 78.** Nergens een optelling, een bonus, een stat — ook niet "even
   handig" in een melding.
2. **§76.** De beurs toont alleen je eigen saldo, nooit dat van een ander.
3. **§79 regel 1: het saldo is de som van het grootboek.** Het scherm animeert
   naar het getal dat de server teruggeeft en telt nooit zelf mee.
4. **§17 regel 4.** De ontdubbeling zit in de pagina; `shopFor` beslist nog
   steeds alles, en `buyFurnishing` weigert elke knop opnieuw.
5. **§11.** Elk zichtbaar woord is van jou — en `kamer-contract.test.ts` faalt
   op een Nederlandse zin die in een component belandt.
6. **§45.** Geen letterlijke kleur in `kamer.css` of `spelers.css`, en het
   gegenereerde blok in `globals.css` is opnieuw uitgedraaid (`schemes.test.ts`
   bewaakt het paar).
7. **§69 6.1.** 44 px via `--tap`, nooit als getal.
8. **§80.** Elke nieuwe deur is absent voor wie er niet door mag.
9. **Geen schema-wijziging, geen migratie.**

## Wat er bewust niet in zit

Alles uit de tweede helft van het promptdocument, en dat is ronde 46: het raster
met vaste hoogtes per staat, *Wat deze kamer je geeft* boven het raster, het
ingeklapte grootboek met zinnen in plaats van `Plek: plank`, *Weghalen* als klein
kruisje, de panelen op de spelerspagina, de hal, de uitdeler (zebra, lopend
totaal, sticky voet, eigen vinkjes in plaats van blauwe), de deur vanaf
`/e/<slug>` terug naar de kamer, en `docs/kamer-contract.md`.

Verder ongemoeid: terugverkopen, ruilen, een tweede munt, de kamer in de
telefoon-tabbalk (die is vol, §66), en de aanwezigheidspopover.

## Wat er getest is

- `tsc --noEmit` stil, `npm run build` schoon.
- **Unit**: 107 bestanden, 1910 tests (was 106 / 1887). Nieuw:
  `tests/unit/kamer-contract.test.ts` — één vorm per betekenis en de omgekeerde
  vraag, elk zichtbaar woord in `lib/words.ts`, de sjablonen die hun gat houden,
  `fill()` van drie kanten, het breekpunt, geen letterlijke `44px`, geen
  letterlijke kleur, geen klasse die niets tekent, en het contrast van de
  stempel, de beurs en een tegengehouden knop in **alle vier** de paletten.
  `winkel.test.ts` bleef ongewijzigd groen — dat is het bewijs dat de
  ontdubbeling in de pagina zit.
- **e2e**: `tests/e2e/kamer-ux.spec.ts` — vanaf de wiki in één klik in je kamer
  via de beurs; een ding met twee plekken staat één keer in de winkel; de knop
  draagt zijn prijs en de melding brengt je naar de tegel; "nog n nodig" is
  zichtbaar op een telefoon; élke zichtbare knop op drie pagina's is op 390 px
  echt aan te raken en 44 px hoog; de Keeper ziet de meekijk-banner en de speler
  nooit; en een tegengehouden knop is gestreept in plaats van doorzichtig.
- Volledige Playwright-suite, desktop + telefoon.
- **Screenshots** in `claude/shots-round-45/`; de "voor" staat in
  `claude/shots-round-44-ux/`.

## De uitrol

**Geen migratie.** Niets verwijderd, dus geen `git rm`.
