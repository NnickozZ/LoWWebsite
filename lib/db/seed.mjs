import { randomBytes } from 'node:crypto';

/** Ambiguity-free alphabet: no O/0, no I/1. */
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function makeInviteCode() {
  const bytes = randomBytes(10);
  let out = '';
  for (let i = 0; i < 10; i++) {
    if (i === 5) out += '-';
    out += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  }
  return out;
}

const STATUS_OPTIONS = ['levend', 'dood', 'vermist', 'onbekend'];

/**
 * §58: de vier machten van ronde 28, in de volgorde waarin een koppelingsveld
 * ze aanbiedt. Die volgorde is niet vrijblijvend: de "'X' aanmaken"-rij van de
 * artikelkiezer maakt een artikel van de *eerste* slug in `ofType`.
 */
const PANTHEON = [
  'kosmische-goden',
  'aardse-goden',
  'eldritch-entiteiten',
  'bovennatuurlijke-wezens',
];

/**
 * §58: en de Abnormaliteiten erbij. Alles wat vereerd of gediend kan worden
 * staat hierin: het ding in de duinen is even goed iemands meester als de god
 * achter de sterren, en een lijst die de helft van het archief niet ziet is
 * erger dan geen lijst.
 */
const HOGERE_MACHTEN = [...PANTHEON, 'abnormality'];

/** §58: de soorten die iets kunnen vereren. Facties eerst — cults zijn facties. */
const VEREERDERS = ['character', 'investigator', 'faction'];

/**
 * §58: de hiërarchie is één veld, niet twee. Wie dient noemt zijn meester —
 * dat is de kant waar het aantal klein blijft — en de andere kant ("Dienaren")
 * is een zelfvullende lijst op de pagina van de meester, zodat niemand
 * dezelfde band twee keer hoeft in te tikken.
 */
const DIENAAR_VELD = {
  key: 'dienaar_van',
  label: 'Dienaar van',
  kind: 'entry_links',
  ofType: HOGERE_MACHTEN,
};

/** §58: de andere kant van Vereerd door, op de soorten die kunnen vereren. */
const VEREERT_VELD = {
  key: 'vereert',
  label: 'Vereert',
  kind: 'entry_links',
  ofType: HOGERE_MACHTEN,
};

/**
 * §58: de gedeelde kern van de vier. Nick's eigen lijstje — titels, domein,
 * verering, tekens, talen — plus de hiërarchie. Elke soort krijgt er daarna
 * twee velden bij die hem tot zichzelf maken, en niet meer: acht velden is een
 * fiche dat je invult, vijftien is een formulier dat je overslaat.
 */
const PANTHEON_KERN = [
  { key: 'titels', label: 'Titels en bijnamen', kind: 'text' },
  { key: 'domein', label: 'Domein', kind: 'text' },
  {
    key: 'vereerd_door',
    label: 'Vereerd door',
    kind: 'entry_links',
    // Facties eerst: "cults plaatsen we bij facties", en de kiezer maakt de
    // eerste soort uit deze rij aan.
    ofType: ['faction', 'character', 'investigator'],
  },
  { key: 'tekens', label: 'Tekens en voortekenen', kind: 'longtext' },
  { key: 'talen', label: 'Talen', kind: 'entry_links', ofType: ['language'] },
  DIENAAR_VELD,
];

/**
 * §58: de velden van Geschriften & Kunstwerken. Apart, omdat een bestaand
 * archief de soort al heeft — met alleen het Talen-veld van §55 — en de rest
 * er één keer bij aangeplakt moet worden.
 */
const WERKEN_VELDEN = [
  {
    key: 'soort_werk',
    label: 'Soort werk',
    kind: 'select',
    options: [
      'schilderij',
      'tekening of prent',
      'beeld',
      'boek',
      'handschrift',
      'grimoire',
      'toneelstuk',
      'lied of gedicht',
      'overlevering',
      'anders',
    ],
  },
  { key: 'maker', label: 'Maker', kind: 'entry_link', ofType: ['character', 'investigator', 'faction'] },
  { key: 'gemaakt', label: 'Gemaakt in', kind: 'date' },
  { key: 'bevindt_zich', label: 'Bevindt zich in', kind: 'entry_link', ofType: ['location'] },
  // §55: het enige veld dat deze soort ooit gehad heeft, en het blijft staan.
  { key: 'talen', label: 'Talen', kind: 'entry_links', ofType: ['language'] },
  // Wat het toont of beweert: een schilderij toont een plek, een grimoire
  // beweert iets over een god. Bewust zonder `ofType` — het mag alles zijn.
  { key: 'toont', label: 'Toont of beweert', kind: 'entry_links' },
];

/**
 * §58: welke geseede soort vroeger onder welk adres stond.
 *
 * De seed slaat een soort over zodra de Keeper hem zélf verhuisd heeft, en dat
 * onthoudt hij met de *oude* slug (`seed:type-renamed:<oud>`). Toen `lore`
 * `werken` werd stond er in `ENTRY_TYPES` opeens geen `lore` meer om over te
 * slaan — en dan zet de INSERT OR IGNORE alsnog een lege tweede "Geschriften &
 * Kunstwerken" naast de volle rij die de Keeper zelf al ergens heen gebracht
 * had. Deze regel is de brug tussen de twee namen. Een volgende hernoeming van
 * een geseede soort hoort hier ook in.
 */
const VOORHEEN = { werken: 'lore' };

