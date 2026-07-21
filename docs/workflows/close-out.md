# Close-out procedure

This is the canonical end-to-end close-out procedure. Runtime skills adapt this
sequence and retain only their native task-list and background-process syntax.

Before acting, create one native runtime task list from every applicable step.
Keep exactly one item active, attach evidence before completing it, and reopen
only verification items that a later change actually invalidates. Moving to the
next section, editing a PR body, or adding a lifecycle-only status commit does
not by itself invalidate current-head test evidence.

## End-of-session review and local proof

1. Fix every in-scope problem discovered during the session on the current
   sub-version branch. Defer only work that is genuinely outside the whole
   sub-version, and record that work once in `docs/backlog.md` with what, why,
   rough size, and its dependency or trigger.
2. Run the session judgment review against the session diff. These checks are
   mandatory every session and happen before the final mechanical gates; when a
   check is irrelevant, record that its surface was not touched.
   1. **Scope discipline.** Remove work the approved session did not need. The
      final-session design review owns interface depth, semantic duplication,
      and whole-branch change amplification, so do not repeat those audits here.
   2. **Data placement.** For every added or moved ESI-fed dataset, confirm its
      declaration, upstream cache time, authoritative store, freshness owner,
      key shape, purge coverage, and regenerability. Convex remains derived and
      never writes to Neon; timer-like state remains an absolute end timestamp.
   3. **Rendering mode.** For every added or changed route, reason from the most
      static honest mode, keep request data inside Suspense boundaries, and
      reconcile both the route mode and its reason in
      `scripts/route-classification.json`. Production-mode builds remain
      forbidden before merge.
   4. **Interactive UI.** Confirm each interaction uses the adopted library and
      the shared wrapper in `src/components/ui/`, respects repository styling
      rules, and matches its keyboard, pointer, and touch affordance.
   5. **Public-document truth.** Recheck any affected claims in `README.md`,
      `CONTRIBUTING.md`, `SECURITY.md`, `.github/`, `.env.example`, and the
      `/legal` surface. Correct small drift in-branch and raise a material scope
      conflict instead of shipping misinformation.
3. Verify the changed behavior on the local development surface while the
   server is still running. Use the local Docker database or direct API checks
   as appropriate, and use a manual preview only when local data cannot
   represent the behavior. Never run `pnpm build`, `next build`,
   `pnpm vercel-build`, or another production-mode build before merge.

## Session memory and the final-session fork

One sub-version uses one branch and one eventual PR; multiple scoped sessions
may contribute verified commits before that PR opens.

1. Decide whether another approved session remains in the sub-version.
2. If more sessions remain, skip the pre-PR design review and continue at
   **Finalize and verify the current head**. After that section's commit-and-push
   evidence exists, change the approved plan's `Execution status` from `Pending`
   to `Complete`, point `docs/SCRATCHPAD.md` at the next session, and make the
   required lifecycle commit and push. A lifecycle-only status commit does not
   rerun application tests. Stop without opening a PR.
3. If this is the final session, leave its execution status `Pending` through
   review and merge. Continue only when the sub-version works end to end,
   depends on nothing unmerged, and is reviewable as one cohesive change.
4. Read the final session contract's `UX gate` marker. `Yes` is the authority to
   pause for the operator's local-browser review now, while the verified local
   server remains available; `No` skips that pause. For work outside the
   lifecycle with no applicable marker, use judgment to decide whether behavior
   or appearance requires the same review.

## Pre-PR design-review gate

This section runs only for the final session and owns the whole-branch design
judgment. It does not repeat the session-level data-placement, rendering, UI, or
public-truth review.

1. Invoke the pre-pr-design-review skill against the complete sub-version diff.
   Supply the completed implementation, focused checks, and local/UX proof as
   its readiness evidence; the final full definition-of-done gate deliberately
   follows this review so any design fix is included in the tested head.
2. Review interface depth, information ownership, change amplification,
   rationale, test design, and bounded cleanup across the complete branch. Fix
   every in-scope finding before continuing.
