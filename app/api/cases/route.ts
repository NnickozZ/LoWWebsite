import { requireAuthor } from '@/lib/auth/author';
import { requireUser } from '@/lib/auth/session';
import { apiError, json } from '@/lib/api';
import { createCase, listCases } from '@/lib/cases/service';
import { keeperOnlyForNew, placeNewOnSide } from '@/lib/keeper/side';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const user = await requireUser();
    // §50 (reverses §46's `bothSides` here): sided. Since the wissel, the
    // browser always stands on the side of the page that is asking, so a
    // picker offering "this side" offers exactly what may be attached — and a
    // reference across the border is refused on the server anyway (`sameSide`).
    return json({ cases: listCases(user) });
  } catch (err) {
    return apiError(err);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    // §18b: a player who has not said who they are writing as does not write.
    requireAuthor(user);
    const body = (await request.json()) as { name?: string; summary?: string; keeperOnly?: boolean };
    if (!body.name?.trim()) return json({ error: 'Geef het dossier eerst een naam.' }, { status: 400 });

    const created = createCase({
      name: body.name,
      summary: body.summary ?? '',
      createdBy: user.id,
      // §18b: opened *as* somebody — recorded on the dossier's first revision.
      characterId: user.characterId,
    });
    // §48: born on the side the hand is standing on.
    const keeperOnly = keeperOnlyForNew(user, null, body.keeperOnly);
    placeNewOnSide('case', created.id, keeperOnly, user.id);

    return json({ case: { ...created, keeperOnly } });
  } catch (err) {
    return apiError(err);
  }
}
