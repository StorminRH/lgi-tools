# VERSION 4.1 PLAN — What is on the chain

4.1 is a density-and-polish increment on shipped Atlas. The loop stays the
same: open a map, paste, jump, click a system. People see more of what is
already scanned and already in universe data.

`plan-version` groups this file into session contracts. Goals, outcomes,
invariants, and decisions below are fixed. The Status headings are
provisional until that grouping is approved.

**DONE for the version =** a corp watching a live chain can see which systems
hold harvestables, hacking, or combat, read identified site totals on the
system card, read statics under the system name, see a friendly's ship, and
read region plus closest trade hub on a mapped k-space exit — and a node
that has been drawn does not change seat.

## What this is

Atlas already draws a chain. A node is a name, a class or security chip, and
a presence badge. The click card and the current-system dock share one thin
body: raw signature counts and friendlies. Stubs are fake layout ids in the
same compass pass as the chain; paste renumbers them and resolve inserts the
real system as a new child, so seats jump.

4.1 fills those surfaces and stops the jump. It does not teach a second way
to use Atlas. It does not add live kill, occupancy, or intel feeds.

**What 4.1 is not:** a new inspector, a hub line, a route planner, notes,
alerts, a roll-calculator host, or a restore of unlock-to-drag.

## Status

> Provisional delivery topology. Two player-named features. `plan-version`
> may merge or rename the rows; it may not drop an outcome from this file.

| Sub-version | Theme | Covers | Sessions | Status |
|---|---|---|---|---|
| 4.1.1 | Seats stay put | §4.1.1 | 1 | READY |
| 4.1.2 | What is on the system | §4.1.2 | 1 | READY |

## Still true

These are not 4.1 inventions. They stay binding.

- Shared facts sync. Layout and motion stay local. Positions are not written
  to Convex.
- Compass-tree layout stays deterministic: same graph and same seats produce
  the same picture on every client.
- The mapper is the host layer. Features do not import it. Disc glance marks
  in this version are mapper chrome in the existing node widget slot, not new
  `src/features/*/widget.tsx` hosts. The sites card stays the scanner's D15
  widget. The system card does not open it.
- Chain documents stay in Convex. Map metadata and access stay in Neon.
- Clean-room: solve the same problems other mappers solve; do not copy their
  chrome, flows, or schemas.
- Desktop-first.
- Universe reference data is a controlled copy. 4.1 may ship more of what is
  already ingested (region on the system directory, type names for ships,
  gate adjacency for hub jumps). It does not add a new live feed.

## Standing decisions

- **D1 — Same loop.** Paste, jump, click, share, and scan the way 4.0 works.
  New facts land on the node, the shared intel body, or both.
- **D2 — Lock-on-draw.** The first time a node is painted, that is its seat.
  Authored systems, scanned stubs, static ghosts, and a stub that becomes
  real keep those coordinates. A later paste does not move anything already
  on screen. First paint may place a new node. Camera follow moves the view,
  not the seats.
- **D3 — No hand placement.** Unlock-to-drag and the Auto layout control
  (`atlas.autoLayout`) go away. If a first-paint seat overlaps, it stays.
  There is no hand fix.
- **D4 — Identified only.** Disc widgets and the intel card show a signature
  only when it has an identified group: Gas Site, Ore Site, Data Site, Relic
  Site, or Combat Site. Unknown and unidentified rows stay in the scanner.
- **D5 — Three glance buckets.** Harvestables (gas + ore), Hacking (relic +
  data), Combat. Icon only. A widget lights when that system has at least
  one identified row in that bucket. Empty buckets omit.
- **D6 — One intel body.** The click card and the current-system dock render
  the same body. Statics sit directly under the title on wormhole systems.
  Category blocks start collapsed: header is count and total ISK; expand to
  names only. Friendlies show ship name beside the pilot.
- **D7 — K-space title text.** A mapped k-space exit (classification is
  security, not wormhole class) may use a taller frame. Text above the disc:
  name, region, closest of Jita / Amarr / Dodixie / Rens / Hek with gate-jump
  count. Security stays in the disc. The card lists all five hubs, closest
  first. No hub line. No hub widget.
- **D8 — Already-held data.** Site values are the figures the scanner
  already shows. Hub jumps walk the existing stargate adjacency graph.
  Region and ship names come from already-ingested universe tables; ship a
  client lookup if Atlas does not already have one.
- **D9 — Native chrome.** Fit existing primitives, or create or expand one.
  No separate restyle pass.

## Trade hubs

Closest-hub text and the card list use these five systems, gate jumps only:

| Hub | System id |
|---|---|
| Jita | 30000142 |
| Amarr | 30002187 |
| Dodixie | 30002659 |
| Rens | 30002510 |
| Hek | 30002053 |

## Gates (every sub-version)

- Local suite green before a land on `development`.
- Fallow zones stay deny-by-default. No new cross-layer exceptions.
- Atlas connection language stays the glossary in
  `src/data/maps/connection-door-types.ts`.
- Each landed sub-version bumps `APP_VERSION` and writes
  `content/changelog/v4.1.md` (create the file on the first bump).
- `UX gate: Yes` sessions run `ux-check` once there is something to look at.
- Promote at 80 app-facing files versus `staging`. The last session of the
  version archives this plan after any due promote.

## 4.1.1 — Seats stay put

**Objective.** Once a node is drawn, it keeps that seat. Identify and resolve
do not move it. Unlock, drag, and Auto layout are gone.

**UX gate:** Yes.

