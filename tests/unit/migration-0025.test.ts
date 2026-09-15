import Database from 'better-sqlite3';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MIGRATIONS } from '@/lib/db/migrations.mjs';

type Migration = { name: string; sql: string };

/**
 * §70, round 36: does `0025_sections_and_pin_layer` actually carry a real
 * archive's secties across?
 *
 * This test exists because **nothing else could answer that.** Every other
 * suite, and every Playwright run, builds its database by running the whole
 * migration chain against an empty file — so by the time 0025's
 * `INSERT INTO sections … SELECT … FROM entry_sections` runs there is nothing
 * in `entry_sections` to copy, and a migration that dropped every row would
 * have passed all 1555 of them. Nick's live archive is not empty.
 *
 * So: build a database at 0024, put secties and a reveal in it by hand, run
 * 0025 alone, and look at what came out the other side. The ids matter as much
 * as the text — a sectie's shared text lives in the room `section:{id}` (§20),
 * and an id that changed here would orphan every Yjs document in the archive.
 */
describe('migration 0025, against an archive that already has secties', () => {
  let file: string;
  let db: Database.Database;
  const upTo0024: Migration[] = (MIGRATIONS as Migration[]).filter((m) => m.name < '0025');
  const m0025: Migration = (MIGRATIONS as Migration[]).find((m) =>
    m.name.startsWith('0025'),
  ) as Migration;

  beforeEach(() => {
    file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'mig25-')), 'archive.db');
    db = new Database(file);
    db.pragma('foreign_keys = OFF');
    for (const m of upTo0024) db.exec(m.sql);
  });

  afterEach(() => {
    db.close();
    fs.rmSync(path.dirname(file), { recursive: true, force: true });
  });

  function oldSection(id: string, patch: Partial<Record<string, unknown>> = {}) {
    const row = {
      id,
      entry_id: 'entry-abc',
      title: '',
      body: null as string | null,
      body_text: '',
      visibility: 'keeper',
      sort_order: 0,
      ...patch,
    };
    db.prepare(
      `INSERT INTO entry_sections (id, entry_id, title, body, body_text, visibility, sort_order)
       VALUES (@id, @entry_id, @title, @body, @body_text, @visibility, @sort_order)`,
    ).run(row);
    return row;
  }

  it('keeps every sectie, with its id, its text, its dial and its order', () => {
    oldSection('sec-oud-1', {
      title: 'Wat de buren zeiden',
      body: '{"type":"doc"}',
      body_text: 'platte tekst',
      visibility: 'keeper',
      sort_order: 30,
    });
    // An untitled, empty, everybody-may-read one: the other shape a real
    // archive holds, and the one a bad COALESCE would quietly change.
    oldSection('sec-oud-2', { visibility: 'all', sort_order: 10 });

    db.exec(m0025.sql);

    const rows = db.prepare('SELECT * FROM sections ORDER BY sort_order').all() as Record<
      string,
      unknown
    >[];
    expect(rows).toHaveLength(2);
    // The ids are the whole point: `section:{id}` is the live room (§20).
    expect(rows.map((r) => r.id)).toEqual(['sec-oud-2', 'sec-oud-1']);
    expect(rows.every((r) => r.owner_kind === 'entry')).toBe(true);
    expect(rows.every((r) => r.owner_id === 'entry-abc')).toBe(true);

    const first = rows.find((r) => r.id === 'sec-oud-1')!;
    expect(first.title).toBe('Wat de buren zeiden');
    expect(first.body).toBe('{"type":"doc"}');
    expect(first.body_text).toBe('platte tekst');
    expect(first.visibility).toBe('keeper');
    expect(first.sort_order).toBe(30);

    const second = rows.find((r) => r.id === 'sec-oud-2')!;
    expect(second.title).toBe('');
    expect(second.body).toBeNull();
    expect(second.visibility).toBe('all');
  });

  it('leaves the reveals alone — they are keyed by sectie id and did not move', () => {
    oldSection('sec-oud-1', { title: 'Alleen voor Jan' });
    db.prepare('INSERT INTO entry_section_reveals (section_id, user_id) VALUES (?, ?)').run(
      'sec-oud-1',
      'user-jan',
    );

    db.exec(m0025.sql);

    const reveals = db.prepare('SELECT * FROM entry_section_reveals').all();
    expect(reveals).toEqual([{ section_id: 'sec-oud-1', user_id: 'user-jan' }]);
  });

  it('drops the old table, so there is one road and not two', () => {
    oldSection('sec-oud-1');
    db.exec(m0025.sql);
    const still = db
      .prepare(`SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table' AND name='entry_sections'`)
      .get() as { n: number };
    expect(still.n).toBe(0);
  });

  it('runs on an archive with no secties at all, and adds the speld its laag', () => {
    expect(() => db.exec(m0025.sql)).not.toThrow();
    expect(db.prepare('SELECT COUNT(*) AS n FROM sections').get()).toEqual({ n: 0 });

    // §71: the other half of the same migration.
    const columns = (db.prepare('PRAGMA table_info(map_pins)').all() as { name: string }[]).map(
      (c) => c.name,
    );
    expect(columns).toContain('layer');
  });

  it('gives an existing speld laag 0, so nothing jumps in front of anything', () => {
    db.prepare(
      `INSERT INTO map_pins (id, map_id, kind, entry_id, name, text, x, y)
       VALUES (?, ?, 'entry', ?, ?, '', 0.5, 0.5)`,
    ).run('pin-oud', 'map-1', 'entry-abc', 'Middelharnis');

    db.exec(m0025.sql);

    const pin = db.prepare('SELECT layer FROM map_pins WHERE id = ?').get('pin-oud') as {
      layer: number;
    };
    expect(pin.layer).toBe(0);
  });
});
