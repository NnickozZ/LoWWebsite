import { getWords } from '@/lib/admin/words';
import { resolveCharacter } from '@/lib/auth/author';
import { requireUser } from '@/lib/auth/session';
import { apiError, json } from '@/lib/api';
import { windowPresenceName } from '@/lib/characters';
import { newId } from '@/lib/ids';
import { applyClientAwareness, applyClientUpdate, join, warm } from '@/lib/live/docs';
import { canWatch } from '@/lib/live/gate';
import {
  carry,
  connect,
  connection as findConnection,
  disconnect,
  forgetRoom,
  leaderConnection,
  publishInk,
  publishPointer,
  rememberRoom,
  roomSender,
  setAlias,
  setPlace,
  setWatches,
  type Connection,
  type SiteEvent,
  type SitePointer,
} from '@/lib/live/hub';
import { frameKind, SATURATED_CLOSE_MS, shouldDropFrame, SSE_HIGH_WATER_MARK } from '@/lib/live/wire';
import { isRoomKey, isWellFormedKey } from '@/lib/live/keys';
import { readInkFrame } from '@/lib/ink/merge';
import type { InkFrame } from '@/lib/ink/types';
import { admit } from '@/lib/live/rooms';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const HEARTBEAT_MS = 20_000;

/**
 * §21: the site line. One per tab, opened by the shell, for everything live.
 *
 * GET is the stream (server-sent events). The first frame is `hello` with the
 * connection id the tab must quote on every POST; after that come `changed`,
 * `presence`, `pointer` and `room` frames as described in `lib/live/hub.ts`.
 *
 * POST is everything that goes up, in one body so a tab can say several
 * things at once (a page change is "new place, new watch list, leave these
 * rooms, join those"):
 *
 *   watch      the keys to watch from now on (replaces the list; gated)
 *   place      where the tab stands, and what it holds (`null` to leave)
 *   cursor     a pointer frame at that place
 *   join       rooms of shared text to enter (`{key, y}`), gated by `admit`
 *   leave      rooms to leave
 *   updates    `[{key, u}]` Yjs updates for joined rooms; one from someone who
 *              may only look is refused and named in the answer's `refused`
 *   awareness  `[{key, a}]` Yjs awareness updates for joined rooms
 *
 * A POST that names a connection the hub does not know answers 409: the server
 * restarted, or the line was reaped. The tab then reopens the stream and says
 * everything again — which is cheap, because it is all idempotent.
 */
