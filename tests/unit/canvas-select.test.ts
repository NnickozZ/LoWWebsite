import { describe, expect, it } from 'vitest';
import {
  boxesTouch,
  groupDelta,
  hitsIn,
  normaliseRect,
  pressSelection,
  toggleSelection,
  type Box,
  type Rect,
} from '@/lib/canvas/select';

/**
 * §67 — kiezen op een canvas.
 *
 * The arithmetic behind shift-click, shift-drag and a group drag, which the
 * prikbord had inlined and the stamboom is about to want. Every rule people
 * actually notice is in here: a box that touches half a kaartje takes it, a box
 * replaces what was chosen (or adds to it, where a surface asks for that), a
 * plain press on something already chosen leaves the group alone, and a group
 * lands on whole units.
 *
 * The e2e specs cover the gesture on the wall (`board-editing`, `board-live`);
 * this file covers the sums, which no browser is needed for.
 */

const box = (x: number, y: number, width = 10, height = 10): Box => ({ x, y, width, height });
const card = (id: string, x: number, y: number, width = 10, height = 10) => ({
  id,
  ...box(x, y, width, height),
});
const rect = (x0: number, y0: number, x1: number, y1: number): Rect => ({ x0, y0, x1, y1 });
const boxOf = (item: { x: number; y: number; width: number; height: number }) => ({
  x: item.x,
  y: item.y,
  width: item.width,
  height: item.height,
});

describe('§67 een sleepvak', () => {
  it('reads a box dragged in any direction the same way', () => {
    expect(normaliseRect(rect(10, 20, 40, 60))).toEqual({ x: 10, y: 20, width: 30, height: 40 });
    expect(normaliseRect(rect(40, 60, 10, 20))).toEqual({ x: 10, y: 20, width: 30, height: 40 });
    expect(normaliseRect(rect(5, 5, 5, 5))).toEqual({ x: 5, y: 5, width: 0, height: 0 });
  });

  it('touches rather than contains: half a kaartje is enough', () => {
    const kaartje = box(100, 100, 50, 50);
    // A box over the top-left corner and nothing else.
    expect(boxesTouch(kaartje, normaliseRect(rect(90, 90, 110, 110)))).toBe(true);
    // Wholly inside is a hit too, obviously.
    expect(boxesTouch(kaartje, normaliseRect(rect(0, 0, 400, 400)))).toBe(true);
    // Beside it is not.
    expect(boxesTouch(kaartje, normaliseRect(rect(0, 0, 90, 400)))).toBe(false);
  });

  it('does not call a shared edge an overlap', () => {
    const kaartje = box(100, 100, 50, 50);
    // The sweep stops exactly on the card's left edge.
    expect(boxesTouch(kaartje, normaliseRect(rect(0, 0, 100, 400)))).toBe(false);
    // And exactly on its right one.
    expect(boxesTouch(kaartje, normaliseRect(rect(150, 0, 400, 400)))).toBe(false);
    // A hair further and it is a hit.
    expect(boxesTouch(kaartje, normaliseRect(rect(0, 0, 100.5, 400)))).toBe(true);
  });

  it('gives the hits back in the order they were handed over', () => {
    const items = [card('c', 0, 0), card('a', 20, 0), card('b', 40, 0), card('far', 900, 900)];
    const hit = hitsIn(rect(-5, -5, 100, 100), items, boxOf).map((item) => item.id);
    expect(hit).toEqual(['c', 'a', 'b']);
  });

  it('leaves out anything with no box worth hitting', () => {
    const items = [card('a', 0, 0), card('hidden', 5, 5), card('b', 10, 10)];
    const hit = hitsIn(rect(-5, -5, 100, 100), items, (item) =>
      item.id === 'hidden' ? null : boxOf(item),
    ).map((item) => item.id);
    expect(hit).toEqual(['a', 'b']);
  });

  it('finds nothing in a box that was never dragged open on bare paper', () => {
    const items = [card('a', 0, 0)];
    expect(hitsIn(rect(50, 50, 50, 50), items, boxOf)).toEqual([]);
    // Opened *inside* something it does still touch it, which is the wall's own
    // answer and harmless there: a press that lands on a kaartje never reaches
    // the paper's handler in the first place.
    expect(hitsIn(rect(5, 5, 5, 5), items, boxOf).map((item) => item.id)).toEqual(['a']);
  });
});

