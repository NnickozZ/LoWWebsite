import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';

/**
 * §83: het open grootboek, de uitdeling, en twee grenzen die te strak stonden.
 *
 * Four things are guarded here, and each is the half of a change that would be
 * invisible if it broke.
 *
 *   1. **The grootboek opened, and a veil opened with it.** A line of
 *      `kind: 'item'` carries the *name* of the artikel that was bought, so
 *      handing the ledger to everybody who may stand in the kamer is a road out
 *      for a secret the plek itself already hides (§76, §79, §80). So every
 *      assertion about the veil is made twice: once that the name is gone, and
 *      once that it is *there* for the pair of eyes that may see it. A veil
 *      that veils everything is not a bug anybody notices.
 *   2. **The uitdeling is all-or-nothing.** The failure mode is not "it
 *      refuses"; it is "it wrote four of the eight lines and then stopped",
 *      which nobody can see from the screen. Every refusal is therefore checked
 *      twice — the refusal, and the grootboek of every kamer it did *not*
 *      touch.
 *   3. **Zero is a full answer, and it is three answers that must agree.** A 0,
 *      a blank, and a row that was left out all mean *deze niet*. If one of
 *      them wrote a line the other two would be a trap.
 *   4. **Meerdere plekken.** `plekKinds` is the one reader, so it is asked
 *      about an array, about a bare string (an archive that missed migration
 *      `0029`), about rubbish, and about a mixture — and then the same question
 *      is asked of the kamer, the catalogue and the winkel, because §17's rule
 *      4 is that readers and writers say the same sentence.
 *
 * Asked of a real SQLite file: the transaction, the visibility condition and
 * the migration are all SQL.
 */

const dir = mkdtempSync(join(tmpdir(), 'zcf-uitdelen-'));
process.env.DATA_DIR = dir;

type Kamers = typeof import('@/lib/kamers/service');
type Shape = typeof import('@/lib/kamers/shape');
type PlekKind = import('@/lib/kamers/shape').PlekKind;

let kamers: Kamers;
let shape: Shape;
let canWatch: typeof import('@/lib/live/gate').canWatch;
let sqlite: typeof import('@/lib/db').sqlite;

const KEEPER = { id: 'keeper-1', isKeeper: true };
const BRAM = { id: 'bram', isKeeper: false };
const AAGJE = { id: 'aagje', isKeeper: false };
/** Daan wears two onderzoekers, so he has two purses (§82). */
const DAAN = { id: 'daan', isKeeper: false };

type SlotRow = {
  id: string;
  kind: PlekKind;
  sortOrder: number;
  price: number;
  unlockedAt: number | null;
  entryId: string | null;
  claim: string | null;
};

const slotsOf = (roomId: string) =>
  sqlite
    .prepare(
      `SELECT id, kind, sort_order AS sortOrder, price, unlocked_at AS unlockedAt,
              entry_id AS entryId, claim
       FROM room_slots WHERE room_id = ? ORDER BY sort_order`,
    )
    .all(roomId) as SlotRow[];

const plek = (roomId: string, sortOrder: number) => {
  const row = slotsOf(roomId).find((slot) => slot.sortOrder === sortOrder);
  if (!row) throw new Error(`geen plek op ${sortOrder}`);
  return row;
};

type LedgerRow = { id: string; delta: number; kind: string; reason: string; entryId: string | null };

/** The grootboek straight out of the table, in writing order. */
const ledgerRows = (roomId: string) =>
  sqlite
    .prepare(
      `SELECT id, delta, kind, reason, entry_id AS entryId
       FROM room_ledger WHERE room_id = ? ORDER BY rowid`,
    )
    .all(roomId) as LedgerRow[];

let FREE_BUREAU: number;
let FREE_PLANK: number;
let FREE_MUUR: number;
let PAID_PLANK: number;

let ROOM: string;
let ROOM_B: string;
let ROOM_D1: string;
let ROOM_D2: string;

