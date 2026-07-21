# Session-End Checklist

> Read this at the end of **every** coding session, before doing anything to
> close out. It decides whether the session ends with a commit or a PR, and how
> to update session memory. Companion files: `docs/PRE_PR_DESIGN_REVIEW.md`
> (the design-decay gate), `PR_REVIEW.md` (the PR + Greptile loop),
> `.agent-local/resolve_development_state.py` (version transitions),
> `docs/SCRATCHPAD.md` (session memory — discoveries/gotchas),
> `docs/backlog.md` (deferred work — the un-prioritized someday pile), and
> `docs/SELF_REVIEW.md` (rules to follow at the end of a session, things to
> double check).

---

## The model: branch per sub-version, not per session

A **session** is one scoped unit of work for the agent. A **sub-version** (e.g.
3.0.5) is one coherent, independently-shippable feature. Multiple sessions build
up a single sub-version on **one long-lived feature branch**. The branch ends in
**one PR** when the sub-version is complete — not one PR per session.

```
main
 └── version-3.0.5-industry-planner        ← one feature branch
      ├── session 1 → commit + local-dev check
      ├── session 2 → commit + local-dev check
      └── session 3 (final) → commit, then ONE PR → Greptile → fix → merge
```

Greptile runs only on PR. Opening a PR per session means Greptile reviews
half-built code and you get a fix-loop on unfinished work. Branching per
sub-version means Greptile reviews **finished** code once.

**Numbering & ordering.** A *feature* is `X.Y.N` — a coherent theme (e.g. `3.7.1`).
Its *sessions* are sub-slices `X.Y.N.M`, sequenced **data/plumbing first, then UX**,
so a UX slice never lacks its data. This is the numbering/ordering convention layered
on the model above; the branch + PR unit (the "sub-version") is unchanged — when a
feature is split into sub-slices, each shippable slice is its own branch + PR (as
3.7.0.1 and 3.7.0.2 each were).

---

## Step 1 — Fix before you close

Before acting, create a native runtime todo list from every applicable step in
this checklist. Keep one item in progress, attach evidence before completing an
item, and reopen invalidated verification items after fixes.

Before committing, resolve what you found this session. A bug you noticed, a
rough edge you hit, a small thing adjacent to your work — **fix it now, on this
branch.** Do not write it into the backlog as a carry-forward.

Only defer something if it is genuinely **out of scope for this entire
sub-version** (a different feature, a larger effort, an operator chore). Those
go in **`docs/backlog.md`** (deferred work — the un-prioritized someday pile),
not the scratchpad. Everything else gets fixed in-branch.

The test: *could I fix this on the current branch without expanding the
sub-version's scope?* If yes — fix it. If no — it's a backlog item.

---

## Step 2 — Commit to the feature branch

- **Shut down the local dev environment first, then clear the dev cache.** Once
  close-out (or the PR loop) begins, stop the Next dev server and any local Convex
  backend (`npx convex dev`), confirm both ports answer nothing, and **`rm -rf
  .next`** to clear the Turbopack/Next dev cache. They exist for in-session
  testing; once the session's work is verified and committed, lingering local
  processes confuse later sessions (port conflicts, stale env, half-pushed Convex
  functions).
  - **Why clear `.next` every close-out:** it prevents the cache from bloating
    across sessions. A multi-GB `.next` drives Turbopack's file watcher into an
    idle-CPU spin (pegs ~10 cores with no request) and inflates the dev server's
    idle memory ~10× — the 3.6.9 dev-melt root cause (see
    `DEV_PERF_DIAGNOSIS.md` in the Document Archive root). `.next` is a gitignored build artifact that
    regenerates on the next `pnpm dev`/build, so clearing it is free (just a cold
    first compile next session). The Docker Postgres is left running on purpose —
    it's tiny (~67 MB) and persistent per the local-DB setup, and it doesn't
    accumulate the way `.next` does.
- **Verify on the local dev server.** This is the review surface between sessions
  — use it instead of a PR. Confirm the session's work behaves as expected on
  `LOCAL_DB_DRIVER=postgres-js pnpm dev` against the local Docker database (or
  check API-only work directly). For data the local Docker DB can't hold, spin up
  a manual preview on demand — the exception, not the default.
- **Never test with a production-mode build before merge.** Do not run `pnpm
  build`, `next build`, `pnpm vercel-build`, or an equivalent production build
  locally or on the feature branch. Use local dev, `pnpm verify`, route-presence
  checks, and `ux-check` as applicable. Only Vercel runs the production build,
  after the change merges to `main`.
- **Reconcile the narrow ignored local-state boundary.** Workspace docs, both
  skill trees, agent guides, hooks, and `.agent-local/` utilities are tracked and
  ship through normal commits. Audit only deliberately ignored local state touched
  during the session: Claude local settings/launchers/worktrees, generated tooling
  reports and UX captures, margin-audit artifacts, temporary PR body-files, and
  `.codegraph/`. Remove credential-bearing permissions and session-only artifacts,
  update both runtime adapters and the shared-policy revision when required, then
  run `python3 .agent-local/check_agent_drift.py` after policy changes.
