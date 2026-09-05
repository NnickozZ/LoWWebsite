import { requireUser } from '@/lib/auth/session';
import { apiError, json } from '@/lib/api';
import { MAP_EDGE, MAX_UPLOAD_BYTES, storeImage } from '@/lib/assets';
import { deleteMap, getMapById, updateMap, type MapPatch } from '@/lib/maps/service';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * §19: renaming, describing, reordering — and, as multipart, a redrawn
 * picture under the same pins. Keeper only, all of it.
 */
export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    if (!user.isKeeper) return json({ error: 'Alleen een Keeper verandert een landkaart.' }, { status: 403 });
    const { id } = await ctx.params;
    if (!getMapById(id)) return json({ error: 'Landkaart niet gevonden' }, { status: 404 });

    const type = request.headers.get('content-type') ?? '';
    if (type.includes('multipart/form-data')) {
      const form = await request.formData();
      const file = form.get('file');
      if (!(file instanceof File)) return json({ error: 'Er is geen afbeelding meegestuurd.' }, { status: 400 });
      if (file.size > MAX_UPLOAD_BYTES) {
        return json({ error: 'Die afbeelding is groter dan de limiet van 20 MB.' }, { status: 413 });
      }
      const buffer = Buffer.from(await file.arrayBuffer());
      const asset = await storeImage(buffer, file.name, file.type, user.id, { maxEdge: MAP_EDGE });
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
    if (!user.isKeeper) return json({ error: 'Alleen een Keeper haalt een landkaart weg.' }, { status: 403 });
    const { id } = await ctx.params;
    if (!getMapById(id)) return json({ error: 'Landkaart niet gevonden' }, { status: 404 });
    deleteMap(id, user);
    return json({ ok: true });
  } catch (err) {
    return apiError(err);
  }
}
