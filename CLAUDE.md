<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## What This Is

**LGI.tools** (Lo-Gang Industries) is a multi-tool web platform for Eve Online players. Features are added incrementally — each one builds on shared infrastructure without rewriting what came before.

## Tech Stack

Next.js (current — see warning above) · TypeScript (strict) · Drizzle ORM · Neon (Postgres) · Vercel (hosting + CI) · pnpm · Vitest.

## Commands

> Verify these match the current `package.json`.

- Install: `pnpm install`
- Dev: `pnpm dev`
- Build: `pnpm vercel-build` is the Vercel entry point — a thin wrapper that runs the Convex deploy, which in turn invokes the real build chain `pnpm build:vercel` (`migrate → backfill-users-if-empty → ingest-sde-if-empty → next build → assert-route-classification`). So the Neon-branch migration, the first-deploy SDE auto-populate, and the route-classification assert all live in `build:vercel`; `vercel-build` just wraps it in `npx convex deploy` so every deploy gets its matching Convex deployment.
- Test: `pnpm test`
- Typecheck: `pnpm typecheck`
- Lint: `pnpm lint`
- Dead code / unused deps: `pnpm knip`
- Verify (definition-of-done bundle — run before a commit): `pnpm verify` (= typecheck + lint + test + knip)

CI (`.github/workflows/test.yml`) gates **`typecheck`, `lint`, `test`, `knip`** on every PR. `assert:routes` (route render-mode classification) gates at build time inside `build:vercel` (the chain `vercel-build` invokes), not CI — it needs a full `next build`, so `pnpm verify` intentionally omits it.

## Local development database

