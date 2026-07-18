# LGI.tools agent guide

This file contains the repository-wide instructions that coding agents must follow on every task. Keep repeatable procedures in `.agents/skills/`, detailed reference material in `docs/`, and mechanical enforcement in lint, tests, Fallow, and hooks.

## Start here

LGI.tools (Lo-Gang Industries) is a multi-tool web platform for EVE Online players. It is built incrementally: extend the shared platform and existing feature slices without rewriting unrelated working systems.

Before changing code:

1. Run `python3 .agent-local/resolve_development_state.py --pretty`, then read
   `docs/DEVELOPMENT_LIFECYCLE.md`, `docs/DESIGN_PRINCIPLES.md`, the current
   `docs/CODE_HEALTH_BASELINE.md`, `docs/SCRATCHPAD.md`, and the resolved
   roadmap/contract/approved session plan in `docs/`.
2. If `graphify-out/graph.json` exists, skim `graphify-out/GRAPH_REPORT.md` and query Graphify before searching source files.
3. For library- or framework-specific work, verify current APIs with the `find-docs` skill/Context7 during planning. Do not rely on remembered APIs.
4. Read the relevant guide under `node_modules/next/dist/docs/` before changing Next.js routing, rendering, caching, or configuration.
5. Raise a conflict before proceeding if the requested work violates an invariant in this file or an approved plan.

When beginning or resuming development, use `start-session`. The lifecycle
resolver is the sole mechanical owner of current-state validation and handler
selection; `start-session` reports its directive (action, reason, authority,
primary artifact, and pause) before dispatching it. Stage skills own one
procedure and return control to `start-session` after their outcome instead of
selecting sibling skills. Planning directives require runtime Plan mode and
Ryan's approval before their canonical artifact is written.
`docs/SESSION_CONTRACTS.md` defines the source model; do not create or maintain a
separate agent prompt.

## This is not the Next.js you remember

The repository uses Next.js 16.2.6 with Cache Components, React 19, strict TypeScript, Tailwind v4, Drizzle ORM, Neon Postgres, Convex, Better Auth, Upstash Redis, Vercel, pnpm, Vitest, and visx. APIs and conventions may differ from model training data. Heed deprecations in the installed Next.js documentation.

## Commands and verification

Confirm scripts against `package.json` when they may have changed.

- Install: `pnpm install`
- Public/local Next dev server: `pnpm dev`
- Full local stack: `pnpm dev:all`
- Tests: `pnpm test`
- Coverage: `pnpm test:coverage`
- Typecheck: `pnpm typecheck`
- Lint: `pnpm lint`
- Static-analysis gate: `pnpm fallow`
- Definition of done: `pnpm verify`
- Post-merge Vercel build entry point (never run locally): `pnpm vercel-build`

`pnpm verify` runs typecheck, zero-warning lint, Vitest, and Fallow. Run it before committing. Close-out additionally requires a fresh full-coverage run followed by coverage-backed Fallow pinned to `origin/main`; this catches CRAP failures that reference-based local attribution can miss. CI additionally runs `pnpm assert:routes-present`; the post-merge Vercel production build runs the heavier route render-mode assertion.

**Never use a production-mode build for local or pre-merge testing.** Do not run `pnpm build`, `next build`, `pnpm vercel-build`, or an equivalent production build locally or on a feature branch. Before merge, verify with `pnpm verify`, route-presence checks, the local dev server, and `ux-check` as applicable. Only Vercel may run the production build, and only after the change has merged to `main`.

Fallow is a required gate, not a report to route around. It enforces dead code, unused exports/dependencies, architecture boundaries, introduced duplication, and universal complexity caps (cyclomatic 20, cognitive 15, CRAP 30). Both Fallow baselines are intentionally empty. Fix introduced complexity or add meaningful behavioral coverage in the same session; never add a waiver or baseline entry. `pnpm fallow:health` is a non-gating dashboard.

For CI-equivalent CRAP results, generate coverage first:

