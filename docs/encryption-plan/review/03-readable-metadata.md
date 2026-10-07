# Part 03: What stays readable and what it reveals

**Status:** Draft for owner review

## In one paragraph

Principle 2 keeps metadata readable on LGI's servers and seals content. This part lists what an operator, or someone who steals a database or backup, can still learn once content is sealed. It sets one rule: readable is not trusted. Every readable field that decides who gets a key or content is checked again by the sealed service. It also asks the owner to accept some timing and size leaks, choose where the list is published, and keep today's retention.

## How it works today

Today operators can read everything. The fields below stay readable after this plan.

- **Accounts and characters.** `account` links each character to an LGI account (`userId`), with `ownerHash`, `scope` and health counters. `characters` holds name, corp, alliance, faction and login times.
- **Sessions.** `session` stores `ipAddress` and `userAgent`. `expiresIn` is 7 days with no `updateAge`, so Better Auth's default of 1 day applies: a session expires 7 days after its last daily refresh (sliding). Sessions are pruned 1 day after expiry (`SESSION_RETENTION_DAYS = 1`).
- **Maps.** `maps` holds the creator (`userId`), `name`, `characterScopedAt` and lifecycle timestamps. The creator is admin and bypasses blocks (`authorization-sql.ts`, `mapBlockRefusal` in `access.ts`). `map_access`, `map_blocks` and `map_block_accounts` hold grants and blocks; Convex `mapAccess` projects them.
- **Corp data.** `corp_member_roles` stores ESI corp roles. `corp_structure_sharing.enabled` widens holdings, blueprints and structures to members without roles (`compileCorpGrant`). `corp_profiles.hqStationId` feeds the by-location HQ rule. `corp_access_audit` logs corp access decisions.
- **Presence.** Each open tab beats every 60 seconds (`HEARTBEAT_MS`), but Convex keeps one `syncPresence` row per user and dataset (`by_user_dataset`). `upsertPresence` overwrites `lastSeenAt`, `lastVisibleAt` and `tabId`; beats within 45 seconds of the last write are skipped (`PRESENCE_REFRESH_MS`).
- **Tracking.** Convex `mapTracking` records which character is tracked on which map. `locationSync.coveredCharacterIds` (shown by the `coverage` query) says who is online in game. On account merge, `restoreTrackingRow` re-inserts `mapTracking` rows from Neon `pending_tracking_merges`, with no browser step, retried by `tracking-merge-retry.ts`.
- **Map activity.** `mapEvents` keeps `at`, `kind` and `actor` beside `payload`, for 7 days. `watchMapEvents` reads by `mapId` and `at`; the purge uses `purgeAfter`.
- **Sync and events.** Sync tables hold timestamps and `pageEtags`. `domain_events` (400 days) records token state, job status and `esi_snapshot_pulled` with `itemCount` per corp.
- **Telemetry.** `usage_logs` stores `characterId`, `action` and metadata, including `owned_data_read` `returned` counts and full page-view paths. Feedback also goes to Linear.

Files: `src/db/auth-schema.ts`, `src/platform/auth/auth.ts`, `src/data/maps/schema.ts`, `src/data/maps/authorization-sql.ts`, `src/data/maps/access.ts`, `src/platform/auth/corp-visibility.ts`, `convex/schema.ts`, `convex/engine.ts`, `convex/engineSweep.ts`, `convex/accountMerge.ts`, `convex/mapTrackingLive.ts`, `convex/mapChainEvents.ts`, `src/composition/account-lifecycle/tracking-merge-retry.ts`, `src/data/domain-events/types.ts`, `src/lib/db-columns.ts`, `src/app/api/owned-data-telemetry.ts`.

## What changes

Nothing visible to users. Readable metadata keeps its shape and retention, with a few small trims below. Behind the scenes, the sealed service stops trusting readable fields when it decides who gets keys or content, and Part 04 cleans logs and telemetry of content IDs.

## Design

