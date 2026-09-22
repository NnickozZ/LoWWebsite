import { requireUser } from '@/lib/auth/session';
import { apiError, json } from '@/lib/api';
import { isPlekKind } from '@/lib/kamers/shape';
import { rankBy } from '@/lib/search/fuzzy';
/*
 * §79: the same question every write in this round asks. It used to be
 * `viewerCanEdit('room', …)`, which for a `private` dial means
 * `rooms.created_by === you` — a copy of "who wears this onderzoeker", written
 * once. `canArrangeRoom` asks `user_characters` live, and the service's
 * docblock says at length why the copy is the wrong question after a karakter
 * changes hands. Two roads to one answer is the shape of mistake that lets a
 * previous wearer spend somebody else's munt.
 */
import { canArrangeRoom, placeCandidates } from '@/lib/kamers/service';

export const dynamic = 'force-dynamic';

/** How many rows the picker ever draws. */
const SHOWN = 8;
/** How wide the candidate set is before it is ranked. A campaign is far under this. */
const SCAN = 1000;

/**
 * §79: what may go in a plek of this kind — the list the "Neerzetten" sheet
 * draws.
 *
 * This is a *courtesy*, not a rule. `placeItem` refuses everything this query
 * leaves out and would refuse it just the same if this route offered it; what
 * the route is for is that a picker which offers a choice and then refuses it
 * is a worse screen than one that never offered it (§6).
 *
 * So the three conditions here are the three `placeItem` asks, and no others:
 *
 *  - the artikel carries `fields.plek` and **this plek's kind is one of the
 *    answers**. That is §79's whole definition of a voorwerp — not a soort, so
 *    the Keeper may make *Voorwerpen*, *Boeken* and *Relikwieën* and all three
 *    turn up here (`VOORWERP_FIELD_KEY`). Since §83 the field is a list, and
 *    this is the **only** place the question is asked in SQL rather than
 *    through `plekKinds` — see the condition itself;
 *  - the reader may see it (`visibleEntryCondition`, which is §9, §17 and §44
 *    in one place and is not re-implemented anywhere in this round);
 *  - nobody has claimed it. §83: a claim is only ever made for a thing there is
 *    one of, so a second leesstoel stays on the list and a lantaarn on somebody
 *    else's plank — or on your own — does not.
 *
 * The rights on the route itself are the kamer's own: only a hand that may
 * arrange it gets the list at all, because "what is not already on your shelf"
 * is a sentence about your shelf.
 *
 * Ranking is `/api/suggest`'s: the same fuzzy scorer, so a typed letter picks
 * the same row here as it would in the `@`-list. With nothing typed the list is
 * the most recently touched, which on a fresh archive is the thing the Keeper
 * just made.
 */
export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await ctx.params;
    const url = new URL(request.url);
    const kind = url.searchParams.get('kind') ?? '';
    if (!isPlekKind(kind)) return json({ entries: [] });
    if (!canArrangeRoom(id, user)) {
      return json({ error: 'Dit is jouw kamer niet.' }, { status: 403 });
    }

    /*
     * §93: wat hier mag, vraagt de service — en sinds de lade is dat niet meer
     * "alles wat past": een speler krijgt de lade van déze kamer plus gevonden
     * voorwerpen, de Keeper daarbovenop al het andere huisraad. Zie
     * `placeCandidates`; de vraag staat daar zodat een test hem kan stellen
     * langs dezelfde weg als deze route.
     */
    const candidates = placeCandidates(id, kind, user, SCAN);

    const typed = (url.searchParams.get('q') ?? '').trim();
    const entries = typed
      ? rankBy(candidates, typed, (entry) => [entry.name, entry.shortDescription], SHOWN).map((row) => row.item)
      : candidates.slice(0, SHOWN);

    return json({ entries });
  } catch (err) {
    return apiError(err);
  }
}
