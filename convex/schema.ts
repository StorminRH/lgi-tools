import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';
import {
  lifeStageValidator,
  mapRoleValidator,
  massStateValidator,
  noteTargetKindValidator,
  optionalTimestampValidator,
  shipSizeValidator,
  wormholeTypeCodeValidator,
} from './lib/mapEntityContracts';

// Convex is a regenerable projection of live ESI data keyed by the Neon
// identities (userId + characterId) — never the system of record, never a
// home for SDE/domain data. Wiping these tables and re-syncing must
// reproduce the same state from Neon + ESI.
//
// Since MIGRATE.B the engine serves a SINGLE live consumer — onlineStatus, the
// ≤2-min canary (MIGRATE.A) that keeps the engine exercised + proven for the
// v4.0 mapper. The three slow trackers (skills, personal + corp industry jobs)
// moved to Neon stale-gated on-view reads in MIGRATE.B; their Convex tables +
// dormant dataset literals were wiped in MIGRATE.D.1. See docs/CONVEX.md for
// the engine architecture, the ≤2-min placement rule, and the orphan-guard
// pattern (the dataset-union-as-superset technique the mapper will re-instantiate).

export default defineSchema({
  // One doc per watched subject (dataset × user): presence plus the run
  // lifecycle the 3.4.9 engine absorbed from the trackers. The dataset is part
  // of the row key, so a future second consumer's lifecycle stays isolated from
  // onlineStatus's without duplicating the machinery.
  syncSubjects: defineTable({
    // The engine's live datasets. A single literal today (onlineStatus); the
    // union is designed to hold a SUPERSET of the active registry while a
    // dataset is being retired (the drain-window pattern documented in
    // docs/CONVEX.md — the mapper will re-instantiate it).
    dataset: v.literal('onlineStatus'),
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
    lastFinishedAt: v.union(v.number(), v.null()),
    lastError: v.union(v.string(), v.null()),
    rlGroup: v.union(v.string(), v.null()),
    rlLimit: v.union(v.number(), v.null()),
    rlRemaining: v.union(v.number(), v.null()),
    rlUsed: v.union(v.number(), v.null()),
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
    dataset: v.literal('onlineStatus'),
    userId: v.string(),
    // Last heartbeat from a visible tab. The scan and sweep treat a presence
    // doc older than COLD_AFTER_MS — or a missing one — as cold.
    lastSeenAt: v.number(),
  })
    .index('by_user_dataset', ['userId', 'dataset'])
    // The sweep's two presence-driven passes range over this: hot rows
    // (lastSeenAt >= now - COLD_AFTER_MS, the dropped-timer reconcile) and
    // past-retention rows (lastSeenAt < now - RETENTION_MS, the abandoned-row
    // GC). Ascending order makes the GC pass oldest-first, so a capped catch-up
    // run drains the backlog deterministically.
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

  // One document per connection between two systems on one map. Endpoints are
  // system IDs, never document references, so a connection survives independently
  // of how its endpoints were placed. Remaining lifetime is always derived from
  // `eolAt - now` on the client; no scheduler ever flips an EOL state.
  // lifeStage is the human-observed Reliable Lifetime bucket; estimates that
  // consume lifeStageObservedAt belong to a later session.
  mapConnections: defineTable({
    mapId: v.string(),
    fromSystemId: v.number(),
    toSystemId: v.number(),
    wormholeTypeCode: wormholeTypeCodeValidator,
    massState: massStateValidator,
    shipSize: shipSizeValidator,
    eolAt: v.union(v.number(), v.null()),
    lifeStage: v.optional(lifeStageValidator),
    lifeStageObservedAt: optionalTimestampValidator,
    deletedAt: optionalTimestampValidator,
    purgeAfter: optionalTimestampValidator,
  })
    .index('by_map', ['mapId'])
    .index('by_map_from', ['mapId', 'fromSystemId'])
    .index('by_map_to', ['mapId', 'toSystemId'])
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
    group: v.union(v.string(), v.null()),
    typeName: v.union(v.string(), v.null()),
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
});
