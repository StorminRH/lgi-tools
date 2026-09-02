import { connectionRemovedTombstone, tombstoneDeletedAt } from '@/data/maps/chain-contract';
import {
  blankHallway,
  type ConnectionHallway,
} from '@/data/maps/connection-hallway';
import type { ConnectionMassState, WormholeSizeClass } from '@/data/eve-data/wormhole-contract';
import { v } from 'convex/values';
import { internalMutation } from './_generated/server';

export const HALLWAY_BACKFILL_BATCH = 32;

const backfillResultValidator = v.object({
  rewritten: v.number(),
  skipped: v.number(),
  hasMore: v.boolean(),
});

type ConnectionBackfillRow = {
  readonly mapId: string;
  readonly fromSystemId: number;
  readonly toSystemId: number | null;
  readonly from?: unknown;
  readonly to?: unknown;
  readonly massState?: ConnectionMassState | null;
  readonly shipSize?: WormholeSizeClass | null;
  readonly firstSeenAt?: number;
  readonly observedMassKg?: number;
  readonly observedMassAtStateKg?: number;
  readonly observationKey?: string;
  readonly deletedAt?: number | null;
  readonly purgeAfter?: number | null;
};

function isDoorValue(value: unknown): boolean {
  if (typeof value !== 'object' || value === null) return false;
  return 'typeCode' in value && 'leadsTo' in value;
}

function hasNestedDoors(row: {
  readonly from?: unknown;
  readonly to?: unknown;
}): boolean {
  return isDoorValue(row.from) && isDoorValue(row.to);
}

function hallwayFromLegacyRow(row: ConnectionBackfillRow): ConnectionHallway {
  const hallway = blankHallway({
    mapId: row.mapId,
    fromSystemId: row.fromSystemId,
    toSystemId: row.toSystemId,
  });
  const deletedAt = tombstoneDeletedAt(row);
  return {
    ...hallway,
    massState: row.massState ?? null,
    shipSize: row.shipSize ?? null,
    tombstone:
      deletedAt === null
        ? { kind: 'live' }
        : connectionRemovedTombstone(deletedAt).tombstone,
    ...(row.firstSeenAt === undefined ? {} : { firstSeenAt: row.firstSeenAt }),
    ...(row.observedMassKg === undefined ? {} : { observedMassKg: row.observedMassKg }),
    ...(row.observedMassAtStateKg === undefined
      ? {}
      : { observedMassAtStateKg: row.observedMassAtStateKg }),
    ...(row.observationKey === undefined ? {} : { observationKey: row.observationKey }),
  };
}

export const backfillHallwayConnections = internalMutation({
  args: {},
  returns: backfillResultValidator,
  handler: async (ctx) => {
    const rows = await ctx.db
      .query('mapConnections')
      .take(HALLWAY_BACKFILL_BATCH + 1);
    const hasMore = rows.length > HALLWAY_BACKFILL_BATCH;
    const batch = hasMore ? rows.slice(0, HALLWAY_BACKFILL_BATCH) : rows;
    let rewritten = 0;
    let skipped = 0;
    for (const row of batch) {
      if (hasNestedDoors(row)) {
        skipped += 1;
        continue;
      }
      await ctx.db.replace(row._id, hallwayFromLegacyRow(row));
      rewritten += 1;
    }
    return { rewritten, skipped, hasMore };
  },
});
