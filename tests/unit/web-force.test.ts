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
    expect(radiusFor(1000)).toBe(22);
    expect(radiusFor(1, true)).toBeGreaterThan(radiusFor(1));
  });
});
