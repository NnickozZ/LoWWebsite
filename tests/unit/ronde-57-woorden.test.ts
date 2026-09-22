import { describe, expect, it } from 'vitest';
import { DEFAULT_WORDS, WORD_DEFS, WORD_GROUPS, WORD_MAX, cleanWordOverrides } from '@/lib/words';

/**
 * §96 (ronde 57): elke standaardzin past in wat een Keeper mag terugschrijven.
 *
 * Ronde 51 vond zes standaardzinnen die langer waren dan de 60 tekens die
 * `cleanWordOverrides` bewaarde: de Keeper kon ze niet helemaal herschrijven.
 */
describe('Beheer → Woorden: de grens', () => {
  it('every default sentence fits under the cap', () => {
    const tooLong = WORD_DEFS.filter((def) => def.fallback.length > WORD_MAX).map((def) => def.key);
    expect(tooLong).toEqual([]);
  });

  it('a Keeper can rewrite the longest default whole', () => {
    const longest = [...WORD_DEFS].sort((a, b) => b.fallback.length - a.fallback.length)[0];
    const rewritten = `${longest.fallback} (herschreven)`.slice(0, WORD_MAX);
    expect(cleanWordOverrides({ [longest.key]: rewritten })[longest.key]).toBe(rewritten);
    expect(rewritten.length).toBeGreaterThan(60);
  });

  it('still caps, at the new line', () => {
    const cleaned = cleanWordOverrides({ keeper: 'x'.repeat(WORD_MAX + 50) });
    expect(cleaned.keeper).toHaveLength(WORD_MAX);
  });

  it('§96 words are short and every key is unique', () => {
    const group = WORD_GROUPS.find((g) => g.title === 'Zoeken, Beheer en de losse eindjes');
    expect(group).toBeDefined();
    for (const def of group!.words) expect(def.fallback.length).toBeLessThanOrEqual(60);
    const keys = WORD_DEFS.map((def) => def.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(Object.keys(DEFAULT_WORDS)).toHaveLength(keys.length);
  });
});
