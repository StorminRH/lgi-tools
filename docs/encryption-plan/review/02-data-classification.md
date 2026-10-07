# Part 02: Data classification and storage shapes

**Status:** Agreed 2026-10-07

## Owner review outcome (2026-10-07)

This section overrides the rest of the part where they disagree.

- **Question 1, session IP and user agent:** keep readable with today's retention.
- **Where map logic runs:** confirmed that "loads the map into memory" means the sealed service's memory on AWS, never the browser. The browser holds what it holds today (the rows it draws) and runs no map rules. The sealed service polls ESI over TLS that ends inside the enclave and writes sealed rows straight to Convex.
- **Signatures are readable.** A signature without its system protects nothing, so `mapSignatures` and `mapSignatureActivity` content stays readable. Systems stay sealed. Each signature carries a readable reference to its `mapSystems` row's random ID, never the EVE system ID, so Convex serves one system's signatures by index as today (`by_map_signature` keyed on the opaque system row ID). The browser no longer loads every live signature for the map. Details, including which signature fields could hint at the system (wormhole type codes, site names, connection links), are settled in Part 16.
- **Question 2, document shapes:** agreed. Shape D is one Neon row per owner *and* dataset (assets, blueprints, skills, jobs, each sheet section are separate rows), never one blob per character. All shape-D documents live in Neon; Convex keeps only map and location rows. Assets are the only dataset expected to grow large. At implementation, an agent run by the owner against production measures real per-owner asset sizes and extrapolates (2x, 3x, 100x); the owner then picks between one asset document per owner and keyed buckets by type ID (so the planner downloads only the buckets it needs). Sealed-service filtering on request is ruled out because page loads never wait on it.
- **Concurrent saves:** agreed. The version check is the database's standard conditional update, used on every sealed row; nothing beyond that is built.
- **Question 3, indexes: reversed.** Convex database I/O is the cost driver, so keep today's indexes and targeted reads. Where an indexed column becomes sealed, replace it with a keyed tag (HMAC under a per-map key held in the enclave) so the same index shape and the ported queries keep working. Signatures keep their indexes unchanged (readable, linked by the opaque system row ID), and `watchMapGlanceGroups` can stay as today because signatures are readable (Part 16 to confirm). The enclave map cache stays as an extra saving, not as the lookup method. Readable system tags on connections are accepted: the chain's shape is visible, system names and contents are not. Owner priority: wherever the services are touched, take the chance to make them run more efficiently.
- **Question 4, unused tables:** drop `mapNotes` and `saved_plans` with their code. Both are unfinished features the owner wants later (map notes are expected in a mapper; saved plans belong to the industry planner); they will be built sealed from the start. **`wh_observations` is kept, not dropped:** it is the owner's crowdsourced wormhole statics project, meant to replace the legacy Anoikis-derived statics dataset once enough users scan. It must be anonymous, and its collection is redesigned so it cannot be linked to a map, user or corp (this overrides the Drop rows elsewhere in this part and in Parts 04, 06 and 15).
- **`wh_observations` redesign (agreed):** the table becomes totals only: `(solar_system_id, wh_type_code, count)`. No time, no provenance, no dedupe key, no per-sighting rows. The owner draws a per-system distribution; the top types are the statics. The sealed service counts: each map connection carries a sealed "counted" flag, so a hole is counted once however many members jump or identify it; a retype moves its count from the old type to the new one. Increments are held in the sealed service and added once a day in one batch across all maps, so write times do not line up with any map's activity. Pending increments lost to a restart before the daily write are accepted. The readable `observationKey` on Convex rows goes away.
- **Question 5, merge jump time:** keep it, sealed. All jump and activity times are sealed (Readable timestamps below); the merge snapshot in `pending_tracking_merges` is one more copy and follows the same rule.
- **Question 6, whole-row rollback:** accepted as a user-experience limit, not a security risk. No anti-rollback machinery and no rollback guards are built; the owner does not plan rollbacks. Honest restores keep working because restored rows are genuine and still decrypt (old map key epochs are kept anyway for map history), and rows of deleted accounts stay unreadable after a restore because their keys are gone, with no extra code.
- **Question 7, corp structure rigs:** one sealed F row per structure, keeping today's `(corporationId, structure)` shape. `corporationId` stays readable; the structure ID becomes a keyed tag (like map system tags); rig list, tax rate and set time are sealed. Edits write one small row, so no retry loop is needed.
- **Hard rules adjusted by these outcomes:** rule 9 now reads "keep today's indexes; where an indexed column is sealed, replace it with a keyed tag computed in the enclave". Rule 12 now covers `mapNotes` and `saved_plans` only; `wh_observations` is kept as anonymous totals.

