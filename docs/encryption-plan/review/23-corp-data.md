# Part 23: Corp data: structures, holdings, jobs and visibility

**Status:** Draft for owner review

**Carried from the Part 4 review (2026-10-08), private `'use cache'` audit:** today's cached private reads live only in per-instance memory and rarely hit on serverless (Next docs: entries "rarely survive between requests"; no hit-rate metric exists). Tag invalidation is per instance, so a cron save leaves other warm instances serving old 'hours' data (assets, blueprints, structures, holdings, corp snapshot) for up to an hour; the board already bypasses the cache for net worth (`board-view.ts:82-83`). The board reads each character's `character_skills` row twice (queue and skill levels); one query would do. `revalidateTag` on rig saves (`owned-structures/queries.ts:162`) invalidates nothing useful. Private content never moves to `'use cache: remote'`.

## In one paragraph

Corp features keep working exactly as they do today. Pulls still use the token of a member who holds the required in-game role, but that token is now opened only in the sealed service (decisions 1 and 4). Corp structures, the holding index, corp assets and blueprints, division, container and structure names, and member bases become sealed documents under a per-corp key that never leaves the enclave. The workers compile each viewer's grant with today's code, filter rows to it, and seal the result to that viewer's user key. Each result carries a readable expiry that mirrors today's read-time freshness limits, and is rebuilt or deleted whenever a grant input changes. The browser never receives rows beyond its grant. Roles, sharing state and the corp access audit stay readable, but the sealed service trusts only role reads it made itself and rows carrying its own tag. `esi_snapshots` is dropped. Corp data ships last (Phase 4).

## How it works today

- **Sharing.** `corp_structure_sharing` holds one row per corp (`enabled`, `set_by`, `set_at`). Only a Director can toggle it (`POST /api/account/corp-sharing`); `directorGate` re-reads roles live from ESI first. Turning sharing off deletes nothing.
- **Pulls.** The owner-sync corp axis probes `/characters/{id}/roles/` with each of the viewer's linked characters in the corp until one holds a required role (`selectCorpCredential`). Assets, blueprints and corp context need Director; structures need Station Manager or Director; corp jobs need Factory Manager or Director. Corp jobs are stored per (user, corp); everything else once per corp.
- **Corp context.** A Director pass reads HQ, divisions, member bases (linked members only), container names and structure names (10 per pass), and writes `corp_profiles` and `corp_member_bases` in one transaction.
- **Corp assets.** `saveOwnedAssetsFromSource` encrypts the raw item list into `esi_snapshots` under `ESI_SNAPSHOT_ENCRYPTION_KEY`, which operators can read. In one transaction it writes the corp's `owned_assets` rows (with a `snapshot_id` foreign key) and `corp_holding_nodes`. Housekeeping prunes unreferenced snapshots after 7 days. On read, `getCorpAssetSnapshot` decrypts the snapshot and runs `buildHoldingIndex` inside `'use cache'` with `cacheLife('hours')`, so plaintext sits in the cache for hours. Corp blueprints use the same items (`getCorpAssetEvidence`).
- **Grants, recompiled on every read.** `resolveCorpViewer` applies three time limits. A character counts for a corp only while its affiliation is under one hour old; `resolveUserCorpAccess` re-fetches stale ones synchronously, and a failed refresh drops the corp. Roles older than one hour are fetched live, only if the character has a refresh token and the roles scope (`canFetchRoles`); a failed fetch yields `unknown`, a narrower grant. HQ and bases become `unknown` once the profile is over 24 hours old (`CONTEXT_MAX_AGE_MS`). ESI calls time out after 10 s (`OUTBOUND_FETCH_TIMEOUT_MS`).
- **Grant rules** (`compileCorpGrant` and its tests are the spec). Holdings: Director gets all whatever the sharing state; with sharing off everyone else gets none; with sharing on, Accountant gets all, otherwise by location from hangar and delivery roles at HQ, base or other. Blueprints: all for Factory_Manager with sharing on, else the holdings rule. Structures: `manage` for Station_Manager or Director, else `use` if sharing is on, else `none`. Jobs: `own-token` for Factory_Manager or Director. `manageSharing` for Director.
- **Reads.** Planner owned assets and blueprints, `/api/account/structures`, the industry structures page, the corporations settings page and `/api/account/corp-industry-jobs`. The settings page renders role label, sharing and structure count together on the server behind one Skeleton. The corp jobs response includes a `names` map Vercel builds from job type IDs (`jobTypeIds`, `getTypeNames`).
- **Tokens on Vercel.** Stale-role re-fetches (`fetchAndStoreCorpRoles`), the sharing and rig gates (`directorGate`, `stationManagerGate` via `vendTokenFor` and `probeAndStoreRoles`) and on-view `after()` refreshes (`refreshCorpContextOnView`, `scheduleCorpStructuresRefresh`).
- **Merge and audit.** `mergeCorpJobsPaired` re-keys `corp_industry_jobs` to the survivor, keeping the survivor's row per corp. `authorizeCorpMutation` writes `corp_access_audit` at each mutation gate; retention is 400 days.

