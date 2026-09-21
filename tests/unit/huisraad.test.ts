import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';

/**
 * §80: huisraad — het mechanische ding dat een kamer inricht.
 *
 * A voorwerp (§24) is found in play, is narrative, and is one of a kind.
 * Huisraad is the other thing: only a Keeper makes one, it carries a price and
 * a few lines of prose about what it gives, players buy it with munten, and
 * several onderzoekers may own the same one. Both carry the field `plek`,
 * because a kamer asks the *thing* and not its soort — that is the whole reason
 * huisraad fits §79 without a line of code changing there.
 *
 * Five things are guarded here, and they are the five that would cost somebody
 * something real if they broke:
 *
 *   1. **The two flags live on the soort, in the real tables.** `keeper_made`
 *      and `one_of_a_kind` are claimed twice — by `lib/db/seed.mjs` for a fresh
 *      archive and by migration `0028_huisraad` for one that already exists —
 *      and everything below is built on them being right.
 *   2. **The lock behind the screen.** Leaving huisraad out of a player's
 *      nieuw-artikel list is the slot on the outside of the door; the refusal
 *      in `createEntry` is the lock, and a lock is only proven from the side of
 *      the person who may not.
 *   3. **The claim.** §79 kept one voorwerp on one plek with a unique index on
 *      `entry_id`. §80 needed two onderzoekers to own the same leesstoel, and
 *      the temptation was to drop the index — trading a guarantee for a check
 *      somebody forgets. It *moved*, to `claim`, filled only for a soort there
 *      is one of. So this file asserts the index itself, from `sqlite_master`,
 *      and then asserts that it bites.
 *   4. **Money, and every refusal that must not charge.** Copied wholesale from
 *      `tests/unit/kamer.test.ts`: every refusal is checked twice, once for the
 *      refusal and once for the line that was *not* written.
 *   5. **The veil, one rung deeper.** §76's rule reached the plek in §79; §80
 *      gave the kamer a list of what everything in it *gives*, which is a
 *      second road out for the same secret. A veiled thing must contribute
 *      nothing at all — no entry in `effects`, and not one word of its text
 *      anywhere in the serialised `RoomView` — and a Keeper-only thing (§9) and
 *      the far side of a tweeling (§44) must be the *same* answer.
 *
 * Asked of a real SQLite file, because all of it is SQL: the two columns, the
 * partial unique index, the conditional UPDATE and the visibility condition.
 */

const dir = mkdtempSync(join(tmpdir(), 'zcf-huisraad-'));
process.env.DATA_DIR = dir;

type Kamers = typeof import('@/lib/kamers/service');
type Shape = typeof import('@/lib/kamers/shape');
type PlekKind = import('@/lib/kamers/shape').PlekKind;

let kamers: Kamers;
let shape: Shape;
let createEntry: typeof import('@/lib/entries/service').createEntry;
let sqlite: typeof import('@/lib/db').sqlite;

/** §17: a Keeper is above both dials, and §80: the only hand that makes huisraad. */
const KEEPER = { id: 'keeper-1', isKeeper: true };
/** Bram wears the onderzoeker whose kamer this is. */
const BRAM = { id: 'bram', isKeeper: false };
/** Aagje wears another one, and has a kamer of her own. */
const AAGJE = { id: 'aagje', isKeeper: false };

/* ------------------------------------------------------------ the fixtures */

type SlotRow = {
  id: string;
  kind: PlekKind;
  sortOrder: number;
  price: number;
  unlockedAt: number | null;
  entryId: string | null;
  placedAt: number | null;
  claim: string | null;
};

const slotsOf = (roomId: string) =>
  sqlite
    .prepare(
      `SELECT id, kind, sort_order AS sortOrder, price, unlocked_at AS unlockedAt,
              entry_id AS entryId, placed_at AS placedAt, claim
       FROM room_slots WHERE room_id = ? ORDER BY sort_order`,
    )
    .all(roomId) as SlotRow[];

/** The plek at one rung of `ROOM_SHAPE`, by its position — never by its index in a list. */
const plek = (roomId: string, sortOrder: number) => {
  const row = slotsOf(roomId).find((slot) => slot.sortOrder === sortOrder);
  if (!row) throw new Error(`geen plek op ${sortOrder}`);
  return row;
};

type LedgerRow = { id: string; delta: number; kind: string; reason: string; slotId: string | null; entryId: string | null };

/** The grootboek in writing order. */
const ledgerRows = (roomId: string) =>
  sqlite
    .prepare(
      `SELECT id, delta, kind, reason, slot_id AS slotId, entry_id AS entryId
       FROM room_ledger WHERE room_id = ? ORDER BY rowid`,
    )
    .all(roomId) as LedgerRow[];

const typeRow = (slug: string) =>
  sqlite.prepare('SELECT id, slug, keeper_made AS keeperMade, one_of_a_kind AS oneOfAKind FROM entry_types WHERE slug = ?').get(slug) as
    | { id: string; slug: string; keeperMade: number; oneOfAKind: number }
    | undefined;

/** The rungs these tests stand on, found rather than written down. */
let FREE_BUREAU: number;
let FREE_PLANK: number;
let FREE_MUUR: number;
let PAID_PLANK: number;

/** Bram's kamer and Aagje's, rebuilt before every test. */
let ROOM: string;
let ROOM_B: string;

