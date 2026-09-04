import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  PRESENCE_TTL_MS,
  clearPresence,
  presenceColour,
  publicRoster,
  publishChange,
  publishPresence,
  resetHub,
  roster,
  setPresence,
  subscribe,
  subscriberCount,
  type LiveEvent,
} from '@/lib/boards/live';

/**
 * §8, live: the hub that tells one open board about another.
 *
 * It is in-memory and in-process, which makes it easy to get subtly wrong in
 * ways nothing else catches — a listener that is never removed leaks a socket
 * per page view, an author told about their own save asks for it straight back,
 * and a tab that dies mid-drag leaves a ghost holding a card forever.
 */

afterEach(() => {
  resetHub();
  vi.useRealTimers();
});

function listener(clientId: string) {
  const got: LiveEvent[] = [];
  const off = subscribe('b1', { clientId, send: (event) => got.push(event) });
  return { got, off, events: (name: string) => got.filter((e) => e.event === name) };
}

describe('subscribers', () => {
  it('tells everyone but the author that the board moved', () => {
    // The author is holding the merged document the save handed back; telling
    // them would only make them ask for it again.
    const anneke = listener('anneke');
    const bram = listener('bram');

    publishChange('b1', 'anneke');

    expect(anneke.events('change')).toHaveLength(0);
    expect(bram.events('change')).toHaveLength(1);
  });

  it('tells everyone when the change has no author', () => {
    const anneke = listener('anneke');
    publishChange('b1', null);
    expect(anneke.events('change')).toHaveLength(1);
  });

  it('carries a signal, never the board', () => {
    // Rule 1 in the README: cards are resolved per viewer, so a document on
    // this wire would hand a player the name of a Keeper-only fiche.
    const anneke = listener('anneke');
    publishChange('b1', 'bram');
    const [event] = anneke.events('change');
    expect(Object.keys(event.data).sort()).toEqual(['at', 'by']);
  });

  it('leaves no listener behind when a board is closed', () => {
    const first = listener('anneke');
    const second = listener('bram');
    expect(subscriberCount('b1')).toBe(2);
    first.off();
    second.off();
    expect(subscriberCount('b1')).toBe(0);
  });

  it('does not let one dead socket silence the others', () => {
    subscribe('b1', {
      clientId: 'gone',
      send: () => {
        throw new Error('socket closed');
      },
    });
    const bram = listener('bram');

    expect(() => publishChange('b1', null)).not.toThrow();
    expect(bram.events('change')).toHaveLength(1);
    // The thrower is dropped rather than tried again forever.
    expect(subscriberCount('b1')).toBe(1);
  });

  it('keeps boards apart', () => {
    const onB1 = listener('anneke');
    const got: LiveEvent[] = [];
    subscribe('b2', { clientId: 'bram', send: (event) => got.push(event) });

    publishChange('b2', null);

    expect(onB1.got).toHaveLength(0);
    expect(got).toHaveLength(1);
  });
});

