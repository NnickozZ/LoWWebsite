import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  classifySiblings,
  pairKey,
  primaryParentField,
  reconcileSiblings,
  SIBLING_WORDS,
} from '@/lib/families/siblings';
import type { FamilyGraph, GraphEdge } from '@/lib/families/types';
import type { RoleFieldSource } from '@/lib/families/roles';

/**
 * §67 — broers en zussen.
 *
 * Two halves, and the point of the round is that they are two:
 *
 *  1. The **derived** half. Nobody types "broer": two people with the same
 *     parents are siblings and the archive works that out. The three verdicts
 *     are `vol`, `half` and `onbekend`, and the third one is the interesting
 *     one — a shared mother and nothing else recorded is not proof of anything,
 *     so the archive says it does not know rather than guessing "vol".
 *  2. The **typed** half, for what cannot be derived: the parents are unknown
 *     and somebody still knows the two belong together. Where both halves reach
 *     the same pair the stronger one wins (`reconcileSiblings`), and where the
 *     typed one contradicts the parents it is kept and marked rather than
 *     silently dropped — a Keeper's field is never overruled in silence.
 */

const set = (...ids: string[]) => new Set(ids);
const map = (rows: Record<string, string[]>) =>
  new Map(Object.entries(rows).map(([id, parents]) => [id, set(...parents)]));

/* -------------------------------------------------------------- the reading */

describe('§67 primaryParentField', () => {
  const god: RoleFieldSource[] = [
    { key: 'ouders', label: 'Ouders', kind: 'entry_links', role: 'parent' },
    { key: 'kinderen', label: 'Kinderen', kind: 'entry_links', role: 'child' },
    { key: 'geschapen_door', label: 'Geschapen door', kind: 'entry_links', role: 'parent' },
  ];

  it('is the FIRST parent-role field, the one the mirror writes into', () => {
    expect(primaryParentField(god)).toBe('ouders');
  });

  /*
   * The whole reason the function exists: derive from every parent-role field
   * and every creature of one god is a brother of every other.
   */
  it('and never a second one, however the Keeper ordered them', () => {
    expect(primaryParentField([god[2], god[0]])).toBe('geschapen_door');
  });

  it('is null for a soort with no parent field at all', () => {
    expect(primaryParentField([{ key: 'naam', label: 'Naam', kind: 'text' }])).toBeNull();
    expect(primaryParentField([])).toBeNull();
    // A role on something that is not a koppelingsveld is not a role (§66).
    expect(primaryParentField([{ key: 'x', label: 'X', kind: 'text', role: 'parent' }])).toBeNull();
  });
});

/* ------------------------------------------------------------ the three words */

describe('§67 classifySiblings', () => {
  it('calls two people with the same two parents vol', () => {
    expect(classifySiblings(map({ a: ['pa', 'ma'], b: ['pa', 'ma'] }))).toEqual([
      { a: 'a', b: 'b', kind: 'full' },
    ]);
  });

  it('calls a pair that each has a parent the other lacks half', () => {
    expect(classifySiblings(map({ a: ['pa', 'ma'], b: ['pa', 'stiefma'] }))).toEqual([
      { a: 'a', b: 'b', kind: 'half' },
    ]);
  });

  /*
   * One recorded mother on both pages is not proof that the fathers differ, and
   * it is not proof that they are the same either. The archive says so.
   */
  it('calls one shared parent and nothing else onbekend', () => {
    expect(classifySiblings(map({ a: ['ma'], b: ['ma'] }))).toEqual([
      { a: 'a', b: 'b', kind: 'unknown' },
    ]);
  });

  it('and calls a subset onbekend too — a fuller page is not a different parent', () => {
    expect(classifySiblings(map({ a: ['pa', 'ma'], b: ['ma'] }))).toEqual([
      { a: 'a', b: 'b', kind: 'unknown' },
    ]);
  });

  it('says nothing at all about two people who share no parent', () => {
    expect(classifySiblings(map({ a: ['pa'], b: ['iemand'] }))).toEqual([]);
  });

  it('and nothing about somebody whose parents are not recorded', () => {
    expect(classifySiblings(map({ a: ['pa', 'ma'], b: [] }))).toEqual([]);
    expect(classifySiblings(new Map())).toEqual([]);
  });

  it('pairs everybody with everybody, ends and list both sorted', () => {
    const out = classifySiblings(map({ c: ['pa', 'ma'], a: ['pa', 'ma'], b: ['pa', 'ma'] }));
    expect(out).toEqual([
      { a: 'a', b: 'b', kind: 'full' },
      { a: 'a', b: 'c', kind: 'full' },
      { a: 'b', b: 'c', kind: 'full' },
    ]);
  });

  it('is deterministic whatever order the map was built in', () => {
    const one = classifySiblings(map({ b: ['ma'], a: ['ma', 'pa'], c: ['pa'] }));
    const two = classifySiblings(map({ c: ['pa'], b: ['ma'], a: ['pa', 'ma'] }));
    expect(one).toEqual(two);
  });

  it('names the three verdicts in Dutch', () => {
    expect(SIBLING_WORDS.full).toBe('vol');
    expect(SIBLING_WORDS.half).toBe('half');
    expect(SIBLING_WORDS.unknown).toBe('onbekend');
  });
});

