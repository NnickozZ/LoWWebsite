import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { roomFeedPhrase } from '@/components/kamer/plekWords';
import { shopFieldsOf } from '@/lib/kamers/shape';
import { DEFAULT_WORDS } from '@/lib/words';

/**
 * §93 (ronde 54, "De kamer, tweede pas").
 *
 * Elk ding wordt gevraagd langs de weg die de app loopt (§86's tweede les):
 * de plek-kiezer via `placeCandidates` (wat de route aanroept), neerzetten via
 * `placeItem`, weghalen via `clearSlot`, en `room:{id}` door de ORM-logger heen
 * (§5, de TABLES-regel) — niet met een query op de tabel die toevallig klopt.
 *
 *   E1.  De lade en het Keeper-slot.
 *   —    Koop ongedaan maken.
 *   E10. Verplaatsen.
 *   E5.  Een plek op slot als handeling in de winkel.
 *   —    Het feed: kopen, openen en uitdelen.
 */

const dir = mkdtempSync(join(tmpdir(), 'zcf-ronde54-lade-'));
process.env.DATA_DIR = dir;

type Kamers = typeof import('@/lib/kamers/service');
type Changes = typeof import('@/lib/live/changes');

let kamers: Kamers;
let changes: Changes;
let sqlite: typeof import('@/lib/db').sqlite;
let HUISRAAD: string;

const KEEPER = { id: 'keeper-1', isKeeper: true };
const BRAM = { id: 'bram', isKeeper: false };
const AAGJE = { id: 'aagje', isKeeper: false };

const run = (sql: string, ...args: unknown[]) => sqlite.prepare(sql).run(...args);

const slotAt = (roomId: string, kind: string, open: boolean, nth = 0) =>
  (
    sqlite
      .prepare(
        `SELECT id FROM room_slots WHERE room_id = ? AND kind = ? AND unlocked_at IS ${open ? 'NOT ' : ''}NULL
         ORDER BY sort_order`,
      )
      .all(roomId, kind) as { id: string }[]
  )[nth];

const slot = (id: string) =>
  sqlite.prepare('SELECT entry_id AS entryId, claim FROM room_slots WHERE id = ?').get(id) as {
    entryId: string | null;
    claim: string | null;
  };

const drawer = (roomId: string) =>
  (sqlite.prepare('SELECT entry_id AS entryId FROM room_drawer WHERE room_id = ?').all(roomId) as {
    entryId: string;
  }[]).map((row) => row.entryId);

const heard = (write: () => void): string[] => {
  const got: string[] = [];
  changes.flushChanges();
  changes.setChangeDelivery((keys) => got.push(...keys));
  try {
    write();
    changes.flushChanges();
  } finally {
    changes.setChangeDelivery(() => undefined);
  }
  return got;
};

let ROOM: string;
let ROOM_B: string;

