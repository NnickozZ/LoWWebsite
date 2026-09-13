import { apiError, json } from '@/lib/api';
import { requireAuthor } from '@/lib/auth/author';
import { requireUser } from '@/lib/auth/session';
import { buildFamilyGraph } from '@/lib/families/graph';
import { publishChange } from '@/lib/families/live';
import { getFamilyTreeById, writeRelation } from '@/lib/families/service';

export const dynamic = 'force-dynamic';

/**
 * §66: draw a line between two artikelen, or rub one out.
 *
 * The line is not stored here — it is a koppelingsveld on the artikel — so this
 * route is a thin door onto `writeRelation`, which hands the whole new value to
 * `updateEntry`. Everything that makes an infobox edit an infobox edit then
 * happens: the §38 gate, the mirror onto the other page, "Genoemd in", the
 * revision, and — for a hand that may see the artikel but not change it — a
 * *voorstel* instead of a write. The answer says which (`status`).
 *
 * Which right is asked, and this is the point: **the artikel's, not the
 * tree's.** Being allowed to draw in a stamboom is a right to arrange a
 * drawing; changing who somebody's mother is, is an edit of their page and is
 * measured there. So the tree is only looked up to be sure this viewer may see
 * it at all — the address of a stamboom must not become a way to write on
 * artikelen through a tree you cannot open.
 */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    // §18b: a player who has not said who they are writing as does not write.
    requireAuthor(user);
    const { id } = await ctx.params;
    const tree = getFamilyTreeById(id, user);
    if (!tree) return json({ error: 'Stamboom niet gevonden.' }, { status: 404 });

    const body = (await request.json()) as {
      entryId?: string;
      fieldKey?: string;
      targetId?: string;
      remove?: boolean;
      clientId?: string;
    };
    if (!body.entryId || !body.fieldKey || !body.targetId) {
      return json({ error: 'Een lijn heeft twee artikelen en een veld nodig.' }, { status: 400 });
    }

    const result = writeRelation(body.entryId, body.fieldKey, body.targetId, body.remove !== true, user);
    publishChange(id, typeof body.clientId === 'string' ? body.clientId : null);

    // Rebuilt, because the drawing is read off the artikelen: the line that was
    // just written is only in the graph once the field is.
    const after = getFamilyTreeById(id, user)!;
    return json({ status: result.status, graph: buildFamilyGraph(after, user) });
  } catch (err) {
    return apiError(err);
  }
}
