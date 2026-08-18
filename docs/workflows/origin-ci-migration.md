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
and Depot land first so later skill visits happen on the stack you will
keep.

## Bottom line (READ FIRST)

- **GOAL:** Daily work, review, and merge live on Cursor Origin. Depot
  CI is the only gate and runs real Postgres. Merge does not deploy
  production. One durable `beta` preview is where unreleased work is
  exercised. Lifecycle skills are rewritten one at a time against that
  model.
- **DONE =** SC-1 through SC-8 below, plus: an Origin-hosted repo with
  Depot Checks on PRs, agent DoD is `depot ci run --job verify`,
  production is promote-only, and each named skill has been visited in
  isolation.
- **OUT OF SCOPE:**
  - Implementing any Ordered work step in the same PR as this plan.
  - Deleting every canned-row `*.test.ts` (only the “CI substitute for
    SQL” role goes away).
  - Moving Issues off GitHub.
  - Connecting Vercel directly to Origin (optional later; GitHub may
    remain the deploy remote for `beta` / promote).
  - Buildkite native pipelines, Depot Mac runners, Depot Agent
    sandboxes.
  - Per-PR ephemeral previews (already off; stay off).
  - Rewriting completed 4.0 as-builts or the Greptile devlog.

<hard_constraints>

- **Plan:** After cutover, Origin is source of truth. GitHub is a
  disposable dump of the same SHA. Never merge the dump PR. Never accept
  bot-apply commits. Never push Origin `main` to GitHub `main` on every
  merge.
- **Plan:** Do not rehearse CI on GitHub Actions and migrate later.
  Create or detach an Origin-hosted repo, then prove Depot there. Depot
  and Origin Apps do not run on an inbound GitHub mirror.
- **Plan:** Depot CI `jobs.<id>.services` is the Postgres sidecar.
  Do not use Depot Container Builds / `depot bake` / Compose image
  builds as the test database. Actions-shaped YAML is syntax Depot
  consumes; it is not “CI on GitHub.”
- **Plan:** Installing Depot or Vercel on the Origin codebase Apps page
  is not “CI works.” Need: Origin-hosted repo (not inbound mirror), app
  attached to that repo, a workflow that actually fires.
- **Plan:** After Depot adoption, definition of done is
  `depot ci run --job verify`. Retire `pnpm verify` from AGENTS.md,
  close-out, CONTRIBUTING, and the PR template. Do not fall back to a
  laptop verify that skips `*.db.test.ts`.
- **Plan:** Laptops and agents never run `next build`, `next build`,
  `pnpm vercel-build`, or Playwright as the local gate. Job `build` and
  job `e2e` are PR-only on Depot.
- **Plan:** Do not run `build:vercel` in the CI build job. Migrate /
  ingest / warm-neon stay deploy-time on the environment that is
  actually going live.
- **Plan:** Merge is not deploy. Do not wait for Production on every
  close-out. Do not flip `vercel.json` until close-out no longer waits
  for a production deploy. Keep the deny globs (`**`, `*`, `*/*`);
  unspecified branches default to deploy.
- **Plan:** Durable beta must not use Neon’s `preview/` prefix (3-day
  TTL). Convex beta is a prod-type extra deployment, not an expiring
  preview-type. Do not put a Production `CONVEX_DEPLOY_KEY` on Preview.
  Do not store `NEXT_PUBLIC_CONVEX_URL` / `CONVEX_DEPLOYMENT` on Vercel
  Preview. Beta Convex `SITE_URL` / issuer must be the beta origin, not
  `lgi.tools`.
- **Plan:** Greptile and CodeRabbit are optional dump review only. They
  are not the merge gate. Origin Checks + Origin review are.
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
  `ux-check` shrinks to operator visual + diagnosis.
- **Plan:** Do not point `delete-neon-branch` at durable `beta`. Do not
  claim signed-in Atlas on beta without a pre-registered EVE SSO
  callback.
- **Plan:** This Cloud Agent workspace cannot see Origin or Depot
  (GitHub remote, Origin CLI not logged in, no Depot CLI). Operator
  login and first Origin/Depot proof happen on a machine they control.

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
- `vercel.json` — live auto-prod on `main`
- `.cursor/skills/close-out/SKILL.md` — live Greptile 5/5 + wait-prod
- `.cursor/skills/start-session/SKILL.md` — first isolated skill visit
- `src/db/neon.ts` — `preview/*` 3-day TTL
- `playwright.config.ts` — always `pnpm dev` + `reuseExistingServer`

