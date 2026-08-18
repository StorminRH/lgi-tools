# Origin-native ship path, Depot-first CI, and manual deploys

Status: **draft, not in force.** Live close-out, `pnpm verify`, GitHub Actions,
and `vercel.json` stay as they are until a later PR applies a named phase.
This file is the inventory of documentation that must change, the CI/deploy
design, and the target skill language.

Decisions locked from the operator conversations that commissioned this draft:

- Origin becomes source of truth (Private repo, or detach a GitHub mirror).
  Daily work and merge happen on Origin. GitHub is a disposable review dump.
- Greptile and CodeRabbit stay on that dump only. Agents import findings onto
  the Origin PR. They are not the merge gate.
- Retire `poll-pr-gate` and `merge-clean-pr`. Review and merge live in skills
  and Cursor-native tools (`origin pr`, Automations), not Python helpers that
  scrape GitHub bots.
- **Depot-first CI.** Docker in the pipeline so CI runs **real Postgres**
  suites (`*.db.test.ts`), not canned-row stand-ins. Production `next build`
  + `assert:routes` and Playwright also run on Depot VMs.
- Once Depot is adopted, **retire `pnpm verify` as the definition of done.**
  Agents run `depot ci run` (lighter job set). The PR re-runs the full
  pipeline. A laptop never runs `next build` or Playwright.
- **Merge is not deploy.** Production deploys are manual only (`vercel
  promote` or equivalent). You can merge unfinished pieces on Origin without
  Vercel building production.
- **One long-running preview** (a durable `beta` git branch + stable URL)
  is where unreleased work is exercised. It is not an ephemeral per-PR
  preview and not production.
- **Lifecycle / session docs get their own pass (L1).** Merge ≠ deploy, Depot
  as the gate, and the beta environment change standing rules in schemas,
  skills, and future contracts. Completed 4.0 as-builts stay as written.

“No more mock tests” means: stop treating canned-row Vitest as the CI
substitute for SQL. Pure-function `*.test.ts` stays. Real SQL lives in
`*.db.test.ts` and those run in Depot with a Postgres service.

## 1. Target operating model

1. Agent works against `https://origin.cursor.com/{owner}/{repo}.git`.
2. Before the PR (or as the local gate): `depot ci run --workflow
   .depot/workflows/test.yml --job verify`. That job includes Dockerized
   Postgres and the real DB suites. It omits `build` and `e2e` so the agent
   loop stays short. Compute is Depot’s, not the laptop.
3. Agent opens an Origin PR. Depot runs the **full** pipeline (`verify` +
   `build` + `e2e`). Agent waits with `origin pr checks --watch`.
4. Cursor-native review on the Origin PR. Optional GitHub dump for
   Greptile/CodeRabbit; import findings; fix on Origin; never merge GitHub.
5. Merge on Origin when checks and Origin review are green. **Nothing
   deploys to production.**
6. Unreleased / multi-PR features land on the durable `beta` branch (merge
   to `beta`, or merge to Origin `main` and fast-forward `beta` — pick one
   in L1 and write it into close-out). Vercel auto-deploys **only** `beta`
   as a Preview. Operator tests there.
7. Production is an explicit operator action: promote a chosen deployment
   (usually the current `beta` or a named SHA) to Production. Close-out
   production proof runs only on that promote, not on every merge.

Origin Private hides the clone. A GitHub dump of the same SHA is the same
tree, including `.gitignore` and tracked dotfiles. Ignored secrets never
leave the machine.

## 2. Depot-first CI

Today one GitHub Actions job runs typecheck, lint, route-**presence**,
coverage Vitest, and Fallow. It skips `*.db.test.ts`. It does not prove
production render mode. It does not run a browser. `assert:routes` waits
for Vercel. Playwright waits for `ux-check` on a laptop.

A pipeline here means several recipes on Depot VMs, each allowed to fail
the PR on its own.

`depot ci run` is **not** local Docker. The CLI uploads the working tree
(including an uncommitted patch) to Depot and runs the YAML there. That
is why it can replace `pnpm verify` without bogging down the machine, and
why Dockerized Postgres in the “local” gate is free for the laptop.

Official: https://depot.dev/docs/ci/how-to-guides/coding-agents ·
https://depot.dev/docs/ci/compatibility (`jobs.<id>.services` is supported).

### Job `verify` (local DoD + every PR)

```text
typecheck, lint, assert:routes-present,
test:coverage with *.db.test.ts enabled,
fallow
```

