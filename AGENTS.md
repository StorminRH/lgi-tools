# LGI.tools agent guide

This file contains the repository-wide instructions that every coding agent
must follow. Keep shared executable procedures in `docs/workflows/`, exact
artifact forms in `docs/workflows/schema/`, runtime adapters in the paired skill
trees, source-only rules in `src/AGENTS.md`, and mechanical policy in lint,
tests, Fallow, and hooks.

Precedence is: the operator's explicit current instruction and approved scope;
the nearest applicable `AGENTS.md`; the invoked canonical procedure under
`docs/workflows/`; the owning artifact schema; then reference and state
documents. Mechanical gates remain authoritative for the behavior they check.
Stop on a real conflict instead of blending two owners.

## Required preflight

Before changing code:

1. Read the current `docs/CODE_HEALTH_BASELINE.md` and `docs/SCRATCHPAD.md`.
   When work is scoped to a roadmap, contract, approved plan, or canonical
   procedure, read those owning artifacts too. Use
   `docs/workflows/pre-pr-design-review.md` for design judgment.
2. Use `codegraph explore "<question>"` for an unfamiliar area or use
   `codegraph query "<symbol>"` for a known symbol before grepping. Use
   `callers`, `callees`, or `impact` when the change depends on relationships.
3. Use the global `find-docs` skill/Context7 at the beginning of every coding
   task, including routine React and framework work. Resolve installed versions
   and do not substitute remembered behavior for current documentation.
4. Read the relevant installed guide under `node_modules/next/dist/docs/`
   before changing Next.js routing, rendering, caching, or configuration.
5. Stop and raise a conflict if the request violates this guide or an approved
   plan. Do not silently widen the approved scope.

Ordinary task-scoped work — anything that begins from a direct request rather
than through `start-session` — must not run the lifecycle resolver
(`.agent-local/resolve_development_state.py`) or reconcile roadmap, contract, or
session-plan state. The active version plan is one workstream, not a
repository-wide lock. The resolver answers only "what is the next action in the
active version plan?"; it is opt-in and owned by the lifecycle skills. Only
`start-session` and the lifecycle workflows it dispatches run it. Nothing infers
lifecycle participation from a branch name, `APP_VERSION`, or the existence of an
active roadmap.

LGI.tools is an incremental EVE Online multi-tool platform. Extend existing
slices and shared infrastructure without rewriting unrelated working systems.
The current stack is Next.js 16.2.6 with Cache Components, React 19, strict
TypeScript, Tailwind v4, Drizzle ORM, Neon Postgres, Convex, Better Auth,
Upstash Redis, Vercel, pnpm, Vitest, and visx.

## Commands and definition of done

Confirm script definitions against `package.json` when they may have changed.

- Development: `pnpm dev`; complete local stack: `pnpm dev:all`
- Focused tests: `pnpm test <arguments>`
- Typecheck: `pnpm typecheck`; lint: `pnpm lint`
- Coverage: `pnpm test:coverage`; static analysis: `pnpm fallow`
- Sole definition of done: `pnpm verify`

`pnpm verify` runs typecheck, zero-warning lint, one coverage-enabled Vitest
suite, and coverage-backed Fallow. Run it before committing. During close-out,
use the single `origin/main`-pinned checkpoint in
`docs/workflows/close-out.md`; do not create a second coverage/Fallow cycle.
CI additionally runs `pnpm assert:routes-present`.

Never run `pnpm build`, `next build`, `pnpm vercel-build`, or another
production-mode build locally or before merge. Only Vercel may run the
production build, after the change reaches `main`.

Fallow is a gate. Do not add waivers or baseline entries for dead code, unused
exports or dependencies, boundary violations, duplication, or complexity.
Simplify the change or add meaningful behavioral coverage. Its universal caps
are cyclomatic 20, cognitive 15, and CRAP 30; `pnpm fallow:health` is report
only. When validating TypeScript strictness, use
`npx tsc --noEmit --incremental false` so cached diagnostics cannot hide
failures.

## Repository boundaries

- Every production source file belongs to a named, deny-by-default Fallow zone.
  [`docs/architecture-boundaries.md`](docs/architecture-boundaries.md) is the
  single prose owner of zone ownership, allowed dependency directions, and
  narrow runtime exemptions; `.fallowrc.json` is the mechanical authority and
  carries no cross-layer exception entries.
- `src/features/<name>/` owns product slices and never imports peer features.
  `src/data/<name>/` owns reusable schemas, ingest, queries, and types and never
  imports features or a peer data slice other than the shared
  `src/data/eve-data/` reference core.
- `src/components/ui/` owns domain-neutral primitives; the root of
  `src/components/` owns reusable leaf presentation; and
  `src/components/composition/` owns app-shell and account UI composition.
- `src/composition/` owns server-side cross-slice orchestration.
  `src/platform/` owns reusable authentication, ESI, owner-sync, search, purge,
  and page-settings capabilities. `src/transport/` owns transport helpers.
