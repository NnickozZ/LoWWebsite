import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';

/**
 * §82: de winkel — alles wat er te koop is, op één plek.
 *
 * §80 put a catalogue *inside* the plek-picker: stand in front of an empty
 * plank, press it, and see what fits that plank. That is the right question at
 * that moment and the wrong one for the thing a player does between sessions —
 * look at everything, pick something, and save for it. **You cannot save up for
 * what you have to open a drawer to see.** So §82 is a shop window: everything
 * for sale, grouped, priced, including what is out of reach today.
 *
 * Six things are guarded here, and they are the six that would cost somebody
 * something real if they broke:
 *
 *   1. **It agrees with the catalogue.** A shop that offers what the kamer
 *      would refuse is a shop that lies, and it lies in the worst way: at the
 *      moment somebody has finally saved enough. `catalogueFor` and `shopFor`
 *      read the same five conditions out of two separate queries, so the
 *      overlap is asserted per plek-kind and in both directions — what the shop
 *      lists *is* the catalogue, plus exactly the rows the catalogue hides for
 *      being taken, which the shop shows with a flag instead. Two readers of
 *      one sentence is the shape of §17's rule 4, one rung further out.
 *   2. **The veil, asked from the side that may not see.** A shop is a *list*,
 *      and a list is the easiest place in an archive to leak a name. §9's
 *      Keeper-only and §44's far side must be absent for a player and present
 *      for the Keeper, and a signed-out reader must get neither.
 *   3. **What is not for sale is not in the shop.** Three ways to fail it, and
 *      one of them is §80's own bug: a *voorwerp* wearing a price. `buyFurnishing`
 *      forgot `keeper_made` once and let somebody pay munten for a thing found
 *      in play; the shop is the second reader of that sentence and must not
 *      reintroduce it by listing what cannot be bought.
 *   4. **The four flags**, each asked at its boundary — `owned` only here,
 *      `takenElsewhere` only for a thing there is one of, `landsIn` only at an
 *      open and empty plek, and `affordable` at exactly `price === balance`.
 *   5. **`roomsOf`** — one purse per onderzoeker, and two purses that do not
 *      hear about each other. A Keeper wears nobody and gets none.
 *   6. **The chosen kamer** — and, from the side that matters, a kamer that is
 *      not yours: asking for a stranger's id must fall back to your own rather
 *      than read their balance or point at their shelves.
 *
 * Asked of a real SQLite file, because every one of those is SQL: the join on
 * `keeper_made`, the visibility condition, the claim, and the sum that is a
 * balance.
 */

const dir = mkdtempSync(join(tmpdir(), 'zcf-winkel-'));
process.env.DATA_DIR = dir;

type Kamers = typeof import('@/lib/kamers/service');
type Shape = typeof import('@/lib/kamers/shape');
type PlekKind = import('@/lib/kamers/shape').PlekKind;
type ShopItem = import('@/lib/kamers/service').ShopItem;

let kamers: Kamers;
let shape: Shape;
let sqlite: typeof import('@/lib/db').sqlite;

/** §17: a Keeper is above both dials — and §18: he wears nobody, so he has no purse. */
const KEEPER = { id: 'keeper-1', isKeeper: true };
/** Bram wears one onderzoeker. */
const BRAM = { id: 'bram', isKeeper: false };
/** Aagje wears another one, and has a kamer of her own. */
const AAGJE = { id: 'aagje', isKeeper: false };
/** Daan wears two, which is the whole of §82's kamer-picker. */
const DAAN = { id: 'daan', isKeeper: false };

/* ------------------------------------------------------------ the fixtures */

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

/** The plek at one rung of `ROOM_SHAPE`, by its position — never by its index in a list. */
const plek = (roomId: string, sortOrder: number) => {
  const row = slotsOf(roomId).find((slot) => slot.sortOrder === sortOrder);
  if (!row) throw new Error(`geen plek op ${sortOrder}`);
  return row;
};

/** The rungs these tests stand on, found rather than written down. */
let FREE_BUREAU: number;
let FREE_PLANK: number;
let FREE_MUUR: number;
let PAID_PLANK: number;
let PAID_BUREAU: number;

/** Bram's kamer and Aagje's, rebuilt before every test. */
let ROOM: string;
let ROOM_B: string;

const shopItem = (shop: import('@/lib/kamers/service').Shop, id: string): ShopItem => {
  const found = shop.items.find((row) => row.id === id);
  if (!found) throw new Error(`${id} staat niet in de winkel`);
  return found;
};

const ids = (shop: import('@/lib/kamers/service').Shop) => shop.items.map((row) => row.id);

