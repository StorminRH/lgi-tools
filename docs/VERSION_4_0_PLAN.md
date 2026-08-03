# VERSION 4.0 PLAN — The Living Map

> Pairs with `docs/SESSION_CONTRACTS.md` and the contracts `plan-version` will
> derive from it. The roadmap below is the source of truth for sequence/status;
> each session contract is the source of truth for its session's executable
> requirements. Standing workflow: the lifecycle resolver selects every stage;
> branch per sub-version; sessions commit in-branch with `pnpm verify`; one PR
> per completed sub-version; Greptile on PR open is the gate of record;
> `UX gate: Yes` contracts pause for Ryan's local dev-server review before the
> PR opens; every session ends through `close-out`. Every completed sub-version
> gets an APP_VERSION bump + entry in `content/changelog/v4.0.md` (the
> per-sub-version changelog rule applies to mapper work like everything else —
> the repo is public; the D13 wall gates the *UI*, not development visibility).
>
> **Staging note:** the resolver errors on multiple active master plans. This
> file enters `docs/` only after the 3.9 bundle archives.
>
> **Numbering:** segmented by PHASE. Sub-versions are `4.0.<phase>.<slice>`
> (one branch + one PR each); sessions add a final digit and are written out
> only where a slice has more than one. CHANGELOG nests every sub-version under
> 4.0.
>
> **Contract-extraction convention (per 3.9's):** every sub-version in the
> phase narratives carries a fixed spec block — Objective / UX gate / Done
> means / In scope / Out of scope / Hard constraints / Dependencies / Decisions
> the session plan must resolve / Baseline & hotspot note / Delivery evidence.
> `plan-version` maps these 1:1 onto the contract shape in
> `docs/SESSION_CONTRACTS.md`; the plan states *what must be true*, never
> implementation steps. Where a slice runs multiple sessions, the block notes the
> split and which session carries the UX gate.
>
> **Provenance:** reshaped 2026-07-19 from the fully-walked 2026-07-04 planning
> package (plan + prompt anthology). Every decision, constraint, DONE line, and
> operator step from that package is retained here; the prompt anthology itself
> is retired per the lifecycle (contracts replace prompts). Reconciled against
> the live codebase 2026-07-19 — see the reconciliation notes in Phase 1 and
> §Carry-forwards.

## What this is

4.0 adds the live collaborative **wormhole mapper** — the headline feature the
platform has been built toward, a first-tier product offering equal to or above
the industry planner. It is the first feature where Convex holds user-authored
durable data, the first with multi-user real-time collaboration, and the first
interactive canvas.

The mapper is **not** a feature slice — it is a **host layer** (`src/mapper/`,
top-level) that sits above features in the import hierarchy and embeds them
(D14/D15). It routes all ESI through the single `esiFetch` gate, declares every
dataset through the ESI dataset registry, and uses the sanctioned Convex
reactivity paths rather than shipping its own scheduler.

**The one-sentence architecture:** the server owns the graph (shared chain data
in Convex, fanned out reactively), each browser owns the canvas (layout derived
locally by a deterministic radial engine, never synced) — and the canvas moves
like water, not a spreadsheet.

**What 4.0 deliberately is NOT:** no synced positions, no live cursors, no
per-user saved layouts, no CRDT/offline. The product bet is D1 — data is
shared; presentation is derived. The competitor audit confirmed nobody else
does this; that is the differentiation and the product risk (validation stays
an open item). 4.0 ships to prod continuously behind an admin dev wall (D13)
and is *released* by removing the wall — one act, after the version audit.

**DONE for the version =** a corp can run a chain on it daily: create a map,
share it, scan and paste sigs, watch scouts author the chain by jumping, edit
by hand where needed, and never see a refresh control.

## Status

> **Approved delivery topology (2026-07-30 operator restructure).** The rows
> below are the approved execution bundles, not the phase narratives. The
> original `plan-version` topology compressed the narrative's 16 sub-versions
> plus the version-opening obligations to 14 sub-versions / 16 sessions. The
> approved lower-context restructure preserves those 14 sub-versions and every
> outcome while expanding execution to **23 sessions**. Its independent
> topology challenge removed boundaries justified only by ordinary
> producer/consumer order.
> Sub-version identifiers keep their narrative numbers so no identifier ever
> denotes different content; merged bundles absorb adjacent numbers and leave
> gaps. `Covers` maps each bundle to the phase sections below.

| Sub-version | Theme | Covers | Sessions | Status |
|---|---|---|---|---|
| **Phase 0 — Version opening** | | | | |
| 4.0.0.1 | Version-opening obligations (baseline capture, metric split, archive fidelity) | backlog | 1 | COMPLETE |
| **Phase 1 — Groundwork** | | | | |
| 4.0.1.1 | Map access foundation + corp membership resolution | §4.0.1.1, §4.0.1.2 | 1 | COMPLETE |
| 4.0.1.3 | Client universe assets, wormhole codex, sites card widget export | §4.0.1.3, §4.0.1.4, §4.0.1.5 | 1 | COMPLETE |
| 4.0.1.6 | Statics dataset ingest (anoik.is feed) | §4.0.1.6 | 1 | COMPLETE |
| **Phase 2 — Shell & live core** | | | | |
| 4.0.2.1 | Map shell (dev wall, host layer, floating chrome) | §4.0.2.1 | 1 | COMPLETE |
| 4.0.2.2 | Data model + authorization (Convex schema + gate + projection) | §4.0.2.2 | 2 | COMPLETE |
| 4.0.2.3 | Reactive read path (subscriptions + reconciler) | §4.0.2.3 | 1 | COMPLETE |
| **Phase 3 — Canvas** | | | | |
| 4.0.3.1 | Auto-layout engine (compass-sector tree, deterministic) | §4.0.3.1 | 2 | COMPLETE |
| 4.0.3.2 | Motion layer (surface-in-place, tweened glides) | §4.0.3.2 | 1 | COMPLETE |
| 4.0.3.3 | Overlay window framework (three surfaces, one primitive) | §4.0.3.3 | 1 | PLANNED |
| **Phase 4 — The living chain** | | | | |
| 4.0.4.1 | Write path + connection intel | §4.0.4.1 | 2 | PLANNED |
| 4.0.4.2 | Auto-mapping on jump (tracking, classification, fog) | §4.0.4.2 | 3 (PR per session) | PLANNED |
| 4.0.4.3 | Signatures (parse, lifecycle, inference) | §4.0.4.3 | 3 (PR per session) | PLANNED |
| 4.0.4.4 | Maps & access (switcher, roles, archive) | §4.0.4.4 | 3 | PLANNED |

*(Elective health campaign: none scheduled — the campaign queue is empty at the
3.9 cycle-2 baseline, and 4.0 is a flagship feature version; the decision is
recorded here per lifecycle §8. Watch findings AF-006–AF-009 carry; the
contracts below name every Watch/hotspot surface they touch.)*

*(Delivery-unit note: 4.0.4.2 and 4.0.4.3 are the version's two largest slices
and are the only sub-versions whose sessions ship one PR per session. Their
three-session boundaries isolate external synchronization, collaborative
mutation, and inference/privacy review domains whose combined diffs would be
unreviewable; every other sub-version ships one PR for the sub-version.)*

## Gates (all sub-versions)

- `pnpm verify` green before any PR; fallow boundaries clean per the amended
  hierarchy (see D14): `components/ui` → `data` → `features` → `mapper` →
  `app`. Features never import sibling features and **never import the
  mapper**; the mapper imports only features' public surfaces; `src/data`
  imports no feature.
- No `esi.evetech.net` literal outside `src/lib/esi/`; every new ESI or
  external dataset declares through the ESI dataset registry (3.9.2.3) with
  its verified cache time and placement.
- House style: no inline `style` attributes (ESLint-enforced); dynamic values
  via CSS custom properties / CSSOM.
- Every public Convex map query/mutation calls the authorization gate first
  (tested).
- Live-data surfaces ship no manual refresh controls.
- Library/framework work verifies current API shapes first (`ctx7` /
  find-docs): React Flow, ELK, Convex, Drizzle, Better Auth, dnd-kit.
- Contracts carry the two standing plan-gate checks where relevant:
  **placement declaration** (dataset cache time → Convex/Neon placement →
  refresh mechanism; a contradiction with existing code is a PLACEMENT BUG,
  never precedent) and **separability / rework-vs-rollback**.
- Every sub-version: APP_VERSION bump + `content/changelog/v4.0.md` entry.

## Standing decisions

- **D1 — Shared data, derived presentation.** Positions/layout/animation are
  local; facts sync. Technically settled; PROVISIONAL only as a product bet —
  validate with target users behind the wall.
- **D2 — Deterministic radial auto-layout, ELK (decided).** Radial
  compass-tree over sticky creation-order sectors; identical graph → identical
  picture on every client, zero position sync. No force-directed layouts. The
  motion layer (D8) animates toward deterministic targets and never feeds back
  into them. One map = one chain from one root; hand-drag is local-only
  unlock-to-drag pinning.
- **D3 — Chain data in Convex; map metadata + access in Neon.** Per-map
  mutable chain state is the documented Convex-primary exception (durable;
  backed up + CDC-mirrored later — see Carry-forwards: Convex Pro timing).
  ESI tokens stay in Neon, encrypted. No Convex→Neon writes.
- **D4 — Fine-grained documents.** One Convex doc per system / connection /
  signature / note — concurrent edits touch different rows; OCC conflicts stay
  rare.
- **D5 — Single authorization gate.** All map access funnels through the
  pre-built helper (4.0.1.1) and its Convex-side projection (4.0.2.2). No
  second access-check path, ever.
- **D6 — Sanctioned reactivity, not a new scheduler.** Two mechanisms:
  `convex/engine.ts` (ESI pull) and Convex reactive queries (collaborative
  fan-out). No feature-owned third. (The zkill streaming-invoker upgrade named
  in the post-4.0 roadmap would require a deliberate amendment here — decided
  then, never smuggled.)
- **D7 — React Flow + dnd-kit, decided** (OOB.4.1 spike + csp-probe).
  Client-only mount; styling per house rules.
- **D8 — Motion is presentation, and presentation is local.** Motion as
  meaning, not decoration: birth = surface-in-place (scale/opacity, no x/y
  travel), forced shifts = JS position tweens (edges must track state),
  still-when-still (no idle animation), hover = the one cursor-responsive
  moment, camera always glides. One spring `linear()` easing family, three
  duration tiers (~600ms mid anchor, all dials). User input never smoothed.
  Honors `prefers-reduced-motion`.
- **D9 — Map shell chrome: none.** Full-screen app: no AppHeader, no footer,
  true edge-to-edge canvas (`100dvh`), page never scrolls — wheel is zoom.
  Chrome is three floating elements composed at the app layer (map route-group
  layout), never inside the mapper: **hamburger** (top-left: home/wordmark +
  cross-tool links, all opening in new tabs — never navigate off a live map),
  **map-scoped search bubble** (top-center slot; ships with scoped search in
  the post-4.0 navigation version — no inert placeholder per D11), **character
  orb** (top-right: existing `AccountMenu`, whose `PageMenuSection` dynamic
  half hosts the map's settings spec — the mechanism already exists). The map
  switcher dropdown (4.0.4.4) is the fourth element.
- **D10 — Concepts, not designs or code (clean-room rule).** The competitor
  audit defines *what problems* a mapper solves — never *how*. No visual
  design, interaction flow, schema, or code is borrowed from
  Wanderer/Nexum/others. Every feature is designed fresh against this stack
  and these invariants; fresh-slate rework cost is accepted.
- **D11 — Simplicity through automation.** Parity through removing chores, not
  adding surface. Where competitors expose a readout, setting, or manual step,
  prefer a smart default that eliminates the need; UI is added only where a
  decision genuinely belongs to the user. Every contract can be tested against:
  *what would the cluttered version be, and what does the automated version
  look like?*
- **D12 — Desktop-first.** Touch works (React Flow gestures) but is
  unoptimized in 4.0; a deliberate mobile pass is a later, separate decision.
- **D13 — Dev wall until baseline.** The mapper ships to prod continuously but
  is not *released* until 4.0 completes its audit. No nav links point to it;
  the map route group is admin-gated server-side in its layout (allowlist →
  map; everyone else → an "under development" wall). Sub-version PRs may merge
  half-built; UX gates still pause for Ryan's local review, but user-polish is
  judged against the wall-drop, not each PR. Changelog entries follow the
  normal per-sub-version rule (reconciled 2026-07-19 to the current changelog
  convention — the old "silent until reveal" knock-on is retired; the repo is
  public and the wall gates the UI). Removing the wall is the release act, and
  the release note includes the plain-language D16 collection statement.
- **D14 — The mapper is a host layer: `src/mapper/`, top-level.** A physical
  peer of `src/features/`, above it: `components/ui` → `data` → `features` →
  `mapper` → `app`. One new one-directional import arrow: the mapper may
  import features' **public surfaces**; no feature may ever import the mapper.
  A single principled hierarchy amendment (fallow rules enforce both
  directions) — never per-tool exceptions, no promoting feature internals into
  shared tiers to work around it.
- **D15 — Features export widgets; the mapper provides the window.** Any tool
  that should appear on the map is built as a standalone feature first — good
  for its own sake, on its own page — and exports a condensed embeddable
  widget from its public surface; the mapper hosts that widget in an overlay
  window. First instances: the sites card (4.0.1.5 → consumed 4.0.4.3) and the
  roll calculator (own feature plan; integration in the post-4.0 intel
  version). The payoff compounds: mapper sub-versions mostly stop building
  tool functionality.
- **D16 — The wormhole observation stream: automatic, anonymized, no opt-out,
  clearly documented.** Normal map usage emits observation events as exhaust —
  nobody "contributes," they scan, type, and jump. Emitted server-side from
  the 4.0.4.2 jump-resolver and 4.0.4.3 sig mutations into **Neon**:
  `(solarSystemId, whTypeCode, provenance tier, coarse timestamp,
  per-sig-lifetime dedupe key)` — NEVER chain topology, map identity, or pilot
  identity. **Attribution spec (binding — the tracker's correctness lives
  here):** sig IDs are ephemeral dedupe keys within one hole's lifetime, never
  identity; observations count TYPE CODES per system; identification is
  directional — named type on the origin side, K162 on the far side — so an
  observation attributes to the hole's **origin-side system only**; **K162 is
  never an attributable type** (a K162 in your system is some other system's
  hole arriving; counting it poisons the profile). Jump-resolved connections
  are the second channel a mapper uniquely has (it sees both sides): emit for
  the origin side and run a free class-consistency check on the destination;
  when the scout's side reads K162, attribution follows the *typed* side
  identified after jumping through. Same-type-under-new-sig shortly after
  death = the static respawn mechanic observed directly (near-conclusive).
  **Expected profile strata:** statics (always present — counts dominate),
  recurring wanderers (per-system `src` propensity — a valuable dataset in its
  own right), rare tail; everything else manifests locally as K162.
  **Anti-circularity (hard):** *inferred* values never feed the stream;
  accepting the suggested pick weighs far less than overriding it;
  jump-verification is the gold signal. Capture ships with 4.0.4.2/4.0.4.3 (a
  few lines at the mutation layer; the data compounds and can't be
  retrofitted); scoring + the anoik merge (per-system confidence-threshold
  override, "community-verified" provenance marks) is the later *crowd statics
  engine* — a post-4.0 candidate. Endgame: LGI's own maintained J-space
  dataset (statics AND wanderer propensity), potentially served as a public
  API — from consumer to provider.

## Phase 1 — Groundwork (4.0.1.x)

**Arc thesis.** Everything the map reads before the map exists: the access
model, the reference assets, and the first D15 widget. Every slice here is
plumbing except 4.0.1.5's quick visual check.

**Reconciliation vs shipped code (2026-07-19):** universe systems (with
`wormhole_class_id`) and the stargate adjacency graph (`eve_system_jumps`) are
ALREADY in Neon from 3.7.2.2, and the scoped search primitive shipped in the
3.x stream — so the old "system directory" groundwork narrows to the
client-asset/loader slice (4.0.1.3). The wormhole codex (types group 988), the
statics layer, `maps`/`map_access`, the gate helper, and any `src/mapper/`
code do NOT exist yet. The 3.8-era token-refresh race is FIXED (conditional
UPDATE won/lost is directly tested in `eve-token-service.test.ts`) — the old
pre-auto-mapping gate on it is satisfied.

**Arc-wide constraints (every 4.0.1.x contract):**

- Look-it-up-first: SDE fields verified against the authoritative indexes
  (`sde.riftforeve.online`, `developers.eveonline.com/docs/services/static-data/`)
  before ingest work — never from memory. `docs/DATA_SOURCES.md` is the
  resolved domain→source map and is updated in the same change when a row's
  status changes.
- Self-reliance policy: our controlled copies; external sources are refresh
  feeds, never runtime dependencies; degrade to the last good copy.
- Every dataset declares through the ESI dataset registry with placement.

---

### 4.0.1.1 — Map access foundation

**Objective.** The durable foundation of map multi-tenancy — `maps` +
`map_access` in Neon and the single audited authorization helper — exists and
is tested before any map UI does.

**UX gate:** No.

**Done means.**
- Drizzle migration applies `maps` (id, name, owner, timestamps, archive
  fields) and `map_access` (map × principal[character|corp] ×
  role[viewer|editor|owner]).
- `getMapAccess(user, mapId) → { role, canView, canEdit }` helper exists with
  unit tests covering allow/deny by character and by corp principal.
- The role schema does not preclude adding roles later (the finer 4-tier model
  — or Ryan's own variant, e.g. an Admin who manages access but can't delete —
  is deliberately deferred, NOT rejected; reconsider at corp-scale usage).

**In scope.** Neon schema, the gate helper, tests.

**Out of scope.** Any Convex work, any UI, corp-membership ESI resolution
(4.0.1.2), map creation flows (4.0.4.4).

**Hard constraints.**
- The helper is THE gate (D5): its signature must serve every future caller —
  Next server and the Convex-side projection writer alike. No second
  access-check path.

**Dependencies.** None (first slice of the version).

**Decisions the session plan must resolve.** The principal-resolution seam —
where character/corp principals become Better Auth userIds (4.0.1.2 and
4.0.2.2 both consume it).

**Baseline & hotspot note.** Neutral; new tables + one helper module; touches
no measured surface. (The projection writer in 4.0.2.2 will sit near the
auth-surface Watch AF-008 — named there, not here.)

**Delivery evidence.** Test run showing the allow/deny matrix; `pnpm verify`;
changelog entry + APP_VERSION bump.

---

### 4.0.1.2 — Corp membership resolution

**Objective.** One `esiFetch`-gated helper answers "is character X in corp Y
right now," following the affiliation placement pattern.

**UX gate:** No.

**Done means.** Helper + tests (mocked ESI); stale-gated per the
personal-slow-data pattern; registry declaration present.

**In scope.** The helper, its registry declaration, tests.

**Out of scope.** Dynamic membership refresh events; access-list UI (4.0.4.4).

**Hard constraints.**
- PLACEMENT DECLARATION FIRST: affiliation cache time from the ESI spec →
  Neon placement → stale-gated on-view refresh. Any deviation is a placement
  bug. All ESI through `esiFetch`; no new literals.

**Dependencies.** 4.0.1.1 (the principal seam it feeds).

**Decisions the session plan must resolve.** Refresh trigger choice; how
corp-grant resolution snapshots (static resolution at grant-write time is the
starting posture — see Carry-forwards: membership source).

**Baseline & hotspot note.** Neutral; follows the existing affiliation
pattern.

**Delivery evidence.** Test output; `pnpm verify`; changelog + bump.

---

### 4.0.1.3 — Client universe assets

**Objective.** The map can label any system and walk the gate graph in the
browser: a versioned, immutably-cached client asset pair — `solarSystemId →
{name, class, security}` directory and the stargate adjacency graph — derived
from the ALREADY-INGESTED Neon universe tables, with a typed loader that loads
once per map session.

**UX gate:** No.

**Done means.**
- Asset generation derives both assets from the shipped Neon universe data
  (systems + `eve_system_jumps`), versioned per SDE release.
- Served immutably-cached; a loader utility exposes typed lookups (name,
  class, security; neighbor sets).
- Spot-check tests: known systems, known gate pairs, J-space classes; asset
  size reported (~few hundred KB gz for all of New Eden is the expectation).

**In scope.** Asset generation, serving, loader, tests.

**Out of scope.** Statics/effects (4.0.1.6 and the post-4.0 intel version);
re-ingesting SDE source (the Neon layer already exists); rendering anything.

**Hard constraints.** Arc-wide only.

**Dependencies.** None in-version (consumes shipped 3.7.2.2 data). Consumed by
4.0.2.3 (labels), 4.0.4.2 (jump classification + fog BFS), and post-4.0
routing/k-space.

**Decisions the session plan must resolve.** Asset format + versioning scheme
(shared with 4.0.1.4); client load strategy (bundled vs fetched asset).

**Baseline & hotspot note.** `src/data/eve-data/universe.ts` (501 LOC) and
`src/data/eve-data/queries.ts` are Watch-listed — the contract names them; the
slice reads from, and must not widen, those surfaces. Effect: Neutral.

**Delivery evidence.** Spot-check test output; asset size report;
`pnpm verify`; changelog + bump.

---

### 4.0.1.4 — Wormhole type codex

**Objective.** Every wormhole type code knows itself: a versioned SDE-derived
codex — WH type → total mass, max-per-jump, mass regeneration, lifetime, size
class, destination class — reusing 4.0.1.3's asset conventions.

**UX gate:** No.

**Done means.** Codex asset from types group 988 dogma (verified attribute
ids: `1381` targetSystemClass, `1382` massTotal, `1383` massMaxJumpable,
`1384` massRegeneration, `1503` maxStableTime seconds — re-verify against the
schema index at build time); spot-check tests against known types including a
regen-bearing type and K162.

**In scope.** The codex asset + loader + tests.

**Out of scope.** Any consumer UI; per-system statics (4.0.1.6).

**Hard constraints.** Arc-wide only (dogma ids from the index, not memory).

**Dependencies.** 4.0.1.3's pipeline/conventions. Consumed by 4.0.4.1 (mass
model auto-fill), 4.0.4.3 (inference labeling, lifetime ceilings), and the
standalone roll calculator (see §References — its feature plan gates only on
this slice, and may proceed in parallel once it ships).

**Decisions the session plan must resolve.** Reuse-vs-extend of 4.0.1.3's
generation path (separability check if extending).

**Baseline & hotspot note.** Neutral; same surfaces as 4.0.1.3, named the
same way.

**Delivery evidence.** Spot-check output; `pnpm verify`; changelog + bump.

---

### 4.0.1.5 — Sites card widget export

**Objective.** The sites card exports as an embeddable D15 widget from the
wormhole-sites feature's public surface — the first widget under the contract
— with the standalone /sites page unchanged.

**UX gate:** Yes (quick check: the widget renders correctly in isolation).

**Done means.** Widget export renders the card given a site identifier,
size-constrained for a window container; /sites page visually unchanged
(verified); one logic/render core — the page and the widget do not fork.

**In scope.** The export, its props contract, the isolation render check.

**Out of scope.** The mapper side (window hosting is 4.0.3.3; the sig-row hook
is 4.0.4.3); any card redesign.

**Hard constraints.**
- Export from the feature's public surface only; no mapper imports exist yet
  and none appear here (the D14 arrow points the other way).

**Dependencies.** None. Consumed by 4.0.4.3.

**Decisions the session plan must resolve.** The widget's props contract — it
becomes the D15 template every later widget follows.

**Baseline & hotspot note.** `src/features/wormhole-sites/queries.ts` (466
LOC, AF-003 Verified/monitored) is named; the export must not widen it. Effect:
Neutral.

**Delivery evidence.** Isolation render + unchanged /sites screenshot;
`pnpm verify`; changelog + bump.

---

### 4.0.1.6 — Statics dataset ingest

**Objective.** The one genuine external gap closes: per-system static
assignments land in Neon as a controlled, versioned copy of the community
dataset, per external-data policy pattern #1.

**UX gate:** No.

**Done means.**
- Scheduled pull (weekly + on-demand) of the anoik.is feed
  (`anoik.is/static/static.json`, version discovered via
  `static/controller.js`) → version-pinned snapshot in Neon → diff-review
  before promote (the data changes rarely; a large diff is a red flag, not an
  auto-apply).
- Bootstrap/cross-check against the exodus4d/Pathfinder-lineage data file
  (MIT; confirmed original source of the ecosystem's community dataset).
- Attribution to anoik.is present in credits; polite cadence; serving works
  from the last good copy with the feed down (test).
- Registry declaration + `docs/DATA_SOURCES.md` row status flip in the same
  change.

**In scope.** Ingest, snapshot/promote flow, cross-check, serving read path.

**Out of scope.** Inference/pick-list consumers (4.0.4.3); D16
scoring/merging (post-4.0 crowd statics engine); effects (already
SDE-derivable; ships with the post-4.0 intel spine).

**Hard constraints.**
- Never runtime-load-bearing: the external feed is a refresh source only.
- Succession watch stays recorded in DATA_SOURCES.md: if EVE-Scout's expanded
  v2 API reaches production with per-system statics, it becomes primary and
  this feed the fallback — a future decision, not this slice's.

**Dependencies.** Must ship (or explicitly degrade) before 4.0.4.3's second
session; nothing earlier depends on it.

**Decisions the session plan must resolve.** Snapshot/promote mechanics and
the diff-review presentation; cron scheduling within the existing cron shell.

**Baseline & hotspot note.** The cron shell carries Watch AF-009 (clone
posture) — the contract names it; the new schedule must join the existing
shell, not clone it. Effect: Neutral.

**Delivery evidence.** A promoted snapshot serving statics for known systems
(spot-check against community-known values); feed-down degradation test;
`pnpm verify`; changelog + bump.

## Phase 2 — Shell & live core (4.0.2.x)

**Arc thesis.** The stage, the filing system, and the first live picture:
after this phase, two browsers watch one map change in real time — with
placeholder placement and no way to edit.

---

### 4.0.2.1 — Map shell

**Objective.** A dev-walled, true edge-to-edge full-viewport map route with
floating chrome exists; the `src/mapper/` host layer and its fallow rules
exist; nothing else in the app changes.

**UX gate:** Yes.

**Done means.**
- Non-admin on any map route sees the under-development wall (server-side
  check in the map route-group's layout — never a client-side hide); admin
  sees the canvas.
- Edge-to-edge at any window size (`100dvh`, `overflow-hidden`), zero page
  scroll; wheel zooms; debounced re-fit on resize (React Flow's
  ResizeObserver + a `fitView()` re-fit); camera bounded
  (`minZoom`/`maxZoom`, `translateExtent` if wanted).
- Hamburger (top-left; home + cross-tool links, all new-tab) and character orb
  (top-right; the existing `AccountMenu`) float over the canvas, composed in
  the map group's app-layer layout. The top-center search slot is **reserved,
  not built** (no inert search box — D11).
- `src/mapper/` exists; fallow FAILS on a feature→mapper import (test
  present).
- All other routes visually unchanged; the AppHeader/Footer route-group
  restructure is mechanically verified as a no-op for every existing route.

**In scope.** Route-group restructure, dev wall, host-layer scaffold + fallow
amendment, canvas container, hamburger + orb composition.

**Out of scope.** Any map data, the windows framework, the search bubble,
mobile optimization, map settings content in the orb, the switcher (4.0.4.4).

**Hard constraints.**
- Dev wall is server-side in the route-group layout.
- Chrome composes at the app layer; the mapper never imports auth's
  `AccountMenu` (D14 layering).
- The restructure moves AppHeader/Footer into the site group WITHOUT visual
  change to any existing route.

**Dependencies.** None in-version. Everything after renders inside it.

**Decisions the session plan must resolve.** SEPARABILITY — the root-layout
restructure touches every route; confirm the move is mechanical and reversible
before executing. The admin-allowlist mechanism (where admin identity lives).

**Baseline & hotspot note.** Touches the `auth-surface` Watch (AF-008) at the
orb composition seam and the app-layer layout files — the contract names both;
the orb is consumed, not modified. Effect: Neutral (new host-layer LOC is
feature growth, not pressure on measured surfaces).

**Delivery evidence.** Wall/canvas behavior demonstrated as admin + non-admin;
resize behavior shown; the fallow-failure test output; `pnpm verify`;
changelog + bump.

---

### 4.0.2.2 — Data model + authorization

**Objective.** The Convex chain schema (per-map sharding, per-entity docs,
join keys only) and the authorization gate — including the Neon→Convex access
projection — exist and are tested before any map pixel consumes them.

**UX gate:** No.

**Done means.**
- Tables: `mapAccess` (projection), `mapSystems`, `mapConnections`,
  `mapSignatures`, `mapNotes` — all `by_map`-indexed; `mapSystems` also
  `by_map_system` (idempotent auto-map upserts).
- `mapConnections` carries wh type, mass state, ship-size, and EOL as an
  absolute timestamp (timer-derived-state: display from `eolAt − now`, no
  flip scheduler); `mapSignatures` carries the soft-delete tombstone shape for
  undo.
- The gate helper (in `convex/lib`) is called FIRST in every public map
  function; unauthorized caller rejected (test).
- Isolation test: map-A rows invisible to map-B queries.
- `mapAccess` is a regenerable projection written one-directionally from the
  Neon side on grant changes; teardown+resync test green.
- Revoke-evicts-live proven in two browsers (the gate read joins every
  subscription's read set — revocation re-runs the query and evicts).
- Per-subscription I/O budget stated in SCRATCHPAD.

**In scope.** Schema, gate + projection, tests, fixture mutations only.

**Out of scope.** Any UI; location/engine datasets (4.0.4.2); real mutations
(4.0.4.1).

**Hard constraints.**
- Join keys only — NO names/class/effects/intel in Convex docs (the schema
  header rule; the client enriches from the 4.0.1.3 assets and Neon).
- No Convex→Neon writes; the projection writes one direction, Neon-side.
- Design basis is CONVEX.md + the onlineStatus canary patterns (JWT identity
  via `ctx.auth.getUserIdentity()`; client → mutation → action → ONE
  generation-guarded batched apply; no client-posted authority; no-op-write
  guard; volatile bookkeeping never lands on watched chain tables).

**Dependencies.** 4.0.1.1 (Neon SoR + principal seam), 4.0.1.2 (corp
resolution for projection writes).

**Decisions the session plan must resolve.** Role granularity in projection
docs; tombstone shape details; `lastSeenAt` debounce threshold; WH type
representation (code vs typeId) — Ryan rules on these live in-session.

**Baseline & hotspot note.** The projection writer sits adjacent to the
auth-surface Watch (AF-008) — named; it must be a new focused module, not a
fourth `auth-surface` file. Effect: Neutral.

**Delivery evidence.** Gate/isolation/teardown test outputs; the two-browser
eviction demo; `pnpm verify`; changelog + bump.

---

### 4.0.2.3 — Reactive read path

**Objective.** Two browsers watch the same map live: split subscriptions, a
reconciler that owns the merge, and nodes labeled from the client directory —
with no refresh control anywhere.

**UX gate:** Yes (light — Ryan eyeballs the live two-browser behavior).

**Done means.**
- An inserted doc appears on both browsers with no refresh; a removed doc
  leaves both.
- A locally-moved node HOLDS its position through an unrelated subscription
  update; a dragged node is never yanked.
- Revoked access resolves to a calm "no longer have access" state, not an
  error screen.
- Nodes show real names/classes from the 4.0.1.3 directory.
- NO spinners anywhere: the canvas renders instantly; nodes arrive when data
  does (loading is not a state — it becomes the same surfacing animation once
  4.0.3.2 lands). Convex reconnects silently; connection state gets a quiet
  HUD home only once 4.0.3.3 exists.

**In scope.** The two subscriptions, the reconciler (the slice's real
deliverable — its output events are the motion intents 4.0.3.2 consumes;
name them now), directory-driven labels, placeholder grid placement.

**Out of scope.** Layout (4.0.3.1), motion (4.0.3.2), any mutation UI,
signature subscriptions (per-system-panel, 4.0.4.3), spinners.

**Hard constraints.**
- Server owns existence, client owns placement: the reconciler NEVER
  overwrites a local position on update.
- Subscriptions stay split (`chainSystems` rare-change vs `chainConnections`
  mass/EOL churn) — a connection patch must not re-read the systems range
  (the SA.5 lesson).
- Client `useQuery` only; the route stays static (no `preloadQuery`).

**Dependencies.** 4.0.2.1 (shell), 4.0.2.2 (schema + gate), 4.0.1.3
(directory).

**Decisions the session plan must resolve.** The reconciler's exact event
contract (new/removed/moved intents).

**Baseline & hotspot note.** Neutral; all-new mapper code.

**Delivery evidence.** The two-browser demo covering every Done bullet;
`pnpm verify`; changelog + bump.

## Phase 3 — Canvas (4.0.3.x)

**Arc thesis.** How the map looks, moves, and hosts. Two of these three slices
run Ryan's live in-game tuning loop as their UX gate — dials exposed, mapped
against reality, iterated to sign-off.

---

### 4.0.3.1 — Auto-layout engine

**Objective.** The deterministic radial compass-tree layout — ELK in a web
worker behind a pure-function seam, sticky creation-order sectors — draws the
chain identically on every client, and Ryan tunes it live until it feels
right.

**UX gate:** Yes (the live tuning loop IS the gate: dials for ring spacing,
wedge width, sibling gap, direction bias; Ryan maps in-game on the dev
server).

**Done means.**
- Determinism test: identical positions across two clients for the same graph.
- Stability tests: adding a leaf moves zero existing nodes; a wedge-filling
  add moves only its sibling group (sticky sectors derive ONLY from synced
  creation order).
- No-overlap property test over generated chains; edge crossings occur only on
  loop-closing connections (the layout places the spanning tree from home;
  loop-closures draw as extra edges).
- Layout runs in the worker (main thread free during a pass; the ~1.4MB ELK
  bundle loads only on the map route).
- Unlock→drag→re-lock round-trips: the pin is local-only, excluded from
  layout, never synced; re-locking floats the node back.
- One map = one chain from one root holds throughout.
- Ryan signs off the draw feel from live mapping.

**In scope.** The seam, ELK radial configuration, the sector model, the dial
set, worker mounting, unlock-to-drag pinning in the reconciler.

**Out of scope.** Motion (4.0.3.2 — this slice may snap), k-space/fog
placement (4.0.4.2), edge styling.

**Hard constraints.**
- Pure function behind one seam: graph in → positions out; NOTHING else may
  compute positions.
- ELK-first, custom-sector fallback: if the dials can't reach the spec'd feel,
  RECOMMEND the swap with evidence (the ~150-line compass-sector algorithm is
  the designed fallback — zero dependency, same seam); don't force ELK.
- No local state may influence shared layout.

**Dependencies.** 4.0.2.3 (the reconciler it feeds positions into).

**Decisions the session plan must resolve.** The seam's exact contract; the
dial set; loop-closure placement; ELK algorithm/options starting point
(verified against current ELK docs).

**Baseline & hotspot note.** Neutral; new worker + seam module.

**Delivery evidence.** Determinism/stability/no-overlap test outputs; worker
profiling evidence; Ryan sign-off; `pnpm verify`; changelog + bump.

---

### 4.0.3.2 — Motion layer

**Objective.** The water: surface-in-place births, JS-tweened glides with
edges tracking, hover life, a gliding camera — at 120Hz in a prod build, tuned
live to Ryan's sign-off.

**UX gate:** Yes (the tuning loop: dials for tempo tiers, overshoot amount,
blur pass, edge-grow on/off, collapse flavor).

**Done means.**
- Insert → surface-in-place animation (starts slightly small/dim/soft, scales
  through a tiny overshoot, settles sharp; NO x/y travel) on BOTH initial load
  and live insert — loading and live mapping are one vocabulary.
- A forced layout shift glides with edges tracking — no CSS-glide/edge-snap
  desync, no per-frame layout thrash in the profiler.
- Own-drag is raw 1:1 at full frame rate in a prod build (`pnpm build`-class
  evidence, dev-mode judgments don't count); transitions are suppressed on any
  hand-dragged node.
- Hover glow + subtle breathing; the map is dead still otherwise (zero idle
  animation, zero GPU spend at rest).
- Camera (`fitView`/focus) always glides, never jumps.
- `prefers-reduced-motion` collapses everything to instant/gentle fades
  (verified).
- Drag-perf hardening lands here: memoized custom nodes, no per-frame
  re-render cascade.
- Ryan signs off the feel from live mapping.

**In scope.** Birth/death/hover CSS (inner element, transform/opacity only),
the JS position-tween scheduler, camera easing, reduced-motion path, the
hardening.

**Out of scope.** Window/HUD animation, sound, any new layout behavior.

**Hard constraints.**
- Position transitions are JS tweens driving state — NEVER CSS transitions on
  node position (React Flow computes edges from state; CSS gliding desyncs
  them).
- User input is never smoothed.
- One spring-like `linear()` easing family, three duration tiers (~600ms mid
  anchor), all dials — no new animation dependency.

**Dependencies.** 4.0.2.3 (the reconciler's motion intents), 4.0.3.1 (the
targets it animates toward).

**Decisions the session plan must resolve.** Tween scheduling design (frame
budget at 120Hz with N simultaneous movers); whether a collapse gets a heavier
death than a cleanup delete (tuning-session call); edge fade-with-child vs
grow-from-parent (tuning dial).

**Baseline & hotspot note.** Neutral.

**Delivery evidence.** Prod-build FPS evidence during drag and during a
20-node re-layout; reduced-motion demo; Ryan sign-off; `pnpm verify`;
changelog + bump.

---

### 4.0.3.3 — Overlay window framework

**Objective.** The three-surface window system — anchored dock panels, pop-out
floating windows, node-anchored summaries — on one primitive, with absolute
event isolation, proven with a stub D15 widget.

**UX gate:** Yes.

**Done means.**
- The current-system panel opens anchored (fixed-size, edge-docked,
  selection-driven until 4.0.4.2 ships location tracking, then
  location-driven) and closes on canvas click.
- Pop-out → drag + FREE resize + per-device position/size memory across reload
  (anchored = fixed-fit; unanchored = resizable; positions are local, never
  synced — presentation is local).
- Selecting a system other than the one you're in shows a node-anchored
  summary card (placeholder content — its real content is a post-4.0 intel
  decision) that tracks pan/zoom; deselect/canvas click dismisses. Full
  detail where you are; glances everywhere else.
- Typing and scrolling inside any window provably never pan/zoom the map
  (test).
- Escape closes topmost; click-brings-to-front; nothing is ever modal over the
  map; the canvas stays interactive everywhere a window isn't.
- A stub D15 widget renders inside the primitive (the contract is exercised
  before any real widget arrives).

**In scope.** The one primitive (thin title, close, drag handle, pop-out
toggle), the three surfaces, event isolation, per-device persistence,
stacking.

**Out of scope.** Real panel content (sigs 4.0.4.3; intel post-4.0), resize on
anchored panels, taskbars/minimize, snapping grids, synced layouts,
multi-monitor popouts, mobile sheets. (The competitor's window manager ate
months — this scope fence is the counter.)

**Hard constraints.**
- Event isolation is absolute — its test is part of Done, not optional.
- One primitive under all three surfaces; no second window implementation may
  appear later.
- Windows render in the host layer as siblings above the canvas.

**Dependencies.** 4.0.2.1 (shell), 4.0.1.5 (the props contract the stub
follows).

**Decisions the session plan must resolve.** The pointer-events architecture;
SEPARABILITY of the primitive from its first consumers.

**Baseline & hotspot note.** Neutral.

**Delivery evidence.** Isolation test output; reload-persistence demo;
stub-widget render; `pnpm verify`; changelog + bump.

## Phase 4 — The living chain (4.0.4.x)

**Arc thesis.** The map becomes authorable, then authors itself. D11's two
flagship automations live here (the mass model and the sig inference engine),
and the D16 observation stream begins capturing.

---

### 4.0.4.1 — Write path + connection intel

**Objective.** Hand-authoring a chain is complete and unobtrusive — adds
always grow FROM somewhere, type is the only input (the hole knows itself via
the codex), all destruction is undoable, the collapse hybrid is live, and the
set-home first-run moment ships.

**UX gate:** Yes.

**Done means.**
- Add-from-node (right-click node → add connection → type-ahead against the
  4.0.1.3 directory) → system + connection persist and fan out. No floating
  systems can be created: the one-root contract holds BY CONSTRUCTION.
- Type entry auto-fills mass budget / per-jump limit / regen / size / lifetime
  from the codex (visible). The D11 erasures hold: no ship-size control where
  type is known (it derives from max jump mass; the control exists only for
  unidentified K162s); no manual field the codex can fill.
- Mark-EOL is one action storing an absolute timestamp → countdown on all
  clients; PLUS the free computed hint: type lifetime + first-seen = an honest
  remaining-life *ceiling* ("at most ~Xh" — first-seen is an age lower bound).
- The mass model ships layers 1 + 3 (layer 2 arrives with 4.0.4.2): (1) SDE
  budget by type; (3) observed shake states clamp the estimate (a seen
  "destab" proves ≥50% consumed). Presented honestly (±10% per-hole variance;
  estimates, never truth). This model is the roll calculator's future
  substrate (seed handshake — see §References).
- Delete → tombstone → undo restores; connection edits live in a small
  edge-anchored popover (type, mass, EOL).
- Severing a connection triggers the computed orphan hybrid: never destroy
  silently; truly dead + empty branch → mark severed AND offer one-click
  undoable removal; branch with k-space exits, pilots, or a loop home → keep,
  marked severed, no prompt; ambiguity keeps. (Tests cover the dead-empty and
  has-exit cases.)
- A blank map shows exactly one thing: a centered "set your home system"
  type-ahead; the first system becomes root. No tutorial, no empty-state art.
- Editor role required for every mutation (viewer rejected, test); optimistic
  locally, reactive fan-out.

**In scope.** Field-scoped mutations, context-menu/popover surfaces, the
collapse pathway's entry point, the first-run moment, mass layers 1+3.

**Out of scope.** Sig-driven flows (4.0.4.3), auto-mapping (4.0.4.2), mass
layer 2, adjust-menu polish (post-ship iterative loop).

**Hard constraints.**
- Every destructive op undoable; the collapse pathway NEVER destroys silently.
- Field-scoped mutations; equality-skip writes.
- The unified-collapse entry point must be designed for THREE triggers —
  4.0.4.3 adds re-paste-vanish and ceiling-expiry to this slice's manual
  trigger. One pathway, no second implementation.

**Dependencies.** 4.0.2.2 (schema/gate), 4.0.2.3 (read path), 4.0.3.3
(popover/window surfaces), 4.0.1.4 (codex).

**Decisions the session plan must resolve.** PLACEMENT DECLARATION (all writes
= collaborative chain data → Convex per D3, restated); popover vs context-menu
composition details.

**Baseline & hotspot note.** Neutral; new mapper code.

**Delivery evidence.** Two-browser demos per Done; orphan-hybrid test output;
`pnpm verify`; changelog + bump.

---

### 4.0.4.2 — Auto-mapping on jump *(3 sessions, one branch: tracking/classification → authoring/observations → fog/UX; UX gates ride sessions 2 and 3)*

**PRE-SESSION OPERATOR STEP (Ryan):** enable `esi-location.read_location`,
`esi-location.read_ship_type`, `esi-location.read_online` on the EVE dev-app
registration BEFORE this sub-version's code deploys (scope-ceiling rule).
*(The old token-refresh pre-gate is satisfied: the conditional-update race fix
is shipped and directly tested in `eve-token-service.test.ts` — verified
2026-07-19.)*

**Objective.** The heartbeat: a tracked scout's wormhole jump authors system +
connection for every viewer with zero interaction — plus jump classification,
the fog-of-war halo, the promotion rule, and the first D16 emissions.

**UX gate:** Yes (session 2 proves automatic authoring in two local clients;
session 3 reviews fog visuals + surfacing behavior; session 1 is non-visual).

**Done means.**
- A tracked scout's WH jump → system + connection surface on all viewers with
  no interaction (per the 4.0.3.2 vocabulary).
- Tracking is per-character-per-map OPT-IN; the location dataset follows the
  engine/canary pattern — one table indexed by user, dataset added to the
  engine union (orphan-guard superset), ETag/304 → no write → an AFK tracked
  pilot produces ZERO Convex writes (verified).
- Jump classification runs on the 4.0.1.3 adjacency asset: consecutive
  locations adjacent in the gate graph = gate jump — fog follows, NOTHING is
  authored; non-adjacent = wormhole jump — author system + connection and
  decrement the crossed hole's mass budget (mass layer 2); dock/undock and
  same-system noise filtered.
- Authoring boundary: **wormhole exits only — "activity promotes fog to
  fact."** Travel beyond an exit is fog + the live pilot dot. Promotion
  exception: meaningful activity in a fog system (a note, kill involvement of
  subscribed pilots, a manual pin) authors it into the shared map for all
  subscribers, with its own fog context. A note made in a fog system promotes
  it (test).
- Fog of war is ON by default in k-space: a ~2–3-jump BFS halo (depth is a
  dial; toggle exists) over the static adjacency asset around tracked pilots —
  pure derived presentation, ZERO Convex documents, computed identically by
  every client from already-synced facts. Fog visuals = ghosted/dimmed,
  clearly not-yet-fact.
- Hole-matching: when the origin system has multiple unresolved WH sigs, the
  destination's class matches against identified sig types — exactly one
  candidate → the connection auto-links to its signature; ambiguity waits for
  human eyes.
- Jump-verified connection observations land in the Neon D16 observation
  stream — event shape and attribution per D16; no map/pilot identity in the
  event (test).

**In scope.** Tracking opt-in, the engine dataset, classification, authoring +
promotion, fog rendering, mass-layer-2 decrements, D16 jump emissions.

**Out of scope.** Route halo (post-4.0 navigation), region rendering
(post-4.0), notifications (post-4.0 intel), observation SCORING/serving
(emission only), the always-author-everything setting's final scope if
empirics don't settle it (park in SCRATCHPAD — lean per-map, since it changes
shared data).

**Hard constraints.**
- PLACEMENT DECLARATION FIRST: location/ship/online cache times from the ESI
  spec → live core (≤2min) → Convex engine dataset per the canary pattern;
  registry declaration included. Any deviation is a placement bug.
- Authoring every visited system is FORBIDDEN (the competitor pattern
  deliberately rejected — it is why they need orphan-cleanup machinery).
- Fog is derived presentation — zero documents.
- Location data never touches chain docs (hot/cold discipline).
- D16 anti-circularity and attribution rules are binding as written.

**Dependencies.** 4.0.4.1 (the mutations it drives), 4.0.1.3 (adjacency),
operator scope step above.

**Decisions the session plan must resolve.** Classification edge cases
(session-change noise, simultaneous scouts, upsert idempotency via
`by_map_system`); the promotion-trigger set's exact mechanics; fog placement
style by eye (radial rings from the exit node vs real-SDE-geometry patch —
tuning-session call).

**Baseline & hotspot note.** Extends `convex/engine.ts` (518 LOC, cohesive
non-goal) with a new dataset — named; extension must follow the existing
subject pattern, not fork it. Effect: Neutral.

**Delivery evidence.** Live two-browser jump demo (Ryan flies);
classification test outputs; AFK zero-write evidence; the D16 emission test;
`pnpm verify`; changelog + bump.

---

### 4.0.4.3 — Signatures *(3 sessions, one branch: lifecycle → inference/provenance → ranking/emission/UX; UX gates ride sessions 1 and 3)*

**Pre-gates:** 4.0.1.6 shipped or explicitly running degraded (inference off,
pick list unranked — never fake a static); 4.0.1.5 shipped (else the sig-row
hook degrades to opening /sites in a new tab).

**Objective.** Paste-to-map intelligence: the parse, lifecycle rules, the
constraint-solver inference engine with provenance, stub nodes per the canvas
ladder, ceiling expiry, the unified collapse pathway, and D16 typed-emission.

**UX gate:** Yes (session 1 reviews lifecycle and stubs; session 3 reviews
inference, ranking, provenance and widget integration).

**Done means.**
- Paste parses scanner output (sigs + anomalies); the list populates.
  Unknown-group sigs stay list-only; known-wormhole sigs spawn **ghosted stub
  nodes** (unknown, or class-labeled the moment inference solves them); a jump
  resolves a stub into the real system. The map draws holes, not paperwork.
- **The inference engine (the flagship D11 feature) — a small constraint
  solver:** every WH sig is an unknown; the system's statics are constraints
  that MUST be satisfied (a static always exists; on collapse it respawns
  under a new sig ID); every identification — typed, jumped, or eliminated —
  propagates. A single-static system self-labels its static on paste (test); a
  two-static elimination case passes (test); history narrows (a confirmed
  static proves new WH sigs are not-that-static).
- **Provenance is mandatory:** *inferred* / *user-confirmed* /
  *jump-verified*, visibly distinct; inference NEVER silently overrides a
  user; user-confirmed beats inferred, jump-verified beats both;
  contradictions yield instantly. (Elimination is only sound for complete
  scans, which we cannot verify — provenance is the honesty mechanism.)
- **Pick list ranking = the merged per-system profile** (no separate ranking
  logic): bootstrap = anoik statics-first; graduates to statistics-driven
  ordering as D16 observations accumulate (statics dominate by count,
  wanderers by propensity, tail last) — safe against self-confirmation because
  ranking derives primarily from jump-verified signals.
- Lifecycle: re-paste updates in place with equality-skip (unchanged sigs
  write nothing — evidence); missing sigs remove immediately with an undo
  window; `lastSeenAt` bumps only past the 4.0.2.2 debounce.
- Lifetime ceiling automation: type entry auto-populates max duration; the
  ceiling counts down; expiry = presumed collapsed (first-seen is an age lower
  bound, so ceiling expiry can NEVER remove a live hole).
- **Unified collapse pathway:** manual delete (4.0.4.1),
  disappeared-from-re-paste, and ceiling-expiry ALL route through the ONE
  orphan smart-logic. Ceiling expiry triggers it (test).
- K162s stay thin until the far side is known (and are never an attributable
  D16 type). Typed identifications emit to the observation stream with
  acceptance-vs-override weighting; inferred values provably never emit
  (anti-circularity test).
- A site-type row opens the sites card widget in a window (D15's first real
  hosting).

**In scope.** Parse, lifecycle, the solver + provenance, stubs, ceilings, the
two extra collapse triggers, D16 typed emissions, pick list, the sites row
hook.

**Out of scope.** Intel content beyond sigs (post-4.0), K162 alerting
(post-4.0), bookmark tooling, observation scoring/serving.

**Hard constraints.**
- All D16 rules binding as written (attribution, anti-circularity).
- Degrade gracefully without the statics dataset.
- One collapse pathway — no second implementation.

**Dependencies.** 4.0.4.1 (collapse entry point, connection intel), 4.0.3.3
(the panel the sig list lives in), 4.0.1.4 (codex), 4.0.1.5 + 4.0.1.6
(pre-gates above).

**Decisions the session plan must resolve.** The solver's constraint model
stated in plain terms (Ryan reviews the logic, not just code); paste-format
edge cases (partial scans, anomalies tab, language variants — verified against
live samples).

**Baseline & hotspot note.** Neutral; new mapper code plus the sites-widget
consumption (4.0.1.5's named surface).

**Delivery evidence.** Inference test matrix; two-browser lifecycle demo;
degraded-mode demo; the anti-circularity test; `pnpm verify`; changelog +
bump.

---

### 4.0.4.4 — Maps & access

**Objective.** Maps become manageable — the creation dialog, the dropdown
switcher, the access editor in the orb, archive→grace→purge — closing out
4.0's roadmap.

**UX gate:** Yes.

**Done means.**
- Create → one small dialog (name + visibility: private / corp) → ONE Neon
  transaction (`maps` + owner `map_access`) + the projection write → the map
  opens to the set-home prompt. A blank map holds zero Convex documents.
- **The switcher is a dropdown, not a tab strip** (the current map's name as
  the trigger — the top edge's fourth element); switching swaps the `mapId`
  every subscription targets and the canvas repopulates through the normal
  reconciler + surfacing animation. The list reads Neon server-side; the
  Convex projection serves the GATE only.
- **No cap on maps** (idle maps cost nothing: no viewer = no subscriptions;
  per-map doc volume is tens of KB). One ops guard, invisible to real users: a
  soft creation rate-limit via the existing `@convex-dev` rate-limiter —
  trips under a scripted burst (test), never under human use.
- Roles Viewer/Editor/Owner; access editing owner-only in the orb's
  `PageMenuSection` slot (character + corp principals, corp via the 4.0.1.2
  helper); revocation evicts a live viewer (re-verified end-to-end).
- Corp member opens a corp-visible map; a non-member cannot (tests).
- **Deletion = archive → grace → purge:** archiving removes the map from
  switchers immediately (owner can restore); after the grace period a sweep
  purges the map's Convex docs completely (bounded batched deletes, verified
  on a test map) and tombstones the Neon row. No instant hard-delete of a
  living chain exists.

**In scope.** Creation flow, switcher, access editor, archive lifecycle,
rate-limit guard.

**Out of scope.** Finer role tiers (deferred, not rejected — 4.0.1.1's
standing note), map settings beyond access, any post-4.0 content.

**Hard constraints.**
- Purge only after grace; no instant hard-delete path may exist.
- The switcher list never reads the Convex projection.

**Dependencies.** Everything prior; last slice of the roadmap.

**Decisions the session plan must resolve.** Grace-period length (~30d lean);
purge-sweep batching under Convex delete ceilings.

**Baseline & hotspot note.** Touches `auth-surface`-adjacent composition
(AF-008, named) at the orb settings slot — consumed via `PageMenuSection`, not
modified. Effect: Neutral.

**Delivery evidence.** The full flow demo; purge evidence; rate-limit test;
`pnpm verify`; changelog + bump. On merge: every roadmap row is terminal → the
resolver directs audit planning; the wall-drop (release) happens only after
the 4.0 audit completes.

## Carry-forwards / open items

- **(OPERATOR, scheduled)** Location read scopes on the dev-app registration
  before 4.0.4.2 deploys. The `esi-ui.write_waypoint` exception is APPROVED
  (2026-07-04) for the post-4.0 navigation version — the agent-guide
  write-scope rule gains its sole named exception when that version nears.
- **(OPEN) D1 product validation** — confirm shared-facts/derived-layout with
  target users behind the wall before release.
- **(OPEN) Convex Pro / durability hardening timing** — backups + CDC mirror
  for the chain tables before real corps trust living chains; prerequisite for
  release, not for building.
- **(OPEN) Membership source** — static access-list resolution first; dynamic
  ESI corp lookup later if corp-scale demands.
- **(WATCH) OCC under load** — validate the low-contention assumption
  (per-entity docs) before scaling.
- **(WATCH) EVE-Scout expanded v2 API** — production ship = the statics
  succession check (DATA_SOURCES.md owns the details).
- **(SESSION-EMPIRICAL, parked)** the always-author-everything setting's scope
  (per-map lean); summary-widget real content (post-4.0 intel decision).

## Post-4.0 roadmap (non-binding — input to future `plan-version` runs; all decisions below were walked 2026-07-04 and are retained)

**Intel & parity (the 4.1-shaped version).** Data spine first: Neon crons for
ESI system kills/jumps + sovereignty; effects (SDE secondary-suns → beacon
path); **the R2Z2 killmail ingest built here** (verified 2026-07-19: no
killmail plumbing exists) — cron consumer 1–2 min with a Neon cursor, ONE
global consumer for all users, ingest-time filtering (J-space raw rows ~48h +
friendlies-anywhere; k-space heat from ESI aggregates; hourly per-system
aggregates kept indefinitely), **global Convex pulse docs keyed by system only**
(combat is a public fact — every map containing the system shares one doc;
"friendly" is a read-time join against the map's access list, never storage),
the consumer a pure function behind a seam (streaming invoker is the named
upgrade if ~90s feels dead — requires new hosting or a deliberate D6
amendment; physical floor ~10–30s). Then intel surfaces (walked: identity
header + sig-list workspace in the panel; node glance = active-only icons +
event glow; the alert ladder ambient→glanceable→interruption); notes/labels/
locking; **alerting (walked):** exactly two default per-user alerts —
friendly-in-combat ON anywhere incl. k-space, inbound K162 HOME SYSTEM ONLY —
notifications silent by default, chime opt-in, permission requested only on
toggle; Thera/Turnur ghost stubs from the EVE-Scout production signatures
endpoint (non-blocking cron copy); **roll calculator integration** (the
standalone tool ships from its own feature plan once 4.0.1.4 exists — this
version only hosts the widget + the seed handshake: engine inputs map 1:1 onto
the connection mass model); aging refinements last. **Deliberate cut
(recorded): viewer presence** — the only clock-driven writes in the version
for a feature with no appetite; pilot dots already answer the need. Do not
re-add without a new decision.

**Navigation (the 4.2-shaped version, fully walked).** Constraint-aware
routing over the adjacency asset + live chain: computes for the user's current
tracked ship automatically, shortest default + safer toggle, crit/EOL
soft-avoided (used only when no alternative, loudly warned). The search bubble
fills the reserved D9 slot — one verb: clicking any result takes you there;
secondary actions as row affordances. Route halo = the fog, route-triggered
(ESI cannot read the in-game autopilot; LGI-set destinations are the only
trigger; routes recompute reactively on chain changes). **Waypoint insertion
ships** under the approved write-scope exception (operator registration step
before deploy; copy-paste waypoint lists remain for users who decline the
scope at SSO). Chain exit summary derives from routing.

**The big canvas (4.3-shaped, spike-gated).** The scale spike proves the
static-backdrop model first: ~5,200 systems + gates baked per SDE release into
a static rendered layer with only live elements as real React Flow nodes — NOT
5,200 live nodes; if the architecture fails, region mode is re-scoped, not
forced. Then the backdrop pipeline (a versioned ingest artifact), then the
region-mode UX walk (deliberately deferred until the spike's constraints are
known; contextual visibility — k-space canvas surfaces in k-space, stays out
of the way in J-space/Pochven). The fog ladder completes: pilot halo → route
halo → region. Candidates pool (picked deliberately, mini-walk + placement
declaration + D10/D11 check each): watchlist, standings overlay, activity
charts, Discord push, PNG export, bookmark generator, map merge/copy concepts,
and the **crowd statics engine** (D16 phase 2: strata scoring, per-system
confidence-threshold override of the anoik copy, community-verified provenance
marks, the public-API endgame).

## References

- `docs/DATA_SOURCES.md` — the resolved external-data arcs: statics (anoik.is
  feed + Pathfinder-lineage cross-check + EVE-Scout succession watch), R2Z2
  killmail mechanics, EVE-Scout production endpoint, the canonical
  three-source external set, D16 capture policy.
- `docs/CONVEX.md` — the cost/OCC rules and canary patterns every Convex
  contract cites.
- `ROLL_CALCULATOR_FEATURE_PLAN.md` (workspace) — the standalone roller's
  design record; gates only on 4.0.1.4; slots as its own feature stream.
- The 2026-07 mapper feature audit (archive) — concept-level competitor
  reference, D10-bounded: concepts only, never designs or code.
