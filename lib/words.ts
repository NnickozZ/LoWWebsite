/**
 * §11's word list.
 *
 * Every term the interface repeats — fiche, dossier, prikbord, punaise — lives
 * here once, with the Dutch the archive shipped with as its default. A Keeper
 * renames any of them under Beheer → Woorden and the whole app follows. Nothing
 * else in the code may hard-code one of these words; if a screen needs a term
 * that is not here, add it here first.
 *
 * Deliberately pure: client components import this, so it must never open the
 * database. `lib/admin/words.ts` is the half that reads and writes settings.
 *
 * Two rules for the defaults below:
 *   1. A default is exactly what the screen said before this file existed, so
 *      an archive that never touches Beheer looks identical.
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
      { key: 'entry', what: 'Eén fiche', fallback: 'fiche' },
      { key: 'entryPlural', what: 'Meer fiches', fallback: 'fiches' },
      { key: 'entryType', what: 'Eén soort fiche', fallback: 'soort fiche' },
      { key: 'entryTypePlural', what: 'Meer soorten', fallback: 'soorten fiches' },
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
        hint: 'De fiche die een speler als zichzelf draagt.',
      },
      { key: 'characterPlural', what: 'Meer karakters', fallback: 'karakters' },
    ],
  },
  {
    title: 'Het menu',
    note: 'De acht plekken in de zijbalk, en de balk onderaan op een telefoon.',
    words: [
      { key: 'navHome', what: 'Start', fallback: 'Start' },
      { key: 'navCases', what: 'Dossiers', fallback: 'Dossiers' },
      { key: 'navWiki', what: 'Wiki', fallback: 'Wiki' },
      { key: 'navBoards', what: 'Prikborden', fallback: 'Prikborden' },
      { key: 'navMaps', what: 'Landkaarten', fallback: 'Landkaarten' },
      { key: 'navSearch', what: 'Zoeken', fallback: 'Zoeken' },
      { key: 'navYou', what: 'Jij', fallback: 'Jij' },
      { key: 'navAdmin', what: 'Beheer', fallback: 'Beheer' },
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
      { key: 'thisIsMyCharacter', what: 'De knop op een fiche', fallback: 'Dit is mijn karakter' },
      { key: 'onTheMap', what: 'De kop op een fiche met spelden', fallback: 'Op de landkaart' },
    ],
  },
  {
    title: 'Knoppen en koppen op een fiche',
    words: [
      { key: 'newEntry', what: 'De grote knop in het menu', fallback: 'Nieuwe fiche' },
      { key: 'newOfType', what: 'Nieuw, per soort', fallback: 'Nieuw' },
      { key: 'addToCase', what: 'Toevoegen aan een dossier', fallback: 'Aan dossier toevoegen' },
      { key: 'pinToBoard', what: 'Prikken op een prikbord', fallback: 'Op prikbord prikken' },
      { key: 'addMore', what: 'De kop boven de velden en tags', fallback: 'Meer toevoegen' },
      { key: 'backlinks', what: 'De kop boven de verwijzingen', fallback: 'Genoemd in' },
      { key: 'history', what: 'De kop boven de versies', fallback: 'Geschiedenis' },
      {
        key: 'visibilityAndReveals',
        what: 'De kop boven zichtbaarheid',
        fallback: 'Zichtbaarheid en onthullingen',
      },
      { key: 'keeperNotes', what: 'De kop boven de geheime notities', fallback: 'Notities van de Keeper' },
      { key: 'deleteEntry', what: 'De kop boven de prullenbakknop', fallback: 'Deze fiche verwijderen' },
    ],
  },
  {
    title: 'De tabbladen in Beheer',
    note: 'Alleen de namen van de tabbladen hierboven — niet wat erin staat.',
    words: [
      { key: 'adminTitle', what: 'De titel van deze pagina', fallback: 'Beheer' },
      { key: 'adminUsers', what: 'Gebruikers', fallback: 'Gebruikers' },
      { key: 'adminReview', what: 'Beoordelen', fallback: 'Beoordelen' },
      { key: 'adminTypes', what: 'Soorten fiches', fallback: 'Soorten fiches' },
      { key: 'adminWords', what: 'Woorden', fallback: 'Woorden' },
      { key: 'adminTrash', what: 'Prullenbak', fallback: 'Prullenbak' },
      { key: 'adminHistory', what: 'Geschiedenis', fallback: 'Geschiedenis' },
      { key: 'adminSite', what: 'Site', fallback: 'Site' },
      { key: 'adminExport', what: 'Export', fallback: 'Export' },
      { key: 'adminAudit', what: 'Logboek', fallback: 'Logboek' },
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
 * `fiche` → `Fiche`. Leaves a word the Keeper capitalised themselves alone.
 */
export function capitalise(word: string): string {
  return word ? word.charAt(0).toUpperCase() + word.slice(1) : word;
}
