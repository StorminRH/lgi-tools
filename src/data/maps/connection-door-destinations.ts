// One hallway, two mouths. You are in a system looking at one hole. Leads-to
// defaults to the other system on that hallway. A typed system that is not
// that other system stays on this mouth. A class note is not a typed system.
import type {
  ConnectionMassState,
  ConnectionProvenance,
  WormholeSizeClass,
} from '@/data/eve-data/wormhole-contract';
import { isTombstoned } from '@/data/maps/chain-contract';
import {
  returnDoorTypePatch,
  type ConnectionDoor,
} from '@/data/maps/connection-door-types';
import type {
  ConnectionDoorValue,
  ConnectionIdentity,
  ConnectionLifetime,
  DoorLeadsTo,
} from '@/data/maps/connection-hallway';
import {
  connectionLifetimeFrom,
  doorSystemNote,
  leadsToFromSystem,
  lifetimeDeathWindow,
  lifetimeObservedAt,
  lifetimeStage,
} from '@/data/maps/connection-hallway';

/** The other system's id on this hallway, or null until both systems are known. */
export function doorDestination(
  fromSystemId: number,
  toSystemId: number | null,
  side: ConnectionDoor,
): number | null {
  if (toSystemId === null) return null;
  return side === 'from' ? toSystemId : fromSystemId;
}

/**
 * Leads-to on this hole. A typed system that is not the other system is
 * kept (a typo stays a typo). Otherwise show the other system. Class notes
 * are not passed in here.
 */
export function keepTypedLeadsTo(
  otherLocation: number | null,
  typedSystem: number | null | undefined,
): number | null {
  if (typedSystem == null) return otherLocation;
  if (otherLocation !== null && typedSystem === otherLocation) return otherLocation;
  return typedSystem;
}

export function doorLeadsTo(
  fromSystemId: number,
  toSystemId: number | null,
  side: ConnectionDoor,
  door: ConnectionDoorValue,
): number | null {
  return keepTypedLeadsTo(
    doorDestination(fromSystemId, toSystemId, side),
    doorSystemNote(door),
  );
}

/**
 * When folding this hole onto the surviving hallway, keep a mismatched typed
 * system on this mouth. Do not invent an override when the mouth only had a
 * class note or matched the other system.
 */
export function absorbDoorLeadsNote(
  surviving: DoorLeadsTo,
  stub: DoorLeadsTo,
  otherLocation: number | null,
): DoorLeadsTo {
  const survivingTyped = surviving.kind === 'system' ? surviving.systemId : null;
  const stubTyped = stub.kind === 'system' ? stub.systemId : null;
  const kept = keepTypedLeadsTo(otherLocation, survivingTyped ?? stubTyped);
  if (kept === null || kept === otherLocation) return { kind: 'unset' };
  return leadsToFromSystem(kept);
}

export interface DoorKnowledgeHallway {
  readonly from: ConnectionDoorValue;
  readonly to: ConnectionDoorValue;
  readonly identity: ConnectionIdentity;
  readonly lifetime: ConnectionLifetime;
  readonly massState: ConnectionMassState | null;
  readonly observedMassAtStateKg?: number;
  readonly shipSize: WormholeSizeClass | null;
}

export interface DoorKnowledgePatch {
  readonly from?: ConnectionDoorValue;
  readonly to?: ConnectionDoorValue;
  readonly identity?: ConnectionIdentity;
  readonly lifetime?: ConnectionLifetime;
  readonly massState?: ConnectionMassState | null;
  readonly observedMassAtStateKg?: number;
  readonly shipSize?: WormholeSizeClass | null;
}

const TYPE_PROVENANCE_RANK: Record<ConnectionProvenance, number> = {
  assumed: 1,
  human: 2,
  confirmed: 3,
  'jump-verified': 4,
};

/**
 * Stronger type provenance wins. Never downgrade a human, confirmed, or
 * jump-verified mark on the surviving row.
 */
export function winningTypeProvenance(
  surviving: ConnectionProvenance | null | undefined,
  stub: ConnectionProvenance | null | undefined,
): ConnectionProvenance | undefined {
  const survivingRank = surviving == null ? 0 : TYPE_PROVENANCE_RANK[surviving];
  const stubRank = stub == null ? 0 : TYPE_PROVENANCE_RANK[stub];
  if (stubRank > survivingRank && stub != null) return stub;
  return undefined;
}

function provenanceOf(identity: ConnectionIdentity): ConnectionProvenance | null {
  return identity.kind === 'typed' ? identity.provenance : null;
}

/**
 * The one unresolved origin stub in a system, or null when none or more than
 * one remain. Atlas does not guess which hole is the other door.
 */
export function uniqueCounterpartStub<
  T extends {
    readonly _id: string;
    readonly toSystemId: number | null;
    readonly tombstone?: { readonly kind: 'live' | 'removed' };
    readonly deletedAt?: number | null;
  },
>(rows: readonly T[], excludeIds: ReadonlySet<string>): T | null {
  const stubs = rows.filter((row) => (
    row.toSystemId === null
    && !isTombstoned(row)
    && !excludeIds.has(row._id)
  ));
  return stubs.length === 1 ? stubs[0]! : null;
}

/** Copies only unset hallway facts from a stub that is about to be deleted. */
export function absorbDoorKnowledge(
  surviving: DoorKnowledgeHallway,
  stub: DoorKnowledgeHallway,
  attachedSide: ConnectionDoor,
): DoorKnowledgePatch {
  const typePatch = returnDoorTypePatch(
    surviving,
    attachedSide,
    stub.from.typeCode,
    winningTypeProvenance(provenanceOf(surviving.identity), provenanceOf(stub.identity))
      ?? provenanceOf(surviving.identity),
  );
  const patch: {
    from: ConnectionDoorValue;
    to: ConnectionDoorValue;
    identity: ConnectionIdentity;
    lifetime?: ConnectionLifetime;
    massState?: ConnectionMassState | null;
    observedMassAtStateKg?: number;
    shipSize?: WormholeSizeClass | null;
  } = {
    from: typePatch.from,
    to: typePatch.to,
    identity: typePatch.identity,
  };
  if (surviving.massState === null && stub.massState !== null) {
    patch.massState = stub.massState;
    if (stub.observedMassAtStateKg !== undefined) {
      patch.observedMassAtStateKg = stub.observedMassAtStateKg;
    }
  }
  if (surviving.shipSize === null && stub.shipSize !== null) {
    patch.shipSize = stub.shipSize;
  }
  if (surviving.lifetime.kind === 'unknown' && stub.lifetime.kind !== 'unknown') {
    patch.lifetime = stub.lifetime;
  } else if (
    lifetimeDeathWindow(surviving.lifetime) === null
    && lifetimeDeathWindow(stub.lifetime) !== null
  ) {
    patch.lifetime = connectionLifetimeFrom({
      lifeStage: lifetimeStage(surviving.lifetime) ?? lifetimeStage(stub.lifetime),
      observedAt: lifetimeObservedAt(surviving.lifetime) ?? lifetimeObservedAt(stub.lifetime),
      death: lifetimeDeathWindow(stub.lifetime),
    });
  }
  return patch;
}
