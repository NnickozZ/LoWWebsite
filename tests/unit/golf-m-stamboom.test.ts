import { describe, expect, it } from 'vitest';
import { createUndoStack } from '@/components/canvas/undoStack';
import { connectVerdict, isConnectTarget } from '@/lib/families/connect';
import { edgeInLineage, lineageOf, parentPair, walkLine, type LineageEdge } from '@/lib/families/lineage';
import {
  invertOp,
  isEmptyStep,
  oppositeStep,
  outcomeOf,
  redoOps,
  undoOps,
  walkNotice,
  type RelationOp,
  type TreeStep,
} from '@/lib/families/undoSteps';
import { DEFAULT_WORDS, WORD_MAX } from '@/lib/words';

/**
 * Golf M — de stamboom: terug, vooruit, een lijn uit een `+`, en de bloedlijn.
 *
 * The four pure halves of the round, without a canvas round them: the stack
 * that learnt the other direction (additively — the old four methods behave
 * as they did), what one step on a stamboom *is* and how it walks, which card
 * a line pulled out of a `+` may land on, and who belongs to one person's line.
 */

const op = (entryId: string, targetId: string, add: boolean, fieldKey = 'kinderen'): RelationOp => ({
  entryId,
  fieldKey,
  targetId,
  add,
});

describe('golf M: de ongedaan-stapel kan ook vooruit', () => {
  it('keeps the old four methods exactly as they were', () => {
    const stack = createUndoStack<string>();
    stack.push('a');
    stack.push('b');
    expect(stack.size()).toBe(2);
    expect(stack.pop()).toBe('b');
    expect(stack.pop()).toBe('a');
    expect(stack.pop()).toBeUndefined();
  });

  it('peeks without taking', () => {
    const stack = createUndoStack<string>();
    expect(stack.peek()).toBeUndefined();
    stack.push('a');
    expect(stack.peek()).toBe('a');
    expect(stack.size()).toBe(1);
  });

  it('walks back and forward, and a fresh step forgets what could be redone', () => {
    const stack = createUndoStack<string>();
    stack.push('a');
    stack.push('b');
    stack.pushRedo(stack.pop()!);
    expect(stack.redoSize()).toBe(1);
    // A redo puts its step back on the undo side and keeps the rest of the branch.
    stack.pushRedo('c');
    stack.pushFromRedo(stack.popRedo()!);
    expect(stack.redoSize()).toBe(1);
    expect(stack.peek()).toBe('c');
    // Something new: the old branch is gone.
    stack.push('d');
    expect(stack.redoSize()).toBe(0);
    expect(stack.popRedo()).toBeUndefined();
  });

  it('caps the redo side the same way, and clear forgets both', () => {
    const stack = createUndoStack<number>(2);
    for (const value of [1, 2, 3]) stack.pushRedo(value);
    expect(stack.redoSize()).toBe(2);
    expect(stack.popRedo()).toBe(3);
    stack.push(9);
    stack.clear();
    expect(stack.size()).toBe(0);
    expect(stack.redoSize()).toBe(0);
  });
});

describe('golf M: één stap op een stamboom', () => {
  it('undoes the relations inverted, last first — and redoes them as they were', () => {
    const step: TreeStep<string> = { relations: [op('a', 'b', true), op('a', 'c', false)] };
    expect(undoOps(step)).toEqual([op('a', 'c', true), op('a', 'b', false)]);
    expect(redoOps(step)).toEqual(step.relations);
    expect(invertOp(op('x', 'y', true)).add).toBe(false);
  });

  it('a step with neither a document nor a relation is nothing', () => {
    expect(isEmptyStep({ relations: [] })).toBe(true);
    expect(isEmptyStep({ state: 's', relations: [] })).toBe(false);
    expect(isEmptyStep({ relations: [op('a', 'b', false)] })).toBe(false);
  });

  it('reads the road’s answer as an outcome', () => {
    expect(outcomeOf('saved', true)).toBe('landed');
    expect(outcomeOf(undefined, true)).toBe('landed');
    expect(outcomeOf('pending', true)).toBe('proposed');
    expect(outcomeOf('unchanged', true)).toBe('unchanged');
    expect(outcomeOf('saved', false)).toBe('refused');
  });

  it('the step left for a redo holds the document of now, and only what landed', () => {
    const step: TreeStep<string> = { state: 'before', relations: [op('a', 'b', false), op('c', 'd', true)] };
    const sent = undoOps(step); // [c→d removed, a→b added]
    const redo = oppositeStep(step, 'now', sent, ['landed', 'unchanged'], 'undo');
    expect(redo.state).toBe('now');
    // Only c→d's undo landed; stored the step's own way round: c→d *added*.
    expect(redo.relations).toEqual([op('c', 'd', true)]);
  });

  it('a relation-only step leaves a relation-only step', () => {
    const step: TreeStep<string> = { relations: [op('a', 'b', false)] };
    const sent = redoOps(step);
    const back = oppositeStep(step, 'now', sent, ['landed'], 'redo');
    expect(back).toEqual({ relations: [op('a', 'b', false)] });
    const nothing = oppositeStep(step, 'now', sent, ['refused'], 'redo');
    expect(isEmptyStep(nothing)).toBe(true);
  });

  it('says the worst news once, and nothing when everything landed', () => {
    expect(walkNotice(['landed', 'landed'])).toBeNull();
    expect(walkNotice(['landed', 'unchanged'])).toBe('unchanged');
    expect(walkNotice(['unchanged', 'proposed'])).toBe('proposed');
    expect(walkNotice(['proposed', 'refused', 'unchanged'])).toBe('refused');
  });
});

