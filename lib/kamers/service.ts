import { and, asc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { canView, grantFor, loadAccessRow, viewerCanEdit } from '@/lib/access';
import { db, schema } from '@/lib/db';
import { visibleEntryCondition, type Viewer } from '@/lib/entries/visibility';
import { logActivity } from '@/lib/entries/service';
import { newId } from '@/lib/ids';
import type { CoverCrops } from '@/lib/images/shapes';
import {
  EFFECT_FIELD_KEY,
  isPlekKind,
  plekKinds,
  PRICE_FIELD_KEY,
  ROOM_SHAPE,
  VOORWERP_FIELD_KEY,
  type PlekKind,
} from './shape';

/**
 * §79: de kamer — de plekken, het grootboek, en wie wat mag.
 *
 * The boundary this is built inside is README rule 78, and it is the first
 * thing to read:
 *
 * > Het archief onthoudt wat je bezit, wat er in welke plek ligt, en wat dat
 * > ding *zegt* dat het doet. Het rekent nooit een bonus uit, past er nooit een
 * > toe, en spreekt nooit recht over wat mag. De tafel beslist.
 *
 * So there is no number in this file that means anything except a price and a
 * balance. What a voorwerp *does* is prose on its artikel.
 *
 * Three rules hold the rest of it up:
 *
 *   1. **The balance is the sum of the grootboek.** Never a column, never
 *      edited. A Keeper's mistake is a line added.
 *   2. **A spend is one transaction, and its guard is part of the write.** Two
 *      clicks must not buy one plek twice, and the way to be sure of that is to
 *      make the UPDATE itself say "…and only if it is still locked" rather than
 *      to read first and hope.
 *   3. **A voorwerp is an artikel**, so every rule about seeing one already
 *      exists (§9, §17, §44) and none of it is re-implemented here.
 */

/* ------------------------------------------------------------- the reading */

export type SlotView = {
  id: string;
  kind: PlekKind;
  sortOrder: number;
  price: number;
  locked: boolean;
  item: {
    id: string;
    name: string;
    slug: string;
    coverAssetId: string | null;
    coverCrop: CoverCrops | null;
    typeIcon: string;
    typeColour: string;
  } | null;
  /**
   * §79, and it is §76's rule again in a new place: this plek holds something
   * the looker may not see. It is shown **filled and nameless**, never empty —
   * an empty plek that is really full is a lie the owner did not tell — and the
   * phrase is one constant, the same whether the voorwerp is Keeper-only (§9)
   * or on the other side (§44). The variation is what would leak.
   */
  veiled: boolean;
};

export type RoomView = {
  id: string;
  character: { id: string; name: string; slug: string };
  ownerId: string | null;
  /**
   * §84: en hoe die persoon heet. `ownerId` stond hier sinds §79 en werd door
   * niets gelezen; de kamerpagina heeft de naam nodig voor twee dingen die
   * allebei uit elkaar gehouden moeten worden — de eyebrow (van wie is deze
   * kamer) tegenover de kop (welke onderzoeker), en de zin die de Keeper leest
   * als hij in andermans kamer staat.
   */
  ownerName: string | null;
  balance: number;
  slots: SlotView[];
  /** This viewer may unlock, place and clear. */
  canArrange: boolean;
  /** This viewer may write a grootboek line. Keeper only. */
  canGrant: boolean;
  /**
   * §80: wat deze kamer je geeft — the effect lines of everything lying here,
   * each with the thing that says it.
   *
   * Built from what this viewer may *see*, which is the whole of its rights
   * logic: a veiled thing contributes nothing at all. Otherwise the veil leaks
   * anyway — "er ligt iets" on the plek, and three lines below it exactly what
   * it does (§76).
   *
   * The archive lists. It never adds two of these together, never resolves
   * them, and never says which wins (rule 78).
   */
  effects: { name: string; href: string; lines: string[] }[];
};

/** Who wears this karakter. The kamer belongs to the onderzoeker; this is who arranges it. */
function ownerOf(entryId: string): string | null {
  const row = db
    .select({ userId: schema.userCharacters.userId })
    .from(schema.userCharacters)
    .innerJoin(schema.users, eq(schema.users.id, schema.userCharacters.userId))
    .where(and(eq(schema.userCharacters.entryId, entryId), eq(schema.users.isDisabled, false)))
    .get();
  return row?.userId ?? null;
}

/**
 * The kamer of this onderzoeker, made if it is not there yet.
 *
 * Made on a *read*, which is unusual enough to say why: a kamer has no content
 * of its own until somebody spends something, so creating it when the karakter
 * is tied on would mean a migration walking the table and a second road for
 * every karakter tied afterwards. The insert is race-safe (the unique index on
 * `entry_id` plus `onConflictDoNothing`), and an onderzoeker nobody wears gets
 * no kamer at all.
 */
export function getOrCreateRoom(entryId: string): string | null {
  const owner = ownerOf(entryId);
  const existing = db
    .select({ id: schema.rooms.id, createdBy: schema.rooms.createdBy })
    .from(schema.rooms)
    .where(eq(schema.rooms.entryId, entryId))
    .get();
  /*
   * §86: **de drager beslist of er een kamer gemáákt wordt, niet of er één
   * gevonden wordt.**
   *
   * De vraag stond hier bovenaan, vóór de opzoeking, en dat was vier rondes
   * lang hetzelfde antwoord — zonder drager bestond er toch geen kamer. Sinds
   * §86 kan de Keeper er met de hand één openen, en toen werd die volgorde een
   * lek van de stille soort: de kamer bestond, de uitdeler vond hem, en élke
   * andere lezer (`roomSummary`, `viewRoomBySlug`, de deur op het artikel) zei
   * dat er geen was. De knop deed het en er gebeurde zichtbaar niets.
   *
   * Dit is §83's les op een derde plek: een tweede lezer van hetzelfde ding
   * beweegt niet mee. Gevonden door de e2e-zaak die de knop indrukt en daarna
   * kijkt of er iets veranderd is — niet door de unit-test, die `roomIdFor`
   * vroeg en dus langs deze functie heen keek.
   */
  if (existing) {
    if (owner && existing.createdBy !== owner) {
      db.update(schema.rooms).set({ createdBy: owner }).where(eq(schema.rooms.id, existing.id)).run();
    }
    syncShape(existing.id);
    return existing.id;
  }
  if (!owner) return null;
  /*
   * Vanaf hier is er geen kamer én een drager, dus er wordt er één gemaakt.
   * `created_by` is niet wie hem mag inrichten (dat is `canArrangeRoom`), maar
   * hem naar de vorige drager laten wijzen zou een tweede, fout antwoord laten
   * liggen — daarom wordt hij hierboven bijgewerkt als het karakter van hand
   * wisselt.
   */
  const id = newId();
  db.insert(schema.rooms).values({ id, entryId, createdBy: owner }).onConflictDoNothing().run();
  const settled =
    db.select({ id: schema.rooms.id }).from(schema.rooms).where(eq(schema.rooms.entryId, entryId)).get()?.id ?? id;
  syncShape(settled);
  return settled;
}

/**
 * §86: een kamer voor een onderzoeker die niemand draagt.
 *
 * `getOrCreateRoom` weigert dat met opzet — een kamer hangt aan een gedragen
 * karakter (§17/§18: een karakter is een naam die iemand draagt, en de kamer
 * gaat met hem mee). Dat klopt nog steeds voor de kamer die vanzelf ontstaat.
 * Maar Nick, ronde 47: *"coins belong to a character"*, en hij schrijft
 * karakters die nog aan niemand gekoppeld zijn — een figuur die hij deze
 * sessie introduceert, een onderzoeker die klaarligt voor een nieuwe speler.
 * Die kunnen vandaag niets bezitten en niets ontvangen.
 *
 * Dus is er **één extra weg, en het is een handeling en geen bijwerking**.
 * Nick kiest, ronde 47: *"alleen als jij er één opent"* — geen soort die
 * automatisch een beurs krijgt, geen artikel dat er een krijgt doordat iemand
 * ernaar kijkt. Dat laatste is niet theoretisch: `roomSummary` wordt sinds §85
 * op *elk* artikel aangeroepen, dus een versoepeling van `getOrCreateRoom`
 * had elk artikel in het archief een kamer gegeven zodra iemand het opensloeg.
 *
 * Drie dingen die eruit volgen en die niet vergeten mogen worden:
 *
 *  - **`created_by` is de Keeper**, want hij heeft hem gemaakt. Wie hem
 *    *arrangeert* is een andere vraag en die leest `ownerOf` (null hier), dus
 *    `canArrangeRoom` laat alleen de Keeper binnen — precies goed voor een
 *    figuur die niemand speelt.
 *  - **Hij wordt privé geboren** (§48: een nieuw ding wordt geboren op de kant
 *    waar het gemaakt is). Een kamer die vanzelf ontstaat is van een speler en
 *    staat open; deze is van de Keeper en staat dicht tot hij hem opendraait.
 *    Anders leest de tafel morgen wat er in de kist van een NPC ligt.
 *  - **Hij verdwijnt niet als er later wél iemand op gekoppeld wordt.** Dan is
 *    het gewoon zijn kamer, met wat erin lag — wat precies de bedoeling is van
 *    een onderzoeker die klaarligt.
 */
export function openRoomFor(entryId: string, viewer: Viewer): string | null {
  if (!viewer?.isKeeper) return null;
  const entry = db
    .select({ id: schema.entries.id })
    .from(schema.entries)
    .where(and(eq(schema.entries.id, entryId), isNull(schema.entries.deletedAt)))
    .get();
  if (!entry) return null;

  const existing = db
    .select({ id: schema.rooms.id })
    .from(schema.rooms)
    .where(eq(schema.rooms.entryId, entryId))
    .get();
  if (existing) {
    syncShape(existing.id);
    return existing.id;
  }

  const id = newId();
  db.insert(schema.rooms)
    .values({ id, entryId, createdBy: viewer.id, viewMode: 'private', editMode: 'private' })
    .onConflictDoNothing()
    .run();
  const settled =
    db.select({ id: schema.rooms.id }).from(schema.rooms).where(eq(schema.rooms.entryId, entryId)).get()?.id ?? id;
  syncShape(settled);
  return settled;
}

/**
 * Does this artikel have a kamer at all, without making one?
 *
 * The question the Keeper's door on an artikel asks, and it may not be
 * `getOrCreateRoom` — that one *writes*, and a page that renders a door would
 * then create the thing the door offers to create.
 */
export function roomIdFor(entryId: string): string | null {
  return (
    db.select({ id: schema.rooms.id }).from(schema.rooms).where(eq(schema.rooms.entryId, entryId)).get()?.id ?? null
  );
}

/**
 * Give this kamer every plek the shape says it should have, and touch nothing
 * it already has.
 *
 * Additive by construction: a plek is identified by its position in
 * `ROOM_SHAPE`, so a rung added at the end appears in every existing kamer as a
 * new locked plek, and a rung that is already there is never re-priced. See the
 * two rules in `shape.ts` — this function is why they matter.
 */
export function syncShape(roomId: string) {
  const have = db
    .select({ sortOrder: schema.roomSlots.sortOrder })
    .from(schema.roomSlots)
    .where(eq(schema.roomSlots.roomId, roomId))
    .all();
  const seen = new Set(have.map((row) => row.sortOrder));
  const now = Math.floor(Date.now() / 1000);
  const missing = ROOM_SHAPE.map((seed, index) => ({ seed, index })).filter(({ index }) => !seen.has(index));
  if (!missing.length) return;
  db.insert(schema.roomSlots)
    .values(
      missing.map(({ seed, index }) => ({
        id: newId(),
        roomId,
        kind: seed.kind,
        sortOrder: index,
        price: seed.price,
        // A plek that costs nothing is open from the start; everything else is
        // something to want.
        unlockedAt: seed.price === 0 ? now : null,
      })),
    )
    .run();
}

/** The balance, which is the grootboek and nothing else. */
export function balanceOf(roomId: string): number {
  const row = db
    .select({ total: sql<number>`COALESCE(SUM(${schema.roomLedger.delta}), 0)` })
    .from(schema.roomLedger)
    .where(eq(schema.roomLedger.roomId, roomId))
    .get();
  return Number(row?.total ?? 0);
}

export type LedgerLine = {
  id: string;
  delta: number;
  kind: 'grant' | 'slot' | 'item';
  reason: string;
  createdAt: number;
  /**
   * §83: this line names something this pair of eyes may not see. The page
   * prints `words.slotVeiled` instead of the reason — the same sentence the
   * plek itself uses, for the same reason (§76).
   */
  veiled: boolean;
};

/**
 * §79/§83: het grootboek, door de ogen van wie kijkt.
 *
 * §79 kept this for the Keeper alone, which made the viewer irrelevant. Nick,
 * ronde 44: *"Spelers mogen het 'grootboek' ook wel kunnen inzien."* — so it is
 * now read by everyone who may see the kamer, and that makes the viewer the
 * whole problem.
 *
 * **A line of `kind: 'item'` carries the name of an artikel** (`buyFurnishing`
 * writes `entry.name`). Somebody who may stand in this kamer but may not see
 * that artikel would read its name here — which is precisely the leak
 * `SlotView.veiled` exists to stop. A plek that says *er ligt iets* with three
 * lines underneath saying exactly what is not a veil.
 *
 * So an `item` line whose artikel does not pass `visibleEntryCondition` comes
 * back veiled. **The amount stays**: the balance is already on the page and the
 * plek already says something is lying there, so the number tells nobody
 * anything new — and a line that vanished, or one whose amount was blanked,
 * would itself be the tell (§76: the variation is the leak).
 *
 * `grant` lines are the Keeper's own words, written for the player to read, and
 * `slot` lines print a kind of plek. Neither is ever veiled.
 */
export function ledgerOf(roomId: string, viewer: Viewer, limit = 50): LedgerLine[] {
  const rows = db
    .select({
      id: schema.roomLedger.id,
      delta: schema.roomLedger.delta,
      kind: schema.roomLedger.kind,
      reason: schema.roomLedger.reason,
      createdAt: schema.roomLedger.createdAt,
      entryId: schema.roomLedger.entryId,
    })
    .from(schema.roomLedger)
    .where(eq(schema.roomLedger.roomId, roomId))
    /*
     * Several lines share a second all the time — a grant and the spend it
     * paid for, and since §83 a whole uitdeling at once. `rowid` is the only
     * tiebreak that is in writing order.
     *
     * §79 wrote exactly that sentence in this comment and then sorted by `id`,
     * which `lib/ids.ts` makes out of sixteen random bytes. So two lines in the
     * same second came back in an order that had nothing to do with anything,
     * and it was invisible for four rounds because only the Keeper ever read
     * this list. §83 opened it to everybody and a test found it the same hour.
     */
    .orderBy(sql`${schema.roomLedger.createdAt} DESC, ${schema.roomLedger}.rowid DESC`)
    .limit(limit)
    .all();

  const named = rows.map((row) => row.entryId).filter((id): id is string => Boolean(id));
  const visible = new Set(
    named.length
      ? db
          .select({ id: schema.entries.id })
          .from(schema.entries)
          .where(and(inArray(schema.entries.id, named), visibleEntryCondition(viewer)))
          .all()
          .map((row) => row.id)
      : [],
  );

  return rows.map(({ entryId, ...line }) => ({
    ...line,
    veiled: line.kind === 'item' && Boolean(entryId) && !visible.has(entryId as string),
  }));
}

/** May this viewer look at this kamer at all? The artikel's rule, then the dial. */
export function canSeeRoom(roomId: string, viewer: Viewer): boolean {
  const row = loadAccessRow('room', roomId);
  if (!row) return false;
  const room = db
    .select({ entryId: schema.rooms.entryId })
    .from(schema.rooms)
    .where(eq(schema.rooms.id, roomId))
    .get();
  if (!room) return false;
  // An onderzoeker you cannot see has no kamer, as far as you are concerned.
  const entry = db
    .select({ id: schema.entries.id })
    .from(schema.entries)
    .where(and(eq(schema.entries.id, room.entryId), visibleEntryCondition(viewer)))
    .get();
  if (!entry) return false;
  return canView(row, viewer, viewer ? grantFor('room', roomId, viewer.id) : null);
}

/** The whole kamer, as this viewer may see it. Null when they may not, or there is none. */
export function viewRoomBySlug(slug: string, viewer: Viewer): RoomView | null {
  const entry = db
    .select({
      id: schema.entries.id,
      name: schema.entries.name,
      slug: schema.entries.slug,
    })
    .from(schema.entries)
    .where(and(eq(schema.entries.slug, slug), visibleEntryCondition(viewer)))
    .get();
  if (!entry) return null;
  const roomId = getOrCreateRoom(entry.id);
  if (!roomId || !canSeeRoom(roomId, viewer)) return null;

  const rows = db
    .select({
      id: schema.roomSlots.id,
      kind: schema.roomSlots.kind,
      sortOrder: schema.roomSlots.sortOrder,
      price: schema.roomSlots.price,
      unlockedAt: schema.roomSlots.unlockedAt,
      entryId: schema.roomSlots.entryId,
    })
    .from(schema.roomSlots)
    .where(eq(schema.roomSlots.roomId, roomId))
    .orderBy(asc(schema.roomSlots.sortOrder))
    .all();

  /*
   * The voorwerpen, through the reader's own eyes in one query. A row that does
   * not come back is not missing — it is veiled, and the difference is the
   * whole of the rule at the top of `SlotView`.
   */
  const itemIds = rows.map((row) => row.entryId).filter((id): id is string => Boolean(id));
  const items = itemIds.length
    ? db
        .select({
          id: schema.entries.id,
          name: schema.entries.name,
          slug: schema.entries.slug,
          coverAssetId: schema.entries.coverAssetId,
          coverCrop: schema.entries.coverCrop,
          typeIcon: schema.entryTypes.icon,
          typeColour: schema.entryTypes.colour,
        })
        .from(schema.entries)
        .innerJoin(schema.entryTypes, eq(schema.entryTypes.id, schema.entries.typeId))
        .where(and(inArray(schema.entries.id, itemIds), visibleEntryCondition(viewer)))
        .all()
    : [];
  const byId = new Map(items.map((item) => [item.id, item]));
  // §84: wie deze onderzoeker draagt, en hoe die heet.
  const owner = ownerOf(entry.id);
  // §80: the effect lines come off the same rows, and only the visible ones —
  // a thing this viewer may not see contributes nothing to the list below.
  const fieldsById = new Map(
    (itemIds.length
      ? db
          .select({ id: schema.entries.id, fields: schema.entries.fields })
          .from(schema.entries)
          .where(and(inArray(schema.entries.id, itemIds), visibleEntryCondition(viewer)))
          .all()
      : []
    ).map((row) => [row.id, row.fields]),
  );

  return {
    id: roomId,
    character: entry,
    ownerId: owner,
    ownerName: owner
      ? (db.select({ username: schema.users.username }).from(schema.users).where(eq(schema.users.id, owner)).get()
          ?.username ?? null)
      : null,
    balance: balanceOf(roomId),
    slots: rows.map((row) => {
      const item = row.entryId ? (byId.get(row.entryId) ?? null) : null;
      return {
        id: row.id,
        kind: (isPlekKind(row.kind) ? row.kind : 'plank') as PlekKind,
        sortOrder: row.sortOrder,
        price: row.price,
        locked: row.unlockedAt === null,
        item,
        veiled: Boolean(row.entryId) && !item,
      };
    }),
    canArrange: canArrangeRoom(roomId, viewer),
    canGrant: Boolean(viewer?.isKeeper),
    effects: rows
      .map((row) => (row.entryId ? byId.get(row.entryId) : null))
      .filter((item): item is NonNullable<typeof item> => Boolean(item))
      .map((item) => ({
        name: item.name,
        href: `/e/${item.slug}`,
        lines: effectLines(fieldsById.get(item.id)?.[EFFECT_FIELD_KEY]),
      }))
      .filter((thing) => thing.lines.length > 0),
  };
}

/* ------------------------------------------------------------ the catalogue */

export type CatalogueEntry = {
  id: string;
  name: string;
  slug: string;
  shortDescription: string;
  coverAssetId: string | null;
  price: number;
  effect: string[];
};

/**
 * §80: what is for sale that fits this plek.
 *
 * Everything the viewer may see, of a soort the Keeper keeps to himself
 * (`keeper_made`), fitting this kind of plek and carrying a price. What is
 * too dear is **in the list anyway**, greyed by the page: saving up starts with
 * seeing what there is to save for. Affordability is the page's business, not
 * this function's — it answers "what exists", and the balance is right there.
 *
 * §83 took the kamer out of the signature. It was only ever there to hide what
 * you already owned, and owning something twice is allowed now; a dead
 * parameter is an invitation to start using it again (§81).
 */
export function catalogueFor(kind: PlekKind, viewer: Viewer): CatalogueEntry[] {
  /*
   * §83, and it is §17's rule 4 in the place it always bites: this is the
   * *reader* of the sentence `buyFurnishing` writes, so it moved when that one
   * did.
   *
   * §80 kept out everything already lying in this kamer **and** everything
   * claimed anywhere. The first half is now wrong: since ronde 44 a second copy
   * of the same stoel is allowed, and a catalogue that hides what the kamer
   * would happily accept is a catalogue that lies about the kamer.
   *
   * What is left is exactly the claims — and a claim is only ever written for
   * something there is one of (§80), so a unique thing lying *here* is in this
   * set too. One list, one rule, and `roomId` is no longer part of the answer.
   */
  const claimed = db
    .select({ claim: schema.roomSlots.claim })
    .from(schema.roomSlots)
    .all()
    .map((row) => row.claim)
    .filter((id): id is string => Boolean(id));
  const taken = new Set(claimed);

  return db
    .select({
      id: schema.entries.id,
      name: schema.entries.name,
      slug: schema.entries.slug,
      shortDescription: schema.entries.shortDescription,
      coverAssetId: schema.entries.coverAssetId,
      fields: schema.entries.fields,
    })
    .from(schema.entries)
    .innerJoin(schema.entryTypes, eq(schema.entryTypes.id, schema.entries.typeId))
    .where(and(eq(schema.entryTypes.keeperMade, true), visibleEntryCondition(viewer)))
    .all()
    .map((row) => {
      const price = Number(row.fields?.[PRICE_FIELD_KEY]);
      return {
        id: row.id,
        name: row.name,
        slug: row.slug,
        shortDescription: row.shortDescription,
        coverAssetId: row.coverAssetId,
        plekken: plekKinds(row.fields?.[VOORWERP_FIELD_KEY]),
        price: Number.isFinite(price) && price > 0 ? Math.floor(price) : 0,
        effect: effectLines(row.fields?.[EFFECT_FIELD_KEY]),
      };
    })
    .filter((row) => row.plekken.includes(kind) && row.price > 0 && !taken.has(row.id))
    .map(({ plekken: _plekken, ...rest }) => rest)
    .sort((a, b) => a.price - b.price || a.name.localeCompare(b.name, 'nl'));
}

/* ----------------------------------------------------------------- de winkel */

export type ShopItem = {
  id: string;
  name: string;
  slug: string;
  shortDescription: string;
  coverAssetId: string | null;
  /** §83: every kind of plek this fits. A shop row is drawn once per kind. */
  plekken: PlekKind[];
  price: number;
  effect: string[];
  /**
   * §80: there is one of this in the world. Since §83 this is the *only* thing
   * that stops a second copy, so the page asks it and not `owned`.
   */
  unique: boolean;
  /** Already lying in the kamer being shopped for. A label, not a refusal (§83). */
  owned: boolean;
  /**
   * §84: en hoevéél ervan. Sinds §83 mag hetzelfde stuk huisraad vaker in één
   * kamer staan, en dan is "staat al in je kamer" een armere zin dan het aantal.
   * Puur een telling voor het scherm: hij weigert niets en `owned` blijft de
   * vraag die de knop stelt.
   */
  ownedCount: number;
  /** One of a kind, and somebody else has it. */
  takenElsewhere: boolean;
  /**
   * §83: the plek it would land in, **per kind of plek** — open, empty and of
   * that kind. A thing that hangs on a muur and stands on a plank, with a full
   * muur and a free plank, is not for sale under *muur* and is under *plank*.
   * One `landsIn` for such a thing would make the shop lie in one of its two
   * groups.
   */
  landsIn: Partial<Record<PlekKind, string>>;
  affordable: boolean;
};

export type ShopRoom = { id: string; name: string; slug: string; balance: number };

export type Shop = {
  /** The onderzoekers this viewer wears, each with their own purse. */
  rooms: ShopRoom[];
  /** Which one is being shopped for, when there is one. */
  roomId: string | null;
  balance: number;
  items: ShopItem[];
};

/**
 * §82: de winkel — alles wat er te koop is, op één plek.
 *
 * §80 put the catalogue inside the plek-picker, which answers "what fits *this*
 * plek" and is the right question at the moment you are standing in front of an
 * empty plank. It is the wrong question for the thing a player actually does
 * between sessions: look at everything, pick something, and save for it. You
 * cannot save up for what you have to open a drawer to see.
 *
 * So this one asks nothing and shows everything the viewer may see. What they
 * cannot afford is **in the list, priced** — that is the whole point of a shop
 * window. What they already own says so. What is one of a kind and already on
 * somebody else's shelf says that too, because a lantaarn that is gone is not
 * simply missing from the world.
 *
 * Buying from here lands the thing in the first free plek of its kind
 * (`landsIn`), which is only ever a convenience: the purchase goes through
 * `buyFurnishing` like every other, with every one of its five conditions. A
 * shop that could buy something the kamer would refuse is a shop that lies.
 *
 * The Keeper wears no onderzoeker (§18), so he has no purse and no buttons
 * here. He reads it as a price list — which is what it is for him, since he
 * puts things down for free.
 */
export function shopFor(viewer: Viewer, wantedRoomId: string | null = null): Shop {
  const rooms = roomsOf(viewer);
  const room = rooms.find((candidate) => candidate.id === wantedRoomId) ?? rooms[0] ?? null;

  const slots = room
    ? db
        .select({
          id: schema.roomSlots.id,
          kind: schema.roomSlots.kind,
          entryId: schema.roomSlots.entryId,
          unlockedAt: schema.roomSlots.unlockedAt,
          sortOrder: schema.roomSlots.sortOrder,
        })
        .from(schema.roomSlots)
        .where(eq(schema.roomSlots.roomId, room.id))
        .orderBy(asc(schema.roomSlots.sortOrder))
        .all()
    : [];
  const mine = new Map<string, number>();
  for (const slot of slots) {
    if (!slot.entryId) continue;
    mine.set(slot.entryId, (mine.get(slot.entryId) ?? 0) + 1);
  }
  const freeByKind = new Map<PlekKind, string>();
  for (const slot of slots) {
    if (slot.unlockedAt === null || slot.entryId) continue;
    const kind = slot.kind as PlekKind;
    if (!freeByKind.has(kind)) freeByKind.set(kind, slot.id);
  }
  // §80: a claim is only ever made for a thing there is one of, so this is
  // exactly the set of unique things that are spoken for.
  const claimed = new Set(
    db
      .select({ claim: schema.roomSlots.claim })
      .from(schema.roomSlots)
      .all()
      .map((row) => row.claim)
      .filter((id): id is string => Boolean(id)),
  );

  const items = db
    .select({
      id: schema.entries.id,
      name: schema.entries.name,
      slug: schema.entries.slug,
      shortDescription: schema.entries.shortDescription,
      coverAssetId: schema.entries.coverAssetId,
      fields: schema.entries.fields,
      oneOfAKind: schema.entryTypes.oneOfAKind,
    })
    .from(schema.entries)
    .innerJoin(schema.entryTypes, eq(schema.entryTypes.id, schema.entries.typeId))
    .where(and(eq(schema.entryTypes.keeperMade, true), visibleEntryCondition(viewer)))
    .all()
    .map((row) => {
      const price = Number(row.fields?.[PRICE_FIELD_KEY]);
      return {
        id: row.id,
        name: row.name,
        slug: row.slug,
        shortDescription: row.shortDescription,
        coverAssetId: row.coverAssetId,
        plekken: plekKinds(row.fields?.[VOORWERP_FIELD_KEY]),
        price: Number.isFinite(price) && price > 0 ? Math.floor(price) : 0,
        effect: effectLines(row.fields?.[EFFECT_FIELD_KEY]),
        unique: Boolean(row.oneOfAKind),
      };
    })
    .filter((row) => row.plekken.length > 0 && row.price > 0)
    .map((row) => {
      const ownedCount = mine.get(row.id) ?? 0;
      const owned = ownedCount > 0;
      /*
       * §83: owning one no longer keeps you from buying another — that was the
       * whole of Nick's third wish. Only `one_of_a_kind` still holds a row
       * back, and then it holds it back whether the copy is yours or
       * somebody else's, because there is exactly one.
       */
      const held = row.unique && (owned || claimed.has(row.id));
      const landsIn: Partial<Record<PlekKind, string>> = {};
      if (!held) {
        /*
         * §84: in de volgorde van de **ladder**, en niet van `PLEK_KINDS`.
         *
         * `freeByKind` is gevuld door `slots` in `sort_order` af te lopen, dus
         * zijn sleutels staan al in de volgorde waarin deze kamer gebouwd is.
         * Die volgorde hier aanhouden is wat een sleutelvolgorde waard maakt:
         * de winkel heeft er één koopknop bij en die moet ergens landen, en
         * "de eerste vrije plek" hoort de vroegste sport van de ladder te zijn
         * en niet de eerste soort die toevallig in een constante bovenaan staat.
         *
         * `ROOM_SHAPE` begint met bureau, plank, muur; `PLEK_KINDS` met muur.
         * Wie hier over `row.plekken` loopt, krijgt dus de muur — en schrijft
         * er dan een comment bij dat "de eerste vrije plek" zegt.
         */
        for (const [kind, free] of freeByKind) {
          if (row.plekken.includes(kind)) landsIn[kind] = free;
        }
      }
      return {
        ...row,
        owned,
        ownedCount,
        takenElsewhere: !owned && row.unique && claimed.has(row.id),
        landsIn,
        affordable: Boolean(room) && room!.balance >= row.price,
      };
    })
    .sort((a, b) => a.price - b.price || a.name.localeCompare(b.name, 'nl'));

  return { rooms, roomId: room?.id ?? null, balance: room?.balance ?? 0, items };
}

/**
 * §84: de beurs van de onderzoeker die je nú draagt — het ene getal dat de
 * schil op elke pagina laat zien.
 *
 * Tot ronde 45 stond het saldo op precies twee pagina's, en de weg ernaartoe
 * was drie klikken diep; `/you` noemde de winkel en de hal en **nooit de kamer
 * en nooit het saldo**. Een spaarpot die je niet ziet is geen spaarpot.
 *
 * Eén onderzoeker en niet allemaal, om twee redenen. Het is *de* beurs waaruit
 * je op dit moment betaalt — dezelfde die `WritingAsLine` bedoelt met "je
 * schrijft als" — en de hoek van elke pagina is geen plek voor een lijstje
 * (§76's redenering over het aanwezigheidslijstje, één laag hoger).
 *
 * Nooit die van een ander: dit leest alleen de eigen `activeCharacterId`, en de
 * Keeper draagt niemand (§18) en krijgt dus `null`. Wie nog geen onderzoeker
 * draagt ook — en dan staat er niets, in plaats van een nul (§80: een blokje
 * dat "0 munten" zegt tegen iemand die geen kamer heeft, belooft een kamer).
 */
export type Purse = { roomId: string; balance: number; slug: string; name: string };

export function purseOf(viewer: Viewer): Purse | null {
  if (!viewer || viewer.isKeeper) return null;
  const worn = db
    .select({ entryId: schema.entries.id, name: schema.entries.name, slug: schema.entries.slug })
    .from(schema.users)
    .innerJoin(schema.entries, eq(schema.entries.id, schema.users.activeCharacterId))
    .innerJoin(
      schema.userCharacters,
      and(
        eq(schema.userCharacters.userId, schema.users.id),
        eq(schema.userCharacters.entryId, schema.entries.id),
      ),
    )
    .where(and(eq(schema.users.id, viewer.id), visibleEntryCondition(viewer)))
    .get();
  if (!worn) return null;
  const roomId = getOrCreateRoom(worn.entryId);
  if (!roomId) return null;
  return { roomId, balance: balanceOf(roomId), slug: worn.slug, name: worn.name };
}

/** Every onderzoeker this person wears, with their kamer and its purse. */
export function roomsOf(viewer: Viewer): ShopRoom[] {
  if (!viewer) return [];
  const worn = db
    .select({ entryId: schema.userCharacters.entryId, name: schema.entries.name, slug: schema.entries.slug })
    .from(schema.userCharacters)
    .innerJoin(schema.entries, eq(schema.entries.id, schema.userCharacters.entryId))
    .where(and(eq(schema.userCharacters.userId, viewer.id), visibleEntryCondition(viewer)))
    .orderBy(asc(schema.userCharacters.sortOrder))
    .all();
  const out: ShopRoom[] = [];
  for (const karakter of worn) {
    const roomId = getOrCreateRoom(karakter.entryId);
    if (!roomId) continue;
    out.push({ id: roomId, name: karakter.name, slug: karakter.slug, balance: balanceOf(roomId) });
  }
  return out;
}

/* ------------------------------------------------------------- the spending */

export class KamerError extends Error {}

/**
 * §79: who may arrange this kamer — asked of **one** fact.
 *
 * It used to go through `viewerCanEdit('room', …)`, which for a `private` dial
 * means `created_by === you`. That is a copy of "who wears this onderzoeker",
 * written down once when the kamer was made and never again — so when a
 * karakter changed hands (the ordinary thing a Keeper does), the same
 * `RoomView` would say *Aagje lives here* and *Bram may rearrange it*, and Bram
 * could spend her munt. Two answers to one question, which is the shape of
 * mistake `lib/access.ts` exists to keep out.
 *
 * So the wearer is the owner, live, from `user_characters` — the same source
 * `RoomView.ownerId` uses. The Keeper is above it as always.
 */
export function canArrangeRoom(roomId: string, viewer: Viewer): boolean {
  if (!viewer) return false;
  if (viewer.isKeeper) return true;
  const room = db
    .select({ entryId: schema.rooms.entryId })
    .from(schema.rooms)
    .where(eq(schema.rooms.id, roomId))
    .get();
  if (!room) return false;
  return ownerOf(room.entryId) === viewer.id;
}

function requireArrange(roomId: string, viewer: Viewer) {
  if (!canArrangeRoom(roomId, viewer)) throw new KamerError('Dit is jouw kamer niet.');
}

/**
 * Open a plek.
 *
 * The guard is part of the write: the UPDATE only lands `WHERE unlocked_at IS
 * NULL`, so a second click — a double tap, a retry after a slow response, two
 * tabs — changes no rows and buys nothing. Reading first and then writing is
 * the version of this that charges twice on a bad evening.
 */
export function unlockSlot(slotId: string, viewer: Viewer): { spent: number } {
  const slot = db
    .select({
      id: schema.roomSlots.id,
      roomId: schema.roomSlots.roomId,
      price: schema.roomSlots.price,
      unlockedAt: schema.roomSlots.unlockedAt,
      kind: schema.roomSlots.kind,
    })
    .from(schema.roomSlots)
    .where(eq(schema.roomSlots.id, slotId))
    .get();
  if (!slot) throw new KamerError('Die plek bestaat niet.');
  requireArrange(slot.roomId, viewer);
  if (slot.unlockedAt !== null) throw new KamerError('Die plek is al open.');

  return db.transaction((tx) => {
    const balance = Number(
      tx
        .select({ total: sql<number>`COALESCE(SUM(${schema.roomLedger.delta}), 0)` })
        .from(schema.roomLedger)
        .where(eq(schema.roomLedger.roomId, slot.roomId))
        .get()?.total ?? 0,
    );
    if (balance < slot.price) throw new KamerError('Daar heb je nog niet genoeg voor.');
    const now = Math.floor(Date.now() / 1000);
    const done = tx
      .update(schema.roomSlots)
      .set({ unlockedAt: now })
      .where(and(eq(schema.roomSlots.id, slotId), sql`${schema.roomSlots.unlockedAt} IS NULL`))
      .run();
    // Somebody else's click won the race. Nothing was charged, and nothing
    // should be: the plek they opened is the plek this one wanted.
    if (done.changes === 0) throw new KamerError('Die plek is al open.');
    if (slot.price > 0) {
      tx.insert(schema.roomLedger)
        .values({
          id: newId(),
          roomId: slot.roomId,
          delta: -slot.price,
          kind: 'slot',
          reason: slot.kind,
          actorId: viewer?.id ?? null,
          slotId,
        })
        .run();
    }
    return { spent: slot.price };
  });
}

/**
 * §80: what the artikel's *soort* says about it — the two flags that decide how
 * it behaves in a kamer, plus what it costs.
 *
 * `oneOfAKind` is the one that matters most here: it is what fills `claim`, and
 * therefore what the unique index is about. A voorwerp is one thing in the
 * world; huisraad is a listing, and two onderzoekers may own the same one.
 */
export type ThingFacts = {
  /**
   * §83: the kinds of plek this thing fits — a list, and empty means it belongs
   * in no kamer at all. Was one kind until ronde 44; see `plekKinds`.
   */
  plekken: PlekKind[];
  keeperMade: boolean;
  oneOfAKind: boolean;
  /** In munten. Null or 0 means it is not in the catalogue — a Keeper gives it. */
  price: number | null;
  effect: string[];
};

export function factsOf(entryId: string): ThingFacts | null {
  const row = db
    .select({
      fields: schema.entries.fields,
      keeperMade: schema.entryTypes.keeperMade,
      oneOfAKind: schema.entryTypes.oneOfAKind,
    })
    .from(schema.entries)
    .innerJoin(schema.entryTypes, eq(schema.entryTypes.id, schema.entries.typeId))
    .where(eq(schema.entries.id, entryId))
    .get();
  if (!row) return null;
  const price = Number(row.fields?.[PRICE_FIELD_KEY]);
  return {
    plekken: plekKinds(row.fields?.[VOORWERP_FIELD_KEY]),
    keeperMade: Boolean(row.keeperMade),
    oneOfAKind: Boolean(row.oneOfAKind),
    price: Number.isFinite(price) && price > 0 ? Math.floor(price) : null,
    effect: effectLines(row.fields?.[EFFECT_FIELD_KEY]),
  };
}

/**
 * §80: one effect per line, and that is the whole parser.
 *
 * Deliberately not a structured field. The moment a `bonus: number` exists,
 * adding them up is a matter of time — and that is rule 78 over the line. Lines
 * of text can only ever be *shown*.
 */
export function effectLines(raw: unknown): string[] {
  if (typeof raw !== 'string') return [];
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 12);
}

