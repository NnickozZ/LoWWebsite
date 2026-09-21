import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';

/**
 * §79: de kamer — het grootboek, de plekken, en wie wat mag.
 *
 * Four things are being guarded here, and they are the four that would cost
 * somebody something real if they broke:
 *
 *   1. **The balance is the sum of the grootboek and nothing else.** Every
 *      assertion about money reads `balanceOf`, and every refusal is checked
 *      twice — once for the refusal and once for the line that was *not*
 *      written. A refusal that still charges is the failure mode of every
 *      economy ever built, and it is invisible until somebody counts.
 *   2. **One click, one purchase.** The guard lives inside the UPDATE
 *      (`WHERE unlocked_at IS NULL`); what a test can see of it is that the
 *      second unlock of the same plek adds no second line.
 *   3. **Rights, asked from the side of the person who may not.** Copied from
 *      `tests/unit/access.test.ts` and `tests/unit/roster.test.ts`: the
 *      interesting assertion is never "the owner may", it is "the other player
 *      may not", and it is made for every road in — unlock, place, clear,
 *      grant — because one unguarded road is the whole wall.
 *   4. **§76's rule in a new place.** A voorwerp the looker may not see comes
 *      back veiled rather than absent, and — the part that is the security
 *      property rather than the feature — *identically* veiled whether it is
 *      Keeper-only (§9) or the far side of a tweeling (§44). A plek that said
 *      "empty" for one and "something is here" for the other would name which
 *      hidden things exist without ever printing a name.
 *
 * Asked of a real SQLite file, because all of this is SQL: the partial unique
 * index, the conditional UPDATE, the transaction, and every rights rule.
 */

const dir = mkdtempSync(join(tmpdir(), 'zcf-kamer-'));
process.env.DATA_DIR = dir;

type Kamers = typeof import('@/lib/kamers/service');
type Shape = typeof import('@/lib/kamers/shape');
type PlekKind = import('@/lib/kamers/shape').PlekKind;
type SlotView = import('@/lib/kamers/service').SlotView;

let kamers: Kamers;
let shape: Shape;
let canWatch: typeof import('@/lib/live/gate').canWatch;
let softDeleteEntry: typeof import('@/lib/entries/service').softDeleteEntry;
let restoreFromTrash: typeof import('@/lib/admin/trash').restoreFromTrash;
let destroyFromTrash: typeof import('@/lib/admin/trash').destroyFromTrash;
let sqlite: typeof import('@/lib/db').sqlite;

/** §17: a Keeper is above both dials. */
const KEEPER = { id: 'keeper-1', isKeeper: true };
/** Bram wears the onderzoeker whose kamer this is. Everything is his. */
const BRAM = { id: 'bram', isKeeper: false };
/** Aagje wears another one. She is the person every rights test is asked as. */
const AAGJE = { id: 'aagje', isKeeper: false };
/** And nobody at all, who may look at a kamer and touch nothing in it. */
const NOBODY = null;

/* ------------------------------------------------------------ the fixtures */

type SlotRow = {
  id: string;
  kind: PlekKind;
  sortOrder: number;
  price: number;
  unlockedAt: number | null;
  entryId: string | null;
  placedAt: number | null;
};

const slotsOf = (roomId: string) =>
  sqlite
    .prepare(
      `SELECT id, kind, sort_order AS sortOrder, price, unlocked_at AS unlockedAt,
              entry_id AS entryId, placed_at AS placedAt
       FROM room_slots WHERE room_id = ? ORDER BY sort_order`,
    )
    .all(roomId) as SlotRow[];

/** The plek at one rung of `ROOM_SHAPE`, by its position — never by its index in a list. */
const plek = (roomId: string, sortOrder: number) => {
  const row = slotsOf(roomId).find((slot) => slot.sortOrder === sortOrder);
  if (!row) throw new Error(`geen plek op ${sortOrder}`);
  return row;
};

type LedgerRow = { id: string; delta: number; kind: string; reason: string; slotId: string | null };

/** The grootboek in the order it was written, which `ledgerOf` deliberately reverses. */
const ledgerRows = (roomId: string) =>
  sqlite
    .prepare(
      `SELECT id, delta, kind, reason, slot_id AS slotId
       FROM room_ledger WHERE room_id = ? ORDER BY rowid`,
    )
    .all(roomId) as LedgerRow[];

/**
 * The rungs these tests stand on, found rather than written down: Nick tunes
 * `ROOM_SHAPE` and nothing here should have to be re-numbered when he does.
 */
let FREE_BUREAU: number;
let FREE_PLANK: number;
let FREE_MUUR: number;
let PAID_PLANK: number;
let PAID_MUUR: number;

/** Bram's kamer, rebuilt before every test. */
let ROOM: string;

