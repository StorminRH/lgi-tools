// @vitest-environment edge-runtime
import { convexTest, type TestConvex } from 'convex-test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  HIDDEN_PRESENCE_MAX_MS,
  isColdFromPresence,
  LOCATION_CADENCE_FLOOR_MS,
  LOCATION_COLD_AFTER_MS,
  RETENTION_MS,
  SYNC_JITTER_MS,
} from '@/lib/sync-engine';
import { api, internal } from './_generated/api';
import type { Doc, Id } from './_generated/dataModel';
import schema from './schema';
import { modules } from './__tests__/modules.setup';

type T = TestConvex<typeof schema>;
type JobId = Id<'_scheduled_functions'>;

async function scheduledFunctionsNamed(t: T, name: string) {
  return t.run(async (ctx) => {
    const rows = await ctx.db.system.query('_scheduled_functions').collect();
    return rows.filter((row) => row.name.includes(name));
  });
}

async function scheduledSyncUsers(t: T) {
  return scheduledFunctionsNamed(t, 'syncUser');
}

async function pendingSyncUsers(t: T) {
  return (await scheduledSyncUsers(t)).filter((job) => job.state.kind === 'pending');
}

function jobById(t: T, id: JobId) {
  return t.run((ctx) => ctx.db.system.get('_scheduled_functions', id));
}

const USER = 'user_engine_1';
const CHAR = 101;

function beat(args: {
  characterIdsHint: number[];
  reason: 'mount' | 'visible' | 'interval';
  visible?: boolean;
  tabId?: string;
  expectedUserId?: string;
}) {
  return {
    dataset: 'characterLocation' as const,
    visible: true,
    tabId: 'tab-one',
    expectedUserId: USER,
    ...args,
  };
}

function heartbeat(t: T, args: Parameters<typeof beat>[0]) {
  return t.withIdentity({ subject: USER }).mutation(api.engine.heartbeat, beat(args));
}

function stateRow(overrides: Partial<Doc<'locationSync'>> = {}) {
  return {
    userId: USER,
    runId: 0,
    jobId: null,
    minExpiresAt: null,
    syncedCharacterIds: [] as number[],
    coveredCharacterIds: [] as number[],
    lastFinishedAt: null,
    ...overrides,
  };
}

async function seedState(t: T, overrides: Partial<Doc<'locationSync'>> = {}) {
  await t.run(async (ctx) => {
    await ctx.db.insert('locationSync', stateRow(overrides));
  });
}

function readState(t: T, userId = USER) {
  return t.run((ctx) =>
    ctx.db
      .query('locationSync')
      .withIndex('by_user', (q) => q.eq('userId', userId))
      .unique(),
  );
}

async function seedPresence(t: T, overrides: Partial<Doc<'syncPresence'>> = {}) {
  const now = Date.now();
  await t.run(async (ctx) => {
    await ctx.db.insert('syncPresence', {
      dataset: 'characterLocation',
      userId: USER,
      lastSeenAt: now,
      lastVisibleAt: now,
      tabId: 'tab-one',
      leftTabId: '',
      ...overrides,
    });
  });
}

// Warm, but past the 45s presence-refresh window, so an interval beat is not skipped.
function warmPresence() {
  const at = Date.now() - 50_000;
  return { lastSeenAt: at, lastVisibleAt: at };
}

function coldPresence() {
  const at = Date.now() - LOCATION_COLD_AFTER_MS - 60_000;
  return { lastSeenAt: at, lastVisibleAt: at };
}

async function seedTracking(t: T, characterId = CHAR) {
  await t.run(async (ctx) => {
    await ctx.db.insert('mapTracking', { mapId: 'map-a', userId: USER, characterId });
  });
}

/** A pending syncUser job carrying `generation`, as the scheduler would leave it. */
function schedulePending(t: T, at: number, generation: number) {
  return t.run((ctx) =>
    ctx.scheduler.runAt(at, internal.characterLocationSync.syncUser, { userId: USER, generation, schedulerVersion: 2 }),
  );
}

/**
 * A finished job row in each terminal state runState reads as 'none'.
 * Scheduled-function rows are read-only from t.run, so the row is driven
 * there: canceled via scheduler.cancel; success by running a syncUser whose
 * generation owns nothing (no tracking, so it never calls out); failed by
 * running one whose args fail validation (convex-test only validates at run
 * time).
 */
async function terminalJob(t: T, kind: 'canceled' | 'success' | 'failed'): Promise<JobId> {
  const now = Date.now();
  if (kind === 'canceled') {
    return t.run(async (ctx) => {
      const id = await ctx.scheduler.runAt(now, internal.characterLocationSync.syncUser, {
        userId: USER,
        generation: -1,
        schedulerVersion: 2,
      });
      await ctx.scheduler.cancel(id);
      return id;
    });
  }
  vi.stubEnv('SITE_URL', 'https://app.test');
  vi.stubEnv('CONVEX_SERVICE_SECRET', 'secret');
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  const args = kind === 'success' ? { userId: USER, generation: -1, schedulerVersion: 2 as const } : ({ userId: USER } as never);
  const id = await t.run((ctx) =>
    ctx.scheduler.runAt(now, internal.characterLocationSync.syncUser, args),
  );
  vi.advanceTimersByTime(0);
  await t.finishInProgressScheduledFunctions();
  expect((await jobById(t, id))?.state.kind).toBe(kind);
  return id;
}

type CharacterResult = {
  characterId: number;
  expiresAt: number | null;
  error: string | null;
  solarSystemId: number | null;
  stationId: number | null;
  structureId: number | null;
  shipTypeId: number | null;
  systemChanged: boolean;
  etagLocation: string | null;
  etagShip: string | null;
  online: boolean | null;
  etagOnline: string | null;
  onlineExpiresAt: number | null;
};

function onlineResult(characterId: number, expiresAt: number): CharacterResult {
  return {
    characterId,
    expiresAt,
    error: null,
    solarSystemId: 30_000_142,
    stationId: null,
    structureId: null,
    shipTypeId: 670,
    systemChanged: true,
    etagLocation: 'loc',
    etagShip: 'ship',
    online: true,
    etagOnline: 'on',
    onlineExpiresAt: expiresAt + 55_000,
  };
}

function offlineResult(characterId: number, expiresAt: number): CharacterResult {
  return {
    ...onlineResult(characterId, expiresAt),
    solarSystemId: null,
    shipTypeId: null,
    systemChanged: false,
    online: false,
    onlineExpiresAt: expiresAt,
  };
}

function success(
  trackedCharacterIds: number[],
  results: CharacterResult[],
  runError: string | null = null,
) {
  return {
    kind: 'success' as const,
    trackedCharacterIds,
    results,
    runError,
    rlGroup: null,
    rlRemaining: null,
  };
}

function finish(
  t: T,
  generation: number,
  outcome: ReturnType<typeof success> | { kind: 'failed'; error: string },
  leases: Array<{ characterId: number; accessToken: string; expiresAt: number }> = [],
  clearedLeaseCharacterIds: number[] = [],
) {
  return t.mutation(internal.characterLocationApply.finishSync, {
    userId: USER,
    generation,
    outcome,
    leases,
    clearedLeaseCharacterIds,
  });
}

