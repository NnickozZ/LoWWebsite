import { and, desc, eq, inArray, isNotNull, or, sql } from 'drizzle-orm';
import { cleanDoc } from '@/lib/entries/doc';
import { db, schema } from '@/lib/db';
import { logActivity, logAudit, reindexEntry } from '@/lib/entries/service';
import { entryIdsInCase, reconcileOrigin } from '@/lib/entries/origin';
import { forgetStoredState } from '@/lib/live/docs';
import type { SectionOwnerKind } from '@/lib/db/schema';
import { plainShort } from '@/lib/entries/shortRefs';

/**
 * §2.6 and §11: nothing is deleted by accident. Everything soft-deleted is
 * listed here and can be put back. Only Keepers ever reach this — a deleted
 * entry is invisible to a player by `visibleEntryCondition`, so there is no
 * second rule to keep in step.
 *
 * §18b: nothing in this file carries a `characterId`, and that is the rule
 * rather than an omission — every act here is a Keeper's, and a Keeper is
 * always the Keeper. The same holds for `lib/admin/types.ts` and
 * `lib/admin/words.ts`, and for the reveal work in `lib/entries/secrets.ts`.
 *
 * The bin does now have a bottom (`destroyFromTrash`). A Keeper who has to be
 * able to throw something away for good — a page written by mistake, a name
 * that should never have been typed — could not, and "restore only" is not a
 * safety rule when the only alternative is opening SQLite by hand. It is
 * deliberately harder than restoring: the item has to be in the bin already,
 * and the Keeper has to type its name (`admin/page.tsx`). Every destruction is
 * written to the audit log with the name, because that row is the only thing
 * left afterwards.
 */

export type TrashItem = {
  id: string;
  kind: 'entry' | 'case' | 'board' | 'map' | 'timeline' | 'family_tree' | 'overzicht';
  name: string;
  /** Where it would come back to, for the link after restoring. */
  href: string;
  detail: string;
  deletedAt: number;
};

