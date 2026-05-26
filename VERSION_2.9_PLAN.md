# LGI.tools — Version 2.9 Plan

## What this is

LGI.tools is positioned as a multi-tool platform. When 2.9 began the
landing page had one tile and the only browsable surface was `/sites`.
The visual chrome was sized for a single feature; it was never
designed to host a *grid* of tools.

Phase 2.9 sets that foundation. Before Phase 3 ships an industry
helper, the navigation, information density, and visual identity get
a coherent pass so adding a new tool feels native rather than
bolted-on. Phase 2.9 ships no new features — only the envelope the
next feature will arrive inside.

The first four sub-versions (2.9.1 → 2.9.4) have shipped. Three more
sub-versions remain (2.9.5 → 2.9.7); when those land 2.9 is complete
and this plan doc archives.

---

## How to use this document

Read [CLAUDE.md](CLAUDE.md), [AGENTS.md](AGENTS.md), and
[SCRATCHPAD.md](SCRATCHPAD.md) before proposing any 2.9.x sub-version
plan. The earlier 2.9.x SCRATCHPAD entries are the durable record of
what shipped; this doc tracks what's still ahead.

---

## Decisions already made

- **No card layout regression.** The wormhole site card is the
  canonical visual contract from Phase 1 — Phase 2.9 may add
  navigation chrome around it, but inside the card nothing moves
  unless the user explicitly approves.
- **Tone palette is one slice's data today.** Wormhole tones live in
  `src/features/wormhole-sites/components/wormhole-styles.ts`. 2.9.2
  introduced a slice-agnostic tone vocabulary in `src/components/ui/`
  that tools opt into; wormhole-styles maps domain meaning (C5 = red)
  to the shared tokens.
- **Sketches before pixels.** 2.9.1 produced the approved wireframes
  in `docs/wireframes/` that drove the implementation passes
  (landing-grid, nav-search-inline-push, sites-density).
- **Mobile is not a primary target.** LGI.tools is desktop-first —
  the typical user runs Eve Online on a gaming computer and reads the
  tool on the same display. Version 2.9.6 adds defensive responsive
  scaling so the site doesn't visually break at narrow widths, but a
  full mobile-first redesign is deferred until after Phase 3.

---

## Sub-versions shipped (2.9.1 → 2.9.4)

Brief notes; SCRATCHPAD entries hold the forensic record.

- **2.9.1 — wireframes + identity decisions.** Three approved
  wireframes in `docs/wireframes/`; six rejected explorations in
  `_rejected/`. No production code. Plan doc renamed
  `PHASE_2.9_PLAN.md` → `VERSION_2.9_PLAN.md`.
- **2.9.2 — shared visual primitives.** `tones.ts` vocabulary,
  typography scale, brand wordmark in the header, universal link-
  hover-to-green, `--color-muted` lifted to `#6a7a8a`.
- **2.9.3 — cross-tool navigation + multi-tool landing grid.**
  `AppHeader` became a three-slot layout, `NavTools` strip with
  active-state prefix matching, JetBrains Mono adopted, three-tile
  landing grid replacing the single-tile placeholder.
- **2.9.4 — global search, density audit, deep-link polish, footer
  wordmark.** Header grew its fourth slot (global search), Spotlight-
  style cross-source dropdown with a registerable source primitive in
  `src/data/search/`, scoped hover-glow + ResourcePreview overlay on
  ore/gas cards, `/sites/[id]` widened to full width with a meta
  strip, "Lo-Gang Industries" wordmark in the footer. Post-PR visual
  iteration pass also landed: global zoom 1.10, /sites 2-column
  layout, gradient backdrops on landing + /sites, PriceFreshness
  chip moved into the nav.

---

## Sub-versions ahead (2.9.5 → 2.9.7)

### 2.9.5 — Automated price refreshing

Replace the user-driven refresh model (manual click in the nav chip,
24-hour cache) with a Vercel-cron-driven hourly refresh. The chip
becomes display-only.

**What lands.**

