# Ronde 39 — Aanwezig, de spelerspagina, en een deur naar de kamer (§76, §77, §78)

19 september 2026. Gebouwd op `main` bij `fa957d6` (ronde 38). **Geen migratie**,
geen nieuwe afhankelijkheden, **33 bestanden** aangeraakt (14 gewijzigd, 19
nieuw), **niets verwijderd** — er is dus geen `git rm` nodig. Twee bouwagents
parallel (de spelerspagina, de unittests), daarna een derde voor de
browsertests, en die vond drie dingen die alleen een browser vindt.

## Wat Nick vroeg

> *"I want a page/indicator/popup menu (whatever is cleanest UI/UX wise) where
> you can see all currently online people and what character they have selected.
> And I want the user to be able to see where they are right now, what they are
> doing on there and if you click on it you get transported to the same page.
> Perhaps this user page in the future can contain more info? Meta progression
> stuff we will add for the Call of Cthulhu campaign."*

De meta-progressie is inmiddels in grote lijnen bekend: elke onderzoeker krijgt
een **kamer** met **plekken**, en een munt koopt zowel een nieuwe plek als wat
erin komt. Daarvan is deze ronde **niets** gebouwd. Wel is de plek waar het komt
eerlijk vrijgehouden — zie §78 onderaan.

## De beslissingen vooraf (Nicks antwoorden)

| Vraag | Antwoord |
|---|---|
| Vorm | Een popover uit de bestaande strip, **plus** een spelerspagina per account |
| Iemand op een plek die ik niet mag zien | Eén vaste zin, nooit de soort, nooit de titel, niet klikbaar |
| Hoeveel "wat doen ze" | Plek **én** een werkwoord (typt, tekent, sleept), dat vervalt |
| De Keeper | Spelers zien nooit waar hij is, alleen dát hij er is. Hij ziet alles |
| Rijen | Eén per **venster**, niet per tabblad; een tweede tab is een stille "+1" |
| Even weg | Een rustend venster (§60) blijft staan, grijs |
| Staartje | Een half uur, zonder plek |
| Klikken | Zelfde tab. Een plek waar je niet in mag is geen link |
| Uitnodiging | "Kom kijken", eenmalig, vervalt na twee minuten, nergens bewaard |
| Onzichtbaar | Niet voor spelers. Eén schakelaar voor de Keeper |
| Adres | `/spelers/<slug>` — het account is de identiteit |
| De kamer | Per **onderzoeker**; plekken worden zowel geopend als gevuld. Niet nu |

## §76 — een plek krijgt een naam per kijker, of helemaal niet

Dit is de hele ronde in één zin, en alles eromheen volgt eruit.

De hub wist altijd al waar elk tabblad stond; dat is waar de strip van gemaakt
is. Wat hij nooit deed, is een plek **hardop zeggen**. De strip toont alleen
mensen die staan wáár jij staat, en dan valt er niets af te schermen.

Een lijstje over het hele archief is het omgekeerde. Daarom wordt het frame
**per verbinding gebouwd** (`rosterFor` in `lib/live/roster.ts`) en niet één keer
uitgewaaierd. Elke rij gaat voor elke kijker langs `gate.ts` — dezelfde functie
als de watchlijst, nooit een tweede regel die hier geschreven staat — en wat er
niet doorheen komt wordt `presenceElsewhere`: één zin, voor élk verborgen ding.
Het verschil is het lek, niet het label.

**Dit is O(mensen × mensen) en dat is goed.** Tien vrienden is honderd
puntopzoekingen in een synchrone SQLite-file, hooguit een paar keer per seconde,
en de memo per publicatie haalt het meeste daarvan weg. De voor de hand liggende
optimalisatie — één lijstje, naar iedereen, de browser laat verbergen wat hij
niet mag zien — *is* het lek, en niemand zou het ooit zien. Er staat een test op
die faalt op precies dat: twee accounts krijgen uit één publicatie twee
verschíllende frames.

Verder in dat bestand:

