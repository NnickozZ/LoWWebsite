import { describe, expect, it } from 'vitest';
import {
  BETWEEN_GAP,
  betweenBoxes,
  boxCentre,
  clampZoom,
  curvePath,
  edgeGeometry,
  polylineMidpoint,
  fitViewport,
  isTreeView,
  layoutTree,
  MAX_ZOOM,
  MIN_ZOOM,
  partnerLine,
  toWorld,
  zoomAbout,
  type TreeView,
} from '@/lib/families/layout';
import {
  COL_GAP,
  NODE_SIZE,
  PARTNER_GAP,
  ROW_GAP,
  type GraphNodeId,
  type LayoutEdgeInput,
  type LayoutNodeInput,
  type LayoutResult,
} from '@/lib/families/types';

/**
 * §66 — the generation layout.
 *
 * Pure and deterministic, and this file is where those two words are made to
 * mean something: the same tree twice comes out identical to the coordinate, a
 * cycle does not hang, two people never stand on top of each other in one row,
 * and a card a hand has dragged (`pinned`) is exactly where the hand left it.
 */

const W = NODE_SIZE.mortal.width;
const H = NODE_SIZE.mortal.height;

const node = (id: string, over: Partial<LayoutNodeInput> = {}): LayoutNodeInput => ({
  id: `entry:${id}`,
  width: W,
  height: H,
  ...over,
});

const parent = (from: string, to: string): LayoutEdgeInput => ({
  from: `entry:${from}`,
  to: `entry:${to}`,
  role: 'parent',
});
const partner = (a: string, b: string): LayoutEdgeInput => ({
  from: `entry:${a}`,
  to: `entry:${b}`,
  role: 'partner',
});
const kin = (a: string, b: string): LayoutEdgeInput => ({
  from: `entry:${a}`,
  to: `entry:${b}`,
  role: 'kin',
});

const at = (result: LayoutResult, id: string) => result.positions[`entry:${id}`];
const centre = (result: LayoutResult, id: string, width = W) => at(result, id).x + width / 2;

/** Where a row starts, if every row above it holds a card of the standard height. */
const rowTop = (row: number) => row * (H + ROW_GAP);

/** Every pair of nodes on one generation, so a test can say "none of them touch". */
function overlappingPairs(
  result: LayoutResult,
  sizes: Record<GraphNodeId, { width: number; height: number }>,
): string[] {
  const ids = Object.keys(result.positions);
  const clashes: string[] = [];
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      const a = result.positions[ids[i]];
      const b = result.positions[ids[j]];
      const sa = sizes[ids[i]];
      const sb = sizes[ids[j]];
      const apart =
        a.x + sa.width <= b.x || b.x + sb.width <= a.x || a.y + sa.height <= b.y || b.y + sb.height <= a.y;
      if (!apart) clashes.push(`${ids[i]} × ${ids[j]}`);
    }
  }
  return clashes;
}

describe('§66 een gezin', () => {
  const nodes = [node('pa'), node('ma'), node('c1'), node('c2'), node('c3')];
  const edges = [
    partner('pa', 'ma'),
    parent('pa', 'c1'),
    parent('ma', 'c1'),
    parent('pa', 'c2'),
    parent('ma', 'c2'),
    parent('pa', 'c3'),
    parent('ma', 'c3'),
  ];
  const result = layoutTree(nodes, edges);

  it('puts the three children on one row, one generation below their parents', () => {
    expect(at(result, 'pa').generation).toBe(0);
    expect(at(result, 'ma').generation).toBe(0);
    for (const id of ['c1', 'c2', 'c3']) {
      expect(at(result, id).generation).toBe(1);
      expect(at(result, id).y).toBe(rowTop(1));
    }
    expect(at(result, 'pa').y).toBe(rowTop(0));
  });

  it('stands the parents beside one another, a partner-gap apart', () => {
    const [left, right] = [at(result, 'pa').x, at(result, 'ma').x].sort((a, b) => a - b);
    expect(right - left).toBe(W + PARTNER_GAP);
  });

  it('makes one union with both parents and all three children', () => {
    expect(result.unions).toHaveLength(1);
    const union = result.unions[0];
    expect([...union.parents].sort()).toEqual(['entry:ma', 'entry:pa']);
    expect([...union.children].sort()).toEqual(['entry:c1', 'entry:c2', 'entry:c3']);
  });

  it('hangs the bar half a row-gap under the parents and between them', () => {
    const union = result.unions[0];
    expect(union.y).toBe(H + ROW_GAP / 2);
    expect(union.x).toBeCloseTo((centre(result, 'pa') + centre(result, 'ma')) / 2, 6);
  });

  it('centres the children under the bar', () => {
    const centres = ['c1', 'c2', 'c3'].map((id) => centre(result, id));
    const block = (Math.min(...centres) + Math.max(...centres)) / 2;
    expect(block).toBeCloseTo(result.unions[0].x, 6);
  });

  it('leaves a column-gap between siblings and never overlaps them', () => {
    const xs = ['c1', 'c2', 'c3'].map((id) => at(result, id).x).sort((a, b) => a - b);
    expect(xs[1] - xs[0]).toBe(W + COL_GAP);
    expect(xs[2] - xs[1]).toBe(W + COL_GAP);
  });
});

