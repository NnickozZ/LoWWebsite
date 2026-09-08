import { requireAuthor } from '@/lib/auth/author';
import { requireUser } from '@/lib/auth/session';
import { apiError, json } from '@/lib/api';
import { MAP_EDGE, storeImage, tooLargeMessage, uploadLimitFor } from '@/lib/assets';
import { createMap, listMaps } from '@/lib/maps/service';
import { keeperOnlyForNew, placeNewOnSide } from '@/lib/keeper/side';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET() {
  try {
    const user = await requireUser();
    // §50 (reverses §46's `bothSides` here): sided. Since the wissel, the
    // browser always stands on the side of the page that is asking, so a
    // picker offering "this side" offers exactly what may be attached — and a
    // reference across the border is refused on the server anyway (`sameSide`).
    return json({ maps: listMaps(user) });
  } catch (err) {
    return apiError(err);
  }
}

/** §19: a Keeper hangs a map — the picture and its name in one go. */
export async function POST(request: Request) {
  try {
    const user = await requireUser();
    // §18b: a player who has not said who they are writing as does not write.
    requireAuthor(user);
    if (!user.isKeeper) return json({ error: 'Alleen een Keeper hangt landkaarten op.' }, { status: 403 });
    const form = await request.formData();
    const file = form.get('file');
    if (!(file instanceof File)) return json({ error: 'Er is geen afbeelding meegestuurd.' }, { status: 400 });
    const limit = uploadLimitFor(user);
    if (file.size > limit) return json({ error: tooLargeMessage(limit) }, { status: 413 });
    const name = String(form.get('name') ?? '').trim();
    const description = String(form.get('description') ?? '');
    const buffer = Buffer.from(await file.arrayBuffer());
    const asset = await storeImage(buffer, file.name, file.type, user.id, { maxEdge: MAP_EDGE, limitBytes: limit });
    const map = createMap(
      { name: name || file.name.replace(/\.[a-z0-9]+$/i, ''), assetId: asset.id, width: asset.width, height: asset.height, description },
      user,
    );
    // §48: a landkaart hangs on no dossier, so its side is the one the Keeper
    // is standing on — or the one the form asked for.
    const wish = form.get('keeperOnly');
    const keeperOnly = keeperOnlyForNew(user, null, wish == null ? undefined : String(wish) === 'true');
    placeNewOnSide('map', map.id, keeperOnly, user.id);

    return json({ map });
  } catch (err) {
    return apiError(err);
  }
}