beforeAll(async () => {
  const dbModule = await import('@/lib/db');
  sqlite = dbModule.sqlite;
  kamers = await import('@/lib/kamers/service');
  shape = await import('@/lib/kamers/shape');
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
  PAID_BUREAU = firstRung('bureau', false);

  /**
   * The kist is the rung this file leans on for "nowhere to put it": every kist
   * in `ROOM_SHAPE` costs something, so a fresh kamer has none open. Asserted
   * rather than assumed, because a rung appended to the shape could make it
   * false and the `landsIn` test would then pass for the wrong reason.
   */
  expect(shape.ROOM_SHAPE.filter((seed) => seed.kind === 'kist').length).toBeGreaterThan(0);
  expect(shape.ROOM_SHAPE.some((seed) => seed.kind === 'kist' && seed.price === 0)).toBe(false);

  const run = (sql: string, ...args: unknown[]) => sqlite.prepare(sql).run(...args);

  for (const [id, name, keeper] of [
    ['keeper-1', 'Keeper', 1],
    ['bram', 'Bram', 0],
    ['aagje', 'Aagje', 0],
    ['daan', 'Daan', 0],
  ] as const) {
    run(
      `INSERT INTO users (id, username, username_lower, password_hash, is_keeper) VALUES (?, ?, ?, 'x', ?)`,
      id,
      name,
      name.toLowerCase(),
      keeper,
    );
  }

  const typeRow = (slug: string) =>
    sqlite.prepare('SELECT id FROM entry_types WHERE slug = ?').get(slug) as { id: string } | undefined;
  const HUISRAAD = typeRow('huisraad')?.id;
  if (!HUISRAAD) throw new Error('de soort huisraad staat niet in het archief');

  /** Keeper-made **and** one of a kind — the combination `claim` exists for (§80). */
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

  /* De onderzoekers. Daan wears two, in a settled order. */
  entry('e-bram', 'investigator', 'Bram Kuiper', 'bram-kuiper', {});
  entry('e-aagje', 'investigator', 'Aagje Nel', 'aagje-nel', {});
  entry('e-daan-1', 'investigator', 'Daan de Wit', 'daan-de-wit', {});
  entry('e-daan-2', 'investigator', 'Daan Vermeer', 'daan-vermeer', {});
  run(`INSERT INTO user_characters (user_id, entry_id, sort_order) VALUES ('bram', 'e-bram', 0)`);
  run(`INSERT INTO user_characters (user_id, entry_id, sort_order) VALUES ('aagje', 'e-aagje', 0)`);
  run(`INSERT INTO user_characters (user_id, entry_id, sort_order) VALUES ('daan', 'e-daan-1', 0)`);
  run(`INSERT INTO user_characters (user_id, entry_id, sort_order) VALUES ('daan', 'e-daan-2', 1)`);

  const K = shape.VOORWERP_FIELD_KEY;
  const P = shape.PRICE_FIELD_KEY;
  const E = shape.EFFECT_FIELD_KEY;

  /* De voorwerpen (§24): found in play, one of a kind, never for sale. */
  entry('v-lantaarn', 'item', 'Een koperen lantaarn', 'koperen-lantaarn', { [K]: 'plank' });
  /*
   * §80's own bug, kept as a fixture: a voorwerp wearing a price. The soorten-
   * editor cannot make this, a hand-edited archive can, and it satisfies every
   * condition except the first. `buyFurnishing` forgot that condition once.
   */
  entry('v-prijskaartje', 'item', 'Een geprijsd voorwerp', 'geprijsd-voorwerp', { [K]: 'plank', [P]: 4 });

  /* Het huisraad (§80): keeper-made, priced, and several people may own one. */
  entry('h-stoel', HUISRAAD, 'Een leesstoel', 'leesstoel', {
    [K]: 'plank',
    [P]: 3,
    [E]: 'Een plek om te lezen.\r\n\n   Rust bij het haardvuur   \n\n',
  });
  entry('h-kast', HUISRAAD, 'Een wandkast', 'wandkast', { [K]: 'muur', [P]: 5 });
  entry('h-duur', HUISRAAD, 'Een staande klok', 'staande-klok', { [K]: 'plank', [P]: 100 });
  entry('h-schrijfmap', HUISRAAD, 'Een schrijfmap', 'schrijfmap', { [K]: 'bureau', [P]: 4 });
  /* Voor de kist, die in een verse kamer nooit open staat. */
  entry('h-kistje', HUISRAAD, 'Een reiskoffer', 'reiskoffer', { [K]: 'kist', [P]: 6 });

  /* Drie manieren om niet te koop te staan. */
  // Geen prijs: de Keeper geeft hem zelf weg.
  entry('h-gift', HUISRAAD, 'Een erfstuk', 'erfstuk', { [K]: 'plank', [E]: 'Van je grootmoeder geweest.' });
  // Nul munten is geen prijs — hetzelfde antwoord als helemaal geen veld.
  entry('h-nul', HUISRAAD, 'Een kruk', 'kruk', { [K]: 'plank', [P]: 0 });
  // Geen `plek`: het hoort nergens in een kamer, hoe duur het ook is.
  entry('h-zonderplek', HUISRAAD, 'Een gerucht', 'gerucht', { [P]: 7 });
  // Een plek die geen plek is. `isPlekKind` is de poort.
  entry('h-zolder', HUISRAAD, 'Een hooibaal', 'hooibaal', { [K]: 'zolder', [P]: 7 });

  /* §9: Keeper-only, and asking for a plank so it sits in the same group. */
  entry(
    'h-geheim',
    HUISRAAD,
    'Een zwarte spiegel',
    'zwarte-spiegel',
    { [K]: 'plank', [P]: 2, [E]: 'Het glas fluistert terug.' },
    'keeper',
  );
  /* §44: a real tweeling. `h-prep` is the Keeper's side of `h-wiki`. */
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

  /* Keeper-made *and* one of a kind: what `takenElsewhere` is about. */
  entry('u-bureaulamp', 'type-uniek', 'De lamp van de hoofdinspecteur', 'lamp-hoofdinspecteur', {
    [K]: 'bureau',
    [P]: 4,
  });
  entry('u-schilderij', 'type-uniek', 'Het zeegezicht van Van Dun', 'zeegezicht-van-dun', {
    [K]: 'muur',
    [P]: 6,
  });
});

/**
 * Every test gets two kamers nobody has spent anything in. The rows are dropped
 * rather than the file, because the seeded soorten and the fixtures above are
 * what a kamer is made of. Daan's two are made lazily by `roomsOf`, which is
 * the road under test.
 */
beforeEach(() => {
  sqlite.prepare('DELETE FROM room_ledger').run();
  sqlite.prepare('DELETE FROM room_slots').run();
  sqlite.prepare('DELETE FROM room_drawer').run(); // §93
  sqlite.prepare('DELETE FROM rooms').run();
  ROOM = kamers.getOrCreateRoom('e-bram')!;
  ROOM_B = kamers.getOrCreateRoom('e-aagje')!;
});

/* ============================================ A. hij is het eens met de catalogus */

/**
 * The one property that matters most, and the reason this file exists.
 *
 * `catalogueFor` answers "what may I buy for *this* plek" and leaves out what
 * is claimed. `shopFor` answers "what is there" and says of a claimed one that
 * somebody has it. Restricted to one kind of plek, therefore:
 *
 *     shop(kind) minus {held}  ===  catalogue(kind)
 *
 * — as a **sequence**, not merely a set, because the two sort by the same
 * comparator inside one kind (price, then name in Dutch) and a shop that
 * ordered its shelves differently from the picker would be a second surprise.
 *
 * **§83 moved the line between them.** Owning one used to be enough to be left
 * out of the catalogue; now only a thing there is one of is ever held back, and
 * then it is held back whether the copy is yours (`unique && owned`) or
 * somebody else's (`takenElsewhere`). A plain `owned` is a label and no longer
 * a difference between these two lists.
 */