## Current state and prerequisites

| Input | Live verdict | Evidence | Execution consequence |
| --- | --- | --- | --- |
| Origin vs GitHub | GitHub is still SoT | Workspace remote is `github.com/storminrh/lgi-tools`. Origin CLI exists but is not logged in here. Operator has installed Depot and Vercel apps on the Origin **codebase**, not proven on an Origin-hosted repo | OW-1 creates or detaches before any CI work |
| Inbound mirror | Blocking for Depot | Official Origin docs: inbound “Sync from GitHub” keeps GitHub as SoT; Depot/Buildkite/Origin Apps do not run on inbound mirrors | Do not treat Apps-page install as CI |
| Depot CLI | Not present here | No `depot` on this VM or the operator laptop at last check | OW-2 installs CLI where the operator works; `depot ci run` uploads the tree to Depot cloud |
| Live DoD | `pnpm verify` | AGENTS.md, close-out, CONTRIBUTING | OW-4 flips docs after `verify` is honest on Depot |
| Live CI | GHA, no real SQL | `.github/workflows/test.yml` skips `*.db.test.ts`; no `next build`; no Playwright | OW-2/OW-3 replace this on Origin, not by extending GHA |
| Live deploy | Merge = prod | `deploymentEnabled.main: true`; close-out `wait-prod-deploy` | OW-7 rewrites close-out before OW-14 flips `vercel.json` |
| Preview/prod gaps | Known, not audited on the dashboard | Convex `deploy` has no `--preview-create`; placeholder AUTH; `SITE_URL` prod-shaped; no `neon config apply` in CI; crons Production-only; shared Upstash; no Convex teardown | OW-13 writes dashboard facts; OW-14 applies them |
| Depot Developer plan | Purchased intent | $20/mo, 1 user. Included: Depot CI minutes (2,000 on 2-CPU; 4-CPU burns 2×), usage caps, test results. Unused: Docker build minutes, GHA **runner** minutes, macOS M2, Registry. Agent sandboxes are extra-billed and are not Cursor Cloud Agents | Buy Depot CI. Do not buy Mac runners or Agent sandboxes for this repo |
| This plan PR | In progress | This file on `stormin/origin-ci-migration-4df8` | This chat only publishes the plan |

## Why now

You want Origin as the daily remote, honest CI (real Postgres, production
render, a browser), and the ability to merge unfinished work without
shipping `lgi.tools`. The current close-out loop is GitHub-bot and
auto-prod shaped. You also want to rebuild the lifecycle process skill
by skill. Origin and Depot have to exist first so those skill visits
are practiced on the stack you will keep, not rehearsed on GitHub
Actions.

## Scope (the destination)

When the last Ordered work step is done, clone/push/PR/merge happen on
an Origin-hosted Private repo. Depot reports Checks on those PRs.
`verify` includes Dockerized Postgres and `*.db.test.ts`. PRs also run
`next build` + `assert:routes` and Playwright against `next start`.
Agents prove work with `depot ci run --job verify` and `origin pr
checks --watch`. Production changes only when you promote. Unreleased
work is exercised on one durable `beta` URL. Each lifecycle skill has
been opened in isolation and rewritten to match that model. GitHub may
still hold an optional dump for Greptile/CodeRabbit; that dump is never
merged.

### Scope coverage

| Boundary | Mapping or protection |
| --- | --- |
| Origin SoT | OW-1; hard constraint on dump merge and `main` push |
| Depot-first CI | OW-2, OW-3; `services:` not bake; no GHA rehearsal |
| Agent DoD | OW-4 |
| Lifecycle rewrite | OW-5 through OW-10; one skill (or named pair) per chat |
| Scripts | OW-11; poll+merge deleted as a pair after replacement exists |
| Standing docs | OW-12 after skills settle |
| Manual prod + beta | OW-13 audit, then OW-14 flip |
| Optional GitHub dump | After Origin exists; never the merge remote |
| This plan only | Current PR. Diff must not flip skills, CI, or `vercel.json` |

## Resolved implementation decisions

- **Origin path: native create or detach, then prove Depot there.**
  Inbound mirror keeps GitHub as SoT and blocks Origin Apps. **Rejected:**
  rehearse YAML on GitHub Actions and migrate later (overruled leftover;
  treat any older sentence that allowed it as void).
