import { v } from 'convex/values';
import { internalMutation, mutation } from './_generated/server';
import {
  destinationHintValidator,
  lifeStageValidator,
  massStateValidator,
  optionalTimestampValidator,
  shipSizeValidator,
  typedSideValidator,
  wormholeTypeCodeValidator,
} from './lib/mapEntityContracts';
import {
  CHAIN_PURGE_BATCH,
  purgeExpiredChainTombstones as purgeExpiredChainTombstonesCore,
} from './lib/mapChainCleanup';
import { requireMapAccess } from './lib/mapAccess';
import { eventActor, writeMapEvent } from './lib/mapAuthoringEvents';
import {
  addFromNode,
  insertHomeSystem,
  upsertLiveDestination,
} from './lib/mapAuthoringHome';
import {
  applyConnectionDestination,
  applyConnectionDestinationHint,
  applyConnectionLifeStage,
  applyConnectionMassState,
  applyConnectionShipSize,
  applyConnectionTypedSide,
  applyConnectionWormholeType,
} from './lib/mapAuthoringFields';
import {
  clearSystemTombstone,
  restoreLiveConnection,
  stampConnectionTombstone,
  stampSystemTombstone,
} from './lib/mapAuthoringTombstone';
import {
  COLLAPSE_MAP_SCAN_CAP,
  runBranchRestore,
  runCollapse,
  type CollapsePilotsPresent,
  type RunCollapseInput,
  type RunCollapseResult,
} from './lib/mapAuthoringCollapse';
import {
  CEILING_COLLAPSE_GRACE_MS,
  CEILING_SWEEP_ACTOR,
  CEILING_SWEEP_BATCH,
  CEILING_SWEEP_SCAN,
  sweepExpiredCeilings,
} from './lib/mapAuthoringSweep';
import { readTrackedPilotSystemIds } from './mapTracking';

export {
  eventActor,
  writeMapEvent,
  upsertLiveDestination,
  COLLAPSE_MAP_SCAN_CAP,
  runCollapse,
  runBranchRestore,
  CEILING_COLLAPSE_GRACE_MS,
  CEILING_SWEEP_ACTOR,
  CEILING_SWEEP_BATCH,
  CEILING_SWEEP_SCAN,
  sweepExpiredCeilings,
  CHAIN_PURGE_BATCH,
};

export type { CollapsePilotsPresent, RunCollapseInput, RunCollapseResult };

export const setHomeSystem = mutation({
  args: { mapId: v.string(), systemId: v.number() },
  handler: (ctx, { mapId, systemId }) => insertHomeSystem(ctx, mapId, systemId),
});

export const addSystemFromNode = mutation({
  args: {
    mapId: v.string(),
    fromSystemId: v.number(),
    toSystemId: v.number(),
  },
  handler: (ctx, { mapId, fromSystemId, toSystemId }) =>
    addFromNode(ctx, mapId, fromSystemId, toSystemId),
});

export const setConnectionWormholeType = mutation({
  args: {
    mapId: v.string(),
    connectionId: v.id('mapConnections'),
    value: wormholeTypeCodeValidator,
    side: v.optional(typedSideValidator),
    deathEarliestAt: optionalTimestampValidator,
    deathLatestAt: optionalTimestampValidator,
  },
  handler: (ctx, args) => applyConnectionWormholeType(ctx, args),
});

export const setConnectionTypedSide = mutation({
  args: {
    mapId: v.string(),
    connectionId: v.id('mapConnections'),
    value: typedSideValidator,
  },
  handler: (ctx, { mapId, connectionId, value }) =>
    applyConnectionTypedSide(ctx, mapId, connectionId, value),
});

export const setConnectionDestinationHint = mutation({
  args: {
    mapId: v.string(),
    connectionId: v.id('mapConnections'),
    side: typedSideValidator,
    value: v.union(destinationHintValidator, v.null()),
  },
  handler: (ctx, args) => applyConnectionDestinationHint(ctx, args),
});

export const setConnectionDestination = mutation({
  args: {
    mapId: v.string(),
    connectionId: v.id('mapConnections'),
    side: typedSideValidator,
    value: v.union(v.number(), v.null()),
  },
  handler: (ctx, args) => applyConnectionDestination(ctx, args),
});

export const setConnectionShipSize = mutation({
  args: {
    mapId: v.string(),
    connectionId: v.id('mapConnections'),
    value: shipSizeValidator,
  },
  handler: (ctx, { mapId, connectionId, value }) =>
    applyConnectionShipSize(ctx, mapId, connectionId, value),
});

export const setConnectionMassState = mutation({
  args: {
    mapId: v.string(),
    connectionId: v.id('mapConnections'),
    value: massStateValidator,
  },
  handler: (ctx, { mapId, connectionId, value }) =>
    applyConnectionMassState(ctx, mapId, connectionId, value),
});

export const setConnectionLifeStage = mutation({
  args: {
    mapId: v.string(),
    connectionId: v.id('mapConnections'),
    value: lifeStageValidator,
    deathEarliestAt: optionalTimestampValidator,
    deathLatestAt: optionalTimestampValidator,
  },
  handler: (ctx, args) => applyConnectionLifeStage(ctx, args),
});

export const tombstoneSystem = internalMutation({
  args: { mapId: v.string(), systemId: v.number() },
  handler: (ctx, { mapId, systemId }) =>
    stampSystemTombstone(ctx, mapId, systemId),
});

export const tombstoneConnection = internalMutation({
  args: { mapId: v.string(), connectionId: v.id('mapConnections') },
  handler: (ctx, { mapId, connectionId }) =>
    stampConnectionTombstone(ctx, mapId, connectionId),
});

export const restoreSystem = internalMutation({
  args: { mapId: v.string(), systemId: v.number() },
  handler: (ctx, { mapId, systemId }) =>
    clearSystemTombstone(ctx, mapId, systemId),
});

export const severConnection = mutation({
  args: { mapId: v.string(), connectionId: v.id('mapConnections') },
  handler: async (ctx, { mapId, connectionId }) => {
    await requireMapAccess(ctx, mapId, 'edit');
    return runCollapse(ctx, {
      mapId,
      connectionId,
      actor: await eventActor(ctx),
      pilotsPresent: 'unknown',
    });
  },
});

export const restoreSeveredBranch = mutation({
  args: { mapId: v.string(), connectionId: v.id('mapConnections') },
  handler: async (ctx, { mapId, connectionId }) => {
    await requireMapAccess(ctx, mapId, 'edit');
    return runBranchRestore(ctx, {
      mapId,
      connectionId,
      actor: await eventActor(ctx),
    });
  },
});

export const restoreConnection = mutation({
  args: { mapId: v.string(), connectionId: v.id('mapConnections') },
  handler: async (ctx, { mapId, connectionId }) =>
    restoreLiveConnection(ctx, mapId, connectionId, await eventActor(ctx)),
});

export const collapseExpiredConnections = internalMutation({
  args: {},
  handler: async (ctx) =>
    await sweepExpiredCeilings(ctx, Date.now(), readTrackedPilotSystemIds),
});

export const purgeExpiredChainTombstones = internalMutation({
  args: {},
  handler: async (ctx) => await purgeExpiredChainTombstonesCore(ctx, Date.now()),
});
