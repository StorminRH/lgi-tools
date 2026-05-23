# LGI.tools — Phase 2.6 Plan

## What this is

A single-item phase: **take ownership of the wormhole-site data
locally so the upstream Sheet can be decoupled from routine ingest.**

Phase 1 used a community-maintained Google Sheet as the initial data
baseline for the wormhole-sites feature. That choice let the rest of
the infrastructure get built without spending a session curating data
by hand. The intention, however, was always to take ownership of the
data in the local DB once the feature was stable — the Sheet was a
seed, not a long-term dependency.

Today the architecture still treats the Sheet as authoritative:
`pnpm db:ingest` does a `DELETE WHERE site_id=? then re-insert` on
every run. That means **any manual edit a future session makes to the
local DB would be silently wiped by the next ingest** — a footgun
nobody has hit yet only because no one has edited the DB yet.

Phase 2.6 closes that gap before any in-DB editing starts.

---

## How to use this document

Same shape as the rest of the phase docs. Before this session, read
[CLAUDE.md](CLAUDE.md), [AGENTS.md](AGENTS.md), and
[SCRATCHPAD.md](SCRATCHPAD.md). Then read the session below and form
your own plan. Confirm with the user before committing to one.

Unlike Phase 2 and Phase 2.5, this is a **single session**, not a
batch. Treat the four sub-items as one coordinated change.

---

## Decisions already made

- **The Sheet stops being the source of truth.** After this phase the
  local Postgres DB is authoritative for site/wave/NPC/resource data.
  The Sheet becomes a historical seed.
- **No schema rewrite.** Same tables, same columns. The change is
  about who writes to them, not their shape.
- **No in-app admin UI yet.** Editing the DB directly (SQL, Drizzle
  studio, ad-hoc migrations) is the expected workflow until/unless
  Phase 3 builds a tool for it.
- **The Sheet's other tabs are worth a one-time deep read** before we
  cut the cord — there may be useful data in tabs Phase 1 skipped.

---

## The session

### Session M — Decouple the wormhole-sites data from the Sheet

**Four coordinated pieces. All ship together.**

#### 1. Audit the Sheet's full structure

Phase 1 pulled only the tabs needed to populate sites, waves, NPCs,
and resources. The Sheet has more tabs than that. Before cutting
the cord, do a deep read:

- List every tab the Sheet publishes.
- For each, describe what it contains and whether anything we'd want
  to model in the DB lives there.
- Flag any data that overlaps or could replace what we already have
  (e.g. richer NPC stats, alternate resource columns, signature
  metadata, escalation chains).
- Output: a short document — one section per tab, "what's here, what
  we'd want, what we'd skip."

This is the most open-ended part of the phase. The goal is to make
sure we don't lose anything we'll later wish we'd captured.

#### 2. Pull everything we want to keep

For each tab/column flagged in step 1, decide whether to:

- **Add it to the existing schema** as new columns or a new related
  table (e.g. `signatures` with class probabilities; `escalations`
  if those exist; expanded NPC attributes).
- **Capture it as static seed data** in a versioned migration so the
  DB can be reproduced from scratch without re-reading the Sheet.
- **Skip it** with a one-line note explaining why.

Each schema change ships as a Drizzle migration. The seed import is
a one-time script — run it, commit the resulting migration's data
seed, then never run it again as part of routine ops.

#### 3. Retire routine ingest from the Sheet

`pnpm db:ingest` today is a destructive sync. After this phase it
becomes a guarded re-seed:

- Either **rename** the script to `pnpm db:reseed-from-sheet` and
  gate it behind a `--confirm-wipe` flag, so a future session can't
  accidentally trash local edits, **or**
- **Delete** the script entirely — git history preserves the
  implementation if a future session genuinely needs to re-pull.

User picks at session start. Recommendation: rename with guard
(option A) — keeps the escape hatch but makes the destructive nature
explicit.

The `pnpm db:ingest:sde` script is **not** affected by this — that's
the Fuzzwork SDE pull, which legitimately stays as an ongoing
external dependency.

#### 4. Fix the two known Sheet typos in the DB and clean up the alias map

- One-off DB edit (SQL update or migration) to rename two
  `site_resources.resource_name` values:
  - `luminous kermite` → `Luminous Kernite`
  - `vivid hemorite` → `Vivid Hemorphite`
- Remove the corresponding entries from
  `src/features/wormhole-sites/resource-aliases.ts`.
- The remaining 50-ish alias entries (raw ore → compressed variant)
  stay where they are. They no longer run at all in routine ops
  (since ingest is retired/guarded), but they're useful documentation
  and they'd be needed again if anyone re-runs the reseed path.

---

## Out of scope for Phase 2.6

- An in-app admin UI for editing sites. Phase 3+.
- A diff-and-promote pipeline that lets us pull new Sheet content
  selectively. If we ever want this, it's its own future phase.
- Any change to live-price logic (`overlayLivePrices`,
  `refresh-prices`, the `market_prices` table). Those slices don't
  care about who owns the site data.
- The SDE ingest pipeline (`pnpm db:ingest:sde`) — stays as-is.

---

## Phase 2.6 success criteria

- A document exists describing every Sheet tab and what we did or
  didn't capture from it.
- Any data we wanted from skipped tabs is in the DB, with the
  schema change captured in a Drizzle migration.
- `pnpm db:ingest` no longer runs as a routine refresh — it's either
  renamed-and-guarded or removed.
- The two typo aliases are gone from `resource-aliases.ts`, and the
  corresponding DB rows have the correct names.
- A new session can edit the wormhole-site DB without worrying that
  the next ingest will wipe their changes.
- The wormhole-sites UI behaves identically before and after — this
  is a plumbing change, not a feature change.

---

## Known unknowns

- **What's actually in the unscanned Sheet tabs.** This is the
  research that drives the rest of the session. If the tabs hold
  nothing we'd want to keep, the schema-extension step is empty and
  the phase becomes mostly the retire-ingest + fix-typos work. If
  they hold a lot, the schema work could be the dominant cost.
- **How destructive to be with `db:ingest`.** Renaming + guarding is
  the conservative move; deleting is cleaner. User picks at session
  start.
- **Migration vs. ad-hoc SQL for the typo fix.** Migration is more
  durable (reproducible from a fresh DB) but heavier. Ad-hoc SQL
  works if no one ever rebuilds from scratch. Recommendation:
  migration — it's the same effort and removes the asterisk.
