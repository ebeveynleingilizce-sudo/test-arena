import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/e2e', fullyParallel: false, workers: 1, timeout: 60000,
  expect: { timeout: 15000 }, reporter: [['list'], ['html', { open: 'never' }]],
  use: { baseURL: 'http://127.0.0.1:5173', serviceWorkers: 'block', trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  webServer: { command: 'npm run dev', url: 'http://127.0.0.1:5173', reuseExistingServer: process.env.PLAYWRIGHT_REUSE_SERVER === '1' },
  projects: [{ name: 'phone-wide', testMatch: '**/teacher-classroom.spec.ts', use: { browserName: 'chromium', viewport: { width: 390, height: 844 } } }, { name: 'phone', use: { browserName: 'chromium', viewport: { width: 360, height: 800 } } }, { name: 'tablet', use: { browserName: 'chromium', viewport: { width: 768, height: 1024 } } }, { name: 'desktop', use: { browserName: 'chromium', viewport: { width: 1366, height: 900 } } }, { name: 'wide', use: { browserName: 'chromium', viewport: { width: 1920, height: 1080 } } }]
});
