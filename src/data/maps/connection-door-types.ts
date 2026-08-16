// Entrance/exit type algebra for one map connection. The hallway (mass,
// lifetime, size) is shared. Each door has its own type. An entrance is a
// named code; an exit is always K162. Knowing the entrance fills a blank
// exit. Knowing only a K162 never invents the entrance.
import {
  FAR_SIDE_WORMHOLE_CODE,
  isWormholeTypeCode,
} from '@/data/eve-data/wormhole-contract';

/** One end of a connection line — not entrance/exit. */
export type ConnectionDoor = 'from' | 'to';

/** The two stored door types after legacy rows are normalized. */
export interface ConnectionDoorTypes {
  readonly from: string | null;
  readonly to: string | null;
}

/** Connection fields the door-type helpers can read. */
export interface ConnectionTypeFields {
  readonly fromWormholeTypeCode?: string | null;
  readonly toWormholeTypeCode?: string | null;
  readonly wormholeTypeCode?: string | null;
  readonly typedSide?: ConnectionDoor | null;
}

/** Named entrance — never K162, never blank. */
export function isEntranceType(code: string | null | undefined): boolean {
  return code != null && code !== FAR_SIDE_WORMHOLE_CODE && isWormholeTypeCode(code);
}

function hasDoorFields(row: ConnectionTypeFields): boolean {
  return typeof row.fromWormholeTypeCode === 'string'
    || typeof row.toWormholeTypeCode === 'string';
}

function legacyDoorTypes(
  code: string | null,
  side: ConnectionDoor,
): ConnectionDoorTypes {
  if (code === null) return { from: null, to: null };
  if (isEntranceType(code)) {
    return side === 'from'
      ? { from: code, to: FAR_SIDE_WORMHOLE_CODE }
      : { from: FAR_SIDE_WORMHOLE_CODE, to: code };
  }
  return side === 'from' ? { from: code, to: null } : { from: null, to: code };
}

/**
 * Types actually stored on each door. Legacy rows expose only the typed
 * door — the other stays blank. Layout and census use this so a one-code
 * row does not suddenly grow a K162 on the opposite end.
 */
export function storedDoorTypes(row: ConnectionTypeFields): ConnectionDoorTypes {
  if (hasDoorFields(row)) {
    return {
      from: row.fromWormholeTypeCode ?? null,
      to: row.toWormholeTypeCode ?? null,
    };
  }
  const code = row.wormholeTypeCode ?? null;
  const side = row.typedSide ?? 'from';
  if (code === null) return { from: null, to: null };
  return side === 'from' ? { from: code, to: null } : { from: null, to: code };
}

/**
 * Door types for scanner display and type writes. Legacy named codes still
 * show K162 on the other door; a stored K162 does not invent a second exit.
 */
export function connectionDoorTypes(row: ConnectionTypeFields): ConnectionDoorTypes {
  if (hasDoorFields(row)) {
    return storedDoorTypes(row);
  }
  return legacyDoorTypes(row.wormholeTypeCode ?? null, row.typedSide ?? 'from');
}

/**
 * Writes one door. A newly set entrance fills a blank opposite door as K162.
 * Clearing a door, writing K162, or finding the other door already set leaves
 * the opposite door alone.
 */
export function applyDoorType(
  current: ConnectionDoorTypes,
  side: ConnectionDoor,
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
 * Attaches a scanned stub onto one door of a resolved hole. If the other door
 * is already an entrance, this door becomes K162. Otherwise the stub's type
 * is written on this door. An existing entrance on this door is left alone.
 */
export function applyReturnDoorType(
  current: ConnectionDoorTypes,
  attachedSide: ConnectionDoor,
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

/** One-code snapshot so jump census and older readers still see a typed side. */
export function legacyTypeSnapshot(doors: ConnectionDoorTypes): {
  readonly wormholeTypeCode: string | null;
  readonly typedSide: ConnectionDoor | undefined;
} {
  if (isEntranceType(doors.from)) {
    return { wormholeTypeCode: doors.from, typedSide: 'from' };
  }
  if (isEntranceType(doors.to)) {
    return { wormholeTypeCode: doors.to, typedSide: 'to' };
  }
  if (doors.from !== null) return { wormholeTypeCode: doors.from, typedSide: 'from' };
  if (doors.to !== null) return { wormholeTypeCode: doors.to, typedSide: 'to' };
  return { wormholeTypeCode: null, typedSide: undefined };
}

/** Patch that writes both doors and keeps the one-code snapshot in sync. */
export function connectionTypePatch(
  row: ConnectionTypeFields,
  side: ConnectionDoor,
  value: string | null,
): {
  readonly fromWormholeTypeCode: string | null;
  readonly toWormholeTypeCode: string | null;
  readonly wormholeTypeCode: string | null;
  readonly typedSide: ConnectionDoor | undefined;
} {
  const doors = applyDoorType(connectionDoorTypes(row), side, value);
  return {
    fromWormholeTypeCode: doors.from,
    toWormholeTypeCode: doors.to,
    ...legacyTypeSnapshot(doors),
  };
}

/** Patch used when a stub is linked onto a resolved hole. */
export function returnDoorTypePatch(
  row: ConnectionTypeFields,
  attachedSide: ConnectionDoor,
  stubType: string | null,
): {
  readonly fromWormholeTypeCode: string | null;
  readonly toWormholeTypeCode: string | null;
  readonly wormholeTypeCode: string | null;
  readonly typedSide: ConnectionDoor | undefined;
} {
  const doors = applyReturnDoorType(connectionDoorTypes(row), attachedSide, stubType);
  return {
    fromWormholeTypeCode: doors.from,
    toWormholeTypeCode: doors.to,
    ...legacyTypeSnapshot(doors),
  };
}
