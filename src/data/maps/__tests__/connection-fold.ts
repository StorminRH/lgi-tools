import type {
  ConnectionMassState,
  ConnectionProvenance,
  WormholeDestinationHint,
  WormholeLifeStage,
  WormholeSizeClass,
} from '@/data/eve-data/wormhole-contract';
import { deathWindowFrom } from '@/data/maps/connection-lifetime';
import type { ConnectionDoorSide } from '@/data/maps/connection-hallway';
import {
  blankHallway,
  connectionLifetimeFrom,
  destinationResolution,
  identityFromDoors,
  leadsToFromHint,
  leadsToFromSystem,
  pendingResolution,
  type ConnectionHallway,
  type ConnectionRowId,
} from '@/data/maps/connection-hallway';
import { applyDoorType } from '@/data/maps/connection-door-types';

export interface LegacyConnectionBag {
  readonly mapId: string;
  readonly fromSystemId: number;
  readonly toSystemId: number | null;
  readonly wormholeTypeCode?: string | null;
  readonly fromWormholeTypeCode?: string | null;
  readonly toWormholeTypeCode?: string | null;
  readonly typedSide?: ConnectionDoorSide | null;
  readonly fromSignatureId?: string | null;
  readonly toSignatureId?: string | null;
  readonly fromSignalPct?: number | null;
  readonly fromDestinationHint?: WormholeDestinationHint | null;
  readonly toDestinationHint?: WormholeDestinationHint | null;
  readonly fromDestinationSystemId?: number | null;
  readonly toDestinationSystemId?: number | null;
  readonly typeProvenance?: ConnectionProvenance | null;
  readonly destinationProvenance?: ConnectionProvenance | null;
  readonly pendingCandidates?: readonly string[] | null;
  readonly pendingResolutionCharacterId?: number | null;
  readonly massState?: ConnectionMassState | null;
  readonly shipSize?: WormholeSizeClass | null;
  readonly lifeStage?: WormholeLifeStage | null;
  readonly lifeStageObservedAt?: number | null;
  readonly deathEarliestAt?: number | null;
  readonly deathLatestAt?: number | null;
  readonly deletedAt?: number | null;
  readonly purgeAfter?: number | null;
  readonly firstSeenAt?: number;
  readonly observedMassKg?: number;
  readonly observedMassAtStateKg?: number;
  readonly observationKey?: string;
}

function foldedDoorTypes(bag: LegacyConnectionBag): {
  readonly from: string | null;
  readonly to: string | null;
} {
  const fromStored = bag.fromWormholeTypeCode;
  const toStored = bag.toWormholeTypeCode;
  if (typeof fromStored === 'string' || typeof toStored === 'string') {
    return { from: fromStored ?? null, to: toStored ?? null };
  }
  const code = bag.wormholeTypeCode ?? null;
  const side = bag.typedSide ?? 'from';
  return applyDoorType({ from: null, to: null }, side, code);
}

function foldedLeadsTo(
  hint: WormholeDestinationHint | null | undefined,
  systemId: number | null | undefined,
) {
  if (systemId != null) return leadsToFromSystem(systemId);
  return leadsToFromHint(hint);
}

function foldedResolution(bag: LegacyConnectionBag) {
  const candidates = bag.pendingCandidates ?? [];
  const characterId = bag.pendingResolutionCharacterId;
  if (candidates.length > 1 && characterId != null) {
    return pendingResolution(candidates as ConnectionRowId[], characterId);
  }
  if (bag.destinationProvenance != null) {
    return destinationResolution(bag.destinationProvenance);
  }
  return { kind: 'open' as const };
}

function foldedTombstone(bag: LegacyConnectionBag) {
  if (typeof bag.deletedAt === 'number' && Number.isFinite(bag.deletedAt)) {
    return {
      kind: 'removed' as const,
      deletedAt: bag.deletedAt,
      purgeAfter:
        typeof bag.purgeAfter === 'number' && Number.isFinite(bag.purgeAfter)
          ? bag.purgeAfter
          : null,
    };
  }
  return { kind: 'live' as const };
}

export function foldLegacyConnection(bag: LegacyConnectionBag): ConnectionHallway {
  const types = foldedDoorTypes(bag);
  const hallway = blankHallway({
    mapId: bag.mapId,
    fromSystemId: bag.fromSystemId,
    toSystemId: bag.toSystemId,
  });
  return {
    ...hallway,
    from: {
      typeCode: types.from,
      signatureId: bag.fromSignatureId ?? null,
      signalPct: bag.fromSignalPct ?? null,
      leadsTo: foldedLeadsTo(bag.fromDestinationHint, bag.fromDestinationSystemId),
    },
    to: {
      typeCode: types.to,
      signatureId: bag.toSignatureId ?? null,
      signalPct: null,
      leadsTo: foldedLeadsTo(bag.toDestinationHint, bag.toDestinationSystemId),
    },
    massState: bag.massState ?? null,
    shipSize: bag.shipSize ?? null,
    identity: identityFromDoors(types.from, types.to, bag.typeProvenance),
    lifetime: connectionLifetimeFrom({
      lifeStage: bag.lifeStage,
      observedAt: bag.lifeStageObservedAt,
      death: deathWindowFrom(bag.deathEarliestAt, bag.deathLatestAt),
    }),
    resolution: foldedResolution(bag),
    tombstone: foldedTombstone(bag),
    ...(bag.firstSeenAt === undefined ? {} : { firstSeenAt: bag.firstSeenAt }),
    ...(bag.observedMassKg === undefined ? {} : { observedMassKg: bag.observedMassKg }),
    ...(bag.observedMassAtStateKg === undefined
      ? {}
      : { observedMassAtStateKg: bag.observedMassAtStateKg }),
    ...(bag.observationKey === undefined ? {} : { observationKey: bag.observationKey }),
  };
}