const held = (row: import('@/lib/kamers/service').ShopItem) =>
  (row.unique && row.owned) || row.takenElsewhere;

const agreesWithTheCatalogue = (viewer: Parameters<typeof kamers.shopFor>[0], roomId: string) => {
  const shop = kamers.shopFor(viewer, roomId);
  for (const kind of shape.PLEK_KINDS) {
    const catalogue = kamers.catalogueFor(kind, viewer).map((row) => row.id);
    const here = shop.items.filter((row) => row.plekken.includes(kind));

    // Nothing the picker offers is missing from the window.
    expect(here.map((row) => row.id)).toEqual(expect.arrayContaining(catalogue));
    // And nothing the window offers unheld is refused by the picker.
    expect(here.filter((row) => !held(row)).map((row) => row.id)).toEqual(catalogue);
    // What the two differ by is exactly that, never anything else.
    expect(here.filter((row) => !catalogue.includes(row.id)).every(held)).toBe(true);
  }
};

describe('§82: de winkel is het eens met de catalogus', () => {
  it('lists, per plek, exactly what the picker offers — in an untouched kamer', () => {
    agreesWithTheCatalogue(BRAM, ROOM);
    agreesWithTheCatalogue(AAGJE, ROOM_B);
  });

  it('still agrees once this kamer owns something', () => {
    kamers.placeItem(plek(ROOM, FREE_PLANK).id, 'h-stoel', KEEPER);
    kamers.placeItem(plek(ROOM, FREE_BUREAU).id, 'u-bureaulamp', KEEPER);
    agreesWithTheCatalogue(BRAM, ROOM);
    // And from the other kamer, where the same two rows read differently.
    agreesWithTheCatalogue(AAGJE, ROOM_B);
  });

  it('still agrees once somebody else has claimed a one-of-a-kind thing', () => {
    kamers.placeItem(plek(ROOM_B, FREE_BUREAU).id, 'u-bureaulamp', KEEPER);
    kamers.placeItem(plek(ROOM_B, FREE_MUUR).id, 'u-schilderij', KEEPER);
    agreesWithTheCatalogue(BRAM, ROOM);
    agreesWithTheCatalogue(AAGJE, ROOM_B);
  });

  it('still agrees once the neighbours own the same stuk huisraad', () => {
    kamers.placeItem(plek(ROOM_B, FREE_PLANK).id, 'h-stoel', KEEPER);
    agreesWithTheCatalogue(BRAM, ROOM);
  });

  /**
   * The Keeper reads it as a price list: he wears nobody, so nothing is his and
   * nothing is owned. With no placement anywhere, his window is the catalogue
   * exactly — which is the strongest form of the same assertion.
   */
  it('hands the Keeper the catalogue itself, with nothing flagged', () => {
    agreesWithTheCatalogue(KEEPER, ROOM);
    const shop = kamers.shopFor(KEEPER);
    expect(shop.items.every((row) => !row.owned && !row.takenElsewhere)).toBe(true);
    expect(shop.items.length).toBeGreaterThan(0);
  });

  /**
   * And the real thing the property is for: a row the shop says lands
   * somewhere, with money in the purse, is a row `buyFurnishing` accepts. A
   * flag is a promise about a write, so the write is the assertion.
   *
   * Asked one purchase at a time and re-read in between, which is what a page
   * does: a purchase fills a plek, and the next row's landing place is a
   * different one. Buying against a snapshot would be testing the test.
   */
  it('sells what it offers: every unflagged, affordable row goes through buyFurnishing', () => {
    kamers.grant(ROOM, 200, 'genoeg voor de hele winkel', KEEPER);
    const buyable = () => {
      for (const row of kamers.shopFor(BRAM, ROOM).items) {
        if (held(row) || !row.affordable) continue;
        // §83: `landsIn` is per kind of plek now, so a buyable row is a pair.
        for (const kind of row.plekken) {
          const slotId = row.landsIn[kind];
          if (slotId) return { row, slotId };
        }
      }
      return null;
    };

    let bought = 0;
    for (let round = 0; round < 40; round += 1) {
      const next = buyable();
      if (!next) break;
      expect(() => kamers.buyFurnishing(next.slotId, next.row.id, BRAM), `kopen: ${next.row.id}`).not.toThrow();
      // And what was bought now reads as owned, in the same window.
      expect(shopItem(kamers.shopFor(BRAM, ROOM), next.row.id).owned).toBe(true);
      bought += 1;
    }
    expect(bought).toBeGreaterThan(2);
    // The window ran out of *plekken*, not of money: there is still a purse.
    expect(kamers.balanceOf(ROOM)).toBeGreaterThan(0);
  });
});

/* ==================================================== B. de sluier, van de andere kant */

