'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { PublicPerson } from '@/lib/live/hub';

/**
 * §21: one tab's end of the site line.
 *
 * Mounted once by the shell, kept for the life of the tab. Everything live on
 * every page goes through it: which keys the page watches, where the tab is
 * standing (its *place*), the hand's position, and every room of shared text
 * the page has open. One `EventSource` down, batched POSTs up.
 *
 * The provider owns *state that must survive a reconnect*: the watch list,
 * the place, the rooms. When the line drops and comes back the server knows
 * nothing about this tab any more, so the provider says everything again in
 * one POST — and fires `changed` for every watched key, because whatever moved
 * while the line was down is now stale on screen.
 *
 * Nothing here knows what a key means. A page says "watch entry:abc and
 * entries"; a change to either calls the page back; the page decides what to
 * re-read. The wire carries a signal, never the document.
 */

export type LiveStatus = 'connecting' | 'live' | 'offline';

export type LivePointer = {
  clientId: string;
  name: string;
  colour: string;
  x: number | null;
  y: number | null;
  /** What they are carrying, in the place's coordinates. */
  m: Record<string, [number, number]>;
  at: number;
};

export type PointerFrame = { x: number | null; y: number | null; m?: Record<string, [number, number]> };

export type RoomHandlers = {
  onEvent: (event: string, data: unknown) => void;
};

export type RoomHandle = {
  /** A Yjs update (base64). `refused` is a room that will not take this tab's keystrokes; `down` is no line. */
  sendUpdate: (u: string) => Promise<'ok' | 'refused' | 'down'>;
  sendAwareness: (a: string) => Promise<boolean>;
  leave: () => void;
};

export type LiveValue = {
  clientId: string;
  status: LiveStatus;
  /** Watch these keys; returns the way to stop. Counted, so two components may watch one key. */
  watch: (keys: string[]) => () => void;
  /** Called with the keys that moved, of those this tab watches. */
  onChanged: (callback: (keys: string[]) => void) => () => void;
  /** Where the tab stands, and (optionally) what it is holding there. */
  setPlace: (place: string | null, holding?: string[]) => void;
  setHolding: (holding: string[]) => void;
  reportPointer: (frame: PointerFrame | null) => void;
  /** Everyone else at this tab's place. */
  people: PublicPerson[];
  /** Everyone else's hand at this tab's place, freshest first. */
  pointers: LivePointer[];
  joinRoom: (key: string, yClient: number, handlers: RoomHandlers) => RoomHandle;
  /** A page that draws its own presence strip turns the shell's off. */
  setStripHidden: (hidden: boolean) => void;
  stripHidden: boolean;
  /**
   * When this tab last wrote to the archive itself (any non-GET fetch to this
   * origin). A `changed` that follows one's own write within `OWN_WRITE_MUTE_MS`
   * is one's own echo: the page has already refreshed itself, and a second
   * refresh landing during the navigation that often follows a write (create,
   * then `router.push`) can cancel that navigation.
   */
  ownWriteAt: () => number;
};

/** How long after a write of its own a tab treats a `changed` as its own echo. */
export const OWN_WRITE_MUTE_MS = 2500;

const LiveContext = createContext<LiveValue | null>(null);

export function useLive(): LiveValue {
  const value = useContext(LiveContext);
  if (!value) throw new Error('useLive must be used inside <LiveProvider>');
  return value;
}

/** The same, or null outside the shell (a component rendered in a test harness). */
export function useLiveOptional(): LiveValue | null {
  return useContext(LiveContext);
}

/** Pointer frames go up at most this often. */
const POINTER_THROTTLE_MS = 60;
/** A pointer with no frame for this long is put away. */
const POINTER_TTL_MS = 8000;
/** The server reaps a line silent for 45 s; this keeps it heard from. */
const HEARTBEAT_MS = 20_000;

