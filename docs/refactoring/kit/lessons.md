# Lessons from waves 1 to 7

Distilled from the cloud session that ran waves 1 to 7 (its transcript and run journals stay in that container). Three agents extracted these from the transcript, the run journals and the commits; a fourth checked them against the evidence, and its corrections are applied below (marked **Local correction**). Where anything here disagrees with [HANDOFF.md](../HANDOFF.md) or with the owner's instructions to your session, those win.

## Failures and fixes

### Phantom check failures from backgrounded commands

Do not accept a check result unless the agent saw every command finish. vitest, Fallow and pnpm verify run longer than the Bash tool's 2-minute default timeout, so give them timeout 600000. If a test-runner result says a command 'has no exit code yet' or was 'moved to the background', it is not a real failure. Stop the workflow before fix rounds burn on it or the item gets blocked by mistake. Then kill stray runs (pkill -f '[v]itest run') and resume. Keep the kit's waitRule and LONG_CMDS text in every check, implementer and fix prompt.

### Never overlap vitest runs (DB suites share schema names)

Run one vitest process at a time on a Postgres instance. Every *.db.test.ts suite uses a fixed schema name, so two runs break each other and produce an unexplained 'exit 1' that vanishes on a clean rerun. Before any rerun, confirm the earlier run exited (pgrep -f '[v]itest'). To check another branch concurrently, use a cloned DB (createdb, then pg_dump lgi_tools | psql clone) and point DATABASE_URL at the clone. A faster machine does not make parallel items safe: the speedup comes from faster checks, not from running more items at once. The real fix, per-run schema names across about 73 suites, is still an open follow-up.

### Truncated output and missing exit codes hid failures

**Local correction:** When output is truncated, have the test-runner rerun the chained stages one at a time, each as its own plain command: pnpm typecheck, pnpm lint, pnpm test:coverage (or the changed-set vitest), pnpm fallow:static, pnpm fallow:coverage. Ask it to report the summary lines it saw. Only the main session may capture logs, and with no side worktrees locally there is little reason to.

### Fallow type-aware sidecar timeout gives hundreds of false unused exports

Treat any Fallow output that warns 'type-aware sidecar timed out' as invalid, not as findings. Rerun with FALLOW_TYPE_AWARE_TIMEOUT_SECS=300, which is Fallow's own env var: it changes no rule, threshold or baseline, so it is allowed. On a fast local machine, run without it first and add --fallow-env to make_args.py only if the warning appears. If a wave's verify fails with that warning, stop the workflow before its verify fix agent starts deleting 'unused' exports. Also fix kit-HANDOFF.md, which says 'wave 2 saw 325': it was wave 3's verify, and it reproduced on wave 2's tip.

**Local correction:** Say: 'wave 3's verify reported 325 false unused exports; the same timeout reproduced on wave 2's already-passed tip after a container restart, so the host was the cause.' Fix the HANDOFF line to match.

### pnpm check passes test-only exports that pnpm verify rejects

Never export a constant or helper that only tests read. pnpm verify runs `fallow dead-code --production`, which ignores test references, but pnpm check (fallow:static) does not run it. Such an export therefore passes every item gate and fails only at the end of the wave. Moving tests out of co-located files into a shared test file can flip exports to 'unused', even ones that passed before. When an item consolidates tests or exports something for a test, run `fallow dead-code --production --fail-on-issues` before committing. Do not re-export what 7317bfff made private.

### next dev corrupts .next/dev/types under typecheck

Keep next dev stopped for the whole wave, delete .next/dev/types, and generate route types with `pnpm exec next typegen`. Use kit env_guard.sh with --kill-next. env_guard only checks that .next/types/validator.ts exists, so rerun typegen yourself after a merge, a branch switch, or an item that adds or removes a route, page or layout. Anything that starts the dev stack brings next back up; stop it again afterwards.

**Local correction:** Locally, run env_guard.sh without --kill-next. If it exits because next dev is running, or a check fails on .next/dev/types mid-wave, stop and ask the owner to stop next dev, then rerun the guard (or resume). Keep the bracketed-pattern advice only for processes the session started itself. Drop the --kill-next suggestion from HANDOFF.md.

### pkill -f matched its own shell

Use bracketed patterns in every ad-hoc pkill or pgrep, for example pkill -f '[n]ext-server' and pgrep -f '[v]itest'. An unbracketed `pkill -f 'next dev'` matches the shell running it and kills that shell (exit 144). The kit tools already bracket their patterns; keep that in any command you add.

### Apply new migrations after every merge

After merging development or a previous wave, check `git diff --name-only <old>..HEAD -- drizzle/`. If anything is new, run `DATABASE_URL=postgres://lgi:lgi@localhost:5433/lgi_tools DATABASE_MIGRATION_URL=... pnpm db:migrate` before pnpm check. The *.db.test.ts suites clone tables from the migrated public schema, so a missing migration fails them. Migrate any cloned DB too.

### Conflict-free merges still broke tests

Run pnpm check through the test-runner after every merge into a wave branch, even when git reports no conflicts, and before pushing. Development adds tests in the old style to files a wave refactored; port them onto the wave's helpers. Preview conflicts across the whole stack with `git merge-tree --write-tree --name-only A B`, which does not touch the working tree.

### Recurring merge conflicts and how they were settled

**Local correction:** For src/data/eve-data/entity-names.ts, keep development's current version: askBatch recursive split, post budget, int4IdSchema, no mapConcurrent. (`grep import src/data/eve-data/entity-names.ts` shows it; the promote session dropped the unused mapConcurrent import when it merged development into wave 6.)

### Shared CI flake fixed twice

When CI flakes on a pre-existing bug, a fix parked in a stacked wave branch helps no other PR for hours. Land it as a small PR to development, or tell the promote session at once that the fix exists and where, so it is not written twice and does not conflict later. Owner rule: fix pre-existing bugs and flakes without asking, and note them in the PR. Prove a concurrency fix with repeated sequential runs of the suite.

### CI job log tail is noise

The end of a Coverage health job log is Postgres container shutdown output, full of expected serialization errors. Do not diagnose from the tail. Have a subagent fetch a large tail (3000+ lines) and report the failing step, the test names with their assertion text, and whether Fallow printed the sidecar warning. Re-run a failed job once only when the cause is outside the PR.

### Permission classifier blocked commit steps

