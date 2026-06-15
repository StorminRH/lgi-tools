# Changelog

User-facing changes to LGI.tools, grouped by release and ship date. Each entry's
changes are tagged Added, Changed, Fixed, or Removed. Internal cleanup, CI, and
infrastructure work is intentionally excluded.

### v3.6.7 — 2026-06-15

#### Fixed
- Wormhole Sites filtering is now accessible to screen readers: each class, type, and view toggle reports whether it's selected, and the "N of M sites" count is announced as the list narrows.

#### Known limitations
- The Active jobs table doesn't yet show each job's facility, and the header slot counts show the slots currently in use (not in-use/total). Both are planned for a later update.

### v3.6.4 — 2026-06-14

#### Added
- Rebuilt the Industry Planner landing: a search prompt, your recent and favorite blueprints side by side, and a live table of your active industry jobs with progress bars and completion times.

#### Changed
- Refreshed the home page with a soft dot-lattice backdrop, a larger tagline, and a brighter Feedback button.
- Wormhole Sites filtering moved to a left rail — toggle any mix of classes and site types and the list narrows instantly, with a live match count.
- The Legal, Contact, and Changelog pages now match the rest of the site, and the Changelog is a version timeline grouped by change type.

#### Removed
- The Wormhole Sites page dropped its separate search box — use the new filter rail or global search (⌘K) instead.

### v3.6.3 — 2026-06-14

#### Added
- The planner now shows a Market Score (0–100) next to the margin — an at-a-glance read on how easily a blueprint's output will actually sell at the quantity you're building. Hover it for the full breakdown; it updates live as you change runs.
- New build-system picker: search any system that can host an industry job and optionally pin an NPC station, with an itemized fee breakdown in the cost ledger.
- New runs input: set how many runs to build and every figure — materials, output, fees, and margin — rescales live.

#### Changed
- Cleaned up the top navigation, and the price indicator is now a simple pulsing "prices live" light.
- Refreshed the site's look and readability: more contrast, a cleaner typeface, tighter tags and borders, and a clear keyboard-focus outline.
- The Market Score now flags stale data — if the most recent trade is over two weeks old, it shows how old the data is.
- The planner now shows take-home profit: pick a build system and the margin switches from gross (materials only) to net, subtracting EVE job fees and sell-side taxes.
- Net margin currently covers the final build job on manufacturing blueprints; reaction blueprints stay on gross margin for now.

### v3.4.10 — 2026-06-12

#### Added
- New Industry Jobs tool: signed-in pilots can watch the running jobs of every linked character in one place, with progress bars and completion countdowns that update live.

#### Changed
- Skill queues and industry jobs now stay live while a tracker page is open, refreshing on EVE's cache cadence and pausing when you switch away. Nothing syncs for characters nobody is watching.

#### Removed
- The tracker pages dropped their Sync now button — data refreshes itself — and now point pilots with no linked characters at the Characters page.

### v3.4.7 — 2026-06-11

#### Added
- New Skill Queues tool: signed-in pilots can see the live training queue for every linked character, with per-skill progress, completion times, and total skill points.

#### Changed
- Signing in with EVE asks you to re-authorize once more for the full set of character permissions the upcoming tools need. This is intended to be the last re-authorization.

### v3.4.2 — 2026-06-09

#### Added
- You can now link more than one EVE character. Open your portrait in the top bar to switch the active character, reconnect one that needs fresh access, or unlink one you no longer use.

#### Changed
- Signing in with EVE prompts you to re-authorize once for the extra character access — skills, skill queue, and industry jobs — that upcoming tools need.

### v3.3.10 — 2026-06-08

#### Changed
- Live Jita prices now roll digit by digit on an odometer when fresh data arrives, instead of fading in.
- The blueprint flow view now shows each item's in-game icon and groups tier columns into labelled sections by item type. Click a part again to step back out.
- Tool cards on the home page now glow green and drift gently on hover.

#### Fixed
- Build cost now reflects whole production runs — you can't run a fraction of a job — so totals match building from an empty hangar. Figures are higher than before, which had assumed partial runs were possible.

