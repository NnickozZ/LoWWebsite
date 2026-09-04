import { sql, type SQL } from 'drizzle-orm';
import { schema } from '@/lib/db';
import type { Viewer } from '@/lib/entries/visibility';

/**
 * §7. A case is visible when it is not deleted AND
 *   - the viewer is a Keeper, or
 *   - visibility is 'all', or
 *   - visibility is 'assigned' and the viewer is one of its investigators.
 *
 * An 'assigned' case must not appear anywhere for a non-member: not in the
 * Cases list, not in search, not in the home feed, not on an entry's "in these
 * cases" line, and not at its own URL. Every read goes through this.
 */
export function visibleCaseCondition(viewer: Viewer): SQL {
  const notDeleted = sql`${schema.cases.deletedAt} IS NULL`;
  if (viewer?.isKeeper) return notDeleted;
  if (!viewer) return sql`${notDeleted} AND ${schema.cases.visibility} = 'all'`;
  return sql`${notDeleted} AND (
    ${schema.cases.visibility} = 'all'
    OR EXISTS (
      SELECT 1 FROM case_members cm
      WHERE cm.case_id = ${schema.cases.id} AND cm.user_id = ${viewer.id}
    )
  )`;
}

/** The same rule as a plain predicate, for tests and in-memory filtering. */
export function canSeeCase(
  aCase: { visibility: 'all' | 'assigned'; deletedAt?: number | null },
  viewer: Viewer,
  memberUserIds: ReadonlySet<string> = new Set(),
): boolean {
  if (aCase.deletedAt) return Boolean(viewer?.isKeeper);
  if (viewer?.isKeeper) return true;
  if (aCase.visibility === 'all') return true;
  if (!viewer) return false;
  return memberUserIds.has(viewer.id);
}

/** Who may edit a board: anyone who can see the case it belongs to. */
export function canEditBoard(
  board: { caseId: string | null },
  viewer: Viewer,
  caseIsVisible: boolean,
): boolean {
  if (!viewer) return false;
  if (!board.caseId) return true;
  return caseIsVisible;
}
