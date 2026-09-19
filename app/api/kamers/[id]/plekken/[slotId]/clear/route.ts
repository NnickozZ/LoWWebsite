import { requireUser } from '@/lib/auth/session';
import { apiError, json } from '@/lib/api';
import { clearSlot, KamerError } from '@/lib/kamers/service';

export const dynamic = 'force-dynamic';

/**
 * §79: take something off the shelf again.
 *
 * A POST rather than a DELETE: nothing is deleted. The voorwerp is an artikel
 * and goes on existing; what ends is that it lies here. And there is no refund
 * — see `clearSlot`'s docblock for why that is a decision and not an omission.
 */
export async function POST(_request: Request, ctx: { params: Promise<{ id: string; slotId: string }> }) {
  try {
    const user = await requireUser();
    const { slotId } = await ctx.params;
    clearSlot(slotId, user);
    return json({ ok: true });
  } catch (err) {
    if (err instanceof KamerError) return json({ error: err.message }, { status: 400 });
    return apiError(err);
  }
}
