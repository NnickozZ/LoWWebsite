import { and, desc, eq } from 'drizzle-orm';
import { db, schema } from '@/lib/db';
import { docToText } from '@/lib/entries/doc';
import { logActivity, logAudit, updateEntry, type EntryPatch } from '@/lib/entries/service';
import { visibleEntryCondition } from '@/lib/entries/visibility';

/**
 * §10: a player's edit to a locked entry lands in `pending_edits` instead of on
 * the entry. This is the Keeper's side of that: what is waiting, what it would
 * change, and approving or rejecting it with a note back to the author.
 */

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
  proposedByName: string | null;
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

export function listPendingEdits(): PendingEdit[] {
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
    })
    .from(schema.pendingEdits)
    .innerJoin(schema.entries, eq(schema.entries.id, schema.pendingEdits.entryId))
    .leftJoin(schema.users, eq(schema.users.id, schema.pendingEdits.proposedBy))
    .where(eq(schema.pendingEdits.status, 'pending'))
    .orderBy(desc(schema.pendingEdits.createdAt))
    .all();

  return rows.map((row) => {
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
      proposedByName: row.proposedByName,
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
 * Approving applies the proposal as the Keeper, which is what makes it land on
 * a locked entry at all — `updateEntry` would otherwise queue it again.
 */
export function approvePendingEdit(
  pendingId: string,
  keeper: { id: string; isKeeper: boolean },
  note = '',
) {
  const row = db
    .select()
    .from(schema.pendingEdits)
    .where(eq(schema.pendingEdits.id, pendingId))
    .get();
  if (!row || row.status !== 'pending') throw new Error('Voorstel niet gevonden');

  const snapshot = (row.proposedSnapshot ?? {}) as Record<string, unknown>;
  const patch = Object.fromEntries(
    Object.entries(snapshot).filter(([key]) => key in FIELD_LABELS),
  ) as EntryPatch;
  updateEntry(row.entryId, patch, keeper);

  db.update(schema.pendingEdits)
    .set({
      status: 'approved',
      reviewedBy: keeper.id,
      reviewedAt: Math.floor(Date.now() / 1000),
      reviewNote: note.slice(0, 500),
    })
    .where(eq(schema.pendingEdits.id, pendingId))
    .run();

  logActivity({ actorId: keeper.id, verb: 'entry.edit_approved', entryId: row.entryId });
  logAudit({
    actorId: keeper.id,
    action: 'pending_edit.approved',
    targetType: 'entry',
    targetId: row.entryId,
    meta: { proposedBy: row.proposedBy, note },
  });
}

export function rejectPendingEdit(pendingId: string, keeperId: string, note = '') {
  const row = db
    .select()
    .from(schema.pendingEdits)
    .where(eq(schema.pendingEdits.id, pendingId))
    .get();
  if (!row || row.status !== 'pending') return;

  db.update(schema.pendingEdits)
    .set({
      status: 'rejected',
      reviewedBy: keeperId,
      reviewedAt: Math.floor(Date.now() / 1000),
      reviewNote: note.slice(0, 500),
    })
    .where(eq(schema.pendingEdits.id, pendingId))
    .run();

  logAudit({
    actorId: keeperId,
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
