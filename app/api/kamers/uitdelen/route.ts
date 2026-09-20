import { requireUser } from '@/lib/auth/session';
import { apiError, json } from '@/lib/api';
import { handOut, KamerError, type HandOutRow } from '@/lib/kamers/service';

export const dynamic = 'force-dynamic';

/**
 * §83: de uitdeling — één reden, één knop, één transactie.
 *
 * It sits beside `[id]/grant` rather than under a kamer, because it is not
 * about one kamer: the whole point is that eight grootboeken get the same line
 * at the same moment because the table did something together.
 *
 * Keeper-only, whole numbers, never below zero, all-or-nothing — every one of
 * those is `handOut`'s and is asked once, there. This route's only job is to
 * turn what the form posted into rows it will recognise.
 *
 * **A blank box is a zero here, and that is the opposite of the grant route's
 * care** (where an empty amount must be refused rather than read as a
 * deliberate 0). The two are right for the same reason: there, the empty box is
 * the only box and reading it as 0 would write a meaningless line nobody asked
 * for; here, emptying a row is one of the three ways to say *deze niet* — beside
 * a 0 and an unticked row — and all three have to mean the same thing or one of
 * them is a trap. Garbage is still garbage and `handOut` refuses it.
 */
export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const body = (await request.json().catch(() => ({}))) as { rows?: unknown; reason?: unknown };
    const raw = Array.isArray(body.rows) ? body.rows : [];
    const rows: HandOutRow[] = raw.map((entry) => {
      const row = (entry ?? {}) as { roomId?: unknown; delta?: unknown };
      const typed = String(row.delta ?? '').trim();
      return {
        roomId: String(row.roomId ?? ''),
        delta: typed === '' ? 0 : Number(typed),
      };
    });
    return json(handOut(rows, String(body.reason ?? ''), user));
  } catch (err) {
    if (err instanceof KamerError) return json({ error: err.message }, { status: 400 });
    return apiError(err);
  }
}
