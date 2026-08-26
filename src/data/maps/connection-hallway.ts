import type {
  ConnectionMassState,
  ConnectionProvenance,
  WormholeDestinationHint,
  WormholeLifeStage,
  WormholeSizeClass,
} from '@/data/eve-data/wormhole-contract';
import type { ConnectionDeathWindow } from '@/data/maps/connection-lifetime';

/** One stored end of a hallway — not incoming/outgoing, not named/K162. */
export type ConnectionDoorSide = 'from' | 'to';

/**
 * Leads-to on one mouth. A class note and a typed system cannot both sit
 * on the same door; unset means show the other system when it is known.
 */
export type DoorLeadsTo =
  | { readonly kind: 'unset' }
  | { readonly kind: 'hint'; readonly hint: WormholeDestinationHint }
  | { readonly kind: 'system'; readonly systemId: number };

/** One mouth of a hallway: type, scan identity, and the exclusive leads-to. */
export interface ConnectionDoorValue {
  readonly typeCode: string | null;
  readonly signatureId: string | null;
  readonly signalPct: number | null;
  readonly leadsTo: DoorLeadsTo;
}

/** Type provenance for the hallway. Door codes live on the doors. */
export type ConnectionIdentity =
  | { readonly kind: 'unknown' }
  | { readonly kind: 'typed'; readonly provenance: ConnectionProvenance };

/** Remaining life. A death window is both bounds; `eolAt` is gone. */
export type ConnectionLifetime =
  | { readonly kind: 'unknown' }
  | {
      readonly kind: 'stage';
      readonly lifeStage: WormholeLifeStage;
      readonly observedAt: number;
    }
  | {
      readonly kind: 'window';
      readonly earliestAt: number;
      readonly latestAt: number;
      readonly lifeStage: WormholeLifeStage | null;
      readonly observedAt: number | null;
    };

/**
 * Jump-destination knowledge. Pending is an assumed multi-survivor prompt
 * with the character that owes the answer — never a bare id list.
 */
export type ConnectionResolution =
  | { readonly kind: 'open' }
  | { readonly kind: 'destination'; readonly provenance: ConnectionProvenance }
  | {
      readonly kind: 'pending';
      readonly provenance: 'assumed';
      readonly candidateIds: readonly string[];
      readonly characterId: number;
    };

/** Live or removed. Removed always carries the delete stamp. */
export type ConnectionTombstone =
  | { readonly kind: 'live' }
  | {
      readonly kind: 'removed';
      readonly deletedAt: number;
      readonly purgeAfter: number | null;
    };

/** Insertable hallway document (no Convex system fields). */
export interface ConnectionHallway {
  readonly mapId: string;
  readonly fromSystemId: number;
  readonly toSystemId: number | null;
  readonly from: ConnectionDoorValue;
  readonly to: ConnectionDoorValue;
  readonly massState: ConnectionMassState | null;
  readonly shipSize: WormholeSizeClass | null;
  readonly identity: ConnectionIdentity;
  readonly lifetime: ConnectionLifetime;
  readonly resolution: ConnectionResolution;
  readonly tombstone: ConnectionTombstone;
  readonly firstSeenAt?: number;
  readonly observedMassKg?: number;
  readonly observedMassAtStateKg?: number;
  readonly observationKey?: string;
}

/** Empty mouth: unidentified, no signature, no leads-to note. */
export function blankDoor(): ConnectionDoorValue {
  return {
    typeCode: null,
    signatureId: null,
    signalPct: null,
    leadsTo: { kind: 'unset' },
  };
}

/** Live hallway with unidentified doors and no exclusive knowledge. */
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

/** Exclusive leads-to from a class note. */
export function leadsToFromHint(
  hint: WormholeDestinationHint | null | undefined,
): DoorLeadsTo {
  return hint == null ? { kind: 'unset' } : { kind: 'hint', hint };
}

/** Exclusive leads-to from a typed system that is not the other door. */
export function leadsToFromSystem(systemId: number | null | undefined): DoorLeadsTo {
  return systemId == null ? { kind: 'unset' } : { kind: 'system', systemId };
}

/** Class note on this mouth, or null. */
export function doorHint(door: ConnectionDoorValue): WormholeDestinationHint | null {
  return door.leadsTo.kind === 'hint' ? door.leadsTo.hint : null;
}

/** Typed-system override on this mouth, or null. */
export function doorSystemNote(door: ConnectionDoorValue): number | null {
  return door.leadsTo.kind === 'system' ? door.leadsTo.systemId : null;
}

/** Provenance when at least one mouth has a type; otherwise unknown. */
export function identityFromDoors(
  fromType: string | null,
  toType: string | null,
  provenance: ConnectionProvenance | null | undefined,
): ConnectionIdentity {
  if (fromType === null && toType === null) return { kind: 'unknown' };
  if (provenance == null) return { kind: 'unknown' };
  return { kind: 'typed', provenance };
}

/** Picks the lifetime variant that can actually hold the supplied facts. */
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

/** Absolute death window, or null when lifetime has none. */
export function lifetimeDeathWindow(
  lifetime: ConnectionLifetime,
): ConnectionDeathWindow | null {
  return lifetime.kind === 'window'
    ? { earliestAt: lifetime.earliestAt, latestAt: lifetime.latestAt }
    : null;
}

/** Observed Reliable Lifetime bucket, or null. */
export function lifetimeStage(
  lifetime: ConnectionLifetime,
): WormholeLifeStage | null {
  return lifetime.kind === 'unknown' ? null : lifetime.lifeStage;
}

/** Observation instant for a stage, or null. */
export function lifetimeObservedAt(lifetime: ConnectionLifetime): number | null {
  if (lifetime.kind === 'unknown') return null;
  return lifetime.observedAt;
}

/** Assumed multi-survivor prompt, or open/destination. */
export function pendingResolution(
  candidateIds: readonly string[],
  characterId: number,
): ConnectionResolution {
  return {
    kind: 'pending',
    provenance: 'assumed',
    candidateIds,
    characterId,
  };
}

/** Destination filled without an answerable prompt. */
export function destinationResolution(
  provenance: ConnectionProvenance,
): ConnectionResolution {
  return { kind: 'destination', provenance };
}

export function isPendingResolution(
  resolution: ConnectionResolution,
): resolution is Extract<ConnectionResolution, { kind: 'pending' }> {
  return resolution.kind === 'pending' && resolution.candidateIds.length > 1;
}

export function destinationProvenanceOf(
  resolution: ConnectionResolution,
): ConnectionProvenance | null {
  return resolution.kind === 'open' ? null : resolution.provenance;
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

/** Door on the named stored end. */
export function hallwayDoor(
  hallway: { readonly from: ConnectionDoorValue; readonly to: ConnectionDoorValue },
  side: ConnectionDoorSide,
): ConnectionDoorValue {
  return side === 'from' ? hallway.from : hallway.to;
}

/** Replace one mouth; the other mouth is unchanged. */
export function replaceDoor(
  hallway: { readonly from: ConnectionDoorValue; readonly to: ConnectionDoorValue },
  side: ConnectionDoorSide,
  door: ConnectionDoorValue,
): { readonly from: ConnectionDoorValue; readonly to: ConnectionDoorValue } {
  return side === 'from'
    ? { from: door, to: hallway.to }
    : { from: hallway.from, to: door };
}

/** Type codes actually stored on each mouth. */
export function hallwayDoorTypes(hallway: {
  readonly from: ConnectionDoorValue;
  readonly to: ConnectionDoorValue;
}): { readonly from: string | null; readonly to: string | null } {
  return { from: hallway.from.typeCode, to: hallway.to.typeCode };
}
