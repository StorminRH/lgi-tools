# Origin-native ship path and CI expansion

Status: **draft, not in force.** Live close-out, `pnpm verify`, and GitHub
Actions stay as they are until a later PR applies a named phase. This file is
the inventory of documentation that must change, the CI design, and the target
skill language.

Decisions locked from the operator conversation that commissioned this draft:

- Origin becomes source of truth (create Private, or detach a GitHub mirror).
  Daily work and merge happen on Origin. GitHub is a disposable review dump
  plus, while Vercel stays connected there, a post-merge `main` push.
- Greptile and CodeRabbit stay on that GitHub dump only. Agents import findings
  onto the Origin PR. They are not the merge gate.
- Retire `poll-pr-gate` and `merge-clean-pr`. Review and merge live in skills
  and Cursor-native tools (`origin pr`, Cursor Automations, human/agent
  review), not Python helpers that scrape GitHub bots.
- Expand CI on a VM: production `next build` + full route-classification
  assert, and Playwright. Operators should not run `next build` on a laptop.
  The automated Playwright sweep should not have to run inside `ux-check`.
- Local `pnpm verify` remains the agent definition of done. It does **not**
  grow `next build` or Playwright.

## 1. Target operating model

1. Agent works against `https://origin.cursor.com/{owner}/{repo}.git`.
2. Agent opens an Origin PR. Depot (replay of the Actions YAML below) reports
   on the Origin Checks tab. Agent waits with `origin pr checks --watch`.
3. Cursor-native review is an Origin Automation and/or `origin pr review` in
   close-out — not Cursor Review or Bugbot (those are still GitHub-only).
4. When Origin CI and Origin review are green, the agent pushes **that exact
   SHA** to GitHub and opens a review-only PR. Greptile/CodeRabbit run there.
   The agent monitors with `gh`, imports anything real onto Origin, fixes on
   Origin, re-runs Origin CI, and updates the dump SHA if a second bot pass
   is wanted.
5. Merge **only** on Origin (`origin pr merge` once rules + checks pass).
   Close the GitHub PR. Do not merge it. Do not accept bot-apply commits on
   GitHub.
6. If Vercel still watches GitHub, push Origin `main` to GitHub after merge
   so production deploy happens. Then existing production proof
   (`wait-prod-deploy` + `pnpm verify:prod`) still applies. Connecting Vercel
   to Origin later can drop that push.

Origin Private hides the clone from people you have not granted. It does not
change the git tree. A GitHub dump of the same SHA is the same files,
including `.gitignore` and tracked dotfiles (`.cursor/`, `.github/`). Ignored
secrets (`.env*`) never leave the machine.

## 2. What the CI expansion is

Today one GitHub Actions job runs typecheck, lint, route-**presence**,
coverage Vitest, and Fallow. That is a cheap recipe. It does not prove
production render mode. It does not run a browser. `assert:routes` and
`next build` wait for Vercel. Playwright waits for `ux-check` on a laptop.

A pipeline here means: **several recipes, each on a clean VM, each allowed
to fail the PR on its own.** Splitting them means a red build does not hide
behind a red unit test, and a laptop never pays for `next build`.

### Job A — `verify` (keep)

Same as today. Fallow still needs Istanbul `coverage/coverage-final.json`, so
do not shard Vitest unless there is a documented way to merge that file.
`*.db.test.ts` stays skipped on CI unless a later phase adds a Postgres
service — that is a separate hole, not this draft.

Local `pnpm verify` stays this job’s contents. Agents still run it. They
still must not run `next build` / `pnpm build` / `pnpm vercel-build` on a
laptop or Cloud Agent worktree.

### Job B — `build` (new)

On a VM:

```text
pnpm install --frozen-lockfile
pnpm build
pnpm assert:routes
```

This is the check [the route-assertion rail already wanted](content/devlog/06-rails/00-route-assertions.md)
and that PR #148 only approximated with `assert:routes-present`. Presence
stays in Job A (cheap, no `.next`). Job B reads
`.next/prerender-manifest.json` and fails on render-mode drift, missing
classification, or prerender-blocking errors (`cookies()` / uncached `fetch`
outside `<Suspense>`, and the rest of the Cache Components rules).

Do **not** run `build:vercel` in this job. Migrate / ingest / warm-neon stay
deploy-time. The spike that starts this job is: can a VM `next build` finish
with CI env plus a migrated Postgres (and whatever SDE prerender actually
touches), or do specific routes need build-time isolation first?

