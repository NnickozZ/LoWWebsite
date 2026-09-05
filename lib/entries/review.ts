import { and, desc, eq } from 'drizzle-orm';
import { canManageAccess, loadAccessRow } from '@/lib/access';
import { displayNames } from '@/lib/characters';
import { db, schema } from '@/lib/db';
import { docToText } from '@/lib/entries/doc';
import { logActivity, logAudit, updateEntry, type EntryPatch } from '@/lib/entries/service';
import { visibleEntryCondition } from '@/lib/entries/visibility';

/**
 * §10: a player's edit to a locked entry lands in `pending_edits` instead of on
 * the entry. This is the reviewing side of that: what is waiting, what it would
 * change, and approving or rejecting it with a note back to the author.
 *
 * §17 widened who reviews. A proposal now also comes from someone who may see
 * a fiche but not edit it, and the fiche's *owner* may judge it as well as a
 * Keeper — on the fiche itself, where the Keeper's queue in Beheer is one list
 * of everything.
 */

/** Who may pass judgement on a proposal for this fiche: a Keeper, or its owner. */
export function canReview(entryId: string, user: { id: string; isKeeper: boolean }): boolean {
  if (user.isKeeper) return true;
  const row = loadAccessRow('entry', entryId);
  return Boolean(row && row.createdBy === user.id && canManageAccess(row, user));
}

export type PendingField = {
  key: string;
  label: string;
  /** The entry as it stands. */
  before: string;
  /** What the proposal would make it. */
  after: string;
};

export type PendingEdit = {
  id: string;
  entryId: string;
  entrySlug: string;
  entryName: string;
  proposedBy: string | null;
  /** §18: the name to print — the character the proposer wears, or the Keeper's word. */
  proposedByName: string | null;
  /** The account behind that name, for the tooltip. */
  proposedByAccount: string | null;
  createdAt: number;
  fields: PendingField[];
};

/** Only the keys a player can actually propose; the Keeper-only ones are ignored. */
const FIELD_LABELS: Record<string, string> = {
  name: 'Naam',
  shortDescription: 'Korte beschrijving',
  body: 'Tekst',
  fields: 'Velden',
  tags: 'Tags',
  coverAssetId: 'Afbeelding',
  coverCrop: 'Uitsnede van de afbeelding',
  typeSlug: 'Soort fiche',
};

function asText(key: string, value: unknown): string {
  if (value === null || value === undefined) return '';
  if (key === 'body') return docToText(value);
  if (key === 'tags' && Array.isArray(value)) return value.join(', ');
  if (typeof value === 'string') return value;
  return JSON.stringify(value, null, 2);
}

export function listPendingEdits(entryId?: string): PendingEdit[] {
  const rows = db
    .select({
      id: schema.pendingEdits.id,
      entryId: schema.pendingEdits.entryId,
      proposedSnapshot: schema.pendingEdits.proposedSnapshot,
      proposedBy: schema.pendingEdits.proposedBy,
      createdAt: schema.pendingEdits.createdAt,
      entryName: schema.entries.name,
      entrySlug: schema.entries.slug,
      entryBody: schema.entries.body,
      entryBodyText: schema.entries.bodyText,
      entryShort: schema.entries.shortDescription,
      entryTags: schema.entries.tags,
      entryFields: schema.entries.fields,
      entryCover: schema.entries.coverAssetId,
      proposedByName: schema.users.username,
      proposedByIsKeeper: schema.users.isKeeper,
    })
    .from(schema.pendingEdits)
    .innerJoin(schema.entries, eq(schema.entries.id, schema.pendingEdits.entryId))
    .leftJoin(schema.users, eq(schema.users.id, schema.pendingEdits.proposedBy))
    .where(
      entryId
        ? and(eq(schema.pendingEdits.status, 'pending'), eq(schema.pendingEdits.entryId, entryId))
        : eq(schema.pendingEdits.status, 'pending'),
    )
    .orderBy(desc(schema.pendingEdits.createdAt))
    .all();

  const names = displayNames(
    rows.flatMap((row) =>
      row.proposedBy
        ? [{ id: row.proposedBy, username: row.proposedByName ?? '', isKeeper: Boolean(row.proposedByIsKeeper) }]
        : [],
    ),
  );

  return rows.map((row) => {
    const named = row.proposedBy ? names.get(row.proposedBy) : undefined;
    const snapshot = (row.proposedSnapshot ?? {}) as Record<string, unknown>;
    const current: Record<string, unknown> = {
      name: row.entryName,
      shortDescription: row.entryShort,
      body: row.entryBody,
      tags: row.entryTags,
      fields: row.entryFields,
      coverAssetId: row.entryCover,
    };

    const fields: PendingField[] = Object.keys(snapshot)
      .filter((key) => key in FIELD_LABELS)
      .map((key) => ({
        key,
        label: FIELD_LABELS[key],
        before: key === 'body' ? row.entryBodyText : asText(key, current[key]),
        after: asText(key, snapshot[key]),
      }))
      .filter((field) => field.before !== field.after);

    return {
      id: row.id,
      entryId: row.entryId,
      entrySlug: row.entrySlug,
      entryName: row.entryName,
      proposedBy: row.proposedBy,
      proposedByName: named?.label ?? row.proposedByName,
      proposedByAccount: named?.account ?? row.proposedByName,
      createdAt: row.createdAt,
      fields,
    };
  });
}

