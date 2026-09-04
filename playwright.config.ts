import { defineConfig, devices } from '@playwright/test';
import { resolve } from 'node:path';

const PORT = 3101;
const baseURL = `http://127.0.0.1:${PORT}`;
// __dirname is available because Playwright transpiles this config to CJS.
const dataDir = resolve(__dirname, 'data-e2e');

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 45_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'line' : [['list']],
  use: { baseURL, trace: 'retain-on-failure' },

  // §15: every golden flow runs on a 390 px phone and a 1440 px desktop.
  projects: [
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
    {
      name: 'phone',
      use: { ...devices['Pixel 5'], viewport: { width: 390, height: 844 } },
    },
  ],

  webServer: {
    // E2E_DEV=1 runs the same specs against `next dev`, where React Strict Mode
    // double-invokes state updaters. A production build does not, so bugs that
    // only appear in development — a ref read inside an updater, say — are
    // invisible to the default run. Slower, but worth it after touching the
    // board's pointer handling.
    command: process.env.E2E_DEV
      ? 'node tests/e2e/prepare.mjs && npm run dev'
      : 'node tests/e2e/prepare.mjs && npm run build && npm start',
    url: `${baseURL}/api/health`,
    reuseExistingServer: false,
    timeout: 240_000,
    env: {
      PORT: String(PORT),
      DATA_DIR: dataDir,
      PUBLIC_URL: baseURL,
      // Left to Next in dev mode: forcing NODE_ENV=production there is what it
      // means by "non-standard NODE_ENV".
      ...(process.env.E2E_DEV ? {} : { NODE_ENV: 'production' }),
    },
  },
});
