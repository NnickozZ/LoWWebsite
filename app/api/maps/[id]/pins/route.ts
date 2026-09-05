import { requireUser } from '@/lib/auth/session';
import { apiError, json } from '@/lib/api';
import { addPin, getMapById, listPins, type NewPin } from '@/lib/maps/service';

export const dynamic = 'force-dynamic';

export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await ctx.params;
    if (!getMapById(id)) return json({ error: 'Landkaart niet gevonden' }, { status: 404 });
    return json({ pins: listPins(id, user) });
  } catch (err) {
    return apiError(err);
  }
}

/** §19: anyone signed in may set a pin — a fiche they can see, or a note. */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await ctx.params;
    if (!getMapById(id)) return json({ error: 'Landkaart niet gevonden' }, { status: 404 });
    const body = (await request.json()) as Partial<NewPin> & { x?: unknown; y?: unknown };
    const x = Number(body.x);
    const y = Number(body.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return json({ error: 'Waar op de kaart?' }, { status: 400 });
    const input: NewPin =
      body.kind === 'note'
        ? { kind: 'note', name: String((body as { name?: unknown }).name ?? ''), text: String((body as { text?: unknown }).text ?? ''), x, y }
        : { kind: 'entry', entryId: String((body as { entryId?: unknown }).entryId ?? ''), x, y };
    return json({ pin: addPin(id, input, user) });
  } catch (err) {
    return apiError(err);
  }
}
