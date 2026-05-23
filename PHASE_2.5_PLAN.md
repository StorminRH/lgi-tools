# LGI.tools — Phase 2.5 Plan

## What this is

Phase 2 shipped the shared data plumbing — SDE, market prices, live
ISK on wormhole site cards, a user-driven refresh button with a 24h
cache. Along the way it accumulated a punch-list of known small
issues. Phase 2.5 is the cleanup pass: close out the rough edges
before Phase 3 (industry helper) adds a new public tool on top.

These are not feature changes. They are correctness, consistency, and
ergonomics fixes that erode trust if left to compound. None of them
are urgent on their own. As a batch, they remove the "you should
know" caveats from the wormhole-sites feature so Phase 3 starts on
solid ground.

---

## How to use this document

Same shape as `PHASE_2_PLAN.md`: session descriptions are
deliberately non-prescriptive. Before any session, read
[CLAUDE.md](CLAUDE.md), [AGENTS.md](AGENTS.md), and
[SCRATCHPAD.md](SCRATCHPAD.md). Then read the session below and form
your own plan. Confirm with the user before committing to one.

Sessions are small. Many can be completed in under an hour. They are
independent — pick whichever the user wants to land first.

---

## Decisions already made

- **No new schema columns.** Any data-layout change becomes its own
  Phase 3 item. Phase 2.5 works within the existing tables.
- **No visual overhaul work here.** Layout, navigation, and density
  changes belong in Phase 2.9.
- **No new features.** New routes, new data slices, and new APIs are
  Phase 3 and beyond.
- **Pixel parity rule from Phase 1 still holds.** UI text and
  ordering may change to surface previously hidden information, but
  cards keep their layout/typography contract.

---

## Sessions

### Session E — Relic and data sites render killing-wave ISK as the primary value  ✅ SHIPPED

**Status.** Shipped 2026-05-23 in commit `d1bfcd3`.

**Original framing.** Parse per-container loot for relic/data sites from
the Sheet, or document why it can't be parsed.

**Actual resolution.** The DB confirmed every relic/data site has a
killing-wave ISK and zero container-loot rows. The Sheet doesn't
publish container loot for these sites. Rather than display `—` for
the primary value and demote the only available ISK to a secondary
`+ X killing wave` sub-line, the card now treats relic/data the same
way it treats combat anomalies: primary ISK = `blueLootIsk`, waves
render inline beneath the EWAR row.

**What changed.** Single derived flag in `SiteCard.tsx`:
`isWaveDriven = isCombat || isHackSite`. Substituted in four places
(primary ISK, sub-line, inline wave block, "Wave Spawns" guard). The
unreachable "hacking only" empty-state branch collapsed with it.

---

### Session F — `triggerLabel` rendering collapses every variant to "TRIGGER"

**Goal.** Sleeper rows display the Sheet's actual trigger label
("Opt", "DTA", "1st Death Trigger", "Opt?", "Trigger on Attack")
rather than the catch-all "TRIGGER".

**Problem.** The data is in the DB (`npcs.trigger_label`) but the
component flattens all non-null values to one display string. Players
who use the Sheet today rely on distinguishing optional triggers from
hard triggers from on-attack triggers.

**Scope decision.** Render the Sheet label verbatim. No canonical
shorthand map up-front — the Sheet's labels are already short. If a
specific label overflows the layout we add a shorthand for that label
only, on demand.

**Constraints.** Keep the WAVE-card layout intact. The label is a
small inline annotation, not a new column.

**Verification.** A wave that mixes "Trigger" and "Opt" NPCs shows
both labels distinctly. Cards that previously showed "TRIGGER" now
show the underlying value verbatim.

---

### Session G — `/api/sites` list endpoint serves Sheet ISK while `/api/sites/[id]` serves live

**Goal.** Make the list endpoint's ISK source unambiguous on the wire
so a future external consumer can't mistake Sheet values for live ones.

**Problem.** `/api/sites` (list) returns `resourceValueIsk` straight
from the Sheet because it never fetches per-resource rows.
`/api/sites/[id]` (detail) returns the live-overlay value under the
same field name. Currently nothing internal reads the list endpoint
(`/sites` calls `listSiteDetails` directly, server-side), so the
divergence bites no one today — but the naming collision is a
footgun for future us.

**Scope decision.** Rename the list endpoint's field from
`resourceValueIsk` to `sheetResourceValueIsk`. Two-line change in
`queries.ts` (the `listSites` projection) and `route.ts` (the API
shape). No new compute, no duplicate code path, no overlay added to
the list. The detail endpoint's `effectiveIsk` already announces
itself as live.

**Verification.** `curl /api/sites | jq '.[0]'` returns
`sheetResourceValueIsk`, not `resourceValueIsk`. The detail endpoint
is unchanged. No internal callers break (none read this field).

---

### ~~Session H — Ingest tripwire for alias-map drift~~  → moved to Phase 2.6