// Legacy scan-engine rows the retention sweep drains.
function legacySubjectRow(overrides: Record<string, unknown> = {}) {
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

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-08-04T12:00:00.000Z'));
});

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('engine.heartbeat', () => {
  it('does nothing when signed out', async () => {
    const t = convexTest(schema, modules);
    await t.mutation(api.engine.heartbeat, beat({ characterIdsHint: [CHAR], reason: 'mount' }));
    const { presence, state } = await t.run(async (ctx) => ({
      presence: await ctx.db.query('syncPresence').collect(),
      state: await ctx.db.query('locationSync').collect(),
    }));
    expect(presence).toHaveLength(0);
    expect(state).toHaveLength(0);
    expect(await scheduledSyncUsers(t)).toHaveLength(0);
  });

  it('a mount beat with no target creates the sync state and schedules nothing', async () => {
    const t = convexTest(schema, modules);
    await heartbeat(t, { characterIdsHint: [], reason: 'mount' });
    expect(await readState(t)).toMatchObject(stateRow());
    expect(await scheduledSyncUsers(t)).toHaveLength(0);
  });

  it('a stale mount schedules a run now under a fresh generation', async () => {
    const t = convexTest(schema, modules);
    const now = Date.now();
    await heartbeat(t, { characterIdsHint: [CHAR], reason: 'mount' });

    const state = await readState(t);
    const jobs = await scheduledSyncUsers(t);
    expect(jobs).toHaveLength(1);
    expect(jobs[0]?.scheduledTime).toBe(now);
    expect(jobs[0]?.state.kind).toBe('pending');
    expect(state?.jobId).toBe(jobs[0]?._id);
    expect(state?.runId).toBe(now);
    expect(jobs[0]?.args).toEqual([{ userId: USER, generation: now, schedulerVersion: 2 }]);
  });

  it('a stale beat replaces a pending run: expired cache or a hinted pilot not yet synced', async () => {
    for (const reason of ['mount', 'visible'] as const) {
      for (const staleness of [
        { minExpiresAt: Date.now() - 1, hint: [CHAR] },
        { minExpiresAt: Date.now() + 600_000, hint: [CHAR, 102] },
      ]) {
        const t = convexTest(schema, modules);
        const now = Date.now();
        const oldJob = await schedulePending(t, now + 60_000, now - 10_000);
        await seedPresence(t);
        await seedState(t, {
          runId: now - 10_000,
          jobId: oldJob,
          minExpiresAt: staleness.minExpiresAt,
          syncedCharacterIds: [CHAR],
          lastFinishedAt: now - 1_000,
        });

        await heartbeat(t, { characterIdsHint: staleness.hint, reason });

        expect((await jobById(t, oldJob))?.state.kind).toBe('canceled');
        const pending = await pendingSyncUsers(t);
        expect(pending).toHaveLength(1);
        expect(pending[0]?.scheduledTime).toBe(now);
        const state = await readState(t);
        expect(state?.jobId).toBe(pending[0]?._id);
        expect(state?.runId).toBe(now);
      }
    }
  });

  it('a stale beat never schedules sooner than the cadence floor after the last run', async () => {
    for (const reason of ['mount', 'visible'] as const) {
      const t = convexTest(schema, modules);
      const now = Date.now();
      await seedPresence(t);
      // A hinted pilot that never syncs keeps the cache stale on every beat.
      await seedState(t, { syncedCharacterIds: [], lastRunAt: now - 1_000 });

      await heartbeat(t, { characterIdsHint: [CHAR, 999], reason });
      await heartbeat(t, { characterIdsHint: [CHAR, 998], reason });

      const pending = await pendingSyncUsers(t);
      expect(pending).toHaveLength(1);
      expect(pending[0]?.scheduledTime).toBe(now - 1_000 + LOCATION_CADENCE_FLOOR_MS);
    }
  });

  it('arms a fresh cache with nothing scheduled at the jittered next due time', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const t = convexTest(schema, modules);
    const now = Date.now();
    const minExpiresAt = now + 600_000;
    const lastFinishedAt = now - 1_000;
    await seedState(t, { minExpiresAt, syncedCharacterIds: [CHAR], lastFinishedAt });

    await heartbeat(t, { characterIdsHint: [CHAR], reason: 'mount' });

    const jobs = await scheduledSyncUsers(t);
    expect(jobs).toHaveLength(1);
    expect(jobs[0]?.scheduledTime).toBe(minExpiresAt + Math.floor(0.5 * SYNC_JITTER_MS));
    expect((await readState(t))?.jobId).toBe(jobs[0]?._id);
  });

  it('paces a fresh cache from its last finish, not from the beat', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const t = convexTest(schema, modules);
    const now = Date.now();
    // Cache expires before the floor after the last finish, so the floor decides.
    await seedState(t, {
      minExpiresAt: now + 1_000,
      syncedCharacterIds: [CHAR],
      lastFinishedAt: now - 2_000,
    });

    await heartbeat(t, { characterIdsHint: [CHAR], reason: 'mount' });

    const jobs = await scheduledSyncUsers(t);
    expect(jobs[0]?.scheduledTime).toBe(now - 2_000 + LOCATION_CADENCE_FLOOR_MS);
  });

  it('leaves a pending run alone when the cache is not stale', async () => {
    const t = convexTest(schema, modules);
    const now = Date.now();
    const job = await schedulePending(t, now + 30_000, now - 10_000);
    await seedState(t, {
      runId: now - 10_000,
      jobId: job,
      minExpiresAt: now + 30_000,
      syncedCharacterIds: [CHAR],
      lastFinishedAt: now - 1_000,
    });
    const before = await readState(t);

    await heartbeat(t, { characterIdsHint: [CHAR], reason: 'mount' });

    expect(await readState(t)).toEqual(before);
    const jobs = await scheduledSyncUsers(t);
    expect(jobs).toHaveLength(1);
    expect(jobs[0]?.state.kind).toBe('pending');
  });

  it('never touches an in-flight run, even when the cache reads stale', async () => {
    vi.stubEnv('SITE_URL', 'https://app.test');
    vi.stubEnv('CONVEX_SERVICE_SECRET', 'secret');
    let release: ((response: Response) => void) | undefined;
    let markStarted!: () => void;
    const started = new Promise<void>((resolve) => { markStarted = resolve; });
    const fetchFn = vi.fn(() => new Promise<Response>((resolve) => {
      release = resolve;
      markStarted();
    }));
    vi.stubGlobal('fetch', fetchFn);
    const t = convexTest(schema, modules);
    await seedTracking(t);

    await heartbeat(t, { characterIdsHint: [CHAR], reason: 'mount' });
    const [job] = await scheduledSyncUsers(t);
    // Start the run and hold it at the token vend so its job row reads inProgress.
    vi.advanceTimersByTime(0);
    await started;
    expect(fetchFn).toHaveBeenCalled();
    expect((await jobById(t, job!._id))?.state.kind).toBe('inProgress');
    const before = await readState(t);

    await heartbeat(t, { characterIdsHint: [CHAR, 102], reason: 'mount' });

    expect(await readState(t)).toEqual(before);
    expect(await scheduledSyncUsers(t)).toHaveLength(1);

    release?.(new Response(null, { status: 503 }));
    await t.finishInProgressScheduledFunctions();
    expect((await jobById(t, job!._id))?.state.kind).toBe('success');
    const after = await readState(t);
    expect(after?.lastFinishedAt).not.toBeNull();
    expect(after?.runId).toBeGreaterThan(before!.runId);
    expect(await pendingSyncUsers(t)).toHaveLength(1);
  });

  it('a warm interval beat is a safety net: it never moves a pending run', async () => {
    const t = convexTest(schema, modules);
    const now = Date.now();
    const job = await schedulePending(t, now + 30_000, now - 10_000);
    await seedPresence(t, warmPresence());
    await seedState(t, {
      runId: now - 10_000,
      jobId: job,
      minExpiresAt: null,
      syncedCharacterIds: [CHAR],
    });
    const before = await readState(t);

    await heartbeat(t, { characterIdsHint: [CHAR, 102], reason: 'interval' });

    expect(await readState(t)).toEqual(before);
    expect((await jobById(t, job))?.state.kind).toBe('pending');
    expect(await scheduledSyncUsers(t)).toHaveLength(1);
    const presence = await t.run((ctx) => ctx.db.query('syncPresence').unique());
    expect(presence?.lastSeenAt).toBe(now);
  });

  it('a warm interval beat re-arms a user whose run ended without scheduling another', async () => {
    for (const kind of ['canceled', 'success', 'failed', null] as const) {
      const t = convexTest(schema, modules);
      const now = Date.now();
      const dead = kind === null ? null : await terminalJob(t, kind);
      await seedPresence(t, warmPresence());
      await seedState(t, {
        runId: now - 10_000,
        jobId: dead,
        minExpiresAt: null,
        syncedCharacterIds: [CHAR],
      });

      await heartbeat(t, { characterIdsHint: [CHAR], reason: 'interval' });

      const pending = await pendingSyncUsers(t);
      expect(pending).toHaveLength(1);
      expect(pending[0]?.scheduledTime).toBe(now);
      const state = await readState(t);
      expect(state?.jobId).toBe(pending[0]?._id);
      expect(state?.runId).toBe(now);
    }
  });

  it('a first interval beat with no presence yet writes presence and arms a run', async () => {
    const t = convexTest(schema, modules);
    await heartbeat(t, { characterIdsHint: [CHAR], reason: 'interval' });
    const { presence, state } = await t.run(async (ctx) => ({
      presence: await ctx.db.query('syncPresence').collect(),
      state: await ctx.db.query('locationSync').unique(),
    }));
    expect(presence).toHaveLength(1);
    const pending = await pendingSyncUsers(t);
    expect(pending).toHaveLength(1);
    expect(state?.jobId).toBe(pending[0]?._id);
  });

  it('an interval beat after a cold gap behaves like a mount and replaces a pending run', async () => {
    const t = convexTest(schema, modules);
    const now = Date.now();
    const job = await schedulePending(t, now + 30_000, now - 10_000);
    await seedPresence(t, coldPresence());
    await seedState(t, {
      runId: now - 10_000,
      jobId: job,
      minExpiresAt: null,
      syncedCharacterIds: [CHAR],
    });

    await heartbeat(t, { characterIdsHint: [CHAR], reason: 'interval', visible: false });

    expect((await jobById(t, job))?.state.kind).toBe('canceled');
    const pending = await pendingSyncUsers(t);
    expect(pending).toHaveLength(1);
    expect(pending[0]?.scheduledTime).toBe(now);
    expect((await readState(t))?.jobId).toBe(pending[0]?._id);
  });

  it('an interval beat inside the presence-refresh window skips every write', async () => {
    const t = convexTest(schema, modules);
    await heartbeat(t, { characterIdsHint: [], reason: 'mount' });
    const mounted = await t.run((ctx) => ctx.db.query('syncPresence').unique());
    // A stale target would schedule a run if the beat got that far.
    await t.run(async (ctx) => {
      const state = await ctx.db.query('locationSync').unique();
      await ctx.db.patch(state!._id, { syncedCharacterIds: [CHAR] });
    });
    const before = await readState(t);

    vi.setSystemTime(Date.now() + 44_000);
    await heartbeat(t, { characterIdsHint: [CHAR], reason: 'interval' });

    expect(await t.run((ctx) => ctx.db.query('syncPresence').unique())).toEqual(mounted);
    expect(await readState(t)).toEqual(before);
    expect(await scheduledSyncUsers(t)).toHaveLength(0);
  });

  it('a tab hidden past the visible cap never revives a run, until it is visible again', async () => {
    const t = convexTest(schema, modules);
    const now = Date.now();
    await seedTracking(t);
    await seedState(t, { syncedCharacterIds: [CHAR] });
    await seedPresence(t, {
      lastSeenAt: now - 50_000,
      lastVisibleAt: now - HIDDEN_PRESENCE_MAX_MS - 1,
    });

    await heartbeat(t, { characterIdsHint: [CHAR], reason: 'interval', visible: false });
    expect(await scheduledSyncUsers(t)).toHaveLength(0);
    expect((await readState(t))?.jobId).toBeNull();

    await heartbeat(t, { characterIdsHint: [CHAR], reason: 'visible', visible: true });
    expect(await pendingSyncUsers(t)).toHaveLength(1);
  });

  it('stamps the beating tab, skips a fresh interval, and moves visibility only on a visible beat', async () => {
    const t = convexTest(schema, modules);
    await heartbeat(t, { characterIdsHint: [], reason: 'mount', visible: false, tabId: 'tab-one' });
    const mounted = await t.run((ctx) => ctx.db.query('syncPresence').unique());
    const visibleAt = mounted?.lastVisibleAt;
    expect(mounted?.tabId).toBe('tab-one');
    expect(typeof visibleAt).toBe('number');
    if (mounted === null || typeof visibleAt !== 'number') {
      throw new Error('mount did not stamp visibility');
    }

    vi.advanceTimersByTime(20_000);
    await heartbeat(t, { characterIdsHint: [], reason: 'interval', visible: false, tabId: 'tab-one' });
    const fresh = await t.run((ctx) => ctx.db.query('syncPresence').unique());
    expect(fresh).toEqual(mounted);

    await heartbeat(t, { characterIdsHint: [], reason: 'interval', visible: false, tabId: 'tab-two' });
    const otherTab = await t.run((ctx) => ctx.db.query('syncPresence').unique());
    expect(otherTab?.tabId).toBe('tab-two');
    expect(otherTab?.lastSeenAt).toBeGreaterThan(mounted.lastSeenAt);
    expect(otherTab?.lastVisibleAt).toBe(visibleAt);

    vi.advanceTimersByTime(60_000);
    await heartbeat(t, { characterIdsHint: [], reason: 'interval', visible: false, tabId: 'tab-two' });
    const hiddenRefresh = await t.run((ctx) => ctx.db.query('syncPresence').unique());
    expect(hiddenRefresh?.lastSeenAt).toBeGreaterThan(otherTab!.lastSeenAt);
    expect(hiddenRefresh?.lastVisibleAt).toBe(visibleAt);

    await heartbeat(t, { characterIdsHint: [], reason: 'interval', visible: true, tabId: 'tab-two' });
    const afterVisible = await t.run((ctx) => ctx.db.query('syncPresence').unique());
    expect(afterVisible?.lastVisibleAt).toBeGreaterThan(visibleAt);
  });
});

