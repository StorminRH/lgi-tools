// @vitest-environment edge-runtime
import { RateLimiter } from '@convex-dev/rate-limiter';
import { convexTest } from 'convex-test';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  computeChainBoundary,
  HIDDEN_PRESENCE_MAX_MS,
  isColdFromPresence,
  RETENTION_MS,
  SYNC_DATASET_CONFIG,
} from '@/lib/sync-engine';
import { api, internal } from './_generated/api';
import { SCAN_DISPATCH_BATCH } from './lib/engineCore';
import schema from './schema';
import { modules } from './__tests__/modules.setup';

function stubDispatch() {
  vi.spyOn(RateLimiter.prototype, 'limit').mockResolvedValue({ ok: true, retryAfter: 0 } as never);
}

async function scheduledFunctionsNamed(
  t: ReturnType<typeof convexTest>,
  name: string,
) {
  return t.run(async (ctx) => {
    const rows = await ctx.db.system.query('_scheduled_functions').collect();
    return rows.filter((row) => row.name.includes(name));
  });
}

async function scheduledChainDispatches(t: ReturnType<typeof convexTest>) {
  return scheduledFunctionsNamed(t, 'chainDispatch');
}

async function scheduledSyncUsers(t: ReturnType<typeof convexTest>) {
  return scheduledFunctionsNamed(t, 'syncUser');
}

const USER = 'user_engine_1';

