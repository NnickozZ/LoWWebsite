import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnv } from './ensure-env.mjs';

/**
 * `npm run logs` — everything the server has written down, newest last.
 *
 * `npm run logs -- --errors` shows only the entries worth waking up for, which
 * on a busy evening is the difference between reading four lines and forty
 * thousand.
 */
loadEnv();

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dir = join(root, process.env.DATA_DIR || './data', 'logs');

if (!existsSync(dir)) {
  console.log(`No logs yet — nothing has been written to ${dir}.`);
  process.exit(0);
}

const onlyErrors = process.argv.includes('--errors');
const files = readdirSync(dir)
  .filter((name) => name.startsWith('server-') && name.endsWith('.log'))
  .sort();

if (!files.length) {
  console.log(`No server logs in ${dir}.`);
} else {
  for (const name of files.slice(-3)) {
    const text = readFileSync(join(dir, name), 'utf8');
    const entries = text.split(/\n(?=\[\d{4}-)/).filter(Boolean);
    const wanted = onlyErrors
      ? entries.filter((entry) => /\b(ERROR|FATAL)\b/.test(entry.split('\n')[0]))
      : entries;
    if (!wanted.length) continue;
    console.log(`\n──── ${name} ${'─'.repeat(Math.max(0, 60 - name.length))}`);
    console.log(wanted.join('\n').trimEnd());
  }
}

// A native crash writes one of these and nothing else; it is the only trace of
// the better-sqlite3 abort that took this server down repeatedly.
const reports = readdirSync(dir).filter((n) => n.startsWith('report.') || n.startsWith('report-'));
if (reports.length) {
  console.log(`\n──── native crash reports (${reports.length}) ${'─'.repeat(30)}`);
  for (const name of reports.slice(-5)) {
    const when = statSync(join(dir, name)).mtime.toISOString();
    let summary = '';
    try {
      const report = JSON.parse(readFileSync(join(dir, name), 'utf8'));
      summary = ` — ${report.header?.event ?? 'fatal error'}${
        report.header?.trigger ? ` (${report.header.trigger})` : ''
      }`;
    } catch {
      /* a truncated report still tells you the day it happened */
    }
    console.log(`  ${when}  ${name}${summary}`);
  }
  console.log(`\n  Full detail: ${join(dir, reports[reports.length - 1])}`);
}
