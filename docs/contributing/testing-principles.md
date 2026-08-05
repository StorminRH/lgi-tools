# Testing principles

This codebase favors high-signal Vitest suites. Prefer fewer, longer tests that
follow a real workflow over many tiny cases that pin incidental details.

Agents often add cheap regression wrappers while implementing. Those can be
useful during the change and still be wrong to keep forever. Prefer deleting or
consolidating low-signal coverage over accumulating green checks.

This document is the bar for authors, reviewers, and any future Keep-Tests-Tight
automation. Linked from `AGENTS.md`.

## Commands

- Focused: `pnpm test <path>` or `pnpm test <path> -t "<name pattern>"`
- Full gate: `pnpm verify` (includes coverage-backed Vitest + Fallow)

Discovery includes `src/**/*.test.ts`, `convex/**/*.test.ts`, and
`scripts/**/*.test.mjs` (`vitest.config.ts`). Prefer deleting a permanent
low-signal file over leaving `it.skip` / `describe.skip` residue.

## Principles

- Prefer the "fewer, longer tests" style: one setup, then as many actions and
  assertions as needed for one workflow. Multiple related assertions in one
  test are a feature, not a smell.
- Do not split a single flow into many tiny tests just to satisfy "one
  assertion per test."
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
- Prefer table-driven `it.each` when the same assertion runs over different
  inputs; prefer one longer workflow test when the cases share setup and form
  one journey.
- Keep test intent obvious in the name.
- Write tests so they can run offline: local fakes/fixtures over the public
  internet.
- Keep the bar for adding tests high, especially slower DB / E2E surfaces.
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
   (unless explicitly planned-unused and inventoried), skipped/dead helpers,
   and comment banners that only narrate session chronology (`4.0.x`, `OWn`,
   `HC-n`) rather than a durable why.
6. "Covered elsewhere" only counts when the other coverage actually RUNS in the
   gate that blocks merges. CI has no database, so `*.db.test.ts` suites skip
   there — a mocked suite whose branches a db suite also reaches is NOT a
   duplicate layer; it is the CI falsifier for those branches. Never delete a
   mocked suite in favor of db-harness coverage alone.

## Examples of low signal

- `expect(MAGIC).toBe(42)` after `import { MAGIC } from './constants'`
- `readFileSync('globals.css')` asserting keyframe offset strings
- Two `it` blocks that only differ by fixture name but share identical facts
- A test that only asserts `CASES.length === N` or verdict histogram counts
- Thin passthrough tests for a function already exercised by a feature workflow

## Automation (future Keep Tests Tight)

A recurring cleanup agent should treat this file as the sole deletion bar.

Suggested loop (adapt to Cursor Automations / a skill when ready):

1. Exit early if `main` had no commits in the last 24 hours (nothing new to
   tighten).
2. Read this document and `AGENTS.md`. Do not invent a second standard.
3. Inspect recently touched `*.test.ts` (and adjacent production exports those
   tests uniquely own). Agents may add many tiny regression cases while
   implementing — keep that habit during the feature work; trim afterward.
4. For each low-signal case: **edit, combine, or delete** so the suite stays
   high-signal. Prefer fewer longer workflow tests.
5. Never delete house registry / Fallow / ESI-dataset / API-matrix / purge gates
   without an explicit replacement in the same change.
6. If user-visible contracts (formatters, SEO metadata, auth journeys) lose
   their only falsifier, consolidate into one high-signal suite rather than
   deleting coverage outright.
7. Run focused Vitest on touched paths, then `pnpm verify`.
8. Open a PR only when the net line count drops (or stays flat with a clear
   consolidation). Title/body should list **Removed**, **Consolidated**, and
   **Kept**.
9. Mark the PR ready for review; do not auto-merge until the house ship process
   allows it.
