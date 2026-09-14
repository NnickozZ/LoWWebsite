import { describe, expect, it } from 'vitest';
import {
  emptyTreeState,
  looseIdsIn,
  MAX_LOOSE,
  MAX_MEMBERS,
  MAX_TIES,
  mergeTreeState,
  newLooseId,
  newTieId,
  normaliseTreeState,
  stateEntryIds,
  TOMBSTONE_TTL_MS,
} from '@/lib/families/merge';
import type { FamilyTreePatch, LooseCard, TreeMember, TreeTie } from '@/lib/families/types';

/**
 * §66 — the stamboom's document and its merge rule.
 *
 * Two claims carry the file, and they are the two §8 and §61 wrote down on the
 * prikbord: **absence is never deletion** (a patch says only what one hand
 * changed) and **last writer wins per item, never per document**. The third is
 * this round's own: **a line between two artikelen is never stored in the
 * tree** — it is a field on one of them — so a tie with two `entry` ends is
 * dropped on the way in, wherever it came from.
 */

const NOW = 1_700_000_000_000;

const member = (id: string, over: Partial<TreeMember> = {}): TreeMember => ({
  id,
  updatedAt: NOW,
  ...over,
});

const loose = (id: string, over: Partial<LooseCard> = {}): LooseCard => ({
  id,
  name: id,
  text: '',
  frame: 'unknown',
  updatedAt: NOW,
  ...over,
});

const tie = (id: string, over: Partial<TreeTie> = {}): TreeTie => ({
  id,
  from: { kind: 'entry', id: 'e1' },
  to: { kind: 'loose', id: 'l1' },
  role: 'parent',
  updatedAt: NOW,
  ...over,
});

const stateOf = (over: Partial<ReturnType<typeof emptyTreeState>> = {}) =>
  normaliseTreeState({ ...emptyTreeState(), ...over }, NOW);

describe('§66 emptyTreeState and the id makers', () => {
  it('starts empty, with all three tombstone bags present', () => {
    expect(emptyTreeState()).toEqual({
      v: 1,
      members: [],
      loose: [],
      ties: [],
      deleted: { members: {}, loose: {}, ties: {} },
    });
  });

  it('makes short prefixed ids, the shape a prikbord card has', () => {
    expect(newLooseId()).toMatch(/^l_[a-z0-9]{1,10}$/);
    expect(newTieId()).toMatch(/^t_[a-z0-9]{1,10}$/);
    expect(newLooseId()).not.toBe(newLooseId());
  });
});

