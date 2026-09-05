# Ordinary Work As-Built — 4.0 archive, 4.1 planning, and agent pins

**Record status:** Final
**Recorded:** 2026-09-04
**Contract:** None.
**Contract digest:** None.
**Plan:** None.
**Plan digest:** None.
**Branch:** `development`
**PR:** `#121`
**Record standard:** `docs/workflows/schema/session-as-built.md`

## Delivered outcome

None.

## Divergences from plan

None.

## Final surfaces

- `docs/VERSION_4_1_PLAN.md` — approved 4.1 topology, two session contracts
- `docs/session-contracts/4.1/INDEX.md` — 4.1.1.1 and 4.1.2.1 paths
- `docs/session-contracts/4.1/4.1.1.1.md` — Seats stay put contract
- `docs/session-contracts/4.1/4.1.2.1.md` — What is on the system contract
- `docs/session-plans/4.1/4.1.1.1.md` — approved Seats stay put plan
- `docs/VERSION_4_0_PLAN.md` — closed 4.0 master plan, removed from development
- `.cursor/agents/test-runner.md` — model pin for the local suite seat
- `.cursor/agents/thermo-nuclear-review-subagent.md` — model pin for the thermo seat
- `.cursor/agents/docs-researcher.md` — model pin for the docs seat
- `.cursor/agents/comment-sicko.md` — model pin for the comment seat
- `.cursor/agents/repo-mapper.md` — model pin for the mapper seat

## Discovered work

None.

## Successor notes

- Session 4.1.1.1 still has Ordered work step 7 on development. Its as-built waits for a later close-out.
- Closed 4.0 contracts, plans, and as-builts left `development` in the archive commit. They remain on `main` and on this promote's merge-base until staging moves.
- Dump is GitHub #474.
- After this merge, staging Convex needs `pnpm exec convex run internal/mapStatics:backfillStaticPlaceholders` until `hasMore: false`. `SITE_URL` must be `https://staging.lgi.tools`. Next must be up.

## Verification summary

- **Adversarial review:** Subject: Origin `121`; `origin pr diff 121`; Roles: structure-reviewer, behavior-reviewer, thermos, comment-sicko, Bugbot, Greptile, CodeRabbit; Runtime identity: requested=agent-file-pin, observed=Not observable; Verdict: `PASS`; Disposition: jump-candidate ghosts, apply twin stamp, from-door-only claim, and optimistic mapId plus lifetime accepted and fixed. Missing SITE_URL warn, thermo helper rewrite, CodeRabbit JSDoc pile, JSON key-order, duplicate-static seatKey, codex retry, and hide-rule test restatement rejected.
