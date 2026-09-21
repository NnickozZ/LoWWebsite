import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FieldDef } from '@/lib/db/schema';

/**
 * §67 — een chip wordt vers opgezocht, en je kunt niet weghalen wat je niet ziet.
 *
 * An `entry_link(s)` value is stored as a `{ id, name, slug }` copy of the
 * artikel somebody picked. That copy is the whole bug: it links to a destroyed
 * artikel for ever, it keeps a name that has since changed, and — the one that
 * matters — it prints in a player's HTML the name of an artikel they may not
 * see. Rule 1: absent, never MISSING.
 *
 * So the infobox is drawn from a fresh per-viewer lookup (`resolveFieldRefs`),
 * and the *other* half follows from that: what a hand cannot see, that hand
 * cannot have removed. The editor saves the whole array — §5's `mergeKeys` rule
 * makes a list inside `fields` replace rather than merge — so an array built out
 * of the visible chips is an array with the secret quietly taken out of it.
 * `updateEntry` puts those ids back.
 *
 * Two halves, one file, and the second half is the one with teeth.
 */

const dir = mkdtempSync(join(tmpdir(), 'zcf-field-refs-'));
process.env.DATA_DIR = dir;

type Deps = {
  sqlite: typeof import('@/lib/db').sqlite;
  resolveFieldRefs: typeof import('@/lib/entries/derived').resolveFieldRefs;
  updateEntry: typeof import('@/lib/entries/service').updateEntry;
  writeRelation: typeof import('@/lib/families/service').writeRelation;
};
let deps: Deps;

const KEEPER = { id: 'keeper-1', isKeeper: true };
const BRAM = { id: 'bram', isKeeper: false };

/** The soort under test: the seeded Personen, which has both shapes of field. */
let PERSOON: FieldDef[] = [];

const ref = (id: string, name: string) => ({ id, name, slug: id });

const valuesOf = (id: string): Record<string, unknown> => {
  const row = deps.sqlite.prepare('SELECT fields FROM entries WHERE id = ?').get(id) as
    | { fields: string }
    | undefined;
  return row ? (JSON.parse(row.fields) as Record<string, unknown>) : {};
};

const idsIn = (id: string, key: string) =>
  ((valuesOf(id)[key] as { id: string }[] | undefined) ?? []).map((item) => item.id);

const setFields = (id: string, fields: Record<string, unknown>) =>
  deps.sqlite.prepare('UPDATE entries SET fields = ? WHERE id = ?').run(JSON.stringify(fields), id);

const entry = (id: string, name: string, visibility = 'all', deleted = false) =>
  deps.sqlite
    .prepare(
      `INSERT INTO entries (id, type_id, name, slug, fields, tags, visibility, created_by, view_mode, edit_mode, deleted_at)
       VALUES (?, 'character', ?, ?, '{}', '[]', ?, 'keeper-1', 'all', 'all', ?)`,
    )
    .run(id, name, id, visibility, deleted ? 1 : null);

/** The artikel being edited, plus the four kinds of thing a ref can point at. */
const cast = () => {
  deps.sqlite.prepare('DELETE FROM entries').run();
  entry('e-jan', 'Jan Vermeer');
  entry('e-open', 'Neeltje Boone');
  entry('e-geheim', 'De ware vader', 'keeper');
  entry('e-prullenbak', 'Pier Boone');
  deps.sqlite.prepare("UPDATE entries SET deleted_at = 1 WHERE id = 'e-prullenbak'").run();
  // 'e-weg' is never inserted: it is an id a stored ref still names and that no
  // longer has a row at all — destroyed, not in the trash.
};

