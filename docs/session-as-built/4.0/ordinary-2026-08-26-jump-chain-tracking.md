# Ordinary Work As-Built — Split Convex jump, chain, and tracking into job homes

**Record status:** Final
**Recorded:** 2026-08-26
**Contract:** None.
**Contract digest:** None.
**Plan:** None.
**Plan digest:** None.
**Branch:** `development`
**PR:** `#39`
**Record standard:** `docs/workflows/schema/session-as-built.md`

## Delivered outcome

Jump, chain, and tracking each live in job homes. Coverage answers present+online only for identities already tracked on that map. Presence pins stay up when someone opts in or out.

- Fixed: presence pins no longer vanish when a tracker opts in or out

## Divergences from plan

None.

## Final surfaces

- `convex/mapJumpEvidence.ts` — jump evidence snapshot
- `convex/mapJumpAuthoring.ts` — transactional jump authoring
- `convex/mapJumpIdentity.ts` — identity correction
- `convex/mapJumpReads.ts` — shared origin-scan reads
- `convex/mapChainSystems.ts` — `watchMapSystems`
- `convex/mapChainConnections.ts` — `watchMapConnections` and `watchUnresolvedHoles`
- `convex/mapChainAccess.ts` — `watchMapAccess`
- `convex/mapChainEvents.ts` — `watchMapEvents`
- `convex/mapChainPage.ts` — shared page-size clamp
- `convex/mapTrackingOptIn.ts` — `setTracking` and the per-user cap
- `convex/mapTrackingLive.ts` — `forMap`, `coverage`, and `readTrackedPilotSystemIds`
- `convex/mapTrackingIds.ts` — sync poll identities
- `convex/mapTrackingTeardown.ts` — revoke and purge helpers
- `src/mapper/tracking/presence-model.ts` — `coverageQueryArgs` and `holdDefined`
- `src/mapper/tracking/use-map-coverage.ts` — last defined coverage for one map

## Discovered work

None.

## Successor notes

- `forMap` still truncates at 256. `readTrackedPilotSystemIds` throws `TRACKING_SCAN_LIMIT`. That split is already on `staging`. Left unfixed.
- Home prompt still matches location and coverage by `characterId` alone. `derivePresence` already keys by `userId` plus `characterId`. Left unfixed.
- `readConnectionPage` still carries the resolved/unresolved mode union. Left unfixed.
- `mapJumpReads.readTrackedLocation` still walks `mapTracking` with its own 256 cap and `MAP_TOO_LARGE`. Left unfixed.
- Coverage membership is a `by_map_user` take, not a `by_map` walk. Do not put a second `by_map` scan back on `coverage`.
- Dump is GitHub #462. CodeRabbit asked to fail-close `forMap` and to add contract comments. Left unfixed. Greptile did not reply.

## Verification summary

- **Adversarial review:** Subject: isolated app-facing packet `origin/staging` `028d14510c804d78b05ce5ce3818746b7fd25918`..`origin/development` `007a491259607cdf8718936ee0d7a3421dc3401b`, then coverage membership on `007a4912` and hold-last on `1c974a6172f8cdd6a56e4336a4875b74412474c9`; Roles: structure-reviewer, behavior-reviewer, thermos, no-comments; Runtime identity: requested=agent-file-pin, observed=Not observable; Verdict: `PASS`; Disposition: coverage oracle accepted and fixed. Home-prompt `characterId` join, `forMap` truncate, connection-page overload, and duplicated tracking walk rejected as already on `staging`. Comment-sicko first pass reverted; second pass found no meat.