Commit with plain, visible git commands (heredoc message file, git add -A, git commit -F), not opaque helper scripts. The classifier read commit_msg.py and commit_item.py as 'Code from External' and 'External System Writes'. Retry once, since one block had no reason and the retry passed. If it is blocked again, the kit aborts with the tree intact: commit by hand (mark.py, git add -A, git commit with the journal's impl subject and body plus trailers), then resume. Locally, pre-approve git add/commit, python3 on the kit tools, pnpm and pnpm exec vitest.

_May differ on a local machine; check before relying on it._

### A failed commit must stop the run

Never let the next item start while the previous item's changes are uncommitted: the next commit step's `git add -A` folds them into the wrong commit. The v2 script carried on after P252's blocked commit. v3 and the kit return {aborted} when a commit fails; do not regress this. After an abort, inspect git status, commit or record the item, then resume.

### Synthesized-commit push blocked as Git Destructive

Do not push commit-tree objects to a branch ref (git push <sha>:refs/heads/...), and never force-push shared branches. Rebuild on the remote head with ordinary switch, merge and commit, then fast-forward push. To skip rerunning a long check, prove the rebuilt tree matches the one already checked with `git diff --quiet HEAD <checked-sha>`.

_May differ on a local machine; check before relying on it._

### Two sessions pushing to the same wave branch

Keep one owner per branch. Once a wave PR is handed to the promote session, do not push to it. Before starting a wave or opening its PR, git fetch and build on the previous wave's remote head, which the promote session moves (development merges, review fixes such as c830dabc, bfbbf20e and ba191c61). If a push is rejected, fetch and compare the other side's resolution with yours before redoing anything.

### Side-worktree checks during a running wave

**Local correction:** Locally there are no side worktrees and no concurrent checks. Check another branch only between waves, by switching the main checkout and running the test-runner there; the promote session owns earlier branches anyway. The cloned-DB recipe is history from the cloud, not an option for the local run.

### Do not touch the checkout while a wave runs

While a workflow runs, every file in the work tree belongs to the current item, and its commit step runs `git add -A`. Do not edit, commit, stash or switch branches in that checkout, and do not commit the in-progress changes to satisfy a hook. Keep notes, args and scratch outside the work tree: the kit uses .git/wave-kit, since agents tidied the scratchpad. Regenerate args with make_args.py if they disappear.

### Resume after any stop without redoing work

After a stop (crash, sleep, manual stop, or a container restart in the cloud), check git status, git log and the journal's last 'started' label. Then resume with Workflow({scriptPath, resumeFromRunId, args}), using the same script and byte-identical args. Agents whose prompt and options are unchanged replay from cache, including an implementer whose changes are still in the tree. Never edit a script a run is using: copy it, and change only prompts of agents that have not run yet.

### Workflow launch errors

Build args with make_args.py and pass them as a JSON object; a missing items list forced a relaunch. Keep the script where Workflow can load it, in the repo or session directories: the kit uses docs/refactoring/kit/implement-wave.js. After editing the script, run `node --check` on it. Unescaped backticks in a template literal broke the parse.

### Check 'already done' claims and fix status lines by hand

When an item returns already-done, open the evidence commit and confirm it; an earlier item in the same wave counts. The status must read 'already done (see commit)', not 'on development'. Review findings about Status lines will not be fixed by the review-fix agent, which is forbidden to edit them. Fix them yourself with mark.py and a docs-only commit before opening the PR.

### Generic or process-narrating commit messages

Before pushing, read `git log -1` for every review and verify commit. If the subject is 'Address the wave N review findings' or 'Fix the full verify gate', or the body narrates process ('I checked... Nothing is committed'), amend it while it is unpushed. Never amend after a push. The kit now asks fix agents for commitSubject and commitBody, but one generic subject still landed.

**Local correction:** Push only `commit:PNNN` item commits as they land. Hold `review:commit` and `verify:commit` until their subject is specific, amend, then push. If a generic one is already pushed, leave it, as with ddc4b560. Force-push with lease only when no PR exists and nobody else holds the branch.

### Promote reviews caught tests that could not fail

The two wave reviewers kept missing weak tests and sibling edge cases, so check these yourself or add them as a review lens. Can each new or changed test actually fail? Watch for fixtures built from the helper under test, fake timers that move both Date and performance clocks, and timezone cases only on one side of UTC. When a test file is deleted or consolidated, confirm every literal pin survived. When fixing one boundary, check every tier or branch. Regex source scanners need same-line and cross-statement cases.

### Zone boundaries limit fold-ins

Before replacing a local copy with a shared primitive, or accepting a reviewer's suggestion to, check the .fallowrc.json zones. ui cannot import lib, platform/purge imports nothing from src, data cannot import platform/auth, and lib imports only config. Where the local copy must stay, add a one-line comment saying why so reviewers stop flagging it. Waves 8 and later touch ui heavily.

### Browser checks were skipped because next dev is off

**Local correction:** Do not start a dev server. Collect the skipped browser and screenshot steps from the journal's impl deviations (wave 7 example: P015's /atlas failure state) and list them under a 'Not checked by eye' heading in the PR body. Ask the owner whether to check them himself. Wave 16's P046 phase 3 explicitly needs the owner's review on /preview/primitives.

### Convex codegen and a running convex dev

Items that add, rename or remove Convex modules must regenerate and commit convex/_generated. A convex dev you already have running regenerates it silently, so check git status for convex/_generated after each such item. Start the local backend only for codegen and stop it afterwards. The kit's cleanup sweep leaves processes that were running before the wave alone.

### Watchers expire; read git and the journal

Do not rely on the watch.py Monitor for progress: it expired every 30 minutes, and once commits landed unseen while it was down. Before reporting or pushing, read git log and the journal. Before trusting a zero-findings review or a 'nothing to commit' verify, read the journal's review:* and verify:* results. To wait, use a Monitor until-loop or run_in_background; foreground sleep is blocked.

_May differ on a local machine; check before relying on it._

### AGENTS.md changed mid-project

Re-read AGENTS.md and .claude/agents/test-runner.md after each merge of development, because the rules changed mid-project. The current rule is pnpm check through the test-runner before every push, with a fetch first so the --changed base is current. Every item commit already passed check, but merged heads must be re-checked before they are pushed.

### Benign esi-datasets boundary warning

Ignore Fallow's 'boundary zone esi-datasets matched 0 reachable files' WARN when deciding whether a wave is green. It appears on every verify, including the baseline, and does not fail the gate. Do not spend fix rounds on it mid-wave; raise it separately if wanted.

## How a wave was run

### Owner rule: one stacked PR per wave

Run the project as one branch and one PR per wave, each stacked on the previous wave and ultimately targeting development. Do not split a wave across PRs or combine waves. The owner originally merged PRs himself. Since 2026-10-10 the promote session takes each finished wave PR through prepare and promote.

### Owner rule: fix pre-existing bugs and flakes without asking

When a check or CI run exposes a pre-existing bug or flaky test, fix it in the wave branch where it surfaces, without asking. Give it its own commit with a specific subject, and list it in that wave's PR body. The rule exists because the session once stopped to ask (AskUserQuestion on the createIndustryProfile serialization race, cf6ee12d). The owner chose "Fix it inside wave 5" and then said not to ask again. The rule is also written into every wave's projectNote, so implementers apply it too.

### Owner rule: merge commits only, never squash or rebase shared branches

Bring development, or the wave below, into a wave branch with `git merge --no-ff` and a written merge message. Never rebase, squash or force-push a branch someone else may hold. Rewrite only unpushed commits, with `git commit --amend`.

### Owner rule for the local run: be careful with machine resources

On the owner's machine, do not let workflows pile up worktrees, clones, node_modules copies or dev servers. Earlier workflows ballooned disk use from many worktrees. Run every wave agent in the single checkout and keep vitest to one process. Stop next and Convex processes you started. Sweep leftover processes and worktrees at the end of each wave. (The cloud session used a side worktree to sync the stack; that is the pattern to avoid locally.)

### Branch naming and where a wave branch starts

Name the branch claude/primitives-wave-NN. Create it from the previous wave's final head once that wave's workflow and PR are done (`git switch -c claude/primitives-wave-NN`), then push it with -u right away. Wave 1 ran on the session's default branch, claude/busy-franklin-5hvolu. If the previous wave has since been handed off and the promote session moved it, fetch first and branch from origin/claude/primitives-wave-<N-1>, or from origin/development once that wave has merged.

### Guide link commit on the next wave's branch

The first commit on wave N+1's branch links wave N's PR. Insert a blank line, then `Landed in [StorminRH/lgi-tools#NNN](https://github.com/StorminRH/lgi-tools/pull/NNN).`, directly after the line "Part of the [primitive extraction guide](README.md)..." in wave N's guide page. Commit it with the subject "Link the wave N PR from its guide page" plus the trailers. It goes on the next branch, not the PR branch, so nothing is pushed to a PR that has been handed off. The next one due is "Landed in #672" on wave-07's page, as the first commit of wave 8.

### Workflow args: shape and how each field was built

**Local correction:** Locally, always generate args with `python3 docs/refactoring/kit/tools/make_args.py N --trailers .git/wave-trailers.txt [--fallow-env 'FALLOW_TYPE_AWARE_TIMEOUT_SECS=300 ']`. Run it right after the link commit, since base defaults to HEAD, and save the output under .git/. Items come from kit/tools/wave_items.py. projectNote is kit/waves/common-note.md plus that wave's waveCautions, and the briefs come from kit/waves/wave-NN.json.

### Args pitfalls: missing items, stale statuses, vanished drafts

