import { requireUser } from '@/lib/auth/session';
import { apiError, json } from '@/lib/api';
import { KamerError, placeItem } from '@/lib/kamers/service';

export const dynamic = 'force-dynamic';

/**
 * §79: put a voorwerp in a plek.
 *
 * Four refusals live in `placeItem` — a plek still on slot, an artikel that is
 * not a voorwerp or wants another kind of plek, one this hand may not see, and
 * one already lying somewhere else in this kamer — and every one of them
 * arrives here as a `KamerError` with the sentence to show. The picker in front
 * of this route offers only what fits (`../../../voorwerpen`), which is a
 * courtesy, not the rule.
 */
export async function POST(request: Request, ctx: { params: Promise<{ id: string; slotId: string }> }) {
  try {
    const user = await requireUser();
    const { slotId } = await ctx.params;
    const body = (await request.json()) as { entryId?: unknown };
    placeItem(slotId, String(body.entryId ?? ''), user);
    return json({ ok: true });
  } catch (err) {
    if (err instanceof KamerError) return json({ error: err.message }, { status: 400 });
    return apiError(err);
  }
}
