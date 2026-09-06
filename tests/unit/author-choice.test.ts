import { describe, expect, it } from 'vitest';
import {
  WRITING_AS_KEY,
  authorStance,
  effectiveAuthorId,
  mayStartEntryWith,
  mayTypeWith,
  readRememberedAuthor,
  rememberedFrom,
  shouldPrompt,
  writeRemembered,
  type MiniStorage,
} from '@/lib/authorChoice';
import { announceAuthorNeeded, isAuthorRefusal, onAuthorNeeded } from '@/lib/authorSignal';

/**
 * §18b, the browser's half: what one window remembers, and what the shell does
 * about the person looking at it.
 *
 * The server's half is `tests/unit/authorship.test.ts`, which is the one that
 * matters for the archive's honesty. These are the two decisions the shell
 * makes before anybody has typed a letter: is the remembered answer still
 * worth anything, and is this person asked, banned, or left alone.
 */

/** A `sessionStorage` that is only a Map. */
function store(initial: Record<string, string> = {}): MiniStorage & { data: Map<string, string> } {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      data.set(key, value);
    },
    removeItem: (key) => {
      data.delete(key);
    },
  };
}

/** One that refuses everything, the way a locked-down browser does. */
function refusingStore(): MiniStorage {
  return {
    getItem() {
      throw new Error('nope');
    },
    setItem() {
      throw new Error('nope');
    },
    removeItem() {
      throw new Error('nope');
    },
  };
}

describe('readRememberedAuthor', () => {
  it('keeps an answer the account still holds', () => {
    expect(readRememberedAuthor('e_vandijk', ['e_vandijk', 'e_bakker'])).toBe('e_vandijk');
  });

  it('drops an answer naming a karakter that was untied since', () => {
    // Otherwise a stale id rides out on every request until the tab is closed,
    // and the server quietly files the work under the account's karakter — the
    // silent mis-attribution this round exists to stop.
    expect(readRememberedAuthor('e_gone', ['e_vandijk'])).toBeNull();
  });

  it('treats empty, blank and missing alike', () => {
    expect(readRememberedAuthor('', ['e_vandijk'])).toBeNull();
    expect(readRememberedAuthor('   ', ['e_vandijk'])).toBeNull();
    expect(readRememberedAuthor(null, ['e_vandijk'])).toBeNull();
    expect(readRememberedAuthor(undefined, ['e_vandijk'])).toBeNull();
  });

  it('holds nothing at all when the account holds nothing', () => {
    expect(readRememberedAuthor('e_vandijk', [])).toBeNull();
  });
});

describe('rememberedFrom / writeRemembered', () => {
  it('reads what the window wrote down', () => {
    const s = store({ [WRITING_AS_KEY]: 'e_vandijk' });
    expect(rememberedFrom(s, ['e_vandijk'])).toBe('e_vandijk');
  });

  it('writes and rubs out', () => {
    const s = store();
    writeRemembered(s, 'e_vandijk');
    expect(s.data.get(WRITING_AS_KEY)).toBe('e_vandijk');
    writeRemembered(s, null);
    expect(s.data.has(WRITING_AS_KEY)).toBe(false);
  });

  it('survives a browser that refuses storage, in both directions', () => {
    // Private mode: the window simply has no memory and is asked again. A
    // throw here would take the whole shell down before the first paint.
    expect(rememberedFrom(refusingStore(), ['e_vandijk'])).toBeNull();
    expect(() => writeRemembered(refusingStore(), 'e_vandijk')).not.toThrow();
  });

  it('has no memory where there is no store at all (the server render)', () => {
    expect(rememberedFrom(null, ['e_vandijk'])).toBeNull();
    expect(() => writeRemembered(null, 'e_vandijk')).not.toThrow();
  });
});

describe('authorStance', () => {
  it('never asks a Keeper, whatever the window remembers', () => {
    expect(authorStance({ isKeeper: true, characterIds: [], remembered: null })).toBe('keeper');
    expect(authorStance({ isKeeper: true, characterIds: ['e_x'], remembered: 'e_x' })).toBe('keeper');
  });

  it('never asks a speler with no onderzoeker — there is nothing to choose', () => {
    expect(authorStance({ isKeeper: false, characterIds: [], remembered: null })).toBe('no-author');
  });

  it('asks a speler who holds onderzoekers and has not said which', () => {
    expect(authorStance({ isKeeper: false, characterIds: ['e_a', 'e_b'], remembered: null })).toBe('ask');
  });

  it('asks again once the remembered answer has gone stale', () => {
    expect(authorStance({ isKeeper: false, characterIds: ['e_a'], remembered: 'e_gone' })).toBe('ask');
  });

  it('leaves a window that has answered alone', () => {
    expect(authorStance({ isKeeper: false, characterIds: ['e_a', 'e_b'], remembered: 'e_b' })).toBe('ready');
  });

  it('asks a speler who holds exactly one, rather than choosing for them', () => {
    // One window may still be somebody else's; the question is about the
    // window, not about how much choice there happens to be in it.
    expect(authorStance({ isKeeper: false, characterIds: ['e_a'], remembered: null })).toBe('ask');
  });
});

