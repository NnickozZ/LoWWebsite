import { desc, eq, isNotNull } from 'drizzle-orm';
import { db, schema } from '@/lib/db';
import { logActivity, logAudit, reindexEntry } from '@/lib/entries/service';

/**
 * §2.6 and §11: nothing is ever truly deleted. Everything soft-deleted is
 * listed here and can be put back. Only Keepers ever reach this — a deleted
 * entry is invisible to a player by `visibleEntryCondition`, so there is no
 * second rule to keep in step.
 */

export type TrashItem = {
  id: string;
  kind: 'entry' | 'case' | 'board';
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
  } else {
    db.update(schema.boards).set({ deletedAt: null }).where(eq(schema.boards.id, id)).run();
    logActivity({ actorId: keeperId, verb: 'board.restored', boardId: id });
  }
  logAudit({ actorId: keeperId, action: `${kind}.restored`, targetType: kind, targetId: id });
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
