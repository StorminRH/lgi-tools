<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## What This Is

**LGI.tools** (Lo-Gang Industries) is a multi-tool web platform for Eve Online players. Features are added incrementally — each one builds on shared infrastructure without rewriting what came before.

## Tech Stack

Next.js (current — see warning above) · React 19 · TypeScript (strict) · Tailwind v4 · visx (dataviz) · Drizzle ORM · Neon (Postgres) · Convex (live reactive store) · Upstash Redis (ESI-gate rate-limit budget) · Better Auth (EVE SSO via Generic OAuth) · Vercel (hosting + preview/prod deploys) · GitHub Actions (PR test gates) · pnpm · Vitest.

## Commands

> Verify these match the current `package.json`.

- Install: `pnpm install`
- Dev: `pnpm dev`
- Build: `pnpm vercel-build` (the Vercel entry point) wraps `npx convex deploy` around the real build chain `pnpm build:vercel`: `migrate → backfill-users-if-empty → ingest-sde-if-empty → next build → assert-route-classification`. Every deploy gets its matching Convex deployment, its Neon-branch migration, the first-deploy SDE populate, and the route-classification assert.
- Test: `pnpm test`
- Typecheck: `pnpm typecheck`
- Lint: `pnpm lint`
- Dead code / unused deps: `pnpm knip`
- Verify (definition-of-done bundle — run before a commit): `pnpm verify` (= typecheck + lint + test + knip)

CI (`.github/workflows/test.yml`) gates **`typecheck`, `lint`, `test`, `knip`** on every PR. `assert:routes` (route render-mode classification) gates at build time inside `build:vercel` (the chain `vercel-build` invokes), not CI — it needs a full `next build`, so `pnpm verify` intentionally omits it.

## Local development database

`pnpm dev` runs against a **local Docker Postgres**, not Neon. The request path switches from the neon-http driver to TCP `postgres-js` when `LOCAL_DB_DRIVER=postgres-js` is set (`src/db/index.ts`) — neon-http can't reach a plain local Postgres. Required `.env.local` lines:

- `LOCAL_DB_DRIVER=postgres-js`
- `DATABASE_URL=postgres://lgi:lgi@localhost:5433/lgi_tools`

Setup from a fresh clone:

```bash
docker compose up -d        # starts the lgi-tools Postgres on :5433
pnpm db:migrate             # apply all drizzle migrations to the local DB
pnpm db:refresh-sde         # full SDE pipeline: ingest + resolve trees + seed tracked types
pnpm db:refresh-prices      # market_prices incl. buy/sell depth, fetched from ESI
```

Re-run `pnpm db:migrate` after pulling any branch that adds a migration. A stale local schema makes request-path reads throw `column/relation … does not exist`, which the page surfaces as a 500 (`/sites`, `/sites/[id]`, and the planner all 500 when the `market_prices` depth columns or the `market_history` table are missing).

Use **`db:refresh-sde`**, not `db:ingest:sde`. The latter runs only the raw ingest, whose `TRUNCATE … CASCADE` clears `blueprint_trees` + `blueprint_flat_materials` without rebuilding them — leaving the planner cascade empty ("no resolved inputs"). `db:refresh-sde` runs the whole pipeline (ingest → tree resolver → tracked-type price seed), the same `runSdePipeline` the deploy gate uses. The truncate touches only SDE tables (nothing FK-references `market_prices` or the wormhole-sites tables), so prices and the site catalogue survive a re-run.

ESI works locally: the rate limiter and ESI budget gate disable in dev when Upstash env vars are absent (`src/lib/rate-limit.ts`), so `db:refresh-prices` populates real prices + order-book depth, and the planner's on-view refresh populates `market_history` the first time you open a blueprint (its Market Score then computes on the next load). Only `industry_cost_indices` / `adjusted_prices` stay empty locally (written solely by the daily industry-indices cron), so the build-location picker shows **gross**, not net, margin — which renders without error. A local `next build` (distinct from `pnpm dev`) additionally needs `DATABASE_URL` **exported** in the shell — see the Lazy DB client invariant.

## Project Structure

