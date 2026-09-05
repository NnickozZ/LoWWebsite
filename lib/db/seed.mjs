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

/** The seeded entry types from the brief. Keeper-editable afterwards. */
export const ENTRY_TYPES = [
  {
    slug: 'character',
    border: 'solid',
    label: 'Personages',
    icon: 'person',
    colour: '#7A4A2B',
    sort_order: 10,
    fields: [
      { key: 'aliases', label: 'Bijnamen', kind: 'text' },
      { key: 'faction', label: 'Factie', kind: 'entry_link', ofType: ['faction'] },
      { key: 'status', label: 'Status', kind: 'select', options: STATUS_OPTIONS },
      { key: 'occupation', label: 'Beroep', kind: 'text' },
      { key: 'last_seen_at', label: 'Laatst gezien bij', kind: 'entry_link', ofType: ['location'] },
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
    label: 'Voorwerpen en relieken',
    icon: 'box',
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
    ],
  },
  {
    slug: 'clue',
    border: 'heavy',
    label: 'Aanwijzingen',
    icon: 'magnifier',
    colour: '#A8321E',
    sort_order: 50,
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
    slug: 'lore',
    border: 'inset',
    label: 'Overlevering en folklore',
    icon: 'book',
    colour: '#4A4A4A',
    sort_order: 90,
    fields: [],
  },
  {
    slug: 'session',
    border: 'plain',
    label: 'Sessieverslagen',
    icon: 'notebook',
    colour: '#5C544A',
    sort_order: 100,
    fields: [
      { key: 'session_number', label: 'Sessienummer', kind: 'text' },
      { key: 'date_played', label: 'Gespeeld op', kind: 'date' },
      { key: 'investigators_present', label: 'Aanwezige onderzoekers', kind: 'entry_links' },
      { key: 'cases_touched', label: 'Betrokken dossiers', kind: 'case_link' },
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
  location: [
    { id: 'fields', kind: 'fields' },
    { id: 'body', kind: 'body' },
    {
      id: 'hier-gevonden',
      kind: 'derived',
      title: 'Hier gevonden',
      note: 'Aanwijzingen waarvan het veld Gevonden bij deze plek noemt.',
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
      title: 'Gevonden aanwijzingen',
      fromType: ['clue'],
      viaField: 'found_by',
      sort: 'recent',
    },
    { id: 'sections', kind: 'sections' },
    { id: 'backlinks', kind: 'backlinks' },
    { id: 'history', kind: 'history' },
  ],
};

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
    `INSERT OR IGNORE INTO entry_types (id, slug, label, icon, colour, border, fields, sort_order)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
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
  for (const t of ENTRY_TYPES) {
    insertType.run(
      t.slug,
      t.slug,
      t.label,
      t.icon,
      t.colour,
      t.border,
      JSON.stringify(t.fields),
      t.sort_order,
    );
    if (t.border !== 'solid') setBorder.run(t.border, t.slug);
    if (!alreadyTranslated) setWords.run(t.label, JSON.stringify(t.fields), t.slug);
  }
  if (!alreadyTranslated) {
    translateFieldValues(sqlite);
    sqlite.prepare('INSERT OR IGNORE INTO schema_migrations (name) VALUES (?)').run(marker);
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
