import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';

/**
 * Golf M — een stap terug overschrijft nooit een latere bewerking.
 *
 * Undoing a relation on a stamboom sends that one ref back through
 * `writeRelation`, never a whole field. For a list field (`entry_links`) that is
 * targeted by construction. A one-box field (`entry_link`) is the one place
 * where an *add* replaces what is there — right for the `+`, wrong for an undo:
 * if somebody filled the box with somebody else meanwhile, putting the old ref
 * back would throw their edit away. `replace: false` is the undo's road, and
 * answers `unchanged` there.
 */

const dir = mkdtempSync(join(tmpdir(), 'zcf-golf-m-terug-'));
process.env.DATA_DIR = dir;

let deps: typeof import('@/lib/families/service') & { sqlite: typeof import('@/lib/db').sqlite };
const KEEPER = { id: 'keeper-1', isKeeper: true } as const;

function refsOf(entryId: string, key: string): string[] {
  const raw = deps.sqlite.prepare('SELECT fields FROM entries WHERE id = ?').get(entryId) as { fields: string };
  const value = JSON.parse(raw.fields)[key];
  const one = (item: unknown) => (typeof item === 'string' ? item : (item as { id?: string })?.id);
  return (Array.isArray(value) ? value : value ? [value] : []).map(one).filter(Boolean) as string[];
}

beforeAll(async () => {
  const db = await import('@/lib/db');
  const families = await import('@/lib/families/service');
  deps = { ...families, sqlite: db.sqlite };
  const run = (sql: string, ...args: unknown[]) => deps.sqlite.prepare(sql).run(...args);
  run(
    `INSERT INTO users (id, username, username_lower, password_hash, is_keeper) VALUES ('keeper-1', 'Keeper', 'keeper', 'x', 1)`,
  );
  run(
    `INSERT INTO entry_types (id, slug, label, fields) VALUES ('golfm', 'golfm', 'Golf M', ?)`,
    JSON.stringify([{ key: 'vader', label: 'Vader', kind: 'entry_link', role: 'parent' }]),
  );
  for (const [id, name] of [
    ['m-kind', 'Kind'],
    ['m-een', 'Eerste vader'],
    ['m-twee', 'Tweede vader'],
  ]) {
    run(
      `INSERT INTO entries (id, type_id, name, slug, fields, tags, visibility, created_by, view_mode)
       VALUES (?, 'golfm', ?, ?, '{}', '[]', 'all', 'keeper-1', 'all')`,
      id,
      name,
      id,
    );
  }
});

describe('golf M: writeRelation met replace: false', () => {
  it('fills an empty one-box field as usual', () => {
    expect(deps.writeRelation('m-kind', 'vader', 'm-een', true, KEEPER, { replace: false }).status).toBe('saved');
    expect(refsOf('m-kind', 'vader')).toEqual(['m-een']);
  });

  it('leaves somebody else standing in the box, and says so', () => {
    expect(deps.writeRelation('m-kind', 'vader', 'm-twee', true, KEEPER, { replace: false }).status).toBe(
      'unchanged',
    );
    expect(refsOf('m-kind', 'vader')).toEqual(['m-een']);
  });

  it('the + itself still replaces, as it always did', () => {
    expect(deps.writeRelation('m-kind', 'vader', 'm-twee', true, KEEPER).status).toBe('saved');
    expect(refsOf('m-kind', 'vader')).toEqual(['m-twee']);
  });

  it('a removal only ever takes away the one ref it names', () => {
    expect(deps.writeRelation('m-kind', 'vader', 'm-een', false, KEEPER, { replace: false }).status).toBe(
      'unchanged',
    );
    expect(refsOf('m-kind', 'vader')).toEqual(['m-twee']);
    expect(deps.writeRelation('m-kind', 'vader', 'm-twee', false, KEEPER, { replace: false }).status).toBe('saved');
    expect(refsOf('m-kind', 'vader')).toEqual([]);
  });
});
