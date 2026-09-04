import { getSessionUser } from '@/lib/auth/session';
import { logEvent } from '@/lib/diagnostics';
import { json } from '@/lib/api';

export const dynamic = 'force-dynamic';

/**
 * The browser's half of the log.
 *
 * A client-side exception is invisible from the server, and it does not look
 * like an error to whoever hit it: React stops updating and every button on the
 * page silently does nothing. That has happened here, to one Keeper and not
 * another, and there was no way to tell what differed. This endpoint is how the
 * next one arrives in `data/logs` alongside the server's own errors.
 *
 * It never rejects a report — one sent by somebody whose session has just broken
 * is exactly the one worth having — but it records who sent it where that is
 * known, and caps every field so a loop in a browser cannot fill the disk.
 */
const MAX_FIELD = 2000;

function clip(value: unknown): string | undefined {
  if (typeof value !== 'string' || !value) return undefined;
  return value.slice(0, MAX_FIELD);
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    let username: string | undefined;
    try {
      username = (await getSessionUser())?.username;
    } catch {
      /* an error report must never depend on the session being readable */
    }

    logEvent('error', 'browser error', {
      user: username ?? '(signed out)',
      url: clip(body.url),
      kind: clip(body.kind) ?? 'error',
      message: clip(body.message) ?? '(no message)',
      stack: clip(body.stack),
      componentStack: clip(body.componentStack),
      userAgent: clip(request.headers.get('user-agent') ?? undefined),
    });
  } catch {
    /* a malformed report is not worth a 500 */
  }
  // Always 204: the browser is already having a bad time.
  return new Response(null, { status: 204 });
}

export function GET() {
  return json({ ok: true });
}
