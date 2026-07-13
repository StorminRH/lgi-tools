## Greptile
<!-- updated: 2026-06-30 -->

Greptile is the rail that made me most uncomfortable at first.

That is probably the right place to start, because “AI reviewing AI-written code” can sound like I am just asking one model to bless another model’s work. If that were the whole process, I would not trust it. A second AI opinion is not a substitute for architecture, tests, type checks, lint rules, route assertions, or my own review.

The reason Greptile became useful is that it sits at a different point in the workflow.

By the time a pull request reaches Greptile, the repo has already run the deterministic checks: TypeScript, ESLint, tests, route assertions, coverage, and Fallow. Those rails answer questions the repo can state clearly. Does the code typecheck? Did a route drift rendering mode? Did a file cross an import boundary? Did the branch add dead code? Did a test fail?

Greptile answers a different kind of question: “Looking at this pull request as a reviewer, what did the implementation miss?”

That matters in an AI-built repo because the implementation agent is usually very focused on satisfying the prompt. It can follow instructions, make broad changes, and keep the local tests green. But it can also inherit blind spots from the prompt. If I forgot to mention a race condition, a stale data path, or an implicit security assumption, the implementation agent may never go looking for it. Greptile gives the branch another reader after the work is done.

I do not treat that reader as authority. I treat it as pressure.

That distinction is the whole point of the rail. A Greptile comment can send a branch back into code. A clean review can increase confidence. But it does not replace `pnpm verify`, CI, build assertions, route classification, or my own decision about whether the architecture still makes sense. Greptile is the last AI rail, not the final judge.

The best reviews it has given me were not broad style comments. They were specific places where the diff looked correct at first glance but had a hidden assumption.

