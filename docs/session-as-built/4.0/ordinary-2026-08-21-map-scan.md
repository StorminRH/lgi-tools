# Ordinary Work As-Built — Convex map-scan extract

**Record status:** Final
**Recorded:** 2026-08-21
**Contract:** None.
**Contract digest:** None.
**Plan:** None.
**Plan digest:** None.
**Branch:** `stormin/convex-map-scan-closeout-b5b3`
**PR:** `#16`
**Record standard:** `docs/workflows/schema/session-as-built.md`

## Delivered outcome

None.

## Divergences from plan

None.

## Final surfaces

- `convex/mapScan.ts` — registered paste, identify, elimination, selection, watch, and purge handlers
- `convex/lib/mapScanApply.ts` — clipboard apply and identify through the same paste writer
- `convex/lib/mapScanElimination.ts` — elimination evidence and the stub-to-hallway link writer
- `convex/lib/mapScanSelection.ts` — operator selection, confident-missing removal, and the tracked-pilot presence reader
- `convex/lib/mapScanState.ts` — shared scan bounds, `ScanState`, and row helpers

## Discovered work

None.

## Successor notes

- Comment-sicko flagged reshape work on `replaceOccupied`, `linkKnowledgePatch`, `readSelectionState`, and the stub-before-collapse stamp order. Left open. This close-out keeps the extract behavior-preserving.
- Origin PR #8 on `stormin/convex-map-scan-refactor-60d0` is the retired pre-rebase host.
- Dump GitHub #454. CodeRabbit asked to count inbound list-row deletes as `updated`, carry `firstSeenAt` on a recreated stub, refresh deduction rows mid-batch, and exclude tombstones from the 256-row bound. Left unfixed. Those are the old monolith contracts, not extract bugs. Greptile did not reply. GitHub Actions `test` on the dump is red and unused. Origin Depot is the land gate.
- Accepted dump nits: identify reuses `state.connections` and drops the unused `readTouchingConnections` import. The collapse-owner test now forbids `runCollapse(` in `mapScan.ts`.

## Verification summary

- **Adversarial review:** Subject: isolated app-facing packet `origin/staging` `1215afb0ccf7ae5d58c4fce17d95d707099f1f3b`..`stormin/convex-map-scan-closeout-b5b3` `241030601c445fe256ba3558edf4199a27c4e7b1`, then corrected on `337da7f0c709752d487e45414fe1a1dfe6888ca9`; Roles: structure-reviewer, behavior-reviewer, thermos, no-comments; Runtime identity: requested=agent-file-pin, observed=Not observable; Verdict: `PASS`; Disposition: `trackedPresenceReader` accepted and moved into selection. Five Fallow private-type leaks accepted and exported. Comment-sicko deletions accepted. Reshape flags on occupied-door and selection names rejected as out of scope.