beforeAll(async () => {
  const dbModule = await import('@/lib/db');
  sqlite = dbModule.sqlite;
  kamers = await import('@/lib/kamers/service');
  shape = await import('@/lib/kamers/shape');
  canWatch = (await import('@/lib/live/gate')).canWatch;
  softDeleteEntry = (await import('@/lib/entries/service')).softDeleteEntry;
  restoreFromTrash = (await import('@/lib/admin/trash')).restoreFromTrash;
  destroyFromTrash = (await import('@/lib/admin/trash')).destroyFromTrash;
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
  PAID_MUUR = firstRung('muur', false);

  const run = (sql: string, ...args: unknown[]) => sqlite.prepare(sql).run(...args);

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

  /* The onderzoekers. A kamer hangs on one of these and on nothing else. */
  entry('e-bram', 'investigator', 'Bram Kuiper', 'bram-kuiper', {});
  entry('e-aagje', 'investigator', 'Aagje Nel', 'aagje-nel', {});
  // Nobody wears this one, so it has no kamer at all (§79: `getOrCreateRoom`).
  entry('e-los', 'investigator', 'De veerman', 'de-veerman', {});
  // §9: an onderzoeker the table may not know exists. Bram wears it; he still
  // may not see it, because the Keeper's secrecy is above the owner's dial.
  entry('e-verborgen', 'investigator', 'De stille gast', 'de-stille-gast', {}, 'keeper');

  run(`INSERT INTO user_characters (user_id, entry_id) VALUES ('bram', 'e-bram')`);
  run(`INSERT INTO user_characters (user_id, entry_id) VALUES ('aagje', 'e-aagje')`);
  run(`INSERT INTO user_characters (user_id, entry_id) VALUES ('bram', 'e-verborgen')`);

  /*
   * The voorwerpen. Not a soort — an artikel carrying the field `plek`, which
   * is the whole of `shape.ts`'s answer to what makes something a voorwerp.
   */
  const K = shape.VOORWERP_FIELD_KEY;
  entry('v-lantaarn', 'item', 'Een koperen lantaarn', 'koperen-lantaarn', { [K]: 'plank' });
  entry('v-kompas', 'item', 'Een verlopen kompas', 'verlopen-kompas', { [K]: 'plank' });
  entry('v-schilderij', 'item', 'Een zeegezicht', 'zeegezicht', { [K]: 'muur' });
  entry('v-inktpot', 'item', 'Een inktpot', 'inktpot', { [K]: 'bureau' });
  // §9: Keeper-only, and it asks for a plank so it fits the same plek as the
  // far side below — the two have to be *swappable* for the veil test to mean
  // anything.
  entry('v-geheim', 'item', 'Het zwarte boek', 'het-zwarte-boek', { [K]: 'plank' }, 'keeper');
  // §44: a real tweeling. `v-prep` is the Keeper's side of `v-wiki`.
  entry('v-wiki', 'item', 'De gebroken spiegel', 'gebroken-spiegel', { [K]: 'plank' });
  entry('v-prep', 'item', 'De gebroken spiegel — Keeper', 'gebroken-spiegel-keeper', { [K]: 'plank' }, 'keeper');
  ties.linkTwin({ kind: 'entry', id: 'v-prep' }, { kind: 'entry', id: 'v-wiki' }, KEEPER.id);

  // An artikel with no `plek` at all: a person, who fits nowhere. This is the
  // rule that keeps somebody's onderzoeker off a shelf.
  entry('n-persoon', 'character', 'Jan Bakker', 'jan-bakker', { occupation: 'visser' });
  // And one that carries the field with nonsense in it, which is not a kind.
  entry('n-onzin', 'item', 'Een raadsel', 'een-raadsel', { [K]: 'zolder' });
});

/**
 * Every test gets a kamer nobody has spent anything in. The rows are dropped
 * rather than the file, because the seeded soorten and the fixtures above are
 * what the kamer is made of.
 */
beforeEach(() => {
  sqlite.prepare('DELETE FROM room_ledger').run();
  sqlite.prepare('DELETE FROM room_slots').run();
  sqlite.prepare('DELETE FROM rooms').run();
  // A test that bins an artikel puts it back; this is the net under that.
  sqlite.prepare('UPDATE entries SET deleted_at = NULL').run();
  ROOM = kamers.getOrCreateRoom('e-bram')!;
});

/* =========================================================== A. het geld */

describe('§79: het saldo is de som van het grootboek', () => {
  it('starts at nul, with no line to say so', () => {
    expect(kamers.balanceOf(ROOM)).toBe(0);
    expect(ledgerRows(ROOM)).toHaveLength(0);
  });

  it('adds what the Keeper gives', () => {
    kamers.grant(ROOM, 7, 'een sessie', KEEPER);
    expect(kamers.balanceOf(ROOM)).toBe(7);
    kamers.grant(ROOM, 3, 'nog een', KEEPER);
    expect(kamers.balanceOf(ROOM)).toBe(10);
  });

  it('subtracts what a plek costs, and the line says which plek', () => {
    kamers.grant(ROOM, 10, 'sparen', KEEPER);
    const shelf = plek(ROOM, PAID_PLANK);
    const { spent } = kamers.unlockSlot(shelf.id, BRAM);

    expect(spent).toBe(shelf.price);
    expect(kamers.balanceOf(ROOM)).toBe(10 - shelf.price);
    const spend = ledgerRows(ROOM).filter((row) => row.kind === 'slot');
    expect(spend).toHaveLength(1);
    expect(spend[0].delta).toBe(-shelf.price);
    expect(spend[0].slotId).toBe(shelf.id);
  });

  it('takes a correction as a negative grant, because a mistake is a line added', () => {
    kamers.grant(ROOM, 10, 'per ongeluk te veel', KEEPER);
    kamers.grant(ROOM, -4, 'rechtgezet', KEEPER);
    expect(kamers.balanceOf(ROOM)).toBe(6);
    // Both are still there. Nothing was edited; the history is the truth.
    expect(ledgerRows(ROOM).map((row) => row.delta)).toEqual([10, -4]);
  });

  it('refuses a correction that would go below nul, and writes nothing', () => {
    kamers.grant(ROOM, 3, 'een beetje', KEEPER);
    expect(() => kamers.grant(ROOM, -5, 'diefstal', KEEPER)).toThrow(kamers.KamerError);
    expect(() => kamers.grant(ROOM, -5, 'diefstal', KEEPER)).toThrow(/onder nul/);
    expect(kamers.balanceOf(ROOM)).toBe(3);
    expect(ledgerRows(ROOM)).toHaveLength(1);
  });

  it('refuses nought and a fraction, which are not amounts', () => {
    expect(() => kamers.grant(ROOM, 0, 'niets', KEEPER)).toThrow(/heel getal/);
    expect(() => kamers.grant(ROOM, 1.5, 'half', KEEPER)).toThrow(/heel getal/);
    expect(ledgerRows(ROOM)).toHaveLength(0);
  });

  /**
   * The one that costs somebody something if it breaks: a refusal that still
   * charges. The plek stays shut *and* the grootboek stays exactly as long as
   * it was.
   */
  it('refuses a plek you cannot afford and leaves the grootboek untouched', () => {
    const shelf = plek(ROOM, PAID_PLANK);
    kamers.grant(ROOM, shelf.price - 1, 'net niet genoeg', KEEPER);
    const before = ledgerRows(ROOM);

    expect(() => kamers.unlockSlot(shelf.id, BRAM)).toThrow(kamers.KamerError);
    expect(() => kamers.unlockSlot(shelf.id, BRAM)).toThrow(/nog niet genoeg/);

    expect(kamers.balanceOf(ROOM)).toBe(shelf.price - 1);
    expect(ledgerRows(ROOM)).toEqual(before);
    expect(plek(ROOM, PAID_PLANK).unlockedAt).toBeNull();
  });

  it('lets exactly enough through, down to nul', () => {
    const shelf = plek(ROOM, PAID_PLANK);
    kamers.grant(ROOM, shelf.price, 'precies genoeg', KEEPER);
    kamers.unlockSlot(shelf.id, BRAM);
    expect(kamers.balanceOf(ROOM)).toBe(0);
    expect(plek(ROOM, PAID_PLANK).unlockedAt).not.toBeNull();
  });

  it('never lets the balance go below nul by any road there is', () => {
    kamers.grant(ROOM, 4, 'vier', KEEPER);
    const dearest = slotsOf(ROOM).reduce((a, b) => (b.price > a.price ? b : a));
    expect(() => kamers.grant(ROOM, -5, 'te veel', KEEPER)).toThrow(kamers.KamerError);
    expect(() => kamers.unlockSlot(dearest.id, BRAM)).toThrow(kamers.KamerError);
    kamers.grant(ROOM, -4, 'alles weg', KEEPER);
    expect(kamers.balanceOf(ROOM)).toBe(0);
    expect(kamers.balanceOf(ROOM)).toBeGreaterThanOrEqual(0);
  });
});

