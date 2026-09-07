import type { WebGraph, WebNodeId } from './types';

/**
 * §43: the organic layout — a force-directed web, the shape Obsidian draws.
 *
 * Hand-written on purpose (no d3): the whole of what is needed is a spring
 * per edge, a repulsion between every pair of nodes, a hard "no closer than
 * this" between neighbours, a weak pull to the centre — or, in a focus web, to
 * a ring per depth — and a temperature that cools. Repulsion is the only part
 * that could be slow — 500 nodes is 125 000 pairs a tick — so it runs over a
 * uniform grid: each node only pushes against the nodes in its own and the
 * eight neighbouring cells, plus one coarse push from everything further away,
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
 *
 * Round 17 — why the web stopped being a clot. Every spring used to pull with
 * the same strength, so a hub with thirty lines pulled thirty times as hard as
 * anything pushed back, and its whole neighbourhood collapsed onto it: that
 * was the "everything sticks together" of a filled archive. Three things fix
 * it, and they are the three knobs below that did not exist before:
 *
 *   - **a spring is weaker on a busy knot** (`strength / min(degree a,
 *     degree b)`, d3's recipe), so thirty lines on a hub add up to about one;
 *   - **a hard collision distance** (`r + pad`, where `pad` is room for a
 *     label) that is resolved by moving the pair apart, not by a force that
 *     alpha can starve;
 *   - **rings per depth** in a focus web: depth 1 wants to sit in a band
 *     round the middle, depth 2 in a wider band outside it, and so on. A band
 *     is an annulus with enough *area* for its knots (a hundred and forty
 *     knots two steps out will not fit on one circumference without a radius
 *     that fights every spring — measured, round 17), and the pull only acts
 *     on a knot that has left its band, so inside it the springs and the
 *     collisions arrange things as they always did. The organic web keeps its
 *     shape; the reader gets the "one step, two steps" of the column view
 *     for free.
 *
 * A knot can be **held** (`fixed`, a hand is on it) or **pinned** (`pinned`,
 * a hand put it there and let go — it stays until it is unpinned). The sim
 * moves neither; the renderer draws the pin.
 */

export type ForceNode = {
  id: WebNodeId;
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Drawn radius; also what repulsion and springs measure from. */
  r: number;
  /** Extra room round the knot that nothing else may enter: space for its label. */
  pad: number;
  /** Held by a hand: the sim does not move it. */
  fixed: boolean;
  /** Put down by a hand and left there: the sim does not move it either. */
  pinned: boolean;
  /** Focus webs: steps from the middle (0 = the focus); undefined in the whole web. */
  ring?: number;
  /** How many links touch it in this sim — for the spring strength. */
  links: number;
};

export type ForceLink = { a: number; b: number; strength: number };

export type ForceOptions = {
  /** How far apart two linked nodes want to be, edge to edge. */
  linkDistance?: number;
  /** Spring strength for a link between two knots of degree 1; divided by the smaller degree otherwise. */
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
  /** Room round each knot (beyond `r`) that another knot may not enter. */
  pad?: number;
  /** Focus webs: what share of the way back into its band a strayed knot moves each tick. 0 turns rings off. */
  ringGravity?: number;
  /** Focus webs: how much room each knot gets in its band, as the side of a square (area = side²). */
  ringSpacing?: number;
  /** Focus webs: the gutter between one band and the next, and the inner radius of the first. */
  ringGap?: number;
};

const DEFAULTS: Required<ForceOptions> = {
  linkDistance: 60,
  linkStrength: 0.7,
  repulsion: 220,
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
  pad: 26,
  ringGravity: 0.35,
  ringSpacing: 72,
  ringGap: 70,
};