export function listTrash(limit = 200): TrashItem[] {
  const entries = db
    .select({
      id: schema.entries.id,
      name: schema.entries.name,
      slug: schema.entries.slug,
      detail: schema.entryTypes.label,
      deletedAt: schema.entries.deletedAt,
    })
    .from(schema.entries)
    .innerJoin(schema.entryTypes, eq(schema.entryTypes.id, schema.entries.typeId))
    .where(isNotNull(schema.entries.deletedAt))
    .orderBy(desc(schema.entries.deletedAt))
    .limit(limit)
    .all();

  const cases = db
    .select({
      id: schema.cases.id,
      name: schema.cases.name,
      slug: schema.cases.slug,
      detail: schema.cases.summary,
      deletedAt: schema.cases.deletedAt,
    })
    .from(schema.cases)
    .where(isNotNull(schema.cases.deletedAt))
    .orderBy(desc(schema.cases.deletedAt))
    .limit(limit)
    .all();

  const boards = db
    .select({
      id: schema.boards.id,
      name: schema.boards.name,
      detail: schema.cases.name,
      deletedAt: schema.boards.deletedAt,
    })
    .from(schema.boards)
    .leftJoin(schema.cases, eq(schema.cases.id, schema.boards.caseId))
    .where(isNotNull(schema.boards.deletedAt))
    .orderBy(desc(schema.boards.deletedAt))
    .limit(limit)
    .all();

  // §19: a landkaart taken off the wall used to be gone for good — soft-deleted
  // where nothing could reach it again. It comes here now like everything else.
  const maps = db
    .select({
      id: schema.maps.id,
      name: schema.maps.name,
      slug: schema.maps.slug,
      detail: schema.maps.description,
      deletedAt: schema.maps.deletedAt,
    })
    .from(schema.maps)
    .where(isNotNull(schema.maps.deletedAt))
    .orderBy(desc(schema.maps.deletedAt))
    .limit(limit)
    .all();

  // §32: a tijdlijn goes the same road as a prikbord.
  const timelines = db
    .select({
      id: schema.timelines.id,
      name: schema.timelines.name,
      slug: schema.timelines.slug,
      detail: schema.cases.name,
      deletedAt: schema.timelines.deletedAt,
    })
    .from(schema.timelines)
    .leftJoin(schema.cases, eq(schema.cases.id, schema.timelines.caseId))
    .where(isNotNull(schema.timelines.deletedAt))
    .orderBy(desc(schema.timelines.deletedAt))
    .limit(limit)
    .all();

  // §66: a stamboom goes the same road as a tijdlijn.
  const familyTrees = db
    .select({
      id: schema.familyTrees.id,
      name: schema.familyTrees.name,
      slug: schema.familyTrees.slug,
      detail: schema.cases.name,
      deletedAt: schema.familyTrees.deletedAt,
    })
    .from(schema.familyTrees)
    .leftJoin(schema.cases, eq(schema.cases.id, schema.familyTrees.caseId))
    .where(isNotNull(schema.familyTrees.deletedAt))
    .orderBy(desc(schema.familyTrees.deletedAt))
    .limit(limit)
    .all();

  // §75: an overzicht. It hangs in no dossier, so its detail line says what it
  // is instead of where it was.
  const overzichten = db
    .select({
      id: schema.overzichten.id,
      name: schema.overzichten.name,
      slug: schema.overzichten.slug,
      deletedAt: schema.overzichten.deletedAt,
    })
    .from(schema.overzichten)
    .where(isNotNull(schema.overzichten.deletedAt))
    .orderBy(desc(schema.overzichten.deletedAt))
    .limit(limit)
    .all();

  return [
    ...entries.map((row) => ({
      id: row.id,
      kind: 'entry' as const,
      name: row.name,
      href: `/e/${row.slug}`,
      detail: row.detail,
      deletedAt: row.deletedAt ?? 0,
    })),
    ...cases.map((row) => ({
      id: row.id,
      kind: 'case' as const,
      name: row.name,
      href: `/c/${row.slug}`,
      // §95: a samenvatting's chips are handles; the bin is the Keeper's, so
      // the Keeper's eyes read them.
      detail: plainShort({ id: '', isKeeper: true }, row.detail),
      deletedAt: row.deletedAt ?? 0,
    })),
    ...boards.map((row) => ({
      id: row.id,
      kind: 'board' as const,
      name: row.name,
      href: `/b/${row.id}`,
      detail: row.detail ?? '',
      deletedAt: row.deletedAt ?? 0,
    })),
    ...maps.map((row) => ({
      id: row.id,
      kind: 'map' as const,
      name: row.name,
      href: `/maps/${row.slug}`,
      detail: row.detail ?? '',
      deletedAt: row.deletedAt ?? 0,
    })),
    ...timelines.map((row) => ({
      id: row.id,
      kind: 'timeline' as const,
      name: row.name,
      href: `/timelines/${row.slug}`,
      detail: row.detail ?? '',
      deletedAt: row.deletedAt ?? 0,
    })),
    ...familyTrees.map((row) => ({
      id: row.id,
      kind: 'family_tree' as const,
      name: row.name,
      href: `/stambomen/${row.slug}`,
      detail: row.detail ?? '',
      deletedAt: row.deletedAt ?? 0,
    })),
    // §75
    ...overzichten.map((row) => ({
      id: row.id,
      kind: 'overzicht' as const,
      name: row.name,
      href: `/wiki/overzicht/${row.slug}`,
      detail: 'in de wiki',
      deletedAt: row.deletedAt ?? 0,
    })),
  ].sort((a, b) => b.deletedAt - a.deletedAt);
}

