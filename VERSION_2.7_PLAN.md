# LGI.tools — Version 2.7 Plan

## What this is

The first release authored under the new naming convention —
"version" instead of "phase", numbered semantically (2.7.1, 2.7.2,
2.7.3) instead of by alphabet-session. Historical PHASE_*.md docs
stay named as-is; all forward work uses `VERSION_*.md`.

Version 2.7 has three sub-versions and addresses three things 2.6
surfaced:

- **2.7.1 — own the math.** Today the wormhole-sites DB stores
  pre-computed combat numbers the Sheet derived from raw EVE
  attributes. 2.6 froze a snapshot in `sleeper_archetypes`, but
  those numbers drift as CCP patches the game. 2.7.1 pulls the
  same raw attribute data the Sheet uses (it's all in the SDE),
  writes the math natively, drops the persisted stats in favour
  of always-fresh compute, and captures sleeper loot drops so
  combat-site ISK becomes live-priced the same way ore/gas
  already is. The infrastructure is generic enough that missions
  and incursions become trivial to add later. Vitest gets set up
  in this sub-version because the math is the canonical first
  thing to test.
- **2.7.2 — actually have a PR workflow.** The preview-branching
  mishap in 2.6 told us the deploy story is broken on this
  project. Future versions should land through PRs that are
  safely testable against an isolated database. 2.7.2 diagnoses
  why Vercel-Neon didn't isolate, fixes it, adds a CI workflow
  that runs the Vitest suite on every PR, and turns on branch
  protection so PR-default is enforced not just documented.
- **2.7.3 — make the base rock-solid before 3.0.** Three passes
  through the whole repo: dead code + unused deps, then
  efficiency + structural quality, then security. One coherent
  cleanup version, three independently-shippable PRs.

---

## How to use this document

Same shape as the prior plan docs. Before this session, read
[CLAUDE.md](CLAUDE.md), [AGENTS.md](AGENTS.md), and
[SCRATCHPAD.md](SCRATCHPAD.md). Then read the sub-version below
that you're about to start, and form your own plan. Confirm with
the user before committing to one.

Each sub-version (2.7.1, 2.7.2, 2.7.3) is its own session. 2.7.3
ships as three PRs but is still one session.

---

## Decisions already made

- **The new compute lives in `src/data/npc-stats/`.** Named
  generically so missions / incursions / abyssal NPCs can reuse it
  without a rename. Sleeper loot drop tables live in the same
  slice — same shape applies to mission rats.
- **Stored per-NPC stats get dropped, not cached.** The math is
  cheap, always fresh, and removes a class of silent-drift bugs.
  `sleeper_archetypes` goes away; the columns on `npcs` (`dps`,
  `alpha`, `ehp`, `scram`, `web`, `neut`, `rrep`, `sig`, `speed`,
  `distance`, `velocity`) get removed. The audit snapshots in
  `sheet-audit/seed-source/` stay as the historical baseline the
  compute is validated against.
- **No ESI for static data.** Combat attributes come from
  Fuzzwork's SDE dumps, same source we already use for
  types/groups/categories. ESI is reserved for live data that
  changes at runtime (which today is just market prices).
- **Vitest, not Jest.** Native ESM, fast, sensible defaults,
  plays well with Next.js + TypeScript. Set up in 2.7.1
  alongside the math (the canonical first thing to test). Tests
  live next to source, same convention as `schema.ts` /
  `queries.ts` / `types.ts`. CI to run them on PRs lands in
  2.7.2.
- **PR-default workflow ships in 2.7.2.** Once Vercel-Neon
  preview branching is confirmed working, `main` gets branch
  protection and PRs become the only path. No more pushing
  direct to main even for small fixes.
- **No retroactive test backfill.** Tests get added organically
  to new code; existing code (market-prices ingest, wormhole-sites
  queries, etc.) doesn't get covered until something touches it.
  Forced coverage is busywork. Convention documented in CLAUDE.md.

---

## 2.7.1 — Own the combat math + set up Vitest

**Goal.** Compute per-NPC DPS / EWAR / EHP natively from SDE
attributes. Wire the compute into wormhole-sites and drop the
persisted columns. Capture sleeper loot drops so combat sites get
live-priced ISK. Set up Vitest with the math as the first test
subject.

This is the largest sub-version of 2.7. Internally it has five
steps that ship together.

### Step 1 — SDE attribute ingest

Extend `pnpm db:ingest:sde` to fetch Fuzzwork's `dgmTypeAttributes`
and `dgmAttributeTypes` dumps. Adds two tables to the existing
`src/data/eve-data/` slice — no new slice needed.
`dgmTypeAttributes` is large (typeId × attributeId → value,
hundreds of thousands of rows) but Postgres handles it.
`dgmAttributeTypes` is the metadata lookup (attributeId → name,
unit).

**Files.** `src/data/eve-data/schema.ts`, `src/data/eve-data/ingest.ts`.

### Step 2 — The math, in `src/data/npc-stats/`

New slice. Pure functions, no DB imports — takes a flat
`{ attrId: value }` map and returns `CombatStats`.

- `math.ts` — `computeTurretDps(attrs)` (per damage type + total),
  `computeMissileDps(turretAttrs, missileAttrs)`,
  `computeOmniEhp(attrs)`, `computeEwarCounts(attrs)`.
- `queries.ts` — `getCombatStats(typeId)` looks up attributes and
  applies the math. The public query API.
- `types.ts` — the `CombatStats` shape consumers see.

The reverse-engineering report from 2.6
([sheet-audit/calculations-report.md](sheet-audit/calculations-report.md))
is the spec for `math.ts`. It already names the input attribute
IDs and the formulas.

### Step 3 — Vitest setup + tests for the math

- Add `vitest` as a devDep. Add `vitest.config.ts` (minimal — the
  defaults are fine).
- Add `pnpm test` script.
- Add `src/data/npc-stats/math.test.ts` — validates the formulas
  against a representative sample of sleeper types pulled from
  `sheet-audit/seed-source/sleeper-archetypes.json`. Goal: zero
  unexplained deltas across all 36 types. Replaces the one-shot
  validation script the earlier draft of this plan proposed —
  same data, more durable.
- Add a brief "Testing" section to `CLAUDE.md` documenting the
  convention.

### Step 4 — Wire compute into wormhole-sites + drop persisted stats

- `src/features/wormhole-sites/queries.ts` calls
  `getCombatStats(typeId)` for each NPC; merges into the existing
  response shape so the API wire format doesn't change.
- `src/features/wormhole-sites/schema.ts` removes `npcs.dps`,
  `alpha`, `ehp`, `scram`, `web`, `neut`, `rrep`, `sig`, `speed`,
  `distance`, `velocity`. Drops `sleeper_archetypes`.
- The `npcs` table doesn't currently store `type_id` — backfill a
  `npcs.type_id` column from `sleeper_archetypes` *before* the
  archetype table gets dropped. Same migration handles both
  steps in order.

### Step 5 — Sleeper loot drops + live combat-site ISK

- `sheet-audit/extract-drops.ts` — re-audit pass over the Sheet
  to find per-sleeper drop quantities. They aren't in the tabs
  2.6 captured; this needs another look. Output a JSON snapshot
  into `sheet-audit/seed-source/sleeper-drops.json`.
- `src/data/npc-stats/schema.ts` (or `eve-data/`, depending on
  where loot tables fit best) — new `sleeper_drops` table keyed
  on (sleeper typeId, loot typeId) with quantity columns. If
  drops are ranges (min/max), store both; if fixed, store one.
- `src/data/npc-stats/queries.ts` — `getLootDrops(typeId)` for
  per-NPC, `expectedSiteLoot(siteId)` for the rollup that
  multiplies through wave NPC counts.
- `src/features/wormhole-sites/queries.ts` — combat sites
  compute `liveBlueLootIsk` from `expectedSiteLoot × getPrices`,
  the same way `overlayLivePrices` already handles ore/gas. The
  Sheet's `blueLootIsk` either gets dropped from the schema or
  retained as `sheetBlueLootIsk` for comparison.

**Known unknown.** Whether the Sheet encodes drop quantities
explicitly. If yes, Step 5 is straightforward. If no, plan B is
community-sourced drop tables (the EVE wiki documents them) — but
that's a heavier lift and might spin off into its own version.
Audit comes first.

### 2.7.1 success criteria

- `pnpm test` passes — the math reproduces the 2.6 archetype
  snapshot's numbers exactly across all 36 sleeper types.
- API response shape unchanged. Site cards behave identically to
  pre-2.7.1 — same numbers, different source.
- `npcs` table is meaningfully simpler (no derived stats);
  `sleeper_archetypes` is gone.
- Combat sites display live blue-loot ISK that responds to market
  price changes, matching the ore/gas-site behaviour.
- CLAUDE.md has a "Testing" section.

---

## 2.7.2 — Vercel-Neon preview branching + PR workflow + CI

**Goal.** Make preview deployments actually isolated. Make PRs the
enforced path to `main`. Run the Vitest suite on every PR via
GitHub Actions.

This sub-version is mostly configuration + investigation, plus a
single CI workflow file. It can run in parallel with 2.7.3 once
2.7.1 has shipped.

### Step 1 — Diagnose Vercel-Neon branching

Confirm whether the integration's "create a database branch per
preview deployment" toggle is on for this project. If on but not
branching: investigate the integration's runtime env vars (the
2.6 investigation showed `vercel env pull` returns empty strings
for the Neon vars — that's expected for marketplace integrations,
but it complicated diagnosis). The MCP servers being added for
Vercel and Neon should make this faster than dashboard clicking —
install them first.

