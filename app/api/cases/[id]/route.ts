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

export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await ctx.params;
    assertVisible(id, user);

    const patch = (await request.json()) as CasePatch;
    return json({ case: updateCase(id, patch, user) });
  } catch (err) {
    return apiError(err);
  }
}