/**
 * §83: "past dit artikel op een plek van deze soort?", als SQL.
 *
 * `plekKinds` is the reader everywhere else, and everywhere else the row is
 * already in hand. The plek-picker (`app/api/kamers/[id]/voorwerpen/route.ts`)
 * is the one place that has to ask it of a thousand rows it has not fetched, so
 * it asks the database — and that made it the reader that stayed behind when
 * the field became a list. `json_extract(…) = 'bureau'` does not find
 * `["bureau"]`, so the picker offered nothing at all while `placeItem` still
 * accepted everything. §17's rule 4, and no unit test saw it; the browser did,
 * in one run (§80).
 *
 * It lives here rather than in the route so that there is **one** place both
 * shapes are named, and so a test can ask it without a request. Both shapes:
 * an array, and a bare string for an archive that has not seen migration
 * `0029` — exactly what `plekKinds` accepts, said twice in two languages
 * because there is no third way to say it.
 */
export function plekMatches(kind: PlekKind) {
  const path = `$.${VOORWERP_FIELD_KEY}`;
  return sql`CASE json_type(${schema.entries.fields}, ${path})
               WHEN 'text' THEN json_extract(${schema.entries.fields}, ${path}) = ${kind}
               WHEN 'array' THEN EXISTS (
                 SELECT 1 FROM json_each(${schema.entries.fields}, ${path}) je
                  WHERE je.value = ${kind}
               )
               ELSE 0
             END`;
}

