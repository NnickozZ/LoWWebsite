/**
 * §8, live → §60, one line: what is left of the prikbord's own hub.
 *
 * A board used to have a line of its own — an `EventSource` to
 * `/api/boards/[id]/live` carrying `change`, `presence` and pointer frames, and
 * an in-memory hub beside the site hub to fan them out. It worked, and it cost
 * a second socket per open wall. Over HTTP/1.1 a browser opens about six to one
 * host, so a person with the archive in a few tabs and a prikbord in one of
 * them ran out of sockets and every navigation waited for one — the tab freeze
 * (§60).
 *
 * So the wall moved onto the site line, which already had everything it needed:
 * `changed` for the signal, a *place* (`board:{id}`, set by the board page's
 * `LivePage`) with a roster and what everyone is holding, and pointer fan-out
 * per place. Nothing about the board's *contents* travels either way — cards
 * are resolved per viewer (README rule 1), so the wire carries the fact that
 * something happened and each client asks for its own version of it.
 *
 * Two things stayed here, because things outside this file call them:
 *
 *   `presenceColour`  the ink a person is drawn in — re-exported from
 *                     `lib/live/colour.ts`, where it now lives so that the site
 *                     hub can use it without importing this file back.
 *   `publishChange`   the board save route's way of saying "this wall moved,
 *                     and *that* tab is the one that moved it". It forwards to
 *                     the site hub, which is the only hub there is now.
 */

import { publishChanged } from '@/lib/live/hub';
import { boardKey } from '@/lib/live/keys';

export { presenceColour } from '@/lib/live/colour';

/** How many carried cards one pointer frame may claim. A hand is not a forklift. */
export const POINTER_CARD_LIMIT = 40;

/**
 * Tell everyone but the author that the board moved. Called after the merge has
 * been written, never before: a client that pulls on this signal must find the
 * new document, not the old one.
 *
 * §60: `by` travels all the way down to the tab now. The site hub skips the tab
 * whose clientId it is, and every other tab uses it to keep that tab's carried
 * cards on screen until its own pull lands — otherwise a dropped card snaps
 * back to where it started for the length of one round trip and then jumps.
 */
export function publishChange(boardId: string, byClientId?: string | null) {
  publishChanged([boardKey(boardId)], { by: byClientId ?? null });
}
