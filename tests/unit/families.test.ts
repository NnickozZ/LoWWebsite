import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FieldDef } from '@/lib/db/schema';

/**
 * §51: Families.
 *
 * Four claims, and they are the whole of the soort:
 *
 *  1. It is there after seeding, under its own address, with the word Nick
 *     asked for — and it is an ordinary soort, made anywhere, not a dossier one.
 *  2. Its Leden box takes *three* soorten. That was the ask in so many words:
 *     "de leden moet ook onderzoekers accepteren, misschien zelfs
 *     abnormaliteiten" — so a box that only took personen would be wrong even
 *     though it would look right.
 *  3. A filled Leden box is a mention, once per lid, under the field's own
 *     label. Nothing is written by hand for that; it falls out of the field
 *     being a real `entry_links` field rather than a page block.
 *  4. The other end of the tie — the Familie veld on Personen, Onderzoekers en
 *     Abnormaliteiten — is *appended* to an archive that already exists, once,
 *     and never written over. A Keeper who renames it keeps their word.
 */

const dir = mkdtempSync(join(tmpdir(), 'zcf-families-'));
process.env.DATA_DIR = dir;

type Deps = {
  sqlite: typeof import('@/lib/db').sqlite;
  seedBaseline: typeof import('@/lib/db/seed.mjs').seedBaseline;
  createEntry: typeof import('@/lib/entries/service').createEntry;
  updateEntry: typeof import('@/lib/entries/service').updateEntry;
  fieldMentionsIn: typeof import('@/lib/entries/mentions').fieldMentionsIn;
};
let deps: Deps;

const KEEPER = { id: 'keeper-1', isKeeper: true };

const fieldsOf = (slug: string): FieldDef[] => {
  const row = deps.sqlite.prepare('SELECT fields FROM entry_types WHERE slug = ?').get(slug) as
    | { fields: string }
    | undefined;
  return row ? (JSON.parse(row.fields) as FieldDef[]) : [];
};

const ref = (id: string, name: string) => ({ id, name, slug: name.toLowerCase() });