- `src/features/<name>/` — self-contained feature slices: `components/` plus `schema.ts`/`queries.ts`/`types.ts` as the slice needs (not every slice has all four). Two features never import from each other.
- `src/components/ui/` — domain-agnostic UI primitives.
- `src/data/` — shared data layers (SDE, market prices, telemetry). Own ingest/schema/queries, no UI.
- `src/search/` — the slice-agnostic cross-source search engine plus the wiring manifest that composes feature/data sources into it (the `src/db/sde-pipeline.ts` composition-layer pattern; unclassified by the boundary rules). Each source still lives in its own slice — e.g. `src/data/tools/search.ts`, `src/data/commands/search.ts` — and exports a source value the manifest pulls.
- `src/lib/` — cross-cutting helpers importable from anywhere; lib itself imports only lib — never a feature, data, or ui module (*lint-enforced*: the `lib` layer in the boundaries rule). Home of the typed env accessor (`env.ts`), the typed fetch client (`api-client.ts`), `rate-limit.ts`, and `alerts.ts`.
- `src/app/api/` — route handlers.
- `CHANGELOG.md` (repo root) — user-facing changelog, parsed by `src/features/changelog/parse.ts`.
- `docs/SCRATCHPAD.md` — cross-session working memory. The whole `docs/` folder is gitignored.
- `docs/backlog.md` — deferred work with no version assigned (un-prioritized). See `docs/SESSION_END.md` for the one-home discipline vs SCRATCHPAD.
- `../LGI Tools Document Archive/` — sibling folder for shipped plan docs. Plan docs are named `VERSION_<n>_PLAN.md` (semver-style sub-versions, e.g. 3.6.1); older `PHASE_<n>_PLAN.md` docs predate the rename.

## Core Principles

Raise a conflict before proceeding if a task seems to violate one.

- **Reusable primitives over one-off components.** A wave card is a collapsible group-of-entities component fed wormhole data today — not a wormhole component. Future features reuse the same primitives with different data.
- **Minimal by default; build for the task, not for hypotheticals.** Only make changes directly requested or clearly necessary for the session's goal. Don't add features, abstractions, configurability, or defensive handling for scenarios that can't occur. A primitive earns its place when there's a real second consumer — not speculatively. Don't add docstrings, comments, or type annotations to code you didn't change; comment only where logic isn't self-evident. Validate at system boundaries (user input, external APIs), not between trusted internal code. The right amount of complexity is the minimum the current task needs. (This complements the primitives rule: extract a primitive when reuse is real, not when it's imagined.) *Machine-enforced: `knip` fails CI on unused files, exports, and dependencies (`knip.jsonc`).*
- **Static by default; isolate per-request data into `<Suspense>` holes.** The site runs on **Cache Components** (`cacheComponents: true` in `next.config.ts`): Partial Prerendering is the default, so every route prerenders a static shell and only genuinely request-time data (`searchParams`, cookies/session, per-request DB) streams in from a `<Suspense>` boundary. Routes are `○` (fully static) or `◐` (static shell + streamed holes); only `/api/*` route handlers and other per-request surfaces are `ƒ` (each justified in `scripts/route-classification.json`; asserted at build — see Commands). When you add a page or move data: cache global, rarely-changing reads with the **`'use cache'`** directive + `cacheLife`/`cacheTag` (never `unstable_cache` or `experimental.useCache`); read request data only inside a `<Suspense>` child so the shell stays static; mark a route handler that must stay dynamic with `connection()` when it touches env/secrets before the request; batch DB queries (no N+1).
- **Features don't know about each other.** Each feature is a self-contained slice. Shared logic lives in a common layer features import from — never the reverse.
- **Configuration over repetition.** Types, classes, and variants are constants defined in one place. Adding one is a config change, not a code change. Enforce with strict typing. *(`tsc --noEmit` gates CI.)*
- **Schema stays extensible.** Accommodate new content types and fields without structural rewrites.

## Architecture Invariants

Load-bearing constraints. Don't regress these without raising a conflict.

