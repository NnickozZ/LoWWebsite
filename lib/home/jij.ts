/**
 * §91: de Jij-rij bovenaan Start — "verder waar je was".
 *
 * Pure on purpose, and fed by the Start's own feed rather than a query of its
 * own: `recentActivity(viewer, …)` already carries §9's visibility rule, §17's
 * dials and §46's side for *the reader*, and a second query here would be a
 * second set of rules to keep in step (the spelerspagina's *Bijdragen* reads
 * the feed for the same reason — `lib/spelers/panels.tsx`). What this adds is
 * the narrowing: one person's own work, one line per artikel, newest first.
 *
 * Rule 1 is therefore not re-implemented here and cannot be broken here: an
 * artikel the reader may not see is not in the feed that comes in, so it is
 * not in what goes out. The unit test asks it both ways.
 */

/** The little of a `FeedItem` this needs — so a test can hand it a plain row. */
export type WorkRow = {
  id: string;
  verb: string;
  createdAt: number;
  actorId: string | null;
  entry: { id: string } | null;
};

/** How far back Start reads before narrowing to one person — the spelerspagina's number. */
export const OWN_WORK_SCAN = 200;
/** And how many it shows. */
export const OWN_WORK_SHOWN = 3;

/**
 * Writing and editing, not everything that happens to an artikel: a `room.*`
 * row is a kamer being furnished (it names a stuk huisraad, which is an
 * artikel only in the technical sense), and a deletion is not somewhere you
 * can go back to.
 */
export function isOwnWork(verb: string): boolean {
  return verb.startsWith('entry.') && verb !== 'entry.deleted';
}

export function ownRecentWork<T extends WorkRow>(feed: readonly T[], userId: string, limit = OWN_WORK_SHOWN): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const row of feed) {
    if (row.actorId !== userId || !row.entry || !isOwnWork(row.verb)) continue;
    if (seen.has(row.entry.id)) continue;
    seen.add(row.entry.id);
    out.push(row);
    if (out.length >= limit) break;
  }
  return out;
}
