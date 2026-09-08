import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FieldDef } from '@/lib/db/schema';

/**
 * Round 27: Talen.
 *
 * Nick asked for "een moeilijkheidsgraad, en bij personen, relieken en
 * investigators een details tab waarin staat welke talen ze kunnen". In this
 * app the "details" of an artikel are its infobox velden, so that ask is a
 * `talen` veld — not a new kind of page block. Five claims:
 *
 *  1. The soort is there after seeding, in Dutch, and is an ordinary soort:
 *     a taal is a thing in the world, not something found in a dossier.
 *  2. The moeilijkheidsgraad is a Meerkeuze with one ordered scale that covers
 *     the mouth and the eye at once — on this island a taal is as often read
 *     off a stone as spoken.
 *  3. The `talen` veld is an `entry_links` aimed at `language` and sits on
 *     every soort that can plausibly speak or carry one.
 *  4. A filled Talen box is a mention per taal, under the veld's own label, so
 *     "Genoemd in" and the web (§43) fill themselves.
 *  5. The marker is one-shot: seeding twice adds the veld once, and a Keeper's
 *     own word and aim for it survive.
 */

const dir = mkdtempSync(join(tmpdir(), 'zcf-talen-'));
process.env.DATA_DIR = dir;

/** Every soort that got the veld, and the order the derived block expects. */
const SPREKERS = ['character', 'investigator', 'object', 'abnormality', 'faction', 'lore'];

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

describe('de soort', () => {
  it('is geseed, in het Nederlands, naast de overlevering', () => {
    const row = deps.sqlite
      .prepare('SELECT slug, label, sort_order, case_only FROM entry_types WHERE slug = ?')
      .get('language') as
      | { slug: string; label: string; sort_order: number; case_only: number }
      | undefined;
    expect(row?.slug).toBe('language');
    expect(row?.label).toBe('Talen');
    expect(row?.sort_order).toBe(95);
    // Een taal wordt niet in een dossier gevonden: geen dossiernaam ervoor.
    expect(row?.case_only).toBe(0);
  });

  it('heeft een moeilijkheidsgraad als meerkeuze, van eenvoudig tot vrijwel onleesbaar', () => {
    const graad = fieldsOf('language').find((field) => field.key === 'moeilijkheidsgraad');
    expect(graad?.label).toBe('Moeilijkheidsgraad');
    expect(graad?.kind).toBe('select');
    // Eén schaal voor spreken én lezen, in oplopende volgorde.
    expect(graad?.options).toEqual([
      'eenvoudig',
      'te doen',
      'lastig',
      'zeer lastig',
      'vrijwel onleesbaar',
    ]);
  });

  it('en de handvol velden ernaast wijzen waar ze moeten', () => {
    const fields = fieldsOf('language');
    const by = (key: string) => fields.find((field) => field.key === key);
    expect(by('schrift')?.kind).toBe('text');
    expect(by('staat')?.kind).toBe('select');
    expect(by('staat')?.options).toEqual(['levend', 'stervend', 'uitgestorven', 'alleen op schrift']);
    expect(by('gebied')?.kind).toBe('entry_links');
    expect(by('gebied')?.ofType).toEqual(['location']);
    expect(by('verwant_aan')?.ofType).toEqual(['language']);
    // Kort houden: een soort met vijftien velden is een formulier dat niemand invult.
    expect(fields.length).toBeLessThanOrEqual(6);
  });

  it('en de pagina toont wie haar spreekt, van de andere kant van de koppeling', () => {
    const row = deps.sqlite
      .prepare('SELECT blocks FROM entry_types WHERE slug = ?')
      .get('language') as { blocks: string | null } | undefined;
    const blocks = JSON.parse(row?.blocks || '[]') as {
      kind: string;
      viaField?: string;
      fromType?: string[];
    }[];
    const derived = blocks.find((block) => block.kind === 'derived');
    expect(derived?.viaField).toBe('talen');
    // Precies de soorten die het veld hebben — anders staat er een lijst die
    // een halve archiefkant niet kan vinden.
    expect(derived?.fromType).toEqual(SPREKERS);
  });
});