export function restoreFromTrash(kind: TrashItem['kind'], id: string, keeperId: string) {
  if (kind === 'entry') {
    db.update(schema.entries)
      .set({ deletedAt: null, updatedBy: keeperId })
      .where(eq(schema.entries.id, id))
      .run();
    reindexEntry(id);
    logActivity({ actorId: keeperId, verb: 'entry.restored', entryId: id });
  } else if (kind === 'case') {
    db.update(schema.cases).set({ deletedAt: null }).where(eq(schema.cases.id, id)).run();
    logActivity({ actorId: keeperId, verb: 'case.restored', caseId: id });
  } else if (kind === 'board') {
    db.update(schema.boards).set({ deletedAt: null }).where(eq(schema.boards.id, id)).run();
    logActivity({ actorId: keeperId, verb: 'board.restored', boardId: id });
  } else if (kind === 'timeline') {
    // §32: back on the shelf with every gebeurtenis still on it — they were
    // never deleted with the tijdlijn, only hidden with it.
    db.update(schema.timelines).set({ deletedAt: null }).where(eq(schema.timelines.id, id)).run();
    logActivity({ actorId: keeperId, verb: 'timeline.restored', meta: { timelineId: id } });
  } else if (kind === 'family_tree') {
    // §66: back on the shelf with everyone still standing in it — the members
    // and the losse kaartjes live in the tree's own state, which was never
    // touched, and the kinship lines live on the artikelen.
    db.update(schema.familyTrees).set({ deletedAt: null }).where(eq(schema.familyTrees.id, id)).run();
    logActivity({ actorId: keeperId, verb: 'family_tree.restored', meta: { familyTreeId: id } });
  } else if (kind === 'overzicht') {
    // §75: back on the shelf with its secties still on it — they were never
    // deleted with it, only hidden with it, exactly as a tijdlijn's
    // gebeurtenissen are.
    db.update(schema.overzichten).set({ deletedAt: null }).where(eq(schema.overzichten.id, id)).run();
    logActivity({ actorId: keeperId, verb: 'overzicht.restored', meta: { overzichtId: id } });
  } else {
    // §19: back on the wall, with every speld still where it was — pins are
    // never deleted with the map, only hidden with it.
    db.update(schema.maps).set({ deletedAt: null }).where(eq(schema.maps.id, id)).run();
    logActivity({ actorId: keeperId, verb: 'map.restored', meta: { mapId: id } });
  }
  logAudit({ actorId: keeperId, action: `${kind}.restored`, targetType: kind, targetId: id });
}

/* ----------------------------------------------------------- destruction */

/**
 * What goes with a thing when it is destroyed, in words a Keeper can weigh
 * before typing the name. Read off the database, so it is what will actually
 * happen rather than what this comment remembers.
 */
export type DestroyEffect = { label: string; count: number };

/**
 * §70: a sectie belongs to a *thing*, so both the count shown before the
 * confirm and the destruction itself ask the same question of the same table.
 * One helper, so a dossier can never be counted by one rule and swept by
 * another.
 */
function sectionIdsOf(ownerKind: SectionOwnerKind, ownerId: string): string[] {
  return db
    .select({ id: schema.sections.id })
    .from(schema.sections)
    .where(and(eq(schema.sections.ownerKind, ownerKind), eq(schema.sections.ownerId, ownerId)))
    .all()
    .map((row) => row.id);
}

/** Every sectie of one thing, and the reveals that named them. */
function destroySectionsOf(ownerKind: SectionOwnerKind, ownerId: string): void {
  const sectionIds = sectionIdsOf(ownerKind, ownerId);
  if (sectionIds.length) {
    db.delete(schema.entrySectionReveals)
      .where(inArray(schema.entrySectionReveals.sectionId, sectionIds))
      .run();
  }
  db.delete(schema.sections)
    .where(and(eq(schema.sections.ownerKind, ownerKind), eq(schema.sections.ownerId, ownerId)))
    .run();
}