Verify with a test PR: open it, query the preview's `/api/sites`
and the prod `/api/sites` from two different DB perspectives
(temporary debug endpoint or direct connection from `.env.preview`
pull), confirm they're isolated.

### Step 2 — Resolve the migrate-if-production guard

Once branching is verified working:

- **Option A:** remove `src/db/migrate-if-production.ts` entirely;
  `vercel-build` reverts to `tsx src/db/migrate.ts && next build`.
  Each preview branch gets its own migration apply. Simpler,
  honest about how things work.
- **Option B:** keep the guard as belt-and-suspenders. Slightly
  uglier but defends against future integration regressions.

Decision at session time based on confidence in the integration.

### Step 3 — Enforce PR-default with branch protection

- Enable branch protection on `main` via GitHub settings.
- Require pull request before merging. Require at least one
  approval (self-approval for solo work for now). Require status
  checks to pass (the CI workflow from Step 4, plus Vercel's
  preview deploy success).
- No direct pushes, no force-pushes.

### Step 4 — CI workflow

- New `.github/workflows/test.yml` — runs `pnpm install` and
  `pnpm test` on every PR. Node version pinned. Cached
  pnpm-store for speed.
- Gates merges via the branch-protection rule from Step 3.

### Step 5 — Document the workflow in CLAUDE.md

