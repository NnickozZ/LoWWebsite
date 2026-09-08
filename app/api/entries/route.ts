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
     * §24: a soort that only exists inside a dossier needs one, and needs one
     * this person may actually write in. Checked here and not only in the sheet:
     * the sheet leaves those soorten out, which is a courtesy, and this is the
     * rule. `originCaseId` is the dossier it was *made in* — it is also filed
     * there straight away, which is what the dossier's own add-box would have
     * done a moment later anyway.
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
    if (type.caseOnly && !originCaseId) {
      return json({ error: `${type.label} maak je in een dossier.` }, { status: 400 });
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
     * A dossier reaches this route only when the person meant it to be filed
     * there: the sheet leaves `caseId` out when the box is unticked, so "made
     * in it" and "filed in it" stay the same fact (§24).
     */
    return json({
      entry: { ...entry, visibility: keeperOnly ? 'keeper' : entry.visibility },
      filed: Boolean(originCaseId),
    });
  } catch (err) {
    return apiError(err);
  }
}
