import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { entryDisplayName, isAdrift } from '@/lib/entries/caseName';

/**
 * §49: het dossier voor de naam is een keuze van het artikel zelf.
 *
 * §24 asked the *soort* one question and got two answers out of it: where a
 * thing may be made, and whether every list prints its dossier in front of its
 * name. This round splits them, and these are the sentences that could quietly
 * stop being true afterwards:
 *
 *  1. A soort with the habit (`prefix_default`), made inside a dossier, is
 *     filed there and wears its name.
 *  2. The same soort made *outside* a dossier is still made — no refusal — and
 *     is a loose end, which the archive says out loud rather than hiding.
 *  3. A soort without the habit, made inside a dossier, is filed there just the
 *     same and wears nothing. Filing and printing are two facts now.
 *  4. Both dials — the tickbox and the herkomst — are edits of the artikel, so
 *     a hand that may not edit it is refused (§10).
 *  5. Taken out of the dossier it pointed at, the artikel reconciles and the
 *     prefix simply has nothing left to print.
 */

const dir = mkdtempSync(join(tmpdir(), 'zcf-case-prefix-'));
process.env.DATA_DIR = dir;

type Deps = {
  sqlite: typeof import('@/lib/db').sqlite;
  createEntry: typeof import('@/lib/entries/service').createEntry;
  getEntrySummaryById: typeof import('@/lib/entries/service').getEntrySummaryById;
  nameTheirCases: typeof import('@/lib/entries/service').nameTheirCases;
  addEntryToCase: typeof import('@/lib/cases/service').addEntryToCase;
  removeEntryFromCase: typeof import('@/lib/cases/service').removeEntryFromCase;
  setCasePrefix: typeof import('@/lib/entries/origin').setCasePrefix;
  setEntryOrigin: typeof import('@/lib/entries/origin').setEntryOrigin;
  listAdriftEntries: typeof import('@/lib/admin/types').listAdriftEntries;
};
let deps: Deps;

const KEEPER = { id: 'keeper-1', isKeeper: true };
const BRAM = { id: 'bram', isKeeper: false };

/** What a list would print for this artikel, for this pair of eyes. */
function shownTo(entryId: string, viewer: typeof KEEPER | typeof BRAM): string {
  const summary = deps.getEntrySummaryById(entryId)!;
  const [named] = deps.nameTheirCases([summary], viewer);
  return entryDisplayName(named.name, named.originCaseName);
}

beforeAll(async () => {
  const dbModule = await import('@/lib/db');
  const entries = await import('@/lib/entries/service');
  const cases = await import('@/lib/cases/service');
  const origin = await import('@/lib/entries/origin');
  const admin = await import('@/lib/admin/types');
  deps = {
    sqlite: dbModule.sqlite,
    createEntry: entries.createEntry,
    getEntrySummaryById: entries.getEntrySummaryById,
    nameTheirCases: entries.nameTheirCases,
    addEntryToCase: cases.addEntryToCase,
    removeEntryFromCase: cases.removeEntryFromCase,
    setCasePrefix: origin.setCasePrefix,
    setEntryOrigin: origin.setEntryOrigin,
    listAdriftEntries: admin.listAdriftEntries,
  };

  for (const [id, name, keeper] of [
    ['keeper-1', 'Keeper', 1],
    ['bram', 'Bram', 0],
  ] as const) {
    deps.sqlite
      .prepare(
        `INSERT INTO users (id, username, username_lower, password_hash, password_enc, is_keeper)
         VALUES (?, ?, ?, 'x', 'x', ?)`,
      )
      .run(id, name, name.toLowerCase(), keeper);
  }
  for (const [id, name, slug] of [
    ['c-een', 'Zaak Vlissingen', 'zaak-vlissingen'],
    ['c-twee', 'Zaak Domburg', 'zaak-domburg'],
  ] as const) {
    deps.sqlite
      .prepare(
        `INSERT INTO cases (id, name, slug, status, created_by, view_mode)
         VALUES (?, ?, ?, 'open', 'keeper-1', 'all')`,
      )
      .run(id, name, slug);
  }
});