export function destroyEffects(kind: TrashItem['kind'], id: string): DestroyEffect[] {
  const count = (n: number | undefined) => Number(n ?? 0);
  const rows = <T,>(list: T[]) => list.length;

  if (kind === 'entry') {
    const sectionIds = sectionIdsOf('entry', id);
    return [
      { label: 'verborgen stukken', count: rows(sectionIds) },
      {
        label: 'bewaarde versies',
        count: rows(
          db
            .select({ id: schema.entryRevisions.id })
            .from(schema.entryRevisions)
            .where(eq(schema.entryRevisions.entryId, id))
            .all(),
        ),
      },
      {
        label: 'plekken in een dossier',
        count: rows(
          db
            .select({ caseId: schema.caseEntries.caseId })
            .from(schema.caseEntries)
            .where(eq(schema.caseEntries.entryId, id))
            .all(),
        ),
      },
      {
        label: 'landkaarten die niet langer van dit artikel zijn',
        count: rows(
          db
            .select({ id: schema.maps.id })
            .from(schema.maps)
            .where(eq(schema.maps.entryId, id))
            .all(),
        ),
      },
      {
        label: 'spelden op landkaarten',
        count: rows(
          db
            .select({ id: schema.mapPins.id })
            .from(schema.mapPins)
            .where(eq(schema.mapPins.entryId, id))
            .all(),
        ),
      },
      {
        label: 'gebeurtenissen op tijdlijnen',
        count: rows(
          db
            .select({ id: schema.timelineEvents.id })
            .from(schema.timelineEvents)
            .where(eq(schema.timelineEvents.entryId, id))
            .all(),
        ),
      },
      {
        label: 'voorstellen',
        count: rows(
          db
            .select({ id: schema.pendingEdits.id })
            .from(schema.pendingEdits)
            .where(eq(schema.pendingEdits.entryId, id))
            .all(),
        ),
      },
    ].filter((effect) => count(effect.count) > 0);
  }

  if (kind === 'case') {
    return [
      // §70: a dossier carries secties now, so they are part of what goes.
      { label: 'verborgen stukken', count: rows(sectionIdsOf('case', id)) },
      {
        label: 'artikelen die eruit gehaald worden (de artikelen zelf blijven)',
        count: rows(
          db
            .select({ entryId: schema.caseEntries.entryId })
            .from(schema.caseEntries)
            .where(eq(schema.caseEntries.caseId, id))
            .all(),
        ),
      },
      {
        label: 'prikborden die losse prikborden worden',
        count: rows(
          db
            .select({ id: schema.boards.id })
            .from(schema.boards)
            .where(eq(schema.boards.caseId, id))
            .all(),
        ),
      },
      {
        label: 'bewaarde versies',
        count: rows(
          db
            .select({ id: schema.caseRevisions.id })
            .from(schema.caseRevisions)
            .where(eq(schema.caseRevisions.caseId, id))
            .all(),
        ),
      },
    ].filter((effect) => count(effect.count) > 0);
  }

  if (kind === 'board') {
    return [
      {
        label: 'bewaarde versies',
        count: rows(
          db
            .select({ id: schema.boardRevisions.id })
            .from(schema.boardRevisions)
            .where(eq(schema.boardRevisions.boardId, id))
            .all(),
        ),
      },
    ].filter((effect) => count(effect.count) > 0);
  }

  if (kind === 'family_tree') {
    /**
     * §66: what actually goes is the row, its rights, its Keeper notes and
     * touwtjes, its tekenlaag and its "Genoemd in" rows — none of which a
     * Keeper needs counted. What is worth saying is what *stays*: everyone
     * standing in it. Kinship is a fact about the artikelen, so destroying the
     * window it was read through changes nothing about the people in it. The
     * losse kaartjes are the one thing that exists nowhere else, and they live
     * in the tree's own state, so they are counted here.
     */
    const state = db
      .select({ state: schema.familyTrees.state })
      .from(schema.familyTrees)
      .where(eq(schema.familyTrees.id, id))
      .get()?.state;
    const loose = Array.isArray(state?.loose) ? state.loose.length : 0;
    return [{ label: 'losse kaartjes erin (die bestaan nergens anders)', count: loose }].filter(
      (effect) => count(effect.count) > 0,
    );
  }

  if (kind === 'overzicht') {
    /*
     * §75: what goes with it is its secties, and they exist nowhere else — an
     * overzicht *is* its secties. Nothing else is counted, because nothing else
     * only existed because of it: every artikel it named is untouched, and it
     * never wrote a "Genoemd in" row to begin with (rule 75).
     */
    const sections = db
      .select({ id: schema.sections.id })
      .from(schema.sections)
      .where(and(eq(schema.sections.ownerKind, 'overzicht'), eq(schema.sections.ownerId, id)))
      .all();
    return [{ label: 'secties erop', count: sections.length }].filter((effect) => count(effect.count) > 0);
  }

  if (kind === 'timeline') {
    return [
      {
        label: 'gebeurtenissen erop',
        count: rows(
          db
            .select({ id: schema.timelineEvents.id })
            .from(schema.timelineEvents)
            .where(eq(schema.timelineEvents.timelineId, id))
            .all(),
        ),
      },
    ].filter((effect) => count(effect.count) > 0);
  }

  return [
    {
      label: 'spelden erop',
      count: rows(
        db.select({ id: schema.mapPins.id }).from(schema.mapPins).where(eq(schema.mapPins.mapId, id)).all(),
      ),
    },
    {
      label: 'artikelen die hun plattegrond kwijtraken (de artikelen zelf blijven)',
      count: rows(
        db.select({ id: schema.maps.id }).from(schema.maps).where(and(eq(schema.maps.id, id), isNotNull(schema.maps.entryId))).all(),
      ),
    },
  ].filter((effect) => count(effect.count) > 0);
}

