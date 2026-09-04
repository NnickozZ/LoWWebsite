import { requireUser } from '@/lib/auth/session';
import { apiError, json } from '@/lib/api';
import { createEntry } from '@/lib/entries/service';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const body = (await request.json()) as {
      typeSlug?: string;
      name?: string;
      shortDescription?: string;
      tags?: string[];
    };

    if (!body.name?.trim()) return json({ error: 'Geef de fiche eerst een naam.' }, { status: 400 });

    const entry = createEntry({
      typeSlug: body.typeSlug || 'character',
      name: body.name,
      shortDescription: body.shortDescription ?? '',
      tags: body.tags ?? [],
      createdBy: user.id,
    });

    return json({ entry });
  } catch (err) {
    return apiError(err);
  }
}