- **Vercel Cron Job.** New `vercel.json` (or extend if it exists)
  with a single cron entry at `schedule: "0 * * * *"` (top of every
  hour). Points at a new endpoint.
- **New endpoint `/api/cron/refresh-prices`.** Checks
  `Authorization: Bearer ${process.env.CRON_SECRET}` and rejects with
  401 otherwise. Calls the existing
  `refreshKnownPricesIfStale(db)` helper from
  [src/data/market-prices/cache.ts](src/data/market-prices/cache.ts) —
  no new business logic, just a thin auth-gated wrapper.
- **`CACHE_TTL_MS` dropped from 24h to 1h.** With cron as the only
  caller and a fixed hourly cadence, the 1h TTL prevents redundant
  refreshes if a manual call ever lands within the window.
- **`PriceFreshness` chip rewritten as display-only.** Removes the
  click handler. Visible chip is just `● PRICES LIVE` (compact); a
  hover tooltip surfaces `Next refresh in MM:SS` for the curious.
  When the countdown passes zero, fires one `router.refresh()` to
  pick up the cron-fresh `initialLastUpdatedAt` from the next server
  render.
- **`Refresh prices` removed from the Commands search source** at
  [src/data/commands/search.ts](src/data/commands/search.ts) — it
  becomes redundant once the chip stops being interactive.
- **`/api/market-prices/refresh` endpoint deleted.** No remaining
  callers. Less surface area to maintain; revivable from git if an
  admin force-refresh ever becomes a real need.
- **`CRON_SECRET` env var.** One-time setup via `vercel env add
  CRON_SECRET` for Preview and Production environments. Generate via
  any 32-byte random string.

**Sizing:** small-medium. ~5–6 files. One session.

**Risk to flag:** if cron silently fails for several days, the chip
would show a countdown frozen at 0:00 with no obvious alert. A future
"if older than Nh, chip turns orange" warning state can be added in a
follow-up — out of scope for 2.9.5.

---

### 2.9.6 — Responsive defensive (Level 1) + ResourcePreview overflow fix

Stop the site from visually breaking at narrow viewports. The bar is
"site is usable and doesn't have overlap / horizontal scrolling at
1024px and below" — not "mobile-first polish." Full responsive UX is
deferred to a post-Phase-3 version.

**What lands.**

- **Nav chrome defensive media queries.** Under ~1500px wide,
  `NavTools` auto-flips to its 2-letter abbreviations (`WH` / `IP` /
  `WR`) without requiring search-focus. Under ~1024px, the
  PriceFreshness chip hides. Under ~640px (phone), the header stacks
  vertically with the wordmark + nav-tools on one row and the search
  input below.
- **`/sites` single-column layout below ~700px.** The forced 2-column
  grid added in 2.9.4 becomes 1-column on narrow viewports. Card
  internals already adapt because the at-rest card width is
  controlled by the grid.
- **Hide ResourcePreview overlay below ~900px.** The overlay is
  desktop-only chrome — it adds nothing on narrow viewports and
  would only get in the way.
- **ResourcePreview position-flip on right-edge cards.** Item #9 in
  the scoping conversation: at desktop widths, the overlay extends
  off the right edge of the page when the card is the right-most in
  its row. Pure-CSS fix via `:nth-child(even)` (or grid-position-
  derived selector) flips the overlay to the left side of those
  cards.
- **Footer + landing tile grids reviewed for narrow-viewport
  collapse.** The landing tile grid already uses `repeat(auto-fill,
  minmax(270px, 1fr))` so naturally collapses to 1 column under
  ~620px — just verify nothing else needs adjusting.

**Sizing:** medium, mostly CSS. ~4–6 files. One session.

**Future-deferred:** Level 2 ("comfortable on tablet") and Level 3
("mobile-first redesign") — both noted in this plan as items to
revisit after Phase 3 ships, only if mobile usage proves significant
enough to warrant the investment.

---

### 2.9.7 — Cross-site sortable table view + view-split telemetry