describe('§66 een tweede huwelijk', () => {
  // A married once, had k1; married again, had k2. A stands in the tree once.
  const nodes = [node('a'), node('b'), node('c'), node('k1'), node('k2')];
  const edges = [
    partner('a', 'b'),
    partner('a', 'c'),
    parent('a', 'k1'),
    parent('b', 'k1'),
    parent('a', 'k2'),
    parent('c', 'k2'),
  ];
  const result = layoutTree(nodes, edges);

  it('places the twice-married person once', () => {
    expect(Object.keys(result.positions)).toHaveLength(5);
    expect(at(result, 'a')).toBeDefined();
  });

  it('makes two unions, one per marriage', () => {
    expect(result.unions).toHaveLength(2);
    const byId = Object.fromEntries(result.unions.map((union) => [union.id, union]));
    expect(byId['u:entry:a|entry:b'].children).toEqual(['entry:k1']);
    expect(byId['u:entry:a|entry:c'].children).toEqual(['entry:k2']);
  });

  /*
   * Not to the pixel, and on purpose: the two bars are 182 apart while two cards
   * side by side need 190, so the children cannot both sit dead centre. What has
   * to hold is that each child hangs under *its own* bar — nearer to it than to
   * the other one, and within half a card of it — which is what makes the two
   * marriages readable as two.
   */
  it('hangs each child under its own bar', () => {
    for (const union of result.unions) {
      const child = union.children[0];
      const childCentre = result.positions[child].x + W / 2;
      const other = result.unions.find((candidate) => candidate.id !== union.id);
      expect(Math.abs(childCentre - union.x)).toBeLessThanOrEqual(W / 2);
      expect(Math.abs(childCentre - union.x)).toBeLessThan(
        Math.abs(childCentre - (other as { x: number }).x),
      );
    }
  });

  it('keeps all three of the older generation on one row without overlapping', () => {
    for (const id of ['a', 'b', 'c']) expect(at(result, id).generation).toBe(0);
    expect(overlappingPairs(result, sizesOf(nodes))).toEqual([]);
  });
});

describe('§66 halfbroers en -zussen', () => {
  // k1 is a+b's, k2 is a+c's; the two children are half-siblings and share a row.
  const nodes = [node('a'), node('b'), node('c'), node('k1'), node('k2')];
  const result = layoutTree(nodes, [
    parent('a', 'k1'),
    parent('b', 'k1'),
    parent('a', 'k2'),
    parent('c', 'k2'),
  ]);

  it('stands them on the same row', () => {
    expect(at(result, 'k1').generation).toBe(1);
    expect(at(result, 'k2').generation).toBe(1);
    expect(at(result, 'k1').y).toBe(at(result, 'k2').y);
  });

  it('gives each their own union even though no partner line was drawn', () => {
    expect(result.unions.map((union) => union.id).sort()).toEqual([
      'u:entry:a|entry:b',
      'u:entry:a|entry:c',
    ]);
  });
});

