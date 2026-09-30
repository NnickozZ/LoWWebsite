import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { landedOps, redoOps, undoOps, type RelationOp } from '@/lib/families/undoSteps';

/**
 * Golf M (herstel, bevinding 2): een `+` in een vak van één (`entry_link`) dat
 * al iemand hield, vervangt die — en een Ctrl+Z gaf het vak daarna leeg terug,
 * want de stap kende alleen "Y erbij". `writeRelation` zegt nu wie er wijken
 * moest (`replaced`), de stap draagt "Z eruit, Y erin" (`landedOps`), en een
 * undo langs dezelfde weg (`replace: false`) zet Z terug — met de spiegel op
 * de pagina's van Y en Z mee.
 */

const dir = mkdtempSync(join(tmpdir(), 'zcf-golf-m-herstel-'));
process.env.DATA_DIR = dir;

let deps: typeof import('@/lib/families/service') & { sqlite: typeof import('@/lib/db').sqlite };
const KEEPER = { id: 'keeper-h', isKeeper: true } as const;
const SPELER = { id: 'speler-h', isKeeper: false } as const;

function refsOf(entryId: string, key: string): string[] {
  const raw = deps.sqlite.prepare('SELECT fields FROM entries WHERE id = ?').get(entryId) as { fields: string };
  const value = JSON.parse(raw.fields)[key];
  const one = (item: unknown) => (typeof item === 'string' ? item : (item as { id?: string })?.id);
  return (Array.isArray(value) ? value : value ? [value] : []).map(one).filter(Boolean) as string[];
}

/** Stuurt ops langs de weg die een undo of redo neemt. */
function walk(ops: RelationOp[]) {
  return ops.map((op) => deps.writeRelation(op.entryId, op.fieldKey, op.targetId, op.add, KEEPER, { replace: false }).status);
}

beforeAll(async () => {
  const db = await import('@/lib/db');
  const families = await import('@/lib/families/service');
  deps = { ...families, sqlite: db.sqlite };
  const run = (sql: string, ...args: unknown[]) => deps.sqlite.prepare(sql).run(...args);
  run(
    `INSERT INTO users (id, username, username_lower, password_hash, is_keeper) VALUES ('keeper-h', 'Keeper', 'keeper', 'x', 1)`,
  );
  run(
    `INSERT INTO users (id, username, username_lower, password_hash, is_keeper) VALUES ('speler-h', 'Speler', 'speler', 'x', 0)`,
  );
  run(
    `INSERT INTO entry_types (id, slug, label, fields) VALUES ('herstel', 'herstel', 'Herstel', ?)`,
    JSON.stringify([
      { key: 'vader', label: 'Vader', kind: 'entry_link', role: 'parent' },
      { key: 'kinderen', label: 'Kinderen', kind: 'entry_links', role: 'child' },
    ]),
  );
  for (const [id, name, visibility] of [
    ['h-kind', 'Kind', 'all'],
    ['h-z', 'Oude vader', 'all'],
    ['h-y', 'Nieuwe vader', 'all'],
    ['h-geheim', 'Geheime vader', 'keeper'],
    ['h-kind2', 'Tweede kind', 'all'],
  ]) {
    run(
      `INSERT INTO entries (id, type_id, name, slug, fields, tags, visibility, created_by, view_mode)
       VALUES (?, 'herstel', ?, ?, '{}', '[]', ?, 'keeper-h', 'all')`,
      id,
      name,
      id,
      visibility,
    );
  }
});

describe('golf M (herstel): een + die een vak van één verving, gaat heel terug', () => {
  it('een leeg vak vullen noemt niemand', () => {
    const result = deps.writeRelation('h-kind', 'vader', 'h-z', true, KEEPER);
    expect(result.status).toBe('saved');
    expect(result.replaced).toBeUndefined();
    expect(refsOf('h-z', 'kinderen')).toEqual(['h-kind']);
  });

  it('vervangen zegt wie er wijken moest, en de spiegel volgt', () => {
    const result = deps.writeRelation('h-kind', 'vader', 'h-y', true, KEEPER);
    expect(result.status).toBe('saved');
    expect(result.replaced).toBe('h-z');
    expect(refsOf('h-kind', 'vader')).toEqual(['h-y']);
    expect(refsOf('h-y', 'kinderen')).toEqual(['h-kind']);
    expect(refsOf('h-z', 'kinderen')).toEqual([]);
  });

  it('ongedaan maken zet de oude vader terug, op beide pagina’s; opnieuw doen weer de nieuwe', () => {
    const step = { relations: landedOps({ entryId: 'h-kind', fieldKey: 'vader', targetId: 'h-y', add: true }, 'h-z') };
    expect(walk(undoOps(step))).toEqual(['saved', 'saved']);
    expect(refsOf('h-kind', 'vader')).toEqual(['h-z']);
    expect(refsOf('h-z', 'kinderen')).toEqual(['h-kind']);
    expect(refsOf('h-y', 'kinderen')).toEqual([]);

    expect(walk(redoOps(step))).toEqual(['saved', 'saved']);
    expect(refsOf('h-kind', 'vader')).toEqual(['h-y']);
    expect(refsOf('h-y', 'kinderen')).toEqual(['h-kind']);
    expect(refsOf('h-z', 'kinderen')).toEqual([]);
  });

  it('wie de hand niet mag zien, wordt niet genoemd (regel 1)', () => {
    deps.writeRelation('h-kind2', 'vader', 'h-geheim', true, KEEPER);
    const result = deps.writeRelation('h-kind2', 'vader', 'h-y', true, SPELER);
    expect(result.status).not.toBe('unchanged');
    expect(result.replaced).toBeUndefined();
  });
});
