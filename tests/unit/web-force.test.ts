import { describe, expect, it } from 'vitest';
import { ForceSim, radiusFor } from '@/lib/web/force';
import type { WebGraph, WebNode } from '@/lib/web/types';

function chain(n: number): WebGraph {
  const nodes: WebNode[] = [];
  const edges: WebGraph['edges'] = [];
  for (let i = 0; i < n; i++) nodes.push({ id: `entry:${i}`, kind: 'entry', refId: `${i}`, name: `${i}`, href: '', degree: 2 });
  for (let i = 1; i < n; i++) edges.push({ id: `e${i}`, from: `entry:${i - 1}`, to: `entry:${i}`, kind: 'mention', detail: '' });
  return { nodes, edges };
}

function clusters(count: number, size: number): WebGraph {
  const nodes: WebNode[] = [];
  const edges: WebGraph['edges'] = [];
  for (let c = 0; c < count; c++) {
    for (let i = 0; i < size; i++) {
      nodes.push({ id: `entry:${c}-${i}`, kind: 'entry', refId: `${c}-${i}`, name: '', href: '', degree: 3 });
      if (i > 0) edges.push({ id: `e${c}-${i}`, from: `entry:${c}-0`, to: `entry:${c}-${i}`, kind: 'mention', detail: '' });
      if (i > 1) edges.push({ id: `f${c}-${i}`, from: `entry:${c}-${i - 1}`, to: `entry:${c}-${i}`, kind: 'mention', detail: '' });
    }
  }
  return { nodes, edges };
}

