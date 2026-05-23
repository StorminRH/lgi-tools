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

### Session E — Relic + data sites carry no container loot

**Goal.** Cards for relic and data sites display per-container
resource rows the same way ore and gas sites already do — not just
the "+killing wave" blue-loot value with a `—` primary ISK.

**Problem.** The Sheet's relic/data tabs structure container loot
differently from the ore/gas tabs, and `sheet-parser.ts` doesn't
extract it. End result: 24 relic+data cards show empty resource
sections. The blue-loot "killing wave" number alone underrepresents
each site's value.

**Investigation needed.** Read a few relic/data tabs in the Sheet
directly to confirm container loot is even published there. If it's
not, the cleanup is documenting that fact on the card (a "loot
varies per can" note) rather than parsing nothing.

**Out of scope.** Container hacking difficulty, can spawn counts,
loot-table simulation — those are tooling, not data fixes.

**Verification.** A relic and a data site each show at least one
resource row, OR each shows a clear "loot varies per can" message
where today they show a blank section.

**Known unknowns.** Whether the Sheet even contains the data. Inspect
first; revise the plan if it doesn't.

---

### Session F — `triggerLabel` rendering collapses every variant to "TRIGGER"

**Goal.** Sleeper rows display the Sheet's actual trigger label
("Opt", "DTA", "1st Death Trigger", "Opt?", "Trigger on Attack")
rather than the catch-all "TRIGGER".

**Problem.** The data is in the DB (`npcs.trigger_label`) but the
component flattens all non-null values to one display string. Players
who use the Sheet today rely on distinguishing optional triggers from
hard triggers from on-attack triggers.

**Constraints.** Keep the WAVE-card layout intact. The label is a
small inline annotation, not a new column.

**Verification.** A wave that mixes "Trigger" and "Opt" NPCs shows
the two labels distinctly. Cards that previously showed "TRIGGER"
now reflect the underlying value verbatim (or a short canonical
shorthand mapping if the long phrases overflow the layout).

---

### Session G — `/api/sites` list endpoint serves Sheet ISK while `/api/sites/[id]` serves live

**Goal.** Either both endpoints apply `overlayLivePrices`, or the
list endpoint explicitly documents the difference. Today the
inconsistency is invisible to consumers and dangerous to assume away.

**Problem.** `/api/sites` (list) returns `resourceValueIsk` from the
Sheet because it never fetches resources. `/api/sites/[id]` (detail)
returns live values. The list aggregate is silently wrong if any
consumer reads it for totals.

**Approach options.**
1. Make the list endpoint also call a cheap live-aggregate path —
   sum `effectiveIsk` across resources without returning the full
   resource list.
2. Document the divergence in the API docs and rename the list
   field to `sheetResourceValueIsk` so the source is explicit.

User picks at session start.

**Verification.** Pull both endpoints; aggregate field reads the
same source-of-truth in both, OR the field names make the
divergence unambiguous.

---

### Session H — Ingest tripwire for alias-map drift

**Goal.** `pnpm db:ingest` warns loudly when the count of
`resourcesWithoutTypeId` increases between runs — or when an alias
key in `resource-aliases.ts` produces zero matches against the SDE.

**Problem.** The alias map encodes two Sheet typos verbatim
(`luminous kermite` → Kernite, `vivid hemorite` → Hemorphite). If
the Sheet ever corrects those typos, the broken keys silently start
resolving to NULL and the rows fall back to Sheet values — invisibly
losing live prices.

**Approach.** Compare ingest-time `resourcesWithoutTypeId` against
the previous run's value (stored in a small metadata table or in a
file under `.next/cache/`). Emit a clear warning when the count
increases, and a separate warning when a key in the alias map
matched zero Sheet rows during ingest (likely fixed-typo case).

**Constraints.** No new external dependency. This is observability,
not validation — ingest still succeeds either way.

