import { describe, expect, it } from 'vitest';
import { graphFingerprint, lineZoom, zoomBucket } from '@/components/web/WebCanvas';
import { COLUMN_NODE_W, COLUMN_GAP_X, DEFAULT_COLUMN_LIMIT, columnLayout, foldId } from '@/lib/web/layout';
import { focusSlice } from '@/lib/web/slice';
import type { WebGraph, WebNode } from '@/lib/web/types';

/** A star: `left` nodes point at the focus, the focus points at `right` nodes. */
function star(left: number, right: number, deeper = 0): WebGraph {
  const nodes: WebNode[] = [{ id: 'entry:f', kind: 'entry', refId: 'f', name: 'Focus', href: '', degree: left + right }];
  const edges: WebGraph['edges'] = [];
  for (let i = 0; i < left; i++) {
    nodes.push({ id: `entry:l${i}`, kind: 'entry', refId: `l${i}`, name: `L${i}`, href: '', degree: 1 });
    edges.push({ id: `l${i}`, from: `entry:l${i}`, to: 'entry:f', kind: 'mention', detail: '' });
  }
  for (let i = 0; i < right; i++) {
    nodes.push({ id: `entry:r${i}`, kind: 'entry', refId: `r${i}`, name: `R${i}`, href: '', degree: 1 });
    edges.push({ id: `r${i}`, from: 'entry:f', to: `entry:r${i}`, kind: 'field', detail: 'Veld' });
    for (let j = 0; j < deeper; j++) {
      nodes.push({ id: `entry:r${i}d${j}`, kind: 'entry', refId: `r${i}d${j}`, name: `R${i}D${j}`, href: '', degree: 1 });
      edges.push({ id: `r${i}d${j}`, from: `entry:r${i}`, to: `entry:r${i}d${j}`, kind: 'mention', detail: '' });
    }
  }
  return { nodes, edges };
}

describe('columnLayout', () => {
  it('puts the focus in column 0, what points at it left, what it points at right', () => {
    const graph = focusSlice(star(3, 4), 'entry:f', 1);
    const layout = columnLayout(graph);
    const byId = new Map(layout.nodes.map((n) => [n.id, n]));
    expect(byId.get('entry:f')?.column).toBe(0);
    expect(byId.get('entry:f')?.x).toBe(0);
    for (let i = 0; i < 3; i++) expect(byId.get(`entry:l${i}`)?.column).toBe(-1);
    for (let i = 0; i < 4; i++) expect(byId.get(`entry:r${i}`)?.column).toBe(1);
    // Left of the focus is negative x; right is positive.
    expect(byId.get('entry:l0')!.x).toBeLessThan(0);
    expect(byId.get('entry:r0')!.x).toBeGreaterThan(0);
    expect(layout.folds).toEqual([]);
  });

  it('stacks a column without overlap and centres it on the focus', () => {
    const graph = focusSlice(star(0, 5), 'entry:f', 1);
    const layout = columnLayout(graph);
    const right = layout.nodes.filter((n) => n.column === 1).sort((a, b) => a.y - b.y);
    for (let i = 1; i < right.length; i++) {
      expect(right[i].y - right[i - 1].y).toBeGreaterThanOrEqual(right[i].height);
    }
    const mid = (right[0].y + right[right.length - 1].y) / 2;
    expect(Math.abs(mid)).toBeLessThan(1);
    expect(right.every((n) => n.x === right[0].x)).toBe(true);
    expect(right[0].x).toBeCloseTo(COLUMN_NODE_W + COLUMN_GAP_X + (240 - COLUMN_NODE_W) / 2, 5);
  });

  it('gives depth 2 a second column further out', () => {
    const graph = focusSlice(star(0, 2, 2), 'entry:f', 2);
    const layout = columnLayout(graph);
    const byId = new Map(layout.nodes.map((n) => [n.id, n]));
    expect(byId.get('entry:r0d0')?.column).toBe(2);
    expect(byId.get('entry:r0d0')!.x).toBeGreaterThan(byId.get('entry:r0')!.x);
  });

  it('folds a column past the limit into one row, keeping the best-connected', () => {
    const graph = focusSlice(star(0, DEFAULT_COLUMN_LIMIT + 10), 'entry:f', 1);
    // Make r0 a hub so it must survive the fold.
    graph.nodes.find((n) => n.id === 'entry:r0')!.degree = 99;
    const layout = columnLayout(graph);
    const right = layout.nodes.filter((n) => n.column === 1);
    expect(right.length).toBe(DEFAULT_COLUMN_LIMIT - 1);
    expect(right.some((n) => n.id === 'entry:r0')).toBe(true);
    expect(layout.folds).toHaveLength(1);
    const fold = layout.folds[0];
    expect(fold.id).toBe(foldId(1));
    expect(fold.count).toBe(11);
    expect(fold.hidden).toHaveLength(11);
    // The fold is the last row of its column.
    expect(fold.y).toBeGreaterThan(Math.max(...right.map((n) => n.y)));
    // Edges into hidden nodes are redirected to the fold.
    for (const hidden of fold.hidden) {
      const edge = graph.edges.find((e) => e.to === hidden)!;
      expect(layout.edgeToFold.get(edge.id)).toEqual({ to: fold.id });
    }
  });

  it('unfolds a column the page has expanded', () => {
    const graph = focusSlice(star(0, DEFAULT_COLUMN_LIMIT + 10), 'entry:f', 1);
    const layout = columnLayout(graph, { expanded: new Set([1]) });
    expect(layout.folds).toEqual([]);
    expect(layout.nodes.filter((n) => n.column === 1)).toHaveLength(DEFAULT_COLUMN_LIMIT + 10);
  });

  it('orders a column by where its neighbours sit, so the lines cross less', () => {
    // Two right-hand nodes, each with two children; the children of the
    // lower one should end up below the children of the upper one.
    const graph = focusSlice(star(0, 2, 2), 'entry:f', 2);
    const layout = columnLayout(graph);
    const byId = new Map(layout.nodes.map((n) => [n.id, n]));
    const [upper, lower] = ['entry:r0', 'entry:r1'].sort((a, b) => byId.get(a)!.y - byId.get(b)!.y);
    const upperKids = [`${upper}d0`, `${upper}d1`].map((id) => byId.get(id)!.y);
    const lowerKids = [`${lower}d0`, `${lower}d1`].map((id) => byId.get(id)!.y);
    expect(Math.max(...upperKids)).toBeLessThan(Math.min(...lowerKids));
  });

  it('is empty without a focus', () => {
    expect(columnLayout(star(2, 2)).nodes).toEqual([]);
  });
});

