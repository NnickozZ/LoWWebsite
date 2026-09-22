import { requireUser } from '@/lib/auth/session';
import { apiError, json } from '@/lib/api';
import { KamerError, undoPurchase } from '@/lib/kamers/service';

export const dynamic = 'force-dynamic';

/**
 * §93: een koop ongedaan maken, vanuit de melding die op de koop volgde.
 *
 * `[id]` is de kamer, `entryId` in de body het ding. Welke koop dat is, of hij
 * van jou is en of het venster nog open is, beslist `undoPurchase` — in één
 * transactie, zodat twee tabbladen niet twee keer terugkrijgen.
 */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await ctx.params;
    const body = (await request.json().catch(() => ({}))) as { entryId?: unknown };
    return json(undoPurchase(id, String(body.entryId ?? ''), user));
  } catch (err) {
    if (err instanceof KamerError) return json({ error: err.message }, { status: 400 });
    return apiError(err);
  }
}
