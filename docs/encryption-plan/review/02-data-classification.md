# Part 02: Data classification and storage shapes

**Status:** Draft for owner review

## In one paragraph

This part checks 06-data-classification.md against the code and fixes the storage rules later parts build on. Most of 06 stands. It changes five things: corp structure rigs become one sealed document per corp, so they need no blind index; `locationSync` and the location ETags leave Convex entirely; the jump timestamp leaves the account-merge payload; and the unused `mapNotes`, `saved_plans` and `wh_observations` tables are dropped. It settles three storage shapes: readable rows, rows with one sealed field, and one sealed document per owner whose readable version number takes over from today's unique-index guard. It sets the blind-index rule: use none unless a Convex or Neon query cannot work without one. Today the answer is none.

## How it works today

- Neon tables are the Drizzle schemas exported from `src/composition/drizzle-schema.ts`. Convex tables are in `convex/schema.ts`. Content is stored as plaintext. The exceptions are EVE tokens and corp asset snapshot bodies, which are encrypted with env keys that the operator can read.
- Owner sets (assets, blueprints, corp structures, holding nodes, job boards) are replaced in full on each ESI pull: delete, then insert, on the neon-http driver, which has no transactions. Only `owned_assets` has a guard. Its `owned_assets_natural_key_unique` index turns two overlapping refreshes into a unique violation, which the writer reports as `superseded`. `owned_blueprints` has only a non-unique owner index.
- Convex map tables are indexed on content: `by_map_system`, `by_map_from`/`by_map_to`, `by_map_signature`, `by_map_live_group` (on the signature group) and `by_tombstone_death_latest` (on `lifetime.latestAt`). Retention uses readable `purgeAfter` indexes.
- `session.ipAddress` and `session.userAgent` are filled in by Better Auth. Nothing in `src/` reads them. Housekeeping deletes a session one day after it expires (`SESSION_RETENTION_DAYS = 1`).
- Preferences load and save through `/api/preferences`, which checks each value with `validatePreferenceValue`. `industry.favoriteBlueprints` holds up to 24 `{typeId, name}` pairs. The other keys are UI toggles, a profile ID or character IDs.
- When accounts merge, `convex/accountMerge.ts` (`snapshotMergeTracking`) copies each tracking selection into `pending_tracking_merges`, including `lastProcessedTransitionAt` from `mapJumpBookkeeping`. `restoreTransitionStamp` writes it back afterwards.
- `corp_member_roles` stores each character's ESI role arrays and `fetchedAt`. `corp-viewer.ts` reads it to build corp grants.
- `mapTracking` rows are `(mapId, userId, characterId)`, capped at 32 characters per user per map and 1,024 per map.
- `characterLocationApply.ts` writes `locationSync.coveredCharacterIds`, `characterLocation.etagLocation`/`etagShip` and `characterLocationOnline.etagOnline`.
- `wh_observations` is written only by the jump and elimination resolvers. Its `dedupe_key` equals `mapConnections.observationKey`, so each row can be traced to a map.
- `saved_plans` has GET and POST routes plus delete, favourite and rename routes. Apart from those routes, only `api-contract.ts` and the purge contributor refer to it.
- `mapNotes` has no UI. It is written only by the internal `insertNoteFixture`, paged in `convex/mapFixtures.ts` and listed in `convex/mapPurge.ts`.
- `corp_structure_rigs` is keyed by `(corporationId, structureId)`. `corp_member_bases` is replaced per corp and purged per character (`follows-character`).

Files: `src/composition/drizzle-schema.ts`, `convex/schema.ts`, `src/features/owned-assets/schema.ts`, `src/db/auth-schema.ts`, `src/platform/auth/verification-retention.ts`, `src/lib/preferences.ts`, `src/app/api/preferences/route.ts`, `src/data/location-tracking/schema.ts`, `convex/accountMerge.ts`, `convex/characterLocationApply.ts`, `src/data/wh-observations/schema.ts`, `src/features/industry-planner/schema.ts`, `src/app/api/account/saved-plans/`, `convex/mapFixtureNotes.ts`, `convex/mapPurge.ts`, `src/lib/db-columns.ts`.

## What changes

Only storage changes. Every table keeps its role. Content columns become sealed blobs, and some row sets fold into one document. Three dead tables go. Nothing visible changes for users.

## Design

### Three storage shapes

| Shape | Use when | Columns |
|---|---|---|
| **R: readable row** | Metadata, public data, queues, sync state | Unchanged |
| **F: sealed field** | The row is already the unit that is written, purged and merged, and readable keys drive queries | Readable keys and timestamps, one `sealed` blob replacing all content columns, readable `key_id`, readable `version` |
| **D: sealed document per owner** | A set replaced in full per owner, or read whole per owner | One row per (owner, dataset): owner key, `sealed`, `key_id`, `version`, `updated_at` |