describe('the drawing\'s layout key (round 19)', () => {
  it('changes when an edge changes and the node ids do not', () => {
    const a = focusSlice(star(1, 1), 'entry:f', 1);
    const b = structuredClone(a);
    b.edges[0] = { ...b.edges[0], kind: 'field' };
    expect(graphFingerprint(a)).not.toBe(graphFingerprint(b));
    // Dropping an edge (a legend tick) is a change too, even with every node still there.
    const c = structuredClone(a);
    c.edges.pop();
    expect(graphFingerprint(c)).not.toBe(graphFingerprint(a));
  });

  it('changes when a node moves to another step or side', () => {
    const a = focusSlice(star(1, 1), 'entry:f', 1);
    const b = structuredClone(a);
    const moved = b.nodes.find((n) => n.id === 'entry:l0')!;
    moved.side = 'out';
    expect(graphFingerprint(a)).not.toBe(graphFingerprint(b));
    const c = structuredClone(a);
    c.nodes.find((n) => n.id === 'entry:l0')!.depth = 2;
    expect(graphFingerprint(a)).not.toBe(graphFingerprint(c));
  });

  it('is the same for the same graph built twice, and keeps the ids readable', () => {
    const a = focusSlice(star(2, 3), 'entry:f', 1);
    const b = focusSlice(star(2, 3), 'entry:f', 1);
    expect(graphFingerprint(a)).toBe(graphFingerprint(b));
    expect(graphFingerprint(a)).toContain('entry:f@0');
  });
});

describe('zooming past 4 (round 19)', () => {
  it('lets a line grow as √zoom up to 4 and not at all beyond', () => {
    // On-screen width = nominal × zoom / lineZoom(zoom).
    const onScreen = (zoom: number) => zoom / lineZoom(zoom);
    expect(onScreen(1)).toBeCloseTo(1, 6);
    expect(onScreen(4)).toBeCloseTo(2, 6);
    expect(onScreen(12)).toBeCloseTo(2, 6);
    // Continuous at the cap.
    expect(lineZoom(4 - 1e-9)).toBeCloseTo(lineZoom(4 + 1e-9), 6);
  });

  it('picks a sprite bucket that is at least the screen\'s texels per world pixel, capped at 8', () => {
    // SPRITE_SCALE is 2: zoom 1 on a retina screen is bucket 1, as before.
    expect(zoomBucket(1, 2)).toBe(1);
    expect(zoomBucket(0.4, 2)).toBe(1);
    expect(zoomBucket(1.5, 2)).toBe(2);
    expect(zoomBucket(4, 2)).toBe(4);
    expect(zoomBucket(4, 1)).toBe(2);
    expect(zoomBucket(12, 2)).toBe(8);
    expect(zoomBucket(100, 2)).toBe(8);
  });
});
