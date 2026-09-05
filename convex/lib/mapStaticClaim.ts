import { isTombstoned } from '@/data/maps/chain-contract';
import { typedDoorsFrom } from '@/data/maps/connection-door-types';
import {
  blankHallway,
  hallwayDoor,
  identityFromDoors,
  isStaticPlaceholder,
  seatOrderOf,
  type ConnectionIdentity,
} from '@/data/maps/connection-hallway';
import type { Doc, Id } from '../_generated/dataModel';
import type { MutationCtx } from '../_generated/server';
import { readOriginConnections } from './mapConnectionLookup';
import { findSystem } from './mapSystemLookup';

export function mergeSeatFields(
  surviving: {
    readonly seatOrderAt?: number;
    readonly _creationTime: number;
    readonly staticCode?: string;
  },
  absorbed: {
    readonly seatOrderAt?: number;
    readonly _creationTime: number;
    readonly staticCode?: string;
  },
): { readonly seatOrderAt: number; readonly staticCode?: string } {
  const seatOrderAt = Math.min(seatOrderOf(surviving), seatOrderOf(absorbed));
  const staticCode = surviving.staticCode ?? absorbed.staticCode;
  return staticCode === undefined ? { seatOrderAt } : { seatOrderAt, staticCode };
}

export async function insertStaticPlaceholder(
  ctx: MutationCtx,
  args: {
    readonly mapId: string;
    readonly systemId: number;
    readonly code: string;
    readonly seatOrderAt: number;
  },
): Promise<Id<'mapConnections'>> {
  const doors = typedDoorsFrom('from', args.code);
  return await ctx.db.insert('mapConnections', {
    ...blankHallway({
      mapId: args.mapId,
      fromSystemId: args.systemId,
      toSystemId: null,
    }),
    from: doors.from,
    to: doors.to,
    identity: identityFromDoors(doors.from.typeCode, doors.to.typeCode, 'assumed'),
    staticCode: args.code,
    seatOrderAt: args.seatOrderAt,
  });
}

function claimSystemId(
  row: Doc<'mapConnections'>,
  side: 'from' | 'to',
): number | null {
  return side === 'from' ? row.fromSystemId : row.toSystemId;
}

function claimedIdentity(
  placeholder: Doc<'mapConnections'>,
  claimant: Doc<'mapConnections'>,
): ConnectionIdentity {
  if (claimant.identity.kind !== 'typed') return placeholder.identity;
  return { kind: 'typed', provenance: claimant.identity.provenance };
}

async function findLivePlaceholder(
  ctx: MutationCtx,
  mapId: string,
  systemId: number,
  staticCode: string,
  exceptId: Id<'mapConnections'>,
): Promise<Doc<'mapConnections'> | null> {
  const rows = await readOriginConnections(ctx, mapId, systemId);
  return rows.find((row) =>
    !isTombstoned(row)
    && row._id !== exceptId
    && row.staticCode === staticCode
    && isStaticPlaceholder(row),
  ) ?? null;
}

async function findLiveStaticCode(
  ctx: MutationCtx,
  mapId: string,
  systemId: number,
  staticCode: string,
): Promise<Doc<'mapConnections'> | null> {
  const rows = await readOriginConnections(ctx, mapId, systemId);
  return rows.find((row) =>
    !isTombstoned(row) && row.staticCode === staticCode,
  ) ?? null;
}

function sigClaimPatch(
  placeholder: Doc<'mapConnections'>,
  claimant: Doc<'mapConnections'>,
): Partial<Doc<'mapConnections'>> {
  const firstSeenAt = claimant.firstSeenAt ?? placeholder.firstSeenAt;
  return {
    from: {
      ...placeholder.from,
      signatureId: claimant.from.signatureId,
      signalPct: claimant.from.signalPct,
      leadsTo: claimant.from.leadsTo,
    },
    lifetime: claimant.lifetime,
    identity: claimedIdentity(placeholder, claimant),
    ...mergeSeatFields(placeholder, claimant),
    ...(firstSeenAt === undefined ? {} : { firstSeenAt }),
    ...(claimant.observationKey === undefined
      ? {}
      : { observationKey: claimant.observationKey }),
  };
}

