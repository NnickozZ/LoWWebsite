/**
 * §66, live: the stamboom's half-line.
 *
 * There is one line per tab and only `LiveProvider` opens it (§60), so this is
 * not a hub — it is the one sentence the save routes say into the site hub:
 * "this stamboom moved, and *that* tab is the one that moved it". Everything
 * else about a stamboom is resolved per viewer (rule 1), so nothing of its
 * contents travels here: a client hears that something happened and asks for
 * its own version of it (`GET /api/family-trees/[id]`).
 *
 * The shape is `lib/boards/live.ts`'s, deliberately, down to the `by`: the site
 * hub skips the tab whose clientId it is, and every other tab uses it to keep
 * that tab's dragged people where they are until its own pull lands.
 */

import { publishChanged } from '@/lib/live/hub';
import { familyTreeKey } from '@/lib/live/keys';

export function publishChange(treeId: string, byClientId?: string | null) {
  publishChanged([familyTreeKey(treeId)], { by: byClientId ?? null });
}
