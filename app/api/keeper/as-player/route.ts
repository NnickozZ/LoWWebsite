import { NextResponse } from 'next/server';
import { AS_PLAYER_COOKIE, getSessionUser } from '@/lib/auth/session';

export const dynamic = 'force-dynamic';

/**
 * §44: "kijk als speler" on and off.
 *
 * A GET that changes something, deliberately: turning it *on* only ever takes
 * rights away, and turning it *off* has to work from a page a player may not
 * open — which is exactly where a Keeper who forgot the preview was on will be
 * standing. A form post would need the page to render, and while the preview
 * is on, Beheer does not.
 *
 * The cookie is not httpOnly-secret in any interesting way: it grants nothing.
 * `getSessionUser` only honours it for an account that is already a Keeper.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const on = url.searchParams.get('on') === '1';
  const back = safePath(url.searchParams.get('to'));

  const user = await getSessionUser();
  /*
   * The cookie goes on *this* response and not through `cookies()`. A route
   * handler that returns a plain `Response` — which a redirect is — leaves the
   * jar's edits behind: they are attached to the response Next builds for you,
   * and this is not that response. The bug it caused was invisible in the way
   * these bugs are: the redirect worked, the page rendered, and the preview
   * simply never came on.
   */
  /*
   * A *relative* Location, which HTTP allows and which matters here: the
   * request URL a route handler is given carries the address the server is
   * bound to (0.0.0.0, or localhost), not the one the browser typed. Redirect
   * to `new URL(back, url.origin)` and a browser on 127.0.0.1 is sent to
   * localhost — a different origin as far as cookies are concerned, so the
   * cookie set on this very response is not sent with the next request and the
   * preview silently never comes on. Staying relative stays on their origin.
   */
  const response = new NextResponse(null, { status: 303, headers: { Location: back } });
  // Only a Keeper can be looking through a player's eyes; for anybody else the
  // cookie means nothing, so it is simply removed.
  if (on && user?.isRealKeeper) {
    response.cookies.set(AS_PLAYER_COOKIE, '1', { httpOnly: true, sameSite: 'lax', path: '/' });
  } else {
    response.cookies.delete(AS_PLAYER_COOKIE);
  }
  return response;
}

/** Only ever back into this archive: one leading slash, and no scheme sneaking in. */
function safePath(value: string | null): string {
  if (!value || !value.startsWith('/') || value.startsWith('//')) return '/';
  return value;
}