/** The seeded entry types from the brief. Keeper-editable afterwards. */
export const ENTRY_TYPES = [
  {
    slug: 'character',
    border: 'solid',
    // "Personen", not "Personages": the dossier's tab, the access dials and the
    // search all say personen, and Nick asked for one word (5 Sep 2026).
    label: 'Personen',
    icon: 'person',
    colour: '#7A4A2B',
    sort_order: 10,
    fields: [
      { key: 'aliases', label: 'Bijnamen', kind: 'text' },
      { key: 'faction', label: 'Factie', kind: 'entry_link', ofType: ['faction'] },
      { key: 'status', label: 'Status', kind: 'select', options: STATUS_OPTIONS },
      { key: 'occupation', label: 'Beroep', kind: 'text' },
      { key: 'last_seen_at', label: 'Laatst gezien bij', kind: 'entry_link', ofType: ['location'] },
      // §51: the other end of Families → Leden, so either hand fills in the tie.
      { key: 'familie', label: 'Familie', kind: 'entry_link', ofType: ['family'] },
      // §55: welke talen deze persoon spreekt of leest.
      { key: 'talen', label: 'Talen', kind: 'entry_links', ofType: ['language'] },
      // §58: en wat zij vereert — de andere kant van Vereerd door.
      VEREERT_VELD,
    ],
  },
  {
    slug: 'investigator',
    border: 'double',
    label: 'Onderzoekers',
    icon: 'badge',
    colour: '#1F4E79',
    sort_order: 20,
    fields: [
      { key: 'player', label: 'Speler', kind: 'user_link' },
      { key: 'occupation', label: 'Beroep', kind: 'text' },
      { key: 'status', label: 'Status', kind: 'select', options: STATUS_OPTIONS },
      { key: 'sanity_note', label: 'Geestelijke toestand', kind: 'longtext' },
      { key: 'familie', label: 'Familie', kind: 'entry_link', ofType: ['family'] },
      { key: 'talen', label: 'Talen', kind: 'entry_links', ofType: ['language'] },
      VEREERT_VELD,
    ],
  },
  {
    slug: 'location',
    border: 'dashed',
    label: 'Locaties',
    icon: 'pin',
    colour: '#2F6B4F',
    sort_order: 30,
    fields: [
      { key: 'region', label: 'Streek', kind: 'text' },
      {
        key: 'type',
        label: 'Soort',
        kind: 'select',
        options: ['stad', 'dorp', 'kust', 'ruïne', 'gebouw', 'anders'],
      },
      // §19: a location's place on the map is a pin on the maps page, not a field.
    ],
  },
  {
    slug: 'object',
    border: 'dotted',
    label: 'Relieken',
    icon: 'badge',
    colour: '#8A6A24',
    sort_order: 40,
    fields: [
      { key: 'origin', label: 'Herkomst', kind: 'text' },
      {
        key: 'current_holder',
        label: 'Huidige houder',
        kind: 'entry_link',
        ofType: ['character', 'investigator'],
      },
      {
        key: 'current_location',
        label: 'Huidige locatie',
        kind: 'entry_link',
        ofType: ['location'],
      },
      // §55: een reliek is even vaak beschreven als gesproken over — in
      // welke taal staat het erop.
      { key: 'talen', label: 'Talen', kind: 'entry_links', ofType: ['language'] },
    ],
  },
  {
    // §24: found during an investigation, so made in a dossier and nowhere else.
    slug: 'item',
    border: 'dotted',
    label: 'Voorwerpen',
    icon: 'box',
    colour: '#6B5B4A',
    sort_order: 45,
    case_only: 1,
    fields: [
      { key: 'found_at', label: 'Gevonden bij', kind: 'entry_link', ofType: ['location'] },
      { key: 'found_by', label: 'Gevonden door', kind: 'entry_link', ofType: ['investigator'] },
      {
        key: 'current_holder',
        label: 'Huidige houder',
        kind: 'entry_link',
        ofType: ['character', 'investigator'],
      },
    ],
  },
  {
    slug: 'clue',
    border: 'heavy',
    label: 'Clues',
    icon: 'magnifier',
    colour: '#A8321E',
    sort_order: 50,
    case_only: 1,
    fields: [
      { key: 'found_at', label: 'Gevonden bij', kind: 'entry_link', ofType: ['location'] },
      { key: 'found_by', label: 'Gevonden door', kind: 'entry_link', ofType: ['investigator'] },
      { key: 'found_on', label: 'Gevonden tijdens', kind: 'entry_link', ofType: ['session'] },
      { key: 'points_to', label: 'Wijst naar', kind: 'entry_links' },
    ],
  },
  {
    slug: 'abnormality',
    border: 'frame',
    label: 'Abnormaliteiten',
    icon: 'eye',
    colour: '#5B3A78',
    sort_order: 60,
    fields: [
      {
        key: 'category',
        label: 'Categorie',
        kind: 'select',
        options: ['folkloristisch', 'cthulhiaans', 'onbekend'],
      },
      { key: 'first_sighting', label: 'Eerste waarneming', kind: 'entry_link', ofType: ['location'] },
      { key: 'threat', label: 'Dreiging', kind: 'text' },
      // §51: a bloedlijn does not always stay human — the ding in de duinen can
      // be somebody's oudoom, so an abnormaliteit may name a familie too.
      { key: 'familie', label: 'Familie', kind: 'entry_link', ofType: ['family'] },
      // §55: wat het ding zegt, of waarin het geschreven staat.
      { key: 'talen', label: 'Talen', kind: 'entry_links', ofType: ['language'] },
      // §58: een abnormaliteit is even vaak een dienaar als een verschijnsel.
      DIENAAR_VELD,
    ],
  },
  /*
   * §58: het pantheon. Vier soorten, één familie: dezelfde rand als de
   * Abnormaliteiten (`frame`), zodat ze op een prikbord vol kurk als één slag
   * dingen te herkennen zijn, en vier kleuren die van diep indigo naar het
   * paars van de Abnormaliteiten lopen. Ze staan met opzet tussen
   * Abnormaliteiten (60) en Facties (70): wat je vereert komt na wat je ziet
   * en voor wie zich eromheen verzamelt.
   */
  {
    slug: 'kosmische-goden',
    border: 'frame',
    label: 'Kosmische Goden',
    icon: 'clock',
    colour: '#3B2E5A',
    sort_order: 62,
    fields: [
      ...PANTHEON_KERN,
      {
        key: 'toestand',
        label: 'Toestand',
        kind: 'select',
        options: ['sluimerend', 'half wakker', 'ontwaakt', 'vertrokken', 'onbekend'],
      },
      { key: 'verblijf', label: 'Verblijfplaats', kind: 'text' },
    ],
  },
  {
    slug: 'aardse-goden',
    border: 'frame',
    label: 'Aardse Goden',
    icon: 'pin',
    colour: '#4F5B31',
    sort_order: 64,
    fields: [
      ...PANTHEON_KERN,
      // Een aardse god zit vast aan een plek. Dat is het verschil met de rest.
      { key: 'standplaats', label: 'Standplaats', kind: 'entry_links', ofType: ['location'] },
      { key: 'offer', label: 'Wat men offert', kind: 'text' },
    ],
  },
  {
    slug: 'eldritch-entiteiten',
    border: 'frame',
    label: 'Eldritch Entiteiten',
    icon: 'lock',
    colour: '#2E4F4A',
    sort_order: 66,
    fields: [
      ...PANTHEON_KERN,
      { key: 'verschijning', label: 'Verschijningsvorm', kind: 'text' },
      {
        key: 'gevaar',
        label: 'Gevaar',
        kind: 'select',
        options: ['te mijden', 'dodelijk', 'verstandverbijsterend', 'onbekend'],
      },
    ],
  },
  {
    slug: 'bovennatuurlijke-wezens',
    border: 'frame',
    label: 'Bovennatuurlijke wezens',
    icon: 'eye',
    colour: '#6E4B7A',
    sort_order: 68,
    fields: [
      ...PANTHEON_KERN,
      {
        key: 'aard',
        label: 'Aard',
        kind: 'select',
        options: ['spook', 'gedaanteverwisselaar', 'huisgeest', 'zeewezen', 'duivels', 'onbekend'],
      },
      { key: 'leefgebied', label: 'Leefgebied', kind: 'entry_links', ofType: ['location'] },
    ],
  },
  {
    slug: 'faction',
    border: 'tape',
    label: 'Facties',
    icon: 'flag',
    colour: '#31556B',
    sort_order: 70,
    fields: [
      {
        key: 'alignment',
        label: 'Gezindheid',
        kind: 'select',
        options: ['folkloristisch', 'cthulhiaans', 'menselijk', 'onbekend'],
      },
      { key: 'leader', label: 'Leider', kind: 'entry_link', ofType: ['character'] },
      { key: 'base', label: 'Basis', kind: 'entry_link', ofType: ['location'] },
      // §55: een gezelschap heeft een taal waarin het bidt of handelt.
      { key: 'talen', label: 'Talen', kind: 'entry_links', ofType: ['language'] },
      // §58: en waar het voor bidt. Een cultus is hier een factie, dus dit veld
      // is de reden dat Nick de vier soorten wilde.
      VEREERT_VELD,
    ],
  },
  {
    // §51: half of what happens on the eiland happens because of who somebody's
    // grandmother was. A familie is a thing in its own right — not a factie
    // with a surname — so it gets its own soort, and its leden box takes people,
    // onderzoekers *and* abnormaliteiten, because a bloedlijn does not always
    // stay human.
    slug: 'family',
    border: 'corner',
    label: 'Families',
    icon: 'shield',
    colour: '#6B2F3A',
    sort_order: 75,
    fields: [
      {
        key: 'leden',
        label: 'Leden',
        kind: 'entry_links',
        // `character` first: the picker's "'X' aanmaken" row makes the first slug.
        ofType: ['character', 'investigator', 'abnormality'],
      },
      {
        key: 'hoofd',
        label: 'Hoofd van de familie',
        kind: 'entry_link',
        ofType: ['character', 'investigator'],
      },
      { key: 'thuisbasis', label: 'Thuisbasis', kind: 'entry_link', ofType: ['location'] },
      {
        key: 'status',
        label: 'Status',
        kind: 'select',
        options: ['bloeiend', 'tanend', 'vervallen', 'uitgestorven'],
      },
      { key: 'gesticht', label: 'Gesticht in', kind: 'date' },
      { key: 'wapenspreuk', label: 'Wapenspreuk', kind: 'text' },
    ],
  },
  {
    slug: 'event',
    border: 'corner',
    label: 'Gebeurtenissen',
    icon: 'calendar',
    colour: '#6B4226',
    sort_order: 80,
    fields: [
      { key: 'date', label: 'Datum (in de wereld)', kind: 'date' },
      { key: 'location', label: 'Locatie', kind: 'entry_link', ofType: ['location'] },
      { key: 'involved', label: 'Betrokkenen', kind: 'entry_links' },
    ],
  },
  {
    // §58: "Overlevering en folklore" was één ding — het verhaal — en Nick
    // wilde er het schilderij, het grimoire, het toneelstuk en het boek bij.
    // Dan is "overlevering" te smal voor de doos: de soort heet Geschriften &
    // Kunstwerken en krijgt een adres dat dat ook zegt. Oude `/wiki/lore`-links
    // van buiten breken daarmee; diezelfde ruil is in ronde 8 voor Relieken
    // gemaakt en is met opzet opnieuw gemaakt. Zie de hernoeming in
    // `seedBaseline` voor wat er in een bestaand archief meeverhuist.
    slug: 'werken',
    border: 'inset',
    label: 'Geschriften & Kunstwerken',
    icon: 'book',
    colour: '#4A4A4A',
    sort_order: 90,
    fields: WERKEN_VELDEN,
  },
  {
    // §55: Talen. Op dit eiland wordt een taal net zo vaak van een steen
    // gelezen als gesproken, dus de moeilijkheidsgraad loopt van "eenvoudig"
    // tot "vrijwel onleesbaar" — één schaal voor de mond en het oog samen.
    slug: 'language',
    border: 'inset',
    label: 'Talen',
    icon: 'file',
    colour: '#3F6E72',
    // Naast Overlevering en folklore (90): een taal is een ding uit de wereld
    // dat je opzoekt, en zij staan op de lijst naast elkaar.
    sort_order: 95,
    fields: [
      {
        key: 'moeilijkheidsgraad',
        label: 'Moeilijkheidsgraad',
        kind: 'select',
        options: ['eenvoudig', 'te doen', 'lastig', 'zeer lastig', 'vrijwel onleesbaar'],
      },
      { key: 'schrift', label: 'Schrift', kind: 'text' },
      {
        key: 'staat',
        label: 'Staat',
        kind: 'select',
        options: ['levend', 'stervend', 'uitgestorven', 'alleen op schrift'],
      },
      { key: 'gebied', label: 'Waar gesproken', kind: 'entry_links', ofType: ['location'] },
      { key: 'verwant_aan', label: 'Verwant aan', kind: 'entry_links', ofType: ['language'] },
    ],
  },
  {
    slug: 'session',
    border: 'plain',
    label: 'Sessierapporten',
    icon: 'notebook',
    colour: '#5C544A',
    sort_order: 100,
    fields: [
      { key: 'session_number', label: 'Sessienummer', kind: 'text' },
      { key: 'date_played', label: 'Gespeeld op', kind: 'date' },
      { key: 'investigators_present', label: 'Aanwezige onderzoekers', kind: 'entry_links' },
      { key: 'cases_touched', label: 'Betrokken dossiers', kind: 'case_links' },
    ],
  },
];

