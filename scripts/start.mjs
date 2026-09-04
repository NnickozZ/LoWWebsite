import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ensureEnv } from './ensure-env.mjs';

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

const child = spawn(process.execPath, [nextBin, 'start', '-H', '0.0.0.0', '-p', port], {
  stdio: 'inherit',
  cwd: root,
  env: process.env,
});

child.on('exit', (code) => process.exit(code ?? 0));
