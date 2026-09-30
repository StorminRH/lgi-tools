// @vitest-environment edge-runtime
import { convexTest } from 'convex-test';
import { makeFunctionReference } from 'convex/server';
import { v } from 'convex/values';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { internal } from './_generated/api';
import { internalQuery } from './_generated/server';
import { accessLease, GEN, locationDoc, OTHER, USER } from './__tests__/characterLocation.setup';
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
    { tracked: 0, leftover: 12 },
    { tracked: 1, leftover: 2 },
    { tracked: 2, leftover: 12 },
    { tracked: 32, leftover: 12 },
  ])('reads only tracking, held state, and leases once for $tracked tracked characters', async (workload) => {
    const reads: PrepRead[] = [];
    const t = convexTest(schema, {
      ...modules,
      '../actualLocationReads.ts': () => import('./characterLocationReads'),
      '../characterLocationReads.ts': async () => ({
        ...await import('./characterLocationReads'),
        syncInputs: measureQuery('inputs', 'actualLocationReads:syncInputs', reads),
      }),
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
      // Per-run rows and another user's rows are never part of the cacheable read set.
      await ctx.db.insert('locationSync', {
        userId: USER,
        runId: GEN,
        jobId: null,
        minExpiresAt: null,
        syncedCharacterIds: [],
        coveredCharacterIds: [],
        lastFinishedAt: null,
      });
      await ctx.db.insert('syncPresence', {
        dataset: 'characterLocation', userId: USER, lastSeenAt: GEN, lastVisibleAt: GEN,
      });
      await ctx.db.insert('mapTracking', { mapId: 'map-a', userId: OTHER, characterId: 81_000_000 });
      await ctx.db.insert('characterLocation', locationDoc(OTHER, 81_000_000));
    });

    await t.query(internal.characterLocationReads.syncInputs, { userId: USER });
    const [baseline] = reads;
    expect(reads).toHaveLength(1);
    reads.length = 0;
    const fetch = vi.fn(() => { throw new Error('unexpected network request'); });
    vi.stubGlobal('fetch', fetch);

    await t.action(internal.characterLocationSync.syncUser, { userId: USER, generation: GEN, schedulerVersion: 2 });

    expect(fetch).not.toHaveBeenCalled();
    expect(reads.map((read) => read.name)).toEqual(['inputs']);
    expect(reads[0]).toEqual(baseline);
    expect(reads[0]?.documentsRead).toBe(
      workload.tracked * 4,
    );
  });
});
