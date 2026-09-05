import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { isAdrift } from '@/lib/entries/caseName';
import { nextOriginCaseId } from '@/lib/entries/origin';

/**
 * §24, second half: `entries.origin_case_id` as a living reference, and §11's
 * rename of a soort all the way into its address.
 *
 * The two are in one file because they are the same kind of claim: something
 * the archive stored once, long ago, and then quietly went on printing after it
 * had stopped being true.
 *
 * Four things are pinned here and they are the whole of both rules:
 *
 *  1. Taken out of the dossier it came from, an artikel moves to the *oldest*
 *     dossier it is still in.
 *  2. Taken out of the last one, it says so — `origin_case_id` is null, and
 *     `isAdrift` is what the wiki draws its grey chip from.
 *  3. A **pinned** origin is nobody's but the person who set it. No filing, no
 *     unfiling, nothing at all moves it, and letting go of it reconciles at
 *     once.
 *  4. Renaming a soort's address moves every artikel under it *and* every
 *     `ofType` / `fromType` that named it — and the seed never puts the old
 *     slug back on the next restart.
 */

const dir = mkdtempSync(join(tmpdir(), 'zcf-origin-'));
process.env.DATA_DIR = dir;

type Deps = {
  sqlite: typeof import('@/lib/db').sqlite;
  /** Plain JS (rule 4), so it is typed here by what the test does with it. */
  seedBaseline: (sqlite: unknown) => void;
  createEntry: typeof import('@/lib/entries/service').createEntry;
  getEntrySummaryById: typeof import('@/lib/entries/service').getEntrySummaryById;
  addEntryToCase: typeof import('@/lib/cases/service').addEntryToCase;
  removeEntryFromCase: typeof import('@/lib/cases/service').removeEntryFromCase;
  setEntryOrigin: typeof import('@/lib/entries/origin').setEntryOrigin;
  updateType: typeof import('@/lib/admin/types').updateType;
};
let deps: Deps;

const KEEPER = { id: 'keeper-1', isKeeper: true };

/** The dossier an artikel currently says it came from. */
function originOf(entryId: string): string | null {
  const row = deps.sqlite
    .prepare('SELECT origin_case_id AS id FROM entries WHERE id = ?')
    .get(entryId) as { id: string | null } | undefined;
  return row?.id ?? null;
}

/** Filing order is what the rule reads, so the test writes it explicitly. */
function fileIn(caseId: string, entryId: string, addedAt: number) {
  deps.addEntryToCase(caseId, entryId, KEEPER.id);
  deps.sqlite
    .prepare('UPDATE case_entries SET added_at = ? WHERE case_id = ? AND entry_id = ?')
    .run(addedAt, caseId, entryId);
}

