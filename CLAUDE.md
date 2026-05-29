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
- Build: `pnpm vercel-build` — migrates the active Neon branch and auto-populates SDE tables on first deploy
- Test: `pnpm test`
- Typecheck: `pnpm typecheck`
- Lint: `pnpm lint`

## Project Structure

- `src/features/<name>/` — self-contained feature slices (`schema.ts`, `queries.ts`, `types.ts`, `components/`). Two features never import from each other.
- `src/components/ui/` — domain-agnostic UI primitives.
- `src/data/` — shared data layers (SDE, market prices, search, telemetry). Own ingest/schema/queries, no UI.
- `src/app/api/` — route handlers.
- `CHANGELOG.md` (repo root) — user-facing changelog, parsed by `src/features/changelog/parse.ts`.
- `docs/SCRATCHPAD.md` — cross-session working memory. The whole `docs/` folder is gitignored.
- `../LGI Tools Document Archive/` — sibling folder for shipped plan docs.

## Core Principles

Raise a conflict before proceeding if a task seems to violate one.

- **Reusable primitives over one-off components.** A wave card is a collapsible group-of-entities component fed wormhole data today — not a wormhole component. Future features reuse the same primitives with different data.
- **Minimal by default; build for the task, not for hypotheticals.** Only make changes directly requested or clearly necessary for the session's goal. Don't add features, abstractions, configurability, or defensive handling for scenarios that can't occur. A primitive earns its place when there's a real second consumer — not speculatively. Don't add docstrings, comments, or type annotations to code you didn't change; comment only where logic isn't self-evident. Validate at system boundaries (user input, external APIs), not between trusted internal code. The right amount of complexity is the minimum the current task needs. (This complements the primitives rule: extract a primitive when reuse is real, not when it's imagined.)
- **Static by default; dynamic holes, not dynamic routes.** Every page should be as static (`○` in `next build`) as its data allows. A page being interactive does not make it dynamic — the static shell hydrates and dynamic work happens through user-triggered API calls. Isolate genuinely per-request data (logged-in user identity, live prices) into a `<Suspense>` leaf so it's a *dynamic hole* in an otherwise-static route, rather than letting one dependency mark the whole route `ƒ`. Pure reference surfaces (legal, changelog, the wormhole index, SDE-backed pages) are fully static with revalidation tied to SDE re-ingest. Verify in build output: a route is `ƒ` only with a justified reason.
- **Features don't know about each other.** Each feature is a self-contained slice. Shared logic lives in a common layer features import from — never the reverse.
- **Configuration over repetition.** Types, classes, and variants are constants defined in one place. Adding one is a config change, not a code change. Enforce with strict typing.
- **Schema stays extensible.** Accommodate new content types and fields without structural rewrites.

## Architecture Invariants

Load-bearing constraints. Don't regress these without raising a conflict.

- **`src/data/` slices never import from `src/features/`.** Features import from data layers, never the reverse. Two data slices never import each other (e.g. `eve-data` ⊥ `market-prices`). Cross-slice composition lives in a layer *above* both (see `src/db/sde-pipeline.ts` for the template). *Lint-enforced* (`boundaries/dependencies` in `eslint.config.mjs`), with three documented exceptions encoded there: auth's shared surface (`auth/types`, `auth/schema`) is importable anywhere as platform infra; the `search` registry hub is importable by any data slice; and `npc-stats → eve-data` is allowed as directed layering. Features also never import each other (same rule) — *also lint-enforced*.
- **UI primitives accept abstract `tone` props** (`green`, `red`, …). The only files that know "C5 is red" are the feature-level `*-styles.ts` mappings. The *import edge* — `src/components/ui/**` may not import features or data — is lint-enforced; whether a component is a *good* primitive stays a review judgment.
- **Postgres enums are driven from TS `as const` arrays** — one source of truth.
- **`Collapsible` is a pure `<details>`/`<summary>`** — the element owns open/closed state; no React state wrapper. `UrlSync` syncs the URL via a native `toggle` listener.
- **Lazy DB client** (`src/db/index.ts` Proxy) — connection deferred to first query so `next build` survives an empty `DATABASE_URL`.
- **Validation lives in route handlers, not queries.** Queries accept already-typed values. Every input-accepting route validates with a co-located Zod schema; routes with no user input carry a one-line marker comment so the invariant stays grep-auditable.
- **Advisory locks are session-scoped on a reserved connection**, released in `finally`. Network calls (ESI, Fuzzwork) happen with no transaction open and no connection pinned. Lock IDs are constants in the owning slice.
- **Every deploy migrates its own branch.** Production migrates production; each preview deploy migrates its per-PR Neon branch. Preview branches auto-delete on PR close.
- **The visual identity is the existing terminal/EVE aesthetic defined by `tones.ts` and the established styles.** Build within it. Do not introduce a default design palette or typeface (warm cream backgrounds, serif display fonts, terracotta accents, etc.) — a new tone or font needs explicit written justification, the same bar as a new `tones.ts` entry.