beforeAll(async () => {
  const dbModule = await import('@/lib/db');
  sqlite = dbModule.sqlite;
  kamers = await import('@/lib/kamers/service');
  shape = await import('@/lib/kamers/shape');
  canWatch = (await import('@/lib/live/gate')).canWatch;
  const ties = await import('@/lib/keeper/ties');

  const firstRung = (kind: PlekKind, free: boolean) => {
    const at = shape.ROOM_SHAPE.findIndex((seed) => seed.kind === kind && (free ? seed.price === 0 : seed.price > 0));
    if (at < 0) throw new Error(`ROOM_SHAPE heeft geen ${free ? 'gratis' : 'betaalde'} ${kind}`);
    return at;
  };
  FREE_BUREAU = firstRung('bureau', true);
  FREE_PLANK = firstRung('plank', true);
  FREE_MUUR = firstRung('muur', true);
  PAID_PLANK = firstRung('plank', false);

  const run = (sql: string, ...args: unknown[]) => sqlite.prepare(sql).run(...args);

  for (const [id, name, keeper] of [
    ['keeper-1', 'Keeper', 1],
    ['bram', 'Bram', 0],
    ['aagje', 'Aagje', 0],
    ['daan', 'Daan', 0],
    ['weg', 'Weggestuurd', 0],
  ] as const) {
    run(
      `INSERT INTO users (id, username, username_lower, password_hash, password_enc, is_keeper) VALUES (?, ?, ?, 'x', 'x', ?)`,
      id,
      name,
      name.toLowerCase(),
      keeper,
    );
  }
  run(`UPDATE users SET is_disabled = 1 WHERE id = 'weg'`);

  const entry = (id: string, typeId: string, name: string, slug: string, fields: object, visibility = 'all') =>
    run(
      `INSERT INTO entries (id, type_id, name, slug, fields, tags, visibility, created_by, view_mode, edit_mode)
       VALUES (?, ?, ?, ?, ?, '[]', ?, 'keeper-1', 'all', 'all')`,
      id,
      typeId,
      name,
      slug,
      JSON.stringify(fields),
      visibility,
    );

  entry('e-bram', 'investigator', 'Bram Kuiper', 'bram-kuiper', {});
  entry('e-aagje', 'investigator', 'Aagje Nel', 'aagje-nel', {});
  entry('e-daan1', 'investigator', 'Daan de Oude', 'daan-de-oude', {});
  entry('e-daan2', 'investigator', 'Daan de Jonge', 'daan-de-jonge', {});
  /** Nobody wears this one, so there is no kamer and no purse to reach. */
  entry('e-los', 'investigator', 'De veerman', 'de-veerman', {});
  /** Worn by an account that was shut off: not a target either. */
  entry('e-weg', 'investigator', 'De verdwenene', 'de-verdwenene', {});

  run(`INSERT INTO user_characters (user_id, entry_id) VALUES ('bram', 'e-bram')`);
  run(`INSERT INTO user_characters (user_id, entry_id) VALUES ('aagje', 'e-aagje')`);
  run(`INSERT INTO user_characters (user_id, entry_id, sort_order) VALUES ('daan', 'e-daan1', 0)`);
  run(`INSERT INTO user_characters (user_id, entry_id, sort_order) VALUES ('daan', 'e-daan2', 1)`);
  run(`INSERT INTO user_characters (user_id, entry_id) VALUES ('weg', 'e-weg')`);

  const K = shape.VOORWERP_FIELD_KEY;
  const P = shape.PRICE_FIELD_KEY;
  const E = shape.EFFECT_FIELD_KEY;
  const HUISRAAD = (sqlite.prepare("SELECT id FROM entry_types WHERE slug = 'huisraad'").get() as { id: string }).id;

  /* §83: everything below stores `plek` the way migration 0029 leaves it — an array. */
  entry('h-stoel', HUISRAAD, 'Een leesstoel', 'leesstoel', { [K]: ['plank'], [P]: 3 });
  /** The round's own case: one thing, two kinds of plek. */
  entry('h-klok', HUISRAAD, 'Een staande klok', 'staande-klok', { [K]: ['muur', 'bureau'], [P]: 2, [E]: 'Hij slaat het uur.' });
  /** All four, to prove nothing caps the list at two. */
  entry('h-kaars', HUISRAAD, 'Een kaars', 'kaars', { [K]: ['muur', 'plank', 'bureau', 'kist'], [P]: 1 });
  /** An archive that never ran 0029: a bare string, still read (the safety net). */
  entry('h-oud', HUISRAAD, 'Een oude kast', 'oude-kast', { [K]: 'muur', [P]: 4 });
  /** Rubbish among the good: the good survives, the rubbish is dropped. */
  entry('h-half', HUISRAAD, 'Een halve waarheid', 'halve-waarheid', { [K]: ['zolder', 'plank'], [P]: 6 });
  /** §9: Keeper-only, and it is bought below so a ledger line carries its name. */
  entry('h-geheim', HUISRAAD, 'Een zwarte spiegel', 'zwarte-spiegel', { [K]: ['plank'], [P]: 2 }, 'keeper');
  /** §44: a real tweeling — the far side is the Keeper's, the near side nobody's secret. */
  entry('h-wiki', HUISRAAD, 'De barometer', 'barometer', { [K]: ['muur'], [P]: 2 });
  entry('h-prep', HUISRAAD, 'De barometer — Keeper', 'barometer-keeper', { [K]: ['muur'], [P]: 2 }, 'keeper');
  ties.linkTwin({ kind: 'entry', id: 'h-prep' }, { kind: 'entry', id: 'h-wiki' }, KEEPER.id);

  entry('v-lantaarn', 'item', 'Een koperen lantaarn', 'koperen-lantaarn', { [K]: ['plank'] });
  entry('n-persoon', 'character', 'Jan Bakker', 'jan-bakker', {});
});

beforeEach(() => {
  sqlite.prepare('DELETE FROM room_ledger').run();
  sqlite.prepare('DELETE FROM room_slots').run();
  sqlite.prepare('DELETE FROM rooms').run();
  ROOM = kamers.getOrCreateRoom('e-bram')!;
  ROOM_B = kamers.getOrCreateRoom('e-aagje')!;
  ROOM_D1 = kamers.getOrCreateRoom('e-daan1')!;
  ROOM_D2 = kamers.getOrCreateRoom('e-daan2')!;
});

/* ================================================= A. het open grootboek */

describe('§83: het grootboek is van iedereen die de kamer mag zien', () => {
  it('gives a player the same lines the Keeper reads', () => {
    kamers.grant(ROOM, 5, 'een sessie', KEEPER);
    kamers.unlockSlot(plek(ROOM, PAID_PLANK).id, BRAM);

    const mine = kamers.ledgerOf(ROOM, BRAM);
    const keepers = kamers.ledgerOf(ROOM, KEEPER);
    expect(mine.map((line) => [line.kind, line.delta])).toEqual(keepers.map((line) => [line.kind, line.delta]));
    expect(mine).toHaveLength(2);
  });

  /** A stranger may read it too — the door is the kamer's, not the ledger's. */
  it('answers a neighbour and a signed-out reader the same way', () => {
    kamers.grant(ROOM, 5, 'een sessie', KEEPER);
    expect(kamers.ledgerOf(ROOM, AAGJE)).toHaveLength(1);
    expect(kamers.ledgerOf(ROOM, null)).toHaveLength(1);
  });

  it('is newest first, which is the order a grootboek is read in', () => {
    kamers.grant(ROOM, 1, 'eerst', KEEPER);
    kamers.grant(ROOM, 2, 'daarna', KEEPER);
    expect(kamers.ledgerOf(ROOM, BRAM).map((line) => line.reason)).toEqual(['daarna', 'eerst']);
    expect(ledgerRows(ROOM).map((row) => row.reason)).toEqual(['eerst', 'daarna']);
  });
});

/* ------------------------------------------------- en de sluier erin (§76) */

