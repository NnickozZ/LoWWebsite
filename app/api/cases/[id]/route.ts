import { viewerCanEdit } from '@/lib/access';
import { requireUser } from '@/lib/auth/session';
import { apiError, json } from '@/lib/api';
import {
  getCaseById,
  getCaseBySlug,
  setCaseTabTypes,
  updateCase,
  type CasePatch,
} from '@/lib/cases/service';

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

    const body = (await request.json()) as CasePatch & { tabTypes?: unknown };

    /*
     * §30: which soorten this dossier has tabs for. Its own branch rather than
     * a key on the patch: the shape of the file is not one of its fields, and
     * `setCaseTabTypes` validates the slugs against the soorten that exist
     * instead of trusting whatever arrived. §10 has already answered here —
     * `assertEditable` above is the 403, so the sheet being hidden for a player
     * is a courtesy and this is the rule.
     */
    if ('tabTypes' in body) {
      return json({ case: setCaseTabTypes(id, body.tabTypes) });
    }

    return json({ case: updateCase(id, body, user) });
  } catch (err) {
    return apiError(err);
  }
}