/** The rooms of shared text a record owns, so nothing is left typing into a ghost. */
function roomsOf(kind: TrashItem['kind'], id: string): string[] {
  if (kind === 'entry') {
    const sections = sectionIdsOf('entry', id).map((sectionId) => `section:${sectionId}`);
    return [`entry:${id}:body`, `entry:${id}:fields`, ...sections];
  }
  // §70: a dossier carries secties too, and each one is a room of its own.
  if (kind === 'case') {
    const sections = sectionIdsOf('case', id).map((sectionId) => `section:${sectionId}`);
    return [`case:${id}:notes`, `case:${id}:fields`, ...sections];
  }
  if (kind === 'map') {
    const pins = db
      .select({ id: schema.mapPins.id })
      .from(schema.mapPins)
      .where(eq(schema.mapPins.mapId, id))
      .all()
      .map((row) => `pin:${row.id}:fields`);
    return [`map:${id}:fields`, ...pins];
  }
  if (kind === 'timeline') {
    return db
      .select({ id: schema.timelineEvents.id })
      .from(schema.timelineEvents)
      .where(eq(schema.timelineEvents.timelineId, id))
      .all()
      .map((row) => `event:${row.id}:fields`);
  }
  // §66: a stamboom has no field rooms of its own — a los kaartje's words live
  // in the state blob, and a member's words live on its artikel. The one shared
  // text it owns is the Keeper's notes about it (§44).
  if (kind === 'family_tree') return [`keeper:family_tree:${id}:notes`];
  // §75: an overzicht's shared text is its secties — one room each (§20) — plus
  // the Keeper's notes about it. A room left behind would hand its words back
  // to the next thing that happened to be given the same id.
  if (kind === 'overzicht') {
    return [
      ...db
        .select({ id: schema.sections.id })
        .from(schema.sections)
        .where(and(eq(schema.sections.ownerKind, 'overzicht'), eq(schema.sections.ownerId, id)))
        .all()
        .map((row) => `section:${row.id}`),
      `keeper:overzicht:${id}:notes`,
    ];
  }
  return [];
}

/**
 * Destroys one thing in the bin, and everything that only existed because of
 * it. Returns its name, for the message afterwards — nothing else survives to
 * be looked up.
 *
 * Three deliberate limits:
 *
 *  - **Only what is already in the bin.** Everything soft-deletes first, so
 *    destroying is always a second decision, taken later, about something that
 *    is already out of sight.
 *  - **Nothing that belongs to something else goes with it.** Destroying a
 *    dossier does not destroy the artikelen in it, and does not destroy its
 *    prikborden — they become loose boards, because a board with a case id
 *    pointing at nothing cannot be opened at all (`getBoard` looks the parent
 *    up and refuses when it is gone). Pictures stay in the asset store: one
 *    upload can hang on several pages, and a bin is no place to guess.
 *  - **The audit row is written first.** It carries the name, which is the
 *    only trace left once the row is gone.
 */
