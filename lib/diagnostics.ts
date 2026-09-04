import { appendFileSync, existsSync, mkdirSync, readdirSync, statSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Where crashes go to be found.
 *
 * Three of this project's outages left nothing behind to read. The server died,
 * the browser said `NetworkError when attempting to fetch resource`, buttons
 * stopped doing anything, and the only trace was a request log that stopped
 * mid-sentence. Reconstructing the cause took a stack trace that happened to be
 * scrolled back in a terminal.
 *
 * So: everything that can be caught is written to a file under `DATA_DIR/logs`,
 * which lives on the server and survives a restart, and everything is written
 * *synchronously*. That last part is the whole point. A process that is about to
 * `abort()` will not run an async flush, so a logger that batches is a logger
 * that loses exactly the entry you needed. `appendFileSync` on a line or two per
 * event costs nothing at this scale and is still there afterwards.
 *
 * Nothing here is a substitute for fixing a crash. It is how the next one gets
 * diagnosed in a minute instead of a week.
 */

function logsDir(): string {
  const dir = join(process.env.DATA_DIR || './data', 'logs');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

function stamp(): string {
  return new Date().toISOString();
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Keep a fortnight, the same window the nightly backup keeps. */
const KEEP_DAYS = 14;

function prune() {
  try {
    const dir = logsDir();
    const cutoff = Date.now() - KEEP_DAYS * 86_400_000;
    for (const name of readdirSync(dir)) {
      if (!name.startsWith('server-') || !name.endsWith('.log')) continue;
      if (statSync(join(dir, name)).mtimeMs < cutoff) unlinkSync(join(dir, name));
    }
  } catch {
    /* pruning is housekeeping; never let it be the thing that breaks */
  }
}

export type LogLevel = 'info' | 'warn' | 'error' | 'fatal';

/**
 * One event, one line of header plus an indented body. Written synchronously
 * and mirrored to the console, so `pm2 logs` and the file agree.
 */
export function logEvent(level: LogLevel, event: string, detail?: unknown) {
  const line = [`[${stamp()}] ${level.toUpperCase()} ${event}`];

  if (detail instanceof Error) {
    line.push(`  ${detail.name}: ${detail.message}`);
    if (detail.stack) {
      for (const frame of detail.stack.split('\n').slice(1)) line.push(`  ${frame.trim()}`);
    }
    const cause = (detail as { cause?: unknown }).cause;
    if (cause) line.push(`  caused by: ${cause instanceof Error ? cause.stack : String(cause)}`);
  } else if (detail !== undefined) {
    let body: string;
    try {
      body = typeof detail === 'string' ? detail : JSON.stringify(detail, null, 2);
    } catch {
      body = String(detail);
    }
    for (const l of String(body).split('\n')) line.push(`  ${l}`);
  }

  const text = line.join('\n') + '\n';
  try {
    appendFileSync(join(logsDir(), `server-${today()}.log`), text);
  } catch {
    /* a full or read-only disk must not turn a logged error into a crash */
  }
  if (level === 'error' || level === 'fatal') process.stderr.write(text);
  else process.stdout.write(text);
}

/**
 * Process-level handlers, installed once per process.
 *
 * `uncaughtException` and `unhandledRejection` are the two ways a Next.js server
 * dies with the reason on screen and nowhere else. `exit` records the code, so a
 * log that simply stops has a last line saying whether the process meant to go.
 *
 * A native `abort()` — the better-sqlite3 crash this project had — cannot be
 * caught by any of these: the process is gone before JavaScript runs again. That
 * is what `--report-on-fatalerror` in `scripts/start.mjs` is for; it makes V8
 * write a diagnostic report next to these files. Between the two, every way this
 * server can die leaves something behind.
 */
export function installProcessHandlers() {
  const flag = '__zcfDiagnosticsInstalled';
  const g = globalThis as unknown as Record<string, boolean>;
  if (g[flag]) return;
  g[flag] = true;

  prune();
  logEvent('info', 'server started', {
    pid: process.pid,
    node: process.version,
    env: process.env.NODE_ENV ?? 'development',
    dataDir: process.env.DATA_DIR || './data',
    publicUrl: process.env.PUBLIC_URL ?? '(unset)',
  });

  process.on('uncaughtException', (error, origin) => {
    logEvent('fatal', `uncaughtException (${origin})`, error);
  });

  process.on('unhandledRejection', (reason) => {
    logEvent('fatal', 'unhandledRejection', reason);
  });

  process.on('warning', (warning) => {
    logEvent('warn', `process warning: ${warning.name}`, warning);
  });

  for (const signal of ['SIGTERM', 'SIGINT'] as const) {
    process.on(signal, () => {
      logEvent('info', `received ${signal}, shutting down`);
      process.exit(0);
    });
  }

  process.on('exit', (code) => {
    // Synchronous by necessity: nothing async survives this handler.
    logEvent(code === 0 ? 'info' : 'fatal', `process exiting with code ${code}`);
  });
}
