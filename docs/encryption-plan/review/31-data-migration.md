# Part 31: Migrating existing data and retiring plaintext

**Status:** Draft for owner review

## In one paragraph

Existing plaintext becomes sealed feature by feature, on the server, with no user action. This part covers re-sealing stored EVE tokens, creating keys for every account (including users who never return), converting Neon and Convex rows with resumable jobs, and then removing plaintext: columns, tables, environment keys, history, backups, logs and caches. Part 30 sets the phases and switches; this part sets the conversion steps, the handling of history and backups, and the checklist proving nothing readable is left. One limit is permanent: copies taken before a feature retires (backups, env keys, logs) stay readable to whoever already holds them. Migration stops new exposure; it cannot undo old exposure.

## How it works today

- **Tokens.** The Better Auth hook `encryptAccountTokens` encrypts `accessToken` and `refreshToken` with AES-256-GCM under `EVE_TOKEN_ENCRYPTION_KEY`, stored as `v1:iv:tag:ciphertext`, with no binding to the row. Each refresh stores CCP's returned refresh token with a compare-and-swap on the old ciphertext. Purges decrypt to revoke at CCP.
- **Owner hash.** `account.owner_hash` arrived in `drizzle/0025_rare_shocker.sql`. For rows without it, `owner-transfer.ts` (`storedTokenOwnerHash`) decrypts the stored access token, reads the owner claim, and `backfillOwnerHash` fills the column lazily. For older rows with a dead refresh token, that stored JWT is the only owner evidence.
- **Location polling.** Convex leases plaintext ESI access tokens in `characterLocationAccess`, vended by `src/app/api/internal/eve-token/route.ts`. `characterLocationOnline` (online flag and ETag), `characterLocationCovered` and `locationSync.coveredCharacterIds` hold poller state. `pending_tracking_merges.selections[]` may carry `lastProcessedTransitionAt`, a jump time.
- **Corp snapshots.** `esi_snapshots.bodyCiphertext` uses the same envelope under `ESI_SNAPSHOT_ENCRYPTION_KEY`. `getCorpAssetSnapshot` reads `owned_assets` rows with `ownerType` `'corporation'` and decrypts snapshots to build the holding index.
- **Corp rows in personal tables.** `owned_assets` and `owned_blueprints` hold corporation rows beside character rows (`src/platform/owner-sync/corp.ts`, `blueprint-map.ts`).
- **Telemetry.** `usage_logs.metadata` stores the page `path` and `search` (`TelemetryReporter.tsx`, `page-view-metadata.ts`) next to `character_id`, for `USAGE_LOG_RETENTION_DAYS = 180`. Paths such as `/industry/[id]` reveal content. `corp_industry_job_syncs.sync_error` and `esi_refresh_jobs.last_error_code` may hold response text.
- **Required env.** Both keys are in `REQUIRED_ENV` (`src/lib/env.ts`), so every hosted build and local `.env.local` carries them.
- **Neon migrations.** Drizzle SQL files in `drizzle/` (0000 to 0079), applied by `src/scripts/migrate.ts` inside `convex deploy`, before `next build`, so a migration lands while the previous deployment still serves. Earlier files have dropped tables (`0009_drop_persisted_npc_stats.sql`).
- **Neon branches.** `neon.ts` sets compute for production (protected) and treats `staging` and `preview/staging` as standing preview branches; `scripts/apply-neon-config.ts` applies it. Nothing in code sets the history (restore) window or shows staging's parent branch.
- **Convex one-off jobs.** `backfillHallwayConnections` re-reads the first 32 rows per call, so it stalls once they are done; `backfillChainRetention` pages with a cursor. Convex checks stored documents against the schema on deploy.
- **Event references.** `mapEvents.payload` holds Convex connection IDs as strings (`mapEventPayloadValidator`), and undo depends on them.

Files: `src/platform/auth/{token-crypto,account-token-encryption,eve-token-service}.ts`, `src/composition/account-lifecycle/owner-transfer.ts`, `src/lib/{aes-gcm,env}.ts`, `src/data/esi-snapshots/crypto.ts`, `src/features/owned-assets/queries.ts`, `src/features/owned-blueprints/blueprint-map.ts`, `src/platform/owner-sync/corp.ts`, `src/data/telemetry/{schema,constants}.ts`, `src/components/composition/TelemetryReporter.tsx`, `src/data/location-tracking/schema.ts`, `src/app/api/internal/eve-token/route.ts`, `src/scripts/{migrate,vercel-convex-deploy}.ts`, `drizzle/`, `neon.ts`, `scripts/apply-neon-config.ts`, `convex/{mapHallwayBackfill,mapChainCleanup,mapStatics,schema}.ts`, `convex/lib/mapEntityContracts.ts`.

