# Ronde 41 — huisraad, de catalogus en wat je kamer je geeft (§80)

19 september 2026. Gebouwd op `main` bij `6d3abf8` (ronde 40). **Eén migratie**
(`0028_huisraad`), geen nieuwe afhankelijkheden, **27 bestanden** (22 gewijzigd,
5 nieuw), **niets verwijderd**. Twee bouwagents parallel (de schermen, de
unittests), daarna een derde voor de browsertests. Alle drie vonden iets, en twee
van hen vonden onafhankelijk van elkaar hetzelfde.

## Wat Nick vroeg

> *"Voorwerpen krijgen nu ineens nieuwe context. Maar ik heb nieuwe artikelen
> nodig die alleen Keepers kunnen toevoegen en die gameplay dingen hebben als ze
> geplaatst worden in de kamer. Niet voorwerpen kapen, maar een nieuw ding."*

Een **voorwerp** blijft dus wat §24 ervan maakte: gevonden tijdens een
onderzoek, verhalend, uniek. **Huisraad** is het mechanische ding ernaast.

## De vier beslissingen vooraf (Nicks antwoorden)

| Vraag | Antwoord |
|---|---|
| Naam | **Huisraad** (Nick zelf; één *stuk huisraad*, meerdere *huisraad*) |
| Wat "gameplay" betekent | **Effectregels, samen getoond.** Het archief somt op, rekent niet |
| Hoe het in een kamer komt | **Een catalogus** waar spelers met munten uit kopen |
| Waar het woont | **Een artikel van een eigen soort**, met een nieuwe vlag op soorten |

## Wat er gebouwd is, en waarom zo

### De kamer vraagt naar het veld, niet naar de soort

Dat was al zo in §79 en het is nu pas de moeite waard: huisraad draagt hetzelfde
veld `plek` als een voorwerp, en past dáárom in een kamer **zonder één regel te
veranderen aan ronde 40**. De prijs (`prijs`) en de effectregels (`effect`) zijn
op dezelfde manier velden op het artikel. Wie er straks *Boeken* naast wil, geeft
die soort dezelfde drie velden en klaar.

### Twee vlaggen op een soort

**`keeper_made`** — alleen een Keeper maakt hier nieuwe artikelen van. Nadrukkelijk
níét §44's `keeper_only`, dat op een *artikel* staat en over een kant gaat. Twee
bijna gelijke namen op twee niveaus, dus het verschil staat in de schemacomment,
in de README en in `CLAUDE.md`.

**`one_of_a_kind`** — de subtiele, en de enige plek waar dit stilletjes mis had
kunnen gaan. §79 hield één voorwerp op één plek in het hele archief met een
unieke index. Huisraad is het omgekeerde. De verleiding is om die index weg te
halen en er een controle voor terug te zetten die iemand vergeet; in plaats
daarvan verhuisde hij naar **`room_slots.claim`**, die alleen gevuld wordt als de
soort uniek is. Het schema zegt het dus nog steeds, en alleen over de dingen
waarover het waar is.

### Effectregels, en geen enkel getal

Eén effect per regel in een `longtext`; de kamer zet ze onder elkaar onder *Wat
deze kamer je geeft*. Geen totaal, geen som, geen volgorde die iets betekent.
Zodra er een `bonus: number` in de database staat is optellen een kwestie van
tijd, en dan is rule 78 gepasseerd. **En een versluierd ding draagt niets bij** —
anders lekt §76's sluier alsnog: "er ligt iets" op de plek, en drie regels
eronder staat wat het doet.

### Kopen

`buyFurnishing` is de eerste schrijver van een grootboekregel die sinds §79
bestond en nooit gebruikt werd (`kind: 'item'`, met het artikel erbij). Dezelfde
discipline als het openen van een plek: het saldo wordt *in* de transactie
gelezen en de voorwaarde dat de plek leeg is staat in de UPDATE zelf, dus twee
klikken kopen één stoel.

De catalogus laat staan wat te duur is, met de prijs erbij en een knop die niet
kan — sparen begint bij zien waarvoor. En de Keeper heeft die weg niet nodig: hij
legt iets neer met `placeItem`, wat niets kost en geen regel schrijft. Verdiend
en gekocht zijn twee zichtbaar verschillende dingen.

### Het sleutelvakje — de val van ronde 40 dicht

