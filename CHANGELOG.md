# Changelog

User-facing changes to LGI.tools, grouped by ship date. Internal cleanup,
CI, and infrastructure work is intentionally excluded — see the SCRATCHPAD
for the full forensic record.

### 2026-06-11

- New Skill Queues tool: signed-in pilots can now see the live training queue for every linked character in one place, with per-skill progress, completion times, and total skill points. Queues refresh from EVE when you open the page and update live without reloading.
- Signing in with EVE now asks you to re-authorize one more time, granting the full set of character permissions — planetary colonies, standings, implants, clones, location, and current ship, alongside the existing skills and industry access — that the upcoming character tools build on. This is intended to be the last re-authorization.

### 2026-06-09

- You can now link more than one EVE character to your account. Open your portrait in the top bar to see all your characters, choose which one the site treats as active, reconnect a character that needs fresh access, or unlink one you no longer use.
- Signing in with EVE now prompts you to re-authorize once, granting the additional character access — skills, skill queue, and industry jobs — that upcoming tools build on.

### 2026-06-08

- Live Jita prices now land on a rolling odometer. When fresh market data arrives, each ISK figure — the sites' resource values and totals, and the planner's cost and margin — rolls digit by digit to its new value instead of fading in.
- The blueprint flow view now shows each item's in-game icon, and groups every tier column into labelled sections by item type — minerals, reactions, fuel blocks, commodities, and so on — so a column reads as tidy sub-blocks rather than one long list. To step back out of a part you've zoomed into, click it again.
- Tool cards on the home page now glow green and drift gently while you hover over them.
- Build cost now reflects whole production runs. The planner sizes each intermediate to the full batch you actually have to run — you can't run a fraction of a reaction or job — so the material total and cost match what you'd spend building from an empty hangar. Totals are higher than before because the earlier figure assumed you could buy partial runs.

### 2026-06-04

- Search results now show the real in-game item icon for blueprints — the icon of the item each blueprint builds — instead of a flat "BP" label, matching the icons used across the planner. Recently-searched blueprints keep their icon too.
- Blueprint costs and material lists in the Industry Planner now come straight from CCP's official game data, refreshed to the current build. Most visibly, capital ship recipes reflect recent rebalances — carriers and other capitals need fewer components than before, lowering their material totals.

### 2026-06-03

- The blueprint build plan now opens in a new flow view. It lays the build out as a row of tier columns — every component and material grouped by how many steps it sits below the final product — and clicking any buildable part smoothly zooms into a connected diagram of just that part's build, with a trail along the top to step back out. The view centers itself on the page and re-centers as you drill in. The earlier consolidated, by-branch, and raw-ledger views are still a click away.

### 2026-06-02

- The Industry Planner now works on a phone. The dashboard and every blueprint page reflow to fit narrow screens — the build plan stacks instead of forcing a sideways scroll, the cost ledger drops to a single column, the profit summary wraps cleanly, and buttons and rows are sized for tapping.
- The consolidated build view now shows every build stage at once in a grid that wraps to fit the screen, and clicking any component highlights its whole production chain through the stages beneath it — so you can trace exactly what one part pulls in, all the way down to raw materials.

### 2026-06-01

- Wormhole ore and gas site values now refresh live the moment you open a site: each resource fades and shimmers while its price updates, then settles to the confirmed figure, so the ISK estimate is never shown stale as if it were fresh. The blueprint planner already worked this way — sites now use the same engine and the same feel.
- Opening a blueprint now refreshes its market prices live, right then: the profit figures at the top fade and shimmer while they update, then settle the moment the live price lands, so a stale number is never shown as if it were confirmed.
- The build plan can now be viewed three ways. "Consolidated" sums the whole build by stage, showing every component and raw material once with its total quantity — click any component to trace just its chain through the stages beneath it. "By branch" keeps the original click-to-drill column view. "Raw ledger" lays out the raw materials by source category with a grand total.
- The Industry Planner home is now a dashboard. Search any blueprint or reaction to plan its build, and jump straight back to the ones you recently viewed. Saved favorites and active-build tracking are previewed here and coming soon. The old profit-margin browse catalog has been retired.
- Pages no longer error on the first load after a quiet period. When the site had been idle for a while, the very first visit could fail with a database error while the database was waking up; it now waits for the wake-up and loads normally instead.

### 2026-05-31

