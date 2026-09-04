'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth/session';
import {
  getEntrySummaryById,
  restoreEntry,
  restoreRevision,
  softDeleteEntry,
} from '@/lib/entries/service';

export async function restoreRevisionAction(formData: FormData) {
  const user = await requireUser();
  const revisionId = String(formData.get('revisionId') ?? '');
  const entryId = restoreRevision(revisionId, user);
  const entry = getEntrySummaryById(entryId);
  revalidatePath(`/e/${entry?.slug ?? ''}`);
  redirect(`/e/${entry?.slug ?? ''}`);
}

export async function deleteEntryAction(formData: FormData) {
  const user = await requireUser();
  const entryId = String(formData.get('entryId') ?? '');
  softDeleteEntry(entryId, user.id);
  revalidatePath('/wiki');
  redirect('/wiki?deleted=1');
}

export async function restoreEntryAction(formData: FormData) {
  const user = await requireUser();
  const entryId = String(formData.get('entryId') ?? '');
  restoreEntry(entryId, user.id);
  const entry = getEntrySummaryById(entryId);
  redirect(`/e/${entry?.slug ?? ''}`);
}