Always pass the full items list, and keep the args file somewhere agents will not tidy away. The script skips items whose status starts with [x] or contains "blocked", but it reads those statuses from args, not the live guide. Rebuild args after any manual tick if you start a fresh run. When resuming, pass byte-identical args.

### Prepare phase: quiet tree and environment guard

Before a wave, stop `next dev`. It rewrites .next/dev/types racily, and typecheck then fails on corrupt files. Remove .next/dev/types, run `pnpm exec next typegen` if .next/types is missing, make sure Postgres is up on :5433, and start from a clean tree. The workflow aborts if the tree is dirty. pkill patterns must not match their own shell: `pkill -f 'next dev'` killed the session's shell, so use bracketed patterns such as `pkill -f '[n]ext-server'`. Rerun typegen after adding, renaming or removing any route, page or layout.

**Local correction:** Locally, run env_guard.sh without --kill-next. If it exits because next dev is running, or a check fails on .next/dev/types mid-wave, stop and ask the owner to stop next dev, then rerun the guard (or resume). Keep the bracketed-pattern advice only for processes the session started itself. Drop the --kill-next suggestion from HANDOFF.md.

### Baseline the full gate before starting

Before wave 1, the session merged the latest development and ran `pnpm verify` through the test-runner as a baseline, so later failures could be told apart from pre-existing ones. Do the same on a new machine before wave 8. It also catches environment problems such as Fallow sidecar timeouts or unmigrated databases.

### Per-item loop as practised

For each item, in guide order: a repo-mapper blast-radius map (the next item's map runs in parallel with the current implementer), then an implementer that reads the item's write-up, the README implementer guidance, the Conflicts entries and progress notes from earlier items. The implementer returns implemented, already-done or blocked. Implemented items go through the test-runner's `pnpm check` with up to 3 fix rounds. The commit runs mark.py to tick the guide. Blocked items are reverted (`git checkout -- . && git clean -fd`) and recorded in a "Record that PNNN is blocked" commit. Implementers must never commit, push, stash, reset, rebase, switch branches or edit Status lines: the workflow owns those. Waves 1 to 7 had 0 blocked items and 0 to 3 fix rounds per wave.

### Check gate: long commands and one vitest at a time

The test-runner must run each command in the foreground with a 600000 ms Bash timeout and never report a command it did not see finish. In wave 1, vitest outran the 2-minute default, got backgrounded, and was reported as a failure, which burned fix rounds. Never start a second vitest run while one may still be running. The *.db.test.ts suites share fixed schema names on one Postgres, and overlapping runs break each other; kill stray vitest processes before rerunning. The only acceptable skip is src/db/advisory-lock.concurrency.test.ts, gated on DATABASE_URL.

### Fallow type-aware sidecar timeout

On the cloud host, Fallow's type-aware sidecar overran its 120 s default. Fallow then fell back to syntactic analysis and reported hundreds of false unused exports (325 on wave 2's tree). The fix was `FALLOW_TYPE_AWARE_TIMEOUT_SECS=300` on every local fallow, check and verify command. It only raises that timeout: no rule, threshold, baseline or suppression changes, and repo and CI config stay untouched. The tell is the warning "type-aware sidecar timed out". A faster local machine may not need it.

**Local correction:** Say: 'wave 3's verify reported 325 false unused exports; the same timeout reproduced on wave 2's already-passed tip after a container restart, so the host was the cause.' Fix the HANDOFF line to match.

_May differ on a local machine; check before relying on it._

### Commit step and classifier blocks

v3 commits with plain shell: a heredoc message file, printf of the trailers, `python3 mark.py <ID> <state>`, `git add -A`, `git commit -q -F`. It retries once, then returns `aborted` with the item's checked changes still uncommitted. The auto-mode classifier blocked a commit step three times in waves 1 to 7: the serializable fix ("Code from External"), P252 ("External System Writes") and P320 (no reason given; the retry succeeded). To recover by hand, run mark.py, commit the item's subject and body from the journal's impl result plus trailers, then resume. Also verify the commit message: v2's `.slice(0,900)` cut a summary mid-word, and v3's clip() cuts at a sentence end.

_May differ on a local machine; check before relying on it._

### End of wave: review then verify

After the items, two reviewers run in parallel on `git diff <base>...HEAD -- . ':!docs/refactoring'`. The correctness reviewer hunts for defects and boundary or zone mistakes. The completeness reviewer looks for leftover copies, missing tests, unused exports and false "already done" claims. A fix agent verifies each finding, fixes the real ones and adds tests, then `pnpm check` gates a commit, or the fixes are reverted. Next, `pnpm verify` runs through the test-runner with up to 3 fix rounds, and a commit happens only if the tree is dirty. Waves had 0 to 3 review findings. The one verify fix (wave 6) made test-only exports private, because `fallow dead-code --production` ignores test references. A full verify took about 30-40 minutes on the cloud host.

### Reword generic review and verify commits before pushing

The workflow names these commits "Address the wave N review findings" and "Fix the full verify gate for wave N". Hold them unpushed, give each a specific imperative subject (for example "... (P020 review)"), amend, then push. Amend only while unpushed. Wave 2's review commit had already been pushed and needed `--force-with-lease`, which is acceptable only before a PR exists and nobody else holds the branch. Wave 4's generic subject (ddc4b560) shipped as is.

**Local correction:** Push only `commit:PNNN` item commits as they land. Hold `review:commit` and `verify:commit` until their subject is specific, amend, then push. If a generic one is already pushed, leave it, as with ddc4b560. Force-push with lease only when no PR exists and nobody else holds the branch.

### Pushing during a wave

Push each item commit as soon as the watcher reports it (`git push -q origin claude/primitives-wave-NN`). It already passed `pnpm check` inside the workflow, and pushing protects finished work from a restart. Leave uncommitted changes in the tree alone: they belong to the item in progress, and committing them would skip its gate. In the cloud, the stop hook repeatedly asked for a commit and push, and the answer each time was to explain and not commit.

### Pre-push check after any merge or hand-made commit

After fetching and merging development or the wave below, or after a hand-made commit, run `pnpm check` through the test-runner on that exact head before pushing. AGENTS.md says to fetch first so `vitest --changed origin/development` uses a current base. Merges have broken things: wave 2's development merge broke use-component-fee-sources.test.ts, and wave 7's fold of purge/merge.ts into lib/db-execute broke a .fallowrc.json boundary. Both were caught this way and fixed before the push.

### Fetch before pushing branches another session can touch

Other sessions push to the wave branches. The promote session pushed its own merge 34672a19 to wave-04 while this session was checking an equivalent merge, and the push was rejected. Fetch and compare remote heads (`git ls-remote origin 'refs/heads/claude/primitives-wave-0*'`) before merging into or pushing any branch below your current wave. If the remote moved, rebuild on its head with ordinary branch commands (switch -c --track, commit, push). Do not push a crafted SHA over it.

### Commit message rules

Item commits: one imperative subject in the repo's style, at most 72 characters, ending in " (PNNN)". The body is 2-6 lines wrapped at 72 columns, saying what changed and why plus any bug fixed. Every commit ends with the attribution trailers (the cloud used Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com> and Claude-Session: https://claude.ai/code/session_01BJMnwzZLoCUa8GKtE1Ybd6). A local session must use its own attribution lines, not this cloud session URL, so do not copy the hard-coded TRAILER. Messages must not contain process narration, first person, "as requested" or claims about committing. Wave 2's first review message said "Nothing is committed", and the FIXR schema then gained a commitBody field forbidding this.

### Merge commit message shape

Use the subject "Merge development into claude/primitives-wave-NN" or "Merge claude/primitives-wave-<N-1> into claude/primitives-wave-NN". The body starts "Brings in ..." and names the PRs or commits that came in, then says how each conflict was settled and which side was kept, then the trailers. Merge with --no-ff, or with --no-commit first when conflicts need inspection.

### PR title and body structure