/**
 * §11. A worked example of the page builder for three of the seeded soorten, so
 * a Keeper opening Beheer → Soorten fiches sees what a self-filling list *is*
 * rather than an empty "add a block" button. Written once, into types whose
 * page is still the standard one, and never again — the marker below is what
 * keeps the seed from walking over a Keeper's own arrangement on every restart.
 *
 * These match the shape `cleanBlocks()` produces, and are run through it on
 * every read anyway, so a mistake here is corrected rather than rendered.
 */
const EXAMPLE_BLOCKS = {
  faction: [
    { id: 'fields', kind: 'fields' },
    { id: 'body', kind: 'body' },
    {
      id: 'leden',
      kind: 'derived',
      title: 'Leden',
      note: 'Iedereen wiens veld Factie naar deze factie wijst.',
      open: true,
      fromType: ['character'],
      viaField: 'faction',
      sort: 'name',
    },
    {
      id: 'bondgenoten',
      kind: 'links',
      title: 'Bondgenoten',
      key: 'lijst_bondgenoten',
      ofType: ['faction'],
    },
    { id: 'sections', kind: 'sections' },
    { id: 'backlinks', kind: 'backlinks' },
    { id: 'history', kind: 'history' },
  ],
  // §51: a familie's leden are filled in from two sides — the Leden box on this
  // page, and the Familie veld on somebody's own fiche. This list is the second
  // side, so neither hand has to remember to write it twice.
  family: [
    { id: 'fields', kind: 'fields' },
    { id: 'body', kind: 'body' },
    {
      id: 'leden',
      kind: 'derived',
      title: 'Leden',
      note: 'Iedereen wiens veld Familie naar deze familie wijst.',
      open: true,
      fromType: ['character', 'investigator', 'abnormality'],
      viaField: 'familie',
      sort: 'name',
    },
    { id: 'sections', kind: 'sections' },
    { id: 'backlinks', kind: 'backlinks' },
    { id: 'history', kind: 'history' },
  ],
  // §55: dezelfde truc als bij Families, maar de lijst is breder dan
  // mensen alleen — een taal wordt gesproken, maar net zo vaak ergens in
  // geschreven, dus een reliek en een overlevering horen in dezelfde lijst.
  language: [
    { id: 'fields', kind: 'fields' },
    { id: 'body', kind: 'body' },
    {
      id: 'sprekers',
      kind: 'derived',
      title: 'Sprekers en geschriften',
      note: 'Alles waarvan het veld Talen deze taal noemt — wie haar spreekt, en waar zij geschreven staat.',
      open: true,
      // §58: `lore` heet hier `werken` — de hernoeming hieronder schrijft dit
      // in een bestaand archief zelf om, dit is de lijst voor een vers archief.
      fromType: ['character', 'investigator', 'object', 'abnormality', 'faction', 'werken'],
      viaField: 'talen',
      sort: 'name',
    },
    { id: 'sections', kind: 'sections' },
    { id: 'backlinks', kind: 'backlinks' },
    { id: 'history', kind: 'history' },
  ],
  location: [
    { id: 'fields', kind: 'fields' },
    { id: 'body', kind: 'body' },
    {
      id: 'hier-gevonden',
      kind: 'derived',
      title: 'Hier gevonden',
      note: 'Clues waarvan het veld Gevonden bij deze plek noemt.',
      open: true,
      fromType: ['clue'],
      viaField: 'found_at',
      sort: 'recent',
    },
    {
      id: 'laatst-hier-gezien',
      kind: 'derived',
      title: 'Laatst hier gezien',
      fromType: ['character'],
      viaField: 'last_seen_at',
      sort: 'name',
    },
    { id: 'sections', kind: 'sections' },
    { id: 'backlinks', kind: 'backlinks' },
    { id: 'history', kind: 'history' },
  ],
  investigator: [
    { id: 'fields', kind: 'fields' },
    { id: 'body', kind: 'body' },
    {
      id: 'gevonden-aanwijzingen',
      kind: 'derived',
      title: 'Gevonden clues',
      fromType: ['clue'],
      viaField: 'found_by',
      sort: 'recent',
    },
    { id: 'sections', kind: 'sections' },
    { id: 'backlinks', kind: 'backlinks' },
    { id: 'history', kind: 'history' },
  ],
};

