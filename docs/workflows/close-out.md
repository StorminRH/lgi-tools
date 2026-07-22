# Close-out procedure

This is the sole end-to-end close-out sequence. It runs one delivery pipeline in
one of two modes. Runtime skills supply only native task-list and
background-process mechanics.

## Mode selection

The discriminator is the resolver directive passed in by `start-session`, never
the current branch name.

- **Planned mode** when `start-session` dispatched this close-out with a valid
  resolver `session-ready`/`execute` directive — its `handler` is `start-session`
  and its `branch` names the sub-version's `lifecycle/<sub-version>` branch.
  Planned mode owns the version, roadmap, session-plan, and pending-fragment
  absorption work.
- **Ordinary mode** on any direct invocation ("close out", "ship it") with no
  such directive. The absence of a resolver directive is normal and is not an
  error. Ordinary work never runs the resolver or the release-consistency
  checker and never edits `APP_VERSION`, a public version heading, roadmap
  state, or session execution state; it records exactly one pending changelog
  fragment instead.

Do not re-run the resolver to decide the mode, and never infer the mode from a
branch prefix. Planned work resumed in a later session must re-enter through
`start-session`, which re-selects the mode.

Steps below are marked **(shared)**, **(planned)**, or **(ordinary)**. Shared
steps run in both modes.

## Execution contract

Required inputs:

1. **(planned)** The resolver directive, approved contract and plan, and
   master-plan status.
2. **(shared)** Focused behavior, local, and UX evidence required by the changed
   surface, plus the complete branch diff.
3. **(shared)** Current design-review, release, health-baseline, and
   workflow-policy state.

Required outputs are exactly one of:

- `SESSION_HANDOFF` **(planned)**: another approved session remains in the
  sub-version; the verified scope is committed and pushed to the lifecycle
  branch, its session plan reads `Execution status: Complete`, the durable
  handoff points to the next session, and no PR is opened.
- `MERGED` **(shared)**: the change passes design review and verification, the PR
  is reviewed and merged through the gate of record, and exact production proof
  is complete. In planned mode the merged PR already carries the truthful
  post-merge lifecycle state; in ordinary mode one valid pending changelog
  fragment is the only durable lifecycle record.
- `BLOCKED` **(shared)**: a named operator gate, scope conflict, failed mandatory
  check, or external-state condition prevents a truthful handoff or merge.

Stop with `BLOCKED` rather than bypassing, weakening, or substituting for a gate.
Do not infer approval for a merge, deployment, promotion, production mutation,
or destructive recovery beyond the runtime skill's explicit authorization.

Before acting, create one native runtime task for each applicable phase below
and one final result task. Keep exactly one task active. Attach the phase's
required evidence before completing its task; a bare assertion such as
"checked" or "looks good" is not evidence. Reopen only phases and verification
invalidated by a later change. Moving to another phase, editing PR metadata, or
adding a lifecycle-only status commit does not invalidate current-head
application evidence.

## End-of-session review and local proof (shared)

1. Fix every in-scope problem discovered during the session on the current
   branch. Defer only work that is genuinely outside the change, and record that
   work once in `docs/backlog.md` with what, why, rough size, and its dependency
   or trigger.
2. Run the session judgment review against the session diff. These checks are
   mandatory every session and happen before the final mechanical gates; when a
   check is irrelevant, record that its surface was not touched.
   1. **Scope discipline.** Remove work the change did not need. The pre-PR
      design review owns interface depth, semantic duplication, and whole-branch
      change amplification, so do not repeat those audits here.
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

Phase evidence: disposition of every session finding, one verdict for each
judgment-review surface, and the focused/local/UX proof or explicit
not-applicable reason.

## Session memory and the final-session fork (planned)

This section runs in planned mode only. One sub-version uses one lifecycle branch
and one eventual PR; multiple scoped sessions may contribute verified commits
before that PR opens. Ordinary mode has no session-plan status, no next-session
pointer, and no final-vs-non-final fork — it always proceeds toward a single PR;
skip to **Pre-PR design-review gate**.

