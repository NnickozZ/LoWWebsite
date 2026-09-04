/**
 * pm2 process file for a VPS without Docker: `pm2 start ecosystem.config.cjs`.
 *
 * Runs the production build (`next start`), never `next dev`. The dev server
 * recompiles every route the first time someone opens it, keeps the whole
 * webpack graph in memory (five to six times the RSS of the built app) and is
 * not meant to sit on a public port — on a shared machine it is exactly the
 * process the kernel picks when memory runs short.
 *
 * `.env` is read by Next itself at startup, so nothing is repeated here except
 * NODE_ENV, which `next start` requires.
 */
module.exports = {
  apps: [
    {
      name: 'landoverwater',
      cwd: __dirname,
      script: 'node_modules/next/dist/bin/next',
      args: 'start -H 0.0.0.0 -p 3000',
      env: { NODE_ENV: 'production' },
      // The built app idles around 150–200 MB. This is a safety net for a leak,
      // not a budget; if it ever trips, `pm2 logs landoverwater` says why.
      max_memory_restart: '700M',
      time: true,
      exp_backoff_restart_delay: 500,
      max_restarts: 20,
    },
  ],
};
