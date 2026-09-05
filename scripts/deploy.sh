#!/usr/bin/env bash
#
# Update the site on the VPS (no Docker): pull, install, build, restart.
#
#   cd /path/to/LandOverWater && bash scripts/deploy.sh
#
# Safe to run again and again. `data/` and `.env` are never touched — they are
# not in the repository. The old server keeps serving while the new build is
# written; only the final restart interrupts anyone, for a second or two.
set -euo pipefail
cd "$(dirname "$0")/.."

if [ ! -f .env ]; then
  echo "No .env here. Copy .env.example to .env, set PUBLIC_URL and fresh secrets, then run this again." >&2
  exit 1
fi

echo "==> git pull"
git pull --ff-only

# --ignore-scripts belongs here as well as in .npmrc, not instead of it: npm
# gives any package with a binding.gyp and no install script an implicit
# `node-gyp rebuild`, and better-sqlite3 has one. Without this the deploy
# compiles a binary it already shipped and fails on a server with no compiler.
echo "==> npm ci (exactly the locked tree; prebuilt binaries, no compiler needed)"
npm ci --ignore-scripts --no-audit --no-fund

echo "==> next build"
npm run build

# A build that produced no BUILD_ID is a build that failed without saying so;
# restarting pm2 on top of it would swap a working server for a broken one.
test -f .next/BUILD_ID || { echo "Build produced no .next/BUILD_ID — not restarting." >&2; exit 1; }

if command -v pm2 >/dev/null 2>&1; then
  echo "==> pm2 restart"
  pm2 startOrRestart ecosystem.config.cjs --update-env
  pm2 save
  echo
  pm2 status landoverwater
else
  echo
  echo "pm2 is not installed, so the server was not restarted."
  echo "Either: npm install -g pm2 && pm2 start ecosystem.config.cjs && pm2 save && pm2 startup"
  echo "Or run it by hand:  npm start"
fi
