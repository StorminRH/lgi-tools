# LGI.tools — EVE Data Source Index

> **Purpose.** One place that answers "where does *this* data live, and what are its exact
> fields?" so ingest/feature work never turns into a field hunt again. It does NOT duplicate the
> full field schemas — those are auto-generated and always-current (below). It records the
> **authoritative indexes**, the **standing look-it-up-first rule**, and a **curated domain → source
> map** of what we've resolved (with the semantic gotchas the raw schema won't tell you).

---

## Standing rule (the actual fix for field-hunting)

**Before any SDE/ESI ingest or data-shape work, consult the authoritative index for the exact file
+ field names — never guess them.** CCP states this directly (Equinox-on-ESI devblog, 2026-05-19):
the OpenAPI spec + API Explorer are the source of truth for ESI field names/scopes/cache timings,
and the SDE schema docs are the source of truth for static files. This mirrors the Context7
"verify live library docs first" rule. The 3.7.2.2 wormhole-effect dead-end (guessing
`visualEffect` instead of checking the schema, which would have shown `mapSecondarySuns`) is the
failure this rule prevents.

---

## The authoritative indexes (auto-generated, always current — use these first)

| Source | What it is | URL | Use for |
|---|---|---|---|
| **SDE schema docs (Nohus)** | Per-file, per-field JSON Schema + code snippets for every SDE JSONL file, regenerated every SDE release. **CCP officially links it.** | `sde.riftforeve.online` (linked from `developers.eveonline.com/docs/community/sde-schema/`) | The conclusive SDE field index — every file, every field, required/optional, types. |
| **SDE download + changes feed** | The data itself + a per-build changes JSONL + always-latest redirect URLs; full ETag/Last-Modified. | `developers.eveonline.com/docs/services/static-data/` · `…/static-data/eve-online-static-data-latest-jsonl.zip` | Ingest source; detect new builds cheaply (ETag); see what changed per build. |
| **ESI OpenAPI / API Explorer** | The live API. Swagger/OpenAPI — endpoints, fields, scopes, cache timings, all auto-current. | `esi.evetech.net/ui/` | The conclusive index for **live** data (anything dynamic). Source of truth for field names + required scopes. |
| **EVE Ref Reference Data** | A single MERGED dataset (SDE + ESI + Hoboleaks) in one common format; REST API + full OpenAPI + bulk download. | `docs.everef.net/datasets/reference-data` | One-stop merged lookup. Caveat: normalized/corrected (not a byte copy of the SDE/ESI); "in development, may change" — confirm against the primary source for anything load-bearing. |
| **Fuzzwork** (Steve Ronuken) | SDE in SQL (SQLite/Postgres/MySQL/CSV) using legacy table names. | `fuzzwork.co.uk/dump/` | Fallback / SQL-shaped ingest; legacy table names if a tool expects them. |
| **Hoboleaks** | Client-extracted data that is in neither the SDE nor ESI. | (via EVE Ref / community) | The gap-filler of last resort for client-only data. |

**The three-source model:** there are three primary data sources — **SDE** (static), **ESI**
(live), and **Hoboleaks** (client-extracted). They are *not* equal: data exists in one and not the
others. CCP's stated long-term goal is to fold the SDE into ESI, but they are not there yet (e.g.
industry recipes still require the SDE). When something isn't where you expect, check the other two
before concluding it's a true gap.

---

## External-data / independence policy

Self-reliance first, and **keep the external source set minimal** (a small curated preferred set,
not 10 sources for 10 things). Maximize SDE / ESI / our own derivation before reaching for any
third party. When a true gap remains, *how* we consume the external source matters more than
whether we do:

1. **Static missing data → ingest a controlled COPY** (same pattern as the SDE/ESI ingest): pull
   on a schedule into Neon, serve from our copy, pin + version the snapshot. The external source is
   a **refresh feed, not a runtime dependency** — it can go down and we keep running off the last
   good copy. This is *more* independent than live-calling, and is the default for any static
   external data (e.g. per-system WH statics from an anoik.is-derived copy).
