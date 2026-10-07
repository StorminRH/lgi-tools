# Part 04: Leaks to close first

**Status:** In owner review

## Owner review outcome (in progress, 2026-10-07)

This section overrides the rest of the part where they disagree. The owner is reviewing each Phase 0 PR individually.

- **0-1, token leases:** cleanup only until Phase 1 (question 2): delete a user's leases when their tab goes cold, sweep expired leases from an existing Convex cron, and test that no lease reaches a log, error or telemetry event. Phase 1 deletes the table and the eve-token route.
- **0-2, wormhole observations: replaced, not dropped** (per Part 2). Phase 0 creates the totals table `(solar_system_id, wh_type_code, count)`, converts existing rows once (grouped by system and type, each `dedupe_key` counted once), then drops the old table. Each connection or signature gets a "counted as" type field: learning a type adds one and records it, the same type again does nothing, a retype moves the count. Resolvers write counts immediately until the sealed service exists; the daily batch arrives with it. In Phase 2 the field and `observationKey` move inside the sealed rows. Occasional double or missed counts from a half-failed write across Neon and Convex are accepted.
- **0-3, statics per system:** agreed as written. One versioned statics asset (about 15 KB) loaded with the universe assets; three releases (add asset, switch browser and Convex, delete the per-system route). Also an efficiency gain: one cached download replaces a Vercel call per system added.

## In one paragraph

06 lists ten leaks to fix whatever the final design looks like. This part splits them into two groups. The first group can close now, as small PRs to `development` that users never notice. This is Phase 0 (Part 30). The second group can only close once the sealed service exists, because the fix is to move a token or key into it. For each leak this part says what the code does today, what the fix is, which phase it lands in, and the latest release by which it must be closed. The aim is that no Phase 0 fix adds a dual path or a new screen, and every later fix has a named home in another part.

## How it works today