describe('§66 normaliseTreeState is forgiving', () => {
  it('accepts nothing at all', () => {
    for (const rubbish of [null, undefined, 0, 'tree', [], { v: 9 }]) {
      const state = normaliseTreeState(rubbish, NOW);
      expect(state).toEqual(emptyTreeState());
    }
  });

  it('turns a missing array into an empty one and drops a nameless item', () => {
    const state = normaliseTreeState(
      { members: 'nope', loose: 3, ties: { id: 'x' }, deleted: 'gone' },
      NOW,
    );
    expect(state).toEqual(emptyTreeState());
    expect(normaliseTreeState({ members: [null, 5, {}, { id: '' }] }, NOW).members).toEqual([]);
  });

  it('stamps a member that arrives without one', () => {
    const state = normaliseTreeState({ members: [{ id: 'e1' }] }, NOW);
    expect(state.members).toEqual([{ id: 'e1', updatedAt: NOW }]);
  });

  it('gives a loose card without a frame the dashed one', () => {
    expect(normaliseTreeState({ loose: [{ id: 'l1', name: 'X' }] }, NOW).loose[0]).toEqual({
      id: 'l1',
      name: 'X',
      text: '',
      frame: 'unknown',
      updatedAt: NOW,
    });
    expect(normaliseTreeState({ loose: [{ id: 'l1', frame: 'sterfelijk' }] }, NOW).loose[0].frame).toBe(
      'unknown',
    );
    expect(normaliseTreeState({ loose: [{ id: 'l1', frame: 'divine' }] }, NOW).loose[0].frame).toBe(
      'divine',
    );
  });

  it('trims and caps a name, caps a text and a label', () => {
    const card = normaliseTreeState(
      { loose: [{ id: 'l1', name: `  ${'n'.repeat(200)}  `, text: 't'.repeat(900) }] },
      NOW,
    ).loose[0];
    expect(card.name).toHaveLength(120);
    expect(card.text).toHaveLength(400);
    const line = normaliseTreeState({ ties: [tie('t1', { label: 'w'.repeat(400) })] }, NOW).ties[0];
    expect(line.label).toHaveLength(120);
  });

  it('keeps a finite x/y and a true pin, and drops the rest', () => {
    const kept = normaliseTreeState(
      { members: [{ id: 'e1', x: 10, y: -4.5, pinned: true, updatedAt: NOW }] },
      NOW,
    ).members[0];
    expect(kept).toEqual({ id: 'e1', x: 10, y: -4.5, pinned: true, updatedAt: NOW });
    const dropped = normaliseTreeState(
      { members: [{ id: 'e1', x: Number.NaN, y: '3', pinned: 0, updatedAt: NOW }] },
      NOW,
    ).members[0];
    expect(dropped).toEqual({ id: 'e1', updatedAt: NOW });
  });

  it('collapses a duplicate member id to the newest', () => {
    const state = normaliseTreeState(
      { members: [member('e1', { x: 1, updatedAt: 10 }), member('e1', { x: 2, updatedAt: 20 })] },
      NOW,
    );
    expect(state.members).toEqual([{ id: 'e1', x: 2, updatedAt: 20 }]);
    // Whichever order they arrive in.
    const other = normaliseTreeState(
      { members: [member('e1', { x: 2, updatedAt: 20 }), member('e1', { x: 1, updatedAt: 10 })] },
      NOW,
    );
    expect(other.members).toEqual([{ id: 'e1', x: 2, updatedAt: 20 }]);
  });

  it('prunes an expired tombstone and keeps a fresh one', () => {
    const state = normaliseTreeState(
      {
        deleted: {
          members: { old: NOW - TOMBSTONE_TTL_MS - 1, fresh: NOW - 1000 },
          loose: { bad: 'soon' },
          ties: {},
        },
      },
      NOW,
    );
    expect(state.deleted.members).toEqual({ fresh: NOW - 1000 });
    expect(state.deleted.loose).toEqual({});
  });
});

describe('§66 a line between two artikelen is never stored in the tree', () => {
  it('drops a tie with both ends entry', () => {
    const state = normaliseTreeState(
      {
        ties: [
          tie('t1', { from: { kind: 'entry', id: 'a' }, to: { kind: 'entry', id: 'b' } }),
          tie('t2', { from: { kind: 'entry', id: 'a' }, to: { kind: 'loose', id: 'l1' } }),
          tie('t3', { from: { kind: 'loose', id: 'l1' }, to: { kind: 'loose', id: 'l2' } }),
        ],
      },
      NOW,
    );
    expect(state.ties.map((line) => line.id)).toEqual(['t2', 't3']);
  });

  it('drops it out of a merge too, whichever way it arrives', () => {
    const { state } = mergeTreeState(
      emptyTreeState(),
      { ties: [tie('t1', { from: { kind: 'entry', id: 'a' }, to: { kind: 'entry', id: 'b' } })] },
      NOW,
    );
    expect(state.ties).toEqual([]);
  });

  it('drops a malformed end, a bad role and a line to itself', () => {
    const state = normaliseTreeState(
      {
        ties: [
          tie('t1', { from: { kind: 'sticker', id: 'a' } as never }),
          tie('t2', { to: { kind: 'loose', id: '' } as never }),
          tie('t3', { role: 'ouder' as never }),
          tie('t4', { from: { kind: 'loose', id: 'l1' }, to: { kind: 'loose', id: 'l1' } }),
          tie('t5'),
        ],
      },
      NOW,
    );
    expect(state.ties.map((line) => line.id)).toEqual(['t5']);
  });

  it('sorts the ends of a partner tie so the same pair collapses', () => {
    const one = normaliseTreeState(
      {
        ties: [
          tie('t1', {
            role: 'partner',
            from: { kind: 'loose', id: 'zz' },
            to: { kind: 'entry', id: 'aa' },
          }),
        ],
      },
      NOW,
    ).ties[0];
    expect(one.from).toEqual({ kind: 'entry', id: 'aa' });
    expect(one.to).toEqual({ kind: 'loose', id: 'zz' });
    // A parent line has a direction and keeps it: `from` is the parent.
    const parent = normaliseTreeState(
      {
        ties: [
          tie('t2', { from: { kind: 'loose', id: 'zz' }, to: { kind: 'entry', id: 'aa' } }),
        ],
      },
      NOW,
    ).ties[0];
    expect(parent.from).toEqual({ kind: 'loose', id: 'zz' });
  });

  /* §67: a sibling tie is undirected and mirrored too, so it sorts as well. */
  it('sorts the ends of a sibling tie, exactly as a partner tie', () => {
    const one = normaliseTreeState(
      {
        ties: [
          tie('t1', {
            role: 'sibling',
            from: { kind: 'loose', id: 'zz' },
            to: { kind: 'entry', id: 'aa' },
          }),
        ],
      },
      NOW,
    ).ties[0];
    expect(one.role).toBe('sibling');
    expect(one.from).toEqual({ kind: 'entry', id: 'aa' });
    expect(one.to).toEqual({ kind: 'loose', id: 'zz' });
  });
});

