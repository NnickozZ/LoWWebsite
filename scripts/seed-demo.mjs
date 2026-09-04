import { randomBytes } from 'node:crypto';
import { loadEnv } from './ensure-env.mjs';

loadEnv();

const { openDb } = await import('../lib/db/open.mjs');
const { seedBaseline } = await import('../lib/db/seed.mjs');

const ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';
function newId() {
  let out = '';
  for (const b of randomBytes(16)) out += ALPHABET[b % ALPHABET.length];
  return out;
}

function slugify(input) {
  return (
    input
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'entry'
  );
}

/** Paragraphs, with `{{slug}}` turning into a chip link to that entry. */
function doc(paragraphs, resolve) {
  return {
    type: 'doc',
    content: paragraphs.map((text) => ({
      type: 'paragraph',
      content: text
        .split(/(\{\{[^}]+\}\})/)
        .filter(Boolean)
        .map((part) => {
          const match = part.match(/^\{\{([^}]+)\}\}$/);
          if (!match) return { type: 'text', text: part };
          const target = resolve(match[1]);
          if (!target) return { type: 'text', text: match[1] };
          return {
            type: 'entryLink',
            attrs: {
              id: target.id,
              label: target.name,
              slug: target.slug,
              icon: target.icon,
              colour: target.colour,
            },
          };
        }),
    })),
  };
}

function docToText(node, out = []) {
  if (!node || typeof node !== 'object') return out;
  if (node.type === 'text') out.push(node.text ?? '');
  else if (node.type === 'entryLink') out.push(node.attrs?.label ?? '');
  else if (Array.isArray(node.content)) {
    for (const child of node.content) docToText(child, out);
    if (node.type === 'paragraph') out.push('\n');
  }
  return out;
}

const db = openDb();
seedBaseline(db);

if (db.prepare('SELECT COUNT(*) AS n FROM entries').get().n > 0) {
  console.log('This archive already has entries. `make reset` first if you want the demo alone.');
  process.exit(0);
}

const keeper = db.prepare('SELECT id FROM users WHERE is_keeper = 1 LIMIT 1').get();
const author = keeper?.id ?? null;

const types = Object.fromEntries(
  db.prepare('SELECT slug, icon, colour FROM entry_types').all().map((t) => [t.slug, t]),
);

/* -------------------------------------------------------------- the data */

