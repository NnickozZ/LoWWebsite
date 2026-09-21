import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { roomFeedPhrase } from '@/components/kamer/plekWords';
import { landing } from '@/components/winkel/WinkelRij';
import type { ShopItem } from '@/lib/kamers/service';
import { DEFAULT_WORDS } from '@/lib/words';

/**
 * §90 (ronde 51, "De deuren"): de economie-helft.
 *
 * Vier dingen die een service- of lib-wijziging waren, en elk wordt gevraagd
 * langs de weg die de app loopt — niet langs de kortste weg naar het antwoord
 * (§86's tweede les):
 *
 *   E2. `/winkel` zonder `?kamer=` koopt voor het karakter dat je nú speelt,
 *       dezelfde kamer als de beurs (`purseOf`), en niet voor `rooms[0]`.
 *   E7. `room:{id}` beweegt — gevraagd van de échte schrijvers (`placeItem`,
 *       `clearSlot`, `grant`, `unlockSlot`) door de ORM-logger heen, want een
 *       mapping die klopt terwijl de UPDATE de kamer niet noemt is §83's fout.
 *   E3. `openRoomFor` weigert een artikel dat geen onderzoeker kan zijn.
 *   E21. een `room.*`-regel schrijft de onderzoeker van de kamer mee.
 */

const dir = mkdtempSync(join(tmpdir(), 'zcf-ronde51-economie-'));
process.env.DATA_DIR = dir;

type Kamers = typeof import('@/lib/kamers/service');
type Changes = typeof import('@/lib/live/changes');

let kamers: Kamers;
let changes: Changes;
let sqlite: typeof import('@/lib/db').sqlite;
let HUISRAAD: string;

const KEEPER = { id: 'keeper-1', isKeeper: true };
/** Elsje draagt er twee: Kramer (eerst in de volgorde) en Bertus. */
const ELSJE = { id: 'elsje', isKeeper: false };

const run = (sql: string, ...args: unknown[]) => sqlite.prepare(sql).run(...args);

const slotAt = (roomId: string, kind: string, open: boolean) =>
  sqlite
    .prepare(
      `SELECT id FROM room_slots WHERE room_id = ? AND kind = ? AND unlocked_at IS ${open ? 'NOT ' : ''}NULL
       ORDER BY sort_order LIMIT 1`,
    )
    .get(roomId, kind) as { id: string } | undefined;

