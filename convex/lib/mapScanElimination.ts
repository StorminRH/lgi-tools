import { ConvexError } from 'convex/values';
import { isTombstoned } from '@/data/maps/chain-contract';
import {
  absorbDoorKnowledge,
  uniqueCounterpartStub,
} from '@/data/maps/connection-door-destinations';
import {
  connectionTypePatch,
  typedDoorsFrom,
} from '@/data/maps/connection-door-types';
import {
  blankHallway,
  doorSystemNote,
  hallwayDoor,
  hallwayDoorTypes,
  identityFromDoors,
  replaceDoor,
} from '@/data/maps/connection-hallway';
import {
  isWormholeTypeCode,
  type ConnectionProvenance,
} from '@/data/eve-data/wormhole-contract';
import { isScannerSignatureId } from '@/data/maps/scan-parse';
import type { Doc, Id } from '../_generated/dataModel';
import type { MutationCtx, QueryCtx } from '../_generated/server';
import {
  readInboundConnections,
  readOriginConnections,
} from './mapConnectionLookup';
import { stampObservationKey } from './observationKey';
import { findSystem, requireSystemId } from './mapSystemLookup';
import {
  MAP_ELIMINATION_CONNECTION_LIMIT,
  MAP_SCAN_ROW_LIMIT,
  endpointSide,
  leadsNotePatch,
} from './mapScanState';

export type EliminationOutcome = {
  readonly signatureId: string;
  readonly outcome: 'applied' | 'unchanged' | 'protected' | 'stale';
  readonly observationKey: string | null;
};

export type EliminationEvidence = {
  readonly canEdit: true;
  readonly signatures: {
    readonly signatureId: string;
    readonly wormholeTypeCode: string | null;
    readonly typeProvenance: ConnectionProvenance | null;
    readonly observationKey: string | null;
  }[];
  readonly connections: {
    readonly connectionId: Id<'mapConnections'>;
    readonly wormholeTypeCode: string | null;
    readonly linkedSignature: boolean;
  }[];
};

function endpointTypeCode(
  connection: Doc<'mapConnections'>,
  side: 'from' | 'to',
): string | null {
  return hallwayDoorTypes(connection)[side];
}

function endpointOwnsSignature(
  connection: Doc<'mapConnections'>,
  side: 'from' | 'to',
): boolean {
  return hallwayDoor(connection, side).signatureId !== null;
}

async function readEliminationConnections(
  ctx: QueryCtx,
  mapId: string,
  systemId: number,
): Promise<{
  readonly from: Doc<'mapConnections'>[];
  readonly touching: Doc<'mapConnections'>[];
}> {
  const [from, to] = await Promise.all([
    readOriginConnections(ctx, mapId, systemId),
    readInboundConnections(ctx, mapId, systemId, {
      limit: MAP_ELIMINATION_CONNECTION_LIMIT,
      errorCode: 'MAP_ELIMINATION_SCAN_LIMIT',
      errorDetail: `Map ${mapId} exceeds the elimination destination read bound.`,
    }),
  ]);
  const touching = new Map(
    [...from, ...to].map((connection) => [connection._id, connection]),
  );
  return { from, touching: [...touching.values()] };
}

export async function collectEliminationEvidence(
  ctx: QueryCtx,
  mapId: string,
  systemId: number,
): Promise<EliminationEvidence> {
  requireSystemId(systemId);
  const system = await findSystem(ctx, mapId, systemId);
  if (system === null || isTombstoned(system)) {
    return { canEdit: true, signatures: [], connections: [] };
  }

  const rows = await readEliminationConnections(ctx, mapId, systemId);
  const liveFrom = rows.from.filter((connection) => !isTombstoned(connection));
  const signatures = liveFrom.flatMap((connection) => {
    const signatureId = connection.from.signatureId;
    return connection.toSystemId !== null || signatureId === null
      ? []
      : [{
          signatureId,
          wormholeTypeCode: hallwayDoorTypes(connection).from,
          typeProvenance:
            connection.identity.kind === 'typed'
              ? connection.identity.provenance
              : null,
          observationKey: connection.observationKey ?? null,
        }];
  });
  const connections = rows.touching
    .filter(
      (connection) => connection.toSystemId !== null && !isTombstoned(connection),
    )
    .flatMap((connection) => {
      const side = endpointSide(connection, systemId);
      return side === null
        ? []
        : [{
            connectionId: connection._id,
            wormholeTypeCode: endpointTypeCode(connection, side),
            linkedSignature: endpointOwnsSignature(connection, side),
          }];
    });
  return { canEdit: true, signatures, connections };
}

