import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';

/**
 * §46: de spiegel — the archive read from one side at a time.
 *
 * One rule, and it is the whole round: **a list filters by side; a lookup
 * never does.** On the Keeper's side every list — Start, Wiki, Dossiers,
 * Prikborden, Landkaarten, Tijdlijnen, Zoeken — shows only the Keeper's own
 * things; on the players' side only what the table may see. A record's own
 * page is reached from either side, so nothing that finds one record by slug
 * or by id asks the question at all.
 *
 * Pinned here against a real SQLite file, because all of it is SQL:
 *
 *   - a Keeper with `side: 'keeper'` sees only keeper-only rows in each of the
 *     five list functions and in the search; with `side: 'player'` only the
 *     others; with no side at all, both — which is what a test, an API that
 *     patches one record and a room's gate all are;
 *   - the side filter is AND-ed *after* the visibility rule and never instead
 *     of it: a *player* whose viewer somehow says `side: 'keeper'` still sees
 *     nothing keeper-only, because §9 and §17 already removed it;
 *   - a lookup by slug or id still finds a keeper-only record for a Keeper
 *     whose viewer says `side: 'player'`. That is the Keeper walking across a
 *     touwtje, and the page has to be there when they arrive.
 */

const dir = mkdtempSync(join(tmpdir(), 'zcf-mirror-'));
process.env.DATA_DIR = dir;

type Deps = {
  sqlite: typeof import('@/lib/db').sqlite;
  browseEntries: typeof import('@/lib/entries/service').browseEntries;
  countEntriesPerType: typeof import('@/lib/entries/service').countEntriesPerType;
  getEntryBySlug: typeof import('@/lib/entries/service').getEntryBySlug;
  listCases: typeof import('@/lib/cases/service').listCases;
  getCaseBySlug: typeof import('@/lib/cases/service').getCaseBySlug;
  listBoards: typeof import('@/lib/boards/service').listBoards;
  getBoard: typeof import('@/lib/boards/service').getBoard;
  listMaps: typeof import('@/lib/maps/service').listMaps;
  getMapBySlug: typeof import('@/lib/maps/service').getMapBySlug;
  listTimelines: typeof import('@/lib/timelines/service').listTimelines;
  getTimelineBySlug: typeof import('@/lib/timelines/service').getTimelineBySlug;
  searchEntries: typeof import('@/lib/search/service').searchEntries;
  suggestEntries: typeof import('@/lib/search/service').suggestEntries;
};
let deps: Deps;

/** The same Keeper, standing in three places. */
const OP_KEEPERKANT = { id: 'keeper-1', isKeeper: true, side: 'keeper' } as const;
const OP_SPELERSKANT = { id: 'keeper-1', isKeeper: true, side: 'player' } as const;
const NERGENS = { id: 'keeper-1', isKeeper: true } as const;
/** A player whose viewer claims the Keeper's side. The visibility rule wins. */
const BRAM_BEWEERT = { id: 'bram', isKeeper: false, side: 'keeper' } as const;

const names = (rows: { name: string }[]) => rows.map((row) => row.name).sort();

