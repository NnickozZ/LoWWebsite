import { requireUser } from '@/lib/auth/session';
import { apiError, json } from '@/lib/api';
import { applyClientAwareness, applyClientUpdate, join, warm, type RoomEvent } from '@/lib/live/docs';
import { admit } from '@/lib/live/rooms';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const HEARTBEAT_MS = 20_000;

/**
 * §20: the open line into a room of shared text.
 *
 * Same shape as a board's line — server-sent events down, ordinary POSTs up —
 * and for the same reason: it lives in a route handler behind the session
 * cookie, with no second server to run. The first frame is the whole document
 * (`sync`); after that every keystroke anyone makes arrives as an `update`,
 * every cursor as `awareness`, and a change to the rest of the record as
 * `saved`. What goes down the line is a Yjs update, not a resolved page: the
 * room's gate (`lib/live/rooms.ts`) already decided who may be here.
 */
export async function GET(request: Request, ctx: { params: Promise<{ room: string }> }) {
  try {
    const user = await requireUser();
    const { room: rawKey } = await ctx.params;
    const key = decodeURIComponent(rawKey);
    const admission = admit(key, user);
    if (!admission) return json({ error: 'Niet gevonden.' }, { status: 404 });

    const url = new URL(request.url);
    const clientId = (url.searchParams.get('c') ?? '').slice(0, 40);
    if (!clientId) return json({ error: 'Geen client-id.' }, { status: 400 });
    const yRaw = Number(url.searchParams.get('y'));
    const yClient = Number.isFinite(yRaw) && yRaw > 0 ? Math.floor(yRaw) : null;

    const encoder = new TextEncoder();
    let heartbeat: ReturnType<typeof setInterval> | null = null;
    let leave: (() => void) | null = null;
    let closed = false;

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        const write = (chunk: string) => {
          if (closed) return;
          controller.enqueue(encoder.encode(chunk));
        };
        const send = (message: RoomEvent) => {
          write(`event: ${message.event}\ndata: ${JSON.stringify(message.data)}\n\n`);
        };
        const stop = () => {
          if (closed) return;
          closed = true;
          if (heartbeat) clearInterval(heartbeat);
          leave?.();
          try {
            controller.close();
          } catch {
            /* already closed by the runtime */
          }
        };

        write(`retry: 3000\n: open\n\n`);
        leave = join(admission.spec, { clientId, userId: user.id, yClient, send }, admission.canEdit);

        heartbeat = setInterval(() => {
          // See the board's line for why this is wrapped: a throw in a timer
          // takes the process down.
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
        leave?.();
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

/**
 * Keystrokes and cursors, up the line. An update from someone who may only
 * look is refused (403) — the editor on their side is read-only, so this is
 * the belt to that pair of braces. The gate is re-run on every post: it is a
 * couple of indexed reads, and a dial the owner turned a second ago should
 * hold at once.
 */
export async function POST(request: Request, ctx: { params: Promise<{ room: string }> }) {
  try {
    const user = await requireUser();
    const { room: rawKey } = await ctx.params;
    const key = decodeURIComponent(rawKey);
    const body = (await request.json()) as { clientId?: string; update?: string; awareness?: string };
    const clientId = String(body.clientId ?? '').slice(0, 40);
    if (!clientId) return json({ error: 'Geen client-id.' }, { status: 400 });

    const admission = admit(key, user);
    if (!admission) return json({ error: 'Niet gevonden.' }, { status: 404 });

    if (typeof body.update === 'string' && body.update) {
      if (!admission.canEdit) return json({ error: 'Je mag deze tekst alleen lezen.' }, { status: 403 });
      // A room that is not open (the server restarted under a typing tab) is
      // opened here, from the stored state, so the keystroke still lands.
      if (!applyClientUpdate(key, clientId, body.update, user)) {
        warm(admission.spec);
        applyClientUpdate(key, clientId, body.update, user);
      }
    }
    if (typeof body.awareness === 'string' && body.awareness) {
      applyClientAwareness(key, clientId, body.awareness);
    }
    return new Response(null, { status: 204 });
  } catch (err) {
    return apiError(err);
  }
}
