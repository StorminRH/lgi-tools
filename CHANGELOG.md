# Changelog

Every notable change to LGI.tools, grouped by release and ship date — user-facing
features and fixes alongside the internal, CI, and infrastructure work behind them.
Each entry's changes are tagged Added, Changed, Fixed, or Removed.

## v3.8 — Undock Checklist

v3.8 is the platform's undock checklist: a maturity pass before its next big tool, rather than a new feature of its own. It works through the things that make the site sturdier and easier to grow — firmer foundations under the hood, a refreshed interface, better discoverability on the web, and deeper operational tooling — so the next release starts from solid ground.

### v3.8.2.2.1 — 2026-07-11

#### Added
- New shared building blocks for the interface: one button — with primary, secondary, quiet, and destructive looks in two sizes — and one set of form fields (text box, dropdown, and multi-line box). Buttons, fields, cards, and panels across the site are now built from these instead of being styled one place at a time, so they stay consistent and can be adjusted in one place.
- A set of shape-and-depth design tokens: two corner radii (one for controls, one for cards) plus the shadows behind the new engraved look, defined once and reused everywhere.
- Build checks that keep future work on the shared radii, the shared dropdown, and the shared field styling — the same way the project already routes colors and text sizes through tokens.

#### Changed
- The interface picks up a subtle "inset instrument" look: form fields are engraved into dark wells, buttons carry a faint physical bezel, and cards gain a soft top-edge highlight. Corners across the site collapse from a spread of hand-picked pixel values to the two shared radii. Layout and colors are unchanged — only the component skins.

#### Removed
- The scattered hand-written field and button styling strings, and the floating feedback button's one-off green glow (it now uses the shared primary button).

### v3.8.2.1.1 — 2026-07-11

#### Fixed
- The changelog's version-chapter headings now show the chapter title at the same size as its version number, so each heading reads as one balanced line instead of a large version beside a small title.

#### Changed
- The styling build now scans only the application's own source for class names, rather than the whole project. This closes a hole where a bracketed example class written inside a comment in a configuration or documentation file could be mistaken for a real style and break the page.

### v3.8.2.1 — 2026-07-11

#### Changed
- The interface type is larger and more readable across the whole site. Every text size now comes from one named scale instead of being hand-picked element by element, so labels, table cells, body copy, and headings stay consistent and can be tuned in one place. Layout, colors, and the terminal styling are unchanged — only the type grows.
- The interface now uses a single monospaced typeface (JetBrains Mono) for its chrome, brand wordmark, and column-aligned numerals, replacing the previous two-font mono setup. It reads a touch larger at the same size and is one fewer font to download.

#### Added
- A new build check keeps future work on the shared type scale, the same way the project already routes colors through tokens.

### v3.8.1.3 — 2026-07-11

#### Added
- The database's branch settings now live in a file kept with the project's code, rather than only in the hosting dashboard — so they're version-controlled and reviewed like everything else. The live production database is protected from accidental deletion, and any short-lived preview database now expires on its own and runs on cheap, idle-friendly compute, so a forgotten one can't quietly keep costing money.

#### Changed
- The project's tooling notes now refer to the database command-line tool by its current name.

### v3.8.1.2 — 2026-07-11

#### Changed
- The compiler now treats every lookup into a list or lookup table as possibly missing, so code that reads a slot which may not be there has to account for it before it can ship. This closes the last gap in the project's strict type checking, and from here new work is written to handle absent values from the start — fewer "undefined" surprises reaching players.

### v3.8.1.1 — 2026-07-11

#### Changed
- Warnings from the code checks now fail the build instead of passing silently, so a warning can no longer slip through the checks that run on every change.
- The compiler now targets a 2022-era JavaScript baseline instead of the older 2017 one, matching the modern browsers the site already serves. Nothing about what ships to players changes.

## v3.7 — Safer Accounts, Sharper Build Math

v3.7 tightened how LGI.tools handles your account. The app now asks EVE for the least it needs — read-only access to your public info, skills, and industry jobs, nothing that can change your characters — and each character shows exactly what it granted, with a one-click way to revoke it. Your account is bound to the character that created it, so a sold or transferred character can't reach the previous owner's data, and a new Danger zone lets you purge a single character, wipe your whole account, or sign out of every device at once. Corporation directors and station managers can opt in to share industry jobs and Upwell structures as build locations, always behind an explicit, revocable consent.

