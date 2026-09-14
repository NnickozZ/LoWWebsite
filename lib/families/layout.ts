import {
  COL_GAP,
  PARTNER_GAP,
  ROW_GAP,
  type FieldRole,
  type GraphNodeId,
  type LayoutEdgeInput,
  type LayoutNodeInput,
  type LayoutResult,
  type LayoutUnion,
  type Placed,
} from './types';

/**
 * §66 — where everybody stands.
 *
 * A generation layout, pure and deterministic: the same nodes and the same lines
 * in the same order always come out at the same coordinates, because a stamboom
 * that shuffles itself between two loads is a stamboom nobody trusts. Nothing in
 * here touches the database, React or the DOM — `tests/unit/family-layout.test.ts`
 * runs the whole of it — and the canvas is only allowed to *draw* what comes
 * back, never to work out geometry of its own (the rule the web and the tijdlijn
 * already live by).
 *
 * The five steps, in order:
 *
 * 1. **A lineage DAG.** Only `parent` lines make generations. A stamboom drawn
 *    by hand *will* eventually contain a cycle — somebody is their own
 *    great-grandmother, or two artikelen each name the other as a parent — and a
 *    cycle must not hang the browser. A depth-first walk records the back edges
 *    and leaves them out of the DAG; they are still drawn, they just do not vote
 *    on who is older.
 * 2. **Generations by longest path**, so a grandchild is two rows below the
 *    grandparent even when there is also a direct line between them, with
 *    **partners and siblings pulled onto one row** (§67) and the whole thing
 *    re-run until it settles (capped at ten rounds). A partner or sibling line
 *    whose two ends are already joined by a **parent path** is left out of that
 *    equalising altogether — lineage wins, and without that rule a person who
 *    is both parent and partner of the same person drifted ten rows down.
 * 3. **Unions** — one or two parents and the children they share. A person with
 *    two partners is in two unions; that is the whole of "a second marriage".
 *    A `sibling` line makes none: a brother and a sister are not a couple and
 *    there is no bar to hang anybody from (§67).
 * 4. **Order within a row** by barycentre, two sweeps down and two up, with the
 *    parents of a union held together as one block so a couple never has a
 *    stranger standing between them.
 * 5. **X**, row by row: everybody in a line, then each set of siblings slid under
 *    its union's bar as far as the neighbour to its left allows, then one pass
 *    back up moving parents over the middle of their children. Components that
 *    share no line are laid out on their own and stood side by side.
 *
 * A **pinned** node — one a hand has dragged (§66: "een gesleept kaartje blijft
 * staan") — is placed by the layout like everyone else and then put back exactly
 * where it was told to be. It does not push anybody: making the automatic half
 * flow around the manual half is a much larger idea, and the honest simple
 * behaviour is that a dragged card may overlap and the person who dragged it can
 * see that it does.
 */

/** A default only reached by a malformed node; every real one carries its frame's size. */
const FALLBACK_SIZE = { width: 150, height: 190 };
/** How far apart two components stand. */
const COMPONENT_GAP = 3 * COL_GAP;
/** The partner-equalise / longest-path fixpoint never runs longer than this. */
const SETTLE_ROUNDS = 10;

type Edge = { from: GraphNodeId; to: GraphNodeId; role: FieldRole };
/** A node once its numbers have been made safe. */
type Node = { id: GraphNodeId; width: number; height: number; pinned?: { x: number; y: number } };