describe('de andere kant van de koppeling', () => {
  it('is een Talen-veld op elke soort die een taal kan spreken of dragen', () => {
    for (const slug of SPREKERS) {
      const talen = fieldsOf(slug).find((field) => field.key === 'talen');
      expect(talen, slug).toBeTruthy();
      expect(talen?.label, slug).toBe('Talen');
      expect(talen?.kind, slug).toBe('entry_links');
      expect(talen?.ofType, slug).toEqual(['language']);
    }
  });

  it('en staat niet op soorten waar hij niets te zoeken heeft', () => {
    for (const slug of ['location', 'event', 'session']) {
      expect(fieldsOf(slug).some((field) => field.key === 'talen'), slug).toBe(false);
    }
  });
});

describe('een ingevuld Talen-veld', () => {
  it('noemt elke taal onder het label van het veld zelf', () => {
    const persoon = deps.createEntry({
      typeSlug: 'character',
      name: 'Bram Goedbloed',
      createdBy: KEEPER.id,
    });
    const walchers = deps.createEntry({
      typeSlug: 'language',
      name: 'Walchers',
      createdBy: KEEPER.id,
    });
    const kerklatijn = deps.createEntry({
      typeSlug: 'language',
      name: 'Kerklatijn',
      createdBy: KEEPER.id,
    });

    deps.updateEntry(
      persoon.id,
      { fields: { talen: [ref(walchers.id, 'Walchers'), ref(kerklatijn.id, 'Kerklatijn')] } },
      KEEPER,
    );

    const rows = deps.sqlite
      .prepare(
        "SELECT to_entry_id AS toId, detail FROM entry_mentions WHERE from_kind = 'field' AND from_id = ?",
      )
      .all(persoon.id) as { toId: string; detail: string }[];
    expect(rows.map((row) => row.toId).sort()).toEqual([walchers.id, kerklatijn.id].sort());
    expect(new Set(rows.map((row) => row.detail))).toEqual(new Set(['Talen']));
  });

  it('en dat is de zuivere helft, dus zonder database te lezen', () => {
    const targets = deps.fieldMentionsIn(fieldsOf('character'), {
      talen: [ref('a', 'A'), ref('b', 'B')],
      occupation: 'baakmeester',
    });
    expect(targets).toEqual([
      { toEntryId: 'a', detail: 'Talen' },
      { toEntryId: 'b', detail: 'Talen' },
    ]);
  });
});

describe('het seedmerkteken', () => {
  it('plakt het Talen-veld precies één keer aan een ouder archief', () => {
    // Een archief van voor deze ronde: geen merkteken, en geen Talen-veld op
    // de soorten die er toen al waren.
    deps.sqlite.prepare("DELETE FROM schema_migrations WHERE name = 'seed:round-27-talen'").run();
    for (const slug of SPREKERS) {
      const zonder = fieldsOf(slug).filter((field) => field.key !== 'talen');
      deps.sqlite
        .prepare('UPDATE entry_types SET fields = ? WHERE slug = ?')
        .run(JSON.stringify(zonder), slug);
    }

    deps.seedBaseline(deps.sqlite);
    deps.seedBaseline(deps.sqlite);

    for (const slug of SPREKERS) {
      const hits = fieldsOf(slug).filter((field) => field.key === 'talen');
      expect(hits.length, slug).toBe(1);
      expect(hits[0].label, slug).toBe('Talen');
    }
  });

  it('en laat het woord én het vizier van de Keeper met rust', () => {
    deps.sqlite.prepare("DELETE FROM schema_migrations WHERE name = 'seed:round-27-talen'").run();
    const hunne = fieldsOf('object').map((field) =>
      field.key === 'talen'
        ? { ...field, label: 'Opschrift in', ofType: ['language', 'lore'] }
        : field,
    );
    deps.sqlite
      .prepare("UPDATE entry_types SET fields = ? WHERE slug = 'object'")
      .run(JSON.stringify(hunne));

    deps.seedBaseline(deps.sqlite);

    const hits = fieldsOf('object').filter((field) => field.key === 'talen');
    expect(hits.length).toBe(1);
    expect(hits[0].label).toBe('Opschrift in');
    expect(hits[0].ofType).toEqual(['language', 'lore']);
  });
});
