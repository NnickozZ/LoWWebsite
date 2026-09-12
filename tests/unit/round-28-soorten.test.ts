import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FieldDef } from '@/lib/db/schema';

/**
 * Ronde 28: §58 — Geschriften & Kunstwerken, en het pantheon.
 *
 * Nick vroeg twee dingen tegelijk. "Overleveringen en folklore mag Geschriften
 * & Kunstwerken worden. Waar Schilderijen, Grimoires, toneelstukken, boeken, en
 * al dat soort dingen tussen passen" — dat is een hernoeming tot in het adres,
 * met de hele stoet eraan vast. En "Nieuwe artiekelen: Geschriften &
 * Kunstwerken, Kosmische Goden, Aardse Goden, Eldritch Entiteiten,
 * Bovennatuurlijke wezens" — vier soorten met een gedeelde kern, onderling
 * koppelbaar, en een veld op Personen, Onderzoekers én Facties, want "facties
 * linken met creatures zou ook nice zijn aangezien we cults bij facties
 * plaatsen".
 *
 * En één regel die vanaf nu boven alles staat, in Nick's eigen woorden: "Ik wil
 * niet dat standaard artikelen keeper only zijn, nooit." §48 (geboren op een
 * kant) is het enige dat daarover gaat, en geen enkele soort hier mag daar iets
 * aan veranderen — de laatste describe hieronder is die controle.
 */

const dir = mkdtempSync(join(tmpdir(), 'zcf-r28-'));
process.env.DATA_DIR = dir;

/** De vier machten, in de volgorde waarin een koppelingsveld ze aanbiedt. */
const PANTHEON = [
  'kosmische-goden',
  'aardse-goden',
  'eldritch-entiteiten',
  'bovennatuurlijke-wezens',
];
/** En de abnormaliteiten erbij: precies het vizier van Vereert en Dienaar van. */
const HOGERE_MACHTEN = [...PANTHEON, 'abnormality'];
/** Wie iets kan vereren. */
const VEREERDERS = ['character', 'investigator', 'faction'];

type Deps = {
  sqlite: typeof import('@/lib/db').sqlite;
  seedBaseline: typeof import('@/lib/db/seed.mjs').seedBaseline;
  createEntry: typeof import('@/lib/entries/service').createEntry;
  updateEntry: typeof import('@/lib/entries/service').updateEntry;
  fieldMentionsIn: typeof import('@/lib/entries/mentions').fieldMentionsIn;
};
let deps: Deps;

const KEEPER = { id: 'keeper-1', isKeeper: true };

type TypeRow = {
  id: string;
  slug: string;
  label: string;
  icon: string;
  colour: string;
  border: string;
  sort_order: number;
  case_only: number;
  fields: string;
  blocks: string | null;
};

const typeRow = (slug: string): TypeRow | undefined =>
  deps.sqlite.prepare('SELECT * FROM entry_types WHERE slug = ?').get(slug) as TypeRow | undefined;

const fieldsOf = (slug: string): FieldDef[] => {
  const row = typeRow(slug);
  return row ? (JSON.parse(row.fields) as FieldDef[]) : [];
};

type Block = { id: string; kind: string; title?: string; viaField?: string; fromType?: string[] };
const blocksOf = (slug: string): Block[] => JSON.parse(typeRow(slug)?.blocks || '[]') as Block[];

const veld = (slug: string, key: string) => fieldsOf(slug).find((field) => field.key === key);

const ref = (id: string, name: string) => ({ id, name, slug: name.toLowerCase() });

const heeftMerkteken = (name: string) =>
  Boolean(deps.sqlite.prepare('SELECT name FROM schema_migrations WHERE name = ?').get(name));

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