describe('§82: wat de winkel nooit toont — gevraagd door wie niet mag', () => {
  it('leaves a Keeper-only stuk huisraad out for a player and in for the Keeper', () => {
    expect(ids(kamers.shopFor(BRAM, ROOM))).not.toContain('h-geheim');
    expect(ids(kamers.shopFor(AAGJE, ROOM_B))).not.toContain('h-geheim');
    expect(ids(kamers.shopFor(KEEPER))).toContain('h-geheim');
  });

  it('leaves the far side of a tweeling out, and keeps the near side in', () => {
    expect(ids(kamers.shopFor(BRAM, ROOM))).not.toContain('h-prep');
    expect(ids(kamers.shopFor(KEEPER))).toContain('h-prep');
    // The near side is nobody's secret.
    expect(ids(kamers.shopFor(BRAM, ROOM))).toContain('h-wiki');
  });

  /** §76's rule: not one word of it, anywhere on the reading. */
  it('prints not a word of either one to a player, anywhere in the answer', () => {
    const printed = JSON.stringify(kamers.shopFor(BRAM, ROOM));
    for (const secret of [
      'h-geheim',
      'zwarte-spiegel',
      'Een zwarte spiegel',
      'Het glas fluistert terug.',
      'h-prep',
      'barometer-keeper',
    ]) {
      expect(printed).not.toContain(secret);
    }
  });

  it('gives a signed-out reader no kamers, no purse and no buttons’ worth of data', () => {
    const shop = kamers.shopFor(null);
    expect(shop.rooms).toEqual([]);
    expect(shop.roomId).toBeNull();
    expect(shop.balance).toBe(0);
    // §89: and no window either — signed out, the shop shows nothing at all.
    expect(shop.items).toEqual([]);
  });

  it('and still hides from a signed-out reader what it hides from a player', () => {
    const shop = kamers.shopFor(null);
    expect(ids(shop)).not.toContain('h-geheim');
    expect(ids(shop)).not.toContain('h-prep');
    // §89: not even what a player may see.
    expect(ids(shop)).not.toContain('h-wiki');
    const printed = JSON.stringify(shop);
    expect(printed).not.toContain('Het glas fluistert terug.');
    expect(printed).not.toContain('zwarte-spiegel');
  });

  /** Asking for somebody else's kamer buys a signed-out reader nothing either. */
  it('gives a signed-out reader nothing extra when a kamer id is handed to it', () => {
    const shop = kamers.shopFor(null, ROOM);
    expect(shop.roomId).toBeNull();
    expect(shop.balance).toBe(0);
    expect(shop.rooms).toEqual([]);
  });
});

/* ========================================= C. wat niet te koop is, staat er niet */

describe('§82: wat niet te koop is, staat niet in de winkel', () => {
  // §89: signed-in readers only — a signed-out one is shown nothing (see above).
  const forEveryReader = (id: string, present: boolean) => {
    for (const viewer of [BRAM, AAGJE, KEEPER]) {
      const listed = ids(kamers.shopFor(viewer, ROOM)).includes(id);
      expect(listed, `${id} voor ${viewer?.id ?? 'niemand'}`).toBe(present);
    }
  };

  it('leaves out something with no price on it at all', () => {
    forEveryReader('h-gift', false);
    forEveryReader('h-stoel', true);
  });

  it('leaves out something priced at nought, which is not the same as free', () => {
    forEveryReader('h-nul', false);
  });

  /**
   * §80's bug, on the reading side. A voorwerp is found in play and one of a
   * kind; a price on one is a hand-edit, and the shop must not turn it into
   * merchandise. Not to the Keeper either — it is the *soort* that is wrong.
   */
  it('leaves out a voorwerp carrying a price, and every voorwerp besides', () => {
    expect(kamers.factsOf('v-prijskaartje')).toMatchObject({ plekken: ['plank'], price: 4, keeperMade: false });
    forEveryReader('v-prijskaartje', false);
    forEveryReader('v-lantaarn', false);
  });

  it('leaves out something with no plek field, however dear it is', () => {
    forEveryReader('h-zonderplek', false);
  });

  it('leaves out something asking for a plek that is not a plek', () => {
    expect(shape.isPlekKind('zolder')).toBe(false);
    forEveryReader('h-zolder', false);
  });

  /** And every row that *is* listed carries a real kind of plek and a real price. */
  it('lists nothing without a kind of plek and a price above nought', () => {
    for (const viewer of [BRAM, KEEPER, null]) {
      for (const row of kamers.shopFor(viewer, ROOM).items) {
        expect(row.plekken.length).toBeGreaterThan(0);
        expect(row.plekken.every((kind) => shape.isPlekKind(kind))).toBe(true);
        expect(row.price).toBeGreaterThan(0);
        expect(Number.isInteger(row.price)).toBe(true);
      }
    }
  });
});

/* ==================================================== D. de vier vlaggen */

describe('§82: owned — alleen wat in déze kamer ligt', () => {
  it('flags what lies in this kamer and nothing else', () => {
    kamers.placeItem(plek(ROOM, FREE_PLANK).id, 'h-stoel', KEEPER);
    const shop = kamers.shopFor(BRAM, ROOM);
    expect(shopItem(shop, 'h-stoel').owned).toBe(true);
    expect(shopItem(shop, 'h-duur').owned).toBe(false);
  });

  it('does not flag the neighbours’ copy as yours', () => {
    kamers.placeItem(plek(ROOM_B, FREE_PLANK).id, 'h-stoel', KEEPER);
    expect(shopItem(kamers.shopFor(BRAM, ROOM), 'h-stoel').owned).toBe(false);
    expect(shopItem(kamers.shopFor(AAGJE, ROOM_B), 'h-stoel').owned).toBe(true);
  });

  /** Two purses, two kamers: what one owns the other does not. */
  it('keeps owned per kamer, even for one pair of hands', () => {
    const rooms = kamers.roomsOf(DAAN);
    kamers.placeItem(plek(rooms[0].id, FREE_PLANK).id, 'h-stoel', KEEPER);

    expect(shopItem(kamers.shopFor(DAAN, rooms[0].id), 'h-stoel').owned).toBe(true);
    expect(shopItem(kamers.shopFor(DAAN, rooms[1].id), 'h-stoel').owned).toBe(false);
  });
});