describe('engine.leave', () => {
  it('retires a matching tab: ages presence, cancels the pending run, and ignores a newer tab', async () => {
    const t = convexTest(schema, modules);
    const now = Date.now();
    const job = await schedulePending(t, now + 5_000, now - 10_000);
    await seedPresence(t, { tabId: 'tab-a' });
    await seedState(t, {
      runId: now - 10_000,
      jobId: job,
      minExpiresAt: now + 5_000,
      syncedCharacterIds: [CHAR],
      coveredCharacterIds: [CHAR],
    });
    await t.run(async (ctx) => {
      await ctx.db.insert('characterLocationCovered', { userId: USER, characterId: CHAR });
    });
    const before = await readState(t);

    const ignored = await t.mutation(internal.engineLeave.leave, {
      userId: USER,
      dataset: 'characterLocation',
      tabId: 'tab-b',
    });
    expect(ignored).toEqual({ retired: false });
    expect(await readState(t)).toEqual(before);
    expect((await jobById(t, job))?.state.kind).toBe('pending');
    expect(await t.run((ctx) => ctx.db.query('characterLocationCovered').collect())).toHaveLength(1);

    const retired = await t.mutation(internal.engineLeave.leave, {
      userId: USER,
      dataset: 'characterLocation',
      tabId: 'tab-a',
    });
    expect(retired).toEqual({ retired: true });
    const after = await t.run(async (ctx) => ({
      state: await ctx.db.query('locationSync').unique(),
      presence: await ctx.db.query('syncPresence').unique(),
      covered: await ctx.db.query('characterLocationCovered').collect(),
    }));
    expect((await jobById(t, job))?.state.kind).toBe('canceled');
    expect(after.state?.jobId).toBeNull();
    expect(after.state?.runId).toBeGreaterThan(before!.runId);
    expect(after.covered).toEqual([]);
    expect(after.presence?.leftTabId).toBe('tab-a');
    expect(isColdFromPresence(after.presence, LOCATION_COLD_AFTER_MS, Date.now())).toBe(true);
    expect(await pendingSyncUsers(t)).toHaveLength(0);
  });

  it('clears coverage for a user with no sync state yet', async () => {
    const t = convexTest(schema, modules);
    await seedPresence(t, { tabId: 'tab-a' });
    await t.run(async (ctx) => {
      await ctx.db.insert('characterLocationCovered', { userId: USER, characterId: CHAR });
    });

    expect(await t.mutation(internal.engineLeave.leave, {
      userId: USER,
      dataset: 'characterLocation',
      tabId: 'tab-a',
    })).toEqual({ retired: true });

    expect(await t.run((ctx) => ctx.db.query('characterLocationCovered').collect())).toEqual([]);
    expect(await readState(t)).toBeNull();
  });

  it('drops a late finish from the run the leave orphaned', async () => {
    const t = convexTest(schema, modules);
    await seedTracking(t);
    await heartbeat(t, { characterIdsHint: [CHAR], reason: 'mount', tabId: 'tab-a' });
    const orphan = await readState(t);

    await t.mutation(internal.engineLeave.leave, {
      userId: USER,
      dataset: 'characterLocation',
      tabId: 'tab-a',
    });
    const left = await readState(t);

    const now = Date.now();
    await finish(
      t,
      orphan!.runId,
      success([CHAR], [onlineResult(CHAR, now + 5_000)]),
      [{ characterId: CHAR, accessToken: 'tok', expiresAt: now + 1_200_000 }],
    );

    const after = await t.run(async (ctx) => ({
      locations: await ctx.db.query('characterLocation').collect(),
      leases: await ctx.db.query('characterLocationAccess').collect(),
      covered: await ctx.db.query('characterLocationCovered').collect(),
    }));
    expect(after).toEqual({ locations: [], leases: [], covered: [] });
    expect(await readState(t)).toEqual(left);
    expect(await pendingSyncUsers(t)).toHaveLength(0);
  });

  it('ignores a delayed beat from the tab that left and lets a new tab recover', async () => {
    const t = convexTest(schema, modules);
    const now = Date.now();
    await seedPresence(t, { tabId: 'tab-a' });
    await seedState(t, { minExpiresAt: null, syncedCharacterIds: [CHAR] });
    await t.mutation(internal.engineLeave.leave, {
      userId: USER,
      dataset: 'characterLocation',
      tabId: 'tab-a',
    });

    await heartbeat(t, { characterIdsHint: [CHAR], reason: 'interval', tabId: 'tab-a' });
    const fenced = await t.run(async (ctx) => ({
      state: await ctx.db.query('locationSync').unique(),
      presence: await ctx.db.query('syncPresence').unique(),
    }));
    expect(fenced.state?.jobId).toBeNull();
    expect(fenced.presence?.leftTabId).toBe('tab-a');
    expect(await scheduledSyncUsers(t)).toHaveLength(0);

    await heartbeat(t, {
      characterIdsHint: [CHAR],
      reason: 'interval',
      visible: false,
      tabId: 'tab-b',
    });
    const recovered = await t.run(async (ctx) => ({
      state: await ctx.db.query('locationSync').unique(),
      presence: await ctx.db.query('syncPresence').unique(),
    }));
    const pending = await pendingSyncUsers(t);
    expect(pending).toHaveLength(1);
    expect(pending[0]?.scheduledTime).toBe(now);
    expect(recovered.state?.jobId).toBe(pending[0]?._id);
    expect(recovered.presence?.tabId).toBe('tab-b');
    expect(recovered.presence?.leftTabId).toBe('');
  });

  it('recovers the remaining tab after an older tab beats last and then leaves', async () => {
    const t = convexTest(schema, modules);
    await heartbeat(t, { characterIdsHint: [CHAR], reason: 'mount', tabId: 'tab-a' });
    await heartbeat(t, { characterIdsHint: [CHAR], reason: 'mount', tabId: 'tab-b' });
    await heartbeat(t, { characterIdsHint: [CHAR], reason: 'interval', tabId: 'tab-a' });
    const lastBeater = await t.run((ctx) => ctx.db.query('syncPresence').unique());
    expect(lastBeater?.tabId).toBe('tab-a');

    expect(await t.mutation(internal.engineLeave.leave, {
      userId: USER,
      dataset: 'characterLocation',
      tabId: 'tab-a',
    })).toEqual({ retired: true });
    expect(await pendingSyncUsers(t)).toHaveLength(0);

    await heartbeat(t, { characterIdsHint: [CHAR], reason: 'interval', tabId: 'tab-b' });
    const recovered = await t.run(async (ctx) => ({
      state: await ctx.db.query('locationSync').unique(),
      presence: await ctx.db.query('syncPresence').unique(),
    }));
    const pending = await pendingSyncUsers(t);
    expect(pending).toHaveLength(1);
    expect(recovered.state?.jobId).toBe(pending[0]?._id);
    expect(recovered.presence?.tabId).toBe('tab-b');
    expect(recovered.presence?.leftTabId).toBe('');
  });
});

