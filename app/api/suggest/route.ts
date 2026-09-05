import { requireUser } from '@/lib/auth/session';
import { apiError, json } from '@/lib/api';
import { isAdrift } from '@/lib/entries/caseName';
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
    /*
     * §31: the dossiers the person is writing inside — the artikel's own, or
     * the one whose page a box was opened on. They rank the answer and nothing
     * else: `suggestEntries` puts them through `visibleCaseCondition` first, so
     * a guessed id buys nothing, and a widened result is impossible because the
     * candidates were already behind `visibleEntryCondition`. Capped so a long
     * URL cannot turn into a long IN clause.
     */
    const preferCaseIds = (url.searchParams.get('cases') ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 12);

    const entries = suggestEntries(user, q, {
      limit: Number.isFinite(limit) ? Math.min(20, Math.max(1, limit)) : 5,
      typeSlugs: types.length ? types : undefined,
      preferCaseIds: preferCaseIds.length ? preferCaseIds : undefined,
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
        // §24: the dossier a voorwerp or clue was made in, when this viewer may
        // see it — so an autocomplete can tell two "de brief"s apart.
        originCaseName: e.originCaseName ?? null,
        // §24: and whether it is in no dossier at all — a boolean, never an id
        // or a name, so the autocomplete can print "Zonder dossier" without
        // being told anything about a dossier.
        adrift: isAdrift(e),
        // §31: this row is in the dossier you are writing in. A flag, never a
        // name — the marker in the list is a folder icon and nothing else, so
        // no row can name a dossier to somebody who may not open it.
        inCase: Boolean(e.inPreferredCase),
      })),
    });
  } catch (err) {
    return apiError(err);
  }
}
