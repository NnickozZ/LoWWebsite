/**
 * §11's word list.
 *
 * Every term the interface repeats — artikel, dossier, prikbord, punaise —
 * lives here once, with the Dutch the archive ships with as its default. A
 * Keeper renames any of them under Beheer → Woorden and the whole app follows.
 * Nothing else in the code may hard-code one of these words; if a screen needs
 * a term that is not here, add it here first.
 *
 * Deliberately pure: client components import this, so it must never open the
 * database. `lib/admin/words.ts` is the half that reads and writes settings.
 *
 * Two rules for the defaults below:
 *   1. A default is what the screen says out of the box. (5 Sep 2026: "fiche"
 *      became "artikel" everywhere at Nick's request — the *keys* still say
 *      `entry`, and the code's comments still say fiche here and there; only
 *      what a person reads changed.)
 *   2. Keys never change. They are what a Keeper's override is filed under; a
 *      renamed key would silently drop their word.
 */

export type WordDef = {
  key: string;
  /** What this word is for, in Dutch, shown beside the box. */
  what: string;
  /** What it says unless a Keeper says otherwise. */
  fallback: string;
  hint?: string;
};

export type WordGroup = { title: string; note?: string; words: WordDef[] };

export const WORD_GROUPS: WordGroup[] = [
  {
    title: 'Dingen in het archief',
    note: 'De zelfstandige naamwoorden. Enkelvoud en meervoud apart, want het archief telt ze.',
    words: [
      { key: 'entry', what: 'Eén artikel', fallback: 'artikel' },
      { key: 'entryPlural', what: 'Meer artikelen', fallback: 'artikelen' },
      { key: 'entryType', what: 'Eén soort artikel', fallback: 'soort artikel' },
      { key: 'entryTypePlural', what: 'Meer soorten', fallback: 'soorten artikelen' },
      { key: 'case', what: 'Eén dossier', fallback: 'dossier' },
      { key: 'casePlural', what: 'Meer dossiers', fallback: 'dossiers' },
      { key: 'board', what: 'Eén prikbord', fallback: 'prikbord' },
      { key: 'boardPlural', what: 'Meer prikborden', fallback: 'prikborden' },
      { key: 'card', what: 'Een kaart op een prikbord', fallback: 'kaart' },
      { key: 'note', what: 'Een losse notitie', fallback: 'notitie' },
      { key: 'pin', what: 'Een punaise', fallback: 'punaise', hint: 'De losse speld op een prikbord.' },
      { key: 'string', what: 'Een draad', fallback: 'draad', hint: 'Het rode draadje tussen twee kaarten.' },
      { key: 'section', what: 'Eén sectie', fallback: 'sectie' },
      { key: 'sectionPlural', what: 'Meer secties', fallback: 'secties' },
      { key: 'keeper', what: 'De spelleider', fallback: 'Keeper' },
      { key: 'player', what: 'Eén speler', fallback: 'speler' },
      { key: 'playerPlural', what: 'Meer spelers', fallback: 'spelers' },
      {
        key: 'map',
        what: 'Eén landkaart',
        fallback: 'landkaart',
        hint: 'Niet "kaart": dat woord is al van de kaarten op een prikbord.',
      },
      { key: 'mapPlural', what: 'Meer landkaarten', fallback: 'landkaarten' },
      { key: 'mapPin', what: 'Een speld op een landkaart', fallback: 'speld' },
      { key: 'mapPinPlural', what: 'Meer spelden', fallback: 'spelden' },
      {
        key: 'character',
        what: 'Eén karakter',
        fallback: 'karakter',
        hint: 'Het artikel dat een speler als zichzelf draagt.',
      },
      { key: 'characterPlural', what: 'Meer karakters', fallback: 'karakters' },
      // §32
      { key: 'timeline', what: 'Eén tijdlijn', fallback: 'tijdlijn' },
      { key: 'timelinePlural', what: 'Meer tijdlijnen', fallback: 'tijdlijnen' },
      {
        key: 'event',
        what: 'Eén gebeurtenis op een tijdlijn',
        fallback: 'gebeurtenis',
        hint: 'Een merkteken op een tijdlijn: een artikel, of een losse aantekening die alleen daar bestaat.',
      },
      { key: 'eventPlural', what: 'Meer gebeurtenissen', fallback: 'gebeurtenissen' },
      // §66
      { key: 'familyTree', what: 'Eén stamboom', fallback: 'stamboom' },
      { key: 'familyTreePlural', what: 'Meer stambomen', fallback: 'stambomen' },
      // §75
      {
        key: 'overzicht',
        what: 'Eén overzicht',
        fallback: 'overzicht',
        hint: 'De wegwijzer in de wiki: een pagina die over de wiki gaat in plaats van over de wereld.',
      },
      { key: 'overzichtPlural', what: 'Meer overzichten', fallback: 'overzichten' },
      {
        key: 'looseCard',
        what: 'Een los kaartje in een stamboom',
        fallback: 'los kaartje',
        hint: 'Iemand die in een stamboom staat maar (nog) geen artikel heeft: "Onbekende vader".',
      },
      {
        key: 'treeLine',
        what: 'Een lijn in een stamboom',
        fallback: 'lijn',
        hint: 'De verbinding tussen twee mensen: ouder, kind, partner of verwant.',
      },
    ],
  },
  {
    title: 'Het menu',
    note: 'De plekken in de zijbalk, en de balk onderaan op een telefoon.',
    words: [
      { key: 'navHome', what: 'Start', fallback: 'Start' },
      { key: 'navCases', what: 'Dossiers', fallback: 'Dossiers' },
      { key: 'navWiki', what: 'Wiki', fallback: 'Wiki' },
      { key: 'navBoards', what: 'Prikborden', fallback: 'Prikborden' },
      { key: 'navMaps', what: 'Landkaarten', fallback: 'Landkaarten' },
      { key: 'navTimelines', what: 'Tijdlijnen', fallback: 'Tijdlijnen' },
      // §66
      { key: 'navFamilyTrees', what: 'Stambomen', fallback: 'Stambomen' },
      { key: 'navSearch', what: 'Zoeken', fallback: 'Zoeken' },
      { key: 'navYou', what: 'Jij', fallback: 'Jij' },
      // §43: the web — the archive drawn as what points at what.
      { key: 'navWeb', what: 'Het web', fallback: 'Het web' },
      // §44: de Keeperkant — alleen in de zijbalk, en alleen voor Keepers.
      { key: 'navKeeper', what: 'De Keeperkant', fallback: 'Keeperkant' },
      { key: 'navAdmin', what: 'Beheer', fallback: 'Beheer' },
    ],
  },
  {
    // §44
    title: 'De Keeperkant',
    note:
      'De tweede kant van het archief: de pagina’s die alleen de Keeper ziet, de knop tussen de twee kanten, en de voorvertoning door de ogen van een speler.',
    words: [
      {
        key: 'keeperSide',
        what: 'De kant van het archief die alleen de Keeper ziet',
        fallback: 'Keeperkant',
        hint: 'Zowel het stempel op zo’n pagina als de naam van de lijst in het menu.',
      },
      // §50: de andere kant heeft ook een naam nodig — het bericht dat je van
      // kant wisselt noemt ze allebei, en niets in de code mag zo'n woord
      // hardcoderen.
      {
        key: 'playerSide',
        what: 'De kant van het archief die de spelers zien',
        fallback: 'spelerskant',
      },
      {
        key: 'keeperVersion',
        what: 'De knop naar de Keeperversie van deze pagina',
        fallback: 'Keeperversie',
      },
      {
        key: 'playerVersion',
        what: 'De knop terug naar de spelersversie',
        fallback: 'Spelersversie',
      },
      // §46: de spiegel — de knop rechtsboven, die het hele archief omklapt.
      // Wat er staat is waar hij héén gaat, niet waar je nu bent.
      {
        key: 'toKeeperSide',
        what: 'De knop rechtsboven, op weg naar de Keeperkant',
        fallback: 'Naar de Keeperkant',
        hint: 'Ook de sneltoets k. Alleen de Keeper ziet deze knop.',
      },
      {
        key: 'toPlayerSide',
        what: 'Dezelfde knop, op weg terug naar de spelerskant',
        fallback: 'Naar de spelerskant',
      },
      {
        key: 'asPlayer',
        what: 'Kijken door de ogen van een speler',
        fallback: 'Kijk als speler',
        hint: 'Zolang dit aanstaat is de Keeper voor het hele archief een speler.',
      },
    ],
  },
  {
    title: 'Rechten en karakters',
    note: 'Wie wat mag, en als wie iemand speelt.',
    words: [
      { key: 'rights', what: 'De kop boven wie mag kijken en bewerken', fallback: 'Rechten' },
      { key: 'playsAs', what: 'Boven het gekozen karakter', fallback: 'Je speelt als' },
      { key: 'asYourself', what: 'De keuze om geen karakter te dragen', fallback: 'Als jezelf' },
      { key: 'yourCharacters', what: 'De kop op de Jij-pagina', fallback: 'Jouw karakters' },
      { key: 'thisIsMyCharacter', what: 'De knop op een artikel', fallback: 'Dit is mijn karakter' },
      { key: 'onTheMap', what: 'De kop op een artikel met spelden', fallback: 'Op de landkaart' },
      { key: 'onTheTimeline', what: 'De kop op een artikel dat op een tijdlijn staat', fallback: 'Op de tijdlijn' },
      // §24: waar een artikel vandaan komt, en wat er staat als dat nergens is.
      {
        key: 'fromCase',
        what: 'Boven de titel: uit welk dossier dit komt',
        fallback: 'Uit',
        hint: 'Er komt een dubbele punt en de naam van het dossier achter.',
      },
      {
        key: 'noCase',
        what: 'Het merkje bij een artikel zonder dossier',
        fallback: 'Zonder dossier',
        hint: 'Alleen bij soorten die je alleen in een dossier maakt.',
      },
      {
        key: 'assigned',
        what: 'De gekozen personen bij een dossier',
        fallback: 'Toegewezen',
        hint: 'Wie een vertrouwelijk dossier mag zien. Bij artikelen en prikborden blijft het "gekozen personen".',
      },
    ],
  },
  {
    title: 'Knoppen en koppen op een artikel',
    words: [
      { key: 'newEntry', what: 'De grote knop in het menu', fallback: 'Nieuw artikel' },
      { key: 'newOfType', what: 'Nieuw, per soort', fallback: 'Nieuw' },
      { key: 'addToCase', what: 'Toevoegen aan een dossier', fallback: 'Aan dossier toevoegen' },
      { key: 'pinToBoard', what: 'Prikken op een prikbord', fallback: 'Op prikbord prikken' },
      // §43: the button on every page that opens the web with that thing in the middle.
      { key: 'connections', what: 'Naar het web, vanaf een pagina', fallback: 'Verbindingen' },
      { key: 'addMore', what: 'De kop boven de velden en tags', fallback: 'Meer info' },
      { key: 'onThisPage', what: 'De kop boven de inhoudsopgave', fallback: 'Op deze pagina' },
      { key: 'manage', what: 'De kop boven rechten en Keeper-instellingen', fallback: 'Beheer van dit artikel' },
      { key: 'backlinks', what: 'De kop boven de verwijzingen', fallback: 'Genoemd in' },
      // §27: "Genoemd in" telt de soorten bronnen, elk onder een eigen kopje.
      // Sinds §66 zijn dat er vijf: de stamboom kwam erbij.
      { key: 'mentionedInCases', what: 'Genoemd in: het kopje boven de dossiers', fallback: 'In dossiers' },
      {
        key: 'mentionedInEntries',
        what: 'Genoemd in: het kopje boven de artikelen',
        fallback: 'In artikelen',
        hint: 'Een veld in een infobox of een sectie die hiernaar verwijst.',
      },
      { key: 'mentionedOnBoards', what: 'Genoemd in: het kopje boven de prikborden', fallback: 'Op prikborden' },
      { key: 'mentionedOnMaps', what: 'Genoemd in: het kopje boven de landkaarten', fallback: 'Op landkaarten' },
      { key: 'mentionedOnTimelines', what: 'Genoemd in: het kopje boven de tijdlijnen', fallback: 'Op tijdlijnen' },
      // §66
      {
        key: 'mentionedOnFamilyTrees',
        what: 'Genoemd in: het kopje boven de stambomen',
        fallback: 'In stambomen',
      },
      { key: 'history', what: 'De kop boven de versies', fallback: 'Geschiedenis' },
      {
        key: 'visibilityAndReveals',
        what: 'De kop boven de Keeper-helft van Rechten',
        fallback: 'De Keeper: wat weet de camping al?',
      },
      { key: 'keeperNotes', what: 'De kop boven de geheime notities', fallback: 'Notities van de Keeper' },
      { key: 'deleteEntry', what: 'De kop boven de prullenbakknop', fallback: 'Dit artikel verwijderen' },
      // §90 schrijven
      {
        key: 'saveOffline',
        what: 'Wat er naast Lezen staat als iets nog niet binnen is en de lijn weg is',
        fallback: 'Nog niet opgeslagen — wordt bewaard zodra de verbinding terug is',
        hint: 'Komt in plaats van "Opslaan…" als er geen verbinding is, of als er na vijf seconden nog geen antwoord kwam.',
      },
      { key: 'coverMenu', what: 'De knop met het menu van de omslag', fallback: 'Omslag' },
      {
        key: 'cropHintPointer',
        what: 'Uitleg bij het bijsnijden, met een muis',
        fallback: 'Sleep om te verschuiven; scrol om te zoomen.',
      },
      {
        key: 'cropHintTouch',
        what: 'Uitleg bij het bijsnijden, op een aanraakscherm',
        fallback: 'Sleep om te verschuiven; knijp om te zoomen.',
      },
      {
        key: 'sectionWhoReads',
        what: 'Onder een sectie van een speler: wie hem leest',
        fallback: 'Iedereen die dit {ding} mag lezen, ziet deze {sectie}.',
        hint: '{ding} wordt het woord voor artikel, dossier of overzicht; {sectie} jouw woord voor een sectie.',
      },
      {
        key: 'newEntryWhoReads',
        what: 'Onder Aanmaken in het maakblad, voor een speler',
        fallback: 'Iedereen aan tafel kan dit lezen. Rechten aanpassen kan daarna onder ‘{beheer}’.',
        hint: '{beheer} is de kop boven rechten en Keeper-instellingen op een artikel.',
      },
      {
        key: 'writingAsGoOn',
        what: 'De knop in "Met wie ben je nu aan het schrijven?" die het karakter van je account kiest',
        fallback: 'Verder als {naam}',
      },
      { key: 'skipToContent', what: 'De verborgen link naar de inhoud, voor wie met Tab loopt', fallback: 'Naar de inhoud' },
      { key: 'tabBar', what: 'De naam van de balk onderaan op een telefoon, voor een schermlezer', fallback: 'Tabbalk' },
      {
        key: 'passwordReset',
        what: 'De zin over een vergeten wachtwoord (inschrijven en Jij)',
        fallback: 'De {keeper} kan een nieuw wachtwoord voor je instellen als je het vergeet.',
      },
    ],
  },
  {
    title: 'De tabbladen in Beheer',
    note: 'Alleen de namen van de tabbladen hierboven — niet wat erin staat.',
    words: [
      { key: 'adminTitle', what: 'De titel van deze pagina', fallback: 'Beheer' },
      { key: 'adminUsers', what: 'Gebruikers', fallback: 'Gebruikers' },
      { key: 'adminReview', what: 'Beoordelen', fallback: 'Beoordelen' },
      { key: 'adminTypes', what: 'Soorten artikelen', fallback: 'Soorten artikelen' },
      { key: 'adminWords', what: 'Woorden', fallback: 'Woorden' },
      { key: 'adminTrash', what: 'Prullenbak', fallback: 'Prullenbak' },
      { key: 'adminHistory', what: 'Geschiedenis', fallback: 'Geschiedenis' },
      { key: 'adminSite', what: 'Site', fallback: 'Site' },
      { key: 'adminExport', what: 'Export', fallback: 'Export' },
      { key: 'adminAudit', what: 'Logboek', fallback: 'Logboek' },
    ],
  },
  // §90 canvas
  {
    title: 'Tekenvlakken en Beheer',
    note:
      'Zinnen op een leeg prikbord, en drie in Beheer. Wat tussen accolades staat ' +
      'wordt ingevuld; laat het staan als je de zin herschrijft.',
    words: [
      {
        key: 'boardEmptyRead',
        what: 'Een leeg prikbord, in Lezen',
        fallback: 'Kies Bewerken om iets op dit {prikbord} te prikken.',
      },
      {
        key: 'boardEmptyFind',
        what: 'Een leeg prikbord, in Bewerken: zoeken',
        fallback: 'Zoek hierboven een {artikel} om te prikken.',
      },
      {
        key: 'boardEmptyMake',
        what: 'Een leeg prikbord, in Bewerken: zelf iets maken',
        fallback: 'Of begin een {notitie}, of een losse {punaise} op de muur.',
      },
      {
        key: 'boardEmptyString',
        what: 'Een leeg prikbord, in Bewerken op een groot scherm: een draad',
        fallback: 'Sleep vanaf de kop van een {punaise} voor een {draad}.',
        hint: 'Niet op een telefoon: daar kan een vinger geen draad spannen.',
      },
      {
        key: 'keeperPromoteTitle',
        what: 'De vraag vóór iemand Keeper wordt',
        fallback: 'Van {naam} een {keeper} maken?',
      },
      {
        key: 'keeperPromoteMessage',
        what: 'Wat die vraag uitlegt',
        fallback: '{naam} ziet dan alles, ook de {keeperkant}.',
      },
      { key: 'keeperPromoteYes', what: 'Het ja op die vraag', fallback: 'Ja, tot {keeper} maken' },
      {
        key: 'adminNewPasswordFor',
        what: 'Boven het vak voor een nieuw wachtwoord',
        fallback: 'Nieuw wachtwoord voor {naam}',
      },
      {
        key: 'trashTypeName',
        what: 'In het vak waarin je de naam overtypt om te vernietigen',
        fallback: 'Typ de naam',
      },
    ],
  },
  {
    title: 'Aanwezig',
    note:
      'Wie er is, waar ze zijn en wat ze doen (§76), en de spelerspagina waar dat ' +
      'naartoe wijst (§77).',
    words: [
      { key: 'presence', what: 'Hoe dit heet', fallback: 'Aanwezig' },
      { key: 'presenceHeading', what: 'De kop boven het lijstje', fallback: 'Wie is er?' },
      { key: 'presenceAlone', what: 'Als er niemand anders is', fallback: 'Je bent hier alleen.' },
      {
        key: 'presenceElsewhere',
        what: 'Waar iemand is, als jij daar niet bij mag',
        fallback: 'ergens anders in het archief',
        hint:
          'Eén zin voor álle verborgen plekken. Verschil tussen een Keeperartikel en ' +
          'een privé prikbord is zelf het lek — zie §76.',
      },
      { key: 'presenceResting', what: 'Een venster dat even niets doet', fallback: 'even weg' },
      { key: 'presenceKeeperHere', what: 'De Keeper, gezien door een speler', fallback: 'is er' },
      { key: 'presenceEarlier', what: 'Boven het staartje van wie net nog er was', fallback: 'Net nog' },
      { key: 'presenceInvisible', what: 'De Keeper die zich onzichtbaar maakte', fallback: 'onzichtbaar' },
      { key: 'presenceOtherTabs', what: 'Nog ergens anders open (aantal erachter)', fallback: 'en nog ergens' },
      { key: 'verbLooking', what: 'Doet niets bijzonders', fallback: 'kijkt' },
      { key: 'verbTyping', what: 'Typt in een tekst', fallback: 'typt' },
      { key: 'verbDrawing', what: 'Tekent op een laag', fallback: 'tekent' },
      { key: 'verbDragging', what: 'Sleept iets', fallback: 'verplaatst iets' },
      { key: 'nudge', what: 'Iemand hierheen vragen', fallback: 'Kom kijken' },
      { key: 'nudgeAsks', what: 'Tussen de naam en de plek', fallback: 'vraagt je bij' },
      { key: 'nudgeRefused', what: 'Als die ander daar niet bij mag', fallback: 'Daar kan die niet bij.' },
      { key: 'presenceGoTo', what: 'De knop naast iemand in het lijstje: daarheen gaan', fallback: 'Ga naar' },
      {
        key: 'presenceGoToWho',
        what: 'Voor een schermlezer: naar wie de knop je brengt',
        fallback: 'Ga naar {naam}',
        hint: 'Het gat {naam} is wie je volgt; je komt waar die kijkt.',
      },
      { key: 'presenceMore', what: 'Voor een schermlezer: hoeveel mensen er niet als schijfje staan', fallback: 'en nog {n}' },
      { key: 'nudgeGo', what: 'De knop in de uitnodiging om erheen te gaan', fallback: 'Ga' },
      { key: 'nudgeAsked', what: 'Na Kom kijken: het is gevraagd', fallback: 'gevraagd' },
      { key: 'nudgeNoFollow', what: 'In de uitnodiging: wegklikken', fallback: 'Wegklikken' },
      { key: 'yourAccount', what: 'Boven je eigen accountpagina', fallback: 'Jouw account' },
      {
        key: 'youMarker',
        what: 'Waaraan je je eigen regel in de hal herkent',
        fallback: '(jij)',
        hint: 'Je eigen regel staat bovenaan; dit is het woord dat zegt waarom.',
      },
      { key: 'onlineNow', what: 'Iemand die nu in het archief is', fallback: 'online' },
      { key: 'wears', what: 'De kolom met wie ze dragen', fallback: 'Draagt' },
      { key: 'spelerPage', what: 'De pagina van één speler', fallback: 'Spelerspagina' },
      { key: 'spelerPagePlural', what: "Meer spelerspagina's", fallback: "Spelerspagina's" },
    ],
  },
  {
    title: 'De kamer',
    note:
      '§79: de kamer van één onderzoeker, de plekken erin, en waarmee je ze opent en ' +
      'vult. De munt heet wat jij wilt: verander hem hier en de hele site volgt — hij ' +
      'staat nergens in een tabelnaam, een adres of een stylesheet.',
    words: [
      { key: 'room', what: 'De kamer van één onderzoeker', fallback: 'kamer' },
      { key: 'roomPlural', what: 'Meer kamers', fallback: 'kamers' },
      { key: 'slot', what: 'Eén plek in een kamer', fallback: 'plek' },
      { key: 'slotPlural', what: 'Meer plekken', fallback: 'plekken' },
      {
        key: 'currency',
        what: 'Waarmee je een plek opent of vult',
        fallback: 'munt',
        hint: 'Gulden, kristal, scherf — verander hem hier en de hele site volgt.',
      },
      { key: 'currencyPlural', what: 'Meer daarvan', fallback: 'munten' },
      { key: 'roomEmpty', what: 'Een kamer waar nog niets in ligt', fallback: 'Nog niets neergezet.' },
      {
        key: 'furnishing',
        what: 'Eén ding dat een kamer inricht',
        fallback: 'stuk huisraad',
        hint: 'Alleen de Keeper maakt ze, ze hebben een prijs, en ze zeggen wat ze je geven (§80).',
      },
      {
        key: 'furnishingPlural',
        what: 'Meer daarvan',
        fallback: 'huisraad',
        hint: '"Huisraad" heeft geen meervoud — de zin eromheen moet het dragen, niet het woord.',
      },
      { key: 'catalogue', what: 'De lijst met wat er te koop is', fallback: 'Catalogus' },
      { key: 'buy', what: 'Kopen (de knop)', fallback: 'Kopen' },
      { key: 'price', what: 'Wat iets kost', fallback: 'Prijs' },
      { key: 'notForSale', what: 'Als er geen prijs op staat', fallback: 'Staat niet te koop' },
      { key: 'catalogueEmpty', what: 'Als er niets te koop is dat hier past', fallback: 'Hier is niets voor te koop.' },
      {
        key: 'roomEffects',
        what: 'De kop boven wat alles bij elkaar je geeft',
        fallback: 'Wat deze kamer je geeft',
        hint: 'Het archief zet de regels onder elkaar. Het telt niets op en beslist niets — dat doet de tafel.',
      },
      { key: 'typeKeeperMade', what: 'Vinkje bij een soort: alleen jij maakt deze', fallback: 'Alleen de Keeper maakt deze' },
      { key: 'typeOneOfAKind', what: 'Vinkje bij een soort: er is er één van', fallback: 'Er is er maar één van' },
      { key: 'fieldKey', what: 'De sleutel van een veld (in Beheer)', fallback: 'Sleutel' },
      { key: 'roomOf', what: 'Tussen "kamer" en de naam', fallback: 'van' },
      { key: 'slotLocked', what: 'Een plek die nog op slot zit', fallback: 'Op slot' },
      { key: 'slotOpen', what: 'Een plek openen (de knop)', fallback: 'Openen' },
      { key: 'slotEmpty', what: 'Een open plek waar niets op ligt', fallback: 'Leeg' },
      { key: 'slotPlace', what: 'Iets neerzetten (de knop)', fallback: 'Neerzetten' },
      { key: 'slotClear', what: 'Iets weghalen (de knop)', fallback: 'Weghalen' },
      {
        key: 'slotVeiled',
        what: 'Er ligt iets, maar jij mag niet weten wat',
        fallback: 'Er ligt iets',
        hint:
          'Eén zin voor élke reden dat je het niet mag zien — een Keepervoorwerp en de ' +
          'andere kant krijgen dezelfde. Het verschil zou zelf het lek zijn (§76).',
      },
      { key: 'ledger', what: 'Het grootboek', fallback: 'Grootboek' },
      {
        key: 'ledgerGive',
        what: 'De Keeper geeft iets (de knop)',
        fallback: 'Geven',
        hint:
          '§84: stond hier tot ronde 45 als "Uitgeven", wat het tegenovergestelde ' +
          'betekent — uitgeven doe je in de winkel, de Keeper gééft.',
      },
      { key: 'ledgerWhy', what: 'Waarvoor, op een regel in het grootboek', fallback: 'Waarvoor?' },
      {
        key: 'purse',
        what: 'Je beurs, het blokje met je saldo',
        fallback: 'Je beurs',
        hint: 'Wat er hardop gelezen wordt bij het saldo rechtsboven. Eén tik brengt je naar je kamer.',
      },
      {
        key: 'shortfall',
        what: 'Wat er nog aan ontbreekt',
        fallback: 'Nog {n} nodig',
        hint: '{n} wordt het bedrag. Laat het staan, anders staat het getal er niet meer bij.',
      },
      {
        key: 'boughtHere',
        what: 'Nadat je iets gekocht of neergezet hebt',
        fallback: '{ding} ligt nu op je {plek}.',
        hint: '{ding} wordt de naam, {plek} de soort plek.',
      },
      { key: 'unlockedHere', what: 'Nadat je een plek geopend hebt', fallback: 'Je {plek} is open.' },
      { key: 'clearedHere', what: 'Nadat je iets weggehaald hebt', fallback: '{ding} is weggehaald.' },
      { key: 'toastShow', what: 'De knop in zo’n melding', fallback: 'Bekijk' },
      { key: 'shop', what: 'De winkel — alles wat te koop is', fallback: 'Winkel' },
      { key: 'shopEmpty', what: 'Als er nog niets te koop is', fallback: 'Er staat nog niets te koop.' },
      { key: 'shopNoSlot', what: 'Je kunt het betalen, maar je hebt er geen plek voor', fallback: 'Geen vrije plek van deze soort' },
      { key: 'shopOwned', what: 'Dit heb je al in je kamer', fallback: 'Staat al in je kamer' },
      {
        key: 'shopOwnedCount',
        what: 'Als je er al meer dan één van hebt',
        fallback: '{n}× in je kamer',
        hint: 'Sinds §83 mag hetzelfde ding vaker in één kamer staan; dit telt ze.',
      },
      { key: 'shopAll', what: 'Het filter dat alles toont', fallback: 'Alles' },
      {
        key: 'keeperGuest',
        what: 'Wat de Keeper leest in de kamer van een ander',
        fallback: 'Je kijkt mee in de kamer van {naam}.',
      },
      {
        key: 'keeperGuestGift',
        what: 'En wat dat voor zijn knoppen betekent',
        fallback: 'Neerzetten is gratis; openen betaalt {naam} zelf.',
      },
      { key: 'shopTaken', what: 'Er is er één van en een ander heeft hem', fallback: 'Iemand anders heeft hem' },
      { key: 'shopFor', what: 'Boven de keuze voor welke onderzoeker je koopt', fallback: 'Kopen voor' },
      { key: 'shopKeeper', what: 'Wat de Keeper hier leest', fallback: 'Jij zet dingen zelf neer; dit is de prijslijst.' },
      {
        key: 'shopNoCharacter',
        what: 'Wat iemand zonder onderzoeker hier leest',
        fallback: 'Je draagt nog geen onderzoeker, dus je hebt nog geen kamer om iets in te zetten.',
        hint: 'Niet hetzelfde als de Keeper: die zet dingen zelf neer, deze persoon kan nog nergens iets kwijt.',
      },
      {
        key: 'handout',
        what: 'Aan iedereen tegelijk uitdelen (de pagina en de knop)',
        fallback: 'Uitdelen',
        hint: 'Eén reden, één knop: iedereen krijgt hetzelfde omdat ze samen iets gedaan hebben.',
      },
      { key: 'handoutTitle', what: 'De kop boven de uitdeelpagina', fallback: 'Munten uitdelen' },
      {
        key: 'handoutAll',
        what: 'Het ene getal dat iedereen krijgt die je aanvinkt',
        fallback: 'Bedrag voor wie je aanvinkt',
        hint:
          'Verander je dit, dan springt elk **aangevinkt** bedrag eronder mee — ook wat je ' +
          'met de hand had aangepast. §85: heette "Iedereen", en dat las als een kolomkop ' +
          'boven de lijst. §86: heette "Voor iedereen", en dat was niet meer waar toen de ' +
          'lijst leeg begon — het vult wat je gekozen hebt. §90: "Voor wie je aanvinkt" ' +
          'las als *wie*, boven een vak waar een bedrag in moet.',
      },
      {
        key: 'handoutAmount',
        what: 'Het vakje naast één naam',
        fallback: 'Bedrag',
        hint: 'Wat een schermlezer voorleest bij het bedrag van één kamer. Staat er niet zichtbaar bij.',
      },
      {
        key: 'handoutRunning',
        what: 'Wat de knop op dit moment zou uitdelen',
        fallback: '{munten} naar {kamers}',
        hint:
          '{munten} wordt het totaal, {kamers} het aantal kamers met hun woord. Het is een ' +
          'optelling van wat jij net getypt hebt en nooit een som over het archief (rule 78).',
      },
      { key: 'handoutDoneShort', what: 'Wat de knop even zegt nadat het gelukt is', fallback: 'Uitgedeeld' },
      { key: 'handoutWhy', what: 'Waarvoor er uitgedeeld wordt', fallback: 'Waarvoor?' },
      {
        key: 'handoutHint',
        what: 'De zin onder het globale getal',
        fallback:
          'Zoek, vink aan wie iets krijgt, en pas een bedrag gerust met de hand aan. ' +
          'Iemand uitvinken of op 0 zetten betekent hetzelfde: die krijgt niets.',
      },
      {
        key: 'handoutEmpty',
        what: 'Als er nog geen kamers zijn om aan uit te delen',
        fallback:
          'Er is nog niemand om aan uit te delen. Koppel een onderzoeker aan een speler, ' +
          'of maak er zelf een kamer voor op het artikel van een onderzoeker.',
        hint:
          '§86: zei "Er draagt nog niemand een onderzoeker", en dat is sinds deze ronde ' +
          'niet meer de enige manier om aan een kamer te komen.',
      },
      { key: 'handoutDone', what: 'Nadat er uitgedeeld is', fallback: 'Uitgedeeld.' },
      {
        key: 'ledgerSlotLine',
        what: 'Een regel die een plek opende',
        fallback: '{plek} geopend',
        hint:
          '{plek} wordt de soort plek. §85: las tot ronde 46 als "Plek: plank" — een ' +
          'veldnaam met een dubbele punt, geen zin over iets dat gebeurd is.',
      },
      { key: 'ledgerItemLine', what: 'Een regel die iets kocht', fallback: '{ding} gekocht' },
      {
        key: 'ledgerFrom',
        what: 'Een regel die de Keeper geschreven heeft',
        fallback: 'Van de {keeper}: {reden}',
        hint: '{keeper} is jouw woord voor de spelleider, {reden} wat er in het vakje stond.',
      },
      { key: 'ledgerFromPlain', what: 'Idem, zonder dat er een reden bij stond', fallback: 'Van de {keeper}' },
      { key: 'ledgerEmpty', what: 'Een grootboek waar nog niets in staat', fallback: 'Nog geen regels.' },
      {
        key: 'ledgerAll',
        what: 'Het hele grootboek openklappen',
        fallback: 'Alles tonen',
        hint: 'Het boek staat ingeklapt op de laatste drie regels; dit vouwt de rest open.',
      },
      { key: 'ledgerFewer', what: 'En weer dicht', fallback: 'Minder tonen' },
      {
        key: 'roomEffectsNone',
        what: 'Als er nog niets ligt dat iets doet',
        fallback: 'Nog niets dat je iets geeft.',
        hint: 'Er staat een deur naar de winkel naast — dit is de kop van een lege kamer, geen fout.',
      },
      {
        key: 'slotClearOne',
        what: 'Het kruisje waarmee je iets weghaalt',
        fallback: 'Weghalen: {ding}',
        hint: 'Alleen voor een schermlezer: op het scherm is het een ×, en die zegt niet wát hij weghaalt.',
      },
      {
        key: 'roomPanelLine',
        what: 'De samenvatting van een kamer op een spelerspagina',
        fallback: '{open} van {alle} open · {gevuld} gevuld',
        hint:
          '{open} is hoeveel plekken er open staan, {alle} hoeveel er zijn mét hun woord ' +
          '("12 plekken"), {gevuld} hoeveel er iets op ligt.',
      },
      { key: 'toRoom', what: 'De deur terug naar de kamer', fallback: 'Naar de {kamer}' },
      {
        key: 'roomOpen',
        what: 'De Keeper maakt een kamer voor een onderzoeker (de knop)',
        fallback: 'Kamer maken',
        hint:
          '§86: staat op het artikel van een onderzoeker die niemand draagt. Een kamer ' +
          'van een gedragen karakter ontstaat vanzelf; deze maak jij. §90: heette ' +
          '"Een kamer geven", en *Geven* is wat de Keeper met munten doet.',
      },
      { key: 'roomOpened', what: 'Nadat dat gelukt is', fallback: '{naam} heeft nu een kamer.' },
      {
        key: 'handoutSearch',
        what: 'Het zoekvak boven de uitdeellijst',
        fallback: 'Zoek een onderzoeker of speler',
      },
      {
        key: 'handoutPicked',
        what: 'Hoeveel er aangevinkt staan',
        fallback: '{n} van {alle} aangevinkt',
      },
      { key: 'handoutPickShown', what: 'Alles aanvinken wat het filter toont', fallback: 'Alles in beeld' },
      { key: 'handoutPickNone', what: 'En weer niets', fallback: 'Niets' },
      {
        key: 'handoutNoMatch',
        what: 'Als het zoekvak niets oplevert',
        fallback: 'Niemand met die naam.',
      },
      {
        key: 'handoutNobody',
        what: 'Achter de naam van een onderzoeker die niemand draagt',
        fallback: 'niemand draagt deze',
      },
      {
        key: 'handoutResting',
        what: 'Achter een karakter dat wel gehouden maar niet gespeeld wordt',
        fallback: 'niet in gebruik',
        hint:
          '§86: de lijst had deze karakters altijd al, maar niets zei dat — dus leek het ' +
          'alsof je alleen aan het actieve karakter kon geven.',
      },
      { key: 'toPlayers', what: 'De deur naar de hal', fallback: 'Naar de {spelers}' },
      { key: 'toCharacters', what: 'De deur naar je karakters', fallback: 'Naar je karakters' },
      { key: 'toCases', what: 'De deur naar de dossiers', fallback: 'Naar de {dossiers}' },
      { key: 'plekMuur', what: 'Een plek aan de muur', fallback: 'muur' },
      { key: 'plekPlank', what: 'Een plek op een plank', fallback: 'plank' },
      { key: 'plekBureau', what: 'Een plek op het bureau', fallback: 'bureau' },
      { key: 'plekKist', what: 'Een plek in de kist', fallback: 'kist' },
      // §90 economie
      { key: 'toShop', what: 'De deur naar de winkel', fallback: 'Naar de {winkel}' },
      { key: 'toHandout', what: 'De deur naar de uitdeler (alleen de Keeper)', fallback: 'Naar de uitdeler' },
      {
        key: 'shopForName',
        what: 'De koopknop, als je meer dan één onderzoeker draagt',
        fallback: 'Kopen voor {naam}',
        hint: '{naam} is de onderzoeker wiens munten je uitgeeft. De prijs komt er vanzelf achter.',
      },
      {
        key: 'buyLandsOn',
        what: 'De koopknop zegt waar het ding terechtkomt',
        fallback: '{knop} → {plek}',
        hint: '{knop} is "Kopen · 3 munten", {plek} de soort plek waar het landt.',
      },
      { key: 'roomSwitch', what: 'Boven de knoppen om naar je andere kamer te gaan', fallback: 'Kamer van' },
      {
        key: 'roomEffectsNoneOf',
        what: 'Als er in de kamer van een ander nog niets ligt dat iets doet',
        fallback: 'Nog niets dat {naam} iets geeft.',
      },
      {
        key: 'keeperGuestNobody',
        what: 'Wat de Keeper leest in een kamer die niemand draagt',
        fallback: 'Niemand draagt {naam}: jij richt deze kamer in.',
      },
      {
        key: 'keeperGuestNobodyGift',
        what: 'En wat dat voor zijn knoppen betekent',
        fallback: 'Neerzetten is gratis; openen gaat van het saldo van deze kamer.',
      },
      {
        key: 'grantDone',
        what: 'Nadat de Keeper in het grootboek iets gegeven heeft',
        fallback: '{bedrag} naar {naam}',
        hint: '{bedrag} is bijvoorbeeld "+10 munten", {naam} de onderzoeker.',
      },
      { key: 'grantAmount', what: 'Het bedragvak in het grootboek (voorgelezen)', fallback: 'Hoeveel?' },
      {
        key: 'boughtThere',
        what: 'Nadat je iets neergezet hebt in de kamer van een ander',
        fallback: '{ding} ligt nu op de {plek} van {naam}.',
      },
      {
        key: 'unlockedThere',
        what: 'Nadat je een plek geopend hebt in de kamer van een ander',
        fallback: 'De {plek} van {naam} is open.',
      },
      {
        key: 'pickHave',
        what: 'Het tabblad in de plek-kiezer met wat je al hebt',
        fallback: 'Wat je al hebt',
      },
      { key: 'pickSearch', what: 'Het zoekvak in de plek-kiezer (voorgelezen)', fallback: 'Zoeken' },
      { key: 'pickSearchHint', what: 'De grijze tekst in dat zoekvak', fallback: 'Zoeken…' },
      { key: 'pickNothing', what: 'Als er niets is dat op deze plek past', fallback: 'Niets dat hier past.' },
      { key: 'pickLoading', what: 'Terwijl de catalogus binnenkomt', fallback: 'Even kijken…' },
      { key: 'roomNone', what: 'Een spelerspagina van iemand zonder kamer', fallback: 'Nog geen {kamer}.' },
      { key: 'charactersNone', what: 'Een spelerspagina van iemand zonder karakter', fallback: 'Nog geen {karakters}.' },
      {
        key: 'keeperWearsNone',
        what: 'Op de spelerspagina van een Keeper',
        fallback: 'De {keeper} draagt geen {karakter}: die is overal de {keeper}.',
      },
      { key: 'wearsNow', what: 'Onder het karakter dat iemand nu speelt', fallback: 'Speelt nu' },
      { key: 'playAs', what: 'De knop op een artikel om dit karakter te gaan spelen', fallback: 'Speel als {naam}' },
      {
        key: 'handoutLeft',
        what: 'In de voet van de uitdeler, als er nog vinkjes staan maar geen bedrag',
        fallback: 'Nog {n} aangevinkt',
        hint: 'Na een uitdeling blijven de vinkjes staan; dit zegt dat een nieuw bedrag naar dezelfde mensen gaat.',
      },
      { key: 'feedRoomPlaced', what: 'In het feed: iemand zette iets in een kamer', fallback: 'zette' },
      { key: 'feedRoomCleared', what: 'In het feed: iemand haalde iets uit een kamer', fallback: 'haalde' },
      { key: 'feedRoomIn', what: 'Na het ding: in wiens kamer', fallback: 'in de kamer van {naam}' },
      { key: 'feedRoomOut', what: 'Na het ding: uit wiens kamer', fallback: 'uit de kamer van {naam}' },
      { key: 'feedRoomOwnIn', what: 'Idem, als het de eigen kamer was', fallback: 'in de eigen kamer' },
      { key: 'feedRoomOwnOut', what: 'Idem, uit de eigen kamer', fallback: 'uit de eigen kamer' },
      { key: 'feedRoomSome', what: 'Idem, als je niet mag zien wiens kamer het is', fallback: 'in een kamer' },
      { key: 'feedRoomSomeOut', what: 'Idem, uit een kamer die je niet mag zien', fallback: 'uit een kamer' },
    ],
  },
  // §96 zoeken, beheer en de losse eindjes
  {
    title: 'Zoeken, Beheer en de losse eindjes',
    note:
      'Zoeken over alles, de Keeperkant van een artikel in speler-termen, Beheer en /you. ' +
      'Wat tussen accolades staat wordt ingevuld.',
    words: [
      { key: 'searchOthers', what: 'Op Zoeken: de kop boven dossiers, vlakken en spelers', fallback: 'Andere dingen' },
      {
        key: 'searchNone',
        what: 'Op Zoeken, als niets overeenkomt',
        fallback: 'Niets in het archief heet zo, en geen artikel noemt het.',
      },
      {
        key: 'searchNoneInType',
        what: 'Op Zoeken, als niets onder de gekozen soort overeenkomt',
        fallback: 'Niets onder {soort}. Kies Alles om verder te zoeken.',
      },
      { key: 'wordsFilter', what: 'Beheer → Woorden: het zoekvak bovenaan', fallback: 'Zoek een woord…' },
      {
        key: 'wordsChanged',
        what: 'Beheer → Woorden: naast een groep, hoeveel woorden afwijken',
        fallback: '{n} aangepast',
      },
      {
        key: 'wordsNoMatch',
        what: 'Beheer → Woorden: als het zoekvak niets vindt',
        fallback: 'Geen woord past bij je zoekopdracht.',
      },
      {
        key: 'wordsDirty',
        what: 'Beheer → Woorden: in de voet, als er iets niet is opgeslagen',
        fallback: '{n} niet opgeslagen',
      },
      { key: 'typeTargetsPick', what: 'Beheer → Soorten: de knop die de doel-soorten openklapt', fallback: 'Kies soorten' },
      { key: 'typeTargetsAll', what: 'Idem, als er geen soort gekozen is', fallback: 'Elke soort' },
      {
        key: 'youCharsWhy',
        what: 'Op /you: de ene regel boven je karakters',
        fallback: 'Kies wie je speelt; alles wat je doet draagt die naam.',
      },
      { key: 'youWhy', what: 'Op /you: de knop die de uitleg openklapt', fallback: 'Waarom?' },
      {
        key: 'keeperSeesTwin',
        what: 'Keeperkant van een pagina voor de tafel: wat spelers zien',
        fallback: 'Spelers zien: deze pagina, niet de {versie}.',
        hint: '{versie} is jouw woord voor Keeperversie, in kleine letters.',
      },
      {
        key: 'keeperSeesTwinOwn',
        what: 'Idem, op de Keeperversie zelf',
        fallback: 'Spelers zien: de {versie}, niet deze pagina.',
        hint: '{versie} is jouw woord voor spelersversie, in kleine letters.',
      },
      {
        key: 'keeperSeesPage',
        what: 'Idem, als "Deze pagina is van de Keeper" aan staat',
        fallback: 'Spelers zien: niets. De pagina bestaat voor hen niet.',
      },
      {
        key: 'keeperSeesPageOff',
        what: 'Idem, als dat vinkje uit staat',
        fallback: 'Spelers zien deze pagina. Aangevinkt: niets meer.',
      },
      {
        key: 'keeperSeesSection',
        what: 'Idem, bij een sectie die alleen van de Keeper is',
        fallback: 'Spelers zien: de pagina, zonder deze sectie.',
      },
      {
        key: 'keeperSeesSome',
        what: 'Idem, bij een sectie voor gekozen spelers',
        fallback: 'Andere spelers zien: de pagina, zonder deze sectie.',
      },
      {
        key: 'keeperSeesAll',
        what: 'Idem, bij een sectie voor iedereen',
        fallback: 'Spelers zien: de pagina, met deze sectie.',
      },
      { key: 'viewAsPlayer', what: 'De knop naast die zin', fallback: 'Bekijk als speler' },
      {
        key: 'characterFindHint',
        what: 'Zonder karakter: de zin die zegt hoe je er één krijgt',
        fallback: 'Maak het {artikel} van je {karakter} en koppel het hier.',
        hint: '{artikel} en {karakter} zijn jouw woorden voor artikel en karakter.',
      },
    ],
  },
  // §91 jouw plek
  {
    title: 'Jouw plek',
    note:
      'De zijbalk op een computer, het Jij-blad op een telefoon en de rij bovenaan Start: ' +
      'alles van jou op één plek. Wat tussen accolades staat wordt ingevuld.',
    words: [
      {
        key: 'navGroupYours',
        what: 'De kop boven kamer, winkel, spelerspagina en spelers in de zijbalk',
        fallback: 'Jouw plek',
      },
      { key: 'navGroupArchive', what: 'De kop boven Start, Dossiers, Wiki en de tekenvlakken', fallback: 'Het archief' },
      {
        key: 'navMyPage',
        what: 'De deur naar je eigen spelerspagina',
        fallback: 'Mijn {spelerspagina}',
        hint: '{spelerspagina} is jouw woord voor de pagina van één speler, in kleine letters.',
      },
      {
        key: 'navSettings',
        what: 'De deur naar je account: lettertype, kleuren, wachtwoord',
        fallback: 'Instellingen',
        hint: 'Op een computer staat hier "Jij" naast; op een telefoon is het een knop in het Jij-blad.',
      },
      {
        key: 'searchBox',
        what: 'Het zoekvak bovenin het palet (voorgelezen)',
        fallback: 'Zoek in het archief',
      },
      { key: 'searchBoxHint', what: 'De grijze tekst in het zoekvak van het palet', fallback: 'Zoek…' },
      {
        key: 'shortcutsLine',
        what: 'De regel onder Nieuw artikel met de sneltoetsen',
        fallback: '{n} nieuw · {zoek} zoeken',
        hint: '{n} en {zoek} worden de toetsen zelf.',
      },
      { key: 'shortcutsKeeper', what: 'En voor de Keeper erachter', fallback: '{k} kant' },
      { key: 'writesAs', what: 'Boven het karakter waarmee dit venster schrijft, als dat een ander is', fallback: 'Je schrijft als' },
      {
        key: 'switchPlay',
        what: 'De knop in het Jij-blad die je karakters openklapt',
        fallback: 'Speel als',
      },
      {
        key: 'pickCharacter',
        what: 'De deur voor wie nog geen karakter heeft',
        fallback: 'Kies je {karakter}',
        hint: '{karakter} is jouw woord voor karakter.',
      },
      {
        key: 'onlineCount',
        what: 'Achter Spelers: hoeveel anderen er nu zijn',
        fallback: '{n} online',
      },
      {
        key: 'homeJijRecent',
        what: 'Op Start, boven de laatste drie dingen die jij bewerkte',
        fallback: 'Laatst door jou',
      },
      {
        key: 'homeJijNone',
        what: 'Op Start, als je nog niets bewerkte',
        fallback: 'Nog niets bewerkt.',
      },
    ],
  },  // §94 tekenvlakken
  {
    title: 'Tekenvlakken: vinden en terug',
    note:
      'Zoeken op een prikbord of stamboom, de sprong naar een datum op een tijdlijn, en de ' +
      'deur van een artikel naar zijn stamboom. Wat tussen accolades staat wordt ingevuld.',
    words: [
      {
        key: 'findOnCanvas',
        what: 'Het zoekvak op een prikbord of stamboom in Lezen (voorgelezen)',
        fallback: 'Zoek op dit vlak',
      },
      { key: 'findOnCanvasHint', what: 'De grijze tekst in dat zoekvak', fallback: 'Vind een naam…' },
      { key: 'findNothing', what: 'Als niets op het vlak zo heet', fallback: 'Niets op dit vlak heet zo.' },
      { key: 'findOnBoard', what: 'De bovenste groep in de zoeklijst van een prikbord', fallback: 'Op dit {prikbord}' },
      { key: 'findOnTree', what: 'De bovenste groep in de zoeklijst van een stamboom', fallback: 'Op deze {stamboom}' },
      { key: 'goToDate', what: 'De sprong naar een datum op een tijdlijn', fallback: 'Ga naar…' },
      {
        key: 'goToDateHint',
        what: 'De grijze tekst in dat vak',
        fallback: '1934, of maart 1934',
      },
      { key: 'goToDateUnknown', what: 'Als die datum niet te lezen is', fallback: 'Die datum kan ik niet lezen.' },
      {
        key: 'entryInTree',
        what: 'De deur van een artikel naar de stamboom waarin het staat',
        fallback: 'In {stamboom}: {naam}',
        hint: '{stamboom} is jouw woord voor stamboom, {naam} de naam van de stamboom.',
      },
      { key: 'treeHandleParent', what: 'Het woord op de +-knop boven een kaartje', fallback: 'Ouder' },
      { key: 'treeHandleChild', what: 'Het woord op de +-knop onder een kaartje', fallback: 'Kind' },
      { key: 'treeHandlePartner', what: 'Het woord op de +-knop rechts van een kaartje', fallback: 'Partner' },
      { key: 'treeHandleSibling', what: 'Het woord op de +-knop links van een kaartje', fallback: 'Broer/zus' },
      { key: 'boardStringStart', what: 'De knop in het paneel van een kaart die een draad begint', fallback: 'Touwtje' },
      {
        key: 'boardStringPick',
        what: 'Wat er staat terwijl je de tweede kaart kiest',
        fallback: 'Tik op de tweede {kaart} voor de {draad}.',
      },
      { key: 'boardStringCancel', what: 'De knop die dat afbreekt', fallback: 'Toch niet' },
      { key: 'boardInCase', what: 'Onder de vouw: in welk dossier het prikbord hangt', fallback: 'Hangt in' },
      { key: 'mapLinksOf', what: 'Op de telefoon, voor het artikel waar een landkaart van is', fallback: 'Van' },
      { key: 'mapLinksOn', what: 'Op de telefoon, voor de grotere landkaart waar hij op staat', fallback: 'Op' },
    ],
  },
  // §92 de korte vakken
  {
    title: 'Schrijven',
    note:
      'De korte vakken, het maakblad, een artikel op de telefoon en de wiki-lijst. ' +
      'Wat tussen accolades staat wordt ingevuld; laat het staan als je de zin herschrijft.',
    words: [
      {
        key: 'mentionHint',
        what: 'Grijze tekst in een kort vak: hoe je een artikel noemt',
        fallback: 'Typ @ of [[ om een {artikel} te noemen.',
        hint: '{artikel} is jouw woord voor artikel.',
      },
      {
        key: 'mentionHintShort',
        what: 'Dezelfde hint, kort, in een smal vak van de infobox',
        fallback: '@ of [[ noemt iets',
      },
      {
        key: 'placeOnButton',
        what: 'De knop op een artikel die het op een landkaart of tijdlijn zet',
        fallback: 'Op een {landkaart} of {tijdlijn} zetten…',
      },
      {
        key: 'placeOnTitle',
        what: 'De kop van het blad dat die knop opent',
        fallback: 'Waar zet je dit {artikel} op?',
      },
      {
        key: 'placeOnOther',
        what: 'Onderaan dat blad: een andere kiezen dan de laatste',
        fallback: 'Alle {meervoud}…',
        hint: '{meervoud} wordt landkaarten of tijdlijnen.',
      },
      {
        key: 'fieldsFillEmpty',
        what: 'In de bewerkstand: de knop die de lege velden van de infobox openklapt',
        fallback: 'Veld invullen',
      },
      {
        key: 'fieldsEmptyCount',
        what: 'Achter die knop: hoeveel velden nog leeg zijn',
        fallback: '{n} leeg',
      },
      {
        key: 'infoboxMore',
        what: 'Op een telefoon: de ingeklapte infobox openklappen',
        fallback: 'Alle gegevens',
      },
      {
        key: 'newEntryTypeMore',
        what: 'In het maakblad: alle soorten tonen',
        fallback: 'Alle soorten',
      },
      {
        key: 'newEntryInCase',
        what: 'In het maakblad: de regel met het dossier',
        fallback: 'In {dossier}',
        hint: '{dossier} is jouw woord voor dossier.',
      },
      {
        key: 'newEntryNoCase',
        what: 'Die regel, als er geen dossier gekozen is',
        fallback: 'Geen',
      },
      {
        key: 'newEntryDidYouMean',
        what: 'Onder de naam in het maakblad, boven bestaande namen',
        fallback: 'Bestaat al:',
      },
      { key: 'wikiViewList', what: 'Op de wiki: de lijst met één regel per artikel', fallback: 'Lijst' },
      { key: 'wikiViewCards', what: 'Op de wiki: de kaarten', fallback: 'Kaarten' },
      { key: 'wikiViewLabel', what: 'De naam van die twee knoppen samen (voorgelezen)', fallback: 'Weergave' },
      { key: 'wikiTagRow', what: 'De rij tags onder de soorten (voorgelezen)', fallback: 'Tags' },
    ],
  },
  // §95 één regel, één id
  {
    title: 'Eén regel, één id',
    note: 'Het korte vak met chips: de korte beschrijving, de samenvatting en een Tekst of Lange tekst in de infobox.',
    words: [
      {
        key: 'mentionListLabel',
        what: 'De lijst met namen onder @ of [[ (voorgelezen)',
        fallback: 'Artikelen',
      },
    ],
  },
  // §93 de kamer, tweede pas
  {
    title: 'De kamer: lade, verplaatsen en terugbrengen',
    note:
      'De lade van een kamer (wat je bezit en niet op een plek staat), Verplaatsen, en ' +
      'Ongedaan maken vlak na een koop. Wat tussen accolades staat wordt ingevuld.',
    words: [
      { key: 'drawer', what: 'De lade van een kamer (kop)', fallback: 'In de lade' },
      {
        key: 'drawerTag',
        what: 'Achter een ding in de plek-kiezer dat in je lade ligt',
        fallback: 'In je lade',
      },
      {
        key: 'drawerTagCount',
        what: 'Idem, als er meer dan één ligt',
        fallback: 'In je lade · {n}',
      },
      {
        key: 'clearedToDrawer',
        what: 'Nadat je huisraad weghaalde: het ligt in de lade',
        fallback: '{ding} ligt nu in je lade.',
      },
      {
        key: 'clearedToDrawerOf',
        what: 'Idem, in de kamer van een ander',
        fallback: '{ding} ligt nu in de lade van {naam}.',
      },
      { key: 'buyUndo', what: 'De knop in de koopmelding die de koop terugdraait', fallback: 'Ongedaan maken' },
      {
        key: 'buyReturned',
        what: 'Nadat een koop ongedaan is gemaakt',
        fallback: '{ding} teruggebracht: {bedrag} terug.',
        hint: '{bedrag} is bijvoorbeeld "3 munten".',
      },
      { key: 'ledgerReturnLine', what: 'Een regel in het grootboek: een koop teruggedraaid', fallback: '{ding} teruggebracht' },
      { key: 'slotMove', what: 'Iets naar een andere plek zetten (de knop)', fallback: 'Verplaatsen' },
      { key: 'slotMoveOne', what: 'Idem, voorgelezen met de naam', fallback: 'Verplaats {ding}' },
      {
        key: 'moveHint',
        what: 'Terwijl je verplaatst: wat je nu doet',
        fallback: 'Kies een plek voor {ding}.',
      },
      { key: 'moveHere', what: 'Op een plek waar het heen kan', fallback: 'Hierheen' },
      { key: 'moveHereOne', what: 'Idem, voorgelezen met de naam', fallback: '{ding} hierheen' },
      { key: 'moveCancel', what: 'Stoppen met verplaatsen', fallback: 'Annuleren' },
      {
        key: 'moveNowhere',
        what: 'Als er geen open plek is waar het heen kan',
        fallback: 'Geen vrije plek waar dit past.',
      },
      {
        key: 'shopOpenKind',
        what: 'In de winkel, als er geen vrije plek is maar wel één op slot',
        fallback: '{plek} openen',
        hint: '{plek} is de soort plek. De prijs komt er vanzelf achter.',
      },
      { key: 'shopInDrawer', what: 'In de winkel: je hebt er een in je lade', fallback: 'Ligt in je lade' },
      {
        key: 'roomEffectsOf',
        what: 'De kop boven de effecten, in de kamer van een ander',
        fallback: 'Wat deze kamer {naam} geeft',
      },
      { key: 'feedRoomBought', what: 'In het feed: iemand kocht iets voor een kamer', fallback: 'kocht' },
      {
        key: 'feedRoomOpened',
        what: 'In het feed: iemand opende een plek (daarna de onderzoeker)',
        fallback: 'opende een plek in de kamer van',
      },
      { key: 'hallRoomOf', what: 'In de hal: de deur naar de kamer van een karakter', fallback: 'Naar de kamer van {naam}' },
      {
        key: 'newFurnishing',
        what: 'In het Nieuw-blad voor huisraad: de kop boven plek, prijs en effect',
        fallback: 'In de winkel',
      },
      {
        key: 'newFurnishingDone',
        what: 'Nadat de Keeper huisraad maakte',
        fallback: '{naam} staat in de {winkel}.',
      },
      { key: 'toastShop', what: 'De knop in die melding', fallback: 'Bekijk in de {winkel}' },
      {
        key: 'furnishingNotForSale',
        what: 'Nadat de Keeper huisraad maakte zonder plek of prijs',
        fallback: '{naam} is nog niet te koop: geef het een plek en prijs.',
      },
    ],
  },
  // §99 de vlakken, derde pas
  {
    title: 'Tekenvlakken: derde pas',
    note: 'De beschrijving van een prikbord en de woorden bij de knoppen van de stamboom.',
    words: [
      { key: 'boardDescriptionLabel', what: 'Onder de vouw van een prikbord: het vak voor de beschrijving', fallback: 'Beschrijving' },
      {
        key: 'boardDescriptionPlaceholder',
        what: 'Grijze tekst in dat vak zolang het leeg is',
        fallback: 'Waar gaat dit {prikbord} over? Typ @ om een {artikel} te noemen.',
        hint: '{prikbord} en {artikel} zijn jouw woorden.',
      },
      {
        key: 'boardDescriptionRefused',
        what: 'Als het archief de beschrijving niet bewaart',
        fallback: 'De beschrijving van dit {prikbord} is niet opgeslagen.',
      },
      { key: 'treeHandleBoth', what: 'Het woord op de +-knop tussen twee gekozen kaartjes', fallback: 'Kind van beide' },
    ],
  },
  // golf M — de stamboom: terug, vooruit, en een kind aan de lijn
  {
    title: 'De stamboom (golf M)',
    note:
      'Ongedaan maken en opnieuw doen op een stamboom, ook voor een lijn die op een artikel staat; de + op de lijn ' +
      'tussen twee ouders; en het menu onder de rechtermuisknop. {lijn} is jouw woord voor een lijn in een stamboom.',
    words: [
      { key: 'treeLineRemoved', what: 'De melding na het weghalen van een lijn', fallback: '{Lijn} weggehaald.' },
      { key: 'treeUndoAction', what: 'De knop in die melding', fallback: 'Ongedaan maken' },
      {
        key: 'treeUndoUnchanged',
        what: 'Als ongedaan maken of opnieuw doen een lijn niet terugzet, omdat iemand hem intussen al veranderde',
        fallback: 'Die {lijn} is intussen al veranderd; daar is niets aan gedaan.',
      },
      {
        key: 'treeUndoProposed',
        what: 'Als ongedaan maken of opnieuw doen een lijn niet zelf mag schrijven en een voorstel indient',
        fallback: 'Als voorstel ingediend: de {keeper} beslist.',
      },
      {
        key: 'treeUndoRefused',
        what: 'Als ongedaan maken of opnieuw doen een lijn niet terug kon zetten',
        fallback: 'Die {lijn} kon niet worden teruggezet.',
      },
      { key: 'treeUndoGone', what: 'Als de knop in een melding te laat is: er is sindsdien meer veranderd', fallback: 'Er is sindsdien meer veranderd; gebruik Ctrl+Z.' },
      { key: 'treeRedo', what: 'De knop naast Ongedaan maken op een stamboom', fallback: 'Opnieuw doen' },
      {
        key: 'treeLineChildOf',
        what: 'De + op de lijn tussen twee ouders (voorgelezen)',
        fallback: 'Kind van {a} en {b} toevoegen',
      },
      { key: 'treeLineChildOfOne', what: 'De + op de lijn onder één ouder (voorgelezen)', fallback: 'Kind van {a} toevoegen' },
      { key: 'treeMenuAddChild', what: 'In het menu van een lijn tussen twee ouders', fallback: 'Kind toevoegen' },
      { key: 'treeMenuOf', what: 'De naam van het menu onder de rechtermuisknop (voorgelezen)', fallback: 'Menu bij {naam}' },
      {
        key: 'treeConnectHint',
        what: 'Wat een schermlezer hoort terwijl je een lijn uit een + sleept',
        fallback: 'Laat los op een kaartje om ze te verbinden; op het lege papier gebeurt er niets.',
      },
    ],
  },
  // golf M — samen op een vlak: het zachte slot, en wat een ander weghaalt
  {
    title: 'Samen op een vlak (golf M)',
    note:
      'Op een prikbord, landkaart, tijdlijn of stamboom met meer mensen tegelijk. {naam} is de naam van wie iets ' +
      'vasthoudt, of van het ding zelf in de zin over weghalen.',
    words: [
      {
        key: 'liveHeldBy',
        what: 'Als je iets probeert te pakken dat een ander op dat moment sleept',
        fallback: '{naam} heeft dit vast',
      },
      {
        key: 'liveTakenFirst',
        what: 'Als jij en een ander hetzelfde in dezelfde tel pakten, en de ander het kreeg',
        fallback: '{naam} pakte dit net eerder.',
      },
      {
        key: 'liveGoneByOther',
        what: 'Als iets dat je gekozen of open had, door een ander is weggehaald',
        fallback: '{naam} is net door iemand anders weggehaald.',
      },
    ],
  },
  // §100 ronde 61 — het palet en één opslaan
  {
    title: 'Het palet',
    note:
      'Het venster dat / of Ctrl/⌘K opent, op elke pagina: zoeken, wat je onlangs opende, en handelingen. Wat tussen accolades staat wordt ingevuld.',
    words: [
      { key: 'paletteTitle', what: 'De naam van het palet (voorgelezen)', fallback: 'Zoek of ga naar' },
      { key: 'paletteDoor', what: 'De knop die het palet opent (zijbalk en Jij-blad)', fallback: 'Zoek of ga naar…' },
      { key: 'paletteRecent', what: 'De kop boven wat je laatst opende', fallback: 'Onlangs' },
      {
        key: 'paletteRecentNone',
        what: 'Als je nog niets opende',
        fallback: 'Wat je opent, staat hier de volgende keer.',
      },
      { key: 'paletteActions', what: 'De kop boven de handelingen', fallback: 'Handelingen' },
      { key: 'paletteSearching', what: 'Terwijl het palet zoekt', fallback: 'Zoeken…' },
      { key: 'paletteNone', what: 'Als niets op naam past', fallback: 'Niets in het archief heet zo.' },
      {
        key: 'paletteSearchAll',
        what: 'De laatste regel: naar de zoekpagina',
        fallback: 'Zoek ‘{q}’ in het hele archief',
      },
      {
        key: 'paletteKeys',
        what: 'De regel onderaan het palet met de toetsen',
        fallback: '↑↓ kiezen · Enter openen · Esc terug · > handelingen',
      },
      { key: 'actNewCase', what: 'Handeling: een nieuw dossier', fallback: 'Nieuw {dossier}' },
      { key: 'actNewBoard', what: 'Handeling: een nieuw prikbord', fallback: 'Nieuw {prikbord}' },
      { key: 'actNewTimeline', what: 'Handeling: een nieuwe tijdlijn', fallback: 'Nieuwe {tijdlijn}' },
      { key: 'actNewMap', what: 'Handeling: een nieuwe landkaart (alleen de Keeper)', fallback: 'Nieuwe {landkaart}' },
      { key: 'actNewTree', what: 'Handeling: een nieuwe stamboom', fallback: 'Nieuwe {stamboom}' },
      { key: 'actPlayAs', what: 'Handeling: een ander karakter spelen', fallback: 'Speel als {naam}' },
      {
        key: 'shortcutsPalette',
        what: 'De toetsen voor het palet in de sneltoetsregel',
        fallback: '{slash} of {mod}',
        hint: '{slash} en {mod} worden de toetsen zelf: / en Ctrl K (⌘K op een Mac).',
      },
    ],
  },
  // §101 de losse eindjes
  {
    title: 'De losse eindjes',
    words: [
      {
        key: 'drawerGiveLabel',
        what: 'In een kamer, voor de Keeper: de kop boven het vak waarmee hij huisraad in de lade legt',
        fallback: 'In de lade leggen',
      },
      { key: 'drawerGivePlaceholder', what: 'Het zoekvak daaronder', fallback: 'Zoek huisraad…' },
      { key: 'drawerGiveButton', what: 'De knop die het gekozen ding in de lade legt', fallback: 'In de lade' },
      {
        key: 'drawerGiveDone',
        what: 'De melding daarna',
        fallback: '{ding} ligt nu in de lade van {naam}.',
        hint: '{ding} is wat erin ging, {naam} de onderzoeker van de kamer.',
      },
      {
        key: 'drawerGiveOnlyKeeper',
        what: 'Als een speler toch iets rechtstreeks in een lade probeert te leggen',
        fallback: 'Alleen de {keeper} legt iets rechtstreeks in een lade.',
      },
      { key: 'drawerGiveNoRoom', what: 'Als de kamer niet (meer) bestaat', fallback: 'Die kamer bestaat niet.' },
      {
        key: 'drawerGiveNotFurnishing',
        what: 'Als het gekozen artikel geen huisraad is',
        fallback: 'Alleen huisraad gaat in een lade. Een voorwerp zet je op een plek.',
      },
      {
        key: 'somethingWrong',
        what: 'Als een knop in de kamer mislukt en de server geen eigen zin gaf',
        fallback: 'Er is iets misgegaan.',
      },
      {
        key: 'fontNote',
        what: 'Op /you, achter Waarom? bij Lettertype',
        fallback: 'De stempels, de tabbladen en de letter op een omslag blijven staan — die zijn het archief zelf.',
      },
      {
        key: 'colourNoteKeeper',
        what: 'Op /you, achter Waarom? bij Kleuren, voor de Keeper',
        fallback:
          'De kleuren van de {keeper} verschijnen vanzelf op de pagina’s die alleen van de {keeper} zijn — daar hoef je niets voor te kiezen, licht of donker blijft jouw keuze.',
      },
      {
        key: 'colourNotePlayer',
        what: 'Op /you, achter Waarom? bij Kleuren, voor een speler',
        fallback: 'De {keeper} kiest de kleuren van het archief zelf; jij kiest alleen of je ze licht of donker leest.',
      },
      { key: 'searchLabel', what: 'Op het zoekscherm: de naam van het zoekvak', fallback: 'Zoeken in het archief' },
      { key: 'searchPlaceholder', what: 'Het zoekvak, onder Alles', fallback: 'Zoek op naam, tag, wat dan ook…' },
      { key: 'searchPlaceholderIn', what: 'Het zoekvak, met een soort gekozen', fallback: 'Zoek in {soort}…' },
      { key: 'searchIn', what: 'De naam van de rij soorten onder het zoekvak', fallback: 'Zoek in' },
      { key: 'searchAll', what: 'De eerste keuze in die rij', fallback: 'Alles' },
      {
        key: 'searchHint',
        what: 'Onder een leeg zoekvak',
        fallback: 'Typ om te zoeken. Druk overal op {toets} om hier te komen.',
        hint: '{toets} wordt de toets / getekend.',
      },
      { key: 'searchInText', what: 'De kop boven artikelen waarin het woord in de tekst staat', fallback: 'Genoemd in de tekst' },
      { key: 'searchCreate', what: 'De knop onder de resultaten', fallback: '‘{naam}’ aanmaken' },
    ],
  },
  // ── ronde 65·a — beweging en meldingen: eigen groep direct hieronder ──
  //
  //
  //
  // ── ronde 65·b — navigatie: eigen groep direct hieronder ──
  {
    title: 'Navigatie',
    note: 'Wat een schermlezer hoort terwijl een pagina onderweg is. Op het scherm is het een streep of een skelet, zonder woorden.',
    words: [
      {
        key: 'navLoading',
        what: 'De naam van de streep bovenaan en van het skelet, terwijl een pagina laadt',
        fallback: 'Pagina wordt geladen',
      },
    ],
  },
  //
  //
  //
  // ── ronde 65·c — voorbeeldkaart en omslag: eigen groep direct hieronder ──
  {
    title: 'De voorbeeldkaart',
    note: 'Het kaartje dat opkomt als je een naam aanwijst, of er op een telefoon lang op drukt.',
    words: [
      { key: 'previewOpen', what: 'De link rechtsonder op het kaartje', fallback: 'Openen →' },
      {
        key: 'previewLabel',
        what: 'Wat een schermlezer over het kaartje zegt',
        fallback: 'Voorbeeld van {naam}',
        hint: '{naam} wordt de naam van het artikel.',
      },
    ],
  },
  //
  //
  //
  // ── ronde 66 — het moment in de kamer: eigen groep direct hieronder ──
  // §103 herstel (F2): de winkel en de kamer na de design-review.
  {
    title: 'De winkel en de kamer',
    note: '§103, herstel: de prijs één keer per rij, en de zin onder het geluid op Jij.',
    words: [
      {
        key: 'shopOpenFirst',
        what: 'In de winkel: de knop als er eerst een plek open moet',
        fallback: 'Eerst een {plek} openen ({n}), dan {prijs}',
        hint: '{plek} is de soort plek, {n} wat openen kost en {prijs} wat het ding daarna kost. Op het scherm zijn het kale getallen; een schermlezer hoort "5 munten".',
      },
      {
        key: 'soundHint',
        what: 'Op /you: de zin onder Geluid in de kamer',
        fallback: 'Een tik, een munt, een stempel — alleen in de kamer en de winkel.',
      },
    ],
  },
  {
    title: 'Het geld klinkt',
    note: '§103: de woorden van het moment — kopen, neerzetten, een gift die binnenkomt, en het geluid.',
    words: [
      {
        key: 'buyShort',
        what: 'De koopknop in de winkel, kort',
        fallback: '{knop} → {plek}',
        hint: '{knop} is "Kopen" (of "Kopen voor …" als de kiezer buiten beeld is) en {plek} waar het landt. De prijs staat als stempel erboven; {n} (het bedrag) mag er ook in.',
      },
      { key: 'buyBought', what: 'Wat de koopknop zegt, meteen na de klik', fallback: 'Gekocht' },
      {
        key: 'furnishedStamp',
        what: 'De stempel bij de eerste koop ooit in een kamer',
        fallback: 'Ingericht',
        hint: 'Eén keer per kamer. Hij staat in kapitalen, zoals elke stempel.',
      },
      {
        key: 'grantArrived',
        what: 'De melding als de Keeper je munten geeft',
        fallback: '+{bedrag} van de {keeper} — {reden}',
        hint: '{bedrag} is "12 munten", {reden} wat de Keeper erbij schreef.',
      },
      {
        key: 'grantArrivedPlain',
        what: 'Dezelfde melding, als de Keeper geen reden schreef',
        fallback: '+{bedrag} van de {keeper}',
      },
      { key: 'shopOwnedShort', what: 'Op een winkelrij, als het in je kamer staat', fallback: 'Staat in je kamer' },
      { key: 'shopOwnedShow', what: 'De deur achter die zin, naar de tegel', fallback: 'Bekijk' },
      { key: 'soundLabel', what: 'Op /you: de schakelaar voor het geluid', fallback: 'Geluid in de kamer' },
      { key: 'soundOff', what: 'Het geluid staat uit', fallback: 'Uit' },
      { key: 'soundOn', what: 'Het geluid staat aan', fallback: 'Aan' },
      {
        key: 'soundNote',
        what: 'Op /you, achter Waarom? bij het geluid',
        fallback:
          'Een munt als je iets krijgt, een tik als iets neerkomt, een stempel bij een koop, een sleutel bij een plek die opengaat. Nooit bij typen of opslaan. Alleen in deze browser.',
      },
    ],
  },
  //
  //
  //
  // ── ronde 67 — de leeskamer: eigen groep direct hieronder ──
  // §104
  {
    title: 'De leeskamer',
    note: 'De voorpagina van de wiki, Verras me, Genoemd in met de zin, en de kleine regels in een artikel.',
    words: [
      { key: 'wikiRecent', what: 'Op de wiki: de kop boven wat het laatst bijgewerkt is', fallback: 'Onlangs bijgewerkt' },
      { key: 'wikiRecentAll', what: 'De deur naast die kop, naar de hele lijst', fallback: 'Alles op volgorde' },
      { key: 'wikiRecentNone', what: 'Als er aan deze kant nog niets bijgewerkt is', fallback: 'Hier is nog niets bijgewerkt.' },
      {
        key: 'wikiRecentWho',
        what: 'Onder een kaart bij Onlangs: wie en wanneer',
        fallback: '{naam} · {wanneer}',
        hint: '{naam} is het karakter dat de versie schreef, {wanneer} bijvoorbeeld "4 dagen geleden".',
      },
      { key: 'wikiFromArchive', what: 'Op de wiki: de kop boven één willekeurig artikel', fallback: 'Uit het archief' },
      { key: 'wikiOneMore', what: 'De knop die een ander willekeurig artikel kiest', fallback: 'Nog één' },
      { key: 'wikiReadOn', what: 'De knop naar dat artikel', fallback: 'Lezen' },
      { key: 'wikiArchiveNone', what: 'Als er aan deze kant nog niets in het archief staat', fallback: 'Aan deze kant staat nog niets.' },
      { key: 'wikiKinds', what: 'Op de wiki: de kop boven de tegels van de soorten', fallback: 'De soorten' },
      { key: 'surpriseMe', what: 'Handeling in het palet: een willekeurig artikel openen', fallback: 'Verras me' },
      { key: 'headingLinkCopied', what: 'De melding na een klik op het # naast een kop', fallback: 'Link gekopieerd' },
      {
        key: 'headingLinkNotCopied',
        what: 'Als de browser niet laat kopiëren',
        fallback: 'Kopiëren lukte niet. Het adres is {adres}',
      },
      { key: 'headingLinkLabel', what: 'Voorleestekst van het # naast een kop', fallback: 'Link naar ‘{kop}’ kopiëren' },
      { key: 'headingLinkTitle', what: 'Het tooltipje bij dat #', fallback: 'Link naar deze kop kopiëren' },
      {
        key: 'lastEditBy',
        what: 'Onder de korte beschrijving: wie het artikel het laatst bijwerkte',
        fallback: 'Bijgewerkt door {naam}',
        hint: '{naam} is het karakter dat de laatste versie schreef.',
      },
      { key: 'lastEditVersions', what: 'Daarachter: hoeveel versies er zijn', fallback: '{n} versies' },
      { key: 'lastEditOneVersion', what: 'Hetzelfde, als er één is', fallback: '{n} versie' },
      { key: 'coverOpen', what: 'Voorleestekst van de omslag in Lezen (een tik opent hem groot)', fallback: '{naam} groot bekijken' },
      { key: 'coverClose', what: 'De knop die de grote omslag sluit', fallback: 'Sluiten' },
      {
        key: 'derivedTwinNote',
        what: 'Onder een lijst die zichzelf vult en dezelfde kop draagt als een koppelingsveld',
        fallback: 'Met wie in het veld {veld} staat.',
        hint: 'Zo’n lijst neemt de namen uit dat veld erbij. Geef het veld of de lijst een andere naam om ze los te zetten.',
      },
      // §104 (ronde 67·herstel, F3)
      {
        key: 'entryWhereOn',
        what: 'Op een telefoon, de regel onder de knoppen van een artikel: op hoeveel landkaarten of tijdlijnen het staat',
        fallback: 'op {n} {ding}',
        hint: '{ding} is het woord voor landkaart of tijdlijn, enkel- of meervoud. De delen staan met · achter elkaar.',
      },
      {
        key: 'entryWhereIn',
        what: 'Dezelfde regel: in hoeveel dossiers het ligt',
        fallback: 'in {n} {ding}',
        hint: '{ding} is het woord voor dossier, enkel- of meervoud.',
      },
      {
        key: 'historyNone',
        what: 'Onder Geschiedenis, als er geen versie is die deze lezer mag zien',
        fallback: 'Nog geen versie om terug te lezen.',
      },
      {
        key: 'listShownOf',
        what: 'Boven een lange lijst in de wiki: hoeveel er staan van hoeveel er zijn',
        fallback: '{n} van {totaal} {artikelen}',
        hint: '{artikelen} is het woord voor artikelen.',
      },
      { key: 'listMore', what: 'De knop onder zo’n lijst die de volgende laat zien', fallback: 'Meer' },
      {
        key: 'mentionedNone',
        what: 'Onder Genoemd in, als nog niets naar dit artikel verwijst (één gedempte regel)',
        fallback: 'Nog nergens genoemd.',
      },
      {
        key: 'listNone',
        what: 'Onder een lijst die zichzelf vult, zolang er nog niets in staat (één gedempte regel)',
        fallback: 'Nog niets.',
      },
      { key: 'listMoreLeft', what: 'Naast die knop: hoeveel er nog komen', fallback: 'nog {n}' },
    ],
  },
  // ── golf h1 — de schil: eigen groep direct hieronder ──
  {
    title: 'De schil',
    note: 'De schakelaar tussen de twee kanten, de tabbalk op de telefoon, het palet zonder uitkomst en de kleine regels bij zoeken en tekenen.',
    words: [
      {
        key: 'sideSwitchPlayers',
        what: 'Op een computer, de schakelaar in de zijbalk: de helft van de spelerskant',
        fallback: 'Spelers',
      },
      {
        key: 'sideSwitchKeeper',
        what: 'Dezelfde schakelaar: de helft van de Keeperkant',
        fallback: 'Keeper',
      },
      {
        key: 'paletteNothingFor',
        what: 'In het palet, als niets past bij wat je typte',
        fallback: 'Niets gevonden voor ‘{zoek}’ — Enter zoekt in alles',
        hint: '{zoek} is wat er in het vak staat.',
      },
      {
        key: 'paletteNoActionFor',
        what: 'In het palet, na >, als geen handeling past',
        fallback: 'Geen handeling heet ‘{zoek}’.',
        hint: '{zoek} is wat er na de > staat.',
      },
      {
        key: 'searchHintTouch',
        what: 'Onder een leeg zoekvak, op een aanraakscherm (daar is geen toets /)',
        fallback: 'Typ om te zoeken.',
      },
      { key: 'notFoundStamp', what: 'De stempel op de pagina die er niet is (404)', fallback: 'Niet in het archief' },
      { key: 'notFoundTitle', what: 'De kop van die pagina', fallback: 'Deze pagina is er niet.' },
      {
        key: 'notFoundBody',
        what: 'De zin eronder. Hij noemt niets: wie iets niet mag zien, hoort ook niet dat het bestaat.',
        fallback: 'Hij bestaat niet, of hij is niet van jou om te lezen. De rest van het archief staat er nog.',
      },
      { key: 'notFoundHome', what: 'De knop terug naar Start', fallback: 'Naar het begin' },
      {
        key: 'canvasHintTouch',
        what: 'Onder een tekenvlak op een aanraakscherm',
        fallback: 'sleep om te schuiven, knijp om te zoomen',
      },
    ],
  },
  // ── golf h2 — de economie: eigen groep direct hieronder ──
  // §103 golf H (h2): de kamer, de winkel, het uitdelen en de meldingen na design-review 3.
  {
    title: 'De economie, laatste pas',
    note: '§103, golf H: een kop van één regel, dichte plekken die kort zeggen wat ze kosten, en meldingen die elkaar vervangen.',
    words: [
      {
        key: 'roomHeading',
        what: 'De kop van een kamer, vóór de naam van de onderzoeker',
        fallback: '{kamer} van',
        hint: '{kamer} is het woord voor kamer. Daarna volgt de naam.',
      },
      {
        key: 'roomToEntry',
        what: 'Het kleine icoon naast de naam in die kop (voor een schermlezer)',
        fallback: 'Naar het {artikel} van {naam}',
      },
      {
        key: 'lockedRest',
        what: 'Op een telefoon, onder de eerstvolgende dichte plekken: hoeveel er nog op slot zitten',
        fallback: 'Nog {plekken} op slot · {prijzen}',
        hint: '{plekken} is bijvoorbeeld "6 plekken", {prijzen} "8 tot 30 munten".',
      },
      { key: 'priceRange', what: 'Een prijs van … tot …', fallback: '{van} tot {tot}' },
      {
        key: 'shopOpenFirstShort',
        what: 'In de winkel: de knop als er eerst een plek open moet (op één regel)',
        fallback: 'Eerst {plek} openen · {n}',
        hint: '{plek} is de soort plek, {n} wat openen kost. De prijs van het ding staat als stempel erboven.',
      },
      {
        key: 'movedTo',
        what: 'Nadat je iets in je kamer verplaatst hebt',
        fallback: '{ding} verplaatst naar de {plek}.',
      },
      {
        key: 'movedToOf',
        what: 'Dezelfde melding in de kamer van een ander',
        fallback: '{ding} verplaatst naar de {plek} van {naam}.',
      },
      {
        key: 'grantMuntLine',
        what: 'De melding als de Keeper munten geeft, naast de stempel met het bedrag',
        fallback: '{munten} van de {keeper}',
        hint: '{munten} is het woord munt of munten; het getal staat op de stempel ervoor.',
      },
      {
        key: 'handoutDoneOne',
        what: 'Nadat de Keeper aan één kamer uitdeelde',
        fallback: '{munten} naar {naam}',
      },
      {
        key: 'handoutDoneMany',
        what: 'Nadat de Keeper aan meer kamers uitdeelde',
        fallback: '{munten} naar {kamers}',
        hint: '{kamers} is bijvoorbeeld "2 kamers".',
      },
      {
        key: 'feedRoomOpenedOwn',
        what: 'In het feed: een speler opende een plek in de eigen kamer',
        fallback: 'opende een plek in de eigen kamer',
      },
    ],
  },
  // ── golf h3 — lezen en de wiki: eigen groep direct hieronder ──
  // §104 (aangevuld in golf H)
  {
    title: 'Lezen en de wiki (golf H)',
    note: 'De knop in het menu op een dossier, en de dossiernotities.',
    words: [
      {
        key: 'navNewInCase',
        what: 'De grote knop in het menu, als je op een dossier staat (past op één regel)',
        fallback: 'Nieuw in dit {dossier}',
        hint: '{dossier} is het woord voor dossier.',
      },
      {
        key: 'navNewInCaseLabel',
        what: 'Voor een schermlezer: de volle naam van die knop (en van de + op een telefoon) op een dossier',
        fallback: '{nieuw} in dit {dossier}',
        hint: '{nieuw} is "Nieuw artikel", {dossier} het woord voor dossier.',
      },
      { key: 'caseNotes', what: 'De kop boven de notities van een dossier', fallback: 'Dossiernotities' },
      {
        key: 'caseNotesNone',
        what: 'In Lezen, als een dossier nog geen notities heeft (één gedempte regel)',
        fallback: 'Nog niets opgeschreven.',
      },
    ],
  },
  // ── golf i1 — de tekenvlakken op de telefoon: eigen groep direct hieronder ──
  // §105
  {
    title: 'De tekenvlakken (golf i1)',
    note:
      'Wat er op een leeg prikbord, een lege landkaart, tijdlijn of stamboom staat: één zin en één knop. ' +
      'Wat tussen accolades staat wordt ingevuld; laat het staan als je de zin herschrijft.',
    words: [
      {
        key: 'vlakLeegPrikbord',
        what: 'Een leeg prikbord (de zin)',
        fallback: 'Nog niets geprikt op dit {prikbord}.',
      },
      {
        key: 'vlakLeegPrikbordDoe',
        what: 'De knop op een leeg prikbord, in Bewerken',
        fallback: 'Prik een {notitie}',
        hint: 'Een gebiedende wijs, zodat de knop niet heet als "Nieuwe notitie" in de balk.',
      },
      {
        key: 'vlakLeegLandkaart',
        what: 'Een lege landkaart (de zin)',
        fallback: 'Nog geen {spelden} op deze {landkaart}.',
      },
      {
        key: 'vlakLeegLandkaartDoe',
        what: 'De knop op een lege landkaart, in Bewerken',
        fallback: 'Zet een {speld}',
        hint: 'Niet "Speld zetten": zo heet de knop in de balk al.',
      },
      {
        key: 'mapLezenDubbelklik',
        what: 'Een melding na een dubbelklik op een landkaart die in Lezen staat',
        fallback: 'Zet de kaart op Bewerken om hier een {speld} te zetten.',
      },
      {
        key: 'vlakLeegTijdlijn',
        what: 'Een lege tijdlijn (de zin)',
        fallback: 'Nog geen {gebeurtenissen} op deze {tijdlijn}.',
      },
      {
        key: 'vlakLeegTijdlijnDoe',
        what: 'De knop op een lege tijdlijn, in Bewerken',
        fallback: 'Zet een {gebeurtenis}',
        hint: 'Niet "Gebeurtenis toevoegen": zo heet de knop in de balk al.',
      },
      {
        key: 'vlakLeegStamboom',
        what: 'Een lege stamboom (de zin)',
        fallback: 'Nog niemand in deze {stamboom}.',
      },
      {
        key: 'vlakLeegStamboomDoe',
        what: 'De knop op een lege stamboom, in Bewerken: naar het zoekvak',
        fallback: 'Zoek iemand',
      },
      {
        key: 'findOnMap',
        what: 'De bovenste groep in de zoeklijst van een landkaart (de loep in de balk)',
        fallback: 'Op deze {landkaart}',
      },
      {
        key: 'findOnTimeline',
        what: 'De bovenste groep in de zoeklijst van een tijdlijn (de loep in de balk)',
        fallback: 'Op deze {tijdlijn}',
      },
      {
        key: 'vlakPrikZoek',
        what: 'Het zoekvak van een prikbord in Bewerken, op een telefoon (de placeholder)',
        fallback: 'Zoek iets om te prikken…',
      },
      {
        key: 'vlakLeegBegin',
        what: 'De knop op een leeg vlak, in Lezen: zet het vlak in Bewerken',
        fallback: 'Beginnen',
        hint: 'Niet "Bewerken": zo heet de schakelaar al.',
      },
    ],
  },
  // ── golf i2 — de eerste keer: eigen groep direct hieronder ──
  // §106
  {
    title: 'De eerste keer (golf I)',
    note: 'De voordeur, de eerste stap van een nieuwe speler, de route van een verse Keeper, de lege staten en de regel bij een eerste bezoek. Kort, in de stem van het archief.',
    words: [
      // De voordeur
      { key: 'doorLoginLead', what: 'Onder de naam van het archief op de inlogpagina', fallback: 'Log in bij het archief.' },
      { key: 'doorJoinHead', what: 'De kop van het paneel naar het aanmelden', fallback: 'Nog geen account?' },
      { key: 'doorJoinButton', what: 'De knop naar het aanmelden', fallback: 'Registreer je nu' },
      {
        key: 'doorJoinNote',
        what: 'Onder die knop',
        fallback: 'Je hebt de uitnodigingscode van je {keeper} nodig. Die staat in je uitnodiging.',
        hint: '{keeper} is het woord voor de spelleider.',
      },
      { key: 'doorSignupTitle', what: 'De kop van de aanmeldpagina', fallback: 'Word lid van het archief' },
      {
        key: 'doorSignupLead',
        what: 'Onder die kop',
        fallback: 'Met de uitnodigingscode van je {keeper} schuif je aan.',
        hint: '{keeper} is het woord voor de spelleider.',
      },
      { key: 'doorCodeLabel', what: 'Het vak voor de uitnodigingscode', fallback: 'Uitnodigingscode' },
      {
        key: 'doorCodeHint',
        what: 'Onder het vak voor de code',
        fallback: 'Tien tekens. Plakken mag, met of zonder streepje.',
      },
      { key: 'doorCodeFromLink', what: 'Onder het vak, als de code al uit de uitnodigingslink kwam', fallback: 'Ingevuld uit je uitnodiging.' },
      { key: 'doorHaveAccount', what: 'Onderaan de aanmeldpagina', fallback: 'Al ingeschreven?' },
      { key: 'doorToLogin', what: 'De link terug naar inloggen', fallback: 'Inloggen' },
      { key: 'doorStamp', what: 'De stempel op de kaart van de voordeur', fallback: 'Toegang' },
      // Wie ben jij aan tafel?
      { key: 'whoAtTable', what: 'De eerste stap van een speler zonder karakter, op Start', fallback: 'Wie ben jij aan tafel?' },
      {
        key: 'whoAtTableLead',
        what: 'Onder die vraag',
        fallback: 'Alles wat je hier schrijft, komt op naam van je {karakter}. Geef het een naam, dan begin je.',
        hint: '{karakter} is jouw woord voor karakter.',
      },
      { key: 'whoAtTableName', what: 'Het vak voor de naam van je karakter', fallback: 'Naam van je {karakter}' },
      { key: 'whoAtTablePlaceholder', what: 'Voorbeeld in dat vak', fallback: 'Bijvoorbeeld Cornelis Vermeulen' },
      { key: 'whoAtTableGo', what: 'De knop die het karakter maakt en koppelt', fallback: 'Dit ben ik' },
      { key: 'whoAtTableBusy', what: 'Terwijl dat gebeurt', fallback: 'Even ophangen…' },
      {
        key: 'whoAtTableExisting',
        what: 'De vouw voor wie al in het archief staat',
        fallback: 'Sta je er al in?',
      },
      {
        key: 'whoAtTableExistingHint',
        what: 'In die vouw',
        fallback: 'Zoek je {artikel}. Je eerste {karakter} koppel je zelf; daarna doet de {keeper} dat.',
        hint: '{artikel}, {karakter} en {keeper} zijn jouw woorden.',
      },
      { key: 'whoAtTableSearch', what: 'Het zoekvak in die vouw', fallback: 'Zoek het {artikel} van je {karakter}…' },
      { key: 'whoAtTableFailed', what: 'Als het niet lukte', fallback: 'Dat lukte niet. Probeer het nog eens.' },
      { key: 'welcomeName', what: 'Het moment na de eerste stap', fallback: 'Welkom, {naam}.' },
      {
        key: 'welcomeLead',
        what: 'Onder dat welkom',
        fallback: 'Je hebt een {kamer} en je schrijft voortaan onder deze naam. Waar begin je?',
        hint: '{kamer} is het woord voor kamer.',
      },
      { key: 'welcomeWrite', what: 'Deur na het welkom: schrijven', fallback: 'Schrijf je eerste {artikel}' },
      { key: 'welcomeOwnPage', what: 'Deur na het welkom: je eigen artikel', fallback: 'Vul je {karakter} aan' },
      { key: 'welcomeStamp', what: 'De stempel bij het welkom', fallback: 'Ingeschreven' },
      { key: 'welcomeDone', what: 'Het welkom wegleggen', fallback: 'Klaar' },
      {
        key: 'writesAsSole',
        what: 'Eén keer per venster, bij de eerste schrijfhandeling van wie precies één karakter heeft',
        fallback: 'Je schrijft als {naam}.',
      },
      { key: 'feedSatDown', what: 'In het feed: iemand koppelde zijn eerste karakter', fallback: 'schoof aan' },
      { key: 'feedCast', what: 'In het feed: de Keeper gaf iemand een karakter', fallback: 'gaf een speler' },
      {
        key: 'readOnlyLine',
        what: 'De ene regel boven elke pagina voor een speler zonder karakter',
        fallback: 'Je leest mee tot je zegt wie je aan tafel bent.',
      },
      { key: 'readOnlyDoor', what: 'De deur in die regel', fallback: 'Wie ben jij?' },
      // De route van een verse Keeper
      { key: 'routeTitle', what: 'Kop van de drie stappen op Start voor een Keeper in een leeg archief', fallback: 'Het archief inrichten' },
      {
        key: 'routeLead',
        what: 'Onder die kop',
        fallback: 'Drie stappen, dan kan de tafel aanschuiven. Dit blok verdwijnt als ze gedaan zijn.',
      },
      { key: 'routeEntry', what: 'Stap 1', fallback: 'Schrijf het eerste {artikel}' },
      {
        key: 'routeEntryWhy',
        what: 'Onder stap 1',
        fallback: 'Een persoon, een plek, een voorwerp: alles in het archief is een {artikel} van een soort.',
      },
      { key: 'routeCase', what: 'Stap 2', fallback: 'Open een {dossier}' },
      { key: 'routeCaseWhy', what: 'Onder stap 2', fallback: 'Eén onderzoek, één map. Een naam is genoeg om te beginnen.' },
      { key: 'routeInvite', what: 'Stap 3', fallback: 'Nodig je {spelers} uit' },
      {
        key: 'routeInviteWhy',
        what: 'Onder stap 3',
        fallback: 'Stuur ze deze link, of de code. Ze maken zelf een account en kiezen wie ze zijn.',
      },
      { key: 'routeDone', what: 'Een gedane stap', fallback: 'Gedaan' },
      { key: 'routeStepOf', what: 'Voor een schermlezer: welke stap', fallback: 'Stap {n} van 3' },
      { key: 'inviteCopyLink', what: 'Knop: de uitnodigingslink kopiëren', fallback: 'Kopieer de link' },
      { key: 'inviteCopied', what: 'Melding na kopiëren', fallback: 'Gekopieerd. Plak het in je bericht aan de tafel.' },
      { key: 'inviteCopyFailed', what: 'Als kopiëren niet mag', fallback: 'Kopiëren lukte niet. Selecteer de link en kopieer hem zelf.' },
      { key: 'inviteCodeLabel', what: 'Voor de code zelf', fallback: 'Code' },
      // Lege staten
      { key: 'emptyFilter', what: 'Een lijst die leeg is door de filters', fallback: 'Niets voldoet aan deze filters.' },
      { key: 'emptyFilterClear', what: 'De knop die de filters wist', fallback: 'Filters wissen' },
      { key: 'emptyFeed', what: 'Start, als er nog niets gebeurd is', fallback: 'Nog niets opgeborgen.' },
      { key: 'emptyFeedWhy', what: 'Daaronder', fallback: 'Wat de tafel schrijft, verschijnt hier als eerste.' },
      { key: 'emptyWrite', what: 'De knop in een lege lijst: een artikel schrijven', fallback: 'Schrijf het eerste {artikel}' },
      { key: 'emptyOpenCases', what: 'Start, als er geen dossier open is', fallback: 'Er ligt geen {dossier} open.' },
      { key: 'emptyCases', what: 'Dossiers, leeg', fallback: 'De dossierkast is nog leeg.' },
      { key: 'emptyCasesWhy', what: 'Daaronder', fallback: 'Een {dossier} hoort bij één onderzoek. Een naam en één regel zijn genoeg.' },
      { key: 'emptyCasesGo', what: 'De knop', fallback: 'Open het eerste {dossier}' },
      { key: 'emptyBoards', what: 'Prikborden, leeg', fallback: 'Er hangt nog geen {prikbord}.' },
      { key: 'emptyBoardsWhy', what: 'Daaronder', fallback: 'Prik er {artikelen} en notities op en span er rode draad tussen.' },
      { key: 'emptyBoardsGo', what: 'De knop', fallback: 'Hang het eerste {prikbord} op' },
      { key: 'emptyMaps', what: 'Landkaarten, leeg', fallback: 'Er hangt nog geen {landkaart}.' },
      { key: 'emptyMapsWhy', what: 'Daaronder, voor de Keeper', fallback: 'Een scan of een tekening is genoeg. Daarna prikt iedereen er {artikelen} op.' },
      {
        key: 'emptyMapsWhyPlayer',
        what: 'Daaronder, voor een speler',
        fallback: 'De {keeper} hangt ze op. Daarna prik je er {artikelen} op.',
      },
      { key: 'emptyMapsGo', what: 'De knop (alleen de Keeper)', fallback: 'Hang de eerste {landkaart} op' },
      { key: 'emptyMapsMine', what: 'Landkaarten, filter Van mij, leeg', fallback: 'Je hebt nog nergens een {speld} gezet.' },
      { key: 'emptyTimelines', what: 'Tijdlijnen, leeg', fallback: 'Er is nog geen {tijdlijn}.' },
      { key: 'emptyTimelinesWhy', what: 'Daaronder', fallback: 'Een as in jaren, dagen of minuten, met wat er gebeurde erop.' },
      { key: 'emptyTimelinesGo', what: 'De knop', fallback: 'Trek de eerste {tijdlijn}' },
      { key: 'emptyTrees', what: 'Stambomen, leeg', fallback: 'Er is nog geen {stamboom}.' },
      {
        key: 'emptyTreesWhy',
        what: 'Daaronder',
        fallback: 'Wie familie van wie is, staat op de {artikelen}. Een {stamboom} tekent het uit.',
      },
      { key: 'emptyTreesGo', what: 'De knop', fallback: 'Teken de eerste {stamboom}' },
      { key: 'emptyWiki', what: 'De wiki, als er nog geen enkel artikel is', fallback: 'De wiki is nog een lege kast.' },
      { key: 'emptyWikiWhy', what: 'Daaronder', fallback: 'Elk {artikel} krijgt een soort en een plank. Begin met wie of wat je al kent.' },
      { key: 'emptyKind', what: 'Een soort zonder artikelen', fallback: 'Onder {soort} is nog niets opgeborgen.' },
      { key: 'emptyKindGo', what: 'De knop daar', fallback: 'Schrijf de eerste' },
      { key: 'emptyAll', what: 'Alles in de wiki, leeg', fallback: 'Hier is nog niets opgeborgen.' },
      { key: 'emptyShelf', what: 'Een plank in een dossier, leeg', fallback: 'Nog geen {soort} in dit {dossier}.' },
      { key: 'emptyShelfAny', what: 'Een plank in een dossier zonder soort', fallback: 'In dit {dossier} ligt nog niets.' },
      { key: 'emptyShelfGo', what: 'De knop daar', fallback: 'Leg er iets in' },
      { key: 'emptyCaseBoards', what: 'Een dossier zonder prikbord', fallback: 'Nog geen {prikbord} bij dit {dossier}.' },
      { key: 'emptyCaseTimelines', what: 'Een dossier zonder tijdlijn', fallback: 'Nog geen {tijdlijn} bij dit {dossier}.' },
      { key: 'emptyCaseTrees', what: 'Een dossier zonder stamboom', fallback: 'Nog geen {stamboom} bij dit {dossier}.' },
      { key: 'emptyAboveButton', what: 'Onder een lege plank met de maakknop erboven', fallback: 'De knop hierboven begint er een.' },
      { key: 'emptyShopGo', what: 'In een lege winkel, voor de Keeper', fallback: 'Leg het eerste {huisraad} in de {winkel}' },
      { key: 'emptyShopWhy', what: 'Daaronder, voor de Keeper', fallback: 'Geef het een prijs en een plek; dan staat het hier te koop.' },
      { key: 'emptyWeb', what: 'Het web, als er nog niets in het archief staat', fallback: 'Het web is nog leeg.' },
      {
        key: 'emptyWebWhy',
        what: 'Daaronder',
        fallback: 'Elk artikel en elk dossier wordt hier een knoop, en elke verwijzing een draad.',
      },
      { key: 'emptyPlayers', what: 'Spelers, als alleen de Keeper er is', fallback: 'Er zit nog niemand aan tafel.' },
      // Een eerste bezoek
      { key: 'firstVisitRoom', what: 'Eén keer, bij je eerste bezoek aan je kamer', fallback: 'Dit is je {kamer}. Wat je koopt of krijgt, zet je hier neer. De {keeper} geeft de munten.' },
      { key: 'firstVisitShop', what: 'Eén keer, bij je eerste bezoek aan de winkel', fallback: 'Hier koop je huisraad voor je {kamer}. De stempel is de prijs; een plek die dicht is, open je in de {kamer}.' },
      { key: 'firstVisitWiki', what: 'Eén keer, bij je eerste bezoek aan de wiki', fallback: 'Dit is de wiki: alles wat de tafel weet, per soort. Lees, of schrijf zelf een {artikel}.' },
      { key: 'firstVisitGotIt', what: 'De knop die die regel wegdoet', fallback: 'Begrepen' },
    ],
  },
  // ── golf i3 — Beheer: eigen groep direct hieronder ──
  // §107
  {
    title: 'Beheer (golf i3)',
    note:
      'De index van Beheer op een telefoon, de soort-editor, Woorden, de uitnodiging en een nieuw ' +
      'wachtwoord. Wat tussen accolades staat wordt ingevuld.',
    words: [
      {
        key: 'beheerTerug',
        what: 'Op een telefoon: voor een schermlezer, de knop ‹ Beheer terug naar de lijst met onderdelen',
        fallback: 'Terug naar alle onderdelen',
      },
      { key: 'beheerWatUsers', what: 'De index op een telefoon: onder Gebruikers', fallback: 'Uitnodiging, wachtwoorden en wie wie speelt' },
      { key: 'beheerWatReview', what: 'Idem: onder Beoordelen', fallback: 'Voorstellen op een vergrendeld {artikel}' },
      { key: 'beheerWatTrash', what: 'Idem: onder Prullenbak', fallback: 'Terugzetten wat weg is, of het voorgoed wissen' },
      { key: 'beheerWatTypes', what: 'Idem: onder Soorten artikelen', fallback: 'Velden, pictogram, kleur en pagina per soort' },
      { key: 'beheerWatWords', what: 'Idem: onder Woorden', fallback: 'Elk woord en elke zin die het archief zegt' },
      { key: 'beheerWatColours', what: 'Idem: onder Kleuren', fallback: 'De vier paletten, licht en donker' },
      { key: 'beheerWatHistory', what: 'Idem: onder Geschiedenis', fallback: 'Oude versies van dossiers en prikborden' },
      { key: 'beheerWatSite', what: 'Idem: onder Site', fallback: 'Naam, logo, icoontje en welkomsttekst' },
      { key: 'beheerWatExport', what: 'Idem: onder Export', fallback: 'Het hele archief als één zip' },
      { key: 'beheerWatAudit', what: 'Idem: onder Logboek', fallback: 'Wie wat deed, de laatste 120 keer' },
      { key: 'soortUiterlijk', what: 'Soort-editor: de knop die pictogram, kleur en rand openklapt', fallback: 'Pictogram en kleur' },
      { key: 'soortVoorbeeld', what: 'Soort-editor: boven het voorbeeld van chip en kaart', fallback: 'Zo ziet het eruit' },
      { key: 'soortPictogram', what: 'Soort-editor: de kop boven de pictogrammen', fallback: 'Pictogram' },
      { key: 'soortKleur', what: 'Soort-editor: de kop boven de kleuren', fallback: 'Kleur' },
      { key: 'soortEigenKleur', what: 'Soort-editor: het vakje voor een kleur die niet in de rij staat', fallback: 'Eigen kleur' },
      {
        key: 'soortTekenOok',
        what: 'Soort-editor: als een andere soort hetzelfde pictogram draagt',
        fallback: '{soorten} draagt dit teken ook. Kies een ander als je ze uit elkaar wilt houden.',
      },
      {
        key: 'soortTekenOokMeer',
        what: 'Idem, als het meer dan één andere soort is',
        fallback: '{soorten} dragen dit teken ook. Kies een ander als je ze uit elkaar wilt houden.',
      },
      {
        key: 'soortGeenKeuzes',
        what: 'Soort-editor, in de voet: een keuzelijst zonder keuzes',
        fallback: '{veld} heeft nog geen keuzes',
      },
      {
        key: 'soortKoppelingNaar',
        what: 'Soort-editor: de groep koppelingen in de keuzelijst met de soort van een veld',
        fallback: 'Koppeling naar',
      },
      {
        key: 'userCharacterZoek',
        what: 'Beheer → Gebruikers: het zoekvak om een karakter toe te wijzen',
        fallback: 'Zoek het {artikel} van een {karakter}…',
      },
      { key: 'soortVoorbeeldNaam', what: 'Soort-editor: de naam op de voorbeeldkaart', fallback: 'Een {artikel}' },
      { key: 'soortSnel', what: 'Soort-editor: vóór de knoppen die meteen een veld van een soort toevoegen', fallback: 'Of meteen:' },
      { key: 'soortVeldMeer', what: 'Soort-editor: de knop die de instellingen van één veld openklapt', fallback: 'Instellen' },
      {
        key: 'soortVeldTypt',
        what: 'Soort-editor: onder Veld toevoegen, als hij de focus heeft',
        fallback: 'Begin te typen voor een nieuw veld. Enter in een naam maakt het volgende.',
      },
      {
        key: 'soortZonderNaam',
        what: 'Soort-editor, in de voet: velden zonder naam',
        fallback: '{n} zonder naam valt weg bij opslaan',
      },
      { key: 'soortDirty', what: 'Soort-editor, in de voet: wat nog niet is opgeslagen', fallback: '{n} niet opgeslagen' },
      { key: 'soortSchoon', what: 'Soort-editor, in de voet: als alles bewaard is', fallback: 'Alles bewaard' },
      { key: 'soortSneltoets', what: 'Soort-editor, in de voet op een computer', fallback: 'Ctrl S slaat op' },
      { key: 'soortNieuwArtikel', what: 'Soort-editor, in de voet: een artikel van deze soort maken', fallback: 'Nieuw {artikel}' },
      { key: 'soortDoelZoek', what: 'Soort-editor: het zoekvak in de kiezer van doel-soorten', fallback: 'Zoek een soort…' },
      { key: 'soortDoelWeg', what: 'Soort-editor: voor een schermlezer, op het kruisje van een gekozen soort', fallback: '{soort} weghalen' },
      { key: 'soortDoelKlaar', what: 'Soort-editor: de knop die de kiezer van doel-soorten dichtklapt', fallback: 'Klaar' },
      { key: 'woordZoLeest', what: 'Woorden: vóór de zin zoals hij op het scherm komt', fallback: 'Zo leest het:' },
      { key: 'woordOokIn', what: 'Woorden: vóór de zinnen waar een woord ook in staat', fallback: 'Ook in:' },
      { key: 'woordEnMeer', what: 'Woorden: als het woord in nog meer zinnen staat', fallback: 'en nog {n}' },
      {
        key: 'woordGatWeg',
        what: 'Woorden: als je een gat als {n} uit een zin haalt',
        fallback: 'Zonder {gat} staat er daarna niets op die plek.',
      },
      {
        key: 'woordFilterHint',
        what: 'Woorden: onder het zoekvak',
        fallback: 'Enter springt naar het eerste woord dat past. Enter in een vak slaat op.',
      },
      // Golf M (C3): het zoekvak boven Gebruikers.
      {
        key: 'spelersZoek',
        what: 'Gebruikers: het zoekvak boven de lijst',
        fallback: 'Zoek op naam of {karakter}…',
      },
      { key: 'spelersFilter', what: 'Gebruikers: de naam van de filterknoppen, voor een schermlezer', fallback: 'Welke accounts' },
      { key: 'spelersAlle', what: 'Gebruikers: de filterknop voor iedereen', fallback: 'Alle' },
      { key: 'spelersKeepers', what: 'Gebruikers: de filterknop voor wie Keeper is', fallback: 'Keepers' },
      { key: 'spelersUit', what: 'Gebruikers: de filterknop voor uitgeschakelde accounts', fallback: 'Uitgeschakeld' },
      { key: 'spelersTelling', what: 'Gebruikers: hoeveel er in beeld staan, van hoeveel', fallback: '{n} van {totaal}' },
      {
        key: 'spelersGeen',
        what: 'Gebruikers: als niemand past bij wat je zocht',
        fallback: 'Niemand gevonden voor ‘{zoek}’.',
      },
      {
        key: 'spelersGeenFilter',
        what: 'Gebruikers: als niemand onder deze filterknop valt',
        fallback: 'Hier staat niemand onder.',
      },
      { key: 'kopieer', what: 'De knop die iets naar het klembord kopieert', fallback: 'Kopieer' },
      { key: 'delen', what: 'De knop die iets deelt (op een telefoon)', fallback: 'Delen' },
      {
        key: 'inviteDeelTekst',
        what: 'De tekst die je deelt met de uitnodigingscode',
        fallback: 'Schrijf je in bij {archief} met de code {code}.',
      },
      {
        key: 'kopieerMislukt',
        what: 'Melding: kopiëren lukte niet',
        fallback: 'Kopiëren lukte niet. Selecteer het en kopieer het zelf.',
      },
      {
        key: 'wachtwoordUitleg',
        what: 'In het blad voor een nieuw wachtwoord',
        fallback: 'Minstens 8 tekens. Zeg het {naam} zelf: het archief kan het daarna niet meer tonen.',
      },
      { key: 'wachtwoordMaak', what: 'In dat blad: de knop die een wachtwoord verzint', fallback: 'Verzin er een' },
      { key: 'wachtwoordGekopieerd', what: 'Melding: het nieuwe wachtwoord staat op het klembord', fallback: 'Wachtwoord gekopieerd.' },
      { key: 'trashLeeg', what: 'Beheer → Prullenbak, als er niets in ligt', fallback: 'De prullenbak is leeg.' },
      {
        key: 'trashLeegUitleg',
        what: 'Idem, de regel eronder',
        fallback: 'Wat iemand weggooit, ligt hier tot jij het terugzet of voorgoed wist.',
      },
      { key: 'trashTeruggezet', what: 'Melding na Terugzetten in de prullenbak', fallback: '{naam} staat weer waar het stond.' },
    ],
  },
  // ── golf j1 — de vlakken, na de meting: eigen groep direct hieronder ──
  // ── golf j2 — schrijven en zoeken, na de meting: eigen groep direct hieronder ──
  {
    title: 'Schrijven en zoeken (golf j2)',
    note: 'Het maakblad van een nieuw artikel. Wat tussen accolades staat wordt ingevuld.',
    words: [
      {
        key: 'newEntryTypeRest',
        what: 'In het maakblad, naast Alle soorten: hoeveel soorten er nog onder de rand staan',
        fallback: '+{n}',
      },
    ],
  },
  // ── golf j3 — de Keeper en de losse eindjes, na de meting: eigen groep direct hieronder ──
  // §107, aangevuld in golf J
  {
    title: 'Beheer, tweede pas (golf j3)',
    note:
      'Wat golf I nog letterlijk in de code had staan, de uitnodiging bovenaan Beheer op een telefoon, ' +
      'en het puntje bij een onderdeel waar nog iets niet is opgeslagen.',
    words: [
      { key: 'soortSnelKoppelingen', what: 'Soort-editor: de snelknop die meteen een veld met koppelingen toevoegt', fallback: 'Koppelingen' },
      { key: 'soortNogGeenKeuzes', what: 'Soort-editor: onder een ingeklapte keuzelijst zonder keuzes', fallback: 'Nog geen keuzes' },
      { key: 'soortDoelAlleen', what: 'Soort-editor: vóór de doel-soorten van een koppelveld', fallback: 'Alleen deze soorten mogen erin:' },
      { key: 'blokKijkIn', what: 'Soort-editor, de pagina: vóór de soorten waar een lijst die zichzelf vult in kijkt', fallback: 'Kijk in deze soorten:' },
      { key: 'blokMagErin', what: 'Soort-editor, de pagina: vóór de soorten die in een eigen lijst mogen', fallback: 'Alleen deze soorten mogen erin:' },
      {
        key: 'beheerNietBewaard',
        what: 'Beheer: bij een onderdeel waar nog iets niet is opgeslagen (voor een schermlezer en als tip)',
        fallback: 'Hier staat nog iets dat niet is opgeslagen',
      },
      {
        key: 'beheerIndexUitnodiging',
        what: 'Beheer op een telefoon: het etiket boven de uitnodiging, bovenaan de lijst met onderdelen',
        fallback: 'Een speler uitnodigen',
      },
    ],
  },
  //
  // ── golf O — rust: Start, de voordeur van de wiki en de kop van een artikel ──
  {
    title: 'Rust (golf O)',
    note: 'De rij in Meer info die zegt van welke soort een artikel is, en de regel in de kop van Geschiedenis.',
    words: [
      {
        key: 'infoKind',
        what: 'In Meer info: het label voor de soort van het artikel (de chip gaat naar de lijst van die soort)',
        fallback: 'In de wiki',
        hint: 'Niet “Soort” of “Categorie”: een soort heeft vaak zelf een veld dat zo heet, en dan staan er twee onder elkaar.',
      },
      {
        key: 'historyLast',
        what: 'In de kop van Geschiedenis: wie het artikel het laatst bijwerkte, en wanneer',
        fallback: 'laatst door {naam}, {wanneer}',
        hint: '{naam} is het karakter dat de laatste versie schreef; {wanneer} is bijvoorbeeld “10 uur geleden”.',
      },
      { key: 'wikiHistory', what: 'De tab in de wiki met wat er in het archief gebeurde', fallback: 'Wiki geschiedenis' },
      {
        key: 'wikiHistoryLead',
        what: 'Onder de kop van die pagina',
        fallback: 'Wat er in het archief geschreven, veranderd en onthuld is, het nieuwste bovenaan.',
      },
      { key: 'wikiHistoryNew', what: 'Het stempeltje bij een regel van na je vorige bezoek', fallback: 'Nieuw' },
      { key: 'fieldInverse', what: 'Soort-editor: bij een koppelingsveld, het vakje voor de andere kant', fallback: 'Andere kant' },
      {
        key: 'fieldInversePlaceholder',
        what: 'Daarin, zolang het leeg is',
        fallback: 'sleutel van het veld daar, bijv. vereerd_door',
      },
      {
        key: 'fieldInverseHint',
        what: 'Onder dat vakje',
        fallback: 'Noemen twee velden elkaar zo, dan vult het archief de andere pagina zelf in, en haalt het daar ook weg.',
      },
      { key: 'navCollapse', what: 'De knop die de zijbalk inklapt (voorleestekst en tip)', fallback: 'Menu inklappen' },
      { key: 'navExpand', what: 'De knop die de zijbalk weer uitklapt (voorleestekst en tip)', fallback: 'Menu uitklappen' },
      {
        key: 'historyLastWhen',
        what: 'Hetzelfde, als er geen naam bij de laatste versie hoort',
        fallback: 'laatst {wanneer}',
      },
    ],
  },
];

