import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readFlag, readMany, readOne } from '@/lib/listParams';

/**
 * §14: sorting and filtering, against a real SQLite file.
 *
 * The bar writes search params; these are the readers behind it. Every filter
 * is checked from a player's seat as well as the Keeper's, because a filter
 * that leaks a hidden fiche by *counting* it is a leak like any other.
 */

const dir = mkdtempSync(join(tmpdir(), 'zcf-filters-'));
process.env.DATA_DIR = dir;

type Deps = {
  sqlite: typeof import('@/lib/db').sqlite;
  browseEntries: typeof import('@/lib/entries/service').browseEntries;
  listCases: typeof import('@/lib/cases/service').listCases;
  listBoards: typeof import('@/lib/boards/service').listBoards;
  listMaps: typeof import('@/lib/maps/service').listMaps;
  listPins: typeof import('@/lib/maps/service').listPins;
};
let deps: Deps;

const KEEPER = { id: 'keeper-1', isKeeper: true };
const BRAM = { id: 'bram', isKeeper: false };
const AAGJE = { id: 'aagje', isKeeper: false };

beforeAll(async () => {
  const dbModule = await import('@/lib/db');
  const entries = await import('@/lib/entries/service');
  const cases = await import('@/lib/cases/service');
  const boards = await import('@/lib/boards/service');
  const maps = await import('@/lib/maps/service');
  deps = {
    sqlite: dbModule.sqlite,
    browseEntries: entries.browseEntries,
    listCases: cases.listCases,
    listBoards: boards.listBoards,
    listMaps: maps.listMaps,
    listPins: maps.listPins,
  };
  const { sqlite } = deps;

  for (const [id, name, keeper] of [
    ['keeper-1', 'Keeper', 1],
    ['bram', 'Bram', 0],
    ['aagje', 'Aagje', 0],
  ] as const) {
    sqlite
      .prepare(
        `INSERT INTO users (id, username, username_lower, password_hash, password_enc, is_keeper) VALUES (?, ?, ?, 'x', 'x', ?)`,
      )
      .run(id, name, name.toLowerCase(), keeper);
  }

  const entry = (id: string, name: string, by: string, over: Record<string, unknown> = {}) =>
    sqlite
      .prepare(
        `INSERT INTO entries (id, type_id, name, slug, fields, tags, visibility, created_by, view_mode, created_at, updated_at)
         VALUES (?, 'character', ?, ?, '{}', ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        name,
        id,
        JSON.stringify(over.tags ?? []),
        (over.visibility as string) ?? 'all',
        by,
        (over.viewMode as string) ?? 'all',
        (over.createdAt as number) ?? 1000,
        (over.updatedAt as number) ?? 1000,
      );

  entry('e-oud', 'Oude fiche', 'bram', { createdAt: 100, updatedAt: 5000, tags: ['haven'] });
  entry('e-nieuw', 'Nieuwe fiche', 'aagje', { createdAt: 9000, updatedAt: 9000 });
  entry('e-prive', 'Privé van Bram', 'bram', { viewMode: 'private', createdAt: 2000, updatedAt: 2000 });
  entry('e-geheim', 'Geheim van de Keeper', 'keeper-1', { visibility: 'keeper', createdAt: 3000, updatedAt: 3000 });

  sqlite
    .prepare(
      `INSERT INTO maps (id, name, slug, asset_id, width, height, sort_order, created_by) VALUES ('m1', 'Eiland', 'eiland', 'a1', 10, 10, 0, 'keeper-1')`,
    )
    .run();
  sqlite
    .prepare(
      `INSERT INTO maps (id, name, slug, asset_id, width, height, sort_order, created_by) VALUES ('m2', 'Haven', 'haven', 'a2', 10, 10, 1, 'keeper-1')`,
    )
    .run();
  sqlite
    .prepare(`INSERT INTO map_pins (id, map_id, kind, entry_id, x, y, created_by) VALUES ('p1', 'm1', 'entry', 'e-oud', 0.5, 0.5, 'bram')`)
    .run();
  sqlite
    .prepare(`INSERT INTO map_pins (id, map_id, kind, entry_id, x, y, created_by) VALUES ('p2', 'm1', 'entry', 'e-geheim', 0.2, 0.2, 'keeper-1')`)
    .run();
  sqlite
    .prepare(`INSERT INTO map_pins (id, map_id, kind, name, x, y, created_by) VALUES ('p3', 'm1', 'note', 'Hier lag de boot', 0.7, 0.7, 'aagje')`)
    .run();

  const aCase = (id: string, name: string, status: string, by: string, viewMode = 'all', updatedAt = 1000) =>
    sqlite
      .prepare(
        `INSERT INTO cases (id, name, slug, status, created_by, view_mode, updated_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(id, name, id, status, by, viewMode, updatedAt, updatedAt);
  aCase('c-open', 'Open zaak', 'open', 'bram', 'all', 3000);
  aCase('c-koud', 'Koude zaak', 'cold', 'aagje', 'all', 4000);
  aCase('c-dicht', 'Gesloten zaak', 'closed', 'bram', 'all', 5000);
  aCase('c-vertrouwelijk', 'Vertrouwelijk', 'open', 'aagje', 'some', 6000);
  sqlite
    .prepare(`INSERT INTO access_grants (target_type, target_id, user_id, can_view, can_edit) VALUES ('case', 'c-vertrouwelijk', 'bram', 1, 0)`)
    .run();

  const board = (id: string, name: string, by: string, caseId: string | null, viewMode = 'all') =>
    sqlite
      .prepare(`INSERT INTO boards (id, name, case_id, state, created_by, view_mode) VALUES (?, ?, ?, '{"cards":[],"strings":[]}', ?, ?)`)
      .run(id, name, caseId, by, viewMode);
  board('b-los', 'Los bord', 'bram', null);
  board('b-zaak', 'Zaakbord', 'aagje', 'c-open');
  board('b-prive', 'Privé bord', 'bram', null, 'private');
});

afterAll(() => {
  deps?.sqlite.close();
  rmSync(dir, { recursive: true, force: true });
});

const names = (rows: { name: string }[]) => rows.map((r) => r.name);

describe('reading the bar', () => {
  it('readOne falls back on anything it does not know', () => {
    expect(readOne({ sort: 'name' }, 'sort', ['recent', 'name'], 'recent')).toBe('name');
    expect(readOne({ sort: 'evil' }, 'sort', ['recent', 'name'], 'recent')).toBe('recent');
    expect(readOne({}, 'sort', ['recent', 'name'], 'recent')).toBe('recent');
    expect(readOne({ sort: ['name', 'recent'] }, 'sort', ['recent', 'name'], 'recent')).toBe('name');
  });
  it('readMany splits on commas and drops strangers', () => {
    expect(readMany({ status: 'open,cold,weird' }, 'status', ['open', 'cold', 'closed'])).toEqual(['open', 'cold']);
    expect(readMany({}, 'status', ['open'])).toEqual([]);
  });
  it('readFlag', () => {
    expect(readFlag({ mine: '1' }, 'mine')).toBe(true);
    expect(readFlag({ mine: '0' }, 'mine')).toBe(false);
    expect(readFlag({}, 'mine')).toBe(false);
  });
});

describe('browseEntries', () => {
  it('sorts by change, name, or birth', () => {
    expect(names(deps.browseEntries(KEEPER, { sort: 'recent' }))).toEqual([
      'Nieuwe fiche',
      'Oude fiche',
      'Geheim van de Keeper',
      'Privé van Bram',
    ]);
    expect(names(deps.browseEntries(KEEPER, { sort: 'name' }))[0]).toBe('Geheim van de Keeper');
    expect(names(deps.browseEntries(KEEPER, { sort: 'created' }))[0]).toBe('Nieuwe fiche');
    expect(names(deps.browseEntries(KEEPER, { sort: 'created' })).at(-1)).toBe('Oude fiche');
  });
  it('"van mij" is by account, and still behind the view rules', () => {
    expect(names(deps.browseEntries(BRAM, { mine: 'bram' }))).toEqual(['Oude fiche', 'Privé van Bram']);
    expect(names(deps.browseEntries(AAGJE, { mine: 'bram' }))).toEqual(['Oude fiche']);
  });
  it('"niet voor iedereen" shows a stranger nothing they could not open anyway', () => {
    expect(names(deps.browseEntries(BRAM, { restricted: true }))).toEqual(['Privé van Bram']);
    expect(names(deps.browseEntries(AAGJE, { restricted: true }))).toEqual([]);
    expect(names(deps.browseEntries(KEEPER, { restricted: true }))).toEqual(['Privé van Bram']);
  });
  it('the Keeper filters by secrecy; a player asking for it gets the normal list', () => {
    expect(names(deps.browseEntries(KEEPER, { visibility: 'keeper' }))).toEqual(['Geheim van de Keeper']);
    expect(names(deps.browseEntries(BRAM, { visibility: 'keeper' }))).not.toContain('Geheim van de Keeper');
  });
  it('"op een landkaart" only counts pins on maps still hanging', () => {
    expect(names(deps.browseEntries(BRAM, { onMap: true }))).toEqual(['Oude fiche']);
    expect(names(deps.browseEntries(KEEPER, { onMap: true }))).toEqual(['Oude fiche', 'Geheim van de Keeper']);
    deps.sqlite.prepare(`UPDATE maps SET deleted_at = 1 WHERE id = 'm1'`).run();
    expect(names(deps.browseEntries(KEEPER, { onMap: true }))).toEqual([]);
    deps.sqlite.prepare(`UPDATE maps SET deleted_at = NULL WHERE id = 'm1'`).run();
  });
  it('tags still narrow', () => {
    expect(names(deps.browseEntries(BRAM, { tag: 'haven' }))).toEqual(['Oude fiche']);
  });
});

describe('listCases', () => {
  it('"open eerst" ranks by status and then by change', () => {
    expect(names(deps.listCases(KEEPER, { sort: 'status' }))).toEqual([
      'Vertrouwelijk',
      'Open zaak',
      'Koude zaak',
      'Gesloten zaak',
    ]);
  });
  it('status takes one or several', () => {
    expect(names(deps.listCases(KEEPER, { status: 'cold' }))).toEqual(['Koude zaak']);
    expect(names(deps.listCases(KEEPER, { status: ['cold', 'closed'], sort: 'name' }))).toEqual(['Gesloten zaak', 'Koude zaak']);
    expect(names(deps.listCases(KEEPER, { status: [] })).length).toBe(4);
  });
  it('"waar ik bij zit" is the view list, and owning counts', () => {
    expect(names(deps.listCases(BRAM, { memberOf: 'bram', sort: 'name' }))).toEqual(['Gesloten zaak', 'Open zaak', 'Vertrouwelijk']);
    expect(names(deps.listCases(AAGJE, { memberOf: 'aagje', sort: 'name' }))).toEqual(['Koude zaak', 'Vertrouwelijk']);
  });
  it('"van mij" and "vertrouwelijk"', () => {
    expect(names(deps.listCases(AAGJE, { mine: 'aagje', sort: 'name' }))).toEqual(['Koude zaak', 'Vertrouwelijk']);
    expect(names(deps.listCases(BRAM, { restricted: true }))).toEqual(['Vertrouwelijk']);
    // Aagje owns it; a third person would not see it at all.
    expect(names(deps.listCases({ id: 'nobody', isKeeper: false }, { restricted: true }))).toEqual([]);
  });
});

describe('listBoards', () => {
  it('loose or filed, mine, private', () => {
    expect(names(deps.listBoards(KEEPER, { where: 'loose', sort: 'name' }))).toEqual(['Los bord', 'Privé bord']);
    expect(names(deps.listBoards(KEEPER, { where: 'case' }))).toEqual(['Zaakbord']);
    expect(names(deps.listBoards(BRAM, { mine: 'bram', sort: 'name' }))).toEqual(['Los bord', 'Privé bord']);
    expect(names(deps.listBoards(AAGJE, { privateOnly: true }))).toEqual([]);
    expect(names(deps.listBoards(BRAM, { privateOnly: true }))).toEqual(['Privé bord']);
  });
});

describe('listMaps and listPins', () => {
  it('counts only the pins the viewer may see', () => {
    const asBram = deps.listMaps(BRAM);
    expect(asBram.map((m) => [m.name, m.pinCount])).toEqual([
      ['Eiland', 2],
      ['Haven', 0],
    ]);
    expect(deps.listMaps(KEEPER)[0].pinCount).toBe(3);
    expect(deps.listPins('m1', BRAM).map((p) => p.name).sort()).toEqual(['Hier lag de boot', 'Oude fiche']);
  });
  it('"met mijn spelden"', () => {
    expect(names(deps.listMaps(BRAM, { mine: 'bram' }))).toEqual(['Eiland']);
    expect(names(deps.listMaps(BRAM, { mine: 'nobody' }))).toEqual([]);
    expect(names(deps.listMaps(KEEPER, { sort: 'name' }))).toEqual(['Eiland', 'Haven']);
  });
});
