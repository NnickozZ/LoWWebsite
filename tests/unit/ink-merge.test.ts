import { describe, expect, it } from 'vitest';
import {
  emptyInk,
  inkForViewer,
  mergeInk,
  normaliseInk,
  normalisePoints,
  normaliseStroke,
  readInkFrame,
} from '@/lib/ink/merge';
import { INK_MAX_POINTS, INK_STROKE_LIMIT, INK_TOMBSTONE_TTL_MS } from '@/lib/ink/types';

/**
 * §33: the tekenlaag's merge, pure. The concurrency cases are the ones the
 * corkboard taught us (§8): a lifted stroke must stay lifted when a stale
 * client sends it again; order is the server's clock; a gum is a stroke.
 */

const BRAM = { id: 'bram', isKeeper: false };
const AAGJE = { id: 'aagje', isKeeper: false };
const KEEPER = { id: 'keeper', isKeeper: true };

const stroke = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  mode: 'ink',
  colour: 2,
  width: 6,
  points: [10, 10, 1, 20, 20, 1, 30, 25, 0.5],
  ...extra,
});

describe('reading a stroke', () => {
  it('keeps whole triples, clamps pressure, rounds, and refuses nonsense', () => {
    expect(normalisePoints([1, 2, 3, 4, 5])).toEqual([1, 2, 1]);
    expect(normalisePoints([1.23456, 2, 1.5, 3, 4, -1])).toEqual([1.235, 2, 1, 3, 4, 0]);
    expect(normalisePoints([1, 2])).toBeNull();
    expect(normalisePoints([1, 'x', 1])).toBeNull();
    expect(normalisePoints(null)).toBeNull();
    const long = Array.from({ length: INK_MAX_POINTS + 300 }, (_, i) => i);
    expect(normalisePoints(long)!.length).toBe(INK_MAX_POINTS);
  });

  it('a stroke needs an id and points; colour and width are clamped', () => {
    expect(normaliseStroke(stroke('s_1', { colour: 99, width: 1e9 }))).toMatchObject({ colour: 7, width: 4000 });
    expect(normaliseStroke(stroke('s_1', { colour: -3, width: 0 }))).toMatchObject({ colour: 0, width: 0.1 });
    expect(normaliseStroke(stroke('bad id!'))).toBeNull();
    expect(normaliseStroke(stroke('s_1', { points: [] }))).toBeNull();
    expect(normaliseStroke(stroke('s_1', { mode: 'paint' }))!.mode).toBe('ink');
    expect(normaliseStroke(stroke('s_1', { mode: 'erase' }))!.mode).toBe('erase');
  });

  it('a layer out of the column: duplicates dropped, tombstoned ones gone, sorted by time', () => {
    const layer = normaliseInk({
      strokes: [stroke('b', { at: 200 }), stroke('a', { at: 100 }), stroke('b', { at: 999 }), stroke('dead', { at: 50 })],
      deleted: { dead: Date.now() - 1000, old: Date.now() - INK_TOMBSTONE_TTL_MS - 1 },
      enabled: false,
    });
    expect(layer.strokes.map((s) => s.id)).toEqual(['a', 'b']);
    expect(layer.strokes[1].at).toBe(200);
    expect(Object.keys(layer.deleted)).toEqual(['dead']);
    expect(layer.enabled).toBe(false);
    expect(normaliseInk(null)).toEqual(emptyInk());
  });
});

