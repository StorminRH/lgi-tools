# Part 16: Porting map logic and sealing Convex map rows

**Status:** Draft for owner review

**Carried from the Part 07 review (2026-10-09):** elimination is a second ordinary `map` request (no follow-up slot; the client's 15 s timeout and digest gate stay as today). Collapse and purge are scheduled by the enclave from readable `sweepAfter` and `purgeAfter`, with no `sealedJobs` row per map. Non-wormhole `identifySignature` stays a direct Convex mutation, checking the system is live by its readable `purgeAfter` and keyed by the opaque system row ID. No map version and no applied-request dedupe. No latency budgets (Part 01), so the 100 ms targets below become staging observations, not rules. Request rows carry no `userId`; prefer one reply watch per browser.

## In one paragraph

Under Option 1 (Part 15), today's Convex map mutations move into the sealed service's workers almost unchanged. They run against a small storage interface instead of `ctx.db`. Convex keeps its tables, reactive queries, access checks, tracking, lifecycle, whole-map purges and timestamp purges. Map rows become sealed rows: readable `mapId`, an opaque `rowKey`, a version, a key epoch and a few scheduling timestamps, with content sealed under the map key. Only the enclave writes them, and members' browsers decrypt them. The two Vercel steps (the jump doorbell and signature elimination) fold into the workers, and jumps still reach only maps the pilot has open with edit rights. This part also fixes the browser's optimistic contract and how commits resist forged or stale rows. Users see nothing new.

## How it works today

- Browsers call public Convex mutations directly: `applyScan`, `identifySignature`, `removeSignatures`, `restoreSignatures`, `linkStubToResolvedConnection`, six field setters, `setHomeSystem`, `addSystemFromNode`, `severConnection`, `restoreSeveredBranch` and `restoreConnection`. Each checks the role with `requireMapAccess` (through `ctx.auth`) and uses plaintext rows. Bodies also read outside the map tables: `eventActor` reads `mapAccess` claim characters and `mapTracking`; `requireTrackedSystem` (called by `applyScan`) reads `mapTracking` and `characterLocation`; the collapse sweep calls `readTrackedPilotSystemIds`.
- `useChainAuthoringMutations` adds optimistic updates to 11 of them, with `optimistic:` temp IDs for creates. `applyScan`, `identifySignature`, signature remove and restore, and stub linking have none and are awaited: `applyScan` returns counts and `missing`, which feed `replaceMissing` and the "Scan applied" toast; `identifySignature` returns `identified.changed`. Rejections roll back silently through `swallowMutationRejection`.
- Two steps run on Vercel. `/api/maps/jump` takes `doorbell`, `confirm` and `typed-hole`. `/api/maps/signature-elimination` runs after identify, missing-signature confirms and type sets. Both read evidence through Convex HTTP actions, compute with public assets and Neon statics, write back, and emit `wh_observations`. The elimination client returns `SignatureEliminationResponse` (`applied`, `quiet` or none, per-system `signatureIds`), shows "Signature identified" or "Signatures identified" through `announceApplied`, flashes through `subscribeEliminationApplied`, gates follow-ups per tab on a write digest (`eliminationFollowUpNeeded`) and times out after 15 s.
- `JumpDoorbellObserver` mounts only inside `ChainLive` when `canEdit` is true. It rings per `mapId` for the user's own tracked characters, retries every 15 s up to 5 times, and on mount catches up transitions up to 10 minutes old (`JUMP_CAPTURE_WINDOW_MS`). So jumps reach only maps the pilot has open with edit rights.
- Adding a system schedules `fetchSystemStatics`, then `applyStaticPlaceholders`.
- Crons: hourly ceiling collapse (connections at least 4 h past `lifetime.latestAt`, using tracked pilots' systems, severing as a fallback); daily chain purge (expired systems with children found by `systemId`, removed connections, expired events); daily signature tombstone purge.
- Other direct deletions: `purgeMapBatch` deletes every `MAP_PURGE_TABLES` row by `by_map`; `mapJumpBookkeeping` rows go through `purgeForMap` (from `httpMapAccess.ts`), `deleteForMapCharacter` on tracking teardown (index `by_map_character`) and `characterLocationPurge` (index `by_character`).
- Account merge reads `lastProcessedTransitionAt` in `snapshotMergeTracking`, carries it through Neon `pending_tracking_merges`, and writes it back in `restoreTransitionStamp`.
- Reads split connections on `toSystemId` null, read live signatures per open system (`watchSystemSignatures` filters tombstones on the server) and list deduplicated glance groups.
- Creation time is read from `_creationTime` in `mapScanApply.ts:264,290`, `mapStaticClaim.ts:236`, `mapScanElimination.ts:293`, and in the browser in `connection-hallway.ts:311`, `connection-intelligence.ts:155` (lifetime estimate), `stub-layout.ts`, `optimistic-authoring.ts:453`, `signature-model.ts` and `jump-resolution.ts:143`. Resolution candidates reference connections as `v.id('mapConnections')`.
- Dev fixtures (`placeSystemFixture`, `upsertSignatureObservation`, `insertNoteFixture` and others) write plaintext rows, and the public `readMapCollection` reads them, driven by `pnpm map:replay`. Only fixtures write `mapNotes`.
- One-off backfills: `backfillHallwayConnections`, `backfillStaticPlaceholders`, `backfillChainRetention`.

Files: `convex/{mapScan,mapAuthoringCollapse,mapAuthoringFields,mapAuthoringHome,mapAuthoringTombstone,mapAuthoringSweep,mapAuthoringEvents,mapChainCleanup,mapChainEvents,mapStatics,mapHallwayBackfill,mapJumpAuthoring,mapJumpIdentity,mapJumpEvidence,mapJumpBookkeeping,mapChainConnections,mapChainSystems,mapPurge,mapTrackingTeardown,characterLocationPurge,httpMapAccess,accountMerge,httpJump,mapFixtures,mapFixture{Holes,Notes,Place,Remove,Signatures,Tracking},crons,schema}.ts`, `convex/lib/{mapScanApply,mapScanElimination,mapScanState,mapScanSelection,mapStaticClaim,mapSignatures,mapSignatureCleanup,mapSystemLookup,mapConnectionLookup,mapEntityContracts,observationKey}.ts`, `src/composition/{jump-resolver,signature-elimination}/resolver.ts`, `src/data/maps/{hole-matching,movement-classification,chain-collapse,signature-eliminator,semantic-write}.ts`, `src/mapper/chain/{ChainLive.tsx,optimistic-authoring.ts,stub-layout.ts}`, `src/mapper/authoring/connection-intelligence.ts`, `src/mapper/tracking/{JumpDoorbellObserver.tsx,doorbell-model.ts}`, `src/mapper/signatures/{signature-elimination-client.ts,use-signature-missing-flow.ts,use-identify-signature.ts}`, `src/scripts/map-replay.ts`.

## What changes

Nothing visible changes for users. Map edits travel as sealed requests (Part 07) to the workers, Convex stores sealed rows, and browsers decrypt them. Which maps receive jumps, every toast and flash, and the awaited edit flows stay as today.

## Design

### Storage interface

Ported code runs against a `MapStore` with two ports:

- **Data:** the `ctx.db` subset used today (`get`, indexed `query` with `take`, `unique`, `collect`, `paginate`, then `insert`, `patch`, `replace`, `delete`), plus `now()` and a job sink in place of `ctx.scheduler`.
- **Principal:** actor `userId`, role, claim characters, tracked characters and their locations (decrypted from Part 17's sealed rows). It replaces `ctx.auth` and the `mapAccess`, `mapTracking` and `characterLocation` reads in `requireMapAccess`, `eventActor`, `requireTrackedSystem` and `readTrackedPilotSystemIds`.

| Implementation | Used by | Behaviour |
|---|---|---|
| Convex adapter | Convex, until each map migrates | Wraps `ctx.db` and `ctx.auth` |
| In-memory adapter | Workers | Loads the map's sealed tables, builds the same indexes, collects a write set, seals changed rows and commits once |

The mutation bodies move into `src/data/maps/engine/`, a `data`-zone module, because `convex/` may not import a sealed zone (amends Part 05). Code moves and is never copied. `_creationTime` becomes a sealed `createdAt` that the store supplies.

### What moves and what stays

| Function group | Runs in |
|---|---|
| Scan apply and signature intents, elimination, jump authoring and identity, statics placeholders (Part 24), sever, collapse, restore, field setters, tombstones, home | Workers |
| Reactive reads, `mapAccess`, `mapTracking*`, `mapPurge`, `mapTrackingTeardown`, `characterLocationPurge`, `httpMapAccess` bookkeeping purge, account merge, purges by `purgeAfter`, finding due sweeps | Convex |

### Vercel steps folded in

| Today | After |
|---|---|
| Doorbell to `/api/maps/jump` | The poller (Part 17) hands each transition to map logic only for maps where the character's own account has a warm editor tab, using the open map IDs and editor flag on the heartbeat (Parts 15 and 17). A map opened within 10 minutes of a transition still catches it up, with the `prevFresh` rule. `JumpDoorbellObserver` and the doorbell kind are deleted |
| `confirm`, `typed-hole` | Sealed requests of the same names |
| `/api/maps/signature-elimination` | Runs in the same queue turn after the triggering commit, as its own write. The browser sets an `eliminate` flag on the request from today's digest gate |
| `wh_observations`, `observationKey` | Dropped (Part 04) |

**Replies.** Every reply carries the ported mutation's return value unchanged (`applyScan` counts and `missing`, `identified.changed`). The worker replies after the main commit, before elimination, so the awaited path is no longer than today. The elimination result follows as a second reply in today's `SignatureEliminationResponse` shape, reporting `applied` only when rows changed. `announceApplied`, the toast and `subscribeEliminationApplied` run in the requesting browser only.

### Sealed row shapes

Every sealed row has readable `mapId`, `rowKey`, `version` and `keyEpoch` (index `by_map_epoch`, Part 13). New rows get an opaque `rowKey` from the enclave.

| Table | Extra readable fields | Indexes kept | Sealed body |
|---|---|---|---|
| `mapSystems` | `purgeAfter` | `by_map`, `by_purge_after` | `systemId`, `deletedAt`, `createdAt` |
| `mapConnections` | `purgeAfter`, `sweepAfter` | `by_map`, `by_purge_after`, new `by_sweep_after` | Endpoints, doors, mass, size, identity, lifetime, resolution (references are `rowKey`s), tombstone, observed mass, `firstSeenAt`, `staticCode`, `seatOrderAt`, `createdAt` |
| `mapSignatures` | `purgeAfter` | `by_map`, `by_purge_after` | `systemId`, `signatureId`, kind, group, type name, signal, type code, `deletedAt`, `createdAt` |
| `mapSignatureActivity` | none | `by_map` | `systemId`, `signatureId`, `lastSeenAt` |
| `mapEvents` | `at`, `purgeAfter` | `by_map(mapId, at)`, `by_purge_after` | `kind`, `actor`, `payload` |
| `mapGlance` (new) | none | `by_map` | Glance groups per system, rewritten at each commit |
| `mapHeads` (new) | `mapVersion`, `currentEpoch` (Part 13) | `by_map` | `mapVersion` and a digest of live rows |

`mapJumpBookkeeping` stays readable and unchanged, including `lastProcessedTransitionAt` and both `by_map_character` and `by_character`: jump timing is accepted metadata (brief default 5), so account merge, teardown and location purge keep working. `mapHeads` and `mapGlance` join `MAP_PURGE_TABLES`; `mapNotes` leaves it.

`sweepAfter` is `latestAt + CEILING_COLLAPSE_GRACE_MS`, rounded down to the hour, set only on live connections with a death window. Rounding down never sweeps late. Readable `deletedAt` and tombstone `kind` go: `purgeAfter` implies them. One sealed row per entity, as today. **Blind indexes: none.**

### Reads

`watchMapConnections` returns all connections; the browser splits out unresolved holes. `watchSystemSignatures` becomes a whole-map paginated read of rows with no `purgeAfter` (live only), filtered per system in the browser; tombstones load only for undo. The chain view reads `mapGlance` instead of every signature, and `watchMapGlanceGroups` is deleted. A decrypting adapter returns today's row shapes (`_id` from `rowKey`, `_creationTime` from `createdAt`), so components do not change.

### Optimistic authoring contract

1. The functions in `optimistic-authoring.ts` keep their logic and write to a decrypted local store exposing the parts of `OptimisticLocalStore` they use.
2. An overlay stays until the reply arrives and decrypted rows reach the reply's `mapVersion`. Dropping it at `submit` would flicker (Part 07).
3. On rejection or deadline the overlay is removed, as `swallowMutationRejection` rolls back today.
4. Creates keep `optimistic:` temp IDs; the reply maps each to its `rowKey`.
5. Overlays apply in `clientSeq` order over the newest server state.
6. Awaited edits stay awaited, with their own budget (Hard rule 17).

### Commit

Each commit is one Convex mutation (`requireSealedService`, Part 07). In the same transaction it re-reads the actor's readable `mapAccess` row and rejects the commit if edit rights are gone, keeping today's atomicity with a concurrent revocation. It then checks the expected `mapVersion` and each row's version, writes the rows and bumps `mapHeads`.

### Splitting the crons

| Cron | Convex (readable only) | Workers |
|---|---|---|
| Hourly ceiling collapse | Query `by_sweep_after` ≤ now; one `sealedJobs` row per map with due `rowKey`s | Re-check sealed `latestAt` plus grace; collapse using tracked-pilot systems (Part 17); remove stubs with a `signatures_removed` event; fall back to sever; clear `sweepAfter` |
| Daily chain purge | Delete events by `purgeAfter`; find expired systems and removed connections; one job per map | Delete purged systems' children (needs `systemId`); delete, settle, hold or retry as `purgeExpiredConnections` does |
| Daily signature purge | Unchanged | None |

This corrects 06, which kept child deletion on Convex: it needs sealed IDs. Batch sizes stay as today.

### Forged and stale rows

- AAD binds Part 09's fields (table, `mapId`, `rowKey`, version, `keyId`, epoch) plus every readable field. A swapped, moved or edited row fails to open.
- Per-row and `mapVersion` compare-and-set on commit stop lost or reordered writes.
- On load the enclave checks the head digest over live systems, connections and signatures. On a mismatch, including a legitimate Convex restore, it logs, alerts the owner (Part 29) and keeps serving edits. Browsers do not verify the digest.
- Limits: a staged rollback of Convex is detected only as an alert; deleted tombstones, events or bookkeeping lose undo or log entries (Part 28).

### Caps, fixtures and porting order

Every cap and batch size stays unchanged (for example 128-row collapse, 256 scan rows, 1,024 trackers per map and 32 per user).

Fixtures used by `map:replay` become sealed requests against the dev sealed service. `mapNotes`, the notes case in `readMapCollection` and `insertNoteFixture` are deleted.

1. Finish and delete the three backfills in production.
2. Move mutation bodies onto `MapStore` inside Convex, with no behaviour change; today's Convex tests pass unchanged.
3. Build the in-memory adapter and run the same tests against it.
4. Run both paths behind a per-map flag (Parts 30 and 31), then delete the Convex write path.
5. Conversion (Part 31) seeds `createdAt` from the old `_creationTime` and sets `rowKey` to the old `_id` string.

Under Option 2, `MapStore` stays the seam, but browsers write an ordered sealed log, crons and jumps wait for an open member browser, and browsers sign heads (Part 15).

**Dropped from older docs:** reducers over MapStateRepo, determinism rules, the replay corpus, pinned datasets and reducer versions, `jump.observe` ops, lazy client-side lifetime expiry, caps as genesis policy. `optimistic-authoring.ts` is kept.

## Data: readable vs encrypted

| Data item | Stays readable on LGI servers | Encrypted | Where computed |
|---|---|---|---|
| `mapId`, `rowKey`, `version`, `keyEpoch` | Yes | No | Sealed service writes; LGI server indexes |
| System, connection and signature content | No | Yes, map key | Sealed service; browser decrypts |
| `purgeAfter`, `sweepAfter` (hour) | Yes | No | LGI server schedules; sealed service sets |
| `mapEvents.at` | Yes | No | LGI server orders and purges |
| `mapEvents.kind`, `actor`, `payload` | No | Yes, map key | Sealed service; browser decrypts |
| `mapSignatureActivity` content | No | Yes, map key | Sealed service |
| Glance summary (`mapGlance`) | No | Yes, map key | Sealed service; browser decrypts |
| `mapJumpBookkeeping` (`characterId`, `lastProcessedTransitionAt`) | Yes | No | LGI server and sealed service |
| `mapHeads.mapVersion` | Yes | No | Sealed service |
| `mapHeads.currentEpoch` | Yes | No | Sealed service writes; LGI server stores and purges (Part 13) |
| Head digest | No | Yes, map key | Sealed service |
| Unresolved-hole split, per-system signature filter | No | Not stored | Browser |
| Row counts and write timing | Yes | No | Accepted metadata (Part 03) |

## Hard rules

1. [Agreed] No visible change: same screens, flows, toasts and error states (principle 1).
2. [Agreed] Map contents are sealed. Map names, membership and access stay readable (principle 2).
3. [Agreed] The 7-day log and 24-hour undo work as today (decision 3).
4. [Proposed] Only the enclave writes sealed map rows, through one version-checked commit per edit. Fixtures go through the dev sealed service.
5. [Proposed] Every commit re-checks the actor's role atomically against the readable `mapAccess` row.
6. [Proposed] Map logic moves into `src/data/maps/engine/` and runs against `MapStore`. It is never copied. `convex/` may not import a sealed zone (amends Part 05's Fallow boundaries).
7. [Proposed] Ported code never reads `_creationTime`, a readable tombstone or any readable copy for a content decision.
8. [Proposed] AAD binds table, `mapId`, `rowKey`, version, `keyId`, epoch and every readable field.
9. [Proposed] No blind index without an owner decision naming the Convex query that needs it.
10. [Proposed] Convex deletes directly only signature tombstones, events, whole maps through `mapPurge`, and bookkeeping rows on tracking teardown, location purge and access purge. Other deletions go through the workers.
11. [Proposed] Sweep and purge jobs are doorbells; workers act only when sealed state agrees. `sweepAfter` is rounded down to the hour.
12. [Proposed] Jumps are authored only on maps the pilot's own account has open with edit rights, as today, within the 10-minute window. `JumpDoorbellObserver` and the doorbell kind of `/api/maps/jump` are deleted when this ships.
13. [Proposed] Replies carry the ported mutation's return value unchanged. Elimination commits as a separate write in the same queue turn and replies in today's `SignatureEliminationResponse` shape.
14. [Proposed] The decrypting adapter returns today's row shapes, so components stay unchanged. `watchMapGlanceGroups` is deleted and `watchSystemSignatures` is replaced as described.
15. [Proposed] Optimistic overlays stay until the reply arrives and the matching `mapVersion` is decrypted.
16. [Proposed] `wh_observations` and `observationKey` are dropped, deleting that data. `mapNotes` is dropped.
17. [Proposed] Optimistic edits meet Part 07's 250 ms added p95. Awaited edits meet 100 ms added p95 over today's single-mutation round trip, measured on staging.
18. [Proposed] Each map runs one write path, chosen by a per-map flag, during the port.
19. [Proposed] Conversion keeps each row's `_id` as `rowKey` and its `_creationTime` as `createdAt`.
20. [Proposed] Today's caps and batch sizes are kept, with no new limits. Backfills finish before the port.

## Assumptions

| Assumption | How to check |
|---|---|
| Whole maps fit in memory and in one commit | Production row counts per map against Convex mutation limits |
| Live signatures per map are few enough to load whole on phones | Production signature count per map |
| The one-offs have finished in production | Count rows that would still change |
| Today's Convex tests run against the in-memory adapter | Porting step 3 |
| Folded elimination keeps today's toasts and flashes | Mapper smoke journeys against the dev sealed service |
| Awaited edits fit 100 ms added | Staging measurement |

## What users see

Nothing new. Jumps, toasts, flashes and awaited flows match today. Statics placeholders may land a little sooner, because no Vercel round trip is needed.

## Questions for the owner

1. **Blind indexes.** None, or a per-map HMAC of `systemId` so signatures can be read per system. *Recommended:* none, unless the signature count check fails.
2. **Row granularity.** Per entity, per system bundle, or one document per map. *Recommended:* per entity.
3. **AAD binding.** Part 09's fields only, or those plus readable scheduling fields. *Recommended:* include readable fields.
4. **Event kind and actor.** Seal them with the payload, or keep them readable as metadata as 06 lists. *Recommended:* seal; no Convex query uses them. Part 13's table would follow.
5. **Optimistic contract.** Hold until reply and `mapVersion`, drop on submit, or make every edit wait. *Recommended:* hold.
6. **Head mismatch.** Log and alert, or refuse edits (showing the existing toast with the reason). *Recommended:* log and alert.
7. **Map fixtures.** Port them and `map:replay` to the dev sealed service, or delete them. *Recommended:* port.