describe('engineComplete deploy shims', () => {
  it('hands off an unversioned action that owns an earlier scheduler deployment state', async () => {
    const t = convexTest(schema, modules);
    const now = Date.now();
    await seedPresence(t);
    const legacyJob = await t.run((ctx) => ctx.scheduler.runAt(now, internal.characterLocationSync.syncUser, {
      userId: USER, generation: now - 1,
    }));
    await seedState(t, { runId: now - 1, jobId: legacyJob, minExpiresAt: now + 20_000, syncedCharacterIds: [CHAR] });
    vi.advanceTimersByTime(0);
    await t.finishInProgressScheduledFunctions();
    const pending = await pendingSyncUsers(t);
    expect(pending).toHaveLength(1);
    expect(pending[0]?.args).toEqual([{ userId: USER, generation: now, schedulerVersion: 2 }]);
    expect(pending[0]?.scheduledTime).toBe(now + 20_000);
    expect((await readState(t))?.jobId).toBe(pending[0]?._id);
  });

  it('does not let matching or orphaned legacy completions replace a modern in-flight job', async () => {
    vi.stubEnv('SITE_URL', 'https://app.test');
    vi.stubEnv('CONVEX_SERVICE_SECRET', 'secret');
    let release: ((response: Response) => void) | undefined;
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>((resolve) => { release = resolve; })));
    const t = convexTest(schema, modules);
    await seedTracking(t);
    await heartbeat(t, { characterIdsHint: [CHAR], reason: 'mount' });
    vi.advanceTimersByTime(0);
    await vi.waitFor(() => expect(release).toBeDefined());
    const before = await readState(t);
    for (const workId of [String(before!.runId), String(before!.runId - 1)]) {
      await t.mutation(internal.engineComplete.onSyncComplete, {
        workId, context: { dataset: 'characterLocation', userId: USER }, result: { kind: 'success' },
      });
      expect(await readState(t)).toEqual(before);
    }
    release!(new Response(JSON.stringify({ characters: [] }), { status: 200 }));
    await t.finishInProgressScheduledFunctions();
  });

  const shims = {
    chainDispatch: (t: T) =>
      t.mutation(internal.engineComplete.chainDispatch, {
        dataset: 'characterLocation',
        userId: USER,
      }),
    onSyncComplete: (t: T) =>
      t.mutation(internal.engineComplete.onSyncComplete, {
        workId: 'w-previous-deploy',
        context: { dataset: 'characterLocation', userId: USER },
        result: { kind: 'failed', error: 'boom' },
      }),
  };

  for (const [name, call] of Object.entries(shims)) {
    describe(name, () => {
      it('hands a warm user with nothing scheduled to the scheduler', async () => {
        const t = convexTest(schema, modules);
        const now = Date.now();
        await seedPresence(t);

        await call(t);

        const pending = await pendingSyncUsers(t);
        expect(pending).toHaveLength(1);
        expect(pending[0]?.scheduledTime).toBe(now);
        const state = await readState(t);
        expect(state?.jobId).toBe(pending[0]?._id);
        expect(pending[0]?.args).toEqual([{ userId: USER, generation: state?.runId, schedulerVersion: 2 }]);
      });

      it('re-arms a warm user whose previous run already finished', async () => {
        const t = convexTest(schema, modules);
        const dead = await terminalJob(t, 'success');
        await seedPresence(t);
        await seedState(t, { jobId: dead, syncedCharacterIds: [CHAR] });

        await call(t);

        const pending = await pendingSyncUsers(t);
        expect(pending).toHaveLength(1);
        expect((await readState(t))?.jobId).toBe(pending[0]?._id);
      });

      it('does nothing for a cold or absent watcher', async () => {
        for (const presence of [null, coldPresence()]) {
          const t = convexTest(schema, modules);
          if (presence !== null) await seedPresence(t, presence);

          await call(t);

          expect(await readState(t)).toBeNull();
          expect(await scheduledSyncUsers(t)).toHaveLength(0);
        }
      });

      it('does nothing when a run is already scheduled', async () => {
        const t = convexTest(schema, modules);
        const now = Date.now();
        const job = await schedulePending(t, now + 30_000, now - 10_000);
        await seedPresence(t);
        await seedState(t, { runId: now - 10_000, jobId: job, syncedCharacterIds: [CHAR] });
        const before = await readState(t);

        await call(t);

        expect(await readState(t)).toEqual(before);
        expect(await scheduledSyncUsers(t)).toHaveLength(1);
      });
    });
  }
});

