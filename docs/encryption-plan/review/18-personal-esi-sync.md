# Part 18: Personal ESI sync in the sealed service

**Status:** Draft for owner review

**Carried from the Part 07 review (2026-10-09):** ESI budget gate settled as "same gate, its own tally, one control panel" (Part 07 outcome): the enclave runs today's gate code with an in-memory tally and never calls Upstash; budget snapshot in the heartbeat, shown on the admin page beside Vercel's Upstash tally; one shared "pause ESI" setting; one Discord alert on enclave exhaustion; today's `OUTBOUND_USER_AGENT` on every call. The keying assumption below is now checked: authenticated bucket limits are keyed by application and character (shared across source IPs, so each dataset must be fetched by one side only, as rule 20 says); the error limit's keying is undocumented by CCP, and the split stays safe because both gates stop at 20 on CCP's reported remaining errors. Still to settle here: the enclave trickle cap and the priority of interactive lookups against background sync. Also from Part 07: there is no job inbox or awaited job (step 3), so the "Part 07 inbox", Vercel claim-and-wait and `budget` reply wording below is superseded; the enclave claims `esi_refresh_jobs` from Neon itself (Part 05 clean-up 5).

## In one paragraph

Today's ESI sync pipeline stays as it is. The same triggers fire, the same freshness windows apply, and the queue, retries and dead letters stay in Neon on LGI's servers. Vercel still decides what is stale from readable timestamps. Only the step that holds a token, reads ESI, projects the response and saves the result moves into the sealed service's workers. That step runs today's owner-sync engine, refresh functions, projections and ESI client behind new port implementations. Each dataset becomes one sealed document per owner (one per section for the character sheet), with a readable version number for concurrency. Asset and blueprint page ETags stay readable, as Parts 02 and 23 keep page ETags; every other ETag goes inside the sealed document. Each sheet section's `denied` flag stays readable so Part 19 can compute gaps as today. Errors stay as codes from a closed list. The enclave keeps its own rate-limit scoreboard in memory; Vercel keeps Upstash for public calls. Work moves per dataset and axis: this part moves the character axis of every personal dataset. The corp axis, including the corp half of `owned_assets` and `owned_blueprints`, moves in Part 23.

## How it works today

- **Triggers.** Routes refresh after responding, using Next's `after()`: the board (skills, jobs, sheet, character assets, run together by `refreshBoardDatasets`), the jobs page (`getJobsForUserOnView` through `live-dataset-view.ts`), the planner (assets and blueprints, both axes in one call; skill levels per character and per team), the slots readout (skills) and the corp viewer. A roster change runs the board refresh, then values net worth (`revalueAfterRosterChange`).
- **Engine.** `runOwnerSync` lists linked characters with scope health and syncs every owner in parallel (`Promise.all`). The freshness gate runs before any token is used, so a re-view inside the window is a pure Neon read. Then it vends a token, decrypted on Vercel under `EVE_TOKEN_ENCRYPTION_KEY`, and reads ESI with the held ETag. The corp axis picks a member holding the required role and writes `corp_member_roles`, `esi_snapshots` and `corp_holding_nodes`.
- **Character sheet gate.** `readSectionState` in `character-sheet/plan.ts` takes `lastRefreshedAt` and `heldEtags` from the stored section envelope, and the plan carries `previous.data` forward for parts that return 304. The structures section is forced stale while unresolved structure IDs remain.
- **Freshness.** The registry (`src/lib/esi-datasets/entries.ts`, via `freshnessGate`) is the only TTL source: skills and the live sheet tier 120 s, jobs 300 s, assets and blueprints one hour, plus hourly and daily sheet tiers.
- **Queue.** Budget exhaustion throws `EsiBudgetExhaustedError`, and `enqueueBudgetDeferral` inserts a deduplicated `esi_refresh_jobs` row. The drain runs daily inside `daily-batch`, after prices and indices and before revaluation: 5 jobs per run, 5 attempts, backoff from 15 min to 24 h. `markEsiRefreshJobDeferred` uses no attempt and records `budgetReason`, `budgetRemaining`, `retryAfterSeconds` and `budget_deferred`; telemetry records it as `rate_limited`.
- **ESI client.** The Upstash scoreboard holds error counts and rate-limit blocks by normalised path. `resolveScoreboard` falls back to memory only when `allowUnconfiguredUpstash()` is true (not hosted Vercel); in production it fails closed. `exhaustion-marker.ts` writes to Upstash. The body cache serves only unauthenticated GETs.
- **Storage.** Plaintext tables with `*_syncs` tables holding timestamps and ETags. `character_sheets` holds nine section envelopes merged with SQL `||`. Every personal table uses the merge rule `follows-character`, so rows stay put when accounts merge.
- **Errors.** `lastErrorCode` holds engine and plan result codes (such as `needs_role`, `token_unavailable`, `budget_deferred`, `worker_interrupted`), authed-read codes (`esi_<status>`, `contract_error`), or `retryCode`'s `timeout`, `connection`, `unexpected` or any `error.name`. It is an open set.