- **Depot product: CI sandboxes with `jobs.<id>.services` Postgres.**
  Official compatibility lists `services` as supported.
  **Rejected:** Container Builds / `depot bake` as the test DB; `docker
  compose up` inside the sandbox as an undocumented dependency.
- **Workflow language looks like Actions YAML because that is what
  Depot consumes.** That is not running CI on GitHub. The pricing line
  “GitHub Actions builds” is Depot-as-GHA-runner — you are not buying
  that.
- **Job split:** `verify` = typecheck, lint, `assert:routes-present`,
  `test:coverage` **with** `*.db.test.ts`, Fallow, Postgres sidecar.
  `build` = `pnpm build` + `assert:routes` (not `build:vercel`).
  `e2e` = Playwright vs `next start`, tiny `e2e/*.spec.ts`,
  `pnpm e2e:seed`. Agent/laptop runs `--job verify` only. PR runs the
  full workflow.
- **“No more mock tests”:** stop treating canned-row Vitest as the CI
  stand-in for SQL. Pure-function `*.test.ts` stays. Real SQL lives in
  `*.db.test.ts` on Depot.
- **Merge ≠ deploy.** Target `deploymentEnabled`: `main: false`,
  `beta: true`, keep deny globs. Production via `vercel promote`
  (preview promote rebuilds with Production env — intended). If Vercel
  still watches GitHub, push **`beta`**, never GitHub `main` on every
  merge.
- **One long-running `beta`.** Not per-PR previews. Neon durable name
  (`beta` / `staging`), not `preview/`. Convex
  `npx convex deployment create beta --type prod`.
- **Review:** Cursor-native on Origin. Greptile/CodeRabbit optional on
  a GitHub dump of the same SHA. Import findings; fix on Origin.
- **Lifecycle: isolated skill visits, not one giant rewrite.** You are
  unhappy with the current structure (start-session, what happens, the
  general flow, planned session, close-out, and the rest). Each visit
  is its own chat so you can fine-tune. Origin/Depot first so those
  visits can use the new remotes and Checks.
- **Developer plan utilization:** buy Depot CI minutes and result
  reporting. Do not use unused bundle items (Mac runners, Registry,
  GHA runner minutes, extra-billed Agent sandboxes) unless you later
  ask.
- **Cloud Agent / Origin CLI:** `origin auth login` is a browser flow
  on a machine you control. Headless: `origin auth login --api-key` /
  dashboard API key. Do not paste keys in chat. CLI login does not
  list Depot/Vercel Apps (web-only).

### Audit-remediation mapping

Not applicable — this is not an audit-remediation contract.

## Design pressure and baseline effect

### Hotspot proximity

- **Touched measured surfaces:** None in this plan PR (docs only).
- **Live proximity evidence:** Later OWs will touch skills, workflows,
  `vercel.json`, `playwright.config.ts`, and contributing docs. Stay
  outside mapper / Convex engine unless a later visit names them.

### Preparatory refactor

None for this plan PR. OW-2 may extract workflow YAML from
`.github/workflows/test.yml` into `.depot/workflows/` without changing
product behavior.

### Baseline effect and update

- **Effect:** Neutral — this plan adds no production export and no
  Fallow pressure.
- **Required update:** None for the plan PR. Later CI/skill PRs refresh
  baseline only if a measured file changes.

## Implementation blueprint

### Owned surfaces

- `docs/workflows/origin-ci-migration.md` — this plan (current PR).
- Origin-hosted repository + remotes — OW-1.
- `.depot/workflows/` (or Origin-attached Depot workflow) — OW-2, OW-3.
- `AGENTS.md`, CONTRIBUTING, PR template — OW-4, then OW-12.
- `.cursor/skills/start-session/SKILL.md` — OW-5 only.
- `.cursor/skills/plan-session/SKILL.md` — OW-6 only.
- `.cursor/skills/close-out/SKILL.md` — OW-7 only.
- `.cursor/skills/ux-check/SKILL.md` — OW-8 only.
- `.cursor/skills/resolve-update-watch/SKILL.md` and
  `update-watch/SKILL.md` — OW-9 only.
- Remaining lifecycle skills listed in OW-10 — one file per chat.
- `tools/delivery/poll_pr_gate.py`, `merge_clean_pr.py` — OW-11 retire.
- `docs/workflows/schema/*`, `docs/VERSION_4_0_PLAN.md` standing
  language — OW-12.
