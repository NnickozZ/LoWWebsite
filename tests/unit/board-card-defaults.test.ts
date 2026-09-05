import { describe, expect, it } from 'vitest';
import { defaultShowImage, normaliseState, type CardKind } from '@/lib/boards/merge';

/**
 * §8: what a card starts as. A notitie made on the wall used to come into the
 * world with its picture frame open, which drew an empty grey box above the
 * words on a card that has no picture and, nine times out of ten, never will.
 * The rule is now "only a card with something to put in it", and it is a
 * *creation* default: nothing already saved may change under it.
 */
describe('the picture frame a new card starts with', () => {
  it('stays shut for a note and a pin, which hold nothing and stand for nothing', () => {
    expect(defaultShowImage('note')).toBe(false);
    expect(defaultShowImage('pin')).toBe(false);
  });

  it('opens for a photo card, which is made around a picture', () => {
    expect(defaultShowImage('photo')).toBe(true);
  });

  it('opens for the three kinds that stand for something in the archive', () => {
    // Their picture is that thing's — a cover, the landkaart itself — or, until
    // there is one, the icon and colour of its soort, which is how you tell a
    // person from a place across a wall.
    expect(defaultShowImage('entry')).toBe(true);
    expect(defaultShowImage('map')).toBe(true);
    expect(defaultShowImage('case')).toBe(true);
  });

  it('has an answer for every kind of card there is', () => {
    const kinds: CardKind[] = ['entry', 'note', 'photo', 'pin', 'map', 'case'];
    for (const kind of kinds) expect(typeof defaultShowImage(kind)).toBe('boolean');
  });
});

describe('what the default does not touch', () => {
  const bare = {
    id: 'c1',
    kind: 'note' as const,
    name: 'Notitie',
    text: '',
    x: 0,
    y: 0,
    rotation: 0,
  };

  it('leaves a note that was saved with its frame open exactly as it was', () => {
    // No retro-flip: a wall hung before this rule keeps every flag it saved,
    // and it is `BoardCard` that declines to draw a frame with nothing in it.
    const state = normaliseState({ cards: [{ ...bare, showImage: true }] });
    expect(state.cards[0].showImage).toBe(true);
  });

  it('keeps an explicit false intact', () => {
    const state = normaliseState({ cards: [{ ...bare, showImage: false }] });
    expect(state.cards[0].showImage).toBe(false);
  });

  it('still reads a card that never said, as saying yes', () => {
    // `showImage !== false` is the merge rule's own normalisation, and it is
    // not the creation default: a card off the wire that omits the flag
    // predates it and must not silently lose a picture it was showing.
    const state = normaliseState({ cards: [bare] });
    expect(state.cards[0].showImage).toBe(true);
  });
});
