import { viewerCanEdit } from '@/lib/access';
import { requireAuthorOrFirstCharacter } from '@/lib/auth/author';
import { requireUser } from '@/lib/auth/session';
import { apiError, json } from '@/lib/api';
import { addEntryToCase, getCaseById, getCaseBySlug } from '@/lib/cases/service';
import { createEntry, getEntryType } from '@/lib/entries/service';
import { keeperOnlyForNew, placeNewOnSide } from '@/lib/keeper/side';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    /*
     * §18b: a player who has not said who they are writing as does not write —
     * with one exception, and this route is it. Somebody who holds no
     * onderzoeker at all is here to make the artikel that will become their
     * first one, and there is no other road to it. The moment they have one
     * this is gated like everything else.
     */
    requireAuthorOrFirstCharacter(user);
    const body = (await request.json()) as {
      typeSlug?: string;
      name?: string;
      shortDescription?: string;
      tags?: string[];
      /** §24: the dossier this is being made in, when it is. */
      caseId?: string;
      /**
       * §49: does it wear that dossier's name in front of its own? The sheet's
       * tickbox; absent means "whatever this soort's habit is" (`prefixDefault`).
       */
      casePrefix?: boolean;
      /**
       * §48: which side it is born on. Only a Keeper is heard; and a soort
       * made inside a Keeper-only dossier is the Keeper's whatever this says.
       */
      keeperOnly?: boolean;
    };

    if (!body.name?.trim()) return json({ error: 'Geef het artikel eerst een naam.' }, { status: 400 });

    const typeSlug = body.typeSlug || 'character';
    const type = getEntryType(typeSlug);
    if (!type) return json({ error: 'Onbekende soort artikel.' }, { status: 400 });

    /*
     * §24/§49: a dossier is no longer required by any soort — it is required to
     * be one this person may actually write in. `originCaseId` is the dossier it
     * was *made in*, and since §49 that is not a question the sheet asks: made
     * in a dossier is filed in it, full stop. What the sheet does ask is whether
     * the dossier's name goes in front of the artikel's, which is `casePrefix`
     * and is only about the printing.
     */
    let originCaseId: string | null = null;
    if (body.caseId) {
      const parent = getCaseById(body.caseId);
      if (!parent || !getCaseBySlug(parent.slug, user)) {
        return json({ error: 'Dossier niet gevonden.' }, { status: 404 });
      }
      if (!viewerCanEdit('case', body.caseId, user)) {
        return json({ error: 'Je mag dit dossier niet bewerken.' }, { status: 403 });
      }
      originCaseId = parent.id;
    }
    const entry = createEntry({
      typeSlug,
      name: body.name,
      shortDescription: body.shortDescription ?? '',
      tags: body.tags ?? [],
      createdBy: user.id,
      // §18b: made *as* somebody — recorded on the artikel's first revision.
      characterId: user.characterId,
      originCaseId,
      // §49: the tickbox, or the soort's own habit when the caller says nothing.
      casePrefix: typeof body.casePrefix === 'boolean' ? body.casePrefix : undefined,
    });

    /*
     * §48: born on the side the hand is standing on. Written straight after
     * the insert, in the same request, so nothing can read the row in between.
     */
    const keeperOnly = keeperOnlyForNew(
      user,
      originCaseId ? { kind: 'case', id: originCaseId } : null,
      body.keeperOnly,
    );
    placeNewOnSide('entry', entry.id, keeperOnly, user.id);

    if (originCaseId) addEntryToCase(originCaseId, entry.id, user);

    /*
     * §48: `filed` is what the sheet tells the text it came from — an artikel
     * that is already on the dossier's shelves must not then be *asked* about.
     * §49: and it is now always true when there was a dossier at all, because
     * "made in it" *is* "filed in it" — the sheet has no tickbox for that any
     * more, only for whether the dossier's name is printed.
     */
    return json({
      entry: { ...entry, visibility: keeperOnly ? 'keeper' : entry.visibility },
      filed: Boolean(originCaseId),
    });
  } catch (err) {
    return apiError(err);
  }
}
