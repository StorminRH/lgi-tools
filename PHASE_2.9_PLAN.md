# LGI.tools — Phase 2.9 Plan

## What this is

LGI.tools is positioned as a multi-tool platform. Today the landing
page has one tile and the only browsable surface is `/sites`. The
visual chrome was sized for a single feature; it was never designed
to host a *grid* of tools.

Phase 2.9 sets that foundation. Before Phase 3 ships an industry
helper, the navigation, information density, and visual identity get
a coherent pass so adding a new tool feels native rather than
bolted-on. Phase 2.9 ships no new features — only the envelope the
next feature will arrive inside.

This phase is a design pass first, an implementation pass second.
Recommend at least one round of low-fidelity mockups (sketches, not
production CSS) before any code is written.

---

## How to use this document

Same shape as the Phase 2 plan (archived — see
`LGI Tools Archive/PHASE_2_PLAN.md` outside this repo). Read
[CLAUDE.md](CLAUDE.md),
[AGENTS.md](AGENTS.md), [SCRATCHPAD.md](SCRATCHPAD.md), and any
in-flight Phase 2.5 work before proposing a Phase 2.9 plan.

The goals below are **not yet locked in.** Phase 2.9 begins with a
planning conversation. Confirm each goal's scope with the user
before drafting wireframes.

---

## Decisions already made

- **No card layout regression.** The wormhole site card is the
  canonical visual contract from Phase 1 — Phase 2.9 may add
  navigation chrome around it, but inside the card nothing moves
  unless the user explicitly approves.
- **Tone palette is one slice's data today.** Wormhole tones live
  in `src/features/wormhole-sites/components/wormhole-styles.ts`.
  Phase 2.9 introduces a slice-agnostic tone vocabulary in
  `src/components/ui/` that tools opt into; wormhole-styles maps
  domain meaning (C5 = red) to the shared tokens.
- **Sketches before pixels.** No production CSS until the
  navigation shape, density model, and landing grid have been
  reviewed in wireframe form.
- **Mobile is not a target.** Cards display fine narrow today; that
  doesn't generalize to a tool grid. The cross-tool envelope is
  desktop-first. Re-evaluate after Phase 3.

---

## Goals (to be confirmed at the start of Phase 2.9 planning)

### G1 — Persistent tool navigation

A user on `/sites` can jump to `/industry` (or any future tool)
without going through the landing page. Probable shape: a top nav
bar with tool tiles and the current section breadcrumbed.

**Questions to confirm with user.**
- Top bar vs. side rail vs. command-bar overlay?
- Is the breadcrumb necessary, or is the active tool tile enough?
- Should the landing page stay reachable (logo click), or does the
  nav itself become the home?

### G2 — Multi-tool landing grid

The current single-tile landing scales to maybe two tiles before
looking sparse. Replace with a grid layout room for 4–8 tools,
each carrying a short description and a "what kind of question
this answers" subtitle.

**Questions to confirm.**
- Visual style: dense grid of equal tiles, or hero + secondaries?
- Empty future-tool slots — placeholder tiles vs. flexible layout
  that grows naturally?
