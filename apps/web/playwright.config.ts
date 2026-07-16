import { defineConfig, devices } from '@playwright/test';

// Live-browser smoke + a11y tier (13d follow-up): what jsdom cannot check — real route renders
// against the PRODUCTION build, uncaught page errors, and axe's color-contrast rule (disabled
// under jsdom in src/test/axe.ts). Opt-in via `npm run test:e2e`, NOT part of the default vitest
// run; CI needs `npx playwright install chromium` first. The API is mocked per-test via
// page.route fixtures (e2e/fixtures.ts) — no chain or database is required.
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env['CI'],
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:3100',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium-desktop', use: { ...devices['Desktop Chrome'] } },
    // The hamburger disclosure + mobile layout tier. iPhone presets default to WebKit; only
    // Chromium is installed for this tier, so pin the browser and keep the viewport/touch.
    { name: 'chromium-mobile', use: { ...devices['iPhone 13'], browserName: 'chromium' } },
  ],
  webServer: {
    // Production build on a dedicated port so a dev server on 3000 never collides.
    command: 'npm run build && npx next start -p 3100',
    url: 'http://127.0.0.1:3100',
    reuseExistingServer: !process.env['CI'],
    timeout: 300_000,
  },
});
