import { describe, expect, it } from 'vitest';
import {
  HIDDEN_CLOSE_MS,
  KEEPALIVE_MAX_BYTES,
  POINTER_THROTTLE_MS,
  RECONNECT_CEILING_MS,
  RECONNECT_FLOOR_MS,
  SSE_HIGH_WATER_MARK,
  UPDATE_BATCH_MAX_BYTES,
  backoffDelay,
  frameKind,
  shouldCloseHidden,
  shouldDropFrame,
  shouldKeepalive,
  splitUpdates,
} from '@/lib/live/wire';

/**
 * §60: the four decisions a line that never gives up has to make, without a
 * React component around them.
 *
 * Each of these was a real failure before this round: a reconnect loop with no
 * floor, a paste that rejected against the browser's unload quota and then
 * retried the same body for ever, a hidden tab holding a socket the next
 * navigation needed, and one slow reader growing a buffer until pm2 killed the
 * server for everybody.
 */

describe('backoff', () => {
  it('never returns nothing, and never returns more than half a minute', () => {
    for (let failures = 0; failures < 40; failures++) {
      const delay = backoffDelay(failures);
      expect(delay).toBeGreaterThanOrEqual(RECONNECT_FLOOR_MS);
      expect(delay).toBeLessThanOrEqual(RECONNECT_CEILING_MS);
    }
  });

  it('climbs, and then stops climbing', () => {
    // Read with the jitter pinned to the middle, so the schedule itself is what
    // is under test.
    const mid = () => 0.5;
    expect(backoffDelay(0, mid)).toBe(500);
    expect(backoffDelay(1, mid)).toBe(1000);
    expect(backoffDelay(3, mid)).toBe(4000);
    expect(backoffDelay(6, mid)).toBe(30_000);
    expect(backoffDelay(99, mid)).toBe(30_000);
  });

  it('spreads tabs that dropped together', () => {
    // Ten tabs behind one proxy that fell over must not come back in lockstep.
    const early = backoffDelay(4, () => 0);
    const late = backoffDelay(4, () => 1);
    expect(late).toBeGreaterThan(early);
    expect(early).toBeGreaterThanOrEqual(RECONNECT_FLOOR_MS);
  });

  it('a zero is not reachable by any road', () => {
    // The 409 path used to reset the counter, which produced a hot loop against
    // a server that answered "line unknown" to everything.
    expect(backoffDelay(-5)).toBeGreaterThanOrEqual(RECONNECT_FLOOR_MS);
    expect(backoffDelay(0, () => 0)).toBeGreaterThanOrEqual(RECONNECT_FLOOR_MS);
  });
});

describe('the unload quota', () => {
  it('is only ever spent on a goodbye', () => {
    expect(shouldKeepalive({ bytes: 200, unloading: true })).toBe(true);
    // An ordinary POST in a living page has no need of it.
    expect(shouldKeepalive({ bytes: 200 })).toBe(false);
  });

  it('is never spent on keystrokes, however small the batch', () => {
    // The quota is 64 KiB for the whole origin; a Tiptap paste rejects outright
    // and the old code retried the same body until the tab was reloaded.
    expect(shouldKeepalive({ bytes: 10, unloading: true, hasUpdates: true })).toBe(false);
  });

  it('is never spent on a big body', () => {
    expect(shouldKeepalive({ bytes: KEEPALIVE_MAX_BYTES + 1, unloading: true })).toBe(false);
    expect(shouldKeepalive({ bytes: KEEPALIVE_MAX_BYTES, unloading: true })).toBe(true);
  });
});

describe('splitting a batch of keystrokes', () => {
  const item = (size: number, key = 'entry:a:body') => ({ key, u: 'x'.repeat(size) });

  it('leaves the common case as one request', () => {
    const batches = splitUpdates([item(10), item(20), item(30)]);
    expect(batches).toHaveLength(1);
    expect(batches[0]).toHaveLength(3);
  });

  it('cuts when the cap is passed, in order', () => {
    const batches = splitUpdates([item(60), item(60), item(60)], 100);
    expect(batches.map((b) => b.length)).toEqual([1, 1, 1]);
    const batchesTwo = splitUpdates([item(40), item(40), item(40)], 100);
    expect(batchesTwo.map((b) => b.length)).toEqual([2, 1]);
  });

  it('still sends an update bigger than the cap, alone', () => {
    // A Yjs update is not divisible, and refusing one would lose a paste.
    const batches = splitUpdates([item(10), item(500)], 100);
    expect(batches.map((b) => b.length)).toEqual([1, 1]);
    expect(batches[1][0].u).toHaveLength(500);
  });

  it('says nothing about nothing', () => {
    expect(splitUpdates([])).toEqual([]);
  });

  it('has a cap well under any proxy’s body limit', () => {
    expect(UPDATE_BATCH_MAX_BYTES).toBeLessThan(1_000_000);
  });
});