const SEED = [
  // -- Locations ------------------------------------------------------------
  {
    key: 'middelburg',
    type: 'location',
    name: 'Middelburg',
    short:
      'The drifted capital. Abbey tower still standing, half the Markt under a permanent salt haze, and a curfew nobody voted for.',
    fields: { region: 'Walcheren', type: 'stad' },
    tags: ['city', 'walcheren'],
    body: [
      'Since the drift, Middelburg has been the only place on the island with working telephones. The Lange Jan tower is used as a signal mast; the abbey cloisters house what is left of the provincial government.',
      'The harbour district answers to nobody in particular, which is where {{de-schorre}} does its trading.',
    ],
  },
  {
    key: 'vlissingen',
    type: 'location',
    name: 'Vlissingen',
    short:
      'Port town facing open water on three sides now. The quays are busy at hours no honest cargo keeps.',
    fields: { region: 'Walcheren', type: 'kust' },
    tags: ['coast', 'harbour'],
    body: [
      'German-flagged vessels put in here without papers. The harbourmaster records them anyway, in a second ledger he keeps in his coat.',
    ],
  },
  {
    key: 'westkapelle',
    type: 'location',
    name: 'Westkapelle Lighthouse',
    short:
      'A squat brick tower on the dike. The light has been turning since the drift, though the keeper says he has not wound it.',
    fields: { region: 'Walcheren', type: 'gebouw' },
    tags: ['coast', 'lighthouse'],
    body: [
      '{{jacob-den-hollander}} keeps the light. He will not discuss what the beam sweeps over on the seaward side.',
    ],
  },
  {
    key: 'oosterschelde',
    type: 'location',
    name: 'The Oosterschelde',
    short:
      'The strait that used to separate Zeeland from the mainland. It now separates it from nothing, and the water in it is warmer than the sea around it.',
    fields: { region: 'Open water', type: 'kust' },
    tags: ['water'],
    body: ['Soundings taken by Rijkswaterstaat do not agree with each other. See {{the-second-sounding}}.'],
  },

  // -- Characters -----------------------------------------------------------
  {
    key: 'jacob-den-hollander',
    type: 'character',
    name: 'Jacob den Hollander',
    short:
      'Lighthouse keeper at Westkapelle. Sixty-odd, deaf in one ear, and unwilling to sleep between two and four in the morning.',
    fields: { occupation: 'Lighthouse keeper', status: 'levend' },
    tags: ['walcheren', 'witness'],
    body: ['Keeps a logbook of everything the light passes over. Has never let anyone read it.'],
  },
  {
    key: 'anneke-visser',
    type: 'character',
    name: 'Anneke Visser',
    short:
      'Rijkswaterstaat engineer sent to survey the new coastline. Precise, sceptical, and increasingly unable to explain her own measurements.',
    fields: { occupation: 'Hydraulic engineer', status: 'levend' },
    tags: ['rijkswaterstaat'],
    body: ['Her soundings of {{oosterschelde}} are the origin of {{the-second-sounding}}.'],
  },
  {
    key: 'gerhard-lang',
    type: 'character',
    name: 'Doktor Gerhard Lang',
    short:
      'A visiting German antiquarian with impeccable manners, a Leica, and letters of introduction from three institutions that do not exist.',
    fields: { occupation: 'Antiquarian', status: 'levend' },
    tags: ['german', 'relic-hunter'],
    body: ['Buys anything dredged up. Pays in guilders, always exact, always cash.'],
  },
  {
    key: 'sister-clasina',
    type: 'character',
    name: 'Sister Clasina',
    short:
      'Runs the almshouse behind the abbey. Knows every name on the island and which of them have stopped answering to it.',
    fields: { occupation: 'Almoner', status: 'levend' },
    tags: ['middelburg'],
    body: [],
  },
  {
    key: 'pier-boone',
    type: 'character',
    name: 'Pier Boone',
    short:
      'Harbourmaster at Vlissingen. Keeps two ledgers and will show you the wrong one first.',
    fields: { occupation: 'Harbourmaster', status: 'levend' },
    tags: ['harbour', 'vlissingen'],
    body: [],
  },
  {
    key: 'the-drowned-boy',
    type: 'character',
    name: 'The Drowned Boy',
    short:
      'Pulled from the Oosterschelde in March, warm to the touch, and buried twice. Nobody has claimed him.',
    fields: { status: 'dood' },
    tags: ['unexplained'],
    body: [],
  },

  // -- Factions -------------------------------------------------------------
  {
    key: 'de-schorre',
    type: 'faction',
    name: 'De Schorre',
    short:
      'The salt-marsh men. Smugglers before the drift, the closest thing to a coastguard after it.',
    fields: { alignment: 'menselijk' },
    tags: ['smugglers'],
    body: ['Based out of the Vlissingen quays. Tolerated because they are useful.'],
  },
  {
    key: 'the-ahnenerbe-party',
    type: 'faction',
    name: 'The Ahnenerbe Party',
    short:
      'Four Germans with survey equipment, an unlimited budget and no interest at all in surveying.',
    fields: { alignment: 'menselijk' },
    tags: ['german', 'relic-hunter'],
    body: ['{{gerhard-lang}} speaks for them in public.'],
  },

  // -- Objects --------------------------------------------------------------
  {
    key: 'the-tidal-bell',
    type: 'object',
    name: 'The Tidal Bell',
    short:
      'A bronze bell dredged off Westkapelle, green with age, and warm on the hour whether or not anyone strikes it.',
    fields: { origin: 'Dredged from the Westkapelle shoals' },
    tags: ['relic'],
    body: ['Currently in the abbey undercroft. {{gerhard-lang}} has offered for it twice.'],
  },
  {
    key: 'the-keepers-logbook',
    type: 'object',
    name: "The Keeper's Logbook",
    short:
      'Jacob den Hollander’s record of everything the Westkapelle beam has passed over since the drift.',
    fields: { origin: 'Westkapelle' },
    tags: ['document'],
    body: [],
  },
  {
    key: 'lang-s-leica',
    type: 'object',
    name: "Lang's Leica",
    short:
      'A camera that has been used to photograph things that did not develop, and one thing that developed twice.',
    fields: { origin: 'Wetzlar, 1932' },
    tags: ['german'],
    body: [],
  },

  // -- Clues ----------------------------------------------------------------
  {
    key: 'the-second-sounding',
    type: 'clue',
    name: 'The Second Sounding',
    short:
      'Two depth readings taken twelve minutes apart at the same buoy: 11 metres, then 340.',
    tags: ['water', 'measurement'],
    body: ['Taken by {{anneke-visser}} in the {{oosterschelde}}. She has not filed the second figure.'],
  },
  {
    key: 'the-warm-corpse',
    type: 'clue',
    name: 'The Warm Corpse',
    short: 'The Drowned Boy was 31 degrees at the quayside, four hours after being pulled out.',
    tags: ['unexplained'],
    body: ['Recorded by the Vlissingen doctor, then struck from the record. See {{the-drowned-boy}}.'],
  },
  {
    key: 'the-unwound-light',
    type: 'clue',
    name: 'The Unwound Light',
    short:
      'The Westkapelle lamp has turned for eleven weeks. Its clockwork was last wound before the drift.',
    tags: ['lighthouse'],
    body: ['{{jacob-den-hollander}} will confirm this and nothing else.'],
  },

  // -- Abnormalities --------------------------------------------------------
  {
    key: 'the-hollow-tide',
    type: 'abnormality',
    name: 'The Hollow Tide',
    short:
      'Twice a month the water off Westkapelle withdraws further than any chart allows and does not come back for nine hours.',
    fields: { category: 'unknown', threat: 'Whatever walks in on the dry ground' },
    tags: ['water'],
    body: ['First recorded at {{westkapelle}}.'],
  },
  {
    key: 'de-witte-wieven',
    type: 'abnormality',
    name: 'De Witte Wieven',
    short:
      'Mist-women of the inland polders. Older than the drift, and considerably more active since it.',
    fields: { category: 'folkloristisch', threat: 'Leads travellers off the dike road' },
    tags: ['folklore'],
    body: [],
  },

  // -- Lore -----------------------------------------------------------------
  {
    key: 'the-drift',
    type: 'lore',
    name: 'The Drift',
    short:
      'On the night of 9 February 1934 the province of Zeeland was, by every instrument available, somewhere else.',
    tags: ['origin'],
    body: [
      'No shock, no wave, no sound. The mainland lights simply were not there in the morning, and the compass on the abbey tower had turned eleven degrees.',
      'Nothing since has explained it. {{anneke-visser}} was sent to measure it and has been measuring ever since.',
    ],
  },
];