/*
 * §58: de vier machten krijgen alle vier dezelfde twee zelfvullende lijsten,
 * dus ze worden hier gemaakt in plaats van vier keer overgetikt. Beide lijsten
 * zijn de andere kant van een veld dat ergens anders staat — dat is hoe deze
 * app een band van twee kanten laat lezen zonder hem twee keer te laten
 * invullen (Facties → Leden, een taal → Sprekers).
 *
 * Elke `fromType` noemt *elke* soort die het veld draagt. Vergeet er één en
 * een halve archiefkant valt stilletjes uit de lijst.
 */
const pantheonBlocks = () => [
  { id: 'fields', kind: 'fields' },
  { id: 'body', kind: 'body' },
  {
    id: 'vereerders',
    kind: 'derived',
    title: 'Vereerders',
    note: 'Alles waarvan het veld Vereert hierheen wijst — de cultus, en wie er los bij hoort.',
    open: true,
    fromType: VEREERDERS,
    viaField: 'vereert',
    sort: 'name',
  },
  {
    id: 'dienaren',
    kind: 'derived',
    title: 'Dienaren',
    note: 'Alles waarvan het veld Dienaar van deze macht noemt.',
    fromType: HOGERE_MACHTEN,
    viaField: 'dienaar_van',
    sort: 'name',
  },
  { id: 'sections', kind: 'sections' },
  { id: 'backlinks', kind: 'backlinks' },
  { id: 'history', kind: 'history' },
];

