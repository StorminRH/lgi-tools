# End-to-end testing principles

These notes summarize how we approach Playwright tests in this codebase, based
on the Epic Web E2E workshop and our existing setup. Adapted from the
[Epic Web / Kent C. Dodds E2E guidance](https://github.com/kentcdodds/kody/blob/main/docs/contributing/end-to-end-testing.md)
for LGI.tools (Next.js, Better Auth + EVE SSO, Neon, Convex).

## Goals

- Validate user-visible journeys end-to-end through the real app.
- Prefer a few high-signal tests over many brittle ones.
- Keep tests readable and close to how a user describes behavior.
- Keep the bar for adding an E2E test very high.
- Prefer assertion + console/network evidence over always-on screenshots.

## What to test

- Only the most important happy-path user flows.
- Primary routes and flows that would make the product feel broken if they
  stopped working.
- Integration across the Next.js app, auth session, and API endpoints when that
  journey is central to the product.

Avoid testing implementation details, styling, or pure utility functions. Avoid
adding E2E coverage for edge cases, low-probability regressions, or bug fixes
that are unlikely to recur. Prefer Vitest (and `*.db.test.ts` where SQL
matters) whenever it can falsify the behavior — see the
[test flavor decision matrix](./testing-principles.md#test-flavor-decision-matrix).

## Bar for adding a test

- Default to not adding a new E2E test.
- Add one only when the flow is both user-critical and hard to cover with faster
  tests.
- Prefer a single broad happy-path journey over multiple narrow regression
  cases.
- If a bug is unlikely to show up again, do not add an E2E test just to lock in
  the fix.
- Treat `e2e/*.spec.ts` as a tiny smoke suite. Do not add capability-by-capability
  coverage there unless the failure mode depends on the real browser, auth
  cookie, and app shell.

## Structure and style

- Keep tests flat: top-level `test(...)` with no `describe` nesting unless a
  short group (for example authenticated `storageState`) materially clarifies
  the suite.
- Inline setup per test; avoid shared `beforeEach` unless required.
- Prefer fewer, longer tests when one user journey covers the behavior.
- Treat each E2E test like a manual tester's script: one setup, then the actions
  and assertions needed to validate the whole flow.
- Do not split a single journey into multiple tiny tests just to isolate each
  assertion.
- Use Playwright’s `expect` and locator APIs (role/label/placeholder).

## Locators

Prefer stable, user-facing selectors:

- `getByRole` for buttons, links, headings, and inputs.
- `getByLabel` for form fields.
- `getByText` only for brief, stable copy.

Avoid `page.locator('css')` unless no accessible alternative exists.

## Server and routing

- Prefer an already-running `pnpm dev` (or `pnpm dev:all` when Convex-backed
  surfaces are required). `playwright.config.ts` starts `pnpm dev` via
  `webServer` and reuses an existing server when present.
- Default base URL is `http://localhost:3000` (`PLAYWRIGHT_BASE_URL` /
  `UX_BASE_URL` override).
- Local authenticated runs seed a test-only Better Auth session with
  `pnpm e2e:seed` (`e2e/auth-seed.ts` + `testUtils`). Never put `testUtils()`
  on the production `auth` export.
- Remote preview/production runs cannot forge that cookie against production
  DB — use an operator-exported `storageState` (`E2E_STORAGE_STATE` /
  `UX_STORAGE_STATE`) with `E2E_SKIP_SEED=1`. See `docs/workflows/ux-check.md`.
- Do not set a Vercel protection bypass via Playwright `extraHTTPHeaders` —
  that leaks the secret to every third-party origin. Origin-scoped bypass lives
  in the ux-check / verify-site helpers.

## Test data

- Use real input values and a happy-path payload.
- Keep credentials and character names obviously fake and local-only.
- Avoid hidden fixtures or global state in the Playwright tests beyond the
  seeded `storageState` path.

## Assertions

- Assert user-facing results (visible element, signed-in shell, session accepted).
- For async actions, wait on the UI result, not arbitrary timeouts.
- Assert important intermediate states as part of the same journey that causes
  them instead of creating isolated loading-state or transition-state tests.
- Keep console and page errors empty aside from an explicit local allowlist
  (Convex websocket / HMR noise).
- Pass/fail comes from assertions and diagnostics. Screenshots and traces write
  under `docs/ux-check/captures/` on failure only. Agents may open a failure
  artifact to diagnose a red check; the operator owns visual review after the
  log sweep.

## Running tests

Common commands:

- `pnpm e2e:seed`
- `pnpm test:e2e`
- `pnpm test:e2e` with `E2E_SKIP_SEED=1` and `E2E_STORAGE_STATE=…` for remote
- `pnpm ux-check <routes>` for Ordered-work / pre-close-out route sweeps
- `pnpm verify:prod` for post-merge proof against `https://lgi.tools`

None of these are part of `pnpm verify` today. For unit and DB coverage, prefer
`pnpm test` and the
[test flavor decision matrix](./testing-principles.md#test-flavor-decision-matrix).