describe('§82: takenElsewhere — alleen voor het ding waar er één van is', () => {
  it('flags a one-of-a-kind thing another kamer has claimed', () => {
    kamers.placeItem(plek(ROOM_B, FREE_BUREAU).id, 'u-bureaulamp', KEEPER);
    expect(plek(ROOM_B, FREE_BUREAU).claim).toBe('u-bureaulamp');

    const row = shopItem(kamers.shopFor(BRAM, ROOM), 'u-bureaulamp');
    expect(row.takenElsewhere).toBe(true);
    expect(row.owned).toBe(false);
  });

  /** And it is not "elsewhere" when it is here: the two flags never both stand. */
  it('says owned rather than taken when the claim is this kamer’s own', () => {
    kamers.placeItem(plek(ROOM, FREE_BUREAU).id, 'u-bureaulamp', KEEPER);
    const row = shopItem(kamers.shopFor(BRAM, ROOM), 'u-bureaulamp');
    expect(row.owned).toBe(true);
    expect(row.takenElsewhere).toBe(false);
  });

  /**
   * §80's whole point, from the shop's side: two people may own the same chair,
   * so somebody else's leesstoel takes nothing away from yours.
   */
  it('does not flag huisraad somebody else also owns', () => {
    kamers.placeItem(plek(ROOM_B, FREE_PLANK).id, 'h-stoel', KEEPER);
    const row = shopItem(kamers.shopFor(BRAM, ROOM), 'h-stoel');
    expect(row.takenElsewhere).toBe(false);
    expect(row.owned).toBe(false);
    expect(row.landsIn.plank).toBe(plek(ROOM, FREE_PLANK).id);
  });

  it('flags nothing at all while nobody has claimed anything', () => {
    expect(kamers.shopFor(BRAM, ROOM).items.every((row) => !row.takenElsewhere)).toBe(true);
  });

  /** A claim taken back frees the row again, for everybody. */
  /*
   * §93 keerde de helft hiervan om. Weghalen gaf de claim terug aan de wereld,
   * en een uniek stuk huisraad was daarna van niemand. Nu legt weghalen het in
   * Aagjes lade: het blijft van haar, dus ook vergeven. Pas als het de lade
   * uit gaat (hier met de hand, zoals de prullenbak het doet) is het weer vrij.
   */
  it('keeps it taken while it lies in the other kamer’s lade, and unflags it once it is gone', () => {
    kamers.placeItem(plek(ROOM_B, FREE_BUREAU).id, 'u-bureaulamp', KEEPER);
    expect(shopItem(kamers.shopFor(BRAM, ROOM), 'u-bureaulamp').takenElsewhere).toBe(true);
    kamers.clearSlot(plek(ROOM_B, FREE_BUREAU).id, AAGJE);
    expect(shopItem(kamers.shopFor(BRAM, ROOM), 'u-bureaulamp').takenElsewhere).toBe(true);
    sqlite.prepare('DELETE FROM room_drawer').run();
    expect(shopItem(kamers.shopFor(BRAM, ROOM), 'u-bureaulamp').takenElsewhere).toBe(false);
  });
});

describe('§82: landsIn — de plek waar het zou landen', () => {
  it('points at the first open, empty plek of the right kind', () => {
    const shop = kamers.shopFor(BRAM, ROOM);
    expect(shopItem(shop, 'h-stoel').landsIn.plank).toBe(plek(ROOM, FREE_PLANK).id);
    expect(shopItem(shop, 'h-kast').landsIn.muur).toBe(plek(ROOM, FREE_MUUR).id);
    expect(shopItem(shop, 'h-schrijfmap').landsIn.bureau).toBe(plek(ROOM, FREE_BUREAU).id);
  });

  /** Every kist in `ROOM_SHAPE` costs something, so a fresh kamer has nowhere. */
  it('is empty while every plek of that kind is still on slot', () => {
    expect(shopItem(kamers.shopFor(BRAM, ROOM), 'h-kistje').landsIn.kist).toBeUndefined();
  });

  it('finds the plek the moment that kind is unlocked', () => {
    const kist = slotsOf(ROOM).find((slot) => slot.kind === 'kist')!;
    kamers.grant(ROOM, 50, 'sparen', KEEPER);
    kamers.unlockSlot(kist.id, BRAM);
    expect(shopItem(kamers.shopFor(BRAM, ROOM), 'h-kistje').landsIn.kist).toBe(kist.id);
  });

  it('is empty when every open plek of that kind is full', () => {
    // The one free bureau, filled — and the other one still locked.
    kamers.placeItem(plek(ROOM, FREE_BUREAU).id, 'h-schrijfmap', KEEPER);
    expect(plek(ROOM, PAID_BUREAU).unlockedAt).toBeNull();
    expect(shopItem(kamers.shopFor(BRAM, ROOM), 'u-bureaulamp').landsIn.bureau).toBeUndefined();
  });

  it('moves on to the next plek of that kind when the first is taken', () => {
    kamers.grant(ROOM, 50, 'sparen', KEEPER);
    kamers.unlockSlot(plek(ROOM, PAID_PLANK).id, BRAM);
    kamers.placeItem(plek(ROOM, FREE_PLANK).id, 'v-lantaarn', BRAM);
    expect(shopItem(kamers.shopFor(BRAM, ROOM), 'h-stoel').landsIn.plank).toBe(plek(ROOM, PAID_PLANK).id);
  });

  /**
   * §83 reversed this one. §82 put nothing where you already owned one; a
   * second leesstoel is allowed now, so the free plank is offered.
   */
  it('still points somewhere for something this kamer already owns (§83)', () => {
    kamers.grant(ROOM, 50, 'sparen', KEEPER);
    kamers.unlockSlot(plek(ROOM, PAID_PLANK).id, BRAM);
    kamers.placeItem(plek(ROOM, FREE_PLANK).id, 'h-stoel', KEEPER);
    expect(plek(ROOM, PAID_PLANK).entryId).toBeNull();
    expect(shopItem(kamers.shopFor(BRAM, ROOM), 'h-stoel').landsIn.plank).toBe(plek(ROOM, PAID_PLANK).id);
  });

  /** But a unique one you already hold points nowhere: there is one of it. */
  it('points nowhere for a unique thing you already hold', () => {
    kamers.grant(ROOM, 50, 'sparen', KEEPER);
    kamers.unlockSlot(plek(ROOM, PAID_BUREAU).id, BRAM);
    kamers.placeItem(plek(ROOM, FREE_BUREAU).id, 'u-bureaulamp', KEEPER);
    expect(plek(ROOM, PAID_BUREAU).entryId).toBeNull();
    expect(shopItem(kamers.shopFor(BRAM, ROOM), 'u-bureaulamp').landsIn).toEqual({});
  });

  /** A plek it points at is always this kamer's, open and empty. */
  it('never points anywhere but at an open, empty plek of this kamer', () => {
    kamers.placeItem(plek(ROOM, FREE_PLANK).id, 'h-stoel', KEEPER);
    const here = new Map(slotsOf(ROOM).map((slot) => [slot.id, slot]));
    for (const row of kamers.shopFor(BRAM, ROOM).items) {
      for (const [kind, slotId] of Object.entries(row.landsIn)) {
        const slot = here.get(slotId);
        expect(slot, `${row.id} wijst buiten de kamer`).toBeDefined();
        expect(slot!.kind).toBe(kind);
        expect(slot!.entryId).toBeNull();
        expect(slot!.unlockedAt).not.toBeNull();
      }
    }
  });
});

