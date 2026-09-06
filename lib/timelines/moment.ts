import { and, eq, isNull } from 'drizzle-orm';
import { db, schema } from '@/lib/db';
import {
  applyAnchor,
  clampPrecision,
  clampToAnchor,
  formatWhen,
  isAnchorUnit,
  isScale,
  parseDutchDate,
  snapTo,
  type AnchorUnit,
  type Precision,
  type Scale,
} from './time';

/**
 * §35: the one place a moment is written.
 *
 * A gebeurtenis on a tijdlijn and the date in an artikel's infobox are two
 * faces of the same fact, and from this round they are kept in step: dragging
 * a tag along the axis rewrites `entries.fields.date`, and editing that field
 * moves every gebeurtenis of that artikel on every tijdlijn. Both legs go
 * through this module, so there are never two writers with two opinions.
 *
 * Nick's rule for the collisions this invites is **the last drag wins**: an
 * artikel that sits on four tijdlijnen has one date, the one the hand last
 * put it on, and the other three tags follow — each re-snapped to *its* own
 * gebeurtenis's precision and re-anchored to *its* own tijdlijn.
 *
 * Two things this file deliberately does not do:
 *
 *  - it does not import `lib/entries/service.ts`. That would be a cycle
 *    (`updateEntry` calls this file), and `updateEntry` routes somebody who
 *    may see an artikel but not edit it into `pending_edits` — a drag on a
 *    tijdlijn they *may* edit must not silently become a proposal.
 *  - it never calls back into `lib/timelines/service.ts`. Both legs move rows
 *    with plain drizzle, and `busy` below is the belt to that pair of braces:
 *    whichever leg starts, the other one is a no-op until it is done.
 */

/** The guard between the two legs: whichever is running, the other stands still. */
let busy = false;

/** The moment an artikel's infobox says, or nothing readable. */
export function momentFromEntry(entryId: string): { at: number; precision: Precision } | null {
  const row = db
    .select({ fields: schema.entries.fields })
    .from(schema.entries)
    .where(eq(schema.entries.id, entryId))
    .get();
  const raw = (row?.fields as Record<string, unknown> | undefined)?.date;
  if (typeof raw !== 'string' || !raw.trim()) return null;
  return parseDutchDate(raw);
}

/**
 * Writes the moment back into the artikel's `date` field, as it would have
 * been typed ("12 maart 1931"). Plain drizzle on purpose — see the note above
 * — which also means the change announces itself as `entry:{id}` like any
 * other write to the row (§21).
 */
export function writeEntryDate(entryId: string, at: number, precision: Precision): boolean {
  if (busy) return false;
  const row = db
    .select({ fields: schema.entries.fields, deletedAt: schema.entries.deletedAt })
    .from(schema.entries)
    .where(eq(schema.entries.id, entryId))
    .get();
  if (!row || row.deletedAt) return false;
  const fields = { ...((row.fields as Record<string, unknown>) ?? {}) };
  const next = formatWhen(at, precision);
  if (fields.date === next) return false;
  fields.date = next;
  busy = true;
  try {
    db.update(schema.entries)
      .set({ fields, updatedAt: Math.floor(Date.now() / 1000) })
      .where(eq(schema.entries.id, entryId))
      .run();
  } finally {
    busy = false;
  }
  return true;
}

type TimelineShape = { scale: Scale; anchorAt: number | null; anchorUnit: AnchorUnit | null };

function asScale(value: unknown): Scale {
  return isScale(value) ? value : 'day';
}

function asAnchorUnit(value: unknown): AnchorUnit | null {
  return isAnchorUnit(value) ? value : null;
}

/**
 * Where a moment lands on this tijdlijn: snapped to the unit the gebeurtenis
 * is actually known to (never finer — a drag does not invent precision), then
 * moved onto the anchor's day and held inside it.
 */
export function momentOnTimeline(at: number, precision: Precision, timeline: TimelineShape): number {
  const unit = clampPrecision(precision, timeline.scale);
  const snapped = snapTo(at, unit);
  const anchored = applyAnchor(snapped, timeline.anchorAt, timeline.anchorUnit);
  return clampToAnchor(anchored, unit, timeline.anchorAt, timeline.anchorUnit);
}

/** Every gebeurtenis of this artikel, with the tijdlijn each one is on. */
function eventsOfEntry(entryId: string) {
  return db
    .select({
      id: schema.timelineEvents.id,
      timelineId: schema.timelineEvents.timelineId,
      at: schema.timelineEvents.at,
      precision: schema.timelineEvents.precision,
      scale: schema.timelines.scale,
      anchorAt: schema.timelines.anchorAt,
      anchorUnit: schema.timelines.anchorUnit,
    })
    .from(schema.timelineEvents)
    .innerJoin(schema.timelines, eq(schema.timelines.id, schema.timelineEvents.timelineId))
    .where(and(eq(schema.timelineEvents.entryId, entryId), isNull(schema.timelines.deletedAt)))
    .all();
}

function moveRow(eventId: string, timelineId: string, at: number, precision?: Precision) {
  const now = Math.floor(Date.now() / 1000);
  db.update(schema.timelineEvents)
    .set(precision === undefined ? { at, updatedAt: now } : { at, precision, updatedAt: now })
    .where(eq(schema.timelineEvents.id, eventId))
    .run();
  // The tijdlijn itself moved too: its shelf row, and everyone watching it.
  db.update(schema.timelines).set({ updatedAt: now }).where(eq(schema.timelines.id, timelineId)).run();
}

/**
 * "Last drag wins": the artikel's other gebeurtenissen follow the one that was
 * just dragged. Each lands at the same moment read through its own tijdlijn —
 * a year-grained tag on a tijdlijn of years stays on its year.
 */
export function moveEntryEvents(entryId: string, at: number, options: { except?: string } = {}): number {
  if (busy) return 0;
  busy = true;
  try {
    let moved = 0;
    for (const row of eventsOfEntry(entryId)) {
      if (options.except && row.id === options.except) continue;
      const next = momentOnTimeline(at, isScale(row.precision) ? row.precision : asScale(row.scale), {
        scale: asScale(row.scale),
        anchorAt: row.anchorAt ?? null,
        anchorUnit: asAnchorUnit(row.anchorUnit),
      });
      if (next === row.at) continue;
      moveRow(row.id, row.timelineId, next);
      moved++;
    }
    return moved;
  } finally {
    busy = false;
  }
}

/**
 * The reverse leg: the artikel's date was edited, so every gebeurtenis of it
 * moves. The artikel is the one that spoke, so the gebeurtenissen take its
 * precision as well as its moment — stored as it was said and clamped to each
 * tijdlijn's scale at read time, exactly as §32 has always done.
 *
 * Called from `updateEntry` where `patch.fields` is handled; a date that is
 * not a date moves nothing.
 */
export function syncEventsFromEntryDate(entryId: string): number {
  if (busy) return 0;
  const moment = momentFromEntry(entryId);
  if (!moment) return 0;
  busy = true;
  try {
    let moved = 0;
    for (const row of eventsOfEntry(entryId)) {
      const timeline: TimelineShape = {
        scale: asScale(row.scale),
        anchorAt: row.anchorAt ?? null,
        anchorUnit: asAnchorUnit(row.anchorUnit),
      };
      const next = momentOnTimeline(moment.at, moment.precision, timeline);
      if (next === row.at && row.precision === moment.precision) continue;
      moveRow(row.id, row.timelineId, next, moment.precision);
      moved++;
    }
    return moved;
  } finally {
    busy = false;
  }
}