/** §83: which kinds of plek this artikel asks for. Empty means it fits in no kamer. */
export function plekKindsOf(entryId: string): PlekKind[] {
  const row = db
    .select({ fields: schema.entries.fields })
    .from(schema.entries)
    .where(eq(schema.entries.id, entryId))
    .get();
  return plekKinds(row?.fields?.[VOORWERP_FIELD_KEY]);
}

/**
 * §80/§83: is dit ding al neergezet? — en hoe ver die vraag reikt, is de zaak
 * van de *soort* en niet van de functie die hem stelt.
 *
 * A voorwerp is one thing in the world (`one_of_a_kind`), so the question is
 * asked of the whole archive: a lantaarn on somebody's plank is not also on
 * yours. Huisraad is a listing several people may own — and, since §83, that
 * one person may own twice. Nick, ronde 44: *"Je mag best vaker hetzelfde ding
 * in je kamer hebben staan."*
 *
 * So for anything that is not unique this asks **nothing at all**. §80 asked it
 * of this kamer alone ("two identical lamps on one grid is nobody's intention
 * either"), which turned out to be exactly Nick's intention. The reasoning was
 * ours, not his, and it is the kind of rule that is easier to add later than to
 * find once it is in.
 *
 * `placeItem` and `buyFurnishing` both call this, because they are two writers
 * of one sentence and §17's rule 4 is what happens when they drift apart.
 */