/* ==================================================== B. twee keer klikken */

describe('§79: één klik, één aankoop', () => {
  /**
   * The guard is part of the write — the UPDATE only lands `WHERE unlocked_at
   * IS NULL` — and what a test can see of that is the shape of the grootboek
   * afterwards: one line, not two, however many times the button was pressed.
   */
  it('charges once for a plek unlocked twice', () => {
    kamers.grant(ROOM, 10, 'sparen', KEEPER);
    const shelf = plek(ROOM, PAID_PLANK);

    kamers.unlockSlot(shelf.id, BRAM);
    expect(() => kamers.unlockSlot(shelf.id, BRAM)).toThrow(/al open/);

    const lines = ledgerRows(ROOM).filter((row) => row.slotId === shelf.id);
    expect(lines).toHaveLength(1);
    expect(kamers.balanceOf(ROOM)).toBe(10 - shelf.price);
  });

  it('charges once however many times it is pressed', () => {
    kamers.grant(ROOM, 30, 'genoeg voor drie', KEEPER);
    const shelf = plek(ROOM, PAID_PLANK);
    kamers.unlockSlot(shelf.id, BRAM);
    for (let press = 0; press < 5; press += 1) {
      expect(() => kamers.unlockSlot(shelf.id, BRAM)).toThrow(kamers.KamerError);
    }
    expect(ledgerRows(ROOM).filter((row) => row.kind === 'slot')).toHaveLength(1);
    expect(kamers.balanceOf(ROOM)).toBe(30 - shelf.price);
  });

  /** A free plek is open from the start, so the second press is the only press. */
  it('has nothing to charge for a plek that was never shut', () => {
    expect(() => kamers.unlockSlot(plek(ROOM, FREE_PLANK).id, BRAM)).toThrow(/al open/);
    expect(ledgerRows(ROOM)).toHaveLength(0);
  });

  it('refuses a plek that does not exist at all', () => {
    expect(() => kamers.unlockSlot('bestaat-niet', BRAM)).toThrow(/bestaat niet/);
  });
});

/* ================================================ C. van de andere kant af */

describe('§79: de rechten, gevraagd door wie niet mag', () => {
  it('refuses another player every road into somebody else’s kamer', () => {
    kamers.grant(ROOM, 20, 'van de Keeper', KEEPER);
    const shut = plek(ROOM, PAID_PLANK);
    const open = plek(ROOM, FREE_PLANK);

    expect(() => kamers.unlockSlot(shut.id, AAGJE)).toThrow(/jouw kamer niet/);
    expect(() => kamers.placeItem(open.id, 'v-lantaarn', AAGJE)).toThrow(/jouw kamer niet/);
    expect(() => kamers.clearSlot(open.id, AAGJE)).toThrow(/jouw kamer niet/);

    // And none of it half-happened.
    expect(plek(ROOM, PAID_PLANK).unlockedAt).toBeNull();
    expect(plek(ROOM, FREE_PLANK).entryId).toBeNull();
    expect(kamers.balanceOf(ROOM)).toBe(20);
  });

  it('refuses a signed-out viewer everything, including looking as if they may', () => {
    kamers.grant(ROOM, 20, 'van de Keeper', KEEPER);
    const shut = plek(ROOM, PAID_PLANK);
    const open = plek(ROOM, FREE_PLANK);

    expect(() => kamers.unlockSlot(shut.id, NOBODY)).toThrow(kamers.KamerError);
    expect(() => kamers.placeItem(open.id, 'v-lantaarn', NOBODY)).toThrow(kamers.KamerError);
    expect(() => kamers.clearSlot(open.id, NOBODY)).toThrow(kamers.KamerError);
    expect(() => kamers.grant(ROOM, 5, 'zomaar', NOBODY)).toThrow(/Keeper/);

    // §89: and they may not even look. A kamer's view dial ships 'all', which
    // is everyone *signed in*; signed out, there is no kamer to read.
    expect(kamers.viewRoomBySlug('bram-kuiper', NOBODY)).toBeNull();
  });

  it('lets the onderzoeker who lives there arrange it', () => {
    kamers.grant(ROOM, 20, 'van de Keeper', KEEPER);
    kamers.unlockSlot(plek(ROOM, PAID_PLANK).id, BRAM);
    kamers.placeItem(plek(ROOM, FREE_PLANK).id, 'v-lantaarn', BRAM);
    kamers.clearSlot(plek(ROOM, FREE_PLANK).id, BRAM);

    expect(plek(ROOM, PAID_PLANK).unlockedAt).not.toBeNull();
    expect(plek(ROOM, FREE_PLANK).entryId).toBeNull();
    expect(kamers.viewRoomBySlug('bram-kuiper', BRAM)!.canArrange).toBe(true);
  });

  it('lets a Keeper arrange anybody’s, because a Keeper is above both dials', () => {
    kamers.grant(ROOM, 20, 'van de Keeper', KEEPER);
    kamers.unlockSlot(plek(ROOM, PAID_MUUR).id, KEEPER);
    kamers.placeItem(plek(ROOM, FREE_MUUR).id, 'v-schilderij', KEEPER);

    expect(plek(ROOM, PAID_MUUR).unlockedAt).not.toBeNull();
    expect(plek(ROOM, FREE_MUUR).entryId).toBe('v-schilderij');
    expect(kamers.viewRoomBySlug('bram-kuiper', KEEPER)!.canArrange).toBe(true);
  });

  it('refuses the grootboek to everybody but the Keeper — the owner included', () => {
    expect(() => kamers.grant(ROOM, 5, 'voor mezelf', BRAM)).toThrow(/Alleen de Keeper/);
    expect(() => kamers.grant(ROOM, 5, 'voor hem', AAGJE)).toThrow(/Alleen de Keeper/);
    expect(() => kamers.grant(ROOM, 5, 'zomaar', NOBODY)).toThrow(/Alleen de Keeper/);
    expect(ledgerRows(ROOM)).toHaveLength(0);
    expect(kamers.balanceOf(ROOM)).toBe(0);

    kamers.grant(ROOM, 5, 'na de sessie', KEEPER);
    expect(kamers.balanceOf(ROOM)).toBe(5);
  });

  it('says on the reading itself who may do what, and only the Keeper may give', () => {
    expect(kamers.viewRoomBySlug('bram-kuiper', AAGJE)).toMatchObject({ canArrange: false, canGrant: false });
    expect(kamers.viewRoomBySlug('bram-kuiper', BRAM)).toMatchObject({ canArrange: true, canGrant: false });
    expect(kamers.viewRoomBySlug('bram-kuiper', KEEPER)).toMatchObject({ canArrange: true, canGrant: true });
  });

  it('refuses a grant to a kamer that is not there', () => {
    expect(() => kamers.grant('geen-kamer', 5, 'nergens', KEEPER)).toThrow(/bestaat niet/);
  });
});