The industry planner grew from a generic calculator into one that reflects what you actually own and can do. It factors your owned blueprints' material and time efficiency across a whole build, tracks which materials you already hold versus still need, applies your build character's trained skills to job times, and prices structure taxes and reaction costs — with a Raw | Item cost toggle so small Tech II builds stop reading as wildly unprofitable at one run. Build-location search now spans the entire EVE universe, saved templates and a one-click Multibuy export speed up repeat work, and every price is anchored to the real Jita 4-4 order book, with a warning when a headline number rests on thin volume.

### v3.7.36.1 — 2026-07-11

#### Changed
- Each version on the changelog now opens with a short plain-language summary of what it delivered, and the older versions gained themed titles.
- The changelog now records internal, infrastructure, and tooling work too, not only user-facing changes — from here on every notable change is documented, not just the ones you can see.

### v3.7.27.1 — 2026-07-10

#### Changed
- In the planner's build plan, each component you build now shows the icon of the blueprint or reaction formula you run to make it, instead of the finished item — so a glance tells you what to produce at each step. Raw materials you buy still show the item's own icon.

#### Fixed
- The planner header now shows a product's 3D model only for items that actually have one (ships, drones, structures) and the item's icon for everything else. Modules and other items no longer trigger a failed image request on every planner open.

### v3.7.26.1 — 2026-07-10

#### Changed
- Every stored market price now describes the Jita 4-4 station order book instead of the whole Forge region. Region-wide snapshots let a cheap order a few jumps out become an item's headline price — one launcher showed 28,000 ISK while the real Jita ask was 255,000 — and no volume filter could fix that, because the misleading orders were real, just elsewhere. Prices, order-book volumes, and depth now all reflect the market players actually trade at, and refresh to the corrected values within a day.
- Buy prices count only bids placed at Jita 4-4 itself. Reachability-based alternatives were measured and rejected: they let region-wide lowball bid walls drag prices down on hundreds of items, and the fallback price source scopes its station data the same way, so the two sources now agree.
- Wormhole site ISK totals now read "what this pays at Jita 4-4" — an aggregate shift of about a tenth of a percent.

#### Added
- A regional-discount callout on the planner's Sell · Jita tile: when the same item sells meaningfully cheaper at another station in the region — at least 15% below the Jita price with at least 10 units of real volume behind it — a green badge shows the discount, and its popover names the solar system, the discount, and the available units. The region's genuine bargains stay visible without corrupting the headline price; a scattering of one-unit curiosities does not qualify.

### v3.7.25.1 — 2026-07-10

#### Changed
- Market prices are now anchored to sell orders with real volume behind them. Previously a momentary one-unit lowball listing anywhere in the region could become an item's headline sell price — inflating the planner's revenue and margin, and at the same time making the Market Score read more optimistic, because the order-book depth measurement anchored to that same fake price. The cheapest sliver of each side of the book (under 0.1% of its volume) is now skipped before the best price is taken, on both the sell and buy sides. Healthy markets are unaffected, and prices refresh to the corrected values within a day.

#### Added
- The planner's Sell · Jita tile now carries a small data-quality badge when the product's lowest ask sits well below the volume-weighted front of its book, with the reason on hover: "Price anchored by a thin order." It covers what the volume filter can't judge — small markets, fallback price sources, and genuine dumping in progress — so a suspicious headline price is never presented without a warning.

### v3.7.24.1 — 2026-07-10

#### Added
- The industry dashboard now shows your saved templates: the eight most relevant (favorites first, then most recently updated), each loading its full planner configuration in one click. Past eight, a link leads to a new Templates page listing every template with the same load, rename, favorite, and delete controls as the planner's Templates menu.
- The dashboard's job-slot readout is now a real capacity gauge. Each activity — manufacturing, science, reactions — shows used and total slots summed across all your linked characters, with totals computed from each character's trained slot skills. Corporation jobs count against the pilot who installed them, matching how the game charges slots.

