# Primitive extraction: handoff runbook

This is how to carry on the [primitive extraction guide](README.md) from wave 8. Waves 1 to 7 ran in a Claude Code cloud session. This file and [`kit/`](kit/) hold what that session knew that the guide, the commits and the PR descriptions do not.

Read this first. Then read the guide's README (Implementer guidance, Conflicts to reconcile) and the page for the wave you are about to run. [`kit/lessons.md`](kit/lessons.md) has the longer record of what went wrong and what the repository needs; this file wins where they differ.

## What is in the kit

- [`kit/implement-wave.js`](kit/implement-wave.js): the per-wave workflow (a Claude Code Workflow script).
- [`kit/tools/make_args.py`](kit/tools/make_args.py): builds that workflow's `args` for wave N from the guide page and `kit/waves/wave-NN.json`.
- [`kit/waves/`](kit/waves/): per wave, the docs-researcher briefs, wave cautions, items that may already be done, and cross-wave dependencies, drafted against the tree at wave 7. `common-note.md` is the project note every implementer reads.
- [`kit/tools/`](kit/tools/):
  - `env_guard.sh` checks for `next dev`, a stray `DATABASE_URL` and Postgres, and generates route types.
  - `cleanup.sh` sweeps leftover processes and worktrees.
  - `mark.py` ticks a guide status.
  - `wave_items.py` reads a wave's items from its guide page.
  - `watch.py` prints a live run log.
- [`kit/lessons.md`](kit/lessons.md): about a hundred lessons from waves 1 to 7, checked against the evidence and corrected for a local machine.
- [`kit/audit/primitive-extraction-audit.js`](kit/audit/primitive-extraction-audit.js): reference copy of the workflow that wrote this guide. Its findings are all in the guide already: the items, their verdicts, dependencies and conflicts, and the rejected and dropped candidates in the README's appendices.

The tools need `python3`, `bash` and `git`. They are about 300 KB in all (most of it the per-wave briefs and the lessons), under `docs/`, which ESLint and Fallow ignore.

## Where things stand (2026-10-10)

| Wave | PR | State |
| --- | --- | --- |
| 1 Quick wins | StorminRH/lgi-tools#652 | development and staging |
| 2 Tooling and test harness | StorminRH/lgi-tools#654 | development and staging |
| 3 `src/lib` primitives | StorminRH/lgi-tools#660 | development and staging (promote #668) |
| 4 Formatting, dates and names | StorminRH/lgi-tools#661 | development and staging (promote #669) |
| 5 Persistence and data-layer SQL | StorminRH/lgi-tools#663 | development and staging (promote #670) |
| 6 Config, env, ids and vocabularies | StorminRH/lgi-tools#666 | development and staging (promote #671) |
| 7 UI kit | StorminRH/lgi-tools#672 | open against development, handed to the promote session |
| 8 to 16 | — | not started; 140 items, see [Remaining waves](#remaining-waves) |

Nothing from this project is on `main`. Releasing staging to main is the owner's call, through the repo's `release` skill, and is not part of this project.

Every item's status lives on its guide page, in the `- **Status:**` line and the roadmap box:
- `[x] done` means it landed in that wave's PR.
- `[x] already done (see commit)` means development or an earlier item already had it; the evidence is in the commit.
- `[ ] blocked: …` names why nothing landed.

## Who does what

- **This project's operator** (a Claude Code session on the owner's machine) implements one wave per branch and PR: `claude/primitives-wave-NN`.
- **The promote session** prepares each finished wave PR into `development` and promotes it to `staging`, using the repo's `prepare` and `promote` skills. The owner set this up on 2026-10-10. It is the cloud session `session_01PpWy1W4P1oujSiRy921NtU` ("Promoting PRs").
- **Handoff.** Once a wave's PR is open and its CI is green, send the promote session the PR number, head SHA, base and any merge notes. Use the Claude Code Remote `send_message` tool if your session has it; otherwise give the owner the message to relay, as one copy-paste block. From then on the branch belongs to the promote session: do not push to it unless that session or the owner asks.
- **What comes back.** The promote session reports the fixes it made while preparing, such as development merges or review fixes (after wave 6: c830dabc, bfbbf20e, ba191c61). Its review may also flag leftovers for a later wave. Check each one against `.fallowrc.json` before acting: one wave-7 flag in `platform/purge` was out of reach of the shared helper. Always merge the latest `development` into your next wave before opening its PR.

## Owner rules for this project

