import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { handlesIn, tokenFor } from '@/lib/entries/shortTokens.mjs';

/**
 * §98, ronde 59 — een id in elk kort vak.
 *
 * Ronde 56 zette de korte beschrijving, de samenvatting en Tekst / Lange tekst
 * op handvatten. Deze ronde doet de rest op precies dezelfde weg: de speld, de
 * gebeurtenis, het losse kaartje van een stamboom, een kaartje op een prikbord,
 * de omschrijving van een
 * landkaart, tijdlijn en stamboom, en de inleiding van een overzicht. Wat hier
 * vastligt, per tabel:
 *
 *   1. schrijven → een handvat (`cleanShort` op elke weg in), en een handvat
 *      naar wat de schrijver niet mag zien gaat eruit;
 *   2. lezen per kijker: een speler krijgt voor een Keeper-chip niets;
 *   3. migratie `0036_elk_kort_vak` op echte SQLite, met de oudste naam, twee
 *      keer draaien verandert niets;
 *   4. `scripts/restore.mjs` zet een backup van vóór 0036 op dezelfde manier om;
 *   5. korte teksten tellen mee onder "Genoemd in" — ook die van ronde 56;
 *   6. een verborgen chip die een speler wegveegt, komt op zijn plek terug;
 *   7. het opruimen van `mention_handles`;
 *   8. `restoreCaseRevision` brengt de kamer van het dossier bij.
 */

const dir = mkdtempSync(join(tmpdir(), 'zcf-ronde-59-'));
process.env.DATA_DIR = dir;

const KEEPER = { id: 'k59', isKeeper: true };
const SPELER = { id: 's59', isKeeper: false };

type Deps = {
  sqlite: typeof import('@/lib/db').sqlite;
  upgrade: typeof import('@/lib/entries/shortUpgrade.mjs');
  refs: typeof import('@/lib/entries/shortRefs');
  maps: typeof import('@/lib/maps/service');
  timelines: typeof import('@/lib/timelines/service');
  families: typeof import('@/lib/families/service');
  overzichten: typeof import('@/lib/overzichten/service');
  cases: typeof import('@/lib/cases/service');
  mentions: typeof import('@/lib/entries/mentions');
  sweep: typeof import('@/lib/db/sweep');
  trash: typeof import('@/lib/admin/trash');
  boards: typeof import('@/lib/boards/service');
  MIGRATIONS: typeof import('@/lib/db/migrations.mjs').MIGRATIONS;
};
let deps: Deps;

const run = (sql: string, ...args: unknown[]) => deps.sqlite.prepare(sql).run(...args);
const one = <T>(sql: string, ...args: unknown[]) => deps.sqlite.prepare(sql).get(...args) as T;
const targetOf = (handle: string) =>
  one<{ entry_id: string } | undefined>('SELECT entry_id FROM mention_handles WHERE handle = ?', handle)?.entry_id;

function entry(id: string, name: string, createdAt: number, extra: { visibility?: string; type?: string; short?: string } = {}) {
  run(
    `INSERT INTO entries (id, type_id, name, slug, short_description, fields, tags, visibility, created_by, view_mode, created_at)
     VALUES (?, ?, ?, ?, ?, '{}', '[]', ?, 'k59', 'all', ?)`,
    id,
    extra.type ?? 'character',
    name,
    id,
    extra.short ?? '',
    extra.visibility ?? 'all',
    createdAt,
  );
}

let secret: string;
let jan: string;