describe('§83: een regel die iets noemt wat jij niet mag zien', () => {
  /** The Keeper buys it for them, so the line exists without anybody's eyes being wrong. */
  const buySecretly = (roomId: string, entryId: string, sortOrder: number) => {
    kamers.grant(roomId, 20, 'sparen', KEEPER);
    const owner = roomId === ROOM ? BRAM : AAGJE;
    if (plek(roomId, sortOrder).unlockedAt === null) kamers.unlockSlot(plek(roomId, sortOrder).id, owner);
    kamers.buyFurnishing(plek(roomId, sortOrder).id, entryId, KEEPER);
  };

  it('veils a Keeper-only artikel’s name, and only for the eyes that may not see it', () => {
    buySecretly(ROOM, 'h-geheim', FREE_PLANK);

    const seen = kamers.ledgerOf(ROOM, BRAM).find((line) => line.kind === 'item')!;
    expect(seen.veiled).toBe(true);
    expect(seen.reason).toBe('Een zwarte spiegel');

    const keepers = kamers.ledgerOf(ROOM, KEEPER).find((line) => line.kind === 'item')!;
    expect(keepers.veiled).toBe(false);
    expect(keepers.reason).toBe('Een zwarte spiegel');
  });

  /**
   * The security property, and the one worth having: the *reason* it is hidden
   * may not show. A Keeper-only thing (§9) and the far side of a tweeling (§44)
   * are the same answer.
   */
  it('gives the same answer for §9 and for §44', () => {
    buySecretly(ROOM, 'h-geheim', FREE_PLANK);
    buySecretly(ROOM_B, 'h-prep', FREE_MUUR);

    const mine = kamers.ledgerOf(ROOM, BRAM).find((line) => line.kind === 'item')!;
    const hers = kamers.ledgerOf(ROOM_B, BRAM).find((line) => line.kind === 'item')!;
    expect(mine.veiled).toBe(hers.veiled);
    expect(mine.delta).toBe(hers.delta);
  });

  it('leaves the near side of that tweeling alone: it is nobody’s secret', () => {
    buySecretly(ROOM, 'h-wiki', FREE_MUUR);
    const line = kamers.ledgerOf(ROOM, BRAM).find((entry) => entry.kind === 'item')!;
    expect(line.veiled).toBe(false);
    expect(line.reason).toBe('De barometer');
  });

  it('keeps the amount, because the balance already says it', () => {
    buySecretly(ROOM, 'h-geheim', FREE_PLANK);
    const line = kamers.ledgerOf(ROOM, BRAM).find((entry) => entry.kind === 'item')!;
    expect(line.delta).toBe(-2);
  });

  /** And never veils a line the Keeper wrote for the player to read. */
  it('never veils a grant or a plek', () => {
    kamers.grant(ROOM, 9, 'voor het oplossen van de zaak', KEEPER);
    kamers.unlockSlot(plek(ROOM, PAID_PLANK).id, BRAM);
    for (const line of kamers.ledgerOf(ROOM, AAGJE)) expect(line.veiled).toBe(false);
  });

  /** A destroyed artikel leaves its line behind; the name may not come back with it. */
  it('veils a line whose artikel is in the bin, for a player', () => {
    buySecretly(ROOM, 'h-stoel', FREE_PLANK);
    sqlite.prepare(`UPDATE entries SET deleted_at = unixepoch() WHERE id = 'h-stoel'`).run();
    try {
      expect(kamers.ledgerOf(ROOM, BRAM).find((line) => line.kind === 'item')!.veiled).toBe(true);
    } finally {
      sqlite.prepare(`UPDATE entries SET deleted_at = NULL WHERE id = 'h-stoel'`).run();
    }
  });
});

/* ===================================================== B. wie er te bereiken is */

describe('§83: handOutTargets — kamers, niet spelers', () => {
  it('lists one row per onderzoeker, with the player beside it', () => {
    const rows = kamers.handOutTargets(KEEPER);
    const byRoom = new Map(rows.map((row) => [row.roomId, row]));
    expect(byRoom.get(ROOM)).toMatchObject({ name: 'Bram Kuiper', player: 'Bram' });
    expect(byRoom.get(ROOM_B)).toMatchObject({ name: 'Aagje Nel', player: 'Aagje' });
  });

  /**
   * The judgement call of the round, asserted rather than assumed. Nick asked
   * for "the names of the players"; a purse belongs to an onderzoeker, so
   * somebody wearing two is two rows and not one.
   */
  it('gives somebody who wears two onderzoekers two rows and two purses', () => {
    kamers.grant(ROOM_D1, 4, 'voor de oude', KEEPER);
    const rows = kamers.handOutTargets(KEEPER).filter((row) => row.player === 'Daan');
    expect(rows.map((row) => row.name).sort()).toEqual(['Daan de Jonge', 'Daan de Oude']);
    expect(rows.find((row) => row.roomId === ROOM_D1)!.balance).toBe(4);
    expect(rows.find((row) => row.roomId === ROOM_D2)!.balance).toBe(0);
  });

  /**
   * §86 gaf hier een deur naast: de Keeper kan er met de hand een kamer voor
   * openen. Zolang hij dat niet doet blijft dit waar — en dát is de helft die
   * hier bewaakt wordt, want "niemand draagt hem" mag nooit *vanzelf* een
   * kamer worden. De andere helft staat onderaan dit bestand.
   */
  it('leaves out an onderzoeker nobody wears, until somebody opens one', () => {
    expect(kamers.handOutTargets(KEEPER).map((row) => row.slug)).not.toContain('de-veerman');
  });

  it('leaves out one worn by an account that was shut off', () => {
    expect(kamers.handOutTargets(KEEPER).map((row) => row.slug)).not.toContain('de-verdwenene');
  });

  /** Asked from the side that may not: it is the Keeper's screen and his alone. */
  it('gives a player and a signed-out reader nothing at all', () => {
    expect(kamers.handOutTargets(BRAM)).toEqual([]);
    expect(kamers.handOutTargets(null)).toEqual([]);
  });
});

/* ========================================================= C. de uitdeling */

