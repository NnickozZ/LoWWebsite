# Ronde 40 — de kamer, de plekken en het grootboek (§79)

19 september 2026. Gebouwd op `main` bij `7cc4d22` (ronde 39). **Eén migratie**
(`0027_kamers`), geen nieuwe afhankelijkheden, **34 bestanden** (15 gewijzigd,
19 nieuw), **niets verwijderd** — geen `git rm` nodig. Twee bouwagents parallel
(de pagina, de unittests), daarna een derde voor de browsertests, en die vond de
fout waar alles op stond.

## Wat Nick vroeg

> *"Meta progression will be a currency that they can spend to upgrade their
> room. Every investigator will have a room and there will be 'slots' in that
> room. And these slots can be filled up with things that provide buffs."*

Rule 78 (ronde 39) had de grens al opgeschreven, en die is niet verschoven:
**het archief onthoudt wat je bezit en wat het ding zégt dat het doet; het
rekent nooit een bonus uit en spreekt nooit recht.** Er staat in de drie nieuwe
tabellen geen enkel getal dat iets uitrekent.

## De vier beslissingen vooraf (Nicks antwoorden)

| Vraag | Antwoord |
|---|---|
| Hoe ziet een kamer eruit | **Een raster van plekken** — op slot (met prijs), leeg, of gevuld. Geen canvas |
| Waar komt de munt vandaan | **De Keeper geeft hem uit**, als regel in een grootboek |
| Hebben plekken soorten | **Ja** — muur, plank, bureau, kist; een voorwerp zegt welke het nodig heeft |
| Wie mag kijken | **De hele tafel** |

Meegenomen uit ronde 39 en even vast: een kamer hoort bij een **onderzoeker** en
gaat met hem mee; een plek wordt zowel geopend als gevuld; de munt heeft geen
naam in de code.

## Wat er gebouwd is, en waarom zo

### Drie tabellen, en de vierde is er met opzet niet

`rooms`, `room_slots`, `room_ledger` — en **geen voorwerpen-tabel**, want een
voorwerp is een **artikel**. Dat is de spiegel van §75's beslissing over het
overzicht, om de omgekeerde reden: een overzicht kreeg een eigen tabel omdat het
*niet* in het web, op een landkaart of in een dossier hoorde te staan; een
koperen lantaarn in je kamer hoort daar juist wél. Foto's, geheimhouding (§9),
een kant (§44), vermeldingen, zoeken en de prullenbak komen daarmee gratis.

Twee kolommen die er bewust níét zijn:

- **`rooms.deleted_at`.** Een kamer volgt zijn onderzoeker: de prullenbak van
  het artikel *is* die van de kamer. Twee vlaggen die uit de pas kunnen lopen
  zijn erger dan één.
- **`rooms.keeper_only`.** Een kant bestaat zodat één ding twee gezichten kan
  hebben; een kamer hangt aan een onderzoeker, en een Keeper draagt er nooit een
  (§18). Dezelfde vorm van uitzondering als §75's "een overzicht heeft geen
  Keeperversie" — en `loadAccessRow` moest het weten, want die vroeg de tabel om
  een kolom die er niet is en drizzle gooit dan al tijdens het bouwen van de
  SELECT.

### Het saldo is het grootboek

`SUM(delta)`, nergens opgeslagen. Een vergissing van de Keeper is een regel
erbij, nooit een regel die verandert — en daarmee is het uitgeefscherm niets
anders dan een lijst met een formulier eronder. Er staan tientallen rijen per
persoon in; een saldo-kolom "voor de snelheid" is hier een manier om twee
waarheden te krijgen.

### Eén klik, één aankoop

De controle zit **in** de schrijfactie: de UPDATE landt alleen
`WHERE unlocked_at IS NULL`. Een tweede klik — een dubbele tik, een herhaling na
een trage lijn, twee tabbladen — verandert nul rijen en koopt niets. Eerst lezen
en dan schrijven is de versie hiervan die op een drukke avond twee keer
afschrijft.

### Elke plek bestaat vanaf dag één

Twaalf, waarvan drie gratis. De rest staat op slot met een prijs erop, want een
kamer die alleen toont wat je al hebt geeft je niets om voor te sparen. De
ladder staat in `lib/kamers/shape.ts` en mag alleen **aangroeien**: een trede
herprijzen verandert stilletjes waar iemand voor spaarde, en ertussen schuiven
geeft iemands plank aan een andere trede. `syncShape` vult alleen aan.

### De sluier — §76's regel op een nieuwe plek

Een kamer is openbaar, en een voorwerp is een artikel dat geheim kan zijn. Een
plek met iets erop dat jij niet mag zien is daarom **gevuld en naamloos**: één
vaste zin, dezelfde of het nu §9's geheimhouding of §44's andere kant is. Nooit
leeg — een lege plek die in werkelijkheid vol is, is een leugen die de eigenaar
niet verteld heeft. En het verschil tussen twee redenen zou zelf het lek zijn,
precies zoals in het lijstje van ronde 39.

### De twee beloftes van ronde 39, ingelost

`canWatch`'s `case 'room'` zei `return false`; die vraagt nu hetzelfde als elke
andere soort. En `labelOfPlace` kreeg zijn `room`-tak, dus het lijstje zegt nu
*"Bram is in de kamer van Van Dijk"* — per kijker gepoort, gratis, omdat ronde
39 alles al door die poort had geleid. **Verder veranderde er niets in de live
laag**, en dat was het hele punt van reserveren.

## Wat er onderweg gevonden is