Cache `.next/cache` on the runner. Official Next CI caching:
https://nextjs.org/docs/app/guides/ci-build-caching

`NEXT_PUBLIC_*` is inlined at this build. The VM must have the same public
Convex / site URLs the classification expects, or the output is a lie.

### Job C — `e2e` (new)

Playwright against **production** `next start`, not `pnpm dev`. Official
Playwright and Next guidance both say CI should resemble deploy.

Sequence: reuse Job B’s `.next` artifact (or rebuild), `pnpm start`,
`pnpm e2e:seed` against the CI database, `pnpm test:e2e`.

Install browsers with `pnpm exec playwright install --with-deps --only-shell`
and pin the Playwright version (repo is 1.61.x; do not use a 1.62 Docker
image until the package matches).

Config must **split** local vs CI. Today `playwright.config.ts` always uses
`pnpm dev`, `reuseExistingServer: true`, `retries: 0`. That is correct for
laptop ux-check. In CI it must be the opposite: `reuseExistingServer: false`,
`webServer.command` = `pnpm start`, `forbidOnly` already keys off `CI`.
Do not put the operator cookie-jar path on CI. Do not commit `storageState`.
Upload the failure report/trace as a CI artifact (`if: ${{ !cancelled() }}`).

Job C runs the **tiny** `e2e/*.spec.ts` smoke suite. It does **not** run the
operator visual pause. Optional later: a CI-safe subset of
`docs/ux-check/probes/` (log-driven, no screenshots-for-humans). Changed-route
`pnpm ux-check` stays available locally for diagnosis; it is no longer a
required close-out step once Job C is green.

### What this does not add

- Visual approval. Agents still must not sign off on look-and-feel.
- Instant-nav tests via experimental `@next/playwright` in production (needs
  a flag that must not ship to live prod).
- Sharding. The smoke suite is too small; Vitest sharding would break Fallow’s
  single coverage file.
- Buildkite. Depot is the Origin kitchen that replays this YAML. Buildkite is
  only if native pipelines are wanted later.

### After Origin detach

Depot and Buildkite attach only to Origin-hosted repos. The same workflow
files move with git. Secrets do not — re-enter them on Depot. Origin Apps
cannot see an inbound GitHub mirror, so this expansion can land on GitHub
Actions **before** detach; Depot pickup is a later flip, not a rewrite.

## 3. Phases

Apply in order. Each phase is its own PR unless a later session says otherwise.
This PR is **D0** only.

### D0 — this document

Ship the plan. Do not change live skills, CI, or helpers.

### C1 — build-job spike (implementation, no policy flip)

Prove `next build` + `assert:routes` on a throwaway VM/GHA workflow with the
real env/DB question answered. Keep the job non-blocking or on a branch until
it is honest. Document the required secrets in the implementing PR.

### C2 — Job B required

Add the `build` job to `.github/workflows/test.yml`. Keep Job A. Update
CONTRIBUTING, README (`pnpm build` row), PR template, and the contributing
test docs so “never run `next build` locally” stays true and “CI now runs it”
is stated. `assert:routes-present` remains in Job A.

### C3 — Playwright CI split + Job C

Split `playwright.config.ts` on `process.env.CI`. Add the `e2e` job. Seed in
CI needs the same DB the app uses to mint a Better Auth session — call that
out in the implementing PR. Update `docs/contributing/end-to-end-testing.md`
and `docs/contributing/testing-principles.md`: Playwright smoke is a CI gate;
it is still not part of `pnpm verify`.

### C4 — shrink `ux-check`

Rewrite the skill so the required automated sweep is “Job C was green on this
SHA” (or a local `pnpm test:e2e` only when CI cannot represent the change).
The skill keeps: operator visual checklist, durable probes the agent needs for
a failing diagnosis, production `verify:prod` / cookie-jar remote probes.
Close-out stops treating a full local route sweep as a precondition.

### R1 — skill-first review (can overlap C2–C4; still on GitHub)

Rewrite `close-out` §§5–6 and `resolve-update-watch` step 10. Agents read
GitHub (or Origin) review threads themselves. Merge actor becomes `gh pr merge`
or `origin pr merge` as the skill says, fail-closed on required checks, **not**
`merge-clean-pr`. Greptile 5/5 and CodeRabbit thread rules become “import from
the dump if it exists; Origin review + CI are the gate.”

