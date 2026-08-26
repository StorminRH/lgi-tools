import { ConvexError, v } from 'convex/values';
import { doorDestination } from '@/data/maps/connection-door-destinations';
import { connectionTypePatch } from '@/data/maps/connection-door-types';
import {
  connectionLifetimeFrom,
  destinationProvenanceOf,
  hallwayDoor,
  identityEquals,
  leadsToEquals,
  leadsToFromHint,
  leadsToFromSystem,
  lifetimeDeathWindow,
  lifetimeObservedAt,
  lifetimeStage,
  replaceDoor,
} from '@/data/maps/connection-hallway';
import {
  intersectOrReset,
  type ConnectionDeathWindow,
} from '@/data/maps/connection-lifetime';
import {
  isWormholeTypeCode,
  type ConnectionMassState,
  type WormholeDestinationHint,
  type WormholeSizeClass,
} from '@/data/eve-data/wormhole-contract';
import type { Doc, Id } from './_generated/dataModel';
import { mutation, type MutationCtx } from './_generated/server';
import { requireMapAccess } from './lib/mapAccess';
import { requireLiveConnectionOnMap } from './lib/mapConnectionLookup';
import {
  connectionDoorSideValidator,
  destinationHintValidator,
  lifeStageValidator,
  massStateValidator,
  optionalTimestampValidator,
  shipSizeValidator,
  validateDeathWindowInput,
  wormholeTypeCodeValidator,
  type WormholeLifeStage,
} from './lib/mapEntityContracts';
import { stampObservationKey } from './lib/observationKey';
import { requireSystemId } from './lib/mapSystemLookup';

async function requireLiveConnection(
  ctx: MutationCtx,
  mapId: string,
  connectionId: Id<'mapConnections'>,
): Promise<Doc<'mapConnections'>> {
  await requireMapAccess(ctx, mapId, 'edit');
  return await requireLiveConnectionOnMap(ctx, mapId, connectionId);
}

async function patchConnectionField<K extends keyof Doc<'mapConnections'>>(
  ctx: MutationCtx,
  mapId: string,
  connectionId: Id<'mapConnections'>,
  field: K,
  value: Doc<'mapConnections'>[K],
  extra?: Partial<Doc<'mapConnections'>>,
): Promise<{ changed: boolean }> {
  const connection = await requireLiveConnection(ctx, mapId, connectionId);
  if (connection[field] === value) return { changed: false };
  await ctx.db.patch(connectionId, { [field]: value, ...extra });
  return { changed: true };
}

interface DeathWindowArgs {
  readonly deathEarliestAt?: number | null;
  readonly deathLatestAt?: number | null;
}

function storedDeathWindow(
  connection: Doc<'mapConnections'>,
): ConnectionDeathWindow | null {
  return lifetimeDeathWindow(connection.lifetime);
}

function resolveDeathWindow(
  connection: Doc<'mapConnections'>,
  proposal: DeathWindowArgs,
): ConnectionDeathWindow | null {
  const hasEarliest = proposal.deathEarliestAt !== undefined;
  const hasLatest = proposal.deathLatestAt !== undefined;
  if (!hasEarliest && !hasLatest) return storedDeathWindow(connection);
  if (hasEarliest !== hasLatest) {
    validateDeathWindowInput({
      deathEarliestAt: proposal.deathEarliestAt,
      deathLatestAt: proposal.deathLatestAt,
    });
    throw new ConvexError({
      code: 'INVALID_DEATH_WINDOW',
      detail: 'Death-window timestamps must both be supplied.',
    });
  }

  validateDeathWindowInput(proposal);
  const earliestAt = proposal.deathEarliestAt;
  const latestAt = proposal.deathLatestAt;
  if (earliestAt === null || latestAt === null) {
    return null;
  }
  if (earliestAt === undefined || latestAt === undefined) {
    throw new ConvexError({
      code: 'INVALID_DEATH_WINDOW',
      detail: 'Death-window timestamps must both be supplied.',
    });
  }
  return intersectOrReset(storedDeathWindow(connection), {
    earliestAt,
    latestAt,
  });
}

function sameDeathWindow(
  connection: Doc<'mapConnections'>,
  window: ConnectionDeathWindow | null,
): boolean {
  const current = storedDeathWindow(connection);
  if (current === null && window === null) return true;
  if (current === null || window === null) return false;
  return current.earliestAt === window.earliestAt
    && current.latestAt === window.latestAt;
}

function clearPendingResolution(
  connection: Doc<'mapConnections'>,
): Doc<'mapConnections'>['resolution'] {
  const provenance = destinationProvenanceOf(connection.resolution);
  if (provenance === null) return { kind: 'open' };
  return { kind: 'destination', provenance };
}

async function applyConnectionWormholeType(
  ctx: MutationCtx,
  input: {
    readonly mapId: string;
    readonly connectionId: Id<'mapConnections'>;
    readonly value: string | null;
    readonly side?: 'from' | 'to';
    readonly deathEarliestAt?: number | null;
    readonly deathLatestAt?: number | null;
  },
): Promise<{ changed: boolean }> {
  const connection = await requireLiveConnection(
    ctx,
    input.mapId,
    input.connectionId,
  );
  if (input.value !== null && !isWormholeTypeCode(input.value)) {
    throw new ConvexError({
      code: 'INVALID_WORMHOLE_CODE',
      detail: `Unknown wormhole code "${input.value}".`,
    });
  }
  const window = resolveDeathWindow(connection, {
    deathEarliestAt: input.deathEarliestAt,
    deathLatestAt: input.deathLatestAt,
  });
  const door = input.side ?? 'from';
  const typePatch = connectionTypePatch(
    connection,
    door,
    input.value,
    input.value === null ? null : 'human',
  );
  const lifetime = connectionLifetimeFrom({
    lifeStage: lifetimeStage(connection.lifetime),
    observedAt: lifetimeObservedAt(connection.lifetime),
    death: window,
  });
  const resolution = clearPendingResolution(connection);
  if (
    connection.from.typeCode === typePatch.from.typeCode
    && connection.to.typeCode === typePatch.to.typeCode
    && identityEquals(connection.identity, typePatch.identity)
    && connection.resolution.kind === resolution.kind
    && sameDeathWindow(connection, window)
  ) {
    return { changed: false };
  }
  await ctx.db.patch(input.connectionId, {
    ...typePatch,
    resolution,
    lifetime,
    ...(input.value === null
      ? {}
      : stampObservationKey(connection.observationKey).patch),
  });
  return { changed: true };
}

