# BACKLOG — LGI.tools

> Deferred work items with no version assigned. **Un-prioritized** — a backlog, not
> a plan: no sequencing, no commitments, no version numbers. Each entry =
> *what / why-deferred / rough size / dependency-or-trigger*. Pull an item into a
> version when its trigger fires; delete it here when it ships.
>
> Created 2026-06-14 at the v3.5.4 close-out — migrated out of `docs/SCRATCHPAD.md`
> (the old "Backlog (no version assigned)" section) + the 3.5.4a audit's
> deferred/declined findings + its operator-checklist cells, so SCRATCHPAD holds
> live/forward state and this holds the someday pile.
>
> NOT here (they live in SCRATCHPAD / CLAUDE.md as ongoing status, not deferred dev
> work): operator env chores (contact form, Discord ops webhook, Speed Insights),
> the consolidated authed PROD pass, the Convex cost-model unknown, credential
> rotations, the fallow trial, the infra-audit spend cap.

---

## Fees & margin

- **Deferred fee model — make net margin complete** (operator-mandated 2026-06-14).
  Two parts remain — part (b) (the reaction fee model) shipped in 3.7.13.3 / PR #191:
  - **(a) Full per-job-tree install-fee walk.** *What:* charge an install fee for
    EVERY manufactured/reaction node, not just the top job (3.5.2 ships top-job-only,
    labeled "excl. sub-job fees"). Needs: per-buildable activity persisted onto
    `BuildNodeDisplay` (a `'max'`-cache-shape change to the structure), a per-node
    whole-run ledger walk (run counts MUST come from `computeBatchMaterials`'
    ceil-batching, NOT a naive ×runs per node), a multi-job fee aggregator (sum
    per-node `computeJobInstallationFee`, OR-ing `missingSystemCostIndex` + merging
    the missing-adjusted-price id sets so null-propagation survives), and a deep
    T2/capital net-margin oracle fixture. *Why deferred:* large surface; top-job-only
    is honest in the meantime (labeled). *Size:* L. *Trigger:* when net-margin
    completeness is prioritized.
  - **(c) Undercut margin-erosion.** *What:* realized price drifts DOWN as you re-list
    to stay cheapest; fold it into net margin so the number reflects the price you'll
    actually realize at quantity. *Why deferred:* the Market Score deliberately does
    NOT model this — its time-to-clear assumes you stay competitively listed (stated
    in the breakdown). It's a MARGIN concern, not a score concern; keep the two axes
    separate by landing it here. *Size:* M. *Trigger:* same sub-version as (a)/(b).
  - *Envelope:* top-job-only understates total job fees ~40–60% (2-stage T2) to
    ~65–75% (deep capital); it never overstates and never touches gross margin.