beforeAll(async () => {
  const dbModule = await import('@/lib/db');
  deps = {
    sqlite: dbModule.sqlite,
    upgrade: await import('@/lib/entries/shortUpgrade.mjs'),
    refs: await import('@/lib/entries/shortRefs'),
    maps: await import('@/lib/maps/service'),
    timelines: await import('@/lib/timelines/service'),
    families: await import('@/lib/families/service'),
    overzichten: await import('@/lib/overzichten/service'),
    cases: await import('@/lib/cases/service'),
    mentions: await import('@/lib/entries/mentions'),
    sweep: await import('@/lib/db/sweep'),
    trash: await import('@/lib/admin/trash'),
    boards: await import('@/lib/boards/service'),
    MIGRATIONS: (await import('@/lib/db/migrations.mjs')).MIGRATIONS,
  };
  for (const [id, name, keeper] of [
    ['k59', 'Keeper', 1],
    ['s59', 'Speler', 0],
  ] as const) {
    run(`INSERT INTO users (id, username, username_lower, password_hash, is_keeper) VALUES (?, ?, ?, 'x', ?)`, id, name, name.toLowerCase(), keeper);
  }
  // Two artikelen called "Het Verdronken Kind": the persoon is the older one.
  entry('kind-persoon', 'Het Verdronken Kind', 1000);
  entry('kind-wezen', 'Het Verdronken Kind', 2000, { type: 'bovennatuurlijke-wezens' });
  entry('jan', 'Jan Vermeer', 1500);
  entry('geheim', 'Het Geheim', 1600, { visibility: 'keeper' });
  secret = deps.refs.mintHandle('geheim', KEEPER)!;
  jan = deps.refs.mintHandle('jan', KEEPER)!;
});

/* ------------------------------------------------------------ 1 + 2 */

