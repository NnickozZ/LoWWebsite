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

echo "==> npm ci (native modules are built for this machine, never copied in)"
npm ci --no-audit --no-fund

echo "==> next build"
npm run build

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
