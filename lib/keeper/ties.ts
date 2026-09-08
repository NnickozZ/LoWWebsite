import { and, eq, or } from 'drizzle-orm';
import { db, schema } from '@/lib/db';
import { createBoard } from '@/lib/boards/service';
import { createCase } from '@/lib/cases/service';
import { createEntry, logAudit } from '@/lib/entries/service';
import type { Viewer } from '@/lib/entries/visibility';
import { newId } from '@/lib/ids';
import { createMap } from '@/lib/maps/service';
import { createTimeline } from '@/lib/timelines/service';
import { isKeeperKind, type KeeperKind, type KeeperRef } from './kinds';
import { mergeNotesIntoTwin, moveNotesToTwin } from './notes';
import { isKeeperSide, keeperRef, setKeeperSide } from './side';

/**
 * §44: the ties between the Keeper's side and the players' side.
 *
 * A **twin** is the pair: one Keeper page that is the other face of exactly
 * one player-facing thing. It is made with one button, it shares that thing's
 * Keeper notes, and the switch on either page goes straight to the other. At
 * most one per side, and the database says so (two partial unique indexes in
 * migration 0021) rather than this file promising it.
 *
 * A **rope** is every other tie: the Keeper's page about a conspiracy, roped
 * to the five artikelen, the dossier and the landkaart it touches. Any number,
 * in both directions, across kinds.
 *
 * Nothing here hands out a name it has not first asked the visibility rule
 * for: every end of every tie is read through `keeperRef`, which is null for a
 * viewer who may not see it. A tie can therefore never be the thing that
 * reveals a page — a rope to something you may not open simply is not in the
 * list you are given.
 */

export type Tie = {
  id: string;
  isTwin: boolean;
  /** The other end, as this viewer may see it. */
  other: KeeperRef;
};

export type Ties = {
  /** The other face of this exact thing, if it has one. */
  twin: Tie | null;
  /** Every other tie, nearest kind first. */
  ropes: Tie[];
};

const EMPTY: Ties = { twin: null, ropes: [] };

/**
 * Every tie this record has, from either end, as this viewer may see them.
 *
 * Keeper-only in practice — the pages only ask when `isKeeper` — but the
 * viewer is taken and used rather than assumed, because a rule that is only
 * true because of where it is called from is the kind that stops being true.
 */
export function tiesFor(kind: KeeperKind, id: string, viewer: Viewer): Ties {
  if (!viewer?.isKeeper) return EMPTY;
  const rows = db
    .select()
    .from(schema.counterparts)
    .where(
      or(
        and(eq(schema.counterparts.keeperKind, kind), eq(schema.counterparts.keeperId, id)),
        and(eq(schema.counterparts.playerKind, kind), eq(schema.counterparts.playerId, id)),
      ),
    )
    .all();
  if (!rows.length) return EMPTY;

  const ties: Tie[] = [];
  for (const row of rows) {
    const mine = row.keeperKind === kind && row.keeperId === id;
    const otherKind = mine ? row.playerKind : row.keeperKind;
    const otherId = mine ? row.playerId : row.keeperId;
    if (!isKeeperKind(otherKind)) continue;
    const other = keeperRef(otherKind, otherId, viewer);
    // Gone into the bin, or not for this viewer. Either way it is not a road.
    if (!other) continue;
    ties.push({ id: row.id, isTwin: row.isTwin, other });
  }
  return {
    twin: ties.find((tie) => tie.isTwin) ?? null,
    ropes: ties.filter((tie) => !tie.isTwin),
  };
}

/** Just the twin, for a page that only wants to know where its other face is. */
export function twinOf(kind: KeeperKind, id: string, viewer: Viewer): KeeperRef | null {
  return tiesFor(kind, id, viewer).twin?.other ?? null;
}

/**
 * The row behind `twinOf`, read without a viewer — for the notes, which must
 * find the pair whether or not anyone is looking at it.
 */
export function twinRow(kind: KeeperKind, id: string): { kind: KeeperKind; id: string } | null {
  const row = db
    .select()
    .from(schema.counterparts)
    .where(
      and(
        eq(schema.counterparts.isTwin, true),
        or(
          and(eq(schema.counterparts.keeperKind, kind), eq(schema.counterparts.keeperId, id)),
          and(eq(schema.counterparts.playerKind, kind), eq(schema.counterparts.playerId, id)),
        ),
      ),
    )
    .get();
  if (!row) return null;
  const mine = row.keeperKind === kind && row.keeperId === id;
  const otherKind = mine ? row.playerKind : row.keeperKind;
  const otherId = mine ? row.playerId : row.keeperId;
  return isKeeperKind(otherKind) ? { kind: otherKind, id: otherId } : null;
}

/* ------------------------------------------------------------- writing */

export type TieEnd = { kind: KeeperKind; id: string };

/**
 * Tie a Keeper page to a player-facing one. The Keeper end must actually be
 * the Keeper's (§44) — a rope between two player pages is not a thing this
 * table is for, and letting one in would put a Keeper's word on a page the
 * table can read.
 */
