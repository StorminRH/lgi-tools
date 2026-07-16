# PR & Review Loop

> Read this after the pre-PR design review passes for a complete sub-version
> (sent here from `SESSION_END.md`, via the `close-out` skill). Owns the PR open
> + Greptile review loop. The goal: one PR per sub-version, reviewed on finished
> code, fixed in-branch, merged clean.

---

## Why one PR per sub-version

Greptile's review runs on PR open (the cloud GitHub App). So the PR is the single
review gate for the whole sub-version. Everything built across this branch's sessions
gets reviewed together, as finished code — not piecemeal across half-built sessions.
Expect Greptile to find real issues; that's the point of consolidating the review here.

---

## Step 1 — Open the PR

- Require a passed `docs/PRE_PR_DESIGN_REVIEW.md` gate. Any measured hotspot
  surface changed by the branch must already be reconciled in
  `docs/CODE_HEALTH_BASELINE.md` before the PR opens.
- One PR, feature branch → `main`, covering the entire sub-version.
- Title and description in plain English (see the active `CLAUDE.md` or
  `AGENTS.md` commit style). Describe
  what the sub-version does for the project, not the file-by-file changes.
- **Fill the test plan.** List what you verified and how — the local-dev checks
  from each session, the test suite result, any manual end-to-end runs. A
  reviewer (human or bot) should be able to see what's already been confirmed.
- Use the established reviewer-facing body format from the recent LGI.tools PRs,
  in this exact order:
  1. `## What this does` — cohesive prose describing the delivered behavior;
  2. `## Why` — the user or maintenance problem this solves;
  3. `## Notes` — constraints, deliberate non-changes, rollout/review context,
     and the concise design-review outcome required by
     `docs/PRE_PR_DESIGN_REVIEW.md`;
  4. `## Test plan` — completed verification written as past-tense evidence.
  Do not substitute a terse `## Summary` section or a file-by-file change list.
  Keep all four headings; write `None.` under Notes when there is genuinely
  nothing noteworthy.
- **Privacy-scrub every PR title and body before posting.** Pull requests are
  public reviewer-facing artifacts, so never copy personal information from
  local paths, scratchpads, memories, browser profiles, CLI output, or internal
  planning prose into them. Exclude personal names, email addresses, account
  usernames/handles, machine names, home-directory paths, browser/profile
  details, and private identifiers. Describe human verification role-neutrally
  (for example, "authenticated local browser review" or "operator review")
  instead of naming the person. Public project evidence such as repository
  names, PR numbers, commit SHAs, and deployment IDs remains appropriate.
- Prepare the complete Markdown body in a temporary file and pass it with the
  CLI's body-file option. Do not interpolate a Markdown PR body directly into a
  shell command: backticks and substitutions can execute locally, corrupt the
  body, or expose local information. After creating or editing the PR, read the
  published body back from GitHub and confirm both the four-section format and
  the privacy scrub before starting the review poll.
- Confirm the local close-out gates are green: `pnpm verify`, then a fresh
  `pnpm test:coverage`, then
  `FALLOW_AUDIT_BASE=$(git rev-parse origin/main) pnpm fallow`. The second Fallow
  pass uses real coverage for CI-equivalent CRAP attribution; a red result blocks
  the PR and must be fixed with meaningful behavioral coverage or simpler code.
  Record the coverage-backed pass in `## Test plan`.

> If this sub-version changed a user-facing surface, the operator's local-dev review
> happens **before** the PR opens (see `SESSION_END.md`). Don't open the PR on a
> user-facing sub-version until he's approved.

---

## Step 2 — The Greptile loop

Greptile reviews on PR open and takes a few minutes. After opening the PR, **wait
for the review (poll for it) rather than treating the PR as done** — the session
isn't complete until the review gate below is met.

**Start a background poll the moment the PR is open** — don't manually re-check. Launch a
`run_in_background` Bash `until`-loop (one notification, fires when it exits) that polls the
issue-comments endpoint every ~30s for a `greptile-apps[bot]` comment and prints its body
when it lands. Keep working meanwhile; you're notified when the review posts.

```
repo=<owner>/<repo>; pr=<number>; head=$(git rev-parse HEAD)
for i in $(seq 1 40); do
  # max_by(.updated_at), NOT `last` — see the gotcha below. Gate on the body
  # naming the CURRENT head sha so a re-review on a new push isn't satisfied by
  # the stale prior body.
  body=$(gh api "repos/$repo/issues/$pr/comments" --paginate \
    --jq 'map(select(.user.login=="greptile-apps[bot]")) | max_by(.updated_at) | .body // empty' 2>/dev/null || true)
  if echo "$body" | grep -q "$head"; then echo "$body"; break; fi
  sleep 30
done
```