describe('§66 iemand zonder bekende ouders', () => {
  it('stands at generation 0', () => {
    const result = layoutTree([node('lonely'), node('a'), node('kid')], [parent('a', 'kid')]);
    expect(at(result, 'lonely').generation).toBe(0);
    expect(at(result, 'lonely').y).toBe(rowTop(0));
    expect(at(result, 'a').generation).toBe(0);
    expect(at(result, 'kid').generation).toBe(1);
  });

  it('and a whole tree of strangers is one row', () => {
    const result = layoutTree([node('a'), node('b'), node('c')], []);
    for (const id of ['a', 'b', 'c']) expect(at(result, id).generation).toBe(0);
    expect(result.unions).toEqual([]);
  });
});

describe('§66 partners delen een generatie', () => {
  it('pulls the partner without parents down to the one who has them', () => {
    // g → a; a is married to b, who has no parents at all in this tree.
    const result = layoutTree(
      [node('g'), node('a'), node('b'), node('k')],
      [parent('g', 'a'), partner('a', 'b'), parent('a', 'k'), parent('b', 'k')],
    );
    expect(at(result, 'g').generation).toBe(0);
    expect(at(result, 'a').generation).toBe(1);
    expect(at(result, 'b').generation).toBe(1);
    expect(at(result, 'a').y).toBe(at(result, 'b').y);
  });

  it('keeps the children below the partner it just pulled down', () => {
    const result = layoutTree(
      [node('g'), node('a'), node('b'), node('k')],
      [parent('g', 'a'), partner('a', 'b'), parent('a', 'k'), parent('b', 'k')],
    );
    expect(at(result, 'k').generation).toBe(2);
    expect(at(result, 'k').y).toBeGreaterThan(at(result, 'b').y);
  });

  it('pulls a chain of partners along, and settles', () => {
    // g → a; a—b; b—c. All three of a, b and c end on one row.
    const result = layoutTree(
      [node('g'), node('a'), node('b'), node('c')],
      [parent('g', 'a'), partner('a', 'b'), partner('b', 'c')],
    );
    expect(at(result, 'a').generation).toBe(1);
    expect(at(result, 'b').generation).toBe(1);
    expect(at(result, 'c').generation).toBe(1);
  });
});

describe('§66 een lus hangt niet', () => {
  it('places every node of a three-way cycle', () => {
    const result = layoutTree(
      [node('a'), node('b'), node('c')],
      [parent('a', 'b'), parent('b', 'c'), parent('c', 'a')],
    );
    expect(Object.keys(result.positions).sort()).toEqual(['entry:a', 'entry:b', 'entry:c']);
    for (const id of ['a', 'b', 'c']) expect(Number.isFinite(at(result, id).x)).toBe(true);
    // The back edge lost its vote, so the three still read as three generations.
    expect([at(result, 'a').generation, at(result, 'b').generation, at(result, 'c').generation]).toEqual([
      0, 1, 2,
    ]);
  });

  it('places every node when two people each claim to be the other’s parent', () => {
    const result = layoutTree([node('a'), node('b')], [parent('a', 'b'), parent('b', 'a')]);
    expect(Object.keys(result.positions)).toHaveLength(2);
    expect(at(result, 'a').generation).toBe(0);
    expect(at(result, 'b').generation).toBe(1);
  });

  it('survives a self-marriage, a line to nowhere and a duplicate node', () => {
    const result = layoutTree(
      [node('a'), node('a'), node('b')],
      [
        { from: 'entry:a', to: 'entry:a', role: 'parent' },
        { from: 'entry:a', to: 'entry:ghost', role: 'parent' },
        partner('a', 'b'),
      ],
    );
    expect(Object.keys(result.positions).sort()).toEqual(['entry:a', 'entry:b']);
  });

  it('places nothing for nothing', () => {
    expect(layoutTree([], [])).toEqual({
      positions: {},
      unions: [],
      bounds: { minX: 0, minY: 0, maxX: 0, maxY: 0 },
    });
  });
});

