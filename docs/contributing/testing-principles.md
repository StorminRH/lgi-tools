# Testing principles

This codebase favors small, readable Vitest suites with explicit setup and
minimal magic. Individual tests should follow a meaningful workflow end-to-end,
even when that makes a single test longer and more assertion-heavy.

Agents often add cheap regression wrappers while implementing. Those can be
useful during the change and still be wrong to keep forever. Prefer deleting or
consolidating low-signal coverage over accumulating green checks.

This document is the bar for authors, reviewers, and any future Keep-Tests-Tight
automation. Linked from `AGENTS.md`.

Adapted from the [Epic Web / Kent C. Dodds testing guidance](https://github.com/kentcdodds/kody/blob/main/docs/contributing/testing-principles.md)
for this repository's Vitest, Postgres, Convex, and log-driven Playwright
`ux-check` / tiny E2E stack.

## Commands

- Focused: `pnpm test <path>` or `pnpm test <path> -t "<name pattern>"`
- Full gate: `pnpm verify` (includes coverage-backed Vitest + Fallow)

Discovery includes `src/**/*.test.ts`, `convex/**/*.test.ts`, and
`scripts/**/*.test.mjs` (`vitest.config.ts`). Prefer deleting a permanent
low-signal file over leaving `it.skip` / `describe.skip` residue.

## Test flavor decision matrix

Choose the lightest flavor that can falsify the behavior:

| Flavor / command | Use when | Avoid when |
| --- | --- | --- |
| Co-located `*.test.ts` / `*.test.mjs` (`pnpm test`) | Pure functions, view-models, schema/contract checks, handlers that can be exercised with local fakes, and Convex logic under `convex-test` / edge-runtime. Fast feedback; no browser. | The assertion needs a real browser, authenticated UX, or layout that only a human/operator capture can judge. |
| Real-Postgres `*.db.test.ts` (`pnpm test`, local harness) | Behavior that depends on real SQL, transactions, advisory locks, or Neon-shaped constraints via `createDbTestHarness`. | Pure logic that never touches the DB — keep those in ordinary `*.test.ts`. Do not invent alternate DB harnesses. |
| Journey-style Vitest (same `pnpm test`) | One longer workflow that asserts a user-critical path across collaborating units without a browser. Prefer this over many tiny sibling cases. | Edge cases, copy pinning, or anything a single pure-unit test can cover. |
| Playwright log-driven UX / tiny E2E (`pnpm ux-check`, `pnpm test:e2e`) | Changed user-facing routes during Ordered-work / pre-close-out UI gates, plus a very small number of authenticated happy-path smokes. Assertion + console/network evidence; failure-only screenshots/traces under `docs/ux-check/captures/`. See `docs/workflows/ux-check.md` and `docs/contributing/end-to-end-testing.md`. | Visual approval, layout feel, edge cases, or anything Vitest can falsify. Not part of `pnpm verify`. Agents never use always-on screenshots or browse the site for visual judgment — the operator does that after the log sweep. |

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
  the contract under test (for example a documented design-system invariant
  with a one-line why).
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
- Real-Postgres suites stay `*.db.test.ts` with `createDbTestHarness`; do not
  invent alternate DB harnesses during cleanup.
- House registry / Fallow / ESI-dataset declaration suites are load-bearing
  gates — do not delete them as "cruft" without an explicit replacement.

## Cleanup posture

When trimming:

1. **Remove** trivial wrappers, duplicate layers, magic-number/self-import pins,
   prose-only asserts, and never-happen edge cases.
2. **Consolidate** related one-assertion cases into fewer workflow tests or one
   `it.each` table.
3. **Keep** end-to-end-ish journeys, teardown/purge matrices, auth/ESI budget
   contracts, user-visible formatter/metadata contracts that have no higher
   falsifier, and anything that falsifies user-visible or build-breaking
   behavior.
4. Net line count should usually go down. If a cleanup adds more lines than it
   removes, stop and reassess.
5. Production cruft in the same pass: unused exports with only test consumers
   (unless the module's own header comment declares them planned-unused with a
   date or session reference — that comment IS the inventory), skipped/dead
   helpers, and comment banners that only narrate session chronology (`4.0.x`,
   `OWn`, `HC-n`) rather than a durable why.
6. "Covered elsewhere" means covered in the gate of record: `pnpm verify` on a
   machine with the db harness reachable. Real-Postgres `*.db.test.ts` coverage
   therefore counts, and a mocked db-layer suite whose branches the db twin
   reaches IS a duplicate layer — delete it, keeping only arms a mock alone can
   express (error injection, mid-loop mutation, malformed-row guards,
   projection-hook spies). Corollary: CI and remote agent sessions have no
   database and skip db suites, so db-layer changes are not done until a local
   `pnpm verify` has run them — agents must say so rather than treat green CI
   as proof.

## Examples of low signal

- `expect(MAGIC).toBe(42)` after `import { MAGIC } from './constants'`
- `readFileSync('globals.css')` asserting keyframe offset strings
- Two `it` blocks that only differ by fixture name but share identical facts
- A test that only asserts `CASES.length === N` or verdict histogram counts
- Thin passthrough tests for a function already exercised by a feature workflow
- Tests that only assert incidental instructional copy or tool-description prose

## Automation (Keep Tests Tight)

A recurring cleanup agent must treat this file as the sole deletion bar. Do not
invent a second standard. The executable procedure lives in
[`docs/workflows/keep-tests-tight.md`](../workflows/keep-tests-tight.md); Cursor
Automations point at that workflow and open **draft** PRs only (never
auto-merge).

## CI database posture (deferred)

Real-Postgres `*.db.test.ts` suites stay on local Docker via
`createDbTestHarness`. CI does not spin Neon or Convex branches for Vitest today.
A future CI job may create a short-lived Neon `preview/ci-*` branch (see
`neon.ts` TTL policy), migrate, run only `*.db.test.ts`, and delete the branch —
tracked in `docs/backlog.md`. Convex unit/integration stays on in-process
`convex-test`; live Convex preview deployments are for app previews, not the
Vitest gate.