/* ======================================================== D. het inruimen */

describe('§79: wat er op een plek mag liggen', () => {
  it('refuses a plek that is still on slot', () => {
    expect(() => kamers.placeItem(plek(ROOM, PAID_PLANK).id, 'v-lantaarn', BRAM)).toThrow(/nog op slot/);
    expect(plek(ROOM, PAID_PLANK).entryId).toBeNull();
  });

  /*
   * §80 changed this sentence, not this rule. "Dat is geen voorwerp" stopped
   * being true the moment huisraad existed — a kamer takes both, and what it
   * asks of either is the same: carry a `plek` field. The refusal now says
   * what it means.
   */
  it('refuses an artikel that belongs in no kamer at all', () => {
    expect(() => kamers.placeItem(plek(ROOM, FREE_PLANK).id, 'n-persoon', BRAM)).toThrow(/hoort nergens in een kamer/);
    expect(plek(ROOM, FREE_PLANK).entryId).toBeNull();
  });

  it('refuses a plek field that is not a kind of plek', () => {
    expect(() => kamers.placeItem(plek(ROOM, FREE_PLANK).id, 'n-onzin', BRAM)).toThrow(/hoort nergens in een kamer/);
    expect(kamers.plekKindsOf('n-onzin')).toEqual([]);
    expect(kamers.plekKindsOf('n-persoon')).toEqual([]);
    expect(kamers.plekKindsOf('v-lantaarn')).toEqual(['plank']);
  });

  it('refuses a voorwerp that asks for a different kind of plek', () => {
    expect(() => kamers.placeItem(plek(ROOM, FREE_PLANK).id, 'v-schilderij', BRAM)).toThrow(/niet op deze plek/);
    expect(() => kamers.placeItem(plek(ROOM, FREE_MUUR).id, 'v-lantaarn', BRAM)).toThrow(/niet op deze plek/);
    expect(() => kamers.placeItem(plek(ROOM, FREE_BUREAU).id, 'v-lantaarn', BRAM)).toThrow(/niet op deze plek/);
    expect(plek(ROOM, FREE_PLANK).entryId).toBeNull();
    expect(plek(ROOM, FREE_MUUR).entryId).toBeNull();
  });

  /**
   * §9 and §44, and the message is the same one an artikel that was never
   * written would get: "dat artikel bestaat niet". Saying "you may not see
   * that" would be saying it is there.
   */
  it('refuses an artikel the arranger cannot see, and says nothing about it', () => {
    const shelf = plek(ROOM, FREE_PLANK).id;
    expect(() => kamers.placeItem(shelf, 'v-geheim', BRAM)).toThrow(/bestaat niet/);
    expect(() => kamers.placeItem(shelf, 'v-prep', BRAM)).toThrow(/bestaat niet/);
    expect(() => kamers.placeItem(shelf, 'bestaat-echt-niet', BRAM)).toThrow(/bestaat niet/);
    expect(plek(ROOM, FREE_PLANK).entryId).toBeNull();
  });

  it('refuses one that is already lying somewhere else in this kamer', () => {
    kamers.grant(ROOM, 10, 'sparen', KEEPER);
    kamers.unlockSlot(plek(ROOM, PAID_PLANK).id, BRAM);
    kamers.placeItem(plek(ROOM, FREE_PLANK).id, 'v-lantaarn', BRAM);

    expect(() => kamers.placeItem(plek(ROOM, PAID_PLANK).id, 'v-lantaarn', BRAM)).toThrow(/al ergens in deze kamer/);
    expect(plek(ROOM, PAID_PLANK).entryId).toBeNull();
    expect(plek(ROOM, FREE_PLANK).entryId).toBe('v-lantaarn');
  });

  it('puts a well-formed one down, and says when', () => {
    kamers.placeItem(plek(ROOM, FREE_PLANK).id, 'v-lantaarn', BRAM);
    const shelf = plek(ROOM, FREE_PLANK);
    expect(shelf.entryId).toBe('v-lantaarn');
    expect(shelf.placedAt).not.toBeNull();

    // And it reads back as the thing it is, not as an id.
    const view = kamers.viewRoomBySlug('bram-kuiper', BRAM)!;
    const seen = view.slots.find((slot) => slot.sortOrder === FREE_PLANK)!;
    expect(seen.item).toMatchObject({ id: 'v-lantaarn', name: 'Een koperen lantaarn', slug: 'koperen-lantaarn' });
    expect(seen.veiled).toBe(false);
  });

  it('lets two different voorwerpen share a kamer, one plek each', () => {
    kamers.placeItem(plek(ROOM, FREE_PLANK).id, 'v-lantaarn', BRAM);
    kamers.placeItem(plek(ROOM, FREE_MUUR).id, 'v-schilderij', BRAM);
    kamers.placeItem(plek(ROOM, FREE_BUREAU).id, 'v-inktpot', BRAM);
    expect(slotsOf(ROOM).filter((slot) => slot.entryId).map((slot) => slot.entryId)).toEqual([
      'v-inktpot',
      'v-lantaarn',
      'v-schilderij',
    ]);
  });

  /**
   * **No refund**, and that is the assertion — not the empty plek, which is
   * the easy half. Taking something off a shelf writes no line at all, because
   * the munt was spent on owning it and it still is.
   */
  it('empties a plek without giving anything back', () => {
    kamers.grant(ROOM, 10, 'sparen', KEEPER);
    kamers.unlockSlot(plek(ROOM, PAID_PLANK).id, BRAM);
    kamers.placeItem(plek(ROOM, PAID_PLANK).id, 'v-lantaarn', BRAM);
    const price = plek(ROOM, PAID_PLANK).price;
    const before = ledgerRows(ROOM);

    kamers.clearSlot(plek(ROOM, PAID_PLANK).id, BRAM);

    const after = plek(ROOM, PAID_PLANK);
    expect(after.entryId).toBeNull();
    expect(after.placedAt).toBeNull();
    // The plek stays bought.
    expect(after.unlockedAt).not.toBeNull();
    // And not one line was added.
    expect(ledgerRows(ROOM)).toEqual(before);
    expect(kamers.balanceOf(ROOM)).toBe(10 - price);
  });

  it('is quiet about an empty plek it is asked to empty', () => {
    expect(() => kamers.clearSlot(plek(ROOM, FREE_PLANK).id, BRAM)).not.toThrow();
    expect(ledgerRows(ROOM)).toHaveLength(0);
  });

  it('lets a voorwerp move to another plek once it is picked up', () => {
    kamers.grant(ROOM, 10, 'sparen', KEEPER);
    kamers.unlockSlot(plek(ROOM, PAID_PLANK).id, BRAM);
    kamers.placeItem(plek(ROOM, FREE_PLANK).id, 'v-lantaarn', BRAM);
    kamers.clearSlot(plek(ROOM, FREE_PLANK).id, BRAM);
    kamers.placeItem(plek(ROOM, PAID_PLANK).id, 'v-lantaarn', BRAM);
    expect(plek(ROOM, PAID_PLANK).entryId).toBe('v-lantaarn');
    expect(plek(ROOM, FREE_PLANK).entryId).toBeNull();
  });

  it('refuses a plek that does not exist, to place in or to empty', () => {
    expect(() => kamers.placeItem('bestaat-niet', 'v-lantaarn', BRAM)).toThrow(/bestaat niet/);
    expect(() => kamers.clearSlot('bestaat-niet', BRAM)).toThrow(/bestaat niet/);
  });
});

