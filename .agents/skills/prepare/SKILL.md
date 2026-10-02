---
name: prepare
description: >-
  Prepare one or more specified LGI Tools PRs and merge them safely into
  development, resolving CI failures and merge conflicts in dependency order.
  Use for requests such as prepare PR 123 or prepare these three PRs.
  Stops at development; promotion and release reviews belong to promote.
---

# Prepare

Get the requested PRs cleanly merged into `development`, ready for a later
`promote`. A request to prepare named PRs authorizes the necessary fixes,
commits, pushes, retargeting of those PRs in a stack, marking them ready,
and merging them into `development`. Do not ask for another merge approval
unless the user imposed a hold. Merely loading this skill is not merge
authorization; honor report-only or inspection-only requests.

## Scope

This is merge preparation, not a review process. Inspect the PR's purpose,
diff, dependencies, checks, and conflicts only as needed to preserve intent
and establish merge readiness. Do not run `promote`, adversarial reviews,
thermos, review rounds, or review-oriented skills. Do not request reviewers,
invoke review bots, or post bot-triggering comments.

Do not manually dispatch or rerun CI workflows, including Verify and Coverage
health. Fixes may trigger normal automatic CI when pushed. Do not push empty
commits or make cosmetic changes just to trigger CI or bots. Automatically
configured bots may run on ordinary pushes; do not solicit extra reviews.

Do not promote to `staging`, release to `main`, deploy, or open a promotion
PR. Do not bypass branch protection, use admin merge, enable auto-merge,
force-push, or rewrite branch history. Do not delete branches or clean up
unrelated worktrees as part of preparation.

## Establish the merge order

Resolve every requested PR against the correct repository. Read the current
repository instructions and inspect local changes and worktrees before edits.
Preserve unrelated work; use a clean isolated worktree when fixes are needed.
Attach the PRs to the chat if the host provides a PR attachment tool.

Fetch current remote refs. For each PR, record its state, head branch and SHA,
base, intended change, mergeability, checks, and branch-protection requirements.
Verify an already-merged PR's change is present in `development` before counting
it complete. Do not reopen closed PRs or treat a PR merged elsewhere as done.

Determine stack order from branch ancestry and actual dependencies, using PR
descriptions as supporting evidence. Merge dependencies before dependents;
otherwise preserve the requested order. Retarget a stacked PR to `development`
after its requested prerequisites land and verify the resulting diff contains
the intended remaining changes. If a necessary prerequisite was not requested,
ask before adding it to the merge set. Do not silently repurpose a promotion,
release, or unrelated-base PR into a development PR.

## Make each PR ready

Work on one merge candidate at a time. Check its latest head against the latest
`development`, not a snapshot taken before earlier merges.

If it conflicts or must be updated to satisfy repository merge rules, merge
the current `origin/development` into its head branch using `--no-commit`
so the precommit gate runs before any merge commit, and resolve conflicts
semantically. Preserve both changes where appropriate; do not blindly choose
ours or theirs. Check overlap with earlier PRs for dropped, duplicated, or
reintroduced changes. Stop for clarification if resolution requires choosing
new product behavior or changing the PR's intent. Do not rebase.

Inspect failing CI logs and make focused fixes on the PR head. Follow the
repository's Fallow policy: fix all findings, with no weakened thresholds,
baselines, overrides, or suppressions. If a necessary fix is too large or
requires an intent change, report a blocker instead of expanding the task.

Before every commit, run `pnpm check` through a test-runner subagent with
tests appropriate to the fix. Use the host's native delegation mechanism;
for Codex, give the subagent the repository's test-runner instructions from
`.claude/agents/test-runner.md`, without copying Claude model settings.
Whenever Coverage health fails, run `pnpm verify` through that agent and fix
its failures before pushing. Full verification is otherwise not a preparation
requirement. Never run production builds locally.

Confirm the checked-out branch is the PR head before committing or pushing.
Push only the intended fixes, then wait for automatic checks on the new head.
Do not reuse green results from an older head. No fix means no empty commit
and no mandatory local full-suite run solely for preparation.

## Check and merge

Check all applicable CI and required checks, not just one named workflow.
Pending or unknown status is not success. Confirm checks correspond to the
current PR head (or its current GitHub PR merge ref). A workflow legitimately
excluded by its configured event or path filters is not a failed check; report
that exclusion accurately. Do not demand a manual Verify run just because
`promote` uses it. A missing required check is still a blocker.

If checks need manual dispatch/rerun, access is unavailable, a required review
is missing, or mergeability stays unknown, stop the affected PR and report
the concrete blocker. Do not invoke bots or bypass requirements to clear it.
If automatic CI remains pending beyond a reasonable bounded wait, report
pending rather than merging. Stop repeated repair attempts when the same
failure persists without a new actionable diagnosis. Continue independent
requested PRs when safe; hold dependents of a blocked PR.

Immediately before each merge, refresh the PR head, base, checks, and
mergeability. Confirm the base is `development`, the intended diff remains
intact, and all applicable checks pass. If the head or base advanced, reassess
readiness. Mark an authorized draft ready when needed and recheck requirements.

Use the repository's allowed merge method and pin the operation to the checked
head with `gh pr merge <number> --repo <owner/repo> --match-head-commit <sha>`
plus the appropriate merge-method flag. Prefer a merge commit when allowed
for a stack so ancestry remains intact. If squash is required, reassess the
remaining stack's diff and ancestry after each merge; never assume an ancestor
PR's commits disappeared from its dependents automatically.

Verify GitHub reports the PR merged into `development`, fetch the resulting
branch, and confirm the recorded merge commit is included. Then refresh and
prepare the next PR using that new development state.

## Finish

Report the merge order, PR links, merge SHAs, fixes made, and check outcomes.
Identify blocked or pending PRs and their dependents explicitly. Stop once the
requested PRs are on `development`; they are ready for a separate `promote`.
