# Prompt — ronde 41: huisraad, de catalogus en wat je kamer je geeft

**Claims §80.** Repository `D:\LoWWebsite` → github.com/NnickozZ/LoWWebsite (`main`).
Gebouwd bovenop ronde 40 (§79, de kamer).

## Read first, before writing anything

`CLAUDE.md` (§1, §3, §5, §6), dan **`README.md` rules 78 en 79** — 78 is de grens
waarbinnen dit gebouwd wordt en 79 is de kamer waar het in komt. Dan
`claude/round-40-de-kamer.md` (vooral "Wat er onderweg gevonden is" — drie van de
vier vallen daar gelden hier weer) en `claude/round-39-aanwezig.md` voor §76's
regel over wat je niet mag noemen.

Dan de code: `lib/kamers/service.ts` en `lib/kamers/shape.ts` (elke docblock),
`lib/db/schema.ts` (`entryTypes`, `rooms`, `roomSlots`, `roomLedger`),
`lib/db/seed.mjs` (hoe een soort geseed wordt, en de soort `item`),
`components/admin/TypeEditor.tsx`, `lib/fieldKinds.ts`, en
`app/(app)/kamer/[slug]/page.tsx` met `components/kamer/**`.

## Wat Nick vroeg

> *"Voorwerpen krijgen nu ineens nieuwe context. Maar ik heb nieuwe artikelen
> nodig die alleen Keepers kunnen toevoegen en die gameplay dingen hebben als ze
> geplaatst worden in de kamer. Niet voorwerpen kapen, maar een nieuw ding."*

Dus: **huisraad**. Een *voorwerp* blijft wat §24 ervan maakte — gevonden tijdens
een onderzoek, narratief, uniek. **Huisraad** is het mechanische ding dat je
kamer inricht: alleen de Keeper maakt het, het heeft een prijs, en het zegt wat
het je geeft.

Eén stuk huisraad, meerdere huisraad — het woord heeft geen meervoud, en de
woordenlijst moet dat aankunnen (`furnishing` / `furnishingPlural` met dezelfde
waarde is prima; de zin eromheen moet het dragen, niet het woord).

## De vier beslissingen (Nicks antwoorden). Niet heropenen.

| Vraag | Antwoord |
|---|---|
| Naam | **Huisraad** |
| Wat "gameplay" betekent | **Effectregels, samen getoond.** Het archief somt op; het rekent niets uit en beslist niets |
| Hoe het in een kamer komt | **Een catalogus** waar spelers met munten uit kopen |
| Waar het woont | **Een artikel van een eigen soort**, met een nieuwe vlag op soorten: alleen de Keeper maakt deze |

## Het model

### Twee vlaggen op `entry_types` — en let op de naam van de eerste

```
keeper_made   INTEGER NOT NULL DEFAULT 0
one_of_a_kind INTEGER NOT NULL DEFAULT 0
```

**`keeper_made` is níét `keeper_only`.** Die naam is al bezet: §44's
`keeper_only` staat op een *artikel* en betekent "dit staat op de Keeperkant".
Deze staat op een *soort* en betekent "alleen een Keeper maakt hier nieuwe
artikelen van". Twee dingen met bijna dezelfde naam op twee niveaus is precies
hoe iemand over een half jaar de verkeerde leest; schrijf het verschil in de
schemacomment en in `CLAUDE.md`.

Het moet op **beide** plekken gelden: de soort staat niet in de
nieuw-artikel-lijst van een speler, én de server weigert het (`createEntry`).
Alleen het scherm is een slot op de deur dat aan de buitenkant zit.

**`one_of_a_kind` is de subtiele.** §79 legde vast dat één voorwerp op één plek
in het hele archief ligt, met een unieke index die dat afdwingt — een lantaarn is
één ding in de wereld. Huisraad is het omgekeerde: twee onderzoekers mogen
allebei dezelfde leesstoel kopen. Dat is geen uitzondering die je in code
erbij zet, het is een eigenschap van de *soort*.