beforeAll(async () => {
  const dbModule = await import('@/lib/db');
  const seed = await import('@/lib/db/seed.mjs');
  const entries = await import('@/lib/entries/service');
  const mentions = await import('@/lib/entries/mentions');
  deps = {
    sqlite: dbModule.sqlite,
    seedBaseline: seed.seedBaseline,
    createEntry: entries.createEntry,
    updateEntry: entries.updateEntry,
    fieldMentionsIn: mentions.fieldMentionsIn,
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

describe('the soort', () => {
  it('is seeded, in Dutch, beside the Facties', () => {
    const row = deps.sqlite
      .prepare('SELECT slug, label, sort_order, case_only FROM entry_types WHERE slug = ?')
      .get('family') as
      | { slug: string; label: string; sort_order: number; case_only: number }
      | undefined;
    expect(row?.slug).toBe('family');
    expect(row?.label).toBe('Families');
    expect(row?.sort_order).toBe(75);
    // A familie is a thing in the world, not something found in an
    // investigation: it is made anywhere, with no dossier in front of its name.
    expect(row?.case_only).toBe(0);
  });

  it('has a Leden box that takes personen, onderzoekers én abnormaliteiten', () => {
    const leden = fieldsOf('family').find((field) => field.key === 'leden');
    expect(leden?.label).toBe('Leden');
    expect(leden?.kind).toBe('entry_links');
    // Exactly these three, and `character` first: the picker's "'X' aanmaken"
    // row makes one of the first slug in the list.
    expect(leden?.ofType).toEqual(['character', 'investigator', 'abnormality']);
  });

  it('and the boxes beside it point where they should', () => {
    const fields = fieldsOf('family');
    const by = (key: string) => fields.find((field) => field.key === key);
    expect(by('hoofd')?.ofType).toEqual(['character', 'investigator']);
    expect(by('thuisbasis')?.ofType).toEqual(['location']);
    expect(by('status')?.kind).toBe('select');
    expect(by('gesticht')?.kind).toBe('date');
    expect(by('wapenspreuk')?.kind).toBe('text');
  });

  it('and its page shows the leden who filled the tie in from their own side', () => {
    const row = deps.sqlite.prepare('SELECT blocks FROM entry_types WHERE slug = ?').get('family') as
      | { blocks: string | null }
      | undefined;
    const blocks = JSON.parse(row?.blocks || '[]') as {
      kind: string;
      viaField?: string;
      fromType?: string[];
    }[];
    const derived = blocks.find((block) => block.kind === 'derived');
    expect(derived?.viaField).toBe('familie');
    expect(derived?.fromType).toEqual(['character', 'investigator', 'abnormality']);
  });
});

describe('the other end of the tie', () => {
  it('is a Familie veld on all three soorten that may be a lid', () => {
    for (const slug of ['character', 'investigator', 'abnormality']) {
      const familie = fieldsOf(slug).find((field) => field.key === 'familie');
      expect(familie, slug).toBeTruthy();
      expect(familie?.kind).toBe('entry_link');
      expect(familie?.ofType).toEqual(['family']);
    }
  });
});

describe('a filled Leden box', () => {
  it('names every lid under the field’s own label', () => {
    const familie = deps.createEntry({
      typeSlug: 'family',
      name: 'De familie Boone',
      createdBy: KEEPER.id,
    });
    const pier = deps.createEntry({
      typeSlug: 'character',
      name: 'Pier Boone',
      createdBy: KEEPER.id,
    });
    const nel = deps.createEntry({
      typeSlug: 'investigator',
      name: 'Nel Boone',
      createdBy: KEEPER.id,
    });
    const ding = deps.createEntry({
      typeSlug: 'abnormality',
      name: 'Het ding in de kreek',
      createdBy: KEEPER.id,
    });

    deps.updateEntry(
      familie.id,
      {
        fields: {
          leden: [ref(pier.id, 'Pier Boone'), ref(nel.id, 'Nel Boone'), ref(ding.id, 'Het ding')],
        },
      },
      KEEPER,
    );

    const rows = deps.sqlite
      .prepare(
        "SELECT to_entry_id AS toId, detail FROM entry_mentions WHERE from_kind = 'field' AND from_id = ? ORDER BY to_entry_id",
      )
      .all(familie.id) as { toId: string; detail: string }[];
    expect(rows.map((row) => row.toId).sort()).toEqual([pier.id, nel.id, ding.id].sort());
    expect(new Set(rows.map((row) => row.detail))).toEqual(new Set(['Leden']));
  });

  it('which is the pure half, so it does not depend on a database at all', () => {
    const targets = deps.fieldMentionsIn(fieldsOf('family'), {
      leden: [ref('a', 'A'), ref('b', 'B')],
      hoofd: ref('a', 'A'),
      wapenspreuk: 'Wij tellen de lading twee keer',
    });
    expect(targets).toEqual([
      { toEntryId: 'a', detail: 'Leden' },
      { toEntryId: 'b', detail: 'Leden' },
      { toEntryId: 'a', detail: 'Hoofd van de familie' },
    ]);
  });
});

describe('the seed marker', () => {
  it('appends the Familie veld to an archive that predates it, exactly once', () => {
    // An archive from before this round: no marker, and no Familie veld on the
    // soorten that already existed.
    deps.sqlite.prepare("DELETE FROM schema_migrations WHERE name = 'seed:round-26-families'").run();
    for (const slug of ['character', 'investigator', 'abnormality']) {
      const without = fieldsOf(slug).filter((field) => field.key !== 'familie');
      deps.sqlite
        .prepare('UPDATE entry_types SET fields = ? WHERE slug = ?')
        .run(JSON.stringify(without), slug);
    }

    deps.seedBaseline(deps.sqlite);
    deps.seedBaseline(deps.sqlite);

    for (const slug of ['character', 'investigator', 'abnormality']) {
      const hits = fieldsOf(slug).filter((field) => field.key === 'familie');
      expect(hits.length, slug).toBe(1);
      expect(hits[0].label).toBe('Familie');
    }
  });

  it("and leaves a Keeper's own word — and their own aim — alone", () => {
    deps.sqlite.prepare("DELETE FROM schema_migrations WHERE name = 'seed:round-26-families'").run();
    const theirs = fieldsOf('character').map((field) =>
      field.key === 'familie' ? { ...field, label: 'Geslacht', ofType: ['family', 'faction'] } : field,
    );
    deps.sqlite
      .prepare("UPDATE entry_types SET fields = ? WHERE slug = 'character'")
      .run(JSON.stringify(theirs));

    deps.seedBaseline(deps.sqlite);

    const hits = fieldsOf('character').filter((field) => field.key === 'familie');
    expect(hits.length).toBe(1);
    expect(hits[0].label).toBe('Geslacht');
    expect(hits[0].ofType).toEqual(['family', 'faction']);
  });
});
