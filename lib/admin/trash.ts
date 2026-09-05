import { and, desc, eq, inArray, isNotNull, or } from 'drizzle-orm';
import { db, schema } from '@/lib/db';
import { logActivity, logAudit, reindexEntry } from '@/lib/entries/service';
import { entryIdsInCase, reconcileOrigin } from '@/lib/entries/origin';
import { forgetStoredState } from '@/lib/live/docs';

/**
 * §2.6 and §11: nothing is deleted by accident. Everything soft-deleted is
 * listed here and can be put back. Only Keepers ever reach this — a deleted
 * entry is invisible to a player by `visibleEntryCondition`, so there is no
 * second rule to keep in step.
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
  kind: 'entry' | 'case' | 'board' | 'map';
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
      detail: row.detail,
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

export function destroyEffects(kind: TrashItem['kind'], id: string): DestroyEffect[] {
  const count = (n: number | undefined) => Number(n ?? 0);
  const rows = <T,>(list: T[]) => list.length;

  if (kind === 'entry') {
    const sectionIds = db
      .select({ id: schema.entrySections.id })
      .from(schema.entrySections)
      .where(eq(schema.entrySections.entryId, id))
      .all()
      .map((row) => row.id);
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
    const sections = db
      .select({ id: schema.entrySections.id })
      .from(schema.entrySections)
      .where(eq(schema.entrySections.entryId, id))
      .all()
      .map((row) => `section:${row.id}`);
    return [`entry:${id}:body`, `entry:${id}:fields`, ...sections];
  }
  if (kind === 'case') return [`case:${id}:notes`, `case:${id}:fields`];
  if (kind === 'map') {
    const pins = db
      .select({ id: schema.mapPins.id })
      .from(schema.mapPins)
      .where(eq(schema.mapPins.mapId, id))
      .all()
      .map((row) => `pin:${row.id}:fields`);
    return [`map:${id}:fields`, ...pins];
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
    const sectionIds = db
      .select({ id: schema.entrySections.id })
      .from(schema.entrySections)
      .where(eq(schema.entrySections.entryId, id))
      .all()
      .map((row) => row.id);

    if (sectionIds.length) {
      db.delete(schema.entrySectionReveals)
        .where(inArray(schema.entrySectionReveals.sectionId, sectionIds))
        .run();
    }
    db.delete(schema.entrySections).where(eq(schema.entrySections.entryId, id)).run();
    db.delete(schema.entryReveals).where(eq(schema.entryReveals.entryId, id)).run();
    db.delete(schema.entryRevisions).where(eq(schema.entryRevisions.entryId, id)).run();
    db.delete(schema.entryLinks)
      .where(or(eq(schema.entryLinks.fromEntryId, id), eq(schema.entryLinks.toEntryId, id)))
      .run();
    db.delete(schema.caseEntries).where(eq(schema.caseEntries.entryId, id)).run();
    db.delete(schema.pendingEdits).where(eq(schema.pendingEdits.entryId, id)).run();
    db.delete(schema.mapPins).where(eq(schema.mapPins.entryId, id)).run();
    // §23: a landkaart that was a map *of* this artikel outlives it — it is a
    // picture the Keeper hung, not a thing the artikel owned. It simply stops
    // being of anything.
    db.update(schema.maps).set({ entryId: null }).where(eq(schema.maps.entryId, id)).run();
    db.delete(schema.userCharacters).where(eq(schema.userCharacters.entryId, id)).run();
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
      notes: snapshot.notes ?? null,
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