describe('§66 the caps', () => {
  it('keeps the newest MAX_MEMBERS and drops the oldest', () => {
    const members = Array.from({ length: MAX_MEMBERS + 5 }, (_, i) =>
      member(`e${i}`, { updatedAt: NOW - (MAX_MEMBERS + 5 - i) }),
    );
    const state = normaliseTreeState({ members }, NOW);
    expect(state.members).toHaveLength(MAX_MEMBERS);
    expect(stateEntryIds(state)).not.toContain('e0');
    expect(stateEntryIds(state)).toContain(`e${MAX_MEMBERS + 4}`);
  });

  it('caps loose cards and lines too', () => {
    const state = normaliseTreeState(
      {
        loose: Array.from({ length: MAX_LOOSE + 3 }, (_, i) => loose(`l${i}`, { updatedAt: NOW - (MAX_LOOSE + 3 - i) })),
        ties: Array.from({ length: MAX_TIES + 3 }, (_, i) =>
          tie(`t${i}`, { to: { kind: 'loose', id: 'l1' }, updatedAt: NOW - (MAX_TIES + 3 - i) }),
        ),
      },
      NOW,
    );
    expect(state.loose).toHaveLength(MAX_LOOSE);
    expect(state.ties).toHaveLength(MAX_TIES);
    expect(looseIdsIn(state)).not.toContain('l0');
  });
});

describe('§66 mergeTreeState: last writer wins per item', () => {
  it('lets two hands move two different people in one second', () => {
    const current = stateOf({
      members: [member('e1', { x: 0, updatedAt: 100 }), member('e2', { x: 0, updatedAt: 100 })],
    });
    const { state, changed } = mergeTreeState(current, { members: [member('e1', { x: 50, updatedAt: 200 })] }, NOW);
    expect(state.members.find((m) => m.id === 'e1')?.x).toBe(50);
    // Absence is not deletion: e2 was not in the patch and is untouched.
    expect(state.members.find((m) => m.id === 'e2')).toEqual({ id: 'e2', x: 0, updatedAt: 100 });
    expect(changed.members).toEqual(['e1']);
  });

  it('refuses a stale write for one item without refusing the document', () => {
    const current = stateOf({ members: [member('e1', { x: 99, updatedAt: 500 })] });
    const { state } = mergeTreeState(
      current,
      { members: [member('e1', { x: 1, updatedAt: 400 }), member('e2', { x: 2, updatedAt: 400 })] },
      NOW,
    );
    expect(state.members.find((m) => m.id === 'e1')?.x).toBe(99);
    expect(state.members.find((m) => m.id === 'e2')?.x).toBe(2);
  });

  it('lets an equal stamp win, because that write is the one on screen', () => {
    const current = stateOf({ members: [member('e1', { x: 0, updatedAt: 500 })] });
    const { state } = mergeTreeState(current, { members: [member('e1', { x: 7, updatedAt: 500 })] }, NOW);
    expect(state.members[0].x).toBe(7);
  });

  it('adds a member the tree has never heard of', () => {
    const { state, changed } = mergeTreeState(emptyTreeState(), { members: [member('e1')] }, NOW);
    expect(stateEntryIds(state)).toEqual(['e1']);
    expect(changed.members).toEqual(['e1']);
  });
});

