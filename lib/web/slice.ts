import {
  WEB_DEPTH_MAX,
  WEB_DEPTH_MIN,
  WEB_FOCUS_NODE_LIMIT,
  type WebEdge,
  type WebEdgeKind,
  type WebGraph,
  type WebNode,
  type WebNodeId,
} from './types';

/**
 * §43: cutting a focus graph out of the whole web.
 *
 * Pure, and shared: the API slices on the server for a caller that asks for
 * `?focus=`, and the page slices again in the browser every time the depth
 * stepper or a legend tick changes — which is why turning the depth from 1 to
 * 3 is instant rather than a round trip. Both sides run the same function, so
 * the two can never disagree about what depth 2 means.
 *
 * The walk is breadth-first and *undirected*: a dossier holding the artikel is
 * as much one step away as an artikel the text names. Direction is remembered
 * on the node instead, as the side it was first reached from — `in` for a node
 * that points at the focus, `out` for one the focus points at — and a node
 * found deeper inherits the side of the node it was found through. That is
 * what the column layout draws: pointing-at on the left, pointed-to on the
 * right, exactly as Unreal's reference viewer does. A node reachable both ways
 * is placed once, on the side that found it first (the shorter path wins, and
 * `out` wins a tie), and the edge from the other side is drawn across the
 * middle rather than the node being drawn twice.
 *
 * Every edge between two included nodes is kept, not only the ones the walk
 * came in by, so a triangle stays a triangle.
 */

export type SliceOptions = {
  /** Edge kinds the legend has ticked off. */
  hiddenKinds?: ReadonlySet<WebEdgeKind>;
  /** Loose notities on prikborden — off unless asked for. */
  showNotes?: boolean;
  /** A ceiling on nodes; the walk stops and `truncated` is set. */
  limit?: number;
};

export function clampDepth(input: unknown): number {
  const n = typeof input === 'number' ? input : Number.parseInt(String(input ?? ''), 10);
  if (!Number.isFinite(n)) return WEB_DEPTH_MIN;
  return Math.min(WEB_DEPTH_MAX, Math.max(WEB_DEPTH_MIN, Math.round(n)));
}

/** The edges that survive the legend and the notes switch. */
export function visibleEdges(graph: WebGraph, options: SliceOptions = {}): WebEdge[] {
  const hidden = options.hiddenKinds;
  const showNotes = Boolean(options.showNotes);
  const noteIds = showNotes ? null : new Set(graph.nodes.filter((n) => n.kind === 'note').map((n) => n.id));
  return graph.edges.filter((edge) => {
    if (hidden?.has(edge.kind)) return false;
    if (noteIds && (noteIds.has(edge.from) || noteIds.has(edge.to))) return false;
    return true;
  });
}

/** The whole web with the legend applied: what the global view draws. */
export function filterGraph(graph: WebGraph, options: SliceOptions = {}): WebGraph {
  const edges = visibleEdges(graph, options);
  const showNotes = Boolean(options.showNotes);
  const nodes = graph.nodes.filter((node) => showNotes || node.kind !== 'note');
  return { nodes, edges };
}

export function focusSlice(
  graph: WebGraph,
  focus: WebNodeId,
  depthInput: number,
  options: SliceOptions = {},
): WebGraph {
  const depth = clampDepth(depthInput);
  const limit = options.limit ?? WEB_FOCUS_NODE_LIMIT;
  const byId = new Map(graph.nodes.map((node) => [node.id, node] as const));
  const start = byId.get(focus);
  if (!start) return { nodes: [], edges: [], focus, depth };

  const edges = visibleEdges(graph, options);
  const adjacency = new Map<WebNodeId, WebEdge[]>();
  for (const edge of edges) {
    if (!byId.has(edge.from) || !byId.has(edge.to)) continue;
    (adjacency.get(edge.from) ?? adjacency.set(edge.from, []).get(edge.from)!).push(edge);
    (adjacency.get(edge.to) ?? adjacency.set(edge.to, []).get(edge.to)!).push(edge);
  }

  type Placed = { depth: number; side: 'in' | 'out' | undefined };
  const placed = new Map<WebNodeId, Placed>([[focus, { depth: 0, side: undefined }]]);
  let frontier: WebNodeId[] = [focus];
  let truncated = false;

  for (let step = 1; step <= depth && frontier.length; step++) {
    const next: WebNodeId[] = [];
    // `out` before `in` at every step, so a tie at the same depth lands on
    // the right — the side that reads as "what this leads to".
    const found: { id: WebNodeId; side: 'in' | 'out' }[] = [];
    for (const id of frontier) {
      const parent = placed.get(id)!;
      for (const edge of adjacency.get(id) ?? []) {
        const other = edge.from === id ? edge.to : edge.from;
        if (other === id) continue;
        const side: 'in' | 'out' =
          parent.side ?? (edge.kind === 'thread' ? 'out' : edge.from === id ? 'out' : 'in');
        found.push({ id: other, side });
      }
    }
    found.sort((a, b) => (a.side === b.side ? 0 : a.side === 'out' ? -1 : 1));
    for (const item of found) {
      if (placed.has(item.id)) continue;
      if (placed.size >= limit) {
        truncated = true;
        break;
      }
      placed.set(item.id, { depth: step, side: item.side });
      next.push(item.id);
    }
    if (truncated) break;
    frontier = next;
  }

  const nodes: WebNode[] = [];
  for (const [id, info] of placed) {
    const node = byId.get(id)!;
    nodes.push({ ...node, depth: info.depth, side: info.side });
  }
  const kept = edges.filter((edge) => placed.has(edge.from) && placed.has(edge.to));
  return { nodes, edges: kept, focus, depth, ...(truncated ? { truncated: true } : {}) };
}

/** How many edges touch each node, over the whole graph — for node size. */
export function degrees(graph: WebGraph): Map<WebNodeId, number> {
  const out = new Map<WebNodeId, number>();
  for (const edge of graph.edges) {
    out.set(edge.from, (out.get(edge.from) ?? 0) + 1);
    out.set(edge.to, (out.get(edge.to) ?? 0) + 1);
  }
  return out;
}