export const WORD_DEFS: WordDef[] = WORD_GROUPS.flatMap((group) => group.words);

export type Words = Record<string, string>;

export const DEFAULT_WORDS: Words = Object.fromEntries(
  WORD_DEFS.map((def) => [def.key, def.fallback]),
);

const KNOWN_KEYS = new Set(WORD_DEFS.map((def) => def.key));

/**
 * §96: hoe lang een woord van de Keeper mag zijn.
 *
 * Tot ronde 57 was dat 60 tekens, uit de tijd dat elk woord hier een woord
 * was. Sinds §84 staan er hele zinnen in, en zes standaardzinnen waren langer
 * dan wat een Keeper mocht terugschrijven: wie *Er is nog niemand om aan uit te
 * delen…* wilde herschrijven, kreeg zijn zin halverwege afgekapt. De langste
 * standaardzin is 144 tekens; 200 laat ruimte, en
 * `tests/unit/ronde-57-woorden.test.ts` zorgt dat elke standaardzin erin past.
 */
export const WORD_MAX = 200;

/**
 * Keeps only the keys this file knows, trimmed and capped. A word that matches
 * its own default is dropped rather than stored, so the settings row holds the
 * Keeper's *changes* and a later change to a default reaches them.
 */
export function cleanWordOverrides(input: unknown): Words {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {};
  const out: Words = {};
  for (const [key, raw] of Object.entries(input as Record<string, unknown>)) {
    if (!KNOWN_KEYS.has(key)) continue;
    if (typeof raw !== 'string') continue;
    const value = raw.trim().slice(0, WORD_MAX);
    if (!value || value === DEFAULT_WORDS[key]) continue;
    out[key] = value;
  }
  return out;
}