**Haal die index niet weg.** Wat er in plaats daarvan komt: `room_slots` krijgt
een kolom `claim`, en de unieke index verhuist ernaartoe. Bij het neerzetten
schrijft de service `claim = entry_id` als de soort `one_of_a_kind` is, en
`claim = NULL` als hij dat niet is. De garantie blijft dus in het schema staan
waar hij hoort, en de reden staat in één comment. Voorwerpen (`item`) worden
`one_of_a_kind = 1`; huisraad `0`.

### De soort *Huisraad*

Geseed, met drie velden — en ze moeten **in de seed én in de migratie** staan,
om precies de reden die ronde 40 ontdekte: de migratie draait op een leeg
archief vóór de seed en heeft daar niets te wijzigen, en op Nicks archief is het
andersom. Allebei herhaalbaar maken (`WHERE ... NOT LIKE '%"key":"..."%'`).

| veld | sleutel | soort | waarvoor |
|---|---|---|---|
| Plek | `plek` | select (muur, plank, bureau, kist) | **Dezelfde sleutel als §79.** Niet een nieuwe: de kamer vraagt naar dit veld en niet naar de soort, en dat is precies waarom huisraad er zonder nieuwe code in past |
| Prijs | `prijs` | number | Wat het in de catalogus kost. Leeg of 0 = niet te koop (die geef jij) |
| Wat het geeft | `effect` | longtext | **Eén effect per regel.** Geen nieuw veldsoort, geen parser: de Keeper typt regels, de kamer toont ze als lijst |

Een `longtext` met één regel per effect is met opzet gekozen boven iets
gestructureerders. Zodra er een veld `bonus: number` staat, is de verleiding om
te gaan optellen een kwestie van tijd, en dat is rule 78 over de grens. Regels
tekst kunnen alleen getoond worden.

### Het kopen

`buyFurnishing(slotId, entryId, viewer)` in `lib/kamers/service.ts`, en het is de
eerste schrijver van iets dat er al ligt: **`room_ledger.kind = 'item'` en de
kolom `entry_id` bestaan sinds §79 en niets schreef ze ooit.**

Dezelfde discipline als `unlockSlot`, en om dezelfde reden:

- één transactie, saldo gelezen *in* die transactie;
- de plek moet open zijn en leeg, en dat is een voorwaarde van de UPDATE (twee
  klikken kopen één stoel);
- weigert als `balance < prijs`, als de soort niet `keeper_made` is, als het
  artikel niet zichtbaar is voor de koper, als de plek-soort niet klopt, en als
  `one_of_a_kind` er al ergens ligt;
- `prijs` ontbreekt of is 0 → niet te koop, en dat is een weigering met een
  eigen zin ("Dat staat niet te koop").

De Keeper mag nog steeds gewoon `placeItem` gebruiken om iets cadeau te doen —
dat kost niets en schrijft geen grootboekregel. Die twee wegen naast elkaar zijn
het verschil tussen *verdiend* en *gekocht*, en allebei moeten bestaan.

### De catalogus

Op `/kamer/<slug>`, bij een open en lege plek: de lijst van huisraad dat op díé
soort plek past, met prijs, zichtbaar door de ogen van wie kijkt
(`visibleEntryCondition`). Wat te duur is staat er wél in, grijs en met de prijs
— sparen begint bij zien wat er te sparen valt. Bouw het op de bestaande kiezer
(`components/kamer/PlaceButton.tsx` en `app/api/kamers/[id]/voorwerpen/route.ts`);
dit is een tweede tabblad in hetzelfde blad, geen tweede scherm.

### Wat deze kamer je geeft

Onder het raster: één lijst met de effectregels van alles wat er ligt, elk met de
naam van het ding erbij. Dat is de hele "gameplay" — aan tafel kijk je één keer
en je weet het.

**En het volgt §76.** Een ding dat jij niet mag zien draagt hier niets bij: geen
regel, geen naam, geen aantal. Anders lekt de sluier alsnog — "er ligt iets" op
de plek, en drie regels eronder staat wat het doet.

## De vierde val van ronde 40, nu dichtgooien