export function destroyFromTrash(kind: TrashItem['kind'], id: string, keeperId: string): string {
  const item = listTrash(1000).find((row) => row.kind === kind && row.id === id);
  if (!item) throw new Error('Dit staat niet (meer) in de prullenbak.');

  logAudit({
    actorId: keeperId,
    action: `${kind}.destroyed`,
    targetType: kind,
    targetId: id,
    meta: { name: item.name },
  });

  const rooms = roomsOf(kind, id);

  if (kind === 'entry') {
    destroySectionsOf('entry', id);
    db.delete(schema.entryReveals).where(eq(schema.entryReveals.entryId, id)).run();
    db.delete(schema.entryRevisions).where(eq(schema.entryRevisions.entryId, id)).run();
    db.delete(schema.entryLinks)
      .where(or(eq(schema.entryLinks.fromEntryId, id), eq(schema.entryLinks.toEntryId, id)))
      .run();
    db.delete(schema.caseEntries).where(eq(schema.caseEntries.entryId, id)).run();
    db.delete(schema.pendingEdits).where(eq(schema.pendingEdits.entryId, id)).run();
    db.delete(schema.mapPins).where(eq(schema.mapPins.entryId, id)).run();
    // §32: a gebeurtenis that *was* this artikel is a mark that points at
    // nothing; it goes the way a speld does. The tijdlijn stays.
    db.delete(schema.timelineEvents).where(eq(schema.timelineEvents.entryId, id)).run();
    // §23: a landkaart that was a map *of* this artikel outlives it — it is a
    // picture the Keeper hung, not a thing the artikel owned. It simply stops
    // being of anything.
    db.update(schema.maps).set({ entryId: null }).where(eq(schema.maps.entryId, id)).run();
    db.delete(schema.userCharacters).where(eq(schema.userCharacters.entryId, id)).run();
    /*
     * §79: and out of every kamer.
     *
     * Two directions, and the first one matters more than it looks. A voorwerp
     * that is destroyed while it lies on somebody's plank leaves `entry_id`
     * pointing at nothing — and `viewRoomBySlug` reads "a row that does not
     * come back is veiled", so the plek would say *er ligt iets* for ever, to
     * the owner and to the Keeper, with no way to tell it from a genuine
     * secret. That is the one distinction §76's rule is built on, so a dangling
     * reference does not merely leave litter: it corrupts the signal.
     *
     * The other direction is the onderzoeker himself: destroy the artikel and
     * the kamer, its plekken and its grootboek have nobody to belong to.
     */
    db.update(schema.roomSlots)
      .set({ entryId: null, placedAt: null })
      .where(eq(schema.roomSlots.entryId, id))
      .run();
    // §93: and out of every lade — a drawer row naming nothing would list a
    // thing that can never be put down again.
    db.delete(schema.roomDrawer).where(eq(schema.roomDrawer.entryId, id)).run();
    const ownRooms = db
      .select({ id: schema.rooms.id })
      .from(schema.rooms)
      .where(eq(schema.rooms.entryId, id))
      .all()
      .map((row) => row.id);
    if (ownRooms.length) {
      db.delete(schema.roomSlots).where(inArray(schema.roomSlots.roomId, ownRooms)).run();
      db.delete(schema.roomLedger).where(inArray(schema.roomLedger.roomId, ownRooms)).run();
      db.delete(schema.roomDrawer).where(inArray(schema.roomDrawer.roomId, ownRooms)).run();
      db.delete(schema.rooms).where(inArray(schema.rooms.id, ownRooms)).run();
      db.delete(schema.accessGrants)
        .where(and(eq(schema.accessGrants.targetType, 'room'), inArray(schema.accessGrants.targetId, ownRooms)))
        .run();
    }
    db.delete(schema.activity).where(eq(schema.activity.entryId, id)).run();
    db.delete(schema.accessGrants)
      .where(and(eq(schema.accessGrants.targetType, 'entry'), eq(schema.accessGrants.targetId, id)))
      .run();
    db.delete(schema.entries).where(eq(schema.entries.id, id)).run();
    // The search index is keyed on the entry, and `reindexEntry` drops the row
    // when the entry is gone — which it now is.
    reindexEntry(id);
  } else if (kind === 'case') {
    // The boards keep their contents and their rights; they simply stop
    // hanging off a dossier that no longer exists.
    db.update(schema.boards).set({ caseId: null }).where(eq(schema.boards.caseId, id)).run();
    // §32: and so do its tijdlijnen, which become loose tijdlijnen for the same reason.
    db.update(schema.timelines).set({ caseId: null }).where(eq(schema.timelines.caseId, id)).run();
    // §24: the artikelen survive it (rule 21), so the ones that said they came
    // from here have to be told where they came from now. Read before the
    // filings go, reconciled after. A *pinned* origin is normally nobody's to
    // move but the person who set it — except that the thing they pinned it to
    // is about to stop existing, so the pin goes with it and the artikel
    // follows the rule again.
    const orphaned = entryIdsInCase(id);
    db.update(schema.entries)
      .set({ originPinned: false })
      .where(eq(schema.entries.originCaseId, id))
      .run();
    // §70: and so do its secties, with the reveals that named them. A sectie
    // exists nowhere but on the thing it hangs off, so it goes with it — the
    // same rule an artikel's secties have always followed.
    destroySectionsOf('case', id);
    db.delete(schema.caseEntries).where(eq(schema.caseEntries.caseId, id)).run();
    db.delete(schema.caseMembers).where(eq(schema.caseMembers.caseId, id)).run();
    db.delete(schema.caseRevisions).where(eq(schema.caseRevisions.caseId, id)).run();
    db.delete(schema.activity).where(eq(schema.activity.caseId, id)).run();
    db.delete(schema.accessGrants)
      .where(and(eq(schema.accessGrants.targetType, 'case'), eq(schema.accessGrants.targetId, id)))
      .run();
    db.delete(schema.cases).where(eq(schema.cases.id, id)).run();
    for (const entryId of orphaned) reconcileOrigin(entryId);
    // One that was pinned here but never filed here is not in `orphaned`.
    db.update(schema.entries)
      .set({ originCaseId: null })
      .where(eq(schema.entries.originCaseId, id))
      .run();
  } else if (kind === 'board') {
    db.delete(schema.boardRevisions).where(eq(schema.boardRevisions.boardId, id)).run();
    db.delete(schema.activity).where(eq(schema.activity.boardId, id)).run();
    db.delete(schema.accessGrants)
      .where(and(eq(schema.accessGrants.targetType, 'board'), eq(schema.accessGrants.targetId, id)))
      .run();
    db.delete(schema.boards).where(eq(schema.boards.id, id)).run();
  } else if (kind === 'timeline') {
    // §32: the gebeurtenissen go with the tijdlijn — a note gebeurtenis exists
    // nowhere else, and an artikel gebeurtenis is a mark on *this* axis. The
    // artikelen themselves stay.
    db.delete(schema.timelineEvents).where(eq(schema.timelineEvents.timelineId, id)).run();
    db.delete(schema.activity).where(sql`json_extract(${schema.activity.meta}, '$.timelineId') = ${id}`).run();
    db.delete(schema.accessGrants)
      .where(and(eq(schema.accessGrants.targetType, 'timeline'), eq(schema.accessGrants.targetId, id)))
      .run();
    db.delete(schema.timelines).where(eq(schema.timelines.id, id)).run();
  } else if (kind === 'family_tree') {
    /**
     * §66: everything that only existed because this tree did, and nothing
     * else. The people in it are artikelen and stay; the kinship between them
     * is fields on those artikelen and stays. What goes is the window: its
     * rights, its Keeper notes, its touwtjes and tweeling (§44), its tekenlaag
     * (§33) and the "Genoemd in" rows that pointed back at it (§27) — that
     * last one especially, because a mention row that names a tree which no
     * longer exists prints an empty line on an artikel's page.
     */
    db.delete(schema.accessGrants)
      .where(and(eq(schema.accessGrants.targetType, 'family_tree'), eq(schema.accessGrants.targetId, id)))
      .run();
    db.delete(schema.keeperNotes)
      .where(and(eq(schema.keeperNotes.kind, 'family_tree'), eq(schema.keeperNotes.targetId, id)))
      .run();
    db.delete(schema.counterparts)
      .where(
        or(
          and(eq(schema.counterparts.keeperKind, 'family_tree'), eq(schema.counterparts.keeperId, id)),
          and(eq(schema.counterparts.playerKind, 'family_tree'), eq(schema.counterparts.playerId, id)),
        ),
      )
      .run();
    db.delete(schema.inkLayers).where(eq(schema.inkLayers.targetId, id)).run();
    db.delete(schema.entryMentions)
      .where(and(eq(schema.entryMentions.fromKind, 'family_tree'), eq(schema.entryMentions.fromId, id)))
      .run();
    db.delete(schema.activity)
      .where(sql`json_extract(${schema.activity.meta}, '$.familyTreeId') = ${id}`)
      .run();
    db.delete(schema.familyTrees).where(eq(schema.familyTrees.id, id)).run();
  } else if (kind === 'overzicht') {
    /*
     * §75: its secties and their reveals, its rights, its Keeper notes — and
     * nothing else. Every artikel it pointed at stays exactly where it was,
     * which is the whole point of an overzicht: it collects, it does not own.
     * There is no `entry_mentions` sweep here because an overzicht never wrote
     * one (`recomputeOwnerMentions`).
     */
    const sectionIds = db
      .select({ id: schema.sections.id })
      .from(schema.sections)
      .where(and(eq(schema.sections.ownerKind, 'overzicht'), eq(schema.sections.ownerId, id)))
      .all()
      .map((row) => row.id);
    if (sectionIds.length) {
      db.delete(schema.entrySectionReveals)
        .where(inArray(schema.entrySectionReveals.sectionId, sectionIds))
        .run();
    }
    db.delete(schema.sections)
      .where(and(eq(schema.sections.ownerKind, 'overzicht'), eq(schema.sections.ownerId, id)))
      .run();
    db.delete(schema.accessGrants)
      .where(and(eq(schema.accessGrants.targetType, 'overzicht'), eq(schema.accessGrants.targetId, id)))
      .run();
    db.delete(schema.keeperNotes)
      .where(and(eq(schema.keeperNotes.kind, 'overzicht'), eq(schema.keeperNotes.targetId, id)))
      .run();
    db.delete(schema.activity)
      .where(sql`json_extract(${schema.activity.meta}, '$.overzichtId') = ${id}`)
      .run();
    db.delete(schema.overzichten).where(eq(schema.overzichten.id, id)).run();
  } else {
    // §19: the spelden go with the map — they are places *on* it and mean
    // nothing without it. The artikelen those spelden pointed at do not.
    db.delete(schema.mapPins).where(eq(schema.mapPins.mapId, id)).run();
    db.delete(schema.maps).where(eq(schema.maps.id, id)).run();
  }

  for (const room of rooms) forgetStoredState(room);
  return item.name;
}