Files: `src/composition/sync/*` (notably `owner-sync-port.ts`, `owned-assets-sync.ts`, `esi-refresh-worker.ts`, `live-dataset-view.ts`); `src/platform/owner-sync/engine.ts`; `src/platform/esi/` (`scoreboard/index.ts`, `exhaustion-marker.ts`, `authed-read.ts`); `src/lib/esi-datasets/entries.ts`; `src/data/esi-refresh-jobs/`; `src/features/character-sheet/plan.ts`, `types.ts`; `src/composition/board/board-view.ts`; `src/composition/account-lifecycle/account-merge.ts`, `character-transfer.ts`; `src/app/api/industry/skill-levels/`, `team-skill-levels/`, `src/app/api/account/industry-jobs/`; `src/composition/corp-viewer.ts`, `corp-role-gates.ts`.

## What changes

Nothing visible changes for users. Behind the scenes, Vercel stops vending tokens and calling authenticated ESI for the character axis; its `after()` hooks and the drain hand stale work to the sealed service. Personal tables hold sealed documents with a readable version. The enclave keeps its own scoreboard, and error fields hold closed-list codes.

## Design

### Split of work

| Step | Today | After |
| --- | --- | --- |
| Decide to refresh | Vercel route, `after()` | Same place. Vercel runs `freshnessGate` on readable `last_refreshed_at` and enqueues one `sync` job per stale dataset (Part 07 inbox) |
| Queue, claim, retry, dead letters, alerts | Vercel and Neon | Unchanged, plus one `deferred_unavailable` case |
| Freshness gate | Engine, before the token | Pre-filter on Vercel; the engine re-checks in the enclave before using a token |
| Enumerate owners | Readable `account` and `characters` | Intersection of the custody link record (Part 08) and readable links |
| Token | Decrypted on Vercel | Custody, in enclave memory (Part 08) |
| ESI read, projection | Vercel | Workers, same `authed-read.ts` and parsers |
| Save | Plaintext upsert | Sealed under the owning account's user key, compare-and-set |

### Jobs

- **View and roster.** One job per (user, dataset, optional target), dedupe key `sync|userId|dataset|target`. Jobs carry readable IDs only and release nothing; a forged job can only refresh a user's own data into their own sealed documents. The roster job ends with net-worth valuation (Part 22).
- **Planner.** The planner's assets and blueprints trigger splits. The character axis goes to the enclave through `refreshCharacterOwnedAssetsForUser` (exists) and a new `refreshCharacterOwnedBlueprintsForUser`. The corp axis stays on Vercel through corp-only entry points until Part 23.
- **Drain.** `RUNNERS` routes by (dataset, ownerType): moved pairs post a `sync` job holding the `esi_refresh_jobs` ID and wait for the reply. The reply is `{kind, code, budget?}`, where `budget` is `{reason, remaining, retryAfterSeconds, resource}` with the normalised path, enough for `markEsiRefreshJobDeferred` and the enqueue key. `esi-refresh-worker.ts` gains one case: `deferred_unavailable` (codes `sealed_unavailable`, `sealed_busy`, `sealed_timeout`) calls a new `markEsiRefreshJobUnavailable`, uses no attempt, sets no budget fields and records its own telemetry code, so budget alerts stay clean.