```bash
pnpm test:coverage
FALLOW_AUDIT_BASE=$(git rev-parse origin/main) pnpm fallow
```

When counting TypeScript diagnostics or validating a strictness migration, use `npx tsc --noEmit --incremental false` with the flag under test. Cached incremental runs can under-report diagnostics.

## Local development

`pnpm dev` starts only Next.js. It expects local Docker Postgres when `.env.local` contains:

```text
LOCAL_DB_DRIVER=postgres-js
DATABASE_URL=postgres://lgi:lgi@localhost:5433/lgi_tools
```

Fresh setup:

```bash
docker compose up -d
pnpm db:migrate
pnpm db:refresh-sde
pnpm db:refresh-prices
```

- Re-run `pnpm db:migrate` after pulling migrations. A stale schema commonly surfaces as route 500s.
- Use `pnpm db:refresh-sde`, never the raw `pnpm db:ingest:sde`, for a usable planner dataset. The raw ingest truncates resolved blueprint tables without rebuilding them.
- Upstash is intentionally optional in local development; the ESI gate disables when its env vars are absent.
- Local industry indices can remain empty; gross-margin rendering is valid.
- Use `pnpm dev:all` when testing the complete authenticated/live experience. It starts Docker Postgres, Next on `:3000`, and local Convex on `:3210`.

EVE SSO must use the same origin in `.env.local` (`BETTER_AUTH_URL`), Convex (`AUTH_ISSUER_URL`), and the EVE developer callback. Use `http://localhost:3000` consistently; changing the port requires changing all three.

## Codebase map

- `src/features/<name>/`: self-contained product slices. Features never import other features.
- `src/data/<name>/`: shared data slices that own their schema, ingest, queries, and types. Data slices never import features or peer data slices.
- `src/components/ui/`: domain-neutral UI primitives. They import only from `src/lib/`.
- `src/lib/`: cross-cutting utilities. Lib imports only lib.
- `src/search/`: slice-neutral search engine and the composition manifest that registers feature/data search sources.
- `src/app/`: App Router pages and route handlers; composition is allowed here.
- `src/db/`: cross-slice database composition, migrations, and pipelines.
- `src/purge/`: registry joining per-slice personal-data purge contributors.
- `convex/`: regenerable live projections and sync engine.
- `content/changelog/`: `_preamble.md` plus one `vX.Y.md` file per master version, assembled newest-first.
- `content/devlog/`: segmented devlog source assembled by its loader.
- `docs/SCRATCHPAD.md`: short cross-session memory; `docs/backlog.md`: genuinely deferred, unassigned work.

Cross-slice composition belongs above the participating slices; `src/db/sde-pipeline.ts`, `src/search/register-all.ts`, and `src/purge/` are the established patterns. Fallow encodes the full import direction map and the few documented exceptions.

## Engineering principles

- Keep scope minimal. Implement only the approved task and changes clearly necessary for it.
- Diagnose before fixing uncertain behavior. Verify the report, identify the root cause, test the hypothesis, and present evidence. If asked only to diagnose, stop after reporting.
- Prefer existing primitives and configuration. Extract a shared primitive when there is a real second consumer, not for hypothetical reuse.
- Do not add speculative abstractions, configurability, defensive branches for impossible states, or commentary on untouched code.
- Validate at system boundaries: user input, route payloads, environment variables, and external APIs. Do not add redundant checks between trusted internal layers.
- Keep types, variants, classes, and enums in one authoritative configuration. Adding a supported variant should normally be a config change.
- Keep schemas extensible without rewriting existing content types.
- Batch database work; do not introduce N+1 queries.
- A non-null assertion is allowed only for a locally provable by-construction invariant, explained with a one-line comment. It is never a substitute for a guard or a way around Fallow.
- Hold to the approved plan and its out-of-scope list. Surface newly discovered wider work instead of silently absorbing it.
- Show command output or other evidence for verification. State plainly when a check was skipped or failed.
- Ask before destructive, irreversible, production, shared-state, or force-push actions.