- The Industry Planner now opens on a browsable catalog instead of a near-empty landing: arrive with no blueprint in mind and see buildable items ranked by profit margin, filter by category or down to just-profitable, and sort by margin, cost, or name. Click any product and its production inputs fan out as a floating column beside the catalog — keep clicking to walk the build chain sideways, one level at a time, without leaving the page. The open path lives in the address bar, so a drilled view is shareable and the back button steps the columns out. Browsing reads the latest stored Jita prices and never kicks off a refresh, so it stays fast across thousands of blueprints.
- The blueprint planner page now leads with a profitability summary pinned to the top: a product shot, the margin and percentage colour-coded by health, the input cost and Jita sell price, and an at-a-glance confidence read over the whole build — so "is this worth building?" is answerable the moment the page loads, without scrolling.
- Every row in the build chain now carries its own price-confidence indicator, including the buildable components — hover any of them to see why a price is trusted or shaky (stale, thin, or from the backup source). The detailed cost breakdown, grouped by material source with subtotals, remains below the chain.
- The Industry Planner is now linked from the home page and the top navigation — it was previously reachable only by direct link or search.
- Blueprints and materials in the planner now show their real in-game item icons, so you can recognise what you're looking at at a glance.
- Every priced material now carries a confidence indicator: filled green when the price is fresh, live, and liquid; half-filled amber when it's stale, from the backup source, or thinly traded; a hollow ring when there's no live price. A summary over the whole build rolls these up ("High confidence — 1 stale · 1 missing") so you can judge how far to trust the cost.
- The build plan is now an interactive column view: start from the item you're making and click any component to fan its own inputs out as a floating column beside it, walking the production chain as deep as it goes. The drill path is kept in the page address, so a specific breakdown is shareable and bookmarkable and the browser back button steps you back out.
- The market-price pipeline is now monitored end to end. When the main price source has trouble and the site falls back to its backup, or a scheduled refresh is skipped, that now gets recorded and flagged instead of passing silently — so price-data problems get noticed and fixed faster, keeping Jita prices across the site fresher and more dependable.

### 2026-05-30

- The planner's build plan now reads top-down as a build sequence: it starts from the item you're making and nests the components and reactions that feed it, down to the raw materials, with the first couple of layers open and deeper steps a tap away. Each step is labelled by its real in-game role — reactions read as reactions, manufactured parts by their actual component group — instead of hand-picked category names.
- The Industry Planner's build cost is now correct for deep, multi-tier builds like Tech III cruisers. It had been overcounting by building each intermediate in whole production runs — pulling an entire reaction batch to use a fraction of it — which inflated the total several times over. A Legion hull now comes out around 180M ISK instead of 650M.
- The planner's material breakdown is now a build plan: each thing you manufacture is listed once at the total amount the whole build needs, grouped by construction step — reactions, advanced components, fuel, then the final hull — with a colour for each. Tap any step to expand exactly what it is made from, so a reaction's gas and fuel blocks sit underneath it.
- Raw materials in the planner are grouped by source — minerals, ice, gas, moon materials, salvage, and planetary — each with its own running subtotal.
- The pop-up resource preview that appeared when hovering an ore or gas site card has been removed; the same resource breakdown is still available by expanding the card.
- The Industry Planner is live: search any blueprint and open it to see its full material tree next to a live Jita build cost and profit margin. The tree renders instantly while prices stream in beside it and refresh on demand, so the cost breakdown is never blank while it loads.
- The wormhole sites page now shows its title, search box, and filters right away while the site list loads in, instead of holding the whole page behind a "Loading sites…" message until everything is ready.

### 2026-05-29

- Added a Contact page, linked in the footer, with a simple form for bug reports, feature ideas, and data corrections. Messages go straight to the developer by email; the address you enter is used only to reply and is never stored or shown publicly.

### 2026-05-27

- Tightened the platform's security posture and added abuse protection ahead of upcoming features.
- Sharing a wormhole site link in Discord, Reddit, or a forum now produces a rich preview card showing the site name, wormhole class, total ISK value, wave count, and scram count — instead of a blank embed.
- The site catalogue is now discoverable through Google. A sitemap and robots file are published so search engines can crawl every public page; the admin dashboard and internal API routes remain hidden from indexing.
- Real-user page-performance metrics (load time, layout shift, and the other Core Web Vitals) are now collected anonymously by Vercel Speed Insights so we can spot and fix slow pages. No behavioural tracking — performance only. See the Legal page for the full disclosure.
- The Legal page now lists two new things we record: the hostname of the site that referred you to us (so we can see whether visitors come from Discord, Reddit, search engines, etc.), and a random visitor ID kept in your browser storage that helps us distinguish first-time landers from page-hops. As before, no IPs, no user-agent, no third-party trackers.
- New tools can now be flipped from "Coming Soon" to live without a code change, paving the way for Industry Planner and the Wormhole Roll Calculator to come online incrementally.

### 2026-05-26

