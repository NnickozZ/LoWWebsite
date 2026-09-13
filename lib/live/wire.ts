/**
 * §60: één lijn per tab, en een lijn die nooit opgeeft.
 *
 * The decisions a live line has to make, pulled out of the React provider so
 * they can be read and tested on their own: how long to wait before trying
 * again, which POST may use the browser's unload quota, how big a batch of
 * keystrokes may be before it is cut in two, and how long a hidden tab keeps
 * a socket it is not looking at.
 *
 * Nothing here imports anything. It is the same file in the browser and in a
 * test, and it is the reason `LiveProvider.tsx` has no numbers of its own.
 */

/* ------------------------------------------------------------- backoff */

/** Never faster than this, however sure we are the server is back. */
export const RECONNECT_FLOOR_MS = 500;
/** And never slower than this, however long it has been down. */
export const RECONNECT_CEILING_MS = 30_000;

/**
 * How long to wait before opening the line again, after `failures` failures.
 *
 * Two things this must do, and one it must never do. It must start quickly — a
 * dropped socket on a working server is back in half a second — and it must
 * end up slow, so a hundred tabs against a server that is down are not a
 * denial of service. And it must **never return 0**: the 409 road (the server
 * forgot this tab) used to reset the counter to zero, so a server stuck behind
 * two processes handed every tab a hot loop of reconnects, which is how one
 * misconfiguration takes the whole archive with it.
 *
 * The jitter is ±25 %, so ten tabs that dropped together do not come back
 * together.
 */
export function backoffDelay(failures: number, random: () => number = Math.random): number {
  const steps = Math.max(0, Math.min(12, Math.floor(failures)));
  const base = Math.min(RECONNECT_CEILING_MS, RECONNECT_FLOOR_MS * 2 ** steps);
  const spread = base * 0.25;
  const delay = base - spread + random() * spread * 2;
  return Math.max(RECONNECT_FLOOR_MS, Math.min(RECONNECT_CEILING_MS, Math.round(delay)));
}

/* ----------------------------------------------------------- keepalive */

/**
 * `keepalive` lets a request outlive the page that made it, which is exactly
 * what a goodbye needs — and the quota for it is **64 KiB per origin**, shared
 * by every request in flight. A body over this size is not worth a slice of
 * that quota, and a Tiptap paste is far over it: `fetch` then rejects with a
 * TypeError, the batch goes back on the queue, and the retry sends the same
 * oversized body for ever. So only the small, must-arrive bodies ask for it.
 */
export const KEEPALIVE_MAX_BYTES = 4_000;

/**
 * May this POST use the unload quota? Only a body that is both *small* and
 * *about leaving* — a goodbye, a heartbeat, an empty keep-the-line-warm — and
 * never one carrying keystrokes.
 */
export function shouldKeepalive(input: { bytes: number; unloading?: boolean; hasUpdates?: boolean }): boolean {
  if (input.hasUpdates) return false;
  if (input.bytes > KEEPALIVE_MAX_BYTES) return false;
  return Boolean(input.unloading);
}

/* ------------------------------------------------------ batch splitting */

/**
 * One POST of keystrokes may be this big. Well under any proxy's body limit,
 * and small enough that a failed one is cheap to send again.
 */
export const UPDATE_BATCH_MAX_BYTES = 256_000;

/**
 * Cut a list of room updates into POST-sized batches, in order.
 *
 * A single update larger than the cap still goes out alone — Yjs updates are
 * not divisible, and refusing one would lose a paste. Everything else is
 * packed greedily, so the common case is one request.
 */
export function splitUpdates<T extends { u: string }>(items: T[], maxBytes = UPDATE_BATCH_MAX_BYTES): T[][] {
  const out: T[][] = [];
  let batch: T[] = [];
  let size = 0;
  for (const item of items) {
    const bytes = item.u.length;
    if (batch.length && size + bytes > maxBytes) {
      out.push(batch);
      batch = [];
      size = 0;
    }
    batch.push(item);
    size += bytes;
  }
  if (batch.length) out.push(batch);
  return out;
}