describe('de vier machten', () => {
  it('staan er, in het Nederlands, tussen Abnormaliteiten en Facties', () => {
    const verwacht: [string, string, number][] = [
      ['kosmische-goden', 'Kosmische Goden', 62],
      ['aardse-goden', 'Aardse Goden', 64],
      ['eldritch-entiteiten', 'Eldritch Entiteiten', 66],
      ['bovennatuurlijke-wezens', 'Bovennatuurlijke wezens', 68],
    ];
    for (const [slug, label, sort] of verwacht) {
      const row = typeRow(slug);
      expect(row?.label, slug).toBe(label);
      expect(row?.sort_order, slug).toBe(sort);
      // Tussen Abnormaliteiten (60) en Facties (70).
      expect(row!.sort_order > 60 && row!.sort_order < 70, slug).toBe(true);
      // Een god wordt niet in een dossier gevonden.
      expect(row?.case_only, slug).toBe(0);
      // Eén familie op het prikbord: dezelfde rand als de Abnormaliteiten.
      expect(row?.border, slug).toBe('frame');
    }
  });

  it('delen een kern, en die kern wijst waar hij moet', () => {
    for (const slug of PANTHEON) {
      expect(veld(slug, 'titels')?.label, slug).toBe('Titels en bijnamen');
      expect(veld(slug, 'titels')?.kind, slug).toBe('text');
      expect(veld(slug, 'domein')?.kind, slug).toBe('text');
      expect(veld(slug, 'tekens')?.label, slug).toBe('Tekens en voortekenen');
      expect(veld(slug, 'tekens')?.kind, slug).toBe('longtext');
      expect(veld(slug, 'talen')?.ofType, slug).toEqual(['language']);

      const vereerdDoor = veld(slug, 'vereerd_door');
      expect(vereerdDoor?.label, slug).toBe('Vereerd door');
      expect(vereerdDoor?.kind, slug).toBe('entry_links');
      // Facties eerst: de "'X' aanmaken"-rij van de kiezer maakt de eerste soort.
      expect(vereerdDoor?.ofType, slug).toEqual(['faction', 'character', 'investigator']);
    }
  });

  it('en houden het kort — acht velden, geen formulier', () => {
    for (const slug of PANTHEON) {
      expect(fieldsOf(slug).length, slug).toBe(8);
    }
  });

  it('hebben elk twee velden die hen tot zichzelf maken', () => {
    expect(veld('kosmische-goden', 'toestand')?.options).toEqual([
      'sluimerend',
      'half wakker',
      'ontwaakt',
      'vertrokken',
      'onbekend',
    ]);
    expect(veld('kosmische-goden', 'verblijf')?.kind).toBe('text');
    expect(veld('aardse-goden', 'standplaats')?.ofType).toEqual(['location']);
    expect(veld('aardse-goden', 'offer')?.label).toBe('Wat men offert');
    expect(veld('eldritch-entiteiten', 'verschijning')?.kind).toBe('text');
    expect(veld('eldritch-entiteiten', 'gevaar')?.options).toEqual([
      'te mijden',
      'dodelijk',
      'verstandverbijsterend',
      'onbekend',
    ]);
    expect(veld('bovennatuurlijke-wezens', 'aard')?.kind).toBe('select');
    expect(veld('bovennatuurlijke-wezens', 'leefgebied')?.ofType).toEqual(['location']);
  });
});

describe('onderling koppelbaar', () => {
  it('is één veld, van onderen naar boven: Dienaar van', () => {
    // Op de vier zelf én op de Abnormaliteiten, want de lijst aan de andere
    // kant moet ze allemaal kunnen vinden.
    for (const slug of HOGERE_MACHTEN) {
      const dienaar = veld(slug, 'dienaar_van');
      expect(dienaar?.label, slug).toBe('Dienaar van');
      expect(dienaar?.kind, slug).toBe('entry_links');
      expect(dienaar?.ofType, slug).toEqual(HOGERE_MACHTEN);
    }
  });

  it('en de andere kant is een lijst die zichzelf vult, geen tweede veld', () => {
    for (const slug of PANTHEON) {
      const dienaren = blocksOf(slug).find((block) => block.id === 'dienaren');
      expect(dienaren?.kind, slug).toBe('derived');
      expect(dienaren?.title, slug).toBe('Dienaren');
      expect(dienaren?.viaField, slug).toBe('dienaar_van');
      // Elke soort die het veld draagt, of de halve lijst valt stil weg.
      expect(dienaren?.fromType, slug).toEqual(HOGERE_MACHTEN);
    }
  });
});