function subjectRow(overrides: Record<string, unknown> = {}) {
  return {
    dataset: 'characterLocation' as const,
    userId: USER,
    status: 'idle' as const,
    lastRequestedAt: 0,
    workId: null,
    nextDueAt: null,
    minExpiresAt: null,
    syncedCharacterIds: [] as number[],
    lastFinishedAt: null,
    lastError: null,
    rlGroup: null,
    rlLimit: null,
    rlRemaining: null,
    rlUsed: null,
    ...overrides,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('engine.heartbeat', () => {
  it('does nothing when signed out', async () => {
    const t = convexTest(schema, modules);
    await t.mutation(api.engine.heartbeat, { dataset: 'characterLocation', characterIdsHint: [], reason: 'mount' });
    const { presence, subjects } = await t.run(async (ctx) => ({
      presence: await ctx.db.query('syncPresence').collect(),
      subjects: await ctx.db.query('syncSubjects').collect(),
    }));
    expect(presence).toHaveLength(0);
    expect(subjects).toHaveLength(0);
  });

  it('an interval beat writes only presence, never the subject', async () => {
    const t = convexTest(schema, modules);
    await t
      .withIdentity({ subject: USER })
      .mutation(api.engine.heartbeat, { dataset: 'characterLocation', characterIdsHint: [101], reason: 'interval' });
    const { presence, subjects } = await t.run(async (ctx) => ({
      presence: await ctx.db.query('syncPresence').collect(),
      subjects: await ctx.db.query('syncSubjects').collect(),
    }));
    expect(presence).toHaveLength(1);
    expect(subjects).toHaveLength(0);
  });

  it('a mount beat with no target creates an idle subject and does not dispatch', async () => {
    const t = convexTest(schema, modules);
    await t
      .withIdentity({ subject: USER })
      .mutation(api.engine.heartbeat, { dataset: 'characterLocation', characterIdsHint: [], reason: 'mount' });
    const subject = await t.run((ctx) =>
      ctx.db
        .query('syncSubjects')
        .withIndex('by_user_dataset', (q) => q.eq('userId', USER).eq('dataset', 'characterLocation'))
        .unique(),
    );
    expect(subject?.status).toBe('idle');
    expect(subject?.workId).toBeNull();
    expect(subject?.nextDueAt).toBeNull();
  });

  it('re-arms a retired-but-fresh subject without dispatching', async () => {
    const t = convexTest(schema, modules);
    const now = Date.now();
    await t.run(async (ctx) => {
      await ctx.db.insert('syncSubjects', subjectRow({
        syncedCharacterIds: [101],
        minExpiresAt: now + 600_000,
        nextDueAt: null,
        lastFinishedAt: now - 1000,
      }));
    });

    await t
      .withIdentity({ subject: USER })
      .mutation(api.engine.heartbeat, { dataset: 'characterLocation', characterIdsHint: [101], reason: 'mount' });

    const subject = await t.run((ctx) =>
      ctx.db
        .query('syncSubjects')
        .withIndex('by_user_dataset', (q) => q.eq('userId', USER).eq('dataset', 'characterLocation'))
        .unique(),
    );
    expect(typeof subject?.nextDueAt).toBe('number');
    expect(subject?.status).toBe('idle');
  });

  it('returns early while a run is still fresh', async () => {
    const t = convexTest(schema, modules);
    const now = Date.now();
    await t.run(async (ctx) => {
      await ctx.db.insert('syncSubjects', subjectRow({
        status: 'running',
        lastRequestedAt: now,
        workId: 'w1',
        nextDueAt: now + 60_000,
        syncedCharacterIds: [101],
      }));
    });

    await t
      .withIdentity({ subject: USER })
      .mutation(api.engine.heartbeat, { dataset: 'characterLocation', characterIdsHint: [101], reason: 'mount' });

    const subject = await t.run((ctx) =>
      ctx.db
        .query('syncSubjects')
        .withIndex('by_user_dataset', (q) => q.eq('userId', USER).eq('dataset', 'characterLocation'))
        .unique(),
    );
    expect(subject?.status).toBe('running');
    expect(subject?.workId).toBe('w1');
  });

  it('a recovery interval beat revives a subject the scan retired during a beat gap', async () => {
    const t = convexTest(schema, modules);
    const now = Date.now();
    stubDispatch();
    await t.run(async (ctx) => {
      await ctx.db.insert('syncSubjects', subjectRow({
        nextDueAt: null, syncedCharacterIds: [101], minExpiresAt: null,
      }));
      await ctx.db.insert('syncPresence', {
        dataset: 'characterLocation',
        userId: USER,
        lastSeenAt: now - SYNC_DATASET_CONFIG.characterLocation.coldAfterMs - 60_000,
        lastVisibleAt: now - SYNC_DATASET_CONFIG.characterLocation.coldAfterMs - 60_000,
      });
    });

    await t
      .withIdentity({ subject: USER })
      .mutation(api.engine.heartbeat, {
        dataset: 'characterLocation', characterIdsHint: [101], reason: 'interval', visible: false,
      });

    const subject = await t.run((ctx) => ctx.db.query('syncSubjects').unique());
    expect(subject?.status).toBe('running');
  });

  it('no-ops entirely for a retired dataset beat (pre-deploy tab)', async () => {
    const t = convexTest(schema, modules);
    await t
      .withIdentity({ subject: USER })
      .mutation(api.engine.heartbeat, { dataset: 'onlineStatus', characterIdsHint: [101], reason: 'mount' });
    const { presence, subjects } = await t.run(async (ctx) => ({
      presence: await ctx.db.query('syncPresence').collect(),
      subjects: await ctx.db.query('syncSubjects').collect(),
    }));
    expect(presence).toHaveLength(0);
    expect(subjects).toHaveLength(0);
  });

  it('stamps lastVisibleAt on visible and legacy beats but never on hidden ones', async () => {
    const t = convexTest(schema, modules);
    const authed = t.withIdentity({ subject: USER });
    await authed.mutation(api.engine.heartbeat, {
      dataset: 'characterLocation', characterIdsHint: [], reason: 'mount', visible: false,
    });
    const inserted = await t.run((ctx) => ctx.db.query('syncPresence').unique());
    expect(typeof inserted?.lastVisibleAt).toBe('number');

    await t.run((ctx) => ctx.db.patch(inserted!._id, { lastSeenAt: 123, lastVisibleAt: 123 }));
    await authed.mutation(api.engine.heartbeat, {
      dataset: 'characterLocation', characterIdsHint: [], reason: 'interval', visible: false,
    });
    const afterHidden = await t.run((ctx) => ctx.db.query('syncPresence').unique());
    expect(afterHidden?.lastSeenAt).toBeGreaterThan(123);
    expect(afterHidden?.lastVisibleAt).toBe(123);

    await authed.mutation(api.engine.heartbeat, {
      dataset: 'characterLocation', characterIdsHint: [], reason: 'interval',
    });
    const afterLegacy = await t.run((ctx) => ctx.db.query('syncPresence').unique());
    expect(afterLegacy?.lastVisibleAt).toBeGreaterThan(123);
  });

  it('stamps the beating tab id onto presence', async () => {
    const t = convexTest(schema, modules);
    await t.withIdentity({ subject: USER }).mutation(api.engine.heartbeat, {
      dataset: 'characterLocation',
      characterIdsHint: [],
      reason: 'mount',
      tabId: 'tab-one',
    });
    const presence = await t.run((ctx) => ctx.db.query('syncPresence').unique());
    expect(presence?.tabId).toBe('tab-one');
  });
});

describe('engine.leave', () => {
  it('retires a matching tab, ages presence, and ignores a newer tab', async () => {
    const t = convexTest(schema, modules);
    const now = Date.now();
    await t.run(async (ctx) => {
      await ctx.db.insert('syncSubjects', subjectRow({
        nextDueAt: now + 5_000,
        lastRequestedAt: now,
        workId: String(now),
        syncedCharacterIds: [101],
      }));
      await ctx.db.insert('syncPresence', {
        dataset: 'characterLocation',
        userId: USER,
        lastSeenAt: now,
        lastVisibleAt: now,
        tabId: 'tab-a',
      });
      await ctx.db.insert('characterLocationCovered', {
        userId: USER,
        characterId: 101,
      });
    });

    const ignored = await t.mutation(internal.engineLeave.leave, {
      userId: USER,
      dataset: 'characterLocation',
      tabId: 'tab-b',
    });
    expect(ignored).toEqual({ retired: false });
    const stillHot = await t.run(async (ctx) => ({
      subject: await ctx.db.query('syncSubjects').unique(),
      covered: await ctx.db.query('characterLocationCovered').collect(),
    }));
    expect(stillHot.subject?.nextDueAt).toBe(now + 5_000);
    expect(stillHot.covered).toHaveLength(1);

    const retired = await t.mutation(internal.engineLeave.leave, {
      userId: USER,
      dataset: 'characterLocation',
      tabId: 'tab-a',
    });
    expect(retired).toEqual({ retired: true });
    const after = await t.run(async (ctx) => ({
      subject: await ctx.db.query('syncSubjects').unique(),
      presence: await ctx.db.query('syncPresence').unique(),
      covered: await ctx.db.query('characterLocationCovered').collect(),
    }));
    expect(after.subject?.nextDueAt).toBeNull();
    expect(after.subject?.workId).toBeNull();
    expect(after.subject?.lastRequestedAt).toBe(0);
    expect(after.covered).toEqual([]);
    expect(after.presence?.leftTabId).toBe('tab-a');
    expect(
      isColdFromPresence(
        after.presence,
        SYNC_DATASET_CONFIG.characterLocation.coldAfterMs,
        Date.now(),
      ),
    ).toBe(true);
  });

  it('ignores a delayed beat from the tab that left and lets a new tab recover', async () => {
    const t = convexTest(schema, modules);
    const now = Date.now();
    stubDispatch();
    await t.run(async (ctx) => {
      await ctx.db.insert('syncSubjects', subjectRow({
        nextDueAt: now + 5_000,
        syncedCharacterIds: [101],
        minExpiresAt: null,
      }));
      await ctx.db.insert('syncPresence', {
        dataset: 'characterLocation',
        userId: USER,
        lastSeenAt: now,
        lastVisibleAt: now,
        tabId: 'tab-a',
      });
    });
    await t.mutation(internal.engineLeave.leave, {
      userId: USER,
      dataset: 'characterLocation',
      tabId: 'tab-a',
    });

    await t.withIdentity({ subject: USER }).mutation(api.engine.heartbeat, {
      dataset: 'characterLocation',
      characterIdsHint: [101],
      reason: 'interval',
      tabId: 'tab-a',
    });
    const fenced = await t.run(async (ctx) => ({
      subject: await ctx.db.query('syncSubjects').unique(),
      presence: await ctx.db.query('syncPresence').unique(),
    }));
    expect(fenced.subject?.nextDueAt).toBeNull();
    expect(fenced.presence?.leftTabId).toBe('tab-a');

    await t.withIdentity({ subject: USER }).mutation(api.engine.heartbeat, {
      dataset: 'characterLocation',
      characterIdsHint: [101],
      reason: 'interval',
      visible: false,
      tabId: 'tab-b',
    });
    const recovered = await t.run(async (ctx) => ({
      subject: await ctx.db.query('syncSubjects').unique(),
      presence: await ctx.db.query('syncPresence').unique(),
    }));
    expect(recovered.subject?.status).toBe('running');
    expect(recovered.presence?.tabId).toBe('tab-b');
    expect(recovered.presence?.leftTabId).toBe('');
  });

  it('recovers the remaining tab after an older tab beats last and then leaves', async () => {
    const t = convexTest(schema, modules);
    stubDispatch();
    const authed = t.withIdentity({ subject: USER });
    await authed.mutation(api.engine.heartbeat, {
      dataset: 'characterLocation',
      characterIdsHint: [101],
      reason: 'mount',
      tabId: 'tab-a',
    });
    await authed.mutation(api.engine.heartbeat, {
      dataset: 'characterLocation',
      characterIdsHint: [101],
      reason: 'mount',
      tabId: 'tab-b',
    });
    await authed.mutation(api.engine.heartbeat, {
      dataset: 'characterLocation',
      characterIdsHint: [101],
      reason: 'interval',
      tabId: 'tab-a',
    });
    const lastBeater = await t.run((ctx) => ctx.db.query('syncPresence').unique());
    expect(lastBeater?.tabId).toBe('tab-a');

    expect(await t.mutation(internal.engineLeave.leave, {
      userId: USER,
      dataset: 'characterLocation',
      tabId: 'tab-a',
    })).toEqual({ retired: true });

    await authed.mutation(api.engine.heartbeat, {
      dataset: 'characterLocation',
      characterIdsHint: [101],
      reason: 'interval',
      tabId: 'tab-b',
    });
    const recovered = await t.run(async (ctx) => ({
      subject: await ctx.db.query('syncSubjects').unique(),
      presence: await ctx.db.query('syncPresence').unique(),
    }));
    expect(recovered.subject?.status).toBe('running');
    expect(recovered.presence?.tabId).toBe('tab-b');
    expect(recovered.presence?.leftTabId).toBe('');
  });
});

describe('engine.scan', () => {
  it('keeps a hidden-throttled subject hot inside the widened cold window', async () => {
    const t = convexTest(schema, modules);
    const now = Date.now();
    stubDispatch();
    await t.run(async (ctx) => {
      await ctx.db.insert('syncSubjects', subjectRow({ nextDueAt: now - 1000, syncedCharacterIds: [101] }));
      await ctx.db.insert('syncPresence', {
        dataset: 'characterLocation', userId: USER, lastSeenAt: now - 2 * 60_000,
      });
    });

    await t.mutation(internal.engineScan.scan, {});

    const subject = await t.run((ctx) => ctx.db.query('syncSubjects').unique());
    expect(subject?.status).toBe('running');
  });

  it('retires a retired-dataset leftover row instead of dispatching it', async () => {
    const t = convexTest(schema, modules);
    const now = Date.now();
    stubDispatch();
    await t.run(async (ctx) => {
      await ctx.db.insert('syncSubjects', subjectRow({
        dataset: 'onlineStatus', nextDueAt: now - 1000, syncedCharacterIds: [101],
      }));
      await ctx.db.insert('syncPresence', { dataset: 'onlineStatus', userId: USER, lastSeenAt: now });
    });

    await t.mutation(internal.engineScan.scan, {});

    const subject = await t.run((ctx) => ctx.db.query('syncSubjects').unique());
    expect(subject?.status).toBe('idle');
    expect(subject?.nextDueAt).toBeNull();
  });

  it('retires hidden-only presence past the visible backstop despite fresh beats', async () => {
    const t = convexTest(schema, modules);
    const now = Date.now();
    await t.run(async (ctx) => {
      await ctx.db.insert('syncSubjects', subjectRow({
        dataset: 'characterLocation', nextDueAt: now - 1000, syncedCharacterIds: [101],
      }));
      await ctx.db.insert('syncPresence', {
        dataset: 'characterLocation',
        userId: USER,
        lastSeenAt: now,
        lastVisibleAt: now - HIDDEN_PRESENCE_MAX_MS - 1,
      });
    });

    await t.mutation(internal.engineScan.scan, {});

    const subject = await t.run((ctx) =>
      ctx.db
        .query('syncSubjects')
        .withIndex('by_user_dataset', (q) => q.eq('userId', USER).eq('dataset', 'characterLocation'))
        .unique(),
    );
    expect(subject?.nextDueAt).toBeNull();
  });

  it('retires a cold due subject from the scan set', async () => {
    const t = convexTest(schema, modules);
    const now = Date.now();
    await t.run(async (ctx) => {
      await ctx.db.insert('syncSubjects', subjectRow({ nextDueAt: now - 1000 }));
      await ctx.db.insert('characterLocationCovered', {
        userId: USER,
        characterId: 9_000_001,
      });
    });
    await t.mutation(internal.engineScan.scan, {});
    const subject = await t.run((ctx) =>
      ctx.db
        .query('syncSubjects')
        .withIndex('by_user_dataset', (q) => q.eq('userId', USER).eq('dataset', 'characterLocation'))
        .unique(),
    );
    expect(subject?.nextDueAt).toBeNull();
    const covered = await t.run((ctx) =>
      ctx.db
        .query('characterLocationCovered')
        .withIndex('by_user', (q) => q.eq('userId', USER))
        .collect(),
    );
    expect(covered).toEqual([]);
  });

  it('skips a hot due subject whose run is still fresh', async () => {
    const t = convexTest(schema, modules);
    const now = Date.now();
    await t.run(async (ctx) => {
      await ctx.db.insert('syncSubjects', subjectRow({
        status: 'running',
        lastRequestedAt: now,
        workId: 'w1',
        nextDueAt: now - 1000,
      }));
      await ctx.db.insert('syncPresence', { dataset: 'characterLocation', userId: USER, lastSeenAt: now });
    });
    await t.mutation(internal.engineScan.scan, {});
    const subject = await t.run((ctx) =>
      ctx.db
        .query('syncSubjects')
        .withIndex('by_user_dataset', (q) => q.eq('userId', USER).eq('dataset', 'characterLocation'))
        .unique(),
    );
    expect(subject?.nextDueAt).toBe(now - 1000);
    expect(subject?.status).toBe('running');
  });

  it('dispatches every due subject in one tick when under the cap', async () => {
    const t = convexTest(schema, modules);
    const now = Date.now();
    stubDispatch();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    await t.run(async (ctx) => {
      for (let i = 0; i < 3; i++) {
        await ctx.db.insert('syncSubjects', subjectRow({
          userId: `u${i}`,
          nextDueAt: now - 1000,
          syncedCharacterIds: [101],
        }));
        await ctx.db.insert('syncPresence', { dataset: 'characterLocation', userId: `u${i}`, lastSeenAt: now });
      }
    });

    await t.mutation(internal.engineScan.scan, {});

    const statuses = await t.run(async (ctx) =>
      (await ctx.db.query('syncSubjects').collect()).map((s) => s.status).sort(),
    );
    expect(statuses).toEqual(['running', 'running', 'running']);
    expect(warn).not.toHaveBeenCalled();
  });

  it('caps the dispatch at the batch and drains the backlog on the next tick', async () => {
    const t = convexTest(schema, modules);
    const now = Date.now();
    stubDispatch();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const total = SCAN_DISPATCH_BATCH + 1;
    await t.run(async (ctx) => {
      for (let i = 0; i < total; i++) {
        await ctx.db.insert('syncSubjects', subjectRow({
          userId: `u${i}`,
          nextDueAt: now - total + i,
          syncedCharacterIds: [101],
        }));
        await ctx.db.insert('syncPresence', { dataset: 'characterLocation', userId: `u${i}`, lastSeenAt: now });
      }
    });

    await t.mutation(internal.engineScan.scan, {});
    const tick1 = await t.run(async (ctx) => {
      const rows = await ctx.db.query('syncSubjects').collect();
      return {
        running: rows.filter((s) => s.status === 'running').length,
        idle: rows.filter((s) => s.status === 'idle').length,
      };
    });
    expect(tick1).toEqual({ running: SCAN_DISPATCH_BATCH, idle: 1 });
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]![0]).toContain('scan_batch_capped');

    await t.mutation(internal.engineScan.scan, {});
    const tick2Running = await t.run(async (ctx) =>
      (await ctx.db.query('syncSubjects').collect()).filter((s) => s.status === 'running').length,
    );
    expect(tick2Running).toBe(total);
    expect(warn).toHaveBeenCalledTimes(1);
  });
});

