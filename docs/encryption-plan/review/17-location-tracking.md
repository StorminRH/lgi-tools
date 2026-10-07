# Part 17: Location tracking in the sealed service

**Status:** Draft for owner review

## In one paragraph

Decision 1 moves location polling into the sealed service with no change in behaviour. This part says how. The heartbeat, `syncPresence` and `mapTracking` stay readable in Convex and tell the sealed service when to poll. The workers run today's poll loop and scheduler with today's rules, holding tokens, online state, cadence and ETags in memory. Each result is written to Convex as one fixed-size sealed row per (map, character) under that map's key, with coverage inside, and only for a tracking selection the character's own account signed. Members' browsers decrypt it into the shape the UI uses today. Four Convex tables go away (`characterLocationAccess`, `characterLocationOnline`, `characterLocationCovered`, `locationSync`). The jump doorbell goes too, in a form that keeps today's choice of which maps receive a jump. Rows are written only on change, as today, so LGI can see when a row changes but not where a character is.

## How it works today

- **Heartbeat.** `TrackingHeartbeat` sends the user's own tracked characters on the open map (none while the AFK gate is paused) with a reason: mount, visible or interval. `engine.heartbeat` upserts `syncPresence`; a warm interval beat within 45 seconds (`PRESENCE_REFRESH_MS`) of the last write skips it. `expirePresence` runs at the earlier of 5 minutes after the last beat or 90 minutes after the tab was last visible. `scheduleFromBeat` and `beatDueAt` use `locationSync` state (`lastRunAt`, `minExpiresAt`, `lastFinishedAt`, `syncedCharacterIds`, run state): mount, visible and post-cold beats can pull a stale run forward, never inside 5 seconds of `lastRunAt`; warm interval beats only re-arm a dead run. `engineLeave.ts` marks the tab cold at once.
- **Run.** One scheduled action per user, `syncUser`, guarded by a generation in `locationSync`, polls every character the user tracks. It uses a plaintext lease in `characterLocationAccess` or a token from `/api/internal/eve-token`. It reads `/online` unless the held answer is inside its `Expires` window, skips location when offline (`readProbeThenLocation` returns a null system), reads `/location` with `If-None-Match`, and `/ship` only on a system change. An exhausted ESI budget stops the run.
- **Apply.** `finishSync` writes `characterLocation`, keyed per (user, character), not per map. A system change records `prevSolarSystemId`, `transitionObservedAt` and `prevFresh` (last run within 45 seconds and covered). In the same system it patches only on a station, structure or ETag change. Coverage (`characterLocationCovered`) is set by a successful run; a failed run (`recordFailure`) leaves it alone. It is cleared only when presence goes cold, through `expirePresence`, `leave` and `stopSync`.
- **Reads.** `forMap` returns the freshest location per character among accounts tracking it on the map, from the per-user row, so a newly tracked map shows the last-known location at once. `coverage` is true when any tracking account holds coverage. `readTrackedPilotSystemIds` reads every tracked pilot's last-known system whatever their presence, for the lifetime-ceiling sweep, expired-connection settling and scan selection. The scan check and the jump resolver read rows directly.
- **Jumps.** `JumpDoorbellObserver` mounts only for editors with the map open. It rings `/api/maps/jump` for the user's own tracked characters, also on a later mount within the 10-minute capture window, with 5 attempts 15 seconds apart. The resolver needs `prevFresh` and dedupes on `mapJumpBookkeeping`.
- **Cleanup.** `purgeForUser` deletes by (user, optional character). Teardown and the 7-day presence sweep delete by readable keys. Caps: 32 tracked characters per user per map, 1,024 per map.

Files: `convex/engine.ts`, `engineLeave.ts`, `engineSweep.ts`, `engineComplete.ts`, `characterLocation{Sync,Apply,Reads,Access,Purge}.ts`, `convex/lib/{locationSchedule,locationCoverage,locationCaches,characterSync,mapTrackingCapacity,mapScanApply,mapScanSelection}.ts`, `convex/mapTracking{Live,OptIn,Teardown}.ts`, `mapAuthoringSweep.ts`, `mapChainCleanup.ts`, `mapJumpEvidence.ts`, `mapJumpReads.ts`, `src/lib/sync-engine.ts`, `src/mapper/chain/ChainLive.tsx`, `src/mapper/tracking/doorbell-model.ts`, `src/composition/jump-resolver/resolver.ts`, `src/app/api/internal/eve-token/route.ts`.

## What changes