## In one paragraph

This part checks 06-data-classification.md against the code and fixes the storage rules later parts build on. Most of 06 stands. It changes five things: corp structure rigs become one sealed document per corp, so they need no blind index; `locationSync` leaves Convex entirely and the location ETags move inside the sealed location row; the jump timestamp in the account-merge payload becomes a sealed field; and the unused `mapNotes`, `saved_plans` and `wh_observations` tables are dropped. It settles three storage shapes: readable rows, rows with one sealed field, and one sealed document per owner whose readable version number takes over from today's guards. It says how sealed rows survive account merge and concurrent writes without users noticing. It sets the blind-index rule: use none unless a Convex or Neon query cannot work without one. Today the answer is none.

## How it works today

- Neon tables are exported from `src/composition/drizzle-schema.ts`; Convex tables are in `convex/schema.ts`. Content is plaintext, except Neon refresh and access tokens and corp asset snapshot bodies, encrypted with operator-readable env keys. Convex `characterLocationAccess` holds plaintext ESI access tokens (Part 04).
- Full-replace pulls differ by writer. Character `owned_assets` and `corp_structures` (primary key `(corporationId, structureId)`) are delete-then-insert on the neon-http `db`, no transaction; `owned_assets_natural_key_unique` turns overlapping refreshes into `superseded`. Blueprints, corp assets with `corp_holding_nodes`, and `corp_profiles` with `corp_member_bases` ("one authorization snapshot") each commit in one `directClient` transaction. Sheets, skills and both job tables are already one row per owner, written by upsert.
- Some writers merge into a shared row: `mergeSheetSection` (`sections || excluded.sections`, freshness by `jsonb_set`), `saveCharacterSkills` (queue or skills half alone) and `upsertCorpStructureRigs` (one structure, tri-state `taxPct`, untouched by the hourly replace).
- Account merge moves rows. `rekey` sets `userId` to the survivor (`account`, `session`, `custom_structures`, `industry_profiles`, `pending_tracking_merges`). `survivor-wins` drops collisions, then rekeys (`net_worth_days`, `user_preferences`). `follows-character` leaves rows under a `characterId` that moves (sheets, skills, assets, blueprints, character jobs, `corp_member_bases`). `corp_industry_jobs` moves as a custom pair.
- Convex map tables are indexed on content (`by_map_system`, `by_map_from`/`by_map_to`, `by_map_signature`, `by_map_live_group`, `by_tombstone_death_latest`); retention uses readable `purgeAfter` indexes. `watchMapGlanceGroups` returns deduplicated `(systemId, group)` pairs. The hourly ceiling collapse selects connections with `lifetime.latestAt <= now - 4h`.
- The server reads custom structures twice: `CustomStructuresContent.tsx` renders them with corp structures in the drawer, behind a "Loading custom structures" skeleton, and `/api/account/structures` runs `buildAvailableStructures` with SDE modifiers. The profile duplicate route copies documents on the server. `industry_profiles.revision` backs a CAS returning `stale_revision`. `/api/industry/owned-assets` returns only rows matching the planner's `typeIds`.
- Better Auth fills `session.ipAddress` and `session.userAgent`; nothing in `src/` reads them. Sessions are deleted one day after expiry (`SESSION_RETENTION_DAYS = 1`).
- `/api/preferences` checks each value with `validatePreferenceValue`. `industry.favoriteBlueprints` holds up to 24 `{typeId, name}` pairs; other keys are toggles, a profile ID or character IDs.
- On merge, `snapshotMergeTracking` copies selections with `lastProcessedTransitionAt` into `pending_tracking_merges`. The purge deletes untracked bookkeeping (`deleteBookkeepingIfUntracked`); `restoreTransitionStamp` writes the stamp back, so a processed transition cannot author a duplicate jump.
- `corp_member_roles` stores each character's ESI role arrays and `fetchedAt`. `corp-viewer.ts` reads it to build corp grants.
- `mapTracking` rows are `(mapId, userId, characterId)`, capped at 32 characters per user per map and 1,024 per map.
- `characterLocationApply.ts` writes `locationSync.coveredCharacterIds`, `characterLocation.etagLocation`/`etagShip` and `characterLocationOnline.etagOnline`.
- `wh_observations` is written only by the jump and elimination resolvers; its `dedupe_key` equals `mapConnections.observationKey`. `saved_plans` is referenced only by its own routes, `api-contract.ts` and its purge contributor. `mapNotes` has no UI; only the internal `insertNoteFixture`, `convex/mapFixtures.ts` and `convex/mapPurge.ts` touch it.

