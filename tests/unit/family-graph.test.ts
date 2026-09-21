import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import type { EntryGraphNode, FamilyGraph } from '@/lib/families/types';

/**
 * §66 — the drawing, built per viewer.
 *
 * `buildFamilyGraph` is where rule 1 is spelled in full: **an artikel this
 * reader may not see is absent, never MISSING.** "X has a parent you may not
 * see" is itself a secret, so the Keeper's tree and a player's tree of the same
 * row are two different drawings — and the difference is a whole person and
 * every line to them, not a stamp.
 *
 * The rest of the file pins the four things the canvas cannot work out for
 * itself: who is a ghost, what frame a soort wears, which line is which after
 * the mirror has written both halves, and what happens to a tie whose end went
 * away.
 */

const dir = mkdtempSync(join(tmpdir(), 'zcf-family-graph-'));
process.env.DATA_DIR = dir;

type Deps = {
  sqlite: typeof import('@/lib/db').sqlite;
  buildFamilyGraph: typeof import('@/lib/families/graph').buildFamilyGraph;
  createFamilyTree: typeof import('@/lib/families/service').createFamilyTree;
  getFamilyTreeById: typeof import('@/lib/families/service').getFamilyTreeById;
  saveFamilyTreeState: typeof import('@/lib/families/service').saveFamilyTreeState;
  writeRelation: typeof import('@/lib/families/service').writeRelation;
};
let deps: Deps;

const KEEPER = { id: 'keeper-1', isKeeper: true } as const;
const BRAM = { id: 'bram', isKeeper: false } as const;

let treeId = '';

const nodeIds = (graph: FamilyGraph) => graph.nodes.map((node) => node.id).sort();
const nodeOf = (graph: FamilyGraph, id: string) => graph.nodes.find((node) => node.id === id);
const graphFor = (viewer: typeof KEEPER | typeof BRAM) =>
  deps.buildFamilyGraph(deps.getFamilyTreeById(treeId, viewer)!, viewer);