Files: `src/platform/auth/{corp-visibility,corp-roles-store,corp-sharing-store,corp-access}.ts`, `src/composition/{corp-viewer,corp-access,corp-role-gates}.ts`, `src/composition/sync/{corp-context-sync,corp-structures-sync,corp-industry-jobs-sync,live-dataset-view,owned-assets-source-save,owner-sync-port}.ts`, `src/data/corp-holdings/*`, `src/data/esi-snapshots/*`, `src/composition/pipelines/{esi-snapshot-retention,housekeeping}.ts`, `src/composition/__tests__/{data-ownership-registry,table-growth-registry}.ts`, `src/features/owned-assets/{queries,schema}.ts`, `src/features/industry-jobs/{queries,schema,purge}.ts`, `src/platform/owner-sync/credential.ts`, `src/lib/fetch-with-timeout.ts`, `src/app/(site)/settings/corporations/*`, `src/app/api/account/corp-sharing/route.ts`.

## What changes

Nothing visible changes for users. Backend only: pulls, role probes, grant compilation and filtering run in the workers with sealed tokens; corp content becomes sealed documents; per-viewer results are sealed to the viewer's user key; `esi_snapshots`, `corp_holding_nodes` and the snapshot env key are retired; role and sharing rows gain integrity tags.

## Design

**Corp documents.** Neon, one per corp, sealed under the corp key, with a readable `version` for compare-and-swap (Part 02).

