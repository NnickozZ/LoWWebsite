'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { viewerCanEdit } from '@/lib/access';
import { requireAuthor } from '@/lib/auth/author';
import { requireUser } from '@/lib/auth/session';
import { getCaseById, getCaseBySlug, softDeleteCase } from '@/lib/cases/service';

/**
 * §11: a dossier into the bin.
 *
 * `softDeleteCase` has existed since the dossiers did, but nothing ever called
 * it: a dossier opened by mistake could be emptied and renamed, never put away.
 * The bin lists dossiers, and now something can put one in it.
 *
 * Soft, like everything else — a Keeper can put it back, or (§11, this round)
 * destroy it for good from Beheer → Prullenbak after typing its name.
 */
export async function deleteCaseAction(formData: FormData) {
  const user = await requireUser();
  // §18b: a player who has not said who they are writing as does not write.
  requireAuthor(user);
  const caseId = String(formData.get('caseId') ?? '');

  // The same two checks every write to a dossier makes: it has to exist, this
  // viewer has to be allowed to see it, and they have to be allowed to change it.
  const summary = getCaseById(caseId);
  if (!summary || !getCaseBySlug(summary.slug, user)) throw new Error('Dossier niet gevonden');
  if (!viewerCanEdit('case', caseId, user)) throw new Error('Je mag dit dossier niet bewerken.');

  softDeleteCase(caseId, user);
  revalidatePath('/cases');
  redirect('/cases');
}