/*
 *        g1 ── g2
 *          \  /
 *    p ──── a      (a's parents are g1 and g2; a's partner is p)
 *          / \
 *         c1  c2   (children of a and p)
 *         |
 *        gc        (c1's child with q, c1's partner)
 *    s = a's sister (child of g1 and g2), u = s's son, k = a kin bow to a
 */
const family: LineageEdge[] = [
  { from: 'g1', to: 'a', role: 'parent' },
  { from: 'g2', to: 'a', role: 'parent' },
  { from: 'g1', to: 's', role: 'parent' },
  { from: 'g2', to: 's', role: 'parent' },
  { from: 'g1', to: 'g2', role: 'partner' },
  { from: 'a', to: 'p', role: 'partner' },
  { from: 'a', to: 'c1', role: 'parent' },
  // A `child` edge is a parent edge the other way round.
  { from: 'c2', to: 'a', role: 'child' },
  { from: 'p', to: 'c1', role: 'parent' },
  { from: 'c1', to: 'gc', role: 'parent' },
  { from: 'c1', to: 'q', role: 'partner' },
  { from: 's', to: 'u', role: 'parent' },
  { from: 'a', to: 's', role: 'sibling' },
  { from: 'k', to: 'a', role: 'kin' },
];

describe('golf M: de bloedlijn', () => {
  it('reads a parent edge both ways round', () => {
    expect(parentPair({ from: 'x', to: 'y', role: 'parent' })).toEqual(['x', 'y']);
    expect(parentPair({ from: 'y', to: 'x', role: 'child' })).toEqual(['x', 'y']);
    expect(parentPair({ from: 'x', to: 'y', role: 'partner' })).toBeNull();
  });

  it('walks up and down the parent edges only', () => {
    expect([...walkLine(family, 'a', 'up')].sort()).toEqual(['g1', 'g2']);
    expect([...walkLine(family, 'a', 'down')].sort()).toEqual(['c1', 'c2', 'gc']);
  });

  it('holds ancestors, descendants, the partner, and the partners of descendants', () => {
    const line = lineageOf(family, 'a');
    expect([...line].sort()).toEqual(['a', 'c1', 'c2', 'g1', 'g2', 'gc', 'p', 'q']);
    // A sister, her son and a kin bow are family, not this person's line.
    expect(line.has('s')).toBe(false);
    expect(line.has('u')).toBe(false);
    expect(line.has('k')).toBe(false);
  });

  it('lights a line only when both of its ends are lit', () => {
    const line = lineageOf(family, 'a');
    expect(edgeInLineage({ from: 'g1', to: 'a' }, line)).toBe(true);
    expect(edgeInLineage({ from: 'g1', to: 'g2' }, line)).toBe(true);
    expect(edgeInLineage({ from: 'g1', to: 's' }, line)).toBe(false);
    expect(edgeInLineage({ from: 'a', to: 's' }, line)).toBe(false);
  });

  it('survives a cycle in the archive', () => {
    const loop: LineageEdge[] = [
      { from: 'x', to: 'y', role: 'parent' },
      { from: 'y', to: 'x', role: 'parent' },
    ];
    expect([...lineageOf(loop, 'x')].sort()).toEqual(['x', 'y']);
  });
});

describe('golf M: een lijn uit een + landt waar hij mag', () => {
  it('never on the card it came from', () => {
    expect(connectVerdict({ source: 'a', target: 'a', role: 'partner', edges: family })).toBe('self');
  });

  it('not where the very line is already drawn', () => {
    expect(connectVerdict({ source: 'a', target: 'g1', role: 'parent', edges: family })).toBe('exists');
    expect(connectVerdict({ source: 'a', target: 'c2', role: 'child', edges: family })).toBe('exists');
    expect(connectVerdict({ source: 'p', target: 'a', role: 'partner', edges: family })).toBe('exists');
    expect(connectVerdict({ source: 's', target: 'a', role: 'sibling', edges: family })).toBe('exists');
  });

  it('never makes somebody their own ancestor', () => {
    // A grandchild as a's parent, or a's grandparent as a's child.
    expect(connectVerdict({ source: 'a', target: 'gc', role: 'parent', edges: family })).toBe('cycle');
    expect(connectVerdict({ source: 'a', target: 'g2', role: 'child', edges: family })).toBe('cycle');
  });

  it('lands anywhere else — a schim included', () => {
    expect(isConnectTarget({ source: 'a', target: 'u', role: 'child', edges: family })).toBe(true);
    expect(isConnectTarget({ source: 'a', target: 'q', role: 'partner', edges: family })).toBe(true);
    expect(isConnectTarget({ source: 'c1', target: 'c2', role: 'sibling', edges: family })).toBe(true);
    // Somebody's parent may still become their partner's partner; only lineage cycles are refused.
    expect(isConnectTarget({ source: 's', target: 'p', role: 'parent', edges: family })).toBe(true);
  });
});

describe('golf M: de woorden', () => {
  it('are all there and fit what a Keeper may write', () => {
    for (const key of [
      'treeLineRemoved',
      'treeUndoAction',
      'treeUndoUnchanged',
      'treeUndoProposed',
      'treeUndoRefused',
      'treeUndoGone',
      'treeRedo',
      'treeLineChildOf',
      'treeLineChildOfOne',
      'treeMenuAddChild',
      'treeMenuOf',
      'treeConnectHint',
    ]) {
      expect(DEFAULT_WORDS[key], key).toBeTruthy();
      expect(DEFAULT_WORDS[key].length, key).toBeLessThanOrEqual(WORD_MAX);
    }
    expect(DEFAULT_WORDS.treeLineRemoved).toBe('{Lijn} weggehaald.');
  });
});