function requireNotPlaced(facts: ThingFacts, entryId: string, roomId: string) {
  if (!facts.oneOfAKind) return;
  const elsewhere = db
    .select({ roomId: schema.roomSlots.roomId })
    .from(schema.roomSlots)
    .where(eq(schema.roomSlots.entryId, entryId))
    .get();
  if (!elsewhere) return;
  throw new KamerError(
    elsewhere.roomId === roomId ? 'Dat ligt al ergens in deze kamer.' : 'Dat ligt al in een andere kamer.',
  );
}

/**
 * Put a voorwerp in a plek.
 *
 * Four refusals, and each is a thing somebody will try: a plek that is still
 * locked, an artikel that is not a voorwerp (or does not fit this kind of
 * plek), an artikel this person cannot see, and a **one-of-a-kind** thing that
 * is already lying somewhere. The last is the partial unique index's job as
 * well — the check here is for the message, the index is for the truth.
 *
 * §83 took one refusal away: a second copy of the same thing in the same kamer.
 * Nick, ronde 44: *"Je mag best vaker hetzelfde ding in je kamer hebben
 * staan."*
 */
export function placeItem(slotId: string, entryId: string, viewer: Viewer) {
  const slot = db
    .select({
      id: schema.roomSlots.id,
      roomId: schema.roomSlots.roomId,
      kind: schema.roomSlots.kind,
      unlockedAt: schema.roomSlots.unlockedAt,
    })
    .from(schema.roomSlots)
    .where(eq(schema.roomSlots.id, slotId))
    .get();
  if (!slot) throw new KamerError('Die plek bestaat niet.');
  requireArrange(slot.roomId, viewer);
  if (slot.unlockedAt === null) throw new KamerError('Die plek is nog op slot.');

  const entry = db
    .select({ id: schema.entries.id, name: schema.entries.name })
    .from(schema.entries)
    .where(and(eq(schema.entries.id, entryId), visibleEntryCondition(viewer)))
    .get();
  if (!entry) throw new KamerError('Dat artikel bestaat niet.');

  const facts = factsOf(entryId);
  if (!facts?.plekken.length) throw new KamerError('Dat hoort nergens in een kamer.');
  if (!facts.plekken.includes(slot.kind as PlekKind)) throw new KamerError('Dat hoort niet op deze plek.');

  requireNotPlaced(facts, entryId, slot.roomId);

  db.update(schema.roomSlots)
    .set({
      entryId,
      placedAt: Math.floor(Date.now() / 1000),
      // §80: the claim is the unique index's business, and it is only ever made
      // for a thing there is one of.
      claim: facts.oneOfAKind ? entryId : null,
    })
    .where(eq(schema.roomSlots.id, slotId))
    .run();
  logActivity({ actorId: viewer?.id ?? null, verb: 'room.placed', entryId, meta: { slotId } });
}

