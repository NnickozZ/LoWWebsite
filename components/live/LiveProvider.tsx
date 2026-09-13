'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { PublicPerson } from '@/lib/live/hub';
import type { InkFrame } from '@/lib/ink/types';
import { announceAuthorNeeded, isAuthorRefusal } from '@/lib/authorSignal';
import {
  HIDDEN_CLOSE_MS,
  POINTER_THROTTLE_MS,
  backoffDelay,
  shouldCloseHidden,
  shouldKeepalive,
  splitUpdates,
} from '@/lib/live/wire';

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

/* ------------------------------------------------- §18b: who is writing */

/**
 * The onderzoeker *this browser window* is writing as, as an id, or `''` while
 * the window has not chosen.
 *
 * It lives here — a module-level box, not React state — for one reason: the
 * `fetch` patch below has to read it, and that patch is installed once for the
 * life of the tab. A value read out of a closure would be the one that existed
 * when the effect ran. The prompt (part 2) sets it before anything can be
 * typed, and reads its remembered answer out of `sessionStorage`, which is
 * exactly the "once per window" lifetime the choice is supposed to have.
 *
 * The server never believes this: `lib/auth/author.ts` resolves whatever
 * arrives against the fiches the account actually holds. This is a convenience
 * for the person, not a credential.
 */
let writingAs = '';

/** Part 2 calls this when the person answers "Met wie ben je nu aan het schrijven?". */
export function setWritingAs(characterId: string | null) {
  writingAs = characterId ?? '';
}

/** What this window is writing as right now — `''` when it has not chosen. */
export function writingAsNow(): string {
  return writingAs;
}

/** The header the choice travels on. One name, shared with `lib/auth/author.ts`. */
export const CHARACTER_HEADER = 'X-Character';

/**
 * Open the line again, right now.
 *
 * A module box for the same reason `writingAs` is one: the thing that has to
 * call it — the sheet that asks "Met wie ben je nu aan het schrijven?" — sits
 * *above* this provider in the tree (it has to, so that it can set the value
 * before this provider's effect ever runs), and so cannot reach the context.
 * There is exactly one `LiveProvider` per tab, and the closure below no-ops
 * once its own mount has stopped, so a Strict Mode remount simply replaces it.
 */
let reopenLine: (() => void) | null = null;

/** Reopen the site line so its URL carries the window's onderzoeker anew. */
export function reconnectLive() {
  reopenLine?.();
}

/**
 * §60: four words, and the fourth is new.
 *
 * `idle` is a tab that gave its socket back because nobody has looked at it for
 * three quarters of a minute. It is *not* `offline`: nothing is wrong, nothing
 * is being missed (the `hello` that follows replays the watch list and fires a
 * `changed` for every key), and the strip must not paint "geen verbinding" over
 * a tab in the background. It shows nobody and a quiet dot.
 */
export type LiveStatus = 'connecting' | 'live' | 'offline' | 'idle';

export type LivePointer = {
  clientId: string;
  name: string;
  colour: string;
  x: number | null;
  y: number | null;
  /** What they are carrying, in the place's coordinates. */
  m: Record<string, [number, number]>;
  /** §60: the selection box this hand is dragging open, `[x0, y0, x1, y1]`, or null. */
  s: [number, number, number, number] | null;
  at: number;
};

export type PointerFrame = {
  x: number | null;
  y: number | null;
  m?: Record<string, [number, number]>;
  s?: [number, number, number, number] | null;
};

/**
 * §60: why a `changed` arrived.
 *
 * `remote` is somebody else's write. `resync` is the replay that follows a
 * reconnection — the line was down, whatever moved while it was down is stale
 * on screen, and that must land *at once* rather than be held behind the
 * own-write mute, which is about one's own echo and has nothing to say here.
 * `by` is the clientId of the tab that wrote it, where anything knew it.
 */
export type ChangeInfo = { reason: 'remote' | 'resync'; by?: string | null };

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
  /**
   * Called with the keys that moved, of those this tab watches. The second
   * argument says *why* (§60) — a listener written before it existed simply
   * ignores it.
   */
  onChanged: (callback: (keys: string[], info: ChangeInfo) => void) => () => void;
  /**
   * §60: another name this tab answers to, for a canvas that minted a tab id of
   * its own before the line existed and quotes it in every save it makes. The
   * hub then knows that saver and this line are one tab — so the author is not
   * told about their own save, and everybody else's `by` matches the client id
   * their pointer frames carry. Re-said automatically after a reconnection.
   */
  setAlias: (alias: string | null) => void;
  /** Where the tab stands, and (optionally) what it is holding there. */
  setPlace: (place: string | null, holding?: string[]) => void;
  setHolding: (holding: string[]) => void;
  reportPointer: (frame: PointerFrame | null) => void;
  /** §33: frames of a stroke this tab is drawing, for everyone else at its place. */
  reportInk: (frames: InkFrame[]) => void;
  /** §33: be told of frames other people at this place are drawing. */
  onInk: (callback: (clientId: string, frames: InkFrame[]) => void) => () => void;
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

/**
 * §60: two contexts, because a hand moves twelve times a second and nothing
 * else does.
 *
 * Everything used to hang off one value, so a single pointer frame from
 * somebody else re-rendered `useLiveDoc`, `useInk`, `LiveStrip`, `LivePage`,
 * `MapCanvas` and every editor bound to a room — twelve times a second, per
 * hand. The line's own state (the status, the roster, the stable callbacks)
 * now lives in `LiveBaseContext`, whose identity does **not** change when a
 * hand moves; the hands live in `LivePointerContext` on their own.
 *
 * `useLive()` merges the two, so every call site that existed before this
 * round is unchanged and still re-renders on a frame. Anything that does not
 * draw a hand should ask for `useLiveBase()` instead and be left alone.
 */
