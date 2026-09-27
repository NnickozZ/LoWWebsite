import { mkdtempSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { isEmptyDoc } from '@/lib/entries/doc';
import { DEFAULT_WORDS, WORD_DEFS, WORD_GROUPS, WORD_MAX, fill } from '@/lib/words';

/**
 * §101 (ronde 62, "De losse eindjes").
 *
 * Langs de weg die de app loopt (§86's tweede les): het feed via
 * `recentActivity` (wat Start en de spelerspagina aanroepen), de lade via
 * `giveToDrawer` (wat de route aanroept), `room:{id}` door de ORM-logger heen.
 *
 *   4.  Kamerhandelingen in een privé-kamer staan niet in het feed van een speler.
 *   8.  De Keeper legt iets rechtstreeks in een lade.
 *   10. "Er is iets misgegaan." komt uit `lib/words.ts`.
 *   17. Een lege Tekst: `isEmptyDoc` kijkt naar knopen, niet naar tekst.
 *   12, 15, 20, 21: één bron, geen dode CSS, het zoekscherm in woorden.
 */

const dir = mkdtempSync(join(tmpdir(), 'zcf-ronde62-eindjes-'));
process.env.DATA_DIR = dir;

type Kamers = typeof import('@/lib/kamers/service');
type Entries = typeof import('@/lib/entries/service');
type Changes = typeof import('@/lib/live/changes');

let kamers: Kamers;
let entries: Entries;
let changes: Changes;
let sqlite: typeof import('@/lib/db').sqlite;
let HUISRAAD: string;

const KEEPER = { id: 'keeper-1', isKeeper: true };
const BRAM = { id: 'bram', isKeeper: false };
const AAGJE = { id: 'aagje', isKeeper: false };

const run = (sql: string, ...args: unknown[]) => sqlite.prepare(sql).run(...args);

const openSlot = (roomId: string, kind: string) =>
  (
    sqlite
      .prepare('SELECT id FROM room_slots WHERE room_id = ? AND kind = ? AND unlocked_at IS NOT NULL ORDER BY sort_order')
      .all(roomId, kind) as { id: string }[]
  )[0];
const lockedSlot = (roomId: string) =>
  (
    sqlite
      .prepare('SELECT id FROM room_slots WHERE room_id = ? AND unlocked_at IS NULL ORDER BY sort_order')
      .all(roomId) as { id: string }[]
  )[0];
const drawer = (roomId: string) =>
  (sqlite.prepare('SELECT entry_id AS entryId FROM room_drawer WHERE room_id = ?').all(roomId) as {
    entryId: string;
  }[]).map((row) => row.entryId);

const heard = (write: () => void): string[] => {
  const got: string[] = [];
  changes.flushChanges();
  changes.setChangeDelivery((keys) => got.push(...keys));
  try {
    write();
    changes.flushChanges();
  } finally {
    changes.setChangeDelivery(() => undefined);
  }
  return got;
};

/** De room.*-regels in iemands feed, als `werkwoord:ding`. */
const roomRows = (viewer: { id: string; isKeeper: boolean }) =>
  entries
    .recentActivity(viewer, 100)
    .filter((item) => item.verb.startsWith('room.'))
    .map((item) => `${item.verb}:${item.entry?.id}`);

let ROOM: string;
let NPC_ROOM: string;

beforeAll(async () => {
  const dbModule = await import('@/lib/db');
  sqlite = dbModule.sqlite;
  kamers = await import('@/lib/kamers/service');
  entries = await import('@/lib/entries/service');
  changes = await import('@/lib/live/changes');
  const shape = await import('@/lib/kamers/shape');

  for (const [id, name, keeper] of [
    ['keeper-1', 'Keeper', 1],
    ['bram', 'Bram', 0],
    ['aagje', 'Aagje', 0],
  ] as const) {
    run(
      `INSERT INTO users (id, username, username_lower, password_hash, is_keeper) VALUES (?, ?, ?, 'x', ?)`,
      id,
      name,
      name.toLowerCase(),
      keeper,
    );
  }
  const entry = (id: string, typeId: string, name: string, slug: string, fields: object = {}) =>
    run(
      `INSERT INTO entries (id, type_id, name, slug, fields, tags, visibility, created_by, view_mode, edit_mode)
       VALUES (?, ?, ?, ?, ?, '[]', 'all', 'keeper-1', 'all', 'all')`,
      id,
      typeId,
      name,
      slug,
      JSON.stringify(fields),
    );
  HUISRAAD = (sqlite.prepare("SELECT id FROM entry_types WHERE slug = 'huisraad'").get() as { id: string }).id;
  const ITEM = (sqlite.prepare("SELECT id FROM entry_types WHERE slug = 'item'").get() as { id: string }).id;
  run(
    `INSERT INTO entry_types (id, slug, label, icon, colour, fields, sort_order, keeper_made, one_of_a_kind)
     SELECT 'type-uniek', 'uniek-huisraad', 'Uniek huisraad', icon, colour, fields, 99, 1, 1
       FROM entry_types WHERE id = ?`,
    HUISRAAD,
  );

  entry('e-bram', 'investigator', 'Bram Verhulst', 'bram-verhulst');
  // §86: een onderzoeker die niemand draagt — de Keeper opent zijn kamer, en die is dicht.
  entry('e-npc', 'investigator', 'Adriaan Sinke', 'adriaan-sinke');
  run(`INSERT INTO user_characters (user_id, entry_id, sort_order) VALUES ('bram', 'e-bram', 0)`);

  entry('h-stoel', HUISRAAD, 'Leesstoel', 'leesstoel', {
    [shape.VOORWERP_FIELD_KEY]: ['bureau', 'plank'],
    [shape.PRICE_FIELD_KEY]: 1,
  });
  entry('h-zonder', HUISRAAD, 'Iets zonder plek', 'iets-zonder-plek', { [shape.PRICE_FIELD_KEY]: 1 });
  entry('u-bel', 'type-uniek', 'Scheepsbel', 'scheepsbel', { [shape.VOORWERP_FIELD_KEY]: ['plank'] });
  entry('v-lantaarn', ITEM, 'Lantaarn', 'lantaarn', { [shape.VOORWERP_FIELD_KEY]: ['plank'] });
});

beforeEach(() => {
  run('DELETE FROM room_ledger');
  run('DELETE FROM room_slots');
  run('DELETE FROM room_drawer');
  run('DELETE FROM rooms');
  run('DELETE FROM activity');
  ROOM = kamers.getOrCreateRoom('e-bram')!;
  NPC_ROOM = kamers.openRoomFor('e-npc', KEEPER)!;
});

/* ============================================================ 4. het feed */

describe('§101 (4): een privé-kamer staat niet in het feed van wie hem niet mag zien', () => {
  it('hides room.placed, room.opened and room.bought in a closed §86 kamer from a speler', () => {
    kamers.grant(NPC_ROOM, 10, 'voor de figuur', KEEPER);
    kamers.placeItem(openSlot(NPC_ROOM, 'plank').id, 'v-lantaarn', KEEPER);
    kamers.unlockSlot(lockedSlot(NPC_ROOM).id, KEEPER);
    kamers.buyFurnishing(openSlot(NPC_ROOM, 'bureau').id, 'h-stoel', KEEPER);

    const keeper = roomRows(KEEPER);
    expect(keeper).toEqual(
      expect.arrayContaining(['room.placed:v-lantaarn', 'room.opened:e-npc', 'room.bought:h-stoel']),
    );
    // De dingen zelf zijn voor iedereen zichtbaar; de kamer niet.
    expect(roomRows(BRAM)).toEqual([]);
    expect(roomRows(AAGJE)).toEqual([]);
  });

  it('shows them again once the Keeper turns the kamer’s dial open', () => {
    kamers.placeItem(openSlot(NPC_ROOM, 'plank').id, 'v-lantaarn', KEEPER);
    run(`UPDATE rooms SET view_mode = 'all' WHERE id = ?`, NPC_ROOM);
    expect(roomRows(AAGJE)).toEqual(['room.placed:v-lantaarn']);
  });

  it('keeps an open kamer in everybody’s feed, as before', () => {
    kamers.grant(ROOM, 1, 'sparen', KEEPER);
    kamers.buyFurnishing(openSlot(ROOM, 'bureau').id, 'h-stoel', BRAM);
    expect(roomRows(AAGJE)).toEqual(['room.bought:h-stoel']);
    expect(roomRows(BRAM)).toEqual(['room.bought:h-stoel']);
  });

  it('drops the row when the onderzoeker behind the kamer is hidden from the reader (canSeeRoom)', () => {
    kamers.placeItem(openSlot(ROOM, 'plank').id, 'v-lantaarn', KEEPER);
    run(`UPDATE entries SET visibility = 'keeper' WHERE id = 'e-bram'`);
    try {
      expect(roomRows(AAGJE)).toEqual([]);
      expect(roomRows(KEEPER)).toEqual(['room.placed:v-lantaarn']);
    } finally {
      run(`UPDATE entries SET visibility = 'all' WHERE id = 'e-bram'`);
    }
  });

  it('lets ordinary feed rows through untouched', () => {
    run(
      `INSERT INTO activity (id, actor_id, verb, entry_id, meta) VALUES ('a-1', 'bram', 'entry.edited', 'v-lantaarn', '{}')`,
    );
    expect(entries.recentActivity(AAGJE, 10).map((item) => item.verb)).toContain('entry.edited');
  });
});

/* ======================================================= 5 + 6, nagelopen */

describe('§101 (5, 6): al gedaan in ronde 54 — hier alleen nog eens gevraagd', () => {
  it('writes room.bought and room.opened with the kamer’s onderzoeker, and handOut per kamer', () => {
    kamers.grant(ROOM, 5, 'sparen', KEEPER);
    kamers.buyFurnishing(openSlot(ROOM, 'bureau').id, 'h-stoel', BRAM);
    kamers.unlockSlot(lockedSlot(ROOM).id, BRAM);
    kamers.handOut([{ roomId: ROOM, delta: 1 }], 'sessie', KEEPER);
    const rows = sqlite
      .prepare(`SELECT verb, character_id AS characterId FROM activity WHERE verb LIKE 'room.%' ORDER BY rowid`)
      .all() as { verb: string; characterId: string | null }[];
    for (const verb of ['room.bought', 'room.opened', 'room.granted']) {
      expect(rows.find((row) => row.verb === verb)?.characterId, verb).toBe('e-bram');
    }
  });
});

/* ======================================================= 8. de lade, gegeven */

describe('§101 (8): de Keeper legt iets rechtstreeks in een lade', () => {
  it('puts huisraad in the lade, moves room:{id}, and writes one feed row for the kamer', () => {
    const keys = heard(() => {
      expect(kamers.giveToDrawer(ROOM, 'h-stoel', KEEPER)).toEqual({ name: 'Leesstoel' });
    });
    expect(drawer(ROOM)).toEqual(['h-stoel']);
    expect(keys).toContain(`room:${ROOM}`);
    // Gratis: geen grootboekregel.
    expect(kamers.balanceOf(ROOM)).toBe(0);
    const row = sqlite
      .prepare(`SELECT verb, character_id AS characterId, meta FROM activity WHERE entry_id = 'h-stoel'`)
      .get() as { verb: string; characterId: string; meta: string };
    expect(row.verb).toBe('room.placed');
    expect(row.characterId).toBe('e-bram');
    expect(JSON.parse(row.meta)).toMatchObject({ roomId: ROOM, drawer: true });
    // Een open kamer: de tafel ziet het.
    expect(roomRows(AAGJE)).toEqual(['room.placed:h-stoel']);
  });

  it('and the owner can put it down from there, like anything bought', () => {
    kamers.giveToDrawer(ROOM, 'h-stoel', KEEPER);
    expect(kamers.placeCandidates(ROOM, 'plank', BRAM)[0]).toMatchObject({ id: 'h-stoel', inDrawer: 1 });
    kamers.placeItem(openSlot(ROOM, 'plank').id, 'h-stoel', BRAM);
    expect(drawer(ROOM)).toEqual([]);
  });

  it('refuses a speler — the button is courtesy, this is the lock', () => {
    expect(() => kamers.giveToDrawer(ROOM, 'h-stoel', BRAM)).toThrow(/Alleen de Keeper/);
    expect(drawer(ROOM)).toEqual([]);
  });

  it('refuses a voorwerp, a thing that fits nowhere, and a kamer that does not exist', () => {
    expect(() => kamers.giveToDrawer(ROOM, 'v-lantaarn', KEEPER)).toThrow(/Alleen huisraad/);
    expect(() => kamers.giveToDrawer(ROOM, 'h-zonder', KEEPER)).toThrow(/hoort nergens/);
    expect(() => kamers.giveToDrawer('geen-kamer', 'h-stoel', KEEPER)).toThrow(/bestaat niet/);
    expect(drawer(ROOM)).toEqual([]);
  });

  it('refuses a one-of-a-kind thing that is already somebody’s', () => {
    kamers.giveToDrawer(NPC_ROOM, 'u-bel', KEEPER);
    expect(() => kamers.giveToDrawer(ROOM, 'u-bel', KEEPER)).toThrow(/andere kamer/);
    expect(() => kamers.giveToDrawer(NPC_ROOM, 'u-bel', KEEPER)).toThrow(/lade van deze kamer/);
    // Een tweede leesstoel mag wel (§83).
    kamers.giveToDrawer(ROOM, 'h-stoel', KEEPER);
    kamers.giveToDrawer(ROOM, 'h-stoel', KEEPER);
    expect(drawer(ROOM)).toEqual(['h-stoel', 'h-stoel']);
  });

  it('keeps a gift to a closed kamer out of a speler’s feed (4 and 8 together)', () => {
    kamers.giveToDrawer(NPC_ROOM, 'h-stoel', KEEPER);
    expect(roomRows(BRAM)).toEqual([]);
    expect(roomRows(KEEPER)).toEqual(['room.placed:h-stoel']);
  });

  it('offers the soorten a Keeper keeps to himself, and nothing else', () => {
    const slugs = kamers.furnishingTypeSlugs();
    expect(slugs).toContain('huisraad');
    expect(slugs).toContain('uniek-huisraad');
    expect(slugs).not.toContain('item');
    expect(slugs).not.toContain('investigator');
  });
});

/* ================================================= 10. de terugvalzin */

describe('§101 (10): "Er is iets misgegaan." is een woord', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('is the Keeper’s sentence when the server gives none, and the default otherwise', async () => {
    const { kamerPost, kamerPostFor } = await import('@/components/kamer/post');
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nee', { status: 500 })));
    const words = { ...DEFAULT_WORDS, somethingWrong: 'Mis, helaas.' };
    expect(await kamerPost('/x', {}, words)).toBe('Mis, helaas.');
    expect(await kamerPost('/x')).toBe(DEFAULT_WORDS.somethingWrong);
    expect((await kamerPostFor('/x', {}, words)).error).toBe('Mis, helaas.');
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline'); }));
    expect(await kamerPost('/x', {}, words)).toBe('Mis, helaas.');
    expect(DEFAULT_WORDS.somethingWrong).toBe('Er is iets misgegaan.');
  });

  it('is nowhere hard-coded in the kamer’s client code any more', () => {
    const src = readFileSync(resolve('components/kamer/post.ts'), 'utf8');
    expect(src).not.toContain("'Er is iets misgegaan.'");
  });
});