describe('presence', () => {
  const join = (clientId: string, userId: string, name: string, holding: string[] = []) =>
    setPresence('b1', { clientId, userId, name, holding });

  it('lists who is at the wall and what they are holding', () => {
    join('t1', 'u1', 'Anneke', ['c1']);
    join('t2', 'u2', 'Bram', ['c2', 'c3']);

    expect(roster('b1').map((p) => p.name)).toEqual(['Anneke', 'Bram']);
    expect(roster('b1')[1].holding).toEqual(['c2', 'c3']);
  });

  it('counts one person with two tabs as two hands', () => {
    join('t1', 'u1', 'Anneke', ['c1']);
    join('t2', 'u1', 'Anneke', ['c9']);
    expect(roster('b1')).toHaveLength(2);
  });

  it('holds the order still across a heartbeat', () => {
    vi.useFakeTimers();
    vi.setSystemTime(1000);
    join('t1', 'u1', 'Anneke');
    vi.setSystemTime(2000);
    join('t2', 'u2', 'Bram');

    // A heartbeat from the earlier tab must not send it to the back of the
    // strip; avatars that reshuffle while you work read as people leaving.
    vi.setSystemTime(3000);
    setPresence('b1', { clientId: 't1', userId: 'u1', name: 'Anneke' });

    expect(roster('b1').map((p) => p.name)).toEqual(['Anneke', 'Bram']);
  });

  it('keeps what someone is holding when a heartbeat says nothing about it', () => {
    join('t1', 'u1', 'Anneke', ['c1']);
    setPresence('b1', { clientId: 't1', userId: 'u1', name: 'Anneke' });
    expect(roster('b1')[0].holding).toEqual(['c1']);
  });

  it('reaps a tab that died mid-drag', () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    join('t1', 'u1', 'Anneke', ['c1']);
    join('t2', 'u2', 'Bram');

    vi.setSystemTime(PRESENCE_TTL_MS + 1);
    setPresence('b1', { clientId: 't2', userId: 'u2', name: 'Bram' });

    // Otherwise a closed laptop leaves a border round a card nobody is touching.
    expect(roster('b1').map((p) => p.name)).toEqual(['Bram']);
  });

  it('lets a tab leave at once rather than waiting to be reaped', () => {
    join('t1', 'u1', 'Anneke');
    join('t2', 'u2', 'Bram');
    clearPresence('b1', 't1');
    expect(roster('b1').map((p) => p.name)).toEqual(['Bram']);
  });

  it('sends the roster to everyone, the person who moved included', () => {
    // Unlike a change: your own avatar appearing is something you should see.
    const anneke = listener('t1');
    const bram = listener('t2');
    join('t1', 'u1', 'Anneke');
    publishPresence('b1');

    expect(anneke.events('presence')).toHaveLength(1);
    expect(bram.events('presence')).toHaveLength(1);
  });

  it('ignores holding lists that are not lists of ids, and caps a long one', () => {
    setPresence('b1', { clientId: 't1', userId: 'u1', name: 'Anneke', holding: 'c1' });
    expect(roster('b1')[0].holding).toEqual([]);

    setPresence('b1', {
      clientId: 't2',
      userId: 'u2',
      name: 'Bram',
      holding: [1, null, 'c1', { id: 'c2' }],
    });
    expect(roster('b1')[1].holding).toEqual(['c1']);

    setPresence('b1', {
      clientId: 't3',
      userId: 'u3',
      name: 'Clasina',
      holding: Array.from({ length: 400 }, (_, i) => `c${i}`),
    });
    expect(roster('b1')[2].holding).toHaveLength(60);
  });
});

describe('what a browser is told', () => {
  it('never sends an account id to the other players', () => {
    // The colour is derived from it server-side and nothing in a browser needs
    // it, so it does not leave: this channel is open to every signed-in player.
    setPresence('b1', { clientId: 't1', userId: 'secret-account-id', name: 'Anneke' });

    const [person] = publicRoster('b1');
    expect(Object.keys(person).sort()).toEqual(['clientId', 'colour', 'holding', 'name']);
    expect(JSON.stringify(publicRoster('b1'))).not.toContain('secret-account-id');
  });

  it('says nothing new happened when a heartbeat is only a heartbeat', () => {
    // Otherwise every open board sends everyone the whole roster every twelve
    // seconds to report that nothing has changed.
    const first = setPresence('b1', { clientId: 't1', userId: 'u1', name: 'Anneke', holding: ['c1'] });
    expect(first.changed).toBe(true);

    const beat = setPresence('b1', { clientId: 't1', userId: 'u1', name: 'Anneke' });
    expect(beat.changed).toBe(false);

    const moved = setPresence('b1', { clientId: 't1', userId: 'u1', name: 'Anneke', holding: ['c2'] });
    expect(moved.changed).toBe(true);
  });

  it('counts a second pair of hands as news', () => {
    setPresence('b1', { clientId: 't1', userId: 'u1', name: 'Anneke' });
    expect(setPresence('b1', { clientId: 't2', userId: 'u2', name: 'Bram' }).changed).toBe(true);
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
    const inks = new Set(
      Array.from({ length: 12 }, (_, i) => presenceColour(`user-${i}`)),
    );
    expect(inks.size).toBeGreaterThan(3);
  });
});
