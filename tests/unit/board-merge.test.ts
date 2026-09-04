import { describe, expect, it } from 'vitest';
import {
  boardBounds,
  cardSize,
  CARD_SIZE,
  endpointsEqual,
  headOf,
  isCardEnd,
  mergeBoardState,
  normaliseState,
  placementRotation,
  stringColourValue,
  STRING_COLOURS,
  type BoardCard,
  type BoardState,
  type BoardString,
  type Endpoint,
  PIN_SIZE,
  sameEnds,
} from '@/lib/boards/merge';

function card(id: string, over: Partial<BoardCard> = {}): BoardCard {
  return {
    id,
    kind: 'entry',
    entryId: `e_${id}`,
    assetId: null,
    crop: null,
    showImage: true,
    border: null,
    name: id,
    text: '',
    x: 0,
    y: 0,
    rotation: 0,
    ...over,
  };
}

/** Card ids for brevity; the model stores endpoints, so wrap them here. */
function line(id: string, from: string, to: string, over: Partial<BoardString> = {}): BoardString {
  return { id, from: { card: from }, to: { card: to }, label: '', colour: 'red', ...over };
}

function at(x: number, y: number): Endpoint {
  return { x, y };
}

const base: BoardState = {
  cards: [card('a'), card('b')],
  strings: [line('s1', 'a', 'b', { label: 'seen together' })],
  viewport: { x: 0, y: 0, zoom: 1 },
};

describe('mergeBoardState', () => {
  it('applies incoming positions and text', () => {
    const merged = mergeBoardState(base, {
      cards: [card('a', { x: 120, y: 40, text: 'moved' })],
    });
    const a = merged.cards.find((c) => c.id === 'a')!;
    expect(a.x).toBe(120);
    expect(a.text).toBe('moved');
  });

  it('keeps cards the client has never heard of', () => {
    // Someone else added 'z' a second ago; this client's save must not wipe it.
    const withOther = { ...base, cards: [...base.cards, card('z')] };
    const merged = mergeBoardState(withOther, { cards: [card('a', { x: 10 })] });
    expect(merged.cards.map((c) => c.id).sort()).toEqual(['a', 'b', 'z']);
  });

  it('deletes only what was explicitly deleted', () => {
    const merged = mergeBoardState(base, { cards: [card('a')], deletedCardIds: ['b'] });
    expect(merged.cards.map((c) => c.id)).toEqual(['a']);
  });

  it('drops strings whose card is gone', () => {
    const merged = mergeBoardState(base, { deletedCardIds: ['b'] });
    expect(merged.strings).toHaveLength(0);
  });

  it('adds a new string and keeps the existing one', () => {
    const withThird = { ...base, cards: [...base.cards, card('c')] };
    const merged = mergeBoardState(withThird, {
      cards: [card('a'), card('b'), card('c')],
      strings: [
        line('s1', 'a', 'b', { label: 'seen together' }),
        line('s2', 'b', 'c', { label: 'same night' }),
      ],
    });
    expect(merged.strings.map((s) => s.id).sort()).toEqual(['s1', 's2']);
  });

  it('deletes strings explicitly', () => {
    const merged = mergeBoardState(base, { deletedStringIds: ['s1'] });
    expect(merged.strings).toHaveLength(0);
    expect(merged.cards).toHaveLength(2);
  });

  it('an empty patch changes nothing', () => {
    const merged = mergeBoardState(base, {});
    expect(merged.cards).toHaveLength(2);
    expect(merged.strings).toHaveLength(1);
  });

  it('two clients moving different cards both win', () => {
    const first = mergeBoardState(base, { cards: [card('a', { x: 100 })] });
    const second = mergeBoardState(first, { cards: [card('b', { x: 300 })] });
    expect(second.cards.find((c) => c.id === 'a')!.x).toBe(100);
    expect(second.cards.find((c) => c.id === 'b')!.x).toBe(300);
  });
});