/* ================================================= 17. een lege Tekst */

describe('§101 (17): isEmptyDoc — wat een lezer zou zien', () => {
  const doc = (...content: object[]) => ({ type: 'doc', content });
  const p = (...content: object[]) => ({ type: 'paragraph', content });

  it('calls blank paragraphs, headings and line breaks empty', () => {
    expect(isEmptyDoc(doc())).toBe(true);
    expect(isEmptyDoc(doc(p()))).toBe(true);
    expect(isEmptyDoc(doc(p({ type: 'text', text: '   ' }), p({ type: 'hardBreak' })))).toBe(true);
    expect(isEmptyDoc(doc({ type: 'heading', attrs: { level: 2 } }))).toBe(true);
    expect(isEmptyDoc(null)).toBe(true);
  });

  it('does not call a photograph, a rule or a chip empty — none of them is text', () => {
    expect(isEmptyDoc(doc({ type: 'image', attrs: { src: '/api/assets/a' } }))).toBe(false);
    expect(isEmptyDoc(doc({ type: 'horizontalRule' }))).toBe(false);
    expect(isEmptyDoc(doc(p({ type: 'entryLink', attrs: { id: 'x' } })))).toBe(false);
    expect(isEmptyDoc(doc(p({ type: 'text', text: 'Hallo' })))).toBe(false);
    expect(isEmptyDoc(doc({ type: 'bulletList', content: [] }))).toBe(false);
  });
});