describe('engine.onSyncComplete', () => {
  function callComplete(t: ReturnType<typeof convexTest>, result: unknown, workId = 'w1') {
    return t.mutation(internal.engineComplete.onSyncComplete, {
      workId: workId as never,
      context: { dataset: 'characterLocation', userId: USER },
      result: result as never,
    });
  }

  it('re-arms and records the error on a terminal failure', async () => {
    const t = convexTest(schema, modules);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const now = Date.now();
    await t.run(async (ctx) => {
      await ctx.db.insert('syncSubjects', subjectRow({
        status: 'running',
        lastRequestedAt: now,
        workId: 'w1',
        nextDueAt: now + 60_000,
        minExpiresAt: now + 5000,
        syncedCharacterIds: [101],
      }));
    });

    await callComplete(t, { kind: 'failed', error: 'boom' });

    const subject = await t.run((ctx) =>
      ctx.db
        .query('syncSubjects')
        .withIndex('by_user_dataset', (q) => q.eq('userId', USER).eq('dataset', 'characterLocation'))
        .unique(),
    );
    expect(subject?.status).toBe('idle');
    expect(subject?.workId).toBeNull();
    expect(subject?.minExpiresAt).toBeNull();
    expect(subject?.lastError?.startsWith('sync_failed:')).toBe(true);
    expect(typeof subject?.nextDueAt).toBe('number');
  });

  it('the one-deploy engine.chainDispatch path still dispatches a due hop', async () => {
    const t = convexTest(schema, modules);
    stubDispatch();
    const now = Date.now();
    await t.run(async (ctx) => {
      await ctx.db.insert('syncSubjects', subjectRow({
        dataset: 'characterLocation',
        status: 'idle',
        lastRequestedAt: 0,
        nextDueAt: now,
        syncedCharacterIds: [101],
      }));
      await ctx.db.insert('syncPresence', {
        dataset: 'characterLocation',
        userId: USER,
        lastSeenAt: now,
      });
    });

    await t.mutation(internal.engine.chainDispatch, {
      dataset: 'characterLocation',
      userId: USER,
    });

    const subject = await t.run((ctx) =>
      ctx.db
        .query('syncSubjects')
        .withIndex('by_user_dataset', (q) => q.eq('userId', USER).eq('dataset', 'characterLocation'))
        .unique(),
    );
    expect(subject?.status).toBe('running');
    expect(subject?.workId).toBe(String(now));
    expect(await scheduledSyncUsers(t)).toHaveLength(1);
  });

  it('the one-deploy engine.onSyncComplete path still completes a run', async () => {
    const t = convexTest(schema, modules);
    const now = Date.now();
    await t.run(async (ctx) => {
      await ctx.db.insert('syncSubjects', subjectRow({
        status: 'running',
        lastRequestedAt: now,
        workId: 'w1',
        nextDueAt: now + 60_000,
        syncedCharacterIds: [101],
      }));
    });

    await t.mutation(internal.engine.onSyncComplete, {
      workId: 'w1',
      context: { dataset: 'characterLocation', userId: USER },
      result: { kind: 'success' },
    });

    const subject = await t.run((ctx) =>
      ctx.db
        .query('syncSubjects')
        .withIndex('by_user_dataset', (q) => q.eq('userId', USER).eq('dataset', 'characterLocation'))
        .unique(),
    );
    expect(subject?.status).toBe('idle');
    expect(subject?.workId).toBeNull();
  });

  it('arms the next due time off the cache window on success with targets', async () => {
    const t = convexTest(schema, modules);
    const now = Date.now();
    await t.run(async (ctx) => {
      await ctx.db.insert('syncSubjects', subjectRow({
        status: 'running',
        lastRequestedAt: now,
        workId: 'w1',
        minExpiresAt: now + 50_000,
        syncedCharacterIds: [101],
      }));
    });

    await callComplete(t, { kind: 'success' });

    const subject = await t.run((ctx) =>
      ctx.db
        .query('syncSubjects')
        .withIndex('by_user_dataset', (q) => q.eq('userId', USER).eq('dataset', 'characterLocation'))
        .unique(),
    );
    expect(subject?.status).toBe('idle');
    expect(typeof subject?.nextDueAt).toBe('number');
    expect(subject?.minExpiresAt).toBe(now + 50_000);
  });

  it('parks a successful run with nothing synced at null', async () => {
    const t = convexTest(schema, modules);
    const now = Date.now();
    await t.run(async (ctx) => {
      await ctx.db.insert('syncSubjects', subjectRow({
        status: 'running',
        lastRequestedAt: now,
        workId: 'w1',
        syncedCharacterIds: [],
      }));
    });

    await callComplete(t, { kind: 'success' });

    const subject = await t.run((ctx) =>
      ctx.db
        .query('syncSubjects')
        .withIndex('by_user_dataset', (q) => q.eq('userId', USER).eq('dataset', 'characterLocation'))
        .unique(),
    );
    expect(subject?.nextDueAt).toBeNull();
  });

  it('no-ops when the workId no longer owns the subject', async () => {
    const t = convexTest(schema, modules);
    const now = Date.now();
    await t.run(async (ctx) => {
      await ctx.db.insert('syncSubjects', subjectRow({
        status: 'running',
        lastRequestedAt: now,
        workId: 'w1',
        nextDueAt: now + 60_000,
      }));
    });

    await callComplete(t, { kind: 'success' }, 'stale-work');

    const subject = await t.run((ctx) =>
      ctx.db
        .query('syncSubjects')
        .withIndex('by_user_dataset', (q) => q.eq('userId', USER).eq('dataset', 'characterLocation'))
        .unique(),
    );
    expect(subject?.status).toBe('running');
    expect(subject?.workId).toBe('w1');
  });

});

