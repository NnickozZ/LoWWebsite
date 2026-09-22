import { requireUser } from '@/lib/auth/session';
import { apiError, json } from '@/lib/api';
import { KamerError, moveItem } from '@/lib/kamers/service';

export const dynamic = 'force-dynamic';

/**
 * §93 (E10): verplaatsen — `[slotId]` is de plek waar het ding nu ligt, `to` in
 * de body de plek waar het heen gaat.
 *
 * Elke vraag (mag deze hand inrichten, ligt het er nog, is de nieuwe plek open
 * en leeg, past het daar) staat in `moveItem`, en de voorwaarden van de twee
 * UPDATEs zijn de bewaking tegen een dubbele klik. Deze route stelt er geen
 * een van opnieuw.
 */
export async function POST(request: Request, ctx: { params: Promise<{ id: string; slotId: string }> }) {
  try {
    const user = await requireUser();
    const { slotId } = await ctx.params;
    const body = (await request.json().catch(() => ({}))) as { to?: unknown };
    moveItem(slotId, String(body.to ?? ''), user);
    return json({ ok: true });
  } catch (err) {
    if (err instanceof KamerError) return json({ error: err.message }, { status: 400 });
    return apiError(err);
  }
}