for (const slug of PANTHEON) EXAMPLE_BLOCKS[slug] = pantheonBlocks();

/**
 * §58: de hernoeming van een geseede soort tot in zijn adres, met de stoet
 * eraan vast. Dit is dezelfde cascade die `renameTypeSlug` in `lib/admin/types.ts`
 * voor de Keeper loopt — die kan hiervandaan niet aangeroepen worden (dit is
 * plain JS zonder de drizzle-laag), dus is hij hier stap voor stap nagebouwd,
 * en de twee moeten bij elkaar blijven:
 *
 *   - `entry_types.id` én `entry_types.slug` (de rij zelf; het id *is* de slug);
 *   - `entries.type_id`, elk artikel dat eronder staat;
 *   - `cases.tab_types`, de tabbladen die een dossier op slug heeft vastgezet (§7);
 *   - `ofType` op de velden van *elke* soort;
 *   - `ofType` en `fromType` op de paginablokken van *elke* soort.
 *
 * Eén transactie, want een half gedane hernoeming is een archief waarin de helft
 * van de artikelen geen soort heeft. Wat er met opzet *niet* meeverhuist is een
 * link in andermans aantekeningen: `/wiki/<oude-slug>` breekt, en geen cascade
 * in een database reikt daar tot.
 */
function renameSeededType(sqlite, from, to, label) {
  const herschrijf = (lijst) => {
    let geraakt = false;
    for (const item of Array.isArray(lijst) ? lijst : []) {
      for (const sleutel of ['ofType', 'fromType']) {
        if (!Array.isArray(item?.[sleutel]) || !item[sleutel].includes(from)) continue;
        item[sleutel] = item[sleutel].map((slug) => (slug === from ? to : slug));
        geraakt = true;
      }
    }
    return geraakt;
  };
  const setFields = sqlite.prepare('UPDATE entry_types SET fields = ? WHERE id = ?');
  const setBlocks = sqlite.prepare('UPDATE entry_types SET blocks = ? WHERE id = ?');
  const setTabs = sqlite.prepare('UPDATE cases SET tab_types = ? WHERE id = ?');
  sqlite.transaction(() => {
    sqlite
      .prepare('UPDATE entry_types SET id = ?, slug = ?, label = ? WHERE id = ?')
      .run(to, to, label, from);
    sqlite.prepare('UPDATE entries SET type_id = ? WHERE type_id = ?').run(to, from);
    for (const row of sqlite.prepare('SELECT id, tab_types FROM cases').all()) {
      if (!row.tab_types) continue;
      try {
        const tabs = JSON.parse(row.tab_types);
        if (!Array.isArray(tabs) || !tabs.includes(from)) continue;
        setTabs.run(JSON.stringify(tabs.map((slug) => (slug === from ? to : slug))), row.id);
      } catch {
        /* een rij die we niet kunnen lezen vertelt ons niets */
      }
    }
    // Elke soort, niet alleen deze: een `ofType` dat hem noemt kan op elke rij staan.
    for (const row of sqlite.prepare('SELECT id, fields, blocks FROM entry_types').all()) {
      try {
        const fields = JSON.parse(row.fields || '[]');
        if (herschrijf(fields)) setFields.run(JSON.stringify(fields), row.id);
      } catch {
        /* een met de hand bewerkte rij is van de Keeper, en blijft van hem */
      }
      try {
        const blocks = JSON.parse(row.blocks || '[]');
        if (herschrijf(blocks)) setBlocks.run(JSON.stringify(blocks), row.id);
      } catch {
        /* idem */
      }
    }
  })();
}

/** Select values stored by the English seed, and what they are called now. */
const VALUE_TRANSLATIONS = {
  alive: 'levend',
  dead: 'dood',
  missing: 'vermist',
  unknown: 'onbekend',
  city: 'stad',
  village: 'dorp',
  coast: 'kust',
  ruin: 'ruïne',
  building: 'gebouw',
  other: 'anders',
  folkloric: 'folkloristisch',
  cthulhian: 'cthulhiaans',
  human: 'menselijk',
};
const TRANSLATED_KEYS = ['status', 'type', 'category', 'alignment'];

/**
 * An entry filed when the select options were English still holds "alive"
 * where the picker now offers "levend". One pass over the fields JSON, only
 * for the four seeded select keys, and only for the exact old values.
 */
function translateFieldValues(sqlite) {
  const rows = sqlite.prepare('SELECT id, fields FROM entries').all();
  const write = sqlite.prepare('UPDATE entries SET fields = ? WHERE id = ?');
  for (const row of rows) {
    let fields;
    try {
      fields = JSON.parse(row.fields || '{}');
    } catch {
      continue;
    }
    let changed = false;
    for (const key of TRANSLATED_KEYS) {
      const value = fields?.[key];
      if (typeof value === 'string' && value in VALUE_TRANSLATIONS) {
        fields[key] = VALUE_TRANSLATIONS[value];
        changed = true;
      }
    }
    if (changed) write.run(JSON.stringify(fields), row.id);
  }
}