type Outgoing = {
  watch?: string[];
  place?: { key: string; holding?: string[] } | null;
  cursor?: PointerFrame;
  join?: { key: string; y: number }[];
  leave?: string[];
  updates?: { key: string; u: string }[];
  awareness?: { key: string; a: string }[];
};

type Settle = { keys: Set<string>; resolve: (result: { ok: boolean; refused: Set<string> }) => void };

export function LiveProvider({ children }: { children: ReactNode }) {
  const clientIdRef = useRef('');
  if (!clientIdRef.current) clientIdRef.current = `t_${Math.random().toString(36).slice(2, 12)}`;
  const clientId = clientIdRef.current;

  const [status, setStatus] = useState<LiveStatus>('connecting');
  const [people, setPeople] = useState<PublicPerson[]>([]);
  const [pointerMap, setPointerMap] = useState<Map<string, LivePointer>>(new Map());
  const [stripHidden, setStripHidden] = useState(false);

  /* -------------------------------------------------- what must survive */

  const connectionRef = useRef<string | null>(null);
  const watchCounts = useRef<Map<string, number>>(new Map());
  const placeRef = useRef<{ key: string; holding: string[] } | null>(null);
  const rooms = useRef<Map<string, { yClient: number; handlers: RoomHandlers }>>(new Map());
  const changeListeners = useRef<Set<(keys: string[]) => void>>(new Set());

  /* ---------------------------------------------------- one's own writes */

  const lastOwnWrite = useRef(0);
  useEffect(() => {
    const original = window.fetch;
    const note = () => {
      lastOwnWrite.current = Date.now();
    };
    window.fetch = function patchedFetch(input: RequestInfo | URL, init?: RequestInit) {
      let own = false;
      try {
        const method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase();
        const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
        const sameOrigin = url.startsWith('/') || url.startsWith(window.location.origin);
        own = method !== 'GET' && method !== 'HEAD' && sameOrigin && !url.includes('/api/live/');
      } catch {
        own = false;
      }
      if (own) note();
      const result = original.call(window, input, init);
      // Marked again when the answer is in: the write has landed by then, and
      // the echo follows it.
      if (own) result.then(note, note);
      return result;
    };
    return () => {
      window.fetch = original;
    };
  }, []);
  const ownWriteAt = useCallback(() => lastOwnWrite.current, []);

  /* ------------------------------------------------------------- posting */

  const outgoing = useRef<Outgoing>({});
  const settles = useRef<Settle[]>([]);
  const postTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectRef = useRef<() => void>(() => undefined);

  const inFlight = useRef<Promise<void> | null>(null);
  const flushPost = useCallback(async () => {
    postTimer.current = null;
    // One request at a time, in order: a `leave` must not overtake the `join`
    // that follows it on a fast page change.
    if (inFlight.current) {
      await inFlight.current;
      if (!postTimer.current) postTimer.current = setTimeout(() => void flushPost(), 0);
      return;
    }
    let release: () => void = () => undefined;
    inFlight.current = new Promise<void>((resolve) => {
      release = resolve;
    });
    try {
      await sendPostRef.current();
    } finally {
      inFlight.current = null;
      release();
    }
  }, []);

  const sendPost = useCallback(async () => {
    const connection = connectionRef.current;
    const body = outgoing.current;
    const waiting = settles.current;
    outgoing.current = {};
    settles.current = [];
    if (!connection) {
      // No line: the state is remembered and said in full when one opens.
      for (const settle of waiting) settle.resolve({ ok: false, refused: new Set() });
      return;
    }
    if (!Object.keys(body).length && !waiting.length) return;
    try {
      const response = await fetch('/api/live/site', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ clientId, connection, ...body }),
        keepalive: true,
      });
      if (response.status === 409) {
        // The server forgot us (a restart, a reaped line): open a fresh line
        // and say everything again. Whatever was in this body is said then.
        for (const settle of waiting) settle.resolve({ ok: false, refused: new Set() });
        reconnectRef.current();
        return;
      }
      let refused = new Set<string>();
      if (response.ok && response.status !== 204) {
        try {
          const data = (await response.json()) as { refused?: string[] };
          refused = new Set(data.refused ?? []);
        } catch {
          /* a 204 with no body */
        }
      }
      for (const settle of waiting) settle.resolve({ ok: response.ok, refused });
    } catch {
      setStatus('offline');
      for (const settle of waiting) settle.resolve({ ok: false, refused: new Set() });
    }
  }, [clientId]);
  const sendPostRef = useRef(sendPost);
  sendPostRef.current = sendPost;

  const schedulePost = useCallback(() => {
    if (!postTimer.current) postTimer.current = setTimeout(() => void flushPost(), 0);
  }, [flushPost]);

  /** Merge into the next POST. Later values of `watch`/`place`/`cursor` replace earlier; lists concatenate. */
  const post = useCallback(
    (partial: Outgoing, keys: string[] = []) =>
      new Promise<{ ok: boolean; refused: Set<string> }>((resolve) => {
        const current = outgoing.current;
        if (partial.watch) current.watch = partial.watch;
        if (partial.place !== undefined) current.place = partial.place;
        if (partial.cursor) current.cursor = partial.cursor;
        if (partial.join) current.join = [...(current.join ?? []), ...partial.join];
        if (partial.leave) current.leave = [...(current.leave ?? []), ...partial.leave];
        if (partial.updates) current.updates = [...(current.updates ?? []), ...partial.updates];
        if (partial.awareness) current.awareness = [...(current.awareness ?? []), ...partial.awareness];
        settles.current.push({ keys: new Set(keys), resolve });
        schedulePost();
      }),
    [schedulePost],
  );

  /** Everything the server needs to know about this tab, in one body. */
  const sayEverything = useCallback(() => {
    const watch = [...watchCounts.current.keys()];
    const place = placeRef.current ? { key: placeRef.current.key, holding: placeRef.current.holding } : null;
    const join = [...rooms.current.entries()].map(([key, room]) => ({ key, y: room.yClient }));
    void post({ watch, place, join });
  }, [post]);

  /* ------------------------------------------------------------ the line */

  useEffect(() => {
    let source: EventSource | null = null;
    let retry: ReturnType<typeof setTimeout> | null = null;
    let stopped = false;
    let failures = 0;
    let everConnected = false;

    const open = () => {
      if (stopped) return;
      if (retry) {
        clearTimeout(retry);
        retry = null;
      }
      source?.close();
      connectionRef.current = null;
      source = new EventSource(`/api/live/site?c=${encodeURIComponent(clientId)}`);

      source.addEventListener('hello', (event) => {
        try {
          const data = JSON.parse((event as MessageEvent).data) as { connection: string };
          connectionRef.current = data.connection;
          failures = 0;
          setStatus('live');
          sayEverything();
          if (everConnected) {
            // Whatever moved while the line was down is stale on screen now.
            const keys = [...watchCounts.current.keys()];
            if (keys.length) for (const listener of changeListeners.current) listener(keys);
          }
          everConnected = true;
        } catch {
          /* a malformed hello: the retry will bring another */
        }
      });

      source.addEventListener('changed', (event) => {
        try {
          const data = JSON.parse((event as MessageEvent).data) as { keys: string[] };
          if (!Array.isArray(data.keys) || !data.keys.length) return;
          for (const listener of changeListeners.current) listener(data.keys);
        } catch {
          /* ignore */
        }
      });

      source.addEventListener('presence', (event) => {
        try {
          const data = JSON.parse((event as MessageEvent).data) as { place: string; people: PublicPerson[] };
          if (data.place !== placeRef.current?.key) return;
          setPeople(data.people.filter((person) => person.clientId !== clientId));
        } catch {
          /* ignore */
        }
      });

      source.addEventListener('pointer', (event) => {
        try {
          const data = JSON.parse((event as MessageEvent).data) as {
            place: string;
            c: string;
            x: number | null;
            y: number | null;
            m: Record<string, [number, number]>;
          };
          if (data.place !== placeRef.current?.key || data.c === clientId) return;
          setPointerMap((current) => {
            const next = new Map(current);
            // Name and ink are looked up from the roster at render time; a
            // frame carries only the client id.
            next.set(data.c, { clientId: data.c, name: '', colour: '', x: data.x, y: data.y, m: data.m ?? {}, at: Date.now() });
            return next;
          });
        } catch {
          /* ignore */
        }
      });

      source.addEventListener('room', (event) => {
        try {
          const data = JSON.parse((event as MessageEvent).data) as { k: string; e: string; d: unknown };
          rooms.current.get(data.k)?.handlers.onEvent(data.e, data.d);
        } catch {
          /* ignore */
        }
      });

      source.onerror = () => {
        source?.close();
        source = null;
        connectionRef.current = null;
        failures += 1;
        setStatus('offline');
        setPeople([]);
        if (stopped) return;
        retry = setTimeout(open, Math.min(30_000, 1000 * 2 ** Math.min(failures, 5)));
      };
    };

    reconnectRef.current = () => {
      if (stopped) return;
      failures = 0;
      open();
    };
    open();

    const heartbeat = setInterval(() => {
      if (connectionRef.current) void post({});
    }, HEARTBEAT_MS);

    // When a tab comes back from the background, its line may have been reaped
    // in silence; a heartbeat finds out at once rather than in twenty seconds.
    const onVisible = () => {
      if (document.visibilityState === 'visible' && connectionRef.current) void post({});
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      stopped = true;
      clearInterval(heartbeat);
      document.removeEventListener('visibilitychange', onVisible);
      source?.close();
      if (retry) clearTimeout(retry);
      if (postTimer.current) {
        clearTimeout(postTimer.current);
        postTimer.current = null;
      }
      connectionRef.current = null;
    };
  }, [clientId, post, sayEverything]);

  /* ------------------------------------------------------------ pointers */

  useEffect(() => {
    const sweep = setInterval(() => {
      setPointerMap((current) => {
        const cutoff = Date.now() - POINTER_TTL_MS;
        let changed = false;
        const next = new Map(current);
        for (const [id, pointer] of next) {
          if (pointer.at < cutoff || pointer.x === null) {
            next.delete(id);
            changed = true;
          }
        }
        return changed ? next : current;
      });
    }, 2000);
    return () => clearInterval(sweep);
  }, []);

  const lastFrame = useRef(0);
  const frameTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const nextFrame = useRef<PointerFrame | null>(null);
  const reportPointer = useCallback(
    (frame: PointerFrame | null) => {
      if (!placeRef.current) return;
      nextFrame.current = frame ?? { x: null, y: null, m: {} };
      if (frameTimer.current) return;
      const wait = Math.max(0, POINTER_THROTTLE_MS - (Date.now() - lastFrame.current));
      frameTimer.current = setTimeout(() => {
        frameTimer.current = null;
        lastFrame.current = Date.now();
        if (nextFrame.current) void post({ cursor: nextFrame.current });
        nextFrame.current = null;
      }, wait);
    },
    [post],
  );

  /* ----------------------------------------------------- the public face */

  const watch = useCallback(
    (keys: string[]) => {
      const mine = [...new Set(keys)];
      for (const key of mine) watchCounts.current.set(key, (watchCounts.current.get(key) ?? 0) + 1);
      void post({ watch: [...watchCounts.current.keys()] });
      return () => {
        for (const key of mine) {
          const n = (watchCounts.current.get(key) ?? 0) - 1;
          if (n <= 0) watchCounts.current.delete(key);
          else watchCounts.current.set(key, n);
        }
        void post({ watch: [...watchCounts.current.keys()] });
      };
    },
    [post],
  );

  const onChanged = useCallback((callback: (keys: string[]) => void) => {
    changeListeners.current.add(callback);
    return () => {
      changeListeners.current.delete(callback);
    };
  }, []);

  const setPlace = useCallback(
    (place: string | null, holding?: string[]) => {
      const previous = placeRef.current;
      if (!place) {
        if (!previous) return;
        placeRef.current = null;
        setPeople([]);
        setPointerMap(new Map());
        void post({ place: null });
        return;
      }
      const next = { key: place, holding: holding ?? (previous?.key === place ? previous.holding : []) };
      if (previous?.key !== place) {
        setPeople([]);
        setPointerMap(new Map());
      }
      placeRef.current = next;
      void post({ place: next });
    },
    [post],
  );

  const setHolding = useCallback(
    (holding: string[]) => {
      const current = placeRef.current;
      if (!current) return;
      if (current.holding.length === holding.length && current.holding.every((id, i) => id === holding[i])) return;
      placeRef.current = { key: current.key, holding };
      void post({ place: placeRef.current });
    },
    [post],
  );

  const joinRoom = useCallback(
    (key: string, yClient: number, handlers: RoomHandlers): RoomHandle => {
      rooms.current.set(key, { yClient, handlers });
      void post({ join: [{ key, y: yClient }] });
      return {
        sendUpdate: (u) =>
          post({ updates: [{ key, u }] }, [key]).then((r) => (!r.ok ? 'down' : r.refused.has(key) ? 'refused' : 'ok')),
        sendAwareness: (a) => post({ awareness: [{ key, a }] }, [key]).then((r) => r.ok),
        leave: () => {
          // Only the current tenant may leave: a room re-joined under the same
          // key (development's double mount) must not be left by the old one.
          if (rooms.current.get(key)?.handlers !== handlers) return;
          rooms.current.delete(key);
          void post({ leave: [key] });
        },
      };
    },
    [post],
  );

  // A frame carries only a client id; the name and the ink come from the
  // roster, whichever of the two arrived first. A hand whose owner is not on
  // the roster (yet, or any more) is not drawn.
  const pointers = useMemo(() => {
    const out: LivePointer[] = [];
    for (const pointer of pointerMap.values()) {
      if (pointer.x === null || pointer.y === null) continue;
      const person = people.find((p) => p.clientId === pointer.clientId);
      if (!person) continue;
      out.push({ ...pointer, name: person.name, colour: person.colour });
    }
    return out.sort((a, b) => b.at - a.at);
  }, [pointerMap, people]);

  const value = useMemo<LiveValue>(
    () => ({
      clientId,
      status,
      watch,
      onChanged,
      setPlace,
      setHolding,
      reportPointer,
      people,
      pointers,
      joinRoom,
      setStripHidden,
      stripHidden,
      ownWriteAt,
    }),
    [clientId, status, watch, onChanged, setPlace, setHolding, reportPointer, people, pointers, joinRoom, stripHidden, ownWriteAt],
  );

  return <LiveContext.Provider value={value}>{children}</LiveContext.Provider>;
}

/**
 * Watch some keys and be called when they move. The everyday hook for a client
 * component that keeps its own copy of a record: "when entry:abc changes,
 * fetch it again".
 */
export function useLiveChanges(keys: string[], onChange: (keys: string[]) => void) {
  const live = useLiveOptional();
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const joined = keys.join('\n');
  // Only the two stable functions are dependencies: the context value itself
  // changes with every presence frame, and re-watching on each would be a POST
  // per frame.
  const watch = live?.watch;
  const onChanged = live?.onChanged;
  useEffect(() => {
    if (!watch || !onChanged || !joined) return;
    const list = joined.split('\n');
    const unwatch = watch(list);
    const off = onChanged((changed) => {
      const hit = changed.filter((key) => list.includes(key));
      if (hit.length) onChangeRef.current(hit);
    });
    return () => {
      unwatch();
      off();
    };
  }, [watch, onChanged, joined]);
}
