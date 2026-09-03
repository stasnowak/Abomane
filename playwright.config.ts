import { defineConfig, devices } from '@playwright/test';

const PORT = 4322;
const DATABASE_PATH = './e2e/.data/e2e.db';

export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global-setup.ts',
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['html', { open: 'never' }], ['list']] : 'list',

  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: 'on-first-retry',
    // Escape hatch for images that ship their own browser (some CI runners and
    // dev containers do). Unset, Playwright uses the build it manages itself.
    ...(process.env.CHROMIUM_PATH
      ? { launchOptions: { executablePath: process.env.CHROMIUM_PATH } }
      : {}),
  },

  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],

  // Runs the real production build against a scratch database, so the tests
  // exercise the same server the container starts.
  webServer: {
    command: 'npm run build && node ./dist/server/entry.mjs',
    url: `http://127.0.0.1:${PORT}/healthz`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      HOST: '127.0.0.1',
      PORT: String(PORT),
      DATABASE_PATH,
    },
  },
});