describe('§66 losse takken staan naast elkaar', () => {
  const nodes = [node('a'), node('b'), node('x'), node('y')];
  const result = layoutTree(nodes, [parent('a', 'b'), parent('x', 'y')]);

  it('does not let two components overlap', () => {
    expect(overlappingPairs(result, sizesOf(nodes))).toEqual([]);
  });

  it('leaves three column-gaps between them', () => {
    const rightOfFirst = Math.max(at(result, 'a').x + W, at(result, 'b').x + W);
    const leftOfSecond = Math.min(at(result, 'x').x, at(result, 'y').x);
    expect(leftOfSecond - rightOfFirst).toBe(3 * COL_GAP);
  });

  it('does not treat a kin line as a join, so a kin-only pair is still two branches', () => {
    const two = layoutTree([node('a'), node('b')], [kin('a', 'b')]);
    expect(two.positions['entry:b'].x - two.positions['entry:a'].x).toBe(W + 3 * COL_GAP);
    // And it changes nobody's generation.
    expect(two.positions['entry:a'].generation).toBe(0);
    expect(two.positions['entry:b'].generation).toBe(0);
  });
});

describe('§66 een gesleept kaartje blijft staan', () => {
  const nodes = [
    node('pa'),
    node('ma'),
    node('c1', { pinned: { x: -400, y: 777.5 } }),
    node('c2'),
  ];
  const result = layoutTree(nodes, [
    partner('pa', 'ma'),
    parent('pa', 'c1'),
    parent('ma', 'c1'),
    parent('pa', 'c2'),
    parent('ma', 'c2'),
  ]);

  it('gives it exactly the coordinates it was pinned at', () => {
    expect(at(result, 'c1').x).toBe(-400);
    expect(at(result, 'c1').y).toBe(777.5);
  });

  it('still reports which generation it belongs to', () => {
    expect(at(result, 'c1').generation).toBe(1);
  });

  it('leaves everybody else where the layout put them', () => {
    const loose = layoutTree(
      [node('pa'), node('ma'), node('c1'), node('c2')],
      [partner('pa', 'ma'), parent('pa', 'c1'), parent('ma', 'c1'), parent('pa', 'c2'), parent('ma', 'c2')],
    );
    for (const id of ['pa', 'ma', 'c2']) {
      expect(at(result, id)).toEqual(at(loose, id));
    }
  });

  it('reaches into the bounds', () => {
    expect(result.bounds.minX).toBeLessThanOrEqual(-400);
    expect(result.bounds.maxY).toBeGreaterThanOrEqual(777.5 + H);
  });
});

describe('§66 dezelfde stamboom, dezelfde plek', () => {
  const nodes = [
    node('gp1'),
    node('gp2'),
    node('pa'),
    node('ma'),
    node('oom'),
    node('tante'),
    node('c1'),
    node('c2'),
    node('c3'),
    node('n1'),
  ];
  const edges = [
    partner('gp1', 'gp2'),
    parent('gp1', 'pa'),
    parent('gp2', 'pa'),
    parent('gp1', 'tante'),
    parent('gp2', 'tante'),
    partner('pa', 'ma'),
    partner('tante', 'oom'),
    parent('pa', 'c1'),
    parent('ma', 'c1'),
    parent('pa', 'c2'),
    parent('ma', 'c2'),
    parent('pa', 'c3'),
    parent('ma', 'c3'),
    parent('tante', 'n1'),
    parent('oom', 'n1'),
    kin('c1', 'n1'),
  ];

  it('gives the same answer twice', () => {
    const once = layoutTree(nodes, edges);
    const twice = layoutTree(nodes, edges);
    expect(twice).toEqual(once);
    expect(JSON.stringify(twice)).toBe(JSON.stringify(once));
  });

  it('never lets two cards overlap', () => {
    const result = layoutTree(nodes, edges);
    expect(overlappingPairs(result, sizesOf(nodes))).toEqual([]);
  });

  it('holds a row together even when the cards are different sizes', () => {
    const mixed: LayoutNodeInput[] = nodes.map((entry, i) =>
      i % 3 === 0
        ? { ...entry, width: NODE_SIZE.house.width, height: NODE_SIZE.house.height }
        : i % 3 === 1
          ? { ...entry, width: NODE_SIZE.divine.width, height: NODE_SIZE.divine.height }
          : entry,
    );
    const result = layoutTree(mixed, edges);
    expect(overlappingPairs(result, sizesOf(mixed))).toEqual([]);
  });

  it('lays four hundred people out quickly', () => {
    const many: LayoutNodeInput[] = [];
    const lines: LayoutEdgeInput[] = [];
    for (let i = 0; i < 400; i++) {
      many.push(node(`p${i}`));
      if (i >= 2) lines.push(parent(`p${Math.floor(i / 2) - 1}`, `p${i}`));
    }
    const started = Date.now();
    const result = layoutTree(many, lines);
    expect(Object.keys(result.positions)).toHaveLength(400);
    expect(Date.now() - started).toBeLessThan(4000);
  });
});