Postgres via GitHub Actions `services:` (Depot speaks that field):

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
and load whatever SDE the real DB suites need (clone-from-fixture, or the
same bootstrap the Cloud Agent snapshot already assumes). That spike is
phase C1.

Fallow still needs one Istanbul `coverage/coverage-final.json`. Do not
shard Vitest unless that file is still produced.

Do **not** use Depot’s container-build `docker compose` product for this.
The documented path is `services:`. Whether a job can `docker compose up`
inside the sandbox is undocumented; do not depend on it.

### Job `build` (PR only)

```text
pnpm install --frozen-lockfile
pnpm build
pnpm assert:routes
```

This is the check [the route-assertion rail already wanted](content/devlog/06-rails/00-route-assertions.md)
and that PR #148 only approximated with presence. Presence stays in
`verify`. `build` reads `.next` and fails on render-mode drift or
prerender-blocking errors.

Do **not** run `build:vercel` here. Migrate / ingest / warm-neon stay
deploy-time on the environment that is actually going live (`beta` or
Production). The spike: can `next build` finish with CI env plus the
Docker Postgres (and whatever SDE prerender touches)?

Cache `.next/cache`. `NEXT_PUBLIC_*` is inlined at this build.

### Job `e2e` (PR only)

Playwright against **`next start`**, not `pnpm dev`. Reuse the `build`
artifact or rebuild, seed with `pnpm e2e:seed` against the CI database,
run `pnpm test:e2e`.

Install `pnpm exec playwright install --with-deps --only-shell`. Pin the
Playwright version (repo is 1.61.x).

Split `playwright.config.ts` on `process.env.CI`: CI must not reuse a
dev server. Cookie jars stay local/remote-probe only. Upload failure
artifacts. No operator visual pause in this job.

### Local vs PR Depot runs

| | Agent / laptop gate | Origin PR |
| --- | --- | --- |
| Command | `depot ci run --job verify` | full workflow (no `--job`) |
| Docker Postgres + real `*.db.test.ts` | yes | yes |
| `next build` + `assert:routes` | no | yes |
| Playwright | no | yes |
| Where it runs | Depot VM | Depot VM |

That is the optimal split: Docker is cheap relative to a production compile
and a browser, and it is the whole point of retiring canned-row CI. If
`verify` with Postgres is still too slow in the agent loop, cut the SDE
fixture, not the job.

After O2, `pnpm verify` is removed from AGENTS.md, close-out, CONTRIBUTING,
and the PR template. Leave the npm script as a thin alias or delete it in
the same PR that flips the skills. Agents must not fall back to a
laptop-only verify that skips DB suites.

### After Origin detach

Depot attaches only to Origin-hosted repos. Replay the YAML from
`.github/workflows/` or `depot ci migrate` into `.depot/workflows/`.
Secrets do not copy — re-enter them on Depot. Origin Apps cannot see an
inbound GitHub mirror, so a GitHub Actions rehearsal can happen before
detach; Depot pickup is the flip.

Depot’s own docs assume GitHub remotes for `--repo` / checks. Origin
check reporting is the Cursor Origin app path, not those pages.

## 3. Merge is not deploy

Today `vercel.json` auto-deploys **Production** on every `main` push:

```json
"deploymentEnabled": { "main": true, "**": false, "*": false, "*/*": false }
```

That is why close-out waits on `wait-prod-deploy` after merge. It also
means merging a slice of an unfinished feature ships it.

Target:

```json
"deploymentEnabled": { "main": false, "beta": true, "**": false, "*": false, "*/*": false }
```

- Unspecified branches default to **deploy**. Keep the deny globs.
- Any matching `true` wins, so `"beta": true` still deploys when `"**"` is
  false.
- Production Branch stays `main`. Pushes to `beta` are **Preview**, not
  Production.
- Production: dashboard **Promote to Production**, or
  `vercel promote <deployment-id-or-url>`. Preview promote **rebuilds**
  with Production env vars (that is correct; do not ship Preview secrets
  to prod).

Ignored Build Step is the weaker lever (a deployment still starts). Use
`git.deploymentEnabled` to mean “no Vercel webhook.”