- **`src/data/` slices never import from `src/features/`.** Features import from data layers, never the reverse. Two data slices never import each other (e.g. `eve-data` ⊥ `market-prices`). Cross-slice composition lives in a layer *above* both (see `src/db/sde-pipeline.ts` for the template). *Lint-enforced* (`boundaries/dependencies` in `eslint.config.mjs` — the rule encodes the full direction map: feature → {ui, data, lib, auth shared surface}; data → {lib, auth shared surface}; ui → {lib}; lib → lib only), with two documented exceptions encoded there: auth's shared surface (`auth/types`, `auth/schema`, `auth/api-contract`) is importable by features and data slices as platform infra; and `npc-stats → eve-data` is allowed as directed layering. (Search composition lives in the unclassified `src/search/` layer — the `sde-pipeline.ts` pattern — so it needs no exception: data sources import the engine's types/matcher with no rule firing, and the manifest pulls each source from above.) Features also never import each other (same rule) — *also lint-enforced*.
- **UI primitives accept abstract `tone` props** (`green`, `red`, …). The only files that know "C5 is red" are the feature-level `*-styles.ts` mappings. The *import edge* — `src/components/ui/**` may not import features or data — is lint-enforced; whether a component is a *good* primitive stays a review judgment.
- **Postgres enums are driven from TS `as const` arrays** — one source of truth.
- **`Collapsible` is a pure `<details>`/`<summary>`** — the element owns open/closed state; no React state wrapper. `UrlSync` syncs the URL via a native `toggle` listener.
- **Lazy DB client** (`src/db/index.ts` Proxy) — connection deferred to first query, so module import stays side-effect-free. Under Cache Components the static shell prerenders cached DB reads (the header's search index + price freshness) at **build** time, so `next build` needs a reachable `DATABASE_URL` (Vercel provides it and `build:vercel` migrates first; for a local build, export it — `.env.local` alone isn't seen inside the `use cache` prerender environment).
- **Validation lives in route handlers, not queries.** Queries accept already-typed values. Every input-accepting route validates with a Zod schema; routes with no user input carry a one-line marker comment so the invariant stays grep-auditable. The schema lives in the owning slice's **`api-contract.ts`** together with the route's response types: the route imports the schema (and still does the parsing) and pins its JSON payloads with `satisfies`; clients call **`apiFetch`** (`src/lib/api-client.ts`) with the slice's endpoint object, so both sides share one wire shape and a renamed field fails `tsc` on both. New JSON routes are born with a contract. *Test-enforced* (`src/app/api/api-contracts.test.ts` — every route imports its contract) and *lint-enforced* (raw `fetch('/api/…')` is banned).
- **Server env reads go through `readEnv`/`requireEnv`** (`src/lib/env.ts`) — one validated registry, read lazily per call, never cached, never eager-at-import. Per-var schemas are equivalence-preserving (see the file header); tightening one is a behavior change needing its own review. `NODE_ENV` and `NEXT_PUBLIC_*` stay direct reads (bundler-inlined). *Lint-enforced* (`no-restricted-syntax` in `eslint.config.mjs`; test files exempt).
- **Advisory locks are session-scoped on a reserved connection**, released in `finally`. Network calls (ESI, Fuzzwork) happen with no transaction open and no connection pinned. Lock IDs are constants in the owning slice.
- **Every deploy migrates its own branch.** Production migrates production; each preview deploy migrates its per-PR Neon branch. Preview branches auto-delete on PR close.
- **The visual identity is the existing terminal/EVE aesthetic defined by `tones.ts` and the established styles.** Build within it. Do not introduce a default design palette or typeface (warm cream backgrounds, serif display fonts, terracotta accents, etc.) — a new tone or font needs explicit written justification, the same bar as a new `tones.ts` entry.

## Identity & accounts

- **One user = one human.** The Better Auth user is the main account; each linked EVE character is an account row keyed by character id — an alt of that user, never a second user. Admin is a per-user flag, not per-character.
- **EVE SSO is the only login**, wired as a Better Auth Generic OAuth provider — no email/password path.
- **Per-character tokens live encrypted in Neon** — app-layer AES-256-GCM under `EVE_TOKEN_ENCRYPTION_KEY`. Better Auth's `encryptOAuthTokens` stays OFF: the app layer owns the only encryption.
- **Convex consumes the user identity via JWT** — the client presents a Better Auth-issued token, validated against the issuer/JWKS in `convex/auth.config.ts`; Convex never holds identity of its own.

