import { defineConfig, devices } from 'playwright/test';

const smokeHost = process.env.SMOKE_HOST?.trim() || '127.0.0.1';
const smokePortFromEnv = Number.parseInt(process.env.SMOKE_PORT ?? '', 10);
const smokePort =
  Number.isInteger(smokePortFromEnv) && smokePortFromEnv > 0 ? smokePortFromEnv : 3000;
const smokeBaseUrl = `http://${smokeHost}:${smokePort}`;
const isCI = !!process.env.CI;
const shouldSkipWebServer = process.env.PLAYWRIGHT_SKIP_WEBSERVER === '1';

export default defineConfig({
  testDir: './tests',
  fullyParallel: !isCI,
  forbidOnly: isCI,
  retries: isCI ? 2 : 0,
  timeout: isCI ? 90_000 : 60_000,
  expect: {
    timeout: isCI ? 10_000 : 5_000,
  },
  workers: isCI ? 1 : undefined,
  reporter: 'list',
  use: {
    baseURL: smokeBaseUrl,
    actionTimeout: isCI ? 15_000 : 0,
    navigationTimeout: isCI ? 30_000 : 0,
    trace: isCI ? 'retain-on-failure' : 'off',
  },
  webServer: shouldSkipWebServer
    ? undefined
    : {
        command: isCI
          ? `npx next start -H ${smokeHost} -p ${smokePort}`
          : `npx next dev -H ${smokeHost} -p ${smokePort}`,
        url: smokeBaseUrl,
        reuseExistingServer: !isCI,
        timeout: isCI ? 240 * 1000 : 180 * 1000,
      },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },
  ],
});
