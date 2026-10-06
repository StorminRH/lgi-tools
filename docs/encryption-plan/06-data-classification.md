# Data classification and compute placement

**The rule:** metadata stays readable on LGI's servers. That covers who uses the app, which corporations, which maps exist, what they are called and who may open them. Content gets encrypted: map contents, character locations, assets, structures, industry data, corp holdings, user-authored documents and EVE tokens. Server work that reads content keeps running on the server side where possible: inside the sealed AWS service, not in the browser.

This document classifies every table in the current code. It is based on the Drizzle schemas exported from `src/composition/drizzle-schema.ts`, on `convex/schema.ts`, and on the code that reads and writes each table, as of branch `encryption-plan` on 2026-10-06. It follows the guiding principles and decisions in [README.md](README.md).

## How to read the tables

**Class**

- **Readable:** metadata. It stays in plaintext.
- **Encrypt fields:** the row stays, with keys and harmless timestamps readable and the listed fields sealed.
- **Encrypt whole row:** everything except the owner key, a row id and housekeeping timestamps is sealed. Usually this becomes one sealed document per owner.
- **Drop:** the table goes away, either because it is retired or because its job moves inside the sealed service.
- **Public data:** EVE or LGI reference data that anyone can get. It stays readable.

**Where the logic runs after encryption**

- **LGI server (unchanged):** Vercel, Neon or Convex, working only on readable fields or moving sealed blobs around without opening them.
- **Sealed AWS service:** the Nitro Enclave from decision 1. It already holds users' sealed keys and EVE refresh tokens.
- **Browser:** the user's tab.
- **Not needed:** the logic goes away.

**"Decrypt only"** means the browser already does the computation today and only has to decrypt what it receives. That adds no real load, so it is not counted as moving work to the browser.

**A recurring pattern.** Many tables are replaced as a whole set per owner on every ESI pull: `owned_assets`, `owned_blueprints`, `corp_structures`, `corp_holding_nodes` and the job tables. Encrypted, the simplest shape is **one sealed document per owner** in Neon, with a readable version number for concurrency. That version number replaces the unique index that guards concurrent refreshes today (`owned_assets_natural_key_unique`, see `src/features/owned-assets/schema.ts`). Where a row must be looked up by a content ID (a system, a structure, a signature), the readable column becomes a **blind index**: a keyed hash (HMAC) of the ID, under a per-map or per-corp key. LGI can match equal values within one map or corp, but cannot tell which system or structure they stand for, and cannot correlate them across maps.

## Neon (Postgres via Drizzle)

### Identity, auth and access

| Table | What it holds | Class | Fields to encrypt | Fields that stay readable | Server logic that reads the encrypted fields today | Where that logic runs after encryption | Notes |
|---|---|---|---|---|---|---|---|
| `characters` (`src/db/auth-schema.ts`) | Linked EVE characters: name, portrait, corp, alliance, faction | Readable | — | All | — | LGI server (unchanged) | All of it is public EVE data. Affiliation drives map access and corp grants. |
| `user` | LGI account: name, email, role, active character, deletion flag | Readable | — | All | — | LGI server (unchanged) | `role` is LGI's own admin role. |
| `session` | Better Auth sessions, including IP and user agent | Readable | — | All | — | LGI server (unchanged) | IP and user agent are metadata. Keep the existing retention (`SESSION_RETENTION_DAYS` in `src/platform/auth/constants.ts`). |
| `account` | EVE SSO link: tokens, scopes, owner hash, authorization health | Encrypt fields | `accessToken`, `refreshToken`, `idToken`: sealed so only the enclave can open them (KMS bound to the enclave fingerprint) | `accountId`, `providerId`, `userId`, `scope`, `ownerHash`, all `authorization*` and `refreshTokenInvalidGrant*` counters, timestamps | `src/platform/auth/eve-token-service.ts` (refresh and vend), `/api/internal/eve-token` (vends to Convex), `src/composition/character-authorization.ts` (daily re-check while the user is on the site), `src/composition/map-character-search.ts`, `src/composition/structure-search.ts`, `src/composition/sync/owner-sync-port.ts` (every ESI sync), `src/composition/account-lifecycle/owner-transfer.ts` (reads the owner hash out of the stored access token) | Sealed AWS service | Today the tokens are encrypted with one environment key, `EVE_TOKEN_ENCRYPTION_KEY` (`src/platform/auth/token-crypto.ts`), which operators can read. `owner-transfer.ts` should read the readable `ownerHash` column instead of decrypting the token. `password` is unused for EVE and stays null. |
| `verification` | Short-lived OAuth state | Readable | — | All | — | LGI server (unchanged) | Pruned by housekeeping. |
| `jwks` | LGI's signing keypair for the Convex JWT | Readable | — | All | — | LGI server (unchanged) | LGI's own key, not user content. Already encrypted under the app secret by Better Auth. |
| `corp_member_roles` | A character's corp roles from ESI | Readable | — | All | — | LGI server (unchanged) | These are access-list inputs, used to compile corp grants (`src/platform/auth/corp-visibility`). The enclave should fetch or verify them itself before it releases corp data (see open question 1). |
| `corp_structure_sharing` (`corpDataSharing`) | Whether a corp has turned on data sharing in LGI | Readable | — | All | — | LGI server (unchanged) | "Which corps use the app" is metadata. |
| `corp_access_audit` | Log of corp access decisions | Readable | — | All | — | LGI server (unchanged) | Retention: `CORP_ACCESS_AUDIT_RETENTION_DAYS`. |
| `pending_deletions` (`src/platform/auth/deletion-schema.ts`) | Queue of account and character purges | Readable | — | All | — | LGI server (unchanged) | |