describe('§82: affordable — precies op de grens', () => {
  it('is false with nothing in the purse', () => {
    expect(kamers.balanceOf(ROOM)).toBe(0);
    expect(kamers.shopFor(BRAM, ROOM).items.every((row) => !row.affordable)).toBe(true);
  });

  it('is false at price − 1 and true at exactly the price', () => {
    kamers.grant(ROOM, 2, 'net niet genoeg', KEEPER);
    expect(shopItem(kamers.shopFor(BRAM, ROOM), 'h-stoel').affordable).toBe(false);

    kamers.grant(ROOM, 1, 'precies genoeg', KEEPER);
    expect(kamers.balanceOf(ROOM)).toBe(3);
    expect(shopItem(kamers.shopFor(BRAM, ROOM), 'h-stoel').affordable).toBe(true);
    // And the boundary is a boundary: one munt dearer is still out of reach.
    expect(shopItem(kamers.shopFor(BRAM, ROOM), 'h-schrijfmap').price).toBe(4);
    expect(shopItem(kamers.shopFor(BRAM, ROOM), 'h-schrijfmap').affordable).toBe(false);
  });

  /** The whole reason §82 exists: what you cannot afford is in the window. */
  it('keeps what is far out of reach in the list, priced', () => {
    kamers.grant(ROOM, 3, 'weinig', KEEPER);
    const row = shopItem(kamers.shopFor(BRAM, ROOM), 'h-duur');
    expect(row.price).toBe(100);
    expect(row.affordable).toBe(false);
    expect(row.name).toBe('Een staande klok');
  });

  it('follows the balance down again when it is spent', () => {
    kamers.grant(ROOM, 4, 'genoeg voor één', KEEPER);
    expect(shopItem(kamers.shopFor(BRAM, ROOM), 'h-schrijfmap').affordable).toBe(true);
    kamers.buyFurnishing(plek(ROOM, FREE_PLANK).id, 'h-stoel', BRAM);
    expect(kamers.balanceOf(ROOM)).toBe(1);
    expect(shopItem(kamers.shopFor(BRAM, ROOM), 'h-schrijfmap').affordable).toBe(false);
  });

  /** And affordability is this kamer's, not this person's. */
  it('reads the chosen kamer’s purse and no other', () => {
    const rooms = kamers.roomsOf(DAAN);
    kamers.grant(rooms[0].id, 3, 'voor de eerste', KEEPER);
    expect(shopItem(kamers.shopFor(DAAN, rooms[0].id), 'h-stoel').affordable).toBe(true);
    expect(shopItem(kamers.shopFor(DAAN, rooms[1].id), 'h-stoel').affordable).toBe(false);
  });
});

/* ==================================================== E. roomsOf */

describe('§82: roomsOf — één beurs per onderzoeker', () => {
  it('gives a player the one onderzoeker they wear, with that kamer’s purse', () => {
    kamers.grant(ROOM, 7, 'van de Keeper', KEEPER);
    const rooms = kamers.roomsOf(BRAM);
    expect(rooms).toEqual([{ id: ROOM, name: 'Bram Kuiper', slug: 'bram-kuiper', balance: 7 }]);
  });

  it('gives two onderzoekers two kamers, in the order they are worn', () => {
    const rooms = kamers.roomsOf(DAAN);
    expect(rooms).toHaveLength(2);
    expect(rooms.map((room) => room.slug)).toEqual(['daan-de-wit', 'daan-vermeer']);
    expect(rooms[0].id).not.toBe(rooms[1].id);
    expect(rooms.map((room) => room.balance)).toEqual([0, 0]);
  });

  /** Two purses, and money granted to one does not appear in the other. */
  it('keeps the two purses apart', () => {
    const rooms = kamers.roomsOf(DAAN);
    kamers.grant(rooms[0].id, 12, 'voor de eerste', KEEPER);

    const after = kamers.roomsOf(DAAN);
    expect(after.map((room) => room.balance)).toEqual([12, 0]);
    expect(kamers.balanceOf(rooms[1].id)).toBe(0);

    kamers.grant(rooms[1].id, 5, 'voor de tweede', KEEPER);
    expect(kamers.roomsOf(DAAN).map((room) => room.balance)).toEqual([12, 5]);
  });

  /** §18: the Keeper wears nobody, so he has no purse and no buttons. */
  it('gives the Keeper none at all', () => {
    expect(kamers.roomsOf(KEEPER)).toEqual([]);
    const shop = kamers.shopFor(KEEPER);
    expect(shop.rooms).toEqual([]);
    expect(shop.roomId).toBeNull();
    expect(shop.balance).toBe(0);
    expect(shop.items.every((row) => Object.keys(row.landsIn).length === 0 && !row.affordable && !row.owned)).toBe(true);
  });

  it('gives a signed-out reader none at all either', () => {
    expect(kamers.roomsOf(null)).toEqual([]);
  });

  /** Nobody else's kamer is ever in the list, whoever is asking. */
  it('never hands one person another person’s kamer', () => {
    expect(kamers.roomsOf(BRAM).map((room) => room.id)).not.toContain(ROOM_B);
    expect(kamers.roomsOf(AAGJE).map((room) => room.id)).not.toContain(ROOM);
  });
});

/* ==================================================== F. de gekozen kamer */