function requireEliminationDeductions(
  deductions: readonly {
    readonly signatureId: string;
    readonly typeCode?: string;
    readonly connectionId?: string;
  }[],
): void {
  if (deductions.length === 0 || deductions.length > MAP_SCAN_ROW_LIMIT) {
    throw new ConvexError({ code: 'INVALID_ELIMINATION_SIZE' });
  }
  const signatureIds = new Set<string>();
  for (const deduction of deductions) {
    if (
      !isScannerSignatureId(deduction.signatureId)
      || signatureIds.has(deduction.signatureId)
      || (
        deduction.typeCode !== undefined
        && !isWormholeTypeCode(deduction.typeCode)
      )
    ) {
      throw new ConvexError({ code: 'INVALID_ELIMINATION_DEDUCTION' });
    }
    signatureIds.add(deduction.signatureId);
  }
}

async function applyTypeDeduction(
  ctx: MutationCtx,
  source: Doc<'mapConnections'> | undefined,
  signatureId: string,
  typeCode: string,
): Promise<EliminationOutcome> {
  if (source === undefined || source.toSystemId !== null || isTombstoned(source)) {
    return { signatureId, outcome: 'stale', observationKey: null };
  }
  const observationKey = source.observationKey ?? null;
  if (
    source.from.typeCode === typeCode
    && source.identity.kind === 'typed'
    && source.identity.provenance === 'assumed'
  ) {
    return { signatureId, outcome: 'unchanged', observationKey };
  }
  if (
    source.from.typeCode !== null
    && (source.identity.kind !== 'typed' || source.identity.provenance !== 'assumed')
  ) {
    return { signatureId, outcome: 'protected', observationKey };
  }
  const stamped = stampObservationKey(source.observationKey);
  await ctx.db.patch(source._id, {
    ...connectionTypePatch(source, 'from', typeCode, 'assumed'),
    ...stamped.patch,
  });
  return { signatureId, outcome: 'applied', observationKey: stamped.observationKey };
}

function occupiedLeadsTo(target: Doc<'mapConnections'>, side: 'from' | 'to') {
  return hallwayDoor(target, side).leadsTo;
}

function clearOccupiedDestinationNote(
  target: Doc<'mapConnections'>,
  side: 'from' | 'to',
): Partial<Doc<'mapConnections'>> {
  const door = hallwayDoor(target, side);
  return replaceDoor(target, side, { ...door, leadsTo: { kind: 'unset' } });
}

function vacateOccupiedDoor(
  target: Doc<'mapConnections'>,
  side: 'from' | 'to',
): Doc<'mapConnections'> {
  const afterType = {
    ...target,
    ...connectionTypePatch(target, side, null, null),
  };
  return {
    ...afterType,
    ...clearOccupiedDestinationNote(afterType, side),
  };
}

async function recreateOccupiedDoorAsStub(
  ctx: MutationCtx,
  target: Doc<'mapConnections'>,
  systemId: number,
  occupant: string,
  side: 'from' | 'to',
): Promise<void> {
  const doorType = hallwayDoorTypes(target)[side];
  const doors = typedDoorsFrom('from', doorType);
  const provenance = target.identity.kind === 'typed' ? target.identity.provenance : null;
  await ctx.db.insert('mapConnections', {
    ...blankHallway({ mapId: target.mapId, fromSystemId: systemId, toSystemId: null }),
    from: {
      ...doors.from,
      signatureId: occupant,
      leadsTo: occupiedLeadsTo(target, side),
    },
    to: doors.to,
    identity: identityFromDoors(doors.from.typeCode, doors.to.typeCode, provenance),
  });
}

export async function applyLinkDeduction(
  ctx: MutationCtx,
  source: Doc<'mapConnections'> | undefined,
  target: Doc<'mapConnections'> | undefined,
  systemId: number,
  signatureId: string,
  expectedTypeCode: string | null,
  replaceOccupied = false,
): Promise<EliminationOutcome> {
  if (
    source === undefined
    || source.toSystemId !== null
    || isTombstoned(source)
    || target === undefined
    || target.toSystemId === null
    || isTombstoned(target)
  ) {
    return { signatureId, outcome: 'stale', observationKey: null };
  }
  const observationKey = source.observationKey ?? null;
  if (source.from.typeCode !== expectedTypeCode) {
    return { signatureId, outcome: 'stale', observationKey };
  }
  const side = endpointSide(target, systemId);
  if (side === null) return { signatureId, outcome: 'stale', observationKey };
  const current = hallwayDoor(target, side).signatureId;
  if (current === signatureId) {
    return { signatureId, outcome: 'unchanged', observationKey };
  }
  let surviving = target;
  if (current !== null) {
    if (!replaceOccupied) {
      return { signatureId, outcome: 'protected', observationKey };
    }
    await recreateOccupiedDoorAsStub(ctx, target, systemId, current, side);
    surviving = vacateOccupiedDoor(target, side);
  }
  let next = applyLinkKnowledge(surviving, source, side);
  next = applyDoorSignature(next, side, signatureId);
  const leftover = await findLeftoverOriginStub(ctx, next, source._id, side);
  if (leftover !== null) {
    next = absorbLeftoverOriginStub(next, leftover.row, side);
  }
  const { _id: _targetId, _creationTime: _createdAt, ...fields } = next;
  await ctx.db.patch(target._id, fields);
  if (leftover !== null) await ctx.db.delete(leftover.id);
  await ctx.db.delete(source._id);
  return { signatureId, outcome: 'applied', observationKey };
}

