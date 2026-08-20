# Testing principles

This codebase favors small, readable test suites with explicit setup and minimal
magic. Individual tests should follow a meaningful workflow end-to-end, even
when that makes a single test longer and more assertion-heavy.

Adapted from the [Epic Web / Kent C. Dodds testing guidance](https://github.com/kentcdodds/kody/blob/main/docs/contributing/testing-principles.md)
for this repository's Vitest, Postgres, Convex, and log-driven Playwright stack.

## Test flavor decision matrix

Choose the lightest flavor that can falsify the behavior. Discovery includes
`src/**/*.test.ts`, `convex/**/*.test.ts`, `scripts/**/*.test.mjs`, and
`e2e/**/*.test.ts` (`vitest.config.ts`). Prefer deleting a permanent low-signal
file over leaving `it.skip` / `describe.skip` residue.

| Flavor / command | Use when | Avoid when |
| --- | --- | --- |
| Co-located `*.test.ts` / `*.test.mjs` (`pnpm test`) | Pure functions, view-models, schema/contract checks, handlers with local fakes, and Convex logic under `convex-test` / edge-runtime. Fast feedback; no browser. | The assertion needs a real browser, authenticated UX, or layout only a human can judge. |
| Real-Postgres `*.db.test.ts` (`pnpm test`, local harness) | Behavior that depends on real SQL, transactions, advisory locks, or Neon-shaped constraints via `createDbTestHarness`. | Pure logic that never touches the DB — keep those in ordinary `*.test.ts`. Do not invent alternate DB harnesses. |
| Playwright log-driven UX / tiny E2E (`pnpm ux-check`, `pnpm test:e2e`) | Changed user-facing routes during Ordered work, plus a very small number of authenticated happy-path smokes. See [end-to-end testing](./end-to-end-testing.md). Route sweeps and operator pause are the `ux-check` skill; durable probes live in `docs/ux-check/README.md`. | Visual approval, layout feel, edge cases, or anything Vitest can falsify. Not part of the local test suite. |

**Postgres:** call `createDbTestHarness` from
`src/db/test-support/db-test-harness.ts` once at file top level. Import factories
explicitly inside each test (or a per-test factory). Do not hide important
arrange steps in shared hooks beyond what the harness owns.

**Convex:** keep unit/integration on in-process `convex-test` under
`convex/**/*.test.ts`. Do not spin live Convex deployments for the Vitest gate.

## Principles

- Prefer the "fewer, longer tests" style from Kent C. Dodds when assertions
  belong to one workflow.
- Treat each test like a manual tester's script: one setup, then as many actions
  and assertions as needed to validate the whole journey.
- Do not split a single flow into many tiny tests just to satisfy "one assertion
  per test." Multiple related assertions in one test are a feature, not a smell.
- Prefer flat test files: use top-level `test(...)` / `it(...)` and avoid deep
  `describe` nesting unless a short grouping materially clarifies the suite.
- Avoid shared setup like `beforeEach` / `afterEach` when inline setup keeps the
  case readable; do not hide important arrange steps in hooks.
- Avoid shared mutable test state across cases. If the next assertion depends on
  the same rendered object, request, or response, it likely belongs in the same
  test.
- Don't write tests for what the type system already guarantees.
- Prefer behavior and stable public contracts over implementation details.
  Avoid pinning CSS class strings, keyframe percentage literals, incidental
  markup, error-prose blobs, or config/copy constants unless that string *is*
  the contract under test.
- Do not add tests whose only value is asserting that a constant equals itself
  after import, or that a thin wrapper forwards arguments already covered by a
  higher-level workflow test.
- Do not keep meta-tests that only count fixtures, snapshot suite shape, or
  re-run `it.each` rows under a second name.
- Do not add regression tests for bugs unlikely to recur unless the flow is
  important enough to justify the maintenance cost.
- Prefer asserting intermediate states inside the broader workflow that causes
  them rather than adding isolated tests that only check an incidental loading
  or transition state.
- Prefer table-driven `it.each` when the same assertion runs over different
  inputs; prefer one longer workflow test when the cases share setup and form
  one journey.
- Build helpers that return ready-to-run objects (factory pattern), not globals.
- Keep test intent obvious in the name.
- Write tests so they can run offline: local fakes/fixtures over the public
  internet.
- Keep the bar for adding tests high, especially slower DB and browser surfaces.
- Real-Postgres suites stay `*.db.test.ts` with `createDbTestHarness`. Depot
  `verify` on the Origin PR is the gate of record for that layer.
- House registry / Fallow / ESI-dataset declaration suites are load-bearing
  gates — do not delete them as "cruft" without an explicit replacement.

## Low-signal patterns to delete

- `expect(MAGIC).toBe(42)` after `import { MAGIC } from './constants'`
- `readFileSync('globals.css')` asserting keyframe offset strings
- Two `it` blocks that only differ by fixture name but share identical facts
- A test that only asserts `CASES.length === N` or verdict histogram counts
- Thin passthrough tests for a function already exercised by a feature workflow
- Tests that only assert incidental instructional copy or tool-description prose