async function mergeSigIntoPlaceholder(
  ctx: MutationCtx,
  placeholder: Doc<'mapConnections'>,
  claimant: Doc<'mapConnections'>,
): Promise<Id<'mapConnections'>> {
  await ctx.db.patch(placeholder._id, sigClaimPatch(placeholder, claimant));
  await ctx.db.delete(claimant._id);
  return placeholder._id;
}

async function mergePlaceholderIntoResolved(
  ctx: MutationCtx,
  placeholder: Doc<'mapConnections'>,
  claimant: Doc<'mapConnections'>,
): Promise<Id<'mapConnections'>> {
  await ctx.db.patch(claimant._id, mergeSeatFields(claimant, placeholder));
  await ctx.db.delete(placeholder._id);
  return claimant._id;
}

type ClaimRun =
  | { readonly outcome: 'none'; readonly survivorId: Id<'mapConnections'> }
  | { readonly outcome: 'claimed'; readonly survivorId: Id<'mapConnections'> };

async function runClaim(
  ctx: MutationCtx,
  row: Doc<'mapConnections'>,
  side: 'from' | 'to',
): Promise<ClaimRun> {
  if (side === 'to') {
    return { outcome: 'none', survivorId: row._id };
  }
  const claimant = await ctx.db.get(row._id);
  if (claimant === null || isTombstoned(claimant) || claimant.staticCode !== undefined) {
    return { outcome: 'none', survivorId: row._id };
  }
  const typeCode = hallwayDoor(claimant, side).typeCode;
  const systemId = claimSystemId(claimant, side);
  if (typeCode === null || systemId === null) {
    return { outcome: 'none', survivorId: claimant._id };
  }
  const placeholder = await findLivePlaceholder(
    ctx,
    claimant.mapId,
    systemId,
    typeCode,
    claimant._id,
  );
  if (placeholder === null) {
    return { outcome: 'none', survivorId: claimant._id };
  }
  const survivorId = claimant.toSystemId === null
    ? await mergeSigIntoPlaceholder(ctx, placeholder, claimant)
    : await mergePlaceholderIntoResolved(ctx, placeholder, claimant);
  return { outcome: 'claimed', survivorId };
}

export async function claimStaticPlaceholder(
  ctx: MutationCtx,
  row: Doc<'mapConnections'>,
  side: 'from' | 'to',
): Promise<'claimed' | 'none'> {
  return (await runClaim(ctx, row, side)).outcome;
}

export async function claimStaticOrKeepId(
  ctx: MutationCtx,
  row: Doc<'mapConnections'>,
  side: 'from' | 'to',
): Promise<Id<'mapConnections'>> {
  return (await runClaim(ctx, row, side)).survivorId;
}

export async function respawnStaticPlaceholder(
  ctx: MutationCtx,
  dead: Doc<'mapConnections'>,
): Promise<Id<'mapConnections'> | null> {
  if (dead.staticCode === undefined || !isTombstoned(dead)) return null;
  const system = await findSystem(ctx, dead.mapId, dead.fromSystemId);
  if (system === null || isTombstoned(system)) return null;
  const existing = await findLiveStaticCode(
    ctx,
    dead.mapId,
    dead.fromSystemId,
    dead.staticCode,
  );
  if (existing !== null) return null;
  return await insertStaticPlaceholder(ctx, {
    mapId: dead.mapId,
    systemId: dead.fromSystemId,
    code: dead.staticCode,
    seatOrderAt: dead.seatOrderAt ?? dead._creationTime,
  });
}

export async function respawnAfterTombstone(
  ctx: MutationCtx,
  connectionId: Id<'mapConnections'>,
): Promise<Id<'mapConnections'> | null> {
  const dead = await ctx.db.get(connectionId);
  if (dead === null) return null;
  return await respawnStaticPlaceholder(ctx, dead);
}

export async function deleteUnclaimedRespawn(
  ctx: MutationCtx,
  restored: Doc<'mapConnections'>,
): Promise<void> {
  if (restored.staticCode === undefined) return;
  const respawn = await findLivePlaceholder(
    ctx,
    restored.mapId,
    restored.fromSystemId,
    restored.staticCode,
    restored._id,
  );
  if (respawn === null) return;
  await ctx.db.delete(respawn._id);
}