### Maps (Neon side)

| Table | What it holds | Class | Fields to encrypt | Fields that stay readable | Server logic that reads the encrypted fields today | Where that logic runs after encryption | Notes |
|---|---|---|---|---|---|---|---|
| `maps` (`src/data/maps/schema.ts`) | Map record: owner, name, lifecycle | Readable | — | All, including `name` | — | LGI server (unchanged) | Map names are metadata by principle 2. |
| `map_access` | Access list: character, corp or alliance grants with roles | Readable | — | All | — | LGI server (unchanged) | Readable, but it is the gate for key release, so it needs integrity protection (open question 1). |
| `map_blocks`, `map_block_accounts` | Blocked characters and the accounts kept off the map | Readable | — | All | — | LGI server (unchanged) | Used by the decision 1 sale rule. |
| `map_access_changes` | Outbox for projecting access to Convex | Readable | — | All | — | LGI server (unchanged) | |
| `pending_tracking_merges` (`src/data/location-tracking/schema.ts`) | Tracking selections to restore after an account merge | Readable | — (optionally `selections[].lastProcessedTransitionAt`) | `userId`, `sourceUserId`, `selections` (map and character ids), `queuedAt` | `src/composition/account-lifecycle/tracking-merge-retry.ts` | LGI server (unchanged) | The jump timestamp in each selection is minor. Drop it from the merge payload once jump bookkeeping moves into the sealed service. |
| `tracking_receipt_cleanup` | Cursor for one cleanup task | Readable | — | All | — | LGI server (unchanged) | |

### Personal EVE data (synced from ESI)

| Table | What it holds | Class | Fields to encrypt | Fields that stay readable | Server logic that reads the encrypted fields today | Where that logic runs after encryption | Notes |
|---|---|---|---|---|---|---|---|
| `character_sheets` (`src/features/character-sheet/schema.ts`) | Location, ship, online, attributes, implants, clones, wallet, journal, orders, structures (`SheetSections` in `types.ts`) | Encrypt whole row | `sections` | `characterId`, `lastRefreshedAt` | `src/composition/sync/character-sheet-sync.ts` (writes), `src/composition/board/board-view.ts` (board) | Sealed AWS service | Wallet, journal, clones and current location are among the most sensitive data LGI holds. |
| `character_skills` (`src/features/skill-queue/schema.ts`) | Total SP, queue, skill levels | Encrypt whole row | `totalSp`, `unallocatedSp`, `queue`, `skillLevels` | `characterId` | `skills-sync.ts`, `board-view.ts`, `/api/industry/skill-levels`, `/api/industry/team-skill-levels`, `/api/account/industry-slots` | Sealed AWS service | |
| `character_skill_syncs` | Sync state and ETags | Readable | — | All | — | LGI server (unchanged) | ETags on large bodies only show *when* something changed. |
| `character_industry_jobs` (`src/features/industry-jobs/schema.ts`) | Active job board per character | Encrypt whole row | `jobs` | `characterId` | `industry-jobs-sync.ts`, `board-view.ts`, `/api/account/industry-jobs`, industry slots | Sealed AWS service | Jobs carry facility and location IDs. |
| `character_industry_job_syncs` | Sync state | Readable | — | All | — | LGI server (unchanged) | |
| `owned_assets` (`src/features/owned-assets/schema.ts`) | Aggregated assets: type, quantity, location, flag, per character or corp | Encrypt whole row (one sealed document per owner) | `typeId`, `quantity`, `locationId`, `locationFlag`, `locationType`, `snapshotId` | `ownerType`, `ownerId`, plus a new readable `version` | `owned-assets-sync.ts`, `src/features/owned-assets/queries.ts` (`getOwnedAssetMap`, `listCharacterAssetRows`, `getCorpAssetSnapshot`), `board-view.ts`, `/api/industry/owned-assets`, net worth | Sealed AWS service | A location ID ties a character or corp to a station or structure. Today the per-type lookup uses the unique index; after the change the enclave decrypts and filters. |
| `owned_asset_syncs` | Sync state, page ETags | Readable | — | All | — | LGI server (unchanged) | |
| `owned_blueprints` (`src/features/owned-blueprints/schema.ts`) | Blueprints with ME/TE, runs, location | Encrypt whole row (one sealed document per owner) | `itemId`, `typeId`, `materialEfficiency`, `timeEfficiency`, `runs`, `quantity`, `locationId`, `locationFlag` | `ownerType`, `ownerId` | `owned-blueprints-sync.ts`, `/api/industry/owned-blueprints` | Sealed AWS service | |
| `owned_blueprint_syncs` | Sync state | Readable | — | All | — | LGI server (unchanged) | |
| `net_worth_days` (`src/features/net-worth/schema.ts`) | Daily net worth per account, with a per-pilot breakdown | Encrypt fields | `netWorth`, `liquidIsk`, `pilots` | `userId`, `day`, `pilotsIncluded`, `pilotsTotal`, `recordedAt` | `src/composition/board/net-worth-nightly.ts`, `board-view.ts` (`recordNetWorthSnapshot`), `src/features/net-worth/valuation.ts` | Sealed AWS service | Pilot counts are harmless, since LGI already knows how many characters are linked. |

