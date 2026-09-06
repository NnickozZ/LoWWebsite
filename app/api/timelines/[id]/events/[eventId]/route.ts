import { requireUser } from '@/lib/auth/session';
import { apiError, json } from '@/lib/api';
import { isScale } from '@/lib/timelines/time';
import {
  convertEventToEntry,
  removeEvent,
  TIMELINE_NOT_YOURS,
  updateEvent,
  viewerCanEditEvent,
  type EventPatch,
} from '@/lib/timelines/service';

export const dynamic = 'force-dynamic';

/** Move, rename, rewrite, picture: whoever may edit the tijdlijn (§17). */
export async function PATCH(request: Request, ctx: { params: Promise<{ id: string; eventId: string }> }) {
  try {
    const user = await requireUser();
    const { eventId } = await ctx.params;
    if (!viewerCanEditEvent(eventId, user)) return json({ error: TIMELINE_NOT_YOURS }, { status: 403 });
    const body = (await request.json()) as {
      at?: unknown;
      precision?: unknown;
      name?: unknown;
      text?: unknown;
      assetId?: unknown;
      showImage?: unknown;
      entryId?: unknown;
    };

    // §8: a note gebeurtenis becomes the gebeurtenis of an artikel, in place —
    // its own branch, because it changes what the gebeurtenis *is*.
    if (typeof body.entryId === 'string' && body.entryId) {
      return json({ event: convertEventToEntry(eventId, body.entryId, user) });
    }

    const patch: EventPatch = {};
    if (typeof body.at === 'number') patch.at = body.at;
    if (isScale(body.precision)) patch.precision = body.precision;
    if (typeof body.name === 'string') patch.name = body.name;
    if (typeof body.text === 'string') patch.text = body.text;
    if (body.assetId === null || typeof body.assetId === 'string') patch.assetId = body.assetId;
    if (typeof body.showImage === 'boolean') patch.showImage = body.showImage;
    return json({ event: updateEvent(eventId, patch, user) });
  } catch (err) {
    return apiError(err);
  }
}

export async function DELETE(_request: Request, ctx: { params: Promise<{ id: string; eventId: string }> }) {
  try {
    const user = await requireUser();
    const { eventId } = await ctx.params;
    if (!viewerCanEditEvent(eventId, user)) return json({ error: TIMELINE_NOT_YOURS }, { status: 403 });
    removeEvent(eventId, user);
    return json({ ok: true });
  } catch (err) {
    return apiError(err);
  }
}