/* ------------------------------------------------- case and board history */

export type SnapshotRow = {
  id: string;
  createdAt: number;
  editedByName: string | null;
};

export function listCaseRevisions(caseId: string, limit = 50): SnapshotRow[] {
  return db
    .select({
      id: schema.caseRevisions.id,
      createdAt: schema.caseRevisions.createdAt,
      editedByName: schema.users.username,
    })
    .from(schema.caseRevisions)
    .leftJoin(schema.users, eq(schema.users.id, schema.caseRevisions.editedBy))
    .where(eq(schema.caseRevisions.caseId, caseId))
    .orderBy(desc(schema.caseRevisions.createdAt))
    .limit(limit)
    .all();
}

export function listBoardRevisions(boardId: string, limit = 50): SnapshotRow[] {
  return db
    .select({
      id: schema.boardRevisions.id,
      createdAt: schema.boardRevisions.createdAt,
      editedByName: schema.users.username,
    })
    .from(schema.boardRevisions)
    .leftJoin(schema.users, eq(schema.users.id, schema.boardRevisions.editedBy))
    .where(eq(schema.boardRevisions.boardId, boardId))
    .orderBy(desc(schema.boardRevisions.createdAt))
    .limit(limit)
    .all();
}

/** Puts a case back to a snapshot. The snapshot itself is kept, as is the one before. */
export function restoreCaseRevision(revisionId: string, keeperId: string) {
  const revision = db
    .select()
    .from(schema.caseRevisions)
    .where(eq(schema.caseRevisions.id, revisionId))
    .get();
  if (!revision) throw new Error('Versie niet gevonden');
  const snapshot = revision.snapshot as Record<string, unknown>;

  db.update(schema.cases)
    .set({
      name: String(snapshot.name ?? ''),
      summary: String(snapshot.summary ?? ''),
      // §89: an old version is cleaned on its way back like any other document.
      notes: cleanDoc(snapshot.notes ?? null),
      notesText: String(snapshot.notesText ?? ''),
      status: (snapshot.status as 'open' | 'cold' | 'closed') ?? 'open',
      updatedAt: Math.floor(Date.now() / 1000),
    })
    .where(eq(schema.cases.id, revision.caseId))
    .run();

  logActivity({ actorId: keeperId, verb: 'case.restored_revision', caseId: revision.caseId });
  logAudit({
    actorId: keeperId,
    action: 'case.restored_revision',
    targetType: 'case',
    targetId: revision.caseId,
  });
  return revision.caseId;
}