- **One PR per wave.** Stack it on the previous wave until that one lands in `development`. Use merge commits; never squash, and never rebase or force-push a branch someone else may hold (AGENTS.md).
- **Fix what you find.** Pre-existing bugs and flaky tests found along the way are fixed inside the wave where they surface, without asking first, and noted in that wave's PR description. (Owner: "In the future if something like that comes up just fix it don't ask".)
- **AGENTS.md applies in full.**
  - Run `pnpm check` through the test-runner before every push, and `pnpm verify` at the end of each wave.
  - Fix every Fallow finding wherever it is.
  - No suppressions, threshold raises, overrides or baselines.
  - No production builds locally.
- **Resource rules.** The owner's local prompt sets them; see [Machine resources](#machine-resources). Where this file and that prompt differ, the prompt wins.
- **How to talk to the owner.** The owner listens to updates with text-to-speech, so write summaries and status updates as plain English prose that reads well aloud, with little code or markup, and say what changes for users. When the owner asks for a prompt or a message to relay, give it as one copy-paste block in chat.

## Running one wave

The kit's workflow does a wave end to end:
1. Docs briefs, one per technology.
2. For each item: a repo-mapper blast-radius map, the implementation, `pnpm check` through the test-runner with up to three fix rounds, and one commit with the guide status ticked.
3. Two reviewers (correctness and completeness), then a fix pass.
4. `pnpm verify`, with fix rounds.

### One-time setup on your machine

1. **Dependencies and database.** Run `pnpm install`, then `docker compose up -d postgres`. Postgres answers on `localhost:5433` with user and password `lgi` and database `lgi_tools`.
2. **Migrate.** Run `DATABASE_URL=postgres://lgi:lgi@localhost:5433/lgi_tools DATABASE_MIGRATION_URL=postgres://lgi:lgi@localhost:5433/lgi_tools pnpm db:migrate`. Repeat it whenever a merge brings new files under `drizzle/`; wave 7's branch has migrations up to `0082`. The `*.db.test.ts` suites clone their tables from the migrated `public` schema, and the SDE-backed suites need the SDE seed `.claude/cloud/GUIDE.md` describes.
3. **Shell environment.** Unset `DATABASE_URL` and `DATABASE_URL_UNPOOLED`, or point them at that local database. The test harness creates and drops `test_*` schemas in whatever `DATABASE_URL` names, and a profile that exports a Neon URL would aim it at Neon. `env_guard.sh` refuses to start otherwise.
4. **Claude Code.** Use a version with the Workflow tool, started in the repo root so it picks up `.claude/agents` (docs-researcher, repo-mapper, test-runner). repo-mapper uses Codegraph. Asking the session to "use a workflow" is the opt-in the Workflow tool needs.
5. **Permissions.** Use a permission mode in which workflow agents may run `git add`, `git commit`, `python3`, `bash`, `pnpm` and `pnpm exec vitest` without a prompt. In the cloud, auto mode's classifier blocked a commit step three times in seven waves. The script retries once, then stops with the tree intact (see [When something stops](#when-something-stops)).
6. **Attribution.** Create a trailers file for commit attribution at `.git/wave-trailers.txt`. It holds the lines your session's attribution settings ask for, typically a `Co-Authored-By:` line. Under `.git/` it is never committed.

### Each wave

1. **Branch.** Run `git fetch origin`. If the previous wave has merged into `development`, branch from `origin/development`. Otherwise branch from the previous wave's latest remote head, because the promote session may have moved it: `git switch -c claude/primitives-wave-NN origin/claude/primitives-wave-<N-1>`. Wave 8 starts from `origin/claude/primitives-wave-07` unless #672 has merged by then.
2. **Link the previous PR** from its guide page. Add `Landed in [StorminRH/lgi-tools#NNN](https://github.com/StorminRH/lgi-tools/pull/NNN).` on its own line after the "Part of the [primitive extraction guide]…" line of the previous wave's page. Commit it as `Link the wave <N-1> PR from its guide page`, and push the branch.
3. **Claim the checkout.** Tell the owner the checkout belongs to the wave for the next several hours:
   - Each commit step runs `git add -A`, so any file the owner adds there lands in an item commit.
   - A blocked item or a failed review fix runs `git checkout -- . && git clean -fd`, which deletes untracked files.
   - The end-of-wave sweep stops any vitest, next, Convex or tsgo process started after the wave began.

   Then run `bash docs/refactoring/kit/tools/env_guard.sh`. It needs `next dev` stopped: if it is running, ask the owner to stop it. Do not kill it. The tree must be clean.
