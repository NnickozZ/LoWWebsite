'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireAuthor } from '@/lib/auth/author';
import { requireUser } from '@/lib/auth/session';
import { getEntrySummaryById, restoreRevision, softDeleteEntry } from '@/lib/entries/service';

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
  // §75: de lijst waar dit artikel uit verdwijnt is /wiki/alles; op /wiki
  // staat sinds ronde 38 de voordeur, waar geen artikel in staat.
  revalidatePath('/wiki/alles');
  redirect('/wiki/alles?deleted=1');
}

/*
 * §89: `restoreEntryAction` used to live here — exported, imported by nothing,
 * and with no rights check: any speler with a karakter could post it and take
 * any artikel out of the prullenbak. An exported server action is an endpoint
 * whether or not a button calls it. The prullenbak is the Keeper's (rule 11)
 * and Beheer → Prullenbak (`restoreAction` → `restoreFromTrash`) is its one
 * road back. `tests/unit/sloten.test.ts` fails if an unused action returns.
 */
