# Ronde 42 — de hal en de handtekening (§81)

19 september 2026. Gebouwd op ronde 41 (§80). **Geen migratie**, geen nieuwe
afhankelijkheden, **17 bestanden**, niets verwijderd. Een kleine ronde met één
grote beslissing erin: ze keert een opgeschreven regel om.

## Wat Nick vroeg

> *"Is de kamer nu per karakter? Het hoort per karakter te zijn. Is er een
> pagina waar ik alle speler-profielen kan zien? Kamer per karakter, 1 profiel
> per speler. En keepers zijn nogsteeds keepers. Keepers moeten gewoon hun
> account naam krijgen als ze een edit maken niet 'Keeper edit' maar
> 'KEEPERACCOUNT edit.' Ik zie soms nog referenties naar keeper."*

Drie vragen en één opdracht. De eerste twee waren al goed, de derde ontbrak, en
de vierde is deze ronde.

## Wat er al klopte

**De kamer is per karakter.** `rooms.entry_id` draagt een unieke index op het
artikel van de onderzoeker; `getOrCreateRoom` werkt per karakter-artikel, en de
kamer gaat met dat artikel de prullenbak in (§79 — daarom heeft `rooms` geen
eigen `deleted_at`).

**Eén profiel per speler.** `/spelers/<slug>` hangt aan het account, niet aan een
karakter; de karakters staan erop als paneel (§77). Rechten zijn per account
(§17, regel 1) en dat is de reden dat het zo hoort.

## §81, eerste helft — een Keeper tekent met zijn eigen naam

`displayNames()` zette voor een Keeper het **woord** "Keeper" neer, en omdat
`attributed()` daar doorheen loopt gold dat voor elke feedregel, elke
geschiedenisregel en het logboek.

**Dat keert regel 5 van §18 om**, en dat is met opzet. Die regel zei: *een Keeper
is altijd het woord van de Keeper* — één stem voor de tafel (§11). Verdedigbaar
zolang er één Keeper is die nooit zijn eigen bewerking hoeft terug te zoeken. Maar
een logboek beantwoordt **wie dit deed**, en een gedeeld woord is daar geen
antwoord op.

Het bijzondere is dat het archief het antwoord al had. Sinds §21 drukt
`presenceNames` voor een Keeper de accountnaam af, met een redenering die
letterlijk in dat bestand staat: *een kamer vol identieke "Keeper"-pijlen is geen
naam — twee Keepers op één prikbord konden elkaar niet uit elkaar houden.* De
strip deed het dus goed en de feeds niet, en er stonden twee regels waar er één
hoort te staan. Nu doen ze hetzelfde.

Wat **niet** verandert:

- Een Keeper draagt geen karakter (§18), dus een `character_id` dat een rij
  toevallig meedraagt blijft voor hem genegeerd.
- Het woord *Keeper* blijft overal staan waar het een **rol** noemt: "een Keeper
  kan dit terughalen uit de prullenbak", "dit dossier is van de Keeper", de
  Keeperkant, Keepernotities, "alleen de Keeper maakt deze soort". Een rol is
  geen handtekening, en dat is het hele onderscheid.

De parameter `keeperWord` is **verdwenen** uit `displayNames`, `displayNameOf` en
`attributed` in plaats van ongebruikt te blijven staan (negen aanroepplekken
meegegaan). Een dode parameter is een uitnodiging om hem weer te gaan gebruiken.
`presenceNames` houdt de zijne, want daar is hij nog wat hij altijd was: een
terugval voor een account zonder naam.

## §81, tweede helft — de hal

§77 gaf iedereen een voordeur en liet de gang weg: je kwam alleen op iemands
spelerspagina via het lijstje in de hoek — dus terwijl diegene toevallig online
was — of via je eigen *Jij*. Voor een tafel van vijf is dat één ontbrekende
pagina.

`/spelers` is die gang, en bewust dun: een naam, de onderzoeker die diegene nu
draagt, en een deur. Wie iemand *is* staat achter die deur, en §77's regel over
panelen geldt net zo goed voor een lijst ervan. Het lijstje (§76) blijft de
levende helft van dezelfde vraag — wie er **nu** is; de hal zegt wie er **zijn**.

Bereikbaar vanaf *Jij*, naast de knop naar je eigen pagina.

## Wat er onderweg gevonden is

**De wegwijzer in `CLAUDE.md` stond drie rondes lang stil op §75.** Dat bestand
heeft in §5 één regel die zegt welk §-nummer het laatste is — precies de regel
die een volgende ronde leest om te weten welk nummer vrij is. Mijn bewerking
daarvan mislukte in ronde 39 stil en daarna nog twee keer, omdat elke volgende
ronde ankerde op tekst die er door die eerste stille mislukking nooit was gekomen.
De *lessen*-secties (§76, §79, §80) landden wel, dus het bestand zag er gezond
uit. Een ronde 43 had §76 opnieuw gepakt.

