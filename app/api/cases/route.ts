import { requireAuthor } from '@/lib/auth/author';
import { requireUser } from '@/lib/auth/session';
import { apiError, json } from '@/lib/api';
import { createCase, listCases } from '@/lib/cases/service';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const user = await requireUser();
    // §46: `bothSides`, because this list is a picker — "In het dossier"
    // offers every dossier the reader may open, on either side of the archive.
    return json({ cases: listCases(user, { bothSides: true }) });
  } catch (err) {
    return apiError(err);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    // §18b: a player who has not said who they are writing as does not write.
    requireAuthor(user);
    const body = (await request.json()) as { name?: string; summary?: string };
    if (!body.name?.trim()) return json({ error: 'Geef het dossier eerst een naam.' }, { status: 400 });

    const created = createCase({
      name: body.name,
      summary: body.summary ?? '',
      createdBy: user.id,
      // §18b: opened *as* somebody — recorded on the dossier's first revision.
      characterId: user.characterId,
    });
    return json({ case: created });
  } catch (err) {
    return apiError(err);
  }
}
