import type {
  ConnectionMassState,
  ConnectionProvenance,
  WormholeDestinationHint,
  WormholeLifeStage,
  WormholeSizeClass,
} from '@/data/eve-data/wormhole-contract';
import type { ConnectionDeathWindow } from '@/data/maps/connection-lifetime';

export type ConnectionDoorSide = 'from' | 'to';

export type ConnectionRowId = string & { __tableName: 'mapConnections' };

export type DoorLeadsTo =
  | { kind: 'unset' }
  | { kind: 'hint'; hint: WormholeDestinationHint }
  | { kind: 'system'; systemId: number };

export interface ConnectionDoorValue {
  typeCode: string | null;
  signatureId: string | null;
  signalPct: number | null;
  leadsTo: DoorLeadsTo;
}

export type ConnectionIdentity =
  | { kind: 'unknown' }
  | { kind: 'typed'; provenance: ConnectionProvenance };

export type ConnectionLifetime =
  | { kind: 'unknown' }
  | {
      kind: 'stage';
      lifeStage: WormholeLifeStage;
      observedAt: number;
    }
  | {
      kind: 'window';
      earliestAt: number;
      latestAt: number;
      lifeStage: WormholeLifeStage | null;
      observedAt: number | null;
    };

export type ConnectionResolution =
  | { kind: 'open' }
  | { kind: 'destination'; provenance: ConnectionProvenance }
  | {
      kind: 'pending';
      provenance: 'assumed';
      candidateIds: ConnectionRowId[];
      characterId: number;
    };

export type ConnectionTombstone =
  | { kind: 'live' }
  | {
      kind: 'removed';
      deletedAt: number;
      purgeAfter: number | null;
    };

export interface ConnectionHallway {
  mapId: string;
  fromSystemId: number;
  toSystemId: number | null;
  from: ConnectionDoorValue;
  to: ConnectionDoorValue;
  massState: ConnectionMassState | null;
  shipSize: WormholeSizeClass | null;
  identity: ConnectionIdentity;
  lifetime: ConnectionLifetime;
  resolution: ConnectionResolution;
  tombstone: ConnectionTombstone;
  firstSeenAt?: number;
  observedMassKg?: number;
  observedMassAtStateKg?: number;
  observationKey?: string;
}

export function blankDoor(): ConnectionDoorValue {
  return {
    typeCode: null,
    signatureId: null,
    signalPct: null,
    leadsTo: { kind: 'unset' },
  };
}

export function blankHallway(args: {
  readonly mapId: string;
  readonly fromSystemId: number;
  readonly toSystemId: number | null;
}): ConnectionHallway {
  return {
    mapId: args.mapId,
    fromSystemId: args.fromSystemId,
    toSystemId: args.toSystemId,
    from: blankDoor(),
    to: blankDoor(),
    massState: null,
    shipSize: null,
    identity: { kind: 'unknown' },
    lifetime: { kind: 'unknown' },
    resolution: { kind: 'open' },
    tombstone: { kind: 'live' },
  };
}

export function leadsToFromHint(
  hint: WormholeDestinationHint | null | undefined,
): DoorLeadsTo {
  return hint == null ? { kind: 'unset' } : { kind: 'hint', hint };
}

export function leadsToFromSystem(systemId: number | null | undefined): DoorLeadsTo {
  return systemId == null ? { kind: 'unset' } : { kind: 'system', systemId };
}

export function doorHint(door: ConnectionDoorValue): WormholeDestinationHint | null {
  return door.leadsTo.kind === 'hint' ? door.leadsTo.hint : null;
}

export function doorSystemNote(door: ConnectionDoorValue): number | null {
  return door.leadsTo.kind === 'system' ? door.leadsTo.systemId : null;
}

export function identityFromDoors(
  fromType: string | null,
  toType: string | null,
  provenance: ConnectionProvenance | null | undefined,
): ConnectionIdentity {
  if (fromType === null && toType === null) return { kind: 'unknown' };
  if (provenance == null) return { kind: 'unknown' };
  return { kind: 'typed', provenance };
}