- Vercel dashboard + `vercel.json` + Neon/Convex beta — OW-13, OW-14.
- `playwright.config.ts` — OW-3 (`CI` vs local split).

### Interfaces and contracts

- `depot ci run --workflow <file> --job verify` — agent/laptop gate.
  Uploads the working tree (including an uncommitted patch) to Depot.
  Returns the `verify` job result. Does not compile Next or run
  Playwright.
- Full Depot workflow on an Origin PR — `verify` + `build` + `e2e`.
  Fail-closed. Wait with `origin pr checks --watch`.
- `origin pr merge` (or the replacement named in OW-7) — merge actor
  after Checks + Origin review. Does not promote.
- `vercel promote <deployment-id-or-url>` — only production path.
- This plan adds or changes no production export.

### Control and data flow

Target daily path after OW-4:

1. Agent works against `https://origin.cursor.com/{owner}/{repo}.git`.
2. Local gate: `depot ci run --job verify` (Depot VM, Docker Postgres,
   real `*.db.test.ts`).
3. Open an Origin PR. Depot runs the full pipeline.
4. Cursor-native review on Origin. Optional GitHub dump; import
   findings; never merge GitHub.
5. Merge on Origin. **Nothing deploys to production.**
6. When you want the long-lived preview updated, push or fast-forward
   `beta` (pick the exact rule in OW-7 and write it into close-out).
7. Production is an explicit promote of a chosen deployment.

### Edge and failure behavior

- Origin still inbound-mirrored → Depot/Apps silent → stop; detach or
  create native (OW-1). Do not “fix” it by adding GitHub Actions.
- `verify` with Postgres too slow in the agent loop → shrink the SDE
  fixture, not the job.
- Vercel still watches GitHub → Origin merge does not deploy anything
  until that SHA is on the connected remote. Push `beta` only.
- Wrong Convex key on Preview → can push **production** Convex. OW-13
  must read the dashboard before OW-14.
- Hobby vs Pro → Custom Environments may be unavailable; still one
  git branch `beta` + Preview domain.
- EVE SSO → random `*.vercel.app` cannot sign in. Beta stays
  anonymous-only until a stable callback is registered.

### Ordered work

Each numbered step is one later ordinary-work chat. Do not list
close-out, adversarial review, push, or PR opening as Ordered work.
Do not implement a later step in an earlier chat.

1. **Origin-hosted repository.** Change remotes and the Origin
   codebase so the repo is Origin-hosted (native create or detach),
   Private, and clone/push/PR work on `origin.cursor.com`. Prove with
   one Origin PR that is not a GitHub sync. Do not add CI YAML in this
   chat.

2. **Depot `verify` on that Origin repo.** Attach Depot to the
   Origin-hosted repo (Apps install alone is not enough). Change
   `.depot/workflows/` so job `verify` runs typecheck, lint,
   `assert:routes-present`, coverage **with** `*.db.test.ts`, and
   Fallow, with Postgres via `services:` (not bake). Prove with an
   Origin PR that shows Depot Checks and green real-SQL suites. Iterate
   the YAML in place.

3. **PR jobs `build` and `e2e`.** Change the Depot workflow and
   `playwright.config.ts` so PRs run `pnpm build` + `assert:routes`
   and Playwright against `next start` (CI split; seed; no cookie
   jars; no `build:vercel`). Prove with a PR whose Checks include both
   jobs.

4. **Agent definition of done.** Change `AGENTS.md`, close-out’s DoD
   line, CONTRIBUTING, and the PR template so agents run
   `depot ci run --job verify` and wait with `origin pr checks
   --watch`. Remove `pnpm verify` as the standing gate (keep or delete
   the npm script in the same chat). Prove by reading those files: no
   leftover “laptop verify skips DB suites.”

5. **Isolated visit: `start-session`.** Change only
   `.cursor/skills/start-session/SKILL.md` (and files it exclusively
   owns) so resolver, dispatch, “what happens,” and the general start
   flow match Origin remotes, Depot Checks, and merge ≠ deploy. Prove
   by walking the rewritten flow on paper against OW-1–4. Do not edit
   other skills.

6. **Isolated visit: planned-session flow.** Change only
   `plan-session` (and the planned-session execution path it names) so
   a planned session is something you still want: contract → plan →
   ordered work chats → handoff. Prove by comparing one existing
   session plan’s OW shape to the rewritten skill. Do not edit
   close-out or start-session in this chat unless a single pointer
   must retarget.