### v3.3.4 — 2026-06-04

#### Changed
- Search results now show the real in-game icon of the item each blueprint builds, instead of a flat "BP" label.
- Blueprint costs and material lists now come straight from CCP's current game data — most visibly, recent capital ship rebalances lower their material totals.

### v3.3.1 — 2026-06-03

#### Added
- The blueprint build plan now opens in a flow view: a row of tier columns grouped by build step, where clicking any buildable part zooms into just that part's chain. The earlier views are still a click away.

### v3.2.8 — 2026-06-02

#### Changed
- The Industry Planner now works on a phone — the build plan stacks instead of scrolling sideways, the cost ledger drops to one column, and rows and buttons are sized for tapping.
- The consolidated build view now shows every stage at once in a wrapping grid, and clicking a component highlights its whole production chain down to raw materials.

### v3.2.5 — 2026-06-01

#### Changed
- Wormhole ore and gas site values now refresh live the moment you open a site, shimmering while they update so a stale figure is never shown as fresh.
- Opening a blueprint now refreshes its market prices live, so the profit figures at the top are never stale.
- The build plan can now be viewed three ways: Consolidated (totals by stage), By branch (click-to-drill columns), and Raw ledger (raw materials by source).
- The Industry Planner home is now a dashboard — search any blueprint to plan its build and jump back to ones you recently viewed. The old profit-margin browse catalog was retired.

#### Fixed
- Pages no longer error on the first visit after the site has been idle — it now waits for the database to wake up and loads normally.

### v3.1.3 — 2026-05-31

#### Added
- The Industry Planner now opens on a browsable catalog: buildable items ranked by profit margin, with filters, sorting, and click-to-fan input columns. The open path lives in the address bar, so a drilled view is shareable.
- The blueprint page now leads with a profitability summary pinned to the top — product shot, margin and percentage, input cost, and Jita sell price — so "is this worth building?" is answerable the moment it loads.
- Every row in the build chain now carries its own price-confidence indicator; hover any of them to see why a price is trusted or shaky.
- Every priced material now shows a confidence indicator (fresh, stale, or missing), with a summary over the whole build so you can judge how far to trust the cost.
- The build plan is now an interactive column view: click any component to fan its inputs out beside it and walk the chain as deep as it goes. The drill path lives in the address bar, so a breakdown is shareable.

#### Changed
- The Industry Planner is now linked from the home page and top navigation, not just by direct link or search.
- Blueprints and materials in the planner now show their real in-game icons.
- The market-price pipeline is now monitored end to end, so fallbacks to the backup source and skipped refreshes get flagged and fixed faster.

### v3.0.10 — 2026-05-30

#### Added
- The Industry Planner is live: search any blueprint to see its full material tree next to a live Jita build cost and profit margin, with prices streaming in as the tree renders.

#### Changed
- The build plan now reads top-down from the item you're making down to raw materials, with each step labelled by its real in-game role.
- The material breakdown now lists each manufactured item once at the total the build needs, grouped by construction step. Tap any step to see what it's made from.
- Raw materials in the planner are now grouped by source — minerals, ice, gas, moon materials, salvage, and planetary — each with a subtotal.
- The wormhole sites page now shows its title, search, and filters right away while the list loads in.

#### Fixed
- The build cost is now correct for deep, multi-tier builds like Tech III cruisers, which had been badly overcounted. A Legion hull now comes out around 180M ISK instead of 650M.

#### Removed
- The pop-up resource preview on ore and gas site cards was removed; the same breakdown is still available by expanding the card.

### v3.0.4 — 2026-05-29

#### Added
- Added a Contact page (linked in the footer) with a form for bug reports, feature ideas, and data corrections. Your email is used only to reply and is never stored or shown publicly.

### v3.0.3.1 — 2026-05-27

#### Added
- Sharing a wormhole site link in Discord, Reddit, or a forum now produces a rich preview card with the site name, class, ISK value, and wave and scram counts.
- The site catalogue is now discoverable on Google via a published sitemap and robots file; admin and internal routes stay hidden from indexing.
- Anonymous page-performance metrics (Core Web Vitals) are now collected by Vercel Speed Insights to spot slow pages. Performance only — no behavioural tracking.

