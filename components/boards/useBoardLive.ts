'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { BoardState } from '@/lib/boards/merge';
import type { BoardRefs } from '@/lib/boards/service';
import { useLiveBase, useLivePointers } from '@/components/live/LiveProvider';
import { boardKey } from '@/lib/live/keys';

export type Person = {
  clientId: string;
  name: string;
  colour: string;
  holding: string[];
};

export type LiveState = 'connecting' | 'live' | 'polling';

/** Somebody else's pointer on the cork, in board coordinates. */
export type Cursor = { clientId: string; name: string; colour: string; x: number; y: number; at: number };

/** A card somebody else is carrying right now, and where they have it. */
export type Carried = { x: number; y: number; by: string; at: number };

/** A selection box somebody else is dragging open, in board coordinates. */
export type Marquee = {
  clientId: string;
  name: string;
  colour: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

/** How often to fall back on asking, when the open line will not stay open. */
const POLL_MS = 4000;
/** A pull that has not answered in this long is abandoned and tried again. */
const PULL_TIMEOUT_MS = 10_000;
/** A carried card with no frame behind it for this long is put back down. */
const CARRIED_TTL_MS = 20_000;
/**
 * A selection box is a gesture in progress, so it is dropped much sooner than a
 * cursor: a hand that goes quiet mid-drag has let go, and a rectangle left
 * hanging on the cork is worse than none.
 */
const MARQUEE_TTL_MS = 4000;
/** How many carried cards one frame may claim. A hand is not a forklift. */
const POINTER_CARD_LIMIT = 40;

/**
 * §8, live → §60, one line: the other half of `useBoardSync`.
 *
 * `useBoardSync` pushes what this client did. This one listens for what
 * everybody else did, and says who is standing at the wall. They are separate
 * hooks because they fail separately: the line going down must not stop saving,
 * and a failed save must not take presence with it.
 *
 * **The wall no longer has a line of its own.** Until this round it opened a
 * second `EventSource` to `/api/boards/[id]/live`, on top of the site line the
 * shell already holds — two sockets per open prikbord, of the six a browser
 * will open to one host, which is how a few tabs wedged every navigation in the
 * archive (§60). Everything it needed was already on the site line: the wall is
 * a *place* (`board:{id}`, set by the page's `LivePage`), so the roster, what
 * everyone is holding and the pointer fan-out come for free, and `changed` on
 * the wall's own key is the signal. Nothing about the board's contents travels
 * either way — cards are resolved per viewer (README rule 1), so the wire
 * carries the fact that something happened and each client asks for its own
 * version of it.
 *
 * Three rules keep it from fighting the pointer, and they are the whole design:
 *
 *  1. **A change is a signal, not a document.** The server says "it moved"; this
 *     asks for its own copy, because entry facts are resolved per viewer.
 *  2. **Never apply while the user is doing something.** Paused (a drag, a
 *     string being run, a marquee) or dirty (unsaved local edits) means the pull
 *     is *remembered*, not dropped, and lands the moment the board goes quiet.
 *     A dirty client is about to save anyway, and the save returns the merge.
 *  3. **One pull at a time, latest wins.** Four people moving cards produce a
 *     stream of signals; they collapse into one request in flight and one more
 *     queued behind it — and since §60 that request has a ten-second leash, so
 *     a pull that never answers can no longer leave the latch closed for ever.
 */
export function useBoardLive({
  boardId,
  clientId,
  holding,
  paused,
  dirty,
  onRemote,
  onRename,
}: {
  boardId: string;
  /** This tab. Stable for its lifetime; the server keys presence on it. */
  clientId: string;
  /** Cards this person has selected or is dragging, for everyone else to see. */
  holding: string[];
  /** True while a drag, resize, string or marquee is in flight. */
  paused: boolean;
  /** True while this client has changes it has not saved yet. */
  dirty: boolean;
  onRemote: (state: BoardState, refs: BoardRefs) => void;
  onRename: (name: string) => void;
}) {
  const live = useLiveBase();
  const hands = useLivePointers();
  const { setAlias, setHolding, onChanged, watch, reportPointer: reportSiteFrame, status } = live;

  /**
   * Cards other people are carrying, keyed by card. Derived from the pointer
   * frames, but *not* purely: a card stays where the hand put it until this
   * tab's own pull lands (see `settling`), so a drop does not snap back for the
   * length of one round trip.
   */
  const [carried, setCarried] = useState<Map<string, Carried>>(new Map());
  /**
   * Tabs whose save has been announced but not yet pulled. Their carried
   * positions stay on screen until the pull lands.
   */
  const settling = useRef<Set<string>>(new Set());

  const quiet = !paused && !dirty;
  const quietRef = useRef(quiet);
  quietRef.current = quiet;

  const onRemoteRef = useRef(onRemote);
  onRemoteRef.current = onRemote;
  const onRenameRef = useRef(onRename);
  onRenameRef.current = onRename;

  const pulling = useRef(false);
  const pullAgain = useRef(false);
  /** A change arrived while the user was busy; apply it when they stop. */
  const owed = useRef(false);
  /** §60: how long to wait before trying a pull that timed out again. */
  const pullBackoff = useRef(0);
  const pullRetry = useRef<ReturnType<typeof setTimeout> | null>(null);

  const pull = useCallback(async () => {
    if (!quietRef.current) {
      owed.current = true;
      return;
    }
    if (pulling.current) {
      pullAgain.current = true;
      return;
    }
    pulling.current = true;
    /*
     * §60: every pull has a leash.
     *
     * The latch that keeps one request in flight had no timeout and no abort,
     * so a fetch that never answered — a sleeping laptop, a proxy holding the
     * socket — left `pulling` closed for the life of the page and every later
     * signal quietly filed under `pullAgain`, which nothing would ever run. The
     * wall then looked live and was frozen.
     */
    const abort = new AbortController();
    const leash = setTimeout(() => abort.abort(), PULL_TIMEOUT_MS);
    let timedOut = false;
    try {
      const response = await fetch(`/api/boards/${boardId}`, { cache: 'no-store', signal: abort.signal });
      // A board that has been deleted, or hidden from this viewer since the page
      // loaded, answers 404. Leave what is on screen alone rather than blanking
      // it: the next signal or poll will try again, and if it really is gone the
      // player finds out the moment they navigate.
      if (!response.ok) return;
      const data = (await response.json()) as {
        name: string;
        state: BoardState;
        entries: BoardRefs['entries'];
        maps: BoardRefs['maps'];
        cases: BoardRefs['cases'];
        timelines?: BoardRefs['timelines'];
        // §52: absent from an older server, which is what the `?? {}` below is for.
        boards?: BoardRefs['boards'];
      };
      // The user may have picked a card up between the request and the reply.
      if (!quietRef.current) {
        owed.current = true;
        return;
      }
      owed.current = false;
      pullBackoff.current = 0;
      onRemoteRef.current(data.state, { entries: data.entries, maps: data.maps, cases: data.cases, timelines: data.timelines ?? {}, boards: data.boards ?? {} });
      onRenameRef.current(data.name);
      // Whatever those tabs were carrying is now where the document says.
      if (settling.current.size) {
        const done = settling.current;
        settling.current = new Set();
        setCarried((current) => {
          const next = new Map([...current].filter(([, item]) => !done.has(item.by)));
          return next.size === current.size ? current : next;
        });
      }
    } catch (err) {
      timedOut = (err as { name?: string } | null)?.name === 'AbortError';
    } finally {
      clearTimeout(leash);
      pulling.current = false;
      if (pullAgain.current) {
        pullAgain.current = false;
        void pull();
      } else if (timedOut) {
        // Try again, and back off, but never give up: this is the only road by
        // which a wall that missed a signal catches up.
        pullBackoff.current = Math.min(30_000, pullBackoff.current ? pullBackoff.current * 2 : 1000);
        if (pullRetry.current) clearTimeout(pullRetry.current);
        pullRetry.current = setTimeout(() => {
          pullRetry.current = null;
          void pull();
        }, pullBackoff.current);
      }
    }
  }, [boardId]);

  useEffect(
    () => () => {
      if (pullRetry.current) clearTimeout(pullRetry.current);
      pullRetry.current = null;
    },
    [],
  );

  /** Whatever was owed while the user was busy lands as soon as they are not. */
  useEffect(() => {
    if (quiet && owed.current) void pull();
  }, [quiet, pull]);

  /* ------------------------------------------------------------- the line */

  /*
   * §60: the wall answers to this tab's own id as well.
   *
   * `clientId` here is the canvas's — minted before the site line exists and
   * quoted in every save (`publishChange(boardId, {by})`). Telling the hub that
   * it is this line means two things: the author is not told about their own
   * save, and the `by` everybody else receives is the same client id their
   * pointer frames carry, which is what makes `settling` line up with
   * `carried`.
   */
  useEffect(() => {
    setAlias(clientId);
    return () => setAlias(null);
  }, [clientId, setAlias]);

  /** The wall's own key, watched for as long as it is open. */
  useEffect(() => watch([boardKey(boardId)]), [boardId, watch]);

  useEffect(() => {
    const key = boardKey(boardId);
    return onChanged((keys, info) => {
      if (!keys.includes(key)) return;
      // Rule 2 of live-boards: never on one's own save. The hub already skips
      // it, and this is the belt to that pair of braces — the ORM's own signal
      // for the same write carries no `by` at all.
      if (info?.by && info.by === clientId) return;
      if (info?.by) settling.current.add(info.by);
      void pull();
    });
  }, [boardId, clientId, onChanged, pull]);

  /**
   * The line as the wall reads it. `idle` is a tab nobody is looking at — the
   * socket is resting, not broken, so it says "connecting" and does not poll:
   * there is nobody at the screen for a poll to be for.
   */
  const state: LiveState = status === 'live' ? 'live' : status === 'offline' ? 'polling' : 'connecting';

  /**
   * If the line will not stay up — an old proxy that buffers, a browser with
   * EventSource disabled — the board still catches up, just every few seconds
   * instead of at once. Degrading rather than dying is the point.
   */
  useEffect(() => {
    if (state !== 'polling') return;
    const poll = setInterval(() => void pull(), POLL_MS);
    return () => clearInterval(poll);
  }, [state, pull]);

  /** Whatever happened while the line was down is caught up on the moment it is back. */
  useEffect(() => {
    if (status === 'live') void pull();
  }, [status, pull]);

  /* ---------------------------------------------------------- our own hand */

  const holdingKey = holding.join(',');
  useEffect(() => {
    setHolding(holdingKey ? holdingKey.split(',') : []);
  }, [holdingKey, setHolding]);

  /* ------------------------------------------------------- pointer frames */

  /**
   * "My pointer is here; the cards I am dragging are here." The site line does
   * the coalescing and the throttling now (§60, 80 ms, and nothing at all when
   * this tab is alone at the wall), so this only has to remember the parts of
   * a frame the caller did not mention: a move says where the cards are without
   * repeating where the cursor is.
   */
  const frame = useRef<{ x: number | null; y: number | null; m: Record<string, [number, number]>; s: [number, number, number, number] | null }>({
    x: null,
    y: null,
    m: {},
    s: null,
  });

  const reportPointer = useCallback(
    (next: {
      cursor?: { x: number; y: number } | null;
      moving?: Record<string, { x: number; y: number }>;
      /** `[x0, y0, x1, y1]` while a box is being dragged; null when it closes. */
      selection?: [number, number, number, number] | null;
    }) => {
      const current = frame.current;
      if (next.cursor !== undefined) {
        current.x = next.cursor ? Math.round(next.cursor.x) : null;
        current.y = next.cursor ? Math.round(next.cursor.y) : null;
      }
      if (next.moving !== undefined) {
        const m: Record<string, [number, number]> = {};
        for (const [id, at] of Object.entries(next.moving).slice(0, POINTER_CARD_LIMIT)) {
          if (Number.isFinite(at.x) && Number.isFinite(at.y)) m[id] = [Math.round(at.x), Math.round(at.y)];
        }
        current.m = m;
      }
      if (next.selection !== undefined) {
        current.s = next.selection
          ? [
              Math.round(next.selection[0]),
              Math.round(next.selection[1]),
              Math.round(next.selection[2]),
              Math.round(next.selection[3]),
            ]
          : null;
      }
      reportSiteFrame({ x: current.x, y: current.y, m: current.m, s: current.s });
    },
    [reportSiteFrame],
  );

  /*
   * §60: the hand let go.
   *
   * A frame is now a *state* rather than a telegram — the site line coalesces
   * and the fields it does not mention keep their last value — so something has
   * to say when the cards are no longer in the air. `paused` is exactly that:
   * it is true for the length of a drag, a resize, a string or a marquee, and
   * the moment it falls the hand is empty. (The watcher does not act on the
   * emptying until its own pull has landed; see `settling`.)
   */
  useEffect(() => {
    if (paused) return;
    frame.current.m = {};
    frame.current.s = null;
  }, [paused]);

  /* ------------------------------------------------------- what to render */

  /** Everyone but us. The site line's roster already leaves this tab out. */
  const others = useMemo<Person[]>(
    () => live.people.filter((person) => person.clientId !== clientId),
    [live.people, clientId],
  );

  /**
   * Card id → the first other person holding it. One border per card: two
   * people on the same card is rare, and stacking outlines would be soup.
   */
  const heldByOthers = useMemo(() => {
    const map = new Map<string, Person>();
    for (const person of others) {
      for (const id of person.holding) if (!map.has(id)) map.set(id, person);
    }
    return map;
  }, [others]);

  /**
   * Other people's selection boxes, in the ink of whoever is dragging each.
   * Normalised to a positive rectangle here rather than in the renderer: a box
   * dragged up and to the left arrives with its corners the other way round.
   */
  const marquees = useMemo<Marquee[]>(() => {
    const out: Marquee[] = [];
    const fresh = Date.now() - MARQUEE_TTL_MS;
    for (const hand of hands) {
      if (!hand.s || hand.at < fresh || hand.clientId === clientId) continue;
      const [x0, y0, x1, y1] = hand.s;
      out.push({
        clientId: hand.clientId,
        name: hand.name,
        colour: hand.colour,
        x: Math.min(x0, x1),
        y: Math.min(y0, y1),
        width: Math.abs(x1 - x0),
        height: Math.abs(y1 - y0),
      });
    }
    return out;
  }, [hands, clientId]);

  /** Other people's pointers, with the name and ink of whoever is behind each. */
  const pointers = useMemo<Cursor[]>(() => {
    const out: Cursor[] = [];
    for (const hand of hands) {
      if (hand.x === null || hand.y === null || hand.clientId === clientId) continue;
      out.push({ clientId: hand.clientId, name: hand.name, colour: hand.colour, x: hand.x, y: hand.y, at: hand.at });
    }
    return out;
  }, [hands, clientId]);

  /*
   * The cards other people have in the air.
   *
   * Kept in state rather than derived straight from the frames, because a card
   * has to *stay* where the hand put it after the hand stopped sending frames —
   * from the drop until this tab's own pull lands (`settling`). A frame from a
   * tab replaces everything that tab was carrying; a tab that leaves the wall
   * takes what it held with it.
   */
  useEffect(() => {
    if (!hands.length) return;
    setCarried((current) => {
      const next = new Map(current);
      const at = Date.now();
      let changed = false;
      for (const hand of hands) {
        if (hand.clientId === clientId) continue;
        /*
         * A hand that has let go stops naming its cards — but its save may
         * still be on its way here. Until this tab's own pull has landed
         * (`settling`), the cards stay exactly where the hand put them: taking
         * them off now would drop each one back to where the document still has
         * it and then jump it forward again a round trip later, which is the
         * snap-back §8 went to some trouble to be rid of.
         */
        const landing = settling.current.has(hand.clientId);
        for (const [id, item] of [...next]) {
          if (item.by !== hand.clientId) continue;
          if (!hand.m[id] && !landing) {
            next.delete(id);
            changed = true;
          }
        }
        for (const [cardId, [x, y]] of Object.entries(hand.m)) {
          const before = next.get(cardId);
          if (before && before.x === x && before.y === y && before.by === hand.clientId) continue;
          next.set(cardId, { x, y, by: hand.clientId, at });
          changed = true;
        }
      }
      return changed ? next : current;
    });
  }, [hands, clientId]);

  /** A tab that left the wall takes its pointer and whatever it was carrying with it. */
  const hereKey = others.map((person) => person.clientId).join(',');
  useEffect(() => {
    const here = new Set(hereKey ? hereKey.split(',') : []);
    setCarried((current) => {
      const next = new Map([...current].filter(([, item]) => here.has(item.by)));
      return next.size === current.size ? current : next;
    });
  }, [hereKey]);

  /**
   * A card left "carried" with no frame and no save behind it — the tab that
   * held it lost its connection mid-drag — goes back to where the document has
   * it.
   */
  useEffect(() => {
    const prune = setInterval(() => {
      const stale = Date.now() - CARRIED_TTL_MS;
      setCarried((current) => {
        const next = new Map([...current].filter(([, item]) => item.at >= stale));
        return next.size === current.size ? current : next;
      });
    }, 2000);
    return () => clearInterval(prune);
  }, []);

  return { others, heldByOthers, pointers, marquees, carried, reportPointer, state, pull };
}
