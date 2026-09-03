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