beforeAll(async () => {
  const dbModule = await import('@/lib/db');
  const entries = await import('@/lib/entries/service');
  const cases = await import('@/lib/cases/service');
  const boards = await import('@/lib/boards/service');
  const maps = await import('@/lib/maps/service');
  const timelines = await import('@/lib/timelines/service');
  const search = await import('@/lib/search/service');
  deps = {
    sqlite: dbModule.sqlite,
    browseEntries: entries.browseEntries,
    countEntriesPerType: entries.countEntriesPerType,
    getEntryBySlug: entries.getEntryBySlug,
    listCases: cases.listCases,
    getCaseBySlug: cases.getCaseBySlug,
    listBoards: boards.listBoards,
    getBoard: boards.getBoard,
    listMaps: maps.listMaps,
    getMapBySlug: maps.getMapBySlug,
    listTimelines: timelines.listTimelines,
    getTimelineBySlug: timelines.getTimelineBySlug,
    searchEntries: search.searchEntries,
    suggestEntries: search.suggestEntries,
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

  // Two of everything: one the table may see, one the Keeper's own.
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

  const board = (id: string, name: string, keeperOnly = 0) =>
    run(
      `INSERT INTO boards (id, name, state, created_by, keeper_only) VALUES (?, ?, '{"cards":[],"strings":[]}', 'keeper-1', ?)`,
      id,
      name,
      keeperOnly,
    );
  board('b-open', 'De muur');
  board('b-dicht', 'De echte muur', 1);

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
  map('m-dicht', 'Het eiland eronder', 1);

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
  timeline('t-dicht', 'De nacht zelf — echt', 1);
});

describe('a list is read from one side', () => {
  it('the Keeper’s side shows only the Keeper’s own things', () => {
    expect(names(deps.browseEntries(OP_KEEPERKANT))).toEqual(['Het complot']);
    expect(names(deps.listCases(OP_KEEPERKANT))).toEqual(['Wat er werkelijk gebeurde']);
    expect(names(deps.listBoards(OP_KEEPERKANT))).toEqual(['De echte muur']);
    expect(names(deps.listMaps(OP_KEEPERKANT))).toEqual(['Het eiland eronder']);
    expect(names(deps.listTimelines(OP_KEEPERKANT))).toEqual(['De nacht zelf — echt']);
  });

  it('the players’ side shows only what the table sees', () => {
    expect(names(deps.browseEntries(OP_SPELERSKANT))).toEqual(['De veerman']);
    expect(names(deps.listCases(OP_SPELERSKANT))).toEqual(['De verdwijning']);
    expect(names(deps.listBoards(OP_SPELERSKANT))).toEqual(['De muur']);
    expect(names(deps.listMaps(OP_SPELERSKANT))).toEqual(['Het eiland']);
    expect(names(deps.listTimelines(OP_SPELERSKANT))).toEqual(['De nacht zelf']);
  });

  it('a viewer with no side at all sees both', () => {
    expect(names(deps.browseEntries(NERGENS))).toEqual(['De veerman', 'Het complot']);
    expect(deps.listCases(NERGENS)).toHaveLength(2);
    expect(deps.listBoards(NERGENS)).toHaveLength(2);
    expect(deps.listMaps(NERGENS)).toHaveLength(2);
    expect(deps.listTimelines(NERGENS)).toHaveLength(2);
  });

  it('`bothSides` opts one list out again, for a picker', () => {
    expect(deps.listCases(OP_KEEPERKANT, { bothSides: true })).toHaveLength(2);
    expect(deps.listBoards(OP_SPELERSKANT, { bothSides: true })).toHaveLength(2);
    expect(deps.listMaps(OP_KEEPERKANT, { bothSides: true })).toHaveLength(2);
    expect(deps.listTimelines(OP_SPELERSKANT, { bothSides: true })).toHaveLength(2);
    expect(deps.browseEntries(OP_KEEPERKANT, { bothSides: true })).toHaveLength(2);
  });

  it('the soort badges count the side under them', () => {
    expect(deps.countEntriesPerType(OP_KEEPERKANT).get('character')).toBe(1);
    expect(deps.countEntriesPerType(OP_SPELERSKANT).get('character')).toBe(1);
    expect(deps.countEntriesPerType(NERGENS).get('character')).toBe(2);
  });

  it('Zoeken is a list; de suggesties zijn een kiezer', () => {
    expect(names(deps.searchEntries(OP_KEEPERKANT, 'complot').names)).toEqual(['Het complot']);
    expect(deps.searchEntries(OP_SPELERSKANT, 'complot').names).toEqual([]);
    expect(names(deps.searchEntries(OP_SPELERSKANT, 'veerman').names)).toEqual(['De veerman']);
    expect(deps.searchEntries(OP_KEEPERKANT, 'veerman').names).toEqual([]);
    // §50 reversed the second half of this: the @ / [[ autocomplete is sided
    // too now, and only the touwtje picker opts out. Pinned in full in
    // `two-sides.test.ts`.
    expect(deps.suggestEntries(OP_SPELERSKANT, 'complot')).toEqual([]);
    expect(names(deps.suggestEntries(OP_SPELERSKANT, 'complot', { bothSides: true }))).toEqual([
      'Het complot',
    ]);
  });
});

describe('the side filter never replaces the visibility rule', () => {
  it('a player whose viewer claims the Keeper’s side still sees nothing of it', () => {
    expect(names(deps.browseEntries(BRAM_BEWEERT))).toEqual(['De veerman']);
    expect(names(deps.listCases(BRAM_BEWEERT))).toEqual(['De verdwijning']);
    expect(names(deps.listBoards(BRAM_BEWEERT))).toEqual(['De muur']);
    expect(names(deps.listMaps(BRAM_BEWEERT))).toEqual(['Het eiland']);
    expect(names(deps.listTimelines(BRAM_BEWEERT))).toEqual(['De nacht zelf']);
    expect(deps.searchEntries(BRAM_BEWEERT, 'complot').names).toEqual([]);
  });
});

describe('a lookup never asks which side you are standing on', () => {
  it('a Keeper on the players’ side still lands on a keeper-only page', () => {
    expect(deps.getEntryBySlug('e-dicht', OP_SPELERSKANT)?.name).toBe('Het complot');
    expect(deps.getCaseBySlug('c-dicht', OP_SPELERSKANT)?.name).toBe('Wat er werkelijk gebeurde');
    expect(deps.getBoard('b-dicht', OP_SPELERSKANT)?.name).toBe('De echte muur');
    expect(deps.getMapBySlug('m-dicht', OP_SPELERSKANT)?.name).toBe('Het eiland eronder');
    expect(deps.getTimelineBySlug('t-dicht', OP_SPELERSKANT)?.name).toBe('De nacht zelf — echt');
  });

  it('and on the Keeper’s side still lands on a player-facing page', () => {
    expect(deps.getEntryBySlug('e-open', OP_KEEPERKANT)?.name).toBe('De veerman');
    expect(deps.getCaseBySlug('c-open', OP_KEEPERKANT)?.name).toBe('De verdwijning');
    expect(deps.getBoard('b-open', OP_KEEPERKANT)?.name).toBe('De muur');
    expect(deps.getMapBySlug('m-open', OP_KEEPERKANT)?.name).toBe('Het eiland');
    expect(deps.getTimelineBySlug('t-open', OP_KEEPERKANT)?.name).toBe('De nacht zelf');
  });

  it('a player is still refused the keeper-only page at its own address', () => {
    expect(deps.getEntryBySlug('e-dicht', BRAM_BEWEERT)).toBeUndefined();
    expect(deps.getCaseBySlug('c-dicht', BRAM_BEWEERT)).toBeUndefined();
    expect(deps.getBoard('b-dicht', BRAM_BEWEERT)).toBeUndefined();
    expect(deps.getMapBySlug('m-dicht', BRAM_BEWEERT)).toBeUndefined();
    expect(deps.getTimelineBySlug('t-dicht', BRAM_BEWEERT)).toBeUndefined();
  });
});