- **Token leases.** Every location run in a Convex action gets an EVE access token from `/api/internal/eve-token`. That route decrypts the stored refresh token on Vercel and refreshes it when needed. `finishSync` then stores the token in plaintext in `characterLocationAccess` (`accessToken`, `expiresAt`), so later runs can reuse it until CCP's expiry, which is about 20 minutes. Leases are deleted on an ESI 401 or 403, when a character drops out of the run, and on purge. They are not deleted when a user's tab goes cold, and nothing sweeps expired rows.
- **Other token use on Vercel.** `getFreshAccessTokenForCharacter` (`eve-token-service.ts`) also serves owner ESI sync (`owner-sync-port.ts`), structure search, map character search and the authorization re-check (`character-authorization.ts`). `owner-transfer.ts` decrypts the stored access token to read the owner hash.
- **Env keys.** EVE tokens in `account`, both `accessToken` and `refreshToken` (`EVE_TOKEN_ENCRYPTION_KEY`), and corp snapshot bodies (`ESI_SNAPSHOT_ENCRYPTION_KEY`) are AES-GCM under one environment key each, with no binding to the row. That protects against a stolen database. It does not protect against anyone who can read Vercel's environment.
- **Login.** Better Auth's `genericOAuth` callback on Vercel receives the access and refresh tokens in plaintext and encrypts them before storing them.
- **`wh_observations`.** Both resolvers write to it after Convex commits a jump or an elimination. Its `dedupe_key` is the same random value stored in `mapConnections.observationKey`. Only writers and test registries touch the table. Nothing reads it. `observationKey` itself is a required field between Vercel and Convex: the jump resolver creates it (`newObservationKey()`), `httpJump.ts` requires it (`z.string().min(1)`), and `mapJumpAuthoring.ts` rejects empty values.
- **Deploy order.** `vercel-convex-deploy.ts` runs `convex deploy --cmd 'pnpm build:vercel'`. Drizzle migrations and Convex functions go live before the new Vercel deployment serves traffic, so for a short window the old deployment runs against the new schema and functions.
- **Per-ID public lookups.** The mapper and `mapStatics.fetchSystemStatics` fetch `/api/universe/statics/[systemId]`, which puts the system ID in the URL. The route already loads the whole promoted table and returns one row. The universe asset manifest returns only a version built from the SDE version, not the statics `feedVersion`. `FriendlyList` posts the character IDs of pilots in the viewed system to `/api/eve/names`, and their ship types to `/api/eve/type-names`. `use-character-identities` (dock character picker, scanner prompt) and corp job installers use the same names route. The planner posts a system ID to `/api/industry/build-location` and lists of system IDs to `/api/industry/cost-indices`. `getBuildLocation` joins that system's stations and cost indices with adjusted prices for the blueprint's tree.
- **Market lookups.** The market refresh routes take up to 50 type IDs. The planner sends its blueprint's tree, and public site pages send their own types. The mapper's scanner (`ScannerLivePricesProvider`, used by `SystemIntelligenceBody` and `SignatureWindow`) sends the gas and ore types of the signatures in the viewed system. `getLivePrices` writes behind through `persistPrices`, an insert with `onConflictDoUpdate`, so any requested type gets a row. `persistHistory` likewise creates `market_history` rows only for products users view on `/industry/[id]`. No sweep seeds them.
- **Market seeding.** The SDE pipeline (`refresh-sde` cron) already seeds placeholder `market_prices` rows for every blueprint input and output (`seedTrackedTypes`, `listTrackedTypeIds`). `recordNetWorthSnapshot` also calls `seedUnpricedTypes`, which inserts a row for every owned type with no price yet. Those rows stay, so the row set already reveals holdings, most clearly non-marketable owned types. The price cron (`refreshStalePrices`) refreshes whatever rows exist through the bulk region dump.
- **Caches.** Ten private reads use `'use cache'`: corp holdings, character sheet, personal and corp jobs, personal and corp assets, blueprints, corp structures, skills and skill levels. `next.config.ts` sets `cacheComponents: true` and no `cacheHandlers`, so these use Next's in-memory store, inside the same Vercel function that holds the keys and decrypts the rows. Only `getCorpAssetSnapshot` caches decrypted snapshot bodies.
- **Telemetry and feedback.** `page_view` stores `pathname` and the full query string. That includes `/industry/[id]` and `?map=`. `usage_logs` keeps the character ID for 180 days, and the admin traffic cards group rows by `path`. The feedback form shows the user `pathname + search`, and the route sends that path, with the author's name, to Linear.
- **Location ETags and timing.** `characterLocation.etagLocation` and `etagShip`, and `characterLocationOnline.etagOnline`, sit next to plaintext locations. `characterLocationApply.ts` writes only when something changes.
- **Error fields and logs.** `syncError` and `lastErrorCode` are typed as free strings, although today they hold codes (`needs_role`, `worker_interrupted`, `budget_deferred`). Location sync failures log `error.message`. `mapStatics` skip lines log `mapId` with `systemId`. `errorCode()` falls back to `error.message`. The resolvers log the raw `cause`.

