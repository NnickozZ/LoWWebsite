import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';

/**
 * §50: de twee kanten, dicht.
 *
 * §44 gave the archive a Keeper side and §46 made every *list* read from one
 * side at a time — but the two halves still touched everywhere it mattered.
 * The autocomplete under every text box offered the Keeper's own artikelen to a
 * Keeper standing on the players' side; every picker asked for `bothSides`; and
 * a record page that disagreed with the browser corrected the cookie
 * *afterwards*, in the browser, which left the shell and the page on different
 * sides for a frame and every picker on screen built for the side the person
 * had just left. That is the "gekke UI bugs" this round is about.
 *
 * Three things are pinned here:
 *
 *   1. **the wissel** — `sideDetour` sends a Keeper whose cookie disagrees with
 *      the record they opened through `/api/keeper/flip` before anything
 *      renders, in *both* directions, and cannot loop;
 *   2. **the offer** — `suggestEntries` is sided by default, with exactly one
 *      escape hatch for the touwtje picker;
 *   3. **the write** — `sameSide` refuses a reference across the border, and
 *      the §44 bridge (touwtjes and tweelingen) never comes through it.
 */

const dir = mkdtempSync(join(tmpdir(), 'zcf-two-sides-'));
process.env.DATA_DIR = dir;

type Deps = {
  sqlite: typeof import('@/lib/db').sqlite;
  sideDetour: typeof import('@/lib/keeper/side').sideDetour;
  sameSide: typeof import('@/lib/keeper/side').sameSide;
  queryTail: typeof import('@/lib/keeper/side').queryTail;
  OTHER_SIDE: typeof import('@/lib/keeper/side').OTHER_SIDE;
  suggestEntries: typeof import('@/lib/search/service').suggestEntries;
  addTie: typeof import('@/lib/keeper/ties').addTie;
  tiesFor: typeof import('@/lib/keeper/ties').tiesFor;
};
let deps: Deps;

/** The same Keeper, standing on either side. */
const OP_KEEPERKANT = { id: 'keeper-1', isKeeper: true, side: 'keeper' } as const;
const OP_SPELERSKANT = { id: 'keeper-1', isKeeper: true, side: 'player' } as const;
/** A player. Their side is forced to 'player' long before this is asked. */
const BRAM = { id: 'bram', isKeeper: false, side: 'player' } as const;

const names = (rows: { name: string }[]) => rows.map((row) => row.name).sort();

beforeAll(async () => {
  const dbModule = await import('@/lib/db');
  const side = await import('@/lib/keeper/side');
  const search = await import('@/lib/search/service');
  const ties = await import('@/lib/keeper/ties');
  deps = {
    sqlite: dbModule.sqlite,
    sideDetour: side.sideDetour,
    sameSide: side.sameSide,
    queryTail: side.queryTail,
    OTHER_SIDE: side.OTHER_SIDE,
    suggestEntries: search.suggestEntries,
    addTie: ties.addTie,
    tiesFor: ties.tiesFor,
  };
  const run = (sql: string, ...args: unknown[]) => deps.sqlite.prepare(sql).run(...args);

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
  entry('e-open', 'De veerman');
  entry('e-dicht', 'Het complot', 'keeper');

  const kase = (id: string, name: string, keeperOnly = 0) =>
    run(
      `INSERT INTO cases (id, name, slug, created_by, keeper_only) VALUES (?, ?, ?, 'keeper-1', ?)`,
      id,
      name,
      id,
      keeperOnly,
    );
  kase('c-open', 'De verdwijning');
  kase('c-dicht', 'Wat er werkelijk gebeurde', 1);
});

/* ------------------------------------------------------------ 1. de wissel */