/* ------------------------------------------------------------ the two halves */

describe('§67 reconcileSiblings', () => {
  it('drops an explicit link the parents already prove — it is redundant', () => {
    const out = reconcileSiblings(
      [{ a: 'a', b: 'b' }],
      [{ a: 'a', b: 'b', kind: 'full' }],
      map({ a: ['pa', 'ma'], b: ['pa', 'ma'] }),
    );
    expect(out).toEqual([{ a: 'a', b: 'b', kind: 'full', source: 'derived' }]);
  });

  it('keeps an explicit link the parents only half prove, and the derived one yields', () => {
    const out = reconcileSiblings(
      [{ a: 'b', b: 'a' }],
      [{ a: 'a', b: 'b', kind: 'half' }],
      map({ a: ['pa', 'ma'], b: ['pa', 'stiefma'] }),
    );
    // The pair is spelled one way whichever end wrote it, and the explicit
    // reading wins — that is the line a reader can click to take away.
    expect(out).toEqual([{ a: 'a', b: 'b', kind: 'explicit', source: 'explicit' }]);
  });

  it('marks an explicit link the recorded parents contradict, and keeps it', () => {
    const out = reconcileSiblings([{ a: 'a', b: 'b' }], [], map({ a: ['pa'], b: ['iemand'] }));
    expect(out).toEqual([
      { a: 'a', b: 'b', kind: 'explicit', source: 'explicit', contested: true },
    ]);
  });

  it('does not call it contested when one of the two has no parent recorded', () => {
    const out = reconcileSiblings([{ a: 'a', b: 'b' }], [], map({ a: ['pa'] }));
    expect(out).toEqual([{ a: 'a', b: 'b', kind: 'explicit', source: 'explicit' }]);
  });

  it('passes a derived pair nobody typed straight through', () => {
    const out = reconcileSiblings([], [{ a: 'a', b: 'b', kind: 'unknown' }]);
    expect(out).toEqual([{ a: 'a', b: 'b', kind: 'unknown', source: 'derived' }]);
  });

  it('never draws one pair twice, however often it was typed', () => {
    const out = reconcileSiblings(
      [
        { a: 'a', b: 'b' },
        { a: 'b', b: 'a' },
      ],
      [],
    );
    expect(out).toHaveLength(1);
  });

  it('ignores a link from somebody to themselves', () => {
    expect(reconcileSiblings([{ a: 'a', b: 'a' }], [])).toEqual([]);
  });

  it('spells a pair one way whichever end asks', () => {
    expect(pairKey('b', 'a')).toBe(pairKey('a', 'b'));
  });
});

/* ------------------------------------------------------------ in the archive */

const dir = mkdtempSync(join(tmpdir(), 'zcf-family-siblings-'));
process.env.DATA_DIR = dir;

type Deps = {
  sqlite: typeof import('@/lib/db').sqlite;
  buildFamilyGraph: typeof import('@/lib/families/graph').buildFamilyGraph;
  createFamilyTree: typeof import('@/lib/families/service').createFamilyTree;
  getFamilyTreeById: typeof import('@/lib/families/service').getFamilyTreeById;
  saveFamilyTreeState: typeof import('@/lib/families/service').saveFamilyTreeState;
  siblingsOf: typeof import('@/lib/families/service').siblingsOf;
  updateEntry: typeof import('@/lib/entries/service').updateEntry;
};
let deps: Deps;

const KEEPER = { id: 'keeper-1', isKeeper: true } as const;
const SPELER = { id: 'bram', isKeeper: false } as const;

const ref = (id: string, name: string) => ({ id, name, slug: id });
const siblingEdges = (graph: FamilyGraph): GraphEdge[] =>
  graph.edges.filter((edge) => edge.role === 'sibling');

