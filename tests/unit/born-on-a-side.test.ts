import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';

/**
 * §48, round 25: a new thing is born on the side it was made on.
 *
 * Until this round `keeper_only` defaulted to 0 and an artikel's `visibility`
 * to 'all', so everything was born on the players' side whatever face the
 * archive was wearing — a Keeper in their own dossier made a prikbord the whole
 * table could read. These are the four sentences that must not quietly stop
 * being true again:
 *
 *   1. the side the browser stands on decides, for anything with no container;
 *   2. a container that is the Keeper's own overrules everything, the maker's
 *      own wish included — a wall carries its dossier's *name* into every list;
 *   3. a player is never given a side, whatever they ask for;
 *   4. hiding travels inwards and revealing never does: taking a dossier to
 *      the Keeper's side takes its walls and tijdlijnen with it, and handing it
 *      back leaves them where they are.
 */

const dir = mkdtempSync(join(tmpdir(), 'zcf-born-'));
process.env.DATA_DIR = dir;

type Deps = {
  sqlite: typeof import('@/lib/db').sqlite;
  bornSide: typeof import('@/lib/keeper/side').bornSide;
  keeperOnlyForNew: typeof import('@/lib/keeper/side').keeperOnlyForNew;
  placeNewOnSide: typeof import('@/lib/keeper/side').placeNewOnSide;
  isKeeperSide: typeof import('@/lib/keeper/side').isKeeperSide;
  setKeeperSide: typeof import('@/lib/keeper/side').setKeeperSide;
  createBoard: typeof import('@/lib/boards/service').createBoard;
  setBoardCase: typeof import('@/lib/boards/service').setBoardCase;
};
let deps: Deps;

const KEEPER_HERE = { id: 'keeper-1', isKeeper: true, side: 'keeper' as const };
const KEEPER_THERE = { id: 'keeper-1', isKeeper: true, side: 'player' as const };
/** §46: a player's side is forced to 'player' by the session; this asks anyway. */
const PLAYER = { id: 'bram', isKeeper: false, side: 'keeper' as const };

beforeAll(async () => {
  const dbModule = await import('@/lib/db');
  const side = await import('@/lib/keeper/side');
  const boards = await import('@/lib/boards/service');
  deps = {
    sqlite: dbModule.sqlite,
    bornSide: side.bornSide,
    keeperOnlyForNew: side.keeperOnlyForNew,
    placeNewOnSide: side.placeNewOnSide,
    isKeeperSide: side.isKeeperSide,
    setKeeperSide: side.setKeeperSide,
    createBoard: boards.createBoard,
    setBoardCase: boards.setBoardCase,
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
  kase('c-omslag', 'Het dossier dat omslaat');

  run(
    `INSERT INTO entries (id, type_id, name, slug, fields, tags, visibility, created_by, view_mode)
     VALUES ('e-nieuw', 'character', 'Pas gemaakt', 'e-nieuw', '{}', '[]', 'all', 'keeper-1', 'all')`,
  );
  run(
    `INSERT INTO timelines (id, name, slug, created_by, view_mode, case_id, keeper_only)
     VALUES ('t-in-omslag', 'De nacht', 't-in-omslag', 'keeper-1', 'all', 'c-omslag', 0)`,
  );
});

describe('§48 — which side a new thing is born on', () => {
  it('follows the side the browser stands on when there is no container', () => {
    expect(deps.bornSide(KEEPER_HERE)).toBe('keeper');
    expect(deps.bornSide(KEEPER_THERE)).toBe('player');
  });

  it('never gives a player a side, whatever their cookie says', () => {
    expect(deps.bornSide(PLAYER)).toBe('player');
    expect(deps.bornSide(PLAYER, { kind: 'case', id: 'c-dicht' })).toBe('player');
    expect(deps.keeperOnlyForNew(PLAYER, { kind: 'case', id: 'c-dicht' }, true)).toBe(false);
    expect(deps.bornSide(null)).toBe('player');
  });

  it("takes the container's side over the browser's", () => {
    expect(deps.bornSide(KEEPER_THERE, { kind: 'case', id: 'c-dicht' })).toBe('keeper');
    expect(deps.bornSide(KEEPER_HERE, { kind: 'case', id: 'c-open' })).toBe('keeper');
  });

  it('lets a Keeper say otherwise — except inside a Keeper-only dossier', () => {
    expect(deps.keeperOnlyForNew(KEEPER_HERE, null, false)).toBe(false);
    expect(deps.keeperOnlyForNew(KEEPER_THERE, null, true)).toBe(true);
    // The one wish that is not granted: the dossier's name would travel with it.
    expect(deps.keeperOnlyForNew(KEEPER_HERE, { kind: 'case', id: 'c-dicht' }, false)).toBe(true);
  });

  it('writes both spellings of "the Keeper\'s own"', () => {
    deps.placeNewOnSide('entry', 'e-nieuw', true, 'keeper-1');
    expect(deps.isKeeperSide('entry', 'e-nieuw')).toBe(true);
    expect(
      deps.sqlite.prepare(`SELECT visibility FROM entries WHERE id = 'e-nieuw'`).get(),
    ).toEqual({ visibility: 'keeper' });

    // False is not a write: nothing was ever on the other side.
    deps.placeNewOnSide('case', 'c-open', false, 'keeper-1');
    expect(deps.isKeeperSide('case', 'c-open')).toBe(false);
  });
});

describe('§48 — hiding travels, revealing does not', () => {
  it('files a wall into a Keeper-only dossier onto the Keeper side with it', () => {
    const board = deps.createBoard({ name: 'De muur', createdBy: 'keeper-1' });
    expect(deps.isKeeperSide('board', board.id)).toBe(false);
    deps.setBoardCase(board.id, 'c-dicht', { id: 'keeper-1', isKeeper: true, characterId: null });
    expect(deps.isKeeperSide('board', board.id)).toBe(true);

    // And taking it out again does not hand it back to the table.
    deps.setBoardCase(board.id, null, { id: 'keeper-1', isKeeper: true, characterId: null });
    expect(deps.isKeeperSide('board', board.id)).toBe(true);
  });

  it('takes a dossier\'s walls and tijdlijnen with it, and does not give them back', () => {
    const board = deps.createBoard({ name: 'Muur van het omslagdossier', caseId: 'c-omslag', createdBy: 'keeper-1' });
    expect(deps.isKeeperSide('board', board.id)).toBe(false);

    deps.setKeeperSide('case', 'c-omslag', true, 'keeper-1');
    expect(deps.isKeeperSide('board', board.id)).toBe(true);
    expect(deps.isKeeperSide('timeline', 't-in-omslag')).toBe(true);

    deps.setKeeperSide('case', 'c-omslag', false, 'keeper-1');
    expect(deps.isKeeperSide('case', 'c-omslag')).toBe(false);
    // Deliberate: only a person pressing the button reveals a wall.
    expect(deps.isKeeperSide('board', board.id)).toBe(true);
    expect(deps.isKeeperSide('timeline', 't-in-omslag')).toBe(true);
  });
});