export function addTie(keeperEnd: TieEnd, playerEnd: TieEnd, keeperId: string, isTwin = false): string {
  if (keeperEnd.kind === playerEnd.kind && keeperEnd.id === playerEnd.id) {
    throw new Error('Iets kan niet aan zichzelf vastzitten.');
  }
  if (!isKeeperSide(keeperEnd.kind, keeperEnd.id)) {
    throw new Error('De Keeperkant van een touwtje moet een Keeperpagina zijn.');
  }
  if (isTwin) {
    if (twinRow(keeperEnd.kind, keeperEnd.id) || twinRow(playerEnd.kind, playerEnd.id)) {
      throw new Error('Een van de twee heeft al een andere kant.');
    }
  }
  const existing = db
    .select({ id: schema.counterparts.id, isTwin: schema.counterparts.isTwin })
    .from(schema.counterparts)
    .where(
      and(
        eq(schema.counterparts.keeperKind, keeperEnd.kind),
        eq(schema.counterparts.keeperId, keeperEnd.id),
        eq(schema.counterparts.playerKind, playerEnd.kind),
        eq(schema.counterparts.playerId, playerEnd.id),
      ),
    )
    .get();
  if (existing) {
    /*
     * §53: a rope between this pair already exists. It used to be handed back
     * as it stood, which meant "maak hier een tweeling van" on two things that
     * were already roped did *nothing* and said it had worked. The pair is
     * promoted instead — the guards above have already refused it if either
     * end has another face, so this can only ever be the tie the Keeper asked
     * for.
     */
    if (isTwin && !existing.isTwin) {
      db.update(schema.counterparts)
        .set({ isTwin: true })
        .where(eq(schema.counterparts.id, existing.id))
        .run();
      logAudit({
        actorId: keeperId,
        action: 'keeper.twin_tied',
        targetType: keeperEnd.kind,
        targetId: keeperEnd.id,
        meta: { to: `${playerEnd.kind}:${playerEnd.id}` },
      });
    }
    return existing.id;
  }

  const id = newId();
  db.insert(schema.counterparts)
    .values({
      id,
      keeperKind: keeperEnd.kind,
      keeperId: keeperEnd.id,
      playerKind: playerEnd.kind,
      playerId: playerEnd.id,
      isTwin,
      createdBy: keeperId,
    })
    .run();
  logAudit({
    actorId: keeperId,
    action: isTwin ? 'keeper.twin_tied' : 'keeper.roped',
    targetType: keeperEnd.kind,
    targetId: keeperEnd.id,
    meta: { to: `${playerEnd.kind}:${playerEnd.id}` },
  });
  return id;
}

export function removeTie(tieId: string, keeperId: string) {
  const row = db.select().from(schema.counterparts).where(eq(schema.counterparts.id, tieId)).get();
  if (!row) return;
  db.delete(schema.counterparts).where(eq(schema.counterparts.id, tieId)).run();
  logAudit({
    actorId: keeperId,
    action: row.isTwin ? 'keeper.twin_untied' : 'keeper.unroped',
    targetType: row.keeperKind,
    targetId: row.keeperId,
    meta: { to: `${row.playerKind}:${row.playerId}` },
  });
}

/* ------------------------------------------------- §53: linking a twin */

/**
 * §53: make a tweeling out of two pages that already exist.
 *
 * §44 could only ever *make* the second face (`createTwin`), which is the
 * wrong door for the way the tool is actually used: a Keeper preps a Keeper
 * page while the table writes the wiki article about the same thing, and the
 * two meet later. This is that meeting. Nothing is created and nothing is
 * copied — the pair simply becomes one thing with two faces, exactly the twin
 * `createTwin` leaves behind.
 *
 * Three rules, refused here in Dutch rather than by an index in the dark:
 *
 *   1. **opposite sides.** A twin is the Keeper's face *of* a player-facing
 *      thing; two pages on one side are not two faces of anything. Asked of
 *      the records (`isKeeperSide`), never of the page the button was on.
 *   2. **the same soort.** "De Keeperversie van dit ding" is the same kind of
 *      ding — an artikel's other face is an artikel. A rope is what ties a
 *      Keeper's dossier to a landkaart, and it has no such rule.
 *   3. **one each.** Neither end may already have another face; `twinRow` is
 *      stricter than the two partial unique indexes and answers first, so the
 *      Keeper reads a sentence instead of a 500.
 *
 * The pair's notes become one text on the Keeper's side (`mergeNotesIntoTwin`)
 * — the same place `createTwin` puts them, except that here both ends may
 * already have written something, so nothing is thrown away.
 */
