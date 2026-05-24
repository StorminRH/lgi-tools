# SCRATCHPAD — LGI.tools

> Working memory across sessions. Update at the end of every session.

---

## Phase 2: COMPLETE (2026-05-23)

Phase 2 shipped the shared data plumbing every future tool will lean on:

- **`src/data/eve-data/`** — Eve SDE ingested from Fuzzwork (47 categories,
  1556 groups, 50,235 types). Public read API: `getType`, `getTypeByName`,
  `getTypesByIds`, `getTypesByNames`, `getGroup`, `getCategory`.
- **`src/data/market-prices/`** — Jita 5%-percentile prices keyed by
  type ID. One-function source swap (Fuzzwork → ESI is one file).
  Public read API: `getPrices`.
- **Wormhole site live prices.** Sheet `resource_name`s map to compressed
  SDE variants via a strict hand-authored alias dict
  (`src/features/wormhole-sites/resource-aliases.ts`). Each
  `siteResources` row carries the resolved `typeId`; missing entries
  fall back to the Sheet value silently. `overlayLivePrices` adds
  `liveIsk`/`effectiveIsk` per row at render time.
- **Refresh button + 24h cache.** Footer on `/sites`. The cache layer
  (`src/data/market-prices/cache.ts`) reads `MAX(updated_at)` and
  guards both the POST `/api/market-prices/refresh` endpoint AND the
  bare `pnpm db:refresh-prices` CLI. `--force` flag bypasses; explicit
  IDs (`pnpm db:refresh-prices 34,35,36`) bypass too for ad-hoc
  Fuzzwork checks. Cache source-of-truth is `market_prices.type_id`
  itself — the wormhole-sites ingest seeds it; the cache slice has
  zero imports from feature slices.

## Phase 2.5: COMPLETE (2026-05-23)

Cleanup pass on Phase 2's known rough edges. All shipped sessions:

- **E** ✅ Relic/data cards render killing-wave ISK as the primary
  value (treated as combat-style sites). Single derived flag
  `isWaveDriven = isCombat || isHackSite` in `SiteCard.tsx`
  substitutes for `isCombat` in four places.
- **F** ✅ Sleeper trigger chips render the Sheet's actual label
  (`Trigger`, `Opt`, `DTA`, `1st Death Trigger`, `Opt?`,
  `Trigger on Attack`) verbatim. Previously every non-null value
  collapsed to "TRIGGER".
- **G** ✅ `/api/sites` list endpoint now returns
  `sheetResourceValueIsk` instead of `resourceValueIsk` for the
  per-site rollup. Wire-shape change only — the asymmetry vs. the
  detail endpoint (which returns the live-overlaid sum under the
  neutral `resourceValueIsk` name) is intentional and now explicit.
- **I** ✅ `pnpm db:ingest:sde` uses the explicit
  `await client.end(); process.exit(0)` pattern (matching
  `refresh-prices.ts`).
- **L** ✅ Shareable `/sites/[id]` route + inline URL sync on card
  clicks. Reusable `UrlSync` primitive in
  `src/components/ui/url-sync.tsx` syncs any child `<details>`'s
  open state to `${basePath}/${entityId}`. Filter params carry
  through.

Dropped/deferred:
- **H** dropped from 2.5 — replaced by Phase 2.6 (see below).
- **J, K** deferred to Phase 2.9 (visual overhaul). Sortable list
  and search-by-name UX should be designed inside the overall
  layout pass.

## Phase 2.6: COMPLETE (2026-05-23)

Decoupled the wormhole-sites data from the upstream Google Sheet.
The local Postgres is now authoritative — the Sheet is a historical
seed, reproducible from `sheet-audit/`.

Shipped on branch `phase-2.6-sheet-decouple` and reviewed on a
Vercel preview backed by a Neon preview branch (the Vercel ↔ Neon
marketplace integration provisions one per preview deployment
automatically).

