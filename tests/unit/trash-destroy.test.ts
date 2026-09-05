import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * §11: the bottom of the bin.
 *
 * This is the only operation in the archive with nothing behind it, so what it
 * touches and what it leaves alone are both worth a test. The three claims:
 *
 *  1. It only reaches what is already in the bin. Everything soft-deletes
 *     first, so destroying is always a second decision taken later.
 *  2. Everything that only existed because of the thing goes with it, and the
 *     search index goes with it too — a row left in `entries_fts` would keep
 *     answering searches for a page that no longer exists.
 *  3. Nothing that belongs to something else goes with it. A dossier's
 *     artikelen survive it, and so do its prikborden — they become loose
 *     boards, because a board whose case id points at nothing cannot be opened
 *     at all.
 */

const dir = mkdtempSync(join(tmpdir(), 'zcf-destroy-'));
process.env.DATA_DIR = dir;

type Deps = {
  sqlite: typeof import('@/lib/db').sqlite;
  destroyFromTrash: typeof import('@/lib/admin/trash').destroyFromTrash;
  destroyEffects: typeof import('@/lib/admin/trash').destroyEffects;
  listTrash: typeof import('@/lib/admin/trash').listTrash;
  restoreFromTrash: typeof import('@/lib/admin/trash').restoreFromTrash;
};
let deps: Deps;

const KEEPER = 'keeper-1';
const count = (sql: string) => (deps.sqlite.prepare(sql).get() as { n: number }).n;

beforeAll(async () => {
  const dbModule = await import('@/lib/db');
  const trash = await import('@/lib/admin/trash');
  deps = {
    sqlite: dbModule.sqlite,
    destroyFromTrash: trash.destroyFromTrash,
    destroyEffects: trash.destroyEffects,
    listTrash: trash.listTrash,
    restoreFromTrash: trash.restoreFromTrash,
  };
  const { sqlite } = deps;

  sqlite
    .prepare(
      `INSERT INTO users (id, username, username_lower, password_hash, password_enc, is_keeper) VALUES ('keeper-1', 'Keeper', 'keeper', 'x', 'x', 1)`,
    )
    .run();

  const entry = (id: string, name: string, deleted: number | null) =>
    sqlite
      .prepare(
        `INSERT INTO entries (id, type_id, name, slug, fields, tags, created_by, deleted_at) VALUES (?, 'character', ?, ?, '{}', '[]', 'keeper-1', ?)`,
      )
      .run(id, name, id, deleted);

  entry('e-weg', 'Verkeerd aangemaakt', 500);
  entry('e-blijft', 'Blijft staan', null);

  sqlite
    .prepare(
      `INSERT INTO entries_fts (entry_id, name, short_description, body_text, tags) VALUES ('e-weg', 'Verkeerd aangemaakt', '', '', '')`,
    )
    .run();
  sqlite
    .prepare(
      `INSERT INTO entry_sections (id, entry_id, title, visibility, sort_order) VALUES ('s1', 'e-weg', 'Geheim', 'keeper', 0)`,
    )
    .run();
  sqlite
    .prepare(`INSERT INTO entry_section_reveals (section_id, user_id) VALUES ('s1', 'keeper-1')`)
    .run();
  sqlite
    .prepare(
      `INSERT INTO entry_revisions (id, entry_id, snapshot, edited_by) VALUES ('r1', 'e-weg', '{}', 'keeper-1')`,
    )
    .run();
  sqlite
    .prepare(`INSERT INTO entry_links (from_entry_id, to_entry_id, kind, label) VALUES ('e-blijft', 'e-weg', 'mention', '')`)
    .run();
  sqlite
    .prepare(
      `INSERT INTO pending_edits (id, entry_id, proposed_snapshot, proposed_by) VALUES ('p1', 'e-weg', '{}', 'keeper-1')`,
    )
    .run();
  sqlite
    .prepare(`INSERT INTO access_grants (target_type, target_id, user_id, can_view, can_edit) VALUES ('entry', 'e-weg', 'keeper-1', 1, 1)`)
    .run();

  // A dossier in the bin, with an artikel filed in it and a board hanging off it.
  sqlite
    .prepare(
      `INSERT INTO cases (id, name, slug, status, created_by, deleted_at) VALUES ('c-weg', 'Foute zaak', 'foute-zaak', 'open', 'keeper-1', 600)`,
    )
    .run();
  sqlite
    .prepare(`INSERT INTO case_entries (case_id, entry_id, added_by) VALUES ('c-weg', 'e-blijft', 'keeper-1')`)
    .run();
  sqlite
    .prepare(`INSERT INTO case_revisions (id, case_id, snapshot, edited_by) VALUES ('cr1', 'c-weg', '{}', 'keeper-1')`)
    .run();
  sqlite
    .prepare(
      `INSERT INTO boards (id, name, case_id, state, created_by) VALUES ('b-van-zaak', 'Bord van de zaak', 'c-weg', '{"cards":[]}', 'keeper-1')`,
    )
    .run();

  // A landkaart that is a map *of* the doomed artikel, and a speld on it.
  sqlite
    .prepare(
      `INSERT INTO maps (id, name, slug, asset_id, width, height, created_by, entry_id) VALUES ('m1', 'Plattegrond', 'plattegrond', 'a1', 10, 10, 'keeper-1', 'e-weg')`,
    )
    .run();
  sqlite
    .prepare(
      `INSERT INTO map_pins (id, map_id, kind, entry_id, x, y, created_by) VALUES ('pin1', 'm1', 'entry', 'e-weg', 0.5, 0.5, 'keeper-1')`,
    )
    .run();

  // A landkaart taken off the wall, with a speld on it. Until this round it
  // could not be got back at all — soft-deleted where nothing could reach it.
  sqlite
    .prepare(
      `INSERT INTO maps (id, name, slug, asset_id, width, height, created_by, description, deleted_at) VALUES ('m-weg', 'Oude kaart', 'oude-kaart', 'a2', 10, 10, 'keeper-1', 'De eerste tekening', 800)`,
    )
    .run();
  sqlite
    .prepare(
      `INSERT INTO map_pins (id, map_id, kind, name, x, y, created_by) VALUES ('pin2', 'm-weg', 'note', 'Hier lag de boot', 0.3, 0.3, 'keeper-1')`,
    )
    .run();

  // A board in the bin, with a version of its own.
  sqlite
    .prepare(
      `INSERT INTO boards (id, name, state, created_by, deleted_at) VALUES ('b-weg', 'Oud bord', '{"cards":[]}', 'keeper-1', 700)`,
    )
    .run();
  sqlite
    .prepare(`INSERT INTO board_revisions (id, board_id, snapshot, edited_by) VALUES ('br1', 'b-weg', '{}', 'keeper-1')`)
    .run();
});