- **Sell-side fees lever (per-build-character broker fee + sales tax)** (surfaced by the
  3.7.20.1 standings verdict — the DECLINED `esi-characters.read_standings.v1` scope's one
  real consumer). *What:* the planner pins flat sell-side rates (`DEFAULT_FEE_RATES`
  brokerFee 3% / salesTax 7.5%), but both are character-dependent: NPC broker fee =
  `3% − 0.3%×Broker Relations − 0.03%×faction standing − 0.02%×corp standing` (unmodified
  standings; verified 2026-07-09, sources in SCRATCHPAD 3.7.20.1), and sales tax = 7.5%
  reduced 11%/lvl by Accounting (→4.125% at V; skills already synced — no new scope for that
  half). A lever would key both to the selected build character and disclose per the #197
  lever-row honesty pattern. *Needs:* its own plan gate — formula re-verification, the
  standings scope + pull + purge contributor (the full declined Part B checklist transfers
  from the 3.7.20.1 plan), and a sell-location question (player-structure broker fees are
  owner-set, not standings-scaled). *Why deferred:* out of the 3.7.20.1 session's approved
  scope; standings→JOB-COST was refuted, so the scope was declined rather than parked.
  *Size:* M–L. *Trigger:* if sell-side accuracy is ever prioritized (Ryan's call — it
  re-opens the arc's relink question).

## Industry planner — build time

- **Whole-tree "total build time"** (deferred from the v3.6 industry-readout pass,
  operator decision 2026-06-21). *What:* a tile/readout for the time to build the
  whole tree, not just the final assembly job (which shipped). *Why deferred:* it
  is NOT a simple serial sum of every intermediate's base time — that reads as ~27
  days for one Ishtar (it counts building all 5,625 Crystalline Carbonide Armor
  Plates etc. from scratch at base no-skill times, back-to-back). A useful figure
  has to model job-slot parallelism (critical path, not sum), build-vs-buy (you buy
  bulk T1 components, not build them), and ideally skill/structure time bonuses.
  *Seam:* the data is in `industry_blueprints.activities[].time`; the per-buildable
  whole-run counts already exist in `build-batch.ts`'s walk (the shared accounting
  was reverted when this was deferred — re-extract if the total returns). The
  shipped tile shows only `BuildTimeView.topJob` (final job, runs-scaled, base/ME0).
  *Size:* M–L. *Trigger:* when a "time to done" readout is prioritized.

## Industry planner — structures

- **Manufacturing-Time-Efficiency-rig membership fix** (surfaced in 3.7.9.1.4). *What:*
  ~33 "Manufacturing Time Efficiency" rigs (dogma attr 2593 present but no 2594 material
  attr) are silently not offerable, because `isIndustryRig` keys on the 2594 material
  signal to keep the rig set to true build rigs (a 2593/2595-only filter wrongly admits
  Copy/Invention/ME-TE-Research-Optimization rigs, which `computeStructureBonus` would
  then read as build-time rigs). *Why deferred:* fixing it needs the bonus math to
  classify rig sub-types (a time-only build rig vs a research rig that shares 2593), not
  a one-line membership tweak, and it risks perturbing the byte-identical math guarantee.
  *Size:* S. *Trigger:* the next industry-planner data pass; confirm the exact rig set
  against the SDE (`docs/3.7.9_VERIFIED_CONSTANTS.md` is the reference).

## Market score & pricing

- **F2.3 composite tempering.** *What:* temper the composite score itself by a stale
  `latestDate` (vs today), beyond the visible staleness flag shipped in 3.5.4b. The
  composite stays keyed to `latestDate` (asOf = latest row), so an item with no recent
  trades can still score high (PLEX scored 94 on ~11-month-old Forge history). *Why
  deferred:* 3.5.4b ships honest-degradation as a FLAG, not a score change; tempering
  the number touches the score math + its behaviour tests. *Size:* M. *Trigger:* if the
  flag proves insufficient and Ryan wants the score itself to reflect staleness.
  *Dependency:* the `STALENESS_FLAG_DAYS` + `daysSinceHistoryDate` seam shipped in
  3.5.4b (`market-score-inputs.ts`).
- **Multi-region pricing** (Amarr, Dodixie, Hek). *What:* a second/third market region
  beyond The Forge. *Why deferred:* `market-prices/source.ts` is ready; only the UI is
  unbuilt. *Size:* M (UI-only). *Trigger:* when a second region is wanted. *(Dedupe
  note: the old SCRATCHPAD "3.5 market-data aggregation engine is the anchor of 3.5"
  framing is superseded — the engine, depth math, and Market Score shipped across
  3.5.1–3.5.3; multi-region is the live remaining compose-on item.)*

## Sites & content

- **Site editorial layer** (deferred from 3.8.3.5.1). *What:* optional
  per-site meta-description overrides and server-rendered prose blurbs,
  repo-shipped by site id and merged over the Neon catalogue read with the
  generated description as the permanent fallback; 2–3 seeded entries should
  prove the pattern while preserving detail-page caching. *Why deferred:* the
  operator prioritized Phase 4 security work and assigned no replacement date.
  *Size:* S–M. *Trigger:* curated site content becomes a product priority.