describe('elke weg in schrijft een handvat, en een speler leest wat hij mag zien', () => {
  it('de speld: een gekozen chip blijft, een getypte [[Naam]] wordt er een, een verborgen van een speler gaat eruit', () => {
    const map = deps.maps.createMap({ name: 'Walcheren', assetId: 'a59', width: 100, height: 100, description: `Volgens ${tokenFor(jan)}` }, KEEPER);
    expect(one<{ description: string }>('SELECT description FROM maps WHERE id = ?', map.id).description).toBe(`Volgens ${tokenFor(jan)}`);

    const pin = deps.maps.addPin(map.id, { kind: 'note', name: 'Hier', text: 'Zag [[Jan Vermeer]] bij de sluis', x: 0.5, y: 0.5 }, KEEPER);
    const stored = one<{ text: string }>('SELECT text FROM map_pins WHERE id = ?', pin.id).text;
    expect(stored).not.toContain('[[');
    expect(targetOf(handlesIn(stored)[0])).toBe('jan');

    const theirs = deps.maps.addPin(map.id, { kind: 'note', name: 'Van mij', text: `Kent ${tokenFor(secret)}`, x: 0.4, y: 0.4 }, SPELER);
    expect(one<{ text: string }>('SELECT text FROM map_pins WHERE id = ?', theirs.id).text).toBe('Kent');
  });

  it('de speld via de kamer: wat het archief schoonmaakt, zet de kamer recht', () => {
    const map = deps.maps.listMaps(KEEPER)[0];
    const pin = deps.maps.addPin(map.id, { kind: 'note', name: 'Live', text: '', x: 0.2, y: 0.2 }, SPELER);
    run(`INSERT INTO live_docs (room, state) VALUES (?, x'00')`, `pin:${pin.id}:fields`);
    deps.maps.updatePin(pin.id, { text: 'Gewoon tekst ' }, SPELER, { live: true });
    expect(one<{ n: number }>('SELECT count(*) AS n FROM live_docs WHERE room = ?', `pin:${pin.id}:fields`).n).toBe(1);
    deps.maps.updatePin(pin.id, { text: `Nu met ${tokenFor(secret)}` }, SPELER, { live: true });
    expect(one<{ text: string }>('SELECT text FROM map_pins WHERE id = ?', pin.id).text).toBe('Nu met');
    // `resetFieldsInRoom` on a room nobody has open forgets its stored state.
    expect(one<{ n: number }>('SELECT count(*) AS n FROM live_docs WHERE room = ?', `pin:${pin.id}:fields`).n).toBe(0);
  });

  it('de gebeurtenis en de omschrijving van een tijdlijn', () => {
    const timeline = deps.timelines.createTimeline({ name: 'Het jaar 1934', description: 'Over [[Het Verdronken Kind]]' }, KEEPER);
    const description = one<{ description: string }>('SELECT description FROM timelines WHERE id = ?', timeline.id).description;
    // Typed out in full: the oldest of the two, as the reader always read it.
    expect(targetOf(handlesIn(description)[0])).toBe('kind-persoon');
    const event = deps.timelines.addEvent(timeline.id, { kind: 'note', name: 'Storm', text: `Met ${tokenFor(jan)}\nen meer`, at: 0 }, KEEPER);
    expect(one<{ text: string }>('SELECT text FROM timeline_events WHERE id = ?', event.id).text).toBe(`Met ${tokenFor(jan)}\nen meer`);
    deps.timelines.updateEvent(event.id, { text: `Nu ${tokenFor('bestaatniet1')}` }, KEEPER);
    expect(one<{ text: string }>('SELECT text FROM timeline_events WHERE id = ?', event.id).text).toBe('Nu');
    deps.timelines.updateTimeline(timeline.id, { description: `Weer ${tokenFor(jan)}` }, KEEPER);
    expect(one<{ description: string }>('SELECT description FROM timelines WHERE id = ?', timeline.id).description).toBe(`Weer ${tokenFor(jan)}`);
  });

  it('het losse kaartje en de omschrijving van een stamboom', () => {
    const tree = deps.families.createFamilyTree({ name: 'Den Hollander', description: `Het huis van ${tokenFor(jan)}` }, KEEPER);
    deps.families.saveFamilyTreeState(
      tree.id,
      { loose: [{ id: 'los59', name: 'Onbekende vader', text: 'Zag [[Jan Vermeer]] ⟦ en meer', frame: 'unknown', updatedAt: Date.now() }] },
      KEEPER,
    );
    const state = JSON.parse(one<{ state: string }>('SELECT state FROM family_trees WHERE id = ?', tree.id).state);
    const text = state.loose.find((card: { id: string }) => card.id === 'los59').text as string;
    expect(text).not.toContain('[[');
    expect(text).not.toMatch(/⟦ /);
    expect(targetOf(handlesIn(text)[0])).toBe('jan');
  });

  it('de inleiding van een overzicht', () => {
    const overzicht = deps.overzichten.createOverzicht({ name: 'Waar begin je' }, KEEPER);
    deps.overzichten.updateOverzicht(overzicht.id, { lead: `Lees eerst ${tokenFor(jan)}.\nDaarna de rest.` }, KEEPER);
    expect(one<{ lead: string }>('SELECT lead FROM overzichten WHERE id = ?', overzicht.id).lead).toBe(`Lees eerst ${tokenFor(jan)}.\nDaarna de rest.`);
    deps.overzichten.updateOverzicht(overzicht.id, { lead: `En ${tokenFor(secret)}` }, SPELER);
    expect(one<{ lead: string }>('SELECT lead FROM overzichten WHERE id = ?', overzicht.id).lead).toBe('En ');
  });

  it('een kaartje op een prikbord: de tekst wordt schoongemaakt tegen wat er stond', () => {
    const board = deps.boards.createBoard({ name: 'Muur 59', createdBy: 'k59' });
    const card = (text: string) => ({
      id: 'kaart59', kind: 'note' as const, entryId: null, mapId: null, caseId: null, timelineId: null, boardId: null,
      familyTreeId: null, assetId: null, showImage: false, border: null, name: 'Vraag', text, x: 10, y: 10, rotation: 0, scale: 1,
      updatedAt: Date.now(),
    });
    deps.boards.saveBoard(board.id, { cards: [card(`Nagaan bij ${tokenFor(secret)} en [[Jan Vermeer]]`)] } as never, KEEPER);
    const state = () => JSON.parse(one<{ state: string }>('SELECT state FROM boards WHERE id = ?', board.id).state);
    const kept = state().cards[0].text as string;
    expect(handlesIn(kept).map(targetOf)).toEqual(['geheim', 'jan']);
    // A speler rewrites the card: the chip they cannot see comes back where it stood.
    const without = kept.replace(tokenFor(handlesIn(kept)[0]), '');
    deps.boards.saveBoard(board.id, { cards: [{ ...card(without), updatedAt: Date.now() + 1000 }] } as never, SPELER);
    expect(state().cards[0].text).toBe(kept);
    deps.mentions.recomputeBoardMentions(board.id);
    expect(deps.mentions.listMentions('jan', KEEPER).some((m) => m.kind === 'board' && m.detail === 'Vraag')).toBe(true);
  });

  it('een speler krijgt voor een Keeper-chip niets: geen naam, geen slug, geen id', () => {
    const text = `Over ${tokenFor(secret)} en ${tokenFor(jan)}`;
    const forSpeler = deps.refs.shortChipsFor(SPELER, [text]);
    expect(forSpeler[secret]).toBeNull();
    expect(forSpeler[jan]?.name).toBe('Jan Vermeer');
    expect(JSON.stringify(forSpeler)).not.toContain('Geheim');
    expect(JSON.stringify(forSpeler)).not.toContain('geheim');
    expect(deps.refs.shortChipsFor(KEEPER, [text])[secret]?.name).toBe('Het Geheim');
    expect(deps.refs.plainShort(SPELER, text)).toBe('Over en Jan Vermeer');
  });
});

