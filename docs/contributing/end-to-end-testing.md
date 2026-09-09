# End-to-end testing principles

Playwright coverage in this repo is a tiny smoke suite plus selected UX
journeys, both run by Playwright Test. Adapted from the
[Epic Web / Kent C. Dodds E2E guidance](https://github.com/kentcdodds/kody/blob/main/docs/contributing/end-to-end-testing.md).

## Bar for adding a test

- Default to not adding a new E2E test.
- Add one only when the flow is both user-critical and hard to cover with faster
  tests.
- Prefer a single broad happy-path journey over multiple narrow regression
  cases.
- Treat `e2e/smoke.spec.ts` as a tiny smoke suite. Do not add
  capability-by-capability coverage there unless the failure mode depends on the
  real browser, auth cookie, and app shell.
- Prefer Vitest (and `*.db.test.ts` where SQL matters) whenever it can falsify
  the behavior — see the
  [test flavor decision matrix](./testing-principles.md#test-flavor-decision-matrix).
- Route sweeps and operator visual pause live in the `ux-check` skill.
  Durable probe definitions live in `docs/ux-check/README.md`.
  `e2e/probes.spec.ts` runs the selected journeys registered in
  `e2e/probe-registry.json`; it does not expand the mandatory smoke suite.

## Locators

Prefer `getByRole`, `getByLabel`, and brief stable `getByText`. Avoid
`page.locator('css')` unless no accessible alternative exists.

## Auth and remote

- Local authenticated runs use Playwright fixtures to seed test-only
  Better Auth sessions and own their cleanup. Never put `testUtils()` on the production `auth` export.
- Remote preview/production runs cannot forge that cookie against production
  DB — use an operator-exported `storageState` with `E2E_SKIP_SEED=1`.
  The deployed read-only lane also requires the expected principal identity
  and blocks browser HTTP writes and Convex Mutation/Action frames. See
  [deployed reads](../ux-check/README.md#deployed-reads) for the exact inputs.
- Do not set a Vercel protection bypass via Playwright `extraHTTPHeaders` —
  that leaks the secret to every third-party origin. Origin-scoped bypass lives
  in the ux-check / verify-site helpers.

## Assertions

Assert user-facing results. Wait on the UI result, not arbitrary timeouts. Pass
or fail comes from assertions and diagnostics. Sanitized failure diagnostics write under
`docs/ux-check/captures/sanitized-failures/` on failure only. Screenshots,
video and native traces are disabled because they can expose credentials or
account content. Agents do not visually approve the UI.

Fixtures create run-owned data and distinct permission roles. Teardown checks
that owned records are absent, including after failures. Missing fixture data,
required backend or measurement support blocks the selected case. Never silently
replace required interactions with empty-state coverage.

Register shared diagnostics before navigation on every client. Expected network
failures must name the exact endpoint, method and status within the scenario.
Whole-test retries are disabled for acceptance. A clean report means
`READY_FOR_REVIEW`; operator visual approval is separate.

The five implemented lanes are mandatory production, local mutation, deployed
read-only, development only and optional benchmarks. Optional lanes require
selected journey IDs. Commands, prerequisites, selection and evidence policy
are documented in [the UX verification workspace](../ux-check/README.md).

None of the Playwright commands are part of `pnpm verify`.