`next dev` runs against a **local Docker Postgres**, not Neon — the request path switches from the neon-http driver to TCP `postgres-js` when `LOCAL_DB_DRIVER=postgres-js` is set (`src/db/index.ts`; neon-http can't reach a plain local Postgres). Required `.env.local` lines:

- `LOCAL_DB_DRIVER=postgres-js`
- `DATABASE_URL=postgres://lgi:lgi@localhost:5433/lgi_tools`

Setup from a fresh clone — and **re-run `db:migrate` after pulling any branch that adds a migration**:

```bash
docker compose up -d        # starts lgi-tools-postgres on :5433
pnpm db:migrate             # apply all drizzle migrations to the local DB
pnpm db:refresh-sde         # full SDE pipeline: ingest + RESOLVE trees + seed tracked types
pnpm db:refresh-prices      # market_prices incl. buy_depth/sell_depth, fetched from ESI
```

Use **`db:refresh-sde`**, not `db:ingest:sde`. The latter runs only the raw ingest, whose `TRUNCATE … CASCADE` clears `blueprint_trees` + `blueprint_flat_materials` but does **not** rebuild them — leaving the planner cascade empty ("no resolved inputs"). `db:refresh-sde` runs the whole pipeline (ingest → tree resolver → tracked-type price seed), the same `runSdePipeline` the deploy gate uses. The truncate touches only SDE tables (nothing FK-references `market_prices` or the wormhole-sites tables), so prices and the site catalogue survive a re-run.

A stale local schema makes request-path reads throw `column/relation … does not exist`, which the page surfaces as a **500** — the failure this flow fixes (e.g. `/sites`, `/sites/[id]`, and the planner all 500 when the `market_prices` depth columns or `market_history` table are missing). **Re-run `db:migrate` after pulling any branch that adds a migration.**

ESI works locally: the rate limiter and ESI budget gate **disable in dev** when Upstash env vars are absent (`src/lib/rate-limit.ts`), so `db:refresh-prices` populates real prices + order-book depth, and the planner's on-view refresh populates `market_history` the first time you open a blueprint (its Market Score then computes on the next load). The only tables that stay empty locally are `industry_cost_indices` / `adjusted_prices` (written solely by the daily industry-indices cron), so the build-location picker shows **gross**, not net, margin — which renders without error. (A local `next build`, distinct from `next dev`, additionally needs `DATABASE_URL` **exported** in the shell — see the Lazy DB client invariant.)

## Project Structure

- `src/features/<name>/` — self-contained feature slices: `components/` plus `schema.ts`/`queries.ts`/`types.ts` as the slice needs (not every slice has all four). Two features never import from each other.
- `src/components/ui/` — domain-agnostic UI primitives.
- `src/data/` — shared data layers (SDE, market prices, telemetry). Own ingest/schema/queries, no UI.
- `src/search/` — the slice-agnostic cross-source search engine plus the wiring manifest that composes feature/data sources into it (the `src/db/sde-pipeline.ts` composition-layer pattern; unclassified by the boundary rules). Each source still lives in its own slice — e.g. `src/data/tools/search.ts`, `src/data/commands/search.ts` — and exports a source value the manifest pulls.
- `src/lib/` — cross-cutting helpers importable from anywhere; lib itself imports only lib — never a feature, data, or ui module (*lint-enforced*: the `lib` layer in the boundaries rule). Home of the two invariant-backed modules from 3.4.T — the typed env accessor (`env.ts`) and the typed fetch client (`api-client.ts`) — alongside `rate-limit.ts` and `alerts.ts`.
- `src/app/api/` — route handlers.
- `CHANGELOG.md` (repo root) — user-facing changelog, parsed by `src/features/changelog/parse.ts`.
- `docs/SCRATCHPAD.md` — cross-session working memory. The whole `docs/` folder is gitignored.
- `docs/backlog.md` — deferred work with no version assigned (un-prioritized). See Session Maintenance for the one-home discipline vs SCRATCHPAD.
- `../LGI Tools Document Archive/` — sibling folder for shipped plan docs.

## Core Principles

Raise a conflict before proceeding if a task seems to violate one.

- **Reusable primitives over one-off components.** A wave card is a collapsible group-of-entities component fed wormhole data today — not a wormhole component. Future features reuse the same primitives with different data.
- **Minimal by default; build for the task, not for hypotheticals.** Only make changes directly requested or clearly necessary for the session's goal. Don't add features, abstractions, configurability, or defensive handling for scenarios that can't occur. A primitive earns its place when there's a real second consumer — not speculatively. Don't add docstrings, comments, or type annotations to code you didn't change; comment only where logic isn't self-evident. Validate at system boundaries (user input, external APIs), not between trusted internal code. The right amount of complexity is the minimum the current task needs. (This complements the primitives rule: extract a primitive when reuse is real, not when it's imagined.) *Now machine-enforced: `knip` fails CI on unused files, exports, and dependencies (`knip.jsonc`).*
- **Static by default; isolate per-request data into `<Suspense>` holes.** As of 3.0.4.9 the site runs on **Cache Components** (`cacheComponents: true` in `next.config.ts`): Partial Prerendering is the default, so every route prerenders a static shell and only genuinely request-time data (`searchParams`, cookies/session, per-request DB) streams in from a `<Suspense>` boundary. The conversion track made this reachable — 3.0.4.6 retired the nonce CSP (the origin-locked policy in the CSP section admits the inline RSC flight scripts a baked page needs), 3.0.4.7 moved the session read client-side, and 3.0.4.8+3.0.4.9 cached the header reads and reclaimed static. Pages are now `○` (fully static) or `◐` (static shell + streamed holes); only `/api/*` route handlers and other per-request surfaces are `ƒ` (each justified in `scripts/route-classification.json`; asserted at build — see Commands). When you add a page or move data: cache global, rarely-changing reads with the stable **`'use cache'`** directive + `cacheLife`/`cacheTag` (never deprecated `unstable_cache` or `experimental.useCache`); read request data only inside a `<Suspense>` child so the shell stays static; mark a route handler that must stay dynamic with `connection()` when it touches env/secrets before the request; batch DB queries (no N+1). The earlier strict-nonce-CSP negative result is preserved in `../LGI Tools Document Archive/VERSION_3.0.4.3_CSP_DECISION.md` for history — it is no longer the operative constraint, and the nonce must not return without re-checking this whole track.
- **Features don't know about each other.** Each feature is a self-contained slice. Shared logic lives in a common layer features import from — never the reverse.
- **Configuration over repetition.** Types, classes, and variants are constants defined in one place. Adding one is a config change, not a code change. Enforce with strict typing. *(`tsc --noEmit` now gates CI.)*
- **Schema stays extensible.** Accommodate new content types and fields without structural rewrites.

## Architecture Invariants

Load-bearing constraints. Don't regress these without raising a conflict.