## What changes

Nothing visible changes for users; data reads back exactly as before. A map's edits pause for a few seconds while it converts, at a quiet moment in the 11:15 to 11:50 UTC window (Part 30). Behind the scenes: one conversion job per feature, a progress table, a verify step, and a retire sequence.

## Design

### The conversion job (shared by every feature)

Each feature gets one worker job, `convert:<feature>`, started by an owner admin action that adds a `sealedJobs` row (Part 07). The job:

1. Reads its cursor from a readable Neon table, `sealed_conversion_progress` (`feature`, `cursor`, `converted`, `skipped`, `failed`, `updated_at`).
2. Takes the next 32 rows or owners in key order, paging like `backfillChainRetention`, never from the start.
3. Per item: seals the plaintext (Part 09 envelope and AAD) and writes it with a compare-and-swap on the readable version. An item already sealed is skipped: a live write got there first.
4. Reopens the sealed value and compares a canonical digest with the plaintext.
5. Clears the plaintext with a compare-and-swap. A mismatch records `convert_mismatch`, keeps the plaintext and counts a failure.
6. Saves the cursor and schedules the next batch.

Each item's marker decides its format (Part 30): the per-map marker in Convex, the envelope version on Neon documents. An unconverted item keeps today's writes; once it reads sealed, only sealed writes are accepted. Re-running a finished job converts nothing. The owner's account and maps go first, everyone else the next day.

### Per feature

| Data | Phase | Source | Method | Done when |
|---|---|---|---|---|
| Telemetry and error text | 0 | `usage_logs.metadata`, `sync_error`, `last_error_code` | Owner-run script: rewrite stored `path` to route patterns, drop `search` except UTM tags, scrub error text to codes, then `VACUUM (FULL)` | No stored row has an ID in `path`, a `search` beyond UTM, or free error text |
| EVE tokens (`account`) | 1 | `refresh_token`, `access_token` in `v1` | Backfill owner hash first, then re-seal under the token key (below). Clear `access_token`, `id_token` and the expiry columns | No `v1:` in `account`; no null `owner_hash` where a stored access token existed. Columns dropped |
| Character-link record (Parts 08, 14) | 1 | `account` rows, the backfilled `owner_hash`, and the claim from the post-re-seal refresh | Seed one record per row; report rows where column and claim differ | One record per `account` row |
| Location poller state | 1 | `characterLocationAccess`, `/api/internal/eve-token`, `characterLocationOnline`, `characterLocationCovered`, `locationSync.coveredCharacterIds` | Nothing to convert: the state moves into the enclave (Part 17). Delete tables, field and route | Absent from `convex/schema.ts`, a Convex export and the route tree |
| User keys | 1 | `user` rows | Create a key record if missing (unique `kind`, `subject`, `epoch` makes it idempotent). No login needed | One per user |
| Token key | 1 | None | Create once per environment | Exists |
| Location rows | 1, 2 | Per-user `characterLocation` | No conversion: workers write today's rows in Phase 1; `mapCharacterLocation` fills on the next poll in Phase 2 (Part 17) | Old tables deleted |
| Map rows: systems, connections (with tombstones), signatures, signature activity, events, jump bookkeeping | 2 | Convex plaintext | Per map, below | Every map's marker reads sealed |
| `pending_tracking_merges.selections[]` | 2 | `lastProcessedTransitionAt` | Strip the field once jump bookkeeping lives in the enclave | No selection carries it |
| Personal ESI datasets (sheet, skills, jobs, assets, blueprints) | 3 | Rows with `owner_type = 'character'` only | Seal stored rows into the owner's document with `INSERT … ON CONFLICT DO NOTHING`, so a newer sealed sync wins. In the same Neon transaction, build and seal each character's `personal_views` (Part 19) from stored rows and public names, with no ESI. Delete the rows | No character rows; every converted owner has its views |
| `net_worth_days` | 3 | Fields per day | Fill `pilot_ids` from `pilots`, seal the values, clear the columns (Part 22); attach history to the views in the same transaction | Columns empty, then dropped |
| Profiles, custom structures, `industry.favoriteBlueprints` | 3 | Rows | Seal as stored, invalid values included, keeping `revision` (Part 20) | Columns empty |
| Corp keys | 4 | Corps with stored data | Create once per corp; idempotent like user keys | One per corp |
| Corp-owned `owned_assets`, `owned_blueprints` | 4 | Rows with `owner_type = 'corporation'` | Seal into corp documents under the corp key (Part 09) | No corporation rows remain |
| Corp structures, jobs, profile names, member bases, rigs | 4 | Rows | Seal stored rows. Rigs are user-written, so they must convert | Old columns, tables empty |
| Corp asset snapshots, holding index | 4 | `esi_snapshots`, `corp_holding_nodes` | Fresh corp pull by the workers; without a working token, convert the stored snapshot (below). Build the sealed holding index and per-viewer corp views in the same transaction | Both tables dropped; every corp has its index and views |
| `wh_observations`, `saved_plans`, `mapNotes` | 0 and 2 | None | Dropped with no conversion (Parts 02 and 04) | Tables gone |

