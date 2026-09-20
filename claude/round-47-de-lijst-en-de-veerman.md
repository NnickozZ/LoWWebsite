# Ronde 47 — De lijst en de veerman

Nick, ronde 47:

> *"Can we get the coin give page better with a search function? Get all
> characters unticked and then we can search. There will be more then 50
> characters in this thing and coins belong to a character. Also right now you
> can only give to a character that is currently being used but I want it to be
> also be possible to those that are not online or not in use."*

Geen migratie. Eén veld erbij op een leesfunctie, één nieuwe route, en een
uitzondering op §79 die als **handeling** gebouwd is en niet als regel.

---

## Wat er vooraf uitgezocht is

De derde vraag bleek er twee te zijn, en dat verschil bepaalde de hele ronde.

**"Alleen aan een karakter dat op dit moment gebruikt wordt" was niet waar.**
`handOutTargets` leest `user_characters` — élk karakter dat een account
*houdt*. Niet het actieve karakter, en niets met online-zijn te maken: wie er
drie draagt had altijd al drie rijen op `/uitdelen`, of hij nu ingelogd was of
niet. Nick had gelijk dat het zo *aanvoelde*, en hij had gelijk om erover te
klagen — want niets op het scherm zei het. Achter elke naam stond alleen de
speler, dus een lijst van vijf spelers met acht karakters las als vijf spelers
die toevallig acht regels vulden.

**Wat wél niet kon** is een karakter dat aan géén enkel account hangt: een
figuur die de Keeper geschreven heeft en nog niet uitgedeeld, een onderzoeker
die klaarligt. Die heeft geen kamer, want `getOrCreateRoom` weigert zonder
drager — §17/§18: een karakter is een naam die iemand draagt, en de kamer gaat
met hem mee.

Op de vraag welke artikelen dan wél een kamer mogen hebben koos Nick: **alleen
als jij er één opent.** Geen soort die automatisch een beurs krijgt, geen
artikel dat er een krijgt doordat iemand ernaar kijkt. Dat is de smalst
mogelijke uitzondering en het is de juiste — zie hieronder waarom de ruimere
variant bijna niet te bouwen was zonder het archief vol beurzen te zetten.

En op de vraag wat het globale bedrag moet doen nu er niets meer aanstaat:
**alleen de aangevinkte rijen.**

---

## Wat er gebouwd is

### 1. De lijst begint leeg, en je zoekt erin

Bij twaalf rijen is "alles staat aan" een gemak. Bij zestig is het een val: je
raakt er vijf aan, drukt op Uitdelen, en vijfenvijftig mensen die er niet bij
waren krijgen munten. Dus staat er niets aan bij het openen, en is er een
zoekvak dat op **de naam van de onderzoeker én die van de speler** filtert —
je zoekt het ene even vaak als het andere.

Daarnaast een telling (*3 van 57 aangevinkt*) die over de héle lijst gaat en
niet over wat het filter toont: het getal dat je wilt weten is juist wat er
búiten beeld nog aanstaat.

En *Alles in beeld*, dat precies aanvinkt wat het filter op dat moment laat
zien. Dat is geen extraatje: §83's oorspronkelijke vraag was *"iedereen krijgt
x munten omdat ze samen wat gedaan hebben"*, en zonder deze knop kost dat met
een lege lijst zestig tikken. Zoek niets en hij vinkt iedereen aan; zoek een
familienaam en hij vinkt die familie aan.

### 2. Het globale bedrag raakt alleen wat aanstaat

Dit is de keuze die de rest bij elkaar houdt. Zou *Voor wie je aanvinkt* elk
bedrag vullen, dan had een lijst van zestig met vijf vinkjes vijfenvijftig
ingevulde bedragen die niets doen — tot de dag dat iemand een zesde vinkje zet
en er ineens een getal in blijkt te staan dat hij nooit getypt heeft.

Het vinkje is *wie*, het bedrag is *hoeveel*, en het globale vak hoort bij het
tweede. Een rij die je later aanvinkt krijgt het globale bedrag er alsnog bij,
want anders zou de volgorde van je handelingen bepalen wat er gebeurt — en dat
is precies de val die dit moest sluiten.

Het vak heet daarom niet meer *Voor iedereen*. Dat was het één ronde lang, en
het was niet meer waar.

### 3. De rij zegt wat voor onderzoeker het is

Achter elke naam staat nu wie hem draagt, **en of hij hem speelt**:

