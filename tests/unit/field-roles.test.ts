import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { cleanFields } from '@/lib/fieldKinds';
import { inverseOf, mirrorPlan, refIdsOf } from '@/lib/families/mirror';
import type { FieldDef } from '@/lib/db/schema';

/**
 * §66 — verwantschap is een veld, en de server schrijft de andere kant erbij.
 *
 * Four claims, and together they are the whole of the kinship half of the
 * stamboom:
 *
 *  1. A `role` only survives on a koppelingsveld. Retype the field and the role
 *     goes with it, because a Getal that mirrors a stamboom is nonsense.
 *  2. `mirrorPlan` is pure: it says what should be written on the other page
 *     and touches nothing. parent ↔ child, partner ↔ partner, and `kin` — the
 *     "Aspect van" of a god — is drawn and never mirrored.
 *  3. Through `updateEntry` on a real archive the other page actually changes,
 *     in both directions: filling in Kinderen on A puts A in B's Ouders, and
 *     emptying it takes A out again.
 *  4. The seed put the fields on the seven soorten that can stand in a tree,
 *     with the right roles and the right soort at the head of `ofType` — that
 *     first slug is what the picker's "'X' aanmaken" row makes.
 */

const dir = mkdtempSync(join(tmpdir(), 'zcf-field-roles-'));
process.env.DATA_DIR = dir;

type Deps = {
  sqlite: typeof import('@/lib/db').sqlite;
  seedBaseline: typeof import('@/lib/db/seed.mjs').seedBaseline;
  createEntry: typeof import('@/lib/entries/service').createEntry;
  updateEntry: typeof import('@/lib/entries/service').updateEntry;
};
let deps: Deps;

const KEEPER = { id: 'keeper-1', isKeeper: true };

const fieldsOf = (slug: string): FieldDef[] => {
  const row = deps.sqlite.prepare('SELECT fields FROM entry_types WHERE slug = ?').get(slug) as
    | { fields: string }
    | undefined;
  return row ? (JSON.parse(row.fields) as FieldDef[]) : [];
};

const valuesOf = (id: string): Record<string, unknown> => {
  const row = deps.sqlite.prepare('SELECT fields FROM entries WHERE id = ?').get(id) as
    | { fields: string }
    | undefined;
  return row ? (JSON.parse(row.fields) as Record<string, unknown>) : {};
};

const ref = (id: string, name: string) => ({ id, name, slug: name.toLowerCase() });

beforeAll(async () => {
  const dbModule = await import('@/lib/db');
  const seed = await import('@/lib/db/seed.mjs');
  const entries = await import('@/lib/entries/service');
  deps = {
    sqlite: dbModule.sqlite,
    seedBaseline: seed.seedBaseline,
    createEntry: entries.createEntry,
    updateEntry: entries.updateEntry,
  };
  deps.sqlite
    .prepare(
      `INSERT INTO users (id, username, username_lower, password_hash, password_enc, is_keeper)
       VALUES ('keeper-1', 'Keeper', 'keeper', 'x', 'x', 1)`,
    )
    .run();
});

afterAll(() => {
  deps?.sqlite.close();
  rmSync(dir, { recursive: true, force: true });
});

/* --------------------------------------------------------------- the shape */