Do not delete the Python modules in the same PR as the skill rewrite. Leave
them one release so a mid-flight PR can still finish the old way if needed.

### R2 — retire the bot helpers

Remove `tools/delivery/poll_pr_gate.py`, `merge_clean_pr.py`, their tests, and
the `tools/cli.py` keys. Keep `github_api.py`, `wait_prod_deploy.py`,
`repair_gh_auth.py`, `scrub_pr_body.py`. Update
`src/composition/vendor-resilience-registry.ts` only if the `github-tooling`
wrapper’s documented purpose was those retired callers — keep the wrapper if
`wait_prod_deploy` / `repair_gh_auth` still use `request`.

### O1 — Origin cutover docs

After a Private Origin repo exists (or after detach):

- Point remotes and Cloud Agent instructions at Origin.
- AGENTS.md / Cursor Cloud notes: `origin` remote, Depot, no inbound-mirror
  assumption.
- close-out: open Origin PR; optional GitHub dump; merge Origin only; push
  `main` to GitHub if Vercel still lives there.
- Issues / `[Backlog]` stay on GitHub until something else exists.

### O2 — Depot

Attach Depot to the Origin-hosted repo. Confirm Checks appear. Teach agents
`origin pr checks --watch` and, optionally, `depot ci run` before push.
Cloud Agent “autofix CI” stays GitHub Actions-only until Cursor says otherwise.

## 4. Documentation that must change

Draft replacement language. Do not apply it in D0. Historical session
contracts, as-builts, and the Greptile devlog stay as written.

### `AGENTS.md`

Keep: ordinary vs planned work; `pnpm verify` as local definition of done;
never run a production build **locally**; Fallow; Neon vs Convex; Atlas
glossary; close-out as the ship path.

Change: Cloud / Cursor notes to name Origin as the git remote once O1 lands.
Add one sentence that CI (not the laptop) runs `next build` and Playwright.
Definition of done stays `pnpm verify`; a green Origin/GHA `build` + `e2e`
becomes a **PR** definition of done, not a local one.

### `.cursor/skills/close-out/SKILL.md`

Target §§5–7 (R1 + O1):

```markdown
## 5. The PR and review loop

1. Reuse verify evidence when the head is unchanged since Finalize.
2. Open one draft Origin PR (`origin pr create`). Headings stay
   What this does / Why / Notes / Test plan. Run `delivery scrub-pr-body`
   on the body.
3. Wait for Origin checks: `origin pr checks --watch`.
4. Cursor-native review: Origin Automation comments and/or `origin pr review`.
   Advisory IDE review is not the gate.
5. Optional GitHub dump: push the exact SHA, open a review-only GitHub PR,
   collect Greptile/CodeRabbit/Bugbot, import real findings onto Origin,
   fix on Origin only. Never merge the GitHub PR. Never apply bot commits
   there.
6. One Origin push per review round after evidence is green.

## 6. Merge

1. Origin required checks green. Origin review (human or named Automation)
   satisfied. Imported dump findings either fixed or operator-deferred
   (`[Backlog]` GitHub Issue).
2. Merge with `origin pr merge` (or `--auto` once rulesets exist).
3. If Vercel still tracks GitHub, push the merge SHA to GitHub `main`.

## 7. After merge and production proof

Keep `wait-prod-deploy` and `pnpm verify:prod` while production is Vercel
via GitHub. Drop `wait-prod-deploy` only when production proof has another
fail-closed deploy waiter.
```

Retire the `poll-pr-gate` / `merge-clean-pr` command blocks and the
“participating Greptile 5/5” rule.

### `.cursor/skills/ux-check/SKILL.md`

Target (C4):

- Job of the skill: operator visual checklist + diagnosis when CI Playwright
  is red or cannot represent the change.
- Not required: a full local `pnpm ux-check` of every changed route when Job C
  already ran `pnpm test:e2e` (and, later, CI probes) on this SHA.
- Still required: operator visual pause for user-facing work; agents still
  must not visually approve.
- Production proof stays log-driven Playwright against the live URL with
  origin-scoped bypass / cookie jar.

### `.cursor/skills/resolve-update-watch/SKILL.md`

Step 10: drop “batched external-review loop” via `poll-pr-gate`. After R1,
the review-only PR uses the same skill-driven review as close-out §5, and
still must not merge.