export async function GET(request: Request) {
  try {
    const user = await requireUser();
    const url = new URL(request.url);
    const clientId = (url.searchParams.get('c') ?? '').slice(0, 40);
    if (!clientId) return json({ error: 'Geen client-id.' }, { status: 400 });

    const words = getWords();
    /*
     * §21: everything on this line says *who is here* — the strip, the ghost
     * cursors, the carets, the ink. A player is their character; a Keeper is
     * their account name, because the word is the same for all of them.
     *
     * §18b: and "their character" means *this window's*. The line is opened
     * per tab and carries the tab's `X-Character`, so two windows of one
     * account stand on the strip as two investigators — which is exactly what
     * a person playing two onderzoekers at one table needs to see.
     */
    // An `EventSource` cannot set a header, so the stream URL says it instead —
    // resolved by the same check, and only ever a name on a strip.
    const asked = resolveCharacter(user.id, url.searchParams.get('as'));
    const name = windowPresenceName({ ...user, characterId: asked ?? user.characterId }, words.keeper);

    const encoder = new TextEncoder();
    const connectionId = newId();
    let heartbeat: ReturnType<typeof setInterval> | null = null;
    let closed = false;

    /**
     * §60: when the browser stops reading.
     *
     * `controller.enqueue` never blocks and never refuses: a client that has
     * stopped draining — a laptop that went to sleep mid-drag, a phone on a
     * train — simply grows a buffer in this process, and pm2's
     * `max_memory_restart` eventually kills the server for *everyone*. So the
     * stream is asked how much room it has left before every frame.
     *
     * The queue is built with a high water mark of `SSE_HIGH_WATER_MARK` (64)
     * rather than the default of **one**: with a mark of one, `desiredSize` is
     * already 0 after a single unread chunk in the same tick, so two frames in
     * one tick meant the second was "behind" and every hand, pen and roster
     * after the first was thrown away on a wall that was working perfectly.
     * Node does propagate the consumer's backpressure into `desiredSize` — a
     * reader that never reads takes it negative, which is what all of this
     * stands on, and `tests/unit/live-wire.test.ts` pins that down.
     *
     * `desiredSize <= 0` now means sixty-four frames the reader has not taken.
     * Sight is dropped (a hand, a pen, a roster — all of it is only interesting
     * now, and the next one is along in a moment); facts are always written,
     * because a dropped `changed` leaves a screen wrong until something
     * unrelated moves. And a line that has been *continuously* behind for a
     * quarter of a minute is not a slow reader, it is a dead one: it is closed,
     * and the tab reconnects and says everything again. Continuously: every
     * write that leaves the queue with room again — the heartbeat included,
     * which is why the clock is cleared in `write` and not in `send` — puts the
     * clock back to null.
     */
    let saturatedSince: number | null = null;

    const stream = new ReadableStream<Uint8Array>(
      {
        start(controller) {
          const write = (chunk: string) => {
            if (closed) return;
            controller.enqueue(encoder.encode(chunk));
            // §60: the reader caught up, so the fifteen seconds start again from
            // nothing. Every road out goes through here, the ping included.
            const left = typeof controller.desiredSize === 'number' ? controller.desiredSize : null;
            if (left === null || left > 0) saturatedSince = null;
          };
          const send = (message: SiteEvent) => {
            if (closed) return;
            const room = typeof controller.desiredSize === 'number' ? controller.desiredSize : null;
            if (room !== null && room <= 0) {
              const now = Date.now();
              if (saturatedSince === null) saturatedSince = now;
              else if (now - saturatedSince >= SATURATED_CLOSE_MS) {
                stop();
                return;
              }
              // §60: a carried tab's frame is judged on what is *inside* the `via`.
              if (shouldDropFrame(frameKind(message.event, message.data), room)) return;
            }
            write(`event: ${message.event}\ndata: ${JSON.stringify(message.data)}\n\n`);
          };
          const stop = () => {
            if (closed) return;
            closed = true;
            if (heartbeat) clearInterval(heartbeat);
            disconnect(connectionId);
            try {
              controller.close();
            } catch {
              /* already closed by the runtime */
            }
          };

          write(`retry: 3000\n: open\n\n`);
          connect({ id: connectionId, clientId, userId: user.id, name, send });

          heartbeat = setInterval(() => {
            // Wrapped for the same reason as every other live line: a throw in a
            // timer has nowhere to go but up, and up is the whole process.
            try {
              write(`: ping\n\n`);
            } catch {
              stop();
            }
          }, HEARTBEAT_MS);

          request.signal.addEventListener('abort', stop);
        },
        cancel() {
          closed = true;
          if (heartbeat) clearInterval(heartbeat);
          disconnect(connectionId);
        },
      },
      // §60: sixty-four unread frames, not the default one. See `lib/live/wire.ts`.
      new CountQueuingStrategy({ highWaterMark: SSE_HIGH_WATER_MARK }),
    );

    return new Response(stream, {
      headers: {
        'content-type': 'text/event-stream; charset=utf-8',
        'cache-control': 'no-cache, no-store, no-transform',
        connection: 'keep-alive',
        'x-accel-buffering': 'no',
      },
    });
  } catch (err) {
    return apiError(err);
  }
}

