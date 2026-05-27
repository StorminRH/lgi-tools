# Changelog

User-facing changes to LGI.tools, grouped by ship date. Internal cleanup,
CI, and infrastructure work is intentionally excluded — see the SCRATCHPAD
for the full forensic record.

### 2026-05-27

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
