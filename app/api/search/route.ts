import { requireUser } from '@/lib/auth/session';
import { apiError, json } from '@/lib/api';
import { searchOthers } from '@/lib/search/others';
import { searchEntries } from '@/lib/search/service';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const user = await requireUser();
    const url = new URL(request.url);
    const q = url.searchParams.get('q') ?? '';
    // One soort at a time, when the wiki is big enough to need it (5 Sep 2026).
    const type = url.searchParams.get('type')?.trim() || undefined;
    const { names, bodies } = searchEntries(user, q, { limit: 20, typeSlug: type });
    // §96: the other things, by name — only under "Alles"; a soort is an
    // artikel's, so a chosen one narrows the answer to artikelen.
    const others = type ? [] : searchOthers(user, q, { limit: 20 });
    return json({ names, bodies, others });
  } catch (err) {
    return apiError(err);
  }
}