export function countPendingEdits(): number {
  return db
    .select({ id: schema.pendingEdits.id })
    .from(schema.pendingEdits)
    .where(eq(schema.pendingEdits.status, 'pending'))
    .all().length;
}

/**
 * Approving applies the proposal with the reviewer's authority: as far as
 * `updateEntry` is concerned the write comes from a Keeper, which is what makes
 * it land on a locked or guarded fiche at all — it would otherwise be queued
 * again. The reviewer must have the right to review, which is checked first.
 */
export function approvePendingEdit(
  pendingId: string,
  reviewer: { id: string; isKeeper: boolean },
  note = '',
) {
  const row = db
    .select()
    .from(schema.pendingEdits)
    .where(eq(schema.pendingEdits.id, pendingId))
    .get();
  if (!row || row.status !== 'pending') throw new Error('Voorstel niet gevonden');
  if (!canReview(row.entryId, reviewer)) throw new Error('Alleen de eigenaar of een Keeper beoordeelt dit.');

  const snapshot = (row.proposedSnapshot ?? {}) as Record<string, unknown>;
  const patch = Object.fromEntries(
    Object.entries(snapshot).filter(([key]) => key in FIELD_LABELS),
  ) as EntryPatch;
  updateEntry(row.entryId, patch, { id: reviewer.id, isKeeper: true });

  db.update(schema.pendingEdits)
    .set({
      status: 'approved',
      reviewedBy: reviewer.id,
      reviewedAt: Math.floor(Date.now() / 1000),
      reviewNote: note.slice(0, 500),
    })
    .where(eq(schema.pendingEdits.id, pendingId))
    .run();

  logActivity({ actorId: reviewer.id, verb: 'entry.edit_approved', entryId: row.entryId });
  logAudit({
    actorId: reviewer.id,
    action: 'pending_edit.approved',
    targetType: 'entry',
    targetId: row.entryId,
    meta: { proposedBy: row.proposedBy, note },
  });
}

export function rejectPendingEdit(
  pendingId: string,
  reviewer: { id: string; isKeeper: boolean },
  note = '',
) {
  const row = db
    .select()
    .from(schema.pendingEdits)
    .where(eq(schema.pendingEdits.id, pendingId))
    .get();
  if (!row || row.status !== 'pending') return;
  if (!canReview(row.entryId, reviewer)) throw new Error('Alleen de eigenaar of een Keeper beoordeelt dit.');

  db.update(schema.pendingEdits)
    .set({
      status: 'rejected',
      reviewedBy: reviewer.id,
      reviewedAt: Math.floor(Date.now() / 1000),
      reviewNote: note.slice(0, 500),
    })
    .where(eq(schema.pendingEdits.id, pendingId))
    .run();

  logAudit({
    actorId: reviewer.id,
    action: 'pending_edit.rejected',
    targetType: 'entry',
    targetId: row.entryId,
    meta: { proposedBy: row.proposedBy, note },
  });
}

/**
 * What the author sees on their own account page: their proposals and what
 * became of them, with the Keeper's note.
 */
export type MyProposal = {
  id: string;
  entryName: string;
  entrySlug: string;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: number;
  reviewedAt: number | null;
  reviewNote: string;
};

export function listMyProposals(userId: string, limit = 20): MyProposal[] {
  return db
    .select({
      id: schema.pendingEdits.id,
      entryName: schema.entries.name,
      entrySlug: schema.entries.slug,
      status: schema.pendingEdits.status,
      createdAt: schema.pendingEdits.createdAt,
      reviewedAt: schema.pendingEdits.reviewedAt,
      reviewNote: schema.pendingEdits.reviewNote,
    })
    .from(schema.pendingEdits)
    .innerJoin(schema.entries, eq(schema.entries.id, schema.pendingEdits.entryId))
    // Their own proposal, but only while they can still see the entry.
    .where(and(eq(schema.pendingEdits.proposedBy, userId), visibleEntryCondition({ id: userId, isKeeper: false })))
    .orderBy(desc(schema.pendingEdits.createdAt))
    .limit(limit)
    .all() as MyProposal[];
}
