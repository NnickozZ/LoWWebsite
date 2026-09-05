import { sql, type SQL } from 'drizzle-orm';
import { canView, type AccessRow, type Grant, viewableCondition } from '@/lib/access';
import { schema } from '@/lib/db';
import type { Viewer } from '@/lib/entries/visibility';

/**
 * §7, restated under §17. A case is visible when it is not deleted AND the
 * owner's view dial allows this viewer: everyone, the chosen people (what
 * "assigned investigators" used to be), or the owner alone. Keepers see all.
 *
 * A case a viewer may not see must appear nowhere: not in the Cases list, not
 * in search, not in the home feed, not on an entry's "in these cases" line,
 * and not at its own URL. Every read goes through this.
 */
export function visibleCaseCondition(viewer: Viewer): SQL {
  const notDeleted = sql`${schema.cases.deletedAt} IS NULL`;
  if (viewer?.isKeeper) return notDeleted;
  return sql`${notDeleted} AND ${viewableCondition('case', viewer)}`;
}

/** The same rule as a plain predicate, for tests and in-memory filtering. */
export function canSeeCase(
  aCase: AccessRow & { deletedAt?: number | null },
  viewer: Viewer,
  grant?: Grant | null,
): boolean {
  if (aCase.deletedAt) return Boolean(viewer?.isKeeper);
  return canView(aCase, viewer, grant);
}