**Origin caveat:** Vercel’s official git docs are GitHub / GitLab /
Bitbucket. If Vercel still watches GitHub, an Origin merge does nothing
until that SHA is on the connected GitHub branch. The GitHub dump then
has two jobs: review bots, and (for `beta` only) the git remote Vercel
sees. Do not push Origin `main` to GitHub `main` on every merge, or you
recreate auto-prod as soon as someone flips `main` back to `true`. Push
`beta` when you want the long-lived preview updated.

Close-out after R1: merge Origin → stop. Promote and `verify:prod` are a
**separate operator-requested ship**, not part of every close-out.

## 4. Long-running preview (`beta`)

This repo already retired automatic per-PR previews. Manual Vercel
previews were the exception. Neon `preview/<git-branch>` is created by
the Vercel ↔ Neon integration when a Preview deployment **actually
starts**. `neon.ts` does not create branches. The delete workflow only
runs on GitHub PR close and is allowed to fail.

That is why Convex and Neon feel broken on “a preview”: most PRs never
get one, and the ones that do are anonymous-only.

### What is wrong today (investigation list for P1)

1. **Convex on preview.** `vercel-build` runs `convex deploy` with no
   `--preview-create`. Isolation depends on Vercel holding a **Preview**
   `CONVEX_DEPLOY_KEY`. A Production key on a preview build can push
   **production Convex**. Default Convex env uses placeholder
   `AUTH_ISSUER_URL` / `AUTH_JWKS`, so preview backends are
   anonymous-only by design. `SITE_URL` / `CONVEX_SERVICE_SECRET` are
   prod-shaped (`https://lgi.tools`), so preview Convex calling Next is
   wrong. Convex **preview-type** backends expire (5 or 14 days).
2. **Neon on preview.** No Vercel preview → no `preview/<branch>` DB.
   `neon.ts` gives new `preview/*` branches a **3-day TTL**. Nothing in
   CI runs `neon config apply`. `DATABASE_URL_UNPOOLED` must be set for
   lock-holder scripts. First empty preview ingest hits CCP for SDE.
3. **Auth / SSO.** EVE callbacks must be pre-registered. A random
   `*.vercel.app` URL cannot sign in. Session plan 4.0.3.2.1 already
   rejected preview as an auth surface.
4. **Crons** in `vercel.json` are Production-only. A long-lived beta
   will not refresh prices, SDE, or map purge unless you add a preview
   clock or accept staleness.
5. **Shared Upstash KV** with production on marketplace previews.
6. **No Convex teardown.** Only Neon delete, and only on PR close.

### Target `beta` environment

- Git branch `beta` (stable name). Vercel Preview domain assigned to that
  branch (Custom Environment if the team is Pro).
- Neon: do **not** name it `preview/beta` if that applies the 3-day TTL.
  Use a durable branch (`beta` / `staging`) so `neon.ts` inherits “no TTL.”
  Either rely on the integration with that name, or pin Preview env
  `DATABASE_URL` / `DATABASE_URL_UNPOOLED` to a hand-made Neon branch.
  Run `neon config apply` once when it is created.
- Convex: create a **prod-type extra deployment**
  (`npx convex deployment create beta --type prod`) so it does not expire.
  Give the Vercel Preview environment that deploy key. Set that
  deployment’s `AUTH_ISSUER_URL`, `AUTH_JWKS`, `SITE_URL`, and
  `CONVEX_SERVICE_SECRET` to the **beta origin**, not `lgi.tools`.
- EVE SSO: register the stable beta callback if signed-in Atlas is in
  scope. Otherwise document beta as anonymous-only (current preview
  posture) and do not pretend Convex “works” for signed-in maps.
- SDE: first deploy bootstraps; later deploys stand down (existing
  `ingest-sde-if-empty`). Decide whether beta crons are wanted.
- Do not store `NEXT_PUBLIC_CONVEX_URL` or `CONVEX_DEPLOYMENT` on Vercel
  Preview; let `convex deploy --cmd-url-env-var-name` inject the URL so
  CSP (`src/proxy.ts`) matches the backend that was just pushed.

P1 is the dashboard/config audit (keys, Neon branch, domain, SSO). Code
changes follow only where the audit proves a repo bug (for example
passing `--preview-create` vs using a prod-type key).

## 5. Phases

Each phase is its own PR unless a later session says otherwise. This PR
is still **D0** (document only).

### D0 — this document

Ship the plan. Do not change live skills, CI, or `vercel.json`.

### P1 — preview/prod audit (no flip)

