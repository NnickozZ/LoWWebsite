import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';

/**
 * §66: a stamboom may hang on a wall — and a stamboom it names is still a
 * stamboom behind its own dials.
 *
 * `resolveBoardFamilyTrees` is deliberately not a select of its own: it is the
 * board's door onto `resolveFamilyTrees`, which goes through `listFamilyTrees`,
 * the one reader carrying both §17's view dial and the rule that a stamboom
 * filed in a dossier is also behind *that* dossier's dial. A hand-written query
 * would have skipped both and printed the name of a stamboom the viewer may not
 * open — which is the whole thing MISSING exists to prevent. Asked of a real
 * SQLite file, because it is a question about SQL.
 *
 * The same shape as `tests/unit/board-boards-on-boards.test.ts`, one kind
 * further along.
 */

const dir = mkdtempSync(join(tmpdir(), 'zcf-board-family-tree-'));
process.env.DATA_DIR = dir;

type Deps = {
  sqlite: typeof import('@/lib/db').sqlite;
  resolveBoardFamilyTrees: typeof import('@/lib/boards/service').resolveBoardFamilyTrees;
};
let deps: Deps;

const KEEPER = { id: 'keeper-1', isKeeper: true };
/** Bram owns the private stamboom; Nel is anybody else. */
const BRAM = { id: 'bram', isKeeper: false };
const NEL = { id: 'nel', isKeeper: false };

beforeAll(async () => {
  const dbModule = await import('@/lib/db');
  const boards = await import('@/lib/boards/service');
  deps = { sqlite: dbModule.sqlite, resolveBoardFamilyTrees: boards.resolveBoardFamilyTrees };
  const run = (sql: string, ...args: unknown[]) => deps.sqlite.prepare(sql).run(...args);

  for (const [id, name, keeper] of [
    ['keeper-1', 'Keeper', 1],
    ['bram', 'Bram', 0],
    ['nel', 'Nel', 0],
  ] as const) {
    run(
      `INSERT INTO users (id, username, username_lower, password_hash, is_keeper) VALUES (?, ?, ?, 'x', ?)`,
      id,
      name,
      name.toLowerCase(),
      keeper,
    );
  }

  const tree = (
    id: string,
    name: string,
    opts: { viewMode?: string; caseId?: string | null; owner?: string } = {},
  ) =>
    run(
      `INSERT INTO family_trees (id, name, slug, case_id, state, created_by, view_mode, edit_mode)
       VALUES (?, ?, ?, ?, '{"members":[],"loose":[],"ties":[]}', ?, ?, 'all')`,
      id,
      name,
      id,
      opts.caseId ?? null,
      opts.owner ?? 'bram',
      opts.viewMode ?? 'all',
    );

  // A dossier nobody but its owner may open, and one everybody may.
  run(`INSERT INTO cases (id, name, slug, created_by, view_mode) VALUES ('c-open', 'De verdwijning', 'c-open', 'bram', 'all')`);
  run(`INSERT INTO cases (id, name, slug, created_by, view_mode) VALUES ('c-dicht', 'Wat Bram weet', 'c-dicht', 'bram', 'private')`);

  tree('st-open', 'Den Hollander', { caseId: 'c-open' });
  tree('st-prive', 'Wat ik vermoed', { viewMode: 'private' });
  tree('st-in-prive-dossier', 'Het huis zelf', { caseId: 'c-dicht' });
});

const ids = ['st-open', 'st-prive', 'st-in-prive-dossier'];

describe('§66: resolving the stambomen a wall points at', () => {
  it('names a stamboom anyone may open, with its dossier', () => {
    const out = deps.resolveBoardFamilyTrees(ids, NEL);
    expect(out.get('st-open')).toMatchObject({
      name: 'Den Hollander',
      slug: 'st-open',
      caseName: 'De verdwijning',
      missing: false,
    });
  });

  it('says nothing at all about a stamboom behind a private dial', () => {
    // Absent, not `missing: true` — the caller turns an absent id into the
    // MISSING stamp, which is the same answer a deleted stamboom gets, and the
    // two must not be distinguishable (rule 1).
    expect(deps.resolveBoardFamilyTrees(ids, NEL).has('st-prive')).toBe(false);
    expect(deps.resolveBoardFamilyTrees(ids, null).has('st-prive')).toBe(false);
    // Its owner and a Keeper do see it.
    expect(deps.resolveBoardFamilyTrees(ids, BRAM).get('st-prive')?.name).toBe('Wat ik vermoed');
    expect(deps.resolveBoardFamilyTrees(ids, KEEPER).get('st-prive')?.name).toBe('Wat ik vermoed');
  });

  it('a stamboom filed in a dossier you may not open is behind that dossier too', () => {
    expect(deps.resolveBoardFamilyTrees(ids, NEL).has('st-in-prive-dossier')).toBe(false);
    expect(deps.resolveBoardFamilyTrees(ids, BRAM).has('st-in-prive-dossier')).toBe(true);
  });

  it('asks nothing when there is nothing to ask about', () => {
    expect(deps.resolveBoardFamilyTrees([], NEL).size).toBe(0);
    expect(deps.resolveBoardFamilyTrees(['nergens'], KEEPER).size).toBe(0);
  });
});