/* ============================================================= E. de sluier */

describe('§79: de sluier — §76’s regel op een nieuwe plek', () => {
  /** Everything about one plek, as a reader is handed it. */
  const slotOf = (view: ReturnType<typeof kamers.viewRoomBySlug>, sortOrder: number) =>
    view!.slots.find((slot) => slot.sortOrder === sortOrder)!;

  it('shows a voorwerp the looker may not see as filled and nameless, never as empty', () => {
    kamers.placeItem(plek(ROOM, FREE_PLANK).id, 'v-geheim', KEEPER);
    const shelf = slotOf(kamers.viewRoomBySlug('bram-kuiper', AAGJE), FREE_PLANK);

    expect(shelf.veiled).toBe(true);
    expect(shelf.item).toBeNull();
    expect(shelf.locked).toBe(false);
    // The lie this rule exists to prevent: an empty plek that is really full.
    const empty = slotOf(kamers.viewRoomBySlug('bram-kuiper', AAGJE), FREE_MUUR);
    expect(empty).toMatchObject({ veiled: false, item: null });
    expect(shelf.veiled).not.toBe(empty.veiled);
  });

  it('veils it from the owner too, because §9 sits above §17', () => {
    kamers.placeItem(plek(ROOM, FREE_PLANK).id, 'v-geheim', KEEPER);
    const shelf = slotOf(kamers.viewRoomBySlug('bram-kuiper', BRAM), FREE_PLANK);
    expect(shelf).toMatchObject({ veiled: true, item: null });
  });

  /**
   * The whole security property, and the reason this file exists: a
   * Keeper-only voorwerp and the far side of a tweeling must be **the same
   * answer**. A plek that veiled one and named the other — or veiled them
   * differently — would say which hidden things there are without printing a
   * name, which is exactly §76's leak in a new room.
   *
   * Asked of the *same plek*, so the two readings differ in nothing at all if
   * the rule holds: same id, same kind, same price, same everything.
   */
  it('gives one single answer for §9 and for the far side of §44', () => {
    const shelf = plek(ROOM, FREE_PLANK).id;

    kamers.placeItem(shelf, 'v-geheim', KEEPER);
    const keeperOnly: SlotView = slotOf(kamers.viewRoomBySlug('bram-kuiper', AAGJE), FREE_PLANK);

    kamers.clearSlot(shelf, KEEPER);
    kamers.placeItem(shelf, 'v-prep', KEEPER);
    const farSide: SlotView = slotOf(kamers.viewRoomBySlug('bram-kuiper', AAGJE), FREE_PLANK);

    expect(JSON.stringify(farSide)).toBe(JSON.stringify(keeperOnly));
    expect(farSide).toEqual(keeperOnly);
    expect(farSide).toMatchObject({ veiled: true, item: null });
  });

  it('never leaks the veiled thing through anything else on the reading either', () => {
    kamers.placeItem(plek(ROOM, FREE_PLANK).id, 'v-geheim', KEEPER);
    const view = kamers.viewRoomBySlug('bram-kuiper', AAGJE)!;
    const printed = JSON.stringify(view);
    expect(printed).not.toContain('v-geheim');
    expect(printed).not.toContain('Het zwarte boek');
    expect(printed).not.toContain('het-zwarte-boek');
  });

  /** The control: whoever may see it is handed the thing itself. */
  it('hands the real voorwerp to whoever may see it', () => {
    kamers.placeItem(plek(ROOM, FREE_PLANK).id, 'v-geheim', KEEPER);
    const shelf = slotOf(kamers.viewRoomBySlug('bram-kuiper', KEEPER), FREE_PLANK);
    expect(shelf.veiled).toBe(false);
    expect(shelf.item).toMatchObject({ id: 'v-geheim', name: 'Het zwarte boek' });
  });

  it('and the near side of a tweeling stays named, to everybody', () => {
    kamers.placeItem(plek(ROOM, FREE_PLANK).id, 'v-wiki', BRAM);
    const shelf = slotOf(kamers.viewRoomBySlug('bram-kuiper', AAGJE), FREE_PLANK);
    expect(shelf.veiled).toBe(false);
    expect(shelf.item).toMatchObject({ id: 'v-wiki', name: 'De gebroken spiegel' });
  });
});