1. Determine from the approved contract index, master-plan row, and session
   plan whether another approved session remains in the sub-version. Record the
   next session id or `Final session`; do not infer from branch age or filenames.
2. If more sessions remain, skip the pre-PR design review and continue at
   **Finalize and verify the current head**. After that section's commit-and-push
   evidence exists, change the approved plan's `Execution status` from `Pending`
   to `Complete`, point the durable handoff (`docs/SCRATCHPAD.md`) at the next
   session, and make the required lifecycle commit and push to the lifecycle
   branch. A lifecycle-only status commit does not rerun application tests. Stop
   without opening a PR (`SESSION_HANDOFF`).
3. If this is the final session, the sub-version's whole state ships inside its
   one PR. Continue only when the sub-version works end to end, depends on
   nothing unmerged, and is reviewable as one cohesive change. The final session
   is marked `Execution status: Complete` during **Pre-PR design-review gate**
   version finalization, before the PR opens — not after merge.
4. Read the final session contract's `UX gate` marker. `Yes` is the authority to
   pause for the operator's local-browser review now, while the verified local
   server remains available; `No` skips that pause.

Phase evidence: `Remaining session: <id>` or `Final session`, the applicable UX
gate value, and any operator-review outcome. A required operator review that has
not completed returns `BLOCKED`.

## Pre-PR design-review gate

This gate runs before any PR opens: for the final planned session and for
ordinary work, each of which is a complete, reviewable change. Non-final planned
sessions skip it (per the fork above). It owns the whole-branch design judgment
and does not repeat the session-level data-placement, rendering, UI, or
public-truth review.

1. **(shared)** Invoke the pre-pr-design-review skill against the complete diff.
   Supply the completed implementation, focused checks, and local/UX proof as its
   readiness evidence; the final full definition-of-done gate deliberately
   follows this review so any design fix is included in the tested head.
2. **(shared)** Review interface depth, information ownership, change
   amplification, rationale, test design, and bounded cleanup across the complete
   diff. Fix every in-scope finding before continuing.
3. **(shared)** If a measured hotspot surface changed, reconcile
   `docs/CODE_HEALTH_BASELINE.md` as required by the design review. The
   design-review and version-audit procedures own the measurement and overwrite
   mechanics; do not reproduce them here.
4. Finalize every delivery record that would otherwise create a later commit,
   before the final current-head gates and before opening the PR:
   - **(ordinary)** Create exactly one valid pending changelog fragment for the
     shipped work in `content/changelog/pending/`, following
     `docs/workflows/schema/changelog-pending.md`. Do not bump `APP_VERSION`,
     write any `### vX.Y.N` heading, edit the roadmap, or touch session execution
     state. Prepare the concise design result for the PR's `## Notes`.
   - **(planned, final session)** Safely synchronize with current `origin/main`
     (fetch and integrate without discarding local work) so any pending fragments
     already merged there are present locally. Then freeze the release candidate:
     absorb every pending fragment present at this cutoff into the new
     `### vX.Y.N` entry per `docs/workflows/schema/changelog-pending.md` (ordered
     by `date` then file name, grouped by category, each folded bullet marked so
     the site does not imply it first deployed with the rollup), delete the
     consumed fragment files in this same PR, prepend the new entry using
     `docs/workflows/schema/changelog-entry.md`, bump `APP_VERSION` to that
     version, set the delivered sub-version's roadmap row to its terminal status,
     mark the final session plan `Execution status: Complete`, and prepare the PR
     `## Notes`. Anything merged into the inbox after this cutoff stays pending
     for the following planned release.

Phase evidence: the exact `PASS` result returned by the pre-PR design-review
procedure, reconciled hotspot/baseline state or a not-applicable verdict, and —
per mode — the created pending fragment path (ordinary) or the finalized
changelog, absorbed-fragment list, `APP_VERSION`, terminal roadmap row, final
session status, and PR design notes (planned).

## Finalize and verify the current head (shared)

