import { describe, expect, it } from 'vitest';
import {
  ARTICLE_MODE_CHOICES,
  articleModeFor,
  cleanArticleModePref,
  type ArticleModePref,
} from '@/lib/entries/mode';

/**
 * §22: which face an artikel opens in.
 *
 * The rule Nick asked for in one line: a Keeper lands in editing, everybody
 * else lands in reading, and either of them can say otherwise. The tests below
 * are the four corners of that — the two role defaults, and both roles
 * overriding them — plus what happens to a row written before the column
 * existed.
 */
describe('articleModeFor', () => {
  it('sends a Keeper to the editing face by default', () => {
    expect(articleModeFor('', true)).toBe('edit');
  });

  it('sends everyone else to the reading face by default', () => {
    expect(articleModeFor('', false)).toBe('view');
  });

  it('lets a Keeper choose reading', () => {
    expect(articleModeFor('view', true)).toBe('view');
  });

  it('lets a player choose editing', () => {
    expect(articleModeFor('edit', false)).toBe('edit');
  });

  it('falls back to the role for a row written before the column existed', () => {
    // Migration 0008 gives every existing row '', but a null out of an older
    // snapshot must not become a third, undefined face.
    expect(articleModeFor(null, true)).toBe('edit');
    expect(articleModeFor(undefined, false)).toBe('view');
  });
});

describe('cleanArticleModePref', () => {
  it('keeps the two real choices', () => {
    expect(cleanArticleModePref('view')).toBe('view');
    expect(cleanArticleModePref('edit')).toBe('edit');
  });

  it('reads anything else as "follow my role"', () => {
    // A form can post anything; a column can hold anything an older build put
    // there. Both roads end at the empty string rather than at a broken page.
    for (const junk of ['', 'lezen', 'EDIT', null, undefined, 0, {}]) {
      expect(cleanArticleModePref(junk)).toBe('');
    }
  });
});

describe('the account page offers exactly the three choices', () => {
  it('one per preference, and every value a legal one', () => {
    const values = ARTICLE_MODE_CHOICES.map((choice) => choice.value);
    expect(values).toEqual<ArticleModePref[]>(['', 'view', 'edit']);
    for (const value of values) expect(cleanArticleModePref(value)).toBe(value);
  });

  it('says something about each, because a chip on its own explains nothing', () => {
    for (const choice of ARTICLE_MODE_CHOICES) {
      expect(choice.label.length).toBeGreaterThan(0);
      expect(choice.hint.length).toBeGreaterThan(0);
    }
  });
});
