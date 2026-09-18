import { requireAuthor } from '@/lib/auth/author';
import { requireUser } from '@/lib/auth/session';
import { apiError, json } from '@/lib/api';
import { createOverzicht, listOverzichten, overzichtHref } from '@/lib/overzichten/service';

export const dynamic = 'force-dynamic';

/**
 * §75: the overzichten this viewer may see, on the side they are standing on
 * (§46 — this is a list). Used by the strip at the top of an overzicht, which
 * is how a newly made one becomes findable without anybody linking to it.
 */
export async function GET() {
  try {
    const user = await requireUser();
    const overzichten = listOverzichten(user).map((row) => ({ ...row, href: overzichtHref(row) }));
    return json({ overzichten });
  } catch (err) {
    return apiError(err);
  }
}

/**
 * §75: anybody signed in may make one. That is the round's decision and it is
 * not spelled out here — `createOverzicht` writes `edit_mode = 'all'` and the
 * dials do the rest; this route asks only for a name and an onderzoeker.
 */
export async function POST(request: Request) {
  try {
    const user = await requireUser();
    // §18b: a player who has not said who they are writing as does not write.
    requireAuthor(user);
    const body = (await request.json()) as { name?: string; keeperOnly?: boolean };
    if (!body.name?.trim()) return json({ error: 'Geef het overzicht eerst een naam.' }, { status: 400 });

    // §48: born on the side the hand is standing on — decided inside the
    // service, because an overzicht hangs in no container and there is nothing
    // else to ask.
    const created = createOverzicht({ name: body.name, keeperOnly: body.keeperOnly }, user);
    return json({ overzicht: { ...created, href: overzichtHref(created) } });
  } catch (err) {
    return apiError(err);
  }
}