describe('§83: uitdelen — één reden, één knop, één transactie', () => {
  it('writes one grant line per kamer, all with the same reason', () => {
    const out = kamers.handOut(
      [
        { roomId: ROOM, delta: 3 },
        { roomId: ROOM_B, delta: 3 },
      ],
      'samen de vuurtoren gehaald',
      KEEPER,
    );
    expect(out).toEqual({ rooms: 2, total: 6 });
    for (const room of [ROOM, ROOM_B]) {
      expect(ledgerRows(room)).toHaveLength(1);
      expect(ledgerRows(room)[0]).toMatchObject({ delta: 3, kind: 'grant', reason: 'samen de vuurtoren gehaald' });
      expect(kamers.balanceOf(room)).toBe(3);
    }
  });

  it('lets one row differ from the rest', () => {
    kamers.handOut(
      [
        { roomId: ROOM, delta: 3 },
        { roomId: ROOM_B, delta: 5 },
      ],
      'ieder het zijne',
      KEEPER,
    );
    expect(kamers.balanceOf(ROOM)).toBe(3);
    expect(kamers.balanceOf(ROOM_B)).toBe(5);
  });

  /** The three ways of saying "deze niet", and they have to agree. */
  it('writes nothing for a nought, and nothing for a kamer left out', () => {
    const out = kamers.handOut(
      [
        { roomId: ROOM, delta: 2 },
        { roomId: ROOM_B, delta: 0 },
      ],
      'alleen Bram',
      KEEPER,
    );
    expect(out).toEqual({ rooms: 1, total: 2 });
    expect(ledgerRows(ROOM_B)).toHaveLength(0);
    expect(ledgerRows(ROOM_D1)).toHaveLength(0);
  });

  it('refuses a handful of noughts rather than writing a silent nothing', () => {
    expect(() => kamers.handOut([{ roomId: ROOM, delta: 0 }], 'niets', KEEPER)).toThrow(/niemand aan/);
    expect(() => kamers.handOut([], 'niets', KEEPER)).toThrow(/niemand aan/);
  });

  it('allows a negative amount, like a grant does', () => {
    kamers.grant(ROOM, 5, 'eerder', KEEPER);
    kamers.grant(ROOM_B, 5, 'eerder', KEEPER);
    kamers.handOut(
      [
        { roomId: ROOM, delta: -2 },
        { roomId: ROOM_B, delta: -2 },
      ],
      'een boete aan tafel',
      KEEPER,
    );
    expect(kamers.balanceOf(ROOM)).toBe(3);
    expect(kamers.balanceOf(ROOM_B)).toBe(3);
  });

  /* ------------------------------------------ en nu vanaf de kant die faalt */

  /**
   * The failure that would be invisible: four of the eight lines written, and
   * nothing on the screen to say which four.
   */
  it('writes nothing at all when one kamer would go below nought', () => {
    kamers.grant(ROOM, 10, 'rijk', KEEPER);
    expect(() =>
      kamers.handOut(
        [
          { roomId: ROOM, delta: -1 },
          { roomId: ROOM_B, delta: -1 },
        ],
        'een boete',
        KEEPER,
      ),
    ).toThrow(/onder nul/);
    // Not one line, in either kamer — and the rich one is untouched as well.
    expect(ledgerRows(ROOM)).toHaveLength(1);
    expect(kamers.balanceOf(ROOM)).toBe(10);
    expect(ledgerRows(ROOM_B)).toHaveLength(0);
  });

  it('names the onderzoeker it could not charge', () => {
    expect(() => kamers.handOut([{ roomId: ROOM_B, delta: -1 }], 'een boete', KEEPER)).toThrow(/Aagje Nel/);
  });

  it('refuses the whole thing for one kamer that does not exist', () => {
    expect(() =>
      kamers.handOut(
        [
          { roomId: ROOM, delta: 3 },
          { roomId: 'kamer-die-niet-bestaat', delta: 3 },
        ],
        'aan iedereen',
        KEEPER,
      ),
    ).toThrow(/bestaat niet/);
    expect(ledgerRows(ROOM)).toHaveLength(0);
  });

  it('refuses the same kamer twice rather than paying it double', () => {
    expect(() =>
      kamers.handOut(
        [
          { roomId: ROOM, delta: 3 },
          { roomId: ROOM, delta: 3 },
        ],
        'twee keer',
        KEEPER,
      ),
    ).toThrow(/twee keer/);
    expect(ledgerRows(ROOM)).toHaveLength(0);
  });

  it('refuses an amount that is not a whole number, and writes nothing', () => {
    for (const delta of [1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() =>
        kamers.handOut(
          [
            { roomId: ROOM, delta: 2 },
            { roomId: ROOM_B, delta },
          ],
          'krom',
          KEEPER,
        ),
      ).toThrow(/heel getal/);
    }
    expect(ledgerRows(ROOM)).toHaveLength(0);
  });

  /** §80: a lock needs a slot on the outside of the door — this is the lock. */
  it('refuses a player, and a signed-out caller, and writes nothing', () => {
    for (const viewer of [BRAM, AAGJE, null]) {
      expect(() => kamers.handOut([{ roomId: ROOM, delta: 3 }], 'ik geef mezelf', viewer)).toThrow(
        /Alleen de Keeper/,
      );
    }
    expect(ledgerRows(ROOM)).toHaveLength(0);
    expect(kamers.balanceOf(ROOM)).toBe(0);
  });

  it('keeps the reason short rather than refusing a long one', () => {
    kamers.handOut([{ roomId: ROOM, delta: 1 }], 'a'.repeat(400), KEEPER);
    expect(ledgerRows(ROOM)[0].reason).toHaveLength(200);
  });

  /** And the lines it writes are ordinary grants: the player's grootboek shows them. */
  it('lands in the grootboek the player reads, as an ordinary line', () => {
    kamers.handOut([{ roomId: ROOM, delta: 4 }], 'samen gedaan', KEEPER);
    const line = kamers.ledgerOf(ROOM, BRAM)[0];
    expect(line).toMatchObject({ kind: 'grant', delta: 4, reason: 'samen gedaan', veiled: false });
  });
});

/* ---------------------------------------------------- en de plek van de gever */

describe('§83: de uitdeler is een plek van de Keeper', () => {
  it('lets a Keeper watch it and nobody else', () => {
    expect(canWatch('page:/uitdelen', KEEPER)).toBe(true);
    expect(canWatch('page:/uitdelen', BRAM)).toBe(false);
    expect(canWatch('page:/uitdelen', null)).toBe(false);
  });
});

/* ====================================== D. meerdere plekken en dubbel mogen */