/** The full word list a screen reads: defaults with the Keeper's words on top. */
export function resolveWords(overrides: unknown): Words {
  return { ...DEFAULT_WORDS, ...cleanWordOverrides(overrides) };
}

/**
 * §84: een woord met een gat erin.
 *
 * Tot ronde 45 was elk woord in deze lijst een heel woord of een hele zin, en
 * een zin met een getal erin werd daarom in de component in elkaar gezet —
 * `Je hebt nog ${munt(n)} nodig.` stond drie keer letterlijk in de code, en de
 * Keeper kon er niets aan veranderen (§11).
 *
 * Een sjabloon lost dat op: `'Nog {n} nodig'` staat in de lijst, de component
 * vult `{n}`. De Keeper ziet het gat in Beheer en mag de zin eromheen
 * herschrijven, hem omdraaien, of hem korter maken — zolang het gat blijft
 * staan. **Een gat dat hij weghaalt is geen fout**: dan staat het getal er niet
 * meer, en dat is zijn keuze. Er wordt hier dus niets afgedwongen en niets
 * geraden; wat niet voorkomt in de tekst wordt stil genegeerd.
 *
 * Onbekende gaten blijven staan zoals ze zijn. Dat is met opzet: een `{plek}`
 * in een zin die geen plek meegekregen heeft, is beter zichtbaar als `{plek}`
 * dan als een gat in een zin.
 */
export function fill(template: string, vars: Record<string, string>): string {
  let out = template;
  for (const [key, value] of Object.entries(vars)) {
    out = out.split(`{${key}}`).join(value);
  }
  return out;
}

/**
 * Sentence-case a word that is stored lower case, for the start of a heading:
 * `artikel` → `Artikel`. Leaves a word the Keeper capitalised themselves alone.
 */
export function capitalise(word: string): string {
  return word ? word.charAt(0).toUpperCase() + word.slice(1) : word;
}
