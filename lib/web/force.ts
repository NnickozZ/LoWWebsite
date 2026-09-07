import type { WebGraph, WebNodeId } from './types';

/**
 * §43: the organic layout — a force-directed web, the shape Obsidian draws.
 *
 * Hand-written on purpose (no d3): the whole of what is needed is a spring
 * per edge, a repulsion between every pair of nodes, a weak pull to the
 * centre, and a temperature that cools. Repulsion is the only part that could
 * be slow — 500 nodes is 125 000 pairs a tick — so it runs over a uniform
 * grid: each node only pushes against the nodes in its own and the eight
 * neighbouring cells, plus one coarse push from everything further away,
 * summed per cell. Well under a millisecond a tick at this size.
 *
 * Pure: no DOM, no timers. The renderer calls `tick()` inside its own frame
 * loop while `alpha` is above the floor, and stops drawing when it is not.
 * `reheat()` wakes it up again after a drag or a change of graph.
 *
 * Determinism: a node starts on a spiral seeded by a hash of its id, so the
 * same archive lays out the same way twice and a reload does not shuffle the
 * wall. Nodes that survive a change of graph keep their positions
 * (`setGraph` carries them over), which is what makes a legend tick or a
 * depth step feel like the web *rearranging* rather than being redrawn.
 */

export type ForceNode = {
  id: WebNodeId;
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Drawn radius; also what repulsion and springs measure from. */
  r: number;
  /** Held by a hand: the sim does not move it. */
  fixed: boolean;
};

export type ForceLink = { a: number; b: number };

export type ForceOptions = {
  /** How far apart two linked nodes want to be, edge to edge. */
  linkDistance?: number;
  linkStrength?: number;
  repulsion?: number;
  gravity?: number;
  velocityDecay?: number;
  alphaDecay?: number;
  alphaMin?: number;
  /** How steeply repulsion falls off: 2 is the classic 1/d², 3 keeps it local. */
  falloff?: number;
  /** Beyond this many pixels a node pushes nothing at all. */
  range?: number;
};

const DEFAULTS: Required<ForceOptions> = {
  linkDistance: 36,
  linkStrength: 0.4,
  repulsion: 90,
  gravity: 0.004,
  velocityDecay: 0.45,
  // ≈ 300 ticks to settle, the d3 default.
  alphaDecay: 1 - Math.pow(0.001, 1 / 300),
  alphaMin: 0.001,
  falloff: 2,
  // Past this a knot pushes nothing: repulsion is what keeps neighbours
  // apart, not what spreads the whole web thin. A weak gravity holds the
  // pieces together instead.
  range: 300,
};