/**
 * Take something out again.
 *
 * **No refund.** A refund is a second economy and an argument about what things
 * are worth on the way back out; the munt was spent on *owning* it, and it
 * still does. Taking it off the shelf is free and means nothing.
 */
export function clearSlot(slotId: string, viewer: Viewer) {
  const slot = db
    .select({ id: schema.roomSlots.id, roomId: schema.roomSlots.roomId, entryId: schema.roomSlots.entryId })
    .from(schema.roomSlots)
    .where(eq(schema.roomSlots.id, slotId))
    .get();
  if (!slot) throw new KamerError('Die plek bestaat niet.');
  requireArrange(slot.roomId, viewer);
  if (!slot.entryId) return;
  db.update(schema.roomSlots)
    .set({ entryId: null, placedAt: null, claim: null })
    .where(eq(schema.roomSlots.id, slotId))
    .run();
  logActivity({ actorId: viewer?.id ?? null, verb: 'room.cleared', entryId: slot.entryId, meta: { slotId } });
}

/**
 * §80: kopen — de eerste schrijver van een grootboekregel die er al was.
 *
 * `room_ledger.kind = 'item'` en de kolom `entry_id` bestaan sinds §79 en niets
 * schreef ze ooit; dit is waar ze voor bedoeld waren.
 *
 * Dezelfde discipline als `unlockSlot`, en om dezelfde reden: het saldo wordt
 * *in* de transactie gelezen, en de voorwaarde dat de plek nog leeg is staat in
 * de UPDATE zelf. Twee klikken kopen één stoel.
 *
 * De Keeper heeft deze weg niet nodig — hij legt iets neer met `placeItem`, wat
 * niets kost en geen regel schrijft. Die twee wegen naast elkaar zijn het
 * verschil tussen *verdiend* en *gekocht*, en allebei horen te bestaan.
 */
