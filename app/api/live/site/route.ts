import { getWords } from '@/lib/admin/words';
import { requireUser } from '@/lib/auth/session';
import { apiError, json } from '@/lib/api';
import { displayNames } from '@/lib/characters';
import { newId } from '@/lib/ids';
import { applyClientAwareness, applyClientUpdate, join, warm } from '@/lib/live/docs';
import { canWatch } from '@/lib/live/gate';
import {
  connect,
  connection as findConnection,
  disconnect,
  forgetRoom,
  publishPointer,
  rememberRoom,
  roomSender,
  setPlace,
  setWatches,
  type SiteEvent,
  type SitePointer,
} from '@/lib/live/hub';
import { isRoomKey, isWellFormedKey } from '@/lib/live/keys';
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
    const name =
      displayNames([{ id: user.id, username: user.username, isKeeper: user.isKeeper }], words.keeper).get(user.id)?.label ??
      user.username;

    const encoder = new TextEncoder();
    const connectionId = newId();
    let heartbeat: ReturnType<typeof setInterval> | null = null;
    let closed = false;

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        const write = (chunk: string) => {
          if (closed) return;
          controller.enqueue(encoder.encode(chunk));
        };
        const send = (message: SiteEvent) => {
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
    });

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
  cursor?: { x?: unknown; y?: unknown; m?: unknown };
  join?: unknown;
  leave?: unknown;
  updates?: unknown;
  awareness?: unknown;
};

/** A pointer frame, checked number by number. `m` is capped: nobody drags forty things. */
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
  return { c: clientId, x, y, m };
}

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const body = (await request.json()) as Body;
    const clientId = String(body.clientId ?? '').slice(0, 40);
    const connectionId = String(body.connection ?? '').slice(0, 40);
    if (!clientId || !connectionId) return json({ error: 'Geen client-id.' }, { status: 400 });

    const line = findConnection(connectionId, clientId, user.id);
    if (!line) return json({ error: 'Lijn onbekend — opnieuw verbinden.' }, { status: 409 });

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
