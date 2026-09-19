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
      { key: 'spelerPage', what: 'De pagina van één speler', fallback: 'Spelerspagina' },
      { key: 'spelerPagePlural', what: 'Meer spelerspaginas', fallback: 'Spelerspaginas' },
    ],
  },
  {
    title: 'De kamer',
    note:
      '§78: gereserveerd. Er is nog geen kamer, geen tabel en geen munt — deze woorden ' +
      'staan er zodat het straks een naam is die je hier verandert, en nooit een woord ' +
      'dat in een tabelnaam, een adres of een stylesheet is gaan zitten.',
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
      { key: 'roomEmpty', what: 'Zolang de kamer nog niet bestaat', fallback: 'Nog niet gebouwd.' },
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
 * Sentence-case a word that is stored lower case, for the start of a heading:
 * `artikel` → `Artikel`. Leaves a word the Keeper capitalised themselves alone.
 */
export function capitalise(word: string): string {
  return word ? word.charAt(0).toUpperCase() + word.slice(1) : word;
}