4. **Build the args** right after the link commit, since `base` defaults to HEAD: `python3 docs/refactoring/kit/tools/make_args.py N --trailers .git/wave-trailers.txt > .git/wave-NN-args.json`.
   - Add `--fallow-env 'FALLOW_TYPE_AWARE_TIMEOUT_SECS=300 '` only if Fallow warns that its type-aware sidecar timed out (see gotchas).
   - Leave `--kill-next` off on the owner's machine.
   - The briefs, cautions and possibly-done hints come from `kit/waves/wave-NN.json`. Edit them there if a wave needs different documentation lookups.
5. **Run.** Call `Workflow({ scriptPath: 'docs/refactoring/kit/implement-wave.js', args: <the JSON object from that file> })`. Pass `args` as an object, not a string.
6. **While it runs.**
   - Push each item commit (`commit:PNNN`) as it lands: every one has passed `pnpm check`.
   - Hold the review and verify commits until their subjects say what they fix. The fix agents now write those subjects; reword one with `git commit --amend` only while it is unpushed.
   - Uncommitted changes during a run are the current item in progress: leave them alone, even if a hook asks you to commit them.
   - The run's journal is `~/.claude/projects/<repo path with / as ->/<session id>/subagents/workflows/<run id>/journal.jsonl`. `python3 docs/refactoring/kit/tools/watch.py <journal> --from-end` prints each commit, blocked item and failed check; `/workflows` shows the same.
7. **Read the result.** It lists each item's status, fix rounds and deviations, the review findings and fixes, whether `pnpm verify` passed, and the cleanup sweep. Check every `blocked` reason and every `already done` claim; correct a wrong status line by hand. Tell the owner what the sweep stopped, killed or left behind.
8. **Prepare the PR.**
   - Run `git fetch origin`, then merge the latest `origin/development` into the wave branch with a merge commit. While the previous wave is still open, merge its latest head too.
   - Resolve conflicts keeping each wave's intent (see [Merge notes](#merge-notes)). Run every check again even after a conflict-free merge: wave 2's merge broke a test that development had added.
   - Apply any new migrations.
   - For items that added, removed or renamed routes or pages, run `node scripts/assert-routes-present.mjs`.
   - Run `pnpm check` through the test-runner, then push.
9. **Open the PR** against `development`, or against the previous wave's branch while that is still open. Title it `Primitive extraction wave N: <theme>`. Follow the shape of #672 or #666:
   - What the wave does, and a stacking note if it is stacked.
   - Counts (implemented / already done / blocked) and the diff size.
   - **Behaviour changes**, user-visible, item by item.
   - **One home per concern.**
   - Leftovers folded in, and pre-existing bugs fixed along the way.
   - **Not checked by eye**: browser or screenshot steps the write-ups asked for. Nobody may start a dev server, so ask the owner whether to check them.
   - **Verification**: `pnpm check` per item, the review outcome, `pnpm verify` totals and the one expected skip, any verify fix and why, and the merges taken in.
   - End with your session's PR attribution lines.
10. **Watch CI to green.** On wave PRs, CI is Coverage health (`test:coverage` plus Fallow production coverage, path-filtered) and Semgrep. Watch it with `gh pr checks <n> --watch` or the GitHub tools your session has. GitHub's Verify job, which adds build, routes and e2e, runs only on manual dispatch: ask the owner before running `gh workflow run Verify --ref claude/primitives-wave-NN`. When CI is green, hand the PR to the promote session (see [Who does what](#who-does-what)) and stop pushing to the branch.

### When something stops

- **A commit step was blocked or failed.** The script returns `aborted`, runs the cleanup sweep, and leaves that item's changes uncommitted; they already passed `pnpm check`. Commit them by hand:
  1. `python3 docs/refactoring/kit/tools/mark.py PNNN done` (or `upstream` for already done).
  2. `git add -A`.
  3. `git commit`, using the item's subject and body from the journal's `impl:PNNN` result plus your trailers.

  Then resume.
