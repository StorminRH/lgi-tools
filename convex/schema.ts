import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';
import { WORMHOLE_SIZE_CLASSES } from '@/data/eve-data/wormhole-contract';
import { MAP_ROLES } from '@/data/maps/access-contract';
import { CONNECTION_MASS_STATES } from './lib/mapEntityContracts';

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
//
// The mapSystems / mapConnections / mapSignatures / mapNotes tables are the one
// sanctioned Convex-primary durability exception for user-authored collaborative
// chain facts. mapAccess is a non-authoritative projected claim; Neon remains
// the durable access authority. mapSignatureActivity is volatile bookkeeping
// kept off watched payload documents.

const mapRoleValidator = v.union(
  ...MAP_ROLES.map((role) => v.literal(role)),
);

const wormholeSizeValidator = v.union(
  ...WORMHOLE_SIZE_CLASSES.map((size) => v.literal(size)),
);

const connectionMassValidator = v.union(
  ...CONNECTION_MASS_STATES.map((state) => v.literal(state)),
);

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

  // Non-authoritative projected role claim for one (map, user). Session
  // 4.0.2.2.2 owns every durable-side writer; the collaborative gate only reads.
  mapAccess: defineTable({
    mapId: v.string(),
    userId: v.string(),
    // Non-empty, unique, and stored in MAP_ROLE_PRECEDENCE order by the writer.
    roles: v.array(mapRoleValidator),
  })
    .index('by_map', ['mapId'])
    .index('by_map_user', ['mapId', 'userId'])
    .index('by_user', ['userId']),

  // One collaborative chain system document per (map, systemId). Join key only.
  mapSystems: defineTable({
    mapId: v.string(),
    systemId: v.number(),
  })
    .index('by_map', ['mapId'])
    .index('by_map_system', ['mapId', 'systemId']),

  // One collaborative connection. Endpoints are system IDs; EOL is absolute.
  mapConnections: defineTable({
    mapId: v.string(),
    fromSystemId: v.number(),
    toSystemId: v.number(),
    wormholeTypeCode: v.union(v.string(), v.null()),
    massState: connectionMassValidator,
    shipSize: v.union(wormholeSizeValidator, v.null()),
    eolAt: v.union(v.number(), v.null()),
  }).index('by_map', ['mapId']),

  // One collaborative signature. Tombstones retain payload until purgeAfter.
  mapSignatures: defineTable({
    mapId: v.string(),
    systemId: v.number(),
    signatureId: v.string(),
    group: v.union(v.string(), v.null()),
    typeName: v.union(v.string(), v.null()),
    wormholeTypeCode: v.union(v.string(), v.null()),
    deletedAt: v.union(v.number(), v.null()),
    purgeAfter: v.union(v.number(), v.null()),
  })
    .index('by_map', ['mapId'])
    .index('by_map_signature', ['mapId', 'systemId', 'signatureId'])
    .index('by_purge_after', ['purgeAfter']),

  // One user-authored note targeting a map, system document, or signature document.
  mapNotes: defineTable({
    mapId: v.string(),
    targetKind: v.union(
      v.literal('map'),
      v.literal('system'),
      v.literal('signature'),
    ),
    targetId: v.string(),
    body: v.string(),
  })
    .index('by_map', ['mapId'])
    .index('by_map_target', ['mapId', 'targetKind', 'targetId']),

  // Volatile last-seen bookkeeping for signatures; never co-read with payloads.
  mapSignatureActivity: defineTable({
    mapId: v.string(),
    systemId: v.number(),
    signatureId: v.string(),
    lastSeenAt: v.number(),
  })
    .index('by_map', ['mapId'])
    .index('by_map_signature', ['mapId', 'systemId', 'signatureId']),
});
