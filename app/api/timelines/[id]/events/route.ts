import { requireUser } from '@/lib/auth/session';
import { apiError, json } from '@/lib/api';
import { isScale } from '@/lib/timelines/time';
import {
  addEvent,
  getTimelineById,
  listEvents,
  TIMELINE_NOT_YOURS,
  viewerCanEditTimeline,
  type NewEvent,
} from '@/lib/timelines/service';

export const dynamic = 'force-dynamic';

export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await ctx.params;
    if (!getTimelineById(id, user)) return json({ error: 'Tijdlijn niet gevonden' }, { status: 404 });
    return json({ events: listEvents(id, user) });
  } catch (err) {
    return apiError(err);
  }
}

/** §32: a gebeurtenis — an artikel this writer may see, or a note — at a moment. */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await ctx.params;
    if (!getTimelineById(id, user)) return json({ error: 'Tijdlijn niet gevonden' }, { status: 404 });
    if (!viewerCanEditTimeline(id, user)) return json({ error: TIMELINE_NOT_YOURS }, { status: 403 });
    const body = (await request.json()) as Partial<NewEvent> & { at?: unknown; precision?: unknown };
    const at = Number(body.at);
    if (!Number.isFinite(at)) return json({ error: 'Wanneer was dit?' }, { status: 400 });
    const precision = isScale(body.precision) ? body.precision : undefined;
    const text = typeof body.text === 'string' ? body.text : '';
    const input: NewEvent =
      body.kind === 'note'
        ? { kind: 'note', name: String((body as { name?: unknown }).name ?? ''), text, at, precision }
        : { kind: 'entry', entryId: String((body as { entryId?: unknown }).entryId ?? ''), text, at, precision };
    return json({ event: addEvent(id, input, user) });
  } catch (err) {
    return apiError(err);
  }
}
