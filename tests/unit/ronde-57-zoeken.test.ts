import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';

/**
 * §96 (ronde 57): zoeken vindt meer dan artikelen — en nooit meer dan je mag.
 *
 * `searchOthers` leest elke soort ding door zijn eigen `list*`, zonder
 * `bothSides`. Deze test is rule 1 voor die functie: een speler die zoekt op de
 * naam van een Keeper-only dossier, landkaart, tijdlijn, stamboom, prikbord of
 * overzicht krijgt **niets** terug — geen naam, geen rij, en dus ook geen
 * telling. En de Keeper leest van één kant tegelijk (§46).
 */

const dir = mkdtempSync(join(tmpdir(), 'zcf-r57-zoeken-'));
process.env.DATA_DIR = dir;

type Search = typeof import('@/lib/search/others').searchOthers;
let searchOthers: Search;

const KEEPER_SPELERSKANT = { id: 'keeper-1', isKeeper: true, side: 'player' } as const;
const KEEPER_KEEPERKANT = { id: 'keeper-1', isKeeper: true, side: 'keeper' } as const;
const BRAM = { id: 'bram', isKeeper: false, side: 'player' } as const;

const EMPTY_TREE =
  '{"v":1,"members":[],"loose":[],"ties":[],"deleted":{"members":{},"loose":{},"ties":{}}}';

beforeAll(async () => {
  const dbModule = await import('@/lib/db');
  searchOthers = (await import('@/lib/search/others')).searchOthers;
  const run = (sql: string, ...args: unknown[]) => dbModule.sqlite.prepare(sql).run(...args);

  for (const [id, name, keeper] of [
    ['keeper-1', 'Keeper Kees', 1],
    ['bram', 'Bram Ossewaarde', 0],
  ] as const) {
    run(
      `INSERT INTO users (id, username, username_lower, password_hash, is_keeper) VALUES (?, ?, ?, 'x', ?)`,
      id,
      name,
      name.toLowerCase(),
      keeper,
    );
  }

  // Twee van elk: één voor de tafel ("Holle Tij"), één van de Keeper ("Zwarte Vloed").
  for (const [suffix, name, keeperOnly] of [
    ['open', 'Holle Tij', 0],
    ['dicht', 'Zwarte Vloed', 1],
  ] as const) {
    run(
      `INSERT INTO cases (id, name, slug, created_by, keeper_only) VALUES (?, ?, ?, 'keeper-1', ?)`,
      `c-${suffix}`,
      `${name} dossier`,
      `c-${suffix}`,
      keeperOnly,
    );
    run(
      `INSERT INTO maps (id, name, slug, asset_id, width, height, sort_order, created_by, view_mode, keeper_only)
       VALUES (?, ?, ?, 'a1', 10, 10, 0, 'keeper-1', 'all', ?)`,
      `m-${suffix}`,
      `${name} landkaart`,
      `m-${suffix}`,
      keeperOnly,
    );
    run(
      `INSERT INTO timelines (id, name, slug, created_by, view_mode, keeper_only) VALUES (?, ?, ?, 'keeper-1', 'all', ?)`,
      `t-${suffix}`,
      `${name} tijdlijn`,
      `t-${suffix}`,
      keeperOnly,
    );
    run(
      `INSERT INTO family_trees (id, name, slug, state, created_by, view_mode, keeper_only) VALUES (?, ?, ?, ?, 'keeper-1', 'all', ?)`,
      `f-${suffix}`,
      `${name} stamboom`,
      `f-${suffix}`,
      EMPTY_TREE,
      keeperOnly,
    );
    run(
      `INSERT INTO boards (id, name, state, created_by, view_mode, keeper_only) VALUES (?, ?, '{"cards":[],"strings":[]}', 'keeper-1', 'all', ?)`,
      `b-${suffix}`,
      `${name} prikbord`,
      keeperOnly,
    );
    run(
      `INSERT INTO overzichten (id, name, slug, lead, is_home, created_by, view_mode, edit_mode, keeper_only)
       VALUES (?, ?, ?, '', 0, 'keeper-1', 'all', 'all', ?)`,
      `o-${suffix}`,
      `${name} overzicht`,
      `o-${suffix}`,
      keeperOnly,
    );
  }

  // Niet van de Keeperkant, maar privé: de eigen wijzer van de eigenaar (§17).
  run(
    `INSERT INTO boards (id, name, state, created_by, view_mode) VALUES ('b-prive', 'Holle Tij privé', '{"cards":[],"strings":[]}', 'keeper-1', 'private')`,
  );
  // En een vlak in een dossier dat de speler niet mag openen.
  run(
    `INSERT INTO cases (id, name, slug, created_by, view_mode) VALUES ('c-prive', 'Besloten', 'besloten', 'keeper-1', 'private')`,
  );
  run(
    `INSERT INTO timelines (id, name, slug, created_by, view_mode, case_id) VALUES ('t-besloten', 'Holle Tij besloten', 't-besloten', 'keeper-1', 'all', 'c-prive')`,
  );
  // En een weggegooid prikbord.
  run(
    `INSERT INTO boards (id, name, state, created_by, view_mode, deleted_at) VALUES ('b-weg', 'Holle Tij weg', '{"cards":[],"strings":[]}', 'bram', 'all', 1)`,
  );
});

