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
 * quiet road: the toggle writes the cookie first and then animates, without
 * going anywhere.
 *
 * §50: the GET road is now also how a *record page* corrects the cookie. Until
 * this round a page that disagreed with the browser told it so afterwards with
 * the POST and a `router.refresh()`; that left one frame in which the shell and
 * the page stood on different sides, and every picker on screen had been built
 * for the side the person had just left. `sideDetour()` sends them through here
 * instead, before anything renders, and `gewisseld=1` rides back out so the
 * page can say what happened.
 *
 * Neither grants a thing. The cookie is read by `getSessionUser` and honoured
 * only for a Keeper who is not looking as a player; a player's browser can
 * carry it and be none the wiser.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const side = url.searchParams.get('side');
  // §50: `gewisseld=1` rides along to the destination so the page that landed
  // us here can say so in a toast. It is added to a path `safePath` has already
  // vetted, never taken from `to` itself, so it cannot widen the redirect.
  const back = withSwitched(safePath(url.searchParams.get('to')), url.searchParams.get('gewisseld') === '1');
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

/**
 * §50: hang `gewisseld=1` on a path that is already known to be ours.
 *
 * Parsed against a throwaway origin so a fragment and an existing query are
 * kept in the right order, and only the path, search and hash of the result are
 * ever used — the origin cannot escape into the Location header.
 */
function withSwitched(path: string, switched: boolean): string {
  if (!switched) return path;
  const target = new URL(path, 'https://archief.invalid');
  target.searchParams.set('gewisseld', '1');
  return `${target.pathname}${target.search}${target.hash}`;
}
