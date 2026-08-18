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
  replace laptop `pnpm dev` in most cases. Work lands on
  `development`. Reviewed chunks promote to `staging` when the file
  count vs `staging` is around **100** (the bot-review bar). Merging
  `staging` → `main` is the **release**. Production is a separate
  manual promote. Issues leave GitHub for Linear. After that stack
  works, laptop Cursor and Cloud Agents share one Cursor-native
  workflow.
- **DONE =** SC-1 through SC-11 below, plus: Origin-hosted repo, Depot
  Checks, preview-as-dev, `development` / `staging` / `main` lines,
  GitHub bots only on ~100-file staging dumps, tracker + GrokBots
  retargeted, skills visited in isolation, and local/cloud parity.
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
  disposable dump used only for review bots when promoting a
  **~100-file** chunk from `development` to `staging`. Never merge
  the dump PR. Never accept bot-apply commits. Never push Origin
  `main` to GitHub `main`. Do not dump a larger-than-bar diff to
  Greptile/CodeRabbit — they are not reliable past that size.
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
  `vercel promote` (or the dashboard equivalent) after you cut a
  release from `staging`.
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
  actually going live (`staging` or Production).
- **Plan:** Greptile and CodeRabbit are **manual request only**, and
  only on a GitHub dump whose file count vs `staging` is at or under
  **~100**. That dump is the `development` → `staging` promote, not
  every Origin PR and not the eventual `staging` → `main` release
  unless that release is itself still under the bar. They are not the
  merge gate.
- **Plan:** A merge to `development` or `staging` is not a release.
  Do not bump `APP_VERSION`, do not publish a `### vX.Y.N` heading,
  and do not fold pending changelog fragments until `staging` merges
  to `main`. Session contract numbers (`X.Y.N.M`) stay internal
  planning IDs. Do not rewrite completed 4.0 as-builts to pretend they
  already worked this way.