type LiveBase = Omit<LiveValue, 'pointers'>;

const LiveBaseContext = createContext<LiveBase | null>(null);
const NO_POINTERS: LivePointer[] = [];

/** Two frames of one hand that would be drawn identically. §60: see `pointers` below. */
function samePointer(a: LivePointer | undefined, b: LivePointer): boolean {
  if (!a) return false;
  if (a.clientId !== b.clientId || a.x !== b.x || a.y !== b.y || a.name !== b.name || a.colour !== b.colour) return false;
  const boxA = a.s;
  const boxB = b.s;
  if (Boolean(boxA) !== Boolean(boxB)) return false;
  if (boxA && boxB && boxA.some((n, i) => n !== boxB[i])) return false;
  const keysA = Object.keys(a.m);
  const keysB = Object.keys(b.m);
  if (keysA.length !== keysB.length) return false;
  for (const key of keysA) {
    const held = b.m[key];
    if (!held || held[0] !== a.m[key][0] || held[1] !== a.m[key][1]) return false;
  }
  return true;
}
const LivePointerContext = createContext<LivePointer[]>(NO_POINTERS);

/** Everyone else's hand at this tab's place, freshest first. Re-renders on every frame. */
export function useLivePointers(): LivePointer[] {
  return useContext(LivePointerContext);
}

/**
 * The line without the hands — the status, the roster, and the callbacks, none
 * of which change identity when somebody moves a mouse.
 */
export function useLiveBase(): LiveBase {
  const value = useContext(LiveBaseContext);
  if (!value) throw new Error('useLive must be used inside <LiveProvider>');
  return value;
}

export function useLive(): LiveValue {
  const base = useLiveBase();
  const pointers = useLivePointers();
  return useMemo(() => ({ ...base, pointers }), [base, pointers]);
}

/** The same, or null outside the shell (a component rendered in a test harness). */
export function useLiveOptional(): LiveValue | null {
  const base = useContext(LiveBaseContext);
  const pointers = useLivePointers();
  return useMemo(() => (base ? { ...base, pointers } : null), [base, pointers]);
}

/** A pointer with no frame for this long is put away. */
const POINTER_TTL_MS = 8000;
/** The server reaps a line silent for 45 s; this keeps it heard from. */
const HEARTBEAT_MS = 20_000;

/**
 * §60: **one line per browser**, not one per tab.
 *
 * A browser opens about six connections to one host over HTTP/1.1, and an SSE
 * stream holds one of them open for ever. Six tabs of the archive and the
 * seventh navigation waits for a socket that is never coming — "a player could
 * not switch tab until every window of the site was closed". So the tabs elect
 * a leader with the Web Locks API: the leader opens the one `EventSource` and
 * relays every frame over a `BroadcastChannel`; the other tabs keep their own
 * clientId, their own watch list, their own place and their own name, and post
 * all of it themselves quoting the leader's connection (`carriedBy`). The hub
 * still sees one person per tab. When the leader tab closes the lock releases,
 * the next tab in the queue takes it, opens a line and everybody says
 * everything again.
 *
 * One constant, so it can be switched off in one place if it ever misbehaves —
 * with it false, every tab opens its own line exactly as before this round.
 */
const ONE_LINE_PER_BROWSER = true;
const LINE_LOCK = 'low-live-leader';
const LINE_CHANNEL = 'low-live';

/** Both halves have to be there, or there is no election to hold. */
function hasOneLineSupport(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    typeof navigator.locks?.request === 'function' &&
    typeof BroadcastChannel === 'function'
  );
}

type Outgoing = {
  alias?: string | null;
  watch?: string[];
  place?: { key: string; holding?: string[] } | null;
  cursor?: PointerFrame;
  ink?: InkFrame[];
  join?: { key: string; y: number }[];
  leave?: string[];
  updates?: { key: string; u: string }[];
  awareness?: { key: string; a: string }[];
};

type Settle = { keys: Set<string>; resolve: (result: { ok: boolean; refused: Set<string> }) => void };