- **`src/data/` slices never import from `src/features/`.** Features import from data layers, never the reverse. Two data slices never import each other (e.g. `eve-data` ⊥ `market-prices`). Cross-slice composition lives in a layer *above* both (see `src/db/sde-pipeline.ts` for the template). *Lint-enforced* (`boundaries/dependencies` in `eslint.config.mjs` — the rule encodes the full direction map: feature → {ui, data, lib, auth shared surface}; data → {lib, auth shared surface}; ui → {lib}; lib → lib only), with two documented exceptions encoded there: auth's shared surface (`auth/types`, `auth/schema`, `auth/api-contract`) is importable by features and data slices as platform infra; and `npc-stats → eve-data` is allowed as directed layering. (Search composition was lifted into the unclassified `src/search/` layer in 3.3.7 — the `sde-pipeline.ts` pattern — so it no longer needs an exception: data sources import the engine's types/matcher with no rule firing, and the manifest pulls each source from above.) Features also never import each other (same rule) — *also lint-enforced*.
- **UI primitives accept abstract `tone` props** (`green`, `red`, …). The only files that know "C5 is red" are the feature-level `*-styles.ts` mappings. The *import edge* — `src/components/ui/**` may not import features or data — is lint-enforced; whether a component is a *good* primitive stays a review judgment.
- **Postgres enums are driven from TS `as const` arrays** — one source of truth.
- **`Collapsible` is a pure `<details>`/`<summary>`** — the element owns open/closed state; no React state wrapper. `UrlSync` syncs the URL via a native `toggle` listener.
- **Lazy DB client** (`src/db/index.ts` Proxy) — connection deferred to first query, so module import stays side-effect-free. Note since 3.0.4.9: under Cache Components the static shell prerenders cached DB reads (the header's search index + price freshness) at **build** time, so `next build` now needs a reachable `DATABASE_URL` (Vercel provides it and `build:vercel` migrates first; for a local build, export it — `.env.local` alone isn't seen inside the `use cache` prerender environment).
- **Validation lives in route handlers, not queries.** Queries accept already-typed values. Every input-accepting route validates with a Zod schema; routes with no user input carry a one-line marker comment so the invariant stays grep-auditable. Since 3.4.T the schema lives in the owning slice's **`api-contract.ts`** together with the route's response types: the route imports the schema (and still does the parsing) and pins its JSON payloads with `satisfies`; clients call **`apiFetch`** (`src/lib/api-client.ts`) with the slice's endpoint object, so both sides share one wire shape and a renamed field fails `tsc` on both. New JSON routes are born with a contract. *Test-enforced* (`src/app/api/api-contracts.test.ts` — every route imports its contract) and *lint-enforced* (raw `fetch('/api/…')` is banned).
- **Server env reads go through `readEnv`/`requireEnv`** (`src/lib/env.ts`) — one validated registry, read lazily per call, never cached, never eager-at-import. Per-var schemas are equivalence-preserving (see the file header); tightening one is a behavior change needing its own review. `NODE_ENV` and `NEXT_PUBLIC_*` stay direct reads (bundler-inlined). *Lint-enforced* (`no-restricted-syntax` in `eslint.config.mjs`; test files exempt).
- **Advisory locks are session-scoped on a reserved connection**, released in `finally`. Network calls (ESI, Fuzzwork) happen with no transaction open and no connection pinned. Lock IDs are constants in the owning slice.
- **Every deploy migrates its own branch.** Production migrates production; each preview deploy migrates its per-PR Neon branch. Preview branches auto-delete on PR close.
- **The visual identity is the existing terminal/EVE aesthetic defined by `tones.ts` and the established styles.** Build within it. Do not introduce a default design palette or typeface (warm cream backgrounds, serif display fonts, terracotta accents, etc.) — a new tone or font needs explicit written justification, the same bar as a new `tones.ts` entry.

## Identity & accounts

- **One user = one human.** The Better Auth user is the main account; each linked EVE character (3.4.2) is an account row keyed by character id — an alt of that user, never a second user. Admin is a per-user flag, not per-character.
- **EVE SSO is the only login**, wired as a Better Auth Generic OAuth provider — no email/password path.
- **Per-character tokens live encrypted in Neon** — app-layer AES-256-GCM under `EVE_TOKEN_ENCRYPTION_KEY` (3.4.1). Better Auth's `encryptOAuthTokens` stays OFF: the app layer owns the only encryption.
- **Convex consumes the user identity via JWT** — the client presents a Better Auth-issued token, validated against the issuer/JWKS in `convex/auth.config.ts`; Convex never holds identity of its own.

