# Dutch glossary for the interface

The whole interface is in Dutch. This is the single list of terms so that every
screen says the same thing.

**Since §11's word list, about sixty of these are the Keeper's to change.**
`lib/words.ts` holds them with the words below as their defaults, and Beheer →
Woorden overrides any of them for one archive. What is written here is therefore
what a screen says *unless a Keeper has said otherwise* — which is why a term
that appears in that file must never also be typed into a component. If a screen
needs a word this glossary covers, it reads it from `useUi().words` (client) or
`getWords()` (server). The rest of this document still governs everything the
word list does not cover, and remains the source for the defaults themselves. Informal `je`, sentence case on buttons and labels,
real ellipsis (…), curly quotes (‘ ’) where the English had them. Comments in
code stay English; database keys, slugs, CSS classes and identifiers never
change.

## Names of things

| English | Dutch | Notes |
|---|---|---|
| Zeeland Case Files | Zeeland Case Files | the archive's name; stays |
| Keeper / Keepers | Keeper / Keepers | the role, capitalised, never translated |
| player(s) | speler(s) | |
| investigator(s) (the people) | onderzoeker(s) | |
| entry / entries | artikel / artikelen | *het* artikel — until 5 September 2026 this was *fiche*; the keys in `lib/words.ts` still say `entry` |
| entry type(s) | soort artikel / soorten artikelen | |
| case / case file / cases | dossier / dossiers | *het* dossier |
| case note | dossiernotitie | |
| board / clue board / boards | prikbord / prikborden | *het* prikbord |
| map / maps | landkaart / landkaarten | *de* landkaart; never "kaart", which is a board's card |
| map pin / pins | speld / spelden | on a landkaart; a *punaise* is on a prikbord |
| timeline / timelines | tijdlijn / tijdlijnen | *de* tijdlijn (§32) |
| event / events (on a timeline) | gebeurtenis / gebeurtenissen | a mark on a tijdlijn: an artikel, or a *losse gebeurtenis* that exists only there |
| character / characters | karakter / karakters | the artikel a player wears (§18) |
| (board) card | kaart | |
| note (on a board) | notitie | |
| photo | foto | |
| pin (bare pin on a board) | punaise | |
| pin head | kop van de punaise | |
| string (red string) | draad | *het* draadje; "de draad" is fine |
| string label | bijschrift | |
| cover / cover picture | afbeelding | "omslag" is too bookish |
| crop | bijsnijden (verb), uitsnede (noun) | |
| tag(s) | tag(s) | stays |
| wiki | wiki | stays |
| revision / history | versie / geschiedenis | |
| backlinks / "Mentioned in" | Genoemd in | |
| Keeper notes | Notities van de Keeper | |
| invite code | uitnodigingscode | |
| audit log | logboek | |
| activity | activiteit | |
| overview | overzicht | |
| border (card border) | rand | |
| section (on an entry) | sectie | §9's revealable blocks |
| the Keeper's side of the archive | Keeperkant | *de* Keeperkant (§44); `keeperSide` in `lib/words.ts`. Sinds §46 geen lijstpagina meer maar een **kant** van het hele archief: elke lijst laat één kant zien |
| turning the archive over | omklappen (de spiegel) | de knop rechtsboven en de sneltoets `k` (§46); `toKeeperSide` / `toPlayerSide` in `lib/words.ts` |
| twin (a page's Keeper face) | Keeperversie / Spelersversie | the two faces of one thing, one button apart (§44); `keeperVersion` / `playerVersion` |
| tie (between a Keeper page and a player-facing one) | touwtje | *het* touwtje; any number, both directions. Not renameable |
| view as a player | kijk als speler | the Keeper's preview through a player's eyes (§44); `asPlayer` |
| colour scheme / palette | kleurschema / palet | four of them (§45); the pane in Beheer is **Kleuren** |
| reveal / revealed to | onthullen / onthuld aan | |
| visibility | zichtbaarheid | |
| locked / to lock | vergrendeld / vergrendelen | |
| review queue | beoordelingswachtrij | |
| pending edit / proposal | voorstel | |
| approve / reject | goedkeuren / afwijzen | |
| trash | prullenbak | |
| restore | terugzetten | put it back where it was |
| export / download everything | export / alles downloaden | |
| site settings | site-instellingen | |
| accent colour | accentkleur | |
| field (on an entry type) | veld / velden | |
| tray (the board's case drawer) | lade | "Uit het dossier" |
| presence (who else is here) | wie er nog meer is | §8's live boards |
| holding a card | een kaart vasthebben | the coloured border round it |
| block (on an entry page) | blok | §11's page builder |
| page builder / the page | De pagina | the block list in the type editor |
| self-filling list | lijst die zichzelf vult | a reverse query, e.g. "Leden" |
| hand-filled list | lijst die je zelf vult | a chosen list, e.g. "Bondgenoten" |
| word list | Woorden | the Beheer pane that renames all of the above |
| infobox (fields and tags beside the text) | Meer info | was *Meer toevoegen*; a card beside the text on a wide screen, folded under the header on anything narrower than 1280 px |
| outline of the page | Op deze pagina | the list that scrolls along beside an artikel |
| the managing foot of an artikel | Beheer van dit artikel | rights, proposals, visibility, Keeper notes, the bin |
| the chosen few on a dossier | toegewezen | "Toegewezen: 3"; an artikel or prikbord says *gekozen personen* |
| welcome text (start page) | welkomsttekst | Beheer → Site |

## Navigation

Home → Start · Cases → Dossiers · Wiki → Wiki · Boards → Prikborden ·
Maps → Landkaarten · Timelines → Tijdlijnen · Search → Zoeken · You → Jij ·
Admin → Beheer

Admin panes: Gebruikers · Beoordelen · Soorten artikelen · Woorden · Prullenbak ·
Geschiedenis · Site · Export · Logboek

## Buttons and labels

| English | Dutch |
|---|---|
| New entry | Nieuw artikel |
| New (per-type button) | Nieuw |
| Create | Aanmaken |
| Create ‘X’ | ‘X’ aanmaken |
| Create entry (on a board note) | Fiche aanmaken |
| Open entry | Fiche openen |
| Open a case (button and dialog) | Dossier openen |
| Open case (confirm in the dialog) | Openen |
| New board | Nieuw prikbord |
| Pin to board | Op prikbord prikken |
| Add to case | Aan dossier toevoegen |
| Remove from case | Uit dossier halen |
| Add case note / Edit case note | Dossiernotitie toevoegen / bewerken |
| Why this matters here | Waarom dit hier van belang is |
| Options for X | Opties voor X |
| Add cover | Afbeelding toevoegen |
| Replace | Vervangen |
| Crop / Close crop (menu item on the artikel; round 19 — one set of crops per picture, no crop on a dossier's filing or a board card any more) | Bijsnijden / Bijsnijden sluiten |
| Landscape 3:2 / Portrait 3:4 / Square 1:1 (the three crop frames) | Liggend 3:2 / Staand 3:4 / Vierkant 1:1 |
| Crop (noun, the frame's label) | Uitsnede liggend / staand / vierkant |
| Three crops — landscape, portrait and square. Every list, card and knot picks one. Drag to move; scroll to zoom. | Drie uitsneden — liggend, staand en vierkant. Elke lijst, kaart en knoop kiest er een. Sleep om te verschuiven; scrol om te zoomen. |
| Remove | Verwijderen |
| Done | Klaar |
| Cancel | Annuleren |
| Close | Sluiten |
| Save | Opslaan |
| Undo | Ongedaan maken |
| Restore | Terugzetten |
| Fit all | Alles in beeld |
| Zoom in / Zoom out | Inzoomen / Uitzoomen |
| New note | Nieuwe notitie |
| Photo | Foto |
| Pin | Punaise |
| Add photo / Replace photo / Remove photo | Foto toevoegen / Foto vervangen / Foto verwijderen |
| Hide picture / Show picture | Foto verbergen / Foto tonen |
| Remove card / Remove N | Kaart verwijderen / N verwijderen |
| Card border | Rand van de kaart |
| Border: from type (X) | Rand: van soort (X) |
| Border: X | Rand: X |
| String label | Bijschrift |
| String colour | Kleur van de draad |
| Pin label | Label van de punaise |
| Label this pin (optional) | Geef de punaise een label (niet verplicht) |
| Add a card (board search label) | Kaart toevoegen |
| Add an entry, or type a name for a note… | Zoek een artikel, of typ een naam voor een notitie… |
| Add ‘X’ as a note | ‘X’ als notitie toevoegen |
| Sign in | Inloggen |
| Create account | Account aanmaken |
| Log out | Uitloggen |
| Log out everywhere | Overal uitloggen |
| Change password | Wachtwoord wijzigen |
| Name | Naam |
| Password | Wachtwoord |
| Password again | Wachtwoord nogmaals |
| Invite code | Uitnodigingscode |
| Add more → More info (the infobox) | Meer info |
| Remove this entry | Dit artikel verwijderen |
| Sort: recent / Sort: name | Sorteren: recent / Sorteren: op naam |
| Search names, tags and text… | Zoek op naam, tag of tekst… |
| Add anything to this case… | Voeg iets toe aan dit dossier… |
| Search or create X… | Zoek of maak X… |
| Case name | Naam van het dossier |
| Summary | Samenvatting |
| One line: what is being investigated? | Eén regel: wat wordt er onderzocht? |
| Case notes | Dossiernotities |
| What is the working theory? Type @ or [[ to link an entry. | Wat is de werktheorie? Typ @ of [[ om een artikel te koppelen. |
| Assigned investigators / N assigned | Toegewezen onderzoekers / N toegewezen |
| Open to all / Confidential | Voor iedereen / Vertrouwelijk |
| open / cold / closed | open / koud / gesloten |
| Overview / Board / Activity / People | Overzicht / Prikbord / Activiteit / Personen |
| Press n anywhere | Druk overal op n |
| @ or [[ to link | @ of [[ om te koppelen |
| Did you mean… | Bedoel je… |
| Missing (stamp) | Ontbreekt |
| Locked | Vergrendeld |
| Keeper only / Revealed | Alleen voor de Keeper / Onthuld |
| Since you were last here | Sinds je laatste bezoek |
| Earlier | Eerder |
| Recently updated | Onlangs bijgewerkt |
| Nothing pinned yet. | Nog niets geprikt. |
| Double-click to write / Double-tap to write | Dubbelklik om te schrijven / Dubbeltik om te schrijven |
| Rearranging works best on a tablet or desktop. | Verschuiven werkt het best op een tablet of computer. |
| Saved / Saving… | Opgeslagen / Opslaan… |
| Not saved — check your connection | Niet opgeslagen — controleer je verbinding |
| Sent to the Keeper for review | Naar de Keeper gestuurd ter beoordeling |
| Bold / Italic / Heading / Bullet list / Numbered list / Quote / Link / Image | Vet / Cursief / Kop / Opsomming / Genummerde lijst / Citaat / Koppeling / Afbeelding |

## Live boards (§8)

Almost nothing here is written on screen — presence is drawn, not spelled out —
so this is mostly what a screen reader is told.

| English | Dutch |
|---|---|
| Also on this board: X, Y | Ook op dit prikbord: X, Y |

The word for *prikbord* in that sentence comes from Beheer → Woorden like every
other, so renaming boards to "muren" renames this too.

## The page builder (§11)

| English | Dutch |
|---|---|
| The page | De pagina |
| Fields and tags / Text / Sections / Backlinks / History | Velden en tags / Tekst / Secties / Verwijzingen / Geschiedenis |
| Own list / Self-filling list | Eigen lijst / Lijst die zichzelf vult |
| Add a self-filling list | Lijst die zichzelf vult |
| Add a list you fill yourself | Lijst die je zelf vult |
| Visible / Hidden | Zichtbaar / Verborgen |
| Look in these types (empty = all) | Kijk in deze soorten (leeg = alle) |
| …and collect everything whose field points here | …en verzamel alles waarvan dit veld hiernaar wijst |
| — pick a field — | — kies een veld — |
| Order: by name / recently updated | Volgorde: Op naam / Onlangs bijgewerkt |
| Only these types may go in (empty = anything) | Alleen deze soorten mogen erin (leeg = alles) |
| A line of explanation under the heading (optional) | Regel uitleg onder de kop (niet verplicht) |
| Opens as soon as the entry opens | Staat open zodra het artikel opengaat |
| The words of this type | De woorden van deze soort |
| The question under the title | De vraag onder de titel |
| The line in the big text box | De regel in het grote tekstvak |
| What the ‘new’ button says | Wat de knop ‘nieuw’ zegt |
| What it says when nothing points here | Wat er staat als niets hiernaar verwijst |
| Nothing yet. This list fills itself as soon as an entry points here. | Nog niets. Deze lijst vult zichzelf zodra een artikel hiernaar wijst. |

## The word list (§11)

| English | Dutch |
|---|---|
| Words | Woorden |
| Things in the archive | Dingen in het archief |
| The menu | Het menu |
| Buttons and headings on an entry | Knoppen en koppen op een artikel |
| The tabs in Admin | De tabbladen in Beheer |
| Back on ‘X’ | Terug op ‘X’ |
| Everything is on the default words. | Alles staat op de standaardwoorden. |
| N words differ from the default. | N woorden wijken af van de standaard. |

## The short-description placeholder (§6, now in Dutch)

> Waar kwam je ze tegen, wat was de sfeer, wat was de context van de eerste
> ontmoeting, en hoe zagen ze eruit?

## Card borders (lib/borders.mjs labels)

Plain → Kaal · Photograph → Foto · Heavy rule → Dikke lijn · Warrant card →
Pasje · Map edge → Kaartrand · Evidence tag → Bewijslabel · Hatched →
Gearceerd · Taped → Geplakt · Photo corners → Fotohoekjes · Foxed → Vergeeld

## String colours

red → rood · ink → inkt · blue → blauw · green → groen · gold → goud · violet → paars

## Visibility and sections (§9)

| English | Dutch |
|---|---|
| Visibility and reveals | Zichtbaarheid en onthullingen |
| Who may see this entry | Wie mag dit artikel zien |
| Everyone / Chosen players / Only the Keeper | Iedereen / Gekozen spelers / Alleen de Keeper |
| Revealed to | Onthuld aan |
| Or all at once: | Of in één keer: |
| Sections | Secties |
| Add section | Sectie toevoegen |
| Title of the section | Titel van de sectie |
| Visible to | Zichtbaar voor |
| Locking / Locked / Open to everyone | Vergrendeling / Vergrendeld / Open voor iedereen |

## Rights (§17)

| English | Dutch |
|---|---|
| Rights | Rechten |
| Who may look / Who may edit | Wie mag kijken / Wie mag bewerken |
| Everyone / Chosen people / Private | Iedereen / Gekozen personen / Privé |
| Private / Chosen / Confidential (stamps on lists) | Privé / Gekozen / Vertrouwelijk |
| Public board / Private board | Openbaar prikbord / Privé prikbord |
| Read only | Alleen kijken |
| Lock the rights / Locked — the owner can no longer change this | Rechten vastzetten / Vastgezet — de eigenaar kan dit niet meer veranderen |
| The Keeper has locked the rights of this {thing}. | De Keeper heeft de rechten van {this} vastgezet. |
| You can read this {entry}. What you change goes to the owner as a proposal. | Je kunt dit {artikel} lezen. Wat je verandert gaat als voorstel naar de eigenaar. |
| Sent to the owner as a proposal. | Als voorstel naar de eigenaar gestuurd. |
| Proposals (n) / Accept / Reject | Voorstellen (n) / Overnemen / Afwijzen |
| You may not edit this {case}. | Je mag dit dossier niet bewerken. |

## Characters (§18)

| English | Dutch |
|---|---|
| You play as | Je speelt als |
| As yourself | Als jezelf |
| Your characters | Jouw karakters |
| This is my character | Dit is mijn karakter |
| Play as {name} / Active / This is you now | Speel als {naam} / Actief / Dit ben je nu |
| Your character / One of your characters | Jouw karakter / Een van je karakters |
| Played by {accounts} | Gespeeld door {accounts} |
| Tie a character on | Karakter koppelen |
| Manage characters | Karakters beheren |
| You now play as {name}. | Je speelt nu als {naam}. |
| A Keeper is always the Keeper. | Een Keeper is altijd de Keeper. |
| As Keeper you are the Keeper everywhere. | Als Keeper ben je overal de Keeper. |

## Maps (§19)

| English | Dutch |
|---|---|
| Maps (menu) | Landkaarten |
| Hang a map / Hang | Landkaart ophangen / Ophangen |
| Set a pin | Speld zetten |
| Tap the map where the pin should go. | Tik op de landkaart waar de speld moet komen. |
| Tap the map where {name} belongs. | Tik op de landkaart waar {naam} hoort. |
| What goes here? / Note ‘X’ / ‘X’ as a new entry | Wat komt hier? / Notitie ‘X’ zetten / ‘X’ als nieuw artikel aanmaken |
| Legend / All on / Only my pins / Find a pin… | Legenda / Alles aan / Alleen mijn spelden / Zoek een speld… |
| Zoom out / Zoom in / Fit | Uitzoomen / Inzoomen / Passend maken |
| Drag the pin to move it. | Sleep de speld om hem te verplaatsen. |
| Remove pin / Remove {name} from the map? | Speld weghalen / {naam} van de landkaart halen? |
| This pin is someone else's… | Deze speld is van iemand anders: alleen wie hem zette, of een Keeper, kan hem verplaatsen of weghalen. |
| Set by {name} | Gezet door {naam} |
| On the map: / Put on {map} | Op de landkaart: / Zet op {landkaart} |
| {name} is on {map}. | {naam} staat op {landkaart}. |
| New drawing / Take off the wall | Nieuwe tekening / Van de muur halen |
| Only a Keeper hangs maps. | Alleen een Keeper hangt landkaarten op. |

## Sorting and filtering (§14)

| English | Dutch |
|---|---|
| Sort | Sorteren |
| Last edited / By name / Newest first / Open first / Most entries / Most cards | Laatst bewerkt / Op naam / Nieuwste eerst / Open eerst / Meeste artikelen / Meeste kaarten |
| Keeper's order / Last changed | Volgorde van de Keeper / Laatst veranderd |
| Only: mine / not for everyone / on a map | Alleen: van mij / niet voor iedereen / op een landkaart |
| Status: open / cold / closed | Status: open / koud / gesloten |
| Where I belong / Confidential | Waar ik bij zit / Vertrouwelijk |
| Where: loose / with a case | Waar: los / bij een dossier |
| Private or chosen | Privé of gekozen |
| With my pins | Met mijn spelden |
| Secrecy: for everyone / revealed to chosen / Keeper only | Geheimhouding: voor iedereen / onthuld aan gekozen / alleen de Keeper |
| Clear filters / Clear all / Done | Wis filters / Wis alles / Klaar |
| Filters (the button, with a count badge) | Filters |
| Everything (the first tab of soorten) | Alles |
| Active filter chip | Tag: water × |
| Nothing matches this. Switch a filter off to see more. | Geen dossier voldoet hieraan. Zet een filter uit om meer te zien. |
| Nothing matches these filters. | Niets voldoet aan deze filters. |
| Search in {soort}… / Nothing under {soort} matches that. | Zoek in {soort}… / Niets onder {soort} komt daarmee overeen. |

## The start page and the artikel page (5 September 2026)

| English | Dutch |
|---|---|
| Welcome text on the start page | Welkomsttekst op de startpagina |
| Since your last visit / n more, earlier | Sinds je laatste bezoek / Nog n eerder |
| Edit the welcome text | Welkomsttekst aanpassen |
| Open cases / All cases / Recent entries / See everything | Open dossiers / Alle dossiers / Recente artikelen / Alles bekijken |
| More info (the infobox) | Meer info |
| On this page (the outline) | Op deze pagina |
| Managing this entry | Beheer van dit artikel |
| Legend: fold / unfold / n off / only mine | Legenda inklappen / Legenda uitklappen / n uit / alleen de mijne |
| What goes here? | Wat komt hier? |
| Note ‘X’ — a loose note on the map; type its text on the pin | Notitie ‘X’ zetten — een losse aantekening op de landkaart; de tekst typ je zo op de speld |
| ‘X’ as a new entry — in the wiki and on this spot | ‘X’ als nieuw artikel aanmaken — komt in de wiki én op deze plek |
| Up to 20 MB (a map) / That picture is over the limit of 2 MB. | tot 20 MB / Die afbeelding is groter dan de limiet van 2 MB. — the number is the reader's own ceiling (`ui.uploadLimit`), 2 MB for a speler and 20 MB for a Keeper since Round 11 |
| The file is over what the web server allows… | Het bestand is groter dan de webserver toelaat. Dit is niet de limiet van het archief zelf maar van de webserver ervoor (bij nginx: client_max_body_size). |
| Test the upload limit / n MB on its way / n MB was refused / lets at least n MB through | Uploadlimiet testen / n MB onderweg / n MB werd geweigerd / laat minstens n MB door |
| The archive is not answering right now. Try again shortly. | Het archief antwoordt even niet. Probeer het zo opnieuw. |

## Live (§8, §20)

| English | Dutch |
|---|---|
| live / connecting… / no connection | live / verbinden… / geen verbinding |
| Live: what you type, everyone sees at once | Live: wat je typt ziet iedereen meteen |
| No connection — what you type is kept and sent on later | Geen verbinding — wat je typt wordt bewaard en straks doorgestuurd |
| Also here: … | Ook hier: … |
| Propose a change / Send proposal | Wijziging voorstellen / Voorstel sturen |
| Your own version of the text… | Je eigen versie van de tekst. Wat je stuurt komt als voorstel bij de eigenaar en de Keeper; de tekst hierboven verandert pas als zij het overnemen. |
| You may only read this text. | Je mag deze tekst alleen lezen. |

## Toasts and errors

| English | Dutch |
|---|---|
| Card removed. / N cards removed. | Kaart verwijderd. / N kaarten verwijderd. |
| String removed. | Draad verwijderd. |
| X is not in {case} (a sheet, since §17's polish) | X zit nog niet in {case} |
| File it in the case / Just pin it | Toevoegen aan dossier / Alleen prikken |
| X filed in {case}. | X toegevoegd aan {case}. |
| That did not save. Try again. | Opslaan is niet gelukt. Probeer het opnieuw. |
| That image did not upload. | De afbeelding is niet geüpload. |
| Sign in first. | Log eerst in. |
| Not found | Niet gevonden |
| Give the case a name first. | Geef het dossier eerst een naam. |
| No entry given. | Geen artikel opgegeven. |
| Wrong name or password. | Naam of wachtwoord klopt niet. |
| That invite code is not right. | Die uitnodigingscode klopt niet. |
| That name is taken. | Die naam is al in gebruik. |
| Too many attempts. Try again in fifteen minutes. | Te veel pogingen. Probeer het over een kwartier opnieuw. |

## Relative time (lib/diff.ts)

just now → zojuist · N minutes ago → N minuten geleden (1 → een minuut geleden) ·
N hours ago → N uur geleden · yesterday → gisteren · N days ago → N dagen geleden ·
otherwise a date formatted with `nl-NL`.

## Entry types (seed) — labels and fields

Personen (was *Personages* until 5 September 2026; one word, *personen*,
everywhere) · Onderzoekers · Locaties · Voorwerpen en relieken · Aanwijzingen ·
Abnormaliteiten · Facties · Gebeurtenissen · Overlevering en folklore ·
Sessieverslagen. Field labels and select options are in lib/db/seed.mjs.

## Round 8 — nieuwe woorden op het scherm

| Nederlands | Waar | Wat het is |
|---|---|---|
| **Tabbladen** | knop in de kop van een dossier | Welke soorten dit dossier altijd een tabblad geven, ook als er nog niets in staat. |
| **Automatisch** | in dat blad | De tabbladen volgen wat er in het dossier ligt — de stand waarin elk dossier begint. |
| **Wat een onderzoek oplevert** | in dat blad | De soorten die alleen in een dossier gemaakt worden (voorwerp, aanwijzing), vooraan aangeboden. |
| **Uit dit dossier** | mapje naast een suggestie | Dit artikel ligt al in het dossier waarin je schrijft; daarom staat het bovenaan. |
| **Zonder dossier** | grijs chipje naast een naam | Een artikel dat het dossier voor zijn naam zou dragen en in geen enkel dossier meer ligt. Sinds §49 hangt dat aan het vinkje van het artikel zelf, niet meer aan zijn soort. Beheer → Soorten artikelen houdt de lijst bij. |
| **Uit: …** | boven de titel van een artikel | Het dossier waar dit artikel vandaan komt. Volgt vanzelf mee; een Keeper kan hem vastzetten. |
| **Volgt vanzelf** | in dat menu | De herkomst volgt de dossiers waar het artikel in ligt, in plaats van vast te staan. |
| **Adres (slug)** | Beheer → Soorten artikelen | Het stukje van de URL van een soort (`/wiki/relieken`). Hernoemen verplaatst alles in het archief mee; oude links van buiten breken. |
| **Maak er een artikel van** | speld op een landkaart | Zet een notitie-speld om in een echt artikel, op dezelfde plek. |
| **of plak een afbeelding** | overal waar een foto gevraagd wordt | Ctrl+V (op een Mac Cmd+V) werkt net zo goed als het bestandsvenster. |
| **Lettertype** | Jouw account | Waarin jij het archief leest. Alleen voor jou. |
| **Archief** | Lettertype | De letter van het archief zelf. |
| **Beter leesbaar** | Lettertype | Atkinson Hyperlegible: letters die op elkaar lijken zijn uit elkaar getrokken. |
| **Dyslexie** | Lettertype | OpenDyslexic: elke letter is onderaan verzwaard. |

## Round 9 — tijdlijnen (§32)

| Nederlands | Waar | Wat het is |
|---|---|---|
| **Tijdlijnen** | het menu, negende plek | De plank met tijdlijnen. |
| **Nieuwe tijdlijn** / **Openbare tijdlijn** / **Privé tijdlijn** | de plank | Zoals bij prikborden: iedereen, of alleen jij en de Keepers. |
| **Maak nieuwe tijdlijn voor dit dossier** | tabblad Tijdlijn in een dossier | Een tijdlijn die bij dit dossier hoort. |
| **Gemeten in** — Jaren · Maanden · Dagen · Uren · Minuten · Seconden | nieuwe tijdlijn, en Instellingen | De maat van de as: welke vakjes de datum vraagt, en hoe fijn de as gedeeld is. |
| **Gebeurtenis toevoegen** | de balk boven de tijdlijn | Een artikel uit het archief, een nieuw artikel, of een losse gebeurtenis. |
| **Losse gebeurtenis** | in dat blad | Bestaat alleen op deze tijdlijn; nergens anders naar te verwijzen. |
| **Wanneer** — Jaar, Maand, Dag, Uur, Minuut, Seconde | datumvakjes | Het jaar is genoeg; wat je verder weet vul je in. "Dit wordt: 12 maart 1931". |
| **Wat de tijdlijn erover zegt** | een gebeurtenis | De tekst hoort bij de tijdlijn, niet bij het artikel erachter. |
| **Op de tijdlijn zetten** | de knop onderaan het blad | |
| **Alles tonen** / **Alles inklappen** | de balk | Alle uitklapvensters open, of dicht. Ze beginnen dicht. |
| **Lees verder** | uitklapvenster van een artikel-gebeurtenis | Naar het artikel. |
| **Bewerken** | uitklapvenster | Het blad van de gebeurtenis: naam, tekst, moment, afbeelding. |
| **Sjabloonafbeelding tonen** / **Afbeelding tonen** / **Afbeelding verbergen** | blad van een gebeurtenis, en het camera-knopje | Het kader met het icoon van de soort, of de foto. Zonder foto begint het dicht — ook op een prikbord nu. |
| **Afbeelding kiezen** / **Andere afbeelding** / **Afbeelding weghalen** | losse gebeurtenis | Alleen een losse gebeurtenis heeft een eigen foto; een artikel gebruikt zijn omslag. |
| **Maak er een artikel van** | losse gebeurtenis | Wordt een artikel, op hetzelfde moment. |
| **Van de tijdlijn halen** | blad van een gebeurtenis | Bij een artikel blijft het artikel; een losse gebeurtenis is dan weg. |
| **Instellingen** | de balk | Naam, korte beschrijving, de maat, rechten, en de prullenbak. |
| **Tijdlijn verwijderen** / **In de prullenbak** | Instellingen | Naar de prullenbak, met alles erop; een Keeper zet hem terug. |
| **Op de tijdlijn:** / **Zet op {tijdlijn}** / **Zet op een andere tijdlijn…** | de artikelpagina | Waar dit artikel op een tijdlijn staat, en waar het nog heen kan. |
| **Op tijdlijnen** | Genoemd in | Het kopje boven de tijdlijnen die dit artikel noemen. |
| **Tijdlijn** | prullenbak, en het kaartje op een prikbord | De soort van het ding. |
| **gezet door {naam}** | uitklapvenster | Wie de gebeurtenis zette (§18: het karakter). |


## Ronde 10 — de tekenlaag (§33)

| Op het scherm | Waar | Betekenis |
|---|---|---|
| **Tekenen** (het potlood) | rechtsonder op een prikbord (op een telefoon linksboven), linksboven op een tijdlijn, linksonder op een landkaart | Zet de tekenmodus aan: slepen tekent nu in plaats van kaarten te verplaatsen of te schuiven. Nogmaals klikken of Esc zet hem uit. |
| **Tekenen uit** | hetzelfde knopje, als hij aan staat | |
| zwart · wit · rood · oranje · geel · groen · blauw · paars | de kleurstippen | De acht kleuren. De laatste keuze wordt onthouden. |
| **Dun** · **Normaal** · **Dik** | de drie stippen | De dikte van de lijn, gemeten op het scherm bij de zoom waarop je tekent; hij groeit en krimpt daarna mee. |
| **Gum** | de werkbalk | Gumt precies wat eronder ligt, ook van anderen. Een gumbeurt is zelf een streek: wat er daarna getekend wordt ligt er weer bovenop. |
| **Laatste streek ongedaan maken** (Ctrl+Z) | de werkbalk | Alleen je eigen streken, alleen die van deze zitting. Buiten de tekenmodus is Ctrl+Z voor de kaarten. |
| **Opslaan…** | de werkbalk | De streek is onderweg naar het archief. |
| **Tekenen toegestaan** | Rechten (prikbord), onder de landkaart, Instellingen (tijdlijn) — alleen Keepers | Uit: niemand kan meer tekenen of gummen; wat er staat blijft staan, voor iedereen. |
| **Tekenlaag wissen** | zelfde plek | Alle streken weg, definitief, na een bevestiging. Staat in het logboek. |
| **Tekenen staat uit op dit onderdeel.** | melding | Iemand probeerde te tekenen terwijl de Keeper het uitgezet had. |
| **De tekenlaag is vol. Vraag een Keeper hem te wissen.** | melding | Tweeduizend streken is de grens; uitgegumde inkt telt mee tot de laag gewist is. |
| **tekenlaag**, **streek**, **potlood**, **gum** | in de tekst van de site | De laag, één lijn erop, en de twee gereedschappen. |

## Ronde 11 — gummen, draden, verkleinen, het volle scherm, de as, en wie er schrijft

### De tekenlaag: drie gummen (§33)

| Op het scherm | Waar | Betekenis |
|---|---|---|
| **Kleine gum** · **Normale gum** · **Grote gum** | dezelfde drie stippen, als de gum in de hand is | De dikte van de gum (12, 24 en 48 px op het scherm). De stippen zijn dan ringetjes: een stip is inkt die je neerlegt, een ring is inkt die je weghaalt. |
| **Gumdikte** | de naam van dat groepje (voor een schermlezer) | Met het potlood heet hetzelfde groepje **Dikte** en zijn het **Dun · Normaal · Dik**. |

De acht kleuren staan gedempt zolang de gum in de hand is, zodat nooit de vraag
is welk gereedschap je vasthebt. **tekenlaag**, **streek**, **potlood** en
**gum** staan al in ronde 10.

### De draad op een prikbord

| Op het scherm | Waar | Betekenis |
|---|---|---|
| **Dikte van de draad** | de balk onderaan het prikbord, bij een gekozen draad | Vier diktes, in bordeenheden — de draad groeit dus mee met de zoom, anders dan een streek. |
| **Dun** · **Normaal** · **Dik** · **Extra dik** | die vier knopjes | 1,5 · 2 · 4 · 6,5. **Normaal** is wat elk prikbord altijd al had. |
| **Soort draad** | ernaast | Hoe de draad getekend wordt. |
| **Vol** · **Streepjes** · **Stippels** · **Dubbel** · **Streep-stip** | dat keuzelijstje | **Dubbel** is twee draden naast elkaar, geen streep uit één draad gesneden. |

De hint *Sleep een uiteinde om het te verplaatsen.* is uit de balk verdwenen:
er stond meer in dan er paste. Slepen kan nog gewoon.

### Uploaden en verkleinen (§30)

| Op het scherm | Waar | Betekenis |
|---|---|---|
| **De afbeelding was te groot en is verkleind.** | melding, overal waar een foto gekozen of geplakt wordt | De browser heeft de foto zelf kleiner gemaakt zodat hij past. Eén regel, één keer. |
| **Die afbeelding is groter dan de limiet van {n} MB en werd ook verkleind niet klein genoeg.** | melding | Zelfs de kleinste stap paste niet. |
| **Die afbeelding is groter dan de limiet van {n} MB.** | melding | Ongewijzigd — en wat een GIF of een SVG krijgt, want die worden nooit verkleind. |
| **tot {n} MB** | onder het bestandsveld | 2 MB voor een speler, 20 MB voor een Keeper. |
| **Het archief laat spelers 2 MB en Keepers 20 MB uploaden…** | Beheer → Site → Uploadlimiet testen | De test stuurt 1,5 · 3 · 21 MB en noemt `client_max_body_size 25m;` (bij Apache `LimitRequestBody 26214400`). |

### Het volle scherm: waar dingen dan staan (§34)

Er is niets nieuws te lezen op een landkaart of een tijdlijn — er is minder te
lezen, en dat is de bedoeling. Twee dingen zijn wel verhuisd.

| Op het scherm | Waar | Betekenis |
|---|---|---|
| **Tekenen toegestaan** · **Tekenlaag wissen** | op een landkaart: ónder de kaart, bij de andere gereedschappen van de Keeper — je scrollt ernaartoe | Ze zijn gereedschap, geen deel van de kaart. Op een tijdlijn stonden ze altijd al in **Instellingen**, op een prikbord bij **Rechten**. |
| **live** · **verbinden…** · **geen verbinding** | het stipje rechtsboven in de kolom | Op een pagina die één grote kaart of tijdlijn is hangt het in de hoek bóven de kaart in plaats van in de tekst mee te lopen. Alleen het stipje is te zien tot er iets mis is. |

### De tijdlijn: verzetten en een vast moment (§35)

| Op het scherm | Waar | Betekenis |
|---|---|---|
| **sleep een {gebeurtenis} om hem te verzetten** | de regel onder de as | Een gebeurtenis schuift over de as en landt op een hele eenheid van zijn eigen precisie. |
| **Wijzig** | het blad van een nieuwe gebeurtenis | Het moment dat je aanwees staat er als één regel; hiermee vraag je de datumvakjes alsnog. |
| **Deze {tijdlijn} speelt op…** | Instellingen, alleen bij een maat fijner dan dagen | Het vaste moment van de tijdlijn. |
| **Geen vast moment** / **Een jaar** / **Een maand** / **Eén dag** | daaronder | Hoeveel van de datum vastligt. Altijd grover dan de maat van de tijdlijn. |
| **Geef een dag op en elke nieuwe {gebeurtenis} vraagt alleen nog het tijdstip.** | uitleg zonder vast moment | |
| **Elke nieuwe {gebeurtenis} begint op dit moment, en de as komt er niet meer vanaf.** | uitleg mét vast moment | Het vaste moment is ook een hek: verder pannen of uitzoomen dan die ene dag kan niet. |
| **De dag staat vast; vul in wat je van het tijdstip weet.** | boven de datumvakjes van een vastgezette tijdlijn | Tegenover *Het jaar is genoeg; wat je verder weet vul je in.* |
| **speelt op {datum}** | de regel onder de as | Waar deze tijdlijn zich afspeelt. |
| **Wanneer speelt deze tijdlijn?** · **Een vast moment heeft een tijdstip én een maat nodig.** · **Onbekende maat voor het vaste moment.** · **Het vaste moment moet grover zijn dan de maat van de tijdlijn.** · **Onbekend vast moment.** | meldingen | De vijf manieren waarop een vast moment geweigerd wordt. |

### Met wie je schrijft (§18b)

| Op het scherm | Waar | Betekenis |
|---|---|---|
| **Met wie ben je nu aan het schrijven?** | een blad, één keer per browservenster | Alleen onderzoekers staan erin: als jezelf schrijven bestaat niet meer. |
| **Alles wat je in dit venster typt komt op naam van deze onderzoeker. Een ander venster kan een andere kiezen.** | in dat blad | Waarom het per venster gaat. |
| **Je schrijft als** | onder de karakterwissel in het menu, en boven de kleerkast op Jij | Wat er nu op je volgende regel komt te staan. Klik erop om te wisselen. |
| **nog niemand** | in die regel | Er is nog niets gekozen én het account draagt niets. |
| **Je hebt nog geen onderzoeker, dus je kunt alleen lezen.** | een blijvende melding bovenaan elke pagina | Voor een speler zonder onderzoeker. De melding wijst de weg naar buiten: maak een artikel en koppel het aan je account. |
| **Je hebt nog geen onderzoeker, dus je kunt hier alleen lezen.** | melding, bij een knop die dicht blijft | Hetzelfde, waar het gebeurt. |
| **Kies eerst met wie je schrijft.** | antwoord van het archief | Het archief weigert een schrijfactie zonder onderzoeker; de browser stelt daarop de vraag hierboven. |
| **{Karakters} beheren** | onderaan dat blad | Naar de kleerkast op Jij. Het woord komt uit Beheer → Woorden. |

De vraag is zelf een blad, en daarom komt hij nooit óver een ander blad heen.
Op **Nieuw artikel** en **Nieuw dossier** wordt eerst gevraagd met wie je
schrijft — alleen die vraag staat dan op het scherm — en pas je antwoord opent
het blad waar je op klikte. Overal waar je gewoon begint te typen komt de vraag
wél over de pagina heen: die pagina staat er daarna nog precies zo bij.
Escape sluit altijd het bovenste blad, en verder niets.

## Ronde 12 — geen nieuwe woorden

Ronde 12 was twee reparaties (de kolommen van een artikel, §25, en inkt die met
de as meegroeit, §33) en heeft **geen enkel woord op het scherm** toegevoegd of
veranderd. Dit staat er zodat de volgende lezer niet hoeft te zoeken.

Twee regels hierboven blijven waar en zijn alleen preciezer geworden: **Meer
info** klapt onder de kop zodra het scherm smaller is dan 1280 px (dat was
1024 px), en **Op deze pagina** staat op een breed scherm nog steeds naast de
tekst — nergens anders meer, want de tweede brede indeling waarin het onder de
afbeelding terugsprong bestaat niet meer.

## Ronde 13 — groter en kleiner, een knop in een dossier, getypte velden, kaarten op kaarten, en wie een onderzoeker uitdeelt

Woorden tussen accolades komen uit **Beheer → Woorden** (`lib/words.ts`) en
staan hier met hun standaardwoord: `{artikel}`, `{dossier}`, `{kaart}`,
`{punaise}`, `{landkaart}`, `{speld}`, `{notitie}`, `{karakter}`, `{Keeper}`.
Wat hieronder tussen sterretjes staat, staat letterlijk zo in de code.

### Een kaartje groter of kleiner maken (§41)

| Op het scherm | Waar | Betekenis |
|---|---|---|
| **Klein** · **Normaal** · **Groot** · **Extra groot** | de balk onderaan een prikbord, bij één gekozen kaartje | 50% · 100% · 150% · 250%. **Normaal** is wat elk kaartje altijd al had. Het percentage staat in de tooltip: *Groot (150%)*. |
| **Grootte van de {kaart}** / **Grootte van de {punaise}** | de naam van dat groepje (voor een schermlezer) | Het woord komt uit Beheer → Woorden, want dit knopje kiest allebei. |
| **Maak deze {kaart} groter of kleiner** | het hoekje rechtsonder aan het gekozen kaartje (voor een schermlezer) | Het greepje. Op een telefoon is het rijtje hierboven de enige weg: daar staat slepen uit. |
| **Sleep om de grootte te veranderen. Houd Shift ingedrukt voor tussenmaten.** | de tooltip van dat hoekje | De maat springt per vijf procent; met Shift kan alles ertussen. |

Een kaartje groeit vanuit zijn **midden**, dus het blijft staan waar het staat.
Alles op het papier groeit mee — de foto, de kop, de tekst, en ook het randje en
de schaduw. Dat is met opzet (Nicks beslissing): de zoom van het prikbord doet
al hetzelfde met het randje, dus een kaartje op 200% ziet eruit als hetzelfde
kaartje van dichtbij. Een label op een {punaise} wordt niet meer afgekapt: het
loopt door op een tweede regel en de speld wordt naar beneden langer.

### Een nieuw {artikel} in een {dossier}

| Op het scherm | Waar | Betekenis |
|---|---|---|
| **Voeg iets toe aan dit dossier…** | het zoekvak bovenaan een dossier, nu op halve breedte | Ongewijzigd, letter voor letter. Dit vak **hangt er iets aan wat al bestaat**. |
| **Nieuw {artikel} in dit {dossier}** | de knop ernaast (op een smal scherm eronder) | Dit **maakt iets wat er nog niet is**, meteen in dit dossier. Je komt uit op het nieuwe artikel zelf. |
| **Voeg een nieuw {artikel} toe aan dit {dossier}** | dezelfde knop, voor een schermlezer | |
| **‘X’ aanmaken** | de laatste regel onder het zoekvak, zodra je typt | Ongewijzigd, en met opzet anders: je typte in het vak op *deze* pagina, dus het nieuwe ding wordt aangehaakt en je blijft hier. |

### Velden met een soort (§38)

| Op het scherm | Waar | Betekenis |
|---|---|---|
| **Getal** | Beheer → Soorten, het soort van een veld | Een echt getal. Wat geen getal is wordt niet opgeslagen. |
| **Ja/nee** | idem | Een vinkje. Bij het lezen staat er **Ja** als het aan staat, en **niets** als het uit staat — een infobox noemt wat zo is. |
| **Meerkeuze** | idem | Een keuzelijst waar meer dan één antwoord in mag. Haalt de {Keeper} later een keuze weg, dan valt alleen die keuze eruit; de rest blijft staan. |
| **Datum** | idem | Blijft gewoon tekst: *oktober 1934* en *ergens in de zomer* mogen. |
| **Dit lezen we niet als datum. Het blijft staan zoals je het typt, maar op een tijdlijn kunnen we het zo niet zetten.** | een stille regel onder een datumveld | Alleen als het archief er geen moment in herkent. Een hint, nooit een weigering — er gaat niets verloren. |
| **Oude waarden** | Beheer → Soorten, onderaan een soort | Wat er nog in het archief staat onder een veld dat deze soort niet meer heeft. |
| **Deze waarden staan nog in het archief onder een veld dat deze soort niet meer heeft. Ze worden nergens getoond, en zet je het veld terug, dan komen ze weer mee.** | daaronder | Waarom er niets kapotgaat als je een veld weghaalt. |
| **Definitief wissen** | het knopje ernaast, en de bevestiging | De enige weg waarlangs een waarde echt weggaat. |
| **‘X’ definitief wissen?** · **Deze waarde staat nog bij n {artikelen}. Zet je het veld terug, dan komt de waarde nu nog mee. Na dit wissen niet meer — dit kan niet ongedaan worden gemaakt.** | die bevestiging | |
| **Wissen…** | hetzelfde knopje, terwijl het loopt | |

### Landkaarten: rechten, en een {speld} naar een andere {landkaart} (§40, §39)

| Op het scherm | Waar | Betekenis |
|---|---|---|
| **Rechten** | onder de landkaart, bij de gereedschappen van de {Keeper} | Dezelfde twee knoppen (*Wie mag kijken*, *Wie mag bewerken*) als bij een artikel, een dossier, een prikbord en een tijdlijn. Nieuw: een landkaart had ze nog niet. |
| **Een plattegrond hoeft niet meteen voor iedereen te zijn. Zet *Wie mag kijken* op Privé tot de spelers het huis vinden, en zet hem daarna open.** | daaronder | Elke landkaart die er al hing blijft staan zoals hij stond: *Wie mag kijken* begint op **Iedereen**. |
| **Op de grotere {landkaart}:** | boven de kaart | De landkaart(en) met een {speld} die hierheen wijst — de weg terug omhoog. Wordt afgeleid, dus je stelt hem nergens in. |
| **Een bestaand {artikel} uit de lijst, een andere {landkaart}, een nieuw {artikel} met deze naam, of een losse {notitie}.** | onder *Wat komt hier?* | Vier soorten spelden nu in plaats van drie. |
| **{Landkaart} — de {speld} opent hem** | in dat lijstje | Kies een landkaart en de speld wordt de weg erheen. |
| **{Landkaart} openen** | het blad van zo'n speld | Tikken op de speld opent eerst het blad — *gezet door*, verzetten, weghalen staan daar — en dit knopje is de weg naar beneden. |
| **{Landkaarten}** | de legenda | Alle spelden die naar een landkaart wijzen, in één regel, uit te zetten als elke andere. |
| **De {landkaart} zelf blijft hangen; alleen de {speld} gaat weg.** | bij het weghalen van zo'n speld | Zoals bij een artikelspeld. |
| **Een speld kan niet naar de landkaart wijzen waar hij op staat.** | melding | De enige geweigerde speld. Van A naar B en van B terug naar A mag juist wél: dat is de weg omhoog. |

De naam van zo'n speld is de naam van de landkaart waar hij heen wijst, en wordt
elke keer opnieuw gelezen: hernoemt de {Keeper} de landkaart, dan hernoemt de
speld mee. Spelden naar een {dossier} of een tijdlijn bestaan niet.

### {Karakters} uitdelen (§18c)

| Op het scherm | Waar | Betekenis |
|---|---|---|
| **Toegewezen {karakters}** | Beheer → Accounts, onder een speler | Wie deze speler mag spelen. Alleen de {Keeper} ziet dit. |
| **— n toegewezen** | achter dat kopje | Hoeveel het er zijn. Staat er niet als het er nog geen zijn. |
| **Speelt hier nu als** | onder de naam in dat lijstje | Welke van hen die speler op dit moment draagt. |
| **Ontkoppelen** | het ✕'je ernaast (*{naam} ontkoppelen van {gebruiker}*) | Alleen hier: op **Jij** staat geen ✕ meer. |
| **Zoek de {artikel} van een {karakter}…** | het zoekvak eronder | Zo deelt de {Keeper} er een uit. |
| **{naam} is toegewezen aan {gebruiker}.** · **{naam} is losgekoppeld van {gebruiker}.** | meldingen | |
| **Je hebt nog geen {karakter} gekoppeld. Je eerste maak je zelf: met de knop ‘{Dit is mijn karakter}’ op een {artikel}, of op je eigen pagina. Daarna koppelt de {Keeper} ze aan je account.** | Jij → de kleerkast, en het blad *Met wie schrijf je?*, alleen zolang je er nog geen hebt | De ene deur die openblijft: je eerste onderzoeker maak je zelf, daarna deelt de {Keeper} uit. Zodra je er één hebt is deze zin weg. |
| **Alleen de Keeper koppelt een karakter aan een account.** · **Alleen voor jezelf, of voor een Keeper.** · **Alleen de Keeper ontkoppelt een karakter van een account.** | meldingen van het archief | De drie weigeringen. |

**Speel als** en **Als jezelf** zijn niet veranderd: welke van je onderzoekers je
draagt blijft van jou, per venster (§18b).

### Weg van het scherm

| Wat | Waar stond het | Waarom |
|---|---|---|
| **Lezen of bewerken** — *Hoe een {artikel} of een {dossier} opengaat als je erop klikt*, met de drie keuzes **Wat bij mij hoort** · **Altijd lezen** · **Altijd bewerken** | Jij (Jouw account) | Iedereen komt nu op **Lezen** binnen, ook een {Keeper}. De knop **Bewerken** / **Lezen** bovenaan een {artikel} of {dossier} doet nog precies wat hij deed; alleen het onthouden is weg. Iets wat je zojuist zelf gemaakt hebt opent nog wel meteen in **Bewerken**. |

### Het web (§43)

| Op het scherm | Waar | Betekenis |
|---|---|---|
| **Het web** | hoofdmenu (alleen op een groot scherm), en de titel van de pagina | Het archief getekend als wat naar wat verwijst. Zonder middelpunt: alles wat je mag zien. Woord van de {Keeper} (`navWeb`). |
| **Alles wat aan elkaar hangt** | het kopje boven de titel | |
| **Verbindingen** | de knop op een {artikel}, een {dossier}, een {landkaart}, een {prikbord} en een tijdlijn | Opent het web met dát ding in het midden. Woord van de {Keeper} (`connections`). |
| **Zoek een {artikel}, {dossier}, {landkaart}…** · **Ander middelpunt…** | het zoekvak, zonder en met middelpunt | Kies iets en het wordt het middelpunt. |
| **Hele web** | de knop naast het zoekvak | Terug naar alles. |
| **− n +** (*Minder diep* · *Dieper*) | de dieptestapper, alleen met een middelpunt | Hoeveel stappen vanaf het midden, 1 tot 4. |
| **Kolommen** · **Web** | de vorm, alleen met een middelpunt | Links wat hierheen wijst, rechts waar dit heen wijst; of als een los web. Het web is de standaard. |
| **Legenda** | de knop rechts | Twee delen sinds ronde 19: *Wat* (de knopen) en *Hoe* (de lijnen), elk met een vinkje en een telling. |
| **Wat** | het kopje boven het eerste deel van de legenda | Welke soorten knopen meedoen. Een uitgezette knoop is weg, met alles wat er alleen via hem aan hing; het middelpunt zelf blijft altijd staan. |
| **Verzamelingen** | de eerste groep onder *Wat* | {Dossiers}, {prikborden}, {landkaarten} en tijdlijnen, elk met hoeveel er in het web zitten. Klik op de kop en de hele groep gaat aan of uit. |
| **{Artikelen}** | de tweede groep onder *Wat* | Elke soort artikel in het web, met icoon, kleur en telling; een {karakter} telt onder zijn soort. |
| **Hoe** | het kopje boven het tweede deel van de legenda | Elke soort lijn in zijn kleur en streep. |
| **Tussen {artikelen}** · **Met {dossiers}** · **Op {prikborden}** · **Op {landkaarten}** · **Op tijdlijnen** · **Met {karakters}** | de groepen onder *Hoe* | Klik op de kop en de hele groep gaat aan of uit. |
| **genoemd in de tekst** · **relatie met een naam** · **in de infobox** · **in een {sectie}** | de vier lijnen tussen artikelen | Doorgetrokken inkt is de lopende tekst; een streepje is een feit óver het artikel. |
| **in het {dossier}** · **in de aantekeningen** · **{dossier} in de infobox** · **hangt in het {dossier}** | de vier met dossiers (goud) | De laatste is een {prikbord} of tijdlijn dat in een dossier hangt. |
| **{kaart} op het {prikbord}** · **in een {notitie} op het {prikbord}** · **{draad} op het {prikbord}** | de drie op prikborden (rood) | Een draad tussen twee kaarten is een lijn tussen de twee dingen die ze voorstellen, met het prikbord erbij genoemd. |
| **{speld} op de {landkaart}** · **{landkaart} van deze plek** | de twee op landkaarten (blauw) | |
| **{gebeurtenis} op de tijdlijn** | de ene op tijdlijnen (groen), met het moment als detail | |
| **{karakter} op het {dossier}** · **{speler} in de infobox** | de twee met karakters (paars) | De eerste is de toewijzing (§17); de tweede een infoboxveld *Koppeling naar een speler*, getekend als diens karakter. |
| **Losse {notitie}s op {prikborden}** | vinkje onderaan de legenda | Standaard uit: het zijn er veel en ze zeggen weinig. |
| **Altijd zeggen hoe** | vinkje onderaan de legenda | Het woord op élke lijn, in plaats van alleen bij de knoop waar je op staat. |
| **Afbeeldingen tonen** | vinkje onderaan de legenda | De omslag in de knoop (web, de vierkante uitsnede) of naast de naam (kolommen, de staande). Standaard uit. Zoomen kan tot 12× sinds ronde 19; van dichtbij wordt de grotere afbeelding geladen. |
| *(de korte beschrijving)* | het paneel rechts, onder de naam | Wat het ding in één regel is: de korte beschrijving van een {artikel}, de samenvatting van een {dossier}, de omschrijving van een {landkaart} of tijdlijn. Een {prikbord} heeft er geen. Alleen als die er is. |
| **Tussen {artikelen} (n)** · **Met {dossiers} (n)** · **Op {prikborden} (n)** · … | het paneel rechts, bij één gekozen knoop | Elke lijn, gegroepeerd op soort verband (dezelfde groepen als de legenda), met hoe, in de kleur van de lijn. Klik: kiezen; dubbelklik: middelpunt. |
| **→ verwijst naar · ← wijst hierheen · ↔ {draad}** | het pijltje voor elke rij, en de uitleg onderaan het paneel | De richting, gelezen vanaf de gekozen knoop. |
| **Zoek in n verbindingen…** | het paneel, boven de 12 rijen | Filtert op naam en op hoe. |
| **Terug** · **Eerder:** | naast *Hele web*, en de rij chips eronder | Het spoor van middelpunten in dit tabblad, de laatste vijf. Niets wordt bewaard. |
| **Niet in dit web (n)** | onderaan de legenda | De soorten lijnen die hier niet voorkomen, ingeklapt; open het om er toch een uit te zetten. |
| **Zo lees je het web.** | één keer, over de tekening | Klik = kiezen · dubbelklik = middelpunt · scrollen = zoomen · slepen = schuiven · shift-slepen = meer kiezen. Weg na een klik, en onthouden. |
| **n stap** · **n stappen** | de dieptestapper | |
| **Openen** · **Middelpunt** · *In beeld brengen* | de knoppen in het paneel | |
| **n gekozen** · **Op prikbord prikken (n)** · **Leegmaken** | het paneel bij meer dan één | Shift-klik of shift-slepen kiest er meer. |
| **n {kaart}en geprikt op {prikbord}.** · **n {artikelen} zitten nog niet in {dossier}** | melding en vraag na het prikken | Dezelfde vraag als op de muur, één keer voor de hele selectie. |
| **… nog n — dubbelklik** | een gestippelde rij onderaan een kolom | Een kolom houdt op bij veertig; dit is de rest. |
| **Niet alles past op n diep — de rest is weggelaten.** | linksonder in de tekening | Het plafond van 600 knopen. |
| **Dit middelpunt is er niet, of je mag het niet zien.** | boven de tekening | Een adres naar iets dat weg is of verborgen: geen lek, geen lege pagina. |
| **Het hele web is iets voor een groot scherm. Zoek hier iets en je krijgt zijn verbindingen.** | op een telefoon, zonder middelpunt | |
| **Het web wordt gesponnen…** | terwijl het laadt | |

## Ronde 22 — de Keeperkant en de kleuren van het archief (§44, §45)

Woorden tussen accolades komen uit **Beheer → Woorden** (`lib/words.ts`) en
staan hier met hun standaardwoord: `{artikel}`, `{dossier}`, `{prikbord}`,
`{landkaart}`, `{tijdlijn}`, `{Keeper}`, `{speler}`. Vier woorden zijn er deze
ronde bij gekomen — `keeperSide`, `keeperVersion`, `playerVersion` en
`asPlayer` — dus **Keeperkant**, **Keeperversie**, **Spelersversie** en **Kijk
als speler** mogen door de Keeper hernoemd worden en horen nergens hard in een
component te staan. *Touwtje* is geen woord van de Keeper: dat staat vast.

### De Keeperkant (§44)

| Op het scherm | Waar | Betekenis |
|---|---|---|
| **{Keeperkant}** | de kop van het blok onderaan elk {artikel}, {dossier}, {prikbord}, {landkaart} en {tijdlijn}, en het stempeltje onder de naam van het archief | De kant van het archief die alleen de Keeper ziet. Eén woord voor alle plekken, want het is één ding. *Ronde 23 (§46) haalde de lijstpagina en het menu-item weg: de Keeperkant is nu het hele archief, van de andere kant gelezen.* |
| ~~**Alles wat alleen jij ziet.**~~ · ~~**Nog niets aan deze kant. Open een {artikel}, {dossier}, {prikbord}, {landkaart} of {tijdlijn} en druk op ‘{Keeperversie} maken’.**~~ | stonden op de lijstpagina `/keeper` | Weg sinds §46: dat adres zet nu alleen de kant en zet je op Start neer. |
| **Deze pagina is van de {Keeper}** | het vinkje in het Keeperkant-blok | Zet dit aan en de pagina bestaat niet meer voor de rest van het archief. |
| **Alleen de {Keeper} ziet deze pagina — in lijsten, in het web, en op het adres zelf.** · **Zet dit aan en de pagina verdwijnt voor iedereen behalve de {Keeper}.** | eronder, aan en uit | *En op het adres zelf* is letterlijk: wie het adres intikt krijgt een 404. |
| **De andere kant blijft staan waar hij stond.** | achter die regel, als deze pagina een {Keeperversie} heeft | |
| **{Keeperversie}** · **{Keeperversie} maken** | de knop bovenaan het blok, op een spelerspagina | De eerste springt naar de Keeperkant van dít ding; de tweede maakt hem. Naam en soort gaan mee, de tekst niet. |
| **{Spelersversie}** | dezelfde knop, op een Keeperpagina | De weg terug naar de kant die de {spelers} zien. |
| ~~**Geen {spelersversie}**~~ | *weg sinds §53* | Stond op een Keeperpagina zonder tegenhanger en deed niets. Er is nog steeds geen knop om er een te *maken*, maar er staat nu wel **Link met bestaande {spelersversie}** — zie ronde 27. |
| **Touwtjes** · **Touwtjes (n)** | de kop in het blok, en het knopje bovenaan | Alles waar deze Keeperpagina over gáát: artikelen, dossiers, prikborden, landkaarten, tijdlijnen. Zoveel als je wilt, beide kanten op. |
| **Waar deze pagina over gaat. Een touwtje is geen recht: wie de andere kant niet mag zien, krijgt hem ook hier niet te zien.** | onder die kop | De hele regel van §44 in één zin. |
| **Nog geen touwtjes.** | als er geen zijn | |
| **Zoek iets om een touwtje aan vast te maken** | het zoekvak eronder (voor een schermlezer) | Dit vak **maakt niets aan** — er is geen ‘… aanmaken’-regel: een touwtje gaat tussen twee dingen die al bestaan. |
| **Touwtje naar *X* losmaken** | het kruisje achter een touwtje (voor een schermlezer) | Losmaken haalt alleen het touwtje weg, nooit de pagina. |
| **{Notities van de Keeper}** | de laatste kop in het blok | Nu op alle vijf de soorten, en samen met de {Keeperversie} **één tekst**. |
| **Eén tekst, gedeeld met *X*.** | eronder, als dit ding een andere kant heeft | Wat je hier typt staat ook op de andere pagina, terwijl je het typt. |
| **Wordt nooit aan {spelers} getoond.** | in het lege notitieveld | |

### Kijken door de ogen van een speler (§44)

| Op het scherm | Waar | Betekenis |
|---|---|---|
| **{Kijk als speler}** | in de zijbalk, onder wie je bent en waarmee je schrijft (alleen op een groot scherm, en alleen voor een echte {Keeper}) | Zolang dit aanstaat is de Keeper voor het hele archief een speler: geen Keeperkant, geen Beheer, en schrijven gaat niet. |
| **Je kijkt als {speler}.** *Je ziet nu precies wat de {spelers} zien — niets van de {Keeperkant}, en schrijven gaat niet.* **Stop met kijken als {speler}.** | de balk bovenaan élke pagina zolang het aanstaat | De balk staat in de schil en niet op een pagina, want Beheer gaat zelf niet open zolang je kijkt, en de knop naar de Keeperkant is er dan niet (§46: `/keeper` zet niets en zet je op Start neer). Dit is dus de enige weg terug. |

### Een pagina die er niet is (§44, §40)

| Op het scherm | Waar | Betekenis |
|---|---|---|
| **404** · **Deze pagina is er niet.** | de 404-pagina van het archief | Het getal staat er met opzet: het is wat je kunt doorgeven aan iemand anders. |
| **Hij bestaat niet, of hij is niet van jou om te lezen. De rest van het archief staat er nog.** | eronder | Met opzet twee antwoorden in één zin: zou het archief zeggen *je mag dit niet zien*, dan had het al verklapt dat het bestaat. |
| **Naar het begin** · **Zoeken** | de twee knoppen eronder | |

### Kleuren (§45)

| Op het scherm | Waar | Betekenis |
|---|---|---|
| **Kleuren** | Beheer, het tabblad; en Jij, het kopje onder *Lettertype* | Geen woord van de Keeper: een kleur is een kleur. |
| **Spelers — licht** · **Spelers — donker** · **Keeper — licht** · **Keeper — donker** | de vier tabjes in Beheer → Kleuren | Vier paletten van negentien kleuren. De pagina kiest de kant, de lezer kiest het licht. |
| **Terug naar de kleuren van het archief** | per palet | Zet dit ene palet terug op de kleuren waar het archief mee komt. |
| **Het archief, in deze kleuren** · **Een bijschrift, en een verwijzing ernaast.** · **Stempel** · **Kaart op kurk** | het proefje boven de kleurkiezers | Staat er in de kleuren die je nú kiest, niet in die van de pagina eromheen. |
| **Inkt op papier: n:1. Ruim leesbaar.** | onder het proefje | |
| **Let op: inkt op papier haalt maar n:1. Onder 4.5:1 is gewone tekst voor veel mensen niet meer te lezen — vooral niet op een telefoon buiten. Je kunt het toch opslaan.** | idem, bij te weinig verschil | Een waarschuwing, nooit een weigering. |
| **Papier en inkt** — *De negen kleuren waar elk scherm op staat.* | de eerste groep kleuren | |
| **Het prikbord** — *Alleen het kurk en de kaarten die erop hangen.* | de tweede groep | |
| **Het web** — *De zes kleuren waarin het web zijn lijnen tekent.* | de derde groep | Zes, niet zestien: elke soort lijn in het web hangt aan een van deze zes. |
| **Het papier** · **Papier in de schaduw** · **Papier dat omhoog ligt** · **De inkt** · **Zachte inkt** · **De liniaal** · **De stempel** · **Het draadje** · **Een verwijzing** | de namen van de negen kleuren van *Papier en inkt* | Zoals ze in het archief heten, niet zoals ze in de CSS heten. |
| **Het kurk van een prikbord** · **De spikkels in het kurk** · **Het vlak van een kaart op een prikbord** · **De rand van zo’n kaart** | de vier van *Het prikbord* | |
| **Web: wat de tekst noemt** · **wat op een prikbord hangt** · **wat op een landkaart staat** · **wat in een dossier zit** · **wat op een tijdlijn staat** · **wie het leest en schrijft** | de zes van *Het web* | Dezelfde zes kleuren als de legenda van het web. |
| **In welk licht je het archief leest. Alleen voor jou, op elk apparaat waar je inlogt.** | Jij → Kleuren | |
| **Systeem** — *Wat je apparaat zegt: licht overdag, donker als je telefoon dat ’s avonds omzet.* | het eerste chipje | De standaard, en wat elk scherm vóór deze ronde deed. |
| **Licht** — *Altijd licht papier, wat het apparaat er ook van vindt.* | het tweede | Wie dit kiest houdt het licht, ook al zet de telefoon zichzelf ’s avonds om. |
| **Donker** — *Altijd donker papier — prettig aan tafel bij weinig licht.* | het derde | |
| **De kleuren van de {Keeper} verschijnen vanzelf op de pagina’s die alleen van de {Keeper} zijn — daar hoef je niets voor te kiezen, licht of donker blijft jouw keuze.** | onder de chipjes, voor een {Keeper} | Er is met opzet geen vierde chipje: niemand *kiest* de Keeperkleuren, de pagina brengt ze mee. |
| **De {Keeper} kiest de kleuren van het archief zelf; jij kiest alleen of je ze licht of donker leest.** | dezelfde plek, voor een {speler} | |

## Ronde 23 — de spiegel (§46)

Twee woorden erbij, allebei van de Keeper hernoembaar (`toKeeperSide` en
`toPlayerSide` in `lib/words.ts`). Ze staan op **één** knop, en wat erop staat
is waar hij *heen* gaat — niet waar je nu bent.

### Omklappen: de knop en de sneltoets (§46)

| Op het scherm | Waar | Betekenis |
|---|---|---|
| **{Naar de Keeperkant}** | de ronde knop rechtsboven in beeld, met een schildje — op elk scherm dezelfde hoek, buiten het menu om. Alleen een echte {Keeper} ziet hem | Klapt het hele archief om: elke lijst — Start, Wiki, {Dossiers}, {Prikborden}, {Landkaarten}, {Tijdlijnen}, het web, Zoeken — laat daarna alleen nog de dingen van de {Keeper} zien. |
| **{Naar de spelerskant}** | dezelfde knop, nu met een poppetje | De weg terug: elke lijst laat weer precies zien wat de {spelers} zien. |
| **{Keeperkant}** | het stempeltje onder de naam van het archief, zolang je aan die kant staat | Alleen op een groot scherm: het naambordje staat in de zijbalk, en die heeft een telefoon niet. Op een telefoon zijn de knop en de kleuren het teken. |
| *(geen tekst)* | de toets **k** | Dezelfde knop, vanaf het toetsenbord — naast `n` (nieuw {artikel}) en `/` (zoeken). Doet niets terwijl je in een veld typt of er een blad openstaat. |

Twee dingen die geen woord op het scherm hebben en toch afgesproken zijn:

- **De pagina waar je op staat bepaalt de kant.** Open je vanaf de Keeperkant
  een pagina die de {spelers} ook zien, dan staat die pagina er in de
  spelerskleuren en klapt de rest van het archief mee terug. Andersom net zo.
  Een touwtje mag dus dwars door de spiegel heen.
- **De kant wordt per browser onthouden**, net als *{Kijk als speler}* — de
  laptop op de tafel kan aan de Keeperkant staan terwijl de telefoon in de tent
  aan de spelerskant staat.

## Ronde 24 — vier kleine reparaties (§47)

Geen nieuwe woorden voor de {Keeper} om te hernoemen; wel drie nieuwe zinnetjes
op het scherm, en één ding dat er eindelijk *wel* staat.

### Een kaartje dat zijn {artikel} kwijt is (§47)

| Op het scherm | Waar | Betekenis |
|---|---|---|
| **Ontbreekt** | het stempeltje op een kaartje op een {prikbord} | Het ding waar dit kaartje voor staat is er niet (meer) — weggegooid, of niet voor jouw ogen. Wat van de twee, zegt het met opzet niet. |
| **{Artikel} opnieuw aanmaken** | onderaan zo'n kaartje, alleen op een muur die je mag bewerken | Schrijft het {artikel} opnieuw, met de naam die het kaartje al onthouden had, en hangt het kaartje meteen aan het nieuwe. Dezelfde weg die een {notitie} altijd al had. |

### Een {prikbord} in een {dossier} hangen, of eruit halen (§47)

| Op het scherm | Waar | Betekenis |
|---|---|---|
| **Geen {dossier}** | het keuzelijstje in de balk van het {prikbord} | Deze muur hangt los, in geen enkel {dossier}. |
| *(naam van een {dossier})* | hetzelfde lijstje | Hang deze muur in dat {dossier}. Let op: hij staat daarna ook achter de rechten van dat {dossier} — wie het {dossier} niet mag openen, ziet de muur ook niet meer. |
| **Bestaand {prikbord} hierheen halen…** | op het tabblad {Prikbord} van een {dossier}, in de bewerkstand | Hetzelfde, maar vanaf de andere kant: kies een muur die nog nergens in hangt. |
| **Losmaken** | naast elk {prikbord} in dat lijstje | Haalt die muur uit dit {dossier}. De muur zelf blijft staan, met alles erop. |

### En twee dingen zonder tekst

- **De draadjes en de ringen in het web blijven nu onder je hand staan.** Sleep
  je het web opzij, dan schuift de tekening mee in plaats van af te breken bij
  de rand waar je begon.
- **Een {punaise} telt mee in het web.** Een draadje dat via een losse
  {punaise} loopt, was daar eerder helemaal niet te zien; nu is de {punaise}
  een knoop zoals een {notitie} dat is — onder hetzelfde knopje *Notities* in
  de legenda. Zonder label heet hij gewoon *Punaise*.

## Ronde 25 — geboren op een kant, en `@` overal (§48)

Geen nieuwe woorden voor de {Keeper} om te hernoemen — alles hieronder leunt op
woorden die er al zijn ({Keeperkant}, {dossier}, {artikel}). Wel een handvol
nieuwe zinnetjes, en één regel die voortaan in élke maak-sheet staat.

### De kant waarop iets geboren wordt (§48)

| Op het scherm | Waar | Betekenis |
|---|---|---|
| **Alleen op de {Keeperkant}** | één regel met een vinkje, onderin elke sheet die iets maakt — een {artikel}, een {dossier}, een {prikbord}, een {tijdlijn}, een {landkaart} | Dit nieuwe ding komt op jouw eigen kant van het archief te staan. Alleen zichtbaar voor een {Keeper}; een speler ziet deze regel niet, ook niet uitgegrijsd. Hij staat al aan als je zelf op de {Keeperkant} staat. |
| **De tafel ziet dit niet.** | het zinnetje eronder, als het vinkje aan staat | Wat het aanvinken betekent, in gewone woorden. |
| **Iedereen die het archief mag lezen ziet dit.** | hetzelfde zinnetje, als het vinkje uit staat | Idem, andersom. |
| **{Dossiernaam} is van de {Keeper}.** | hetzelfde zinnetje, als het vinkje aan staat én vastzit | Je maakt dit ín een {dossier} dat van de {Keeper} is. Dan is er niets te kiezen: de naam van dat {dossier} reist met dit ding mee naar elke lijst waarin het staat, dus het blijft aan deze kant. |

En wat er daarnaast gebeurt zonder dat er iets op het scherm staat: haal je een
{dossier} naar de {Keeperkant}, dan gaan de {prikborden} en {tijdlijnen} die
erin hangen mee. Geef je het {dossier} terug aan de tafel, dan blijven ze staan
waar ze staan — teruggeven doe je zelf, met de knop, per ding.

### `@` in elk plat vak (§48)

| Op het scherm | Waar | Betekenis |
|---|---|---|
| *(lijstje met namen)* | zodra je `@` of `[[` typt in de korte beschrijving van een {artikel}, de samenvatting van een {dossier}, een Tekst- of Lange-tekst-veld van de infobox, de vakjes in de maak-sheets en de omschrijving van een {landkaart} | Dezelfde namenlijst die de grote tekst al had. Kiezen zet `[[Naam]]` in het vak; lezend is dat een klikbaar plaatje van de naam. |
| **‘…’ aanmaken** | de laatste rij van dat lijstje | De naam die je typte bestaat nog niet: maak hem hier, zonder het vak te verlaten. In een {dossier} maakt hij hem meteen ín dat {dossier} — en dat is de enige manier waarop een {voorwerp} of een clue gemaakt kan worden. |

### In een {dossier} staan (§48)

| Op het scherm | Waar | Betekenis |
|---|---|---|
| **{Nieuw artikel} in dit {dossier}** | de grote knop in het menu, zolang je in een {dossier} bent (op een telefoon: de `+` rechtsonder) | De sheet gaat open *in* dit {dossier}, dus wat je maakt ligt er meteen in (sinds §49 zonder uitzondering, en voor elke soort). Dezelfde `n`-toets doet hetzelfde. |
| ~~**Opbergen in {dossiernaam}**~~ | *weg sinds §49* | Stond in de sheet die een {artikel} maakt. Er valt niets meer te kiezen: wat je in een {dossier} maakt, ligt in dat {dossier}. Het vinkje dat op die plek staat gaat nu over de naam — zie ronde 26. |
| ~~**{Soort} bestaat alleen binnen een {dossier}.**~~ | *weg sinds §49* | Geen enkele soort bestaat nog alleen binnen een {dossier}. |
| **{Naam} zit nog niet in {dossiernaam}** | een sheet, nadat je een naam in de tekst van een {dossier} hebt gezet | De vraag of dit {artikel} ook op een plank van dit {dossier} hoort. Komt niet als het er al in staat, en komt één keer per {artikel} per bezoek. |
| **Alleen noemen** | de nee-knop van die sheet | Laat het bij de vermelding in de tekst. |

## Ronde 26 — het {dossier} voor de naam, de twee kanten, en Families (§49, §50, §51)

Eén nieuw hernoembaar woord ({spelerskant}), één nieuwe soort met zijn velden,
en verder zinnetjes op bestaande woorden.

### Het {dossier} voor de naam (§49)

| Op het scherm | Waar | Betekenis |
|---|---|---|
| **Zet "{dossiernaam}:" voor de naam** | een vinkje in de sheet die een {artikel} maakt, als die vanuit een {dossier} geopend is — op de plek waar tot ronde 25 *Opbergen in…* stond | Alleen hoe dit ding in lijsten heet. Het staat al aan of uit naar de gewoonte van de soort. |
| **Alleen hoe het in lijsten heet. Het komt hoe dan ook in {dossiernaam} te liggen.** | het zinnetje onder dat vinkje | Zegt dat het vinkje niets met opbergen te maken heeft: wat je hier maakt, ligt hier. |
| **{Dossier} voor de naam** | een vinkje op de pagina van het {artikel} zelf, in de regel die zegt waar het vandaan komt | Zet de naam van dat {dossier} voor de naam van dit {artikel}, overal waar het archief het opsomt — de wiki, Zoeken, de namenlijst. De naam zelf verandert niet. |
| **Uit dit {dossier} halen** | naast elk {dossier} in het keuzelijstje van diezelfde regel, alleen als je dat {dossier} mag bewerken | Haalt dit {artikel} echt van de plank. Het uitzetten van het vinkje hierboven doet dat níét. |
| **Uit {dossiernaam} gehaald.** | melding daarna | Het is eruit; waar het vandaan komt wordt opnieuw bepaald. |
| **Uit dit {dossier} halen lukte niet.** | melding daarna | Meestal: deze hand mag in dat {dossier} niets veranderen. |
| **Standaard het {dossier} voor de naam** / **Standaard geen {dossier} voor de naam** | Beheer → Soorten, een chipje bij de soort | Alleen waar een nieuw {artikel} van deze soort mee begínt. Elk {artikel} zet het daarna op zijn eigen pagina aan of uit. |

En wat er zonder tekst veranderde: **elke soort is weer overal te maken.** De
groene knop op een soortpagina in de wiki is terug voor allemaal, en de sheet
laat niets meer weg.

### Van kant wisselen (§50)

| Op het scherm | Waar | Betekenis |
|---|---|---|
| **{spelerskant}** | nieuw woord van de {Keeper} (`playerSide`, standaard *spelerskant*), naast {Keeperkant} | De kant van het archief die de {spelers} zien. Niet te verwarren met *{Naar de spelerskant}* op de knop — dat is waar de knop héén gaat. |
| **Je staat nu aan de {Keeperkant}.** / **Je staat nu aan de {spelerskant}.** | een melding, meteen nadat je een pagina van de andere kant opent | De wissel: het archief is met je meegedraaid. Je hoeft niets te doen; het zegt alleen wat er gebeurd is. |
| **Dat staat aan de andere kant van het archief.** | een melding als een koppeling geweigerd wordt | Je probeert twee dingen aan elkaar te hangen die niet aan dezelfde kant staan — een {artikel} in een {dossier}, een kaartje op een {prikbord}, een {speld} op een {landkaart}, een gebeurtenis op een {tijdlijn}. Zet er eerst één over met de knop. |

Twee dingen zonder tekst op het scherm:

- **De namenlijst onder een tekstvak toont alleen jouw kant.** Sinds deze ronde
  ook de suggesties: typ je `@` aan de {spelerskant}, dan staan de dingen van de
  {Keeper} er niet meer tussen. Hetzelfde geldt voor elk keuzelijstje op een
  pagina, voor "Genoemd in" en voor "Verwijst hierheen".
- **Een {touwtje} en een {tweeling} zijn de uitzondering**, met opzet: die brug
  bestaat juist om de twee kanten te verbinden, en het zoekvak ervan
  (*Zoek iets om een touwtje aan vast te maken*) laat allebei de kanten zien.
  Wat er vóór deze ronde al
  dwars stond blijft staan; alleen nieuwe koppelingen worden geweigerd.

### Families (§51)

Een nieuwe soort, met zijn velden. Alles hernoembaar door de {Keeper} in
Beheer → Soorten, zoals bij elke soort.

| Op het scherm | Waar | Betekenis |
|---|---|---|
| **Families** | de wiki, het menu van de soorten, en een eigen tabblad in een {dossier} | Een bloedlijn als ding op zichzelf — geen factie met een achternaam. |
| **Leden** | veld op een familie, en de zelfvullende lijst eronder | Wie er bij de familie hoort. Neemt personen, onderzoekers én abnormaliteiten. De lijst eronder vult zichzelf met iedereen wiens veld *Familie* hierheen wijst, dus je hoeft de band maar aan één kant in te vullen. |
| **Familie** | veld op een persoon, een onderzoeker en een abnormaliteit | De andere kant van diezelfde band. |
| **Hoofd van de familie** | veld op een familie | Eén naam: wie het zegt. |
| **Thuisbasis** | veld op een familie | De plek waar de familie vandaan komt. |
| **Status** | veld op een familie | Keuze uit: *bloeiend* · *tanend* · *vervallen* · *uitgestorven*. |
| **Gesticht in** | veld op een familie | Een datum. |
| **Wapenspreuk** | veld op een familie | Eén regel tekst. |

En de knop die daarvoor nodig was, en die voor élk koppelingsveld geldt:

| Op het scherm | Waar | Betekenis |
|---|---|---|
| **Alleen deze soorten mogen erin (leeg = alles)** | Beheer → Soorten, een rij chipjes onder een veld van het type *Koppeling* of *Koppelingen* | Waar dit vak op mag mikken. Meer dan één mag: *Leden* staat op drie soorten tegelijk. Laat je alles uit staan, dan mag alles erin. De eerste die je aanzet telt extra: de regel **‘…’ aanmaken** in het keuzelijstje maakt een {artikel} van díé soort. |

## Ronde 27 — een {prikbord} op een {prikbord}, een {tweeling} die je linkt, chipjes onder het vak, en Talen (§52, §53, §54, §55)

Geen nieuw hernoembaar woord. Eén nieuwe soort met zijn velden, en verder
knoppen en zinnetjes op wat er al stond.

### Een {prikbord} op een {prikbord}, en het touwtje in het niets (§52)

| Op het scherm | Waar | Betekenis |
|---|---|---|
| **Zoek een {artikel}, landkaart, {dossier}, {prikbord} of {tijdlijn}…** | het zoekvak in de balk van een {prikbord} | Er staat sinds deze ronde ook {prikbord} in: een muur kan op een muur hangen. Dit {prikbord} zelf staat niet in zijn eigen lijst. |
| **{Prikbord}** | het grijze labeltje op zo'n kaartje | Zegt waar het kaartje voor staat, zoals bij een {dossier} of een {tijdlijn}. Klikken opent die muur. |
| *(hetzelfde zoekvak, zwevend)* | naast de plek waar je een {touwtje} in de lege kurk loslaat | Vraagt waar dit spoor naartoe wijst. De speld en het {touwtje} staan er al; wat je kiest wordt díé speld. Escape of ernaast klikken laat de speld gewoon staan — er gaat niets verloren. |
| **‘…’ aanmaken** | alleen in dat zwevende vak, boven *‘…’ als {notitie} toevoegen* | Schrijft het {artikel} en hangt het meteen op. In de balk bovenaan staat deze regel niet: daar zou hij verschijnen vóór de zoekresultaten en zou je hem per ongeluk raken. |

Twee dingen zonder eigen tekst:

- **Een kaartje toont de naam van nu.** Hernoem je een {artikel}, dan verandert
  het kaartje mee — ook in de inspector, in de titel van de vergroting en in de
  alt-tekst van de foto. Alleen een kaartje dat zijn {artikel} kwijt is
  (*Ontbreekt*) toont nog de naam van toen, want daar wordt *opnieuw aanmaken*
  mee gevuld.
- **Het wiel hoort bij de muur.** Scrollen boven de kurk zoomt en neemt de
  pagina niet meer mee; zijwaarts vegen schuift de muur. Hetzelfde in het
  bijsnijdvenster, waar de uitsnede nu pas na een korte stilte wordt opgeslagen
  in plaats van bij elk klikje van het wiel. De laatjes, de inspector en de
  keuzelijstjes scrollen wél gewoon.

### Een {tweeling} maken van twee pagina's die er al zijn (§53)

| Op het scherm | Waar | Betekenis |
|---|---|---|
| **Link met bestaande {keeperversie}** / **Link met bestaande {spelersversie}** | naast de schakelaar bovenaan, op een pagina die nog geen {tweeling} heeft — aan allebei de kanten | Twee pagina's die allebei al bestaan aan elkaar knopen. Er wordt niets gemaakt en niets gekopieerd. (Op de plek waar aan de {Keeperkant} vroeger het dode zinnetje *Geen spelersversie* stond.) |
| **Zoek de {keeperversie} die al bestaat…** | het zoekvak dat daaronder opengaat | Toont alleen wat geknoopt mág worden: dezelfde soort, de andere kant, en nog vrij. |
| **{Naam} de andere kant van deze pagina maken?** | de vraag daarna, met de knop **Koppelen** | Zegt wat er gebeurt: allebei de pagina's blijven staan, de knop bovenaan springt van nu af tussen de twee heen en weer, en de {Notities van de Keeper} van de twee worden één tekst aan de {Keeperkant}. |
| **— van de andere kant —** | een regel middenin die samengevoegde tekst | Waar de tweede tekst begon. Er wordt niets weggegooid: de tekst van de {Keeper} staat boven, die van de andere kant eronder. |
| **Ontkoppelen** | naast de schakelaar, zodra er een {tweeling} is | Knipt de band door. Allebei de pagina's blijven staan. |
| **{Naam} loskoppelen van deze pagina?** | de vraag daarna | Zegt er meteen bij dat de samengevoegde {Notities van de Keeper} blijven staan waar ze nu staan — ze gaan niet terug. |
| **Een tweeling is twee keer hetzelfde soort ding.** | melding | Je probeert bijvoorbeeld een {dossier} aan een {landkaart} te knopen. Dat is een {touwtje}, geen {tweeling}. |
| **Een tweeling is één pagina van de {Keeper} en één van de {spelers}.** | melding | Allebei de pagina's staan aan dezelfde kant van het archief. Zet er eerst één over. |
| **Een van de twee heeft al een andere kant.** | melding | Elke pagina heeft er hoogstens één. |

En twee dingen die alleen anders staan dan eerst:

- **Alles onder een {landkaart} staat in één blok**, met daarboven één kop:
  **Beheer van deze {landkaart}** — zoals de artikelpagina dat al deed.
- **Het `⋮`-menu op een kaartje in een {dossier} wordt niet meer afgeknipt** en
  is breed genoeg voor *Dossiernotitie bewerken*. Klik ernaast of druk op
  Escape om het te sluiten.

### Chipjes onder het vak dat je typt (§54)

| Op het scherm | Waar | Betekenis |
|---|---|---|
| **Verwijst naar** *(gevolgd door chipjes)* | onder elk plat tekstvak waar je een naam in zet: de korte beschrijving van een {artikel}, de samenvatting van een {dossier}, de velden *Tekst* en *Lange tekst* in een infobox, de vakken in de sheets die een {artikel}, een {dossier} of een {landkaart} maken, en de tekst van een kaartje op een {prikbord} | Wat je aan het schrijven bent verwijst naar deze {artikelen}. Klikbaar terwijl je typt. Er staat niets als geen enkele naam een {artikel} blijkt te zijn, en elk {artikel} staat er hoogstens één keer. |

Dit stond al onder de speld- en de gebeurtenissheet; nu onder alle acht.

### Talen (§55)

Een nieuwe soort met zijn velden. Alles hernoembaar door de {Keeper} in
Beheer → Soorten, zoals bij elke soort.

| Op het scherm | Waar | Betekenis |
|---|---|---|
| **Talen** | de wiki en het menu van de soorten | Een taal of een schrift als ding op zichzelf. Géén eigen tabblad in een {dossier}: een taal zoek je op. |
| **Moeilijkheidsgraad** | veld op een taal | Keuze uit: *eenvoudig* · *te doen* · *lastig* · *zeer lastig* · *vrijwel onleesbaar*. Eén schaal voor spreken en lezen samen — op dit eiland lees je een taal net zo vaak van een steen. |
| **Schrift** | veld op een taal | Waarin zij geschreven wordt. Eén regel tekst. |
| **Staat** | veld op een taal | Keuze uit: *levend* · *stervend* · *uitgestorven* · *alleen op schrift*. |
| **Waar gesproken** | veld op een taal | Wijst naar Locaties. Dit is ook het antwoord op "welke talen spreekt men hier?" — een locatie heeft zelf geen Talen-veld. |
| **Verwant aan** | veld op een taal | Wijst naar andere Talen. |
| **Talen** | veld op een persoon, een onderzoeker, een reliek, een abnormaliteit, een factie en een overlevering | Welke talen dit ding spreekt, draagt of waarin het geschreven staat. |
| **Sprekers en geschriften** | een zelfvullende lijst op de pagina van een taal | Alles waarvan het veld *Talen* deze taal noemt — wie haar spreekt, en waar zij geschreven staat. Je vult de band dus maar aan één kant in. |

## Ronde 28 — een chipje ín het vak, de zij-knop, en het pantheon (§56, §57, §58)

| Woord | Waar het staat | Wat het is |
|---|---|---|
| **chipje in het vak** | in de maak-sheets, op een kaartje op de muur, bij een speld en bij een gebeurtenis | Een naam die je noemt wordt meteen een klikbaar chipje, terwijl je typt — niet pas als je op *lezen* klikt (§56). |
| **Verwijst naar** | onder elk plat vak waar je `@` of `[[` kunt typen | De rij klikbare chips onder het vak (§54). In de vakken die live gedeeld worden — de korte beschrijving, de samenvatting, Tekst en Lange tekst — is dit de plek waar de chips staan; daar kan er geen spiegel over het vak, zie §56. |
| **Er is geen {spelersversie} van deze pagina — je staat nu aan de {spelerskant}.** | de melding na een omslag | Wat de zij-knop zegt als de pagina waar je stond geen tweeling heeft: je bent wél omgeslagen, maar je landt op de lijst en niet op een andere gedaante van diezelfde pagina (§57). Zonder tweeling-geval is de melding gewoon *Je staat nu aan de {Keeperkant}.* |
| **Geschriften & Kunstwerken** | soort (`werken`, voorheen `lore`) | Schilderijen, tekeningen, beelden, boeken, handschriften, grimoires, toneelstukken, liederen en overleveringen. Het oude adres `/wiki/lore` werkt niet meer. |
| **Soort werk** | veld op een geschrift of kunstwerk | Keuze uit: *schilderij* · *tekening of prent* · *beeld* · *boek* · *handschrift* · *grimoire* · *toneelstuk* · *lied of gedicht* · *overlevering* · *anders*. |
| **Toont of beweert** | veld op een geschrift of kunstwerk | Waar het werk over gaat. Mag naar álles wijzen: een schilderij toont een plek, een grimoire beweert iets over een god. |
| **Kosmische Goden** | soort | De groten die niet van hier zijn. Eigen velden: **Toestand** (*sluimerend* · *half wakker* · *ontwaakt* · *vertrokken* · *onbekend*) en **Verblijfplaats**. |
| **Aardse Goden** | soort | Wat aan een plek vastzit — dat is het verschil met de rest. Eigen velden: **Standplaats** (→ Locaties) en **Wat men offert**. |
| **Eldritch Entiteiten** | soort | Eigen velden: **Verschijningsvorm** en **Gevaar** (*te mijden* · *dodelijk* · *verstandverbijsterend* · *onbekend*). |
| **Bovennatuurlijke wezens** | soort | Eigen velden: **Aard** (*spook* · *gedaanteverwisselaar* · *huisgeest* · *zeewezen* · *duivels* · *onbekend*) en **Leefgebied** (→ Locaties). |
| **Titels en bijnamen · Domein · Vereerd door · Tekens en voortekenen · Talen · Dienaar van** | velden op alle vier de pantheon-soorten | De gedeelde kern. **Vereerd door** wijst naar Facties, Personen en Onderzoekers — facties vooraan, want een cult is een factie. |
| **Dienaar van** | veld op de vier pantheon-soorten én op een abnormaliteit | Wie deze dient. Je vult de band aan één kant in: aan de kant van de meester verschijnt vanzelf de lijst **Dienaren**. |
| **Dienaren** | een zelfvullende lijst op de pagina van een god of entiteit | Alles waarvan het veld *Dienaar van* deze noemt. |
| **Vereert** | veld op een persoon, een onderzoeker en een factie | De andere kant van *Vereerd door*. |
