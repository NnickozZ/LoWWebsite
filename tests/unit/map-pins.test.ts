import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * §39, under §19: a speld on a landkaart that stands for another landkaart.
 *
 * The map of Zeeland has a speld on a town and that speld opens the town's own
 * map; the town's map has a speld on a house and that one opens the
 * plattegrond. Written in the shape of `board-references.test.ts` — what a
 * thing points at, and which id it keeps — but against a real SQLite file,
 * because the half of this that matters is the *sight* rule and a condition
 * that is only enforced in a component is decoration.
 *
 * Five things are pinned here:
 *   - the name of a landkaart speld is read from the target, never stored, so
 *     a renamed landkaart renames its speld;
 *   - a landkaart in the bin takes its spelden with it;
 *   - **a landkaart this viewer may not see takes its spelden with it too** —
 *     the whole reason 0016 gave a landkaart a dial before this round could
 *     start. A speld to a hidden plattegrond behaves exactly as a speld to a
 *     Keeper-only artikel: it is not there;
 *   - a speld may not point at the landkaart it stands on;
 *   - and A→B→A is allowed on purpose. It is not a cycle bug, it is the way
 *     back up: the harbour map with a speld back to the island.
 */

const dir = mkdtempSync(join(tmpdir(), 'zcf-mappins-'));
process.env.DATA_DIR = dir;

type Deps = {
  sqlite: typeof import('@/lib/db').sqlite;
  listPins: typeof import('@/lib/maps/service').listPins;
  getPin: typeof import('@/lib/maps/service').getPin;
  addPin: typeof import('@/lib/maps/service').addPin;
  removePin: typeof import('@/lib/maps/service').removePin;
  listMaps: typeof import('@/lib/maps/service').listMaps;
  listMapsPinningMap: typeof import('@/lib/maps/service').listMapsPinningMap;
  PIN_ON_ITSELF: typeof import('@/lib/maps/service').PIN_ON_ITSELF;
};
let deps: Deps;

const KEEPER = { id: 'keeper-1', isKeeper: true };
const BRAM = { id: 'bram', isKeeper: false };

const names = (rows: { name: string }[]) => rows.map((row) => row.name).sort();

beforeAll(async () => {
  const dbModule = await import('@/lib/db');
  const maps = await import('@/lib/maps/service');
  deps = {
    sqlite: dbModule.sqlite,
    listPins: maps.listPins,
    getPin: maps.getPin,
    addPin: maps.addPin,
    removePin: maps.removePin,
    listMaps: maps.listMaps,
    listMapsPinningMap: maps.listMapsPinningMap,
    PIN_ON_ITSELF: maps.PIN_ON_ITSELF,
  };
  const { sqlite } = deps;

  for (const [id, name, keeper] of [
    ['keeper-1', 'Keeper', 1],
    ['bram', 'Bram', 0],
  ] as const) {
    sqlite
      .prepare(
        `INSERT INTO users (id, username, username_lower, password_hash, password_enc, is_keeper) VALUES (?, ?, ?, 'x', 'x', ?)`,
      )
      .run(id, name, name.toLowerCase(), keeper);
  }

  const map = (id: string, name: string, viewMode = 'all', deletedAt: number | null = null) =>
    sqlite
      .prepare(
        `INSERT INTO maps (id, name, slug, asset_id, width, height, sort_order, created_by, view_mode, edit_mode, deleted_at)
         VALUES (?, ?, ?, 'a1', 10, 10, 0, 'keeper-1', ?, 'private', ?)`,
      )
      .run(id, name, id, viewMode, deletedAt);

  map('m-zeeland', 'Zeeland');
  map('m-stad', 'De stad');
  // The plattegrond the Keeper is keeping back — the thing 0016 exists for.
  map('m-huis', 'Het huis', 'private');
  // And one taken off the wall.
  map('m-weg', 'Weggehaalde kaart', 'all', 1_700_000_000);

  const pin = (id: string, mapId: string, targetMapId: string) =>
    sqlite
      .prepare(
        `INSERT INTO map_pins (id, map_id, kind, target_map_id, name, text, x, y, created_by)
         VALUES (?, ?, 'map', ?, '', '', 0.5, 0.5, 'keeper-1')`,
      )
      .run(id, mapId, targetMapId);

  // Zeeland → de stad, and Zeeland → a landkaart that is in the bin.
  pin('p-stad', 'm-zeeland', 'm-stad');
  pin('p-weg', 'm-zeeland', 'm-weg');
  // De stad → het huis, which only the Keeper may see.
  pin('p-huis', 'm-stad', 'm-huis');
  // And a plain notitie, so the assertions below are about the landkaart
  // spelden rather than about an empty map.
  sqlite
    .prepare(
      `INSERT INTO map_pins (id, map_id, kind, entry_id, name, text, x, y, created_by)
       VALUES ('p-boot', 'm-zeeland', 'note', NULL, 'Hier lag de boot', '', 0.2, 0.2, 'keeper-1')`,
    )
    .run();
});

