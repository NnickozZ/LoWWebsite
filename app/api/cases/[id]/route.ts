import { viewerCanEdit } from '@/lib/access';
import { requireUser } from '@/lib/auth/session';
import { apiError, json } from '@/lib/api';
import { getCaseById, getCaseBySlug, updateCase, type CasePatch } from '@/lib/cases/service';

export const dynamic = 'force-dynamic';

/** Guards that this viewer may see the case before anything is written to it. */
function assertVisible(id: string, viewer: { id: string; isKeeper: boolean }) {
  const summary = getCaseById(id);
  if (!summary) throw new Error('Dossier niet gevonden');
  if (!getCaseBySlug(summary.slug, viewer)) throw new Error('Dossier niet gevonden');
  return summary;
}

/** §17: seeing a case and changing it are two different rights. */
function assertEditable(id: string, viewer: { id: string; isKeeper: boolean }) {
  assertVisible(id, viewer);
  if (!viewerCanEdit('case', id, viewer)) throw new Error('Je mag dit dossier niet bewerken.');
}

export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await ctx.params;
    assertEditable(id, user);

    const patch = (await request.json()) as CasePatch;
    return json({ case: updateCase(id, patch, user) });
  } catch (err) {
    return apiError(err);
  }
}