describe('normaliseState', () => {
  it('survives rubbish', () => {
    expect(normaliseState(null)).toEqual({ cards: [], strings: [], viewport: { x: 0, y: 0, zoom: 1 } });
    expect(normaliseState({ cards: 'nope', strings: 7 }).cards).toEqual([]);
  });

  it('drops a string that points at a missing or identical card', () => {
    const state = normaliseState({
      cards: [card('a')],
      strings: [line('s1', 'a', 'ghost'), line('s2', 'a', 'a')],
    });
    expect(state.strings).toHaveLength(0);
  });

  it('clamps zoom and rotation', () => {
    const state = normaliseState({
      cards: [card('a', { rotation: 45 })],
      viewport: { x: 0, y: 0, zoom: 99 },
    });
    expect(state.cards[0].rotation).toBeLessThanOrEqual(6);
    expect(state.viewport.zoom).toBeLessThanOrEqual(3);
  });

  it('caps runaway text', () => {
    const state = normaliseState({ cards: [card('a', { text: 'x'.repeat(9000) })] });
    expect(state.cards[0].text.length).toBe(4000);
  });
});

describe('placement and bounds', () => {
  it('rotates within ±2°', () => {
    for (let i = 0; i < 50; i++) {
      const rotation = placementRotation();
      expect(rotation).toBeGreaterThanOrEqual(-2);
      expect(rotation).toBeLessThanOrEqual(2);
    }
  });

  it('boxes every card for Fit all', () => {
    const bounds = boardBounds([card('a', { x: 0, y: 0 }), card('b', { x: 300, y: 100 })], 160, 250);
    expect(bounds).toEqual({ x: 0, y: 0, width: 460, height: 350 });
  });

  it('gives an empty board a sane box', () => {
    expect(boardBounds([], 160, 250)).toEqual({ x: 0, y: 0, width: 160, height: 250 });
  });
});

describe('string colour', () => {
  it('keeps a known colour and falls back for anything else', () => {
    const state = normaliseState({
      cards: [card('a'), card('b'), card('c')],
      strings: [
        line('s1', 'a', 'b', { colour: 'violet' }),
        { id: 's2', from: { card: 'b' }, to: { card: 'c' }, label: '', colour: 'chartreuse' },
      ],
    });
    expect(state.strings.find((s) => s.id === 's1')!.colour).toBe('violet');
    // Anything off the palette becomes red rather than reaching a style attribute.
    expect(state.strings.find((s) => s.id === 's2')!.colour).toBe('red');
  });

  it('resolves a colour key to CSS, defaulting to the string red', () => {
    expect(stringColourValue('blue')).toBe(STRING_COLOURS.blue);
    expect(stringColourValue(undefined)).toBe(STRING_COLOURS.red);
  });

  it('survives a board saved before colours existed', () => {
    const state = normaliseState({
      cards: [card('a'), card('b')],
      strings: [{ id: 's1', from: { card: 'a' }, to: { card: 'b' }, label: 'old' }],
    });
    expect(state.strings[0].colour).toBe('red');
    expect(state.strings[0].label).toBe('old');
  });

  it('merges a colour change without touching anything else', () => {
    const merged = mergeBoardState(base, {
      strings: [line('s1', 'a', 'b', { label: 'seen together', colour: 'green' })],
    });
    expect(merged.strings[0].colour).toBe('green');
    expect(merged.strings[0].label).toBe('seen together');
    expect(merged.cards).toHaveLength(2);
  });
});

