import { and, asc, eq, isNull } from 'drizzle-orm';
import { viewerCanEdit } from '@/lib/access';
import { db, schema } from '@/lib/db';
import { visibleCaseCondition } from '@/lib/cases/visibility';
import type { Viewer } from './visibility';

/**
 * §24, second half: `entries.origin_case_id` as a *living* reference.
 *
 * It used to be written once, when a `case_only` artikel was born, and never
 * again — so a mes moved out of Zaak Vlissingen into Zaak Domburg went on being
 * printed as "Zaak Vlissingen: het mes" in every list in the archive, which is
 * exactly the confusion §24 exists to prevent.
 *
 * The rule now is *follow, unless somebody said otherwise*:
 *
 *   - `originPinned` — a person chose this dossier by hand. Nothing but a
 *     person may move it, ever. Not a filing, not an unfiling, not a restore.
 *   - otherwise the origin is the **oldest** dossier the artikel is filed in
 *     (`case_entries.addedAt` ascending), and null when it is filed nowhere.
 *     Oldest, because "where it came from" is the first place it was, and
 *     because that answer does not change every time somebody files it again.
 *
 * `nextOriginCaseId` is the whole rule and is pure — it is what the test pins.
 * Everything below it is the database around that decision.
 */

/**
 * The origin an artikel should have, or `undefined` for "leave it exactly as
 * it is". Undefined and null are deliberately different answers here: null is
 * "adrift, and say so", undefined is "do not touch this row at all".
 */
export function nextOriginCaseId(
  current: string | null,
  pinned: boolean,
  filedInOldestFirst: string[],
): string | null | undefined {
  // A person chose it. That is the end of the matter.
  if (pinned) return undefined;

  const oldest = filedInOldestFirst[0] ?? null;

  if (current) {
    // Still filed where it says it came from: nothing to do. Note that this is
    // *is it in that dossier*, not *is it the oldest one* — filing a clue in a
    // second, older dossier must not silently rewrite where it came from.
    if (filedInOldestFirst.includes(current)) return undefined;
    return oldest;
  }

  // No origin yet, but it is in a dossier: it came from the oldest of them.
  return oldest === null ? undefined : oldest;
}

/**
 * The dossiers this artikel is filed in, oldest filing first.
 *
 * Deliberately *not* filtered by `visibleCaseCondition`: who is looking has
 * nothing to do with where a thing came from, and an origin that changed
 * depending on the reader would be a different value per person. Secrecy is
 * applied where the name is *printed* (`nameTheirCases`), never where it is
 * decided. A dossier in the bin is left out, though — the archive never prints
 * its name either, so an origin pointing at one is an origin nobody can read.
 */
function filedIn(entryId: string): string[] {
  return db
    .select({ caseId: schema.caseEntries.caseId })
    .from(schema.caseEntries)
    .innerJoin(schema.cases, eq(schema.cases.id, schema.caseEntries.caseId))
    .where(and(eq(schema.caseEntries.entryId, entryId), isNull(schema.cases.deletedAt)))
    .orderBy(asc(schema.caseEntries.addedAt), asc(schema.caseEntries.caseId))
    .all()
    .map((row) => row.caseId);
}

/**
 * Brings one artikel's origin back in line with the dossiers it is actually
 * filed in. Safe to call after any write to `case_entries`; it does nothing at
 * all when nothing has to change, so it never touches `updated_at` and never
 * puts a row on the feed for a change that was not one.
 *
 * Rule 16: the write goes through the ORM, so `lib/live/changes.ts` publishes
 * `entry:{id}` and `entries` by itself, and the wiki list somebody else has
 * open re-renders.
 */
export function reconcileOrigin(entryId: string): void {
  const row = db
    .select({
      originCaseId: schema.entries.originCaseId,
      originPinned: schema.entries.originPinned,
    })
    .from(schema.entries)
    .where(eq(schema.entries.id, entryId))
    .get();
  if (!row) return;

  const next = nextOriginCaseId(row.originCaseId, Boolean(row.originPinned), filedIn(entryId));
  if (next === undefined || next === row.originCaseId) return;

  db.update(schema.entries)
    .set({ originCaseId: next })
    .where(eq(schema.entries.id, entryId))
    .run();
}

/** Every artikel filed in this dossier, for a reconcile after the dossier goes. */
export function entryIdsInCase(caseId: string): string[] {
  return db
    .select({ entryId: schema.caseEntries.entryId })
    .from(schema.caseEntries)
    .where(eq(schema.caseEntries.caseId, caseId))
    .all()
    .map((row) => row.entryId);
}

export type OriginChoice = {
  /** The dossier to call this artikel's own, or null for "no dossier". */
  caseId?: string | null;
  /** False hands the artikel back to the rule above, and reconciles at once. */
  pinned: boolean;
};

/**
 * The Keeper's (or the owner's) hand on the dial, from the artikel page.
 *
 * §10: writing this is editing the artikel, so `viewerCanEdit` decides, and the
 * API answers 403 when it says no. §1: the dossier offered has to be one this
 * person may see *and* one the artikel is actually filed in — the menu only
 * lists those, and this is the rule behind the menu.
 */
export function setEntryOrigin(entryId: string, choice: OriginChoice, viewer: Viewer): void {
  if (!viewerCanEdit('entry', entryId, viewer)) {
    throw new Error('Je mag dit artikel niet bewerken.');
  }
  const entry = db
    .select({ id: schema.entries.id })
    .from(schema.entries)
    .where(eq(schema.entries.id, entryId))
    .get();
  if (!entry) throw new Error('Artikel niet gevonden');

  if (!choice.pinned) {
    // "Volgt vanzelf" again: let go of the dial, then answer the question the
    // rule would have answered all along.
    db.update(schema.entries)
      .set({ originPinned: false })
      .where(eq(schema.entries.id, entryId))
      .run();
    reconcileOrigin(entryId);
    return;
  }

  const caseId = choice.caseId ?? null;
  if (caseId) {
    // The same lookup `nameTheirCases` uses, so a dossier this person may not
    // open cannot be named here either — not even by guessing its id.
    const allowed = db
      .select({ id: schema.cases.id })
      .from(schema.caseEntries)
      .innerJoin(schema.cases, eq(schema.cases.id, schema.caseEntries.caseId))
      .where(
        and(
          eq(schema.caseEntries.entryId, entryId),
          eq(schema.caseEntries.caseId, caseId),
          visibleCaseCondition(viewer),
        ),
      )
      .get();
    if (!allowed) throw new Error('Dat dossier hoort niet bij dit artikel.');
  }

  db.update(schema.entries)
    .set({ originCaseId: caseId, originPinned: true })
    .where(eq(schema.entries.id, entryId))
    .run();
}