3. If a measured hotspot surface changed, reconcile
   `docs/CODE_HEALTH_BASELINE.md` as required by the design review. The
   design-review and version-audit procedures own the measurement and overwrite
   mechanics; do not reproduce them here.
4. Finalize every delivery record that would otherwise create a later commit:
   prepend the sub-version entry using
   `docs/workflows/schema/changelog-entry.md`, bump `APP_VERSION` to the same
   version, and prepare the concise design result for the PR's `## Notes`.
   Complete these changes before the final current-head gates and before opening
   the PR.

## Finalize and verify the current head

This is the single full verification checkpoint for the completed session head.
Do not repeat it at the pre-PR or PR-opening boundary when the head is unchanged.

1. Shut down the Next.js and local Convex development processes after all agent
   and operator local review is finished, confirm their ports no longer answer,
   and clear `.next`. Leave the small persistent Docker Postgres service running
   unless the session has another reason to stop it. The historical dev-cache
   failure analysis is archived at
   `../LGI Tools Document Archive/DEV_PERF_DIAGNOSIS.md`.
2. Reconcile only deliberately ignored local state touched by the session:
   runtime-local settings and worktrees, generated reports or captures,
   temporary PR body files, `.codegraph/`, and comparable declared local
   artifacts. Remove credential-bearing permissions and session-only output;
   tracked guides, skills, hooks, workspace docs, and `.agent-local/` utilities
   ship normally.
3. Run the sole coverage-backed definition-of-done checkpoint once on the
   finalized head:

   ```bash
   FALLOW_AUDIT_BASE=$(git rev-parse origin/main) pnpm verify
   ```

   This runs typecheck, zero-warning lint, one coverage-enabled Vitest suite,
   and coverage-backed Fallow. Fix failures with meaningful behavioral coverage
   or a simpler design and rerun the invalidated gate after a fix. A failure
   leaves `coverage/` available for diagnosis; remove it only after the final
   successful pass so no later session can reuse stale attribution. Entering a
   later workflow section does not make current-head evidence stale.
4. Run `python3 .agent-local/check_baseline_claims.py --pretty` and `python3
   .agent-local/check_watch_triggers.py --pretty` after any design-review
   baseline reconciliation. Reconcile every final-session baseline warning or
   explain it in the PR notes, and surface every `promote AF-NNN` result to the
   operator; neither checker promotes findings.
5. Run conditional workflow checks at their owning boundary: agent drift after
   changing shared guides, skills, hooks, or workflow policy; document references
   after changing live documentation; and any session-plan-specific checker the
   approved plan names. Do not turn an unrelated docs-only handoff into another
   application test run.
6. Commit the verified session scope in the repository's plain-English style and
   push the sub-version branch. No preview is created automatically.
7. Update `docs/SCRATCHPAD.md` with only durable discoveries the roadmap and
   contract cannot know. Remove shipped or superseded detail and keep deferred
   work only in `docs/backlog.md`. Follow the fork above: a non-final session
   completes its plan and stops; a final session leaves its plan pending and
   continues to the PR.

## The PR and Greptile loop

1. Before opening the PR, confirm the verification evidence names the current
   head. If the head has not changed since **Finalize and verify the current
   head**, reuse that evidence and do not rerun the test suite or coverage.
2. Open one PR from the sub-version branch to `main`. Describe the coherent
   project outcome, not a file list, using these headings in order:
   `## What this does`, `## Why`, `## Notes`, and `## Test plan`. Record the
   existing verification as past-tense evidence.
3. Privacy-scrub the title and body. Exclude personal names, email addresses,
   account handles, machine names, local paths, browser-profile details, and
   private identifiers; describe human review role-neutrally.
