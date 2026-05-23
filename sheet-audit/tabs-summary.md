# Sheet tab audit — Phase 2.6

Source: published Google Sheet, snapshot fetched
`{manifest.json → fetchedAt}`. 17 tabs total — 8 already ingested
by Phase 1, 9 previously unread.

## Already ingested (8 tabs)

| Tab | gid | Status | Notes |
|---|---|---|---|
| **C1** | 0 | KEEP — already in DB | Sites, waves, NPCs, resources for Class 1. |
| **C2** | 152271063 | KEEP — already in DB | …Class 2. |
| **C3** | 1157002677 | KEEP — already in DB | …Class 3. |
| **C4** | 2012494173 | KEEP — already in DB | …Class 4. |
| **C5** | 124062662 | KEEP — already in DB | …Class 5. |
| **C6** | 1314849064 | KEEP — already in DB | …Class 6. |
| **Gas** | 141191379 | KEEP — already in DB | Gas signatures + resources. |
| **Ore** | 1259304327 | KEEP — already in DB | Ore signatures + resources. |

These tabs are the human-readable "site cards" the existing
parser reads — they pull DPS/Alpha/EHP/EWAR values that the
**Calculations** tab computes from raw SDE attributes (see below).

## Previously unread (9 tabs)

### CAPTURE — model new tables for these

| Tab | gid | Why we want it | Proposed shape |
|---|---|---|---|
| **Drifter** | 1813193533 | Escalation-only spawn in C5/C6 combat sites — single Drifter Response BS or Drifter Recon BS with full stats, blue-loot, EHP min/max breakdown. Currently invisible in our app. | New `escalations` table (one row per escalation type) with siteId/null + NPC reference + spawn conditions text. |
| **Avenger** | 1160985461 | Escalation-only spawn for first capital in C5/C6 sites — Upgraded Avenger with full stat block. Same omission as Drifter. | Same `escalations` table. |
| **Calculations** | 360740101 | One row per sleeper typeID with all derived combat stats (turret/missile DPS broken down by damage type, omni EHP, resists, EWAR module counts). This **is** the formula output that feeds C1–C6 / Gas / Ore. | New `sleeper_archetypes` table — typeID PK, omni stats. Captures the Sheet's "current truth" as a durable seed so per-NPC stat changes upstream don't silently rot in our DB. |

### CAPTURE — keep raw for the future native-recompute phase

| Tab | gid | Why we want it | Proposed shape |
|---|---|---|---|
| **Sleeper Data** | 590981029 | The raw input to **Calculations**. Each column-pair is one sleeper typeID; rows are `(attributeId, value)` from EVE's `dgmTypeAttributes` table. This is the SDE feed the user predicted exists. Snapshot now so we can later regenerate DPS/EHP from our own SDE pull. | Not directly into a DB table — too narrow. Snapshot as `sheet-audit/seed-source/sleeper-attributes.json` (transposed: `{ typeId: { attributeId: value } }`) for reference. The future native-recompute phase will replace this with our own `dgm_type_attributes` ingest from Fuzzwork. |
| **Missile Data** | 345568467 | Same column-pair shape, three sleeper missiles (Phantasmata, Praedormitan, Oneiric). Inputs to the missile-DPS calc. | Same — snapshot to `sheet-audit/seed-source/missile-attributes.json`. |

### SKIP — redundant or out of scope

| Tab | gid | Why skip |
|---|---|---|
| **Market Data** | 421910724 | Raw `typeID → avgPrice / adjustedPrice` from ESI. Our `market-prices` slice already fetches Jita 5%-percentile from Fuzzwork; that's strictly better for wormhole loot pricing than averaged/adjusted ESI prices. |
| **Gas/Ore Data** | 16967167 | Per-resource `Name + m³ + ISK/m³`. Same data we already store in `site_resources` (units / volumeM3 / iskPerM3 / totalIsk). The Sheet typos confirmed here are upstream — they propagate into C1–C6 cells too (handled in Step 4 of the plan). |
| **Refine Data** | 716251505 | Ore → mineral refine yields. Out of scope for the wormhole-sites feature; would belong in a future industry/refining feature if we ever build one. Snapshot only if a future phase wants it. |
| **Update** | 349639088 | Changelog / maintainer notes. Useful for the audit narrative (e.g. the 2026-02-03 note about an EHP/ISK inconsistency on bonus-NPC sites) but no DB representation. |

## Decisions implied for Step 2

- New table: `escalations` (Drifter, Avenger) with FK to `sites` for the
  parent site where they spawn — nullable for the rare escalation that
  applies broadly (the two we have today both apply to all C5/C6 combat
  sites, so for v1 we model them as standalone rows with a `triggerNotes`
  text field rather than per-site joins).
- New table: `sleeper_archetypes` (one row per sleeper typeID) containing
  the Sheet's computed combat stats. The existing `npcs` table keeps its
  per-NPC stat columns — they remain the per-wave answer the UI reads
  today — but the archetype row is the durable seed they came from.
- New JSON snapshots in `sheet-audit/seed-source/`:
  - `sleeper-attributes.json` — raw SDE attribute dump per sleeper typeID.
  - `missile-attributes.json` — same for the three missile types.
  - `sites.json`, `waves.json`, `npcs.json`, `resources.json`,
    `escalations.json`, `sleeper-archetypes.json` — produced by
    `extract-seed.ts` from the current DB and consumed by the
    historical-seed migration.

The raw-attributes snapshots are reference material for the future
native-recompute phase. They are committed to the repo so a fresh
clone can rebuild the DB plus regenerate the reverse-engineering report
without re-fetching the Sheet.