### User-authored documents

| Table | What it holds | Class | Fields to encrypt | Fields that stay readable | Server logic that reads the encrypted fields today | Where that logic runs after encryption | Notes |
|---|---|---|---|---|---|---|---|
| `custom_structures` (`src/features/custom-structures/schema.ts`) | Hand-built structure: name, type, rigs, home system, tax, typed bonuses | Encrypt whole row | `name`, `structureTypeId`, `rigTypeIds`, `systemId`, `taxPct`, `bonuses` | `id`, `userId`, `createdAt` | Save validation `rejectInvalidCustomStructure` (`save-boundary.ts`), `/api/account/custom-structures/parse-fit`, list, update and delete routes | Browser for validation and fit parsing; LGI server (unchanged) stores the blob | The planner already computes in the browser, so reads are decrypt-only. Server-side validation is not needed: a bad document only affects its own author. The per-user limit (`countCustomStructures`) still works on readable rows. |
| `industry_profiles` (`src/features/industry-planner/schema.ts`) | Production profiles | Encrypt fields | `name`, `document` | `id`, `userId`, `revision`, `createdAt`, `updatedAt`, `deletedAt` | `profiles/queries.ts`, `readStoredDocument`, duplicate and update routes | Browser for validation and upgrades of old document shapes; LGI server (unchanged) stores the blob | Profile names can reveal intent (for example "Keepstar build, 1DQ"). |
| `saved_plans` | Saved planner snapshots | Drop | (if kept: `name`, `blueprintTypeId`, `productTypeId`, `productName`, `snapshot`, `favorite`) | — | `saved-plans-queries.ts`, `/api/account/saved-plans/*` | Not needed | No UI calls these routes. Only `api-contract.ts` references the endpoints. |
| `user_preferences` (`src/data/preferences/schema.ts`) | UI preferences (keys in `src/lib/preferences.ts`) | Readable, with one exception | `value` when `key = 'industry.favoriteBlueprints'` | Everything else | — | Browser (decrypt only) | Favourite blueprints reveal industry interest. All other keys are UI toggles or character IDs. |

### Corp data

| Table | What it holds | Class | Fields to encrypt | Fields that stay readable | Server logic that reads the encrypted fields today | Where that logic runs after encryption | Notes |
|---|---|---|---|---|---|---|---|
| `corp_structures` (`src/features/owned-structures/schema.ts`) | A corp's Upwell structures: ID, type, system, security band, name | Encrypt whole row (one sealed document per corp) | `structureId`, `typeId`, `systemId`, `securityClass`, `name` | `corporationId` | `corp-structures-sync.ts`, `owned-structures/queries.ts`, `/api/account/corp-structures`, planner build lists | Sealed AWS service | A structure or system ID tied to a corp reveals where it lives, so even the IDs are content. |
| `corp_structure_syncs` | Sync state, page ETags | Readable | — | All | — | LGI server (unchanged) | |
| `corp_structure_rigs` | Authored rigs and tax per corp structure | Encrypt fields | `rigTypeIds`, `taxPct`; `structureId` becomes a blind index | `corporationId`, `setAt` | `/api/account/corp-structures/rigs`, `rig-validation.ts`, planner | Sealed AWS service | Must survive the hourly full replace, so it stays a separate row keyed by the blind structure ID. |
| `corp_industry_jobs` (`src/features/industry-jobs/schema.ts`) | Corp job board per viewer | Encrypt whole row | `jobs` | `userId`, `corporationId` | `corp-industry-jobs-sync.ts`, `/api/account/corp-industry-jobs` | Sealed AWS service | |
| `corp_industry_job_syncs` | Sync state | Readable | — (scrub `syncError` text of any IDs) | All | — | LGI server (unchanged) | |
| `corp_holding_nodes` (`src/data/corp-holdings/schema.ts`) | Holding index: containers, hangars, deliveries | Encrypt whole row (one sealed document per corp) | `itemId`, `kind`, `rootId`, `division`, `deliveries`, `containers` | `corporationId`, `refreshedAt` | `data/corp-holdings/queries.ts`, `placement.ts`, `corp-viewer.ts`, owned-assets visibility | Sealed AWS service | |
| `corp_profiles` | HQ station, division names, container and structure names | Encrypt fields | `divisionNames`, `containerNames`, `structureNames` | `corporationId`, `hqStationId`, `lastRefreshedAt` | `corp-context-sync.ts`, `labels.ts` | Sealed AWS service | `hqStationId` is public in ESI corporation info. |
| `corp_member_bases` | Each member's base from member tracking | Encrypt fields | `baseId` | `characterId`, `corporationId` | `readCorpMemberContext`, `corp-viewer.ts` | Sealed AWS service | A base is where a member lives. |
| `esi_snapshots` (`src/data/esi-snapshots/schema.ts`) | Raw corp asset pulls | Encrypt fields (re-key) | `bodyCiphertext`, re-sealed under a key only the enclave holds | `ownerType`, `ownerId`, `endpoint`, `requestHash`, `etag`, `responseHeaders`, `fetchedAt`, `sourceVersion` | `getCorpAssetSnapshot` in `owned-assets/queries.ts` (builds the holding index on read) | Sealed AWS service | Today the body is encrypted with `ESI_SNAPSHOT_ENCRYPTION_KEY`, which operators can read. Alternative: drop the table and store only the enclave-built index. |