Add a "Workflow" section to `CLAUDE.md`:

- All changes go through PRs (no exceptions).
- Each PR gets a Vercel preview backed by an isolated Neon branch.
- `pnpm test` runs on every PR via GitHub Actions; merges blocked
  on green.
- Merges to `main` trigger production deploys; migrations apply
  automatically.

### 2.7.2 success criteria

- A test PR demonstrably hits a different Neon branch than prod
  (verified by querying both).
- Branch protection on `main` is on.
- `.github/workflows/test.yml` exists; PRs show a "tests" check
  that gates merges.
- CLAUDE.md documents the workflow.

---

## 2.7.3 — Repo cleanup pass (dead code, efficiency, security)

**Goal.** Make the base rock-solid before any 3.0+ work. Three
sequential passes through the whole codebase, shipped as three
independently-mergeable PRs in order.

One session for context-sharing reasons — the passes look at
overlapping files and benefit from being done in sequence by the
same operator. Three PRs because the passes have different review
chronologies (Pass 1 is fast and low-risk; Pass 3 may surface
findings that need to ship faster).

### Pass 1 — Dead code + unused dependencies (cheap wins)

Easiest pass; sets the table for the others by reducing what
needs review.

- Run `knip` (or `ts-prune`) to find unused exports / files /
  types.
- Run `depcheck` to find unused npm dependencies.
- Manual grep for `// TODO` and `// FIXME` comments — delete the
  ones that turned out fine, file the ones that didn't.
- Manual grep for feature-flag-like booleans that have been on
  or off long enough to commit to.
- Look for orphaned files left over from prior versions (the
  `sheet-audit/_debug-rows.ts` deleted mid-2.6 is the kind of
  thing to look for elsewhere).

**Deliverable.** Single PR that removes things. The diff itself
is the audit trail.

### Pass 2 — Efficiency + structural quality

The `code-review` skill at medium-or-high effort, scoped to the
whole repo not just a diff.

- Look for N+1 query patterns. We've been careful
  (`listSiteDetails` is batched into 4 round-trips per SCRATCHPAD),
  but a sweep is cheap.
- Look for missing indexes. We added some in 2.6 but haven't done
  a systematic pass.