describe('cleanFields and the rol', () => {
  it('keeps a role on a koppelingsveld, in either shape', () => {
    const cleaned = cleanFields([
      { key: 'ouders', label: 'Ouders', kind: 'entry_links', role: 'parent' },
      { key: 'moeder', label: 'Moeder', kind: 'entry_link', role: 'parent' },
      { key: 'partner', label: 'Partner', kind: 'entry_links', role: 'partner' },
      { key: 'aspect_van', label: 'Aspect van', kind: 'entry_links', role: 'kin' },
    ]);
    expect(cleaned.map((field) => field.role)).toEqual(['parent', 'parent', 'partner', 'kin']);
  });

  it('drops it off anything that is not a koppelingsveld', () => {
    const cleaned = cleanFields([
      { key: 'achternaam', label: 'Achternaam', kind: 'text', role: 'parent' },
      { key: 'leeftijd', label: 'Leeftijd', kind: 'number', role: 'child' },
      { key: 'baas', label: 'Baas', kind: 'user_link', role: 'parent' },
      { key: 'zaak', label: 'Zaak', kind: 'case_links', role: 'partner' },
    ]);
    for (const field of cleaned) expect(field.role, field.key).toBeUndefined();
  });

  it('and drops a word that is not one of the four', () => {
    const cleaned = cleanFields([
      { key: 'oom', label: 'Oom', kind: 'entry_links', role: 'uncle' },
      { key: 'nicht', label: 'Nicht', kind: 'entry_links', role: '' },
      { key: 'neef', label: 'Neef', kind: 'entry_links', role: 3 },
    ]);
    for (const field of cleaned) expect(field.role, field.key).toBeUndefined();
  });
});

/* ---------------------------------------------------------------- the plan */

const PERSOON: FieldDef[] = [
  { key: 'ouders', label: 'Ouders', kind: 'entry_links', role: 'parent' },
  { key: 'kinderen', label: 'Kinderen', kind: 'entry_links', role: 'child' },
  { key: 'partner', label: 'Partner', kind: 'entry_links', role: 'partner' },
  { key: 'aspect_van', label: 'Aspect van', kind: 'entry_links', role: 'kin' },
  { key: 'achternaam', label: 'Achternaam', kind: 'text' },
];
/** A soort that stands in a tree but has nowhere to write the other side. */
const KAAL: FieldDef[] = [{ key: 'naam', label: 'Naam', kind: 'text' }];

describe('mirrorPlan', () => {
  it('knows the four roles apart', () => {
    expect(inverseOf('parent')).toBe('child');
    expect(inverseOf('child')).toBe('parent');
    expect(inverseOf('partner')).toBe('partner');
    expect(inverseOf('kin')).toBeNull();
  });

  it('reads a reference forgivingly — an object, a list, a bare id', () => {
    expect(refIdsOf({ id: 'a', name: 'A' })).toEqual(['a']);
    expect(refIdsOf([{ id: 'a' }, { id: 'b' }])).toEqual(['a', 'b']);
    expect(refIdsOf('a')).toEqual(['a']);
    expect(refIdsOf(['a', 'b', 'a'])).toEqual(['a', 'b']);
    expect(refIdsOf(null)).toEqual([]);
    expect(refIdsOf([])).toEqual([]);
  });

  it('turns a new kind into a parent on the other page', () => {
    const plan = mirrorPlan('a', PERSOON, {}, { kinderen: [ref('b', 'B')] }, () => PERSOON);
    expect(plan).toEqual([{ targetId: 'b', fieldKey: 'ouders', add: true }]);
  });

  it('and a partner taken away into a removal on the other page', () => {
    const plan = mirrorPlan('a', PERSOON, { partner: [ref('b', 'B')] }, { partner: [] }, () => PERSOON);
    expect(plan).toEqual([{ targetId: 'b', fieldKey: 'partner', add: false }]);
  });

  it('never mirrors a kin tie', () => {
    const plan = mirrorPlan('a', PERSOON, {}, { aspect_van: [ref('b', 'B')] }, () => PERSOON);
    expect(plan).toEqual([]);
  });

  it('has nothing to say about a soort with no field for the other side', () => {
    const plan = mirrorPlan('a', PERSOON, {}, { kinderen: [ref('b', 'B')] }, () => KAAL);
    expect(plan).toEqual([]);
  });

  it('and nothing to say when a target is gone', () => {
    const plan = mirrorPlan('a', PERSOON, {}, { ouders: [ref('b', 'B')] }, () => null);
    expect(plan).toEqual([]);
  });

  it('is empty when both sides already say the same thing', () => {
    const both = { kinderen: [ref('b', 'B')], partner: [ref('c', 'C')] };
    expect(mirrorPlan('a', PERSOON, both, both, () => PERSOON)).toEqual([]);
  });

  it('never makes an artikel its own parent', () => {
    expect(mirrorPlan('a', PERSOON, {}, { ouders: [ref('a', 'A')] }, () => PERSOON)).toEqual([]);
  });

  it('takes the target soort’s first field of the inverse role', () => {
    // A god has two fields that mean "parent": Ouders and Geschapen door. The
    // one the Keeper put on top is the one the mirror writes.
    const god: FieldDef[] = [
      { key: 'geschapen_door', label: 'Geschapen door', kind: 'entry_links', role: 'parent' },
      { key: 'ouders', label: 'Ouders', kind: 'entry_links', role: 'parent' },
    ];
    const plan = mirrorPlan('a', PERSOON, {}, { kinderen: [ref('b', 'B')] }, () => god);
    expect(plan).toEqual([{ targetId: 'b', fieldKey: 'geschapen_door', add: true }]);
  });
});