| | |
|---|---|
| `Demo Onderzoeker` | `Speler Demo` |
| `Tweede Onderzoeker` | `Speler Demo · niet in gebruik` |
| `De veerman` | `niemand draagt deze` |

Dat is het hele antwoord op Nicks derde vraag voor zover die over bestaande
karakters ging. Het antwoord bestond al; het had alleen geen woorden.

### 4. De veerman — een kamer die de Keeper opent

Op het artikel van een onderzoeker die niemand draagt staat voor de Keeper één
knop: **Een kamer geven**. Daarna staat op diezelfde regel de beurs en de deur
ernaartoe, en is de knop weg omdat hij niets meer te doen heeft.

Drie dingen die daaruit volgen en die apart opgeschreven staan:

- **Het is een handeling, geen bijwerking van een lezing.** `getOrCreateRoom`
  maakt een kamer wél op een *read*, en dat is daar goed. Hier kan dat niet:
  sinds §85 leest `roomSummary` op **elk** artikel of er een kamer is, dus een
  versoepeling van die functie had het hele archief een beurs gegeven zodra
  iemand een artikel opensloeg. `roomIdFor` leest en maakt niets; de knop
  schrijft.
- **Hij wordt dicht geboren** (§48: een nieuw ding wordt geboren op de kant
  waar het gemaakt is). Een kamer die vanzelf ontstaat is van een speler en
  staat open; deze is van de Keeper en staat privé tot hij hem opendraait.
  Anders leest de tafel morgen wat er in de kist ligt van een figuur die ze nog
  niet ontmoet hebben.
- **Alleen de Keeper richt hem in.** `canArrangeRoom` vraagt `ownerOf`, dat
  null geeft, dus er is geen tweede hand — precies goed voor een figuur die
  niemand speelt. Koppelt de Keeper hem later aan een speler, dan is het gewoon
  diens kamer met wat erin lag, en dat is de bedoeling van een onderzoeker die
  klaarligt.

---

## De fouten die onderweg gevonden zijn

**Vier, en drie ervan vond een screenshot of de browser.** (Plus drie
bestaande e2e-zaken die de omkering van het globale bedrag nog niet kenden —
geen fouten, maar ze hoorden wel een reden te krijgen.)

1. **De kamer bestond en geen enkele lezer zag hem.** Dit is de ergste, en het
   is §83's les voor de derde keer. `getOrCreateRoom` stelde de dragervraag
   **vóór** de opzoeking:

   ```ts
   const owner = ownerOf(entryId);
   if (!owner) return null;          // ← hier
   const existing = db.select(…)…
   ```

   Vier rondes lang was dat hetzelfde antwoord, want zonder drager bestond er
   toch geen kamer. Zodra §86 er één kon openen werd die volgorde een stil lek:
   de kamer stond in `rooms`, de uitdeler vond hem (die leest `rooms`), en élke
   andere lezer — `roomSummary`, `viewRoomBySlug`, de deur op het artikel —
   zei dat er geen was. Je drukte op de knop en er gebeurde zichtbaar niets.

   De drager beslist nu of er een kamer *gemaakt* wordt, niet of er één
   *gevonden* wordt. En de unit-test die ik ervoor geschreven had, vroeg
   `roomIdFor` — dus keek precies langs de kapotte functie heen. De e2e-zaak
   die de knop indrukt en daarna kijkt of er iets veranderd is, vond hem in één
   run.

2. **Het raakvlak dat het vaakst aangeraakt wordt, was 25 px.** Het `<label>`
   om een vinkje op `/uitdelen`. §84 schreef "meet elke knop, houd geen lijstje
   bij", en §85 en §86 vonden allebei iets doordat die zaak élke `.btn` opmeet
   — en toch liep hij hier langs, want een `<label>` is geen knop en geen
   invoervak. **Het lijstje van *soorten* is ook een lijstje.** De zaak meet nu
   `.btn, input, label:has(input[type="checkbox"])`.

3. **Elke lege rij las als een nul.** De bedragvakjes hadden
   `placeholder="0"`, dus een lijst van zestig lege rijen stond vol nullen die
   niemand getypt had — exact de fout die ronde 45 één kolom verderop uit het
   globale vak haalde ("geen '3' dat op een waarde lijkt"). Dezelfde fout, twee
   rondes later, twintig centimeter naar rechts.

