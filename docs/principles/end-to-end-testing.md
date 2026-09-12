# End-to-end testing principles

These notes summarize how we approach Playwright tests in this codebase, based
on the Epic Web E2E workshop and our existing setup.

Adapted from the
[Kent C. Dodds / kody E2E guidance](https://github.com/kentcdodds/kody/blob/main/docs/contributing/end-to-end-testing.md).

## Goals

- Validate user-visible journeys end-to-end through the Next app.
- Prefer a few high-signal tests over many brittle ones.
- Keep tests readable and close to how a user describes behavior.
- Keep the bar for adding an E2E test very high.

## What to test

- Only the most important happy-path user flows.
- Primary routes and flows that would make the product feel broken if they
  stopped working.
- Integration across the browser, app shell, and authenticated session when that
  journey is central to the product.

Avoid testing implementation details, styling, or pure utility functions. Avoid
adding E2E coverage for edge cases, low-probability regressions, or bug fixes
that are unlikely to recur.

## Bar for adding a test

- Default to not adding a new E2E test.
- Add one only when the flow is both user-critical and hard to cover with faster
  tests.
- Prefer a single broad happy-path journey over multiple narrow regression
  cases.
- If a bug is unlikely to show up again, do not add an E2E test just to lock in
  the fix.
- Treat `e2e/*.spec.ts` as a tiny smoke suite. Do not add
  capability-by-capability coverage there unless the failure mode depends on the
  real browser, auth cookie, and app shell.

## Structure and style

- Keep tests flat: top-level `test(...)` with no `describe` nesting.
- Inline setup per test; avoid shared `beforeEach` unless required.
- Prefer fewer, longer tests when one user journey covers the behavior.
- Treat each E2E test like a manual tester's script: one setup, then the actions
  and assertions needed to validate the whole flow.
- Do not split a single journey into multiple tiny tests just to isolate each
  assertion.
- Use Playwright’s `expect` and locator APIs (role/label/placeholder).

`test.describe` plus `test.use({ storageState })` is the existing pattern for
the authenticated smoke in `e2e/smoke.spec.ts`. Do not add extra nesting beyond
that.

## Locators

Prefer stable, user-facing selectors:

- `getByRole` for buttons, links, headings, and inputs.
- `getByLabel` for form fields.
- `getByText` only for brief, stable copy.

Avoid `page.locator('css')` unless no accessible alternative exists.

## Server and routing

- The test server is started via Playwright `webServer` in
  `playwright.config.ts`.
- Local runs use `pnpm dev` and reuse an already-running server.
  `PLAYWRIGHT_BASE_URL` defaults to `http://localhost:3000`.
- The GitHub Actions `e2e` job sets `CI` so `webServer` starts `pnpm start`
  (requires `next build`) and refuses a leftover listener.
- `pnpm test:e2e` (`scripts/run-e2e.mjs`) seeds auth storage unless
  `E2E_SKIP_SEED=1`, then runs Playwright.
- Local authenticated runs seed a test-only Better Auth session with
  `pnpm e2e:seed` (`e2e/auth-seed.ts`). Never put `testUtils()` on the
  production `auth` export.
- Remote preview/production runs cannot forge that cookie against production
  DB — use an operator-exported `storageState` with `E2E_SKIP_SEED=1` and
  `E2E_STORAGE_STATE`. `scripts/run-e2e-guard.mjs` refuses a remote skip-seed
  run that would fall back to the local seed file.
- Do not set a Vercel protection bypass via Playwright `extraHTTPHeaders` —
  that leaks the secret to every third-party origin. Origin-scoped bypass lives
  in `scripts/ux-remote-auth.mjs` (`installOriginScopedBypass`) and is used by
  `pnpm verify:site-routes`.
- Specs live under `e2e/` and match `**/*.spec.ts`. Helper unit tests
  (`e2e/**/*.test.ts`) stay on Vitest — see the
  [test flavor decision matrix](./testing-principles.md#test-flavor-decision-matrix).

## Test data

- Use real input values and a happy-path payload.
- Keep credentials and emails obviously fake and local-only.
- Avoid hidden fixtures or global state in the Playwright tests.

## Assertions

- Assert user-facing results (success message, redirect, visible element).
- For async actions, wait on the UI result, not arbitrary timeouts.
- Assert important intermediate states as part of the same journey that causes
  them instead of creating isolated loading-state or transition-state tests.
- The smoke suite also fails on unexpected page errors and console errors
  (with a short localhost/HMR allowlist).

## Running tests

Common commands:

- `pnpm test:e2e`
- `pnpm e2e:seed`
- `pnpm test:e2e -- --grep "smoke"`
- `pnpm exec playwright test`
- `pnpm exec playwright test e2e/smoke.spec.ts`

For capability work, prefer `*.test.ts` or `*.db.test.ts` beside the
implementation (see the
[test flavor decision matrix](./testing-principles.md#test-flavor-decision-matrix))
and keep `pnpm test:e2e` limited to a couple of high-signal smoke journeys.

Remote authenticated example:

```sh
E2E_SKIP_SEED=1 \
E2E_STORAGE_STATE=path/to/operator-storage.json \
PLAYWRIGHT_BASE_URL=https://example.vercel.app \
pnpm test:e2e
```

These tests are executed by the Verify workflow's `e2e` job
(`.github/workflows/test.yml`, `workflow_dispatch`). They are not part of
`pnpm verify`.