export function LiveProvider({ children, userId = '' }: { children: ReactNode; userId?: string }) {
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
  const changeListeners = useRef<Set<(keys: string[], info: ChangeInfo) => void>>(new Set());
  const inkListeners = useRef<Set<(clientId: string, frames: InkFrame[]) => void>>(new Set());

  /* ---------------------------------------------------- one's own writes */

  const lastOwnWrite = useRef(0);
  useEffect(() => {
    const original = window.fetch;
    const note = () => {
      lastOwnWrite.current = Date.now();
    };
    window.fetch = function patchedFetch(input: RequestInfo | URL, init?: RequestInit) {
      let own = false;
      let sameOrigin = false;
      try {
        const method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase();
        const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
        sameOrigin = url.startsWith('/') || url.startsWith(window.location.origin);
        own = method !== 'GET' && method !== 'HEAD' && sameOrigin && !url.includes('/api/live/');
      } catch {
        own = false;
        sameOrigin = false;
      }
      if (own) note();
      /*
       * §18b: every request to this origin carries the onderzoeker this window
       * is writing as. Here rather than at each call site because there are
       * dozens of them and one forgotten header is one act filed under the
       * wrong name — and on *every* request, not only writes, because the live
       * line and the pages read it too (presence, and the read-only banner).
       *
       * Only same-origin, and only when the window has chosen. Requests that
       * pass a `Request` object keep it: the header is added to a clone, so a
       * caller's own headers are never dropped.
       */
      if (sameOrigin && writingAs) {
        try {
          if (input instanceof Request) {
            const withHeader = new Request(input);
            withHeader.headers.set(CHARACTER_HEADER, writingAs);
            input = withHeader;
          } else {
            const headers = new Headers(init?.headers ?? undefined);
            headers.set(CHARACTER_HEADER, writingAs);
            init = { ...init, headers };
          }
        } catch {
          // A header we could not attach is a request the server answers from
          // the account's own karakter. Never a reason to drop the request.
        }
      }
      const result = original.call(window, input, init);
      // Marked again when the answer is in: the write has landed by then, and
      // the echo follows it.
      if (own) result.then(note, note);
      /*
       * §18b, the other direction: a write the archive refused for want of an
       * onderzoeker comes back as a 400 carrying `needsAuthor`. That is a
       * question, not an error, and it is read here — the one place that sees
       * every request — rather than at fifty call sites that each have their
       * own way of showing a failure. The body is read off a *clone*, so the
       * caller still gets an untouched one.
       */
      if (own) {
        void result.then((response) => {
          if (response.status !== 400) return;
          void response
            .clone()
            .json()
            .then((body: unknown) => {
              if (isAuthorRefusal(response.status, body)) announceAuthorNeeded();
            })
            .catch(() => undefined);
        }, () => undefined);
      }
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
  /**
   * §60: reopen the line. The argument is the leader this tab was refused
   * *through*, when the refusal was a 409 on a carried POST — two of those in a
   * row from the same leader is a leader that is not coming back, and the
   * election is run again rather than asked again.
   */
  const reconnectRef = useRef<(refusedBy?: string) => void>(() => undefined);
  /** §60: this account's id, so a follower can tell its own leader from a stale one. */
  const userIdRef = useRef(userId);
  userIdRef.current = userId;

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

  /**
   * §60: whether this tab is a *follower* — it posts with its own clientId but
   * quotes the leader's connection, and its frames come back down the leader's
   * socket. Set by the leader election below; empty when this tab owns its own
   * line.
   */
  const carriedByRef = useRef('');
  /** A tab that is on its way out: the last POST may use the unload quota. */
  const unloadingRef = useRef(false);

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

    /*
     * §60: a batch of keystrokes is cut to size before it goes.
     *
     * A paste into a Tiptap body is one Yjs update of a hundred kilobytes or
     * more. Sent whole *and* with `keepalive`, `fetch` rejects outright — the
     * unload quota is 64 KiB for the whole origin — and the old code put the
     * same batch back on the queue and retried it for ever, so a paste could
     * wedge a tab's typing until it was reloaded.
     */
    const updates = body.updates ?? [];
    const batches = updates.length ? splitUpdates(updates) : [[]];
    const carriedBy = carriedByRef.current;
    const as = writingAs || undefined;

    let ok = true;
    const refused = new Set<string>();
    for (let i = 0; i < batches.length; i++) {
      // Everything but the updates rides the first request; the rest are
      // keystrokes and nothing else.
      const part =
        i === 0 ? { ...body, updates: batches[i].length ? batches[i] : undefined } : { updates: batches[i] };
      const payload = JSON.stringify({
        clientId,
        connection,
        ...(carriedBy ? { carriedBy, as } : {}),
        ...part,
      });
      const keepalive = shouldKeepalive({
        bytes: payload.length,
        unloading: unloadingRef.current,
        hasUpdates: Boolean(part.updates?.length),
      });
      try {
        const response = await fetch('/api/live/site', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: payload,
          keepalive,
        });
        if (response.status === 409) {
          // The server forgot us (a restart, a reaped line): open a fresh line
          // and say everything again. Whatever was in this body is said then.
          // §60: and the leader we were refused through goes with it — a second
          // refusal from the same one is an election, not another question.
          for (const settle of waiting) settle.resolve({ ok: false, refused: new Set() });
          reconnectRef.current(carriedBy);
          return;
        }
        if (response.ok && response.status !== 204) {
          try {
            const data = (await response.json()) as { refused?: string[] };
            for (const key of data.refused ?? []) refused.add(key);
          } catch {
            /* a 204 with no body */
          }
        }
        if (!response.ok) ok = false;
        else {
          /*
           * §60: a POST that lands says the line is up.
           *
           * Before this round `'live'` was only ever set by `hello`, and one
           * failed POST — a sleeping laptop, a request cancelled by a
           * navigation — set `'offline'` and left it there for the life of the
           * connection. Every page in the tab painted "geen verbinding" over a
           * line that was working perfectly.
           */
          setStatus((current) => (current === 'offline' ? 'live' : current));
        }
      } catch (err) {
        /*
         * A request the browser cancelled (a navigation, an abort) is not the
         * line going down, and must not be reported as one. Anything else is a
         * failed POST — which is still not the same thing as a dead *line*: the
         * stream has its own `onerror`, and that is what says `'offline'`.
         */
        ok = false;
        const name = (err as { name?: string } | null)?.name;
        if (name !== 'AbortError') {
          // A body that could not be sent at all (the keepalive quota, a
          // TypeError) is worth one retry without it, next flush.
          unloadingRef.current = false;
        }
      }
    }
    for (const settle of waiting) settle.resolve({ ok, refused });
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
        if (partial.alias !== undefined) current.alias = partial.alias;
        if (partial.watch) current.watch = partial.watch;
        if (partial.place !== undefined) current.place = partial.place;
        if (partial.cursor) current.cursor = partial.cursor;
        if (partial.ink) current.ink = [...(current.ink ?? []), ...partial.ink];
        if (partial.join) current.join = [...(current.join ?? []), ...partial.join];
        if (partial.leave) current.leave = [...(current.leave ?? []), ...partial.leave];
        if (partial.updates) current.updates = [...(current.updates ?? []), ...partial.updates];
        if (partial.awareness) current.awareness = [...(current.awareness ?? []), ...partial.awareness];
        settles.current.push({ keys: new Set(keys), resolve });
        schedulePost();
      }),
    [schedulePost],
  );

  /** §60: the other name this tab answers to, kept so a reconnection can say it again. */
  const aliasRef = useRef<string | null>(null);
  const setAlias = useCallback(
    (alias: string | null) => {
      if (aliasRef.current === alias) return;
      aliasRef.current = alias;
      void post({ alias });
    },
    [post],
  );

  /** Everything the server needs to know about this tab, in one body. */
  const sayEverything = useCallback(() => {
    const watch = [...watchCounts.current.keys()];
    const place = placeRef.current ? { key: placeRef.current.key, holding: placeRef.current.holding } : null;
    const join = [...rooms.current.entries()].map(([key, room]) => ({ key, y: room.yClient }));
    void post({ alias: aliasRef.current, watch, place, join });
  }, [post]);

  /* ------------------------------------------------------------ the line */

  useEffect(() => {
    let source: EventSource | null = null;
    let retry: ReturnType<typeof setTimeout> | null = null;
    let hiddenTimer: ReturnType<typeof setTimeout> | null = null;
    let stopped = false;
    let failures = 0;
    let everConnected = false;
    /**
     * §60: when this tab started trying. The page's HTML was made at about this
     * moment, so a line that takes more than a breath to open is a line that
     * opened onto a screen already out of date — and that wants the same replay
     * a reconnection does, even though it is the first connection of all.
     */
    const startedAt = Date.now();
    const FIRST_LINE_GRACE_MS = 1500;
    /** True while the line is deliberately shut because nobody is looking. */
    let resting = false;
    /** This tab holds the browser's lock and owns the socket. */
    let leader = !ONE_LINE_PER_BROWSER;
    let channel: BroadcastChannel | null = null;
    let releaseLock: (() => void) | null = null;
    /** When the last tab in this browser stopped being looked at; null while one is. */
    let quietSince: number | null = null;
    /**
     * §60: which tabs in this browser are being looked at, this one included.
     *
     * A freshly elected leader used to know only about itself, because a
     * follower said `seen` at its own mount and at its own visibilitychange and
     * never again — and a `seen` that arrived at a tab which was not the leader
     * was thrown away. So a hidden leader closing while a *visible* follower
     * stood open handed the lock to a hidden tab with an empty set, and
     * forty-five seconds later the whole browser went idle with somebody looking
     * straight at it. Two cures, both cheap: every tab keeps this map whether it
     * leads or not, and a new leader asks (`who`) and is answered (`seen`).
     */
    const seenTabs = new Map<string, number>();
    /**
     * §60: the tabs that are listening to this leader's relay, and when each was
     * last heard from. A leader with no followers is the common case (one tab),
     * and it need not put every frame on the `BroadcastChannel` for nobody.
     */
    const followers = new Map<string, number>();
    const FOLLOWER_TTL_MS = 60_000;
    /** §60: how many 409s in a row, and through which leader. */
    let refusals = 0;
    let refusedBy = '';
    /** §60: true from `pagehide` until `pageshow` — the page is on its way out, or in the bfcache. */
    let away = false;
    /** §60: a lock request is already in the queue; a second would never resolve. */
    let electing = false;

    /* ------------------------------------------------- one decoded frame */

    /**
     * §60: every frame lands here, whether it came down this tab's own socket
     * or over the `BroadcastChannel` from the leader tab. One road in, so a
     * follower and a leader behave identically from here on.
     */
    const take = (event: string, data: unknown) => {
      if (stopped) return;
      try {
        if (event === 'changed') {
          const d = data as { keys: string[]; by?: string | null };
          if (!Array.isArray(d.keys) || !d.keys.length) return;
          for (const listener of changeListeners.current) listener(d.keys, { reason: 'remote', by: d.by ?? null });
        } else if (event === 'presence') {
          const d = data as { place: string; people: PublicPerson[] };
          if (d.place !== placeRef.current?.key) return;
          setPeople(d.people.filter((person) => person.clientId !== clientId));
        } else if (event === 'pointer') {
          const d = data as {
            place: string;
            c: string;
            x: number | null;
            y: number | null;
            m?: Record<string, [number, number]>;
            s?: [number, number, number, number] | null;
          };
          if (d.place !== placeRef.current?.key || d.c === clientId) return;
          // §60: frames are stirred into one map and published on the next
          // animation frame — see `pushFrame`. Name and ink are looked up from
          // the roster at render time; a frame carries only the client id.
          pushFrame({
            clientId: d.c,
            name: '',
            colour: '',
            x: d.x,
            y: d.y,
            m: d.m ?? {},
            s: d.s ?? null,
            at: Date.now(),
          });
        } else if (event === 'ink') {
          const d = data as { place: string; c: string; f: InkFrame[] };
          if (d.place !== placeRef.current?.key || d.c === clientId || !Array.isArray(d.f)) return;
          for (const listener of inkListeners.current) listener(d.c, d.f);
        } else if (event === 'room') {
          const d = data as { k: string; e: string; d: unknown };
          rooms.current.get(d.k)?.handlers.onEvent(d.e, d.d);
        }
      } catch {
        /* a malformed frame is not worth tearing the line down for */
      }
    };

    /** The line is up (again): say everything, and refresh what went stale. */
    const lineIsUp = (connection: string) => {
      connectionRef.current = connection;
      failures = 0;
      // §60: a line that is up is a leader that answered; the refusal streak dies here.
      refusals = 0;
      refusedBy = '';
      setStatus('live');
      sayEverything();
      if (everConnected || Date.now() - startedAt > FIRST_LINE_GRACE_MS) {
        /*
         * Whatever moved while the line was down is stale on screen now. It
         * goes out as a `resync` (§60), which `LivePage` refreshes on at once:
         * the own-write mute is about one's own echo, and holding a resync
         * behind it left a page showing the archive as it was before the gap.
         */
        const keys = [...watchCounts.current.keys()];
        if (keys.length) for (const listener of changeListeners.current) listener(keys, { reason: 'resync' });
      }
      everConnected = true;
    };

    const lineIsDown = () => {
      connectionRef.current = null;
      setPeople([]);
      if (!resting) setStatus('offline');
    };

    /* ------------------------------------------------------- the socket */

    const closeSocket = () => {
      source?.close();
      source = null;
      connectionRef.current = null;
      if (retry) {
        clearTimeout(retry);
        retry = null;
      }
    };

    const open = () => {
      if (stopped || !leader) return;
      if (retry) {
        clearTimeout(retry);
        retry = null;
      }
      resting = false;
      source?.close();
      connectionRef.current = null;
      /*
       * §18b: an `EventSource` cannot carry a header, so this one line carries
       * the window's onderzoeker in the URL instead — same value, same
       * server-side check (`resolveCharacter`), and it only ever decides the
       * name on the presence strip. Everything that *writes* goes up by POST,
       * where the `X-Character` header does the work.
       */
      const as = writingAs ? `&as=${encodeURIComponent(writingAs)}` : '';
      source = new EventSource(`/api/live/site?c=${encodeURIComponent(clientId)}${as}`);

      source.addEventListener('hello', (event) => {
        try {
          const data = JSON.parse((event as MessageEvent).data) as { connection: string };
          lineIsUp(data.connection);
          announceLine();
        } catch {
          /* a malformed hello: the retry will bring another */
        }
      });

      for (const name of ['changed', 'presence', 'pointer', 'ink', 'room'] as const) {
        source.addEventListener(name, (event) => {
          let data: unknown;
          try {
            data = JSON.parse((event as MessageEvent).data);
          } catch {
            return;
          }
          take(name, data);
          relay(clientId, name, data);
        });
      }

      // §60: a frame for a tab that is riding this socket. It is not ours: it
      // is handed straight on, and only the tab it is addressed to takes it.
      source.addEventListener('via', (event) => {
        try {
          const data = JSON.parse((event as MessageEvent).data) as { to: string; e: string; d: unknown };
          if (!data?.to) return;
          relay(data.to, data.e, data.d);
        } catch {
          /* ignore */
        }
      });

      source.onerror = () => {
        source?.close();
        source = null;
        failures += 1;
        lineIsDown();
        announceDown();
        if (stopped || resting) return;
        /*
         * §60: the floor is 500 ms and the ceiling 30 s, with jitter, and
         * there is no road that produces 0. The 409 path used to reset the
         * counter, so a server behind two processes — every POST answered
         * "line unknown" — turned every open tab into a reconnect loop at
         * whatever rate the network allowed.
         */
        retry = setTimeout(open, backoffDelay(failures));
      };
    };

    /* ---------------------------------------------- talking between tabs */

    /** §60: is any other tab in this browser still listening? Silent for a minute is gone. */
    const anyFollower = () => {
      const cutoff = Date.now() - FOLLOWER_TTL_MS;
      for (const [id, at] of followers) if (at < cutoff) followers.delete(id);
      return followers.size > 0;
    };

    const relay = (to: string, event: string, data: unknown) => {
      if (!channel || !leader) return;
      /*
       * §60: a frame addressed to a *carried* tab always goes — it is that tab's
       * own frame and nobody else's. A copy of this tab's own frames goes only
       * when some other tab has said it is there: one tab in a browser is the
       * ordinary case, and it was putting every pointer frame it received onto
       * the channel for nobody to read.
       */
      if (to === clientId && !anyFollower()) return;
      try {
        channel.postMessage({ t: 'frame', to, e: event, d: data });
      } catch {
        /* a channel that closed under us */
      }
    };

    const announceLine = () => {
      if (!channel || !leader || !connectionRef.current) return;
      try {
        // §60: `user` is who this line belongs to. A follower whose account has
        // changed under it (a logout and a login in one profile) must not ride a
        // line opened by the previous one, and cannot tell without this.
        channel.postMessage({
          t: 'line',
          connection: connectionRef.current,
          leader: clientId,
          user: userIdRef.current,
        });
      } catch {
        /* ignore */
      }
    };

    /** §60: "who is looking?" — asked by a tab that has just taken the lock. */
    const askWhoIsLooking = () => {
      if (!channel || !leader) return;
      try {
        channel.postMessage({ t: 'who' });
      } catch {
        /* ignore */
      }
    };

    /**
     * `down` is the line failing; `rest` is the browser putting it away because
     * nobody is looking. A follower must be able to tell them apart, or a tab
     * brought back to the front reads "geen verbinding" over a line that is
     * simply on its way up again.
     */
    const announceDown = (what: 'down' | 'rest' = 'down') => {
      if (!channel || !leader) return;
      try {
        channel.postMessage({ t: what });
      } catch {
        /* ignore */
      }
    };

    const onChannelMessage = (event: MessageEvent) => {
      const message = event.data as {
        t?: string;
        to?: string;
        e?: string;
        d?: unknown;
        connection?: string;
        leader?: string;
        user?: string;
        c?: string;
        visible?: boolean;
      };
      if (!message?.t) return;
      /*
       * §60: "somebody is looking" is everybody's business, not the leader's.
       *
       * Kept by every tab, leader or not, so that whichever one takes the lock
       * next starts from a real set rather than from itself alone.
       */
      if (message.t === 'seen' && message.c && message.c !== clientId) {
        if (message.visible) seenTabs.set(message.c, Date.now());
        else seenTabs.delete(message.c);
        followers.set(message.c, Date.now());
        if (leader) reconsiderRest();
        return;
      }
      if (leader) {
        // A tab asking whether there is a line yet. Only the socket's holder can say.
        if (message.t === 'ask') {
          if (message.c) followers.set(message.c, Date.now());
          announceLine();
        }
        return;
      }
      // §60: a new leader wants to know who is being looked at. Everybody answers.
      if (message.t === 'who') {
        sayVisible();
        return;
      }
      if (message.t === 'line' && message.connection && message.leader) {
        // §60: and never a line belonging to another account. Both halves have
        // to know who they are before this can mean anything.
        if (message.user && userIdRef.current && message.user !== userIdRef.current) return;
        carriedByRef.current = message.leader;
        lineIsUp(message.connection);
        // The leader may be a new one, and a new one knows nothing about this
        // tab yet — including whether anybody is looking at it.
        sayVisible();
        return;
      }
      if (message.t === 'down' || message.t === 'rest') {
        connectionRef.current = null;
        setPeople([]);
        setStatus(message.t === 'rest' ? 'idle' : 'offline');
        return;
      }
      if (message.t === 'frame' && message.to === clientId && message.e) take(message.e, message.d);
    };

    const sayVisible = () => {
      const visible = typeof document === 'undefined' || document.visibilityState === 'visible';
      if (!leader && channel) {
        try {
          channel.postMessage({ t: 'seen', c: clientId, visible });
        } catch {
          /* ignore */
        }
      }
      if (visible) seenTabs.set(clientId, Date.now());
      else seenTabs.delete(clientId);
      reconsiderRest();
    };

    /* --------------------------------------------- the tab nobody looks at */

    /**
     * §60: a socket is given back when nobody in this browser is looking.
     *
     * A hidden tab is not watching anything, and six of them wedge every
     * navigation over HTTP/1.1. The line comes back on the first glance, and
     * `hello` replays the watch list and fires a `changed` for every key, so
     * nothing is missed by having been away — which is exactly why this is
     * safe and why it is not painted as "geen verbinding".
     */
    const reconsiderRest = () => {
      if (stopped || !leader) return;
      const anyoneLooking = seenTabs.size > 0;
      if (anyoneLooking) {
        if (hiddenTimer) {
          clearTimeout(hiddenTimer);
          hiddenTimer = null;
        }
        quietSince = null;
        if (resting) {
          resting = false;
          failures = 0;
          setStatus('connecting');
          open();
        } else if (!source && !retry) {
          /*
           * §60: the leader with no socket, no rest and nothing armed. A page
           * restored from the bfcache is the way in — `pagehide` closed the
           * stream and nothing failed, so no retry was ever set. Nobody else is
           * going to reopen this: the followers are waiting for a `line` that
           * will never come. `!retry` is load-bearing — a backoff in progress
           * owns the next attempt, and reopening from here would be the hot
           * loop `backoffDelay` exists to prevent.
           */
          failures = 0;
          setStatus('connecting');
          open();
        } else if (connectionRef.current) {
          // Back from the background: the line may have been reaped in
          // silence, and a heartbeat finds out now rather than in twenty
          // seconds.
          void post({});
        }
        return;
      }
      if (resting || hiddenTimer) return;
      quietSince = Date.now();
      const check = () => {
        hiddenTimer = null;
        if (stopped || seenTabs.size || quietSince === null) return;
        /*
         * §60: and never while *this* tab is on screen, whatever the map says.
         * The map is kept by messages, and a message that was missed is exactly
         * the failure this guard is for: a socket given back under somebody's
         * eyes is the one thing resting may never do.
         */
        if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
          sayVisible();
          return;
        }
        if (!shouldCloseHidden(quietSince, Date.now())) {
          // A timer that fired a hair early, or a clock that moved. Ask again
          // rather than letting the socket be held for the life of the tab.
          hiddenTimer = setTimeout(check, 1000);
          return;
        }
        resting = true;
        closeSocket();
        setPeople([]);
        setStatus('idle');
        announceDown('rest');
      };
      hiddenTimer = setTimeout(check, HIDDEN_CLOSE_MS);
    };

    /* ------------------------------------------------------- the election */

    const becomeLeader = () => {
      if (stopped) return;
      leader = true;
      carriedByRef.current = '';
      refusals = 0;
      refusedBy = '';
      // The socket first: `sayVisible` runs `reconsiderRest`, which would
      // otherwise see a leader with no stream and open a second one.
      open();
      sayVisible();
      // §60: a new leader inherits nothing. It asks every other tab whether it
      // is being looked at, and rests only once they have all said no.
      askWhoIsLooking();
    };

    /**
     * §60: the election, in one place, because it is run more than once now —
     * at mount, after a `pageshow` that brought this page back from the
     * bfcache, and (with `steal`) when the leader a follower is riding has
     * stopped answering.
     */
    const elect = (steal = false) => {
      if (stopped || leader) return;
      if (!(ONE_LINE_PER_BROWSER && hasOneLineSupport())) {
        becomeLeader();
        return;
      }
      if (electing && !steal) return;
      // Somebody may already hold the line; ask before the lock is granted.
      try {
        channel?.postMessage({ t: 'ask', c: clientId });
      } catch {
        /* ignore */
      }
      electing = true;
      void navigator.locks
        // `steal` is the last resort and is spent sparingly: only after two
        // refusals in a row from one leader. It breaks that leader's hold, which
        // is exactly right when the hold is the problem.
        .request(LINE_LOCK, steal ? { steal: true } : { mode: 'exclusive' }, () => {
          electing = false;
          if (stopped) return Promise.resolve();
          becomeLeader();
          // Held until this tab goes: the resolve is the release, so the next
          // tab in the queue becomes leader the moment this one closes.
          return new Promise<void>((resolve) => {
            releaseLock = resolve;
          });
        })
        .catch(() => {
          electing = false;
          // No lock to be had (a private mode quirk): fall back to a line of
          // this tab's own rather than sitting in the dark.
          if (!stopped && !leader) becomeLeader();
        });
      // A tab that never gets the lock and never hears a leader has nothing.
      // After a grace period it opens its own line: one extra socket beats a
      // dead tab.
      if (retry) clearTimeout(retry);
      retry = setTimeout(() => {
        retry = null;
        if (!stopped && !leader && !connectionRef.current) becomeLeader();
      }, 8000);
    };

    reconnectRef.current = (from?: string) => {
      if (stopped) return;
      // §60: never reset to zero — see `backoffDelay`. A reconnect asked for by
      // hand (the onderzoeker sheet) starts from one, which is still half a
      // second, and a storm of 409s keeps climbing.
      failures = Math.min(failures, 1);
      if (leader) {
        open();
        return;
      }
      if (from !== undefined) {
        if (from && from === refusedBy) refusals += 1;
        else {
          refusedBy = from;
          refusals = 1;
        }
      }
      connectionRef.current = null;
      /*
       * §60: twice refused through the same leader is a leader that cannot
       * carry this tab at all — its socket belongs to another account (a logout
       * and a login in one profile leave the old tab holding the lock) or to a
       * connection the server has forgotten. Asking it again gets the same
       * answer, and the eight-second fallback only ever fires once, at mount. So
       * this tab takes the lock off it.
       */
      if (refusals >= 2) {
        refusals = 0;
        refusedBy = '';
        elect(true);
        return;
      }
      if (channel) {
        try {
          channel.postMessage({ t: 'ask', c: clientId });
        } catch {
          /* ignore */
        }
      }
    };
    // §18b: the sheet above this provider reopens the line through here, so
    // that the name on everyone else's presence strip follows the answer.
    reopenLine = () => reconnectRef.current();

    if (ONE_LINE_PER_BROWSER && hasOneLineSupport()) {
      channel = new BroadcastChannel(LINE_CHANNEL);
      channel.addEventListener('message', onChannelMessage);
      elect();
    } else {
      becomeLeader();
    }

    const heartbeat = setInterval(() => {
      if (connectionRef.current) void post({});
    }, HEARTBEAT_MS);

    const onVisible = () => sayVisible();
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    sayVisible();

    // A closing tab says goodbye cleanly rather than waiting to be reaped: the
    // socket is closed here, and the last POST may use the unload quota.
    const onPageHide = () => {
      away = true;
      unloadingRef.current = true;
      if (placeRef.current) void post({ place: null });
      closeSocket();
      /*
       * §60: the lock goes back, so the leadership must go with it.
       *
       * A page that is put in the bfcache is not closed — this very closure
       * comes back to life on `pageshow`. It used to come back saying
       * `leader === true` with no lock, no socket and nothing armed to open
       * one: `onChannelMessage` ignores every `{t:'line'}` while `leader` is
       * true, so the restored page sat there for ever, live in its own opinion
       * and deaf in fact.
       */
      leader = false;
      carriedByRef.current = '';
      releaseLock?.();
      releaseLock = null;
    };
    window.addEventListener('pagehide', onPageHide);

    /**
     * §60: and back again. `persisted` is not asked: a page that was hidden and
     * shown without going through the cache has still had its socket closed by
     * the handler above, so both roads need the same repair — run the election
     * again, from a tab that is now certainly not the leader.
     */
    const onPageShow = () => {
      if (stopped || !away) return;
      away = false;
      unloadingRef.current = false;
      resting = false;
      failures = 0;
      connectionRef.current = null;
      setStatus('connecting');
      sayVisible();
      elect();
    };
    window.addEventListener('pageshow', onPageShow);

    return () => {
      stopped = true;
      clearInterval(heartbeat);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
      window.removeEventListener('pagehide', onPageHide);
      window.removeEventListener('pageshow', onPageShow);
      if (hiddenTimer) clearTimeout(hiddenTimer);
      closeSocket();
      releaseLock?.();
      releaseLock = null;
      if (channel) {
        channel.removeEventListener('message', onChannelMessage);
        channel.close();
        channel = null;
      }
      if (postTimer.current) {
        clearTimeout(postTimer.current);
        postTimer.current = null;
      }
      connectionRef.current = null;
      carriedByRef.current = '';
    };
    // `pushFrame` is a stable callback declared below; the rest are the same
    // three the effect has always had.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId, post, sayEverything]);

  /* ------------------------------------------------------------ pointers */

  useEffect(() => {
    const sweep = setInterval(() => {
      setPointerMap((current) => {
        const cutoff = Date.now() - POINTER_TTL_MS;
        let changed = false;
        const next = new Map(current);
        for (const [id, pointer] of next) {
          if (pointer.at < cutoff || (pointer.x === null && !pointer.s)) {
            next.delete(id);
            changed = true;
          }
        }
        return changed ? next : current;
      });
    }, 2000);
    return () => clearInterval(sweep);
  }, []);

  /**
   * §60: frames are stirred, not stamped.
   *
   * Four hands moving at twelve frames a second each is fifty `setState` calls
   * a second, and React renders every one of them. Incoming frames go into a
   * buffer and are published on the next animation frame, so the screen is
   * redrawn at the rate the screen redraws at and no faster — and a browser
   * that is not painting (a hidden tab) does not render them at all.
   */
  const frameBuffer = useRef<Map<string, LivePointer>>(new Map());
  const frameRaf = useRef<number | null>(null);
  const drainFrames = useCallback(() => {
    frameRaf.current = null;
    const buffered = frameBuffer.current;
    if (!buffered.size) return;
    frameBuffer.current = new Map();
    setPointerMap((current) => {
      let changed = false;
      const next = new Map(current);
      for (const [id, pointer] of buffered) {
        /*
         * §60: a hand that has left the page, carrying nothing and dragging no
         * box, is *removed* rather than remembered as an empty one. Keeping it
         * made a new map, a new `pointers` array and a new `useLive()` value on
         * every such frame — and a consumer with an effect on `live` then ran
         * its cleanup, which on the tijdlijn is "my own hand has left", which
         * is another empty frame for the other tab. The two of them cancelled
         * three quarters of a drag between them.
         */
        const empty = pointer.x === null && !pointer.s && !Object.keys(pointer.m).length;
        if (empty) {
          if (next.delete(id)) changed = true;
          continue;
        }
        if (!samePointer(next.get(id), pointer)) changed = true;
        next.set(id, pointer);
      }
      return changed ? next : current;
    });
  }, []);
  const pushFrame = useCallback(
    (pointer: LivePointer) => {
      frameBuffer.current.set(pointer.clientId, pointer);
      if (frameRaf.current !== null) return;
      frameRaf.current =
        typeof requestAnimationFrame === 'function'
          ? requestAnimationFrame(drainFrames)
          : (setTimeout(drainFrames, 16) as unknown as number);
    },
    [drainFrames],
  );
  useEffect(
    () => () => {
      if (frameRaf.current !== null && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(frameRaf.current);
      frameRaf.current = null;
    },
    [],
  );

  const lastFrame = useRef(0);
  const frameTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const nextFrame = useRef<PointerFrame | null>(null);
  /** How many other people are standing where this tab stands. Read without re-rendering. */
  const peopleCount = useRef(0);
  peopleCount.current = people.length;
  const reportPointer = useCallback(
    (frame: PointerFrame | null) => {
      if (!placeRef.current) return;
      /*
       * §60: nobody to see it, nobody to tell. A person alone on a page used
       * to post a frame twelve times a second for ever — every one of them a
       * request, a JSON parse and a hub walk, to fan out to nought people.
       */
      if (!peopleCount.current) {
        nextFrame.current = null;
        return;
      }
      nextFrame.current = frame ?? { x: null, y: null, m: {}, s: null };
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

  /** §33: a stroke's frames ride the same POST as everything else; the hook that draws batches them. */
  const reportInk = useCallback(
    (frames: InkFrame[]) => {
      if (!placeRef.current || !frames.length) return;
      void post({ ink: frames });
    },
    [post],
  );

  const onInk = useCallback((callback: (clientId: string, frames: InkFrame[]) => void) => {
    inkListeners.current.add(callback);
    return () => {
      inkListeners.current.delete(callback);
    };
  }, []);

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

  const onChanged = useCallback((callback: (keys: string[], info: ChangeInfo) => void) => {
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

  /*
   * A frame carries only a client id; the name and the ink come from the
   * roster, whichever of the two arrived first. A hand whose owner is not on
   * the roster (yet, or any more) is not drawn.
   *
   * §60: the lookup is a map rather than a `find` per frame — with six people
   * on a wall that was thirty-six comparisons a frame, twelve times a second,
   * for a list that changes about once a minute.
   */
  const peopleById = useMemo(() => {
    const map = new Map<string, PublicPerson>();
    for (const person of people) map.set(person.clientId, person);
    return map;
  }, [people]);

  /**
   * §60: the same list is the same array.
   *
   * `useLive()` hands back a new object whenever this changes, and consumers
   * hang effects on it — so a recomputation that produces an identical list is
   * not free, it is a re-run of everything downstream. A frame that draws
   * nothing (a hand that has left, arriving as `x: null`) used to do exactly
   * that: a new `pointerMap`, a new empty array, a new `live`, and on the
   * tijdlijn a cleanup that told the server this tab's own hand had gone. Two
   * tabs doing it to each other cancelled three quarters of a drag's frames.
   */
  const lastPointers = useRef<LivePointer[]>(NO_POINTERS);
  const pointers = useMemo(() => {
    const out: LivePointer[] = [];
    for (const pointer of pointerMap.values()) {
      const person = peopleById.get(pointer.clientId);
      if (!person) continue;
      // A hand with neither a position nor a box is not on the wall at all;
      // one dragging a box open with the cursor off the edge still is.
      if ((pointer.x === null || pointer.y === null) && !pointer.s) continue;
      out.push({ ...pointer, name: person.name, colour: person.colour });
    }
    out.sort((a, b) => b.at - a.at);
    const before = lastPointers.current;
    if (before.length === out.length && out.every((hand, i) => samePointer(before[i], hand))) return before;
    lastPointers.current = out;
    return out;
  }, [pointerMap, peopleById]);

  /**
   * §60: everything but the hands, and its identity holds still while they
   * move. This is the value nearly every consumer actually wants.
   */
  const base = useMemo<LiveBase>(
    () => ({
      clientId,
      status,
      watch,
      onChanged,
      setAlias,
      setPlace,
      setHolding,
      reportPointer,
      reportInk,
      onInk,
      people,
      joinRoom,
      setStripHidden,
      stripHidden,
      ownWriteAt,
    }),
    [clientId, status, watch, onChanged, setAlias, setPlace, setHolding, reportPointer, reportInk, onInk, people, joinRoom, stripHidden, ownWriteAt],
  );

  return (
    <LiveBaseContext.Provider value={base}>
      <LivePointerContext.Provider value={pointers}>{children}</LivePointerContext.Provider>
    </LiveBaseContext.Provider>
  );
}

/**
 * Watch some keys and be called when they move. The everyday hook for a client
 * component that keeps its own copy of a record: "when entry:abc changes,
 * fetch it again".
 */
export function useLiveChanges(keys: string[], onChange: (keys: string[], info?: ChangeInfo) => void) {
  // §60: the base context, never the merged one — this hook draws no hands, and
  // subscribing to the pointer context would re-run every consumer twelve times
  // a second for a list of keys that moves about once a minute.
  const live = useContext(LiveBaseContext);
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
    const off = onChanged((changed, info) => {
      const hit = changed.filter((key) => list.includes(key));
      if (hit.length) onChangeRef.current(hit, info);
    });
    return () => {
      unwatch();
      off();
    };
  }, [watch, onChanged, joined]);
}