/* ------------------------------------------------------------- insertion */

const byKey = new Map();

const insertEntry = db.prepare(
  `INSERT INTO entries (id, type_id, name, slug, short_description, body, body_text, fields, tags, created_by, updated_by)
   VALUES (@id, @type_id, @name, @slug, @short_description, @body, @body_text, @fields, @tags, @author, @author)`,
);
const insertFts = db.prepare(
  'INSERT INTO entries_fts (entry_id, name, short_description, body_text, tags) VALUES (?, ?, ?, ?, ?)',
);
const insertLink = db.prepare(
  "INSERT OR IGNORE INTO entry_links (from_entry_id, to_entry_id, kind, label) VALUES (?, ?, 'mention', '')",
);
const insertActivity = db.prepare(
  "INSERT INTO activity (id, actor_id, verb, entry_id) VALUES (?, ?, 'entry.created', ?)",
);
const insertRevision = db.prepare(
  "INSERT INTO entry_revisions (id, entry_id, snapshot, edited_by, note) VALUES (?, ?, ?, ?, 'created')",
);

// Pass one: rows, so links can resolve in pass two.
for (const item of SEED) {
  const type = types[item.type];
  byKey.set(item.key, {
    id: newId(),
    name: item.name,
    slug: slugify(item.name),
    icon: type.icon,
    colour: type.colour,
  });
}

const resolve = (key) => byKey.get(key);

