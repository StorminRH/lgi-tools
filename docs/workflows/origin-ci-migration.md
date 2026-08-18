# Origin / Depot / ship-path migration — ordinary-work plan

**Plan status:** Draft (living; operator reshapes between chats)
**Kind:** Ordinary work — not a numbered lifecycle session. Do not run
`start-session` or the lifecycle resolver for this plan.
**Planning standard:** `docs/workflows/schema/session-plan.md` (shape
only: Bottom line, hard constraints, ordered work, success criteria)
**Proof standard:** Atomic (each Ordered work step is its own later
execution chat)
**Execution status:** Pending
**Baseline effect:** Neutral

This file is the execution prompt for the migration. Publish it first.
Then run each Ordered work step as a later ordinary-work chat. Origin
and Depot land first so later skill visits, previews, and tracker work
happen on the stack you will keep.

## Bottom line (READ FIRST)

- **GOAL:** Origin is where you code, run CI, open previews, merge, and
  ship. Depot is the only gate and runs real Postgres. Vercel previews
  replace laptop `pnpm dev` in most cases. Feature work lands on a
  long-standing `beta` branch. GitHub’s only job is a manual bot review
  of that beta before it goes to `main`. Production is a manual deploy.
  Issues (site feedback, update-watch, refactor process, backlog)
  leave GitHub for Linear. GrokBots keep their draft-PR homes for
  test-cleanup and refactor.
- **DONE =** SC-1 through SC-10 below, plus: Origin-hosted repo, Depot
  Checks, preview-as-dev process, `beta` integration branch, GitHub
  bots manual-only on the beta dump, tracker + feedback + GrokBots
  retargeted, and each named skill visited in isolation.
- **OUT OF SCOPE:**
  - Implementing any Ordered work step in the same PR as this plan.
  - Deleting every canned-row `*.test.ts` (only the “CI substitute for
    SQL” role goes away).
  - Buildkite native pipelines, Depot Mac runners, Depot Agent
    sandboxes.
  - Rewriting completed 4.0 as-builts or the Greptile devlog.
  - Implementing Linear or GrokBot retargets in this plan PR — OW-14
    proves the connectors; OW-15/16 do the cut.

<hard_constraints>

- **Plan:** After cutover, Origin is source of truth. GitHub is a
  disposable dump used only for review bots on `beta` before `main`.
  Never merge the dump PR. Never accept bot-apply commits. Never push
  Origin `main` to GitHub `main`.
- **Plan:** Do not rehearse CI on GitHub Actions and migrate later.
  Create or detach an Origin-hosted repo, then prove Depot there. Depot
  and Origin Apps do not run on an inbound GitHub mirror.
- **Plan:** Depot CI `jobs.<id>.services` is the Postgres sidecar.
  Do not use Depot Container Builds / `depot bake` / Compose image
  builds as the test database. Actions-shaped YAML is syntax Depot
  consumes; it is not “CI on GitHub.”
- **Plan:** Installing Depot or Vercel on the Origin codebase Apps page
  is not “CI works” and not “previews work.” Need: Origin-hosted repo
  (not inbound mirror), app attached to that repo, a workflow or
  deployment that actually fires.
- **Plan:** Vercel is linked to Origin (operator already did this).
  Disconnect the GitHub git integration only after an Origin branch
  produces a Preview URL and `main` is proven not to auto-deploy.
  Origin repos are private and cannot deploy from a Vercel Hobby team.
- **Plan:** Vercel-for-Origin defaults to “non-`main` push = Preview,
  merge/`main` push = Production.” Keep `deploymentEnabled.main: false`
  so Origin merge to `main` does not ship `lgi.tools`. Production is
  `vercel promote` (or the dashboard equivalent) after beta clears bots
  and Origin CI.
- **Plan:** Previews are the usual way to exercise a feature. Laptop
  `pnpm dev` stays allowed when you want it. Do not require a laptop
  Next server for ordinary visual checks once a Preview URL exists.
- **Plan:** After Depot adoption, definition of done is
  `depot ci run --job verify`. Retire `pnpm verify` from AGENTS.md,
  close-out, CONTRIBUTING, and the PR template. Do not fall back to a
  laptop verify that skips `*.db.test.ts`.
- **Plan:** Laptops and agents never run `next build`,
  `pnpm vercel-build`, or Playwright as the local gate. Job `build` and
  job `e2e` are PR-only on Depot.
- **Plan:** Do not run `build:vercel` in the CI build job. Migrate /
  ingest / warm-neon stay deploy-time on the environment that is
  actually going live (`beta` or Production).
- **Plan:** Greptile and CodeRabbit are **manual request only**, and
  only on the GitHub dump of `beta` when you are preparing to merge
  `beta` → `main`. They are not the merge gate and must not run on
  every Origin PR.
- **Plan:** Durable `beta` must not use Neon’s `preview/` prefix
  (`neon.ts` gives those a 3-day TTL). Ephemeral feature previews use
  `preview/*` and are torn down (Neon branch + Convex preview
  deployment) after the feature is proven. Convex beta is one
  prod-type extra deployment, left up. Do not put a Production
  `CONVEX_DEPLOY_KEY` on Preview. Do not store
  `NEXT_PUBLIC_CONVEX_URL` / `CONVEX_DEPLOYMENT` on Vercel Preview.
  Beta Convex `SITE_URL` / issuer must be the beta origin, not
  `lgi.tools`.
