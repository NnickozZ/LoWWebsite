import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { cleanFields } from '@/lib/fieldKinds';
import { mirrorPlan } from '@/lib/families/mirror';
import type { FieldDef } from '@/lib/db/schema';
import { fillOtherSides, hideRepeatedBlocks, pairFieldsOf, TWO_SIDED } from '@/lib/entries/tweeKanten.mjs';

/**
 * Golf O — twee kanten van één feit (Nick: "Sjaantje worships God, then God
 * should also get 'is worshipped by' Sjaantje … if it is removed then it is
 * removed on both sides").
 */

const dir = mkdtempSync(join(tmpdir(), 'zcf-twee-kanten-'));
process.env.DATA_DIR = dir;

type Deps = {
  sqlite: typeof import('@/lib/db').sqlite;
  createEntry: typeof import('@/lib/entries/service').createEntry;
  updateEntry: typeof import('@/lib/entries/service').updateEntry;
};
let deps: Deps;
const KEEPER = { id: 'keeper-1', isKeeper: true };
const ref = (id: string, name: string) => ({ id, name, slug: name.toLowerCase() });
const fieldsOf = (slug: string): FieldDef[] =>
  JSON.parse((deps.sqlite.prepare('SELECT fields FROM entry_types WHERE slug = ?').get(slug) as { fields: string }).fields);
const blocksOf = (slug: string): { id: string; hidden?: boolean }[] =>
  JSON.parse((deps.sqlite.prepare('SELECT blocks FROM entry_types WHERE slug = ?').get(slug) as { blocks: string }).blocks);
const valuesOf = (id: string): Record<string, unknown> =>
  JSON.parse((deps.sqlite.prepare('SELECT fields FROM entries WHERE id = ?').get(id) as { fields: string }).fields);
const ids = (value: unknown) => (Array.isArray(value) ? value : value ? [value] : []).map((item) => (item as { id: string }).id);

beforeAll(async () => {
  const dbModule = await import('@/lib/db');
  const entries = await import('@/lib/entries/service');
  deps = { sqlite: dbModule.sqlite, createEntry: entries.createEntry, updateEntry: entries.updateEntry };
  deps.sqlite
    .prepare(
      `INSERT INTO users (id, username, username_lower, password_hash, is_keeper)
       VALUES ('keeper-1', 'Keeper', 'keeper', 'x', 1)`,
    )
    .run();
});

