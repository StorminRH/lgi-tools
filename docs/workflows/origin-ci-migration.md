# Origin / Depot / ship-path migration — ordinary-work plan

**Plan status:** Draft (operator reshapes between chats)
**Kind:** Ordinary work — not a numbered lifecycle session. Do not run
`start-session` or the lifecycle resolver for this plan.
**Planning standard:** `docs/workflows/schema/session-plan.md` (shape
only: Bottom line, hard constraints, ordered work, success criteria)
**Proof standard:** Atomic (each Ordered work step is its own later
execution chat)
**Execution status:** Pending
**Baseline effect:** Neutral

**Settled loop:** Land each Ordered work step on `development`
(fast-forward, no land PR). Promote at 80 app-facing files versus
`staging`. A dump over 100 files is blocked. Release is
`staging` → `main`. As-builts land on the promote PR. The public
changelog is written at release from those as-builts. `close-out` is
one process onto `staging` or `main`. Remaining work in this plan is `ux-check`, schemas,
Linear/GrokBots, standing `staging` backends, and local/cloud parity.

This file is the execution prompt for the migration. Publish it first.
Then run each Ordered work step as a later ordinary-work chat. Origin
and Depot land first so later skill visits, previews, and tracker work
happen on the stack you will keep.

## Bottom line (READ FIRST)

- **GOAL:** Origin is where you code, run CI, open previews, merge, and
  ship. Depot is the only gate and runs real Postgres. Vercel previews
  replace laptop `pnpm dev` in most cases. Work lands on
  `development`. Reviewed chunks promote to `staging` at **80
  app-facing files**. Merging
  `staging` → `main` is the **release** and **Production** (Vercel
  auto-deploys `main`). `development` is the short-lived Preview that
  replaces laptop `pnpm dev` for ordinary looks. `staging` is the
  long-lived Preview of reviewed work. Issues leave GitHub for Linear.
  After that stack works, laptop Cursor and Cloud Agents share one
  Cursor-native workflow.
- **DONE =** SC-1 through SC-11 below, plus: Origin-hosted repo, Depot
  Checks, preview-as-dev, `development` / `staging` / `main` lines,
  GitHub bots only on promote dumps (80 app-facing, blocked well over
  100 files), tracker + GrokBots
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
  disposable dump of the app-facing files in a promote chunk, used
  only for review bots. The packet is
  `lifecycle count-app-facing --list`, the same isolation as
  adversarial review. Skills and standing docs stay off that dump.
  Never merge the dump PR. Never accept bot-apply commits. Never push
  Origin `main` to GitHub `main`. A dump well over the ~100-file bar
  stays off Greptile and CodeRabbit. They are not reliable past that
  size.
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
- **Plan:** Disconnect the GitHub git integration only after an Origin
  branch produces a Preview URL. Origin repos are private and cannot
  deploy from a Vercel Hobby team.
- **Plan:** Vercel-for-Origin: merge/`main` push = Production. That is
  the production path — keep `deploymentEnabled.main: true`.
  `development` auto-deploys a short-lived Preview. `staging`
  auto-deploys the long-lived Preview. Other branches stay off
  auto-deploy; a Preview from an Origin feature branch is **manual**
  when you want one. There is no separate `vercel promote` step.
- **Plan:** Previews are the usual way to exercise a feature. Laptop
  `pnpm dev` stays allowed when you want it. Do not require a laptop
  Next server for ordinary visual checks once a Preview URL exists.
- **Plan:** After Depot adoption, definition of done is
  `depot ci run --job verify`. Retire `pnpm verify` from AGENTS.md,
  close-out, CONTRIBUTING, and the PR template. Do not fall back to a
  laptop verify that skips `*.db.test.ts`.
- **Plan:** Laptops and agents never run `next build`,
  `pnpm vercel-build`, or Playwright as the local test suite. Job `build` and
  job `e2e` are PR-only on Depot.
- **Plan:** Do not run `build:vercel` in the CI build job. Migrate /
  ingest / warm-neon stay deploy-time on the environment that is
  actually going live (`staging` or Production).
