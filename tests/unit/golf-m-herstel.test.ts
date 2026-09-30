import { describe, expect, it } from 'vitest';
import { createUndoStack } from '@/components/canvas/undoStack';
import { dragOwnDirt } from '@/lib/boards/dirty';
import { edgesTouching, unionsTouching } from '@/lib/families/followEdges';
import {
  closeGroup,
  isEmptyStep,
  landedOps,
  openGroup,
  redoOps,
  stackMark,
  stackMoved,
  undoOps,
  type RelationOp,
  type TreeStep,
} from '@/lib/families/undoSteps';
import { createOwnDeletes, lostByOthers, OWN_DELETE_GRACE_MS } from '@/lib/live/ownDeletes';

/**
 * Golf M (herstel): de bevindingen van de onafhankelijke review van golf M
 * (5c61b6e), elk met de pure helft die een test kan lezen.
 */

describe('1: wat deze hand zelf weghaalt, is niet door een ander weggehaald', () => {
  it('telt vanaf `begin`, tot het antwoord plus de marge', () => {
    let now = 1000;
    const own = createOwnDeletes(() => now);
    expect(own.has('a')).toBe(false);
    own.begin(['a', 'b']);
    now += 60_000; // onderweg telt het, hoe lang ook
    expect(own.has('a')).toBe(true);
    own.settle(['a']);
    now += OWN_DELETE_GRACE_MS - 1;
    expect(own.has('a')).toBe(true);
    now += 1;
    expect(own.has('a')).toBe(false);
    expect(own.has('b')).toBe(true);
  });

  it('een mislukte weghaling laat meteen los, en `settle` maakt niets nieuws aan', () => {
    let now = 0;
    const own = createOwnDeletes(() => now);
    own.begin(['a']);
    own.drop(['a']);
    expect(own.has('a')).toBe(false);
    own.settle(['c']);
    expect(own.has('c')).toBe(false);
  });

  it('een pull tussen twee DELETEs van één veeg noemt alleen wat een ander weghaalde', () => {
    const own = createOwnDeletes(() => 0);
    const local = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }];
    const chosen = new Set(['a', 'b', 'c']);
    own.begin(['a', 'b']);
    // Het archief heeft a (net weg) en c (door een ander) niet meer; b nog wel.
    const there = new Set(['b', 'd']);
    expect(lostByOthers(local, there, (id) => chosen.has(id), own).map((x) => x.id)).toEqual(['c']);
    // Wat niet gekozen of open is, zegt niets.
    expect(lostByOthers(local, new Set(['a', 'b', 'c']), (id) => chosen.has(id), own)).toEqual([]);
  });
});

describe('2: een + die iemand uit een vak van één verving, is twee stappen', () => {
  const plus: RelationOp = { entryId: 'kind', fieldKey: 'vader', targetId: 'y', add: true };

  it('landedOps zet de oude eruit vóór de nieuwe erin', () => {
    expect(landedOps(plus)).toEqual([plus]);
    expect(landedOps(plus, null)).toEqual([plus]);
    expect(landedOps(plus, 'y')).toEqual([plus]);
    expect(landedOps({ ...plus, add: false }, 'z')).toEqual([{ ...plus, add: false }]);
    expect(landedOps(plus, 'z')).toEqual([{ entryId: 'kind', fieldKey: 'vader', targetId: 'z', add: false }, plus]);
  });

  it('ongedaan: eerst de nieuwe eruit, dan de oude terug; opnieuw: andersom', () => {
    const step: TreeStep<null> = { relations: landedOps(plus, 'z') };
    expect(undoOps(step)).toEqual([
      { entryId: 'kind', fieldKey: 'vader', targetId: 'y', add: false },
      { entryId: 'kind', fieldKey: 'vader', targetId: 'z', add: true },
    ]);
    expect(redoOps(step)).toEqual([
      { entryId: 'kind', fieldKey: 'vader', targetId: 'z', add: false },
      { entryId: 'kind', fieldKey: 'vader', targetId: 'y', add: true },
    ]);
  });
});

describe('3: een gebaar heeft zijn eigen stap', () => {
  it('een groep wordt een stap; een lege groep niets', () => {
    const group = openGroup({ n: 1 });
    expect(isEmptyStep(closeGroup(group))).toBe(true);
    group.touched = true;
    group.relations.push({ entryId: 'a', fieldKey: 'f', targetId: 'b', add: true });
    const step = closeGroup(group);
    expect(step.state).toEqual({ n: 1 });
    expect(step.relations).toHaveLength(1);
    // De stap is een kopie: wat de groep daarna nog krijgt, verandert hem niet.
    group.relations.push({ entryId: 'a', fieldKey: 'f', targetId: 'c', add: true });
    expect(step.relations).toHaveLength(1);
  });

  it('twee gebaren tegelijk: twee groepen, twee stappen', () => {
    const stack = createUndoStack<TreeStep<number>>();
    const plus = openGroup(1); // wacht nog op het net
    const drag = openGroup(1);
    drag.touched = true;
    stack.push(closeGroup(drag)); // de sleep landt eerst
    plus.relations.push({ entryId: 'a', fieldKey: 'f', targetId: 'b', add: true });
    stack.push(closeGroup(plus));
    expect(stack.size()).toBe(2);
  });

  it('een undo die over het net ging, laat geen redo na als er intussen iets nieuws kwam', () => {
    const stack = createUndoStack<string>();
    stack.push('a');
    stack.push('b');
    stack.pop();
    const mark = stackMark(stack);
    expect(stackMoved(mark, stack)).toBe(false);
    stack.push('c'); // een nieuw gebaar terwijl de undo wachtte
    expect(stackMoved(mark, stack)).toBe(true);
  });
});

describe('4: alleen de lijnen die een glijdend kaartje raakt', () => {
  const unions = [
    { parents: ['p1', 'p2'], children: ['k1', 'k2'] },
    { parents: ['q1'], children: ['k3'] },
  ];
  const edges = [
    { id: 'e1', from: 'p1', to: 'k1', role: 'parent' },
    { id: 'e2', from: 'p2', to: 'k2', role: 'parent' },
    { id: 'e3', from: 'k2', to: 'p2', role: 'child' },
    { id: 'e4', from: 'q1', to: 'k3', role: 'parent' },
    { id: 'e5', from: 'p1', to: 'p2', role: 'partner' },
    { id: 'e6', from: 'k1', to: 'k3', role: 'sibling' },
  ];
  const ids = (list: { id: string }[]) => list.map((x) => x.id);

  it('niets beweegt: niets', () => {
    expect(edgesTouching(edges, unions, new Set())).toEqual([]);
  });

  it('een ouder beweegt: zijn lijnen, en elke lijn onder zijn balk', () => {
    expect(ids(edgesTouching(edges, unions, new Set(['p1'])))).toEqual(['e1', 'e2', 'e3', 'e5']);
    expect(unionsTouching(unions, new Set(['p1']))).toEqual([unions[0]]);
  });

  it('een kind beweegt: alleen zijn eigen lijnen, de balk blijft', () => {
    expect(ids(edgesTouching(edges, unions, new Set(['k1'])))).toEqual(['e1', 'e6']);
    expect(unionsTouching(unions, new Set(['k3']))).toEqual([unions[1]]);
  });
});

describe('6: een verloren sleep vergeet alleen zijn eigen vuil', () => {
  it('wat al wachtte vóór de sleep, blijft wachten', () => {
    expect(dragOwnDirt(['a', 'b', 'c'], new Set(['b']))).toEqual(['a', 'c']);
    expect(dragOwnDirt(['a'], new Set())).toEqual(['a']);
  });
});