## Comment standard

One hybrid TSDoc-lite style repo-wide (enforcement lands with 3.9.1.7):

- Every exported surface in `src/` and `convex/` production code carries a
  `/** */` interface comment: summary prose stating the contract — what it
  does, units, preconditions, what the caller owns. Use TSDoc tags only where
  they add information; there is no mandatory `@param` ceremony.
- `//` comments are unchanged for module prologues, design rationale, and
  implementation commentary.
- Deferred work routes to `docs/backlog.md`, never a source `TODO`/`FIXME`.
- Write interface comments before implementing; if the comment is hard to
  write, the interface is wrong (P7). Session plans include the draft
  interface comments for every new export (`docs/SESSION_PLANNING.md` Step 8).
- Comment quality is a judgment gate (pre-PR review), never a coverage or
  density metric (P10). A comment that restates the signature fails review.

## Architecture invariants

### Rendering and routes

Cache Components are enabled. Choose the most static honest render mode:

1. Fully static (`○`) when possible.
2. Static shell plus request-time `<Suspense>` holes (`◐`) for cookies, sessions, search params, or per-request DB work.
3. Fully dynamic (`ƒ`) only when the whole surface is genuinely request-specific.

Cache global, slow-changing reads with `'use cache'`, `cacheLife`, and `cacheTag`; do not use `unstable_cache` or `experimental.useCache`. Keep request data inside Suspense children. Use `connection()` in route handlers that must remain dynamic before reading secrets/env. Register every new page or route in `scripts/route-classification.json` with its mode and justification.

### Data boundaries and database

- Feature -> data/ui/lib/auth-shared imports are allowed; data -> feature, data -> peer-data, feature -> peer-feature, and lib -> higher-layer imports are not.
- Postgres enums originate in TypeScript `as const` arrays.
- The lazy DB proxy in `src/db/index.ts` must remain import-side-effect-free.
- Session advisory locks use a reserved direct, unpooled connection and release in `finally`; never hold a transaction or pooled connection across network calls.
- Every deploy migrates its own database branch. Branch pushes do not create previews automatically.
- Every user/character-keyed Neon table must be claimed by a purge contributor or an explicit retained exemption. Follow the complete key-shape, purge, growth, and ESI checklist enforced by `src/db/dataset-declarations.test.ts`.

### APIs, validation, and environment

- Validate JSON input in the route handler with a Zod schema from the owning slice's `api-contract.ts`; queries accept typed values.
- Define response types and endpoint objects in the same contract file. Clients use `apiFetch`; raw `fetch('/api/...')` is banned.
- Routes that do not consume a JSON/form body declare exactly one own-line input marker: `// input: none` for no caller input, or `// input: query` for query/path input only. Body-consuming routes carry no input marker.
- Read server env through `readEnv`/`requireEnv` from `src/lib/env.ts`. Direct reads are limited to `NODE_ENV` and `NEXT_PUBLIC_*`.
- Every EVE ESI request uses the single `esiFetch`/`esiUrl` gate in `src/lib/esi/` and its shared Redis budget. Never create another wrapper or embed the ESI host elsewhere.

### Identity and data placement

- One Better Auth user represents one human; linked EVE characters are account rows, not separate users. Admin is per-user.
- EVE SSO is the only login path.
- EVE tokens remain encrypted in Neon by the application AES-256-GCM layer. Better Auth `encryptOAuthTokens` stays disabled.
- Convex trusts Better Auth JWT/JWKS identity and never owns a separate identity system.
- Neon is authoritative; Convex is derived and fully regenerable. There are no Convex-to-Neon writes.
- Place ESI data by cache time, not by whether it belongs to a character. Convex is for ESI data cached for at most two minutes and collaborative app-authored state requiring live fan-out. Slower personal datasets such as skills, jobs, and blueprints belong in Neon with stale-gated on-view refresh.
- Store timer-like state as an absolute end timestamp and derive readiness client-side.
- Read `docs/CONVEX.md` before changing Convex, live sync, the ESI gate, or related cost/scaling behavior. New ESI scopes require an explicit batched decision.

