# Dutch glossary for the interface

The whole interface is in Dutch. This is the single list of terms so that every
screen says the same thing.

**Since §11's word list, about forty of these are the Keeper's to change.**
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
| entry / entries | fiche / fiches | *de* fiche: an index card in the archive |
| entry type(s) | soort fiche / soorten fiches | |
| case / case file / cases | dossier / dossiers | *het* dossier |
| case note | dossiernotitie | |
| board / clue board / boards | prikbord / prikborden | *het* prikbord |
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

## Navigation

Home → Start · Cases → Dossiers · Wiki → Wiki · Boards → Prikborden ·
Search → Zoeken · You → Jij · Admin → Beheer

Admin panes: Gebruikers · Beoordelen · Soorten fiches · Woorden · Prullenbak ·
Geschiedenis · Site · Export · Logboek

## Buttons and labels

| English | Dutch |
|---|---|
| New entry | Nieuwe fiche |
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
| Use the entry’s crop | Uitsnede van de fiche gebruiken |
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
| Add an entry, or type a name for a note… | Zoek een fiche, of typ een naam voor een notitie… |
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
| Add more | Meer toevoegen |
| Remove this entry | Deze fiche verwijderen |
| Sort: recent / Sort: name | Sorteren: recent / Sorteren: op naam |
| Search names, tags and text… | Zoek op naam, tag of tekst… |
| Add anything to this case… | Voeg iets toe aan dit dossier… |
| Search or create X… | Zoek of maak X… |
| Case name | Naam van het dossier |
| Summary | Samenvatting |
| One line: what is being investigated? | Eén regel: wat wordt er onderzocht? |
| Case notes | Dossiernotities |
| What is the working theory? Type @ or [[ to link an entry. | Wat is de werktheorie? Typ @ of [[ om een fiche te koppelen. |
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
| Opens as soon as the entry opens | Staat open zodra de fiche opengaat |
| The words of this type | De woorden van deze soort |
| The question under the title | De vraag onder de titel |
| The line in the big text box | De regel in het grote tekstvak |
| What the ‘new’ button says | Wat de knop ‘nieuw’ zegt |
| What it says when nothing points here | Wat er staat als niets hiernaar verwijst |
| Nothing yet. This list fills itself as soon as an entry points here. | Nog niets. Deze lijst vult zichzelf zodra een fiche hiernaar wijst. |

## The word list (§11)

| English | Dutch |
|---|---|
| Words | Woorden |
| Things in the archive | Dingen in het archief |
| The menu | Het menu |
| Buttons and headings on an entry | Knoppen en koppen op een fiche |
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
| Who may see this entry | Wie mag deze fiche zien |
| Everyone / Chosen players / Only the Keeper | Iedereen / Gekozen spelers / Alleen de Keeper |
| Revealed to | Onthuld aan |
| Or all at once: | Of in één keer: |
| Sections | Secties |
| Add section | Sectie toevoegen |
| Title of the section | Titel van de sectie |
| Visible to | Zichtbaar voor |
| Locking / Locked / Open to everyone | Vergrendeling / Vergrendeld / Open voor iedereen |

## Toasts and errors

| English | Dutch |
|---|---|
| Card removed. / N cards removed. | Kaart verwijderd. / N kaarten verwijderd. |
| String removed. | Draad verwijderd. |
| X is not in {case}. | X zit nog niet in {case}. |
| File it there | Toevoegen |
| X filed in {case}. | X toegevoegd aan {case}. |
| That did not save. Try again. | Opslaan is niet gelukt. Probeer het opnieuw. |
| That image did not upload. | De afbeelding is niet geüpload. |
| Sign in first. | Log eerst in. |
| Not found | Niet gevonden |
| Give the case a name first. | Geef het dossier eerst een naam. |
| No entry given. | Geen fiche opgegeven. |
| Wrong name or password. | Naam of wachtwoord klopt niet. |
| That invite code is not right. | Die uitnodigingscode klopt niet. |
| That name is taken. | Die naam is al in gebruik. |
| Too many attempts. Try again in fifteen minutes. | Te veel pogingen. Probeer het over een kwartier opnieuw. |

## Relative time (lib/diff.ts)

just now → zojuist · N minutes ago → N minuten geleden (1 → een minuut geleden) ·
N hours ago → N uur geleden · yesterday → gisteren · N days ago → N dagen geleden ·
otherwise a date formatted with `nl-NL`.

## Entry types (seed) — labels and fields

Personages · Onderzoekers · Locaties · Voorwerpen en relieken · Aanwijzingen ·
Abnormaliteiten · Facties · Gebeurtenissen · Overlevering en folklore ·
Sessieverslagen. Field labels and select options are in lib/db/seed.mjs.
