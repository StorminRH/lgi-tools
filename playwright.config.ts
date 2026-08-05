import { defineConfig, devices } from '@playwright/test';

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? process.env.UX_BASE_URL ?? 'http://localhost:3000';

/**
 * Log-driven Playwright config. Artifacts (screenshot/trace) only on failure,
 * written under the existing gitignored ux-check captures tree. Prefer an
 * already-running `pnpm dev` / `pnpm dev:all`; webServer reuses it when present.
 *
 * Do not set Vercel bypass via `extraHTTPHeaders` here — that leaks the secret
 * to every third-party origin. Local e2e targets localhost; protected remote
 * probes use `installOriginScopedBypass` in ux-check / verify:site-routes.
 */
export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.spec.ts',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  outputDir: 'docs/ux-check/captures/playwright',
  reporter: [['list'], ['json', { outputFile: 'docs/ux-check/captures/e2e-report.json' }]],
  use: {
    ...devices['Desktop Chrome'],
    baseURL,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    video: 'off',
  },
  webServer: {
    command: 'pnpm dev',
    url: baseURL,
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