beforeAll(async () => {
  const dbModule = await import('@/lib/db');
  const graph = await import('@/lib/families/graph');
  const families = await import('@/lib/families/service');
  const entries = await import('@/lib/entries/service');
  deps = {
    sqlite: dbModule.sqlite,
    buildFamilyGraph: graph.buildFamilyGraph,
    createFamilyTree: families.createFamilyTree,
    getFamilyTreeById: families.getFamilyTreeById,
    saveFamilyTreeState: families.saveFamilyTreeState,
    siblingsOf: families.siblingsOf,
    updateEntry: entries.updateEntry,
  };
  const run = (sql: string, ...args: unknown[]) => deps.sqlite.prepare(sql).run(...args);
  for (const [id, name, keeper] of [
    ['keeper-1', 'Keeper', 1],
    ['bram', 'Bram', 0],
  ] as const) {
    run(
      `INSERT INTO users (id, username, username_lower, password_hash, is_keeper) VALUES (?, ?, ?, 'x', ?)`,
      id,
      name,
      name.toLowerCase(),
      keeper,
    );
  }
});

const entry = (
  id: string,
  name: string,
  fields: Record<string, unknown> = {},
  visibility = 'all',
  type = 'character',
) =>
  deps.sqlite
    .prepare(
      `INSERT INTO entries (id, type_id, name, slug, fields, tags, visibility, created_by, view_mode)
       VALUES (?, ?, ?, ?, ?, '[]', ?, 'keeper-1', 'all')`,
    )
    .run(id, type, name, id, JSON.stringify(fields), visibility);

const treeWith = (...ids: string[]) => {
  const tree = deps.createFamilyTree({ name: `Boom ${ids.join('-')}` }, KEEPER);
  deps.saveFamilyTreeState(
    tree.id,
    { members: ids.map((id) => ({ id, updatedAt: 1 })) },
    KEEPER,
  );
  return tree.id;
};