afterAll(() => {
  deps?.sqlite.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('het veld zegt wat zijn andere kant is', () => {
  it('cleanFields houdt `inverse` op een koppelingsveld zonder rol, en nergens anders', () => {
    const cleaned = cleanFields([
      { key: 'vereert', label: 'Vereert', kind: 'entry_links', inverse: 'vereerd_door' },
      { key: 'ouders', label: 'Ouders', kind: 'entry_links', role: 'parent', inverse: 'kinderen' },
      { key: 'naam', label: 'Naam', kind: 'text', inverse: 'x' },
      { key: 'raar', label: 'Raar', kind: 'entry_link', inverse: 'Geen Sleutel!' },
    ]);
    expect(cleaned.map((field) => field.inverse)).toEqual(['vereerd_door', undefined, undefined, undefined]);
  });

  it('mirrorPlan schrijft alleen naar een veld dat terug noemt', () => {
    const persoon: FieldDef[] = [{ key: 'vereert', label: 'Vereert', kind: 'entry_links', inverse: 'vereerd_door' }];
    const god: FieldDef[] = [{ key: 'vereerd_door', label: 'Vereerd door', kind: 'entry_links', inverse: 'vereert' }];
    const vreemd: FieldDef[] = [{ key: 'vereerd_door', label: 'Vereerd door', kind: 'entry_links' }];
    expect(mirrorPlan('s', persoon, {}, { vereert: [ref('g', 'God')] }, () => god)).toEqual([
      { targetId: 'g', fieldKey: 'vereerd_door', add: true },
    ]);
    expect(mirrorPlan('s', persoon, { vereert: [ref('g', 'God')] }, { vereert: [] }, () => god)).toEqual([
      { targetId: 'g', fieldKey: 'vereerd_door', add: false },
    ]);
    expect(mirrorPlan('s', persoon, {}, { vereert: [ref('g', 'God')] }, () => vreemd)).toEqual([]);
  });

  it('elk paar noemt twee verschillende sleutels, of één die zichzelf noemt', () => {
    for (const { a, b } of TWO_SIDED) {
      expect(a.types.length, a.key).toBeGreaterThan(0);
      expect(b.types.length, b.key).toBeGreaterThan(0);
    }
  });

  it('pairFieldsOf zet de sleutels en maakt wat ontbreekt; een eigen keuze van de Keeper blijft', () => {
    const { fields } = pairFieldsOf('aardse-goden', [
      { key: 'vereerd_door', label: 'Vereerd door', kind: 'entry_links' },
      { key: 'dienaar_van', label: 'Dienaar van', kind: 'entry_links', inverse: 'iets_anders' },
    ]);
    expect(fields.find((f: FieldDef) => f.key === 'vereerd_door')?.inverse).toBe('vereert');
    expect(fields.find((f: FieldDef) => f.key === 'dienaar_van')?.inverse).toBe('iets_anders');
    expect(fields.find((f: FieldDef) => f.key === 'dienaren')).toMatchObject({ label: 'Dienaren', inverse: 'dienaar_van' });
  });

  it('verbergt alleen onze eigen lijst', () => {
    const { blocks } = hideRepeatedBlocks('faction', [
      { id: 'leden', kind: 'derived', viaField: 'faction' },
      { id: 'eigen', kind: 'derived', viaField: 'faction' },
    ]);
    expect(blocks.map((block: { hidden?: boolean }) => Boolean(block.hidden))).toEqual([true, false]);
  });

  it('fillOtherSides vult alleen bij, en een vol vak voor één blijft van wie erin staat', () => {
    const defs = new Map<string, FieldDef[]>([
      ['character', [{ key: 'faction', label: 'Factie', kind: 'entry_link', inverse: 'leden' }]],
      ['faction', [{ key: 'leden', label: 'Leden', kind: 'entry_links', inverse: 'faction' }]],
    ]);
    const out = fillOtherSides(
      [
        { id: 'c', typeSlug: 'character', fields: { faction: { id: 'f' } } },
        { id: 'd', typeSlug: 'character', fields: { faction: { id: 'z' } } },
        { id: 'f', typeSlug: 'faction', fields: { leden: [{ id: 'd' }] } },
        { id: 'z', typeSlug: 'faction', fields: {} },
      ],
      defs,
      (id: string) => ({ id, name: id, slug: id }),
    );
    expect(ids(out.get('f')?.leden)).toEqual(['d', 'c']);
    expect(ids(out.get('z')?.leden)).toEqual(['d']);
    // d noemt z al; f's "Leden: d" zet d niet om.
    expect(out.has('d')).toBe(false);
  });
});

describe('op een echt archief', () => {
  it('de seed zette de paren, verborg de herhaalde lijsten en haalde de Achternaam weg', () => {
    expect(fieldsOf('character').find((f) => f.key === 'vereert')?.inverse).toBe('vereerd_door');
    expect(fieldsOf('aardse-goden').find((f) => f.key === 'vereerd_door')?.inverse).toBe('vereert');
    expect(fieldsOf('location').map((f) => f.key)).toEqual(expect.arrayContaining(['hier_gevonden', 'laatst_hier_gezien']));
    expect(blocksOf('aardse-goden').find((b) => b.id === 'vereerders')?.hidden).toBe(true);
    expect(fieldsOf('character').some((f) => f.key === 'achternaam')).toBe(false);
    for (const slug of ['character', 'investigator', 'location', 'aardse-goden']) {
      expect(fieldsOf(slug).length, slug).toBeLessThanOrEqual(20);
    }
  });

  it('Sjaantje vereert God: God zegt het terug, en weghalen doet het aan beide kanten', () => {
    const sjaan = deps.createEntry({ typeSlug: 'character', name: 'Sjaantje', createdBy: KEEPER.id });
    const god = deps.createEntry({ typeSlug: 'aardse-goden', name: 'De God', createdBy: KEEPER.id });
    deps.updateEntry(sjaan.id, { fields: { vereert: [ref(god.id, 'De God')] } }, KEEPER);
    expect(ids(valuesOf(god.id).vereerd_door)).toEqual([sjaan.id]);
    // Van de andere kant weghalen.
    deps.updateEntry(god.id, { fields: { vereerd_door: [] } }, KEEPER);
    expect(ids(valuesOf(sjaan.id).vereert)).toEqual([]);
  });

  it('een factie die een lid overneemt: het oude huis laat hem gaan', () => {
    const kees = deps.createEntry({ typeSlug: 'character', name: 'Kees', createdBy: KEEPER.id });
    const oud = deps.createEntry({ typeSlug: 'faction', name: 'Het Oude Gilde', createdBy: KEEPER.id });
    const nieuw = deps.createEntry({ typeSlug: 'faction', name: 'De Nieuwe Orde', createdBy: KEEPER.id });
    deps.updateEntry(kees.id, { fields: { faction: ref(oud.id, 'Het Oude Gilde') } }, KEEPER);
    expect(ids(valuesOf(oud.id).leden)).toEqual([kees.id]);
    deps.updateEntry(nieuw.id, { fields: { leden: [ref(kees.id, 'Kees')] } }, KEEPER);
    expect(ids(valuesOf(kees.id).faction)).toEqual([nieuw.id]);
    expect(ids(valuesOf(oud.id).leden)).toEqual([]);
  });
});