### Re-sealing tokens

1. **Precondition.** Part 08's enclave login exchange is live, so no new `v1` rows appear.
2. **Add.** Custody gains a migration-only operation, `tokens.reseal`. The owner sends `EVE_TOKEN_ENCRYPTION_KEY` in a sealed request to the attested key (Part 07); the enclave keeps it in memory for the run only. This adds no exposure: the operator can already read it.
3. **Switch.** Vercel stops all token use in the same release (Part 30). Only `tokens.reseal` reads `v1`. Ordinary workers reject `v1` values; one found after the job reports done raises an alert and is not used.
4. **Owner evidence.** Where `owner_hash` is null, the job decrypts the `v1` access token, verifies its CCP signature against the SSO JWKS (ignoring expiry), and backfills `owner_hash` and the link record before clearing `access_token`.
5. **Convert.** The job re-seals each `v1` refresh token with today's compare-and-swap on the old ciphertext.
6. **Refresh once.** Workers force one refresh per character, spread over the window. The stored token then never crossed Vercel, and the CCP-signed claim confirms the link record.
7. **Retire.** The next image drops `tokens.reseal`. `EVE_TOKEN_ENCRYPTION_KEY` is destroyed once Phase 1 retires and the forced refresh has run.

Corp snapshots without a working token use the same one-time pattern with `ESI_SNAPSHOT_ENCRYPTION_KEY` in Phase 4: only that operation reads `v1` bodies, and the key is destroyed once Phase 4 retires.

### Converting one map

The mapper switch is per map. An unconverted map keeps today's plaintext writes until its marker reads sealed; today's mutations refuse sealed-marked maps (Part 30).

1. Before Phase 2, the three one-off Convex backfills are finished and deleted (Part 16) and the character-scoping backfill is empty (Part 12).
2. Inside the window, the job picks a moment when no member has a heartbeat in `syncPresence` and no tracked character on the map has moved recently. It falls back to the window's end.
3. It sets the map's readable marker to `converting`. Requests for the map wait; the hourly collapse and daily purge skip it.
4. It creates map key epoch 0 and signs the access-list genesis from current rows (Part 12).
5. It seals each plaintext row in place, in batches. A converted row keeps its existing Convex `_id` string as its `rowKey` (opaque, no content), so event payloads, open tabs and the 24-hour undo stay valid with no rewrite. Only rows created later get enclave-made keys.
6. It writes `mapHeads` with the digest (Part 16) and marks the map sealed. Waiting requests run.

A job that dies resumes from the marker. The map stays paused until then, so the enclave resumes `converting` maps first at boot.

### Retiring plaintext (per feature, after Part 30's soak)

