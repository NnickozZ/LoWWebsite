import { describe, expect, it } from 'vitest';
import { fuzzyScore, rankBy } from '@/lib/search/fuzzy';

describe('fuzzyScore', () => {
  it('ranks exact above prefix above word-prefix above contains', () => {
    const exact = fuzzyScore('Harbourmaster', 'harbourmaster');
    const prefix = fuzzyScore('Harbourmaster of Vlissingen', 'harbourm');
    const wordPrefix = fuzzyScore('Pier Boone, Harbourmaster', 'harbour');
    const contains = fuzzyScore('The old harbourmaster', 'bourmas');
    expect(exact).toBeGreaterThan(prefix);
    expect(prefix).toBeGreaterThan(wordPrefix);
    expect(wordPrefix).toBeGreaterThan(contains);
  });

  it('ignores case and diacritics', () => {
    expect(fuzzyScore('Café ’t Anker', 'cafe')).toBeGreaterThan(0);
    expect(fuzzyScore('MIDDELBURG', 'middel')).toBeGreaterThan(0);
  });

  it('tolerates a typo', () => {
    expect(fuzzyScore('Harbourmaster', 'harbourmster')).toBeGreaterThan(0);
    expect(fuzzyScore('Middelburg', 'middleburg')).toBeGreaterThan(0);
  });

  it('does not match unrelated words', () => {
    expect(fuzzyScore('Middelburg', 'zeppelin')).toBe(0);
    expect(fuzzyScore('Middelburg', '')).toBe(0);
  });

  it('matches an in-order subsequence', () => {
    expect(fuzzyScore('Westkapelle Lighthouse', 'wkl')).toBeGreaterThan(0);
  });
});

describe('rankBy', () => {
  const items = [
    { name: 'Middelburg', tags: ['city'] },
    { name: 'Vlissingen', tags: ['harbour', 'coast'] },
    { name: 'Westkapelle Lighthouse', tags: ['coast'] },
  ];

  it('sorts best first and honours the limit', () => {
    const ranked = rankBy(items, 'west', (item) => [item.name, ...item.tags], 2);
    expect(ranked[0].item.name).toBe('Westkapelle Lighthouse');
    expect(ranked.length).toBeLessThanOrEqual(2);
  });

  it('matches on tags as well as names', () => {
    const ranked = rankBy(items, 'coast', (item) => [item.name, ...item.tags]);
    expect(ranked.map((r) => r.item.name)).toContain('Vlissingen');
  });

  it('returns nothing for a query that matches nothing', () => {
    expect(rankBy(items, 'zeppelin', (item) => [item.name])).toEqual([]);
  });
});
