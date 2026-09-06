'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireAuthor } from '@/lib/auth/author';
import { requireUser } from '@/lib/auth/session';
import {
  getEntrySummaryById,
  restoreEntry,
  restoreRevision,
  softDeleteEntry,
} from '@/lib/entries/service';

export async function restoreRevisionAction(formData: FormData) {
  const user = await requireUser();
  // §18b: a player who has not said who they are writing as does not write.
  requireAuthor(user);
  const revisionId = String(formData.get('revisionId') ?? '');
  const entryId = restoreRevision(revisionId, user);
  const entry = getEntrySummaryById(entryId);
  revalidatePath(`/e/${entry?.slug ?? ''}`);
  redirect(`/e/${entry?.slug ?? ''}`);
}

export async function deleteEntryAction(formData: FormData) {
  const user = await requireUser();
  // §18b: a player who has not said who they are writing as does not write.
  requireAuthor(user);
  const entryId = String(formData.get('entryId') ?? '');
  softDeleteEntry(entryId, user);
  revalidatePath('/wiki');
  redirect('/wiki?deleted=1');
}

export async function restoreEntryAction(formData: FormData) {
  const user = await requireUser();
  // §18b: a player who has not said who they are writing as does not write.
  requireAuthor(user);
  const entryId = String(formData.get('entryId') ?? '');
  restoreEntry(entryId, user);
  const entry = getEntrySummaryById(entryId);
  redirect(`/e/${entry?.slug ?? ''}`);
}
