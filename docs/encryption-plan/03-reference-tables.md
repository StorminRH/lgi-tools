# Reference tables

These four tables are the lookup layer for the rest of the doc. Every row follows a decision in the Detailed spec tab; where a row needs reasoning, the owning section has it.

Acronyms used here: Durable Object (DO), key directory (KT), access-control list (ACL), EVE's web API (ESI), EVE's static data export (SDE), point-in-time recovery (PITR).

Milestone IDs M0-M9 map to phases P0-P5 as described in Rebuild plan: M0 and M1 are P0, M2a and M2b are P1, M3 is P2, M5 is P3, M6 is P4 and M8 is P5; M4, M7 and M9 are later, on demand. GA means cutover at the end of P5. The relay in v1 is Convex, carrying sealed frames behind the transport interface; DO rows describe the planned migration if Convex cost or fan-out requires it.

### Features lost or changed by tier

The Sealed tier gives up anything that needs a server to read data while no member is online; Standard (M7) puts some of that back as labelled LGI-readable conveniences.

| Feature | Today | Sealed | Standard |
| --- | --- | --- | --- |
| Tracking with no client open | A Convex action polls ESI with server-held tokens. It goes cold 5 min after the last heartbeat. | Stops. Always-on needs a corp bot (M4), your own awake device, or Tauri (M9). | Server tracker on a separate location-only grant, publishing only into Standard maps (M7) |
| Hidden-tab tracking | The server loop keeps running for up to 90 min with the tab hidden | Regression risk, gated by truth check 1 (hidden-tab polling); "tracking degraded" marker and gap prompts | Unaffected when the server tracker is on |
| Auto-mapping while nobody is online | Only while the server loop is warm | Bot only | Steward authors jumps from the server tracker |
| Revocation | Neon ACL change, projected to Convex claims; nothing to rotate | A Manager's removal cuts delivery at once and rotates within 60 s. Affiliation loss is detected within about 1-2 h (hourly re-resolution plus CCP's 1 h cache), then rotates at once. For a kick, remove or block the character directly. Re-admit to the pinned key within 7 days. | Same; the Steward also rotates when no member is online |
| Paste gate and validation | Server refuses a scan paste unless you track a character in that system | Advisory and client-side; reducer rejections, signed ops, audit and revert | Same as Sealed |
| Lifetime collapse and purges | Hourly Convex collapse cron; daily tombstone and signature purges | Evaluated lazily, plus idempotent client sweeps | Steward sweeps |
| Discord and webhook alerts | None | Bot only; alerts are plaintext once inside Discord | Steward or bot |
| Plaintext REST API | None (internal routes only) | None; the bot's local read API | Possible through the Steward later |
| Net-worth history | Nightly server cron revalues every user's plaintext holdings | Computed on open, backfilled from the daily price book and marked as estimates. Exact nightly values need your own always-on device. | No Standard option: personal data is never escrowed |
| Corp grant freshness | Computed per request on the server from plaintext roles, HQ and bases | Advances only while a Director, role-holder or corp agent is online (about 1 h lag) | Hosted corp agent |
| Joining a corp-granted map | Every eligible corp member sees the map automatically | Invite or no-link request, then strict approval with bulk approve (OD-1); auto-admit is opt-in | Same as Sealed |
| Recovery after losing every unlocker | EVE login restores everything; the server holds it all | Personal data lost; ESI data is re-fetched; maps re-approve you as a reset | Maps: a Manager+ approves now, or the Steward re-wraps after 72 h unless vetoed. Personal data is still lost. |
| Character sale detection | Daily server re-verification; suspension after 24 h of failures | Silent re-attestation every 14 days; groups suspend after 21 days | Same as Sealed |
| Unlock without network | Not applicable: no keys | Not possible: wraps live server-side | Same as Sealed |
| Account-level block | Blocks every character of the account, including existing members | Filters future joins only | Same as Sealed |
| In-game Access Lists | Not supported | Deferred (OD-9) | Deferred |
| Admin console | User data views and character reassignment | Metadata only; no reassignment with data | Metadata plus escrow audit |
| Support | Operator reads user data directly | Locally redacted diagnostics bundle the user opts into | Escrow-assisted only with Owner consent |
| Guest links | None | Read-only, position-free projection (M4) | Same as Sealed |
| Audit and undo | Map events kept 7 days; signature restore | 30-day signed op log, revert by character, snapshot rollback | Same as Sealed |
| Telemetry and feedback | characterId and query strings; Vercel Speed Insights | Route-template counters; explicit feedback with a preview | Same as Sealed |
| Multi-character privacy | One account row; the operator sees all links | Per-character identities; residual timing correlation disclosed | Same as Sealed |
| Map size | 128 systems or connections, tombstones included | today's caps (128-row collapse bound, 256 scan rows, 1,024 trackers, 32 per user); larger caps are new work | Same as Sealed |
| Map lifecycle | Delete, restore, purge-now; daily purge cron | Archive, 30-day restore, purge with a second-Owner check | Same as Sealed |
| Corp access audit | corp\_access\_audit, 400-day plaintext retention | Signed CorpSpace commits plus a 90-day metadata log | Same as Sealed |
| Name and structure search | Server proxies using server-held tokens | Browser-direct ESI: CCP sees the terms, LGI does not | Same as Sealed |
| Industry planner | Server-rendered pages reading Neon | Core only; the shell shows public blueprint pages | Same as Sealed |
| Self-hosted frontend | None | Static bundle at GA; full stack in M9 | Supported; trusts LGI escrow for that group |
| Browser support | Any modern browser | Chrome/Edge 137+, Firefox 130+, Safari/iOS 18.4+; older browsers get the shell | Same as Sealed |
| Saved plans, wh\_observations | Saved plans up to 50 per user; wh\_observations written, never read | Saved plans kept as personal vault documents; wh\_observations dropped | Same as Sealed |
| Map roles | owner, admin, editor, viewer | Owner, Manager, Member, Viewer, plus Blocked | Same as Sealed |
| Merge and transfer | Server-side merge and admin reassignment | Client-mediated merge; transfer detected at re-attest | Same as Sealed |

