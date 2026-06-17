// @vitest-environment edge-runtime
import { convexTest } from 'convex-test';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { COLD_AFTER_MS, RETENTION_MS } from '@/lib/sync-engine';
import { api, internal } from './_generated/api';
import schema from './schema';

const modules = import.meta.glob(['./**/*.ts', '!./**/*.test.ts']);

const USER = 'user_engine_1';

function subjectRow(overrides: Record<string, unknown> = {}) {
  return {
    dataset: 'skills' as const,
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
    await t.mutation(api.engine.heartbeat, { dataset: 'skills', characterIdsHint: [], reason: 'mount' });
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
      .mutation(api.engine.heartbeat, { dataset: 'skills', characterIdsHint: [101], reason: 'interval' });
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
      .mutation(api.engine.heartbeat, { dataset: 'skills', characterIdsHint: [], reason: 'mount' });
    const subject = await t.run((ctx) =>
      ctx.db
        .query('syncSubjects')
        .withIndex('by_user_dataset', (q) => q.eq('userId', USER).eq('dataset', 'skills'))
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
      .mutation(api.engine.heartbeat, { dataset: 'skills', characterIdsHint: [101], reason: 'mount' });

    const subject = await t.run((ctx) =>
      ctx.db
        .query('syncSubjects')
        .withIndex('by_user_dataset', (q) => q.eq('userId', USER).eq('dataset', 'skills'))
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
      .mutation(api.engine.heartbeat, { dataset: 'skills', characterIdsHint: [101], reason: 'mount' });

    const subject = await t.run((ctx) =>
      ctx.db
        .query('syncSubjects')
        .withIndex('by_user_dataset', (q) => q.eq('userId', USER).eq('dataset', 'skills'))
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
        .withIndex('by_user_dataset', (q) => q.eq('userId', USER).eq('dataset', 'skills'))
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
      await ctx.db.insert('syncPresence', { dataset: 'skills', userId: USER, lastSeenAt: now });
    });
    await t.mutation(internal.engine.scan, {});
    const subject = await t.run((ctx) =>
      ctx.db
        .query('syncSubjects')
        .withIndex('by_user_dataset', (q) => q.eq('userId', USER).eq('dataset', 'skills'))
        .unique(),
    );
    expect(subject?.nextDueAt).toBe(now - 1000);
    expect(subject?.status).toBe('running');
  });
});

describe('engine.onSyncComplete', () => {
  function callComplete(t: ReturnType<typeof convexTest>, result: unknown, workId = 'w1') {
    return t.mutation(internal.engine.onSyncComplete, {
      workId: workId as never,
      context: { dataset: 'skills', userId: USER },
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
        .withIndex('by_user_dataset', (q) => q.eq('userId', USER).eq('dataset', 'skills'))
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
        .withIndex('by_user_dataset', (q) => q.eq('userId', USER).eq('dataset', 'skills'))
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
        .withIndex('by_user_dataset', (q) => q.eq('userId', USER).eq('dataset', 'skills'))
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
        .withIndex('by_user_dataset', (q) => q.eq('userId', USER).eq('dataset', 'skills'))
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
        dataset: 'skills',
        userId: 'u2',
        lastSeenAt: now - COLD_AFTER_MS - 5000,
      });
      // S3 — past-retention presence, not due → reaped in Pass C.
      await ctx.db.insert('syncSubjects', subjectRow({ userId: 'u3', nextDueAt: null }));
      await ctx.db.insert('syncPresence', {
        dataset: 'skills',
        userId: 'u3',
        lastSeenAt: now - RETENTION_MS - 5000,
      });
      // S5 — hot presence, idle, no target → Pass B touches it, no dispatch.
      await ctx.db.insert('syncSubjects', subjectRow({ userId: 'u5', nextDueAt: null }));
      await ctx.db.insert('syncPresence', { dataset: 'skills', userId: 'u5', lastSeenAt: now - 1000 });
    });

    const counts = await t.mutation(internal.engine.sweep, {});
    expect(counts).toEqual({ dispatched: 0, retired: 1, deleted: 2 });

    const remaining = await t.run(async (ctx) =>
      (await ctx.db.query('syncSubjects').collect()).map((s) => s.userId).sort(),
    );
    // u1 deleted (Pass A), u3 deleted (Pass C); u2 retired, u5 untouched remain.
    expect(remaining).toEqual(['u2', 'u5']);
  });
});
