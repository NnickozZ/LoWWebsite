import { describe, expect, it } from 'vitest';
import {
  cardRef,
  mergeBoardState,
  normaliseState,
  type BoardCard,
} from '@/lib/boards/merge';

/**
 * §23: a wall points at three kinds of thing.
 *
 * A card used to stand for an artikel or for nothing. It can now also stand for
 * a landkaart or a dossier, and the whole of that change lives in two places:
 * which kinds `normaliseState` accepts, and which id it keeps. Everything
 * downstream — the merge, the tombstones, the strings — must not have noticed,
 * and these tests are what says so.
 */

const card = (over: Partial<BoardCard> & { id: string }): BoardCard => ({
  kind: 'entry',
  name: '',
  text: '',
  showImage: true,
  x: 0,
  y: 0,
  rotation: 0,
  scale: 1,
  ...over,
});

describe('what a card stands for', () => {
  it('keeps the id of each kind, and only that kind', () => {
    const state = normaliseState({
      cards: [
        { ...card({ id: 'a', kind: 'entry', entryId: 'e1' }) },
        { ...card({ id: 'b', kind: 'map', mapId: 'm1' }) },
        { ...card({ id: 'c', kind: 'case', caseId: 'k1' }) },
      ],
    });
    expect(state.cards.map((item) => item.kind)).toEqual(['entry', 'map', 'case']);
    expect(state.cards[1].mapId).toBe('m1');
    expect(state.cards[2].caseId).toBe('k1');
    // A card of one kind carrying another kind's id points at nothing: it is
    // the *kind* that decides which id is read, so a stray field cannot make a
    // note card resolve to a dossier.
    expect(cardRef(card({ id: 'x', kind: 'note', caseId: 'k1' }))).toBeNull();
    expect(cardRef(card({ id: 'x', kind: 'case', caseId: 'k1' }))).toEqual({
      kind: 'case',
      id: 'k1',
    });
    expect(cardRef(card({ id: 'x', kind: 'map' }))).toBeNull();
  });

  it('falls back to an entry card for a kind it has never heard of', () => {
    const state = normaliseState({ cards: [{ id: 'a', kind: 'submarine', name: 'x' }] });
    expect(state.cards[0].kind).toBe('entry');
  });

  it('a board saved before map and dossier cards existed still opens', () => {
    const state = normaliseState({
      cards: [{ id: 'a', kind: 'entry', entryId: 'e1', name: 'Oud' }],
      strings: [],
      viewport: { x: 0, y: 0, zoom: 1 },
    });
    expect(state.cards[0].mapId).toBeNull();
    expect(state.cards[0].caseId).toBeNull();
  });
});

describe('the merge does not treat them differently', () => {
  it('merges a landkaart card by id like any other', () => {
    const stored = normaliseState({ cards: [card({ id: 'm', kind: 'map', mapId: 'm1', x: 0 })] });
    const merged = mergeBoardState(stored, {
      cards: [card({ id: 'm', kind: 'map', mapId: 'm1', x: 400 })],
    });
    expect(merged.cards).toHaveLength(1);
    expect(merged.cards[0].x).toBe(400);
    expect(merged.cards[0].mapId).toBe('m1');
  });

  it('a deleted dossier card stays deleted when a stale client sends it back', () => {
    const stored = normaliseState({ cards: [card({ id: 'k', kind: 'case', caseId: 'k1' })] });
    const afterDelete = mergeBoardState(stored, { deletedCardIds: ['k'] });
    expect(afterDelete.cards).toHaveLength(0);

    // The other screen was mid-drag and still had it; it must not come back.
    const stale = mergeBoardState(afterDelete, {
      cards: [card({ id: 'k', kind: 'case', caseId: 'k1' })],
    });
    expect(stale.cards).toHaveLength(0);
  });

  it('undo lifts the tombstone for a landkaart card too', () => {
    const stored = normaliseState({ cards: [card({ id: 'm', kind: 'map', mapId: 'm1' })] });
    const gone = mergeBoardState(stored, { deletedCardIds: ['m'] });
    const back = mergeBoardState(gone, {
      cards: [card({ id: 'm', kind: 'map', mapId: 'm1' })],
      restoredCardIds: ['m'],
    });
    expect(back.cards.map((item) => item.id)).toEqual(['m']);
    expect(back.deleted?.cards.m).toBeUndefined();
  });

  it('string can be run to a dossier card, and dies with it', () => {
    const stored = normaliseState({
      cards: [card({ id: 'e', entryId: 'e1' }), card({ id: 'k', kind: 'case', caseId: 'k1' })],
      strings: [{ id: 's', from: { card: 'e' }, to: { card: 'k' }, label: '', colour: 'red' }],
    });
    expect(stored.strings).toHaveLength(1);
    const gone = mergeBoardState(stored, { deletedCardIds: ['k'] });
    expect(gone.strings).toHaveLength(0);
  });
});