## Working with the agent

These reflect how the current model behaves; they shape how sessions should be written and read.

- **Instructions are followed literally and are not silently generalized.** If a rule should apply to every item (every query batched, every row using a primitive, every section formatted a certain way), the prompt must say "every" — the agent applies an instruction to what was named, not to siblings it wasn't told about. Session prompts already state scope explicitly; keep doing so.
- **Prefer goals over prescribed steps.** State the destination, success criteria, and constraints; let the agent plan the "how" in plan mode. Hand-written step-by-step procedures usually underperform the agent's own planning. (Diagnosis-first framing for bug/uncertain work is the exception worth keeping — "verify the claim before fixing" is a constraint, not a procedure.)

## Session Maintenance

**SCRATCHPAD.md** — after every session, update `docs/SCRATCHPAD.md` (gitignored). It's the agent's session-to-session memory: discoveries made *during* a session, cross-cutting bugs, and gotchas — not forward plans (those live in the version docs and prompts). The file documents its own upkeep rules at the bottom; follow them so it stays skimmable.

**CHANGELOG.md** — after every session, decide whether the work is user-facing. Only log features and significant platform changes; skip internal cleanup, CI, refactors, and intra-session iteration. The test: *would a wormhole pilot loading the site notice this?* If no, leave it out.

Format is strict (the parser is intentionally narrow):

```
### YYYY-MM-DD
- One user-facing change per bullet, written for someone who doesn't know the codebase.
```

Group same-day entries under one date heading. Newest at top. No bold, links, or rich markdown — grow the parser first if a future entry needs it.

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

Production CSP is `style-src 'self' 'nonce-<random>'`. Nonces cover inline `<style>` blocks only — NOT `style="..."` attributes. Any JSX `style={{...}}` renders as a `style="..."` attribute and is silently dropped by the browser on first paint (symptom: a dimension missing on initial load that "self-heals" on client navigation, because hydration reapplies it via JS, which CSP doesn't gate). *Lint-enforced*: a JSX `style` attribute fails `pnpm lint` (`no-restricted-syntax` in `eslint.config.mjs`).

**Fixes:**
- Static values → Tailwind arbitrary values: `className="grid-cols-[repeat(auto-fill,minmax(270px,1fr))]"`.
- Runtime-dynamic values (e.g. a progress bar width) → define a CSS class that reads a custom property, then set the variable via `useEffect` + `ref.current.style.setProperty(...)` after mount. JS-applied styles aren't CSP-gated.

(Inline-style sweep targets are tracked in SCRATCHPAD, fixed when the relevant page is next touched — not as standalone work.)

## MCP Tools

Optional — the workflow needs none of them — but reach for them when they save a step.

- **Vercel MCP** — read-side deploy + runtime introspection. `get_runtime_logs` shows exact path + status of recent requests, which is the cleanest way to confirm a handler ran without peeking at the DB. For *setting* env vars, the `vercel` CLI is better.
- **Neon MCP** — direct SQL via `run_sql`. **Cannot reach LGI's production DB** (Vercel-managed Neon org, invisible to a personal API key). For production reads: `vercel env pull --environment=production` + local `psql`, or infer state from Vercel runtime logs.
- **Context7 MCP** — current library docs. Especially valuable for Next.js, since training data lags this codebase's version.