This is the single full verification checkpoint for the completed head. Do not
repeat it at the pre-PR or PR-opening boundary when the head is unchanged.

1. Inspect the finalized diff against the change's scope — the session contract
   and approved plan in planned mode, or the direct request in ordinary mode —
   plus prohibited surfaces. Remove anything outside those boundaries, confirm
   every required surface is present, and screen all tracked content for personal
   information before mechanical verification begins.
2. Run every cheap workflow check that can still lead to an edit: agent drift
   after changing shared guides, skills, hooks, or workflow policy; document
   references after changing live documentation; the pending-changelog checker
   whenever a fragment changed; the read-only baseline-claims and watch-trigger
   reporters; and any specialized checker named by the approved plan. **(planned)**
   also run release consistency. Ordinary mode does not run release consistency.
   Fix or reconcile every finding before the definition-of-done checkpoint;
   surface every `promote AF-NNN` result to the operator because neither reporter
   promotes findings itself.
3. Shut down the Next.js and local Convex development processes after all agent
   and operator local review is finished, confirm their ports no longer answer,
   and clear `.next`. Leave the small persistent Docker Postgres service running
   unless the session has another reason to stop it.
4. Reconcile only deliberately ignored local state touched by the session:
   runtime-local settings and worktrees, generated reports or captures,
   temporary PR body files, `.codegraph/`, and comparable declared local
   artifacts. Remove credential-bearing permissions and session-only output;
   tracked guides, skills, hooks, workspace docs, and `.agent-local/` utilities
   ship normally.
5. Run the sole coverage-backed definition-of-done checkpoint once on the
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
6. After the successful checkpoint, make a read-only confirmation that the
   worktree still matches the preflighted scope and that no application, test,
   executable, dependency, or verification-configuration change occurred after
   it. Any such change invalidates the checkpoint and returns to the applicable
   preflight and verification steps; a lifecycle-only record does not.
7. Commit the verified scope in the repository's plain-English style and push the
   branch. No preview is created automatically.
8. Update `docs/SCRATCHPAD.md` with only durable discoveries the roadmap and
   contract cannot know. Remove shipped or superseded detail and keep deferred
   work only in `docs/backlog.md`. **(planned)** follow the fork above: a
   non-final session completes its plan and stops; a final session has already
   set its plan `Complete` during finalization and continues to the PR.

Phase evidence: finalized-diff boundary verdict, output from every applicable
cheap workflow check, the successful pinned `pnpm verify` result tied to the
verified head, read-only no-change confirmation, commit SHA, push result, and
the lifecycle-memory disposition.

## The PR and Greptile loop (shared)

1. Before opening the PR, confirm the verification evidence names the current
   head. If the head has not changed since **Finalize and verify the current
   head**, reuse that evidence and do not rerun the test suite or coverage.
2. Open one PR from the branch to `main`. Describe the coherent project outcome,
   not a file list, using these headings in order: `## What this does`, `## Why`,
   `## Notes`, and `## Test plan`. Record the existing verification as past-tense
   evidence.
3. Privacy-scrub the title and body. Exclude personal names, email addresses,
   account handles, machine names, local paths, browser-profile details, and
   private identifiers; describe human review role-neutrally.
4. Prepare the full Markdown body in a temporary file. Before publishing, run
   `python3 .agent-local/scrub_pr_body.py --check --body-file <body-file>
   --title "<title>"`, and **(planned)** additionally run
   `python3 .agent-local/check_release_consistency.py --check --expect reconciled`
   — the final PR already carries the delivered sub-version's terminal roadmap
   row and matching `APP_VERSION`, so its release identity is `reconciled`.
   Ordinary mode does not run release consistency. After publishing, read the
   GitHub body back into a temporary file and run the scrub again before polling.
   PR-body edits do not invalidate repository verification.
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
   3. **Defer** only genuinely out-of-scope work to `docs/backlog.md` with its
      reason, size, and trigger, then explicitly re-trigger review.
