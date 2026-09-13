import { apiError, json } from '@/lib/api';
import { requireAuthor } from '@/lib/auth/author';
import { requireUser } from '@/lib/auth/session';
import { buildFamilyGraph } from '@/lib/families/graph';
import { publishChange } from '@/lib/families/live';
import { FAMILY_TREE_NOT_YOURS, getFamilyTreeById, promoteLooseCard, viewerCanEditFamilyTree } from '@/lib/families/service';

export const dynamic = 'force-dynamic';

/**
 * §66: a los kaartje becomes an artikel.
 *
 * The artikel itself is made the ordinary way (`POST /api/entries`, through the
 * nieuw-artikel sheet) — this is the second half: the card's place becomes the
 * artikel's place, its lines become fields on the artikelen they were standing
 * in for, and the card is tombstoned.
 *
 * `dropped` is how many lines had nowhere to go: neither soort has a
 * koppelingsveld with that role, and the tree may not keep a line between two
 * artikelen. The canvas says so out loud rather than letting a line the person
 * drew disappear without a word.
 */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    // §18b: a player who has not said who they are writing as does not write.
    requireAuthor(user);
    const { id } = await ctx.params;
    if (!getFamilyTreeById(id, user)) return json({ error: 'Stamboom niet gevonden.' }, { status: 404 });
    if (!viewerCanEditFamilyTree(id, user)) return json({ error: FAMILY_TREE_NOT_YOURS }, { status: 403 });

    const body = (await request.json()) as { looseId?: string; entryId?: string; clientId?: string };
    if (!body.looseId || !body.entryId) {
      return json({ error: 'Welk kaartje, en welk artikel?' }, { status: 400 });
    }

    const { state, dropped } = promoteLooseCard(id, body.looseId, body.entryId, user);
    publishChange(id, typeof body.clientId === 'string' ? body.clientId : null);

    const after = getFamilyTreeById(id, user)!;
    return json({ state, graph: buildFamilyGraph(after, user), dropped });
  } catch (err) {
    return apiError(err);
  }
}
