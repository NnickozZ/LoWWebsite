import { requireUser } from '@/lib/auth/session';
import { apiError, json } from '@/lib/api';
import { suggestEntries } from '@/lib/search/service';

export const dynamic = 'force-dynamic';

/** Powers "Did you mean…", the @ / [[ autocomplete, and entry_link fields. */
export async function GET(request: Request) {
  try {
    const user = await requireUser();
    const url = new URL(request.url);
    const q = url.searchParams.get('q') ?? '';
    const types = (url.searchParams.get('types') ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const limit = Number(url.searchParams.get('limit') ?? 5);

    const entries = suggestEntries(user, q, {
      limit: Number.isFinite(limit) ? Math.min(20, Math.max(1, limit)) : 5,
      typeSlugs: types.length ? types : undefined,
    });

    return json({
      entries: entries.map((e) => ({
        id: e.id,
        slug: e.slug,
        name: e.name,
        shortDescription: e.shortDescription,
        typeSlug: e.typeSlug,
        typeLabel: e.typeLabel,
        typeIcon: e.typeIcon,
        typeColour: e.typeColour,
        coverAssetId: e.coverAssetId,
      })),
    });
  } catch (err) {
    return apiError(err);
  }
}