const run = db.transaction(() => {
  for (const item of SEED) {
    const row = byKey.get(item.key);
    const body = doc(item.body ?? [], resolve);
    const bodyText = docToText(body).join('').replace(/\n{2,}/g, '\n').trim();

    insertEntry.run({
      id: row.id,
      type_id: item.type,
      name: item.name,
      slug: row.slug,
      short_description: item.short,
      body: JSON.stringify(body),
      body_text: bodyText,
      fields: JSON.stringify(item.fields ?? {}),
      tags: JSON.stringify(item.tags ?? []),
      author,
    });
    insertFts.run(row.id, item.name, item.short, bodyText, (item.tags ?? []).join(' '));
    insertActivity.run(newId(), author, row.id);
    insertRevision.run(
      newId(),
      row.id,
      JSON.stringify({
        name: item.name,
        shortDescription: item.short,
        body,
        bodyText,
        fields: item.fields ?? {},
        tags: item.tags ?? [],
        typeId: item.type,
      }),
      author,
    );

    for (const match of JSON.stringify(body).matchAll(/"id":"([a-z0-9]{16})"/g)) {
      if (match[1] !== row.id) insertLink.run(row.id, match[1]);
    }
  }

  // Phase 3 has something to look at too: one locked entry, one Keeper-only
  // entry, and one prepped section waiting to be flipped on.
  const lighthouse = byKey.get('westkapelle');
  if (lighthouse) {
    db.prepare('UPDATE entries SET is_locked = 1 WHERE id = ?').run(lighthouse.id);
    db.prepare(
      `INSERT INTO entry_sections (id, entry_id, title, body, body_text, visibility, sort_order)
       VALUES (?, ?, 'Wat er in de lampkamer staat', ?, ?, 'keeper', 10)`,
    ).run(
      newId(),
      lighthouse.id,
      JSON.stringify(doc(['Het uurwerk is eruit gehaald. Wat de lamp nu draait, staat er nog.'])),
      'Het uurwerk is eruit gehaald. Wat de lamp nu draait, staat er nog.',
    );
  }
  const drowned = byKey.get('the-drowned-boy');
  if (drowned) {
    db.prepare("UPDATE entries SET visibility = 'keeper' WHERE id = ?").run(drowned.id);
  }

  // One open case and one board, so Phase 2 has something to open on day one.
  const caseId = newId();
  db.prepare(
    `INSERT INTO cases (id, name, slug, summary, status, created_by)
     VALUES (?, 'The Unwound Light', 'the-unwound-light-case',
             'Why has the Westkapelle lamp turned for eleven weeks without being wound?', 'open', ?)`,
  ).run(caseId, author);

  if (author) {
    db.prepare('INSERT OR IGNORE INTO case_members (case_id, user_id) VALUES (?, ?)').run(
      caseId,
      author,
    );
  }

  const inCase = [
    'westkapelle',
    'jacob-den-hollander',
    'the-unwound-light',
    'the-keepers-logbook',
    'the-hollow-tide',
    'anneke-visser',
    'gerhard-lang',
    'the-tidal-bell',
  ];
  const addToCase = db.prepare(
    'INSERT INTO case_entries (case_id, entry_id, added_by, note) VALUES (?, ?, ?, ?)',
  );
  for (const key of inCase) {
    const row = byKey.get(key);
    if (row) addToCase.run(caseId, row.id, author, '');
  }

  const cards = inCase.slice(0, 5).map((key, index) => {
    const row = byKey.get(key);
    return {
      id: newId(),
      kind: 'entry',
      entryId: row.id,
      name: row.name,
      text: '',
      x: 120 + (index % 3) * 260,
      y: 120 + Math.floor(index / 3) * 300,
      rotation: [-1.4, 0.8, -0.6, 1.7, -1.1][index],
    };
  });

  db.prepare(
    `INSERT INTO boards (id, name, case_id, state, created_by) VALUES (?, 'The Unwound Light', ?, ?, ?)`,
  ).run(
    newId(),
    caseId,
    JSON.stringify({
      cards,
      strings: [
        { id: newId(), from: cards[0].id, to: cards[1].id, label: 'keeps the light' },
        { id: newId(), from: cards[1].id, to: cards[2].id, label: 'will not explain it' },
        { id: newId(), from: cards[2].id, to: cards[4].id, label: 'same nights' },
      ],
      viewport: { x: 0, y: 0, zoom: 1 },
    }),
    author,
  );
});

run();

console.log(`Seeded ${SEED.length} entries, 1 open case and 1 board.`);
console.log('Run `npm run dev` and open http://localhost:3000');
