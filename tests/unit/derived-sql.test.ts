import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * §11's self-filling lists, against a real SQLite file.
 *
 * These exist because the query is the one piece of the page builder that is
 * not pure: it reaches into `entries.fields` with a JSON path, and SQLite is
 * unforgiving about what it will walk. A field holding a bare string where the
 * block expected a link raises "malformed JSON" and takes the whole page down
 * with it, so the awkward shapes are as much the point here as the happy one.
 */

const dir = mkdtempSync(join(tmpdir(), 'zcf-derived-'));
process.env.DATA_DIR = dir;

type Deps = typeof import('@/lib/entries/derived') & {
  db: typeof import('@/lib/db').db;
  sqlite: typeof import('@/lib/db').sqlite;
};

let deps: Deps;

const KEEPER = { id: 'keeper-1', isKeeper: true };
const PLAYER = { id: 'player-1', isKeeper: false };

function entry(
  sqlite: Deps['sqlite'],
  id: string,
  typeId: string,
  name: string,
  fields: unknown,
  visibility = 'all',
) {
  sqlite
    .prepare(
      `INSERT INTO entries (id, type_id, name, slug, fields, visibility)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(id, typeId, name, id, JSON.stringify(fields), visibility);
}

beforeAll(async () => {
  const dbModule = await import('@/lib/db');
  const derived = await import('@/lib/entries/derived');
  deps = { ...derived, db: dbModule.db, sqlite: dbModule.sqlite } as Deps;
  const { sqlite } = deps;

  entry(sqlite, 'f1', 'faction', 'De Broederschap', {});

  // The two shapes a pointing field actually takes.
  entry(sqlite, 'c1', 'character', 'Bram', { faction: { id: 'f1', name: 'De Broederschap' } });
  entry(sqlite, 'c2', 'character', 'Aagje', { faction: { id: 'f1', name: 'De Broederschap' } });
  entry(sqlite, 'e1', 'event', 'De storm', {
    involved: [{ id: 'zz', name: 'Iemand' }, { id: 'f1', name: 'De Broederschap' }],
  });

  // And the shapes that must not raise.
  entry(sqlite, 'c3', 'character', 'Nel', { faction: 'losse tekst, geen koppeling' });
  entry(sqlite, 'c4', 'character', 'Piet', { faction: null });
  entry(sqlite, 'c5', 'character', 'Joos', {});
  entry(sqlite, 'c6', 'character', 'Teun', { faction: ['kaal', 'zonder id'] });
  entry(sqlite, 'c7', 'character', 'Wim', { faction: { id: 'other-faction' } });

  // A member the Keeper has not revealed.
  entry(sqlite, 'c8', 'character', 'Geheim', { faction: { id: 'f1' } }, 'keeper');
});

afterAll(() => {
  deps?.sqlite.close();
  rmSync(dir, { recursive: true, force: true });
});

const block = (over: Record<string, unknown> = {}) => ({
  id: 'leden',
  kind: 'derived' as const,
  viaField: 'faction',
  sort: 'name' as const,
  ...over,
});

describe('listDerivedEntries', () => {
  it('finds everyone whose single-link field points here', () => {
    const rows = deps.listDerivedEntries('f1', block(), KEEPER);
    const names = rows.map((row) => row.name);
    expect(names).toContain('Bram');
    expect(names).toContain('Aagje');
    expect(names).not.toContain('Wim');
    expect(names).not.toContain('Nel');
  });

  it('finds a fiche whose list field contains this one', () => {
    const rows = deps.listDerivedEntries('f1', block({ viaField: 'involved' }), KEEPER);
    expect(rows.map((row) => row.name)).toEqual(['De storm']);
  });

  it('survives a field holding text, null, or a list of bare strings', () => {
    // The whole reason for the json_type guards: none of these may raise.
    expect(() => deps.listDerivedEntries('f1', block(), KEEPER)).not.toThrow();
    expect(() => deps.listDerivedEntries('f1', block({ viaField: 'nietbestaand' }), KEEPER)).not.toThrow();
    expect(deps.listDerivedEntries('f1', block({ viaField: 'nietbestaand' }), KEEPER)).toEqual([]);
  });

  it('hides a member the player may not see', () => {
    // Rule 1 in the README: a derived list is a read like any other.
    const asKeeper = deps.listDerivedEntries('f1', block(), KEEPER).map((row) => row.name);
    const asPlayer = deps.listDerivedEntries('f1', block(), PLAYER).map((row) => row.name);
    expect(asKeeper).toContain('Geheim');
    expect(asPlayer).not.toContain('Geheim');
  });

  it('narrows to the chosen soorten', () => {
    const all = deps.listDerivedEntries('f1', block({ viaField: 'involved' }), KEEPER);
    const narrowed = deps.listDerivedEntries(
      'f1',
      block({ viaField: 'involved', fromType: ['character'] }),
      KEEPER,
    );
    expect(all).toHaveLength(1);
    expect(narrowed).toHaveLength(0);
  });

  it('sorts by name or by when it was last touched', () => {
    const byName = deps.listDerivedEntries('f1', block({ sort: 'name' }), KEEPER);
    expect(byName.map((row) => row.name)).toEqual([...byName.map((row) => row.name)].sort());
    expect(() => deps.listDerivedEntries('f1', block({ sort: 'recent' }), KEEPER)).not.toThrow();
  });

  it('refuses a block with no field, rather than listing everything', () => {
    expect(deps.listDerivedEntries('f1', block({ viaField: '' }), KEEPER)).toEqual([]);
    expect(
      deps.listDerivedEntries('f1', block({ viaField: "x'); DROP TABLE entries;--" }), KEEPER),
    ).toEqual([]);
    expect(deps.sqlite.prepare('SELECT count(*) AS n FROM entries').get()).toBeTruthy();
  });

  it('never lists the fiche you are standing on', () => {
    entry(deps.sqlite, 'f2', 'faction', 'Zelfverwijzer', { faction: { id: 'f2' } });
    const rows = deps.listDerivedEntries('f2', block({ fromType: [] }), KEEPER);
    expect(rows.map((row) => row.id)).not.toContain('f2');
  });
});

describe('listLinkedEntries', () => {
  it('keeps the order the list was filed in', () => {
    const rows = deps.listLinkedEntries([{ id: 'c2' }, { id: 'c1' }], KEEPER);
    expect(rows.map((row) => row.name)).toEqual(['Aagje', 'Bram']);
  });

  it('drops an entry the viewer may not see, and one that is gone', () => {
    const rows = deps.listLinkedEntries([{ id: 'c1' }, { id: 'c8' }, { id: 'weg' }], PLAYER);
    expect(rows.map((row) => row.id)).toEqual(['c1']);
  });

  it('shrugs at rubbish', () => {
    expect(deps.listLinkedEntries(null, KEEPER)).toEqual([]);
    expect(deps.listLinkedEntries('c1', KEEPER)).toEqual([]);
    expect(deps.listLinkedEntries([null, 3, { name: 'geen id' }], KEEPER)).toEqual([]);
  });
});
