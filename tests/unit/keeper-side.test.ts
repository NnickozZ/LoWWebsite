import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';

/**
 * §44: de Keeperkant — the rules that must hold in SQL, not in a component.
 *
 * Five kinds now have a Keeper side, tied to their player-facing face, sharing
 * one set of notes. Three of those sentences are the kind that quietly stop
 * being true, so they are pinned here against a real SQLite file:
 *
 *   - a keeper-only record of *any* of the five kinds is invisible to a
 *     player through `keeperRef`, which is the only road anything in the
 *     Keeperkant is read by. Two spellings, one rule: an artikel is the
 *     Keeper's when `visibility = 'keeper'` (§9), the other four when
 *     `keeper_only = 1` (0021);
 *   - a tie is not a permission. `tiesFor` drops any end the viewer may not
 *     see, so a rope can never be the thing that names a hidden page;
 *   - a twin is one thing with two faces and *one* text. Typing on either
 *     page must reach the same row, and `notesTarget` must say so from both
 *     directions — that is what the room key is resolved with, so if it were
 *     wrong the pair would quietly get two notes instead of one.
 */

const dir = mkdtempSync(join(tmpdir(), 'zcf-keeper-'));
process.env.DATA_DIR = dir;

type Deps = {
  sqlite: typeof import('@/lib/db').sqlite;
  keeperRef: typeof import('@/lib/keeper/side').keeperRef;
  isKeeperSide: typeof import('@/lib/keeper/side').isKeeperSide;
  setKeeperSide: typeof import('@/lib/keeper/side').setKeeperSide;
  tiesFor: typeof import('@/lib/keeper/ties').tiesFor;
  addTie: typeof import('@/lib/keeper/ties').addTie;
  createTwin: typeof import('@/lib/keeper/ties').createTwin;
  twinOf: typeof import('@/lib/keeper/ties').twinOf;
  notesTarget: typeof import('@/lib/keeper/notes').notesTarget;
  readKeeperNotes: typeof import('@/lib/keeper/notes').readKeeperNotes;
  writeKeeperNotes: typeof import('@/lib/keeper/notes').writeKeeperNotes;
};
let deps: Deps;

const KEEPER = { id: 'keeper-1', isKeeper: true };
const BRAM = { id: 'bram', isKeeper: false };