export function buyFurnishing(slotId: string, entryId: string, viewer: Viewer): { spent: number } {
  const slot = db
    .select({
      id: schema.roomSlots.id,
      roomId: schema.roomSlots.roomId,
      kind: schema.roomSlots.kind,
      unlockedAt: schema.roomSlots.unlockedAt,
      entryId: schema.roomSlots.entryId,
    })
    .from(schema.roomSlots)
    .where(eq(schema.roomSlots.id, slotId))
    .get();
  if (!slot) throw new KamerError('Die plek bestaat niet.');
  requireArrange(slot.roomId, viewer);
  if (slot.unlockedAt === null) throw new KamerError('Die plek is nog op slot.');
  if (slot.entryId) throw new KamerError('Daar ligt al iets.');

  const entry = db
    .select({ id: schema.entries.id, name: schema.entries.name })
    .from(schema.entries)
    .where(and(eq(schema.entries.id, entryId), visibleEntryCondition(viewer)))
    .get();
  if (!entry) throw new KamerError('Dat bestaat niet.');

  const facts = factsOf(entryId);
  if (!facts?.plekken.length) throw new KamerError('Dat hoort nergens in een kamer.');
  if (!facts.plekken.includes(slot.kind as PlekKind)) throw new KamerError('Dat hoort niet op deze plek.');
  /*
   * §17's rule 4, in the place it is easiest to forget: **readers use the SQL
   * condition, writers use the boolean.**
   *
   * `catalogueFor` defines "te koop" as five things — keeper-made, priced,
   * fitting, visible, untaken — and this function is the writer for the same
   * sentence. It asked four of the five. Buying by id therefore let somebody
   * pay munten for a *voorwerp* with a price on it: found in play, one of a
   * kind, and precisely the thing §80 set out not to hijack. Both reviewers
   * found it independently, which is usually what a missing condition looks
   * like.
   */
  if (!facts.keeperMade) throw new KamerError('Dat staat niet te koop.');
  if (!facts.price) throw new KamerError('Dat staat niet te koop.');

  requireNotPlaced(facts, entryId, slot.roomId);

  const price = facts.price;
  return db.transaction((tx) => {
    const balance = Number(
      tx
        .select({ total: sql<number>`COALESCE(SUM(${schema.roomLedger.delta}), 0)` })
        .from(schema.roomLedger)
        .where(eq(schema.roomLedger.roomId, slot.roomId))
        .get()?.total ?? 0,
    );
    if (balance < price) throw new KamerError('Daar heb je nog niet genoeg voor.');
    const done = tx
      .update(schema.roomSlots)
      .set({
        entryId,
        placedAt: Math.floor(Date.now() / 1000),
        claim: facts.oneOfAKind ? entryId : null,
      })
      .where(and(eq(schema.roomSlots.id, slotId), sql`${schema.roomSlots.entryId} IS NULL`))
      .run();
    if (done.changes === 0) throw new KamerError('Daar ligt al iets.');
    tx.insert(schema.roomLedger)
      .values({
        id: newId(),
        roomId: slot.roomId,
        delta: -price,
        kind: 'item',
        reason: entry.name,
        actorId: viewer?.id ?? null,
        slotId,
        entryId,
      })
      .run();
    return { spent: price };
  });
}

