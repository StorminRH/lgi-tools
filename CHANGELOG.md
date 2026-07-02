# Changelog

User-facing changes to LGI.tools, grouped by release and ship date. Each entry's
changes are tagged Added, Changed, Fixed, or Removed. Internal cleanup, CI, and
infrastructure work is intentionally excluded.

## v3.7 — Security Improvements / Industry Planner Upgrade

### v3.7.13.2 — 2026-07-01

#### Added
- The planner's build-system search now covers the whole universe — every wormhole, nullsec, and empire system is findable and selectable in both location groups, not just systems with NPC industry stations, so builds in player structures anywhere can finally be planned.
- Custom structures can be pinned to a home system in the structure builder (with pin and unpin actions on saved structures). A pinned structure appears only in its own system's build list and locks the planner to that system when selected, exactly like a corp structure; unpinned structures stay available everywhere.
- Both structure dropdowns carry a permanent "Add custom structure" entry that jumps to the structure builder.

#### Changed
- The planner hero was rebuilt as one aligned row: the item render and building-character portrait sit in matching square frames, the efficiency and run controls share one stepper style, and the two location groups sit side by side as Manufacturing and Reactions with their structure bonuses shown as compact percentages beside each header. The item name now sits centered above the card with a per-run output chip in the corner.
- The structure lists are grouped by source — corp structures, custom structures, and NPC stations — and a structure tied to a system is listed only under that system.

### v3.7.12.2 — 2026-07-01

#### Added
- When the structure you're building in can't run reactions — an Engineering Complex or Citadel — the planner now offers a refinery for just the reaction steps of the build, and applies that refinery's own bonuses and system to those steps. It only appears when there's a gap to fill: a refinery already runs everything, so picking one needs no second choice. Reaction blueprints opened on their own now get the build-location controls too.

### v3.7.12.1 — 2026-07-01

#### Changed
- The industry planner's header was reorganized into a single panel — the blueprint, its efficiency and run controls, and the build location now sit together — and it shows a portrait of the character you're building as.

### v3.7.11.1 — 2026-06-30

#### Added
- Under the Hood — a behind-the-scenes dev log about how LGI.tools is built and the reasoning behind it, linked from the footer. It reads like a file browser: pick a topic from the folders on the left, and the code snippets a topic references sit inline where they're mentioned, collapsed until you open them.

#### Fixed
- The live "online" dot on a character portrait now appears only when that character is actually online, instead of also showing on characters who are offline.

### v3.7.10.1 — 2026-06-30

#### Added
- The Characters page now has a Danger zone for managing your account. You can purge an individual character — clearing everything the site has stored for it and cutting off the site's access to that character's EVE data — delete your entire account, or sign out of every device at once. Deleting your account (or purging your last character) also clears anything the site saved that doesn't come from EVE, such as your saved preferences and custom structures.

### v3.7.9.1 — 2026-06-30

#### Added
- The build planner can now build in your corporation's own Upwell structures. A station manager switches sharing on for the corporation from the Structures page; once on, every member sees the corporation's structures as build locations, and picking one locks the build to that structure's system and applies its bonuses. A station manager can also record which rigs each structure is fitted with so the bonuses are exact. Sharing is off until a station manager turns it on, and turning it off removes the corporation's structures and recorded rig fits again.

#### Changed
- Seeing your corporation's structures needs a character with the Station Manager role in the corporation. Existing players must reconnect a character once to approve a new read-only corporation permission (its owned structures) — EVE requires re-consent whenever an app asks for new access.

### v3.7.9 — 2026-06-28

#### Changed
- Your skill queue, your industry jobs, and your corporation's industry jobs now load straight from LGI's database the moment you open their pages and refresh themselves in the background, instead of waiting on an always-on live game-data connection. The boards work the same — countdowns keep ticking and finished jobs flip to ready on their own — but they appear faster and more reliably.

### v3.7.8 — 2026-06-28

