'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { BoardState } from '@/lib/boards/merge';
import type { BoardEntryFacts } from '@/lib/boards/service';

export type Person = {
  clientId: string;
  name: string;
  colour: string;
  holding: string[];
};

export type LiveState = 'connecting' | 'live' | 'polling';

/** How often to fall back on asking, when the open line will not stay open. */
const POLL_MS = 4000;
/** Presence is chatty while dragging; this is the floor between posts. */
const PRESENCE_THROTTLE_MS = 180;
/** Say "still here" this often even when nothing changes, under the server's TTL. */
const HEARTBEAT_MS = 12_000;

/**
 * §8, live: the other half of `useBoardSync`.
 *
 * `useBoardSync` pushes what this client did. This one listens for what
 * everybody else did, and says who is standing at the wall. They are separate
 * hooks because they fail separately: the line going down must not stop saving,
 * and a failed save must not take presence with it.
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
 *     queued behind it.
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
  /** True while a drag, crop, string or marquee is in flight. */
  paused: boolean;
  /** True while this client has changes it has not saved yet. */
  dirty: boolean;
  onRemote: (state: BoardState, entries: Record<string, BoardEntryFacts>) => void;
  onRename: (name: string) => void;
}) {
  const [people, setPeople] = useState<Person[]>([]);
  const [state, setState] = useState<LiveState>('connecting');

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
    try {
      const response = await fetch(`/api/boards/${boardId}`, { cache: 'no-store' });
      // A board that has been deleted, or hidden from this viewer since the page
      // loaded, answers 404. Leave what is on screen alone rather than blanking
      // it: the next signal or poll will try again, and if it really is gone the
      // player finds out the moment they navigate.
      if (!response.ok) return;
      const data = (await response.json()) as {
        name: string;
        state: BoardState;
        entries: Record<string, BoardEntryFacts>;
      };
      // The user may have picked a card up between the request and the reply.
      if (!quietRef.current) {
        owed.current = true;
        return;
      }
      owed.current = false;
      onRemoteRef.current(data.state, data.entries);
      onRenameRef.current(data.name);
    } catch {
      /* the next signal, or the next poll, will try again */
    } finally {
      pulling.current = false;
      if (pullAgain.current) {
        pullAgain.current = false;
        void pull();
      }
    }
  }, [boardId]);

  /** Whatever was owed while the user was busy lands as soon as they are not. */
  useEffect(() => {
    if (quiet && owed.current) void pull();
  }, [quiet, pull]);

  /* ------------------------------------------------------------- the line */

  useEffect(() => {
    let source: EventSource | null = null;
    let poll: ReturnType<typeof setInterval> | null = null;
    let retry: ReturnType<typeof setTimeout> | null = null;
    let failures = 0;
    let stopped = false;

    /**
     * If the line will not stay up — an old proxy that buffers, a browser with
     * EventSource disabled — the board still catches up, just every few seconds
     * instead of at once. Degrading rather than dying is the point.
     */
    const startPolling = () => {
      if (poll || stopped) return;
      setState('polling');
      // Presence only arrives over the open line, so with it down we are no
      // longer being told when anyone leaves or puts a card down. Showing
      // nobody is honest; leaving the last roster frozen on screen is not.
      setPeople([]);
      poll = setInterval(() => void pull(), POLL_MS);
    };

    const open = () => {
      if (stopped) return;
      source = new EventSource(
        `/api/boards/${boardId}/live?c=${encodeURIComponent(clientId)}`,
      );

      source.onopen = () => {
        failures = 0;
        if (poll) {
          clearInterval(poll);
          poll = null;
        }
        setState('live');
        // Whatever happened while the line was down is caught up on now.
        void pull();
      };

      source.addEventListener('change', () => void pull());

      source.addEventListener('presence', (event) => {
        try {
          const data = JSON.parse((event as MessageEvent).data) as { people: Person[] };
          setPeople(data.people ?? []);
        } catch {
          /* a malformed frame is not worth tearing the line down for */
        }
      });

      source.onerror = () => {
        source?.close();
        source = null;
        failures += 1;
        // EventSource reconnects on its own, but only for a clean drop; this
        // covers the rest, and backs off so a server that is down is not hit
        // four times a second by every open board.
        if (failures >= 2) startPolling();
        if (stopped) return;
        retry = setTimeout(open, Math.min(30_000, 1000 * 2 ** Math.min(failures, 5)));
      };
    };

    open();

    return () => {
      stopped = true;
      source?.close();
      if (poll) clearInterval(poll);
      if (retry) clearTimeout(retry);
    };
  }, [boardId, clientId, pull]);

  /* ---------------------------------------------------------- our own hand */

  const holdingKey = holding.join(',');
  const lastPost = useRef(0);
  const postTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const postPresence = useCallback(
    (body: Record<string, unknown>) => {
      void fetch(`/api/boards/${boardId}/live`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ clientId, ...body }),
        keepalive: true,
      }).catch(() => undefined);
    },
    [boardId, clientId],
  );

  useEffect(() => {
    const ids = holdingKey ? holdingKey.split(',') : [];
    const since = Date.now() - lastPost.current;

    const send = () => {
      lastPost.current = Date.now();
      postPresence({ holding: ids });
    };

    if (postTimer.current) clearTimeout(postTimer.current);
    if (since >= PRESENCE_THROTTLE_MS) send();
    else postTimer.current = setTimeout(send, PRESENCE_THROTTLE_MS - since);

    return () => {
      if (postTimer.current) clearTimeout(postTimer.current);
    };
  }, [holdingKey, postPresence]);

  useEffect(() => {
    const beat = setInterval(() => postPresence({ holding: undefined }), HEARTBEAT_MS);
    // A closing tab should vanish from the wall at once rather than after the
    // server's thirty-second reap; `keepalive` is what lets the request outlive
    // the page.
    const onHide = () => postPresence({ leaving: true });
    window.addEventListener('pagehide', onHide);
    return () => {
      clearInterval(beat);
      window.removeEventListener('pagehide', onHide);
      postPresence({ leaving: true });
    };
  }, [postPresence]);

  /* ------------------------------------------------------- what to render */

  /** Everyone but us, and which card each of them has a hand on. */
  const others = useMemo(
    () => people.filter((person) => person.clientId !== clientId),
    [people, clientId],
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

  return { others, heldByOthers, state, pull };
}
