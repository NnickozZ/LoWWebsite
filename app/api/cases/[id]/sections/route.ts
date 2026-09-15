import { requireAuthor } from '@/lib/auth/author';
import { requireUser } from '@/lib/auth/session';
import { apiError, json } from '@/lib/api';
import { getCaseById, getCaseBySlug } from '@/lib/cases/service';
import { canEditSections, createSection } from '@/lib/sections/service';

export const dynamic = 'force-dynamic';

/**
 * §70: a dossier carries secties too, under its Dossiernotities — Nick's
 * "just like in articles". The shape is the artikel's route beside this one,
 * and the rights are the dossier's own: seeing it and changing it are two
 * different questions (§17), asked here in that order, the way
 * `app/api/cases/[id]/route.ts` asks them.
 */
export async function POST(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    // §18b: a player who has not said who they are writing as does not write.
    requireAuthor(user);
    const { id } = await ctx.params;

    // A lookup by id and then by slug for this viewer — the same two steps the
    // dossier's own PATCH takes, so "not for you" reads as "not there" (§46).
    const summary = getCaseById(id);
    if (!summary || !getCaseBySlug(summary.slug, user)) {
      return json({ error: 'Dossier niet gevonden.' }, { status: 404 });
    }
    if (!canEditSections('case', id, user)) {
      return json({ error: 'Je mag dit dossier niet bewerken.' }, { status: 403 });
    }

    return json({
      sectionId: createSection('case', id, {
        id: user.id,
        isKeeper: user.isKeeper,
        characterId: user.characterId,
      }),
    });
  } catch (err) {
    return apiError(err);
  }
}