Write down, in the implementing PR or a short appendix commit: Vercel
`CONVEX_DEPLOY_KEY` type per environment; whether a Neon `preview/*`
branch exists for any recent manual preview; whether `neon config apply`
has ever been run; Hobby vs Pro (Custom Environments). Fix only proven
misconfig (wrong key on Preview, missing unpooled URL). Do not enable
`beta` deploys in this phase.

### L1 — lifecycle and skill pass

Rewrite standing rules so merge ≠ deploy, Depot is the gate, and `beta`
is the long-lived preview. Files in §6. Do this **before** flipping
`vercel.json`, or close-out will still wait for a production deploy that
will never start.

### C1 — Depot `verify` spike with Docker Postgres

Prove `*.db.test.ts` green on Depot (or GHA rehearsal) with `services:
postgres`, migrate, and SDE/fixture. Keep non-blocking until honest.

### C2 — Job `build` required on the PR workflow

`next build` + `assert:routes` on Depot/GHA. Presence stays in `verify`.

### C3 — Playwright CI split + Job `e2e`

Split `playwright.config.ts`. Add `e2e` to the **PR** workflow only.

### C4 — shrink `ux-check`

Automated evidence is “`e2e` was green on this SHA.” Skill keeps operator
visual pause and production/beta log probes. Close-out stops requiring a
full local route sweep.

### R1 — skill-first review

Rewrite close-out §§5–6 and `resolve-update-watch` step 10. Merge actor
is `origin pr merge` / `gh pr merge`, not `merge-clean-pr`. Greptile
rules become dump-import only.

### R2 — retire bot helpers

Delete `poll_pr_gate.py`, `merge_clean_pr.py`, their tests, and CLI keys.
Keep `github_api.py`, `repair_gh_auth.py`, `scrub_pr_body.py`. Retire
`wait_prod_deploy.py` only when promote-based production proof exists.

### D1 — flip deploy policy

`vercel.json`: `main: false`, `beta: true`, deny globs unchanged. Create
the durable Neon + Convex beta backends (P1 findings). Assign the beta
domain. Document promote as the only production path.

### O1 — Origin cutover docs

Remotes, Cloud Agent notes, GitHub dump **without** pushing `main` on
every merge. Push `beta` when the preview should move.

### O2 — Depot as the only gate

Attach Depot to the Origin-hosted repo. Skills and AGENTS.md: definition
of done is `depot ci run --job verify`. Remove `pnpm verify` from those
docs (keep or delete the npm script in the same PR). Full workflow on
the PR. Teach `origin pr checks --watch`.

## 6. Documentation that must change

Draft replacement language. Do not apply it in D0. Historical session
as-builts and the Greptile devlog stay as written. **L1 rewrites live
schemas and skills**; it does not edit completed 4.0 delivery rows.

### Lifecycle schemas and plans (L1)

| File | Change |
| --- | --- |
| `docs/workflows/schema/session-plan.md` | Ordered work still must not list close-out or PR open. UX step evidence may be Depot `e2e` + operator visual. Do not require a production deploy in session proof. |
| `docs/workflows/schema/session-contract.md` | “Shipped” means merged to Origin, not live on `lgi.tools`. Add a release/promote flag when the contract is meant to go to production. |
| `docs/workflows/schema/session-as-built.md` | Record merge SHA and, separately, promote SHA when production was requested. |
| `docs/workflows/schema/changelog-pending.md` | Unchanged form. Fold still happens on a planned release; that release may now be “promote `beta`” rather than “merge to `main`.” |
| `docs/VERSION_4_0_PLAN.md` | Replace “Greptile on PR open is the gate of record” and any “merge deploys production” standing language. Do not rewrite completed rows. |
| Future session contracts | Gate = Depot; preview = `beta`; production = explicit promote. |

### `AGENTS.md`

Keep: ordinary vs planned; Fallow; Neon vs Convex; Atlas glossary;
close-out as the **merge** path.

Change (O2 + L1): definition of done is `depot ci run --job verify`.
Never run `next build` / `pnpm vercel-build` on a laptop. CI/PR runs
`build` + `e2e`. Production is not implied by merge. Cursor Cloud notes
name the Origin remote once O1 lands.

### `.cursor/skills/close-out/SKILL.md`

Target after L1 + R1 + D1:

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
   fixed or operator-deferred (`[Backlog]`).
2. `origin pr merge`.
3. If the contract/operator asked for beta: update GitHub `beta` (or
   Origin `beta` if Vercel is connected there) so the long-lived
   preview rebuilds.
