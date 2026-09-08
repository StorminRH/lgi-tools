import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './',
  testMatch: 'deliberate-failure.spec.ts',
  fullyParallel: false,
  forbidOnly: true,
  retries: 0,
  workers: 1,
  timeout: 30_000,
  outputDir: '../docs/ux-check/captures/playwright',
  reporter: [['./reporter.cjs']],
  metadata: { lane: 'mandatory-production', deployment: 'deliberate-failure-proof' },
  projects: [{
    name: 'mandatory-production',
    testMatch: 'deliberate-failure.spec.ts',
  }],
  use: {
    baseURL: 'http://127.0.0.1:3000',
    serviceWorkers: 'block',
    screenshot: 'off',
    trace: 'off',
    video: 'off',
  },
});