| Step | Release | Detail |
|---|---|---|
| 1 | Retire code | Remove dual-read and the plaintext ports. Delete `token-crypto.ts`, `account-token-encryption.ts`, `esi-snapshots/crypto.ts`, and `aes-gcm.ts` once nothing uses `v1` |
| 2 | Next release | A Drizzle migration drops the columns and tables. It must ship after step 1, because migrations run while the old deployment still serves |
| 3 | Same day | An owner-run script runs `VACUUM (FULL)` on each affected table: a dropped column stays in the pages until they are rewritten, and `VACUUM` cannot run inside the migrator's transaction |
| 4 | Retire code | Remove plaintext fields and old tables from `convex/schema.ts`. Convex refuses the deploy while any row still has them: a free check |
| 5 | Phase 1 retire (token key), Phase 4 retire (snapshot key) | Destroy the env key: every Vercel environment, `REQUIRED_ENV`, local and cloud-session env files, any password manager. Record the date. Part 09's "both retire in Phase 5" needs the same change |
| 6 | Wait | Let Neon history and Convex backups age out. Delete Neon branches created before the retire release, and Convex backups and local exports from before conversion |

**Staging.** Staging is never branched from production after Phase 1. Its existing branch, which may hold a production copy, is deleted, not re-created. A fresh staging branch is built from the schema plus seeded test accounts and maps, then converted by the staging enclave through the same jobs. That run is also the rehearsal.

### Verification checklist