- Look for inefficient React re-render patterns and missed
  batching opportunities.
- Look for places where we hand-roll something a library already
  does well (the CSV parser in `sheet-parser.ts` is the canonical
  example — keep it, but document the reason).
- Check consistency with the architecture invariants in
  SCRATCHPAD: any features importing from each other, any UI
  primitives that snuck domain knowledge in, any `src/data/`
  slice that imported from `src/features/` accidentally.

**Deliverable.** PR with the easy fixes; punch list of anything
that needs design discussion before fixing.

### Pass 3 — Security audit

The `security-review` skill, scoped to the whole repo.

- Route-handler input validation (we have several `/api/*`
  endpoints — confirm each validates inputs before passing to
  queries).
- DB ingest scripts for SQL injection surface (we use Drizzle's
  parameter binding, but confirm no raw ``sql`...` `` interpolations
  use unvalidated user input).
- Env var handling (2.6 caught one bug with empty `DATABASE_URL`
  needing lazy connection — sweep for similar).
- The new `pnpm db:reseed-from-sheet` guard: does the
  `--confirm-wipe` flag check actually work the way it looks? Are
  there other destructive scripts that should also have guards?
- The `sheet-audit/fetch-tabs.ts` script fetches arbitrary URLs
  and writes them to disk — even though it's developer-only,
  worth checking that path.
- The migrate-on-prod-deploy chain — what happens if the
  migration fails mid-stream? Anything destructive that needs to
  be wrapped in a transaction?

**Deliverable.** PR with high-confidence fixes. Anything uncertain
or design-level gets filed as a follow-up task.

### 2.7.3 success criteria

- Three PRs merged in order.
- `knip` and `depcheck` report clean (or every flagged item has
  a documented "keep this and why").
- `code-review` finds nothing critical on a re-run.
- `security-review` report has no high-severity unaddressed
  findings.
- The codebase feels meaningfully smaller and tighter without
  feeling under-featured.

---

## Out of scope for Version 2.7

- **Mission and incursion data slices.** The `npc-stats`
  infrastructure built in 2.7.1 is *ready* for them, but
  authoring compositions is its own feature version. Post-3.0.
- **In-app admin UI for editing sites.** Still Version 3.
- **Visual overhaul.** Still PHASE_2.9_PLAN.md (the rename to
  VERSION_2.9 happens when that version is actually opened).
- **Retroactive test backfill.** Tests get added to new code
  organically; existing untested code stays as-is until something
  touches it.
- **A more elaborate CI pipeline** (lint check, type check on
  PR, etc.) beyond what 2.7.2 adds. Worth doing later when
  something fails that a CI check would have caught.

---

## Version 2.7 success criteria

- The `npc-stats` slice ingests SDE attributes, computes DPS /
  EWAR / EHP natively, and produces identical numbers to the 2.6
  archetype snapshot.
- The `npcs` table no longer stores derived stats;
  `sleeper_archetypes` is gone; the API still returns the same
  shape with the same numbers.
- Combat sites display live blue-loot ISK that tracks Jita prices.
- Vitest is set up; the math has tests; `pnpm test` runs in CI on
  every PR.
- Vercel previews demonstrably isolate to their own Neon branch.
- PRs are the enforced path to `main`, with branch protection
  and a green CI check required for merge.
- The repo passes a clean `knip` / `depcheck` / `code-review` /
  `security-review` pass.

---

## Known unknowns

- **Whether the Sheet encodes per-sleeper drop quantities.** If
  yes, 2.7.1 Step 5 is straightforward. If no, it pivots to a
  community-sourced drop table (EVE wiki) and grows in scope —
  possibly spinning off into 2.7.4.
- **Whether Vercel-Neon preview branching is a settings toggle, a
  plan-tier feature, or something requiring integration support.**
  2.7.2 starts blind on this; investigation comes first. The MCP
  servers being added should accelerate diagnosis.
- **Whether dropping the persisted `npcs` columns has performance
  implications.** Computing combat stats for 500+ NPCs per
  site-list query could be slower than reading them. If
  benchmarks show a problem, the fallback is the middle ground
  (drop archetypes, keep per-NPC columns as a cache). Decide
  with data, not speculation.
- **Whether the 2.7.3 cleanup turns up enough work to warrant
  splitting.** If the security pass alone produces a punch list
  longer than the other two combined, it can graduate to its own
  sub-version (2.7.4) without restructuring the plan.