type Body = {
  clientId?: string;
  connection?: string;
  watch?: unknown;
  place?: { key?: unknown; holding?: unknown } | null;
  cursor?: { x?: unknown; y?: unknown; m?: unknown; s?: unknown };
  /** §60: the leader tab whose socket carries this one. */
  carriedBy?: unknown;
  /** §18b: the onderzoeker this window writes as — a carried tab has no stream URL to say it on. */
  as?: unknown;
  /** §60: another name this tab answers to (a prikbord canvas's own tab id). */
  alias?: unknown;
  /** §33: frames of a stroke being drawn, in order. */
  ink?: unknown;
  join?: unknown;
  leave?: unknown;
  updates?: unknown;
  awareness?: unknown;
};

/**
 * A pointer frame, checked number by number. `m` is capped: nobody drags forty
 * things. `s` (§60, from the prikbord's old wire) is the selection box a hand
 * is dragging open — exactly four finite numbers or nothing at all, because
 * every one of them is drawn straight into a style attribute on somebody
 * else's screen.
 */
function pointerFrame(clientId: string, raw: Body['cursor']): SitePointer | null {
  if (!raw || typeof raw !== 'object') return null;
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  const x = num(raw.x);
  const y = num(raw.y);
  const m: Record<string, [number, number]> = {};
  if (raw.m && typeof raw.m === 'object') {
    for (const [id, pos] of Object.entries(raw.m as Record<string, unknown>).slice(0, 40)) {
      if (!/^[A-Za-z0-9_-]{1,64}$/.test(id) || !Array.isArray(pos)) continue;
      const px = num(pos[0]);
      const py = num(pos[1]);
      if (px !== null && py !== null) m[id] = [px, py];
    }
  }
  const box = raw.s;
  const s: SitePointer['s'] =
    Array.isArray(box) && box.length === 4 && box.every((n) => num(n) !== null)
      ? [Number(box[0]), Number(box[1]), Number(box[2]), Number(box[3])]
      : null;
  return { c: clientId, x, y, m, s };
}

/*
 * §18b: this line is never gated by `requireAuthor`. Presence, pointers, ink
 * frames and awareness are what a person who may only *look* still gets to do
 * and be seen doing. Typing is refused where it should be: `admit` hands back
 * `canEdit: false` for an authorless player, and the update is named in
 * `refused` like any other.
 */