7. **Isolated visit: `close-out`.** Change only
   `.cursor/skills/close-out/SKILL.md` so review is Origin-native,
   the gate is Depot full pipeline, merge is `origin pr merge` (or the
   command this visit names), dump bots are import-only, and every
   merge stops without promote. Write the `beta` update rule here.
   Prove by a dry-run of §§5–7 against a fictional green Origin PR.
   Do not flip `vercel.json` in this chat.

8. **Isolated visit: `ux-check`.** Change only the ux-check skill and
   `docs/ux-check/README.md` so automated evidence is “Depot `e2e` was
   green on this SHA,” the skill keeps operator visual + diagnosis,
   beta is a valid `--base-url`, and agents still must not visually
   approve. Prove by reading the skill: no required local full-route
   sweep when PR `e2e` exists.

9. **Isolated visit: update-watch pair.** Change only
   `resolve-update-watch` and `update-watch` so step 10 (and peers)
   use skill-driven Origin review, no `poll-pr-gate`, and still must
   not merge or promote. Prove by a dry-run of that step.

10. **Isolated visits: remaining lifecycle skills.** One chat per
    skill, in the order you choose: `plan-version`,
    `plan-version-audit`, `plan-audit-remediation`, `version-audit`,
    `triage-issue`, `adversarial-review`. Each chat edits that skill
    only, against Origin + Depot + merge ≠ deploy. Stop when you are
    happy with that skill before opening the next.

11. **Delivery scripts.** After OW-7 names the replacement merge
    command, delete `poll_pr_gate.py` and `merge_clean_pr.py` as a
    pair (CLI keys, tests, bot predicates). Keep `github_api.py`,
    `scrub_pr_body.py`, `repair_gh_auth.py`. Retire
    `wait-prod-deploy` as “every merge” once promote-based proof
    exists (may land with OW-14). Prove: no caller remains, vendor
    `github-tooling` still wraps `github_api.request`.

12. **Standing docs after skills settle.** Change
    `docs/workflows/schema/session-plan.md`, `session-contract.md`,
    `session-as-built.md`, `docs/VERSION_4_0_PLAN.md` standing
    language (not completed rows), `docs/contributing/testing-principles.md`,
    `docs/contributing/end-to-end-testing.md`, and README so
    “shipped” means merged to Origin, production is a promote flag,
    Depot is the gate, and `*.db.test.ts` is a `verify` requirement.
    Prove with `check-doc-refs` clean on touched files.

13. **Preview / production dashboard audit.** Write down, in the
    implementing PR: Vercel `CONVEX_DEPLOY_KEY` type per environment;
    whether any `preview/*` Neon branch exists; whether `neon config
    apply` has been run; Hobby vs Pro; whether Vercel watches GitHub
    or Origin. Fix only proven misconfig. Do not enable `beta`
    deploys in this chat.

14. **Manual production + durable `beta`.** Change `vercel.json` to
    `main: false`, `beta: true`, deny globs unchanged. Create durable
    Neon (`beta` / `staging`, not `preview/`) and a prod-type Convex
    extra deployment; point Preview env at those; set beta
    `SITE_URL` / issuer to the beta origin; assign the stable Preview
    URL. Document promote as the only production path. Prove: a push
    to Origin `main` does not start Production; a `beta` update
    starts Preview; `vercel promote` is the documented prod action.

Optional later, not numbered here: wire a GitHub dump for
Greptile/CodeRabbit at the exact SHA; never merge it.

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

### Target close-out shape (written in OW-7, not this PR)

```markdown
## 5. The PR and review loop

1. Reuse Depot `verify` evidence when the head is unchanged.
2. Open one draft Origin PR. Scrub the body.
3. Wait: `origin pr checks --watch` (full pipeline).
4. Origin Automation / `origin pr review`.
5. Optional GitHub dump at the exact SHA. Import bot findings. Fix on
   Origin. Never merge GitHub. Never push GitHub `main`.

## 6. Merge

1. Depot full pipeline green. Origin review satisfied. Dump findings
   fixed or operator-deferred.
2. `origin pr merge`.
3. If you asked for beta: update `beta` so the long-lived preview
   rebuilds.
4. Stop. Do not promote. Do not wait for Production.

## 7. Promote (only when you asked to ship production)

1. `vercel promote <beta-or-sha>`.
2. Fail-closed wait for that Production deployment.
3. `pnpm verify:prod` (and account routes with cookie jar when needed).
```

