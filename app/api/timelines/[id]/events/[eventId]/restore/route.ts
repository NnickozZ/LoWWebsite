import { requireAuthor } from '@/lib/auth/author';
import { requireUser } from '@/lib/auth/session';
import { apiError, json } from '@/lib/api';
import { getEvent, restoreEvent } from '@/lib/timelines/service';

export const dynamic = 'force-dynamic';

/**
 * §69: put back the gebeurtenis this hand just took off the axis. The sibling
 * of the landkaart's restore road — see that file for why it is a POST and why
 * a swept row answers 410 rather than 404.
 */
export async function POST(_request: Request, ctx: { params: Promise<{ id: string; eventId: string }> }) {
  try {
    const user = await requireUser();
    // §18b: a player who has not said who they are writing as does not write.
    requireAuthor(user);
    const { eventId } = await ctx.params;
    if (!restoreEvent(eventId, user)) {
      return json({ error: 'Die gebeurtenis is er niet meer om terug te zetten.' }, { status: 410 });
    }
    return json({ event: getEvent(eventId, user) });
  } catch (err) {
    return apiError(err);
  }
}