- `src/app/` owns routes and page composition. `src/db/` owns database
  foundations; `src/esi-datasets/` owns test-only cross-slice registry checks;
  `src/lib/` and `src/config/` own cross-cutting leaves and configuration.
- `convex/` owns regenerable live projections and sync behavior.
  `src/proxy*.ts` and `src/instrumentation*.ts` are process-level runtime entry
  points.
- `content/changelog/` and `content/devlog/` contain assembled public content.
- `docs/SCRATCHPAD.md` holds short cross-session memory. Route genuinely
  deferred, unassigned work to `docs/backlog.md`.

Cross-slice composition belongs above the participating slices. Follow the
established `src/composition/pipelines/sde-pipeline.ts`,
`src/composition/search/register-all.ts`, and
`src/composition/purge/orchestrator.ts` patterns. Fallow rejects upward edges,
peer-slice edges, and unclassified source files.

Protect established deep modules whose small interfaces hide cohesive
complexity: the EVE tree resolver, Convex sync engine, shared ESI/API/env gates,
and the industry planner's pure-logic pairs. A long cohesive owner is not a
reason to create shallow helpers; split only when callers or change axes differ.

For work under `src/`, follow `src/AGENTS.md`. It owns source-level rendering,
UI, styling, accessibility, interaction, wrapper selection, and route
registration rules.

## Engineering invariants

- Implement only approved work and changes clearly required by it. Diagnose
  uncertain behavior before fixing it; if asked only to diagnose, stop after
  reporting evidence.
- Prefer existing primitives and configuration. Extract shared code only for a
  real second consumer. Do not add speculative abstraction, configurability,
  impossible-state defenses, or commentary on untouched code.
- Validate user input, route payloads, environment variables, and external API
  data at their boundaries. Do not repeat validation between trusted layers.
- Keep types, variants, classes, and enums in one authoritative configuration.
  Batch database work and do not introduce N+1 queries.
- Use a non-null assertion only for a locally provable by-construction
  invariant and explain it with a one-line comment.
- Every exported production surface in `src/` and `convex/` needs a concise
  `/** */` contract comment. Use TSDoc tags only when they add information.
  Source `TODO` and `FIXME` comments are not a backlog.
- Add tests for changed testable behavior, not implementation structure or
  coverage numbers. Co-locate Vitest files. Real-Postgres suites use
  `*.db.test.ts` and `createDbTestHarness`; direct `postgres()` construction or
  embedded connection strings in DB suites are forbidden.
- Report command output or equivalent evidence. State when a check was skipped
  or failed. Ask before destructive, irreversible, shared-state, force-push,
  deployment, promotion, rollback, or production actions.

## Data, API, and identity invariants

- TypeScript `as const` arrays are authoritative for Postgres enums. The lazy
  DB proxy in `src/db/index.ts` remains import-side-effect-free.
- Session advisory locks use a reserved direct, unpooled connection and release
  in `finally`; never hold a transaction or pooled connection across network
  calls.
- Every user- or character-keyed Neon table needs a purge contributor or an
  explicit retained exemption. Follow the declaration, key-shape, purge,
  growth, and ESI checks enforced by
  `src/esi-datasets/dataset-declarations.test.ts`.
- Validate JSON bodies in route handlers with the owning slice's Zod
  `api-contract.ts`. Keep response types and endpoint definitions there, and
  use `apiFetch` from clients. Raw `fetch('/api/...')` is forbidden.
- Routes without a JSON or form body declare exactly one own-line marker:
  `// input: none` or `// input: query`. Body-consuming routes carry neither.
- Read server environment through `readEnv` or `requireEnv`; direct access is
  limited to `NODE_ENV` and `NEXT_PUBLIC_*`.
- Every EVE ESI request uses `esiFetch` and `esiUrl` through the shared Redis
  budget. Do not create another wrapper or embed the ESI host elsewhere.
- One Better Auth user represents one human. Linked EVE characters are account
  rows; admin authority belongs to the user. EVE SSO is the only login path.
- Application AES-256-GCM encryption protects EVE tokens in Neon. Better Auth
  `encryptOAuthTokens` remains disabled.
- Neon is authoritative. Convex trusts Better Auth JWT/JWKS identity, remains
  fully regenerable, and never writes to Neon.
- Place ESI data by cache time: at-most-two-minute and collaborative live state
  may use Convex; slower personal datasets belong in Neon with stale-gated
  refresh. Store timers as absolute end timestamps.
- Read `docs/CONVEX.md` before changing Convex, live sync, the ESI gate, or its
  cost and scaling behavior. New ESI scopes require an explicit batched
  decision.

## Local development invariants

`pnpm dev` starts only Next.js and expects the configured local Docker Postgres.
Use `pnpm dev:all` for Docker Postgres, Next on `:3000`, and local Convex on
`:3210`.

