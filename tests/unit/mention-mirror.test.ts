import { describe, expect, it } from 'vitest';
import { mirrorSegments, type MentionSpan } from '@/components/ui/MentionPopover';

/**
 * §56: the overlay that puts a chip *inside* the box being typed in draws a
 * mirror of the box's own text. The one invariant that keeps the caret under
 * its letter is that the mirror holds **every character of the text, in order,
 * exactly once** — brackets and `@` included. Everything below is that one
 * sentence, said to awkward input.
 */

function span(start: number, end: number, name: string, entryId: string | null = 'e1'): MentionSpan {
  return { start, end, name, entryId, slug: entryId ? 'slug' : null, icon: null, colour: null };
}

/** What the mirror will print, joined back together. */
const joined = (text: string, spans: MentionSpan[]) =>
  mirrorSegments(text, spans)
    .map((segment) => segment.text)
    .join('');

describe('mirrorSegments', () => {
  it('covers the text byte for byte', () => {
    const text = 'Zie [[Jan]] en @Piet, allebei.';
    const spans = [span(4, 11, 'Jan'), span(15, 20, 'Piet')];
    expect(joined(text, spans)).toBe(text);
  });

  it('keeps the brackets inside the chip', () => {
    const segments = mirrorSegments('Zie [[Jan]] hier', [span(4, 11, 'Jan')]);
    expect(segments.map((s) => s.text)).toEqual(['Zie ', '[[Jan]]', ' hier']);
    expect(segments[1].span?.name).toBe('Jan');
    expect(segments[0].span).toBeNull();
  });

  it('keeps the @ inside the chip', () => {
    const segments = mirrorSegments('@Jan loopt', [span(0, 4, 'Jan')]);
    expect(segments.map((s) => s.text)).toEqual(['@Jan', ' loopt']);
    expect(segments[0].span?.name).toBe('Jan');
  });

  it('handles a mention at position 0 and two side by side', () => {
    const text = '[[Jan]][[Piet]]';
    const spans = [span(0, 7, 'Jan'), span(7, 15, 'Piet')];
    const segments = mirrorSegments(text, spans);
    expect(segments.map((s) => s.text)).toEqual(['[[Jan]]', '[[Piet]]']);
    expect(joined(text, spans)).toBe(text);
  });

  it('keeps an unresolved run as its own segment, with the text intact', () => {
    const text = 'Zie [[Niemand]].';
    const spans = [span(4, 15, 'Niemand', null)];
    const segments = mirrorSegments(text, spans);
    expect(joined(text, spans)).toBe(text);
    expect(segments[1].span?.entryId).toBeNull();
    expect(segments[1].text).toBe('[[Niemand]]');
  });

  it('leaves an unmatched [[ alone', () => {
    const text = 'Zie [[Jan en verder';
    expect(joined(text, [])).toBe(text);
    expect(mirrorSegments(text, [])).toEqual([{ text, span: null }]);
  });

  it('drops a span whose characters have moved on', () => {
    // The answer for "Zie [[Jan]]" arriving while the box already says
    // "Zie x[[Jan]]": every index is one late, so the chip would sit on the
    // wrong letters. It is dropped, not drawn.
    const text = 'Zie x[[Jan]]';
    const stale = [span(4, 11, 'Jan')];
    expect(joined(text, stale)).toBe(text);
    expect(mirrorSegments(text, stale).every((s) => s.span === null)).toBe(true);
  });

  it('drops a span that runs past the end of the text', () => {
    const text = 'Zie [[Jan]]';
    expect(joined(text, [span(4, 40, 'Jan')])).toBe(text);
  });

  it('drops a span that overlaps the one before it', () => {
    const text = '[[Jan]]x';
    const spans = [span(0, 7, 'Jan'), span(3, 7, 'an')];
    expect(joined(text, spans)).toBe(text);
    expect(mirrorSegments(text, spans).filter((s) => s.span).length).toBe(1);
  });

  it('sorts spans that arrive out of order', () => {
    const text = '[[Jan]] en [[Piet]]';
    const spans = [span(11, 19, 'Piet'), span(0, 7, 'Jan')];
    expect(joined(text, spans)).toBe(text);
    expect(mirrorSegments(text, spans).map((s) => s.text)).toEqual(['[[Jan]]', ' en ', '[[Piet]]']);
  });

  it('carries newlines, in a run and around one', () => {
    const text = 'Eerst\n[[Jan]]\n\nlaatst\n';
    const spans = [span(6, 13, 'Jan')];
    expect(joined(text, spans)).toBe(text);
    // A name with a newline in it is not a name the server would resolve, but
    // if one ever arrives the characters still all come out.
    const odd = 'a[[Jan\nP]]b';
    expect(joined(odd, [span(1, 10, 'Jan\nP')])).toBe(odd);
  });

  it('counts emoji and combining marks the way the box does', () => {
    // JavaScript string indices are UTF-16 code units, which is also what
    // `selectionStart` counts — so a span's start is measured in the same
    // units on both sides. An emoji is two of them.
    const text = '🚢 [[Jan]] café́ 🚢';
    const start = text.indexOf('[[');
    const spans = [span(start, start + 7, 'Jan')];
    expect(joined(text, spans)).toBe(text);
    expect(mirrorSegments(text, spans)[0].text).toBe('🚢 ');
  });

  it('gives an empty text no segments at all', () => {
    expect(mirrorSegments('', [])).toEqual([]);
    expect(mirrorSegments('', [span(0, 7, 'Jan')])).toEqual([]);
  });
});