async function applyConnectionDestinationHint(
  ctx: MutationCtx,
  input: {
    readonly mapId: string;
    readonly connectionId: Id<'mapConnections'>;
    readonly side: 'from' | 'to';
    readonly value: WormholeDestinationHint | null;
  },
): Promise<{ changed: boolean }> {
  const connection = await requireLiveConnection(
    ctx,
    input.mapId,
    input.connectionId,
  );
  const door = hallwayDoor(connection, input.side);
  const next = { ...door, leadsTo: leadsToFromHint(input.value) };
  if (leadsToEquals(door.leadsTo, next.leadsTo)) {
    return { changed: false };
  }
  await ctx.db.patch(input.connectionId, replaceDoor(connection, input.side, next));
  return { changed: true };
}

async function applyConnectionDestination(
  ctx: MutationCtx,
  input: {
    readonly mapId: string;
    readonly connectionId: Id<'mapConnections'>;
    readonly side: 'from' | 'to';
    readonly value: number | null;
  },
): Promise<{ changed: boolean }> {
  const connection = await requireLiveConnection(
    ctx,
    input.mapId,
    input.connectionId,
  );
  const door = hallwayDoor(connection, input.side);
  const here = input.side === 'from' ? connection.fromSystemId : connection.toSystemId;
  const derived = doorDestination(
    connection.fromSystemId,
    connection.toSystemId,
    input.side,
  );
  let nextSystem: number | null = null;
  if (input.value !== null) {
    requireSystemId(input.value);
    if (here !== null && input.value === here) {
      throw new ConvexError({
        code: 'SELF_LOOP',
        detail: 'A connection must join two distinct systems.',
      });
    }
    nextSystem = input.value === derived ? null : input.value;
  }
  const next = { ...door, leadsTo: leadsToFromSystem(nextSystem) };
  if (leadsToEquals(door.leadsTo, next.leadsTo)) {
    return { changed: false };
  }
  await ctx.db.patch(input.connectionId, replaceDoor(connection, input.side, next));
  return { changed: true };
}

async function applyConnectionShipSize(
  ctx: MutationCtx,
  mapId: string,
  connectionId: Id<'mapConnections'>,
  value: WormholeSizeClass | null,
): Promise<{ changed: boolean }> {
  return await patchConnectionField(
    ctx,
    mapId,
    connectionId,
    'shipSize',
    value satisfies WormholeSizeClass | null,
  );
}

async function applyConnectionMassState(
  ctx: MutationCtx,
  mapId: string,
  connectionId: Id<'mapConnections'>,
  value: ConnectionMassState | null,
): Promise<{ changed: boolean }> {
  const connection = await requireLiveConnection(ctx, mapId, connectionId);
  const observedMassAtStateKg = connection.observedMassKg ?? 0;
  if (
    connection.massState === value
    && connection.observedMassAtStateKg === observedMassAtStateKg
  ) {
    return { changed: false };
  }
  await ctx.db.patch(connectionId, {
    massState: value satisfies ConnectionMassState | null,
    observedMassAtStateKg,
  });
  return { changed: true };
}

async function applyConnectionLifeStage(
  ctx: MutationCtx,
  input: {
    readonly mapId: string;
    readonly connectionId: Id<'mapConnections'>;
    readonly value: WormholeLifeStage | null;
    readonly deathEarliestAt?: number | null;
    readonly deathLatestAt?: number | null;
  },
): Promise<{ changed: boolean }> {
  const connection = await requireLiveConnection(
    ctx,
    input.mapId,
    input.connectionId,
  );
  const window = resolveDeathWindow(connection, {
    deathEarliestAt: input.deathEarliestAt,
    deathLatestAt: input.deathLatestAt,
  });
  const lifetime = connectionLifetimeFrom({
    lifeStage: input.value,
    observedAt: Date.now(),
    death: window,
  });
  if (
    lifetimeStage(connection.lifetime) === input.value
    && sameDeathWindow(connection, window)
  ) {
    return { changed: false as const };
  }
  await ctx.db.patch(input.connectionId, { lifetime });
  return { changed: true as const };
}

export const setConnectionWormholeType = mutation({
  args: {
    mapId: v.string(),
    connectionId: v.id('mapConnections'),
    value: wormholeTypeCodeValidator,
    side: v.optional(connectionDoorSideValidator),
    deathEarliestAt: optionalTimestampValidator,
    deathLatestAt: optionalTimestampValidator,
  },
  handler: (ctx, args) => applyConnectionWormholeType(ctx, args),
});

export const setConnectionDestinationHint = mutation({
  args: {
    mapId: v.string(),
    connectionId: v.id('mapConnections'),
    side: connectionDoorSideValidator,
    value: v.union(destinationHintValidator, v.null()),
  },
  handler: (ctx, args) => applyConnectionDestinationHint(ctx, args),
});

export const setConnectionDestination = mutation({
  args: {
    mapId: v.string(),
    connectionId: v.id('mapConnections'),
    side: connectionDoorSideValidator,
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