- **Plan:** Greptile and CodeRabbit are **manual request only**, and
  only on a GitHub dump of the app-facing files vs `staging` at or
  under **~100**. That dump is the `development` → `staging` promote,
  not every Origin PR and not the eventual `staging` → `main` release
  unless that release is itself still under the bar. They are not the
  merge gate.
- **Plan:** A merge to `development` or `staging` is not a release.
  Do not bump `APP_VERSION`, do not publish a `### vX.Y.N` heading,
  and do not write a public changelog until `staging` merges
  to `main`. Session contract numbers (`X.Y.N.M`) stay internal
  planning IDs. Do not rewrite completed 4.0 as-builts to pretend they
  already worked this way.
- **Plan:** Durable `staging` must not use Neon’s `preview/` prefix
  (`neon.ts` gives those a 3-day TTL). `development` is the
  short-lived Preview (ordinary looks instead of laptop `pnpm dev`).
  `staging` is the long-lived Preview. Manual feature-branch Previews
  use Neon `preview/*` and are torn down after the look is done.
  Convex `staging` is one prod-type extra deployment, left up.
  `development` Preview backends are ephemeral. Do not put a
  Production `CONVEX_DEPLOY_KEY` on Preview. Do not store
  `NEXT_PUBLIC_CONVEX_URL` / `CONVEX_DEPLOYMENT` on Vercel Preview.
  Staging Convex `SITE_URL` / issuer must be the staging origin, not
  `lgi.tools`.
- **Plan:** Origin has no issue tracker. Linear is the intended home
  (Cursor app, Cloud Agents, and GrokBots all have Linear connectors).
  Do not migrate `createFeedbackGithubIssue`, update-watch, close-out
  `[Backlog]`, or the refactor process issue until OW-14 proves those
  connectors against the Origin repo. Test-cleanup is a draft PR, not
  an issue — do not invent an issue for it.
