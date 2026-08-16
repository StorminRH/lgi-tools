// One tunnel, two faces. You are in a system looking at one door. Leads-to
// defaults to the other system. A typed system that is not that other
// system stays on that face. A class note is not a typed system.
import type {
  ConnectionMassState,
  ConnectionProvenance,
  WormholeLifeStage,
  WormholeSizeClass,
} from '@/data/eve-data/wormhole-contract';
import { isTombstoned } from '@/data/maps/chain-contract';
import {
  connectionDoorTypes,
  returnDoorTypePatch,
  type ConnectionDoor,
  type ConnectionTypeFields,
} from '@/data/maps/connection-door-types';

/** The other door's system, or null until both locations are known. */
export function doorDestination(
  fromSystemId: number,
  toSystemId: number | null,
  side: ConnectionDoor,
): number | null {
  if (toSystemId === null) return null;
  return side === 'from' ? toSystemId : fromSystemId;
}

/**
 * Leads-to on one face. A typed system that is not the other location is
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

/** Leads-to for the face you are looking at. */
export function doorLeadsTo(
  fromSystemId: number,
  toSystemId: number | null,
  side: ConnectionDoor,
  fromOverride?: number | null,
  toOverride?: number | null,
): number | null {
  return keepTypedLeadsTo(
    doorDestination(fromSystemId, toSystemId, side),
    side === 'from' ? fromOverride : toOverride,
  );
}

/**
 * When folding one face onto the surviving row, keep a mismatched typed
 * system on that face. Do not invent an override when the face only had a
 * class note or matched the other system.
 */
export function absorbDoorLeadsNote(
  survivingTyped: number | null | undefined,
  stubTyped: number | null | undefined,
  otherLocation: number | null,
): number | undefined {
  const kept = keepTypedLeadsTo(otherLocation, survivingTyped ?? stubTyped);
  if (kept === null || kept === otherLocation) return undefined;
  return kept;
}

/** Fields a dying stub can carry onto the surviving hallway. */
export interface DoorKnowledgeFields extends ConnectionTypeFields {
  readonly typeProvenance?: ConnectionProvenance | null;
  readonly massState: ConnectionMassState | null;
  readonly observedMassAtStateKg?: number;
  readonly shipSize: WormholeSizeClass | null;
  readonly lifeStage?: WormholeLifeStage | null;
  readonly lifeStageObservedAt?: number | null;
  readonly deathEarliestAt?: number | null;
  readonly deathLatestAt?: number | null;
}

/** Mutable hallway facts written onto the surviving row. */
export interface DoorKnowledgePatch {
  fromWormholeTypeCode?: string | null;
  toWormholeTypeCode?: string | null;
  wormholeTypeCode?: string | null;
  typedSide?: ConnectionDoor;
  typeProvenance?: ConnectionProvenance;
  massState?: ConnectionMassState | null;
  observedMassAtStateKg?: number;
  shipSize?: WormholeSizeClass | null;
  lifeStage?: WormholeLifeStage | null;
  lifeStageObservedAt?: number | null;
  deathEarliestAt?: number | null;
  deathLatestAt?: number | null;
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

/**
 * The one unresolved origin stub in a system, or null when none or more than
 * one remain. Atlas does not guess which hole is the other door.
 */
export function uniqueCounterpartStub<
  T extends {
    readonly _id: string;
    readonly toSystemId: number | null;
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
  surviving: DoorKnowledgeFields,
  stub: DoorKnowledgeFields,
  attachedSide: ConnectionDoor,
): DoorKnowledgePatch {
  const patch: DoorKnowledgePatch = {
    ...returnDoorTypePatch(
      surviving,
      attachedSide,
      connectionDoorTypes(stub).from,
    ),
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
  if (
    surviving.lifeStage == null
    && surviving.lifeStageObservedAt == null
    && (stub.lifeStage != null || stub.lifeStageObservedAt != null)
  ) {
    patch.lifeStage = stub.lifeStage ?? null;
    if (stub.lifeStageObservedAt !== undefined) {
      patch.lifeStageObservedAt = stub.lifeStageObservedAt;
    }
  }
  if (surviving.deathEarliestAt == null && stub.deathEarliestAt != null) {
    patch.deathEarliestAt = stub.deathEarliestAt;
    patch.deathLatestAt = stub.deathLatestAt;
  }
  const typeProvenance = winningTypeProvenance(
    surviving.typeProvenance,
    stub.typeProvenance,
  );
  if (typeProvenance !== undefined) {
    patch.typeProvenance = typeProvenance;
  }
  return patch;
}
