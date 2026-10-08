---
name: promote
description: >-
  Carry the LGI Tools development to staging pull request (or staging to main
  in release mode) through review rounds, fixes, Greptile, and green GitHub
  Verify and Coverage health, then hold for the user. Use only when the user
  explicitly asks to promote, release, or move development to staging or
  staging to main.
---

# Promote

Carry `development` onto `staging`, or `staging` onto `main`. Hold when the
gates are green. Merge only when the user says to.

Copy this checklist and keep it current.

```
- [ ] Mode chosen
- [ ] Pull request open and conflict-free
- [ ] Round 1 reviewed, fixed, verified, pushed, and commented
- [ ] Round 2 reviewed, fixed, verified, pushed, and commented
- [ ] Promote only: Greptile 5/5 on the head, every thread answered and resolved
- [ ] Verify and Coverage health green on the pull request head
- [ ] Held for the user
```

## Modes

| Mode | Head | Base | Round 2 reviewer |
| --- | --- | --- | --- |
| promote | `development` | `staging` | Greptile (CodeRabbit advisory on small diffs) |
| release | `staging` | `main` | `/code-review` again |

The release skill sets release mode; so does a request that says release or
staging to main. Everything else is promote.

## Ground rules

- Commit and push only on the mode head. Never rebase, force-push, squash,
  or rewrite pushed history.
- Work in the checkout that is on the mode head, or a worktree on it. Never
  `git stash` in a shared checkout.
- One commit per round. A finding that arrives after a round's commit is
  pushed belongs to the next round or Greptile pass.
- Do not open issues or Linear tickets unless the user asks.
- Bugbot is not used. Never request it.
- While waiting on CI or a bot, check quietly. Do not post progress
  messages; report when the wait ends.

## Open the pull request

Fetch `origin`. If the local head and `origin/<head>` diverged, stop. If the
local head is behind, fast-forward it. If the worktree has changes you did
not make in this run, stop. Before any commit, confirm
`git rev-parse --abbrev-ref HEAD` equals the mode head.

If `git log origin/<base>..origin/<head>` is empty, stop. There is nothing to
open.

Reuse an open pull request from head into base. Otherwise create one with
`gh pr create --base <base> --head <head>`. Read
`git log origin/<base>..HEAD` and `git diff --stat origin/<base>...HEAD`
first. The title names what the pull request contains; the body has
`## Summary`, `## Changes` (grouped by area), and `## Testing`. Never a title
or body that only says one branch moves onto another. Rewrite a reused pull
request's title and body if they do.

If the pull request conflicts, the base has commits the head lacks, usually
fixes made on `staging` or `main` that never came back. Merge
`origin/<base>` into the head with `git merge --no-commit --no-ff`, resolve
each conflict by meaning (keep both changes where both are intended), run
the local check, and commit `Merge <base> into <head>`. Stop and ask only if
a resolution needs a product decision.

## Review rounds

**Round 1.** Review the pull request diff. In Claude Code, run the built-in
`code-review` skill at high effort on the pull request number. In Codex, run
`/review` against the base branch. Then triage, fix, check, commit, and
comment as below.

**Round 2, promote.** See "Greptile".

**Round 2, release.** Run the same review again on the updated head, then
triage, fix, check, commit, and comment.

### Triage

Sort every finding into one class:

- **fix**: a real defect in this diff. Wrong behavior, crash, data loss, a
  security or privacy hole, a broken gate or test. Fix it without asking.
- **dismiss**: a false positive, a style preference, a speculative risk, or
  a compatibility concern for something that has not shipped to `main`
  (check `git log origin/main`). Give the reason in the round comment.
- **ask**: only when the fix needs a product or scope decision, such as
  changing intended behavior, removing a feature, or choosing a data
  migration. Severity alone is not a reason to ask.

Fix the whole fix class first. Then ask every open question in one message
and wait. Never revert or remove work while a question is open. Resume the
same round with the answers.

### Fix and check

Change only what the fix class needs. If a fix changes UI, layout, routing,
client state, or rendered data, check the changed flow in a browser. If no
browser is connected, run a short scripted Playwright check against the
local dev server. If neither is possible, say so in the round comment. Never
skip it silently.

Then run `pnpm verify` through the test-runner subagent (in Codex, give a
subagent `.claude/agents/test-runner.md`). Before verifying, stop any running
`pnpm dev`; it exhausts local Postgres connections. Verify uses the local
Postgres only, never Neon. If a date or time test fails only locally, compare
the database timezone (`SHOW timezone`) with CI's UTC before changing code.
Never run `pnpm build`, `pnpm build:vercel`, or `pnpm vercel-build` locally.

Fix failures and verify again in the same round. Do not push while verify
fails. If the round changed nothing, make no commit.

Commit subjects:

- `Fix promote review round 1`, `Fix promote review round 2`
- `Fix promote Greptile pass 2`, `Fix promote Greptile pass 3`
- `Fix release review round 1`, `Fix release review round 2`
- `Fix promote Verify failure`, `Fix release Verify failure`

Push with `git push origin HEAD`.

### Comment

After the push, or after confirming there is no commit, leave one pull
request comment: the head SHA, what changed, and each dismissal with its
reason.

## Greptile

Promote mode only, after the round 1 comment.

Post one comment: `@greptile review`. Add `@coderabbitai review` only when
the pull request changes 100 files or fewer; CodeRabbit skips larger diffs,
and its findings are advisory.

Wait for a Greptile review of the current head. Check every 3 minutes, for
up to 20 minutes. If none arrives, hold and report it.

Triage Greptile's findings, and CodeRabbit's if present, with the rules
above. Fix, check, commit, push, and comment as a round. Then reply on every
Greptile thread, either with the fixing commit or with the dismissal reason,
and resolve the thread.

The gate is Greptile confidence 5/5 on the current head. If it is lower,
post `@greptile review` once for the new head and repeat. That re-request
after each fix push is the only repeat bot comment allowed. Stop after three
Greptile passes in total: hold and report what Greptile still flags.

## Verify

After the last round's comment, and only for a head where `pnpm verify`
passed, dispatch Verify:

```
gh workflow run Verify --ref <head>
```

Its run must be on the pull request head SHA; dispatch again if it started
on an older one. Coverage health runs automatically on pull request pushes
that touch the paths in `.github/workflows/coverage-health.yml`. If no run
exists for the current head, dispatch it with
`gh workflow run coverage-health.yml --ref <head>`.

If either fails, fix it as one commit (the Verify subject above), verify
locally, push once, comment once, and dispatch Verify once more. If it fails
again, hold and report the run URL.

## Hold, merge, and merge back

When the gates are green, stop. Reply with the pull request URL, head SHA,
Verify and Coverage health run URLs, and, for promote, Greptile's score.

Do not merge, enable auto-merge, or add reviewers until the user says to
merge. Then merge with a merge commit, never squash or rebase:

```
gh pr merge <number> --merge --match-head-commit <head-sha>
```

After a release merges, bring its fixes and changelog back: on
`development`, `git merge --no-ff origin/main`, resolve as above, run the
local check, and push. Promote fixes are already on `development`, its head.
