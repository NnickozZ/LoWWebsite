import { describe, expect, it } from 'vitest';
import { boxAtPoint, leadPlace, pendingPinHolds, type PendingPin } from '@/lib/boards/place';
import {
  CARD_SIZE,
  DEFAULT_STRING_STYLE,
  DEFAULT_STRING_WIDTH,
  type BoardCard,
  type BoardString,
  type Endpoint,
} from '@/lib/boards/merge';

/**
 * §64: een punaise aan een draad houdt vast tot er iets op komt.
 *
 * The regression this pins down was reported like this: "als ik vanuit een lege
 * lijn een artikel toevoeg die nog niet onderdeel is van het dossier en ik klik
 * 'toevoegen aan het dossier' dan spawned hij in los van het einde en niet
 * connected aan de lijn waarvan uit bewoog."
 *
 * A draad let go on bare cork pushes a bare punaise in and ties itself to it
 * (§52). Answering the floating box that opens there upgraded that punaise in
 * place, so the knot survived — but the question was forgotten the instant the
 * box closed, and the bar at the top of the wall, which is where a reader goes
 * next, placed the card in the middle of the view and left the punaise hanging.
 *
 * `pendingPinHolds` is the half of the repair that can be tested without a
 * browser: it is what decides whether the waiting punaise is still worth
 * answering, and every case below is a way the wall can take the lead away
 * between the drop and the card landing — which may be minutes later, across an
 * `await`, a sheet, a confirm and an incoming document.
 */

function pin(id: string, over: Partial<BoardCard> = {}): BoardCard {
  return {
    id,
    kind: 'pin',
    entryId: null,
    assetId: null,
    showImage: false,
    border: null,
    name: '',
    text: '',
    x: 100,
    y: 100,
    rotation: 0,
    scale: 1,
    ...over,
  };
}

function string(id: string, from: Endpoint, to: Endpoint): BoardString {
  return {
    id,
    from,
    to,
    label: '',
    colour: 'red',
    width: DEFAULT_STRING_WIDTH,
    style: DEFAULT_STRING_STYLE,
  };
}

const pending: PendingPin = { pin: 'p1', at: { x: 420, y: 260 } };

/** The wall as it is a moment after the draad was let go on bare cork. */
function freshlyDropped() {
  return {
    cards: [pin('p1'), pin('c1', { kind: 'entry', entryId: 'e1', name: 'Jacob' })],
    strings: [string('s1', { card: 'c1' }, { card: 'p1' })],
  };
}

describe('pendingPinHolds', () => {
  it('holds on a bare punaise with a draad tied to it', () => {
    expect(pendingPinHolds({ pending, ...freshlyDropped() })).toBe(true);
  });

  it('holds whichever end of the draad the punaise is on', () => {
    const wall = freshlyDropped();
    expect(
      pendingPinHolds({
        pending,
        cards: wall.cards,
        strings: [string('s1', { card: 'p1' }, { card: 'c1' })],
      }),
    ).toBe(true);
  });

  it('holds however long the box has been shut', () => {
    // There is deliberately no clock in this: "tot er iets op komt" means until
    // something comes. A lead a reader left on the wall while they read an
    // artikel in another tab is still the lead they drew, and an expiry would
    // have made the repair work only for the fast hand.
    const wall = freshlyDropped();
    expect(pendingPinHolds({ pending, ...wall })).toBe(true);
    expect(pendingPinHolds({ pending, ...wall })).toBe(true);
  });

  it('lets go when nothing is waiting', () => {
    expect(pendingPinHolds({ pending: null, ...freshlyDropped() })).toBe(false);
  });

  it('lets go when the punaise is off the wall', () => {
    // An undo, this hand's own delete, or somebody else's. Nothing to upgrade,
    // and `putCard` would otherwise patch a card that is not there — a silent
    // no-op, which is worse than the bug: no card at all.
    const wall = freshlyDropped();
    expect(
      pendingPinHolds({ pending, cards: wall.cards.filter((c) => c.id !== 'p1'), strings: wall.strings }),
    ).toBe(false);
  });

  it('lets go once the punaise carries a name', () => {
    // Somebody labelled it, so it is a thing they made on purpose. Answering
    // the question now would overwrite work nobody asked it to.
    const wall = freshlyDropped();
    expect(
      pendingPinHolds({ pending, cards: [pin('p1', { name: 'Wie?' })], strings: wall.strings }),
    ).toBe(false);
  });

  it('lets go once the punaise has become something else', () => {
    const wall = freshlyDropped();
    expect(
      pendingPinHolds({
        pending,
        cards: [pin('p1', { kind: 'note', name: '' })],
        strings: wall.strings,
      }),
    ).toBe(false);
  });

  it('lets go when no draad is tied to it any more', () => {
    // A punaise with no draad left is not "aan een draad", so there is no
    // question open and a card must not drop on the reader out of nowhere.
    expect(pendingPinHolds({ pending, cards: freshlyDropped().cards, strings: [] })).toBe(false);
  });

  it('is not fooled by a draad that ends at a bare point', () => {
    // An endpoint can be `{ x, y }` rather than `{ card }`; reading `.card` off
    // one of those would have matched `undefined` against nothing and been
    // harmless, but the other way round — a loose end treated as this punaise —
    // is what `isCardEnd` is there to refuse.
    expect(
      pendingPinHolds({
        pending,
        cards: freshlyDropped().cards,
        strings: [string('s1', { card: 'c1' }, { x: 420, y: 260 })],
      }),
    ).toBe(false);
  });

  it('is not fooled by a draad between two other cards', () => {
    const cards = [pin('p1'), pin('a'), pin('b')];
    expect(
      pendingPinHolds({ pending, cards, strings: [string('s1', { card: 'a' }, { card: 'b' })] }),
    ).toBe(false);
  });
});