beforeAll(async () => {
  const dbModule = await import('@/lib/db');
  sqlite = dbModule.sqlite;
  kamers = await import('@/lib/kamers/service');
  shape = await import('@/lib/kamers/shape');
  createEntry = (await import('@/lib/entries/service')).createEntry;
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
  ] as const) {
    run(
      `INSERT INTO users (id, username, username_lower, password_hash, is_keeper) VALUES (?, ?, ?, 'x', ?)`,
      id,
      name,
      name.toLowerCase(),
      keeper,
    );
  }

  const HUISRAAD = typeRow('huisraad')?.id;
  if (!HUISRAAD) throw new Error('de soort huisraad staat niet in het archief');

  /**
   * §80 is about a *soort*, not about the two the seed ships, so one more soort
   * exists here: keeper-made **and** one of a kind. It is the combination the
   * claim column is really about, and nothing in `seed.mjs` has it.
   */
  run(
    `INSERT INTO entry_types (id, slug, label, icon, colour, border, fields, sort_order, case_only, keeper_made, one_of_a_kind)
     VALUES ('type-uniek', 'uniek-huisraad', 'Uniek huisraad', 'home', '#4F6B57', 'solid', '[]', 56, 0, 1, 1)`,
  );

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
  run(`INSERT INTO user_characters (user_id, entry_id) VALUES ('bram', 'e-bram')`);
  run(`INSERT INTO user_characters (user_id, entry_id) VALUES ('aagje', 'e-aagje')`);

  const K = shape.VOORWERP_FIELD_KEY;
  const P = shape.PRICE_FIELD_KEY;
  const E = shape.EFFECT_FIELD_KEY;

  /* De voorwerpen (§24): one of a kind, made by anybody, never for sale. */
  entry('v-lantaarn', 'item', 'Een koperen lantaarn', 'koperen-lantaarn', { [K]: 'plank' });
  entry('v-schilderij', 'item', 'Een zeegezicht', 'zeegezicht', { [K]: 'muur' });
  /*
   * A voorwerp wearing a price, which the soortenschermen cannot make but a
   * hand-edited archive can. It is here to isolate one filter: the catalogue
   * asks `keeper_made`, and this row satisfies every other condition there is.
   */
  entry('v-prijskaartje', 'item', 'Een geprijsd voorwerp', 'geprijsd-voorwerp', { [K]: 'plank', [P]: 4 });

  /* Het huisraad (§80): keeper-made, priced, and several people may own one. */
  entry('h-stoel', HUISRAAD, 'Een leesstoel', 'leesstoel', {
    [K]: 'plank',
    [P]: 3,
    [E]: 'Een plek om te lezen.\r\n\n   Rust bij het haardvuur   \n\n',
  });
  entry('h-kast', HUISRAAD, 'Een wandkast', 'wandkast', { [K]: 'muur', [P]: 5, [E]: '   \n\n ' });
  entry('h-duur', HUISRAAD, 'Een staande klok', 'staande-klok', { [K]: 'plank', [P]: 100 });
  // Een prijs van nul is geen prijs: hetzelfde antwoord als helemaal geen veld.
  entry('h-nul', HUISRAAD, 'Een kruk', 'kruk', { [K]: 'plank', [P]: 0 });
  // Geen prijs: de Keeper geeft hem zelf weg. Niet in de catalogus, niet te koop.
  entry('h-gift', HUISRAAD, 'Een erfstuk', 'erfstuk', { [K]: 'plank', [E]: 'Van je grootmoeder geweest.' });
  entry('h-schrijfmap', HUISRAAD, 'Een schrijfmap', 'schrijfmap', { [K]: 'bureau', [P]: 4 });
  // §9: Keeper-only, and asking for a plank so it fits the same plek as the far
  // side below — the two have to be swappable for the veil test to mean anything.
  entry(
    'h-geheim',
    HUISRAAD,
    'Een zwarte spiegel',
    'zwarte-spiegel',
    { [K]: 'plank', [P]: 2, [E]: 'Het glas fluistert terug.' },
    'keeper',
  );
  // §44: a real tweeling. `h-prep` is the Keeper's side of `h-wiki`.
  entry('h-wiki', HUISRAAD, 'Een barometer', 'barometer', {
    [K]: 'plank',
    [P]: 2,
    [E]: 'Hij wijst altijd op storm.',
  });
  entry(
    'h-prep',
    HUISRAAD,
    'Een barometer — Keeper',
    'barometer-keeper',
    { [K]: 'plank', [P]: 2, [E]: 'Het glas fluistert terug.' },
    'keeper',
  );
  ties.linkTwin({ kind: 'entry', id: 'h-prep' }, { kind: 'entry', id: 'h-wiki' }, KEEPER.id);

  /* Keeper-made *and* one of a kind: the combination the claim exists for. */
  entry('u-bureaulamp', 'type-uniek', 'De lamp van de hoofdinspecteur', 'lamp-hoofdinspecteur', {
    [K]: 'bureau',
    [P]: 4,
  });
});

/**
 * Every test gets two kamers nobody has spent anything in. The rows are dropped
 * rather than the file, because the seeded soorten and the fixtures above are
 * what a kamer is made of.
 */
beforeEach(() => {
  sqlite.prepare('DELETE FROM room_ledger').run();
  sqlite.prepare('DELETE FROM room_slots').run();
  sqlite.prepare('DELETE FROM rooms').run();
  ROOM = kamers.getOrCreateRoom('e-bram')!;
  ROOM_B = kamers.getOrCreateRoom('e-aagje')!;
});

/* ====================================================== A. de twee vlaggen */