/* ======================================== 12, 15, 20, 21: één bron, geen dood */

const sources = (root: string, out: string[] = []): string[] => {
  for (const name of readdirSync(root)) {
    const path = join(root, name);
    if (statSync(path).isDirectory()) sources(path, out);
    else if (/\.(ts|tsx|mjs|css)$/.test(name)) out.push(path);
  }
  return out;
};
const ALL = [...sources(resolve('lib')), ...sources(resolve('components')), ...sources(resolve('app'))];

describe('§101: één bron, geen dode regels', () => {
  it('(12) writes the karakter-soort’s slug once', () => {
    const hits = ALL.filter((path) => /CHARACTER_TYPE_SLUG\s*=\s*'/.test(readFileSync(path, 'utf8')));
    expect(hits.map((path) => path.replace(resolve('.'), ''))).toEqual(['/lib/newEntryType.ts']);
  });

  it('(15) has no .web-hint rule left in any stylesheet', () => {
    for (const path of ALL.filter((file) => file.endsWith('.css'))) {
      expect(readFileSync(path, 'utf8'), path).not.toMatch(/\.web-hint\b/);
    }
  });

  it('(13) no longer says "onderzoeker" in plain text in the karakter-wissel', () => {
    const src = readFileSync(resolve('components/you/CharacterSwitcher.tsx'), 'utf8');
    // In commentaar mag het woord staan; in JSX-tekst of een string niet.
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '');
    expect(code).not.toMatch(/onderzoeker/i);
  });

  it('(20) draws the search screen’s sentences from words, with the same defaults', () => {
    const src = readFileSync(resolve('components/SearchScreen.tsx'), 'utf8');
    for (const text of ['Zoeken in het archief', 'Zoek op naam, tag', 'Typ om te zoeken', 'Genoemd in de tekst']) {
      expect(src, text).not.toContain(text);
    }
    expect(DEFAULT_WORDS.searchLabel).toBe('Zoeken in het archief');
    expect(DEFAULT_WORDS.searchAll).toBe('Alles');
    expect(fill(DEFAULT_WORDS.searchCreate, { naam: 'Pier' })).toBe('‘Pier’ aanmaken');
    expect(DEFAULT_WORDS.searchHint).toContain('{toets}');
  });

  it('(19) keeps no note on /you in a title', () => {
    for (const file of ['app/(app)/you/ReadingFontForm.tsx', 'app/(app)/you/ColourSchemeForm.tsx']) {
      expect(readFileSync(resolve(file), 'utf8'), file).not.toMatch(/\stitle=/);
    }
    expect(fill(DEFAULT_WORDS.colourNotePlayer, { keeper: 'Keeper' })).toContain('Keeper kiest');
  });
});

describe('§101: het woordblok', () => {
  const group = WORD_GROUPS.find((item) => item.title === 'De losse eindjes');

  it('stands last, with every sentence inside WORD_MAX', () => {
    expect(group).toBeDefined();
    expect(WORD_GROUPS.at(-1)).toBe(group);
    for (const def of group!.words) expect(def.fallback.length, def.key).toBeLessThanOrEqual(WORD_MAX);
  });

  it('adds no key twice', () => {
    const keys = WORD_DEFS.map((def) => def.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('uses the two B25 words round 53 left ready', () => {
    expect(fill(DEFAULT_WORDS.fieldsEmptyCount, { n: '7' })).toBe('7 leeg');
    const src = readFileSync(resolve('components/entry/FieldsEditor.tsx'), 'utf8');
    expect(src).toContain('words.fieldsFillEmpty');
    expect(src).toContain('words.fieldsEmptyCount');
  });
});