### Operations and telemetry

| Table | What it holds | Class | Fields to encrypt | Fields that stay readable | Server logic that reads the encrypted fields today | Where that logic runs after encryption | Notes |
|---|---|---|---|---|---|---|---|
| `esi_refresh_jobs` (`src/data/esi-refresh-jobs/schema.ts`) | ESI sync queue | Readable | — | All | — | LGI server (unchanged) | The queue stays with LGI; only running a job moves into the enclave. |
| `domain_events` (`src/data/domain-events/schema.ts`) | Operational events (price runs, token state, job status) | Readable | — | All | — | LGI server (unchanged) | The metadata types (`types.ts`) hold only IDs, counts and outcomes. |
| `usage_logs` (`src/data/telemetry/schema.ts`) | Page views and capability events | Readable after a fix | — | All | — | LGI server (unchanged) | Page views store the full `path` and `search` with the character ID (`src/components/telemetry/page-view-metadata.ts`). See Leaks. |
| `gsc_search_analytics`, `gsc_sitemaps`, `gsc_url_inspection` (`src/data/gsc/schema.ts`) | LGI's own Google Search Console data | Readable | — | All | — | LGI server (unchanged) | |
| `wh_observations` (`src/data/wh-observations/schema.ts`) | Cross-map record of wormhole types seen per system per hour | Drop | — | — | Written by `src/composition/jump-resolver/resolver.ts` and `src/composition/signature-elimination/resolver.ts`; nothing reads it | Not needed | It is fed from private maps, and `dedupe_key` equals `mapConnections.observationKey`, so it links each row back to a specific map. See Leaks. |

### Public data

| Table | What it holds | Class | Notes |
|---|---|---|---|
| `eve_*`, `dgm_attribute_types`, `type_dogma`, `industry_*`, `blueprint_*` (`src/data/eve-data/schema.ts`) | SDE | Public data | |
| `market_prices`, `market_history`, `market_history_meta` | Jita prices and history | Public data | The set of rows is partly seeded from what users own (`seedUnpricedTypes` in `src/composition/board/price-book.ts`). See Leaks. |
| `industry_cost_indices`, `adjusted_prices` | ESI industry indices | Public data | |
| `wh_statics_snapshots`, `wh_system_statics` | Wormhole statics feed | Public data | |
| `sites`, `waves`, `npcs`, `site_resources`, `escalations` (`src/features/wormhole-sites/schema.ts`) | Curated site guide | Public data | |

For every public table, the server logic stays on the LGI server unchanged.

## Convex

