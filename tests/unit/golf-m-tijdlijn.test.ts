import { describe, expect, it } from 'vitest';
import { anchorOnGlass, inRankOrder, stableRanks } from '@/lib/timelines/glass';

describe('golf M (C1): de tags staan in een vaste volgorde in de DOM', () => {
  it('geeft bij de eerste keer de volgorde waarin ze binnenkomen (de tijd)', () => {
    const ranks = stableRanks(new Map(), ['a', 'b', 'c']);
    expect([...ranks.entries()]).toEqual([
      ['a', 0],
      ['b', 1],
      ['c', 2],
    ]);
  });

  it('houdt de rang als de tijd de lijst herschikt — in beide richtingen, langs één of meer buren', () => {
    const first = stableRanks(new Map(), ['a', 'x', 'b', 'c', 'd']);
    // x wordt naar rechts gesleept, langs b, c en d.
    const right = stableRanks(first, ['a', 'b', 'c', 'd', 'x']);
    expect(right).toBe(first);
    const shownRight = inRankOrder(['a', 'b', 'c', 'd', 'x'], (id) => id, right);
    expect(shownRight).toEqual(['a', 'x', 'b', 'c', 'd']);
    // en terug naar links, voorbij a.
    const left = stableRanks(right, ['x', 'a', 'b', 'c', 'd']);
    expect(left).toBe(first);
    expect(inRankOrder(['x', 'a', 'b', 'c', 'd'], (id) => id, left)).toEqual(['a', 'x', 'b', 'c', 'd']);
  });

  it('zet een nieuwe achteraan en laat een weggehaalde vallen, zonder de rest te verschuiven', () => {
    const first = stableRanks(new Map(), ['a', 'b', 'c']);
    const next = stableRanks(first, ['n', 'a', 'c']);
    expect(next.get('a')).toBe(0);
    expect(next.get('c')).toBe(2);
    expect(next.get('n')).toBe(3);
    expect(next.has('b')).toBe(false);
    expect(inRankOrder(['n', 'a', 'c'], (id) => id, next)).toEqual(['a', 'c', 'n']);
  });

  it('zet een onbekende id achteraan, in zijn eigen volgorde', () => {
    const ranks = new Map([['b', 0]]);
    expect(inRankOrder(['y', 'b', 'z'], (id) => id, ranks)).toEqual(['b', 'y', 'z']);
  });
});

describe('golf M (C2): een venster hoort bij een tag op het glas', () => {
  it('staat als de tag op het glas staat', () => {
    expect(anchorOnGlass(0, 800, 40)).toBe(true);
    expect(anchorOnGlass(400, 800, 40)).toBe(true);
    expect(anchorOnGlass(800, 800, 40)).toBe(true);
  });

  it('staat nog als de tag half over de rand hangt', () => {
    expect(anchorOnGlass(-30, 800, 40)).toBe(true);
    expect(anchorOnGlass(835, 800, 40)).toBe(true);
  });

  it('staat niet als de tag helemaal uit beeld is, links of rechts', () => {
    expect(anchorOnGlass(-41, 800, 40)).toBe(false);
    expect(anchorOnGlass(-5000, 800, 40)).toBe(false);
    expect(anchorOnGlass(841, 800, 40)).toBe(false);
  });

  it('laat alles staan zolang het glas nog niet gemeten is', () => {
    expect(anchorOnGlass(-5000, 0, 40)).toBe(true);
  });
});
