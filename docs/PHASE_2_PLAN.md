# LGI.tools — Phase 2 Plan

## What this is

Phase 2 builds the data plumbing that every future LGI.tools feature
will lean on: live market prices and Eve's Static Data Export (SDE),
housed in their own feature slices and decoupled from any consumer.

Phase 1 shipped a complete public wormhole site browser. The only
phase 2 consumer of the new plumbing will be the wormhole site
cards' resource values — today a fixed value from the source Sheet,
soon Jita 5%-percentile buy prices. Phase 3 (a public industry
helper) and beyond (personalized ESI / SSO tools) reuse the same
plumbing without further infrastructure work.

---

## How to use this document

This is written for an agent operating in plan mode. The session
descriptions are deliberately non-prescriptive: they describe
**what** must be true at the end, not **how** to get there. Form
your own implementation plan.

Before starting any session:

1. Read [CLAUDE.md](../CLAUDE.md), [AGENTS.md](../AGENTS.md),
   and [SCRATCHPAD.md](../SCRATCHPAD.md) — project-wide
   principles that override anything in this document.
2. Read the **Decisions already made** section below — these apply
   to every session and should not be re-litigated.
3. Read the relevant **Session** section and the files it points
   you to.
4. If anything is ambiguous in a way that materially affects the
   plan, ask the user before presenting. Each session has a
   **Known unknowns** subsection flagging questions worth asking.

---

## Decisions already made

These were settled during planning. Apply them unless something
during implementation forces a revisit (in which case, pause and
flag it).

