import { apiError, json } from '@/lib/api';
import { requireKeeper } from '@/lib/auth/session';
import { isKeeperKind } from '@/lib/keeper/kinds';
import { keeperRef, setKeeperSide } from '@/lib/keeper/side';

export const dynamic = 'force-dynamic';

/**
 * §44: "deze pagina is van de Keeper", on and off.
 *
 * Two gates, both here: a Keeper, and a thing this Keeper may actually see.
 * The second is not paranoia about Keepers — it is what keeps the route from
 * being a way to learn whether an id exists, and it is the same `keeperRef`
 * every page reads through, so there is one answer to "may I touch this".
 */
export async function POST(request: Request) {
  try {
    const keeper = await requireKeeper();
    const body = (await request.json()) as { kind?: string; id?: string; on?: boolean };
    const kind = String(body.kind ?? '');
    const id = String(body.id ?? '');
    if (!isKeeperKind(kind) || !id) return json({ error: 'Niet gevonden.' }, { status: 404 });
    if (!keeperRef(kind, id, keeper)) return json({ error: 'Niet gevonden.' }, { status: 404 });
    setKeeperSide(kind, id, Boolean(body.on), keeper.id);
    return json({ ok: true, keeperOnly: Boolean(body.on) });
  } catch (err) {
    return apiError(err);
  }
}