- **Plan:** `poll_pr_gate.py` and `merge_clean_pr.py` are gone. Merge
  with `origin pr merge`. Keep `github_api.py`, `scrub_pr_body.py`,
  `repair_gh_auth.py` while the GitHub dump still needs them.
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
  skills, agents, or docs that both environments need. Keep ignoring
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
| Vercel ↔ Origin | Not the project git remote | Live `lgi-tools` project `link.type` is `github` / `StorminRH/lgi-tools` (API 2026-08-18). Team plan is Pro | OW-5 connects Origin, proves a **manual** Preview from an Origin branch, then disconnects GitHub |
| Vercel ↔ GitHub | Still the deploy remote | `vercel.json` `main: true`; deny globs hide other branches. Recent deploys are Production-only | Keep `main: true`. Turn on `development` (short Preview) and `staging` (long Preview) only after Origin is the connected repo |
| Depot CLI | Not present here | No `depot` on this VM or the operator laptop at last check | OW-2 installs CLI where the operator works |
| Live DoD | Origin PR Depot pipeline | OW-4 landed on `stormin/depot-verify-dod` | Local test suite is typecheck / lint / Fallow dead-code+dupes / focused tests |
| Live CI | GHA, no real SQL | `.github/workflows/test.yml` skips `*.db.test.ts` | OW-2/OW-3 replace this on Origin |
| Preview/prod gaps | Known | Convex preview key unused; `SITE_URL` prod-shaped; `neon.ts` is never auto-applied; crons Production-only; shared Upstash. Convex cost is the preview concern (no scale-to-zero) | OW-5 / OW-17: ephemeral teardown + one cheap sleeping `staging` |
| Neon branch policy | In-repo, apply is manual | Repo-root `neon.ts`: `preview/*` gets `ttl: '3d'`, 0.25–1 CU, `suspendTimeout: '1m'`. Other new branches get no TTL and inherit defaults. Existing non-default branches are left alone until `updateExisting` | OW-17 adds a named `staging` arm (no TTL, cheap CU, fast suspend) and applies it |
| Issues | GitHub only | Origin has no tracker. 31 open issues on `StorminRH/lgi-tools` | OW-14 proves Linear; OW-15 migrates feedback |
| Site feedback | GitHub REST | `createFeedbackGithubIssue` POSTs to `StorminRH/lgi-tools` with `GITHUB_FEEDBACK_TOKEN` | Do not retarget until OW-14 |
| Daily GrokBots | Schedule runners | They run on a schedule. When they need to write code they spawn a Cloud Agent in the build environment. **Update watch:** GrokBot itself files an issue (no Cloud Agent). **Refactor:** standing issue documents the process; work lives as a draft PR the agent updates. **Test cleanup:** draft PR only (rebased/updated daily); not an issue. Live GitHub: [#444](https://github.com/StorminRH/lgi-tools/issues/444), [#449](https://github.com/StorminRH/lgi-tools/issues/449) | OW-16 retargets: Linear for issues the bots file; Origin draft PRs for the two accumulators |
| Linear | Intended tracker | Free plan + API. Cursor app, Cloud Agents, and GrokBots each have a Linear connector. Linear `@cursor` repo picker is still documented as GitHub-shaped `owner/repo` | OW-14 proves those connectors on the Origin repo; do not hunt a peer unless that proof fails |
| Depot Developer plan | Purchased intent | Depot CI minutes and results. Unused: Mac runners, Registry, GHA runner minutes, extra-billed Agent sandboxes | Buy Depot CI only |
| Local vs Cloud Agent | Two workflows | Laptop: `pnpm dev:all` (Docker). Cloud: committed `.cursor/environment.json` + native Postgres on `:5433` + `CONVEX_AGENT_MODE=anonymous`. Skills and agents are tracked; `.gitignore` also ignores `local-only/` trees and `.codegraph/`. AGENTS.md carries a long Cloud-specific caveat list | OW-18 last: one Cursor-native path; audit ignore rules; shrink caveats to platform facts |
| This plan PR | In progress | This file on `stormin/origin-ci-migration-4df8` | This chat only publishes the plan |

## Why now

You want to stop treating the laptop as the app and GitHub as the forge.
Origin plus Depot plus Vercel-on-Origin is the daily loop: land on
`development`, look at the Preview, promote at 80 app-facing files,
and only touch GitHub for that dump. Temporary previews must not
leave Neon and Convex running; `staging` keeps one cheaper pair.
Issues that need a board (feedback, update-watch, refactor process)
move to Linear because the Cursor app, Cloud Agents, and GrokBots
already have that connector. Planned sessions keep contracts and
ordered work, but they stop minting a public version on every land;
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
- Passing feature work (planned session or ordinary) lands on
  Origin `development`. No version bump. No land PR. No pending
  changelog fragment.
- When app-facing files versus `staging` hit **80** and Depot is
  clean: promote `development` → `staging` through `close-out`. Dump
  that range to GitHub for bots. A dump well over **100** files is
  blocked. `staging` is the standing cheaper preview of reviewed work.
- When you want production: merge Origin `staging` → `main` as a
  **release** (write one `### vX.Y.N` from the as-builts, set
  `APP_VERSION`). Vercel auto-deploys Production. You may run several
  staging review-chunk merges before one release.
- Vercel no longer watches GitHub.
- Linear holds issues (feedback, update-watch, refactor process,
  `[Backlog]`, triage). Test-cleanup and refactor **work** stay draft
  Origin PRs that GrokBots / spawned Cloud Agents rebase. Update-watch
  stays issue-only (no Cloud Agent).
- Each lifecycle skill has been visited in isolation against this
  model.
- Laptop Cursor and Cloud Agents run the same skills, agents, Origin
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
| Standing staging backends | OW-17 |
| GitHub bots-only | OW-8 writes the dump; OW-17/close-out keep it |
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
- **Previews replace laptop `pnpm dev` in most cases.** `development`
  is the short-lived Preview for ordinary looks. `staging` is the
  long-lived Preview of reviewed work. A feature-branch Preview is
  **manual** when you want one from an Origin branch. Laptop
  `pnpm dev` remains when you want speed.
- **`vercel.json`:** `main: true` (Production auto-deploy on merge).
  Enable `development` and `staging` for Preview. Leave other
  branches false so feature work does not mint a Convex backend on
  every push. Manual Preview from an Origin branch is the proof that
  Origin can deploy. Tear down ephemeral Neon + Convex after a
  short-lived look is done.
- **Three git lines, not one `beta`.** `development` is where sessions
  land. `staging` is the reviewed moving branch (durable preview).
  `main` is the release cut. **Rejected:** one long `beta` that grows
  past what Greptile/CodeRabbit can read, then one dump of the whole
  pile.
- **Promote at 80 app-facing files vs `staging`.** Measure with
  `python3 tools/cli.py lifecycle count-app-facing`. Dump those
  app-facing files to GitHub, request bots manually, fix on Origin,
  merge the Origin PR onto `staging`. A dump well over **100** files
  is blocked.
  You may cut a smaller chunk. Repeat until `staging` holds
  everything you want in the next release.
  **Rejected:** bots on every land; bots as the merge gate; one
  giant dump at release time if it exceeds the bar (split first).
- **Production:** merge Origin `staging` → `main`. Vercel auto-deploys
  Production from `main`. That merge is the deploy. No separate
  `vercel promote`.
- **One standing backend pair, on `staging`.** Convex is the cost.
  `development` Preview backends are short-lived. Feature-branch
  Previews are manual and ephemeral.
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
  on `development`. Promote to `staging` at 80 app-facing files.
  One release when you cut `staging` → `main`. As-builts accumulate
  on each promote PR; the public changelog is written at that cut.
  The public number is the latest lifecycle identity already on
  `staging`. Git tags (`v4.0.6`) are optional later.
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

### Release model

Four layers. They stay separate:

| Layer | What it is | When it moves |
| --- | --- | --- |
| **Work package** | Session contract → plan → ordered work (or ordinary work) | Fast-forward onto Origin `development` when that step is proven. No land PR. |
| **Review chunk** | App-facing files on `development` that `staging` does not have yet | At **80** (`lifecycle count-app-facing`). Dump those files to GitHub, request bots, merge the Origin PR onto `staging`. A dump well over **100** is blocked. |
| **Release** | One public number + one changelog entry + `APP_VERSION` | Merge Origin `staging` → `main`. Write the changelog from the as-builts on that range. |
| **Production** | Users on `lgi.tools` | That same `staging` → `main` merge (Vercel auto-deploys) |

That is a development → staging → main train. Many small lands,
promote at 80, one versioned cut that auto-deploys.

**Why `development` and `staging`, not one long `beta`:** Greptile
and CodeRabbit are not reliable past ~100 files. A single
integration branch that grows for weeks cannot be dumped whole. So
`development` is the daily land (no version, no changelog, ephemeral
Preview). `staging` is the reviewed moving branch (durable cheaper
Neon + one Convex, standing Preview). Promote writes as-builts on
the Origin PR. Repeat until `staging` holds what you want in the
next release. Then one `staging` → `main` cut.

**Keep (this is project management, not releasing):**

- Contracts, plans, and ordered work as the way a planned slice is
  specified and executed.
- As-builts as “what that session actually did,” written on the
  promote PR.
- Ordinary vs planned as *how the work was authorized*, not as *whether
  it gets a version*.

**Change (this is releasing):**

- Session id `4.0.5.1.1` is a planning label. It must not force
  `APP_VERSION` `4.0.5.1`.
- A finished session lands on `development`. It does not open a
  release PR and does not write a changelog fragment.
- “Shipped” in contracts/schemas splits: **landed** (on
  `development`, short-lived Preview) vs **reviewed** (on `staging`,
  long-lived Preview) vs **released / in production** (on `main`,
  version published, Vercel auto-deployed).
- `close-out` is **one process** onto `staging` or `main`. Usual
  heads are `development` → `staging` and `staging` → `main`. The
  GitHub dump runs onto `staging`. Land lives in `start-session`.

**How to pick the public number at cut time (plain rule):**

- Same master theme (`4.0` Atlas, etc.): increment the last published
  `N` (`4.0.5` → `4.0.6`) for the whole bundle on `staging`, no matter
  how many sessions or ordinary lands piled up.
- New theme / new master plan: start `4.1.0` (or whatever the new
  `X.Y` is) as the first release of that line.
- Do not mint a version per session “so the numbers match the
  contracts.” Players see one date and one list of bullets.

Optional later, not required: a git tag `v4.0.6` on the release
commit. The site already keys off `APP_VERSION` and
`content/changelog/vX.Y.md`.

**What agents write on a `development` landing:** nothing in
`content/changelog/` and nothing in `src/config/app-version.ts`.
Pending fragments stay retired. Release writes the public entry
from the as-builts.

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
- **Required update:** None.

## Implementation blueprint

### Owned surfaces

- `docs/workflows/origin-ci-migration.md` — this plan (current PR).
- Origin-hosted repository + remotes — OW-1.
- `.depot/workflows/` — OW-2, OW-3.
- `AGENTS.md`, CONTRIBUTING, PR template — OW-4, then OW-13.
- `vercel.json` + Vercel project git settings — OW-5, OW-17.
- `neon.ts` — preview TTL/compute and the `staging` cheap-sleep arm
  (OW-5 / OW-17). Nothing applies until `neon config apply`.
- `.cursor/skills/start-session/SKILL.md` — done.
- `.cursor/skills/plan-session/SKILL.md` — done.
- `.cursor/skills/close-out/SKILL.md` — done.
- `.cursor/skills/ux-check/SKILL.md` — OW-9 only.
- `.cursor/skills/update-watch/SKILL.md` — done.
- `tools/delivery/poll_pr_gate.py`, `merge_clean_pr.py` — deleted.
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

- Local test suite on land: typecheck, lint, Fallow dead-code +
  dupes + health, focused tests.
- Full Depot workflow on a promote or release Origin PR.
  `verify` + `build` + `e2e`. Wait with `origin pr checks --watch`.
  Open that PR ready for review so Depot runs once
  (`origin pr create --status open`).
- Origin `development` push → short-lived Vercel Preview — usual look
  instead of laptop `pnpm dev`. Feature-branch Preview is manual.
- Fast-forward onto `development` (`git push origin HEAD:development`)
  — daily land. No land PR. Does not promote or release.
- GitHub dump of the app-facing files in `staging...development` at
  **80**, listed by `lifecycle count-app-facing --list`, plus a
  **manual** bot request. Promote only. Open that dump PR ready for
  review. Never merge the dump. Then merge the Origin PR onto
  `staging`. A dump well over **100** is blocked.
- `origin pr merge` (`staging` → `main`) — release and Production
  auto-deploy.
- Feedback: today `POST /repos/StorminRH/lgi-tools/issues`. After
  OW-15: the chosen tracker’s create API (Linear:
  `issueCreate` at `https://api.linear.app/graphql`).
- This plan adds or changes no production export.

### Control and data flow

Target daily path after OW-5:

1. Agent works against `https://origin.cursor.com/{owner}/{repo}.git`.
2. Local test suite: typecheck, lint, Fallow dead-code + dupes +
   health, focused tests.
3. Land on **`development`** (fast-forward, then delete the source
   branch). Vercel updates the short-lived `development` Preview
   (Neon + ephemeral Convex). Use that URL instead of laptop
   `pnpm dev` unless you choose otherwise. A feature-branch Preview
   is manual when you want one.
4. Repeat Ordered work. After each land run
   `python3 tools/cli.py lifecycle count-app-facing`. At **80**,
   `close-out` promotes: dump the app-facing files to GitHub, request
   Greptile and CodeRabbit, fix on Origin, wait for Depot on the
   Origin PR, merge onto `staging`. Write as-builts on that PR. A dump
   well over **100** is blocked.
5. Repeat promotes until `staging` holds the next release.

When you ask for a release:

6. Write the public changelog from the as-builts, set `APP_VERSION`
   to the latest lifecycle identity already on `staging`, merge
   Origin `staging` → Origin `main`. Vercel auto-deploys Production.
   Bots already saw this work at promote.

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
  deploy. Disconnect GitHub only after Origin Preview proof. Keep
  `main: true`.
- Every-branch previews too expensive (Convex does not sleep) → only
  `development` (short) and `staging` (long) auto-Preview; feature
  branches stay manual.
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

4. **Done.** Land uses the local test suite. Promote and release
   wait on that Origin PR's Depot pipeline. `pnpm verify` is not
   done.

5. **Vercel-on-Origin preview process.** Connect the `lgi-tools` Vercel
   project to Origin (`origin.cursor.com/stormin/lgi-tools`) if it is
   still on GitHub. Prove one **manual** Preview from an Origin
   branch (the usual “instead of `pnpm dev`” path). Write down
   dashboard facts: Convex key type per environment, Neon branch
   names, Hobby vs Pro, connected git remote. Put a **preview**
   `CONVEX_DEPLOY_KEY` on Vercel Preview only. Keep
   `deploymentEnabled.main: true`. Enable `development` (short-lived
   Preview) and `staging` (long-lived Preview); leave other branches
   off auto-deploy. Disconnect Vercel’s GitHub git integration once
   an Origin Preview is real. Document teardown for short-lived
   Previews: delete Neon `preview/<branch>` and the Convex preview
   deployment after the look is done. Do not migrate feedback. Prove:
   an Origin branch can produce a Preview URL; `main` still
   auto-deploys Production; `development` and `staging` are the two
   standing Preview lines.

6. **Done.** `start-session` lands each Ordered work step on
   `development`.

7. **Done.** `plan-session` sizes thin Ordered work steps that land
   on `development`.

8. **Done.** `close-out` is one process onto `staging` or `main`.

9. **Isolated visit: `ux-check`.** Change only the ux-check skill and
   `docs/ux-check/README.md` so automated evidence is “Depot `e2e` was
   green,” visual review uses the Vercel Preview URL (laptop optional),
   and agents still must not visually approve.

10. **Done.** `update-watch` is report-only. Absorption is later
    ordinary work when the operator asks. Issue create may stay
    GitHub until OW-14.

11. **Done.** `plan-version` and `adversarial-review` match
    the settled loop. There is no `triage-issue` skill.

12. **Done.** `poll_pr_gate.py` and `merge_clean_pr.py` are gone.
    Merge with `origin pr merge`. Pending-changelog fold and check
    are gone.

13. **Standing schemas after skills settle.** Change the session
    contract, plan, as-built, and changelog schemas so they match
    the settled loop (land on `development`, as-builts on the promote
    PR, changelog at release). Depot is the promote/release gate.
    Preview is the usual look. `*.db.test.ts` is a Depot `verify`
    requirement. Prove `check-doc-refs` clean on touched files.

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

17. **Standing `staging` backends.** In `neon.ts`, add a
    named `staging` arm: no `ttl`, cheap CU (0.25–1), short
    `suspendTimeout` (1m or 5m). Create the Neon branch as `staging`
    (not `preview/staging`). `neon config apply` with `updateExisting`
    (today’s `if (branch.exists) return {}` would skip it). Create
    one Convex `npx convex deployment create staging --type prod`.
    Register EVE SSO on that stable URL only if signed-in Atlas is
    in scope. Production path is merge to `main` (auto-deploy). Prove:
    `staging` Preview stays up on the cheap pair; `development`
    Preview backends are short-lived; Origin `main` auto-deploys
    Production.

18. **Local / Cloud Agent parity (Cursor defaults).** Last step, only
    after OW-1–17 are working. Walk laptop Cursor and a Cloud Agent
    through the same loop: Origin remote, `depot ci run --job
    verify`, Preview URL (laptop `pnpm dev` optional), land on
    `development`. Change `.cursor/environment.json`, `install.sh`,
    `start.sh`, and `AGENTS.md` so they describe **one** workflow
    using Cursor’s environment schema
    (`https://cursor.com/docs/cloud-agent/setup`). Audit
    `.gitignore`: track every skill, agent, and doc both sides need;
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
are truly one-machine scratch. Do not ignore a skill or agent because
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

### Target close-out shape

Live owner: `.cursor/skills/close-out/SKILL.md`. One process. Land is
`start-session`, not close-out.

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

### Scripts

| Keep | Gone |
| --- | --- |
| `delivery scrub-pr-body` | `delivery poll-pr-gate` |
| `delivery repair-gh-auth` | `delivery merge-clean-pr` |
| `delivery github-api` | `lifecycle fold-pending-changelog` |
| `delivery wait-prod-deploy` on the release merge SHA | `lifecycle check-pending-changelog` |
| `GITHUB_FEEDBACK_TOKEN` until OW-15 | `pnpm verify` as definition of done |

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
  | `SC-4.1` | Read AGENTS.md, close-out DoD, CONTRIBUTING | Land uses the local test suite. Promote and release wait on that Origin PR's Depot pipeline |

- **SC-5 — Preview-as-dev on Origin; GitHub is not the deploy remote.**

  | Proof | Evidence action | Required observable |
  | --- | --- | --- |
  | `SC-5.1` | Origin branch (manual Preview) | Vercel Preview URL exists from Origin, not GitHub |
  | `SC-5.2` | Vercel project git settings + `vercel.json` | Connected repo is Origin; `main: true`; `development` and `staging` Preview on; GitHub git disconnected |
  | `SC-5.3` | After a short-lived look | Manual/feature Neon `preview/<branch>` gone; that Convex preview deleted (not merely expired) |

- **SC-6 — Each named skill was visited in isolation.**

  | Proof | Evidence action | Required observable |
  | --- | --- | --- |
  | `SC-6.1` | Git history for OW-6 through OW-11 | Separate chat/PR per skill |
  | `SC-6.2` | Read close-out | Land is `start-session` onto `development`; promote at 80 app-facing files → `staging`; release is `staging` → `main` and auto-deploys Production |

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

- **SC-9 — `staging` → `main` is the release and Production auto-deploy.**

  | Proof | Evidence action | Required observable |
  | --- | --- | --- |
  | `SC-9.1` | `neon.ts` + apply after OW-17 | `staging` has no TTL, cheap CU, short suspend; name is not `preview/` |
  | `SC-9.2` | Convex dashboard | One prod-type extra named `staging`; Preview env uses a preview key; `development` Preview backends are short-lived |
  | `SC-9.3` | Close-out + schemas after OW-8 / OW-13 | `APP_VERSION` and `### vX.Y.N` change only on cut release; as-builts land on the promote PR |
  | `SC-9.4` | Close-out + one dry-run | Promote starts at 80 app-facing files; a dump well over 100 is blocked; merge to `main` is the documented prod action |

- **SC-10 — This plan PR stayed documentation-only.**

  | Proof | Evidence action | Required observable |
  | --- | --- | --- |
  | `SC-10.1` | Diff vs `main` for this publish | Skills, workflows, `vercel.json`, and delivery scripts unchanged |

- **SC-11 — Laptop and Cloud Agent share one Cursor-native workflow.**

  | Proof | Evidence action | Required observable |
  | --- | --- | --- |
  | `SC-11.1` | Compare laptop clone and Cloud Agent tree | Same tracked skills, agents, and docs; required files are not gitignored |
  | `SC-11.2` | Cloud Agent dry-run of land-on-`development` | Origin remote + `depot ci run --job verify` + same close-out steps as laptop |
  | `SC-11.3` | Read `AGENTS.md` + `environment.json` | One workflow; remaining Cloud notes are platform facts only |

## End of session

- Confirm every `DONE =` item is evidenced and every `hard_constraints`
  boundary held — for **this** PR, only SC-10 applies. SC-1–SC-9 and
  SC-11 are later chats.
- **Delivery:** Land remaining ordinary-work steps on `development`.
- **Lifecycle artifacts:** none for this ordinary-work plan. No version
  bump, no pending fragment, no roadmap row.
- **Handoff:** Next ordinary-work chat is OW-9 (`ux-check`), then
  schemas (OW-13). Do not invoke `start-session` unless a numbered
  session should absorb a remaining step.