describe('card pictures', () => {
  it('keeps a crop for a card that has an image', () => {
    const state = normaliseState({
      cards: [card('a', { assetId: 'img1', crop: { x: 0.2, y: 0.8, zoom: 2 } })],
    });
    expect(state.cards[0].crop).toEqual({ x: 0.2, y: 0.8, zoom: 2 });
  });

  it('keeps a crop on a card with no picture of its own', () => {
    // An entry card crops the *entry's* cover for this board alone, so a crop
    // without an assetId is meaningful. Removing a photo clears both.
    const state = normaliseState({
      cards: [card('a', { assetId: null, crop: { x: 0.2, y: 0.8, zoom: 2 } })],
    });
    expect(state.cards[0].crop).toEqual({ x: 0.2, y: 0.8, zoom: 2 });
  });

  it('clamps a crop to the frame', () => {
    const state = normaliseState({
      cards: [card('a', { assetId: 'img1', crop: { x: -3, y: 9, zoom: 99 } })],
    });
    expect(state.cards[0].crop).toEqual({ x: 0, y: 1, zoom: 4 });
  });

  it('leaves a card with no crop of its own alone', () => {
    // Null is not "centred": it means "use whatever the entry's cover says",
    // which is decided at render time, not here.
    const state = normaliseState({ cards: [card('a', { assetId: 'img1' })] });
    expect(state.cards[0].crop).toBeNull();
  });

  it('keeps the picture frame on unless it was explicitly switched off', () => {
    const state = normaliseState({
      cards: [
        { id: 'a', kind: 'note', name: 'a', text: '', x: 0, y: 0, rotation: 0 },
        card('b', { showImage: false }),
      ],
    });
    expect(state.cards[0].showImage).toBe(true);
    expect(state.cards[1].showImage).toBe(false);
  });

  it('lets a note gain a picture through a merge', () => {
    const merged = mergeBoardState(
      { cards: [card('a', { kind: 'note' })], strings: [], viewport: { x: 0, y: 0, zoom: 1 } },
      { cards: [card('a', { kind: 'note', assetId: 'img9', crop: { x: 0.5, y: 0.3, zoom: 1.4 } })] },
    );
    expect(merged.cards[0].assetId).toBe('img9');
    expect(merged.cards[0].crop).toEqual({ x: 0.5, y: 0.3, zoom: 1.4 });
  });
});

describe('string endpoints', () => {
  it('ties an end to a card or to a bare point', () => {
    const state = normaliseState({
      cards: [card('a')],
      strings: [{ id: 's1', from: { card: 'a' }, to: at(400, 220), label: 'a lead', colour: 'red' }],
    });
    expect(state.strings).toHaveLength(1);
    expect(isCardEnd(state.strings[0].from)).toBe(true);
    expect(state.strings[0].to).toEqual({ x: 400, y: 220 });
  });

  it('keeps a loose end when the card at the other end survives', () => {
    const state = normaliseState({
      cards: [card('a'), card('b')],
      strings: [
        { id: 's1', from: { card: 'a' }, to: at(10, 10), label: '', colour: 'red' },
        { id: 's2', from: { card: 'ghost' }, to: at(10, 10), label: '', colour: 'red' },
      ],
    });
    expect(state.strings.map((s) => s.id)).toEqual(['s1']);
  });

  it('drops a string whose two ends are the same place', () => {
    const state = normaliseState({
      cards: [card('a')],
      strings: [{ id: 's1', from: at(5, 5), to: at(5, 5), label: '', colour: 'red' }],
    });
    expect(state.strings).toHaveLength(0);
  });

  it('opens a board saved before loose ends existed', () => {
    // Endpoints used to be bare card ids. Those boards must still load.
    const state = normaliseState({
      cards: [card('a'), card('b')],
      strings: [{ id: 's1', from: 'a', to: 'b', label: 'old shape', colour: 'blue' }],
    });
    expect(state.strings[0].from).toEqual({ card: 'a' });
    expect(state.strings[0].to).toEqual({ card: 'b' });
    expect(state.strings[0].colour).toBe('blue');
  });

  it('compares endpoints by what they are tied to', () => {
    expect(endpointsEqual({ card: 'a' }, { card: 'a' })).toBe(true);
    expect(endpointsEqual({ card: 'a' }, { card: 'b' })).toBe(false);
    expect(endpointsEqual(at(3, 4), at(3, 4))).toBe(true);
    expect(endpointsEqual(at(3, 4), at(3, 5))).toBe(false);
    expect(endpointsEqual({ card: 'a' }, at(3, 4))).toBe(false);
  });

  it('merges an end moved onto another card', () => {
    const withThird = { ...base, cards: [...base.cards, card('c')] };
    const merged = mergeBoardState(withThird, {
      strings: [{ id: 's1', from: { card: 'a' }, to: { card: 'c' }, label: 'seen together', colour: 'red' }],
    });
    expect(merged.strings[0].to).toEqual({ card: 'c' });
  });

  it('merges an end pulled off onto bare cork', () => {
    const merged = mergeBoardState(base, {
      strings: [{ id: 's1', from: { card: 'a' }, to: at(900, 120), label: '', colour: 'red' }],
    });
    expect(merged.strings[0].to).toEqual({ x: 900, y: 120 });
  });
});