beforeAll(async () => {
  const dbModule = await import('@/lib/db');
  const graph = await import('@/lib/families/graph');
  const families = await import('@/lib/families/service');
  deps = {
    sqlite: dbModule.sqlite,
    buildFamilyGraph: graph.buildFamilyGraph,
    createFamilyTree: families.createFamilyTree,
    getFamilyTreeById: families.getFamilyTreeById,
    saveFamilyTreeState: families.saveFamilyTreeState,
    writeRelation: families.writeRelation,
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

  const entry = (id: string, name: string, type: string, fields: Record<string, unknown> = {}, visibility = 'all') =>
    run(
      `INSERT INTO entries (id, type_id, name, slug, fields, tags, visibility, created_by, view_mode)
       VALUES (?, ?, ?, ?, ?, '[]', ?, 'keeper-1', 'all')`,
      id,
      type,
      name,
      id,
      JSON.stringify(fields),
      visibility,
    );

  // The house, which colours the frame and names the branch.
  entry('e-huis', 'Boone', 'family');
  const house = { id: 'e-huis', name: 'Boone', slug: 'e-huis' };

  entry('e-pier', 'Pier Boone', 'character', { familie: house, status: 'vermist' });
  entry('e-kind', 'Jacob Boone', 'character', { familie: house });
  // A ghost: related to a member, not in the tree.
  entry('e-zus', 'Neeltje Boone', 'character', {});
  // A ghost the table may not see at all.
  entry('e-geheim', 'De ware vader', 'character', {}, 'keeper');
  // Somebody with a frame of their own.
  entry('e-god', 'Iets onder het water', 'kosmische-goden');
  entry('e-plek', 'De dijk', 'location');
});

describe('leden, spoken en de vier frames', () => {
  it('a member is drawn with its soort, its house and its frame', () => {
    const tree = deps.createFamilyTree({ name: 'Het huis Boone' }, KEEPER);
    treeId = tree.id;
    deps.saveFamilyTreeState(
      treeId,
      {
        members: [
          { id: 'e-pier', x: 100, y: 200, pinned: true, updatedAt: 1 },
          { id: 'e-kind', updatedAt: 1 },
          { id: 'e-god', updatedAt: 1 },
          { id: 'e-plek', updatedAt: 1 },
        ],
      },
      KEEPER,
    );

    const graph = graphFor(KEEPER);
    const pier = nodeOf(graph, 'entry:e-pier') as EntryGraphNode;
    expect(pier.standing).toBe('member');
    expect(pier.frame).toBe('mortal');
    expect(pier.house).toEqual({ id: 'e-huis', name: 'Boone', colour: expect.any(String) });
    expect(pier.status).toBe('vermist');
    expect(pier).toMatchObject({ x: 100, y: 200, pinned: true });
    expect(pier.typeSlug).toBe('character');

    // The frame follows the soort, and a soort nobody thought of is a mortal.
    expect((nodeOf(graph, 'entry:e-god') as EntryGraphNode).frame).toBe('divine');
    expect((nodeOf(graph, 'entry:e-plek') as EntryGraphNode).frame).toBe('mortal');
    // §66: `roleFields` says which handle a card may offer.
    expect(graph.roleFields['e-pier'].map((field) => field.key)).toEqual([
      'ouders',
      'kinderen',
      'partner',
      // §67: en het getypte broer-of-zusveld, voor als de ouders niet bekend zijn.
      'broers_zussen',
    ]);
    expect(graph.roleFields['e-plek']).toEqual([]);
  });

  it('somebody a member points at but who is not in the tree is a ghost', () => {
    deps.writeRelation('e-pier', 'kinderen', 'e-zus', true, KEEPER);
    const graph = graphFor(KEEPER);
    const ghost = nodeOf(graph, 'entry:e-zus') as EntryGraphNode;
    expect(ghost.standing).toBe('ghost');
    // A ghost has no place of its own — the layout puts it at the edge.
    expect(ghost.x).toBeUndefined();
  });
});

describe('rule 1: wat je niet mag zien, is er niet', () => {
  it('a hidden parent is absent for a player and present for the Keeper', () => {
    deps.writeRelation('e-kind', 'ouders', 'e-geheim', true, KEEPER);

    const keeper = graphFor(KEEPER);
    expect(nodeIds(keeper)).toContain('entry:e-geheim');
    expect(keeper.edges.some((edge) => edge.from === 'entry:e-geheim' && edge.to === 'entry:e-kind')).toBe(true);

    const player = graphFor(BRAM);
    expect(nodeIds(player)).not.toContain('entry:e-geheim');
    // And no line either: a line to nobody is a sentence about a secret.
    expect(player.edges.some((edge) => edge.from === 'entry:e-geheim' || edge.to === 'entry:e-geheim')).toBe(false);
  });

  it('a member the reader may not see leaves the tree, not a stamp', () => {
    deps.saveFamilyTreeState(treeId, { members: [{ id: 'e-geheim', updatedAt: 2 }] }, KEEPER);
    expect(nodeIds(graphFor(KEEPER))).toContain('entry:e-geheim');
    const player = graphFor(BRAM);
    expect(nodeIds(player)).not.toContain('entry:e-geheim');
    expect(player.nodes.every((node) => node.name !== 'De ware vader')).toBe(true);
  });
});

describe('lijnen', () => {
  it('the mirror writes both halves and the graph draws one line', () => {
    // "Kinderen: Jacob" on Pier is "Ouders: Pier" on Jacob — one line, whichever
    // page said it, and it runs parent → child.
    deps.writeRelation('e-pier', 'kinderen', 'e-kind', true, KEEPER);
    const graph = graphFor(KEEPER);
    const between = graph.edges.filter(
      (edge) =>
        (edge.from === 'entry:e-pier' && edge.to === 'entry:e-kind') ||
        (edge.from === 'entry:e-kind' && edge.to === 'entry:e-pier'),
    );
    expect(between).toHaveLength(1);
    expect(between[0].role).toBe('parent');
    expect(between[0].from).toBe('entry:e-pier');
    expect(between[0].source.kind).toBe('field');
  });

  it('a partner line from either side is one line', () => {
    deps.saveFamilyTreeState(treeId, { members: [{ id: 'e-zus', updatedAt: 3 }] }, KEEPER);
    deps.writeRelation('e-pier', 'partner', 'e-zus', true, KEEPER);
    const graph = graphFor(KEEPER);
    const partners = graph.edges.filter((edge) => edge.role === 'partner');
    expect(partners).toHaveLength(1);
  });

  it('a los kaartje is a node, and the tie that holds it is an edge', () => {
    deps.saveFamilyTreeState(
      treeId,
      {
        loose: [{ id: 'l-oma', name: 'De oma van Pier', text: 'Alleen bij naam bekend.', frame: 'unknown', x: 5, y: 6, updatedAt: 4 }],
        ties: [
          {
            id: 't-oma',
            from: { kind: 'loose', id: 'l-oma' },
            to: { kind: 'entry', id: 'e-pier' },
            role: 'parent',
            label: 'Moeder van',
            updatedAt: 4,
          },
          // …and one whose artikel end is not a member of this tree.
          {
            id: 't-nergens',
            from: { kind: 'loose', id: 'l-oma' },
            to: { kind: 'entry', id: 'e-huis' },
            role: 'kin',
            updatedAt: 4,
          },
          // …and one pointing at an artikel that does not exist at all.
          {
            id: 't-niemand',
            from: { kind: 'loose', id: 'l-oma' },
            to: { kind: 'entry', id: 'e-bestaat-niet' },
            role: 'kin',
            updatedAt: 4,
          },
        ],
      },
      KEEPER,
    );
    const graph = graphFor(KEEPER);
    const card = nodeOf(graph, 'loose:l-oma');
    expect(card).toMatchObject({ kind: 'loose', name: 'De oma van Pier', frame: 'unknown', x: 5, y: 6 });

    const tie = graph.edges.find((edge) => edge.id === 'tie:t-oma');
    expect(tie).toMatchObject({ from: 'loose:l-oma', to: 'entry:e-pier', role: 'parent', label: 'Moeder van' });
    // A line to an artikel nobody has heard of has nowhere to land.
    expect(graph.edges.some((edge) => edge.id === 'tie:t-niemand')).toBe(false);
  });

  /*
   * §66: an artikel a *tie* names is a ghost, exactly as one a field names is.
   *
   * Before this it was dropped in silence — the artikel was not a member, so
   * the line had nowhere to land and simply was not drawn, which reads as a los
   * kaartje that has lost its line for no reason anybody can see. A ghost is
   * the honest answer: the person is on the glass, faint, with a `+`, and the
   * line runs to them.
   */
  it('an artikel a tie names but that is not a member is drawn as a ghost', () => {
    const graph = graphFor(KEEPER);
    const ghost = nodeOf(graph, 'entry:e-huis') as EntryGraphNode | undefined;
    expect(ghost).toBeDefined();
    expect(ghost?.standing).toBe('ghost');
    // It keeps its own soort's frame — a Familie-artikel is a banner, faint.
    expect(ghost?.frame).toBe('house');
    expect(graph.edges.some((edge) => edge.id === 'tie:t-nergens')).toBe(true);
    expect(graph.edges.find((edge) => edge.id === 'tie:t-nergens')).toMatchObject({
      from: 'loose:l-oma',
      to: 'entry:e-huis',
      role: 'kin',
    });
  });

  it('a tie whose artikel end this reader may not see goes with them', () => {
    deps.saveFamilyTreeState(
      treeId,
      {
        ties: [
          {
            id: 't-geheim',
            from: { kind: 'loose', id: 'l-oma' },
            to: { kind: 'entry', id: 'e-geheim' },
            role: 'kin',
            updatedAt: 5,
          },
        ],
      },
      KEEPER,
    );
    expect(graphFor(KEEPER).edges.some((edge) => edge.id === 'tie:t-geheim')).toBe(true);
    expect(graphFor(BRAM).edges.some((edge) => edge.id === 'tie:t-geheim')).toBe(false);
  });
});
