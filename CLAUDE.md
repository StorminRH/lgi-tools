<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## What This Is

**LGI.tools** (Lo-Gang Industries) is a multi-tool web platform for Eve Online players. Features are added incrementally — each one builds on shared infrastructure without requiring rewrites of what came before.

## Tech Stack

Next.js (current — see warning above) · TypeScript (strict) · Drizzle ORM · Neon (Postgres) · Vercel (hosting + CI) · pnpm · Vitest.

## Commands

> Verify these match your current `package.json` — adjust as needed.

- Install: `pnpm install`
- Dev: `pnpm dev`
- Build: `pnpm vercel-build` — runs schema migrations against the active Neon branch and auto-populates SDE attribute tables on first deploy
- Test: `pnpm test`
- Typecheck: `pnpm typecheck`
- Lint: `pnpm lint`

## Project Structure

- `src/features/` — self-contained feature slices. Two features never import from each other.
- `src/components/ui/` — reusable UI primitives.
- `src/data/` — shared data layers (SDE, market prices, etc.).
- `src/app/api/` — route handlers.
- `src/features/*/components/` — feature-specific components.
- `CHANGELOG.md` (repo root) — user-facing changelog, parsed by `src/features/changelog/parse.ts`.
- `docs/SCRATCHPAD.md` — cross-session working memory. The whole `docs/` folder is gitignored (planning docs stay private to maintainers).
- `../LGI Tools Document Archive/` — sibling folder for shipped plan docs.

## Core Principles

Raise a conflict before proceeding if a task seems to violate one.

**Reusable primitives over one-off components.**
A wave card is not a wormhole component — it is a collapsible group-of-entities component fed wormhole data today. Future features use the same primitives with different data.

**Features don't know about each other.**
Each feature is a self-contained slice in `src/features/`. Shared logic lives in a common layer features import from — never the reverse. Two features never import from each other.

**Configuration over repetition.**
Types, classes, and variants are defined as constants in one place. Adding a new one is a config change, not a code change. Use strict typing to enforce these configurations.

**Schema stays extensible.**
Accommodate new content types and fields without structural rewrites.

## Session Maintenance

**Maintain SCRATCHPAD.md.** After every session, update `docs/SCRATCHPAD.md` (gitignored) with what was built, decisions made, open questions, and what the next session should start with. This is working memory across sessions — keep it current.

**Maintain CHANGELOG.md.** After every session, decide whether the work that shipped is worth a public-facing changelog entry. Only log user-facing features and significant platform changes; skip internal cleanup, CI/infrastructure work, refactors, and rapid intra-session PR iteration. When in doubt, ask: *would a wormhole pilot loading the site notice this?* If no, leave it out.

Format is strict (the parser in `src/features/changelog/parse.ts` is intentionally narrow):

```
### YYYY-MM-DD
- One user-facing change per bullet, written for someone who doesn't know the codebase.
```

Group multiple ship-points from the same calendar day under one date heading. Newest entries at the top. Don't reach for bold, links, or other markdown — if a future entry genuinely needs richer formatting, grow the parser to match. SCRATCHPAD remains the internal forensic record; CHANGELOG is the curated user-facing one.

**Archive completed plan docs.** When a version (or pre-2.7 phase) ships, move its plan document out of the repo into `../LGI Tools Document Archive/` and `git rm` the in-repo copy. Replace any remaining markdown links with prose mentions (`(archived — see LGI Tools Document Archive/...)`). The active repo should only contain plan docs for work that is in-progress or upcoming.

Naming: from 2.7 onward, plan docs are `VERSION_<n>_PLAN.md` and the work itself is referred to as a "version" with semver-style sub-versions (2.7.1, 2.7.2, …). Pre-2.7 docs use `PHASE_<n>_PLAN.md` and stay named that way for historical accuracy.

## Commit Style

Write commit messages in plain English. No function names, file paths, or technical jargon in the subject line or body. Describe what the change does for the project, not how the code is structured.

**Subject line:** one sentence, lowercase after the colon, under 72 characters.
**Body (optional):** 3–5 bullet points covering what changed and why — the kind of thing you'd tell a teammate over Slack. If a session built several things, list them briefly.

Good:
```
feat: add API endpoints for browsing and filtering wormhole sites

- sites can now be listed, filtered by class and type, and fetched by ID
- full site detail includes waves, NPC counts, and resource values
- invalid filters return a clear error instead of an empty result
- made the database connection lazy so local builds work without prod credentials
```

Avoid:
```
feat(api): /api/sites list+filter and /api/sites/[id] detail endpoints

Adds GET /api/sites (optional ?type= and ?class= filters) and
GET /api/sites/[id] (full detail with waves, npcs, resources).
Also makes the Drizzle db client lazy so next build succeeds when
.env.production.local has an empty DATABASE_URL placeholder.
```

## Testing

Vitest is the test framework. CI runs the suite on every PR.

- **Add tests organically.** New testable code (pure functions, query helpers, math modules, `src/data/` whose output you can assert against known inputs) gets tests written alongside it in the same PR. Tests live next to source (`foo.test.ts` next to `foo.ts`).
- **Don't backfill for coverage's sake.** Existing untested code stays untested until something touches it.
- **Skip what doesn't earn it.** Presentational components in `src/components/ui/` and `src/features/*/components/` don't need unit tests; visual review covers them. Route handlers get tests when they contain non-trivial logic beyond "call the query and return the result."
- **One PR = green tests.** CI runs `pnpm test` on every PR. A red suite blocks merge.

## Workflow

All changes go through PRs. `main` is the only deploy target.

- **Each PR gets an isolated database.** The Vercel ↔ Neon integration creates a `preview/<branch-name>` Neon branch for every preview deployment, forked from production. `pnpm vercel-build` runs migrations against that branch and auto-populates SDE attribute tables on first deploy. Production data is untouched until merge.
- **Merging to `main` triggers production.** Migrations apply automatically; the same auto-ingest step populates anything new the migration created.
- **CI runs Vitest on every PR.** Green tests required to merge.

## MCP Tools

The developer has the following MCPs configured in Claude Code. They're optional — the workflow doesn't require any of them — but reach for them when the right tool saves a step.

- **Vercel MCP** — read-side deployment + runtime introspection (deploy status, build logs, runtime logs, env-var inventory). Strong for "did this request succeed?" — `get_runtime_logs` shows the exact path + status code of recent requests, so a callback that returned 302 with no `auth_error=*` redirect is observable proof the handler ran cleanly without peeking at the DB. For *setting* env vars the `vercel` CLI (`vercel env add`) is still the cleaner path.

- **Neon MCP** — direct SQL via `run_sql` against any Neon branch. **Doesn't reach LGI's production DB:** the Vercel ↔ Neon marketplace integration provisions LGI's Neon project under an isolated, Vercel-managed Neon org that the developer's personal Neon API key has zero visibility into (`list_projects` and `list_shared_projects` both return empty; `run_sql` 403s even with a hard-coded project_id). For production reads: `vercel env pull --environment=production` + local `psql`, or — usually better — infer DB state from Vercel runtime logs.

- **Context7 MCP** — current library docs. Especially valuable for Next.js, since training data lags the version this codebase uses (see the warning at the top).
