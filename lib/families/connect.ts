/**
 * Golf M — slepen om te verbinden.
 *
 * A `+` handle on a stamboom opens a kiezer when it is clicked. Dragged, it
 * pulls a line out of the card, and letting go on another card draws that
 * relation directly — the kiezer skipped, because the answer is already under
 * the hand. Whether a card is a fair place to let go is decided here, and a
 * card that is not is simply not lit while the line is over it: dropping there
 * does nothing, as dropping on bare paper does nothing.
 *
 * Four refusals, and they are the whole list:
 *
 *  - **self** — nobody is their own parent, partner or sister;
 *  - **exists** — the very line is already drawn (the parent is already the
 *    parent; the two are already partners). Writing it again would be a no-op
 *    that looked like a gesture;
 *  - **cycle** — making somebody the parent of their own ancestor, or the child
 *    of their own descendant. The archive does not refuse it on write (the
 *    layout survives a back edge), but no hand dragging a line means it;
 *  - **ghost** is *not* a refusal: a schim is somebody the archive already
 *    names, and connecting to one puts them in the tree as well, the way the
 *    kiezer does.
 *
 * Pure, so the canvas and a test read one answer.
 */
import { walkLine, type LineageEdge } from './lineage';

/** The four `+`s. The same words `TreeHandles` uses for them. */
export type ConnectRole = 'parent' | 'child' | 'partner' | 'sibling';

export type ConnectVerdict = 'ok' | 'self' | 'exists' | 'cycle';

export function connectVerdict(input: {
  /** The card the handle belongs to. */
  source: string;
  /** The card under the hand. */
  target: string;
  /** Which handle: `parent` makes the *target* the source's parent, and so on. */
  role: ConnectRole;
  edges: readonly LineageEdge[];
}): ConnectVerdict {
  const { source, target, role, edges } = input;
  if (source === target) return 'self';

  for (const edge of edges) {
    const joins =
      (edge.from === source && edge.to === target) || (edge.from === target && edge.to === source);
    if (!joins) continue;
    if (role === 'partner' && edge.role === 'partner') return 'exists';
    if (role === 'sibling' && edge.role === 'sibling') return 'exists';
    const pair =
      edge.role === 'parent' ? [edge.from, edge.to] : edge.role === 'child' ? [edge.to, edge.from] : null;
    if (!pair) continue;
    const [parent, child] = pair;
    if (role === 'parent' && parent === target && child === source) return 'exists';
    if (role === 'child' && parent === source && child === target) return 'exists';
  }

  if (role === 'parent' && walkLine(edges, source, 'down').has(target)) return 'cycle';
  if (role === 'child' && walkLine(edges, source, 'up').has(target)) return 'cycle';
  return 'ok';
}

export function isConnectTarget(input: Parameters<typeof connectVerdict>[0]): boolean {
  return connectVerdict(input) === 'ok';
}