### UI and styling

Detailed source-level UI and rendering rules live in `src/AGENTS.md` and apply automatically when working under `src/`. Its UI-specific sections govern TSX, CSS, component styles, and interactive behavior.

- Preserve the established terminal/EVE visual identity. New tones, palettes, or typefaces require explicit written justification.
- UI primitives accept abstract tones (`green`, `red`, `neutral`); feature-level style maps own domain meaning such as “C5 is red.”
- Reuse adopted wrappers in `src/components/ui/`; feature code does not import Base UI or sonner directly.
- Use Tailwind/token classes for static styling and CSSOM custom properties for runtime values. JSX `style`, raw hex colors, arbitrary text sizes/radii, raw HTML sinks, and ad-hoc field/button styling are lint-restricted.
- `Collapsible` remains a pure `<details>/<summary>` primitive with native open state.
- User-facing behavior and appearance require the `ux-check` workflow plus Ryan's browser review; automated screenshots do not replace human visual review.

#### UI system contract

- `globals.css` `@theme` is the authoritative home for semantic colors (including alpha colors), type, tracking, radii, motion, four stacking tiers (`base`, `sticky`, `dropdown`, `overlay`), shadows, and repeated icon sizes. Raw `rgba()` is lint-restricted in source call sites alongside raw hex.
- Domain-neutral controls live in `src/components/ui/`. The shared set includes Field, Checkbox, RadioGroup, SegmentedControl, Tabs, Tooltip, Kbd, CopyButton, Skeleton, Banner, Pagination, and ConfirmDialog; use these before styling an equivalent feature-local control.
- The rendered component reference lives at admin-gated `/preview/primitives`. Reference and demo routes are never public design sandboxes and must be registered in `scripts/route-classification.json`.
- Tooltip is supplemental hover/focus help only. Touch-critical or disclosure content remains a Popover, and chart CSSOM tooltips remain chart-owned.

## Testing policy

Use Vitest and co-locate tests as `foo.test.ts` beside `foo.ts`.

- Real-Postgres suites are named `*.db.test.ts` and use `createDbTestHarness`,
  which owns DB reachability gating, disposable-schema clones of the migrated
  local `public` schema, request-path proxy steering, common identity seeds,
  resets, and teardown. Direct `postgres()` construction and embedded
  connection strings in DB suites are lint-banned.
- Add tests organically for new or changed testable behavior: pure functions, math, query helpers, data transforms, state machines, and error/empty/loading branches.
- Test behavior, not implementation structure or layout. Prefer visible text/roles for unavoidable component tests.
- Extract branching logic from components into small testable functions; leave static presentational shells to visual review.
- Do not backfill unrelated tests or add assertions solely to increase coverage/CRAP numbers.
- Route handlers need direct tests when they contain meaningful logic; purely presentational components usually do not.

## Workflow and delivery

All changes ship through PRs to `main`, the only automatic deployment target. Work on one branch per independently shippable sub-version, not one branch per session. Multiple scoped sessions may commit and push to that branch; open one PR when the sub-version is complete.

