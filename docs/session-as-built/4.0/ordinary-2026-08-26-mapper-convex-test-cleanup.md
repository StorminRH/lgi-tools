# Ordinary Work As-Built — Fold leftover Mapper UI and Convex map tests

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

None.

## Divergences from plan

None.

## Final surfaces

- `src/mapper/windows/MapWindow.test.ts` — one docked isolation pin and one placement workflow
- `src/mapper/chain/NoMapAccess.test.ts` — lost-access heading, salute, and recovery copy in one workflow
- `src/mapper/signatures/SignatureWindow.test.ts` — populated chrome plus empty shells in one workflow
- `convex/mapChain.test.ts` — signed-out and no-claim empty pages in one table; revoke then re-grant as one journey
- `convex/mapScan.test.ts` — linked way-home re-paste then leftover-stub absorb as one journey

## Discovered work

None.

## Successor notes

- Retired SignatureEditor resolution chrome stays pinned only in `connection-fields.test.ts`.
- `purgeExpiredChainTombstones` batch coverage stays in `mapChainCleanup.test.ts`, not `mapAuthoring.test.ts`.
- Dump is GitHub #462.

## Verification summary

- **Adversarial review:** Subject: isolated app-facing packet `origin/staging` `028d14510c804d78b05ce5ce3818746b7fd25918`..`origin/development` `1c974a6172f8cdd6a56e4336a4875b74412474c9`; Roles: structure-reviewer, behavior-reviewer, thermos, no-comments; Runtime identity: requested=agent-file-pin, observed=Not observable; Verdict: `PASS`; Disposition: leftover test cleanup accepted as authorized. See `ordinary-2026-08-26-jump-chain-tracking.md` for the production findings on the same PR.
