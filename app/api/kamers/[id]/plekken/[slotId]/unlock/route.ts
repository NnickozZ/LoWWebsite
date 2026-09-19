import { requireUser } from '@/lib/auth/session';
import { apiError, json } from '@/lib/api';
import { KamerError, unlockSlot } from '@/lib/kamers/service';

export const dynamic = 'force-dynamic';

/**
 * §79: open a plek.
 *
 * The rights, the price and the double-click guard are all `unlockSlot`'s — the
 * guard is a condition of its UPDATE, so this route may be called twice by an
 * impatient hand and only one plek is ever paid for. Nothing is re-checked
 * here, because a second copy of the rule is a second answer to it.
 *
 * `[id]` is the kamer, and it is the address rather than an argument: the slot
 * knows which kamer it is in, and asking the route to agree with it would be a
 * third opinion. (`app/api/maps/[id]/pins/[pinId]/restore` does the same.)
 */
export async function POST(_request: Request, ctx: { params: Promise<{ id: string; slotId: string }> }) {
  try {
    const user = await requireUser();
    const { slotId } = await ctx.params;
    return json(unlockSlot(slotId, user));
  } catch (err) {
    // Every refusal in `lib/kamers` is a sentence somebody is meant to read.
    if (err instanceof KamerError) return json({ error: err.message }, { status: 400 });
    return apiError(err);
  }
}
