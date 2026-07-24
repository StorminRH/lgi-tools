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
4. **(ordinary)** If the change affects user-facing behavior or appearance,
   invoke `ux-check`, present its diagnostics and captures, and pause for the
   operator's local-browser review. Do not enter the pre-PR gate until the
   operator completes that review. Planned execution receives the same gate from
   its contract through `start-session`.

Phase evidence: disposition of every session finding, one verdict for each
judgment-review surface, and the focused/local/UX proof or explicit
not-applicable reason.

## Session memory and the final-session fork (planned)

This section runs in planned mode only. One sub-version uses one deterministic
lifecycle branch; each planned session ships through its own PR from that
branch, and the branch is recreated from current `origin/main` after each
squash merge. Ordinary mode has no session-plan status and no next-session
pointer; skip to **Pre-PR design-review gate**.

1. Determine from the approved contract index, master-plan row, and session
   plan whether another approved session remains in the sub-version. Record the
   next session id or `Final session`; do not infer from branch age or filenames.
2. Every planned session proceeds through **Pre-PR design-review gate** and
   **Finalize and verify the current head** toward its own PR. The session
   plan's `Execution status` changes from `Pending` to `Complete` during pre-PR
   finalization, before the PR opens — not after merge. Point the durable
   handoff (`docs/SCRATCHPAD.md`) at the next session or the next lifecycle
   action in the same finalization.
3. A non-final session's PR publishes no version: it leaves `APP_VERSION`, the
   roadmap row, and the changelog untouched, so its release identity stays
   `reconciled`, and the sub-version's final changelog entry documents the whole
   sub-version. The final session's PR publishes the planned version records
   exactly as **Pre-PR design-review gate** finalization describes. A session
   PR must work end to end on its own and depend on nothing unmerged.
4. Read the session contract's `UX gate` marker. `Yes` is the authority to
   pause for the operator's local-browser review now, while the verified local
   server remains available; `No` skips that pause.

Phase evidence: `Remaining session: <id>` or `Final session`, the applicable UX
gate value, and any operator-review outcome. A required operator review that has
not completed returns `BLOCKED`.

## Pre-PR design-review gate

This gate runs before any PR opens: every planned session PR and ordinary work
are each a complete, reviewable change. It owns the whole-branch design
judgment and does not repeat the session-level data-placement, rendering, UI,
or public-truth review.

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
   - **(planned, non-final session)** Leave the release triplet, changelog,
     and pending inbox untouched; mark the session plan
     `Execution status: Complete` and prepare the concise design result for
     the PR's `## Notes`.
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
2. Reconcile durable memory before any final mechanical gate can be invalidated
   by another documentation edit. **(ordinary and planned final session)** update
   `docs/SCRATCHPAD.md` with only durable discoveries the roadmap and contract
   cannot know; remove shipped or superseded detail and keep deferred work only
   in `docs/backlog.md`. **(planned non-final session)** defer the session status
   and handoff pointer to the lifecycle-only commit in the fork above.
3. Run every cheap workflow check that can still lead to an edit: agent drift
   after changing shared guides, skills, hooks, or workflow policy; document
   references after changing live documentation; the pending-changelog checker
   whenever a fragment changed; the read-only baseline-claims and watch-trigger
   reporters; and any specialized checker named by the approved plan. **(planned)**
   also run release consistency. Ordinary mode does not run release consistency.
   Fix or reconcile every finding before the definition-of-done checkpoint;
   surface every `promote AF-NNN` result to the operator because neither reporter
   promotes findings itself.
4. Shut down the Next.js and local Convex development processes after all agent
   and operator local review is finished, confirm their ports no longer answer,
   and clear `.next`. Leave the small persistent Docker Postgres service running
   unless the session has another reason to stop it.
5. Reconcile only deliberately ignored local state touched by the session:
   runtime-local settings and worktrees, generated reports or captures,
   temporary PR body files, `.codegraph/`, and comparable declared local
   artifacts. Remove credential-bearing permissions and session-only output;
   tracked guides, skills, hooks, workspace docs, and `.agent-local/` utilities
   ship normally.
6. Run the sole coverage-backed definition-of-done checkpoint once on the
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
7. After the successful checkpoint, make a read-only confirmation that the
   worktree still matches the preflighted scope and that no application, test,
   executable, dependency, or verification-configuration change occurred after
   it. Any such change invalidates the checkpoint and returns to the applicable
   preflight and verification steps; a lifecycle-only record does not.
8. Commit the verified scope in the repository's conventional plain-English style
   — a conventional subject under 72 characters, lowercase after the prefix,
   describing the project outcome rather than files or symbols (see `AGENTS.md`)
   — and push the branch. No preview is created automatically.