describe('§83: plekKinds — één lezer voor een veld dat een lijst werd', () => {
  it('reads an array, and keeps the ladder’s order', () => {
    expect(shape.plekKinds(['bureau', 'muur'])).toEqual(['muur', 'bureau']);
    expect(shape.plekKinds(['muur', 'plank', 'bureau', 'kist'])).toEqual(shape.PLEK_KINDS as unknown as PlekKind[]);
  });

  /** The safety net: an archive that never ran `0029` keeps its kamers. */
  it('still reads a bare string', () => {
    expect(shape.plekKinds('muur')).toEqual(['muur']);
  });

  it('drops what is not a kind, and keeps the rest', () => {
    expect(shape.plekKinds(['zolder', 'plank'])).toEqual(['plank']);
    expect(shape.plekKinds('zolder')).toEqual([]);
    expect(shape.plekKinds(undefined)).toEqual([]);
    expect(shape.plekKinds(null)).toEqual([]);
    expect(shape.plekKinds([])).toEqual([]);
    expect(shape.plekKinds([1, true, {}])).toEqual([]);
  });

  it('says the same thing twice only once', () => {
    expect(shape.plekKinds(['plank', 'plank'])).toEqual(['plank']);
  });
});

describe('§83: een ding dat op meerdere soorten plek past', () => {
  it('is read back as a list by factsOf and plekKindsOf', () => {
    expect(kamers.factsOf('h-klok')?.plekken).toEqual(['muur', 'bureau']);
    expect(kamers.plekKindsOf('h-klok')).toEqual(['muur', 'bureau']);
    expect(kamers.plekKindsOf('h-oud')).toEqual(['muur']);
    expect(kamers.plekKindsOf('h-half')).toEqual(['plank']);
    expect(kamers.plekKindsOf('n-persoon')).toEqual([]);
  });

  it('may be put down on either kind', () => {
    kamers.placeItem(plek(ROOM, FREE_MUUR).id, 'h-klok', BRAM);
    kamers.placeItem(plek(ROOM, FREE_BUREAU).id, 'h-klok', BRAM);
    expect(plek(ROOM, FREE_MUUR).entryId).toBe('h-klok');
    expect(plek(ROOM, FREE_BUREAU).entryId).toBe('h-klok');
  });

  it('is still refused on a kind it does not ask for', () => {
    expect(() => kamers.placeItem(plek(ROOM, FREE_PLANK).id, 'h-klok', BRAM)).toThrow(/niet op deze plek/);
    expect(plek(ROOM, FREE_PLANK).entryId).toBeNull();
  });

  it('shows up in the catalogue of every kind it fits, and no other', () => {
    const ids = (kind: PlekKind) => kamers.catalogueFor(kind, BRAM).map((row) => row.id);
    expect(ids('muur')).toContain('h-klok');
    expect(ids('bureau')).toContain('h-klok');
    expect(ids('plank')).not.toContain('h-klok');
    expect(ids('kist')).not.toContain('h-klok');
  });

  it('carries a landing place per kind in the winkel', () => {
    const row = kamers.shopFor(BRAM, ROOM).items.find((item) => item.id === 'h-klok')!;
    expect(row.plekken).toEqual(['muur', 'bureau']);
    expect(row.landsIn.muur).toBe(plek(ROOM, FREE_MUUR).id);
    expect(row.landsIn.bureau).toBe(plek(ROOM, FREE_BUREAU).id);
    expect(row.landsIn.plank).toBeUndefined();
  });

  /**
   * The reason `landsIn` is per kind at all: with one muur full and a bureau
   * free, the very same row is unbuyable under *muur* and buyable under
   * *bureau*. One answer for both would make the shop lie in one of them.
   */
  it('is for sale under one kind and not the other when one is full', () => {
    kamers.placeItem(plek(ROOM, FREE_MUUR).id, 'h-kaars', BRAM);
    const row = kamers.shopFor(BRAM, ROOM).items.find((item) => item.id === 'h-klok')!;
    expect(row.landsIn.muur).toBeUndefined();
    expect(row.landsIn.bureau).toBe(plek(ROOM, FREE_BUREAU).id);
  });

  it('buys onto whichever kind it was offered for', () => {
    kamers.grant(ROOM, 10, 'sparen', KEEPER);
    kamers.buyFurnishing(plek(ROOM, FREE_BUREAU).id, 'h-klok', BRAM);
    expect(plek(ROOM, FREE_BUREAU).entryId).toBe('h-klok');
    expect(kamers.balanceOf(ROOM)).toBe(8);
  });
});

/**
 * §83's eigen fout, en de enige die de browser moest vinden.
 *
 * Elke lezer van `plek` gaat door `plekKinds` — behalve één: de plek-kiezer
 * vraagt het aan duizend rijen die hij niet opgehaald heeft, dus die vraagt het
 * in SQL. Toen het veld een lijst werd, vond `json_extract(…) = 'bureau'` niets
 * meer, en de kiezer bood **niets** aan terwijl `placeItem` alles nog
 * accepteerde: §17's regel 4, onzichtbaar voor elke unittest hierboven.
 *
 * `plekMatches` is die ene voorwaarde, uit de route gehaald zodat hij hier
 * gevraagd kan worden — van allebei de kanten, en van de vormen die geen
 * antwoord mogen geven.
 */
describe('§83: plekMatches — dezelfde vraag, in SQL', () => {
  const matching = async (kind: PlekKind) => {
    const { db, schema } = await import('@/lib/db');
    const { and } = await import('drizzle-orm');
    return db
      .select({ id: schema.entries.id })
      .from(schema.entries)
      .where(and(kamers.plekMatches(kind)))
      .all()
      .map((row) => row.id);
  };

  it('finds a thing stored as a list, under each of its kinds', async () => {
    expect(await matching('muur')).toContain('h-klok');
    expect(await matching('bureau')).toContain('h-klok');
    expect(await matching('plank')).not.toContain('h-klok');
    expect(await matching('kist')).not.toContain('h-klok');
  });

  it('still finds one stored as a bare string', async () => {
    expect(await matching('muur')).toContain('h-oud');
    expect(await matching('plank')).not.toContain('h-oud');
  });

  it('keeps the good half of a list with rubbish in it', async () => {
    expect(await matching('plank')).toContain('h-half');
  });

  it('finds nothing that has no such field, and never throws on one that is not text', async () => {
    for (const kind of shape.PLEK_KINDS) {
      expect(await matching(kind)).not.toContain('n-persoon');
    }
  });

  /** And it answers the same set `plekKinds` does, row for row. */
  it('agrees with plekKinds for every artikel in the archive', async () => {
    const { db, schema } = await import('@/lib/db');
    const all = db.select({ id: schema.entries.id, fields: schema.entries.fields }).from(schema.entries).all();
    for (const kind of shape.PLEK_KINDS) {
      const bySql = new Set(await matching(kind));
      const byReader = all.filter((row) => shape.plekKinds(row.fields?.[shape.VOORWERP_FIELD_KEY]).includes(kind));
      expect([...bySql].sort(), kind).toEqual(byReader.map((row) => row.id).sort());
    }
  });
});

