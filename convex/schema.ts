import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';
import {
  connectionDoorValidator,
  connectionIdentityValidator,
  connectionLifetimeValidator,
  connectionResolutionValidator,
  connectionTombstoneValidator,
  mapEventKindValidator,
  mapEventPayloadValidator,
  mapRoleValidator,
  massStateValidator,
  noteTargetKindValidator,
  optionalTimestampValidator,
  scannedKindValidator,
  shipSizeValidator,
  wormholeTypeCodeValidator,
} from './lib/mapEntityContracts';
import { runObservabilityFields } from './lib/syncFields';

export default defineSchema({
  syncSubjects: defineTable({
    dataset: v.union(v.literal('onlineStatus'), v.literal('characterLocation')),
    userId: v.string(),
    status: v.union(v.literal('idle'), v.literal('running')),
    lastRequestedAt: v.number(),
    workId: v.union(v.string(), v.null()),
    nextDueAt: v.union(v.number(), v.null()),
    minExpiresAt: v.union(v.number(), v.null()),
    syncedCharacterIds: v.array(v.number()),
    coveredCharacterIds: v.optional(v.array(v.number())),
    lastFinishedAt: v.union(v.number(), v.null()),
    ...runObservabilityFields,
  })
    .index('by_user_dataset', ['userId', 'dataset'])
    .index('by_next_due', ['nextDueAt']),

  syncPresence: defineTable({
    dataset: v.union(v.literal('onlineStatus'), v.literal('characterLocation')),
    userId: v.string(),
    lastSeenAt: v.number(),
    lastVisibleAt: v.optional(v.number()),
    tabId: v.optional(v.string()),
    leftTabId: v.optional(v.string()),
  })
    .index('by_user_dataset', ['userId', 'dataset'])
    .index('by_last_seen', ['lastSeenAt']),

  characterOnline: defineTable({
    userId: v.string(),
    characterId: v.number(),
    online: v.boolean(),
    etag: v.union(v.string(), v.null()),
  })
    .index('by_user', ['userId'])
    .index('by_user_character', ['userId', 'characterId']),

  mapAccess: defineTable({
    mapId: v.string(),
    userId: v.string(),
    roles: v.array(mapRoleValidator),
  })
    .index('by_map', ['mapId'])
    .index('by_map_user', ['mapId', 'userId'])
    .index('by_user', ['userId']),

  mapAccessProjectionWatermarks: defineTable({
    mapId: v.string(),
    revision: v.number(),
  }).index('by_map', ['mapId']),

  mapSystems: defineTable({
    mapId: v.string(),
    systemId: v.number(),
    deletedAt: optionalTimestampValidator,
    purgeAfter: optionalTimestampValidator,
  })
    .index('by_map', ['mapId'])
    .index('by_map_system', ['mapId', 'systemId'])
    .index('by_purge_after', ['purgeAfter']),

  mapConnections: defineTable({
    mapId: v.string(),
    fromSystemId: v.number(),
    toSystemId: v.union(v.number(), v.null()),
    from: connectionDoorValidator,
    to: connectionDoorValidator,
    massState: massStateValidator,
    shipSize: shipSizeValidator,
    identity: connectionIdentityValidator,
    lifetime: connectionLifetimeValidator,
    resolution: connectionResolutionValidator,
    tombstone: connectionTombstoneValidator,
    observedMassKg: v.optional(v.number()),
    observedMassAtStateKg: v.optional(v.number()),
    observationKey: v.optional(v.string()),
    firstSeenAt: v.optional(v.number()),
    staticCode: v.optional(v.string()),
    seatOrderAt: v.optional(v.number()),
  })
    .index('by_map', ['mapId'])
    .index('by_map_from', ['mapId', 'fromSystemId'])
    .index('by_map_to', ['mapId', 'toSystemId'])
    .index('by_tombstone_death_latest', ['tombstone.kind', 'lifetime.latestAt'])
    .index('by_purge_after', ['tombstone.purgeAfter']),

  mapJumpBookkeeping: defineTable({
    mapId: v.string(),
    characterId: v.number(),
    lastProcessedTransitionAt: v.number(),
  })
    .index('by_map', ['mapId'])
    .index('by_map_character', ['mapId', 'characterId'])
    .index('by_character', ['characterId']),

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

  mapSignatures: defineTable({
    mapId: v.string(),
    systemId: v.number(),
    signatureId: v.string(),
    kind: v.optional(scannedKindValidator),
    group: v.union(v.string(), v.null()),
    typeName: v.union(v.string(), v.null()),
    signalPct: v.optional(v.union(v.number(), v.null())),
    wormholeTypeCode: wormholeTypeCodeValidator,
    deletedAt: v.union(v.number(), v.null()),
    purgeAfter: v.union(v.number(), v.null()),
  })
    .index('by_map', ['mapId'])
    .index('by_map_signature', ['mapId', 'systemId', 'signatureId'])
    .index('by_purge_after', ['purgeAfter']),

  mapNotes: defineTable({
    mapId: v.string(),
    targetKind: noteTargetKindValidator,
    targetId: v.string(),
    body: v.string(),
  })
    .index('by_map', ['mapId'])
    .index('by_map_target', ['mapId', 'targetKind', 'targetId']),

  mapSignatureActivity: defineTable({
    mapId: v.string(),
    systemId: v.number(),
    signatureId: v.string(),
    lastSeenAt: v.number(),
  })
    .index('by_map', ['mapId'])
    .index('by_map_signature', ['mapId', 'systemId', 'signatureId']),

  mapTracking: defineTable({
    mapId: v.string(),
    userId: v.string(),
    characterId: v.number(),
  })
    .index('by_map', ['mapId'])
    .index('by_map_user', ['mapId', 'userId'])
    .index('by_user_character', ['userId', 'characterId']),

  characterLocation: defineTable({
    userId: v.string(),
    characterId: v.number(),
    solarSystemId: v.number(),
    stationId: v.union(v.number(), v.null()),
    structureId: v.union(v.number(), v.null()),
    shipTypeId: v.union(v.number(), v.null()),
    prevSolarSystemId: v.union(v.number(), v.null()),
    prevFresh: v.boolean(),
    transitionObservedAt: v.optional(v.number()),
    observedAt: v.number(),
    etagLocation: v.union(v.string(), v.null()),
    etagShip: v.union(v.string(), v.null()),
  })
    .index('by_user', ['userId'])
    .index('by_user_character', ['userId', 'characterId']),

  characterLocationCovered: defineTable({
    userId: v.string(),
    characterId: v.number(),
  })
    .index('by_user', ['userId'])
    .index('by_user_character', ['userId', 'characterId']),

  characterLocationOnline: defineTable({
    userId: v.string(),
    characterId: v.number(),
    online: v.boolean(),
    etagOnline: v.union(v.string(), v.null()),
    onlineExpiresAt: v.number(),
  })
    .index('by_user', ['userId'])
    .index('by_user_character', ['userId', 'characterId']),

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