- **Plan:** Origin has no issue tracker. Linear is the intended home
  (Cursor app, Cloud Agents, and GrokBots all have Linear connectors).
  Do not migrate `createFeedbackGithubIssue`, update-watch, close-out
  `[Backlog]`, or the refactor process issue until OW-14 proves those
  connectors against the Origin repo. Test-cleanup is a draft PR, not
  an issue — do not invent an issue for it.
- **Plan:** Delete `poll_pr_gate.py` and `merge_clean_pr.py` as a pair,
  only after a named replacement merge command exists. Keep
  `github_api.py`, `scrub_pr_body.py`, `repair_gh_auth.py` while any
  remaining helper still uses them.
- **Plan:** Do not commit `.env*`. Origin Private does not add extra
  secret files; `.gitignore` rides in the dump.
- **Plan:** Do not shard Vitest unless one Istanbul
  `coverage/coverage-final.json` still exists for Fallow. Do not run
  Playwright against `pnpm dev` in CI. Do not commit cookie jars or
  `auth-storage.json`.
- **Plan:** Each later skill visit edits one skill (or one tightly
  named pair). Do not rewrite the rest of the lifecycle in that chat.
  Do not rewrite completed 4.0 delivery rows.
- **Plan:** Agents must not visually approve UX. After CI `e2e` exists,
  `ux-check` is operator visual on a Preview URL (or laptop when you
  choose) plus diagnosis.
- **Plan:** Do not point `delete-neon-branch` at durable `beta`. Tear
  down ephemeral Convex backends on purpose (Vercel ending a Preview
  does not delete Convex; official cleanup is 5/14-day expiry,
  dashboard delete, or Management API). Convex has no scale-to-zero;
  pause exists but storage still bills. Do not claim signed-in Atlas
  on an ephemeral `*.vercel.app` preview without a pre-registered EVE
  SSO callback.
- **Plan:** This Cloud Agent workspace cannot see Origin or Depot
  (GitHub remote, Origin CLI not logged in, no Depot CLI). Operator
  login and first Origin/Depot/Vercel proof happen on a machine they
  control.

</hard_constraints>

**Branch:** `stormin/origin-ci-migration-4df8` (this plan) · **ends in
PR:** yes · **gate:** operator reads this plan and reshapes Ordered work
before OW-1 executes. Later steps use their own ordinary-work branches.

**Contract UX gate:** `No` · **required pause:** None for this plan PR.
Later UX-facing steps pause at the rewritten `ux-check` skill.

## Read first

