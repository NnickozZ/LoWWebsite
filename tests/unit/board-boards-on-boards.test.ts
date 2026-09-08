import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';

/**
 * §52: a wall may hang on a wall — and a wall it names is still a wall behind
 * its own dials.
 *
 * `resolveBoardBoards` is deliberately not a select of its own: it goes through
 * `listBoards`, which is the one reader that carries both §17's view dial and
 * the rule that a wall filed in a dossier is also behind *that* dossier's dial.
 * A hand-written query would have skipped both and printed the name of a wall
 * the viewer may not open — which is the whole thing MISSING exists to prevent.
 * Asked of a real SQLite file, because it is a question about SQL.
 */

const dir = mkdtempSync(join(tmpdir(), 'zcf-board-on-board-'));
process.env.DATA_DIR = dir;

type Deps = {
  sqlite: typeof import('@/lib/db').sqlite;
  resolveBoardBoards: typeof import('@/lib/boards/service').resolveBoardBoards;
};
let deps: Deps;

const KEEPER = { id: 'keeper-1', isKeeper: true };
/** Bram owns the private wall; Nel is anybody else. */
const BRAM = { id: 'bram', isKeeper: false };
const NEL = { id: 'nel', isKeeper: false };

beforeAll(async () => {
  const dbModule = await import('@/lib/db');
  const boards = await import('@/lib/boards/service');
  deps = { sqlite: dbModule.sqlite, resolveBoardBoards: boards.resolveBoardBoards };
  const run = (sql: string, ...args: unknown[]) => deps.sqlite.prepare(sql).run(...args);

  for (const [id, name, keeper] of [
    ['keeper-1', 'Keeper', 1],
    ['bram', 'Bram', 0],
    ['nel', 'Nel', 0],
  ] as const) {
    run(
      `INSERT INTO users (id, username, username_lower, password_hash, password_enc, is_keeper) VALUES (?, ?, ?, 'x', 'x', ?)`,
      id,
      name,
      name.toLowerCase(),
      keeper,
    );
  }

  const board = (
    id: string,
    name: string,
    opts: { viewMode?: string; caseId?: string | null; owner?: string } = {},
  ) =>
    run(
      `INSERT INTO boards (id, name, case_id, state, created_by, view_mode, edit_mode)
       VALUES (?, ?, ?, '{"cards":[],"strings":[]}', ?, ?, 'all')`,
      id,
      name,
      opts.caseId ?? null,
      opts.owner ?? 'bram',
      opts.viewMode ?? 'all',
    );

  // A dossier nobody but its owner may open, and one everybody may.
  run(`INSERT INTO cases (id, name, slug, created_by, view_mode) VALUES ('c-open', 'De verdwijning', 'c-open', 'bram', 'all')`);
  run(`INSERT INTO cases (id, name, slug, created_by, view_mode) VALUES ('c-dicht', 'Wat Bram weet', 'c-dicht', 'bram', 'private')`);

  board('b-here', 'Het grote bord', { caseId: 'c-open' });
  board('b-open', 'De haven', { caseId: 'c-open' });
  board('b-prive', 'Wat ik denk', { viewMode: 'private' });
  board('b-in-prive-dossier', 'De nacht zelf', { caseId: 'c-dicht' });
});

const ids = ['b-open', 'b-prive', 'b-in-prive-dossier'];

describe('§52: resolving the walls a wall points at', () => {
  it('names a wall anyone may open', () => {
    const out = deps.resolveBoardBoards(ids, NEL);
    expect(out.get('b-open')).toMatchObject({ name: 'De haven', missing: false });
  });

  it('says nothing at all about a wall behind a private dial', () => {
    // Absent, not `missing: true` — the caller turns an absent id into the
    // MISSING stamp, which is the same answer a deleted wall gets.
    expect(deps.resolveBoardBoards(ids, NEL).has('b-prive')).toBe(false);
    expect(deps.resolveBoardBoards(ids, null).has('b-prive')).toBe(false);
    // Its owner and a Keeper do see it.
    expect(deps.resolveBoardBoards(ids, BRAM).get('b-prive')?.name).toBe('Wat ik denk');
    expect(deps.resolveBoardBoards(ids, KEEPER).get('b-prive')?.name).toBe('Wat ik denk');
  });

  it('a wall filed in a dossier you may not open is behind that dossier too', () => {
    expect(deps.resolveBoardBoards(ids, NEL).has('b-in-prive-dossier')).toBe(false);
    expect(deps.resolveBoardBoards(ids, BRAM).has('b-in-prive-dossier')).toBe(true);
  });

  it('asks nothing when there is nothing to ask about', () => {
    expect(deps.resolveBoardBoards([], NEL).size).toBe(0);
    expect(deps.resolveBoardBoards(['nergens'], KEEPER).size).toBe(0);
  });
});
