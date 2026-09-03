# Ordinary Work As-Built — Job-home splits and Depot after review

**Record status:** Final
**Recorded:** 2026-08-27
**Contract:** None.
**Contract digest:** None.
**Plan:** None.
**Plan digest:** None.
**Branch:** `development`
**PR:** `#46`
**Record standard:** `docs/workflows/schema/session-as-built.md`

## Delivered outcome

Mapper chain host, location tracking, and bearer HTTP doors each live in their job homes. Completion and hop dispatch have one public path. Fixture removal asks whether a system still has a door. Unscanned wormhole stubs keep their own layout id so they do not sit on a static. Depot runs once after draft reviews land.

- Fixed: Removing an unused system from a large map no longer fails
- Fixed: An unscanned wormhole stub no longer stacks on a static

## Divergences from plan

None.

## Final surfaces

- `src/mapper/chain/use-map-chain.ts` — composer over cards, halo, merge, and universe assets
- `src/mapper/chain/ChainLive.tsx` — live canvas composition after the auth gate
- `src/mapper/chain/stub-layout.ts` — scanned layout ids allocated over kept stubs
- `convex/characterLocationReads.ts` — viewer and held-state reads
- `convex/characterLocationAccess.ts` — access leases
- `convex/characterLocationApply.ts` — generation-guarded apply
- `convex/characterLocationPurge.ts` — user and character teardown
- `convex/http.ts` — route registry only
- `convex/lib/httpAuth.ts` — bearer and Zod door
- `convex/engineComplete.ts` — sole public completion and hop path
- `convex/mapFixtureRemove.ts` — in-use check via `hasTouchingConnection`
- `.depot/workflows/test.yml` — `workflow_dispatch` only

## Discovered work

None.

## Successor notes

- `heldState` JSDoc stays. Convex `runQuery` is a separate transaction per call. Do not split the two table reads.
- Dragging still lives on dials. Pin placement needs it before the node exists.
- Missed Convex purge after deploy drift is the authorized best-effort path. Identity teardown continues. The map-access sweep is the backstop. Do not restore a `characterLocation.purgeForUser` facade.
- `MapAccessState` stays `boolean | undefined`. Unanswered is not a third named variant in this packet.
- Dump is GitHub #464. Greptile subscribed and did not reply. CodeRabbit contract comments, a log on the HC-5 swallow, and a CONTRIBUTING rewrite were rejected. The stub id collision was accepted.

## Verification summary

- **Adversarial review:** Subject: Origin `46`; `origin pr diff 46`; Roles: structure-reviewer, behavior-reviewer, thermos, comment-sicko; Runtime identity: requested=agent-file-pin, observed=Not observable; Verdict: `PASS`; Disposition: leftover banners, identity `filterChainConnections`, and scanned stub id allocation accepted and fixed. Load-bearing HC-5 swallow and live-page filter order comments restored. `MapAccessState` reshape, purge helper extract, one-deploy purge shim, and a second review after the batch rejected.