describe('characterLocationApply.finishSync scheduling', () => {
  async function seedRunning(t: T, overrides: Partial<Doc<'locationSync'>> = {}) {
    const runId = Date.now() - 10_000;
    await seedState(t, { runId, syncedCharacterIds: [CHAR], ...overrides });
    return runId;
  }

  it('drops a result whose generation no longer owns the state', async () => {
    const t = convexTest(schema, modules);
    const now = Date.now();
    await seedTracking(t);
    await seedPresence(t);
    const runId = await seedRunning(t, { minExpiresAt: now + 1_000 });
    await t.run(async (ctx) => {
      await ctx.db.insert('characterLocationAccess', {
        userId: USER,
        characterId: CHAR,
        accessToken: 'held',
        expiresAt: now + 600_000,
        updatedAt: now - 1_000,
      });
    });
    const before = await t.run(async (ctx) => ({
      state: await ctx.db.query('locationSync').unique(),
      leases: await ctx.db.query('characterLocationAccess').collect(),
    }));

    await finish(
      t,
      runId - 1,
      success([CHAR], [onlineResult(CHAR, now + 30_000)]),
      [{ characterId: CHAR, accessToken: 'vended', expiresAt: now + 1_200_000 }],
      [CHAR],
    );
    await finish(t, runId + 1, { kind: 'failed', error: 'boom' });

    const after = await t.run(async (ctx) => ({
      state: await ctx.db.query('locationSync').unique(),
      leases: await ctx.db.query('characterLocationAccess').collect(),
    }));
    expect(after).toEqual(before);
    expect(await t.run((ctx) => ctx.db.query('characterLocation').collect())).toEqual([]);
    expect(await t.run((ctx) => ctx.db.query('characterLocationCovered').collect())).toEqual([]);
    expect(await scheduledSyncUsers(t)).toHaveLength(0);
  });

  it('chains a yielding run exactly at the cache boundary, without jitter', async () => {
    const random = vi.spyOn(Math, 'random').mockReturnValue(0.9);
    for (const expiresIn of [30_000, 1_000]) {
      const t = convexTest(schema, modules);
      const now = Date.now();
      await seedPresence(t);
      const runId = await seedRunning(t, { lastRunAt: now - 60_000 });

      await finish(t, runId, success([CHAR], [onlineResult(CHAR, now + expiresIn)]));

      const pending = await pendingSyncUsers(t);
      expect(pending).toHaveLength(1);
      expect(pending[0]?.scheduledTime).toBe(now + Math.max(expiresIn, LOCATION_CADENCE_FLOOR_MS));
      const state = await readState(t);
      expect(state).toMatchObject({
        runId: now,
        jobId: pending[0]?._id,
        minExpiresAt: now + expiresIn,
        syncedCharacterIds: [CHAR],
        coveredCharacterIds: [CHAR],
        lastFinishedAt: now,
        lastRunAt: now,
      });
      expect(pending[0]?.args).toEqual([{ userId: USER, generation: now, schedulerVersion: 2 }]);
    }
    random.mockRestore();
  });

  it('never cancels the job it runs under when it schedules the next one', async () => {
    const t = convexTest(schema, modules);
    const now = Date.now();
    // Stand-in for the job this finish is running under.
    const current = await schedulePending(t, now, now - 10_000);
    await seedPresence(t);
    const runId = await seedRunning(t, { jobId: current });

    await finish(t, runId, success([CHAR], [onlineResult(CHAR, now + 30_000)]));

    expect((await jobById(t, current))?.state.kind).toBe('pending');
    expect((await readState(t))?.jobId).not.toBe(current);
    expect(await pendingSyncUsers(t)).toHaveLength(2);
  });

  it('re-arms a zero-yield run with jitter: all offline, nothing read, or a run-level error', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const now = Date.now();
    const cases = [
      { outcome: success([CHAR], [offlineResult(CHAR, now + 60_000)]), minExpiresAt: now + 60_000 },
      { outcome: success([CHAR], []), minExpiresAt: null },
      {
        outcome: success([CHAR], [onlineResult(CHAR, now + 30_000)], 'budget_exhausted:daily'),
        minExpiresAt: now + 30_000,
      },
    ];
    for (const { outcome, minExpiresAt } of cases) {
      const t = convexTest(schema, modules);
      await seedPresence(t);
      const runId = await seedRunning(t);

      await finish(t, runId, outcome);

      const boundary = minExpiresAt === null
        ? now + LOCATION_CADENCE_FLOOR_MS
        : Math.max(minExpiresAt, now + LOCATION_CADENCE_FLOOR_MS);
      const pending = await pendingSyncUsers(t);
      expect(pending).toHaveLength(1);
      expect(pending[0]?.scheduledTime).toBe(boundary + Math.floor(0.5 * SYNC_JITTER_MS));
      const state = await readState(t);
      expect(state?.jobId).toBe(pending[0]?._id);
      expect(state?.minExpiresAt).toBe(minExpiresAt);
      expect(state?.lastFinishedAt).toBe(now);
    }
  });

  it('retries a failed run at the cadence floor and forgets the cache window', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const t = convexTest(schema, modules);
    const now = Date.now();
    await seedPresence(t);
    const runId = await seedRunning(t, {
      minExpiresAt: now + 50_000,
      coveredCharacterIds: [CHAR],
      lastFinishedAt: now - 5_000,
      lastRunAt: now - 60_000,
    });

    await finish(t, runId, { kind: 'failed', error: 'boom' });

    const pending = await pendingSyncUsers(t);
    expect(pending).toHaveLength(1);
    expect(pending[0]?.scheduledTime).toBe(now + LOCATION_CADENCE_FLOOR_MS);
    expect(await readState(t)).toMatchObject({
      runId: now,
      jobId: pending[0]?._id,
      minExpiresAt: null,
      syncedCharacterIds: [CHAR],
      coveredCharacterIds: [CHAR],
      lastFinishedAt: now - 5_000,
      lastRunAt: now,
    });
    expect(error.mock.calls[0]?.[0]).toContain('"outcome":"failed"');
  });

  it('stops when the watcher has gone cold: no next run, jobId null, coverage cleared', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const now = Date.now();
    for (const presence of [coldPresence(), null]) {
      for (const outcome of [
        success([CHAR], [onlineResult(CHAR, now + 30_000)]),
        { kind: 'failed' as const, error: 'boom' },
      ]) {
        const t = convexTest(schema, modules);
        if (presence !== null) await seedPresence(t, presence);
        const runId = await seedRunning(t, { coveredCharacterIds: [CHAR] });
        await t.run(async (ctx) => {
          await ctx.db.insert('characterLocationCovered', { userId: USER, characterId: CHAR });
        });

        await finish(t, runId, outcome);

        expect(await scheduledSyncUsers(t)).toHaveLength(0);
        const state = await readState(t);
        expect(state?.jobId).toBeNull();
        expect(state?.runId).toBe(runId);
        expect(await t.run((ctx) => ctx.db.query('characterLocationCovered').collect())).toEqual([]);
        if (outcome.kind === 'success') expect(state?.lastFinishedAt).toBe(now);
      }
    }
  });

  it('stops a successful run with nothing tracked', async () => {
    const t = convexTest(schema, modules);
    const now = Date.now();
    await seedPresence(t);
    const runId = await seedRunning(t);

    await finish(t, runId, success([], []));

    expect(await scheduledSyncUsers(t)).toHaveLength(0);
    expect(await readState(t)).toMatchObject({
      runId,
      jobId: null,
      syncedCharacterIds: [],
      coveredCharacterIds: [],
      lastFinishedAt: now,
    });
  });

  it('carries a heartbeat-scheduled run through syncUser into the next run', async () => {
    vi.stubEnv('SITE_URL', undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const t = convexTest(schema, modules);
    await seedTracking(t);
    await heartbeat(t, { characterIdsHint: [CHAR], reason: 'mount' });
    const first = await readState(t);

    // Fire only the due run; the retry it schedules stays pending.
    vi.advanceTimersByTime(0);
    await t.finishInProgressScheduledFunctions();

    const jobs = await scheduledSyncUsers(t);
    expect(jobs.map((job) => job.state.kind)).toEqual(['success', 'pending']);
    const next = await readState(t);
    expect(next?.jobId).toBe(jobs[1]?._id);
    expect(next?.runId).toBeGreaterThan(first!.runId);
    expect(jobs[1]?.args).toEqual([{ userId: USER, generation: next?.runId, schedulerVersion: 2 }]);
    expect(jobs[1]?.scheduledTime).toBe(Date.now() + LOCATION_CADENCE_FLOOR_MS);
  });
});