2. **Inherently-live missing data → reliable API as a graceful, NON-BLOCKING enhancement** (you
   can't own a copy of data that changes minute-to-minute). Short cache, degrade to stale/absent if
   it's down, **never block core function**. Examples: eve-scout live Thera/Turnur connections;
   killmail feeds. Enhancement layer, never foundation.

**Preferred-sources discipline:** default to the CCP primaries (official SDE JSONL + ESI, both
owned-copy). Add an external gap-filler ONLY for a genuine gap, and prefer reusing one already in
the set over introducing a new one. Confirm the canonical minimal source list when the first gap
feature (v4.0 statics) lands.

Guardrail: treat **every** EVE third-party API as something that can vanish or change without
notice — pin, version, cache, degrade gracefully. No third party is ever load-bearing for a page.

*Long-term aspiration (NOT current policy): crowdsourcing our own scan data — users' scan reports
build the statics dataset over time. Needs a user base + on-site capture tools; revisit far down
the road.*

---

## Curated domain → source map (what we've resolved)

Legend: **SDE** = static export · **ESI** = live API · **EXT** = external/community · **GAP** =
not cleanly available anywhere. "Shipped" = already ingested/consumed in the app.

| Data | Source | Exact location | Status / notes |
|---|---|---|---|
| Solar systems / regions / constellations | SDE | `mapSolarSystems` / `mapRegions` / `mapConstellations.jsonl` | Shipped 3.7.2.2 (system carries both `constellationID` + `regionID`). |
| K-space jump adjacency | SDE | derive from `mapStargates.jsonl` (`solarSystemID` ↔ `destination.solarSystemID`) — no pre-built jumps file in JSONL | Shipped 3.7.2.2 → `eve_system_jumps`. |
| WH system **class** | SDE | `wormholeClassID` on system → constellation → region (most-specific wins); enum 1–6=C1–C6, 7=HS, 8=LS, 9=NS, 12=Thera, 13=C13, 14–18=Drifter, 25=Pochven | Shipped 3.7.2.2 → `wormhole_class_id`. |
| WH system **effects** (Pulsar/Magnetar/…) | SDE | `mapSecondarySuns.jsonl` → `effectBeaconTypeID` → `types.jsonl` group **920** (typeIDs 30844–30884); ~40% of J systems, absence = none | **Not yet ingested** — candidate near-term session. (Corrected: NOT the `visualEffect` field.) |
| WH **type defs** (A009/K162: mass/lifetime/target-class) | SDE | `types.jsonl` group **988** (130 types) + dogma attrs (target-class, max-stable-time/mass, max-jump-mass, mass-regen, target-distribution) | **Not yet ingested** — powers the v3.8 wormhole codex; no external dep. |
| WH **per-system statics** (which static a J-system spawns) | EXT / GAP | eve-scout API (`api.eve-scout.com`) = LIVE Thera/Turnur connections ONLY; general per-system statics = anoik.is-derived (no clean API → periodic import) or crowdsourced scans | v4.0 mapper, related table; never blocks core mapper. The one genuine WH gap. |
| Celestials (planets/moons/belts/stars) | SDE | `mapPlanets` / `mapMoons` / `mapAsteroidBelts` / `mapStars.jsonl` (enhanced variant adds `name`) | Available; not yet ingested. |
| System security status | SDE | on `mapSolarSystems` | Shipped (universe ingest). |
| NPC faction (static ownership) | SDE | `factionID` on system/constellation/region | Available. (Live player sovereignty is ESI — below.) |
| NPC stations | SDE | `npcStations.jsonl` | Shipped 3.5.1a → `eve_npc_stations`. |
| Blueprints / activities / invention | SDE | `blueprints.jsonl` (full `activities` blob: materials/products(+probability)/skills/time) | Shipped 3.7.2.1 read path (`parseBlueprintActivities`). |
| Types / groups / categories / dogma | SDE | `types` / `groups` / `categories` / `dogmaAttributes.jsonl` | Shipped (core ingest). |
| Industry cost indices + adjusted prices | ESI | `/industry/systems/` (+ CCP adjusted prices) | Shipped 3.5.1b daily cron. |
| Market prices / orders | ESI | `/markets/{region}/orders/`, `/markets/prices/` | Shipped. |
| Market history | ESI | `/markets/{region}/history/` (legacy error-limit, not token bucket; daily ~11:02 UTC recompute) | Shipped 3.5.3. |
| Character skills / skill queue / industry jobs | ESI | `/characters/{id}/skills|skillqueue|industry/jobs/` | Shipped (the 4 current scopes). |
| Corp industry jobs | ESI | `/corporations/{id}/industry/jobs/` (needs corp scope + in-game role) | 3.7.3.1 (new scope + role-403 handling). |
| Live player **sovereignty** | ESI | `/sovereignty/map`, `/sovereignty/structures`, and the newer combined `/sovereignty/systems` (2026-05 Equinox) | Future; NOT in SDE. |
| **Incursions** | ESI | `/incursions/` (List incursions — live state + constellation) | Future K-space feature; live, ESI. |
| System kills / jumps (activity heat) | ESI | `/universe/system_kills/`, `/universe/system_jumps/` | Future; live. |
| Player current location / online / ship | ESI | `/characters/{id}/location|online|ship/` (needs `read_location`/`read_online`/`read_ship_type` — dropped in 3.7.1.1, re-add when a feature consumes it) | Future; scope-gated. |
| **Storms** (metaliminal / weather) | GAP (verify) | NOT in the standard ESI endpoint set; not static (they move) → likely Hoboleaks or not exposed | **Verify at feature time** — treat as a possible true gap like statics until confirmed. |

---

## How to extend this doc

When a new feature needs data, before writing ingest: (1) check the **SDE schema docs** for static
fields and the **ESI API Explorer** for live ones; (2) add a row here with the resolved source +
exact file/endpoint + any semantic gotcha (the thing the raw schema won't tell you); (3) if it's a
true GAP, note the external option and that it must not block core functionality. One row per data
domain; update when its status changes (e.g. "not yet ingested" → "shipped 3.x").