afterAll(() => {
  deps?.sqlite.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('the soort decides how a new one starts, and nothing after that', () => {
  it('ships the habit on the two soorten that were dossier-only', () => {
    const row = (slug: string) =>
      deps.sqlite.prepare('SELECT prefix_default AS on_ FROM entry_types WHERE slug = ?').get(slug) as
        | { on_: number }
        | undefined;
    expect(row('clue')?.on_).toBe(1);
    expect(row('item')?.on_).toBe(1);
    expect(row('character')?.on_).toBe(0);
    expect(row('location')?.on_).toBe(0);
  });

  it('made in a dossier: filed there, and wearing its name', () => {
    const clue = deps.createEntry({
      typeSlug: 'clue',
      name: 'De brief',
      createdBy: 'keeper-1',
      originCaseId: 'c-een',
    });
    deps.addEntryToCase('c-een', clue.id, KEEPER.id);

    expect(clue.casePrefix).toBe(true);
    expect(clue.originCaseId).toBe('c-een');
    expect(shownTo(clue.id, KEEPER)).toBe('Zaak Vlissingen: De brief');
    // Filed, not merely descended from: the two are one fact (§48).
    const filed = deps.sqlite
      .prepare('SELECT case_id AS id FROM case_entries WHERE entry_id = ?')
      .all(clue.id)
      .map((row) => (row as { id: string }).id);
    expect(filed).toEqual(['c-een']);
  });

  it('made outside one: still made, and a loose end rather than a refusal', () => {
    const clue = deps.createEntry({
      typeSlug: 'clue',
      name: 'Het briefje uit de wiki',
      createdBy: 'keeper-1',
    });
    expect(clue.originCaseId).toBeNull();
    expect(clue.casePrefix).toBe(true);
    expect(isAdrift(clue)).toBe(true);
    // Nothing to print, so nothing is printed — and Beheer keeps the list.
    expect(shownTo(clue.id, KEEPER)).toBe('Het briefje uit de wiki');
    expect(deps.listAdriftEntries().map((row) => row.id)).toContain(clue.id);
  });

  it('a soort without the habit is filed just the same, and wears nothing', () => {
    const persoon = deps.createEntry({
      typeSlug: 'character',
      name: 'Anneke',
      createdBy: 'keeper-1',
      originCaseId: 'c-een',
    });
    deps.addEntryToCase('c-een', persoon.id, KEEPER.id);

    expect(persoon.casePrefix).toBe(false);
    expect(persoon.originCaseId).toBe('c-een');
    // The whole complaint this round answers: a persoon filed in a dossier used
    // to read as "Zaak Vlissingen: Anneke" everywhere in the wiki.
    expect(shownTo(persoon.id, KEEPER)).toBe('Anneke');
    expect(isAdrift(deps.getEntrySummaryById(persoon.id)!)).toBe(false);
  });

  it('and either way the artikel may change its mind afterwards', () => {
    const persoon = deps.createEntry({
      typeSlug: 'character',
      name: 'Jacob',
      createdBy: 'keeper-1',
      originCaseId: 'c-een',
    });
    deps.addEntryToCase('c-een', persoon.id, KEEPER.id);
    expect(shownTo(persoon.id, KEEPER)).toBe('Jacob');

    deps.setCasePrefix(persoon.id, true, KEEPER);
    expect(shownTo(persoon.id, KEEPER)).toBe('Zaak Vlissingen: Jacob');

    // Off again changes nothing but the printing: still filed, still from there.
    deps.setCasePrefix(persoon.id, false, KEEPER);
    expect(shownTo(persoon.id, KEEPER)).toBe('Jacob');
    expect(deps.getEntrySummaryById(persoon.id)!.originCaseId).toBe('c-een');
  });
});

describe('both dials are an edit of the artikel', () => {
  let locked = '';

  beforeAll(() => {
    const entry = deps.createEntry({
      typeSlug: 'clue',
      name: 'Het slot',
      createdBy: 'keeper-1',
      originCaseId: 'c-een',
    });
    deps.addEntryToCase('c-een', entry.id, KEEPER.id);
    locked = entry.id;
    // §17: the owner's own, and Bram is not the owner.
    deps.sqlite.prepare("UPDATE entries SET edit_mode = 'private' WHERE id = ?").run(locked);
  });

  it('refuses the tickbox to a hand that may not edit it', () => {
    expect(() => deps.setCasePrefix(locked, false, BRAM)).toThrow(/niet bewerken/i);
    expect(deps.getEntrySummaryById(locked)!.casePrefix).toBe(true);
  });

  it('and refuses the herkomst to the same hand', () => {
    expect(() => deps.setEntryOrigin(locked, { caseId: 'c-een', pinned: true }, BRAM)).toThrow(
      /niet bewerken/i,
    );
  });
});

describe('taken out of the dossier it pointed at', () => {
  it('reconciles, and the prefix has nothing left to print', () => {
    const clue = deps.createEntry({
      typeSlug: 'clue',
      name: 'De sleutel',
      createdBy: 'keeper-1',
      originCaseId: 'c-een',
    });
    deps.addEntryToCase('c-een', clue.id, KEEPER.id);
    deps.addEntryToCase('c-twee', clue.id, KEEPER.id);
    expect(shownTo(clue.id, KEEPER)).toBe('Zaak Vlissingen: De sleutel');

    // "Uit dit dossier halen": the row goes, not the label.
    deps.removeEntryFromCase('c-een', clue.id, KEEPER.id);
    expect(shownTo(clue.id, KEEPER)).toBe('Zaak Domburg: De sleutel');

    deps.removeEntryFromCase('c-twee', clue.id, KEEPER.id);
    const summary = deps.getEntrySummaryById(clue.id)!;
    expect(summary.originCaseId).toBeNull();
    expect(summary.casePrefix).toBe(true);
    expect(isAdrift(summary)).toBe(true);
    expect(shownTo(clue.id, KEEPER)).toBe('De sleutel');
  });
});