beforeAll(async () => {
  const dbModule = await import('@/lib/db');
  const derived = await import('@/lib/entries/derived');
  const entries = await import('@/lib/entries/service');
  const families = await import('@/lib/families/service');
  deps = {
    sqlite: dbModule.sqlite,
    resolveFieldRefs: derived.resolveFieldRefs,
    updateEntry: entries.updateEntry,
    writeRelation: families.writeRelation,
  };
  for (const [id, name, keeper] of [
    ['keeper-1', 'Keeper', 1],
    ['bram', 'Bram', 0],
  ] as const) {
    deps.sqlite
      .prepare(
        `INSERT INTO users (id, username, username_lower, password_hash, is_keeper)
         VALUES (?, ?, ?, 'x', ?)`,
      )
      .run(id, name, name.toLowerCase(), keeper);
  }
  const row = deps.sqlite.prepare("SELECT fields FROM entry_types WHERE slug = 'character'").get() as {
    fields: string;
  };
  PERSOON = JSON.parse(row.fields) as FieldDef[];
});

afterAll(() => {
  deps?.sqlite.close();
  rmSync(dir, { recursive: true, force: true });
});

beforeEach(() => {
  cast();
});

/* ------------------------------------------------------------ the reading */

describe('resolveFieldRefs', () => {
  const resolve = (fields: Record<string, unknown>, viewer: typeof KEEPER | typeof BRAM | null) =>
    deps.resolveFieldRefs({ typeFields: PERSOON, fields }, viewer);

  it('answers with who that artikel is now, not with the copy in the field', () => {
    deps.sqlite.prepare("UPDATE entries SET name = 'Neeltje de Rijke', slug = 'neeltje-de-rijke' WHERE id = 'e-open'").run();
    const refs = resolve({ talen: [ref('e-open', 'Neeltje Boone')] }, BRAM);
    expect(refs['e-open']).toMatchObject({ name: 'Neeltje de Rijke', slug: 'neeltje-de-rijke' });
  });

  it('leaves a destroyed artikel out, so the chip is simply not drawn', () => {
    const refs = resolve({ talen: [ref('e-open', 'Neeltje'), ref('e-weg', 'Wat weg is')] }, KEEPER);
    expect(Object.keys(refs)).toEqual(['e-open']);
  });

  it('leaves a Keeper-only artikel out for a player and puts it in for the Keeper (rule 1)', () => {
    const fields = { talen: [ref('e-open', 'Neeltje'), ref('e-geheim', 'De ware vader')] };
    expect(Object.keys(resolve(fields, BRAM))).toEqual(['e-open']);
    expect(Object.keys(resolve(fields, KEEPER)).sort()).toEqual(['e-geheim', 'e-open']);
    // §89: and a reader who is not signed in is told nothing at all.
    expect(Object.keys(resolve(fields, null))).toEqual([]);
  });

  it('reads both shapes of field and the hand-filled lists, and nothing else', () => {
    const refs = deps.resolveFieldRefs(
      {
        typeFields: PERSOON,
        fields: {
          // `familie` is an `entry_link`: one box, one answer.
          familie: ref('e-open', 'Neeltje'),
          // A plain Tekst that happens to hold something ref-shaped is not a ref.
          aliases: 'e-geheim',
          lijst_bondgenoten: [ref('e-jan', 'Jan')],
        },
        listKeys: ['lijst_bondgenoten'],
      },
      KEEPER,
    );
    expect(Object.keys(refs).sort()).toEqual(['e-jan', 'e-open']);
  });

  it('says nothing at all when the infobox points nowhere', () => {
    expect(resolve({ aliases: 'Jan' }, KEEPER)).toEqual({});
  });
});

/* ------------------------------------------------------------ the writing */