describe('the tab nobody is looking at', () => {
  it('waits three quarters of a minute, and never closes one that is watched', () => {
    expect(HIDDEN_CLOSE_MS).toBe(45_000);
    expect(shouldCloseHidden(null, 1_000_000)).toBe(false);
    expect(shouldCloseHidden(1000, 1000 + HIDDEN_CLOSE_MS - 1)).toBe(false);
    expect(shouldCloseHidden(1000, 1000 + HIDDEN_CLOSE_MS)).toBe(true);
  });

  it('flicking between two tabs closes nothing', () => {
    // The whole point of a long wait: a glance at another tab and back must not
    // cost a reconnection.
    expect(shouldCloseHidden(0, 3000)).toBe(false);
  });
});

describe('a client that has stopped reading', () => {
  it('loses sight, never facts', () => {
    // desiredSize <= 0 is the browser not draining as fast as we write.
    for (const sight of ['pointer', 'ink', 'presence']) {
      expect(shouldDropFrame(sight, 0)).toBe(true);
      expect(shouldDropFrame(sight, -5000)).toBe(true);
    }
    for (const fact of ['changed', 'hello', 'sync', 'update', 'saved', 'room', 'via']) {
      expect(shouldDropFrame(fact, 0)).toBe(false);
      expect(shouldDropFrame(fact, -5000)).toBe(false);
    }
  });

  it('drops nothing at all while there is room', () => {
    expect(shouldDropFrame('pointer', 1)).toBe(false);
    expect(shouldDropFrame('pointer', 65_536)).toBe(false);
    // A stream that will not say has to be given the benefit of the doubt.
    expect(shouldDropFrame('pointer', null)).toBe(false);
  });
});

describe('a frame in an envelope', () => {
  it('is judged on what is inside the envelope', () => {
    // §60: the leader tab's socket carries every follower's frames wrapped in a
    // `via`. Asked about the wrapper, the policy always said "write it" — so the
    // one socket carrying eight tabs never dropped a hand in its life.
    expect(frameKind('via', { to: 't-2', e: 'pointer', d: {} })).toBe('pointer');
    expect(shouldDropFrame(frameKind('via', { to: 't-2', e: 'pointer', d: {} }), 0)).toBe(true);
    expect(shouldDropFrame(frameKind('via', { to: 't-2', e: 'ink', d: {} }), -3)).toBe(true);
    // A fact stays a fact, carried or not.
    expect(shouldDropFrame(frameKind('via', { to: 't-2', e: 'changed', d: {} }), -3)).toBe(false);
  });

  it('leaves every other name alone, and a malformed envelope undroppable', () => {
    expect(frameKind('pointer', { x: 1 })).toBe('pointer');
    expect(frameKind('changed')).toBe('changed');
    expect(frameKind('via', null)).toBe('via');
    expect(frameKind('via', { to: 't-2' })).toBe('via');
    expect(shouldDropFrame(frameKind('via', undefined), 0)).toBe(false);
  });
});

describe('how much room a live stream has', () => {
  it('is sixty-four frames, not the one a bare ReadableStream gives', () => {
    // With the default `CountQueuingStrategy`, `desiredSize` is 0 after a single
    // unread chunk — so two frames in one tick meant the second was "behind".
    expect(SSE_HIGH_WATER_MARK).toBe(64);
  });

  it('and the thing all of this stands on: an unread queue goes negative', () => {
    /*
     * §60: the drop policy and the fifteen-second close are both read off
     * `controller.desiredSize`. If a stream in this runtime did not propagate
     * the consumer's backpressure into it, neither would ever fire and a
     * sleeping laptop would grow a buffer until pm2 killed the server. So it is
     * asserted here rather than assumed: nobody reads, and the room runs out.
     */
    let controller: ReadableStreamDefaultController<string> | null = null;
    const stream = new ReadableStream<string>(
      {
        start(c) {
          controller = c;
        },
      },
      new CountQueuingStrategy({ highWaterMark: SSE_HIGH_WATER_MARK }),
    );
    // A reader that never reads is exactly the client this is about.
    stream.getReader();
    const c = controller as unknown as ReadableStreamDefaultController<string>;
    expect(c.desiredSize).toBe(SSE_HIGH_WATER_MARK);
    for (let i = 0; i < SSE_HIGH_WATER_MARK; i++) c.enqueue('x');
    expect(c.desiredSize).toBe(0);
    c.enqueue('x');
    expect(c.desiredSize).toBeLessThan(0);
    expect(shouldDropFrame('pointer', c.desiredSize)).toBe(true);
    expect(shouldDropFrame('changed', c.desiredSize)).toBe(false);
  });
});

describe('the floor between pointer frames', () => {
  it('is eighty milliseconds', () => {
    // Twelve a second is enough for a hand to look like a hand once the other
    // side eases between frames, and it is a third fewer renders than sixty.
    expect(POINTER_THROTTLE_MS).toBe(80);
  });
});
