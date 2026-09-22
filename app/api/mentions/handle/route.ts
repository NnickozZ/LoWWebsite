import { requireUser } from '@/lib/auth/session';
import { apiError, json } from '@/lib/api';
import { mintHandle, resolveHandles } from '@/lib/entries/shortRefs';

export const dynamic = 'force-dynamic';

/**
 * §95: a handle for a mention about to be written into a short text.
 *
 * The editor asks the moment a name is picked, and writes `⟦handle⟧` into the
 * box — never the artikel's id and never its name, because the box is a `Y.Text`
 * that every reader of the record is handed whole. Only an artikel this reader
 * may see gets one; anything else is the same 404 as an artikel that does not
 * exist.
 */
export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const body = (await request.json().catch(() => null)) as { entryId?: unknown } | null;
    const entryId = typeof body?.entryId === 'string' ? body.entryId : '';
    const handle = entryId ? mintHandle(entryId, user) : null;
    if (!handle) return json({ error: 'Artikel niet gevonden' }, { status: 404 });
    const chip = resolveHandles(user, [handle]).get(handle) ?? null;
    return json({ handle, chip });
  } catch (error) {
    return apiError(error);
  }
}
