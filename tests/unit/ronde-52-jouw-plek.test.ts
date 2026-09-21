import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { afterPlaySwitch, showsWritingLine } from '@/lib/authorChoice';
import { isOwnWork, ownRecentWork, type WorkRow } from '@/lib/home/jij';

const dir = mkdtempSync(join(tmpdir(), 'zcf-ronde52-'));
process.env.DATA_DIR = dir;

/**
 * §91 (ronde 52, "Jouw plek"): the pure halves.
 *
 * One wie-regel: a wissel of *speelt als* takes this window's *schrijft als*
 * along, and the shell prints a second line only where the two really differ.
 */
describe('§91: één wie-regel', () => {
  it('prints one line for a window that never chose', () => {
    expect(showsWritingLine({ isKeeper: false, chosen: null, playing: 'kees' })).toBe(false);
    expect(showsWritingLine({ isKeeper: false, chosen: null, playing: null })).toBe(false);
  });

  it('prints one line when the window writes as the one the account plays', () => {
    expect(showsWritingLine({ isKeeper: false, chosen: 'kees', playing: 'kees' })).toBe(false);
  });

  it('prints two lines only for a window that deliberately chose another', () => {
    expect(showsWritingLine({ isKeeper: false, chosen: 'jan', playing: 'kees' })).toBe(true);
    // "Als jezelf" while this window still writes as somebody: that is a
    // difference too, and the line says so rather than hiding the name.
    expect(showsWritingLine({ isKeeper: false, chosen: 'jan', playing: null })).toBe(true);
  });

  it('never prints a second line for a Keeper', () => {
    expect(showsWritingLine({ isKeeper: true, chosen: 'jan', playing: null })).toBe(false);
  });

  it('moves the answer along with a wissel, and leaves it for "als jezelf"', () => {
    expect(afterPlaySwitch(null, 'kees')).toBe('kees');
    expect(afterPlaySwitch('jan', 'kees')).toBe('kees');
    expect(afterPlaySwitch('jan', null)).toBe('jan');
    expect(afterPlaySwitch(null, null)).toBe(null);
  });

  it('agrees with itself: after a wissel there is one line', () => {
    for (const chosen of [null, 'jan', 'kees']) {
      for (const playing of ['jan', 'kees']) {
        const next = afterPlaySwitch(chosen, playing);
        expect(showsWritingLine({ isKeeper: false, chosen: next, playing })).toBe(false);
      }
    }
  });
});

/* ------------------------------------------------ de Jij-rij op Start */

const row = (id: string, verb: string, actorId: string | null, entryId: string | null, at: number): WorkRow => ({
  id,
  verb,
  createdAt: at,
  actorId,
  entry: entryId ? { id: entryId } : null,
});

describe('§91: je laatste drie, puur', () => {
  it('keeps one person\'s writing, one line per artikel, newest first, three at most', () => {
    const feed = [
      row('1', 'entry.edited', 'bram', 'a', 9),
      row('2', 'entry.edited', 'aagje', 'b', 8),
      row('3', 'entry.created', 'bram', 'a', 7),
      row('4', 'room.placed', 'bram', 'klok', 6),
      row('5', 'entry.deleted', 'bram', 'weg', 5),
      row('6', 'entry.section_revealed', 'bram', 'c', 4),
      row('7', 'entry.edited', 'bram', 'd', 3),
      row('8', 'entry.edited', 'bram', 'e', 2),
    ];
    expect(ownRecentWork(feed, 'bram').map((item) => item.entry!.id)).toEqual(['a', 'c', 'd']);
    expect(ownRecentWork(feed, 'aagje').map((item) => item.entry!.id)).toEqual(['b']);
    expect(ownRecentWork(feed, 'niemand')).toEqual([]);
  });

  it('counts writing, not furnishing a kamer and not throwing away', () => {
    expect(isOwnWork('entry.edited')).toBe(true);
    expect(isOwnWork('entry.restored_revision')).toBe(true);
    expect(isOwnWork('entry.deleted')).toBe(false);
    expect(isOwnWork('room.placed')).toBe(false);
  });
});

describe('§91: je laatste drie, langs de weg die Start loopt (rule 1)', () => {
  let sqlite: typeof import('@/lib/db').sqlite;
  let recentActivity: typeof import('@/lib/entries/service').recentActivity;
  const BRAM = { id: 'bram', isKeeper: false };
  const KEEPER = { id: 'keeper-1', isKeeper: true };

  beforeAll(async () => {
    sqlite = (await import('@/lib/db')).sqlite;
    recentActivity = (await import('@/lib/entries/service')).recentActivity;
    const user = (id: string, name: string, keeper: number) =>
      sqlite
        .prepare(`INSERT INTO users (id, username, username_lower, password_hash, is_keeper) VALUES (?, ?, ?, 'x', ?)`)
        .run(id, name, name.toLowerCase(), keeper);
    user('keeper-1', 'Keeper', 1);
    user('bram', 'Bram', 0);
    const entry = (id: string, visibility = 'all') =>
      sqlite
        .prepare(
          `INSERT INTO entries (id, type_id, name, slug, fields, visibility, created_by, view_mode, edit_mode)
           VALUES (?, 'character', ?, ?, '{}', ?, 'bram', 'all', 'all')`,
        )
        .run(id, `Artikel ${id}`, id, visibility);
    for (const id of ['een', 'twee', 'drie', 'vier']) entry(id);
    const act = (id: string, entryId: string, at: number, actor = 'bram') =>
      sqlite
        .prepare(
          `INSERT INTO activity (id, actor_id, character_id, verb, entry_id, created_at) VALUES (?, ?, NULL, 'entry.edited', ?, ?)`,
        )
        .run(id, actor, entryId, at);
    act('a1', 'een', 100);
    act('a2', 'twee', 200);
    act('a3', 'drie', 300);
    act('a4', 'vier', 400);
    act('a5', 'een', 500, 'keeper-1');
  });

  afterAll(() => {
    sqlite.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('shows the reader his own last three', () => {
    const mine = ownRecentWork(recentActivity(BRAM, 200), 'bram');
    expect(mine.map((item) => item.entry!.id)).toEqual(['vier', 'drie', 'twee']);
  });

  it('drops an artikel the Keeper has since taken to his own side — the reader may not see it', () => {
    sqlite.prepare(`UPDATE entries SET visibility = 'keeper' WHERE id = 'vier'`).run();
    const mine = ownRecentWork(recentActivity(BRAM, 200), 'bram');
    expect(mine.map((item) => item.entry!.id)).toEqual(['drie', 'twee', 'een']);
    // And nothing of it survives in what the row would print.
    expect(JSON.stringify(mine)).not.toContain('Artikel vier');
  });

  it('gives the Keeper his own, and only his own', () => {
    const his = ownRecentWork(recentActivity(KEEPER, 200), 'keeper-1');
    expect(his.map((item) => item.entry!.id)).toEqual(['een']);
  });
});
