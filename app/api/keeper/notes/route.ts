import { apiError, json } from '@/lib/api';
import { requireKeeper } from '@/lib/auth/session';
import { isKeeperKind } from '@/lib/keeper/kinds';
import { writeKeeperNotes } from '@/lib/keeper/notes';
import { keeperRef } from '@/lib/keeper/side';

export const dynamic = 'force-dynamic';

/**
 * §44: the Keeper's notes, saved the plain way.
 *
 * The room (`keeper:{kind}:{id}:notes`) is the road these notes normally
 * travel; this is the fallback `LiveField` already falls back to on its own
 * when there is no room — a browser that could not open the line, or the first
 * render before the client-only room has loaded. It writes through
 * `writeKeeperNotes`, which resolves the twin itself, so both roads put the
 * text in exactly one place.
 */
export async function POST(request: Request) {
  try {
    const keeper = await requireKeeper();
    const body = (await request.json()) as { kind?: string; id?: string; text?: string };
    const kind = String(body.kind ?? '');
    const id = String(body.id ?? '');
    if (!isKeeperKind(kind) || !id) return json({ error: 'Niet gevonden.' }, { status: 404 });
    if (!keeperRef(kind, id, keeper)) return json({ error: 'Niet gevonden.' }, { status: 404 });
    writeKeeperNotes(kind, id, String(body.text ?? ''), keeper);
    return json({ ok: true });
  } catch (err) {
    return apiError(err);
  }
}