De oorzaak is dom en het gevolg niet: een tekstvervanging die niets vindt doet
niets en zegt niets. De wegwijzer staat nu op §81 met §76 t/m §80 erin, en er
staat een regel bij voor wie dit bestand programmatisch bijwerkt: controleer dát
er iets veranderd is. Deze ronde deed dat wel — vandaar dat het gevonden is.

**Eén locator werd dubbelzinnig.** De §77-browsertest zocht op `/you` naar een
link die op /spelerspagina/ matchte, en met de nieuwe knop *Spelerspaginas*
ernaast waren dat er twee. Aangescherpt naar de exacte naam. Klein, maar precies
het soort ding dat een dag later "ineens flaky" heet.

## Hoe §81 bewezen wordt, en de test die het al kon

Het geseede Keeper-account **heet** "Keeper", dus in een gewone browsertest zijn
het woord en de naam niet uit elkaar te houden. In de unittest wel: daar heet het
account **Nick**, en de assertie is dat het label "Nick" is en geen rolwoord.

En toen viel de volledige suite over `board-live.spec.ts` — een test uit ronde 29
die precies dit probleem al had opgelost. Hij **hernoemt eerst het woord** naar
"Spelleider" via Beheer → Woorden; daarna leest alles wat "Keeper" zegt het
account en alles wat "Spelleider" zegt het woord. Die test legde de oude regel
vast ("the feed says the Keeper's word; presence says their account") en is nu
omgedraaid: beide helften lezen het account, en **"Spelleider" mag nergens meer
op die feedregel staan** — niet in het label, niet in een tooltip, niet in de
markup. Dat is de assertie die vóór deze ronde zou falen en die weer faalt als
iemand het woord terugzet.

Een suite die zijn eigen oude beslissing tegenspreekt is precies wat je wilt als
je er een omkeert.

## Regels die niet gebroken mogen worden

1. **Een Keeper tekent met zijn accountnaam.** Regel 5 van §18 is hiermee
   omgekeerd — de update staat boven in `claude/access-characters-maps.md`, want
   dat document wordt aan het begin van elke ronde gelezen.
2. **Het woord *Keeper* blijft waar het een rol noemt**, en nergens waar het een
   handtekening zou zijn.
3. **Een Keeper draagt geen karakter** (§18, onveranderd).
4. **De hal is een lijst met deuren**, geen tweede plek om dingen te doen (§77).

## Bewust niet gedaan

Een zoekveld of sortering in de hal — vijf tot tien regels hebben dat niet nodig,
en een filter op een lijst van vijf is meubilair. De hal staat niet in de
telefoon-tabbalk (die zit vol, §66) en niet in het zijmenu; hij hangt aan *Jij*,
waar je hem zoekt. Hernoemen van het Keeper-account zelf: dat is een woord van
Nick, niet van de code.

## Getest

`tsc --noEmit` stil. **104 bestanden / 1769 unit tests** (ronde 41: 104 / 1768).
`npm run build` groen.

Volledige Playwright desktop + telefoon: **404 passed / 4 failed**. Twee van die
vier waren specs die de óude regel vastlegden — `board-live.spec.ts` (hierboven)
en een locator in `kamer.spec.ts` die door de nieuwe knop op *Jij* dubbelzinnig
werd; allebei herschreven en daarna groen (beide bestanden opnieuw gedraaid,
13 + 3 gevallen). De andere twee zijn de bekende: `per-place-crops.spec.ts:13`,
rood op onaangeraakte `main` sinds ronde 19, en `maps.spec.ts:627`, die alleen
gedraaid gewoon slaagt (CLAUDE.md §6).

**Drie bestaande tests zijn herschreven omdat ze de oude regel vastlegden** —
`characters.test.ts`, `authorship.test.ts` en `board-live.spec.ts` — allemaal met
de reden erboven in plaats van een stil omgezette verwachting. Eén e2e-geval
erbij in `aanwezig.spec.ts` voor de hal.

## Uitrollen

`git pull && bash scripts/deploy.sh`. Geen migratie, geen npm-wijzigingen. Wel
`rm -rf .next` voor een lokale `npm run dev`.

Na het uitrollen staan oude feedregels van de Keeper meteen op zijn accountnaam:
de attributie wordt bij het tonen bepaald en niet in de rij opgeslagen (§18b), dus
er is niets te migreren.
