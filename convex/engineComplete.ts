import { v } from 'convex/values';
import { LOCATION_COLD_AFTER_MS, LOCATION_CADENCE_FLOOR_MS, isColdFromPresence } from '@/lib/sync-engine';
import { internalMutation, type MutationCtx } from './_generated/server';
import { ensureLocationSync, runState, scheduleRun } from './lib/locationSchedule';
import { ensurePresenceExpiry } from './engine';
import { getPresence } from './lib/subjects';

/**
 * Deploy-transition stand-ins for the retired scan engine. A chain hop or an
 * in-flight run scheduled by the previous deployment still calls these names
 * once; each hands the user to the location scheduler if nothing is scheduled
 * for them. Delete once no pre-scheduler job can remain.
 */
async function handOff(ctx: MutationCtx, userId: string, completedGeneration?: string): Promise<void> {
  const now = Date.now();
  const presence = await getPresence(ctx.db, 'characterLocation', userId);
  if (isColdFromPresence(presence, LOCATION_COLD_AFTER_MS, now)) return;
  await ensurePresenceExpiry(ctx, userId);
  const state = await ensureLocationSync(ctx, userId);
  const running = await runState(ctx.db, state);
  if (running !== 'none') {
    // An unversioned action from an earlier PR deployment may still own this
    // state. Only that exact in-flight legacy generation may hand itself off;
    // old completions cannot replace a modern job or a pending successor.
    if (running !== 'inProgress' || completedGeneration !== String(state.runId) || state.jobId === null) return;
    const job = await ctx.db.system.get('_scheduled_functions', state.jobId);
    const args = job?.args[0];
    if (args === null || typeof args !== 'object' || Array.isArray(args)
      || !('userId' in args) || args.userId !== userId
      || !('generation' in args) || args.generation !== state.runId
      || 'schedulerVersion' in args) return;
  }
  const at = Math.max(now, state.minExpiresAt ?? 0, (state.lastRunAt ?? 0) + LOCATION_CADENCE_FLOOR_MS);
  await ctx.db.patch('locationSync', state._id, await scheduleRun(ctx, state, at, now));
}

export const chainDispatch = internalMutation({
  args: { dataset: v.literal('characterLocation'), userId: v.string() },
  returns: v.null(),
  handler: async (ctx, { userId }) => handOff(ctx, userId),
});

export const onSyncComplete = internalMutation({
  args: {
    workId: v.string(),
    context: v.object({ dataset: v.literal('characterLocation'), userId: v.string() }),
    result: v.union(
      v.object({ kind: v.literal('success') }),
      v.object({ kind: v.literal('failed'), error: v.string() }),
    ),
  },
  returns: v.null(),
  handler: async (ctx, { context, workId }) => handOff(ctx, context.userId, workId),
});