Final 2.9 slot. The original "Session Q" from the 2.9 sketch.
Complementary to the card grid, not a replacement.

**What lands.**

- **URL-driven view toggle.** `/sites` defaults to the card grid;
  `/sites?view=table` renders the table. Same `listSiteDetails` data
  source — no new query. The toggle persists through the existing
  `?type=` and `?class=` filter params.
- **View-toggle UI affordance.** Two-state pill above the filter
  bar: `Cards` (default) / `Table`. Active state matches the existing
  FilterBar's visual vocabulary.
- **Sortable table primitive.** New `src/components/ui/sortable-
  table.tsx` — generic over `<Row>`, accepts column definitions with
  `key`, `label`, and `getValue: (row) => sortable-primitive`.
  Header click toggles sort column + direction; sort state lives in
  the URL (`?sort=isk&dir=desc`). Reusable for any future tool that
  needs a sortable list.
- **The wormhole-sites table view.** Likely 7-8 columns: name (with
  class icon), type pill, ISK (primary value), killing-wave ISK,
  EWAR aggregate count, primary-resource value, sourceTab. Row click
  navigates to `/sites/[id]` like a card click.
- **`/admin/usage` "View split" section.** New aggregate section
  beneath the existing Top Pages table — groups page-view rows by
  canonical route and shows the cards-vs-table split:
  ```
  WORMHOLE SITES                 479 total
    Card grid (default)   423  88%
    Table view             56  12%
  ```
  Reads from the existing `usage_logs` page-view events — no new
  telemetry plumbing needed. The TelemetryReporter already captures
  the full URL path with query string.

**Sizing:** medium-large. New presentational primitive, new view, URL
state for sort, admin-side aggregation. One full session.

**After 2.9.7 ships,** archive `VERSION_2.9_PLAN.md` to the document
archive per the CLAUDE.md convention. Phase 3 begins.

---

## Out of scope for Phase 2.9 (carries forward)

- **New tools, new features, new data slices.** That's Phase 3 and
  beyond. See [VERSION_3.0_PLAN.md](VERSION_3.0_PLAN.md).
- **Mobile-first responsive (Level 2 + 3).** 2.9.6 lands the
  defensive Level 1. Anything beyond that defers until after Phase
  3, only if mobile usage proves out.
- **Live blue-loot for combat sites.** Today combat / relic / data
  cards show static ISK figures. Live computation requires a drop-
  table data source (hand-authored from EVE-Uni wiki most likely)
  plus a new `sleeper_drops` table. Deferred indefinitely; the
  long-term direction is a wiki-style admin/contributor editing
  surface for this kind of curated data, which itself is its own
  future phase.
- **Search platform extensions** (fuzzy matching, async/lazy-loaded
  large sources, the `onSelect` callback for command rows with side
  effects). The contracts are designed for these but no source today
  warrants them. Slated for 3.0 as plumbing for the Industry
  Planner — see [VERSION_3.0_PLAN.md](VERSION_3.0_PLAN.md).

---

## Phase 2.9 success criteria

When 2.9.7 ships:

- A visitor lands on `/`, sees a grid of tools, picks one, navigates
  to it.
- From any tool, the visitor switches tools without going through
  `/`.
- Prices refresh automatically every hour; the chip is a passive
  status indicator, not an action.
- The wormhole sites card layout is unchanged from Phase 1 unless
  the user explicitly approved a change.
- Tones, typography, and chrome are shared primitives. Adding the
  Phase 3 industry helper is a content task, not a design task.
- A returning visitor with no context knows "this is LGI.tools and
  it has multiple tools" from the first screen.
- The site doesn't visibly break at narrow viewports — usable on
  laptop screens (1366×768) and tablets (1024×768) without overlap
  or horizontal scrolling, even if not optimized for them.
- `/sites` users can answer cross-cutting questions ("highest-ISK
  C5 combat site," "average gas value in C3s") via the table view.
- Admins can see in `/admin/usage` which `/sites` view (cards vs
  table) people actually use, informing future development.
