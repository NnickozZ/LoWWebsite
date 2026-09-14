import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';

/**
 * §69, round 35: a buried speld and a buried gebeurtenis are gone *everywhere*.
 *
 * Round 35 stopped asking "weet je het zeker?" before a speld or a gebeurtenis
 * is taken off its canvas, and moved the question into the toast afterwards as
 * an *Ongedaan maken*. That promise is only honest if there is a row to put
 * back, so `removePin` and `removeEvent` set `deleted_at` instead of deleting —
 * and the price of keeping the row is that **every read has to say it does not
 * want it**.
 *
 * That price is exactly the failure mode §66 wrote `family-tree-spine.test.ts`
 * for, so this file copies its shape. A read that forgets the filter does not
 * crash and does not look wrong anywhere near itself: a speld is off the
 * landkaart and still on the web, still under "Genoemd in", still counted on
 * the shelf. One place at a time, in silence, weeks apart.
 *
 * So each road that can see one of these two tables is asked here, against a
 * real SQLite file, with one live row and one buried row side by side. A new
 * read of `map_pins` or `timeline_events` belongs in this file on the day it is
 * written — copy the list, do not rediscover it.
 *
 * The two roads that deliberately **do** see buried rows are asked too, at the
 * bottom: a destroy counts and takes them, because they are going either way.
 */

const dir = mkdtempSync(join(tmpdir(), 'zcf-buried-'));
process.env.DATA_DIR = dir;

type Deps = {
  sqlite: typeof import('@/lib/db').sqlite;
  listPins: typeof import('@/lib/maps/service').listPins;
  getPin: typeof import('@/lib/maps/service').getPin;
  listMaps: typeof import('@/lib/maps/service').listMaps;
  listPinsForEntry: typeof import('@/lib/maps/service').listPinsForEntry;
  viewerCanEditPin: typeof import('@/lib/maps/service').viewerCanEditPin;
  restorePin: typeof import('@/lib/maps/service').restorePin;
  removePin: typeof import('@/lib/maps/service').removePin;
  listEvents: typeof import('@/lib/timelines/service').listEvents;
  getEvent: typeof import('@/lib/timelines/service').getEvent;
  listTimelines: typeof import('@/lib/timelines/service').listTimelines;
  listEventsForEntry: typeof import('@/lib/timelines/service').listEventsForEntry;
  restoreEvent: typeof import('@/lib/timelines/service').restoreEvent;
  removeEvent: typeof import('@/lib/timelines/service').removeEvent;
  buildWebGraph: typeof import('@/lib/web/service').buildWebGraph;
  recomputeMapMentions: typeof import('@/lib/entries/mentions').recomputeMapMentions;
  recomputeTimelineMentions: typeof import('@/lib/entries/mentions').recomputeTimelineMentions;
  sweepDeletedRows: typeof import('@/lib/db/sweep').sweepDeletedRows;
  DELETED_ROW_TTL_MS: typeof import('@/lib/db/sweep').DELETED_ROW_TTL_MS;
};
let deps: Deps;

const KEEPER = { id: 'keeper-1', isKeeper: true };

beforeAll(async () => {
  const dbModule = await import('@/lib/db');
  const maps = await import('@/lib/maps/service');
  const timelines = await import('@/lib/timelines/service');
  const web = await import('@/lib/web/service');
  const mentions = await import('@/lib/entries/mentions');
  const sweep = await import('@/lib/db/sweep');
  deps = {
    sqlite: dbModule.sqlite,
    listPins: maps.listPins,
    getPin: maps.getPin,
    listMaps: maps.listMaps,
    listPinsForEntry: maps.listPinsForEntry,
    viewerCanEditPin: maps.viewerCanEditPin,
    restorePin: maps.restorePin,
    removePin: maps.removePin,
    listEvents: timelines.listEvents,
    getEvent: timelines.getEvent,
    listTimelines: timelines.listTimelines,
    listEventsForEntry: timelines.listEventsForEntry,
    restoreEvent: timelines.restoreEvent,
    removeEvent: timelines.removeEvent,
    buildWebGraph: web.buildWebGraph,
    recomputeMapMentions: mentions.recomputeMapMentions,
    recomputeTimelineMentions: mentions.recomputeTimelineMentions,
    sweepDeletedRows: sweep.sweepDeletedRows,
    DELETED_ROW_TTL_MS: sweep.DELETED_ROW_TTL_MS,
  };
  const run = (sql: string, ...args: unknown[]) => deps.sqlite.prepare(sql).run(...args);

  run(
    `INSERT INTO users (id, username, username_lower, password_hash, password_enc, is_keeper)
     VALUES ('keeper-1', 'Keeper', 'keeper', 'x', 'x', 1)`,
  );
  run(
    `INSERT INTO entries (id, type_id, name, slug, fields, tags, visibility, created_by, view_mode)
     VALUES ('e-vuurtoren', 'location', 'De vuurtoren', 'de-vuurtoren', '{}', '[]', 'all', 'keeper-1', 'all')`,
  );

  run(
    `INSERT INTO maps (id, name, slug, asset_id, width, height, created_by, view_mode, edit_mode)
     VALUES ('m1', 'Het eiland', 'het-eiland', 'a1', 1000, 800, 'keeper-1', 'all', 'all')`,
  );
  const pin = (id: string, deletedAt: number | null) =>
    run(
      `INSERT INTO map_pins (id, map_id, kind, entry_id, name, x, y, created_by, deleted_at)
       VALUES (?, 'm1', 'entry', 'e-vuurtoren', 'De vuurtoren', 0.5, 0.5, 'keeper-1', ?)`,
      id,
      deletedAt,
    );
  pin('p-live', null);
  pin('p-buried', 1000);

  run(
    `INSERT INTO timelines (id, name, slug, scale, created_by, view_mode, edit_mode)
     VALUES ('t1', 'De nacht', 'de-nacht', 'hour', 'keeper-1', 'all', 'all')`,
  );
  const event = (id: string, deletedAt: number | null) =>
    run(
      `INSERT INTO timeline_events (id, timeline_id, kind, entry_id, name, at, precision, created_by, deleted_at)
       VALUES (?, 't1', 'entry', 'e-vuurtoren', 'De vuurtoren', 100, 'hour', 'keeper-1', ?)`,
      id,
      deletedAt,
    );
  event('ev-live', null);
  event('ev-buried', 1000);
});