beforeAll(async () => {
  const dbModule = await import('@/lib/db');
  sqlite = dbModule.sqlite;
  kamers = await import('@/lib/kamers/service');
  changes = await import('@/lib/live/changes');
  const shape = await import('@/lib/kamers/shape');

  for (const [id, name, keeper] of [
    ['keeper-1', 'Keeper', 1],
    ['bram', 'Bram', 0],
    ['aagje', 'Aagje', 0],
  ] as const) {
    run(
      `INSERT INTO users (id, username, username_lower, password_hash, is_keeper) VALUES (?, ?, ?, 'x', ?)`,
      id,
      name,
      name.toLowerCase(),
      keeper,
    );
  }

  const entry = (id: string, typeId: string, name: string, slug: string, fields: object = {}) =>
    run(
      `INSERT INTO entries (id, type_id, name, slug, fields, tags, visibility, created_by, view_mode, edit_mode)
       VALUES (?, ?, ?, ?, ?, '[]', 'all', 'keeper-1', 'all', 'all')`,
      id,
      typeId,
      name,
      slug,
      JSON.stringify(fields),
    );

  HUISRAAD = (sqlite.prepare("SELECT id FROM entry_types WHERE slug = 'huisraad'").get() as { id: string }).id;
  const ITEM = (sqlite.prepare("SELECT id FROM entry_types WHERE slug = 'item'").get() as { id: string }).id;
  // Een tweede soort huisraad waarvan er maar één in de wereld is.
  run(
    `INSERT INTO entry_types (id, slug, label, icon, colour, fields, sort_order, keeper_made, one_of_a_kind)
     SELECT 'type-uniek', 'uniek-huisraad', 'Uniek huisraad', icon, colour, fields, 99, 1, 1
       FROM entry_types WHERE id = ?`,
    HUISRAAD,
  );

  entry('e-bram', 'investigator', 'Bram Verhulst', 'bram-verhulst');
  entry('e-aagje', 'investigator', 'Aagje Nel', 'aagje-nel');
  run(`INSERT INTO user_characters (user_id, entry_id, sort_order) VALUES ('bram', 'e-bram', 0)`);
  run(`INSERT INTO user_characters (user_id, entry_id, sort_order) VALUES ('aagje', 'e-aagje', 0)`);

  entry('h-stoel', HUISRAAD, 'Leesstoel', 'leesstoel', {
    [shape.VOORWERP_FIELD_KEY]: ['bureau', 'plank'],
    [shape.PRICE_FIELD_KEY]: 1,
    [shape.EFFECT_FIELD_KEY]: 'Een plek om te lezen.',
  });
  entry('h-kast', HUISRAAD, 'Kaartenkast', 'kaartenkast', {
    [shape.VOORWERP_FIELD_KEY]: ['plank'],
    [shape.PRICE_FIELD_KEY]: 6,
  });
  entry('h-kistje', HUISRAAD, 'Reiskist', 'reiskist', {
    [shape.VOORWERP_FIELD_KEY]: ['kist'],
    [shape.PRICE_FIELD_KEY]: 2,
  });
  entry('u-bel', 'type-uniek', 'Scheepsbel', 'scheepsbel', {
    [shape.VOORWERP_FIELD_KEY]: ['plank'],
    [shape.PRICE_FIELD_KEY]: 3,
  });
  entry('v-lantaarn', ITEM, 'Lantaarn', 'lantaarn', { [shape.VOORWERP_FIELD_KEY]: ['plank'] });
});

beforeEach(() => {
  run('DELETE FROM room_ledger');
  run('DELETE FROM room_slots');
  run('DELETE FROM room_drawer');
  run('DELETE FROM rooms');
  run('DELETE FROM activity');
  ROOM = kamers.getOrCreateRoom('e-bram')!;
  ROOM_B = kamers.getOrCreateRoom('e-aagje')!;
});

/* ================================================================ E1 */

