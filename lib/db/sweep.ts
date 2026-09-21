import { and, isNotNull, lt } from 'drizzle-orm';
import { db, schema } from '@/lib/db';

/**
 * §69, round 35: the rows that are buried rather than deleted, swept.
 *
 * A speld and a gebeurtenis are taken off their canvas without being asked
 * about; the question moved into the toast afterwards as an *Ongedaan maken*,
 * and that promise is only honest because `removePin` and `removeEvent` keep
 * the row and set `deleted_at` (see `mapPins.deletedAt` in `lib/db/schema.ts`).
 *
 * That memory is for one toast, not for ever. Nobody browses a bin looking for
 * a speld — `lib/admin/trash.ts` is the prullenbak, and it is for the six kinds
 * of container a Keeper hands back *by name* — so a buried row that nobody came
 * back for is just weight in the table, and one more row every read has to
 * filter past. A day is generous for a decision somebody makes in four seconds,
 * and it is long enough that a server restarted in the middle of an evening
 * does not take somebody's undo away.
 *
 * Deliberately **not** a timer. The archive runs on one small machine and a
 * background interval is a thing that keeps a process alive, fires while a
 * migration is half-applied, and has to be torn down in tests. This runs once
 * at start-up, from `instrumentation.ts`, next to the mentions backfill and for
 * the same reason: a server that has been up for a month has swept once, which
 * is exactly as often as it matters.
 */
export const DELETED_ROW_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * Take away every buried speld and gebeurtenis older than the window. Answers
 * how many of each went, for the start-up log.
 *
 * This is the one place in the app that really deletes either row. It is safe
 * to call at any moment: a row still inside the window is left alone, and
 * `restorePin` / `restoreEvent` answer `false` for one that has been swept,
 * which the canvas prints rather than pretending the undo worked.
 */
export function sweepDeletedRows(nowMs: number = Date.now()): { pins: number; events: number } {
  const cutoff = Math.floor((nowMs - DELETED_ROW_TTL_MS) / 1000);

  const pins = db
    .delete(schema.mapPins)
    .where(and(isNotNull(schema.mapPins.deletedAt), lt(schema.mapPins.deletedAt, cutoff)))
    .run();
  const events = db
    .delete(schema.timelineEvents)
    .where(and(isNotNull(schema.timelineEvents.deletedAt), lt(schema.timelineEvents.deletedAt, cutoff)))
    .run();

  return { pins: pins.changes ?? 0, events: events.changes ?? 0 };
}

/**
 * §89: sessions past their expiry. `getSessionUser` already ignores them, so
 * this is housekeeping rather than a lock — but a table that only ever grows
 * is a table of every browser anybody ever signed in from. Once at start-up,
 * next to the buried rows above and for the same reason. Here rather than in
 * `lib/auth/session.ts`, because that file imports `next/headers` and this one
 * is the file `instrumentation.ts` is allowed to load (see `next.config.mjs`).
 */
export function sweepExpiredSessions(nowMs: number = Date.now()): number {
  const now = Math.floor(nowMs / 1000);
  return db.delete(schema.sessions).where(lt(schema.sessions.expiresAt, now)).run().changes ?? 0;
}
