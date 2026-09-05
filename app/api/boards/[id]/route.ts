import { viewerCanEdit } from '@/lib/access';
import { requireUser } from '@/lib/auth/session';
import { apiError, json } from '@/lib/api';
import { getBoard, renameBoard, saveBoard, softDeleteBoard } from '@/lib/boards/service';
import { resolveBoardEntries } from '@/lib/boards/service';
import { publishChange } from '@/lib/boards/live';
import type { BoardPatch, BoardState } from '@/lib/boards/merge';

export const dynamic = 'force-dynamic';

/** The cards on a board whose entry facts have to be looked up for this viewer. */
function entryIdsOf(state: BoardState): string[] {
  return state.cards
    .filter((card) => card.kind === 'entry' && card.entryId)
    .map((card) => card.entryId as string);
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
      entries: Object.fromEntries(resolveBoardEntries(entryIdsOf(board.state), user)),
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
    const { id } = await ctx.params;
    if (!getBoard(id, user)) return json({ error: 'Prikbord niet gevonden.' }, { status: 404 });
    // §17: a board without edit rights is a wall to look at. No proposal
    // queue here — there is nothing sensible to propose about a card's x and y.
    if (!viewerCanEdit('board', id, user)) {
      return json({ error: 'Je mag dit prikbord niet bewerken.' }, { status: 403 });
    }

    const patch = (await request.json()) as BoardPatch & { clientId?: string };
    const state = saveBoard(id, patch, user);

    // Everyone else on the wall is told after the merge is written, so a client
    // that pulls on the signal cannot arrive before the change it was sent for.
    // The author is skipped: they are holding the merged document already.
    publishChange(id, typeof patch.clientId === 'string' ? patch.clientId : null);

    return json({
      state,
      entries: Object.fromEntries(resolveBoardEntries(entryIdsOf(state), user)),
    });
  } catch (err) {
    return apiError(err);
  }
}

export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await ctx.params;
    if (!getBoard(id, user)) return json({ error: 'Prikbord niet gevonden.' }, { status: 404 });

    if (!viewerCanEdit('board', id, user)) {
      return json({ error: 'Je mag dit prikbord niet bewerken.' }, { status: 403 });
    }
    const body = (await request.json()) as { name?: string; clientId?: string };
    if (body.name !== undefined) {
      renameBoard(id, body.name);
      // A rename is a change like any other: everyone else's title bar follows.
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
    const { id } = await ctx.params;
    if (!getBoard(id, user)) return json({ error: 'Prikbord niet gevonden.' }, { status: 404 });
    if (!viewerCanEdit('board', id, user)) {
      return json({ error: 'Je mag dit prikbord niet bewerken.' }, { status: 403 });
    }

    softDeleteBoard(id, user.id);
    return json({ ok: true });
  } catch (err) {
    return apiError(err);
  }
}