describe('engine chain-on-success', () => {
  function callLocationComplete(
    t: ReturnType<typeof convexTest>,
    result: unknown,
    workId = 'w1',
  ) {
    return t.mutation(internal.engineComplete.onSyncComplete, {
      workId: workId as never,
      context: { dataset: 'characterLocation', userId: USER },
      result: result as never,
    });
  }

  it('re-arms jitter-free and chainDispatch dispatches the next hop', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-04T12:00:00.000Z'));
    const t = convexTest(schema, modules);
    stubDispatch();
    const now = Date.now();
    const minExpiresAt = now + 5_000;
    await t.run(async (ctx) => {
      await ctx.db.insert('syncSubjects', subjectRow({
        dataset: 'characterLocation',
        status: 'running',
        lastRequestedAt: now,
        workId: 'w1',
        minExpiresAt,
        syncedCharacterIds: [101],
        coveredCharacterIds: [101],
      }));
      await ctx.db.insert('syncPresence', {
        dataset: 'characterLocation',
        userId: USER,
        lastSeenAt: now,
      });
    });

    await callLocationComplete(t, { kind: 'success' });

    const boundary = computeChainBoundary(minExpiresAt, 5_000, now);
    const subject = await t.run((ctx) =>
      ctx.db
        .query('syncSubjects')
        .withIndex('by_user_dataset', (q) => q.eq('userId', USER).eq('dataset', 'characterLocation'))
        .unique(),
    );
    expect(subject?.status).toBe('idle');
    expect(subject?.nextDueAt).toBe(boundary);

    const pending = await scheduledChainDispatches(t);
    expect(pending).toHaveLength(1);
    expect(pending[0]?.scheduledTime).toBe(boundary);
    expect(pending[0]?.args).toEqual([{ dataset: 'characterLocation', userId: USER }]);

    vi.setSystemTime(boundary);
    await t.mutation(internal.engineComplete.chainDispatch, {
      dataset: 'characterLocation',
      userId: USER,
    });

    const afterHop = await t.run((ctx) =>
      ctx.db
        .query('syncSubjects')
        .withIndex('by_user_dataset', (q) => q.eq('userId', USER).eq('dataset', 'characterLocation'))
        .unique(),
    );
    expect(afterHop?.status).toBe('running');
    expect(afterHop?.workId).toBe(String(Date.now()));
    expect(afterHop?.nextDueAt).toBe(Date.now() + 5_000);
    expect(await scheduledSyncUsers(t)).toHaveLength(1);
  });

  it('chains a failed completion at the cadence floor while presence is fresh, and never when cold', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-04T12:00:00.000Z'));
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const fresh = convexTest(schema, modules);
    stubDispatch();
    const now = Date.now();
    await fresh.run(async (ctx) => {
      await ctx.db.insert('syncSubjects', subjectRow({
        dataset: 'characterLocation',
        status: 'running',
        lastRequestedAt: now,
        workId: 'w1',
        minExpiresAt: now + 5_000,
        syncedCharacterIds: [101],
        coveredCharacterIds: [101],
      }));
      await ctx.db.insert('syncPresence', {
        dataset: 'characterLocation',
        userId: USER,
        lastSeenAt: now,
      });
    });

    await callLocationComplete(fresh, { kind: 'failed', error: 'boom' });

    const boundary = now + 5_000;
    const freshSubject = await fresh.run((ctx) =>
      ctx.db
        .query('syncSubjects')
        .withIndex('by_user_dataset', (q) => q.eq('userId', USER).eq('dataset', 'characterLocation'))
        .unique(),
    );
    expect(freshSubject?.status).toBe('idle');
    expect(freshSubject?.nextDueAt).toBe(boundary);
    expect(freshSubject?.lastError?.startsWith('sync_failed:')).toBe(true);

    const pending = await scheduledChainDispatches(fresh);
    expect(pending).toHaveLength(1);
    expect(pending[0]?.scheduledTime).toBe(boundary);

    vi.setSystemTime(boundary);
    await fresh.mutation(internal.engineComplete.chainDispatch, {
      dataset: 'characterLocation',
      userId: USER,
    });

    const afterHop = await fresh.run((ctx) =>
      ctx.db
        .query('syncSubjects')
        .withIndex('by_user_dataset', (q) => q.eq('userId', USER).eq('dataset', 'characterLocation'))
        .unique(),
    );
    expect(afterHop?.status).toBe('running');
    expect(afterHop?.workId).toBe(String(Date.now()));
    expect(await scheduledSyncUsers(fresh)).toHaveLength(1);

    const cold = convexTest(schema, modules);
    await cold.run(async (ctx) => {
      await ctx.db.insert('syncSubjects', subjectRow({
        dataset: 'characterLocation',
        status: 'running',
        lastRequestedAt: now,
        workId: 'w1',
        minExpiresAt: now + 5_000,
        syncedCharacterIds: [101],
        coveredCharacterIds: [101],
      }));
      await ctx.db.insert('syncPresence', {
        dataset: 'characterLocation',
        userId: USER,
        lastSeenAt: now - SYNC_DATASET_CONFIG.characterLocation.coldAfterMs - 1,
      });
    });

    await callLocationComplete(cold, { kind: 'failed', error: 'boom' });

    expect(await scheduledChainDispatches(cold)).toHaveLength(0);
    const coldSubject = await cold.run((ctx) =>
      ctx.db
        .query('syncSubjects')
        .withIndex('by_user_dataset', (q) => q.eq('userId', USER).eq('dataset', 'characterLocation'))
        .unique(),
    );
    expect(coldSubject?.status).toBe('idle');
    expect(typeof coldSubject?.nextDueAt).toBe('number');
    expect(coldSubject?.lastError?.startsWith('sync_failed:')).toBe(true);
  });

  it('never chains a cold-presence completion', async () => {
    const t = convexTest(schema, modules);
    const now = Date.now();
    await t.run(async (ctx) => {
      await ctx.db.insert('syncSubjects', subjectRow({
        dataset: 'characterLocation',
        status: 'running',
        lastRequestedAt: now,
        workId: 'w1',
        minExpiresAt: now + 5_000,
        syncedCharacterIds: [101],
        coveredCharacterIds: [101],
      }));
      await ctx.db.insert('syncPresence', {
        dataset: 'characterLocation',
        userId: USER,
        lastSeenAt: now - SYNC_DATASET_CONFIG.characterLocation.coldAfterMs - 1,
      });
    });

    await callLocationComplete(t, { kind: 'success' });

    expect(await scheduledChainDispatches(t)).toHaveLength(0);
    const subject = await t.run((ctx) =>
      ctx.db
        .query('syncSubjects')
        .withIndex('by_user_dataset', (q) => q.eq('userId', USER).eq('dataset', 'characterLocation'))
        .unique(),
    );
    expect(typeof subject?.nextDueAt).toBe('number');
  });

  it('never chains a poisoned (null-window) completion — the 5s floor is unreachable', async () => {
    const t = convexTest(schema, modules);
    const now = Date.now();
    await t.run(async (ctx) => {
      await ctx.db.insert('syncSubjects', subjectRow({
        status: 'running',
        lastRequestedAt: now,
        workId: 'w1',
        minExpiresAt: null,
        syncedCharacterIds: [101, 102],
        coveredCharacterIds: [101],
      }));
      await ctx.db.insert('syncPresence', { dataset: 'characterLocation', userId: USER, lastSeenAt: now });
    });

    await callLocationComplete(t, { kind: 'success' });

    expect(await scheduledChainDispatches(t)).toHaveLength(0);
    const subject = await t.run((ctx) => ctx.db.query('syncSubjects').unique());
    expect(typeof subject?.nextDueAt).toBe('number');
  });

  it('never chains a zero-yield success (empty covered set or run-level error)', async () => {
    const t = convexTest(schema, modules);
    const now = Date.now();
    for (const overrides of [
      { coveredCharacterIds: [] as number[] },
      { coveredCharacterIds: [101], lastError: 'budget_exhausted:daily' },
    ]) {
      await t.run(async (ctx) => {
        const stale = await ctx.db
          .query('syncSubjects')
          .withIndex('by_user_dataset', (q) =>
            q.eq('userId', USER).eq('dataset', 'characterLocation'),
          )
          .unique();
        if (stale !== null) await ctx.db.delete(stale._id);
        await ctx.db.insert('syncSubjects', subjectRow({
          dataset: 'characterLocation',
          status: 'running',
          lastRequestedAt: now,
          workId: 'w1',
          minExpiresAt: now + 5_000,
          syncedCharacterIds: [101],
          ...overrides,
        }));
        const presence = await ctx.db
          .query('syncPresence')
          .withIndex('by_user_dataset', (q) =>
            q.eq('userId', USER).eq('dataset', 'characterLocation'),
          )
          .unique();
        if (presence === null) {
          await ctx.db.insert('syncPresence', {
            dataset: 'characterLocation',
            userId: USER,
            lastSeenAt: now,
          });
        }
      });

      await callLocationComplete(t, { kind: 'success' });

      expect(await scheduledChainDispatches(t)).toHaveLength(0);
      const subject = await t.run((ctx) =>
        ctx.db
          .query('syncSubjects')
          .withIndex('by_user_dataset', (q) =>
            q.eq('userId', USER).eq('dataset', 'characterLocation'),
          )
          .unique(),
      );
      expect(typeof subject?.nextDueAt).toBe('number');
    }
  });

  it('keys the rate limiter per subject for characterLocation', async () => {
    const t = convexTest(schema, modules);
    const now = Date.now();
    const limit = vi
      .spyOn(RateLimiter.prototype, 'limit')
      .mockResolvedValue({ ok: true, retryAfter: 0 } as never);
    await t.run(async (ctx) => {
      await ctx.db.insert('syncSubjects', subjectRow({
        dataset: 'characterLocation',
        nextDueAt: now - 1000,
        syncedCharacterIds: [101],
      }));
      await ctx.db.insert('syncPresence', {
        dataset: 'characterLocation',
        userId: USER,
        lastSeenAt: now,
      });
    });

    await t.mutation(internal.engineScan.scan, {});

    expect(limit).toHaveBeenCalledWith(
      expect.anything(),
      'syncDispatch',
      { key: `char-location:${USER}` },
    );
  });
});

