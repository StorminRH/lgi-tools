---
name: promote
description: >-
  Carry an LGI Tools promote or release pull request through two review
  rounds, one fix commit per round, and a green GitHub Verify run, then
  stop for the user. Use when the user says promote, release, development
  to staging, or staging to main. Promote requests CodeRabbit, Bugbot, and
  Greptile after round 1. Release does not request those bots.
disable-model-invocation: true
---

# Promote

Carry `development` onto `staging`, or `staging` onto `main`. Stop when the Verify workflow is green. Do not merge.

## Pick the mode

The release skill sets the mode to release. A request that says release, or staging to main, also sets the mode to release. Every other run of this skill is promote.

Copy this checklist and keep it current.

```
- [ ] Mode chosen
- [ ] Pull request open
- [ ] Round 1 reviewed, fixed, verified, pushed, and commented
- [ ] Bots requested, or skipped because the mode is release
- [ ] Round 2 reviewed, fixed, verified, pushed, and commented
- [ ] Verify green on the pull request head
- [ ] Stopped for the user
```

## Mode facts

Promote uses head `development` and base `staging`. The title is `Promote development to staging`. After the round 1 comment, request CodeRabbit, Bugbot, and Greptile. Round 2 reads those bot results.

Release uses head `staging` and base `main`. The title is `Release staging to main`. Do not request CodeRabbit, Bugbot, or Greptile.

Do not rebase the head onto the base. Do not force-push. Commit and push only on the mode head.

Do not follow the Shipping playbook. Do not babysit this pull request unless the user asks after the hold.

## Open the pull request

Fetch `origin`. If the local head and `origin/<head>` have diverged, stop. If the local head is behind, fast-forward it. If the worktree has changes you did not make in this run, stop.

Before any commit or push, confirm that `git rev-parse --abbrev-ref HEAD` equals the mode head. If the names differ, check out that branch, or use a worktree that is already on it. If the branch name is still wrong, stop.

If `git log origin/<base>..origin/<head>` is empty, stop. There is nothing to open.

If a pull request from that head into that base is already open, use it. Do not open a second one.

If that pull request has merge conflicts, stop and report them.

Otherwise create it with `gh pr create`. Read poteto-mode `playbooks/opening-a-pr.md` and use its pull request body sections. Before you write Scope, read `git log origin/<base>..HEAD` and `git diff --stat origin/<base>...HEAD`. Name the themes. Do not list every file.

## Fix the findings

Triage every finding as fix, dismiss, or ask. Use poteto-mode `references/bugbot-triage.md` for that triage.

If any finding is ask, stop and report it. Do not guess.

Fix every finding in the fix class on the head branch. Leave each dismissed finding unchanged. Do not fix anything outside that list.

If a fix changes UI, layout, routing, client state, or rendered data, verify the changed flow in the browser before you commit.

Run the deslop skill on the fix diff before you commit.

## Check locally

Run `pnpm verify` from the repo root. That script runs typecheck, lint, coverage, and fallow.

Do not run `pnpm build`, `pnpm build:vercel`, or `pnpm vercel-build` locally. Production builds run in CI and on Vercel.

If `pnpm verify` fails, fix the failure and run `pnpm verify` again. Stay in this round. Do not push while `pnpm verify` is failing.

If the round changed no files, do not create an empty commit.

If the round changed files, make one commit. Use the matching subject.

- `Fix promote review round 1`
- `Fix promote review round 2`
- `Fix release review round 1`
- `Fix release review round 2`
- `Fix promote Verify failure`
- `Fix release Verify failure`

If you made a commit, push with `git push origin HEAD`.

## Comment on the round

After the push, or after you confirm there is no commit, leave one comment on the pull request. Name the head SHA. List what you changed. List what you dismissed, and give the reason for each dismissal.

## Round 1

Review the PR with /poteto-mode and /thermos.

Then follow "Fix the findings", "Check locally", and "Comment on the round".

## Request the bots

Do this only when the mode is promote, and only after the round 1 comment.

Post this comment once. Do not post it again later.

```
@coderabbitai review

@greptile review this PR

@cursor review
```

Wait for a CodeRabbit review, a Greptile review, and a Cursor Bugbot review posted after that comment. A Bugbot review contains `BUGBOT_REVIEW`.

Check every two minutes. Stop at 25 minutes. Use the reviews that arrived. The round 2 comment names any bot that did not answer.

Release skips this section.

## Round 2

When the mode is promote, triage the bot results, then follow "Fix the findings", "Check locally", and "Comment on the round".

When the mode is release, review the PR with /poteto-mode and /thermos. Then follow "Fix the findings", "Check locally", and "Comment on the round".

Do not request the bots on round 2.

## Run Verify

Dispatch Verify only after the round 2 comment exists, and only for a head where `pnpm verify` already passed.

```
gh workflow run Verify --ref <head>
```

Watch that run. Its head SHA must equal the pull request head. If the run started on an older SHA, dispatch Verify again.

If Verify fails, fix that failure as one commit. Use the Verify subject above. Run `pnpm verify`, push once, comment once, and dispatch Verify once more.

If the second Verify run fails, stop and report the run URL. Do not start another review round.

## Hold

When Verify is green, stop. Reply with the pull request URL, the head SHA, and the Verify run URL.

Do not merge. Do not turn on auto-merge. Do not add reviewers.