describe('§67 je kunt niet weghalen wat je niet ziet', () => {
  it('puts back a ref the player could not see when they save the array without it', () => {
    setFields('e-jan', { talen: [ref('e-open', 'Neeltje'), ref('e-geheim', 'De ware vader')] });

    // Exactly what the editor sends: the visible chips, one of them removed.
    deps.updateEntry('e-jan', { fields: { talen: [] } }, BRAM);

    expect(idsIn('e-jan', 'talen')).toEqual(['e-geheim']);
  });

  it('and keeps the order of what the hand did write, with the unseen ones after it', () => {
    setFields('e-jan', {
      talen: [ref('e-open', 'Neeltje'), ref('e-geheim', 'De ware vader'), ref('e-prullenbak', 'Pier')],
    });

    deps.updateEntry('e-jan', { fields: { talen: [ref('e-open', 'Neeltje')] } }, BRAM);

    expect(idsIn('e-jan', 'talen')).toEqual(['e-open', 'e-geheim', 'e-prullenbak']);
  });

  it('drops a destroyed ref — there is nothing left to protect', () => {
    setFields('e-jan', { talen: [ref('e-open', 'Neeltje'), ref('e-weg', 'Wat weg is')] });

    deps.updateEntry('e-jan', { fields: { talen: [] } }, BRAM);

    expect(idsIn('e-jan', 'talen')).toEqual([]);
  });

  it('lets a Keeper remove what a Keeper can see', () => {
    setFields('e-jan', { talen: [ref('e-open', 'Neeltje'), ref('e-geheim', 'De ware vader')] });

    deps.updateEntry('e-jan', { fields: { talen: [] } }, KEEPER);

    expect(idsIn('e-jan', 'talen')).toEqual([]);
  });

  it('but not what is in the trash, because that can be restored to the tie it had', () => {
    setFields('e-jan', { talen: [ref('e-open', 'Neeltje'), ref('e-prullenbak', 'Pier')] });

    deps.updateEntry('e-jan', { fields: { talen: [] } }, KEEPER);

    expect(idsIn('e-jan', 'talen')).toEqual(['e-prullenbak']);
  });

  it('touches nothing when the save only adds — no id was dropped, so no id comes back', () => {
    setFields('e-jan', { talen: [ref('e-open', 'Neeltje')] });

    deps.updateEntry(
      'e-jan',
      { fields: { talen: [ref('e-open', 'Neeltje'), ref('e-prullenbak', 'Pier')] } },
      KEEPER,
    );

    expect(idsIn('e-jan', 'talen')).toEqual(['e-open', 'e-prullenbak']);
  });

  it('holds for a one-box entry_link too: clearing an empty-looking box changes nothing', () => {
    setFields('e-jan', { familie: ref('e-geheim', 'De ware vader') });

    // For Bram the box looked empty, so "clear" is what an accidental save says.
    deps.updateEntry('e-jan', { fields: { familie: null } }, BRAM);

    expect((valuesOf('e-jan').familie as { id: string }).id).toBe('e-geheim');
  });

  it('and choosing somebody else in that box is still an answer, not a removal', () => {
    setFields('e-jan', { familie: ref('e-geheim', 'De ware vader') });

    deps.updateEntry('e-jan', { fields: { familie: ref('e-open', 'Neeltje') } }, BRAM);

    expect((valuesOf('e-jan').familie as { id: string }).id).toBe('e-open');
  });

  it('leaves a field nobody touched exactly where it is', () => {
    setFields('e-jan', {
      talen: [ref('e-geheim', 'De ware vader')],
      vereert: [ref('e-geheim', 'De ware vader')],
    });

    deps.updateEntry('e-jan', { fields: { aliases: 'Jantje' } }, BRAM);

    expect(idsIn('e-jan', 'talen')).toEqual(['e-geheim']);
    expect(idsIn('e-jan', 'vereert')).toEqual(['e-geheim']);
  });

  /*
   * §66: the stamboom's `+`/`−` handle writes a field through `updateEntry`, so
   * it obeys this rule without knowing it exists. That is the whole point of
   * there being one road, and it is worth a test of its own: a second road
   * would be a second place where a secret can be dropped.
   */
  it('holds on the writeRelation road as well', () => {
    setFields('e-jan', { kinderen: [ref('e-open', 'Neeltje'), ref('e-geheim', 'De ware vader')] });

    deps.writeRelation('e-jan', 'kinderen', 'e-open', false, BRAM);

    expect(idsIn('e-jan', 'kinderen')).toEqual(['e-geheim']);
  });
});
