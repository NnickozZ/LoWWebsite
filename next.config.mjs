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

/** @type {import('next').NextConfig} */
const nextConfig = {
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
   * edge build cannot resolve `node:fs`, and one unresolvable import there is
   * enough to turn every page into a 500. The guard inside instrumentation.ts
   * already stops the code *running* off Node; this stops it being *bundled*.
   */
  webpack(config, { nextRuntime, webpack }) {
    if (nextRuntime === 'edge') {
      config.plugins.push(
        new webpack.IgnorePlugin({ resourceRegExp: /lib[\\/]diagnostics$/ }),
      );
    }
    return config;
  },
  allowedDevOrigins: lanOrigins(),
};

export default nextConfig;