Rules for **D**:
- A write is a single compare-and-swap: `UPDATE … SET sealed=$1, version=version+1 WHERE owner=… AND version=$expected`. If no row matches, the writer returns `superseded`, the same result the unique index gives today. One statement needs no transaction.
- The first write is `INSERT … ON CONFLICT DO NOTHING`.
- Each feature keeps its own table, so purge contributors and the `.fallowrc.json` boundaries stay as they are. A shared `sealedDocumentColumns()` helper goes in `src/lib/db-columns.ts`, next to `ownerSyncStateColumns`.
- The document's owner must be the unit that purge, unlink and merge delete by. Where a purge removes one character from a corp set, keep shape F per character instead. This is why `corp_member_bases` stays per character.

The envelope binds table, owner key, row ID and version as associated data (Part 09 sets the format). A row copied to another owner or rolled back to an old version then fails to open.

Keys (Part 09): personal and user-authored data is sealed under the account's user key. Corp documents use the corp key, which never leaves the enclave, and each viewer's filtered result is sealed to that viewer (Part 23). Map and location rows use the map key epoch. Tokens use the token key.

### Blind indexes

Default: no blind index unless a readable index must drive a Convex or Neon query that cannot instead load the owner's or map's sealed set and filter it inside the sealed service or the browser. Checked against today's indexes:

| Index today | After | Blind index? |
|---|---|---|
| `mapSystems.by_map_system`, `mapConnections.by_map_from/to`, `mapSignatures.by_map_signature`, `mapSignatureActivity.by_map_signature` | The sealed service loads the map and searches in memory. Today's per-operation caps, such as `COLLAPSE_MAP_SCAN_CAP = 128`, keep this small. | No |
| `mapSignatures.by_map_live_group` | Glance groups are computed after decryption | No |
| `mapConnections.by_tombstone_death_latest` | Replaced by a readable `sweepAfter`, rounded up to the hour | No |
| `owned_assets_natural_key_unique` per-type lookup | Load the owner document and filter it | No |
| `corp_structure_rigs` primary key on `structureId` | One sealed rig document per corp | No |
| `mapNotes.by_map_target` | Table dropped | No |

If one is ever needed: HMAC-SHA-256 under an index key derived inside the enclave per map or per corp, truncated to 128 bits. The key never leaves the enclave, so map key rotation does not force recomputing the index.

### Readable timestamps

Readable: Convex `deletedAt`, `purgeAfter`, connection tombstone `kind`/`deletedAt`/`purgeAfter`, coarse `sweepAfter`, `mapEvents.at`/`kind`/`actor`/`purgeAfter`, and `syncPresence` times. Neon `session.expiresAt`, every `*_syncs.lastRefreshedAt`, document `updated_at`, `net_worth_days.day`/`recordedAt`, profile `updatedAt`/`deletedAt`, map lifecycle times, queue and audit times.

Sealed: anything that dates in-game activity, including `transitionObservedAt`, `observedAt`, `lastProcessedTransitionAt`, `mapSignatureActivity.lastSeenAt`, `firstSeenAt`, `seatOrderAt` and connection lifetimes.

ETags: readable only where the response body is too varied to guess from its ETag (asset and structure pages, skills, queue, jobs). Location, ship and online ETags are content.

### Settled rows

| Row | 06 said | This part |
|---|---|---|
| `session` IP, user agent | Readable | Confirm readable, today's retention |
| `user_preferences.industry.favoriteBlueprints` | Sealed value | Confirm. The browser seals and checks it. The server checks only envelope shape and a size cap. |
| `pending_tracking_merges` jump time | Optional | **Amend:** drop `lastProcessedTransitionAt` from `selections`. Jump bookkeeping is keyed by (map, character), so the sealed service keeps it across a merge (Part 11). |
| `corp_member_roles` | Readable | Confirm. The sealed service re-checks roles before releasing corp data (Part 23). |
| `mapTracking` | Readable | Confirm |
| `locationSync.coveredCharacterIds` | Leaves Convex | **Amend:** drop the whole `locationSync` table when polling moves (Part 17). Coverage goes inside the sealed location row. |
| Location ETags | Content | **Amend:** held in the sealed service's poller state, not in the per-map location row |
| `wh_observations` | Drop | Confirm. Drop both emitters too (Part 04). |
| `saved_plans` | Drop | Confirm. Drop the table, routes, contract entries, queries and purge contributor. |
| `mapNotes` | Encrypt fields | **Amend:** drop the table, `convex/mapFixtureNotes.ts`, the notes branch in `mapFixtures.ts` and the `mapPurge.ts` entry |
| `corp_structure_rigs` | Fields plus blind index | **Amend:** shape D, one rig document per corp. It survives the hourly structure replace because it is a separate document. |
| `esi_snapshots` | Re-key or drop | Default drop, with `owned_assets.snapshot_id` (Part 23) |

## Data: readable vs encrypted