afterAll(() => {
  deps?.sqlite.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('what it refuses', () => {
  it('will not touch anything that is not in the bin', () => {
    expect(() => deps.destroyFromTrash('entry', 'e-blijft', KEEPER)).toThrow(/prullenbak/i);
    expect(() => deps.destroyFromTrash('entry', 'bestaat-niet', KEEPER)).toThrow(/prullenbak/i);
    expect(count(`SELECT count(*) n FROM entries WHERE id = 'e-blijft'`)).toBe(1);
  });
});

describe('what it says will happen', () => {
  it('counts the real rows rather than guessing', () => {
    const labels = Object.fromEntries(
      deps.destroyEffects('entry', 'e-weg').map((effect) => [effect.label, effect.count]),
    );
    expect(labels['verborgen stukken']).toBe(1);
    expect(labels['bewaarde versies']).toBe(1);
    expect(labels['spelden op landkaarten']).toBe(1);
    expect(labels['voorstellen']).toBe(1);
    expect(labels['landkaarten die niet langer van dit artikel zijn']).toBe(1);
    // Nothing with a count of nought is listed at all.
    expect(deps.destroyEffects('entry', 'e-weg').every((effect) => effect.count > 0)).toBe(true);
  });
});

describe('destroying an artikel', () => {
  it('takes everything that only existed because of it', () => {
    expect(deps.destroyFromTrash('entry', 'e-weg', KEEPER)).toBe('Verkeerd aangemaakt');

    expect(count(`SELECT count(*) n FROM entries WHERE id = 'e-weg'`)).toBe(0);
    expect(count(`SELECT count(*) n FROM entries_fts WHERE entry_id = 'e-weg'`)).toBe(0);
    expect(count(`SELECT count(*) n FROM entry_sections WHERE entry_id = 'e-weg'`)).toBe(0);
    expect(count(`SELECT count(*) n FROM entry_section_reveals WHERE section_id = 's1'`)).toBe(0);
    expect(count(`SELECT count(*) n FROM entry_revisions WHERE entry_id = 'e-weg'`)).toBe(0);
    expect(count(`SELECT count(*) n FROM entry_links WHERE to_entry_id = 'e-weg'`)).toBe(0);
    expect(count(`SELECT count(*) n FROM pending_edits WHERE entry_id = 'e-weg'`)).toBe(0);
    expect(count(`SELECT count(*) n FROM map_pins WHERE entry_id = 'e-weg'`)).toBe(0);
    expect(
      count(`SELECT count(*) n FROM access_grants WHERE target_type = 'entry' AND target_id = 'e-weg'`),
    ).toBe(0);
  });

  it('but leaves the landkaart hanging on the wall, of nothing', () => {
    expect(count(`SELECT count(*) n FROM maps WHERE id = 'm1'`)).toBe(1);
    expect(count(`SELECT count(*) n FROM maps WHERE id = 'm1' AND entry_id IS NULL`)).toBe(1);
  });

  it('and writes the name to the audit log, since nothing else holds it now', () => {
    const row = deps.sqlite
      .prepare(`SELECT action, meta FROM audit_log WHERE target_id = 'e-weg' AND action = 'entry.destroyed'`)
      .get() as { action: string; meta: string } | undefined;
    expect(row?.action).toBe('entry.destroyed');
    expect(JSON.parse(row!.meta).name).toBe('Verkeerd aangemaakt');
  });
});

describe('destroying a dossier', () => {
  it('does not take the artikelen in it, nor its prikborden', () => {
    expect(deps.destroyFromTrash('case', 'c-weg', KEEPER)).toBe('Foute zaak');

    expect(count(`SELECT count(*) n FROM cases WHERE id = 'c-weg'`)).toBe(0);
    expect(count(`SELECT count(*) n FROM case_entries WHERE case_id = 'c-weg'`)).toBe(0);
    expect(count(`SELECT count(*) n FROM case_revisions WHERE case_id = 'c-weg'`)).toBe(0);

    // The artikel that was filed in it is untouched…
    expect(count(`SELECT count(*) n FROM entries WHERE id = 'e-blijft'`)).toBe(1);
    // …and the board is still there, and still openable, because its case id
    // is null rather than pointing at a dossier that is gone.
    expect(count(`SELECT count(*) n FROM boards WHERE id = 'b-van-zaak'`)).toBe(1);
    expect(count(`SELECT count(*) n FROM boards WHERE id = 'b-van-zaak' AND case_id IS NULL`)).toBe(1);
  });
});

describe('destroying a prikbord', () => {
  it('takes its versions with it and leaves the bin one shorter', () => {
    const before = deps.listTrash().length;
    expect(deps.destroyFromTrash('board', 'b-weg', KEEPER)).toBe('Oud bord');
    expect(count(`SELECT count(*) n FROM boards WHERE id = 'b-weg'`)).toBe(0);
    expect(count(`SELECT count(*) n FROM board_revisions WHERE board_id = 'b-weg'`)).toBe(0);
    expect(deps.listTrash().length).toBe(before - 1);
  });
});

describe('a landkaart', () => {
  it('is in the bin at all, which it never used to be', () => {
    const map = deps.listTrash().find((item) => item.kind === 'map');
    expect(map?.name).toBe('Oude kaart');
    expect(map?.href).toBe('/maps/oude-kaart');
  });

  it('can be hung back up, with its spelden still where they were', () => {
    deps.restoreFromTrash('map', 'm-weg', KEEPER);
    expect(count(`SELECT count(*) n FROM maps WHERE id = 'm-weg' AND deleted_at IS NULL`)).toBe(1);
    expect(deps.listTrash().some((item) => item.kind === 'map')).toBe(false);
    // A speld is hidden with its map, never deleted with it.
    expect(count(`SELECT count(*) n FROM map_pins WHERE map_id = 'm-weg'`)).toBe(1);

    // …and back into the bin, for the two tests below.
    deps.sqlite.prepare("UPDATE maps SET deleted_at = 800 WHERE id = 'm-weg'").run();
  });

  it('says what goes with it before it goes', () => {
    const labels = Object.fromEntries(
      deps.destroyEffects('map', 'm-weg').map((effect) => [effect.label, effect.count]),
    );
    expect(labels['spelden erop']).toBe(1);
  });

  it('and destroying it takes the spelden — they are places on it', () => {
    expect(deps.destroyFromTrash('map', 'm-weg', KEEPER)).toBe('Oude kaart');
    expect(count(`SELECT count(*) n FROM maps WHERE id = 'm-weg'`)).toBe(0);
    expect(count(`SELECT count(*) n FROM map_pins WHERE map_id = 'm-weg'`)).toBe(0);
    expect(deps.listTrash().some((item) => item.kind === 'map')).toBe(false);
  });
});