Ronde 40 ontdekte dat een Keeper de **sleutel** van een veld nergens kan zetten:
een nieuw veld heet altijd `veld_1`. Daardoor was §79 alleen bereikbaar via een
geseede soort, en zou §80 dat ook zijn.

**Bouw het sleutelvakje.** In `components/admin/TypeEditor.tsx`, en met de ene
voorzichtigheid die het nodig heeft: alleen een veld dat in deze bewerking
**nieuw** is mag zijn sleutel nog krijgen. Een bestaand veld hernoemen zou elke
al ingevulde waarde in `entries.fields` wezen maken. Toon de sleutel van een
bestaand veld dus als tekst, niet als invoer, met één zin die zegt waarom.

Daarmee kan Nick zelf *Boeken* of *Relikwieën* maken die in een kamer passen, en
dat is het verschil tussen een functie die van hem is en een die van de
ontwikkelaar blijft.

## Regels die niet gebroken mogen worden

1. **Rule 78 blijft.** Effectregels worden getoond, nooit opgeteld, nooit
   toegepast. Geen kolom die rekent.
2. **`keeper_made` (soort) is niet `keeper_only` (artikel, §44).**
3. **De unieke index blijft**, verhuisd naar `claim`. Voorwerpen zijn uniek,
   huisraad niet, en dat is een eigenschap van de soort.
4. **Een versluierd ding draagt niets bij** aan de lijst eronder (§76).
5. **De controle van een aankoop zit in de schrijfactie** (§79), niet in een
   lezing ervoor.
6. **Het saldo blijft de som van het grootboek.** Kopen schrijft een regel met
   `kind: 'item'` en het artikel erbij.
7. **Een bestaand veld verandert nooit van sleutel.**
8. **Cadeau doen blijft gratis** en schrijft geen regel.

## Bewust buiten scope

Ladingen en "gebruikt deze sessie" (Nick koos bewust de eenvoudige vorm — zet het
er niet alvast in). Terugverkopen. Ruilen tussen spelers. Huisraad dat andere
huisraad uitsluit of vereist. Een tweede munt. Iets op de telefoon-tabbalk.

## Wat "groen" betekent

- `tsc --noEmit` stil, `npm run build` schoon, volledige Playwright desktop +
  telefoon (`per-place-crops.spec.ts:13` staat rood op onaangeraakte `main` sinds
  ronde 19 — die is verwacht).
- **Unit** `tests/unit/huisraad.test.ts`, in de discipline van `access.test.ts`
  en `kamer.test.ts` — **elke rechtenassertie vanaf de kant van wie niet mag**:
  een speler die een `keeper_made` artikel probeert te maken (scherm én server);
  kopen zonder genoeg munten, twee keer klikken, iets dat niet te koop staat,
  verkeerde plek-soort, een artikel dat de koper niet mag zien; twee
  onderzoekers die hetzelfde huisraad kopen (mag) tegenover twee die hetzelfde
  voorwerp neerleggen (mag niet); de `claim`-kolom die precies bij
  `one_of_a_kind` gevuld is; en de effectenlijst die van een versluierd ding
  niets toont — vergeleken met de lijst van wie het wél mag zien.
- **e2e** `tests/e2e/huisraad.spec.ts`: de Keeper maakt een stuk huisraad met
  prijs en effectregels; een speler ziet het in de catalogus, kan het te duur
  niet kopen, krijgt munten, koopt het, en de effectregel staat onder het raster;
  een tweede speler koopt hetzelfde stuk en dat mag; een speler ziet de soort
  niet in zijn nieuw-artikel-lijst. Eén telefoongeval voor de catalogus.
- De migratie draait op een leeg archief **en** op een kopie van het echte.

## Als het af is

Schrijf `claude/round-41-huisraad.md` in de huisstijl: wat er gevraagd is, de
beslissingen vooraf, wat er gebouwd is en waarom zó, de fouten die onderweg
gevonden zijn, de regels die niet gebroken mogen worden, wat er bewust niet in
zit, wat er getest is, en de uitrolregel (deze heeft een migratie). Voeg **rule
80** toe aan `README.md` in dezelfde stem als 76–79, en de §5-verwijzing in
`CLAUDE.md`.