describe('§80: twee vlaggen op een soort', () => {
  /**
   * Asked of the real table, because both `lib/db/seed.mjs` and migration
   * `0028_huisraad` claim to set these and only one of the two runs on any
   * given archive. A fresh one — which is what this file opens — runs the
   * migration first and the seed after it.
   */
  it('geeft een voorwerp: uniek, en door iedereen te maken', () => {
    const row = typeRow('item');
    expect(row).toBeDefined();
    expect(row!.oneOfAKind).toBe(1);
    expect(row!.keeperMade).toBe(0);
  });

  it('geeft huisraad: van de Keeper, en er mogen er meer van zijn', () => {
    const row = typeRow('huisraad');
    expect(row).toBeDefined();
    expect(row!.keeperMade).toBe(1);
    expect(row!.oneOfAKind).toBe(0);
  });

  it('gives the archive exactly one soort huisraad, however it was built', () => {
    const rows = sqlite.prepare("SELECT id FROM entry_types WHERE slug = 'huisraad'").all();
    expect(rows).toHaveLength(1);
  });

  /** And `factsOf` is the one place the rest of the code reads them. */
  it('reads both flags back off the artikel, with its price and its lines', () => {
    expect(kamers.factsOf('v-lantaarn')).toEqual({
      plekken: ['plank'],
      keeperMade: false,
      oneOfAKind: true,
      price: null,
      effect: [],
    });
    expect(kamers.factsOf('h-stoel')).toEqual({
      plekken: ['plank'],
      keeperMade: true,
      oneOfAKind: false,
      price: 3,
      effect: ['Een plek om te lezen.', 'Rust bij het haardvuur'],
    });
    expect(kamers.factsOf('h-gift')?.price).toBeNull();
    // Nul munten is niet gratis — het is niet te koop, net als geen veld.
    expect(kamers.factsOf('h-nul')?.price).toBeNull();
    expect(kamers.factsOf('bestaat-niet')).toBeNull();
  });
});

/* ============================================= B. wie er een mag maken */

describe('§80: alleen de Keeper maakt huisraad — gevraagd door wie niet mag', () => {
  const huisraadCount = () =>
    Number(
      (
        sqlite
          .prepare("SELECT COUNT(*) AS n FROM entries WHERE type_id = (SELECT id FROM entry_types WHERE slug = 'huisraad')")
          .get() as { n: number }
      ).n,
    );

  it('refuses a player who says nothing about whose hand it is', () => {
    const before = huisraadCount();
    expect(() => createEntry({ typeSlug: 'huisraad', name: 'Een stiekeme stoel', createdBy: 'bram' })).toThrow(
      /Alleen de Keeper/,
    );
    expect(huisraadCount()).toBe(before);
  });

  it('refuses a caller that says so outright', () => {
    const before = huisraadCount();
    expect(() =>
      createEntry({ typeSlug: 'huisraad', name: 'Nog een stoel', createdBy: 'bram', actorIsKeeper: false }),
    ).toThrow(/Alleen de Keeper/);
    expect(huisraadCount()).toBe(before);
  });

  it('lets the Keeper make one, and it comes out keeper-made', () => {
    const made = createEntry({
      typeSlug: 'huisraad',
      name: 'Een koperen kachel',
      createdBy: KEEPER.id,
      actorIsKeeper: true,
    });
    expect(made.id).toBeTruthy();
    expect(kamers.factsOf(made.id)).toMatchObject({ keeperMade: true, oneOfAKind: false });
  });

  /**
   * And the flag is a lock on *this* soort only: forgetting to pass it costs
   * nothing anywhere else, which is why defaulting it to "not a Keeper" is
   * safe rather than cruel.
   */
  it('leaves an ordinary soort alone, whichever way the flag is passed', () => {
    expect(() => createEntry({ typeSlug: 'item', name: 'Een gevonden sleutel', createdBy: 'bram' })).not.toThrow();
    expect(() =>
      createEntry({ typeSlug: 'item', name: 'Een gevonden knoop', createdBy: 'bram', actorIsKeeper: false }),
    ).not.toThrow();
    expect(() =>
      createEntry({ typeSlug: 'item', name: 'Een gevonden lont', createdBy: KEEPER.id, actorIsKeeper: true }),
    ).not.toThrow();
  });
});

/* ================================================== C. de claim */

