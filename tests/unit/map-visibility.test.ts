import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * §19 under §17: a landkaart has its own view dial.
 *
 * It was the one thing in the archive without one — every signed-in person saw
 * every map, and `resolveBoardMaps` took a viewer it never used — which made a
 * plattegrond impossible to keep back until the players find the house. These
 * run against a real SQLite file, because the whole point of the rule is the
 * SQL: a condition that is only enforced in a component is decoration.
 *
 * Four things are pinned here, and each of them has bitten another kind before:
 *   - a hidden map is nowhere: not the list, not the URL, not a wall's card,
 *     not the "Op de landkaart" line of an artikel pinned to it;
 *   - the spelden go with it, and the fiche speld's own rule still holds on top;
 *   - a card standing for a hidden map behaves exactly as a card for a hidden
 *     artikel does — it is simply not resolved, so the canvas stamps MISSING;
 *   - 0016's defaults leave every map that was already hanging visible.
 */

const dir = mkdtempSync(join(tmpdir(), 'zcf-mapvis-'));
process.env.DATA_DIR = dir;

type Deps = {
  sqlite: typeof import('@/lib/db').sqlite;
  listMaps: typeof import('@/lib/maps/service').listMaps;
  getMapById: typeof import('@/lib/maps/service').getMapById;
  getMapBySlug: typeof import('@/lib/maps/service').getMapBySlug;
  listPins: typeof import('@/lib/maps/service').listPins;
  getPin: typeof import('@/lib/maps/service').getPin;
  listPinsForEntry: typeof import('@/lib/maps/service').listPinsForEntry;
  listMapsOfEntry: typeof import('@/lib/maps/service').listMapsOfEntry;
  viewerCanEditMap: typeof import('@/lib/maps/service').viewerCanEditMap;
  resolveBoardMaps: typeof import('@/lib/boards/service').resolveBoardMaps;
  resolveBoardEntries: typeof import('@/lib/boards/service').resolveBoardEntries;
  canSeeMap: typeof import('@/lib/maps/visibility').canSeeMap;
};
let deps: Deps;

const KEEPER = { id: 'keeper-1', isKeeper: true };
const BRAM = { id: 'bram', isKeeper: false };
const AAGJE = { id: 'aagje', isKeeper: false };

const names = (rows: { name: string }[]) => rows.map((row) => row.name).sort();