describe('§69 een begraven speld', () => {
  it('staat niet op de landkaart', () => {
    const ids = deps.listPins('m1', KEEPER).map((p) => p.id);
    expect(ids).toEqual(['p-live']);
  });

  it('is niet op te vragen', () => {
    expect(deps.getPin('p-live', KEEPER)).toBeDefined();
    expect(deps.getPin('p-buried', KEEPER)).toBeUndefined();
  });

  it('telt niet mee op de plank', () => {
    // The shelf's `pinCount` is three separate tallies (note, entry, map); this
    // row is an entry pin, and the other two are counted by the same helper.
    const shelf = deps.listMaps(KEEPER).find((m) => m.id === 'm1');
    expect(shelf?.pinCount).toBe(1);
  });

  it('zet het artikel op geen enkele landkaart', () => {
    // One speld named, not two — the buried one adds nothing to "Op de landkaart".
    const where = deps.listPinsForEntry('e-vuurtoren', KEEPER);
    expect(where.map((row) => row.pinId)).toEqual(['p-live']);
  });

  it('is niet te bewerken, dus een tweede Delete doet niets', () => {
    expect(deps.viewerCanEditPin('p-live', KEEPER)).toBe(true);
    expect(deps.viewerCanEditPin('p-buried', KEEPER)).toBe(false);
    expect(() => deps.removePin('p-buried', KEEPER)).toThrow();
  });

  it('tekent geen lijn in het web', () => {
    const graph = deps.buildWebGraph(KEEPER, {});
    const pinEdges = graph.edges.filter((e) => e.kind === 'pin');
    expect(pinEdges).toHaveLength(1);
  });

  it('noemt niemand onder "Genoemd in"', () => {
    deps.recomputeMapMentions('m1');
    const rows = deps.sqlite
      .prepare(`SELECT COUNT(*) AS n FROM entry_mentions WHERE from_kind = 'map' AND from_id = 'm1'`)
      .get() as { n: number };
    expect(rows.n).toBe(1);
  });
});

describe('§69 een begraven gebeurtenis', () => {
  it('staat niet op de as', () => {
    expect(deps.listEvents('t1', KEEPER).map((e) => e.id)).toEqual(['ev-live']);
  });

  it('is niet op te vragen', () => {
    expect(deps.getEvent('ev-live', KEEPER)).toBeDefined();
    expect(deps.getEvent('ev-buried', KEEPER)).toBeUndefined();
  });

  it('telt niet mee op de plank', () => {
    const shelf = deps.listTimelines(KEEPER).find((t) => t.id === 't1');
    expect(shelf?.eventCount).toBe(1);
  });

  it('zet het artikel op geen enkele tijdlijn', () => {
    expect(deps.listEventsForEntry('e-vuurtoren', KEEPER)).toHaveLength(1);
  });

  it('is niet te verwijderen, dus een tweede Delete doet niets', () => {
    expect(() => deps.removeEvent('ev-buried', KEEPER)).toThrow();
  });

  it('tekent geen lijn in het web', () => {
    const graph = deps.buildWebGraph(KEEPER, {});
    expect(graph.edges.filter((e) => e.kind === 'event')).toHaveLength(1);
  });

  it('noemt niemand onder "Genoemd in"', () => {
    deps.recomputeTimelineMentions('t1');
    const rows = deps.sqlite
      .prepare(`SELECT COUNT(*) AS n FROM entry_mentions WHERE from_kind = 'timeline' AND from_id = 't1'`)
      .get() as { n: number };
    expect(rows.n).toBe(1);
  });
});