- Version features as `X.Y.N`; use `X.Y.N.M` for sequenced session/sub-slices, with data/plumbing before dependent UX.
- Branch previews are manual and on-demand only. Use `vercel deploy` only when local data cannot represent the required behavior, and remove the preview promptly afterward.
- Production deployment review is browser-first after Vercel reports Ready. Verify the shipped version, affected routes, auth/admin gates, and browser console in a real browser; scripted HTTP/curl smoke checks are not the production review surface because the public edge may deliberately rate-limit them. Keep the Vercel CLI for deployment state and runtime logs.
- Before ending any coding session, read `docs/SESSION_END.md` and invoke the `close-out` skill when the user asks to wrap up or ship. A final session must pass `pre-pr-design-review` before `docs/PR_REVIEW.md` begins.
- Workspace docs, agent configuration, and local utilities are tracked and ship through normal commits. At close-out, audit only the deliberately ignored local-state paths (`.claude/settings.local.json`, `.claude/launch.json`, `.claude/worktrees/`, `.agent-local/pr-privacy-local-patterns.txt`, generated reports/captures, margin-audit artifacts, temporary PR body-files, and `graphify-out/`): keep no credential-bearing permissions or session-only artifacts, reconcile both runtime adapters, and run the drift gate after policy changes.
- If more sessions remain, finish with a verified commit/push and updated session memory; do not open a PR.
- Tracked lifecycle status is reconciled locally immediately after merge, then carried as the first commit on a branch created and named only after the resolver selects the next lifecycle action. Require the reconciled release-consistency check to pass. The remote documents intentionally have a one-PR lag; do not open a follow-up PR or push directly to `main` solely to publish that reconciliation.
- If a user-facing sub-version is complete, run the `ux-check` skill and pause for Ryan's local browser review before opening the PR.
- When the sub-version is ready, follow `docs/PR_REVIEW.md` for the single PR, Greptile loop, changelog/version update, merge gates, and plan archiving.
- Every notable sub-version, including internal/CI/infrastructure/tooling work, gets an `APP_VERSION` bump and changelog entry in the correct `content/changelog/vX.Y.md` master file.
- PR titles and bodies are public artifacts. Keep personal information out of
  them: no personal names, emails, account handles, machine names, local paths,
  browser/profile details, or private identifiers. Use role-neutral review
  language, create bodies through a temporary Markdown file, and read the
  published body back before entering the review loop. `docs/PR_REVIEW.md` owns
  the complete scrub and verification procedure.
- Invoking `close-out` is conditional, per-run authorization to merge only after current-head Greptile 5/5 with no unresolved findings, green CI, and a clean/mergeable PR.

### Commit style

Write plain English for teammates. Describe what changed for the project, not file paths, function names, endpoint signatures, or implementation jargon.

- Subject: one sentence, lowercase after the conventional prefix, under 72 characters.
- Optional body: 3–5 bullets explaining what changed and why.

Example:

```text
feat: add browsing and filtering for wormhole sites

- sites can be filtered by class and type
- detail pages include waves, NPC counts, and resource values
- invalid filters return a clear error
```

## Agent workflows and tools

Use repository skills for their matching workflows:

- `plan-version`: extrapolate an approved master plan into an ordered contract index and session contracts, with adversarial review before approval.
- `plan-session`: design, adversarially review, and, after approval, persist the detailed implementation plan for one contract.
- `start-session`: public lifecycle entry; report and dispatch the resolver-owned directive, then re-resolve after every handler outcome.
- `pre-pr-design-review`: run the constitution-backed design-decay gate and reconcile changed hotspot surfaces before a PR.
- `close-out`: end-of-session verification, commit/push, required design gate, PR, Greptile, clean merge, and production reconciliation.
- `plan-version-audit`: create and adversarially review the approved plan for a version-close audit or requested periodic health pass.
- `plan-audit-remediation`: extend the current master version with approved
  sub-versions/contracts for every actionable close-audit finding.
- `version-audit`: execute the approved audit, overwrite the live health baseline, and archive a completed version only after the audit passes.
- `triage-issue`: validate an issue/contribution and report options before taking outward action.
- `ux-check`: scripted desktop/mobile capture and console/network review for changed UI routes.

### Claude subagent routing

Claude Code never launches a native Claude subagent. Whenever any workflow
calls for a subagent—planning, exploration, execution support, triage, audit
work, or review—Claude launches a headless `gpt-5.6-sol` worker through the
Codex CLI. Choose its effort from the Claude seat that would otherwise have
handled the task:

