# Part 15: Where map logic runs: sealed service or browsers

**Status:** Draft for owner review

**Carried from the Part 2 review (2026-10-07), to decide here:** map reads never touch the sealed service (browsers subscribe to Convex and decrypt). The owner confirmed rule-running edits belong on the server side, not in browsers. Open: a direct path for rule-free edits (for example a system rename or custom label), where the browser seals the one field and writes it to Convex without the sealed service, at the cost of two edit paths. Also from Part 2: today's indexes stay, using keyed system tags in place of sealed system IDs, and signatures are readable.

**Carried from the Part 07 review (2026-10-09):** no map version and no 7-day dedupe (per-row version checks only); no follow-up reply, so elimination is a second ordinary `map` request, as today; non-wormhole `identifySignature` stays a direct Convex mutation; deadlines are 30 s for writes and 20 s for reads; a map edit costs about 5 to 6 Convex calls (5 with one reply watch per browser).

## In one paragraph

Today every mapper rule runs on LGI's servers: Convex mutations plus two Vercel resolvers. Once map contents are sealed, those rules need plaintext, so they must run somewhere that can decrypt. In Option 1, today's mutation logic moves into the sealed service, nearly unchanged. Convex keeps its tables and reactive queries but stores sealed rows that only the enclave writes, and browsers decrypt what Convex pushes. In Option 2, every member's browser runs the rules as deterministic reducers over an ordered sealed log (the old Path A). This part recommends Option 1: it keeps the app behaving as today, keeps the work on the server side, and reuses the most code. The cost is that the enclave sees active maps in plaintext, every mapper change becomes an enclave release, and map edits pause while the sealed service is down.

## How it works today

- **Edits.** Most edits go through `useChainAuthoringMutations`, with optimistic updates in Convex's local query store. A rejected mutation is swallowed and the optimistic change rolls back (`swallowMutationRejection`). Some edits are not optimistic and await the mutation directly: `applyScan` (the "Scan applied" toast shows only after the result), `removeSignatures` and `restoreSignatures` in the missing-signature flow, and `identifySignature`. Each mutation checks the caller with `requireMapAccess` (Convex JWT identity plus the `mapAccess` projection), then uses `ctx.db`: about 190 call sites in production map files (161 excluding fixtures), and about 550 in map tests. While offline, the Convex client keeps unsent mutations and retries them on reconnect.
- **Reads.** Reactive paginated queries (`watchMapSystems`, `watchMapConnections`, `watchUnresolvedHoles`, `watchMapEvents`, `watchSystemSignatures`, `watchMapGlanceGroups`). `watchSystemSignatures` reads one system's signatures by the `by_map_signature` index (`mapId`, `systemId`, `signatureId`). `watchMapGlanceGroups` returns small deduplicated (system, group) pairs computed on the server from `by_map_live_group`.
- **Jumps.** The location poller (a Convex action) writes `characterLocation` with `transitionObservedAt`. `JumpDoorbellObserver` is mounted in `ChainLive.tsx` only when `canEdit`, and `ringOwnDoorbells` rings `/api/maps/jump` only for `ownTrackedCharacterIds`. Vercel reads evidence over `httpJump.ts`, matches the hole (`hole-matching.ts`, `movement-classification.ts`) and writes back through `resolveJumpAuthoring`. So a jump is authored only on maps the pilot's own account has open with edit rights. On open, the pending transition is still processed if it is within `JUMP_CAPTURE_WINDOW_MS` (10 minutes). The presence heartbeat (`engine.heartbeat`) carries no map ID.
- **Elimination.** The browser drives it. `signature-elimination-client.ts` posts to `/api/maps/signature-elimination` after paste, identify and type set. A per-system digest cache stops the same paste being resolved twice. On success it shows "Signature identified" or "Signatures identified" and notifies `subscribeEliminationApplied` listeners, which drive the update flash (`use-signature-update-flash.ts`). The Vercel resolver applies results through Convex.
- **Wormhole observations.** Both Vercel resolvers write `wh_observations` rows to Neon: a readable, cross-map record of wormhole types per system, with a `dedupe_key` that links back to a map.
- **Statics.** Adding a system schedules `fetchSystemStatics`, which calls `/api/universe/statics/[systemId]` once per system.
- **Crons** (`convex/crons.ts`): hourly lifetime collapse (`collapseExpiredConnections`), daily chain purge and settle (`purgeExpiredChainTombstones`), and daily signature tombstone purge. They run whether or not anyone has the map open. Purging an expired system also deletes its signatures and signature activity by (`mapId`, `systemId`) in `deleteSystemChildren`, so they do not come back if the system is re-added.
- **Direct deletes.** Besides the crons, map deletion (`mapPurge.ts`, including `mapEvents` and `mapNotes`), tracking teardown and account merge (which touch `mapJumpBookkeeping`) delete map rows in Convex.
- **Size.** About 7.3k non-test lines of Convex map files, 3.8k in `src/data/maps` and 1k in the two Vercel resolvers. `src/scripts/map-replay.ts` drives the map through Convex fixture functions.

