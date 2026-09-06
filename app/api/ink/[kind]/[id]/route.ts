import { requireAuthor } from '@/lib/auth/author';
import { requireUser } from '@/lib/auth/session';
import { apiError, json } from '@/lib/api';
import { inkForViewer } from '@/lib/ink/merge';
import { applyInk, getInk, InkRefused, inkTarget } from '@/lib/ink/service';
import { isInkKind, type InkPatch } from '@/lib/ink/types';

export const dynamic = 'force-dynamic';

/**
 * §33: the tekenlaag of one prikbord, landkaart or tijdlijn.
 *
 * GET is the pull a client makes when the `ink:{id}` key moves; POST is a
 * stroke, an undo, or (Keeper) the switch or the wipe. Both are behind the
 * same question — may this viewer *see* the thing it is drawn on — and
 * nothing else, which is the one deliberate exception to "writers ask
 * `viewerCanEdit`" (see `lib/ink/service.ts`).
 *
 * The signal that follows a write comes from the database hook (§21): the
 * `ink_layers` row moves `ink:{id}`, and every tab watching it pulls its own
 * copy through this GET. The wire carries a signal, never the document.
 */
async function target(ctx: { params: Promise<{ kind: string; id: string }> }) {
  const user = await requireUser();
  const { kind, id } = await ctx.params;
  if (!isInkKind(kind)) return { user, found: undefined };
  return { user, found: inkTarget(kind, id, user) };
}

export async function GET(_request: Request, ctx: { params: Promise<{ kind: string; id: string }> }) {
  try {
    const { user, found } = await target(ctx);
    if (!found) return json({ error: 'Niet gevonden.' }, { status: 404 });
    return json({ layer: inkForViewer(getInk(found.id), user.id) });
  } catch (err) {
    return apiError(err);
  }
}

export async function POST(request: Request, ctx: { params: Promise<{ kind: string; id: string }> }) {
  try {
    const { user, found } = await target(ctx);
    if (!found) return json({ error: 'Niet gevonden.' }, { status: 404 });
    // §18b: a player who has not said who they are writing as does not draw.
    requireAuthor(user);
    const patch = (await request.json()) as InkPatch;
    const result = applyInk(found, patch, user);
    return json({ layer: inkForViewer(result.layer, user.id), refused: result.refused });
  } catch (err) {
    if (err instanceof InkRefused) return json({ error: err.message }, { status: err.status });
    return apiError(err);
  }
}
