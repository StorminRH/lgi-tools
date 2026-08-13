# End-to-end testing principles

Playwright coverage in this repo is a tiny smoke suite plus log-driven UX
sweeps. Adapted from the
[Epic Web / Kent C. Dodds E2E guidance](https://github.com/kentcdodds/kody/blob/main/docs/contributing/end-to-end-testing.md).

## Bar for adding a test

- Default to not adding a new E2E test.
- Add one only when the flow is both user-critical and hard to cover with faster
  tests.
- Prefer a single broad happy-path journey over multiple narrow regression
  cases.
- Treat `e2e/*.spec.ts` as a tiny smoke suite. Do not add
  capability-by-capability coverage there unless the failure mode depends on the
  real browser, auth cookie, and app shell.
- Prefer Vitest (and `*.db.test.ts` where SQL matters) whenever it can falsify
  the behavior — see the
  [test flavor decision matrix](./testing-principles.md#test-flavor-decision-matrix).
- Route sweeps and operator visual pause live in the `ux-check` skill.
  Durable probe definitions live in `docs/ux-check/README.md`.

## Locators

Prefer `getByRole`, `getByLabel`, and brief stable `getByText`. Avoid
`page.locator('css')` unless no accessible alternative exists.

## Auth and remote

- Local authenticated runs seed a test-only Better Auth session with
  `pnpm e2e:seed`. Never put `testUtils()` on the production `auth` export.
- Remote preview/production runs cannot forge that cookie against production
  DB — use an operator-exported `storageState` with `E2E_SKIP_SEED=1`.
- Do not set a Vercel protection bypass via Playwright `extraHTTPHeaders` —
  that leaks the secret to every third-party origin. Origin-scoped bypass lives
  in the ux-check / verify-site helpers.

## Assertions

Assert user-facing results. Wait on the UI result, not arbitrary timeouts. Pass
or fail comes from assertions and diagnostics. Screenshots write under
`docs/ux-check/captures/` on failure only. Agents do not visually approve the UI.

None of the Playwright commands are part of `pnpm verify`.