#### Added
- Your characters now show a live online indicator — a small dot on each portrait that glows when the character is online and dims when offline, updating on its own as you log in and out of the game. (You'll be asked to reconnect once so it can read your online status.)

#### Changed
- Character portraits are now round and consistent everywhere they appear across the site.

### v3.7.7 — 2026-06-28

#### Added
- The build planner now tracks the materials you already own. Each component's quantity ring fills in as your stock accumulates — the centre counts down to how many more you still need, with a green tick once you have enough.
- Clicking a component's quantity ring now breaks down how many you own versus what's left to acquire, and shows where your stock is held — which of your characters or corporations has it, and the station, structure, ship, or container it sits in.

### v3.7.6 — 2026-06-28

#### Changed
- The build-plan component cards were redesigned for a cleaner, more uniform look. Each component's blueprint efficiency controls now open in a popover when you click its icon — the icon is framed and colour-coded to show whether you own the blueprint, have set a manual what-if, or neither — and the cost and needed-quantity details moved into a popover on the quantity ring.
- The material- and time-efficiency adjusters are now available on every buildable component, not only ones whose blueprint you own, so you can model any component at any efficiency.

#### Fixed
- Build-plan component icons are uniform squares again, instead of appearing stretched or different sizes.

### v3.7.5 — 2026-06-28

#### Added
- The build planner now factors in the blueprints you own. Your researched material efficiency lowers the materials and cost of every component you hold a blueprint for, across the whole build, and your time efficiency shortens the estimated build time.
- You can set material and time efficiency per component right on the build plan — scroll or type a value to model a build at any efficiency, even for a blueprint you don't own. Your owned value, a manual what-if, and an unowned component each read in their own colour.
- A new "Total job time" figure sums every manufacturing job in the build — each component plus the final assembly — with a hover breakdown of how each one adds up. The existing build-time figure now reflects time efficiency too.
- Each owned component shows who owns its blueprint and where it's stored, beside how many you need.

#### Changed
- The build-plan components were re-laid out, gathering each one's efficiency controls, ISK value, and a needed-quantity ring onto a single card.

### v3.7.4 — 2026-06-27

#### Added
- Your corporation's industry jobs now appear alongside your own on the Jobs board and the Industry planner. Each job shows who's running it — their portrait and name — with the corporation's logo, and a finished corp job flips to "ready" on its own while the page is open.

#### Changed
- Seeing corporation jobs needs a character with the Factory Manager or Director role in the corp. Existing players must reconnect a character once to approve two new read-only corporation permissions (its roles and its industry jobs) — EVE requires re-consent whenever an app asks for new access.

### v3.7.3 — 2026-06-26

#### Fixed
- The "syncing" indicator that shows while your live data is refreshing no longer drifts away from the top of the screen when you scroll the page while it's up.

#### Changed
- That syncing indicator is now a small terminal-style status toast near the top of the screen — it appears while data loads, confirms when it's done, and clears itself.

### v3.7.2 — 2026-06-25

#### Added
- Wormhole space is now mapped. Every J-space system — tagged with its class, from C1 to C6 plus Thera, shattered space, and Drifter space — joins known space and Pochven in the site's universe data. Thera, the one wormhole system with stations, can now be chosen as a build location.
- The stargate connections between known-space systems are now recorded, laying the groundwork for jump-route and system-map tools.

### v3.7.1 — 2026-06-25

#### Changed
- LGI.tools now asks for only the four read-only EVE permissions its live tools actually use — your public character info, skills, skill queue, and industry jobs — instead of the broader set it requested before. It still cannot write anything to your characters.
- When a character is missing the access a tool needs, only that character's card now prompts you to reconnect — the rest of the page keeps working.
- The Legal page is now the Privacy page, split into Personal Data (what the site records about your visit) and EVE SSO Data (what it reads from your characters and how it's protected).

#### Added
- Each linked character now lists exactly which EVE permissions it has granted, with a direct link to review or revoke them on EVE's own authorized-apps page.
- If a character is sold or transferred to someone else, its synced data is now wiped automatically, so nothing carries over to the new owner.

### v3.7.0.1 — 2026-06-24

#### Changed
- The changelog now groups its releases under a master version with a themed title, so related updates read as one chapter — each release still listed underneath with its own ship date.

### v3.6.28 — 2026-06-24

#### Changed
- Every inner page now opens with the same header — a small breadcrumb over a large title and a one-line description — so the wormhole sites, industry planner, your characters, skill queues, jobs, and the admin screens all read like one site instead of two different title styles.
- On narrow screens the wormhole-site table now scrolls sideways instead of overflowing the page, so no columns get cut off; the card view still stacks to a single column.
- Opening a wormhole site now expands its details in place by default instead of in a centred pop-over — you can still switch back to the pop-over from the view controls.

### v3.6.27 — 2026-06-24

#### Fixed
- Screen readers get far more from the site: the global search now announces which result is highlighted as you arrow through it, the feedback box announces when your message was sent or failed, the active navigation tab is marked for assistive tech, and the footer's legal notice and other faint text now meet readable-contrast minimums.
- The card and table views of the wormhole-site list can no longer disagree about which sites match a filter.
- Site and blueprint links with a stray non-numeric suffix now show a proper not-found page instead of quietly loading the wrong entry.
- Progress animations now hold still for visitors who've asked their system to reduce motion.

### v3.6.26 — 2026-06-24

#### Changed
- The changelog now reads like clean release notes: a bigger version heading, with each change type (Added, Changed, Fixed, Removed) shown as its own labeled section above easier-to-scan bullets.

#### Removed
- The public-beta notice is gone — LGI.tools is out of beta.

### v3.6.25 — 2026-06-23

#### Changed
- The contact page now shows direct ways to reach the developer — email, GitHub, and the developer's in-game character and corporations — in place of the old message form. A community Discord is in the works.

### v3.6.24 — 2026-06-23

#### Changed
- The site now sits on a subtle dark space backdrop, with a cleaner top bar that shares the cards' surface and a search box that glows green when you focus it.
- When you're signed in, the home page is tidier: your characters now show as small cards three-across beneath the banner, each with skill points, what's training, time remaining, and a clearer progress bar.

### v3.6.23 — 2026-06-23

#### Changed
- The legal page is shorter and easier to read. The privacy section is now broken into clear, plainly-worded parts — what the site records, what it never collects, how that data is used, and how to stay anonymous — and links out to where the data is stored.

### v3.6.22 — 2026-06-23

#### Changed
- The site has a refreshed look — deeper, cleaner dark surfaces, higher-contrast text, and slightly rounder cards throughout.
- The home page now leads with a bolder welcome and a compact live-data panel — wormhole-site, blueprint, and market-item counts plus when Jita prices last refreshed — in place of the status card that used to sit at the foot of the page.

### v3.6.21 — 2026-06-23

#### Added
- When you're signed in, the home page now shows your characters down the left side — each with its portrait, total and free skill points, and a live look at what it's training right now: the current skill, a progress bar, and the time remaining, with a clear marker when training is paused. An "Add character" control lets you link another character without leaving the page.

### v3.6.20 — 2026-06-23

#### Added
- The top bar now shows live Tranquility server status and the current online player count — a pulsing green dot with the pilot count when the server is up, a quiet marker when it's in post-downtime VIP mode or offline.

#### Changed
- The home page is now a two-column dashboard: a live EVE Online news feed beside an at-a-glance status panel (SDE build, catalogue counts, market-price freshness).
- The navigation is cleaner on phones and small screens — the tool links and the sign-in control tuck into a menu, while the server status and search stay to hand.

### v3.6.19 — 2026-06-22

#### Added
- Wormhole site cards can now open in a lightbox — clicking a card enlarges it and centres it over the dimmed catalogue for an easier read, with a toggle to switch back to the old in-place expansion. Your choice is remembered between visits, and on a phone the lightbox fills the screen.

#### Changed
- In a site's wave breakdown, the enemy electronic-warfare tags (web, scram, neut, RR) now line up in a single column across every wave instead of starting wherever each name ends, the per-NPC damage figures are bolder, and the whole breakdown reads a little larger.

### v3.6.18 — 2026-06-22

#### Added
- Wormhole site cards now show the Sleeper ship classes present at a glance — Frigate, Cruiser, Battleship, and Sentry — each with a red rank icon and a count, and every NPC in a site's wave breakdown is marked with its class icon.

#### Changed
- Gas sites now show the harvestable unit count alongside the cloud volume, the way ore sites already read, so the volume figure is no longer mistaken for the unit count.
- A site's wave breakdown is easier to scan: wave headers stand out more clearly from their contents, and the per-NPC damage figures share one consistent style.

### v3.6.17 — 2026-06-22

#### Added
- A "Raw ledger" in the build plan header lists every raw input the build needs, grouped by source category (minerals, gas, salvage, and so on) with quantities and costs — click it to expand.

#### Changed
- The build plan's quantities now reflect whole production runs — the amount you actually build or buy at each step, rounded up to complete runs, instead of a fractional per-run share. For example, a component needed 150 times at a 100-per-run batch now reads 200, since you must run it twice.
- Clicking a component in the build plan now shows what that component's own build truly consumes, rather than the rounded-up project-wide total — so a sub-step's real requirement is visible.

#### Removed
- The planner's separate cost / sell / profit bar was removed; those figures already appear in the tiles directly above it.

### v3.6.16 — 2026-06-21

#### Added
- The Industry Planner now shows a build-time estimate — the time for the blueprint's final assembly job — with a hover that lists what changes it.
- A hover on the planner's profit figure breaks down the install and sell fees that go into it.

#### Changed
- The planner's build-location picker now lists each station's full in-game name (for example "Jita IV-4 — Caldari Navy Assembly Plant") instead of a generic facility label.
- The planner's information tooltips were restyled into one cleaner, more readable layout.

### v3.6.15 — 2026-06-21

#### Added
- The site now remembers how you set things up between visits. The Wormhole Sites cards-vs-table choice and the Industry Planner's build location are saved automatically and restored when you come back — no flicker on load. Signed-in pilots get these stored to their account and synced across devices; everyone else keeps them in their own browser.

### v3.6.14 — 2026-06-21

#### Added
- While live data loads — syncing your characters, or pulling fresh market prices on the Industry Planner — a brief terminal-style status line now drops from under the top bar and clears itself once the data lands.

#### Changed
- Updated market prices now flash in with a quick highlight as they land, replacing the mechanical digit-roll — across the Industry Planner tiles and the Wormhole Sites resource values.

### v3.6.13 — 2026-06-21

#### Fixed
- Corrected a major overstatement of Tech II ship build costs in the Industry Planner — affected hulls (such as the Curse and Devoter) were showing billions of ISK instead of their true cost of a few hundred million, because the planner was costing a material through a hidden internal recipe instead of the real one. The whole affected tier now shows correct costs and margins.

#### Changed
- Blueprint search and the Industry Planner now list only real, published blueprints — CCP's internal/test blueprints and ore-compression formulas (which can't be built in-game) no longer appear.

### v3.6.12 — 2026-06-19

#### Changed
- The top navigation is now a clean two-tab bar — Wormhole Sites and Industry Planner — and the logged-in corner shows just your character portrait (your name appears on hover).

#### Removed
- The "Wormhole Roll Calculator (coming soon)" placeholder has been removed from the navigation and home page while it's on hold; the two live tools are unchanged.

### v3.6.11 — 2026-06-18

#### Changed
- Every page now shares one consistent width and side margins, so the layout no longer shifts as you move between pages. Text and forms sit in a comfortable centred reading column, while dashboards and tables use the full width.
- The soft dot-lattice backdrop now sits behind every page, not just the home page.

### v3.6.10 — 2026-06-18

#### Changed
- The Industry Planner (a blueprint's build page) has been redesigned into a dashboard: a row of at-a-glance tiles for input cost, Jita sell price, profit margin (with a gross/net switch once you pick a build location), and a market-liquidity score, plus a cost-versus-profit bar.
- The build breakdown now lays every build stage out as side-by-side columns — one per tier, from finished components down to raw materials — each showing the quantity and market value of every input with a per-tier subtotal. Clicking a buildable component highlights its whole sub-tree across the columns.
- The global search dropdown now shows results as a grid of cards, and every item result reliably renders its in-game icon.

### v3.6.9 — 2026-06-15

#### Changed
- The Wormhole Sites page loads faster and lighter: each site's full enemy-wave breakdown now builds the moment you open that site (in either card or table view) rather than rendering all 69 sites' details up front. Expanding a site is still instant, and individual site pages are unchanged.

### v3.6.8 — 2026-06-15

#### Changed
- Refined the global search bar: it now sits as an inset box and drops its results straight down at a fixed width instead of widening on focus, with a cleaner monospace, terminal-style results list.
- Wormhole Sites cards are easier to read at a glance — each card now shows its electronic-warfare types (web, scram, neut, remote-rep) next to its class and type, and the cards use a more readable font.
- Site combat breakdowns now show each enemy's damage in red, with the highest-damage enemy in every wave emphasized.

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