- **Live blue-loot ISK for combat sites** (from 2.7.1). *What:* real blue-loot ISK
  values on combat sites. *Size:* M. *Trigger:* feature prioritization.
- **Per-row staleness UX** — "stale" badges on individual materials. *What:* a per-row
  freshness indicator on planner material rows (distinct from the 3.5.4b score-level
  staleness flag). *Size:* S–M. *Data layer:* the 3.9.2.3 dataset registry. *Trigger:*
  pairs with planner material-row work.
- **3.0 design-doc non-goals** (explicit future-only): invention chance math, PI
  chains, order-depth slippage. *Size:* L each. *Trigger:* an explicit future-feature
  decision (each was scoped out of 3.0 deliberately).

## Navigation

- **Category-dropdown top nav + module expansion** (from the 3.6.8 polish session —
  deferred to its own session). *What:* replace the flat tool strip with category
  dropdown menus — e.g. "Wormholes" → Sites & Anomalies, Roll Calculator, Codex.
  Involves a categorized data model over the flat `TOOLS` registry
  (`src/data/tools/registry.ts`, which also feeds the search "Tools" source), a new
  dropdown nav component (open/close + keyboard/aria + mobile), a new "Codex" module
  (doesn't exist yet), and renaming "Wormhole Sites" → "Sites & Anomalies". Homepage
  tiles are separate hardcoded JSX and won't auto-follow. *Why deferred:*
  feature/architecture work, well beyond copy/visual polish; explicitly its own branch.
  *Size:* L. *Trigger:* the nav/module-foundation session.
- **Mobile access to page settings** (deferred at 3.7.15.1). *What:* the account menu
  (and its per-page settings section) is desktop-only — the header login cluster is
  hidden <1024px and the hamburger footer keeps the flat portrait cluster (a menu can't
  nest inside the hamburger popup). Mobile users can't reach page settings from the
  menu; the /sites on-page toggles remain their only path. Needs its own affordance
  (e.g. a settings block inside the hamburger panel). *Why deferred:* out of the .5
  shell's scope; interacts with .6/.7 surface decisions. *Size:* S–M. *Trigger:*
  ACCOUNT.6/.7, or the first mobile-only settings complaint.

## Character roster

- **Roster Phase B — sec status · location · corp/faction badge** (deferred from 3.6 at the
  3.6.28 close-out; Phase A — the visual 3-up roster — shipped in 3.6.24). *What:* enrich each
  signed-in roster card with the character's security status, current location (system/region),
  and a corp/faction badge, on top of the Phase-A portrait + SP + skill-queue. *Why deferred:*
  it's a feature, not remediation — 3.6's identity was finalize/leave-beta/audit/harden, so it
  closes cleanly without it; and location is NOT purely presentational — the location ESI scope
  is already granted but NOT synced, so it needs a NEW Neon→Convex sync subject through the
  presence-gated engine (`convex/engine.ts`). sec-status + corp/faction are public char/corp
  info (cheaper). Reuses the skills-sync engine + the `buildRosterCard`/`RosterCard` seam; the
  `?demo` seed extends with the new fields. **Wallet stays out** — it needs a new ESI scope
  (forces re-auth). *Size:* M (the location sync subject is the bulk; the badges are light).
  *Trigger:* when the roster is prioritized — natural opener for the next cycle; pair with the
  panel-shell extraction in the fallow section.

- **Admin reassign leaves a stale identity email on the source account** (found in the
  ACCOUNT.3 / 3.7.14.1 security review; also flagged as a session chip). *What:* the admin
  character-reassign's not-emptied fork moves the account row and repoints the active
  character but never rebinds the source user's identity email, so the source can retain
  the moved character's synthetic address indefinitely. If that character's account row is
  later deleted (self-unlink, purge, transfer-purge), a fresh sign-in falls back to the
  email match and re-links the character to the OLD account — resurrecting a
  supposedly-detached account, potentially another person's. Second-order (needs an admin
  merge in step one) but real. *Fix:* adopt the same post-move composition the absorb flow
  uses — run the reconcile (email rebind) after a not-emptied reassign; decide compose-at-
  caller vs fold-into-reassignCharacter (folding changes the reassign oracle's pinned write
  counts, so that test would need a deliberate update). *Size:* S. *Trigger:* next
  ACCOUNT-arc hygiene session, or immediately if an admin merge is performed on a
  multi-character source account.

