import { sql, type Column, type SQL } from 'drizzle-orm';
import { canView, type AccessColumns, type AccessRow, type Grant, viewableCondition } from '@/lib/access';
import { schema } from '@/lib/db';
import type { Viewer } from '@/lib/entries/visibility';

/** `maps`, or a drizzle `alias()` of it: the four columns the rule below reads. */
export type MapAccessColumns = AccessColumns & { deletedAt: Column };

/**
 * §40 — §19, restated under §17. A landkaart is visible when it is not deleted AND
 * the owner's view dial allows this viewer: everyone signed in, the chosen
 * people, or the owner and the Keepers alone. Keepers see all.
 *
 * Until this existed, a landkaart was the one thing in the archive with no dial
 * at all: every signed-in person saw every map, which made a plattegrond — the
 * exact thing a Keeper wants hidden until the players find the house —
 * impossible to keep back. `resolveBoardMaps` even took a viewer it never used.
 *
 * A landkaart a viewer may not see must appear nowhere: not in Landkaarten, not
 * on the home page's count, not as a card on a prikbord, not under "Genoemd in"
 * on an artikel, not on the live line, and not at its own URL. Every read goes
 * through this — the same rule `visibleCaseCondition` states for a dossier, and
 * written the same way on purpose.
 *
 * `on` names a second copy of `maps` — a drizzle `alias()` — for a query that
 * joins the table twice. §19's speld that stands for another landkaart is one:
 * the pin's own map and the map it points at are both `maps`, and the target
 * has to be asked its *own* dial, or a speld would reveal the plattegrond the
 * Keeper is keeping back merely by pointing at it. Left out, it is `maps`
 * itself, which is every other caller.
 */
export function visibleMapCondition(viewer: Viewer, on: MapAccessColumns = schema.maps): SQL {
  const notDeleted = sql`${on.deletedAt} IS NULL`;
  if (viewer?.isKeeper) return notDeleted;
  return sql`${notDeleted} AND ${viewableCondition('map', viewer, on)}`;
}

/** The same rule as a plain predicate, for tests and in-memory filtering. */
export function canSeeMap(
  map: AccessRow & { deletedAt?: number | null },
  viewer: Viewer,
  grant?: Grant | null,
): boolean {
  if (map.deletedAt) return Boolean(viewer?.isKeeper);
  return canView(map, viewer, grant);
}