/* ============================================================== F. de vorm */

describe('§79: de vorm groeit alleen aan', () => {
  it('seeds every rung the shape has, in its own place', () => {
    const rows = slotsOf(ROOM);
    expect(rows).toHaveLength(shape.ROOM_SHAPE.length);
    expect(rows.map((row) => ({ kind: row.kind, price: row.price }))).toEqual(
      shape.ROOM_SHAPE.map((seed) => ({ kind: seed.kind, price: seed.price })),
    );
    expect(rows.map((row) => row.sortOrder)).toEqual(shape.ROOM_SHAPE.map((_, index) => index));
  });

  it('opens the free plekken and shuts everything with a price on it', () => {
    for (const row of slotsOf(ROOM)) {
      expect(row.unlockedAt === null).toBe(row.price > 0);
    }
    expect(slotsOf(ROOM).filter((row) => row.unlockedAt !== null).length).toBeGreaterThan(0);
  });

  it('changes nothing when it is run again', () => {
    const before = slotsOf(ROOM);
    kamers.syncShape(ROOM);
    kamers.syncShape(ROOM);
    expect(slotsOf(ROOM)).toEqual(before);
    expect(slotsOf(ROOM)).toHaveLength(shape.ROOM_SHAPE.length);
  });

  /**
   * A rung appended to `ROOM_SHAPE` has to appear in every kamer that already
   * exists — locked, at its price — without touching a single plek somebody
   * already paid for. Simulated by taking the tail off one kamer, which is the
   * same situation seen from the other end.
   */
  it('adds the rungs a kamer is missing, as locked plekken', () => {
    kamers.grant(ROOM, 100, 'genoeg', KEEPER);
    kamers.unlockSlot(plek(ROOM, PAID_PLANK).id, BRAM);
    const bought = plek(ROOM, PAID_PLANK);

    const tail = shape.ROOM_SHAPE.length - 3;
    sqlite.prepare('DELETE FROM room_slots WHERE room_id = ? AND sort_order >= ?').run(ROOM, tail);
    expect(slotsOf(ROOM)).toHaveLength(tail);

    kamers.syncShape(ROOM);

    const rows = slotsOf(ROOM);
    expect(rows).toHaveLength(shape.ROOM_SHAPE.length);
    for (const row of rows.filter((candidate) => candidate.sortOrder >= tail)) {
      expect(row.price).toBe(shape.ROOM_SHAPE[row.sortOrder].price);
      expect(row.kind).toBe(shape.ROOM_SHAPE[row.sortOrder].kind);
      // New rungs arrive shut, whatever they cost.
      expect(row.unlockedAt).toBeNull();
    }
    // And the one that was paid for kept its id, its price and its open door.
    expect(plek(ROOM, PAID_PLANK)).toEqual(bought);
  });

  it('never renumbers: a rung is its position, and a gap is refilled in place', () => {
    const gap = PAID_MUUR;
    const others = slotsOf(ROOM).filter((row) => row.sortOrder !== gap);
    sqlite.prepare('DELETE FROM room_slots WHERE room_id = ? AND sort_order = ?').run(ROOM, gap);

    kamers.syncShape(ROOM);

    const filled = plek(ROOM, gap);
    expect(filled.kind).toBe(shape.ROOM_SHAPE[gap].kind);
    expect(filled.price).toBe(shape.ROOM_SHAPE[gap].price);
    // Everything either side of the gap is the row it was.
    expect(slotsOf(ROOM).filter((row) => row.sortOrder !== gap)).toEqual(others);
  });

  it('re-prices nothing a kamer already has, whatever the shape now says', () => {
    const shelf = plek(ROOM, PAID_PLANK);
    sqlite.prepare('UPDATE room_slots SET price = 999 WHERE id = ?').run(shelf.id);
    kamers.syncShape(ROOM);
    expect(plek(ROOM, PAID_PLANK).price).toBe(999);
  });

  it('is the same ladder for everybody, made on the first read', () => {
    const hers = kamers.getOrCreateRoom('e-aagje')!;
    expect(hers).not.toBe(ROOM);
    expect(slotsOf(hers).map((row) => [row.kind, row.price])).toEqual(
      slotsOf(ROOM).map((row) => [row.kind, row.price]),
    );
  });
});

/* ================================================= G. de kamer en zijn mens */

