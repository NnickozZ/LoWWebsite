import { requireUser } from '@/lib/auth/session';
import { apiError, json } from '@/lib/api';
import { MAP_EDGE, MAX_UPLOAD_BYTES, storeImage } from '@/lib/assets';
import { createMap, listMaps } from '@/lib/maps/service';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET() {
  try {
    const user = await requireUser();
    return json({ maps: listMaps(user) });
  } catch (err) {
    return apiError(err);
  }
}

/** §19: a Keeper hangs a map — the picture and its name in one go. */
export async function POST(request: Request) {
  try {
    const user = await requireUser();
    if (!user.isKeeper) return json({ error: 'Alleen een Keeper hangt landkaarten op.' }, { status: 403 });
    const form = await request.formData();
    const file = form.get('file');
    if (!(file instanceof File)) return json({ error: 'Er is geen afbeelding meegestuurd.' }, { status: 400 });
    if (file.size > MAX_UPLOAD_BYTES) {
      return json({ error: 'Die afbeelding is groter dan de limiet van 20 MB.' }, { status: 413 });
    }
    const name = String(form.get('name') ?? '').trim();
    const description = String(form.get('description') ?? '');
    const buffer = Buffer.from(await file.arrayBuffer());
    const asset = await storeImage(buffer, file.name, file.type, user.id, { maxEdge: MAP_EDGE });
    const map = createMap(
      { name: name || file.name.replace(/\.[a-z0-9]+$/i, ''), assetId: asset.id, width: asset.width, height: asset.height, description },
      user,
    );
    return json({ map });
  } catch (err) {
    return apiError(err);
  }
}
