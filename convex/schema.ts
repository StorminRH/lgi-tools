import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';
import {
  connectionProvenanceValidator,
  destinationHintValidator,
  lifeStageValidator,
  mapEventKindValidator,
  mapEventPayloadValidator,
  mapRoleValidator,
  massStateValidator,
  noteTargetKindValidator,
  optionalTimestampValidator,
  scannedKindValidator,
  shipSizeValidator,
  typedSideValidator,
  wormholeTypeCodeValidator,
} from './lib/mapEntityContracts';
import { runObservabilityFields } from './lib/syncFields';

// Convex is a regenerable projection of live ESI data keyed by the Neon
// identities (userId + characterId) — never the system of record, never a
// home for SDE/domain data. Wiping these tables and re-syncing must
// reproduce the same state from Neon + ESI. Two carve-outs hold durable
// user-authored state under the Convex-native exception docs/CONVEX.md
// sanctions: the chain tables (mapSystems et al., marked below) and the
// mapTracking opt-in registry (4.0.4.2.1) — a wipe loses those, not a mirror.
//
// Live engine consumers: onlineStatus (MIGRATE.A canary) and characterLocation
// (4.0.4.2.1 tracked location). The three slow trackers (skills, personal + corp
// industry jobs) moved to Neon stale-gated on-view reads in MIGRATE.B; their
// Convex tables + dormant dataset literals were wiped in MIGRATE.D.1. See
// docs/CONVEX.md for the engine architecture, the ≤2-min placement rule, and the
// orphan-guard pattern (dataset-union-as-superset during drain windows).

