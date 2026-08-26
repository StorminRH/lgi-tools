import { ConvexError, v } from 'convex/values';
import { isTombstoned } from '@/data/maps/chain-contract';
import { connectionTypePatch, typedDoorsFrom } from '@/data/maps/connection-door-types';
import {
  blankHallway,
  identityFromDoors,
  leadsToEquals,
  leadsToFromHint,
} from '@/data/maps/connection-hallway';
import type { WormholeDestinationHint } from '@/data/eve-data/wormhole-contract';
import type { Doc } from './_generated/dataModel';
import { internalMutation, type MutationCtx } from './_generated/server';
import {
  findConnectionForSignature,
  FIXTURE_CONNECTION_SCAN_LIMIT,
  readOriginConnections,
} from './lib/mapConnectionLookup';
import {
  destinationHintValidator,
  shipSizeValidator,
  validateUnresolvedHoleInput,
  wormholeTypeCodeValidator,
} from './lib/mapEntityContracts';
import { findSystem } from './lib/mapSystemLookup';

interface UnresolvedHoleFixtureArgs {
  readonly mapId: string;
  readonly fromSystemId: number;
  readonly fromSignatureId: string;
  readonly wormholeTypeCode?: string | null;
  readonly shipSize?: Doc<'mapConnections'>['shipSize'];
  readonly fromDestinationHint?: WormholeDestinationHint;
}

interface NormalizedUnresolvedHole extends UnresolvedHoleFixtureArgs {
  readonly fromSignatureId: string;
  readonly wormholeTypeCode: string | null;
  readonly shipSize: Doc<'mapConnections'>['shipSize'];
}

function normalizeUnresolvedHole(args: UnresolvedHoleFixtureArgs): NormalizedUnresolvedHole {
  const normalized = {
    ...args,
    fromSignatureId: args.fromSignatureId.trim(),
    wormholeTypeCode: args.wormholeTypeCode ?? null,
    shipSize: args.shipSize ?? null,
  };
  validateUnresolvedHoleInput({
    fromSystemId: normalized.fromSystemId,
    toSystemId: null,
    fromSignatureId: normalized.fromSignatureId,
    wormholeTypeCode: normalized.wormholeTypeCode,
    shipSize: normalized.shipSize,
    fromDestinationHint: normalized.fromDestinationHint,
  });
  return normalized;
}

async function requireUnresolvedHoleOrigin(
  ctx: MutationCtx,
  args: NormalizedUnresolvedHole,
): Promise<void> {
  const origin = await findSystem(ctx, args.mapId, args.fromSystemId);
  if (origin === null || isTombstoned(origin)) {
    throw new ConvexError({
      code: 'UNKNOWN_ENDPOINT',
      detail: `Origin system ${args.fromSystemId} is not live on map ${args.mapId}.`,
    });
  }
}

async function findUnresolvedHole(
  ctx: MutationCtx,
  args: NormalizedUnresolvedHole,
): Promise<Doc<'mapConnections'> | undefined> {
  const match = findConnectionForSignature(
    await readOriginConnections(ctx, args.mapId, args.fromSystemId, {
      limit: FIXTURE_CONNECTION_SCAN_LIMIT,
      errorCode: 'FIXTURE_MAP_TOO_LARGE',
      errorDetail: `Map ${args.mapId} exceeds the ${FIXTURE_CONNECTION_SCAN_LIMIT}-connection unresolved-hole bound.`,
    }),
    args.fromSignatureId,
  );
  return match?.toSystemId === null ? match : undefined;
}

function unresolvedHoleTypePatch(
  existing: Doc<'mapConnections'>,
  input: UnresolvedHoleFixtureArgs,
  normalized: NormalizedUnresolvedHole,
): Partial<Doc<'mapConnections'>> {
  if (input.wormholeTypeCode === undefined) return {};
  const typePatch = connectionTypePatch(
    existing,
    'from',
    normalized.wormholeTypeCode,
    normalized.wormholeTypeCode === null ? null : 'human',
  );
  if (
    existing.from.typeCode === typePatch.from.typeCode
    && existing.to.typeCode === typePatch.to.typeCode
  ) {
    return {};
  }
  return typePatch;
}

