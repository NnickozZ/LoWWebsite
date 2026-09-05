import { describe, expect, it } from 'vitest';
import {
  READING_FONT_CHOICES,
  cleanReadingFont,
  readingFontAttr,
  readingFontStack,
  type ReadingFont,
} from '@/lib/readingFont';

/**
 * §29: the letter a person reads the archive in.
 *
 * Cheap tests for a cheap module, but the two things they pin down are the two
 * things that would be quietly catastrophic to get wrong. `cleanReadingFont` is
 * the only guard between a form post and a value that ends up in an attribute
 * selector, and `readingFontAttr` returning undefined for the default is what
 * keeps the archive's own letter from needing a rule of its own.
 */
describe('cleanReadingFont', () => {
  it('keeps the two faces there are', () => {
    expect(cleanReadingFont('atkinson')).toBe('atkinson');
    expect(cleanReadingFont('opendyslexic')).toBe('opendyslexic');
  });

  it('answers with the archive letter for anything else', () => {
    expect(cleanReadingFont('')).toBe('');
    expect(cleanReadingFont(null)).toBe('');
    expect(cleanReadingFont(undefined)).toBe('');
    expect(cleanReadingFont('comic-sans')).toBe('');
    expect(cleanReadingFont(42)).toBe('');
    expect(cleanReadingFont({ font: 'atkinson' })).toBe('');
  });

  it('does not let a stylesheet be smuggled through the setting', () => {
    expect(cleanReadingFont("atkinson'] { display: none } [x='")).toBe('');
  });
});

describe('readingFontAttr', () => {
  it('leaves the default without an attribute at all', () => {
    // React drops an undefined attribute, so an account on the archive's own
    // letter renders exactly the markup it rendered before §29 existed.
    expect(readingFontAttr('')).toBeUndefined();
  });

  it('names the chosen face', () => {
    expect(readingFontAttr('atkinson')).toBe('atkinson');
    expect(readingFontAttr('opendyslexic')).toBe('opendyslexic');
  });
});

describe('READING_FONT_CHOICES', () => {
  it('offers the archive and the two alternatives, in that order', () => {
    expect(READING_FONT_CHOICES.map((choice) => choice.value)).toEqual([
      '',
      'atkinson',
      'opendyslexic',
    ]);
  });

  it('gives every choice a Dutch label and a hint to print in its own letter', () => {
    for (const choice of READING_FONT_CHOICES) {
      expect(choice.label.length).toBeGreaterThan(0);
      expect(choice.hint.length).toBeGreaterThan(0);
    }
  });

  it('offers only values the cleaner accepts', () => {
    for (const choice of READING_FONT_CHOICES) {
      expect(cleanReadingFont(choice.value)).toBe(choice.value);
    }
  });
});

describe('readingFontStack', () => {
  it('falls back to the archive letter rather than a copy of it', () => {
    // The preview must not hard-code Source Serif: the fallback has to follow
    // whatever the archive is set in, including a Keeper's own change.
    for (const font of ['', 'atkinson', 'opendyslexic'] as ReadingFont[]) {
      expect(readingFontStack(font)).toContain('var(--serif)');
    }
  });

  it('names the face it is previewing', () => {
    expect(readingFontStack('atkinson')).toContain('Atkinson Hyperlegible');
    expect(readingFontStack('opendyslexic')).toContain('OpenDyslexic');
    expect(readingFontStack('')).toBe('var(--serif)');
  });

  it('never mentions the stamp face — the stamps are the archive', () => {
    for (const font of ['', 'atkinson', 'opendyslexic'] as ReadingFont[]) {
      expect(readingFontStack(font)).not.toContain('stamp-face');
    }
  });
});