Run on staging, then production, at the end of each feature (scoped to that feature's tables) and again over everything in Phase 5:

- [ ] SQL: zero non-null plaintext columns in the feature's tables. No `v1:` in `account` after Phase 1; none anywhere after Phase 4. `information_schema` shows none of 06's plaintext column names.
- [ ] Convex: zero map rows without the sealed marker. `characterLocationAccess`, `characterLocationOnline`, `characterLocationCovered` and `locationSync.coveredCharacterIds` absent from `convex/schema.ts` and a Convex export; `/api/internal/eve-token` gone.
- [ ] Tokens: no `eyJ` value in any Convex table or Neon column; no null `owner_hash` where a stored access token existed.
- [ ] Views: every converted owner has its `personal_views`; every corp has its holding index and views.
- [ ] Canary: a unique string saved on a test account before conversion is found nowhere in a fresh `pg_dump` or Convex export, scanned in a throwaway environment.
- [ ] Code: no imports of the retired crypto modules. Fallow shows no dead exports. No `'use cache'` over private reads.
- [ ] Logs and telemetry: Vercel, Convex and CloudWatch logs and Upstash keys hold no token shapes (`eyJ`, `v1:`) and no content IDs next to map or owner IDs. Existing and new `usage_logs` rows hold route patterns only, and error fields hold codes only (Part 04).
- [ ] Off-platform: past Linear tickets and Discord alerts reviewed for paths with IDs.
- [ ] Env keys: each absent everywhere listed in step 5 from its retire date.
- [ ] Windows: Neon history and Convex backup windows have passed since the last plaintext write. Old branches are gone; staging holds no production-derived rows.
- [ ] Users: smoke journeys unchanged, and timings within Part 32's budgets.

### Dropped from older docs

Browser export and import, the 30-day read-only old app, role remapping to Owner, Manager and Member, migration invites with "no reset after issue", the 90% target, and revoking every CCP grant at cutover (01 "Migration and cutover", 02 DR-MIGRATION, 04 D-LIFE-6). Revoking would sign everyone out, which users would notice; tokens now move into the sealed service instead.

## Data: readable vs encrypted

| Data item | Stays readable on LGI servers | Encrypted | Where computed |
|---|---|---|---|
| `sealed_conversion_progress`, per-map markers | Yes | No | Sealed service writes; LGI server reads |
| Convert mismatch and failure codes | Yes (codes only) | No | Sealed service |
| Converted rows and documents, views | Keys, versions, timestamps; existing `_id` as `rowKey` | Content | Sealed service converts; browser or workers read |
| `account.owner_hash` | Yes | No | Sealed service backfills from the verified JWT |
| Env keys during migration | Operator-readable until destroyed | Sent sealed to the enclave once | Sealed service (memory only) |
| Telemetry after scrub | Route patterns, UTM tags, error codes | No | LGI server (owner-run script) |
| Neon history, Convex backups after retirement | Metadata | Content | LGI server |

## Hard rules

1. [Agreed] No user action: no prompts, banners or migration wording (principle 1, decision 2).
2. [Proposed] Conversion runs on the server, in the sealed service. Only the sealed service opens plaintext to seal it; no Vercel or Convex code decrypts in order to migrate.
3. [Agreed] A feature's plaintext tables and server-held tokens go once its users are migrated, in the order mapper, personal data, corp data (decision 2).
4. [Agreed] Map history access and retention are unchanged by conversion: the 7-day log and 24-hour undo survive it (decision 3).
5. [Proposed] Every job pages with a stored cursor, uses compare-and-swap, verifies a digest before clearing plaintext, and is safe to re-run. A mismatch keeps the plaintext.
6. [Proposed] Accounts are converted whether or not their users ever log in again. No conversion depends on a login. ESI is used only for a fresh corp pull, with stored rows as the fallback.
7. [Proposed] Part 08's enclave login exchange is live before the token switch. Vercel stops all token use in that release.
8. [Proposed] Env keys reach the enclave only as a one-time sealed request, held in memory. Only `tokens.reseal` and the Phase 4 snapshot operation read `v1`; other workers reject it and alert. The operations leave in the next image.
9. [Proposed] Owner evidence is backfilled from the CCP-verified stored JWT before `access_token` is cleared.
10. [Proposed] The mapper switch is per map. Key epoch 0 and the access-list genesis are created inside that map's conversion. Converted rows keep their Convex `_id` as `rowKey`.
11. [Proposed] The one-off Convex backfills are finished and deleted before Phase 2.
12. [Proposed] The owner converts first; everyone else the next day. Production conversions run only in 11:15 to 11:50 UTC, per map at a moment with no member heartbeat and no recent tracked move. `converting` maps resume first at boot.
13. [Proposed] A newer sealed sync wins over converted stored rows. Invalid documents are sealed as stored, keeping `revision`.
14. [Proposed] Each converted owner's views and history are built in the same transaction as its documents, with no ESI. Corp rows wait for the corp key.
15. [Proposed] Staging is never branched from production after Phase 1; it is seeded and converted by its own enclave.
16. [Proposed] Drops follow the code that stops reading, one release later. Each one is followed by `VACUUM (FULL)` on the affected tables.
17. [Proposed] `EVE_TOKEN_ENCRYPTION_KEY` is destroyed at Phase 1 retire after the forced refresh; `ESI_SNAPSHOT_ENCRYPTION_KEY` at Phase 4 retire. Destruction covers every place in step 5, password managers included, with the date recorded.
18. [Proposed] A feature counts as retired only when its checklist passes and the history and backup windows have passed.
19. [Proposed] Error fields and logs from conversion carry codes and counts, never content or IDs from content.

## Assumptions

| Assumption | How to check |
|---|---|
| CCP invalidates an old refresh token when it issues a new one | On a test character, refresh twice, then try the first token |
| CCP's SSO JWKS still verifies old stored access tokens | Verify a sample of stored tokens on staging |
| The largest map converts within Convex's per-mutation limits and in seconds | Production row counts per map; rehearse on staging |
| A request queued during conversion completes under the client's reply timeout | Test with the longest rehearsed conversion; record the timeout it must stay under |
| The Neon plan's history window is 1 to 7 days and can be changed | Neon console; record it in Part 25 |
| Staging is a child of production today | Neon console branch parent |
| Convex keeps no deleted-document history beyond its stated backups | Convex docs and dashboard |
| The Drizzle migrator runs each migration inside a transaction | `drizzle-orm` migrator source |
| No other Neon branches or local dumps exist | Neon branch listing (`apply-neon-config.ts` already lists branches); the owner's machines |

## What users see

Nothing new. Data reads back as today, including for characters whose tokens no longer work. A map's edits pause for seconds during its conversion, at a quiet moment, using existing states; a test confirms no error toast or rollback.

## Questions for the owner

1. **Convert EVE-derived data, or download it again?** Converting causes no ESI load and no gap, and covers characters whose tokens no longer work. *Recommended: convert. The one exception is corp asset snapshots, where a fresh pull comes first.*
2. **Force one refresh per character after re-sealing?** It makes copies that crossed Vercel go stale only if CCP's rotation invalidates old tokens, and it confirms each link record with a fresh CCP-signed claim. *Recommended: yes, spread across the window. If old tokens stay valid, record the leftover exposure as an accepted risk in Part 28.*
3. **Neon history: wait it out, or set it to zero briefly after each retire?** *Recommended: wait it out if it is 7 days or less. Set it to zero only if it is longer.*
4. **How deep should verification go?** *Recommended: the full checklist, including the canary dump scan, which costs little at 18 users.*