- **Resume in the same session.** Stop the old run with TaskStop, then call `Workflow({ scriptPath, resumeFromRunId, args })` with the same args. Agents whose prompt and options are unchanged replay from cache, so finished items are not redone. Never edit a script that a run, or a resumable run, is using; copy it and resume from the copy.
- **If the session itself is gone** (crash, closed terminal, a new session), resume does not work. Start a fresh run instead:
  1. Deal with the interrupted item's uncommitted changes, because Prepare aborts on a dirty tree: commit them by hand if their check passed, otherwise revert them.
  2. Rebuild the args with `make_args.py ... --base <the wave's link-commit sha>`. The guide statuses are live, so landed items are skipped, and the base keeps the reviewers on the whole wave.
  3. If the fresh run lands nothing, its review is skipped, so review `git diff <base>...HEAD` yourself.
- **An item blocks.** Its changes are reverted and the guide records the reason, and the wave carries on. Decide later whether to retry it alone or fold it into another wave.
- **After any stop**, run `bash docs/refactoring/kit/tools/cleanup.sh sweep .git/wave-kit` before anything else.

### Cloud pace, for spotting stalls

These timings come from the cloud, on a slow four-core host:
- **Per wave:** wave 6 took about 5 hours for 21 items, wave 7 about 6.5 hours for 26. That is roughly 15 minutes per item, including its check.
- **Per check:** the changed-set vitest run took about 140 s, `test:coverage` about 300 s, the production dead-code pass about 164 s, and a full `pnpm verify` 30 to 40 minutes.

A local item far past these marks with no new journal entries is probably stuck on a backgrounded command.

## Machine resources

The kit is built to run on a personal machine without piling up processes or disk use:

- **No worktrees.** The wave workflow runs every agent in this one checkout, one item at a time. It never uses agent worktree isolation. Its agents are told never to create worktrees, clones or copies of the repo or `node_modules`, and never to run `pnpm install` unless an item needs a dependency.
- **Few agents at once.** The most that run together is the docs briefs at the start: two to five, one per technology. After that, the next item's repo map runs beside the current implementer, and the two reviewers run side by side. Implementation, checks and fixes are strictly sequential, and only one vitest process runs at a time.
- **No dev servers.** `next dev`, `next start` and `next build` are off limits. The Convex local backend may be started only for codegen, and must be stopped after.
- **Sweep at the end.** `kit/tools/cleanup.sh snapshot` records the dev processes and worktrees present when the wave starts. `cleanup.sh sweep` runs when the wave ends or stops early. It:
  - stops any vitest, next, Convex or tsgo process the run started;
  - removes clean worktrees the run added (dirty ones are reported, never deleted);
  - prunes stale worktree records;
  - prints disk use.

  Anything already running at the start, such as your own `convex dev`, is left alone.
- **Scratch files** (commit messages, notes, process snapshots) live in `.git/wave-kit/`, outside the work tree. They take a few kilobytes per wave.
- **One wave at a time.** Do not start a second wave workflow, or anything else that runs tests, while one is running: the database suites would collide.

## Gotchas learned in waves 1 to 7

- **`next dev` and typecheck.** `next dev` writes `.next/dev/types` while it runs; a typecheck that reads them fails with corrupt-file errors. Keep it stopped during a wave. Generate route types with `pnpm exec next typegen` (into `.next/types`), and rerun typegen after adding, renaming or removing a route, page or layout.
- **Fallow's type-aware sidecar.** On a slow host the sidecar exceeds its 120-second default. Fallow then falls back to syntactic analysis, and `fallow dead-code` reports hundreds of false unused exports: wave 3's verify reported 325. The same timeout reproduced on wave 2's already-green tip, which showed the host was the cause. `FALLOW_TYPE_AWARE_TIMEOUT_SECS=300` raises only that timeout and changes no rule, so it is allowed. A fast machine may not need it; the tell is a "type-aware sidecar timed out" warning.
- **Production dead code ignores tests.** `pnpm verify` runs `fallow dead-code --production`, which does not count test references. So an export that only tests read passes `pnpm check` and fails `pnpm verify`. Wave 6 hit this with six `*_SYNC_SCOPES` tuples and `COST_BASES`; 7317bfff fixed it by making them private. Do not export test-only constants or helpers; test through the production export instead.
- **Zone boundaries limit fold-ins.** Before moving code onto a shared helper, check that `.fallowrc.json` lets the importer reach it. `platform/purge` may import nothing from `src`, and `components/ui` imports only its siblings.
- **DB suites share schema names.** Each `*.db.test.ts` suite uses a fixed schema name, so two vitest processes against one database break each other. Never overlap vitest runs. Locally, check another branch only between waves, by switching the main checkout.
- **The one expected skip.** `src/db/advisory-lock.concurrency.test.ts` runs only with `DATABASE_URL` exported. Any other skip is a failure.
- **The test-runner agent** runs commands byte for byte from the session's working directory, one per call, with no `cd`, pipe or redirect. When its output is truncated, have it rerun the chained stages one at a time: `pnpm typecheck`, `pnpm lint`, the changed-set or full vitest, `pnpm fallow:static`, `pnpm fallow:coverage`. Ask it for each stage's summary lines.
- **Long commands look like failures** if a two-minute tool timeout cuts them off or they slip into the background. Every check prompt in the kit asks for long timeouts and a real exit. Never act on a command you did not see finish.
- **Serializable writes retry centrally.** Wave 5 moved serialization-failure retries into `runSerializable` (`src/db/serialization-retry.ts`, ten jittered attempts). Do not add retry loops at call sites; development's 0f419b32 had one, and the merge kept wave 5's.
- **Commit messages.** The subject is imperative, at most 72 characters, and ends with the item id. The body says what changed and why. Add the attribution trailers. No process narration ("as requested", "the workflow", "I changed nothing").
- **The guide's line ranges are stale.** It was written against `e5b7b17`, so re-open every site and grep for new copies of the pattern. Earlier waves and development often finished part of a later item; the workflow marks those `already done` with evidence. Two README forecasts are not true yet:
  - `src/lib/write-behind.ts` does not exist until P077 (wave 12).
  - `src/lib/memoize.ts` does not exist until P189 and P292 (wave 11).

