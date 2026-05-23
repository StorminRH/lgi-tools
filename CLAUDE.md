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

**Archive completed phase plans.**
When a phase ships, move its plan document (`PHASE_<n>_PLAN.md`) out of the repo into the sibling folder `../LGI Tools Archive/` and `git rm` the in-repo copy. Replace any remaining markdown links to the archived file with prose mentions (`(archived — see LGI Tools Archive/...)`). The active repo should only contain plan docs for phases that are in-progress or upcoming.

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

@AGENTS.md
