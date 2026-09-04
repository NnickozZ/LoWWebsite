import { requireUser } from '@/lib/auth/session';
import { apiError, json } from '@/lib/api';
import { getBoard } from '@/lib/boards/service';
import {
  clearPresence,
  publishPresence,
  setPresence,
  subscribe,
  type LiveEvent,
} from '@/lib/boards/live';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** Long enough to be quiet, short enough that no proxy calls it idle. */
const HEARTBEAT_MS = 20_000;

/**
 * The open line to a board (§8, live).
 *
 * Server-sent events rather than a WebSocket, for one plain reason: SSE is a
 * `Response` with a stream in it, so it works inside an App Router route
 * handler behind the same session cookie and the same `getBoard` check as every
 * other read. A socket would need a custom Node server, which would mean a new
 * Dockerfile, a new dev script, and a second thing to authenticate. One
 * direction is all this needs — the client writes over ordinary POSTs.
 *
 * Nothing about the board's *contents* goes down this pipe. See `lib/boards/live.ts`
 * for why: cards are resolved per viewer, so the signal is "it moved" and the
 * client asks for its own copy.
 */
export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await ctx.params;
    // Exactly the check every other board read makes; a player who cannot open
    // the board cannot listen to it either, nor learn who is standing at it.
    if (!getBoard(id, user)) return json({ error: 'Prikbord niet gevonden.' }, { status: 404 });

    const url = new URL(request.url);
    const clientId = (url.searchParams.get('c') ?? '').slice(0, 40);
    if (!clientId) return json({ error: 'Geen client-id.' }, { status: 400 });

    const encoder = new TextEncoder();
    let heartbeat: ReturnType<typeof setInterval> | null = null;
    let unsubscribe: (() => void) | null = null;
    let closed = false;

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        const write = (chunk: string) => {
          if (closed) return;
          controller.enqueue(encoder.encode(chunk));
        };
        const send = (message: LiveEvent) => {
          write(`event: ${message.event}\ndata: ${JSON.stringify(message.data)}\n\n`);
        };

        const stop = () => {
          if (closed) return;
          closed = true;
          if (heartbeat) clearInterval(heartbeat);
          unsubscribe?.();
          clearPresence(id, clientId);
          // The people still on the wall need to watch this one leave.
          publishPresence(id);
          try {
            controller.close();
          } catch {
            /* already closed by the runtime */
          }
        };

        unsubscribe = subscribe(id, { clientId, send });

        // Arriving is itself a presence event, so a tab that opens the board
        // and touches nothing still shows up for everyone else.
        setPresence(id, { clientId, userId: user.id, name: user.username, holding: [] });

        // A retry hint and one comment first: some proxies will not flush a
        // response until they have seen a few bytes.
        write(`retry: 3000\n: open\n\n`);
        // This tab is subscribed already, so the broadcast is its own first
        // roster too; sending one directly as well delivered the same frame twice.
        publishPresence(id);

        heartbeat = setInterval(() => {
          // A comment line keeps the connection warm without waking the client's
          // event handlers, and refreshes this tab's place in the roster.
          //
          // Wrapped because this runs in a timer. If the runtime tore the stream
          // down without the abort reaching us, `enqueue` throws — and an
          // exception raised inside `setInterval` has nowhere to go but up,
          // taking the process and every other open board with it.
          try {
            write(`: ping\n\n`);
            setPresence(id, { clientId, userId: user.id, name: user.username });
          } catch {
            stop();
          }
        }, HEARTBEAT_MS);

        request.signal.addEventListener('abort', stop);
      },
      cancel() {
        closed = true;
        if (heartbeat) clearInterval(heartbeat);
        unsubscribe?.();
        clearPresence(id, clientId);
        publishPresence(id);
      },
    });

    return new Response(stream, {
      headers: {
        'content-type': 'text/event-stream; charset=utf-8',
        'cache-control': 'no-cache, no-store, no-transform',
        connection: 'keep-alive',
        // Caddy and nginx both buffer by default, which would hold every event
        // until the response ended — which, for a stream, is never.
        'x-accel-buffering': 'no',
      },
    });
  } catch (err) {
    return apiError(err);
  }
}

/**
 * The client's half of the line: "I am still here, and these are the cards I am
 * holding." Throttled by the client to a few a second while dragging, which at
 * forty players and one container is nothing.
 */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await ctx.params;
    if (!getBoard(id, user)) return json({ error: 'Prikbord niet gevonden.' }, { status: 404 });

    const body = (await request.json()) as {
      clientId?: string;
      holding?: unknown;
      leaving?: boolean;
    };
    const clientId = String(body.clientId ?? '').slice(0, 40);
    if (!clientId) return json({ error: 'Geen client-id.' }, { status: 400 });

    if (body.leaving) {
      clearPresence(id, clientId);
      publishPresence(id);
    } else {
      const { changed } = setPresence(id, {
        clientId,
        userId: user.id,
        name: user.username,
        holding: body.holding,
      });
      // A heartbeat that says nothing new must not send the whole roster to
      // everyone: ten people on a wall would be a hundred frames a minute, each
      // saying exactly what the last hundred said.
      if (changed) publishPresence(id);
    }
    return json({ ok: true });
  } catch (err) {
    return apiError(err);
  }
}
