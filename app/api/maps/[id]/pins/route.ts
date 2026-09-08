import { requireAuthor } from '@/lib/auth/author';
import { requireUser } from '@/lib/auth/session';
import { apiError, json } from '@/lib/api';
import { addPin, getMapById, listPins, type NewPin } from '@/lib/maps/service';
import { OTHER_SIDE, sameSide } from '@/lib/keeper/side';

export const dynamic = 'force-dynamic';

export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await ctx.params;
    if (!getMapById(id, user)) return json({ error: 'Landkaart niet gevonden' }, { status: 404 });
    return json({ pins: listPins(id, user) });
  } catch (err) {
    return apiError(err);
  }
}

/**
 * §19 with §39: anyone signed in may set a pin — a fiche they can see, a note, or
 * another landkaart they can see (the town on the map of the province).
 */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    // §18b: a player who has not said who they are writing as does not write.
    requireAuthor(user);
    const { id } = await ctx.params;
    if (!getMapById(id, user)) return json({ error: 'Landkaart niet gevonden' }, { status: 404 });
    const body = (await request.json()) as Partial<NewPin> & { x?: unknown; y?: unknown };
    const x = Number(body.x);
    const y = Number(body.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return json({ error: 'Waar op de kaart?' }, { status: 400 });
    // §39: three kinds now — a fiche, a loose notitie, or another landkaart.
    const input: NewPin =
      body.kind === 'note'
        ? { kind: 'note', name: String((body as { name?: unknown }).name ?? ''), text: String((body as { text?: unknown }).text ?? ''), x, y }
        : body.kind === 'map'
          ? { kind: 'map', targetMapId: String((body as { targetMapId?: unknown }).targetMapId ?? ''), x, y }
          : { kind: 'entry', entryId: String((body as { entryId?: unknown }).entryId ?? ''), x, y };
    /*
     * §50: a speld may not reach across the border. A notitie stands for
     * nothing but itself, so it is never asked; an artikel and a landkaart both
     * are a record, and both must be on this landkaart's own side.
     */
    if (input.kind !== 'note') {
      const target = input.kind === 'map' ? ('map' as const) : ('entry' as const);
      const targetId = input.kind === 'map' ? input.targetMapId : input.entryId;
      if (!sameSide('map', id, target, targetId)) return json({ error: OTHER_SIDE }, { status: 400 });
    }
    return json({ pin: addPin(id, input, user) });
  } catch (err) {
    return apiError(err);
  }
}