/** Puts a board back to a snapshot of its state. */
export function restoreBoardRevision(revisionId: string, keeperId: string) {
  const revision = db
    .select()
    .from(schema.boardRevisions)
    .where(eq(schema.boardRevisions.id, revisionId))
    .get();
  if (!revision) throw new Error('Versie niet gevonden');

  db.update(schema.boards)
    .set({ state: revision.snapshot, updatedAt: Math.floor(Date.now() / 1000) })
    .where(eq(schema.boards.id, revision.boardId))
    .run();

  logActivity({ actorId: keeperId, verb: 'board.restored_revision', boardId: revision.boardId });
  logAudit({
    actorId: keeperId,
    action: 'board.restored_revision',
    targetType: 'board',
    targetId: revision.boardId,
  });
  return revision.boardId;
}

/** Cases and boards that have any history, for the history pane's pickers. */
export function listArchivedThings() {
  const cases = db
    .select({ id: schema.cases.id, name: schema.cases.name, slug: schema.cases.slug })
    .from(schema.cases)
    .orderBy(desc(schema.cases.updatedAt))
    .limit(100)
    .all();
  const boards = db
    .select({ id: schema.boards.id, name: schema.boards.name })
    .from(schema.boards)
    .orderBy(desc(schema.boards.updatedAt))
    .limit(100)
    .all();
  return { cases, boards };
}