describe('§83: hetzelfde ding mag vaker in één kamer', () => {
  it('lets the same stuk huisraad be bought twice, and charges twice', () => {
    kamers.grant(ROOM, 10, 'sparen', KEEPER);
    kamers.unlockSlot(plek(ROOM, PAID_PLANK).id, BRAM);
    const left = kamers.balanceOf(ROOM);

    kamers.buyFurnishing(plek(ROOM, FREE_PLANK).id, 'h-stoel', BRAM);
    kamers.buyFurnishing(plek(ROOM, PAID_PLANK).id, 'h-stoel', BRAM);

    expect(kamers.balanceOf(ROOM)).toBe(left - 6);
    expect(plek(ROOM, FREE_PLANK).entryId).toBe('h-stoel');
    expect(plek(ROOM, PAID_PLANK).entryId).toBe('h-stoel');
    // Neither claims anything: a claim is only ever made for a unique thing.
    expect(slotsOf(ROOM).every((slot) => slot.claim === null)).toBe(true);
  });

  /** The half that did **not** move: one voorwerp is one thing in the world. */
  it('still refuses a second copy of a one-of-a-kind voorwerp', () => {
    kamers.grant(ROOM, 10, 'sparen', KEEPER);
    kamers.unlockSlot(plek(ROOM, PAID_PLANK).id, BRAM);
    kamers.placeItem(plek(ROOM, FREE_PLANK).id, 'v-lantaarn', BRAM);
    expect(() => kamers.placeItem(plek(ROOM, PAID_PLANK).id, 'v-lantaarn', BRAM)).toThrow(
      /al ergens in deze kamer/,
    );
    expect(plek(ROOM, PAID_PLANK).entryId).toBeNull();
  });

  it('still refuses it across two kamers, with the other sentence', () => {
    kamers.placeItem(plek(ROOM, FREE_PLANK).id, 'v-lantaarn', BRAM);
    expect(() => kamers.placeItem(plek(ROOM_B, FREE_PLANK).id, 'v-lantaarn', AAGJE)).toThrow(
      /in een andere kamer/,
    );
    expect(plek(ROOM_B, FREE_PLANK).entryId).toBeNull();
  });

  /** And the same thing twice on a grid is two lines in "wat deze kamer je geeft". */
  it('counts twice in the effects list, because there are two of them', () => {
    kamers.placeItem(plek(ROOM, FREE_MUUR).id, 'h-klok', BRAM);
    kamers.placeItem(plek(ROOM, FREE_BUREAU).id, 'h-klok', BRAM);
    const view = kamers.viewRoomBySlug('bram-kuiper', BRAM)!;
    expect(view.effects.filter((row) => row.name === 'Een staande klok')).toHaveLength(2);
  });
});

/* ================================================= E. de migratie zelf */

/**
 * §83: migratie `0029` op een archief dat er al staat.
 *
 * The unit tests above run against a fresh archive, where `seed.mjs` already
 * writes `multiselect` — so none of them would notice if the migration did
 * nothing at all. That is the failure this round has to be most afraid of: a
 * migration that finds no anchor, changes nothing, and reports success (the
 * `CLAUDE.md` §5 signpost sat stale for three rounds for exactly that reason).
 *
 * So the SQL is taken out of `MIGRATIONS` and run against a hand-built archive
 * in the shape `0028` leaves behind: field definitions saying `select`, and
 * values that are bare strings.
 */