/* -------------------------------------------------------------- the server */

describe('de server spiegelt', () => {
  it('writes the other side when a kind is filled in, and unwrites it', () => {
    const a = deps.createEntry({ typeSlug: 'character', name: 'Aagje Boone', createdBy: KEEPER.id });
    const b = deps.createEntry({ typeSlug: 'character', name: 'Bram Boone', createdBy: KEEPER.id });

    deps.updateEntry(a.id, { fields: { kinderen: [ref(b.id, 'Bram Boone')] } }, KEEPER);
    const ouders = valuesOf(b.id).ouders as { id: string }[];
    expect(Array.isArray(ouders)).toBe(true);
    expect(ouders.map((one) => one.id)).toEqual([a.id]);

    deps.updateEntry(a.id, { fields: { kinderen: [] } }, KEEPER);
    expect(valuesOf(b.id).ouders).toEqual([]);
  });

  it('and does not mirror an Aspect van, because kin has no other side', () => {
    const god = deps.createEntry({
      typeSlug: 'kosmische-goden',
      name: 'Het Holle Tij',
      createdBy: KEEPER.id,
    });
    const aspect = deps.createEntry({
      typeSlug: 'kosmische-goden',
      name: 'De Tweede Vloed',
      createdBy: KEEPER.id,
    });
    deps.updateEntry(aspect.id, { fields: { aspect_van: [ref(god.id, 'Het Holle Tij')] } }, KEEPER);
    expect(valuesOf(god.id).aspect_van).toBeUndefined();
  });

  it('and never onto an artikel in the trash', () => {
    const a = deps.createEntry({ typeSlug: 'character', name: 'Kees Traas', createdBy: KEEPER.id });
    const weg = deps.createEntry({ typeSlug: 'character', name: 'Nel Traas', createdBy: KEEPER.id });
    deps.sqlite.prepare('UPDATE entries SET deleted_at = 1 WHERE id = ?').run(weg.id);
    deps.updateEntry(a.id, { fields: { partner: [ref(weg.id, 'Nel Traas')] } }, KEEPER);
    expect(valuesOf(weg.id).partner).toBeUndefined();
  });
});

/* ---------------------------------------------------------------- the seed */