describe('de andere kant van de verering', () => {
  it('is een Vereert-veld op Personen, Onderzoekers én Facties', () => {
    for (const slug of VEREERDERS) {
      const vereert = veld(slug, 'vereert');
      expect(vereert?.label, slug).toBe('Vereert');
      expect(vereert?.kind, slug).toBe('entry_links');
      expect(vereert?.ofType, slug).toEqual(HOGERE_MACHTEN);
    }
  });

  it('en staat niet op soorten waar hij niets te zoeken heeft', () => {
    for (const slug of ['location', 'event', 'session', 'language']) {
      expect(fieldsOf(slug).some((field) => field.key === 'vereert'), slug).toBe(false);
    }
  });

  it('en leest terug op de pagina van de macht zelf', () => {
    for (const slug of PANTHEON) {
      const vereerders = blocksOf(slug).find((block) => block.id === 'vereerders');
      expect(vereerders?.kind, slug).toBe('derived');
      expect(vereerders?.title, slug).toBe('Vereerders');
      expect(vereerders?.viaField, slug).toBe('vereert');
      expect(vereerders?.fromType, slug).toEqual(VEREERDERS);
    }
  });

  it('en een ingevuld Vereert-veld is een vermelding per macht', () => {
    const cultus = deps.createEntry({
      typeSlug: 'faction',
      name: 'De Broederschap van de Elfde Streep',
      createdBy: KEEPER.id,
    });
    const god = deps.createEntry({
      typeSlug: 'kosmische-goden',
      name: 'Die Onder Het Zout Slaapt',
      createdBy: KEEPER.id,
    });

    deps.updateEntry(
      cultus.id,
      { fields: { vereert: [ref(god.id, 'Die Onder Het Zout Slaapt')] } },
      KEEPER,
    );

    const rows = deps.sqlite
      .prepare(
        "SELECT to_entry_id AS toId, detail FROM entry_mentions WHERE from_kind = 'field' AND from_id = ?",
      )
      .all(cultus.id) as { toId: string; detail: string }[];
    expect(rows).toEqual([{ toId: god.id, detail: 'Vereert' }]);
  });

  it('en dat is de zuivere helft, dus zonder database te lezen', () => {
    expect(
      deps.fieldMentionsIn(fieldsOf('character'), {
        vereert: [ref('a', 'A'), ref('b', 'B')],
        occupation: 'baakmeester',
      }),
    ).toEqual([
      { toEntryId: 'a', detail: 'Vereert' },
      { toEntryId: 'b', detail: 'Vereert' },
    ]);
  });
});

describe('Geschriften & Kunstwerken', () => {
  it('staat er onder zijn nieuwe adres, en het oude is weg', () => {
    const row = typeRow('werken');
    expect(row?.id).toBe('werken');
    expect(row?.label).toBe('Geschriften & Kunstwerken');
    expect(row?.sort_order).toBe(90);
    expect(row?.case_only).toBe(0);
    expect(typeRow('lore')).toBeUndefined();
  });

  it('past van een schilderij tot een grimoire, en blijft kort', () => {
    const soortWerk = veld('werken', 'soort_werk');
    expect(soortWerk?.kind).toBe('select');
    expect(soortWerk?.options).toEqual([
      'schilderij',
      'tekening of prent',
      'beeld',
      'boek',
      'handschrift',
      'grimoire',
      'toneelstuk',
      'lied of gedicht',
      'overlevering',
      'anders',
    ]);
    expect(veld('werken', 'maker')?.ofType).toEqual(['character', 'investigator', 'faction']);
    expect(veld('werken', 'gemaakt')?.kind).toBe('date');
    expect(veld('werken', 'bevindt_zich')?.ofType).toEqual(['location']);
    // Wat het toont mag alles zijn, dus met opzet zonder vizier.
    expect(veld('werken', 'toont')?.kind).toBe('entry_links');
    expect(veld('werken', 'toont')?.ofType).toBeUndefined();
    // §55 blijft staan.
    expect(veld('werken', 'talen')?.ofType).toEqual(['language']);
    expect(fieldsOf('werken').length).toBeLessThanOrEqual(6);
  });

  it('en de lijst op een taal noemt hem onder zijn nieuwe adres', () => {
    const sprekers = blocksOf('language').find((block) => block.viaField === 'talen');
    expect(sprekers?.fromType).toContain('werken');
    expect(sprekers?.fromType).not.toContain('lore');
  });
});

/**
 * De hernoeming zelf, op een archief van vóór deze ronde. `renameTypeSlug` in
 * `lib/admin/types.ts` is de Keeperkant ervan; de seed loopt dezelfde cascade
 * na (`renameSeededType`), en dit is wat die moet meenemen.
 */
