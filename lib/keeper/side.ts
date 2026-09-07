import { and, eq, isNull, sql, type SQL } from 'drizzle-orm';
import { viewableCondition } from '@/lib/access';
import { db, schema } from '@/lib/db';
import { visibleCaseCondition } from '@/lib/cases/visibility';
import { logAudit } from '@/lib/entries/service';
import { visibleEntryCondition, type Viewer } from '@/lib/entries/visibility';
import { visibleMapCondition } from '@/lib/maps/visibility';
import { kindHref, type KeeperKind, type KeeperRef, type Side } from './kinds';

/**
 * §44: which things are the Keeper's own, and how anything is read at all.
 *
 * One rule, said once, for five kinds. `keeperRef()` is the only way anything
 * in the Keeperkant learns that a record exists, and it asks that record's own
 * visibility rule every time — `visibleEntryCondition` for an artikel (§9),
 * `visibleCaseCondition` / `visibleMapCondition` / `viewableCondition` for the
 * other four, which since 0021 carry the `keeper_only` flag inside them (§17,
 * §44). A tie, a switch button and the Keeperkant list therefore cannot leak:
 * they are all built out of refs, and a ref is null for anyone who may not
 * look.
 *
 * Two spellings of one idea, on purpose:
 *   an artikel  is the Keeper's when `visibility = 'keeper'` (§9, Phase 3)
 *   the rest    are the Keeper's when `keeper_only = 1`      (§44, round 22)
 * `isKeeperSide()` is the only place that difference is written down. Nothing
 * else in the app may ask a record which of the two it uses.
 */

const KIND_CONDITION: Record<KeeperKind, (viewer: Viewer) => SQL> = {
  entry: (viewer) => visibleEntryCondition(viewer),
  case: (viewer) => visibleCaseCondition(viewer),
  board: (viewer) =>
    and(isNull(schema.boards.deletedAt), viewableCondition('board', viewer)) as SQL,
  map: (viewer) => visibleMapCondition(viewer),
  timeline: (viewer) =>
    and(isNull(schema.timelines.deletedAt), viewableCondition('timeline', viewer)) as SQL,
};

/**
 * §46: "only this side", as a WHERE fragment, for a *list*.
 *
 * The archive is read from one side at a time: on the Keeper's side every
 * list shows only the Keeper's own things, on the players' side only what the
 * table can see. This is that filter, in the same two spellings `isKeeperSide`
 * knows — `visibility` for an artikel, `keeper_only` for the rest. It is
 * AND-ed *after* the visibility rule, never instead of it: a player's side is
 * still gated by §9 and §17, this only keeps the Keeper's side out of the
 * Keeper's own player-side lists.
 *
 * A viewer with no side (a test, an API that patches a record, a room's gate)
 * gets `1 = 1`: both sides. So does a player, whatever their cookie says —
 * `getSessionUser` has already made their side 'player', and a player-side
 * filter on a player changes nothing, because the visibility rule already
 * removed the Keeper's side for them.
 *
 * Lists only. A record's own page never applies this: a Keeper walks across
 * from either side and the page decides where they are (`KeeperSideMark`).
 */
export function sideCondition(kind: KeeperKind, viewer: Viewer): SQL {
  const side: Side | undefined = viewer?.side;
  if (!side || !viewer?.isKeeper) return sql`1 = 1`;
  const keeper = side === 'keeper';
  switch (kind) {
    case 'entry':
      return keeper ? sql`${schema.entries.visibility} = 'keeper'` : sql`${schema.entries.visibility} <> 'keeper'`;
    case 'case':
      return sql`${schema.cases.keeperOnly} = ${keeper ? 1 : 0}`;
    case 'board':
      return sql`${schema.boards.keeperOnly} = ${keeper ? 1 : 0}`;
    case 'map':
      return sql`${schema.maps.keeperOnly} = ${keeper ? 1 : 0}`;
    case 'timeline':
      return sql`${schema.timelines.keeperOnly} = ${keeper ? 1 : 0}`;
  }
}

/** The same rule as a plain predicate, for rows already in memory. */
export function onSide(keeperOnly: boolean, viewer: Viewer): boolean {
  if (!viewer?.side || !viewer.isKeeper) return true;
  return keeperOnly === (viewer.side === 'keeper');
}