9. **(planned)** Follow the fork above: a non-final session completes its plan
   and SCRATCHPAD handoff in the lifecycle-only commit, then stops; a final
   session has already set its plan `Complete` during finalization and continues
   to the PR.

Phase evidence: finalized-diff boundary verdict, output from every applicable
cheap workflow check, the successful pinned `pnpm verify` result tied to the
verified head, read-only no-change confirmation, commit SHA, push result, and
the lifecycle-memory disposition.

## The PR and Greptile loop (shared)

1. Before opening the PR, confirm the verification evidence names the current
   head. If the head has not changed since **Finalize and verify the current
   head**, reuse that evidence and do not rerun the test suite or coverage.
2. Open one PR from the branch to `main`, or reuse the one open PR already owned
   by a canonical review-only workflow. Describe the coherent project outcome,
   not a file list, using these headings in order: `## What this does`, `## Why`,
   `## Notes`, and `## Test plan`. Record the existing verification as past-tense
   evidence. **(planned)** With the PR number known, author the session's
   as-built record per `docs/workflows/schema/session-as-built.md` carrying
   that number, commit, and push it before the first review round begins.
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
5. Drive the review as batched rounds and never push while a reviewer is
   mid-pass — a push to the head cancels an in-flight Greptile or CodeRabbit
   review before it reports. Begin each round by waiting for the head to go quiet
   with the runtime's background `.agent-local/poll_pr_gate.py <repo> <pr>
   quiescent`, which returns once every check run on the head — Greptile,
   CodeRabbit, semgrep, CI — has completed and the set is stable. Continue useful
   close-out work while it runs; do not reproduce its polling recipe in prose or
   shell.
6. On that quiet head, collect every finding from all reviewers at once: the
   Greptile summary with its current-head inline findings, the gate of record,
   and CodeRabbit's advisory findings. If no current-head finding remains and the
   Greptile summary is 5/5 on the current head, the loop is done — go to
   **Merge**. Otherwise triage every collected finding together, without widening
   the branch:
   1. **Fix** an in-scope problem on the branch.
   2. **Justify** a deliberate choice by replying `@greptileai` (or the owning
      bot) with the reasoning; a justification that leaves a live current-head
      finding is not resolved, so wait for the reply rather than treating the
      unchanged head as a new pass.
   3. **Defer** only genuinely out-of-scope work to `docs/backlog.md` with its
      reason, size, and trigger.
7. Batch the round's whole disposition — every fix, justification reply,
   re-trigger, and backlog entry — then make exactly one push, and only after the
   evidence a fix invalidated is green again. Production or test code, executable
   scripts, package or lockfile changes, and TypeScript, ESLint, Vitest,
   coverage, or Fallow configuration invalidate the full checkpoint; a prose-only
   workflow document, lifecycle record, or PR-metadata change runs only its
   applicable document, release, drift, privacy, pending-changelog, or diff
   checks. That push opens the next round; repeat until a quiet head carries zero
   findings and a 5/5 Greptile summary. Later passes may raise new findings, so
   judge each round on its own live result.

Phase evidence: PR URL, published title/body scrub result, current head SHA, the
quiescent check set per round, green CI result, current-head Greptile score,
unresolved-finding count across all reviewers, and the disposition of every
finding. Any pending justification returns `BLOCKED`.

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

Use `docs/workflows/schema/chat-result.md` for this field set:

```markdown
## Close-out: `SESSION_HANDOFF` | `MERGED` | `BLOCKED`

- **Mode:** Ordinary | Planned
- **Session:** `<id>` | Not applicable
- **Branch head:** `<full SHA>`

### Review and verification

- **Session review:** <evidence summary>
- **Focused/local/UX:** <evidence summary or Not applicable>
- **Design review:** <PASS result or Not applicable>
- **Final verification:** <command and result or Not reached>

### Delivery

- **PR and review:** <URL, head, CI, Greptile, findings or Not opened>
- **Merge:** <merge SHA or Not merged>
- **Production:** <deployment and browser proof or Not reached>
- **Lifecycle state:** <pending fragment path in ordinary mode, or committed
  handoff/truthful merged state in planned mode>

### Next state

- **Resolver directive:** <complete directive against committed main in planned
  mode, or Not applicable in ordinary mode>
- **Blocker:** <exact blocker or None>
```

Return `SESSION_HANDOFF` only after a non-final planned session's verified
commit, push, plan status, and SCRATCHPAD handoff are complete. Return `MERGED`
only after exact production proof is complete — with the pending fragment
recorded in ordinary mode, or the resolver rerun against truthful committed main
in planned mode. Otherwise return `BLOCKED` with the first unresolved mandatory
gate and preserve all completed evidence for resumption.