describe('§66 wat de tekenlaag krijgt', () => {
  const nodes = [node('pa'), node('ma'), node('c1'), node('c2')];
  const result = layoutTree(nodes, [
    partner('pa', 'ma'),
    parent('pa', 'c1'),
    parent('ma', 'c1'),
    parent('pa', 'c2'),
    parent('ma', 'c2'),
  ]);
  const geometry = edgeGeometry(result, sizesOf(nodes));

  it('drops each parent from the bottom of its card to the bar', () => {
    const union = geometry.unions[0];
    for (const link of union.parents) {
      const start = link.points[0];
      const node2 = result.positions[link.id];
      expect(start.y).toBe(node2.y + H);
      expect(start.x).toBeCloseTo(node2.x + W / 2, 6);
      // Straight down, then across to the bar.
      expect(link.points[1]).toEqual({ x: start.x, y: union.bar.y });
      expect(link.points[link.points.length - 1]).toEqual({ x: union.bar.x, y: union.bar.y });
    }
  });

  it('runs each child up from the bar with one horizontal run at bar height', () => {
    const union = geometry.unions[0];
    expect(union.children).toHaveLength(2);
    for (const link of union.children) {
      const node2 = result.positions[link.id];
      expect(link.points[0]).toEqual({ x: union.bar.x, y: union.bar.y });
      const last = link.points[link.points.length - 1];
      expect(last).toEqual({ x: node2.x + W / 2, y: node2.y });
      // Exactly one horizontal run, and it is at the bar.
      expect(link.points[1].y).toBe(union.bar.y);
    }
  });

  it('spans the bar between the two parents’ drops', () => {
    const span = geometry.unions[0].span;
    expect(span).not.toBeNull();
    expect(span?.y).toBe(geometry.unions[0].bar.y);
    expect((span as { x2: number }).x2 - (span as { x1: number }).x1).toBe(W + PARTNER_GAP);
  });

  it('gives a childless couple a short link instead of a bar', () => {
    const pair = [node('a'), node('b')];
    const only = layoutTree(pair, [partner('a', 'b')]);
    const drawn = edgeGeometry(only, sizesOf(pair));
    expect(drawn.unions).toHaveLength(1);
    const link = drawn.unions[0].partnerLink;
    expect(link).not.toBeNull();
    expect(link?.y1).toBe(link?.y2);
    expect((link as { x2: number }).x2 - (link as { x1: number }).x1).toBe(PARTNER_GAP);
    expect(drawn.unions[0].children).toEqual([]);
  });

  it('has no partner link where there are children', () => {
    expect(geometry.unions[0].partnerLink).toBeNull();
  });

  it('draws a kin line as a bow, and a zero-length one as a dot', () => {
    const path = curvePath(0, 0, 100, 0);
    expect(path).toMatch(/^M 0 0 Q [-\d.]+ [-\d.]+ 100 0$/);
    // The control point is off the straight line, or it would not be a curve.
    expect(path).not.toBe('M 0 0 Q 50 0 100 0');
    expect(curvePath(5, 5, 5, 5)).toBe('M 5 5');
  });
});

/** The sizes map `edgeGeometry` and the overlap check want. */
function sizesOf(nodes: LayoutNodeInput[]): Record<GraphNodeId, { width: number; height: number }> {
  return Object.fromEntries(nodes.map((entry) => [entry.id, { width: entry.width, height: entry.height }]));
}

/* ---------------------------------------------------------------- round 31 */

