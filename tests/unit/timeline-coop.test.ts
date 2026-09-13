import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { partsToSeconds } from '@/lib/timelines/time';

/**
 * §62: the tijdlijn with two people on it, on the server's side of it.
 *
 * One rule, and it is the expensive one: **typing in a gebeurtenis is not a
 * change to the tijdlijn.** The live room saves what is being typed about once
 * every 1.5 s, and every one of those writes used to touch `timelines.updatedAt`
 * (which is what every other screen watches through `timeline:{id}`) and
 * rewrite the whole tijdlijn's `entry_mentions`. So the other person's page
 * re-rendered itself about once a second while anybody typed, losing their pan,
 * their zoom and their open windows to it.
 *
 * A `live` write that changed only the words now leaves the tijdlijn's own row
 * alone and asks for the index in three seconds' time. Everything else — a
 * move, a picture, a rename through the API — is untouched.
 *
 * (CLAUDE.md §8's entry-origin trap: `DATA_DIR` is set before anything is
 * imported, and every import is dynamic and inside `beforeAll`.)
 */

const dir = mkdtempSync(join(tmpdir(), 'zcf-timeline-coop-'));
process.env.DATA_DIR = dir;

type Deps = {
  sqlite: typeof import('@/lib/db').sqlite;
  service: typeof import('@/lib/timelines/service');
  createEntry: typeof import('@/lib/entries/service').createEntry;
  keysOfStatement: typeof import('@/lib/live/changes').keysOfStatement;
};
let deps: Deps;

const BRAM = { id: 'bram', isKeeper: false };
/** §62: somebody else entirely, for the tijdlijn Bram may not read. */
const AAGJE = { id: 'aagje', isKeeper: false };
const MARCH_12 = partsToSeconds({ year: 1931, month: 3, day: 12 });

/** What the row says now, straight out of SQLite. */
function timelineUpdatedAt(id: string): number {
  return (deps.sqlite.prepare('SELECT updated_at AS at FROM timelines WHERE id = ?').get(id) as { at: number }).at;
}

/** Put the tijdlijn's clock back, so a bump of `now()` (whole seconds) shows. */
function ageTimeline(id: string, seconds = 600) {
  deps.sqlite.prepare('UPDATE timelines SET updated_at = updated_at - ? WHERE id = ?').run(seconds, id);
}

beforeAll(async () => {
  const dbModule = await import('@/lib/db');
  deps = {
    sqlite: dbModule.sqlite,
    service: await import('@/lib/timelines/service'),
    createEntry: (await import('@/lib/entries/service')).createEntry,
    keysOfStatement: (await import('@/lib/live/changes')).keysOfStatement,
  };
  for (const [id, name] of [
    ['bram', 'Bram'],
    ['aagje', 'Aagje'],
  ] as const) {
    deps.sqlite
      .prepare(
        `INSERT INTO users (id, username, username_lower, password_hash, password_enc, is_keeper) VALUES (?, ?, ?, 'x', 'x', 0)`,
      )
      .run(id, name, name.toLowerCase());
  }
});

