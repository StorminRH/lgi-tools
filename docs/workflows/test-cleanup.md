# Keep Tests Tight

Review landed production and test changes against the shared
[testing principles](../contributing/testing-principles.md) and
[end-to-end testing principles](../contributing/end-to-end-testing.md). This
workflow owns work selection, evidence, checkpoints, and draft handling. Those
contributor documents own testing policy for both feature work and cleanup.

This is the prepared direct Cursor automation under
[LGI-115](https://linear.app/lgitools/issue/LGI-115). It targets GitHub
`development` after coordinated cutover. Activation is separate from publishing
this guidance. A useful audit can finish with no changes and no PR.

## Run

1. Read the applicable repository rules, contributor standards, and configured
   Linear checkpoint. Resolve the authoritative repository and development
   branch. A forge mismatch, missing branch, or missing required environment is
   blocked; do not substitute `main` or a stale mirror. Record the automation
   and run identity in Linear. Follow the run-ownership rules below for manual
   starts and interrupted work.
2. Fetch the current development tip and record its SHA. For the first run,
   inspect the preceding 24 hours of landed production and test changes,
   including direct commits. Later runs inspect changes since the last
   completed-SHA checkpoint plus pending items. Include changed behavior even
   when its landing added no test. Deduplicate promotions, mirrors, and earlier
   reviews using source PRs, commits, and actual diffs. Resolve diverged history
   before advancing the checkpoint.
3. Reconcile the existing cleanup draft, review activity, and pending files.
   Preserve human edits and accepted work. Select one coherent cleanup batch
   from runnable changed behaviors. Record overlapping files and their resume
   condition; continue disjoint investigation instead of calling the entire
   range complete. Set a bounded scope before editing.
4. For each selected behavior, name a realistic failure and its existing
   falsifier. Record a Keep, Consolidate, Remove, or Strengthen decision. A
   claim of coverage elsewhere must name the surviving path and test, and the
   required gate that actually executes it. Retain meaningful negative evidence
   for authorization, purge, transactions, concurrency, retries, budgets, and
   public contracts. Preserve house registry, Fallow, ESI-dataset, API-matrix,
   and purge gates unless an explicit replacement is in scope.
5. Make one coherent cleanup. Prefer an explicit setup followed by related
   actions and intermediate/final outcomes. Independent inputs can remain
   table-driven. After joining cases, inspect every assertion for whether a
   prior action could satisfy it. Use fresh factories or reset mock history
   between independent branches, and retain required error injection. A
   preservation assertion needs a distinguishable prior state. Joining test
   blocks without improving evidence or removing repeated setup is not enough.
6. Inspect adjacent exports whose only consumers were removed tests. Use the
   repository mapper to establish actual production and external consumers.
   Make an internal declaration private or remove dead code only when supported
   by that evidence. Keep meaningful scope/public contracts and protected gates.
   Do not retain a meaningless assertion solely to keep an unnecessary export
   alive, or weaken Fallow, coverage rules, baselines, or waivers to force a
   pass. Record larger production redesigns and policy decisions separately.
7. Verify surviving and replacement coverage using the active harness's
   test-runner and the local suite required by `AGENTS.md`. Supply the full
   cumulative unverified diff, focused suites, prerequisites, and reusable
   evidence. Keep noisy output in the runner and return the compact result.
   Real SQL replacements must execute against the established disposable
   PostgreSQL harness; skipped DB tests do not establish equivalent coverage.
   For an uncertain high-risk replacement, demonstrate one representative
   failure it catches. Broad mutation testing is not a daily requirement.
8. Apply the draft rules below, then persist results and the next checkpoint to
   Linear. Make the checkpoint durable before yielding or ending the run,
   including at the time limit. If nothing useful changes, report the bounded
   no-finding result and create no cosmetic PR.

Keep cleanup separate from test-file reorganization. Splitting a large suite
can improve ownership, but it is a different outcome from reducing redundant
coverage or setup. If needed, track that work separately instead of inflating a
cleanup batch. No test, file, line-deletion, or PR quota applies.

## One draft and durable progress

At most one unresolved remediation draft from this automation may exist. Reuse
its branch for a compatible verified batch when no review is active, following
the current delivery workflow. Once review freezes a head, defer new writes
until review is complete. Audit-only work on disjoint scopes may continue and
record findings without creating another draft. Keep findings tied to their
reviewed version. This automation does not merge, promote, deploy, or request
repeated bot reviews to occupy the queue.

Use [LGI-98](https://linear.app/lgitools/issue/LGI-98) as the initial checkpoint
owner after its Test Steward responsibility is transferred. If a successor
record becomes authoritative, link the old and new owners and update the worker
pointer before its next run. Preserve existing history. Keep a short current
index separate from detailed result comments; per-run bookkeeping does not
require repository commits.

The checkpoint contains:

- Automation and run identity; authoritative repository/branch; selected base,
  observed tip, last completed audit SHA, and source PR/commit identities.
- Selected behaviors and paths; reviewed decisions and surviving test evidence;
  last completed step and remaining investigation boundary.
- Pending or blocked files, source ranges, reasons, linked owners/drafts, and
  reassessment triggers. Include overlapping files even when other work lands.
- Draft status and version; audit completion separately from fix completion.
- Actual verification, reused evidence references, gaps, and next runnable work.

Advance the completed-SHA checkpoint only through completed review coverage.
Keep later completed decisions so a blocked earlier item does not cause their
repeated audit. New landed work remains eligible while that item is blocked.
Retain pending entries until their scope is reviewed or an accepted disposition
resolves it. On interruption, reconcile changed source and resume from the saved
boundary. A merged draft does not imply that omitted files were audited; a
closed-unmerged draft does not mean its findings were fixed.

Cursor's schedule owns recurring active-run exclusion for this automation.
It skips a scheduled fire while the previous run remains active and releases
that exclusion when the run completes. The 2026-09-09 scheduler probe
corroborated this with a 150-second command that exited 0 and no second run at
the intervening two-minute tick. This is scheduler proof, not a cleanup trial
or proof of every failure/recovery mode. There is no worker acquire/release
API to call.

Manual Test/Play starts are outside that proof. Before a manual start, the
operator must establish that no run is active and control the start so a
scheduled fire cannot overlap it. A stale or unknown run state blocks takeover
until its worker is confirmed ended; a final response alone is insufficient
while runtime status still shows Running. Use the recorded run identity to
recognize duplicate delivery. Scheduler completion releases exclusion even
when work is partial or failed; only the durable checkpoint establishes audit
coverage and the next runnable work.

## Evidence and reporting

Return source PRs and SHAs, scope, Keep/Consolidate/Remove/Strengthen decisions,
surviving behavior evidence, verification, and deferred work with reasons.
Name the concrete failure each strengthened or replacement test can catch.
Report a no-finding result as applying to that scope and revision under its
stated limits, not as a certification of the whole suite.

Follow `AGENTS.md` and the active harness's `test-runner` contract for the
required local suite, focused tests and result format. Keep full coverage
before any coverage-fed Fallow check. Record the tested revision. Historical
evidence retains its original scope and does not replace the required suite
or current-head GitHub checks.

Report each selected command's actual result as PASS, FAIL, BLOCKED, or NOT
REQUIRED. An unexecuted or skipped replacement is not a fresh pass. Record exact
tested revision and relevant dirty state without secrets. Only claim runtime
savings from comparable measurements that distinguish test execution from setup
and queue time. Counts can describe a diff; they do not establish quality.

## Transition and activation

The original [GitHub #361](https://github.com/StorminRH/lgi-tools/pull/361)
procedure is recoverable at commit `279f14cc` as
`docs/workflows/keep-tests-tight.md`. Commit `2a669455`, GitHub #362, deleted it.
Its old UI pointer is therefore not a usable current instruction. This workflow
preserves the useful recent-change review procedure and deliberately changes
its branch, checkpoint, shared-policy, and verification routing.

Before enabling the replacement, reconcile the live state and diff of Origin
150 and preserve any valid draft work, including its old-to-new PR mapping.
Retire only the old Test Steward cleanup cron and standing assignment; leave
unrelated agents and tasks intact. Update LGI-98, Project Lead, and house-guide
ownership so the old worker cannot commission overlapping cleanup.

Coordinate activation with [LGI-116](https://linear.app/lgitools/issue/LGI-116).
Require accepted GitHub repository access and the Cursor environment, including
actual local PostgreSQL provisioning. Confirm native tool permissions,
persistent checkpoint access, explicit model selection, and usage settings.
The supported Copy as JSON export verifies the saved GitHub environment
`0a58f99f-9e20-11f1-a7d1-d6b4613131ce` and cron `0 9 * * *`.
The chosen cadence is daily at 09:00 UTC, which is 05:00 New York time in EDT
and 04:00 in EST. The observed editor offers UTC cron only; no IANA timezone
or daylight-saving control was observed. This fixed UTC schedule is the
selected setup, replacing the proposed year-round 05:00 New York slot. Do not
add duplicate daily runs with timezone filters. The automation remains saved
and inactive pending acceptance. Cursor usage is separate from GitHub CI cost.

Run a manual Cursor trial under the run-ownership rules before recurring
activation. Verify the saved prompt after reload and in the actual trial;
editor readback alone did not establish the executed prompt in the scheduler
probe. A ChatGPT automation is not a substitute for this execution environment.
The historical Cursor dashboard configuration was not recovered, so do not
claim its exact prompt, model, or
permissions. Review the first three useful runs for landed-change coverage,
meaningful failures, reduced redundant work, draft coordination, verification,
and usage. After backlog cleanup and clean cycles, reduce repeated unchanged
scope review while retaining changed-code checks and periodic broader coverage.

## Preparation dry-runs

These source walkthroughs were inspected at repository revision `167f4db5`.
They are static checks of the procedure, not executed tests or Cursor trials.

| Scope | Evidence and decision |
| --- | --- |
| Historical GitHub #364, commit `d7383e66` | The `scripts/ux-capture-args.test.mjs` patch tests invalid input after setting `settle` to 2500, then separately accepts zero. Keep that distinguishable prior value. The `src/data/eve-news/queries.test.ts` patch clears `cacheLife` mock history before HTTP-error and malformed-body legs. Keep those resets so the preceding leg cannot satisfy later assertions. These are strengthened falsifiers, not proof from a lower test count. |
| Historical organization, commit `9a0303de` | Its change record explicitly says the mapAuthoring cases moved into five suites without consolidation. Classify this as file organization. Do not count it as tighter behavioral coverage or measured runtime improvement. |
| Recent range `7350cd56..167f4db5` | `scripts/dev/bootstrap.test.mjs` clears inherited database/auth selector variables for the preparation fixture and registers `vi.unstubAllEnvs()` cleanup. Keep the fixture isolation: it prevents runner configuration from replacing the local fixture's intended state. This is executable tooling coverage, so it is not a prose-only verification exemption. No additional cleanup follows from the inspected narrow delta. |

The recent probe covers that exact delta, not the full preceding 24 hours.
Runtime behavior, full-range coverage, existing-draft reconciliation, durable
checkpoint writes, unavailable-environment handling, and interruption/resume
still need the manual Cursor trial. A clean trial must advance covered work
without creating a PR. Compare decisions and surviving behavior, not deletions.

## Cursor UI prompt

Use this short pointer only after the activation prerequisites are satisfied:

> Follow `docs/workflows/test-cleanup.md` in the authoritative LGI.tools
> repository and its configured Linear checkpoint, initially LGI-98. Review the
> next landed production/test changes using the shared contributor testing
> standards. Follow the workflow's evidence, checkpoint, concurrency, and draft
> rules. Return the compact result, including pending work. A no-finding result
> creates no PR. Do not merge, promote, or deploy.
