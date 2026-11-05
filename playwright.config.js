import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30000,
  retries: 1,
  reporter: 'html',
  use: {
    // Production by default - this suite is the post-deploy smoke test and
    // runs on a schedule against the live site. The override exists so a fix
    // can be proved BEFORE it is merged: without it, a new e2e test cannot be
    // run against anything but a site that does not have the fix yet, which
    // is how a guard ships unverified.
    //   E2E_BASE_URL=http://localhost:3000 npm run test:e2e
    baseURL: process.env.E2E_BASE_URL || 'https://drbikesydney.com.au',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    trace: 'on-first-retry',
    // The site's sw.js claims the page, and in WebKit a request that goes
    // through a service worker never reaches context.route - so the analytics
    // block in tests/e2e/fixtures.js held in Chrome and leaked in Mobile Safari:
    // gtag.js loaded for real and a page_view reached Google Analytics (seen in
    // the trace of the first run, 2026-11-05). Playwright's own advice for
    // request interception is to block service workers. No e2e test exercises
    // the worker; tests/unit/sw-*.test.js do.
    serviceWorkers: 'block',
  },
  projects: [
    {
      name: 'Desktop Chrome',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'Mobile Safari',
      use: { ...devices['iPhone 14'] },
    },
    {
      name: 'Mobile Chrome',
      use: { ...devices['Pixel 7'] },
    },
  ],
});