describe('§93 E1: een speler zet alleen neer wat hij bezit', () => {
  it('refuses huisraad nobody bought, and leaves the balance alone', () => {
    kamers.grant(ROOM, 4, 'sparen', KEEPER);
    const plank = slotAt(ROOM, 'plank', true)!;
    expect(() => kamers.placeItem(plank.id, 'h-kast', BRAM)).toThrow(/heb je niet/);
    expect(slot(plank.id).entryId).toBeNull();
    expect(kamers.balanceOf(ROOM)).toBe(4);
  });

  it('does not offer it under "Wat je al hebt" either — the picker asks the same question', () => {
    const offered = kamers.placeCandidates(ROOM, 'plank', BRAM).map((row) => row.id);
    expect(offered).not.toContain('h-kast');
    expect(offered).not.toContain('h-stoel');
    // Een gevonden voorwerp staat er wel, zoals altijd.
    expect(offered).toContain('v-lantaarn');
  });

  it('lets the Keeper put anything down — he hands it out', () => {
    const plank = slotAt(ROOM, 'plank', true)!;
    expect(() => kamers.placeItem(plank.id, 'h-kast', KEEPER)).not.toThrow();
    expect(slot(plank.id).entryId).toBe('h-kast');
    expect(kamers.balanceOf(ROOM)).toBe(0);
    expect(kamers.placeCandidates(ROOM, 'plank', KEEPER).map((row) => row.id)).toContain('h-stoel');
  });

  it('puts a bought thing in the lade when it is taken off, and lets the owner put it back', () => {
    kamers.grant(ROOM, 1, 'sparen', KEEPER);
    const bureau = slotAt(ROOM, 'bureau', true)!;
    kamers.buyFurnishing(bureau.id, 'h-stoel', BRAM);
    expect(kamers.clearSlot(bureau.id, BRAM)).toEqual({ toDrawer: true });
    expect(drawer(ROOM)).toEqual(['h-stoel']);

    const offered = kamers.placeCandidates(ROOM, 'plank', BRAM);
    expect(offered[0]).toMatchObject({ id: 'h-stoel', inDrawer: 1 });

    const plank = slotAt(ROOM, 'plank', true)!;
    kamers.placeItem(plank.id, 'h-stoel', BRAM);
    expect(slot(plank.id).entryId).toBe('h-stoel');
    expect(drawer(ROOM)).toEqual([]);
    // Eén exemplaar, één keer neerzetten: de tweede plek krijgt hem niet gratis.
    expect(() => kamers.placeItem(bureau.id, 'h-stoel', BRAM)).toThrow(/heb je niet/);
  });

  it('keeps the lade per kamer: Aagje cannot put down what lies in Bram’s', () => {
    run(`INSERT INTO room_drawer (id, room_id, entry_id) VALUES ('d1', ?, 'h-stoel')`, ROOM);
    expect(kamers.placeCandidates(ROOM_B, 'plank', AAGJE).map((row) => row.id)).not.toContain('h-stoel');
    expect(() => kamers.placeItem(slotAt(ROOM_B, 'plank', true)!.id, 'h-stoel', AAGJE)).toThrow(/heb je niet/);
  });

  it('lets a found voorwerp go back into the world, not into the lade', () => {
    const plank = slotAt(ROOM, 'plank', true)!;
    kamers.placeItem(plank.id, 'v-lantaarn', BRAM);
    expect(kamers.clearSlot(plank.id, BRAM)).toEqual({ toDrawer: false });
    expect(drawer(ROOM)).toEqual([]);
    expect(kamers.placeCandidates(ROOM_B, 'plank', AAGJE).map((row) => row.id)).toContain('v-lantaarn');
  });

  it('never overwrites a filled plek any more — what lay there would belong to nobody', () => {
    const plank = slotAt(ROOM, 'plank', true)!;
    kamers.placeItem(plank.id, 'h-kast', KEEPER);
    expect(() => kamers.placeItem(plank.id, 'h-stoel', KEEPER)).toThrow(/ligt al iets/);
    expect(slot(plank.id).entryId).toBe('h-kast');
  });

  it('keeps a one-of-a-kind thing spoken for while it lies in somebody’s lade', () => {
    const plank = slotAt(ROOM, 'plank', true)!;
    kamers.placeItem(plank.id, 'u-bel', KEEPER);
    kamers.clearSlot(plank.id, BRAM);
    expect(slot(plank.id).claim).toBeNull();
    expect(kamers.claimedIds().has('u-bel')).toBe(true);
    // De winkel van Aagje zegt dat een ander hem heeft; haar catalogus biedt hem niet aan.
    const row = kamers.shopFor(AAGJE, ROOM_B).items.find((item) => item.id === 'u-bel')!;
    expect(row.takenElsewhere).toBe(true);
    expect(kamers.catalogueFor('plank', AAGJE).map((item) => item.id)).not.toContain('u-bel');
    // En Bram zet hem vanuit zijn lade weer neer; de claim komt terug.
    kamers.placeItem(plank.id, 'u-bel', BRAM);
    expect(slot(plank.id).claim).toBe('u-bel');
    expect(drawer(ROOM)).toEqual([]);
  });

  it('says in the shop what lies only in the lade', () => {
    run(`INSERT INTO room_drawer (id, room_id, entry_id) VALUES ('d1', ?, 'h-stoel')`, ROOM);
    const row = kamers.shopFor(BRAM, ROOM).items.find((item) => item.id === 'h-stoel')!;
    expect(row).toMatchObject({ owned: true, ownedCount: 1, drawerCount: 1 });
  });

  it('shows the lade on the kamer, per viewer', () => {
    run(`INSERT INTO room_drawer (id, room_id, entry_id) VALUES ('d1', ?, 'h-stoel')`, ROOM);
    run(`INSERT INTO room_drawer (id, room_id, entry_id) VALUES ('d2', ?, 'h-stoel')`, ROOM);
    const room = kamers.viewRoomBySlug('bram-verhulst', BRAM)!;
    expect(room.drawer).toEqual([{ id: 'h-stoel', name: 'Leesstoel', slug: 'leesstoel', count: 2 }]);
  });
});