## Engine / Convex verification

> From the 3.5.4a audit operator-checklist — prod-only cells a solo agent can't
> measure (a Convex deploy key can't run internal functions; the bot challenge blocks
> anonymous prod browsing). Run in Session 3.9.3.7 during Ryan's signed-in prod /
> Convex-dashboard session.

- **Cell i — char token groups.** *What:* signed-in prod ~2 min on `/skills` + `/jobs`,
  then read Upstash `lgi:esi:rl:group:char-detail` / `…:char-industry` (or the
  `rlGroup/rlLimit/rlRemaining/rlUsed` fields on the prod `syncSubjects` rows). *Expect:*
  remaining > 0 throughout. *Size:* S (measurement). *Trigger:* Session 3.9.3.7.
- **Cell ii — 3.5.e1 DB-I/O drop — VERIFICATION PENDING OF A SHIPPED CLAIM**
  (code-verified at `convex/engine.ts:121-143`, never dashboard-measured). *What:* Convex
  dashboard → Functions → `engine:heartbeat`, over a ≥3-min visible `/skills` window —
  compare bytes-read for an `interval` beat vs a `mount`/`visible` beat. *Expect:*
  interval-beat bytes-read ≈ one small `syncPresence` doc AND independent of how many
  characters are linked. *Size:* S (measurement). *Trigger:* Session 3.9.3.7.
- **Cell iii — sweep db-op budget.** *What:* Convex dashboard → Data: note row counts of
  `syncSubjects` and `syncPresence` (expect small) → the three indexed sweep passes are
  ≪ the ~4096 db-op per-mutation budget; also grep prod `vercel logs` for
  `retention_batch_capped` (expect absent). *Size:* S. *Trigger:* Session 3.9.3.7.
- **Archon reference fixture has no third-party validation** (blueprint tools are
  JS-rendered / unfetchable). *What:* a standing known-gap — first regression target if
  planner Archon costs ever differ in-game. *Size:* note. *Trigger:* a planner cost
  regression.

## Infra & bundle

- **Update-watch routine** (deferred from 3.8.4.9). *What:* a committed
  baseline covering every direct dependency and devDependency, the platform
  services (Neon, Convex, Upstash, Vercel/Next.js), and the EVE surface; an
  explicit watchlist including developers.eveonline.com and the official EVE
  developer documentation; and a self-contained routine instruction skill.
  A daily cloud routine compares live state with that baseline and opens a
  GitHub digest issue only for deltas, prioritizing major versions and security
  advisories. It remains report-only: no package changes, baseline edits,
  commits, pushes, or PRs. *Why deferred:* operator chose on 2026-07-14 to
  revisit the work within whichever version is active at that time, rather than
  complete it in 3.8. *Size:* M. *Trigger:* Session 3.9.3.5; re-plan against current
  Claude Code runtime
  and scheduling documentation before any account, GitHub, or network access is
  configured.
- **F3 — app-wide First Load JS trim.** *What:* `/industry/[id]` ships 332 KB gz First
  Load JS, but 312 KB is the shared framework/app baseline every route pays (`/` is the
  same); only 19 KB is planner-specific. Remediation: bundle analyzer + shared-chunk
  review. *Why deferred:* out of v3.5 scope — it's the app-wide baseline, not a v3.5
  regression. *Size:* L. *Trigger:* an app-wide perf initiative.