Files: `convex/map*.ts`, `convex/lib/map*.ts`, `convex/mapTrackingTeardown.ts`, `convex/accountMerge.ts`, `convex/engine.ts`, `convex/crons.ts`, `convex/httpJump.ts`, `convex/schema.ts`, `src/data/maps/`, `src/data/wh-observations/`, `src/composition/jump-resolver/`, `src/composition/signature-elimination/`, `src/mapper/chain/`, `src/mapper/tracking/`, `src/mapper/signatures/`, `src/scripts/map-replay.ts`.

## What changes

Under Option 1, nothing changes for users. The pages, edits, optimistic feel, toasts and flashes, which maps receive jumps, collapse timing, 7-day log and 24-hour undo all stay as they are. Only where the rules run changes. Under Option 2, users would see changes: collapse and chain settling would happen only while someone has the map open, and phones would carry the whole rule set.

## Design

### Comparison

| Criterion | Option 1: sealed service | Option 2: browser reducers |
|---|---|---|
| Principle 1 (notice nothing) | Met. Crons, statics and jumps run as today | Not met. No hourly collapse for unopened maps, and heavier pages |
| Principle 3 (server does the work) | Met | Fails: all logic moves to browsers |
| Code reuse | Mutation logic ports onto a storage interface. `src/data/maps` and the resolvers move, minus `wh_observations` | Rewrite as reducers: 27 clock, random or locale calls removed, creation-order ties replaced, rebase added |
| Nobody online | Crons find due rows by readable timestamps and hand the work to the enclave | Work waits for a member's browser |
| Jump authoring | Poller and map logic share the enclave, so no doorbell or Vercel hop | Pilot's browser decrypts its own location row and authors, close to today |
| Enclave release churn | Every mapper change is an enclave release (Parts 06, 27) | Enclave unaffected by mapper work |
| Map plaintext in the enclave | Active maps, in memory only | None |
| Enclave outage | Edits queue, then roll back silently on expiry, as today. Maps stay readable from keys in browsers | Manual edits continue while keys are cached |
| Browser load | Decrypt only, including one small sealed summary row | Full rule set, replay, statics table |
| New machinery | Sealed request path (Part 07), enclave-only write, per-map version | Ordered log, signed ops, rebase, snapshots, reducer versions, fork checks |

Decision 1 already gives the enclave every key, so Option 1 widens what a bug could expose, not what the enclave could read. Under both options an enclave outage stops logins and tracking, so Option 2's outage advantage covers only manual edits.

### Option 1, concretely

