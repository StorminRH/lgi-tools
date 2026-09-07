# Ordinary Work As-Built — Atlas efficiency and shared data reads

**Record status:** Final
**Recorded:** 2026-09-06
**Contract:** None.
**Contract digest:** None.
**Plan:** None.
**Plan digest:** None.
**Branch:** `development`
**PR:** `#137`
**Record standard:** `docs/workflows/schema/session-as-built.md`

## Delivered outcome

Atlas loads standalone signatures for the system being viewed and loads detailed log events when the log opens. Tabs for the same account coordinate routine tracking heartbeats. The header keeps a stable server-status placeholder during page hydration, and shared data readers preserve existing map, telemetry, and EVE lookup behavior.

- Changed: Atlas loads signatures for each open system and pauses detailed log updates while the log is closed.
- Changed: Atlas tabs share routine tracking heartbeats while retaining tracking recovery when tabs close or return.
- Fixed: The header server-status indicator holds its loading appearance until the page is ready, preventing a hydration mismatch.
- Changed: Shared data reads validate EVE name responses and retain map and telemetry behavior.
- Changed: Updated Zod and moved Depot verification to a four-CPU runner.

## Divergences from plan

None.

## Final surfaces

- `convex/mapScan.ts` keeps the legacy map-wide signature query and adds the system-scoped query used by current clients.
- `src/mapper/signatures/use-signature-page.ts` owns signature pagination for an open system; `src/mapper/log/MapEventLog.tsx` subscribes to detailed events while open.
- `src/data/convex/heartbeat-session.ts` and `heartbeat-peers.ts` coordinate routine beats across tabs; `convex/engine.ts` checks authenticated identity and retains server-owned tracking fences.
- `src/components/composition/ServerStatus.tsx` retains the status fallback until the client commits.
- `src/data/eve-data/universe-names.ts` validates shared EVE name responses; `universe-assets-client.ts` owns versioned asset retry.
- `src/data/telemetry/queries.ts` owns shared reads and `log.ts` owns writes; `src/data/maps/lifecycle-contract.ts` holds the deletion grace period.

## Discovered work

The mobile scanner can overlap the log and intercept pointer input. This was recorded on Origin #135 and already exists on staging. The promotion does not change scanner geometry, stacking, or sibling order. The mobile probe uses keyboard access and does not establish pointer accessibility. Operator visual acceptance remains unclaimed.

## Successor notes

Keep the legacy map-wide signature endpoint for open or cached clients during rollout. Heartbeat election is best effort; brief duplicate beats can occur, and every closing tab retains the existing server-fenced leave. Prior browser evidence used simulated lifecycle events and does not prove real mobile process suspension, successful upstream ESI location fetches, or production cost savings. This promotion contains ordinary work and does not finalize a numbered lifecycle session.

## Verification summary

- The six configured local checks passed on `fde9f3268ba021162cde70876214ce69f589629f` before and after the comment pass. Full Vitest passed 4,946 tests across 649 files with one existing skipped file/test. The focused query-observer suite passed all three tests under Vitest.
- Origin #135 records authenticated probes for scoped signature sharing, secondary-window cleanup, and log open/close behavior. Origin #136 records 15 multi-tab heartbeat probe checks. Those are prior implementation receipts; this promotion did not repeat the browser probes or claim broader visual acceptance.
- **Adversarial review:** Subject: Origin `137`; `origin pr diff 137`; Roles: structure-reviewer, behavior-reviewer, thermo-nuclear-review-subagent, thermo-nuclear-code-quality-review-subagent; Runtime identity: requested=repository agent-file pins, observed=Not observable; Verdict: PASS; Disposition: all four seats passed with no findings. Bugbot and Greptile were clean. CodeRabbit's eight documentation suggestions were rejected because the claimed blanket export-comment rule is absent from current guidance. Its plain-HTTP UUID fallback suggestion was rejected because staging already calls the same API unconditionally and documented environments use HTTPS or localhost. No application corrections were required.
- GitHub mirror #481 contains exactly the 69 size-gate paths, matching the reviewed Origin head. Its test and Semgrep checks passed; both requested bot reviews completed. Depot remains the final pipeline gate on the delivery-record head.