describe('§83: migratie 0029 — van keuze naar meerkeuze', () => {
  const build = async () => {
    const Database = (await import('better-sqlite3')).default;
    const { MIGRATIONS } = await import('@/lib/db/migrations.mjs');
    const migration = (MIGRATIONS as { name: string; sql: string }[]).find(
      (row) => row.name === '0029_meerdere_plekken',
    );
    expect(migration, 'migratie 0029 bestaat niet').toBeDefined();

    const db = new Database(':memory:') as unknown as Mini;
    db.exec('CREATE TABLE entry_types (id TEXT PRIMARY KEY, slug TEXT, fields TEXT)');
    db.exec('CREATE TABLE entries (id TEXT PRIMARY KEY, type_id TEXT, fields TEXT)');
    return { db, sql: migration!.sql };
  };

  type Mini = { prepare: (sql: string) => { get: (id: string) => unknown; run: (...args: string[]) => unknown }; exec: (sql: string) => unknown };

  const typeFields = (db: Mini, id: string) =>
    JSON.parse((db.prepare('SELECT fields FROM entry_types WHERE id = ?').get(id) as { fields: string }).fields);
  const entryFields = (db: Mini, id: string) =>
    JSON.parse((db.prepare('SELECT fields FROM entries WHERE id = ?').get(id) as { fields: string }).fields);

  it('turns every plek field into a meerkeuze, and leaves the rest of the soort alone', async () => {
    const { db, sql } = await build();
    db.prepare('INSERT INTO entry_types VALUES (?, ?, ?)').run(
      'type-huisraad',
      'huisraad',
      '[{"key":"plek","label":"Plek","kind":"select","options":["muur","plank"]},{"key":"prijs","label":"Prijs","kind":"number"}]',
    );
    db.exec(sql);

    const fields = typeFields(db, 'type-huisraad');
    expect(fields[0]).toEqual({ key: 'plek', label: 'Plek', kind: 'multiselect', options: ['muur', 'plank'] });
    expect(fields[1]).toEqual({ key: 'prijs', label: 'Prijs', kind: 'number' });
  });

  /** The reason it is done with `json_each` rather than a text replace. */
  it('still finds the field when the Keeper has renamed its label', async () => {
    const { db, sql } = await build();
    db.prepare('INSERT INTO entry_types VALUES (?, ?, ?)').run(
      'type-eigen',
      'boeken',
      '[{"key":"plek","label":"Waar het staat","kind":"select","options":["plank"]}]',
    );
    db.exec(sql);
    expect(typeFields(db, 'type-eigen')[0].kind).toBe('multiselect');
  });

  it('leaves a soort without such a field untouched', async () => {
    const { db, sql } = await build();
    const before = '[{"key":"beroep","label":"Beroep","kind":"text"}]';
    db.prepare('INSERT INTO entry_types VALUES (?, ?, ?)').run('type-persoon', 'character', before);
    db.exec(sql);
    expect(JSON.stringify(typeFields(db, 'type-persoon'))).toBe(before);
  });

  /** The second half, and the half without which the first is a data loss. */
  it('rewrites every stored value from a string to a list', async () => {
    const { db, sql } = await build();
    db.prepare('INSERT INTO entry_types VALUES (?, ?, ?)').run(
      'type-huisraad',
      'huisraad',
      '[{"key":"plek","label":"Plek","kind":"select","options":["muur","plank"]}]',
    );
    db.prepare('INSERT INTO entries VALUES (?, ?, ?)').run('a', 'type-huisraad', '{"plek":"muur","prijs":3}');
    db.prepare('INSERT INTO entries VALUES (?, ?, ?)').run('b', 'type-huisraad', '{"plek":["plank"]}');
    db.prepare('INSERT INTO entries VALUES (?, ?, ?)').run('c', 'type-huisraad', '{}');
    db.exec(sql);

    // The string became a list, and everything beside it survived.
    expect(entryFields(db, 'a')).toEqual({ plek: ['muur'], prijs: 3 });
    // Something already a list is left exactly as it was.
    expect(entryFields(db, 'b')).toEqual({ plek: ['plank'] });
    // And an artikel that never answered the question still has not.
    expect(entryFields(db, 'c')).toEqual({});
  });

  /**
   * A Keeper who made a `plek` field of his own and deliberately kept it a
   * single choice keeps both his field *and* his values.
   */
  it('leaves values alone whose soort still says select', async () => {
    const { db, sql } = await build();
    db.prepare('INSERT INTO entry_types VALUES (?, ?, ?)').run(
      'type-anders',
      'anders',
      '[{"key":"plek","label":"Plek","kind":"text"}]',
    );
    db.prepare('INSERT INTO entries VALUES (?, ?, ?)').run('x', 'type-anders', '{"plek":"muur"}');
    db.exec(sql);
    expect(entryFields(db, 'x')).toEqual({ plek: 'muur' });
  });

  it('may be run twice without changing anything the second time', async () => {
    const { db, sql } = await build();
    db.prepare('INSERT INTO entry_types VALUES (?, ?, ?)').run(
      'type-huisraad',
      'huisraad',
      '[{"key":"plek","label":"Plek","kind":"select","options":["muur"]}]',
    );
    db.prepare('INSERT INTO entries VALUES (?, ?, ?)').run('a', 'type-huisraad', '{"plek":"muur"}');
    db.exec(sql);
    const once = [typeFields(db, 'type-huisraad'), entryFields(db, 'a')];
    db.exec(sql);
    expect([typeFields(db, 'type-huisraad'), entryFields(db, 'a')]).toEqual(once);
  });

  /** And what the migration leaves behind is what `plekKinds` reads. */
  it('leaves values in the shape the service reads', async () => {
    const { db, sql } = await build();
    db.prepare('INSERT INTO entry_types VALUES (?, ?, ?)').run(
      'type-huisraad',
      'huisraad',
      '[{"key":"plek","label":"Plek","kind":"select","options":["muur"]}]',
    );
    db.prepare('INSERT INTO entries VALUES (?, ?, ?)').run('a', 'type-huisraad', '{"plek":"muur"}');
    db.exec(sql);
    expect(shape.plekKinds(entryFields(db, 'a').plek)).toEqual(['muur']);
  });
});

/* -------------------------------------- en de volgorde van het grootboek */

/**
 * §83 found this one, and it had been wrong since §79: the comment said `rowid`
 * and the code said `id`, which `lib/ids.ts` makes out of random bytes. Two
 * lines in the same second therefore came back in no order at all — invisible
 * while only the Keeper read the list, and a whole uitdeling lands in one
 * second by design.
 */
describe('§83: regels die een seconde delen staan in schrijfvolgorde', () => {
  it('keeps a whole uitdeling in the order it was written', () => {
    for (let n = 0; n < 6; n += 1) kamers.grant(ROOM, n + 1, `regel ${n}`, KEEPER);
    const written = ledgerRows(ROOM).map((row) => row.reason);
    expect(kamers.ledgerOf(ROOM, BRAM).map((line) => line.reason)).toEqual([...written].reverse());
  });

  it('keeps a spend under the grant that paid for it', () => {
    kamers.grant(ROOM, 40, 'sparen', KEEPER);
    kamers.unlockSlot(plek(ROOM, PAID_PLANK).id, BRAM);
    const lines = kamers.ledgerOf(ROOM, BRAM);
    expect(lines[0].kind).toBe('slot');
    expect(lines[1].kind).toBe('grant');
  });
});


/* ================================================ E. §86: de kamer zonder drager */

/**
 * §86: een kamer voor een onderzoeker die niemand draagt.
 *
 * Nick, ronde 47: *"coins belong to a character"* — en hij schrijft karakters
 * die nog aan geen enkel account hangen. Die konden niets bezitten, want
 * `getOrCreateRoom` weigert zonder drager.
 *
 * Wat hier bewaakt wordt is de **vorm** van de uitzondering, niet dat hij
 * bestaat: het is een handeling van de Keeper en geen bijwerking van een
 * lezing, en de kamer die eruit komt is van niemand — wat iets anders is dan
 * van iedereen.
 *
 * `beforeEach` veegt alle kamers weg, dus elke zaak opent de zijne zelf. Dat
 * is niet omslachtig maar juist: een zaak die leunt op wat de zaak ervoor
 * achterliet, valt om zodra iemand de volgorde verandert — en dat is precies
 * hoe twee e2e-zaken in ronde 46 elkaars huisraad kochten.
 */