- **Plan:** Durable `staging` must not use Neon’s `preview/` prefix
  (`neon.ts` gives those a 3-day TTL). Ephemeral feature previews use
  `preview/*` and are torn down after the feature is proven.
  `development` is the git integration line; it does **not** get a
  second standing Convex (cost). Convex `staging` is one prod-type
  extra deployment, left up. Do not put a Production
  `CONVEX_DEPLOY_KEY` on Preview. Do not store
  `NEXT_PUBLIC_CONVEX_URL` / `CONVEX_DEPLOYMENT` on Vercel Preview.
  Staging Convex `SITE_URL` / issuer must be the staging origin, not
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
- **Plan:** Do not point `delete-neon-branch` at durable `staging`. Tear
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
- **Plan:** After the stack exists, local Cursor and Cloud Agents
  share one workflow. Prefer Cursor defaults
  (`.cursor/environment.json`, committed `.cursor/skills/` and
  `.cursor/agents/`, Origin remotes, `depot ci run`, Preview URLs).
  Do not add laptop-only or cloud-only workarounds. Do not ignore
  skills, seats, or docs that both environments need. Keep ignoring
  secrets (`.env*`), cookie jars, coverage, `node_modules`, and
  machine-local `local-only/` trees. `CONVEX_AGENT_MODE=anonymous` is
  the official Cloud Agent Convex default — keep it; do not copy a
  laptop `local:` pair or a hosted Convex URL into the cloud env.

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
| Preview/prod gaps | Known | Convex preview key unused; `SITE_URL` prod-shaped; `neon.ts` is never auto-applied; crons Production-only; shared Upstash. Convex cost is the preview concern (no scale-to-zero) | OW-5 / OW-17: ephemeral teardown + one cheap sleeping `staging` |
| Neon branch policy | In-repo, apply is manual | Repo-root `neon.ts`: `preview/*` gets `ttl: '3d'`, 0.25–1 CU, `suspendTimeout: '1m'`. Other new branches get no TTL and inherit defaults. Existing non-default branches are left alone until `updateExisting` | OW-17 adds a named `staging` arm (no TTL, cheap CU, fast suspend) and applies it |
| Issues | GitHub only | Origin has no tracker. 31 open issues on `StorminRH/lgi-tools` | OW-14 proves Linear; OW-15 migrates feedback |
| Site feedback | GitHub REST | `createFeedbackGithubIssue` POSTs to `StorminRH/lgi-tools` with `GITHUB_FEEDBACK_TOKEN` | Do not retarget until OW-14 |
| Daily GrokBots | Schedule runners | They run on a schedule. When they need to write code they spawn a Cloud Agent in the build environment. **Update watch:** GrokBot itself files an issue (no Cloud Agent). **Refactor:** standing issue documents the process; work lives as a draft PR the agent updates. **Test cleanup:** draft PR only (rebased/updated daily); not an issue. Live GitHub: [#444](https://github.com/StorminRH/lgi-tools/issues/444), [#449](https://github.com/StorminRH/lgi-tools/issues/449) | OW-16 retargets: Linear for issues the bots file; Origin draft PRs for the two accumulators |
| Linear | Intended tracker | Free plan + API. Cursor app, Cloud Agents, and GrokBots each have a Linear connector. Linear `@cursor` repo picker is still documented as GitHub-shaped `owner/repo` | OW-14 proves those connectors on the Origin repo; do not hunt a peer unless that proof fails |
| Depot Developer plan | Purchased intent | Depot CI minutes and results. Unused: Mac runners, Registry, GHA runner minutes, extra-billed Agent sandboxes | Buy Depot CI only |
| Local vs Cloud Agent | Two workflows | Laptop: `pnpm dev:all` (Docker). Cloud: committed `.cursor/environment.json` + native Postgres on `:5433` + `CONVEX_AGENT_MODE=anonymous`. Skills/seats are tracked; `.gitignore` also ignores `local-only/` trees and `.codegraph/`. AGENTS.md carries a long Cloud-specific caveat list | OW-18 last: one Cursor-native path; audit ignore rules; shrink caveats to platform facts |
| This plan PR | In progress | This file on `stormin/origin-ci-migration-4df8` | This chat only publishes the plan |

## Why now

You want to stop treating the laptop as the app and GitHub as the forge.
Origin plus Depot plus Vercel-on-Origin can be the daily loop: CI on
the PR, click the Preview, merge into `development`, and only touch
GitHub when a ~100-file chunk is ready for `staging`. Temporary
previews must not leave Neon and Convex running; `staging` keeps one
cheaper pair.
Issues that need a board (feedback, update-watch, refactor process)
move to Linear because the Cursor app, Cloud Agents, and GrokBots
already have that connector. Planned sessions keep contracts and
ordered work, but they stop minting a public version on every merge;
`development` is the integration line, `staging` is the reviewed
moving branch, and `main` is the release cut. Origin and Depot first
so later visits use the remotes you will keep.

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
- Passing feature work (planned session or ordinary) merges to
  Origin `development`. No version bump. A pending changelog fragment
  records what changed.
- When `git diff --name-only staging...development` is around **100
  files** and Depot is clean: dump that range to GitHub, **manually**
  request Greptile/CodeRabbit, triage, fix on Origin, merge
  `development` → `staging`. `staging` is the standing cheaper
  preview of reviewed work.
- When you want production: merge Origin `staging` → `main` as a
  **release** (fold pending fragments, publish one `### vX.Y.N`, set
  `APP_VERSION`), then **manually** promote. You may run several
  staging promotes before one release.
- Vercel no longer watches GitHub.
- Linear holds issues (feedback, update-watch, refactor process,
  `[Backlog]`, triage). Test-cleanup and refactor **work** stay draft
  Origin PRs that GrokBots / spawned Cloud Agents rebase. Update-watch
  stays issue-only (no Cloud Agent).
- Each lifecycle skill has been visited in isolation against this
  model.
- Laptop Cursor and Cloud Agents run the same skills, seats, Origin
  remotes, Depot `verify`, and Preview-or-optional-`pnpm dev` loop.
  Required files are tracked on Origin. Cloud install/start follow
  Cursor’s environment schema, not a second undocumented stack.

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
| Manual prod + standing staging | OW-17 |
| GitHub bots-only | OW-8 writes the dump ritual; OW-17/close-out keep it |
| Local / cloud parity | OW-18 last, after the stack works |
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
  Sometimes that preview is short-lived (one feature). `staging`
  stays up as the reviewed accumulated preview. Laptop `pnpm dev`
  remains when you want speed. **Rejected:** per-PR previews stay off
  forever (overruled leftover).
- **`vercel.json`:** `main: false` is mandatory. Allowing other
  branches to deploy is the preview process. Convex cost is the
  limiter (a preview backend does not sleep). A naming convention is
  allowed if every-branch previews are too expensive. Every ephemeral
  preview must tear down Neon + Convex after the feature is proven.
- **Three git lines, not one `beta`.** `development` is where sessions
  land. `staging` is the reviewed moving branch (durable preview).
  `main` is the release cut. **Rejected:** one long `beta` that grows
  past what Greptile/CodeRabbit can read, then one dump of the whole
  pile.
- **GitHub bot bar: ~100 files vs `staging`.** Measure
  `git diff --name-only staging...development | wc -l`. When it is
  around 100 and the chunk is clean, dump **that range**, request
  bots manually, fix on Origin, fast-forward or merge into `staging`.
  You may cut a smaller chunk; do not dump a larger one. Repeat until
  `staging` holds everything you want in the next release.
  **Rejected:** bots on every Origin PR; bots as the merge gate; one
  giant dump at release time if it exceeds the bar (split first).
- **Production:** merge Origin `staging` → `main`, then manual
  `vercel promote`. Do not rely on Vercel-for-Origin’s “merge to
  production branch ships prod.”
- **One standing backend pair, on `staging`.** Convex is the cost.
  Do not give `development` its own durable Convex. Feature PRs keep
  ephemeral pairs and tear them down.
- **Depot product: CI sandboxes with `jobs.<id>.services` Postgres.**
  **Rejected:** Container Builds / bake as the test DB.
- **Job split:** `verify` = typecheck, lint, `assert:routes-present`,
  `test:coverage` **with** `*.db.test.ts`, Fallow. `build` = `pnpm
  build` + `assert:routes` (not `build:vercel`). `e2e` = Playwright vs
  `next start`. Agent runs `--job verify`. PR runs the full workflow.
- **“No more mock tests”:** canned-row Vitest is not the CI stand-in
  for SQL. Pure `*.test.ts` stays. Real SQL is `*.db.test.ts` on Depot.
- **Lifecycle: isolated skill visits, then schemas follow the release
  train.** Origin/Depot/preview first so those visits use the new
  remotes. Contracts → plans → ordered work stay as the way you
  *do* work. They stop being the way you *version* the product.
- **Release train with a review staging line.** Many small landings
  on `development`. Chunked bot review + promote to `staging` at the
  ~100-file bar. One release when you cut `staging` → `main`. Pending
  fragments accumulate from every landing; fold only at that cut.
  You pick the public number at cut time (`4.0.6`, or `4.1.0` if the
  theme changed) — not from the last session id. Git tags (`v4.0.6`)
  are optional later.
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
- **Neon preview vs `staging`:** policy lives in repo-root `neon.ts`.
  New `preview/*` → 3-day TTL, 0.25–1 CU, suspend in 1 minute. New
  unnamed branches inherit defaults (no TTL). `staging` gets its own
  arm: no TTL, cheap CU, short `suspendTimeout`. Apply with
  `neon config apply` (`updateExisting` for a branch that already
  exists). Dashboard is fine if the CLI needs a hand. Do not name it
  `preview/staging`.
- **Convex preview vs `staging`:** cost is the reason to tear down
  ephemeral previews and to skip a durable `development` backend.
  Official Convex has **no scale-to-zero**. Pause stops
  function/bandwidth charges; storage still bills. Preview-type
  backends expire 5 days (Free/Starter) or 14 days (paid) from
  **creation**, not last use — that is a safety net, not the process.
  Vercel ending a Preview does **not** delete Convex. Tear down with
  dashboard delete or Management API
  `POST /deployments/:name/delete`. Use a **preview deploy key** on
  Vercel Preview so `npx convex deploy` creates `preview/[branch]`.
  `staging` is `npx convex deployment create staging --type prod` —
  one durable extra, no expiry. Pause when idle if you want to stop
  function charges. Do not put a prod key on Preview.
- **Developer plan utilization:** Depot CI minutes and results only.
- **Cloud Agent / Origin CLI:** browser login on a machine you
  control. Do not paste keys in chat.
- **Local / cloud parity last.** OW-18 runs only after Origin, Depot,
  previews, release train, Linear, and GrokBots are working. Audit
  `.gitignore`, `AGENTS.md` Cloud notes, `.cursor/install.sh` /
  `start.sh` / `environment.json`, and any skill that says “locally
  vs Cloud Agent.” Delete the second workflow. Use Cursor’s
  environment schema and Origin-native remotes. A Cloud VM with no
  Docker is a platform fact — express it as `environment.json`
  terminals, not as a parallel `pnpm dev:all` path agents must
  remember.

### Release model (what to keep, what to change)

You already have most of a traditional release train. The missing piece
is that **planned close-out treats every finished sub-version as a
public release**: merge to `main`, bump `APP_VERSION` (today
`4.0.5.1`), publish `### v4.0.5.1`, fold pending fragments. Ordinary
work already does the right smaller thing (a pending fragment, no
version). After this migration, **everything that lands on `development`
behaves like today’s ordinary work**. The version happens once, when
you cut `staging` → `main`.

Think of four layers. They stay separate:

| Layer | What it is | When it moves |
| --- | --- | --- |
| **Work package** | Session contract → plan → ordered work (or an ordinary PR) | Merge to Origin `development` when that slice is proven |
| **Review chunk** | Files on `development` that `staging` does not have yet | When `git diff --name-only staging...development` is around **100**, dump that range to GitHub, request bots, merge to `staging` |
| **Release** | One public number + one changelog entry + `APP_VERSION` | Merge Origin `staging` → `main` |
| **Production** | Users on `lgi.tools` | `vercel promote` of that `main` SHA |

That is a development → staging → main train. Many small landings,
chunked bot review at the file-count barn, one versioned cut, then a
deploy. You do not need a new numbering invention to start.

**Why `development` and `staging`, not one long `beta`:** Greptile
and CodeRabbit are not reliable past ~100 files. A single
integration branch that grows for weeks cannot be dumped whole. So
`development` is the daily land (no version, pending fragment,
ephemeral Preview). `staging` is the reviewed moving branch
(durable cheaper Neon + one Convex, standing Preview). You run
overwork sessions until the unreviewed file count vs `staging` is
around 100, then you submit that chunk — not the whole pile. Repeat
until `staging` holds what you want in the next release. Then one
`staging` → `main` cut.

**Keep (this is project management, not releasing):**

- Contracts, plans, and ordered work as the way a planned slice is
  specified and executed.
- As-builts as “what that session actually did.”
- Pending fragments as the inbox of user-facing notes that are not
  public yet (`docs/workflows/schema/changelog-pending.md`).
- Ordinary vs planned as *how the work was authorized*, not as *whether
  it gets a version*.

**Change (this is releasing):**

- Session id `4.0.5.1.1` is a planning label. It must not force
  `APP_VERSION` `4.0.5.1`.
- “Final session of a sub-version” no longer opens the release PR to
  `main`. It merges to `development` and drops a pending fragment like
  everyone else.
- “Shipped” in contracts/schemas splits: **landed** (on
  `development`) vs **reviewed** (on `staging`) vs **released** (on
  `main`, version published) vs **in production** (promoted).
- Close-out grows **four named rituals**:
  1. **Land on `development`** (today’s default after this rewrite,
     including a “final” session).
  2. **Promote a review chunk** (bots + dump + merge to `staging`)
     when the file count vs `staging` is around 100.
  3. **Cut a release** (`staging` → `main` + fold + bump).
  4. **Promote production** (named ask).

**How to pick the public number at cut time (plain rule):**

- Same master theme (`4.0` Atlas, etc.): increment the last published
  `N` (`4.0.5` → `4.0.6`) for the whole bundle on `staging`, no matter
  how many sessions or ordinary PRs piled up.
- New theme / new master plan: start `4.1.0` (or whatever the new
  `X.Y` is) as the first release of that line.
- Do not mint a version per session “so the numbers match the
  contracts.” Players see one date and one list of bullets.

Optional later, not required: a git tag `v4.0.6` on the release
commit. The site already keys off `APP_VERSION` and
`content/changelog/vX.Y.md`.

**What agents write on a `development` landing:** exactly one pending fragment
(planned or ordinary). No `content/changelog/v4.0.md` heading, no
`src/config/app-version.ts` edit. The fold command you already have
(`python3 tools/cli.py lifecycle fold-pending-changelog`) runs only
on the release close-out.

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
- `neon.ts` — preview TTL/compute and the `staging` cheap-sleep arm
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
- `.cursor/environment.json`, `.cursor/install.sh`, `.cursor/start.sh`,
  `.gitignore`, Cloud notes in `AGENTS.md` — OW-18.

### Interfaces and contracts

- `depot ci run --workflow <file> --job verify` — agent/laptop gate.
- Full Depot workflow on an Origin PR — `verify` + `build` + `e2e`.
  Wait with `origin pr checks --watch`.
- Origin branch / PR → Vercel Preview URL — usual feature look.
- `origin pr merge` into `development` — daily land. Does not
  promote to `staging` or production.
- GitHub dump of `staging...development` when the file count is
  around **100** + **manual** bot request — review chunk only.
  Never merge the dump. Then merge Origin `development` → `staging`.
- `origin pr merge` (`staging` → `main`) then `vercel promote` —
  release, then production.
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
   Convex preview. Merge the Origin PR to **`development`**. No
   standing Convex on `development` — that line is git integration
   only.
5. Repeat overwork sessions. Measure
   `git diff --name-only staging...development | wc -l`. When it is
   around **100** and Depot is clean, dump **that range** to GitHub
   (branch, not a merge). Manually request Greptile and CodeRabbit.
   Triage. Fix on Origin. Re-check Depot. Merge Origin
   `development` → `staging`. The standing `staging` preview (one
   cheaper Neon + one Convex) updates. You may cut a smaller chunk;
   do not dump a larger one.
6. Repeat staging promotes until `staging` holds the next release.

When you ask for a release:

7. Fold pending fragments, pick `X.Y.N`, set `APP_VERSION`, merge
   Origin `staging` → Origin `main`. **Nothing deploys to
   production yet.** Do not dump the whole `staging` pile to bots
   unless that remaining diff is still under the 100-file bar.
8. `vercel promote` that release to Production when you ask.

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
  checks use laptop or the durable `staging` URL once SSO is registered.
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
   Checks, Preview-as-dev, and merge-to-`development`. Prove by walking the
   rewritten flow on paper. Do not edit other skills.

7. **Isolated visit: planned-session flow.** Change only
   `plan-session` so a planned session is still something you want
   (contract → plan → ordered work), and so its **delivery unit** is
   a PR onto `development`, not a sub-version release onto `main`. Prove by
   comparing one existing session plan’s OW shape to the rewritten
   skill. Do not bump versions in this chat.

8. **Isolated visit: `close-out`.** Change only
   `.cursor/skills/close-out/SKILL.md` so there are four named
   rituals:
   - **Land on `development`** (ordinary or planned, including a
     “final” session): Depot green, Preview used, pending fragment,
     merge to Origin `development`. No `APP_VERSION`, no
     `### vX.Y.N`, no fold, no GitHub dump.
   - **Promote a review chunk** (when
     `git diff --name-only staging...development` is around **100**
     and you ask, or when you ask for a smaller clean chunk): dump
     that range to GitHub, **manual** bots, fix on Origin, merge
     `development` → `staging`. Never merge the dump. Never dump
     more than the bar.
   - **Cut a release** (only when you ask): fold pending fragments,
     pick the public `X.Y.N`, set `APP_VERSION`, merge `staging` →
     `main`. Stop. Do not promote.
   - **Promote** (only when you ask): `vercel promote`.
   Prove with a paper dry-run of all four. Do not flip `vercel.json`
   in this chat.

9. **Isolated visit: `ux-check`.** Change only the ux-check skill and
   `docs/ux-check/README.md` so automated evidence is “Depot `e2e` was
   green,” visual review uses the Vercel Preview URL (laptop optional),
   and agents still must not visually approve.

10. **Isolated visit: update-watch pair.** Change only
    `resolve-update-watch` and `update-watch` so review/merge follow
    Origin + Depot + `development`. Issue create/list may still be GitHub
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

13. **Standing docs after skills settle.** Change
    `docs/workflows/schema/session-contract.md` (delivery unit → PR
    to `development`; “shipped” splits landed / reviewed / released /
    in production),
    `session-plan.md`, `session-as-built.md` (land SHA vs staging SHA
    vs release SHA vs promote SHA), `changelog-pending.md` (fold only on cut
    release, including planned landings), `changelog-entry.md` (one
    entry per cut, not per sub-version session), and
    `docs/VERSION_4_0_PLAN.md` standing language (not completed
    rows), plus contributing test docs and README. Depot is the
    gate. Preview is the usual look. `*.db.test.ts` is a `verify`
    requirement. Prove `check-doc-refs` / pending-changelog checker
    clean on touched files.

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

17. **Manual production + standing `staging`.** In `neon.ts`, add a
    named `staging` arm: no `ttl`, cheap CU (0.25–1), short
    `suspendTimeout` (1m or 5m). Create the Neon branch as `staging`
    (not `preview/staging`). `neon config apply` with `updateExisting`
    (today’s `if (branch.exists) return {}` would skip it). Create
    one Convex `npx convex deployment create staging --type prod`.
    Register EVE SSO on that stable URL only if signed-in Atlas is
    in scope. Document promote as the only production path. Prove:
    `staging` Preview stays up on the cheap pair; ephemeral pairs are
    gone after teardown; Origin `main` does not auto-deploy;
    `development` has no second durable Convex.

18. **Local / Cloud Agent parity (Cursor defaults).** Last step, only
    after OW-1–17 are working. Walk laptop Cursor and a Cloud Agent
    through the same loop: Origin remote, `depot ci run --job
    verify`, Preview URL (laptop `pnpm dev` optional), land on
    `development`. Change `.cursor/environment.json`, `install.sh`,
    `start.sh`, and `AGENTS.md` so they describe **one** workflow
    using Cursor’s environment schema
    (`https://cursor.com/docs/cloud-agent/setup`). Audit
    `.gitignore`: track every skill, seat, and doc both sides need;
    keep ignoring `.env*`, cookie jars, coverage, `node_modules`,
    and true machine-local `local-only/` trees. Remove skill
    branches that say “do this locally, do that on Cloud” unless
    they name a platform fact (no Docker daemon on the Cloud VM;
    official `CONVEX_AGENT_MODE=anonymous`). Do not add new
    workarounds. Do not upload production `DATABASE_URL` or a hosted
    Convex URL. Prove: a Cloud Agent on the Origin repo can run the
    rewritten start-session / close-out land-on-`development` path with the
    same files a laptop clone has.

### Local / cloud parity (OW-18)

Cursor-intended Cloud setup is a committed `.cursor/environment.json`
(`install`, `start`, `terminals`, `ports`) plus skills and agents in
the git tree. That is the default to lean on. Laptop and Cloud then
share Origin, Depot, and Preview as the daily loop.

Leave ignored: secrets, Playwright cookie jars, coverage,
`node_modules`, `.next`, and directories named `local-only/` that
are truly one-machine scratch. Do not ignore a skill or seat because
“Cloud does not need it.”

`CONVEX_AGENT_MODE=anonymous` and a Cloud VM without Docker are
platform defaults, not repo inventions. Express the latter as the
`postgres` terminal in `environment.json`. Do not keep teaching
agents `pnpm dev:all` (Docker Compose) as the Cloud path.

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

**Standing `staging` (slower/cheaper than prod, left up)**

| | Neon | Convex |
| --- | --- | --- |
| Name | `staging` (never `preview/staging`) | `npx convex deployment create staging --type prod` |
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
## 5. Land on development (ordinary or planned — including a “final” session)

1. Reuse Depot `verify` when the head is unchanged.
2. Open one draft Origin PR. Scrub the body.
3. Wait: `origin pr checks --watch`.
4. Use the Vercel Preview URL (laptop `pnpm dev` only if you choose).
5. Write exactly one pending changelog fragment. Do not edit
   `APP_VERSION` or `content/changelog/vX.Y.md`.
6. Origin review. Tear down the feature Preview’s Neon `preview/*`
   branch and Convex preview deployment. Merge to Origin `development`.
7. Stop. Do not promote to staging. Do not dump to GitHub. Do not
   request bots. Do not fold pending fragments.

## 6. Promote a review chunk (when the file-count barn is met)

1. Measure `git diff --name-only staging...development`. If it is
   well over **100** files, split; do not dump the whole pile.
2. Dump that range to GitHub. Manually request Greptile and
   CodeRabbit. Import findings. Fix on Origin. Never merge GitHub.
3. Origin Depot full pipeline green on the fixed range.
4. `origin pr merge` (`development` → `staging`).
5. Stop. Do not cut a release. Do not promote production.

## 7. Cut a release (only when you asked)

1. Fold every pending fragment. Pick the public `X.Y.N` (next patch
   on this theme, or a new `X.Y.0`). Prepend `### vX.Y.N`. Set
   `APP_VERSION`. Delete consumed fragments.
2. `origin pr merge` (`staging` → `main`).
3. Stop. Do not wait for Production.

## 8. Promote (only when you asked to ship production)

1. `vercel promote <main-release-or-staging-url>`.
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
  | `SC-6.2` | Read close-out after OW-8 | Land → `development` with a pending fragment and no version; review chunk at ~100 files → `staging`; cut release and promote are named asks |

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

- **SC-9 — `staging` → `main` is the release; promote is prod.**

  | Proof | Evidence action | Required observable |
  | --- | --- | --- |
  | `SC-9.1` | `neon.ts` + apply after OW-17 | `staging` has no TTL, cheap CU, short suspend; name is not `preview/` |
  | `SC-9.2` | Convex dashboard | One prod-type extra named `staging`; Preview env uses a preview key; `development` has no durable Convex |
  | `SC-9.3` | Close-out + schemas after OW-8 / OW-13 | `APP_VERSION` and `### vX.Y.N` change only on cut release; pending fold runs only then |
  | `SC-9.4` | Close-out + one dry-run | Review-chunk dump stays ≤ ~100 files vs `staging`; promote is the documented prod action |

- **SC-10 — This plan PR stayed documentation-only.**

  | Proof | Evidence action | Required observable |
  | --- | --- | --- |
  | `SC-10.1` | Diff vs `main` for this publish | Skills, workflows, `vercel.json`, and delivery scripts unchanged |

- **SC-11 — Laptop and Cloud Agent share one Cursor-native workflow.**

  | Proof | Evidence action | Required observable |
  | --- | --- | --- |
  | `SC-11.1` | Compare laptop clone and Cloud Agent tree | Same tracked skills, seats, and docs; required files are not gitignored |
  | `SC-11.2` | Cloud Agent dry-run of land-on-`development` | Origin remote + `depot ci run --job verify` + same close-out steps as laptop |
  | `SC-11.3` | Read `AGENTS.md` + `environment.json` | One workflow; remaining Cloud notes are platform facts only |

## End of session

- Confirm every `DONE =` item is evidenced and every `hard_constraints`
  boundary held — for **this** PR, only SC-10 applies. SC-1–SC-9 and
  SC-11 are later chats.
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
