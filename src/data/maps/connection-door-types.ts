// Atlas wormhole language (canonical). Stored field names stay `from`/`to`.
//
// You are in a system. That system has wormholes. Talk about the system (and
// its class when it matters), the holes in it, and whether each hole is
// outgoing or incoming. Do not call systems "origin" or "far side."
//
// Outgoing: this system's mouth is a named type (P060, C247, B274, …).
// Statics are always outgoing. Jump the P060; the other system is whatever
// that named hole leads to (a C1, for example).
// Incoming: this system's mouth is a K162. The other system's mouth is the
// named hole. More often than not the K162s you scan are incoming.
// Unidentified: no type yet (`null`). That is not a K162.
//
// One map row is one hallway (shared mass, size, lifetime) with a mouth at
// each system. `from`/`to` are the two stored ends of that row — usually
// `from` is the system where the hole was first scanned — not incoming vs
// outgoing and not named vs K162. A K162 can sit on `from`; a P060 can sit
// on `to`.
//
// Knowing a named mouth fills a blank other mouth as K162. Knowing only a
// K162 never invents the named type.
import type { ConnectionProvenance } from '@/data/eve-data/wormhole-contract';
import {
  FAR_SIDE_WORMHOLE_CODE,
  isWormholeTypeCode,
} from '@/data/eve-data/wormhole-contract';
import type {
  ConnectionDoorSide,
  ConnectionDoorValue,
  ConnectionIdentity,
} from '@/data/maps/connection-hallway';
import { blankDoor, hallwayDoorTypes, identityFromDoors } from '@/data/maps/connection-hallway';

export type { ConnectionDoorSide as ConnectionDoor };

export interface ConnectionDoorTypes {
  readonly from: string | null;
  readonly to: string | null;
}

/** Named outgoing type — never K162, never unidentified. */
export function isEntranceType(code: string | null | undefined): boolean {
  return code != null && code !== FAR_SIDE_WORMHOLE_CODE && isWormholeTypeCode(code);
}

export function namedDoorType(doors: ConnectionDoorTypes): {
  readonly typeCode: string | null;
  readonly side: ConnectionDoorSide | null;
} {
  if (isEntranceType(doors.from)) return { typeCode: doors.from, side: 'from' };
  if (isEntranceType(doors.to)) return { typeCode: doors.to, side: 'to' };
  if (doors.from !== null) return { typeCode: doors.from, side: 'from' };
  if (doors.to !== null) return { typeCode: doors.to, side: 'to' };
  return { typeCode: null, side: null };
}

/**
 * Writes one mouth. A newly set named type fills a blank other mouth as K162.
 * Clearing a mouth, writing K162, or finding the other mouth already set
 * leaves the other mouth alone.
 */
export function applyDoorType(
  current: ConnectionDoorTypes,
  side: ConnectionDoorSide,
  value: string | null,
): ConnectionDoorTypes {
  const next: ConnectionDoorTypes = side === 'from'
    ? { from: value, to: current.to }
    : { from: current.from, to: value };
  const other = side === 'from' ? next.to : next.from;
  if (!isEntranceType(value) || other !== null) return next;
  return side === 'from'
    ? { from: value, to: FAR_SIDE_WORMHOLE_CODE }
    : { from: FAR_SIDE_WORMHOLE_CODE, to: value };
}

/**
 * Attaches a scanned stub onto one mouth of a resolved hallway. If the other
 * mouth is already named, this mouth becomes K162. Otherwise the stub's type
 * is written here. An existing named type on this mouth is left alone.
 */
export function applyReturnDoorType(
  current: ConnectionDoorTypes,
  attachedSide: ConnectionDoorSide,
  stubType: string | null,
): ConnectionDoorTypes {
  const other = attachedSide === 'from' ? current.to : current.from;
  if (isEntranceType(other)) {
    return applyDoorType(current, attachedSide, FAR_SIDE_WORMHOLE_CODE);
  }
  const attached = attachedSide === 'from' ? current.from : current.to;
  if (isEntranceType(attached) || stubType === null) return current;
  return applyDoorType(current, attachedSide, stubType);
}

function doorsWithTypes(
  hallway: { readonly from: ConnectionDoorValue; readonly to: ConnectionDoorValue },
  types: ConnectionDoorTypes,
): { readonly from: ConnectionDoorValue; readonly to: ConnectionDoorValue } {
  return {
    from: { ...hallway.from, typeCode: types.from },
    to: { ...hallway.to, typeCode: types.to },
  };
}

export function connectionTypePatch(
  hallway: {
    readonly from: ConnectionDoorValue;
    readonly to: ConnectionDoorValue;
    readonly identity: ConnectionIdentity;
  },
  side: ConnectionDoorSide,
  value: string | null,
  provenance: ConnectionProvenance | null,
): {
  readonly from: ConnectionDoorValue;
  readonly to: ConnectionDoorValue;
  readonly identity: ConnectionIdentity;
} {
  const doors = doorsWithTypes(hallway, applyDoorType(hallwayDoorTypes(hallway), side, value));
  return {
    ...doors,
    identity: identityFromDoors(doors.from.typeCode, doors.to.typeCode, provenance),
  };
}

/** Patch used when a stub is linked onto a resolved hallway. */
export function returnDoorTypePatch(
  hallway: {
    readonly from: ConnectionDoorValue;
    readonly to: ConnectionDoorValue;
    readonly identity: ConnectionIdentity;
  },
  attachedSide: ConnectionDoorSide,
  stubType: string | null,
  provenance: ConnectionProvenance | null,
): {
  readonly from: ConnectionDoorValue;
  readonly to: ConnectionDoorValue;
  readonly identity: ConnectionIdentity;
} {
  const doors = doorsWithTypes(
    hallway,
    applyReturnDoorType(hallwayDoorTypes(hallway), attachedSide, stubType),
  );
  return {
    ...doors,
    identity: identityFromDoors(
      doors.from.typeCode,
      doors.to.typeCode,
      provenance ?? (hallway.identity.kind === 'typed' ? hallway.identity.provenance : null),
    ),
  };
}

export function typedDoorsFrom(
  side: ConnectionDoorSide,
  value: string | null,
): { readonly from: ConnectionDoorValue; readonly to: ConnectionDoorValue } {
  const types = applyDoorType({ from: null, to: null }, side, value);
  return doorsWithTypes({ from: blankDoor(), to: blankDoor() }, types);
}
