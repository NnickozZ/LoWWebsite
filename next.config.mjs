import { networkInterfaces } from 'node:os';

/**
 * §13a: `make dev` binds to 0.0.0.0 so phones on the same Wi-Fi can reach it.
 *
 * Next refuses cross-origin requests to `/_next/*` unless the origin is listed
 * here — and "refuses" is literal: the HTML is served, every script chunk comes
 * back **403**, React never hydrates, and the site sits there looking perfectly
 * fine while not a single button works. That is a genuinely baffling failure to
 * be handed, and it is what happens the moment `next dev` is reached by any name
 * other than the one it was started with.
 *
 * So: localhost, whatever LAN address this machine currently has, and the host
 * in PUBLIC_URL, which is the name people actually type.
 *
 * None of this applies to `next start`. A production server has no HMR socket
 * and no origin list, which is one more reason a server should never be running
 * `next dev`.
 */
function lanOrigins() {
  const origins = ['localhost', '127.0.0.1'];
  for (const addrs of Object.values(networkInterfaces())) {
    for (const a of addrs ?? []) {
      if (a.family === 'IPv4' && !a.internal) origins.push(a.address);
    }
  }
  if (process.env.PUBLIC_URL) {
    try {
      const { hostname } = new URL(process.env.PUBLIC_URL);
      if (hostname) origins.push(hostname);
    } catch {
      // A malformed PUBLIC_URL is not worth refusing to start over.
    }
  }
  return [...new Set(origins)];
}

/**
 * §89: the headers every answer carries.
 *
 * The CSP is the browser's half of rule 1 and of `cleanDoc`: nothing on a page
 * may be loaded from anywhere but this archive. `img-src 'self'` is what turns
 * an outside picture smuggled into a shared document into a broken image
 * instead of a beacon that reports every reader. `'unsafe-inline'` for scripts
 * is the one concession — Next's bootstrap is inline and a nonce needs a
 * per-request middleware render (left for a later round, see the round note);
 * `'unsafe-eval'` is added only for `next dev`, whose refresh runtime needs it.
 */
function securityHeaders() {
  const dev = process.env.NODE_ENV !== 'production';
  const csp = [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ''}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "media-src 'self' blob:",
    "font-src 'self' data:",
    "connect-src 'self'",
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ].join('; ');
  const headers = [
    { key: 'Content-Security-Policy', value: csp },
    { key: 'X-Content-Type-Options', value: 'nosniff' },
    { key: 'Referrer-Policy', value: 'same-origin' },
    { key: 'X-Frame-Options', value: 'DENY' },
    { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
    { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
  ];
  // Only where the archive is really served over https, like `secureCookies()`:
  // HSTS on a LAN address would pin a phone to an https that does not exist.
  if ((process.env.PUBLIC_URL ?? '').startsWith('https://')) {
    headers.push({ key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' });
  }
  return headers;
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  // §89: no advert for the framework and its version.
  poweredByHeader: false,
  async headers() {
    return [
      { source: '/:path*', headers: securityHeaders() },
      // Every API answer is somebody's own; no cache in between may keep one.
      // Pictures are left out: `/api/assets/[id]` answers `private, immutable`
      // itself, and an id never points at different bytes.
      { source: '/api/:path((?!assets/).*)', headers: [{ key: 'Cache-Control', value: 'no-store' }] },
    ];
  },
  // Standalone output is what keeps the Docker image small, but `next start`
  // refuses to serve it — so it is switched on only for the image build.
  output: process.env.BUILD_STANDALONE ? 'standalone' : undefined,
  reactStrictMode: true,
  // §20: `yjs` is loaded from node_modules rather than bundled into every
  // server chunk. Bundled, the server ended up with a copy per chunk group —
  // three of them — and Yjs refuses to promise anything about a document that
  // crosses copies ("Yjs was already imported… this breaks constructor
  // checks"). One module in Node's own cache is one copy.
  serverExternalPackages: ['better-sqlite3', 'sharp', '@node-rs/argon2', 'yjs'],

  /**
   * `instrumentation.ts` is compiled once for every runtime Next supports,
   * including edge — even though every route here is `runtime: nodejs`. The
   * edge build cannot resolve `node:fs`, let alone the bare `require('fs')`
   * inside better-sqlite3, and one unresolvable import there is enough to turn
   * every page into a 500. The guard inside instrumentation.ts already stops
   * the code *running* off Node; this stops it being *bundled*.
   *
   * **Every module `instrumentation.ts` imports has to be named here.** The
   * `await import(…)` is dynamic to a reader and perfectly static to webpack,
   * which follows it into the edge bundle regardless of the `NEXT_RUNTIME`
   * check above it — so a second import added to that file without a line here
   * breaks the whole site, and breaks it in dev first, where instrumentation is
   * compiled for edge on the first request. That is how `lib/entries/mentions`
   * (§27's backfill, which opens the database) took the archive down: the
   * backfill itself ran perfectly, on Node, and the edge copy of the same file
   * could not resolve `fs`.
   */
  webpack(config, { nextRuntime, webpack }) {
    if (nextRuntime === 'edge') {
      config.plugins.push(
        new webpack.IgnorePlugin({
          // §69 added `db/sweep`, which loads better-sqlite3 through `lib/db`.
          resourceRegExp: /lib[\\/](diagnostics|entries[\\/]mentions|db[\\/]sweep)$/,
        }),
      );
    }
    return config;
  },
  allowedDevOrigins: lanOrigins(),
};

export default nextConfig;
