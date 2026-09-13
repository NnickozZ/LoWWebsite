import { describe, expect, it } from 'vitest';
import {
  buildPatch,
  changedIds,
  dropCards,
  emptyDirty,
  isDirty,
  mergeDirty,
  noteChange,
  restoredIds,
  retainUnfindable,
  shouldReadd,
  UNFINDABLE_TRIES,
} from '@/lib/boards/dirty';
import { mergeBoardState, type BoardCard, type BoardString } from '@/lib/boards/merge';

/**
 * §61: the wire shape of a save, and the bookkeeping that decides it.
 *
 * The behaviour this pins down is the difference between "a wall where two
 * people can work" and "a wall where the slower hand wins": the client asserts
 * the cards it touched, and says nothing at all about the rest.
 */

function card(id: string, over: Partial<BoardCard> = {}): BoardCard {
  return {
    id,
    kind: 'note',
    entryId: null,
    assetId: null,
    showImage: false,
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

function line(id: string, from: string, to: string): BoardString {
  return {
    id,
    from: { card: from },
    to: { card: to },
    label: '',
    colour: 'red',
    width: 2,
    style: 'solid',
  };
}

describe('the dirty set', () => {
  it('starts empty and is not worth a save', () => {
    expect(isDirty(emptyDirty())).toBe(false);
  });

  it('collects ids and the viewport separately', () => {
    const dirty = noteChange(emptyDirty(), { cards: ['a'] });
    noteChange(dirty, { cards: ['b'], strings: ['s1'] });
    noteChange(dirty, { viewport: true });
    expect([...dirty.cards].sort()).toEqual(['a', 'b']);
    expect([...dirty.strings]).toEqual(['s1']);
    expect(dirty.viewport).toBe(true);
    expect(dirty.all).toBe(false);
  });

  it('a change that cannot say what it touched sends everything', () => {
    const dirty = noteChange(emptyDirty(), undefined);
    expect(dirty.all).toBe(true);
    expect(isDirty(dirty)).toBe(true);
  });

  it('hands a failed save its ids back', () => {
    const waiting = noteChange(emptyDirty(), { cards: ['new'] });
    const sent = noteChange(emptyDirty(), { cards: ['old'], viewport: true });
    mergeDirty(waiting, sent);
    expect([...waiting.cards].sort()).toEqual(['new', 'old']);
    expect(waiting.viewport).toBe(true);
  });
});

describe('what changed', () => {
  it('is identity, not equality — an untouched card is the very same object', () => {
    const a = card('a');
    const b = card('b');
    const moved = { ...b, x: 40 };
    expect(changedIds([a, b], [a, moved])).toEqual(['b']);
  });

  it('counts a card that is new to the wall', () => {
    const a = card('a');
    expect(changedIds([a], [a, card('fresh')])).toEqual(['fresh']);
  });

  it('says nothing about a card that only left', () => {
    const a = card('a');
    const b = card('b');
    expect(changedIds([a, b], [a])).toEqual([]);
  });
});

describe('what undo brings back', () => {
  it('is only what is actually gone from the wall now', () => {
    const a = card('a');
    const b = card('b');
    const c = card('c');
    // The snapshot holds three; two are still up, so one comes back.
    expect(restoredIds([a, b, c], [a, b])).toEqual(['c']);
  });

  it('is empty when the step changed something rather than removing it', () => {
    const a = card('a');
    expect(restoredIds([a], [{ ...a, x: 9 }])).toEqual([]);
  });

  it('never claims a card somebody else deleted in the meantime', () => {
    const mine = card('mine');
    const theirs = card('theirs');
    // Their card was on the wall when the snapshot was taken and has since
    // been deleted by them. Undo restores mine and says nothing about theirs…
    const snapshot = [mine, theirs];
    const now: BoardCard[] = [];
    // …which it cannot, because both are gone from the wall. What it must not
    // do is assert the *whole snapshot* forever after; the diff is the only
    // thing that keeps the queue honest, so the caller only ever restores what
    // its own step puts back.
    expect(restoredIds(snapshot, now).sort()).toEqual(['mine', 'theirs']);
    expect(restoredIds([mine], now)).toEqual(['mine']);
  });
});

describe('the patch a save sends', () => {
  const cards = [card('a'), card('b'), card('c')];
  const strings = [line('s1', 'a', 'b'), line('s2', 'b', 'c')];
  const viewport = { x: 3, y: 4, zoom: 1.5 };
  const nothingElse = {
    cards,
    strings,
    viewport,
    deletedCardIds: [],
    deletedStringIds: [],
    restoredCardIds: [],
    restoredStringIds: [],
  };

  it('carries the touched cards and nothing else', () => {
    const patch = buildPatch({ dirty: noteChange(emptyDirty(), { cards: ['b'] }), ...nothingElse });
    expect(patch.cards?.map((c) => c.id)).toEqual(['b']);
    expect(patch.strings).toEqual([]);
  });

  it('leaves the viewport out unless this hand moved it', () => {
    const still = buildPatch({ dirty: noteChange(emptyDirty(), { cards: ['b'] }), ...nothingElse });
    expect(still.viewport).toBeUndefined();
    const panned = buildPatch({ dirty: noteChange(emptyDirty(), { viewport: true }), ...nothingElse });
    expect(panned.viewport).toEqual(viewport);
  });

  it('sends the whole document when it does not know what changed', () => {
    const patch = buildPatch({ dirty: noteChange(emptyDirty(), undefined), ...nothingElse });
    expect(patch.cards?.map((c) => c.id)).toEqual(['a', 'b', 'c']);
    expect(patch.strings?.map((s) => s.id)).toEqual(['s1', 's2']);
    expect(patch.viewport).toEqual(viewport);
  });

  it('carries a restored string even when nothing touched it since', () => {
    const patch = buildPatch({
      dirty: emptyDirty(),
      ...nothingElse,
      restoredStringIds: ['s2'],
    });
    expect(patch.strings?.map((s) => s.id)).toEqual(['s2']);
    expect(patch.restoredStringIds).toEqual(['s2']);
  });

  /**
   * The whole point, end to end: a client holding a stale document moves one
   * card, and the card somebody else moved a second ago stays where they put it.
   */
  it('cannot revert a card this hand never touched', () => {
    const wall = {
      cards: [card('a', { x: 0 }), card('b', { x: 0 })],
      strings: [],
      viewport: { x: 0, y: 0, zoom: 1 },
    };
    // Bram moves b on the server.
    const afterBram = mergeBoardState(wall, { cards: [card('b', { x: 500 })] });
    // Aagje, whose pull was deferred by a hand on the wall, moves a. Her
    // browser still believes b is at 0 — and says nothing about it.
    const stale = [card('a', { x: 99 }), card('b', { x: 0 })];
    const patch = buildPatch({
      dirty: noteChange(emptyDirty(), { cards: ['a'] }),
      cards: stale,
      strings: [],
      viewport: wall.viewport,
      deletedCardIds: [],
      deletedStringIds: [],
      restoredCardIds: [],
      restoredStringIds: [],
    });
    const merged = mergeBoardState(afterBram, patch);
    expect(merged.cards.find((c) => c.id === 'a')!.x).toBe(99);
    expect(merged.cards.find((c) => c.id === 'b')!.x).toBe(500);
  });
});

describe('a card the archive refused', () => {
  it('leaves the wall with the strings tied to it', () => {
    const cards = [card('a'), card('b'), card('c')];
    const strings = [line('s1', 'a', 'b'), line('s2', 'b', 'c')];
    const next = dropCards(cards, strings, ['a']);
    expect(next.cards.map((c) => c.id)).toEqual(['b', 'c']);
    expect(next.strings.map((s) => s.id)).toEqual(['s2']);
  });

  it('leaves a string with a loose end alone', () => {
    const loose: BoardString = { ...line('s3', 'b', 'b'), to: { x: 10, y: 10 } };
    const next = dropCards([card('a'), card('b')], [loose], ['a']);
    expect(next.strings.map((s) => s.id)).toEqual(['s3']);
  });
});

describe('what may be pushed back into somebody else’s document', () => {
  /*
   * §61: the ghost card. A pull is the archive's version of the wall, and the
   * wall pushes back into it whatever this hand has done and the archive has not
   * confirmed — otherwise a card made a second ago blinks out between the save
   * and the pull. But a card the other person *deleted* is also absent from that
   * document, and pushing it back left it standing on this screen until
   * something unrelated moved, then posted it back to them on the next save.
   * A tombstone is what tells the two apart.
   */
  const none = new Set<string>();

  it('puts back a card this hand made and the archive has not heard of', () => {
    expect(shouldReadd('new-1', { dirty: new Set(['new-1']), deletedHere: none })).toBe(true);
    expect(
      shouldReadd('new-1', { dirty: new Set(['new-1']), deletedHere: none, tombstones: { other: 1 } }),
    ).toBe(true);
  });

  it('never puts back a card the archive says is gone', () => {
    expect(
      shouldReadd('doomed', { dirty: new Set(['doomed']), deletedHere: none, tombstones: { doomed: 1700000000 } }),
    ).toBe(false);
  });

  it('never puts back one this hand took off the wall itself', () => {
    expect(shouldReadd('mine', { dirty: new Set(['mine']), deletedHere: new Set(['mine']) })).toBe(false);
  });

  it('but undo outranks a tombstone until the restore has been told', () => {
    // A restore lifts the tombstone (`restoredCardIds`), and until that save
    // lands the archive's document still says "gone" about a card the person is
    // looking at. Taking it off the screen in that window is undo not working.
    expect(
      shouldReadd('back', {
        dirty: new Set(['back']),
        deletedHere: none,
        restoredHere: new Set(['back']),
        tombstones: { back: 1700000000 },
      }),
    ).toBe(true);
  });

  it('and touches nothing this hand has no claim on', () => {
    // A card nobody here changed is the archive's to describe, present or absent.
    expect(shouldReadd('theirs', { dirty: none, deletedHere: none })).toBe(false);
  });
});

describe('a dirty id that can never be found', () => {
  /*
   * §61: an id the patch could not find goes back on the pile, because a save
   * can be scheduled from a callback whose render has not landed. Nothing ever
   * took one off again, so a card deleted between the two sat in the dirty set
   * for the life of the tab — and `pending()` shielded a card that does not
   * exist from every incoming document.
   */
  it('is forgiven once and let go the second time', () => {
    const misses = new Map<string, number>();
    expect(retainUnfindable({ wanted: ['a'], sent: new Set(), misses })).toEqual(['a']);
    expect(misses.get('a')).toBe(1);
    expect(retainUnfindable({ wanted: ['a'], sent: new Set(), misses })).toEqual([]);
    expect(misses.has('a')).toBe(false);
    expect(UNFINDABLE_TRIES).toBe(2);
  });

  it('starts again the moment the id turns up in a patch', () => {
    const misses = new Map<string, number>();
    retainUnfindable({ wanted: ['a'], sent: new Set(), misses });
    // Found this time: the render landed, and the count is nothing to do with it.
    expect(retainUnfindable({ wanted: ['a'], sent: new Set(['a']), misses })).toEqual([]);
    expect(misses.has('a')).toBe(false);
    expect(retainUnfindable({ wanted: ['a'], sent: new Set(), misses })).toEqual(['a']);
  });

  it('keeps the ids that were carried and the ones still worth another try apart', () => {
    const misses = new Map<string, number>();
    expect(retainUnfindable({ wanted: ['a', 'b', 'c'], sent: new Set(['b']), misses })).toEqual(['a', 'c']);
  });
});