function applyLinkKnowledge(
  surviving: Doc<'mapConnections'>,
  stub: Doc<'mapConnections'>,
  side: 'from' | 'to',
): Doc<'mapConnections'> {
  const afterTypes = { ...surviving, ...absorbDoorKnowledge(surviving, stub, side) };
  return {
    ...afterTypes,
    ...leadsNotePatch(afterTypes, doorSystemNote(stub.from), side),
  };
}

function applyDoorSignature(
  hallway: Doc<'mapConnections'>,
  side: 'from' | 'to',
  signatureId: string,
): Doc<'mapConnections'> {
  const door = hallwayDoor(hallway, side);
  return {
    ...hallway,
    ...replaceDoor(hallway, side, { ...door, signatureId }),
  };
}

function earliestFirstSeenAt(
  hallway: number | undefined,
  leftover: number | undefined,
): number | undefined {
  if (hallway === undefined) return leftover;
  if (leftover === undefined) return hallway;
  return Math.min(hallway, leftover);
}

async function findLeftoverOriginStub(
  ctx: MutationCtx,
  target: Doc<'mapConnections'>,
  sourceId: Id<'mapConnections'>,
  attachedSide: 'from' | 'to',
): Promise<{ row: Doc<'mapConnections'>; id: Id<'mapConnections'> } | null> {
  const oppositeSide = attachedSide === 'from' ? 'to' : 'from';
  const oppositeSystemId = oppositeSide === 'from'
    ? target.fromSystemId
    : target.toSystemId;
  if (oppositeSystemId === null || hallwayDoor(target, oppositeSide).signatureId !== null) {
    return null;
  }
  const leftover = uniqueCounterpartStub(
    await readOriginConnections(ctx, target.mapId, oppositeSystemId),
    new Set([sourceId, target._id]),
  );
  return leftover === null ? null : { row: leftover, id: leftover._id };
}

function absorbLeftoverOriginStub(
  target: Doc<'mapConnections'>,
  leftover: Doc<'mapConnections'>,
  attachedSide: 'from' | 'to',
): Doc<'mapConnections'> {
  const oppositeSide = attachedSide === 'from' ? 'to' : 'from';
  const afterKnowledge = applyLinkKnowledge(target, leftover, oppositeSide);
  const door = hallwayDoor(afterKnowledge, oppositeSide);
  const firstSeenAt = earliestFirstSeenAt(
    afterKnowledge.firstSeenAt,
    leftover.firstSeenAt,
  );
  return {
    ...afterKnowledge,
    ...replaceDoor(afterKnowledge, oppositeSide, {
      ...door,
      signatureId: leftover.from.signatureId,
      signalPct: oppositeSide === 'from' ? leftover.from.signalPct : door.signalPct,
    }),
    ...(firstSeenAt === undefined ? {} : { firstSeenAt }),
  };
}

export type EliminationDeduction =
  | {
      readonly signatureId: string;
      readonly typeCode: string;
      readonly provenance: 'assumed';
    }
  | {
      readonly signatureId: string;
      readonly connectionId: Id<'mapConnections'>;
      readonly provenance: 'assumed';
      readonly expectedTypeCode: string | null;
    };

export async function applyEliminationDeductionBatch(
  ctx: MutationCtx,
  mapId: string,
  systemId: number,
  deductions: readonly EliminationDeduction[],
): Promise<EliminationOutcome[]> {
  requireSystemId(systemId);
  requireEliminationDeductions(deductions);
  const system = await findSystem(ctx, mapId, systemId);
  if (system === null || isTombstoned(system)) {
    return deductions.map(({ signatureId }) => ({
      signatureId,
      outcome: 'stale' as const,
      observationKey: null,
    }));
  }
  const rows = await readEliminationConnections(ctx, mapId, systemId);
  const bySignature = new Map(
    rows.from.flatMap((connection) => {
      const signatureId = connection.from.signatureId;
      return signatureId === null ? [] : [[signatureId, connection] as const];
    }),
  );
  const byId = new Map(rows.touching.map((connection) => [connection._id, connection]));

  const outcomes: EliminationOutcome[] = [];
  for (const deduction of deductions) {
    const source = bySignature.get(deduction.signatureId);
    outcomes.push(
      'typeCode' in deduction
        ? await applyTypeDeduction(
            ctx,
            source,
            deduction.signatureId,
            deduction.typeCode,
          )
        : await applyLinkDeduction(
            ctx,
            source,
            byId.get(deduction.connectionId),
            systemId,
            deduction.signatureId,
            deduction.expectedTypeCode,
          ),
    );
  }
  return outcomes;
}