### `.cursor/skills/start-session/SKILL.md`

When Contract UX gate is Yes: the Ordered work step still invokes `ux-check`,
but that step’s automated evidence may be “CI e2e green + operator visual
disposition” once C4 is live. Do not list close-out, push, or PR open as
Ordered work (unchanged).

### `docs/contributing/testing-principles.md`

Update the Playwright row: CI Job C is a PR gate; local `pnpm ux-check` is
operator/diagnosis aid; neither is inside `pnpm verify`. Keep the “default to
not adding E2E tests” bar. Mention Job B as the place render-mode drift dies,
not Vercel-only.

Leave the `*.db.test.ts` “CI skips” sentence until a dedicated DB-CI phase
exists. That is not part of this expansion.

### `docs/contributing/end-to-end-testing.md`

Add: `pnpm test:e2e` runs in CI against `next start`. Auth seed uses CI
Postgres + `pnpm e2e:seed`. Cookie jars remain local/remote-probe only.
Artifacts upload from CI; still gitignore captures. Agents still do not
visually approve.

### `docs/ux-check/README.md`

Note that CI may run a probe subset later; `captures/` stays ignored. Point
at Job C for the smoke suite.

### `CONTRIBUTING.md` and `.github/PULL_REQUEST_TEMPLATE.md`

After C2/C3: “CI also runs `next build` + `assert:routes` and Playwright
smoke. Do not run `pnpm build` locally. Paste the CI job links in the test
plan.”

### `README.md`

Change the `pnpm build` row from “Vercel only, after merge” to “production
compile — CI and Vercel; never run locally.”

### `docs/VERSION_4_0_PLAN.md`

The standing line “Greptile on PR open is the gate of record” is live policy.
In R1, replace it with “Origin CI + Cursor-native Origin review are the gate
of record; GitHub bots are an optional dump.” Do not rewrite completed
session rows.

### `playwright.config.ts` and `.github/workflows/test.yml`

Implementation in C2–C3, not D0. Job A stays. Add `build` and `e2e`. Neon
preview-delete workflow stays GitHub-event-based until previews move.

### `package.json`

No new local verify steps. Optional: a `test:e2e:ci` script that asserts
`CI=1` so agents cannot accidentally use the CI webServer locally.

## 5. Scripts to retire (R2)

| Keep | Retire after R1 |
| --- | --- |
| `delivery scrub-pr-body` | `delivery poll-pr-gate` |
| `delivery wait-prod-deploy` (until Vercel-on-GitHub is gone) | `delivery merge-clean-pr` |
| `delivery repair-gh-auth` | Bot predicates inside `merge_clean_pr` |
| `delivery github-api` (shared REST) | `tools/tests/test_poll_pr_gate.py`, bot cases in `test_merge_clean_pr.py` |

`poll_pr_gate.review_state` calls `merge_clean_pr.merge_blockers`. Delete them
as a pair. `merge-clean-pr` is also the only squash-merge + remote-branch-delete
actor — R1 must name the replacement merge command before R2 deletes the file.

`github-tooling` in `src/composition/vendor-resilience-registry.ts` wraps
`github_api.request`. Do not delete `github_api.py` while wait/repair still
call it. Update the registry comment if the wrapper’s story was “review bots.”

No `package.json` script names the delivery commands. `python3 tools/cli.py test`
must drop or rewrite the retired unit files so the tools suite stays green.

## 6. `ux-check` vs CI Playwright

| | Local `ux-check` today | Job C |
| --- | --- | --- |
| Server | Reuses `pnpm dev` | `next build` + `next start` |
| Suite | Changed routes + durable probes | Tiny `e2e/*.spec.ts` |
| Auth | Seed or operator cookie jar | `pnpm e2e:seed` only |
| Visual | Operator pause | None |
| When | Pre-close-out UI gate | Every PR |

After C4, close-out needs the operator pause for user-facing work, not a
second full local sweep. If Job C cannot represent the change (auth cookie
against production, a probe that needs a live map id), the agent still runs
that probe locally and records it.

## 7. Out of scope until someone asks

- Turning on `*.db.test.ts` in CI (needs a Postgres service + SDE story).
- Moving Issues off GitHub.
- Connecting Vercel to Origin (optional after O1).
- Buildkite native pipelines.
- Rewriting historical 4.0 contracts, as-builts, or the Greptile devlog.
- Implementing any phase in the same PR as this draft.
