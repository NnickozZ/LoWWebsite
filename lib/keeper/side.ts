import { and, eq, isNull, sql, type SQL } from 'drizzle-orm';
import { viewableCondition } from '@/lib/access';
import { db, schema } from '@/lib/db';
import { visibleCaseCondition } from '@/lib/cases/visibility';
import { logAudit } from '@/lib/entries/service';
import { visibleEntryCondition, type Viewer } from '@/lib/entries/visibility';
import { visibleMapCondition } from '@/lib/maps/visibility';
import { kindHref, sideOf, type KeeperKind, type KeeperRef, type Side } from './kinds';

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
  writeSide(kind, id, on);
  logAudit({
    actorId: keeperId,
    action: on ? 'keeper.side_taken' : 'keeper.side_given',
    targetType: kind,
    targetId: id,
  });
  // §48: taking a dossier to the Keeper's side takes what hangs in it along.
  // Only this direction: giving one back never reveals a wall by itself.
  if (kind === 'case' && on) hideWhatHangsIn(id, keeperId);
}

/** The write itself, in the two spellings §44 knows. Nothing else may say them. */
function writeSide(kind: KeeperKind, id: string, on: boolean) {
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
}

/* ------------------------------------------------- §48: born on a side */

/**
 * §48: a new thing is born on the side it was made on.
 *
 * Until round 25 every record was born on the players' side, whatever face the
 * archive was wearing when the button was pressed: `keeper_only` defaults to 0
 * and an artikel's `visibility` to 'all', and only the switch on the finished
 * page ever changed them. So a Keeper standing on their own side, in their own
 * dossier, made a prikbord the whole table could read — and nothing on the
 * screen said so. That is the leak this closes.
 *
 * Two facts decide it, and the hiding one always wins:
 *
 *   1. **the container.** Something made inside a Keeper-only dossier is the
 *      Keeper's, full stop — a wall filed there carries that dossier's *name*
 *      in every list that shows it, so a player-side wall in a Keeper-side
 *      dossier is a leak by itself.
 *   2. **the side the browser stands on** (§46), for everything with no
 *      container to ask.
 *
 * A Keeper may still say otherwise for (2) — the switch in the sheet that made
 * it — but never for (1). Nobody who is not a Keeper is ever given a side:
 * `viewer.side` is already forced to 'player' for them by `getSessionUser`, and
 * this asks `isKeeper` again rather than trusting that twice.
 */
export function bornSide(viewer: Viewer, inside?: { kind: KeeperKind; id: string } | null): Side {
  if (!viewer?.isKeeper) return 'player';
  if (inside && isKeeperSide(inside.kind, inside.id)) return 'keeper';
  return viewer.side === 'keeper' ? 'keeper' : 'player';
}

/**
 * §48: the side a thing being made now lands on — the wish of the hand that is
 * making it, where there is room for a wish. The container's answer is not a
 * wish, it is the rule (see `bornSide`).
 */
export function keeperOnlyForNew(
  viewer: Viewer,
  inside?: { kind: KeeperKind; id: string } | null,
  wish?: boolean,
): boolean {
  if (!viewer?.isKeeper) return false;
  if (inside && isKeeperSide(inside.kind, inside.id)) return true;
  if (typeof wish === 'boolean') return wish;
  return viewer.side === 'keeper';
}

/**
 * §48: put a record that has just been made on the Keeper's side, if that is
 * where it was born. Separate from `setKeeperSide` because this is not a move
 * — nothing was ever on the other side — so it is audited as a birth and can
 * never be the one write that *reveals* something.
 */
export function placeNewOnSide(
  kind: KeeperKind,
  id: string,
  keeperOnly: boolean,
  keeperId: string | null,
): void {
  if (!keeperOnly) return;
  writeSide(kind, id, true);
  logAudit({ actorId: keeperId, action: 'keeper.born_keeper', targetType: kind, targetId: id });
}

/**
 * §48: everything hanging in a dossier that has just gone to the Keeper's side
 * goes with it. Prikborden and tijdlijnen only: those two carry the dossier's
 * name into lists that a player reads, and both already know how to be
 * Keeper-only. Artikelen are not moved — an artikel is filed in several
 * dossiers at once, and §9's dial on it is its own.
 */