describe('§80: de claim — één ding in de wereld, of niet', () => {
  it('claims a voorwerp for the plek it lies on', () => {
    kamers.placeItem(plek(ROOM, FREE_PLANK).id, 'v-lantaarn', BRAM);
    const shelf = plek(ROOM, FREE_PLANK);
    expect(shelf.entryId).toBe('v-lantaarn');
    expect(shelf.claim).toBe('v-lantaarn');
  });

  it('claims nothing at all for huisraad', () => {
    kamers.placeItem(plek(ROOM, FREE_PLANK).id, 'h-stoel', BRAM);
    const shelf = plek(ROOM, FREE_PLANK);
    expect(shelf.entryId).toBe('h-stoel');
    expect(shelf.claim).toBeNull();
  });

  /** The whole point of §80: two onderzoekers, one leesstoel each, same leesstoel. */
  it('lets two onderzoekers own the same stuk huisraad', () => {
    kamers.placeItem(plek(ROOM, FREE_PLANK).id, 'h-stoel', BRAM);
    expect(() => kamers.placeItem(plek(ROOM_B, FREE_PLANK).id, 'h-stoel', AAGJE)).not.toThrow();

    expect(plek(ROOM, FREE_PLANK).entryId).toBe('h-stoel');
    expect(plek(ROOM_B, FREE_PLANK).entryId).toBe('h-stoel');
    expect(plek(ROOM, FREE_PLANK).claim).toBeNull();
    expect(plek(ROOM_B, FREE_PLANK).claim).toBeNull();
  });

  /** And §79's rule is exactly as it was for the thing there is one of. */
  it('refuses the second onderzoeker the same voorwerp', () => {
    kamers.placeItem(plek(ROOM, FREE_PLANK).id, 'v-lantaarn', BRAM);
    expect(() => kamers.placeItem(plek(ROOM_B, FREE_PLANK).id, 'v-lantaarn', AAGJE)).toThrow(/andere kamer/i);
    expect(plek(ROOM_B, FREE_PLANK).entryId).toBeNull();
    expect(plek(ROOM_B, FREE_PLANK).claim).toBeNull();
  });

  /**
   * §83 reversed this one on purpose, and it is the clearest place to say so.
   *
   * §80 refused a second copy of the same stuk huisraad in one kamer, with the
   * reasoning "two identical lamps on one grid is nobody's intention either".
   * That reasoning was ours. Nick, ronde 44: *"Je mag best vaker hetzelfde ding
   * in je kamer hebben staan."*
   */
  it('allows the same stuk huisraad twice in one kamer (§83, was refused in §80)', () => {
    kamers.grant(ROOM, 10, 'sparen', KEEPER);
    kamers.unlockSlot(plek(ROOM, PAID_PLANK).id, BRAM);
    kamers.placeItem(plek(ROOM, FREE_PLANK).id, 'h-stoel', BRAM);
    expect(() => kamers.placeItem(plek(ROOM, PAID_PLANK).id, 'h-stoel', BRAM)).not.toThrow();
    expect(plek(ROOM, PAID_PLANK).entryId).toBe('h-stoel');
    expect(plek(ROOM, FREE_PLANK).entryId).toBe('h-stoel');
    // En geen van beide claimt iets: een claim is alleen voor wat uniek is.
    expect(plek(ROOM, PAID_PLANK).claim).toBeNull();
    expect(plek(ROOM, FREE_PLANK).claim).toBeNull();
  });

  it('gives the claim back when the plek is emptied, and the voorwerp may move', () => {
    kamers.placeItem(plek(ROOM, FREE_PLANK).id, 'v-lantaarn', BRAM);
    kamers.clearSlot(plek(ROOM, FREE_PLANK).id, BRAM);

    const emptied = plek(ROOM, FREE_PLANK);
    expect(emptied.entryId).toBeNull();
    expect(emptied.claim).toBeNull();
    expect(emptied.placedAt).toBeNull();

    // And now somebody else's kamer may have it.
    expect(() => kamers.placeItem(plek(ROOM_B, FREE_PLANK).id, 'v-lantaarn', AAGJE)).not.toThrow();
    expect(plek(ROOM_B, FREE_PLANK).claim).toBe('v-lantaarn');
  });

  /**
   * The guarantee this round *moved* rather than removed. A check in a
   * function is a check somebody forgets; the index is the truth, and it is
   * asked of `sqlite_master` because that is where the promise actually lives.
   */
  it('keeps the promise in the schema: a unique index on claim, and only on claim', () => {
    const row = sqlite
      .prepare("SELECT sql FROM sqlite_master WHERE type = 'index' AND name = 'room_slots_claim_idx'")
      .get() as { sql: string } | undefined;
    expect(row?.sql).toBeTruthy();
    expect(row!.sql).toMatch(/CREATE\s+UNIQUE\s+INDEX/i);
    expect(row!.sql).toMatch(/room_slots\s*\(\s*claim\s*\)/i);
    expect(row!.sql).toMatch(/WHERE\s+claim\s+IS\s+NOT\s+NULL/i);

    // And §79's index on entry_id is gone, which is what made room for huisraad.
    const old = sqlite
      .prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND name = 'room_slots_entry_idx'")
      .get();
    expect(old).toBeUndefined();
  });

  it('and the index bites: two plekken cannot claim one thing, however it is written', () => {
    kamers.placeItem(plek(ROOM, FREE_PLANK).id, 'v-lantaarn', BRAM);
    const other = plek(ROOM_B, FREE_PLANK).id;
    expect(() => sqlite.prepare('UPDATE room_slots SET claim = ? WHERE id = ?').run('v-lantaarn', other)).toThrow(
      /UNIQUE/i,
    );
    // Two empty claims are not two of the same thing, and never were.
    expect(plek(ROOM_B, FREE_PLANK).claim).toBeNull();
    expect(slotsOf(ROOM).filter((slot) => slot.claim === null).length).toBeGreaterThan(1);
  });
});

/* ================================================== D. kopen */

