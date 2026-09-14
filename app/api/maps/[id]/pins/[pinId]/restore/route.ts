import { requireAuthor } from '@/lib/auth/author';
import { requireUser } from '@/lib/auth/session';
import { apiError, json } from '@/lib/api';
import { getPin, restorePin } from '@/lib/maps/service';

export const dynamic = 'force-dynamic';

/**
 * §69: put back the speld this hand just took off.
 *
 * The road behind the *Ongedaan maken* in the toast. It is a POST rather than
 * a second meaning for PATCH because it is not a change to a speld — it is the
 * speld coming back, and until it does there is nothing for a PATCH to be
 * about (every read filters a buried row, `livePinCondition`).
 *
 * The rights are `restorePin`'s and they are the ones that took it off: a
 * landkaart this hand may see, and a speld that is theirs or a Keeper's.
 *
 * 410 rather than 404 when there is nothing to put back — swept after a day
 * (`sweepDeletedRows`), or destroyed with its landkaart. "Gone" and "never
 * existed" are different things to the person looking at the toast, and this
 * is the one place in the archive where saying so gives nothing away: they
 * held it in their hand a moment ago.
 */
export async function POST(_request: Request, ctx: { params: Promise<{ id: string; pinId: string }> }) {
  try {
    const user = await requireUser();
    // §18b: a player who has not said who they are writing as does not write.
    requireAuthor(user);
    const { pinId } = await ctx.params;
    if (!restorePin(pinId, user)) {
      return json({ error: 'Die speld is er niet meer om terug te zetten.' }, { status: 410 });
    }
    return json({ pin: getPin(pinId, user) });
  } catch (err) {
    return apiError(err);
  }
}
