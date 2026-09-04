import { requireUser } from '@/lib/auth/session';
import { apiError, json } from '@/lib/api';
import { createCase, listCases } from '@/lib/cases/service';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const user = await requireUser();
    return json({ cases: listCases(user) });
  } catch (err) {
    return apiError(err);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const body = (await request.json()) as { name?: string; summary?: string };
    if (!body.name?.trim()) return json({ error: 'Geef het dossier eerst een naam.' }, { status: 400 });

    const created = createCase({
      name: body.name,
      summary: body.summary ?? '',
      createdBy: user.id,
    });
    return json({ case: created });
  } catch (err) {
    return apiError(err);
  }
}