describe('§79: een kamer volgt zijn onderzoeker', () => {
  it('gives no kamer to an artikel nobody wears', () => {
    expect(kamers.getOrCreateRoom('e-los')).toBeNull();
    expect(kamers.getOrCreateRoom('v-lantaarn')).toBeNull();
    expect(kamers.getOrCreateRoom('bestaat-niet')).toBeNull();
    expect(kamers.viewRoomBySlug('de-veerman', KEEPER)).toBeNull();
  });

  it('makes one kamer per onderzoeker, however often it is asked', () => {
    expect(kamers.getOrCreateRoom('e-bram')).toBe(ROOM);
    expect(kamers.getOrCreateRoom('e-bram')).toBe(ROOM);
    const count = sqlite.prepare('SELECT COUNT(*) AS n FROM rooms WHERE entry_id = ?').get('e-bram') as { n: number };
    expect(count.n).toBe(1);
  });

  /**
   * `rooms` has no `deleted_at`, deliberately: the artikel's prullenbak *is*
   * the kamer's, and two bin flags that can drift apart are worse than one.
   * This is the test that guards that decision — it is the only thing standing
   * between here and somebody adding the column "for symmetry".
   */
  it('has no bin of its own', () => {
    const columns = (sqlite.prepare('PRAGMA table_info(rooms)').all() as { name: string }[]).map((row) => row.name);
    expect(columns).not.toContain('deleted_at');
    expect(columns).not.toContain('keeper_only');
    expect(columns).toContain('entry_id');
    expect(columns).toContain('view_mode');
    expect(columns).toContain('edit_mode');
    expect(columns).toContain('access_locked');
  });

  it('goes into the prullenbak with its onderzoeker and comes back out with it', () => {
    kamers.grant(ROOM, 10, 'sparen', KEEPER);
    kamers.placeItem(plek(ROOM, FREE_PLANK).id, 'v-lantaarn', BRAM);
    expect(kamers.canSeeRoom(ROOM, BRAM)).toBe(true);

    softDeleteEntry('e-bram', KEEPER.id);

    // Gone for everybody, the Keeper included: a binned artikel is binned.
    expect(kamers.viewRoomBySlug('bram-kuiper', BRAM)).toBeNull();
    expect(kamers.viewRoomBySlug('bram-kuiper', AAGJE)).toBeNull();
    expect(kamers.viewRoomBySlug('bram-kuiper', KEEPER)).toBeNull();
    expect(kamers.canSeeRoom(ROOM, BRAM)).toBe(false);
    expect(kamers.canSeeRoom(ROOM, KEEPER)).toBe(false);
    expect(kamers.roomSummary('e-bram', BRAM)).toBeNull();

    restoreFromTrash('entry', 'e-bram', KEEPER.id);

    // And it is the same kamer, with the same saldo and the same lantaarn.
    const back = kamers.viewRoomBySlug('bram-kuiper', BRAM)!;
    expect(back.id).toBe(ROOM);
    expect(back.balance).toBe(10);
    expect(kamers.canSeeRoom(ROOM, BRAM)).toBe(true);
    expect(back.slots.find((slot) => slot.sortOrder === FREE_PLANK)!.item).toMatchObject({ id: 'v-lantaarn' });
  });

  it('hides the kamer of an onderzoeker the table may not know about', () => {
    const hidden = kamers.getOrCreateRoom('e-verborgen')!;
    expect(kamers.canSeeRoom(hidden, AAGJE)).toBe(false);
    // Even the account that wears it: §9 is above §17, both ways round.
    expect(kamers.canSeeRoom(hidden, BRAM)).toBe(false);
    expect(kamers.canSeeRoom(hidden, KEEPER)).toBe(true);
    expect(kamers.viewRoomBySlug('de-stille-gast', AAGJE)).toBeNull();
    expect(kamers.viewRoomBySlug('de-stille-gast', KEEPER)).not.toBeNull();
  });

  it('says who lives there on the reading, and it is the wearer', () => {
    const view = kamers.viewRoomBySlug('bram-kuiper', AAGJE)!;
    expect(view.ownerId).toBe('bram');
    expect(view.character).toMatchObject({ id: 'e-bram', name: 'Bram Kuiper', slug: 'bram-kuiper' });
  });

  it('answers nothing for a kamer that is not there', () => {
    expect(kamers.canSeeRoom('geen-kamer', KEEPER)).toBe(false);
    expect(kamers.canSeeRoom('geen-kamer', BRAM)).toBe(false);
    expect(kamers.viewRoomBySlug('bestaat-niet', KEEPER)).toBeNull();
  });
});

/* ============================================================ H. de lijn */

describe('§79: de live-lijn vraagt precies wat de kamer vraagt', () => {
  it('agrees with canSeeRoom for the owner, another player and a Keeper', () => {
    for (const viewer of [BRAM, AAGJE, KEEPER]) {
      expect(canWatch(`room:${ROOM}`, viewer)).toBe(kamers.canSeeRoom(ROOM, viewer));
      expect(canWatch(`room:${ROOM}`, viewer)).toBe(true);
    }
  });

  it('agrees with canSeeRoom for a kamer whose onderzoeker is in the prullenbak', () => {
    softDeleteEntry('e-bram', KEEPER.id);
    for (const viewer of [BRAM, AAGJE, KEEPER]) {
      expect(canWatch(`room:${ROOM}`, viewer)).toBe(kamers.canSeeRoom(ROOM, viewer));
      expect(canWatch(`room:${ROOM}`, viewer)).toBe(false);
    }
    restoreFromTrash('entry', 'e-bram', KEEPER.id);
  });

  it('agrees with canSeeRoom for a kamer whose onderzoeker is Keeper-only', () => {
    const hidden = kamers.getOrCreateRoom('e-verborgen')!;
    for (const viewer of [BRAM, AAGJE, KEEPER]) {
      expect(canWatch(`room:${hidden}`, viewer)).toBe(kamers.canSeeRoom(hidden, viewer));
    }
    expect(canWatch(`room:${hidden}`, AAGJE)).toBe(false);
    expect(canWatch(`room:${hidden}`, BRAM)).toBe(false);
    expect(canWatch(`room:${hidden}`, KEEPER)).toBe(true);
  });

  it('refuses a room key for a kamer that does not exist, to everybody', () => {
    expect(canWatch('room:geen-kamer', KEEPER)).toBe(false);
    expect(canWatch('room:geen-kamer', BRAM)).toBe(false);
  });

  /**
   * The line refuses everyone signed out before it asks any kind at all, so it
   * is *stricter* than `canSeeRoom` here rather than equal to it — a kamer's
   * view dial ships 'all' and a page may be read by a stranger, but nobody
   * without an account is ever handed a socket.
   */
  it('hands no socket to anybody signed out, whatever the dial says', () => {
    // §89: and since round 50 the kamer itself agrees — signed out sees nothing.
    expect(kamers.canSeeRoom(ROOM, NOBODY)).toBe(false);
    expect(canWatch(`room:${ROOM}`, NOBODY)).toBe(false);
  });
});

/* ===================================================================== */
/*  Wat de review vond, en wat er daarna niet meer mag                    */
/* ===================================================================== */

