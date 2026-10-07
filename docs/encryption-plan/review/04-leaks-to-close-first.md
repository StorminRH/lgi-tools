# Part 04: Leaks to close first

**Status:** Draft for owner review

## In one paragraph

06 lists ten leaks to fix whatever the final design looks like. This part splits them into two groups. The first group can close now, as small PRs to `development` that users never notice. This is Phase 0 (Part 30). The second group can only close once the sealed service exists, because the fix is to move a token or key into it. For each leak this part says what the code does today, what the fix is, which phase it lands in, and the latest release by which it must be closed. The aim is that no Phase 0 fix adds a dual path or a new screen, and every later fix has a named home in another part.

## How it works today

- **Token leases.** Every location run in a Convex action gets an EVE access token from `/api/internal/eve-token`. That route decrypts the stored refresh token on Vercel and refreshes it when needed. `finishSync` then stores the token in plaintext in `characterLocationAccess` (`accessToken`, `expiresAt`), so later runs can reuse it until CCP's expiry, which is about 20 minutes. Leases are deleted on an ESI 401 or 403, when a character drops out of the run, and on purge. They are not deleted when a user's tab goes cold, and nothing sweeps expired rows.
- **Env keys.** Refresh tokens (`EVE_TOKEN_ENCRYPTION_KEY`) and corp snapshot bodies (`ESI_SNAPSHOT_ENCRYPTION_KEY`) are AES-GCM under one environment key each, with no binding to the row. That protects against a stolen database. It does not protect against anyone who can read Vercel's environment.
- **Login.** Better Auth's `genericOAuth` callback on Vercel receives the refresh token in plaintext and encrypts it before storing it.
- **`wh_observations`.** Both resolvers write to it after Convex commits a jump or an elimination. Its `dedupe_key` is the same random value stored in `mapConnections.observationKey`. Only writers and test registries touch the table. Nothing reads it.
- **Per-ID public lookups.** The mapper and `mapStatics.fetchSystemStatics` fetch `/api/universe/statics/[systemId]`, which puts the system ID in the URL. The route already loads the whole promoted table and returns one row. `FriendlyList` posts the character IDs of pilots in the viewed system to `/api/eve/names`, and their ship types to `/api/eve/type-names`. The planner posts a system ID to `/api/industry/build-location` and lists of system IDs to `/api/industry/cost-indices`. The market refresh routes take up to 50 type IDs.
- **Market seeding.** `recordNetWorthSnapshot` calls `seedUnpricedTypes`, which inserts a placeholder `market_prices` row for every owned type that has no price yet. The daily sweep refreshes whatever rows exist.
- **Caches.** Ten private reads use `'use cache'`: corp holdings, character sheet, personal and corp jobs, personal and corp assets, blueprints, corp structures, skills and skill levels. `next.config.ts` sets no `cacheHandlers`, so these use Next's in-memory store on each Vercel instance.
- **Telemetry and feedback.** `page_view` stores `pathname` and the full query string. That includes `/industry/[id]` and `?map=`. `usage_logs` keeps the character ID for 180 days, and the admin traffic cards group rows by `path`. The feedback form shows the user `pathname + search`, and the route sends that path, with the author's name, to Linear.
- **Location ETags and timing.** `characterLocation.etagLocation` and `etagShip`, and `characterLocationOnline.etagOnline`, sit next to plaintext locations. `characterLocationApply.ts` writes only when something changes.
- **Error fields and logs.** `syncError` and `lastErrorCode` are typed as free strings, although today they hold codes (`needs_role`, `worker_interrupted`, `budget_deferred`). Location sync failures log `error.message`. `mapStatics` skip lines log `mapId` with `systemId`. `errorCode()` falls back to `error.message`. The resolvers log the raw `cause`.

Files: `convex/characterLocationAccess.ts`, `convex/characterLocationSync.ts`, `convex/characterLocationApply.ts`, `convex/lib/characterSync.ts`, `convex/lib/locationCaches.ts`, `src/app/api/internal/eve-token/route.ts`, `src/platform/auth/token-crypto.ts`, `src/platform/auth/auth.ts`, `src/data/esi-snapshots/crypto.ts`, `src/data/wh-observations/*`, `src/composition/jump-resolver/resolver.ts`, `src/composition/signature-elimination/resolver.ts`, `src/data/wh-statics/client.ts`, `src/app/api/universe/statics/[systemId]/route.ts`, `convex/mapStatics.ts`, `src/mapper/windows/SystemIntelligenceBody.tsx`, `src/app/api/industry/{build-location,cost-indices}/route.ts`, `src/app/api/market-{prices,history}/refresh/route.ts`, `src/composition/board/{board-view,price-book}.ts`, `src/data/market-prices/ingest.ts`, `src/features/*/queries.ts`, `src/data/corp-holdings/queries.ts`, `src/components/telemetry/page-view-metadata.ts`, `src/components/composition/TelemetryReporter.tsx`, `src/app/api/feedback/route.ts`, `convex/lib/errorCode.ts`.

