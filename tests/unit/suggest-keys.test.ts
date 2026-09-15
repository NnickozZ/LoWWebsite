import { describe, expect, it } from 'vitest';
import { nextIndex, rowForEnter, suggestKey } from '@/lib/search/suggestKeys';

/**
 * §69 (5.2): ↑ ↓ lopen de lijst, Enter kiest de rij.
 *
 * The `@`-list has done this since round 18; the five pickers answered no key
 * at all, which on a list whose first row is "'X' aanmaken" is not merely
 * slower — the row a hurried hand lands on is the one that makes a second
 * artikel. These are the decisions that keep the two lists reading as one
 * list.
 */

describe('§69 welke toets van de lijst is', () => {
  it('kent de drie', () => {
    expect(suggestKey({ key: 'ArrowDown' })).toBe('down');
    expect(suggestKey({ key: 'ArrowUp' })).toBe('up');
    expect(suggestKey({ key: 'Enter' })).toBe('enter');
  });

  it('laat alles met een modifier met rust', () => {
    // Ctrl+Enter submits forms in several places, Alt+↓ opens the browser's own
    // autocomplete, and Cmd+↑ is "top of the document" on a Mac. None of those
    // are ours to swallow.
    expect(suggestKey({ key: 'Enter', ctrlKey: true })).toBe('none');
    expect(suggestKey({ key: 'ArrowDown', altKey: true })).toBe('none');
    expect(suggestKey({ key: 'ArrowUp', metaKey: true })).toBe('none');
  });

  it('laat Shift+Enter met rust, want twee van de vijf vakken zijn een textarea', () => {
    expect(suggestKey({ key: 'Enter', shiftKey: true })).toBe('none');
    // Shift alone on an arrow is still walking the list.
    expect(suggestKey({ key: 'ArrowDown', shiftKey: true })).toBe('down');
  });

  it('laat een Enter midden in een IME-compositie met rust', () => {
    // That Enter is committing a Japanese candidate, not choosing a row — the
    // same guard `MentionPopover` has carried since round 18.
    expect(suggestKey({ key: 'Enter', isComposing: true })).toBe('none');
  });

  it('bemoeit zich niet met de rest', () => {
    expect(suggestKey({ key: 'a' })).toBe('none');
    expect(suggestKey({ key: 'Escape' })).toBe('none'); // dat is `useDismiss`
    expect(suggestKey({ key: 'Tab' })).toBe('none');
  });
});

describe('§69 waar de markering heen gaat', () => {
  it('loopt naar beneden en naar boven', () => {
    expect(nextIndex(0, 5, 'down')).toBe(1);
    expect(nextIndex(3, 5, 'up')).toBe(2);
  });

  it('loopt rond, want zes rijen zijn sneller rond dan terug', () => {
    expect(nextIndex(4, 5, 'down')).toBe(0);
    expect(nextIndex(0, 5, 'up')).toBe(4);
  });

  it('pakt de eerste rij bij de eerste ↓, niet de tweede', () => {
    /*
     * -1 is "nothing highlighted yet", which is where these lists start — and
     * this is the bug the e2e spec caught before a person could: clamping -1 to
     * 0 and *then* stepping meant the first press of ↓ skipped the row it was
     * pointing at. Upwards from nothing is the last row, for the same reason.
     */
    expect(nextIndex(-1, 5, 'down')).toBe(0);
    expect(nextIndex(-1, 5, 'up')).toBe(4);
  });

  it('klemt een index die niet meer bestaat', () => {
    // Rows arrive after a fetch and go away when the query changes, so this is
    // the normal case rather than a strange one.
    expect(nextIndex(99, 3, 'down')).toBe(0);
    expect(nextIndex(99, 3, 'up')).toBe(1);
  });

  it('zegt 0 bij een lege lijst in plaats van te rekenen met een deling door nul', () => {
    expect(nextIndex(2, 0, 'down')).toBe(0);
  });
});

describe('§69 welke rij Enter neemt', () => {
  it('neemt de eerste als er nog niets gemarkeerd is', () => {
    /*
     * The decision this item is really about: somebody who types a name and
     * presses Enter means the thing at the top of the list, and making them
     * press ↓ first to say so is the ceremony 5.2 exists to remove.
     */
    expect(rowForEnter(-1, 4)).toBe(0);
  });

  it('neemt de gemarkeerde als er een is', () => {
    expect(rowForEnter(2, 4)).toBe(2);
  });

  it('klemt op de laatste als de lijst korter geworden is', () => {
    expect(rowForEnter(9, 3)).toBe(2);
  });

  it('neemt niets als er geen lijst is', () => {
    expect(rowForEnter(0, 0)).toBeNull();
  });
});