/* ------------------------------------------------------- the hidden tab */

/**
 * A tab nobody has looked at for this long gives its socket back.
 *
 * Over HTTP/1.1 a browser allows about six connections per origin, and a
 * person playing with the archive open in eight tabs had eight of them held
 * open for ever — so the ninth navigation, and every navigation after it,
 * waited for a socket that was never coming. A hidden tab is not watching
 * anything; when it comes back, `hello` replays the watch list and fires a
 * `changed` for every watched key, so nothing is missed by having been away.
 *
 * Long enough that flicking between two tabs never closes anything.
 */
export const HIDDEN_CLOSE_MS = 45_000;

/** Pointer frames go up at most this often (§60: was 60 ms, and it re-rendered the world). */
export const POINTER_THROTTLE_MS = 80;

/**
 * Should a hidden tab close its line now?
 *
 * `hiddenSince` is when the *last* thing that wants the line went away — for a
 * leader tab that is the last moment any tab in the browser was visible, not
 * merely its own.
 */
export function shouldCloseHidden(hiddenSince: number | null, now: number, after = HIDDEN_CLOSE_MS): boolean {
  if (hiddenSince === null) return false;
  return now - hiddenSince >= after;
}

/* ------------------------------------------------------ SSE backpressure */

/** Frames that may be dropped when a client cannot keep up. Everything else must arrive. */
const DROPPABLE = new Set(['pointer', 'ink', 'presence']);

/** A connection whose buffer has been full for this long is closed rather than grown. */
export const SATURATED_CLOSE_MS = 15_000;

/**
 * §60: how many unread frames a stream may hold before it counts as behind.
 *
 * A `ReadableStream` built with no strategy at all gets a `CountQueuingStrategy`
 * with a high water mark of **one**, so `desiredSize` is 0 the moment a single
 * chunk has been enqueued and not yet read — which happens whenever two frames
 * are written in one tick, which on a busy wall is most of them. Every pointer,
 * ink and presence frame after the first was then thrown away, and the
 * fifteen-second close was measured against a queue that was never really full.
 *
 * Sixty-four is a couple of seconds of a busy wall: room enough that an ordinary
 * burst is simply buffered, small enough that a reader which has genuinely
 * stopped is noticed long before the process grows.
 */
export const SSE_HIGH_WATER_MARK = 64;

/**
 * §60: the name of the frame that is really being sent.
 *
 * A frame for a *carried* tab travels wrapped in a `via` (see `lib/live/hub.ts`),
 * and the wrapper is not a kind of thing: it is an envelope. Asked about the
 * envelope, the policy below said "always write" — so the one socket carrying
 * eight tabs, which is by definition the busiest there is, never dropped a
 * pointer frame in its life. Unwrap first, and a carried hand is as droppable as
 * an uncarried one.
 */
export function frameKind(event: string, data?: unknown): string {
  if (event !== 'via') return event;
  const inner = (data as { e?: unknown } | null | undefined)?.e;
  return typeof inner === 'string' ? inner : event;
}

/**
 * What to do with one frame for a client whose stream is already backed up.
 *
 * `desiredSize <= 0` means the browser is not reading as fast as we are
 * writing — under `SSE_HIGH_WATER_MARK`, that is sixty-four frames it has not
 * taken. Sight — a hand, a pen, a roster — is only interesting *now*, so it
 * is dropped; a `changed`, a `hello`, a `sync`, an `update` or a `saved` is a
 * fact and is always written, because dropping one leaves a screen wrong for
 * ever. Pure, so the policy is the test — pass the frame's real name through
 * `frameKind` first.
 */
export function shouldDropFrame(event: string, desiredSize: number | null): boolean {
  if (desiredSize === null) return false;
  if (desiredSize > 0) return false;
  return DROPPABLE.has(event);
}
