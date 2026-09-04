import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { networkInterfaces } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ensureEnv } from './ensure-env.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const nextBin = join(root, 'node_modules', 'next', 'dist', 'bin', 'next');

/**
 * Run the Next.js that is installed in this project, by path.
 *
 * Going through `npx next` instead would look identical until node_modules is
 * missing — at which point npx quietly offers to download whatever the latest
 * major happens to be, starts it, and leaves you debugging a version you never
 * asked for (and a rewritten tsconfig.json). Failing loudly is far kinder.
 */
if (!existsSync(nextBin)) {
  console.error('');
  console.error('  Dependencies are not installed yet.');
  console.error('');
  console.error('    npm install');
  console.error('');
  console.error('  Then run `npm run dev` again.');
  console.error('');
  process.exit(1);
}

ensureEnv();

const port = process.env.PORT || '3000';

function lanAddress() {
  for (const addrs of Object.values(networkInterfaces())) {
    for (const a of addrs ?? []) {
      if (a.family === 'IPv4' && !a.internal) return a.address;
    }
  }
  return null;
}

const lan = lanAddress();
console.log('');
console.log(`  Zeeland Case Files — development`);
console.log(`  Local:   http://localhost:${port}`);
if (lan) console.log(`  Network: http://${lan}:${port}   (phones on the same Wi-Fi)`);
console.log('');

// No shell, so no quoting surprises and no DEP0190 warning on Windows.
const child = spawn(process.execPath, [nextBin, 'dev', '-H', '0.0.0.0', '-p', port], {
  stdio: 'inherit',
  cwd: root,
});

child.on('exit', (code) => process.exit(code ?? 0));
