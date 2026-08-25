# Ordinary Work As-Built — Map-authoring extract and Origin Findings loop

**Record status:** Final
**Recorded:** 2026-08-25
**Contract:** None.
**Contract digest:** None.
**Plan:** None.
**Plan digest:** None.
**Branch:** `development`
**PR:** `#29`
**Record standard:** `docs/workflows/schema/session-as-built.md`

## Delivered outcome

None.

## Divergences from plan

None.

## Final surfaces

- `convex/mapAuthoringHome.ts` — home system, add-from-node, and `upsertLiveDestination`
- `convex/mapAuthoringFields.ts` — gated connection field setters
- `convex/mapAuthoringCollapse.ts` — `runCollapse`, `runBranchRestore`, sever and branch restore
- `convex/mapAuthoringTombstone.ts` — tombstone helpers and public `restoreConnection`
- `convex/mapAuthoringSweep.ts` — lifetime-expiry ceiling sweep
- `convex/mapAuthoringEvents.ts` — ledger actor and event write
- `convex/mapChainCleanup.ts` — bounded tombstone purge, moved out of `convex/lib/`
- `src/mapper/chain/optimistic-authoring.ts` — client hooks retargeted to the split mutation paths
- `.cursor/skills/close-out/SKILL.md` — Findings round is one comment and one push after dump review, Origin review, and Origin checks settle

## Discovered work

None.

## Successor notes

- Public mutation paths are now `api.mapAuthoringHome|Fields|Collapse|Tombstone.*`. This close-out did not keep deprecated `mapAuthoring:*` wrappers. The client in the same packet already calls the new paths. Staging deploys Next and Convex together. An already-open tab from before the deploy needs a refresh.
- `convex/mapAuthoring.test.ts` still hosts the full matrix behind a `publicAuthoring` alias. Split that file per module in a later change.
- Comment-sicko flagged `runCollapse`, `upsertLiveDestination`, `CEILING_COLLAPSE_GRACE_MS`, and `purgeExpiredChainTombstonesAt` as rename targets. Left as-is. Those names are the live public and cron contracts.
- Exported JSDocs stay on `upsertLiveDestination`, `runCollapse`, `COLLAPSE_MAP_SCAN_CAP`, and `CEILING_COLLAPSE_GRACE_MS`. Convex null-order for purge already lives on the schema and `takeExpiredByPurgeAfter`.
- `restoreConnection` gates edit access before `eventActor`, then `gatedConnection` gates again. That outer gate is the restore-before-actor contract, not a leftover.
- Dump is GitHub #458. CodeRabbit finished with no actionable comments. Greptile did not reply. Dump disposition lives here and in chat.

## Verification summary

- **Adversarial review:** Subject: isolated app-facing packet `origin/staging` `54dd60169e320296f2315c68dd50fc956402ad6c`..`origin/development` `ea6080b1bca12639b66330d602e4eeefaf117e74`, then no-comments cleanup on `87d2e3ab3d46ee047ebbb860bc6c0ed5e4e899a6`; Roles: structure-reviewer, behavior-reviewer, thermos, no-comments; Runtime identity: requested=agent-file-pin, observed=Not observable; Verdict: `PASS`; Disposition: structure and behavior clean. Thermo deploy-wrapper and leftover-test notes rejected for this staging packet. Comment restoration rejected except the four exported JSDocs. `restoreConnection` double-gate and `mapAuthoringHome` rename rejected. Comment-sicko narration deletions on `mapChainCleanup` accepted.
