import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end configuration.
 *
 * The suite runs against the real API in mock mode (`AI_PROVIDER=mock`), so
 * every assertion exercises the actual product path — real WebSocket, real
 * database, real translation fan-out — with deterministic speech instead of a
 * provider account.
 */
const webUrl = process.env.E2E_WEB_URL ?? 'http://localhost:3000';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list']],
  timeout: 45_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: webUrl,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    // Grant the microphone so the permission dialog never blocks a run.
    permissions: ['microphone'],
    launchOptions: {
      // A synthetic microphone: the permission dialog never appears and the
      // capture path is exercised without needing real hardware.
      args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'],
      // Some environments (CI images, this repo's container) ship a browser
      // that Playwright did not download itself.
      ...(process.env.PLAYWRIGHT_CHROMIUM_PATH
        ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH }
        : {}),
    },
  },
  projects: [
    // Reduce Motion is enabled everywhere: it exercises the accessibility
    // path, and it makes assertions deterministic instead of racing a 180 ms
    // transition.
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], contextOptions: { reducedMotion: 'reduce' } },
    },
    { name: 'mobile', use: { ...devices['Pixel 7'], contextOptions: { reducedMotion: 'reduce' } } },
    {
      name: 'tablet',
      use: { ...devices['iPad Pro 11'], contextOptions: { reducedMotion: 'reduce' } },
    },
  ],
});