| Table | What it holds | Class | Fields to encrypt | Fields that stay readable | Server logic that reads the encrypted fields today | Where that logic runs after encryption | Notes |
|---|---|---|---|---|---|---|---|
| `syncSubjects` | Retired sync state | Drop | — | — | `convex/engineSweep.ts` (garbage collection only) | Not needed | `SYNC_DATASET_HISTORY` in `src/lib/sync-engine.ts`. Already being drained. |
| `characterOnline` | Retired online cache | Drop | — | — | `convex/onlineStatus.ts` (drain and purge only) | Not needed | |
| `syncPresence` | Tab heartbeats per user | Readable | — | All | — | LGI server (unchanged) | This is what tells the enclave when to start and stop polling (5 min, 90 min hidden cut-off). |
| `locationSync` | Per-user poll schedule and generation | Readable for now; moves into the sealed service | `coveredCharacterIds` should leave Convex | `userId`, `runId`, `jobId`, `lastRunAt` | `convex/characterLocationApply.ts`, `lib/locationSchedule.ts` | Sealed AWS service (scheduler) | `coveredCharacterIds` is effectively "online in game right now". |
| `characterLocation` | Each character's system, station, structure, ship, previous system and ETags | Encrypt whole row; restructure per map | `solarSystemId`, `stationId`, `structureId`, `shipTypeId`, `prevSolarSystemId`, `prevFresh`, `transitionObservedAt`, `observedAt`, `etagLocation`, `etagShip` | `characterId`, plus `mapId` in the new per-map shape | `characterLocationApply.ts`, `mapTrackingLive.ts` (`forMap`), `mapJumpEvidence.ts`, collapse (`readTrackedPilotSystemIds`), `mapAuthoringSweep.ts` | Sealed AWS service writes; browser reads (decrypt only) | Decision 1: the enclave seals each update for the map's members, so store it as one row per (map, character) sealed to the map key. ESI ETags for small bodies may map directly to a system ID, so treat them as content. |
| `characterLocationCovered` | Which characters are being polled | Drop (state moves into the sealed service) | — | — | `lib/locationCoverage.ts`, `mapTrackingLive.coverage` | Sealed AWS service | Publish coverage inside the sealed per-map location row instead. |
| `characterLocationOnline` | In-game online flag, ETag and expiry | Drop (state moves into the sealed service) | — | — | `characterLocationApply.ts`, `src/data/location-tracking/online-probe.ts` | Sealed AWS service | Used for the poll's online gate. Nothing outside the poller needs it. |
| `characterLocationAccess` | **Plaintext ESI access tokens** leased to Convex | Drop | — | — | `characterLocationSync.ts`, `characterLocationAccess.ts` | Not needed (tokens stay in enclave memory) | The largest single leak in the current code. |
| `mapAccess` | Access projection: user, roles, trackable characters | Readable | — | All | — | LGI server (unchanged) | Projected from Neon by `convex/mapAccessProjection.ts`. |
| `mapAccessProjectionWatermarks` | Projection revision | Readable | — | All | — | LGI server (unchanged) | |
| `mapTracking` | Which characters are tracked on which map | Readable | — | All | — | LGI server (unchanged) | Membership-like metadata. Capacity checks (`lib/mapTrackingCapacity.ts`) stay as they are. |
| `mapSystems` | Systems on a map | Encrypt fields | `systemId` (sealed, plus a per-map blind index for lookups) | `mapId`, `deletedAt`, `purgeAfter` | Almost every map mutation (`mapScan.ts`, `mapAuthoring*.ts`, `mapStatics.ts`, `mapChainCleanup.ts`, `lib/mapSystemLookup.ts`) | Sealed AWS service (recommended) or browser | The row count shows map size. That is accepted metadata. |
| `mapConnections` | Wormhole links: endpoints, doors, signatures, type, mass, size, lifetime, resolution, static claim | Encrypt fields | `fromSystemId`, `toSystemId`, `from`, `to`, `massState`, `shipSize`, `identity`, `lifetime`, `resolution`, `observedMassKg`, `observedMassAtStateKg`, `observationKey`, `firstSeenAt`, `staticCode`, `seatOrderAt` | `mapId`, `tombstone` (kind, `deletedAt`, `purgeAfter`), a new readable coarse `sweepAfter` deadline | `lib/mapScanApply.ts`, `lib/mapScanElimination.ts`, `mapJumpAuthoring.ts`, `lib/mapStaticClaim.ts`, `mapAuthoringCollapse.ts`, `mapAuthoringSweep.ts`, `mapChainCleanup.ts`, `lib/mapConnectionLookup.ts` | Sealed AWS service (recommended) or browser | A readable `sweepAfter` (latest death time plus 4 h grace) lets the hourly Convex cron find due rows without reading the rest of the row. It shows that some connection expires then, but not where. |
| `mapSignatures` | Scanned signatures per system | Encrypt fields | `systemId`, `signatureId` (blind index), `kind`, `group`, `typeName`, `signalPct`, `wormholeTypeCode` | `mapId`, `deletedAt`, `purgeAfter` | `mapScan.ts` (`applyScan`, `identifySignature`, `watchSystemSignatures`, `watchMapGlanceGroups`), `lib/mapSignatures.ts`, elimination | Sealed AWS service (recommended) or browser | The `by_map_live_group` index on readable `group` goes away. Glance groups are computed after decryption. |
| `mapSignatureActivity` | Last time each signature was seen | Encrypt fields | `systemId`, `signatureId`, `lastSeenAt` | `mapId` | Scan apply (missing-signature logic) | Sealed AWS service (recommended) or browser | |
| `mapNotes` | Notes on the map, a system or a signature | Encrypt fields | `targetId` (blind index), `body` | `mapId`, `targetKind` | Note mutations | LGI server (unchanged) stores blobs; browser (decrypt only) | Notes have no server logic, so the browser can seal them directly in either mapper option. |
| `mapEvents` | 7-day event log and 24 h undo | Encrypt fields | `payload` (connection IDs, system IDs, signature IDs) | `mapId`, `at`, `kind`, `actor`, `purgeAfter` | Undo and restore (`mapAuthoringCollapse.restoreSeveredBranch`, `mapAuthoringTombstone`), `mapChainEvents.ts` | Sealed AWS service (recommended) or browser; retention purge on the LGI server (unchanged) | `actor` is a member name or "lifetime expiry", which is metadata. |
| `mapJumpBookkeeping` | Last processed jump per (map, character) | Encrypt fields, or move into the sealed service | `lastProcessedTransitionAt` | `mapId`, `characterId` | `mapJumpAuthoring.ts`, `mapJumpEvidence.ts` | Sealed AWS service | The timestamp is a jump time. |
| `accountMergeTrackingReceipts` | Idempotency receipts | Readable | — | All | — | LGI server (unchanged) | |

## Compute placement

### Every server job that reads content today

In each list below, *(a)* means keep on LGI's servers, *(b)* means run inside the sealed AWS service and *(c)* means run in the browser.

**Mapper (Convex)**

