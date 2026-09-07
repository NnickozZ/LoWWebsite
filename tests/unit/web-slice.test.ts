import { describe, expect, it } from 'vitest';
import { clampDepth, degrees, filterGraph, focusSlice } from '@/lib/web/slice';
import type { WebEdge, WebGraph, WebNode } from '@/lib/web/types';

/**
 * §43: cutting a focus graph out of the whole web — pure, so the server and
 * the browser cannot disagree about what depth 2 means.
 *
 * The fixture is a small archive drawn by hand:
 *
 *   case:c ──filed──▶ entry:a ──mention──▶ entry:b ──mention──▶ entry:d
 *                        ▲                    │
 *   entry:x ──mention────┘                    └──field──▶ entry:e
 *   board:w ──board──▶ entry:a      entry:a ◀──thread(via w)──▶ entry:b
 *   board:w ──board──▶ note:n       note:n ──thread(via w)──▶ entry:a
 */

const node = (id: string, over: Partial<WebNode> = {}): WebNode => {
  const colon = id.indexOf(':');
  return { id, kind: id.slice(0, colon) as WebNode['kind'], refId: id.slice(colon + 1), name: id, href: '/', degree: 0, ...over };
};
const edge = (kind: WebEdge['kind'], from: string, to: string, over: Partial<WebEdge> = {}): WebEdge => ({
  id: `${kind}:${from}>${to}`,
  kind,
  from,
  to,
  detail: '',
  ...over,
});

const graph: WebGraph = {
  nodes: ['case:c', 'entry:a', 'entry:b', 'entry:d', 'entry:e', 'entry:x', 'board:w', 'note:n'].map((id) => node(id)),
  edges: [
    edge('filed', 'case:c', 'entry:a'),
    edge('mention', 'entry:a', 'entry:b'),
    edge('mention', 'entry:b', 'entry:d'),
    edge('field', 'entry:b', 'entry:e', { detail: 'Houder' }),
    edge('mention', 'entry:x', 'entry:a'),
    edge('board', 'board:w', 'entry:a'),
    edge('thread', 'entry:a', 'entry:b', { via: 'board:w', detail: 'zag' }),
    edge('board', 'board:w', 'note:n'),
    edge('thread', 'note:n', 'entry:a', { via: 'board:w' }),
  ],
};

const ids = (g: WebGraph) => g.nodes.map((n) => n.id).sort();
const sideOf = (g: WebGraph, id: string) => g.nodes.find((n) => n.id === id)?.side;
const depthOf = (g: WebGraph, id: string) => g.nodes.find((n) => n.id === id)?.depth;

describe('clampDepth', () => {
  it('keeps the depth between 1 and 4, and reads strings', () => {
    expect(clampDepth('2')).toBe(2);
    expect(clampDepth(0)).toBe(1);
    expect(clampDepth(9)).toBe(4);
    expect(clampDepth('nonsens')).toBe(1);
    expect(clampDepth(null)).toBe(1);
    expect(clampDepth(2.4)).toBe(2);
  });
});