afterAll(() => {
  deps?.service.flushPendingTimelineMentions();
  deps?.sqlite.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('typing in a gebeurtenis does not move the tijdlijn', () => {
  it('leaves updatedAt alone for a live write of the words only', () => {
    const line = deps.service.createTimeline({ name: 'Het getypte uur', scale: 'day' }, BRAM);
    const note = deps.service.addEvent(line.id, { kind: 'note', name: 'De storm', at: MARCH_12 }, BRAM);
    ageTimeline(line.id);
    const before = timelineUpdatedAt(line.id);

    deps.service.updateEvent(note.id, { text: 'Het waaide' }, BRAM, { live: true });
    deps.service.updateEvent(note.id, { text: 'Het waaide de hele nacht' }, BRAM, { live: true });
    deps.service.updateEvent(note.id, { name: 'De storm van maart' }, BRAM, { live: true });

    expect(timelineUpdatedAt(line.id)).toBe(before);
    // The gebeurtenis itself is written: the other screen's cheap pull is what
    // shows the new name, and that is served by the row, not by `updatedAt`.
    expect(deps.service.getEvent(note.id, BRAM)?.name).toBe('De storm van maart');
    expect(deps.service.getEvent(note.id, BRAM)?.text).toBe('Het waaide de hele nacht');
  });

  it('but a live write that moves it, or any write through the API, does', () => {
    const line = deps.service.createTimeline({ name: 'De verzette lijn', scale: 'day' }, BRAM);
    const note = deps.service.addEvent(line.id, { kind: 'note', name: 'Eerst', at: MARCH_12 }, BRAM);

    ageTimeline(line.id);
    const beforeMove = timelineUpdatedAt(line.id);
    deps.service.updateEvent(note.id, { at: MARCH_12 + 86400 }, BRAM, { live: true });
    expect(timelineUpdatedAt(line.id)).toBeGreaterThan(beforeMove);

    ageTimeline(line.id);
    const beforeSave = timelineUpdatedAt(line.id);
    deps.service.updateEvent(note.id, { text: 'Met een knop opgeslagen' }, BRAM);
    expect(timelineUpdatedAt(line.id)).toBeGreaterThan(beforeSave);
  });

  it('writes the index once for a burst of typing, not once per keystroke-batch', async () => {
    vi.useFakeTimers();
    try {
      const line = deps.service.createTimeline({ name: 'De index', scale: 'day' }, BRAM);
      const target = deps.createEntry({ typeSlug: 'event', name: 'De Vuurtoren van Westkapelle', createdBy: BRAM.id });
      const note = deps.service.addEvent(line.id, { kind: 'note', name: 'Aantekening', at: MARCH_12 }, BRAM);
      const mentions = () =>
        (
          deps.sqlite
            .prepare("SELECT count(*) AS n FROM entry_mentions WHERE from_kind = 'timeline' AND from_id = ?")
            .get(line.id) as { n: number }
        ).n;

      for (let i = 0; i < 8; i++) {
        deps.service.updateEvent(note.id, { text: `[[${target.name}]] nummer ${i}` }, BRAM, { live: true });
      }
      // Nothing yet: the index is owed, not written.
      expect(mentions()).toBe(0);
      vi.advanceTimersByTime(3100);
      expect(mentions()).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('writes what it still owes when the server is asked to stop', () => {
    vi.useFakeTimers();
    try {
      const line = deps.service.createTimeline({ name: 'De laatste woorden', scale: 'day' }, BRAM);
      const target = deps.createEntry({ typeSlug: 'event', name: 'De laatste boot', createdBy: BRAM.id });
      const note = deps.service.addEvent(line.id, { kind: 'note', name: 'Aantekening', at: MARCH_12 }, BRAM);
      deps.service.updateEvent(note.id, { text: `Over [[${target.name}]]` }, BRAM, { live: true });
      const mentions = () =>
        (
          deps.sqlite
            .prepare("SELECT count(*) AS n FROM entry_mentions WHERE from_kind = 'timeline' AND from_id = ?")
            .get(line.id) as { n: number }
        ).n;
      expect(mentions()).toBe(0);
      deps.service.flushPendingTimelineMentions();
      expect(mentions()).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('gone is not forbidden', () => {
  it('says whether the row is still there at all', () => {
    const line = deps.service.createTimeline({ name: 'De weggehaalde', scale: 'day' }, BRAM);
    const note = deps.service.addEvent(line.id, { kind: 'note', name: 'Even hier', at: MARCH_12 }, BRAM);
    expect(deps.service.eventExists(note.id)).toBe(true);
    expect(deps.service.viewerCanEditEvent(note.id, BRAM)).toBe(true);
    deps.service.removeEvent(note.id, BRAM);
    // Both answer "no" now, and only `eventExists` knows which "no" it is —
    // which is the whole of §62's 404 beside the 403.
    expect(deps.service.eventExists(note.id)).toBe(false);
    expect(deps.service.viewerCanEditEvent(note.id, BRAM)).toBe(false);
    expect(deps.service.EVENT_GONE).toBe('Deze gebeurtenis bestaat niet meer.');
  });

  it('but a hand that is not on this tijdlijn cannot tell gone from never', () => {
    /*
     * §62, the other half: "gone, or not for you" must be indistinguishable.
     * `eventExists` is a bare select with no viewer in it, and it used to run
     * *before* the rights check — so anybody could sort every id in the archive
     * into 404 ("there is such a gebeurtenis") and 403 ("there is not"),
     * including the ones on a tijdlijn they may not even know about.
     */
    const line = deps.service.createTimeline({ name: 'Van Aagje alleen', scale: 'day' }, AAGJE);
    deps.sqlite.prepare(`UPDATE timelines SET view_mode = 'private', edit_mode = 'private' WHERE id = ?`).run(line.id);
    const note = deps.service.addEvent(line.id, { kind: 'note', name: 'Geheim', at: MARCH_12 }, AAGJE);

    // Aagje's own hand: the two ids answer differently, which is the point of
    // §62's 404 — she is inside and may be told the row has gone.
    expect(deps.service.eventAccess(line.id, note.id, AAGJE)).toBe('ok');
    expect(deps.service.eventAccess(line.id, 'ev-does-not-exist', AAGJE)).toBe('gone');

    // Bram's: the same answer for an id that exists and one that never did.
    expect(deps.service.eventAccess(line.id, note.id, BRAM)).toBe('forbidden');
    expect(deps.service.eventAccess(line.id, 'ev-does-not-exist', BRAM)).toBe('forbidden');
    // And for a tijdlijn that does not exist either.
    expect(deps.service.eventAccess('tl-nope', note.id, BRAM)).toBe('forbidden');

    // A real id on another tijdlijn is judged on *that* tijdlijn, never on the
    // one in the address — the id in the path may not be used to borrow rights.
    const mine = deps.service.createTimeline({ name: 'Van Bram', scale: 'day' }, BRAM);
    expect(deps.service.eventAccess(mine.id, note.id, BRAM)).toBe('forbidden');
  });
});

describe('what a write of a gebeurtenis tells the site', () => {
  it('a bare UPDATE of the row names the gebeurtenis, never the tijdlijn', () => {
    const keys = deps.keysOfStatement(
      'update "timeline_events" set "updated_at" = ?, "text" = ? where "timeline_events"."id" = ?',
      [1, 'x', 'ev-1'],
    );
    expect(keys).toContain('event:ev-1');
    expect(keys.some((key) => key.startsWith('timeline:'))).toBe(false);
  });
});