| | |
|---|---|
| **Vensters, geen accounts** | §18b zei het al: twee onderzoekers in twee vensters zijn twee mensen aan tafel. Een rij is `windowId(account, gedragen naam)` — een hash, want een rij-id gaat over de lijn en `hub.ts` belooft dat een account-id dat nooit doet |
| **Het werkwoord** | Afgeleid uit wat de POST tóch al draagt (`verbOfPost`), en het **vervalt** na twintig seconden. Zonder verval staat er morgen nog dat je typt |
| **Welk tabblad spreekt** | Dat waarin het laatst iets *gedaan* is. `seenAt` alleen kan het niet: elk tabblad klopt elke twintig seconden aan, dus het verste is willekeurig |
| **Even weg** | Een tabblad dat zijn socket teruggeeft (§60) zegt dat nu eerst (`rest: true`). Zonder dat verliest de hub de lijn gewoon en zou iedereen iemand begraven die er gewoon zit |
| **Het staartje** | Een half uur, zonder plek — waar iemand *was* is nergens meer, en een link daarheen stuurt je naar niemand |
| **De Keeper** | `mode: 'quiet'` voor een speler: een naam en "is er". Zijn plek is de vorm van de avond |
| **Onzichtbaar** | Alleen voor hem, in het geheugen van de hub en in `localStorage`. Geen kolom: een vlag die de avond overleeft is een instelling waarvan niemand meer weet dat hij aanstaat |
| **De uitnodiging** | Gepoort op de **ontvanger**, geadresseerd aan het rij-id dat het lijstje uitdeelde, met een vloer van acht seconden. Niets ervan wordt bewaard |

De popover zelf is een popover en geen `Sheet` (§69): de pagina eronder blijft
leven, `useDismiss` doet Escape en de druk ernaast, en hij is daarom **niet
geportald** — een geportald paneel zou die `contains`-test niet overleven.

## §77 — de spelerspagina

`/spelers/<slug>`, de voordeur van één persoon. Niet van één onderzoeker:
rechten zijn per account (§17), en een karakter is een naam die iemand draagt.
De slug komt uit `lib/spelers/service.ts` en wordt in één pas over alle accounts
berekend, zodat "Jan Piet" en "Jan-Piet" niet om `jan-piet` kunnen vechten. Er
staat geen slug in een kolom — dan zou een hernoeming hem moeten bijwerken.

Wat de pagina toont is een **register** (`lib/spelers/panels.tsx`), en de regel
staat in dat bestand:

> Een paneel is een samenvatting met een deur. Het toont het kleinste ware ding
> — een saldo, drie portretten, de laatste vier regels — en linkt naar de pagina
> die het bezit. Niets op een paneel is bewerkbaar, en niets woont in een paneel
> dat geen eigen pagina heeft.

Vijf panelen: **Nu bezig** (leest de roster die deze browser al heeft; de server
gaat niets vragen, dat zou een tweede en oudere antwoord zijn), **Karakters**,
**De kamer** (één zin, zie §78), **Recente bijdragen** (de feed van de
voorpagina, dus §9/§17/§46 zitten er al in), **Dossiers**.

Een rij in het lijstje heeft sindsdien **twee deuren**, en ze gaan naar
verschillende plaatsen: de naam is *wie iemand is* — zijn spelerspagina, waar de
kamer straks hangt — en de regel eronder is *waar hij staat*. Dat uit elkaar
houden is wat voorkomt dat één rij twee dingen tegelijk betekent.

## §78 — de kamer, gereserveerd

Geen tabel, geen munt, geen plekken. Vier dingen, en verder niets:

1. `room:{id}` bestaat als sleutel en `canWatch` **weigert** hem. Er is niets om
   naar te kijken, dus het eerlijke antwoord is nee — en de ronde die de kamer
   bouwt vindt één functie om te veranderen, met elke roster, elk label en elke
   watchlijst al door de poort geleid.
2. De woorden `room`, `slot` en `currency` staan in de woordenlijst, met de munt
   met opzet naamloos. Gulden, kristal of scherf is daarmee altijd een
   hernoeming van tien seconden.
3. Eén leeg paneel, met één eerlijke zin en geen meubilair.
4. De grens, in `README.md` rule 78 en in `CLAUDE.md`: **de site onthoudt wat je
   bezit en wat het ding zegt dat het doet; hij rekent nooit een bonus uit en
   spreekt nooit recht.** Een saldo is de som van een grootboek. Voorwerpen zijn
   *artikelen* van een soort, geen eigen tabel.

## Wat er onderweg gevonden is — vier dingen, drie ervan lekken

Alle vier gevonden door het van de andere kant te vragen, en dat is de enige
kant die ze vindt.

**1. `canWatch` liet elke `/wiki/overzicht/<slug>` door.** Op de vórm van het
adres alleen, terwijl hetzelfde overzicht via `overzicht:{id}` netjes langs de
knoppen, de kant en de prullenbak ging. Eén ding, twee sleutels, twee
antwoorden. Dat was al een §21-lek sinds ronde 38 — een speler kon een privé
overzicht *watchen* en kreeg te horen wanneer het bewoog — en zou met deze ronde
de naam en een link erbij hebben gegeven. De test in `overzicht-spine.test.ts`
die het tegendeel beweerde is herschreven, met de reden erboven.

