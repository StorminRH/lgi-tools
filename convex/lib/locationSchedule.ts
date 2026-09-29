import { internal } from '../_generated/api';
import type { Doc } from '../_generated/dataModel';
import type { DatabaseReader, MutationCtx } from '../_generated/server';
import { clearCoverageForUser } from './locationCoverage';

/**
 * Each watching user has exactly one location run scheduled or in flight.
 * The run's scheduled-function id lives on locationSync.jobId and Convex's
 * own _scheduled_functions row says whether it is still pending, running, or
 * finished — there is no separate status flag or staleness timeout.
 */
export type LocationSyncState = Doc<'locationSync'>;

export type RunState = 'pending' | 'inProgress' | 'none';

export function getLocationSync(
  db: DatabaseReader,
  userId: string,
): Promise<LocationSyncState | null> {
  return db
    .query('locationSync')
    .withIndex('by_user', (q) => q.eq('userId', userId))
    .unique();
}

export async function ensureLocationSync(
  ctx: MutationCtx,
  userId: string,
): Promise<LocationSyncState> {
  const existing = await getLocationSync(ctx.db, userId);
  if (existing !== null) return existing;
  const id = await ctx.db.insert('locationSync', {
    userId,
    runId: 0,
    jobId: null,
    minExpiresAt: null,
    syncedCharacterIds: [],
    coveredCharacterIds: [],
    lastFinishedAt: null,
  });
  const created = await ctx.db.get('locationSync', id);
  if (created === null) throw new Error('locationSync row vanished inside its own transaction');
  return created;
}

export async function runState(
  db: DatabaseReader,
  state: LocationSyncState,
): Promise<RunState> {
  if (state.jobId === null) return 'none';
  const job = await db.system.get('_scheduled_functions', state.jobId);
  if (job === null) return 'none';
  const kind = job.state.kind;
  return kind === 'pending' || kind === 'inProgress' ? kind : 'none';
}

function nextRunId(state: LocationSyncState, now: number): number {
  return Math.max(now, state.runId + 1);
}

// Cancelling a finished job throws in production, so only a pending job is cancelled.
async function cancelPending(ctx: MutationCtx, state: LocationSyncState): Promise<void> {
  if (await runState(ctx.db, state) === 'pending' && state.jobId !== null) {
    await ctx.scheduler.cancel(state.jobId);
  }
}

/**
 * Schedules the user's one run at `at` under a fresh generation and returns
 * the fields to write. The caller must not hold an in-flight run it wants to
 * keep: a pending run is cancelled, and an in-flight one is orphaned because
 * its generation no longer matches.
 */
export async function scheduleRun(
  ctx: MutationCtx,
  state: LocationSyncState,
  at: number,
  now: number,
  options: { replacePending: boolean } = { replacePending: true },
): Promise<Pick<LocationSyncState, 'runId' | 'jobId'>> {
  if (options.replacePending) await cancelPending(ctx, state);
  const runId = nextRunId(state, now);
  const jobId = await ctx.scheduler.runAt(at, internal.characterLocationSync.syncUser, {
    userId: state.userId,
    generation: runId,
  });
  return { runId, jobId };
}

/** Stops the user's sync: no run stays scheduled and any in-flight result is dropped. */
export async function stopSync(
  ctx: MutationCtx,
  state: LocationSyncState,
  now: number,
): Promise<void> {
  await cancelPending(ctx, state);
  await ctx.db.patch('locationSync', state._id, { runId: nextRunId(state, now), jobId: null });
  await clearCoverageForUser(ctx, state.userId);
}