| Equivalent Claude seat | Headless Codex worker | Typical use |
| --- | --- | --- |
| Opus 4.8 | `gpt-5.6-sol` @ high | difficult architecture, synthesis, or cross-cutting work |
| Sonnet | `gpt-5.6-sol` @ medium | bounded exploration, implementation support, or review |
| Haiku | `gpt-5.6-sol` @ low | narrow lookups, inventories, and mechanical small tasks |

Use xhigh only when a workflow explicitly requires it or a high-effort worker
cannot resolve the task. Every complete planning draft receives a fresh
read-only `gpt-5.6-sol` xhigh adversarial review before operator approval. The
primary session reconciles worker output and retains lifecycle judgment,
operator questions, approval, persistence, commits, and close-out unless the
active workflow explicitly delegates a narrower responsibility.

Every Claude-launched background task title begins
`gpt-5.6-sol@<effort>: <bounded purpose>` so the model and effort are visible.
There is no generic delegated-session executor: workers are task-scoped, and
the active stage skill remains the workflow owner. Runtime-specific headless
launch mechanics live in `CLAUDE.md`.

Every repository skill creates a native runtime todo/task list from its phases
and owning documents before execution. Keep one item active and reopen
verification items invalidated by fixes.

Authenticated CLIs are the tooling of record:

- `vercel`: deployments, environment management, inspect, and runtime logs.
- `neon`: project/branch/config management; pair its connection string with `psql` for SQL.
- `ctx7` / the `find-docs` skill: current library documentation. Resolve/fetch current docs during planning, especially for Next.js, Drizzle, Zod, jose, Base UI, and Convex.

Do not substitute a generic Vercel review for this repository's Greptile gate, and never deploy/promote production without the authorization required by the active workflow.

## Agent configuration maintenance

This file and `src/AGENTS.md` are the canonical shared guidance for both Codex and Claude Code. Claude's root and nested `CLAUDE.md` files import them and contain only Claude-specific execution notes.

- Keep shared project policy in `AGENTS.md`, `src/AGENTS.md`,
  `docs/AGENT_TOOLING.md`, `docs/DESIGN_PRINCIPLES.md`,
  `docs/DEVELOPMENT_LIFECYCLE.md`, `docs/SESSION_CONTRACTS.md`,
  `docs/SESSION_PLANNING.md`, `docs/SESSION_END.md`,
  `docs/PRE_PR_DESIGN_REVIEW.md`, `docs/PR_REVIEW.md`,
  `docs/VERSION_AUDIT.md`, or `docs/SELF_REVIEW.md`—never in two agent-specific
  copies. `docs/CODE_HEALTH_BASELINE.md` is living state, not policy.
- Keep `.agents/skills/` and `.claude/skills/` as runtime adapters with behavior parity, not verbatim implementations. Shared release/review rules belong in the canonical docs; tool names and execution mechanics may differ.
- Keep shared enforcement logic in `.agent-local/`; Claude and Codex hook/config wrappers may point to it using their native schemas.
- After changing any agent guide, skill, hook, or shared workflow policy, run `python3 .agent-local/check_agent_drift.py`. A failing drift check is in-scope work and blocks close-out.
- After changing global CLIs, plugins, MCP configuration, or Claude's Vercel plugin, follow `docs/AGENT_TOOLING.md`; tooling parity is part of the drift gate.
- When shared policy changes, bump the revision in `.agent-local/policy-manifest.json`, audit both skill trees, and update their `shared-policy-revision` markers.

## Graphify-first exploration

The local `graphify-out/graph.json` is the structural index for the codebase. It is code-only and untracked.

Before grepping or broadly reading source:

```bash
graphify query "<question>"
graphify explain "<symbol>"
graphify path "<A>" "<B>"
graphify affected "<symbol>"
```

Use the result to open only the relevant files and confirm exact code. Apply the same rule to any delegated code-exploration task. Hooks reinforce this behavior. The graph updates on commit/checkout; after a large refactor use `graphify update .` (or `--force` if node counts unexpectedly fall).