describe('§82: de gekozen kamer — en die van een ander', () => {
  it('uses the kamer it is handed, when it is one of yours', () => {
    const rooms = kamers.roomsOf(DAAN);
    kamers.grant(rooms[1].id, 9, 'voor de tweede', KEEPER);

    const shop = kamers.shopFor(DAAN, rooms[1].id);
    expect(shop.roomId).toBe(rooms[1].id);
    expect(shop.balance).toBe(9);
    expect(shop.rooms).toHaveLength(2);
  });

  it('falls back to the first one when it is handed nothing', () => {
    const rooms = kamers.roomsOf(DAAN);
    const shop = kamers.shopFor(DAAN);
    expect(shop.roomId).toBe(rooms[0].id);
  });

  /**
   * The one that matters, asked from the side that must not be heard: Bram
   * types Aagje's kamer id into the query string. He may not read her balance,
   * and `landsIn` may not point at her shelves.
   */
  it('refuses a stranger’s kamer and falls back to your own', () => {
    kamers.grant(ROOM, 4, 'van Bram', KEEPER);
    kamers.grant(ROOM_B, 40, 'van Aagje', KEEPER);

    const shop = kamers.shopFor(BRAM, ROOM_B);
    expect(shop.roomId).toBe(ROOM);
    expect(shop.balance).toBe(4);
    expect(shop.rooms.map((room) => room.id)).toEqual([ROOM]);

    // Not one munt of hers reaches his affordability.
    expect(shopItem(shop, 'h-kast').price).toBe(5);
    expect(shopItem(shop, 'h-kast').affordable).toBe(false);
    expect(shopItem(shop, 'h-schrijfmap').affordable).toBe(true);

    // And not one of her plekken is offered as a landing place.
    const hers = new Set(slotsOf(ROOM_B).map((slot) => slot.id));
    const mine = new Set(slotsOf(ROOM).map((slot) => slot.id));
    for (const row of shop.items) {
      for (const slotId of Object.values(row.landsIn)) {
        expect(hers.has(slotId)).toBe(false);
        expect(mine.has(slotId)).toBe(true);
      }
    }
  });

  /** `owned` follows the fallback too: her shelves are not his. */
  it('reads your own shelves rather than the stranger’s', () => {
    kamers.placeItem(plek(ROOM_B, FREE_PLANK).id, 'h-stoel', KEEPER);
    const shop = kamers.shopFor(BRAM, ROOM_B);
    expect(shop.roomId).toBe(ROOM);
    expect(shopItem(shop, 'h-stoel').owned).toBe(false);
  });

  it('falls back for an id that is no kamer at all', () => {
    const shop = kamers.shopFor(BRAM, 'bestaat-niet');
    expect(shop.roomId).toBe(ROOM);
    expect(shop.rooms.map((room) => room.id)).toEqual([ROOM]);
  });
});

/* ========================== G. een vlag is een belofte over een schrijfactie */

/**
 * The other half of §82's agreement with the kamer, and the half a page can
 * actually get wrong.
 *
 * `landsIn` answers one question and one only — *is there an open, empty plek
 * of this kind* — and it keeps answering it for a row that is flagged or out of
 * reach. That is deliberate (the docblock: buying goes through `buyFurnishing`
 * like every other purchase, with every one of its five conditions), and it
 * means **a landing place is not permission**. A page that greys its button on
 * `!landsIn || !affordable` alone would offer a button that throws.
 *
 * So each flag is asked against the write it is a promise about.
 */
describe('§82: elke vlag tegen de weigering waar hij over gaat', () => {
  it('means what it says about a thing another kamer has claimed', () => {
    kamers.grant(ROOM, 50, 'genoeg', KEEPER);
    kamers.placeItem(plek(ROOM_B, FREE_BUREAU).id, 'u-bureaulamp', KEEPER);

    const row = shopItem(kamers.shopFor(BRAM, ROOM), 'u-bureaulamp');
    expect(row.takenElsewhere).toBe(true);
    // §83: a unique thing somebody else holds gets no landing place at all —
    // `held` is asked before `landsIn` is filled. The kamer refuses it anyway,
    // which is the half that must be true even if this page went stale.
    expect(row.landsIn).toEqual({});
    kamers.unlockSlot(plek(ROOM, PAID_BUREAU).id, BRAM);
    const spent = kamers.balanceOf(ROOM);
    expect(() => kamers.buyFurnishing(plek(ROOM, PAID_BUREAU).id, row.id, BRAM)).toThrow(/andere kamer/i);
    expect(kamers.balanceOf(ROOM)).toBe(spent);
  });

  it('means what it says about a unique thing you hold yourself', () => {
    kamers.grant(ROOM, 50, 'genoeg', KEEPER);
    kamers.unlockSlot(plek(ROOM, PAID_BUREAU).id, BRAM);
    kamers.placeItem(plek(ROOM, FREE_BUREAU).id, 'u-bureaulamp', KEEPER);

    const row = shopItem(kamers.shopFor(BRAM, ROOM), 'u-bureaulamp');
    expect(row.owned).toBe(true);
    expect(row.landsIn).toEqual({});
    const before = kamers.balanceOf(ROOM);
    expect(() => kamers.buyFurnishing(plek(ROOM, PAID_BUREAU).id, 'u-bureaulamp', BRAM)).toThrow(
      /al ergens in deze kamer/,
    );
    expect(kamers.balanceOf(ROOM)).toBe(before);
  });

  it('means what it says about what you cannot afford', () => {
    kamers.grant(ROOM, 2, 'net niet', KEEPER);
    const row = shopItem(kamers.shopFor(BRAM, ROOM), 'h-stoel');
    expect(row.affordable).toBe(false);
    expect(row.landsIn.plank).toBe(plek(ROOM, FREE_PLANK).id);
    expect(() => kamers.buyFurnishing(row.landsIn.plank!, row.id, BRAM)).toThrow(/nog niet genoeg/);
    expect(kamers.balanceOf(ROOM)).toBe(2);
  });

  /**
   * §83 reversed the second half of this. Owning a leesstoel is still said out
   * loud — it is a fact somebody buying a second one deserves to read — but it
   * refuses nothing any more, and the shop and the kamer say that together.
   */
  it('says you own one and sells you another anyway (§83)', () => {
    kamers.grant(ROOM, 50, 'genoeg', KEEPER);
    kamers.unlockSlot(plek(ROOM, PAID_PLANK).id, BRAM);
    kamers.buyFurnishing(plek(ROOM, FREE_PLANK).id, 'h-stoel', BRAM);

    const row = shopItem(kamers.shopFor(BRAM, ROOM), 'h-stoel');
    expect(row.owned).toBe(true);
    expect(row.unique).toBe(false);
    expect(row.landsIn.plank).toBe(plek(ROOM, PAID_PLANK).id);

    const before = kamers.balanceOf(ROOM);
    expect(() => kamers.buyFurnishing(plek(ROOM, PAID_PLANK).id, 'h-stoel', BRAM)).not.toThrow();
    expect(kamers.balanceOf(ROOM)).toBe(before - row.price);
    expect(plek(ROOM, PAID_PLANK).entryId).toBe('h-stoel');
  });

  /** And nothing the shop hides may be bought by id either (§80's own bug). */
  it('refuses to sell by id what it would not list', () => {
    kamers.grant(ROOM, 50, 'genoeg', KEEPER);
    const shelf = plek(ROOM, FREE_PLANK).id;
    const listed = ids(kamers.shopFor(BRAM, ROOM));

    for (const id of ['v-prijskaartje', 'h-gift', 'h-nul', 'h-zonderplek', 'h-zolder', 'h-geheim', 'h-prep']) {
      expect(listed, id).not.toContain(id);
      expect(() => kamers.buyFurnishing(shelf, id, BRAM), id).toThrow(kamers.KamerError);
    }
    expect(kamers.balanceOf(ROOM)).toBe(50);
    expect(plek(ROOM, FREE_PLANK).entryId).toBeNull();
  });
});