describe('ForceSim', () => {
  it('is deterministic: the same graph lays out the same way twice', () => {
    const a = new ForceSim();
    const b = new ForceSim();
    a.setGraph(chain(30), (_id, d) => radiusFor(d));
    b.setGraph(chain(30), (_id, d) => radiusFor(d));
    a.settle();
    b.settle();
    expect(a.nodes.map((n) => [n.x, n.y])).toEqual(b.nodes.map((n) => [n.x, n.y]));
  });

  it('cools down and stops', () => {
    const sim = new ForceSim();
    sim.setGraph(chain(20), (_id, d) => radiusFor(d));
    let ticks = 0;
    while (sim.tick() && ticks < 2000) ticks += 1;
    expect(sim.settled).toBe(true);
    expect(ticks).toBeLessThan(600);
    expect(sim.tick()).toBe(false);
  });

  it('pulls linked nodes together and keeps unlinked ones apart', () => {
    const sim = new ForceSim();
    sim.setGraph(clusters(3, 8), (_id, d) => radiusFor(d));
    sim.settle();
    const at = (id: string) => sim.get(id)!;
    const d = (a: string, b: string) => Math.hypot(at(a).x - at(b).x, at(a).y - at(b).y);
    // Inside a cluster: close. Between clusters: further apart than any link.
    const inside = d('entry:0-0', 'entry:0-3');
    const across = d('entry:0-0', 'entry:1-0');
    expect(inside).toBeLessThan(across);
    // Nothing overlaps.
    for (const a of sim.nodes) {
      for (const b of sim.nodes) {
        if (a === b) continue;
        expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThan((a.r + b.r) * 0.9);
      }
    }
  });

  it('keeps a node where it was when the graph changes, and warms up for newcomers', () => {
    const sim = new ForceSim();
    sim.setGraph(chain(10), (_id, d) => radiusFor(d));
    sim.settle();
    const before = { ...sim.get('entry:3')! };
    const bigger = chain(12);
    sim.setGraph(bigger, (_id, d) => radiusFor(d));
    expect(sim.get('entry:3')!.x).toBe(before.x);
    expect(sim.get('entry:3')!.y).toBe(before.y);
    expect(sim.alpha).toBe(1);
    // A newcomer is placed beside a neighbour that already had a place.
    const fresh = sim.get('entry:10')!;
    const neighbour = sim.get('entry:9')!;
    expect(Math.hypot(fresh.x - neighbour.x, fresh.y - neighbour.y)).toBeLessThan(120);
  });

  it('does not move a node a hand is holding', () => {
    const sim = new ForceSim();
    sim.setGraph(chain(6), (_id, d) => radiusFor(d));
    const held = sim.get('entry:2')!;
    held.fixed = true;
    held.x = 500;
    held.y = -500;
    sim.settle();
    expect(held.x).toBe(500);
    expect(held.y).toBe(-500);
  });

  it('keeps a pinned knot where it was put, and lets it go on unpinAll', () => {
    const sim = new ForceSim();
    sim.setGraph(chain(6), (_id, d) => radiusFor(d));
    const pinned = sim.get('entry:2')!;
    pinned.pinned = true;
    pinned.x = 400;
    pinned.y = 300;
    sim.settle();
    expect(pinned.x).toBe(400);
    expect(pinned.y).toBe(300);
    expect(sim.pinnedCount).toBe(1);
    expect(sim.unpinAll()).toBe(1);
    expect(sim.settled).toBe(false);
    sim.settle();
    expect(pinned.x === 400 && pinned.y === 300).toBe(false);
    expect(sim.unpinAll()).toBe(0);
  });

  it('does not let a hub swallow its neighbours: every pair stays a label apart', () => {
    // One knot tied to forty others — the shape that used to collapse.
    const nodes: WebNode[] = [{ id: 'entry:hub', kind: 'entry', refId: 'hub', name: '', href: '', degree: 40 }];
    const edges: WebGraph['edges'] = [];
    for (let i = 0; i < 40; i++) {
      nodes.push({ id: `entry:${i}`, kind: 'entry', refId: `${i}`, name: '', href: '', degree: 1 });
      edges.push({ id: `e${i}`, from: 'entry:hub', to: `entry:${i}`, kind: 'mention', detail: '' });
    }
    const sim = new ForceSim();
    sim.setGraph({ nodes, edges }, (_id, d) => radiusFor(d));
    sim.settle();
    for (const a of sim.nodes) {
      for (const b of sim.nodes) {
        if (a === b) continue;
        const min = a.r + a.pad + b.r + b.pad;
        expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThan(min * 0.9);
      }
    }
  });

  it('lays a focus web out in rings: depth one on a circle, depth two on a wider one', () => {
    const nodes: WebNode[] = [{ id: 'entry:f', kind: 'entry', refId: 'f', name: '', href: '', degree: 6, depth: 0 }];
    const edges: WebGraph['edges'] = [];
    for (let i = 0; i < 6; i++) {
      nodes.push({ id: `entry:a${i}`, kind: 'entry', refId: `a${i}`, name: '', href: '', degree: 4, depth: 1 });
      edges.push({ id: `e${i}`, from: 'entry:f', to: `entry:a${i}`, kind: 'mention', detail: '' });
      for (let j = 0; j < 3; j++) {
        nodes.push({ id: `entry:b${i}-${j}`, kind: 'entry', refId: `b${i}-${j}`, name: '', href: '', degree: 1, depth: 2 });
        edges.push({ id: `e${i}-${j}`, from: `entry:a${i}`, to: `entry:b${i}-${j}`, kind: 'mention', detail: '' });
      }
    }
    const sim = new ForceSim();
    sim.setGraph({ nodes, edges, focus: 'entry:f', depth: 2 }, (id, d) => radiusFor(d, id === 'entry:f'));
    expect(sim.rings[0]).toEqual({ inner: 0, outer: 0 });
    expect(sim.rings[1].inner).toBeGreaterThan(0);
    expect(sim.rings[1].outer).toBeGreaterThan(sim.rings[1].inner);
    expect(sim.rings[2].inner).toBeGreaterThan(sim.rings[1].outer);
    sim.settle(600);
    const dist = (id: string) => Math.hypot(sim.get(id)!.x, sim.get(id)!.y);
    const slack = 0.15;
    expect(dist('entry:f')).toBeLessThan(sim.rings[1].inner * 0.5);
    for (let i = 0; i < 6; i++) {
      const a = dist(`entry:a${i}`);
      expect(a).toBeGreaterThan(sim.rings[1].inner * (1 - slack));
      expect(a).toBeLessThan(sim.rings[1].outer * (1 + slack));
      for (let j = 0; j < 3; j++) {
        const b = dist(`entry:b${i}-${j}`);
        expect(b).toBeGreaterThan(sim.rings[2].inner * (1 - slack));
        expect(b).toBeLessThan(sim.rings[2].outer * (1 + slack));
      }
    }
    // The whole web, without a focus, has no rings at all.
    const plain = new ForceSim();
    plain.setGraph({ nodes, edges }, (_id, d) => radiusFor(d));
    expect(plain.rings).toEqual([]);
  });

  it('runs a tick of five hundred knots in a few milliseconds', () => {
    const sim = new ForceSim();
    sim.setGraph(clusters(12, 45), (_id, d) => radiusFor(d));
    sim.settle(50);
    sim.reheat(1);
    const t0 = performance.now();
    for (let i = 0; i < 20; i++) sim.tick();
    const perTick = (performance.now() - t0) / 20;
    // Generous for a slow CI box; the point is that it is not tens of ms.
    expect(perTick).toBeLessThan(12);
  });

  it('sizes a knot by the square root of its degree, and caps it', () => {
    expect(radiusFor(0)).toBeLessThan(radiusFor(4));
    expect(radiusFor(4) - radiusFor(0)).toBeCloseTo(2 * (radiusFor(1) - radiusFor(0)), 5);
    expect(radiusFor(1000)).toBe(14);
    expect(radiusFor(1, true)).toBeGreaterThan(radiusFor(1));
  });
});
