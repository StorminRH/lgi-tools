# Delivery

This is the prepared GitHub procedure for LGI-113/LGI-115. Activate it only
with the coordinated LGI-116 cutover acceptance. Preparation does not retire
the live forge or authorize a merge/deployment. Historical Origin records
retain their forge identity; the Git remote alias `origin` is independent.

After activation, `StorminRH/lgi-tools` on GitHub owns source and one PR per
change. Linear owns work tracking, current handoffs and append-only delivery
receipts. Read the selected CI workflow and repository policy manifest;
provider choice does not change the gates below. Public intake follows the
established project contact route; accepted work is tracked in Linear.

## Prepare the candidate

1. Resolve authority, repository, source branch and destination. Fetch both
   tips. Ordinary work targets `development`; promotion is `development` →
   `staging`; release is `staging` → `main`. Every merge onto `staging` or
   `main` uses `close-out`. Preserve explicit scope and operator pauses.
2. Open or reuse the actual draft GitHub PR early enough to obtain its
   number. Pass repository, head and base explicitly to `gh pr create`.
   The whole PR is the review subject, including guidance and CI files.
   Use the PR template and `delivery scrub-pr-body --check` before publish.
   Accumulating drafts remain draft until their finishing cycle.
3. Run `lifecycle count-app-facing` against the intended base/head.
   Promotion is due at 80 app-facing files versus staging; an authorized
   earlier promotion is valid. Count is a sizing signal, with no hard cap
   and no path filtering of reviews. Required final-plan/record delivery
   still applies below the threshold.
4. Run `no-comments`: its seat reports candidates; the parent applies
   accepted in-scope edits. Finish release metadata and candidate as-built
   records before freeze. For staging, follow the session-as-built schema;
   link partial deliveries so final records/changelogs do not count them
   twice. For main, reconcile `APP_VERSION` with the delivered lifecycle
   identity and author the public changelog using its schema. Run the
   release reconciliation check. Record format 2 keeps candidate outcomes
   and rationale in git; final criterion/review/CI proof belongs in Linear.
5. Select and obtain applicable local evidence using
   [verification](verification.md). Publish the complete candidate head.
   Metadata or comment edits invalidate only their relevant evidence.

## Freeze, review and adjudicate

6. Record repository, PR URL/number, base branch and SHA, head branch and
   SHA, and authority. Keep source/base identity fixed throughout the
   review window. Reviewers use `gh pr diff <N> --repo StorminRH/lgi-tools`
   and read files at those exact revisions. A moving base/head invalidates
   that freeze; do not quietly combine verdicts from different subjects.
7. Run `adversarial-review` for structure, behavior and both thermo seats.
   Preserve native model pins and permissions; every required seat returns
   a final verdict. Request the configured bots once on this deliberate
   revision. Verify actual open/draft-push/ready/fix-push trigger behavior:
   draft status alone does not establish suppression. Finish bot setup and
   trigger rehearsal before relying on this procedure during cutover.
8. Wait for all seats and requested bots to settle, then collect and
   deduplicate findings by cause. One adjudication/fix batch follows the
   settled window. Record each disposition with evidence on the actual PR;
   resolve threads only when their finding is addressed or explicitly
   rejected. Pause on unresolved material risk, disputed product behavior,
   or deferral of a confirmed defect. Preserve existing operator approvals.
9. Push accepted corrections as one batch. Obtain affected local proof and
   fresh scoped review for material fixes; establish the new whole-PR
   head/base identity for final acceptance. Explain any explicit bot
   follow-up; old bot evidence cannot cover new code by implication.
   A new finding/failure starts another settled batch, not interleaved
   writes while reviewers are still working.

## Prove and land

10. Once reviews settle and local evidence applies, run the selected final
    CI workflow on the current PR subject. Require current successful
    `verify`, `build` and `e2e` checks under the configured policy. Record
    run/check URLs, provider identity, source head, base and actual tested
    SHA. Distinguish the GitHub PR merge-ref SHA from source head; prove
    the tested ref contains the current head/base pair. Missing, blocked,
    cancelled, stale or failed checks block merge. Diagnose a red result,
    batch corrections, refresh affected reviews and run final CI again.
11. Run `python3 tools/cli.py delivery check-record <record>` offline.
    Follow [record format 2](schema/session-as-built-v2.md) and the
    [receipt schema](schema/delivery-receipt.md); candidates remain Candidate
    permanently. Persist the final criterion, review, disposition and CI
    receipt in Linear before merge. Read that comment back through the
    authenticated Linear connector; retain its raw id, body and issue
    identifier. Then validate it against live GitHub evidence with
    `python3 tools/cli.py delivery check-receipt --record <record>
    --comment-file <raw-comment.json> --comment <UUID> --stage pre-merge`.
    The CLI independently checks GitHub evidence; the caller establishes
    fresh authenticated Linear provenance and local-proof applicability.
    A URL or a self-asserted PASS is insufficient. Keep source unchanged
    after final proof. An intervening source/base change returns to the
    affected gates. Check merge authority and unresolved review threads.
12. Merge the GitHub PR with the authorized method preserving integration
    ancestry. Verify the destination contains the reviewed head. After
    promotion, `development` contains `staging`; after release, `staging`
    and `development` contain `main`. Fast-forward when possible. If a
    merge commit needs propagating, use the configured reviewed resync
    path; never reset/force-push away ancestry or start gratuitous bot
    passes. Insufficient token permissions return `BLOCKED` with the PR open.
13. Append merge and required deployment proof to the Linear receipt after
    those events. Verify deployed revision, schema/migration/backfill and
    environment behavior relevant to the change. A merged PR alone does
    not prove deployment. Complete any operator visual/test pause; a
    promotion alone does not approve the UI. Before destructive lifecycle
    archive, require validated final receipts and archive pre/post gates.
    Remove only the authorized source branch once durable handoff evidence
    and integration ancestry are established.

Return `LANDED`, `PROMOTED`, `RELEASED`, or `BLOCKED` with PR, exact
revision, proof/receipt links, ancestry and any outstanding required action.
A preparation or review-only request stops at its authorized boundary.

## Environments

A development Preview is manual. It uses Neon `preview/development`
(3-day TTL, compute policy in `neon.ts`) and Convex `preview/development`.
Delete its Neon branch, Convex deployment and Vercel Preview when the test
cycle ends. Staging uses Neon `staging`, Convex `staging`
(`proper-squid-200`) and `https://staging.lgi.tools`; EVE callback is
`https://staging.lgi.tools/api/auth/oauth2/callback/eve`.

`vercel.json` owns automatic deployment branches; `main` is Production.
Neon project is `lively-mode-73649525`; use role `neondb_owner`. Protected
Neon changes require the explicitly authorized protected-branch path.
Convex team/project is `stormin-s-projects` / `lgi-tools`. Local/anonymous
operations use `pnpm exec convex`; hosted preview teardown uses the HTTP
API with a team token or PAT, never `CONVEX_DEPLOY_KEY`:

```text
GET  https://api.convex.dev/v1/teams/stormin-s-projects/projects/lgi-tools
GET  https://api.convex.dev/v1/projects/<numeric-id>/list_deployments?deploymentType=preview
POST https://api.convex.dev/v1/deployments/<animal-name>/delete
```

Verify the animal-name deployment belongs to the intended preview before
deleting it. Ending Vercel Preview does not stop Convex. Read
[development environments](../development-environments.md) for local/cloud
setup and capability readiness; keep credentials transient and out of logs.