- Per-tool freshness chip on the tile (e.g. "prices updated 4h
  ago" on the wormhole-sites tile)?

### G3 — Cross-site summary view

The `/sites` card layout is dense but lacks at-a-glance summaries
across the dataset. E.g. "highest-value combat site in C5" or
"average gas value across all C3s." A complementary sortable
table view answers those questions without scanning 69 cards.

Coordinated with Phase 2.5 Session J — Phase 2.5 ships the table
mechanically, Phase 2.9 makes it match the visual envelope. **If
the user prefers, Session J defers into Phase 2.9 entirely.**

### G4 — Per-site deep-link page polish

Phase 2.5 Session L ships the `/sites/[id]` routing. Phase 2.9
gives it the layout treatment — full-width card, a meta strip
showing source/last-update, ideally a "back to list" affordance
that preserves filters.

### G5 — Shared visual identity

The current palette and typography were chosen for one tool. The
industry helper (Phase 3) will need to feel like a sibling tool,
not a separate site. Goals:

- A shared `src/components/ui/tones.ts` (or extension to existing
  primitives) so every tool consumes the same green/orange/red
  semantic palette.
- One typography scale, documented, that every tool follows.
- A reusable header/footer pattern that all tools render.
- The wordmark and the "tool subtitle" pattern (e.g. "LGI.tools —
  Wormhole Sites") generalized to "LGI.tools — `<active tool>`."

### G6 — Information density audit on `/sites`

A pass over the current card layout looking for "everyone wants
to see this but it's two clicks away" patterns. Examples to
investigate (confirm with user):

- Sleeper wave totals at the card header instead of inside the
  expand?
- Hover-to-preview the resource row without expanding the card?
- A subtle freshness chip per card showing live-vs-Sheet status?

This goal is the most subjective. Recommend mockups first;
implementation last.

---

## Suggested session shape

Phase 2.9 is one long design loop, then a shorter implementation
push. Anticipated sessions:

**Session M — Wireframes and identity decisions.**
A planning-only session producing low-fi sketches of: landing grid,
top-bar nav, list-view treatment, deep-link page, density audit
findings. Outputs: PNG/SVG sketches checked into `/docs/`. No code.

**Session N — Shared visual primitives.**
Tones, typography, header/footer. Code-only session. No new pages
yet; just the primitives the later sessions consume.

**Session O — Navigation chrome + landing grid.**
Implements the global nav, redesigned landing, and stub tiles for
forthcoming tools. `/sites` is reachable through the nav now.

**Session P — `/sites` density refresh + deep-link page polish.**
Apply Session M's findings to the wormhole-sites surfaces. Tone
mappings move into the shared layer. Card internals **don't**
change unless the user explicitly approves.

**Session Q — Cross-site list/table view.**
Either implements the table from scratch or polishes Phase 2.5's
Session J output.

Each session is gated on user sign-off of the previous session's
output. Visual passes that don't pass the eye test get iterated
before moving on — same pattern that worked for Session C.

---

## Out of scope for Phase 2.9

- New tools, new features, new data slices. That's Phase 3 and
  beyond. Phase 2.9 is presentation only.
- Auth, SSO, accounts — Phase 4.
- Mobile responsiveness — re-evaluate after a second tool exists.
- Animation and motion. The current site is intentionally static;
  Phase 2.9 keeps it that way unless the user requests otherwise.

---

## Phase 2.9 success criteria

When all sessions ship:

- A visitor lands on `/`, sees a grid of tools, picks one, and
  navigates to it.
- From any tool, the visitor can switch tools without going
  through `/`.
- The wormhole-sites card layout is unchanged from Phase 1 unless
  the user explicitly approved a change.
- Tones, typography, and chrome are shared primitives. Adding the
  Phase 3 industry helper is a content task, not a design task.
- A returning visitor with no context knows "this is LGI.tools and
  it has multiple tools" from the first screen.

---

## Known unknowns

- **Scope of "more information."** Is the ask about per-site
  detail (G4, G6), cross-site summary (G3), or both? Confirm
  before drafting Session M wireframes.
- **Nav style.** Top bar vs side rail vs command bar. User
  preference matters more than research here.
- **Phase 2.5 coordination.** If Phase 2.5 Sessions J/K/L slip
  into Phase 2.9, the implementation sessions absorb them. Either
  order works; user picks before Session M.
- **Visual references.** Are there other sites/tools the user
  wants the redesign to riff on? Phase 2.9 produces a more
  polished feel if there's a north star to point at.

---

## Phase 3 preview (informational, not Phase 2.9 scope)

Phase 3 ships the first **public industry helper** — manufacturing
profitability or similar. It consumes `eve-data` for recipes and
materials, `market-prices` for ISK, and renders inside the
Phase 2.9 envelope. Adding new SDE tables (blueprints, reactions)
happens here, extending the Phase 2 data slices without disturbing
the Phase 2.9 visual layer.