/**
 * Replace against union: the prikbord's box replaces what was chosen, which is
 * what a canvas whose only other gesture on bare paper is a pan should do. A
 * surface that wants the box to *add* asks for `'union'`; the arithmetic for
 * both is the same two lines, so it is checked here rather than in the hook.
 */
describe('§67 vervangen of erbij', () => {
  const items = [card('a', 0, 0), card('b', 20, 0), card('c', 900, 900)];
  const chosen = new Set(['c']);
  const hit = new Set(hitsIn(rect(-5, -5, 100, 100), items, boxOf).map((item) => item.id));

  it('replaces what was chosen', () => {
    expect([...new Set(hit)].sort()).toEqual(['a', 'b']);
  });

  it('or adds to it, where a surface asks for that', () => {
    expect([...new Set([...chosen, ...hit])].sort()).toEqual(['a', 'b', 'c']);
  });
});

describe('§67 klikken en shift-klikken', () => {
  it('chooses only the one that was clicked', () => {
    expect([...toggleSelection(new Set(['a', 'b']), 'c', false)]).toEqual(['c']);
  });

  it('toggles with shift, both ways', () => {
    expect([...toggleSelection(new Set(['a']), 'b', true)].sort()).toEqual(['a', 'b']);
    expect([...toggleSelection(new Set(['a', 'b']), 'b', true)]).toEqual(['a']);
  });

  it('never hands back the set it was given', () => {
    const current = new Set(['a']);
    expect(toggleSelection(current, 'a', true)).not.toBe(current);
    expect([...current]).toEqual(['a']);
  });
});

/**
 * The press rule, and the wart it repairs. A plain press on a kaartje that is
 * already chosen used to collapse the wall's visible selection to that one card
 * while the whole group still travelled with the hand.
 */
describe('§67 een druk op iets dat al gekozen is', () => {
  it('leaves the group standing — the very set, so a surface may skip the render', () => {
    const current = new Set(['a', 'b', 'c']);
    expect(pressSelection(current, 'b', false, true)).toBe(current);
    expect(pressSelection(current, 'b', false)).toBe(current);
  });

  it('chooses only the one pressed when it was not chosen', () => {
    const current = new Set(['a', 'b']);
    const next = pressSelection(current, 'c', false, false);
    expect([...next]).toEqual(['c']);
    expect([...current].sort()).toEqual(['a', 'b']);
  });

  it('still toggles when shift is down, chosen or not', () => {
    expect([...pressSelection(new Set(['a', 'b']), 'b', true, true)]).toEqual(['a']);
    expect([...pressSelection(new Set(['a']), 'b', true, false)].sort()).toEqual(['a', 'b']);
  });

  it('believes the surface about what was chosen at the press', () => {
    // The wall reads `alreadySelected` before it writes anything, so a caller
    // may hand over an answer the set no longer agrees with.
    const current = new Set(['a']);
    expect(pressSelection(current, 'b', false, true)).toBe(current);
  });
});

describe('§67 een groep verslepen', () => {
  const origin = new Map([
    ['a', { x: 10, y: 20 }],
    ['b', { x: 100, y: 200 }],
  ]);

  it('moves every member by the same distance, from where it stood at the press', () => {
    expect(groupDelta(origin, 5, -5)).toEqual({
      a: { x: 15, y: 15 },
      b: { x: 105, y: 195 },
    });
  });

  it('lands on whole units, so a save is not a shower of decimals', () => {
    expect(groupDelta(origin, 0.4, 0.6)).toEqual({
      a: { x: 10, y: 21 },
      b: { x: 100, y: 201 },
    });
    // Half a unit rounds up, the way `Math.round` does — the wall's own answer
    // before this moved out of the canvas.
    expect(groupDelta(new Map([['a', { x: 0, y: 0 }]]), 0.5, -0.5)).toEqual({
      a: { x: 1, y: -0 },
    });
  });

  it('keeps the decimals when a surface asks it to', () => {
    expect(groupDelta(origin, 0.25, 0, false)).toEqual({
      a: { x: 10.25, y: 20 },
      b: { x: 100.25, y: 200 },
    });
  });

  it('answers an empty group with an empty answer', () => {
    expect(groupDelta(new Map(), 10, 10)).toEqual({});
  });
});
