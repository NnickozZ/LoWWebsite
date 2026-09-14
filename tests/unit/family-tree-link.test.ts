import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FieldDef } from '@/lib/db/schema';

/**
 * §66, round 32: "Stambomen moeten gelinkt kunnen worden aan families (niet
 * altijd, maar families moet een link hebben hiervoor)."
 *
 * The link is one field kind — `family_tree_link`, seeded on Families as
 * *Stamboom* — and this file is the archive's half of it, against a real
 * SQLite file because every claim is a question about SQL or about the seed:
 *
 *  1. The seed gives Families the field, and gives it to an archive that
 *     predates the round exactly once, without ever writing over a Keeper's
 *     own word — the shape §51, §55, §58 and §66's own marker all have.
 *  2. `linkedFamiliesOf` is the reverse of that value, per viewer: rule 1
 *     applies, so a Keeper-only familie pointing at a tree is absent from a
 *     player's page rather than counted, and a familie pointing at another
 *     tree is not on the list at all.
 *  3. A koppeling to a stamboom is **not** a mention of anything.
 *     `fieldMentionsIn` reads `entry_link(s)` and nothing else — a dossier
 *     writes no row there either — so a Stamboom veld writes none.
 */

const dir = mkdtempSync(join(tmpdir(), 'zcf-tree-link-'));
process.env.DATA_DIR = dir;

type Deps = {
  sqlite: typeof import('@/lib/db').sqlite;
  seedBaseline: typeof import('@/lib/db/seed.mjs').seedBaseline;
  createEntry: typeof import('@/lib/entries/service').createEntry;
  updateEntry: typeof import('@/lib/entries/service').updateEntry;
  fieldMentionsIn: typeof import('@/lib/entries/mentions').fieldMentionsIn;
  createFamilyTree: typeof import('@/lib/families/service').createFamilyTree;
  linkedFamiliesOf: typeof import('@/lib/families/service').linkedFamiliesOf;
};
let deps: Deps;

const KEEPER = { id: 'keeper-1', isKeeper: true };
const BRAM = { id: 'bram', isKeeper: false };

const fieldsOf = (slug: string): FieldDef[] => {
  const row = deps.sqlite.prepare('SELECT fields FROM entry_types WHERE slug = ?').get(slug) as
    | { fields: string }
    | undefined;
  return row ? (JSON.parse(row.fields) as FieldDef[]) : [];
};

const names = (rows: { name: string }[]) => rows.map((row) => row.name).sort();