4. Stop. Do not promote. Do not wait for Production.

## 7. Promote (only when the operator asked to ship production)

1. `vercel promote <beta-or-sha>`.
2. Fail-closed wait for that Production deployment.
3. `pnpm verify:prod` (and account routes with cookie jar when needed).
```

Retire `poll-pr-gate`, `merge-clean-pr`, Greptile 5/5, and “wait-prod
after every merge.”

### `.cursor/skills/ux-check/SKILL.md`

C4: operator visual + diagnosis. Not a required local sweep when PR
`e2e` is green. Beta URL is a valid `--base-url` for unreleased work.
Agents still must not visually approve.

### `.cursor/skills/start-session/SKILL.md`

UX Ordered work: Depot `e2e` + operator disposition. Do not treat
production promote as session completion unless the contract says so.

### `.cursor/skills/resolve-update-watch/SKILL.md`

Step 10: skill-driven review, no `poll-pr-gate`, still must not merge
or promote.

### Contributing / test docs

`docs/contributing/testing-principles.md`: `*.db.test.ts` is a Depot
`verify` gate (Docker Postgres). Delete “CI skips DB suites.” Playwright
is PR-only. Pure `*.test.ts` stays for non-SQL.

`docs/contributing/end-to-end-testing.md`: `pnpm test:e2e` on Depot
against `next start`. Cookie jars local/remote only.

`docs/ux-check/README.md`: point at Job `e2e`; beta as a probe target.

`CONTRIBUTING.md`, `.github/PULL_REQUEST_TEMPLATE.md`, `README.md`:
definition of done = Depot `verify`; PR also needs `build` + `e2e`;
`pnpm build` is CI/deploy only; merge does not ship production.

### `vercel.json` / `neon.ts` / Convex (D1 + P1)

Flip `deploymentEnabled` as in §3. Keep `preview/*` TTL in `neon.ts` for
ephemeral names; durable `beta` must not use that prefix. Convex beta is
a prod-type extra deployment. Document dashboard keys in
`docs/CONVEX.md` and `.env.example` (Preview key ≠ Production key;
`SITE_URL` on beta is the beta origin).

### `playwright.config.ts` and workflows

C2–C3. Add `services: postgres` to `verify`. After O2 the live file is
`.depot/workflows/…` (or Origin-attached GHA YAML). Neon
`delete-neon-branch.yml` does not apply to durable `beta`; do not point
it at that branch.

### `package.json`

O2: `verify` becomes a wrapper around `depot ci run --job verify` or is
deleted. Do not add `next build` to any local script agents will run.

## 7. Scripts to retire

| Keep until | Retire |
| --- | --- |
| `delivery scrub-pr-body` | `delivery poll-pr-gate` (R2) |
| `delivery repair-gh-auth` | `delivery merge-clean-pr` (R2) |
| `delivery github-api` | Bot predicates + their tests (R2) |
| `wait-prod-deploy` until promote waiter exists | `wait-prod-deploy` as “every merge” (L1) |
| `pnpm verify` until O2 | `pnpm verify` as definition of done (O2) |

`poll_pr_gate.review_state` calls `merge_clean_pr.merge_blockers`. Delete
them as a pair. Name the replacement merge command in R1 first.

`github-tooling` in `src/composition/vendor-resilience-registry.ts` wraps
`github_api.request`. Keep `github_api.py` while repair/scrub/wait still
need REST.

## 8. `ux-check` vs Depot Playwright

| | Local `ux-check` today | Depot `e2e` |
| --- | --- | --- |
| Server | Reuses `pnpm dev` | `next build` + `next start` |
| Suite | Changed routes + probes | Tiny `e2e/*.spec.ts` |
| Auth | Seed or cookie jar | `pnpm e2e:seed` |
| Visual | Operator pause | None |
| When | Pre-close-out | Every PR |

After C4, close-out needs the operator pause for user-facing work, not a
second full local sweep. Beta is the hosted target for unreleased UX.

## 9. Out of scope until someone asks

- Deleting every canned-row `*.test.ts` (only the “CI substitute for
  SQL” role goes away).
- Moving Issues off GitHub.
- Connecting Vercel directly to Origin (optional; GitHub can remain the
  deploy remote for `beta` / promote).
- Buildkite native pipelines.
- Per-PR ephemeral previews (already off; stay off).
- Rewriting historical 4.0 as-builts or the Greptile devlog.
- Implementing any phase in the same PR as this draft.