describe('§93: room:{id} beweegt ook bij de lade (§5, de TABLES-regel)', () => {
  it('moves when something goes into the lade and when it comes out again', () => {
    const plank = slotAt(ROOM, 'plank', true)!;
    kamers.placeItem(plank.id, 'h-kast', KEEPER);
    const into = heard(() => kamers.clearSlot(plank.id, BRAM));
    expect(into).toContain(`room:${ROOM}`);
    // Neerzetten uit de lade: de DELETE noemt de kamer óók.
    const out = heard(() => kamers.placeItem(plank.id, 'h-kast', BRAM));
    expect(out.filter((key) => key === `room:${ROOM}`).length).toBeGreaterThan(0);
    const deletes = changes.keysOfStatement(
      'delete from "room_drawer" where ("room_drawer"."id" = ? and "room_drawer"."room_id" = ?)',
      ['d1', ROOM],
    );
    expect(deletes).toContain(`room:${ROOM}`);
  });

  it('moves when the Keeper flips one_of_a_kind and the claims are reset', async () => {
    const types = await import('@/lib/admin/types');
    const plank = slotAt(ROOM, 'plank', true)!;
    kamers.placeItem(plank.id, 'h-kast', KEEPER);
    try {
      const got = heard(() => types.updateType(HUISRAAD, { oneOfAKind: true }, KEEPER.id));
      expect(got).toContain(`room:${ROOM}`);
      expect(slot(plank.id).claim).toBe('h-kast');
    } finally {
      types.updateType(HUISRAAD, { oneOfAKind: false }, KEEPER.id);
    }
  });
});

/* ======================================================= ongedaan maken */

describe('§93: een koop ongedaan maken', () => {
  const lines = (roomId: string) =>
    sqlite
      .prepare('SELECT kind, delta, reason FROM room_ledger WHERE room_id = ? ORDER BY rowid')
      .all(roomId) as { kind: string; delta: number; reason: string }[];

  it('takes the thing off its plek and gives the munten back — as a line added', () => {
    kamers.grant(ROOM, 5, 'sparen', KEEPER);
    const bureau = slotAt(ROOM, 'bureau', true)!;
    kamers.buyFurnishing(bureau.id, 'h-stoel', BRAM);
    expect(kamers.balanceOf(ROOM)).toBe(4);

    expect(kamers.undoPurchase(ROOM, 'h-stoel', BRAM)).toEqual({ returned: 1, name: 'Leesstoel' });
    expect(slot(bureau.id).entryId).toBeNull();
    expect(kamers.balanceOf(ROOM)).toBe(5);
    expect(lines(ROOM).map((line) => [line.kind, line.delta])).toEqual([
      ['grant', 5],
      ['item', -1],
      ['return', 1],
    ]);
    // Geen feedregel voor iets dat niet gebeurd is.
    expect(sqlite.prepare("SELECT COUNT(*) AS n FROM activity WHERE verb = 'room.bought'").get()).toEqual({ n: 0 });
  });

  it('refuses a second undo, somebody else’s, and one that is too late', () => {
    kamers.grant(ROOM, 5, 'sparen', KEEPER);
    const bureau = slotAt(ROOM, 'bureau', true)!;
    kamers.buyFurnishing(bureau.id, 'h-stoel', BRAM);
    // Een ander (de Keeper mag de kamer inrichten, maar hij kocht niet).
    expect(() => kamers.undoPurchase(ROOM, 'h-stoel', KEEPER)).toThrow(/wie het kocht/);
    // Aagje mag deze kamer niet eens inrichten.
    expect(() => kamers.undoPurchase(ROOM, 'h-stoel', AAGJE)).toThrow(/jouw kamer niet/);
    kamers.undoPurchase(ROOM, 'h-stoel', BRAM);
    expect(() => kamers.undoPurchase(ROOM, 'h-stoel', BRAM)).toThrow(/niets terug/);
    expect(kamers.balanceOf(ROOM)).toBe(5);

    kamers.buyFurnishing(bureau.id, 'h-stoel', BRAM);
    // Alle regels een minuut terug, zodat de volgorde blijft en alleen de klok verschuift.
    run(`UPDATE room_ledger SET created_at = created_at - 60`);
    expect(() => kamers.undoPurchase(ROOM, 'h-stoel', BRAM)).toThrow(/vlak na het kopen/);
    expect(slot(bureau.id).entryId).toBe('h-stoel');
    expect(kamers.balanceOf(ROOM)).toBe(4);
  });

  it('finds it in the lade when it was taken off in the meantime', () => {
    kamers.grant(ROOM, 5, 'sparen', KEEPER);
    const bureau = slotAt(ROOM, 'bureau', true)!;
    kamers.buyFurnishing(bureau.id, 'h-stoel', BRAM);
    kamers.clearSlot(bureau.id, BRAM);
    kamers.undoPurchase(ROOM, 'h-stoel', BRAM);
    expect(drawer(ROOM)).toEqual([]);
    expect(kamers.balanceOf(ROOM)).toBe(5);
  });

  it('veils a return line exactly like the purchase it undoes (§83)', () => {
    kamers.grant(ROOM, 5, 'sparen', KEEPER);
    kamers.buyFurnishing(slotAt(ROOM, 'bureau', true)!.id, 'h-stoel', BRAM);
    kamers.undoPurchase(ROOM, 'h-stoel', BRAM);
    run(`UPDATE entries SET visibility = 'keeper' WHERE id = 'h-stoel'`);
    try {
      const seen = kamers.ledgerOf(ROOM, BRAM);
      expect(seen.filter((line) => line.kind === 'return' || line.kind === 'item').every((line) => line.veiled)).toBe(
        true,
      );
    } finally {
      run(`UPDATE entries SET visibility = 'all' WHERE id = 'h-stoel'`);
    }
  });
});