describe('engine.sweep', () => {
  it('deletes, retires, and reaps without dispatching', async () => {
    const t = convexTest(schema, modules);
    const now = Date.now();
    await t.run(async (ctx) => {
      await ctx.db.insert('syncSubjects', subjectRow({ userId: 'u1', nextDueAt: now - 1000 }));
      await ctx.db.insert('syncSubjects', subjectRow({ userId: 'u2', nextDueAt: now - 1000 }));
      await ctx.db.insert('syncPresence', {
        dataset: 'characterLocation',
        userId: 'u2',
        lastSeenAt: now - SYNC_DATASET_CONFIG.characterLocation.coldAfterMs - 5000,
      });
      await ctx.db.insert('syncSubjects', subjectRow({ userId: 'u3', nextDueAt: null }));
      await ctx.db.insert('syncPresence', {
        dataset: 'characterLocation',
        userId: 'u3',
        lastSeenAt: now - RETENTION_MS - 5000,
      });
      await ctx.db.insert('syncSubjects', subjectRow({ userId: 'u5', nextDueAt: null }));
      await ctx.db.insert('syncPresence', { dataset: 'characterLocation', userId: 'u5', lastSeenAt: now - 1000 });
    });

    const counts = await t.mutation(internal.engineSweep.sweep, {});
    expect(counts).toEqual({ dispatched: 0, retired: 1, deleted: 2 });

    const remaining = await t.run(async (ctx) =>
      (await ctx.db.query('syncSubjects').collect()).map((s) => s.userId).sort(),
    );
    expect(remaining).toEqual(['u2', 'u5']);
  });

  it('does not count a rate-limited dispatch toward the watchdog signal', async () => {
    const t = convexTest(schema, modules);
    const now = Date.now();
    await t.run(async (ctx) => {
      await ctx.db.insert(
        'syncSubjects',
        subjectRow({ userId: 'u1', nextDueAt: now - 1000, syncedCharacterIds: [101] }),
      );
      await ctx.db.insert('syncPresence', { dataset: 'characterLocation', userId: 'u1', lastSeenAt: now });
    });
    vi.spyOn(RateLimiter.prototype, 'limit').mockResolvedValue({ ok: false, retryAfter: 1000 });

    const counts = await t.mutation(internal.engineSweep.sweep, {});

    expect(counts.dispatched).toBe(0);

    const subject = await t.run((ctx) =>
      ctx.db
        .query('syncSubjects')
        .withIndex('by_user_dataset', (q) => q.eq('userId', 'u1').eq('dataset', 'characterLocation'))
        .unique(),
    );
    expect(subject?.nextDueAt).toBeGreaterThanOrEqual(now + 1000);
  });

  it('caps Pass A and drains overdue deletions across runs', async () => {
    const t = convexTest(schema, modules);
    const now = Date.now();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const total = SCAN_DISPATCH_BATCH + 1;
    await t.run(async (ctx) => {
      for (let i = 0; i < total; i++) {
        await ctx.db.insert('syncSubjects', subjectRow({ userId: `u${i}`, nextDueAt: now - total + i }));
      }
    });

    const run1 = await t.mutation(internal.engineSweep.sweep, {});
    expect(run1.deleted).toBe(SCAN_DISPATCH_BATCH);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]![0]).toContain('overdue_batch_capped');
    const remaining1 = await t.run((ctx) => ctx.db.query('syncSubjects').collect());
    expect(remaining1).toHaveLength(1);

    const run2 = await t.mutation(internal.engineSweep.sweep, {});
    expect(run2.deleted).toBe(1);
    const remaining2 = await t.run((ctx) => ctx.db.query('syncSubjects').collect());
    expect(remaining2).toHaveLength(0);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it("caps Pass B's hot-set read and logs without dispatching", async () => {
    const t = convexTest(schema, modules);
    const now = Date.now();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const total = SCAN_DISPATCH_BATCH + 1;
    await t.run(async (ctx) => {
      for (let i = 0; i < total; i++) {
        await ctx.db.insert('syncSubjects', subjectRow({
          userId: `u${i}`,
          nextDueAt: null,
          syncedCharacterIds: [],
        }));
        await ctx.db.insert('syncPresence', { dataset: 'characterLocation', userId: `u${i}`, lastSeenAt: now - 1000 });
      }
    });

    const counts = await t.mutation(internal.engineSweep.sweep, {});
    expect(counts.dispatched).toBe(0);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]![0]).toContain('dropped_batch_capped');
  });

  it('Pass B re-arms only rows hot for their own dataset window', async () => {
    const t = convexTest(schema, modules);
    const now = Date.now();
    stubDispatch();
    const lastSeenAt = now - 2 * 60_000;
    await t.run(async (ctx) => {
      await ctx.db.insert('syncSubjects', subjectRow({
        userId: 'u-live', nextDueAt: null, syncedCharacterIds: [101], minExpiresAt: now - 1000,
      }));
      await ctx.db.insert('syncPresence', { dataset: 'characterLocation', userId: 'u-live', lastSeenAt });
      await ctx.db.insert('syncSubjects', subjectRow({
        dataset: 'onlineStatus', userId: 'u-retired', nextDueAt: null,
        syncedCharacterIds: [101], minExpiresAt: now - 1000,
      }));
      await ctx.db.insert('syncPresence', { dataset: 'onlineStatus', userId: 'u-retired', lastSeenAt });
    });

    const counts = await t.mutation(internal.engineSweep.sweep, {});

    expect(counts.dispatched).toBe(1);
    const byDataset = await t.run(async (ctx) => {
      const rows = await ctx.db.query('syncSubjects').collect();
      return Object.fromEntries(rows.map((row) => [row.dataset, row]));
    });
    expect(byDataset.characterLocation?.status).toBe('running');
    expect(byDataset.onlineStatus).toBeUndefined();
  });

  it('Pass D drains retired-dataset leftovers and the characterOnline table', async () => {
    const t = convexTest(schema, modules);
    const now = Date.now();
    await t.run(async (ctx) => {
      await ctx.db.insert('syncSubjects', subjectRow({
        dataset: 'onlineStatus', userId: 'u-old', nextDueAt: null,
      }));
      await ctx.db.insert('syncPresence', { dataset: 'onlineStatus', userId: 'u-old', lastSeenAt: now });
      await ctx.db.insert('characterOnline', {
        userId: 'u-old', characterId: 101, online: true, etag: 'e1',
      });
      await ctx.db.insert('syncSubjects', subjectRow({ userId: 'u-live', nextDueAt: null }));
      await ctx.db.insert('syncPresence', { dataset: 'characterLocation', userId: 'u-live', lastSeenAt: now });
    });

    await t.mutation(internal.engineSweep.sweep, {});

    const { subjects, presence, online } = await t.run(async (ctx) => ({
      subjects: await ctx.db.query('syncSubjects').collect(),
      presence: await ctx.db.query('syncPresence').collect(),
      online: await ctx.db.query('characterOnline').collect(),
    }));
    expect(subjects.map((row) => row.dataset)).toEqual(['characterLocation']);
    expect(presence.map((row) => row.dataset)).toEqual(['characterLocation']);
    expect(online).toEqual([]);
  });
});
