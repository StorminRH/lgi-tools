import { connectionRemovedTombstone, isTombstoned } from '@/data/maps/chain-contract';
import type { Doc } from './_generated/dataModel';
import { internalMutation, type MutationCtx } from './_generated/server';
import { writeMapEvent } from './mapAuthoringEvents';
import {
  deleteConnectionActivity,
  runCollapse,
} from './mapAuthoringCollapse';
import { readTrackedPilotSystemIds } from './mapTrackingLive';

export const CEILING_COLLAPSE_GRACE_MS = 4 * 60 * 60 * 1000;

export const CEILING_SWEEP_BATCH = 8;

export const CEILING_SWEEP_SCAN = 64;

export const CEILING_SWEEP_ACTOR = 'lifetime expiry';

async function readDueCeilings(
  ctx: MutationCtx,
  cutoff: number,
): Promise<{ due: Doc<'mapConnections'>[]; overflow: boolean }> {
  const due = await ctx.db
    .query('mapConnections')
    .withIndex('by_tombstone_death_latest', (q) =>
      q
        .eq('tombstone.kind', 'live')
        .gt('lifetime.latestAt', 0)
        .lte('lifetime.latestAt', cutoff),
    )
    .take(CEILING_SWEEP_SCAN + 1);
  return {
    due,
    overflow: due.length > CEILING_SWEEP_SCAN,
  };
}

async function collapseDueRow(
  ctx: MutationCtx,
  row: Doc<'mapConnections'>,
  trackedByMap: Map<string, ReadonlySet<number>>,
): Promise<boolean> {
  try {
    let tracked = trackedByMap.get(row.mapId);
    if (tracked === undefined) {
      tracked = await readTrackedPilotSystemIds(ctx, row.mapId);
      trackedByMap.set(row.mapId, tracked);
    }
    await runCollapse(ctx, {
      mapId: row.mapId,
      connectionId: row._id,
      actor: CEILING_SWEEP_ACTOR,
      pilotsPresent: { trackedInSystemIds: tracked },
    });
    return true;
  } catch {
    return false;
  }
}

type RemovedStubEvents = Map<
  string,
  { mapId: string; systemId: number; signatureIds: string[] }
>;

function recordRemovedStub(events: RemovedStubEvents, stub: Doc<'mapConnections'>): void {
  if (stub.from.signatureId === null) return;
  const key = `${stub.mapId}:${stub.fromSystemId}`;
  const entry = events.get(key) ?? {
    mapId: stub.mapId,
    systemId: stub.fromSystemId,
    signatureIds: [],
  };
  entry.signatureIds.push(stub.from.signatureId);
  events.set(key, entry);
}

async function sweepExpiredCeilings(
  ctx: MutationCtx,
  now: number,
): Promise<{
  collapsed: number;
  removedStubs: number;
  skipped: number;
  failed: number;
  hasMore: boolean;
}> {
  const { due, overflow } = await readDueCeilings(ctx, now - CEILING_COLLAPSE_GRACE_MS);
  const trackedByMap = new Map<string, ReadonlySet<number>>();
  const failedMapIds = new Set<string>();
  const stubEvents: RemovedStubEvents = new Map();
  let collapsed = 0;
  let removedStubs = 0;
  let skipped = 0;
  let failed = 0;
  let processed = 0;
  for (const row of due) {
    if (collapsed + removedStubs >= CEILING_SWEEP_BATCH) break;
    processed += 1;
    if (failedMapIds.has(row.mapId)) {
      failed += 1;
      continue;
    }
    const fresh = await ctx.db.get(row._id);
    if (fresh === null || isTombstoned(fresh)) {
      skipped += 1;
      continue;
    }
    if (fresh.toSystemId === null) {
      await ctx.db.patch(fresh._id, connectionRemovedTombstone(now));
      await deleteConnectionActivity(ctx, fresh);
      recordRemovedStub(stubEvents, fresh);
      removedStubs += 1;
    } else if (await collapseDueRow(ctx, fresh, trackedByMap)) {
      collapsed += 1;
    } else {
      failedMapIds.add(fresh.mapId);
      failed += 1;
    }
  }
  for (const entry of stubEvents.values()) {
    await writeMapEvent(ctx, {
      mapId: entry.mapId,
      at: now,
      kind: 'signatures_removed',
      actor: CEILING_SWEEP_ACTOR,
      payload: { systemId: entry.systemId, signatureIds: entry.signatureIds },
    });
  }
  return {
    collapsed,
    removedStubs,
    skipped,
    failed,
    hasMore: processed < due.length || overflow,
  };
}

export const collapseExpiredConnections = internalMutation({
  args: {},
  handler: async (ctx) => await sweepExpiredCeilings(ctx, Date.now()),
});