## Merge notes

These conflicts recur when `development` or an earlier wave is merged in. Here is how they were settled:

- `src/features/industry-planner/profiles/queries.ts` and `create-profile.test.ts`: keep wave 5's side, with no in-function retry; `runSerializable` retries.
- `src/app/(site)/admin/health/ServiceLevelRows.tsx`, `src/app/(site)/admin/esi/esi-view.ts` and `src/data/telemetry/health-metrics*.ts`:
  - The ESI 4xx share formats through `formatClientErrorShare`, so tiny shares read "<0.1%".
  - `formatFallbackShare` lives in `data/telemetry/health-metrics`.
  - `formatAgo` is gone in favour of `formatElapsed`.
  - Day labels use `isoDay`.
- `src/data/eve-data/entity-names.ts`: keep development's current version (askBatch recursive split, post budget, int4 id schema, no fan-out import).
- Do not re-export what a verify fix made private: wave 6's scope tuples and `COST_BASES`.

## Shared primitives to reuse

Earlier waves created these homes. Later items must use them rather than add copies; the guide's later write-ups predate some of them.

- **`src/lib`:**
  - `array`: dedupe, chunk, groupBy, sortedUniqueIds, idsKey, parseIdsKey, getOrInsertComputed.
  - `fan-out`: mapConcurrent, mapByIdDroppingNulls.
  - `failure`: errorMessage, FailureResult, CheckResult.
  - `retry`: sleep, readWithRetries.
  - `equality`: sameFields.
  - `graph`: breadthFirst, pathTo. Wave 15's mapper BFS items should adopt it.
  - `db-upsert`: excluded, excludedSet.
  - `db-execute`: executeRows.
  - Also: `math`, `error-chain`, `best-effort`, `iso-date`, `search-params`, `use-now`, `web-storage`, `section-path`, `id-schemas`, `scope-eligibility`, `bearer`, `url-safety`, `peer-channel`, `db-columns`, `batched-delete`, `deferred-work`.
- **`src/lib/format`:** `number` (formatQuantity, formatCount, formatPct, formatSigned), `isk`, `time` (formatUtcMinute, formatElapsed, stripUtcYear), `names` (unresolvedName, nameOrUnresolved, formatStationName), `text` (humanizeIdentifier).
- **`src/db`:** `direct-database`, `advisory-lock` (ADVISORY_LOCKS), `locked-user`, `serialization-retry`, `pg-errors`.
- **`src/config`:** `eve-scopes` (EVE_SCOPES, EveScope), `public-env`.
- **`src/transport`:** `beacon`, `route-id`, `route-body`, `endpoint`, `api-client`, `api-response`, `decode`, `cron`, `correlation`.
- **Domain vocabularies:** ESI owner types in `platform/owner-sync`, `scopeHolderOf` in scope-health, connection door sides (`ConnectionDoorSide`) and the wormhole codex index (`indexWormholeCodex`) in data/eve-data.
- **`src/components/ui` after wave 7:**
  - The dialog kit in `dialog.tsx`: DialogBody, DialogFooter, DialogCloseButton.
  - Components: `section-panel` (SectionPanel), `stat-figure`, `help-popover`, `switcher-menu`, `choice-row`.
  - CollapsibleChevron in `collapsible`, SkeletonGroup in `skeleton`, ExternalLink in `text-link`.
  - Helpers: `combobox-pick` (pickOrType), `use-confirm-gate`, `overlay-portal-container`.
  - Outside ui: `components/composition/StatusPanel`, and SectionNote in `components/composition/board/SectionBody`.
