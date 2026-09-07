import type { WebGraph, WebNodeId } from './types';

/**
 * §43: the column layout of a focus graph — the focus in the middle, what
 * points at it in columns to the left, what it points at in columns to the
 * right, one column per step. The shape Unreal's reference viewer draws, and
 * for the same reason: with a hundred lines on screen, a reader has to be able
 * to say "everything left of the middle leads here, everything right of it
 * leads away" without following a single line.
 *
 * Pure geometry, no DOM. The renderer only draws what comes out.
 *
 * Two things are decided here and nowhere else:
 *
 * 1. **Order within a column** is by barycentre: each node sits at the average
 *    height of its neighbours in the column one step closer to the focus,
 *    swept outward and then back inward a few times. Not optimal — crossing
 *    minimisation is NP-hard — but it takes a tangle of forty lines down to a
 *    handful of crossings at no cost anyone can measure.
 * 2. **A column has a ceiling.** Past `columnLimit` nodes the rest fold into
 *    one `more` row ("… nog 140"), which the page can unfold per column.
 *    Without it a well-connected dossier at depth 2 draws a column three
 *    screens tall and every line into it is a needle. The nodes that stay
 *    visible are the best-connected ones; the fold is a row like any other, so
 *    the lines into it still land somewhere.
 */

export const COLUMN_NODE_W = 188;
export const COLUMN_NODE_H = 36;
export const COLUMN_GAP_X = 130;
export const COLUMN_GAP_Y = 14;
export const FOCUS_NODE_W = 240;
export const FOCUS_NODE_H = 56;
/**
 * Round 17: 40 → 28. With fifteen artikelen per soort, every column at depth 2
 * ran past forty, and a fit that had to show forty rows shrank the cards to
 * needles. Twenty-eight rows fit a laptop window at a legible zoom; the fold
 * row keeps the rest one double-click away.
 */
export const DEFAULT_COLUMN_LIMIT = 28;

export type LaidNode = {
  id: WebNodeId;
  column: number;
  x: number;
  y: number;
  width: number;
  height: number;
};

/** A folded remainder: `count` nodes of `column` that are not drawn. */
export type FoldRow = {
  id: string;
  column: number;
  count: number;
  /** The ids folded away, so the page can name them or unfold them. */
  hidden: WebNodeId[];
  x: number;
  y: number;
  width: number;
  height: number;
};

export type ColumnLayout = {
  nodes: LaidNode[];
  folds: FoldRow[];
  /** Which of the graph's edges end in a fold instead of a node, by edge id → fold id. */
  edgeToFold: Map<string, { from?: string; to?: string }>;
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
};

export type ColumnLayoutOptions = {
  columnLimit?: number;
  /** Columns the page has unfolded. */
  expanded?: ReadonlySet<number>;
};

export function foldId(column: number): string {
  return `more:${column}`;
}