Files: `convex/characterLocationAccess.ts`, `convex/characterLocationSync.ts`, `convex/characterLocationApply.ts`, `convex/lib/characterSync.ts`, `convex/lib/locationCaches.ts`, `src/app/api/internal/eve-token/route.ts`, `src/platform/auth/{token-crypto,eve-token-service,account-token-encryption,auth}.ts`, `src/composition/sync/owner-sync-port.ts`, `src/composition/{structure-search,map-character-search,character-authorization}.ts`, `src/composition/account-lifecycle/owner-transfer.ts`, `src/data/esi-snapshots/crypto.ts`, `src/data/wh-observations/*`, `src/composition/jump-resolver/resolver.ts`, `src/composition/signature-elimination/resolver.ts`, `convex/httpJump.ts`, `convex/mapJumpAuthoring.ts`, `src/scripts/vercel-convex-deploy.ts`, `src/data/wh-statics/client.ts`, `src/app/api/universe/statics/[systemId]/route.ts`, `src/app/api/universe/assets/route.ts`, `convex/mapStatics.ts`, `src/mapper/windows/SystemIntelligenceBody.tsx`, `src/mapper/tracking/use-character-identities.ts`, `src/app/api/industry/{build-location,cost-indices}/route.ts`, `src/features/industry-planner/queries.ts`, `src/app/api/market-{prices,history}/refresh/route.ts`, `src/features/wormhole-sites/components/ScannerLivePrices.tsx`, `src/data/market-prices/{ingest,refresh-on-view,cache,source}.ts`, `src/data/market-history/refresh-on-view.ts`, `src/composition/pipelines/sde-pipeline.ts`, `src/data/eve-data/queries.ts`, `src/composition/board/{board-view,price-book}.ts`, `src/features/*/queries.ts`, `src/data/corp-holdings/queries.ts`, `src/components/telemetry/page-view-metadata.ts`, `src/components/composition/TelemetryReporter.tsx`, `src/app/api/feedback/route.ts`, `convex/lib/errorCode.ts`, `convex/schema.ts`.

## What changes

Nothing visible to users. Two things change for the owner only. The admin traffic cards group pages by route pattern. Feedback tickets in Linear show the route pattern instead of the full path.

Several of these leaks add little today, because the same content already sits in plaintext in Convex or Neon. Fixing them still matters, because each one would outlive the sealing of that content. Each fix therefore has a "close by" phase: the phase that seals the related content. That phase does not ship until the fix has landed (Hard rule 13).

## Design

### Phase 0 PRs (each small, each to `development`, in this order)

Where a PR touches a route Convex calls, or drops a table, it is split across releases (Hard rule 12). This part owns only the PRs and their order. Part 24 owns what each public asset contains, its version and its caching, and the single table of per-ID lookups that stay.

| PR | Leak | Change | Close by |
|---|---|---|---|
| 0-1 | Leases (1) | Delete a user's leases in `finishSync`'s cold branch. Add an expired-lease sweep to an existing Convex cron. Add a test that no log line, error or telemetry event contains a lease. No shorter cap: CCP's token lifetime is fixed, so a cap only adds vend calls. | Phase 1 removes the table |
| 0-2 | `wh_observations` (4) | Release 1: remove emission and its delete-on-failure paths from both resolvers, and delete `src/data/wh-observations`. Release 2: a migration drops the table. `observationKey` stays: once the table is gone it links to nothing, and Part 16's sealed rows drop the plaintext `mapConnections` fields in Phase 2. | Phase 0 |
| 0-3 | Statics per system (5) | Release 1: ship Part 24's `statics` asset and its manifest version. Release 2: the mapper client and `mapStatics` switch to it. Release 3: delete `/api/universe/statics/[systemId]`. | Phase 2 |
| 0-4 | Industry lookups (5) | Ship Part 24's `cost-indices`, `adjusted-prices` (the whole `adjusted_prices` table) and `industry-stations` assets, and switch the planner to them (Part 21). Delete `build-location` and `cost-indices` in the same PR or the next; only the browser calls them. | Phase 3 |
| 0-5 | Names (5) | Add a readable Convex query that returns `mapAccess.characters` (ID and name) for a map. The browser joins it to presence and tracking rows, so it keeps working once location rows are sealed. `FriendlyList` and `use-character-identities` read names from it. Fall back to `/api/eve/names` only where `characters` is undefined, and track removing that fallback. Switch ship-type names to Part 24's `ship-types` asset. `/api/eve/names` stays for corp job installers until Part 23 seals corp jobs. | Phase 2 (sealed location rows, Parts 16 and 17) |
| 0-6 | Market seeding and lookups (6) | Widen `listTrackedTypeIds` (or the `seedTrackedTypes` input) in the existing SDE pipeline to every published type with a market group. Remove `seedUnpricedTypes` from `recordNetWorthSnapshot`. Prune once the `market_prices` rows outside that set, keeping the wormhole-site catalogue rows. Make the write-behind in `getLivePrices` update-only, and have the refresh routes reject type IDs outside the seeded set. `ScannerLivePricesProvider` always requests the whole fixed harvestable set from the site catalogue (in as few fixed requests as the 50-ID cap needs), so the request no longer depends on which signatures exist. | Phase 2 for the scanner; Phase 3 for seeding |
| 0-7 | Caches (7) | Not in Phase 0 by default (question 6). The ten private `'use cache'` wrappers go when Parts 19 and 23 replace those reads, since Vercel stops decrypting then. If the owner wants it earlier, start with `getCorpAssetSnapshot` only, after staging timings. | Phases 3 and 4 |
| 0-8 | Telemetry and feedback (8) | Map the path to its route pattern with one shared normaliser (`/industry/[id]`, `/sites/[id]`, `/changelog/[slug]`). Store no `search` beyond the existing `utm` field. Normalise the feedback path on the server, leaving the form unchanged. Rewrite existing `usage_logs` rows once. | Phase 0 |
| 0-9 | Errors and logs (10) | Make `syncError`, `lastErrorCode` and location sync errors closed unions. `errorCode()` returns `unexpected:<name>` and never a message. Drop `mapId` and `systemId` from statics skip lines. Resolvers log codes only. | Phase 0 |

