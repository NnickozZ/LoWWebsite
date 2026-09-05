import { sql, type SQL } from 'drizzle-orm';
import { viewableCondition } from '@/lib/access';
import { schema } from '@/lib/db';
import type { Visibility } from '@/lib/db/schema';

export type Viewer = { id: string; isKeeper: boolean } | null;

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
  if (viewer?.isKeeper) return notDeleted;
  const owner = viewableCondition('entry', viewer);
  if (!viewer) return sql`${notDeleted} AND ${schema.entries.visibility} = 'all' AND ${owner}`;
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
  if (entry.deletedAt) return Boolean(viewer?.isKeeper);
  if (viewer?.isKeeper) return true;
  if (entry.visibility === 'all') return true;
  if (entry.visibility === 'keeper') return false;
  if (!viewer || !entryId) return false;
  return revealedEntryIdsForViewer.has(entryId);
}

export function canSeeSection(
  section: { visibility: Visibility },
  viewer: Viewer,
  revealedSectionIdsForViewer: ReadonlySet<string> = new Set(),
  sectionId?: string,
): boolean {
  if (viewer?.isKeeper) return true;
  if (section.visibility === 'all') return true;
  if (section.visibility === 'keeper') return false;
  if (!viewer || !sectionId) return false;
  return revealedSectionIdsForViewer.has(sectionId);
}