describe('the seed marker', () => {
  const MENSEN = ['character', 'investigator'];
  const MACHTEN = [
    'abnormality',
    'kosmische-goden',
    'aardse-goden',
    'eldritch-entiteiten',
    'bovennatuurlijke-wezens',
  ];

  it('gave personen and onderzoekers Ouders, Kinderen, Partner and an Achternaam', () => {
    for (const slug of MENSEN) {
      const by = (key: string) => fieldsOf(slug).find((field) => field.key === key);
      expect(by('ouders'), slug).toMatchObject({ label: 'Ouders', kind: 'entry_links', role: 'parent' });
      expect(by('kinderen'), slug).toMatchObject({ label: 'Kinderen', kind: 'entry_links', role: 'child' });
      expect(by('partner'), slug).toMatchObject({ label: 'Partner', kind: 'entry_links', role: 'partner' });
      expect(by('achternaam'), slug).toMatchObject({ label: 'Achternaam', kind: 'text' });
      expect(by('achternaam')?.role, slug).toBeUndefined();
    }
  });

  it('and gave the abnormaliteit and the four machten a scheppingslijn too', () => {
    for (const slug of MACHTEN) {
      const by = (key: string) => fieldsOf(slug).find((field) => field.key === key);
      expect(by('geschapen_door'), slug).toMatchObject({ label: 'Geschapen door', role: 'parent' });
      expect(by('schepselen'), slug).toMatchObject({ label: 'Schepselen', role: 'child' });
      expect(by('aspect_van'), slug).toMatchObject({ label: 'Aspect van', role: 'kin' });
      expect(by('achternaam'), slug).toBeUndefined();
    }
  });

  it('aims every one of them at the seven soorten a tree can hold', () => {
    const AFSTAMMING = [
      'character',
      'investigator',
      'abnormality',
      'kosmische-goden',
      'aardse-goden',
      'eldritch-entiteiten',
      'bovennatuurlijke-wezens',
    ];
    for (const slug of [...MENSEN, ...MACHTEN]) {
      for (const field of fieldsOf(slug).filter((one) => one.role)) {
        expect([...(field.ofType ?? [])].sort(), `${slug}.${field.key}`).toEqual(
          [...AFSTAMMING].sort(),
        );
      }
    }
  });

  it('with the right soort at the head, because that is what "aanmaken" makes', () => {
    // A person's unknown parent is a person; a god's is a god of that same
    // shelf. `ofType[0]` is the soort the picker's "'X' aanmaken" row creates.
    for (const slug of ['character', 'investigator', 'abnormality']) {
      for (const field of fieldsOf(slug).filter((one) => one.role)) {
        expect(field.ofType?.[0], `${slug}.${field.key}`).toBe('character');
      }
    }
    for (const slug of ['kosmische-goden', 'aardse-goden', 'eldritch-entiteiten', 'bovennatuurlijke-wezens']) {
      for (const field of fieldsOf(slug).filter((one) => one.role)) {
        expect(field.ofType?.[0], `${slug}.${field.key}`).toBe(slug);
      }
    }
  });

  it('and no soort was pushed past the twenty fields it may have', () => {
    for (const slug of [...MENSEN, ...MACHTEN]) {
      expect(fieldsOf(slug).length, slug).toBeLessThanOrEqual(20);
    }
  });

  it('appends them to an archive that predates the round, exactly once', () => {
    // An archive from before this round: no marker, and none of the seven
    // soorten carrying a role field.
    deps.sqlite.prepare("DELETE FROM schema_migrations WHERE name = 'seed:round-31-stamboom'").run();
    for (const slug of [...MENSEN, ...MACHTEN]) {
      const without = fieldsOf(slug).filter((field) => !field.role && field.key !== 'achternaam');
      deps.sqlite
        .prepare('UPDATE entry_types SET fields = ? WHERE slug = ?')
        .run(JSON.stringify(without), slug);
    }
    // A Keeper's own word survives: they renamed Partner and pointed it
    // elsewhere long ago, and the seed must not write over that.
    const eigen = [
      ...fieldsOf('character'),
      { key: 'partner', label: 'Wederhelft', kind: 'entry_links', ofType: ['character'], role: 'partner' },
    ];
    deps.sqlite
      .prepare("UPDATE entry_types SET fields = ? WHERE slug = 'character'")
      .run(JSON.stringify(eigen));

    deps.seedBaseline(deps.sqlite);
    for (const slug of [...MENSEN, ...MACHTEN]) {
      expect(fieldsOf(slug).find((field) => field.key === 'ouders')?.role, slug).toBe('parent');
      expect(fieldsOf(slug).find((field) => field.key === 'kinderen')?.role, slug).toBe('child');
    }
    expect(fieldsOf('character').find((field) => field.key === 'partner')?.label).toBe('Wederhelft');

    // And a second run changes nothing: the marker is down and every key is
    // already there.
    const before = fieldsOf('kosmische-goden');
    deps.seedBaseline(deps.sqlite);
    expect(fieldsOf('kosmische-goden')).toEqual(before);
  });
});