- **Scan apply and signature intents.** Files: `convex/mapScan.ts` (`applyScan`, `identifySignature`, `removeSignatures`, `restoreSignatures`, `linkStubToResolvedConnection`), `lib/mapScanApply.ts`, `mapScanState.ts`, `mapScanSelection.ts`. Today it reads signatures and connections by system and matches pasted rows. **(b)**.
- **Signature elimination.** Files: `lib/mapScanElimination.ts`, `mapScan.eliminationEvidence` and `applyEliminationDeductions`, and `src/composition/signature-elimination/resolver.ts` (runs on Vercel, called from `/api/maps/signature-elimination`). Today it reads a system's signatures, connections and statics. **(b)**, with the Vercel step folded into the enclave.
- **Jump authoring and the jump resolver.** Files: `convex/mapJumpAuthoring.ts`, `mapJumpIdentity.ts`, `mapJumpEvidence.ts`, `mapJumpReads.ts`, and `src/composition/jump-resolver/resolver.ts` with `src/data/maps/hole-matching.ts` and `movement-classification.ts`. Today the browser's `JumpDoorbellObserver.tsx` rings `/api/maps/jump`; Vercel reads Convex evidence, matches the jump, writes back, and emits `wh_observations`. **(b)**. The enclave's own location poller sees each transition first-hand, so it can author the jump directly with no doorbell and no Vercel hop.
- **Statics placeholders.** Files: `convex/mapStatics.ts`, `lib/mapStaticClaim.ts`. Today a Convex action fetches `/api/universe/statics/[systemId]` for every system added to a map. **(b)**. The enclave keeps the whole public statics table, a few hundred KB, in memory.
- **Sever, collapse and restore.** Files: `convex/mapAuthoringCollapse.ts`, `src/data/maps/chain-collapse`. Today it reads the graph and tracked pilots' systems. **(b)**.
- **Field setters, tombstones and home.** Files: `mapAuthoringFields.ts`, `mapAuthoringTombstone.ts`, `mapAuthoringHome.ts`. **(b)**, because the setters trigger elimination and validation.
- **Hourly lifetime collapse.** File: `mapAuthoringSweep.collapseExpiredConnections`. Finding due rows **(a)**: the Convex cron queries the readable `sweepAfter`. The collapse itself **(b)**: Convex hands the enclave the map and connection IDs.
- **Daily chain purge.** File: `mapChainCleanup.purgeExpiredChainTombstones`. Deleting expired tombstones by `purgeAfter` **(a)**. Settling removed connections whose two systems are still on the map **(b)**, because it asks a graph question.
- **Signature tombstone purge.** File: `mapScan.purgeExpiredSignatureTombstones`. **(a)**, since it works on `purgeAfter` only.
- **One-off migrations.** Files: `mapHallwayBackfill.ts`, `mapStatics.backfillStaticPlaceholders`, `mapChainCleanup.backfillChainRetention`. Not needed: finish them before the mapper moves to encryption.
- **Map read queries.** Files: `mapChain*.ts`, `watchSystemSignatures`, `watchMapGlanceGroups`, `mapTrackingLive.forMap` and `coverage`. **(a)** serves ciphertext rows reactively; the browser decrypts for display (decrypt only).
- **Access, tracking and lifecycle.** Files: `mapAccessProjection.ts`, `mapTrackingOptIn.ts`, `mapTrackingTeardown.ts`, `mapPurge.ts`, `accountMerge.ts`, `characterLocationPurge.ts`. **(a)**, readable fields only.

**Location tracking**

- **Location sync.** Files: `convex/characterLocationSync.ts`, `characterLocationApply.ts`, `characterLocationAccess.ts`, `lib/locationSchedule.ts`, plus token vending through `/api/internal/eve-token`. **(b)**, already agreed in decision 1. The heartbeat (`convex/engine.ts`) and `syncPresence` stay **(a)**.

**ESI data (Vercel)**

- **Login token exchange.** File: the Better Auth EVE callback, `src/platform/auth/auth.ts`. Today Vercel receives the refresh token in plaintext at every login. **(b)** for the code exchange and sealing of the token. LGI keeps creating the session from the verified identity **(a)**. Without this step, tokens are never truly hidden from LGI.
- **ESI sync jobs.** Files: `src/composition/sync/*` (`owned-assets-sync`, `owned-blueprints-sync`, `skills-sync`, `industry-jobs-sync`, `corp-industry-jobs-sync`, `corp-structures-sync`, `corp-context-sync`, `character-sheet-sync`), the worker `esi-refresh-worker.ts` and the `refresh*OnView` triggers. Claiming, scheduling and retry **(a)**, through `esi_refresh_jobs` and the drain cron. Fetching, projecting and sealing **(b)**: the enclave reads ESI with the sealed token, runs the existing projection code, and returns a sealed document plus readable sync state (ETags, timestamps) for LGI to store.
- **Token-bearing lookups that return metadata.** Files: `src/composition/character-authorization.ts` (daily scope and owner re-check) and `map-character-search.ts` (access-list typeahead). **(b)** as a thin ESI proxy. The results are scope health and character IDs, which are metadata, so they go back to the LGI server **(a)**.
- **Structure search.** File: `src/composition/structure-search.ts`. **(b)**. The results are structures the character can dock at, so they return sealed to the browser.
- **Affiliation refresh.** Public ESI, no token. **(a)**.

**Personal and corp reads (Vercel)**