describe('§69 terugzetten', () => {
  it('geeft de gebeurtenis terug die zonder vragen weg was', () => {
    expect(deps.restoreEvent('ev-buried', KEEPER)).toBe(true);
    expect(deps.getEvent('ev-buried', KEEPER)?.id).toBe('ev-buried');
    expect(deps.listEvents('t1', KEEPER).map((e) => e.id).sort()).toEqual(['ev-buried', 'ev-live']);
  });

  it('geeft de speld terug met dezelfde id en dezelfde hand', () => {
    expect(deps.restorePin('p-buried', KEEPER)).toBe(true);
    const back = deps.getPin('p-buried', KEEPER);
    expect(back?.id).toBe('p-buried');
    // The point of the column rather than a re-POST: the author is the one who
    // set it, not whoever pressed undo.
    expect(
      (deps.sqlite.prepare(`SELECT created_by AS by FROM map_pins WHERE id = 'p-buried'`).get() as { by: string }).by,
    ).toBe('keeper-1');
    // …and it is on the landkaart again.
    expect(deps.listPins('m1', KEEPER).map((p) => p.id).sort()).toEqual(['p-buried', 'p-live']);
  });

  it('geeft de gebeurtenis terug, met haar plaatje', () => {
    /*
     * A **note** gebeurtenis, because that is the one that carries a picture of
     * its own (an artikel gebeurtenis borrows its artikel's cover, `assetId` in
     * `lib/db/schema.ts`) — and it is the whole reason this is a column rather
     * than a re-POST: `POST /api/timelines/[id]/events` cannot accept an
     * `assetId` at all, so a remade gebeurtenis would come back blank and be
     * called an undo.
     */
    deps.sqlite
      .prepare(
        `INSERT INTO timeline_events (id, timeline_id, kind, name, text, at, precision, asset_id, show_image, created_by, deleted_at)
         VALUES ('ev-foto', 't1', 'note', 'Het licht ging uit', 'om kwart voor', 300, 'hour', 'a9', 1, 'keeper-1', 1000)`,
      )
      .run();
    expect(deps.getEvent('ev-foto', KEEPER)).toBeUndefined();

    expect(deps.restoreEvent('ev-foto', KEEPER)).toBe(true);
    const back = deps.getEvent('ev-foto', KEEPER);
    expect(back?.assetId).toBe('a9');
    expect(back?.showImage).toBe(true);
    // …and the words it was written with, which a remake would also have lost.
    expect(back?.text).toBe('om kwart voor');
  });

  it('zegt nee in plaats van te doen alsof, als er niets te halen is', () => {
    // Already back: not buried, so there is nothing to restore.
    expect(deps.restorePin('p-buried', KEEPER)).toBe(false);
    expect(deps.restoreEvent('ev-buried', KEEPER)).toBe(false);
    expect(deps.restoreEvent('ev-foto', KEEPER)).toBe(false);
    // And a row that never existed.
    expect(deps.restorePin('p-nergens', KEEPER)).toBe(false);
    expect(deps.restoreEvent('ev-nergens', KEEPER)).toBe(false);
  });
});

describe('§69 de veger', () => {
  it('laat staan wat binnen de dag valt en haalt weg wat erbuiten valt', () => {
    const nowMs = Date.now();
    const recent = Math.floor(nowMs / 1000) - 60;
    const old = Math.floor((nowMs - deps.DELETED_ROW_TTL_MS) / 1000) - 60;
    const run = (sql: string, ...args: unknown[]) => deps.sqlite.prepare(sql).run(...args);
    run(
      `INSERT INTO map_pins (id, map_id, kind, name, x, y, created_by, deleted_at)
       VALUES ('p-vers', 'm1', 'note', 'Vers', 0.2, 0.2, 'keeper-1', ?)`,
      recent,
    );
    run(
      `INSERT INTO map_pins (id, map_id, kind, name, x, y, created_by, deleted_at)
       VALUES ('p-oud', 'm1', 'note', 'Oud', 0.3, 0.3, 'keeper-1', ?)`,
      old,
    );
    run(
      `INSERT INTO timeline_events (id, timeline_id, kind, name, at, precision, created_by, deleted_at)
       VALUES ('ev-oud', 't1', 'note', 'Oud', 200, 'hour', 'keeper-1', ?)`,
      old,
    );

    const swept = deps.sweepDeletedRows(nowMs);
    expect(swept).toEqual({ pins: 1, events: 1 });

    const left = deps.sqlite.prepare(`SELECT id FROM map_pins ORDER BY id`).all() as { id: string }[];
    expect(left.map((r) => r.id)).toEqual(['p-buried', 'p-live', 'p-vers']);
    // A swept row cannot be put back, and `restorePin` says so rather than
    // answering true about nothing.
    expect(deps.restorePin('p-oud', KEEPER)).toBe(false);
  });

  it('laat een levende rij met rust, hoe oud hij ook is', () => {
    expect(deps.sweepDeletedRows(Date.now())).toEqual({ pins: 0, events: 0 });
    expect(deps.getPin('p-live', KEEPER)).toBeDefined();
  });
});