[PR #169](https://github.com/StorminRH/lgi-tools/pull/169) is a good example. That work stopped re-sending full character data through the live layer on every refresh. The direction was right. The review caught a stale-data bug in the corporation jobs path: a state marked as needing a role could still carry old cold payload data, which meant the UI could keep rendering jobs for a corporation user who no longer had access. The fix was not philosophical. It was concrete: do not let a denied or role-missing state keep old data attached.<sup><a href="#code-greptile-pr169">1</a></sup>

[PR #178](https://github.com/StorminRH/lgi-tools/pull/178) had a different shape. The feature brought corporation structures into the Industry Planner, behind a consent gate. The review found that the corp-structure rig route was missing the same server-side rig-type validation the custom-structure route already had. Without that, a bad rig could be saved and silently produce no bonus. That is exactly the kind of bug that can hide in a large feature: one path has the right rule, the sibling path almost matches it, and the mismatch is easy to miss because the UI looks fine.<sup><a href="#code-greptile-pr178">2</a></sup>

[PR #180](https://github.com/StorminRH/lgi-tools/pull/180) was more serious. The account-deletion work had to remove user data across several stores. The review called out a time-of-check/time-of-use gap: a user could link a new character while the account purge was already running. If the purge only used the initial character snapshot, the later account deletion could remove the account row while leaving newly linked per-character cached data behind. The fix was to re-enumerate characters in a loop before deleting the user, so the purge catches characters that appear during the deletion window.<sup><a href="#code-greptile-pr180-toctou">3</a></sup>

That same PR also exposed an implicit precondition. One helper assumed `runPurge` had already deleted the credential-tier account row before reconciliation ran. That was true in the current call path, but it was not obvious from the helper itself. Greptile’s value there was not that it discovered a catastrophic bug. It made the assumption visible enough to encode and explain, which matters because future AI sessions may reuse helpers without remembering the original call order.<sup><a href="#code-greptile-pr180-precondition">4</a></sup>

[PR #179](https://github.com/StorminRH/lgi-tools/pull/179) shows the smaller version of the same benefit. That PR made every player-data store declare how it gets purged. The review pointed out an unnecessary `.returning()` result and a misleading import/header comment in the purge contributor registry. Those are small issues, but in this repo small context errors matter. A stale comment or slightly misleading registry surface becomes training data for the next coding session. Cleaning that up is not busywork when the next agent will read the same code for direction.<sup><a href="#code-greptile-pr179-small">5</a></sup>

That is the pattern I care about. Greptile is most useful when it finds one of four things: a security or authorization gap, a stale-data path, an unspoken precondition, or a context mismatch that could mislead future work. Those are the review categories that complement the deterministic rails. TypeScript can tell me two shapes disagree. Fallow can tell me an import crossed a boundary. Greptile can sometimes tell me, “This branch satisfied the stated task, but it left a dangerous interpretation behind.”

There is still a judgment problem. Not every AI review comment is right. Some comments are too cautious, some are shallow, and some misunderstand project-specific intent. I do not want to obey them automatically. The workflow I want is closer to how I treat a human reviewer: read the comment, decide whether it is grounded in the code, fix it if it is real, and leave the branch alone if it is not.<sup><a href="#code-greptile-check-pr-doc">6</a></sup>

That is also why Greptile belongs at the end instead of the beginning. If I used it before the repo-owned rails, it would become noise. The model would be reviewing code that might not typecheck, might not pass tests, and might not respect known boundaries. By running it after the deterministic checks, I make its job narrower: look for what the rules did not already catch.<sup><a href="#code-greptile-loop-doc">7</a></sup>

The bigger lesson is that AI review is only useful when the repo already knows a lot about itself. Without TypeScript, ESLint, tests, route assertions, Fallow, and code-owned architecture boundaries, Greptile would have to judge everything. I do not want that. I want it looking for the leftover human-shaped questions: what assumption did the prompt miss, what path did the implementation forget, what stale state can survive, what security check exists in one sibling route but not another?

So Greptile is not where I outsource trust. It is where I add one more kind of friction before merge. In a project built with AI, that friction is valuable. The goal is not to make every PR feel clean faster. The goal is to make the branch argue its way through enough different kinds of review that the remaining mistakes are harder to hide.

<!-- uth:code-excerpts:start -->
<!-- uth:code id="code-greptile-check-pr-doc" file="greptileai/skills/check-pr/SKILL.md" lines="75-85,145-156" lang="md" -->
```md
## Fetch PR/MR/CL details

GitHub:
- gh pr view <PR_NUMBER> --json title,body,state,reviews,comments,headRefName,statusCheckRollup
- gh api repos/{owner}/{repo}/pulls/<PR_NUMBER>/comments
- gh api --paginate "repos/{owner}/{repo}/issues/<PR_NUMBER>/comments?per_page=100"

GitHub PRs are also issues, so general PR comments live on the issue comments endpoint. Greptile may edit a single general PR comment on each review cycle instead of creating a new review or comment. Always inspect the latest Greptile-authored general comment by updated_at.

Review comments:
- Inline code review comments that need addressing
- Bot review comments, for example greptile-apps[bot]
- Human reviewer comments

General comments:
- For GitHub, check the issue comments endpoint and use updated_at to catch bot comments edited in place.
```

<!-- uth:code id="code-greptile-loop-doc" file="greptileai/skills/greploop/SKILL.md" lines="78-90,103-147,204-220,77-91" lang="md" -->
```md
## Loop

Repeat the following cycle. Max 5 iterations to avoid runaway loops.

A. Trigger Greptile review
- Push the latest changes.
- If Greptile is not already running, request a fresh review with: @greptile review.
- Poll for the Greptile check run to complete.

B. Fetch Greptile review results
Greptile may surface its score in several places. Check all relevant sources:
- PR description
- General PR comments
- PR reviews

Filter for Greptile-authored comments and use the body from the most recently updated comment, not the most recently created comment.

Exit conditions:
- Confidence score is 5/5 and there are zero unresolved comments
- Max iterations reached

For each unresolved Greptile comment:
- Read the file and understand the comment in context.
- Determine if it is actionable or informational.
- If actionable, make the fix.
- If informational or a false positive, note it but still resolve the thread.
```

<!-- uth:code id="code-greptile-pr169" file="GitHub PR #169 review thread" lines="convex/corpIndustryJobs.ts:238" lang="md" -->
```md
P1 security — Needs-Role Keeps Stale Payload

When a corp has synced successfully before and a later run returns `needs_role`, `result.jobs` is `null`, so this branch leaves the existing `corpIndustryJobsSyncData` row in place. The hot row now says access failed, but the cold `forViewer` query still returns the old board and the client merge shows stale corp jobs for a corp the user can no longer read.
```

<!-- uth:code id="code-greptile-pr178" file="GitHub PR #178 review thread" lines="src/app/api/account/corp-structures/rigs/route.ts:30-33" lang="md" -->
```md
P2 — Missing server-side rig-type validation

The `rigTypeIds` sent to this endpoint are written directly to the DB without verifying that they are real industry rigs that fit the corp structure's type. The custom-structures route calls `validateCustomStructureSelection`, but the corp equivalent performs no such check. Supplying an unknown or wrong-slot rig ID produces an empty dogma entry at read time, silently contributing zero bonus instead of the expected one.
```

<!-- uth:code id="code-greptile-pr180-toctou" file="GitHub PR #180 review thread" lines="src/features/auth/queries.ts:750-759" lang="md" -->
```md
P2 — TOCTOU gap: concurrently-linked character escapes the nuke

`nukeAccount` snapshots the linked-character list once at the top, then iterates. If a concurrent request links a new character after that query but before `db.delete(user)`, the new character's `account` row is cascade-deleted by the user-row drop, but per-character cached rows keyed on `characterId` can survive as unowned orphans.

A re-query of remaining linked characters immediately before deleting the user, combined with a per-character purge for any newcomers, closes the window.
```

<!-- uth:code id="code-greptile-pr180-precondition" file="GitHub PR #180 review thread" lines="src/features/auth/queries.ts:731-737" lang="md" -->
```md
P2 — `reconcileAfterCharacterRemoval` relies implicitly on `runPurge` having already deleted the account row

The function queries surviving linked accounts and expects the removed character's account row to be gone already. If a future caller invokes it before the credential purge, the character being removed can still appear in `remaining`, causing account cleanup to report the wrong state.

Worth a brief precondition note in the function's comment to keep this contract visible.
```

<!-- uth:code id="code-greptile-pr179-small" file="GitHub PR #179 review threads" lines="src/features/auth/purge.ts:44, src/purge/register-all.ts:8-10" lang="md" -->
```md
P2 — The `.returning({ id: account.id })` result is awaited but never captured or checked. The semantic is not needed here, so the clause can be dropped to avoid the unnecessary round-trip of deleted row IDs from the database.

P2 — The file header says contributors are listed in tier order, but the imports open with a durable contributor followed by a credential contributor. The `PURGE_CONTRIBUTORS` array is correctly ordered; the comment is misleading relative to the import order.
```
<!-- uth:code-excerpts:end -->