/**
 * Inserts the rows the app cannot run without: entry types and the settings
 * singleton. Never overwrites what is already there — except the seeded
 * types' words, see below.
 */
export function seedBaseline(sqlite) {
  const insertType = sqlite.prepare(
    `INSERT OR IGNORE INTO entry_types (id, slug, label, icon, colour, border, fields, sort_order, case_only)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  // Existing archives predate borders, so give each seeded type its treatment
  // whether the row is new or already there.
  const setBorder = sqlite.prepare(
    "UPDATE entry_types SET border = ? WHERE slug = ? AND (border IS NULL OR border = 'solid')",
  );
  // The English-to-Dutch changeover, run exactly once. The Keeper can edit
  // types from admin now (§11), so the seed must never write over their words
  // again — hence the marker row rather than an unconditional UPDATE.
  const marker = 'seed:dutch-labels';
  const alreadyTranslated = sqlite
    .prepare('SELECT name FROM schema_migrations WHERE name = ?')
    .get(marker);
  const setWords = sqlite.prepare('UPDATE entry_types SET label = ?, fields = ? WHERE slug = ?');
  // §11: a Keeper may now rename a soort all the way into its address, and
  // `entry_types.id` *is* the slug. So `object` becoming `relieken` leaves no
  // row with the id this loop is about to INSERT OR IGNORE — and without this,
  // the very next restart would put an empty second "Relieken" back under the
  // old address, beside the Keeper's own. `renameTypeSlug` writes a marker for
  // each slug it has moved away from; a soort whose shipped slug is on that
  // list is the Keeper's now, under whatever name and address, and the seed
  // never touches it again.
  const renamedAway = new Set(
    sqlite
      .prepare("SELECT name FROM schema_migrations WHERE name LIKE 'seed:type-renamed:%'")
      .all()
      .map((row) => row.name.slice('seed:type-renamed:'.length)),
  );
  // And a second source for the same fact, because `schema_migrations` is the
  // one table `scripts/restore.mjs` deliberately does not restore: after a
  // restore the markers are gone while the renamed rows are back. The audit log
  // is restored, is never pruned, and already carries every rename by name.
  for (const row of sqlite
    .prepare("SELECT meta FROM audit_log WHERE action = 'entry_type.renamed'")
    .all()) {
    try {
      const from = JSON.parse(row.meta ?? '{}').from;
      if (typeof from === 'string' && from) renamedAway.add(from);
    } catch {
      /* a meta blob we cannot read tells us nothing; the marker above still might */
    }
  }
  // §58: `lore` wordt `werken`, vóór de lus hieronder — anders zet de
  // INSERT OR IGNORE een tweede, lege "Geschriften & Kunstwerken" naast de
  // volle overlevering die er al staat. De hernoeming loopt de hele cascade
  // van `renameSeededType`, niet een kale UPDATE.
  //
  // Voorwaardelijk, op drie manieren, want dit is een archief van iemand
  // anders: alleen als de soort er nog onder zijn eigen adres staat, alleen
  // als het label nog woord voor woord het geseede is (§11 — een Keeper die
  // de soort hernoemd heeft houdt zijn woord), en nooit als de Keeper hem
  // zélf al verhuisd heeft. Dat laatste is precies waar `renamedAway`
  // hierboven voor is: het merkteken van de Keeper wint van het onze.
  const werkenMarker = 'seed:round-28-werken';
  const werkenDone = sqlite
    .prepare('SELECT name FROM schema_migrations WHERE name = ?')
    .get(werkenMarker);
  if (!werkenDone) {
    const oud = sqlite.prepare("SELECT label FROM entry_types WHERE id = 'lore'").get();
    const bezet = sqlite.prepare("SELECT id FROM entry_types WHERE id = 'werken'").get();
    if (oud && !bezet && !renamedAway.has('lore') && oud.label === 'Overlevering en folklore') {
      renameSeededType(sqlite, 'lore', 'werken', 'Geschriften & Kunstwerken');
    }
    sqlite.prepare('INSERT OR IGNORE INTO schema_migrations (name) VALUES (?)').run(werkenMarker);
  }

  for (const t of ENTRY_TYPES) {
    if (renamedAway.has(t.slug)) continue;
    // §58: en onder het adres waaronder die soort vroeger geleverd werd.
    if (VOORHEEN[t.slug] && renamedAway.has(VOORHEEN[t.slug])) continue;
    insertType.run(
      t.slug,
      t.slug,
      t.label,
      t.icon,
      t.colour,
      t.border,
      JSON.stringify(t.fields),
      t.sort_order,
      t.case_only ?? 0,
    );
    if (t.border !== 'solid') setBorder.run(t.border, t.slug);
    if (!alreadyTranslated) setWords.run(t.label, JSON.stringify(t.fields), t.slug);
  }
  if (!alreadyTranslated) {
    translateFieldValues(sqlite);
    sqlite.prepare('INSERT OR IGNORE INTO schema_migrations (name) VALUES (?)').run(marker);
  }

  // 5 Sep 2026: "Personages" became "Personen". Once, and only where the label
  // is still the shipped one — a Keeper who renamed the soort keeps their word.
  const personenMarker = 'seed:personen-label';
  const personenDone = sqlite
    .prepare('SELECT name FROM schema_migrations WHERE name = ?')
    .get(personenMarker);
  if (!personenDone) {
    sqlite
      .prepare("UPDATE entry_types SET label = 'Personen' WHERE slug = 'character' AND label = 'Personages'")
      .run();
    sqlite.prepare('INSERT OR IGNORE INTO schema_migrations (name) VALUES (?)').run(personenMarker);
  }

  // 5 Sep 2026: "Betrokken dossiers" was shipped as a single-dossier field
  // while dossierkoppelingen were still "fase 2". They are real now, and a
  // session touches more than one dossier, so the seeded field becomes the
  // several-dossiers kind — once, and only where the Keeper has not already
  // rebuilt that field themselves.
  const caseLinksMarker = 'seed:cases-touched-multi';
  const caseLinksDone = sqlite
    .prepare('SELECT name FROM schema_migrations WHERE name = ?')
    .get(caseLinksMarker);
  if (!caseLinksDone) {
    const row = sqlite.prepare("SELECT fields FROM entry_types WHERE slug = 'session'").get();
    if (row?.fields) {
      try {
        const fields = JSON.parse(row.fields);
        let touched = false;
        for (const field of Array.isArray(fields) ? fields : []) {
          if (field?.key === 'cases_touched' && field.kind === 'case_link') {
            field.kind = 'case_links';
            touched = true;
          }
        }
        if (touched) {
          sqlite
            .prepare("UPDATE entry_types SET fields = ? WHERE slug = 'session'")
            .run(JSON.stringify(fields));
        }
      } catch {
        /* a hand-edited row is the Keeper's, and stays theirs */
      }
    }
    sqlite.prepare('INSERT OR IGNORE INTO schema_migrations (name) VALUES (?)').run(caseLinksMarker);
  }

  // 5 Sep 2026, later: the soorten of round 7. "Voorwerpen en relieken" was two
  // things in one row, so it becomes *Relieken*, and a plain "Voorwerpen" is a
  // soort of its own. "Aanwijzingen" is called what everybody at the table
  // already calls it: *Clues*. And a session is a rapport, not a verslag.
  //
  // Every rename is conditional on the label still being the shipped one — a
  // Keeper who renamed a soort keeps their word (§11). The `case_only` flags are
  // not words but a rule Nick asked for, so those are set outright; the type
  // editor is where they are turned off again if he ever wants that.
  const soortenMarker = 'seed:round-7-soorten';
  const soortenDone = sqlite
    .prepare('SELECT name FROM schema_migrations WHERE name = ?')
    .get(soortenMarker);
  if (!soortenDone) {
    const rename = sqlite.prepare(
      'UPDATE entry_types SET label = ? WHERE slug = ? AND label = ?',
    );
    rename.run('Relieken', 'object', 'Voorwerpen en relieken');
    rename.run('Clues', 'clue', 'Aanwijzingen');
    rename.run('Sessierapporten', 'session', 'Sessieverslagen');
    // A relic is not a cardboard box; the box belongs to the new soort. Only
    // where the icon is still the one that shipped with it.
    sqlite
      .prepare("UPDATE entry_types SET icon = 'badge' WHERE slug = 'object' AND icon = 'box'")
      .run();
    sqlite
      .prepare("UPDATE entry_types SET case_only = 1 WHERE slug IN ('clue', 'item')")
      .run();

    // The two shipped example blocks that talk about aanwijzingen. Same rule:
    // only where the text is still word for word the one the seed wrote.
    const blockRows = sqlite
      .prepare("SELECT slug, blocks FROM entry_types WHERE slug IN ('location', 'investigator')")
      .all();
    const setBlocks = sqlite.prepare('UPDATE entry_types SET blocks = ? WHERE slug = ?');
    for (const row of blockRows) {
      if (!row.blocks) continue;
      try {
        const blocks = JSON.parse(row.blocks);
        if (!Array.isArray(blocks)) continue;
        let touched = false;
        for (const block of blocks) {
          if (block?.note === 'Aanwijzingen waarvan het veld Gevonden bij deze plek noemt.') {
            block.note = 'Clues waarvan het veld Gevonden bij deze plek noemt.';
            touched = true;
          }
          if (block?.title === 'Gevonden aanwijzingen') {
            block.title = 'Gevonden clues';
            touched = true;
          }
        }
        if (touched) setBlocks.run(JSON.stringify(blocks), row.slug);
      } catch {
        /* a hand-edited row is the Keeper's, and stays theirs */
      }
    }

    sqlite.prepare('INSERT OR IGNORE INTO schema_migrations (name) VALUES (?)').run(soortenMarker);
  }

  // §11's example pages, written once and only into a soort still using the
  // standard page. Same marker trick as the labels above: the Keeper owns these
  // rows now, and a restart must never undo an afternoon's arranging.
  const blocksMarker = 'seed:example-page-blocks';
  const blocksDone = sqlite
    .prepare('SELECT name FROM schema_migrations WHERE name = ?')
    .get(blocksMarker);
  if (!blocksDone) {
    const setBlocks = sqlite.prepare(
      "UPDATE entry_types SET blocks = ? WHERE slug = ? AND (blocks IS NULL OR blocks = '[]' OR blocks = '')",
    );
    for (const [slug, blocks] of Object.entries(EXAMPLE_BLOCKS)) {
      setBlocks.run(JSON.stringify(blocks), slug);
    }
    sqlite.prepare('INSERT OR IGNORE INTO schema_migrations (name) VALUES (?)').run(blocksMarker);
  }

  // §51: Families. The soort itself arrives on its own — it is a new row, and
  // the INSERT OR IGNORE above puts it in a fresh archive and an old one alike.
  // What an existing archive does *not* get that way is the other end of the
  // tie: Personen, Onderzoekers en Abnormaliteiten are rows that already exist,
  // so their Familie veld has to be appended by hand, once. Appended, never
  // written over: a soort that already has a veld with that key keeps it,
  // whatever the Keeper has since called it or pointed it at.
  const familiesMarker = 'seed:round-26-families';
  const familiesDone = sqlite
    .prepare('SELECT name FROM schema_migrations WHERE name = ?')
    .get(familiesMarker);
  if (!familiesDone) {
    const setFields = sqlite.prepare('UPDATE entry_types SET fields = ? WHERE slug = ?');
    const rows = sqlite
      .prepare(
        "SELECT slug, fields FROM entry_types WHERE slug IN ('character', 'investigator', 'abnormality')",
      )
      .all();
    for (const row of rows) {
      try {
        const fields = JSON.parse(row.fields || '[]');
        if (!Array.isArray(fields)) continue;
        if (fields.some((field) => field?.key === 'familie')) continue;
        if (fields.length >= 20) continue;
        fields.push({ key: 'familie', label: 'Familie', kind: 'entry_link', ofType: ['family'] });
        setFields.run(JSON.stringify(fields), row.slug);
      } catch {
        /* a hand-edited row is the Keeper's, and stays theirs */
      }
    }
    // The example page above ran its marker long ago in an existing archive, so
    // the new soort's own page is written here — and only while it is still the
    // standard one.
    sqlite
      .prepare(
        "UPDATE entry_types SET blocks = ? WHERE slug = 'family' AND (blocks IS NULL OR blocks = '[]' OR blocks = '')",
      )
      .run(JSON.stringify(EXAMPLE_BLOCKS.family));
    sqlite.prepare('INSERT OR IGNORE INTO schema_migrations (name) VALUES (?)').run(familiesMarker);
  }

  // §55: Talen. Precies dezelfde vorm als Families hierboven. De soort
  // zelf komt met de INSERT OR IGNORE mee, in een vers archief en een oud; het
  // Talen-veld op de zes soorten die er al zijn moet één keer met de hand
  // aangeplakt worden. Aanplakken, nooit overschrijven: een soort die al een
  // veld met die sleutel heeft houdt het, hoe de Keeper het sindsdien ook
  // genoemd of gericht heeft, en een soort die al aan de twintig velden zit
  // wordt overgeslagen.
  const talenMarker = 'seed:round-27-talen';
  const talenDone = sqlite
    .prepare('SELECT name FROM schema_migrations WHERE name = ?')
    .get(talenMarker);
  if (!talenDone) {
    const setFields = sqlite.prepare('UPDATE entry_types SET fields = ? WHERE slug = ?');
    const rows = sqlite
      .prepare(
        // §58: `lore` heet `werken` — de hernoeming bovenaan `seedBaseline`
        // is al langsgeweest tegen de tijd dat dit blok draait, dus dit is de
        // naam waaronder de soort hier gevonden wordt.
        "SELECT slug, fields FROM entry_types WHERE slug IN ('character', 'investigator', 'object', 'abnormality', 'faction', 'werken')",
      )
      .all();
    for (const row of rows) {
      try {
        const fields = JSON.parse(row.fields || '[]');
        if (!Array.isArray(fields)) continue;
        if (fields.some((field) => field?.key === 'talen')) continue;
        if (fields.length >= 20) continue;
        fields.push({ key: 'talen', label: 'Talen', kind: 'entry_links', ofType: ['language'] });
        setFields.run(JSON.stringify(fields), row.slug);
      } catch {
        /* a hand-edited row is the Keeper's, and stays theirs */
      }
    }
    sqlite
      .prepare(
        "UPDATE entry_types SET blocks = ? WHERE slug = 'language' AND (blocks IS NULL OR blocks = '[]' OR blocks = '')",
      )
      .run(JSON.stringify(EXAMPLE_BLOCKS.language));
    sqlite.prepare('INSERT OR IGNORE INTO schema_migrations (name) VALUES (?)').run(talenMarker);
  }

  // §58: het pantheon en de nieuwe velden van Geschriften & Kunstwerken.
  // Dezelfde vorm als Families (§51) en Talen (§55): de vier soorten zelf komen
  // met de INSERT OR IGNORE mee, in een vers archief en een oud, en wat een
  // bestaand archief daar níet mee krijgt zijn de velden op rijen die er al
  // waren. Aanplakken, nooit overschrijven: een soort die al een veld met die
  // sleutel heeft houdt het, hoe de Keeper het sindsdien ook genoemd of gericht
  // heeft, en een soort die al aan de twintig velden zit wordt overgeslagen.
  const pantheonMarker = 'seed:round-28-pantheon';
  const pantheonDone = sqlite
    .prepare('SELECT name FROM schema_migrations WHERE name = ?')
    .get(pantheonMarker);
  if (!pantheonDone) {
    const setFields = sqlite.prepare('UPDATE entry_types SET fields = ? WHERE slug = ?');
    const plak = (slug, nieuwe) => {
      const row = sqlite.prepare('SELECT fields FROM entry_types WHERE slug = ?').get(slug);
      if (!row) return;
      try {
        const fields = JSON.parse(row.fields || '[]');
        if (!Array.isArray(fields)) return;
        let geraakt = false;
        for (const veld of nieuwe) {
          if (fields.some((field) => field?.key === veld.key)) continue;
          if (fields.length >= 20) break;
          fields.push(veld);
          geraakt = true;
        }
        if (geraakt) setFields.run(JSON.stringify(fields), slug);
      } catch {
        /* a hand-edited row is the Keeper's, and stays theirs */
      }
    };
    // Wie kan vereren krijgt Vereert; een abnormaliteit kan ook een dienaar zijn.
    for (const slug of VEREERDERS) plak(slug, [VEREERT_VELD]);
    plak('abnormality', [DIENAAR_VELD]);
    // En de soort die hierboven van adres veranderd is krijgt haar doos: het
    // Talen-veld van §55 staat er al en wordt overgeslagen.
    plak('werken', WERKEN_VELDEN);

    const setBlocks = sqlite.prepare(
      "UPDATE entry_types SET blocks = ? WHERE slug = ? AND (blocks IS NULL OR blocks = '[]' OR blocks = '')",
    );
    for (const slug of PANTHEON) setBlocks.run(JSON.stringify(EXAMPLE_BLOCKS[slug]), slug);
    sqlite.prepare('INSERT OR IGNORE INTO schema_migrations (name) VALUES (?)').run(pantheonMarker);
  }

  const has = sqlite.prepare('SELECT id FROM site_settings WHERE id = 1').get();
  if (!has) {
    sqlite
      .prepare(
        `INSERT INTO site_settings (id, name, tagline, invite_code, theme)
         VALUES (1, 'Zeeland Case Files', 'Archief van het Eiland', ?, '{}')`,
      )
      .run(makeInviteCode());
  }
}
