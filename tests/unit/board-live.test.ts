import { afterEach, describe, expect, it } from 'vitest';
import { POINTER_CARD_LIMIT, presenceColour, publishChange } from '@/lib/boards/live';
import {
  carry,
  carriedCount,
  connect,
  connection as findConnection,
  disconnect,
  leaderConnection,
  peopleAt,
  publishChanged,
  publishPointer,
  resetSiteHub,
  setAlias,
  setPlace,
  setWatches,
  type Connection,
  type SiteEvent,
} from '@/lib/live/hub';
import { boardKey } from '@/lib/live/keys';

/**
 * §8, live → §60, one line: the prikbord on the site hub.
 *
 * The wall used to have a hub of its own. It has not since round 29: a board is
 * a *place* on the site line (`board:{id}`), its roster is the site roster, its
 * hands are site pointer frames, and "the wall moved" is a `changed` on the
 * wall's own key. What that hub had to get right, this one now has to get
 * right — an author told about their own save asks for it straight back; a tab
 * that dies mid-drag leaves a ghost holding a card; and the wire must carry a
 * signal and never the document, because a card is resolved per viewer.
 */

afterEach(() => {
  resetSiteHub();
});

let n = 0;
/** A pretend tab on the site line. */
function tab(clientId: string, userId = 'u1') {
  const got: SiteEvent[] = [];
  const line = connect({
    id: `c${++n}-${clientId}`,
    clientId,
    userId,
    name: clientId,
    send: (event) => got.push(event),
  });
  return { line, got, of: (name: string) => got.filter((e) => e.event === name), clear: () => got.splice(0) };
}

describe('a change on the wall', () => {
  it('tells everyone but the author that the board moved', () => {
    // The author is holding the merged document the save handed back; telling
    // them would only make them ask for it again.
    const anneke = tab('anneke');
    const bram = tab('bram');
    setWatches(anneke.line, [boardKey('b1')]);
    setWatches(bram.line, [boardKey('b1')]);
    anneke.clear();
    bram.clear();

    publishChange('b1', 'anneke');

    expect(anneke.of('changed')).toHaveLength(0);
    expect(bram.of('changed')).toHaveLength(1);
  });

  it('tells everyone when the change has no author', () => {
    const anneke = tab('anneke');
    setWatches(anneke.line, [boardKey('b1')]);
    anneke.clear();
    publishChange('b1', null);
    expect(anneke.of('changed')).toHaveLength(1);
  });

  it('carries a signal, never the board', () => {
    // Rule 1 in the README: cards are resolved per viewer, so a document on
    // this wire would hand a player the name of a Keeper-only fiche.
    const anneke = tab('anneke');
    setWatches(anneke.line, [boardKey('b1')]);
    anneke.clear();
    publishChange('b1', 'bram');
    const [event] = anneke.of('changed');
    expect(Object.keys(event.data).sort()).toEqual(['at', 'by', 'keys']);
    expect((event.data as { keys: string[] }).keys).toEqual(['board:b1']);
  });

  it('keeps boards apart', () => {
    const onB1 = tab('anneke');
    const onB2 = tab('bram');
    setWatches(onB1.line, [boardKey('b1')]);
    setWatches(onB2.line, [boardKey('b2')]);
    onB1.clear();
    onB2.clear();

    publishChange('b2', null);

    expect(onB1.of('changed')).toHaveLength(0);
    expect(onB2.of('changed')).toHaveLength(1);
  });

  it('does not let one dead socket silence the others', () => {
    const gone = connect({
      id: 'c-gone',
      clientId: 'gone',
      userId: 'u1',
      name: 'gone',
      send: () => {
        throw new Error('socket closed');
      },
    });
    setWatches(gone, [boardKey('b1')]);
    const bram = tab('bram');
    setWatches(bram.line, [boardKey('b1')]);
    bram.clear();

    expect(() => publishChange('b1', null)).not.toThrow();
    expect(bram.of('changed')).toHaveLength(1);
    // The thrower is dropped rather than tried again forever.
    expect(findConnection('c-gone', 'gone', 'u1')).toBeNull();
  });

  /**
   * §60: the canvas has a tab id of its own, minted before the site line
   * exists, and it is that id every save quotes. The hub is told the two names
   * are one tab — without which the author hears their own save, and everybody
   * else files it under a name that matches nothing in the pointer frames, so a
   * dropped card snaps back for a round trip.
   */
  it('knows the canvas’s own tab id is this line', () => {
    const anneke = tab('site-anneke');
    const bram = tab('site-bram');
    setAlias(anneke.line, 'board-anneke');
    setWatches(anneke.line, [boardKey('b1')]);
    setWatches(bram.line, [boardKey('b1')]);
    anneke.clear();
    bram.clear();

    publishChange('b1', 'board-anneke');

    expect(anneke.of('changed')).toHaveLength(0);
    // And what Bram is told names the tab as the pointer frames name it.
    expect((bram.of('changed')[0].data as { by: string }).by).toBe('site-anneke');
  });

  it('forgets the alias when the line goes', () => {
    const anneke = tab('site-anneke');
    setAlias(anneke.line, 'board-anneke');
    disconnect(anneke.line.id);

    const bram = tab('site-bram');
    setWatches(bram.line, [boardKey('b1')]);
    bram.clear();
    publishChange('b1', 'board-anneke');
    // Nobody answers to that name any more, so it travels as it arrived.
    expect((bram.of('changed')[0].data as { by: string }).by).toBe('board-anneke');
  });
});

