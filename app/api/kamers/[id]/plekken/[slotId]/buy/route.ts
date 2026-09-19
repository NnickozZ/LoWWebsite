import { requireUser } from '@/lib/auth/session';
import { apiError, json } from '@/lib/api';
import { buyFurnishing, KamerError } from '@/lib/kamers/service';

export const dynamic = 'force-dynamic';

/**
 * §80: iets uit de catalogus kopen en het meteen neerleggen.
 *
 * Exactly the shape of `unlock` and `place` next door, and for the same
 * reason: every rule this write has — mag deze hand deze kamer inrichten, is
 * de plek open, ligt er al iets, hoort het ding op deze soort plek, staat er
 * een prijs op, is het saldo genoeg, ligt het al ergens anders — lives in
 * `buyFurnishing`, and a second copy here would be a second answer to the
 * same question. The guard against a double click is a condition of that
 * function's UPDATE, so this route may be called twice by an impatient hand
 * and only one stoel is ever paid for.
 *
 * `[id]` is the kamer and is the address rather than an argument: the plek
 * knows which kamer it is in (see the `unlock` route's docblock).
 */
export async function POST(request: Request, ctx: { params: Promise<{ id: string; slotId: string }> }) {
  try {
    const user = await requireUser();
    const { slotId } = await ctx.params;
    const body = (await request.json().catch(() => ({}))) as { entryId?: unknown };
    return json(buyFurnishing(slotId, String(body.entryId ?? ''), user));
  } catch (err) {
    // Every refusal in `lib/kamers` is a sentence somebody is meant to read.
    if (err instanceof KamerError) return json({ error: err.message }, { status: 400 });
    return apiError(err);
  }
}