#### Changed
- The dashboard's four sections — Recents, Templates, Active jobs, Corporation jobs — now share one two-column layout and order themselves by relevance: sections with content rise to the top, empty ones sink to slim one-line headers. The sample favorites placeholder is gone.

#### Fixed
- Reaction jobs no longer vanish from the slot counts or show a generic activity tag in the jobs table. The live game API reports reactions under a different activity id than the game's static data, and both are now recognized.

### v3.7.23.1 — 2026-07-10

#### Added
- The industry planner can now save build templates. A Templates panel in the page head saves the planner's entire configuration under a name — runs, build and reaction locations, station, build character, ME/TE overrides, cost basis, margin view, and multibuy scope — and lists every template you've saved with favorites pinned first. Templates can be renamed, favorited, and deleted (with a confirm step) right from the panel.
- Loading a template takes you to its blueprint and restores the full saved configuration in one step. Anything that no longer resolves — a structure that's gone or no longer shared, a character that's been unlinked — simply falls away, and a single notice summarizes what didn't apply while everything else loads normally.

### v3.7.22.1 — 2026-07-09

#### Added
- The build plan gains a Multibuy export: a panel that copies a shopping list straight to your clipboard, ready to paste into the in-game Multibuy window. Check the tiers you'll build yourself and the list becomes everything those jobs consume, bought as-is — an unchecked item is listed as the finished product instead of its ingredients, so the list never double-buys a component and its inputs. With all tiers checked it matches the raw ledger exactly.
- The export has two modes: Total is the full from-scratch shopping list, while Remaining — the default when your characters' assets are linked — subtracts what you already own, including skipping the ingredients of any intermediate your hangars fully cover.

### v3.7.21.1 — 2026-07-09

#### Added
- The industry planner's Input cost tile now has a Raw | Item toggle. Item — the new default — counts only the materials one build actually consumes, while Raw remains the full empty-hangar shopping list including every whole reaction or component batch you'd be forced to run. Gross and net margin follow the selected view, so small T2 builds whose reaction batches dwarf a single hull no longer read as wildly unprofitable at one run. An info hover shows both figures side by side, and your choice is remembered.

#### Fixed
- The build plan's raw-ledger header now always sums to the shopping list it expands, rather than tracking the margin tile's basis.

### v3.7.19.1 — 2026-07-09