### Scripts to retire (OW-11)

| Keep until | Retire |
| --- | --- |
| `delivery scrub-pr-body` | `delivery poll-pr-gate` (OW-11) |
| `delivery repair-gh-auth` | `delivery merge-clean-pr` (OW-11) |
| `delivery github-api` | Bot predicates + their tests (OW-11) |
| `wait-prod-deploy` until promote waiter exists | `wait-prod-deploy` as “every merge” (OW-7 / OW-14) |
| `pnpm verify` until OW-4 | `pnpm verify` as definition of done (OW-4) |

`poll_pr_gate.review_state` calls `merge_clean_pr.merge_blockers`.
Name the replacement merge command in OW-7 first.

## Success criteria (agent-runnable — show the output)

- **SC-1 — Origin is the hosted SoT.** Clone, push, and PR succeed on
  Origin without passing through GitHub.

  | Proof | Evidence action | Required observable |
  | --- | --- | --- |
  | `SC-1.1` | Inspect remotes and `origin repo` / web codebase | Remote is `origin.cursor.com`; repo is not an inbound GitHub mirror |
  | `SC-1.2` | Open one Origin PR | PR exists on Origin only (no required GitHub twin) |

- **SC-2 — Depot `verify` is honest.** Real DB suites run on Depot
  with a Postgres service.

  | Proof | Evidence action | Required observable |
  | --- | --- | --- |
  | `SC-2.1` | Origin PR Checks for `verify` | Job used `services:` Postgres; `*.db.test.ts` ran; Fallow saw one coverage file |
  | `SC-2.2` | Inspect workflow YAML | No Container Builds / bake used as the test DB; no GHA-only rehearsal path |

- **SC-3 — PR pipeline includes production render and a browser.**

  | Proof | Evidence action | Required observable |
  | --- | --- | --- |
  | `SC-3.1` | Origin PR Checks | `build` ran `pnpm build` + `assert:routes`, not `build:vercel` |
  | `SC-3.2` | Origin PR Checks + `playwright.config.ts` | `e2e` ran against `next start` when `CI` is set |

- **SC-4 — Agent DoD is Depot `verify`.**

  | Proof | Evidence action | Required observable |
  | --- | --- | --- |
  | `SC-4.1` | Read AGENTS.md, close-out DoD, CONTRIBUTING, PR template | Standing gate is `depot ci run --job verify`; `pnpm verify` is not the definition of done |

- **SC-5 — Each named skill was visited in isolation.**

  | Proof | Evidence action | Required observable |
  | --- | --- | --- |
  | `SC-5.1` | Git history / PRs for OW-5 through OW-10 | Each skill’s rewrite is a separate chat/PR; no multi-skill dump |
  | `SC-5.2` | Read close-out after OW-7 | Merge does not wait for Production; dump bots are not the gate |

- **SC-6 — Bot helpers retired as a pair after a replacement exists.**

  | Proof | Evidence action | Required observable |
  | --- | --- | --- |
  | `SC-6.1` | `rg poll_pr_gate\\|merge_clean_pr` | No callers; both files gone |
  | `SC-6.2` | Read close-out | Named replacement merge command is the only merge actor |

- **SC-7 — Merge does not deploy production; `beta` is the long-lived preview.**

  | Proof | Evidence action | Required observable |
  | --- | --- | --- |
  | `SC-7.1` | Read `vercel.json` after OW-14 | `main: false`, `beta: true`, deny globs present |
  | `SC-7.2` | Dashboard / Neon / Convex after OW-13–14 | Durable Neon name is not `preview/`; Convex beta is prod-type; Preview key ≠ Production key; beta `SITE_URL` is the beta origin |

- **SC-8 — This plan PR stayed documentation-only.**

  | Proof | Evidence action | Required observable |
  | --- | --- | --- |
  | `SC-8.1` | Diff of `stormin/origin-ci-migration-4df8` vs `main` for this publish | Skills, workflows, `vercel.json`, and delivery scripts unchanged |

## End of session

- Confirm every `DONE =` item is evidenced and every `hard_constraints`
  boundary held — for **this** PR, only SC-8 applies. SC-1–SC-7 are
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