describe('merging', () => {
  it('appends, stamps the author and the server clock, and keeps sent order', () => {
    const { layer, added } = mergeInk(emptyInk(), { strokes: [stroke('s_2'), stroke('s_1', { at: 5 })] }, BRAM, 1000);
    expect(added).toBe(2);
    expect(layer.strokes.map((s) => [s.id, s.at, s.by])).toEqual([
      ['s_2', 1000, 'bram'],
      ['s_1', 1001, 'bram'],
    ]);
  });

  it('two people drawing at once: both strokes survive, in the order the server saw them', () => {
    const first = mergeInk(emptyInk(), { strokes: [stroke('bram-1')] }, BRAM, 1000).layer;
    const second = mergeInk(first, { strokes: [stroke('aagje-1')] }, AAGJE, 1001).layer;
    expect(second.strokes.map((s) => s.id)).toEqual(['bram-1', 'aagje-1']);
    // Bram's stale screen sends his stroke again: nothing doubles, nothing moves.
    const third = mergeInk(second, { strokes: [stroke('bram-1', { at: 5000 })] }, BRAM, 2000).layer;
    expect(third.strokes.map((s) => [s.id, s.at])).toEqual([
      ['bram-1', 1000],
      ['aagje-1', 1001],
    ]);
  });

  it('a gum is a stroke like any other, and lands after the ink it erases', () => {
    const inked = mergeInk(emptyInk(), { strokes: [stroke('ink')] }, BRAM, 1000).layer;
    const erased = mergeInk(inked, { strokes: [stroke('gum', { mode: 'erase' })] }, AAGJE, 1001).layer;
    expect(erased.strokes.map((s) => [s.id, s.mode])).toEqual([
      ['ink', 'ink'],
      ['gum', 'erase'],
    ]);
  });

  it('undo lifts only your own, writes a tombstone, and the tombstone holds against a stale re-send', () => {
    let layer = mergeInk(emptyInk(), { strokes: [stroke('b1')] }, BRAM, 1000).layer;
    layer = mergeInk(layer, { strokes: [stroke('a1')] }, AAGJE, 1001).layer;

    const aagjeTries = mergeInk(layer, { undo: ['b1'] }, AAGJE, 1002);
    expect(aagjeTries.lifted).toBe(0);
    expect(aagjeTries.layer.strokes).toHaveLength(2);

    const bramUndoes = mergeInk(layer, { undo: ['b1'] }, BRAM, 1003);
    expect(bramUndoes.lifted).toBe(1);
    expect(bramUndoes.layer.strokes.map((s) => s.id)).toEqual(['a1']);
    expect(bramUndoes.layer.deleted.b1).toBe(1003);

    // Aagje's screen still had b1 and sends it up with her next stroke.
    const stale = mergeInk(bramUndoes.layer, { strokes: [stroke('b1'), stroke('a2')] }, AAGJE, 1004).layer;
    expect(stale.strokes.map((s) => s.id)).toEqual(['a1', 'a2']);
  });

  it('the wipe empties everything, tombstones included, and remembers when', () => {
    let layer = mergeInk(emptyInk(), { strokes: [stroke('b1'), stroke('b2')] }, BRAM, 1000).layer;
    layer = mergeInk(layer, { undo: ['b1'] }, BRAM, 1001).layer;
    const wiped = mergeInk(layer, { clear: true }, KEEPER, 2000).layer;
    expect(wiped.strokes).toEqual([]);
    expect(wiped.deleted).toEqual({});
    expect(wiped.clearedAt).toBe(2000);
    // Drawing after the wipe starts afresh — even with an id that was lifted before.
    const after = mergeInk(wiped, { strokes: [stroke('b1')] }, BRAM, 2001).layer;
    expect(after.strokes.map((s) => s.id)).toEqual(['b1']);
  });

  it('the switch is applied as given; the merge does not know who may flip it', () => {
    const off = mergeInk(emptyInk(), { enabled: false }, KEEPER).layer;
    expect(off.enabled).toBe(false);
    expect(mergeInk(off, { enabled: 'yes' as unknown as boolean }, KEEPER).layer.enabled).toBe(false);
    expect(mergeInk(off, { enabled: true }, KEEPER).layer.enabled).toBe(true);
  });

  it('a full layer refuses new strokes and says how many', () => {
    const full = normaliseInk({
      strokes: Array.from({ length: INK_STROKE_LIMIT }, (_, i) => stroke(`s${i}`, { at: i })),
    });
    const result = mergeInk(full, { strokes: [stroke('one-more'), stroke('two-more')] }, BRAM, 1e6);
    expect(result.added).toBe(0);
    expect(result.refused).toBe(2);
    expect(result.layer.strokes).toHaveLength(INK_STROKE_LIMIT);
  });
});

describe('what a viewer is told', () => {
  it('no author, only "mine"', () => {
    let layer = mergeInk(emptyInk(), { strokes: [stroke('b1')] }, BRAM, 1000).layer;
    layer = mergeInk(layer, { strokes: [stroke('a1')] }, AAGJE, 1001).layer;
    const forBram = inkForViewer(layer, 'bram');
    expect(forBram.strokes.map((s) => [s.id, s.mine ?? false, 'by' in s])).toEqual([
      ['b1', true, false],
      ['a1', false, false],
    ]);
    expect('deleted' in forBram).toBe(false);
    const forNobody = inkForViewer(layer, null);
    expect(forNobody.strokes.every((s) => !s.mine)).toBe(true);
  });
});

describe('a frame off the wire', () => {
  it('is kept to an id, a look and finite numbers, with the end and abandon flags', () => {
    expect(readInkFrame({ id: 's_1', m: 'erase', k: 40, w: 5, p: [1, 2, 1], e: 1 })).toEqual({
      id: 's_1',
      m: 'erase',
      k: 7,
      w: 5,
      p: [1, 2, 1],
      e: 1,
    });
    expect(readInkFrame({ id: 's_1', p: [1, 'a', 1] })).toBeNull();
    expect(readInkFrame({ id: '', p: [] })).toBeNull();
    expect(readInkFrame({ id: 's_1', a: 1 })).toMatchObject({ a: 1, p: [] });
    expect(readInkFrame({ id: 's_1', p: [1, 2, 3], e: 'yes' })).not.toHaveProperty('e');
  });
});