## What changes

Nothing visible to users. Two things change for the owner only. The admin traffic cards group pages by route pattern. Feedback tickets in Linear show the route pattern instead of the full path.

Several of these leaks add little today, because the same content already sits in plaintext in Convex or Neon. Fixing them still matters, because each one would outlive the sealing of that content. Each fix therefore has a "close by" phase: the phase that seals the related content.

## Design

### Phase 0 PRs (each small, each to `development`, in this order)

| PR | Leak | Change | Close by |
|---|---|---|---|
| 0-1 | Leases (1) | Delete a user's leases in `finishSync`'s cold branch. Add an expired-lease sweep to an existing Convex cron. Add a test that no log line, error or telemetry event contains a lease. No shorter cap: CCP's token lifetime is fixed, so a cap only adds vend calls. | Phase 1 removes the table |
| 0-2 | `wh_observations` (4) | Remove emission from both resolvers. Delete `src/data/wh-observations`. Add a migration that drops the table. Then stop stamping `observationKey` and clear it from `mapConnections` (`lib/observationKey.ts`, `lib/mapScanApply.ts`, `mapJumpAuthoring.ts`, `mapAuthoringFields.ts`). | Phase 0 |
| 0-3 | Statics per system (5) | Add `/api/universe/assets/[version]/statics`, versioned by the promoted `feedVersion` and served like the wormholes asset. The mapper client and `mapStatics` read the whole table. Delete the per-system route. | Phase 2 |
| 0-4 | Industry lookups (5) | Ship cost indices, adjusted prices and NPC stations as whole versioned assets, refreshed by the daily batch. The planner computes the build location locally. Delete both routes. | Phase 3 |
| 0-5 | Names (5) | Return tracked pilots' names with presence, from the readable access projection (`mapClaimCharactersValidator` already carries the name). Ship ship-type names as a whole asset. `/api/eve/names` stays for corp job installers until Part 23 seals corp jobs. | Phase 1, because location polling seals presence |
| 0-6 | Market seeding (6) | The daily batch seeds every published, marketable SDE type. Remove `seedUnpricedTypes` from `recordNetWorthSnapshot`. On-demand refresh then only updates rows that already exist. | Phase 3 |
| 0-7 | Caches (7) | Remove `'use cache'` from the ten private reads. Keep the cache tags where they still drive revalidation of public data. Compare page timings on staging before and after. | Phase 3 |
| 0-8 | Telemetry and feedback (8) | Map the path to its route pattern with one shared normaliser (`/industry/[id]`, `/sites/[id]`, `/changelog/[slug]`). Store no `search` beyond the existing `utm` field. Normalise the feedback path on the server, leaving the form unchanged. Rewrite existing `usage_logs` rows once. | Phase 0 |
| 0-9 | Errors and logs (10) | Make `syncError`, `lastErrorCode` and location sync errors closed unions. `errorCode()` returns `unexpected:<name>` and never a message. Drop `mapId` and `systemId` from statics skip lines. Resolvers log codes only. | Phase 0 |

### Closes only with the sealed service

| Leak | Why it waits | Closes in |
|---|---|---|
| Lease table, and Convex and Vercel seeing access tokens | Something must poll ESI with a token. Today that is Convex, fed by Vercel. | Phase 1: polling moves into the workers (Part 17), then the table and the eve-token route are deleted |
| Refresh tokens at login (3) | The code exchange has to run somewhere that holds the client secret | Phase 1 (Part 08) |
| `EVE_TOKEN_ENCRYPTION_KEY` (2) | The enclave needs it once to re-seal stored tokens | Re-sealed in Phase 1 (Part 31); key destroyed in Phase 5 |
| `ESI_SNAPSHOT_ENCRYPTION_KEY` (2) | Corp snapshots are dropped for a sealed holding index | Phase 4 (Part 23); key destroyed in Phase 5 |
| Location ETags and write timing (9) | They only matter once locations stop being plaintext beside them | Phase 1: ETags go inside the sealed row; writing on change is kept (Part 17) |

No AAD retrofit is proposed for the env-key ciphertexts, because both keys are retired.

### Dropped from older docs

D-LIFE-6's "M1 hardening" framing, which tied these fixes to an export route and a rebuild. 01's suggestion to call ESI from the browser for names: principle 3 keeps that work on the server. 01's third-party-scripts item moves to Part 26. Server jobs that read map contents move to Parts 15 and 16.

### Risks

- Removing the caches may slow board and asset pages. PR 0-7 must show staging timings within today's range.
- Seeding every marketable type grows `market_prices`. It also moves the sweep onto the bulk region-order path (`BULK_THRESHOLD` is 100). Check the ESI budget for the daily batch.
- The statics asset changes when the feed is promoted. Clients must refetch on a version change, as they already do for universe assets.

### Testing