export default defineSchema({
  // One doc per watched subject (dataset × user): presence plus the run
  // lifecycle the 3.4.9 engine absorbed from the trackers. The dataset is part
  // of the row key, so each consumer's lifecycle stays isolated without
  // duplicating the machinery.
  syncSubjects: defineTable({
    // The engine's live datasets. The union is designed to hold a SUPERSET of
    // the active registry while a dataset is being retired (the drain-window
    // pattern documented in docs/CONVEX.md).
    dataset: v.union(v.literal('onlineStatus'), v.literal('characterLocation')),
    userId: v.string(),
    status: v.union(v.literal('idle'), v.literal('running')),
    // Doubles as the run's generation token (shipped name kept): a late
    // applySyncResults from a taken-over run no-ops unless it matches.
    lastRequestedAt: v.number(),
    // The workpool item currently owning this subject — onSyncComplete
    // matches on it, so a superseded run's completion can't clear a newer
    // run's status.
    workId: v.union(v.string(), v.null()),
    // When the scan should next dispatch this subject; null retires it from
    // the scan set (cold, or nothing to sync) until a heartbeat revives it.
    nextDueAt: v.union(v.number(), v.null()),
    // min(expiresAt) across the user's synced docs after the last run — the
    // cache-window input to the next due time. null = stale now (first
    // sync, or an errored character cleared its window — the #95 meaning).
    minExpiresAt: v.union(v.number(), v.null()),
    // The characters the last run enumerated, so a heartbeat's hint can
    // detect a newly linked character without a per-dataset table read.
    syncedCharacterIds: v.array(v.number()),
    // The characters the last run actually observed cleanly (fresh 200 OR
    // 304; per-character errors and unpolled characters excluded). Distinct
    // from syncedCharacterIds (the hint/park set): continuity decisions like
    // characterLocation's prevFresh need "did the previous run cover this
    // character", which the tracked/enumerated set does not encode. Optional:
    // only datasets that need continuity stamp it (chain-on-success also
    // requires it to sustain the fast cadence).
    coveredCharacterIds: v.optional(v.array(v.number())),
    lastFinishedAt: v.union(v.number(), v.null()),
    // Run error + rl* observability — one authoritative shape shared with the
    // apply-args validator (convex/lib/syncFields.ts).
    ...runObservabilityFields,
  })
    .index('by_user_dataset', ['userId', 'dataset'])
    .index('by_next_due', ['nextDueAt']),

  // One ephemeral presence doc per watched subject (dataset × user): the
  // liveness heartbeat, split off the syncSubjects row in 3.5.e1. A view
  // subscribes to syncSubjects but NEVER this table, so an interval beat's
  // lastSeenAt write (3×/min per visible tab) can't invalidate a watched
  // payload through Convex's document-granular reactivity — load-bearing for the
  // mapper. Pure ephemeral liveness, regenerable like every row here: a
  // returning tab's first heartbeat recreates it, and the engine sweep reaps it
  // alongside a long-abandoned subject.
  syncPresence: defineTable({
    dataset: v.union(v.literal('onlineStatus'), v.literal('characterLocation')),
    userId: v.string(),
    // Last heartbeat from ANY tab — visible or hidden (hidden tabs keep
    // beating, browser-throttled). The scan and sweep treat a presence doc
    // older than the dataset's coldAfterMs — or a missing one — as cold.
    lastSeenAt: v.number(),
    // Last heartbeat from a VISIBLE tab — the input to the hidden-presence
    // backstop (HIDDEN_PRESENCE_MAX_MS): hidden-only beats can't hold a
    // subject hot forever. Optional: rows written before this field existed
    // came from visible-only clients, so lastSeenAt stands in (never write
    // null here — v.optional rejects it; omit the field instead).
    lastVisibleAt: v.optional(v.number()),
  })
    .index('by_user_dataset', ['userId', 'dataset'])
    // The sweep's two presence-driven passes range over this: rows within the
    // widest registered cold window (lastSeenAt >= now - MAX_COLD_AFTER_MS,
    // the dropped-timer reconcile — filtered per row by each dataset's own
    // window) and past-retention rows (lastSeenAt < now - RETENTION_MS, the
    // abandoned-row GC). Ascending order makes the GC pass oldest-first, so a
    // capped catch-up run drains the backlog deterministically.
    .index('by_last_seen', ['lastSeenAt']),

  // One doc per (user, character): the live online/offline state (MIGRATE.A — the
  // online-status canary, the engine's keeper consumer through the placement
  // migration). DELIBERATELY NOT split hot/cold like the retired trackers were.
  // This row carries NO per-cycle bookkeeping field — no lastSyncedAt, no
  // expiresAt (the cache window is stamped only onto the syncSubjects row), and
  // no syncError — so onlineStatus.forViewer subscribes to it directly. `etag` is
  // the only custody field, and for THIS endpoint it rotates only on a genuine
  // flip: GET /characters/{id}/online's body (online + last_login/last_logout/
  // logins) changes solely at a login/logout, which always flips `online`, so a
  // steady character only ever 304s and this row is written ONLY on a real
  // online↔offline change. The SA.5 hot/cold split exists to stop a per-cycle
  // bookkeeping write re-reading a HEAVY payload through document-granular
  // reactivity; here the payload is one bool and there is no per-cycle write, so
  // neither reason applies — the apply's no-op-write guard (write only when
  // online/etag changed) is the discipline instead. Regenerable like every row here.
  characterOnline: defineTable({
    userId: v.string(),
    characterId: v.number(),
    online: v.boolean(),
    // Held for the conditional read; only ever stored beside the `online` value a
    // 304 would confirm. ESI's 304 never repeats the ETag, so the action echoes
    // the held one across an unchanged read.
    etag: v.union(v.string(), v.null()),
  })
    .index('by_user', ['userId'])
    .index('by_user_character', ['userId', 'characterId']),

  // ── v4.0 collaborative chain (the one sanctioned durability exception) ──────
  //
  // These are the mapper's USER-AUTHORED artifacts: Convex-primary, not a
  // projection of Neon. Neon still owns map identity, metadata and durable
  // access; nothing here ever writes back to it. Every document carries JOIN KEYS
  // ONLY — system/connection/signature/map/user IDs and canonical wormhole codes.
  // System names, classes, effects and codex mass/lifetime facts stay in the SDE
  // client codex, so a chain read never pays to re-send reference data and a new
  // SDE build never rewrites stored rows.
  //
  // Granular on the write/subscribe axis, bounded on the read axis (Cost Rule 4):
  // one document per entity so two scouts editing different signatures never
  // share a read/write set, and every growing collection is read through an
  // indexed page rather than collect().

  // The projected role claim the collaborative gate reads. NON-AUTHORITATIVE: a
  // regenerable mirror of the durable Neon rule, carrying the full effective role
  // set so a caller matching through several principals keeps every capability.
  // Writers live in convex/mapAccessProjection.ts (reconcile + per-user purge).
  // Neon remains the authority; these rows are regenerable and never answer a
  // durable access question on their own.
  mapAccess: defineTable({
    mapId: v.string(),
    userId: v.string(),
    // Non-empty, unique, stored in MAP_ROLE_PRECEDENCE order so a re-projection
    // that changes nothing compares equal and skips the write (Cost Rule 3). The
    // validator is bound to the shared Neon role vocabulary, so widening
    // MAP_ROLES without widening this table is a compile error rather than a
    // claim the projection writer would silently fail to store.
    roles: v.array(mapRoleValidator),
  })
    .index('by_map', ['mapId'])
    // The gate's single indexed read; it is also the read set that must
    // participate in live revocation when a claim row is deleted.
    .index('by_map_user', ['mapId', 'userId'])
    // Per-user claim teardown for account purge (/purge-map-access).
    .index('by_user', ['userId']),

  // One document per system placed on one map. Soft deletion mirrors
  // mapSignatures: optional because live rows may predate the fields, both
  // null/absent while active, and both finite with purgeAfter > deletedAt when
  // tombstoned.
  mapSystems: defineTable({
    mapId: v.string(),
    systemId: v.number(),
    deletedAt: optionalTimestampValidator,
    purgeAfter: optionalTimestampValidator,
  })
    .index('by_map', ['mapId'])
    // Makes the map/system upsert an exact indexed lookup, so a repeated or
    // concurrent placement converges on one document instead of racing.
    .index('by_map_system', ['mapId', 'systemId'])
    .index('by_purge_after', ['purgeAfter']),

  // One document per wormhole identity on one map. A scanned-but-unexplored
  // hole has a null destination and origin signature; resolving it fills the
  // far endpoint on the same durable row. Endpoints are system IDs, never
  // document references. Remaining lifetime is the death window
  // pair `deathEarliestAt`/`deathLatestAt` (absolute instants; clients derive
  // the countdown). One narrow sanctioned scheduler exception exists by
  // 4.0.4.3.1 operator ruling: the 15-minute ceiling sweep collapses a
  // connection only past `deathLatestAt + CEILING_COLLAPSE_GRACE_MS` — death
  // already certain — through the same collapse core every manual trigger
  // uses; every other countdown remains client-derived display. `eolAt` is
  // vestigial — a
  // superseded mark-EOL design with no production writer; it stays null.
  // lifeStage is the human-observed Reliable Lifetime bucket; estimates that
  // consume lifeStageObservedAt belong to a later session.
  mapConnections: defineTable({
    mapId: v.string(),
    fromSystemId: v.number(),
    toSystemId: v.union(v.number(), v.null()),
    wormholeTypeCode: wormholeTypeCodeValidator,
    massState: massStateValidator,
    shipSize: shipSizeValidator,
    eolAt: v.union(v.number(), v.null()),
    // Additive rollout fields stay optional until every live document has
    // passed through the merged-model writers.
    fromSignatureId: v.optional(v.string()),
    toSignatureId: v.optional(v.string()),
    typedSide: v.optional(typedSideValidator),
    fromDestinationHint: v.optional(destinationHintValidator),
    toDestinationHint: v.optional(destinationHintValidator),
    typeProvenance: v.optional(connectionProvenanceValidator),
    destinationProvenance: v.optional(connectionProvenanceValidator),
    observedMassKg: v.optional(v.number()),
    observedMassAtStateKg: v.optional(v.number()),
    observationKey: v.optional(v.string()),
    pendingCandidates: v.optional(v.array(v.id('mapConnections'))),
    // Which tracked character created an assumed multi-survivor prompt. The
    // scanner answers surface only to clients that track this character so a
    // jump by one pilot does not ask every editor on the map.
    pendingResolutionCharacterId: v.optional(v.number()),
    fromSignalPct: v.optional(v.union(v.number(), v.null())),
    firstSeenAt: v.optional(v.number()),
    lifeStage: v.optional(lifeStageValidator),
    lifeStageObservedAt: optionalTimestampValidator,
    deathEarliestAt: optionalTimestampValidator,
    deathLatestAt: optionalTimestampValidator,
    deletedAt: optionalTimestampValidator,
    purgeAfter: optionalTimestampValidator,
  })
    .index('by_map', ['mapId'])
    .index('by_map_from', ['mapId', 'fromSystemId'])
    .index('by_map_to', ['mapId', 'toSystemId'])
    // Ceiling-sweep range: leading with the tombstone field keeps every
    // already-collapsed row out of the sweep's candidate range by construction,
    // so the bounded batch never head-of-line-blocks on its own prior work.
    .index('by_deleted_death_latest', ['deletedAt', 'deathLatestAt'])
    .index('by_purge_after', ['purgeAfter']),

  // Exactly-once jump-processing state is deliberately separate from the
  // deletable tracking opt-in so an untrack/retrack cycle cannot erase it.
  mapJumpBookkeeping: defineTable({
    mapId: v.string(),
    characterId: v.number(),
    lastProcessedTransitionAt: v.number(),
  })
    .index('by_map', ['mapId'])
    .index('by_map_character', ['mapId', 'characterId'])
    // Account/character purge drains stamps across every map.
    .index('by_character', ['characterId']),

  // One immutable audit row per destructive/restore map event. Actor and
  // display payload are resolved at write time so the bounded ledger read has
  // no user-directory or chain-entity N+1. Seven-day cleanup ranges the
  // retention index; the UI reads newest-first through the compound map/time
  // index without watching unrelated maps.
  mapEvents: defineTable({
    mapId: v.string(),
    at: v.number(),
    kind: mapEventKindValidator,
    actor: v.string(),
    payload: mapEventPayloadValidator,
    purgeAfter: v.number(),
  })
    .index('by_map', ['mapId', 'at'])
    .index('by_purge_after', ['purgeAfter']),

  // One document per scanned signature. The nullable knowledge fields hold the
  // map's best SHARED knowledge: a later observation may enrich them, but a
  // less-resolved paste never erases what the map already knows. Soft deletion is
  // reversible — the payload stays on the document so a restore recovers it
  // unchanged — and bounded by an absolute purge instant.
  mapSignatures: defineTable({
    mapId: v.string(),
    systemId: v.number(),
    signatureId: v.string(),
    kind: v.optional(scannedKindValidator),
    group: v.union(v.string(), v.null()),
    typeName: v.union(v.string(), v.null()),
    signalPct: v.optional(v.union(v.number(), v.null())),
    // Non-null only with group 'wormhole'. An identified-as-wormhole-but-untyped
    // signature stores null here; K162 is a real far-side code, never a stand-in
    // for unknown.
    wormholeTypeCode: wormholeTypeCodeValidator,
    // Both null on an active row, or both finite with purgeAfter > deletedAt.
    deletedAt: v.union(v.number(), v.null()),
    purgeAfter: v.union(v.number(), v.null()),
  })
    .index('by_map', ['mapId'])
    .index('by_map_signature', ['mapId', 'systemId', 'signatureId'])
    // Expiry-only cleanup ranges this oldest-first. Convex orders null below
    // every number, so an active (null) row cannot enter a `> null` range and
    // survives every cleanup call by construction.
    .index('by_purge_after', ['purgeAfter']),

  // One document per user-authored note. Notes are primary payload, not a
  // projection. A map-wide note repeats the stable map ID as its target; system
  // and signature notes carry the matching Convex document ID. The first UI may
  // expose only system notes while the stored shape already admits the others.
  mapNotes: defineTable({
    mapId: v.string(),
    targetKind: noteTargetKindValidator,
    targetId: v.string(),
    body: v.string(),
  })
    .index('by_map', ['mapId'])
    // Reserved for the authoring surfaces in 4.0.4.x: fetching or replacing the
    // note on one specific target without ranging the whole map.
    .index('by_map_target', ['mapId', 'targetKind', 'targetId']),

  // Last-seen bookkeeping, split off mapSignatures exactly as syncPresence is
  // split off syncSubjects (Cost Rule 2). No payload query reads this table, so a
  // re-observation of an unchanged signature cannot invalidate a watched chain
  // document through Convex's document-granular reactivity.
  mapSignatureActivity: defineTable({
    mapId: v.string(),
    systemId: v.number(),
    signatureId: v.string(),
    lastSeenAt: v.number(),
  })
    // Reserved for the per-map teardown 4.0.2.2.2 owns; the write path uses only
    // by_map_signature, and no payload query reads this table at all.
    .index('by_map', ['mapId'])
    .index('by_map_signature', ['mapId', 'systemId', 'signatureId']),

  // ── v4.0.4.2.1 tracked location (live map state, not chain) ─────────────────
  //
  // Per-(map, character) opt-in registry. Live map state, not a chain document:
  // viewers join through this table to the per-character location payload below.
  // Revocation and map teardown cascade deletes here inside reconcileMapClaims;
  // account/character purge hits POST /purge-location-tracking (backstopped by
  // the purge-map-access door's tracking sweep).
  // DURABLE user-authored state (the header's mapTracking carve-out): not
  // derivable from Neon/ESI — a wipe loses pilots' opt-ins. Growth is bounded
  // by TRACKED_CHARACTERS_PER_MAP_USER_CAP in convex/mapTracking.ts.
  mapTracking: defineTable({
    mapId: v.string(),
    userId: v.string(),
    characterId: v.number(),
  })
    .index('by_map', ['mapId'])
    .index('by_map_user', ['mapId', 'userId'])
    .index('by_user_character', ['userId', 'characterId']),

  // One document per character — not per map — carrying current system,
  // docked station/structure, ship type, previous system, sample continuity, and
  // ETags. Viewers join through mapTracking, so one movement is one write
  // regardless of how many maps track the character. Chain tables never gain
  // location fields (HC-3).
  characterLocation: defineTable({
    userId: v.string(),
    characterId: v.number(),
    solarSystemId: v.number(),
    stationId: v.union(v.number(), v.null()),
    structureId: v.union(v.number(), v.null()),
    shipTypeId: v.union(v.number(), v.null()),
    prevSolarSystemId: v.union(v.number(), v.null()),
    prevFresh: v.boolean(),
    // Dedicated system-transition epoch. Unlike observedAt, dock/undock fact
    // changes never advance this stamp, so automatic jump processing can key
    // exactly-once behavior to a genuine system change.
    transitionObservedAt: v.optional(v.number()),
    // LAST-CHANGE time, not last-confirmation: the zero-write 304 path (HC-3)
    // never touches this doc, so a stationary pilot's observedAt ages while
    // still confirmed live. Freshness consumers read the subject row's
    // lastFinishedAt; this field only dates the facts above.
    observedAt: v.number(),
    etagLocation: v.union(v.string(), v.null()),
    etagShip: v.union(v.string(), v.null()),
  })
    .index('by_user', ['userId'])
    .index('by_user_character', ['userId', 'characterId']),

  // Per-character held state for the location sync's online probe: is the
  // pilot logged into EVE, and until when is that answer cached. Deliberately
  // its OWN table, not fields on characterLocation — mapTracking.forMap joins
  // characterLocation docs, and the probe refreshes onlineExpiresAt every
  // ~60s while all pilots are offline; writing that onto a subscribed doc
  // would re-run every watching map's forMap each probe (docs/CONVEX.md
  // Rule 2). NOTHING subscribes to this table: the engine's pacing reads the
  // subject row's minExpiresAt, and the action reads these rows through
  // heldState inside its run. Regenerable; purged with characterLocation via
  // the same /purge-location-tracking door. Apply no longer orphan-cleans this table.
  characterLocationOnline: defineTable({
    userId: v.string(),
    characterId: v.number(),
    online: v.boolean(),
    // Held for the conditional read; ESI's 304 never repeats the ETag, so the
    // action echoes the held one across an unchanged read.
    etagOnline: v.union(v.string(), v.null()),
    // When the held answer lapses (ESI Expires, ~60s): the probe reuses the
    // held flag inside this window and re-reads past it, so tracked pilots
    // never bill more than ~1/min of /online reads regardless of the 5s loop.
    onlineExpiresAt: v.number(),
  })
    .index('by_user', ['userId'])
    .index('by_user_character', ['userId', 'characterId']),

  // Short-lived EVE access-token lease for the location sync. NOTHING
  // subscribes to this table — public queries must never read it. Convex
  // holds the token until Neon's expiresAt, then vends once. Refresh tokens
  // never leave Neon. Purged with characterLocation via the same door.
  characterLocationAccess: defineTable({
    userId: v.string(),
    characterId: v.number(),
    accessToken: v.string(),
    expiresAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_user', ['userId'])
    .index('by_user_character', ['userId', 'characterId']),
});
