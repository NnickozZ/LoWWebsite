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
      { key: 'spelerPagePlural', what: 'Meer spelerspaginas', fallback: 'Spelerspaginas' },
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
        what: 'Het zoekvak bovenaan de zijbalk (voorgelezen)',
        fallback: 'Zoek in het archief',
      },
      { key: 'searchBoxHint', what: 'De grijze tekst in dat zoekvak', fallback: 'Zoek…' },
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
  },
];

export const WORD_DEFS: WordDef[] = WORD_GROUPS.flatMap((group) => group.words);

export type Words = Record<string, string>;

export const DEFAULT_WORDS: Words = Object.fromEntries(
  WORD_DEFS.map((def) => [def.key, def.fallback]),
);

const KNOWN_KEYS = new Set(WORD_DEFS.map((def) => def.key));

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
    const value = raw.trim().slice(0, 60);
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