## Convex layer

Convex is the reactive store for live per-character state; the ESI gate is the one
door to CCP. The invariants below hold ambiently — **when working on Convex,
live-sync, or the ESI gate, read `docs/CONVEX.md`** for the full layer (code layout,
the sync engine's registration seam, the fetch→mutation→action flow, env split, and
the deploy form).

- **Neon is authoritative; Convex is derived and regenerable.** Strictly one-directional — no Convex → Neon write, ever; a full teardown + resync must reproduce Convex state.
- **Placement-by-temperature.** Per-character / live / watched data → Convex; global / slow / shared data → Neon + static prerender.
- **One ESI gate.** EVERY ESI call (pricing, character, and future consumers like killmails) routes through the single `esiFetch` in `src/lib/esi/` and its shared Upstash Redis budget — never a second wrapper or budget. A bypassing consumer silently burns the shared per-IP budget for everyone. *Lint-enforced.*
- **Secrets stay Neon-side.** The refresh token never leaves Neon (Convex gets only short-lived access tokens); EVE credentials never go in Convex env.
- **A new ESI scope is a deliberate, batched decision — never an incremental add.**
- **Live-data surfaces ship NO manual refresh controls** — load → auto-refresh → cadence timers while watched. `/dev/*` pages are exempt.
- **Client `useQuery` is the default** (keeps pages static); server-side `preloadQuery`/`fetchQuery` makes a route dynamic (`ƒ`) and needs justification in `scripts/route-classification.json`.

## Commit Style

Plain English. No function names, file paths, or jargon in subject or body. Describe what the change does for the project, not how the code is structured.

**Subject:** one sentence, lowercase after the colon, under 72 characters.
**Body (optional):** 3–5 bullets on what changed and why — what you'd tell a teammate over Slack.

```
feat: add API endpoints for browsing and filtering wormhole sites

- sites can now be listed, filtered by class and type, and fetched by ID
- full site detail includes waves, NPC counts, and resource values
- invalid filters return a clear error instead of an empty result
```

Avoid technical subject lines (`feat(api): /api/sites list+filter …`) and bodies full of endpoint signatures, Drizzle internals, or file paths.

## Testing

Vitest. CI runs the suite on every PR; a red suite blocks merge.

- **Add tests organically.** New testable code (pure functions, query helpers, math, `src/data/` with assertable output) gets tests in the same PR, co-located (`foo.test.ts` next to `foo.ts`).
- **Don't backfill for coverage's sake.** Untested code stays untested until something touches it.
- **Skip what doesn't earn it.** Presentational components are covered by visual review. Route handlers get tests when they hold non-trivial logic.

## Workflow

All changes go through PRs; `main` is the only deploy target. Branch per
sub-version, not per session — multiple sessions build one sub-version on a
long-lived branch, most sessions end with a commit + preview check (not a PR),
and fixes land in-branch (defer only genuinely cross-sub-version work to
`docs/backlog.md`).

