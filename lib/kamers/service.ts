import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { canView, grantFor, loadAccessRow, viewerCanEdit } from '@/lib/access';
import { db, schema } from '@/lib/db';
import { visibleEntryCondition, type Viewer } from '@/lib/entries/visibility';
import { logActivity } from '@/lib/entries/service';
import { newId } from '@/lib/ids';
import type { CoverCrops } from '@/lib/images/shapes';
import { isPlekKind, ROOM_SHAPE, VOORWERP_FIELD_KEY, type PlekKind } from './shape';

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
  balance: number;
  slots: SlotView[];
  /** This viewer may unlock, place and clear. */
  canArrange: boolean;
  /** This viewer may write a grootboek line. Keeper only. */
  canGrant: boolean;
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
  if (!owner) return null;
  const existing = db
    .select({ id: schema.rooms.id, createdBy: schema.rooms.createdBy })
    .from(schema.rooms)
    .where(eq(schema.rooms.entryId, entryId))
    .get();
  const id = existing?.id ?? newId();
  if (!existing) {
    db.insert(schema.rooms).values({ id, entryId, createdBy: owner }).onConflictDoNothing().run();
  } else if (existing.createdBy !== owner) {
    // The karakter changed hands. `created_by` is not what decides who may
    // arrange (see `canArrangeRoom`), but leaving it pointing at the previous
    // wearer would leave a second, wrong answer lying about for the next
    // person to read.
    db.update(schema.rooms).set({ createdBy: owner }).where(eq(schema.rooms.id, existing.id)).run();
  }
  const settled =
    db.select({ id: schema.rooms.id }).from(schema.rooms).where(eq(schema.rooms.entryId, entryId)).get()?.id ?? id;
  syncShape(settled);
  return settled;
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
};

export function ledgerOf(roomId: string, limit = 50): LedgerLine[] {
  return db
    .select({
      id: schema.roomLedger.id,
      delta: schema.roomLedger.delta,
      kind: schema.roomLedger.kind,
      reason: schema.roomLedger.reason,
      createdAt: schema.roomLedger.createdAt,
    })
    .from(schema.roomLedger)
    .where(eq(schema.roomLedger.roomId, roomId))
    // Several lines can share a second (a grant and the spend it paid for);
    // `rowid` is the only tiebreak that is always in writing order.
    .orderBy(sql`${schema.roomLedger.createdAt} DESC, ${schema.roomLedger.id} DESC`)
    .limit(limit)
    .all();
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

  return {
    id: roomId,
    character: entry,
    ownerId: ownerOf(entry.id),
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
  };
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

/** What kind of plek this artikel asks for, or null when it is not a voorwerp at all. */
export function plekKindOf(entryId: string): PlekKind | null {
  const row = db
    .select({ fields: schema.entries.fields })
    .from(schema.entries)
    .where(eq(schema.entries.id, entryId))
    .get();
  const asked = row?.fields?.[VOORWERP_FIELD_KEY];
  return isPlekKind(asked) ? asked : null;
}

/**
 * Put a voorwerp in a plek.
 *
 * Four refusals, and each is a thing somebody will try: a plek that is still
 * locked, an artikel that is not a voorwerp (or asks for a different kind of
 * plek), an artikel this person cannot see, and one that is already lying
 * somewhere else in this same kamer. The last is the partial unique index's
 * job as well — the check here is for the message, the index is for the truth.
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

  const wants = plekKindOf(entryId);
  if (!wants) throw new KamerError('Dat is geen voorwerp.');
  if (wants !== slot.kind) throw new KamerError('Dat hoort niet op deze plek.');

  /*
   * Already lying somewhere — in this kamer or in anybody's. One voorwerp, one
   * plek, in the whole archive: a lantaarn is one thing in the world. The
   * partial unique index says the same thing; this check is for the sentence.
   */
  const elsewhere = db
    .select({ roomId: schema.roomSlots.roomId })
    .from(schema.roomSlots)
    .where(eq(schema.roomSlots.entryId, entryId))
    .get();
  if (elsewhere) {
    throw new KamerError(
      elsewhere.roomId === slot.roomId ? 'Dat ligt al ergens in deze kamer.' : 'Dat ligt al in een andere kamer.',
    );
  }

  db.update(schema.roomSlots)
    .set({ entryId, placedAt: Math.floor(Date.now() / 1000) })
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
  db.update(schema.roomSlots).set({ entryId: null, placedAt: null }).where(eq(schema.roomSlots.id, slotId)).run();
  logActivity({ actorId: viewer?.id ?? null, verb: 'room.cleared', entryId: slot.entryId, meta: { slotId } });
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

/** §77: what the spelerspagina's panel shows — the smallest true thing, and a door. */
export function roomSummary(
  entryId: string,
  viewer: Viewer,
  // `open` is how many plekken stand open, not how many exist — the panel says
  // "1 van 4 plekken gevuld", and a locked plek is not one of the four.
): { href: string; balance: number; filled: number; open: number } | null {
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
  };
}