- The site search now matches initials and partial typos — typing "ffrd" finds "Forgotten Frontier Recursive Depot", with the matched letters highlighted in green so you can see exactly why a row was returned.
- The wormhole sites page now has a table view alongside the card grid. Use the Cards / Table pill at the top of the page to switch. The table is sortable by name, type, ISK, blue loot, scram count, and class — click any header to sort. Click a row to expand it inline and see the same wave, NPC, and resource detail the card shows. All existing filters (type, class) are preserved when toggling.
- Gas sites now show the wormhole class range they actually spawn in (Perimeter sites in C1–C6, Frontier sites in C3–C6, Core sites in C5–C6) and the class filter respects those ranges — picking "C3" includes Frontier and Perimeter gas, not just wave-driven C3 sites.
- The "killing wave" callout on combat-adjacent site cards now reads "blue loot" — the actual EVE-Online term for the loot dropped by Sleeper killing waves.
- The site now scales down cleanly on smaller windows. The navigation bar collapses progressively, the wormhole sites grid drops to a single column on narrow screens, and the hover preview on ore and gas cards no longer pushes the page sideways when the card sits on the right edge of the grid.
- LGI.tools is now open-source under the MIT License. The full source lives at https://github.com/StorminRH/lgi-tools — issues, feature requests, and pull requests welcome. See the new "Open-source licensing" section on the Legal page for details.
- Market prices now refresh automatically once a day in the background. The price status chip in the header has become a passive indicator — no click needed. Hover the chip to see how long until the next refresh.

### 2026-05-25

- The market-price freshness indicator now lives in the top navigation bar instead of at the bottom of the wormhole sites page. Click it to refresh prices from any page once the 24h cache window has elapsed.
- Type sizes across the site have been bumped slightly for readability.
- The wormhole sites page now uses a two-column card layout with more breathing room per site.
- Added a global search bar in the header. Press ⌘K (or Ctrl-K) from any page to focus it, then type to navigate across sites, tools, and commands. Sites by name jump straight to the deep-link page; commands cover refreshing prices, opening the changelog, logging out, and more.
- Recently-viewed sites now surface in the search dropdown when you focus the empty input — find what you were just looking at without retyping its name.
- Hovering an ore or gas site card on the wormhole sites page now reveals a quick preview showing the top three resources by ISK and the site's total. Combat, relic, and data cards stay static — their header value already answers the question.
- The wormhole site detail page now shows the originating source tab and the last market-price refresh time above the card, and uses the full page width for a feature-single-site feel.
- The landing page now shows the full LGI.tools lineup — Wormhole Sites is live; Industry Planner and Wormhole Roll Calculator are stubbed as Coming Soon.
- A persistent tool strip now sits in the header, so you can jump between tools without going through the landing page.
- The landing hero now reads "Lo-Gang Industries.tools" in a sharper typeface that pairs with the LGI.tools wordmark.
- Improved readability across the site by brightening secondary text in footers, captions, and chrome elements.
- Every link now glows green on hover for a more consistent interactive feel.
- The LGI.tools wordmark now sits in the top-left of every page and clicks back to the landing.
- The Feedback button now actually works. Click it on any page, type your message, and it goes straight to the developer. Logged-in submissions include your character name; logged-out submissions land anonymously.
- Added a Legal page describing what the site records about your visits and the EVE Online third-party developer notice. Linked from the footer.
- Added a BETA banner at the top of the changelog so first-time visitors know what kind of polish to expect.
- Missing pages and unexpected crashes now render polite EVE-themed pages instead of bare stack traces.
- Added a terminal-style search to the wormhole sites browser. Type filters like `c5/relic` or just `ore` to jump straight to a slice of the catalogue. Suggestions populate below the input as you type.
- Added a global footer with the current version, a changelog link, and a feedback affordance.
- Added this changelog page.
- Added EVE SSO sign-in. Click "Log in with EVE" in the header to authenticate via the Fenris Creations (formerly CCP) servers.
- Admins can now see at-a-glance usage metrics on the admin dashboard and open a full printable usage report with date-range controls.

### 2026-05-24

- Wormhole site combat numbers (DPS, EHP, EWAR) are now computed live from EVE SDE data instead of from baked snapshots — silent upstream drift is caught immediately.

### 2026-05-23

- Wormhole site resource values now overlay live Jita prices. The refresh button at the bottom of the sites page pulls fresh prices (24h cache).
- Site detail URLs are now shareable — click any site card and the URL updates to `/sites/<id>`.
- Combat and hack sites now show killing-wave ISK as their primary value.
- Added the wormhole sites browser. Browse every wormhole site with filters by class and type; expand any site for waves, NPCs, EWAR, and resource values.
