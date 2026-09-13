import { describe, expect, it } from 'vitest';
import {
  classifySaveFailure,
  OFFLINE_MESSAGE,
  retryDelay,
  RETRY_BASE_MS,
  RETRY_MAX_MS,
  SAVE_TIMEOUT_MS,
} from '@/lib/boards/retry';
import { OTHER_SIDE } from '@/lib/keeper/side';

/**
 * §61: a save that did not land has to know what to do next. Before this round
 * it did one thing — set `error` and stop for ever — which is why a wall could
 * be "live" and saving nothing at all.
 */

describe('the backoff', () => {
  const half = () => 0.5; // no jitter either way

  it('is a second, then two, then four', () => {
    expect(retryDelay(1, half)).toBe(1000);
    expect(retryDelay(2, half)).toBe(2000);
    expect(retryDelay(3, half)).toBe(4000);
    expect(retryDelay(4, half)).toBe(8000);
  });

  it('never waits longer than fifteen seconds, however long the archive is away', () => {
    for (const attempt of [5, 6, 12, 400]) {
      expect(retryDelay(attempt, half)).toBe(RETRY_MAX_MS);
    }
  });

  it('is jittered either side, so a crowd does not come back in one millisecond', () => {
    expect(retryDelay(2, () => 0)).toBeLessThan(2000);
    expect(retryDelay(2, () => 1)).toBeGreaterThan(2000);
    // …and never outside the bounds it promises.
    for (const random of [() => 0, () => 1, () => 0.37]) {
      for (const attempt of [1, 3, 9]) {
        const wait = retryDelay(attempt, random);
        expect(wait).toBeGreaterThanOrEqual(RETRY_BASE_MS / 2);
        expect(wait).toBeLessThanOrEqual(RETRY_MAX_MS);
      }
    }
  });

  it('gives a hung save ten seconds before abandoning it', () => {
    expect(SAVE_TIMEOUT_MS).toBe(10_000);
  });
});

describe('reading what went wrong', () => {
  it('blames the connection only when nothing answered at all', () => {
    const failure = classifySaveFailure({ status: null });
    expect(failure.kind).toBe('network');
    expect(failure.retry).toBe(true);
    expect(failure.message).toBe(OFFLINE_MESSAGE);
  });

  it('retries a server that answered badly, in its own words', () => {
    const failure = classifySaveFailure({ status: 503, body: { error: 'Even geduld.' } });
    expect(failure.kind).toBe('server');
    expect(failure.retry).toBe(true);
    expect(failure.message).toContain('Even geduld.');
    expect(failure.message).not.toContain('verbinding');
  });

  it('names the cards a §50 refusal refused', () => {
    const failure = classifySaveFailure({
      status: 400,
      body: { error: OTHER_SIDE, code: 'OTHER_SIDE', cardIds: ['c_1', 'c_2'] },
    });
    expect(failure.kind).toBe('cards');
    expect(failure.kind === 'cards' && failure.cardIds).toEqual(['c_1', 'c_2']);
    // The sentence is the archive's, not one this hook made up.
    expect(failure.message).toContain(OTHER_SIDE);
    // And the wall tries again, without them.
    expect(failure.retry).toBe(true);
  });

  it('ignores rubbish where the card ids should be', () => {
    const failure = classifySaveFailure({ status: 400, body: { cardIds: [1, null, ''] } });
    expect(failure.kind).toBe('terminal');
  });

  it('does not retry a session that is gone', () => {
    const failure = classifySaveFailure({ status: 401, body: { error: 'Log eerst in.' } });
    expect(failure.kind).toBe('terminal');
    expect(failure.retry).toBe(false);
    expect(failure.message).toContain('Log eerst in.');
  });

  it('does not retry a wall this hand may not write on', () => {
    const failure = classifySaveFailure({
      status: 403,
      body: { error: 'Je mag dit prikbord niet bewerken.' },
    });
    expect(failure.kind).toBe('terminal');
    expect(failure.retry).toBe(false);
    expect(failure.message).toContain('Je mag dit prikbord niet bewerken.');
  });

  it('says something honest even when the body is empty', () => {
    const failure = classifySaveFailure({ status: 500, body: null });
    expect(failure.retry).toBe(true);
    expect(failure.message.length).toBeGreaterThan(0);
    expect(failure.message).not.toBe(OFFLINE_MESSAGE);
  });
});
