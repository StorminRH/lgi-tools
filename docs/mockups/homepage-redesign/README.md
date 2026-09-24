# Homepage redesign — three directions

Static HTML mocks that carry Atlas's visual language (glass map chrome, the
circular-reveal portrait menu, breathing nodes, flowing chain edges) out to
the homepage. All three reuse the production tokens from
`src/app/globals.css` (surfaces, ISK green, EVE blue, WH class ramp, the
Geist / JetBrains Mono / Barlow Condensed roster) and the existing nebula
backdrop. Numbers and pilots are sample data.

Open any `.html` file in a browser to see the motion. Screenshots freeze it.
To re-shoot them, run
`PLAYWRIGHT_PATH=$(npm root -g)/playwright node docs/mockups/homepage-redesign/shoot.mjs`.

## A — Orbit (cinematic landing)

![Orbit, desktop](screenshots/a-orbit.jpg)

- A **floating glass nav pill**, detached from the edges, with a sliding
  active indicator. It holds the ⌘K search, the TQ player count and a solid
  "Log in with EVE" CTA.
- **Hero:** the wordmark sits inside slowly counter-rotating orbit rings, with
  "systems" in WH-class colours riding them. The brackets glow in and out,
  and the nebula drifts (Ken Burns style).
- **Search moves into the hero** as the main call to action, with quick-jump
  chips below it.
- The **live-data ribbon** is one glass strip instead of a 2×2 card.
- **Tool cards get live previews:** ticking site values, a margin chart that
  draws itself in, and a breathing mini-chain. On hover a conic light runs
  around the card edge (shown on the Sites card).

Mobile: [a-orbit-mobile.jpg](screenshots/a-orbit-mobile.jpg)

## B — Chain (the homepage *is* an Atlas canvas)

![Chain, desktop](screenshots/b-chain.jpg)
![Chain, portrait menu open](screenshots/b-chain-menu-open.jpg)

- A full-bleed map canvas with the dotted grid slowly panning and a fog
  vignette. Each section of the site is a **system** linked to the `[LGI]`
  home node by flowing edges, coloured the way Atlas colours wormhole mass
  and lifetime.
- **Selecting a node** opens a glass inspector with a live preview and a
  "Jump →" CTA.
- The chrome copies `MapChrome`: brand and TQ chip at top left, search pill
  at top centre, and the portrait menu at top right. The menu uses the same
  circular clip-path reveal, extended with a pilot list and keyboard
  go-to shortcuts.
- **Docks:** live data plus a sparkline at bottom left, news at bottom right,
  and a hint bar at bottom centre.
- On mobile the canvas crops to the home node, and a glass bottom sheet
  carries search and the tool list.

Mobile: [b-chain-mobile.jpg](screenshots/b-chain-mobile.jpg)

> Trade-off: this is the boldest option, but the homepage's SEO copy would
> need a server-rendered text fallback (visually hidden, or an
> "About" sheet).

## C — Command Deck (signed-in bento)

![Command Deck, desktop](screenshots/c-deck.jpg)

- A **floating glass side rail** with a glowing active marker and glass
  tooltips. On mobile it becomes a floating bottom tab bar.
- A **personal greeting** in an animated gradient, over a slow aurora blob
  behind the header.
- **Bento tiles**, each with a cursor-follow spotlight:
  - pilots with shimmering skill bars, and a ring on the pilot being tracked
  - industry jobs on the EVE-blue progress bars
  - the best margin, with a sparkline that draws itself in
  - top sites, with a segmented switcher
  - an embedded Atlas chain preview with glass overlays
  - the stats strip
  - a news marquee
- The guest view would show the same grid with the Pilots tile swapped for
  the sign-in pitch.

Mobile: [c-deck-mobile.jpg](screenshots/c-deck-mobile.jpg)

## Shared primitives these would introduce

| Primitive | What it is |
|---|---|
| `glass-hi` | `glass-panel` plus a lit top edge, an inner sheen and a soft drop shadow. It reads as floating rather than flat frost. |
| `rise` + `d1…d6` | Staggered entrance: fade, 14px lift and blur-to-sharp on the `--ease-panel` curve. |
| Live dot | The existing status dot plus a radar ping ring. |
| Conic edge | A hover-only rotating light on the card border, using `@property --a`. |
| Flow edge | Atlas's dashed edge animation, reused for decoration. |

All motion sits behind `prefers-reduced-motion`, like the existing
`hover-bob` and map motion contract.