describe('engine.sweep (daily retention)', () => {
  it('deletes only presence and sync state past retention, never scheduling overdue work', async () => {
    const t = convexTest(schema, modules);
    const now = Date.now();
    await t.run(async (ctx) => {
      await ctx.db.insert('locationSync', stateRow({
        userId: 'u-overdue', minExpiresAt: now - 1000, syncedCharacterIds: [CHAR],
      }));
      await ctx.db.insert('syncPresence', { dataset: 'characterLocation', userId: 'u-overdue', lastSeenAt: now - 1000 });
      await ctx.db.insert('locationSync', stateRow({ userId: 'u-cold' }));
      await ctx.db.insert('syncPresence', {
        dataset: 'characterLocation',
        userId: 'u-cold',
        lastSeenAt: now - LOCATION_COLD_AFTER_MS - 5000,
      });
      await ctx.db.insert('locationSync', stateRow({ userId: 'u-abandoned' }));
      await ctx.db.insert('syncPresence', {
        dataset: 'characterLocation',
        userId: 'u-abandoned',
        lastSeenAt: now - RETENTION_MS - 5000,
      });
    });

    const counts = await t.mutation(internal.engineSweep.sweep, {});
    expect(counts).toEqual({ deleted: 1, capped: false });

    const { state, presence } = await t.run(async (ctx) => ({
      state: (await ctx.db.query('locationSync').collect()).map((row) => row.userId).sort(),
      presence: (await ctx.db.query('syncPresence').collect()).map((row) => row.userId).sort(),
    }));
    expect(state).toEqual(['u-cold', 'u-overdue']);
    expect(presence).toEqual(['u-cold', 'u-overdue']);
    expect(await scheduledSyncUsers(t)).toHaveLength(0);
  });

  it('drains retired-dataset leftovers and the characterOnline table', async () => {
    const t = convexTest(schema, modules);
    const now = Date.now();
    await t.run(async (ctx) => {
      await ctx.db.insert('syncSubjects', legacySubjectRow({ dataset: 'onlineStatus', userId: 'u-old' }));
      await ctx.db.insert('syncPresence', { dataset: 'onlineStatus', userId: 'u-old', lastSeenAt: now });
      await ctx.db.insert('characterOnline', {
        userId: 'u-old', characterId: CHAR, online: true, etag: 'e1',
      });
      await ctx.db.insert('locationSync', stateRow({ userId: 'u-live' }));
      await ctx.db.insert('syncPresence', { dataset: 'characterLocation', userId: 'u-live', lastSeenAt: now });
    });

    await t.mutation(internal.engineSweep.sweep, {});

    const { subjects, presence, online, state } = await t.run(async (ctx) => ({
      subjects: await ctx.db.query('syncSubjects').collect(),
      presence: await ctx.db.query('syncPresence').collect(),
      online: await ctx.db.query('characterOnline').collect(),
      state: await ctx.db.query('locationSync').collect(),
    }));
    expect(subjects).toEqual([]);
    expect(presence.map((row) => row.dataset)).toEqual(['characterLocation']);
    expect(online).toEqual([]);
    expect(state.map((row) => row.userId)).toEqual(['u-live']);
  });

  it('drains every syncSubjects row, live dataset included, continuing past a full batch', async () => {
    const t = convexTest(schema, modules);
    const now = Date.now();
    const total = 129;
    await t.run(async (ctx) => {
      for (let i = 0; i < total; i++) {
        await ctx.db.insert('syncSubjects', legacySubjectRow({
          userId: `u${i}`, nextDueAt: now - 1000, syncedCharacterIds: [CHAR],
        }));
      }
      await ctx.db.insert('syncPresence', { dataset: 'characterLocation', userId: 'u0', lastSeenAt: now });
      await ctx.db.insert('locationSync', stateRow({ userId: 'u0' }));
    });

    const first = await t.mutation(internal.engineSweep.sweep, {});
    expect(first).toEqual({ deleted: 128, capped: true });
    expect(await scheduledFunctionsNamed(t, 'engineSweep')).toHaveLength(1);

    await t.finishAllScheduledFunctions(vi.runAllTimers);
    const after = await t.run(async (ctx) => ({
      subjects: await ctx.db.query('syncSubjects').collect(),
      presence: await ctx.db.query('syncPresence').collect(),
      state: await ctx.db.query('locationSync').collect(),
    }));
    expect(after.subjects).toEqual([]);
    expect(after.presence).toHaveLength(1);
    expect(after.state).toHaveLength(1);
    expect(await pendingSyncUsers(t)).toHaveLength(0);
    expect(after.state[0]?.jobId).toBeNull();
  });

  it('schedules an immediate continuation when a batch fills', async () => {
    const t = convexTest(schema, modules);
    const now = Date.now();
    const total = 129;
    await t.run(async (ctx) => {
      for (let i = 0; i < total; i++) {
        await ctx.db.insert('syncPresence', {
          dataset: 'characterLocation',
          userId: `u${i}`,
          lastSeenAt: now - RETENTION_MS - 5000 - i,
        });
      }
    });

    const first = await t.mutation(internal.engineSweep.sweep, {});
    expect(first.capped).toBe(true);
    expect(await scheduledFunctionsNamed(t, 'engineSweep')).toHaveLength(1);

    await t.finishAllScheduledFunctions(vi.runAllTimers);
    const remaining = await t.run((ctx) => ctx.db.query('syncPresence').collect());
    expect(remaining).toHaveLength(0);
  });
});