#### Changed
- Tightened the platform's security and added abuse protection ahead of upcoming features.
- The Legal page now lists two new things we record: the referring site's hostname and a random visitor ID in your browser. Still no IPs, user-agents, or third-party trackers.
- New tools can now be switched from "Coming Soon" to live without a code change.

### v2.9.7 — 2026-05-26

#### Added
- The wormhole sites page now has a sortable table view alongside the card grid — use the Cards / Table pill to switch, and click a row to expand it inline. Existing filters carry over.
- LGI.tools is now open-source under the MIT License, with the full source at github.com/StorminRH/lgi-tools. See the Legal page for details.

#### Changed
- Site search now matches initials and partial typos — "ffrd" finds "Forgotten Frontier Recursive Depot" — with the matched letters highlighted in green.
- Gas sites now show the wormhole class range they actually spawn in, and the class filter respects those ranges.
- The "killing wave" callout on combat sites now reads "blue loot," the actual EVE term for Sleeper killing-wave loot.
- The site now scales down cleanly on smaller windows: the navigation collapses progressively and the sites grid drops to a single column on narrow screens.
- Market prices now refresh automatically once a day in the background, and the header price chip is a passive indicator — hover it to see time until the next refresh.

### v2.9.5 — 2026-05-25

#### Added
- Added a global search bar — press ⌘K (or Ctrl-K) from any page to navigate across sites, tools, and commands.
- Recently-viewed sites now appear in the search dropdown when you focus the empty input.
- Hovering an ore or gas site card now previews its top three resources by ISK and the site total. Combat, relic, and data cards stay static.
- A persistent tool strip now sits in the header, so you can jump between tools without going through the landing page.
- The Feedback button now works on any page — your message goes straight to the developer, with your character name included if you're logged in.
- Added a Legal page (linked in the footer) describing what the site records and the EVE Online third-party developer notice.
- Added a BETA banner at the top of the changelog so first-time visitors know what to expect.
- Missing pages and crashes now render polite EVE-themed pages instead of bare stack traces.
- Added a terminal-style search to the wormhole sites browser — type filters like `c5/relic` or `ore` to jump to a slice of the catalogue.
- Added a global footer with the current version, a changelog link, and a feedback affordance.
- Added this changelog page.
- Added EVE SSO sign-in — click "Log in with EVE" in the header to authenticate.
- Admins can now see usage metrics on the dashboard and open a printable usage report with date-range controls.

#### Changed
- The market-price freshness indicator moved to the top navigation bar; click it to refresh prices from any page once the 24h cache has elapsed.
- Type sizes across the site were bumped slightly for readability.
- The wormhole sites page now uses a two-column card layout with more breathing room per site.
- The site detail page now shows the source tab and last price-refresh time above the card and uses the full page width.
- The landing page now shows the full LGI.tools lineup — Wormhole Sites live, Industry Planner and Wormhole Roll Calculator marked Coming Soon.
- The landing hero now reads "Lo-Gang Industries.tools" in a sharper typeface that pairs with the LGI.tools wordmark.
- Brightened secondary text in footers, captions, and chrome for readability.
- Every link now glows green on hover.
- The LGI.tools wordmark now sits top-left on every page and clicks back to the landing.

### v2.9.3 — 2026-05-24

#### Changed
- Wormhole site combat numbers (DPS, EHP, EWAR) are now computed live from EVE SDE data instead of baked snapshots, so upstream changes are caught immediately.

### v2.9.1 — 2026-05-23

#### Added
- Added the wormhole sites browser: browse every site with filters by class and type, and expand any site for waves, NPCs, EWAR, and resource values.
- Site detail URLs are now shareable — click any site card and the URL updates to `/sites/<id>`.

#### Changed
- Wormhole site resource values now overlay live Jita prices, refreshed from the button at the bottom of the page (24h cache).
- Combat and hack sites now show killing-wave ISK as their primary value.