#### Added
- The build character now means something: picking one applies that character's trained industry skills to the planner's job times. Industry and Advanced Industry speed up manufacturing jobs, Reactions speeds up reactions, and the per-item science and Advanced Ship Construction skills speed up the T2 jobs that require them — matching the in-game reductions exactly. With no build character selected, times stay exactly as before; a character whose skills haven't synced yet simply shows the unmodified baseline, never an error.
- A small hourglass readout beside the build-character portrait shows the skill time reduction being applied (hover it for the character's relevant skill levels), and the Build time tile's hover now reports the real skill and structure reductions instead of a fixed "none applied".

#### Fixed
- The Build time hover previously claimed no structure bonus was applied even when a selected structure was reducing the shown time; it now reports the actual reduction.

### v3.7.18.1 — 2026-07-09

#### Added
- The industry planner's building-character frame is now a selector: click it to pick any of your linked characters as the build character, saved across visits. "Default (active character)" keeps the frame following whoever you're signed in as. Picking a character doesn't change any planner numbers yet — applying that character's skills and standings to the math comes in an upcoming release.

### v3.7.17.1 — 2026-07-02

#### Added
- A character strip on the Skill Queues and Industry Jobs pages: your linked characters appear as a row of portraits above each tracker. Click a portrait to hide that character's cards on that page — the choice is saved per page, so a character hidden on one tracker still shows on the other, and a newly linked character always starts visible. Hiding is display-only; hidden characters keep syncing in the background.
- A character that hasn't granted the page's required access now shows in the strip as locked, with a reconnect shortcut that takes you through EVE login and back to the same page.

### v3.7.16.1 — 2026-07-02

#### Added
- An account settings page, reached from the account menu's "Account settings" entry (no longer marked coming soon). It gathers account-wide settings in one place, and new settings will appear there as they ship.

#### Changed
- The corporation structure-sharing toggle moved from the Structures page to the new account settings page. It works exactly as before — Station Managers only, and turning sharing off still asks for confirmation before removing the shared structures, their rig fits, and facility taxes. The Structures page now links to account settings instead of hosting the toggle.

### v3.7.15.1 — 2026-07-02

#### Added
- Your character portrait in the header now opens an account menu: manage characters, add a character, and log out all live in one place. An account settings entry is visible but marked coming soon.
- Pages that offer view settings now surface them right in the account menu. On Wormhole Sites, the cards/table view and the lightbox/expand detail mode can be switched from the menu anywhere on the page, staying in sync with the on-page toggles.

#### Changed
- Logging out moved from a standalone header button into the account menu. Clicking the portrait no longer jumps straight to the Characters page — use the menu's "Manage characters" entry.

### v3.7.14.1 — 2026-07-02

#### Changed
- Adding a character that had accidentally become its own separate account now moves it into your current account instead of being refused. Everything tracked for that character comes along, the leftover duplicate account is cleaned up once it's empty, and the Characters page confirms the move. The move happens only when you complete EVE login for that exact character — proof it's yours.

### v3.7.13.3 — 2026-07-02

#### Added
- Structures now carry their owner-set facility tax. Record it on a corp structure beside its rig fit (Station Manager only), or on a custom structure in the builder — with an inline edit on saved structures. Job fees then charge that structure's real rate, and the fee breakdown labels the rate in use, marking the standard 0.25% as "assumed" until a real one is entered.
- Reaction blueprints now show net margin. Pick a reaction system (or build in a refinery), and the job is priced against that system's own reaction cost index and the hosting refinery's tax — the same install fee, surcharge, and sell-fee treatment manufacturing already gets.

#### Changed
- With no tax entered, nothing moves: every fee keeps the standard 0.25% station assumption, so existing plans price exactly as before.

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

## v3.6 — A Smarter Planner and a Cleaner Site

The planner grew up: a Market Score rating how easily a build will sell, a build-system picker with an itemized fee breakdown, and take-home (net) margin that subtracts EVE's job fees and sell taxes once you pick where to build — plus a corrected Tech II costing bug that had overstated some hulls by billions. Around it the whole site was refreshed with a live home dashboard and server status, a cleaner two-tab layout, a wormhole-site lightbox, remembered preferences, and broad accessibility work, as LGI.tools left public beta.

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

## v3.4 — Multiple Characters & Live Trackers

Link more than one EVE character and switch between them from your portrait. Two signed-in tools arrived: Skill Queues — every character's live training queue with per-skill progress and completion times — and Industry Jobs, watching every character's running jobs with live progress bars and countdowns that stay current while the page is open.

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

## v3.3 — Real Game Data & the Flow View

Build plans gained a flow view — tier columns grouped by build step that you zoom into part by part — and every item now shows its real in-game icon. Blueprint costs and material lists come straight from CCP's current game data, and build costs reflect whole production runs, since you can't run a fraction of a job, so totals match building from an empty hangar.

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

## v3.2 — Planner Dashboard & Mobile

The planner became a dashboard — search any blueprint, revisit recent ones, and read a build three ways: consolidated totals, click-to-drill branches, or a raw-materials ledger. Prices refresh live the moment you open a blueprint or site, and the whole planner now works on a phone.

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

## v3.1 — A Browsable, Shareable Planner

The Industry Planner opened onto a browsable catalog of buildable items ranked by profit margin, with filters, sorting, and an interactive column view you can drill as deep as the build goes — every step carrying its own price-confidence indicator, and the drill path living in the address bar so any breakdown is shareable.

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

## v3.0 — The Industry Planner Arrives

LGI.tools gained its second major tool. Search any blueprint to see its full material tree beside a live Jita build cost and profit margin, with prices streaming in as the tree renders and raw materials grouped by source. Rich link previews, a public sitemap, and a contact page rounded out the release.

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

## v2.9 — Launch: the Wormhole Site Database

The first public LGI.tools: a browsable database of every wormhole combat, gas, ore, relic, and data site, each expandable to its enemy waves, NPC detail, electronic-warfare, and live Jita-priced resource values. Sign in with your EVE character, jump anywhere with ⌘K search, and share any site by its own link — open-source under the MIT License from day one.

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