- **Net worth revaluation.** Files: `src/composition/board/net-worth-nightly.ts`, `board-view.recordNetWorthSnapshot`, `src/features/net-worth/valuation.ts`. **(b)**. The enclave reads public prices from LGI and each account's sealed holdings, and writes a sealed day row. This keeps the chart filling in nightly, as it does today.
- **Board assembly.** Files: `src/composition/board/board-view.ts`, `board-assemble.ts`, `name-book.ts`, `price-book.ts`. **(b)**. The result returns sealed to the browser. `board-assemble.ts` is pure, so **(c)** is an easy fallback.
- **Corp visibility and the holding index.** Files: `src/platform/auth/corp-visibility` (`compileCorpGrant`), `src/composition/corp-viewer.ts`, `src/data/corp-holdings/placement.ts` (`buildHoldingIndex`), `owned-assets/queries.ts` (`visibleCorpAssetInputs`). Compiling the grant from readable roles and sharing state **(a)**, or re-checked in the enclave (open question 1). Building the index and filtering rows per viewer **(b)**. The browser must never receive corp rows beyond the viewer's grant, so this cannot be **(c)** without key buckets per hangar division.
- **Industry routes.** `/api/industry/owned-assets`, `owned-blueprints`, `skill-levels` and `team-skill-levels`; `/api/account/industry-slots`, `industry-jobs`, `corp-industry-jobs`, `corp-structures` and `structures`: **(b)** filters and returns sealed. Custom structures, profiles and preferences: **(a)** stores blobs, the browser does validation (decrypt only).
- **Custom structure fit parsing.** Route: `/api/account/custom-structures/parse-fit`. **(c)**. The input is typed in the browser and the parser is pure. Running it in the enclave would mean shipping SDE type data there for no benefit.
- **Market price seeding from owned types.** File: `price-book.seedUnpricedTypes`. **(a)**, changed to seed every published marketable type instead.
- **Housekeeping, retention and account purges.** Files: `src/composition/pipelines/housekeeping.ts`, `src/composition/purge/*`. **(a)**. They delete by readable keys.

### What option (b) means for the sealed service

Decision 1 already gives the enclave every user's keys and refresh tokens. Moving work into it therefore does **not** widen what it *could* read. What grows is everything else:

- **Code surface.** The enclave would carry the ESI client and owner-sync engine, every ESI projection, the mapper rule set (about 8k lines of Convex mutations plus the pure code in `src/data/maps`), statics and universe assets, valuation, corp visibility and board assembly. A bug in any of them runs next to the keys.
- **Fingerprint churn.** Every mapper or sync change means a new enclave build, a new published fingerprint and a new KMS release rule. The enclave becomes coupled to the normal development → staging → main cadence.
- **Plaintext in memory.** Active maps, recent locations and in-flight sync results sit decrypted inside the enclave. Nitro isolates that memory from the parent instance, but it is more than "keys only".
- **Availability.** With one instance, an enclave outage stops map edits, ESI syncs, tracking and key release together. Maps can stay readable from browsers that already hold the map key; edits cannot happen.
- **Size.** CPU and memory needs are small at current scale. Maps are capped near 128 systems and connections, so active map state is kilobytes. Network becomes the cost: Convex and Vercel call AWS for every map edit. A Nitro enclave also has no network of its own, so TLS to ESI, Convex and Neon must end *inside* the enclave and the parent instance only relays bytes.

**Recommendation:** build the sealed service as two images on the same instance.

- **Custody core:** keys, tokens, login exchange and attestation. It stays small and changes rarely.
- **Sealed workers:** mapper, ESI sync, valuation and corp reads. They ship with app releases.

The custody core releases keys only to worker builds whose fingerprints are on a published allowlist. This keeps the part that guards the KMS rule stable while the worker code moves quickly (open question 3).

### The mapper: sealed service or browsers?

**Option 1: map logic in the sealed service, Convex stores sealed state.**

- Convex keeps today's tables and reactive queries. Rows hold ciphertext plus the readable fields listed above. Mutations become thin, version-checked writes that only the enclave may call (a service credential), with reads open to members.
- Edits go from browser to enclave over an attested channel. The enclave loads the map (cached), runs today's mutation code ported onto a small storage interface in place of `ctx.db`, and writes sealed rows back to Convex. Browsers decrypt what Convex pushes.
- **For it:**
  - It keeps today's single-writer, serializable behaviour without new ordering or conflict machinery.
  - Most of the Convex mutation code ports almost unchanged.
  - Crons (lifetime collapse, chain settle) and statics keep running when nobody has the map open.
  - Jumps are authored by the same enclave that polls locations, so tracking with the tab hidden behaves exactly as today.
  - Browser load stays as it is now.
- **Against it:**
  - The enclave is on the path of every edit, with an extra network hop.
  - The enclave sees plaintext of every active map.
  - Mapper releases become enclave releases.
  - An enclave outage freezes editing.

**Option 2: map logic in browsers (the original Path A in 01-design-and-spec.md).**

- Every member's browser runs the rules as deterministic reducers over an ordered, sealed op log. Convex or a relay only orders ciphertext.
- **For it:**
  - The enclave stays small.
  - No server ever sees map plaintext.
  - Editing survives an enclave outage while keys are cached.
- **Against it:**
  - It is the largest rewrite in the plan: determinism rules, op ordering, rebase and a replay corpus.
  - Lifetime collapse and chain settling only happen when some member has the map open. Today the hourly cron does them, so this is a visible change whenever no one is looking.
  - Jump authoring needs a member's browser to be running.
  - Statics need public data shipped whole to every browser.
  - Load on low-end and mobile devices rises.
  - It fits principle 3 worst.

