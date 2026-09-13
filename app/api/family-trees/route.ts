import { viewerCanEdit } from '@/lib/access';
import { apiError, json } from '@/lib/api';
import { requireAuthor } from '@/lib/auth/author';
import { requireUser } from '@/lib/auth/session';
import { getCaseById, getCaseBySlug } from '@/lib/cases/service';
import { createFamilyTree, listFamilyTrees } from '@/lib/families/service';
import { keeperOnlyForNew, placeNewOnSide } from '@/lib/keeper/side';

export const dynamic = 'force-dynamic';

/** §66: every stamboom this viewer may open, on the side they stand on (§50). */
export async function GET() {
  try {
    const user = await requireUser();
    return json({ trees: listFamilyTrees(user) });
  } catch (err) {
    return apiError(err);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    // §18b: a player who has not said who they are writing as does not write.
    requireAuthor(user);
    const body = (await request.json()) as {
      name?: string;
      description?: string;
      caseId?: string;
      /** §17: "Privé stamboom" — both dials private from the first second. */
      isPrivate?: boolean;
      /** §48: which side it is born on; a tree in a Keeper's dossier is theirs anyway. */
      keeperOnly?: boolean;
    };

    let name = body.name?.trim() ?? '';
    if (body.caseId) {
      const parent = getCaseById(body.caseId);
      if (!parent || !getCaseBySlug(parent.slug, user)) {
        return json({ error: 'Dossier niet gevonden.' }, { status: 404 });
      }
      // §17: hanging a stamboom in a dossier is editing the dossier.
      if (!viewerCanEdit('case', body.caseId, user)) {
        return json({ error: 'Je mag dit dossier niet bewerken.' }, { status: 403 });
      }
      // §7: a new stamboom inside a dossier is named after the dossier.
      if (!name) name = parent.name;
    }

    const tree = createFamilyTree(
      {
        name: name || 'Naamloze stamboom',
        description: body.description,
        caseId: body.caseId ?? null,
        isPrivate: body.isPrivate === true,
      },
      user,
    );
    // §48: born on the side the hand is standing on — and always the Keeper's
    // when the dossier it hangs in is.
    const keeperOnly = keeperOnlyForNew(
      user,
      body.caseId ? { kind: 'case', id: body.caseId } : null,
      body.keeperOnly,
    );
    placeNewOnSide('family_tree', tree.id, keeperOnly, user.id);

    return json({ tree });
  } catch (err) {
    return apiError(err);
  }
}
