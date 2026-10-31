import { defineConfig, devices } from '@playwright/test';

// Locally the installed Edge is used (no browser download); CI installs Playwright's Chromium.
const channel = process.env.CI ? undefined : 'msedge';
// one preview server per checkout: parallel worktrees each set their own E2E_PORT
const port = Number(process.env.E2E_PORT ?? 4321);

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 30_000,
  // a whole-run ceiling: a browser that hangs on shutdown must fail the run, not stall CI
  globalTimeout: 10 * 60_000,
  fullyParallel: true,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: `http://localhost:${port}`,
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], channel, viewport: { width: 1366, height: 900 } } },
    { name: 'mobile', use: { ...devices['Pixel 7'], channel } },
  ],
  webServer: {
    // tests run against the built site, exactly what GitHub Pages serves
    command: `npx astro preview --port ${port}`,
    url: `http://localhost:${port}`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