describe('focusSlice', () => {
  it('depth 1 is the focus and its neighbours; depth 2 walks one further', () => {
    const one = focusSlice(graph, 'entry:a', 1);
    expect(one.focus).toBe('entry:a');
    expect(one.depth).toBe(1);
    expect(ids(one)).toEqual(['board:w', 'case:c', 'entry:a', 'entry:b', 'entry:x']);
    expect(depthOf(one, 'entry:a')).toBe(0);
    expect(depthOf(one, 'entry:b')).toBe(1);

    const two = focusSlice(graph, 'entry:a', 2);
    expect(ids(two)).toEqual(['board:w', 'case:c', 'entry:a', 'entry:b', 'entry:d', 'entry:e', 'entry:x']);
    expect(depthOf(two, 'entry:d')).toBe(2);
    // Every edge between two included nodes is kept — the triangle stays.
    expect(two.edges.map((e) => e.id).sort()).toEqual(
      graph.edges
        .filter((e) => !e.from.startsWith('note') && !e.to.startsWith('note'))
        .map((e) => e.id)
        .sort(),
    );
  });

  it('side: what points at the focus is in, what it points at is out, and a deeper node inherits', () => {
    const two = focusSlice(graph, 'entry:a', 2);
    expect(sideOf(two, 'entry:a')).toBeUndefined();
    expect(sideOf(two, 'case:c')).toBe('in');
    expect(sideOf(two, 'entry:x')).toBe('in');
    expect(sideOf(two, 'board:w')).toBe('in');
    expect(sideOf(two, 'entry:b')).toBe('out');
    expect(sideOf(two, 'entry:d')).toBe('out');
    expect(sideOf(two, 'entry:e')).toBe('out');
  });

  it('a tie between in and out at the same depth lands on out', () => {
    // b is reached from a by a mention a→b (out) and by a thread; from b's
    // point of view a is both what it points at (thread, always out) and
    // what points at it (mention a→b: in). Out wins.
    const fromB = focusSlice(graph, 'entry:b', 1);
    expect(sideOf(fromB, 'entry:a')).toBe('out');

    // A plain tie: y is pointed at by the focus and points at it too.
    const tie: WebGraph = {
      nodes: [node('entry:f'), node('entry:y')],
      edges: [edge('mention', 'entry:f', 'entry:y'), edge('field', 'entry:y', 'entry:f')],
    };
    expect(sideOf(focusSlice(tie, 'entry:f', 1), 'entry:y')).toBe('out');
  });

  it('a thread is drawn on the right whichever way it was stored', () => {
    const fromA = focusSlice(graph, 'entry:a', 1, { showNotes: true });
    expect(sideOf(fromA, 'note:n')).toBe('out');
  });

  it('a limit truncates and says so', () => {
    const cut = focusSlice(graph, 'entry:a', 2, { limit: 3 });
    expect(cut.truncated).toBe(true);
    expect(cut.nodes).toHaveLength(3);
    expect(cut.nodes[0].id).toBe('entry:a');
    // Under the limit nothing is said about truncation at all.
    expect(focusSlice(graph, 'entry:a', 2).truncated).toBeUndefined();
  });

  it('hidden kinds drop the edges and the nodes reachable only through them', () => {
    const noCase = focusSlice(graph, 'entry:a', 2, { hiddenKinds: new Set(['filed']) });
    expect(ids(noCase)).not.toContain('case:c');
    expect(noCase.edges.some((e) => e.kind === 'filed')).toBe(false);

    // b is reachable by a mention *and* a thread: hiding the mention keeps b
    // (via the thread) but the mention edge itself is gone, and so is what
    // only the next mention reached.
    const noMention = focusSlice(graph, 'entry:a', 2, { hiddenKinds: new Set(['mention']) });
    expect(ids(noMention)).toContain('entry:b');
    expect(ids(noMention)).not.toContain('entry:d');
    expect(ids(noMention)).toContain('entry:e');
    expect(noMention.edges.some((e) => e.kind === 'mention')).toBe(false);
  });

  it('notes are out unless asked for, edges and all', () => {
    const plain = focusSlice(graph, 'board:w', 1);
    expect(ids(plain)).toEqual(['board:w', 'entry:a']);
    expect(plain.edges.some((e) => e.to === 'note:n')).toBe(false);

    const withNotes = focusSlice(graph, 'board:w', 1, { showNotes: true });
    expect(ids(withNotes)).toEqual(['board:w', 'entry:a', 'note:n']);
  });

  it('an unknown focus is an empty graph', () => {
    const none = focusSlice(graph, 'entry:nooit', 2);
    expect(none.nodes).toEqual([]);
    expect(none.edges).toEqual([]);
    expect(none.focus).toBe('entry:nooit');
  });
});

describe('filterGraph', () => {
  it('drops notes and their edges by default, keeps them when asked', () => {
    const plain = filterGraph(graph);
    expect(plain.nodes.some((n) => n.kind === 'note')).toBe(false);
    expect(plain.edges.some((e) => e.from === 'note:n' || e.to === 'note:n')).toBe(false);
    expect(plain.edges).toHaveLength(7);

    const withNotes = filterGraph(graph, { showNotes: true });
    expect(withNotes.nodes).toHaveLength(8);
    expect(withNotes.edges).toHaveLength(9);
  });

  it('applies the legend', () => {
    const filtered = filterGraph(graph, { hiddenKinds: new Set(['mention', 'thread']) });
    expect(filtered.edges.map((e) => e.kind).sort()).toEqual(['board', 'field', 'filed']);
    // The global view keeps every node; only the lines go.
    expect(filtered.nodes).toHaveLength(7);
  });
});

describe('degrees', () => {
  it('counts every edge touching a node, in either direction', () => {
    const d = degrees(graph);
    expect(d.get('entry:a')).toBe(6);
    expect(d.get('entry:b')).toBe(4);
    expect(d.get('case:c')).toBe(1);
    expect(d.get('entry:e')).toBe(1);
    expect(d.get('entry:nooit')).toBeUndefined();
  });
});