**Recommendation: Option 1.** It is what principles 1 and 3 ask for, it reuses the most code, and it matches decision 1, which already puts the location poller (the main input to the mapper's jump logic) in the enclave. Two things keep its trust cost down:

- Store rows per entity with readable `mapId`, opaque row IDs, tombstone and retention timestamps, and a coarse `sweepAfter`. Then all scheduling, retention and fan-out stays on Convex **(a)**, and the enclave is called only to do the actual work.
- Seal map notes in the browser, since they have no server logic.

The enclave holds a map's plaintext only while it handles an edit or a sweep, and need not keep it cached between calls if the owner prefers (open question 4).

## Leaks to close regardless

These are worth fixing whatever the final design, and most are small:

1. **Plaintext ESI access tokens in Convex.** `characterLocationAccess.accessToken`, vended by `/api/internal/eve-token` (`src/app/api/internal/eve-token/route.ts`). Delete the table once polling moves to the enclave. Until then, shorten lease lifetimes and never log the lease.
2. **Operator-readable token and snapshot encryption.** `EVE_TOKEN_ENCRYPTION_KEY` (`src/platform/auth/token-crypto.ts`) and `ESI_SNAPSHOT_ENCRYPTION_KEY` (`src/data/esi-snapshots/crypto.ts`) are single environment keys. They protect against a database leak, not against operators.
3. **Refresh tokens pass through Vercel at login.** The Better Auth callback receives them in plaintext. This only closes when the code exchange moves into the enclave.
4. **`wh_observations` links back to maps.** `dedupe_key` is the same random value stored in `mapConnections.observationKey`. Anyone with both stores can see which map saw which wormhole type in which system. Nothing reads the table. Drop it and stop the emission in both resolvers.
5. **Per-ID public lookups that reveal private interest:**
   - `/api/universe/statics/[systemId]` is called per system by the mapper (`src/data/wh-statics/client.ts`) and by Convex (`mapStatics.loadSystemStaticCodes`). The system ID is in the URL, so it also lands in Vercel request logs. Ship the whole statics table as a versioned asset, as `/api/universe/assets/[version]/*` already does for systems and wormholes.
   - `/api/eve/names` receives the character IDs of pilots in a viewed system (`src/mapper/windows/SystemIntelligenceBody.tsx`) and corp job installers. `/api/eve/type-names` receives the ship types of those pilots. Resolve names from a bulk dataset or call ESI directly from the browser.
   - `/api/industry/build-location` (a system ID) and `/api/industry/cost-indices` (a list of system IDs) reveal where a user builds. Ship the cost-index table whole.
   - `/api/market-prices/refresh` and `/api/market-history/refresh` reveal what a user is pricing. This is low sensitivity, but the same fix applies.
6. **Market rows seeded from holdings.** `seedUnpricedTypes` (`src/composition/board/price-book.ts`) adds a `market_prices` row for every owned type nobody has priced yet, so the table slowly reveals what LGI users own. Seed from the published marketable-type list instead.
7. **Server caches of private rows.** `'use cache'` with `cacheLife('hours')` wraps private reads such as `getOwnerAssetRows` and `getCorpAssetSnapshot` in `src/features/owned-assets/queries.ts`, which caches *decrypted* corp asset snapshots. Similar `'use cache'` wrappers sit in `src/features/character-sheet/queries.ts`, `skill-queue/queries.ts`, `industry-jobs/queries.ts`, `owned-blueprints/queries.ts`, `owned-structures/queries.ts` and `src/data/corp-holdings/queries.ts`. These caches hold plaintext outside Neon. Remove them for content tables now; after encryption they would only ever hold ciphertext.
8. **Telemetry with paths.** `page_view` stores the full path, the query string and the character ID (`TelemetryReporter.tsx`, `page-view-metadata.ts`). `/industry/[id]` records which blueprint a character is planning. Store the route pattern (`/industry/[id]`) and drop `search` apart from UTM tags. The feedback form also stores the page path (`src/app/api/feedback/route.ts`), so normalise it the same way.
9. **Location ETags and timing.** ETags of tiny ESI bodies (`characterLocation.etagLocation` and `etagShip`, `characterLocationOnline.etagOnline`) may map back to a system or ship. Treat them as content. Separately, when a sealed location row is rewritten tells LGI when a character jumped (open question 5).
10. **Free-text error fields and logs.** `corp_industry_job_syncs.syncError`, `esi_refresh_jobs.lastErrorCode` and the Convex `console.warn` lines in `characterLocationApply.ts` should carry codes, never response bodies or IDs from content.

## Open questions for the owner

1. **Integrity of readable access data.** Access lists, blocks and corp roles stay readable, as agreed. But they also decide who the enclave releases keys to, so an operator who edits `map_access` could add their own character and be admitted. Should owners silently sign access-list changes in the browser, with the enclave checking the signatures and fetching affiliation and roles from ESI itself? Users would notice nothing. The alternative is to accept this as a known limit of "operators can't read".
2. **Mapper placement.** Confirm Option 1 (map logic in the sealed service). The alternative is keeping the browser-reducer design from 01-design-and-spec.md.
3. **One enclave image or two.** Split "custody core" and "sealed workers" so the key-guarding code changes rarely, at the cost of a second build and attestation path?
4. **Map plaintext caching in the enclave.** Keep active maps decrypted in memory for speed, or decrypt per call and forget?
5. **Location write cadence.** Writing sealed locations only on change (cheap) reveals jump times to LGI. Writing on every poll tick hides them but costs Convex writes: roughly 20 to 40 per second at 200 tracked pilots. Accept the timing leak, or pay for constant-rate writes?
6. **Personal reads: enclave or browser.** For purely personal data (board, own assets, skills), keep the enclave on the read path as recommended, or let the browser decrypt sealed documents directly to keep the enclave off every page load?
7. **`esi_snapshots`.** Re-seal it under an enclave-held key, or drop it and store only the enclave-built holding index?