describe('scheduler migration and independent liveness', () => {
  it.each([
    { cacheWindow: 10_000, dueIn: 10_000 },
    { cacheWindow: 1_000, dueIn: 4_000 },
  ])('retention schedules an offline legacy watcher without a heartbeat, due in $dueIn ms', async ({ cacheWindow, dueIn }) => {
    const t = convexTest(schema, modules);
    const now = Date.now();
    await seedPresence(t);
    await t.run(async (ctx) => {
      await ctx.db.insert('syncSubjects', legacySubjectRow({
        minExpiresAt: now + cacheWindow,
        syncedCharacterIds: [CHAR], coveredCharacterIds: [], lastFinishedAt: now - 1_000,
      }));
      await ctx.db.insert('characterLocationOnline', {
        userId: USER, characterId: CHAR, online: false,
        etagOnline: 'offline', onlineExpiresAt: now + cacheWindow,
      });
    });

    await t.mutation(internal.engineSweep.sweep, {});

    const state = await readState(t);
    expect(state).toMatchObject({
      minExpiresAt: now + cacheWindow,
      syncedCharacterIds: [CHAR], coveredCharacterIds: [],
      lastFinishedAt: now - 1_000, lastRunAt: now - 1_000,
    });
    const pending = await pendingSyncUsers(t);
    expect(pending).toHaveLength(1);
    expect(pending[0]).toMatchObject({
      _id: state!.jobId,
      scheduledTime: now + dueIn,
      args: [{ userId: USER, generation: state!.runId, schedulerVersion: 2 }],
    });
    expect(await t.run((ctx) => ctx.db.query('syncSubjects').collect())).toEqual([]);
  });

  it('retention preserves a modern pending run while draining its legacy row', async () => {
    const t = convexTest(schema, modules);
    const now = Date.now();
    const jobId = await schedulePending(t, now + 30_000, now - 10_000);
    await seedPresence(t);
    await seedState(t, {
      runId: now - 10_000, jobId, minExpiresAt: now + 30_000,
      syncedCharacterIds: [CHAR], coveredCharacterIds: [CHAR], lastFinishedAt: now - 2_000,
    });
    await t.run((ctx) => ctx.db.insert('syncSubjects', legacySubjectRow({
      minExpiresAt: now + 1_000, syncedCharacterIds: [CHAR], coveredCharacterIds: [],
      lastFinishedAt: now - 1_000,
    })));
    const before = await readState(t);

    await t.mutation(internal.engineSweep.sweep, {});

    expect(await readState(t)).toEqual(before);
    expect((await pendingSyncUsers(t)).map((job) => job._id)).toEqual([jobId]);
    expect(await t.run((ctx) => ctx.db.query('syncSubjects').collect())).toEqual([]);
  });

  it('retention preserves a modern in-flight run while draining its legacy row', async () => {
    vi.stubEnv('SITE_URL', 'https://app.test');
    vi.stubEnv('CONVEX_SERVICE_SECRET', 'secret');
    let release: ((response: Response) => void) | undefined;
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>((resolve) => { release = resolve; })));
    const t = convexTest(schema, modules);
    await seedTracking(t);
    await heartbeat(t, { characterIdsHint: [CHAR], reason: 'mount' });
    vi.advanceTimersByTime(0);
    await vi.waitFor(() => expect(release).toBeDefined());
    await t.run((ctx) => ctx.db.insert('syncSubjects', legacySubjectRow({
      minExpiresAt: Date.now() + 1_000, syncedCharacterIds: [CHAR], coveredCharacterIds: [],
    })));
    const before = await readState(t);

    await t.mutation(internal.engineSweep.sweep, {});

    expect(await readState(t)).toEqual(before);
    expect((await jobById(t, before!.jobId!))?.state.kind).toBe('inProgress');
    expect(await pendingSyncUsers(t)).toHaveLength(0);
    expect(await t.run((ctx) => ctx.db.query('syncSubjects').collect())).toEqual([]);
    release!(new Response(JSON.stringify({ characters: [] }), { status: 200 }));
    await t.finishInProgressScheduledFunctions();
  });

  it('preserves recent jump continuity when retention runs before the first heartbeat', async () => {
    const t = convexTest(schema, modules);
    const now = Date.now();
    await seedPresence(t);
    await t.run(async (ctx) => {
      await ctx.db.insert('syncSubjects', legacySubjectRow({
        minExpiresAt: now + 10_000,
        syncedCharacterIds: [CHAR], coveredCharacterIds: [CHAR], lastFinishedAt: now - 1_000,
      }));
    });
    await t.mutation(internal.engineSweep.sweep, {});
    await t.mutation(internal.engineComplete.chainDispatch, { dataset: 'characterLocation', userId: USER });
    expect(await readState(t)).toMatchObject({
      minExpiresAt: now + 10_000,
      syncedCharacterIds: [CHAR], coveredCharacterIds: [CHAR],
      lastFinishedAt: now - 1_000, lastRunAt: now - 1_000,
    });
    expect((await pendingSyncUsers(t))[0]?.scheduledTime).toBe(now + 10_000);
    expect(await t.run((ctx) => ctx.db.query('syncSubjects').collect())).toEqual([]);
  });

  it('expires coverage after a dead action and a vanished browser without another heartbeat', async () => {
    const t = convexTest(schema, modules);
    const failed = await terminalJob(t, 'failed');
    await seedState(t, { jobId: failed, syncedCharacterIds: [CHAR], coveredCharacterIds: [CHAR] });
    await t.run(async (ctx) => {
      await ctx.db.insert('characterLocationCovered', { userId: USER, characterId: CHAR });
    });
    // A warm heartbeat arms liveness; then the newly scheduled action is cancelled
    // to model no further completion mutation reaching the server.
    await heartbeat(t, { characterIdsHint: [CHAR], reason: 'mount' });
    const state = await readState(t);
    await t.run((ctx) => ctx.scheduler.cancel(state!.jobId!));
    await vi.advanceTimersByTimeAsync(LOCATION_COLD_AFTER_MS + 1);
    await t.finishInProgressScheduledFunctions();
    expect(await t.run((ctx) => ctx.db.query('characterLocationCovered').collect())).toEqual([]);
    expect((await readState(t))?.jobId).toBeNull();
    const checks = await scheduledFunctionsNamed(t, 'expirePresence');
    expect(checks).toHaveLength(1);
    expect(checks[0]?.state.kind).toBe('success');
  });

  it('re-arms liveness when the recorded check is no longer live', async () => {
    for (const end of ['canceled', 'success'] as const) {
      const t = convexTest(schema, modules);
      await seedPresence(t, warmPresence());
      const dead = await t.run(async (ctx) => {
        const presence = await ctx.db.query('syncPresence').unique();
        const id = await ctx.scheduler.runAt(Date.now() + 60_000, internal.engine.expirePresence, {
          presenceId: presence!._id,
        });
        if (end === 'canceled') await ctx.scheduler.cancel(id);
        await ctx.db.patch(presence!._id, { expiryJobId: id });
        return id;
      });
      if (end === 'success') {
        await vi.advanceTimersByTimeAsync(60_001);
        await t.finishInProgressScheduledFunctions();
        // The run itself re-arms while warm; drop that so only the stale id remains.
        await t.run(async (ctx) => {
          const presence = await ctx.db.query('syncPresence').unique();
          const live = presence!.expiryJobId!;
          if (live !== dead) await ctx.scheduler.cancel(live);
          await ctx.db.patch(presence!._id, { expiryJobId: dead });
        });
      }

      await heartbeat(t, { characterIdsHint: [], reason: 'mount' });

      const presence = await t.run((ctx) => ctx.db.query('syncPresence').unique());
      expect(presence?.expiryJobId).not.toBe(dead);
      expect((await jobById(t, presence!.expiryJobId!))?.state.kind).toBe('pending');
    }
  });

  it('extends one liveness check for fresh presence and stops after that presence expires', async () => {
    const t = convexTest(schema, modules);
    await heartbeat(t, { characterIdsHint: [], reason: 'mount' });
    await vi.advanceTimersByTimeAsync(240_000);
    await heartbeat(t, { characterIdsHint: [], reason: 'interval' });
    expect(await scheduledFunctionsNamed(t, 'expirePresence')).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(60_001);
    await t.finishInProgressScheduledFunctions();
    const checks = await scheduledFunctionsNamed(t, 'expirePresence');
    expect(checks.map((job) => job.state.kind)).toEqual(['success', 'pending']);
    await vi.advanceTimersByTimeAsync(240_000);
    await t.finishInProgressScheduledFunctions();
    expect((await scheduledFunctionsNamed(t, 'expirePresence')).map((job) => job.state.kind)).toEqual(['success', 'success']);
  });
});
