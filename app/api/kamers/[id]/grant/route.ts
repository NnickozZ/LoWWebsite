import { requireUser } from '@/lib/auth/session';
import { apiError, json } from '@/lib/api';
import { balanceOf, grant, KamerError } from '@/lib/kamers/service';

export const dynamic = 'force-dynamic';

/**
 * §79: the Keeper writes a line in the grootboek.
 *
 * The only road in for a positive number and the only road at all for a
 * correction. Keeper-only, a whole number, never below zero — all three are
 * `grant`'s, asked once, there.
 *
 * The new balance comes back so the form can say what it did without waiting
 * for the page to come round again.
 */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await ctx.params;
    const body = (await request.json()) as { delta?: unknown; reason?: unknown };
    /*
     * A blank box must reach `grant` as something it refuses, not as a 0 that
     * looks deliberate: `Number('')` is 0, so the empty string is turned into
     * a NaN and comes back as "Een bedrag is een heel getal."
     */
    const typed = String(body.delta ?? '').trim();
    grant(id, typed === '' ? Number.NaN : Number(typed), String(body.reason ?? ''), user);
    return json({ balance: balanceOf(id) });
  } catch (err) {
    if (err instanceof KamerError) return json({ error: err.message }, { status: 400 });
    return apiError(err);
  }
}
