import { ConvexError } from 'convex/values';
import { doorDestination } from '@/data/maps/connection-door-destinations';
import { connectionTypePatch } from '@/data/maps/connection-door-types';
import {
  deathWindowFrom,
  intersectOrReset,
  type ConnectionDeathWindow,
} from '@/data/maps/connection-lifetime';
import {
  isWormholeTypeCode,
  type ConnectionMassState,
  type WormholeSizeClass,
} from '@/data/eve-data/wormhole-contract';
import type { Doc, Id } from '../_generated/dataModel';
import type { MutationCtx } from '../_generated/server';
import { requireMapAccess } from './mapAccess';
import { requireLiveConnectionOnMap } from './mapConnectionLookup';
import {
  validateDeathWindowInput,
  type WormholeLifeStage,
} from './mapEntityContracts';
import { stampObservationKey } from './observationKey';
import { requireSystemId } from './mapSystemLookup';

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
  return deathWindowFrom(
    connection.deathEarliestAt ?? null,
    connection.deathLatestAt ?? null,
  );
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

function deathWindowPatch(window: ConnectionDeathWindow | null): {
  readonly deathEarliestAt: number | null;
  readonly deathLatestAt: number | null;
} {
  return {
    deathEarliestAt: window?.earliestAt ?? null,
    deathLatestAt: window?.latestAt ?? null,
  };
}

function sameDeathWindow(
  connection: Doc<'mapConnections'>,
  window: ConnectionDeathWindow | null,
): boolean {
  const current = deathWindowPatch(storedDeathWindow(connection));
  const next = deathWindowPatch(window);
  return current.deathEarliestAt === next.deathEarliestAt
    && current.deathLatestAt === next.deathLatestAt;
}

export async function applyConnectionWormholeType(
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
  const typePatch = connectionTypePatch(connection, door, input.value);
  const identityPatch = input.value === null
    ? {
        ...typePatch,
        typeProvenance: undefined,
        pendingCandidates: undefined,
        pendingResolutionCharacterId: undefined,
      }
    : {
        ...typePatch,
        typeProvenance: 'human' as const,
        pendingCandidates: undefined,
        pendingResolutionCharacterId: undefined,
      };
  if (
    connection.fromWormholeTypeCode === typePatch.fromWormholeTypeCode
    && connection.toWormholeTypeCode === typePatch.toWormholeTypeCode
    && connection.wormholeTypeCode === typePatch.wormholeTypeCode
    && connection.typedSide === typePatch.typedSide
    && connection.typeProvenance === (input.value === null ? undefined : 'human')
    && connection.pendingCandidates === undefined
    && connection.pendingResolutionCharacterId === undefined
    && sameDeathWindow(connection, window)
  ) {
    return { changed: false };
  }
  await ctx.db.patch(input.connectionId, {
    ...identityPatch,
    ...(input.value === null
      ? {}
      : stampObservationKey(connection.observationKey).patch),
    ...deathWindowPatch(window),
  });
  return { changed: true };
}

export async function applyConnectionTypedSide(
  ctx: MutationCtx,
  mapId: string,
  connectionId: Id<'mapConnections'>,
  value: 'from' | 'to',
): Promise<{ changed: boolean }> {
  const connection = await requireLiveConnection(ctx, mapId, connectionId);
  if (connection.wormholeTypeCode === null) {
    throw new ConvexError({
      code: 'UNTYPED_CONNECTION',
      detail: 'An unidentified connection has no attributable typed side.',
    });
  }
  if (
    connection.typedSide === value
    && connection.typeProvenance === 'human'
    && connection.pendingCandidates === undefined
    && connection.pendingResolutionCharacterId === undefined
  ) {
    return { changed: false };
  }
  await ctx.db.patch(connectionId, {
    typedSide: value,
    typeProvenance: 'human',
    pendingCandidates: undefined,
    pendingResolutionCharacterId: undefined,
  });
  return { changed: true };
}

export async function applyConnectionDestinationHint(
  ctx: MutationCtx,
  input: {
    readonly mapId: string;
    readonly connectionId: Id<'mapConnections'>;
    readonly side: 'from' | 'to';
    readonly value: Doc<'mapConnections'>['fromDestinationHint'] | null;
  },
): Promise<{ changed: boolean }> {
  const connection = await requireLiveConnection(
    ctx,
    input.mapId,
    input.connectionId,
  );
  const field = input.side === 'from' ? 'fromDestinationHint' : 'toDestinationHint';
  const destField = input.side === 'from'
    ? 'fromDestinationSystemId'
    : 'toDestinationSystemId';
  const normalized = input.value ?? undefined;
  if (
    connection[field] === normalized
    && (normalized === undefined || connection[destField] === undefined)
  ) {
    return { changed: false };
  }
  await ctx.db.patch(input.connectionId, {
    [field]: normalized,
    [destField]: undefined,
  });
  return { changed: true };
}

export async function applyConnectionDestination(
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
  const destField = input.side === 'from'
    ? 'fromDestinationSystemId'
    : 'toDestinationSystemId';
  const hintField = input.side === 'from' ? 'fromDestinationHint' : 'toDestinationHint';
  const here = input.side === 'from' ? connection.fromSystemId : connection.toSystemId;
  const derived = doorDestination(
    connection.fromSystemId,
    connection.toSystemId,
    input.side,
  );
  let next: number | undefined;
  if (input.value !== null) {
    requireSystemId(input.value);
    if (here !== null && input.value === here) {
      throw new ConvexError({
        code: 'SELF_LOOP',
        detail: 'A connection must join two distinct systems.',
      });
    }
    next = input.value === derived ? undefined : input.value;
  }
  const already = connection[destField];
  if (
    already === next
    && (input.value !== null || connection[hintField] === undefined)
  ) {
    return { changed: false };
  }
  await ctx.db.patch(input.connectionId, {
    [destField]: next,
    [hintField]: undefined,
  });
  return { changed: true };
}

export async function applyConnectionShipSize(
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

export async function applyConnectionMassState(
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

export async function applyConnectionLifeStage(
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
  const current = connection.lifeStage ?? null;
  const window = resolveDeathWindow(connection, {
    deathEarliestAt: input.deathEarliestAt,
    deathLatestAt: input.deathLatestAt,
  });
  if (current === input.value && sameDeathWindow(connection, window)) {
    return { changed: false as const };
  }
  await ctx.db.patch(input.connectionId, {
    lifeStage: input.value satisfies WormholeLifeStage | null,
    lifeStageObservedAt: Date.now(),
    ...deathWindowPatch(window),
  });
  return { changed: true as const };
}
