import { networkInterfaces } from 'node:os';

/**
 * §13a: `make dev` binds to 0.0.0.0 so phones on the same Wi-Fi can reach it.
 * Next warns about cross-origin requests to /_next/* from anything but
 * localhost, and will refuse them in a future major, so this allows whatever
 * LAN address this machine currently has.
 */
function lanOrigins() {
  const origins = ['localhost', '127.0.0.1'];
  for (const addrs of Object.values(networkInterfaces())) {
    for (const a of addrs ?? []) {
      if (a.family === 'IPv4' && !a.internal) origins.push(a.address);
    }
  }
  return origins;
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Standalone output is what keeps the Docker image small, but `next start`
  // refuses to serve it — so it is switched on only for the image build.
  output: process.env.BUILD_STANDALONE ? 'standalone' : undefined,
  reactStrictMode: true,
  serverExternalPackages: ['better-sqlite3', 'sharp', '@node-rs/argon2'],

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