**Done means.**

- A scanned stub's first seat is the seat it keeps until it dies or becomes
  the real system.
- Becoming real is an identity swap on those coordinates. The real system
  does not take a new compass child slot.
- Static ghosts follow the same lock.
- Pasting another wormhole does not move authored systems or already-seated
  stubs or ghosts.
- The Auto layout setting and the unlock-to-drag path are gone from Atlas
  settings and from the canvas. Camera follow and click-focus stay.

**In scope.**

- Stub layout identity (today: sequential negative ids fed through the
  compass kernel, renumbered on paste).
- Resolve / identify keeping the drawn seat.
- Removal of `atlas.autoLayout` and local drag / re-lock snap.
- Layout tests that prove already-drawn nodes do not move when a sibling
  appears or a stub becomes real.

**Out of scope.**

- Widgets, intel card copy, k-space title text, hub math.
- A new layout philosophy. Compass-tree stays. This slice stops the mover.
- Re-adding hand placement.

**Hard constraints.**

- Positions stay local and unsynced.
- First paint may place. After that, nothing already on screen moves.
- Overlap after first paint is accepted.

**Dependencies.**

- Shipped Atlas compass + stub layout (`src/mapper/layout/`,
  `src/mapper/chain/stub-layout.ts`).

**Decisions the session plan must resolve.**

- How a stub's first seat is remembered across paste, static accounting, and
  resolve without re-feeding a new layout id that changes the picture.
- What leftover Auto layout preference rows do when the control is deleted.

**Baseline.** `src/mapper/layout/` and `src/mapper/chain/` are the hotspots.
Stub fingerprint already re-posts layout on paste and resolve; that path is
the work.

**Delivery evidence.** Layout proofs that a drawn node keeps its coordinates
through paste and resolve. Settings no longer expose Auto layout. A visual
look on a paste-then-identify chain.

## 4.1.2 — What is on the system

**Objective.** The chain shows where identified content is. The shared intel
body shows statics, identified site totals, and ship names. A mapped k-space
exit shows region and closest trade hub.

**UX gate:** Yes.

**Done means.**

- Three disc icons: Harvestables, Hacking, Combat. Icon only. Lit only for
  identified rows in that bucket. Unknowns light nothing.
- Click card and current-system dock stay one body.
- Under the title on a wormhole system: each static as type code plus
  leads-to class (`C247` and its class). K-space cards omit that list.
- Each present identified category is a collapsed block: `Combat ×3` and
  the total ISK the scanner already has for those rows. Expand to site
  names. The list does not open the sites card.
- Friendlies show the ship name next to the pilot.
- Mapped k-space exits (security in the disc) may use a taller frame. Title
  text above the disc: name, region, closest hub and jump count
  (`Jita 5`). The card lists all five hubs, closest first. Gate-graph
  pathfinding only. No line to the hub.

**In scope.**

- Node widget slot (`data-chain-node-widgets`) for the three marks.
  Presence stays.
- Shared intel body: statics, category blocks, friendlies with ship,
  k-space hub list.
- K-space node chrome and frame size.
- Client readouts for region and ship type name from already-ingested
  data.
- Closest-hub and five-hub distances from the existing adjacency graph.

**Out of scope.**

- Unknown or unidentified rows on the disc or this card.
- Opening the sites card from the intel list. Scanner still hosts it.
- Hub connection lines, route halo, waypoints, search bubble.
- Killmails, ESI kills/jumps/sov, occupancy, notes, alerts.
- A wormhole widget. Holes stay stubs and lines.
- Changing paste, jump, or scanner identify.

**Hard constraints.**

- D4–D9.
- ISK sums only rows that already have a figure. A named combat site
  without a number still counts in `Combat ×N` and shows no ISK.
- Extra title lines only on mapped systems whose chip is security
  (HS / LS / NS), not C1–C6, Thera, Drifter, or Pochven.
- Widgets are mapper chrome, not new feature-slice widget hosts.

**Dependencies.**

- 4.1.1 has landed. Widgets and taller k-space frames sit on seats that
  no longer jump.
- Scanner grouping and site values already on the map
  (`scannerSectionForGroup`, harvestable live Jita, combat blue loot).
- Statics slots already used for ghosts (`useSystemStaticSlots`).
- `shipTypeId` already on presence.
- Adjacency asset already used for off-map pilot arrows.

**Decisions the session plan must resolve.**

- How region is added to the system directory client asset without a new
  feed.
- How ship type id becomes a name on the intel body.
- Icon marks for the three buckets that read at Atlas zoom on a 55px disc.
- K-space frame size that fits name, region, and closest-hub text without
  covering the disc chip.

**Baseline.** `SystemNode`, `SystemIntelligenceBody`, presence, scanner
counts, and universe-asset loaders. Do not grow a second inspector.

**Delivery evidence.** Visual look on a mixed chain: wormhole systems with
identified gas and combat, a mapped k-space exit, the dock matching the
click card, unknowns present in the scanner and absent from disc and card.

## Cleanup this version owns

- Delete the Auto layout control and the unlock-to-drag path. Do not leave
  a hidden dial that restores them.
- Do not leave a second intel body for the dock.

## Out of this version

Leftover Atlas tickets ride only when they fall out of the slices above.
They are not the version. Connection editor, current-system window
retarget, k-space familiar layout, month-long event log, ChainHost split,
and live intel feeds stay out.

## Close

The last Ordered work step of the last session archives this plan after any
due promote. Next Start Session then waits on product direction for the
next master plan.