| Document | Replaces | Readable | Sealed | Written by |
|---|---|---|---|---|
| Corp assets | Corp `owned_assets` rows, `corp_holding_nodes`, `esi_snapshots` | `corporation_id`, `version`, `refreshed_at`; sync state (Part 18) | Aggregated rows, parsed items, holding index | Director asset pull |
| Corp blueprints | Corp `owned_blueprints` rows | `corporation_id`, `version` | Blueprint rows (Part 22 shape) | Director blueprint pull |
| Corp structures | `corp_structures` | `corporation_id`, `version`; ETags in `corp_structure_syncs` | IDs, types, systems, security band, names | Station Manager or Director pull |
| Corp rigs | `corp_structure_rigs` | Per Part 21 | Per Part 21 | Rig save |
| Corp profile | `corp_profiles` fields | `corporation_id`, `hq_station_id`, `last_refreshed_at`, `version` | HQ station ID (copy of the pass's own ESI read), division, container, structure names | Corp context pass |
| Member base | `corp_member_bases` | `character_id`, `corporation_id` | `base_id` | Corp context pass, same transaction |

Member bases stay per character so today's `follows-character` purge works. The by-location HQ grant rule uses only the HQ station ID inside the sealed profile document, which the workers wrote from their own ESI read in the corp context pass. The readable `hq_station_id` column is metadata only and never feeds a grant, so editing it changes nothing. No blind indexes: the enclave always loads a whole document. Sharing has no sealed document (below).

**Corp key.** One per corp in `sealed_key_records` (`kind = corp`, Part 09), created on the first corp write. It never leaves the enclave, so no departure forces a rotation. It is destroyed when the corp's last document is deleted; today nothing deletes corp data when users leave, and that stays.

**Per-viewer corp views.** Stored in Part 19's `personal_views`, one row per account per corp per kind, because a grant is compiled from all the account's characters in that corp. For corp kinds `character_id` is NULL and a new `corporation_id` is set; a check constraint requires exactly one. Part 19's unique index becomes partial (`WHERE character_id IS NOT NULL`); a second partial unique index covers (`user_id`, `corporation_id`, `kind`). AAD binds table, `user_id`, `corporation_id`, `kind`, `version` and view schema version. Kinds match Part 21: `holding_index`, `blueprint_index`, `corp_structures` (rigs merged in) and `corp_jobs`. A view holds only rows the grant allows, plus the names they refer to. Each row has a readable `valid_until`: the earliest of each contributing role's `fetched_at` + 1 h, each contributing affiliation's `refreshed_at` + 1 h, and, if HQ or bases were used, the profile's `last_refreshed_at` + 24 h.

**Corp jobs.** The `corp_jobs` view replaces `corp_industry_jobs` as the only copy; sync state stays readable in `corp_industry_job_syncs`. It is pulled with the viewer's own token and sealed under the viewer's user key. The workers resolve type names from public data and write the `names` map into the sealed body, so it decrypts to exactly today's response; Vercel never resolves names from corp job contents. On merge it overrides Part 19's `discard` rule with `mergeCorpJobsPaired`'s survivor-wins-per-corp rule, re-sealed under the survivor's user key (Part 11).

**Rebuild and delete events**, each in the same transaction as its trigger.

| Event | Views affected |
|---|---|
| Corp asset, blueprint, structures or context write; rig save; sharing change | Rebuilt for every account with an eligible character in the corp |
| Verified role change | That character's account |
| Affiliation change | Old corp's views deleted for that account; new corp's built |
| Character link, unlink, purge, sale (Part 14), merge (Part 11) | That account's views for the corp rebuilt, or deleted if no eligible character remains |
| A contributing character loses its refresh token or roles scope, or passes the authorization-failure cutoff | That account's views for the corp rebuilt |

Eligibility and affiliation come from the sealed service's own link record and affiliation reads (Part 12), with today's rule.

**Read-time check.** The route reads each corp view's `valid_until`. If it has passed, it sends one sealed request (Part 07) for the workers to re-check affiliation, roles and context and rebuild, and waits up to 10 s, today's ESI timeout. On timeout or failure it serves nothing for that corp, never the old view. That matches today's failed affiliation refresh and is at most narrower than today's `unknown` roles. Otherwise it serves stored views without calling the sealed service.

**Role and sharing verification (default).**

- Both tables are written only by the workers. Each row gains a `tag`: HMAC-SHA256 under a record key derived from the service root key with HKDF and a registered label (`lgi/corp-record-mac/v1`, Part 09). The MAC input is label, table kind, row schema version, then the fields.
- Role rows are written after reading `/characters/{id}/roles/` with that character's sealed token; the tag covers character, corp, the four role arrays and `fetched_at`. The workers use a row only if the tag verifies, the corp matches their own affiliation read and it is under one hour old; otherwise they re-fetch. Replay is bounded to one hour. Readable rows still feed display labels and Part 14's notice recipients.
- `corp_structure_sharing` stays the only record of sharing; its tag covers `corporation_id`, `enabled`, `set_by` and `set_at`. A toggle is a sealed request authenticated by the Director's browser session key; the workers run `directorGate` live, then write the tagged row and the audit row. A row whose tag fails counts as off and fires an alert. Remaining limit (Part 28): an operator can replay an earlier tagged "on" row, giving members today's sharing-on grant (structures at `use`, by-location holdings their own roles allow, all holdings for Accountants, all blueprints for Factory Managers).
- An operator outside a corp gains nothing, because affiliation comes from the sealed service's own ESI reads.

**Pull flow.** A job arrives from `esi_refresh_jobs` or an on-view enqueue (Part 18). Custody lists the user's eligible characters. `selectCorpCredential` and the existing projections run unchanged with sealed tokens. The workers write the next document version with compare-and-swap; a loser reports `superseded`, as today. They rebuild affected views and write readable sync state and error codes (`needs_role`, `esi_403`).

**Vercel side.** The settings page derives the role label and `canManageSharing` from readable roles, and sharing from the readable row, for display only. Every mutation is re-checked in the workers. Because the structure count needs the decrypted `corp_structures` view, a client component holds today's "Loading corporations" Skeleton until the views decrypt, then renders both cards together, as today. The `esi_snapshot_pulled` event, which carries an item count, becomes a count-free `corp_assets_synced` event (Part 29).

**Corp heads-up.** Part 14 sends it from readable affiliation and roles; no corp content.

**Ship timing.**

- **Caches.** By default the corp `'use cache'` wrappers go in Phase 4, when sealed views replace those reads (Part 04 PR 0-7, question 6; Part 30). If the owner chooses early removal, Phase 0 removes `getCorpAssetSnapshot`'s wrapper first, after measuring the largest corp's decrypt and index time on staging. If noticeable, use a per-request React `cache()` or read the stored `corp_holding_nodes`.
- **Interim, once tokens leave Vercel** (Parts 08, 18). Read-path role re-fetches and the sharing and rig gates become sealed requests; on-view refreshes become enqueues. Workers pull and hand plaintext rows and items to an internal Vercel route that calls today's save functions, including `saveOwnedAssetsFromSource`, so the env key does not enter the enclave in the interim.
- **Phase 4** swaps that port for sealed documents, migrates rows (Part 31; snapshots with no working token go through Part 31's one-time conversion operation) and removes `esi_snapshots`, `owned_assets.snapshot_id` and its index, `src/data/esi-snapshots/purge.ts`, the housekeeping task, the ownership and growth registry entries, `corp_holding_nodes`, `corp_industry_jobs` and the env key.

**Dropped from older docs.** Director-client authority and browser grant compilation (DR-C6), CorpSpace and fetch leases, access-class keys, buckets, padded manifests, client-signed writes, succession, re-genesis, the extra `read_corporation_membership` scope (01 "Corp spaces", 04 §14), and the sealed corp settings document of earlier drafts.

**Risks.** A worker bug could seal rows beyond a grant; reusing the tested modules unchanged limits this. A missed rebuild event serves a stale grant until `valid_until`. During an enclave outage, views within `valid_until` still load, expired views show nothing for that corp after 10 s, and pulls, sharing toggles and rig saves fail with today's error responses.

**Testing.** Today's visibility, placement, context-sync and corp refresh tests run unchanged against worker ports. In the dual-run window each sealed view is compared with today's `resolveCorpViewer` plus `getOwnedAssetMap` output. Real-Postgres tests cover concurrent pulls and the partial indexes. Adversarial tests (Part 28): an edited role row, an edited readable `hq_station_id`, an edited or untagged sharing row, a replayed role row, a character outside the corp per ESI, a sold Director, an unlinked character and a profile past 24 hours each yield no extra rows. The settings page test asserts no layout shift and the same time to full render.

## Data: readable vs encrypted

| Data item | Stays readable on LGI servers | Encrypted | Where computed |
|---|---|---|---|
| `corp_structure_sharing` | Corp, enabled, set by, set at, `tag` | None | Sealed service writes and verifies; LGI server displays |
| `corp_member_roles` | All fields plus `tag` | None | Sealed service writes and verifies |
| `corp_access_audit` | All; 400-day retention | None | Sealed service writes; LGI server prunes |
| Corp assets, holding index, raw items | Corp ID, version, timestamps | Rows, items, index | Sealed service |
| Corp blueprints | Corp ID, version | Rows | Sealed service |
| Corp structures | Corp ID, version, sync state, ETags | IDs, types, systems, names | Sealed service |
| Corp profile | Corp ID, HQ station (metadata only; grants use the sealed copy), refresh time | HQ station copy, division, container, structure names | Sealed service |
| Member bases | Character, corp | Base ID | Sealed service |
| Corp jobs (`corp_jobs` view) | User, corp, sync state, error codes | Jobs, installer and type names | Sealed service |
| Per-viewer corp views | User, corp, kind, version, `valid_until`, built at | View body | Sealed service builds; browser decrypts |
| Role and access labels | Derived from readable roles | None | LGI server (display only) |
| `esi_snapshots` | Dropped | Dropped | Not needed |

## Hard rules

1. [Agreed] Users notice nothing: same pages, labels, sharing switch, confirm text and timings (principle 1).
2. [Agreed] Corp content (structures, holdings, assets, blueprints, jobs, names, bases) is encrypted; which corps use LGI stays readable (principle 2).
3. [Proposed] Sharing state and roles stay readable, per 06.
4. [Agreed] Corp pulls use a role-holding member's token, opened only in the sealed service (decisions 1, 4). Using Station Manager and Factory Manager tokens too keeps today's behaviour (principle 1).
5. [Agreed] Server work that reads corp content runs in the sealed service, not the browser (principle 3).
6. [Agreed] Corp data ships last, through normal releases, with no visible change (decision 2).
7. [Proposed] Corp keys never leave the enclave and are destroyed with the corp's last document. Browsers receive only per-viewer results sealed to their user key.
8. [Proposed] No corp row outside the viewer's grant leaves the enclave, in a view, an error or a log.
9. [Proposed] `compileCorpGrant`, placement and visibility code stay single shared modules, built into the app and the enclave without forks.
10. [Proposed] Grants use only tagged role rows under one hour old that match the sealed service's own affiliation read and link record, the tagged sharing row, and the HQ station ID inside the sealed profile document, never the readable `hq_station_id` column. A sharing row whose tag fails counts as off and fires an alert.
11. [Proposed] Tags are HMAC-SHA256 under a record key derived from the service root key with label `lgi/corp-record-mac/v1`; the MAC input includes label, table kind and row schema version.
12. [Proposed] Corp mutations are accepted only as sealed requests authenticated by the browser session key, after a live role check, and each writes `corp_access_audit`.
13. [Proposed] Corp views live in `personal_views` with `character_id` NULL, a partial unique index on (`user_id`, `corporation_id`, `kind`), and AAD binding `user_id`, `corporation_id`, `kind`, `version` and schema version.
14. [Proposed] Every corp view has a readable `valid_until` as defined above. Every event in the rebuild table rebuilds or deletes views in the same transaction.
15. [Proposed] A route serving a view past `valid_until` sends one sealed recheck and waits at most 10 s; on timeout or failure it serves nothing for that corp, never the old view. Other corp actions fail with today's error responses during an outage.
16. [Proposed] One sealed document per corp per dataset, with a readable version for compare-and-swap; member bases per character; corp jobs per viewer under the user key. No blind indexes.
17. [Proposed] The workers write the corp jobs `names` map into the sealed body; Vercel never resolves names from corp content. Corp jobs merge survivor-wins-per-corp, re-sealed under the survivor's user key.
18. [Proposed] `esi_snapshots` and its env key are retired; raw items exist only in the sealed corp asset document. The env key enters the enclave only once, for Part 31's one-time Phase 4 conversion of snapshots with no working token (Part 31 rule 8), held in memory and dropped from the next image; at no other time.
19. [Proposed] Error fields are codes. Domain events carry no counts or IDs from corp content.
20. [Proposed] No server cache holds corp plaintext across requests; per-request `cache()` is allowed. The audit keeps 400-day retention.
21. [Proposed] The settings page shows role, sharing and structure count together behind today's Skeleton.
22. [Proposed] In the interim, token-bearing read-path and gate calls become sealed requests and on-view refreshes become enqueues. The plaintext port is an internal Vercel route calling today's save functions, removed in Phase 4 and never extended to new tables.

## Assumptions

- **A character's own roles endpoint is enough, as today.** Check: the grant uses only the viewer's own characters' roles (`resolveCorpViewer`).
- **The largest corp asset document fits.** Check: measure the largest corp's item count before Phase 4.
- **Removing the cache adds no visible latency.** Check: time the largest corp's decrypt plus `buildHoldingIndex` on staging before removing it (Phase 4 by default, Phase 0 if the owner chooses early removal).
- **The Phase 4 removal list is complete.** Check: grep for `esi_snapshots`, `esiSnapshots` and `snapshot_id`, then `pnpm verify` with the registry tests.
- **The rebuild table covers every way a grant input changes.** Check: map every writer of affiliations, links, tokens, scopes and roles in the code to a row.
- **Waiting for decryption on the settings page is invisible, and a sealed recheck costs no more than today's ESI fetches.** Check: measure both on staging.

## What users see

Nothing new. The sharing switch, confirm dialog, role labels, structure lists, planner holdings and the corp jobs board look and behave as today. The only corp-related notice is Part 14's sale heads-up, justified there.

## Questions for the owner

1. **Role re-verification.** (a) Tagged role rows, re-fetched by the sealed service when older than one hour; (b) a live ESI read before every release; (c) trust readable roles. Recommended: (a), today's freshness without extra ESI calls. Choose (c) only if Part 12 also accepts the limit.
2. **Sharing state protection.** (a) The readable row, written only by the workers with a tag; (b) the readable row trusted; (c) a sealed settings document plus readable mirror. Recommended: (a). It blocks forged rows; (c) adds a second source of truth and still allows the same replay of an old "on" state.
3. **Structure count on the settings page.** (a) Hold the existing Skeleton until the views decrypt; (b) store each viewer's count as readable metadata so the server renders it. Recommended: (a); the count derives from content.
4. **Corp asset document shape.** One document with rows, items and index, or a separate index document. Recommended: one, so one version covers one pull.
5. **Corp jobs keying.** The viewer's user key directly, or the corp key plus a view. Recommended: the user key; the rows are already per viewer.
6. **Ship timing.** Phase 4 with a temporary plaintext port, or sealed with personal data in Phase 3. Recommended: Phase 4, as decision 2 orders.