If the owner wants `observationKey` cleared in Phase 0 anyway, it ships in three releases: Convex makes the field optional, then Vercel stops sending it, then a backfill removes it. That touches every file that carries it: `convex/{httpJump,mapJumpAuthoring,mapAuthoringFields,mapJumpIdentity,mapJumpReads,mapHallwayBackfill,mapScan,schema}.ts`, `convex/lib/{observationKey,mapScanApply,mapScanElimination,mapStaticClaim}.ts`, both resolvers and `convex-door.ts` files, `src/data/maps/connection-hallway.ts` and `src/mapper/chain/connection-detail.ts`.

### Closes only with the sealed service

| Leak | Why it waits | Closes in |
|---|---|---|
| Lease table, and Convex and Vercel seeing access tokens | Something must call ESI with a token. Today Convex polls with tokens from Vercel, and Vercel itself uses tokens for owner sync, structure search, map character search and the authorization re-check. | Phase 1: every token consumer moves into the workers in the same release (Part 30, "Why Phase 1 moves every token at once"; Parts 08, 17, 18 and 23), and the owner-hash read moves into custody. `eve-token-service.ts` and `token-crypto.ts` lose every Vercel caller. Then the lease table and the eve-token route are deleted. |
| Tokens at login (3) | The code exchange has to run somewhere that holds the client secret | Phase 1 (Part 08) |
| `EVE_TOKEN_ENCRYPTION_KEY` (2) | The enclave needs it once to re-seal stored tokens | Re-sealed in Phase 1 (Part 31); destruction timing is set by Part 30 (recommended there: end of Phase 1) |
| `ESI_SNAPSHOT_ENCRYPTION_KEY` (2) | Corp snapshots are dropped for a sealed holding index | Phase 4 (Part 23); key destroyed in Phase 5 |
| Location ETags and write timing (9) | They only matter once locations stop being plaintext beside them | Phase 2: ETags go inside the sealed location row (Parts 16 and 17). Phase 1 retires the leases, but the workers still write today's plaintext `characterLocation` row, ETags included. Writing on change is kept (Part 17). |

No AAD retrofit is proposed for the env-key ciphertexts, because both keys are retired (question 7).

### Effect on other parts

This part amends Part 30: PRs 0-5 and 0-6 (the scanner change) join Phase 2's prerequisites, and PR 0-7 leaves Phase 0 and Phase 3's prerequisites unless question 6 says otherwise.

It also amends Part 24: its exception table gains a row for `/api/eve/names` called with corp job installers' IDs, which PR 0-5 keeps until Part 23 seals corp jobs in Phase 4. Part 21 rule 4 cites Part 24's exception table instead of this part's rule 5.

### Dropped from older docs