Each PR keeps today's tests green and adds its own. A lease-cleanup test on cold-off. A guard that the table and both emitters are gone. Route tests for each new asset and its version 404. Planner tests that the asset-computed build location matches today's route output for fixed fixtures. A seeding test from SDE fixtures. A normaliser test over every dynamic route. Type-level tests for the error unions. The Playwright smoke journeys must pass unchanged. `pnpm check` runs on every PR and `pnpm verify` before promote, with zero Fallow findings.

## Data: readable vs encrypted

| Data item | Stays readable on LGI servers | Encrypted | Where computed |
|---|---|---|---|
| `characterLocationAccess` | No: interim cleanup, dropped in Phase 1 | Never stored | Sealed service (Phase 1) |
| Refresh tokens | No | Sealed under the token key from Phase 1 | Sealed service |
| `wh_observations`, `observationKey` | Dropped | — | Not needed |
| Wormhole statics table | Yes, as a whole asset | — | LGI server; read in browser and map logic |
| Cost indices, adjusted prices, NPC stations | Yes, as whole assets | — | LGI server; planner in browser |
| Tracked pilots' names | Yes (projection metadata) | — | LGI server (Convex) |
| Ship type names | Yes, as a whole asset | — | LGI server |
| `market_prices` row set | Yes, all marketable types | — | LGI server |
| Private reads in `'use cache'` | Not cached | — | LGI server today; Parts 19 and 23 later |
| `usage_logs` path and feedback path | Route pattern only | — | LGI server |
| Location ETags | No | Inside the sealed location row | Sealed service |
| Location write times | Yes (accepted, Part 17) | — | Sealed service writes |
| Error fields and log lines | Codes and opaque IDs only | — | LGI server and sealed service |

## Hard rules

1. [Agreed] No Phase 0 change is visible to users. Same pages, flows and timings.
2. [Agreed] Each fix lands through `development` → `staging` → `main`, with `pnpm check` and `pnpm verify` at zero Fallow findings.
3. [Proposed] Never log, return in an error, or record in telemetry any token, lease, key or ESI response body.
4. [Proposed] Until Phase 1, a lease exists only while the user's tab is warm. After Phase 1, no EVE token is stored outside the sealed service.
5. [Proposed] Public data that private content selects is served as whole versioned assets, never looked up by the content's system, type, character or structure IDs. The listed exceptions are the `/industry/[id]` page URL (accepted), `/api/eve/names` for corp installers until Phase 4, and the market refresh routes if the owner keeps them.
6. [Proposed] No public table may be shaped by what users own or view.
7. [Proposed] No server cache (`'use cache'`, `'use cache: remote'`, `unstable_cache`, Upstash) holds private content in plaintext.
8. [Proposed] Telemetry and feedback carry route patterns, never concrete paths or query strings. UTM tags are the exception.
9. [Proposed] Error fields and log lines carry codes from closed unions plus opaque row IDs. Never free text, response bodies, or system, type or location IDs.
10. [Proposed] No random key may link a readable row to a sealed one across stores.
11. [Proposed] ETags of small ESI bodies count as content.
12. [Proposed] A Phase 0 PR deletes the route, module or table it replaces, in the same PR or the next one.

## Assumptions

- **Removing the in-memory caches costs little,** because serverless instances rarely reuse entries. Check: staging timings before and after PR 0-7.
- **The statics, cost-index, adjusted-price and station tables are small** (tens to low hundreds of KB gzipped). Check: row counts and response sizes on staging.
- **The access projection holds names for every pilot a viewer can see.** Check: `mapTrackingLive.forMap` against `mapAccess.characters`.
- **Nothing reads `wh_observations` or needs `observationKey` for anything else.** Check: grep after removal, plus the Convex tests.
- **The ESI budget covers a bulk sweep of all marketable types.** Check: one daily batch on staging.
- **Convex does not log function arguments,** and Vercel request logs hold paths but not bodies. Check: provider docs and the dashboards.

## What users see

Nothing new. The owner sees route patterns in the admin traffic cards and in Linear feedback tickets.

## Questions for the owner

1. **Phase 0 scope.** Ship all nine PRs now, or only the four whose leak survives sealing (0-2, 0-6, 0-8, 0-9)? *Recommend all nine. They are small, and each one removes work from a later phase.*
2. **Leases until Phase 1.** Clean up only, or drop the table now and get a fresh token on every run? Getting a fresh token every time adds a Vercel call per character every few seconds. *Recommend clean up only.*
3. **Market refresh routes.** Keep them looking up by type ID, as a documented low-sensitivity exception, or serve a whole price asset? *Recommend keep. After PR 0-6 they reveal only what is being refreshed and when, not new rows.*
4. **Public guide pages in telemetry.** Use route patterns for `/sites/[id]` and `/changelog/[slug]` too, or keep their IDs? *Recommend patterns everywhere. One rule is simpler to enforce.*
5. **Existing telemetry rows.** Rewrite the existing 180 days of `usage_logs`, or let them age out? *Recommend rewrite once.*