/* ------------------------------------------------------------ 3. migration */

describe('0036_elk_kort_vak', () => {
  it('is appended after 0034, with its step in JavaScript', () => {
    const names = (deps.MIGRATIONS as { name: string }[]).map((m) => m.name);
    expect(names.indexOf('0036_elk_kort_vak')).toBeGreaterThan(names.indexOf('0034_een_id'));
    const migration = (deps.MIGRATIONS as { name: string; run?: unknown }[]).find((m) => m.name === '0036_elk_kort_vak')!;
    expect(typeof migration.run).toBe('function');
    expect(one<{ n: number }>("SELECT count(*) AS n FROM schema_migrations WHERE name = '0036_elk_kort_vak'").n).toBe(1);
  });

  it('turns every [[Naam]] and @Naam in every column of this round into a handle, the oldest of two, and runs twice as once', () => {
    run(`INSERT INTO maps (id, name, slug, asset_id, width, height, description) VALUES ('m-oud', 'Oud', 'm-oud', 'a', 1, 1, 'Van [[Het Verdronken Kind]]')`);
    run(`INSERT INTO map_pins (id, map_id, kind, name, text, x, y) VALUES ('p-oud', 'm-oud', 'note', 'P', 'Bij @Jan Vermeer. En [[Niemand]].', 0, 0)`);
    run(`INSERT INTO timelines (id, name, slug, description) VALUES ('t-oud', 'T', 't-oud', 'Met @Jan Vermeer')`);
    run(`INSERT INTO timeline_events (id, timeline_id, kind, name, text, at) VALUES ('e-oud', 't-oud', 'note', 'E', 'Zag [[Jan Vermeer]]', 0)`);
    run(
      `INSERT INTO family_trees (id, name, slug, description, state) VALUES ('f-oud', 'F', 'f-oud', '[[Het Geheim]]', ?)`,
      JSON.stringify({ v: 1, members: [], loose: [{ id: 'l', name: 'L', text: 'Van [[Jan Vermeer]]', frame: 'unknown', updatedAt: 1 }], ties: [], deleted: { members: {}, loose: {}, ties: {} } }),
    );
    run(`INSERT INTO overzichten (id, name, slug, lead) VALUES ('o-oud', 'O', 'o-oud', 'Begin bij [[Jan Vermeer]]')`);
    const wall = JSON.stringify({ cards: [{ id: 'c', kind: 'note', name: 'N', text: 'Zie @Jan Vermeer' }], strings: [] });
    run(`INSERT INTO boards (id, name, state) VALUES ('b-oud', 'B', ?)`, wall);
    run(`INSERT INTO board_revisions (id, board_id, snapshot) VALUES ('br-oud', 'b-oud', ?)`, wall);
    run(`INSERT INTO live_docs (room, state) VALUES ('pin:p-oud:fields', x'00'), ('event:e-oud:fields', x'00'), ('map:m-oud:fields', x'00'), ('entry:jan:body', x'00')`);
    run(`INSERT INTO entry_mentions (to_entry_id, from_kind, from_id, detail) VALUES ('jan', 'map', 'm-oud', 'P')`);

    const result = deps.upgrade.upgradeCanvasTexts(deps.sqlite);
    expect(result.texts).toBe(9);

    const mapDesc = one<{ description: string }>(`SELECT description FROM maps WHERE id = 'm-oud'`).description;
    expect(targetOf(handlesIn(mapDesc)[0])).toBe('kind-persoon');
    const pin = one<{ text: string }>(`SELECT text FROM map_pins WHERE id = 'p-oud'`).text;
    expect(handlesIn(pin).map(targetOf)).toEqual(['jan']);
    expect(pin).toContain('[[Niemand]]'); // found nothing: stays letter for letter
    expect(pin).toMatch(/^Bij ⟦[A-Za-z0-9]+⟧\. En \[\[Niemand\]\]\.$/);
    expect(targetOf(handlesIn(one<{ description: string }>(`SELECT description FROM timelines WHERE id = 't-oud'`).description)[0])).toBe('jan');
    expect(targetOf(handlesIn(one<{ text: string }>(`SELECT text FROM timeline_events WHERE id = 'e-oud'`).text)[0])).toBe('jan');
    const tree = one<{ description: string; state: string }>(`SELECT description, state FROM family_trees WHERE id = 'f-oud'`);
    expect(targetOf(handlesIn(tree.description)[0])).toBe('geheim');
    expect(targetOf(handlesIn(JSON.parse(tree.state).loose[0].text)[0])).toBe('jan');
    expect(targetOf(handlesIn(one<{ lead: string }>(`SELECT lead FROM overzichten WHERE id = 'o-oud'`).lead)[0])).toBe('jan');
    const wallNow = JSON.parse(one<{ state: string }>(`SELECT state FROM boards WHERE id = 'b-oud'`).state);
    expect(wallNow.cards[0].text).toMatch(/^Zie ⟦[A-Za-z0-9]+⟧$/);
    const copy = JSON.parse(one<{ snapshot: string }>(`SELECT snapshot FROM board_revisions WHERE id = 'br-oud'`).snapshot);
    expect(targetOf(handlesIn(copy.cards[0].text)[0])).toBe('jan');

    // The rooms of this round seed again; the lopende tekst is not touched.
    const rooms = (deps.sqlite.prepare('SELECT room FROM live_docs').all() as { room: string }[]).map((row) => row.room);
    expect(rooms).toContain('entry:jan:body');
    expect(rooms.filter((room) => /^(pin|event|map):/.test(room))).toEqual([]);
    // `entry_mentions` is derived, and the start-up backfill builds it again.
    expect(one<{ n: number }>('SELECT count(*) AS n FROM entry_mentions').n).toBe(0);

    const before = one<{ n: number }>('SELECT count(*) AS n FROM mention_handles').n;
    expect(deps.upgrade.upgradeCanvasTexts(deps.sqlite)).toEqual({ texts: 0, handles: 0 });
    expect(one<{ n: number }>('SELECT count(*) AS n FROM mention_handles').n).toBe(before);
    expect(one<{ text: string }>(`SELECT text FROM map_pins WHERE id = 'p-oud'`).text).toBe(pin);
  });
});