**Verification.** Manually rename one alias key to an unused string,
re-run ingest, see the warning fire. Restore. Backdate the previous
run, increase the no-typeId count by removing a real alias entry,
re-run, see the count-increase warning fire.

---

### Session I — `db:ingest-sde` preemptive `process.exit(0)`

**Goal.** Apply the explicit `await client.end(); process.exit(0)`
pattern (from `src/db/refresh-prices.ts`) to `src/db/ingest-sde.ts`
before it ever exhibits the tsx+postgres hang documented in
Session B.

**Constraints.** Trivial code change, no behavior change in the
happy path.

**Verification.** Re-run `pnpm db:ingest:sde` locally; confirm clean
exit and no lingering process. Production variant
`pnpm db:ingest:sde:prod` likewise.

---

### Session J — Sortable list view as a complement to the card grid

**Goal.** `/sites` offers a toggle (or a sibling route) showing the
same dataset as a sortable table — name, type, class, primary ISK,
killing-wave ISK. Cards stay as the default; the table answers
"which is the highest-value combat site in C5?" without manual
scanning.

**Constraints.** Reuse the existing `listSiteDetails` + overlay
pipeline. No new schema. No new data fetches per row.

**Out of scope.** Search-by-name (Session K). Filters on the table
beyond what the card view already has.

**Verification.** Click column headers to sort by ISK; values match
the cards exactly. Sort is purely client-side (no extra requests).

---

### Session K — Search-by-name on `/sites`

**Goal.** Type a partial name, see matching sites highlighted in
place. Works alongside the existing type/class filters.

**Constraints.** Client-side filter on the rendered card list — no
new query, no new param round-trip. Existing filters stay
URL-driven; search is ephemeral (not in the URL) unless trivially
addable.

**Verification.** Type "Frontier" and only Frontier* cards stay
visible. Clear the search field and the full list returns. Existing
type/class filters compose with search correctly.

---

### Session L — `/sites/[id]` deep-link route

**Goal.** A shareable URL for one specific site — opens to that
card pre-expanded, no filter chrome needed.

**Problem.** Today every card is inline-only. Sharing a link to
"that one Bistot anomaly in C5" requires sending a screenshot.

**Constraints.** Same renderer as the inline card so the layout
contract carries over. The `getSiteDetail` query already exists;
this is purely a routing + layout shell job.

**Verification.** `/sites/123` (a real ID) renders one card fully
expanded. `/sites/999999` returns a clean 404. The card on
`/sites/[id]` matches what the same card looks like inline on
`/sites`.

---

## Out of scope for Phase 2.5

- Visual overhaul, navigation chrome, multi-tool landing page —
  Phase 2.9.
- New tools, new data slices, new auth — Phase 3+.
- Per-wave EWAR row rendering (mentioned in older SCRATCHPAD).
  Decide during Phase 2.9 whether it stays a card concern or
  belongs to the new visual pass.
- Filter-click latency optimization (~100–300ms on Neon) — fine for
  69 cards. Revisit if dataset grows.

---

## Phase 2.5 success criteria

When all sessions ship:

- No "you should know" caveats remain on the wormhole-sites cards.
- Relic and data sites display their loot or explicitly explain
  why they can't.
- Trigger annotations are useful, not flattened.
- Both API endpoints either agree on ISK source or label the
  difference explicitly.
- Ingest catches alias-map drift on its own.
- `/sites/[id]` exists and works.
- The codebase no longer carries known-but-deferred issues that
  newcomers must be briefed on.

---

## Known unknowns

- **Order of operations.** No session blocks any other. The user
  picks priority. Recommendation: data correctness first (E, F),
  then API consistency (G), then ingest tripwires (H, I), then
  ergonomics (J, K, L).
- **Sheet structure for relic/data loot.** Investigate Session E
  before committing to "we parse this" vs. "we explain this is
  unparseable."
- **Search/sort UX.** Could conflict with Phase 2.9's information-
  density goals. Coordinate with the user before locking either
  Session J or K's implementation.