/**
 * The Keeper writes a line.
 *
 * The only road in for a positive number, and the only road at all for a
 * correction. A negative grant is allowed — a theft at the table, a mistake put
 * right — but the balance may never go below zero, because a debt is a rule
 * about play and this file does not make rules about play.
 */
export function grant(roomId: string, delta: number, reason: string, viewer: Viewer) {
  if (!viewer?.isKeeper) throw new KamerError('Alleen de Keeper geeft uit.');
  if (!Number.isInteger(delta) || delta === 0) throw new KamerError('Een bedrag is een heel getal.');
  const room = db.select({ id: schema.rooms.id }).from(schema.rooms).where(eq(schema.rooms.id, roomId)).get();
  if (!room) throw new KamerError('Die kamer bestaat niet.');

  db.transaction((tx) => {
    const balance = Number(
      tx
        .select({ total: sql<number>`COALESCE(SUM(${schema.roomLedger.delta}), 0)` })
        .from(schema.roomLedger)
        .where(eq(schema.roomLedger.roomId, roomId))
        .get()?.total ?? 0,
    );
    if (balance + delta < 0) throw new KamerError('Dat zou onder nul komen.');
    tx.insert(schema.roomLedger)
      .values({
        id: newId(),
        roomId,
        delta,
        kind: 'grant',
        reason: reason.trim().slice(0, 200),
        actorId: viewer?.id ?? null,
      })
      .run();
  });
  logActivity({ actorId: viewer?.id ?? null, verb: 'room.granted', meta: { roomId, delta } });
}

/** §83: one line of an uitdeling — a kamer and what it gets. */
export type HandOutRow = { roomId: string; delta: number };

/** §83: every kamer an uitdeling can reach, with whose it is and what is in it. */
export type HandOutTarget = {
  roomId: string;
  /** The onderzoeker the kamer belongs to. */
  name: string;
  slug: string;
  /**
   * Who wears them, or **null when nobody does**.
   *
   * §83 wrote here: *"blank when nobody does, and then there is no kamer to
   * reach"*. Sinds §86 is die tweede helft niet meer waar — de Keeper kan een
   * kamer openen voor een onderzoeker die aan geen enkel account hangt, en die
   * staat gewoon in deze lijst. Een comment die het halve antwoord goed heeft
   * is precies wat §83 zelf als les opschreef.
   */
  player: string | null;
  /**
   * §86: draagt de speler deze onderzoeker *op dit moment*?
   *
   * Nick, ronde 47: *"right now you can only give to a character that is
   * currently being used"* — en dat was niet waar, de lijst had de niet-actieve
   * karakters altijd al. Maar niets op het scherm zei dat, dus er was geen
   * manier om te zien dat je gelijk had. Nu staat het er.
   */
  active: boolean;
  balance: number;
};

/**
 * §83: aan wie er uitgedeeld kan worden.
 *
 * Nick, ronde 44: *"dat ze dan gewoon de namen van de **spelers** invullen"* —
 * and this is the one place his sentence and the archive disagree, so it is
 * answered out loud rather than quietly.
 *
 * **A purse belongs to an onderzoeker, not to a player** (§79: the kamer hangs
 * off the karakter's artikel). Somebody wearing two has two kamers and two
 * balances, and a screen that listed *people* would have to pick one of them
 * for him — silently, and wrongly half the time. So the list is of kamers, and
 * each row reads "Onderzoeker (speler)": the name Nick is looking for is right
 * there, and the thing that actually holds munten is what gets ticked.
 *
 * Keeper-only, because the screen it feeds is.
 */
