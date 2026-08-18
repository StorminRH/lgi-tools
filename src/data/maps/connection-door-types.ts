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
// on `to`. `typedSide` is only which end a legacy single code belongs to.
//
// Knowing a named mouth fills a blank other mouth as K162. Knowing only a
// K162 never invents the named type.
import {
  FAR_SIDE_WORMHOLE_CODE,
  isWormholeTypeCode,
} from '@/data/eve-data/wormhole-contract';

/** One stored end of a hallway row — not incoming/outgoing, not named/K162. */
export type ConnectionDoor = 'from' | 'to';

/** The two stored mouth types after legacy rows are normalized. */
export interface ConnectionDoorTypes {
  readonly from: string | null;
  readonly to: string | null;
}

/** Connection fields the mouth-type helpers can read. */
export interface ConnectionTypeFields {
  readonly fromWormholeTypeCode?: string | null;
  readonly toWormholeTypeCode?: string | null;
  readonly wormholeTypeCode?: string | null;
  readonly typedSide?: ConnectionDoor | null;
}

/** Named outgoing type — never K162, never unidentified. */
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
 * Types actually stored on each mouth. Legacy rows expose only the coded
 * end — the other stays blank. Layout and census use this so a one-code
 * row does not suddenly grow a K162 on the other mouth.
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
 * Mouth types for scanner display and type writes. Legacy named codes still
 * show K162 on the other mouth; a stored K162 does not invent a named type.
 */
export function connectionDoorTypes(row: ConnectionTypeFields): ConnectionDoorTypes {
  if (hasDoorFields(row)) {
    return storedDoorTypes(row);
  }
  return legacyDoorTypes(row.wormholeTypeCode ?? null, row.typedSide ?? 'from');
}

/**
 * Writes one mouth. A newly set named type fills a blank other mouth as K162.
 * Clearing a mouth, writing K162, or finding the other mouth already set
 * leaves the other mouth alone.
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
 * Attaches a scanned stub onto one mouth of a resolved hallway. If the other
 * mouth is already named, this mouth becomes K162. Otherwise the stub's type
 * is written here. An existing named type on this mouth is left alone.
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

/** One-code snapshot so jump census and older readers still see which end holds the code. */
export function legacyTypeSnapshot(
  doors: ConnectionDoorTypes,
  preferredSide?: ConnectionDoor,
): {
  readonly wormholeTypeCode: string | null;
  readonly typedSide: ConnectionDoor | undefined;
} {
  if (preferredSide !== undefined) {
    const preferred = preferredSide === 'from' ? doors.from : doors.to;
    if (isEntranceType(preferred)) {
      return { wormholeTypeCode: preferred, typedSide: preferredSide };
    }
  }
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

/** Patch that writes both mouths and keeps the one-code snapshot in sync. */
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
    ...legacyTypeSnapshot(doors, side),
  };
}

/** Patch used when a stub is linked onto a resolved hallway. */
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
    ...legacyTypeSnapshot(doors, attachedSide),
  };
}