- **Cell iv — Free-tier headroom** (from the 3.5.4a operator-checklist). *What:* Convex
  dashboard → Usage (month-to-date function calls / DB bandwidth / action compute vs the
  1M / 1 GB / 20 GB-hr Free caps) + Upstash console → Usage (commands vs 500K). **Re-
  estimate Upstash commands accounting for F1** — the ESI body cache is more active than
  the old "near-dormant" model assumed: every per-type orders / small-history fetch does
  ~4 extra Upstash ops (≈2 SET + 2 GET). *Size:* S (measurement). *Trigger:* Session
  3.9.3.7.
- **3.8 primitive-reference fidelity polish.** *What:* reconcile the few remaining
  presentational differences found in the post-arc reference review: Tooltip's direct
  surface should use the dedicated tooltip treatment, the checked Checkbox should be
  compared against the full-fill HTML reference, and Field/default-density plus invalid
  states should be represented explicitly in the admin primitive preview. *Why deferred:*
  the primitives are functional, accessible, and already shipped; Ryan chose to merge the
  completed arc and handle additional visual judgment later. *Size:* S. *Trigger:* Session
  3.9.3.6.
- **Client-settled static for the session-gated pages** (surfaced 2026-07-11 by the 3.7.35.1
  conformance route-optimality diagnosis). *What:* `/skills`, `/jobs`, `/structures`, `/settings`,
  `/characters` are `◐` partial because each does a server-side session-gated linked-character read
  (a request-time `<Suspense>` hole). `/industry/templates` proves the alternative: it settles the
  same signed-in/out signal *client-side* and renders `○` fully static. Investigate moving the
  session-gated pages to the same client-settled pattern so they prerender static. *Why deferred:*
  the server gate is a deliberate anti-flash tradeoff — ACCOUNT.7 established the `ssrReadable`
  cookie mirror was REQUIRED because these pages "flash all-lit otherwise"; flipping to
  client-settled reintroduces that risk, so it needs a real UX review, not a silent mode flip.
  *Size:* M (per page + shared roster-signal). *Trigger:* an app-wide rendering/perf pass. The
  render-mode rubric is now encoded (CLAUDE.md "Static by default" + `route-classification.json`
  `_comment` + `ui-styling.md`) so future pages follow the ladder by default.

## Accessibility

- **Accessibility verification pass — axe gate + formal a11y assertions for the Base UI
  overlays** (deferred 2026-06-26, OOB.2.3, as a new standing direction). *What:* a real
  accessibility audit gate for the overlay primitives (Popover, Dialog, and future Menu) —
  e.g. `axe-core` injected into the open-state probe (or `@axe-core/playwright`), asserting
  zero violations on the open overlay, plus formal focus-trap / focus-return / `aria-modal` /
  labelling assertions. *Why deferred:* a11y verification machinery kept recurring and
  complicating overlay sessions; the standing call is **a functioning site first**, defer the
  heavy verification tooling. Note the overlays already *get* focus-trap, scroll-lock, Escape,
  and outside-dismiss for free from Base UI's `modal` Dialog — what's deferred is the
  *auditing/proof* layer, not the behavior. *Cost note:* a committed `axe-core` dep also needs
  a `.fallowrc.json` `ignoreDependencies` entry (it'd be used only by the gitignored probe, so
  fallow would flag it unused — same exemption `playwright` already has). *Size:* S–M.
  *Trigger:* a dedicated accessibility/quality pass once the overlay set (OOB.2.x) is built out.

## 3.6.7a audit — deferred findings

> From the 3.6.7a measure-only audit (`docs/3.6.7a-AUDIT-FINDINGS.md`). The :warning:
> correctness/a11y/§5 findings went to Ryan's 3.6.7b ledger; these are the lower-
> severity drift + missing-test gaps with no version commitment.