Files: `src/composition/drizzle-schema.ts`, `convex/schema.ts`, `src/lib/db-columns.ts`, `src/platform/purge/merge.ts`, the `purge.ts` contributors, the `queries.ts` writers in `src/features/{owned-assets,owned-blueprints,character-sheet,skill-queue,industry-jobs,owned-structures}/` and `src/data/corp-holdings/`, `src/features/industry-planner/profiles/queries.ts`, `src/app/(site)/industry/{CustomStructuresContent,layout}.tsx`, `src/app/api/account/{structures,industry-profiles/duplicate}/route.ts`, `src/app/api/industry/owned-assets/route.ts`, `src/app/api/preferences/route.ts`, `src/lib/preferences.ts`, `src/platform/auth/constants.ts`, `convex/{accountMerge,characterLocationPurge,mapTrackingTeardown,mapScan,mapAuthoringSweep,crons,characterLocationApply,mapFixtureNotes,mapPurge}.ts`.

## What changes

Only storage changes. Every table keeps its role. Content columns become sealed blobs, and some row sets fold into one document. Three dead tables go. Nothing visible changes for users.

## Design

### Three storage shapes

| Shape | Use when | Columns |
|---|---|---|
| **R: readable row** | Metadata, public data, queues, sync state | Unchanged |
| **F: sealed field** | The row is already the unit written, purged and merged; readable keys drive queries | Readable keys and timestamps, one `sealed` blob for all content, `key_id`, `version` |
| **D: sealed document per owner** | A set replaced or read whole per owner | One row per (owner, dataset): owner key, `sealed`, `key_id`, `version`, `updated_at` |

An existing revision column is the version: `industry_profiles.revision` keeps its CAS and `stale_revision` result. Other tables gain `version`. `name` moves out of `ownedRowIdentityColumns` into each table's sealed blob, for both `custom_structures` and `industry_profiles`.

Rules for **D**:
- A single-document write is one compare-and-swap: `UPDATE … SET sealed=$1, version=version+1 WHERE owner=… AND version=$expected`. The first write is `INSERT … ON CONFLICT DO NOTHING`.
- **Full-replace pulls** (assets, blueprints, structures, jobs): a lost CAS returns `superseded`, the result `owned_assets` gives today.
- **Personal ESI documents** (Part 18): the character sheet is one document per (character, section), each with a readable `last_refreshed_at`, and the public `profile` section stays a readable row. A section refresh writes only its own document, so refreshes of different sections never conflict. Section refreshes and skills half refreshes read, modify and compare-and-swap once; a lost CAS returns `superseded`, as for full-replace pulls.
- **Merge-style writes** (rig edits): the sealed service re-reads, merges, re-seals and retries the CAS, up to five times. Users never see `superseded`.
- **Sets committed together today** (corp assets with holding nodes, corp profile with member bases, chunks of one document): the sealed service keeps today's `directClient` transaction and does every write inside it. If any CAS misses, the transaction rolls back and returns `superseded`.
- Each feature keeps its own table, so purge contributors and `.fallowrc.json` boundaries stay. A shared `sealedDocumentColumns()` helper goes in `src/lib/db-columns.ts`.
- The document's owner must be the unit that purge, unlink and merge address. Where a purge removes one character from a corp set, use shape F per character, as for `corp_member_bases`.