beforeAll(async () => {
  const dbModule = await import('@/lib/db');
  const seed = await import('@/lib/db/seed.mjs');
  const entries = await import('@/lib/entries/service');
  const mentions = await import('@/lib/entries/mentions');
  const families = await import('@/lib/families/service');
  deps = {
    sqlite: dbModule.sqlite,
    seedBaseline: seed.seedBaseline,
    createEntry: entries.createEntry,
    updateEntry: entries.updateEntry,
    fieldMentionsIn: mentions.fieldMentionsIn,
    createFamilyTree: families.createFamilyTree,
    linkedFamiliesOf: families.linkedFamiliesOf,
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
});

afterAll(() => {
  deps?.sqlite.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('het veld', () => {
  it('staat op Families, wijst naar een stamboom en is er maar één', () => {
    const veld = fieldsOf('family').find((field) => field.key === 'stamboom');
    expect(veld?.label).toBe('Stamboom');
    expect(veld?.kind).toBe('family_tree_link');
    // A stamboom is not an artikel, so there is no soort to aim it at, and it
    // is no kinship, so it carries no role (`cleanFields` would drop both).
    expect(veld?.ofType).toBeUndefined();
    expect(veld?.role).toBeUndefined();
  });

  it('en alleen Families krijgt het geseed — niet elke stamboom hoort bij een familie', () => {
    for (const slug of ['character', 'investigator', 'abnormality']) {
      expect(fieldsOf(slug).some((field) => field.kind === 'family_tree_link'), slug).toBe(false);
    }
  });

  it('is geen vermelding: een koppeling naar een stamboom schrijft niets in entry_mentions', () => {
    expect(
      deps.fieldMentionsIn(fieldsOf('family'), {
        stamboom: { id: 'ft-1', name: 'Het huis Boone', slug: 'huis-boone' },
        wapenspreuk: 'Wij tellen de lading twee keer',
      }),
    ).toEqual([]);
  });
});

describe('linkedFamiliesOf', () => {
  it('geeft de familie die naar déze boom wijst, en die alleen', () => {
    const boom = deps.createFamilyTree({ name: 'Wie van wie afstamt' }, KEEPER);
    const andere = deps.createFamilyTree({ name: 'Een andere tak' }, KEEPER);

    const huis = deps.createEntry({ typeSlug: 'family', name: 'Het huis Boone', createdBy: KEEPER.id });
    deps.updateEntry(
      huis.id,
      { fields: { stamboom: { id: boom.id, name: boom.name, slug: boom.slug } } },
      KEEPER,
    );

    const elders = deps.createEntry({ typeSlug: 'family', name: 'Het huis Blaas', createdBy: KEEPER.id });
    deps.updateEntry(
      elders.id,
      { fields: { stamboom: { id: andere.id, name: andere.name, slug: andere.slug } } },
      KEEPER,
    );

    const leeg = deps.createEntry({ typeSlug: 'family', name: 'Het huis Zonder', createdBy: KEEPER.id });
    expect(leeg.id).toBeTruthy();

    expect(names(deps.linkedFamiliesOf(boom.id, KEEPER))).toEqual(['Het huis Boone']);
    expect(deps.linkedFamiliesOf(boom.id, KEEPER)[0]).toMatchObject({
      id: huis.id,
      slug: huis.slug,
      // The chip wears the soort's own icon and colour, as every entry chip does.
      icon: 'shield',
      colour: '#6B2F3A',
    });
    expect(names(deps.linkedFamiliesOf(andere.id, KEEPER))).toEqual(['Het huis Blaas']);
  });

  it('rule 1: een Keeper-only familie staat niet op de pagina van een speler', () => {
    const boom = deps.createFamilyTree({ name: 'Wat er werkelijk speelt' }, KEEPER);
    const geheim = deps.createEntry({ typeSlug: 'family', name: 'Het huis Achter', createdBy: KEEPER.id });
    deps.updateEntry(
      geheim.id,
      { fields: { stamboom: { id: boom.id, name: boom.name, slug: boom.slug } }, visibility: 'keeper' },
      KEEPER,
    );
    const open = deps.createEntry({ typeSlug: 'family', name: 'Het huis Voor', createdBy: KEEPER.id });
    deps.updateEntry(open.id, { fields: { stamboom: { id: boom.id, name: boom.name, slug: boom.slug } } }, KEEPER);

    expect(names(deps.linkedFamiliesOf(boom.id, KEEPER))).toEqual(['Het huis Achter', 'Het huis Voor']);
    // Absent, never counted and never named.
    expect(names(deps.linkedFamiliesOf(boom.id, BRAM))).toEqual(['Het huis Voor']);
    expect(JSON.stringify(deps.linkedFamiliesOf(boom.id, BRAM))).not.toContain('Achter');
    // Nobody signed in reads it the same way a player does.
    expect(names(deps.linkedFamiliesOf(boom.id, null))).toEqual(['Het huis Voor']);
  });

  it('leest ook de kale id die coerceFieldValue nog aanneemt, en niets van een andere sleutel', () => {
    const boom = deps.createFamilyTree({ name: 'Met de hand ingevuld' }, KEEPER);
    const huis = deps.createEntry({ typeSlug: 'family', name: 'Het huis Kaal', createdBy: KEEPER.id });
    deps.updateEntry(huis.id, { fields: { stamboom: boom.id } }, KEEPER);
    expect(names(deps.linkedFamiliesOf(boom.id, KEEPER))).toEqual(['Het huis Kaal']);

    // A value under a key that is not a `family_tree_link` says nothing here.
    const ander = deps.createEntry({ typeSlug: 'family', name: 'Het huis Anders', createdBy: KEEPER.id });
    deps.updateEntry(ander.id, { fields: { wapenspreuk: boom.id } }, KEEPER);
    expect(names(deps.linkedFamiliesOf(boom.id, KEEPER))).toEqual(['Het huis Kaal']);
  });

  it('een boom waar niemand naar wijst heeft geen regel', () => {
    const boom = deps.createFamilyTree({ name: 'Van niemand' }, KEEPER);
    expect(deps.linkedFamiliesOf(boom.id, KEEPER)).toEqual([]);
    expect(deps.linkedFamiliesOf('', KEEPER)).toEqual([]);
  });
});

describe('het merkteken', () => {
  it('plakt Stamboom aan een archief van vóór deze ronde, precies één keer', () => {
    deps.sqlite.prepare("DELETE FROM schema_migrations WHERE name = 'seed:round-32-stamboom-link'").run();
    const zonder = fieldsOf('family').filter((field) => field.key !== 'stamboom');
    deps.sqlite
      .prepare("UPDATE entry_types SET fields = ? WHERE slug = 'family'")
      .run(JSON.stringify(zonder));

    deps.seedBaseline(deps.sqlite);
    deps.seedBaseline(deps.sqlite);

    const hits = fieldsOf('family').filter((field) => field.key === 'stamboom');
    expect(hits).toHaveLength(1);
    expect(hits[0].label).toBe('Stamboom');
    expect(hits[0].kind).toBe('family_tree_link');
  });

  it('en laat het eigen woord van een Keeper met rust', () => {
    deps.sqlite.prepare("DELETE FROM schema_migrations WHERE name = 'seed:round-32-stamboom-link'").run();
    const hunne = fieldsOf('family').map((field) =>
      field.key === 'stamboom' ? { ...field, label: 'Geslachtsboom' } : field,
    );
    deps.sqlite
      .prepare("UPDATE entry_types SET fields = ? WHERE slug = 'family'")
      .run(JSON.stringify(hunne));

    deps.seedBaseline(deps.sqlite);

    const hits = fieldsOf('family').filter((field) => field.key === 'stamboom');
    expect(hits).toHaveLength(1);
    expect(hits[0].label).toBe('Geslachtsboom');
  });
});