### Route map from the current app

Nothing that touches private data stays server-rendered. Pages move to the public shell, the crypto core or the ops console; API handlers move to the control plane, the relay, the dataset pipeline or are dropped. In the "New home" column, **shell** is lgi.tools, **core** is app.lgi.tools, **api** is api.lgi.tools, **relay** is relay.lgi.tools, **data** is the data.lgi.tools pipeline and **ops** is ops.lgi.tools.

#### Pages (28)

| Current page | New home | Data source | Notes |
| --- | --- | --- | --- |
| / | shell; core `#/board` when signed in | Datasets; character vaults and CorpSpace | The shell landing never embeds the core |
| /atlas | core `#/maps/{room}` plus relay; shell /atlas marketing page | MapRoom op log and snapshots | Marketing page replaces today's guest landing |
| /changelog | shell | Markdown in repo | Unchanged |
| /changelog/\[slug\] | shell | Markdown in repo | Unchanged |
| /contact | shell | Static | Unchanged |
| /legal | shell | Static | Credits CCP, anoik.is, Pathfinder (MIT), Fuzzwork, EVE-Scout |
| /industry | shell | Blueprint and names datasets | Public landing and search |
| /industry/\[id\] | shell | Blueprint dataset | Read-only public render. Links to `app.lgi.tools/#/industry/{id}`, so the id stays in the fragment. |
| /industry/planner | core `#/industry` | Datasets, vaults, CorpSpace | Core only |
| /industry/jobs | core `#/industry/jobs` | Character vaults, CorpSpace jobs bucket | Core only |
| /sites | shell | Sites dataset | With OG images |
| /sites/\[id\] | shell | Sites dataset | Also feeds the core intel panel |
| /settings/account | core | Control plane, keyring | Devices, passkeys, recovery, sessions, deletion, merge |
| /settings/characters | core | Control plane, character vaults | Link and unlink, scopes, reconnect wizard, attestation status |
| /settings/corporations | core plus relay | CorpSpace | Corp spaces, sharing, Directors, bot |
| /settings/preferences | core | Personal vault | No server-synced plaintext prefs |
| /preview/cards | dropped | n/a | Dev-only build, never deployed |
| /preview/primitives | dropped | n/a | Dev-only build, never deployed |
| /preview/widgets | dropped | n/a | Dev-only build, never deployed |
| /admin | ops | Control-plane metadata | Overview |
| /admin/esi | ops | Config | Becomes "ESI status, kill switch, polling config" |
| /admin/health | ops | Analytics Engine | Content-free health metrics |
| /admin/queue | dropped | n/a | No esi\_refresh\_jobs queue exists |
| /admin/search | ops | Google Search Console | Search metrics for the shell |
| /admin/statics | ops | Statics pipeline | Review, then publish the dataset |
| /admin/traffic | ops | Analytics Engine | Route-template counters |
| /admin/users | ops | Control-plane metadata | Metadata-only lookup |
| /admin/users/\[userId\] | ops | Control-plane metadata | No "view as user"; no reassignment with data |

