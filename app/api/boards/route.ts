import { viewerCanEdit } from '@/lib/access';
import { requireUser } from '@/lib/auth/session';
import { apiError, json } from '@/lib/api';
import { createBoard, listBoards } from '@/lib/boards/service';
import { getCaseById, getCaseBySlug } from '@/lib/cases/service';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const user = await requireUser();
    return json({ boards: listBoards(user) });
  } catch (err) {
    return apiError(err);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const body = (await request.json()) as {
      name?: string;
      caseId?: string;
      /** §17: "Privé prikbord" — both dials private from the first second. */
      isPrivate?: boolean;
    };

    let name = body.name?.trim() ?? '';
    if (body.caseId) {
      const parent = getCaseById(body.caseId);
      if (!parent || !getCaseBySlug(parent.slug, user)) {
        return json({ error: 'Dossier niet gevonden.' }, { status: 404 });
      }
      // §17: hanging a board on a case is editing the case.
      if (!viewerCanEdit('case', body.caseId, user)) {
        return json({ error: 'Je mag dit dossier niet bewerken.' }, { status: 403 });
      }
      // §7: a new board inside a case is named after the case.
      if (!name) name = parent.name;
    }

    const board = createBoard({
      name: name || 'Naamloos prikbord',
      caseId: body.caseId ?? null,
      createdBy: user.id,
      isPrivate: body.isPrivate === true,
    });
    return json({ board });
  } catch (err) {
    return apiError(err);
  }
}