describe('§67 de stamboom leidt broers en zussen af', () => {
  it('draws a derived line, with the verdict on it and no field behind it', () => {
    entry('s-pa', 'Pa');
    entry('s-ma', 'Ma');
    entry('s-een', 'Een', { ouders: [ref('s-pa', 'Pa'), ref('s-ma', 'Ma')] });
    entry('s-twee', 'Twee', { ouders: [ref('s-pa', 'Pa'), ref('s-ma', 'Ma')] });

    const id = treeWith('s-pa', 's-ma', 's-een', 's-twee');
    const graph = deps.buildFamilyGraph(deps.getFamilyTreeById(id, KEEPER)!, KEEPER);
    const lines = siblingEdges(graph);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({
      id: 'derived:sibling:s-een|s-twee',
      from: 'entry:s-een',
      to: 'entry:s-twee',
      role: 'sibling',
      label: 'Broer of zus',
      sibling: 'full',
      source: { kind: 'derived' },
    });
  });

  it('says half where each has a parent the other lacks', () => {
    entry('h-pa', 'Pa');
    entry('h-ma', 'Ma');
    entry('h-stief', 'Stiefma');
    entry('h-een', 'Een', { ouders: [ref('h-pa', 'Pa'), ref('h-ma', 'Ma')] });
    entry('h-twee', 'Twee', { ouders: [ref('h-pa', 'Pa'), ref('h-stief', 'Stiefma')] });

    const id = treeWith('h-pa', 'h-ma', 'h-stief', 'h-een', 'h-twee');
    const graph = deps.buildFamilyGraph(deps.getFamilyTreeById(id, KEEPER)!, KEEPER);
    expect(siblingEdges(graph).map((edge) => edge.sibling)).toEqual(['half']);
  });

  /*
   * The reason `primaryParentField` exists. Two creatures of one god share a
   * `geschapen_door` and nothing else, and they are not brother and sister.
   */
  it('never derives one from Geschapen door — a god’s creatures are not siblings', () => {
    entry('g-god', 'Het Holle Tij', {}, 'all', 'kosmische-goden');
    entry('g-een', 'Eerste schepsel', { geschapen_door: [ref('g-god', 'Het Holle Tij')] }, 'all', 'abnormality');
    entry('g-twee', 'Tweede schepsel', { geschapen_door: [ref('g-god', 'Het Holle Tij')] }, 'all', 'abnormality');

    const id = treeWith('g-god', 'g-een', 'g-twee');
    const graph = deps.buildFamilyGraph(deps.getFamilyTreeById(id, KEEPER)!, KEEPER);
    expect(siblingEdges(graph)).toEqual([]);
  });

  it('drops a typed link the parents already prove, and keeps the derived one', () => {
    entry('r-pa', 'Pa');
    entry('r-ma', 'Ma');
    entry('r-een', 'Een', {
      ouders: [ref('r-pa', 'Pa'), ref('r-ma', 'Ma')],
      broers_zussen: [ref('r-twee', 'Twee')],
    });
    entry('r-twee', 'Twee', {
      ouders: [ref('r-pa', 'Pa'), ref('r-ma', 'Ma')],
      broers_zussen: [ref('r-een', 'Een')],
    });

    const id = treeWith('r-pa', 'r-ma', 'r-een', 'r-twee');
    const graph = deps.buildFamilyGraph(deps.getFamilyTreeById(id, KEEPER)!, KEEPER);
    const lines = siblingEdges(graph);
    expect(lines).toHaveLength(1);
    expect(lines[0].source).toEqual({ kind: 'derived' });
    expect(lines[0].sibling).toBe('full');
  });

  it('keeps a typed link with nothing behind it, as an explicit line', () => {
    entry('t-een', 'Een', { broers_zussen: [ref('t-twee', 'Twee')] });
    entry('t-twee', 'Twee', { broers_zussen: [ref('t-een', 'Een')] });

    const id = treeWith('t-een', 't-twee');
    const graph = deps.buildFamilyGraph(deps.getFamilyTreeById(id, KEEPER)!, KEEPER);
    const lines = siblingEdges(graph);
    // One line, not two, however many pages said it.
    expect(lines).toHaveLength(1);
    expect(lines[0].sibling).toBe('explicit');
    expect(lines[0].source).toMatchObject({ kind: 'field', fieldKey: 'broers_zussen' });
    expect(lines[0].contested).toBeUndefined();
  });

  it('and marks one the recorded parents contradict', () => {
    entry('c-pa', 'Pa');
    entry('c-andere', 'Een heel andere vader');
    entry('c-een', 'Een', {
      ouders: [ref('c-pa', 'Pa')],
      broers_zussen: [ref('c-twee', 'Twee')],
    });
    entry('c-twee', 'Twee', { ouders: [ref('c-andere', 'Een heel andere vader')] });

    const id = treeWith('c-pa', 'c-andere', 'c-een', 'c-twee');
    const graph = deps.buildFamilyGraph(deps.getFamilyTreeById(id, KEEPER)!, KEEPER);
    const lines = siblingEdges(graph);
    expect(lines).toHaveLength(1);
    expect(lines[0].sibling).toBe('explicit');
    expect(lines[0].contested).toBe(true);
  });

  /* Rule 1: a parent this reader may not see is absent, and so is the verdict. */
  it('reads half for the Keeper and vol for a speler who cannot see the second parent', () => {
    entry('v-pa', 'Pa');
    entry('v-ma', 'Ma');
    entry('v-geheim', 'De ware moeder', {}, 'keeper');
    entry('v-een', 'Een', { ouders: [ref('v-pa', 'Pa'), ref('v-ma', 'Ma')] });
    entry('v-twee', 'Twee', { ouders: [ref('v-pa', 'Pa'), ref('v-geheim', 'De ware moeder')] });

    const id = treeWith('v-pa', 'v-ma', 'v-geheim', 'v-een', 'v-twee');
    const keeper = deps.buildFamilyGraph(deps.getFamilyTreeById(id, KEEPER)!, KEEPER);
    expect(siblingEdges(keeper).map((edge) => edge.sibling)).toEqual(['half']);

    const speler = deps.buildFamilyGraph(deps.getFamilyTreeById(id, SPELER)!, SPELER);
    // One shared parent, and the other side's second parent is not there at
    // all — so the honest answer on that screen is "onbekend", not "half".
    expect(siblingEdges(speler).map((edge) => edge.sibling)).toEqual(['unknown']);
  });

  it('makes no ghost of its own: a sibling only shows between two drawn cards', () => {
    entry('n-pa', 'Pa');
    entry('n-in', 'In de boom', { ouders: [ref('n-pa', 'Pa')] });
    entry('n-uit', 'Niet in de boom', { ouders: [ref('n-pa', 'Pa')] });

    // Only one child stands in the tree; the parent brings the other in as a
    // ghost through its own Kinderen — which nobody wrote — so it is absent.
    const id = treeWith('n-in');
    const graph = deps.buildFamilyGraph(deps.getFamilyTreeById(id, KEEPER)!, KEEPER);
    expect(graph.nodes.some((node) => node.id === 'entry:n-uit')).toBe(false);
    expect(siblingEdges(graph)).toEqual([]);
  });
});