7. Repeat the poll, triage, fix, and explicit re-trigger cycle until every
   finding is resolved. Later review passes may raise new findings, so each pass
   is evaluated on its own live result.
8. Rerun only the evidence invalidated by a review fix. Production or test code,
   executable scripts, package or lockfile changes, and TypeScript, ESLint,
   Vitest, coverage, or Fallow configuration invalidate the full checkpoint. A
   prose-only workflow document, lifecycle record, or PR-metadata change runs
   only its applicable document, release, drift, privacy, pending-changelog, or
   diff checks. Push the fix only after the required current-head evidence is
   green, then repeat Greptile review against that head.

Phase evidence: PR URL, published title/body scrub result, current head SHA,
green CI result, current-head Greptile score, unresolved-finding count, and the
disposition of every review finding. Any pending justification returns
`BLOCKED`.

## Merge (shared)

1. Declare the PR review-ready only when the live Greptile result is 5/5 and
   zero Greptile inline comments remain. A score alone is not sufficient.
2. Use `.agent-local/merge_clean_pr.py` as the gate of record. It owns the final
   fail-closed live revalidation and expected-head squash merge, and deletes the
   remote branch after a successful merge; do not restate or manually substitute
   its internal checklist.
3. If an accepted or resolved finding leaves a Greptile inline comment that the
   helper rejects, stop and escalate to the operator. Do not merge around the
   fail-closed result.

Phase evidence: successful `merge_clean_pr.py` result, expected pre-merge head,
actual merge SHA, and remote-branch deletion result. A rejected helper result
returns `BLOCKED`.

## After merge and production proof (shared)

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
4. After the exact deployment and browser proof succeed, close out by mode:
   - **(ordinary)** Stop with `MERGED`. Do not run the resolver, do not mark any
     session plan complete, do not edit the roadmap or `APP_VERSION`, and do not
     open any follow-up PR. The pending changelog fragment is the only durable
     lifecycle record this change leaves; a later planned release publishes it.
   - **(planned)** The merged PR already contains the truthful post-merge state
     (final session `Complete`, terminal roadmap row, matching `APP_VERSION`,
     published changelog with absorbed fragments), so there is no uncommitted
     reconciliation to prepare and no follow-up lifecycle-only PR. Update the
     local view from `origin/main`, rerun
     `python3 .agent-local/resolve_development_state.py --pretty` against that
     committed state, report its full directive, and return control to
     `start-session`. If the merge made every master-plan row terminal, leave the
     active plan, contracts, session plans, and SCRATCHPAD in place; close-out
     does not archive the version or select its next audit action — the resolver
     owns that decision.

Phase evidence: exact merge-SHA deployment identity and Ready state,
deployment-targeted runtime-log verdict, real-browser route/auth/console proof,
and — per mode — the pending-fragment path (ordinary) or the resolver's complete
new directive against committed main (planned).

## Return the result

Return this exact structure:

```text
Close-out result: SESSION_HANDOFF | MERGED | BLOCKED
Mode: ordinary | planned
Session: <id or not applicable>
Branch head: <full SHA>
Session review: <evidence summary>
Focused/local/UX proof: <evidence summary or not applicable>
Design review: <PASS result or not applicable>
Final verification: <command and result or not reached>
PR and review: <URL, head, CI, Greptile, findings or not opened>
Merge: <merge SHA or not merged>
Production: <deployment and browser proof or not reached>
Lifecycle state: <pending fragment path (ordinary), committed handoff or truthful merged state (planned)>
Resolver directive: <complete directive against committed main (planned) or not applicable (ordinary)>
Blocker: <exact blocker or none>
```

Return `SESSION_HANDOFF` only after a non-final planned session's verified
commit, push, plan status, and SCRATCHPAD handoff are complete. Return `MERGED`
only after exact production proof is complete — with the pending fragment
recorded in ordinary mode, or the resolver rerun against truthful committed main
in planned mode. Otherwise return `BLOCKED` with the first unresolved mandatory
gate and preserve all completed evidence for resumption.