describe('mayTypeWith and shouldPrompt', () => {
  it('shuts only the speler with no onderzoeker out', () => {
    expect(mayTypeWith('keeper')).toBe(true);
    expect(mayTypeWith('ask')).toBe(true);
    expect(mayTypeWith('ready')).toBe(true);
    expect(mayTypeWith('no-author')).toBe(false);
  });

  it('prompts exactly one of the four', () => {
    expect(shouldPrompt('ask')).toBe(true);
    expect(shouldPrompt('keeper')).toBe(false);
    expect(shouldPrompt('ready')).toBe(false);
    // The banner is their answer; a sheet with nothing in it is not.
    expect(shouldPrompt('no-author')).toBe(false);
  });

  /*
   * The one road left open to a speler with no onderzoeker: an onderzoeker is
   * an artikel somebody tied on, so shutting this too would leave them with a
   * banner telling them to do something the screen refuses to start.
   */
  it('lets everyone make a new artikel, the speler with no onderzoeker included', () => {
    expect(mayStartEntryWith('no-author')).toBe(true);
    expect(mayStartEntryWith('keeper')).toBe(true);
    expect(mayStartEntryWith('ask')).toBe(true);
    expect(mayStartEntryWith('ready')).toBe(true);
  });
});

/**
 * §18b: "ask, then do" — the rule `AuthorProvider.ensureAuthor` is made of.
 *
 * Opening the "nieuw artikel" sheet is an act of writing, and the question is
 * itself a sheet, so it cannot come up *over* the thing that asked it: Escape
 * on the pile took the sheet underneath and left the blocking question
 * standing. So the action is held, the question is asked alone, and the answer
 * releases it. Which of the four stances waits and which walks straight
 * through is the whole of the decision, and it is `shouldPrompt`.
 */
describe('ask, then do', () => {
  /** The wrapper, in miniature: hold the action, or run it now. */
  function askThen(stance: Parameters<typeof shouldPrompt>[0], then: () => void) {
    if (shouldPrompt(stance)) return 'held' as const;
    then();
    return 'ran' as const;
  }

  it('holds the action behind the question for the one window that owes an answer', () => {
    let ran = 0;
    expect(askThen('ask', () => ran++)).toBe('held');
    // Nothing has opened yet: that is the point — one sheet on the screen.
    expect(ran).toBe(0);
  });

  it('lets a Keeper and an answered window straight through, in the same click', () => {
    // Synchronously, not a tick later: a caller that opens a sheet must not
    // lose the click that opened it.
    for (const stance of ['keeper', 'ready'] as const) {
      let ran = 0;
      expect(askThen(stance, () => ran++)).toBe('ran');
      expect(ran).toBe(1);
    }
  });

  it('lets a speler with no onderzoeker straight through — the road out of read-only', () => {
    // The deliberate onboarding exception. There is nothing to ask them, and
    // the artikel they are about to make is the onderzoeker they have not got,
    // so holding it back would be a question with no answer in front of the
    // one door `mayStartEntryWith` leaves open.
    let ran = 0;
    expect(askThen('no-author', () => ran++)).toBe('ran');
    expect(ran).toBe(1);
    expect(mayStartEntryWith('no-author')).toBe(true);
  });
});

describe('effectiveAuthorId', () => {
  it('is the window`s own answer where there is one', () => {
    expect(effectiveAuthorId({ isKeeper: false, chosen: 'e_b', activeId: 'e_a' })).toBe('e_b');
  });

  it('falls back to the account, which is what a page navigation carries', () => {
    // A full navigation cannot carry `X-Character`, so the server renders it
    // under `active_character_id`. The indicator must not claim otherwise.
    expect(effectiveAuthorId({ isKeeper: false, chosen: null, activeId: 'e_a' })).toBe('e_a');
  });

  it('is nobody for a Keeper, and nobody when there is nobody', () => {
    expect(effectiveAuthorId({ isKeeper: true, chosen: 'e_b', activeId: 'e_a' })).toBeNull();
    expect(effectiveAuthorId({ isKeeper: false, chosen: null, activeId: null })).toBeNull();
  });
});

describe('the archive asking back', () => {
  it('knows the question from an ordinary refusal', () => {
    expect(isAuthorRefusal(400, { error: 'Kies eerst met wie je schrijft.', needsAuthor: true })).toBe(true);
    // Every other 400 is a plain failure and keeps its own toast.
    expect(isAuthorRefusal(400, { error: 'Geef het dossier eerst een naam.' })).toBe(false);
    expect(isAuthorRefusal(403, { needsAuthor: true })).toBe(false);
    expect(isAuthorRefusal(400, null)).toBe(false);
    expect(isAuthorRefusal(400, 'needsAuthor')).toBe(false);
  });

  it('rings every listener, and stops when one lets go', () => {
    let rung = 0;
    const off = onAuthorNeeded(() => {
      rung += 1;
    });
    announceAuthorNeeded();
    announceAuthorNeeded();
    off();
    announceAuthorNeeded();
    expect(rung).toBe(2);
  });

  it('lets a listener remove itself while being rung', () => {
    // Strict Mode's double mount leaves two subscriptions for a moment; one
    // dropping out mid-walk must not skip the other.
    let rung = 0;
    const off = onAuthorNeeded(() => {
      rung += 1;
      off();
    });
    const offSecond = onAuthorNeeded(() => {
      rung += 1;
    });
    expect(() => announceAuthorNeeded()).not.toThrow();
    expect(rung).toBe(2);
    offSecond();
  });
});
