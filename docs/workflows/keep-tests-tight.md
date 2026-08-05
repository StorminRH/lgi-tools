# Keep Tests Tight

Daily cleanup agent that trims low-signal Vitest residue from recent `main`
commits and opens a **draft** pull request. Cursor Automations run this
procedure; humans review and merge through the normal ship path. Never
auto-merge.

**Sole deletion bar:** [`docs/contributing/testing-principles.md`](../contributing/testing-principles.md).
Do not invent a second standard. Also read root `AGENTS.md`.

## Cursor Automation UI prompt

Point the Automations editor instructions at this file only, for example:

```text
Follow docs/workflows/keep-tests-tight.md completely. Open a draft PR when
cleanup is needed; otherwise exit with no PR.
```

## Loop

1. Exit early if `main` had no commits in the last 24 hours (nothing new to
   tighten). Save tokens; do not open an empty PR.
2. Read `AGENTS.md` and `docs/contributing/testing-principles.md`.
3. Inspect recently touched `*.test.ts` / `*.test.mjs` (and adjacent production
   exports those tests uniquely own). Agents may add many tiny regression cases
   while implementing — keep that habit during feature work; trim afterward.
4. For each low-signal case: **edit, combine, or delete** so the suite stays
   high-signal. Prefer fewer longer workflow tests.
5. Never delete house registry / Fallow / ESI-dataset / API-matrix / purge gates
   without an explicit replacement in the same change.
6. If user-visible contracts (formatters, SEO metadata, auth journeys) lose
   their only falsifier, consolidate into one high-signal suite rather than
   deleting coverage outright.
7. Run focused Vitest on touched paths, then `pnpm verify`.
8. Net line count should usually drop, but restoring a sole falsifier is
   always in scope even when it adds lines — never under-restore coverage to
   keep a PR eligible.
9. If there is nothing useful to change after the audit, exit with no PR.
10. Otherwise open a **draft** PR. Title/body must list **Removed**,
    **Consolidated**, and **Kept** (plus **Restored** when applicable). Do not
    mark ready for review until a human does. Do not auto-merge.

## Hard stops

- Do not weaken Fallow or add baseline/waiver entries to land the cleanup.
- Do not delete real-Postgres `*.db.test.ts` coverage because CI skips the DB —
  local `pnpm verify` with the harness reachable is the gate of record for that
  layer (see testing-principles cleanup posture).
- Do not rewrite product features under the guise of test cleanup.