describe('§80: kopen — en elke weigering die niets mag kosten', () => {
  it('buys it, fills the plek and writes exactly one regel', () => {
    kamers.grant(ROOM, 10, 'van de Keeper', KEEPER);
    const shelf = plek(ROOM, FREE_PLANK);
    const { spent } = kamers.buyFurnishing(shelf.id, 'h-stoel', BRAM);

    expect(spent).toBe(3);
    expect(kamers.balanceOf(ROOM)).toBe(7);
    expect(plek(ROOM, FREE_PLANK).entryId).toBe('h-stoel');
    expect(plek(ROOM, FREE_PLANK).placedAt).not.toBeNull();
    // Huisraad claims nothing, bought or placed: the two roads agree.
    expect(plek(ROOM, FREE_PLANK).claim).toBeNull();

    const lines = ledgerRows(ROOM).filter((row) => row.kind === 'item');
    expect(lines).toHaveLength(1);
    expect(lines[0].delta).toBe(-3);
    expect(lines[0].slotId).toBe(shelf.id);
    expect(lines[0].entryId).toBe('h-stoel');
    expect(lines[0].reason).toBe('Een leesstoel');
  });

  /**
   * §80's whole reason for existing, asked of the road that costs money: two
   * onderzoekers buy the same leesstoel, and both of them have one.
   */
  it('sells the same stuk huisraad to two onderzoekers, and charges both', () => {
    kamers.grant(ROOM, 10, 'van de Keeper', KEEPER);
    kamers.grant(ROOM_B, 10, 'van de Keeper', KEEPER);

    kamers.buyFurnishing(plek(ROOM, FREE_PLANK).id, 'h-stoel', BRAM);
    kamers.buyFurnishing(plek(ROOM_B, FREE_PLANK).id, 'h-stoel', AAGJE);

    expect(plek(ROOM, FREE_PLANK).entryId).toBe('h-stoel');
    expect(plek(ROOM_B, FREE_PLANK).entryId).toBe('h-stoel');
    expect(kamers.balanceOf(ROOM)).toBe(7);
    expect(kamers.balanceOf(ROOM_B)).toBe(7);
    expect(ledgerRows(ROOM).filter((row) => row.kind === 'item')).toHaveLength(1);
    expect(ledgerRows(ROOM_B).filter((row) => row.kind === 'item')).toHaveLength(1);
  });

  /** And the other way for a soort there is one of: the second buyer pays nothing. */
  it('refuses to sell a one-of-a-kind thing twice, and the second kamer pays nothing', () => {
    kamers.grant(ROOM, 10, 'van de Keeper', KEEPER);
    kamers.grant(ROOM_B, 10, 'van de Keeper', KEEPER);

    kamers.buyFurnishing(plek(ROOM, FREE_BUREAU).id, 'u-bureaulamp', BRAM);
    expect(plek(ROOM, FREE_BUREAU).claim).toBe('u-bureaulamp');

    expect(() => kamers.buyFurnishing(plek(ROOM_B, FREE_BUREAU).id, 'u-bureaulamp', AAGJE)).toThrow(/andere kamer/i);
    expect(kamers.balanceOf(ROOM_B)).toBe(10);
    expect(ledgerRows(ROOM_B)).toHaveLength(1);
    expect(plek(ROOM_B, FREE_BUREAU).entryId).toBeNull();
  });

  /** The failure mode of every economy ever built: a refusal that still charges. */
  it('refuses what you cannot afford, writes nothing and leaves the plek empty', () => {
    kamers.grant(ROOM, 2, 'net niet genoeg', KEEPER);
    const before = ledgerRows(ROOM);

    expect(() => kamers.buyFurnishing(plek(ROOM, FREE_PLANK).id, 'h-stoel', BRAM)).toThrow(kamers.KamerError);
    expect(() => kamers.buyFurnishing(plek(ROOM, FREE_PLANK).id, 'h-stoel', BRAM)).toThrow(/nog niet genoeg/);

    expect(kamers.balanceOf(ROOM)).toBe(2);
    expect(ledgerRows(ROOM)).toEqual(before);
    expect(plek(ROOM, FREE_PLANK).entryId).toBeNull();
  });

  it('lets exactly enough through, down to nul', () => {
    kamers.grant(ROOM, 3, 'precies genoeg', KEEPER);
    kamers.buyFurnishing(plek(ROOM, FREE_PLANK).id, 'h-stoel', BRAM);
    expect(kamers.balanceOf(ROOM)).toBe(0);
    expect(plek(ROOM, FREE_PLANK).entryId).toBe('h-stoel');
  });

  it('refuses a plek that is still on slot', () => {
    kamers.grant(ROOM, 20, 'genoeg', KEEPER);
    expect(() => kamers.buyFurnishing(plek(ROOM, PAID_PLANK).id, 'h-stoel', BRAM)).toThrow(/nog op slot/);
    expect(kamers.balanceOf(ROOM)).toBe(20);
    expect(ledgerRows(ROOM).filter((row) => row.kind === 'item')).toHaveLength(0);
  });

  it('refuses a plek that already holds something', () => {
    kamers.grant(ROOM, 20, 'genoeg', KEEPER);
    kamers.placeItem(plek(ROOM, FREE_PLANK).id, 'v-lantaarn', BRAM);
    expect(() => kamers.buyFurnishing(plek(ROOM, FREE_PLANK).id, 'h-stoel', BRAM)).toThrow(/ligt al iets/);
    expect(plek(ROOM, FREE_PLANK).entryId).toBe('v-lantaarn');
    expect(kamers.balanceOf(ROOM)).toBe(20);
  });

  it('refuses something with no price on it at all, nought included', () => {
    kamers.grant(ROOM, 20, 'genoeg', KEEPER);
    expect(() => kamers.buyFurnishing(plek(ROOM, FREE_PLANK).id, 'h-gift', BRAM)).toThrow(/niet te koop/);
    // Nought is not free: it is the Keeper's to give, like no price at all.
    expect(() => kamers.buyFurnishing(plek(ROOM, FREE_PLANK).id, 'h-nul', BRAM)).toThrow(/niet te koop/);
    expect(plek(ROOM, FREE_PLANK).entryId).toBeNull();
    expect(kamers.balanceOf(ROOM)).toBe(20);
    expect(ledgerRows(ROOM).filter((row) => row.kind === 'item')).toHaveLength(0);
  });

  it('refuses a stuk huisraad that asks for another kind of plek', () => {
    kamers.grant(ROOM, 20, 'genoeg', KEEPER);
    // De wandkast hoort aan de muur, niet op een plank.
    expect(() => kamers.buyFurnishing(plek(ROOM, FREE_PLANK).id, 'h-kast', BRAM)).toThrow(/niet op deze plek/);
    // En de schrijfmap hoort op een bureau.
    expect(() => kamers.buyFurnishing(plek(ROOM, FREE_MUUR).id, 'h-schrijfmap', BRAM)).toThrow(/niet op deze plek/);
    // En een persoon hoort nergens.
    expect(() => kamers.buyFurnishing(plek(ROOM, FREE_MUUR).id, 'e-aagje', BRAM)).toThrow(/hoort nergens in een kamer/);
    expect(kamers.balanceOf(ROOM)).toBe(20);
    expect(ledgerRows(ROOM).filter((row) => row.kind === 'item')).toHaveLength(0);
  });

  /** §9 and §44: the message is the one an artikel that was never written gets. */
  it('refuses something the buyer cannot see, and says nothing about it', () => {
    kamers.grant(ROOM, 20, 'genoeg', KEEPER);
    const shelf = plek(ROOM, FREE_PLANK).id;
    expect(() => kamers.buyFurnishing(shelf, 'h-geheim', BRAM)).toThrow(/bestaat niet/);
    expect(() => kamers.buyFurnishing(shelf, 'h-prep', BRAM)).toThrow(/bestaat niet/);
    expect(() => kamers.buyFurnishing(shelf, 'bestaat-echt-niet', BRAM)).toThrow(/bestaat niet/);
    expect(plek(ROOM, FREE_PLANK).entryId).toBeNull();
    expect(kamers.balanceOf(ROOM)).toBe(20);
  });

  /**
   * One click, one purchase. The guard is inside the UPDATE (`WHERE entry_id IS
   * NULL`); what a test can see of it is the shape of the grootboek afterwards.
   */
  it('charges once for a plek bought twice, however often it is pressed', () => {
    kamers.grant(ROOM, 20, 'genoeg voor zes', KEEPER);
    const shelf = plek(ROOM, FREE_PLANK).id;

    kamers.buyFurnishing(shelf, 'h-stoel', BRAM);
    for (let press = 0; press < 4; press += 1) {
      expect(() => kamers.buyFurnishing(shelf, 'h-stoel', BRAM)).toThrow(kamers.KamerError);
    }

    expect(ledgerRows(ROOM).filter((row) => row.kind === 'item')).toHaveLength(1);
    expect(kamers.balanceOf(ROOM)).toBe(17);
  });

  it('refuses a player buying in somebody else’s kamer, and charges neither of them', () => {
    kamers.grant(ROOM, 20, 'van de Keeper', KEEPER);
    kamers.grant(ROOM_B, 20, 'van de Keeper', KEEPER);

    expect(() => kamers.buyFurnishing(plek(ROOM, FREE_PLANK).id, 'h-stoel', AAGJE)).toThrow(/jouw kamer niet/);
    expect(() => kamers.buyFurnishing(plek(ROOM_B, FREE_PLANK).id, 'h-stoel', BRAM)).toThrow(/jouw kamer niet/);
    expect(() => kamers.buyFurnishing(plek(ROOM, FREE_PLANK).id, 'h-stoel', null)).toThrow(kamers.KamerError);

    expect(kamers.balanceOf(ROOM)).toBe(20);
    expect(kamers.balanceOf(ROOM_B)).toBe(20);
    expect(plek(ROOM, FREE_PLANK).entryId).toBeNull();
    expect(plek(ROOM_B, FREE_PLANK).entryId).toBeNull();
  });

  /**
   * The two roads side by side, and the difference between *earned* and
   * *bought*: the Keeper puts the same thing down for nothing and the grootboek
   * does not move a line.
   */
  it('costs the Keeper nothing to put the same thing down, and writes no regel', () => {
    kamers.grant(ROOM, 20, 'van de Keeper', KEEPER);
    const before = ledgerRows(ROOM);

    kamers.placeItem(plek(ROOM, FREE_PLANK).id, 'h-stoel', KEEPER);

    expect(plek(ROOM, FREE_PLANK).entryId).toBe('h-stoel');
    expect(ledgerRows(ROOM)).toEqual(before);
    expect(ledgerRows(ROOM).filter((row) => row.kind === 'item')).toHaveLength(0);
    expect(kamers.balanceOf(ROOM)).toBe(20);
  });

  it('refuses a plek that does not exist at all', () => {
    expect(() => kamers.buyFurnishing('bestaat-niet', 'h-stoel', BRAM)).toThrow(/bestaat niet/);
  });
});