beforeAll(async () => {
  const dbModule = await import('@/lib/db');
  const maps = await import('@/lib/maps/service');
  const boards = await import('@/lib/boards/service');
  const visibility = await import('@/lib/maps/visibility');
  deps = {
    canSeeMap: visibility.canSeeMap,
    sqlite: dbModule.sqlite,
    listMaps: maps.listMaps,
    getMapById: maps.getMapById,
    getMapBySlug: maps.getMapBySlug,
    listPins: maps.listPins,
    getPin: maps.getPin,
    listPinsForEntry: maps.listPinsForEntry,
    listMapsOfEntry: maps.listMapsOfEntry,
    viewerCanEditMap: maps.viewerCanEditMap,
    resolveBoardMaps: boards.resolveBoardMaps,
    resolveBoardEntries: boards.resolveBoardEntries,
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

  const entry = (id: string, name: string, visibility = 'all') =>
    sqlite
      .prepare(
        `INSERT INTO entries (id, type_id, name, slug, fields, tags, visibility, created_by, view_mode)
         VALUES (?, 'character', ?, ?, '{}', '[]', ?, 'keeper-1', 'all')`,
      )
      .run(id, name, id, visibility);
  entry('e-vuurtoren', 'De vuurtoren');
  entry('e-geheim', 'Geheim van de Keeper', 'keeper');

  /*
   * `m-oud` is written the way every landkaart was written before 0016 — the
   * old column list, nothing said about rights — so the row that comes out is
   * exactly the row an existing archive has after the migration runs.
   */
  sqlite
    .prepare(
      `INSERT INTO maps (id, name, slug, asset_id, width, height, sort_order, created_by)
       VALUES ('m-oud', 'Oude kaart', 'oude-kaart', 'a1', 10, 10, 0, 'keeper-1')`,
    )
    .run();

  const map = (id: string, name: string, viewMode: string, editMode = 'private', entryId: string | null = null) =>
    sqlite
      .prepare(
        `INSERT INTO maps (id, name, slug, asset_id, width, height, sort_order, created_by, view_mode, edit_mode, entry_id)
         VALUES (?, ?, ?, 'a2', 10, 10, 1, 'keeper-1', ?, ?, ?)`,
      )
      .run(id, name, id, viewMode, editMode, entryId);

  // The plattegrond the Keeper is keeping back — and it is a map *of* the
  // vuurtoren, so the artikel's own page has a reason to name it.
  map('m-huis', 'Het huis', 'private', 'private', 'e-vuurtoren');
  // The same map, but shown to Bram alone.
  map('m-gekozen', 'Gekozen kaart', 'some');
  // Everyone may look; Bram may also draw on it — an edit dial turned up.
  map('m-hulp', 'Hulpkaart', 'all', 'some');

  sqlite
    .prepare(`INSERT INTO access_grants (target_type, target_id, user_id, can_view, can_edit) VALUES ('map', 'm-gekozen', 'bram', 1, 0)`)
    .run();
  sqlite
    .prepare(`INSERT INTO access_grants (target_type, target_id, user_id, can_view, can_edit) VALUES ('map', 'm-hulp', 'bram', 1, 1)`)
    .run();

  const pin = (id: string, mapId: string, kind: string, entryId: string | null, name: string) =>
    sqlite
      .prepare(
        `INSERT INTO map_pins (id, map_id, kind, entry_id, name, x, y, created_by) VALUES (?, ?, ?, ?, ?, 0.5, 0.5, 'keeper-1')`,
      )
      .run(id, mapId, kind, entryId, name);
  // On the hidden map: a note and a fiche speld, both of which must go with it.
  pin('p-huis-note', 'm-huis', 'note', null, 'De kelder');
  pin('p-huis-entry', 'm-huis', 'entry', 'e-vuurtoren', '');
  // On the open one: a plain note, and a speld for a Keeper-only fiche, which
  // stays hidden by its own rule even though the map is open to everyone.
  pin('p-oud-note', 'm-oud', 'note', null, 'Hier lag de boot');
  pin('p-oud-entry', 'm-oud', 'entry', 'e-vuurtoren', '');
  pin('p-oud-geheim', 'm-oud', 'entry', 'e-geheim', '');
});

afterAll(() => {
  deps.sqlite.close();
  rmSync(dir, { recursive: true, force: true });
});

describe("0016's defaults", () => {
  it('a landkaart hung before there were dials is still for everyone', () => {
    const row = deps.sqlite
      .prepare(`SELECT view_mode, edit_mode, access_locked FROM maps WHERE id = 'm-oud'`)
      .get() as { view_mode: string; edit_mode: string; access_locked: number };
    // The whole intent of the migration: it adds a dial, it does not turn one.
    expect(row.view_mode).toBe('all');
    // …and it hands nobody the rename and the delete they did not have (§19).
    expect(row.edit_mode).toBe('private');
    expect(row.access_locked).toBe(0);
    expect(names(deps.listMaps(BRAM))).toContain('Oude kaart');
    expect(deps.getMapBySlug('oude-kaart', BRAM)?.name).toBe('Oude kaart');
  });
});

describe('a landkaart nobody was given', () => {
  it('is not in the list, and is not at its own URL', () => {
    expect(names(deps.listMaps(BRAM))).not.toContain('Het huis');
    expect(deps.getMapBySlug('m-huis', BRAM)).toBeUndefined();
    expect(deps.getMapById('m-huis', BRAM)).toBeUndefined();
  });

  it('is the Keeper\'s, always', () => {
    expect(names(deps.listMaps(KEEPER))).toContain('Het huis');
    expect(deps.getMapById('m-huis', KEEPER)?.name).toBe('Het huis');
  });

  it('appears the moment the Keeper chooses somebody', () => {
    expect(names(deps.listMaps(BRAM))).toContain('Gekozen kaart');
    expect(names(deps.listMaps(AAGJE))).not.toContain('Gekozen kaart');
    expect(deps.getMapById('m-gekozen', AAGJE)).toBeUndefined();
  });
});

describe('the spelden follow the landkaart', () => {
  it('a hidden map has no pins for anyone but the Keeper', () => {
    expect(deps.listPins('m-huis', BRAM)).toEqual([]);
    expect(deps.listPins('m-huis', KEEPER)).toHaveLength(2);
    expect(deps.getPin('p-huis-note', BRAM)).toBeUndefined();
    expect(deps.getPin('p-huis-entry', BRAM)).toBeUndefined();
    expect(deps.getPin('p-huis-note', KEEPER)?.name).toBe('De kelder');
  });

  it("the fiche speld's own rule still holds on an open map", () => {
    // Bram sees the note and the vuurtoren, never the Keeper-only fiche (§9).
    expect(deps.listPins('m-oud', BRAM).map((p) => p.name).sort()).toEqual([
      'De vuurtoren',
      'Hier lag de boot',
    ]);
    expect(deps.listPins('m-oud', KEEPER)).toHaveLength(3);
  });

  it('"Op de landkaart" on an artikel names only the maps this reader may open', () => {
    // The vuurtoren is pinned on both; only the open one may be named.
    expect(deps.listPinsForEntry('e-vuurtoren', BRAM).map((row) => row.mapId)).toEqual(['m-oud']);
    expect(deps.listPinsForEntry('e-vuurtoren', KEEPER).map((row) => row.mapId).sort()).toEqual([
      'm-huis',
      'm-oud',
    ]);
    // §23: and neither does the "landkaart van dit artikel" line.
    expect(deps.listMapsOfEntry('e-vuurtoren', BRAM)).toEqual([]);
    expect(names(deps.listMapsOfEntry('e-vuurtoren', KEEPER))).toEqual(['Het huis']);
  });
});

describe('a card on a wall that stands for a hidden landkaart', () => {
  it('is not resolved — the same blank a hidden artikel leaves, so the card stamps MISSING', () => {
    const forBram = deps.resolveBoardMaps(['m-oud', 'm-huis'], BRAM);
    expect([...forBram.keys()]).toEqual(['m-oud']);
    expect(forBram.get('m-huis')).toBeUndefined();

    // Exactly the shape a card for a Keeper-only artikel already has: absent
    // from the parcel, never a named row with `missing: true`.
    const entriesForBram = deps.resolveBoardEntries(['e-vuurtoren', 'e-geheim'], BRAM);
    expect([...entriesForBram.keys()]).toEqual(['e-vuurtoren']);
    expect(forBram.get('m-oud')?.missing).toBe(false);

    const forKeeper = deps.resolveBoardMaps(['m-oud', 'm-huis'], KEEPER);
    expect([...forKeeper.keys()].sort()).toEqual(['m-huis', 'm-oud']);
  });
});

describe('canSeeMap, the same rule as a plain predicate', () => {
  const row = (viewMode: 'all' | 'some' | 'private', extra: Record<string, unknown> = {}) => ({
    createdBy: 'keeper-1',
    viewMode,
    editMode: 'private' as const,
    ...extra,
  });

  it('matches the SQL: everyone, the chosen, the owner, the Keepers', () => {
    expect(deps.canSeeMap(row('all'), BRAM)).toBe(true);
    expect(deps.canSeeMap(row('private'), BRAM)).toBe(false);
    expect(deps.canSeeMap(row('private'), KEEPER)).toBe(true);
    expect(deps.canSeeMap(row('private'), { id: 'keeper-1', isKeeper: false })).toBe(true);
    expect(deps.canSeeMap(row('some'), BRAM, { userId: 'bram', canView: true, canEdit: false })).toBe(true);
    expect(deps.canSeeMap(row('some'), BRAM, null)).toBe(false);
  });

  it('a landkaart in the bin is the Keeper\'s alone', () => {
    expect(deps.canSeeMap(row('all', { deletedAt: 1 }), BRAM)).toBe(false);
    expect(deps.canSeeMap(row('all', { deletedAt: 1 }), KEEPER)).toBe(true);
  });
});

describe('viewerCanEditMap', () => {
  it('is the Keeper, and the owner, and nobody else by default', () => {
    expect(deps.viewerCanEditMap('m-oud', KEEPER)).toBe(true);
    // edit_mode 'private' is §19 written down: a player renames nothing.
    expect(deps.viewerCanEditMap('m-oud', BRAM)).toBe(false);
    expect(deps.viewerCanEditMap('m-oud', null)).toBe(false);
  });

  it('turns up when a Keeper chooses an editor', () => {
    expect(deps.viewerCanEditMap('m-hulp', BRAM)).toBe(true);
    expect(deps.viewerCanEditMap('m-hulp', AAGJE)).toBe(false);
  });

  it('never says yes about a map the person cannot even see', () => {
    expect(deps.viewerCanEditMap('m-huis', BRAM)).toBe(false);
  });
});