export function handOutTargets(viewer: Viewer): HandOutTarget[] {
  if (!viewer?.isKeeper) return [];

  /*
   * **Twee bronnen, en de volgorde is de reden dat het er twee zijn.**
   *
   * De eerste is elk karakter dat een account *houdt* — niet het karakter dat
   * het nú speelt, dat onderscheid heeft deze lijst nooit gemaakt. Die pas
   * roept `getOrCreateRoom` aan, want dat is waar een gewone kamer ontstaat:
   * hij bestaat pas als iemand hem nodig heeft.
   *
   * De tweede is §86's kamer zonder drager — door de Keeper geopend voor een
   * onderzoeker die aan niemand hangt. Die staat wél al in `rooms` (openen ís
   * de handeling), dus die wordt gelezen en niet gemaakt. Andersom zou het
   * fout zijn: uit `rooms` lezen als enige bron zou een speler die zijn kamer
   * nog nooit geopend heeft uit de lijst laten vallen.
   */
  const held = db
    .select({
      entryId: schema.userCharacters.entryId,
      name: schema.entries.name,
      slug: schema.entries.slug,
      player: schema.users.username,
      activeId: schema.users.activeCharacterId,
    })
    .from(schema.userCharacters)
    .innerJoin(schema.entries, eq(schema.entries.id, schema.userCharacters.entryId))
    .innerJoin(schema.users, eq(schema.users.id, schema.userCharacters.userId))
    .where(and(eq(schema.users.isDisabled, false), visibleEntryCondition(viewer)))
    .orderBy(asc(schema.entries.name))
    .all();

  const out: HandOutTarget[] = [];
  const seen = new Set<string>();
  for (const row of held) {
    const roomId = getOrCreateRoom(row.entryId);
    if (!roomId || seen.has(roomId)) continue;
    seen.add(roomId);
    out.push({
      roomId,
      name: row.name,
      slug: row.slug,
      player: row.player,
      active: row.activeId === row.entryId,
      balance: balanceOf(roomId),
    });
  }

  // §86: en de kamers die de Keeper met de hand geopend heeft. `visibleEntry-
  // Condition` staat er ook hier voor: een Keeper ziet alles, maar de regel
  // hoort bij de lezing en niet bij de rol (§46).
  const opened = db
    .select({
      roomId: schema.rooms.id,
      entryId: schema.rooms.entryId,
      name: schema.entries.name,
      slug: schema.entries.slug,
    })
    .from(schema.rooms)
    .innerJoin(schema.entries, eq(schema.entries.id, schema.rooms.entryId))
    .where(and(isNull(schema.entries.deletedAt), visibleEntryCondition(viewer)))
    .orderBy(asc(schema.entries.name))
    .all();

  for (const row of opened) {
    if (seen.has(row.roomId)) continue;
    seen.add(row.roomId);
    out.push({
      roomId: row.roomId,
      name: row.name,
      slug: row.slug,
      player: null,
      active: false,
      balance: balanceOf(row.roomId),
    });
  }

  // Op naam, over allebei de bronnen heen: met zestig rijen is de volgorde van
  // de zoekactie belangrijker dan de vraag hoe een kamer ontstaan is.
  return out.sort((a, b) => a.name.localeCompare(b.name, 'nl'));
}

/**
 * §83: de uitdeling — één reden, één knop, één transactie.
 *
 * Nick, ronde 44: *"Er moet een makkelijke 'mass coin distribution' komen voor
 * keepers… en dan iedereen x aantal munten geeft omdat ze samen wat gedaan
 * hebben."*
 *
 * Three decisions are in here rather than on the screen, and each of them is
 * the sort that has to be true everywhere or nowhere.
 *
 * **It is a handful of ordinary grants.** No new `kind`, no second table, no
 * row that says "this was part of an uitdeling". A player looking at their
 * grootboek sees a line with the Keeper's reason on it, which is exactly what
 * happened; and the balance stays the sum of the grootboek (§79's rule 1)
 * without anything new having to be taught that.
 *
 * **Alles of niets.** If one kamer would drop below zero the whole thing
 * refuses and names it. A half-finished uitdeling is worse than a refusal:
 * the Keeper cannot see from the screen who got theirs, so the only safe repair
 * would be to check eight grootboeken by hand.
 *
 * **Zero is a full answer.** A row of 0 — and a row left out by its tick — both
 * write nothing. Those are the two ways a person says "not this one", and if
 * they disagreed one of them would be a trap.
 *
 * The floor at zero, "een bedrag is een heel getal" and Keeper-only are the
 * same rules `grant` keeps, and they are asked here rather than by calling
 * `grant` in a loop: `grant` opens a transaction of its own, so a loop over it
 * is precisely the half-applied uitdeling this refuses to be.
 */
export function handOut(rows: HandOutRow[], reason: string, viewer: Viewer): { rooms: number; total: number } {
  if (!viewer?.isKeeper) throw new KamerError('Alleen de Keeper geeft uit.');

  const giving: HandOutRow[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    if (!Number.isInteger(row.delta)) throw new KamerError('Een bedrag is een heel getal.');
    if (seen.has(row.roomId)) throw new KamerError('Die kamer staat er twee keer in.');
    seen.add(row.roomId);
    if (row.delta === 0) continue;
    giving.push(row);
  }
  if (giving.length === 0) throw new KamerError('Er staat niemand aan.');

  const why = reason.trim().slice(0, 200);
  const now = Math.floor(Date.now() / 1000);

  return db.transaction((tx) => {
    let total = 0;
    for (const row of giving) {
      const room = tx
        .select({ id: schema.rooms.id, entryId: schema.rooms.entryId })
        .from(schema.rooms)
        .where(eq(schema.rooms.id, row.roomId))
        .get();
      if (!room) throw new KamerError('Die kamer bestaat niet.');
      const balance = Number(
        tx
          .select({ total: sql<number>`COALESCE(SUM(${schema.roomLedger.delta}), 0)` })
          .from(schema.roomLedger)
          .where(eq(schema.roomLedger.roomId, row.roomId))
          .get()?.total ?? 0,
      );
      if (balance + row.delta < 0) {
        const name = tx
          .select({ name: schema.entries.name })
          .from(schema.entries)
          .where(eq(schema.entries.id, room.entryId))
          .get()?.name;
        throw new KamerError(`Dat zou ${name ?? 'iemand'} onder nul brengen.`);
      }
      tx.insert(schema.roomLedger)
        .values({
          id: newId(),
          roomId: row.roomId,
          delta: row.delta,
          kind: 'grant',
          reason: why,
          actorId: viewer.id,
          createdAt: now,
        })
        .run();
      total += row.delta;
    }
    logActivity({
      actorId: viewer.id,
      verb: 'room.granted',
      meta: { rooms: giving.length, total },
    });
    return { rooms: giving.length, total };
  });
}

/** §77: what the spelerspagina's panel shows — the smallest true thing, and a door. */
export function roomSummary(
  entryId: string,
  viewer: Viewer,
  // `open` is how many plekken stand open, not how many exist, and `total` is
  // how many there are at all — §85's panel says "3 van 12 plekken open · 1
  // gevuld", so it needs both halves of that distinction rather than one.
): { href: string; balance: number; filled: number; open: number; total: number } | null {
  const roomId = getOrCreateRoom(entryId);
  if (!roomId || !canSeeRoom(roomId, viewer)) return null;
  const entry = db.select({ slug: schema.entries.slug }).from(schema.entries).where(eq(schema.entries.id, entryId)).get();
  if (!entry) return null;
  const slots = db
    .select({ entryId: schema.roomSlots.entryId, unlockedAt: schema.roomSlots.unlockedAt })
    .from(schema.roomSlots)
    .where(eq(schema.roomSlots.roomId, roomId))
    .all();
  return {
    href: `/kamer/${entry.slug}`,
    balance: balanceOf(roomId),
    filled: slots.filter((slot) => slot.entryId).length,
    open: slots.filter((slot) => slot.unlockedAt !== null).length,
    total: slots.length,
  };
}