/* ================================================== E. de catalogus */

describe('§80: de catalogus — vijf voorwaarden, gevraagd van de kant die faalt', () => {
  const ids = (kind: PlekKind, viewer: Parameters<typeof kamers.catalogueFor>[1]) =>
    kamers.catalogueFor(kind, viewer).map((row) => row.id);

  it('offers the huisraad that fits this plek, with its price and its lines', () => {
    const found = kamers.catalogueFor('plank', BRAM).find((row) => row.id === 'h-stoel');
    expect(found).toMatchObject({
      id: 'h-stoel',
      name: 'Een leesstoel',
      slug: 'leesstoel',
      price: 3,
      effect: ['Een plek om te lezen.', 'Rust bij het haardvuur'],
    });
  });

  /** 1. Keeper-made only — and this row fails on that alone. */
  it('leaves out a voorwerp, even one carrying a price', () => {
    expect(kamers.factsOf('v-prijskaartje')).toMatchObject({ plekken: ['plank'], price: 4, keeperMade: false });
    expect(ids('plank', BRAM)).toContain('h-stoel');
    expect(ids('plank', BRAM)).not.toContain('v-prijskaartje');
    // Not to the Keeper either: it is the soort that is wrong, not the looker.
    expect(ids('plank', KEEPER)).not.toContain('v-prijskaartje');
    expect(ids('plank', BRAM)).not.toContain('v-lantaarn');
  });

  /** 2. A price above nought. Without one it is a gift, not a purchase. */
  it('leaves out something with no price on it, and something priced at nought', () => {
    expect(ids('plank', BRAM)).toContain('h-stoel');
    expect(ids('plank', BRAM)).not.toContain('h-gift');
    expect(ids('plank', KEEPER)).not.toContain('h-gift');
    expect(ids('plank', BRAM)).not.toContain('h-nul');
    expect(ids('plank', KEEPER)).not.toContain('h-nul');
  });

  /** 3. This kind of plek. */
  it('leaves out what belongs on another kind of plek', () => {
    expect(ids('plank', BRAM)).toContain('h-stoel');
    expect(ids('plank', BRAM)).not.toContain('h-kast');
    expect(ids('muur', BRAM)).toContain('h-kast');
    expect(ids('muur', BRAM)).not.toContain('h-stoel');
    expect(ids('bureau', BRAM)).toEqual(expect.arrayContaining(['h-schrijfmap']));
  });

  /** 4. What this viewer may see — §9 and §44, from the side that may not. */
  it('leaves out what the looker may not see, and hands it to the Keeper', () => {
    expect(ids('plank', BRAM)).toContain('h-stoel');
    expect(ids('plank', BRAM)).not.toContain('h-geheim');
    expect(ids('plank', AAGJE)).not.toContain('h-geheim');
    expect(ids('plank', null)).not.toContain('h-geheim');
    expect(ids('plank', KEEPER)).toContain('h-geheim');

    // The far side of a tweeling is the same answer; the near side is nobody's secret.
    expect(ids('plank', BRAM)).not.toContain('h-prep');
    expect(ids('plank', KEEPER)).toContain('h-prep');
    expect(ids('plank', BRAM)).toContain('h-wiki');
  });

  /**
   * 5. Not already claimed — and §83 narrowed what that means.
   *
   * §80 also left out what was already lying in *this* kamer. Since you may own
   * two of the same stoel, a catalogue that hid the second one would hide
   * something the kamer would gladly accept — and §17's rule 4 says the reader
   * and the writer have to say the same sentence.
   */
  it('keeps offering what is already lying here, because you may have two (§83)', () => {
    expect(ids('plank', BRAM)).toContain('h-stoel');
    kamers.placeItem(plek(ROOM, FREE_PLANK).id, 'h-stoel', BRAM);
    expect(ids('plank', BRAM)).toContain('h-stoel');
  });

  it('still offers the neighbours’ huisraad, because there may be more than one of it', () => {
    kamers.placeItem(plek(ROOM_B, FREE_PLANK).id, 'h-stoel', AAGJE);
    expect(ids('plank', BRAM)).toContain('h-stoel');
  });

  it('but a claimed one is gone from every catalogue in the archive', () => {
    expect(ids('bureau', BRAM)).toContain('u-bureaulamp');
    kamers.placeItem(plek(ROOM_B, FREE_BUREAU).id, 'u-bureaulamp', AAGJE);
    expect(plek(ROOM_B, FREE_BUREAU).claim).toBe('u-bureaulamp');
    expect(ids('bureau', BRAM)).not.toContain('u-bureaulamp');
    expect(ids('bureau', AAGJE)).not.toContain('u-bureaulamp');
  });

  /** And a unique thing in your *own* kamer is gone too — the claim covers it. */
  it('drops a unique thing you placed yourself, because a claim is a claim', () => {
    expect(ids('bureau', BRAM)).toContain('u-bureaulamp');
    kamers.placeItem(plek(ROOM, FREE_BUREAU).id, 'u-bureaulamp', BRAM);
    expect(ids('bureau', BRAM)).not.toContain('u-bureaulamp');
  });

  it('puts the cheapest first, so saving up starts at the top', () => {
    const prices = kamers.catalogueFor('plank', KEEPER).map((row) => row.price);
    expect(prices.length).toBeGreaterThan(2);
    expect(prices).toEqual([...prices].sort((a, b) => a - b));
    expect(prices[0]).toBeLessThanOrEqual(prices[prices.length - 1]);
    // Too dear is still in the list: what you cannot afford is what you save for.
    expect(kamers.catalogueFor('plank', KEEPER).map((row) => row.id)).toContain('h-duur');
  });
});

