import { requireUser } from '@/lib/auth/session';
import { apiError, json } from '@/lib/api';
import { giveToDrawer, KamerError } from '@/lib/kamers/service';

export const dynamic = 'force-dynamic';

/**
 * §101: de Keeper legt iets rechtstreeks in de lade van deze kamer.
 *
 * Alles wat mag of niet mag is van `giveToDrawer` — Keeper-only, alleen
 * huisraad, een uniek ding nergens anders — en een weigering komt terug als de
 * zin om te tonen, zoals elke andere kamerroute.
 */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await ctx.params;
    const body = (await request.json()) as { entryId?: unknown };
    const result = giveToDrawer(id, String(body.entryId ?? ''), user);
    return json(result);
  } catch (err) {
    if (err instanceof KamerError) return json({ error: err.message }, { status: 400 });
    return apiError(err);
  }
}
