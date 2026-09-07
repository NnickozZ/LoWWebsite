import { NextResponse } from 'next/server';
import { getSessionUser, SIDE_COOKIE } from '@/lib/auth/session';
import { isSide } from '@/lib/keeper/kinds';

export const dynamic = 'force-dynamic';

/**
 * §46: turning the archive over.
 *
 * Two roads to one cookie. `GET ?side=…&to=…` is the toggle and the keyboard
 * shortcut: set the side, and go somewhere with it — a redirect with a
 * *relative* Location, for the reason `as-player/route.ts` spells out (the
 * request URL a handler sees is the server's address, not the browser's, and
 * a cookie set on one origin is not sent to the other). `POST {side}` is the
 * quiet road: a record page that finds the browser standing on the other side
 * from the record it is showing tells the cookie so, without going anywhere,
 * so that the *next* list the person opens is the side they are on.
 *
 * Neither grants a thing. The cookie is read by `getSessionUser` and honoured
 * only for a Keeper who is not looking as a player; a player's browser can
 * carry it and be none the wiser.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const side = url.searchParams.get('side');
  const back = safePath(url.searchParams.get('to'));
  const response = new NextResponse(null, { status: 303, headers: { Location: back } });
  await write(response, side);
  return response;
}

export async function POST(request: Request) {
  let side: unknown = null;
  try {
    side = ((await request.json()) as { side?: unknown }).side;
  } catch {
    side = null;
  }
  const response = NextResponse.json({ ok: true, side: isSide(side) ? side : 'player' });
  await write(response, side);
  return response;
}

async function write(response: NextResponse, side: unknown) {
  const user = await getSessionUser();
  if (side === 'keeper' && user?.isRealKeeper && !user.asPlayer) {
    response.cookies.set(SIDE_COOKIE, 'keeper', { httpOnly: true, sameSite: 'lax', path: '/' });
  } else {
    response.cookies.delete(SIDE_COOKIE);
  }
}

/** Only ever back into this archive: one leading slash, and no scheme sneaking in. */
function safePath(value: string | null): string {
  if (!value || !value.startsWith('/') || value.startsWith('//')) return '/';
  return value;
}