/* ------------------------------------------------------------ 4. restore */

describe('scripts/restore.mjs', () => {
  it('opens a backup from before 0036 and converts it the same way', async () => {
    const source = mkdtempSync(join(tmpdir(), 'zcf-ronde-59-src-'));
    const target = mkdtempSync(join(tmpdir(), 'zcf-ronde-59-dst-'));
    const { default: Database } = await import('better-sqlite3');
    const { MIGRATIONS } = await import('@/lib/db/migrations.mjs');
    const { buildArchive } = await import('@/lib/archive.mjs');
    // A backup as an archive between 0034 and 0036 would make it.
    const old = new Database(join(source, 'app.db'));
    old.exec('CREATE TABLE schema_migrations (name TEXT PRIMARY KEY, applied_at INTEGER NOT NULL DEFAULT (unixepoch()))');
    for (const migration of MIGRATIONS as { name: string; sql?: string; run?: (db: unknown) => void }[]) {
      if (migration.name === '0036_elk_kort_vak') continue;
      if (migration.sql) old.exec(migration.sql);
      if (migration.run) migration.run(old);
      old.prepare('INSERT INTO schema_migrations (name) VALUES (?)').run(migration.name);
    }
    const { seedBaseline } = await import('@/lib/db/seed.mjs');
    seedBaseline(old);
    old.exec(`INSERT INTO entries (id, type_id, name, slug, created_at) VALUES ('jan', 'character', 'Jan Vermeer', 'jan', 1)`);
    old.exec(`INSERT INTO maps (id, name, slug, asset_id, width, height) VALUES ('m', 'M', 'm', 'a', 1, 1)`);
    old.exec(`INSERT INTO map_pins (id, map_id, kind, name, text, x, y) VALUES ('p', 'm', 'note', 'P', 'Bij [[Jan Vermeer]]', 0, 0)`);
    const zip = join(source, 'backup.zip');
    writeFileSync(zip, buildArchive(old, join(source, 'assets')).zip);
    old.close();

    const result = spawnSync(process.execPath, ['scripts/restore.mjs', zip], {
      input: 'restore\n',
      env: { ...process.env, DATA_DIR: target },
      encoding: 'utf8',
    });
    expect(result.status, result.stderr).toBe(0);
    const restored = new Database(join(target, 'app.db'), { readonly: true });
    const text = (restored.prepare(`SELECT text FROM map_pins WHERE id = 'p'`).get() as { text: string }).text;
    const handle = handlesIn(text)[0];
    expect(text).toBe(`Bij ${tokenFor(handle)}`);
    expect((restored.prepare('SELECT entry_id FROM mention_handles WHERE handle = ?').get(handle) as { entry_id: string }).entry_id).toBe('jan');
    restored.close();
  }, 60_000);
});