beforeAll(async () => {
  const dbModule = await import('@/lib/db');
  sqlite = dbModule.sqlite;
  kamers = await import('@/lib/kamers/service');
  changes = await import('@/lib/live/changes');
  const shape = await import('@/lib/kamers/shape');

  for (const [id, name, keeper] of [
    ['keeper-1', 'Keeper', 1],
    ['elsje', 'Elsje', 0],
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

  entry('e-kramer', 'investigator', 'Dr. Elsje Kramer', 'dr-elsje-kramer');
  entry('e-bertus', 'investigator', 'Bertus Slabbekoorn', 'bertus-slabbekoorn');
  run(`INSERT INTO user_characters (user_id, entry_id, sort_order) VALUES ('elsje', 'e-kramer', 0)`);
  run(`INSERT INTO user_characters (user_id, entry_id, sort_order) VALUES ('elsje', 'e-bertus', 1)`);

  /* De veerman: een onderzoeker die niemand draagt — §86's geval. */
  entry('e-veerman', 'investigator', 'De veerman', 'de-veerman');
  /* E3's eigen geval: een Persoon, een locatie en een stuk huisraad. */
  entry('p-adriaan', 'character', 'Adriaan Sinke', 'adriaan-sinke');
  entry('l-domburg', 'location', 'Domburg', 'domburg');
  entry('h-stoel', HUISRAAD, 'Leesstoel', 'leesstoel', {
    [shape.VOORWERP_FIELD_KEY]: ['bureau', 'plank'],
    [shape.PRICE_FIELD_KEY]: 1,
    [shape.EFFECT_FIELD_KEY]: 'Een plek om te lezen.\nRust',
  });
});

beforeEach(() => {
  run('DELETE FROM room_ledger');
  run('DELETE FROM room_slots');
  run('DELETE FROM rooms');
  run('DELETE FROM activity');
  run(`UPDATE users SET active_character_id = NULL WHERE id = 'elsje'`);
});

/* ============================================================ E2: de winkel */

describe('§90 E2: de winkel koopt voor wie je nu speelt', () => {
  it('picks the kamer of the active karakter when handed nothing — not the first in the list', () => {
    run(`UPDATE users SET active_character_id = 'e-bertus' WHERE id = 'elsje'`);
    const rooms = kamers.roomsOf(ELSJE);
    expect(rooms.map((room) => room.name)).toEqual(['Dr. Elsje Kramer', 'Bertus Slabbekoorn']);

    const shop = kamers.shopFor(ELSJE);
    const purse = kamers.purseOf(ELSJE);
    expect(purse?.name).toBe('Bertus Slabbekoorn');
    // De winkel en de beurs lezen dezelfde kamer.
    expect(shop.roomId).toBe(purse?.roomId);
    expect(shop.roomId).toBe(rooms[1].id);
  });

  it('follows the karakter when it changes', () => {
    run(`UPDATE users SET active_character_id = 'e-kramer' WHERE id = 'elsje'`);
    const rooms = kamers.roomsOf(ELSJE);
    expect(kamers.shopFor(ELSJE).roomId).toBe(rooms[0].id);
    run(`UPDATE users SET active_character_id = 'e-bertus' WHERE id = 'elsje'`);
    expect(kamers.shopFor(ELSJE).roomId).toBe(rooms[1].id);
  });

  it('still honours an explicit ?kamer= over the active one', () => {
    run(`UPDATE users SET active_character_id = 'e-bertus' WHERE id = 'elsje'`);
    const rooms = kamers.roomsOf(ELSJE);
    expect(kamers.shopFor(ELSJE, rooms[0].id).roomId).toBe(rooms[0].id);
  });

  it('falls back to the active karakter, not the first, for an id that is not yours', () => {
    run(`UPDATE users SET active_character_id = 'e-bertus' WHERE id = 'elsje'`);
    const rooms = kamers.roomsOf(ELSJE);
    expect(kamers.shopFor(ELSJE, 'bestaat-niet').roomId).toBe(rooms[1].id);
  });

  it('falls back to the first when nobody is being played', () => {
    const rooms = kamers.roomsOf(ELSJE);
    expect(kamers.shopFor(ELSJE).roomId).toBe(rooms[0].id);
  });
});

/* ============================================================ E7: live */

/**
 * De mapping zelf (`keysOfStatement`) én de schrijvers die hem moeten raken.
 * Het tweede is het belangrijke: `room_slots` in `TABLES` zetten helpt niets
 * als de UPDATE van `placeItem` alleen `id = ?` bindt — dan staat er een
 * sleutel in de tabel waar nooit een kamer-id langskomt.
 */
describe('§90 E7: room:{id} beweegt', () => {
  it('maps the three tables onto the kamer key', () => {
    const { keysOfStatement } = changes;
    expect(keysOfStatement('insert into "rooms" ("id", "entry_id") values (?, ?)', ['r1', 'e1'])).toContain(
      'room:r1',
    );
    expect(
      keysOfStatement('insert into "room_ledger" ("id", "room_id", "delta") values (?, ?, ?)', ['l1', 'r1', 5]),
    ).toContain('room:r1');
    expect(
      keysOfStatement(
        'update "room_slots" set "entry_id" = ? where ("room_slots"."id" = ? and "room_slots"."room_id" = ?)',
        ['h1', 's1', 'r1'],
      ),
    ).toContain('room:r1');
    // En een UPDATE die de kamer níét noemt, levert ook geen kamer op: dáárom
    // noemen de schrijvers hem.
    expect(
      keysOfStatement('update "room_slots" set "entry_id" = ? where "room_slots"."id" = ?', ['h1', 's1']),
    ).not.toContain('room:r1');
  });

  /** Wat de échte schrijvers door de ORM-logger heen laten horen. */
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

  it('moves when something is put down, taken off, given and unlocked', () => {
    const roomId = kamers.getOrCreateRoom('e-kramer')!;
    const bureau = slotAt(roomId, 'bureau', true)!;

    expect(heard(() => kamers.placeItem(bureau.id, 'h-stoel', ELSJE))).toContain(`room:${roomId}`);
    expect(heard(() => kamers.clearSlot(bureau.id, ELSJE))).toContain(`room:${roomId}`);
    expect(heard(() => kamers.grant(roomId, 20, 'Sessie 3', KEEPER))).toContain(`room:${roomId}`);

    const dicht = slotAt(roomId, 'plank', false)!;
    expect(heard(() => kamers.unlockSlot(dicht.id, ELSJE))).toContain(`room:${roomId}`);
    expect(heard(() => kamers.buyFurnishing(bureau.id, 'h-stoel', ELSJE))).toContain(`room:${roomId}`);
  });

  it('moves only the kamer that changed', () => {
    const kramer = kamers.getOrCreateRoom('e-kramer')!;
    const bertus = kamers.getOrCreateRoom('e-bertus')!;
    const keys = heard(() => kamers.grant(kramer, 3, 'alleen Kramer', KEEPER));
    expect(keys).toContain(`room:${kramer}`);
    expect(keys).not.toContain(`room:${bertus}`);
  });
});

/* ============================================================ E3: kamer maken */

describe('§90 E3: een kamer alleen voor wie een onderzoeker kan zijn', () => {
  it('refuses a Persoon nobody at this table wears, a locatie and a stuk huisraad', () => {
    expect(kamers.mayHoldRoom('p-adriaan')).toBe(false);
    expect(kamers.openRoomFor('p-adriaan', KEEPER)).toBeNull();
    expect(kamers.openRoomFor('l-domburg', KEEPER)).toBeNull();
    expect(kamers.openRoomFor('h-stoel', KEEPER)).toBeNull();
    // En er is ook echt niets ontstaan.
    for (const id of ['p-adriaan', 'l-domburg', 'h-stoel']) expect(kamers.roomIdFor(id)).toBeNull();
  });

  it('opens one for an onderzoeker nobody wears', () => {
    expect(kamers.mayHoldRoom('e-veerman')).toBe(true);
    expect(kamers.openRoomFor('e-veerman', KEEPER)).toBeTruthy();
  });

  /**
   * *Dit is mijn karakter* vraagt niet naar de soort: een speler kan een Persoon
   * als karakter aandoen (de e2e-helpers doen precies dat). Aan zo'n tafel ís
   * een Persoon een soort die een karakter kan zijn, en dan mag de Keeper er
   * ook een kamer voor maken.
   */
  it('counts a soort as a karakter-soort once somebody at the table wears one', () => {
    run(
      `INSERT INTO entries (id, type_id, name, slug, fields, tags, visibility, created_by, view_mode, edit_mode)
       VALUES ('p-gedragen', 'character', 'Een gedragen persoon', 'een-gedragen-persoon', '{}', '[]', 'all', 'keeper-1', 'all', 'all')`,
    );
    run(`INSERT INTO user_characters (user_id, entry_id, sort_order) VALUES ('elsje', 'p-gedragen', 2)`);
    try {
      expect(kamers.mayHoldRoom('p-adriaan')).toBe(true);
    } finally {
      run(`DELETE FROM user_characters WHERE entry_id = 'p-gedragen'`);
      run(`DELETE FROM entries WHERE id = 'p-gedragen'`);
    }
    expect(kamers.mayHoldRoom('p-adriaan')).toBe(false);
  });

  it('still refuses everybody but the Keeper', () => {
    expect(kamers.openRoomFor('e-veerman', ELSJE)).toBeNull();
  });
});

/* ============================================================ E21: het feed */

describe('§90 E21: een kamerhandeling staat op naam van de onderzoeker van die kamer', () => {
  const lastRow = (verb: string) =>
    sqlite.prepare('SELECT character_id AS characterId FROM activity WHERE verb = ? ORDER BY rowid DESC LIMIT 1').get(
      verb,
    ) as { characterId: string | null } | undefined;

  it('records the kamer’s onderzoeker, not the karakter the player happens to be wearing', () => {
    // Elsje speelt Bertus, en zet iets in Kramers kamer.
    run(`UPDATE users SET active_character_id = 'e-bertus' WHERE id = 'elsje'`);
    const kramer = kamers.getOrCreateRoom('e-kramer')!;
    const bureau = slotAt(kramer, 'bureau', true)!;

    kamers.placeItem(bureau.id, 'h-stoel', ELSJE);
    expect(lastRow('room.placed')?.characterId).toBe('e-kramer');

    kamers.clearSlot(bureau.id, ELSJE);
    expect(lastRow('room.cleared')?.characterId).toBe('e-kramer');

    kamers.grant(kramer, 2, 'Sessie 4', KEEPER);
    expect(lastRow('room.granted')?.characterId).toBe('e-kramer');
  });

  it('reads as what happened, and never names a kamer the reader may not see', () => {
    const w = DEFAULT_WORDS;
    expect(roomFeedPhrase('room.placed', 'Dr. Elsje Kramer', false, w)).toEqual({
      verb: w.feedRoomPlaced,
      tail: 'in de kamer van Dr. Elsje Kramer',
    });
    expect(roomFeedPhrase('room.cleared', null, true, w)).toEqual({
      verb: w.feedRoomCleared,
      tail: w.feedRoomOwnOut,
    });
    expect(roomFeedPhrase('room.placed', null, false, w)?.tail).toBe(w.feedRoomSome);
    // Een ander werkwoord laat het feed met rust.
    expect(roomFeedPhrase('entry.edited', 'Iemand', false, w)).toBeNull();
  });

  it('names the owner only through the reader’s own eyes', () => {
    run(`UPDATE entries SET visibility = 'keeper' WHERE id = 'e-veerman'`);
    try {
      expect(kamers.visibleNamesOf(['e-veerman', 'e-kramer'], ELSJE)).toEqual(
        new Map([['e-kramer', 'Dr. Elsje Kramer']]),
      );
      expect(kamers.visibleNamesOf(['e-veerman'], KEEPER).get('e-veerman')).toBe('De veerman');
    } finally {
      run(`UPDATE entries SET visibility = 'all' WHERE id = 'e-veerman'`);
    }
  });
});

/* ============================================================ E4 + E13 */

describe('§90 E4: kopen volgt het filter', () => {
  const item = (landsIn: ShopItem['landsIn']): ShopItem => ({
    id: 'x',
    name: 'Staande klok',
    slug: 'staande-klok',
    shortDescription: '',
    coverAssetId: null,
    plekken: ['muur', 'bureau'],
    price: 3,
    effect: [],
    unique: false,
    owned: false,
    ownedCount: 0,
    takenElsewhere: false,
    landsIn,
    affordable: true,
  });

  it('lands on the filtered kind when there is room there', () => {
    // De ladder zegt bureau eerst (de sleutelvolgorde), het filter zegt muur.
    const klok = item({ bureau: 'b1', muur: 'm1' });
    expect(landing(klok)).toEqual({ kind: 'bureau', slotId: 'b1' });
    expect(landing(klok, 'muur')).toEqual({ kind: 'muur', slotId: 'm1' });
  });

  it('falls back to the ladder when the filtered kind is full', () => {
    expect(landing(item({ bureau: 'b1' }), 'muur')).toEqual({ kind: 'bureau', slotId: 'b1' });
  });
});

describe('§90 E13: een gevulde tegel draagt zijn eerste effectregel', () => {
  it('puts the first line on the tile, and nothing when there is none', () => {
    const kramer = kamers.getOrCreateRoom('e-kramer')!;
    const bureau = slotAt(kramer, 'bureau', true)!;
    kamers.placeItem(bureau.id, 'h-stoel', ELSJE);
    const view = kamers.viewRoomBySlug('dr-elsje-kramer', ELSJE)!;
    const filled = view.slots.find((slot) => slot.id === bureau.id)!;
    expect(filled.item?.effect).toBe('Een plek om te lezen.');
  });
});