describe('§66 de lijn tussen twee partners', () => {
  const left = { x: 0, y: 0, width: 100, height: 200 };
  const right = { x: 160, y: 20, width: 100, height: 200 };

  it('runs between the facing edges, at the height of the two middles', () => {
    const line = partnerLine(left, right);
    expect(line.x1).toBe(100);
    expect(line.x2).toBe(160);
    expect(line.y1).toBe(110);
    expect(line.y2).toBe(110);
  });

  it('says the same thing whichever way round it is asked', () => {
    expect(partnerLine(right, left)).toEqual(partnerLine(left, right));
  });

  it('gives a card its own middle', () => {
    expect(boxCentre(left)).toEqual({ x: 50, y: 100 });
  });
});

/**
 * §67: pan and zoom moved to `lib/canvas/view.ts`, because the prikbord was
 * doing the same four sums by hand. Their own tests moved with them
 * (`tests/unit/canvas-view.test.ts`); what is left here is the promise this
 * file makes to the stamboom's canvas — that the old names still come out of
 * the old door, and mean the same thing.
 */
describe('§67 de zoom, doorgegeven onder de oude namen', () => {
  it('hands the tree the same four sums it always had', () => {
    expect(clampZoom(99)).toBe(MAX_ZOOM);
    expect(clampZoom(0)).toBe(MIN_ZOOM);
    expect(fitViewport({ minX: 0, minY: 0, maxX: 400, maxY: 200 }, { width: 600, height: 400 }, 0)).toEqual({
      x: 0,
      y: 50,
      zoom: 1.5,
    });
    const view: TreeView = { x: 20, y: 30, zoom: 1 };
    const next = zoomAbout(view, 2, 120, 80);
    expect(next.zoom).toBe(2);
    expect(toWorld(next, 120, 80).x).toBeCloseTo(toWorld(view, 120, 80).x, 6);
  });

  it('still refuses a stored view that is not one', () => {
    expect(isTreeView({ x: 1, y: 2, zoom: 1 })).toBe(true);
    expect(isTreeView({ x: 1, y: 2 })).toBe(false);
    expect(isTreeView(null)).toBe(false);
  });
});

/* ---------------------------------------------------------------- round 33 */

const sibling = (a: string, b: string): LayoutEdgeInput => ({
  from: `entry:${a}`,
  to: `entry:${b}`,
  role: 'sibling',
});

describe('§67 broers en zussen op één rij', () => {
  it('pulls a sibling with no parents onto the row of the one who has them', () => {
    const result = layoutTree(
      [node('opa'), node('a'), node('b')],
      [parent('opa', 'a'), sibling('a', 'b')],
    );
    expect(at(result, 'a').generation).toBe(1);
    expect(at(result, 'b').generation).toBe(1);
  });

  it('and makes no union at all — a brother and a sister are not a couple', () => {
    const result = layoutTree([node('a'), node('b')], [sibling('a', 'b')]);
    expect(result.unions).toEqual([]);
  });

  it('but does join two halves into one component, unlike a kin line', () => {
    const nodes = [node('a'), node('b')];
    const joined = layoutTree(nodes, [sibling('a', 'b')]);
    const apart = layoutTree(nodes, [kin('a', 'b')]);
    // Joined: side by side in one row, a column gap apart. Apart: two
    // components, which stand three column gaps apart.
    expect(at(joined, 'b').x - at(joined, 'a').x).toBe(W + COL_GAP);
    expect(at(apart, 'b').x - at(apart, 'a').x).toBe(W + 3 * COL_GAP);
  });

  it('has no say in the generations at all, the way a parent line does', () => {
    // b's own child still hangs below b, and the sibling line moves nobody.
    const result = layoutTree(
      [node('a'), node('b'), node('kind')],
      [sibling('a', 'b'), parent('b', 'kind')],
    );
    expect(at(result, 'a').generation).toBe(0);
    expect(at(result, 'b').generation).toBe(0);
    expect(at(result, 'kind').generation).toBe(1);
  });
});

/*
 * §67, the repair: two rules that both want to be right about one pair.
 *
 * A person can be both the parent and the partner of the same person, and the
 * old settle loop let the two push each other down until it ran out of rounds —
 * the couple ended ten rows below everybody else. Lineage wins now: the partner
 * (or sibling) line is still drawn, it simply does not vote.
 */