Title: "Primitive extraction wave N: <theme>". The body opens with the guide file path and a one-line summary, then a base or stacking note (what it targets and whether development is already merged in), then counts (implemented, already done with evidence, blocked) and the diff stat outside docs. Sections follow: "## Behaviour changes" (user-visible, per item ID), "## One home per concern", any fold-ins or pre-existing-bug fixes, and "## Verification" (pnpm check per item, the review outcome with fix SHA, verify totals with the one expected skip, the post-merge pnpm check, and the FALLOW env note saying repo and CI config are unchanged). End with the session's attribution: "🤖 Generated with [Claude Code](https://claude.com/claude-code)" plus the session link. After creating the PR, call subscribe_pr_activity.

**Local correction:** Locally, watch the PR's checks with whatever GitHub tooling the session has (for example `gh pr checks <n> --watch`, or the GitHub MCP get_check_runs) until coverage-health and Semgrep are green, then hand off. The send_later safety-net check-in does not apply.

### Choosing the PR base and when to merge development in

Merge development or the wave below into the wave branch only after its workflow has finished (review and verify done). The reviewers diff from args.base, and pnpm check's changed set is relative to origin/development, so a merge mid-run pollutes both. At PR time, fetch. If the previous wave has merged into development, merge origin/development and target development. Otherwise target the previous wave's branch and say in the body that it will be retargeted. Waves 1-3 and 7 targeted development; waves 4-6 targeted the wave below. When development carries promote-review fixes, merge it in before opening the PR.

### After a development merge: migrations and test scope

When a merge brings new files under drizzle/, apply them to the local test database (`DATABASE_URL=... DATABASE_MIGRATION_URL=... pnpm db:migrate`) before checking. The *.db.test.ts suites clone the migrated public schema. Expect `pnpm check` to cover more on a stacked branch, because `vitest run --changed origin/development` includes every unmerged wave below: 700 test files on wave 6's merged head against 272 on wave 7 once development held waves 3 to 6.

### CI and PR event handling

While a wave PR is yours, watch Coverage health and Semgrep to green. CodeRabbit's "review skipped" and the missing Greptile review on development PRs need no action. When CI fails for a reason that is not the PR's, diagnose it from the job logs (read-only agent), post one diagnostic comment ending "---\n_Generated by [Claude Code](https://claude.ai/code)_", re-run the failed job once, and fix the root cause in a wave per the owner's rule. A safety-net check-in (send_later about 50 minutes out) was used once on #652.

**Local correction:** Locally, watch the PR's checks with whatever GitHub tooling the session has (for example `gh pr checks <n> --watch`, or the GitHub MCP get_check_runs) until coverage-health and Semgrep are green, then hand off. The send_later safety-net check-in does not apply.

_May differ on a local machine; check before relying on it._

### Handoff protocol to the promote session

