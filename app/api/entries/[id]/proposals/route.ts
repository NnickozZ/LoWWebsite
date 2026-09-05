import { requireUser } from '@/lib/auth/session';
import { apiError, json } from '@/lib/api';
import {
  approvePendingEdit,
  canReview,
  listPendingEdits,
  rejectPendingEdit,
} from '@/lib/entries/review';

export const dynamic = 'force-dynamic';

/**
 * §17: the owner's side of the proposal queue, on their own fiche. A Keeper
 * has the whole list in Beheer; an owner only ever sees this one fiche's.
 */
export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await ctx.params;
    if (!canReview(id, user)) return json({ proposals: [] });
    return json({ proposals: listPendingEdits(id) });
  } catch (err) {
    return apiError(err);
  }
}

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await ctx.params;
    if (!canReview(id, user)) {
      return json({ error: 'Alleen de eigenaar of een Keeper beoordeelt dit.' }, { status: 403 });
    }
    const body = (await request.json()) as {
      pendingId?: string;
      decision?: 'approve' | 'reject';
      note?: string;
    };
    if (!body.pendingId) return json({ error: 'Geen voorstel opgegeven.' }, { status: 400 });
    const note = typeof body.note === 'string' ? body.note : '';
    if (body.decision === 'approve') approvePendingEdit(body.pendingId, user, note);
    else if (body.decision === 'reject') rejectPendingEdit(body.pendingId, user, note);
    else return json({ error: 'Onbekend besluit.' }, { status: 400 });
    return json({ ok: true, proposals: listPendingEdits(id) });
  } catch (err) {
    return apiError(err);
  }
}