**2. `nudge` antwoordde voor een onzichtbare Keeper.** `'ok'` voor de één
persoon van wie het archief zojuist beloofd had dat hij er niet was, `'gone'`
voor iedereen die echt weg was: een orakel in één klik, en zijn scherm lichtte
er ook nog van op. Nu is hij daar net zo afwezig als op het lijstje, en omdat
een uitnodiging aan een *rij-id* is geadresseerd is er ook niets meer om aan te
adresseren.

**3. Drie velden vielen uit de POST.** `nudge`, `rest` en `ghost` stonden op
`Outgoing`, werden door de route afgehandeld — en werden in de merge in `post()`
niet overgenomen. Het gevolg: de uitnodiging kwam nooit aan, een rustend venster
werd begraven in plaats van grijs, en **het vinkje "onzichtbaar" van de Keeper
loog**: hij stond gewoon op ieders lijstje. Dat laatste is een rechtenlek dat
typecheckt en waar geen unittest langskomt; de browser vond het in één run.
Staat nu in `CLAUDE.md` §5 als de tweede van de twee fouten die dit stuk
uitnodigt.

**4. Het telefoonblad was 23 pixels breed en stond boven het scherm.** `.roster-pop`
is onder 767px `position: fixed`, en dat gaat ervan uit dat het scherm het
containing block is. Dat was het niet: `.live-strip` heeft een `backdrop-filter`,
en die maakt van een element een containing block voor alles wat `fixed` is —
precies zoals een `transform`. Gemeten: het paneel liep van y=-163 tot y=13 in
een kolom van 22,8 px. De strip laat zijn blur nu los zolang er iets uit hangt.

## Regels die niet gebroken mogen worden

1. **Een plek wordt per kijker genoemd, of niet.** `rosterFor` vraagt `canWatch`
   voor elke rij. Een sleutel zonder tak in `gate.ts` wordt de placeholder —
   faal dicht. Er is precies één placeholderzin en die verschilt nooit per soort.
2. **De placeholder is nooit een link.** Een 403 ná een klik is een antwoord op
   de vraag die de rij weigerde.
3. **Een uitnodiging wordt gepoort op de ontvanger**, en geadresseerd aan een
   rij-id — nooit aan een account.
4. **De plek van de Keeper gaat niet naar spelers**, en het lijstje drukt nooit
   het karakter van een Keeper af (§18, regel 5).
5. **Het werkwoord vervalt.** Niets op de lijn mag iemand eeuwig laten typen.
6. **Alleen stabiele functies uit `useLive()` in dependency arrays** (§60). De
   popover leest `useLiveBase`; `NuBezigLive` leest `useLiveBaseOptional`, dat
   om dezelfde reden bestaat.
7. **Eén rij per venster.** Andere tabbladen zijn een getal, nooit een tweede plek.
8. **Een paneel is een samenvatting met een deur** (§77).
9. **Een veld op `Outgoing` dat nergens gemerged wordt, bestaat niet.** Zie
   bevinding 3.

## Bewust niet gedaan

De kamer zelf, plekken, de munt, een grootboek, de uitgeef-knop van de Keeper.
Meldingen buiten het tabblad. Een geschiedenis van wie waar was. Een `/spelers`
index (het lijstje ís de index; de telefoon-tabbalk zit vol, §66). Zoeken op
mensen. Een `bothSides`-beslissing voor het dossierpaneel van een Keeper (§46
doet daar wat het boek zegt, wat op een persoonspagina verrassend is — dat is
een keuze, geen bug).

Eén e2e-geval staat met opzet op `skip`: *een rustend venster wordt grijs*.
Rusten vraagt 45 seconden onafgebroken verborgen tabblad (§60), en een headless
Playwright-pagina meldt zichzelf als zichtbaar — een wachttijd van 45 seconden
zou traag zijn én niets bewijzen. De klok-kant ervan staat in de unittests, waar
de tijd een argument is.

## Getest

`tsc --noEmit` stil. **102 bestanden / 1654 unit tests** (ronde 38: 99 / 1596).
`npm run build` groen. Nieuw: `tests/unit/roster.test.ts` (34),
`tests/unit/spelers-address.test.ts` (9), `tests/unit/spelers-page.test.ts` (14),
`tests/e2e/aanwezig.spec.ts` (7 gevallen: 5 desktop, 1 telefoon, 1 met opzet
overgeslagen).

Twee bestaande tests zijn veranderd, en allebei met reden in het bestand:
`live-everywhere.test.ts` (de strip krijgt de woordenlijst) en
`overzicht-spine.test.ts` (de assertie die het lek hierboven vastlegde).

## Uitrollen

`git pull && bash scripts/deploy.sh`. Geen migratie, geen npm-wijzigingen, geen
nginx-wijzigingen. Wel `rm -rf .next` voor een lokale `npm run dev`: er zijn twee
stylesheets bij.
