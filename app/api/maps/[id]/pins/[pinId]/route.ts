import { requireAuthor } from '@/lib/auth/author';
import { requireUser } from '@/lib/auth/session';
import { apiError, json } from '@/lib/api';
import {
  convertPinToEntry,
  PIN_NOT_ALLOWED,
  removePin,
  setPinLayer,
  updatePin,
  viewerCanEditPin,
} from '@/lib/maps/service';

export const dynamic = 'force-dynamic';

/** Move, rename or rewrite a pin: golf M, whoever may edit the landkaart. */
export async function PATCH(request: Request, ctx: { params: Promise<{ id: string; pinId: string }> }) {
  try {
    const user = await requireUser();
    // §18b: a player who has not said who they are writing as does not write.
    requireAuthor(user);
    const { pinId } = await ctx.params;
    // Golf M: the landkaart's Bewerken dial, for every branch below — a 403
    // before anything is read, not a 400 from the service's backstop.
    if (!viewerCanEditPin(pinId, user)) return json({ error: PIN_NOT_ALLOWED }, { status: 403 });
    const body = (await request.json()) as {
      x?: unknown;
      y?: unknown;
      name?: unknown;
      text?: unknown;
      entryId?: unknown;
      layer?: unknown;
    };

    /*
     * §8: a note speld becomes the speld of an artikel, in place — the same
     * move a notitie on a prikbord already had. It is its own branch rather
     * than another field of the patch, because it changes what the speld *is*
     * and the answer to "may I?" has to come first (§10): a speld somebody
     * else set is a 403, not a silent no-op, and the artikel itself is checked
     * against this writer's own visibility inside the service (§1).
     */
    if (typeof body.entryId === 'string' && body.entryId) {
      return json({ pin: convertPinToEntry(pinId, body.entryId, user) });
    }

    /*
     * §71: Naar voren / Naar achter / Voorgrond / Achtergrond. Zijn eigen tak,
     * om dezelfde reden als `entryId` hierboven: het is een ander soort schrijf
     * (geen veldkamer, geen hertelling), en het recht wordt in de dienst
     * gevraagd — `setPinLayer` gaat door `ownPin`, dus dit is dezelfde regel als
     * bij het verschuiven van een speld: wie de landkaart mag bewerken.
     */
    if (typeof body.layer === 'number' && Number.isFinite(body.layer)) {
      return json({ pin: setPinLayer(pinId, body.layer, user) });
    }

    const patch: { x?: number; y?: number; name?: string; text?: string } = {};
    if (typeof body.x === 'number') patch.x = body.x;
    if (typeof body.y === 'number') patch.y = body.y;
    if (typeof body.name === 'string') patch.name = body.name;
    if (typeof body.text === 'string') patch.text = body.text;
    return json({ pin: updatePin(pinId, patch, user) });
  } catch (err) {
    return apiError(err);
  }
}

export async function DELETE(_request: Request, ctx: { params: Promise<{ id: string; pinId: string }> }) {
  try {
    const user = await requireUser();
    // §18b: a player who has not said who they are writing as does not write.
    requireAuthor(user);
    const { pinId } = await ctx.params;
    if (!viewerCanEditPin(pinId, user)) return json({ error: PIN_NOT_ALLOWED }, { status: 403 });
    removePin(pinId, user);
    return json({ ok: true });
  } catch (err) {
    return apiError(err);
  }
}
