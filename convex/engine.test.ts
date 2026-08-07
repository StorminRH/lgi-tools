// @vitest-environment edge-runtime
import { RateLimiter } from '@convex-dev/rate-limiter';
import { Workpool } from '@convex-dev/workpool';
import { convexTest } from 'convex-test';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  computeChainBoundary,
  HIDDEN_PRESENCE_MAX_MS,
  RETENTION_MS,
  SYNC_DATASET_CONFIG,
} from '@/lib/sync-engine';
import { api, internal } from './_generated/api';
import { SCAN_DISPATCH_BATCH } from './engine';
import schema from './schema';

// Make the dispatch path inert in convex-test: the rate limiter always admits and
// the workpool enqueue returns a fake workId, so a dispatched subject just flips
// to 'running' without touching the real components (same posture as the existing
// rate-limited-dispatch sweep test, which mocks the limiter to refuse).
function stubDispatch() {
  vi.spyOn(RateLimiter.prototype, 'limit').mockResolvedValue({ ok: true, retryAfter: 0 } as never);
  vi.spyOn(Workpool.prototype, 'enqueueAction').mockResolvedValue('w-test' as never);
}

async function scheduledChainDispatches(t: ReturnType<typeof convexTest>) {
  return t.run(async (ctx) => {
    const rows = await ctx.db.system.query('_scheduled_functions').collect();
    return rows.filter((row) => row.name.includes('chainDispatch'));
  });
}

const modules = import.meta.glob(['./**/*.ts', '!./**/*.test.ts']);

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
    // A hidden tab suspended past the cold window: the scan retired the
    // subject (nextDueAt null) and beats resumed with the tab still hidden —
    // no visible beat is coming. The first beat after the gap must not stop
    // at the presence write or tracking silently stalls until Pass B's cron.
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
    // The stored union still accepts the literal, but even a presence write
    // would keep drain-GC rows alive — nothing may be written.
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
    // First beat inserts — a fresh tab gets a fresh visibility budget.
    await authed.mutation(api.engine.heartbeat, {
      dataset: 'characterLocation', characterIdsHint: [], reason: 'mount', visible: false,
    });
    const inserted = await t.run((ctx) => ctx.db.query('syncPresence').unique());
    expect(typeof inserted?.lastVisibleAt).toBe('number');

    // Pin both stamps to a known past instant, then beat hidden: only
    // lastSeenAt may advance.
    await t.run((ctx) => ctx.db.patch(inserted!._id, { lastSeenAt: 123, lastVisibleAt: 123 }));
    await authed.mutation(api.engine.heartbeat, {
      dataset: 'characterLocation', characterIdsHint: [], reason: 'interval', visible: false,
    });
    const afterHidden = await t.run((ctx) => ctx.db.query('syncPresence').unique());
    expect(afterHidden?.lastSeenAt).toBeGreaterThan(123);
    expect(afterHidden?.lastVisibleAt).toBe(123);

    // A beat WITHOUT the arg is a pre-field client, which only ever beat while
    // visible — it must refresh the visibility stamp.
    await authed.mutation(api.engine.heartbeat, {
      dataset: 'characterLocation', characterIdsHint: [], reason: 'interval',
    });
    const afterLegacy = await t.run((ctx) => ctx.db.query('syncPresence').unique());
    expect(afterLegacy?.lastVisibleAt).toBeGreaterThan(123);
  });
});