Root files (sitemap, robots, opengraph-image, the social card, not-found) move to the shell.

#### API handlers (77)

| API group (handlers) | New home | Data source | Notes |
| --- | --- | --- | --- |
| account: board, industry-slots, structures, industry-jobs, corp-industry-jobs, corp-structures, active-character (7) | core | Character vaults, CorpSpace buckets, datasets | Computed locally; active character becomes local UI state |
| account: custom-structures list, update, delete, search, parse-fit (5) | core | Personal vault docs; browser-direct ESI search | parse-fit runs in a worker |
| account: industry-profiles list, update, delete, duplicate (4) | core | Personal vault docs | Revision CAS, field-level last-writer-wins |
| account: corp-structures/rigs, corp-sharing (2) | core plus relay | Signed CorpSpace records | Turning sharing off is a crypto-shred |
| account: saved-plans ×4 (4) | core (personal vault) | n/a | Kept as personal vault documents |
| account: characters, characters/unlink (2) | api | Control plane, KT | /bind and unlink; unlink follows the transfer flow without alarms |
| account: purge-character, delete (2) | api | Deletion Workflow | Client steps run first: CCP revoke, passkey signals |
| account: sessions/revoke (1) | api | Control plane | Revocation push closes sockets in every DO |
| admin: characters/reassign, esi-jobs/retry (2) | dropped | n/a | No reassignment with data; no server refresh queue |
| admin: characters/unlink, sessions/revoke (2) | ops | Control plane | System revoke and revocation push |
| admin: role (1) | ops | Cloudflare Access groups | Operator roles live outside the app |
| admin: wh-statics (1) | ops | Statics pipeline | Review and publish |
| auth: Better Auth catch-all (1) | api | Control plane | Replaced by /bind, /attest, /session, /webauthn/\*, /devices/\*, /link/\* |
| cron: refresh-sde (1) | data | SDE via GitHub Actions | Gated on the SDE build number |
| cron: refresh-prices, refresh-industry-indices, refresh-wh-statics (3) | data | Public ESI, Fuzzwork, anoik.is | Worker crons; the price sweep covers every marketable type |
| cron: refresh-gsc (1) | ops | Google Search Console | Ops Worker cron |
| cron: purge-maps (1) | relay | DO alarms plus purge Workflow | Wraps are shredded first |
| cron: daily-batch (1) | data; rest dropped | Public ESI | Public steps move to the pipeline; net-worth revaluation and plaintext housekeeping are dropped |
| cron: drain-esi-refresh-jobs (1) | dropped | n/a | The browser scheduler replaces the queue |
| dev: synthetic-pilot (1) | dev only | Fixtures | Fake SSO; release builds refuse test unlock |
| eve: names, type-names (2) | dropped | Names datasets; browser-direct /universe/names | Removes a per-ID lookup |
| feedback (1) | api | Linear | Explicit preview; path excluded by default |
| industry: blueprints, stations, systems, cost-indices (4) | data | Datasets | Whole tables, never per-ID |
| industry: owned-assets, owned-blueprints, skill-levels, team-skill-levels, build-location (5) | core | Character vaults, CorpSpace | Computed locally |
| internal: eve-characters, eve-token (2) | dropped | n/a | No server-held tokens (rule S8) |
| maps: create, access (2) | api plus relay | Room registry; MapRoom genesis and ACL commits | ACL mirror is disclosed metadata |
| maps: delete, restore, purge-now (3) | relay | Room-lifecycle commits and Workflow | Archive, 30-day restore, purge |
| maps: jump, signature-elimination (2) | core | Client reducers | No server jump resolver |
| maps: search-characters (1) | core | Browser-direct ESI search and /universe/ids | LGI never sees the search term |
| market-history: refresh (1) | shell and core | Shell: public server fetch. Core: browser-direct ESI. | No per-type refresh through LGI from the core |
| market-prices: refresh (1) | dropped | Daily price book | Replaces seedUnpricedTypes |
| preferences (1) | core | Personal vault | n/a |
| sites, sites/\[id\] (2) | shell | Sites dataset | n/a |
| sync-leave (1) | dropped | n/a | A socket close does the job |
| telemetry (1) | api | Analytics Engine | /t route-template counters only |
| universe: assets plus assets/\[version\] adjacency, systems, wormholes (4) | data | data.lgi.tools datasets | Already immutable and versioned today |
| universe: statics/\[systemId\] (1) | dropped | Statics dataset, pinned | Today's per-system fetch leaks which systems are on a map |