describe('who is at the wall', () => {
  const place = boardKey('b1');

  it('lists who is standing there and what they are holding', () => {
    const anneke = tab('t1', 'u1');
    const bram = tab('t2', 'u2');
    setPlace(anneke.line, place, ['c1']);
    setPlace(bram.line, place, ['c2', 'c3']);

    const roster = peopleAt(place);
    expect(roster.map((p) => p.clientId)).toEqual(['t1', 't2']);
    expect(roster[1].holding).toEqual(['c2', 'c3']);
    // Nothing a browser has no business knowing leaves the server.
    expect(Object.keys(roster[0]).sort()).toEqual(['clientId', 'colour', 'holding', 'name']);
    expect(JSON.stringify(roster)).not.toContain('u1');
  });

  it('counts one person with two tabs as two hands', () => {
    const a = tab('t1', 'u1');
    const b = tab('t2', 'u1');
    setPlace(a.line, place);
    setPlace(b.line, place);
    expect(peopleAt(place)).toHaveLength(2);
  });

  it('takes a tab off the wall the moment its line goes', () => {
    const a = tab('t1', 'u1');
    const b = tab('t2', 'u2');
    setPlace(a.line, place);
    setPlace(b.line, place);
    b.clear();
    disconnect(a.line.id);
    expect(peopleAt(place).map((p) => p.clientId)).toEqual(['t2']);
    // …and the people still at the wall watch it happen.
    expect(b.of('presence')).toHaveLength(1);
  });

  it('caps a holding list and ignores one that is not a list of ids', () => {
    const a = tab('t1', 'u1');
    setPlace(a.line, place, 'c1' as unknown as string[]);
    expect(peopleAt(place)[0].holding).toEqual([]);
    setPlace(a.line, place, Array.from({ length: 400 }, (_, i) => `c${i}`));
    expect(peopleAt(place)[0].holding).toHaveLength(60);
  });
});

/**
 * §8, live: the hand, and the box the hand is dragging open.
 *
 * A pointer frame is sight, not state — never stored, never merged — but every
 * number in one is drawn straight into a style attribute on somebody else's
 * screen, which is why the wall's shape has to survive the move to the site
 * wire unchanged: `m` (carried cards) and `s` (the selection box).
 */
