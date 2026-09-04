import { describe, expect, it } from 'vitest';
import { slugify, uniqueSlug } from '@/lib/slug';
import { diffLines } from '@/lib/diff';

describe('slugify', () => {
  it('handles Dutch names and punctuation', () => {
    expect(slugify('Westkapelle Lighthouse')).toBe('westkapelle-lighthouse');
    expect(slugify("Café 't Anker")).toBe('cafe-t-anker');
    expect(slugify('De Oosterschelde — 1934')).toBe('de-oosterschelde-1934');
    expect(slugify("The Keeper's Logbook")).toBe('the-keepers-logbook');
  });

  it('never returns an empty slug', () => {
    expect(slugify('???')).toBe('entry');
    expect(slugify('')).toBe('entry');
  });
});

describe('uniqueSlug', () => {
  it('appends a readable counter rather than random noise', () => {
    const taken = new Set(['middelburg', 'middelburg-2']);
    expect(uniqueSlug('Middelburg', (s) => taken.has(s))).toBe('middelburg-3');
  });

  it('leaves a free slug alone', () => {
    expect(uniqueSlug('Vlissingen', () => false)).toBe('vlissingen');
  });
});

describe('diffLines', () => {
  it('marks added and removed lines', () => {
    const diff = diffLines('one\ntwo', 'one\nthree');
    expect(diff).toContainEqual({ kind: 'same', text: 'one' });
    expect(diff).toContainEqual({ kind: 'removed', text: 'two' });
    expect(diff).toContainEqual({ kind: 'added', text: 'three' });
  });

  it('reports nothing meaningful for identical text', () => {
    expect(diffLines('same', 'same')).toEqual([{ kind: 'same', text: 'same' }]);
  });
});