§79 moest zijn soort seeden omdat een veld nergens een *sleutel* kon krijgen: een
nieuw veld heette altijd `veld_1`. Nu heeft een veld dat in díé bewerking nieuw
is een sleutelvakje, voorgevuld vanuit het label; de sleutel van een bestaand
veld staat er als tekst en is nooit te wijzigen, want hernoemen zou elke al
opgeslagen waarde wees maken. Daarmee kan Nick zelf een soort maken die in een
kamer past, en dat is het verschil tussen een functie die van hem is en een die
van de ontwikkelaar blijft. De browsertest van deze ronde bevat dan ook **geen
regel SQL meer**, waar die van ronde 40 er nog een nodig had.

## Wat er onderweg gevonden is

**1. "Te koop" was vijf dingen en de koopfunctie vroeg er vier.** `catalogueFor`
biedt alleen aan wat keeper-made, geprijsd, passend, zichtbaar en vrij is;
`buyFurnishing` vroeg alles behalve de eerste. Met een id in de hand kon je dus
munten betalen voor een *voorwerp* waar toevallig een prijs op stond — gevonden
in het spel, uniek, en precies het ding dat deze ronde niet zou kapen. Twee
reviewers vonden het los van elkaar, wat meestal is hoe een ontbrekende
voorwaarde eruitziet. §17's regel 4 in zijn makkelijkst te vergeten vorm: een
lezer gebruikt de SQL-voorwaarde, een schrijver de boolean, en het moeten er
evenveel zijn.

**2. Het slot zat aan de binnenkant van de deur.** `createEntry` weigerde een
`keeper_made` soort netjes — maar de nieuw-artikel-lijst bood *Huisraad* gewoon
aan elke speler aan. Die typte een naam, drukte op Aanmaken en werd terechtgewezen
voor iets wat hem was voorgehouden. Erger nog: er stond al een comment in
`lib/entries/service.ts` die beweerde dat het scherm zijn helft deed. Unittests
zien dat niet; de browser vond het in één run. Staat nu als les in `CLAUDE.md`.

**3. Een kolom op zes tabellen tegelijk.** Bij het toevoegen van de twee vlaggen
belandden ze door één te brede vervanging óók op `sections`, `pins` en vier
andere tabellen met een `sort_order`. 86 tests vielen om met *"table sections has
no column named keeper_made"*. Binnen twee minuten gevonden en teruggedraaid —
het staat hier omdat het precies het soort fout is dat een groene unittestsuite
meteen vangt, en dat is waarom de baseline vóór het bouwen gedraaid wordt.

## Regels die niet gebroken mogen worden

1. **Rule 78 blijft.** Effectregels worden getoond, nooit opgeteld.
2. **`keeper_made` (soort) is niet `keeper_only` (artikel, §44).**
3. **Geldt op twee plekken**: het scherm laat de soort weg, en de server weigert.
4. **De unieke index blijft**, verhuisd naar `claim`. Uniek-zijn is een
   eigenschap van de soort.
5. **Een versluierd ding draagt geen effectregel bij** (§76).
6. **"Te koop" is vijf voorwaarden**, en lezer en schrijver vragen dezelfde.
7. **Een bestaand veld verandert nooit van sleutel.**
8. **Cadeau doen blijft gratis** en schrijft geen grootboekregel.

## Bewust niet gedaan

Ladingen en "gebruikt deze sessie" — Nick koos de eenvoudige vorm, en die staat
er dus niet alvast in. Terugverkopen. Ruilen tussen spelers. Huisraad dat ander
huisraad vereist of uitsluit. Een tweede munt.

## Getest

`tsc --noEmit` stil. **104 bestanden / 1768 unit tests** (ronde 40: 103 / 1716).
`npm run build` groen. Nieuw: `tests/unit/huisraad.test.ts` (52, inclusief de
regressie op bevinding 1) en `tests/e2e/huisraad.spec.ts` (7 gevallen, waarvan er
één — de nieuw-artikel-lijst — bij het schrijven rood stond en bevinding 2 was).

Twee bestaande assertions in `tests/unit/kamer.test.ts` zijn bijgewerkt: de zin
*"Dat is geen voorwerp"* klopte niet meer zodra er ook huisraad bestond, en heet
nu *"Dat hoort nergens in een kamer"*. De regel eronder is dezelfde.

## Uitrollen

`git pull && bash scripts/deploy.sh`. **Migratie `0028_huisraad`** draait bij het
starten: twee kolommen op `entry_types`, de `claim`-kolom op `room_slots` met de
verhuisde index, en de soort *Huisraad*. Geen npm-wijzigingen, geen
nginx-wijzigingen.

Daarna: maak als Keeper een stuk huisraad (`/wiki/huisraad` → Nieuw), zet Plek,
Prijs en een paar regels bij *Wat het geeft*, en het staat in de catalogus van
elke kamer met een passende open plek.