Nothing visible to users. Part 15, Question 4 recommends keeping today's choice of which maps receive a jump, and Part 16 owns that authoring; only Question 4's alternative (jumps on every editable map tracking the character, even with no tab open) would be visible, as connections appearing on maps nobody had open. Behind the scenes, polling, tokens, cadence and held state move into the workers, location rows become sealed and per map, tracking selections become signed sealed requests, and the leases, online cache, coverage table and schedule row are dropped.

## Design

**Beats and scheduling.** The heartbeat keeps its rules but schedules no Convex action. Over its outbound Convex connection (Part 07) the enclave subscribes to location `syncPresence` rows and `mapTracking`, both small at 18 users. Each written `syncPresence` row is a beat, and the enclave runs `scheduleFromBeat` and `beatDueAt` on its in-memory state. Mount, visible and post-cold beats always write; warm interval beats inside 45 seconds skip the write, matching today's safety-net-only rule. A readable `lastBeatReason` says which rule applies and carries no cadence. A newly verified tracking selection (below) counts as the "new hint character" case of `isStaleForImmediate`. `expirePresence` and `leave` stay in Convex and stamp a readable cold marker, cleared by a warm beat; it cancels the user's timer. One timer per user, one run in flight, reusing `computeChainBoundary`, `computeNextDueAt` and `nextRunAt`. Cadence and run state never reach Convex.

**Tracking selections.** Readable `mapTracking` is the index, not the authority (Part 03, "Readable is not trusted"; Part 12, rule 13). `setTracking` becomes a signed sealed request in Part 07's `map` class, not optimistic, with today's arguments, return value and error codes (`TRACKING_CAP_EXCEEDED`, `CHARACTER_NOT_ELIGIBLE`, `TRACKING_SCOPING_PENDING`); `TrackingControls` and `HomePrompt` already await it, so nothing visible changes. This amends Part 07's mapping row for `mapTrackingOptIn.setTracking` and Part 15, Option 1 step 1, which kept it a plain Convex mutation. For a request from account U, the enclave checks the browser session key signature (Part 07, rule 6), that its character-link record puts the character on U (Part 08), that it admits the character on the map (Part 12), and today's `characterTrackable`, scoping and cap rules. It then writes, in one Convex mutation, the readable `mapTracking` insert or delete and U's selection head: one readable row per account listing its (map, character) selections with a version that rises by one per change, MAC'd with an enclave-only key. Untracking goes the same way, so the head drops the pair. The tracking picker already lists only the account's own characters, so the own-account check refuses nothing a user can select today.

Before any poll for, or location write to, a (map, character) pair, the enclave requires all of: a readable `mapTracking` row for the pair; the tracking account's head verifies, is not below the highest version seen this boot, and lists the pair; the link record still puts the character on that account; and the enclave still admits the character on that map. A row that fails is ignored and logged as a code. Deletes in Convex (teardown, purges, `setTracking` off) only narrow publishing and need no check; the enclave sees them over its subscription, stops trusting that pair at once, and drops it from the head at its next write, so a deleted row replayed within a boot publishes nothing. A replay across a restart is the rollback residual of Parts 12 and 28.

*Merge restores.* `restoreMergeTracking` keeps re-inserting rows from Neon `pending_tracking_merges`, retried by `tracking-merge-retry.ts`, unchanged. The enclave performs the selection side itself: when custody confirms a merge (Part 11, step 3) it merges the source account's head into the survivor's before reporting success. A restored row then passes only if the survivor's head lists its pair; a pair the head lists but the restore skipped (cap reached) has no row and publishes nothing.

*Heartbeats.* `engine.heartbeat` stays a plain readable mutation, not signed (Part 03, Question 5 allows this). A beat cannot add a map or a character to publishing; at worst a forged beat keeps an account's own verified selections polling past the 5-minute cold-off, which a hidden tab already does for up to 90 minutes, or marks a tab as an editor tab, and jump authoring still checks the role (Part 16). Accepted as a residual for Part 28.

**Poll.** A port of `syncLocationCharacter` and `readProbeThenLocation`. Tokens come from custody (Part 08) and stay in memory until expiry. Held state per (user, character): the full last body (system, station, structure, ship, previous system, `prevFresh`, `transitionObservedAt`, `observedAt`), ETags, online answer and expiry, last run end, covered set.

**Sealed location row.** A new Convex table, `mapCharacterLocation`:

| Field | Readable | Notes |
|---|---|---|
| `mapId`, `characterId` | Yes | Indexes `by_map`, `by_map_character` |
| `keyEpoch`, `version` | Yes | Epoch per Part 13; version increases by one per write |
| `writerFence` | Yes | The leader lease's fencing number (Part 05) |
| `sealed` | No | Envelope per Part 09. AAD: table, `mapId`, `characterId`, `keyEpoch`, `version` |

The sealed body holds `solarSystemId`, `stationId`, `structureId`, `shipTypeId`, `prevSolarSystemId`, `prevFresh`, `transitionObservedAt`, `observedAt`, `covered`, `etagLocation` and `etagShip`, in a fixed-size encoding (fixed-width fields, explicit null flags, one padded bucket). Length therefore never shows docked versus in space, or station versus structure.

**Fan-out and merge.** One result is written to every map where a verified selection tracks the character. With two accounts on one map, the fresher transition wins, as in `forMap`, and `covered` is the OR over warm tracking accounts, as in `characterCovered`. When a selection is verified, the enclave writes the new map's row at once from the freshest held body or existing row for that character, so the map fills in with no delay, even for an offline pilot.

**Write cadence (default).** Write only when system, station, structure, location ETag or `covered` changes. Unchanged polls write nothing.

**Reads.** `forMap` and `coverage` keep their names and access checks but return sealed rows, each with a readable `trackerWarm` bit: some account tracking that character on that map has no cold marker. A browser decode step maps rows to today's `TrackingPayload` and `CoveragePayload`, with covered = sealed `covered` AND `trackerWarm`. Coverage clears exactly when presence goes cold, as today, with the enclave up or down and no re-seal on cold. The decode step remembers the highest `version` per (map, character) and ignores lower ones, so a replayed older row is not shown.

**Last-system readers.** Map logic in the enclave (Part 15) reads the last-known system of every tracked (map, character), whatever the presence: the ceiling sweep (`mapAuthoringSweep.ts`), expired-connection settling (`mapChainCleanup.ts`), scan selection (`lib/mapScanSelection.ts`) and the scan check (`lib/mapScanApply.ts`). It decrypts that map's location rows when the job runs, or keeps a per-map index evicted with the map cache (Part 05), never with presence.

**Jumps.** Part 16 owns jump authoring: the ported resolver and `mapJumpAuthoring`, serialisation per map, the 10-minute window, the `prevFresh` rule, which maps receive a jump, `mapJumpBookkeeping` (readable and unchanged) and removing the doorbell. This part only hands off. Each heartbeat carries its open map ID and an editor flag (readable on `syncPresence`, one entry per warm tab), and on each transition the poller passes the character, the held body (`prevSolarSystemId`, `prevFresh`, `transitionObservedAt`) and the user's warm editor tabs to map logic in-process.

**ESI.** Same `esiFetch`, compatibility date and error-budget floor. The scoreboard is the enclave's own, in memory (`ESI_SCOREBOARD=memory`, exhaustion marker off; Part 18), keyed by normalised paths and counts, never character IDs. The enclave never calls Upstash (Part 18, rule 17; Part 25, rule 12). Budget exhaustion stops that user's run.

**Restarts and outages.** On boot the enclave takes the lease, loads presence and tracking, decrypts tracked characters' rows to rebuild held bodies and ETags, and starts warm users jittered within 10 seconds. A transition across a gap over 45 seconds gets `prevFresh: false` and is not authored, as when polling lapses today. During an outage locations freeze, as when polling stalls today, and coverage still clears on cold.

**Cleanup.** A location row is deleted with the last tracking row for its (map, character). A purge reads `mapTracking` `by_user_character` for the user (and character), deletes those rows, then deletes each location row whose pair has no tracking left. Never purge by character alone: after a sale the buyer may track the same character. The enclave drops a user's poll state when they stop tracking or go cold.

**Removed.** `characterLocationAccess`, `characterLocationOnline`, `characterLocationCovered`, `locationSync`, the per-user `characterLocation`, the location use of `/api/internal/eve-token`, `syncUser`, `finishSync`, `syncInputs`, `convex/engineComplete.ts` (`handOffLocationSync`, legacy `onSyncComplete`), the `syncSubjects` read in `ensureLocationSync`, `lib/locationCaches.ts`, `lib/locationCoverage.ts`, the `locationSync` handling in `engineSweep.ts`, the doorbell (Part 16) and Convex log lines carrying run errors. From the older docs: the browser poller, 256-byte frames, budget split, batching tick and background rules (01 "Location publishing", 04 D-LOC-3 to D-LOC-7).