function unresolvedHoleSizePatch(
  existing: Doc<'mapConnections'>,
  input: UnresolvedHoleFixtureArgs,
  normalized: NormalizedUnresolvedHole,
): Partial<Doc<'mapConnections'>> {
  if (input.shipSize === undefined || existing.shipSize === normalized.shipSize) return {};
  return { shipSize: normalized.shipSize };
}

function unresolvedHoleHintPatch(
  existing: Doc<'mapConnections'>,
  input: UnresolvedHoleFixtureArgs,
  normalized: NormalizedUnresolvedHole,
): Partial<Doc<'mapConnections'>> {
  if (input.fromDestinationHint === undefined) return {};
  const leadsTo = leadsToFromHint(normalized.fromDestinationHint);
  if (leadsToEquals(existing.from.leadsTo, leadsTo)) return {};
  return { from: { ...existing.from, leadsTo } };
}

function unresolvedHolePatch(
  existing: Doc<'mapConnections'>,
  input: UnresolvedHoleFixtureArgs,
  normalized: NormalizedUnresolvedHole,
): Partial<Doc<'mapConnections'>> {
  const typePatch = unresolvedHoleTypePatch(existing, input, normalized);
  const sizePatch = unresolvedHoleSizePatch(existing, input, normalized);
  const hintPatch = unresolvedHoleHintPatch(existing, input, normalized);
  const from = hintPatch.from !== undefined
    ? { ...(typePatch.from ?? existing.from), leadsTo: hintPatch.from.leadsTo }
    : typePatch.from;
  return {
    ...typePatch,
    ...sizePatch,
    ...(from === undefined ? {} : { from }),
  };
}

async function insertUnresolvedHole(
  ctx: MutationCtx,
  args: NormalizedUnresolvedHole,
) {
  const doors = typedDoorsFrom('from', args.wormholeTypeCode);
  return await ctx.db.insert('mapConnections', {
    ...blankHallway({
      mapId: args.mapId,
      fromSystemId: args.fromSystemId,
      toSystemId: null,
    }),
    from: {
      ...doors.from,
      signatureId: args.fromSignatureId,
      leadsTo: leadsToFromHint(args.fromDestinationHint),
    },
    to: doors.to,
    identity: identityFromDoors(
      doors.from.typeCode,
      doors.to.typeCode,
      args.wormholeTypeCode === null ? null : 'human',
    ),
    shipSize: args.shipSize,
  });
}

export const upsertUnresolvedHole = internalMutation({
  args: {
    mapId: v.string(),
    fromSystemId: v.number(),
    fromSignatureId: v.string(),
    wormholeTypeCode: v.optional(wormholeTypeCodeValidator),
    shipSize: v.optional(shipSizeValidator),
    fromDestinationHint: v.optional(destinationHintValidator),
  },
  handler: async (ctx, input) => {
    const args = normalizeUnresolvedHole(input);
    await requireUnresolvedHoleOrigin(ctx, args);
    const existing = await findUnresolvedHole(ctx, args);
    if (existing === undefined) {
      const connectionId = await insertUnresolvedHole(ctx, args);
      return { outcome: 'inserted' as const, connectionId };
    }
    if (isTombstoned(existing)) {
      return { outcome: 'tombstoned' as const, connectionId: existing._id };
    }
    const patch = unresolvedHolePatch(existing, input, args);
    if (Object.keys(patch).length === 0) {
      return { outcome: 'unchanged' as const, connectionId: existing._id };
    }
    await ctx.db.patch(existing._id, patch);
    return { outcome: 'updated' as const, connectionId: existing._id };
  },
});
