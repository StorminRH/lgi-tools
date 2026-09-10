import { defineConfig, devices } from '@playwright/test';

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000';
const isCi = Boolean(process.env.CI);

/**
 * Log-driven Playwright config. Artifacts (screenshot/trace) only on failure.
 * Local runs prefer an already-running `pnpm dev` / `pnpm dev:all` and reuse
 * it. The GitHub Actions `e2e` job sets `CI` so webServer starts `pnpm start`
 * (requires `next build`) and refuses a leftover listener.
 *
 * Do not set Vercel bypass via `extraHTTPHeaders` here — that leaks the secret
 * to every third-party origin. Local e2e targets localhost; protected remote
 * checks use `installOriginScopedBypass` in verify:site-routes.
 */
export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.spec.ts',
  fullyParallel: false,
  forbidOnly: isCi,
  retries: 0,
  workers: 1,
  outputDir: 'test-results',
  reporter: [['list'], ['json', { outputFile: 'test-results/e2e-report.json' }]],
  use: {
    ...devices['Desktop Chrome'],
    baseURL,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    video: 'off',
  },
  webServer: {
    command: isCi ? 'pnpm start' : 'pnpm dev',
    url: baseURL,
    reuseExistingServer: !isCi,
    timeout: 120_000,
  },
});
