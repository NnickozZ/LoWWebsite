import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Creates .env from .env.example on first run, with real random secrets.
 * Idempotent: an existing .env is never modified.
 */
export function ensureEnv() {
  const envPath = join(root, '.env');
  if (existsSync(envPath)) return envPath;

  const example = readFileSync(join(root, '.env.example'), 'utf8');
  const filled = example
    .replace(/^SESSION_SECRET=.*$/m, `SESSION_SECRET=${randomBytes(32).toString('hex')}`)
    .replace(
      /^PASSWORD_RECOVERY_KEY=.*$/m,
      `PASSWORD_RECOVERY_KEY=${randomBytes(32).toString('hex')}`,
    );
  writeFileSync(envPath, filled, { mode: 0o600 });
  console.log('Created .env with fresh random secrets.');
  return envPath;
}

/** Minimal .env loader so scripts run without a dotenv dependency. */
export function loadEnv() {
  const envPath = ensureEnv();
  const text = readFileSync(envPath, 'utf8');
  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}
