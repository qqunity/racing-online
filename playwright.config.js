import { defineConfig, devices } from '@playwright/test';

// E2E runs against the PRODUCTION build served by the Node server on a single
// origin (so websockets work exactly like in deployment). The webServer block
// builds the client and starts the server before the suite runs.
const PORT = Number(process.env.E2E_PORT) || 3100; // avoid clashing with a dev server on 3000

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  expect: { timeout: 10_000 },
  fullyParallel: false, // shared in-memory server; keep room state predictable
  workers: 1,
  retries: process.env.CI ? 2 : 1, // first load after a cold server can be slow
  reporter: process.env.CI ? 'line' : [['list']],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    // Fresh stats file per run so leaderboard assertions start from a known state.
    command: `npm run build && rm -f .tmp/test-stats.json && PORT=${PORT} DATA_FILE=.tmp/test-stats.json npm start`,
    url: `http://localhost:${PORT}/healthz`,
    timeout: 120_000,
    reuseExistingServer: !process.env.CI,
  },
});
