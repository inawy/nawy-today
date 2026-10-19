import { defineConfig, devices } from '@playwright/test';

// End-to-end tests run against the PRODUCTION build served by `vite preview`, so what is tested
// is what ships (CSP meta, hashed assets, the service worker). Chromium only for now (D-027).
export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['json', { outputFile: 'test-results/report.json' }]] : 'list',
  use: {
    baseURL: 'http://localhost:4173',
    trace: 'retain-on-failure',
    locale: 'en-US',
    timezoneId: 'Asia/Riyadh',
  },
  webServer: {
    command: 'npm run preview -- --port 4173 --strictPort',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