describe('§66 mergeTreeState: a deletion is written down', () => {
  it('buries an id and reports it', () => {
    const current = stateOf({ members: [member('e1'), member('e2')] });
    const { state, changed } = mergeTreeState(current, { deletedMembers: ['e1'] }, NOW);
    expect(stateEntryIds(state)).toEqual(['e2']);
    expect(state.deleted.members).toEqual({ e1: NOW });
    expect(changed.members).toEqual(['e1']);
  });

  it('refuses a stale re-add of something already buried', () => {
    const buried = normaliseTreeState(
      { members: [member('e2')], deleted: { members: { e1: NOW - 1000 }, loose: {}, ties: {} } },
      NOW,
    );
    const { state } = mergeTreeState(buried, { members: [member('e1', { updatedAt: NOW - 5000 })] }, NOW);
    expect(stateEntryIds(state)).toEqual(['e2']);
    expect(state.deleted.members.e1).toBe(NOW - 1000);
  });

  it('lets a deliberate re-add with a newer stamp lift the stone', () => {
    const buried = normaliseTreeState(
      { deleted: { members: { e1: NOW - 1000 }, loose: {}, ties: {} } },
      NOW,
    );
    const { state } = mergeTreeState(buried, { members: [member('e1', { updatedAt: NOW })] }, NOW);
    expect(stateEntryIds(state)).toEqual(['e1']);
    expect(state.deleted.members.e1).toBeUndefined();
  });

  it('removes and buries in one save, deletion last', () => {
    const current = stateOf({ members: [member('e1', { updatedAt: 1 })] });
    const patch: FamilyTreePatch = {
      members: [member('e1', { x: 40, updatedAt: NOW })],
      deletedMembers: ['e1'],
    };
    const { state } = mergeTreeState(current, patch, NOW);
    expect(stateEntryIds(state)).toEqual([]);
    expect(state.deleted.members.e1).toBe(NOW);
  });

  it('takes a line with the loose card it hung on', () => {
    const current = stateOf({
      loose: [loose('l1')],
      ties: [tie('t1', { to: { kind: 'loose', id: 'l1' } })],
    });
    const { state, changed } = mergeTreeState(current, { deletedLoose: ['l1'] }, NOW);
    expect(state.loose).toEqual([]);
    expect(state.ties).toEqual([]);
    expect(changed.loose).toEqual(['l1']);
    expect(changed.ties).toEqual(['t1']);
  });

  it('takes a line with the member it hung on', () => {
    const current = stateOf({
      members: [member('e1')],
      loose: [loose('l1')],
      ties: [tie('t1', { from: { kind: 'entry', id: 'e1' }, to: { kind: 'loose', id: 'l1' } })],
    });
    const { state } = mergeTreeState(current, { deletedMembers: ['e1'] }, NOW);
    expect(state.ties).toEqual([]);
    expect(state.loose).toHaveLength(1);
  });

  it('leaves a line alone whose ends are both still there', () => {
    const current = stateOf({
      members: [member('e1'), member('e2')],
      loose: [loose('l1')],
      ties: [tie('t1')],
    });
    const { state, changed } = mergeTreeState(current, { deletedMembers: ['e2'] }, NOW);
    expect(state.ties.map((line) => line.id)).toEqual(['t1']);
    expect(changed.ties).toEqual([]);
  });
});

describe('§66 what a merge reports', () => {
  it('names every id it moved, in all three bags, and nothing else', () => {
    const current = stateOf({ members: [member('e1')], loose: [loose('l1')], ties: [tie('t1')] });
    const { changed } = mergeTreeState(
      current,
      {
        members: [member('e9', { updatedAt: NOW + 1 })],
        loose: [loose('l1', { name: 'anders', updatedAt: NOW + 1 })],
        deletedTies: ['t1'],
      },
      NOW,
    );
    expect(changed).toEqual({ members: ['e9'], loose: ['l1'], ties: ['t1'] });
  });

  it('reports nothing for an empty patch and changes nothing', () => {
    const current = stateOf({ members: [member('e1', { x: 5 })] });
    const { state, changed } = mergeTreeState(current, {}, NOW);
    expect(changed).toEqual({ members: [], loose: [], ties: [] });
    expect(state.members).toEqual(current.members);
  });
});