### Associated data and keys

The envelope binds table, owner key, row ID and version as associated data (Part 09 sets the format). This detects rows moved between owners or tables, and mismatched version and ciphertext. It does not detect a whole row rolled back to an earlier valid state, for example by a Neon point-in-time restore. Recommendation: accept and state this limit; an operator can already destroy data.

Keys (Part 09): personal and user-authored data is sealed under the account's user key. Per-character ESI documents bind `characterId`, their stable owner, not `userId`. Corp documents use the corp key, which never leaves the enclave, and each viewer's filtered result is sealed to that viewer (Part 23). Map and location rows use the map key epoch. Tokens use the token key.

### Merge of sealed rows

Every merge rule that moves a sealed row runs through the sealed service, in the same merge job, sequenced by Part 11. It holds both user keys.

| Rule | Tables with sealed content | Sealed service action |
|---|---|---|
| `rekey` | `custom_structures`, `industry_profiles`, `pending_tracking_merges` | Re-seal under the survivor's user key with new associated data |
| `survivor-wins` | `net_worth_days`, `user_preferences` | Drop collisions as today, then re-seal the moved rows |
| `follows-character` | Sheets, skills, assets, blueprints, character jobs, `corp_member_bases` | Associated data is unchanged; re-wrap to the survivor's user key |
| custom pair | `corp_industry_jobs` | Re-seal the pair under the survivor |

`account` and `session` hold only token-key or readable data and rekey as today.

### Where content is read

The parts that own each read set its placement and record the reason for any browser step. This part adopts them in the data table below.

| Consumer | Owner | Placement |
|---|---|---|
| Board, character sheet, skills, slots and personal jobs reads | Part 19 | Workers build sealed views after each write; read routes serve ciphertext and never call the sealed service (Part 19 rule 5); the browser decrypts |
| Custom structure, profile and favourite writes | Part 20 | The browser seals and posts the blob to today's routes, not as a sealed request, so Part 07's 64 KiB cap does not apply. LGI checks only session, caps, envelope header and size, plus the existing profile revision CAS. The hull, rig and system checks are dropped. Saves keep working during a sealed-service outage |
| Profile duplicate | Part 20 | Route deleted; the browser opens the source and seals a copy through the create route |
| `/api/account/structures`, `buildAvailableStructures` | Parts 20, 21 | The browser runs it over decrypted custom structures, the decrypted `corp_structures` view and Part 24's public tables |
| Structures drawer first paint | Part 21 | The server renders the readable parts; rows decrypt in the browser behind today's "Loading custom structures" skeleton |
| `/api/industry/owned-assets`, `/api/industry/owned-blueprints` | Parts 21, 22 | Workers build whole `holding_index` and `blueprint_index` views; the browser filters them by type. Requests carry no type IDs. Corp-grant filtering runs in the workers (Part 23) |
| Glance groups | Part 16 | Sealed service keeps one sealed glance summary row per map, updated on each scan or identify edit. The browser keeps a small reactive payload. |

### Blind indexes

Default: no blind index unless a readable index must drive a Convex or Neon query that cannot instead load the owner's or map's sealed set and filter it in the sealed service.

