import { requireAuthor } from '@/lib/auth/author';
import { requireUser } from '@/lib/auth/session';
import { apiError, json } from '@/lib/api';
import { MAP_EDGE, storeImage, tooLargeMessage, uploadLimitFor } from '@/lib/assets';
import {
  deleteMap,
  getMapById,
  MAP_IS_NOT_YOURS,
  updateMap,
  viewerCanEditMap,
  type MapPatch,
} from '@/lib/maps/service';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * §19: renaming, describing, reordering — and, as multipart, a redrawn
 * picture under the same pins.
 *
 * §17: the landkaart's own edit dial decides. It starts at 'private' and its
 * owner is always a Keeper (only a Keeper hangs one), so unless a Keeper has
 * deliberately turned it up this answers exactly what the blanket `isKeeper`
 * check answered before. The 404 comes first and is the *view* rule: a map this
 * person may not see must not be told apart from one that is not there.
 */
export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    // §18b: a player who has not said who they are writing as does not write.
    requireAuthor(user);
    const { id } = await ctx.params;
    if (!getMapById(id, user)) return json({ error: 'Landkaart niet gevonden' }, { status: 404 });
    if (!viewerCanEditMap(id, user)) return json({ error: MAP_IS_NOT_YOURS }, { status: 403 });

    const type = request.headers.get('content-type') ?? '';
    if (type.includes('multipart/form-data')) {
      const form = await request.formData();
      const file = form.get('file');
      if (!(file instanceof File)) return json({ error: 'Er is geen afbeelding meegestuurd.' }, { status: 400 });
      const limit = uploadLimitFor(user);
      if (file.size > limit) return json({ error: tooLargeMessage(limit) }, { status: 413 });
      const buffer = Buffer.from(await file.arrayBuffer());
      const asset = await storeImage(buffer, file.name, file.type, user.id, { maxEdge: MAP_EDGE, limitBytes: limit });
      return json({ map: updateMap(id, { assetId: asset.id, width: asset.width, height: asset.height }, user) });
    }

    const patch = (await request.json()) as MapPatch;
    return json({ map: updateMap(id, patch, user) });
  } catch (err) {
    return apiError(err);
  }
}

export async function DELETE(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    // §18b: a player who has not said who they are writing as does not write.
    requireAuthor(user);
    const { id } = await ctx.params;
    if (!getMapById(id, user)) return json({ error: 'Landkaart niet gevonden' }, { status: 404 });
    if (!viewerCanEditMap(id, user)) {
      return json({ error: 'Je mag deze landkaart niet weghalen.' }, { status: 403 });
    }
    deleteMap(id, user);
    return json({ ok: true });
  } catch (err) {
    return apiError(err);
  }
}
