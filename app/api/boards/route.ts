import { viewerCanEdit } from '@/lib/access';
import { requireAuthor } from '@/lib/auth/author';
import { requireUser } from '@/lib/auth/session';
import { apiError, json } from '@/lib/api';
import { createBoard, listBoards } from '@/lib/boards/service';
import { keeperOnlyForNew, placeNewOnSide } from '@/lib/keeper/side';
import { caseIdsHoldingEntry, getCaseById, getCaseBySlug } from '@/lib/cases/service';

export const dynamic = 'force-dynamic';

/**
 * Every board this viewer may open.
 *
 * With `?forEntry=<id>` each board also says whether its case already holds
 * that entry, and whether this viewer may file anything in it — which is what
 * lets "Op het prikbord" ask "…and in the dossier too?" the moment the card
 * lands, instead of a round trip per board or a question nobody may answer.
 */
export async function GET(request: Request) {
  try {
    const user = await requireUser();
    // §46: `bothSides`, because this list is a picker — "Op het prikbord"
    // offers every wall the reader may open, on either side of the archive.
    const boards = listBoards(user, { bothSides: true });

    const forEntry = new URL(request.url).searchParams.get('forEntry');
    if (!forEntry) return json({ boards });

    const holding = caseIdsHoldingEntry(forEntry);
    return json({
      boards: boards.map((board) => ({
        ...board,
        // No case behind the board is nothing to file into, which reads the
        // same to the caller as "already filed": there is no question to ask.
        caseHasEntry: board.caseId ? holding.has(board.caseId) : true,
        caseEditable: board.caseId ? viewerCanEdit('case', board.caseId, user) : false,
      })),
    });
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
      caseId?: string;
      /** §17: "Privé prikbord" — both dials private from the first second. */
      isPrivate?: boolean;
      /** §48: which side it is born on; a wall in a Keeper's dossier is his anyway. */
      keeperOnly?: boolean;
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
      // §18b: hung *as* somebody.
      characterId: user.characterId,
      isPrivate: body.isPrivate === true,
    });
    // §48: born on the side the hand is standing on — and always the
    // Keeper's when the dossier it is hung in is.
    const keeperOnly = keeperOnlyForNew(
      user,
      body.caseId ? { kind: 'case', id: body.caseId } : null,
      body.keeperOnly,
    );
    placeNewOnSide('board', board.id, keeperOnly, user.id);

    return json({ board });
  } catch (err) {
    return apiError(err);
  }
}