D-LIFE-6's "M1 hardening" framing, which tied these fixes to an export route and a rebuild. 01's suggestion to call ESI from the browser for names: principle 3 keeps that work on the server. 01's third-party-scripts item moves to Part 26. Server jobs that read map contents move to Parts 15 and 16.

### Risks

- A wider seeded set grows `market_prices`. The sweep already uses the bulk region dump, whose ESI cost does not grow with the number of types. Check row count and write volume on staging.
- Update-only write-behind could leave a valid type unpriced if the seeded set misses it. The refresh routes would then reject it. Check every planner and site type against the seeded set in tests.
- The statics asset changes when the feed is promoted. Clients must pick up the new version as Part 24 specifies.
- An expand-and-contract step left half done leaves an unused route or table. Each PR's last release is tracked until it lands.

### Testing

Each PR keeps today's tests green and adds its own. A lease-cleanup test on cold-off. A guard that the table and both emitters are gone. Route tests for each new asset and its version 404, and a manifest test for the statics version. Planner tests that the asset-computed build location matches today's route output for fixed fixtures. A seeding test from SDE fixtures, a test that the write-behind never inserts, and a test that the scanner's request is the same for any set of signatures. A normaliser test over every dynamic route. Type-level tests for the error unions. The Playwright smoke journeys must pass unchanged. `pnpm check` runs on every PR and `pnpm verify` before promote, with zero Fallow findings.

## Data: readable vs encrypted

| Data item | Stays readable on LGI servers | Encrypted | Where computed |
|---|---|---|---|
| `characterLocationAccess` | No: interim cleanup, dropped in Phase 1 | Never stored | Sealed service (Phase 1) |
| Access and refresh tokens | No | Sealed under the token key from Phase 1 | Sealed service |
| `wh_observations` | Dropped | — | Not needed |
| `observationKey` | Yes until Phase 2, linking to nothing | Dropped with the plaintext connection fields (Part 16) | Convex today; sealed service after |
| Wormhole statics table | Yes, as a whole asset | — | LGI server; read in browser and map logic |
| Cost indices, industry stations | Yes, as whole assets | — | LGI server; planner in browser |
| Adjusted prices | Yes, as a whole asset | — | LGI server; planner in browser |
| Tracked pilots' names | Yes (projection metadata) | — | LGI server (Convex); joined in browser |
| Ship type names | Yes, as a whole asset | — | LGI server |
| `market_prices` row set | Yes, all marketable types | — | LGI server |
| `market_history` row set | Yes, products viewed on `/industry/[id]` (exception) | — | LGI server |
| Private reads in `'use cache'` | In memory until Parts 19 and 23 | — | LGI server today; sealed views later |
| `usage_logs` path and feedback path | Route pattern only | — | LGI server |
| Location ETags | No, from Phase 2 | Inside the sealed location row | Sealed service |
| Location write times | Yes (accepted, Part 17) | — | Sealed service writes |
| Error fields and log lines | Codes and opaque IDs only | — | LGI server and sealed service |

## Hard rules

