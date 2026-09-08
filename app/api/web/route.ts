import { apiError, json } from '@/lib/api';
import { requireUser } from '@/lib/auth/session';
import { buildWebGraph } from '@/lib/web/service';
import { clampDepth, focusSlice } from '@/lib/web/slice';

export const dynamic = 'force-dynamic';

/**
 * §43: the web, for this viewer.
 *
 * Without `?focus=` the whole visible graph comes back. With `?focus=<node id>`
 * the same graph is cut down to what lies within `?depth=` steps (1–4) of that
 * node, by the same `focusSlice` the browser runs again when the stepper
 * moves. `?notes=1` adds loose notities on prikborden as nodes of their own.
 *
 * A focus this viewer may not open is a focus that does not exist: the graph
 * was built without it, so the answer is 404 — the same answer a wrong id
 * gets, which is the point (rule 1).
 */
export async function GET(request: Request) {
  try {
    const user = await requireUser();
    const params = new URL(request.url).searchParams;
    const showNotes = params.get('notes') === '1';
    // Round 18: `?others=1` lets a Keeper spin in other people's private things.
    const othersPrivate = params.get('others') === '1';
    const focus = params.get('focus');
    /*
     * §46 said a *focus* web was built out of both sides, because its ties
     * cross the border on purpose. §50 closes that: the two sides are separate,
     * and a focus web read from the players' side that quietly drew the
     * Keeper's own records around a knot was the border being crossed in the
     * one place a reader looks hardest. The whole web and a focus web are both
     * read from the side the reader is standing on now — and since a record
     * page turns that side over to match itself, the focus you walked in from
     * is always on the side you are reading.
     */
    const graph = buildWebGraph(user, { notes: showNotes, othersPrivate });

    if (!focus) return json(graph);

    if (!graph.nodes.some((node) => node.id === focus)) {
      return json({ error: 'Niet gevonden.' }, { status: 404 });
    }
    const depth = clampDepth(params.get('depth'));
    return json(focusSlice(graph, focus, depth, { showNotes }));
  } catch (err) {
    return apiError(err);
  }
}