- **Test helpers:**
  - `src/lib/__tests__`: route-requests, hook-runtime, console-tags, source-scan.
  - `src/db/__tests__/support`: db-test-harness, fake-query-chain, schema-reflection.
  - `src/composition/__tests__/session-fixture`.
  - `src/components/ui/__tests__/static-base-dialog`, the shared Base Dialog stub for markup tests.

## Remaining waves

The briefs, cautions, possibly-done hints and cross-wave dependencies for each are in `kit/waves/wave-NN.json`. Every dependency on waves 1 to 7 has landed. The open ones point to earlier waves in this list, so running in order satisfies them.

| Wave | Items | Theme | Docs briefs | Depends on |
| --- | --- | --- | --- | --- |
| 8 | 15 | Charts, images and board/workspace adoption | React, Next.js, visx, Better Auth, Vitest | — |
| 9 | 19 | Auth, routes and the mutation/transport pipeline | Next.js, Better Auth, Zod, Drizzle, Vitest | P222 on P067 (wave 8) |
| 10 | 16 | Server pipelines, purge, telemetry and the admin console | Next.js and React server APIs, Vitest, Drizzle, tsx and dotenv | P159 on P141, P251, P161 (wave 9) |
| 11 | 18 | ESI reads, owner-sync and owner-dataset persistence | Next.js caching, Drizzle, Vitest, Zod, Fetch and ESI headers | P241 on P240 (wave 10) |
| 12 | 15 | Market data, search and client data reads | React and the hooks lint, Next.js, Vitest, Base UI | P063 on P010 (wave 8), P065 on P068 (wave 9) |
| 13 | 14 | Industry planner and wormhole-sites verticals | React, Next.js, Drizzle, Vitest, Fallow | P291 on P076 (wave 12) |
| 14 | 16 | Convex backend helpers | Convex, convex-test and Vitest, Zod, Fallow | — |
| 15 | 23 | Mapper client: canvas, tracking, scanner and authoring | React, React Flow, Base UI, Convex, Vitest | P032 on P075 (wave 12), P298 on P072 (wave 13) |
| 16 | 4 | Large cross-cutting migrations (last) | Drizzle, Zod, Convex HTTP actions, Tailwind and cva, Vitest | P138 on P063, P054 (wave 12) and P146 (wave 9); P246 on P208 (wave 14) |

## Follow-ups outside the waves

These are open questions and leads from waves 1 to 7. Do not settle the owner's questions yourself: carry them into the relevant PR description and ask.

- **Owner questions:**
  - **P335:** before release, confirm that nobody purges the removed `eve-status` cache tag by hand.
  - **P296:** an operator audit of `eve-user-%` users that the old deploy backfill already re-created.
  - **P134:** optional step 9, linting `NEXT_PUBLIC_*` reads outside `src/config`, was skipped. The owner decides.
  - **P209:** should the maps purge contributor skip Convex calls when Convex is unconfigured? `account-purge.db.test.ts` pins today's retry.
  - **P015:** the `/atlas` failure state now shows the warn LoadFailed banner with no visible heading, and the design screenshot check was never done.
  - **The kit itself:** it stays Python. The owner was offered a Node port and did not choose one. The session that runs wave 16 asks the owner whether to delete `docs/refactoring/kit/` once the last wave lands; if yes, do it in a separate commit after wave 16's workflow has finished.
- **Optional leads:**
  - Inline `isBoundaryStaleMs` (P304).
  - Demo-board `demoHistory` (P096).
  - Wormhole-sites hydration duplication (P101).
- **Test infrastructure:** the DB suites' fixed schema names (73 suites) make concurrent vitest runs collide. Per-run schema names would fix it; that is out of scope so far.
- **Fallow warning:** Fallow prints a benign "boundary zone 'esi-datasets' matched 0 reachable files" warning in production mode, because `src/esi-datasets` holds only tests. It is not a finding.