function hash(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Radius from degree: area grows with the count, so a hub is big but not enormous. */
export function radiusFor(degree: number, focus = false): number {
  const base = 4.5 + 2.4 * Math.sqrt(Math.max(0, degree));
  return Math.min(22, focus ? base + 6 : base);
}

export class ForceSim {
  options: Required<ForceOptions>;
  nodes: ForceNode[] = [];
  links: ForceLink[] = [];
  alpha = 1;
  private index = new Map<WebNodeId, number>();

  constructor(options: ForceOptions = {}) {
    this.options = { ...DEFAULTS, ...options };
  }

  get(id: WebNodeId): ForceNode | undefined {
    const i = this.index.get(id);
    return i === undefined ? undefined : this.nodes[i];
  }

  /**
   * Adopts a graph. Nodes already known keep their place and their velocity;
   * new ones start on the spiral, near a neighbour if they have one that is
   * already placed — so a node that appears on a depth step grows out of the
   * node it hangs off rather than flying in from the edge.
   */
  setGraph(graph: WebGraph, radius: (id: WebNodeId, degree: number) => number): void {
    const old = this.index;
    const oldNodes = this.nodes;
    const next: ForceNode[] = [];
    const index = new Map<WebNodeId, number>();
    const pending: { node: ForceNode; fresh: boolean }[] = [];

    for (const node of graph.nodes) {
      const r = radius(node.id, node.degree);
      const prior = old.get(node.id);
      if (prior !== undefined) {
        const keep = oldNodes[prior];
        keep.r = r;
        index.set(node.id, next.length);
        next.push(keep);
        pending.push({ node: keep, fresh: false });
      } else {
        const fresh: ForceNode = { id: node.id, x: 0, y: 0, vx: 0, vy: 0, r, fixed: false };
        index.set(node.id, next.length);
        next.push(fresh);
        pending.push({ node: fresh, fresh: true });
      }
    }

    const links: ForceLink[] = [];
    const seen = new Set<string>();
    for (const edge of graph.edges) {
      const a = index.get(edge.from);
      const b = index.get(edge.to);
      if (a === undefined || b === undefined || a === b) continue;
      const key = a < b ? `${a}|${b}` : `${b}|${a}`;
      if (seen.has(key)) continue;
      seen.add(key);
      links.push({ a, b });
    }

    // Place the newcomers: beside a placed neighbour when there is one.
    const neighbourOf = new Map<number, number>();
    for (const link of links) {
      if (!neighbourOf.has(link.a)) neighbourOf.set(link.a, link.b);
      if (!neighbourOf.has(link.b)) neighbourOf.set(link.b, link.a);
    }
    const spiral = (id: WebNodeId, n: number) => {
      const h = hash(id);
      const t = (h % 10007) / 10007;
      const angle = t * Math.PI * 2 * 7;
      const dist = 40 + Math.sqrt(n + 1) * 26 * (0.6 + t);
      return { x: Math.cos(angle) * dist, y: Math.sin(angle) * dist };
    };
    pending.forEach(({ node, fresh }, i) => {
      if (!fresh) return;
      const nb = neighbourOf.get(i);
      const anchor = nb !== undefined && !pending[nb].fresh ? next[nb] : null;
      if (anchor) {
        const h = hash(node.id);
        const angle = ((h % 360) * Math.PI) / 180;
        const d = anchor.r + node.r + this.options.linkDistance * 0.6;
        node.x = anchor.x + Math.cos(angle) * d;
        node.y = anchor.y + Math.sin(angle) * d;
      } else {
        const p = spiral(node.id, i);
        node.x = p.x;
        node.y = p.y;
      }
    });

    this.nodes = next;
    this.links = links;
    this.index = index;
    this.alpha = Math.max(this.alpha, pending.some((p) => p.fresh) ? 1 : 0.3);
  }

  /**
   * Spacing for a graph of this size. A web of five knots around a focus
   * wants room — the labels are the point — while five hundred want to be
   * a web and not a field; the same constants cannot do both.
   */
  static optionsFor(nodeCount: number): ForceOptions {
    if (nodeCount <= 40) return { linkDistance: 95, repulsion: 260, gravity: 0.012 };
    if (nodeCount <= 120) return { linkDistance: 60, repulsion: 150, gravity: 0.008 };
    return {};
  }

  reheat(alpha = 0.5): void {
    this.alpha = Math.max(this.alpha, alpha);
  }

  get settled(): boolean {
    return this.alpha < this.options.alphaMin;
  }

  /** One step. Returns false once cool, so a frame loop can stop. */
  tick(): boolean {
    if (this.settled) return false;
    const o = this.options;
    const nodes = this.nodes;
    const n = nodes.length;
    if (!n) {
      this.alpha = 0;
      return false;
    }
    const alpha = this.alpha;

    // Springs.
    for (const link of this.links) {
      const a = nodes[link.a];
      const b = nodes[link.b];
      let dx = b.x - a.x;
      let dy = b.y - a.y;
      let d = Math.hypot(dx, dy);
      if (d < 1e-3) {
        dx = (hash(a.id) % 7) - 3 || 1;
        dy = (hash(b.id) % 5) - 2 || 1;
        d = Math.hypot(dx, dy);
      }
      const want = a.r + b.r + o.linkDistance;
      const f = ((d - want) / d) * o.linkStrength * alpha;
      const fx = dx * f;
      const fy = dy * f;
      if (!a.fixed) {
        a.vx += fx;
        a.vy += fy;
      }
      if (!b.fixed) {
        b.vx -= fx;
        b.vy -= fy;
      }
    }

    // Repulsion over a grid. Cell = the range within which two nodes push
    // exactly; beyond it, each cell pushes as one lump from its centroid.
    const cell = 90;
    const grid = new Map<number, number[]>();
    const keyOf = (x: number, y: number) => ((Math.floor(x / cell) + 32768) << 16) ^ (Math.floor(y / cell) + 32768);
    for (let i = 0; i < n; i++) {
      const k = keyOf(nodes[i].x, nodes[i].y);
      (grid.get(k) ?? grid.set(k, []).get(k)!).push(i);
    }
    const lumps: { x: number; y: number; m: number; k: number }[] = [];
    for (const [k, ids] of grid) {
      let sx = 0;
      let sy = 0;
      for (const i of ids) {
        sx += nodes[i].x;
        sy += nodes[i].y;
      }
      lumps.push({ x: sx / ids.length, y: sy / ids.length, m: ids.length, k });
    }
    const strength = o.repulsion * alpha;
    for (let i = 0; i < n; i++) {
      const a = nodes[i];
      if (a.fixed) continue;
      const cx = Math.floor(a.x / cell);
      const cy = Math.floor(a.y / cell);
      let fx = 0;
      let fy = 0;
      for (let gx = cx - 1; gx <= cx + 1; gx++) {
        for (let gy = cy - 1; gy <= cy + 1; gy++) {
          const ids = grid.get(((gx + 32768) << 16) ^ (gy + 32768));
          if (!ids) continue;
          for (const j of ids) {
            if (j === i) continue;
            const b = nodes[j];
            let dx = a.x - b.x;
            let dy = a.y - b.y;
            let d2 = dx * dx + dy * dy;
            if (d2 < 1e-4) {
              dx = ((hash(a.id) % 13) - 6) * 0.1 || 0.3;
              dy = ((hash(b.id) % 11) - 5) * 0.1 || 0.2;
              d2 = dx * dx + dy * dy;
            }
            const min = a.r + b.r + 4;
            // Inside the touching distance the push is much harder: no overlap.
            const boost = d2 < min * min ? 4 : 1;
            const f = (strength * boost) / (o.falloff === 2 ? d2 + 60 : Math.pow(d2 + 60, o.falloff / 2));
            fx += dx * f;
            fy += dy * f;
          }
        }
      }
      const range2 = o.range * o.range;
      for (const lump of lumps) {
        const lx = Math.floor(lump.x / cell);
        const ly = Math.floor(lump.y / cell);
        if (Math.abs(lx - cx) <= 1 && Math.abs(ly - cy) <= 1) continue;
        const dx = a.x - lump.x;
        const dy = a.y - lump.y;
        const d2 = dx * dx + dy * dy;
        if (d2 > range2) continue;
        const f = (strength * lump.m) / (o.falloff === 2 ? d2 + 60 : Math.pow(d2 + 60, o.falloff / 2));
        fx += dx * f;
        fy += dy * f;
      }
      a.vx += fx;
      a.vy += fy;
    }

    // Gravity and integration.
    for (const node of nodes) {
      if (node.fixed) {
        node.vx = 0;
        node.vy = 0;
        continue;
      }
      node.vx -= node.x * o.gravity * alpha;
      node.vy -= node.y * o.gravity * alpha;
      node.vx *= o.velocityDecay;
      node.vy *= o.velocityDecay;
      const cap = 30;
      node.vx = Math.max(-cap, Math.min(cap, node.vx));
      node.vy = Math.max(-cap, Math.min(cap, node.vy));
      node.x += node.vx;
      node.y += node.vy;
    }

    this.alpha += (0 - this.alpha) * o.alphaDecay;
    if (this.alpha < o.alphaMin) this.alpha = 0;
    return this.alpha > 0;
  }

  /** Runs to rest in one go — for tests and for a first frame with no flicker. */
  settle(maxTicks = 400): void {
    for (let i = 0; i < maxTicks && this.tick(); i++) {
      /* keep ticking */
    }
  }

  bounds(): { minX: number; minY: number; maxX: number; maxY: number } {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const node of this.nodes) {
      minX = Math.min(minX, node.x - node.r);
      minY = Math.min(minY, node.y - node.r);
      maxX = Math.max(maxX, node.x + node.r);
      maxY = Math.max(maxY, node.y + node.r);
    }
    if (!this.nodes.length) return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
    return { minX, minY, maxX, maxY };
  }
}