4. Prepare the full Markdown body in a temporary file. Before publishing, run
   `python3 .agent-local/check_release_consistency.py --check --expect pre-pr`
   and `python3 .agent-local/scrub_pr_body.py --check --body-file <body-file>
   --title "<title>"`. After publishing, read the GitHub body back into a
   temporary file and run the scrub again before polling. PR-body edits do not
   invalidate repository verification.
5. Start the runtime's native background task for
   `.agent-local/poll_pr_gate.py` as soon as the PR opens, and continue useful
   close-out work while it runs. The helper owns waiting for current-head
   Greptile 5/5 with zero current-head inline findings or for the PR checks to
   finish; do not reproduce its polling recipe in prose or shell.
6. Triage every Greptile finding, including non-blocking and stylistic findings:
   1. **Fix** an in-scope problem on the branch, commit it, and explicitly
      re-trigger Greptile with `@greptileai`.
   2. **Justify** a deliberate choice by replying `@greptileai` with the
      reasoning, then wait for Greptile's answer. Never merge while a
      justification awaits a reply; because no commit changed, use the runtime
      adapter's inline-reply watch rather than treating the unchanged head SHA
      as a new pass.
   3. **Defer** only genuinely out-of-sub-version work to `docs/backlog.md` with
      its reason, size, and trigger, then explicitly re-trigger review.
7. Repeat the poll, triage, fix, and explicit re-trigger cycle until every
   finding is resolved. Later review passes may raise new findings, so each pass
   is evaluated on its own live result.
8. Rerun only the evidence invalidated by a review fix. Production or test code,
   executable scripts, package or lockfile changes, and TypeScript, ESLint,
   Vitest, coverage, or Fallow configuration invalidate the full checkpoint. A
   prose-only workflow document, lifecycle record, or PR-metadata change runs
   only its applicable document, release, drift, privacy, or diff checks.
   Push the fix only after the required current-head evidence is green, then
   repeat Greptile review against that head.

## Merge

1. Declare the PR review-ready only when the live Greptile result is 5/5 and
   zero Greptile inline comments remain. A score alone is not sufficient.
2. Use `.agent-local/merge_clean_pr.py` as the gate of record. It owns the final
   fail-closed live revalidation and expected-head squash merge, and deletes the
   remote branch after a successful merge; do not restate or manually substitute
   its internal checklist.
3. If an accepted or resolved finding leaves a Greptile inline comment that the
   helper rejects, stop and escalate to the operator. Do not merge around the
   fail-closed result.

## After merge and resolver handoff

1. Clean up the local feature branch and tear down any manual Vercel preview and
   its Neon branch created for the work. The merge helper owns remote-branch
   deletion; close-out owns this local and optional-preview cleanup.
2. Resolve the production deployment by the merge SHA and wait until that exact
   deployment reports Ready. Inspect deployment state and runtime logs with the
   Vercel CLI.
3. Use a real browser as the production review surface. Confirm the shipped
   version, affected routes, expected authentication and admin gates, and a clean
   browser console. Scripted HTTP checks are supplemental, not the primary
   production proof.
4. Only after the exact deployment and browser proof succeed, prepare the
   post-merge lifecycle reconciliation locally: mark the final session plan's
   `Execution status` as `Complete`, record the actual PR and merge evidence in
   the terminal roadmap row, and reduce the sub-version to its durable
   SCRATCHPAD ledger entry.
5. Do not commit or push that reconciliation during close-out, and do not choose
   or cut the next branch. Rerun
   `python3 .agent-local/resolve_development_state.py --pretty`, report its full
   directive, and return control to `start-session`.
6. A fresh `start-session` uses the resolver's `directive.branch` authority to
   create the branch for the next action, makes the carried reconciliation that
   branch's first commit, and requires `python3
   .agent-local/check_release_consistency.py --check --expect reconciled` to
   pass. The intentional one-PR document lag never justifies a follow-up PR or a
   direct push to `main`.
7. If the merge made every master-plan row terminal, leave the active plan,
   contracts, session plans, and SCRATCHPAD in place. Close-out does not archive
   the version or select its next audit action; the resolver owns that decision.