describe('boxAtPoint', () => {
  it('centres the card on the point the hand let go of', () => {
    expect(boxAtPoint({ x: 500, y: 400 }, { width: 160, height: 250 })).toEqual({
      x: 420,
      y: 275,
    });
  });

  it('rounds to whole board units', () => {
    // The document holds integers; a half-unit would come back from the server
    // as whatever JSON did with it and move the card by a pixel on every save.
    expect(boxAtPoint({ x: 101, y: 101 }, { width: 161, height: 161 })).toEqual({
      x: 21,
      y: 21,
    });
  });

  it('is the answer `putCard` used to work out for itself', () => {
    // Moved out of the component unchanged, so this is a pin rather than a new
    // decision: the old three lines were `round(at - CARD_WIDTH / 2)` and
    // `round(at - CARD_SIZE.height / 2)`.
    const at = { x: 333, y: 777 };
    expect(boxAtPoint(at, { width: CARD_SIZE.width, height: CARD_SIZE.height })).toEqual({
      x: Math.round(at.x - CARD_SIZE.width / 2),
      y: Math.round(at.y - CARD_SIZE.height / 2),
    });
  });
});

describe('leadPlace', () => {
  it('answers with the punaise, not with the point the draad was dropped at', () => {
    // The reviewer's second finding. The stored `at` is a fallback and nothing
    // more: a card that took it would spring back to where the draad was first
    // let go of — dragging the draad with it, since the draad is tied to this
    // very card. `onto` is the whole answer, and the component applies no box at
    // all on that branch, so the card inherits wherever the punaise stands now.
    const wall = freshlyDropped();
    const moved = wall.cards.map((c) => (c.id === 'p1' ? pin('p1', { x: 900, y: 640 }) : c));
    const place = leadPlace({ pending, cards: moved, strings: wall.strings });
    expect(place).toEqual({ onto: 'p1', at: pending.at });
    // Still the punaise's id after a 600-unit drag — nothing about the answer
    // depends on where the punaise was when the lead was armed.
    expect(place?.onto).toBe('p1');
  });

  it('is nothing when no lead is waiting', () => {
    expect(leadPlace({ pending: null, ...freshlyDropped() })).toBeNull();
  });

  it('is nothing once the lead has stopped holding', () => {
    expect(leadPlace({ pending, cards: freshlyDropped().cards, strings: [] })).toBeNull();
  });

  it('answers the lead it is given, never an older punaise still on the wall', () => {
    /*
     * Two leads can be waiting at once, because cancelling keeps one: drop a
     * draad and press Escape, then drop a second one. The wall then holds two
     * bare punaises, each on its own draad, and both of them "hold" — so which
     * one is answered cannot be read off the wall. It is whichever the component
     * last wrote down (`pendingPin.current`, overwritten on every drop), and this
     * is the half of that which can be pinned: nothing here ever looks for a
     * holding punaise of its own, so the stale one can never be answered by
     * accident and is left standing exactly where it is.
     */
    const cards = [
      pin('p1'),
      pin('p2', { x: 800, y: 520 }),
      pin('c1', { kind: 'entry', entryId: 'e1', name: 'Jacob' }),
    ];
    const strings = [
      string('s1', { card: 'c1' }, { card: 'p1' }),
      string('s2', { card: 'c1' }, { card: 'p2' }),
    ];
    expect(pendingPinHolds({ pending, cards, strings })).toBe(true);
    const newest: PendingPin = { pin: 'p2', at: { x: 790, y: 500 } };
    expect(leadPlace({ pending: newest, cards, strings })).toEqual({ onto: 'p2', at: newest.at });
    // And the older one is still a lead in its own right — untouched, not spent.
    expect(leadPlace({ pending, cards, strings })).toEqual({ onto: 'p1', at: pending.at });
  });

  it('can be asked twice and answers the same, so a dismissed sheet loses nothing', () => {
    /*
     * The reviewer's first finding, pinned from the pure side.
     *
     * Pressing "'Jacob' aanmaken" used to consume the lead where the row was
     * pressed; closing the nieuw-artikel sheet without saving then left the
     * punaise on the wall with nothing holding it, and the next pick from the bar
     * spawned the card loose in the middle of the view — the reported bug, back.
     *
     * Consumption now happens in `putCard`, at the instant a card is hung up, so
     * nothing that merely *might* place a card touches the lead. This is the
     * property that makes that safe: asking is free and repeatable, and the wall
     * being untouched (which is exactly what a dismissed sheet leaves behind)
     * means the second answer is the first one.
     */
    const wall = freshlyDropped();
    const first = leadPlace({ pending, ...wall });
    expect(first).toEqual({ onto: 'p1', at: pending.at });
    expect(leadPlace({ pending, ...wall })).toEqual(first);
  });
});
