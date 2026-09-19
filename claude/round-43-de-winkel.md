# Ronde 43 — de winkel (§82)

19–20 september 2026. Gebouwd op ronde 42 (§81). **Geen migratie**, geen nieuwe
afhankelijkheden, **13 bestanden**, niets verwijderd. Eén pagina, één
servicefunctie — en twee reparaties die alleen een echte hand kon vinden.

## Wat Nick vroeg

> *"So now what is left for this? Is there a shop?"* … *"Can we get something
> browseable, something that shows all the things you can buy?"*

Er wás een winkel, maar je moest hem verdienen: §80 zette de catalogus ín de
plek-kiezer. Dat beantwoordt de goede vraag op het goede moment — *wat past er
op déze plank* — en het is de verkeerde vraag voor wat een speler tussen twee
sessies doet. **Je kunt niet sparen voor wat je niet kunt zien.**

## De drie beslissingen, zonder te vragen genomen

Het was half twaalf 's avonds en de vraag was klein genoeg om niet met vier
keuzeschermen te beantwoorden. Genomen en opgeschreven in plaats van gevraagd:

| Vraag | Keuze |
|---|---|
| Waar | **Een eigen pagina**, `/winkel` — geen tab die je moet vinden |
| Wat | **Alles wat je mag zien**, ook wat je niet kunt betalen, met de prijs erbij |
| Kopen | **Ja, vanuit de winkel** — het landt in je eerste vrije plek van die soort |

## Wat er gebouwd is

**`shopFor(viewer, roomId)`** geeft de beurzen van deze persoon (één per
onderzoeker die hij draagt), en elk ding met vier vlaggen: `owned`,
`takenElsewhere`, `landsIn` (de plek waar het zou landen, of niets) en
`affordable`. De pagina groepeert per soort plek, binnen een groep goedkoopste
eerst.

**Kopen is een gemak, geen tweede weg.** De knop zoekt `landsIn` en koopt daar,
maar de aankoop gaat door `buyFurnishing` met alle vijf zijn voorwaarden. Een
winkel die iets kan kopen wat de kamer zou weigeren is een winkel die liegt —
en daarom staat er ook geen knop op een rij die `takenElsewhere` draagt, ook al
heb je de munten en een vrije plank. Dat laatste is precies het gat dat de
testagent aanwees voordat het er een kon worden.

**Eén beurs per onderzoeker.** Twee dragen betekent bovenaan kiezen voor wie je
koopt (`?kamer=`, dus deelbaar en met een werkende Terug-knop), en de twee
beurzen raken elkaar nooit. De Keeper draagt niemand (§18) en leest een
prijslijst zonder knoppen. **Iemand die nog geen onderzoeker draagt krijgt een
andere zin dan de Keeper** — die van hem zegt dat hij dingen zelf neerzet, en
dat is voor een speler zonder kamer niet waar. Eén woord erbij, en de twee
situaties zijn niet meer dezelfde.

## Wat er onderweg gevonden is — allebei door de browser

Twee dingen, allebei §17's regel 4 (*een lezer gebruikt de SQL-voorwaarde, een
schrijver de boolean*) met tijd ertussen, en allebei onzichtbaar voor een groene
unittestsuite omdat geen enkele test de soort ópsloeg of de vlag omzette.

**1. De soort *Huisraad* was niet op te slaan.** Migratie `0028` zette hem neer
met `id = 'type-huisraad'` en `slug = 'huisraad'` — de enige rij in het archief
waar die twee verschillen — terwijl `renameTypeSlug` het gewenste adres met het
**id** vergeleek. Elke Opslaan viel door die kortsluiting heen, zocht of het
adres al bezet was, vond **zichzelf**, en kwam terug met *"Het adres is al van
een andere soort"*. Geen vinkje, geen veld, geen woord op die soort was te
bewaren. De §80-browsertest drukte met opzet niet op Opslaan en zag het dus
nooit; deze ronde moest het wél, om een soort te maken die hij nodig had.

Twee reparaties, allebei nodig: vergelijk met de slug die er staat, en laat de
"is dit adres bezet"-lookup de rij zelf niet meetellen. De tweede is de echte
vangrail, want die beschermt ook de volgende soort waarvan id en slug uit elkaar
lopen.

**2. Een vlag omzetten liet de oude rijen staan.** `one_of_a_kind` is sinds §80
een vinkje in Beheer, en `room_slots.claim` wordt geschreven op het moment dat
iets wordt neergelegd — naar de vlag zoals die dán stond. Zet een Keeper hem
later om, dan dragen de rijen die er al liggen wel een `entry_id` maar geen
`claim`, en bood de winkel iets aan dat de kamer weigerde. `updateType` vult de
claims nu bij als de vlag aan gaat, en haalt ze weg als hij uit gaat.

## Regels die niet gebroken mogen worden

1. **De winkel biedt nooit aan wat de kamer zou weigeren.** Elke aankoop gaat
   door `buyFurnishing`; `landsIn` is een gemak en geen toestemming.
2. **Wat je niet kunt betalen blijft staan, met de prijs.** Verbergen maakt
   sparen onmogelijk.
3. **Eén beurs per onderzoeker**, en de winkel leest nooit die van een ander —
   een vreemd kamer-id valt terug op je eigen.
4. **Geen beurs is twee verschillende dingen**: de Keeper zet zelf neer, een
   speler zonder onderzoeker kan nergens iets kwijt. Twee zinnen.
5. **`renameTypeSlug` vergelijkt met de slug**, nooit met het id.

## Bewust niet gedaan

Zoeken of filteren in de winkel — met een handvol dingen is dat meubilair.
Terugverkopen, ruilen, verlanglijstjes, "sparen voor dit" als bewaarde keuze.
Een winkel per Keeper of per zaak. Niets op de telefoon-tabbalk.

## Getest

`tsc --noEmit` stil. **105 bestanden / 1826 unit tests** (ronde 42: 104 / 1769).
`npm run build` groen. Nieuw: `tests/unit/winkel.test.ts` (56, inclusief de twee
regressies hierboven) en `tests/e2e/winkel.spec.ts` (7 gevallen: de etalage met
wat te duur is, kopen dat in de kamer landt, een uniek ding dat vergeven is,
kunnen betalen maar nergens kwijt kunnen, de Keeper zonder beurs, twee beurzen,
en de telefoon).

De e2e maakt zijn eigen soort via Beheer — inclusief de sleutels van de velden —
en bewijst daarmee onderweg dat §80's sleutelvakje echt werkt: een Keeper kan
een kamer-passende soort bouwen zonder migratie.

## Uitrollen

`git pull && bash scripts/deploy.sh`. Geen migratie, geen npm-wijzigingen. Wel
`rm -rf .next` lokaal.
