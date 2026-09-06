import { describe, expect, it } from 'vitest';
import {
  boardBounds,
  cardBox,
  cardSize,
  CARD_SIZE,
  normaliseCardScale,
  pinTagLines,
  PIN_TAG_MAX_WIDTH,
  endpointsEqual,
  headOf,
  isCardEnd,
  mergeBoardState,
  normaliseState,
  TOMBSTONE_LIMIT,
  TOMBSTONE_TTL_MS,
  placementRotation,
  stringColourValue,
  stringDash,
  DEFAULT_STRING_STYLE,
  DEFAULT_STRING_WIDTH,
  STRING_COLOURS,
  STRING_WIDTH_PRESETS,
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
    scale: 1,
    ...over,
  };
}

/** Card ids for brevity; the model stores endpoints, so wrap them here. */
function line(id: string, from: string, to: string, over: Partial<BoardString> = {}): BoardString {
  return {
    id,
    from: { card: from },
    to: { card: to },
    label: '',
    colour: 'red',
    width: DEFAULT_STRING_WIDTH,
    style: 'solid',
    ...over,
  };
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

describe('a deletion is remembered, so a stale client cannot undo it', () => {
  /**
   * The bug this exists for: two people at one wall, one deletes a card while
   * the other is mid-drag. The dragging client defers the change (by design —
   * applying it would yank the card out from under the pointer), and then saves
   * a document that still contains the deleted card. Merging by id alone reads
   * that as an update and puts the card back, so the deletion undoes itself a
   * few seconds after it was made.
   */
  it('drops an incoming card the wall has already buried', () => {
    const afterDelete = mergeBoardState(base, { deletedCardIds: ['b'] });
    expect(afterDelete.cards.map((c) => c.id)).toEqual(['a']);

    // The other client, still holding both cards, saves what it believes.
    const stale = mergeBoardState(afterDelete, { cards: [card('a'), card('b', { x: 999 })] });
    expect(stale.cards.map((c) => c.id)).toEqual(['a']);
  });

  it('drops an incoming string whose deletion has been recorded', () => {
    const afterDelete = mergeBoardState(base, { deletedStringIds: ['s1'] });
    expect(afterDelete.strings).toEqual([]);

    const stale = mergeBoardState(afterDelete, {
      cards: [card('a'), card('b')],
      strings: [line('s1', 'a', 'b')],
    });
    expect(stale.strings).toEqual([]);
  });

  it('still lets a genuinely new card through', () => {
    const afterDelete = mergeBoardState(base, { deletedCardIds: ['b'] });
    const withNew = mergeBoardState(afterDelete, { cards: [card('a'), card('c')] });
    expect(withNew.cards.map((c) => c.id).sort()).toEqual(['a', 'c']);
  });

  it('lets undo put a card back, because that is deliberate', () => {
    const afterDelete = mergeBoardState(base, { deletedCardIds: ['b'] });
    const undone = mergeBoardState(afterDelete, {
      cards: [card('a'), card('b')],
      restoredCardIds: ['b'],
    });
    expect(undone.cards.map((c) => c.id).sort()).toEqual(['a', 'b']);

    // And the tombstone is gone, so the next ordinary save keeps it.
    const later = mergeBoardState(undone, { cards: [card('a'), card('b', { x: 40 })] });
    expect(later.cards.find((c) => c.id === 'b')!.x).toBe(40);
  });

  it('forgets a deletion once it is old enough to be no danger', () => {
    const now = Date.now();
    const afterDelete = mergeBoardState(base, { deletedCardIds: ['b'] }, now);
    expect(afterDelete.deleted?.cards.b).toBe(now);

    const muchLater = now + TOMBSTONE_TTL_MS + 1000;
    const pruned = mergeBoardState(afterDelete, {}, muchLater);
    expect(pruned.deleted?.cards.b).toBeUndefined();
  });

  it('keeps the record bounded, newest first', () => {
    const now = Date.now();
    const many: Record<string, number> = {};
    for (let i = 0; i < TOMBSTONE_LIMIT + 50; i++) many[`c_${i}`] = now - i;
    const state = normaliseState({ cards: [], strings: [], deleted: { cards: many, strings: {} } }, now);
    const kept = Object.keys(state.deleted!.cards);
    expect(kept.length).toBe(TOMBSTONE_LIMIT);
    expect(kept).toContain('c_0');
    expect(kept).not.toContain(`c_${TOMBSTONE_LIMIT + 40}`);
  });

  it('opens a board saved before any of this existed', () => {
    const old = { cards: [card('a')], strings: [], viewport: { x: 0, y: 0, zoom: 1 } };
    const merged = mergeBoardState(old, { cards: [card('a', { x: 12 })] });
    expect(merged.cards.find((c) => c.id === 'a')!.x).toBe(12);
    expect(merged.deleted).toEqual({ cards: {}, strings: {} });
  });
});

describe('normaliseState', () => {
  it('survives rubbish', () => {
    expect(normaliseState(null)).toEqual({
      cards: [],
      strings: [],
      viewport: { x: 0, y: 0, zoom: 1 },
      deleted: { cards: {}, strings: {} },
    });
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

describe('string colour, thickness and kind', () => {
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

  it('keeps a thickness inside the range and rounds it to a tenth', () => {
    const state = normaliseState({
      cards: [card('a'), card('b'), card('c')],
      strings: [
        line('s1', 'a', 'b', { width: 6.5 }),
        { id: 's2', from: { card: 'b' }, to: { card: 'c' }, label: '', width: 4.04 },
      ],
    });
    expect(state.strings.find((s) => s.id === 's1')!.width).toBe(6.5);
    expect(state.strings.find((s) => s.id === 's2')!.width).toBe(4);
  });

  it('clamps a thickness below 1 and above 8, and refuses anything that is not a number', () => {
    const state = normaliseState({
      cards: [card('a'), card('b'), card('c'), card('d')],
      strings: [
        { id: 's1', from: { card: 'a' }, to: { card: 'b' }, label: '', width: 0.2 },
        { id: 's2', from: { card: 'b' }, to: { card: 'c' }, label: '', width: 400 },
        { id: 's3', from: { card: 'c' }, to: { card: 'd' }, label: '', width: '4px' },
      ],
    });
    const widthOf = (id: string) => state.strings.find((s) => s.id === id)!.width;
    expect(widthOf('s1')).toBe(1);
    expect(widthOf('s2')).toBe(8);
    // Nothing but a finite number reaches a style attribute; the rest is the default.
    expect(widthOf('s3')).toBe(DEFAULT_STRING_WIDTH);
  });

  it('keeps a known kind of string and falls back for anything else', () => {
    const state = normaliseState({
      cards: [card('a'), card('b'), card('c')],
      strings: [
        line('s1', 'a', 'b', { style: 'dashdot' }),
        { id: 's2', from: { card: 'b' }, to: { card: 'c' }, label: '', style: 'zigzag' },
      ],
    });
    expect(state.strings.find((s) => s.id === 's1')!.style).toBe('dashdot');
    expect(state.strings.find((s) => s.id === 's2')!.style).toBe(DEFAULT_STRING_STYLE);
  });

  it('opens a board saved before a string had a thickness or a kind', () => {
    // The state is one JSON blob and there is no migration: every board that
    // was ever saved comes back as the 2-unit unbroken line it was drawn as.
    const state = normaliseState({
      cards: [card('a'), card('b')],
      strings: [{ id: 's1', from: { card: 'a' }, to: { card: 'b' }, label: 'old', colour: 'blue' }],
    });
    expect(state.strings[0].width).toBe(2);
    expect(state.strings[0].style).toBe('solid');
    expect(state.strings[0].colour).toBe('blue');
    expect(state.strings[0].label).toBe('old');
  });

  it('merges a thickness change without touching the label or the colour', () => {
    const thick = STRING_WIDTH_PRESETS[2];
    const merged = mergeBoardState(base, {
      strings: [line('s1', 'a', 'b', { label: 'seen together', width: thick })],
    });
    expect(merged.strings[0].width).toBe(thick);
    expect(merged.strings[0].label).toBe('seen together');
    expect(merged.strings[0].colour).toBe('red');
    expect(merged.cards).toHaveLength(2);
  });

  it('gives every kind of string its dash pattern, scaled to the thickness', () => {
    // Unbroken: nothing to dash, and a double line is two whole strokes.
    expect(stringDash('solid', 2)).toBeUndefined();
    expect(stringDash('double', 4)).toBeUndefined();
    expect(stringDash(undefined, 2)).toBeUndefined();

    expect(stringDash('dashed', 2)).toBe('6 4.4');
    // A zero-length dash under a round cap is a dot.
    expect(stringDash('dotted', 2)).toBe('0.02 4.8');
    expect(stringDash('dashdot', 2)).toBe('6 4 0.02 4');

    // Thicker string, longer dashes — otherwise a fat dashed line reads as dots.
    expect(stringDash('dashed', 6.5)).toBe('19.5 14.3');
    // And a thickness off the wire is clamped here too.
    expect(stringDash('dashed', 400)).toBe(stringDash('dashed', 8));
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
      strings: [line('s1', 'a', 'c', { label: 'seen together' })],
    });
    expect(merged.strings[0].to).toEqual({ card: 'c' });
  });

  it('merges an end pulled off onto bare cork', () => {
    const merged = mergeBoardState(base, {
      strings: [{ ...line('s1', 'a', 'b'), to: at(900, 120) }],
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
    // A pin's box now comes from its label — an unlabelled one, and any label
    // that already fitted on the tag, is exactly the pin that was always here.
    expect(cardSize({ kind: 'pin', name: '' })).toEqual(PIN_SIZE);
    expect(cardSize({ kind: 'pin', name: 'de haven' })).toEqual(PIN_SIZE);
    expect(cardSize({ kind: 'note' })).toEqual(CARD_SIZE);
    const head = headOf({ kind: 'pin', x: 100, y: 200 });
    expect(head.x).toBe(100 + PIN_SIZE.width / 2);
    expect(head.y).toBeLessThan(200 + PIN_SIZE.height / 2);
  });

  it('grows its tag downward rather than clipping a long label', () => {
    const long = 'de man met de grijze jas die bij de vuurtoren stond';
    const size = cardSize({ kind: 'pin', name: long });
    // Capped in width, so no pin lays a banner across the cork…
    expect(size.width).toBe(PIN_TAG_MAX_WIDTH);
    // …and taller than one line, so every word of it is on the wall.
    expect(pinTagLines(long)).toBeGreaterThan(1);
    expect(size.height).toBeGreaterThan(PIN_SIZE.height);
    expect(size.height).toBe(PIN_SIZE.height + (pinTagLines(long) - 1) * 18);
  });

  it('counts the lines a pasted word with no spaces in it takes', () => {
    expect(pinTagLines('')).toBe(1);
    expect(pinTagLines('   ')).toBe(1);
    const wall = 'x'.repeat(200);
    const lines = pinTagLines(wall);
    expect(lines).toBeGreaterThan(8);
    // Every character is accounted for: nothing falls off the bottom either.
    expect(lines * 19).toBeGreaterThanOrEqual(200);
    expect(cardSize({ kind: 'pin', name: wall }).width).toBe(PIN_TAG_MAX_WIDTH);
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
      { ...card('p', { x: 500, y: 0 }), kind: 'pin', name: '' },
    ]);
    expect(bounds.width).toBe(500 + PIN_SIZE.width);
    expect(bounds.height).toBe(CARD_SIZE.height);
  });
});

describe('how big a card is drawn', () => {
  it('is 1 on every card that was ever saved without one', () => {
    const state = normaliseState({
      cards: [{ id: 'a', kind: 'note', name: 'a', text: '', x: 0, y: 0, rotation: 0 }],
    });
    expect(state.cards[0].scale).toBe(1);
  });

  it('clamps to half and five times, and refuses nonsense', () => {
    const state = normaliseState({
      cards: [
        card('small', { scale: 0.01 }),
        card('huge', { scale: 40 }),
        card('nan', { scale: Number.NaN }),
        card('text', { scale: '2' as unknown as number }),
      ],
    });
    expect(state.cards[0].scale).toBe(0.5);
    expect(state.cards[1].scale).toBe(5);
    expect(state.cards[2].scale).toBe(1);
    expect(state.cards[3].scale).toBe(1);
  });

  it('quantises to a hundredth, so nothing long reaches a style attribute', () => {
    const state = normaliseState({ cards: [card('a', { scale: 1.7000000000000002 })] });
    expect(state.cards[0].scale).toBe(1.7);
    expect(normaliseCardScale(2.3456)).toBe(2.35);
  });

  it('leaves the box exactly where it was at 1, and grows it about the middle', () => {
    const still = cardBox(card('a', { x: 100, y: 200 }));
    expect(still).toEqual({ x: 100, y: 200, width: CARD_SIZE.width, height: CARD_SIZE.height });

    const big = cardBox(card('b', { x: 100, y: 200, scale: 2 }));
    expect(big.width).toBe(CARD_SIZE.width * 2);
    expect(big.height).toBe(CARD_SIZE.height * 2);
    // Same middle: the card grew evenly rather than walking down and right.
    expect(big.x + big.width / 2).toBe(100 + CARD_SIZE.width / 2);
    expect(big.y + big.height / 2).toBe(200 + CARD_SIZE.height / 2);
  });

  it('ties string to the head of the card you can see', () => {
    const plain = headOf(card('a', { x: 0, y: 0 }));
    expect(plain).toEqual({ x: CARD_SIZE.width / 2, y: 10 });

    const big = headOf(card('b', { x: 0, y: 0, scale: 3 }));
    // Still over the middle, and the head's own offset is multiplied too — the
    // string ties to the pin drawn on the paper, not to a point in mid-air a
    // card's width above it.
    expect(big.x).toBe(CARD_SIZE.width / 2);
    expect(big.y).toBe(cardBox(card('b', { x: 0, y: 0, scale: 3 })).y + 30);
  });

  it('boxes a card that was made bigger inside Fit all', () => {
    const bounds = boardBounds([card('a', { x: 0, y: 0, scale: 2 })]);
    expect(bounds.x).toBe(-CARD_SIZE.width / 2);
    expect(bounds.width).toBe(CARD_SIZE.width * 2);
    expect(bounds.height).toBe(CARD_SIZE.height * 2);
  });

  it('rides through a merge like every other thing on a card', () => {
    const merged = mergeBoardState({ cards: [card('a')] }, { cards: [card('a', { scale: 2.5 })] });
    expect(merged.cards[0].scale).toBe(2.5);
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
