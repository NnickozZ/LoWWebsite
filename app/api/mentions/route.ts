import { requireUser } from '@/lib/auth/session';
import { apiError, json } from '@/lib/api';
import { resolveMentions } from '@/lib/entries/mentions';

export const dynamic = 'force-dynamic';

/** A plain box holds at most a few thousand characters; a wall holds many boxes. */
const MAX_TEXTS = 60;
const MAX_LENGTH = 6000;

/**
 * Round 21: what a plain box's shorthand means, for the browser that has to
 * print it. `[[Naam]]` and `@Naam` are read by `entryNameIndex` on the server
 * and nowhere else — the browser has no name index and must not be given one,
 * which is why this is a lookup of *these texts* and never "the names in the
 * archive". A text the reader is already looking at tells them nothing new.
 *
 * POST rather than GET because a wall's worth of card text does not fit in a
 * URL, and because there is nothing here to link to or bookmark.
 */
export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const body = (await request.json().catch(() => null)) as { texts?: unknown } | null;
    const texts = Array.isArray(body?.texts)
      ? body.texts.filter((t): t is string => typeof t === 'string').slice(0, MAX_TEXTS).map((t) => t.slice(0, MAX_LENGTH))
      : [];
    if (!texts.length) return json({ texts: [] });
    return json({ texts: resolveMentions(user, texts).map((spans) => ({ spans })) });
  } catch (error) {
    return apiError(error);
  }
}
