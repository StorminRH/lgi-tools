# Ordinary Work As-Built — Split Convex engine and fixtures into job homes

**Record status:** Final
**Recorded:** 2026-08-26
**Contract:** None.
**Contract digest:** None.
**Plan:** None.
**Plan digest:** None.
**Branch:** `stormin/convex-engine-fixtures-aaa1`
**PR:** `#35`
**Record standard:** `docs/workflows/schema/session-as-built.md`

## Delivered outcome

None.

## Divergences from plan

None.

## Final surfaces

- `convex/engine.ts` — public `heartbeat` plus one-deploy `onSyncComplete` and `chainDispatch` drains
- `convex/lib/engineCore.ts` — registration, `dispatch`, `dueSubjects`, `retireFromScan`
- `convex/engineComplete.ts` — completion, re-arm, hop schedule
- `convex/engineLeave.ts` — tab-leave retire
- `convex/engineScan.ts` — 30s due-set scan
- `convex/engineSweep.ts` — overdue, dropped, abandoned, and retired-dataset GC
- `convex/mapFixtures.ts` — gated `readMapCollection` only
- `convex/mapFixturePlace.ts` — place and insert fixture writers
- `convex/mapFixtureRemove.ts` — hard-delete fixture writers
- `convex/mapFixtureHoles.ts` — unresolved-hole fixture
- `convex/mapFixtureNotes.ts` — note fixture
- `convex/mapFixtureSignatures.ts` — signature observation and tombstone fixtures
- `convex/mapFixtureTracking.ts` — tracked-location seed, advance, and clear
- `convex/lib/mapConnectionLookup.ts` — `FIXTURE_CONNECTION_SCAN_LIMIT` so holes and remove do not import each other

## Discovered work

None.

## Successor notes

- `engine.onSyncComplete` and `engine.chainDispatch` stay until the deploy after this one. New work already schedules `engineComplete`. Delete the drains, the two tests, and the export-coverage aliases once in-flight jobs at those old paths are gone.
- `findReferencingConnection` still scans the map and throws `FIXTURE_MAP_TOO_LARGE`. `readTouchingConnections` would make that bound per system and change fixture errors. Later slice.
- Overdue `delete` and `sweepAbandoned` still skip `clearCoverageForUser`, same as `staging` before this split. `retireFromScan` still clears on retire.
- Dump is GitHub #461. CodeRabbit asked to clear coverage on those delete paths. Left unfixed. Greptile did not reply.

## Verification summary

- **Adversarial review:** Subject: isolated app-facing packet `origin/staging` `6b322a887ba32cf77c2c1db9790eabd7714a6488`..`origin/stormin/convex-engine-fixtures-aaa1` `89bbdfe84ecd23c0af8c58da0171118da26ac711`, then corrections on `6ed5513d`, `e7e319de`, `da5990ac`, and `89bbdfe8`; Roles: structure-reviewer, behavior-reviewer, thermos, no-comments; Runtime identity: requested=agent-file-pin, observed=Not observable; Verdict: `PASS`; Disposition: `engine.chainDispatch` one-deploy drain and duplicate `mapConnectionLookup` import accepted and fixed. `readTouchingConnections` swap, fixture-limit move, and `ObjectType` rewrite left unfixed. Comment-sicko narration deletions accepted except the Convex static-cron note, the HTTP 400-vs-500 door, and the CLI `export()` type-gap note.