describe('engine.scan', () => {
  it('keeps a hidden-throttled subject hot inside the widened cold window', async () => {
    const t = convexTest(schema, modules);
    const now = Date.now();
    stubDispatch();
    // 2 min without a beat — cold under the old 60s visible-tab window, warm
    // under characterLocation's 5-min window (sized for ~1/min hidden beats).
    await t.run(async (ctx) => {
      await ctx.db.insert('syncSubjects', subjectRow({ nextDueAt: now - 1000, syncedCharacterIds: [101] }));
      await ctx.db.insert('syncPresence', {
        dataset: 'characterLocation', userId: USER, lastSeenAt: now - 2 * 60_000,
      });
    });

    await t.mutation(internal.engine.scan, {});

    const subject = await t.run((ctx) => ctx.db.query('syncSubjects').unique());
    expect(subject?.status).toBe('running');
  });

  it('retires a retired-dataset leftover row instead of dispatching it', async () => {
    const t = convexTest(schema, modules);
    const now = Date.now();
    stubDispatch();
    // A drain-window leftover: due, hot presence — and no registered syncRef.
    await t.run(async (ctx) => {
      await ctx.db.insert('syncSubjects', subjectRow({
        dataset: 'onlineStatus', nextDueAt: now - 1000, syncedCharacterIds: [101],
      }));
      await ctx.db.insert('syncPresence', { dataset: 'onlineStatus', userId: USER, lastSeenAt: now });
    });

    await t.mutation(internal.engine.scan, {});

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
      // Beats still arriving (hidden tab), but no visible beat inside the cap.
      await ctx.db.insert('syncPresence', {
        dataset: 'characterLocation',
        userId: USER,
        lastSeenAt: now,
        lastVisibleAt: now - HIDDEN_PRESENCE_MAX_MS - 1,
      });
    });

    await t.mutation(internal.engine.scan, {});

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
    });
    await t.mutation(internal.engine.scan, {});
    const subject = await t.run((ctx) =>
      ctx.db
        .query('syncSubjects')
        .withIndex('by_user_dataset', (q) => q.eq('userId', USER).eq('dataset', 'characterLocation'))
        .unique(),
    );
    expect(subject?.nextDueAt).toBeNull();
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
    await t.mutation(internal.engine.scan, {});
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

    await t.mutation(internal.engine.scan, {});

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
        // Distinct, all-past nextDueAt so the by_next_due take order is
        // deterministic: the oldest SCAN_DISPATCH_BATCH dispatch first.
        await ctx.db.insert('syncSubjects', subjectRow({
          userId: `u${i}`,
          nextDueAt: now - total + i,
          syncedCharacterIds: [101],
        }));
        await ctx.db.insert('syncPresence', { dataset: 'characterLocation', userId: `u${i}`, lastSeenAt: now });
      }
    });

    await t.mutation(internal.engine.scan, {});
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

    await t.mutation(internal.engine.scan, {});
    const tick2Running = await t.run(async (ctx) =>
      (await ctx.db.query('syncSubjects').collect()).filter((s) => s.status === 'running').length,
    );
    expect(tick2Running).toBe(total);
    expect(warn).toHaveBeenCalledTimes(1); // the sub-cap second tick logs nothing
  });
});