describe('§67 siblingsOf', () => {
  it('finds a full sibling through the parents, without the mirror', () => {
    entry('o-pa', 'Pa Otte');
    entry('o-ma', 'Ma Otte');
    entry('o-een', 'Aagje Otte', { ouders: [ref('o-pa', 'Pa Otte'), ref('o-ma', 'Ma Otte')] });
    entry('o-twee', 'Bram Otte', { ouders: [ref('o-pa', 'Pa Otte'), ref('o-ma', 'Ma Otte')] });

    expect(deps.siblingsOf('o-een', KEEPER)).toEqual([
      { id: 'o-twee', name: 'Bram Otte', slug: 'o-twee', icon: expect.anything(), colour: expect.anything(), kind: 'full' },
    ]);
  });

  it('never lists the artikel itself', () => {
    expect(deps.siblingsOf('o-een', KEEPER).some((one) => one.id === 'o-een')).toBe(false);
  });

  it('finds one recorded only on the parent’s page, so it does not need the mirror', () => {
    entry('m-pa', 'Pa Meijer');
    entry('m-kind', 'Kees Meijer', { ouders: [ref('m-pa', 'Pa Meijer')] });
    entry('m-zus', 'Nel Meijer');
    // Written straight into the row, so no mirror ran: only the parent says it.
    deps.sqlite
      .prepare('UPDATE entries SET fields = ? WHERE id = ?')
      .run(JSON.stringify({ kinderen: [ref('m-kind', 'Kees Meijer'), ref('m-zus', 'Nel Meijer')] }), 'm-pa');

    expect(deps.siblingsOf('m-kind', KEEPER).map((one) => one.id)).toEqual(['m-zus']);
  });

  it('says onbekend where only one parent is recorded on both pages', () => {
    entry('u-ma', 'Ma Uil');
    entry('u-een', 'Aad Uil', { ouders: [ref('u-ma', 'Ma Uil')] });
    entry('u-twee', 'Bea Uil', { ouders: [ref('u-ma', 'Ma Uil')] });
    expect(deps.siblingsOf('u-een', KEEPER)).toMatchObject([{ id: 'u-twee', kind: 'unknown' }]);
  });

  it('leaves out a sibling this reader may not see, and every trace of them', () => {
    entry('p-pa', 'Pa Prins');
    entry('p-ma', 'Ma Prins');
    entry('p-een', 'Jan Prins', { ouders: [ref('p-pa', 'Pa Prins'), ref('p-ma', 'Ma Prins')] });
    entry('p-geheim', 'Het kind niemand kent', {
      ouders: [ref('p-pa', 'Pa Prins'), ref('p-ma', 'Ma Prins')],
    }, 'keeper');

    expect(deps.siblingsOf('p-een', KEEPER).map((one) => one.id)).toEqual(['p-geheim']);
    expect(deps.siblingsOf('p-een', SPELER)).toEqual([]);
  });

  it('is empty for an artikel with no parents recorded, and for one that is gone', () => {
    entry('l-alleen', 'Los persoon');
    expect(deps.siblingsOf('l-alleen', KEEPER)).toEqual([]);
    expect(deps.siblingsOf('bestaat-niet', KEEPER)).toEqual([]);
    expect(deps.siblingsOf('', KEEPER)).toEqual([]);
  });

  it('is empty for a soort that has no parent field at all', () => {
    entry('x-plek', 'De dijk', {}, 'all', 'location');
    expect(deps.siblingsOf('x-plek', KEEPER)).toEqual([]);
  });
});

/* ---------------------------------------------------- the mirror, sibling ↔ sibling */

describe('§67 de server spiegelt een broer', () => {
  it('writes the other page’s Broers en zussen, and unwrites it', () => {
    entry('w-een', 'Wim een');
    entry('w-twee', 'Wim twee');
    deps.updateEntry('w-een', { fields: { broers_zussen: [ref('w-twee', 'Wim twee')] } }, KEEPER);
    const read = (id: string) =>
      JSON.parse(
        (deps.sqlite.prepare('SELECT fields FROM entries WHERE id = ?').get(id) as { fields: string })
          .fields,
      ) as Record<string, unknown>;
    expect((read('w-twee').broers_zussen as { id: string }[]).map((one) => one.id)).toEqual(['w-een']);

    deps.updateEntry('w-een', { fields: { broers_zussen: [] } }, KEEPER);
    expect(read('w-twee').broers_zussen).toEqual([]);
  });
});
