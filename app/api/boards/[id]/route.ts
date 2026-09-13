import { canManageAccess, grantFor, loadAccessRow, viewerCanEdit } from '@/lib/access';
import { canSeeCase } from '@/lib/cases/visibility';
import { requireAuthor } from '@/lib/auth/author';
import { requireUser } from '@/lib/auth/session';
import { apiError, json } from '@/lib/api';
import { getBoard, renameBoard, saveBoard, setBoardCase, setBoardInWeb, softDeleteBoard } from '@/lib/boards/service';
import { resolveBoardBoards, resolveBoardCases, resolveBoardEntries, resolveBoardMaps, resolveBoardTimelines } from '@/lib/boards/service';
import { publishChange } from '@/lib/boards/live';
import { deletedAtOfCase } from '@/lib/cases/service';
import { cardRef, type BoardPatch, type BoardState } from '@/lib/boards/merge';
import { OTHER_SIDE, sameSide } from '@/lib/keeper/side';
import type { Viewer } from '@/lib/entries/visibility';

export const dynamic = 'force-dynamic';

/**
 * Everything a board's cards point at, looked up for this viewer. Five kinds of
 * card stand for a record — an artikel, a landkaart, a dossier, een tijdlijn and
 * (§52) another prikbord — and each is resolved behind its own visibility rule,
 * so a card whose record this viewer may not see comes back absent and is
 * stamped MISSING on the wall.
 */
function referencesOf(state: BoardState, viewer: Viewer) {
  const ids = { entry: [] as string[], map: [] as string[], case: [] as string[], timeline: [] as string[], board: [] as string[] };
  for (const card of state.cards) {
    const ref = cardRef(card);
    if (ref) ids[ref.kind].push(ref.id);
  }
  return {
    entries: Object.fromEntries(resolveBoardEntries(ids.entry, viewer)),
    maps: Object.fromEntries(resolveBoardMaps(ids.map, viewer)),
    cases: Object.fromEntries(resolveBoardCases(ids.case, viewer)),
    timelines: Object.fromEntries(resolveBoardTimelines(ids.timeline, viewer)),
    boards: Object.fromEntries(resolveBoardBoards(ids.board, viewer)),
  };
}

/**
 * §8, live: the pull half. A client told "the board moved" asks for the board
 * *as it may see it* — a card whose entry is Keeper-only comes back stamped
 * MISSING here exactly as it does everywhere else, which is why the change is
 * never broadcast as a document.
 */
export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await ctx.params;
    const board = getBoard(id, user);
    if (!board) return json({ error: 'Prikbord niet gevonden.' }, { status: 404 });

    return json({
      name: board.name,
      state: board.state,
      ...referencesOf(board.state, user),
      updatedAt: board.updatedAt,
    });
  } catch (err) {
    return apiError(err);
  }
}

/**
 * Autosave. The client sends what it knows plus explicit deletions; the server
 * merges and returns the merged document, which the client reconciles against
 * (§8). Entry facts come back with it so a card another player just added
 * renders immediately, with the same visibility rule as everywhere else.
 */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    // §18b: a player who has not said who they are writing as does not write.
    requireAuthor(user);
    const { id } = await ctx.params;
    const before = getBoard(id, user);
    if (!before) return json({ error: 'Prikbord niet gevonden.' }, { status: 404 });
    // §17: a board without edit rights is a wall to look at. No proposal
    // queue here — there is nothing sensible to propose about a card's x and y.
    if (!viewerCanEdit('board', id, user)) {
      return json({ error: 'Je mag dit prikbord niet bewerken.' }, { status: 403 });
    }

    const patch = (await request.json()) as BoardPatch & { clientId?: string };
    /*
     * §50: a card standing for a record may not reach across the border. Only
     * cards whose reference is *new* to this wall are asked: an autosave sends
     * everything the browser knows, so checking them all would refuse every
     * save of a wall that has held a crossing card since before this round.
     * Nothing stored is migrated or stripped — only the new reference is
     * refused, and the wall's own side is what it is measured against.
     */
    if (patch.cards?.length) {
      const known = new Set(
        before.state.cards.map(cardRef).filter(Boolean).map((ref) => `${ref!.kind}:${ref!.id}`),
      );
      /*
       * §61: the refusal names the cards. It used to be a bare sentence, so the
       * browser could only keep the card, post it again, and be refused again —
       * one crossing card and nothing on that wall ever saved again. With
       * `code` and `cardIds` the client can take those cards off the wall, say
       * the archive's own sentence, and save everything else. Every offending
       * card is named, not just the first one found.
       */
      const refused: string[] = [];
      for (const card of patch.cards) {
        const ref = cardRef(card);
        if (!ref || known.has(`${ref.kind}:${ref.id}`)) continue;
        if (!sameSide('board', id, ref.kind, ref.id)) refused.push(card.id);
      }
      if (refused.length) {
        return json({ error: OTHER_SIDE, code: 'OTHER_SIDE', cardIds: refused }, { status: 400 });
      }
    }
    const state = saveBoard(id, patch, user);

    // Everyone else on the wall is told after the merge is written, so a client
    // that pulls on the signal cannot arrive before the change it was sent for.
    // The author is skipped: they are holding the merged document already.
    publishChange(id, typeof patch.clientId === 'string' ? patch.clientId : null);

    return json({ state, ...referencesOf(state, user) });
  } catch (err) {
    return apiError(err);
  }
}

