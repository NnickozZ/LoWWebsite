import { requireAuthor } from '@/lib/auth/author';
import { requireUser } from '@/lib/auth/session';
import { apiError, json } from '@/lib/api';
import { getOverzicht } from '@/lib/overzichten/service';
import { snapshot } from '@/lib/live/docs';
import { admit, sectionRoomKey } from '@/lib/live/rooms';
import { canEditSections, createSection } from '@/lib/sections/service';

export const dynamic = 'force-dynamic';

/**
 * §75 on §70's road: an overzicht's body *is* its secties, so this is the third
 * copy of the same twelve lines the artikel and the dossier already have — and
 * deliberately a copy rather than a shared handler, because each of the three
 * asks a different question first ("may I see this thing?") and that question
 * is the one that must never be got wrong.
 *
 * What a new sectie starts as is `startingVisibility`'s, unchanged: a Keeper is
 * preparing, anybody else is writing in the open.
 */
export async function POST(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    // §18b: a player who has not said who they are writing as does not write.
    requireAuthor(user);
    const { id } = await ctx.params;

    // §46: a lookup, so no side filter — and it is the visibility check too.
    if (!getOverzicht(id, user)) {
      return json({ error: 'Overzicht niet gevonden.' }, { status: 404 });
    }
    if (!canEditSections('overzicht', id, user)) {
      return json({ error: 'Je mag dit overzicht niet bewerken.' }, { status: 403 });
    }

    const sectionId = createSection('overzicht', id, {
      id: user.id,
      isKeeper: user.isKeeper,
      characterId: user.characterId,
    });
    // §20: with its own room, or the browser draws a plain editor for it until
    // the next F5 — the text saves and nobody else sees it move.
    const admission = admit(sectionRoomKey(sectionId), user);
    return json({
      sectionId,
      live: admission
        ? { room: admission.spec.key, state: snapshot(admission.spec).state, canEdit: admission.canEdit }
        : null,
    });
  } catch (err) {
    return apiError(err);
  }
}
