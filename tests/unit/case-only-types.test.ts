import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { entryDisplayName, hasCasePrefix } from '@/lib/entries/caseName';

/**
 * §24: the soorten that are only made inside a dossier.
 *
 * A voorwerp or a clue is *found*, during an investigation. Three claims here,
 * and they are the whole of the rule:
 *
 *  1. Making one without a dossier is refused — by the service, not only by the
 *     sheet that hides it. A hidden button is a courtesy; this is the rule.
 *  2. What comes out is an artikel like any other, and lands in the wiki like
 *     any other. It simply remembers where it was born.
 *  3. That dossier is printed in front of its name, and only to someone who may
 *     open the dossier. The label on a clue must not give away an investigation
 *     nobody told them about.
 */

const dir = mkdtempSync(join(tmpdir(), 'zcf-case-only-'));
process.env.DATA_DIR = dir;

type Deps = {
  sqlite: typeof import('@/lib/db').sqlite;
  createEntry: typeof import('@/lib/entries/service').createEntry;
  browseEntries: typeof import('@/lib/entries/service').browseEntries;
  nameTheirCases: typeof import('@/lib/entries/service').nameTheirCases;
  suggestEntries: typeof import('@/lib/search/service').suggestEntries;
};
let deps: Deps;

const KEEPER = { id: 'keeper-1', isKeeper: true };
const BRAM = { id: 'bram', isKeeper: false };
const AAGJE = { id: 'aagje', isKeeper: false };

beforeAll(async () => {
  const dbModule = await import('@/lib/db');
  const entries = await import('@/lib/entries/service');
  const search = await import('@/lib/search/service');
  deps = {
    sqlite: dbModule.sqlite,
    createEntry: entries.createEntry,
    browseEntries: entries.browseEntries,
    nameTheirCases: entries.nameTheirCases,
    suggestEntries: search.suggestEntries,
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

  sqlite
    .prepare(
      `INSERT INTO cases (id, name, slug, status, created_by, view_mode) VALUES ('c-open', 'Zaak Vlissingen', 'zaak-vlissingen', 'open', 'bram', 'all')`,
    )
    .run();
  sqlite
    .prepare(
      `INSERT INTO cases (id, name, slug, status, created_by, view_mode) VALUES ('c-stil', 'De brand van 1934', 'de-brand', 'open', 'aagje', 'private')`,
    )
    .run();
});

afterAll(() => {
  deps?.sqlite.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('the seeded soorten', () => {
  it('ship the way Nick asked: Relieken, Voorwerpen, Clues, Sessierapporten', () => {
    const label = (slug: string) =>
      (
        deps.sqlite.prepare('SELECT label FROM entry_types WHERE slug = ?').get(slug) as
          | { label: string }
          | undefined
      )?.label;
    expect(label('object')).toBe('Relieken');
    expect(label('item')).toBe('Voorwerpen');
    expect(label('clue')).toBe('Clues');
    expect(label('session')).toBe('Sessierapporten');
  });

  it('and only the two that are found during an investigation are dossier-only', () => {
    const caseOnly = deps.sqlite
      .prepare('SELECT slug FROM entry_types WHERE case_only = 1 ORDER BY slug')
      .all()
      .map((row) => (row as { slug: string }).slug);
    expect(caseOnly).toEqual(['clue', 'item']);
  });
});

describe('making one', () => {
  it('is refused without a dossier', () => {
    expect(() =>
      deps.createEntry({ typeSlug: 'clue', name: 'De brief', createdBy: 'bram' }),
    ).toThrow(/dossier/i);
    expect(() =>
      deps.createEntry({ typeSlug: 'item', name: 'De sleutel', createdBy: 'bram' }),
    ).toThrow(/dossier/i);
  });

  it('and allowed with one, which it then remembers', () => {
    const clue = deps.createEntry({
      typeSlug: 'clue',
      name: 'De brief',
      createdBy: 'bram',
      originCaseId: 'c-open',
    });
    expect(clue.originCaseId).toBe('c-open');
  });

  it('while an ordinary soort neither needs one nor gets one', () => {
    const person = deps.createEntry({ typeSlug: 'character', name: 'Anneke', createdBy: 'bram' });
    expect(person.originCaseId).toBeNull();
  });
});

describe('and the wiki says where it came from', () => {
  beforeAll(() => {
    // A second clue of the same name, in an investigation only Aagje may open.
    deps.createEntry({
      typeSlug: 'clue',
      name: 'De brief',
      createdBy: 'aagje',
      originCaseId: 'c-stil',
    });
  });

  it('prints the dossier in front of the name, and only that', () => {
    expect(entryDisplayName('De brief', 'Zaak Vlissingen')).toBe('Zaak Vlissingen: De brief');
    expect(entryDisplayName('De brief', null)).toBe('De brief');
    expect(entryDisplayName('De brief', '   ')).toBe('De brief');
    expect(hasCasePrefix('Zaak Vlissingen')).toBe(true);
    expect(hasCasePrefix(null)).toBe(false);
  });

  it('lands in the wiki like anything else', () => {
    const names = deps
      .browseEntries(KEEPER, { typeSlug: 'clue' })
      .map((entry) => entry.name);
    expect(names.filter((name) => name === 'De brief')).toHaveLength(2);
  });

  it('names the dossier to someone who may open it', () => {
    const rows = deps.nameTheirCases(deps.browseEntries(BRAM, { typeSlug: 'clue' }), BRAM);
    const shown = rows.map((row) => entryDisplayName(row.name, row.originCaseName)).sort();
    // Bram sees both clues — an artikel is not hidden by its dossier — but only
    // one of the two dossiers has a name he is allowed to be told.
    expect(shown).toEqual(['De brief', 'Zaak Vlissingen: De brief']);
  });

  it('and does not leak the name of one they may not', () => {
    const rows = deps.nameTheirCases(deps.browseEntries(BRAM, { typeSlug: 'clue' }), BRAM);
    expect(JSON.stringify(rows)).not.toContain('brand van 1934');

    // Its owner is told, of course.
    const hers = deps.nameTheirCases(deps.browseEntries(AAGJE, { typeSlug: 'clue' }), AAGJE);
    expect(hers.map((row) => row.originCaseName).sort()).toEqual([
      'De brand van 1934',
      'Zaak Vlissingen',
    ]);
  });

  it('and the autocomplete carries it too, so two "de brief"s can be told apart', () => {
    const hits = deps.suggestEntries(AAGJE, 'brief', { limit: 5 });
    expect(hits).toHaveLength(2);
    expect(hits.map((hit) => entryDisplayName(hit.name, hit.originCaseName)).sort()).toEqual([
      'De brand van 1934: De brief',
      'Zaak Vlissingen: De brief',
    ]);
  });
});