function tidy(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function mean(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function push<K, V>(into: Map<K, V[]>, key: K, value: V): void {
  const list = into.get(key);
  if (list) list.push(value);
  else into.set(key, [value]);
}

// ---------------------------------------------------------------------------
// The layout
// ---------------------------------------------------------------------------

export function layoutTree(
  nodesInput: readonly LayoutNodeInput[],
  edgesInput: readonly LayoutEdgeInput[],
): LayoutResult {
  /* ---------------------------------------------------------- the nodes */
  const nodes: Node[] = [];
  const byId = new Map<GraphNodeId, Node>();
  const inputOrder = new Map<GraphNodeId, number>();

  for (const raw of nodesInput ?? []) {
    if (!raw || typeof raw.id !== 'string' || !raw.id || byId.has(raw.id)) continue;
    const width = Number.isFinite(raw.width) && raw.width > 0 ? raw.width : FALLBACK_SIZE.width;
    const height = Number.isFinite(raw.height) && raw.height > 0 ? raw.height : FALLBACK_SIZE.height;
    const pinned =
      raw.pinned && Number.isFinite(raw.pinned.x) && Number.isFinite(raw.pinned.y)
        ? { x: raw.pinned.x, y: raw.pinned.y }
        : undefined;
    const node = { id: raw.id, width, height, ...(pinned ? { pinned } : {}) };
    inputOrder.set(node.id, nodes.length);
    nodes.push(node);
    byId.set(node.id, node);
  }

  if (!nodes.length) {
    return { positions: {}, unions: [], bounds: { minX: 0, minY: 0, maxX: 0, maxY: 0 } };
  }

  /* ---------------------------------------------------------- the lines */
  const edges: Edge[] = [];
  const seenEdge = new Set<string>();
  for (const raw of edgesInput ?? []) {
    if (!raw) continue;
    let { from, to } = raw;
    let role: FieldRole = raw.role;
    if (typeof from !== 'string' || typeof to !== 'string' || from === to) continue;
    if (!byId.has(from) || !byId.has(to)) continue;
    // A `child` line is a `parent` line the other way round; the graph builder
    // has already turned them, but a caller that has not is not worth failing.
    if (role === 'child') {
      [from, to] = [to, from];
      role = 'parent';
    }
    if (role !== 'parent' && role !== 'partner' && role !== 'sibling' && role !== 'kin') continue;
    const key =
      role === 'parent' ? `parent|${from}|${to}` : `${role}|${[from, to].sort().join('|')}`;
    if (seenEdge.has(key)) continue;
    seenEdge.add(key);
    edges.push({ from, to, role });
  }

  const parentEdges = edges.filter((edge) => edge.role === 'parent');
  const partnerEdges = edges.filter((edge) => edge.role === 'partner');
  /**
   * §67: a sibling line equalises a pair onto one row, exactly as a partner
   * line does, and makes **no union** — a brother and a sister are not a couple
   * and there is no bar to hang children from. It does join two halves into one
   * component (unlike `kin`), because two people the archive calls siblings
   * belong on the same drawing.
   */
  const siblingEdges = edges.filter((edge) => edge.role === 'sibling');

  /* ------------------------------------------------- 1. the lineage DAG */
  const rawChildren = new Map<GraphNodeId, GraphNodeId[]>();
  for (const edge of parentEdges) push(rawChildren, edge.from, edge.to);

  /*
   * A depth-first walk, iterative because a line of four hundred generations
   * would blow a recursive one. Grey means "on the stack", so a line reaching a
   * grey node closes a loop: that line is a back edge and is left out of the
   * generations. It is still an edge — the caller draws it — it simply has no
   * say in who stands above whom, which is what keeps a cycle from hanging.
   */
  const WHITE = 0;
  const GREY = 1;
  const BLACK = 2;
  const colour = new Map<GraphNodeId, number>();
  const backEdges = new Set<string>();
  for (const root of nodes) {
    if ((colour.get(root.id) ?? WHITE) !== WHITE) continue;
    colour.set(root.id, GREY);
    const stack: { id: GraphNodeId; at: number }[] = [{ id: root.id, at: 0 }];
    while (stack.length) {
      const top = stack[stack.length - 1];
      const kids = rawChildren.get(top.id) ?? [];
      if (top.at >= kids.length) {
        colour.set(top.id, BLACK);
        stack.pop();
        continue;
      }
      const child = kids[top.at++];
      const state = colour.get(child) ?? WHITE;
      if (state === GREY) {
        backEdges.add(`${top.id}|${child}`);
        continue;
      }
      if (state === BLACK) continue;
      colour.set(child, GREY);
      stack.push({ id: child, at: 0 });
    }
  }

  const dagParents = new Map<GraphNodeId, GraphNodeId[]>();
  const dagChildren = new Map<GraphNodeId, GraphNodeId[]>();
  for (const edge of parentEdges) {
    if (backEdges.has(`${edge.from}|${edge.to}`)) continue;
    push(dagChildren, edge.from, edge.to);
    push(dagParents, edge.to, edge.from);
  }

  /* ------------------------------------------------- 2. the generations */
  const topo: GraphNodeId[] = [];
  {
    const indegree = new Map<GraphNodeId, number>();
    for (const node of nodes) indegree.set(node.id, (dagParents.get(node.id) ?? []).length);
    const queue = nodes.filter((node) => indegree.get(node.id) === 0).map((node) => node.id);
    for (let i = 0; i < queue.length; i++) {
      const id = queue[i];
      topo.push(id);
      for (const child of dagChildren.get(id) ?? []) {
        const left = (indegree.get(child) ?? 0) - 1;
        indegree.set(child, left);
        if (left === 0) queue.push(child);
      }
    }
    if (topo.length < nodes.length) {
      // Cannot happen once the back edges are out, but a topological order that
      // silently loses half the tree would be a very quiet bug.
      const have = new Set(topo);
      for (const node of nodes) if (!have.has(node.id)) topo.push(node.id);
    }
  }

  /*
   * §67: who is an ancestor of whom, on the DAG, computed once.
   *
   * A person can be both the parent *and* the partner of the same person (an
   * archive of gods is full of it), and a person can be recorded as somebody's
   * sibling *and* their child. The settle loop below equalises a partner pair
   * onto one row, which for such a pair fights the parent edge that puts one a
   * row below the other: the two pushed each other down ten rounds and the
   * couple ended up ten rows from everybody else. The rule is that **lineage
   * wins**: a partner or sibling line whose two ends are already joined by a
   * parent path has no say in the generations. It is still drawn.
   *
   * Reverse topological order, so a node's reach is the union of its children's
   * — one pass, and the DAG never changes while the generations settle.
   */
  const reach = new Map<GraphNodeId, Set<GraphNodeId>>();
  for (let i = topo.length - 1; i >= 0; i--) {
    const id = topo[i];
    const set = new Set<GraphNodeId>();
    for (const child of dagChildren.get(id) ?? []) {
      set.add(child);
      for (const further of reach.get(child) ?? []) set.add(further);
    }
    reach.set(id, set);
  }
  /** Is one of these two an ancestor of the other? */
  const alongLineage = (a: GraphNodeId, b: GraphNodeId) =>
    Boolean(reach.get(a)?.has(b)) || Boolean(reach.get(b)?.has(a));

  const floor = new Map<GraphNodeId, number>();
  const longestPath = (): Map<GraphNodeId, number> => {
    const gen = new Map<GraphNodeId, number>();
    for (const id of topo) {
      let value = floor.get(id) ?? 0;
      for (const parent of dagParents.get(id) ?? []) value = Math.max(value, (gen.get(parent) ?? 0) + 1);
      gen.set(id, value);
    }
    return gen;
  };

  /*
   * §67: a partner line and a sibling line both say "these two stand on one
   * row", so both are equalised here — and both stand aside where a parent path
   * already joins the pair, or the two rules would push each other down for
   * ever (`alongLineage` above).
   */
  const levelEdges = [...partnerEdges, ...siblingEdges].filter(
    (edge) => !alongLineage(edge.from, edge.to),
  );

  let generation = longestPath();
  for (let round = 0; round < SETTLE_ROUNDS; round++) {
    let moved = false;
    for (const edge of levelEdges) {
      const target = Math.max(generation.get(edge.from) ?? 0, generation.get(edge.to) ?? 0);
      for (const id of [edge.from, edge.to]) {
        if ((floor.get(id) ?? 0) < target) {
          floor.set(id, target);
          moved = true;
        }
      }
    }
    if (!moved) break;
    // A partner pulled down takes their children with them, so the longest path
    // is walked again rather than patched — that is the whole of "and after
    // pulling a partner up, its children must still be below it".
    generation = longestPath();
  }
  const genOf = (id: GraphNodeId) => generation.get(id) ?? 0;
  const maxGen = Math.max(...nodes.map((node) => genOf(node.id)));

  /* ------------------------------------------------------- 3. the unions */
  const unionsByKey = new Map<string, { id: string; parents: GraphNodeId[]; children: GraphNodeId[] }>();
  const unionOfChild = new Map<GraphNodeId, string>();
  for (const node of nodes) {
    const parents = [...(dagParents.get(node.id) ?? [])].sort();
    if (!parents.length) continue;
    const key = parents.join('|');
    let union = unionsByKey.get(key);
    if (!union) {
      union = { id: `u:${key}`, parents, children: [] };
      unionsByKey.set(key, union);
    }
    union.children.push(node.id);
    unionOfChild.set(node.id, union.id);
  }
  // A couple with no children between them is still a couple, and the bar is
  // what says so.
  for (const edge of partnerEdges) {
    const parents = [edge.from, edge.to].sort();
    const key = parents.join('|');
    if (unionsByKey.has(key)) continue;
    unionsByKey.set(key, { id: `u:${key}`, parents, children: [] });
  }
  const unionList = [...unionsByKey.values()];
  /** Sorted, because block-building must not depend on the order ids arrived in. */
  const unionsSorted = [...unionList].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  /* --------------------------------------------------- the components */
  const neighbours = new Map<GraphNodeId, GraphNodeId[]>();
  for (const edge of edges) {
    // §66: a `kin` line has no say in placement, so it does not even join two
    // otherwise unrelated halves into one component. §67: a `sibling` line
    // does — two people the archive calls brother and sister belong on the same
    // drawing, even when neither has a parent recorded.
    if (edge.role === 'kin') continue;
    push(neighbours, edge.from, edge.to);
    push(neighbours, edge.to, edge.from);
  }
  const componentOf = new Map<GraphNodeId, number>();
  const discovery = new Map<GraphNodeId, number>();
  const components: GraphNodeId[][] = [];
  {
    let seq = 0;
    for (const root of nodes) {
      if (discovery.has(root.id)) continue;
      const index = components.length;
      const members: GraphNodeId[] = [];
      const stack = [root.id];
      while (stack.length) {
        const id = stack.pop() as GraphNodeId;
        if (discovery.has(id)) continue;
        discovery.set(id, seq++);
        componentOf.set(id, index);
        members.push(id);
        const next = [...new Set(neighbours.get(id) ?? [])].sort(
          (a, b) => (inputOrder.get(a) ?? 0) - (inputOrder.get(b) ?? 0),
        );
        for (let i = next.length - 1; i >= 0; i--) if (!discovery.has(next[i])) stack.push(next[i]);
      }
      components.push(members);
    }
  }

  /* ------------------------------------------------------------ the rows */
  const rowHeight: number[] = new Array(maxGen + 1).fill(0);
  for (const node of nodes) {
    const g = genOf(node.id);
    rowHeight[g] = Math.max(rowHeight[g], node.height);
  }
  const rowY: number[] = new Array(maxGen + 1).fill(0);
  for (let g = 1; g <= maxGen; g++) rowY[g] = rowY[g - 1] + rowHeight[g - 1] + ROW_GAP;

  /**
   * The row broken into blocks: the parents of one union stand together, in the
   * order they already have, and everybody else is a block of one. A person with
   * two partners can only be next to one of them, so a union takes whichever of
   * its parents no earlier union has claimed.
   */
  const buildBlocks = (rowIds: GraphNodeId[]): { blocks: GraphNodeId[][]; blockOf: Map<GraphNodeId, number> } => {
    const inRow = new Set(rowIds);
    const group = new Map<GraphNodeId, string>();
    for (const union of unionsSorted) {
      const here = union.parents.filter((id) => inRow.has(id) && !group.has(id));
      if (here.length < 2) continue;
      for (const id of here) group.set(id, union.id);
    }
    const blocks: GraphNodeId[][] = [];
    const blockOf = new Map<GraphNodeId, number>();
    const started = new Map<string, number>();
    for (const id of rowIds) {
      const key = group.get(id);
      if (key === undefined) {
        blockOf.set(id, blocks.length);
        blocks.push([id]);
        continue;
      }
      const at = started.get(key);
      if (at === undefined) {
        started.set(key, blocks.length);
        blockOf.set(id, blocks.length);
        blocks.push([id]);
      } else {
        blockOf.set(id, at);
        blocks[at].push(id);
      }
    }
    return { blocks, blockOf };
  };

  const x = new Map<GraphNodeId, number>();
  const barX = new Map<string, number>();

  let componentLeft = 0;
  for (const members of components) {
    /* ---------------------------------------- 4. the order within a row */
    const rows: GraphNodeId[][] = new Array(maxGen + 1).fill(null).map(() => []);
    for (const id of [...members].sort((a, b) => (discovery.get(a) ?? 0) - (discovery.get(b) ?? 0))) {
      rows[genOf(id)].push(id);
    }

    const sweep = (direction: 'down' | 'up') => {
      const order =
        direction === 'down'
          ? Array.from({ length: maxGen }, (_, i) => i + 1)
          : Array.from({ length: maxGen }, (_, i) => maxGen - 1 - i);
      for (const g of order) {
        const rowIds = rows[g];
        const other = rows[g + (direction === 'down' ? -1 : 1)];
        if (!rowIds || rowIds.length < 2 || !other || !other.length) continue;
        const place = new Map(other.map((id, i) => [id, i]));
        const scale = other.length / rowIds.length;
        const bary = new Map<GraphNodeId, number>();
        rowIds.forEach((id, i) => {
          const linked = direction === 'down' ? dagParents.get(id) ?? [] : dagChildren.get(id) ?? [];
          const seen = linked
            .map((other2) => place.get(other2))
            .filter((value): value is number => value !== undefined);
          // Nobody in the neighbouring row: keep roughly where you are, on that
          // row's scale, rather than being swept to one end.
          bary.set(id, seen.length ? mean(seen) : i * scale);
        });
        const { blocks } = buildBlocks(rowIds);
        const scored = blocks.map((block, i) => ({
          block,
          i,
          score: mean(block.map((id) => bary.get(id) ?? 0)),
        }));
        scored.sort((a, b) => a.score - b.score || a.i - b.i);
        rows[g] = scored.flatMap((entry) =>
          entry.block
            .map((id, i) => ({ id, i }))
            .sort((a, b) => (bary.get(a.id) ?? 0) - (bary.get(b.id) ?? 0) || a.i - b.i)
            .map((item) => item.id),
        );
      }
    };
    sweep('down');
    sweep('down');
    sweep('up');
    sweep('up');

    /* --------------------------------------------------------- 5. the x */
    const gapBetween = (blockOf: Map<GraphNodeId, number>, a: GraphNodeId, b: GraphNodeId) =>
      blockOf.get(a) === blockOf.get(b) ? PARTNER_GAP : COL_GAP;

    for (let g = 0; g <= maxGen; g++) {
      const rowIds = rows[g];
      if (!rowIds.length) continue;
      const { blockOf } = buildBlocks(rowIds);
      let cursor = 0;
      let i = 0;
      while (i < rowIds.length) {
        // Siblings of one union move together, so they can be slid under their
        // bar as one thing.
        const union = unionOfChild.get(rowIds[i]);
        let j = i + 1;
        if (union) while (j < rowIds.length && unionOfChild.get(rowIds[j]) === union) j++;
        const run = rowIds.slice(i, j);

        let total = 0;
        for (let k = 0; k < run.length; k++) {
          if (k) total += gapBetween(blockOf, run[k - 1], run[k]);
          total += (byId.get(run[k]) as { width: number }).width;
        }
        const centre = union === undefined ? undefined : barX.get(union);
        // Centred under the bar where there is room; otherwise hard against
        // whoever is already standing to the left. Never to the left of them:
        // that is the "push right and propagate" rule, and `cursor` is it.
        let left = centre === undefined ? cursor : Math.max(cursor, centre - total / 2);
        for (let k = 0; k < run.length; k++) {
          if (k) left += gapBetween(blockOf, run[k - 1], run[k]);
          x.set(run[k], left);
          left += (byId.get(run[k]) as { width: number }).width;
        }
        cursor = left;
        if (j < rowIds.length) cursor += gapBetween(blockOf, rowIds[j - 1], rowIds[j]);
        i = j;
      }

      // Every union whose lowest parent has just been placed can have its bar.
      for (const union of unionList) {
        if (Math.max(...union.parents.map(genOf)) !== g) continue;
        const centres = union.parents
          .filter((id) => x.has(id))
          .map((id) => (x.get(id) as number) + (byId.get(id) as { width: number }).width / 2);
        if (!centres.length) continue;
        barX.set(union.id, mean(centres));
      }
    }

    /*
     * One pass back up: a couple with children sits over the middle of them,
     * as far as their neighbours in the row allow. Without it a wide fan of
     * children hangs off one shoulder of its parents.
     */
    for (let g = maxGen - 1; g >= 0; g--) {
      const rowIds = rows[g];
      if (!rowIds.length) continue;
      const { blocks } = buildBlocks(rowIds);
      const spans = blocks.map((block) => ({
        block,
        left: x.get(block[0]) as number,
        right: (x.get(block[block.length - 1]) as number) + (byId.get(block[block.length - 1]) as { width: number }).width,
      }));
      for (let bi = 0; bi < spans.length; bi++) {
        const span = spans[bi];
        const inBlock = new Set(span.block);
        const kids: GraphNodeId[] = [];
        for (const union of unionList) {
          if (!union.children.length) continue;
          if (!union.parents.every((id) => inBlock.has(id))) continue;
          for (const child of union.children) if (x.has(child)) kids.push(child);
        }
        if (!kids.length) continue;
        const wanted = mean(
          kids.map((id) => (x.get(id) as number) + (byId.get(id) as { width: number }).width / 2),
        );
        const width = span.right - span.left;
        const low = bi > 0 ? spans[bi - 1].right + COL_GAP : -Infinity;
        const high = bi < spans.length - 1 ? spans[bi + 1].left - COL_GAP - width : Infinity;
        if (low > high) continue;
        const left = Math.min(Math.max(wanted - width / 2, low), high);
        const shift = left - span.left;
        if (!shift) continue;
        for (const id of span.block) x.set(id, (x.get(id) as number) + shift);
        span.left += shift;
        span.right += shift;
      }
    }

    /* -------------------------------- stand this component beside the last */
    let minX = Infinity;
    let maxX = -Infinity;
    for (const id of members) {
      const left = x.get(id) ?? 0;
      minX = Math.min(minX, left);
      maxX = Math.max(maxX, left + (byId.get(id) as { width: number }).width);
    }
    if (Number.isFinite(minX)) {
      const shift = componentLeft - minX;
      for (const id of members) x.set(id, (x.get(id) as number) + shift);
      componentLeft = maxX + shift + COMPONENT_GAP;
    }
  }

  /* ------------------------------------------------------- the answer */
  const positions: Record<GraphNodeId, Placed> = {};
  for (const node of nodes) {
    const g = genOf(node.id);
    positions[node.id] = node.pinned
      ? { x: tidy(node.pinned.x), y: tidy(node.pinned.y), generation: g }
      : { x: tidy(x.get(node.id) ?? 0), y: tidy(rowY[g]), generation: g };
  }

  const unions: LayoutUnion[] = unionList.map((union) => {
    const lowest = Math.max(...union.parents.map(genOf));
    const centres = union.parents.map(
      (id) => positions[id].x + (byId.get(id) as { width: number }).width / 2,
    );
    return {
      id: union.id,
      parents: union.parents,
      children: union.children,
      x: tidy(mean(centres)),
      // The bar hangs half a row-gap under the row the lower parent stands in,
      // which is the same height for every union on that row — so the bars line
      // up even where two couples are drawn at different card heights.
      y: tidy(rowY[lowest] + rowHeight[lowest] + ROW_GAP / 2),
    };
  });

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const node of nodes) {
    const at = positions[node.id];
    minX = Math.min(minX, at.x);
    minY = Math.min(minY, at.y);
    maxX = Math.max(maxX, at.x + node.width);
    maxY = Math.max(maxY, at.y + node.height);
  }

  return {
    positions,
    unions,
    bounds: { minX: tidy(minX), minY: tidy(minY), maxX: tidy(maxX), maxY: tidy(maxY) },
  };
}

// ---------------------------------------------------------------------------
// What the canvas draws
// ---------------------------------------------------------------------------

export type Point = { x: number; y: number };

/**
 * One union, ready to stroke. Everything is an orthogonal polyline in world
 * coordinates: a parent drops from the bottom of its card to the bar, the bar
 * runs across, and a child rises from the bar to the top of its card. The canvas
 * turns these into `M`/`L` and nothing else — the geometry is decided here, in
 * a file a test can read.
 */
export type UnionGeometry = {
  unionId: string;
  /** Where the bar's centre is; where a "+" for a missing child would go. */
  bar: Point;
  /** The bar itself, from the leftmost parent's drop to the rightmost. Null for one parent. */
  span: { x1: number; x2: number; y: number } | null;
  parents: { id: GraphNodeId; points: Point[] }[];
  children: { id: GraphNodeId; points: Point[] }[];
  /**
   * A couple with nothing between them: no bar to speak of, just a short link
   * from one card to the other. Null whenever the union has children.
   */
  partnerLink: { x1: number; y1: number; x2: number; y2: number } | null;
};

/**
 * §67: one sibling line, ready to stroke. It hangs off no union — a brother and
 * a sister are not a couple — so it is its own little polyline in world
 * coordinates, and like everything else in this file it is decided here so a
 * test can read it.
 *
 * Two shapes, and which one you get depends only on where the two cards ended
 * up. **On one row** (the usual case, because the settle loop puts siblings
 * there) it is a straight segment across the gap between the facing edges, at
 * the height of the two cards' middles — the same reading `partnerLine` gives a
 * couple. **On two rows** — which happens when a parent path between the pair
 * won the argument (`alongLineage`), or a hand dragged one card away — it rises
 * from the top-centre of each card to a little above the higher of the two and
 * runs across, so the line reads as going *over* the row rather than through
 * whoever is standing between them.
 */
export type SiblingGeometry = {
  a: GraphNodeId;
  b: GraphNodeId;
  /** true when the two cards share a row and the link is the straight segment. */
  sameRow: boolean;
  /** The polyline, two points on one row and four across two. */
  points: Point[];
};

/** How far above the higher card a two-row sibling line arcs, in world px. */
export const SIBLING_RISE = 26;
/**
 * §67: two rises that would share a height and overlap in x are stacked this
 * far apart, or the longer line's hit stroke lies over the shorter one along
 * its whole length and the shorter one can never be pressed.
 */
export const SIBLING_LANE = 8;

export type TreeGeometry = { unions: UnionGeometry[]; siblings: SiblingGeometry[] };

/**
 * Every line a union draws. `sizes` is how big each node is drawn — the same
 * numbers handed to `layoutTree`, and asked for again rather than remembered so
 * a card that grew (an open blad, a long name) can be drawn against without
 * re-running the layout.
 *
 * A `kin` line is not here: it joins two cards directly and has no union, so the
 * canvas draws it with `curvePath` between whichever two points it likes.
 *
 * §67: `edges` is optional and only the `sibling` ones are read out of it — a
 * caller that draws no sibling lines may leave it out and gets an empty list.
 */
export function edgeGeometry(
  result: LayoutResult,
  sizes: Readonly<Record<GraphNodeId, { width: number; height: number }>>,
  edges: readonly { from: GraphNodeId; to: GraphNodeId; role: FieldRole }[] = [],
): TreeGeometry {
  const box = (id: GraphNodeId) => {
    const at = result.positions[id];
    const size = sizes[id];
    if (!at || !size) return null;
    return {
      cx: at.x + size.width / 2,
      cy: at.y + size.height / 2,
      top: at.y,
      bottom: at.y + size.height,
      left: at.x,
      right: at.x + size.width,
    };
  };

  const unions: UnionGeometry[] = [];
  for (const union of result.unions) {
    const barY = union.y;
    const parents: { id: GraphNodeId; points: Point[] }[] = [];
    const drops: number[] = [];
    for (const id of union.parents) {
      const at = box(id);
      if (!at) continue;
      drops.push(at.cx);
      const points: Point[] = [
        { x: tidy(at.cx), y: tidy(at.bottom) },
        { x: tidy(at.cx), y: tidy(barY) },
      ];
      if (Math.abs(at.cx - union.x) > 0.001) points.push({ x: tidy(union.x), y: tidy(barY) });
      parents.push({ id, points });
    }

    const children: { id: GraphNodeId; points: Point[] }[] = [];
    for (const id of union.children) {
      const at = box(id);
      if (!at) continue;
      const points: Point[] = [{ x: tidy(union.x), y: tidy(barY) }];
      if (Math.abs(at.cx - union.x) > 0.001) points.push({ x: tidy(at.cx), y: tidy(barY) });
      points.push({ x: tidy(at.cx), y: tidy(at.top) });
      children.push({ id, points });
    }

    let partnerLink: UnionGeometry['partnerLink'] = null;
    if (!children.length && union.parents.length === 2) {
      const a = box(union.parents[0]);
      const b = box(union.parents[1]);
      if (a && b) {
        const [leftBox, rightBox] = a.cx <= b.cx ? [a, b] : [b, a];
        const y = tidy((a.cy + b.cy) / 2);
        partnerLink = {
          x1: tidy(Math.min(leftBox.right, rightBox.left)),
          y1: y,
          x2: tidy(Math.max(leftBox.right, rightBox.left)),
          y2: y,
        };
      }
    }

    unions.push({
      unionId: union.id,
      bar: { x: tidy(union.x), y: tidy(barY) },
      span:
        drops.length > 1
          ? { x1: tidy(Math.min(...drops)), x2: tidy(Math.max(...drops)), y: tidy(barY) }
          : null,
      parents,
      children,
      partnerLink,
    });
  }

  /* ------------------------------------------------------- §67 the siblings */
  const siblings: SiblingGeometry[] = [];
  const seenPair = new Set<string>();
  for (const edge of edges) {
    if (!edge || edge.role !== 'sibling') continue;
    const [a, b] = [edge.from, edge.to].sort();
    if (a === b) continue;
    const key = `${a}|${b}`;
    if (seenPair.has(key)) continue;
    seenPair.add(key);
    const one = box(a);
    const two = box(b);
    if (!one || !two) continue;

    /*
     * §67: a line straight across the row is only honest when nothing stands
     * between the two. Siblings share a generation with everybody else born
     * in it, and the barycentre may well seat a cousin between them — under
     * whose card a straight line would run, invisible and unpressable. So a
     * pair with somebody in between rises over the row like a pair on two rows.
     */
    const sameGeneration = result.positions[a].generation === result.positions[b].generation;
    const sameRow = sameGeneration && !somebodyBetween(result, sizes, a, b, one, two);
    if (sameRow) {
      const [leftBox, rightBox] = one.cx <= two.cx ? [one, two] : [two, one];
      const y = tidy((one.cy + two.cy) / 2);
      const x1 = Math.min(leftBox.right, rightBox.left);
      const x2 = Math.max(leftBox.right, rightBox.left);
      siblings.push({
        a,
        b,
        sameRow: true,
        points: [
          { x: tidy(x1), y },
          { x: tidy(x2), y },
        ],
      });
      continue;
    }

    const riseY = tidy(Math.min(one.top, two.top) - SIBLING_RISE);
    siblings.push({
      a,
      b,
      sameRow: false,
      points: [
        { x: tidy(one.cx), y: tidy(one.top) },
        { x: tidy(one.cx), y: riseY },
        { x: tidy(two.cx), y: riseY },
        { x: tidy(two.cx), y: tidy(two.top) },
      ],
    });
  }

  laneSiblingRises(siblings);
  return { unions, siblings };
}

/**
 * §67: rises that share a height and overlap in x get lanes — greedy interval
 * colouring, shortest span first so the short lines stay low and the long
 * ones climb over them. Mutates the four-point polylines in place.
 */
export function laneSiblingRises(siblings: SiblingGeometry[]): void {
  const rising = siblings.filter((line) => !line.sameRow && line.points.length === 4);
  const byHeight = new Map<number, SiblingGeometry[]>();
  for (const line of rising) {
    const y = line.points[1].y;
    const group = byHeight.get(y) ?? [];
    group.push(line);
    byHeight.set(y, group);
  }
  for (const group of byHeight.values()) {
    if (group.length < 2) continue;
    const spans = group
      .map((line) => ({
        line,
        from: Math.min(line.points[1].x, line.points[2].x),
        to: Math.max(line.points[1].x, line.points[2].x),
      }))
      .sort((l, r) => l.to - l.from - (r.to - r.from) || l.from - r.from);
    const lanes: { from: number; to: number }[][] = [];
    for (const span of spans) {
      let lane = lanes.findIndex((taken) => taken.every((other) => span.to <= other.from || span.from >= other.to));
      if (lane < 0) {
        lane = lanes.length;
        lanes.push([]);
      }
      lanes[lane].push({ from: span.from, to: span.to });
      if (lane === 0) continue;
      const y = tidy(span.line.points[1].y - SIBLING_LANE * lane);
      span.line.points[1] = { x: span.line.points[1].x, y };
      span.line.points[2] = { x: span.line.points[2].x, y };
    }
  }
}

/** §67: does another card on the same generation row stand between these two? */
function somebodyBetween(
  result: LayoutResult,
  sizes: Record<GraphNodeId, { width: number; height: number }>,
  a: GraphNodeId,
  b: GraphNodeId,
  one: { left: number; right: number; cx: number },
  two: { left: number; right: number; cx: number },
): boolean {
  const generation = result.positions[a].generation;
  const from = Math.min(one.right, two.right);
  const to = Math.max(one.left, two.left);
  if (to <= from) return false;
  for (const [id, placed] of Object.entries(result.positions)) {
    if (id === a || id === b || placed.generation !== generation) continue;
    const size = sizes[id];
    if (!size) continue;
    const left = placed.x;
    const right = placed.x + size.width;
    if (right > from && left < to) return true;
  }
  return false;
}

/**
 * The short double line between two people who are a couple, drawn straight
 * across the gap between the two cards at the height of their middles.
 *
 * `edgeGeometry` already gives a childless union its `partnerLink`, but a couple
 * *with* children has none — its bar is the thing that says they are together —
 * and the canvas still draws the partner line, because a line is what a reader
 * clicks to take one away. So this is the same segment, asked for per pair
 * rather than per union, and it is here rather than in the component for the
 * one reason every other number in this file is: a test can read it.
 *
 * The two ends are the *facing* edges — right of the left card, left of the
 * right card — so the line never runs underneath either of them. Two cards that
 * overlap (a hand dragged one on top of the other) give a segment of nothing at
 * the point where they meet, which is the honest drawing of that.
 */
export type Box = { x: number; y: number; width: number; height: number };

export function partnerLine(a: Box, b: Box): { x1: number; y1: number; x2: number; y2: number } {
  const [left, right] = a.x + a.width / 2 <= b.x + b.width / 2 ? [a, b] : [b, a];
  const y = tidy((a.y + a.height / 2 + (b.y + b.height / 2)) / 2);
  const x1 = left.x + left.width;
  const x2 = right.x;
  return { x1: tidy(Math.min(x1, x2)), y1: y, x2: tidy(Math.max(x1, x2)), y2: y };
}

/** The middle of a card, where a `kin` bow starts and ends. */
export function boxCentre(box: Box): Point {
  return { x: tidy(box.x + box.width / 2), y: tidy(box.y + box.height / 2) };
}

/** §67: how far below the lower of two cards a handle that belongs to both sits. */
export const BETWEEN_GAP = 44;

/**
 * §67: where a control that belongs to **two** cards goes.
 *
 * The shared "Kind van beide toevoegen" handle is the one thing on a stamboom
 * that is not attached to a single card, so it cannot hang off a box the way
 * the other four handles do. It sits between the two centres — halfway, whether
 * the pair are side by side or one is dragged far off — and *below the lower of
 * the two*, which is where the child it makes is going to appear. Below the
 * higher one would put it on top of whoever is standing between them.
 *
 * Pure, and here rather than in the component, for the reason every other
 * number in this file is: a test can read it.
 */
export function betweenBoxes(a: Box, b: Box, gap: number = BETWEEN_GAP): Point {
  return {
    x: tidy((a.x + a.width / 2 + (b.x + b.width / 2)) / 2),
    y: tidy(Math.max(a.y + a.height, b.y + b.height) + gap),
  };
}

/**
 * §67: the middle of a polyline, where its word is written.
 *
 * Not the average of the points — that drifts towards whichever end has the
 * most corners in it, and a four-point sibling line across two rows has three
 * of them on one side. This walks the line and answers the point at half its
 * length, so the word sits where a reader would say the middle is.
 */
export function polylineMidpoint(points: readonly Point[]): Point {
  if (!points.length) return { x: 0, y: 0 };
  if (points.length === 1) return { x: tidy(points[0].x), y: tidy(points[0].y) };
  let total = 0;
  for (let i = 1; i < points.length; i += 1) {
    total += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
  }
  if (total <= 0) return { x: tidy(points[0].x), y: tidy(points[0].y) };
  let walked = 0;
  for (let i = 1; i < points.length; i += 1) {
    const step = Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
    if (walked + step >= total / 2) {
      const t = step > 0 ? (total / 2 - walked) / step : 0;
      return {
        x: tidy(points[i - 1].x + (points[i].x - points[i - 1].x) * t),
        y: tidy(points[i - 1].y + (points[i].y - points[i - 1].y) * t),
      };
    }
    walked += step;
  }
  const last = points[points.length - 1];
  return { x: tidy(last.x), y: tidy(last.y) };
}

// ---------------------------------------------------------------------------
// The viewport — pan and zoom, moved out in §67
// ---------------------------------------------------------------------------

/*
 * §67: the four sums that put the glass over the world now live in
 * `lib/canvas/view.ts`, because the prikbord was doing them by hand as well and
 * the next canvas would have been the third. Nothing about them was ever
 * particular to a stamboom.
 *
 * They are re-exported here under the names the tree has always used —
 * `TreeView`, `isTreeView` — so the canvas, and the tests that already stand on
 * this file, did not have to move to follow them.
 */
export {
  FIT_PADDING,
  MAX_ZOOM,
  MIN_ZOOM,
  clampZoom,
  fitViewport,
  isCanvasView as isTreeView,
  toWorld,
  zoomAbout,
} from '@/lib/canvas/view';
export type { CanvasView as TreeView } from '@/lib/canvas/view';

/**
 * A gentle bow between two points, for a `kin` line — the one line in a stamboom
 * that is not part of the grid, so it is drawn as a curve to say so. The bow is
 * a fifth of the distance, capped, and always on the same side of the line, so
 * two people joined both ways get two curves rather than one on top of another.
 */
export function curvePath(ax: number, ay: number, bx: number, by: number): string {
  const dx = bx - ax;
  const dy = by - ay;
  const length = Math.hypot(dx, dy);
  if (!length) return `M ${tidy(ax)} ${tidy(ay)}`;
  const bow = Math.min(60, length * 0.2);
  const cx = (ax + bx) / 2 + (-dy / length) * bow;
  const cy = (ay + by) / 2 + (dx / length) * bow;
  return `M ${tidy(ax)} ${tidy(ay)} Q ${tidy(cx)} ${tidy(cy)} ${tidy(bx)} ${tidy(by)}`;
}
