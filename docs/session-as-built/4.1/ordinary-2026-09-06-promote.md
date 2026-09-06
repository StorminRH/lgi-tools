# Ordinary Work As-Built — Planner, tracking, and agent workflows

**Record status:** Final
**Recorded:** 2026-09-06
**Contract:** None.
**Contract digest:** None.
**Plan:** None.
**Plan digest:** None.
**Branch:** `development`
**PR:** `#134`
**Record standard:** `docs/workflows/schema/session-as-built.md`

## Delivered outcome

The industry planner uses one calculation for batch material demand. Stopping Atlas tracking clears the character's jump bookkeeping after the final tracker leaves. Cursor and Codex now share the development-to-staging workflow, with checks that completed session records actually reached staging before archive.

- Changed: Industry planner material calculations share one batch ledger.
- Fixed: Stopping tracking clears saved jump bookkeeping after the final tracker leaves, while preserving other users' active tracking.
- Removed: Unused rate-limit analytics event writes.
- Changed: Cursor and Codex instructions support accumulating work on development and reviewing promotions to staging.

## Divergences from plan

None.

## Final surfaces

- `src/features/industry-planner/build-batch.ts` owns batch demand calculation with optional material-efficiency settings.
- `convex/mapJumpBookkeeping.ts` and `convex/mapTrackingTeardown.ts` clear bookkeeping when tracking ends.
- `tools/lifecycle/resolve_development_state.py` advances completed sessions and selects pending delivery before archive.
- `tools/lifecycle/archive_delivery.py` checks committed plans, contracts, and final records across development and staging.
- `.agents/skills/`, `.cursor/skills/`, and `.codex/agents/` provide the paired workflow instructions and eight Codex agent definitions.

## Discovered work

None.

## Successor notes

Version 4.1 and later use development-based delivery. Historical lifecycle records retain their original rules. This ordinary-work promotion does not mark session 4.1.1.1 complete. GitHub mirror #477 receives one bot-review pass. Fixes are verified locally and in Depot; additional CodeRabbit credits are not required.

## Verification summary

- The six configured local checks passed on `3bbfd919b75b622db3908711074bfbbf0ee8c881` after synchronizing dependencies with the frozen lockfile.
- Python tooling regression suite: 230 tests passed, including stale delivery records, schema drift, invalid completed authority, and completion parser parity.
- Focused application suite: 177 tests across ten files passed, including shared tracking, purge, planner calculations, and rate limiting.
- **Adversarial review:** Subject: Origin `134`; `origin pr diff 134`; Roles: structure-reviewer, behavior-reviewer, thermo-nuclear-review-subagent, thermo-nuclear-code-quality-review-subagent; Runtime identity: requested=repository agent-file pins, observed=Not observable; Verdict: PASS; Disposition: tracking ownership, archive record/schema equality, completed authority validation, marker parsing, and release-step wording findings fixed. Pricing ledger misuse rejected because no production caller supplies mismatched inputs. Bugbot, Greptile, and CodeRabbit findings were included in the same batch.
- The local health command exited 0 with three pre-existing complexity findings outside this promotion; Depot remains the final CI gate.