export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const body = (await request.json()) as Body;
    const clientId = String(body.clientId ?? '').slice(0, 40);
    const connectionId = String(body.connection ?? '').slice(0, 40);
    if (!clientId || !connectionId) return json({ error: 'Geen client-id.' }, { status: 400 });

    /*
     * §60: two ways a POST names its line.
     *
     * The ordinary one: this tab opened the stream, so the connection is its
     * own. The carried one: this tab is a *follower* — it has no socket, and
     * quotes the leader tab's connection id plus `carriedBy`, the leader's
     * clientId. The hub then keeps a line of its own for it (its own watches,
     * its own place, its own name on the strip) whose frames are written down
     * the leader's stream wrapped in a `via`. One socket, as many people as
     * there are tabs.
     */
    const carriedBy = typeof body.carriedBy === 'string' ? body.carriedBy.slice(0, 40) : '';
    let line: Connection | null = null;
    if (carriedBy && carriedBy !== clientId) {
      const leader = leaderConnection(connectionId, carriedBy, user.id);
      if (leader) {
        line = carry({
          leader,
          clientId,
          userId: user.id,
          // §18b: a carried tab has no stream URL to say its onderzoeker on, so
          // it says it here — and only on the POST that first puts it on the
          // roster, which is what the lazy name is for.
          name: () => {
            const asked = resolveCharacter(user.id, typeof body.as === 'string' ? body.as : null);
            return windowPresenceName({ ...user, characterId: asked ?? user.characterId }, getWords().keeper);
          },
        });
      }
    } else {
      line = findConnection(connectionId, clientId, user.id);
    }
    if (!line) return json({ error: 'Lijn onbekend — opnieuw verbinden.' }, { status: 409 });

    // §60: "this line is also that tab". Only ever a name this browser already
    // knows; nothing is granted by it, and a second one replaces the first.
    // A name another tab is already using is refused inside `setAlias` and the
    // answer is the ordinary 204 — claiming somebody else's name is not an
    // error worth telling the claimant about.
    if (typeof body.alias === 'string' && /^[A-Za-z0-9_-]{1,40}$/.test(body.alias)) setAlias(line, body.alias);
    else if (body.alias === null) setAlias(line, null);

    if (Array.isArray(body.watch)) {
      const keys = body.watch.filter(isWellFormedKey).filter((key) => canWatch(key, user));
      setWatches(line, keys);
    }

    if (body.place === null) {
      setPlace(line, null);
    } else if (body.place && typeof body.place === 'object') {
      const key = body.place.key;
      if (isWellFormedKey(key) && canWatch(key, user)) setPlace(line, key, body.place.holding);
      else if (key === null) setPlace(line, null);
    }

    if (body.cursor) {
      const frame = pointerFrame(clientId, body.cursor);
      if (frame) publishPointer(line, frame);
    }

    if (Array.isArray(body.ink)) {
      // Like a pointer frame: let through on the strength of the line, which
      // passed the place's gate when it was opened. Checked number by number.
      const frames = body.ink.slice(0, 40).map(readInkFrame).filter((f): f is InkFrame => f !== null);
      if (frames.length) publishInk(line, frames);
    }

    if (Array.isArray(body.leave)) {
      for (const key of body.leave) if (isWellFormedKey(key)) forgetRoom(line, key);
    }

    if (Array.isArray(body.join)) {
      for (const raw of body.join.slice(0, 40)) {
        const key = raw && typeof raw === 'object' ? (raw as { key?: unknown }).key : null;
        if (!isWellFormedKey(key) || !isRoomKey(key)) continue;
        const yRaw = Number((raw as { y?: unknown }).y);
        const yClient = Number.isFinite(yRaw) && yRaw > 0 ? Math.floor(yRaw) : null;
        const admission = admit(key, user);
        // A room this person may not be in is, to them, not there: nothing is said.
        if (!admission) continue;
        const leave = join(admission.spec, { clientId, userId: user.id, yClient, send: roomSender(line, key) }, admission.canEdit);
        rememberRoom(line, key, leave, yClient);
      }
    }

    const refused: string[] = [];
    if (Array.isArray(body.updates)) {
      for (const raw of body.updates.slice(0, 200)) {
        const item = raw as { key?: unknown; u?: unknown };
        if (typeof item?.key !== 'string' || typeof item.u !== 'string' || !item.u) continue;
        const key = item.key;
        if (!line.rooms.has(key)) {
          refused.push(key);
          continue;
        }
        // The gate is re-run on every keystroke batch: a dial turned a second ago holds at once.
        const admission = admit(key, user);
        if (!admission || !admission.canEdit) {
          refused.push(key);
          continue;
        }
        if (!applyClientUpdate(key, clientId, item.u, user)) {
          // The room is not open (the server restarted under a typing tab): open
          // it from the stored state so the keystroke still lands.
          warm(admission.spec);
          applyClientUpdate(key, clientId, item.u, user);
        }
      }
    }

    if (Array.isArray(body.awareness)) {
      for (const raw of body.awareness.slice(0, 200)) {
        const item = raw as { key?: unknown; a?: unknown };
        if (typeof item?.key !== 'string' || typeof item.a !== 'string' || !item.a) continue;
        if (line.rooms.has(item.key)) applyClientAwareness(item.key, clientId, item.a);
      }
    }

    if (refused.length) return json({ refused });
    return new Response(null, { status: 204 });
  } catch (err) {
    return apiError(err);
  }
}