/**
 * §79: three things found by asking the awkward questions after it was built,
 * all three fixed, all three pinned here.
 *
 * The first is the one that matters most, and it is not a tidiness bug: a
 * dangling reference does not leave litter, it **corrupts the veil**. `veiled`
 * means *something is here that you may not see*, and that sentence is only
 * worth anything if it is never said about nothing.
 */
describe('§79: wat er kapot was en niet meer kapot mag', () => {
  it('een vernietigd voorwerp laat geen versluierde plek achter', () => {
    // A throwaway voorwerp: destroying is permanent, and the fixtures above are
    // shared by every case in this file.
    sqlite
      .prepare(
        `INSERT INTO entries (id, type_id, name, slug, fields, tags, visibility, created_by, view_mode, edit_mode)
         VALUES ('v-weg', 'item', 'Een kaars', 'een-kaars', '{"plek":"plank"}', '[]', 'all', 'keeper-1', 'all', 'all')`,
      )
      .run();
    const plank = plek(ROOM, shape.ROOM_SHAPE.findIndex((seed) => seed.kind === 'plank' && seed.price === 0));
    kamers.placeItem(plank.id, 'v-weg', BRAM);
    expect(kamers.viewRoomBySlug('bram-kuiper', KEEPER)!.slots.find((s) => s.id === plank.id)!.item?.id).toBe(
      'v-weg',
    );

    softDeleteEntry('v-weg', KEEPER.id);
    destroyFromTrash('entry', 'v-weg', KEEPER.id);

    // Not "er ligt iets" to a Keeper about a thing that no longer exists.
    const after = kamers.viewRoomBySlug('bram-kuiper', KEEPER)!.slots.find((s) => s.id === plank.id)!;
    expect(after.veiled).toBe(false);
    expect(after.item).toBeNull();
    expect(after.locked).toBe(false);
    // And the owner sees a plek they can put something else on.
    const mine = kamers.viewRoomBySlug('bram-kuiper', BRAM)!.slots.find((s) => s.id === plank.id)!;
    expect(mine).toEqual(after);
    expect(kamers.roomSummary('e-bram', BRAM)!.filled).toBe(0);
  });

  it('een vernietigde onderzoeker laat geen kamer, plekken of grootboek achter', () => {
    sqlite
      .prepare(
        `INSERT INTO entries (id, type_id, name, slug, fields, tags, visibility, created_by, view_mode, edit_mode)
         VALUES ('e-weg', 'investigator', 'Tijdelijk', 'tijdelijk', '{}', '[]', 'all', 'keeper-1', 'all', 'all')`,
      )
      .run();
    sqlite.prepare(`INSERT INTO user_characters (user_id, entry_id) VALUES ('bram', 'e-weg')`).run();
    const doomed = kamers.getOrCreateRoom('e-weg')!;
    kamers.grant(doomed, 5, 'sessie 1', KEEPER);

    softDeleteEntry('e-weg', KEEPER.id);
    destroyFromTrash('entry', 'e-weg', KEEPER.id);

    const count = (table: string) =>
      Number((sqlite.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE room_id = ?`).get(doomed) as { n?: number })?.n ?? 0);
    expect(count('room_slots')).toBe(0);
    expect(count('room_ledger')).toBe(0);
    expect(
      Number((sqlite.prepare('SELECT COUNT(*) AS n FROM rooms WHERE id = ?').get(doomed) as { n?: number })?.n ?? 0),
    ).toBe(0);
  });

  /**
   * The wearer is the owner, and it is asked live.
   *
   * `rooms.created_by` is written once, and a karakter changing hands is the
   * ordinary thing a Keeper does (§18c). While `canArrange` read that column,
   * one `RoomView` said *Aagje lives here* and *Bram may rearrange it* — and
   * Bram could spend her munt.
   */
  it('een onderzoeker die van hand wisselt neemt zijn kamer mee', () => {
    kamers.grant(ROOM, 10, 'sessie 1', KEEPER);
    expect(kamers.viewRoomBySlug('bram-kuiper', BRAM)!.canArrange).toBe(true);

    // The Keeper hands Bram's onderzoeker to Aagje.
    sqlite.prepare(`UPDATE user_characters SET user_id = 'aagje' WHERE entry_id = 'e-bram'`).run();

    const hers = kamers.viewRoomBySlug('bram-kuiper', AAGJE)!;
    const his = kamers.viewRoomBySlug('bram-kuiper', BRAM)!;
    // One fact, one answer: whoever wears it lives there and arranges it.
    expect(hers.ownerId).toBe('aagje');
    expect(hers.canArrange).toBe(true);
    expect(his.ownerId).toBe('aagje');
    expect(his.canArrange).toBe(false);

    const locked = plek(ROOM, shape.ROOM_SHAPE.findIndex((seed) => seed.price > 0));
    expect(() => kamers.unlockSlot(locked.id, BRAM)).toThrow(/jouw kamer niet/i);
    expect(() => kamers.unlockSlot(locked.id, AAGJE)).not.toThrow();

    sqlite.prepare(`UPDATE user_characters SET user_id = 'bram' WHERE entry_id = 'e-bram'`).run();
  });

  /**
   * One voorwerp lies in one plek in the whole archive, not one per kamer. A
   * lantaarn is one thing in the world — which is the reason it is an artikel
   * — and two onderzoekers displaying the same one is a sentence about the
   * fiction that nobody said.
   */
  it('één voorwerp ligt in één kamer, niet in twee', () => {
    const roomB = kamers.getOrCreateRoom('e-aagje')!;
    const plankA = plek(ROOM, shape.ROOM_SHAPE.findIndex((seed) => seed.kind === 'plank' && seed.price === 0));
    const plankB = plek(roomB, shape.ROOM_SHAPE.findIndex((seed) => seed.kind === 'plank' && seed.price === 0));

    kamers.placeItem(plankA.id, 'v-lantaarn', BRAM);
    expect(() => kamers.placeItem(plankB.id, 'v-lantaarn', AAGJE)).toThrow(/andere kamer/i);

    // And it moves properly once it is put down.
    kamers.clearSlot(plankA.id, BRAM);
    expect(() => kamers.placeItem(plankB.id, 'v-lantaarn', AAGJE)).not.toThrow();
  });
});