#### Convex functions (outside the 77)

| Convex area | New home | Data source | Notes |
| --- | --- | --- | --- |
| Chain queries (9) and authoring mutations (about 16) | relay plus core | MapRoom op log; engine-map reducers | Logic rewritten against a state interface |
| Location sync and tracking (characterLocation\*, mapTracking\*, onlineStatus) | core plus relay | Browser ESI scheduler, UserHub leases, 256-byte frames | M1 removes the plaintext token table first |
| mapAccess claims projection and httpMapAccess | api plus relay | ACL mirror; DO coarse gate | Fine role checks run in reducers |
| mapStatics action | core | Statics dataset | No per-system server fetch |
| Crons: hourly ceiling collapse, daily chain and signature purges, sync-engine retention | core | Lazy evaluation plus client sweeps | No server reads map contents |
| httpEngine, httpJump, httpLocation | dropped | n/a | Replaced by signed ops and frames |
| accountMerge, httpAccountMerge | core | Both keyrings, unlocked | Client-mediated merge |

### Dataset catalogue

Every public lookup becomes a whole, signed, immutable dataset on data.lgi.tools, so LGI never learns which IDs a user cares about (rule S7). Sizes are gzip estimates unless marked measured; M0 spike S7 and OQ-9 replace them with measurements before the mobile asset budget is fixed.