| Index today | After | Blind index? |
|---|---|---|
| `by_map_system`, `by_map_from/to`, `by_map_signature` (signatures and activity) | The sealed service loads the map and searches in memory. Caps such as `COLLAPSE_MAP_SCAN_CAP = 128` keep this small. | No |
| `mapSignatures.by_map_live_group` | Sealed glance summary row | No |
| `mapConnections.by_tombstone_death_latest` | Readable `sweepAfter`, rounded down to the hour | No |
| `owned_assets_natural_key_unique` per-type lookup | The browser filters the decrypted `holding_index` view (Parts 21, 22) | No |
| `corp_structure_rigs` primary key | One sealed rig document per corp | No |
| `mapNotes.by_map_target` | Table dropped | No |

If one is ever needed: HMAC-SHA-256, truncated to 128 bits, under a per-map or per-corp index key derived and kept inside the enclave, so map key rotation does not force recomputing it.

### Readable timestamps

Readable: Convex `purgeAfter` (including the connection tombstone's), coarse `sweepAfter`, `mapEvents.at`/`kind`/`actor`/`purgeAfter`, `syncPresence` times. Neon `session.expiresAt`, every `*_syncs.lastRefreshedAt`, each sheet section document's `last_refreshed_at` (Part 18), document `updated_at`, `net_worth_days.day`/`recordedAt`, profile `updatedAt`/`deletedAt`, map lifecycle, queue and audit times.

Sealed: map row `deletedAt` and connection tombstone `kind`/`deletedAt`, which `purgeAfter` implies (Part 16), and anything that dates in-game activity, including `transitionObservedAt`, `observedAt`, `lastProcessedTransitionAt`, `mapSignatureActivity.lastSeenAt`, `firstSeenAt`, `seatOrderAt` and connection lifetimes. The sweep selects rows by `sweepAfter`, then re-checks the exact sealed `latestAt + CEILING_COLLAPSE_GRACE_MS` and skips rows not yet due. Collapse timing matches today.

ETags: readable only where the response body is too varied to guess from its ETag (asset and structure pages, skills, queue, jobs). Location, ship and online ETags are content: location and ship ETags go inside the sealed location row, and the online ETag stays in worker memory (Part 17).

### Settled rows

| Row | 06 said | This part |
|---|---|---|
| `session` IP, user agent | Readable | Confirm readable, today's retention |
| `user_preferences.industry.favoriteBlueprints` | Sealed value | Confirm. The browser seals and keeps the 24-item cap; LGI checks only envelope shape and size (Part 20). |
| `pending_tracking_merges` jump time | Optional | **Amend:** keep it, as a sealed field per selection under the map key. The sealed service snapshots and restores it in the merge job. `mapJumpBookkeeping` stays a sealed F row in Convex. |
| `corp_member_roles` | Readable | Confirm. The sealed service re-checks roles before releasing corp data (Part 23). |
| `mapTracking` | Readable | Confirm |
| `map_access` grant types | Character, corp or alliance grants | **Amend:** character and corporation grants only (`MAP_ACCESS_OWNER_TYPES` in `src/data/maps/access-contract.ts`); there are no alliance grants (Part 12) |
| Convex `deletedAt`, connection tombstone `kind`/`deletedAt` | Readable | **Amend:** sealed; readable `purgeAfter` implies them (Part 16) |
| `character_sheets` | Encrypt whole row; readable `characterId`, `lastRefreshedAt` | **Amend:** one shape-D document per (character, section) with readable `last_refreshed_at`; the public `profile` section stays a readable row (Part 18) |
| `locationSync.coveredCharacterIds` | Leaves Convex | **Amend:** drop the whole `locationSync` table when polling moves (Part 17). Coverage goes inside the sealed location row. |
| Location ETags | Content | **Amend:** `etagLocation` and `etagShip` go inside the sealed per-(map, character) location row; after a restart the workers rebuild them from it (Parts 04, 17) |
| `wh_observations` | Drop | Confirm. Drop both emitters too (Part 04). |
| `saved_plans` | Drop | Confirm. Drop the table, routes, contract entries, queries and purge contributor. |
| `mapNotes` | Encrypt fields | **Amend:** drop the table, `convex/mapFixtureNotes.ts`, the notes branch in `mapFixtures.ts` and the `mapPurge.ts` entry |
| `corp_structure_rigs` | Fields plus blind index | **Amend:** shape D, one rig document per corp, written merge-style. It survives the hourly structure replace because it is a separate document. |
| `esi_snapshots` | Re-key or drop | Default drop, with `owned_assets.snapshot_id` (Part 23) |

## Data: readable vs encrypted

| Data item (merge rule) | Stays readable on LGI servers | Encrypted | Where computed |
|---|---|---|---|
| `user`, `characters`, `session`, `verification`, `jwks`, `corp_member_roles`, `corp_structure_sharing`, `corp_access_audit`, `pending_deletions` | All (R) | — | LGI server |
| `account` (rekey) | IDs, scope, owner hash, health counters (F) | Tokens (token key) | Sealed service |
| `maps`, `map_access` (character and corporation grants only), `map_blocks`, `map_block_accounts`, `map_access_changes`, `tracking_receipt_cleanup` | All (R) | — | LGI server; access integrity in Part 12 |
| `pending_tracking_merges` (rekey) | IDs, map and character selections, `queuedAt` | Jump time per selection (map key) | Sealed service |
| `character_sheets` (follows-character) | `characterId`, section, version, `last_refreshed_at`, `updated_at` (D per section); the whole public `profile` section (R) | Eight non-profile sections | Sealed service; views per Part 19; browser decrypts |
| `character_skills`, `character_industry_jobs` (follows-character) | `characterId`, version, `updated_at` (D) | Body | Sealed service; views per Part 19; browser decrypts |
| `owned_assets`, `owned_blueprints` (follows-character) | Owner type and ID, version (D) | Holdings | Sealed service builds `holding_index` and `blueprint_index` views; the browser filters by type (Parts 21, 22) |
| `net_worth_days` (survivor-wins) | `userId`, `day`, pilot counts, `recordedAt` (F) | Values, per-pilot breakdown | Sealed service |
| `custom_structures` (rekey) | `id`, `userId`, `createdAt`, `version` (F) | `name` and body | Browser seals, opens and builds available structures (Parts 20, 21); LGI checks envelope shape and size; sealed service re-seals only for merge and migration |
| `industry_profiles` (rekey) | `id`, `userId`, `revision`, `createdAt`, `updatedAt`, `deletedAt` (F) | `name` and document | Browser seals, opens and duplicates (Part 20); LGI keeps the cap and revision CAS; sealed service re-seals only for merge and migration |
| `user_preferences` (survivor-wins) | Every key except one | `industry.favoriteBlueprints` value | Browser seals, opens and keeps the 24-item cap (Part 20); LGI checks envelope shape and size |
| `corp_structures`, `corp_holding_nodes`, `corp_structure_rigs` | `corporationId`, version (D per corp) | Body | Sealed service builds per-viewer views; browser decrypts and composes available structures (Part 21) |
| `corp_industry_jobs` (custom pair) | `userId`, `corporationId`, version (D) | Jobs | Sealed service |
| `corp_profiles` | `corporationId`, `hqStationId`, refresh time (F) | Division, container and structure names | Sealed service, one transaction with bases |
| `corp_member_bases` (follows-character) | `characterId`, `corporationId` (F) | `baseId` | Sealed service |
| `*_syncs`, `esi_refresh_jobs`, `domain_events`, `usage_logs`, `gsc_*` | All; error fields as codes (Part 04) | — | LGI server |
| Public data (SDE, market, indices, statics, sites) | All | — | LGI server |
| Convex `syncPresence`, `mapAccess`, watermarks, `mapTracking`, receipts | All (R) | — | LGI server |
| `mapSystems`, `mapConnections`, `mapSignatures`, `mapSignatureActivity`, `mapEvents`, `mapJumpBookkeeping`, glance summary | `mapId`, opaque IDs, retention fields listed above (F) | Everything else (map key) | Sealed service writes; browser decrypts |
| `characterLocation` per (map, character) | `mapId`, `characterId` | Location, ship, coverage, location and ship ETags | Sealed service writes; browser decrypts |
| `locationSync`, `characterLocationCovered`, `characterLocationOnline`, `characterLocationAccess`, `syncSubjects`, `characterOnline`, `mapNotes`, `saved_plans`, `wh_observations`, `esi_snapshots` | Dropped | — | — |

## Hard rules

1. [Agreed] Content is sealed and metadata stays readable, as in principle 2. No new table may store content columns in plaintext.
2. [Agreed] Logic that reads content runs in the sealed service. It runs in the browser only where the sealed service cannot do it, or the browser already does that work today (decrypt-only), with the reason recorded in the part.
3. [Proposed] Every sealed value uses one of shapes F or D. There are no ad hoc per-column ciphertexts.
4. [Proposed] Every sealed row has a readable version and `key_id`. An existing revision column is the version. Writes are compare-and-swap on it.
5. [Proposed] A document's owner is the unit that purge, unlink and merge address.
6. [Proposed] The envelope binds table, owner key, row ID and version as associated data. Per-character documents bind `characterId`.
7. [Proposed] Full-replace writes return `superseded` on a lost CAS. Merge-style writes retry inside the sealed service and never surface `superseded`. Sets committed together today stay in one transaction.
8. [Proposed] Every merge rule that moves a sealed row runs through the sealed service in the merge job, re-sealing or re-wrapping under the survivor's user key.
9. [Proposed] No blind index without a named Convex or Neon query that needs it, recorded in this part. Any blind-index key stays inside the enclave.
10. [Proposed] Timestamps of in-game activity are sealed. Retention and sweep times stay readable. `sweepAfter` is rounded down to the hour, and the sealed service re-checks the exact due time.
11. [Proposed] An ETag is readable only if its response body cannot practically be guessed from it.
12. [Proposed] `mapNotes`, `saved_plans`, `wh_observations` and their code are deleted, not encrypted.

## Assumptions

- **The largest corp asset document fits one Neon request and one enclave memory budget.** Check: measure the largest current `owned_assets` owner in production. If too large, split it into numbered chunks written in one transaction under one version.
- **No UI or job reads `saved_plans` or `mapNotes`.** Check: run Fallow after removal and search production logs for calls to the routes.
- **Under Option 1, the sealed service can hold one map's rows in memory for each edit.** Check: the Part 05 memory budget.
- **Decrypting the structures drawer adds no visible delay behind today's skeleton.** Check: time it on staging against today.
- **Five CAS retries are enough for merge-style writes.** Check: count retries in staging telemetry.
- **Readable pilot counts in `net_worth_days` reveal nothing beyond the linked characters LGI already knows.** Part 22 confirms.

## What users see

Nothing new. Favourite blueprints, profiles and custom structures load and save as they do today, in the same number of round trips. The structures drawer shows today's skeleton until its data is ready. Merges keep profiles, custom structures, favourites and net-worth history. Concurrent rig and sheet saves both land, as today.

## Questions for the owner

1. **Session IP and user agent: keep, stop collecting, or seal?** Recommend keep readable with today's one-day post-expiry retention. Nothing reads them, but that matches today.
2. **One sealed document per owner, chunked only if too large?** Recommend yes.
3. **Blind indexes only on demand, none at launch?** Recommend yes.
4. **Drop `mapNotes` now rather than encrypt it?** Recommend drop. A future notes feature would seal notes in the browser.
5. **Keep the merge jump timestamp as a sealed field rather than drop it?** Recommend yes. Dropping it would let a processed transition author a duplicate jump after a merge.
6. **Accept that whole-row rollback from a backup is not detected?** Recommend accept and state it. The alternative is a per-owner version high-water mark in the sealed service.
7. **Rigs: one document per corp with merge-style retries, or one F row per structure?** Recommend one document. Per-structure F rows with opaque IDs also need no blind index, since reads already load every rig for a corp.