**What stays readable and what it reveals** (summary of 06's "Fields that stay readable" column, plus the fields later parts add, each named by its part).

| Item | Where | What an operator or thief learns | Accepted? |
|---|---|---|---|
| Account links, owner hash | Neon `account` | Alts of one person; when a character changes hands | Yes |
| Names, corp, alliance | Neon `characters` | Which corps use LGI (public at CCP) | Yes |
| Corp roles, sharing, HQ, member IDs | `corp_member_roles`, `corp_structure_sharing`, `corp_profiles`, `corp_member_bases` | Who holds roles; which corps share; HQ (public); whole-corp membership, including non-LGI members | Yes |
| Corp access audit | `corp_access_audit` | Who was allowed or refused corp data, when | Yes |
| Maps, owners, names | Neon `maps` | That a map exists, name, creator, lifecycle | Yes |
| Access lists and blocks | `map_access`, `map_blocks`, `map_block_accounts`, `mapAccess` | Who may open which map; who was blocked | Yes |
| Tracking selections | `mapTracking`, `pending_tracking_merges`, `mapJumpBookkeeping` keys | Which characters are tracked where (not location) | Yes |
| Presence | Convex `syncPresence` | Live: minute-level LGI use. Database leak: last-seen time only | Yes, if the owner agrees |
| Location write timing | Sealed location rows | Jump, dock and ship-change times; online/offline transitions if coverage flips rewrite the row | Yes, if the owner agrees |
| Map row counts and edit timing | Convex counts, `_creationTime`, `mapEvents.at` | Rough map size; when a map is edited | Yes, if the owner agrees |
| Sealed document sizes, page counts | Sealed documents; `pageEtags` | Volume to within one ESI page (about 1,000 items) | Yes, page count only |
| Planning and valuation timestamps | `industry_profiles`, `custom_structures` (counts too), `corp_structure_rigs`, `net_worth_days` | When planning or valuation happens | Yes |
| Sync state and events | Sync tables, `esi_refresh_jobs`, `domain_events` | When data refreshed; token health; job outcomes | Yes, without `itemCount` |
| Queues and preferences | `pending_deletions`; `user_preferences` keys | Pending purges; UI toggles | Yes |
| IP and user agent | `session`, Upstash, Vercel logs | Where and on what device users log in | Yes, today's retention |
| Telemetry, feedback | `usage_logs`, Linear | Which character used which route; what users chose to write | Yes, after Part 04 and without exact `returned` |
| Presence tab detail (Parts 15 to 17) | Convex `syncPresence`: open map IDs and editor flag per warm tab, `lastBeatReason`, cold marker | Which maps each user has open right now, in how many tabs, and whether as editor; which heartbeat rule wrote each beat; when presence went cold | Yes, if the owner agrees (Q1) |
| Tracker warmth (Part 17) | `trackerWarm` bit in `forMap` and `coverage` results | Whether some account tracking a character on a map has a warm tab (not location, not online status) | Yes |
| Build ID (Part 30) | `syncPresence` heartbeat; readable minimum build | Which app build each open tab runs; when tabs picked up a deploy | Yes |
| Sealed request headers (Part 07) | Convex `sealedRequests`: request ID, class, `mapId`, `userId`, deadline, status, timestamps, size | Who sends which class of sealed request, for which map, when, how large, and whether it succeeded; the operation and body stay sealed | Yes, if the owner agrees (Q1) |
| Sealed jobs (Part 07) | Convex `sealedJobs`: kind, subject, readable IDs, `dueAt`, attempts, `dedupeKey` | Which background jobs run for which account, map or character, when, and how often they retry | Yes |
| Map key wraps (Parts 09, 13) | Convex `mapKeyWraps`: `mapId`, `userId`, epoch, `keyId` | Which accounts hold a key to which map at each epoch (membership across rotations) | Yes |
| Key record metadata (Parts 09, 13) | Neon `sealed_key_records`: kind, subject, epoch, `root_key_id`, created, retired, `destroy_after` | Which users, maps and corps have keys; when map keys rotate (a member left); when old keys are due for destruction | Yes |
| Backups (Part 10) | Neon `user_key_backups`: `user_id`, `kind`, `credential_id`, `public_key`, `created_at` | That an account has backups, their kinds and count, passkey credential IDs, created dates | Yes |
| Sale notices (Part 14) | Neon `account_notices`: recipient, kind, character, corp, `map_ids`, created, dismissed | Who was told about a sale, which character and corp, which maps were affected, when the notice was dismissed | Yes |
| Access snapshot (Part 12) | Neon `map_access_state`: map, version, canonical state, last change, actor (account or `system` with reason), time, MAC | The access list and blocks again; how many accepted changes a map has had; the latest change, who made it or why LGI did | Yes |
| Affiliation observations (Part 12) | Sealed service's MAC'd rows: `character_id`, `corporation_id`, `observed_at`, `version` | Each character's corp as the sealed service last saw it (public at CCP), and when it checked | Yes |
| Link and decision records (Parts 08, 11, 12) | Character-link records (versioned, with tombstones), pending merges, transfer and merge decision records, MAC'd | The same alt links as `account`; when a merge or transfer is pending or decided; when a character was unlinked | Yes |
| Net-worth pilots (Parts 11, 22) | `net_worth_days.pilot_ids` | Which linked characters counted toward net worth each day | Yes |
| Personal and corp views (Parts 19, 23) | Neon `personal_views`: `user_id`, `character_id` or `corporation_id`, `kind`, `version`, `names_version`, `valid_until`; bodies padded to 4 KB | Which view kinds each character or corp viewer has; how often each is rebuilt; size to 4 KB; from `valid_until`, when the viewer's corp roles, affiliation or HQ were last fetched | Yes |

**Trims.** Drop `itemCount` from `esi_snapshot_pulled` (or the event with `esi_snapshots`, Part 23). Bucket `returned` in `owned_data_read` (0, 1–10, 11–100, more). Drop `lastProcessedTransitionAt` from merge selections once jump bookkeeping is sealed (Part 17). Seal `mapEvents.kind` and `actor` inside `payload`: no LGI-server logic reads them (this departs from 06).

**What no longer leaks** once Parts 04, 17, 22 and 24 land: location ETags, the `wh_observations` link from sightings to maps, IDs in telemetry paths and error text, and market rows seeded from holdings. Online status leaves readable columns, but write timing may show it (Q1).

**Size padding.** The design pads plaintext before sealing: map rows to a fixed size per table, per-owner documents to the next power of two from 1 KiB. This hides volume finer than an ESI page; readable page counts remain the coarse signal. Parts 09 and 16 set the format and sizes.

**Readable is not trusted.** An operator who edits one of these fields could admit themselves.

| Readable field | Sealed decision it gates | How the sealed service checks it | Part |
|---|---|---|---|
| `account.userId` | Whose keys a login reaches; merges | Own record of character links, from EVE logins it verified | 08, 11 |
| `account.ownerHash` | Sale detection | Compares the JWT's owner hash with its own record | 08, 14 |
| `maps.userId` | Creator-admin path, block bypass | Genesis and owner changes go into the signed access chain; only the signed owner gets the creator path | 12 |
| `characters.corporationId` | Corp grants; corp data | Fetches affiliation from ESI (one-hour cache) | 12, 23 |
| `corp_member_roles` | Corp data visibility | Re-reads roles from ESI before release | 23 |
| `corp_structure_sharing.enabled` | Holdings, blueprints, structures for members without roles | Accepted only over a Director's browser session key, role re-read from ESI, result signed | 23 |
| `corp_profiles.hqStationId` | By-location HQ rule | Reads HQ from public ESI corporation info itself | 23 |
| `map_access`, `mapAccess` | Map key release | Signed hash chain of accepted versions (default) | 12 |
| `map_blocks`, `map_block_accounts` | Map key release | Same signed chain | 12, 14 |
| `mapTracking`, `maps.characterScopedAt` | Where a character's location is written | Opt-ins over the user's browser session key, members only | 17 |
| `pending_tracking_merges.selections` | Restored tracking after merge | Accepted when they match a merge it saw through a verified EVE login, or it performs the restore itself | 11, 17 |
| `syncPresence` | Whether polling runs | Tied to the browser session key, or accepted as low risk | 17 |

**Unsigned changes.** Part 12 ("Mismatches" and "Database writers") is the one list of LGI changes the sealed service accepts without a member edit, and how each becomes a `system` version, including the custody tombstone that deletion holder removals need. Parts 08 and 11 list the custody removals accepted unsigned (session revocations, unlink, admin unlink). This part adds none.

**Disclosure.** Decision 2 rules out in-app messaging. The default is one page in the public repo (`docs/what-lgi-can-see.md`), not linked from the app. It carries the readable list (the table above, including fields later parts add) and a fixed limits section: AWS signs the attestation and the AWS account owner can change the key-release rule, visible through the published fingerprints (linked); whoever serves lgi.tools could ship code that leaks keys after login; anyone holding a user's EVE login reaches their data.

**Retention.** Unchanged:

| Item | Retention today |
|---|---|
| Sessions (IP, user agent) | Expire 7 days after last daily refresh (sliding); deleted 1 day after expiry |
| OAuth state (`verification`) | 1 day after expiry |
| Presence | 7 days after last heartbeat |
| Map event log | 7 days |
| Account-merge tracking receipts | 90 days |
| ESI refresh jobs / dead letters | 7 / 30 days |
| Telemetry | 180 days |
| Domain events, corp access audit, GSC | 400 days |
| Accounts, characters, maps, access lists, blocks | Until deleted or purged, as today |

## Data: readable vs encrypted

| Data item | Stays readable on LGI servers | Encrypted | Where computed |
|---|---|---|---|
| Account links, owner hash, auth health | Yes | No | LGI server; sealed service keeps its own links and hashes |
| Affiliation, corp roles, sharing, HQ | Yes | No | LGI server; sealed service re-reads or verifies when they gate a release |
| Maps, owner, names, lifecycle | Yes, owner in signed chain | No | LGI server stores; sealed service verifies owner |
| Access lists, blocks, `mapAccess` | Yes, with a signed chain | No | LGI server stores; sealed service signs and verifies |
| `mapTracking`, merge selections, `syncPresence` | Yes | No | LGI server stores; sealed service checks tracking |
| `locationSync.coveredCharacterIds` | No (dropped) | Inside the sealed location row | Sealed service |
| Map row counts, `mapId`, retention timestamps | Yes | Row bodies sealed and padded | LGI server schedules; sealed service writes |
| `mapEvents.at`, `purgeAfter` | Yes | `payload` with `kind` and `actor` | Sealed service writes; LGI server purges |
| Sync timestamps, `pageEtags` | Yes | No | LGI server |
| `domain_events` (no `itemCount`) | Yes | No | LGI server |
| Session IP and user agent | Yes | No | LGI server |
| `usage_logs` (route patterns, bucketed counts) | Yes | No | LGI server |

## Hard rules

1. [Agreed] Metadata listed in principle 2 stays readable: users, corporations, that maps exist, map names, membership and access lists.
2. [Agreed] Nothing about what stays readable is shown in the app (decision 2).
3. [Proposed] The sealed service never releases a key or content on a readable field alone. This covers access lists, blocks, map ownership, corp sharing, corp context (roles, affiliation, HQ) and tracking. Each field in the "Readable is not trusted" table is checked by the part named there.
4. [Proposed] The sealed service accepts unsigned only the changes Part 12 lists, with Parts 08 and 11 for custody removals. This part adds none.
5. [Proposed] No new readable field may be added to a per-user, per-corp or per-map table without updating 06, this part and the disclosure page in the same pull request.
6. [Proposed] Readable columns of per-user, per-corp and per-map tables hold IDs, timestamps, counts and codes only: no ESI free text, no content IDs (systems, structures, locations, types). Public data and names accepted as metadata are exempt. Request logs and telemetry carry no content IDs (Part 04); page URLs stay as today.
7. [Proposed] Sealed plaintext is padded before encryption: map rows to a fixed size per table, per-owner documents to the next power of two from 1 KiB.
8. [Proposed] Retention for readable metadata stays at today's values. Changing any value is an owner decision.
9. [Proposed] The disclosure page is generated from 06's readable column and this part's table and notes, including the fields later parts add, plus a fixed limits section, so they cannot drift.

## Assumptions

- **The repo is public.** The disclosure page relies on it. Check repository visibility.
- **Better Auth fills `session.ipAddress` and `userAgent`.** Check rows on staging.
- **Padding cost is small.** Maps cap near 128 systems. Check Convex storage after Part 16's conversion.
- **Vercel request logs keep paths briefly.** Check log retention; Part 04 removes IDs either way.
- **Only the admin ops view and cost dashboards read `itemCount` and exact `returned`.** Check `src/app/(site)/admin/ops-view.ts` before trimming.

Convex `_creationTime` is a system field always visible to deployment admins, so edit timing leaks whatever the row shape.

## What users see

Nothing new. No banner, no settings, no copy changes. The disclosure page lives only in the repo.

## Questions for the owner

1. **Which timing and size leaks are accepted?** Map size from row counts; edit times; jump and dock times, and online/offline transitions, from location writes; site-use time from heartbeats. Recommended: accept all. Hiding them needs constant-rate writes (a few per second for about 20 to 40 pilots) or dummy rows, for little gain. For online status, Part 17 may instead write coverage only with the next location change, which delays the coverage indicator.
2. **Pad sealed rows and documents?** Recommended: yes, as in rule 7. It hides site type and volume finer than an ESI page at almost no cost.
3. **Where is what stays readable disclosed?** Recommended: one page in the public repo with the limits section, not linked from the app.
4. **Retention for readable metadata?** Recommended: today's values.
5. **Should tracking selections, merges and heartbeats be checked by the sealed service?** Recommended: yes for selections and merge restores (a forged one would publish a victim's location), decided in Part 17. Heartbeats can stay unchecked if tying them to the browser session key is costly.
6. **Seal `mapEvents.kind` and `actor`?** Recommended: yes, at no cost, since no LGI-server logic reads them.
