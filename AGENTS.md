# LGI.tools agent guide

This file contains the repository-wide instructions that every coding agent
must follow. Keep repeatable procedures in `.agents/skills/`, detailed reference
material in `docs/`, source-only rules in `src/AGENTS.md`, and mechanical policy
in lint, tests, Fallow, and hooks.

## Required preflight

Before changing code:

1. Run `python3 .agent-local/resolve_development_state.py --pretty` and follow
   the resolver-owned directive. Read `docs/DESIGN_PRINCIPLES.md`, the current
   `docs/CODE_HEALTH_BASELINE.md`, `docs/SCRATCHPAD.md`, and the resolved
   roadmap, contract, and approved session plan.
2. Use `codegraph explore "<question>"` for an unfamiliar area or use
   `codegraph query "<symbol>"` for a known symbol before grepping. Use
   `callers`, `callees`, or `impact` when the change depends on relationships.
3. Use the global `find-docs` skill/Context7 at the beginning of every coding
   task, including routine React and framework work. Resolve installed versions
   and do not substitute remembered behavior for current documentation.
4. Read the relevant installed guide under `node_modules/next/dist/docs/`
   before changing Next.js routing, rendering, caching, or configuration.
5. Stop and raise a conflict if the request violates this guide, the resolver
   directive, or an approved plan. Do not silently widen the approved scope.

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

- `src/features/<name>/` owns product slices. Features never import peer
  features.
- `src/data/<name>/` owns shared schemas, ingest, queries, and types. Data
  slices never import features or peer data slices.
- `src/components/ui/` owns domain-neutral primitives and imports only `src/lib/`.
- `src/lib/` owns cross-cutting utilities and imports only lib.
- `src/search/`, `src/db/`, and `src/purge/` are composition layers for their
  declared concerns; `src/app/` may compose routes and pages.
- `convex/` contains regenerable live projections and sync behavior.
- `content/changelog/` and `content/devlog/` contain assembled public content.
- `docs/SCRATCHPAD.md` holds short cross-session memory. Route genuinely
  deferred, unassigned work to `docs/backlog.md`.

Cross-slice composition belongs above the participating slices. Follow the
established `src/db/sde-pipeline.ts`, `src/search/register-all.ts`, and
`src/purge/` patterns; Fallow enforces the import map and its explicit
exceptions.

For work under `src/`, follow `src/AGENTS.md`. It owns source-level rendering,
UI, styling, accessibility, and interaction rules.

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
  growth, and ESI checks enforced by `src/db/dataset-declarations.test.ts`.
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
Use one branch per independently shippable sub-version, not per session.
Multiple approved sessions may commit to that branch; open one PR only when the
sub-version is complete.

- Version features as `X.Y.N`; use `X.Y.N.M` for ordered session slices.
- Every notable sub-version, including internal tooling work, needs a matching
  `APP_VERSION` bump and changelog entry.
- Small one-offs use `rider/*` only when the resolver reports a rider directive.
  Riders never change `APP_VERSION`, changelog, or roadmap state. Work needing
  those changes belongs on the planned track.
- Branch previews are manual and on demand. They do not authorize production
  action and must be removed after use. Every deployment migrates its own
  database branch; a branch push does not create a preview automatically.
- For changed user-facing behavior, run `ux-check` and pause for the operator's
  local browser review before opening the PR.
- When asked to wrap up or ship, invoke `close-out` and follow
  `docs/workflows/close-out.md`. It owns verification, the final-session design
  gate, PR and Greptile review, conditional merge, exact production proof, and
  resolver handoff.
- `close-out` invocation authorizes only the current sub-version's squash merge
  after its documented gates pass. It does not authorize merging around a gate
  or any unrelated production action. A generic Vercel review cannot replace
  the repository's Greptile gate.
- PR titles and bodies are public. Exclude personal names, email addresses,
  account handles, machine names, local paths, browser-profile details, and
  private identifiers.
- Post-merge lifecycle reconciliation remains local and uncommitted until
  `start-session` creates the resolver-authorized next branch. Never open a
  follow-up PR or push directly to `main` merely to publish that intentional
  one-PR document lag.

Commit in plain English. Use a conventional subject under 72 characters,
lowercase after the prefix, describing the project outcome rather than file or
symbol names. Add a short body only when it helps explain what changed and why.

## Agent-policy maintenance

`AGENTS.md` and `src/AGENTS.md` are canonical shared guidance for Codex and
Claude Code. Claude's `CLAUDE.md` files import them and contain only
Claude-specific execution notes.

- Shared policy belongs in these guides or the appropriate canonical document:
  `docs/AGENT_TOOLING.md`, `docs/DESIGN_PRINCIPLES.md`,
  `docs/workflows/schema/session-contract.md`,
  `docs/workflows/schema/session-plan.md`, `docs/workflows/close-out.md`,
  `docs/PRE_PR_DESIGN_REVIEW.md`, or `docs/VERSION_AUDIT.md`.
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
