import { execFileSync } from 'node:child_process';
import { rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

/**
 * A fresh archive for every e2e run: its own DATA_DIR, the demo dataset and a
 * known Keeper. This runs as the first step of the webServer command rather
 * than as a Playwright globalSetup, because globalSetup runs *after* the server
 * has started — deleting the data directory under a live SQLite connection
 * leaves the server reading a deleted file.
 */
const dataDir = join(root, 'data-e2e');
rmSync(dataDir, { recursive: true, force: true });

const env = { ...process.env, DATA_DIR: dataDir };
const run = (script, args = []) =>
  execFileSync(process.execPath, [join(root, 'scripts', script), ...args], {
    cwd: root,
    env,
    encoding: 'utf8',
  });

run('seed-demo.mjs');
const output = run('bootstrap.mjs', ['--username', 'Keeper', '--password', 'abbeytower34']);

// A real image for the photo-attachment spec, rather than a checked-in binary.
const sharp = (await import(join(root, 'node_modules', 'sharp', 'lib', 'index.js'))).default;
await sharp({
  create: { width: 800, height: 500, channels: 3, background: { r: 122, g: 74, b: 43 } },
})
  .png()
  .toFile(join(dataDir, 'fixture-photo.png'));

const code = output.match(/Invite code:\s*([A-Z0-9-]+)/)?.[1];
if (!code) throw new Error(`Could not read the invite code from bootstrap:\n${output}`);
writeFileSync(join(dataDir, 'invite.txt'), code, 'utf8');

console.log(`e2e archive ready at ${dataDir} (invite ${code})`);
