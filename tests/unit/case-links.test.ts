import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { caseIdsIn, caseIdsInFields } from '@/lib/entries/caseFields';
import type { FieldDef } from '@/lib/db/schema';

/**
 * §21: dossierkoppelingen in an infobox — what used to say "fase 2".
 *
 * Two claims are worth pinning down, and they are the whole of the design:
 *
 *  1. Only ids are stored, and reading them tolerates every shape a field has
 *     ever been written in — one ref, a list, a bare string, junk.
 *  2. The names come from the server, per viewer. A dossier somebody may not
 *     open is not in the map they are handed, which is how the field prints
 *     nothing instead of naming it.
 */

const dir = mkdtempSync(join(tmpdir(), 'zcf-case-links-'));
process.env.DATA_DIR = dir;

type Deps = {
  sqlite: typeof import('@/lib/db').sqlite;
  resolveCaseRefs: typeof import('@/lib/cases/service').resolveCaseRefs;
  caseIdsHoldingEntry: typeof import('@/lib/cases/service').caseIdsHoldingEntry;
};
let deps: Deps;

const KEEPER = { id: 'keeper-1', isKeeper: true };
const BRAM = { id: 'bram', isKeeper: false };
const AAGJE = { id: 'aagje', isKeeper: false };

beforeAll(async () => {
  const dbModule = await import('@/lib/db');
  const cases = await import('@/lib/cases/service');
  deps = {
    sqlite: dbModule.sqlite,
    resolveCaseRefs: cases.resolveCaseRefs,
    caseIdsHoldingEntry: cases.caseIdsHoldingEntry,
  };
  const { sqlite } = deps;

  for (const [id, name, keeper] of [
    ['keeper-1', 'Keeper', 1],
    ['bram', 'Bram', 0],
    ['aagje', 'Aagje', 0],
  ] as const) {
    sqlite
      .prepare(
        `INSERT INTO users (id, username, username_lower, password_hash, password_enc, is_keeper) VALUES (?, ?, ?, 'x', 'x', ?)`,
      )
      .run(id, name, name.toLowerCase(), keeper);
  }

  const aCase = (id: string, name: string, viewMode: string, by: string, deleted = 0) =>
    sqlite
      .prepare(
        `INSERT INTO cases (id, name, slug, status, created_by, view_mode, deleted_at) VALUES (?, ?, ?, 'open', ?, ?, ?)`,
      )
      .run(id, name, id, by, viewMode, deleted || null);

  aCase('c-open', 'De haven', 'all', 'bram');
  aCase('c-geheim', 'De brand van 1934', 'some', 'aagje');
  aCase('c-prive', 'Privé van Aagje', 'private', 'aagje');
  aCase('c-weg', 'Weggegooid', 'all', 'bram', 99);
  // Bram is on the view list of the confidential one; Aagje owns it.
  sqlite
    .prepare(
      `INSERT INTO access_grants (target_type, target_id, user_id, can_view, can_edit) VALUES ('case', 'c-geheim', 'bram', 1, 0)`,
    )
    .run();

  sqlite
    .prepare(
      `INSERT INTO entries (id, type_id, name, slug, fields, tags, created_by) VALUES ('e1', 'character', 'Anneke', 'anneke', '{}', '[]', 'bram')`,
    )
    .run();
  sqlite
    .prepare(`INSERT INTO case_entries (case_id, entry_id, added_by) VALUES ('c-open', 'e1', 'bram')`)
    .run();
});

afterAll(() => {
  deps?.sqlite.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('reading what is stored in the field', () => {
  it('takes one ref, a list of refs, or a bare id', () => {
    expect(caseIdsIn({ id: 'c-open' })).toEqual(['c-open']);
    expect(caseIdsIn([{ id: 'c-open' }, { id: 'c-geheim' }])).toEqual(['c-open', 'c-geheim']);
    expect(caseIdsIn('c-open')).toEqual(['c-open']);
    expect(caseIdsIn(['c-open', 'c-geheim'])).toEqual(['c-open', 'c-geheim']);
  });

  it('and shrugs off everything else', () => {
    expect(caseIdsIn(null)).toEqual([]);
    expect(caseIdsIn(undefined)).toEqual([]);
    expect(caseIdsIn('')).toEqual([]);
    expect(caseIdsIn(42)).toEqual([]);
    expect(caseIdsIn({ name: 'De haven' })).toEqual([]);
    expect(caseIdsIn([{ id: 'c-open' }, null, { name: 'x' }, ''])).toEqual(['c-open']);
  });

  it('walks a soort’s fields and picks out only the dossier ones', () => {
    const fields: FieldDef[] = [
      { key: 'notes', label: 'Notities', kind: 'longtext' },
      { key: 'one', label: 'Dossier', kind: 'case_link' },
      { key: 'many', label: 'Betrokken dossiers', kind: 'case_links' },
      { key: 'friend', label: 'Kent', kind: 'entry_link' },
    ];
    const values = {
      notes: 'c-nep',
      one: { id: 'c-open' },
      many: [{ id: 'c-geheim' }, { id: 'c-prive' }],
      friend: { id: 'e1', name: 'Anneke', slug: 'anneke' },
    };
    expect(caseIdsInFields(fields, values)).toEqual(['c-open', 'c-geheim', 'c-prive']);
  });
});

describe('and the names come back per viewer', () => {
  const ids = ['c-open', 'c-geheim', 'c-prive', 'c-weg'];

  it('a Keeper sees every dossier that has not been thrown away', () => {
    // Not even a Keeper: a dossier in the bin has no business being named on an
    // artikel as though it were still a file. `visibleCaseCondition` drops a
    // soft-deleted row for everyone, and this field follows it like every read.
    expect(Object.keys(deps.resolveCaseRefs(ids, KEEPER)).sort()).toEqual([
      'c-geheim',
      'c-open',
      'c-prive',
    ]);
  });

  it('a player sees the open one and the one they are on the list for', () => {
    expect(Object.keys(deps.resolveCaseRefs(ids, BRAM)).sort()).toEqual(['c-geheim', 'c-open']);
    expect(deps.resolveCaseRefs(ids, BRAM)['c-open'].name).toBe('De haven');
  });

  it('and another player is told nothing at all about the rest', () => {
    const seen = deps.resolveCaseRefs(ids, AAGJE);
    // Aagje owns the two restricted ones and sees the open one; the deleted one
    // is gone for her.
    expect(Object.keys(seen).sort()).toEqual(['c-geheim', 'c-open', 'c-prive']);
    // The name of a dossier nobody outside it may open never leaves the server:
    // an id that resolves to nothing carries no name with it.
    const stranger = deps.resolveCaseRefs(['c-prive'], BRAM);
    expect(stranger).toEqual({});
    expect(JSON.stringify(stranger)).not.toContain('Priv');
  });

  it('an id nobody has heard of is simply absent', () => {
    expect(deps.resolveCaseRefs(['nonsense'], KEEPER)).toEqual({});
    expect(deps.resolveCaseRefs([], KEEPER)).toEqual({});
  });
});

describe('the filing prompt asks once, in bulk', () => {
  it('names every dossier that already holds an entry', () => {
    expect([...deps.caseIdsHoldingEntry('e1')]).toEqual(['c-open']);
    expect([...deps.caseIdsHoldingEntry('e-nobody')]).toEqual([]);
  });
});