beforeAll(async () => {
  const dbModule = await import('@/lib/db');
  const side = await import('@/lib/keeper/side');
  const ties = await import('@/lib/keeper/ties');
  const notes = await import('@/lib/keeper/notes');
  deps = {
    sqlite: dbModule.sqlite,
    keeperRef: side.keeperRef,
    isKeeperSide: side.isKeeperSide,
    setKeeperSide: side.setKeeperSide,
    tiesFor: ties.tiesFor,
    addTie: ties.addTie,
    createTwin: ties.createTwin,
    twinOf: ties.twinOf,
    notesTarget: notes.notesTarget,
    readKeeperNotes: notes.readKeeperNotes,
    writeKeeperNotes: notes.writeKeeperNotes,
  };
  const { sqlite } = deps;
  const run = (sql: string, ...args: unknown[]) => sqlite.prepare(sql).run(...args);

  for (const [id, name, keeper] of [
    ['keeper-1', 'Keeper', 1],
    ['bram', 'Bram', 0],
  ] as const) {
    run(
      `INSERT INTO users (id, username, username_lower, password_hash, password_enc, is_keeper) VALUES (?, ?, ?, 'x', 'x', ?)`,
      id,
      name,
      name.toLowerCase(),
      keeper,
    );
  }

  const entry = (id: string, name: string, visibility = 'all') =>
    run(
      `INSERT INTO entries (id, type_id, name, slug, fields, tags, visibility, created_by, view_mode)
       VALUES (?, 'character', ?, ?, '{}', '[]', ?, 'keeper-1', 'all')`,
      id,
      name,
      id,
      visibility,
    );
  entry('e-open', 'De vuurtoren');
  entry('e-dicht', 'Wat er werkelijk gebeurde', 'keeper');

  // The other four kinds, twice each: one the table may see, one the Keeper's.
  const kase = (id: string, name: string, keeperOnly = 0) =>
    run(
      `INSERT INTO cases (id, name, slug, created_by, keeper_only) VALUES (?, ?, ?, 'keeper-1', ?)`,
      id,
      name,
      id,
      keeperOnly,
    );
  kase('c-open', 'De verdwijning');
  kase('c-dicht', 'De verdwijning — Keeper', 1);

  const board = (id: string, name: string, keeperOnly = 0) =>
    run(
      `INSERT INTO boards (id, name, state, created_by, keeper_only) VALUES (?, ?, '{"cards":[],"strings":[]}', 'keeper-1', ?)`,
      id,
      name,
      keeperOnly,
    );
  board('b-open', 'De muur');
  board('b-dicht', 'De muur — Keeper', 1);

  const map = (id: string, name: string, keeperOnly = 0) =>
    run(
      `INSERT INTO maps (id, name, slug, asset_id, width, height, sort_order, created_by, view_mode, keeper_only)
       VALUES (?, ?, ?, 'a1', 10, 10, 0, 'keeper-1', 'all', ?)`,
      id,
      name,
      id,
      keeperOnly,
    );
  map('m-open', 'Het eiland');
  map('m-dicht', 'Het eiland — Keeper', 1);

  const timeline = (id: string, name: string, keeperOnly = 0) =>
    run(
      `INSERT INTO timelines (id, name, slug, created_by, view_mode, keeper_only)
       VALUES (?, ?, ?, 'keeper-1', 'all', ?)`,
      id,
      name,
      id,
      keeperOnly,
    );
  timeline('t-open', 'De nacht zelf');
  timeline('t-dicht', 'De nacht zelf — Keeper', 1);
});

const KEEPER_ONLY: [string, string][] = [
  ['entry', 'e-dicht'],
  ['case', 'c-dicht'],
  ['board', 'b-dicht'],
  ['map', 'm-dicht'],
  ['timeline', 't-dicht'],
];
const OPEN: [string, string][] = [
  ['entry', 'e-open'],
  ['case', 'c-open'],
  ['board', 'b-open'],
  ['map', 'm-open'],
  ['timeline', 't-open'],
];

describe('keeperRef is the one read, and it is the visibility rule', () => {
  it.each(KEEPER_ONLY)('a player cannot see the Keeper’s %s', (kind, id) => {
    expect(deps.keeperRef(kind as never, id, BRAM)).toBeNull();
    const mine = deps.keeperRef(kind as never, id, KEEPER);
    expect(mine?.keeperOnly).toBe(true);
  });

  it.each(OPEN)('both of them see a player-facing %s', (kind, id) => {
    expect(deps.keeperRef(kind as never, id, BRAM)?.id).toBe(id);
    expect(deps.keeperRef(kind as never, id, KEEPER)?.keeperOnly).toBe(false);
  });

  it('a ref carries the address its kind lives at', () => {
    expect(deps.keeperRef('board', 'b-open', KEEPER)?.href).toBe('/b/b-open');
    expect(deps.keeperRef('map', 'm-open', KEEPER)?.href).toBe('/maps/m-open');
  });

  it('isKeeperSide reads both spellings of the same idea', () => {
    expect(deps.isKeeperSide('entry', 'e-dicht')).toBe(true);
    expect(deps.isKeeperSide('entry', 'e-open')).toBe(false);
    expect(deps.isKeeperSide('timeline', 't-dicht')).toBe(true);
  });

  it('setKeeperSide moves a thing across and back', () => {
    deps.setKeeperSide('board', 'b-open', true, KEEPER.id);
    expect(deps.keeperRef('board', 'b-open', BRAM)).toBeNull();
    deps.setKeeperSide('board', 'b-open', false, KEEPER.id);
    expect(deps.keeperRef('board', 'b-open', BRAM)?.id).toBe('b-open');
  });
});

