import { defineConfig, devices } from 'playwright/test';

const smokeHost = process.env.SMOKE_HOST?.trim() || '127.0.0.1';
const smokePortFromEnv = Number.parseInt(process.env.SMOKE_PORT ?? '', 10);
const smokePort =
  Number.isInteger(smokePortFromEnv) && smokePortFromEnv > 0 ? smokePortFromEnv : 3000;
const smokeBaseUrl = `http://${smokeHost}:${smokePort}`;

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'list',
  use: {
    baseURL: smokeBaseUrl,
    trace: process.env.CI ? 'retain-on-failure' : 'off',
  },
  webServer: {
    command: `npx next dev -H ${smokeHost} -p ${smokePort}`,
    url: smokeBaseUrl,
    reuseExistingServer: !process.env.CI,
    timeout: 180 * 1000,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
