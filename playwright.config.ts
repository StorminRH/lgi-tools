import { defineConfig, devices } from '@playwright/test';
import { config } from 'dotenv';
import { remoteSkipSeedError } from './scripts/run-e2e-guard.mjs';
import { resolveLane } from './e2e/lane-policy.mjs';

config({ path: process.env.DOTENV_PATH ?? '.env.local', quiet: true });
const { lane, baseURL, local } = resolveLane({ argv: process.argv });
const targetError = remoteSkipSeedError({
  baseUrl: baseURL,
  skipSeed: true,
  e2eStorageState: process.env.E2E_STORAGE_STATE,
  uxStorageState: process.env.UX_STORAGE_STATE,
});
if (targetError) throw new Error(`BLOCKED prerequisite: ${targetError}`);

export default defineConfig({
  testDir: './e2e',
  tsconfig: './e2e/tsconfig.json',
  fullyParallel: false,
  forbidOnly: true,
  retries: 0,
  workers: 1,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  outputDir: 'docs/ux-check/captures/playwright',
  reporter: [['./e2e/reporter.cjs']],
  metadata: { lane, deployment: process.env.E2E_DEPLOYMENT_ID ?? 'local' },
  projects: [{
    name: lane,
    testMatch: ['mandatory-production', 'deployed-readonly'].includes(lane)
      ? '**/smoke.spec.ts' : '**/probes.spec.ts',
    metadata: { lane, mutation: lane === 'local-mutation' || lane === 'benchmark' },
  }],
  use: {
    ...devices['Desktop Chrome'],
    baseURL,
    serviceWorkers: 'block',
    screenshot: 'off',
    trace: 'off',
    video: 'off',
  },
  webServer: local ? {
    command: lane === 'dev-only' ? 'pnpm dev' : 'pnpm start',
    url: baseURL,
    reuseExistingServer: false,
    timeout: 120_000,
  } : undefined,
});