**GOTCHA — Greptile EDITS its summary comment in place; `last` grabs the wrong one.**
On a re-review Greptile does **not** post a new
summary — it updates the body of an *earlier* comment in place (its `updated_at`
moves; `created_at` does not). There can also be **more than one** `greptile-apps[bot]`
issue comment, and the rolling-updated one is often **not** the most-recently *created*.
So `... | last` (creation order) can lock onto a stale comment that still cites an old
commit, and the poll never "sees" the new review even though it's right there. **Select
the greptile comment with the latest `updated_at`** (`max_by(.updated_at)`), and **gate
on the body referencing the current head sha** (the "Last reviewed commit" footer holds
the full sha) so you detect the re-review of *this* push, not a prior one. Verify which
comment is live with:
`gh api repos/<owner>/<repo>/issues/<pr>/comments --paginate --jq '.[] | select(.user.login=="greptile-apps[bot]") | {id, updated:.updated_at, reviewed:(.body|capture("commit/(?<s>[0-9a-f]{7,40})").s)}'`

**Where Greptile posts — poll PR _comments_, not just reviews.** Greptile leaves its
summary as an *issue comment* (author `greptile-apps[bot]`, body opens with "Greptile
Summary"), plus any inline *review comments* — it does **not** submit a formal PR
review. A watcher that polls only the reviews endpoint will report "no review" while
the review is sitting right there. Poll the comment endpoints:
- issue comments (the summary): `gh api repos/<owner>/<repo>/issues/<pr>/comments`
- inline review comments: `gh api repos/<owner>/<repo>/pulls/<pr>/comments`

Filter out your own login (and `vercel[bot]`, if a manual preview happened to be
attached to the PR); treat a `greptile-apps[bot]` comment as the review landing.
(`.../pulls/<pr>/reviews` — the formal-review endpoint — stays empty, so don't gate on it.)

**GOTCHA — review passes RACE; the poll passing is NOT the merge gate (PR #201, 2026-07-10).**
A fix-push and an explicit `@greptileai` mention can EACH fire a review pass, and both
passes satisfy the head-sha gate — so the poll can exit on the first pass's body while a
second pass is still running. On #201 the second pass edited the summary from 5/5 down to
4/5 and posted a new inline P1 **forty seconds before the merge went through**; the merged
PR carried an open finding. Two standing rules follow (operator-directed):

1. **Re-read at merge time, every time.** Immediately before `gh pr merge` — after ANY
   fix-push, justification reply, or re-trigger — fetch the live summary again
   (`max_by(.updated_at)`) and the full inline-comment list. Merge only if the summary still
   shows 5/5 for the current head AND no `greptile-apps[bot]` comment (summary edit or
   inline) is newer than the body the poll gated on. Anything newer = a fresh review pass —
   triage it as a new round, never merge past it.
2. **Expect genuinely NEW findings on later passes.** A re-review is not a re-check of the
   old findings; each pass can surface new issues elsewhere in the diff (second/third/nth
   passes regularly do). A clean pass N says nothing about pass N+1 — which is exactly why
   the merge-time re-read exists.

When it posts findings:

1. **Triage every finding — including the ones Greptile labels non-blocking,
   minor, style, or "nit".** Severity is Greptile's opinion, not a merge
   exemption. For each finding, decide one of three: **fix it**, **justify not
   fixing it**, or **defer it as out-of-scope**. "It won't break the build" is
   NOT a fourth option — a real bug that happens not to break the build still
   gets fixed. Don't silently ignore one.
2. **Fix in-branch.** Commit the fix to the same branch; it lands on the same PR.
   Nothing Greptile finds becomes a carry-forward — the `SESSION_END.md`
   fix-in-branch rule applies here too.
   Before pushing any code-changing review fix, rerun fresh full coverage plus the
   pinned-base Fallow command above so the next CI pass cannot surface a locally
   reproducible CRAP failure.
3. **A justification is a claim, not a verdict.** If you're not fixing a finding,
   reply to that comment with `@greptileai <your reasoning>` so Greptile
   re-reviews the point and can push back. You do NOT get to justify and merge in
   the same breath — post the reasoning, then **wait for Greptile's response**. If
   it pushes back, either fix the finding or answer the pushback; a finding is only
   resolved-by-justification once Greptile has replied and does not object. **Never
   merge while any justification is still awaiting its reply.**
4. **Re-trigger the review explicitly.** After a fix-push OR a justification reply,
   comment `@greptileai` on the PR to force a fresh review — do **not** assume the
   push re-triggered it. Auto-review-on-push is a team setting and not guaranteed;
   PR-open and an explicit `@greptileai` mention are the reliable triggers (no rate
   limit). Then poll for the re-review (above).
5. **Repeat** until **every** finding has reached a resolved state: fixed, or
   justified with Greptile not objecting on re-review, or recorded in
   `docs/backlog.md` as genuinely out-of-scope (what / why-deferred / rough size /
   trigger — see Step 3).

> **Detecting the re-review depends on whether there was a new commit.** A
> **fix-push** moves the head sha, so the summary-body poll above (gated on the
> current head sha) catches it. A **justification-only** re-trigger has **no new
> commit** — the head-sha gate can't tell the new pass from the old one. Watch the
> *inline* thread instead: Greptile's answer lands as a new inline comment from
> `greptile-apps[bot]` on `repos/<owner>/<repo>/pulls/<pr>/comments` (new comment
> id / `created_at`). Poll for that reply, then read whether it objects.

**The review gate is met** only when BOTH hold: confidence is **5/5** AND there are
**zero open findings** — each one fixed, justified with no Greptile objection on
re-review, or backlogged as out-of-scope. **The score alone is not the gate**: a
"5/5 / safe to merge" verdict with unresolved comments under it is NOT a pass.
(Greptile's own agent loop runs until *5/5 AND zero comments* — two conditions, both
required.) Surface the state plainly: list each finding and how it was resolved.
Then see Step 4 for who merges and when.

---

## Step 3 — Scope discipline during the loop

The PR loop is for **fixing what Greptile found in this sub-version's code** —
not for adding new scope. If a finding reveals a larger, separate problem
(something outside this sub-version), record it in **`docs/backlog.md`** as a
deferred item (what / why-deferred / rough size / trigger) rather than expanding
the PR. Keep the PR converging toward merge, not growing.

Exception: a small, obviously-related bug Greptile surfaces that belongs to this
sub-version — fix it here even if it's slightly beyond the original session
scope. The boundary is the same as `SESSION_END.md`'s: *does this belong to this
sub-version?* If yes, fix it on the branch. If no, it's a backlog item.

---

## CHANGELOG

Every completed sub-version gets an entry — user-facing features and fixes **and**
internal work (refactors, CI, tooling, infrastructure, cleanup). As the app matured
the old "user-facing only" rule was retired: a complete record is more useful than a
curated one. Write each change for the reader it serves — a user-facing change in
plain pilot language, an internal one in a plain sentence a teammate would understand
— and tag it Added / Changed / Fixed / Removed. A sub-version with no user-facing
surface just gets an all-internal entry; it still carries a version + date, and still
bumps `APP_VERSION`.

Format is strict (the parser, `src/features/changelog/parse.ts`, is intentionally
narrow). The changelog is a **version timeline grouped into master-version
chapters**: each release is one entry tagging its changes by type, and the
changelog page automatically files it under its **master version** — the first two
version segments, so `3.7.0.1` and `3.6.28` fall under `v3.7` and `v3.6`. The
grouping is *derived from the version prefix*, so you add no grouping markup per
entry — write the entry as usual.

**Where it lives.** The changelog is split into one file per master version under
`content/changelog/` — `v3.8.md`, `v3.7.md`, … plus `_preamble.md` for the title and
intro. To add a release, prepend your `### v<version> — date` entry to the top of its
master's file (`content/changelog/vX.Y.md`), directly under the `## vX.Y — Title`
heading + summary, so entries stay newest-first. The loader concatenates the files
(preamble first, masters newest-first) before parsing, so the format below is unchanged.

```
### v<version> — YYYY-MM-DD

#### Added
- One user-facing change per bullet, written for someone who doesn't know the codebase.

#### Changed
- …

#### Fixed
- …

#### Removed
- …
```

Entries are newest-first; each heading is `v<version>` + an em-dash (or hyphen) +
the ISO ship date. Under it, only the
`#### Added | Changed | Fixed | Removed` groups that apply, each with `- ` bullets.
Within a bullet, **bold** and `inline code` are passed through as raw markdown text
(the renderer shows them literally) — keep prose plain.

**New master version → new file with a theme heading.** When your entry is the *first*
release of a master version that has no file yet (e.g. the first `v3.8.x` ships), create
`content/changelog/v3.8.md` starting with the themed heading, its summary, then the entry.
The loader sorts masters newest-first, so the new file auto-renders at the top:

```
## v3.8 — <the version's theme>

<a one- or two-sentence plain-language summary of what the version delivers for players>

### v3.8.0.1 — YYYY-MM-DD
…
```

The heading is a level-2 `## vX.Y — Title` (master version + em-dash/hyphen + theme),
followed by a short **summary** — the plain prose paragraph(s) between the heading and
its first `### ` entry, which the changelog page renders as an intro under the title
(shipped 3.7.36.1: `ChangelogMaster.summary` / `MasterSection`). Both are opt-in — a
master with no heading renders as a bare version number, and a release that stays
within an existing master adds no heading. The theme text is the version's theme, taken
from its plan doc's stated master title; the summary is written at close-out from the
whole master's shipped work, in plain pilot language (**plain text only** — no
`**bold**` or `[links]`; the renderer shows raw markdown literally). Grow the parser
first if a future entry needs anything beyond the master/version/date headings + master
summary, the four change-type groups, and flat bullets.

Bump `APP_VERSION` (`src/config/app-version.ts`) to match — the footer surfaces it
as a link to /changelog, and the changelog header reads it as the current version.

---

## Step 4 — Merge

Merge only when:

- The Step 2 review gate is met: **5/5 confidence AND zero open findings** (each
  one fixed, or justified with no Greptile objection on re-review, or deferred to
  the backlog as out-of-scope). A 5/5 with open comments under it is **not** clean —
  do not merge it.
- **The merge-time re-read ran clean** (Step 2's race gotcha): the live summary +
  the full inline-comment list re-fetched immediately before `gh pr merge`, still
  5/5 for the current head, with no greptile comment newer than the body the poll
  gated on. A poll that passed minutes ago is stale evidence — passes race and edit
  the verdict in place.
- CI is green.
- The work has been verified on the local dev server (or a manual preview, if one
  was spun up for data the local DB can't hold).
- For a user-facing sub-version: the operator has reviewed it on the local dev server (the
  pause happens **before** the PR opens — see `SESSION_END.md`).

**Who merges:** the agent merges via the `close-out` skill once the above hold.
Non-UX sub-versions self-finish with no further pause; user-facing ones merge after
the operator's pre-PR review. There is no separate hold for the operator to merge.
Merging to
`main` triggers the production deploy — migrations and first-deploy SDE ingest apply
automatically. After merge:

- Delete the feature branch (and tear down any manual preview + its Neon branch, if
  one was created for this work).
- **Use a browser-first production smoke after the deployment reaches Ready.** Open
  the production site in the runtime's real-browser surface and verify the shipped
  version, affected routes, auth/admin redirects, and browser console. Do not use a
  curl/custom HTTP script as the primary production review: the public edge may
  intentionally rate-limit automated clients even while the app is healthy. Use the
  Vercel CLI for deployment state and runtime-log inspection.
- Move the sub-version to one line in the scratchpad's shipped ledger; relocate
  any detailed write-up to the archive.
- Change the merged session plan's `Execution status` to `Complete` and mark the
  master-plan row terminal with the actual PR/merge evidence. These two updates
  are what let the lifecycle resolver advance safely.
- If sessions remain, cut a fresh branch for the next sub-version off the
  updated `main`.
- **At version close** (the final master-plan row became terminal): do not
  archive or cut the next version branch here. Leave the master plan, contracts,
  session plans, and SCRATCHPAD evidence active, then run the resolver.
  Mark a mapped finding Delivered only after all its sub-versions have terminal
  merge evidence, report the resolver directive, and return control to
  `start-session` without selecting the next handler. Only a fresh clean audit
  may archive the bundle per `docs/DEVELOPMENT_LIFECYCLE.md`.

---

## Exit criteria

The PR is done when: merged to main, branch deleted, scratchpad ledger updated,
and the CHANGELOG entry is present (see the CHANGELOG section above). If sessions
remain, the next branch is cut from clean main; if the version is complete, the
resolver selects audit planning or audit restart and the version artifacts
remain active.