**Sequencing.** Browsers get map keys only with the mapper (Part 13). In Phase 1 the workers take over polling and tokens but write today's plaintext row through a temporary port; sealed rows ship in Phase 2 (Part 30). Signed selections ship with the per-map fan-out. Until then the enclave polls only characters on the tracking account's own link record, so a forged `mapTracking` row publishes nothing, as today.

**Risks.** A restart loses continuity: jumps across a gap over 45 seconds are dropped. Mitigation: planned releases in EVE downtime (Part 05), when pilots are logged off. Jump delivery depends on Part 15. Missing any Removed item leaves Fallow findings, so removal lands in one change.

**Testing.** Port `convex/engine.test.ts`, `characterLocationSync.test.ts`, `characterLocationApply.test.ts` and the `mapTracking` tests to the workers against fake ESI and fake Convex. `convex/mapFixtureTracking.ts` writes plaintext rows; fixtures instead seal rows through the dev sealed service. Behaviour: beat handling matches `scheduleFromBeat`; a second map shows a tracked pilot at once (Playwright); coverage clears on cold with the enclave stopped; a cold-presence tracked pilot protects its system from the ceiling sweep; jumps reach only maps with a warm editor tab. Adversarial: a `mapTracking` row inserted directly in Convex, or by another account, for a victim's character publishes nothing; a selection signed by a session key of another account is refused; a merge-restored row publishes only once custody has merged the heads; a deleted row re-inserted within a boot publishes nothing; a tampered or lower-version head is ignored; Convex rejects non-enclave writers, stale fences and non-+1 versions; the browser ignores a replayed lower version; ciphertext length is equal for docked, in-space and structure states; no character ID, system or ESI body reaches logs; purging a seller's character leaves the buyer's rows; exactly one poller exists after a restart.

## Data: readable vs encrypted