What landed:

- **Full Sheet audit** in `sheet-audit/`. Every tab the Sheet
  publishes (17 total — 8 already in DB, 9 previously ignored) is
  documented in `sheet-audit/tabs-summary.md`. Raw CSV dumps live
  in `sheet-audit/raw/` and the per-table seed snapshots in
  `sheet-audit/seed-source/`. Re-runnable via
  `pnpm tsx sheet-audit/fetch-tabs.ts` and `…/extract-seed.ts`.
- **Reverse-engineering report** in
  `sheet-audit/calculations-report.md`: per-sleeper DPS / EWAR / EHP
  derive from a hidden **Sleeper Data** tab (raw `dgmTypeAttributes`
  per sleeper typeID) and a **Calculations** tab that applies the
  standard EVE turret + missile + omni-EHP formulas. The
  archetypes table now captures the Sheet's computed snapshot so
  silent upstream drift becomes detectable; a future phase can port
  the math to our own `eve-data` slice using
  `dgm_type_attributes` (not yet ingested).
- **Two new tables**: `escalations` (Drifter Response BS, Drifter
  Recon BS, Upgraded Avenger — the C5/C6 specials Phase 1 never
  captured) and `sleeper_archetypes` (one row per sleeper typeID,
  the durable seed of the Sheet's Calculations tab).
- **Historical seed migration** (`drizzle/0006_historical_seed.sql`)
  reproduces the full sites/waves/NPCs/resources +
  escalations/archetypes from scratch — a fresh DB now boots with
  zero Sheet dependency via `pnpm db:migrate`.
- **Routine ingest retired**: `pnpm db:ingest` (and `:prod`) gone;
  replaced by `pnpm db:reseed-from-sheet --confirm-wipe`, which
  refuses to run without the flag. The clean-exit pattern was
  already in place. `pnpm db:ingest:sde` is untouched.
- **Typo fixes**: `drizzle/0007_fix_typos.sql` UPDATEs
  `luminous kermite`→`Luminous Kernite` and
  `vivid hemorite`→`Vivid Hemorphite`. The two typo entries are
  removed from `src/features/wormhole-sites/resource-aliases.ts`;
  the ~50 ore→compressed aliases stay as documentation and reseed
  support.

The wormhole-sites UI is unchanged — this was a plumbing pass, not
a feature pass. The `escalations` and `sleeper_archetypes` tables
are seeded but not yet surfaced anywhere; reading them is a future
feature's job.

PHASE_2.6_PLAN.md is archived in `../LGI Tools Document Archive/`.

## Version 2.7.3: COMPLETE (2026-05-24)

Three-pass repo sweep before any 3.0 work. Shipped as three sequential PRs;
forensic record of every deletion / fix / decision lives in
`../LGI Tools Document Archive/VERSION_2.7.3_CLEANUP_LEDGER.md` so it survives
future cleanup passes.

What landed:

- **Pass 1 — dead code + unused deps** ([PR #4](https://github.com/StorminRH/lgi-tools/pull/4)).
  Added `knip` as a standing devDep + `pnpm knip` script. Deleted `Chevron`,
  `HACK_DOT_TONE` (identity map), the speculative `getType` / `getTypeByName`
  / `getGroup` / `getCategory` helpers in eve-data, the single-arg
  `getCombatStats` + its sole-caller `getTypeAttributes`, the dead cross-module
  re-export in `wormhole-sites/ingest.ts`, and the `EveCategory`/`EveGroup`
  types they fed. De-exported a dozen items only used inside their own file.
  Refreshed the stale "migrate-if-production" architecture-invariant entry.
- **Pass 2 — efficiency + structural sweep** ([PR #5](https://github.com/StorminRH/lgi-tools/pull/5)).
  Parallelised the `waves` + `site_resources` fetches in `listSiteDetails` and
  `getSiteDetail` (one fewer round-trip's latency per detail load). Fixed the
  architecture-invariant violation in `src/components/ui/dot.tsx` —
  `DotTone` went from `'relic' | 'data'` (domain leak) to `'orange' | 'blue'`
  (abstract), with the domain → tone mapping moved into
  `wormhole-styles.ts` as a real `HACK_DOT_TONE` (Pass 1's identity map but
  doing something useful this time). Deduplicated `CACHE_TTL_MS` via a new
  `src/data/market-prices/constants.ts` that both the server cache wrapper
  and the client `RefreshFooter` import from. Audits confirmed no N+1 in the
  post-2.7.1 hot paths, no missing indexes worth adding at current row
  counts (the big tables — `dgm_type_attributes` 612k, `eve_types` 50k —
  are correctly indexed; everything else is under 1k rows), and no
  cross-slice import violations anywhere.
- **Pass 3 — security audit + hardening** ([PR #6](https://github.com/StorminRH/lgi-tools/pull/6)).
  Tightened `/api/sites/[id]` input validation: strict `^[1-9]\d*$` regex
  plus an upper-bound check against the Postgres `serial` max, replacing
  the loose `parseInt` + `isNaN` that silently accepted `"123abc"` as `123`
  and could pass too-large numbers to the DB. Pinned `esbuild >= 0.25.0`
  and `postcss >= 8.5.10` via `pnpm.overrides` to clear two moderate
  transitive-dep CVEs. Audits confirmed no SQL-injection surface
  (5 raw `` sql`` `` sites all use Drizzle parameter binding or
  compile-time identifier escapes), the `--confirm-wipe` guard on
  reseed-from-sheet is strict, the asymmetric lack of a guard on
  `db:ingest:sde` is intentional and safe (single transaction rollback),
  the sheet-audit fetcher has no SSRF/traversal surface, and the
  migrate-on-deploy chain hard-fails on migration error rather than
  half-completing. `security-review` skill confirmed the diff introduces
  no new vulnerabilities.

Snyk MCP wasn't usable — `snyk_trust` consistently timed out, likely on an
interactive consent prompt that didn't surface. Used `pnpm audit` instead.
If we want Snyk on the next pass, it'll need to be wired up out-of-band first.

`VERSION_2.7_PLAN.md` has been moved into the document archive alongside the
other shipped plans (`PHASE_2_PLAN.md`, `PHASE_2.5_PLAN.md`,
`PHASE_2.6_PLAN.md`). This SCRATCHPAD entry + the ledger are the durable
record.

## Version 2.7.2: COMPLETE (2026-05-24)

Folded into the same PR as 2.7.1 once Vercel-Neon preview branching turned out
to be a one-toggle fix. Shipped on the same branch. A follow-up
[chore PR](https://github.com/StorminRH/lgi-tools/pull/3) (`chore-archive-cleanup`,
merged the same day) doubled as the first deliberate end-to-end test of the
new workflow — Neon auto-created `preview/chore-archive-cleanup`, vercel-build
no-op'd migrate + skipped SDE auto-ingest (already populated), and the preview
API matched prod byte-for-byte. The post-merge production deploy went through
in seconds with no migrations or ingest needed (already at 0009).

What landed:

- **Preview branching is on.** The Vercel ↔ Neon integration's "Create
  Database Branch For Deployment" toggle (Preview + Production both checked,
  Required Active Resource ON) was flipped via the Vercel Storage panel.
  Confirmed: pushing to a feature branch creates a `preview/<branch-name>`
  Neon branch forked from main, with the per-branch DATABASE_URL injected
  into the preview deployment at runtime. Production is no longer at risk
  from PR work.
- **`migrate-if-production.ts` is gone.** `pnpm vercel-build` now runs
  `tsx src/db/migrate.ts && tsx src/db/ingest-sde-if-empty.ts && next build`.
  Each preview branch self-migrates; the new auto-ingest step populates
  `dgm_type_attributes` on first deploy and no-ops thereafter (idempotent
  on row count). SDE ingest failures are non-fatal — build continues, per-NPC
  stats degrade to nulls until the next deploy retries successfully.
- **CI workflow.** `.github/workflows/test.yml` runs `pnpm install --frozen-lockfile`
  + `pnpm test` on every PR and on pushes to `main`. Node 24, pnpm 10,
  pnpm-store cached. Red suite blocks merge once branch protection is set.
- **CLAUDE.md Workflow section.** Documents PR-default, isolated previews,
  auto-migrate / auto-ingest on deploy, CI-as-merge-gate.

Deferred:

- **Branch protection on `main` enforcement.** GitHub gates real enforcement
  of branch protection / rulesets behind a paid plan (Pro $4/mo for personal
  repos, or any org plan) for private repos. The convention is documented in
  CLAUDE.md and observed in practice; revisit if/when we add collaborators
  or upgrade. The `Test` workflow still runs on every PR regardless and is
  visible as a status check — just not as a merge-blocker.

## Version 2.7.1: COMPLETE (2026-05-24)

The wormhole-sites combat numbers are now computed live from raw EVE SDE
attributes — no more pre-baked Sheet values rotting in the DB. Shipped on
branch `version-2.7.1-own-the-math` in three commits.

What landed:

- **Raw attribute ingest**. `pnpm db:ingest:sde` now pulls Fuzzwork's
  `dgmAttributeTypes` (~3k rows, attribute metadata) and `dgmTypeAttributes`
  (~600k rows, every typeId × attributeId → value) into the existing
  `eve-data` slice. Two new query helpers — `getTypeAttributes(id)` and
  `getTypeAttributesBatch(ids)` — return a flat `{attrId: value}` map.
- **New `src/data/npc-stats/` slice**. Pure formulas for turret DPS,
  missile DPS, omni EHP, EWAR counts, movement; plus `summariseWave` for
  wave-level aggregates. Generic across sleepers / mission rats /
  incursion NPCs — anything with `dgmTypeAttributes`. `queries.ts` is the
  DB boundary; `math.ts` has zero DB imports.
- **Vitest is in**. `pnpm test` (and `pnpm test:watch`) runs the suite.
  `src/data/npc-stats/math.test.ts` validates the formulas against all 36
  sleeper rows of `sheet-audit/seed-source/sleeper-archetypes.json`. 327
  assertions, all green. Drifters tolerate ±10 ISK on EHP (a six-ISK
  Sheet authoring artefact, documented inline); Avenger's neutCount uses
  the standard /10 baseline divisor (the Sheet's special-case /20 doesn't
  matter because Avenger never appears in wave data).
- **Stat columns dropped**. Migration `drizzle/0009_drop_persisted_npc_stats.sql`
  backfills `npcs.type_id` from the archetype name before dropping eleven
  per-NPC stat columns from `npcs`, seven aggregate columns from `waves`,
  and the `sleeper_archetypes` table itself. The reseed script now refuses
  to ingest a wave whose sleeper name doesn't resolve in `eve_types`.
- **Wire format unchanged**. Spot-checked 7 sites pre-/post-migration with
  byte-identical responses, then swept all 183 historical-seed waves ×
  7 fields (1281 values). 3 values drift — all in one C5 wave whose Sheet
  total was stale (`3 × Keeper.dps = 1695` but the Sheet stored 1694).
  The live compute is now correct; the Sheet was wrong. Exactly the silent
  drift this version was built to expose.

Deferred to 2.7.4:

- **Live blue-loot ISK for combat sites**. The Sheet doesn't carry per-item
  drop quantities — only a single ISK total per sleeper baked at the
  author's snapshot prices. Building a proper drop table (EVE-Uni wiki or
  similar) is its own focused pass; combat sites continue to show the
  static `sites.blueLootIsk` until then.

VERSION_2.7_PLAN.md is archived in `../LGI Tools Document Archive/` now that
2.7.3 has shipped (the last sub-version it specified).

## Open versions

Naming convention switched from "phase" to "version" starting at
2.7. Historical PHASE_*.md files stay named as-is.

- **VERSION_2.7** (archived — see `LGI Tools Document Archive/VERSION_2.7_PLAN.md`).
  All three originally-planned sub-versions shipped (2.7.1 own-the-math,
  2.7.2 PR workflow + CI, 2.7.3 cleanup sweep). The forensic record of
  2.7.3's three passes lives at `LGI Tools Document Archive/
  VERSION_2.7.3_CLEANUP_LEDGER.md`.
- **2.7.4** (no plan doc yet) — live blue-loot ISK for combat sites,
  decoupled from 2.7.1 because the Sheet doesn't encode the drop tables
  we'd need. Source TBD (EVE-Uni wiki is the working assumption).
  Promote to `VERSION_2.7.4_PLAN.md` when work starts.
- [PHASE_2.9_PLAN.md](PHASE_2.9_PLAN.md) — pre-3.0 visual overhaul
  (also covers the J/K UX work deferred out of 2.5). Will rename
  to VERSION_2.9 when the version is actually opened.
- Phase 2, 2.5, and 2.6 historical briefs are archived under
  `../LGI Tools Document Archive/` (outside this repo) — the
  active repo only carries plan docs for work that's in-progress
  or upcoming.

## Backlog (no version assigned yet)

Loose ideas captured here so they don't get lost. No commitment
on order or scope — each gets a real plan doc when its version
slot is decided.

- **ESI login + admin dashboard.** Use EVE SSO to authenticate
  users, then gate an in-app admin surface for editing
  sites / waves / NPCs / resources directly instead of via SQL or
  Drizzle Studio. Replaces the "edit the DB by hand" workflow
  assumed in 2.6.
- **Usage analytics for the EVE Partnership Program.** Page
  views, unique users, engagement metrics in a shape suitable
  for partnership reporting. Self-hosted is probably the right
  call given player-data sensitivity; needs a privacy story.
- **Public changelog page.** A `/changelog` route visible to all
  users showing what's shipped over time. Could be auto-built
  from git tags / merged PR titles or hand-maintained — decide
  when authored.
- **"Suggest edit" / feedback button.** UI affordance for users
  to flag data corrections or send general feedback on any site
  or page. Needs a triage destination (issue queue, email,
  Discord webhook — TBD).

---

## Architecture invariants (still load-bearing)

- **Feature slice = `src/features/<name>/`.** Each feature has its own
  `schema.ts` (re-exported from `src/db/schema.ts`), `queries.ts`,
  `types.ts`, `components/`. Features never import from each other.
- **Data plumbing lives in `src/data/`, not `src/features/`.** Slices
  like `src/data/eve-data/` and `src/data/market-prices/` own ingest,
  schema, and a query API but no UI or end-user routes. Features in
  `src/features/` import from `src/data/`; data layers never import
  from features.
- **UI primitives in `src/components/ui/` are domain-agnostic.** They
  accept abstract `tone` props (`green`, `red`, …). The only file that
  knows "C5 is red" or "WEB is blue" is
  `src/features/wormhole-sites/components/wormhole-styles.ts`.
- **Enums driven from TS `as const` arrays** — Postgres types and TS
  types share one source of truth.
- **`Collapsible` is a pure `<details>`/`<summary>`** — the element
  itself stays the source of truth for open/closed state, and no
  component wraps it in React state. Chevron rotation via a single
  CSS rule in `globals.css`. **L-era exception**: a domain-agnostic
  `UrlSync` primitive (`src/components/ui/url-sync.tsx`) is allowed
  to attach a `toggle` listener to sync the URL on open/close —
  but only via the native DOM event, not by lifting state into React.
  Any future feature wanting `/<base>/[id]` deep-link URLs reuses
  the same primitive instead of duplicating the JS.
- **Lazy DB client** (`src/db/index.ts` Proxy) — connection deferred to
  first query so `next build` survives empty `DATABASE_URL` from
  `vercel env pull`. Vercel injects the real URL at runtime.
- **Validation lives in route handlers, not queries.** Queries accept
  already-typed values.
- **Local DB is authoritative.** Post-Phase-2.6 the wormhole-sites
  Sheet is a historical seed, not a live source. The DB is rebuilt
  from migrations alone. The replace-children upsert pattern still
  exists in `pnpm db:reseed-from-sheet --confirm-wipe`, but the
  guarded flag is required and there is no `:prod` variant.
- **Every deploy migrates its own branch.** `pnpm vercel-build` runs
  `tsx src/db/migrate.ts && tsx src/db/ingest-sde-if-empty.ts && next
  build`. Production migrates production; each preview deploy migrates
  the per-PR Neon branch (forked from main by the Vercel ↔ Neon
  integration). `ingest-sde-if-empty.ts` populates `dgm_type_attributes`
  on first deploy of any branch and no-ops thereafter. SDE ingest
  failures are non-fatal. Local `pnpm build` is a no-op for migrations;
  devs run `pnpm db:migrate` themselves.
- **Preview Neon branches auto-delete when the PR closes.** The
  Vercel ↔ Neon integration creates `preview/<branch-name>` per
  deployment but doesn't clean up on its own. The
  `.github/workflows/delete-neon-branch.yml` workflow fires on
  `pull_request: closed` and calls `neondatabase/delete-branch-action`
  to drop the matching branch. Requires `NEON_API_KEY` +
  `NEON_PROJECT_ID` repo secrets; if either is missing the workflow
  fails loudly without affecting anything else. Old Vercel preview
  *deployments* still linger — they're harmless and occasionally
  useful as rollback targets, so we don't auto-clean them.
- **Batched list queries.** `listSiteDetails()` returns N sites' full
  details in 3 sequential await steps for the wormhole-sites tables —
  sites → (waves + resources in parallel) → npcs — plus the
  `getCombatStatsBatch` lookup against `dgm_type_attributes` that
  follows once distinct NPC typeIds are known. Never 1 + 3N.
- **Filter UI is URL-driven anchor links** — pure RSC, shareable URLs.
- **Cache logic lives in the slice that owns the data, not the route.**
  Both the API endpoint and the CLI go through the same cache wrapper
  so a hand-crafted POST can't bypass the 24h limiter.

## Local dev boot order

```bash
docker compose up -d   # Postgres on :5433
pnpm db:migrate        # builds full DB from migrations (incl. seed)
pnpm dev               # http://localhost:3000
```

Sanity check: `curl http://localhost:3000/api/sites | jq length` → 69.

Scripts: `dev`, `build`, `db:generate`, `db:migrate`, `db:studio`,
`db:push`, `db:reseed-from-sheet` (guarded —
requires `--confirm-wipe`), `db:migrate:prod`,
`db:ingest:sde`, `db:ingest:sde:prod`, `db:refresh-prices`,
`db:refresh-prices:prod` (the `:prod` variants set
`DOTENV_PATH=.env.production.local`).

## Adding the next feature

1. New folder `src/features/<name>/` with `schema.ts`, `queries.ts`,
   `types.ts`, `components/`.
2. Re-export the schema from `src/db/schema.ts`.
3. Add API route(s) under `src/app/api/<name>/`.
4. Build composition components under
   `src/features/<name>/components/`, consuming UI primitives from
   `src/components/ui/` and adding a `<name>-styles.ts` mapping if
   tone bindings are needed.
5. Add a new tool tile to `/` landing page and (if applicable) a
   `/<name>` browser route mirroring the `/sites` pattern.