describe('a tie is not a permission', () => {
  beforeAll(() => {
    // The Keeper's dossier, roped to a landkaart everybody sees and to an
    // artikel only the Keeper does.
    deps.addTie({ kind: 'case', id: 'c-dicht' }, { kind: 'map', id: 'm-open' }, KEEPER.id);
    deps.addTie({ kind: 'case', id: 'c-dicht' }, { kind: 'entry', id: 'e-dicht' }, KEEPER.id);
  });

  it('the Keeper sees both ends', () => {
    const ties = deps.tiesFor('case', 'c-dicht', KEEPER);
    expect(ties.ropes.map((tie) => tie.other.id).sort()).toEqual(['e-dicht', 'm-open']);
    expect(ties.twin).toBeNull();
  });

  it('the end a viewer may not see is not in the list', () => {
    // Read from the open landkaart, which a player may stand on: the rope goes
    // to the Keeper's dossier, and that end simply is not a road for them.
    const asPlayer = deps.tiesFor('map', 'm-open', BRAM);
    expect(asPlayer.ropes).toEqual([]);
    const asKeeper = deps.tiesFor('map', 'm-open', KEEPER);
    expect(asKeeper.ropes.map((tie) => tie.other.id)).toEqual(['c-dicht']);
  });

  it('a rope must have a Keeper page at one end', () => {
    expect(() =>
      deps.addTie({ kind: 'map', id: 'm-open' }, { kind: 'case', id: 'c-open' }, KEEPER.id),
    ).toThrow();
  });

  it('nothing is tied to itself', () => {
    expect(() =>
      deps.addTie({ kind: 'case', id: 'c-dicht' }, { kind: 'case', id: 'c-dicht' }, KEEPER.id),
    ).toThrow();
  });
});

describe('a twin is one thing with two faces', () => {
  let twinId = '';

  it('createTwin makes the Keeper’s face and ties it on', () => {
    const made = deps.createTwin('case', 'c-open', KEEPER);
    twinId = made.id;
    expect(made.keeperOnly).toBe(true);
    expect(made.name).toBe('De verdwijning');
    expect(deps.twinOf('case', 'c-open', KEEPER)?.id).toBe(twinId);
    expect(deps.twinOf('case', twinId, KEEPER)?.id).toBe('c-open');
    // The new face is the Keeper's, so a player is not told it exists.
    expect(deps.keeperRef('case', twinId, BRAM)).toBeNull();
  });

  it('refuses a second one', () => {
    expect(() => deps.createTwin('case', 'c-open', KEEPER)).toThrow();
  });

  it('refuses to make the Keeper’s side of the Keeper’s side', () => {
    expect(() => deps.createTwin('case', twinId, KEEPER)).toThrow();
  });

  it('notesTarget resolves both directions to the Keeper’s face', () => {
    expect(deps.notesTarget('case', 'c-open')).toEqual({ kind: 'case', id: twinId });
    expect(deps.notesTarget('case', twinId)).toEqual({ kind: 'case', id: twinId });
    // Something with no twin keeps its own notes.
    expect(deps.notesTarget('map', 'm-open')).toEqual({ kind: 'map', id: 'm-open' });
  });

  it('what is written on one face is read from the other', () => {
    deps.writeKeeperNotes('case', 'c-open', 'De dader is de veerman.', KEEPER);
    expect(deps.readKeeperNotes('case', twinId, KEEPER)).toBe('De dader is de veerman.');
    deps.writeKeeperNotes('case', twinId, 'Nee: de veerman dekt iemand.', KEEPER);
    expect(deps.readKeeperNotes('case', 'c-open', KEEPER)).toBe('Nee: de veerman dekt iemand.');
  });

  it('and never by anybody but a Keeper', () => {
    expect(deps.readKeeperNotes('case', 'c-open', BRAM)).toBe('');
    expect(() => deps.writeKeeperNotes('case', 'c-open', 'ik ook', BRAM)).toThrow();
  });
});