/* ==================================================== H. de vorm van het antwoord */

describe('§82: wat een regel in de winkel draagt', () => {
  it('carries the name, the price and the lines, and groups by kind of plek', () => {
    const shop = kamers.shopFor(BRAM, ROOM);
    expect(shopItem(shop, 'h-stoel')).toMatchObject({
      id: 'h-stoel',
      name: 'Een leesstoel',
      slug: 'leesstoel',
      plekken: ['plank'],
      price: 3,
      effect: ['Een plek om te lezen.', 'Rust bij het haardvuur'],
    });

    /*
     * §83: the grouping moved to the page, because a thing that fits a muur
     * *and* a plank belongs in both groups and one sorted list cannot hold it
     * twice. What the service still guarantees is the order **inside** a group:
     * cheapest first, which is what somebody saving up reads, and what the
     * picker does. The page filters; the order survives the filter.
     */
    for (const kind of shape.PLEK_KINDS) {
      const prices = shop.items.filter((row) => row.plekken.includes(kind)).map((row) => row.price);
      expect(prices).toEqual([...prices].sort((a, b) => a - b));
    }
  });
});

/* ===================================================================== */
/*  Wat de browser vond                                                   */
/* ===================================================================== */

/**
 * §82: twee dingen die pas zichtbaar werden toen een mens de knoppen indrukte.
 *
 * Allebei zijn ze een variant van §17's regel 4 — een lezer en een schrijver
 * die het oneens zijn — en allebei waren ze met een groene unittestsuite
 * onzichtbaar, omdat geen enkele test de soort *opsloeg* of de vlag *omzette*.
 */
describe('§82: wat er pas onder een echte hand stuk ging', () => {
  /**
   * De soort *Huisraad* was niet op te slaan. Migratie `0028` zette hem neer met
   * `id = 'type-huisraad'` en `slug = 'huisraad'` — de enige rij in het archief
   * waar die twee verschillen — en `renameTypeSlug` vergeleek de gewenste slug
   * met het **id**. Elke Opslaan viel daardoor door de kortsluiting heen, vond
   * in de "is dit adres al bezet"-lookup zichzelf, en kwam terug met *"Het adres
   * is al van een andere soort"*. Geen vinkje, veld of woord op die soort was te
   * bewaren; de §80-browsertest drukte met opzet niet op Opslaan en zag het dus
   * nooit.
   */
  it('een soort waarvan het id en de slug verschillen is gewoon op te slaan', async () => {
    const types = await import('@/lib/admin/types');
    const before = sqlite
      .prepare("SELECT id, slug FROM entry_types WHERE slug = 'huisraad'")
      .get() as { id: string; slug: string };
    // De aanname waar dit hele geval op staat: dit is die ene rij.
    expect(before.id).not.toBe(before.slug);

    // Zijn eigen adres opnieuw opgeven is geen hernoeming en mag niets doen.
    expect(() => types.renameTypeSlug(before.id, 'huisraad', KEEPER.id)).not.toThrow();
    expect(types.renameTypeSlug(before.id, 'huisraad', KEEPER.id)).toBe(before.id);
    const after = sqlite
      .prepare("SELECT id, slug FROM entry_types WHERE slug = 'huisraad'")
      .get() as { id: string; slug: string };
    expect(after).toEqual(before);

    // En een adres dat écht van een ander is, wordt nog steeds geweigerd.
    expect(() => types.renameTypeSlug(before.id, 'item', KEEPER.id)).toThrow(/al van een andere soort/i);
  });

  /**
   * §80 liet `one_of_a_kind` een vinkje in Beheer worden, en §82's winkel leest
   * `claim` om te weten of iets al vergeven is. Zet een Keeper die vlag áán
   * nadat er al exemplaren liggen, dan dragen die rijen wel een `entry_id` maar
   * geen `claim`: de winkel bleef het aanbieden terwijl `buyFurnishing` het
   * weigerde. `updateType` vult de claims nu bij — en haalt ze weg als de vlag
   * weer uit gaat.
   */
  it('het omzetten van "er is er maar één van" haalt de bestaande exemplaren bij', async () => {
    const types = await import('@/lib/admin/types');
    const typeId = (sqlite.prepare("SELECT id FROM entry_types WHERE slug = 'huisraad'").get() as { id: string }).id;
    const slot = plek(ROOM, FREE_PLANK);
    kamers.placeItem(slot.id, 'h-stoel', KEEPER);
    const claimOf = () =>
      (sqlite.prepare('SELECT claim FROM room_slots WHERE id = ?').get(slot.id) as { claim: string | null }).claim;

    // Huisraad is niet uniek, dus er staat geen claim op.
    expect(claimOf()).toBeNull();

    types.updateType(typeId, { oneOfAKind: true }, KEEPER.id);
    expect(claimOf()).toBe('h-stoel');

    types.updateType(typeId, { oneOfAKind: false }, KEEPER.id);
    expect(claimOf()).toBeNull();
  });
});