/** The one read. Null means "not there, or not for you" — the caller may not tell them apart. */
export function keeperRef(kind: KeeperKind, id: string, viewer: Viewer): KeeperRef | null {
  const where = KIND_CONDITION[kind](viewer);
  switch (kind) {
    case 'entry': {
      const row = db
        .select({
          id: schema.entries.id,
          name: schema.entries.name,
          slug: schema.entries.slug,
          visibility: schema.entries.visibility,
        })
        .from(schema.entries)
        .where(and(eq(schema.entries.id, id), where))
        .get();
      return row ? ref(kind, row.id, row.name, row.slug, row.visibility === 'keeper') : null;
    }
    case 'case': {
      const row = db
        .select({
          id: schema.cases.id,
          name: schema.cases.name,
          slug: schema.cases.slug,
          keeperOnly: schema.cases.keeperOnly,
        })
        .from(schema.cases)
        .where(and(eq(schema.cases.id, id), where))
        .get();
      return row ? ref(kind, row.id, row.name, row.slug, row.keeperOnly) : null;
    }
    case 'board': {
      const row = db
        .select({
          id: schema.boards.id,
          name: schema.boards.name,
          keeperOnly: schema.boards.keeperOnly,
        })
        .from(schema.boards)
        .where(and(eq(schema.boards.id, id), where))
        .get();
      return row ? ref(kind, row.id, row.name, null, row.keeperOnly) : null;
    }
    case 'map': {
      const row = db
        .select({
          id: schema.maps.id,
          name: schema.maps.name,
          slug: schema.maps.slug,
          keeperOnly: schema.maps.keeperOnly,
        })
        .from(schema.maps)
        .where(and(eq(schema.maps.id, id), where))
        .get();
      return row ? ref(kind, row.id, row.name, row.slug, row.keeperOnly) : null;
    }
    case 'timeline': {
      const row = db
        .select({
          id: schema.timelines.id,
          name: schema.timelines.name,
          slug: schema.timelines.slug,
          keeperOnly: schema.timelines.keeperOnly,
        })
        .from(schema.timelines)
        .where(and(eq(schema.timelines.id, id), where))
        .get();
      return row ? ref(kind, row.id, row.name, row.slug, row.keeperOnly) : null;
    }
  }
}

function ref(
  kind: KeeperKind,
  id: string,
  name: string,
  slug: string | null,
  keeperOnly: boolean,
): KeeperRef {
  return { kind, id, name, slug, href: kindHref(kind, { id, slug }), keeperOnly };
}

/** Is this record the Keeper's own side? Asked without a viewer, so Keeper-only code. */
export function isKeeperSide(kind: KeeperKind, id: string): boolean {
  switch (kind) {
    case 'entry':
      return (
        db
          .select({ visibility: schema.entries.visibility })
          .from(schema.entries)
          .where(eq(schema.entries.id, id))
          .get()?.visibility === 'keeper'
      );
    case 'case':
      return Boolean(
        db.select({ k: schema.cases.keeperOnly }).from(schema.cases).where(eq(schema.cases.id, id)).get()?.k,
      );
    case 'board':
      return Boolean(
        db.select({ k: schema.boards.keeperOnly }).from(schema.boards).where(eq(schema.boards.id, id)).get()?.k,
      );
    case 'map':
      return Boolean(
        db.select({ k: schema.maps.keeperOnly }).from(schema.maps).where(eq(schema.maps.id, id)).get()?.k,
      );
    case 'timeline':
      return Boolean(
        db
          .select({ k: schema.timelines.keeperOnly })
          .from(schema.timelines)
          .where(eq(schema.timelines.id, id))
          .get()?.k,
      );
  }
}

/**
 * Move a thing to the Keeper's side, or hand it to the table. Keeper-only —
 * every caller has already been through `requireKeeper`.
 *
 * Giving a thing to the players is the one move that can *reveal* something,
 * so it is audited with both states, and it is deliberately not something a
 * tie or a twin does on its own: only a person pressing the button.
 */
export function setKeeperSide(kind: KeeperKind, id: string, on: boolean, keeperId: string) {
  const before = isKeeperSide(kind, id);
  if (before === on) return;
  switch (kind) {
    case 'entry':
      db.update(schema.entries)
        .set({ visibility: on ? 'keeper' : 'all' })
        .where(eq(schema.entries.id, id))
        .run();
      break;
    case 'case':
      db.update(schema.cases).set({ keeperOnly: on }).where(eq(schema.cases.id, id)).run();
      break;
    case 'board':
      db.update(schema.boards).set({ keeperOnly: on }).where(eq(schema.boards.id, id)).run();
      break;
    case 'map':
      db.update(schema.maps).set({ keeperOnly: on }).where(eq(schema.maps.id, id)).run();
      break;
    case 'timeline':
      db.update(schema.timelines).set({ keeperOnly: on }).where(eq(schema.timelines.id, id)).run();
      break;
  }
  logAudit({
    actorId: keeperId,
    action: on ? 'keeper.side_taken' : 'keeper.side_given',
    targetType: kind,
    targetId: id,
  });
}