1. **Edit path.** The browser seals an intent (today's mutation name and arguments) to the attested key and sends it as a sealed request through Convex (Part 07). The enclave authenticates the account by its browser session key and resolves the caller's role only from Part 12's inputs ("Deciding membership": the verified snapshot, its own link record, token state and affiliation observations), never from Convex claims. It applies `rolesAllow` and runs the ported handler; the commit then re-checks the readable `mapAccess` row as Part 16 describes. `setTracking` writes readable `mapTracking` and stays a plain Convex mutation.
2. **Storage interface.** A `MapStore` (get, indexed range reads, insert, patch, delete) replaces `ctx.db`, over the decrypted map. Systems and connections are bounded at 128 in the operations that scan them (`COLLAPSE_MAP_SCAN_CAP`, `HOME_SYSTEM_SCAN_CAP`); signatures, signature activity (256 rows per paste, `MAP_SCAN_ROW_LIMIT`) and the 7-day events are not. Each handler runs as one transaction, flushed in one call to an enclave-only Convex mutation that applies only if the map's readable write version still matches. The enclave serialises edits per map (Part 05).
3. **Row binding.** Each sealed row is AEAD-sealed under the map key with associated data (`mapId`, table, row ID, key epoch, write version at write). The enclave and browsers reject a mismatch, so a moved or swapped ciphertext fails. No heavier anti-rollback machinery at 18 users.
4. **Reads.** The Convex queries stay and return sealed rows; a browser decrypt layer restores today's row shapes. Row shapes and reads are as Part 16 sets them: no readable system reference and no blind index, signatures read whole-map (live only) and filtered per system in the browser, and unresolved holes split out of `watchMapConnections` in the browser.
5. **Summary row.** The enclave keeps one sealed `mapGlance` row per map holding glance groups only, rewritten at each commit (Part 16). The chain view reads it instead of every signature, so browsers decrypt one small row; `watchMapGlanceGroups` is deleted, and unresolved holes come from the browser-side split in step 4.
6. **Optimistic feel.** `optimistic-authoring.ts` is kept and pointed at a store over the decrypted rows with the same `getQuery`/`setQuery` shape (contract in Part 16). The non-optimistic sites (`applyScan`, `removeSignatures`, `restoreSignatures`, `identifySignature`) get a latency budget measured in staging, like the 250 ms optimistic budget.
7. **Jumps.** `engine.heartbeat` gains the IDs of maps the tab has open (readable metadata, principle 2). When the poller sees a transition, the workers run the ported resolver and `mapJumpAuthoring` logic only for maps where the character's own account has the map open and can edit. When a map is opened, the enclave processes the latest transition within `JUMP_CAPTURE_WINDOW_MS`, using `mapJumpBookkeeping`, as the doorbell does on mount. The doorbell kind of `/api/maps/jump` and `httpJump.ts` are retired; `confirm` and `typed-hole` become sealed requests.
8. **Elimination.** Runs in the workers after the same triggers as today, in the same queue turn as the triggering commit but as its own write (Part 16). The main reply carries the ported mutation's return value unchanged; the elimination result follows as a second reply in today's `SignatureEliminationResponse` shape (Parts 07 and 16), so the requesting tab shows the same toast and flash. Today's digest gate stays in the browser and sets the request's `eliminate` flag; the HTTP call to `/api/maps/signature-elimination` retires only once that parity is tested.
9. **Wormhole observations.** The resolvers' `wh_observations` writes, the table and `src/data/wh-observations/` are dropped when the resolvers move (06 marks it Drop).
10. **Statics.** Placeholders are applied inline from the in-memory statics table (Part 24). There is no per-system fetch.
11. **Crons and deletes.** Crons stay in Convex and find due work by readable `sweepAfter` and `purgeAfter` only, then enqueue one job per map for the workers. The workers re-check sealed state, collapse, delete purged systems' children (which needs the sealed `systemId`) and settle, as Part 16's cron split sets out (correcting 06). Convex deletes directly only what Part 16 allows: signature tombstones, events, whole maps through `mapPurge.ts`, and readable `mapJumpBookkeeping` rows on tracking teardown, location purge and access purge. Each Convex delete of sealed rows uses readable fields only and bumps the map's write version in the same transaction.
12. **Cache.** Decrypted maps are kept per map and key epoch, evicted after 10 minutes idle, on rotation and at the cap (Part 05), and dropped whenever the enclave sees a write version it did not make. Never written to disk.
13. **Outage.** Queued sealed requests are kept and retried across short enclave outages, as Convex does for mutations, then expire (Part 07). On expiry or rejection an optimistic change rolls back silently, as `swallowMutationRejection` does today (Part 16, optimistic contract item 3). The awaited sites keep only the toasts their callers show today ("Remove failed", "Restore failed", "Answer not saved"). Reads keep working from cached map keys.

### Dropped from older docs

Path A as the default, the Durable Objects serialiser, the 30-day op log, signed op frames, snapshot attestation banners, lazy lifetime expiry, reducer upgrade commits, and DR-BACKGROUND's "tracking stops when no client is open" (superseded by decision 1). From current code: `wh_observations`, and `mapNotes` (written only by fixtures; notes are not a current feature). If Option 2 is chosen, DR-C3 and 01's "Mapper engine in the browser" become the base for Parts 16 and 17.

## Data: readable vs encrypted

| Data item | Stays readable on LGI servers | Encrypted | Where computed |
|---|---|---|---|
| Map rows: systems, connections, signatures, signature activity | `mapId`, `rowKey`, `version`, `keyEpoch`, `purgeAfter`, `sweepAfter` (hour), exactly as Part 16's row shapes | Every content field, including `systemId`, `signatureId` and tombstones | Sealed service writes; browser decrypts |
| `mapEvents` | `mapId`, `at`, `purgeAfter` | `kind`, `actor`, payload (Part 16) | Sealed service writes; LGI server purges |
| `mapJumpBookkeeping` | `mapId`, `characterId`, `lastProcessedTransitionAt` (Part 16) | No | LGI server and sealed service |
| Per-map write version (`mapHeads.mapVersion`, Part 16) | Yes | No | LGI server (Convex) checks and bumps |
| Open map IDs in presence heartbeat | Yes | No | LGI server |
| Sealed requests and replies | Map ID, request ID, expiry | Intent, reply and the elimination follow-up reply | Sealed service |
| `mapAccess`, `mapTracking` | Yes | No | LGI server; enclave verifies (Part 12) |
| `mapGlance` summary row: glance groups only | `mapId` | Contents | Sealed service computes; browser decrypts |
| Unresolved-hole split, per-system signature filter | Not stored | Not stored | Browser (Part 16) |
| Decrypted map cache | Not stored | Memory only | Sealed service |
| Statics table | Public data | No | Sealed service memory |
| `wh_observations`, `mapNotes` | Dropped | Dropped | None |

## Hard rules

1. [Agreed] Map contents are sealed (principle 2).
2. [Proposed] The readable fields are exactly those in Part 16's row shapes and the table above. As in Part 16, this departs from 06: there are no HMAC blind indexes and no readable system reference.
3. [Agreed] The mapper looks and behaves as today: no new prompts, banners or encryption copy (principle 1, decision 2).
4. [Agreed] Collapse, chain settling and statics keep working when nobody has the map open, as today's crons do (principle 1).
5. [Agreed] Location polling and transition detection run in the sealed service (decision 1).
6. [Proposed] Map logic runs in the sealed service (Option 1). Convex functions touching map tables use readable fields only.
7. [Proposed] Only the enclave inserts or patches sealed map rows, through one Convex mutation guarded by the enclave service credential (Part 07) and a per-map version check. Convex may delete sealed rows only by readable retention or lifecycle fields, and each such delete bumps the write version in the same transaction.
8. [Proposed] One writer per map: the enclave serialises per map, Convex rejects stale versions, and the enclave drops its cached map on any version it did not write.
9. [Proposed] Each sealed row is AEAD-sealed with associated data (`mapId`, table, row ID, key epoch, write version); readers reject a mismatch.
10. [Proposed] Each edit is authorised in the enclave from the authenticated account and verified roles, using today's capability rules unchanged.
11. [Proposed] Ported logic keeps today's caps, retention constants and semantics. Shared modules stay one source, built into both the app and the enclave image under the workers zone.
12. [Proposed] Decrypted maps live only in enclave memory, evicted after 10 minutes idle, on rotation and at the cap. Sealed request headers, logs and error codes never carry content.
13. [Proposed] Enclave workers write no map-derived content to readable stores.
14. [Proposed] One jump author per map, only for maps the character's own account has open with edit rights; the doorbell path is removed when enclave authoring ships, with no dual running.
15. [Proposed] Sealed requests are retried across short outages, then expire (Part 07). An expired or rejected optimistic edit rolls back silently, as today (Part 16). Awaited sites keep only their existing toasts ("Remove failed", "Restore failed", "Answer not saved") and add none.
16. [Proposed] Optimistic edits confirm within 250 ms, and non-optimistic sites within a budget measured in staging.
17. [Proposed] No per-system statics fetch; statics come from the in-memory table.
18. [Proposed] Parity first: today's Convex map tests must pass against `MapStore` before any map moves, including re-adding a purged system and elimination toast and flash parity.

## Assumptions

| Assumption | How to check |
|---|---|
| Handlers port without semantic change | Existing Convex map tests against a `MapStore` adapter (Part 32) |
| A whole map, including unbounded signatures and 7-day events, fits enclave memory | Production row counts per map |
| Edits fit the 250 ms optimistic budget and the non-optimistic budget | `map-replay.ts` in staging through the sealed service |
| Pagination needs no content index beyond `by_map_live_group` (replaced by `mapGlance`) and `by_map_signature` (replaced by whole-map live reads filtered in the browser, Part 16) | Audit the map query indexes in `convex/schema.ts` |
| One flush per edit fits Convex write limits | Largest scan apply (256 rows) in staging |
| Enclave outages are rare and short | Staging uptime over several weeks before Phase 2 |

## What users see

Nothing new under Option 1. During a long enclave outage, an optimistic edit shows, then rolls back silently, as a rejected edit does today; awaited flows show only the toasts they show today. There is no new banner or toast. Option 2 would bring visible changes, which is the main reason not to recommend it.

## Questions for the owner

1. **Which option?** Recommended: Option 1. It meets principles 1 and 3 and reuses the most code. Option 2 keeps map plaintext out of the enclave, at the cost of the largest rewrite and visible changes.
2. **Under Option 1, is pausing edits during an enclave outage acceptable?** Recommended: yes, with queued retries and today's silent rollback on expiry, and no new UI. Maps stay readable, and logins and tracking pause anyway under decision 1 (playbook in Part 29).
3. **How long may map plaintext stay cached in the enclave (06 open question 4)?** Recommended: 10-minute idle eviction (Part 05). Decrypting per call adds a Convex read per edit and gains little.
4. **Which maps receive an observed jump?** Recommended: as today, only maps the character's own account has open with edit rights, using open map IDs in the heartbeat. Alternative, a behaviour change: every map where the character is tracked and the account can edit, so tracked maps nobody has open would start gaining systems and connections.
