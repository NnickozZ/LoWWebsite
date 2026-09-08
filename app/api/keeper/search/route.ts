import { apiError, json } from '@/lib/api';
import { requireKeeper } from '@/lib/auth/session';
import { listBoards } from '@/lib/boards/service';
import { listCases } from '@/lib/cases/service';
import { isKeeperKind, KEEPER_KINDS, type KeeperKind, type KeeperRef } from '@/lib/keeper/kinds';
import { keeperRef } from '@/lib/keeper/side';
import { listMaps } from '@/lib/maps/service';
import { suggestEntries } from '@/lib/search/service';
import { listTimelines } from '@/lib/timelines/service';

export const dynamic = 'force-dynamic';

/** How many of each kind a rope picker offers at once. Five kinds, one short list each. */
const PER_KIND = 5;

/**
 * §44: what a touwtje may be tied to — anything of the five kinds this Keeper
 * may see.
 *
 * Every candidate is fetched through the list function that already carries
 * its kind's visibility rule (`suggestEntries` for artikelen,
 * `listCases`/`listBoards`/`listMaps`/`listTimelines` for the rest), and every
 * row that comes back out of here has then been through `keeperRef` — so a
 * name in this answer is a name the asker could have read on the thing's own
 * page. Nothing about a record travels but its name, its kind and its address.
 */
export async function GET(request: Request) {
  try {
    const keeper = await requireKeeper();
    const url = new URL(request.url);
    const q = (url.searchParams.get('q') ?? '').trim();
    const skipKind = url.searchParams.get('notKind') ?? '';
    const skipId = url.searchParams.get('notId') ?? '';
    if (!q) return json({ results: [] });
    const needle = q.toLowerCase();

    const candidates: { kind: KeeperKind; id: string }[] = [];
    // §50: `bothSides` — `suggestEntries` is sided everywhere else now; this
    // one picker is the §44 bridge and keeps offering the whole archive.
    for (const entry of suggestEntries(keeper, q, { limit: PER_KIND, bothSides: true })) {
      candidates.push({ kind: 'entry', id: entry.id });
    }
    const named = <T extends { id: string; name: string }>(rows: T[]) =>
      rows.filter((row) => row.name.toLowerCase().includes(needle)).slice(0, PER_KIND);
    /*
     * §46: `bothSides` on every one of them. A touwtje is tied *across* the
     * two sides by definition — its Keeper end is keeper-only and its other
     * end is player-facing — so the rope picker must go on offering everything
     * this Keeper may see, whichever side they happen to be standing on.
     */
    const both = { sort: 'name', bothSides: true } as const;
    for (const row of named(listCases(keeper, both))) candidates.push({ kind: 'case', id: row.id });
    for (const row of named(listBoards(keeper, both))) candidates.push({ kind: 'board', id: row.id });
    for (const row of named(listMaps(keeper, both))) candidates.push({ kind: 'map', id: row.id });
    for (const row of named(listTimelines(keeper, both))) candidates.push({ kind: 'timeline', id: row.id });

    const results: KeeperRef[] = [];
    for (const candidate of candidates) {
      if (isKeeperKind(skipKind) && candidate.kind === skipKind && candidate.id === skipId) continue;
      const ref = keeperRef(candidate.kind, candidate.id, keeper);
      if (ref) results.push(ref);
    }
    // Keeper pages first — a rope almost always has one at the other end.
    results.sort(
      (a, b) =>
        Number(b.keeperOnly) - Number(a.keeperOnly) ||
        KEEPER_KINDS.indexOf(a.kind) - KEEPER_KINDS.indexOf(b.kind),
    );
    return json({ results });
  } catch (err) {
    return apiError(err);
  }
}