function hideWhatHangsIn(caseId: string, keeperId: string) {
  for (const row of db
    .select({ id: schema.boards.id })
    .from(schema.boards)
    .where(and(eq(schema.boards.caseId, caseId), eq(schema.boards.keeperOnly, false)))
    .all()) {
    writeSide('board', row.id, true);
    logAudit({ actorId: keeperId, action: 'keeper.side_taken', targetType: 'board', targetId: row.id });
  }
  for (const row of db
    .select({ id: schema.timelines.id })
    .from(schema.timelines)
    .where(and(eq(schema.timelines.caseId, caseId), eq(schema.timelines.keeperOnly, false)))
    .all()) {
    writeSide('timeline', row.id, true);
    logAudit({ actorId: keeperId, action: 'keeper.side_taken', targetType: 'timeline', targetId: row.id });
  }
}

/* ------------------------------------------- §50: the two sides, closed off */

/**
 * §50: the page you land on decides where you stand.
 *
 * §46 said the palette follows the page and told the *cookie* to catch up
 * afterwards, from the browser (`SideSync`). That worked and looked wrong: the
 * shell re-rendered a beat after the page, so for one frame the masthead, the
 * toggle and the colours belonged to the side you had just left. Worse, the
 * browser then stood on one side while every picker, suggestion and list on
 * screen had been built for the other — which is where the "gekke UI bugs"
 * came from.
 *
 * So the catching-up moves to the server and happens *before* anything is
 * drawn: a Keeper whose cookie disagrees with the record they have opened is
 * redirected through `/api/keeper/flip`, the one writer of that cookie, and
 * comes back to this very address with the whole site already turned over.
 *
 * Both directions, by design: a Keeper artikel takes you to the Keeperkant and
 * a player-facing one takes you back. Only a Keeper is ever moved — a player's
 * side is forced to 'player' by `getSessionUser` and every record they can
 * reach is player-facing, so the answer for them is always null.
 *
 * It cannot loop: the flip writes the cookie to exactly the side this record is
 * on, so the render after the redirect asks the same question and gets null.
 */
export function sideDetour(viewer: Viewer, recordKeeperOnly: boolean, here: string): string | null {
  if (!viewer?.isKeeper) return null;
  const standing: Side = viewer.side ?? 'player';
  const record = sideOf(recordKeeperOnly);
  if (standing === record) return null;
  return `/api/keeper/flip?side=${record}&to=${encodeURIComponent(here)}&gewisseld=1`;
}

/**
 * §50: a page's own query string back as `?a=b`, or '' when there is none.
 *
 * The detour goes out through a redirect and comes back to the same address, so
 * whatever the address carried has to survive the round trip — `?new=1` puts an
 * artikel on its editing face and `?rev=` is which version you are reading.
 * `gewisseld` is dropped: the flip puts its own back on.
 */
export function queryTail(query: Record<string, string | string[] | undefined>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (key === 'gewisseld' || value == null) continue;
    for (const one of Array.isArray(value) ? value : [value]) params.append(key, one);
  }
  const text = params.toString();
  return text ? `?${text}` : '';
}

/** §50: what the server says when a reference would cross the border. */
export const OTHER_SIDE = 'Dat staat aan de andere kant van het archief.';

/**
 * §50: refuse the write, not only the offer.
 *
 * The pickers stopped offering the other side this round, but a picker is a
 * courtesy — the rule belongs here, on the road every attachment takes. Two
 * records may only be tied to one another (an artikel filed in a dossier, a
 * card on a wall, a speld on a landkaart, a gebeurtenis on a tijdlijn) when
 * they stand on the same side of the archive.
 *
 * The one deliberate exception is the §44 bridge — touwtjes and tweelingen —
 * which exists precisely to cross this border, and which never comes through
 * here.
 *
 * Built on `isKeeperSide`, so the two spellings of "the Keeper's own" stay
 * written down in exactly one place (§44). A record that is not there answers
 * `false` for both, which reads as "same side": the caller has already looked
 * it up and will fail on its own ground, and this must not turn a 404 into a
 * confusing 400.
 */
export function sameSide(a: KeeperKind, aId: string, b: KeeperKind, bId: string): boolean {
  return isKeeperSide(a, aId) === isKeeperSide(b, bId);
}