export function columnLayout(graph: WebGraph, options: ColumnLayoutOptions = {}): ColumnLayout {
  const limit = options.columnLimit ?? DEFAULT_COLUMN_LIMIT;
  const expanded = options.expanded ?? new Set<number>();
  const focus = graph.focus;
  const empty: ColumnLayout = { nodes: [], folds: [], edgeToFold: new Map(), bounds: { minX: 0, minY: 0, maxX: 0, maxY: 0 } };
  if (!focus) return empty;

  const columnOf = new Map<WebNodeId, number>();
  const degree = new Map<WebNodeId, number>();
  for (const node of graph.nodes) {
    const depth = node.depth ?? 0;
    const column = node.id === focus ? 0 : node.side === 'in' ? -depth : depth;
    columnOf.set(node.id, column);
    degree.set(node.id, node.degree);
  }

  // Neighbours, for the barycentre sweep.
  const neighbours = new Map<WebNodeId, WebNodeId[]>();
  const add = (a: WebNodeId, b: WebNodeId) => {
    (neighbours.get(a) ?? neighbours.set(a, []).get(a)!).push(b);
  };
  for (const edge of graph.edges) {
    if (!columnOf.has(edge.from) || !columnOf.has(edge.to)) continue;
    add(edge.from, edge.to);
    add(edge.to, edge.from);
  }

  // Group by column, best-connected first, so a fold keeps the hubs.
  const columns = new Map<number, WebNodeId[]>();
  for (const [id, column] of columnOf) {
    (columns.get(column) ?? columns.set(column, []).get(column)!).push(id);
  }
  const folds: FoldRow[] = [];
  const foldedInto = new Map<WebNodeId, string>();
  for (const [column, ids] of columns) {
    ids.sort((a, b) => (degree.get(b) ?? 0) - (degree.get(a) ?? 0) || a.localeCompare(b));
    if (column === 0 || expanded.has(column) || ids.length <= limit) continue;
    const kept = ids.slice(0, limit - 1);
    const hidden = ids.slice(limit - 1);
    const id = foldId(column);
    for (const h of hidden) foldedInto.set(h, id);
    folds.push({ id, column, count: hidden.length, hidden, x: 0, y: 0, width: COLUMN_NODE_W, height: COLUMN_NODE_H });
    columns.set(column, kept);
  }

  // Barycentre ordering. Positions are indices within the column; the sweep
  // goes 0 → outward, then outward → 0, twice.
  const order = new Map<WebNodeId, number>();
  const sortedColumns = [...columns.keys()].sort((a, b) => a - b);
  for (const column of sortedColumns) {
    columns.get(column)!.forEach((id, index) => order.set(id, index));
  }
  const rowsOf = (id: WebNodeId, towards: number): number[] =>
    (neighbours.get(id) ?? [])
      .filter((other) => columnOf.get(other) === towards && order.has(other))
      .map((other) => order.get(other)!);
  const sweep = (column: number, towards: number) => {
    const ids = columns.get(column);
    if (!ids || ids.length < 2) return;
    const key = new Map<WebNodeId, number>();
    for (const id of ids) {
      const rows = rowsOf(id, towards);
      key.set(id, rows.length ? rows.reduce((a, b) => a + b, 0) / rows.length : order.get(id)!);
    }
    ids.sort((a, b) => key.get(a)! - key.get(b)! || (degree.get(b) ?? 0) - (degree.get(a) ?? 0));
    ids.forEach((id, index) => order.set(id, index));
  };
  const positives = sortedColumns.filter((c) => c > 0); // 1, 2, 3 …
  const negatives = sortedColumns.filter((c) => c < 0).reverse(); // -1, -2, -3 …
  const has = (c: number) => columns.has(c);
  for (let pass = 0; pass < 2; pass++) {
    // Outward: each column settles against the one nearer the focus …
    for (const c of positives) sweep(c, c - 1);
    for (const c of negatives) sweep(c, c + 1);
    // … then inward: against the one further out, where there is one.
    for (const c of [...positives].reverse()) if (has(c + 1)) sweep(c, c + 1);
    for (const c of [...negatives].reverse()) if (has(c - 1)) sweep(c, c - 1);
  }

  // Coordinates. Column 0 holds one wide node; every other column stacks its
  // rows (and its fold, last) and is centred on the focus's midline.
  const nodes: LaidNode[] = [];
  let minX = 0;
  let maxX = 0;
  let minY = 0;
  let maxY = 0;
  const stride = COLUMN_NODE_W + COLUMN_GAP_X;
  for (const column of sortedColumns) {
    const ids = columns.get(column)!;
    const fold = folds.find((f) => f.column === column);
    const rows = ids.length + (fold ? 1 : 0);
    const isFocus = column === 0;
    const w = isFocus ? FOCUS_NODE_W : COLUMN_NODE_W;
    const h = isFocus ? FOCUS_NODE_H : COLUMN_NODE_H;
    const total = rows * h + (rows - 1) * COLUMN_GAP_Y;
    const x = column * stride + (column === 0 ? 0 : column > 0 ? (FOCUS_NODE_W - COLUMN_NODE_W) / 2 : -(FOCUS_NODE_W - COLUMN_NODE_W) / 2);
    let y = -total / 2;
    for (const id of ids) {
      nodes.push({ id, column, x, y: y + h / 2, width: w, height: h });
      y += h + COLUMN_GAP_Y;
    }
    if (fold) {
      fold.x = x;
      fold.y = y + h / 2;
    }
    minX = Math.min(minX, x - w / 2);
    maxX = Math.max(maxX, x + w / 2);
    minY = Math.min(minY, -total / 2);
    maxY = Math.max(maxY, total / 2);
  }

  const edgeToFold = new Map<string, { from?: string; to?: string }>();
  for (const edge of graph.edges) {
    const from = foldedInto.get(edge.from);
    const to = foldedInto.get(edge.to);
    if (from || to) edgeToFold.set(edge.id, { ...(from ? { from } : {}), ...(to ? { to } : {}) });
  }

  return { nodes, folds, edgeToFold, bounds: { minX, minY, maxX, maxY } };
}