## Convex layer

The live per-character platform (3.4.3–3.4.10): Convex is the reactive store, the ESI gate is the one door to CCP, the sync engine is the one scheduler. Same bar as the invariants above — don't regress without raising a conflict.

- **Neon is authoritative; Convex is derived and regenerable.** Strictly one-directional: no Convex → Neon write, ever. Enrich Convex docs by reading Neon, never by replicating its data — the stores share no schema; only `userId`/`characterId` are mirrored as join keys. A full teardown + resync must reproduce Convex state (proven in 3.4.7).
- **Placement-by-temperature.** Per-character / live / watched data → Convex; global / slow / shared data → Neon + static prerender. The data's source (ESI vs SDE) never decides the store — its temperature does.
- **Code layout.** `convex/` holds the functions; `src/data/convex/` is the data slice owning the browser client + generated `api`; the account and tracker UIs are ordinary feature slices.
- **Fetch is action-only.** Convex queries/mutations can't `fetch`; the flow is client → mutation → action → ONE batched apply mutation → reactive query. No client → action calls; writes are batched, never per-row. The sync path runs on the DEFAULT Convex runtime (no `"use node"`) — never reintroduce the `AbortSignal.timeout`/`AbortSignal.any` statics under the ESI gate's import chain; that runtime lacks them (3.4.7).
- **ALL live/reactive sync flows through THE engine** (`convex/engine.ts`, 3.4.9; subject = dataset × userId). Registering a consumer is the 4-step seam in the engine's header: dataset + cadence floor + token group in `src/lib/sync-engine.ts`, a `syncRef`, a generation-guarded apply that stamps results onto the subject row, and the `useSyncSubject` hook (`src/data/convex/`). A subject refreshes only while viewed in a visible tab — no feature ships its own presence tracker, scheduler policy, or always-on background sync. Three trigger classes: while-watched (the scan), on-view (mount/visible heartbeats dispatching when stale), on-schedule (feature-local timestamp flips like the jobs tracker's `markJobReady` — the engine schedules refreshes, never flips). Durable components: Rate Limiter + Workpool (whose retry semantics absorbed the Action Retrier in 3.4.9 — don't reintroduce it). Scheduling staggers off the stored ESI cache windows, sends the proper User-Agent, and respects Retry-After/420. Errored subjects self-retry at the cadence floor — including a first run that fails terminally: a failed run always re-arms the scan at the floor (3.4.10).
- **Live-data surfaces ship NO manual refresh controls** (operator policy, 2026-06-12). Load the page → data refreshes automatically (mount/visible beats dispatch when stale) → cadence timers take over while watched; an errored subject recovers at the cadence floor or instantly on leave-and-return. `/dev/*` pages are exempt operator tools.
- **One ESI gate** (a 3.3.x decision; promoted to shared infra in 3.4.4–3.4.5). EVERY ESI call — pricing and character alike, future consumers including killmails — routes through the single `esiFetch` in `src/lib/esi/`, whose budget lives in the shared Upstash Redis scoreboard: both CCP limit systems (legacy error limit + token buckets), fail-closed, refusal at ~80% of the error budget spent, ETag/304 reuse, Expires + rate headers exposed to callers, runtime-portable. Per-character held ETags live in the owning feature's Convex docs — never the gate's shared cache. Never a second wrapper or budget; the Fuzzwork fallback stays inside `market-prices`. A bypassing consumer doesn't fail — it silently burns the shared per-IP budget for everyone. *Lint-enforced* (the ESI host literal is banned outside the slice).
- **A new scope is a deliberate, batched decision — never an incremental add** (3.4.6, amended). The 11-scope superset was the final forced re-auth. The ESI spec's OAuth2 enumeration is the authoritative scope list — SSO publishes no `scopes_supported`.
- **The refresh token never leaves Neon.** Convex receives only short-lived per-character access tokens, vended by the service-authed Neon-side endpoint.
- **Env split.** The service secret (`CONVEX_SERVICE_SECRET`) lives in Convex env — EVE credentials never do; identity and token secrets stay on the Neon side. `CONVEX_DEPLOY_KEY` lives in Vercel, and deploys use the shipped form `npx convex deploy --cmd 'pnpm build:vercel' --cmd-url-env-var-name NEXT_PUBLIC_CONVEX_URL` — every preview gets its own isolated Convex deployment.
- **CSP: the Convex deployment origin appears in `connect-src` only** — https + wss, the exact per-deployment origin, never a `*.convex.cloud` wildcard (`src/proxy.ts`, 3.4.3). Nothing else in the policy changes; inline styles stay banned.
- **Client `useQuery` is the default** — it keeps pages static. Server-side `preloadQuery`/`fetchQuery` makes a route dynamic (`ƒ`) and needs its justification in `scripts/route-classification.json`.

## Session Maintenance

**SCRATCHPAD.md** — after every session, update `docs/SCRATCHPAD.md` (gitignored). It's the agent's session-to-session memory: discoveries made *during* a session, cross-cutting bugs, gotchas, and ongoing tooling/status notes — not forward plans (those live in the version docs and prompts), and not deferred work (that goes to `backlog.md`, below). The file documents its own upkeep rules at the bottom; follow them so it stays skimmable.

**backlog.md** — `docs/backlog.md` (gitignored) is the home for **deferred work**: scope cuts, declined or deferred audit findings, future sub-versions, and pending verifications. It is **un-prioritized — a backlog, not a plan**: no sequencing, no version numbers, no commitments. Each entry is *what / why-deferred / rough size / dependency-or-trigger*, grouped by area. The discipline that keeps it useful is **one home**: when work is deferred during a session, write it to `backlog.md` and **delete it from SCRATCHPAD** — never let the same item live in both. Pull an item into a real version when its trigger fires; delete it from `backlog.md` when it ships. (Deferred *work* migrates here; ongoing tooling/status notes stay in SCRATCHPAD or this file.)

**CHANGELOG.md** — after every session, decide whether the work is user-facing. Only log features and significant platform changes; skip internal cleanup, CI, refactors, and intra-session iteration. The test: *would a wormhole pilot loading the site notice this?* If no, leave it out.

Format is strict (the parser, `src/features/changelog/parse.ts`, is intentionally narrow). Since 3.6.4 the changelog is a **version timeline**: one entry per release, each tagging its changes by type.

```
### v<version> — YYYY-MM-DD

#### Added
- One user-facing change per bullet, written for someone who doesn't know the codebase.

#### Changed
- …

#### Fixed
- …

#### Removed
- …
```

One entry per shipped version (newest at top); the heading is `v<version>` + an em-dash (or hyphen) + the ISO ship date. Under it, only the `#### Added | Changed | Fixed | Removed` groups that apply, each with `- ` bullets. Within a bullet, **bold** and `inline code` are passed through as raw markdown text (the renderer shows them literally) — keep prose plain. Grow the parser first if a future entry needs anything beyond version/date headings, the four change-type groups, and flat bullets.

Bump `APP_VERSION` (`src/config/app-version.ts`) to match — the footer surfaces it as a link to /changelog, and the changelog header reads it as the current version.

**Archive completed plan docs.** When a version ships, move its plan doc to `../LGI Tools Document Archive/` and `git rm` the in-repo copy. Replace markdown links with prose mentions. The active repo holds only in-progress or upcoming plan docs.

**Naming.** From 2.7 onward, plan docs are `VERSION_<n>_PLAN.md` and work is a "version" with semver-style sub-versions (2.7.1, …). Pre-2.7 docs stay `PHASE_<n>_PLAN.md` for historical accuracy.

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

All changes go through PRs. `main` is the only deploy target.

- **Branch per sub-version, not per session.** Multiple sessions build one
  coherent sub-version on a single long-lived feature branch. Most sessions end
  with a commit and a Vercel preview check — **not** a PR. One PR opens when the
  sub-version is complete.
- **Each branch gets an isolated database** via the Vercel ↔ Neon integration (a
  `preview/<branch>` Neon branch forked from production). Every push gets a
  preview deployment — that's the review surface between sessions. Production is
  untouched until merge.
- **Merging to `main` triggers production.** Migrations and SDE auto-ingest apply
  automatically.
- **Fix things in-branch, don't carry them forward.** A bug found mid-session or
  during review gets fixed on the branch if it belongs to this sub-version. Only
  genuinely out-of-scope items go to the scratchpad.
- **Never `gh pr merge` unless the user explicitly says merge.**

The session-close ritual is in **`SESSION_END.md`** (read at the end of every
session). The PR + Greptile loop is in **`PR_REVIEW.md`** (read when opening a
sub-version's PR).

## CSP: never use inline `style="..."` attributes

Production CSP is `script-src 'self' 'unsafe-inline'; style-src 'self'` (no nonce, no `'strict-dynamic'` — the nonce was retired in 3.0.4.6 to unblock static rendering). The split is deliberate: `script-src` carries `'unsafe-inline'` because App Router pages emit inline `self.__next_f.push(...)` RSC flight scripts that bare `'self'` can't bless, while `style-src` stays `'self'` — styles ship in the external stylesheet — which admits that stylesheet but NOT inline `style="..."` attributes. Any JSX `style={{...}}` renders as a `style="..."` attribute and is silently dropped by the browser on first paint (symptom: a dimension missing on initial load that "self-heals" on client navigation, because hydration reapplies it via JS, which CSP doesn't gate). *Lint-enforced*: a JSX `style` attribute fails `pnpm lint` (`no-restricted-syntax` in `eslint.config.mjs`). That same rule also bans `dangerouslySetInnerHTML` and raw `innerHTML`/`outerHTML` writes (across `.ts` and `.tsx`): `script-src` now carries `'unsafe-inline'`, so an unescaped HTML sink would be an XSS vector — render text through JSX (auto-escaped) or build DOM with `textContent`/`createElement` instead.

**Fixes:**
- Static values → Tailwind arbitrary values: `className="grid-cols-[repeat(auto-fill,minmax(270px,1fr))]"`.
- Runtime-dynamic values (e.g. a progress bar width) → define a CSS class that reads a custom property, then set the variable via `useEffect` + `ref.current.style.setProperty(...)` after mount. JS-applied styles aren't CSP-gated.

(Inline-style sweep targets are tracked in SCRATCHPAD, fixed when the relevant page is next touched — not as standalone work.)

## Color tokens

Raw hex colors belong in the token layer, never hardcoded at call sites (3.3.9). Define a color once as a `--color-*` custom property in the `@theme` block of `globals.css` (surfaced as `bg-…`/`text-…`/`border-…`/`fill-…` utilities), or in `tones.ts` for the SVG fills/strokes that read `toneHex`. *Lint-enforced*: `no-restricted-syntax` (`eslint.config.mjs`) bans a hex literal in a Tailwind arbitrary value (`bg-[#1e2c3a]`, `shadow-[0_0_4px_#dd4444]`), in an interpolated class string, and as a whole-string constant (an SVG `fill="#0d0f14"`). Exempt: `src/components/ui/tones.ts` (the sanctioned home for raw hex) and the `src/app/dev`/`src/app/preview` sandboxes (off-palette design scratchpads). rgba is out of scope — the rule bans hex only.

## CLI Tools

Authenticated CLIs are the tooling of record — the equivalent MCP connectors were removed (CLI-first by preference). Context7 is a standing per-session step (below); the Vercel and Neon CLIs you reach for when they save one.

- **Vercel CLI** (`vercel`) — deploys, env, and read-side runtime introspection. `vercel logs <deployment>` / `vercel inspect` show the path + status of recent requests — the cleanest way to confirm a handler ran without peeking at the DB. `vercel env` manages env vars; `vercel env pull --environment=production` pulls prod values locally.
- **Neon CLI** (`neonctl`) — your Neon projects, branches, and connection strings. There's no run-SQL subcommand — pair it with psql: `psql "$(neonctl connection-string <branch>)"`. **Production reads** go through `vercel env pull --environment=production` + local `psql` (LGI's prod DB lives in the Vercel-managed Neon org), or infer state from `vercel logs`.
- **Context7** (`ctx7`, run via `npx ctx7@latest`) — current library docs. A global skill (`~/.claude/skills/find-docs`) and rule (`~/.claude/rules/context7.md`) already route any library question here. **Use it during planning (plan mode) on every session** to confirm current API shapes before proposing an approach — especially Next.js, Drizzle, jose, and Zod, since training data lags the versions this codebase runs (Next 16.2.6 / Cache Components, Zod 4, jose v6). Resolve a name with `npx ctx7@latest library "<Name>" "<question>"`, then fetch with `npx ctx7@latest docs <id> "<question>"`. The cost of a stale assumption is a whole session built on the wrong API — the SRI/CSP, Cache Components, and jose-`customFetch` work all turned on details only the current docs got right; verify here rather than asserting from memory, and cite what you found in the plan.
