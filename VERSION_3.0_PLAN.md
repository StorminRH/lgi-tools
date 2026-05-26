# LGI.tools — Version 3.0 Plan

## What this is

Version 3.0 ships **the first public industry helper** — LGI.tools'
second live tool after Wormhole Sites. The Phase 2.9 envelope was
designed to receive a second tool natively: the cross-tool nav, the
landing grid, the search registry, the shared visual primitives all
exist so that adding Industry is a content/data task, not a chrome
redesign.

Before the industry helper itself ships, 3.0 closes out some search-
platform plumbing that was designed in 2.9.4 but deliberately deferred
until a real consumer earned its weight. The Industry Planner's
blueprint and material data is exactly that consumer — it brings the
first large searchable dataset to the platform, which makes fuzzy
matching, async/lazy-loaded sources, and the cleaner command-row
contract suddenly worth the cost.

---

## How to use this document

Detailed sub-version planning happens at the start of each session.
This doc establishes the slate, sub-version ordering, and the
high-level shape of the industry helper — not the implementation
details.

Read [CLAUDE.md](CLAUDE.md), [AGENTS.md](AGENTS.md),
[SCRATCHPAD.md](SCRATCHPAD.md), and
[VERSION_2.9_PLAN.md](VERSION_2.9_PLAN.md) before drafting any 3.x
sub-version plan.

---

## Decisions already made

- **3.0 begins after 2.9.7 ships.** The cross-site table view in
  2.9.7 is the last 2.9 piece — its merge triggers archiving
  `VERSION_2.9_PLAN.md` to the document archive.
- **Search platform plumbing comes first, industry helper second.**
  The Industry Planner is the consumer that justifies the plumbing;
  shipping the plumbing first means the Industry Planner's blueprint
  index slots into the existing search dropdown on day one, no
  parallel UI work.
- **The Industry Planner is the headline feature.** Manufacturing
  profitability for blueprints and reactions, integrated with the
  existing `eve-data` SDE slice for materials/recipes and the
  `market-prices` slice for ISK math.
- **Schedule philosophy.** 3.0 wraps within five sub-versions
  (3.0.1 — 3.0.5). If scope balloons, slip work into 3.1 rather
  than letting 3.0 sprawl indefinitely.

---

## Sub-version sketch

Detailed plans get written at the start of each sub-version. These
sketches establish ordering and rough sizing.

### 3.0.1 — Search platform extension (plumbing)

Closes the three 2.9.4 carry-forwards in one focused PR. Each item
is small individually; bundling makes sense because they all touch
the same primitive (`src/data/search/` registry + `GlobalSearch`
component).

- **Fuzzy matching.** Replace strict substring matching with a
  fuzzy matcher — likely `fuzzysort` or similar lightweight library
  (no Levenshtein-from-scratch). Each source's matcher returns
  scored results; the dispatcher merges + sorts. "ffrd" finds
  "Forgotten Frontier Recursive Depot."
- **Async source contract honored with `AbortController`.** When the
  user types fast, in-flight async searches get cancelled. Today's
  sync sources don't care, but the Industry Planner's blueprint
  index will be the first source large enough that a stale "for"
  result coming back after the user has typed "form" would be
  visible.
- **Lazy-loaded source pattern.** Document and demonstrate the
  dynamic-`import()` pattern for large sources. The Sites source
  stays eager (small payload); the future Blueprints source loads
  its index only on first search interaction. The `setSourceData`
  setter pattern from `wormhole-sites/search.ts` generalizes here.
- **`onSelect?: (router) => void` callback on `SearchResult`.**
  Replaces the hidden-form trick for `Log out` in
  [src/components/GlobalSearch.tsx](src/components/GlobalSearch.tsx).
  Each command row carries its own click behavior; the dispatcher
  just calls it. Generic across any future command-with-side-effect.

**Sizing:** medium. One session.

### 3.0.2 → 3.0.5 — Industry Planner

The headline 3.0 feature. Detailed planning happens after 3.0.1
ships. Probable session shape:

- **3.0.2 — data foundations.** Ingest blueprint + material data
  from Fuzzwork into the `eve-data` slice. New tables for
  blueprints, blueprint materials (inputs/outputs), and
  manufacturing/reaction job parameters. Pure data work.
- **3.0.3 — math + queries.** Profitability calculations:
  material costs (live Jita), output sell price (live Jita), job
  fees, ME/TE efficiency, daily run capacity. Pure-function math
  module testable against known good values. New
  `src/data/industry-math/` slice modeled on `npc-stats`.
- **3.0.4 — UI surface.** New route `/industry`. Search for a
  blueprint by name (now reachable through the global search via
  the Blueprints source registered in 3.0.1), see profitability
  breakdown, tune ME/TE, see margin estimates. Card-based layout
  matching the wormhole-sites visual vocabulary.
- **3.0.5 — polish + landing tile activation.** The "Industry
  Planner" tile on `/` flips from `Coming Soon` to `LIVE`. Nav
  strip `Industry Planner` becomes a real link. Cross-tool nav
  works exactly as the 2.9 envelope was designed for.

Slot count is provisional. Industry-helper sessions might compress
or expand depending on how clean Fuzzwork's blueprint data turns
out to be.

---

## Out of scope for Phase 3.0 (or beyond)

- **Live blue-loot for combat sites.** Still deferred. Direction
  remains: hand-authored sleeper drop tables, possibly via an
  in-app wiki-style admin editing surface. When this lands it gets
  its own phase.
- **Mobile-first responsive (Level 2/3).** Defer until after 3.0
  ships, then re-evaluate based on actual mobile usage telemetry.
  Defensive Level 1 in 2.9.6 should be enough until then.
- **Multi-character or alt support in industry math.** First
  industry pass assumes a single character context — your skills,
  your standings. Multi-char dashboards are a later phase.
- **Killmail integration, fits browser, sleeper analytics.** All
  listed in the SCRATCHPAD backlog. Future phases.

---

## Phase 3.0 success criteria

When 3.0.5 ships:

- A visitor lands on `/`, sees Wormhole Sites + Industry Planner
  both live (and Wormhole Roll Calc still Coming Soon).
- Typing a blueprint name into the global search jumps directly to
  its profitability page — no separate search affordance needed.
- Profitability calculations match a manual spreadsheet check
  against current Jita prices to within rounding tolerance.
- Switching between Wormhole Sites and Industry Planner is one
  click in the nav.
- The Industry Planner feels like a sibling tool, not a separate
  site — same chrome, same tones, same primitives.
- The search registry honors async sources cleanly; typing "M" and
  then "MEG" returns Megathron-related blueprints (not stale "M"
  results overwriting them).

---

## Known unknowns

- **Fuzzwork blueprint data quality.** Early scoping work suggests
  good coverage but the schema is wider than the SDE attributes
  data — ingest may take longer than the 2.7.1 SDE ingest did.
- **Job-fee data source.** Industry job fees depend on system
  cost indices which fluctuate. There's an ESI endpoint for this
  (`/v1/industry/systems/`) but it'd require a periodic refresh
  job similar to market prices. Possibly its own sub-version slot
  if the data shape gets messy.
- **Material price coverage.** Some industry inputs (PI, ice
  products) might not be in our market-prices table yet — the
  table seeds from the wormhole-sites ingest, so non-wormhole
  inputs need separate seeding. May add a 3.0.2.x slot for
  market-prices coverage expansion.
- **Reactions vs T1 vs T2 vs T3 scope.** First pass might cover
  T1 + reactions; T2 (which needs invention math) and T3 (which
  needs subsystem/component nesting) could slip into 3.1 if 3.0
  scope tightens.