describe('engine.onSyncComplete', () => {
  function callComplete(t: ReturnType<typeof convexTest>, result: unknown, workId = 'w1') {
    return t.mutation(internal.engine.onSyncComplete, {
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

    await callComplete(t, { kind: 'success', returnValue: null });

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

    await callComplete(t, { kind: 'success', returnValue: null });

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

    await callComplete(t, { kind: 'success', returnValue: null }, 'stale-work');

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
    return t.mutation(internal.engine.onSyncComplete, {
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

    await callLocationComplete(t, { kind: 'success', returnValue: null });

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

    await t.finishAllScheduledFunctions(() => vi.runAllTimers());

    const afterHop = await t.run((ctx) =>
      ctx.db
        .query('syncSubjects')
        .withIndex('by_user_dataset', (q) => q.eq('userId', USER).eq('dataset', 'characterLocation'))
        .unique(),
    );
    expect(afterHop?.status).toBe('running');
    expect(afterHop?.workId).toBe('w-test');
    // dispatch parks nextDueAt one cadence floor out — the next hop's arm.
    expect(afterHop?.nextDueAt).toBe(Date.now() + 5_000);
  });

  it('never chains a failed completion', async () => {
    const t = convexTest(schema, modules);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const now = Date.now();
    await t.run(async (ctx) => {
      await ctx.db.insert('syncSubjects', subjectRow({
        dataset: 'characterLocation',
        status: 'running',
        lastRequestedAt: now,
        workId: 'w1',
        minExpiresAt: now + 5_000,
        syncedCharacterIds: [101],
        // Covered set present so the FAILURE is the only reason not to chain.
        coveredCharacterIds: [101],
      }));
      await ctx.db.insert('syncPresence', {
        dataset: 'characterLocation',
        userId: USER,
        lastSeenAt: now,
      });
    });

    await callLocationComplete(t, { kind: 'failed', error: 'boom' });

    expect(await scheduledChainDispatches(t)).toHaveLength(0);
    const subject = await t.run((ctx) =>
      ctx.db
        .query('syncSubjects')
        .withIndex('by_user_dataset', (q) => q.eq('userId', USER).eq('dataset', 'characterLocation'))
        .unique(),
    );
    expect(subject?.status).toBe('idle');
    expect(typeof subject?.nextDueAt).toBe('number');
    expect(subject?.lastError?.startsWith('sync_failed:')).toBe(true);
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
        // Covered set present so COLD PRESENCE is the only reason not to chain.
        coveredCharacterIds: [101],
      }));
      // Presence older than the dataset's cold window — completion must not chain.
      await ctx.db.insert('syncPresence', {
        dataset: 'characterLocation',
        userId: USER,
        lastSeenAt: now - SYNC_DATASET_CONFIG.characterLocation.coldAfterMs - 1,
      });
    });

    await callLocationComplete(t, { kind: 'success', returnValue: null });

    expect(await scheduledChainDispatches(t)).toHaveLength(0);
    const subject = await t.run((ctx) =>
      ctx.db
        .query('syncSubjects')
        .withIndex('by_user_dataset', (q) => q.eq('userId', USER).eq('dataset', 'characterLocation'))
        .unique(),
    );
    // Cold success still re-arms onto the scan (jittered), never schedules a hop.
    expect(typeof subject?.nextDueAt).toBe('number');
  });

  it('never chains a poisoned (null-window) completion — the 5s floor is unreachable', async () => {
    // One errored character null-poisons minCacheWindow while another's clean
    // location keeps the run yielded; chaining would collapse the boundary to
    // the cadence floor and hammer the partly-broken roster at 5s. The run
    // must fall to the jittered scan re-arm instead.
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

    await callLocationComplete(t, { kind: 'success', returnValue: null });

    expect(await scheduledChainDispatches(t)).toHaveLength(0);
    const subject = await t.run((ctx) => ctx.db.query('syncSubjects').unique());
    expect(typeof subject?.nextDueAt).toBe('number');
  });

  it('never chains a zero-yield success (empty covered set or run-level error)', async () => {
    // A "success" that observed nothing cleanly — budget stop, all-reauth
    // roster — must fall back to the jittered scan re-arm, not hammer a
    // protective state at the 5s floor.
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

      await callLocationComplete(t, { kind: 'success', returnValue: null });

      expect(await scheduledChainDispatches(t)).toHaveLength(0);
      const subject = await t.run((ctx) =>
        ctx.db
          .query('syncSubjects')
          .withIndex('by_user_dataset', (q) =>
            q.eq('userId', USER).eq('dataset', 'characterLocation'),
          )
          .unique(),
      );
      // Still re-arms onto the scan set (the retry owner), just without a hop.
      expect(typeof subject?.nextDueAt).toBe('number');
    }
  });

  it('keys the rate limiter per subject for characterLocation', async () => {
    const t = convexTest(schema, modules);
    const now = Date.now();
    const limit = vi
      .spyOn(RateLimiter.prototype, 'limit')
      .mockResolvedValue({ ok: true, retryAfter: 0 } as never);
    vi.spyOn(Workpool.prototype, 'enqueueAction').mockResolvedValue('w-test' as never);
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

    await t.mutation(internal.engine.scan, {});

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
      // S1 — overdue, no presence → delete.
      await ctx.db.insert('syncSubjects', subjectRow({ userId: 'u1', nextDueAt: now - 1000 }));
      // S2 — overdue, cold-within-retention presence → retire.
      await ctx.db.insert('syncSubjects', subjectRow({ userId: 'u2', nextDueAt: now - 1000 }));
      await ctx.db.insert('syncPresence', {
        dataset: 'characterLocation',
        userId: 'u2',
        lastSeenAt: now - SYNC_DATASET_CONFIG.characterLocation.coldAfterMs - 5000,
      });
      // S3 — past-retention presence, not due → reaped in Pass C.
      await ctx.db.insert('syncSubjects', subjectRow({ userId: 'u3', nextDueAt: null }));
      await ctx.db.insert('syncPresence', {
        dataset: 'characterLocation',
        userId: 'u3',
        lastSeenAt: now - RETENTION_MS - 5000,
      });
      // S5 — hot presence, idle, no target → Pass B touches it, no dispatch.
      await ctx.db.insert('syncSubjects', subjectRow({ userId: 'u5', nextDueAt: null }));
      await ctx.db.insert('syncPresence', { dataset: 'characterLocation', userId: 'u5', lastSeenAt: now - 1000 });
    });

    const counts = await t.mutation(internal.engine.sweep, {});
    expect(counts).toEqual({ dispatched: 0, retired: 1, deleted: 2 });

    const remaining = await t.run(async (ctx) =>
      (await ctx.db.query('syncSubjects').collect()).map((s) => s.userId).sort(),
    );
    // u1 deleted (Pass A), u3 deleted (Pass C); u2 retired, u5 untouched remain.
    expect(remaining).toEqual(['u2', 'u5']);
  });

  it('does not count a rate-limited dispatch toward the watchdog signal', async () => {
    const t = convexTest(schema, modules);
    const now = Date.now();
    // A hot, overdue, idle subject classifies as 'dispatch' in Pass A.
    await t.run(async (ctx) => {
      await ctx.db.insert(
        'syncSubjects',
        subjectRow({ userId: 'u1', nextDueAt: now - 1000, syncedCharacterIds: [101] }),
      );
      await ctx.db.insert('syncPresence', { dataset: 'characterLocation', userId: 'u1', lastSeenAt: now });
    });
    // Force the per-token-group limiter to refuse: dispatch parks the row and
    // returns without enqueuing (so this never touches the workpool).
    vi.spyOn(RateLimiter.prototype, 'limit').mockResolvedValue({ ok: false, retryAfter: 1000 });

    const counts = await t.mutation(internal.engine.sweep, {});

    // The refused dispatch must NOT inflate `dispatched` — that count is the
    // sync-sweeper cron's "is the 30s scan dead?" alarm.
    expect(counts.dispatched).toBe(0);

    // ...and the subject was re-parked retryAfter out (the mutation stamps its
    // own Date.now() ≥ the test's, so assert against the retryAfter floor),
    // proving the rate-limited branch ran rather than enqueuing.
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
        // Overdue with NO presence → classifyDueSubject(null,…) === 'delete'.
        await ctx.db.insert('syncSubjects', subjectRow({ userId: `u${i}`, nextDueAt: now - total + i }));
      }
    });

    const run1 = await t.mutation(internal.engine.sweep, {});
    expect(run1.deleted).toBe(SCAN_DISPATCH_BATCH);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]![0]).toContain('overdue_batch_capped');
    const remaining1 = await t.run((ctx) => ctx.db.query('syncSubjects').collect());
    expect(remaining1).toHaveLength(1);

    const run2 = await t.mutation(internal.engine.sweep, {});
    expect(run2.deleted).toBe(1);
    const remaining2 = await t.run((ctx) => ctx.db.query('syncSubjects').collect());
    expect(remaining2).toHaveLength(0);
    expect(warn).toHaveBeenCalledTimes(1); // the sub-cap second run logs nothing
  });

  it("caps Pass B's hot-set read and logs without dispatching", async () => {
    const t = convexTest(schema, modules);
    const now = Date.now();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const total = SCAN_DISPATCH_BATCH + 1;
    await t.run(async (ctx) => {
      for (let i = 0; i < total; i++) {
        // Hot presence + an idle, no-target, unscheduled subject: Pass B reads it
        // but hasSyncTarget is false, so it skips dispatch — exercising the read
        // cap, not the dispatch path. (Pass A skips these: nextDueAt is null.)
        await ctx.db.insert('syncSubjects', subjectRow({
          userId: `u${i}`,
          nextDueAt: null,
          syncedCharacterIds: [],
        }));
        await ctx.db.insert('syncPresence', { dataset: 'characterLocation', userId: `u${i}`, lastSeenAt: now - 1000 });
      }
    });

    const counts = await t.mutation(internal.engine.sweep, {});
    expect(counts.dispatched).toBe(0);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]![0]).toContain('dropped_batch_capped');
  });

  it('Pass B re-arms only rows hot for their own dataset window', async () => {
    const t = convexTest(schema, modules);
    const now = Date.now();
    stubDispatch();
    // Both presences are hot and inside the widened index range, but only the
    // registered dataset's idle, unscheduled, lapsed-window subject re-arms —
    // the retired dataset's row is Pass D's to delete, never Pass B's to
    // dispatch. Distinct users so each (dataset × user) key stays unique.
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

    const counts = await t.mutation(internal.engine.sweep, {});

    expect(counts.dispatched).toBe(1);
    const byDataset = await t.run(async (ctx) => {
      const rows = await ctx.db.query('syncSubjects').collect();
      return Object.fromEntries(rows.map((row) => [row.dataset, row]));
    });
    expect(byDataset.characterLocation?.status).toBe('running');
    // The retired row was never dispatched; Pass D deleted it in the same sweep.
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
      // Live-dataset rows survive the drain untouched.
      await ctx.db.insert('syncSubjects', subjectRow({ userId: 'u-live', nextDueAt: null }));
      await ctx.db.insert('syncPresence', { dataset: 'characterLocation', userId: 'u-live', lastSeenAt: now });
    });

    await t.mutation(internal.engine.sweep, {});

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