describe('de hernoeming, in een bestaand archief', () => {
  /** Draait het archief terug naar hoe het er vóór ronde 28 uitzag. */
  const terugNaarLore = () => {
    deps.sqlite.prepare("DELETE FROM schema_migrations WHERE name LIKE 'seed:round-28-%'").run();
    deps.sqlite.prepare("DELETE FROM schema_migrations WHERE name = 'seed:type-renamed:lore'").run();
    deps.sqlite
      .prepare(
        "UPDATE entry_types SET id = 'lore', slug = 'lore', label = 'Overlevering en folklore', fields = ? WHERE id = 'werken'",
      )
      .run(JSON.stringify([{ key: 'talen', label: 'Talen', kind: 'entry_links', ofType: ['language'] }]));
    deps.sqlite.prepare("UPDATE entries SET type_id = 'lore' WHERE type_id = 'werken'").run();
    // En de twee plekken die de soort bij zijn adres noemen.
    const blocks = blocksOf('language').map((block) =>
      block.fromType
        ? { ...block, fromType: block.fromType.map((slug) => (slug === 'werken' ? 'lore' : slug)) }
        : block,
    );
    deps.sqlite
      .prepare("UPDATE entry_types SET blocks = ? WHERE slug = 'language'")
      .run(JSON.stringify(blocks));
  };

  it('verhuist de rij, de artikelen, de tabbladen en elke verwijzing mee', () => {
    terugNaarLore();

    const rijmpje = deps.createEntry({
      typeSlug: 'lore',
      name: 'De rijmpjes van Ritthem',
      createdBy: KEEPER.id,
    });
    // §7: een dossier dat zijn tabbladen op slug heeft vastgezet.
    deps.sqlite
      .prepare(
        `INSERT INTO cases (id, name, slug, tab_types, created_by)
         VALUES ('case-1', 'Het dossier', 'het-dossier', ?, 'keeper-1')`,
      )
      .run(JSON.stringify(['location', 'lore']));
    // En een Keeper die een eigen veld op zijn eigen soort richtte.
    deps.sqlite
      .prepare("UPDATE entry_types SET fields = ? WHERE slug = 'object'")
      .run(
        JSON.stringify([
          ...fieldsOf('object'),
          { key: 'beschreven_in', label: 'Beschreven in', kind: 'entry_links', ofType: ['lore'] },
        ]),
      );

    deps.seedBaseline(deps.sqlite);

    expect(typeRow('lore')).toBeUndefined();
    expect(typeRow('werken')?.label).toBe('Geschriften & Kunstwerken');
    // Het artikel is meegegaan, met zijn eigen naam en slug.
    const artikel = deps.sqlite
      .prepare('SELECT type_id AS typeId FROM entries WHERE id = ?')
      .get(rijmpje.id) as { typeId: string };
    expect(artikel.typeId).toBe('werken');
    // Het vastgezette tabblad.
    const tabs = deps.sqlite.prepare("SELECT tab_types FROM cases WHERE id = 'case-1'").get() as {
      tab_types: string;
    };
    expect(JSON.parse(tabs.tab_types)).toEqual(['location', 'werken']);
    // Het `ofType` van een veld op een andere soort.
    expect(veld('object', 'beschreven_in')?.ofType).toEqual(['werken']);
    // En het `fromType` van een zelfvullende lijst op een andere soort.
    const sprekers = blocksOf('language').find((block) => block.viaField === 'talen');
    expect(sprekers?.fromType).toContain('werken');
    expect(sprekers?.fromType).not.toContain('lore');
  });

  it('en het Talen-veld van §55 overleeft het, met de nieuwe velden erachter', () => {
    const keys = fieldsOf('werken').map((field) => field.key);
    expect(keys).toContain('talen');
    expect(keys).toEqual(expect.arrayContaining(['soort_werk', 'maker', 'gemaakt', 'bevindt_zich', 'toont']));
    // Precies één keer, hoe vaak de seed ook draait.
    expect(keys.filter((key) => key === 'talen').length).toBe(1);
  });
});