/* =============================================================== E10 */

describe('§93 E10: verplaatsen', () => {
  it('moves a thing to an open, empty plek of a kind it fits, in one go', () => {
    const bureau = slotAt(ROOM, 'bureau', true)!;
    const plank = slotAt(ROOM, 'plank', true)!;
    kamers.placeItem(bureau.id, 'h-stoel', KEEPER);
    const got = heard(() => kamers.moveItem(bureau.id, plank.id, BRAM));
    expect(got).toContain(`room:${ROOM}`);
    expect(slot(bureau.id).entryId).toBeNull();
    expect(slot(plank.id).entryId).toBe('h-stoel');
    // Een tweede klik verplaatst niets.
    expect(() => kamers.moveItem(bureau.id, plank.id, BRAM)).toThrow(/Daar ligt niets/);
  });

  it('carries the claim of a one-of-a-kind thing along', () => {
    kamers.grant(ROOM, 5, 'sparen', KEEPER);
    const plank = slotAt(ROOM, 'plank', true)!;
    kamers.unlockSlot(slotAt(ROOM, 'plank', false)!.id, BRAM);
    const second = slotAt(ROOM, 'plank', true, 1)!;
    kamers.placeItem(plank.id, 'u-bel', KEEPER);
    kamers.moveItem(plank.id, second.id, BRAM);
    expect(slot(second.id)).toEqual({ entryId: 'u-bel', claim: 'u-bel' });
    expect(slot(plank.id)).toEqual({ entryId: null, claim: null });
  });

  it('refuses a locked plek, a filled one, one it does not fit, and a stranger', () => {
    const bureau = slotAt(ROOM, 'bureau', true)!;
    const plank = slotAt(ROOM, 'plank', true)!;
    const muur = slotAt(ROOM, 'muur', true)!;
    kamers.placeItem(bureau.id, 'h-stoel', KEEPER);
    kamers.placeItem(plank.id, 'h-kast', KEEPER);
    expect(() => kamers.moveItem(bureau.id, slotAt(ROOM, 'plank', false)!.id, BRAM)).toThrow(/op slot/);
    expect(() => kamers.moveItem(bureau.id, plank.id, BRAM)).toThrow(/ligt al iets/);
    expect(() => kamers.moveItem(bureau.id, muur.id, BRAM)).toThrow(/niet op die plek/);
    expect(() => kamers.moveItem(bureau.id, slotAt(ROOM_B, 'plank', true)!.id, BRAM)).toThrow(/bestaat niet/);
    expect(() => kamers.moveItem(bureau.id, muur.id, AAGJE)).toThrow(/jouw kamer niet/);
    expect(slot(bureau.id).entryId).toBe('h-stoel');
  });
});

