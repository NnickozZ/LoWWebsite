import { viewerCanEdit } from '@/lib/access';
import { requireAuthorOrFirstCharacter } from '@/lib/auth/author';
import { requireUser } from '@/lib/auth/session';
import { apiError, json } from '@/lib/api';
import { addEntryToCase, getCaseById, getCaseBySlug } from '@/lib/cases/service';
import { createEntry, getEntryType } from '@/lib/entries/service';

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

    if (originCaseId) addEntryToCase(originCaseId, entry.id, user);

    return json({ entry });
  } catch (err) {
    return apiError(err);
  }
}
