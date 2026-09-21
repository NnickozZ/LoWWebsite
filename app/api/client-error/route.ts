import { getSessionUser } from '@/lib/auth/session';
import { clientIp, rateLimit } from '@/lib/auth/ratelimit';
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
 * It never *answers* with a refusal — one sent by somebody whose session has
 * just broken is exactly the one worth having, and the browser is already
 * having a bad time — so it is always a 204.
 *
 * §89: but it is the one route in the archive that anybody may post to, and it
 * writes to the disk the database lives on. So, before anything is written:
 *   - at most 30 reports per 15 minutes per sender (per address behind a
 *     trusted proxy, otherwise per account or for all signed-out senders
 *     together — see `clientIp`);
 *   - a body over 16 KB is not read at all;
 *   - a report from somebody who is not signed in is only kept when it comes
 *     from the two pages a signed-out browser belongs on;
 *   - every field is capped, and `logEvent` itself stops at 50 MB a day.
 */
const MAX_FIELD = 2000;
const MAX_BODY = 16 * 1024;
const REPORT_LIMIT = { max: 30, windowMs: 15 * 60 * 1000 };

function clip(value: unknown): string | undefined {
  if (typeof value !== 'string' || !value) return undefined;
  return value.slice(0, MAX_FIELD);
}

function fromFrontDoor(url: unknown): boolean {
  if (typeof url !== 'string') return false;
  try {
    const path = new URL(url, 'http://archief.invalid').pathname;
    return path === '/login' || path === '/signup';
  } catch {
    return false;
  }
}

export async function POST(request: Request) {
  const quiet = () => new Response(null, { status: 204 });
  try {
    const declared = Number(request.headers.get('content-length') ?? 0);
    if (Number.isFinite(declared) && declared > MAX_BODY) return quiet();

    let username: string | undefined;
    try {
      username = (await getSessionUser())?.username;
    } catch {
      /* an error report must never depend on the session being readable */
    }

    const ip = clientIp(request.headers);
    const who = ip !== 'direct' ? `ip:${ip}` : username ? `user:${username}` : 'anon';
    if (!rateLimit(`client-error:${who}`, REPORT_LIMIT).ok) return quiet();

    const raw = await request.text();
    if (raw.length > MAX_BODY) return quiet();
    const body = JSON.parse(raw) as Record<string, unknown>;
    if (!username && !fromFrontDoor(body.url)) return quiet();

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
  return quiet();
}

export function GET() {
  return json({ ok: true });
}