- Run `pnpm verify` before committing — the definition-of-done bundle (typecheck +
  lint + test + the Fallow static-analysis gate covering dead code, duplication,
  complexity, and architecture boundaries).
- **Then reproduce CI's coverage-backed complexity gate locally, every close-out.**
  This is mandatory even when `pnpm verify` is green:

  ```bash
  pnpm test:coverage
  FALLOW_AUDIT_BASE=$(git rev-parse origin/main) pnpm fallow
  ```

  The coverage run must be fresh and complete. If Fallow reports CRAP or complexity,
  add meaningful behavioral coverage or simplify the function; never add a waiver or
  baseline entry. Re-run both commands after the fix. Remove the generated `coverage/`
  directory after the final coverage-backed Fallow pass so a later session cannot
  accidentally reuse stale attribution.
- Run `python3 .agent-local/check_baseline_claims.py --pretty` and `python3
  .agent-local/check_watch_triggers.py --pretty`. At a final-session close-out,
  reconcile every baseline-claims warning or explain it in the PR notes, and
  surface every `promote AF-NNN` warning to the operator. Checkers report only;
  they never auto-promote a Watch finding.
- Commit the session's work to the sub-version branch (see the active agent
  guide, `CLAUDE.md` or `AGENTS.md`, for the plain-English commit style).
- Push the branch. No preview is built automatically.

---

## Step 3 — Update session memory

Update `docs/SCRATCHPAD.md` following the rules at the bottom of that file.
In short:
- When more sessions remain, change this approved session plan's `Execution
  status` from `Pending` to `Complete` after its required commit/push evidence
  exists. For a final session, leave it pending through review and mark it
  complete only after merge under `docs/PR_REVIEW.md`. Never mark a plan complete
  merely because implementation stopped.
- Rewrite **`Now`** to point at the next session, carrying only observed context
  the roadmap and session contract cannot know (things discovered this session).
- Send any genuinely-deferred, out-of-scope **work** to **`docs/backlog.md`**
  (what / why-deferred / rough size / dependency-or-trigger) — *not* the
  scratchpad — and if a deferred item was sitting in SCRATCHPAD, delete it there
  once it's in the backlog (one home, never both). With the fix-in-branch rule
  above, new deferrals should be rare.
- Delete anything that shipped this session.
- Do **not** write a forensic session log here. Discoveries and gotchas only.
- **Carry post-merge lifecycle evidence forward by one PR.** After a merge,
  reconcile the tracked roadmap, session plan, and SCRATCHPAD. That reconciliation
  is not committed at close-out: `start-session` opens the branch for the
  resolver's next action — cut at the start of that action, named from the
  directive's `branch` authority, never an agent choice — and makes the
  reconciliation the branch's first commit. After that commit, require `python3
  .agent-local/check_release_consistency.py --check --expect reconciled` to pass.
  The remote documents intentionally lag by one PR; do not open a follow-up PR
  or push directly to `main` solely to publish the status update.

---

## Step 4 — Is this the final session of the sub-version?

**NO — more sessions remain on this branch:**
> Stop here. The session is done: committed, locally verified, scratchpad
> updated. No PR. The branch stays open for the next session.

**YES — the sub-version is complete and works end-to-end:**
> If the sub-version changed a user-facing surface, **pause first for the operator's
> review on the local dev server** — continue only after he approves (a non-UX
> sub-version skips this pause). Then run `pre-pr-design-review` against
> `docs/PRE_PR_DESIGN_REVIEW.md`. Fix every in-scope design finding and update
> `docs/CODE_HEALTH_BASELINE.md` in the same change when a measured hotspot
> surface changed. Only after that gate passes, proceed to `PR_REVIEW.md`: open
> one PR for the whole sub-version, fill the test plan, and run the Greptile
> review loop (Greptile reviews on PR open). Meet that file's exit criteria; the
> agent then merges via the `close-out` skill.

---

## When does a branch close (PR + merge)?

A sub-version branch is ready for its PR when all three hold:

1. **It works end-to-end** and could ship to users as-is.
2. **It depends on nothing unmerged** — main has everything this builds on.
3. **It's reviewable in one sitting** — if one more session would make the diff
   too large for Greptile or a human to review well, close it now.

Merge to main at each sub-version boundary and cut a fresh branch for the next.
Do **not** let one branch span multiple sub-versions — long-lived branches drift
from main and the eventual merge becomes painful.

Every sub-version that merges gets a changelog entry (in its master file under
`content/changelog/`) and an `APP_VERSION` bump —
**including** internal, CI, and infrastructure work (the old "user-facing only"
changelog rule is retired; an all-internal sub-version just gets an all-internal
entry). `docs/workflows/schema/changelog-entry.md` owns the entry format;
`docs/PR_REVIEW.md` owns the delivery procedure.

When the merged sub-version makes every row in the master plan terminal, do not
archive or start the next master version during close-out. Mark the roadmap row
with real merge evidence, leave the version artifacts active, and run the
resolver. Mark a mapped audit finding Delivered only after all of its
sub-versions have terminal merge evidence, then report the resolver directive
and return control to `start-session`; close-out does not select whether the next
handler plans an audit or restarts the full audit. Archival happens only after a
fresh audit verifies every actionable finding and the current cycle is clean.