- Run `pnpm db:migrate` after pulling migrations.
- Use `pnpm db:refresh-sde`, never raw `pnpm db:ingest:sde`, for a usable
  planner dataset. The raw ingest does not rebuild resolved blueprint tables.
- Upstash and local industry indices may be absent in local development.
- Keep `BETTER_AUTH_URL`, Convex `AUTH_ISSUER_URL`, and the EVE callback on the
  same origin. Changing the local port requires changing all three.

## Delivery and authorization

All changes ship through PRs to `main`, the only automatic deployment target.
`close-out` is the sole merge-to-production pipeline. A canonical procedure may
explicitly prepare and review an open PR while withholding merge authority; the
change is not shipped until the operator later invokes `close-out` on that same
branch and PR. Two tracks feed the delivery pipeline:

- **Ordinary/out-of-band work** begins from a direct request. It never consults
  the lifecycle resolver, never reconciles roadmap or session-plan state, and
  never runs the release-consistency checker. It does not bump `APP_VERSION` or
  publish a version heading; instead it records one hidden pending changelog
  fragment in `content/changelog/pending/` (see
  `docs/workflows/schema/changelog-pending.md`). That fragment is ordinary
  close-out's only durable lifecycle record.
- **Planned lifecycle work** begins only through `start-session`, which owns the
  deterministic `lifecycle/<sub-version>` branch and resolver dispatch. Use one
  such branch per sub-version; it carries the sub-version's planning and every
  session until the single sub-version PR merges, and multiple approved sessions
  may commit to it before that PR opens. Version features as `X.Y.N`; use
  `X.Y.N.M` for ordered session slices. The final session's PR publishes the
  planned version, bumps `APP_VERSION`, and absorbs the pending fragments present
  at its cutoff into the new changelog entry.
Master plans, session contracts, and session plans are frozen prompts: each is
the starting input for its stage, its claims are verified against live code
when consumed, in-session operator direction supersedes its text, and it is
never edited after its stage completes. The session as-built record
(`docs/workflows/schema/session-as-built.md`) is the record of what a session
actually delivered; close-out authors it at session close, the resolver
requires a valid record for every completed session, and it archives with the
version bundle. Planning reads live code first, then prior as-built records,
then the prompt chain.

- Branch previews are manual and on demand. They do not authorize production
  action and must be removed after use. Every deployment migrates its own
  database branch; a branch push does not create a preview automatically.
- For changed user-facing behavior, run `ux-check` and pause for the operator's
  local browser review before opening the PR.
- When asked to wrap up or ship, invoke `close-out` and follow
  `docs/workflows/close-out.md`. It runs the same delivery pipeline in ordinary
  or planned mode; planned mode is selected only by the resolver directive
  `start-session` passes it, and the absence of a directive is normal, not an
  error. It owns verification, the final-session design gate, PR and Greptile
  review, conditional merge, and exact production proof.
- `close-out` invocation authorizes only the current change's squash merge after
  its documented gates pass. It does not authorize merging around a gate or any
  unrelated production action. A generic Vercel review cannot replace the
  repository's Greptile gate.
- PR titles and bodies are public. Exclude personal names, email addresses,
  account handles, machine names, local paths, browser-profile details, and
  private identifiers.
- A planned final PR already contains the state that must exist once it merges:
  the final session marked `Execution status: Complete`, its as-built record
  carrying the PR number, the delivered sub-version's terminal roadmap row, the
  matching `APP_VERSION`, and the published changelog entry with its absorbed
  fragments. There is no uncommitted
  post-merge reconciliation and no follow-up lifecycle-only PR. After a merge,
  close-out updates its local view from `origin/main`, and the next
  `start-session` resolves the next action from that already-truthful state.

Commit in plain English. Use a conventional subject under 72 characters,
lowercase after the prefix, describing the project outcome rather than file or
symbol names. Add a short body only when it helps explain what changed and why.

## Agent-policy maintenance

`AGENTS.md` and `src/AGENTS.md` are canonical shared guidance for Codex and
Claude Code. Claude's `CLAUDE.md` files import them and contain only
Claude-specific execution notes.

- Shared policy belongs in these guides or the appropriate canonical document:
  `docs/AGENT_TOOLING.md`, an owning procedure under `docs/workflows/`, or an
  exact artifact form under `docs/workflows/schema/`.
  `docs/CODE_HEALTH_BASELINE.md` is living state, not policy.
- Keep `.agents/skills/` and `.claude/skills/` as runtime adapters with behavior
  parity, not verbatim implementations. Keep shared enforcement in
  `.agent-local/`.
- After changing a guide, skill, hook, or shared workflow policy, re-review all
  affected skills in both trees, then run
  `python3 .agent-local/reconcile_skill_ledger.py` and
  `python3 .agent-local/check_agent_drift.py`. A failing drift check blocks
  close-out.
- After changing global CLIs, plugins, MCP configuration, or Claude's Vercel
  plugin, follow `docs/AGENT_TOOLING.md`.