describe('card borders', () => {
  it('keeps a known override and refuses anything else', () => {
    const state = normaliseState({
      cards: [card('a', { border: 'tape' }), card('b', { border: 'neon' })],
    });
    expect(state.cards[0].border).toBe('tape');
    // Not a border we ship: falls back rather than reaching a class name.
    expect(state.cards[1].border).toBe('solid');
  });

  it('leaves a card with no override to inherit from its type', () => {
    const state = normaliseState({ cards: [card('a')] });
    expect(state.cards[0].border).toBeNull();
  });
});

describe('bare pins', () => {
  it('is a card kind that survives normalising', () => {
    const state = normaliseState({
      cards: [
        { id: 'p1', kind: 'pin', name: 'the harbour?', text: '', x: 40, y: 60, rotation: 0 },
        { id: 'x', kind: 'sticker', name: 'no such thing', text: '', x: 0, y: 0, rotation: 0 },
      ],
    });
    expect(state.cards[0].kind).toBe('pin');
    // Anything unknown is an entry card, as before.
    expect(state.cards[1].kind).toBe('entry');
  });

  it('is smaller than a card, and its head is where string ties on', () => {
    expect(cardSize({ kind: 'pin' })).toEqual(PIN_SIZE);
    expect(cardSize({ kind: 'note' })).toEqual(CARD_SIZE);
    const head = headOf({ kind: 'pin', x: 100, y: 200 });
    expect(head.x).toBe(100 + PIN_SIZE.width / 2);
    expect(head.y).toBeLessThan(200 + PIN_SIZE.height / 2);
  });

  it('can have string tied to it like any card', () => {
    const state = normaliseState({
      cards: [card('a'), { id: 'p1', kind: 'pin', name: '', text: '', x: 0, y: 0, rotation: 0 }],
      strings: [line('s1', 'a', 'p1')],
    });
    expect(state.strings).toHaveLength(1);
    expect(state.strings[0].to).toEqual({ card: 'p1' });
  });

  it('is boxed at its own size for Fit all', () => {
    const bounds = boardBounds([
      card('a', { x: 0, y: 0 }),
      { ...card('p', { x: 500, y: 0 }), kind: 'pin' },
    ]);
    expect(bounds.width).toBe(500 + PIN_SIZE.width);
    expect(bounds.height).toBe(CARD_SIZE.height);
  });
});

describe('one string per pair', () => {
  it('drops a second string between the same two cards, either way round', () => {
    const state = normaliseState({
      cards: [card('a'), card('b')],
      strings: [
        line('s1', 'a', 'b', { label: 'first', colour: 'blue' }),
        line('s2', 'a', 'b'),
        line('s3', 'b', 'a'),
      ],
    });
    expect(state.strings.map((s) => s.id)).toEqual(['s1']);
    // The one that stays is the first, with everything that was on it.
    expect(state.strings[0].label).toBe('first');
    expect(state.strings[0].colour).toBe('blue');
  });

  it('keeps strings from one card to several others', () => {
    const state = normaliseState({
      cards: [card('a'), card('b'), card('c')],
      strings: [line('s1', 'a', 'b'), line('s2', 'a', 'c'), line('s3', 'b', 'c')],
    });
    expect(state.strings).toHaveLength(3);
  });

  it('refuses a twin arriving through a merge, and keeps the older one', () => {
    const merged = mergeBoardState(base, {
      strings: [line('s9', 'b', 'a', { label: 'late twin' })],
    });
    expect(merged.strings.map((s) => s.id)).toEqual(['s1']);
    expect(merged.strings[0].label).toBe('seen together');
  });

  it('compares pairs regardless of direction', () => {
    expect(sameEnds(line('x', 'a', 'b'), line('y', 'b', 'a'))).toBe(true);
    expect(sameEnds(line('x', 'a', 'b'), line('y', 'a', 'c'))).toBe(false);
    expect(sameEnds({ from: { card: 'a' }, to: at(1, 2) }, { from: at(1, 2), to: { card: 'a' } })).toBe(true);
  });
});