- **RATIFIED §5 deviation: Active jobs table omits the Facility column.** *What:* the
  handoff spec (`handoff-3.6/README.md:220-231`) mandates a 6-column grid `Status / Runs /
  Blueprint / Activity / Facility / End`, with Facility hidden only `<900px`; the shipped
  table (`IndustryActiveJobs.tsx`) renders 5 columns with no Facility at any width
  (`esi-projection.ts` Zod-strips `facility_id`). *Why deferred:* resolving facility names
  needs a new authenticated ESI structures/stations name-resolution surface — a
  disproportionate add for one column hidden below 900px. **Ratified** in 3.6.7b (ledger #3):
  the omission stands. *Size:* M (new ESI name-resolution surface). *Home/Trigger:* fold into
  the deferred dedicated `/jobs` reskin.

## fallow code-health (from the fallow-adoption chore) — CLOSED

> Disposition ledger: `fallow-baselines/README.md`; pre-compaction history: Document Archive
> `fallow-health-improvement.md`. Re-derive with `pnpm test:coverage && pnpm fallow:health`.
> AF-003 moved the v3.8 audit's six unwaived functions into Session 3.8.5.3.1; the corp tri-state
> convergence remains a closed non-debt disposition in the ledger of record.

## Asset ledger — real in-game held-by names (structures, corp divisions, containers)

> Surfaced at the 3.7.7.2 review (Ryan, reviewing the asset-tracking ledger). The held-by
> line resolves the *kind* of place from data we already hold, but not the actual in-game
> names the player sees. Option-1 ("accurate generic labels now") shipped in 3.7.7; this is
> the deferred Option-3 ("the real names").

**Current (3.7.7) behaviour — honest but generic.** EVE nests assets like dolls: an
`'item'`-type `location_id` is the PARENT (structure / ship / container) and `location_flag`
names the sub-slot. `src/features/owned-assets/detail.ts` classifies the *kind* from the flag
alone — `CorpSAG1-7` → **"Upwell structure · Corp Hangar N"**, ship slots/holds → **"In a ship"**,
`Unlocked`/`Locked` → **"In a container"**, NPC station → the real station name (via the existing
`/universe/names`). What it canNOT show: the structure's NAME ("J131624 – Lioneye's Watch"), the
custom corp-hangar division name ("Industry Components" for CorpSAG4), or a named container —
those are what the player actually sees in the in-game inventory tree.

**What the real names need (the deliberate adds):**
- **Structure name** → the `esi-universe.read_structures.v1` scope + `GET /universe/structures/{id}`
  (per-structure docking-ACL gated, so best-effort — degrades to "Upwell structure" where the
  vending char lacks access). `/universe/names` canNOT resolve player structures, only NPC
  stations — confirmed against the synced data.
- **Custom corp hangar division names** (CorpSAG4 → "Industry Components") → the
  `esi-corporations.read_divisions.v1` scope + `GET /corporations/{id}/divisions/` (Director/
  Accountant role), keyed by the corp owner; map division 1-7 → its custom name.
- **The asset TREE** — `item_id` + the parent chain — which **3.7.7.1 deliberately DROPPED** at
  projection (`esi-projection.ts` aggregates by (type_id, location_id, location_flag,
  location_type) and discards `item_id`/`is_singleton`). A nested item (ship cargo, a named
  container) needs the tree to walk up to its root structure/station; a corp-hangar item's
  `location_id` is already the structure (one level up), so THOSE resolve with just
  `read_structures` and no tree. Named containers also need `POST /{char|corp}/assets/names`
  (uses the assets scope we already hold) — but again needs `item_id`.

**Scope of work:** a new sub-version (≈3.7.8). Two new ESI scopes (batch them per the "a new
scope is a deliberate, batched decision" rule), a `read_divisions` corp read + a `read_structures`
per-structure resolve (both server-side, bounded, day-cached like `resolveEntityNames`), and a
3.7.7.1 data change to keep the asset tree (don't drop `item_id`; likely a new column / a
parent-chain resolve at write + a migration + a full re-sync). *Size:* M–L. *Trigger:* when Ryan
greenlights the two scopes. *Where the labels live now:* `src/features/owned-assets/detail.ts`
(`resolveLocationName` / `isStructureFlag` / `isShipFlag` / `friendlyFlag`) — extend these to
consume the resolved structure + division names.

## React component-test stack (jsdom + @testing-library/react)

> Surfaced at the ACCOUNT.2.2 plan (the account-page danger zone). Ryan's call: keep the
> Humble-Component split, defer the DOM stack as its own decision.

**What:** the repo has no DOM component-test setup — `vitest.config.ts` runs only `*.test.ts`
under the `node` environment, with no `@testing-library/react` / jsdom / happy-dom. Component
*logic* is tested by extraction (pure functions + reducers in `*.test.ts`), the standing
preference. ACCOUNT.2.2 followed it: the destructive-control behaviours (confirm gate,
`{accountEmptied}` branch, redirect rule, delete acknowledgement) are proven in
`confirm-gate.test.ts` / `account-actions.test.ts`; the thin JSX shells are left to ux-check +
Ryan's review.

**Why deferred:** adding the stack (dev deps + a `.test.tsx` include + a jsdom env) is its own
justified infra decision — the "new library needs written justification" bar — not something to
back into mid-feature. *Size:* S–M. *Trigger:* a future surface whose only meaningful branch is
genuinely un-extractable from the DOM, where a render/interaction test earns the stack.

## Industry planner — UI

> Small planner-UI deferrals. (The T2 margin-semantics track — the Raw | Item toggle, the
> Legion price note, and the 700-item catalog audit — all shipped as 3.7.21.1; the `docs/margin-audit/`
> harnesses live in git.)

**Multibuy panel: make the always-built product visible** (surfaced in the 3.7.22.1 review — with
every tier unchecked the list still holds the product's direct inputs, which read as surprising).
*What:* show that the product itself is always built — a pinned, checked, disabled row above Tier 1
(e.g. "Jaguar · the product") or an explainer clause. *Why deferred:* Ryan chose to keep the panel
minimal at ship; explainer already trimmed to one line. *Size:* XS. *Trigger:* Session 3.9.3.6.

- **Slots readout: scope-mismatch hint (probably unnecessary).** When a linked character's
  corp-installed jobs are visible (via a corp-eligible reader) but their personal job board
  isn't (missing personal-jobs scope), the header counts their corp jobs while their personal
  jobs stay dark — silently. The live mismatch set is already computed inside `slotMetaTotals`
  (corp installers − personally-eligible); the affordance would be the house (?)-popover on the
  readout naming the character + pointing at reconnect. **Why deferred / likely never:** Ryan's
  verdict 2026-07-10 — every SSO link demands the full current scope set, so the mismatch only
  exists as a fossil of a scope-ceiling change; the existing needs-reconnect affordances already
  cover the cure. Size: small (one popover + one derived set). Trigger: a future scope-set
  addition creating stale links in the wild (the CLAUDE.md batched-scope-decision event).

## Workflow & docs

- **DESIGN_PRINCIPLES P7 cites deleted example surfaces** (found by the 3.9.1.1 doc-ref sweep).
  *What:* P7's comment-style examples name `src/features/auth/queries.ts` section banners and the
  `PricingContextValue` field docs — both deleted by the 3.8.5.x remediation. Replace with live
  examples (e.g. the auth owner modules, `tree-resolver.ts`). *Why deferred:* P1–P10 text is frozen
  for 3.9 (contract hard constraint); example citations are still P-text. *Size:* XS.
  *Trigger:* the 3.9 version-close audit's constitution review, or Ryan approves the one-line
  amendment sooner.