### Engine reuse

The workers import `runOwnerSync`, the refresh functions, descriptors and projections. New code is the ports in `sealed-service/workers/sync/`: `listCharacters` (link intersection), `vendToken` (custody), `read` through `readSingleEndpoint` and `readPagedEndpoint`, and `readSyncState`, `save` and `stampFresh` doing sealing. `readSheet` unseals the prior section documents so `plan.ts` runs unchanged, including carry-forward. `owner-sync-port.ts` splits into the character-axis readers, which move to the workers, and the roles and corp-viewer helpers (`probeAndStoreRoles`, `fetchAndStoreCorpRoles`, `vendTokenFor` for gates), which stay until Part 23. The five sync files that import `next/server` lose that import (Part 05).

### Document shapes

Part 02's shape D: owner key, `sealed`, `key_id`, `version`, `updated_at`, readable `last_refreshed_at`. Sheet section rows also keep a readable `denied` flag, and asset and blueprint sync rows keep readable `page_etags` (ETag rule below).

| Dataset | Sealed document | Readable key | Notes |
| --- | --- | --- | --- |
| `skills` | Per character: SP, queue, levels | `characterId` | Half refreshes read, modify, compare-and-set |
| `character_industry_jobs` | Per character | `characterId` | |
| `owned_assets`, `owned_blueprints` (character axis) | Per character | owner type, owner ID | Version replaces `owned_assets_natural_key_unique`; `page_etags` stay readable |
| `character_sheet` | Per (character, section), eight sections | `characterId`, section | Readable `denied` per section; `profile` stays readable (below) |
| Corp axes and corp datasets | Part 23 | | |

The `profile` section holds only public `/characters/{id}/` data (birthday, security status), so it stays a readable row written by the workers. While unresolved structure IDs remain, the workers write the structures section's readable `last_refreshed_at` as null, so the pre-filter forces it stale as today.

**Readable `denied`.** Today each sheet section envelope carries `denied: true` after an ESI 403 or missing scope (`plan.ts`), and board assembly turns it into gaps and section states. The workers write it to a readable column on each section row, in the same statement as the sealed envelope, which keeps its own copy so `plan.ts` runs unchanged. It says only that a section cannot be read, like scope health. Part 19 reads it; Part 03 lists it.

**ETag rule.** This part settles it for every ESI sync dataset:

- *Readable:* page ETags of paged bodies, `page_etags` in the asset and blueprint sync rows (and `corp_structure_syncs` in Part 23). Those bodies cannot be guessed from their ETags, and the ETags show only page count and when a page changed, which page count and the readable `version` and `last_refreshed_at` already show.
- *Sealed:* every other ETag (skills, skill queue, industry jobs, sheet parts), inside the sealed document. These bodies are single and often small, and a common body such as an empty job list or queue gives the same ETag for every character, so the ETag can reveal content.

Parts 02, 22 and 23 follow this rule. Part 02's readable-ETag list narrows to page ETags (skills, queue and jobs ETags become sealed), Part 22's page ETags are readable, and Part 23 keeps corp structure page ETags readable. If the owner chooses padding (question 2), page ETags move inside the seal too, since an empty-list page ETag would show what padding hides.

### Write protocol

1. Read readable `version` v, `last_refreshed_at`, `key_id` and, for assets and blueprints, `page_etags`. A document whose `key_id` is not the owning account's current user key counts as absent: stale, no ETags.
2. Unseal the document at v. It supplies the sealed ETags and the previous data for carry-forward.
3. Read ESI. If every part returns 304, update `last_refreshed_at` only.
4. Otherwise merge fresh parts with carried-forward parts, seal with the sealed ETags inside and associated data covering table, owner, section, version v+1 and key ID (Part 09). Write with `UPDATE … WHERE version = v`, or insert if absent, setting `last_refreshed_at`, readable `page_etags` and the section's readable `denied` in the same statement. No match returns `superseded`.
5. Signal Part 19's view recompute.

One write, no transaction, which suits the Neon HTTP driver.

### Account merges and transfers