/* ================================================== F. de effecten en de sluier */

describe('§80: effectLines — één effect per regel, en niets meer', () => {
  it('splits on newlines, both kinds', () => {
    expect(kamers.effectLines('een\ntwee')).toEqual(['een', 'twee']);
    expect(kamers.effectLines('een\r\ntwee')).toEqual(['een', 'twee']);
  });

  it('trims each line and drops the blank ones', () => {
    expect(kamers.effectLines('  een  \n\n\t twee \t\n   \n')).toEqual(['een', 'twee']);
    expect(kamers.effectLines('\n\n   \n\t\n')).toEqual([]);
    expect(kamers.effectLines('')).toEqual([]);
  });

  it('caps the list, because a kamer is not a spreadsheet', () => {
    const many = Array.from({ length: 20 }, (_, index) => `regel ${index}`).join('\n');
    const lines = kamers.effectLines(many);
    expect(lines).toHaveLength(12);
    expect(lines[0]).toBe('regel 0');
    expect(lines[11]).toBe('regel 11');
  });

  it('answers nothing at all for what is not text', () => {
    expect(kamers.effectLines(undefined)).toEqual([]);
    expect(kamers.effectLines(null)).toEqual([]);
    expect(kamers.effectLines(42)).toEqual([]);
    expect(kamers.effectLines(['een'])).toEqual([]);
    expect(kamers.effectLines({ line: 'een' })).toEqual([]);
  });
});