export function linkTwin(a: TieEnd, b: TieEnd, keeperId: string): string {
  if (a.kind === b.kind && a.id === b.id) throw new Error('Iets kan niet aan zichzelf vastzitten.');
  if (a.kind !== b.kind) throw new Error('Een tweeling is twee keer hetzelfde soort ding.');
  const aKeeper = isKeeperSide(a.kind, a.id);
  const bKeeper = isKeeperSide(b.kind, b.id);
  if (aKeeper === bKeeper) {
    throw new Error('Een tweeling is één pagina van de Keeper en één van de spelers.');
  }
  const keeperEnd = aKeeper ? a : b;
  const playerEnd = aKeeper ? b : a;
  if (twinRow(keeperEnd.kind, keeperEnd.id) || twinRow(playerEnd.kind, playerEnd.id)) {
    throw new Error('Een van de twee heeft al een andere kant.');
  }
  /*
   * A rope tied while the two stood on the *other* sides is the same rope with
   * its ends the wrong way round, and `counterparts` keeps the Keeper's end in
   * the Keeper column. It is cut here so the twin below can be written the
   * right way round rather than becoming a second row about one pair.
   */
  db.delete(schema.counterparts)
    .where(
      and(
        eq(schema.counterparts.keeperKind, playerEnd.kind),
        eq(schema.counterparts.keeperId, playerEnd.id),
        eq(schema.counterparts.playerKind, keeperEnd.kind),
        eq(schema.counterparts.playerId, keeperEnd.id),
      ),
    )
    .run();
  const id = addTie(keeperEnd, playerEnd, keeperId, true);
  mergeNotesIntoTwin(playerEnd, keeperEnd);
  return id;
}

/* --------------------------------------------------------- making a twin */

/**
 * Make the Keeper's other face of a player-facing thing: a new record of the
 * same kind, with the same name, on the Keeper's side, tied as its twin.
 *
 * What is copied is only what would make the new page *make sense* — the
 * soort and the dossier an artikel was made in, the picture a landkaart is of,
 * the scale and the anchor of a tijdlijn. Never the text: the Keeper's face is
 * for what the players' one does not say, and starting it as a copy of the
 * page you were just reading is a page nobody rewrites.
 */
export function createTwin(kind: KeeperKind, id: string, keeper: { id: string }): KeeperRef {
  const viewer: Viewer = { id: keeper.id, isKeeper: true };
  const source = keeperRef(kind, id, viewer);
  if (!source) throw new Error('Niet gevonden.');
  if (source.keeperOnly) throw new Error('Dit is de Keeperkant al.');
  if (twinRow(kind, id)) throw new Error('Hier is al een Keeperversie van.');

  const madeId = makeOfKind(kind, id, source.name, keeper);
  setKeeperSide(kind, madeId, true, keeper.id);
  addTie({ kind, id: madeId }, { kind, id }, keeper.id, true);
  // The notes written about this thing before it had a second face follow it
  // there: from today the pair keeps one text, on the Keeper's side.
  moveNotesToTwin({ kind, id }, { kind, id: madeId });
  const made = keeperRef(kind, madeId, viewer);
  if (!made) throw new Error('De Keeperversie kon niet gemaakt worden.');
  return made;
}

function makeOfKind(kind: KeeperKind, sourceId: string, name: string, keeper: { id: string }): string {
  switch (kind) {
    case 'entry': {
      const row = db
        .select({ typeId: schema.entries.typeId, originCaseId: schema.entries.originCaseId })
        .from(schema.entries)
        .where(eq(schema.entries.id, sourceId))
        .get();
      if (!row) throw new Error('Niet gevonden.');
      const type = db
        .select({ slug: schema.entryTypes.slug })
        .from(schema.entryTypes)
        .where(eq(schema.entryTypes.id, row.typeId))
        .get();
      if (!type) throw new Error('Onbekende soort artikel.');
      return createEntry({
        typeSlug: type.slug,
        name,
        createdBy: keeper.id,
        characterId: null,
        originCaseId: row.originCaseId,
      }).id;
    }
    case 'case':
      return createCase({ name, createdBy: keeper.id, characterId: null }).id;
    case 'board': {
      const row = db
        .select({ caseId: schema.boards.caseId })
        .from(schema.boards)
        .where(eq(schema.boards.id, sourceId))
        .get();
      return createBoard({ name, caseId: row?.caseId ?? null, createdBy: keeper.id, characterId: null }).id;
    }
    case 'map': {
      const row = db
        .select({
          assetId: schema.maps.assetId,
          width: schema.maps.width,
          height: schema.maps.height,
        })
        .from(schema.maps)
        .where(eq(schema.maps.id, sourceId))
        .get();
      if (!row) throw new Error('Niet gevonden.');
      // The same picture, hung a second time: the Keeper's spelden and ink go
      // on their own copy, and the players' landkaart never learns of them.
      return createMap(
        { name, assetId: row.assetId, width: row.width, height: row.height },
        { id: keeper.id, isKeeper: true },
      ).id;
    }
    case 'timeline': {
      const row = db
        .select({
          caseId: schema.timelines.caseId,
          scale: schema.timelines.scale,
          anchorAt: schema.timelines.anchorAt,
          anchorUnit: schema.timelines.anchorUnit,
        })
        .from(schema.timelines)
        .where(eq(schema.timelines.id, sourceId))
        .get();
      return createTimeline(
        {
          name,
          caseId: row?.caseId ?? null,
          scale: row?.scale,
          anchorAt: row?.anchorAt ?? null,
          anchorUnit: row?.anchorUnit ?? null,
        },
        { id: keeper.id, isKeeper: true },
      ).id;
    }
  }
}
