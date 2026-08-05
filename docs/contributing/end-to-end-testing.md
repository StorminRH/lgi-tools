# End-to-end testing principles

These notes summarize how LGI.tools approaches user-journey and browser-level
checks. They adapt the
[Epic Web / Kent C. Dodds E2E guidance](https://github.com/kentcdodds/kody/blob/main/docs/contributing/end-to-end-testing.md)
to this repo's Vitest-first stack and Playwright-backed `ux-check` workflow.

## Goals

- Validate user-visible journeys through the real composition of units that
  matter for the product.
- Prefer a few high-signal journeys over many brittle cases.
- Keep tests readable and close to how a user describes behavior.
- Keep the bar for adding browser-level or journey-length coverage very high.

## What this repo uses today

| Surface | Role |
| --- | --- |
| Journey-style Vitest | Primary place for high-signal end-to-end-*ish* workflows (auth, purge, formatter/metadata contracts, feature pipelines). Runs in `pnpm test` / `pnpm verify`. |
| Real-Postgres `*.db.test.ts` | DB-backed journeys that need real SQL. Local harness only; still part of the gate of record when the harness is reachable. |
| `pnpm ux-check` (Playwright) | Scripted route capture + diagnostics for changed UI. Ordered-work / pre-close-out aid per `docs/workflows/ux-check.md`. **Not** a `pnpm verify` or CI gate. |

There is no permanent Playwright E2E suite in `pnpm verify`. Do not invent one
during cleanup or feature work unless product guidance explicitly adds it.

## What to test as a journey

- Only the most important happy-path user flows.
- Primary routes and flows that would make the product feel broken if they
  stopped working.
- Integration across collaborating modules when that journey is central to the
  product and lighter unit tests cannot honestly falsify it.

Avoid testing implementation details, styling, or pure utility functions in a
journey. Avoid adding journey or browser coverage for edge cases,
low-probability regressions, or bug fixes that are unlikely to recur.

## Bar for adding journey / browser coverage

- Default to not adding a new journey-length or Playwright check.
- Add one only when the flow is both user-critical and hard to cover with faster
  tests.
- Prefer a single broad happy-path journey over multiple narrow regression
  cases.
- If a bug is unlikely to show up again, do not add a journey or browser check
  just to lock in the fix.
- Prefer Vitest journey tests over Playwright whenever the assertion does not
  require a real browser, layout, or operator-authenticated surface.
- Use `pnpm ux-check` for changed user-facing routes during UI gates; do not
  turn those captures into a growing permanent regression suite.

## Structure and style

- Keep tests flat: top-level `test(...)` / `it(...)` with minimal `describe`
  nesting.
- Inline setup per test; avoid shared `beforeEach` unless required.
- Prefer fewer, longer tests when one user journey covers the behavior.
- Treat each journey test like a manual tester's script: one setup, then the
  actions and assertions needed to validate the whole flow.
- Do not split a single journey into multiple tiny tests just to isolate each
  assertion.
- When asserting in the browser (ux-check / future Playwright), prefer
  user-facing locators: role, label, and brief stable copy — not CSS plumbing.

## Assertions

- Assert user-facing results (success message, redirect, visible element,
  stable public contract).
- For async actions, wait on the result that matters, not arbitrary timeouts.
- Assert important intermediate states as part of the same journey that causes
  them instead of creating isolated loading-state or transition-state tests.
- Avoid pinning incidental instructional copy. Favor behavior-focused
  assertions.

## Running checks

Common commands:

- `pnpm test <path>` — focused Vitest, including journey-style suites
- `pnpm verify` — full local gate of record
- `pnpm exec playwright install chromium` — once, before first `ux-check`
- `pnpm ux-check /sites /industry` — capture concrete changed routes (stack must
  already be running; see `docs/workflows/ux-check.md`)

For the shared deletion / consolidation bar used by Keep-Tests-Tight automation,
see [testing principles](./testing-principles.md).