describe('sideDetour — de pagina bepaalt waar je staat', () => {
  it('sends a Keeper on the players’ side to the Keeperkant, and back', () => {
    expect(deps.sideDetour(OP_SPELERSKANT, true, '/e/het-complot')).toBe(
      '/api/keeper/flip?side=keeper&to=%2Fe%2Fhet-complot&gewisseld=1',
    );
    expect(deps.sideDetour(OP_KEEPERKANT, false, '/e/de-veerman')).toBe(
      '/api/keeper/flip?side=player&to=%2Fe%2Fde-veerman&gewisseld=1',
    );
  });

  it('leaves a Keeper who already stands on the record’s side alone', () => {
    expect(deps.sideDetour(OP_KEEPERKANT, true, '/e/het-complot')).toBeNull();
    expect(deps.sideDetour(OP_SPELERSKANT, false, '/e/de-veerman')).toBeNull();
  });

  it('never moves a player, and never moves nobody at all', () => {
    expect(deps.sideDetour(BRAM, false, '/e/de-veerman')).toBeNull();
    // A player can never reach a keeper-only record — but if one somehow did,
    // the answer is still "stay": a player is not given a side to move.
    expect(deps.sideDetour(BRAM, true, '/e/het-complot')).toBeNull();
    expect(deps.sideDetour(null, true, '/e/het-complot')).toBeNull();
  });

  it('a Keeper with no side at all is treated as standing on the players’ side', () => {
    const nergens = { id: 'keeper-1', isKeeper: true };
    expect(deps.sideDetour(nergens, true, '/c/x')).toContain('side=keeper');
    expect(deps.sideDetour(nergens, false, '/c/x')).toBeNull();
  });

  it('cannot loop: the render after the flip asks the same question and stays', () => {
    // Standing on the players' side, opening a keeper-only dossier.
    const first = deps.sideDetour(OP_SPELERSKANT, true, '/c/wat-er-werkelijk-gebeurde');
    expect(first).not.toBeNull();
    // `/api/keeper/flip?side=keeper` writes the cookie, so the very next render
    // has this viewer — and it asks for nothing.
    const after = { ...OP_SPELERSKANT, side: 'keeper' } as const;
    expect(deps.sideDetour(after, true, '/c/wat-er-werkelijk-gebeurde')).toBeNull();
  });

  it('carries the page’s own query across the wissel, minus `gewisseld`', () => {
    expect(deps.queryTail({})).toBe('');
    expect(deps.queryTail({ new: '1' })).toBe('?new=1');
    expect(deps.queryTail({ rev: '7', gewisseld: '1' })).toBe('?rev=7');
    expect(deps.queryTail({ leeg: undefined })).toBe('');
  });
});

/* ------------------------------------------------------------- 2. het bod */

describe('suggestEntries — de autocomplete steekt de grens niet meer over', () => {
  it('offers only this side', () => {
    expect(deps.suggestEntries(OP_SPELERSKANT, 'complot')).toEqual([]);
    expect(names(deps.suggestEntries(OP_SPELERSKANT, 'veerman'))).toEqual(['De veerman']);
    expect(names(deps.suggestEntries(OP_KEEPERKANT, 'complot'))).toEqual(['Het complot']);
    expect(deps.suggestEntries(OP_KEEPERKANT, 'veerman')).toEqual([]);
  });

  it('the touwtje picker opts out, and it is the only one', () => {
    expect(names(deps.suggestEntries(OP_SPELERSKANT, 'complot', { bothSides: true }))).toEqual([
      'Het complot',
    ]);
    expect(names(deps.suggestEntries(OP_KEEPERKANT, 'veerman', { bothSides: true }))).toEqual([
      'De veerman',
    ]);
  });

  it('and a player is still shown nothing of the Keeper’s, hatch or no hatch', () => {
    expect(deps.suggestEntries(BRAM, 'complot', { bothSides: true })).toEqual([]);
  });
});

/* ----------------------------------------------------------- 3. het schrift */

describe('sameSide — de schrijfactie zelf wordt geweigerd', () => {
  it('refuses a keeper-only artikel into a player-facing dossier', () => {
    expect(deps.sameSide('case', 'c-open', 'entry', 'e-dicht')).toBe(false);
  });

  it('and refuses the reverse just as flatly', () => {
    expect(deps.sameSide('case', 'c-dicht', 'entry', 'e-open')).toBe(false);
  });

  it('permits both ends on the same side, either side', () => {
    expect(deps.sameSide('case', 'c-open', 'entry', 'e-open')).toBe(true);
    expect(deps.sameSide('case', 'c-dicht', 'entry', 'e-dicht')).toBe(true);
  });

  it('says it in Dutch', () => {
    expect(deps.OTHER_SIDE).toBe('Dat staat aan de andere kant van het archief.');
  });

  it('a touwtje is the one bridge, and never comes through here', () => {
    // §44's rope is *made* to cross: one end keeper-side, the other the
    // table's. It goes through `addTie`, which asks nothing of `sameSide`.
    deps.addTie(
      { kind: 'entry', id: 'e-dicht' },
      { kind: 'entry', id: 'e-open' },
      'keeper-1',
    );
    const tied = deps.tiesFor('entry', 'e-dicht', OP_KEEPERKANT);
    expect(tied.ropes.map((rope) => rope.other.id)).toContain('e-open');
    // …and the same rope is still there from the players'-side end, because a
    // *lookup* never asks which side you are standing on (§46, untouched).
    expect(
      deps.tiesFor('entry', 'e-open', OP_SPELERSKANT).ropes.map((rope) => rope.other.id),
    ).toContain('e-dicht');
  });
});