**At the end of every session, read `docs/SESSION_END.md`** — it owns close-out:
commit-vs-PR, preview verification, and session-memory updates. The PR open +
Greptile loop, the merge rule, the CHANGELOG format, and plan-doc archiving live
in **`docs/PR_REVIEW.md`** (read when opening a sub-version's PR).

These hold during the autonomous run, between plan approval and close-out:
- **Diagnose before fixing.** For a bug or any uncertain behavior, find the root
  cause and show the evidence before changing anything — verify the claim,
  hypothesize, test, report. Don't suppress an error or code around a failing test.
  When the task is to *describe* a problem rather than fix it, the deliverable is the
  diagnosis: report findings and stop until asked to fix.
- **Hold to the approved plan.** Plan mode sets the scope (the prompt's out-of-scope
  list + `<hard_constraints>`); the autonomous run executes that and only that. If a
  genuine need surfaces outside it, stop and report it as a finding — don't quietly
  absorb it (this is the one-thing-per-session rule, enforced during the run).
- **Show evidence, not assertions.** Prove a step with the command and its output
  (the test result, the build, the query) rather than "done" or "should work." If a
  step was skipped or failed, say so plainly with the output.
- **Ask before destructive or irreversible actions** — dropping tables, force-push,
  deleting files, anything touching production or shared state.

## CSP: never use inline `style="..."` attributes

Production CSP is `script-src 'self' 'unsafe-inline'; style-src 'self'` — no nonce, and don't reintroduce one (a nonce-based CSP blocks static rendering). `script-src` carries `'unsafe-inline'` for the inline `self.__next_f.push(...)` RSC flight scripts App Router emits; `style-src` stays `'self'`, which admits the external stylesheet but NOT inline `style="..."`. So any JSX `style={{...}}` renders as a `style="..."` attribute and is silently dropped on first paint (it "self-heals" on client navigation because hydration reapplies it via JS, which CSP doesn't gate). *Lint-enforced*: a JSX `style` attribute fails `pnpm lint` (`no-restricted-syntax` in `eslint.config.mjs`). The same rule bans `dangerouslySetInnerHTML` and raw `innerHTML`/`outerHTML` writes (across `.ts` and `.tsx`): with `'unsafe-inline'` on `script-src`, an unescaped HTML sink is an XSS vector — render text through JSX (auto-escaped) or build DOM with `textContent`/`createElement` instead.

**Fixes:**
- Static values → Tailwind arbitrary values: `className="grid-cols-[repeat(auto-fill,minmax(270px,1fr))]"`.
- Runtime-dynamic values (e.g. a progress bar width) → define a CSS class that reads a custom property, then set the variable via `useEffect` + `ref.current.style.setProperty(...)` after mount. JS-applied styles aren't CSP-gated.

## Color tokens

Raw hex colors belong in the token layer, never hardcoded at call sites. Define a color once as a `--color-*` custom property in the `@theme` block of `globals.css` (surfaced as `bg-…`/`text-…`/`border-…`/`fill-…` utilities), or in `tones.ts` for the SVG fills/strokes that read `toneHex`. *Lint-enforced*: `no-restricted-syntax` (`eslint.config.mjs`) bans a hex literal in a Tailwind arbitrary value (`bg-[#1e2c3a]`, `shadow-[0_0_4px_#dd4444]`), in an interpolated class string, and as a whole-string constant (an SVG `fill="#0d0f14"`). Exempt: `src/components/ui/tones.ts` (the sanctioned home for raw hex) and the `src/app/dev`/`src/app/preview` sandboxes (off-palette design scratchpads). rgba is out of scope — the rule bans hex only.

## CLI Tools

Authenticated CLIs are the tooling of record — the equivalent MCP connectors were removed (CLI-first by preference). Context7 is a standing per-session step (below); the Vercel and Neon CLIs you reach for when they save one.

- **Vercel CLI** (`vercel`) — deploys, env, and read-side runtime introspection. `vercel logs <deployment>` / `vercel inspect` show the path + status of recent requests — the cleanest way to confirm a handler ran without peeking at the DB. `vercel env` manages env vars; `vercel env pull --environment=production` pulls prod values locally.
- **Neon CLI** (`neonctl`) — your Neon projects, branches, and connection strings. There's no run-SQL subcommand — pair it with psql: `psql "$(neonctl connection-string <branch>)"`. **Production reads** go through `vercel env pull --environment=production` + local `psql` (LGI's prod DB lives in the Vercel-managed Neon org), or infer state from `vercel logs`.
- **Context7** (`ctx7`, run via `npx ctx7@latest`) — current library docs. A global skill (`~/.claude/skills/find-docs`) and rule (`~/.claude/rules/context7.md`) already route any library question here. **Use it during planning (plan mode) on every session** to confirm current API shapes before proposing an approach — especially Next.js, Drizzle, jose, and Zod, since training data lags the versions this codebase runs (Next 16.2.6 / Cache Components, Zod 4, jose v6). Resolve a name with `npx ctx7@latest library "<Name>" "<question>"`, then fetch with `npx ctx7@latest docs <id> "<question>"`. The cost of a stale assumption is a whole session built on the wrong API — verify here rather than asserting from memory, and cite what you found in the plan.
