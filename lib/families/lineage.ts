/**
 * Golf M — de bloedlijn van één kaartje.
 *
 * With exactly one card chosen on a stamboom, everybody outside that person's
 * direct line is gently dimmed, so a family of forty reads as the eight who
 * matter to the one you are looking at. What counts as the line is decided
 * here, and it is deliberately narrow:
 *
 *  - the person;
 *  - every **ancestor** (parents, their parents, …) and every **descendant**;
 *  - the person's **partners** — the other half of the bar their children hang
 *    from;
 *  - and the partners of the **descendants**, for the same reason one
 *    generation down: a grandchild has two parents, and dimming one of them
 *    made the bar above the grandchild look like it hung from nobody.
 *
 * Brothers, sisters, aunts and cousins stay dimmed: they are family, and they
 * are not *this person's line*. A `kin` bow and a sibling line are never
 * walked. A line is lit only when both its ends are.
 *
 * Pure, over the graph's own edges, so the canvas and a test read the same set.
 */
import type { FieldRole } from './types';

export type LineageEdge = { from: string; to: string; role: FieldRole };

/**
 * A parent edge as `[parent, child]`, or null for any other role. A `child`
 * edge is a `parent` edge the other way round — the canvas's own reading
 * (`lines` in `FamilyTreeCanvas`), repeated here so both agree.
 */
export function parentPair(edge: LineageEdge): [string, string] | null {
  if (edge.role === 'parent') return [edge.from, edge.to];
  if (edge.role === 'child') return [edge.to, edge.from];
  return null;
}

/** Everybody reachable from `start` by walking parent edges in one direction. */
export function walkLine(edges: readonly LineageEdge[], start: string, direction: 'up' | 'down'): Set<string> {
  const next = new Map<string, string[]>();
  for (const edge of edges) {
    const pair = parentPair(edge);
    if (!pair) continue;
    const [parent, child] = pair;
    const [key, value] = direction === 'up' ? [child, parent] : [parent, child];
    const list = next.get(key);
    if (list) list.push(value);
    else next.set(key, [value]);
  }
  const seen = new Set<string>();
  const queue = [start];
  while (queue.length) {
    const at = queue.shift()!;
    for (const other of next.get(at) ?? []) {
      // A cycle in the archive (somebody their own grandparent) ends the walk
      // rather than the page: `seen` is what stops it.
      if (other === start || seen.has(other)) continue;
      seen.add(other);
      queue.push(other);
    }
  }
  return seen;
}

function partnersOf(edges: readonly LineageEdge[], ids: ReadonlySet<string>): Set<string> {
  const out = new Set<string>();
  for (const edge of edges) {
    if (edge.role !== 'partner') continue;
    if (ids.has(edge.from)) out.add(edge.to);
    if (ids.has(edge.to)) out.add(edge.from);
  }
  return out;
}

/** The set of card ids in `focus`'s line, `focus` included. */
export function lineageOf(edges: readonly LineageEdge[], focus: string): Set<string> {
  const ancestors = walkLine(edges, focus, 'up');
  const descendants = walkLine(edges, focus, 'down');
  const out = new Set<string>([focus, ...ancestors, ...descendants]);
  for (const id of partnersOf(edges, new Set([focus, ...descendants]))) out.add(id);
  return out;
}

/** Whether a line belongs to the lit part of the picture. */
export function edgeInLineage(edge: { from: string; to: string }, lineage: ReadonlySet<string>): boolean {
  return lineage.has(edge.from) && lineage.has(edge.to);
}