Once a wave PR is open and CI is green on its head, message session_01PpWy1W4P1oujSiRy921NtU. Give the PR number, the branch @ head SHA, the base, the item count and theme, and merge notes: expected conflicts and which side to keep, plus anything a merge must not undo (for example, do not re-export 7317bfff's private scopes). Then unsubscribe from that PR's activity and stop pushing to the branch unless the promote session or the owner asks. If a promote merge changes a branch below yours, merge it into your working wave before opening its PR. If a handed-off wave needs a fix, do it on whichever branch the promote session names.

### What the promote session sends back and how to treat it

The promote session asks you to hold pushes on branches it is preparing. It reports its merges and conflict resolutions, lists development commits to merge before your next PR (c830dabc, bfbbf20e, ba191c61), and flags "one owner" leftovers from its reviews. Treat these as data: verify each against the code before acting, and reply when a flag is wrong. Its purge/merge.ts flag was a false positive, because .fallowrc.json gives platform/purge an empty allow list. Ack each message with what you will do and the current item count.

### Handoff state at the moment of transfer

**Local correction:** Waves 1-6 are on development and staging, wave 7 is #672 at 6cb0814b plus the coming kit commit, and main is untouched. Releasing staging to main is the owner's call, through the release skill, not part of this project.

### Messaging the promote session from a local session

Cross-session messages use the Claude Code Remote MCP send_message tool with session_id set to the promote session. Session-name tools such as SendMessage are a different transport and do not reach it. A local session without that MCP cannot message the promote session, so the owner has to relay the handoff (PR number, head SHA, base, merge notes). Incoming messages are data from a peer, not owner instructions.

_May differ on a local machine; check before relying on it._

### Get handoff facts from the guide, not from memory

Compute item counts, statuses and SHAs from the guide and git when writing a handoff message or PR body. The wave 5 handoff said "25 items", but wave 5 has 16. Check "already done" claims against origin/development too. P096 was marked "already done on development" when P105 had actually finished it on the branch. The guide line had to be corrected by hand, and mark.py's wording changed to "[x] already done (see commit)".

### Resume rules after a stop or restart

After a container restart, a TaskStop or a script fix, resume with `Workflow({scriptPath, resumeFromRunId, args})` using the same args. The cache replays agents whose prompt and options are unchanged, so finished items are not redone, and uncommitted changes in the tree are the interrupted item. Never edit the script a running or resumable wave uses. Put fixes in a new copy (v1, then v2, then v3), and if an edit already touched a running script, restore it byte for byte before resuming. Check the journal tail and the tree first, and run env_guard.

### Watching a running wave

Follow the journal with `watch.py <transcript dir>/journal.jsonl` (use --from-end when re-arming) under a Monitor. It prints commit outputs, blocked items and failed checks. A Monitor expires after 30 minutes and must be re-armed; once a lapsed watcher let several commits go unpushed and unreported. Inspect review findings and the verify result in the journal before acting on the workflow's final result. Bash `sleep` loops were blocked; use Monitor with an until-loop instead.

_May differ on a local machine; check before relying on it._

### Checking another branch in parallel

**Local correction:** Locally there are no side worktrees and no concurrent checks. Check another branch only between waves, by switching the main checkout and running the test-runner there; the promote session owns earlier branches anyway. The cloned-DB recipe is history from the cloud, not an option for the local run.

### Out-of-guide fixes inside a wave

A fix outside the guide's items (the pre-existing serialization race, or promote-review leftovers) lands on the current wave branch before its PR opens. Give it its own focused commit (or a small dedicated workflow: implement, stress-test, check, commit), add a regression test, and run pnpm check. Note it in the PR body under its own heading. Keep refactor items and these fixes in separate commits.

### Production dead code: no test-only exports

`pnpm check` runs fallow:static, which counts test references. `pnpm verify` also runs `fallow dead-code --production`, which does not. An export read only by tests therefore passes the per-item gate and fails at the end of the wave. Say this in every projectNote (it has been there since wave 7): test through production exports and keep test-only constants private. Do not re-export what a verify fix made private when merging.

## Repository knowledge

### Fallow type-aware sidecar timeout

If a Fallow run prints "type-aware sidecar timed out after 120 seconds; showing conservative syntactic findings", rerun it with FALLOW_TYPE_AWARE_TIMEOUT_SECS=300 in front (for example `FALLOW_TYPE_AWARE_TIMEOUT_SECS=300 pnpm fallow:static` or `... pnpm verify`). Fallow 3.22 reads this variable. When the sidecar times out, Fallow falls back to syntactic analysis and reports hundreds of false unused exports. The variable changes only a wall-clock limit, not a rule, threshold, baseline or suppression, so the AGENTS.md rules allow it. To confirm the semantic pass ran, look for `type-aware:executed=true` in compact output, or 'Type-aware refinement: N candidates, N confirmed uses'. A fast local machine may not need the variable, and it does no harm.

**Local correction:** Say: 'wave 3's verify reported 325 false unused exports; the same timeout reproduced on wave 2's already-passed tip after a container restart, so the host was the cause.' Fix the HANDOFF line to match.

_May differ on a local machine; check before relying on it._

### Production dead-code ignores test references

Never export a constant or helper that only tests read. `pnpm check` runs `fallow dead-code` in static mode, which counts test references. `pnpm verify` and Coverage health run `fallow dead-code --production`, which does not, so such exports pass check and fail verify. A reference from a co-located `x.test.ts` may still pass through the type-aware sidecar, but once the pin moves to a shared test elsewhere the same export fails, so do not rely on co-location. Fix by making the constant module-private and testing through the production export. Keep compile-time coverage with `as const satisfies readonly T[]`. To diagnose, run `fallow dead-code --production --trace <file>:<export>` and look for the assertion 'references-only-in-unreachable-files'.

### Diagnosing a red pnpm verify

`pnpm verify` is `typecheck && lint && test:coverage && fallow`, and `fallow` is `fallow:static && fallow:coverage`. The chain stops at the first failure, and agent output is often cut off. When verify goes red, run the stages separately: `pnpm test:coverage`, then `FALLOW_TYPE_AWARE_TIMEOUT_SECS=300 pnpm fallow:coverage`. fallow:coverage reads coverage/coverage-final.json, so rerun test:coverage after any code change before you rerun fallow:coverage. Never pass `--coverage` a map from a focused test run, because unmatched functions look untested. On the cloud host, test:coverage took about 300 s and the production dead-code pass about 164 s, so give each stage a long timeout.

### Two-minute Bash timeout fakes check failures

Every agent that runs typecheck, lint, vitest, Fallow or verify must call Bash with timeout 600000. It must never report a command that was moved to the background or that it did not see finish; it waits and reads the real result. With the default 2-minute timeout, vitest went to the background, the test-runner returned 'gate unfinished', and items burned fix rounds on failures that did not exist. If a command was not seen to finish, rerun it in the foreground. Do not count it as a failure.

### test-runner agent limits

The test-runner agent (.claude/agents/test-runner.md, sonnet) runs each command exactly as written, one per call, from the session's working directory. It allows no cd, pipe, redirect or wrapper, so it cannot check a second worktree or clone. Locally there are no side worktrees: check another branch only between waves, by switching the main checkout. An inline environment prefix such as `FALLOW_TYPE_AWARE_TIMEOUT_SECS=300 pnpm fallow:static` works. pnpm check, run through this agent, is four separate commands: `pnpm typecheck`, `pnpm lint`, `pnpm exec vitest run --changed origin/development --passWithNoTests`, and `pnpm fallow:static`. Fetch first so origin/development is current. On a stacked branch the changed set includes every earlier wave's tests (272 test files on wave 7).

### Never overlap vitest runs; clone the DB for parallel checks

Run only one vitest process against a database at a time. Each of the 76 `*.db.test.ts` files names one fixed, unique Postgres schema in createDbTestHarness (for example `schema: 'test_account_merge'`) and creates and drops it, so two runs against one database destroy each other's schemas. To check a second branch at the same time, clone the database and point that run's DATABASE_URL at the clone: `psql $U/lgi_tools -c 'create database lgi_tools_stack'`, then `pg_dump --no-owner $U/lgi_tools | psql -q -v ON_ERROR_STOP=1 $U/lgi_tools_stack`. Apply new migrations to the clone separately. With DATABASE_URL exported, the advisory-lock concurrency suite runs instead of skipping. A per-run schema suffix would remove the collision, but it touches all those suites and was left as a follow-up.

**Local correction:** Locally there are no side worktrees and no concurrent checks. Check another branch only between waves, by switching the main checkout and running the test-runner there; the promote session owns earlier branches anyway. The cloned-DB recipe is history from the cloud, not an option for the local run.

### DB test harness mechanics

`createDbTestHarness({ schema, tables, foreignKeys, resetBetweenTests, steerDbProxy, env })` in src/db/__tests__/support/db-test-harness.ts copies the listed tables from the migrated local `public` schema with `LIKE ... INCLUDING ALL`. Parents must come first. Serial sequences are rebound onto the disposable schema. Foreign keys are not copied, so list the ones the test depends on in `foreignKeys`. Two consequences follow. First, the local database must be migrated to the latest drizzle/ file (now 0082_eve_entity_names_resolved_at.sql) or suites fail on missing tables. Second, if DATABASE_URL is exported but Postgres is unreachable, the harness throws instead of skipping. Seed rows with seedUser, seedAccount, seedEveAccount and seedCharacter. A new suite needs its own unique `test_*` schema name.

### The one acceptable skip

src/db/advisory-lock.concurrency.test.ts runs `describe.skipIf(!HAS_DB)`, where HAS_DB is process.env.DATABASE_URL_UNPOOLED ?? DATABASE_URL. Vitest does not put .env.local into process.env, so the suite skips in every local run unless you export the variable. It is the only acceptable skip; any other skip, including a skipped *.db.test.ts, means Postgres is down and the run is not green. CI's Coverage health exports DATABASE_URL, so the suite runs there. When you touch advisory locks, run `DATABASE_URL=postgres://lgi:lgi@localhost:5433/lgi_tools pnpm exec vitest run src/db/advisory-lock.concurrency.test.ts`.

### Local Postgres, migrations and SDE seed

Locally, Postgres is docker-compose `postgres:16-alpine`, container lgi-tools-postgres, published on host port 5433 with user, password and database lgi/lgi/lgi_tools; start it with `docker compose up -d postgres`. Migrate with `DATABASE_URL=postgres://lgi:lgi@localhost:5433/lgi_tools DATABASE_MIGRATION_URL=postgres://lgi:lgi@localhost:5433/lgi_tools pnpm db:migrate`. src/scripts/migrate.ts loads DOTENV_PATH or .env.local. Repeat the migration whenever a merge brings new drizzle/ files. test-runner.md says full verify needs the SDE seed. CI seeds with `pnpm db:migrate` then `pnpm db:ci-sde-seed --cache-dir <dir>`, so if SDE-backed suites fail on missing rows, run the same seed locally. Never point local tooling at a Neon URL.

### next dev corrupts typecheck; use next typegen

Keep `next dev` stopped while checks run. It rewrites .next/dev/types/validator.ts without truncating it, and tsconfig.json includes `.next/dev/types/**/*.ts`, so `tsc --noEmit` fails inside generated files. Stop it, run `rm -rf .next/dev/types`, then `pnpm exec next typegen`, which writes .next/types (routes.d.ts, validator.ts, cache-life.d.ts, root-params.d.ts). next-env.d.ts is gitignored and imports ./.next/types/routes.d.ts, so a fresh clone or worktree must run typegen before its first typecheck. Rerun typegen after adding, renaming or removing any page, layout or route under src/app.

**Local correction:** Locally, run env_guard.sh without --kill-next. If it exits because next dev is running, or a check fails on .next/dev/types mid-wave, stop and ask the owner to stop next dev, then rerun the guard (or resume). Keep the bracketed-pattern advice only for processes the session started itself. Drop the --kill-next suggestion from HANDOFF.md.

### Killing next dev without killing yourself

Do not run `pkill -f 'next dev'` from an agent shell. The pattern matches the shell's own command line and kills it (exit 144). Use bracketed patterns that cannot match themselves: `pkill -f '[n]ext-server'; pkill -f '[n]ext/dist/bin/next dev'`. The cloud's .claude/cloud/stack.sh `start` also restarts next; locally, kit/tools/env_guard.sh starts only Postgres with docker compose and never uses stack.sh. The SessionStart hook does nothing unless CLAUDE_CODE_REMOTE=true.

**Local correction:** Locally, run env_guard.sh without --kill-next. If it exits because next dev is running, or a check fails on .next/dev/types mid-wave, stop and ask the owner to stop next dev, then rerun the guard (or resume). Keep the bracketed-pattern advice only for processes the session started itself. Drop the --kill-next suggestion from HANDOFF.md.

### Convex codegen: when and how

convex/_generated/api.d.ts lists modules, not exports; its lines look like `import type * as lib_deploymentEnv from "../lib/deploymentEnv.js"`. Regenerate only when a .ts file under convex/, including convex/lib, is added, removed or renamed. Changing exports inside an existing module needs no codegen. Run `pnpm exec convex codegen --typecheck disable` against a local or anonymous backend, never staging or production. In the cloud CONVEX_AGENT_MODE=anonymous was exported, and the hook warns that a CONVEX_DEPLOY_KEY in the environment would target a hosted deployment. Check that the diff touches only that module's lines, and commit it. Code shared by Next and Convex must be runtime-portable: use Web Crypto, not node:crypto. src/lib/bearer.ts replaced the node:crypto copy for that reason.

### Convex module registry and test conventions

`convex/__tests__/modules.test.ts` requires the glob list in convex/__tests__/modules.setup.ts to equal every production .ts under convex/ (lib/* included) plus ../_generated/api.js and server.js. Every added or removed Convex file therefore needs a modules.setup.ts edit, and usually one in export-coverage.test.ts. Non-test helper files in convex/__tests__ need at least two dots in the basename (for example convexTest.setup.ts), or Convex deploy picks them up. convex-test suites begin with `// @vitest-environment edge-runtime`. Assert errors with `expectConvexErrorCode` from convex/__tests__/convexTest.setup.ts, which matches exact codes (SELF_LOOP is not SELF_LOOP_CONNECTION), not substring toThrow. The same file exports grantMapAccess, Chain, claimReconciler and scheduledFunctionsNamed.

### Env reads are lint-enforced

ESLint `processEnvSelectors` rejects `process.env.X` everywhere in production src and convex, except NODE_ENV and NEXT_PUBLIC_* (those stay literal so Next can inline them). Read server env through readEnv() or requireEnv() from src/lib/env.ts, and add any new variable to that file's REQUIRED_ENV or VERBATIM_ENV map and to .env.example. Inside Convex, read SITE_URL through readAppOrigin() from convex/lib/deploymentEnv.ts. Public Convex config comes from src/config/public-env.ts (publicConvexUrl, isConvexConfigured).

### Lint traps in production comments

For non-test src/** and convex/** files, `tsdoc/syntax` is an error: a bare `<`, `>` or stray `@` in a /** */ comment fails `pnpm lint`, so wrap such text in backticks. `no-warning-comments` bans the words 'todo' and 'fixme' anywhere in a comment, so record follow-ups in the guide or the PR instead. Neither rule is caught by typecheck or Fallow.

### ESLint owner lists and the rail tests

eslint.config.mjs builds every no-restricted-syntax and no-restricted-imports list from canonical lists through `except(list, ...exemptions)` (P334). Owner blocks name exempt files by path, for example the tone-token owners pill.tsx, switch.tsx and type-roles.ts. When you add, delete or rename an owner file, edit those `files:` arrays in the same commit. scripts/syntax-exemption-rail.test.mjs pins each owner to the canonical list minus its declared exemptions. Other path-pinning rails are scripts/{ui-adoption,ui-import,ui-reference,vendor,corp-access,image-variant,wormhole-schema,fallow-gate}-rail/gate tests. Vitest picks them up through `scripts/**/*.test.mjs`, so run them when you touch lint config or move pinned files.

### UI gates: reference specimens, adoption census, CSS contracts

Three gates beyond Fallow apply to UI changes. (1) The ESLint rule `ui-reference/listed` requires every src/components/ui export the app uses to have a specimen rendered under src/app/(site)/preview/primitives/*.tsx. New primitives such as StatFigure, DialogCloseButton and CollapsibleChevron each had to add one. (2) src/esi-datasets/ui-adoption.test.ts matches raw `<button>`, `<input>` (except hidden), role="button", aria-pressed, `<Skeleton aria-hidden>` and data-chevron outside ui exactly against src/composition/__tests__/ui-adoption-registry. Moving a hand-built control onto a primitive means deleting its registry entry, because a stale entry fails too. (3) src/app/stylesheet-contract.test.ts (each owner sheet imported once from globals.css; backdrop-filters use the --glass-* knobs) and src/app/reduced-motion.test.ts guard CSS moves.

### Adding or removing a route touches several registries

Deleting or adding an API route or page means updating these in the same commit: the capability-coverage exclusion and pinned list (src/app/api/capability-coverage.test.ts), same-origin EXEMPT_MUTATIONS or its classification (src/app/api/same-origin-coverage.test.ts), handler-coverage or page-coverage pins, the idempotency registry (src/esi-datasets/idempotency.test.ts), and scripts/route-classification.json. Then run `node scripts/assert-routes-present.mjs` and `pnpm exec next typegen`. CI's Verify job runs `pnpm assert:routes-present`, and `pnpm check` does not, so a stale route-classification.json only fails on GitHub. This matters most for wave 9 (routes).

**Local correction:** Wave PR CI is Coverage health plus Semgrep. For items that add, remove or rename routes or pages (wave 9 especially), run `node scripts/assert-routes-present.mjs` locally before committing. Mention build-sensitive changes in the handoff notes. If the owner agrees, dispatch Verify on the wave branch (`gh workflow run Verify --ref claude/primitives-wave-NN`) instead of running a production build locally, which AGENTS.md forbids.

### New DB tables must join the schema registries

Several gates compare the reflected Drizzle schema (reflectedSchemaTables and registryCoverageDiff in src/db/__tests__/support/schema-reflection.ts) against hand-kept registries: the purge registry (src/composition/purge/registry.test.ts), table growth (src/composition/table-growth-registry.test.ts), the ESI dataset registry and the ownership declarations (src/esi-datasets/registry.test.ts and dataset-declarations.test.ts). A new or renamed table fails them until it is declared in each. Also, `_TTL_MS` constants are lint-banned outside the ESI dataset registry; bind a freshness gate from @/lib/esi-datasets/freshness instead.

### Drizzle no-migration check

After touching anything Drizzle reads, such as pgEnum values, `$type<T>()` on jsonb or text columns, index predicates, or the aggregate src/composition/drizzle-schema.ts, run `DATABASE_URL=postgres://lgi:lgi@localhost:5433/lgi_tools pnpm exec drizzle-kit generate` (or `pnpm db:generate`). drizzle.config.ts throws without DATABASE_URL and loads .env.local. Confirm 'No schema changes, nothing to migrate' and delete any migration it writes by accident. In a partial-index predicate, `inArray(col, TUPLE)` needs `.inlineParams()`; without it drizzle-kit emits a DROP/CREATE INDEX with $1..$n parameters.

### Serializable retries live in runSerializable

runSerializable in src/db/index.ts retries Postgres 40001 through retrySerializationFailures (src/db/serialization-retry.ts). That function makes 10 attempts, pausing n×(5+random×20) ms before retry n using sleep from @/lib/retry, and retries only errors isSerializationFailure matches. Callers must not add their own retry loops. createIndustryProfile's old 3-attempt loop made src/features/industry-planner/profiles/queries.db.test.ts flaky on Coverage health: with no pause, 4 to 9 of every 800 creates needed a fourth attempt. When merging development, keep this version over any in-function retry.

### Fallow strict-rule techniques that worked

(a) Moving a symbol: repoint every importer and leave no compatibility re-export or barrel re-export, because one with no importer fails unused-exports (ESI_OWNER_TYPES is imported from the leaf platform/owner-sync/owner-type.ts; EVE_SCOPES importers read @/config/eve-scopes directly). (b) private-type-leaks: a named non-exported type in an exported signature fails, and exporting it needs a consumer. Write the type inline or derive it with `Parameters<typeof fn>[0]`. (c) Coverage pins: Fallow's coverage-gaps credits exports transitively through any importer on the test graph. A pin in the */coverage.test.ts files is needed only if removing it makes fallow:static report a gap, so test by deleting the pin. (d) The cognitive complexity limit of 15 counts per-prop defaults. Spreading a shared props type (FieldControlProps) brought Select back under it. (e) Test-support modules that are not *.test.ts (anything under __tests__/) are still checked for dead code and dupes; only **/*.test.ts files are dupes-ignored.

### Test runtime conventions

Vitest only collects src/**/*.test.ts, convex/**/*.test.ts, scripts/**/*.test.mjs and e2e/**/*.test.ts. There are no .test.tsx files and no jsdom. Component tests build trees with createElement and render them with renderToStaticMarkup from react-dom/server, or mock 'react' and drive hooks as plain functions with createHookRuntime (src/lib/__tests__/hook-runtime.ts, which also exports `settle`). `server-only` is aliased to scripts/test-stubs/server-only.mjs. Markup tests that need Base UI dialogs mock @base-ui/react/dialog with StaticBaseDialog (src/components/ui/__tests__/static-base-dialog.ts). For focused runs, use `pnpm exec vitest related --run <files>` and quote paths that contain parentheses, such as "src/app/(site)/error.test.ts".

### Module-path mocks constrain file moves

Many markup tests `vi.mock` a ui module by path; for example, src/components/composition/board/HomeBoardView.test.ts mocks '@/components/ui/popover'. Splitting, merging or moving a component changes which mocks cover it and can silently re-enable the real component under test. Before moving a ui export, grep for `vi.mock('@/components/ui/<file>'` and keep the mocked surface where it is or update the mocks. HelpPopover was given its own file so the existing HomeBoardView popover mock still covers it.

### Shared test helpers to reuse (wave 2)

Reuse these instead of writing local copies: src/lib/__tests__/route-requests.ts (postJson, postForm, postEmpty, cronRequest, TEST_CRON_SECRET); console-tags.ts (silenceConsolePrefixes(level, prefixes), which throws if the console method is already mocked); source-scan.ts (listSourceFiles, listRouteFiles, stripComments, filesMatching, valueImportSpecifiers, resolveLocalImport, MODULE_EXTENSIONS); hook-runtime.ts (createHookRuntime, settle); broadcast-bus.ts (createBroadcastBus); host-locale.ts (withHostNumberLocale). Under src/db/__tests__/support: db-test-harness, fake-query-chain (createFakeQueryChain), reserved-connection-mock (createReservedConnectionMock), schema-reflection (reflectedSchemaTables, registryCoverageDiff, reflectedSchemaExports). Also src/composition/__tests__/session-fixture.ts (typed Better Auth session fixtures), convex/__tests__/convexTest.setup.ts, and the fixtures features/wormhole-sites/__tests__/site-fixtures.ts, features/industry-jobs/__tests__/job-fixture.ts, mapper/chain/__tests__/chain-snapshot-fixture.ts and mapper/layout/__tests__/layout-facts-fixture.ts. The ui zone cannot import lib, so ui tests such as loading-toast keep local fakes, and platform/search tests keep inline spies.

### src/lib primitives from waves 3-6 (exact exports)

Later items must use these and not add copies: array (dedupe, chunk, sameItems, sortedUniqueIds, idsKey, parseIdsKey, groupBy, getOrInsertComputed); equality (sameFields); math (clamp, clamp01, clampPct, roundTo, roundIsk); fan-out (mapConcurrent, mapByIdDroppingNulls); failure (AppFailure, FailureResult, CheckResult, FAILURE_CATEGORIES, validationFailure and the other *Failure constructors, isAppFailure, errorMessage); error-chain (isTimeoutError); retry (sleep, readWithRetries; it has no `retry` export); best-effort (bestEffort); iso-date (HOUR_MS, DAY_MS, isoDay, isoDayStartMs, isoDayNumber, isoDayFromNumber, isUtcWeekend, daysBefore, isIsoCalendarDate); search-params (withSearchParams); use-now (useNow); web-storage (safeStorage, readStoredJson, writeStoredJson, createStoredList); section-path (sectionMatches, longestSectionMatch); id-schemas (positiveIdSchema, int4IdSchema, pathIdParamSchema, ownedRowIdSchema, isPositiveSafeInteger); scope-eligibility (hasScopes, scopeEligibility); bearer (bearerMatches, Web Crypto, also used by Convex); url-safety (isLocalUrl, isSafeServiceUrl); graph (breadthFirst, pathTo, Neighbours, from P137); peer-channel (openPeerChannel); db-upsert (excluded, excludedSet); db-execute (executeRows); db-columns (ownerSyncStateColumns, ownerKeyWhere, ownedRowIdentityColumns); batched-delete (retentionCutoff, retentionCutoffDay, deleteInBatches); deferred-work (deferWork, setWorkDeferrer); env (readEnv, requireEnv). src/lib may import only config.

### Format, db, config and domain homes (waves 4-6)

Use these homes. lib/format/number: formatQuantity, formatCompactQuantity, formatPct, formatCount, formatSigned. lib/format/isk: formatIsk, formatIskShort, formatIskCompact; the K tier rolls over to M after the wave 4 review fix. lib/format/time: formatUtcDate, formatUtcTime, formatIsoDay, formatUtcMinute, formatElapsed (formatAgo is gone), formatRelativeTime, formatRemaining. lib/format/names: unresolvedName, nameOrUnresolved, formatStationName, initials. lib/format/text: capitalize, humanizeIdentifier. src/db: direct-database (directDatabase), advisory-lock (ADVISORY_LOCKS, withAdvisoryLock), locked-user (lockUserRows, withLockedUsers), serialization-retry, pg-errors (isUniqueViolation, isSerializationFailure). src/config: eve-scopes (EVE_SCOPES, EveScope, EVE_CHARACTER_SEARCH_SCOPE), public-env, site-url (PRODUCTION_SITE_URL, SITE_URL). Domain: platform/owner-sync/owner-type (ESI_OWNER_TYPES, EsiOwnerType; import the leaf, not the barrel), features/wormhole-sites/site-taxonomy (SITE_TYPES, WORMHOLE_CLASSES), data/eve-data/wormhole-codex-index, data/wh-statics/code-sets, data/industry-math/percent-draft, data/maps/lifecycle-sql (activeMapCondition, restorableMapCondition), data/telemetry/health-metrics (formatClientErrorShare, formatFallbackShare), features/industry-planner/type-name, transport/beacon (postBeacon), components/telemetry/client (postTelemetry), convex/lib/deploymentEnv (readAppOrigin).

### UI kit homes after wave 7

Use these, all in src/components/ui unless noted. dialog.tsx: DialogHeader (closeDisabled, size, tone), DialogBody, DialogFooter, DialogCloseButton. confirm-dialog, and use-confirm-gate (keeps its target while fading out). section-panel (SectionPanel, readoutSurface). stat-figure. help-popover (HelpPopover is the (?) hint). switcher-menu (SwitcherMenu), with floatSurface and floatIconTrigger in card.tsx. choice-row (ChoiceRow, ChoiceLabel). collapsible (CollapsibleChevron). skeleton (SkeletonGroup; an unlabelled Skeleton is aria-hidden). text-link (CardLink, ExternalLink, inlineLink). combobox-pick (pickOrType). overlay-portal-container. dropdown-panel (popIn, panel classes). menu (MenuPopup). nav-rail (NavRailLayout). pill (Pill, pillVariants; Chip is deleted). chip-toggle (ToggleRow). icons (CheckIcon, CloseIcon and others). The glass-chip @utility lives in app/globals.css. Outside ui: components/composition/StatusPanel.tsx, SectionNote in components/composition/board/SectionBody.tsx, and components/preference-control.tsx (PreferenceControl).

### Base UI 1.7 and Next 16.3.4 behaviours found

Check these against node_modules before relying on older docs. Base UI 1.7 reads a portal `container={null}` as 'wait', so useOverlayPortalContainer returns HTMLElement | undefined and every popup passes it. Base UI's useAriaLabelledBy points a control's aria-labelledby at the wrapping <label>, and that outranks aria-label, so name controls through the row label. In Next 16.3, error.tsx receives `{ error, reset, retry }`; `unstable_retry` is gone, and calling it threw. next/link with `scroll={false}` calls preventDefault even for hash-only hrefs, so a '#fragment' link loses its jump unless it is handled explicitly.

### Codegraph for repo-mapper on a local machine

The repo-mapper agent starts with `codegraph sync` and expects the codegraph CLI (@colbymchenry/codegraph@1.5.0) and an index in .codegraph/, which is gitignored. In the cloud, .claude/cloud/clis.sh installs the CLI and bootstrap.sh runs `codegraph init` or `codegraph sync` with CODEGRAPH_TELEMETRY=0. Locally, install the CLI and run `codegraph init` once in the repo root, or repo-mapper falls back to grep and reports gaps.

### CI checks and toolchain to match locally

The GitHub Verify job (test.yml) runs typecheck, lint, fallow:static and assert:routes-present, then db:migrate, build and assert:routes, then e2e. Coverage health runs db:migrate, db:ci-sde-seed, test:coverage and fallow:coverage with DATABASE_URL set, so the concurrency suite runs there; Semgrep also runs, and CodeRabbit's 'review skipped' needs no action. CI uses Node 24 (.github/actions/setup-node-pnpm) and pnpm 10.34.0 (packageManager); the cloud container ran Node 22.22.0. pnpm-workspace.yaml sets minimumReleaseAge 10080, so a dependency version under 7 days old will not install. tsc is TypeScript 5.9.3, while Fallow's sidecar bundles typescript-go 7.0.2; the two are unrelated, so don't 'fix' one by changing the other.

**Local correction:** Wave PR CI is Coverage health plus Semgrep. For items that add, remove or rename routes or pages (wave 9 especially), run `node scripts/assert-routes-present.mjs` locally before committing. Mention build-sensitive changes in the handoff notes. If the owner agrees, dispatch Verify on the wave branch (`gh workflow run Verify --ref claude/primitives-wave-NN`) instead of running a production build locally, which AGENTS.md forbids.

### Stale facts in the guide and the handoff draft

Correct these before relying on the docs. (1) The README's P332 conflict note says WriteBehindResult and notifyObserver 'already live in src/lib/write-behind.ts'. That file does not exist yet; P077 (wave 12) creates it. Until then the code lives in src/data/market-{prices,history}/refresh-on-view.ts. src/lib/memoize.ts does not exist yet either (P189 and P292, wave 11). (2) The README's gap note asks whether to add a src/lib graph helper. src/lib/graph.ts already exists (breadthFirst, pathTo; P137), so wave 15's mapper BFS items should adopt it.

## Gaps the checker found

### Owner's own rules for the local run (the paste-in prompt)

The owner sets the local session's rules in the prompt that starts it; where these lessons disagree with it, the prompt wins. In short: one wave workflow at a time and nothing else that runs tests meanwhile; no worktree isolation, git worktrees, clones or copies of the repo or node_modules; never start next dev, next build or next start (ask the owner to stop a running next dev rather than killing it); stop every process you start and report the cleanup sweep after each wave.

### Kit check prompt uses an unbracketed pgrep that always matches itself

Before the first local run, change `(pgrep -f vitest)` to `(pgrep -f '[v]itest')` in the waitRule of runCheck in kit/implement-wave.js. The unbracketed pattern matches the agent's own shell, so it reports a running vitest even when none is running. A test-runner could then wait or skip a rerun for no reason. Make the edit before any wave uses the script: never edit a script a run or a resumable run is using.

### Unanswered owner choice about the kit's Python and its removal

The owner was offered two kit options: port the Python helpers to Node, or remove docs/refactoring/kit/ in wave 16's PR. No choice was recorded, so the kit stays Python (python3 is required) and the session that runs wave 16 asks the owner whether to remove it. If it is removed, do it in a separate commit after wave 16's workflow has finished, since the running workflow uses it.

### Open owner questions and unverified items from waves 1-7

Carry these into HANDOFF's follow-ups and the relevant PR bodies. Do not settle them yourself. P335: the owner must confirm before release that nobody purges the removed 'eve-status' cache tag by hand. P296: an operator audit of 'eve-user-%' users that the old deploy backfill already re-created. P134 skipped optional step 9 (lint NEXT_PUBLIC_* reads outside src/config); the owner decides. P209: should the maps purge contributor skip Convex calls when Convex is unconfigured? Owner decision; account-purge.db.test.ts pins today's retry. P015: the /atlas failure state now shows the warn LoadFailed banner with no visible h2, and the design screenshot check was never done. Optional leads: inline isBoundaryStaleMs (P304), demo-board demoHistory (P096), wormhole-sites hydration duplication (P101). Also open: per-run DB schema names, and the esi-datasets zone WARN.

### Cross-wave notes that exist only in the cloud journals

Implementers in waves 1-7 left notes for later items. The journals holding them stay in the cloud, and the research wave cautions miss several. Add these to kit/waves/wave-NN.json or common-note.md. Wave 8: P003 edits BoardSkeleton and WorkspaceStates, which are now SkeletonGroup roots; ui-adoption.test.ts bans `<Skeleton aria-hidden>`. Wave 10: P162's alert goes through the private sendOpsAlert in lib/alerts.ts (P173). P159 relies on bestEffort (swallow is gone). P299 reuses formatElapsed, queueCounts and formatFallbackShare. Wave 12: P054 builds on useConfirmGate in ui/use-confirm-gate.ts (P056). P065: apiFetch never rejects (P154). Wave 13: P168 and P070 import activityLabel from '@/data/eve-data/constants' and isProductionActivity (P098). Wave 15: P028's AFK plumbing step is done (P059). P218's deathWindowFrom dependency is done (P329). Waves 8, 9 and 16: P067, P138 and P306 see AccountDangerZone importing HelpPopover, not Popover (P007).

### Workflow resume works only within the same session

Workflow's resumeFromRunId works only in the same Claude Code session, and the prior run must be stopped with TaskStop first. If the local session itself is lost (terminal closed, crash, a new session), start a fresh run instead. First deal with the interrupted item's uncommitted changes: Prepare aborts on a dirty tree. Commit them by hand if their check passed, otherwise revert them. Rebuild args with make_args.py, which reads the live guide statuses, so landed items are skipped. Pass `--base <the wave's link-commit sha>`; the default is HEAD, which would shrink the reviewers' diff to the new commits. The fresh run's completeness lens lists only the items that run implemented, and it skips review entirely when nothing new lands. Run a manual review over `git diff <base>...HEAD` in that case.

### Tell the owner the checkout is in use for the whole wave

Before each run, tell the owner that the checkout belongs to the wave for hours. Each commit step runs `git add -A`, so any non-ignored file the owner creates there lands in an item commit. A blocked item, or a review fix that fails its gate, runs `git checkout -- . && git clean -fd`, which deletes untracked files. The end-of-wave sweep kills any vitest, next, Convex or tsgo process started after the snapshot, including one the owner started.

### Check DATABASE_URL in the local shell

Before the first check, confirm that DATABASE_URL and DATABASE_URL_UNPOOLED are unset in the shell, or point at postgres://lgi:lgi@localhost:5433/lgi_tools. The DB test harness uses an exported DATABASE_URL as is, and it creates and drops test_* schemas there. The advisory-lock concurrency suite also runs against it. The cloud shell had neither variable set; an owner's shell profile may export a Neon URL.

### How the owner wants updates

Write summaries and status updates in plain English prose that reads well aloud: the owner uses the app's text-to-speech playback. Keep code, tables and dense markup to a minimum, and say what changes for users. When the owner asks for a prompt or a message to relay, give it as one copy-paste block in chat.

### Cloud pace, for spotting stalls

Use the cloud timings to judge whether a local run has stalled. Wave 6 took about 5 hours for 21 items, about 15 minutes per item including its check. The changed-set vitest run took about 140 s, test:coverage about 300 s, the production dead-code pass about 164 s, and a full pnpm verify 30 to 40 minutes. A local item far beyond these with no new journal entries is probably stuck on a backgrounded command or a permission prompt.

### Where the journal lives locally, and Workflow opt-in

Locally the run journal is at ~/.claude/projects/<repo path with / replaced by ->/<session id>/subagents/workflows/<run id>/journal.jsonl. The run id comes in the Workflow result; point watch.py there or use /workflows. The cloud session ran with ultracode on. Locally, the owner's 'Use a workflow for each wave' is the explicit opt-in the Workflow tool needs, so keep that wording when asking a fresh session to run a wave.