| Data item | Stays readable on LGI servers | Encrypted | Where computed |
|---|---|---|---|
| `user`, `characters`, `session`, `verification`, `jwks`, `corp_member_roles`, `corp_structure_sharing`, `corp_access_audit`, `pending_deletions` | All (R) | — | LGI server |
| `account` | IDs, scope, owner hash, health counters (F) | Tokens (token key) | Sealed service |
| `maps`, `map_access`, `map_blocks`, `map_block_accounts`, `map_access_changes`, `tracking_receipt_cleanup` | All (R) | — | LGI server; access integrity in Part 12 |
| `pending_tracking_merges` | IDs, map and character selections, `queuedAt` | — (jump time removed) | LGI server |
| `character_sheets`, `character_skills`, `character_industry_jobs` | `characterId`, version, `updated_at` (D per character) | Body | Sealed service; browser decrypts |
| `owned_assets`, `owned_blueprints` | Owner type and ID, version (D per owner) | Holdings | Sealed service |
| `net_worth_days` | `userId`, `day`, pilot counts, `recordedAt` (F) | Values, per-pilot breakdown | Sealed service |
| `custom_structures`, `industry_profiles` | `id`, `userId`, `revision`, timestamps (F) | `name` and body | Browser; LGI stores blobs |
| `user_preferences` | Every key except one | `industry.favoriteBlueprints` value | Browser (decrypt only) |
| `corp_structures`, `corp_holding_nodes`, `corp_structure_rigs` | `corporationId`, version (D per corp) | Body | Sealed service |
| `corp_industry_jobs` | `userId`, `corporationId`, version (D) | Jobs | Sealed service |
| `corp_profiles` | `corporationId`, `hqStationId`, refresh time (F) | Division, container and structure names | Sealed service |
| `corp_member_bases` | `characterId`, `corporationId` (F) | `baseId` | Sealed service |
| `*_syncs`, `esi_refresh_jobs`, `domain_events`, `usage_logs`, `gsc_*` | All; error fields as codes (Part 04) | — | LGI server |
| Public data (SDE, market, indices, statics, sites) | All | — | LGI server |
| Convex `syncPresence`, `mapAccess`, watermarks, `mapTracking`, receipts | All (R) | — | LGI server |
| `mapSystems`, `mapConnections`, `mapSignatures`, `mapSignatureActivity`, `mapEvents`, `mapJumpBookkeeping` | `mapId`, opaque IDs, retention fields listed above (F) | Everything else (map key) | Sealed service writes; browser decrypts |
| `characterLocation` per (map, character) | `mapId`, `characterId` | Location, ship, coverage | Sealed service writes; browser decrypts |
| `locationSync`, `characterLocationCovered`, `characterLocationOnline`, `characterLocationAccess`, `syncSubjects`, `characterOnline`, `mapNotes`, `saved_plans`, `wh_observations`, `esi_snapshots` | Dropped | — | — |

## Hard rules

1. [Agreed] Content is sealed and metadata stays readable, as in principle 2. No new table may store content columns in plaintext.
2. [Agreed] Logic that reads content runs in the sealed service, or in the browser only where 06 or a later part says so.
3. [Proposed] Every sealed value uses one of shapes F or D. There are no ad hoc per-column ciphertexts.
4. [Proposed] Every sealed row has a readable `version` and `key_id`. Writes are compare-and-swap on `version`.
5. [Proposed] A document's owner is the unit that purge, unlink and merge delete by.
6. [Proposed] The envelope binds table, owner key, row ID and version as associated data.
7. [Proposed] No blind index without a named Convex or Neon query that needs it, recorded in this part. Any blind-index key stays inside the enclave.
8. [Proposed] Timestamps of in-game activity are sealed. Retention and sweep times stay readable, and `sweepAfter` is rounded up to the hour.
9. [Proposed] An ETag is readable only if its response body cannot practically be guessed from it.
10. [Proposed] `mapNotes`, `saved_plans`, `wh_observations` and their code are deleted, not encrypted.

## Assumptions

- **The largest corp asset document fits one Neon HTTP request and one enclave memory budget.** Check: measure the largest current `owned_assets` owner in production. If it is too large, split the document into numbered chunks that share one version.
- **No UI or job reads `saved_plans` or `mapNotes`.** Check: run Fallow after removal and search production logs for calls to the routes.
- **Under Option 1, the sealed service can hold one map's rows in memory for each edit.** Check: the Part 05 memory budget.
- **Readable pilot counts in `net_worth_days` reveal nothing beyond the linked characters LGI already knows.** Part 22 confirms.

## What users see

Nothing new. Favourite blueprints, profiles and custom structures load as they do today. The browser decrypts them after the same API calls.

## Questions for the owner

1. **Session IP and user agent: keep, stop collecting, or seal?** Recommend keep readable with today's one-day post-expiry retention. Nothing reads them, but that matches today.
2. **One sealed document per owner, chunked only if too large?** Recommend yes.
3. **Blind indexes only on demand, none at launch?** Recommend yes.
4. **Drop `mapNotes` now rather than encrypt it?** Recommend drop. A future notes feature would seal notes in the browser.
5. **Remove the jump timestamp from `pending_tracking_merges`?** Recommend yes, with the sealed service keeping jump bookkeeping across merges.
