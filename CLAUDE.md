## What This Is

**LGI.tools** (Lo-Gang Industries) is a multi-tool web platform for Eve Online players. Features are added incrementally — each one builds on shared infrastructure without requiring rewrites of what came before.

## Core Principles

Raise a conflict before proceeding if a task seems to violate one.

**Reusable primitives over one-off components.**
A wave card is not a wormhole component — it is a collapsible group-of-entities component fed wormhole data today. Future features use the same primitives with different data.

**Features don’t know about each other.**
Each feature is a self-contained slice in `src/features/`. Shared logic lives in a common layer features import from — never the reverse. UI primitives in `src/components/ui/`; shared data layers (SDE, market prices, …) in `src/data/`. Two features never import from each other.

**Configuration over repetition.**
Types, classes, and variants are defined as constants in one place. Adding a new one is a config change, not a code change. Utilize strict typing to enforce these configurations.

**Schema stays extensible.**
Accommodate new content types and fields without structural rewrites.

**Maintain SCRATCHPAD.md.**
After every session update SCRATCHPAD.md with what was built, decisions made, open questions, and what the next session should start with. This is working memory across sessions — keep it current.

**Archive completed plan docs.**
When a version (or pre-2.7 phase) ships, move its plan document out of the repo into the sibling folder `../LGI Tools Archive/` and `git rm` the in-repo copy. Replace any remaining markdown links to the archived file with prose mentions (`(archived — see LGI Tools Archive/...)`). The active repo should only contain plan docs for work that is in-progress or upcoming.

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

Test framework (Vitest) lands in version 2.7.1. The convention going forward, once it's in place:

**Add tests organically.** New code that's testable — pure functions, query helpers, math modules, anything in `src/data/` whose output you can assert against known inputs — gets tests written alongside it in the same PR. Tests live next to source (`foo.test.ts` next to `foo.ts`), same convention as `schema.ts` / `queries.ts` / `types.ts`.

**Don't backfill for coverage's sake.** Existing untested code stays untested until something touches it; then the change picks up tests as it lands. Forced retroactive coverage is busywork that produces brittle, low-value tests.

**Skip what doesn't earn it.** Pure presentational components in `src/components/ui/` and `src/features/*/components/` don't need unit tests; visual review covers them. Route handlers in `src/app/api/` get tests when they contain non-trivial logic beyond "call the query and return the result."

**One PR = green tests.** CI runs `pnpm test` on every PR (set up in 2.7.2). A red suite blocks merge. No "I'll fix it in a follow-up."

## Workflow

All changes go through PRs. `main` is the only deploy target.

**Each PR gets an isolated database.** The Vercel ↔ Neon integration creates a `preview/<branch-name>` Neon branch for every preview deployment, forked from production. `pnpm vercel-build` runs schema migrations against that branch and auto-populates the SDE attribute tables on first deploy. Production data is untouched until merge.

**Merging to `main` triggers production.** Migrations apply automatically; the same auto-ingest step populates anything new the migration created.

**CI runs Vitest on every PR.** Green tests are required to merge.

@AGENTS.md
