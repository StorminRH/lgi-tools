// @vitest-environment edge-runtime
import { convexTest } from 'convex-test';
import { makeFunctionReference } from 'convex/server';
import { v } from 'convex/values';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { internal } from './_generated/api';
import { internalQuery } from './_generated/server';
import { accessLease, GEN, locationDoc, USER } from './__tests__/characterLocation.setup';
import { modules } from './__tests__/modules.setup';
import schema from './schema';

type PrepRead = { name: string; documentsRead: number; bytesRead: number };

function measureQuery(name: string, reference: string, reads: PrepRead[]) {
  return internalQuery({
    args: { userId: v.string() },
    returns: v.any(),
    handler: async (ctx, args) => {
      const result = await ctx.runQuery(
        makeFunctionReference<'query', typeof args, unknown>(reference), args,
      );
      const metrics = await ctx.meta.getTransactionMetrics();
      reads.push({ name, documentsRead: metrics.documentsRead.used, bytesRead: metrics.bytesRead.used });
      return result;
    },
  });
}

function totalReads(reads: PrepRead[]) {
  return reads.reduce((total, read) => ({
    documentsRead: total.documentsRead + read.documentsRead,
    bytesRead: total.bytesRead + read.bytesRead,
  }), { documentsRead: 0, bytesRead: 0 });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(GEN);
  vi.stubEnv('SITE_URL', 'https://app.test');
  vi.stubEnv('CONVEX_SERVICE_SECRET', 'secret');
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('location-sync preparation I/O', () => {
  it.each([
    { tracked: 0, leftover: 12, documentsRead: 100 },
    { tracked: 1, leftover: 2, documentsRead: 8 },
    { tracked: 32, leftover: 12, documentsRead: 100 },
  ])('preserves separate read budgets for $tracked tracked characters', async (workload) => {
    const reads: PrepRead[] = [];
    const t = convexTest({
      schema,
      transactionLimits: { documentsRead: workload.documentsRead },
      modules: {
        ...modules,
        '../actualLocationReads.ts': () => import('./characterLocationReads'),
        '../actualLocationAccess.ts': () => import('./characterLocationAccess'),
        '../actualTrackingIds.ts': () => import('./mapTrackingIds'),
        '../characterLocationReads.ts': async () => ({
          ...await import('./characterLocationReads'),
          heldState: measureQuery('held', 'actualLocationReads:heldState', reads),
        }),
        '../characterLocationAccess.ts': async () => ({
          ...await import('./characterLocationAccess'),
          accessLeases: measureQuery('leases', 'actualLocationAccess:accessLeases', reads),
        }),
        '../mapTrackingIds.ts': async () => ({
          ...await import('./mapTrackingIds'),
          trackedCharacterIds: measureQuery('tracking', 'actualTrackingIds:trackedCharacterIds', reads),
        }),
      },
    });
    await t.run(async (ctx) => {
      for (let index = 0; index < workload.tracked + workload.leftover; index += 1) {
        const characterId = 80_000_000 + index;
        if (index < workload.tracked) {
          await ctx.db.insert('mapTracking', { mapId: 'map-a', userId: USER, characterId });
        }
        await ctx.db.insert('characterLocation', locationDoc(USER, characterId));
        await ctx.db.insert('characterLocationAccess', accessLease(USER, characterId));
        await ctx.db.insert('characterLocationOnline', {
          userId: USER, characterId, online: false, etagOnline: 'offline', onlineExpiresAt: GEN + 60_000,
        });
      }
    });

    await t.query(internal.characterLocationReads.heldState, { userId: USER });
    await t.query(internal.mapTrackingIds.trackedCharacterIds, { userId: USER });
    await t.query(internal.characterLocationAccess.accessLeases, { userId: USER });
    const baseline = totalReads(reads);
    expect(reads).toHaveLength(3);
    reads.length = 0;
    const fetch = vi.fn(() => { throw new Error('unexpected network request'); });
    vi.stubGlobal('fetch', fetch);

    await t.action(internal.characterLocationSync.syncUser, { userId: USER, generation: GEN });

    const candidate = totalReads(reads);
    expect(fetch).not.toHaveBeenCalled();
    if (workload.tracked === 0) {
      expect(reads.map((read) => read.name)).toEqual(['tracking']);
      expect(candidate).toEqual({ documentsRead: 0, bytesRead: 0 });
      expect(candidate.documentsRead).toBeLessThan(baseline.documentsRead);
      expect(candidate.bytesRead).toBeLessThan(baseline.bytesRead);
    } else {
      expect(reads.map((read) => read.name)).toEqual(['tracking', 'held', 'leases']);
      expect(candidate).toEqual(baseline);
      expect(candidate.documentsRead).toBeGreaterThan(workload.documentsRead);
    }
  });
});