A merge leaves rows in place but sealed to the source account's key. Step 1 treats them as absent, so the next view re-syncs. The merge or transfer (Part 11) also enqueues a job that re-seals the moved characters' documents under the survivor's user key. Both accounts were proven at that login, so the re-seal is allowed.

### Size

Document size shows approximate asset, job and blueprint counts and empty lists, more precisely than page counts or page ETags. Sealing the small-body ETags keeps them from adding to that signal (ETag rule above). This part accepts the size signal unless the owner chooses padding (question 2). Parts 02 and 03 record the outcome.

### Errors and logs

All allowed codes live in one constant in `src/data/esi-refresh-jobs/constants.ts`: today's engine, plan and authed-read codes plus `sealed_unavailable`, `sealed_busy`, `sealed_timeout`, `link_mismatch`, `superseded` and `unexpected`. `retryCode`'s `error.name` branch and unknown codes map to `unexpected`. Enclave logs hold dataset, job ID, code and duration only.

### Scoreboard

Workers start with an injected memory scoreboard selected by explicit config (`ESI_SCOREBOARD=memory`), with the exhaustion marker off. This is the one change in `src/platform/esi`. ESI reports the remaining error budget on each response, so a restart re-learns it.

### Capacity

| Control | Default |
| --- | --- |
| Concurrency | Today's per-job parallelism. Location polling (Part 17) runs first |
| Single flight per (owner, dataset) | Duplicates join the running job |
| Inbox bound | 10,000 pending jobs, a runaway guard only. Above it, view jobs drop and drain jobs reply `sealed_busy` |
| Error-budget floor | 20, as today |
| Drain step in `daily-batch` | 90 s; unanswered jobs return without using an attempt |
| Order | Prices, indices, drain, revaluation, unchanged |

### Tests

- Pre-filter gate tests: a re-view inside the window enqueues nothing; every trigger above, including the jobs page and both skill-level routes, enqueues the right jobs.
- A sheet section with mixed 200 and 304 parts carries forward correctly; a structures section with unresolved IDs is forced stale; a denied section sets readable `denied` in the same write, and a later success clears it.
- Readable ETag columns exist only as asset and blueprint `page_etags`; skills, queue, jobs and sheet ETags appear only inside sealed documents.
- A merge test: the survivor sees stale data re-sync and re-sealed under its key.
- Unlink, purge and sale removals skip silently; only a true account conflict raises `link_mismatch`.
- Drain cases: budget deferral keeps all four fields; `deferred_unavailable` uses no attempt and no budget fields.
- `lastErrorCode` and `syncError` only hold members of the code constant; the workers never resolve Upstash.
- Adversarial: forged jobs, replayed versions, swapped `key_id`.

## Data: readable vs encrypted

| Data item | Stays readable on LGI servers | Encrypted | Where computed |
| --- | --- | --- | --- |
| `esi_refresh_jobs` rows and `sync` job rows | Yes | No | LGI server; sealed service runs jobs |
| `last_refreshed_at`, `version`, `key_id` | Yes | No | Sealed service writes; LGI server pre-filters |
| Per-section `denied` flag (sheet) | Yes | No | Sealed service writes; LGI server computes gaps (Part 19) |
| Asset and blueprint `page_etags` | Yes, unless padded | No | Sealed service |
| Skills, jobs, character assets and blueprints, eight sheet sections; skills, queue, jobs and sheet ETags | No | Yes, user key | Sealed service; reads per Part 19 |
| `profile` sheet section (public birthday, security status) | Yes | No | Sealed service |
| Approximate counts via document size | Yes, unless padded | No | n/a |
| Tokens | No | Enclave memory; sealed at rest (Part 08) | Sealed service |
| Error codes | Yes | No | Both |
| Enclave scoreboard | Not stored | Memory only | Sealed service |
| Upstash scoreboard, public body cache | Yes | No | LGI server |
| Corp axes, `corp_member_roles` | Part 23 | Part 23 | Vercel until Part 23 |

## Hard rules