function hash(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * Radius from degree: area grows with the count, so a hub is big but not
 * enormous. Smaller than it was in round 15 (cap 14, not 22): in a filled
 * archive nearly everything is a hub, and forty-pixel knots left no room for
 * the lines between them, which are the point.
 */
export function radiusFor(degree: number, focus = false): number {
  const base = 3.5 + 1.6 * Math.sqrt(Math.max(0, degree));
  // The middle may be bigger than any hub: it is the one knot the eye must find.
  return focus ? Math.min(20, base + 7) : Math.min(14, base);
}

export class ForceSim {
  options: Required<ForceOptions>;
  nodes: ForceNode[] = [];
  links: ForceLink[] = [];
  alpha = 1;
  /** Focus webs: each depth's band, inner and outer radius, by depth. Empty in the whole web. */
  rings: { inner: number; outer: number }[] = [];
  private index = new Map<WebNodeId, number>();

  constructor(options: ForceOptions = {}) {
    this.options = { ...DEFAULTS, ...options };
  }

  get(id: WebNodeId): ForceNode | undefined {
    const i = this.index.get(id);
    return i === undefined ? undefined : this.nodes[i];
  }

  /** How many knots a hand has pinned. */
  get pinnedCount(): number {
    let count = 0;
    for (const node of this.nodes) if (node.pinned) count += 1;
    return count;
  }

  /** Lets go of every pinned knot and warms the web so it can settle again. */
  unpinAll(): number {
    let count = 0;
    for (const node of this.nodes) {
      if (node.pinned) {
        node.pinned = false;
        count += 1;
      }
    }
    if (count) this.reheat(0.3);
    return count;
  }

  /**
   * Adopts a graph. Nodes already known keep their place, their velocity and
   * their pin; new ones start on the spiral — or, in a focus web, on their
   * depth's ring — near a neighbour if they have one that is already placed,
   * so a node that appears on a depth step grows out of the node it hangs off
   * rather than flying in from the edge.
   */
  setGraph(graph: WebGraph, radius: (id: WebNodeId, degree: number) => number): void {
    const old = this.index;
    const oldNodes = this.nodes;
    const next: ForceNode[] = [];
    const index = new Map<WebNodeId, number>();
    const pending: { node: ForceNode; fresh: boolean }[] = [];
    const focusGraph = Boolean(graph.focus);

    for (const node of graph.nodes) {
      const r = radius(node.id, node.degree);
      const ring = focusGraph ? (node.depth ?? (node.id === graph.focus ? 0 : undefined)) : undefined;
      const prior = old.get(node.id);
      if (prior !== undefined) {
        const keep = oldNodes[prior];
        keep.r = r;
        keep.pad = this.options.pad;
        keep.ring = ring;
        keep.links = 0;
        index.set(node.id, next.length);
        next.push(keep);
        pending.push({ node: keep, fresh: false });
      } else {
        const fresh: ForceNode = { id: node.id, x: 0, y: 0, vx: 0, vy: 0, r, pad: this.options.pad, fixed: false, pinned: false, ring, links: 0 };
        index.set(node.id, next.length);
        next.push(fresh);
        pending.push({ node: fresh, fresh: true });
      }
    }

    const pairs: { a: number; b: number }[] = [];
    const seen = new Set<string>();
    for (const edge of graph.edges) {
      const a = index.get(edge.from);
      const b = index.get(edge.to);
      if (a === undefined || b === undefined || a === b) continue;
      const key = a < b ? `${a}|${b}` : `${b}|${a}`;
      if (seen.has(key)) continue;
      seen.add(key);
      pairs.push({ a, b });
      next[a].links += 1;
      next[b].links += 1;
    }
    // A spring on a busy knot is weaker, so a hub with thirty lines is pulled
    // on about as hard as a knot with one — d3's `1 / min(count)`.
    const links: ForceLink[] = pairs.map(({ a, b }) => ({
      a,
      b,
      strength: this.options.linkStrength / Math.max(1, Math.min(next[a].links, next[b].links)),
    }));

    // Bands: one per depth. The first starts a gutter out from the middle;
    // each is as wide as its knots need in area, and the next starts a
    // gutter beyond it.
    this.rings = [];
    if (focusGraph && this.options.ringGravity > 0) {
      const perRing: number[] = [];
      for (const node of next) {
        if (node.ring === undefined) continue;
        perRing[node.ring] = (perRing[node.ring] ?? 0) + 1;
      }
      const cellArea = this.options.ringSpacing * this.options.ringSpacing;
      let edge = 0;
      for (let d = 0; d < perRing.length; d++) {
        if (d === 0) {
          this.rings[0] = { inner: 0, outer: 0 };
          continue;
        }
        const count = perRing[d] ?? 0;
        const inner = edge + this.options.ringGap;
        const outer = Math.sqrt(inner * inner + (count * cellArea) / Math.PI);
        this.rings[d] = { inner, outer };
        edge = outer;
      }
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
      const band = node.ring !== undefined ? this.rings[node.ring] : undefined;
      if (anchor) {
        const h = hash(node.id);
        const angle = ((h % 360) * Math.PI) / 180;
        const d = anchor.r + node.r + this.options.linkDistance * 0.6;
        node.x = anchor.x + Math.cos(angle) * d;
        node.y = anchor.y + Math.sin(angle) * d;
        if (band && band.outer > 0) {
          // Slide out to the band along the anchor's bearing, so a newcomer
          // on a depth step lands in its own band rather than inside it.
          const len = Math.hypot(node.x, node.y) || 1;
          const want = Math.min(band.outer, Math.max(band.inner, len));
          node.x = (node.x / len) * want;
          node.y = (node.y / len) * want;
        }
      } else if (band && band.outer > 0) {
        const h = hash(node.id);
        const angle = ((h % 3600) / 3600) * Math.PI * 2;
        const t = ((h >>> 12) % 1000) / 1000;
        const rad = band.inner + (band.outer - band.inner) * t;
        node.x = Math.cos(angle) * rad;
        node.y = Math.sin(angle) * rad;
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
    if (nodeCount <= 40) return { linkDistance: 110, repulsion: 420, gravity: 0.012, pad: 34, ringSpacing: 104, ringGap: 110 };
    if (nodeCount <= 120) return { linkDistance: 80, repulsion: 300, gravity: 0.008, pad: 30, ringSpacing: 86, ringGap: 90 };
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
    const still = (node: ForceNode) => node.fixed || node.pinned;

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
      const f = ((d - want) / d) * link.strength * alpha;
      const fx = dx * f;
      const fy = dy * f;
      if (!still(a)) {
        a.vx += fx;
        a.vy += fy;
      }
      if (!still(b)) {
        b.vx -= fx;
        b.vy -= fy;
      }
    }

    // Repulsion over a grid. Cell = the range within which two nodes push
    // exactly; beyond it, each cell pushes as one lump from its centroid. The
    // cell is never smaller than the widest collision distance, so a pair
    // that must be kept apart is always looked at exactly.
    let maxReach = 0;
    for (const node of nodes) maxReach = Math.max(maxReach, node.r + node.pad);
    const cell = Math.max(90, Math.ceil(maxReach * 2 + 2));
    const grid = new Map<number, number[]>();
    const keyOf = (x: number, y: number) => ((Math.floor(x / cell) + 32768) << 16) ^ (Math.floor(y / cell) + 32768);
    const fillGrid = () => {
      grid.clear();
      for (let i = 0; i < n; i++) {
        const k = keyOf(nodes[i].x, nodes[i].y);
        (grid.get(k) ?? grid.set(k, []).get(k)!).push(i);
      }
    };
    fillGrid();
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
    const range2 = o.range * o.range;
    for (let i = 0; i < n; i++) {
      const a = nodes[i];
      if (still(a)) continue;
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
            const f = strength / (o.falloff === 2 ? d2 + 60 : Math.pow(d2 + 60, o.falloff / 2));
            fx += dx * f;
            fy += dy * f;
          }
        }
      }
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

    // Gravity — to the middle, or to the depth's ring — and integration.
    const rings = this.rings;
    for (const node of nodes) {
      if (still(node)) {
        node.vx = 0;
        node.vy = 0;
        continue;
      }
      const band = node.ring !== undefined ? rings[node.ring] : undefined;
      if (band && band.outer > 0 && o.ringGravity > 0) {
        // In a band: only the weak gravity, so a band does not drift off as a
        // whole. The band itself is kept below, as a move rather than a force.
        node.vx -= node.x * o.gravity * alpha * 0.25;
        node.vy -= node.y * o.gravity * alpha * 0.25;
      } else if (band && o.ringGravity > 0) {
        node.vx -= node.x * o.ringGravity * alpha;
        node.vy -= node.y * o.ringGravity * alpha;
      } else {
        node.vx -= node.x * o.gravity * alpha;
        node.vy -= node.y * o.gravity * alpha;
      }
      node.vx *= o.velocityDecay;
      node.vy *= o.velocityDecay;
      const cap = 30;
      node.vx = Math.max(-cap, Math.min(cap, node.vx));
      node.vy = Math.max(-cap, Math.min(cap, node.vy));
      node.x += node.vx;
      node.y += node.vy;
    }

    // Bands: a knot that has left its depth's band is moved back towards it,
    // by `ringGravity` of the way, along the radius only — a knot is free to
    // slide round its band and to sit anywhere across it. A move and not a
    // force, because the springs of a busy knot out-pull any force a cooling
    // alpha would leave (measured: with a force, depth two settled at a third
    // of its radius), and a stretched spring is the lesser evil: the reader
    // sees the steps.
    if (rings.length && o.ringGravity > 0) {
      for (const node of nodes) {
        if (still(node)) continue;
        const band = node.ring !== undefined ? rings[node.ring] : undefined;
        if (!band || band.outer === 0) continue;
        const len = Math.hypot(node.x, node.y) || 1;
        const want = len < band.inner ? band.inner : len > band.outer ? band.outer : len;
        if (want === len) continue;
        const k = ((want - len) / len) * o.ringGravity;
        node.x += node.x * k;
        node.y += node.y * k;
      }
    }

    // Collision: two knots closer than `r + pad` each are moved apart, half
    // and half (all of it on the free one when the other is held). A move,
    // not a force, so a cooling alpha cannot let them drift back into each
    // other — the hard floor under everything above.
    fillGrid();
    for (let i = 0; i < n; i++) {
      const a = nodes[i];
      const cx = Math.floor(a.x / cell);
      const cy = Math.floor(a.y / cell);
      for (let gx = cx - 1; gx <= cx + 1; gx++) {
        for (let gy = cy - 1; gy <= cy + 1; gy++) {
          const ids = grid.get(((gx + 32768) << 16) ^ (gy + 32768));
          if (!ids) continue;
          for (const j of ids) {
            if (j <= i) continue;
            const b = nodes[j];
            const aStill = still(a);
            const bStill = still(b);
            if (aStill && bStill) continue;
            const min = a.r + a.pad + b.r + b.pad;
            let dx = b.x - a.x;
            let dy = b.y - a.y;
            let d2 = dx * dx + dy * dy;
            if (d2 >= min * min) continue;
            if (d2 < 1e-6) {
              dx = ((hash(a.id) % 13) - 6) * 0.1 || 0.3;
              dy = ((hash(b.id) % 11) - 5) * 0.1 || 0.2;
              d2 = dx * dx + dy * dy;
            }
            const d = Math.sqrt(d2);
            const overlap = min - d;
            const ux = dx / d;
            const uy = dy / d;
            const aShare = aStill ? 0 : bStill ? 1 : 0.5;
            const bShare = 1 - aShare;
            a.x -= ux * overlap * aShare;
            a.y -= uy * overlap * aShare;
            b.x += ux * overlap * bShare;
            b.y += uy * overlap * bShare;
          }
        }
      }
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