afterAll(() => {
  deps.sqlite.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('what a landkaart speld stands for', () => {
  it('carries the landkaart it opens, and takes its name from it', () => {
    const pins = deps.listPins('m-zeeland', KEEPER);
    const speld = pins.find((p) => p.id === 'p-stad')!;
    expect(speld.kind).toBe('map');
    expect(speld.map).toEqual({ id: 'm-stad', slug: 'm-stad', name: 'De stad', assetId: 'a1' });
    // The name is the target's, not the row's — the row's is empty on purpose.
    expect(speld.name).toBe('De stad');
    expect(speld.entry).toBeNull();
    // A notitie is untouched by any of this.
    expect(pins.find((p) => p.id === 'p-boot')?.map).toBeNull();
  });

  it('a renamed landkaart renames its speld, because nothing was copied', () => {
    deps.sqlite.prepare(`UPDATE maps SET name = 'De havenstad' WHERE id = 'm-stad'`).run();
    expect(deps.getPin('p-stad', KEEPER)?.name).toBe('De havenstad');
    // …and no stale second copy was left behind on the row itself.
    const row = deps.sqlite.prepare(`SELECT name FROM map_pins WHERE id = 'p-stad'`).get() as { name: string };
    expect(row.name).toBe('');
    deps.sqlite.prepare(`UPDATE maps SET name = 'De stad' WHERE id = 'm-stad'`).run();
  });
});

describe('the speld follows the landkaart it points at', () => {
  it('a landkaart in the bin drops the speld, for the Keeper too', () => {
    const forKeeper = deps.listPins('m-zeeland', KEEPER).map((p) => p.id);
    expect(forKeeper).toContain('p-stad');
    // A speld into the bin points at nothing, so it is not drawn at all —
    // rather than drawn with a hole where its name should be.
    expect(forKeeper).not.toContain('p-weg');
    expect(deps.getPin('p-weg', KEEPER)).toBeUndefined();
    expect(deps.listPins('m-zeeland', BRAM).map((p) => p.id)).not.toContain('p-weg');
  });

  it('a landkaart this viewer may not see drops the speld — the point of 0016', () => {
    // The Keeper sees the way down to the plattegrond.
    expect(deps.listPins('m-stad', KEEPER).map((p) => p.name)).toEqual(['Het huis']);
    expect(deps.getPin('p-huis', KEEPER)?.map?.slug).toBe('m-huis');
    // Bram does not — not the speld, not its name, not its icon. Exactly what
    // a speld to a Keeper-only artikel already does: it simply is not there.
    expect(deps.listPins('m-stad', BRAM)).toEqual([]);
    expect(deps.getPin('p-huis', BRAM)).toBeUndefined();
  });

  it('and the count on the shelf counts only the spelden that viewer may see', () => {
    const forBram = deps.listMaps(BRAM).find((m) => m.id === 'm-stad');
    const forKeeper = deps.listMaps(KEEPER).find((m) => m.id === 'm-stad');
    expect(forBram?.pinCount).toBe(0);
    expect(forKeeper?.pinCount).toBe(1);
  });
});

describe('setting one', () => {
  it('refuses a speld that points at the landkaart it stands on', () => {
    expect(() =>
      deps.addPin('m-zeeland', { kind: 'map', targetMapId: 'm-zeeland', x: 0.1, y: 0.1 }, KEEPER),
    ).toThrow(deps.PIN_ON_ITSELF);
  });

  it('refuses a landkaart the writer may not see, rather than storing it', () => {
    expect(() =>
      deps.addPin('m-zeeland', { kind: 'map', targetMapId: 'm-huis', x: 0.1, y: 0.1 }, BRAM),
    ).toThrow(/niet gevonden/i);
    expect(
      deps.sqlite.prepare(`SELECT count(*) AS n FROM map_pins WHERE target_map_id = 'm-huis'`).get(),
    ).toEqual({ n: 1 });
  });

  it('writes no name and no text of its own', () => {
    const made = deps.addPin('m-stad', { kind: 'map', targetMapId: 'm-zeeland', x: 0.4, y: 0.4 }, KEEPER);
    expect(made.name).toBe('Zeeland');
    const row = deps.sqlite
      .prepare(`SELECT name, text, entry_id, target_map_id FROM map_pins WHERE id = ?`)
      .get(made.id) as { name: string; text: string; entry_id: string | null; target_map_id: string };
    expect(row).toEqual({ name: '', text: '', entry_id: null, target_map_id: 'm-zeeland' });
    // §18: and it says who set it, like every other speld.
    expect(
      deps.sqlite.prepare(`SELECT count(*) AS n FROM activity WHERE verb = 'map.pinned'`).get(),
    ).toEqual({ n: 1 });
    deps.removePin(made.id, KEEPER);
  });
});

describe('the way back up', () => {
  it('names the landkaarten carrying a speld to this one', () => {
    expect(names(deps.listMapsPinningMap('m-stad', KEEPER))).toEqual(['Zeeland']);
    expect(names(deps.listMapsPinningMap('m-stad', BRAM))).toEqual(['Zeeland']);
    // Nobody has pinned Zeeland anywhere: no chip, rather than an empty one.
    expect(deps.listMapsPinningMap('m-zeeland', KEEPER)).toEqual([]);
  });

  it('does not name a landkaart the reader may not open', () => {
    // Het huis hangs on De stad, which everyone may see, so the chip is there
    // for everyone who gets as far as the plattegrond — and only the Keeper
    // ever does.
    expect(names(deps.listMapsPinningMap('m-huis', KEEPER))).toEqual(['De stad']);
    // Turn De stad down and the chip goes with it, for Bram and nobody else.
    deps.sqlite.prepare(`UPDATE maps SET view_mode = 'private' WHERE id = 'm-stad'`).run();
    expect(deps.listMapsPinningMap('m-huis', BRAM)).toEqual([]);
    expect(names(deps.listMapsPinningMap('m-huis', KEEPER))).toEqual(['De stad']);
    deps.sqlite.prepare(`UPDATE maps SET view_mode = 'all' WHERE id = 'm-stad'`).run();
  });

  it('is derived: pull the speld and the chip is gone', () => {
    const made = deps.addPin('m-huis', { kind: 'map', targetMapId: 'm-zeeland', x: 0.9, y: 0.9 }, KEEPER);
    expect(names(deps.listMapsPinningMap('m-zeeland', KEEPER))).toEqual(['Het huis']);
    deps.removePin(made.id, KEEPER);
    expect(deps.listMapsPinningMap('m-zeeland', KEEPER)).toEqual([]);
  });
});

describe('cycles', () => {
  it('allows A→B→A: it is the way back up, not a bug', () => {
    // Zeeland already points at De stad; point De stad back at Zeeland.
    const back = deps.addPin('m-stad', { kind: 'map', targetMapId: 'm-zeeland', x: 0.8, y: 0.2 }, KEEPER);
    expect(back.map?.id).toBe('m-zeeland');

    // Both spelden stand, and each list is one level deep — nothing here walks
    // an ancestor chain, so there is nothing to go round for ever.
    expect(deps.listPins('m-zeeland', KEEPER).map((p) => p.name).sort()).toEqual([
      'De stad',
      'Hier lag de boot',
    ]);
    expect(deps.listPins('m-stad', KEEPER).map((p) => p.name).sort()).toEqual(['Het huis', 'Zeeland']);

    // And the chips agree from both ends.
    expect(names(deps.listMapsPinningMap('m-zeeland', KEEPER))).toEqual(['De stad']);
    expect(names(deps.listMapsPinningMap('m-stad', KEEPER))).toEqual(['Zeeland']);
    deps.removePin(back.id, KEEPER);
  });
});
