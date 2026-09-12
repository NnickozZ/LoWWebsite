import { NextResponse } from 'next/server';
import { getSessionUser, SIDE_COOKIE } from '@/lib/auth/session';

export const dynamic = 'force-dynamic';

/**
 * §46: turning the archive over.
 *
 * §57: **one** road to one cookie. `GET ?side=…&to=…` sets the side and goes
 * somewhere with it — a redirect with a *relative* Location, for the reason
 * `as-player/route.ts` spells out (the request URL a handler sees is the
 * server's address, not the browser's, and a cookie set on one origin is not
 * sent to the other).
 *
 * There used to be a second, quiet road: `POST {side}`, which the toggle used
 * to write the cookie without going anywhere, and then navigated on the client
 * itself. That is the bug §57 closes — a client navigation re-renders the page
 * and reuses the shared layout, so the cookie said one side and the shell said
 * the other, right down to §48's born-on-a-side. The POST is gone with it:
 * every crossing is now a document load through here (`components/keeper/flipRoad.ts`).
 *
 * §50: the GET road is now also how a *record page* corrects the cookie. Until
 * this round a page that disagreed with the browser told it so afterwards with
 * the POST and a `router.refresh()`; that left one frame in which the shell and
 * the page stood on different sides, and every picker on screen had been built
 * for the side the person had just left. `sideDetour()` sends them through here
 * instead, before anything renders, and `gewisseld=1` rides back out so the
 * page can say what happened.
 *
 * It grants nothing. The cookie is read by `getSessionUser` and honoured
 * only for a Keeper who is not looking as a player; a player's browser can
 * carry it and be none the wiser.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const side = url.searchParams.get('side');
  // §50: `gewisseld=1` rides along to the destination so the page that landed
  // us here can say so in a toast. It is added to a path `safePath` has already
  // vetted, never taken from `to` itself, so it cannot widen the redirect.
  // §57: and `zondertweeling=1` beside it, when the toggle sent us to a list
  // because the page had no other face. Both are flags, not addresses: they
  // are read as booleans here and written out again by hand.
  const back = withSwitched(
    safePath(url.searchParams.get('to')),
    url.searchParams.get('gewisseld') === '1',
    url.searchParams.get('zondertweeling') === '1',
  );
  const response = new NextResponse(null, { status: 303, headers: { Location: back } });
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
 * §50/§57: hang `gewisseld=1` — and, when there was no tweeling to go to,
 * `zondertweeling=1` — on a path that is already known to be ours.
 *
 * Parsed against a throwaway origin so a fragment and an existing query are
 * kept in the right order, and only the path, search and hash of the result are
 * ever used — the origin cannot escape into the Location header.
 */
function withSwitched(path: string, switched: boolean, twinless: boolean): string {
  if (!switched) return path;
  const target = new URL(path, 'https://archief.invalid');
  target.searchParams.set('gewisseld', '1');
  if (twinless) target.searchParams.set('zondertweeling', '1');
  return `${target.pathname}${target.search}${target.hash}`;
}
