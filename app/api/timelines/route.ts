import { viewerCanEdit } from '@/lib/access';
import { requireAuthor } from '@/lib/auth/author';
import { requireUser } from '@/lib/auth/session';
import { apiError, json } from '@/lib/api';
import { getCaseById, getCaseBySlug } from '@/lib/cases/service';
import { isAnchorUnit, isScale } from '@/lib/timelines/time';
import { createTimeline, listTimelines } from '@/lib/timelines/service';
import { keeperOnlyForNew, placeNewOnSide } from '@/lib/keeper/side';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const user = await requireUser();
    // §50 (reverses §46's `bothSides` here): sided. Since the wissel, the
    // browser always stands on the side of the page that is asking, so a
    // picker offering "this side" offers exactly what may be attached — and a
    // reference across the border is refused on the server anyway (`sameSide`).
    return json({ timelines: listTimelines(user) });
  } catch (err) {
    return apiError(err);
  }
}

/** §32: anyone signed in makes a tijdlijn — loose, or inside a dossier they may edit. */
export async function POST(request: Request) {
  try {
    const user = await requireUser();
    // §18b: a player who has not said who they are writing as does not write.
    requireAuthor(user);
    const body = (await request.json()) as {
      name?: string;
      caseId?: string;
      scale?: unknown;
      description?: string;
      /** §17: "Privé tijdlijn" — both dials private from the first second. */
      isPrivate?: boolean;
      /** §48: which side it is born on; one in a Keeper's dossier is his anyway. */
      keeperOnly?: boolean;
      /** §35: a tijdlijn that is *of* one day, said at the moment it is made. */
      anchorAt?: unknown;
      anchorUnit?: unknown;
    };

    let name = body.name?.trim() ?? '';
    if (body.caseId) {
      const parent = getCaseById(body.caseId);
      if (!parent || !getCaseBySlug(parent.slug, user)) {
        return json({ error: 'Dossier niet gevonden.' }, { status: 404 });
      }
      // §17: hanging a tijdlijn in a dossier is editing the dossier.
      if (!viewerCanEdit('case', body.caseId, user)) {
        return json({ error: 'Je mag dit dossier niet bewerken.' }, { status: 403 });
      }
      if (!name) name = parent.name;
    }

    const timeline = createTimeline(
      {
        name: name || 'Naamloze tijdlijn',
        caseId: body.caseId ?? null,
        scale: isScale(body.scale) ? body.scale : 'day',
        description: typeof body.description === 'string' ? body.description : '',
        isPrivate: body.isPrivate === true,
        anchorAt: typeof body.anchorAt === 'number' ? body.anchorAt : null,
        anchorUnit: isAnchorUnit(body.anchorUnit) ? body.anchorUnit : null,
      },
      user,
    );
    // §48: born on the side the hand is standing on.
    const keeperOnly = keeperOnlyForNew(
      user,
      body.caseId ? { kind: 'case', id: body.caseId } : null,
      body.keeperOnly,
    );
    placeNewOnSide('timeline', timeline.id, keeperOnly, user.id);

    return json({ timeline });
  } catch (err) {
    return apiError(err);
  }
}