/* ================================================================ E5 */

describe('§93 E5: geen vrije plek wordt een handeling', () => {
  it('names the cheapest locked plek of a kind the thing fits', () => {
    const row = kamers.shopFor(BRAM, ROOM).items.find((item) => item.id === 'h-kistje')!;
    expect(row.landsIn).toEqual({});
    const kist = slotAt(ROOM, 'kist', false)!;
    expect(row.opens).toEqual({ slotId: kist.id, kind: 'kist', price: 5 });
  });

  it('names nothing once there is a free plek', () => {
    kamers.grant(ROOM, 5, 'sparen', KEEPER);
    kamers.unlockSlot(slotAt(ROOM, 'kist', false)!.id, BRAM);
    const row = kamers.shopFor(BRAM, ROOM).items.find((item) => item.id === 'h-kistje')!;
    expect(row.opens).toBeNull();
    expect(Object.keys(row.landsIn)).toEqual(['kist']);
  });
});

/* =========================================================== het feed */

describe('§93: kopen, openen en uitdelen staan in het feed, onder de juiste onderzoeker', () => {
  const last = (verb: string) =>
    sqlite
      .prepare('SELECT character_id AS characterId, entry_id AS entryId FROM activity WHERE verb = ? ORDER BY rowid DESC')
      .get(verb) as { characterId: string | null; entryId: string | null } | undefined;

  it('writes room.bought and room.opened with the kamer’s onderzoeker', () => {
    kamers.grant(ROOM, 10, 'sparen', KEEPER);
    kamers.buyFurnishing(slotAt(ROOM, 'bureau', true)!.id, 'h-stoel', BRAM);
    expect(last('room.bought')).toEqual({ characterId: 'e-bram', entryId: 'h-stoel' });
    kamers.unlockSlot(slotAt(ROOM, 'plank', false)!.id, BRAM);
    // Een plek is geen artikel: het ding van de regel is de onderzoeker zelf.
    expect(last('room.opened')).toEqual({ characterId: 'e-bram', entryId: 'e-bram' });
  });

  it('writes one room.granted per kamer for an uitdeling, each with its onderzoeker', () => {
    kamers.handOut(
      [
        { roomId: ROOM, delta: 2 },
        { roomId: ROOM_B, delta: 3 },
      ],
      'samen',
      KEEPER,
    );
    const rows = sqlite
      .prepare("SELECT character_id AS characterId FROM activity WHERE verb = 'room.granted' ORDER BY character_id")
      .all() as { characterId: string }[];
    expect(rows.map((row) => row.characterId)).toEqual(['e-aagje', 'e-bram']);
  });

  it('reads as what happened', () => {
    expect(roomFeedPhrase('room.bought', 'Bram Verhulst', false, DEFAULT_WORDS)).toEqual({
      verb: 'kocht',
      tail: 'in de kamer van Bram Verhulst',
    });
    expect(roomFeedPhrase('room.opened', null, true, DEFAULT_WORDS)?.verb).toBe('opende een plek in de kamer van');
  });
});

/* ================================================================ E24 */

describe('§93 E24: het Nieuw-blad vraagt plek, prijs en effect', () => {
  it('picks exactly those three fields, in that order, or none', () => {
    const fields = [
      { key: 'effect', label: 'Wat het geeft' },
      { key: 'plek', label: 'Plek' },
      { key: 'notitie', label: 'Notitie' },
      { key: 'prijs', label: 'Prijs' },
    ];
    expect(shopFieldsOf(fields)?.map((field) => field.key)).toEqual(['plek', 'prijs', 'effect']);
    expect(shopFieldsOf(fields.filter((field) => field.key !== 'prijs'))).toBeNull();
    expect(shopFieldsOf(undefined)).toBeNull();
  });
});

/* ========================================================== migratie */

describe('§93: migratie 0033', () => {
  it('may run twice and invents no ownership', async () => {
    const { MIGRATIONS } = await import('@/lib/db/migrations.mjs');
    const migration = (MIGRATIONS as { name: string; sql: string }[]).find((m) => m.name.startsWith('0033_'))!;
    expect(migration.name).toBe('0033_de_lade');
    expect(() => sqlite.exec(migration.sql)).not.toThrow();
    expect(migration.sql).not.toMatch(/INSERT/i);
  });
});