/* ------------------------------------------------------------ 5. Genoemd in */

describe('korte teksten tellen mee onder "Genoemd in"', () => {
  it('een korte beschrijving, een infobox Tekst, een samenvatting, een speld, een omschrijving, een los kaartje', () => {
    entry('bron59', 'Bron', 5000, { short: `Kent ${tokenFor(jan)}` });
    deps.mentions.recomputeFieldMentions('bron59');
    const dossier = deps.cases.createCase({ name: 'Het dossier van 59', summary: `Over ${tokenFor(jan)}`, createdBy: 'k59', actorIsKeeper: true });
    deps.mentions.rebuildAllMentions();

    const kinds = deps.mentions.listMentions('jan', KEEPER).map((mention) => `${mention.kind}:${mention.detail}`);
    expect(kinds).toContain('field:');
    expect(kinds).toContain('case:');
    expect(kinds).toContain('map:Hier'); // the speld of the first test, typed as [[Jan Vermeer]]
    expect(kinds).toContain('map:'); // the landkaart's own omschrijving
    expect(kinds).toContain('timeline:'); // the tijdlijn's omschrijving
    expect(kinds).toContain('family_tree:Onbekende vader'); // the los kaartje
    expect(kinds).toContain('family_tree:'); // the stamboom's omschrijving
    // An overzicht names outward only (§75): never under "Genoemd in".
    expect(kinds.some((kind) => kind.startsWith('overzicht'))).toBe(false);
    expect(deps.mentions.listMentions('jan', KEEPER).find((mention) => mention.kind === 'case')?.id).toBe(dossier.id);
  });

  it('a Keeper-only source says nothing to a speler', () => {
    entry('keeperbron', 'Keeperbron', 5100, { visibility: 'keeper', short: `Over ${tokenFor(jan)}` });
    deps.mentions.recomputeFieldMentions('keeperbron');
    const forSpeler = deps.mentions.listMentions('jan', SPELER).map((mention) => mention.id);
    expect(forSpeler).not.toContain('keeperbron');
    expect(deps.mentions.listMentions('jan', KEEPER).map((mention) => mention.id)).toContain('keeperbron');
  });
});

/* ------------------------------------------------------------ 6. §67 op zijn plek */