describe('§67 lineage wint van een rij', () => {
  it('ouder én partner van dezelfde persoon blijft twee rijen', () => {
    const result = layoutTree([node('a'), node('b')], [parent('a', 'b'), partner('a', 'b')]);
    expect(at(result, 'a').generation).toBe(0);
    expect(at(result, 'b').generation).toBe(1);
  });

  it('and nobody is dragged down ten rows by the settling', () => {
    const result = layoutTree(
      [node('a'), node('b'), node('los')],
      [parent('a', 'b'), partner('a', 'b')],
    );
    // The whole tree is two rows deep, not eleven.
    const rows = Object.values(result.positions).map((one) => one.generation);
    expect(Math.max(...rows)).toBe(1);
    expect(at(result, 'los').generation).toBe(0);
  });

  it('the same for a sibling line between a parent and their child', () => {
    const result = layoutTree([node('a'), node('b')], [parent('a', 'b'), sibling('a', 'b')]);
    expect(at(result, 'a').generation).toBe(0);
    expect(at(result, 'b').generation).toBe(1);
  });

  it('and for a grandparent who is also somebody’s partner', () => {
    const result = layoutTree(
      [node('opa'), node('pa'), node('kind')],
      [parent('opa', 'pa'), parent('pa', 'kind'), partner('opa', 'kind')],
    );
    expect(at(result, 'opa').generation).toBe(0);
    expect(at(result, 'pa').generation).toBe(1);
    expect(at(result, 'kind').generation).toBe(2);
  });

  it('leaves an ordinary partner pair alone', () => {
    const result = layoutTree(
      [node('g'), node('a'), node('b')],
      [parent('g', 'a'), partner('a', 'b')],
    );
    expect(at(result, 'b').generation).toBe(1);
  });
});

describe('§67 de tekening van een broer-of-zuslijn', () => {
  it('runs between the facing edges when the two share a row', () => {
    const nodes = [node('a'), node('b')];
    const edges = [sibling('a', 'b')];
    const result = layoutTree(nodes, edges);
    const drawn = edgeGeometry(result, sizesOf(nodes), edges);
    expect(drawn.siblings).toHaveLength(1);
    const line = drawn.siblings[0];
    expect(line).toMatchObject({ a: 'entry:a', b: 'entry:b', sameRow: true });
    expect(line.points).toHaveLength(2);
    expect(line.points[0].y).toBe(line.points[1].y);
    expect(line.points[0].y).toBe(at(result, 'a').y + H / 2);
    expect(line.points[1].x - line.points[0].x).toBe(COL_GAP);
  });

  it('rises over the row when a third card stands between the two', () => {
    // Three siblings of one union sit on one row; a and c are not adjacent.
    const nodes = [node('p'), node('a'), node('b'), node('c')];
    const edges = [parent('p', 'a'), parent('p', 'b'), parent('p', 'c'), sibling('a', 'c')];
    const result = layoutTree(nodes, edges);
    const order = ['a', 'b', 'c'].sort((l, r) => at(result, l).x - at(result, r).x);
    const [left, , right] = order;
    const drawn = edgeGeometry(result, sizesOf(nodes), [sibling(left, right)]);
    const line = drawn.siblings[0];
    expect(line.sameRow).toBe(false);
    expect(line.points).toHaveLength(4);
    expect(line.points[1].y).toBeLessThan(at(result, left).y);
  });

  it('stacks two rises that overlap so neither line lies under the other', () => {
    // a, b, c, d in one row; a–c and a–d both rise over b; the longer climbs higher.
    const nodes = [node('p'), node('a'), node('b'), node('c'), node('d')];
    const edges = [parent('p', 'a'), parent('p', 'b'), parent('p', 'c'), parent('p', 'd')];
    const result = layoutTree(nodes, edges);
    const order = ['a', 'b', 'c', 'd'].sort((l, r) => at(result, l).x - at(result, r).x);
    const [first, , third, fourth] = order;
    const drawn = edgeGeometry(result, sizesOf(nodes), [sibling(first, third), sibling(first, fourth)]);
    expect(drawn.siblings).toHaveLength(2);
    const short = drawn.siblings.find((line) => line.b === `entry:${third}` || line.a === `entry:${third}`)!;
    const long = drawn.siblings.find((line) => line.b === `entry:${fourth}` || line.a === `entry:${fourth}`)!;
    expect(short.points[1].y).not.toBe(long.points[1].y);
    expect(long.points[1].y).toBeLessThan(short.points[1].y);
  });

  it('rises over the row when the two ended up on different ones', () => {
    const nodes = [node('a'), node('b')];
    const edges = [parent('a', 'b'), sibling('a', 'b')];
    const result = layoutTree(nodes, edges);
    const drawn = edgeGeometry(result, sizesOf(nodes), edges);
    const line = drawn.siblings[0];
    expect(line.sameRow).toBe(false);
    expect(line.points).toHaveLength(4);
    // Off the top of each card, up to one height above the higher of the two.
    expect(line.points[0]).toEqual({ x: at(result, 'a').x + W / 2, y: at(result, 'a').y });
    expect(line.points[3]).toEqual({ x: at(result, 'b').x + W / 2, y: at(result, 'b').y });
    expect(line.points[1].y).toBe(line.points[2].y);
    expect(line.points[1].y).toBeLessThan(Math.min(at(result, 'a').y, at(result, 'b').y));
  });

  it('draws one line per pair, whichever end wrote it, and nothing for a partner', () => {
    const nodes = [node('a'), node('b')];
    const edges = [sibling('a', 'b'), sibling('b', 'a'), partner('a', 'b')];
    const drawn = edgeGeometry(layoutTree(nodes, edges), sizesOf(nodes), edges);
    expect(drawn.siblings).toHaveLength(1);
  });

  it('and none at all when the caller hands it no edges', () => {
    const nodes = [node('a'), node('b')];
    expect(edgeGeometry(layoutTree(nodes, [sibling('a', 'b')]), sizesOf(nodes)).siblings).toEqual([]);
  });
});

