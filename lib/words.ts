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
        what: 'Het ene getal dat iedereen krijgt',
        fallback: 'Voor iedereen',
        hint:
          'Verander je dit, dan springt elk bedrag eronder mee — ook wat je met de hand ' +
          'had aangepast. §85: heette "Iedereen", en dat las als een kolomkop boven de ' +
          'lijst in plaats van als het vak waar je een getal in typt.',
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
        fallback: 'Pas een bedrag hieronder gerust aan. Zet iemand uit, of op 0, en die krijgt niets.',
      },
      { key: 'handoutEmpty', what: 'Als er nog geen kamers zijn om aan uit te delen', fallback: 'Er draagt nog niemand een onderzoeker.' },
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
      { key: 'toPlayers', what: 'De deur naar de hal', fallback: 'Naar de {spelers}' },
      { key: 'toCharacters', what: 'De deur naar je karakters', fallback: 'Naar je karakters' },
      { key: 'toCases', what: 'De deur naar de dossiers', fallback: 'Naar de {dossiers}' },
      { key: 'plekMuur', what: 'Een plek aan de muur', fallback: 'muur' },
      { key: 'plekPlank', what: 'Een plek op een plank', fallback: 'plank' },
      { key: 'plekBureau', what: 'Een plek op het bureau', fallback: 'bureau' },
      { key: 'plekKist', what: 'Een plek in de kist', fallback: 'kist' },
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
