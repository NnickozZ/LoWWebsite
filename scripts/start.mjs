import { spawn } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ensureEnv } from './ensure-env.mjs';
// Runs on import and exits if node_modules is not the tree package.json asks
// for. Starting a server built from the wrong Next, or against the
// better-sqlite3 that aborts the process, is worse than not starting at all.
import './check-install.mjs';

/**
 * Production server. The mirror image of scripts/dev.mjs, and it exists for the
 * same reason: run *this project's* Next.js, by path.
 *
 * `npx next start` resolves through the npx cache when node_modules/.bin is
 * missing or has lost its executable bit — which is exactly what happens to a
 * node_modules folder copied from Windows to a Linux VPS. npx then downloads
 * whatever the latest major happens to be and runs that instead, so the server
 * ends up on a Next.js the project has never been built or tested against,
 * while package.json still says otherwise. Failing loudly beats that.
 */
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const nextBin = join(root, 'node_modules', 'next', 'dist', 'bin', 'next');

if (!existsSync(nextBin)) {
  console.error('');
  console.error('  Dependencies are not installed yet.');
  console.error('');
  console.error('    npm ci');
  console.error('');
  process.exit(1);
}

if (!existsSync(join(root, '.next', 'BUILD_ID'))) {
  console.error('');
  console.error('  There is no production build here yet.');
  console.error('');
  console.error('    npm run build');
  console.error('');
  process.exit(1);
}

ensureEnv();

const port = process.env.PORT || '3000';
process.env.NODE_ENV = 'production';

/**
 * Where a crash that JavaScript cannot catch leaves its evidence.
 *
 * `lib/diagnostics.ts` handles every error the runtime can hand back. A native
 * `abort()` is not one of them — better-sqlite3 11 on Node 24.19 killed this
 * server that way, and the process was gone before a single line of JavaScript
 * could run. `--report-on-fatalerror` makes V8 itself write a JSON report with
 * the native stack, the heap and the environment, next to the ordinary logs.
 * It costs nothing until the day it is the only thing there is.
 */
const logs = join(root, process.env.DATA_DIR || './data', 'logs');
mkdirSync(logs, { recursive: true });

const diagnostics = [
  '--report-on-fatalerror',
  '--report-uncaught-exception',
  '--report-on-signal',
  `--report-directory=${logs}`,
];
process.env.NODE_OPTIONS = [process.env.NODE_OPTIONS, diagnostics.join(' ')]
  .filter(Boolean)
  .join(' ');

// Same shape as lib/diagnostics.ts writes, so `npm run logs -- --errors`
// picks these up: the line saying the server was killed is the one that
// matters most, and it must not be the one the filter drops.
function note(level, text) {
  const line = `[${new Date().toISOString()}] ${level} ${text}\n`;
  process.stdout.write(line);
  try {
    appendFileSync(join(logs, `server-${new Date().toISOString().slice(0, 10)}.log`), line);
  } catch {
    /* never let logging be the failure */
  }
}

note('INFO', `starting: node ${process.version}, port ${port}, logs in ${logs}`);

const child = spawn(process.execPath, [...diagnostics, nextBin, 'start', '-H', '0.0.0.0', '-p', port], {
  stdio: 'inherit',
  cwd: root,
  env: process.env,
});

child.on('exit', (code, signal) => {
  // The line that was missing every time this server died: whether it was
  // killed, and by what. SIGKILL is the kernel running out of memory; SIGABRT
  // is a native crash, and there will be a report-*.json beside this file.
  if (signal) {
    note('FATAL', `server died: killed by ${signal}.` +
      (signal === 'SIGKILL' ? ' SIGKILL is almost always the kernel out-of-memory killer.' : '') +
      (signal === 'SIGABRT' ? ' SIGABRT is a native crash — look for report-*.json in the logs folder.' : ''));
  } else if (code !== 0) {
    note('FATAL', `server died: exited with code ${code}.`);
  } else {
    note('INFO', 'server stopped cleanly.');
  }
  process.exit(code ?? 1);
});