**1. Een vernietigd voorwerp liet een versluierde plek achter — voor altijd, ook
voor de Keeper.** `destroyFromTrash` ruimt elf tabellen op en kende de drie
nieuwe niet. `entry_id` wees dan naar niets, en omdat "een rij die niet
terugkomt is versluierd" precies de regel hierboven is, zei de plek *er ligt
iets* over iets dat niet bestond — niet te onderscheiden van een echt geheim.
Een bungelende verwijzing laat hier dus geen rommel achter, hij **bederft het
signaal**. Ook de andere kant: een vernietigde onderzoeker liet zijn kamer,
twaalf plekken en zijn grootboek als wezen achter.

**2. Twee antwoorden op "mag jij deze kamer inrichten?".** `canArrange` ging
langs `viewerCanEdit('room', …)`, wat bij een `private` knop `created_by === jij`
betekent — een kopie van "wie draagt deze onderzoeker", één keer opgeschreven.
Een karakter dat van hand wisselt is het gewoonste dat een Keeper doet (§18c), en
daarna zei één scherm tegelijk *Aagje woont hier* en *Bram mag het herschikken*,
en kon Bram haar munten uitgeven. Nu vraagt het de dragers-tabel, live, en
`created_by` wordt bijgewerkt zodat er geen tweede, verkeerd antwoord blijft
rondslingeren. De routekant van dezelfde fout (`/api/kamers/[id]/voorwerpen`
vroeg nog de kopie) is meegegaan.

**3. Een voorwerp was door geen mens te maken.** Dit is de belangrijkste, en
alleen de browser vond hem. De kamer vraagt om een *veld* met sleutel `plek` —
een goed ontwerp, want dan passen er later meer soorten in zonder code. Maar in
Beheer kun je de **sleutel** van een veld nergens zetten: een nieuw veld heet
altijd `veld_1`, `veld_2`. Dus was er geen enkele weg waarlangs iemand een
voorwerp kon maken, terwijl alle unittests groen stonden — die schrijven de rij
met SQL. Dat staat nu als les in `CLAUDE.md`: **een functie die alleen vanuit een
unittest bereikbaar is, bestaat niet.**

De eerste reparatie was fout en is teruggedraaid: een nieuwe soort *Voorwerpen*
aanmaken in de migratie. Het archief heeft er al een (`item`, die op het scherm
Voorwerpen heet, §24), dus dat gaf twee gelijknamige soorten in elke
nieuw-artikel-lijst en liet vier bestaande specs vallen. Wat er nu staat: de
soort die er al is krijgt het veld erbij — in `seed.mjs` voor een leeg archief
(de migratie draait daar vóór de seed en heeft dan niets te wijzigen) en in
migratie `0027` voor een archief dat al bestaat. Allebei herhaalbaar.

**4. De naam `roomSummary().total`** telde open plekken en niet alle plekken;
hij heet nu `open`, omdat het paneel "1 van 4 plekken gevuld" zegt en een plek op
slot daar niet bij hoort.

## Regels die niet gebroken mogen worden

1. **Geen kolom die rekent.** Rule 78. Wat een voorwerp doet is proza.
2. **Het saldo is de som van het grootboek.** Nooit een kolom, nooit bijgewerkt.
3. **De controle van een aankoop zit in de schrijfactie**, niet in een lezing
   ervoor.
4. **Een versluierde plek is gevuld en naamloos**, met één zin voor elke reden.
5. **Wie de onderzoeker draagt, richt de kamer in** — live gevraagd, nooit uit
   `created_by`.
6. **De ladder groeit alleen aan**, en wordt nooit hernummerd of herprijsd.
7. **Een voorwerp ligt op één plek in het hele archief.**
8. **Een paneel is een samenvatting met een deur** (§77, nog steeds).
9. **Weghalen geeft niets terug.** Een teruggave is een tweede economie.

## Bewust niet gedaan

Buffs die iets dóén. Ruilen of weggeven tussen spelers. Een winkel (de Keeper
maakt een voorwerp als artikel en geeft de munt; kiezen uit een catalogus is een
eigen ronde). Erfenis als een onderzoeker sterft. Een tweede munt. Iets op de
telefoon-tabbalk.

En één ding dat hierna zou moeten: **een sleutelvakje in `TypeEditor`**, zodat
een Keeper zelf een tweede soort kan maken die in een kamer past (Boeken,
Relikwieën). Zolang dat er niet is, is de geseede soort de enige weg — het
ontwerp in `shape.ts` is er al op gebouwd en kost niets extra.

## Getest

`tsc --noEmit` stil. **103 bestanden / 1716 unit tests** (ronde 39: 102 / 1654).
`npm run build` groen. Nieuw: `tests/unit/kamer.test.ts` (61, inclusief de drie
regressies hierboven) en `tests/e2e/kamer.spec.ts` (7: de Keeper geeft uit, een
plek wordt geopend en gevuld, de kiezer biedt alleen aan wat past, een andere
speler mag kijken en niets aanraken, de sluier, het paneel als deur, en de
telefoon).

Twee bestaande tests zijn bijgewerkt en allebei met de reden erboven:
`spelers-page.test.ts` (het geval dat "§78 is gereserveerd" vastlegde bewaakt nu
§77's regel dat een paneel geen knoppen draagt) en `aanwezig.spec.ts` (dezelfde
verschuiving, in de browser).

## Uitrollen

`git pull && bash scripts/deploy.sh`. **Migratie `0027_kamers` draait bij het
starten** en voegt het veld *Plek* toe aan de soort Voorwerpen. Geen
npm-wijzigingen, geen nginx-wijzigingen. Lokaal `rm -rf .next` voor een
`npm run dev`: er is een stylesheet bij.

Daarna is de weg: maak een voorwerp (soort **Voorwerpen**, in een dossier — §24),
zet zijn veld *Plek* op muur, plank, bureau of kist, geef jezelf als Keeper wat
munten op `/kamer/<slug-van-de-onderzoeker>`, en zet het neer.
