import { requireUser } from '@/lib/auth/session';
import { apiError, json } from '@/lib/api';
import { searchEntries } from '@/lib/search/service';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const user = await requireUser();
    const url = new URL(request.url);
    const q = url.searchParams.get('q') ?? '';
    const { names, bodies } = searchEntries(user, q, { limit: 20 });
    return json({ names, bodies });
  } catch (err) {
    return apiError(err);
  }
}