**Status.** Dropped from Phase 2.5. The underlying concern (the
Sheet's two known typos drifting) is part of a larger architectural
question the user surfaced mid-session: **the Sheet is not actually
meant to be the long-term source of truth**. It was used as the
initial data baseline for the wormhole-sites feature, but the
intention was always to take ownership of the data in the local DB.

That conversation generated **Phase 2.6**, a single-item phase that
covers:

- Pulling every Sheet tab worth keeping (including ones skipped in
  Phase 1) so nothing useful is lost.
- Understanding the Sheet's full structure so it can be recreated
  in-DB later.
- Decoupling routine ingest from the Sheet — make `pnpm db:ingest`
  a one-time / opt-in re-seed, not a routine pull that wipes local
  edits.
- Fixing the two typos (`luminous kermite`, `vivid hemorite`)
  directly in the DB and removing those entries from the alias map.

See [PHASE_2.6_PLAN.md](PHASE_2.6_PLAN.md) for the full brief.

---

### Session I — `db:ingest-sde` preemptive clean-exit

**Goal.** Apply the established clean-exit pattern (`await client.end();
process.exit(0)`) from `src/db/refresh-prices.ts` to
`src/db/ingest-sde.ts`. This is the **SDE** ingest (Eve static data
from Fuzzwork) — a legitimate ongoing pull, separate from the Sheet
ingest covered by Phase 2.6.

**Why this exists.** Node-with-Postgres scripts hold a TCP connection
open via keepalive; without explicit shutdown, the event loop never
empties and the process hangs at the end. `refresh-prices.ts` already
fixed this; `ingest-sde.ts` is the same shape and hasn't hit the bug
yet — preempting it.

**Constraints.** Three-line copy-paste. No behavior change in the
happy path.

**Verification.** `pnpm db:ingest:sde` exits cleanly; no lingering
process. `pnpm db:ingest:sde:prod` likewise.

---

### ~~Session J — Sortable list view~~  → deferred to Phase 2.9

**Status.** Deferred to the Phase 2.9 visual overhaul. A sortable
table view is a real ergonomics win for "which site has the highest
ISK in C5?" — but it conflicts with the broader information-density
question Phase 2.9 will answer. Better to design the table view
within that pass than to retrofit it.

---

### ~~Session K — Search-by-name on `/sites`~~  → deferred to Phase 2.9

**Status.** Deferred to the Phase 2.9 visual overhaul. Same reason
as J — search UX should be designed inside the overall layout pass.

---

### Session L — `/sites/[id]` deep-link route

**Goal.** A shareable URL for one specific site that doesn't break
the inline browsing flow.

**Three pieces in this session:**

1. **The route itself.** `/sites/123` renders one site card fully
   expanded on its own page. Re-uses the existing `getSiteDetail`
   query and the inline `SiteCard` renderer so the layout contract
   carries over.
2. **"← Return to full list" link** at the top-left of `/sites/123`
   only. Does not appear on `/sites` itself (no destination to go
   back to from the list).
3. **Silent URL sync on `/sites`.** Clicking a card on `/sites`
   updates the URL to `/sites/123` via `history.replaceState`
   without navigating — the list stays visible, the card expands
   inline as it does today. Clicking the same card again (collapse)
   reverts the URL to `/sites`. A direct visit to `/sites/123` still
   hits the server route from piece 1.

**JS dependency note.** Piece 3 requires a small client component on
the cards. This intentionally breaks the existing "Collapsible is a
pure `<details>`/`<summary>` — no 'use client'" invariant from Phase 1.
That invariant was a performance/taste choice for the initial build,
not a project-wide law; adding a few KB of JS to enable URL sync is
an acceptable trade. SCRATCHPAD's invariants list should be updated
when this lands.

**Verification.** `/sites/123` (a real ID) renders one card fully
expanded with the back link visible. `/sites/999999` returns a clean
404. On `/sites`, clicking a card updates the URL bar to
`/sites/<that-id>` without re-rendering the list; clicking the same
card to collapse reverts it. Browser back/forward behave sensibly.

---

## Out of scope for Phase 2.5

- Visual overhaul, navigation chrome, multi-tool landing page —
  Phase 2.9 (now includes deferred Sessions J and K).
- Sheet ownership and decoupling — Phase 2.6.
- New tools, new data slices, new auth — Phase 3+.
- Per-wave EWAR row rendering (mentioned in older SCRATCHPAD).
  Decide during Phase 2.9 whether it stays a card concern or
  belongs to the new visual pass.
- Filter-click latency optimization (~100–300ms on Neon) — fine for
  69 cards. Revisit if dataset grows.

---

## Phase 2.5 success criteria

When all remaining sessions ship:

- Relic and data cards render killing-wave ISK as their primary value
  (Session E — done).
- Trigger annotations carry the Sheet's actual label verbatim
  (Session F).
- The list endpoint's ISK field is unambiguously labeled as Sheet-sourced
  (Session G).
- `pnpm db:ingest:sde` exits cleanly with the established pattern
  (Session I).
- `/sites/123` is a shareable URL, with inline URL syncing on card
  clicks (Session L).

What's *not* a Phase 2.5 success criterion anymore:

- The "Ingest catches alias-map drift on its own" line from the
  original spec — moved to Phase 2.6 alongside the broader Sheet
  decoupling.
- Sortable list / search — moved to Phase 2.9.

---

## Order of operations

No session blocks any other. Recommended order — finish the data
correctness fixes first, then the API hygiene rename, then the
deep-link UX work:

1. F (trigger labels)
2. G (list field rename)
3. I (clean-exit pattern)
4. L (deep-link route + URL sync)

E shipped first because the user picked it as the entry into
Phase 2.5.