4. **De lijst kreeg een eigen schuifvenster en dat was verkeerd.** 26rem hoog,
   zodat het zoekvak in beeld bleef — en met zestig rijen sneed dat de onderste
   rij halverwege af, pal tegen de plakkende voet aan. Een halve rij leest als
   kapot, niet als "er is meer". De pagina scrollt nu zelf; de voet plakt al,
   en na een zoekactie is de lijst toch kort.

En één ding dat geen fout was maar wel sleet: de lege staat zei *"Er draagt nog
niemand een onderzoeker"*, en dat is sinds deze ronde niet meer de enige manier
om aan een kamer te komen. Hij noemt nu allebei de wegen.

---

## Regels die niet gebroken zijn

1. **Rule 78.** Het lopende totaal is een echo van de vakjes die je zelf net
   ingevuld hebt. Er wordt nergens iets over het archief opgeteld.
2. **§79.** Een kamer hangt nog steeds aan een artikel en aan niets anders, en
   het saldo is nog steeds de som van het grootboek. Wat erbij kwam is niet een
   tweede soort kamer maar een tweede manier om er één te laten ontstaan.
3. **§48.** De nieuwe kamer wordt geboren op de kant waar hij gemaakt is.
4. **§80.** De knop is absent voor wie er niet op mag drukken, en `openRoomFor`
   weigert iedereen behalve de Keeper — het slot én de gleuf.
5. **§11.** Elf nieuwe woordsleutels, nul letterlijke zinnen in de scope.
6. **§59.** De uitdeler houdt de refresh nu ook vast zolang er iets aangevinkt
   staat of er in het zoekvak getypt is, niet alleen bij een half ingevuld
   bedrag.
7. **§69 6.1.** Alles wat een vinger raakt haalt 44 px — inclusief het label
   dat dat deze ronde niet deed.
8. **Geen migratie.** `rooms.created_by` was al `nullable`, en er is geen kolom
   bij gekomen.

---

## Wat er bewust niet in zit

- **Een soort die automatisch een kamer krijgt.** Dat was een van de opties en
  Nick koos hem niet, en dat is maar goed ook: elke persoon in het archief zou
  een beurs krijgen, inclusief een dode kapitein uit 1890.
- **Een kolom met het saldo in de hal.** Hij zou passen en hij zou §76 breken:
  het beursblok toont alleen je eigen saldo, nooit dat van een ander.
- **Een manier om een kamer weer te sluiten.** Een kamer die geopend is blijft
  bestaan; er is geen knop die hem weghaalt. Dat kan later, en het hoort dan bij
  de prullenbak en niet bij een knop op een artikel.
- **Sjablonen in de uitdeler** ("deze vijf, elke sessie"). Met zoeken en *Alles
  in beeld* is dat een handeling van drie tikken geworden.

---

## Wat er getest is

- `npx tsc --noEmit` stil, ook over `tests/e2e`.
- `npx vitest run` — **1925 tests** over 107 bestanden (was 1914).
- `npm run build` schoon.
- `npx playwright test` — de volledige suite, desktop én telefoon: **436
  geslaagd**. Zes rode in die run, en ze vallen in drie soorten: één bekende
  (`per-place-crops.spec.ts:13`, §8, sinds ronde 19); twee flakes die alleen
  gedraaid groen zijn (`phase3-keeper-tools:345` en `live-everywhere:49` op de
  telefoon — de §6-race, allebei nagedraaid); en drie van deze ronde, in
  `uitdelen.spec.ts`, die aannamen dat élke rij aangevinkt begon. Die drie
  dragen nu een comment dat zegt wat §86 omkeerde en waarom, en het bestand is
  daarna 9 van de 9 groen. `kamer-ux.spec.ts` is 18 van de 18.
- **`tests/unit/uitdelen.test.ts`** kreeg elf zaken erbij, in twee blokken: de
  kamer die de Keeper opent (niemand anders mag het, kijken maakt er geen, hij
  wordt dicht geboren, élke lezer vindt hem, hij neemt munten aan) en het
  karakter dat gehouden maar niet gespeeld wordt.
- **`tests/e2e/kamer-ux.spec.ts`** kreeg vier zaken erbij, genummerd 13 tot en
  met 16 in de docblock erboven — waaronder die ene die alles meet wat een
  vinger raakt in plaats van alles wat een knop is.

---

## De uitrol

Geen migratie, geen schemawijziging, geen verwijderd bestand. `npm run build`
en herstarten is genoeg.
