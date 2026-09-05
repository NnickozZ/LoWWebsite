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
| infobox (fields and tags beside the text) | Meer info | was *Meer toevoegen*; a card beside the text on a wide screen, folded under the header on a phone |
| outline of the page | Op deze pagina | the list that scrolls along beside an artikel |
| the managing foot of an artikel | Beheer van dit artikel | rights, proposals, visibility, Keeper notes, the bin |
| the chosen few on a dossier | toegewezen | "Toegewezen: 3"; an artikel or prikbord says *gekozen personen* |
| welcome text (start page) | welkomsttekst | Beheer → Site |

## Navigation

Home → Start · Cases → Dossiers · Wiki → Wiki · Boards → Prikborden ·
Search → Zoeken · You → Jij · Admin → Beheer

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
| Crop for this case | Bijsnijden voor dit dossier |
| Use the entry’s crop | Uitsnede van het artikel gebruiken |
| Options for X | Opties voor X |
| Add cover | Afbeelding toevoegen |
| Replace | Vervangen |
| Crop for lists | Bijsnijden voor lijsten |
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
| Crop | Bijsnijden |
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
| Up to 100 MB (a map) / That picture is over the limit of 10 MB. | tot 100 MB / Die afbeelding is groter dan de limiet van 10 MB. |
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