describe('een verborgen chip die een speler wegveegt, komt op zijn plek terug', () => {
  it('where it stood, not at the end', () => {
    const prev = `A ${tokenFor(secret)} B en de rest`;
    // The speler's editor shows the chip as nothing, and Backspace took it.
    expect(deps.refs.cleanShort('A  B en de rest', { prev, actor: SPELER })).toBe(prev);
    // Typed over it: it comes back beside what was typed there.
    expect(deps.refs.cleanShort('A X B en de rest', { prev, actor: SPELER })).toBe(`A X ${tokenFor(secret)} B en de rest`);
    // The whole text replaced: there is no place left, so at the end (§67 as before).
    expect(deps.refs.cleanShort('Nieuw', { prev: `Oud ${tokenFor(secret)} oud`, actor: SPELER })).toBe(`Nieuw ${tokenFor(secret)}`);
    // The Keeper sees it, so the Keeper may take it out.
    expect(deps.refs.cleanShort('A  B en de rest', { prev, actor: KEEPER })).toBe('A  B en de rest');
  });
});

/* ------------------------------------------------------------ 7. opruimen */

describe('sweepMentionHandles', () => {
  it('removes an old handle nothing uses, keeps one that is used and one that is young', () => {
    const now = Date.now();
    const old = Math.floor((now - deps.sweep.HANDLE_TTL_MS) / 1000) - 60;
    run(`INSERT INTO mention_handles (handle, entry_id, created_at) VALUES ('oudongebruikt1', 'jan', ?)`, old);
    run(`INSERT INTO mention_handles (handle, entry_id, created_at) VALUES ('oudgebruikt22', 'jan', ?)`, old);
    run(`INSERT INTO mention_handles (handle, entry_id, created_at) VALUES ('jongongebruikt', 'jan', ?)`, Math.floor(now / 1000));
    run(`INSERT INTO mention_handles (handle, entry_id, created_at) VALUES ('inkamerstaat9', 'jan', ?)`, old);
    run(`UPDATE overzichten SET lead = ? WHERE id = 'o-oud'`, `Lees ${tokenFor('oudgebruikt22')}`);
    // A chip still in a stored room (bytes of a Yjs update) counts as used.
    run(`INSERT INTO live_docs (room, state) VALUES ('case:x:fields', ?)`, Buffer.from(`\u0001\u000e⟦inkamerstaat9⟧`, 'utf8'));
    const gone = deps.sweep.sweepMentionHandles(now);
    expect(gone).toBeGreaterThanOrEqual(1);
    const left = new Set((deps.sqlite.prepare('SELECT handle FROM mention_handles').all() as { handle: string }[]).map((row) => row.handle));
    expect(left.has('oudongebruikt1')).toBe(false);
    expect(left.has('oudgebruikt22')).toBe(true);
    expect(left.has('jongongebruikt')).toBe(true);
    expect(left.has('inkamerstaat9')).toBe(true);
    // Every handle the texts of this file wrote is still there.
    expect(left.has(jan)).toBe(true);
    expect(left.has(secret)).toBe(true);
  });
});

/* ------------------------------------------------------------ 8. dossier */

describe('restoreCaseRevision', () => {
  it('brings the room of the dossier in line and counts the restored samenvatting', () => {
    const dossier = deps.cases.createCase({ name: 'Terug', summary: 'Later', createdBy: 'k59', actorIsKeeper: true });
    // An older version, as the history keeps it.
    const revision = 'crev59';
    run(`INSERT INTO case_revisions (id, case_id, snapshot) VALUES (?, ?, ?)`, revision, dossier.id, JSON.stringify({ name: 'Terug', summary: `Eerst ${tokenFor(jan)}`, notes: null, status: 'open' }));
    run(`INSERT INTO live_docs (room, state) VALUES (?, x'00')`, `case:${dossier.id}:fields`);
    deps.trash.restoreCaseRevision(revision, 'k59');
    expect(one<{ summary: string }>('SELECT summary FROM cases WHERE id = ?', dossier.id).summary).toBe(`Eerst ${tokenFor(jan)}`);
    expect(one<{ n: number }>('SELECT count(*) AS n FROM live_docs WHERE room = ?', `case:${dossier.id}:fields`).n).toBe(0);
    expect(deps.mentions.listMentions('jan', KEEPER).some((mention) => mention.kind === 'case' && mention.id === dossier.id)).toBe(true);
  });
});
