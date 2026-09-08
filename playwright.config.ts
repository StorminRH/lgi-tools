import { defineConfig, devices } from '@playwright/test';
import { isLocalBaseUrl, remoteSkipSeedError } from './scripts/run-e2e-guard.mjs';

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? process.env.UX_BASE_URL ?? 'http://localhost:3000';
const isCi = Boolean(process.env.CI);
const isLocal = isLocalBaseUrl(baseURL);
const targetError = remoteSkipSeedError({
  baseUrl: baseURL,
  skipSeed: true,
  e2eStorageState: process.env.E2E_STORAGE_STATE,
  uxStorageState: process.env.UX_STORAGE_STATE,
});
if (targetError) throw new Error(`BLOCKED prerequisite: ${targetError}`);

// Bypass headers belong to origin-scoped routing, never extraHTTPHeaders.
export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.spec.ts',
  fullyParallel: false,
  forbidOnly: isCi,
  retries: 0,
  workers: 1,
  outputDir: 'docs/ux-check/captures/playwright',
  reporter: [['list'], ['json', { outputFile: 'docs/ux-check/captures/e2e-report.json' }]],
  use: {
    ...devices['Desktop Chrome'],
    baseURL,
    screenshot: 'only-on-failure',
    // Remote traces contain authenticated traffic; retain sanitized diagnostics instead.
    trace: isLocal ? 'retain-on-failure' : 'off',
    video: 'off',
  },
  webServer: isLocal ? {
    command: isCi ? 'pnpm start' : 'pnpm dev',
    url: baseURL,
    reuseExistingServer: !isCi,
    timeout: 120_000,
  } : undefined,
});
