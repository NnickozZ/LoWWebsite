import { requireAuthor } from '@/lib/auth/author';
import { requireUser } from '@/lib/auth/session';
import { apiError, json } from '@/lib/api';
import { isAnchorUnit, isScale } from '@/lib/timelines/time';
import {
  getTimelineById,
  listEvents,
  softDeleteTimeline,
  TIMELINE_NOT_YOURS,
  updateTimeline,
  viewerCanEditTimeline,
  type TimelinePatch,
} from '@/lib/timelines/service';

export const dynamic = 'force-dynamic';

export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await ctx.params;
    const timeline = getTimelineById(id, user);
    if (!timeline) return json({ error: 'Tijdlijn niet gevonden' }, { status: 404 });
    return json({ timeline, events: listEvents(id, user), canEdit: viewerCanEditTimeline(id, user) });
  } catch (err) {
    return apiError(err);
  }
}

/** §32: renaming, describing, re-measuring — whoever may edit it (§17). */
export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    // §18b: a player who has not said who they are writing as does not write.
    requireAuthor(user);
    const { id } = await ctx.params;
    if (!getTimelineById(id, user)) return json({ error: 'Tijdlijn niet gevonden' }, { status: 404 });
    if (!viewerCanEditTimeline(id, user)) return json({ error: TIMELINE_NOT_YOURS }, { status: 403 });
    const body = (await request.json()) as {
      name?: unknown;
      description?: unknown;
      scale?: unknown;
      anchorAt?: unknown;
      anchorUnit?: unknown;
    };
    const patch: TimelinePatch = {};
    if (typeof body.name === 'string') patch.name = body.name;
    if (typeof body.description === 'string') patch.description = body.description;
    if (body.scale !== undefined) {
      if (!isScale(body.scale)) return json({ error: 'Onbekende maat.' }, { status: 400 });
      patch.scale = body.scale;
    }
    // §35: "deze tijdlijn speelt op…". Both together, or both null to take it
    // away; the service is what decides whether it is coarse enough.
    if (body.anchorAt !== undefined || body.anchorUnit !== undefined) {
      if (body.anchorAt === null || body.anchorUnit === null) {
        patch.anchorAt = null;
        patch.anchorUnit = null;
      } else {
        if (typeof body.anchorAt !== 'number' || !isAnchorUnit(body.anchorUnit)) {
          return json({ error: 'Onbekend vast moment.' }, { status: 400 });
        }
        patch.anchorAt = body.anchorAt;
        patch.anchorUnit = body.anchorUnit;
      }
    }
    return json({ timeline: updateTimeline(id, patch, user) });
  } catch (err) {
    return apiError(err);
  }
}

/** Into the bin (§11); the Keeper's prullenbak brings it back or ends it. */
export async function DELETE(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    // §18b: a player who has not said who they are writing as does not write.
    requireAuthor(user);
    const { id } = await ctx.params;
    if (!getTimelineById(id, user)) return json({ error: 'Tijdlijn niet gevonden' }, { status: 404 });
    if (!viewerCanEditTimeline(id, user)) return json({ error: TIMELINE_NOT_YOURS }, { status: 403 });
    softDeleteTimeline(id, user);
    return json({ ok: true });
  } catch (err) {
    return apiError(err);
  }
}