1. [Agreed] No Phase 0 change is visible to users. Same pages, flows and timings.
2. [Agreed] Each fix lands through `development` → `staging` → `main`, with `pnpm check` and `pnpm verify` at zero Fallow findings.
3. [Proposed] Never log, return in an error, or record in telemetry any token, lease, key or ESI response body.
4. [Proposed] Until Phase 1, a lease exists only while the user's tab is warm. After Phase 1, no EVE access or refresh token is stored or used outside the sealed service, and no Vercel code calls `eve-token-service.ts` or `token-crypto.ts`.
5. [Proposed] Public data that private content selects is served as whole versioned assets or fixed sets, never looked up by the content's system, type, character or structure IDs. The only exceptions are those in Part 24's exception table (its rule 7), including the corp-installer row this part adds; this part keeps no list of its own.
6. [Proposed] No public table may be shaped by what users own or view. The one known exception is `market_history`, tied to the public `/industry/[id]` page.
7. [Proposed] No server cache (`'use cache'`, `'use cache: remote'`, `unstable_cache`, Upstash) holds private content in plaintext in new code. The ten existing private wrappers are removed when Parts 19 and 23 replace those reads.
8. [Proposed] Telemetry and feedback carry route patterns, never concrete paths or query strings. UTM tags are the exception.
9. [Proposed] Error fields and log lines carry codes from closed unions plus opaque row IDs. Never free text or response bodies, and never IDs taken from private content: map systems, locations, holdings or build sites. Public-data pipelines (SDE ingest, market sweep, statics) may log type and system IDs.
10. [Proposed] Per-object keys created for content (such as `observationKey`, connection IDs and signature IDs) never appear in readable rows of another store. Readable map, account and character IDs may address sealed rows.
11. [Proposed] ETags of small ESI bodies count as content.
12. [Proposed] A Phase 0 PR deletes the route, module or table it replaces, in the same PR or the next one. Because Convex functions and Drizzle migrations go live before the new Vercel deployment serves traffic, every route Convex calls changes in order across releases: add the new route, switch callers, then delete the old one. A table is dropped one release after its last writer is removed.
13. [Proposed] A phase that seals content does not ship until every Phase 0 PR whose "close by" names that phase has landed. Part 30 uses this as entry criteria.
14. [Proposed] On-demand market refresh only updates rows that already exist, and rejects type IDs outside the seeded marketable set.

## Assumptions

- **The statics and industry assets are as small as Part 24 estimates.** Check: Part 24's staging size check.
- **The access projection holds names for every pilot a viewer can see.** Check: `mapTrackingLive.forMap` against `mapAccess.characters`, which is optional in `convex/schema.ts`.
- **Nothing reads `wh_observations`.** Check: grep after removal, plus the Convex tests.
- **The seeded set covers every type the app prices.** Owned non-marketable types fall back to CCP's average as today. Check: net-worth snapshots on staging before and after.
- **The harvestable set fits in one or two refresh requests.** Check: count the site catalogue's live recipe types.
- **Convex does not log function arguments,** and Vercel request logs hold paths but not bodies. Check: provider docs and the dashboards.

## What users see

Nothing new. The owner sees route patterns in the admin traffic cards and in Linear feedback tickets.

## Questions for the owner

1. **Phase 0 scope.** Ship all eight Phase 0 PRs now, or only the four whose leak survives sealing (0-2, 0-6, 0-8, 0-9)? *Recommend all eight. They are small, and each one removes work from a later phase.*
2. **Leases until Phase 1.** Clean up only, or drop the table now and get a fresh token on every run? Getting a fresh token every time adds a Vercel call per character every few seconds. *Recommend clean up only.*
3. **Scanner prices.** Request the whole fixed harvestable set through the existing refresh route, or serve that set as a small whole asset? *Recommend the existing route with the fixed set. It is the smallest change, keeps timings, and with update-only write-behind it creates no rows.*
4. **Public guide pages in telemetry.** Use route patterns for `/sites/[id]` and `/changelog/[slug]` too, or keep their IDs? *Recommend patterns everywhere. One rule is simpler to enforce.*
5. **Existing telemetry rows.** Rewrite the existing 180 days of `usage_logs`, or let them age out? *Recommend rewrite once.*
6. **Private caches.** Remove the ten `'use cache'` wrappers in Phase 0, or when Parts 19 and 23 replace those reads? The entries sit in the memory of the same function that holds the keys and decrypts the rows, so early removal gains little and risks slower board and asset pages. *Recommend waiting. If you want it sooner, do `getCorpAssetSnapshot` alone, after staging timings.*
7. **AAD for env-key ciphertexts.** Bind today's token and snapshot ciphertexts to their rows, or leave them until the keys are destroyed? Without it, someone who can write the database could swap ciphertexts between rows. *Recommend leaving them: both keys are retired, and the token key goes at the end of Phase 1 under Part 30's recommendation.*
