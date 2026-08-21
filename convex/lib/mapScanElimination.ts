import { ConvexError } from 'convex/values';
import { isTombstoned } from '@/data/maps/chain-contract';
import {
  absorbDoorKnowledge,
  uniqueCounterpartStub,
} from '@/data/maps/connection-door-destinations';
import { connectionTypePatch, storedDoorTypes } from '@/data/maps/connection-door-types';
import { isWormholeTypeCode } from '@/data/eve-data/wormhole-contract';
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
    readonly typeProvenance: NonNullable<Doc<'mapConnections'>['typeProvenance']> | null;
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
  return storedDoorTypes(connection)[side];
}

function endpointOwnsSignature(
  connection: Doc<'mapConnections'>,
  side: 'from' | 'to',
): boolean {
  return side === 'from'
    ? connection.fromSignatureId !== undefined
    : connection.toSignatureId !== undefined;
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
    const signatureId = connection.fromSignatureId;
    return connection.toSystemId !== null || signatureId === undefined
      ? []
      : [{
          signatureId,
          wormholeTypeCode: storedDoorTypes(connection).from,
          typeProvenance: connection.typeProvenance ?? null,
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
    source.wormholeTypeCode === typeCode
    && source.typeProvenance === 'assumed'
    && source.typedSide === 'from'
  ) {
    return { signatureId, outcome: 'unchanged', observationKey };
  }
  if (
    source.wormholeTypeCode !== null
    && source.typeProvenance !== 'assumed'
  ) {
    return { signatureId, outcome: 'protected', observationKey };
  }
  const stamped = stampObservationKey(source.observationKey);
  await ctx.db.patch(source._id, {
    ...connectionTypePatch(source, 'from', typeCode),
    typeProvenance: 'assumed',
    ...stamped.patch,
  });
  return { signatureId, outcome: 'applied', observationKey: stamped.observationKey };
}

function occupiedDestinationNote(
  target: Doc<'mapConnections'>,
  side: 'from' | 'to',
): {
  readonly fromDestinationSystemId?: number;
  readonly fromDestinationHint?: Doc<'mapConnections'>['fromDestinationHint'];
} {
  const systemId = side === 'from'
    ? target.fromDestinationSystemId
    : target.toDestinationSystemId;
  const hint = side === 'from'
    ? target.fromDestinationHint
    : target.toDestinationHint;
  return {
    ...(systemId !== undefined ? { fromDestinationSystemId: systemId } : {}),
    ...(hint !== undefined ? { fromDestinationHint: hint } : {}),
  };
}

function clearOccupiedDestinationNote(side: 'from' | 'to'): {
  readonly fromDestinationSystemId?: undefined;
  readonly toDestinationSystemId?: undefined;
  readonly fromDestinationHint?: undefined;
  readonly toDestinationHint?: undefined;
} {
  return side === 'from'
    ? { fromDestinationSystemId: undefined, fromDestinationHint: undefined }
    : { toDestinationSystemId: undefined, toDestinationHint: undefined };
}

async function recreateOccupiedDoorAsStub(
  ctx: MutationCtx,
  target: Doc<'mapConnections'>,
  systemId: number,
  occupant: string,
  side: 'from' | 'to',
): Promise<void> {
  const doorType = storedDoorTypes(target)[side];
  await ctx.db.insert('mapConnections', {
    mapId: target.mapId,
    fromSystemId: systemId,
    toSystemId: null,
    fromSignatureId: occupant,
    massState: null,
    shipSize: null,
    eolAt: null,
    deletedAt: null,
    purgeAfter: null,
    ...connectionTypePatch({}, 'from', doorType),
    typeProvenance: doorType === null ? undefined : target.typeProvenance,
    ...occupiedDestinationNote(target, side),
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
  if ((source.wormholeTypeCode ?? null) !== expectedTypeCode) {
    return { signatureId, outcome: 'stale', observationKey };
  }
  const side = endpointSide(target, systemId);
  if (side === null) return { signatureId, outcome: 'stale', observationKey };
  const current = side === 'from' ? target.fromSignatureId : target.toSignatureId;
  if (current === signatureId) {
    return { signatureId, outcome: 'unchanged', observationKey };
  }
  let surviving = target;
  if (current !== undefined) {
    if (!replaceOccupied) {
      return { signatureId, outcome: 'protected', observationKey };
    }
    await recreateOccupiedDoorAsStub(ctx, target, systemId, current, side);
    surviving = {
      ...target,
      ...connectionTypePatch(target, side, null),
      ...clearOccupiedDestinationNote(side),
    };
  }
  const knowledge = linkKnowledgePatch(source, surviving, side);
  const attached = {
    ...(side === 'from'
      ? { fromSignatureId: signatureId }
      : { toSignatureId: signatureId }),
    ...(current !== undefined ? clearOccupiedDestinationNote(side) : {}),
    ...knowledge,
  };
  const leftover = await leftoverOriginStubAbsorb(
    ctx,
    { ...surviving, ...attached },
    source._id,
    side,
  );
  await ctx.db.patch(
    target._id,
    leftover === null ? attached : { ...attached, ...leftover.patch },
  );
  if (leftover !== null) await ctx.db.delete(leftover.id);
  await ctx.db.delete(source._id);
  return { signatureId, outcome: 'applied', observationKey };
}

async function leftoverOriginStubAbsorb(
  ctx: MutationCtx,
  target: Doc<'mapConnections'>,
  sourceId: Id<'mapConnections'>,
  attachedSide: 'from' | 'to',
): Promise<{
  patch: Partial<Doc<'mapConnections'>>;
  id: Id<'mapConnections'>;
} | null> {
  const oppositeSide = attachedSide === 'from' ? 'to' : 'from';
  const oppositeSystemId = oppositeSide === 'from'
    ? target.fromSystemId
    : target.toSystemId;
  const oppositeSignature = oppositeSide === 'from'
    ? target.fromSignatureId
    : target.toSignatureId;
  if (oppositeSystemId === null || oppositeSignature !== undefined) return null;
  const leftover = uniqueCounterpartStub(
    await readOriginConnections(ctx, target.mapId, oppositeSystemId),
    new Set([sourceId, target._id]),
  );
  if (leftover === null) return null;
  return {
    id: leftover._id,
    patch: {
      ...(oppositeSide === 'from'
        ? {
            fromSignatureId: leftover.fromSignatureId,
            fromSignalPct: leftover.fromSignalPct,
            firstSeenAt: leftover.firstSeenAt ?? target.firstSeenAt,
          }
        : { toSignatureId: leftover.fromSignatureId }),
      ...absorbDoorKnowledge(target, leftover, oppositeSide),
      ...leadsNotePatch(target, leftover.fromDestinationSystemId, oppositeSide),
    },
  };
}

function linkKnowledgePatch(
  source: Doc<'mapConnections'>,
  target: Doc<'mapConnections'>,
  attachedSide: 'from' | 'to',
): Partial<Doc<'mapConnections'>> {
  return {
    ...absorbDoorKnowledge(target, source, attachedSide),
    ...leadsNotePatch(target, source.fromDestinationSystemId, attachedSide),
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
      const signatureId = connection.fromSignatureId;
      return signatureId === undefined ? [] : [[signatureId, connection] as const];
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