beforeAll(async () => {
  const dbModule = await import('@/lib/db');
  const seed = await import('@/lib/db/seed.mjs');
  const entries = await import('@/lib/entries/service');
  const cases = await import('@/lib/cases/service');
  const origin = await import('@/lib/entries/origin');
  const types = await import('@/lib/admin/types');
  deps = {
    sqlite: dbModule.sqlite,
    seedBaseline: seed.seedBaseline,
    createEntry: entries.createEntry,
    getEntrySummaryById: entries.getEntrySummaryById,
    addEntryToCase: cases.addEntryToCase,
    removeEntryFromCase: cases.removeEntryFromCase,
    setEntryOrigin: origin.setEntryOrigin,
    updateType: types.updateType,
  };

  deps.sqlite
    .prepare(
      `INSERT INTO users (id, username, username_lower, password_hash, password_enc, is_keeper)
       VALUES ('keeper-1', 'Keeper', 'keeper', 'x', 'x', 1)`,
    )
    .run();
  for (const [id, name, slug] of [
    ['c-een', 'Zaak Vlissingen', 'zaak-vlissingen'],
    ['c-twee', 'Zaak Domburg', 'zaak-domburg'],
    ['c-drie', 'Zaak Veere', 'zaak-veere'],
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

describe('the rule itself, with nothing around it', () => {
  it('leaves a pinned origin alone whatever is filed where', () => {
    expect(nextOriginCaseId('c-een', true, [])).toBeUndefined();
    expect(nextOriginCaseId('c-een', true, ['c-twee'])).toBeUndefined();
    expect(nextOriginCaseId(null, true, ['c-twee'])).toBeUndefined();
  });

  it('keeps an origin the artikel is still filed in, even if an older one arrives', () => {
    // Filing a clue in a second, older dossier must not silently rewrite where
    // it came from — it is still in the one it says it came from.
    expect(nextOriginCaseId('c-twee', false, ['c-een', 'c-twee'])).toBeUndefined();
  });

  it('moves to the oldest one it is still in', () => {
    expect(nextOriginCaseId('c-een', false, ['c-twee', 'c-drie'])).toBe('c-twee');
  });

  it('empties when there is none left', () => {
    expect(nextOriginCaseId('c-een', false, [])).toBeNull();
  });

  it('and adopts the oldest when it never had one', () => {
    expect(nextOriginCaseId(null, false, ['c-twee', 'c-drie'])).toBe('c-twee');
    expect(nextOriginCaseId(null, false, [])).toBeUndefined();
  });
});

describe('a clue that gets moved about', () => {
  let clue = '';

  beforeAll(() => {
    clue = deps.createEntry({
      typeSlug: 'clue',
      name: 'De brief',
      createdBy: KEEPER.id,
      originCaseId: 'c-een',
    }).id;
    fileIn('c-een', clue, 1000);
  });

  it('starts out in the dossier it was made in', () => {
    expect(originOf(clue)).toBe('c-een');
  });

  it('stays there when it is also filed somewhere else', () => {
    fileIn('c-twee', clue, 2000);
    expect(originOf(clue)).toBe('c-een');
  });

  it('moves to the oldest remaining dossier when it leaves that one', () => {
    fileIn('c-drie', clue, 3000);
    deps.removeEntryFromCase('c-een', clue, KEEPER.id);
    expect(originOf(clue)).toBe('c-twee');
  });

  it('and empties, and says so, when it is filed nowhere at all', () => {
    deps.removeEntryFromCase('c-twee', clue, KEEPER.id);
    deps.removeEntryFromCase('c-drie', clue, KEEPER.id);
    expect(originOf(clue)).toBeNull();

    // Which is exactly what the grey chip in every list is drawn from.
    const summary = deps.getEntrySummaryById(clue)!;
    expect(summary.typeCaseOnly).toBe(true);
    expect(isAdrift(summary)).toBe(true);
  });
});

describe('a clue whose herkomst somebody chose by hand', () => {
  let clue = '';

  beforeAll(() => {
    clue = deps.createEntry({
      typeSlug: 'clue',
      name: 'De sleutel',
      createdBy: KEEPER.id,
      originCaseId: 'c-een',
    }).id;
    fileIn('c-een', clue, 1000);
    fileIn('c-twee', clue, 2000);
    deps.setEntryOrigin(clue, { caseId: 'c-twee', pinned: true }, KEEPER);
  });

  it('takes the dossier that was chosen, not the oldest one', () => {
    expect(originOf(clue)).toBe('c-twee');
  });

  it('is not moved by a filing', () => {
    fileIn('c-drie', clue, 500); // older than either of the other two
    expect(originOf(clue)).toBe('c-twee');
  });

  it('is not moved by an unfiling either — not even out of the pinned dossier', () => {
    deps.removeEntryFromCase('c-twee', clue, KEEPER.id);
    expect(originOf(clue)).toBe('c-twee');
  });

  it('and follows the rule again the moment it is let go of', () => {
    deps.setEntryOrigin(clue, { pinned: false }, KEEPER);
    // Filed in c-een (1000) and c-drie (500); the oldest filing is c-drie.
    expect(originOf(clue)).toBe('c-drie');
  });

  it('refuses a dossier the artikel is not even filed in', () => {
    expect(() =>
      deps.setEntryOrigin(clue, { caseId: 'c-twee', pinned: true }, KEEPER),
    ).toThrow(/dossier/i);
  });
});

describe('renaming a soort all the way into its address', () => {
  beforeAll(() => {
    deps.createEntry({
      typeSlug: 'clue',
      name: 'Een schoenafdruk',
      createdBy: KEEPER.id,
      originCaseId: 'c-een',
    });
    deps.updateType('clue', { slug: 'sporen' }, KEEPER.id);
  });

  it('moves the row itself: id and slug are the same string', () => {
    const rows = deps.sqlite
      .prepare("SELECT id, slug FROM entry_types WHERE id = 'sporen' OR slug = 'sporen'")
      .all() as { id: string; slug: string }[];
    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual({ id: 'sporen', slug: 'sporen' });
    expect(deps.sqlite.prepare("SELECT id FROM entry_types WHERE id = 'clue'").get()).toBeUndefined();
  });

  it('brings every artikel of that soort along', () => {
    const left = deps.sqlite
      .prepare("SELECT count(*) AS n FROM entries WHERE type_id = 'clue'")
      .get() as { n: number };
    const moved = deps.sqlite
      .prepare("SELECT count(*) AS n FROM entries WHERE type_id = 'sporen'")
      .get() as { n: number };
    expect(left.n).toBe(0);
    expect(moved.n).toBeGreaterThan(0);
  });

  it('leaves no ofType or fromType anywhere still pointing at the old slug', () => {
    const rows = deps.sqlite
      .prepare('SELECT slug, fields, blocks FROM entry_types')
      .all() as { slug: string; fields: string | null; blocks: string | null }[];

    const named = (json: string | null, want: string) => {
      const found: string[] = [];
      for (const item of JSON.parse(json ?? '[]') as Record<string, unknown>[]) {
        for (const key of ['ofType', 'fromType']) {
          const list = item?.[key];
          if (Array.isArray(list) && list.includes(want)) found.push(String(item.id ?? item.key));
        }
      }
      return found;
    };

    for (const row of rows) {
      expect(named(row.fields, 'clue')).toEqual([]);
      expect(named(row.blocks, 'clue')).toEqual([]);
    }

    // And the one that did name it now names the new address: the seeded
    // "Hier gevonden" list on a locatie looks through clues.
    const location = rows.find((row) => row.slug === 'location')!;
    expect(named(location.blocks, 'sporen')).toContain('hier-gevonden');
  });

  it('and the seed does not put the old address back on the next restart', () => {
    deps.seedBaseline(deps.sqlite);
    expect(deps.sqlite.prepare("SELECT id FROM entry_types WHERE id = 'clue'").get()).toBeUndefined();
  });

  it('refuses an address another soort already has, and an empty one', () => {
    expect(() => deps.updateType('sporen', { slug: 'location' }, KEEPER.id)).toThrow(/al van/i);
    expect(() => deps.updateType('sporen', { slug: '   ' }, KEEPER.id)).toThrow(/adres/i);
  });
});
