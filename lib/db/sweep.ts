import { and, inArray, isNotNull, lt } from 'drizzle-orm';
import { db, schema, sqlite } from '@/lib/db';

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

/**
 * §98 (ronde 59): the handles nothing points at any more.
 *
 * A handle (`mention_handles`, §95) is minted per *mention*, the moment a name
 * is picked from the list — so a chip typed and deleted again, an artikel whose
 * maakblad was closed, a speld taken off a map and swept above, a revision
 * pruned: each leaves a row that no text will ever read. Harmless (it says
 * nothing by itself), but a table that only grows.
 *
 * Safe means *nothing uses it*, and "nothing" is asked of the whole database,
 * not of a list of columns this function happens to know: every text and blob
 * column of every table, the stored live-room state included, is read once and
 * every run of handle characters in it counts as a use. That way a column a
 * later round adds — a prikbord's omschrijving, a handle kept as an attribute in
 * the lopende tekst — is covered on the day it exists, without anybody
 * remembering to come back here. Two more margins:
 *
 *  - only handles older than `HANDLE_TTL_MS`: a chip can live for a while in a
 *    place this cannot read — a maakblad in a browser, an editor's undo — and a
 *    month is longer than any of those;
 *  - never at any other moment than start-up, when no room is open in memory
 *    (same reasoning as the two sweeps above).
 *
 * A handle whose artikel is gone but whose text still holds it stays: it is
 * still "used", and it reads as nothing either way.
 */
export const HANDLE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

const RUN = /[A-Za-z0-9_-]{6,}/g;

export function sweepMentionHandles(nowMs: number = Date.now()): number {
  const has = (name: string) =>
    Boolean(sqlite.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(name));
  if (!has('mention_handles')) return 0;
  const cutoff = Math.floor((nowMs - HANDLE_TTL_MS) / 1000);
  const candidates = new Set(
    (sqlite.prepare('SELECT handle FROM mention_handles WHERE created_at < ?').all(cutoff) as { handle: string }[]).map(
      (row) => row.handle,
    ),
  );
  if (!candidates.size) return 0;

  const tables = (
    sqlite
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE 'entries_fts%' AND name <> 'mention_handles'",
      )
      .all() as { name: string }[]
  ).map((row) => row.name);

  const seen = (value: unknown) => {
    if (value == null || !candidates.size) return;
    const text = typeof value === 'string' ? value : Buffer.isBuffer(value) ? value.toString('latin1') : null;
    if (!text) return;
    for (const match of text.matchAll(RUN)) {
      const run = match[0];
      if (run.length > 34) continue;
      candidates.delete(run);
      // In a blob a length byte can sit right against the handle; one letter
      // either side is enough to cover that.
      if (run.length > 6) {
        candidates.delete(run.slice(1));
        candidates.delete(run.slice(0, -1));
      }
    }
  };

  for (const table of tables) {
    if (!candidates.size) break;
    const columns = (sqlite.prepare(`PRAGMA table_info("${table}")`).all() as { name: string; type: string }[]).filter(
      (column) => !/INT|REAL|NUM/i.test(column.type),
    );
    if (!columns.length) continue;
    const read = sqlite.prepare(`SELECT ${columns.map((column) => `"${column.name}"`).join(', ')} FROM "${table}"`).raw();
    for (const row of read.iterate() as Iterable<unknown[]>) {
      for (const value of row) seen(value);
      if (!candidates.size) break;
    }
  }

  const gone = [...candidates];
  for (let at = 0; at < gone.length; at += 400) {
    db.delete(schema.mentionHandles).where(inArray(schema.mentionHandles.handle, gone.slice(at, at + 400))).run();
  }
  return gone.length;
}
