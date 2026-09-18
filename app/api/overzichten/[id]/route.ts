import { requireAuthor } from '@/lib/auth/author';
import { requireUser } from '@/lib/auth/session';
import { apiError, json } from '@/lib/api';
import {
  deleteOverzicht,
  getOverzicht,
  overzichtHref,
  updateOverzicht,
} from '@/lib/overzichten/service';

export const dynamic = 'force-dynamic';

/**
 * §75: the title, the lead and the order. The secties are not patched here —
 * they go through `/api/sections/[id]` like every other sectie in the archive
 * (§70), which is the whole reason an overzicht needed no editor of its own.
 *
 * §46: a lookup first, without a side filter, so a Keeper coming across from
 * the other side gets a 404 only when it really is not there.
 */
export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    // §18b: a player who has not said who they are writing as does not write.
    requireAuthor(user);
    const { id } = await ctx.params;
    if (!getOverzicht(id, user)) return json({ error: 'Overzicht niet gevonden.' }, { status: 404 });

    const body = (await request.json()) as {
      name?: string;
      lead?: string;
      icon?: string;
      sortOrder?: number;
    };
    const updated = updateOverzicht(id, body, user);
    return json({ overzicht: { ...updated, href: overzichtHref(updated) } });
  } catch (err) {
    return apiError(err);
  }
}

/** Into the Keeper's bin (§43). The home overzicht refuses — see the service. */
export async function DELETE(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    requireAuthor(user);
    const { id } = await ctx.params;
    if (!getOverzicht(id, user)) return json({ error: 'Overzicht niet gevonden.' }, { status: 404 });
    deleteOverzicht(id, user);
    return json({ ok: true });
  } catch (err) {
    return apiError(err);
  }
}
