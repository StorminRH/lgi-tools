// @vitest-environment edge-runtime
import { RateLimiter } from '@convex-dev/rate-limiter';
import { Workpool } from '@convex-dev/workpool';
import { convexTest } from 'convex-test';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { COLD_AFTER_MS, RETENTION_MS } from '@/lib/sync-engine';
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

const modules = import.meta.glob(['./**/*.ts', '!./**/*.test.ts']);

const USER = 'user_engine_1';

function subjectRow(overrides: Record<string, unknown> = {}) {
  return {
    dataset: 'industryJobs' as const,
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

afterEach(() => vi.restoreAllMocks());

describe('engine.heartbeat', () => {
  it('does nothing when signed out', async () => {
    const t = convexTest(schema, modules);
    await t.mutation(api.engine.heartbeat, { dataset: 'industryJobs', characterIdsHint: [], reason: 'mount' });
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
      .mutation(api.engine.heartbeat, { dataset: 'industryJobs', characterIdsHint: [101], reason: 'interval' });
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
      .mutation(api.engine.heartbeat, { dataset: 'industryJobs', characterIdsHint: [], reason: 'mount' });
    const subject = await t.run((ctx) =>
      ctx.db
        .query('syncSubjects')
        .withIndex('by_user_dataset', (q) => q.eq('userId', USER).eq('dataset', 'industryJobs'))
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
      .mutation(api.engine.heartbeat, { dataset: 'industryJobs', characterIdsHint: [101], reason: 'mount' });

    const subject = await t.run((ctx) =>
      ctx.db
        .query('syncSubjects')
        .withIndex('by_user_dataset', (q) => q.eq('userId', USER).eq('dataset', 'industryJobs'))
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
      .mutation(api.engine.heartbeat, { dataset: 'industryJobs', characterIdsHint: [101], reason: 'mount' });

    const subject = await t.run((ctx) =>
      ctx.db
        .query('syncSubjects')
        .withIndex('by_user_dataset', (q) => q.eq('userId', USER).eq('dataset', 'industryJobs'))
        .unique(),
    );
    expect(subject?.status).toBe('running');
    expect(subject?.workId).toBe('w1');
  });
});

describe('engine.scan', () => {
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
        .withIndex('by_user_dataset', (q) => q.eq('userId', USER).eq('dataset', 'industryJobs'))
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
      await ctx.db.insert('syncPresence', { dataset: 'industryJobs', userId: USER, lastSeenAt: now });
    });
    await t.mutation(internal.engine.scan, {});
    const subject = await t.run((ctx) =>
      ctx.db
        .query('syncSubjects')
        .withIndex('by_user_dataset', (q) => q.eq('userId', USER).eq('dataset', 'industryJobs'))
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
        await ctx.db.insert('syncPresence', { dataset: 'industryJobs', userId: `u${i}`, lastSeenAt: now });
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
        await ctx.db.insert('syncPresence', { dataset: 'industryJobs', userId: `u${i}`, lastSeenAt: now });
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
    expect(warn.mock.calls[0][0]).toContain('scan_batch_capped');

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
      context: { dataset: 'industryJobs', userId: USER },
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
        .withIndex('by_user_dataset', (q) => q.eq('userId', USER).eq('dataset', 'industryJobs'))
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
        .withIndex('by_user_dataset', (q) => q.eq('userId', USER).eq('dataset', 'industryJobs'))
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
        .withIndex('by_user_dataset', (q) => q.eq('userId', USER).eq('dataset', 'industryJobs'))
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
        .withIndex('by_user_dataset', (q) => q.eq('userId', USER).eq('dataset', 'industryJobs'))
        .unique(),
    );
    expect(subject?.status).toBe('running');
    expect(subject?.workId).toBe('w1');
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
        dataset: 'industryJobs',
        userId: 'u2',
        lastSeenAt: now - COLD_AFTER_MS - 5000,
      });
      // S3 — past-retention presence, not due → reaped in Pass C.
      await ctx.db.insert('syncSubjects', subjectRow({ userId: 'u3', nextDueAt: null }));
      await ctx.db.insert('syncPresence', {
        dataset: 'industryJobs',
        userId: 'u3',
        lastSeenAt: now - RETENTION_MS - 5000,
      });
      // S5 — hot presence, idle, no target → Pass B touches it, no dispatch.
      await ctx.db.insert('syncSubjects', subjectRow({ userId: 'u5', nextDueAt: null }));
      await ctx.db.insert('syncPresence', { dataset: 'industryJobs', userId: 'u5', lastSeenAt: now - 1000 });
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
      await ctx.db.insert('syncPresence', { dataset: 'industryJobs', userId: 'u1', lastSeenAt: now });
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
        .withIndex('by_user_dataset', (q) => q.eq('userId', 'u1').eq('dataset', 'industryJobs'))
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
    expect(warn.mock.calls[0][0]).toContain('overdue_batch_capped');
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
        await ctx.db.insert('syncPresence', { dataset: 'industryJobs', userId: `u${i}`, lastSeenAt: now - 1000 });
      }
    });

    const counts = await t.mutation(internal.engine.sweep, {});
    expect(counts.dispatched).toBe(0);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain('dropped_batch_capped');
  });
});