| Data item | Stays readable on LGI servers | Encrypted | Where computed |
|---|---|---|---|
| `syncPresence` (beats, visibility, tab, `lastBeatReason`, cold marker, open map and editor flag per tab) | Yes | No | LGI server |
| `mapTracking` (who tracks which character on which map) | Yes | No | LGI server stores; sealed service checks it against the selection head |
| Tracking selection head (account, version, (map, character) list) | Yes, enclave-MAC'd | No | Sealed service writes; LGI server stores |
| `trackerWarm` bit in query results | Yes | No | LGI server |
| Location row keys, epoch, version, fence, write time | Yes | No | Sealed service writes; LGI server indexes |
| System, station, structure, ship, previous system, transition time | No | Yes, map key, fixed size | Sealed service; browser decrypts |
| Coverage (online in game and polled) | No | Yes, inside the row | Sealed service; browser ANDs with `trackerWarm` |
| Location and ship ETags | No | Yes, inside the row | Sealed service |
| Online answer, ESI access tokens, poll schedule and run state | No | Enclave memory only | Sealed service |
| Service heartbeat and lease | Yes | No | Sealed service writes |
| Enclave ESI scoreboard (normalised paths, counts) | Not stored | Enclave memory only | Sealed service |
| Upstash scoreboard (Vercel's public calls) | Yes | No | LGI server; the sealed service never calls it |

## Hard rules

1. [Agreed] Polling runs in the sealed service with today's rules: 5-minute cold-off, 90-minute hidden cap, online check, `Expires` cadence, 5-second floor, ship read only on a system change, and tracking with the tab hidden while in game.
2. [Agreed] No ESI token exists in plaintext outside the enclave; the Convex leases end.
3. [Agreed] From Phase 2 (Part 30), locations are readable only by the map's members and the enclave. In Phase 1 rows stay plaintext as today, with tokens already in the enclave.
4. [Proposed] Timing constants and cadence functions live in one shared module (today `src/lib/sync-engine.ts`, plus `nextRunAt`, `beatDueAt` and `scheduleFromBeat`'s rules moved out of Convex), imported by the workers, not copied.
5. [Proposed] Each written `syncPresence` row is a beat; each newly verified selection is a new hint character. Only `lastBeatReason`, the cold marker and per-tab open map and editor flag are added to Convex; cadence and run state never are.
6. [Proposed] One sealed row per (map, character) under the map key, coverage and ETags inside, fixed-size encoding. AAD binds table, map, character, epoch and version.
7. [Proposed] Rows are written only on change, and at once for a newly verified selection, copied from the freshest held body.
8. [Proposed] Two accounts on one map: the fresher transition wins; coverage is the OR over warm tracking accounts.
9. [Proposed] Covered shown = sealed `covered` AND readable `trackerWarm`. No service-heartbeat coverage gate.
10. [Proposed] Only the enclave writes `mapCharacterLocation`, with the current fence; Convex rejects a version that is not the previous plus one. Browsers ignore a version below one already seen.
11. [Proposed] Held poll state lives only in enclave memory and is rebuilt from sealed rows after a restart. Warm users restart jittered within 10 seconds. A gap over 45 seconds yields `prevFresh: false`. Tokens are dropped on a 401 or 403.
12. [Proposed] Map logic reads last-known systems for every tracked (map, character) whatever the presence; any index is evicted with the map cache, not with presence.
13. [Proposed] The poller hands every transition to map logic in-process with the held body and the user's warm editor tabs; jump authoring, its map choice and `mapJumpBookkeeping` follow Part 16.
14. [Proposed] A location row goes with the last tracking row for its pair. Purges go through `mapTracking` `by_user_character`, never by character alone.
15. [Proposed] Logs and error fields carry codes only, never character IDs, systems or ESI bodies. The enclave's in-memory scoreboard keys on normalised paths only, and the enclave never calls Upstash.
16. [Proposed] The browser decode step produces today's payload shapes, so no tracking component changes.
17. [Proposed] Exactly one poller per user at any time. The Convex scheduler is switched off in the release that turns on the enclave path, with no dual running.
18. [Proposed, amends Parts 07 and 15] `setTracking`, on and off, is a signed sealed request. A location is polled for and sealed into a map only for a pair with a readable `mapTracking` row, listed in the tracking account's verified enclave-MAC'd selection head, whose character the link record puts on that account and the enclave admits on that map.
19. [Proposed] Merge restores stay readable; custody merges the source's selection head into the survivor's at merge confirm, and a restored row counts only if that head lists it.
20. [Proposed] Heartbeats stay unsigned readable mutations; they start and stop polling of verified selections only and never add a map or character.

## Assumptions

- **The enclave can hold Convex subscriptions through the vsock proxy.** Check: Part 05, check 2.
- **Every tracked map has a key epoch the enclave can use.** Check: Part 13 creates keys for all maps at migration.
- **ETags of identical bodies are stable across tokens and restarts, so rebuilding keeps 304s.** Check: compare ETags across two tokens for one character in staging.
- **Decoding adds no visible delay to the tracking panel.** Check: Playwright timing on the map smoke journey.
- **On-change writes stay well within Convex limits.** Check: today's `characterLocation` patch count, times maps per tracked character.
- **Coverage on reopening a tab is close enough to today.** Today it shows after the first run, a few seconds in; here a still-valid sealed `covered` may show a moment sooner. Check: Playwright on reopen. If it matters, the enclave stamps a readable once-per-warm-window `warmRunAt` that `trackerWarm` also requires.

## What users see

Nothing new, under Part 15's recommended match-today jump rule. Tracking starts, stops and refreshes as today, through the same controls, which already wait for the reply, including with the tab hidden while in game, and a newly tracked map fills in at once. During a sealed-service outage positions freeze, as when polling stalls today, and coverage clears on cold as today. No message is added. Only if the owner picks Part 15, Question 4's alternative would jumps also land on maps with no open tab: a visible change.

## Questions for the owner

1. **Write cadence.** Write rows on change, which shows LGI when a row changes, or on every poll, which hides that at more Convex writes? *Recommended:* on change. Presence already shows when users are active.
2. **Row shape.** Coverage and ETags inside the per-map row, or in a separate per-user sealed document? *Recommended:* inside the row: one write per change, and restarts keep ETags.
3. **Jump delivery (with Part 15, Question 4).** Only maps with a warm editor tab of that user, as today, at the cost of a readable open map ID per tab; or every editable map tracking the character? *Recommended:* match today, per principle 1. The open map ID is metadata.
4. **Scheduler home.** Enclave timers driven by subscribed presence, or a Convex-scheduled sealed job per run? *Recommended:* enclave timers; per-run jobs would put cadence, and with it online state, in readable rows.
5. **Phase.** Move polling in Phase 1, writing today's plaintext rows until map keys exist, or wait for the mapper? *Recommended:* Phase 1, which closes 06's leak 1 early.
6. **Heartbeat binding.** Sign heartbeats with the browser session key, or keep them unsigned? *Recommended:* unsigned. Selections, which decide where a location goes, are signed; a forged beat can only keep an account's own selections polling, and signing every beat adds a sealed request per tab per interval.