- `AGENTS.md`
- `docs/workflows/schema/session-plan.md` — shape this file follows
- `.github/workflows/test.yml` — live CI today (skips `*.db.test.ts`)
- `vercel.json` — live auto-prod on `main`; all other git deploys off
- `.cursor/skills/close-out/SKILL.md` — live Greptile 5/5 + wait-prod
- `.cursor/skills/start-session/SKILL.md` — first isolated skill visit
- `src/features/feedback/create-github-issue.ts` — only in-app Issues POST
- `neon.ts` — Config-as-Code branch policy (`preview/` TTL + compute)
- `playwright.config.ts` — always `pnpm dev` + `reuseExistingServer`
- Official: [Origin](https://cursor.com/docs/origin),
  [Origin integrations](https://cursor.com/docs/origin/integrations),
  [Vercel for Origin](https://vercel.com/docs/git/vercel-for-origin),
  [Cursor ↔ Linear](https://cursor.com/docs/integrations/linear)

## Current state and prerequisites

| Input | Live verdict | Evidence | Execution consequence |
| --- | --- | --- | --- |
| Origin vs GitHub | GitHub is still SoT | Workspace remote is `github.com/storminrh/lgi-tools`. Origin CLI exists but is not logged in here | OW-1 creates or detaches before any CI or preview work |
| Inbound mirror | Blocking for Depot / Vercel Apps | Official Origin docs: inbound “Sync from GitHub” keeps GitHub as SoT; Apps do not run on inbound mirrors | Do not treat Apps-page install as CI or previews |
| Vercel ↔ Origin | Linked, not proven | Operator connected Vercel on the Origin codebase. Vercel-for-Origin is public beta; Origin repos need a paid Vercel team | OW-5 proves a Preview URL from an Origin branch, then disconnects GitHub git |
| Vercel ↔ GitHub | Still live | `vercel.json` `main: true`; deny globs hide other branches | Keep `main: false` before Origin `main` exists or Vercel will ship prod |
| Depot CLI | Not present here | No `depot` on this VM or the operator laptop at last check | OW-2 installs CLI where the operator works |
| Live DoD | `pnpm verify` | AGENTS.md, close-out, CONTRIBUTING | OW-4 flips docs after `verify` is honest on Depot |
| Live CI | GHA, no real SQL | `.github/workflows/test.yml` skips `*.db.test.ts` | OW-2/OW-3 replace this on Origin |
| Preview/prod gaps | Known | Convex preview key unused; `SITE_URL` prod-shaped; `neon.ts` is never auto-applied; crons Production-only; shared Upstash. Convex cost is the preview concern (no scale-to-zero) | OW-5 / OW-17: ephemeral teardown + one cheap sleeping `beta` |
| Neon branch policy | In-repo, apply is manual | Repo-root `neon.ts`: `preview/*` gets `ttl: '3d'`, 0.25–1 CU, `suspendTimeout: '1m'`. Other new branches get no TTL and inherit defaults. Existing non-default branches are left alone until `updateExisting` | OW-17 adds a named `beta` arm (no TTL, cheap CU, fast suspend) and applies it |
| Issues | GitHub only | Origin has no tracker. 31 open issues on `StorminRH/lgi-tools` | OW-14 proves Linear; OW-15 migrates feedback |
| Site feedback | GitHub REST | `createFeedbackGithubIssue` POSTs to `StorminRH/lgi-tools` with `GITHUB_FEEDBACK_TOKEN` | Do not retarget until OW-14 |
| Daily GrokBots | Schedule runners | They run on a schedule. When they need to write code they spawn a Cloud Agent in the build environment. **Update watch:** GrokBot itself files an issue (no Cloud Agent). **Refactor:** standing issue documents the process; work lives as a draft PR the agent updates. **Test cleanup:** draft PR only (rebased/updated daily); not an issue. Live GitHub: [#444](https://github.com/StorminRH/lgi-tools/issues/444), [#449](https://github.com/StorminRH/lgi-tools/issues/449) | OW-16 retargets: Linear for issues the bots file; Origin draft PRs for the two accumulators |
| Linear | Intended tracker | Free plan + API. Cursor app, Cloud Agents, and GrokBots each have a Linear connector. Linear `@cursor` repo picker is still documented as GitHub-shaped `owner/repo` | OW-14 proves those connectors on the Origin repo; do not hunt a peer unless that proof fails |
| Depot Developer plan | Purchased intent | Depot CI minutes and results. Unused: Mac runners, Registry, GHA runner minutes, extra-billed Agent sandboxes | Buy Depot CI only |
| This plan PR | In progress | This file on `stormin/origin-ci-migration-4df8` | This chat only publishes the plan |

## Why now

You want to stop treating the laptop as the app and GitHub as the forge.
Origin plus Depot plus Vercel-on-Origin can be the daily loop: CI on
the PR, click the Preview, merge into `beta`, and only touch GitHub
when bots should look at a release candidate. Temporary previews must
not leave Neon and Convex running; `beta` keeps one cheaper pair.
Issues that need a board (feedback, update-watch, refactor process)
move to Linear because the Cursor app, Cloud Agents, and GrokBots
already have that connector. Origin and Depot first so later visits
use the remotes you will keep.

## Scope (the destination)

When the last Ordered work step is done:

- Clone, push, PR, Checks, and merge happen on an Origin-hosted
  Private repo.
- Depot `verify` includes Dockerized Postgres and `*.db.test.ts`. PRs
  also run `next build` + `assert:routes` and Playwright against
  `next start`.
- Opening an Origin PR (or pushing a non-`main` branch) creates a
  Vercel Preview with its own Neon `preview/*` branch and Convex
  preview deployment. That URL is the usual place to prove a feature.
  After it is proven, both backends are torn down. Laptop `pnpm dev`
  is optional.
- Passing feature work merges to Origin `beta`. `beta` keeps one
  Neon branch and one Convex deployment — cheaper/sleepier than
  production — for accumulated testing.
- When `beta` is ready: dump that SHA to GitHub, **manually** request
  Greptile/CodeRabbit, triage, fix on Origin, confirm Origin CI, merge
  Origin `beta` → Origin `main`, then **manually** deploy production.
- Vercel no longer watches GitHub.
- Linear holds issues (feedback, update-watch, refactor process,
  `[Backlog]`, triage). Test-cleanup and refactor **work** stay draft
  Origin PRs that GrokBots / spawned Cloud Agents rebase. Update-watch
  stays issue-only (no Cloud Agent).
- Each lifecycle skill has been visited in isolation against this
  model.

### Scope coverage

| Boundary | Mapping or protection |
| --- | --- |
| Origin SoT | OW-1; never merge GitHub; never push Origin `main` there |
| Depot-first CI | OW-2, OW-3; `services:` not bake |
| Agent DoD | OW-4 |
| Preview-as-dev | OW-5; `main` stays undeployed |
| GitHub Vercel gone | OW-5 after Origin Preview proof |
| Lifecycle rewrite | OW-6 through OW-11; one skill (or named pair) per chat |
| Scripts | OW-12 |
| Standing docs | OW-13 |
| Linear + GrokBots | OW-14 prove connectors; OW-15 feedback; OW-16 retarget |
| Manual prod + standing beta | OW-17 |
| GitHub bots-only | OW-8 writes the dump ritual; OW-17/close-out keep it |
| This plan only | Current PR. Diff must not flip skills, CI, or `vercel.json` |

## Resolved implementation decisions

- **Origin path: native create or detach, then prove Depot and Vercel
  there.** Inbound mirror keeps GitHub as SoT and blocks Apps.
  **Rejected:** rehearse YAML on GitHub Actions and migrate later.
- **Vercel git remote: Origin, not GitHub.** Operator already linked
  Vercel to Origin. After an Origin Preview is real, disconnect the
  GitHub integration so a leftover GitHub `main` push cannot ship
  prod. **Rejected:** keep GitHub as the deploy remote “just in case.”
- **Previews replace laptop `pnpm dev` in most cases.** Process: push
  an Origin branch / open a PR → Vercel Preview URL → click it.
  Sometimes that preview is short-lived (one feature). Sometimes
  `beta` stays up as an accumulated preview. Laptop `pnpm dev` remains
  when you want speed. **Rejected:** per-PR previews stay off forever
  (overruled leftover).
- **`vercel.json`:** `main: false` is mandatory. Allowing other
  branches to deploy is the preview process. Convex cost is the
  limiter (a preview backend does not sleep). A naming convention is
  allowed if every-branch previews are too expensive. Every ephemeral
  preview must tear down Neon + Convex after the feature is proven.
- **Feature integration branch is Origin `beta`.** CI-green Origin PRs
  merge to `beta`, not `main`. `beta` → `main` is a deliberate
  promotion of accumulated work, after bots.
- **GitHub bots: dump `beta` only, request manually.** When `beta` has
  enough PRs (or too much work), clone that SHA to GitHub, manually
  request Greptile/CodeRabbit, triage as today, apply fixes on Origin,
  re-run Origin CI. Never merge GitHub. **Rejected:** bots on every
  Origin PR; bots as the merge gate.
- **Production:** merge Origin `beta` → `main`, then manual
  `vercel promote` (or dashboard). Do not rely on Vercel-for-Origin’s
  “merge to production branch ships prod.”
- **Depot product: CI sandboxes with `jobs.<id>.services` Postgres.**
  **Rejected:** Container Builds / bake as the test DB.
- **Job split:** `verify` = typecheck, lint, `assert:routes-present`,
  `test:coverage` **with** `*.db.test.ts`, Fallow. `build` = `pnpm
  build` + `assert:routes` (not `build:vercel`). `e2e` = Playwright vs
  `next start`. Agent runs `--job verify`. PR runs the full workflow.
- **“No more mock tests”:** canned-row Vitest is not the CI stand-in
  for SQL. Pure `*.test.ts` stays. Real SQL is `*.db.test.ts` on Depot.
- **Lifecycle: isolated skill visits.** Origin/Depot/preview first so
  those visits use the new remotes, Checks, and Preview URLs.
- **Linear is the issue board.** Cursor, Cloud Agents, and GrokBots
  already have Linear connectors. Origin still has no issues. Free
  cap is **250 issues** — do not import closed GitHub history. OW-14
  proves the connectors on the Origin repo; hunt a peer only if that
  proof fails. Linear `@cursor` repo picker is still documented as
  GitHub-shaped `owner/repo`.
- **Feedback writer:** keep GitHub until OW-14. Then replace
  `createFeedbackGithubIssue` (raw `fetch`, not Octokit) and the
  `feedback_unconfigured` / `github_failed` codes. Do not add Octokit
  on the way through.
- **GrokBots are schedule runners, not the Cloud Agents.** They run
  the daily jobs. When the job must write code they spawn a Cloud
  Agent in the build environment.
  - **Update watch:** GrokBot files/updates a Linear issue. No Cloud
    Agent. Today `#444`.
  - **Refactor / slop:** Linear (today `#449`) documents the process.
    Accumulated work is a **draft PR** the spawned agent updates and
    rebases.
  - **Test cleanup:** **draft PR only** (updated/rebased daily). Not
    an issue. Do not create a tracker ticket for it.
- **Neon preview vs `beta`:** policy lives in repo-root `neon.ts`.
  New `preview/*` → 3-day TTL, 0.25–1 CU, suspend in 1 minute. New
  unnamed branches inherit defaults (no TTL). `beta` gets its own
  arm: no TTL, cheap CU, short `suspendTimeout` (same cheap-sleep
  pattern). Apply with `neon config apply` (`updateExisting` for a
  branch that already exists). Dashboard is fine if the CLI needs a
  hand. Do not name `beta` `preview/beta`.
- **Convex preview vs `beta`:** cost is the reason to tear down
  ephemeral previews. Official Convex has **no scale-to-zero**. Pause
  stops function/bandwidth charges; storage still bills. Preview-type
  backends expire 5 days (Free/Starter) or 14 days (paid) from
  **creation**, not last use — that is a safety net, not the process.
  Vercel ending a Preview does **not** delete Convex. Tear down with
  dashboard delete or Management API
  `POST /deployments/:name/delete`. Use a **preview deploy key** on
  Vercel Preview so `npx convex deploy` creates `preview/[branch]`.
  `beta` is `npx convex deployment create beta --type prod` — one
  durable extra, no expiry. There is no official cheaper/slower
  Convex SKU for beta; pause when idle if you want to stop function
  charges. Do not put a prod key on Preview.
- **Developer plan utilization:** Depot CI minutes and results only.
- **Cloud Agent / Origin CLI:** browser login on a machine you
  control. Do not paste keys in chat.

### Audit-remediation mapping

Not applicable — this is not an audit-remediation contract.

## Design pressure and baseline effect

### Hotspot proximity

- **Touched measured surfaces:** None in this plan PR (docs only).
- **Live proximity evidence:** Later OWs will touch skills, workflows,
  `vercel.json`, `playwright.config.ts`, `create-github-issue.ts`, and
  contributing docs. Stay outside mapper / Convex engine unless a
  later visit names them.

### Preparatory refactor

None for this plan PR. OW-2 may extract workflow YAML from
`.github/workflows/test.yml` into `.depot/workflows/` without changing
product behavior.

### Baseline effect and update

- **Effect:** Neutral — this plan adds no production export and no
  Fallow pressure.
- **Required update:** None for the plan PR. The feedback retarget
  (OW-15) refreshes baseline only if a measured file changes.

## Implementation blueprint

### Owned surfaces

- `docs/workflows/origin-ci-migration.md` — this plan (current PR).
- Origin-hosted repository + remotes — OW-1.
- `.depot/workflows/` — OW-2, OW-3.
- `AGENTS.md`, CONTRIBUTING, PR template — OW-4, then OW-13.
- `vercel.json` + Vercel project git settings — OW-5, OW-17.
- `neon.ts` — preview TTL/compute and the `beta` cheap-sleep arm
  (OW-5 / OW-17). Nothing applies until `neon config apply`.
- `.cursor/skills/start-session/SKILL.md` — OW-6 only.
- `.cursor/skills/plan-session/SKILL.md` — OW-7 only.
- `.cursor/skills/close-out/SKILL.md` — OW-8 only.
- `.cursor/skills/ux-check/SKILL.md` — OW-9 only.
- `.cursor/skills/resolve-update-watch/SKILL.md` and
  `update-watch/SKILL.md` — OW-10 only.
- Remaining lifecycle skills listed in OW-11 — one file per chat.
- `tools/delivery/poll_pr_gate.py`, `merge_clean_pr.py` — OW-12.
- `src/features/feedback/create-github-issue.ts`,
  `src/app/api/feedback/route.ts`, `src/features/feedback/categories.ts`,
  `src/lib/env.ts`, `'github-issues'` in
  `src/composition/vendor-resilience-registry.ts` — OW-15.
- Cursor Automations for update-watch / test-cleanup / slop — OW-16
  (platform, not this git tree).
- `playwright.config.ts` — OW-3 (`CI` vs local split).

### Interfaces and contracts

- `depot ci run --workflow <file> --job verify` — agent/laptop gate.
- Full Depot workflow on an Origin PR — `verify` + `build` + `e2e`.
  Wait with `origin pr checks --watch`.
- Origin branch / PR → Vercel Preview URL — usual feature look.
- `origin pr merge` into `beta` — integration merge. Does not promote
  production.
- GitHub dump of the `beta` SHA + **manual** bot request — review
  only. Never merge.
- `origin pr merge` (`beta` → `main`) then `vercel promote` —
  production.
- Feedback: today `POST /repos/StorminRH/lgi-tools/issues`. After
  OW-15: the chosen tracker’s create API (Linear:
  `issueCreate` at `https://api.linear.app/graphql`).
- This plan adds or changes no production export.

### Control and data flow

Target daily path after OW-5:

1. Agent works against `https://origin.cursor.com/{owner}/{repo}.git`.
2. Local gate: `depot ci run --job verify`.
3. Open an Origin PR. Depot runs the full pipeline. Vercel posts a
   Preview URL backed by Neon `preview/<branch>` and a Convex preview
   deployment. You (or `ux-check`) use that URL instead of laptop
   `pnpm dev` unless you choose otherwise.
4. After the feature is proven, tear down that Neon branch and that
   Convex preview. Merge the Origin PR to **`beta`**. The standing
   `beta` preview (one Neon + one Convex, cheaper/sleepier) updates
   when you want accumulated work in one place.
5. Repeat until `beta` should go to production.

When `beta` is ready for `main`:

6. Dump that exact SHA to GitHub (branch, not a merge). Manually
   request Greptile and CodeRabbit. Triage. Fix on Origin. Re-check
   Depot on Origin.
7. Merge Origin `beta` → Origin `main`. **Nothing deploys yet.**
8. `vercel promote` the chosen Preview (usually `beta`) to Production.

Issues and GrokBots (parallel, after OW-14):

9. Site Feedback button → Linear.
10. Update-watch GrokBot files a Linear issue (no Cloud Agent).
11. Refactor GrokBot may spawn a Cloud Agent that rebases the draft
    Origin PR; the Linear issue stays the process note.
12. Test-cleanup GrokBot may spawn a Cloud Agent that rebases the
    draft Origin PR. No issue.

### Edge and failure behavior

- Origin still inbound-mirrored → Apps silent → stop; detach or create
  native (OW-1).
- `verify` with Postgres too slow → shrink the SDE fixture, not the
  job.
- Vercel still watches GitHub after Origin is linked → two remotes can
  deploy. Disconnect GitHub only after Origin Preview proof, and keep
  `main: false` the whole time.
- Every-branch previews too expensive (Convex does not sleep) → name
  a branch pattern in OW-5; tear down each ephemeral pair after
  proof; do not re-disable all previews without a process.
- Wrong Convex key on Preview → can push **production** Convex. Audit
  keys before enabling many previews. Vercel teardown without a
  Convex delete leaves a billed backend until 5/14-day expiry.
- EVE SSO → random `*.vercel.app` cannot sign in. Ephemeral previews
  stay anonymous-only until a stable callback exists. Signed-in Atlas
  checks use laptop or the durable `beta` URL once SSO is registered.
- Linear `@cursor` cannot see the Origin repo → GrokBots still spawn
  Cloud Agents in the build environment (Origin-native); Linear stays
  the issue board. Pick a peer only if the Linear connector proof
  fails.
- Linear Free hits 250 issues → archive aggressively; do not import
  closed GitHub history.
- Do not create a Linear issue for test-cleanup. Its home is the
  draft PR.

### Ordered work

Each numbered step is one later ordinary-work chat. Do not list
close-out, adversarial review, push, or PR opening as Ordered work.
Do not implement a later step in an earlier chat.

1. **Origin-hosted repository.** Change remotes and the Origin
   codebase so the repo is Origin-hosted (native create or detach),
   Private, and clone/push/PR work on `origin.cursor.com`. Prove with
   one Origin PR that is not a GitHub sync. Do not add CI YAML or
   flip `vercel.json` in this chat.

2. **Depot `verify` on that Origin repo.** Attach Depot to the
   Origin-hosted repo. Change `.depot/workflows/` so job `verify` runs
   typecheck, lint, `assert:routes-present`, coverage **with**
   `*.db.test.ts`, and Fallow, with Postgres via `services:` (not
   bake). Prove with an Origin PR that shows Depot Checks and green
   real-SQL suites.

3. **PR jobs `build` and `e2e`.** Change the Depot workflow and
   `playwright.config.ts` so PRs run `pnpm build` + `assert:routes`
   and Playwright against `next start`. Prove with a PR whose Checks
   include both jobs.

4. **Agent definition of done.** Change `AGENTS.md`, close-out’s DoD
   line, CONTRIBUTING, and the PR template so agents run
   `depot ci run --job verify` and wait with `origin pr checks
   --watch`. Remove `pnpm verify` as the standing gate. Prove by
   reading those files.

5. **Vercel-on-Origin preview process.** Prove one Preview URL from an
   Origin branch or PR (the usual “instead of `pnpm dev`” path). Write
   down dashboard facts: Convex key type per environment, Neon branch
   names, Hobby vs Pro, whether GitHub is still connected. Put a
   **preview** `CONVEX_DEPLOY_KEY` on Vercel Preview only. Then: set
   `deploymentEnabled.main: false`; enable the preview pattern you
   choose; disconnect Vercel’s GitHub git integration once Origin
   Preview is real. Document the teardown: delete Neon
   `preview/<branch>` and the Convex preview deployment after the
   feature is proven (PR-close workflow + Convex API/dashboard; do
   not wait for 5/14-day expiry as the process). Do not enable
   Production auto-deploy. Do not migrate feedback. Prove: Origin PR
   shows a Preview URL; `main` does not start Production; teardown
   leaves no extra Neon/Convex pair.

6. **Isolated visit: `start-session`.** Change only
   `.cursor/skills/start-session/SKILL.md` so resolver, dispatch, “what
   happens,” and the general start flow match Origin remotes, Depot
   Checks, Preview-as-dev, and merge-to-`beta`. Prove by walking the
   rewritten flow on paper. Do not edit other skills.

7. **Isolated visit: planned-session flow.** Change only
   `plan-session` so a planned session is still something you want.
   Prove by comparing one existing session plan’s OW shape to the
   rewritten skill.

8. **Isolated visit: `close-out`.** Change only
   `.cursor/skills/close-out/SKILL.md` so: ordinary feature close-out
   merges to Origin `beta` after Depot is green; GitHub dump +
   **manual** bot request happen only when taking `beta` → `main`;
   merge actor is `origin pr merge` (or the command this visit names);
   every merge stops without promote. Prove with a dry-run of a
   feature-to-`beta` close-out and a `beta`-to-`main` close-out. Do
   not flip production deploy in this chat.

9. **Isolated visit: `ux-check`.** Change only the ux-check skill and
   `docs/ux-check/README.md` so automated evidence is “Depot `e2e` was
   green,” visual review uses the Vercel Preview URL (laptop optional),
   and agents still must not visually approve.

10. **Isolated visit: update-watch pair.** Change only
    `resolve-update-watch` and `update-watch` so review/merge follow
    Origin + Depot + `beta`. Issue create/list may still be GitHub
    until OW-14. No `poll-pr-gate`. Must not merge or promote.

11. **Isolated visits: remaining lifecycle skills.** One chat per
    skill, in the order you choose: `plan-version`,
    `plan-version-audit`, `plan-audit-remediation`, `version-audit`,
    `triage-issue`, `adversarial-review`, `deslop` if the slop bot
    should own it. Each chat edits that skill only.

12. **Delivery scripts.** After OW-8 names the replacement merge
    command, delete `poll_pr_gate.py` and `merge_clean_pr.py` as a
    pair. Keep `github_api.py`, `scrub_pr_body.py`,
    `repair_gh_auth.py` until GitHub dump comments no longer need
    them. Prove: no caller remains for the deleted pair.

13. **Standing docs after skills settle.** Change session schemas,
    `docs/VERSION_4_0_PLAN.md` standing language (not completed rows),
    contributing test docs, and README so: shipped-to-`beta` ≠
    production; Depot is the gate; Preview is the usual look;
    `*.db.test.ts` is a `verify` requirement.

14. **Linear connector proof.** Create (or reuse) a Linear workspace
    on the Free plan. Confirm 250-issue headroom against the 31 open
    GitHub issues (do not bulk-import closed history). Prove the
    Cursor app, a Cloud Agent in the build environment, and a GrokBot
    can each read/write that workspace. Point GrokBots at the Origin
    repo for any spawned agent. Do not migrate production feedback in
    this chat. Hunt a peer only if a connector cannot see Linear or
    the spawned agent cannot work on Origin.

15. **Feedback button retarget.** After OW-14, change
    `createFeedbackGithubIssue` and its route/env/registry/tests so
    the site button creates a Linear issue. Keep server-only raw
    `fetch` (GraphQL `issueCreate`). Map 503/502 to the new
    dependency. Prove with a test that the old GitHub URL is gone and
    a staging submit (or contract test) hits Linear.

16. **GrokBot retarget.** Point the three scheduled GrokBots at Origin
    + Linear, matching how each one actually lives:
    - Update watch: GrokBot writes the Linear issue (no Cloud Agent).
    - Refactor: move `#449`’s process note to Linear; keep the
      accumulating **draft Origin PR**; spawn a Cloud Agent when
      code must be written.
    - Test cleanup: keep the accumulating **draft Origin PR**
      (rebase/update daily); spawn a Cloud Agent when code must be
      written; **no Linear issue**.
    Prove each with one scheduled or manual run.

17. **Manual production + standing `beta`.** In `neon.ts`, add a
    named `beta` arm: no `ttl`, cheap CU (0.25–1), short
    `suspendTimeout` (1m or 5m). Create the Neon branch as `beta`
    (not `preview/beta`). `neon config apply` with `updateExisting`
    (today’s `if (branch.exists) return {}` would skip it). Create
    one Convex `npx convex deployment create beta --type prod`.
    Register EVE SSO on that stable URL only if signed-in Atlas is
    in scope. Document promote as the only production path. Prove:
    `beta` Preview stays up on the cheap pair; ephemeral pairs are
    gone after teardown; Origin `main` does not auto-deploy.

### Preview backends (Neon + Convex)

Two classes. Do not mix their names or teardown.

**Ephemeral (prove a feature, then delete)**

| | Neon | Convex |
| --- | --- | --- |
| Name | `preview/<git-branch>` (Vercel ↔ Neon integration) | `preview/[branch]` via **preview** deploy key |
| Cost guard in-repo | `neon.ts`: `ttl: '3d'`, 0.25–1 CU, `suspendTimeout: '1m'` | None. No sleep / scale-to-zero. Pause is manual; storage still bills. Expiry 5d or 14d from **create** is a safety net |
| Teardown | PR-close `delete-neon-branch` (today GitHub-only) or `neon branches delete`; then `neon config apply` so TTL is real | Dashboard delete or `POST /deployments/:name/delete`. Vercel ending the Preview does **not** delete this |
| Process | Tear down after the feature is proven. Do not wait for TTL | Same. Do not wait for 5/14-day expiry |

`neon.ts` does nothing until someone runs `neon config apply`. The Vercel
integration creates the branch; apply only tunes it. Existing
non-default branches are skipped unless `updateExisting`.

**Standing `beta` (slower/cheaper than prod, left up)**

| | Neon | Convex |
| --- | --- | --- |
| Name | `beta` (never `preview/beta`) | `npx convex deployment create beta --type prod` |
| Cost | Named arm in `neon.ts`: no TTL, 0.25–1 CU, short suspend (1m or 5m). You already know Neon will sleep | No cheaper SKU. Official options: leave it (serverless function compute is unbilled on S-class); **pause** when you will not use it (function/bandwidth stop, storage continues) |
| Teardown | Do not. Do not point `delete-neon-branch` here | Do not. Prod-type extras do not expire |

Convex is the preview cost worry: each ephemeral backend is a full
deployment until you delete it. Neon will idle in a minute once
`neon.ts` is applied.

### Job recipes (for OW-2 and OW-3)

Job `verify` (agent DoD + every PR):

```text
typecheck, lint, assert:routes-present,
test:coverage with *.db.test.ts enabled,
fallow
```

Postgres sidecar (Depot speaks this field):

```yaml
services:
  postgres:
    image: postgres:16
    env:
      POSTGRES_PASSWORD: postgres
    options: >-
      --health-cmd pg_isready
      --health-interval 10s
      --health-timeout 5s
      --health-retries 5
    ports:
      - 5432:5432
```

Point `DATABASE_URL` / `DATABASE_URL_UNPOOLED` at that service, migrate,
and load whatever SDE the real DB suites need. Fallow still needs one
`coverage/coverage-final.json`.

Job `build` (PR only):

```text
pnpm install --frozen-lockfile
pnpm build
pnpm assert:routes
```

Cache `.next/cache`. `NEXT_PUBLIC_*` is inlined at this build.

Job `e2e` (PR only): Playwright against `next start`. Install
`pnpm exec playwright install --with-deps --only-shell`. Pin the
repo Playwright version. Upload failure artifacts only.

| | Agent / laptop gate | Origin PR |
| --- | --- | --- |
| Command | `depot ci run --job verify` | full workflow |
| Docker Postgres + real `*.db.test.ts` | yes | yes |
| `next build` + `assert:routes` | no | yes |
| Playwright | no | yes |
| Where it runs | Depot VM | Depot VM |

### Target close-out shape (written in OW-8, not this PR)

```markdown
## 5. Feature PR (lands on beta)

1. Reuse Depot `verify` when the head is unchanged.
2. Open one draft Origin PR. Scrub the body.
3. Wait: `origin pr checks --watch`.
4. Use the Vercel Preview URL (laptop `pnpm dev` only if you choose).
5. Origin review. Tear down the feature Preview’s Neon `preview/*`
   branch and Convex preview deployment. Merge to Origin `beta`.
   Stop. Do not promote. Do not dump to GitHub. Do not request bots.

## 6. Take beta to main (bots + merge)

1. Dump the `beta` SHA to GitHub. Manually request Greptile and
   CodeRabbit. Import findings. Fix on Origin. Never merge GitHub.
2. Origin Depot full pipeline green on the fixed `beta`.
3. `origin pr merge` (`beta` → `main`).
4. Stop. Do not wait for Production.

## 7. Promote (only when you asked to ship production)

1. `vercel promote <beta-or-sha>`.
2. Fail-closed wait for that Production deployment.
3. `pnpm verify:prod` (and account routes with cookie jar when needed).
```

### Feedback and issue writers (OW-15 / OW-16)

Product path today (only in-app create):

`FeedbackButton` → `FeedbackModal` → `POST /api/feedback` →
`createFeedbackGithubIssue` →
`https://api.github.com/repos/StorminRH/lgi-tools/issues`
(`GITHUB_FEEDBACK_TOKEN`, labels `bug` / `enhancement` only).

Also GitHub-shaped today, skill- or GrokBot-owned:

- Update-watch GrokBot creates `Update watch — YYYY-MM-DD` (or
  standing `#444`). No Cloud Agent.
- Refactor GrokBot: `#449` is the process note; work is a draft PR.
- Test-cleanup GrokBot: draft PR only.
- `close-out` can open `[Backlog] …`.
- `triage-issue` comments/labels/closes.

Linear create shape (OW-15, do not implement here):

```graphql
mutation IssueCreate {
  issueCreate(input: { title: "...", description: "...", teamId: "..." }) {
    success
    issue { id title }
  }
}
```

`POST https://api.linear.app/graphql` with `Authorization: <api key>`
(no `Bearer` prefix per Linear’s personal-key docs).

### Scripts to retire (OW-12)

| Keep until | Retire |
| --- | --- |
| `delivery scrub-pr-body` | `delivery poll-pr-gate` (OW-12) |
| `delivery repair-gh-auth` | `delivery merge-clean-pr` (OW-12) |
| `delivery github-api` | Auto bot-gate predicates (OW-12) |
| `wait-prod-deploy` until promote waiter exists | `wait-prod-deploy` as “every merge” (OW-8 / OW-17) |
| `pnpm verify` until OW-4 | `pnpm verify` as definition of done (OW-4) |
| `GITHUB_FEEDBACK_TOKEN` until OW-15 | GitHub Issues as the feedback sink |

`poll_pr_gate.review_state` calls `merge_clean_pr.merge_blockers`.
Name the replacement merge command in OW-8 first.

## Success criteria (agent-runnable — show the output)

- **SC-1 — Origin is the hosted SoT.**

  | Proof | Evidence action | Required observable |
  | --- | --- | --- |
  | `SC-1.1` | Inspect remotes and Origin web | Remote is `origin.cursor.com`; not an inbound GitHub mirror |
  | `SC-1.2` | Open one Origin PR | PR exists on Origin only |

- **SC-2 — Depot `verify` is honest.**

  | Proof | Evidence action | Required observable |
  | --- | --- | --- |
  | `SC-2.1` | Origin PR Checks for `verify` | `services:` Postgres; `*.db.test.ts` ran |
  | `SC-2.2` | Inspect workflow YAML | No bake / Container Builds as the test DB |

- **SC-3 — PR pipeline includes production render and a browser.**

  | Proof | Evidence action | Required observable |
  | --- | --- | --- |
  | `SC-3.1` | Origin PR Checks | `build` ran `pnpm build` + `assert:routes` |
  | `SC-3.2` | Checks + `playwright.config.ts` | `e2e` ran against `next start` when `CI` is set |

- **SC-4 — Agent DoD is Depot `verify`.**

  | Proof | Evidence action | Required observable |
  | --- | --- | --- |
  | `SC-4.1` | Read AGENTS.md, close-out DoD, CONTRIBUTING | Standing gate is `depot ci run --job verify` |

- **SC-5 — Preview-as-dev on Origin; GitHub is not the deploy remote.**

  | Proof | Evidence action | Required observable |
  | --- | --- | --- |
  | `SC-5.1` | Origin PR / branch | Vercel Preview URL is posted |
  | `SC-5.2` | Vercel project git settings + `vercel.json` | Connected repo is Origin; `main: false`; GitHub git disconnected |
  | `SC-5.3` | After feature proof | Neon `preview/<branch>` gone; Convex preview deployment deleted (not merely expired) |

- **SC-6 — Each named skill was visited in isolation.**

  | Proof | Evidence action | Required observable |
  | --- | --- | --- |
  | `SC-6.1` | Git history for OW-6 through OW-11 | Separate chat/PR per skill |
  | `SC-6.2` | Read close-out after OW-8 | Feature merge → `beta`; bots only on `beta` → `main`; no wait-prod |

- **SC-7 — Bot helpers retired as a pair after a replacement exists.**

  | Proof | Evidence action | Required observable |
  | --- | --- | --- |
  | `SC-7.1` | `rg poll_pr_gate\\|merge_clean_pr` | No callers; both files gone |

- **SC-8 — Linear + GrokBots left GitHub Issues (except the bot dump).**

  | Proof | Evidence action | Required observable |
  | --- | --- | --- |
  | `SC-8.1` | OW-14 | Cursor app, one Cloud Agent, and one GrokBot can read/write Linear |
  | `SC-8.2` | Read `create-github-issue.ts` / successor after OW-15 | No `api.github.com/repos/StorminRH/lgi-tools/issues` POST |
  | `SC-8.3` | After OW-16 | Update-watch writes Linear (no Cloud Agent); refactor has Linear process note + Origin draft PR; test-cleanup is Origin draft PR only |

- **SC-9 — `beta` → `main` is manual prod.**

  | Proof | Evidence action | Required observable |
  | --- | --- | --- |
  | `SC-9.1` | `neon.ts` + apply after OW-17 | `beta` has no TTL, cheap CU, short suspend; name is not `preview/` |
  | `SC-9.2` | Convex dashboard | One prod-type extra named `beta`; Preview env uses a preview key |
  | `SC-9.3` | Close-out + one dry-run | Promote is the documented prod action |

- **SC-10 — This plan PR stayed documentation-only.**

  | Proof | Evidence action | Required observable |
  | --- | --- | --- |
  | `SC-10.1` | Diff vs `main` for this publish | Skills, workflows, `vercel.json`, and delivery scripts unchanged |

## End of session

- Confirm every `DONE =` item is evidenced and every `hard_constraints`
  boundary held — for **this** PR, only SC-10 applies. SC-1–SC-9 are
  later chats.
- **Delivery:** Push this plan in-branch and keep the existing PR
  updated. Stop. Do not start OW-1 in this chat.
- **Lifecycle artifacts:** pending changelog fragment for the plan
  publish only. No version bump, no as-built, no roadmap row (ordinary
  work, unnumbered).
- **Handoff:** Next ordinary-work chat is OW-1 (Origin-hosted repo) on
  a machine that can log into Origin. Reshape Ordered work in this
  file if a visit should split or change order. Do not invoke
  `start-session` unless you later decide a numbered session should
  absorb a remaining step.