const KINDS = ['case', 'map', 'timeline', 'family_tree', 'board', 'overzicht'] as const;

describe('searchOthers — rule 1', () => {
  it('a player finds every kind of thing on the table by name', () => {
    const hits = searchOthers(BRAM, 'Holle Tij');
    for (const kind of KINDS) {
      expect(hits.filter((hit) => hit.kind === kind).map((hit) => hit.name)).toEqual([
        expect.stringMatching(/^Holle Tij /),
      ]);
    }
  });

  it('a player searching for the Keeper’s own gets nothing at all — no name, no row', () => {
    const hits = searchOthers(BRAM, 'Zwarte Vloed');
    expect(hits).toEqual([]);
    for (const kind of KINDS) {
      expect(searchOthers(BRAM, `Zwarte Vloed ${kind}`)).toEqual([]);
    }
    // Not even as a fuzzy neighbour of something else.
    expect(JSON.stringify(searchOthers(BRAM, 'Vloed'))).not.toContain('Zwarte');
  });

  it('a private wall, a vlak in a closed dossier and a binned wall stay absent', () => {
    const names = searchOthers(BRAM, 'Holle Tij').map((hit) => hit.name);
    expect(names).not.toContain('Holle Tij privé');
    expect(names).not.toContain('Holle Tij besloten');
    expect(names).not.toContain('Holle Tij weg');
    expect(JSON.stringify(searchOthers(BRAM, 'Besloten'))).not.toContain('Besloten');
  });

  it('§46: the Keeper reads from the side they stand on', () => {
    const spelerskant = searchOthers(KEEPER_SPELERSKANT, 'Zwarte Vloed');
    expect(spelerskant).toEqual([]);
    const keeperkant = searchOthers(KEEPER_KEEPERKANT, 'Zwarte Vloed');
    expect(new Set(keeperkant.map((hit) => hit.kind))).toEqual(new Set(KINDS));
    expect(searchOthers(KEEPER_KEEPERKANT, 'Holle Tij').some((hit) => hit.name.startsWith('Holle Tij '))).toBe(
      false,
    );
    // The Keeper's own private wall is theirs to find.
    expect(searchOthers(KEEPER_SPELERSKANT, 'Holle Tij privé').map((hit) => hit.name)).toContain('Holle Tij privé');
  });

  it('finds spelers from the hall, with the hall’s address', () => {
    const hits = searchOthers(BRAM, 'Ossewaarde');
    expect(hits).toEqual([
      expect.objectContaining({ kind: 'speler', name: 'Bram Ossewaarde', href: '/spelers/bram-ossewaarde' }),
    ]);
  });

  it('every hit carries a real address and nobody without a session gets anything', () => {
    for (const hit of searchOthers(BRAM, 'Holle Tij')) expect(hit.href).toMatch(/^\/[a-z]/);
    expect(searchOthers(null as never, 'Holle Tij')).toEqual([]);
    expect(searchOthers(BRAM, '   ')).toEqual([]);
  });
});