1. [Agreed] Users notice nothing. Trigger points, freshness windows, page timings and states (including "needs role") stay as today.
2. [Agreed] EVE tokens are opened only inside the enclave. Vercel never vends a token for a moved (dataset, axis).
3. [Agreed] Character assets, blueprints and industry jobs are plaintext only in enclave memory and the owner's browser.
4. [Proposed] The same holds for skills and every sheet section except `profile`, which stays readable as public data.
5. [Agreed] The queue, claiming, scheduling, retries and dead letters stay on LGI's servers.
6. [Agreed] `pnpm check` and `pnpm verify` pass with zero Fallow findings, covering the workers.
7. [Proposed] Reuse, do not fork: the engine, refresh functions, projections, `plan.ts`, `src/platform/esi` and the registry build into the workers. Allowed changes: the ports, axis-only refresh entry points, the `owner-sync-port.ts` split and the scoreboard selector.
8. [Proposed] Vercel enqueues only datasets its readable pre-filter finds stale. The enclave re-checks before using a token. One job per dataset.
9. [Proposed] Sync only characters in both the custody link record and the readable links. A character missing from either side is skipped silently. `link_mismatch` and an alert apply only when both sides name the character under different accounts.
10. [Proposed] A document whose `key_id` is not the owning account's current user key counts as absent. Merges and transfers enqueue a re-seal under the survivor's key.
11. [Proposed] One sealed document per owner and dataset (per section for the sheet), written by compare-and-set on a readable version; a lost race returns `superseded`. Page ETags of paged bodies (assets, blueprints, and corp structures in Part 23) stay readable; every other ETag is sealed inside the document. Parts 02, 22 and 23 follow this rule.
12. [Proposed] Associated data binds table, owner, section, version and key ID.
13. [Proposed] Readable sync state is limited to owner key, dataset or section, `last_refreshed_at`, `version`, `key_id`, each sheet section's `denied` flag, asset and blueprint `page_etags`, and job fields.
14. [Proposed] Error fields and replies hold only members of the code constant; logs hold dataset, job ID, code and duration only.
15. [Proposed] Jobs carry readable IDs only. Only the Vercel service secret may enqueue them.
16. [Proposed] An enclave outage, a full inbox or a timeout never uses a retry attempt and never writes budget fields.
17. [Proposed] The enclave never resolves or dials Upstash: a Fallow boundary bars `@/lib/upstash` from the workers zone, and a test checks the selector.
18. [Proposed] Location polling takes priority over sync for enclave capacity.
19. [Proposed] The `sealed_service` Neon role may write only the personal sealed tables, their readable sync columns, `esi_refresh_jobs` and the `sync` job rows. It writes `corp_member_roles` only after Part 23.
20. [Proposed] Each (dataset, axis) moves whole: Vercel and the enclave never both fetch it. Routing in `RUNNERS` is by (dataset, ownerType).
21. [Proposed] Fallow, per file: the character-axis half of `owner-sync-port.ts`, `authed-read.ts` and the token service live in the workers zone; app code may not import them.

## Assumptions

- **Authenticated ESI rate limits are keyed per application and character, and the error limit per IP.** Separate scoreboards are then correct. Check CCP's docs and watch for 429s on staging.
- **The relay hop keeps view-to-fresh timings as today.** Compare on staging for the largest roster.
- **The largest character asset document fits one Neon request.** Measure the largest owner (Part 02 has chunking).
- **No private-read cache remains after Parts 04 and 19.** Grep for `'use cache'` and `revalidateTag` in personal queries.
- **Readable timestamps, version bumps, document sizes, section `denied` flags and page ETags are acceptable metadata.** Part 03 decides and lists them.

## What users see

Nothing new. During an enclave outage, personal data stays at its last sync, as during an ESI outage today.

## Questions for the owner

1. **Sheet granularity: per section or per character?** Recommend per section: it keeps the three tiers.
2. **Document size: accept that it shows approximate counts, or pad to size buckets?** Recommend accepting, recorded in Parts 02 and 03.
3. **Drain: Vercel claims and waits, or the enclave claims from Neon?** Recommend Vercel. Retry policy, alerts and telemetry stay put.
4. **Scoreboard: enclave memory or shared Upstash?** Recommend memory: one fewer outbound host.
5. **`owned_assets` and `owned_blueprints`: split by axis now, or hold both until Part 23?** Recommend splitting, so personal assets move in this phase. Holding them adds a Part 30 dependency.
