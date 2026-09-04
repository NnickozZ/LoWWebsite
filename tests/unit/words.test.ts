import { describe, expect, it } from 'vitest';
import {
  DEFAULT_WORDS,
  WORD_DEFS,
  WORD_GROUPS,
  capitalise,
  cleanWordOverrides,
  resolveWords,
} from '@/lib/words';

describe('the word list itself', () => {
  it('has no key twice', () => {
    const keys = WORD_DEFS.map((def) => def.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('gives every word a default and a description', () => {
    for (const def of WORD_DEFS) {
      expect(def.fallback.trim(), def.key).not.toBe('');
      expect(def.what.trim(), def.key).not.toBe('');
    }
  });

  it('puts every word in exactly one group', () => {
    const grouped = WORD_GROUPS.flatMap((group) => group.words.map((word) => word.key));
    expect(grouped.sort()).toEqual(WORD_DEFS.map((def) => def.key).sort());
  });
});

describe('cleanWordOverrides', () => {
  it('keeps a Keeper’s word', () => {
    expect(cleanWordOverrides({ entry: 'kaart' })).toEqual({ entry: 'kaart' });
  });

  it('ignores a key it does not know', () => {
    expect(cleanWordOverrides({ smuggled: 'x', entry: 'kaart' })).toEqual({ entry: 'kaart' });
  });

  it('drops a word that only agrees with the default', () => {
    // Storing the defaults would freeze them: a later change to one would
    // never reach an archive that had merely re-typed it.
    expect(cleanWordOverrides({ entry: DEFAULT_WORDS.entry })).toEqual({});
    expect(cleanWordOverrides({ entry: '   ' })).toEqual({});
  });

  it('trims, caps, and ignores anything that is not text', () => {
    expect(cleanWordOverrides({ entry: '  kaart  ' })).toEqual({ entry: 'kaart' });
    expect(cleanWordOverrides({ entry: 'x'.repeat(400) }).entry).toHaveLength(60);
    expect(cleanWordOverrides({ entry: 42 })).toEqual({});
    expect(cleanWordOverrides(['entry'])).toEqual({});
    expect(cleanWordOverrides(null)).toEqual({});
  });
});

describe('resolveWords', () => {
  it('answers for every key, changed or not', () => {
    const words = resolveWords({ entry: 'kaart' });
    expect(words.entry).toBe('kaart');
    expect(words.navHome).toBe(DEFAULT_WORDS.navHome);
    for (const def of WORD_DEFS) expect(words[def.key], def.key).toBeTruthy();
  });

  it('falls back to the whole default list when nothing was ever set', () => {
    expect(resolveWords({})).toEqual(DEFAULT_WORDS);
    expect(resolveWords(undefined)).toEqual(DEFAULT_WORDS);
  });
});

describe('capitalise', () => {
  it('lifts a stored lower-case word to the start of a heading', () => {
    expect(capitalise('punaise')).toBe('Punaise');
    expect(capitalise('Keeper')).toBe('Keeper');
    expect(capitalise('')).toBe('');
  });
});
