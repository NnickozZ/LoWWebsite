import { requireAuthor } from '@/lib/auth/author';
import { requireUser } from '@/lib/auth/session';
import { apiError, json } from '@/lib/api';
import { getEntryFieldsForViewer } from '@/lib/entries/service';
import { canEditSections, createSection } from '@/lib/sections/service';

export const dynamic = 'force-dynamic';

/**
 * §70: anyone who may edit the artikel may add a sectie to it — a player who
 * has just been somewhere writes down what it turned up without overwriting
 * what the last onderzoek found. What the new sectie is *for* is decided in
 * `startingVisibility`: a Keeper is preparing (keeper-only), anybody else is
 * writing in the open (everyone), because a player has no dial to turn it on
 * with afterwards.
 */
export async function POST(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    // §18b: a player who has not said who they are writing as does not write.
    requireAuthor(user);
    const { id } = await ctx.params;

    // A lookup, not a list (§46) — and it is the visibility check as well: a
    // sectie may not be hung on an artikel this hand cannot see.
    if (!getEntryFieldsForViewer(id, user)) {
      return json({ error: 'Artikel niet gevonden.' }, { status: 404 });
    }
    if (!canEditSections('entry', id, user)) {
      return json({ error: 'Je mag dit artikel niet bewerken.' }, { status: 403 });
    }

    return json({
      sectionId: createSection('entry', id, {
        id: user.id,
        isKeeper: user.isKeeper,
        characterId: user.characterId,
      }),
    });
  } catch (err) {
    return apiError(err);
  }
}
