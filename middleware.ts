import { NextResponse, type NextRequest } from 'next/server';

/**
 * §89: the voordeur — the one place every request passes before anything else.
 *
 * Two jobs, and deliberately nothing more:
 *
 *   1. **No session cookie, no archive.** A browser without one is sent to
 *      `/login` (a page) or answered 401 (an API). This only looks at whether
 *      the cookie is *there* — it opens no database, because middleware runs on
 *      every request including prefetches. Whether the cookie is *valid* is the
 *      question `requireViewer` (every page) and `requireUser` (every route)
 *      ask; and a query that somehow runs without either still sees nothing,
 *      because a `null` viewer matches no row (`lib/access.ts`). Three locks on
 *      one door, and the layout is none of them.
 *
 *   2. **A write to `/api` comes from this site.** Route handlers used to lean
 *      on `SameSite=Lax` alone. Server actions already check `Origin` (Next
 *      does); this does the same for the API: `Sec-Fetch-Site` — which a
 *      browser writes and a page cannot — must be `same-origin` (or `none`, a
 *      typed-in address), and where that header is missing an `Origin` must
 *      name this host. A request with neither is not a browser, so there is no
 *      one's cookie to ride on.
 *
 * Open without a cookie: the two doors, the health probe, the browser's error
 * report, and Next's own static files.
 */

const OPEN_PAGES = new Set(['/login', '/signup']);
const OPEN_API = new Set(['/api/health', '/api/client-error']);
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/** Both spellings of the session cookie (`sessionCookieName` in `lib/auth/session.ts`). */
function hasSessionCookie(request: NextRequest): boolean {
  return Boolean(
    request.cookies.get('__Host-zcf_session')?.value || request.cookies.get('zcf_session')?.value,
  );
}

function sameOrigin(request: NextRequest): boolean {
  const site = request.headers.get('sec-fetch-site');
  if (site) return site === 'same-origin' || site === 'none';
  const origin = request.headers.get('origin');
  if (!origin) return true;
  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    return false;
  }
  const hosts = new Set<string>();
  const forwarded = request.headers.get('x-forwarded-host');
  if (forwarded) hosts.add(forwarded.split(',')[0]!.trim());
  const host = request.headers.get('host');
  if (host) hosts.add(host);
  if (process.env.PUBLIC_URL) {
    try {
      hosts.add(new URL(process.env.PUBLIC_URL).host);
    } catch {
      /* a malformed PUBLIC_URL adds nothing */
    }
  }
  return hosts.has(originHost);
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isApi = pathname === '/api' || pathname.startsWith('/api/');

  if (isApi && !SAFE_METHODS.has(request.method) && !sameOrigin(request)) {
    return NextResponse.json({ error: 'Verzoek geweigerd.' }, { status: 403 });
  }

  if (OPEN_PAGES.has(pathname) || OPEN_API.has(pathname)) return NextResponse.next();

  if (!hasSessionCookie(request)) {
    if (isApi) return NextResponse.json({ error: 'Log eerst in.' }, { status: 401 });
    const login = request.nextUrl.clone();
    login.pathname = '/login';
    login.search = '';
    return NextResponse.redirect(login, 303);
  }

  return NextResponse.next();
}

export const config = {
  // Everything but Next's own build output. `_next/data` does not exist in the
  // app router; a page or a route is always behind this.
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
