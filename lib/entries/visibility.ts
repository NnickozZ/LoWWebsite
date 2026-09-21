import { sql, type SQL } from 'drizzle-orm';
import { viewableCondition } from '@/lib/access';
import { schema } from '@/lib/db';
import type { Visibility } from '@/lib/db/schema';
import type { Side } from '@/lib/keeper/kinds';

/**
 * Who is looking. `side` (§46) is which side of the archive they are standing
 * on; it is read by the *list* functions only — a record's own page, a room's
 * gate and the API that patches one never ask it, because a Keeper may walk
 * across from either side and the page they land on decides where they are.
 */
export type Viewer = { id: string; isKeeper: boolean; side?: Side } | null;
/*
 * §89: `null` is "not signed in", and it sees **nothing**. There is no public
 * side of this archive: every visibility rule below and in `lib/access.ts`
 * answers `0 = 1` / `false` for it. The type stays nullable so the dozens of
 * signatures that take a `Viewer` need not change — but a page must never
 * reach a query with one (`requireViewer` in `lib/auth/session.ts`).
 */

/**
 * §9. A viewer may see an entry when it is not deleted AND
 *   - they are a Keeper, or
 *   - visibility is 'all', or
 *   - visibility is 'players' and there is a reveal row for them.
 * 'keeper' entries are invisible to players everywhere: lists, search,
 * autocomplete, backlinks, feeds and direct URLs all run through this.
 *
 * §17 adds the owner's dial on top, AND-ed rather than substituted: the Keeper
 * decides what the campaign may know, the owner decides who among them.
 */
export function visibleEntryCondition(viewer: Viewer): SQL {
  const notDeleted = sql`${schema.entries.deletedAt} IS NULL`;
  // §89: signed out sees nothing, not "whatever is shared with everyone".
  if (!viewer) return sql`0 = 1`;
  if (viewer.isKeeper) return notDeleted;
  const owner = viewableCondition('entry', viewer);
  return sql`${notDeleted} AND (
    ${schema.entries.visibility} = 'all'
    OR (${schema.entries.visibility} = 'players' AND EXISTS (
      SELECT 1 FROM entry_reveals er
      WHERE er.entry_id = ${schema.entries.id} AND er.user_id = ${viewer.id}
    ))
  ) AND ${owner}`;
}

/** The same rule as a plain predicate, for tests and in-memory filtering. */
export function canSeeEntry(
  entry: { visibility: Visibility; deletedAt?: number | null },
  viewer: Viewer,
  revealedEntryIdsForViewer: ReadonlySet<string> = new Set(),
  entryId?: string,
): boolean {
  if (!viewer) return false; // §89
  if (entry.deletedAt) return viewer.isKeeper;
  if (viewer.isKeeper) return true;
  if (entry.visibility === 'all') return true;
  if (entry.visibility === 'keeper') return false;
  if (!entryId) return false;
  return revealedEntryIdsForViewer.has(entryId);
}

export function canSeeSection(
  section: { visibility: Visibility },
  viewer: Viewer,
  revealedSectionIdsForViewer: ReadonlySet<string> = new Set(),
  sectionId?: string,
): boolean {
  if (!viewer) return false; // §89
  if (viewer.isKeeper) return true;
  if (section.visibility === 'all') return true;
  if (section.visibility === 'keeper') return false;
  if (!sectionId) return false;
  return revealedSectionIdsForViewer.has(sectionId);
}