- **Market data source for phase 2:** [Fuzzwork Market
  API](https://market.fuzzwork.co.uk/). Aggregated Jita
  percentiles, no auth, well-documented, used widely.
- **ESI-swap requirement:** all Fuzzwork-specific code must sit
  behind one function. Swapping to ESI in a future phase replaces
  that function only — no schema changes, no consumer changes, no
  cron changes.
- **Static data source:** [Fuzzwork SDE
  dumps](https://www.fuzzwork.co.uk/dump/). SQL/CSV pre-converted
  from CCP's YAML — much easier ingest than parsing CCP's official
  SDE.
- **Slice locations:** `src/data/eve-data/` for SDE,
  `src/data/market-prices/` for prices. They live under
  `src/data/`, NOT `src/features/`, because they are shared data
  layers — no UI, no end-user routes, just ingest and a query API.
  `src/features/` is reserved for user-facing features
  (`wormhole-sites` today, `industry` later). Features import from
  `src/data/`; data layers never import from features. Two
  features never import from each other.
- **Price column to display:** Jita 5%-percentile **buy** price —
  what a seller realistically receives.
- **Region scope:** Jita (region 10000002) only. Other regions and
  structure markets are deferred indefinitely.
- **Card UI changes:** none visible. Layout, typography,
  formatting, and labels stay pixel-identical to phase 1. Only the
  underlying value source changes.
- **Sheet values:** retained in the DB alongside live values. Not
  displayed. They serve as fallback when a live price is missing
  and leave the door open for a future comparison view without
  re-plumbing.
- **Scheduling:** no cron in phase 2. A user-facing refresh button
  with a 24-hour cache replaces it (Session D).
- **Decoupling:** `market-prices` and `eve-data` must not import
  from any consumer feature. Consumers import from them, never the
  reverse. Inter-slice dependencies between `market-prices` and
  `eve-data` go through type IDs (numbers), not function imports
  — neither slice should know the other exists.
- **Public API surface:** each slice exposes a small,
  query-function-only API (e.g. `getPrices`, `getTypeByName`). No
  raw Drizzle handles, no schema imports outside the slice except
  the central re-export in `src/db/schema.ts`.

---

## Sessions

### Session A — SDE plumbing

**Goal.** Eve Static Data Export is ingested into the database and
queryable through a clean read API from a new `eve-data` feature
slice. Other features can ask "what's the type ID for X?" and
"what's the type record for ID N?" without knowing how the data
got there.

**Already decided.**

- Source: Fuzzwork SDE dumps (SQL/CSV form)
- Tables to ingest in this session: types, groups, categories —
  the minimum needed for type lookup and basic taxonomy
- Ingest is a manual command, same pattern as `pnpm db:ingest`

**Out of scope (defer to later phases).**

- Blueprints, manufacturing materials, reactions (phase 3)
- Regions, solar systems, constellations (when a consumer needs
  them)
- Stations, structures, NPC corps, factions
- Anything CCP publishes via SDE that no current consumer needs

**Constraints.**

- Slice path: `src/data/eve-data/`. Layout mirrors
  `src/features/wormhole-sites/` minus `components/` (no UI).
- Schema re-exported from `src/db/schema.ts` so drizzle-kit sees
  it.
- Public surface: small, named query functions (e.g. `getType`,
  `getTypeByName`, `getTypesByIds`). Name lookups are case-
  insensitive.
- The SDE fetcher (downloading the dump) lives in a module
  distinct from the parser/upserter, so a future source swap is
  one file.
- Lazy DB client pattern from `src/db/index.ts` must continue to
  work for `next build` with empty `DATABASE_URL`.

**Verification.**

- `pnpm db:ingest:sde` (or however the agent names it) populates
  types/groups/categories. Row counts roughly match what Fuzzwork
  publishes — ~50K types, ~2K groups, dozens of categories.
- A debug API route or test confirms `getTypeByName('Veldspar')`
  returns a record with the correct typeID.
- `pnpm build` succeeds. Type check is clean.

**Files to read before planning.**

- `src/features/wormhole-sites/schema.ts`
- `src/features/wormhole-sites/queries.ts`
- `src/features/wormhole-sites/ingest.ts`
- `src/db/schema.ts`, `src/db/ingest.ts`, `src/db/index.ts`
- `package.json` (script naming conventions)

**Known unknowns to surface to the user.**

- Whether to ingest the entire types table (~50K rows) or filter
  to marketable / published types only. Recommendation: ingest
  everything — disk is cheap, future-proof, and avoids re-ingest
  later. Confirm with user.

---

### Session B — Market price plumbing

**Goal.** Jita market prices are stored in the DB, keyed by type
ID, and queryable in batch from a new `market-prices` slice. A
manual command populates them from Fuzzwork.

**Already decided.**

- Source: Fuzzwork Market API. The fetcher is one function that
  takes type IDs and returns a normalized shape — swapping to ESI
  later replaces this function only.
- Columns to store per type: best-sell, best-buy, 5%-percentile
  sell, 5%-percentile buy, last-updated timestamp. (Naming is the
  agent's call.)
- Manual ingest command: `pnpm db:refresh-prices` (or similar).
  24-hour cache wrapping is added in Session D — keep that
  separable.
- Type IDs to refresh come from the caller. This slice does not
  decide which types to track. Consumers pass IDs in.

**Out of scope.**

- Regions other than Jita
- Structure markets
- Price history / time series
- Scheduled refresh / cron
- Any per-character or per-corp pricing

**Constraints.**

- Slice path: `src/data/market-prices/`. Same conventions as
  `eve-data` — schema, ingest, queries, types; no UI.
- Public surface: `getPrices(typeIds: number[])` returning a map
  keyed by typeID. One read function. Consumers pass IDs, receive
  prices.
- The fetcher must NOT import from `eve-data` or any other
  feature slice. It works in pure type-ID-as-number space.
- The fetcher must batch requests when Fuzzwork supports it.
  Don't loop and hit one type at a time.

**Verification.**

- Running the refresh command with a small list (e.g. typeIDs 34,
  35, 36 — tritanium / pyerite / mexallon) populates the prices
  table.
- Re-running is idempotent — same prices, updated timestamp.
- A debug route or quick test confirms `getPrices([34, 35])`
  returns the expected shape with all four price values populated.

**Files to read before planning.**

- The Session A output (the new `eve-data` slice)
- Fuzzwork Market API docs (current endpoint shape)
- `src/features/wormhole-sites/queries.ts`
- `src/db/index.ts`

**Known unknowns to surface to the user.**

- Whether to enforce a maximum batch size per Fuzzwork request, or
  hand the whole list at once. Depends on Fuzzwork's current
  limits — agent should check and confirm an approach with the
  user.

---

### Session C — Live prices in wormhole site cards

**Goal.** Wormhole site cards display live Jita 5%-percentile buy
values for resources instead of the fixed Sheet value. The UI
layout, typography, and formatting are pixel-identical to phase
1. When a live price is missing, the Sheet's fixed value is used
silently as fallback.

**Already decided.**

- The existing sheet ingest (`src/features/wormhole-sites/ingest.ts`)
  resolves each resource's type ID at ingest time by calling
  `eve-data`'s name lookup. The resolved type ID is stored on the
  resource row.
- Sheet-reported resource values are retained in the DB. Live
  values are computed and stored alongside (column names are the
  agent's call — `sheet_*` / `live_*` is a sensible convention but
  not mandated).
- The card and any aggregate displays render the live value when
  available, fall back to the Sheet value silently when not.
- Resource names that don't map to a known type (e.g. relic/data
  container loot, which isn't ingested today per SCRATCHPAD's
  known rough edges) continue to render exactly as they do today.

**Out of scope.**

- Any visible indicator that prices are live (badge, tooltip,
  timestamp on the card)
- Stale-price warnings
- Side-by-side Sheet vs live comparison views
- The refresh button (Session D)
- Fixing the relic/data container loot ingest gap noted in
  SCRATCHPAD

**Constraints.**

- The `wormhole-sites` slice imports from `eve-data` and
  `market-prices` only through their public query APIs. No
  reaching into internals.
- The existing sheet ingest must succeed end-to-end even if
  `eve-data` is unpopulated — degrade gracefully by leaving
  `type_id` null and rendering the Sheet value at the card.
- No file outside `wormhole-sites` is edited except the central
  schema re-export.
- Phase 1's UI is the visual contract. The `/preview/cards`
  reference page is the design-system snapshot; cards on `/sites`
  should still match it when MOCK_SITES is rendered there.

**Verification.**

- Cards on `/sites` show resource ISK values that match Fuzzwork's
  published Jita 5% buy prices for the relevant ores (spot-check
  several types).
- Manually clearing the prices table or pointing the slice's
  `getPrices` at an empty source reverts cards to Sheet values —
  no error, no visible UI change beyond the numbers.
- `pnpm db:ingest` (the existing Sheet ingest) succeeds; resource
  rows now carry a `type_id` where a mapping exists.
- `/api/sites` and `/api/sites/[id]` return live values without
  schema breakage (the existing API contract is preserved — see
  SCRATCHPAD note about stability since Session 4).

**Files to read before planning.**

- Everything in `src/features/wormhole-sites/` — especially
  `ingest.ts`, `queries.ts`, `schema.ts`,
  `components/SiteCard.tsx`, `components/ResourceRow.tsx`
- The SCRATCHPAD "Architecture invariants" section, particularly
  "Replace-children on ingest upsert" and "Batched list queries"
- The output of Sessions A and B

**Known unknowns to surface to the user.**

- The Sheet's `resource_name` values may not map 1:1 to SDE type
  names (e.g. compressed vs uncompressed ore variants, generic
  names that conflate variants). Before committing to a mapping
  strategy, inspect a sample of real `resource_name` values from
  the DB and confirm the mapping rules with the user. Don't guess
  silently.

---

### Session D — Refresh button with 24-hour cache

**Goal.** A user-facing button somewhere in LGI.tools triggers a
market-price refresh, but the refresh is skipped (and the cached
data served) if the last refresh was less than 24 hours ago. The
button reports clearly to the user whether the click refreshed or
hit the cache, and when the data was last updated.

**Already decided.**

- Cache key: `MAX(updated_at)` on the `market-prices` table. <24h
  ago → cached (no Fuzzwork call). >=24h ago or empty → refresh.
- The button is public. No auth gate. The 24-hour cache is the
  rate limiter.
- The button calls a protected API endpoint that enforces the
  cache check server-side (so a hand-crafted request can't bypass
  it).
- The response always includes freshness info — when the data was
  last refreshed and whether this call refreshed or cached.

**Out of scope.**

- Cron / scheduled refresh (Vercel Cron, GitHub Actions, etc.)
- Auth gating, login flows, user accounts
- Per-IP rate limiting (the cache covers it)
- Background processing if refresh exceeds Vercel's function
  timeout (mitigate by batching in-request if needed; defer
  bigger architecture)

**Constraints.**

- Cache logic lives in the `market-prices` slice — specifically
  wrapping the ingest function, not the route. Calling the ingest
  function directly from CLI must also respect the cache. An
  explicit `--force` flag is acceptable for dev override.
- Button placement: agent's call — pick a natural, unobtrusive
  location and justify in the plan. Acceptable patterns: a small
  "data freshness" footer on `/sites`, an `/admin` route, or
  something equivalent. New top-level page is fine if justified.
- The button must not disrupt the existing card layout or page
  flow. Phase 1's UI contract stands.
- Status messaging must be clear in both states — refreshed and
  cached. No silent no-ops.

**Verification.**

- Click button with stale (>24h) or empty data: refresh runs,
  status reports the new timestamp.
- Click button again within 24h: cached response, no Fuzzwork
  request, status indicates cache hit and shows last-refresh
  time.
- `pnpm db:refresh-prices` (no flag) respects the cache.
- `pnpm db:refresh-prices --force` (or equivalent) always runs.
- Backdating `updated_at` in the DB to >24h ago unblocks the next
  button click.

**Files to read before planning.**

- Session B output (`market-prices` slice)
- `src/app/api/sites/route.ts` — public-API conventions in this
  project
- Any existing patterns for `/api/*` routes

**Known unknowns to surface to the user.**

- Button location. Pick one (`/sites` footer is the default
  recommendation since it's the only phase 2 consumer of the
  data) but confirm with the user before implementing.

---

## Phase 2 success criteria

When all four sessions ship, every one of these is true:

- Wormhole site cards display resource ISK values that reflect
  current Jita market prices, refreshed at most every 24 hours by
  user action.
- Phase 1's UI is pixel-identical — layout, typography,
  formatting, all unchanged.
- A new feature that wants live prices imports from
  `market-prices` with one function call and never touches
  Fuzzwork or ESI directly.
- A new feature that wants Eve type data imports from `eve-data`
  with one function call and never touches the SDE directly.
- Swapping the price source from Fuzzwork to ESI is a single-file
  change inside `market-prices` — no schema migration, no card
  changes, no consumer changes.

---

## Phase 3 preview (informational only — not part of phase 2 scope)

Phase 3 ships the first **public industry helper** — a tool
anyone can use without logging in. Probable shape:

- A new `/industry` route with calculator(s) for one focused
  workflow (manufacturing profitability is the strongest
  candidate).
- Reads live ISK values via `market-prices`.
- Reads recipes and material requirements from `eve-data`. New
  SDE tables (blueprints, materials, reactions) get added to the
  existing slice during phase 3 — phase 2 builds the foundation,
  phase 3 extends it.

Phase 4 introduces authenticated ESI / SSO. The helpers built in
phase 3 then evolve into personalized versions.