describe('§86: een kamer die de Keeper opent', () => {
  const openVeerman = () => {
    const roomId = kamers.openRoomFor('e-los', KEEPER);
    if (!roomId) throw new Error('de kamer ging niet open');
    return roomId;
  };

  it('makes none by itself — looking at an artikel never creates one', () => {
    expect(kamers.roomIdFor('e-los')).toBeNull();
    // En de lezing die §85 op élk artikel doet, maakt er ook geen.
    expect(kamers.roomSummary('e-los', KEEPER)).toBeNull();
    expect(kamers.roomIdFor('e-los')).toBeNull();
  });

  it('refuses everybody but the Keeper', () => {
    expect(kamers.openRoomFor('e-los', BRAM)).toBeNull();
    expect(kamers.openRoomFor('e-los', null)).toBeNull();
    expect(kamers.roomIdFor('e-los')).toBeNull();
  });

  it('refuses an artikel that is not there', () => {
    expect(kamers.openRoomFor('bestaat-niet', KEEPER)).toBeNull();
  });

  it('opens one, gives it the whole ladder, and says the same id twice', () => {
    const roomId = openVeerman();
    expect(kamers.roomIdFor('e-los')).toBe(roomId);
    expect(slotsOf(roomId).length).toBe(shape.ROOM_SHAPE.length);
    // Twee keer openen is één kamer: de handeling is idempotent.
    expect(kamers.openRoomFor('e-los', KEEPER)).toBe(roomId);
  });

  /**
   * §48: een nieuw ding wordt geboren op de kant waar het gemaakt is. Deze
   * kamer is van de Keeper, dus hij staat dicht tot hij hem opendraait —
   * anders leest de tafel morgen wat er in de kist van een figuur ligt die zij
   * nog niet eens ontmoet hebben.
   */
  it('is born shut, and only the Keeper may arrange it', () => {
    const roomId = openVeerman();
    const row = sqlite
      .prepare('SELECT view_mode AS viewMode, edit_mode AS editMode, created_by AS createdBy FROM rooms WHERE id = ?')
      .get(roomId) as { viewMode: string; editMode: string; createdBy: string | null };
    expect(row.viewMode).toBe('private');
    expect(row.editMode).toBe('private');
    expect(row.createdBy).toBe(KEEPER.id);

    expect(kamers.canArrangeRoom(roomId, KEEPER)).toBe(true);
    // Niemand draagt deze onderzoeker, dus er is geen tweede hand die mag.
    expect(kamers.canArrangeRoom(roomId, BRAM)).toBe(false);
    expect(kamers.canSeeRoom(roomId, BRAM)).toBe(false);
  });

  /**
   * De zaak die de unit-tests **niet** vonden, tot de browser hem vond.
   *
   * `roomIdFor` keek langs `getOrCreateRoom` heen, en daar stond de
   * dragervraag vóór de opzoeking: de kamer bestond, de uitdeler vond hem, en
   * elke andere lezer zei dat er geen was. Dus wordt hier nu de weg gemeten die
   * de rest van de app loopt, en niet de kortste.
   */
  it('is found by every reader, not only by the one that opened it', () => {
    const roomId = openVeerman();
    expect(kamers.getOrCreateRoom('e-los')).toBe(roomId);
    const summary = kamers.roomSummary('e-los', KEEPER);
    expect(summary, 'de kamer bestaat maar roomSummary ziet hem niet').toBeTruthy();
    expect(summary!.href).toBe('/kamer/de-veerman');
    expect(kamers.viewRoomBySlug('de-veerman', KEEPER)).toBeTruthy();
  });

  it('turns up in the uitdeling, with nobody beside the name', () => {
    openVeerman();
    const row = kamers.handOutTargets(KEEPER).find((target) => target.slug === 'de-veerman');
    expect(row, 'de kamer die net geopend is staat niet in de lijst').toBeTruthy();
    expect(row!.player).toBeNull();
    expect(row!.active).toBe(false);
    expect(row!.balance).toBe(0);
  });

  it('takes a grant like any other kamer', () => {
    const roomId = openVeerman();
    kamers.handOut([{ roomId, delta: 7 }], 'Voor de overtocht', KEEPER);
    expect(kamers.balanceOf(roomId)).toBe(7);
    expect(ledgerRows(roomId).map((line) => line.reason)).toEqual(['Voor de overtocht']);
  });

  /** En de lijst blijft één rij per kamer, ook nu er twee soorten in zitten. */
  it('never lists one kamer twice', () => {
    openVeerman();
    const ids = kamers.handOutTargets(KEEPER).map((row) => row.roomId);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

/* ============================== F. §86: gehouden, maar niet gespeeld */

/**
 * Nick, ronde 47: *"right now you can only give to a character that is
 * currently being used"* — en dat was niet waar. `handOutTargets` leest
 * `user_characters`, dus élk karakter dat een account *houdt* staat erin, of
 * hij nu gespeeld wordt of niet. Maar niets op het scherm zei dat, en een
 * waarheid die nergens staat is er voor de lezer niet.
 *
 * Dus draagt een rij nu `active`, en dat is het enige nieuwe: het antwoord
 * bestond al, het had alleen geen woorden.
 */
describe('§86: gehouden, maar niet gespeeld', () => {
  const plays = (userId: string, entryId: string | null) =>
    sqlite.prepare('UPDATE users SET active_character_id = ? WHERE id = ?').run(entryId, userId);

  it('lists both of a pair and marks which one is being played', () => {
    plays('daan', 'e-daan2');
    const rows = kamers.handOutTargets(KEEPER).filter((row) => row.player === 'Daan');
    expect(rows.length).toBe(2);
    expect(rows.find((row) => row.slug === 'daan-de-jonge')!.active).toBe(true);
    expect(rows.find((row) => row.slug === 'daan-de-oude')!.active).toBe(false);
    plays('daan', null);
  });

  it('keeps somebody who wears nobody at the moment in the list all the same', () => {
    plays('bram', null);
    const row = kamers.handOutTargets(KEEPER).find((target) => target.slug === 'bram-kuiper');
    expect(row, 'een karakter valt uit de lijst zodra niemand het speelt').toBeTruthy();
    expect(row!.active).toBe(false);
    expect(row!.player).toBe('Bram');
  });
});
