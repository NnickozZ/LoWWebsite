import { requireUser } from '@/lib/auth/session';
import { apiError, json } from '@/lib/api';
import { isPlekKind } from '@/lib/kamers/shape';
/*
 * §79/§80: the same question every other road into a kamer asks, and it is
 * `canArrangeRoom` rather than `viewerCanEdit('room', …)` — see the docblock
 * in `../voorwerpen/route.ts`, which says at length why the copy of "who wears
 * this onderzoeker" is the wrong question after a karakter changes hands.
 */
import { canArrangeRoom, catalogueFor } from '@/lib/kamers/service';

export const dynamic = 'force-dynamic';

/**
 * §80: wat er voor deze plek te koop is — de lijst die het tweede tabblad van
 * het "Neerzetten"-blad tekent.
 *
 * A sibling of `../voorwerpen` rather than a second mode of it, because the
 * two answer different questions of different tables: *wat heb je al* against
 * `entries`, and *wat is er te koop* against `catalogueFor`. They share the
 * one thing that must not differ — the rights question, which is the kamer's
 * own: only a hand that may arrange it gets either list, because both
 * sentences are about *your* shelf.
 *
 * Everything else is `catalogueFor`'s: keeper-made soorten only, a price, the
 * right kind of plek, visible to these eyes, and not already lying somewhere.
 * Nothing is re-implemented here, and — the part that matters — **nothing is
 * filtered out for being too dear**. What you cannot afford yet comes back
 * with its price on it and is drawn greyed by the sheet: saving up starts with
 * seeing what there is to save for.
 */
export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await ctx.params;
    const kind = new URL(request.url).searchParams.get('kind') ?? '';
    if (!isPlekKind(kind)) return json({ entries: [] });
    if (!canArrangeRoom(id, user)) {
      return json({ error: 'Dit is jouw kamer niet.' }, { status: 403 });
    }
    return json({ entries: catalogueFor(id, kind, user) });
  } catch (err) {
    return apiError(err);
  }
}