describe('retired-dataset guard (skills after MIGRATE.B.1)', () => {
  // Skills left the engine but keeps a dormant schema literal, so a leftover subject
  // row can still carry dataset:'skills' until the session-D wipe. Its syncRef was
  // deleted, so the engine must RETIRE such an orphaned subject, never dispatch it —
  // else a hot+due row in the post-deploy window would index a missing SYNC_REFS entry
  // and crash the shared scan for the live trackers. These two cases are that proof.
  it('retires a hot, due, idle subject for a retired dataset instead of dispatching', async () => {
    const t = convexTest(schema, modules);
    const now = Date.now();
    // Would flip the row to 'running' IF it dispatched — the guard must prevent that.
    stubDispatch();
    await t.run(async (ctx) => {
      await ctx.db.insert(
        'syncSubjects',
        subjectRow({ dataset: 'skills' as const, userId: 'u1', nextDueAt: now - 1000, syncedCharacterIds: [101] }),
      );
      await ctx.db.insert('syncPresence', { dataset: 'skills', userId: 'u1', lastSeenAt: now });
    });

    await t.mutation(internal.engine.scan, {});

    const subject = await t.run((ctx) =>
      ctx.db
        .query('syncSubjects')
        .withIndex('by_user_dataset', (q) => q.eq('userId', 'u1').eq('dataset', 'skills'))
        .unique(),
    );
    expect(subject?.status).toBe('idle'); // not dispatched
    expect(subject?.nextDueAt).toBeNull(); // retired from the scan set
  });

  it('no-ops onSyncComplete for a retired dataset (an in-flight run finishing post-deploy)', async () => {
    const t = convexTest(schema, modules);
    const now = Date.now();
    await t.run(async (ctx) => {
      await ctx.db.insert(
        'syncSubjects',
        subjectRow({
          dataset: 'skills' as const,
          userId: 'u1',
          status: 'running',
          lastRequestedAt: now,
          workId: 'w1',
          nextDueAt: now + 60_000,
        }),
      );
    });

    await t.mutation(internal.engine.onSyncComplete, {
      workId: 'w1' as never,
      context: { dataset: 'skills', userId: 'u1' },
      result: { kind: 'success', returnValue: null } as never,
    });

    const subject = await t.run((ctx) =>
      ctx.db
        .query('syncSubjects')
        .withIndex('by_user_dataset', (q) => q.eq('userId', 'u1').eq('dataset', 'skills'))
        .unique(),
    );
    // Untouched — the guard returned before re-arming.
    expect(subject?.status).toBe('running');
    expect(subject?.workId).toBe('w1');
  });
});