describe('§80: wat de kamer geeft, en wat hij nooit verraadt', () => {
  const view = (viewer: Parameters<typeof kamers.viewRoomBySlug>[1]) => kamers.viewRoomBySlug('bram-kuiper', viewer)!;

  it('lists the lines of what lies here, with the thing that says them', () => {
    kamers.placeItem(plek(ROOM, FREE_PLANK).id, 'h-stoel', BRAM);
    expect(view(BRAM).effects).toEqual([
      { name: 'Een leesstoel', href: '/e/leesstoel', lines: ['Een plek om te lezen.', 'Rust bij het haardvuur'] },
    ]);
  });

  it('says nothing about something that gives nothing', () => {
    kamers.placeItem(plek(ROOM, FREE_MUUR).id, 'h-kast', BRAM);
    kamers.placeItem(plek(ROOM, FREE_PLANK).id, 'v-lantaarn', BRAM);
    expect(view(BRAM).effects).toEqual([]);
  });

  it('adds up nothing: two things are two entries, in the order they lie', () => {
    kamers.grant(ROOM, 10, 'sparen', KEEPER);
    kamers.unlockSlot(plek(ROOM, PAID_PLANK).id, BRAM);
    kamers.placeItem(plek(ROOM, FREE_PLANK).id, 'h-stoel', BRAM);
    kamers.placeItem(plek(ROOM, PAID_PLANK).id, 'h-wiki', KEEPER);
    const effects = view(BRAM).effects;
    expect(effects.map((thing) => thing.name)).toEqual(['Een leesstoel', 'Een barometer']);
    expect(effects[1].lines).toEqual(['Hij wijst altijd op storm.']);
  });

  /**
   * §9. The plek says *er ligt iets*; the list below it must not say what. A
   * veil that leaks through a second window is not a veil.
   */
  it('lets a Keeper-only thing contribute nothing, anywhere on the reading', () => {
    kamers.placeItem(plek(ROOM, FREE_PLANK).id, 'h-geheim', KEEPER);
    const seen = view(AAGJE);

    expect(seen.effects).toEqual([]);
    expect(seen.slots.find((slot) => slot.sortOrder === FREE_PLANK)).toMatchObject({ veiled: true, item: null });

    const printed = JSON.stringify(seen);
    expect(printed).not.toContain('Het glas fluistert terug.');
    expect(printed).not.toContain('Een zwarte spiegel');
    expect(printed).not.toContain('zwarte-spiegel');
    expect(printed).not.toContain('h-geheim');
  });

  /** §44, and the owner is no more entitled than anybody else. */
  it('does the same for the far side of a tweeling, to the owner as well', () => {
    kamers.placeItem(plek(ROOM, FREE_PLANK).id, 'h-prep', KEEPER);
    // §89: signed out gets no kamer at all, let alone its effects.
    expect(kamers.viewRoomBySlug('bram-kuiper', null)).toBeNull();
    for (const viewer of [AAGJE, BRAM]) {
      const seen = view(viewer);
      expect(seen.effects).toEqual([]);
      const printed = JSON.stringify(seen);
      expect(printed).not.toContain('Het glas fluistert terug.');
      expect(printed).not.toContain('barometer-keeper');
      expect(printed).not.toContain('h-prep');
    }
  });

  /**
   * The security property rather than the feature: the two must be **one**
   * answer. A kamer that veiled §9 and named §44 — or listed the lines of one
   * and not the other — would say which hidden things exist without ever
   * printing a name. Asked of the same plek, so the readings differ in nothing
   * at all if the rule holds.
   */
  it('gives one single answer for §9 and for the far side of §44', () => {
    const shelf = plek(ROOM, FREE_PLANK).id;

    kamers.placeItem(shelf, 'h-geheim', KEEPER);
    const keeperOnly = view(AAGJE);

    kamers.clearSlot(shelf, KEEPER);
    kamers.placeItem(shelf, 'h-prep', KEEPER);
    const farSide = view(AAGJE);

    expect(JSON.stringify(farSide)).toBe(JSON.stringify(keeperOnly));
    expect(farSide).toEqual(keeperOnly);
    expect(farSide.effects).toEqual([]);
  });

  /** The control: whoever may see it is handed the lines. */
  it('hands the Keeper the lines of the thing he hid', () => {
    kamers.placeItem(plek(ROOM, FREE_PLANK).id, 'h-geheim', KEEPER);
    expect(view(KEEPER).effects).toEqual([
      { name: 'Een zwarte spiegel', href: '/e/zwarte-spiegel', lines: ['Het glas fluistert terug.'] },
    ]);
  });

  /** And the near side of a tweeling is nobody's secret. */
  it('keeps the near side of a tweeling listed for everybody', () => {
    kamers.placeItem(plek(ROOM, FREE_PLANK).id, 'h-wiki', BRAM);
    expect(view(AAGJE).effects).toEqual([
      { name: 'Een barometer', href: '/e/barometer', lines: ['Hij wijst altijd op storm.'] },
    ]);
  });
});

/* ===================================================================== */
/*  Wat de review vond                                                    */
/* ===================================================================== */

/**
 * §80: "te koop" is vijf dingen, en de schrijver vroeg er vier.
 *
 * `catalogueFor` biedt alleen aan wat keeper-made, geprijsd, passend, zichtbaar
 * en nog vrij is. `buyFurnishing` controleerde alles behalve de eerste — dus
 * kon iemand met een id in de hand munten betalen voor een *voorwerp* waar
 * toevallig een prijs op stond: gevonden in het spel, uniek, en precies het
 * ding dat §80 níét zou kapen. Twee reviewers vonden het los van elkaar, wat
 * meestal is hoe een ontbrekende voorwaarde eruitziet.
 *
 * §17's regel 4, in de makkelijkst te vergeten vorm: een lezer gebruikt de
 * SQL-voorwaarde, een schrijver de boolean — en het moeten er evenveel zijn.
 */
describe('§80: wat niet in de catalogus staat, is ook niet te koop', () => {
  it('weigert een voorwerp met een prijs erop, hoe je hem ook aanroept', () => {
    kamers.grant(ROOM, 50, 'sessie', KEEPER);
    const slot = plek(ROOM, FREE_PLANK);

    // Een voorwerp (keeper_made = 0, one_of_a_kind = 1) met een prijs.
    sqlite
      .prepare(
        `INSERT INTO entries (id, type_id, name, slug, fields, tags, visibility, created_by, view_mode, edit_mode)
         VALUES ('v-geprijsd', 'item', 'Een geprijsde lantaarn', 'geprijsde-lantaarn',
                 '{"plek":"plank","prijs":4}', '[]', 'all', 'keeper-1', 'all', 'all')`,
      )
      .run();

    // De catalogus biedt hem niet aan — aan niemand.
    expect(kamers.catalogueFor('plank', BRAM).map((row) => row.id)).not.toContain('v-geprijsd');
    expect(kamers.catalogueFor('plank', KEEPER).map((row) => row.id)).not.toContain('v-geprijsd');

    // En kopen mag dus ook niet, met het id rechtstreeks in de hand.
    const before = ledgerRows(ROOM).length;
    expect(() => kamers.buyFurnishing(slot.id, 'v-geprijsd', BRAM)).toThrow(/niet te koop/i);
    expect(ledgerRows(ROOM)).toHaveLength(before);
    expect(kamers.viewRoomBySlug('bram-kuiper', BRAM)!.slots.find((s) => s.id === slot.id)!.item).toBeNull();

    // De Keeper mag hem wél gewoon neerleggen: dat is cadeau doen, niet kopen.
    expect(() => kamers.placeItem(slot.id, 'v-geprijsd', KEEPER)).not.toThrow();
    expect(ledgerRows(ROOM)).toHaveLength(before);
  });
});