describe('de seedmerktekens', () => {
  it('zijn eenmalig: nog een keer seeden verandert niets', () => {
    const voor = deps.sqlite
      .prepare('SELECT id, fields, blocks FROM entry_types ORDER BY id')
      .all();
    deps.seedBaseline(deps.sqlite);
    deps.seedBaseline(deps.sqlite);
    const na = deps.sqlite.prepare('SELECT id, fields, blocks FROM entry_types ORDER BY id').all();
    expect(na).toEqual(voor);
  });

  it('en laten het woord én het vizier van de Keeper met rust', () => {
    deps.sqlite.prepare("DELETE FROM schema_migrations WHERE name = 'seed:round-28-pantheon'").run();
    const hunne = fieldsOf('faction').map((field) =>
      field.key === 'vereert'
        ? { ...field, label: 'Bidt tot', ofType: ['kosmische-goden'] }
        : field,
    );
    deps.sqlite
      .prepare("UPDATE entry_types SET fields = ? WHERE slug = 'faction'")
      .run(JSON.stringify(hunne));

    deps.seedBaseline(deps.sqlite);

    const hits = fieldsOf('faction').filter((field) => field.key === 'vereert');
    expect(hits.length).toBe(1);
    expect(hits[0].label).toBe('Bidt tot');
    expect(hits[0].ofType).toEqual(['kosmische-goden']);
  });

  it('en een Keeper die de soort zélf al verhuisd heeft wordt niet ingehaald', () => {
    // Een archief waarin de Keeper `lore` naar `overlevering` heeft gebracht:
    // `renameTypeSlug` laat daar een merkteken achter, en dat wint van het onze.
    deps.sqlite.prepare("DELETE FROM schema_migrations WHERE name LIKE 'seed:round-28-%'").run();
    deps.sqlite
      .prepare(
        "UPDATE entry_types SET id = 'overlevering', slug = 'overlevering', label = 'Overlevering en folklore' WHERE id = 'werken'",
      )
      .run();
    deps.sqlite
      .prepare('INSERT OR IGNORE INTO schema_migrations (name) VALUES (?)')
      .run('seed:type-renamed:lore');

    deps.seedBaseline(deps.sqlite);

    // Van hem, en van hem gebleven: geen tweede rij, geen hernoeming.
    expect(typeRow('overlevering')?.label).toBe('Overlevering en folklore');
    expect(typeRow('werken')).toBeUndefined();
    expect(typeRow('lore')).toBeUndefined();
    expect(heeftMerkteken('seed:round-28-werken')).toBe(true);
  });
});

/**
 * "Ik wil niet dat standaard artikelen keeper only zijn, nooit. Ze moeten
 * keeper worden als ze gemaakt worden terwijl de gebruiker in de keeper zone
 * zit." §48 is het enige dat daarover beslist, en niets van deze ronde mag daar
 * bovenop komen.
 */
describe('geen enkele soort wordt Keeper-only geboren', () => {
  it('een artikel van elk van de vijf staat gewoon op de spelerskant', () => {
    // Het archief staat na de vorige describe op `overlevering`; terug naar
    // ronde 28 zoals hij hoort te draaien.
    deps.sqlite.prepare("DELETE FROM schema_migrations WHERE name LIKE 'seed:round-28-%'").run();
    deps.sqlite.prepare("DELETE FROM schema_migrations WHERE name = 'seed:type-renamed:lore'").run();
    deps.sqlite
      .prepare("UPDATE entry_types SET id = 'werken', slug = 'werken' WHERE id = 'overlevering'")
      .run();
    deps.seedBaseline(deps.sqlite);

    for (const slug of ['werken', ...PANTHEON]) {
      const gemaakt = deps.createEntry({
        typeSlug: slug,
        name: `Iets van ${slug}`,
        createdBy: KEEPER.id,
      });
      const row = deps.sqlite
        .prepare('SELECT visibility FROM entries WHERE id = ?')
        .get(gemaakt.id) as { visibility: string };
      expect(row.visibility, slug).toBe('all');
    }
  });

  it('en de soort heeft niet eens een knop waarmee dat zou kunnen', () => {
    // De enige gewoonte die een soort aan een nieuw artikel meegeeft is §49's
    // dossiernaam ervoor. Er is geen kolom op `entry_types` die over de kant
    // gaat, en die mag er ook niet komen: §48 beslist dat, en niets anders.
    const kolommen = (
      deps.sqlite.prepare('PRAGMA table_info(entry_types)').all() as { name: string }[]
    ).map((kolom) => kolom.name);
    expect(kolommen).not.toContain('keeper_only');
    expect(kolommen).not.toContain('visibility');
    expect(kolommen).toContain('prefix_default');
    for (const slug of ['werken', ...PANTHEON]) {
      const row = deps.sqlite
        .prepare('SELECT prefix_default AS prefixDefault FROM entry_types WHERE slug = ?')
        .get(slug) as { prefixDefault: number };
      expect(row.prefixDefault, slug).toBeFalsy();
    }
  });
});