describe('pointer frames on the wall', () => {
  const place = boardKey('b1');

  it('carries the carried cards and the selection box to everyone else, and to nobody else', () => {
    const anneke = tab('t1', 'u1');
    const bram = tab('t2', 'u2');
    const elsewhere = tab('t3', 'u3');
    setPlace(anneke.line, place);
    setPlace(bram.line, place);
    setPlace(elsewhere.line, boardKey('b2'));
    anneke.clear();
    bram.clear();
    elsewhere.clear();

    publishPointer(anneke.line, {
      c: 't1',
      x: 120,
      y: 340,
      m: { 'card-1': [120, 340] },
      s: [10, 20, 110, 220],
    });

    expect(anneke.of('pointer')).toHaveLength(0);
    expect(elsewhere.of('pointer')).toHaveLength(0);
    expect(bram.of('pointer')[0].data).toEqual({
      place,
      c: 't1',
      x: 120,
      y: 340,
      m: { 'card-1': [120, 340] },
      s: [10, 20, 110, 220],
    });
  });

  it('a hand is not a forklift', () => {
    // The cap lives in the route's reader; this is the number both halves agree on.
    expect(POINTER_CARD_LIMIT).toBe(40);
  });
});

/**
 * §60: one socket for a whole browser.
 *
 * A follower tab keeps its own client id, its own watch list, its own place and
 * its own name — everything that makes it a person on the strip — and gives up
 * only the socket. Its frames are wrapped in a `via` and written down the
 * leader's stream.
 */
describe('a carried tab', () => {
  const place = boardKey('b1');
  const leaderOf = (t: { line: Connection }) => t.line;

  it('is a person of its own, with its frames written down the leader’s socket', () => {
    const leader = tab('leader', 'u1');
    const follower = carry({ leader: leaderOf(leader), clientId: 'follower', userId: 'u1', name: 'Tweede tab' })!;
    expect(follower).not.toBeNull();
    expect(carriedCount(leader.line.id)).toBe(1);

    setPlace(leader.line, place);
    setPlace(follower, place);
    // Two tabs, two people — the hub sees exactly as many as there are.
    expect(peopleAt(place).map((p) => p.clientId)).toEqual(['leader', 'follower']);

    leader.clear();
    setWatches(follower, [boardKey('b1')]);
    publishChanged([boardKey('b1')]);

    const wrapped = leader.of('via');
    expect(wrapped).toHaveLength(1);
    expect(wrapped[0].data).toMatchObject({ to: 'follower', e: 'changed' });
  });

  it('goes when the leader goes', () => {
    const leader = tab('leader', 'u1');
    const follower = carry({ leader: leaderOf(leader), clientId: 'follower', userId: 'u1', name: 'Tweede tab' })!;
    setPlace(leader.line, place);
    setPlace(follower, place);
    expect(peopleAt(place)).toHaveLength(2);

    disconnect(leader.line.id);

    // The socket under it closed; leaving it on the roster would show somebody
    // who cannot hear a thing.
    expect(peopleAt(place)).toEqual([]);
    expect(findConnection(follower.id, 'follower', 'u1')).toBeNull();
  });

  it('is never carried across accounts, and never carries itself', () => {
    const leader = tab('leader', 'u1');
    expect(carry({ leader: leaderOf(leader), clientId: 'follower', userId: 'someone-else', name: 'x' })).toBeNull();
    expect(carry({ leader: leaderOf(leader), clientId: 'leader', userId: 'u1', name: 'x' })).toBeNull();
  });

  it('only a real socket may be quoted as a leader', () => {
    const leader = tab('leader', 'u1');
    const follower = carry({ leader: leaderOf(leader), clientId: 'follower', userId: 'u1', name: 'Tweede' })!;
    expect(leaderConnection(leader.line.id, 'leader', 'u1')).not.toBeNull();
    // A carried line cannot itself be quoted as the leader of a third tab.
    expect(leaderConnection(follower.id, 'follower', 'u1')).toBeNull();
    // Nor may another account borrow the socket.
    expect(leaderConnection(leader.line.id, 'leader', 'u2')).toBeNull();
  });
});

describe('presenceColour', () => {
  it('gives one person the same ink everywhere, always', () => {
    // "The green one is Anneke" has to stay true across boards and sessions,
    // so this is a hash of the account and never an arrival-order palette.
    expect(presenceColour('user-anneke')).toBe(presenceColour('user-anneke'));
    expect(presenceColour('user-anneke')).toMatch(/^#[0-9A-Fa-f]{6}$/);
  });

  it('spreads a handful of people across the palette', () => {
    const inks = new Set(Array.from({ length: 12 }, (_, i) => presenceColour(`user-${i}`)));
    expect(inks.size).toBeGreaterThan(3);
  });
});