export function connectionLifetimeFrom(input: {
  readonly lifeStage: WormholeLifeStage | null | undefined;
  readonly observedAt: number | null | undefined;
  readonly death: ConnectionDeathWindow | null;
}): ConnectionLifetime {
  if (input.death !== null) {
    return {
      kind: 'window',
      earliestAt: input.death.earliestAt,
      latestAt: input.death.latestAt,
      lifeStage: input.lifeStage ?? null,
      observedAt: input.observedAt ?? null,
    };
  }
  if (input.lifeStage != null && input.observedAt != null) {
    return {
      kind: 'stage',
      lifeStage: input.lifeStage,
      observedAt: input.observedAt,
    };
  }
  return { kind: 'unknown' };
}

export function lifetimeDeathWindow(
  lifetime: ConnectionLifetime,
): ConnectionDeathWindow | null {
  return lifetime.kind === 'window'
    ? { earliestAt: lifetime.earliestAt, latestAt: lifetime.latestAt }
    : null;
}

export function lifetimeStage(
  lifetime: ConnectionLifetime,
): WormholeLifeStage | null {
  return lifetime.kind === 'unknown' ? null : lifetime.lifeStage;
}

export function lifetimeObservedAt(lifetime: ConnectionLifetime): number | null {
  if (lifetime.kind === 'unknown') return null;
  return lifetime.observedAt;
}

export function pendingResolution(
  candidateIds: readonly ConnectionRowId[],
  characterId: number,
): ConnectionResolution {
  return {
    kind: 'pending',
    provenance: 'assumed',
    candidateIds: [...candidateIds],
    characterId,
  };
}

export function destinationResolution(
  provenance: ConnectionProvenance,
): ConnectionResolution {
  return { kind: 'destination', provenance };
}

export function isPendingResolution(
  resolution: ConnectionResolution,
): resolution is Extract<ConnectionResolution, { kind: 'pending' }> {
  return resolution.kind === 'pending';
}

export function hasAnswerablePrompt(resolution: ConnectionResolution): boolean {
  return isPendingResolution(resolution) && resolution.candidateIds.length > 1;
}

export function leadsToEquals(left: DoorLeadsTo, right: DoorLeadsTo): boolean {
  if (left.kind !== right.kind) return false;
  if (left.kind === 'hint' && right.kind === 'hint') return left.hint === right.hint;
  if (left.kind === 'system' && right.kind === 'system') {
    return left.systemId === right.systemId;
  }
  return true;
}

export function identityEquals(
  left: ConnectionIdentity,
  right: ConnectionIdentity,
): boolean {
  if (left.kind !== right.kind) return false;
  if (left.kind === 'typed' && right.kind === 'typed') {
    return left.provenance === right.provenance;
  }
  return true;
}

export function destinationProvenanceOf(
  resolution: ConnectionResolution,
): ConnectionProvenance | null {
  return resolution.kind === 'open' ? null : resolution.provenance;
}

export function clearPendingResolution(
  resolution: ConnectionResolution,
): ConnectionResolution {
  const provenance = destinationProvenanceOf(resolution);
  if (provenance === null) return { kind: 'open' };
  return { kind: 'destination', provenance };
}

export function isConnectionRemoved(tombstone: ConnectionTombstone): boolean {
  return tombstone.kind === 'removed';
}

export function connectionTombstoneStamps(deletedAt: number, purgeAfter: number): {
  readonly tombstone: ConnectionTombstone;
} {
  return {
    tombstone: { kind: 'removed', deletedAt, purgeAfter },
  };
}

export function liveTombstone(): ConnectionTombstone {
  return { kind: 'live' };
}

export function hallwayDoor(
  hallway: { readonly from: ConnectionDoorValue; readonly to: ConnectionDoorValue },
  side: ConnectionDoorSide,
): ConnectionDoorValue {
  return side === 'from' ? hallway.from : hallway.to;
}

export function replaceDoor(
  hallway: { readonly from: ConnectionDoorValue; readonly to: ConnectionDoorValue },
  side: ConnectionDoorSide,
  door: ConnectionDoorValue,
): { readonly from: ConnectionDoorValue; readonly to: ConnectionDoorValue } {
  return side === 'from'
    ? { from: door, to: hallway.to }
    : { from: hallway.from, to: door };
}

export function hallwayDoorTypes(hallway: {
  readonly from: ConnectionDoorValue;
  readonly to: ConnectionDoorValue;
}): { readonly from: string | null; readonly to: string | null } {
  return { from: hallway.from.typeCode, to: hallway.to.typeCode };
}
