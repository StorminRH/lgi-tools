# SCRATCHPAD — LGI.tools

> Working memory across sessions. Update at the end of every session.

---

## Version 2.9.3: COMPLETE (2026-05-25)

Session O of the 2.9 plan doc. The cross-tool navigation chrome + the
multi-tool landing grid land — porting two of the three approved 2.9.1
wireframes (`docs/wireframes/landing-grid.html` and the nav-tools portion
of `docs/wireframes/nav-search-inline-push.html`) into production. After
2.9.3 a visitor on `/` sees the full LGI.tools lineup as a 3-tile grid;
from any page a persistent header tool-strip lets them jump between
tools without going through the landing.

What landed:

- **`AppHeader` is now the cross-tool nav surface, not a `PageHeader`
  wrapper.** Renders the `<header>` element directly with a three-slot
  layout: bracket-stamp wordmark on the left, `NavTools` strip in the
  middle, login cluster on the right. Per the 2.8.3 SCRATCHPAD decision
  ("PageHeader and PageFooter no longer strictly mirror each other …
  extract symmetry when both sides demand it"), didn't grow `PageHeader`
  to three slots for one consumer — the two-slot primitive stays
  available to any other surface that wants it. Headline chrome: `h-11`
  (44px per wireframe), `border-b border-border`, `bg-section`.

- **`src/components/NavTools.tsx` is the cross-tool nav strip.** Tiny
  Client Component (`'use client'`) using `usePathname()` for active
  state. Hard-coded `TOOLS` const-array with three entries — Wormhole
  Sites (`/sites`, prefix-matched so `/sites/[id]` also activates),
  Industry Planner (`href: null`, dim span, `cursor: default`,
  opacity 0.55), Wormhole Roll Calc (same SOON treatment). Active state
  flips the link's `text-muted` → `text-name` and `border-transparent` →
  `border-isk`, exactly matching the wireframe's `.nav-tool.active`
  vocabulary.

- **JetBrains Mono added via `next/font/google`.** Weights 400 / 700 /
  800. Variable name `--font-jb`, exposed in `@theme` next to
  `--font-mono` and `--font-display`. Reachable via Tailwind's `font-jb`
  utility. First two live consumers: the header wordmark and the landing
  hero. Barlow Condensed stays the display font for card titles,
  section headers, and any other large-but-not-hero copy.

- **Header wordmark is now `[LGI].tools` in JetBrains 800.** Replaces
  the 2.9.2 Barlow `LGI.tools` per the wireframe's bracket-stamp brand
  mark. Color split: brackets `text-isk`, `LGI` `text-name`, `.tools`
  `text-muted`. Stays a `<Link href="/">` so wordmark-click still
  returns home.

- **Landing hero is `[ Lo-Gang ] Industries.tools` in JetBrains.** First
  live consumer of the `--text-hero` token added in 2.9.2 (clamp 40 ↔
  72px). Two-line layout: `[ Lo-Gang ]` at hero size with green
  bracket-stamps, `Industries.tools` underneath at clamp(14, 2.4vw, 24)
  with the canonical color split (Industries muted, `.` and `tools` in
  ISK green). Tagline below in mono: "A collection of tools for Eve
  Online."

- **Three-tile landing grid replaces the single-tile placeholder.**
  Inline in `src/app/page.tsx` — no `<ToolTile>` primitive extracted
  (single consumer; extract when a second tile-grid surface lands per
  CLAUDE.md "Three similar lines is better than a premature
  abstraction"). Grid uses `repeat(auto-fill, minmax(270px, 1fr))` with
  12px gap; at 1280px viewport it renders as 3 columns of ~296px each.
  Lineup: Wormhole Sites (LIVE, `<Link href="/sites">`), Industry
  Planner (SOON `<div>`, Phase 3), Wormhole Roll Calculator (SOON
  `<div>`, Backlog). Fit Mapper was NOT added — confirmed with user
  this session that the wireframe lineup is correct.

- **`.tool-tile` styles live in `globals.css`.** Three classes:
  `.tool-tile` (shared chrome: bg-section, border, 4px radius, 22px
  padding, flex column with 12px gap), `.tool-tile-live` (cursor
  pointer, hover with `border-color #1a3a28` + `background #090e0c` +
  multi-layer green-tinged box-shadow, `::before` pseudo-element for
  the 2px top-border accent that fades in on hover, opacity 0 → 1 in
  150ms), `.tool-tile-soon` (`cursor: default`, `.tile-desc` opacity
  0.6). Pushed into globals because the hover vocabulary (pseudo +
  multi-layer shadow) is too rich for utility classes. Hex `#1a3a28`
  reused inline from `pill.tsx` green tone — not yet tokenized as
  `--color-isk-dim` because one consumer doesn't justify it.

- **Override of the universal `a:hover` rule on the LIVE tile.**
  The 2.9.2 universal `a:hover { color: var(--color-isk) }` would turn
  the tile's title text green on hover, but the tile already
  telegraphs interactivity via border + box-shadow + top-border
  pseudo. Added `.tool-tile-live:hover, .tool-tile-live:hover * { color:
  inherit }` to keep inner text in its at-rest palette.

- **`APP_VERSION` bumped to `2.9.3`.** Hand-edit per the 2.8.3
  convention. Footer version-link now reads `v2.9.3`.

- **Tests + verification.** No new tests — `NavTools` is a
  pathname-→-className branch (presentational), and the landing is
  pure JSX. Vitest at 411/411 green (unchanged from 2.9.2). `pnpm
  build` green. Browser walkthrough at `localhost:3000`:
  - `/` — bracket-stamp hero in JetBrains, three tiles in one row,
    SOON descriptions visibly dimmer (opacity 0.6, cursor default),
    LIVE tile's `::before` armed (content `""`, position absolute, 2px
    ISK-green, opacity 0 at rest, flips to 1 on `:hover`).
  - `/sites` — "Wormhole Sites" in the nav strip gets `text-name`
    (rgb 220, 232, 240) + 2px ISK-green bottom border. Filter bar +
    69 sites + terminal search untouched.
  - `/?auth_error=state_mismatch` — Callout renders above the hero
    (existing behavior preserved through the rewrite).
  - Login cluster (admin chip + portrait + name + logout) intact in
    the right slot across all pages.

- **Dev-environment gotchas encountered, again.** Hit the documented
  Postgres "too many clients already" mid-session (per the 2.8.4
  carry-forward in this scratchpad). Cleared via:
  ```
  docker compose exec -T postgres psql -U lgi -d lgi_tools -c "SELECT
  pg_terminate_backend(pid) FROM pg_stat_activity WHERE application_name
  = 'postgres.js' AND state = 'idle';"
  ```
  Also hit a Tailwind v4 / Turbopack quirk where appending raw CSS to
  `globals.css` didn't trigger HMR — the served stylesheet kept the old
  contents until a trivial edit (adding a comment line) forced a
  rebuild. Worth noting: if a new raw CSS rule doesn't seem to apply
  after editing `globals.css` in dev, a no-op re-save forces Turbopack
  to re-emit the CSS chunk.

Shipped on branch `version-2.9.3-nav-and-landing-grid`.

Decisions worth carrying forward (Session O+ follow-ups):

- **In-nav global search bar is still ahead.** The
  `nav-search-inline-push.html` wireframe also specifies a 280px
  expandable search input between the wordmark and the tool strip;
  promoting `<TerminalSearch>` to a global cross-source primitive
  (parse / suggest hitting sites + tools + recents + commands) is the
  larger work this session deliberately deferred. When it lands,
  `AppHeader`'s three-slot layout becomes four-slot — wordmark / search
  / tools / right-cluster — and the existing flex layout already has
  `min-w-0` + `shrink-0` in the right places to absorb the new
  middle slot. Right slot's `shrink-0` is load-bearing.

- **Tile freshness chip on the LIVE tile is a small unbuilt detail.**
  The wireframe shows `prices 3h ago` in the LIVE tile's footer next
  to the class pills — would need a server-side read of the latest
  `market_prices` write timestamp. Worth landing alongside any future
  market-prices polish pass.

- **Footer `Lo-Gang Industries` brand wordmark is also deferred.** The
  wireframe shows it in JetBrains Bold at the footer-left; current
  `Footer.tsx` doesn't have a corp-name slot. Land alongside any future
  footer polish.

- **Tile primitive extraction stays deferred.** Three inline tiles in
  `page.tsx` is fine until a second tile-grid surface appears
  (sub-tool index page, "you might also like" surface, etc.). Then
  extract `<ToolTile>` with `variant: 'live' | 'soon'` and consume
  from both sites.

- **JetBrains Mono adoption decision is now closed.** It's in. The
  three font families now wired through `next/font` are IBM Plex Mono
  (`--font-mono` / body copy), Barlow Condensed (`--font-display` /
  card + section titles), and JetBrains Mono (`--font-jb` / wordmark +
  hero + future "command-line voice" chrome). No further fonts likely
  needed for the foreseeable.

- **Active-state contract is prefix-match per tool.** `NavTools` walks
  the TOOLS array, treating `matchPrefix` as a `pathname.startsWith()`
  check. Adding a new tool with sub-routes (e.g., Industry Planner with
  `/industry/[blueprintId]`) is a one-line addition — set `matchPrefix:
  '/industry'` and any `/industry/*` route activates it. Don't reach
  for regex or route-segment introspection until the prefix-match
  contract genuinely breaks.

`VERSION_2.9_PLAN.md` stays in the repo — Sessions P (sites density
refresh) and Q (cross-site table view) are still ahead. No archive moves
this session.

## Version 2.9.2: COMPLETE (2026-05-25)

Session N of the 2.9 plan doc. The slice-agnostic foundation the rest of 2.9
needs: a centralized tone vocabulary, a documented typography scale, the
polish/motion vocabulary baked into globals, and a proper chrome wrapper so
the brand wordmark appears on every page. No new pages, no new features —
the site looks ~95% identical to today; the visible deltas are a brighter
muted text color, a universal link-hover-to-green, and the LGI.tools
wordmark joining the top header.

What landed:

- **`src/components/ui/tones.ts` is the shared tone vocabulary.** Twelve
  named tones (`neutral`, `green`, `green-strong`, `orange`, `orange-soft`,
  `red`, `red-soft`, `magenta`, `purple`, `yellow`, `teal`, `blue`) exposed
  as a single `Tone` union. `PillTone = Tone` (full vocabulary), `ChipTone =
  Extract<Tone, 'blue' | 'red' | 'purple' | 'green' | 'orange'>`,
  `DotTone = Extract<Tone, 'orange' | 'blue'>`. Pill / Chip / Dot import their
  types from here and re-export — their internal className lookup tables
  (the rendering concern) stay where they live. `toneTextClass(tone)` is
  the text-only helper for inline values like DPS tier labels; returns a
  `text-[var(--color-…)]` className.

- **`wormhole-styles.ts` imports from `tones.ts`, not from primitive files.**
  Domain mappings (C5 → red, WEB → blue, …) are unchanged in meaning — only
  the import path moved. The one hex-literal that used to live in
  `wormhole-styles.ts` (`DPS_TIER_CLASS = { low: 'text-[#3dd68c]', … }`) is
  gone — replaced with `toneTextClass('green' | 'orange' | 'red')`. Verified
  in-browser: DPS cells now render with `text-[var(--color-isk)]` and
  `text-[var(--color-dps-mid)]` classes.

- **`--color-muted` value flipped from `#3a5060` to `#6a7a8a` globally.**
  Per user decision (one token migration, every `text-muted` consumer
  brightens). 32 source files use `text-muted` — all picked up the lift
  without any other edits. `git grep "#3a5060"` returns zero hits inside
  `src/` after the change. The token name stays `--color-muted` for
  source-compatibility; the value is the only thing that moved.

- **Typography scale added to `@theme`.** `--text-caption` (9px),
  `--text-micro` (10px), `--text-body` (11px), `--text-title-sm` (18px),
  `--text-title` (22px), `--text-hero` (clamp(40px, 7vw, 72px)). Existing
  ad-hoc `text-[Npx]` usages stay valid. Tailwind v4 JIT only emits a
  utility class on first reference — `text-caption` activates via PageFooter
  and `text-body` via PageHeader; the rest are documented but inert until
  used (the comment block above the declarations calls this out).

- **Universal `a:hover` rule landed in `globals.css`.** Every `<a>`
  transitions `color: var(--color-isk)` in 150ms. Bake-in of the wireframes'
  link-hover vocabulary. Tailwind hover utilities removed from the four
  anchors where the global rule supersedes them: `Footer.tsx` (both Legal
  and version Links), `sites/[id]/page.tsx` (back affordance), and
  `admin/page.tsx` (Clear link). The three places where explicit hover
  overrides are *load-bearing* — `app/page.tsx` (`group-hover:text-isk` on a
  child of a `<Link>`, where the child's explicit `text-muted` would block
  inheritance from the global rule), `admin/AdminActivitySummary.tsx`
  (`text-isk hover:text-name`, intentional inversion since text is already
  green by default), and `admin/usage/page.tsx` (range-selector chip,
  hovering an inactive chip green would visually collide with the active-chip
  green) — keep their explicit overrides.

- **`src/components/AppHeader.tsx` is the chrome pattern.** Parallel to
  `Footer.tsx`. Composes the brand wordmark on the left + `<LoginButton>` on
  the right inside the slot-based `PageHeader` primitive. Wordmark is
  text-only (`LGI<span className="text-muted">.</span>tools`), Barlow
  Condensed bold, 14px, uppercase, linked to `/`. `layout.tsx` now mounts
  `<AppHeader session={…} showAdminLink={…}/>` in place of the older
  `<PageHeader right={…}/>` — `PageHeader` itself is untouched, still the
  generic two-slot primitive.

- **`PageHeader` and `PageFooter` tightened to the token system.** PageHeader
  uses `text-body` (was `text-[11px]`); PageFooter uses `border-border` (was
  `border-[#1e2535]`) and `text-caption` (was `text-[9px]`). No behavior
  change.

- **`APP_VERSION` bumped to `2.9.2`.** Hand-edit per the 2.8.3 convention.
  Footer version-link now reads `v2.9.2`.

- **Tests + verification.** New `src/components/ui/tones.test.ts` (3 cases —
  one per `toneTextClass` mapping). Vitest at 411/411 green (was 408 at end
  of 2.8.5). `pnpm build` green. Browser walkthrough confirmed:
  - Landing (`/`) — wordmark in header, footer is brighter muted, hero
    untouched, single LIVE tile renders.
  - `/sites` — wordmark in header, 69 sites render in their domain tones
    (C1 green, C4 magenta, C5 red, Combat red-soft), DPS cells emit
    `text-[var(--color-isk)]` etc., filter bar unchanged.
  - `/changelog` — wordmark in header, version-link reads `v2.9.2`, body
    copy brighter.
  - `FeedbackModal` opens, no console errors.
  - Zero `#3a5060` hits in `src/` after the migration.

Shipped on branch `version-2.9.2-shared-visual-primitives`.

Decisions worth carrying forward to Session O (navigation chrome + landing
grid):

- **The brand wordmark slot in `AppHeader` will grow to host the nav-tool
  strip.** Today's `AppHeader` renders only the wordmark on the left. Session
  O extends it: `[wordmark] [global search] [Wormhole Sites · Industry
  Planner · Wormhole Roll Calc]` per `nav-search-inline-push.html`. Right
  slot (LoginButton cluster) stays protected via `flex-shrink: 0` per the
  2.9.1 carry-forward.

- **JetBrains Mono still open.** Deferred from 2.9.2 per user call ("decide
  when the SVG wordmark goes into production"). Re-ask at the top of
  Session O. If adopted, add `--font-jb` via next/font in layout.tsx and
  render the hero wordmark with it; otherwise the existing Barlow Bold
  carries the brand.

- **Typography scale is in source but only `text-caption` + `text-body` are
  live.** Tailwind v4 JIT generation means the other sizes won't render
  until a consumer references them. Session O / P naturally pick this up as
  new content lands — no special migration needed, just *use* `text-title`
  for the hero, `text-title-sm` for card titles, `text-micro` for pill labels.

- **The `toneTextClass` helper takes a deliberately narrow subset (`green |
  orange | red`).** Future status labels (freshness, online/offline) extend
  this when they ship — widen the input type in `tones.ts`, add a new branch
  to the switch. Don't widen ahead of an actual consumer.

- **The global `a:hover` rule is intentionally simple.** Specificity-wise,
  Tailwind's `hover:text-X` overrides it; that's the escape hatch when an
  anchor genuinely needs different hover behavior. Keep adding `hover:text-*`
  to anchors only when the green-on-hover default is wrong for the context.

`VERSION_2.9_PLAN.md` stays in the repo — Sessions O through Q are still
ahead. No archive moves this session.

## Version 2.9.1: COMPLETE (2026-05-25)

Planning-only session (Session M in the 2.9 plan doc) establishing the
cross-tool visual identity, navigation shape, and information density for
the 2.9 envelope. Three approved wireframes plus six rejected explorations
shipped to `docs/wireframes/`; one plan-doc rename. Zero production code,
zero `src/` edits — implementation lands in subsequent sessions (N → Q).

What landed:

- **`PHASE_2.9_PLAN.md` → `VERSION_2.9_PLAN.md` rename** via `git mv`, plus
  a SCRATCHPAD sweep removing the "Will rename when the version is actually
  opened" placeholder. The 2.7-onward `VERSION_<n>_PLAN.md` naming is now
  consistent across every active plan doc.

- **`docs/wireframes/` is the new directory for low-fi sketches.** Three
  approved files at the top level, six rejected explorations in
  `_rejected/` (kept as decision records, not deleted, per user call).
  Each file is self-contained HTML/SVG with inline `<style>`, opens in any
  browser via `file://`, no dev server needed.

- **`landing-grid.html` (approved) — multi-tool landing replacement.**
  Hero `[ Lo-Gang ] Industries.tools` (no terminal cursor — see below),
  three tiles: 1 LIVE (`Wormhole Sites`, drawn in its hover state to
  demo the polish vocabulary), 2 SOON (`Industry Planner`, `Wormhole
  Roll Calculator`). Grid uses `repeat(auto-fill, minmax(270px, 1fr))`
  with 12px gap; handles 4–8 tools without rebalancing. SOON tiles are
  `cursor: default` with 60% description opacity and no hover-glow —
  the LIVE/SOON badge is the only permanent differentiator.

- **`nav-search-inline-push.html` (approved) — global nav with embedded search.**
  44px sticky top bar. Layout: `[wordmark] [search 280px] [Wormhole
  Sites · Industry Planner · Wormhole Roll Calc] [freshness · login chip]`.
  On focus, the search expands to 440px and tool links shrink from full
  labels to 2-letter abbreviations (`WH/IP/WR`). Tools have `flex-shrink: 1`;
  search bar's expansion ceilings at whatever room remains. **Right slot
  (admin chip · portrait · name · characterId) is bulletproof via
  `flex-shrink: 0` — never gets pushed, even at narrow viewports.**
  Dropdown anchors to the search input position, ~520px wide, with
  Spotlight-style categorized results: `Sites`, `Recent`, `Commands`.
  Future scopes (`Tools`, `Resources`, `Help`) plug into the same UI.

- **`sites-density.html` (approved) — resource-scoped card hovers.**
  Both density affordances (card-glow + resource-preview overlay) scoped
  to **ore + gas cards only**. Combat / relic / data cards stay completely
  static — no `:hover` rule, no glow, no preview. Implementation note for
  Session P: `SiteCard.tsx` already computes `isWaveDriven = isCombat ||
  isHackSite` (line 46) — emit a `.card.resource` vs `.card.wave-driven`
  class from there. No new prop, no new logic. The resource preview shows
  top-3 by ISK + total, anchored to the trailing metric block.

- **Wordmark stripped of the terminal cursor across all wireframes.** Earlier
  iterations had a green `█` block at the end of `[LGI].tools` (animated
  blink) and at the end of the hero's `Industries.tools`. All removed
  per user feedback ("no more blinking it's too much"). Search inputs use
  the browser's native text caret when focused; the only styled visual
  is the green `>` prompt at the input's left edge. One thing happening
  at a time.

- **Six rejected explorations in `docs/wireframes/_rejected/`** as decision
  records. `nav-top-bar.html` (pre-search-in-nav recommendation, superseded
  once search-in-nav was on the table). `nav-side-rail.html` (vertical rail
  — lost on brand legibility). `nav-command-bar.html` (⌘K modal overlay —
  superseded by inline). `nav-command-bar-from-logo.html` (panel dropping
  from the wordmark cursor — obsolete after cursor removal).
  `nav-search-overlay-takeover.html` (search expanding over the whole nav —
  too dramatic; chosen variant pushes instead). `nav-search-dominant-
  spotlight.html` (search permanently dominant with always-visible scope
  chips — too aggressive for current scale).

- **Reference HTML files at `../LGI Tool References/`** (`lgi-landing-v2.html`
  + `lgi-nav-logo.html`) are the canonical visual baseline. Same tokens as
  `globals.css` verbatim. Two divergences from current code that the
  wireframes adopted: **JetBrains Mono** for the wordmark/hero (the codebase
  currently uses Barlow Condensed for display), and a new
  **`--text-muted-2: #6a7a8a`** brighter muted token that replaces today's
  `#3a5060` everywhere footer copy / freshness chips / dim nav-tools /
  section labels appear.

Decisions worth carrying forward to Session N (shared visual primitives):

- **Polish & motion vocabulary is documented in the wireframes**, ready to
  port verbatim to production CSS:
  - Tile hover: 2px green top-border via `::before` pseudo-element + tinted
    background (`#090e0c`) + outer glow `box-shadow: 0 0 0 1px
    rgba(61,214,140,0.15), 0 8px 24px -8px rgba(61,214,140,0.2)`.
  - Card hover (site cards, ore/gas only): lower-intensity glow
    `box-shadow: 0 0 0 1px rgba(61,214,140,0.08)` + 1px green-tinged border.
  - Link hover: every `<a>` transitions color to `--isk` in 150ms. Replaces
    the codebase's ad-hoc `hover:opacity-90` / `hover:text-name` patterns.

- **`--text-muted-2: #6a7a8a` should land in `globals.css`.** Used everywhere
  a footer/dim/freshness/section-label currently uses `--text-muted`. Decide
  during Session N whether to retire the original token or keep both.

- **Right-slot protection is load-bearing.** The login chip cluster must
  never get pushed by search expansion or tool growth. CSS contract:
  `flex-shrink: 0` on `.nav-right`, `flex-shrink: 1` on `.nav-tools`. If
  the platform ever exceeds ~5 top-level tools, group them under
  `Wormholes ▾ → Sites / Roll Calc` / `Industry ▾ → Planner / Blueprints`
  dropdowns rather than letting the nav grow. User explicitly chose grouping
  over horizontal expansion.

- **Search becomes the global navigation primitive.** Inline-push is the
  chosen mechanic. Long-term the search covers tools, all 69 sites, all SDE
  ore + gas + salvage types, recent history, and commands (refresh prices,
  open changelog, log out, admin actions). The existing `<TerminalSearch>`
  primitive (currently feature-scoped to `/sites`) is the starting point —
  Session N or O promotes it to global and extends the parse + suggest
  callbacks to handle the cross-source result set.

- **JetBrains Mono adoption is undecided.** Wireframes use it for the
  wordmark + hero per the reference files. Adopting means a third Google
  Font import in `layout.tsx` and a new `--font-jb` token. Substituting
  re-renders the SVG wordmark using Barlow Bold (the bracket-stamp shape
  carries the brand regardless). Confirm before any production CSS lands.

- **The `nav-command-bar-from-logo.html` concept is dead.** It was the
  bridge between "pure command-bar overlay" and "inline search" — the
  user converged on inline-push, which makes the cursor-as-portal mechanic
  unnecessary. File remains in `_rejected/` for context but should not
  inform Session N.

- **No `CHANGELOG.md` entry for 2.9.1.** Per CLAUDE.md ("would a wormhole
  pilot loading the site notice this?"): no — this is internal planning,
  no user-facing surface changed. A "platform groundwork" one-liner can
  land when Session N's user-visible primitives ship.

`VERSION_2.9_PLAN.md` stays in the repo — sessions N through Q are still
ahead. No archive moves this session.

## Version 2.8.5: COMPLETE (2026-05-25)

Public-beta readiness shipped. The user-facing trust layer — the
last piece before strangers can arrive cold from EVE forums / Reddit
without something embarrassing happening. Five surfaces in one PR,
none sharing state, none requiring schema changes.

What landed:

- **`<Modal>` is the third domain-agnostic UI primitive after
  `<UrlSync>` and `<TerminalSearch>`.** Lives at
  `src/components/ui/modal.tsx` — a thin wrapper around the native
  HTML `<dialog>` element. Browser handles focus trap, Esc-to-close,
  and inert-ing the rest of the page; backdrop-click-to-close is
  wired explicitly via target-equality (`event.target === ref.current`).
  Zero new deps. Controlled `open` prop, parent owns state, `onClose`
  callback covers all three close paths (X-button, Esc, backdrop).
  The only consumer in this PR is `<FeedbackModal>`, but the next
  overlay (admin confirmations, EVE auth detail, future "expand to
  edit" affordances) reuses it for free.
- **Feedback feature slice is `src/features/feedback/`.** Just one
  file — `components/FeedbackModal.tsx`. No `schema.ts` / `queries.ts`
  because the feature owns no DB writes; the `usage_logs` write is
  brokered by the telemetry slice (`logUsageEvent()` called inside
  the API route handler, server-side dispatch). Per the 2.8.4
  carry-forward decision (lines 124–131 of the previous entry):
  feedback events live in `usage_logs` with `action: 'feedback_submitted'`,
  not a dedicated `feedback_events` table. One operational record
  store is cleaner than two.
- **Page-URL capture on modal OPEN, not on SUBMIT.** The reactive
  intent behind feedback ("this page is wrong") should not get
  clipped if the user happens to client-side-nav between opening
  the modal and submitting. Captured once in `useEffect` when
  `open` flips to true: `window.location.pathname + window.location.search`.
  Sent as `path` in the request body; server validates it starts
  with `/` and caps length. Stored in `usage_logs.metadata.path` so
  future `/admin/usage` sections can group feedback by page without
  re-parsing the Discord channel.
- **Telemetry write is AFTER Discord succeeds, not before.** Same
  precedent as the 2.8.2 role-toggle route — the audit log records
  *successful* state-changing actions, not attempts. If Discord
  returns non-2xx or the fetch throws, we return 502 to the modal
  (which surfaces it inline so the user can retry) and skip the
  `logUsageEvent()` call entirely. The Discord channel is the
  durable record of message content; `usage_logs` is the local
  pointer that something was sent. Don't log content to `usage_logs`
  — only `messageLength` + `path`.
- **`<FeedbackButton>` is now a Client Component.** Owns the modal's
  open state (`useState`). Layout passes the `Session | null` through
  as a prop (server-rendered, mirrors how `<LoginButton>` gets its
  session). Floating fixed-position styling unchanged. The trigger
  switched from `<a href="/feedback">` to `<button onClick>` — the
  `/feedback` URL becomes dead but `not-found.tsx` (same PR) catches
  any stale link with the new EVE-themed 404.
- **`/legal` route at `src/app/legal/page.tsx`.** Static Server
  Component, two `<Card>` sections — "What we collect" describing
  `usage_logs` in plain English, and "EVE Online developer notice"
  with the Fenris Creations boilerplate. Linked from the footer's
  `left` slot adjacent to the existing trademark line (one extra
  `<Link>`, no slot restructure). Layout mirrors `/changelog`
  (`max-w-[800px]`, centered, uppercase `font-display` header).
- **BETA banner on `/changelog`, not in the global header.** Reuses
  the existing `<Callout label="Beta">` primitive (orange-tinted
  attention element, same component the auth-error messages on `/`
  use). Sits above the page `<header>` block. Decision driven by
  the 2.8 plan doc — header stays clean; BETA expectation only
  fires when someone actively looks at "what's shipping," which
  the version-link in the footer is the entry point for.
- **`error.tsx` + `not-found.tsx` at the app root.** Both centered
  EVE-themed layouts mirroring `src/app/page.tsx`. `not-found.tsx`
  is a Server Component (no props per Next.js 16 contract);
  `error.tsx` is a Client Component (`'use client'` required) and
  uses the v16.2.0+ `unstable_retry` prop (not the deprecated
  `reset`). The error page renders `error.digest` in a `<Pill>` so
  the user can include it in a feedback report. Deliberately *not*
  adding `global-error.tsx` — `error.tsx` lets the global header /
  footer keep rendering, which is the better UX for the 99% case.
  `global-error.tsx` is only worth adding when errors are crashing
  the root layout itself, which they aren't.
- **`APP_VERSION` bumped to `2.8.5`.** Hand-edited per the 2.8.3
  convention.
- **Tests + verification.** New `src/app/api/feedback/route.test.ts`
  with 12 cases covering: happy path (logged in, with captured path),
  anonymous path, empty-message rejection, oversize message
  rejection, missing-`/`-prefix path rejection, oversize path
  rejection, malformed JSON, non-string message, control-char strip
  on both fields, Discord 5xx → 502 with no telemetry write, Discord
  network error → 502 with no telemetry write, missing
  `DISCORD_WEBHOOK_URL` → 503. Vitest at 408/408 green (was 396).
  Full e2e in local dev confirmed: real test feedback fired through
  to Discord, `usage_logs` row landed with `character_id = 2114872920`
  and `metadata = { path: '/sites?class=c3&type=combat',
  messageLength: 152 }`.

Shipped on branch `version-2.8.5-public-beta-readiness`.

Decisions worth carrying forward:

- **The `<Modal>` primitive is the new fast path for any overlay.**
  Don't reinvent dialog-with-focus-trap-and-Esc-handling per
  feature. The native `<dialog>` element with an explicit
  backdrop-click handler is the whole contract. If a future overlay
  needs custom backdrop behavior (e.g., persistent until completed),
  grow the primitive's contract — don't fork it.
- **Server-side telemetry dispatch is the right pattern for
  state-changing actions.** Page-view + terminal-search go through
  `/api/telemetry` because they're client-initiated. Feedback,
  login, logout, role-change all log directly via `logUsageEvent()`
  inside the route handler. The boundary is: who initiates the
  action determines who logs it. Mixing the two (logging from both
  client AND server for the same event) double-counts; pick one
  side and stick with it.
- **DISCORD_WEBHOOK_URL needs to be in Vercel env vars before merge
  — both preview AND production.** Preview because the Vercel
  preview deploy of this PR will exercise the feedback flow; without
  the env var the modal returns 503. Production for the actual
  public-beta. Add via `vercel env add DISCORD_WEBHOOK_URL preview`
  and `vercel env add DISCORD_WEBHOOK_URL production` (or use the
  Vercel dashboard).
- **`VERSION_2.8_PLAN.md` should be archived after this PR merges.**
  2.8.5 was the last sub-version; the plan doc has served its
  purpose. Move it to `../LGI Tools Document Archive/` and `git rm`
  the in-repo copy per the CLAUDE.md convention. This was deferred
  out of this PR because the plan doc is still being referenced
  during review — archive in a follow-up chore commit.
- **2.9 visual pass still on the schedule.** Per 2.8.4's
  carry-forward (lines 156–163 of the previous entry), the admin
  surfaces are functional-only and need a polish pass in 2.9. The
  2.8.5 surfaces (feedback modal, legal page, 404 / error pages)
  should get the same review in that pass — they're shipped
  functional but the typography / spacing wasn't audited at the
  pixel level, and the EVE flavor copy ("Nothing on D-Scan", "Pod
  malfunction") is opening salvo, not load-bearing.
- **`postTelemetry()` is now unused by 2.8.5 but stays.** Feedback
  uses server-side `logUsageEvent()` directly. `postTelemetry()`
  remains the right primitive for any future client-initiated event
  (the page-view reporter and terminal-search consumer still use
  it). Don't delete it on grounds of one new feature not needing it.

## Version 2.8.4: COMPLETE (2026-05-25)

First-party telemetry + the preference-write primitive shipped. The site
now records its own usage to a `usage_logs` table and an admin-only
report surfaces it. This is the data plumbing the EVE Partner Program
audit asks for — no third-party trackers, no IP/UA capture, just
characterId (nullable for anonymous reach) + action + JSONB metadata.

What landed:

- **`src/data/telemetry/` is the new data slice**, modelled on
  `src/data/market-prices/` (schema + types + queries, no UI). One
  table — `usage_logs` (id, timestamp, characterId nullable FK ON
  DELETE SET NULL, action text, metadata jsonb) — plus three indexes
  matching the three real read shapes (recent-events by timestamp,
  group-by-action, per-character timeline). `logUsageEvent()` is the
  server-side write primitive; six read helpers (`getAggregateSummary`,
  `getTopActions`, `getDailyCounts`, `getTopPages`, `getTopSearches`,
  `getRoleChangeAudit`) cover the dashboard + report.
- **`action` is `text` + a TS const array, NOT a Postgres enum.** The
  vocabulary grows with every feature (2.8.5 adds `feedback_submitted`,
  future versions add more) and we don't want a migration per addition.
  Same pattern the codebase already uses for URL filter validation
  against `SITE_TYPES` / `WORMHOLE_CLASSES`. Runtime check at the route
  handler boundary; compile-time check via `UsageAction` literal type.
- **Anonymous visitors ARE tracked** with `character_id = NULL`. The
  Partner Program cares about total reach; the EVE Online community is
  not all logged in. Privacy story is unchanged: no IP, no UA, no
  session fingerprint — just the URL path and (for terminal search)
  the typed query.
- **`<TelemetryReporter>` is the single page-view source.** Client
  Component mounted once in `src/app/layout.tsx` inside a
  `<Suspense fallback={null}>` (the `useSearchParams()` hook requires
  a Suspense boundary or it forces the whole app to client-render).
  Listens to `usePathname()` + `useSearchParams()`, fires a beacon
  to `/api/telemetry` per URL change. Skip-list includes `/admin/*`
  and `/api/*` so the developer's own dashboard inspection doesn't
  pollute the metrics they're reading.
- **Server-side actions log directly via `logUsageEvent()`.**
  `/api/auth/callback` writes `auth_login`, `/api/auth/logout` writes
  `auth_logout` (after reading the session but before clearing the
  cookie, so the actor is attributed correctly), `/api/admin/role`
  writes `role_change` with `{ actorCharacterId, targetCharacterId,
  from, to }` in metadata. Each call is wrapped in `.catch(console.error)`
  so a telemetry failure never breaks the user-facing path.
- **`postTelemetry()` is the client-side helper** at
  `src/components/telemetry/client.ts`. Two consumers (the page-view
  reporter and `<SitesTerminalSearch>`) share the sendBeacon-with-fetch-
  fallback logic. The `keepalive: true` flag on the fetch matters for
  tab-close cases — sendBeacon is preferred but isn't universally
  available.
- **Terminal search now passes the raw input through.** Tiny additive
  change to the `<TerminalSearch>` primitive's `onSubmit` signature
  (`(params, raw) => void`). The wormhole-sites wrapper uses the raw
  string for the `terminal_search` event payload while still passing
  the parsed params to navigation. Future TerminalSearch consumers
  (sleeper lookup, killmail browsing, ...) get the same raw-string
  capture for free without changing their adapter.
- **Preference infrastructure ships without a consumer.** The original
  2.8.4 plan was to wire this against the wormhole-sites filter, but
  the user reversed that call — players bounce between site types as
  they hop systems in-game, so sticky filters fight the natural flow.
  Built `setCharacterPreference(characterId, key, value)` /
  `getCharacterPreferences(characterId)` in `src/features/auth/queries.ts`
  with the JSONB `||` merge so setting key `b` doesn't clobber key `a`.
  `POST /api/auth/preferences` is the public surface with a strict
  key slug regex (`^[a-zA-Z][a-zA-Z0-9_-]*$`), 64-char key cap, and
  4KB value cap. First real consumer lands when a feature actually
  wants sticky state (theme, default landing tab, ...).
- **`/admin` aggregate card** at the top of the page, above the search
  + admins list. Three stat blocks (total events, unique characters,
  anonymous events) + a top-5 actions list with horizontal-bar
  visualisation. Bars are styled `<div>`s with width computed from
  count/max — no charting library. This is also the 2.8.3-deferred
  empty-q layout pass; the admin page now opens with overview metrics
  before the drill-down tools.
- **`/admin/usage` is the full report.** Server Component, gated by
  the same `isAdmin()` check as `/admin` (deny-by-default per route,
  per the 2.8.2 pattern). Range driven by URL: `?range=7d|30d|90d|all`,
  default 30d. Sections: Summary (3 stat blocks), Daily Activity
  (table with inline volume bars), Top Actions (bars), Top Pages
  (bars), Top Terminal Searches (bars), Role Change Audit (chronological
  table with actor → target via Pill chips). `<PrintButton>` is a small
  client component that calls `window.print()`.
- **`@media print` stylesheet in `globals.css`.** Hides global header,
  footer, FeedbackButton, every `<button>`, and anything marked
  `.no-print` (range chips + print button itself). Reveals
  `.print-only` content (a header with "LGI.tools — Usage report" +
  the date range so a printed page is self-identifying when it leaves
  the browser). Forces dark text on white, tightens table borders to
  print-friendly grey, locks the bar fills to a single mid-grey
  attribute selector so the bars remain visible after the dark-mode
  override. Sections get `break-inside: avoid` so a Card doesn't split
  mid-page. Zero new deps — browser's native "Save as PDF" produces
  the partner-program submission directly.
- **`APP_VERSION` bumped to `2.8.4`.** Hand-edited per the convention
  introduced in 2.8.3 (decoupled from `package.json`'s `version`).
- **Tests + verification.** New tests: `lastNDaysRange` correctness
  (3 cases), `/api/telemetry` route input validation (6 cases —
  authenticated write, anonymous write, unknown action, non-object
  metadata, oversized metadata, malformed JSON), `/api/auth/preferences`
  route validation (6 cases — 401 unauth, valid write, bad key
  pattern, oversized key, oversized value, 404 missing character).
  Updated the 2.8.2 role-toggle test to mock the new telemetry module
  so route tests stay decoupled from the data layer. Vitest at 396/396
  green (was 381 at the end of 2.8.3). Full local e2e in the browser:
  page-view rows confirmed for both authenticated and anonymous
  navigations, terminal_search rows captured the raw query + parsed
  shape, /admin and /admin/usage both excluded from the skip-list,
  preference merge confirmed via two sequential POSTs producing
  `{ theme: 'dark', tab: 'overview' }`, print stylesheet rules
  verified loaded in the document's CSSOM.

Shipped on branch `version-2.8.4-telemetry-and-preferences`.

Decisions worth carrying forward to 2.8.5:

- **`role_change` audit lives in `usage_logs`, not a dedicated table.**
  One operational audit + telemetry store is cleaner than two; the
  Role Change Audit section of `/admin/usage` reads back via
  `getRoleChangeAudit()` and joins to `characters` for name display.
  2.8.5 should follow the same pattern: log `feedback_submitted`
  to `usage_logs` rather than a separate `feedback_events` table.
  The Discord webhook is the user-facing destination; `usage_logs`
  is the local record that something was sent.
- **`postTelemetry()` is the client-side fast path for any new event.**
  When 2.8.5 adds the feedback modal, the submit handler should call
  `postTelemetry({ action: 'feedback_submitted', metadata: {} })`
  alongside the Discord webhook POST. Add `feedback_submitted` to
  `USAGE_ACTIONS` and the dashboard will pick it up automatically
  (it's already in the Top Actions list logic).
- **Preference primitive is ready for a real consumer.**
  `setCharacterPreference(characterId, key, value)` is the write
  path; the API endpoint is `/api/auth/preferences`. If 2.8.5 (or
  later) wants the user to dismiss the beta banner permanently, that
  becomes `preferences.dismissedBetaBanner: true` written via this
  endpoint. No new infrastructure needed.
- **The `<TelemetryReporter>` Suspense boundary is load-bearing.**
  Don't move the reporter out of its `<Suspense fallback={null}>` —
  `useSearchParams()` is the trigger for Next.js's full-page CSR
  bailout, and the Suspense scopes the bailout to the reporter only
  (which renders nothing anyway).
- **The dev DB connection pool can exhaust during Fast Refresh.** If
  you see "sorry, too many clients already" in dev logs, run
  `docker compose exec -T postgres psql -U lgi -d lgi_tools -c
  "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE
  application_name = 'postgres.js' AND state = 'idle';"` to clear
  stale idle connections. Not specific to telemetry — any heavy
  Next.js editing session can trigger it.
- **2.9 visual pass deferral.** The user has explicitly said the
  2.8.4 surfaces (admin aggregate card, /admin/usage layout, print
  output) are functional-only — visual polish lands in 2.9.
  Recommended pass for 2.9: tighten the stat-block typography,
  reconsider the volume-bar density on Daily Activity (currently
  each row has its own bar — might collapse to a single sparkline),
  and audit the print output against an actual letter/A4 PDF rather
  than the in-browser approximation.

`VERSION_2.8_PLAN.md` stays in the repo — 2.8.5 is the last sub-version
ahead. After 2.8.5 ships, archive the plan doc.

## Version 2.8.3: COMPLETE (2026-05-25)

The public-beta shell shipped. Three deliverables in one PR — terminal
search, global footer, changelog — none sharing data plumbing, all needing
to land before the public-beta launch at the end of 2.8.5. No schema
changes, no migrations, no new npm dependencies.

What landed:

- **`<TerminalSearch>` is the second domain-agnostic UI primitive after
  `<UrlSync>`.** Lives at `src/components/ui/terminal-search.tsx` —
  generic over `<Params, Err>`, takes parse / suggest / errorMessage
  callbacks plus onSubmit / onClear navigation hooks. Owns the input,
  autocomplete dropdown, click-outside / Esc to close, and inline error
  Callout. Future features (sleeper lookup, killmail browsing, fits
  browser) each contribute a ~50-line `terminal-query.ts` and a thin
  client wrapper and reuse the entire UI/UX shell. The wormhole-sites
  slice is its first consumer via `terminal-query.ts` +
  `SitesTerminalSearch.tsx`.
- **Order-agnostic parser, REPLACE semantics.** `parseTerminalQuery`
  classifies each `/`-separated token against a lookup table built once
  from `SITE_TYPES` + `WORMHOLE_CLASSES`, so `c2/combat` and `combat/c2`
  both parse to `{ class: 'C2', type: 'combat' }`. Submit REPLACES the
  URL (terminal feels like a command line — what you type IS the filter
  state); the existing `<FilterBar>` pill bar continues to MERGE
  (toggle one dimension). Two affordances, one URL state.
- **Discriminated-union errors over throwing.** Same precedent as
  `getSession()` returning `null` on decode failure. The `kind: 'empty'`
  case is the parser's signal to the primitive to call `onClear()`;
  every other kind renders as an inline `<Callout>` with copy supplied
  by the feature's own `terminalErrorMessage`. Empty input on submit
  navigates to `/sites` — clear-all is part of the contract, not a
  separate UI affordance.
- **Global footer mirrors `PageHeader` but added a `center` slot.** The
  primitive at `src/components/ui/page-footer.tsx` started as a pure
  mirror of `PageHeader` but grew a `center` slot when the floating
  `<FeedbackButton>` claimed the bottom-right corner of the viewport —
  the version-link in the right slot would have collided when scrolled
  to the bottom. PageHeader stays at `{ left, right }`; the shapes
  diverged where the use case actually demanded it, not preemptively.
- **`<FeedbackButton>` is a fixed-position floating affordance**
  (`bottom-4 right-4 z-30`) so feedback is reachable at any scroll
  position. Deliberately NOT extracted into a `<FloatingAction>`
  primitive — five Tailwind classes wrapping the existing `<Pill>` is
  not an abstraction worth its weight. The second floating affordance
  (whenever it lands) will dictate the right shape; abstracting against
  one consumer is guessing.
- **`/feedback` 404s by design.** 2.8.5 lands the real Discord-webhook
  route at that path. The button can ship today; the route lands later
  with zero rewrite. Production isn't public-beta yet, so the broken
  link is invisible to real users.
- **`/changelog` route + curated `CHANGELOG.md` + tiny custom parser.**
  Repo-root `CHANGELOG.md` (universal convention), restricted to
  `### YYYY-MM-DD` + `- bullet` format. `parseChangelog` is ~25 lines
  in `src/features/changelog/parse.ts` — explicitly chose this over
  pulling in `marked` / `react-markdown`. Curated content + curated
  parser is the right pairing; a markdown library invites authors to
  use whatever syntax and then we write CSS for every variant. If a
  future entry truly needs richer formatting, grow this parser exactly
  the feature it needs. Read at request time via `readFileSync`
  against `process.cwd()` — works in dev and on Vercel's RSC runtime
  with no bundler config.
- **`APP_VERSION` is hand-bumped, decoupled from `package.json`.** Lives
  at `src/config/app-version.ts` — a new `src/config/` directory for
  global constants that aren't slice-owned and aren't UI primitives.
  `package.json`'s `"version"` stays at `0.1.0`; npm package version
  and user-facing release line are different concepts and don't need
  to align.
- **Fenris Creations, not CCP.** Discovered mid-session that CCP Games
  rebranded to Fenris Creations on 2026-05-06 (split from Pearl Abyss,
  partnership with Google DeepMind). Footer trademark notice + changelog
  copy both updated. EVE Online IP now sits with Fenris.
- **Tests + verification.** `terminal-query.test.ts` (23 cases: parser
  across every error kind + happy paths, formatter round-trip,
  suggester prefix-match logic incl. invalid-first-token edge),
  `parse.test.ts` (6 cases: empty / single / multi / prose / orphan
  bullets / no-headings). Vitest at 381/381 green (was 352).
  Full e2e on local dev across all three blocks with three pause
  checkpoints for visual review per the iteration-plan workflow.

Shipped on branch `version-2.8.3-terminal-search-footer-changelog` —
[PR #13](https://github.com/StorminRH/lgi-tools/pull/13).

Decisions worth carrying forward:

- **The `<TerminalSearch>` primitive is the new fast path for any
  typed-filter affordance.** Don't reinvent the input + dropdown +
  error UI per feature — write a ~50-line `terminal-query.ts` and a
  thin client wrapper, and reuse. Confirm the contract by reading
  `SitesTerminalSearch.tsx`.
- **PageHeader and PageFooter no longer strictly mirror each other.**
  PageFooter has an additional `center` slot because the application
  footer needs it (floating button in the right corner); PageHeader
  doesn't have a use case for center yet. Adding it preemptively was
  rejected — extract symmetry when both sides demand it, not before.
- **`/feedback` is a known-404 placeholder until 2.8.5.** Don't "fix"
  the link by pointing it elsewhere — 2.8.5's plan is the Discord
  webhook at that exact path.
- **Audit-trail carry-forward from 2.8.2 still stands.** Role changes
  belong in 2.8.4's `usage_logs` table as `action: 'role_change'`.
  This version didn't touch that.
- **`/admin` empty-q UX revisit still pending.** 2.8.4's aggregate
  metrics will reshape that page's layout — defer the rework until
  the metrics section lands.

`VERSION_2.8_PLAN.md` stays in the repo — 2.8.4 and 2.8.5 are still
ahead. No archive moves this session.

## Version 2.8.2: COMPLETE (2026-05-25)

Admin gate + privilege management UI shipped. The latent `role` column on
`characters` is now a real surface — the superadmin (and anyone they
promote) can visit `/admin`, search the character roster by name, and flip
the `ADMIN` role on or off. No schema changes; everything builds on
2.8.1's `characters` table and session cookie.

What landed:

- **`isAdmin()` is THE authz primitive.** Lives in
  `src/features/auth/session.ts` next to `getSession()`. Pure function:
  takes a `Session | null` and the env, returns `boolean`. Two paths
  grant admin — `characterId === Number(SUPERADMIN_CHARACTER_ID)` from
  the env, or `role === 'ADMIN'` in the DB. Every future "can this user
  do X?" check goes through this one function the same way every
  "who's calling?" question goes through `getSession()`.
- **Gate sits in `page.tsx`, not a layout.** `src/app/admin/page.tsx`
  calls `getSession()` + `isAdmin()` and redirects unauthorized callers
  to `/?auth_error=admin_required`, where the existing `<Callout>` on
  the home page surfaces the message. Symmetric with how the 2.8.1
  `state_mismatch` redirect is rendered. Deliberately *not* in a
  layout: 2.8.4's `/admin/usage` sub-route will do its own `isAdmin()`
  check at the top of its own `page.tsx` — deny-by-default per route
  so each new admin surface has to opt in.
- **API handler is the real self-toggle guard.** `/api/admin/role`
  reruns the gate independently, validates `characterId` is a positive
  integer, checks `nextRole` against the runtime `CHARACTER_ROLES`
  array (not just TS narrowing), confirms the target row exists, and
  refuses self-toggles via `characterId === session.characterId`.
  The UI disable on the viewer's own row is decoration — a crafted
  POST still hits this guard. Same form-POST → 303 redirect shape as
  `/api/auth/logout`; no Server Actions, no client `fetch`.
- **"Admins" + "Search results" stack.** Empty-q view lists current
  admins ordered by name; with `?q=`, the matches render in a second
  section below, de-duped against the admins list. The env superadmin
  is merged in synthetically with a `Superadmin` chip and "managed via
  env" sentinel — otherwise they'd be invisible on the page they have
  authority over, since their DB role stays `USER` by design. The
  toggle is omitted from the synthetic row entirely (no DB role to
  flip).
- **Header chip-link.** When `isAdmin(session)` is true, the
  LoginButton renders a small purple `<Chip>` linking to `/admin`
  before the portrait. `isAdmin` is called server-side in
  `src/app/layout.tsx` and the resulting boolean is passed to the
  Client Component — so `SUPERADMIN_CHARACTER_ID` never crosses into
  the client bundle (avoiding the `NEXT_PUBLIC_*` leak that the naive
  fix would create).
- **Tests + verification.** `is-admin.test.ts` (6 cases: null /
  USER non-super / ADMIN / USER-is-super / env-unset / env-garbage),
  `queries.test.ts` (empty + whitespace short-circuit, asserts the
  DB is never touched), `route.test.ts` (the three primary rejection
  branches: 403 non-admin, 400 self-toggle, 400 invalid nextRole).
  Vitest stayed green at 352/352. Full local e2e through curl + a
  seeded `Test Alt` character covered grant, revoke, DB-ADMIN-only
  path, self-toggle handler guard, and four malformed-input branches.

Shipped on branch `version-2.8.2-admin-gate` — [PR #11](https://github.com/StorminRH/lgi-tools/pull/11).
Production verified post-merge: `curl -I https://lgi.tools/admin` from
a logged-out client returned `307 → /?auth_error=admin_required` and the
follow-up `/` rendered the AUTH Callout with the expected copy.

Decisions worth carrying forward to 2.8.4:

- **Role-change logging belongs in `usage_logs`.** 2.8.4 already ships
  the table (id, timestamp, characterId, action, metadata). When that
  lands, `setCharacterRole` should grow an `actorCharacterId` param
  and the route handler should write `action: 'role_change'` with
  `{ target, from, to }` in metadata. Deliberately did not add a
  separate `role_changes` audit table — one place for operational
  audit + telemetry is cleaner than two.
- **Revisit the empty-q UX once 2.8.4's aggregate metrics land.**
  Today the `/admin` empty-q view shows "Admins" with the synthetic
  superadmin. When usage metrics get a section on the page, the
  layout will want a second pass — probably metrics first, admins
  second, search third.
- **`pg_trgm` GIN index on `characters.name` deferred.** Substring
  ILIKE over a tiny table is sub-millisecond; the one-line migration
  earns its cost when there are 5k+ rows, not 1.
- **`isAdmin` for the env path uses `Number(process.env...)`.**
  `Number(undefined)` and `Number('not-a-number')` both yield `NaN`,
  which never equals a real characterId — so unset/garbage env
  gracefully degrades to the DB-role-only check. Unit tested in
  `is-admin.test.ts`.
- **Two equal-rank gates per route.** Page + handler both call
  `isAdmin()`. Belt-and-suspenders by design — neither relies on the
  other being right. Pattern to repeat for any future admin surface.

`VERSION_2.8_PLAN.md` stays in the repo (2.8.3 through 2.8.5 ahead). No
archive moves this session.

## Version 2.8.1: COMPLETE (2026-05-25)

EVE SSO login shipped. The site now has an identity layer — every future
2.8.x sub-version (admin gate, telemetry, preferences, feedback) builds on
the `characters` row and the session cookie introduced here.

What landed:

- **Custom OAuth2 + JOSE, not Auth.js.** A ~150-line route-handler set
  (`/api/auth/login`, `/callback`, `/logout`, `/me`) plus a `jose`-backed
  encrypted session cookie. Picked custom over Auth.js v5 because (a)
  Next.js 16 is days-old and the framework-agnostic auth libs are still
  catching up, (b) Auth.js's `users` / `accounts` / `sessions` triplet
  doesn't match our planned `characters` shape, and (c) the codebase
  culture is one focused primitive per concern — a 60-line OAuth handler
  fits that voice. `jose` is the only new dep.
- **`characters` table.** `drizzle/0010_clever_maestro.sql` — bigint PK
  (`character_id`), `name`, `portrait_url`, `role` enum (`USER` / `ADMIN`
  from day one, defaults to `USER`), `preferences` jsonb default `{}`,
  plus `created_at` / `updated_at` / `last_login_at`. Both enum values
  are present even though only `USER` is assigned in 2.8.1; adding enum
  values later is a heavier migration than including both up front.
  SUPERADMIN stays env-based per the 2.8 decisions doc, so two DB roles
  is the full set.
- **`getSession()` is THE identity primitive.** `src/features/auth/
  session.ts` exports the one function every future feature uses to ask
  "who is calling?". It reads the `lgi_session` cookie, decrypts the JWE,
  and re-queries the `characters` row each call — so admin grants in
  2.8.2 and preference writes in 2.8.4 take effect without forcing a
  re-login. Decode failures (missing cookie, tampered value, expired JWE,
  deleted row) all silently return `null` rather than throwing.
- **Three-tier slice discipline.** `src/features/auth/` splits by purity:
  pure helpers (`pkce.ts`, `eve-sso.ts`, the JWE crypto in `session.ts`)
  have zero `@/db` / `next/headers` imports and are trivially
  unit-testable; the data tier (`schema.ts`, `queries.ts`) is pure
  Drizzle; only the server-shell glue (`getSession()`, the route
  handlers, `LoginButton`) reads cookies, calls EVE, or composes the
  above. Single-knob constants (`EVE_SCOPES = ['publicData'] as const`,
  cookie names, session lifetime) live in their owning module so
  extending scopes / renaming cookies / changing the TTL is one config
  change.
- **`PageHeader` is a reusable UI primitive, not auth-specific.**
  `src/components/ui/page-header.tsx` is a domain-agnostic slot wrapper
  (`{ left?, right? }`) — the auth feature *consumes* it, doesn't own
  it. 2.8.3's global footer will mirror it as `page-footer.tsx` with the
  same shape. The characterId display reuses the existing `Pill`
  primitive; the auth-error message on `/` reuses the existing `Callout`
  primitive. No bespoke styled spans, no one-off "AuthError" component,
  no premature `<Copyable>` abstraction (one consumer, inline
  `navigator.clipboard.writeText` is correct for now).
- **PKCE S256 + opaque state.** The `/login` route mints a 32-byte
  base64url verifier + 16-byte state, sets both as 10-minute httpOnly
  `path=/api/auth` cookies, and redirects to `login.eveonline.com/v2/
  oauth/authorize`. The callback validates state, exchanges the code for
  an access token, `jose.jwtVerify`s it against EVE's JWKS, parses
  `sub: "CHARACTER:EVE:<id>"`, upserts the row (name + portrait +
  lastLoginAt updated; role + preferences preserved), and seals a JWE
  session cookie (`alg=dir`, `enc=A256GCM`, 7-day expiry). The refresh
  token is **discarded** — 2.8.1 doesn't call ESI, so persisting it would
  be premature. When ESI calls become a thing, a `tokens` table keyed by
  characterId lands then.
- **Login button + characterId pill.** The root layout is now `async`
  and renders `<PageHeader right={<LoginButton session={session} />} />`.
  Logged-out: anchor "Log in with EVE". Logged-in: portrait, name,
  click-to-copy `<Pill>` with the characterId — the bootstrap copy
  target for 2.8.2's `SUPERADMIN_CHARACTER_ID`. Logout is a POST-only
  form to keep link prefetch from logging users out.
- **Tests + verification.** New `pkce.test.ts` and `eve-sso.test.ts`
  cover the pure helpers (verifier shape, S256 math, `claimsToCharacter`
  parsing + rejection of malformed `sub`, authorize URL params). Vitest
  suite stayed at 339/339 green. Verified locally: `/api/auth/login`
  with placeholder creds 302s to `login.eveonline.com` with all OAuth +
  PKCE params and both handshake cookies set; `/api/auth/callback?
  code=garbage&state=garbage` cleanly redirects to `/?auth_error=
  state_mismatch` and the `Callout` renders. The full
  CCP-portal-to-DB-row e2e needs real EVE app credentials in
  `.env.local`.

Decisions worth carrying forward:

- Refresh tokens are discarded in 2.8.1. The earliest version that needs
  them adds a separate `tokens` table; don't bolt them onto
  `characters`.
- The `CHARACTER_ROLES` enum has both `USER` and `ADMIN` from day one,
  even though `ADMIN` isn't assigned to anyone until 2.8.2. Extending
  the enum mid-flight is a heavier migration than including both up
  front.
- `getSession()` always re-queries the DB row. The session cookie is
  *just* an authenticated reference to a characterId; the source of
  truth for role / preferences / name / portrait is the table. Future
  callers should treat `getSession()` as cheap and call it from
  wherever they need identity, not pass it through props from the
  layout.
- The session cookie uses `alg=dir` + `enc=A256GCM` with a 32-byte
  `SESSION_SECRET`. Rotating the secret invalidates all live sessions.

Shipped on branch `version-2.8.1-eve-sso-login` — [PR #10](https://github.com/StorminRH/lgi-tools/pull/10).

**Bootstrap done in this session.** EVE character `2114872920` (Nimrots
Sarikusa — the developer's primary account, also the owner of the EVE
SSO app registration in CCP's portal) is the superadmin. The
`SUPERADMIN_CHARACTER_ID` env var is already set in `.env.local` and in
Vercel production, so 2.8.2's admin gate will recognise it the moment
the middleware ships. The DB row stays role `USER` — superadmin
authority comes from the env, ADMIN from the DB, intentional separation
per the 2.8 decisions doc.

**JWT issuer bugfix.** First real login surfaced one bug — `EVE_ISSUER`
was set to `login.eveonline.com` but EVE's JWT `iss` claim is the full
URL `https://login.eveonline.com`. One-character fix in `eve-sso.ts`.
Worth remembering: EVE's JWT claims use full URLs for `iss`, and `aud`
is an array containing both the client_id and the literal string `"EVE
Online"` — we audience-check against the latter.

**Two EVE apps, not one.** CCP's portal only allows one Callback URL
per app, so we registered two apps in their portal: `lgi.tools` (prod,
callback `https://lgi.tools/api/auth/callback`) and `lgi.tools (dev)`
(local, callback `http://localhost:3000/api/auth/callback`). Each has
its own client_id + secret; `.env.local` uses the dev app, Vercel
production uses the prod app. Standard OAuth pattern — every
future env that needs auth (a real staging tier, etc.) gets its own
EVE app registration. Don't try to make one app cover multiple
environments; the portal won't let you.

**Production verified via Vercel runtime logs**, not via a direct prod
DB query. The Neon MCP's API key can't see the LGI project (it's
provisioned by the Vercel-Neon marketplace integration under an
isolated Vercel-managed Neon org), so the path-of-least-friction for
"did the prod callback succeed?" is `get_runtime_logs` via the Vercel
MCP — a 302 with no `auth_error=*` follow-up redirect is observable
proof the upsert and session-cookie set both completed. Documented in
CLAUDE.md alongside the other MCP notes.

`VERSION_2.8_PLAN.md` stays in the repo (still active — 2.8.2 through
2.8.5 ahead). No archive moves this session.

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
- [VERSION_2.9_PLAN.md](VERSION_2.9_PLAN.md) — pre-3.0 visual overhaul
  (also covers the J/K UX work deferred out of 2.5).
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