describe('§67 de handgreep die van twee kaartjes is', () => {
  const box = (x: number, y: number, width = 100, height = 60) => ({ x, y, width, height });

  it('sits halfway between the two centres, below the lower of the two', () => {
    const at = betweenBoxes(box(0, 0), box(200, 0));
    expect(at.x).toBe(150); // (50 + 250) / 2
    expect(at.y).toBe(60 + BETWEEN_GAP);
  });

  it('takes the *lower* card, not the higher one, so the handle is never behind a card', () => {
    const high = box(0, 0);
    const low = box(200, 500);
    const at = betweenBoxes(high, low);
    expect(at.y).toBe(560 + BETWEEN_GAP);
    // And the order of the two makes no difference to either coordinate.
    expect(betweenBoxes(low, high)).toEqual(at);
  });

  it('answers the same point for two cards on top of each other', () => {
    expect(betweenBoxes(box(10, 10), box(10, 10))).toEqual({ x: 60, y: 70 + BETWEEN_GAP });
  });
});

describe('§67 het midden van een geknikte lijn', () => {
  it('is halfway along a straight segment', () => {
    expect(polylineMidpoint([{ x: 0, y: 0 }, { x: 100, y: 0 }])).toEqual({ x: 50, y: 0 });
  });

  it('walks the line rather than averaging the corners', () => {
    /*
     * Three of the four points sit on the left, so the *average* would be at
     * x = 25 — a third of the way along a line whose middle is in the bar at
     * the top. Walking gives the point a reader would call the middle.
     */
    const points = [
      { x: 0, y: 100 },
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
    ];
    expect(polylineMidpoint(points)).toEqual({ x: 50, y: 0 });
  });

  it('is safe on nothing, on one point, and on a line of length nought', () => {
    expect(polylineMidpoint([])).toEqual({ x: 0, y: 0 });
    expect(polylineMidpoint([{ x: 7, y: 9 }])).toEqual({ x: 7, y: 9 });
    expect(polylineMidpoint([{ x: 7, y: 9 }, { x: 7, y: 9 }])).toEqual({ x: 7, y: 9 });
  });
});