| Dataset | Source | Size (gzip) | Refresh cadence | Consumers |
| --- | --- | --- | --- | --- |
| System directory (systems, security, regions, stations) | [SDE JSONL](https://developers.eveonline.com/static-data/eve-online-static-data-latest-jsonl.zip) via GitHub Actions (measured: build 3569502, 99,197,273 bytes, 2026-10-02) | 150-200 KB (0.7-0.9 MB raw) | On SDE build change | core, shell |
| Adjacency (stargate edges) | SDE | About 40 KB (120 KB raw) | On SDE build change | core routing, shell |
| Wormhole codex and effects | SDE plus curation | 20-40 KB | On change | core, shell |
| Wormhole statics (promoted set) | [anoik.is feed](https://anoik.is/static/static.json) (measured 1,965,931 bytes), cross-checked against the Pathfinder CSV (3,773 rows, 74 KB), reviewed in ops | About 15 KB (60 KB raw) | On review | core, pinned by reducers |
| Ship mass | SDE dogma subset (about 500 ship types) | A few KB | On SDE build change | core, pinned by reducers |
| Type names and groups | SDE | About 300 KB (1 MB raw); shardable by category | On SDE build change | core, shell |
| Blueprint bundles | SDE, trees pre-resolved | About 1 MB for all trees; per-blueprint bundles far smaller | On SDE build change | shell /industry/\[id\], core planner |
| Structure and rig modifiers | SDE | Not yet measured; expected under 100 KB | On SDE build change | core planner |
| Cost indices | Public ESI /industry/systems via Worker cron | 100-250 KB | Daily | core planner |
| Adjusted prices | Public ESI /markets/prices | About 150 KB | Daily | core planner |
| Daily price book (all \~18k marketable types, hub prices) | ESI region orders, Fuzzwork fallback | 300-500 KB per day (1-2 MB raw); 400 days is 120-200 MB in R2 | Daily; immutable per day; kept 400+ days | core net-worth backfill, shell market |
| System jumps and kills | Public ESI system\_jumps, system\_kills | Estimate 30-60 KB | Hourly | core activity charts (M4) |
| W-space activity, 90 days | [R2Z2](<https://github.com/zKillboard/zKillboard/wiki/API-(R2Z2)>) aggregate | Estimate 100-300 KB | Daily | core |
| Kill feed chunks | R2Z2 via a 1-min Worker cron (about 15.7k kills/day) | Estimate a few KB per 15-60 s chunk; about 10 MB for 7 days | Continuous; kept 7 days | core, filtered locally to the chain |
| EVE-Scout Thera/Turnur mirror | EVE-Scout public API | Under 10 KB | Every 5 min | core routes (api.eve-scout.com is not in the CSP) |
| Sites catalogue and Sleeper NPC stats | Exported from production in M1 (drizzle/0006 seed plus production edits), then edited in ops | Under 200 KB (seed is about 100 KB SQL) | On edit | shell /sites, core intel panel |
| ESI status | ESI /meta/status | Under 5 KB | Every 5 min | core banner |
| KT signed tree heads with Sigsum proofs and witness cosignatures | KeyDirectory DO, Sigsum | Under 1 KB per head | Head every 2 min; Sigsum every 10 min | core, watch |
| CCP JWKS snapshots | api.lgi.tools and the watch Action | A few KB each | Hourly check; published on change | core, watch |
| Release manifests with Sigsum proofs | CI | Estimate tens of KB | Every release | core service worker, watch, self-hosters |
| Signed dataset manifest | Pipeline | A few KB | Every publish | everyone |

The shell reads only these datasets, plus public ESI market history fetched server-side for shell market pages. It makes no Neon and no per-user calls. A `datasets.pin` commit pins hashes per map, so reducer inputs never drift between members (see Maps: membership, sync and tiers).

### Metadata the server sees

The server never sees map content, positions, assets, tokens or search terms, but it does see who uses LGI, with whom, and when. The table lists each field LGI's own components hold, why they hold it, and what reduces it; it is the source for the published disclosure page.

| Field | Held by | Why it is needed | Mitigation | Residual exposure |
| --- | --- | --- | --- | --- |
| Account-to-character links | api | Binding, quotas, account block, distinct-account checks | Never shown to peers; per-character identities; lazy device certificates with no device metadata | LGI knows which characters are alts of one another (disclosed) |
| Owner hash per character | api (from bind and re-attest evidence) | Detect sale and transfer | KT stores salted commitments only; evidence opens only to the owner and scoped approvers | Control plane sees owner-hash continuity |
| Character names, corp and alliance affiliation | api | Coarse ACL gate; hourly re-resolution and system revokes | Public at CCP already | LGI knows which corps and alliances use it |
| ACL principals per room (character, corp, alliance, bot, expiry) | api mirror, MapRoom DO | Coarse gate, no-link listing, delivery cutoff | Minimal mirror; fine roles enforced in encrypted reducers | Who is allowed into which room; Access List expansions too, once that ships |
| Room member characters and roles | MapRoom DO | Delivery, wrap fetch, removal unit | Random room IDs; signed membership log held by members | The membership graph of every room |
| Room existence, tier, region hint, created and last-activity times | api registry, DO | Routing, lifecycle, idle warnings | Random room IDs; no names or systems | How many rooms exist and when each is busy |
| Durable Object IDs | Cloudflare logs | Platform | None available | Logged outside the `eu` jurisdiction |
| Devices: class, passkey count, AAGUID, last-seen | api | Sessions, unlock wraps, revocation | Certificates seen by peers carry no device metadata | Authenticator brand and device count per account |
| Unlock wrap and keyring rows | api (key-wrap Neon project, history 0) | Zero- and one-tap unlock | Ciphertext only; separate project with no history | Number of unlockers and when each is used |
| IP address and user agent | Cloudflare and Vercel edge | Transport | No IP storage in api or relay databases; minimal logging | Edge logs at the vendors |
| KT event timing per character | KeyDirectory DO | Transparency | Non-urgent events jittered 0-6 h; staggered reconnect and compromise wizards | Urgent events (compromise, first bind) are visible in time |
| KT lookups (who looks up whom) | KeyDirectory DO | Join and admission checks | Room-scoped capability lists allowed targets; rate limits; VRF-indexed map in v2 | Lookup pairs within a room |
| Re-attestation timing and granted scopes | api | Sale detection every 14 days | Silent, jittered; expired JWTs only; salted commitments | The scp claim shows which features a character uses, such as Director scopes |
| Invite use counts | MapRoom DO | Enforce maxUses and expiry | invite\_id is derived from the fragment secret; the blob is sealed | How often an invite is redeemed |
| Guest fetch timing | relay edge | Guest snapshot delivery | Capability hash only; per-IP rate limit; position-free snapshots | When guests look at a map |
| Op timing, op kinds, padded sizes, per-account op counts | MapRoom DO, R2 | Sequencing, quotas, 30-day retention | 1 s quantization; power-of-two padding from 256 B to 64 KiB; tracker ops released on the tick | Activity rhythm of each room and who is writing |
| Socket presence per account and device | DOs | Delivery and revocation push | None beyond capability re-presentation | Who is online in which room |
| Tracking participation (not location) | MapRoom DO | Location batching | Fixed 256-byte frames; per-room sender slots; per-character jitter; cover ticks | Which characters are tracking in a room |
| UserHub lease activity | UserHub DO | One poller per character | None in v1; unlinkable relay tokens are a v2 item | Hours each character is polled, which tracks play time |
| Personal blob update slots | UserHub DO, R2 | Vault sync | Padmé padding; non-urgent writes jittered 0-10 min | Coarse vault activity |
| Corp bucket counts, pull times, manifest size | CorpSpace DO | Corp key distribution | One corp-wide padded manifest size | Corp holdings shape at bucket level and when Directors pull |
| Account block entries | api | Filter future joins | Never emits commits that show linkage | A refused alt join is a residual oracle (documented) |
| Feedback and diagnostics bundles | api, then Linear | Support | Explicit preview; path excluded by default; local redaction | What the user chose to send |
| Telemetry counters and CSP reports | Analytics Engine, api | Health and integrity | Route templates only; no characterId, query strings or visitor id; no PII in reports | Aggregate traffic per route |
| Standard group content and escrow opens | Steward | Recovery and server features (M7) | Labelled "Standard: LGI can read and recover this"; every open logged in CloudTrail and Sigsum | Full content of Standard groups, by design |

Third parties see their own slices. CCP sees every ESI call, including POST /route connections, search terms and portrait fetches. Cloudflare and Vercel see edge logs, Discord sees bot alert plaintext, and Linear sees submitted feedback. Sigsum witnesses see only tree-head hashes.