export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    // §18b: a player who has not said who they are writing as does not write.
    requireAuthor(user);
    const { id } = await ctx.params;
    if (!getBoard(id, user)) return json({ error: 'Prikbord niet gevonden.' }, { status: 404 });

    if (!viewerCanEdit('board', id, user)) {
      return json({ error: 'Je mag dit prikbord niet bewerken.' }, { status: 403 });
    }
    const body = (await request.json()) as { name?: string; clientId?: string; inWeb?: boolean; caseId?: string | null };
    if (body.name !== undefined) {
      renameBoard(id, body.name);
      // A rename is a change like any other: everyone else's title bar follows.
      publishChange(id, typeof body.clientId === 'string' ? body.clientId : null);
    }
    if (typeof body.inWeb === 'boolean') {
      // §43, round 18: whoever manages the wall's rights decides whether it
      // counts in the web; an editor does not.
      const row = loadAccessRow('board', id);
      if (!row || !canManageAccess(row, user)) return json({ error: 'Alleen wie de rechten van dit prikbord beheert kan dit veranderen.' }, { status: 403 });
      setBoardInWeb(id, body.inWeb);
      publishChange(id, typeof body.clientId === 'string' ? body.clientId : null);
    }
    if (body.caseId !== undefined) {
      /*
       * §47: hang the wall in a dossier, or take it out of one.
       *
       * Two rights, not one. Whoever may *edit* the wall may move it — that is
       * the same hand that hangs cards on it. But filing it in a dossier puts
       * it behind that dossier's view dial as well (§17), so the dossier has to
       * be one this viewer may open. §46: this is a *lookup*, not a list — the
       * dossier is named by id and a Keeper files from either side — so it asks
       * `loadAccessRow`/`canView` and no side condition.
       */
      const wanted = typeof body.caseId === 'string' && body.caseId ? body.caseId : null;
      if (wanted) {
        const target = loadAccessRow('case', wanted);
        const deletedAt = deletedAtOfCase(wanted);
        if (!target || deletedAt === undefined || !canSeeCase({ ...target, deletedAt }, user, grantFor('case', wanted, user.id))) {
          return json({ error: 'Dat dossier bestaat niet, of je mag het niet openen.' }, { status: 403 });
        }
      }
      setBoardCase(id, wanted, user);
      publishChange(id, typeof body.clientId === 'string' ? body.clientId : null);
    }
    return json({ ok: true });
  } catch (err) {
    return apiError(err);
  }
}

export async function DELETE(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    // §18b: a player who has not said who they are writing as does not write.
    requireAuthor(user);
    const { id } = await ctx.params;
    if (!getBoard(id, user)) return json({ error: 'Prikbord niet gevonden.' }, { status: 404 });
    if (!viewerCanEdit('board', id, user)) {
      return json({ error: 'Je mag dit prikbord niet bewerken.' }, { status: 403 });
    }

    softDeleteBoard(id, user);
    return json({ ok: true });
  } catch (err) {
    return apiError(err);
  }
}
